/**
 * Synchronisation des personnages entre appareils (compte sans e-mail, sauvegardes chiffrées côté client).
 * Le serveur (api/sync.ts) ne voit que des blobs chiffrés ; la clé de chiffrement est dérivée du mot de passe sur l'appareil.
 * Voir docs/ARCHITECTURE.md § « Synchronisation ».
 */
import { SYNC_ENABLED } from './build-flags';
import { SaveStore, keyOfSyncId, sharedRulesetOfSyncId, syncIdOfKey } from './platform';
import { checkKdfParams, decryptBlob, deriveKeys, encryptBlob, fromB64, normalizeAccountName, PBKDF2_ITERATIONS, randomSalt, toB64, type Derived } from './sync-crypto';
import { planSync, type LocalInfo, type Mark, type RemoteInfo } from './sync-merge';
import { DEFAULT_RULESET, mergeShared, type SharedStash } from '../sim/save';
import { migrateDb } from './idb-migrate';
import { legacyStoreName } from './legacy-names';

type SyncStatus = 'out' | 'idle' | 'syncing' | 'offline' | 'error' | 'conflict';
export interface SyncState {
  status: SyncStatus;
  account: string | null;
  /** Dernière synchronisation réussie (ms) */
  lastSync: number;
  /** Personnages en ligne (coffre partagé exclu) */
  count: number;
  /** Message d'erreur lisible (français) */
  message: string;
}

export class SyncError extends Error {
  constructor(
    msg: string,
    readonly code: string,
    readonly http = 0,
    readonly body: Record<string, unknown> = {},
  ) {
    super(msg);
  }
}

const META_KEY = 'd2m.sync.meta';
/** Délai d'un appel au service de synchronisation (envoi d'une sauvegarde complète compris) */
export const SYNC_TIMEOUT_MS = 30000;
/** Jeton aléatoire de l'appareil (32 octets, base64) : un appareil déjà connecté n'est pas bloqué par le verrouillage du compte (api/_lib/core.ts) */
const DEVICE_KEY = 'd2m.sync.device';
let memDevice = '';
/** Jeton de cet appareil, créé au premier besoin (repli en mémoire si le stockage est indisponible) */
export function deviceToken(): string {
  try {
    const t = localStorage.getItem(DEVICE_KEY);
    if (t && /^[A-Za-z0-9+/]{43}=$/.test(t)) return t;
    const n = toB64(crypto.getRandomValues(new Uint8Array(32)));
    localStorage.setItem(DEVICE_KEY, n);
    return n;
  } catch {
    return (memDevice ||= toB64(crypto.getRandomValues(new Uint8Array(32))));
  }
}
/** Identifiant d'emplacement valide ; les copies de l'emplacement d'origine (`backup`, `presync`, `premigration-stash`) n'en sont pas */
const SLOT_OK = /^(?!(?:backup|presync|premigration-stash)$)[a-z0-9][a-z0-9_-]{0,63}$/;
/** Réglages de la fréquence des envois (le quota Blob gratuit est très limité : moins d'écritures = moins d'opérations avancées) */
export const SYNC_TUNING = {
  /** Envoi après ce délai SANS nouvelle sauvegarde locale (anti-rebond) */
  idleMs: 3 * 60_000,
  /** Envoi forcé au plus tard ce délai après la première modification non envoyée (jeu continu) */
  maxMs: 10 * 60_000,
  /** Retour au premier plan : synchro complète seulement si l'onglet est resté caché plus longtemps */
  resyncAfterHiddenMs: 15 * 60_000,
  /** Recul après une erreur serveur : 1 min, 2, 4… plafonné */
  backoffMinMs: 60_000,
  backoffMaxMs: 30 * 60_000,
  /** Après autant d'échecs consécutifs, plus aucune tentative automatique jusqu'à une action explicite */
  maxAutoFailures: 5,
  /** Ne pas renvoyer un contenu identique au dernier envoi réussi */
  dedupe: true,
};
export const UNAVAILABLE_MSG = 'Synchronisation indisponible, réessai plus tard ; vos sauvegardes locales sont intactes.';

/** Empreinte (cyrb53) du contenu utile : l'horodatage `savedAt` change à chaque sauvegarde, il est ignoré */
export function contentFingerprint(text: string): string {
  let t = text;
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    if (o && typeof o === 'object' && 'savedAt' in o) {
      delete o.savedAt;
      t = JSON.stringify(o);
    }
  } catch {
    /* texte non JSON : empreinte brute */
  }
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${t.length}.${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`;
}
/** Erreur côté serveur / stockage (quota, suspension, indisponibilité) : on recule au lieu de réessayer */
function isServerFailure(e: unknown): boolean {
  const x = e as SyncError;
  return x instanceof SyncError && (x.code === 'server' || x.code === 'not_configured' || x.code === 'busy' || x.http >= 500);
}

interface Meta {
  account: string | null;
  remember: boolean;
  marks: Record<string, Mark>;
  tombs: Record<string, number>;
  lastSync: number;
  count: number;
}
interface Session extends Derived {
  name: string;
  salt: string;
  iterations: number;
}
/** Coffre partagé (d'un jeu de règles) plutôt qu'un personnage */
const isSharedId = (slot: string): boolean => sharedRulesetOfSyncId(slot) !== null;

/** Résumé lisible d'une version d'un personnage (fenêtre de conflit) */
export interface VersionSummary {
  /** Jeu de règles du personnage ou du coffre (`pd2` pour une sauvegarde d'avant la version 7) */
  ruleset: string;
  name: string;
  level: number;
  xp: number;
  savedAt: number;
}
export interface ConflictInfo {
  /** Identifiant d'emplacement */
  slot: string;
  shared: boolean;
  local: VersionSummary;
  remote: VersionSummary;
}
export type ConflictChoice = 'local' | 'remote' | 'both' | 'skip';

/* ------------------------------ IndexedDB (session mémorisée) ------------------------------ */
const DB = 'd2m-sync';
async function idb(): Promise<IDBDatabase> {
  // session remembered by an earlier version (former database name): copied once
  await migrateDb(DB, legacyStoreName('sync'), 'session');
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('session');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbOp<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  try {
    return await new Promise<T>((res, rej) => {
      const r = f(db.transaction('session', mode).objectStore('session'));
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  } finally {
    db.close();
  }
}

/** Résumé d'une version : `slot` dit s'il s'agit d'un coffre partagé et de quel jeu de règles */
function summarize(text: string, slot: string, savedAt: number): VersionSummary {
  const sr = sharedRulesetOfSyncId(slot);
  try {
    const d = JSON.parse(text) as { savedAt?: number; ruleset?: unknown; character?: { name?: string; level?: number; xp?: number }; tabs?: unknown[] };
    if (sr) return { ruleset: sr, name: 'Coffre partagé', level: 0, xp: 0, savedAt };
    const ruleset = typeof d.ruleset === 'string' ? d.ruleset : DEFAULT_RULESET;
    return { ruleset, name: d.character?.name ?? '', level: d.character?.level ?? 1, xp: d.character?.xp ?? 0, savedAt: d.savedAt ?? savedAt };
  } catch {
    return { ruleset: sr ?? DEFAULT_RULESET, name: '', level: 0, xp: 0, savedAt };
  }
}

export class SyncEngine {
  state: SyncState = { status: 'out', account: null, lastSync: 0, count: 0, message: '' };
  readonly listeners = new Set<() => void>();
  /** Appelé quand des personnages locaux ont changé (récupération depuis le serveur) */
  readonly onLocalChanged = new Set<(added: number) => void>();
  /** Fenêtre de choix en cas de conflit ; sans elle : le conflit reste en attente */
  conflictHandler: ((c: ConflictInfo) => Promise<ConflictChoice>) | null = null;
  endpoint = '/api/sync';
  /** Emplacement du personnage en cours de jeu : jamais remplacé en silence pendant la partie */
  playing: string | null = null;

  private meta: Meta = { account: null, remember: false, marks: {}, tombs: {}, lastSync: 0, count: 0 };
  private session: Session | null = null;
  private dirty = new Set<string>();
  private timer = 0;
  private maxTimer = 0;
  private retryTimer = 0;
  private hiddenAt = 0;
  private failures = 0;
  private backoffUntil = 0;
  private retryKind: 'flush' | 'sync' = 'flush';
  readonly tuning = { ...SYNC_TUNING };
  private chain: Promise<unknown> = Promise.resolve();
  private started = false;
  private pendingConflicts = new Set<string>();

  /* ------------------------------------- démarrage ------------------------------------- */
  /** À appeler une fois au lancement : restaure la session mémorisée, branche les événements, lance une synchro */
  async init(): Promise<void> {
    // sans compte (version publique, ou `SIGN_IN_OFFERED` faux : build-flags.ts) : synchronisation désactivée, aucun contact avec /api/sync, aucun écouteur
    if (!SYNC_ENABLED || this.started) return;
    this.started = true;
    this.readMeta();
    SaveStore.onSaved = (key) => this.touched(key);
    SaveStore.onCleared = (key) => this.cleared(key);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (this.state.status === 'offline') void this.syncAll({ auto: true }).catch(() => undefined);
      });
      window.addEventListener('offline', () => this.setState({ status: this.session ? 'offline' : 'out' }));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.hiddenAt = Date.now();
          void this.flush(true);
        } else if (this.session && this.hiddenAt && Date.now() - this.hiddenAt > this.tuning.resyncAfterHiddenMs) {
          this.hiddenAt = 0;
          void this.syncAll({ auto: true }).catch(() => undefined);
        }
      });
      window.addEventListener('pagehide', () => void this.flush(true));
    }
    if (this.meta.account && this.meta.remember) {
      try {
        const s = await idbOp<Session | undefined>('readonly', (st) => st.get('v1') as IDBRequest<Session | undefined>);
        if (s && s.name === this.meta.account) this.session = s;
      } catch {
        /* IndexedDB indisponible : reconnexion manuelle */
      }
    }
    this.setState({ status: this.session ? 'idle' : 'out', account: this.session ? this.meta.account : null });
    if (this.session) await this.syncAll({ auto: true }).catch(() => undefined);
  }

  get connected(): boolean {
    return !!this.session;
  }

  private readMeta(): void {
    try {
      const t = localStorage.getItem(META_KEY);
      if (t) this.meta = { ...this.meta, ...(JSON.parse(t) as Partial<Meta>) };
    } catch {
      /* méta illisible : repart de zéro (les conflits seront détectés, rien ne sera écrasé) */
    }
    this.state.lastSync = this.meta.lastSync;
    this.state.count = this.meta.count;
  }
  private writeMeta(): void {
    try {
      localStorage.setItem(META_KEY, JSON.stringify(this.meta));
    } catch {
      /* stockage plein */
    }
  }
  private setState(p: Partial<SyncState>): void {
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l();
  }

  /* ------------------------------------- réseau ------------------------------------- */
  private async call(body: Record<string, unknown>, keepalive = false): Promise<Record<string, unknown>> {
    let r: Response;
    // délai : un réseau qui ne répond plus (tunnel, Wi-Fi captif) ne laisse pas la synchronisation « en cours » sans fin ; large pour
    // l'envoi d'une grosse sauvegarde sur une connexion lente. Pas de délai pour l'envoi de fermeture de page (keepalive).
    const ctl = !keepalive && typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), SYNC_TIMEOUT_MS) : undefined;
    try {
      r = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
        keepalive,
        ...(ctl ? { signal: ctl.signal } : {}),
      });
    } catch {
      if (timer !== undefined) clearTimeout(timer);
      throw new SyncError('Hors ligne', 'offline');
    }
    let j: Record<string, unknown> = {};
    try {
      j = (await r.json()) as Record<string, unknown>;
    } catch {
      /* corps non JSON (page d'erreur) */
    }
    if (timer !== undefined) clearTimeout(timer);
    // délai écoulé pendant la lecture de la réponse : pas un succès vide
    if (ctl?.signal.aborted) throw new SyncError('Hors ligne', 'offline');
    if (r.ok) return j;
    const code = String(j.error ?? 'server');
    const msg: Record<string, string> = {
      auth: 'Nom de compte ou mot de passe incorrect.',
      locked: 'Trop de tentatives : réessayez dans quelques minutes.',
      exists: 'Ce nom de compte est déjà pris.',
      too_large: 'Sauvegarde trop volumineuse pour la synchronisation.',
      too_many_slots: 'Trop de personnages en ligne (30 maximum).',
      quota: 'Espace en ligne du compte plein : supprimez des personnages en ligne.',
      accounts_full: 'Le serveur de synchronisation n’accepte plus de nouveaux comptes.',
      not_configured: 'La synchronisation n’est pas disponible sur ce serveur.',
      conflict: 'Conflit de version.',
      bad_name: 'Nom de compte invalide (3 à 32 caractères : a-z, 0-9, _ . -).',
    };
    throw new SyncError(msg[code] ?? 'Erreur du serveur de synchronisation.', code, r.status, j);
  }
  private auth(): { name: string; authHash: string; device: string } {
    if (!this.session) throw new SyncError('Non connecté', 'auth');
    return { name: this.session.name, authHash: this.session.authHash, device: deviceToken() };
  }

  /* ------------------------------------- compte ------------------------------------- */
  private async open(s: Session, remember: boolean): Promise<void> {
    if (this.meta.account !== s.name) this.meta = { account: s.name, remember, marks: {}, tombs: {}, lastSync: 0, count: 0 };
    this.meta.remember = remember;
    this.session = s;
    this.writeMeta();
    try {
      if (remember) await idbOp('readwrite', (st) => st.put(s, 'v1'));
      else await idbOp('readwrite', (st) => st.delete('v1'));
    } catch {
      /* session non mémorisable : valable jusqu'au rechargement */
    }
    this.setState({ status: 'idle', account: s.name, message: '', lastSync: this.meta.lastSync, count: this.meta.count });
  }

  async register(rawName: string, password: string, remember: boolean): Promise<void> {
    const name = normalizeAccountName(rawName);
    if (!name) throw new SyncError('Nom de compte invalide (3 à 32 caractères : a-z, 0-9, _ . -).', 'bad_name');
    if (password.length < 10) throw new SyncError('Mot de passe trop court (10 caractères minimum).', 'weak');
    const salt = randomSalt();
    const d = await deriveKeys(name, password, salt, PBKDF2_ITERATIONS);
    await this.call({ action: 'register', name, authHash: d.authHash, salt: toB64(salt), iterations: PBKDF2_ITERATIONS, device: deviceToken() });
    await this.open({ ...d, name, salt: toB64(salt), iterations: PBKDF2_ITERATIONS }, remember);
    await this.syncAll();
  }

  async login(rawName: string, password: string, remember: boolean): Promise<void> {
    const name = normalizeAccountName(rawName);
    if (!name) throw new SyncError('Nom de compte ou mot de passe incorrect.', 'auth');
    const p = await this.call({ action: 'params', name });
    let kdf: ReturnType<typeof checkKdfParams>;
    try {
      kdf = checkKdfParams(p.salt, p.iterations);
    } catch {
      throw new SyncError('Réponse du serveur refusée (paramètres de sécurité anormaux).', 'bad_params');
    }
    const { salt, iterations } = kdf;
    const d = await deriveKeys(name, password, salt, iterations);
    await this.call({ action: 'login', name, authHash: d.authHash, device: deviceToken() });
    await this.open({ ...d, name, salt: String(p.salt), iterations }, remember);
    await this.syncAll();
  }

  /** Déconnexion : les sauvegardes locales restent, la session mémorisée est effacée */
  async logout(): Promise<void> {
    await this.flush(false, true).catch(() => undefined); // dernières modifications envoyées (au mieux) avant d'oublier la session
    this.session = null;
    this.dirty.clear();
    this.clearTimers();
    this.failures = 0;
    this.backoffUntil = 0;
    this.meta = { account: null, remember: false, marks: {}, tombs: {}, lastSync: 0, count: 0 };
    this.writeMeta();
    try {
      await idbOp('readwrite', (st) => st.delete('v1'));
    } catch {
      /* rien */
    }
    this.setState({ status: 'out', account: null, message: '', lastSync: 0, count: 0 });
  }

  /** Supprime le compte et toutes les sauvegardes en ligne (les sauvegardes locales ne sont pas touchées) */
  async deleteOnline(): Promise<void> {
    await this.call({ action: 'delete', ...this.auth(), all: true });
    this.dirty.clear();
    await this.logout();
  }

  /** Change le mot de passe : tous les blobs sont déchiffrés avec l'ancienne clé et rechiffrés avec la nouvelle, côté appareil */
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const s = this.session;
    if (!s) throw new SyncError('Non connecté', 'auth');
    if (newPassword.length < 10) throw new SyncError('Mot de passe trop court (10 caractères minimum).', 'weak');
    const old = await deriveKeys(s.name, oldPassword, fromB64(s.salt), s.iterations);
    if (old.authHash !== s.authHash) throw new SyncError('Ancien mot de passe incorrect.', 'auth');
    await this.syncAll(); // tout ce qui est local est en ligne avant de rechiffrer
    const salt = randomSalt();
    const nu = await deriveKeys(s.name, newPassword, salt, PBKDF2_ITERATIONS);
    const list = (await this.call({ action: 'list', ...this.auth() })).slots as { slot: string; updatedAt: number }[];
    for (const it of list) {
      const g = await this.call({ action: 'get', ...this.auth(), slot: it.slot });
      const text = await decryptBlob(s.key, it.slot, fromB64(String(g.blob)));
      const blob = await encryptBlob(nu.key, it.slot, text);
      await this.call({ action: 'stage', ...this.auth(), slot: it.slot, sourceUpdatedAt: it.updatedAt, blob: toB64(blob) });
    }
    const r = await this.call({ action: 'changePassword', ...this.auth(), newAuthHash: nu.authHash, newSalt: toB64(salt), newIterations: PBKDF2_ITERATIONS });
    const ns: Session = { ...nu, name: s.name, salt: toB64(salt), iterations: PBKDF2_ITERATIONS };
    for (const it of r.slots as { slot: string; updatedAt: number }[]) if (this.meta.marks[it.slot]) this.meta.marks[it.slot].rev = it.updatedAt;
    await this.open(ns, this.meta.remember);
  }

  /* ------------------------------------- synchronisation ------------------------------------- */
  /** Synchronisation complète (sérialisée) : récupère, envoie, résout les conflits */
  syncAll(opts: { quiet?: boolean; auto?: boolean } = {}): Promise<void> {
    if (!opts.auto) this.resetBackoff();
    const run = () => this.doSyncAll(opts);
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  private locals(): Record<string, { info: LocalInfo; key: string; text: string }> {
    const out: Record<string, { info: LocalInfo; key: string; text: string }> = {};
    // personnages, puis le coffre partagé de chaque jeu de règles présent sur l'appareil
    for (const key of [...SaveStore.slotKeys(), ...SaveStore.sharedKeys()]) {
      const id = syncIdOfKey(key);
      if (!SLOT_OK.test(id)) continue;
      const r = SaveStore.rawText(key);
      if (r) out[id] = { info: { savedAt: r.savedAt }, key, text: r.text };
    }
    return out;
  }

  private clearTimers(): void {
    window.clearTimeout(this.timer);
    window.clearTimeout(this.maxTimer);
    window.clearTimeout(this.retryTimer);
    this.timer = this.maxTimer = this.retryTimer = 0;
  }
  private resetBackoff(): void {
    this.failures = 0;
    this.backoffUntil = 0;
    window.clearTimeout(this.retryTimer);
    this.retryTimer = 0;
  }
  /** Tentatives automatiques suspendues (recul en cours ou trop d'échecs) */
  private get blocked(): boolean {
    return this.failures >= this.tuning.maxAutoFailures || Date.now() < this.backoffUntil;
  }
  /** Échec serveur : recul exponentiel, une seule reprise programmée, aucune boucle */
  private backoff(kind: 'flush' | 'sync'): void {
    this.failures++;
    this.retryKind = kind;
    const delay = Math.min(this.tuning.backoffMaxMs, this.tuning.backoffMinMs * 2 ** (this.failures - 1));
    this.backoffUntil = Date.now() + delay;
    window.clearTimeout(this.retryTimer);
    this.retryTimer = 0;
    if (this.failures < this.tuning.maxAutoFailures) {
      this.retryTimer = window.setTimeout(() => {
        this.retryTimer = 0;
        if (this.retryKind === 'sync') void this.syncAll({ auto: true }).catch(() => undefined);
        else void this.flush(false);
      }, delay);
    }
    this.setState({ status: 'error', message: UNAVAILABLE_MSG });
  }

  private fail(e: unknown): never {
    const err = e as SyncError;
    if (isServerFailure(e)) this.backoff('sync');
    else if (err.code === 'offline') this.setState({ status: 'offline', message: 'Hors ligne : la synchronisation reprendra à la reconnexion.' });
    else if (err.code === 'auth' && this.session) {
      this.session = null;
      this.setState({ status: 'out', account: null, message: 'Le mot de passe du compte a changé ou a été refusé : reconnectez-vous.' });
    } else this.setState({ status: 'error', message: err.message || 'Erreur de synchronisation.' });
    throw e;
  }

  private async doSyncAll(_opts: { quiet?: boolean; auto?: boolean }): Promise<void> {
    if (!this.session) return;
    if (_opts.auto && this.blocked) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setState({ status: 'offline', message: 'Hors ligne : la synchronisation reprendra à la reconnexion.' });
      return;
    }
    this.setState({ status: 'syncing', message: '' });
    this.clearTimers();
    this.dirty.clear();
    try {
      // l'emplacement d'origine reçoit un identifiant unique avant tout envoi
      SaveStore.migrateLegacySlot();
      const list = (await this.call({ action: 'list', ...this.auth() })).slots as (RemoteInfo & { slot: string })[];
      const remotes: Record<string, RemoteInfo> = Object.fromEntries(list.filter((s) => isSharedId(s.slot) || SLOT_OK.test(s.slot)).map((s) => [s.slot, s]));
      const locals = this.locals();
      const plan = planSync(Object.fromEntries(Object.entries(locals).map(([k, v]) => [k, v.info])), remotes, this.meta.marks, this.meta.tombs);
      let added = 0;
      this.pendingConflicts.clear();
      for (const { slot, action } of plan) {
        const l = locals[slot];
        const r = remotes[slot];
        const isPlaying = !!l && l.key === this.playing;
        switch (action) {
          case 'adopt':
            this.meta.marks[slot] = { rev: r.updatedAt, localAt: l.info.savedAt, fp: contentFingerprint(l.text) };
            break;
          case 'forgetTomb':
            delete this.meta.tombs[slot];
            break;
          case 'deleteRemote':
            await this.call({ action: 'delete', ...this.auth(), slot, baseUpdatedAt: this.meta.tombs[slot] });
            delete this.meta.tombs[slot];
            delete this.meta.marks[slot];
            break;
          case 'download': {
            if (isPlaying) {
              this.pendingConflicts.add(slot);
              break;
            }
            delete this.meta.tombs[slot];
            if (await this.download(slot, r, l?.key ?? keyOfSyncId(slot))) if (!l) added++;
            break;
          }
          case 'upload':
            if (this.unchanged(slot, l.text, l.info.savedAt)) break; // même contenu qu'au dernier envoi : rien à écrire en ligne
            if (!(await this.upload(slot, l.key, l.text, l.info.savedAt, r?.updatedAt ?? 0)).ok) this.pendingConflicts.add(slot);
            break;
          case 'conflict':
            if (isPlaying) this.pendingConflicts.add(slot);
            else if (!(await this.resolve(slot, l.key, l.text, l.info.savedAt, r))) this.pendingConflicts.add(slot);
            break;
        }
      }
      this.resetBackoff();
      this.meta.lastSync = Date.now();
      this.meta.count =
        Object.keys(remotes).filter((k) => !isSharedId(k)).length +
        plan.filter((p) => p.action === 'upload' && !remotes[p.slot] && !isSharedId(p.slot)).length -
        plan.filter((p) => p.action === 'deleteRemote').length;
      this.writeMeta();
      this.setState({
        status: this.pendingConflicts.size ? 'conflict' : 'idle',
        lastSync: this.meta.lastSync,
        count: this.meta.count,
        message: this.pendingConflicts.size ? 'Un personnage a été modifié sur deux appareils : ouvrez la synchronisation pour le résoudre.' : '',
      });
      if (added) for (const f of this.onLocalChanged) f(added);
    } catch (e) {
      this.fail(e);
    }
  }

  /** Télécharge et installe (copie de sécurité `.presync` de l'ancienne version locale) */
  private async download(slot: string, r: RemoteInfo, key: string): Promise<boolean> {
    const g = await this.call({ action: 'get', ...this.auth(), slot });
    const text = await decryptBlob(this.session!.key, slot, fromB64(String(g.blob)));
    const savedAt = summarize(text, slot, r.savedAt).savedAt;
    if (!SaveStore.installRaw(key, text, isSharedId(slot) ? r.savedAt : savedAt)) return false;
    const now = SaveStore.rawText(key);
    this.meta.marks[slot] = { rev: Number(g.updatedAt) || r.updatedAt, localAt: now?.savedAt ?? savedAt, fp: now ? contentFingerprint(now.text) : undefined };
    return true;
  }

  private async upload(slot: string, key: string, text: string, savedAt: number, base: number, keepalive = false): Promise<{ ok: boolean; rev?: number }> {
    const blob = await encryptBlob(this.session!.key, slot, text);
    try {
      const r = await this.call({ action: 'put', ...this.auth(), slot, blob: toB64(blob), updatedAt: savedAt, baseUpdatedAt: base }, keepalive && blob.length < 40_000);
      this.meta.marks[slot] = { rev: Number(r.updatedAt), localAt: savedAt, fp: contentFingerprint(text) };
      this.writeMeta();
      return { ok: true, rev: Number(r.updatedAt) };
    } catch (e) {
      if ((e as SyncError).code === 'conflict') return { ok: false };
      throw e;
    }
  }

  /** Conflit : le joueur choisit ; rien n'est écrasé sans copie de sécurité */
  private async resolve(slot: string, key: string, text: string, savedAt: number, r: RemoteInfo): Promise<boolean> {
    const g = await this.call({ action: 'get', ...this.auth(), slot });
    const rtext = await decryptBlob(this.session!.key, slot, fromB64(String(g.blob)));
    const shared = isSharedId(slot);
    const info: ConflictInfo = { slot, shared, local: summarize(text, slot, savedAt), remote: summarize(rtext, slot, r.savedAt) };
    const choice = (await this.conflictHandler?.(info)) ?? 'skip';
    if (choice === 'skip') return false;
    const rev = Number(g.updatedAt) || r.updatedAt;
    if (choice === 'remote') {
      if (!SaveStore.installRaw(key, rtext, r.savedAt)) return false;
      this.meta.marks[slot] = { rev, localAt: SaveStore.rawText(key)?.savedAt ?? r.savedAt, fp: contentFingerprint(rtext) };
      return true;
    }
    if (choice === 'both' && shared) {
      // fusion du coffre : union par uid (aucun doublon, aucune perte) ; si tout ne tient pas dans le plafond de pages, rien n'est écrasé
      let merged: string | null = null;
      try {
        const m = mergeShared(JSON.parse(text) as SharedStash, JSON.parse(rtext) as SharedStash);
        if (!m.lost.length) merged = JSON.stringify(m.merged);
      } catch {
        merged = null;
      }
      if (!merged) return false;
      const at = Date.now();
      if (!SaveStore.installRaw(key, merged, at)) return false;
      return (await this.upload(slot, key, merged, at, rev)).ok;
    }
    if (choice === 'both' && !shared) {
      // la version de l'autre appareil devient un nouveau personnage (nouvel identifiant) ; envoyé à la prochaine passe
      const nk = SaveStore.newSlot();
      if (!SaveStore.installRaw(nk, rtext, r.savedAt)) return false;
      delete this.meta.marks[syncIdOfKey(nk)];
      this.touched(nk);
    }
    return (await this.upload(slot, key, text, savedAt, rev)).ok;
  }

  /* ------------------------------------- envoi différé ------------------------------------- */
  /** Contenu identique au dernier envoi réussi : on met seulement la marque à jour (aucun appel réseau) */
  private unchanged(id: string, text: string, savedAt: number): boolean {
    const mark = this.meta.marks[id];
    if (!this.tuning.dedupe || !mark?.fp || mark.fp !== contentFingerprint(text)) return false;
    mark.localAt = savedAt;
    this.writeMeta();
    return true;
  }

  /** Une sauvegarde locale a eu lieu : envoi après `idleMs` d'inactivité, et au plus tard `maxMs` après la première modification en attente */
  private touched(key: string): void {
    if (!this.session) return;
    const id = syncIdOfKey(key);
    if (SLOT_OK.test(id)) this.dirty.add(id);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flush(false), this.tuning.idleMs);
    if (!this.maxTimer) this.maxTimer = window.setTimeout(() => void this.flush(false), this.tuning.maxMs);
  }

  private cleared(key: string): void {
    if (!this.session) return;
    const id = syncIdOfKey(key);
    const mark = this.meta.marks[id];
    if (mark) this.meta.tombs[id] = mark.rev;
    delete this.meta.marks[id];
    this.dirty.delete(id);
    this.writeMeta();
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.syncAll({ quiet: true, auto: true }).catch(() => undefined), 2000);
  }

  /**
   * Envoie les emplacements modifiés en un seul passage. Automatique (minuteurs, fermeture) : respecte le recul après erreur.
   * `explicit` (bouton « Synchroniser maintenant », déconnexion) : ignore le recul. `hide` : keepalive pour la fermeture de page.
   */
  async flush(hide: boolean, explicit = false): Promise<void> {
    window.clearTimeout(this.timer);
    window.clearTimeout(this.maxTimer);
    this.timer = this.maxTimer = 0;
    if (!this.session || !this.dirty.size) return;
    if (explicit) this.resetBackoff();
    else if (this.blocked) return; // les modifications restent en attente (dirty) jusqu'à la reprise
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const ids = [...this.dirty];
    this.dirty.clear();
    const run = async () => {
      let failed = false;
      for (const id of ids) {
        if (failed) {
          this.dirty.add(id);
          continue;
        }
        const r = SaveStore.rawText(keyOfSyncId(id));
        if (!r) continue;
        const mark = this.meta.marks[id];
        if (mark && mark.localAt === r.savedAt) continue;
        if (mark && this.unchanged(id, r.text, r.savedAt)) continue;
        try {
          const res = await this.upload(id, keyOfSyncId(id), r.text, r.savedAt, mark?.rev ?? 0, hide);
          if (!res.ok) {
            this.pendingConflicts.add(id);
            this.setState({ status: 'conflict', message: 'Un personnage a été modifié sur deux appareils : ouvrez la synchronisation pour le résoudre.' });
          } else {
            this.resetBackoff();
            this.meta.lastSync = Date.now();
            this.writeMeta();
            if (!this.pendingConflicts.size) this.setState({ status: 'idle', lastSync: this.meta.lastSync, message: '' });
          }
        } catch (e) {
          this.dirty.add(id);
          if ((e as SyncError).code === 'offline') {
            this.setState({ status: 'offline' });
          } else if (isServerFailure(e)) {
            failed = true;
            this.backoff('flush');
          } else if (!hide) {
            this.dirty.delete(id);
            this.setState({ status: 'error', message: (e as SyncError).message });
          } else this.dirty.delete(id);
        }
      }
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    await p;
  }
}

export const Sync = new SyncEngine();
