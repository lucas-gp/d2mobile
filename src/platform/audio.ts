/**
 * Audio procédural (Web Audio, aucun fichier) : sorts, impacts, morts, butin (une rune haute
 * s'entend de loin : cloche grave et longue), montée de niveau, ambiance de zone.
 * Déverrouillé au premier contact (exigence des navigateurs mobiles).
 */
import { SKILL_BY_ID, classSkills } from '../data/skills';
import { BASE_BY_ID } from '../data/items/bases';
import { D2Sounds, type D2Reader, type D2RangeReader } from './d2sounds';
import { MusicPlayer, decodeMusic } from './music';
import * as M from './d2sound-map';
import type { SimEvent } from '../sim/events';
import type { World } from '../sim/world';

type Elem = 'fire' | 'cold' | 'light' | 'poison' | 'magic' | 'phys';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private amb: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private ambNodes: AudioNode[] = [];
  private lastPlay = new Map<string, number>();
  private noiseOffset = 0;
  /** Échantillons CC0 (public/audio, voir tools/audio/build-audio.py) : nom → variantes décodées */
  private samples = new Map<string, AudioBuffer[]>();
  private lastStep = 0;
  /** Sons importés de Diablo II (tools/d2audio) : prioritaires quand ils sont chargés */
  private d2: D2Sounds | null = null;
  private mood = 'tristram';
  private nextAmbient = 0;
  /** Musique en Web Audio pur (aucun élément audio : pas de carte « lecteur média », pas de prise de focus audio) */
  player: MusicPlayer | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private musicWanted = '';
  /** Morceau choisi pour la zone en cours quand il ne dépend pas seulement de l'ambiance (cartes) */
  private trackOverride: string | null = null;
  private nextNeutral = 0;
  sfxVolume = 0.8;
  musicVolume = 0.5;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      if (this.musicWanted === '' && this.moodTrack()) void this.playMusic(this.moodTrack()!);
      return;
    }
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return;
    // iOS 16.4+ : catégorie « ambient » = se mélange aux autres applications (sans effet ailleurs)
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    } catch {
      /* non géré */
    }
    this.ctx = new Ctx();
    // déverrouillage par un tampon silencieux Web Audio (jamais d'élément <audio>)
    {
      const b = this.ctx.createBuffer(1, 1, 22050);
      const s0 = this.ctx.createBufferSource();
      s0.buffer = b;
      s0.connect(this.ctx.destination);
      s0.start();
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);
    const ctx0 = this.ctx;
    this.player = new MusicPlayer({
      ctx: ctx0,
      out: this.master,
      has: (k) => this.d2?.hasMusic(k) ?? false,
      read: (k) => this.d2?.readMusic(k) ?? Promise.resolve(null),
      decode: (b) => decodeMusic(ctx0, b),
    });
    this.player.setLevel(this.musicLevel());
    // le contexte n'existe qu'après le premier geste : les sons de la zone déjà annoncée se préparent maintenant
    this.zoneWarm?.();
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = this.sfxVolume;
    this.sfx.connect(this.master);
    this.amb = this.ctx.createGain();
    this.amb.gain.value = this.musicVolume * 0.5;
    this.amb.connect(this.master);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      d[i] = (seed / 4294967296) * 2 - 1;
    }
    void this.loadSamples();
    if (this.d2 && this.moodTrack()) void this.playMusic(this.moodTrack()!);
  }

  /** Chargement des échantillons en tâche de fond ; tant qu'un son manque, le procédural le remplace */
  private async loadSamples(): Promise<void> {
    const c = this.ctx;
    if (!c) return;
    const base = `${import.meta.env.BASE_URL}audio/`;
    try {
      const res = await fetch(`${base}index.json`);
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return;
      const index = (await res.json()) as Record<string, number>;
      for (const [name, n] of Object.entries(index)) {
        const list: AudioBuffer[] = [];
        for (let i = 0; i < n; i++) {
          try {
            const r = await fetch(`${base}${name}_${i}.mp3`);
            if (!r.ok) continue;
            list.push(await c.decodeAudioData(await r.arrayBuffer()));
          } catch {
            /* format non lu : repli procédural */
          }
        }
        if (list.length) this.samples.set(name, list);
      }
    } catch {
      /* hors ligne sans cache : sons procéduraux seulement */
    }
  }

  /** Joue un échantillon (variante et hauteur légèrement aléatoires) ; faux s'il n'est pas chargé */
  private play(name: string, vol: number, rate = 1, jitter = 0.06): boolean {
    const c = this.ctx;
    const list = this.samples.get(name);
    if (!c || !this.sfx || !list?.length) return false;
    const s = c.createBufferSource();
    s.buffer = list[Math.floor(Math.random() * list.length)];
    s.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    const g = c.createGain();
    g.gain.value = vol;
    s.connect(g).connect(this.sfx);
    s.start();
    return true;
  }

  /** Branche les sons importés de D2 (lecture déjà déchiffrée) ; sans eux, tout reste comme avant */
  attachD2(read: D2Reader, readRange?: D2RangeReader): void {
    const d2 = new D2Sounds(read, () => this.ctx, readRange);
    void d2.init().then((ok) => {
      if (!ok) return;
      this.d2 = d2;
      this.zoneWarm?.();
      if (this.moodTrack()) void this.playMusic(this.moodTrack()!);
      for (const g of [
        'CURSOR_BUTTON_CLICK',
        'CURSOR_ERROR',
        'CURSOR_LEVEL_UP',
        'ITEM_GOLD',
        'ITEM_POTION_DRINK',
        'ITEM_FLIPPY',
        'ITEM_RUNE',
        'IMPACT_BLADE_SWING',
        'IMPACT_BLUNT',
        'IMPACT_FIRE',
        'IMPACT_COLD',
        'IMPACT_LIGHTNING',
      ])
        d2.warm(g);
    });
  }

  /** Mode local : les textes des PNJ viennent d'être générés (après l'index des sons) */
  reloadNpcText(): void {
    void this.d2?.loadText();
  }

  /** Lignes de dialogue d'un PNJ (textes D2), vide sans import */
  npcLines(npc: string): { n: number; text: string; file?: string }[] {
    return this.d2?.gossipLines(npc) ?? [];
  }

  /** Joue une ligne de dialogue ; renvoie un arrêt (la voix précédente est coupée) */
  private gossipSrc: AudioBufferSourceNode | null = null;
  async playGossip(file: string | undefined): Promise<void> {
    try {
      this.gossipSrc?.stop();
    } catch {
      /* déjà terminée */
    }
    this.gossipSrc = null;
    const c = this.ctx;
    if (!file || !c || !this.d2 || !this.sfx) return;
    const buf = await this.d2.gossipVoice(file);
    if (!buf) return;
    const s = c.createBufferSource();
    s.buffer = buf;
    const g = c.createGain();
    g.gain.value = 0.95;
    s.connect(g).connect(this.sfx);
    s.start();
    this.gossipSrc = s;
  }

  /** Joue une phrase du PNJ ; faux si le PNJ n'a pas de voix importée */
  private async npcVoice(npc: string): Promise<boolean> {
    const c = this.ctx;
    if (!c || !this.d2 || !this.sfx) return false;
    if (!this.throttle(`voice_${npc}`, 1500)) return true; // déjà en train de parler
    const buf = await this.d2.voice(npc);
    if (!buf) return false;
    const s = c.createBufferSource();
    s.buffer = buf;
    const g = c.createGain();
    g.gain.value = 0.95;
    s.connect(g).connect(this.sfx);
    s.start();
    return true;
  }

  private moodTrack(): string | undefined {
    return this.trackOverride ?? M.MOOD_MUSIC[this.mood];
  }

  /** Phrase musicale de Diablo II (mort d'un boss) par-dessus la musique de zone, qui baisse le temps qu'elle joue */
  private async stinger(key: string): Promise<void> {
    const p = this.player;
    if (!p || this.musicLevel() <= 0 || !this.throttle(`st_${key}`, 20000)) return;
    const dur = await p.stinger(key, Math.min(1, this.musicVolume * 1.4 + 0.2));
    if (dur > 0) p.duck(0.25, dur + 0.3);
  }

  /** Musique de la zone (Diablo II) : fondu enchaîné, lecture en boucle, décodée en mémoire (Web Audio) */
  private async playMusic(key: string): Promise<void> {
    this.musicWanted = key;
    if (!this.player || !this.d2?.hasMusic(key)) return;
    await this.player.play(key);
  }

  private musicLevel(): number {
    return this.musicVolume * 0.9;
  }

  /** Préchargement de la zone courante, rejoué quand le contexte audio ou l'import arrivent après l'entrée en zone */
  private zoneWarm: (() => void) | null = null;

  /** Précharge les sons de la classe jouée (voix, compétences) : appelé au lancement d'une partie */
  warmClass(classId: string): void {
    const d2 = this.d2;
    const o = M.CLASS_OWNER[classId];
    if (!d2 || !o) return;
    for (const g of [`${o}_HIT`, `${o}_DEATH`]) d2.warm(g);
    for (const sk of classSkills(classId as never)) {
      const g = M.castSound((x) => d2.has(x), classId, sk.id, sk.element);
      if (g) d2.warm(g);
    }
  }

  /**
   * Précharge les sons les plus probables d'une zone à l'arrivée (monstres présents, ambiance, pas) : en mode local chaque son est décodé
   * depuis les archives à la première demande, le premier coup ne doit pas l'attendre. Plafonné : une dizaine de familles de monstres.
   */
  warmZone(w: World, mood: string): void {
    const d2 = this.d2;
    if (!d2) return;
    const ids = new Set<string>();
    for (const m of w.monsters) {
      if (m.dead || m.isSummon) continue;
      ids.add(m.def.id);
      if (ids.size >= 10) break;
    }
    let n = 0;
    for (const id of ids) {
      for (const k of ['ATTACK', 'HIT', 'DEATH', 'NEUTRAL'] as const) {
        const g = M.monsterSound(this.has, id, k);
        if (g && n++ < 48) d2.warm(g);
      }
    }
    for (const g of M.MOOD_EVENTS[mood] ?? []) if (d2.has(g)) d2.warm(g);
    const st = M.stepSound(this.has, w.character.classId, false, String(w.zone.ground), !!w.zone.town);
    if (st) d2.warm(st);
  }

  /** Les sons de Diablo II sont-ils branchés (index chargé) ? */
  get d2Ready(): boolean {
    return !!this.d2;
  }

  /**
   * Ce que la zone fera entendre : plages de sons des groupes (classe, compétences, monstres de la distribution COMPLÈTE de la zone,
   * ambiance, pas, interface) et fichier de la musique. Sert à faire décoder d'avance par les archives (mode local) : le jeu attend
   * que ces sons soient prêts avant le départ ; le décodage en tampon audio se fait ensuite à la demande, depuis le cache.
   */
  zoneSoundTargets(w: World, mood: string, monsterIds: Iterable<string>): { ranges: { path: string; range: [number, number] }[]; files: string[] } {
    const d2 = this.d2;
    if (!d2) return { ranges: [], files: [] };
    const groups = new Set<string>([
      'CURSOR_BUTTON_CLICK',
      'CURSOR_ERROR',
      'CURSOR_LEVEL_UP',
      'ITEM_GOLD',
      'ITEM_POTION_DRINK',
      'ITEM_FLIPPY',
      'ITEM_RUNE',
      'IMPACT_BLADE_SWING',
      'IMPACT_BLUNT',
      'IMPACT_FIRE',
      'IMPACT_COLD',
      'IMPACT_LIGHTNING',
    ]);
    const classId = w.character.classId;
    const o = M.CLASS_OWNER[classId];
    if (o) for (const g of [`${o}_HIT`, `${o}_DEATH`]) groups.add(g);
    for (const sk of classSkills(classId as never)) {
      const g = M.castSound((x) => d2.has(x), classId, sk.id, sk.element);
      if (g) groups.add(g);
    }
    for (const id of monsterIds) {
      for (const k of ['ATTACK', 'HIT', 'DEATH', 'NEUTRAL'] as const) {
        const g = M.monsterSound(this.has, id, k);
        if (g) groups.add(g);
      }
    }
    for (const g of M.MOOD_EVENTS[mood] ?? []) if (d2.has(g)) groups.add(g);
    const st = M.stepSound(this.has, classId, false, String(w.zone.ground), !!w.zone.town);
    if (st) groups.add(st);
    const files: string[] = [];
    const key = M.MOOD_MUSIC[mood];
    const mp = key ? d2.musicPath(key) : null;
    if (mp) files.push(mp);
    return { ranges: d2.rangesOf([...groups].filter((g) => d2.has(g))), files };
  }

  /** Diagnostic (tests de bout en bout) : sons D2 réellement lancés par groupe, et demandes sans tampon prêt */
  readonly d2Diag = { played: new Map<string, number>(), late: 0 };

  /** Joue un groupe de sons D2 ; faux si l'import est absent ou le son pas encore décodé */
  private d2play(group: string | null, vol: number, rate = 1, jitter = 0.04): boolean {
    const c = this.ctx;
    const d2 = this.d2;
    if (!group || !c || !d2 || !this.sfx) return false;
    const p = d2.pick(group);
    if (!p) {
      this.d2Diag.late++;
      return false;
    }
    this.d2Diag.played.set(group, (this.d2Diag.played.get(group) ?? 0) + 1);
    const s = c.createBufferSource();
    s.buffer = p.buffer;
    s.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    const g = c.createGain();
    g.gain.value = vol * p.volume;
    s.connect(g).connect(this.sfx);
    s.start();
    return true;
  }

  private has = (g: string): boolean => this.d2?.has(g) ?? false;

  private mdef(w: World, id: number): string | undefined {
    return w.monsters.find((m) => m.id === id)?.def.id;
  }

  /** Pas du joueur : neige en ville (Harrogath), herbe et terre dehors, pierre dans les cryptes */
  private steps(w: World): void {
    const p = w.player;
    if (p.mode !== 'walk' || p.dead) return;
    const now = performance.now();
    const interval = 330 * (5.2 / Math.max(2, w.playerSpeed()));
    if (now - this.lastStep < interval) return;
    this.lastStep = now;
    if (this.d2play(M.stepSound(this.has, w.character.classId, false, String(w.zone.ground), !!w.zone.town), 0.5, 1, 0.08)) return;
    const g = String(w.zone.ground);
    const surface = w.zone.town || g.includes('snow') ? 'step_snow' : /grass|mud|dirt|sand/.test(g) ? 'step_grass' : 'step_stone';
    this.play(surface, 0.22);
  }

  /** Onglet en arrière-plan : le contexte est suspendu après quelques secondes (un aller-retour rapide ne coupe rien) */
  suspend(): void {
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = null;
      void this.ctx?.suspend();
    }, 4000);
  }

  resume(): void {
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
    void this.ctx?.resume();
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    if (this.sfx) this.sfx.gain.value = sfx;
    if (this.amb) this.amb.gain.value = music * 0.5;
    this.player?.setLevel(this.musicLevel());
  }

  /** Limite de répétition par type de son (évite la saturation dans les grosses mêlées) */
  private throttle(key: string, ms: number): boolean {
    const now = performance.now();
    const last = this.lastPlay.get(key) ?? 0;
    if (now - last < ms) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, glide = 0, delay = 0): void {
    const c = this.ctx;
    if (!c || !this.sfx) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, filter: BiquadFilterType, freq: number, q = 1, sweep = 1, delay = 0): void {
    const c = this.ctx;
    if (!c || !this.sfx || !this.noiseBuf) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * sweep), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    this.noiseOffset = (this.noiseOffset + 0.37) % 1.5;
    s.start(t, this.noiseOffset);
    s.stop(t + dur + 0.05);
  }

  cast(e: Elem): void {
    if (!this.throttle(`cast${e}`, 60)) return;
    if (e === 'fire') this.noise(0.35, 0.35, 'bandpass', 900, 0.8, 0.4);
    else if (e === 'cold') {
      this.noise(0.3, 0.25, 'highpass', 3000, 0.7, 1.5);
      this.tone(1600, 0.25, 'sine', 0.06, 1.3);
    } else if (e === 'light') {
      this.play('zap', 0.14, 1.2);
      this.noise(0.18, 0.3, 'highpass', 2500, 1, 0.8);
      this.tone(220, 0.15, 'sawtooth', 0.05, 2.5);
    } else this.noise(0.25, 0.2, 'bandpass', 1400, 1, 0.6);
  }

  impact(e: Elem, big: boolean): void {
    if (!this.throttle(`imp${e}${big}`, big ? 70 : 45)) return;
    if (e === 'fire' && big && this.play('boom', 0.45)) {
      this.tone(70, 0.4, 'sine', 0.25, 0.5);
      return;
    }
    if (e === 'cold' && this.play('ice', big ? 0.32 : 0.2)) return;
    if (e === 'phys' && this.play('thud', 0.3)) return;
    if (e === 'fire') {
      this.noise(big ? 0.6 : 0.25, big ? 0.55 : 0.25, 'lowpass', big ? 900 : 1500, 0.7, 0.3);
      if (big) this.tone(70, 0.5, 'sine', 0.35, 0.5);
    } else if (e === 'cold') {
      this.noise(0.25, 0.25, 'highpass', 4000, 2, 0.6);
      this.tone(2400, 0.12, 'triangle', 0.05, 0.7);
    } else if (e === 'light') {
      this.noise(0.15, 0.35, 'bandpass', 3200, 2, 0.5);
    } else this.noise(0.15, 0.25, 'lowpass', 600, 1, 0.5);
  }

  hitPlayer(): void {
    if (!this.throttle('hurt', 180)) return;
    if (this.play('hurt', 0.45)) return;
    this.noise(0.18, 0.35, 'lowpass', 500, 1, 0.5);
    this.tone(110, 0.2, 'sine', 0.2, 0.6);
  }

  death(boss: boolean): void {
    if (!this.throttle('death', 50)) return;
    if (boss) this.play('boom_low', 0.7);
    else if (this.play('thud', 0.28, 0.85)) return;
    this.noise(boss ? 1.2 : 0.3, boss ? 0.6 : 0.2, 'lowpass', 400, 0.8, 0.4);
    if (boss) this.tone(55, 1.5, 'sawtooth', 0.2, 0.5);
  }

  /** Son distinct par valeur : clic pour le banal, carillon pour le rare, cloche grave pour l'exceptionnel */
  drop(tier: number, rune: boolean): void {
    if (tier >= 4 || (rune && tier >= 3)) {
      // rune haute / unique élite : cloche d'église, longue, audible de loin
      for (const [f, v] of [
        [196, 0.35],
        [392, 0.18],
        [587, 0.12],
        [784, 0.08],
      ] as [number, number][])
        this.tone(f, 3.2, 'sine', v, 0.995);
      this.tone(98, 3.5, 'triangle', 0.2, 0.99);
      if (tier >= 5) {
        // haute rune : cloche plus grave et arpège ascendant en plus
        this.tone(65, 4, 'sine', 0.25, 0.99);
        for (const [f, d] of [
          [1046, 0.25],
          [1568, 0.5],
          [2093, 0.75],
        ] as [number, number][])
          this.tone(f, 1.6, 'sine', 0.1, 1, d);
        this.play('bell', 0.6, 0.8, 0.3);
      }
      this.play('bell', 0.5, 1, 0);
      return;
    }
    if (!this.throttle(`drop${tier}`, 80)) return;
    if (tier >= 2 || rune) this.play('clink', tier >= 3 ? 0.45 : 0.3);
    else if (this.play('drop', 0.3)) return;
    if (tier >= 3) {
      this.tone(880, 0.6, 'sine', 0.18, 1);
      this.tone(1320, 0.8, 'sine', 0.12, 1, 0.08);
      this.tone(1760, 1, 'sine', 0.08, 1, 0.16);
    } else if (rune || tier === 2) {
      this.tone(660, 0.35, 'triangle', 0.12, 1.01);
      this.tone(990, 0.4, 'sine', 0.06, 1, 0.05);
    } else this.noise(0.08, 0.12, 'bandpass', 2000, 3, 1);
  }

  gold(): void {
    if (!this.throttle('gold', 70)) return;
    if (this.play('coins', 0.4)) return;
    this.tone(2600, 0.08, 'square', 0.03, 1.1);
    this.tone(3400, 0.1, 'square', 0.02, 1.1, 0.04);
  }

  potion(): void {
    this.noise(0.25, 0.2, 'bandpass', 700, 4, 1.8);
    this.tone(300, 0.25, 'sine', 0.08, 1.6);
  }

  levelUp(): void {
    if (this.d2play('CURSOR_LEVEL_UP', 0.7, 1, 0)) return;
    this.play('confirm', 0.4, 1, 0);
    [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.15, 1, i * 0.1));
  }

  teleport(): void {
    if (this.play('tele', 0.3, 1.3)) return;
    this.tone(300, 0.25, 'sine', 0.12, 4);
    this.noise(0.25, 0.15, 'bandpass', 2500, 2, 0.5);
  }

  /** Manipulation d'un objet dans l'inventaire (équiper, ranger, vendre) : son D2 du type d'objet */
  itemUi(type: string | undefined): void {
    const g = M.itemSound(this.has, type, false);
    if (g) {
      this.d2?.warm(g);
      this.d2play(g, 0.5, 1, 0.03);
    }
  }

  ui(): void {
    if (this.d2play('CURSOR_BUTTON_CLICK', 0.5, 1, 0.02)) return;
    if (this.play('click', 0.35)) return;
    this.tone(1200, 0.05, 'triangle', 0.05);
  }

  fail(): void {
    if (this.d2play('CURSOR_ERROR', 0.5, 1, 0)) return;
    if (this.play('error', 0.35, 1, 0)) return;
    this.tone(160, 0.12, 'square', 0.05, 0.8);
  }

  /** Ambiance de zone : vent filtré + bourdon grave, variable selon le lieu */
  setMood(mood: string): void {
    this.mood = mood;
    this.nextAmbient = 0;
    const track = this.moodTrack();
    if (track) void this.playMusic(track);
    const c = this.ctx;
    if (!c || !this.amb || !this.noiseBuf) return;
    for (const n of this.ambNodes) {
      try {
        (n as AudioScheduledSourceNode).stop?.();
      } catch {
        /* déjà arrêté */
      }
      n.disconnect();
    }
    this.ambNodes = [];
    const cfg: Record<string, { wind: number; drone: number[]; vol: number }> = {
      tristram: { wind: 500, drone: [55, 82.4], vol: 0.35 },
      harrogath: { wind: 900, drone: [65.4, 98], vol: 0.3 },
      tombs: { wind: 300, drone: [49, 73.4], vol: 0.35 },
      cows: { wind: 700, drone: [58.3, 87.3], vol: 0.3 },
      chaos: { wind: 200, drone: [38.9, 58.3, 43.7], vol: 0.42 },
      countess: { wind: 320, drone: [49, 73.4], vol: 0.35 },
      andariel: { wind: 280, drone: [46.2, 69.3], vol: 0.36 },
      mephisto: { wind: 220, drone: [38.9, 58.3, 43.7], vol: 0.4 },
      baal: { wind: 250, drone: [41.2, 61.7, 46.2], vol: 0.4 },
      map: { wind: 350, drone: [43.7, 65.4], vol: 0.35 },
    };
    const m = { ...(cfg[mood] ?? cfg.tristram) };
    // avec la musique de D2, le vent et le bourdon de synthèse ne font plus que le fond
    if (this.d2?.hasMusic(M.MOOD_MUSIC[mood] ?? '')) m.vol *= 0.25;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = m.wind;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = c.createGain();
    lfoG.gain.value = m.wind * 0.4;
    lfo.connect(lfoG).connect(f.frequency);
    const g = c.createGain();
    g.gain.value = m.vol * 0.5;
    src.connect(f).connect(g).connect(this.amb);
    src.start();
    lfo.start();
    this.ambNodes.push(src, lfo, f, g, lfoG);
    for (const hz of m.drone) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 180;
      const og = c.createGain();
      og.gain.value = m.vol * 0.06;
      o.connect(lp).connect(og).connect(this.amb);
      o.start();
      this.ambNodes.push(o, lp, og);
    }
  }

  /** Arme équipée : type et deux mains (pour l'élan et le bruit de coup) */
  private weapon(w: World): { type: string | undefined; two: boolean } {
    const it = w.character.equipment.mainhand;
    const b = it ? BASE_BY_ID[it.base] : undefined;
    return { type: b?.type, two: !!b?.twoHanded };
  }

  /** Sons d'ambiance de la zone (oiseaux, gouttes, vent…), tirés au hasard toutes les 6 à 15 s */
  private ambient(now: number): void {
    if (!this.d2 || now < this.nextAmbient) return;
    this.nextAmbient = now + 6000 + Math.random() * 9000;
    const groups = (M.MOOD_EVENTS[this.mood] ?? []).filter((g) => this.d2!.has(g));
    if (!groups.length) return;
    const g = groups[Math.floor(Math.random() * groups.length)];
    this.d2.warm(g);
    this.d2play(g, 0.55, 1, 0.03);
  }

  /** Un monstre proche « parle » de temps en temps (grognements, cris) */
  private neutral(w: World, now: number): void {
    if (!this.d2 || now < this.nextNeutral || w.zone.town) return;
    this.nextNeutral = now + 2500 + Math.random() * 3500;
    const p = w.player;
    const near = w.monsters.filter((m) => !m.dead && !m.isSummon && Math.hypot(m.x - p.x, m.y - p.y) < 14);
    if (!near.length) return;
    const m = near[Math.floor(Math.random() * near.length)];
    const g = M.monsterSound(this.has, m.def.id, 'NEUTRAL');
    if (g) {
      this.d2.warm(g);
      this.d2play(g, 0.4, 1, 0.05);
    }
  }

  onEvents(w: World, events: SimEvent[]): void {
    this.steps(w);
    const now = performance.now();
    this.ambient(now);
    this.neutral(w, now);
    const cls = w.character.classId;
    for (const e of events) {
      switch (e.t) {
        case 'cast': {
          if (e.id !== w.player.id) break;
          if (this.d2) {
            const sk = SKILL_BY_ID[e.skill];
            if (e.skill === 'attack' || sk?.melee) {
              const wp = this.weapon(w);
              if (this.throttle('swing', 90) && this.d2play(M.weaponSounds(this.has, wp.type, wp.two).swing, 0.5, 1, 0.06)) break;
            }
            if (this.throttle(`d2cast${e.skill}`, 80)) {
              const g = M.castSound(this.has, cls, e.skill, sk?.element);
              if (g) {
                this.d2?.warm(g);
                if (this.d2play(g, 0.7)) break;
              }
            }
          }
          // classes D2 : à défaut de son dédié, l'élément de la compétence donne la couleur du sort
          const el = CAST_ELEM[e.skill] ?? (SKILL_BY_ID[e.skill]?.element as Elem | undefined);
          if (el) this.cast(el);
          break;
        }
        case 'impact':
          if (this.d2 && this.throttle(`d2imp${e.kind}${e.elem}`, 60)) {
            const g = M.impactSound(this.has, cls, e.kind, e.elem, e.radius > 1);
            if (g) {
              this.d2.warm(g);
              if (this.d2play(g, e.radius > 1 ? 0.65 : 0.45)) break;
            }
          }
          this.impact(e.elem as Elem, e.radius > 1);
          break;
        case 'nova':
          if (this.d2 && this.throttle(`d2nova${e.kind}`, 80)) {
            const g = M.impactSound(this.has, cls, e.kind, e.elem, true);
            if (g && this.d2play(g, 0.7)) break;
          }
          this.impact(e.elem as Elem, true);
          break;
        case 'beam':
          if (this.d2 && this.throttle('d2beam', 80) && this.d2play(M.impactSound(this.has, cls, e.kind, e.elem, e.kind === 'thunder'), 0.6)) break;
          this.impact('light', e.kind === 'thunder');
          break;
        case 'hit':
          // coup porté à un monstre : bruit d'arme (le sang et les coups des sorts sont couverts par les impacts)
          if (!e.toPlayer && this.d2 && e.elem === 'phys' && this.throttle('d2hit', 70)) {
            const wp = this.weapon(w);
            this.d2play(M.weaponSounds(this.has, wp.type, wp.two).hit, 0.5, 1, 0.08);
          }
          if (this.d2 && !e.toPlayer && this.throttle('d2mhit', 140)) {
            const g = M.monsterSound(this.has, this.mdef(w, e.target) ?? '', 'HIT');
            if (g) {
              this.d2.warm(g);
              this.d2play(g, 0.45, 1, 0.05);
            }
          }
          break;
        case 'monsterAttack': {
          if (!this.d2 || !this.throttle('d2mattack', 100)) break;
          const g = M.monsterSound(this.has, this.mdef(w, e.id) ?? '', 'ATTACK');
          if (g) {
            this.d2.warm(g);
            this.d2play(g, 0.55, 1, 0.05);
          }
          break;
        }
        case 'playerHurt':
          if (this.d2 && this.throttle('d2voice', 900) && this.d2play(M.voiceSound(this.has, cls, 'HIT'), 0.7)) break;
          this.hitPlayer();
          break;
        case 'playerDeath':
          this.d2play(M.voiceSound(this.has, cls, 'DEATH'), 0.8);
          break;
        case 'death':
          if (this.d2 && e.rank === 'boss') {
            const st = M.BOSS_STINGER[this.mdef(w, e.id) ?? ''];
            if (st) void this.stinger(st);
          }
          if (this.d2 && this.throttle('d2death', 60)) {
            const g = M.monsterSound(this.has, this.mdef(w, e.id) ?? '', 'DEATH');
            if (g) {
              this.d2.warm(g);
              if (this.d2play(g, e.rank === 'boss' ? 0.9 : 0.55, 1, 0.05)) break;
            }
          }
          this.death(e.rank === 'boss');
          break;
        case 'bossSpawn': {
          const g = M.bossTaunt(this.has, this.mdef(w, e.id) ?? '');
          if (g) {
            this.d2?.warm(g);
            setTimeout(() => this.d2play(g, 0.9, 1, 0), 400);
          }
          break;
        }
        case 'itemDrop': {
          const gi = w.items.find((g) => g.item.uid === e.uid);
          const rune = !!gi && gi.item.base.startsWith('r') && gi.item.base.length === 3;
          if (this.d2 && this.throttle(`d2drop${e.tier}`, 60)) {
            const type = gi ? BASE_BY_ID[gi.item.base]?.type : undefined;
            const g = M.itemSound(this.has, type, rune);
            if (g) {
              this.d2.warm(g);
              if (this.d2play(g, 0.5 + 0.1 * Math.min(4, e.tier))) {
                if (e.tier >= 4 || (rune && e.tier >= 3)) this.drop(e.tier, rune);
                break;
              }
            }
          }
          this.drop(e.tier, rune);
          break;
        }
        case 'goldPickup':
          if (this.throttle('d2gold', 70) && this.d2play('ITEM_GOLD', 0.5)) break;
          this.gold();
          break;
        case 'pickup':
          if (this.throttle('d2pick', 70)) this.d2play('CURSOR_POINT_DROP', 0.35);
          break;
        case 'potion':
          if (this.d2play('ITEM_POTION_DRINK', 0.6)) break;
          this.potion();
          break;
        case 'levelUp':
          if (this.d2play('CURSOR_LEVEL_UP', 0.8, 1, 0)) break;
          this.levelUp();
          break;
        case 'teleport':
          if (e.id === w.player.id) {
            if (this.d2play('SORCERESS_TELEPORT', 0.6)) break;
            this.teleport();
          }
          break;
        case 'portalOpen':
          if (!this.d2play('PLAYER_TOWNPORTAL_CAST', 0.7, 1, 0)) this.d2play('OBJECT_TOWNPORTAL', 0.7, 1, 0);
          break;
        case 'shrine':
          this.d2play('OBJECT_SHRINE_HOLY', 0.7, 1, 0);
          break;
        case 'interact':
          if (e.kind === 'npc') {
            const who = ({ larzuk: 'LARZUK', malah: 'MALAH', anya: 'ANYA', qual_kehk: 'QUALKEHK' } as Record<string, string>)[e.ref ?? ''];
            if (who) {
              // phrase de l'acteur de D2 (voix d'Harrogath) quand elle est importée, sinon le salut des sons d'origine
              void this.npcVoice(e.ref ?? '').then((ok) => {
                if (ok) return;
                this.d2?.warm(`${who}_GREETING`);
                this.d2play(`${who}_GREETING`, 0.9, 1, 0);
              });
            }
          } else if (e.kind === 'portal') this.d2play('PLAYER_TOWNPORTAL_ENTER', 0.7, 1, 0);
          else if (e.kind === 'chest') this.d2play('OBJECT_CHEST_SMALL', 0.6);
          else if (e.kind === 'waypoint') this.d2play('OBJECT_STONE_LARGE', 0.5);
          break;
        case 'zoneEnter':
          this.zoneWarm = () => this.warmClass(cls);
          this.zoneWarm();
          // cartes : morceau choisi d'après le nom de la carte parmi ceux de l'ambiance
          this.trackOverride = e.zone === 'map' ? M.mapMusic(w.zone.mood, w.zone.name) : null;
          this.setMood(e.zone === 'harrogath' ? 'harrogath' : e.zone);
          {
            const warmClass = this.zoneWarm;
            const mood = this.mood;
            this.zoneWarm = () => {
              warmClass?.();
              this.warmZone(w, mood);
            };
            this.zoneWarm();
          }
          break;
      }
    }
  }
}

const CAST_ELEM: Record<string, Elem> = {
  fire_bolt: 'fire',
  fire_ball: 'fire',
  inferno: 'fire',
  meteor: 'fire',
  fire_wall: 'fire',
  combustion: 'fire',
  hydra: 'fire',
  lesser_hydra: 'fire',
  ice_bolt: 'cold',
  ice_blast: 'cold',
  glacial_spike: 'cold',
  frozen_orb: 'cold',
  blizzard: 'cold',
  frost_nova: 'cold',
  ice_barrage: 'cold',
  charged_bolt: 'light',
  lightning: 'light',
  chain_lightning: 'light',
  nova: 'light',
  static_field: 'light',
  telekinesis: 'light',
  // Druide : feu et froid comme la Sorcière, vent et coups de griffe en souffle (bruit filtré)
  firestorm: 'fire',
  molten_boulder: 'fire',
  eruption: 'fire',
  volcano: 'fire',
  armageddon: 'fire',
  arctic_blast: 'cold',
  hurricane: 'cold',
  cyclone_armor: 'phys',
  twister: 'phys',
  tornado: 'phys',
  shock_wave: 'phys',
  feral_rage: 'phys',
  maul: 'phys',
  rabies: 'phys',
  fire_claws: 'fire',
  hunger: 'phys',
  fury: 'phys',
  werewolf: 'magic',
  werebear: 'magic',
  raven: 'magic',
  plague_poppy: 'magic',
  cycle_of_life: 'magic',
  vines: 'magic',
  spirit_wolf: 'magic',
  summon_fenris: 'magic',
  grizzly: 'magic',
  oak_sage: 'magic',
  heart_wolverine: 'magic',
  spirit_barbs: 'magic',
};

/** Retour haptique (Vibration API ; absente sur iOS : on s'appuie alors sur l'écran et le son) */
export class Haptics {
  level: 0 | 1 | 2 = 1;
  private last = 0;
  vibrate(pattern: number | number[], important = false): void {
    if (!this.level || !('vibrate' in navigator)) return;
    const now = performance.now();
    if (now - this.last < 120 && !important) return;
    this.last = now;
    const k = this.level === 2 ? 1.6 : 1;
    const p = Array.isArray(pattern) ? pattern.map((x) => Math.round(x * k)) : Math.round(pattern * k);
    try {
      navigator.vibrate(p);
    } catch {
      /* non supporté */
    }
  }
  onEvents(events: SimEvent[]): void {
    for (const e of events) {
      if (e.t === 'itemDrop' && e.tier >= 3) this.vibrate(e.tier >= 4 ? [40, 60, 40, 60, 80] : [30, 40, 30], true);
      else if (e.t === 'levelUp') this.vibrate([20, 40, 60], true);
      else if (e.t === 'playerHurt' && e.pctOfMax > 0.15) this.vibrate(35);
      else if (e.t === 'playerDeath') this.vibrate([80, 60, 120], true);
    }
  }
}
