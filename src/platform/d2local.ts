/**
 * Mode « local » des sprites D2 : le joueur fournit ses propres fichiers MPQ, des Web Workers (tools/d2import/browser.ts, même
 * logique que l'importeur CLI) génèrent les planches sur l'appareil et les rangent dans l'API Cache (`d2m-d2-local`, clé
 * `d2-local/<chemin>` : mêmes noms que le dossier produit par l'importeur CLI `hi/`, `lo/`, `manifest.json`). Rien n'est envoyé : les fichiers du joueur
 * ne quittent jamais l'appareil.
 *
 * Génération PARESSEUSE : `d2Local.request()` met un asset en file avec une priorité, les Workers les produisent un par un,
 * `SpriteBank` remplace à chaud le sprite d'origine quand l'asset est prêt. Persistance : les MPQ sont copiés dans OPFS
 * (`createSyncAccessHandle` dans un Worker) ou, sur bureau, leur poignée est mémorisée (IndexedDB) ; empreinte = version du
 * générateur + empreinte des MPQ.
 * Activation : `localStorage['d2m.d2local'] = '1'` (réglage caché) ou panneau Réglages.
 */
import { sha1Hex } from '../../tools/d2import/sha1';
import { mapRevision } from '../../tools/d2import/map-revs';
import { looksLikeMpq } from '../../tools/d2import/mpq-probe';
import {
  GENERATOR_VERSION,
  AUDIO_GENERATOR_VERSION,
  AUDIO_TABLE_MPQ,
  audioStaleReason,
  isAudioMpq,
  type AudioMeta,
  GenQueue,
  PRIO,
  EXTRA_MARKERS,
  uiCurrent,
  COST,
  archiveReport,
  copyPlan,
  emptyManifest,
  estimateAll,
  hasTier,
  isModestDevice,
  chooseGenTier,
  autoTierReason,
  TIGHT_STORAGE_FREE,
  mergeEntry,
  parseCopyState,
  type IntegrityFile,
  setFingerprint,
  staleReason,
  staleMaps,
  tiersOf,
  type ArchiveReport,
  type CatalogCounts,
  type FileFingerprint,
  type GenJob,
  type LocalManifest,
  type LocalMeta,
  type ManifestEntry,
  type MapEntry,
  type Tier,
  isMapAsset,
  mapAssetId,
  mapDataAssetId,
  mapIdOfAsset,
  mapOfPath,
  MAP_SLICE_MIN_CHUNKS,
  mapSliceAssetId,
  mapSlicesOf,
} from './d2local-core';

import { blockingChecks, checkMatches, describeEn, mergeCheck, skippedChecks, isRequiredName, type ArchiveCheck } from './d2check-core';
import { resetPregenDone } from './d2pregen';
import { D2AudioLocal } from './d2local-audio';
import { D2_AUDIO_CACHE, D2_LOCAL_CACHE, deleteCache, opfsDirName, primeStoreNames, removeOpfsDir, storeName } from './storage-names';
import { migrateDb } from './idb-migrate';
import { legacyStoreName } from './legacy-names';

const D2_LOCAL_FLAG = 'd2m.d2local';
/** palier de génération voulu : auto | lo | hi (réglage de l'appareil, jamais synchronisé) */
const D2_LOCAL_TIER = 'd2m.d2localTier';
/** réglage mémorisé : des fichiers ont été copiés dans OPFS sur cet appareil (sert à distinguer « jamais copiés » de « introuvables ») */
const OPFS_HINT = 'd2m.d2localFiles';
const hint = (v: boolean | null): boolean => {
  try {
    if (v === true) localStorage.setItem(OPFS_HINT, '1');
    else if (v === false) localStorage.removeItem(OPFS_HINT);
    return localStorage.getItem(OPFS_HINT) === '1';
  } catch {
    return false;
  }
};
const IDB_NAME = 'd2m-d2local';

/** Mode local demandé (réglage mémorisé) */
export function d2LocalEnabled(): boolean {
  try {
    return localStorage.getItem(D2_LOCAL_FLAG) === '1';
  } catch {
    return false;
  }
}

export function setD2LocalEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(D2_LOCAL_FLAG, '1');
    else localStorage.removeItem(D2_LOCAL_FLAG);
  } catch {
    /* stockage indisponible */
  }
}

/** Cartes DS1 générées sur l'appareil (phase 5) : actif par défaut ; `'0'` les coupe (le jeu garde ses zones d'origine) */
const D2_LOCAL_MAPS = 'd2m.d2localMaps';

export function d2LocalMapsEnabled(): boolean {
  try {
    return localStorage.getItem(D2_LOCAL_MAPS) !== '0';
  } catch {
    return true;
  }
}

export function setD2LocalMapsEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(D2_LOCAL_MAPS);
    else localStorage.setItem(D2_LOCAL_MAPS, '0');
  } catch {
    /* stockage indisponible */
  }
}

export function d2LocalTierSetting(): 'auto' | 'lo' | 'hi' {
  try {
    const v = localStorage.getItem(D2_LOCAL_TIER);
    return v === 'lo' || v === 'hi' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function setD2LocalTierSetting(v: 'auto' | 'lo' | 'hi'): void {
  try {
    if (v === 'auto') localStorage.removeItem(D2_LOCAL_TIER);
    else localStorage.setItem(D2_LOCAL_TIER, v);
  } catch {
    /* ignoré */
  }
}

/** Appareil modeste (tactile, peu de mémoire ou de cœurs) : le palier `lo` seul est généré par défaut */
export function d2LocalModest(): boolean {
  const nav = navigator;
  let coarse = false;
  try {
    coarse = matchMedia('(pointer: coarse)').matches;
  } catch {
    /* ignoré */
  }
  return isModestDevice({ coarse, memoryGb: nav.deviceMemory, cores: nav.hardwareConcurrency });
}

let storageTight = false;

/** Mesure l'espace libre (une fois) : sous 700 Mo, « Auto » passe à l'économe. Résultat mémorisé pour les décisions suivantes. */
export async function refreshStorageTight(): Promise<boolean> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (e?.quota !== undefined && e.usage !== undefined) storageTight = e.quota - e.usage < TIGHT_STORAGE_FREE;
  } catch {
    /* ignoré */
  }
  return storageTight;
}

/** Palier choisi pour la génération : réglage explicite, sinon « Auto » = haute (voir `chooseGenTier`) */
export function d2LocalGenTier(): Tier {
  const mem = navigator.deviceMemory;
  return chooseGenTier(d2LocalTierSetting(), mem, storageTight);
}

/** Pourquoi « Auto » a choisi l'économe (null : haute ou choix explicite) */
export function d2LocalAutoReason(): 'weak' | 'storage' | null {
  if (d2LocalTierSetting() !== 'auto') return null;
  return autoTierReason(navigator.deviceMemory, storageTight);
}

/** Générations de carte simultanées au plus */
const MAX_MAP_WORKERS = 2;

/** message d'erreur d'une génération arrêtée volontairement (jamais comptée comme un échec) */
const CANCELLED = 'annulé';

const keyOf = (path: string): string => new URL(`d2-local/${path}`, new URL('./', location.href)).href;

/** Octets d'un fichier généré, ou null s'il n'existe pas (la planche garde alors son sprite d'origine) */
export async function localRead(path: string): Promise<Uint8Array | null> {
  if (typeof caches === 'undefined') return null;
  await primeStoreNames();
  const r = await (await caches.open(storeName(D2_LOCAL_CACHE))).match(keyOf(path));
  return r ? new Uint8Array(await r.arrayBuffer()) : null;
}

async function localClear(): Promise<void> {
  await deleteCache(D2_LOCAL_CACHE);
}

/* -------------------------------------------------------------------------- */
/* Lots (outils, contrôles) : génération en une fois, sans file                */
/* -------------------------------------------------------------------------- */

interface LocalSheetReport {
  id: string;
  ok: boolean;
  /** sheet : planche (manifeste `sheets`) ; tile : sol (`tiles`) ; files : atlas d'icônes, interface, texte */
  kind?: 'sheet' | 'tile' | 'files' | 'map';
  ms: number;
  files: number;
  bytes: number;
  warnings: string[];
  error?: string;
  /** pile technique de l'erreur (diagnostic) */
  stack?: string;
  /** cartes : durée par phase (ms), nombre de morceaux, structures, pic de tampon */
  info?: Record<string, number>;
}

interface LocalCatalog {
  units: string[];
  parts: string[];
  props: string[];
  fx: string[];
  grounds: string[];
  extras: string[];
  /** cartes DS1 générables avec ces archives (absent des anciens catalogues) */
  maps?: string[];
}

const newWorker = (): Worker => new Worker(new URL('./d2local.worker.ts', import.meta.url), { type: 'module' });
/* -------------------------------------------------------------------------- */
/* IndexedDB : poignées de fichiers (bureau, sans copie)                       */
/* -------------------------------------------------------------------------- */

async function idb(): Promise<IDBDatabase | null> {
  // file handles remembered by an earlier version (former database name): copied once
  await migrateDb(IDB_NAME, legacyStoreName('d2local'), 'handles');
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const rq = indexedDB.open(IDB_NAME, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('handles');
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => resolve(null);
  });
}

async function idbPut(key: string, val: unknown): Promise<boolean> {
  const db = await idb();
  if (!db) return false;
  return new Promise((resolve) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(val, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

async function idbAll(): Promise<unknown[]> {
  const db = await idb();
  if (!db) return [];
  return new Promise((resolve) => {
    const rq = db.transaction('handles').objectStore('handles').getAll();
    rq.onsuccess = () => resolve(rq.result as unknown[]);
    rq.onerror = () => resolve([]);
  });
}

async function idbClear(): Promise<void> {
  const db = await idb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/* -------------------------------------------------------------------------- */
/* Service                                                                     */
/* -------------------------------------------------------------------------- */

export type LocalPhase = 'off' | 'init' | 'needfiles' | 'needperm' | 'copying' | 'opening' | 'ready' | 'error';
type StoreKind = 'none' | 'session' | 'opfs' | 'handles';

export interface LocalStatus {
  phase: LocalPhase;
  /** d'où viennent les MPQ en ce moment */
  source: StoreKind;
  /** les MPQ survivent au rechargement (copie OPFS complète ou poignées) */
  persistent: boolean;
  /** il existe des graphismes générés en cache (le jeu les lit même sans les MPQ) */
  hasCache: boolean;
  message: string;
  report: ArchiveReport | null;
  copy: { name: string; done: number; size: number; all: number; total: number; verifying?: boolean } | null;
  /** intégrité de la copie OPFS : `verified` = relue et comparée à la source (ou aux empreintes) ; `unverified` = copie sans empreinte (ancienne, interrompue) */
  integrity: IntegrityStatus;
  quotaFull: boolean;
  queued: number;
  active: number;
  /** lot courant : générés / demandés depuis que la file était vide */
  batch: { done: number; total: number };
  generated: number;
  failed: number;
  genMs: number;
  /** « tout générer » en cours */
  all: { done: number; total: number; running: boolean };
  counts: CatalogCounts | null;
  readyCount: number;
  /** durée de la dernière copie des MPQ dans OPFS (ms) */
  copyMs: number;
  /** lots « extras » (interface, icônes) prêts */
  extras: string[];
  /** sons et musique (archives facultatives) */
  audio: AudioStatus;
  /** contrôle d'intégrité des archives (clé : nom en minuscules) : statut, première zone fautive, MD5 */
  checks: Record<string, ArchiveCheck>;
  /** contrôle en cours (lecture de l'archive) */
  checking: { name: string; done: number; total: number; mode: 'quick' | 'full' } | null;
}

interface IntegrityStatus {
  state: 'n/a' | 'unknown' | 'verified' | 'unverified' | 'damaged' | 'checking';
  files: IntegrityFile[];
  /** dernière vérification (ms epoch), 0 = jamais depuis ce lancement */
  at: number;
}

interface AudioStatus {
  /** archives audio connues (noms) */
  names: string[];
  /** taille cumulée de ces archives */
  bytes: number;
  /** d'où elles viennent : copie OPFS, poignées, ou session seule */
  source: StoreKind;
  /** des sons déjà décodés sont en cache */
  cached: boolean;
  /** copie des archives audio interrompue (reprise au prochain choix des fichiers) */
  partial: string[];
}

const EMPTY_AUDIO = (): AudioStatus => ({ names: [], bytes: 0, source: 'none', cached: false, partial: [] });

interface Slot {
  w: Worker;
  ready: boolean;
  dead: boolean;
  job: { job: GenJob; id: number } | null;
}

type Listener = (s: LocalStatus) => void;

/** Appelé quand un asset vient d'être écrit dans le cache, AVANT qu'il soit déclaré prêt : SpriteBank le charge et le met en place */
type GeneratedHook = (id: string, tier: Tier, kind: string, entry: ManifestEntry | undefined) => Promise<void>;

const EMPTY_STATUS = (): LocalStatus => ({
  phase: 'off',
  source: 'none',
  persistent: false,
  hasCache: false,
  message: '',
  report: null,
  copy: null,
  integrity: { state: 'n/a', files: [], at: 0 },
  quotaFull: false,
  queued: 0,
  active: 0,
  batch: { done: 0, total: 0 },
  generated: 0,
  failed: 0,
  genMs: 0,
  all: { done: 0, total: 0, running: false },
  counts: null,
  readyCount: 0,
  copyMs: 0,
  extras: [],
  audio: EMPTY_AUDIO(),
  checks: {},
  checking: null,
});

/** État de la génération locale lu par l'écran d'attente (src/ui/d2wait-core.ts : WaitSnap le complète) et par le diagnostic */
export interface LocalWaitDiag {
  phase: LocalPhase;
  files: number;
  pending: number;
  active: number;
  slots: { ready: boolean; dead: boolean; job: string | null }[];
  failed: string[];
  batch: { done: number; total: number };
  generated: number;
  message: string;
  lastError: string;
}

class D2LocalService {
  /** le mode local est actif dans cette page (posé par SpriteBank) : le réglage ne demande un rechargement que s'il diffère */
  private active = false;
  get modeActive(): boolean {
    return this.active;
  }
  set modeActive(v: boolean) {
    this.active = v;
    // utile au débogage et aux e2e : le service est exposé dès que le mode est actif (y compris choisi en cours de session)
    if (v && typeof window !== 'undefined') window.__d2local = this;
  }
  private st: LocalStatus = EMPTY_STATUS();
  private listeners = new Set<Listener>();
  private queue = new GenQueue();
  private slots: Slot[] = [];
  private files: File[] | null = null;
  private manifest: LocalManifest = emptyManifest();
  private meta: LocalMeta | null = null;
  private cat: LocalCatalog | null = null;
  private extrasReady = new Set<string>();
  private failedIds = new Set<string>();
  /** détail de chaque échec constaté (message technique, pile, durée) : écran d'erreur et diagnostic copiable */
  private failures = new Map<string, { id: string; tier: string; error: string; stack: string; ms: number; at: number }>();
  private initP: Promise<void> | null = null;
  private opening: Promise<void> | null = null;
  private jobSeq = 1;
  private saveTimer = 0;
  private notifyTimer = 0;
  private bytesGenerated = 0;
  /** assets générés pendant cette session (id:palier:ms) : tests et diagnostic */
  readonly genLog: string[] = [];
  /** journal horodaté (ms, performance.now) des événements de génération : diagnostic des à-coups */
  readonly timeline: [number, string][] = [];
  private handles: FileSystemFileHandle[] = [];
  /** archives obligatoires dont le contrôle est attendu : la fabrication ne démarre pas avant (ni si l'une est incomplète) */
  private checkExpected = new Set<string>();
  /** archives jugées incomplètes juste avant qu'on les remplace (voir useFiles) */
  private badBefore = new Set<string>();
  private copyActive = false;
  private checkCancel: (() => void) | null = null;
  private checkWorker: Worker | null = null;
  private checkChain: Promise<void> = Promise.resolve();
  private checkTimer = 0;
  /** archives de graphismes choisies pendant cette session (même si la sélection n'était pas encore valide) : un ajout les retrouve */
  private provided = new Map<string, File>();
  /** audio local : Workers qui décodent à la demande les sons des archives du joueur (d2local-audio.ts) */
  readonly audio = new D2AudioLocal();
  private audioMeta: AudioMeta | null = null;
  /** empreintes des archives audio (reprise d'une copie interrompue : jamais d'une autre version) */
  private audioFps: Record<string, string> = {};
  /** appelé quand des sons deviennent disponibles (archives fournies ou retrouvées, ou sons déjà décodés en cache) */
  onAudioReady: (() => void) | null = null;
  hook: GeneratedHook | null = null;
  /** parts d'une carte découpée déjà écrites (`<id>|<palier>` → nombre) */
  private sliceDone = new Map<string, number>();
  /** générations complètes de carte en cours (`<id>|<palier>`) : une demande en double rejoint la première */
  private mapFull = new Map<string, Promise<boolean>>();
  /** mesures par carte générée (diagnostic, e2e) */
  readonly mapLog: Record<string, unknown>[] = [];
  /** appelé quand les données (JSON) d'une carte viennent d'être écrites : l'application l'enregistre dans le jeu */
  onMapData: ((id: string) => void) | null = null;
  /** appelé quand un lot « extras » (interface, icônes) vient d'être généré */
  onExtra: ((id: string) => void) | null = null;
  /** appelé quand le catalogue ou les fichiers changent (SpriteBank refait ses listes) */
  onChange: (() => void) | null = null;
  /** appelé quand des fichiers valides viennent d'être fournis (ou retrouvés) : l'application reconstruit la zone courante avec les sols D2 */
  onFilesReady: (() => void) | null = null;
  /** nombre de Workers de génération : un seul sur appareil modeste (mémoire), jusqu'à trois sur un PC à beaucoup de cœurs */
  poolSize = (() => {
    try {
      const cores = navigator.hardwareConcurrency ?? 4;
      if (d2LocalModest()) return 1;
      return cores >= 12 ? 3 : cores >= 8 ? 2 : 1;
    } catch {
      return 1;
    }
  })();

  get status(): LocalStatus {
    return this.st;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(p: Partial<LocalStatus>): void {
    Object.assign(this.st, p);
    this.notify();
  }

  private notify(): void {
    if (this.notifyTimer) return;
    this.notifyTimer = window.setTimeout(() => {
      this.notifyTimer = 0;
      this.st.queued = this.queue.pending;
      this.st.active = this.queue.active;
      for (const l of this.listeners) l(this.st);
    }, 120);
  }

  /** Catalogue des assets générables (connu dès qu'une ouverture a réussi une fois ; mémorisé dans le cache) */
  get catalog(): LocalCatalog | null {
    return this.cat;
  }

  get hasFiles(): boolean {
    return !!this.files;
  }

  /** Contenu du manifeste des assets prêts (planches, sols) */
  manifestJson(): LocalManifest {
    return this.manifest;
  }

  isExtraReady(id: string): boolean {
    return this.extrasReady.has(id);
  }

  /** Palier disponible pour cet asset : le voulu s'il est prêt, sinon l'autre s'il l'est, sinon null */
  bestTier(id: string, want: Tier): Tier | null {
    const e = this.manifest.sheets[id] ?? this.manifest.tiles[id];
    if (!e) return null;
    if (hasTier(e, want)) return want;
    const other: Tier = want === 'hi' ? 'lo' : 'hi';
    return hasTier(e, other) ? other : null;
  }

  isReady(id: string, tier: Tier): boolean {
    if (isMapAsset(id)) {
      const e = this.manifest.maps?.[mapIdOfAsset(id)];
      return !!e && (id.startsWith('mapdata:') ? e.data : e[tier]);
    }
    if (id in EXTRA_MARKERS) return this.extrasReady.has(id);
    const e = this.manifest.sheets[id] ?? this.manifest.tiles[id];
    return !!e && hasTier(e, tier);
  }

  /** Génération impossible (pas de fichiers, stockage plein, échec déjà constaté) */
  canGenerate(id: string): boolean {
    return !!this.files && !this.st.quotaFull && !this.failedIds.has(id);
  }

  /** Test de bout en bout : `localStorage['d2m.d2testFail'] = 'ui:2'` fait échouer les 2 premières générations de « ui » (aucun effet sinon) */
  private testFailLeft = new Map<string, number>();
  private testFail(id: string): boolean {
    try {
      const v = localStorage.getItem('d2m.d2testFail');
      if (!v) return false;
      for (const part of v.split(',')) {
        const [n, c] = part.split(':');
        if (n !== id) continue;
        const left = this.testFailLeft.get(id) ?? (c ? Number(c) : 1e9);
        if (left <= 0) return false;
        this.testFailLeft.set(id, left - 1);
        return true;
      }
    } catch {
      /* ignoré */
    }
    return false;
  }

  hasFailed(id: string): boolean {
    return this.failedIds.has(id);
  }

  /** Avertissements du générateur pour le dernier lot fabriqué de cet asset (fichiers D2 absents ou illisibles…) */
  private warns = new Map<string, string[]>();
  warningsOf(id: string): string[] {
    return this.warns.get(id) ?? [];
  }

  /** Détail du dernier échec d'un asset (message technique du Worker), ou null */
  failureOf(id: string): { id: string; tier: string; error: string; stack: string; ms: number; at: number } | null {
    return this.failures.get(id) ?? null;
  }

  /** Efface la mémoire d'échec de ces assets : une nouvelle demande les retente (« Réessayer ») */
  clearFailed(ids: Iterable<string>): void {
    for (const id of ids) {
      this.failedIds.delete(id);
      this.failures.delete(id);
    }
  }

  /** État interne pour l'écran d'attente et le diagnostic : file, Workers, échecs */
  waitDiag(): LocalWaitDiag {
    const failed = [...this.failures.values()];
    const last = failed.sort((a, b) => b.at - a.at)[0];
    return {
      phase: this.st.phase,
      files: this.files?.length ?? 0,
      pending: this.queue.pending,
      active: this.queue.active,
      slots: this.slots.map((s) => ({ ready: s.ready, dead: s.dead, job: s.job?.job.id ?? null })),
      failed: failed.map((f) => f.id),
      batch: this.st.batch,
      generated: this.st.generated,
      message: this.st.message,
      lastError: last ? `${last.id}: ${last.error}` : '',
    };
  }

  /**
   * « Retry » qui relance vraiment : oublie les échecs, remplace les Workers (morts, jamais ouverts, ou bloqués), rouvre le service si
   * l'initialisation a échoué ou si les fichiers manquent, puis redemande. `redo` : ces lots sont déclarés prêts mais inutilisables
   * (images absentes du cache) : leur marqueur est retiré pour qu'ils soient refabriqués.
   */
  async recover(ids: string[], redo: string[] = []): Promise<void> {
    this.clearFailed(ids);
    this.abortAll();
    for (const [, rs] of this.slotReady) for (const r of rs) r();
    this.slotReady.clear();
    this.opening = null;
    if (!this.files || this.st.phase === 'error' || this.st.phase === 'init') {
      this.initP = null;
      await this.init();
    } else if (this.st.phase !== 'ready') {
      this.set({ phase: 'ready' });
    }
    for (const id of redo) {
      this.extrasReady.delete(id);
      this.failedIds.delete(id);
      const marker = EXTRA_MARKERS[id];
      if (marker && typeof caches !== 'undefined') {
        try {
          await (await caches.open(storeName(D2_LOCAL_CACHE))).delete(keyOf(marker));
        } catch {
          /* ignoré */
        }
      }
    }
    this.st.extras = [...this.extrasReady];
    this.requestExtras();
    this.pump();
    if (this.files && !this.cat) void this.openCatalog();
  }

  /** Fichiers fournis (nom, taille) et origine : diagnostic */
  fileInfo(): { name: string; size: number }[] {
    return (this.files ?? []).map((f) => ({ name: f.name, size: f.size }));
  }

  /* ---------------------------- démarrage ---------------------------- */

  init(): Promise<void> {
    this.initP ??= this.doInit();
    return this.initP;
  }

  private async doInit(): Promise<void> {
    // exposé dès l'initialisation (débogage, e2e) : l'écran d'import pilote le service avant que le mode soit actif
    if (typeof window !== 'undefined') window.__d2local = this;
    if (typeof caches === 'undefined') {
      this.set({ phase: 'error', message: 'This browser cannot store the generated graphics (Cache API missing).' });
      return;
    }
    this.set({ phase: 'init' });
    await primeStoreNames();
    // application passée en arrière-plan (ou tuée ensuite) : le manifeste est écrit tout de suite, la génération repartira de là
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void this.saveNow());
    try {
      const c = await caches.open(storeName(D2_LOCAL_CACHE));
      const read = async <T>(p: string): Promise<T | null> => {
        const r = await c.match(keyOf(p));
        return r ? ((await r.json()) as T) : null;
      };
      this.meta = await read<LocalMeta>('meta.json').catch(() => null);
      // version du générateur changée : les planches générées par l'ancienne version ne sont plus valables
      if (this.meta && staleReason(this.meta, null) === 'generator') {
        await localClear();
        this.meta = null;
      }
      const c2 = await caches.open(storeName(D2_LOCAL_CACHE));
      this.manifest =
        (await c2
          .match(keyOf('manifest.json'))
          .then((r) => (r ? (r.json() as Promise<LocalManifest>) : null))
          .catch(() => null)) ?? emptyManifest();
      const cat = await c2
        .match(keyOf('catalog.json'))
        .then((r) => (r ? (r.json() as Promise<{ gen: number; catalog: LocalCatalog }>) : null))
        .catch(() => null);
      this.cat = cat && cat.gen === GENERATOR_VERSION ? cat.catalog : null;
      // interface art of an earlier revision (ui.json `rev`): only the interface is generated again, the rest stays
      const markers = await Promise.all(
        Object.entries(EXTRA_MARKERS).map(async ([id, p]) => {
          const r = await c2.match(keyOf(p));
          if (!r) return null;
          if (id === 'ui' && !uiCurrent(await r.json().catch(() => null))) return null;
          return id;
        }),
      );
      for (const m of markers) if (m) this.extrasReady.add(m);
      // lot 317: a map generated by an earlier revision of its export (MAP_REVISIONS): that map alone is generated again
      const old = staleMaps(this.manifest);
      if (old.length) await this.clearAssets(old.map((id) => `map:${id}`)).catch(() => 0);
      this.st.extras = [...this.extrasReady];
      this.bytesGenerated = (this.manifest as unknown as { bytes?: number }).bytes ?? 0;
      const hasCache = Object.keys(this.manifest.sheets).length + Object.keys(this.manifest.tiles).length + this.extrasReady.size > 0;
      this.set({ hasCache, readyCount: Object.keys(this.manifest.sheets).length + Object.keys(this.manifest.tiles).length });
      await this.loadAudioMeta();
      await this.findStoredFiles();
      // sons déjà décodés, sans archives : ils restent lisibles (comme les planches générées)
      if (!this.audio.hasFiles && this.audio.hasCache) this.announceAudio();
    } catch (e) {
      this.set({ phase: 'error', message: `Local graphics unavailable: ${(e as Error).message}` });
    }
  }

  /** Fichiers déjà mémorisés : copie OPFS complète, sinon poignées IndexedDB */
  private async findStoredFiles(): Promise<void> {
    let opfs = await this.opfsFiles();
    // des fichiers ont déjà été copiés ici mais rien n'est lisible : lecture transitoire (arrêt des Workers de la page précédente) ? on réessaie
    for (let k = 0; k < 4 && !opfs.complete && !opfs.partial.length && hint(null); k++) {
      await new Promise((r) => setTimeout(r, 350));
      opfs = await this.opfsFiles();
    }
    if (!opfs.complete && !opfs.partial.length && hint(null)) {
      console.warn('Fichiers Diablo II copiés dans OPFS : introuvables au démarrage');
    }
    this.set({ audio: { ...this.st.audio, partial: opfs.partialAudio } });
    if (opfs.complete) {
      this.set({ integrity: { state: opfs.verified ? 'verified' : 'unverified', files: [], at: 0 } });
      for (const c of opfs.checks) this.recordCheck(c);
      await this.useFiles(opfs.files, 'opfs', true);
      return;
    }
    const hs = (await idbAll()).filter((h) => h && typeof (h as FileSystemFileHandle).getFile === 'function') as FileSystemFileHandle[];
    if (hs.length) {
      this.handles = hs;
      const q = hs.map((h) => (h as unknown as { queryPermission?(o: { mode: string }): Promise<string> }).queryPermission?.({ mode: 'read' }) ?? Promise.resolve('prompt'));
      const perms = await Promise.all(q);
      if (perms.every((p) => p === 'granted')) {
        try {
          await this.useFiles(await Promise.all(hs.map((h) => h.getFile())), 'handles', true);
          return;
        } catch {
          /* fichier déplacé ou supprimé : on redemande */
        }
      } else {
        this.set({ phase: 'needperm', source: 'handles', persistent: true, message: 'Allow access to the remembered Diablo II files to keep preparing the graphics.' });
        return;
      }
    }
    if (opfs.partial.length) this.set({ phase: 'needfiles', message: 'The copy of the Diablo II files was interrupted: choose them again and it will resume where it stopped.' });
    else if (hint(null)) this.set({ phase: 'needfiles', message: 'The Diablo II files copied to this device cannot be found (the browser may have freed the space): choose them again.' });
    else this.set({ phase: 'needfiles', message: this.st.hasCache ? 'Diablo II files not available: the graphics already prepared are still used.' : '' });
  }

  /** Demande l'accès aux poignées mémorisées (geste de l'utilisateur requis) */
  async grantHandles(): Promise<void> {
    try {
      for (const h of this.handles) await (h as unknown as { requestPermission(o: { mode: string }): Promise<string> }).requestPermission({ mode: 'read' });
      await this.useFiles(await Promise.all(this.handles.map((h) => h.getFile())), 'handles', true);
    } catch (e) {
      this.set({ phase: 'needperm', message: `Access denied or files not found (${(e as Error).message}).` });
    }
  }

  private async opfsFiles(): Promise<{ files: File[]; complete: boolean; verified: boolean; partial: { name: string; done: number; size: number }[]; partialAudio: string[]; checks: ArchiveCheck[] }> {
    const out = { files: [] as File[], complete: false, verified: false, partial: [] as { name: string; done: number; size: number }[], partialAudio: [] as string[], checks: [] as ArchiveCheck[] };
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(opfsDirName());
      const readOne = async (n: string): Promise<string | null> => {
        try {
          return await (await (await dir.getFileHandle(n)).getFile()).text();
        } catch {
          return null;
        }
      };
      const state = parseCopyState(await readOne('copy.a.json'), await readOne('copy.b.json')).state;
      const unver: string[] = [];
      for (const [name, st] of Object.entries(state)) {
        try {
          const f = await (await dir.getFileHandle(name)).getFile();
          if (st.done === st.size && f.size === st.size) {
            out.files.push(f);
            if (st.chk && st.chk.size === f.size) out.checks.push(st.chk);
            if (!st.ver) unver.push(name);
          } else if (isAudioMpq(name)) out.partialAudio.push(name);
          else out.partial.push({ name, done: st.done, size: st.size });
        } catch {
          if (isAudioMpq(name)) out.partialAudio.push(name);
          else out.partial.push({ name, done: 0, size: st.size });
        }
      }
      const rep = archiveReport(out.files.map((f) => ({ name: f.name, size: f.size })));
      out.complete = rep.ok && out.partial.length === 0;
      out.verified = out.complete && unver.filter((n) => !isAudioMpq(n)).length === 0;
    } catch {
      /* OPFS indisponible ou vide */
    }
    return out;
  }

  /** Les fichiers sont là : vérification, empreinte, invalidation, catalogue */
  private async useFiles(files: File[], source: StoreKind, persistent: boolean): Promise<void> {
    // une archive FACULTATIVE jugée incomplète n'est pas utilisée (on continue sans elle) ; une obligatoire reste, la fabrication attend
    const wasBad = this.badBefore;
    this.badBefore = new Set();
    const all = files.filter((f) => /\.mpq$/i.test(f.name) && !skippedChecks(this.st.checks, [f]).length);
    // archives sonores (facultatives) : suivies à part, sans effet sur la validité ni sur l'empreinte des graphismes
    const audioIn = all.filter((f) => isAudioMpq(f.name));
    const mpq = all.filter((f) => !isAudioMpq(f.name));
    const bad: string[] = [];
    for (const f of mpq) {
      try {
        if (f.size < 1024 || !looksLikeMpq(new Uint8Array(await f.slice(0, 2048).arrayBuffer()))) bad.push(f.name);
      } catch {
        bad.push(f.name);
      }
    }
    const report = archiveReport(
      mpq.map((f) => ({ name: f.name, size: f.size })),
      bad,
    );
    if (!report.ok) {
      this.set({ phase: 'needfiles', report, message: report.messages.join(' ') });
      return;
    }
    const good = mpq.filter((f) => !bad.includes(f.name));
    const prints: FileFingerprint[] = [];
    for (const f of good) prints.push({ name: f.name, size: f.size, fp: await fingerprintFile(f) });
    const fp = setFingerprint(prints);
    // une archive remplacée après avoir été jugée incomplète : son empreinte rapide (début, milieu, fin) peut être inchangée, mais ce qui a été
    // généré à partir d'elle ne vaut rien
    const replacedBad = good.some((f) => wasBad.has(f.name.toLowerCase()));
    const why = staleReason(this.meta, fp) ?? (replacedBad ? ('files' as const) : null);
    if (why) {
      // d'autres fichiers (ou une autre version) : tout ce qui a été généré est invalide
      resetPregenDone();
      this.abortAll();
      await localClear();
      this.manifest = emptyManifest();
      this.cat = null;
      this.extrasReady.clear();
      this.failedIds.clear();
      this.bytesGenerated = 0;
      this.set({ hasCache: false, readyCount: 0 });
    }
    this.files = good;
    this.meta = { gen: GENERATOR_VERSION, fp, files: prints, created: this.meta?.created ?? Date.now() };
    try {
      await (await caches.open(storeName(D2_LOCAL_CACHE))).put(keyOf('meta.json'), new Response(JSON.stringify(this.meta)));
    } catch (e) {
      this.noteQuota(e);
    }
    this.set({ phase: 'ready', source, persistent, report, message: report.messages.join(' ') });
    this.ensureChecks([...good, ...audioIn], source);
    await this.useAudio(
      audioIn.filter((f) => !skippedChecks(this.st.checks, [f]).length),
      source,
      prints,
    );
    // archive obligatoire incomplète : rien n'est ouvert ni fabriqué (ni catalogue), l'écran explique et propose de choisir le fichier de nouveau
    await this.awaitChecks();
    const stop = this.blocked();
    if (stop.length) {
      this.set({ phase: 'ready', message: stop.flatMap(describeEn).join(' ') });
      return;
    }
    this.requestExtras();
    // catalogue : mémorisé, sinon une ouverture le calcule
    if (!this.cat) await this.openCatalog();
    else this.set({ counts: countsOf(this.cat) });
    this.onChange?.();
    this.onFilesReady?.();
  }

  private async openCatalog(): Promise<void> {
    this.opening ??= (async () => {
      this.set({ phase: 'opening' });
      try {
        await this.ensureSlot();
      } finally {
        this.set({ phase: 'ready' });
      }
    })().finally(() => (this.opening = null));
    await this.opening;
  }

  private setCatalog(cat: LocalCatalog): void {
    this.cat = cat;
    this.set({ counts: countsOf(cat) });
    void caches
      .open(storeName(D2_LOCAL_CACHE))
      .then((c) => c.put(keyOf('catalog.json'), new Response(JSON.stringify({ gen: GENERATOR_VERSION, catalog: cat }))))
      .catch((e) => this.noteQuota(e));
  }

  /* ------------------------- fichiers du joueur ------------------------- */

  /**
   * Le joueur a choisi ses fichiers. `store` : `opfs` (copie persistante, reprise possible), `handles` (poignées, sans copie ; bureau),
   * `session` (lus tels quels, à resélectionner au prochain lancement).
   */
  async provideFiles(files: File[], opts: { store: 'opfs' | 'handles' | 'session'; handles?: FileSystemFileHandle[]; copyAudio?: boolean } = { store: 'opfs' }): Promise<ArchiveReport> {
    await this.init();
    const mpq = files.filter((f) => /\.mpq$/i.test(f.name));
    for (const f of mpq) if (!isAudioMpq(f.name)) this.provided.set(f.name.toLowerCase(), f);
    this.resetChecks(mpq.filter((f) => !isAudioMpq(f.name)).map((f) => f.name));
    // sons : copiés dans OPFS seulement si le joueur le demande (≈ 1 Go de plus) ; sinon lus tels quels pendant la session
    let toCopy = mpq.filter((f) => !isAudioMpq(f.name) || opts.copyAudio === true);
    let store = opts.store;
    let note = '';
    if (store === 'opfs') {
      const est = await storageEstimate();
      let plan = copyPlan(
        toCopy.map((f) => f.size),
        est.quota,
        est.usage,
      );
      if (!plan.fits && toCopy.length > mpq.filter((f) => !isAudioMpq(f.name)).length) {
        // les graphismes tiennent mais pas les sons en plus : on copie les graphismes, les sons restent lus tels quels
        const gfxOnly = mpq.filter((f) => !isAudioMpq(f.name));
        const gp = copyPlan(
          gfxOnly.map((f) => f.size),
          est.quota,
          est.usage,
        );
        if (gp.fits) {
          toCopy = gfxOnly;
          plan = gp;
          note = 'Not enough space to also copy the sounds: they will be read at each launch and must be selected again.';
        }
      }
      if (!plan.fits) {
        store = 'session';
        note = `Not enough space to copy the files (${fmtMo(plan.need)} needed, ${fmtMo(plan.free ?? 0)} free): they will be read at each launch and must be selected again.`;
      } else if (!navigator.storage?.getDirectory) {
        store = 'session';
        note = 'This browser cannot copy the files: you will have to select them again at each launch.';
      }
    }
    await this.useFiles(mpq, store === 'session' || store === 'opfs' ? 'session' : store, store === 'handles');
    if (note) this.set({ message: `${this.st.message} ${note}`.trim() });
    const report = this.st.report ?? archiveReport(mpq.map((f) => ({ name: f.name, size: f.size })));
    if (!report.ok) return report;
    if (store === 'handles' && opts.handles?.length) {
      this.handles = opts.handles;
      await idbClear();
      for (const h of opts.handles) await idbPut(`mpq:${h.name}`, h);
    }
    if (store === 'opfs') void this.copyToOpfs(toCopy);
    void this.persist();
    return report;
  }

  /* ------------------------- contrôle des archives ------------------------- */

  /** Archives OBLIGATOIRES jugées incomplètes : la fabrication est bloquée tant qu'elles ne sont pas remplacées */
  blocked(): ArchiveCheck[] {
    return blockingChecks(this.st.checks, this.fileInfo());
  }

  /** Archives FACULTATIVES jugées incomplètes : ignorées */
  skipped(): ArchiveCheck[] {
    return skippedChecks(this.st.checks, [...this.fileInfo(), ...this.audioFileInfo(), ...this.skippedFiles]);
  }

  private skippedFiles: { name: string; size: number }[] = [];

  private gated(): boolean {
    return this.checkExpected.size > 0 || this.blocked().length > 0;
  }

  /** Oublie les résultats de ces archives (elles viennent d'être choisies de nouveau) et retient celles qui étaient incomplètes */
  private resetChecks(names: string[]): void {
    const checks = { ...this.st.checks };
    for (const n of names) {
      const k = n.toLowerCase();
      if (checks[k]?.status === 'incomplete') this.badBefore.add(k);
      delete checks[k];
      this.skippedFiles = this.skippedFiles.filter((f) => f.name.toLowerCase() !== k);
    }
    this.set({ checks });
  }

  /** Un résultat de contrôle est arrivé (contrôle rapide ou complet, ou résultat mémorisé de la copie) */
  private recordCheck(c: ArchiveCheck): void {
    const key = c.name.toLowerCase();
    const cur = [...this.fileInfo(), ...this.audioFileInfo(), ...this.skippedFiles].find((f) => f.name.toLowerCase() === key);
    if (cur && cur.size !== c.size) return; // résultat d'une autre version du fichier
    const next = mergeCheck(this.st.checks[key], c);
    this.checkExpected.delete(key);
    this.set({ checks: { ...this.st.checks, [key]: next } });
    if (next.status === 'incomplete') this.onIncomplete(next);
    if (!this.gated()) this.pump();
  }

  private onIncomplete(c: ArchiveCheck): void {
    const text = describeEn(c).join(' ');
    if (isRequiredName(c.name)) {
      // fabrication stoppée : un travail en cours s'arrête, la file est vidée, rien ne repart avant le remplacement du fichier
      this.abortAll();
      this.set({ message: text });
      return;
    }
    // facultative : on continue sans elle
    const lower = c.name.toLowerCase();
    const was = [...this.fileInfo(), ...this.audioFileInfo()].find((f) => f.name.toLowerCase() === lower);
    if (was) this.skippedFiles.push(was);
    if (isAudioMpq(c.name)) {
      const aud = (this.audio as unknown as { files: File[] }).files.filter((f) => f.name.toLowerCase() !== lower);
      this.audio.setFiles(aud);
      this.set({ audio: { ...this.st.audio, names: this.st.audio.names.filter((n) => n.toLowerCase() !== lower), bytes: aud.filter((f) => isAudioMpq(f.name)).reduce((a, f) => a + f.size, 0) } });
    } else if (this.files?.some((f) => f.name.toLowerCase() === lower)) {
      this.files = this.files.filter((f) => f.name.toLowerCase() !== lower);
      this.abortAll();
    }
    this.set({ message: `${text} The game continues without it.` });
  }

  /**
   * Lance le contrôle rapide des archives dont on ne connaît pas encore le résultat. Les obligatoires sont ATTENDUES : la fabrication ne part
   * pas avant (ni si l'une est incomplète). Une copie OPFS les contrôle ensuite sur sa propre lecture (complet, MD5).
   */
  private ensureChecks(files: File[], source: StoreKind): void {
    const todo = files.filter((f) => !checkMatches(this.st.checks[f.name.toLowerCase()], f.size));
    if (!todo.length) return;
    for (const f of todo) if (isRequiredName(f.name)) this.checkExpected.add(f.name.toLowerCase());
    if (this.checkExpected.size) {
      // garde-fou : un contrôle qui ne répond jamais ne doit pas bloquer la fabrication
      window.clearTimeout(this.checkTimer);
      this.checkTimer = window.setTimeout(() => {
        this.checkExpected.clear();
        this.pump();
      }, 90000);
    }
    void this.startCheck(todo, 'quick', source === 'opfs' && !this.copyActive);
  }

  private startCheck(files: File[], mode: 'quick' | 'full', save: boolean): Promise<void> {
    this.checkChain = this.checkChain.then(() => this.runCheck(files, mode, save)).catch(() => undefined);
    return this.checkChain;
  }

  private runCheck(files: File[], mode: 'quick' | 'full', save: boolean): Promise<void> {
    return new Promise<void>((resolve) => {
      const w = newWorker();
      this.checkWorker = w;
      let ended = false;
      const end = (msg?: string) => {
        if (ended) return;
        ended = true;
        w.terminate();
        if (this.checkWorker === w) this.checkWorker = null;
        this.checkCancel = null;
        for (const f of files) this.checkExpected.delete(f.name.toLowerCase());
        this.set(msg ? { checking: null, message: msg } : { checking: null });
        if (!this.gated()) this.pump();
        resolve();
      };
      this.checkCancel = () => end();
      w.onmessage = (e: MessageEvent) => {
        const m = e.data as { type: string; check?: ArchiveCheck; name?: string; done?: number; total?: number; message?: string };
        if (m.type === 'check-progress') this.set({ checking: { name: m.name!, done: m.done!, total: m.total!, mode } });
        else if (m.type === 'check-result') this.recordCheck(m.check!);
        else if (m.type === 'check-done') end();
        else if (m.type === 'check-error') end();
      };
      w.onerror = () => end();
      w.postMessage({ type: 'check', files, dir: opfsDirName(), mode, save });
    });
  }

  /** Annule le contrôle en cours (le Worker est arrêté) */
  cancelChecks(): void {
    this.checkCancel?.();
    this.checkExpected.clear();
  }

  /** Les contrôles des archives obligatoires sont-ils tous connus ? (résout aussi après `timeout` ms) */
  awaitChecks(timeout = 120000): Promise<void> {
    if (!this.checkExpected.size) return Promise.resolve();
    return new Promise((resolve) => {
      let off: (() => void) | null = null;
      const t = window.setTimeout(() => {
        off?.();
        resolve();
      }, timeout);
      off = this.subscribe(() => {
        if (this.checkExpected.size) return;
        window.clearTimeout(t);
        off?.();
        resolve();
      });
    });
  }

  /**
   * « Vérification complète » : relit TOUTES les archives (copie OPFS si elle existe, sinon les fichiers en service), calcule le MD5 et cherche
   * toute zone vide de 64 Ko ou plus. Annulable (`cancelChecks`). Renvoie les résultats.
   */
  async verifyArchives(mode: 'quick' | 'full' = 'full'): Promise<ArchiveCheck[]> {
    await this.init();
    const opfs = this.st.source === 'opfs' && typeof navigator.storage?.getDirectory === 'function' ? (await this.opfsFiles()).files : [];
    const files = opfs.length ? opfs : [...(this.files ?? []), ...((this.audio as unknown as { files: File[] }).files ?? []).filter((f) => isAudioMpq(f.name))];
    const mpq = files.filter((f) => /\.mpq$/i.test(f.name));
    await this.startCheck(mpq, mode, opfs.length > 0 && !this.copyActive);
    return mpq.map((f) => this.st.checks[f.name.toLowerCase()]).filter((c): c is ArchiveCheck => !!c);
  }

  /* ------------------------------ audio local ------------------------------ */

  private audioMetaKey = (): string => new URL('d2-audio/meta.json', new URL('./', location.href)).href;

  private async loadAudioMeta(): Promise<void> {
    try {
      const c = await caches.open(storeName(D2_AUDIO_CACHE));
      const r = await c.match(this.audioMetaKey());
      const m = r ? ((await r.json()) as AudioMeta) : null;
      if (m && audioStaleReason(m, null) === 'generator') {
        await deleteCache(D2_AUDIO_CACHE);
        this.audioMeta = null;
      } else this.audioMeta = m;
      this.audio.hasCache = !!this.audioMeta;
      if (this.audioMeta) this.audio.setFiles([]);
      this.set({ audio: { ...this.st.audio, cached: this.audio.hasCache } });
    } catch {
      this.audioMeta = null;
    }
  }

  /**
   * Archives sonores reçues (ou retrouvées) : empreinte (avec d2exp/d2data, d'où vient Sounds.txt), invalidation des sons décodés si
   * elles changent, Workers repartis de zéro. `gfx` = empreintes des graphismes ; sans archives audio, les sons déjà décodés restent lisibles.
   */
  private async useAudio(audioFiles: File[], source: StoreKind, gfx: FileFingerprint[]): Promise<void> {
    const good: File[] = [];
    for (const f of audioFiles) {
      try {
        if (f.size >= 1024 && looksLikeMpq(new Uint8Array(await f.slice(0, 2048).arrayBuffer()))) good.push(f);
      } catch {
        /* illisible : ignorée */
      }
    }
    const tables = (this.files ?? []).filter((f) => (AUDIO_TABLE_MPQ as readonly string[]).includes(f.name.toLowerCase()));
    if (good.length) {
      const prints: FileFingerprint[] = [];
      for (const f of good) prints.push({ name: f.name, size: f.size, fp: await fingerprintFile(f) });
      this.audioFps = Object.fromEntries(prints.map((p) => [p.name, p.fp]));
      const fp = setFingerprint([...prints, ...gfx.filter((p) => (AUDIO_TABLE_MPQ as readonly string[]).includes(p.name.toLowerCase()))]);
      if (audioStaleReason(this.audioMeta, fp)) {
        try {
          await deleteCache(D2_AUDIO_CACHE);
        } catch {
          /* ignoré */
        }
        this.audio.hasCache = false;
      }
      this.audioMeta = { gen: AUDIO_GENERATOR_VERSION, fp, created: this.audioMeta?.created ?? Date.now() };
      try {
        await (await caches.open(storeName(D2_AUDIO_CACHE))).put(this.audioMetaKey(), new Response(JSON.stringify(this.audioMeta)));
      } catch (e) {
        this.noteQuota(e);
      }
      this.audio.hasCache = true;
    }
    if (good.length || tables.length || this.audio.hasCache) this.audio.setFiles(good.length ? [...good, ...tables] : []);
    const opfs = source === 'opfs';
    this.set({
      audio: {
        names: good.map((f) => f.name),
        bytes: good.reduce((a, f) => a + f.size, 0),
        source: good.length ? (opfs ? 'opfs' : source) : 'none',
        cached: this.audio.hasCache,
        partial: this.st.audio.partial,
      },
    });
    if (good.length || this.audio.hasCache) this.announceAudio();
  }

  private announceAudio(): void {
    this.onAudioReady?.();
  }

  /** Le moteur audio réclame un fichier du dossier `audio/` (ou une plage d'un paquet) : décodé à la demande, null s'il n'est pas disponible */
  async readAudio(path: string, range?: [number, number]): Promise<Uint8Array | null> {
    await this.init();
    return this.audio.read(path, range);
  }

  /**
   * Ajoute (ou remplace) les archives sonores sans toucher aux graphismes. `copy` : copie persistante dans OPFS (≈ 1 Go) ; sinon
   * lues telles quelles, à choisir de nouveau au prochain lancement (les sons déjà décodés restent en cache).
   */
  async provideAudioFiles(files: File[], opts: { copy: boolean; handles?: FileSystemFileHandle[] } = { copy: false }): Promise<{ used: string[]; ignored: string[]; copied: boolean; note: string }> {
    await this.init();
    const mpq = files.filter((f) => /\.mpq$/i.test(f.name));
    const aud = mpq.filter((f) => isAudioMpq(f.name));
    const ignored = mpq.filter((f) => !isAudioMpq(f.name)).map((f) => f.name);
    if (!aud.length) return { used: [], ignored, copied: false, note: '' };
    let copy = opts.copy;
    let note = '';
    if (copy) {
      const est = await storageEstimate();
      const plan = copyPlan(
        aud.map((f) => f.size),
        est.quota,
        est.usage,
        100e6,
      );
      if (!plan.fits || !navigator.storage?.getDirectory) {
        copy = false;
        note = `Not enough space to copy the sounds (${fmtMo(plan.need)} needed, ${fmtMo(plan.free ?? 0)} free): they will be read at each launch and must be selected again.`;
      }
    }
    this.resetChecks(aud.map((f) => f.name));
    this.ensureChecks(aud, 'session');
    await this.useAudio(aud, 'session', this.meta?.files ?? []);
    if (copy) void this.copyToOpfs(aud);
    void this.persist();
    return { used: aud.map((f) => f.name), ignored, copied: copy, note };
  }

  /** Archives audio fournies : nom et taille (récapitulatif des fichiers) */
  audioFileInfo(): { name: string; size: number }[] {
    return this.audio.fileList;
  }

  /**
   * Ajoute UNE archive à celles déjà connues, sans tout resélectionner : sons (d2sfx, d2speech, d2xtalk, d2music) ajoutés au pool audio,
   * autres archives (Patch_D2, patch Project Diablo 2, ou remplacement d'une archive requise) ajoutées aux graphismes. La copie dans OPFS
   * est vérifiée comme à l'import ; les fichiers déjà copiés ne sont pas recopiés. Ajouter une archive de graphismes change l'empreinte :
   * ce qui a été généré est refait.
   */
  async addMpq(file: File): Promise<{ ok: boolean; message: string }> {
    await this.init();
    if (!/\.mpq$/i.test(file.name)) return { ok: false, message: 'This is not an .mpq file.' };
    if (file.size < 1024 || !looksLikeMpq(new Uint8Array(await file.slice(0, 2048).arrayBuffer())))
      return { ok: false, message: `${file.name} is not a valid MPQ archive (or the file is truncated).` };
    if (isAudioMpq(file.name)) {
      const same = (f: { name: string }) => f.name.toLowerCase() === file.name.toLowerCase();
      const files = [...(this.audio as unknown as { files: File[] }).files.filter((f) => isAudioMpq(f.name) && !same(f)), file];
      const copy = this.st.audio.source === 'opfs' || file.size < 150e6;
      const r = await this.provideAudioFiles(files, { copy });
      return { ok: r.used.includes(file.name), message: r.used.length ? `${file.name} added.${r.note ? ` ${r.note}` : ''}` : 'Not a sound archive.' };
    }
    // archives déjà connues : celles en service, celles choisies plus tôt mais pas encore valides (il en manquait une), les copies complètes d'OPFS
    const byName = new Map<string, File>();
    for (const f of (await this.opfsFiles()).files) byName.set(f.name.toLowerCase(), f);
    for (const f of this.provided.values()) byName.set(f.name.toLowerCase(), f);
    for (const f of this.files ?? []) byName.set(f.name.toLowerCase(), f);
    byName.delete(file.name.toLowerCase());
    const known = [...byName.values()].filter((f) => !isAudioMpq(f.name));
    const report = await this.provideFiles([...known, file], { store: 'opfs' });
    return { ok: report.ok, message: report.ok ? `${file.name} added: the graphics are being rebuilt with it.` : report.messages.join(' ') };
  }

  /** Efface les sons décodés (les archives restent) : ils seront redécodés à la demande */
  async clearAudio(): Promise<void> {
    await this.audio.clear();
    this.audioMeta = null;
    this.set({ audio: { ...this.st.audio, cached: false } });
  }

  private async persist(): Promise<void> {
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* ignoré */
    }
  }

  private async copyToOpfs(files: File[]): Promise<void> {
    const w = newWorker();
    const prev = this.st.phase;
    const copyT0 = performance.now();
    hint(true);
    this.copyActive = true;
    this.set({ copy: { name: '', done: 0, size: 0, all: 0, total: files.reduce((a, f) => a + f.size, 0) } });
    await new Promise<void>((resolve) => {
      w.onmessage = async (e: MessageEvent) => {
        const m = e.data as { type: string; name?: string; done?: number; size?: number; all?: number; total?: number; quota?: boolean; message?: string; verifying?: boolean; check?: ArchiveCheck };
        if (m.type === 'check-result') this.recordCheck(m.check!);
        else if (m.type === 'copy-progress') this.set({ copy: { name: m.name!, done: m.done!, size: m.size!, all: m.all!, total: m.total!, verifying: !!m.verifying } });
        else if (m.type === 'copy-done') {
          w.terminate();
          this.copyActive = false;
          // les fichiers de la copie remplacent ceux de la session (ils survivent au rechargement)
          const opfs = await this.opfsFiles();
          const audioCopied = this.st.audio.names.length > 0 && this.st.audio.names.every((n) => opfs.files.some((f) => f.name.toLowerCase() === n.toLowerCase()));
          this.set({
            copyMs: Math.round(performance.now() - copyT0),
            copy: null,
            persistent: opfs.complete,
            integrity: opfs.complete ? { state: opfs.verified ? 'verified' : 'unverified', files: [], at: Date.now() } : this.st.integrity,
            source: opfs.complete ? 'opfs' : this.st.source,
            message: opfs.complete ? 'Diablo II files copied to this device: no need to select them again.' : this.st.message,
            audio: { ...this.st.audio, source: audioCopied ? 'opfs' : this.st.audio.source, partial: opfs.partialAudio },
          });
          resolve();
        } else if (m.type === 'copy-error') {
          w.terminate();
          this.copyActive = false;
          this.set({
            copy: null,
            persistent: false,
            phase: this.st.phase === 'copying' ? prev : this.st.phase,
            message: m.quota
              ? 'Not enough storage space to copy the files: you will have to select them again at each launch. Free some space and retry to resume the copy.'
              : `Copying the files failed: ${m.message}. You will have to select them again at each launch.`,
          });
          resolve();
        }
      };
      w.onerror = () => {
        w.terminate();
        this.copyActive = false;
        this.set({ copy: null, persistent: false });
        resolve();
      };
      w.postMessage({ type: 'copy', files, dir: opfsDirName(), fps: { ...Object.fromEntries((this.meta?.files ?? []).map((f) => [f.name, f.fp])), ...this.audioFps } });
    });
  }

  /** Appel d'une tâche du Worker de copie (vérification, suppression, test) : résout avec le message final */
  private workerCall(msg: Record<string, unknown>, done: string, onProgress?: (m: { done: number; total: number }) => void): Promise<{ results?: IntegrityFile[]; message?: string; error?: boolean }> {
    return new Promise((resolve) => {
      const w = newWorker();
      w.onmessage = (e: MessageEvent) => {
        const m = e.data as { type: string; results?: IntegrityFile[]; message?: string; done?: number; total?: number };
        if (m.type === 'verify-progress') onProgress?.({ done: m.done!, total: m.total! });
        else if (m.type === done) {
          w.terminate();
          resolve({ results: m.results });
        } else if (/-error$/.test(m.type)) {
          w.terminate();
          resolve({ message: m.message, error: true });
        }
      };
      w.onerror = () => {
        w.terminate();
        resolve({ message: 'worker error', error: true });
      };
      w.postMessage({ ...msg, files: [], dir: opfsDirName() });
    });
  }

  /**
   * Relit la copie OPFS et la compare aux empreintes enregistrées à la copie (sans le fichier source). Met à jour `status.integrity`.
   * `ok` seulement si TOUS les fichiers de la copie sont vérifiés et conformes.
   */
  async verifyFiles(): Promise<{ ok: boolean; unavailable: boolean; files: IntegrityFile[]; message: string }> {
    if (this.st.source !== 'opfs' || !navigator.storage?.getDirectory) {
      return { ok: false, unavailable: true, files: [], message: 'The files are not copied to this device: nothing to verify.' };
    }
    const prev = this.st.integrity;
    this.set({ integrity: { ...prev, state: 'checking' } });
    const r = await this.workerCall({ type: 'verify' }, 'verify-done', (p) => this.set({ copy: { name: '', done: p.done, size: p.total, all: p.done, total: p.total, verifying: true } }));
    this.set({ copy: null });
    if (r.error || !r.results) {
      this.set({ integrity: { ...prev, state: prev.state === 'checking' ? 'unknown' : prev.state } });
      return { ok: false, unavailable: false, files: [], message: `Could not read the copied files: ${r.message ?? 'unknown error'}.` };
    }
    const files = r.results.filter((f) => !isAudioMpq(f.name) || f.status !== 'unverified');
    const damaged = files.filter((f) => f.status === 'damaged' || f.status === 'size' || f.status === 'missing');
    const unver = files.filter((f) => f.status === 'unverified');
    const state: IntegrityStatus['state'] = damaged.length ? 'damaged' : unver.length ? 'unverified' : 'verified';
    this.set({ integrity: { state, files, at: Date.now() } });
    const message = damaged.length
      ? `Damaged copy: ${damaged.map((f) => f.name).join(', ')}.`
      : unver.length
        ? `Copy made without fingerprints (older version): ${unver.map((f) => f.name).join(', ')} cannot be verified.`
        : 'All copied files match their fingerprints.';
    return { ok: state === 'verified', unavailable: false, files, message };
  }

  /**
   * Réparation : vérifie la copie. Valide : rien à faire (le problème est ailleurs). Sinon : supprime la copie des fichiers concernés
   * (abîmés ou invérifiables), oublie ce qui a été généré à partir d'elle et demande de re-sélectionner les fichiers (recopie vérifiée).
   */
  async repairFiles(): Promise<{ action: 'valid' | 'reselect' | 'unavailable' | 'error'; dropped: string[]; message: string }> {
    const v = await this.verifyFiles();
    if (v.unavailable) return { action: 'unavailable', dropped: [], message: v.message };
    if (!v.files.length) return { action: 'error', dropped: [], message: v.message };
    if (v.ok) return { action: 'valid', dropped: [], message: 'The copied files are intact (verified against their fingerprints): the problem comes from somewhere else. The diagnostic is kept.' };
    const bad = v.files.filter((f) => f.status !== 'ok');
    const names = bad.map((f) => f.name);
    this.abortAll();
    await this.workerCall({ type: 'drop', names }, 'drop-done');
    this.resetChecks(names);
    this.files = null;
    this.audio.setFiles([]);
    await localClear();
    this.manifest = emptyManifest();
    this.cat = null;
    this.extrasReady.clear();
    this.failedIds.clear();
    this.bytesGenerated = 0;
    const why = bad.some((f) => f.status === 'unverified') && !bad.some((f) => f.status === 'damaged') ? 'cannot be verified (copied by an older version)' : 'is damaged on this device';
    const message = `${names.join(', ')} ${why}. It was removed: choose your Diablo II files again and they will be copied again with verification.`;
    this.set({ phase: 'needfiles', source: 'none', persistent: false, hasCache: false, readyCount: 0, report: null, message, integrity: { state: 'unknown', files: [], at: Date.now() } });
    return { action: 'reselect', dropped: names, message };
  }

  /** Test seulement : altère `n` octets de la copie OPFS de `name` à `offset` (simule une copie corrompue) */
  async testCorruptCopy(name: string, offset: number, n = 16): Promise<boolean> {
    const r = await this.workerCall({ type: 'testcorrupt', names: [name], at: offset, n }, 'testcorrupt-done');
    return !r.error;
  }

  /** Prêt au palier donné ? Planche, sol, lot (interface, icônes) ou carte (`map:<id>` : données et images) */
  assetReady(id: string, tier: Tier): boolean {
    if (id.startsWith('map:')) {
      const mid = id.slice(4);
      return this.mapDataReady(mid) && this.mapReady(mid, tier);
    }
    return this.isReady(id, tier);
  }

  /** Octets générés pour cet asset au palier donné (manifeste) ; les lots d'interface / d'icônes ne sont pas mesurés : estimation */
  assetBytes(id: string, tier: Tier): number {
    if (id.startsWith('map:')) return this.manifest.maps?.[id.slice(4)]?.bytes ?? 0;
    if (id in EXTRA_MARKERS) return Math.round(COST.extras.bytes / Object.keys(EXTRA_MARKERS).length);
    const e = this.manifest.sheets[id] ?? this.manifest.tiles[id];
    return e && hasTier(e, tier) ? e[tier].bytes : 0;
  }

  /** Demande un asset de récapitulatif (planche, lot ou carte `map:<id>`) à la priorité donnée */
  requestAsset(id: string, tier: Tier, prio: number): Promise<boolean> {
    if (id.startsWith('map:')) return this.requestMap(id.slice(4), { tier, prio });
    return this.request(id, tier, prio);
  }

  /**
   * Efface ce qui a été généré pour ces assets (planches, sols, lots, cartes) : fichiers du cache et entrées du manifeste. Les fichiers
   * Diablo II ne sont pas touchés ; les assets seront refabriqués à la demande. Renvoie le nombre d'assets effacés.
   */
  async clearAssets(ids: string[]): Promise<number> {
    const set = new Set(ids);
    this.queue.cancel((j) => set.has(j.id) || set.has(`map:${mapIdOfAsset(j.id)}`));
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pats: RegExp[] = [];
    let n = 0;
    for (const id of ids) {
      if (id.startsWith('map:')) {
        const mid = id.slice(4);
        pats.push(new RegExp(`^maps/${esc(mid)}(\\.json|-[gt][^/]*\\.png)$`));
        if (this.manifest.maps?.[mid]) {
          this.bytesGenerated = Math.max(0, this.bytesGenerated - this.manifest.maps[mid].bytes);
          delete this.manifest.maps[mid];
          n++;
        }
        for (const t of ['hi', 'lo']) this.sliceDone.delete(`${mid}|${t}`);
      } else if (id in EXTRA_MARKERS) {
        pats.push(id === 'ui' ? /^ui\// : id === 'text:npc' ? /^audio\/npc-text\.json$/ : new RegExp(`^icons/${esc(id.slice(6))}\\.`));
        if (this.extrasReady.delete(id)) n++;
      } else {
        pats.push(new RegExp(`^(hi|lo)/${esc(id)}(\\.json|-\\d+\\.[a-z]+)$`));
        const e = this.manifest.sheets[id] ?? this.manifest.tiles[id];
        if (e) {
          this.bytesGenerated = Math.max(0, this.bytesGenerated - (e.hi.bytes + e.lo.bytes));
          delete this.manifest.sheets[id];
          delete this.manifest.tiles[id];
          n++;
        }
      }
      this.failedIds.delete(id);
      this.failures.delete(id);
    }
    try {
      const c = await caches.open(storeName(D2_LOCAL_CACHE));
      const base = keyOf('');
      for (const r of await c.keys()) {
        if (!r.url.startsWith(base)) continue;
        const path = r.url.slice(base.length);
        if (pats.some((p) => p.test(path))) await c.delete(r);
      }
    } catch {
      /* ignoré */
    }
    this.st.extras = [...this.extrasReady];
    this.st.readyCount = Object.keys(this.manifest.sheets).length + Object.keys(this.manifest.tiles).length;
    (this.manifest as unknown as { bytes: number }).bytes = this.bytesGenerated;
    await this.saveNow();
    this.onChange?.();
    this.notify();
    return n;
  }

  /** Oublie les fichiers mémorisés (copie OPFS et poignées) : les graphismes générés restent */
  async forgetFiles(): Promise<void> {
    this.abortAll();
    this.files = null;
    this.audio.setFiles([]);
    this.cancelChecks();
    this.set({ phase: 'needfiles', source: 'none', persistent: false, report: null, message: '', audio: { ...EMPTY_AUDIO(), cached: this.audio.hasCache }, checks: {} });
    await idbClear();
    try {
      hint(false);
      await removeOpfsDir();
    } catch {
      /* rien à supprimer */
    }
  }

  /** Efface les graphismes générés (les MPQ copiés restent, la génération reprendra à la demande) */
  async clearGenerated(): Promise<void> {
    resetPregenDone();
    const wasFiles = this.files;
    this.abortAll();
    await localClear();
    this.manifest = emptyManifest();
    this.extrasReady.clear();
    this.failedIds.clear();
    this.bytesGenerated = 0;
    this.meta = this.meta ? { ...this.meta } : null;
    if (this.meta) {
      try {
        await (await caches.open(storeName(D2_LOCAL_CACHE))).put(keyOf('meta.json'), new Response(JSON.stringify(this.meta)));
        if (this.cat) await (await caches.open(storeName(D2_LOCAL_CACHE))).put(keyOf('catalog.json'), new Response(JSON.stringify({ gen: GENERATOR_VERSION, catalog: this.cat })));
      } catch {
        /* ignoré */
      }
    }
    this.files = wasFiles;
    this.set({ hasCache: false, readyCount: 0, quotaFull: false, generated: 0, failed: 0, genMs: 0, batch: { done: 0, total: 0 }, all: { done: 0, total: 0, running: false } });
    this.onChange?.();
  }

  /* --------------------------- moteurs (Workers) --------------------------- */

  private abortAll(): void {
    this.queue.cancel(() => true);
    for (const s of this.slots) {
      s.dead = true;
      s.w.terminate();
      if (s.job) this.queue.finish(s.job.job, false);
    }
    this.slots = [];
  }

  private spawn(): Slot {
    const w = newWorker();
    const slot: Slot = { w, ready: false, dead: false, job: null };
    slot.w.onmessage = (e: MessageEvent) => void this.onWorker(slot, e.data as Record<string, unknown>);
    slot.w.onerror = (ev) => {
      slot.dead = true;
      this.set({ message: `The graphics generator stopped (${ev.message}).` });
      if (slot.job) {
        // un Worker qui plante (mémoire…) en pleine génération : l'échec est consigné (sinon personne ne saurait pourquoi rien n'arrive)
        const j = slot.job.job;
        this.failedIds.add(j.id);
        this.failures.set(j.id, { id: j.id, tier: j.tier, error: `generator crashed: ${ev.message || 'no message'}`, stack: '', ms: 0, at: Date.now() });
        this.st.failed++;
        this.queue.finish(j, false);
        slot.job = null;
      }
      this.slots = this.slots.filter((s) => s !== slot);
      this.pump();
    };
    this.slots.push(slot);
    w.postMessage({ type: 'open', files: this.files, cache: storeName(D2_LOCAL_CACHE), prefix: keyOf('') });
    return slot;
  }

  private slotReady = new Map<Slot, (() => void)[]>();
  private allKeys = new Set<string>();

  private async ensureSlot(): Promise<void> {
    if (!this.files) return;
    let s = this.slots.find((x) => !x.dead);
    if (!s) s = this.spawn();
    if (s.ready) return;
    await new Promise<void>((res) => this.slotReady.set(s!, [...(this.slotReady.get(s!) ?? []), res]));
  }

  private async onWorker(slot: Slot, m: Record<string, unknown>): Promise<void> {
    if (m.type === 'opened') {
      slot.ready = true;
      const catalog = m.catalog as LocalCatalog | undefined;
      const invalid = (m.invalid as string[] | undefined) ?? [];
      if (catalog && !this.cat) this.setCatalog(catalog);
      if (invalid.length) this.set({ message: `Unreadable archives ignored: ${invalid.join(', ')}.` });
      for (const r of this.slotReady.get(slot) ?? []) r();
      this.slotReady.delete(slot);
      this.onChange?.();
      this.pump();
    } else if (m.type === 'error') {
      this.noteQuota(m);
      const msg = `Cannot read the Diablo II files: ${String(m.message)}`;
      this.set({ phase: 'error', message: msg });
      // ce Worker n'ouvrira jamais rien : on le retire (sinon il occupe la place et les demandes restent en file pour toujours)
      slot.dead = true;
      slot.w.terminate();
      this.slots = this.slots.filter((s) => s !== slot);
      for (const j of this.queue.snapshot()) {
        this.failedIds.add(j.id);
        this.failures.set(j.id, { id: j.id, tier: j.tier, error: msg, stack: '', ms: 0, at: Date.now() });
      }
      this.queue.cancel(() => true);
      for (const r of this.slotReady.get(slot) ?? []) r();
      this.slotReady.delete(slot);
    } else if (m.type === 'job-done') {
      const cur = slot.job;
      slot.job = null;
      if (cur) await this.finishJob(cur.job, m);
      this.pump();
    }
  }

  private async finishJob(job: GenJob, m: Record<string, unknown>): Promise<void> {
    const rep = m.report as LocalSheetReport;
    if (!rep.ok) {
      // annulé par nous (carte d'arrière-plan cédée à une demande urgente) : pas un échec, la demande reviendra
      if (rep.error !== CANCELLED) {
        this.failedIds.add(job.id);
        this.failures.set(job.id, { id: job.id, tier: job.tier, error: rep.error ?? 'unknown', stack: rep.stack ?? '', ms: rep.ms, at: Date.now() });
      }
      if (isMapAsset(job.id)) {
        this.sliceDone.delete(`${mapIdOfAsset(job.id)}|${job.tier}`);
        if (this.mapLog.length < 400) this.mapLog.push({ id: job.id, tier: job.tier, ms: rep.ms, error: rep.error ?? '' });
      }
      if (m.quota) this.noteQuota({ name: 'QuotaExceededError' });
      if (rep.error !== CANCELLED) this.st.failed++;
      this.st.batch.done++;
      this.queue.finish(job, false);
      this.afterJob(job);
      return;
    }
    const kind = rep.kind ?? 'sheet';
    if (rep.warnings?.length) this.warns.set(job.id, rep.warnings.slice(0, 40));
    const entry = m.entry as ManifestEntry | undefined;
    let newMapData: string | null = null;
    if (kind === 'map') {
      const mid = mapIdOfAsset(job.id);
      const maps = (this.manifest.maps ??= {});
      const prev: MapEntry = maps[mid] ?? { data: false, hi: false, lo: false, bytes: 0 };
      const dataOnly = job.id.startsWith('mapdata:');
      // découpé en parts : le palier n'est prêt que quand toutes les parts ont écrit leurs images
      const nSl = mapSlicesOf(job.id);
      let complete = true;
      if (nSl > 1) {
        const k = `${mid}|${job.tier}`;
        const done = (this.sliceDone.get(k) ?? 0) + 1;
        complete = done >= nSl;
        if (complete) this.sliceDone.delete(k);
        else this.sliceDone.set(k, done);
      }
      const next: MapEntry = { ...prev, data: true, bytes: prev.bytes + rep.bytes };
      const rv = mapRevision(mid);
      if (rv) next.rev = rv;
      if (rep.info?.chunks !== undefined) next.chunks = rep.info.chunks;
      if (!dataOnly && complete) next[job.tier] = true;
      maps[mid] = next;
      if (!prev.data) newMapData = mid;
      if (rep.info && this.mapLog.length < 400) this.mapLog.push({ id: job.id, tier: job.tier, ms: rep.ms, bytes: rep.bytes, files: rep.files, ...rep.info });
    }
    let merged: ManifestEntry | undefined;
    if (entry && kind !== 'files') {
      const table = kind === 'tile' ? this.manifest.tiles : this.manifest.sheets;
      merged = mergeEntry(table[job.id], entry, [job.tier]);
    }
    // SpriteBank charge et met en place la planche AVANT qu'elle soit déclarée prête : pas d'image où le sprite disparaîtrait
    const h0 = performance.now();
    try {
      if (this.hook) await this.hook(job.id, job.tier, kind, merged);
    } catch {
      /* le chargement échouera de nouveau à la demande */
    }
    if (this.timeline.length < 4000) this.timeline.push([Math.round(h0), `${job.id}:${job.tier} calc ${rep.ms} ms, mise en place ${Math.round(performance.now() - h0)} ms`]);
    if (merged) (kind === 'tile' ? this.manifest.tiles : this.manifest.sheets)[job.id] = merged;
    if (kind === 'files') {
      this.extrasReady.add(job.id);
      this.st.extras = [...this.extrasReady];
      this.onExtra?.(job.id);
    }
    this.bytesGenerated += rep.bytes;
    (this.manifest as unknown as { bytes: number }).bytes = this.bytesGenerated;
    this.st.generated++;
    if (this.genLog.length < 4000) this.genLog.push(`${job.id}:${job.tier}:${rep.ms}`);
    this.st.genMs += rep.ms;
    this.st.batch.done++;
    this.st.readyCount = Object.keys(this.manifest.sheets).length + Object.keys(this.manifest.tiles).length;
    this.st.hasCache = true;
    this.queue.finish(job, true);
    this.scheduleSave();
    this.afterJob(job);
    if (newMapData) this.onMapData?.(newMapData);
  }

  private afterJob(job: GenJob): void {
    if (this.st.all.running && this.allKeys.delete(job.key)) {
      this.st.all.done = Math.min(this.st.all.total, this.st.all.done + 1);
      if (!this.allKeys.size) this.st.all.running = false;
    }
    if (this.queue.pending + this.queue.active === 0) {
      this.st.batch = { done: 0, total: 0 };
      void this.saveNow();
    }
    this.notify();
  }

  noteQuota(e: unknown): void {
    const x = e as { name?: string; message?: string; quota?: boolean };
    if (x?.name === 'QuotaExceededError' || x?.quota || /quota/i.test(x?.message ?? '')) {
      if (this.st.quotaFull) return;
      this.queue.cancel(() => true);
      this.st.batch = { done: 0, total: 0 };
      this.set({
        quotaFull: true,
        message: 'Storage full: the remaining Diablo II graphics cannot be prepared. Free some space on the device or clear the generated graphics, then restart.',
        all: { ...this.st.all, running: false },
      });
    }
  }

  private pump(): void {
    if (!this.files || this.st.quotaFull || this.gated()) return;
    while (this.queue.pending > 0) {
      const idle = this.slots.find((s) => s.ready && !s.dead && !s.job);
      if (!idle) {
        const live = this.slots.filter((s) => !s.dead);
        if (live.length < this.poolSize) {
          this.spawn();
          return;
        }
        if (this.queue.snapshot().some((j) => j.prio <= PRIO.near)) this.yieldBackgroundMap();
        break;
      }
      // la tâche de fond (« tout générer ») laisse toujours un Worker libre pour ce que le jeu demande
      const bgFull = this.queue.runningFrom(PRIO.background) >= Math.max(1, this.poolSize - 1);
      // cartes : deux Workers au plus (mémoire et fil principal), le reste des Workers sert les planches
      // (les cartes d'arrière-plan, interruptibles, ne comptent pas contre une demande urgente ; il n'y en a jamais plus d'une)
      const mapJobs = this.slots.filter((x) => x.job && isMapAsset(x.job.job.id));
      const urgentMaps = mapJobs.filter((x) => x.job!.job.prio < PRIO.background).length;
      const job = this.queue.next((j) => {
        if (bgFull && j.prio >= PRIO.background) return false;
        if (!isMapAsset(j.id)) return true;
        return j.prio >= PRIO.background ? mapJobs.length === 0 : urgentMaps < MAX_MAP_WORKERS;
      });
      if (!job) break;
      const id = this.jobSeq++;
      idle.job = { job, id };
      idle.w.postMessage({ type: 'job', jobId: id, id: job.id, tiers: [job.tier], testFail: this.testFail(job.id) });
    }
    if (this.queue.pending > 0 && !this.slots.some((s) => !s.dead)) this.spawn();
    this.notify();
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = window.setTimeout(() => void this.saveNow(), 3000);
  }

  private async saveNow(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    try {
      await (await caches.open(storeName(D2_LOCAL_CACHE))).put(keyOf('manifest.json'), new Response(JSON.stringify(this.manifest)));
    } catch (e) {
      this.noteQuota(e);
    }
  }

  /* -------------------------------- cartes -------------------------------- */

  /** Cartes générables avec les fichiers du joueur (identifiants de `maps/index.json`) ; celles déjà en cache si les fichiers manquent */
  mapIds(): string[] {
    if (!d2LocalMapsEnabled()) return [];
    const cat = this.cat?.maps;
    const cached = Object.entries(this.manifest.maps ?? {})
      .filter(([, e]) => e.data)
      .map(([k]) => k);
    return [...new Set([...(cat ?? []), ...cached])];
  }

  /** Carte entièrement disponible au palier : données et images */
  mapReady(id: string, tier: Tier): boolean {
    const e = this.manifest.maps?.[id];
    return !!e && e.data && e[tier];
  }

  /** Cartes générées : nombre de cartes dont les données sont prêtes, nombre dont les images le sont (au moins un palier) */
  mapCounts(): { data: number; images: number; total: number } {
    const e = Object.values(this.manifest.maps ?? {});
    return { data: e.filter((m) => m.data).length, images: e.filter((m) => m.hi || m.lo).length, total: this.cat?.maps?.length ?? 0 };
  }

  /**
   * Palier à demander pour afficher une carte : le voulu s'il est prêt ou fabricable, sinon l'autre s'il est déjà en cache (fichiers du joueur
   * absents, stockage plein, palier jamais généré) ; à défaut le voulu (le jeu gardera alors la zone d'origine).
   */
  mapTierFor(id: string, want: Tier): Tier {
    if (this.mapReady(id, want) || (this.files && !this.st.quotaFull && !this.failedIds.has(mapAssetId(id)))) return want;
    const other: Tier = want === 'hi' ? 'lo' : 'hi';
    return this.mapReady(id, other) ? other : want;
  }

  mapDataReady(id: string): boolean {
    return !!this.manifest.maps?.[id]?.data;
  }

  /**
   * Demande une carte : `data` seul (JSON, sans encoder les images) ou carte complète d'un palier. Une demande de données rejoint une
   * génération complète déjà en file (elle écrit aussi le JSON). La promesse vaut true une fois les fichiers écrits.
   */
  requestMap(id: string, opts: { tier: Tier; prio: number; data?: boolean; rejoined?: boolean }): Promise<boolean> {
    if (!this.cat?.maps?.includes(id)) return Promise.resolve(this.mapDataReady(id) && (opts.data || this.mapReady(id, opts.tier)));
    if (opts.data ? this.mapDataReady(id) : this.mapReady(id, opts.tier)) return Promise.resolve(true);
    if (!this.files || this.st.quotaFull) return Promise.resolve(false);
    if (opts.data) {
      for (const t of ['hi', 'lo'] as const) {
        const full = this.mapFull.get(`${id}|${t}`);
        if (full) return this.joinMap(full, id, opts);
      }
      return this.request(mapDataAssetId(id), 'lo', opts.prio);
    }
    const key = `${id}|${opts.tier}`;
    const running = this.mapFull.get(key);
    if (running) return this.joinMap(running, id, opts);
    // grande carte en pleine résolution : deux Workers se partagent l'encodage des images (le calcul de la carte est refait par chacun)
    const slices = this.poolSize >= 2 && !d2LocalModest() && (this.manifest.maps?.[id]?.chunks ?? 0) >= MAP_SLICE_MIN_CHUNKS ? 2 : 1;
    const p =
      slices === 1
        ? this.request(mapAssetId(id), opts.tier, opts.prio)
        : Promise.all(Array.from({ length: slices }, (_, k) => this.request(mapSliceAssetId(id, k, slices), opts.tier, opts.prio))).then((r) => r.every(Boolean));
    this.mapFull.set(key, p);
    void p.finally(() => this.mapFull.delete(key));
    return p;
  }

  /**
   * Une demande qui rejoint la génération d'une carte déjà en file (lot 300) : une génération d'arrière-plan peut être arrêtée par une
   * demande urgente (`yieldBackgroundMap`) ou un changement de zone ; la promesse rejointe vaut alors false sans échec. Une demande plus
   * urgente que l'arrière-plan redemande la carte à sa propre priorité au lieu de conclure qu'elle manque (Survivals : « je n'ai pas les
   * assets de la zone suivante » au passage de zone, la carte de l'arène suivante étant en cours de génération en tâche de fond)
   */
  private joinMap(running: Promise<boolean>, id: string, opts: { tier: Tier; prio: number; data?: boolean; rejoined?: boolean }): Promise<boolean> {
    if (opts.prio >= PRIO.background || opts.rejoined) return running;
    return running.then((ok) => (ok || !this.files || this.failedIds.has(mapAssetId(id)) || this.failedIds.has(mapDataAssetId(id)) ? ok : this.requestMap(id, { ...opts, rejoined: true })));
  }

  /**
   * Lecture d'un fichier `maps/…` pour le jeu. L'index est fabriqué depuis le catalogue ; les données et les images d'une carte sont générées à la
   * demande. `wait` : attendre la génération (images, campagne) ; sinon renvoie null tout de suite et la carte est enregistrée à l'arrivée
   * (`onMapData`). null aussi quand la carte est impossible (le jeu garde alors la zone d'origine).
   */
  async readMap(path: string, tier: Tier, wait: boolean): Promise<Uint8Array | null> {
    const m = mapOfPath(path);
    if (!m || !d2LocalMapsEnabled()) return null;
    if (m.kind === 'index') {
      const ids = this.mapIds();
      return ids.length ? new TextEncoder().encode(JSON.stringify({ maps: ids })) : null;
    }
    const cached = await localRead(path);
    if (cached) return cached;
    if (m.kind === 'json') {
      // hors campagne : pas de génération déclenchée par la lecture (le démarrage lit une vingtaine de cartes) ; `idleMapPrefetch` s'en charge
      if (!wait) return null;
      return (await this.requestMap(m.id, { tier, prio: PRIO.player, data: true })) ? localRead(path) : null;
    }
    // image : demandée à l'entrée de la zone, bloquante (écran de chargement)
    const ok = await this.requestMap(m.id, { tier: m.tier ?? tier, prio: PRIO.zone });
    return ok ? localRead(path) : null;
  }

  /**
   * Cartes en arrière-plan : quand plus rien d'autre n'est demandé, génère les données (JSON) des cartes pas encore prêtes, une à la fois,
   * dans l'ordre donné. Appelé en boucle par SpriteBank ; renvoie false s'il n'y a plus rien à faire.
   */
  /** pour les mesures : suspend la préparation en arrière-plan des cartes */
  prefetchPaused = false;

  idleMapPrefetch(order: readonly string[], tier: Tier): boolean {
    if (this.prefetchPaused || !d2LocalMapsEnabled() || !this.files || this.st.quotaFull || this.st.copy) return false;
    const todo = order.filter((id) => this.cat?.maps?.includes(id) && !this.mapDataReady(id) && !this.failedIds.has(mapDataAssetId(id)) && !this.failedIds.has(mapAssetId(id)));
    if (!todo.length) return false;
    if (this.queue.pending + this.queue.active === 0) void this.requestMap(todo[0], { tier, prio: PRIO.background, data: true });
    return true;
  }

  /** Une demande urgente arrive alors que tous les Workers travaillent : une carte d'arrière-plan en cours s'arrête (elle sera redemandée) */
  private yieldBackgroundMap(): void {
    for (const s of this.slots) {
      if (s.dead || !s.job || s.job.job.prio < PRIO.background || !isMapAsset(s.job.job.id)) continue;
      s.w.postMessage({ type: 'cancel', jobId: s.job.id });
    }
  }

  /** Arrête les générations de carte en cours qui ne sont pas à `keep` (changement de zone avant la fin) ; les fichiers déjà écrits restent */
  cancelMaps(keep?: string): void {
    this.queue.cancel((j) => isMapAsset(j.id) && j.prio === PRIO.zone && mapIdOfAsset(j.id) !== keep);
    for (const s of this.slots)
      if (!s.dead && s.job && isMapAsset(s.job.job.id) && s.job.job.prio === PRIO.zone && mapIdOfAsset(s.job.job.id) !== keep) s.w.postMessage({ type: 'cancel', jobId: s.job.id });
  }

  /* ------------------------------ demandes ------------------------------ */

  /** Interface, icônes, objets au sol, texte : un lot chacun, demandés dès que les fichiers sont là (le jeu garde son repli d'ici là) */
  requestExtras(): void {
    for (const id of Object.keys(EXTRA_MARKERS)) {
      if (this.extrasReady.has(id) || this.failedIds.has(id)) continue;
      void this.request(id, 'lo', PRIO.player);
    }
  }

  /**
   * Met un asset en file avec une priorité. La promesse vaut true une fois généré (et en place), false s'il est impossible
   * (pas de fichiers, échec, stockage plein, annulé).
   */
  request(id: string, tier: Tier, prio: number): Promise<boolean> {
    if (this.isReady(id, tier)) return Promise.resolve(true);
    if (!this.canGenerate(id)) return Promise.resolve(false);
    if (!this.queue.has(id, tier) && prio < PRIO.background) this.st.batch.total++;
    const p = this.queue.add(id, tier, prio);
    this.pump();
    return p;
  }

  /** Comme `request` sans attendre le résultat, sans empiler d'écouteur si la demande existe déjà (appelé à chaque image) */
  want(id: string, tier: Tier, prio: number): void {
    if (this.isReady(id, tier) || !this.canGenerate(id)) return;
    if (this.queue.has(id, tier)) {
      this.queue.bump(id, tier, prio);
      return;
    }
    void this.request(id, tier, prio);
  }

  /** Retire de la file les demandes en attente de ces identifiants (préparation annulée : le joueur a quitté) ; le travail en cours finit */
  cancelIds(ids: ReadonlySet<string>): number {
    return this.queue.cancel((j) => ids.has(j.id) || (isMapAsset(j.id) && ids.has(`map:${mapIdOfAsset(j.id)}`) && j.prio === PRIO.zone));
  }

  /** Annule les demandes en attente moins urgentes que `prio` et hors de `keep` (changement de zone) */
  cancelAbove(prio: number, keep?: ReadonlySet<string>): number {
    const n = this.queue.cancelAbove(prio, keep, PRIO.background);
    this.st.batch.total = Math.max(this.st.batch.done, this.st.batch.total - n);
    this.notify();
    return n;
  }

  /** Nombre de demandes qui bloquent (priorité zone) : sert à décider d'un écran de chargement */
  pendingBlocking(): number {
    return this.queue.snapshot().filter((j) => j.prio === PRIO.zone).length;
  }

  /** Tout générer maintenant : tâche de fond à priorité minimale, avec reprise (ce qui est déjà prêt est sauté) */
  generateAll(tier: Tier | 'both'): number {
    if (!this.cat || !this.files) return 0;
    const c = this.cat;
    const tiers: Tier[] = tier === 'both' ? ['lo', 'hi'] : [tier];
    let n = 0;
    for (const id of [...c.extras, ...c.grounds, ...c.props, ...c.fx, ...c.units, ...c.parts]) {
      for (const t of tiers) {
        if (this.isReady(id, t) || this.failedIds.has(id) || this.queue.has(id, t)) continue;
        void this.queue.add(id, t, PRIO.background);
        this.allKeys.add(GenQueue.keyOf(id, t));
        n++;
      }
    }
    this.st.all = { done: 0, total: n, running: n > 0 };
    this.pump();
    this.notify();
    return n;
  }

  /** Arrête « tout générer » (ce qui est prêt est gardé) */
  stopAll(): void {
    this.queue.cancel((j) => j.prio >= PRIO.background);
    this.allKeys.clear();
    this.set({ all: { ...this.st.all, running: false } });
  }

  /** Estimation de « tout générer » pour ce palier (durée selon l'appareil, octets) */
  estimate(tier: Tier | 'both'): { seconds: number; bytes: number } | null {
    if (!this.st.counts) return null;
    return estimateAll(this.st.counts, tier, d2LocalModest() ? 4 : 1);
  }

  /** Statistiques de stockage du navigateur */
  async storage(): Promise<{ usage: number | null; quota: number | null; generated: number; persisted: boolean | null }> {
    const e = await storageEstimate();
    let persisted: boolean | null = null;
    try {
      persisted = (await navigator.storage?.persisted?.()) ?? null;
    } catch {
      /* ignoré */
    }
    return { ...e, generated: this.bytesGenerated, persisted };
  }

  /** Pour les tests : paliers présents d'un asset */
  tiersOf(id: string): Tier[] {
    return tiersOf(this.manifest.sheets[id] ?? this.manifest.tiles[id]);
  }
}

function countsOf(c: LocalCatalog): CatalogCounts {
  return { units: c.units.length, parts: c.parts.length, props: c.props.length, fx: c.fx.length, grounds: c.grounds.length };
}

async function storageEstimate(): Promise<{ usage: number | null; quota: number | null }> {
  try {
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? null, quota: e.quota ?? null };
  } catch {
    return { usage: null, quota: null };
  }
}

/** Empreinte rapide (SHA-1 de trois morceaux et de la taille) : identique à `quickFingerprint` du Worker */
async function fingerprintFile(f: File): Promise<string> {
  const n = Math.min(65536, f.size);
  const parts: Uint8Array[] = [];
  for (const pos of [0, Math.max(0, Math.floor(f.size / 2 - n / 2)), Math.max(0, f.size - n)]) parts.push(new Uint8Array(await f.slice(pos, pos + Math.min(n, f.size - pos)).arrayBuffer()));
  const all = new Uint8Array(parts.reduce((a, p) => a + p.length, 0) + 8);
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  new DataView(all.buffer).setFloat64(o, f.size, true);
  return sha1Hex(all);
}

/** Taille lisible, dans la langue du jeu (Mo / Go en français, MB / GB en anglais) */
export const fmtMo = (b: number): string => {
  return b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`;
};

/** Service unique de la page */
export const d2Local = new D2LocalService();

// point d'entrée des tests de bout en bout et du diagnostic (réglage caché seulement)
if (typeof window !== 'undefined' && d2LocalEnabled()) window.__d2local = d2Local;
