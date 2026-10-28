/**
 * Audio local : le joueur fournit d2sfx / d2speech / d2xtalk / d2music (facultatifs), des Web Workers lisent les archives par
 * tranches et fabriquent À LA DEMANDE les fichiers que le moteur audio réclame (`audio/index.json`, un son d'un paquet par plage
 * d'octets, une musique, une voix) : mêmes chemins que le dossier produit par l'importeur CLI, contenu en WAV PCM. Rien n'est décodé à l'avance.
 * Les résultats sont rangés dans l'API Cache `d2m-d2-audio` (clé `d2-audio/<chemin>`), invalidée par l'empreinte des
 * archives et la version du décodeur (comme les planches). Deux Workers : effets et voix d'un côté, musique de l'autre (un morceau
 * de 20 Mo stéréo ne fait pas attendre un coup d'épée).
 */

import { isAudioMpq } from './d2local-core';

import { D2_AUDIO_CACHE, deleteCache, primeStoreNames, storeName } from './storage-names';

const keyOf = (path: string, range?: [number, number]): string => new URL(`d2-audio/${path}${range ? `?r=${range[0]}-${range[1]}` : ''}`, new URL('./', location.href)).href;

export interface AudioStats {
  /** lectures servies / répondues vides */
  reads: number;
  misses: number;
  /** servies par le cache / par un décodage */
  cacheHits: number;
  decodes: number;
  /** octets produits et temps passé dans les Workers (ms), par type */
  bytes: number;
  decodeMs: number;
  cacheMs: number;
  /** temps de la plus longue lecture (ms) */
  slowest: number;
  /** détail par catégorie : sfx (plage d'un paquet), music, voice, index */
  byKind: Record<string, { n: number; ms: number; dec: number; bytes: number; cache: number }>;
  /** ouverture des archives (ms) du premier Worker */
  openMs: number;
}

interface Lane {
  w: Worker | null;
  ready: Promise<void> | null;
  pending: Map<number, (r: { bytes: Uint8Array | null; ms: number; dec: number; src: string }) => void>;
}

const kindOf = (path: string, range?: [number, number]): string =>
  path === 'audio/index.json' ? 'index' : path.startsWith('audio/music-') ? 'music' : path.startsWith('audio/pack-') ? (range ? 'sfx' : 'pack') : 'voice';

export class D2AudioLocal {
  private files: File[] = [];
  private lanes: Lane[] = [
    { w: null, ready: null, pending: new Map() },
    { w: null, ready: null, pending: new Map() },
  ];
  private seq = 1;
  /** des sons déjà décodés sont en cache (lisibles sans les fichiers) */
  hasCache = false;
  stats: AudioStats = { reads: 0, misses: 0, cacheHits: 0, decodes: 0, bytes: 0, decodeMs: 0, cacheMs: 0, slowest: 0, byKind: {}, openMs: 0 };
  /** noms des archives audio ouvertes par le Worker (diagnostic) */
  opened: string[] = [];

  get hasFiles(): boolean {
    return this.files.length > 0;
  }

  /** Le moteur audio peut espérer quelque chose : des archives, ou des sons déjà décodés en cache */
  get available(): boolean {
    return this.files.length > 0 || this.hasCache;
  }

  /** Nouvelles archives (ou plus aucune) : les Workers repartent de zéro */
  /** Archives sonores fournies (hors tables d2exp / d2data) : nom et taille */
  get fileList(): { name: string; size: number }[] {
    return this.files.filter((f) => isAudioMpq(f.name)).map((f) => ({ name: f.name, size: f.size }));
  }

  setFiles(files: File[]): void {
    this.files = files;
    for (const l of this.lanes) {
      l.w?.terminate();
      l.w = null;
      l.ready = null;
      for (const r of l.pending.values()) r({ bytes: null, ms: 0, dec: 0, src: 'closed' });
      l.pending.clear();
    }
  }

  private lane(i: number): Lane {
    const l = this.lanes[i];
    if (l.w) return l;
    const w = new Worker(new URL('./d2audio.worker.ts', import.meta.url), { type: 'module' });
    l.w = w;
    l.ready = new Promise<void>((resolve) => {
      w.onmessage = (e: MessageEvent) => {
        const m = e.data as { type: string; id?: number; bytes?: Uint8Array | null; ms?: number; dec?: number; src?: string; names?: string[] };
        if (m.type === 'opened') {
          if (i === 0) {
            this.stats.openMs = m.ms as number;
            this.opened = m.names ?? [];
          }
          resolve();
        } else if (m.type === 'read-done') {
          const cb = l.pending.get(m.id!);
          l.pending.delete(m.id!);
          cb?.({ bytes: m.bytes ?? null, ms: m.ms ?? 0, dec: m.dec ?? 0, src: m.src ?? '' });
        }
      };
      w.onerror = () => {
        for (const r of l.pending.values()) r({ bytes: null, ms: 0, dec: 0, src: 'error' });
        l.pending.clear();
        resolve();
      };
    });
    w.postMessage({ type: 'open', files: this.files, cache: storeName(D2_AUDIO_CACHE), prefix: keyOf('') });
    return l;
  }

  /** Octets d'un fichier du dossier `audio/` (ou d'une plage d'un paquet) ; null s'il n'existe pas ou n'est pas disponible */
  async read(path: string, range?: [number, number]): Promise<Uint8Array | null> {
    if (!this.available) return null;
    const l = this.lane(path.startsWith('audio/music-') ? 1 : 0);
    await l.ready;
    if (!l.w) return null;
    const id = this.seq++;
    const res = await new Promise<{ bytes: Uint8Array | null; ms: number; dec: number; src: string }>((resolve) => {
      l.pending.set(id, resolve);
      l.w!.postMessage({ type: 'read', id, path, o: range?.[0], l: range?.[1] });
    });
    const k = kindOf(path, range);
    const s = this.stats;
    s.reads++;
    const slot = (s.byKind[k] ??= { n: 0, ms: 0, dec: 0, bytes: 0, cache: 0 });
    slot.n++;
    slot.ms += res.ms;
    slot.dec += res.dec;
    if (!res.bytes) {
      s.misses++;
      return null;
    }
    slot.bytes += res.bytes.length;
    s.bytes += res.bytes.length;
    s.slowest = Math.max(s.slowest, res.ms);
    if (res.src === 'cache') {
      s.cacheHits++;
      s.cacheMs += res.ms;
      slot.cache++;
    } else {
      s.decodes++;
      s.decodeMs += res.ms;
    }
    return res.bytes;
  }

  /** Efface les sons décodés (les archives restent) */
  async clear(): Promise<void> {
    this.hasCache = false;
    await deleteCache(D2_AUDIO_CACHE);
    this.setFiles(this.files);
  }

  /** Octets des sons décodés en cache (somme des `content-length` posés à l'écriture : aucun corps relu) */
  async cacheBytes(): Promise<number> {
    if (typeof caches === 'undefined') return 0;
    try {
      await primeStoreNames();
      const c = await caches.open(storeName(D2_AUDIO_CACHE));
      let n = 0;
      for (const r of await c.keys()) n += Number((await c.match(r))?.headers.get('content-length') ?? 0);
      return n;
    } catch {
      return 0;
    }
  }
}
