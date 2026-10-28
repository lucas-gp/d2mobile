/**
 * Contrôle d'intégrité d'une archive MPQ fournie par le joueur (sans Node ni navigateur : partagé par le Worker, le CLI et les tests).
 *
 * But précis : détecter une archive TRONQUÉE ou PRÉALLOUÉE À ZÉRO (téléchargement interrompu : le fichier a la bonne taille mais une zone est
 * vide), AVANT la fabrication des graphismes, et dire où (octets, nombre de fichiers touchés, quelques noms). Deux modes :
 *
 *  - `full` : une lecture séquentielle de TOUT le fichier (morceaux de 8 Mo, le même passage que la copie) : MD5, plages d'octets nuls
 *    d'au moins 64 Ko, et début de chaque bloc compressé. GARANTI : toute zone nulle de 64 Ko ou plus est trouvée, ainsi que tout bloc compressé
 *    dont les premiers octets (table des secteurs) sont nuls. NON GARANTI : un octet altéré sans zone nulle (autre corruption) ; le MD5 le dirait.
 *  - `quick` : en-tête, tables, cohérence des blocs et sondages de 4 Ko tous les 256 Ko. GARANTI : toute zone nulle d'au moins 260 Ko, la queue
 *    du fichier tronquée, les tables illisibles. NON GARANTI : une zone nulle de 64 à 260 Ko, un bloc isolé abîmé, le MD5 (non calculé).
 *
 * Un MD5 différent de la distribution de référence n'est JAMAIS une erreur (autres éditions légitimes de Diablo II) : voir `md5Verdict`.
 */
import { MpqCore, type ByteSource, type Inflate, type MpqBlockInfo, type MpqInfo } from './mpq-core';
import { Md5 } from './md5';

/** Une zone nulle plus courte n'est pas signalée (des fichiers sains contiennent des remplissages) */
export const ZERO_RUN_MIN = 65536;
/** Morceau de lecture du passage complet */
export const SCAN_CHUNK = 8 * 1024 * 1024;
/** Sondage du mode rapide : 4 Ko tous les 256 Ko */
export const QUICK_STRIDE = 256 * 1024;
export const QUICK_PROBE = 4096;
const MAX_RUNS = 4000;

/**
 * MD5 de la distribution de référence (UNE édition de détail précise de Diablo II LoD). D'autres
 * éditions légitimes (1.13c, 1.14d, disque d'origine) ont des archives différentes : une différence est une simple indication.
 * Patch_D2.mpq et les patchs Project Diablo 2 n'ont pas de MD5 de référence connue.
 */
export const REFERENCE_MD5: Readonly<Record<string, string>> = {
  'd2data.mpq': '68b2f1581d226663ff08bc65372d93cc',
  'd2exp.mpq': 'a0e9ad984a451418bd2123a67d0792f8',
  'd2char.mpq': 'bc5a5df64ee9d3097d9b7871652425fc',
  'd2music.mpq': 'aa8c48ccceb90b61e7759d37db7ac7ff',
  'd2sfx.mpq': 'a1fa55c79bc849e829969e0cd62a31e4',
  'd2speech.mpq': 'bf688579527b511f9ba5f51554cf8bd2',
  'd2xtalk.mpq': '76904388d3d33e47e40163c203b332aa',
  'd2video.mpq': 'f2c71d8de2763837cfa4064f0f32f381',
};

/** `reference` : identique à la distribution de référence ; `different` : autre version (OK si votre édition est autre) ; `unknown` : pas de référence ou MD5 non calculé */
export type Md5Verdict = 'reference' | 'different' | 'unknown';

export function md5Verdict(name: string, md5: string | undefined): Md5Verdict {
  const ref = REFERENCE_MD5[name.toLowerCase()];
  if (!ref || !md5) return 'unknown';
  return ref === md5.toLowerCase() ? 'reference' : 'different';
}

export type CheckStatus = 'ok' | 'suspect' | 'incomplete' | 'unrecognized';
export type CheckReason = 'ok' | 'zeros' | 'truncated' | 'headers' | 'tables' | 'rawzeros' | 'notmpq' | 'unreadable';

export interface ZeroRun {
  start: number;
  end: number;
}

export interface CheckZone {
  /** octets, fin exclue */
  from: number;
  to: number;
  /** fichiers (blocs) concernés */
  files: number;
  /** quelques noms (chemins réduits, par ordre de position) */
  names: string[];
}

export interface ArchiveCheck {
  name: string;
  size: number;
  status: CheckStatus;
  reason: CheckReason;
  mode: 'quick' | 'full';
  /** MD5 (mode complet seulement) */
  md5?: string;
  /** première zone fautive */
  zone?: CheckZone;
  /** nombre de zones fautives et de fichiers touchés (toutes zones) */
  zones: number;
  affected: number;
  /** blocs compressés dont le début est nul */
  badHeaders: number;
  /** détail technique (anglais) pour le diagnostic */
  note?: string;
  ms: number;
  at: number;
}

/* -------------------------------------------------------------------------- */
/* Passage séquentiel : MD5, plages nulles, début des blocs                    */
/* -------------------------------------------------------------------------- */

export interface ScanResult {
  runs: ZeroRun[];
  runCount: number;
  md5?: string;
  /** blocs compressés dont les 4 premiers octets sont nuls */
  badHeaderBlocks: number[];
  bytes: number;
}

/** Blocs dont le début doit être non nul : compressés par secteurs (table des secteurs d'abord) ou en bloc unique réellement compressé */
const headerCheckable = (b: MpqBlockInfo): boolean => b.compressed && !b.encrypted && b.size > 0 && b.csize >= 4 && (!b.single || b.csize < b.size);

export class StreamScanner {
  private md5: Md5 | null;
  private runs: ZeroRun[] = [];
  private runCount = 0;
  private cur = -1;
  private trail = 0;
  private pos = 0;
  private elig: MpqBlockInfo[];
  private bi = 0;
  private carry = new Uint8Array(3);
  private carryAt = 0;
  private bad: number[] = [];

  constructor(
    readonly size: number,
    info: MpqInfo | null,
    withMd5 = true,
  ) {
    this.md5 = withMd5 ? new Md5() : null;
    this.elig = info ? info.blocks.filter(headerCheckable).sort((a, b) => a.pos - b.pos) : [];
  }

  get fed(): number {
    return this.pos;
  }

  private emit(start: number, end: number): void {
    if (end - start < ZERO_RUN_MIN) return;
    this.runCount++;
    if (this.runs.length < MAX_RUNS) this.runs.push({ start, end });
  }

  /** Morceau suivant (contigu : `offset` = octets déjà fournis) ; le tampon n'est pas conservé */
  feed(offset: number, b: Uint8Array): void {
    if (offset !== this.pos) throw new Error(`scan: non-contiguous chunk (${offset} after ${this.pos})`);
    const n = b.length;
    if (!n) return;
    this.md5?.update(b);
    // plages nulles : blocs de 4 Ko, premier octet non nul cherché par mots de 32 bits quand le tampon est aligné
    const w = b.byteOffset % 4 === 0 ? new Uint32Array(b.buffer, b.byteOffset, n >> 2) : null;
    for (let i = 0; i < n;) {
      const e = Math.min(n, i + 4096);
      let f = i;
      if (w) {
        while (f + 4 <= e && w[f >> 2] === 0) f += 4;
      }
      while (f < e && b[f] === 0) f++;
      if (f === e) {
        if (this.cur < 0) this.cur = offset + i - this.trail;
        this.trail += e - i;
      } else {
        if (this.cur >= 0) {
          this.emit(this.cur, offset + f);
          this.cur = -1;
        }
        let t = e;
        while (t > f && b[t - 1] === 0) t--;
        this.trail = e - t;
      }
      i = e;
    }
    // début des blocs compressés
    const end = offset + n;
    while (this.bi < this.elig.length && this.elig[this.bi].pos + 4 <= end) {
      const blk = this.elig[this.bi++];
      const p = blk.pos;
      let z: boolean;
      if (p >= offset) z = b[p - offset] === 0 && b[p - offset + 1] === 0 && b[p - offset + 2] === 0 && b[p - offset + 3] === 0;
      else if (p >= this.carryAt) {
        // le bloc commence dans les derniers octets du morceau précédent
        const get = (k: number) => (p + k < offset ? this.carry[p + k - this.carryAt] : b[p + k - offset]);
        z = get(0) === 0 && get(1) === 0 && get(2) === 0 && get(3) === 0;
      } else z = false;
      if (z) this.bad.push(blk.index);
    }
    const keep = Math.min(3, n);
    this.carry.set(b.subarray(n - keep), 0);
    this.carryAt = end - keep;
    this.pos = end;
  }

  finish(): ScanResult {
    if (this.cur >= 0) this.emit(this.cur, this.pos);
    this.cur = -1;
    return { runs: this.runs, runCount: this.runCount, md5: this.md5?.hex(), badHeaderBlocks: this.bad, bytes: this.pos };
  }
}

/* -------------------------------------------------------------------------- */
/* Mode rapide : sondages                                                      */
/* -------------------------------------------------------------------------- */

const allZero = (b: Uint8Array): boolean => {
  for (let i = 0; i < b.length; i++) if (b[i] !== 0) return false;
  return true;
};

/**
 * Sondages de 4 Ko tous les 256 Ko (et la fin du fichier) ; un sondage nul est prolongé de part et d'autre jusqu'aux limites exactes de la plage.
 * Trouve toute zone nulle d'au moins `stride + probe` octets ; les plages de 64 Ko ou plus seulement sont rapportées.
 */
export function probeZeroRuns(src: ByteSource, o: { stride?: number; probe?: number; onProgress?: (done: number) => void; cancelled?: () => boolean } = {}): ZeroRun[] {
  const stride = o.stride ?? QUICK_STRIDE;
  const probe = o.probe ?? QUICK_PROBE;
  const size = src.size;
  const runs: ZeroRun[] = [];
  const EXT = 1 << 20;
  const points: number[] = [];
  for (let p = 0; p < size; p += stride) points.push(p);
  points.push(Math.max(0, size - probe));
  let skipTo = 0;
  for (const p of points) {
    if (o.cancelled?.()) throw new Error('cancelled');
    if (p < skipTo) continue;
    const len = Math.min(probe, size - p);
    if (len <= 0) continue;
    if (!allZero(src.read(p, len))) {
      o.onProgress?.(p);
      continue;
    }
    // prolonge vers l'avant puis vers l'arrière
    let end = p + len;
    for (; end < size;) {
      const l = Math.min(EXT, size - end);
      const b = src.read(end, l);
      let f = 0;
      while (f < b.length && b[f] === 0) f++;
      end += f;
      if (f < b.length) break;
    }
    let start = p;
    while (start > 0) {
      const l = Math.min(EXT, start);
      const b = src.read(start - l, l);
      let f = b.length;
      while (f > 0 && b[f - 1] === 0) f--;
      start -= b.length - f;
      if (f > 0) break;
    }
    if (end - start >= ZERO_RUN_MIN) runs.push({ start, end });
    skipTo = end;
    o.onProgress?.(p);
  }
  return runs;
}

/* -------------------------------------------------------------------------- */
/* Classement                                                                  */
/* -------------------------------------------------------------------------- */

/** Nom d'affichage réduit : deux derniers éléments du chemin, sans extension (charselect/charselectbckg) */
export function shortName(path: string): string {
  const parts = path.replace(/\\/g, '/').toLowerCase().split('/').filter(Boolean);
  const last = parts.slice(-2);
  if (last.length) last[last.length - 1] = last[last.length - 1].replace(/\.[a-z0-9]{1,4}$/, '');
  return last.join('/');
}

export interface Opened {
  core: MpqCore | null;
  info: MpqInfo | null;
  error?: string;
  /** taille annoncée par l'en-tête quand les tables ne sont pas lisibles (fichier plus court : téléchargement interrompu) */
  expectedSize?: number;
}

export function openForCheck(name: string, src: ByteSource, inflate: Inflate): Opened {
  try {
    const core = new MpqCore(name, src, inflate);
    return { core, info: core.info() };
  } catch (e) {
    let expectedSize: number | undefined;
    try {
      const h = src.read(0, Math.min(32, src.size));
      if (h.length >= 12 && h[0] === 0x4d && h[1] === 0x50 && h[2] === 0x51 && h[3] === 0x1a) expectedSize = new DataView(h.buffer, h.byteOffset, h.byteLength).getUint32(8, true);
    } catch {
      /* en-tête illisible */
    }
    return { core: null, info: null, error: (e as Error).message, expectedSize };
  }
}

const overlap = (a0: number, a1: number, b0: number, b1: number): number => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** Blocs (triés par position) qui recouvrent la plage [start, end) d'au moins `min` octets */
function blocksIn(sorted: MpqBlockInfo[], start: number, end: number, min = 16): MpqBlockInfo[] {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].pos < end) lo = mid + 1;
    else hi = mid;
  }
  const out: MpqBlockInfo[] = [];
  // on remonte tant que des blocs peuvent encore atteindre `start` (les blocs se suivent : arrêt dès que la fin passe en deçà, avec une marge)
  for (let k = lo - 1, miss = 0; k >= 0 && miss < 8; k--) {
    const b = sorted[k];
    if (overlap(b.pos, b.pos + b.csize, start, end) >= Math.min(min, b.csize)) {
      out.push(b);
      miss = 0;
    } else miss++;
  }
  return out.reverse();
}

export interface FinishInput {
  name: string;
  size: number;
  opened: Opened;
  runs: ZeroRun[];
  badHeaderBlocks?: number[];
  md5?: string;
  mode: 'quick' | 'full';
  ms: number;
}

/** Résultat d'un contrôle à partir de ce qui a été lu (la même fonction sert au mode rapide, au passage complet et à la copie) */
export function finishCheck(inp: FinishInput): ArchiveCheck {
  const { name, size, opened, runs } = inp;
  const out: ArchiveCheck = { name, size, status: 'ok', reason: 'ok', mode: inp.mode, md5: inp.md5, zones: 0, affected: 0, badHeaders: inp.badHeaderBlocks?.length ?? 0, ms: inp.ms, at: Date.now() };
  const info = opened.info;
  if (!info) {
    // tables illisibles : si une plage nulle atteint la fin du fichier (ou couvre sa fin), c'est une copie vide/préallouée ; sinon fichier non reconnu
    const tail = [...runs].reverse().find((r) => r.end >= size);
    const first = runs[0];
    if (tail || first) {
      const r = tail ?? first;
      out.status = 'incomplete';
      out.reason = 'zeros';
      out.zones = runs.length;
      out.zone = { from: r.start, to: r.end, files: 0, names: [] };
      out.note = `tables unreadable (${opened.error ?? '?'}); empty from ${r.start} to ${r.end}`;
      return out;
    }
    if (opened.expectedSize && size < opened.expectedSize) {
      out.status = 'incomplete';
      out.reason = 'truncated';
      out.zone = { from: size, to: opened.expectedSize, files: 0, names: [] };
      out.zones = 1;
      out.note = `file is ${size} bytes, header announces ${opened.expectedSize}; tables unreadable (${opened.error ?? '?'})`;
      return out;
    }
    const sig = /signature/i.test(opened.error ?? '');
    out.status = 'unrecognized';
    out.reason = sig ? 'notmpq' : 'unreadable';
    out.note = opened.error;
    return out;
  }
  // tables dans une plage nulle qui atteint la fin du fichier : téléchargement préalloué jamais terminé (les tables déchiffrées sont du bruit,
  // inutile d'en tirer des fichiers « touchés »)
  const tail = runs.find((r) => r.end >= size);
  if (tail && (info.base + info.hashPos >= tail.start || info.base + info.blockPos >= tail.start)) {
    out.status = 'incomplete';
    out.reason = 'zeros';
    out.zones = runs.length;
    out.zone = { from: tail.start, to: size, files: 0, names: [] };
    out.note = 'hash/block tables lie in an empty area that reaches the end of the file';
    return out;
  }
  const sorted = [...info.blocks].sort((a, b) => a.pos - b.pos);
  const notes: string[] = [];
  const faults: { from: number; to: number; blocks: MpqBlockInfo[]; reason: CheckReason; sev: number }[] = [];

  // fichier plus court que l'archive annoncée / blocs au-delà de la fin
  if (info.archiveSize > 0 && info.base + info.archiveSize > size) {
    faults.push({ from: size, to: info.base + info.archiveSize, blocks: [], reason: 'truncated', sev: 2 });
    notes.push(`file is ${size} bytes, header announces ${info.base + info.archiveSize}`);
  }
  const beyond = sorted.filter((b) => b.pos + b.csize > size);
  if (beyond.length) {
    faults.push({ from: Math.min(size, beyond[0].pos), to: Math.max(...beyond.map((b) => b.pos + b.csize)), blocks: beyond, reason: 'truncated', sev: 2 });
    notes.push(`${beyond.length} block(s) end beyond the end of the file`);
  }
  // plages nulles recouvrant des blocs
  for (const r of runs) {
    const hit = blocksIn(sorted, r.start, r.end);
    if (!hit.length) continue; // remplissage entre deux fichiers : sans conséquence
    const comp = hit.filter((b) => b.compressed);
    faults.push({ from: r.start, to: r.end, blocks: hit, reason: comp.length ? 'zeros' : 'rawzeros', sev: comp.length ? 2 : 1 });
  }
  // début de bloc compressé nul
  const badBlocks = (inp.badHeaderBlocks ?? []).map((i) => info.blocks.find((b) => b.index === i)).filter((b): b is MpqBlockInfo => !!b);
  for (const b of badBlocks) {
    if (faults.some((f) => f.blocks.some((x) => x.index === b.index))) continue; // déjà dans une zone
    faults.push({ from: b.pos, to: b.pos + b.csize, blocks: [b], reason: 'headers', sev: 2 });
  }
  // table de hachage incohérente
  if (info.hashInvalid > 0 && info.hashInvalid > info.hashUsed * 0.01) {
    notes.push(`hash table inconsistent: ${info.hashInvalid} of ${info.hashUsed} entries point outside the block table`);
    faults.push({ from: info.base + info.hashPos, to: info.base + info.hashPos + info.hashSize * 16, blocks: [], reason: 'tables', sev: 1 });
  }

  if (!faults.length) {
    out.note = notes.join('; ') || undefined;
    return out;
  }
  faults.sort((a, b) => a.from - b.from);
  const worst = Math.max(...faults.map((f) => f.sev));
  out.status = worst >= 2 ? 'incomplete' : 'suspect';
  // première zone fautive de la gravité retenue
  const first = faults.find((f) => f.sev === worst)!;
  out.reason = first.reason;
  out.zones = faults.length;
  const all = new Set<number>();
  for (const f of faults) for (const b of f.blocks) all.add(b.index);
  out.affected = all.size;
  // noms : listfile (peut lui-même être dans la zone abîmée : alors pas de noms)
  const names: string[] = [];
  if (opened.core && first.blocks.length) {
    try {
      const want = new Set(first.blocks.map((b) => b.index));
      const byIndex = new Map<number, string>();
      for (const n of opened.core.listfile()) {
        const idx = opened.core.blockIndexOf(n);
        if (want.has(idx) && !byIndex.has(idx)) byIndex.set(idx, n);
      }
      for (const b of first.blocks) {
        const n = byIndex.get(b.index);
        if (n && names.length < 3) names.push(shortName(n));
      }
    } catch (e) {
      notes.push(`listfile unreadable (${(e as Error).message})`);
    }
  }
  out.zone = { from: first.from, to: first.to, files: first.blocks.length, names };
  out.note = notes.join('; ') || undefined;
  return out;
}

/* -------------------------------------------------------------------------- */
/* Contrôle autonome                                                           */
/* -------------------------------------------------------------------------- */

export interface CheckOptions {
  mode: 'quick' | 'full';
  onProgress?: (done: number, total: number) => void;
  /** lève 'cancelled' entre deux morceaux */
  cancelled?: () => boolean;
}

/** Contrôle d'une archive : lit selon le mode (voir l'en-tête du module). Synchrone (sources synchrones) ; l'annulation se fait entre deux morceaux. */
export function checkArchive(name: string, src: ByteSource, inflate: Inflate, o: CheckOptions): ArchiveCheck {
  const t0 = Date.now();
  const opened = openForCheck(name, src, inflate);
  if (o.mode === 'quick') {
    const runs = probeZeroRuns(src, { cancelled: o.cancelled, onProgress: (d) => o.onProgress?.(d, src.size) });
    return finishCheck({ name, size: src.size, opened, runs, mode: 'quick', ms: Date.now() - t0 });
  }
  const sc = new StreamScanner(src.size, opened.info, true);
  for (let pos = 0; pos < src.size; pos += SCAN_CHUNK) {
    if (o.cancelled?.()) throw new Error('cancelled');
    sc.feed(pos, src.read(pos, Math.min(SCAN_CHUNK, src.size - pos)));
    o.onProgress?.(Math.min(src.size, pos + SCAN_CHUNK), src.size);
  }
  const r = sc.finish();
  return finishCheck({ name, size: src.size, opened, runs: r.runs, badHeaderBlocks: r.badHeaderBlocks, md5: r.md5, mode: 'full', ms: Date.now() - t0 });
}
