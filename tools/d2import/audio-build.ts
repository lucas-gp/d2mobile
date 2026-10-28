/**
 * Audio de Diablo II à la demande, à partir des archives du joueur (d2sfx, d2speech, d2xtalk, d2music + Sounds.txt de d2data/d2exp) :
 * partagé par le navigateur (Worker) et les contrôles Node. Reproduit la sortie de tools/d2audio (extract.py, music.py, voices.py)
 * sans StormLib ni ffmpeg : mêmes identifiants (`audio/index.json`, `audio/pack-<propriétaire>.bin`, `audio/music-<clé>.mp3`,
 * `audio/voice-<pnj>-<n>.mp3`, `audio/gossip-<pnj>-<n>.mp3`), mêmes groupes, mêmes volumes ; le contenu est du WAV PCM 16 bits
 * (que `decodeAudioData` lit) au lieu du MP3 : aucun encodeur nécessaire.
 *
 * - Les sons d'effets gardent leur WAV d'origine (offsets du paquet connus sans rien décoder : taille décompressée du bloc MPQ).
 * - Les musiques (stéréo 22 050 Hz, 10 à 30 Mo) sont décodées par tranches et mélangées en mono à la volée : jamais le morceau stéréo
 *   en entier en mémoire.
 * Rien n'est décodé avant d'être demandé ; `index()` ne lit que Sounds.txt, les tables des archives et l'en-tête des phrases de voix.
 */
import type { MpqCore } from './mpq-core';
import { latin1 } from './bytes';

export interface AudioArchives {
  /** d2sfx.mpq (sons d'effets, interface) */
  sfx?: MpqCore | null;
  /** d2speech.mpq (voix des PNJ des Actes I-IV) */
  speech?: MpqCore | null;
  /** d2xtalk.mpq (voix de l'extension : Acte V, héroïnes) */
  xtalk?: MpqCore | null;
  /** d2music.mpq (musiques de zone) */
  music?: MpqCore | null;
  /** d2exp.mpq / d2data.mpq (Sounds.txt), du plus prioritaire au moins prioritaire */
  data: MpqCore[];
}

export interface SoundEntry {
  p: string;
  o: number;
  l: number;
  v: number;
  loop: number;
}

export interface AudioIndexJson {
  v: number;
  sounds: Record<string, SoundEntry>;
  music: Record<string, { file: string; l: number }>;
  voices: Record<string, string[]>;
  gossip: Record<string, { n: number; f: string }[]>;
}

/* -------------------------------------------------------------------------- */
/* Tables (reprises de tools/d2audio)                                         */
/* -------------------------------------------------------------------------- */

const NPC = new Set([
  'CAIN',
  'WARRIV',
  'AKARA',
  'KASHYA',
  'CHARSI',
  'GHEED',
  'DROGNAN',
  'ATMA',
  'FARA',
  'LYSANDER',
  'GREIZ',
  'ELZIX',
  'GEGLASH',
  'MESHIF',
  'ORMUS',
  'HRATLI',
  'ALKOR',
  'ASHEARA',
  'JERHYN',
  'NATALYA',
  'TYRAEL',
  'LARZUK',
  'MALAH',
  'ANYA',
  'QUALKEHK',
  'NIHLATHAK',
  'IZUAL',
]);
const DROP = /(_ACT\d|CHAT_|_FIND_|_COMPLETE|_BEGIN|_NEAR_|_TRIGGER|_RESCUE|NEEDKEY|IMPOSSIBLE|CANTCARRY|CANTUSEYET|NOT_IN_TOWN|^ESOUND_SCENE|^ESOUND_QUEST|^ESOUND_MUSIC|^ESOUND_CORRUPT)/;

/** Morceaux joués par le jeu (clé → fichier de d2music.mpq) */
export const MUSIC_TRACKS: Record<string, string> = {
  town: 'act1\\town1.wav',
  tristram: 'act1\\tristram.wav',
  wilderness: 'act1\\wild.wav',
  tombs: 'act2\\tombs.wav',
  crypt: 'act1\\crypt.wav',
  kurast: 'act3\\kurast.wav',
  chaos: 'act4\\diablo.wav',
  sanctuary: 'act2\\sanctuary.wav',
  mesa: 'act4\\mesa.wav',
  caves: 'act1\\caves.wav',
  monastery: 'act1\\monastery.wav',
  desert: 'act2\\desert.wav',
  harem: 'act2\\harem.wav',
  lair: 'act2\\lair.wav',
  sewer: 'act2\\sewer.wav',
  valley: 'act2\\valley.wav',
  town2: 'act2\\town2.wav',
  jungle: 'act3\\jungle.wav',
  kurastsewer: 'act3\\kurastsewer.wav',
  spider: 'act3\\spider.wav',
  town3: 'act3\\town3.wav',
  town4: 'act4\\town4.wav',
  options: 'common\\options.wav',
  st_andariel: 'act1\\andarielaction.wav',
  st_bloodraven: 'act1\\bloodravenresolution.wav',
  st_den: 'act1\\denofevilaction.wav',
  st_horadric: 'act2\\horadricaction.wav',
  st_radament: 'act2\\radamentresolution.wav',
  st_tainted: 'act2\\taintedsunaction.wav',
  st_mephisto: 'act3\\mefdeathaction.wav',
  st_orb: 'act3\\orbaction.wav',
  st_forge: 'act4\\forgeaction.wav',
  st_izual: 'act4\\izualaction.wav',
};

const VOICE_NPCS: Record<string, string> = { larzuk: 'Larzuk', malah: 'Malah', qual_kehk: 'Qual-Kehk', anya: 'Anya' };
const VOICE_SKIP = /(_q\d|_intro|_complete|_entry|_rescue|_init|_early|_after|_successful|_found|_secret|_ama|_asn|_bar|_dru|_nec|_pal|_sor|_ama_)/i;
const VOICE_MAX_S = 9;
const GOSSIP: Record<string, [string, number]> = {
  larzuk: ['LARZUK', 5],
  malah: ['MALAH', 5],
  anya: ['ANYA', 5],
  qual_kehk: ['QUALKEHK', 5],
  akara: ['AKARA', 1],
  charsi: ['CHARSI', 1],
  gheed: ['GHEED', 1],
  kashya: ['KASHYA', 1],
  warriv: ['WARRIV', 1],
  cain1: ['CAIN', 1],
  tyrael: ['TYRAEL', 4],
  cain4: ['CAIN', 4],
  jamella: ['JAMELLA', 4],
  halbu: ['HALBU', 4],
  atma: ['ATMA', 2],
  fara: ['FARA', 2],
  drognan: ['DROGNAN', 2],
  lysander: ['LYSANDER', 2],
  elzix: ['ELZIX', 2],
  greiz: ['GREIZ', 2],
  geglash: ['GEGLASH', 2],
  meshif: ['MESHIF', 2],
  jerhyn: ['JERHYN', 2],
  cain2: ['CAIN', 2],
  warriv2: ['WARRIV', 2],
  ormus: ['ORMUS', 3],
  hratli: ['HRATLI', 3],
  asheara: ['ASHEARA', 3],
  alkor: ['ALKOR', 3],
  natalya: ['NATALYA', 3],
  meshif3: ['MESHIF', 3],
  cain3: ['CAIN', 3],
};

const SFX_BASES = ['data\\global\\sfx\\', 'data\\local\\sfx\\', 'data\\local\\sfx\\common\\'];

/** Propriétaire (paquet) d'un son d'après son identifiant */
export function soundOwner(handle: string): string {
  const parts = handle.slice('ESOUND_'.length).split('_');
  const o = parts[0];
  if (['IMPACT', 'WEAPON', 'LIGHT', 'MEDIUM', 'HEAVY', 'ITEM', 'CURSOR', 'OBJECT', 'SHRINE'].includes(o)) return 'common';
  if (o === 'EVENT') return `event-${parts[1].toLowerCase()}`;
  if (o === 'MONSTER') return 'monster-skills';
  return o.toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* WAV                                                                         */
/* -------------------------------------------------------------------------- */

export interface WavInfo {
  channels: number;
  rate: number;
  bits: number;
  /** position du premier échantillon dans le fichier */
  dataStart: number;
  /** octets d'échantillons déclarés (peut dépasser ce que contient le fichier) */
  dataLen: number;
}

/** En-tête WAV PCM (parcourt les blocs jusqu'à `data`) ; null si ce n'est pas un WAV lisible dans les octets donnés */
export function parseWav(b: Uint8Array): WavInfo | null {
  if (b.length < 12 || latin1(b.subarray(0, 4)) !== 'RIFF' || latin1(b.subarray(8, 12)) !== 'WAVE') return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 12;
  let fmt: { channels: number; rate: number; bits: number } | null = null;
  while (p + 8 <= b.length) {
    const id = latin1(b.subarray(p, p + 4));
    const len = v.getUint32(p + 4, true);
    if (id === 'fmt ' && p + 24 <= b.length) fmt = { channels: v.getUint16(p + 10, true), rate: v.getUint32(p + 12, true), bits: v.getUint16(p + 22, true) };
    else if (id === 'data') return fmt ? { ...fmt, dataStart: p + 8, dataLen: len } : null;
    p += 8 + len + (len & 1);
  }
  return null;
}

/** En-tête WAV PCM canonique de 44 octets */
export function wavHeader(dataLen: number, channels: number, rate: number): Uint8Array {
  const h = new Uint8Array(44);
  const v = new DataView(h.buffer);
  h.set([0x52, 0x49, 0x46, 0x46], 0);
  v.setUint32(4, 36 + dataLen, true);
  h.set([0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20], 8);
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  h.set([0x64, 0x61, 0x74, 0x61], 36);
  v.setUint32(40, dataLen, true);
  return h;
}

/** Durée (secondes) d'un WAV dont on connaît l'en-tête et la taille totale */
export function wavSeconds(w: WavInfo, fileSize: number): number {
  const len = Math.min(w.dataLen, Math.max(0, fileSize - w.dataStart));
  return len / (w.rate * w.channels * (w.bits / 8));
}

/**
 * Décode un WAV stéréo en flux et le mélange en mono (moyenne des deux voies) : les tranches arrivent dans l'ordre, la sortie est
 * allouée une seule fois (moitié de la taille PCM). Mono : copie telle quelle sous un en-tête canonique.
 */
export function streamMonoWav(stream: (sink: (c: Uint8Array) => boolean | void) => boolean, fileSize: number): Uint8Array | null {
  let info: WavInfo | null = null;
  let out: Uint8Array | null = null;
  let o = 44; // position d'écriture dans la sortie
  let skip = 0; // octets d'en-tête à ignorer encore
  let remaining = 0; // octets d'échantillons encore attendus
  let left: Uint8Array = new Uint8Array(0); // reste d'une trame coupée entre deux tranches
  let head: Uint8Array = new Uint8Array(0);
  const cat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
    if (!a.length) return b;
    const j = new Uint8Array(a.length + b.length);
    j.set(a);
    j.set(b, a.length);
    return j;
  };
  const consume = (chunk: Uint8Array): void => {
    const w = info!;
    if (skip > 0) {
      const s = Math.min(skip, chunk.length);
      chunk = chunk.subarray(s);
      skip -= s;
    }
    if (!chunk.length || remaining <= 0) return;
    const buf = cat(left, chunk);
    const fb = w.channels * 2;
    const frames = Math.min(Math.floor(buf.length / fb), Math.floor(remaining / fb));
    const dst = out!;
    let i = 0;
    if (w.channels === 1) {
      for (let f = 0; f < frames; f++, i += 2) {
        dst[o++] = buf[i];
        dst[o++] = buf[i + 1];
      }
    } else {
      for (let f = 0; f < frames; f++, i += 4) {
        const s = ((((buf[i] | (buf[i + 1] << 8)) << 16) >> 16) + (((buf[i + 2] | (buf[i + 3] << 8)) << 16) >> 16)) >> 1;
        dst[o++] = s & 0xff;
        dst[o++] = (s >> 8) & 0xff;
      }
    }
    remaining -= frames * fb;
    left = buf.slice(i);
  };
  const ok = stream((chunk) => {
    if (!info) {
      head = cat(head, chunk.slice());
      info = parseWav(head);
      if (!info) return head.length > 65536 ? false : undefined;
      if (info.bits !== 16 || info.channels < 1 || info.channels > 2) return false;
      const len = Math.min(info.dataLen, Math.max(0, fileSize - info.dataStart));
      const frames = Math.floor(len / (info.channels * 2));
      out = new Uint8Array(44 + frames * 2);
      out.set(wavHeader(frames * 2, 1, info.rate), 0);
      remaining = frames * info.channels * 2;
      skip = info.dataStart;
      consume(head);
      head = new Uint8Array(0);
    } else consume(chunk);
    return remaining > 0 ? undefined : false;
  });
  if (!ok || !out || !info) return null;
  return out;
}

/* -------------------------------------------------------------------------- */
/* Plan : quoi lire où                                                         */
/* -------------------------------------------------------------------------- */

interface Src {
  mpq: MpqCore;
  name: string;
}

interface PackEntry extends Src {
  handle: string;
  o: number;
  l: number;
}

export class AudioBank {
  private idx: AudioIndexJson | null = null;
  private packs = new Map<string, PackEntry[]>();
  private files = new Map<string, Src>();

  constructor(private readonly a: AudioArchives) {}

  /** au moins une archive audio est présente */
  get hasAudio(): boolean {
    return !!(this.a.sfx || this.a.speech || this.a.xtalk || this.a.music);
  }

  private soundsTxt(): string | null {
    // ordre de extract.py : d2exp, d2sfx, d2data, d2xtalk, d2speech (le premier qui l'a)
    const list = [this.a.data[0], this.a.sfx, this.a.data[1], this.a.xtalk, this.a.speech, ...this.a.data.slice(2)];
    for (const m of list) {
      const d = m?.get('data\\global\\excel\\Sounds.txt');
      if (d) return latin1(d);
    }
    return null;
  }

  /** Fichier d'un son : d2exp, d2sfx, d2data, d2xtalk, d2speech (le dernier de la liste de python gagne), pour chaque dossier dans l'ordre */
  private findSfx(file: string): Src | null {
    const fn = file.replace(/\//g, '\\');
    const order = [this.a.data[0], this.a.sfx, this.a.data[1], this.a.xtalk, this.a.speech, ...this.a.data.slice(2)];
    for (const base of SFX_BASES) {
      for (const m of order) {
        if (m && m.has(base + fn)) return { mpq: m, name: base + fn };
      }
    }
    return null;
  }

  /** Index (même forme que le `audio/index.json` de tools/d2audio) ; null si Sounds.txt est introuvable */
  index(): AudioIndexJson | null {
    if (this.idx) return this.idx;
    const txt = this.soundsTxt();
    if (!txt) return null;
    const lines = txt.split(/\r?\n/);
    const head = lines[0].split('\t');
    const col = (n: string) => head.indexOf(n);
    const cFile = col('FileName');
    const cVol = col('Volume');
    const cLoop = col('Loop');
    const idx: AudioIndexJson = { v: 1, sounds: {}, music: {}, voices: {}, gossip: {} };
    const seen = new Set<string>();
    const rows: string[][] = [];
    for (const l of lines.slice(1)) {
      const c = l.split('\t');
      if (c.length > 5 && c[0].startsWith('ESOUND_')) rows.push(c);
    }
    // --- effets
    const byOwner = new Map<string, PackEntry[]>();
    for (const c of rows) {
      const handle = c[0];
      if (seen.has(handle)) continue;
      seen.add(handle);
      const fn = c[cFile];
      if (fn === 'none.wav' || DROP.test(handle)) continue;
      const owner = soundOwner(handle);
      if (NPC.has(owner.toUpperCase()) && !/_GREETING_\d$/.test(handle)) continue;
      const src = this.findSfx(fn);
      if (!src) continue;
      const size = src.mpq.size(src.name) ?? 0;
      const list = byOwner.get(owner) ?? [];
      const o = list.length ? list[list.length - 1].o + list[list.length - 1].l : 0;
      list.push({ ...src, handle, o, l: size });
      byOwner.set(owner, list);
      idx.sounds[handle] = { p: owner, o, l: size, v: Math.round((parseInt(c[cVol] || '255', 10) / 255) * 1000) / 1000 || 0, loop: parseInt(c[cLoop] || '0', 10) || 0 };
    }
    // un volume 0 explicite est conservé tel quel (python : int(r['Volume'] or 255))
    this.packs = byOwner;
    // --- musiques
    if (this.a.music) {
      for (const [key, f] of Object.entries(MUSIC_TRACKS)) {
        const name = `data\\global\\music\\${f}`;
        const size = this.a.music.size(name);
        if (size === null) continue;
        const file = `music-${key}.mp3`;
        idx.music[key] = { file, l: Math.round(size / 2) + 44 };
        this.files.set(`audio/${file}`, { mpq: this.a.music, name });
      }
    }
    // --- voix de l'Acte V (d2xtalk) : phrases courtes de bavardage et de salutation
    if (this.a.xtalk) {
      const names = this.a.xtalk.listfile();
      for (const [key, folder] of Object.entries(VOICE_NPCS)) {
        const re = new RegExp(`^data\\\\local\\\\sfx\\\\Act5\\\\${folder.replace('-', '\\-')}\\\\`, 'i');
        const files = names.filter((n) => re.test(n) && !VOICE_SKIP.test(n.split('\\').pop()!)).sort();
        const out: string[] = [];
        for (const n of files) {
          const size = this.a.xtalk.size(n);
          if (size === null) continue;
          let w: WavInfo | null = null;
          let head = new Uint8Array(0);
          this.a.xtalk.stream(n, (c) => {
            const j = new Uint8Array(head.length + c.length);
            j.set(head);
            j.set(c, head.length);
            head = j;
            w = parseWav(head);
            return w || head.length > 65536 ? false : undefined;
          });
          if (!w || wavSeconds(w, size) > VOICE_MAX_S) continue;
          const file = `voice-${key}-${out.length}.mp3`;
          out.push(file);
          this.files.set(`audio/${file}`, { mpq: this.a.xtalk, name: n });
        }
        idx.voices[key] = out;
      }
    }
    // --- bavardage numéroté : ESOUND_<PNJ>_ACT<n>_GOSSIP_<k>
    const gossipSources = [this.a.xtalk, this.a.speech, this.a.sfx];
    for (const [key, [hname, act]] of Object.entries(GOSSIP)) {
      const re = new RegExp(`^ESOUND_${hname}_ACT${act}_GOSSIP_(\\d+)$`);
      const lst: { n: number; f: string }[] = [];
      for (const c of rows) {
        const m = re.exec(c[0]);
        if (!m || c.length < 3) continue;
        const name = `data\\local\\sfx\\${c[2].replace(/\//g, '\\')}`;
        const mpq = gossipSources.find((x) => x?.has(name));
        if (!mpq) continue;
        const n = parseInt(m[1], 10);
        const file = `gossip-${key}-${n}.mp3`;
        lst.push({ n, f: file });
        this.files.set(`audio/${file}`, { mpq, name });
      }
      idx.gossip[key] = lst.sort((a, b) => a.n - b.n);
    }
    this.idx = idx;
    return idx;
  }

  /** Le chemin est-il servi par cette banque (ou `audio/index.json`) ? */
  has(path: string): boolean {
    const idx = this.index();
    if (!idx) return false;
    if (path === 'audio/index.json') return true;
    const m = /^audio\/pack-(.+)\.bin$/.exec(path);
    if (m) return this.packs.has(m[1]);
    return this.files.has(path);
  }

  /** Taille du fichier tel qu'il sera servi (sans le produire) ; null s'il n'existe pas ou si elle n'est pas connue d'avance */
  sizeOf(path: string): number | null {
    const m = /^audio\/pack-(.+)\.bin$/.exec(path);
    if (!m) return null;
    const list = this.packs.get(m[1]);
    return list?.length ? list[list.length - 1].o + list[list.length - 1].l : null;
  }

  /** Octets d'un fichier du dossier `audio/` ; `range` = [offset, longueur] dans un paquet (un seul son décodé) ; null s'il n'existe pas */
  read(path: string, range?: [number, number]): Uint8Array | null {
    const idx = this.index();
    if (!idx) return null;
    if (path === 'audio/index.json') return new TextEncoder().encode(JSON.stringify(idx));
    const pk = /^audio\/pack-(.+)\.bin$/.exec(path);
    if (pk) {
      const list = this.packs.get(pk[1]);
      if (!list) return null;
      const total = list[list.length - 1].o + list[list.length - 1].l;
      const from = range ? range[0] : 0;
      const to = range ? Math.min(total, range[0] + range[1]) : total;
      if (from < 0 || to <= from) return new Uint8Array(0);
      const out = new Uint8Array(to - from);
      for (const e of list) {
        if (e.o + e.l <= from || e.o >= to) continue;
        const d = e.mpq.get(e.name);
        if (!d) continue;
        const a = Math.max(from, e.o);
        const b = Math.min(to, e.o + e.l, e.o + d.length);
        out.set(d.subarray(a - e.o, b - e.o), a - from);
      }
      return out;
    }
    const f = this.files.get(path);
    if (!f) return null;
    const size = f.mpq.size(f.name) ?? 0;
    return streamMonoWav((sink) => f.mpq.stream(f.name, sink, 1 << 20), size);
  }
}
