/**
 * Sons importés de Diablo II (tools/d2audio, usage privé) : index + paquets MP3 servis sous `d2/audio/`
 * (en clair en local, chiffrés avec le chargeur optionnel `D2_REMOTE`). Sans import, ou si un paquet est illisible, le moteur audio garde
 * ses sons d'origine (échantillons CC0 et synthèse). Les sons sont décodés à la première utilisation.
 */
export interface SoundEntry {
  p: string;
  o: number;
  l: number;
  v: number;
  loop: number;
}

/** Lecture d'un fichier importé (déjà déchiffré) ; null s'il n'existe pas ou n'est pas accessible */
export type D2Reader = (path: string) => Promise<Uint8Array | null>;

/** Lecture d'une plage d'un fichier (un son d'un paquet) : mode local, où chaque son est décodé séparément des archives du joueur */
export type D2RangeReader = (path: string, range: [number, number]) => Promise<Uint8Array | null>;

export class D2Sounds {
  private index: Record<string, SoundEntry> | null = null;
  private music: Record<string, { file: string; l: number }> = {};
  /** Phrases des PNJ (voices.py) : fichiers MP3 par PNJ */
  private voices: Record<string, string[]> = {};
  private voiceBuffers = new Map<string, AudioBuffer | null>();
  /** Dialogue des PNJ : phrases de bavardage (numéro, fichier voix) et textes d'origine (voices.py, export-npc-text.ts) */
  private gossipIndex: Record<string, { n: number; f: string }[]> = {};
  private gossipText: Record<string, Record<string, string>> = {};
  private groups = new Map<string, string[]>();
  private packs = new Map<string, Promise<Uint8Array | null>>();
  private buffers = new Map<string, AudioBuffer | null>();
  private pending = new Set<string>();

  constructor(
    private readonly read: D2Reader,
    private readonly ctx: () => AudioContext | null,
    private readonly readRange?: D2RangeReader,
  ) {}

  /** Charge l'index ; faux si l'import audio est absent */
  async init(): Promise<boolean> {
    try {
      const raw = await this.read('audio/index.json');
      if (!raw) return false;
      const json = JSON.parse(new TextDecoder().decode(raw)) as {
        sounds: Record<string, SoundEntry>;
        music?: Record<string, { file: string; l: number }>;
        voices?: Record<string, string[]>;
        gossip?: Record<string, { n: number; f: string }[]>;
      };
      this.index = json.sounds;
      this.music = json.music ?? {};
      this.voices = json.voices ?? {};
      this.gossipIndex = json.gossip ?? {};
      await this.loadText();
      for (const h of Object.keys(this.index)) {
        const base = h.replace(/^ESOUND_/, '').replace(/_\d+$/, '');
        const g = this.groups.get(base);
        if (g) g.push(h);
        else this.groups.set(base, [h]);
      }
      return true;
    } catch {
      this.index = null;
      return false;
    }
  }

  /** Textes des PNJ (audio/npc-text.json) : en mode local ils sont générés après l'index, d'où une relecture possible */
  async loadText(): Promise<boolean> {
    try {
      const t = await this.read('audio/npc-text.json');
      if (!t) return false;
      this.gossipText = JSON.parse(new TextDecoder().decode(t));
      return true;
    } catch {
      /* sans textes : pas de dialogue */
      return false;
    }
  }

  hasMusic(key: string): boolean {
    return key in this.music;
  }

  /** Octets d'un morceau (MP3) ; null s'il n'existe pas */
  readMusic(key: string): Promise<Uint8Array | null> {
    const m = this.music[key];
    return m ? this.read(`audio/${m.file}`).catch(() => null) : Promise.resolve(null);
  }

  /** Une phrase du PNJ (au hasard, jamais deux fois de suite la même) décodée ; null si le PNJ n'en a pas ou si la lecture échoue */
  private lastVoice = new Map<string, number>();
  async voice(npc: string): Promise<AudioBuffer | null> {
    const list = this.voices[npc];
    const c = this.ctx();
    if (!list?.length || !c) return null;
    let k = Math.floor(Math.random() * list.length);
    if (list.length > 1 && k === this.lastVoice.get(npc)) k = (k + 1) % list.length;
    this.lastVoice.set(npc, k);
    const file = list[k];
    const have = this.voiceBuffers.get(file);
    if (have !== undefined) return have;
    try {
      const bytes = await this.read(`audio/${file}`);
      if (!bytes) throw new Error('absent');
      const buf = await c.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
      this.voiceBuffers.set(file, buf);
      return buf;
    } catch {
      this.voiceBuffers.set(file, null);
      return null;
    }
  }

  /** Lignes de dialogue d'un PNJ : texte d'origine, avec la voix quand elle existe */
  gossipLines(npc: string): { n: number; text: string; file?: string }[] {
    const texts = this.gossipText[npc] ?? {};
    const voice = new Map((this.gossipIndex[npc] ?? []).map((v) => [v.n, v.f]));
    return Object.entries(texts)
      .map(([n, text]) => ({ n: Number(n), text, file: voice.get(Number(n)) }))
      .sort((a, b) => a.n - b.n);
  }

  /** Voix d'une ligne de dialogue décodée ; null si absente */
  async gossipVoice(file: string): Promise<AudioBuffer | null> {
    const c = this.ctx();
    if (!c) return null;
    const have = this.voiceBuffers.get(file);
    if (have !== undefined) return have;
    try {
      const bytes = await this.read(`audio/${file}`);
      if (!bytes) throw new Error('absent');
      const buf = await c.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
      this.voiceBuffers.set(file, buf);
      return buf;
    } catch {
      this.voiceBuffers.set(file, null);
      return null;
    }
  }

  get ready(): boolean {
    return this.index !== null;
  }

  /** Le groupe (« FALLEN_HIT » = FALLEN_HIT_1…n, ou un son seul) existe-t-il ? */
  has(group: string): boolean {
    return this.groups.has(group);
  }

  handles(group: string): string[] {
    return this.groups.get(group) ?? [];
  }

  entry(handle: string): SoundEntry | undefined {
    return this.index?.[handle];
  }

  private pack(name: string): Promise<Uint8Array | null> {
    let p = this.packs.get(name);
    if (!p) {
      p = this.read(`audio/pack-${name}.bin`).catch(() => null);
      this.packs.set(name, p);
    }
    return p;
  }

  /** Décode un son (en tâche de fond) ; renvoie le tampon s'il est déjà prêt */
  buffer(handle: string): AudioBuffer | null {
    const have = this.buffers.get(handle);
    if (have !== undefined) return have;
    if (!this.pending.has(handle)) void this.decode(handle);
    return null;
  }

  private async decode(handle: string): Promise<void> {
    const e = this.index?.[handle];
    const c = this.ctx();
    if (!e || !c) return;
    this.pending.add(handle);
    try {
      let slice: Uint8Array;
      if (this.readRange) {
        // mode local : seul ce son est décodé depuis les archives (pas le paquet entier)
        const r = await this.readRange(`audio/pack-${e.p}.bin`, [e.o, e.l]);
        if (!r || !r.length) throw new Error('son absent');
        slice = r;
      } else {
        const bytes = await this.pack(e.p);
        if (!bytes) throw new Error('paquet absent');
        slice = bytes.slice(e.o, e.o + e.l);
      }
      this.buffers.set(handle, await c.decodeAudioData(slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) as ArrayBuffer));
    } catch {
      this.buffers.set(handle, null);
    } finally {
      this.pending.delete(handle);
    }
  }

  /** Plages (paquet, décalage, longueur) des sons de ces groupes : de quoi les faire décoder d'avance par les archives (mode local, sans contexte audio) */
  rangesOf(groups: Iterable<string>): { path: string; range: [number, number] }[] {
    const out = new Map<string, { path: string; range: [number, number] }>();
    for (const g of groups) {
      for (const h of this.handles(g)) {
        const e = this.index?.[h];
        if (e) out.set(h, { path: `audio/pack-${e.p}.bin`, range: [e.o, e.l] });
      }
    }
    return [...out.values()];
  }

  /** Chemin du fichier d'un morceau (mode local : décodé et mis en cache par le Worker) ; null s'il n'existe pas */
  musicPath(key: string): string | null {
    const m = this.music[key];
    return m ? `audio/${m.file}` : null;
  }

  /** Décode d'avance tous les sons d'un groupe (avant qu'on en ait besoin) */
  warm(group: string): void {
    for (const h of this.handles(group)) this.buffer(h);
  }

  /** Un tampon prêt du groupe, au hasard ; null si aucun n'est encore décodé */
  pick(group: string): { buffer: AudioBuffer; volume: number; loop: boolean } | null {
    const list = this.handles(group);
    if (!list.length) return null;
    const start = Math.floor(Math.random() * list.length);
    for (let k = 0; k < list.length; k++) {
      const h = list[(start + k) % list.length];
      const b = this.buffer(h);
      if (b) return { buffer: b, volume: this.index![h].v, loop: this.index![h].loop === 1 };
    }
    return null;
  }
}
