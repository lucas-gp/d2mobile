/// <reference lib="webworker" />
/**
 * Worker de l'audio local (voir d2local-audio.ts) : lit les archives sonores du joueur par tranches (FileReaderSync) et produit à
 * la demande, avec les mêmes chemins que le dossier produit par l'importeur CLI (`audio/index.json`, `audio/pack-<propriétaire>.bin`, `audio/music-<clé>.mp3`…),
 * du WAV PCM décodé par tools/d2import/audio-build.ts. Chaque résultat est rangé dans l'API Cache : un son déjà décodé ne repasse
 * jamais par les archives (et reste disponible si les fichiers du joueur ne sont plus là).
 *
 * Messages : `open` {files, cache, prefix} → `opened` {names, ms} ; `read` {id, path, o?, l?} → `read-done` {id, bytes|null, ms, src}
 */
import { MpqCore, type ByteSource } from '../../tools/d2import/mpq-core';
import { inflateZlib } from '../../tools/d2import/inflate';
import { AudioBank, type AudioArchives } from '../../tools/d2import/audio-build';

declare class FileReaderSync {
  readAsArrayBuffer(b: Blob): ArrayBuffer;
}

interface Req {
  type: 'open' | 'read';
  files?: File[];
  cache?: string;
  prefix?: string;
  id?: number;
  path?: string;
  o?: number;
  l?: number;
}

let bank: AudioBank | null = null;
let cache: Cache | null = null;
let prefix = '';
/** clés déjà rangées dans le cache : évite un aller-retour (≈ 5 ms chacun, en file) pour chaque son jamais encore décodé */
let known = new Set<string>();

function source(f: File): ByteSource {
  const rd = new FileReaderSync();
  return {
    size: f.size,
    read: (pos, len) => new Uint8Array(rd.readAsArrayBuffer(f.slice(pos, pos + len))),
  };
}

function open(files: File[]): { arch: AudioArchives; names: string[] } {
  const by = new Map(files.map((f) => [f.name.toLowerCase(), f]));
  const names: string[] = [];
  const mk = (n: string): MpqCore | null => {
    const f = by.get(n);
    if (!f) return null;
    try {
      const m = new MpqCore(f.name, source(f), inflateZlib);
      names.push(n);
      return m;
    } catch {
      return null;
    }
  };
  const arch: AudioArchives = {
    sfx: mk('d2sfx.mpq'),
    speech: mk('d2speech.mpq'),
    xtalk: mk('d2xtalk.mpq'),
    music: mk('d2music.mpq'),
    data: ['d2exp.mpq', 'd2data.mpq'].map(mk).filter((m): m is MpqCore => !!m),
  };
  return { arch, names };
}

const keyOf = (path: string, o?: number, l?: number): string => `${prefix}${path}${o === undefined ? '' : `?r=${o}-${l}`}`;

self.onmessage = async (e: MessageEvent<Req>) => {
  const m = e.data;
  if (m.type === 'open') {
    const t0 = performance.now();
    prefix = m.prefix ?? '';
    try {
      cache = await caches.open(m.cache!);
      known = new Set((await cache.keys()).map((r) => r.url));
    } catch {
      cache = null;
      known = new Set();
    }
    const { arch, names } = open(m.files ?? []);
    const b = new AudioBank(arch);
    bank = b.hasAudio ? b : null;
    self.postMessage({ type: 'opened', names, ms: Math.round(performance.now() - t0) });
    return;
  }
  const id = m.id!;
  const t0 = performance.now();
  let dec = 0;
  const done = (bytes: Uint8Array | null, src: string) => {
    if (bytes) {
      const tight = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();
      (self as unknown as Worker).postMessage({ type: 'read-done', id, bytes: tight, ms: Math.round(performance.now() - t0), dec, src }, [tight.buffer as ArrayBuffer]);
    } else self.postMessage({ type: 'read-done', id, bytes: null, ms: Math.round(performance.now() - t0), dec, src });
  };
  const path = m.path!;
  const range = m.o === undefined ? undefined : ([m.o, m.l!] as [number, number]);
  try {
    const key = keyOf(path, m.o, m.l);
    const hit = cache && known.has(key) ? await cache.match(key) : undefined;
    if (hit) {
      done(new Uint8Array(await hit.arrayBuffer()), 'cache');
      return;
    }
    const t1 = performance.now();
    const out = bank?.read(path, range) ?? null;
    dec = Math.round((performance.now() - t1) * 10) / 10;
    if (out && cache) {
      // copie pour le cache : la sortie part en transfert vers la page
      known.add(key);
      void cache.put(key, new Response(out.slice(), { headers: { 'content-length': String(out.length) } })).catch(() => known.delete(key));
    }
    done(out, 'decode');
  } catch (err) {
    self.postMessage({ type: 'read-done', id, bytes: null, ms: Math.round(performance.now() - t0), src: 'error', error: (err as Error).message });
  }
};
