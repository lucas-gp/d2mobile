/**
 * Musique par Web Audio uniquement (AudioBuffer + AudioBufferSourceNode), sans élément <audio> ni MediaSession :
 * Android/Chrome n'affiche alors aucune carte « lecteur média » dans les notifications et ne prend pas le focus audio
 * (Spotify & co. continuent de jouer). Une seule piste décodée à la fois en lecture (plus la précédente en cache pour un
 * retour instantané), décodage en mono 22 050 Hz (les MP3 importés sont à cette fréquence : 88 Ko/s de PCM).
 */

/** Fréquence de décodage (celle des MP3 importés, tools/d2audio/music.py) */
const MUSIC_RATE = 22050;
/** Débit des MP3 importés (48 kb/s) : sert à estimer la durée sans les décoder */
const MUSIC_KBPS = 48;
/** Au-delà de cette taille de PCM décodé (mono float32), la piste n'est pas jouée plutôt que de risquer de tuer l'onglet */
export const MUSIC_MAX_PCM = 64 * 1048576;
/** Pistes décodées gardées en mémoire (courante + précédente) */
const MUSIC_CACHE = 2;
export const FADE_IN = 2.5;
const FADE_OUT = 2;

/** Taille du PCM mono float32 décodé pour un MP3 de `bytes` octets */
export function estimatePcmBytes(bytes: number, kbps = MUSIC_KBPS, rate = MUSIC_RATE): number {
  return Math.ceil(((bytes * 8) / (kbps * 1000)) * rate * 4);
}

/** Vrai si la piste peut être décodée sans dépasser la garde mémoire */
export function fitsMemory(bytes: number): boolean {
  return estimatePcmBytes(bytes) <= MUSIC_MAX_PCM;
}

/** Taille du PCM float32 décodé pour des octets de musique : WAV (mode local : mono 16 bits, lu dans l'en-tête) ou MP3 (estimation par le débit) */
export function pcmBytesOf(bytes: Uint8Array): number {
  if (bytes.length > 44 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    const ch = Math.max(1, bytes[22]);
    return Math.ceil(((bytes.length - 44) / (2 * ch)) * ch * 4);
  }
  return estimatePcmBytes(bytes.length);
}

/** Vrai si la piste (MP3 ou WAV) peut être décodée sans dépasser la garde mémoire */
export function fitsMemoryBytes(bytes: Uint8Array): boolean {
  return pcmBytesOf(bytes) <= MUSIC_MAX_PCM;
}

/** Décode un MP3 ou un WAV à 22 050 Hz (OfflineAudioContext : rééchantillonne au décodage, évite 48 kHz = 2× la mémoire) */
export async function decodeMusic(ctx: BaseAudioContext, bytes: Uint8Array): Promise<AudioBuffer> {
  const copy = bytes.slice().buffer as ArrayBuffer;
  const Off = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  const target: BaseAudioContext = Off ? new Off(1, 1, MUSIC_RATE) : ctx;
  return target.decodeAudioData(copy);
}

/** Partie de AudioContext utilisée (permet un faux contexte dans les tests) */
interface MusicCtx {
  readonly currentTime: number;
  createGain(): GainNode;
  createBufferSource(): AudioBufferSourceNode;
}

export interface MusicDeps {
  ctx: MusicCtx;
  out: AudioNode;
  has(key: string): boolean;
  /** Octets MP3 du morceau (déjà déchiffrés) ; null s'il n'existe pas */
  read(key: string): Promise<Uint8Array | null>;
  decode(bytes: Uint8Array): Promise<AudioBuffer>;
}

interface Playing {
  key: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export class MusicPlayer {
  private cur: Playing | null = null;
  private cache = new Map<string, AudioBuffer>();
  private inflight = new Map<string, Promise<AudioBuffer | null>>();
  private token = 0;
  private level = 0;
  private wanted = '';
  /** Compteurs de diagnostic (tests) */
  stats = { decoded: 0, started: 0, refused: 0 };

  constructor(private readonly d: MusicDeps) {}

  get currentKey(): string | null {
    return this.cur?.key ?? null;
  }

  get cached(): string[] {
    return [...this.cache.keys()];
  }

  /** Volume de la musique (0 = rien n'est lu ni décodé : on libère tout) */
  setLevel(level: number): void {
    const was = this.level;
    this.level = Math.max(0, level);
    const c = this.d.ctx;
    if (this.level <= 0) {
      this.token++;
      this.stopCurrent(0.05);
      this.cache.clear();
      this.inflight.clear();
      return;
    }
    if (this.cur) {
      this.cur.gain.gain.cancelScheduledValues(c.currentTime);
      this.cur.gain.gain.setTargetAtTime(this.level, c.currentTime, 0.1);
    } else if (was <= 0 && this.wanted) void this.play(this.wanted);
  }

  /** Charge un morceau en arrière-plan (sans le jouer) ; ignoré si le volume est nul */
  preload(key: string): void {
    if (this.level > 0 && this.d.has(key)) void this.buffer(key);
  }

  private async buffer(key: string): Promise<AudioBuffer | null> {
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit); // le plus récent en dernier
      return hit;
    }
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const job = (async () => {
      const bytes = await this.d.read(key);
      if (!bytes || this.level <= 0) return null;
      if (!fitsMemoryBytes(bytes)) {
        this.stats.refused++;
        return null;
      }
      const buf = await this.d.decode(bytes);
      this.stats.decoded++;
      if (this.level <= 0) return null;
      this.cache.set(key, buf);
      while (this.cache.size > MUSIC_CACHE) {
        const oldest = [...this.cache.keys()].find((k) => k !== key && k !== this.cur?.key);
        if (oldest === undefined) break;
        this.cache.delete(oldest);
      }
      return buf;
    })()
      .catch(() => null)
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, job);
    return job;
  }

  /** Joue le morceau en boucle, avec fondu enchaîné depuis le précédent */
  async play(key: string): Promise<void> {
    this.wanted = key;
    if (this.level <= 0 || !this.d.has(key) || this.cur?.key === key) return;
    const token = ++this.token;
    const buf = await this.buffer(key);
    if (!buf || token !== this.token || this.level <= 0) return;
    const c = this.d.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(this.level, c.currentTime + FADE_IN);
    src.connect(gain).connect(this.d.out);
    src.start();
    this.stats.started++;
    this.stopCurrent(FADE_OUT);
    this.cur = { key, src, gain };
  }

  private stopCurrent(fade: number): void {
    const old = this.cur;
    this.cur = null;
    if (!old) return;
    const c = this.d.ctx;
    const t = c.currentTime;
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setValueAtTime(old.gain.gain.value, t);
    old.gain.gain.linearRampToValueAtTime(0, t + fade);
    try {
      old.src.stop(t + fade + 0.1);
    } catch {
      /* déjà arrêtée */
    }
    old.src.onended = () => {
      old.src.disconnect();
      old.gain.disconnect();
    };
  }

  /** Baisse la musique de zone le temps d'une phrase musicale (mort d'un boss) puis la remonte */
  duck(ratio: number, seconds: number): void {
    const m = this.cur;
    if (!m) return;
    const c = this.d.ctx;
    const now = c.currentTime;
    m.gain.gain.cancelScheduledValues(now);
    m.gain.gain.setValueAtTime(m.gain.gain.value, now);
    m.gain.gain.linearRampToValueAtTime(this.level * ratio, now + 0.5);
    m.gain.gain.setValueAtTime(this.level * ratio, now + seconds);
    m.gain.gain.linearRampToValueAtTime(this.level, now + seconds + 2);
  }

  /** Phrase musicale ponctuelle (non bouclée, non mise en cache) ; renvoie sa durée en secondes ou 0 */
  async stinger(key: string, vol: number): Promise<number> {
    if (this.level <= 0 || !this.d.has(key)) return 0;
    const bytes = await this.d.read(key);
    if (!bytes || this.level <= 0 || !fitsMemoryBytes(bytes)) return 0;
    const buf = await this.d.decode(bytes);
    this.stats.decoded++;
    const c = this.d.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    gain.gain.value = vol;
    src.connect(gain).connect(this.d.out);
    src.onended = () => {
      src.disconnect();
      gain.disconnect();
    };
    src.start();
    return buf.duration;
  }
}

/**
 * Musique du menu (avant que le moteur audio n'existe) en Web Audio : contexte créé au premier geste, aucun élément média.
 * Rien n'est lu ni décodé si le volume de musique est 0. Renvoie l'arrêt (fondu puis fermeture du contexte).
 */
export function startMenuMusic(read: () => Promise<Uint8Array | null>, musicVolume: () => number): () => void {
  let stopped = false;
  let ctx: AudioContext | null = null;
  let gain: GainNode | null = null;
  let src: AudioBufferSourceNode | null = null;
  let bytes: Uint8Array | null = null;
  let loading = false;
  const level = () => (musicVolume() > 0 ? 0.35 : 0);
  const start = async () => {
    if (stopped || loading || src || level() <= 0 || !bytes) return;
    loading = true;
    try {
      const Ctx = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctx) return;
      ctx ??= new Ctx();
      void ctx.resume();
      const buf = await decodeMusic(ctx, bytes);
      if (stopped) return;
      gain = ctx.createGain();
      gain.gain.value = level();
      gain.connect(ctx.destination);
      src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gain);
      src.start();
    } catch {
      /* pas de musique de menu */
    } finally {
      loading = false;
    }
  };
  const onGesture = () => void start();
  if (level() > 0) {
    void read().then((b) => {
      bytes = b;
      if (b && !stopped) {
        document.addEventListener('pointerdown', onGesture, { once: true });
        document.addEventListener('keydown', onGesture, { once: true });
      }
    });
  }
  return () => {
    stopped = true;
    document.removeEventListener('pointerdown', onGesture);
    document.removeEventListener('keydown', onGesture);
    const c = ctx;
    const g = gain;
    const s = src;
    if (!c) return;
    if (g && s) {
      g.gain.setValueAtTime(g.gain.value, c.currentTime);
      g.gain.linearRampToValueAtTime(0, c.currentTime + 0.6);
      setTimeout(() => {
        try {
          s.stop();
        } catch {
          /* arrêtée */
        }
        void c.close();
      }, 700);
    } else void c.close();
  };
}
