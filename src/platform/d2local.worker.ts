/// <reference lib="webworker" />
/**
 * Worker de génération locale des assets graphiques D2 (voir d2local.ts). Lit les MPQ par tranches (FileReaderSync), exécute les
 * exporteurs partagés de tools/d2import (récepteur = API Cache) : planches d'unités et de pièces d'équipement, décor, sols, effets,
 * icônes, interface. Un Worker dédié fait une tâche à la fois ; le service en lance plusieurs au besoin.
 *
 * Messages (entrée → sortie) :
 *   `generate` {files, ids, cache, prefix}      → `opened`, `sheet`*, `done`            (lot, écrit le manifeste ; contrôles)
 *   `catalog`  {files}                          → `opened`, `catalog`
 *   `open`     {files, cache, prefix}           → `opened` {ms, invalid, catalog, prints}  (session persistante)
 *   `job`      {jobId, id, tiers}               → `job-done` {jobId, report, entry?, kind?}  (un asset ; manifeste tenu par le service)
 *   `copy`     {files, dir}                     → `copy-progress`*, `copy-done` | `copy-error` (copie des MPQ dans OPFS)
 */
import { blobSource, openData, generateAsset, catalog, expandIds, looksLikeMpq, quickFingerprint } from '../../tools/d2import/browser';
import type { GameData } from '../../tools/d2import/data';
import { parseCopyState, type CopyState, type IntegrityFile } from './d2local-core';
import { COPY_CHUNK, CopyDamagedError, copyVerified, readExact, readFully, verifyAgainstCrc, verifyAgainstSource, writeFully } from '../../tools/d2import/io-core';
import { WebSink } from '../../tools/d2import/web-sink';
import { StreamScanner, checkArchive, finishCheck, openForCheck, type ArchiveCheck } from '../../tools/d2import/mpq-check';
import { inflateZlib } from '../../tools/d2import/inflate';

interface Req {
  type: 'generate' | 'catalog' | 'open' | 'job' | 'copy' | 'cancel' | 'verify' | 'drop' | 'testcorrupt' | 'check';
  /** check : contrôle d'intégrité (voir tools/d2import/mpq-check.ts) ; `save` consigne le résultat dans l'état de la copie (jamais pendant une copie) */
  mode?: 'quick' | 'full';
  save?: boolean;
  files: File[];
  ids?: string[];
  cache?: string;
  prefix?: string;
  jobId?: number;
  id?: string;
  tiers?: ('hi' | 'lo')[];
  /** test : échec simulé */
  testFail?: boolean;
  dir?: string;
  /** empreinte de chaque fichier à copier (une copie partielle d'une autre version n'est jamais reprise) */
  fps?: Record<string, string>;
  /** verify / drop : fichiers concernés ; testcorrupt : fichier, décalage, nombre d'octets */
  names?: string[];
  at?: number;
  n?: number;
  /** reprise d'une copie interrompue : nom → octets déjà écrits */
  resume?: Record<string, number>;
}

declare class FileReaderSync {
  readAsArrayBuffer(b: Blob): ArrayBuffer;
}

interface Session {
  data: GameData;
  c: Cache;
  prefix: string;
}
let session: Session | null = null;

const isQuota = (e: unknown): boolean => {
  const x = e as { name?: string; message?: string };
  return x?.name === 'QuotaExceededError' || /quota/i.test(x?.message ?? '');
};

/** Archives lisibles (signature MPQ) ; les autres sont signalées et ignorées */
function usable(files: File[]): { ok: File[]; invalid: string[] } {
  const rd = new FileReaderSync();
  const ok: File[] = [];
  const invalid: string[] = [];
  for (const f of files) {
    try {
      if (f.size >= 1024 && looksLikeMpq(new Uint8Array(rd.readAsArrayBuffer(f.slice(0, 2048))))) ok.push(f);
      else invalid.push(f.name);
    } catch {
      invalid.push(f.name);
    }
  }
  return { ok, invalid };
}

/** Écrit un petit fichier OPFS (remplace le contenu) */
async function writeSmall(dir: FileSystemDirectoryHandle, name: string, text: string): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const sah = await (fh as unknown as { createSyncAccessHandle(): Promise<SyncAccess> }).createSyncAccessHandle();
  try {
    const b = new TextEncoder().encode(text);
    sah.truncate(0);
    sah.write(b, { at: 0 });
    sah.flush();
  } finally {
    sah.close();
  }
}

interface SyncAccess {
  getSize(): number;
  truncate(n: number): void;
  read(b: ArrayBufferView, o: { at: number }): number;
  write(b: ArrayBufferView, o: { at: number }): number;
  flush(): void;
  close(): void;
}

/** Lit une plage d'un Blob (FileReaderSync) : une lecture courte est retentée une fois puis signalée */
const blobRead =
  (rd: FileReaderSync, f: Blob) =>
  (pos: number, len: number): Uint8Array =>
    readExact((p, l) => new Uint8Array(rd.readAsArrayBuffer(f.slice(p, p + l))), f.size, pos, len);

/** État de copie courant (deux fichiers alternés a/b) */
async function loadCopyState(dir: FileSystemDirectoryHandle): Promise<{ seq: number; state: CopyState }> {
  const readOne = async (n: string): Promise<string | null> => {
    try {
      return await (await (await dir.getFileHandle(n)).getFile()).text();
    } catch {
      return null;
    }
  };
  return parseCopyState(await readOne('copy.a.json'), await readOne('copy.b.json'));
}

/**
 * Copie des fichiers dans OPFS par morceaux (createSyncAccessHandle) avec reprise : l'état est consigné dans `copy.json`.
 * Écritures et lectures bouclées (retours partiels), puis relecture de la copie comparée à la source (« verifying ») ; l'indicateur `ver`
 * et les CRC par morceau sont consignés pour revérifier plus tard sans le fichier source.
 */
async function copyFiles(files: File[], dirName: string, fps: Record<string, string> = {}): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(dirName, { create: true });
  const prev = await loadCopyState(dir);
  const state: CopyState = prev.state;
  let seq = prev.seq + 1;
  const save = () => writeSmall(dir, seq % 2 ? 'copy.b.json' : 'copy.a.json', JSON.stringify({ seq: seq++, state }));
  const rd = new FileReaderSync();
  const total = files.reduce((a, f) => a + f.size, 0);
  let base = 0;
  for (const f of files) {
    const fh = await dir.getFileHandle(f.name, { create: true });
    const sah = await (fh as unknown as { createSyncAccessHandle(): Promise<SyncAccess> }).createSyncAccessHandle();
    try {
      const st = state[f.name];
      // une archive jugée incomplète n'est jamais « déjà copiée » : le joueur la choisit de nouveau parce qu'il en a une autre version, dont
      // l'empreinte rapide (début, milieu, fin) peut être identique
      const same = !!st && st.size === f.size && (st.fp ?? '') === (fps[f.name] ?? '') && st.chk?.status !== 'incomplete';
      if (same && st.ver && st.done === f.size && sah.getSize() === f.size && st.crc?.length === Math.ceil(f.size / COPY_CHUNK)) {
        base += f.size;
        self.postMessage({ type: 'copy-progress', name: f.name, done: f.size, size: f.size, all: base, total });
        // déjà copiée et vérifiée : le contrôle mémorisé sert tel quel, sinon un contrôle rapide (aucune lecture complète)
        let chk = st.chk && st.chk.size === f.size ? st.chk : undefined;
        if (!chk) {
          chk = checkArchive(f.name, { size: f.size, read: blobRead(rd, f) }, inflateZlib, { mode: 'quick' });
          state[f.name] = { ...st, chk };
          await save();
        }
        self.postMessage({ type: 'check-result', check: chk });
        continue;
      }
      // reprise : seulement ce qui est cohérent avec les CRC consignés ; sinon, on repart de zéro (ou on revérifie un fichier complet)
      let from = 0;
      let crcs: number[] = [];
      if (same && st.done <= sah.getSize()) {
        from = Math.min(st.done, f.size);
        crcs = st.crc ?? [];
        if (st.done === f.size && !st.crc) from = f.size; // copie complète sans CRC (version précédente) : relue et comparée
      }
      const src = { size: f.size, read: blobRead(rd, f) };
      // contrôle d'intégrité sur la lecture de la copie (aucune lecture de plus) : possible seulement depuis le début du fichier
      const t0 = performance.now();
      const opened = openForCheck(f.name, src, inflateZlib);
      let scanner: StreamScanner | null = from === 0 || (from === f.size && !st?.crc) ? new StreamScanner(f.size, opened.info, true) : null;
      const onChunk = (pos: number, buf: Uint8Array) => {
        if (!scanner) return;
        if (pos !== scanner.fed) scanner = null;
        else scanner.feed(pos, buf);
      };
      let last = 0;
      const progress = (done: number, verifying: boolean) => {
        const t = performance.now();
        if (t - last < 120 && done < f.size) return;
        last = t;
        self.postMessage({ type: 'copy-progress', name: f.name, done, size: f.size, all: base + done, total, verifying });
      };
      let res: { crcs: number[] };
      if (from === f.size && !st?.crc) {
        // complète sans empreintes : vérification seule, les CRC viennent de la source
        const c: number[] = [];
        verifyAgainstSource(src, sah, c, { onProgress: progress, onChunk });
        res = { crcs: c };
      } else {
        // un point de contrôle avance `done` ; les empreintes sont consignées avec lui (reprise cohérente)
        let pending: Promise<void> = Promise.resolve();
        res = copyVerified(src, sah, {
          from,
          crcs,
          onProgress: progress,
          onChunk,
          onCheckpoint: (done, c) => {
            state[f.name] = { size: f.size, done, fp: fps[f.name], crc: [...c] };
            pending = pending.then(save);
          },
        });
        await pending;
      }
      let chk: ArchiveCheck;
      if (scanner && (scanner as StreamScanner).fed === f.size) {
        const r = (scanner as StreamScanner).finish();
        chk = finishCheck({ name: f.name, size: f.size, opened, runs: r.runs, badHeaderBlocks: r.badHeaderBlocks, md5: r.md5, mode: 'full', ms: Math.round(performance.now() - t0) });
      } else chk = checkArchive(f.name, src, inflateZlib, { mode: 'quick' }); // copie reprise : pas de lecture complète, contrôle rapide
      state[f.name] = { size: f.size, done: f.size, fp: fps[f.name], crc: res.crcs, ver: true, chk };
      await save();
      self.postMessage({ type: 'check-result', check: chk });
    } catch (err) {
      if (err instanceof CopyDamagedError) {
        throw new Error(
          `File ${f.name} is damaged on this device: its copy does not match the original (offset ${err.offset}). Free some space, select the file again from another location (internal storage rather than a cloud or SD folder) and retry.`,
        );
      }
      throw err;
    } finally {
      sah.close();
    }
    base += f.size;
  }
}

/** Contrôle d'intégrité demandé (Réglages : « Vérification complète », ou contrôle rapide à l'ouverture) */
async function checkFiles(files: File[], dirName: string | undefined, mode: 'quick' | 'full', save: boolean): Promise<void> {
  const rd = new FileReaderSync();
  let dir: FileSystemDirectoryHandle | null = null;
  let prev: { seq: number; state: CopyState } | null = null;
  if (save && dirName) {
    try {
      dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(dirName);
      prev = await loadCopyState(dir);
    } catch {
      dir = null;
    }
  }
  const total = files.reduce((a, f) => a + f.size, 0);
  let base = 0;
  let last = 0;
  for (const f of files) {
    const chk = checkArchive(f.name, { size: f.size, read: blobRead(rd, f) }, inflateZlib, {
      mode,
      onProgress: (done) => {
        const t = performance.now();
        if (t - last < 150) return;
        last = t;
        self.postMessage({ type: 'check-progress', name: f.name, done: base + done, total });
      },
    });
    base += f.size;
    self.postMessage({ type: 'check-result', check: chk });
    const st = prev?.state[f.name];
    if (dir && prev && st && st.size === f.size) {
      st.chk = chk;
      await writeSmall(dir, (prev.seq + 1) % 2 ? 'copy.b.json' : 'copy.a.json', JSON.stringify({ seq: ++prev.seq, state: prev.state }));
    }
  }
}

/** Relit les copies et les compare aux empreintes enregistrées à la copie (sans le fichier source) */
async function verifyCopies(dirName: string, names?: string[]): Promise<IntegrityFile[]> {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(dirName);
  const { state } = await loadCopyState(dir);
  const rd = new FileReaderSync();
  const out: IntegrityFile[] = [];
  const list = Object.entries(state).filter(([n]) => !names || names.includes(n));
  const total = list.reduce((a, [, s]) => a + s.size, 0);
  let base = 0;
  for (const [name, st] of list) {
    let f: File;
    try {
      f = await (await dir.getFileHandle(name)).getFile();
    } catch {
      out.push({ name, status: 'missing' });
      base += st.size;
      continue;
    }
    if (f.size !== st.size || st.done !== st.size) out.push({ name, status: 'size' });
    else if (!st.ver || !st.crc) out.push({ name, status: 'unverified' });
    else {
      const bad = verifyAgainstCrc({ size: f.size, read: blobRead(rd, f) }, st.crc, COPY_CHUNK, (done) => self.postMessage({ type: 'verify-progress', name, done: base + done, total }));
      out.push(bad < 0 ? { name, status: 'ok' } : { name, status: 'damaged', chunk: bad, offset: bad * COPY_CHUNK });
    }
    base += st.size;
  }
  return out;
}

/** Supprime des fichiers copiés (et leur état) : la re-sélection les recopie avec vérification */
async function dropCopies(dirName: string, names: string[]): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(dirName);
  const prev = await loadCopyState(dir);
  for (const n of names) {
    delete prev.state[n];
    try {
      await dir.removeEntry(n);
    } catch {
      /* déjà absent */
    }
  }
  await writeSmall(dir, (prev.seq + 1) % 2 ? 'copy.b.json' : 'copy.a.json', JSON.stringify({ seq: prev.seq + 1, state: prev.state }));
}

/** Test seulement : altère des octets de la copie (simule une copie corrompue) */
async function corruptCopy(dirName: string, name: string, offset: number, n: number): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(dirName);
  const fh = await dir.getFileHandle(name);
  const sah = await (fh as unknown as { createSyncAccessHandle(): Promise<SyncAccess> }).createSyncAccessHandle();
  try {
    const b = new Uint8Array(n);
    readFully(sah, b, offset);
    for (let i = 0; i < n; i++) b[i] ^= 0xa5;
    writeFully(sah, b, offset);
    sah.flush();
  } finally {
    sah.close();
  }
}

/** travaux annulés par le service (les cartes vérifient entre deux morceaux) */
const cancelled = new Set<number>();

self.onmessage = async (e: MessageEvent<Req>) => {
  const { files, type } = e.data;
  if (type === 'cancel') {
    cancelled.add(e.data.jobId!);
    return;
  }
  try {
    if (type === 'copy') {
      try {
        await copyFiles(files, e.data.dir!, e.data.fps);
        self.postMessage({ type: 'copy-done' });
      } catch (err) {
        self.postMessage({ type: 'copy-error', quota: isQuota(err), message: (err as Error).message });
      }
      return;
    }
    if (type === 'check') {
      try {
        await checkFiles(files, e.data.dir, e.data.mode ?? 'quick', !!e.data.save);
        self.postMessage({ type: 'check-done' });
      } catch (err) {
        self.postMessage({ type: 'check-error', message: (err as Error).message });
      }
      return;
    }
    if (type === 'verify') {
      try {
        self.postMessage({ type: 'verify-done', results: await verifyCopies(e.data.dir!, e.data.names) });
      } catch (err) {
        self.postMessage({ type: 'verify-error', message: (err as Error).message });
      }
      return;
    }
    if (type === 'drop') {
      try {
        await dropCopies(e.data.dir!, e.data.names ?? []);
        self.postMessage({ type: 'drop-done' });
      } catch (err) {
        self.postMessage({ type: 'drop-error', message: (err as Error).message });
      }
      return;
    }
    if (type === 'testcorrupt') {
      try {
        await corruptCopy(e.data.dir!, e.data.names![0], e.data.at ?? 0, e.data.n ?? 16);
        self.postMessage({ type: 'testcorrupt-done' });
      } catch (err) {
        self.postMessage({ type: 'verify-error', message: (err as Error).message });
      }
      return;
    }
    if (type === 'job') {
      const s = session;
      const jobId = e.data.jobId!;
      const id = e.data.id!;
      if (!s) {
        self.postMessage({ type: 'job-done', jobId, report: { id, ok: false, ms: 0, files: 0, bytes: 0, warnings: [], error: 'session fermée' } });
        return;
      }
      const t1 = performance.now();
      let n = 0;
      let bytes = 0;
      const sink = new WebSink(async (path, b) => {
        n++;
        bytes += b.length;
        await s.c.put(`${s.prefix}${path}`, new Response(b as BodyInit));
      });
      try {
        const checkpoint = () => {
          if (cancelled.delete(jobId)) throw new Error('annulé');
        };
        if (e.data.testFail) throw new Error(`échec simulé (test) : ${id}`);
        const r = await generateAsset(s.data, id, sink, e.data.tiers ?? ['hi', 'lo'], checkpoint);
        cancelled.delete(jobId);
        self.postMessage({
          type: 'job-done',
          jobId,
          kind: r.kind,
          entry: r.entry,
          report: { id, ok: true, kind: r.kind, ms: Math.round(performance.now() - t1), files: n, bytes, warnings: r.warnings, info: r.info },
        });
      } catch (err) {
        cancelled.delete(jobId);
        self.postMessage({
          type: 'job-done',
          jobId,
          quota: isQuota(err),
          report: {
            id,
            ok: false,
            kind: 'sheet',
            ms: Math.round(performance.now() - t1),
            files: 0,
            bytes: 0,
            warnings: [],
            error: (err as Error).message,
            stack: String((err as Error).stack ?? '')
              .split('\n')
              .slice(0, 6)
              .join('\n'),
          },
        });
      }
      return;
    }
    if (type === 'open') {
      const t0 = performance.now();
      const { ok, invalid } = usable(files);
      const rd = new FileReaderSync();
      const prints = files.map((f) => ({ name: f.name, size: f.size, fp: invalid.includes(f.name) ? '' : quickFingerprint({ size: f.size, read: blobRead(rd, f) }) }));
      const data = openData(ok.map((f) => ({ name: f.name, source: blobSource(f) })));
      session = { data, c: await caches.open(e.data.cache!), prefix: e.data.prefix! };
      self.postMessage({ type: 'opened', ms: Math.round(performance.now() - t0), invalid, catalog: catalog(data), prints });
      return;
    }
    const t0 = performance.now();
    const data = openData(files.map((f) => ({ name: f.name, source: blobSource(f) })));
    self.postMessage({ type: 'opened', ms: Math.round(performance.now() - t0) });
    if (type === 'catalog') {
      self.postMessage({ type: 'catalog', catalog: catalog(data) });
      return;
    }
    const cache = e.data.cache!;
    const prefix = e.data.prefix!;
    const ids = expandIds(data, e.data.ids ?? []);
    const c = await caches.open(cache);
    const mk = `${prefix}manifest.json`;
    const prev = await c.match(mk);
    const manifest = prev ? await prev.json() : { version: 1, source: 'd2local', sheets: {}, tiles: {} };
    let files_ = 0;
    let bytes = 0;
    const sink = new WebSink(async (path, b) => {
      files_++;
      bytes += b.length;
      await c.put(`${prefix}${path}`, new Response(b as BodyInit));
    });
    for (const id of ids) {
      const t1 = performance.now();
      files_ = 0;
      bytes = 0;
      try {
        const r = await generateAsset(data, id, sink);
        if (r.kind === 'sheet') manifest.sheets[id] = r.entry;
        else if (r.kind === 'tile') manifest.tiles[id] = r.entry;
        self.postMessage({ type: 'sheet', report: { id, ok: true, kind: r.kind, ms: Math.round(performance.now() - t1), files: files_, bytes, warnings: r.warnings } });
      } catch (err) {
        self.postMessage({ type: 'sheet', report: { id, ok: false, kind: 'sheet', ms: Math.round(performance.now() - t1), files: 0, bytes: 0, warnings: [], error: (err as Error).message } });
      }
    }
    await c.put(mk, new Response(JSON.stringify(manifest)));
    self.postMessage({ type: 'done' });
  } catch (err) {
    self.postMessage({ type: 'error', message: (err as Error).message, quota: isQuota(err) });
  }
};
