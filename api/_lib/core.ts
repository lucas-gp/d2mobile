/**
 * Synchronisation des sauvegardes : cœur du serveur, indépendant de Vercel (testable avec un faux stockage).
 * Le serveur ne voit JAMAIS le mot de passe ni les sauvegardes en clair : il reçoit un `authHash` dérivé par le client
 * (PBKDF2) et des blobs chiffrés AES-256-GCM. Voir docs/ARCHITECTURE.md § « Synchronisation ».
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Stockage d'objets minimal (Vercel Blob en production, Map en test) */
export interface Store {
  get(path: string): Promise<{ data: Uint8Array; etag: string } | null>;
  /** `ifMatch` : n'écrit que si l'objet a encore cet ETag (écriture conditionnelle) ; `createOnly` : échoue s'il existe déjà */
  put(path: string, data: Uint8Array, opts?: { ifMatch?: string; createOnly?: boolean }): Promise<{ etag: string }>;
  del(paths: string[]): Promise<void>;
  list(prefix: string): Promise<string[]>;
}
/** Écriture conditionnelle refusée (un autre appareil a écrit entre-temps, ou l'objet existe déjà) */
export class StoreConflict extends Error {}

export const MAX_SAVE_BYTES = 2 * 1024 * 1024;
export const MAX_SLOTS = 30;
export const MIN_ITERATIONS = 600_000;
export const MAX_ITERATIONS = 5_000_000;
export const MAX_FAILS = 5;
/** Appareils reconnus par compte (jeton aléatoire de l'appareil, gardé sous forme d'empreinte) */
export const MAX_DEVICES = 10;
/** Taille totale des sauvegardes d'un compte (défaut ; `Deps.maxAccountBytes`, variable SYNC_MAX_ACCOUNT_BYTES) */
export const MAX_ACCOUNT_BYTES = 16 * 1024 * 1024;
/** Nombre de comptes du stockage (défaut ; `Deps.maxAccounts`, variable SYNC_MAX_ACCOUNTS) */
export const MAX_ACCOUNTS = 200;
/** Compteur global des comptes (best-effort : écriture conditionnelle ; créé au premier besoin en comptant `accounts/`) */
export const COUNT_PATH = 'meta/accounts.json';

export interface SlotInfo {
  /** Version serveur (ms, croissante) : sert de base pour détecter un conflit */
  updatedAt: number;
  /** Date de sauvegarde annoncée par l'appareil (affichage seulement) */
  savedAt: number;
  size: number;
  version: number;
}
export interface Account {
  v: 1;
  createdAt: number;
  /** Sel public de dérivation (base64, 16 octets) */
  salt: string;
  iterations: number;
  /** Sel serveur propre au compte (base64) et empreinte SHA-256(sel serveur || authHash) */
  serverSalt: string;
  verifier: string;
  fails: { count: number; lockedUntil: number; last: number };
  slots: Record<string, SlotInfo>;
  /**
   * Anciennes révisions à supprimer (jamais référencées par `slots`) : supprimées par lots pour limiter les opérations Blob.
   * Champ optionnel ignoré par les anciennes versions du serveur (qui supprimaient tout de suite) : compatible dans les deux sens.
   */
  garbage?: string[];
  /**
   * Appareils déjà connectés (empreinte SHA-256 de `acct:<clé du compte>:<jeton>`, dernière réussite, échecs consécutifs). Un appareil reconnu
   * n'est pas bloqué par le verrouillage du compte (qu'un tiers peut déclencher en connaissant le nom) ; après MAX_FAILS échecs il est oublié.
   * Champ optionnel : un ancien serveur le garde tel quel (il réécrit tout l'objet), un ancien client n'envoie pas de jeton.
   */
  devices?: { id: string; last: number; fails: number }[];
}
/** Nombre d'anciennes révisions accumulées avant suppression groupée (1 = suppression immédiate, comme avant) */
export const GC_BATCH = 25;

export interface Deps {
  store: Store;
  /** Secret serveur stable (HMAC des noms de compte, faux sels) */
  pepper: string;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Seuil de suppression groupée des anciennes révisions (défaut GC_BATCH) */
  gcBatch?: number;
  /** Plafond du nombre de comptes (défaut MAX_ACCOUNTS) */
  maxAccounts?: number;
  /** Plafond de la taille des sauvegardes d'un compte (défaut MAX_ACCOUNT_BYTES) */
  maxAccountBytes?: number;
}
export interface Req {
  ip: string;
  body: unknown;
}
export interface Res {
  status: number;
  body: Record<string, unknown>;
}

const NAME_RE = /^[a-z0-9_.-]{3,32}$/;
const SLOT_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** Nom d'emplacement valide : motif ci-dessus, sans collision avec les propriétés héritées d'un objet (`constructor`, `toString`, `__proto__`…) */
export const isSlot = (slot: unknown): slot is string => typeof slot === 'string' && SLOT_RE.test(slot) && !(slot in Object.prototype);
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** Nom de compte normalisé (NFKC, sans espaces autour, minuscules) s'il respecte `[a-z0-9_.-]{3,32}`, sinon null */
export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const n = raw.normalize('NFKC').trim().toLowerCase();
  return NAME_RE.test(n) ? n : null;
}

function b64(buf: Uint8Array): string {
  return Buffer.from(buf).toString('base64');
}
function fromB64(s: unknown, len?: number): Buffer | null {
  if (typeof s !== 'string' || !B64_RE.test(s) || s.length > 4_000_000) return null;
  const b = Buffer.from(s, 'base64');
  return len && b.length !== len ? null : b;
}

const err = (status: number, error: string, extra: Record<string, unknown> = {}): Res => ({ status, body: { error, ...extra } });
const ok = (body: Record<string, unknown> = {}): Res => ({ status: 200, body: { ok: true, ...body } });

/* ------------------------- limitation de débit (par instance) ------------------------- */
/**
 * Compteurs EN MÉMOIRE de l'instance serverless : Blob n'a pas de compteur atomique et plusieurs instances peuvent tourner.
 * C'est une barrière best-effort contre les rafales ; la vraie protection contre le devinage d'un mot de passe est le
 * verrouillage doux stocké dans le compte (cumulatif entre instances) + le coût PBKDF2 côté client (≥ 600 000 itérations).
 */
const hits = new Map<string, { n: number; reset: number }>();
/** Compte un appel pour `key` dans une fenêtre de `windowMs` ; faux au-delà de `max` appels */
export function rateLimit(key: string, max: number, windowMs: number, now: number): boolean {
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  h.n++;
  return h.n <= max;
}
/** Vide les compteurs de débit (tests) */
export function resetRateLimits(): void {
  hits.clear();
}

/* ------------------------------- clés et comptes ------------------------------- */
function acctKey(d: Deps, name: string): string {
  // HMAC (et non SHA-256 nu) : le contenu du stockage ne permet pas de retrouver ni de deviner les noms de compte
  return createHmac('sha256', d.pepper).update(`acct:${name}`).digest('hex');
}
const acctPath = (h: string) => `accounts/${h}.json`;
const savePath = (h: string, slot: string, rev: number) => `saves/${h}/${slot}.${rev}.bin`;
const stagePath = (h: string, slot: string, rev: number) => `staging/${h}/${slot}.${rev}.bin`;

async function loadAccount(d: Deps, h: string): Promise<{ acct: Account; etag: string } | null> {
  const r = await d.store.get(acctPath(h));
  if (!r) return null;
  return { acct: JSON.parse(Buffer.from(r.data).toString('utf8')) as Account, etag: r.etag };
}
async function saveAccount(d: Deps, h: string, acct: Account, etag?: string): Promise<string> {
  const r = await d.store.put(acctPath(h), Buffer.from(JSON.stringify(acct)), etag ? { ifMatch: etag } : { createOnly: true });
  return r.etag;
}
function verifierOf(serverSalt: Buffer, authHash: Buffer): string {
  return createHash('sha256').update(serverSalt).update(authHash).digest('base64');
}
function sameVerifier(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
/** Faux paramètres de dérivation pour un compte inexistant : ne révèle pas l'existence du compte */
function fakeParams(d: Deps, name: string): { salt: string; iterations: number } {
  return { salt: b64(createHmac('sha256', d.pepper).update(`fake:${name}`).digest().subarray(0, 16)), iterations: MIN_ITERATIONS };
}

/** Empreinte du jeton d'appareil pour un compte (le même appareil donne des empreintes différentes d'un compte à l'autre) */
const deviceId = (h: string, token: Buffer): string => createHash('sha256').update(`acct:${h}:`).update(token).digest('base64');
/** Ajoute (ou rafraîchit) un appareil reconnu, en oubliant le plus ancien au-delà de MAX_DEVICES */
function rememberDevice(a: Account, id: string, now: number): void {
  const list = (a.devices ?? []).filter((x) => x.id !== id);
  list.push({ id, last: now, fails: 0 });
  list.sort((x, y) => y.last - x.last);
  a.devices = list.slice(0, MAX_DEVICES);
}

/** Ajoute `delta` au compteur global des comptes ; `limit` : refuse d'augmenter au-delà. Best-effort (écriture conditionnelle, 4 essais). */
async function bumpAccounts(d: Deps, delta: number, limit?: number): Promise<'ok' | 'full' | 'busy'> {
  for (let i = 0; i < 4; i++) {
    const r = await d.store.get(COUNT_PATH);
    let count = 0;
    try {
      count = r ? Math.max(0, Number((JSON.parse(Buffer.from(r.data).toString('utf8')) as { count?: unknown }).count) || 0) : (await d.store.list('accounts/')).length;
    } catch {
      count = (await d.store.list('accounts/')).length; // compteur illisible : recompté
    }
    if (delta > 0 && limit !== undefined && count + delta > limit) return 'full';
    try {
      await d.store.put(COUNT_PATH, Buffer.from(JSON.stringify({ v: 1, count: Math.max(0, count + delta) })), r ? { ifMatch: r.etag } : { createOnly: true });
      return 'ok';
    } catch (e) {
      if (!(e instanceof StoreConflict)) throw e;
    }
  }
  return 'busy';
}

const BAD_AUTH = (): Res => err(401, 'auth');
const LOCKED = (): Res => err(429, 'locked');

interface Authed {
  h: string;
  name: string;
  acct: Account;
  etag: string;
  authHash: Buffer;
}
/**
 * Vérifie nom + authHash ; délai croissant et verrouillage doux après MAX_FAILS échecs.
 * Jeton d'appareil (`b.device`, 32 octets aléatoires, facultatif) : un appareil déjà connecté avec succès n'est pas soumis au verrouillage du
 * compte (un tiers qui connaît le nom ne peut donc plus bloquer le joueur sur ses appareils) ; ses propres échecs sont comptés à part et,
 * au-delà de MAX_FAILS, il est oublié (il repasse sous le verrouillage du compte).
 */
async function authenticate(d: Deps, req: Req, b: Record<string, unknown>): Promise<Authed | Res> {
  const now = d.now();
  const name = normalizeName(b.name);
  const authHash = fromB64(b.authHash, 32);
  const token = b.device === undefined ? null : fromB64(b.device, 32);
  if (!name || !authHash || (b.device !== undefined && !token)) return BAD_AUTH();
  if (!rateLimit(`ip:${req.ip}`, 120, 60_000, now)) return LOCKED();
  const h = acctKey(d, name);
  const cur = await loadAccount(d, h);
  const ipFail = async (): Promise<Res> => {
    // compte inconnu : même délai qu'un mauvais mot de passe, et au-delà de 20 échecs en 10 min l'adresse est freinée
    const within = rateLimit(`fail:${req.ip}`, 20, 10 * 60_000, now);
    await d.sleep(250);
    return within ? BAD_AUTH() : LOCKED();
  };
  if (!cur) return ipFail();
  const { acct, etag } = cur;
  const devId = token ? deviceId(h, token) : null;
  const dev = devId ? acct.devices?.find((x) => sameVerifier(x.id, devId)) : undefined;
  if (!dev && acct.fails.lockedUntil > now) return LOCKED();
  const good = sameVerifier(verifierOf(Buffer.from(acct.serverSalt, 'base64'), authHash), acct.verifier);
  if (dev) {
    // appareil reconnu : verrouillage du compte ignoré, échecs comptés pour lui seul
    if (!good) {
      dev.fails++;
      if (dev.fails >= MAX_FAILS) acct.devices = (acct.devices ?? []).filter((x) => x !== dev);
      try {
        await saveAccount(d, h, acct, etag);
      } catch {
        /* écriture concurrente : le compteur sera repris */
      }
      await d.sleep(Math.min(3000, 250 * 2 ** (dev.fails - 1)));
      return BAD_AUTH();
    }
    if (dev.fails || now - dev.last > 86_400_000) {
      dev.fails = 0;
      dev.last = now;
      try {
        const e = await saveAccount(d, h, acct, etag);
        return { h, name, acct, etag: e, authHash };
      } catch {
        /* peu importe */
      }
    }
    return { h, name, acct, etag, authHash };
  }
  if (!good) {
    acct.fails.count++;
    acct.fails.last = now;
    if (acct.fails.count >= MAX_FAILS) acct.fails.lockedUntil = now + Math.min(15 * 60_000, 30_000 * 2 ** (acct.fails.count - MAX_FAILS));
    try {
      await saveAccount(d, h, acct, etag);
    } catch {
      /* un autre appareil a écrit : le compteur sera repris à la prochaine tentative */
    }
    await d.sleep(Math.min(3000, 250 * 2 ** (acct.fails.count - 1)));
    return BAD_AUTH();
  }
  if (acct.fails.count || devId) {
    acct.fails.count = 0;
    acct.fails.lockedUntil = 0;
    if (devId) rememberDevice(acct, devId, now); // appareil nouveau (les reconnus sont traités plus haut) : une écriture, une fois
    try {
      const e = await saveAccount(d, h, acct, etag);
      return { h, name, acct, etag: e, authHash };
    } catch {
      /* peu importe */
    }
  }
  return { h, name, acct, etag, authHash };
}

/** Met une ancienne révision en attente de suppression (même écriture du compte que la nouvelle révision : aucune opération en plus) */
function queueGarbage(a: Account, path: string): void {
  a.garbage = [...(a.garbage ?? []), path];
}
/** Si assez d'anciennes révisions : les retire du compte (déjà validé) et renvoie la liste à supprimer. Jamais une révision encore référencée. */
function takeGarbage(d: Deps, a: Account, h: string): string[] {
  const g = a.garbage ?? [];
  if (g.length < (d.gcBatch ?? GC_BATCH)) return [];
  const live = new Set(Object.entries(a.slots).map(([slot, s]) => savePath(h, slot, s.updatedAt)));
  const take = g.slice(0, 100);
  a.garbage = g.slice(100);
  return take.filter((p) => !live.has(p) && p.startsWith(`saves/${h}/`));
}

const listOf = (a: Account) => Object.entries(a.slots).map(([slot, s]) => ({ slot, ...s }));

/** Écrit le compte avec réessais : `mutate` rejoue la modification sur la version la plus récente (renvoie une réponse pour abandonner) */
async function commit(d: Deps, au: Authed, mutate: (a: Account) => Res | null): Promise<Res | null> {
  let { acct, etag } = au;
  for (let i = 0; i < 4; i++) {
    const stop = mutate(acct);
    if (stop) return stop;
    try {
      await saveAccount(d, au.h, acct, etag);
      au.acct = acct;
      return null;
    } catch (e) {
      if (!(e instanceof StoreConflict)) throw e;
      const fresh = await loadAccount(d, au.h);
      if (!fresh) return err(404, 'not_found');
      ({ acct, etag } = fresh);
    }
  }
  return err(503, 'busy');
}

/* ----------------------------------- actions ----------------------------------- */
/** Traite une requête de synchronisation (`body.action` : params, register, login, list, get, put, delete, stage, changePassword) */
export async function handle(d: Deps, req: Req): Promise<Res> {
  const b = req.body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || typeof b.action !== 'string') return err(400, 'bad_request');
  const now = d.now();

  if (b.action === 'params') {
    const name = normalizeName(b.name);
    if (!name) return err(400, 'bad_name');
    if (!rateLimit(`ip:${req.ip}`, 120, 60_000, now)) return LOCKED();
    const cur = await loadAccount(d, acctKey(d, name));
    return ok(cur ? { salt: cur.acct.salt, iterations: cur.acct.iterations } : fakeParams(d, name));
  }

  if (b.action === 'register') {
    const name = normalizeName(b.name);
    const authHash = fromB64(b.authHash, 32);
    const salt = fromB64(b.salt, 16);
    const iterations = Number(b.iterations);
    if (!name || !authHash || !salt || !Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return err(400, 'bad_request');
    const token = b.device === undefined ? null : fromB64(b.device, 32);
    if (b.device !== undefined && !token) return err(400, 'bad_request');
    if (!rateLimit(`reg:${req.ip}`, 5, 3600_000, now)) return LOCKED();
    const h = acctKey(d, name);
    if (await loadAccount(d, h)) return err(409, 'exists'); // lecture simple avant de réserver une place
    const room = await bumpAccounts(d, 1, d.maxAccounts ?? MAX_ACCOUNTS);
    if (room === 'full') return err(403, 'accounts_full');
    if (room === 'busy') return err(503, 'busy');
    const serverSalt = randomBytes(16);
    const acct: Account = {
      v: 1,
      createdAt: now,
      salt: b64(salt),
      iterations,
      serverSalt: b64(serverSalt),
      verifier: verifierOf(serverSalt, authHash),
      fails: { count: 0, lockedUntil: 0, last: 0 },
      slots: {},
    };
    if (token) rememberDevice(acct, deviceId(h, token), now);
    try {
      await saveAccount(d, h, acct);
    } catch (e) {
      await bumpAccounts(d, -1).catch(() => undefined); // place rendue
      if (e instanceof StoreConflict) return err(409, 'exists');
      throw e;
    }
    return ok({ slots: [] });
  }

  const au = await authenticate(d, req, b);
  if ('status' in au) return au;
  const { h, acct } = au;

  switch (b.action) {
    case 'login':
      return ok({ salt: acct.salt, iterations: acct.iterations, slots: listOf(acct), serverTime: now });
    case 'list':
      return ok({ slots: listOf(acct), serverTime: now });
    case 'get': {
      const slot = String(b.slot ?? '');
      const info = acct.slots[slot];
      if (!isSlot(slot) || !info) return err(404, 'not_found');
      const r = await d.store.get(savePath(h, slot, info.updatedAt));
      if (!r) return err(404, 'not_found');
      return ok({ slot, ...info, blob: b64(r.data) });
    }
    case 'put': {
      const slot = String(b.slot ?? '');
      const bytes = fromB64(b.blob);
      if (!isSlot(slot) || !bytes || bytes.length < 29) return err(400, 'bad_request');
      if (bytes.length > MAX_SAVE_BYTES) return err(413, 'too_large', { max: MAX_SAVE_BYTES });
      const base = Number(b.baseUpdatedAt) || 0;
      const savedAt = Math.max(0, Math.min(Number(b.updatedAt) || now, now + 86_400_000));
      const version = Number.isInteger(bytes[0]) ? bytes[0] : 0;
      const prev = acct.slots[slot]?.updatedAt;
      const rev = Math.max(now, (prev ?? 0) + 1);
      // 1) conflit ? 2) blob sous un nom propre à la révision 3) index écrit seulement si personne n'a écrit entre-temps (ETag)
      const check = (a: Account): Res | null => {
        const cur = a.slots[slot];
        if (cur && cur.updatedAt > base) return err(409, 'conflict', { serverUpdatedAt: cur.updatedAt, savedAt: cur.savedAt });
        if (!cur && Object.keys(a.slots).length >= MAX_SLOTS) return err(400, 'too_many_slots', { max: MAX_SLOTS });
        // taille totale du compte : refusée seulement si elle augmente au-delà du plafond (un compte d'avant déjà au-dessus peut rétrécir)
        const total = Object.values(a.slots).reduce((n, x) => n + (x.size || 0), 0);
        const next = total - (cur?.size ?? 0) + bytes.length;
        const cap = d.maxAccountBytes ?? MAX_ACCOUNT_BYTES;
        if (next > cap && next > total) return err(413, 'quota', { max: cap });
        return null;
      };
      const pre = check(acct);
      if (pre) return pre;
      await d.store.put(savePath(h, slot, rev), bytes);
      let dead: string[] = [];
      const stop = await commit(d, au, (a) => {
        const c = check(a);
        if (c) return c;
        const replaced = a.slots[slot]?.updatedAt;
        if (replaced !== undefined && replaced >= rev) return err(409, 'conflict', { serverUpdatedAt: replaced, savedAt: a.slots[slot].savedAt });
        a.slots[slot] = { updatedAt: rev, savedAt, size: bytes.length, version };
        if (replaced !== undefined && replaced !== rev) queueGarbage(a, savePath(h, slot, replaced));
        dead = takeGarbage(d, a, h);
        return null;
      });
      if (stop) {
        await d.store.del([savePath(h, slot, rev)]).catch(() => undefined);
        return stop;
      }
      // suppression groupée, APRÈS l'écriture du compte : le compte courant ne référence plus ces révisions
      if (dead.length) await d.store.del(dead).catch(() => undefined);
      return ok({ slot, updatedAt: rev, savedAt, size: bytes.length });
    }
    case 'delete': {
      if (b.all === true) {
        const paths = [...(await d.store.list(`saves/${h}/`)), ...(await d.store.list(`staging/${h}/`)), acctPath(h)];
        for (let i = 0; i < paths.length; i += 100) await d.store.del(paths.slice(i, i + 100));
        await bumpAccounts(d, -1).catch(() => undefined);
        return ok({ deleted: 'all' });
      }
      const slot = String(b.slot ?? '');
      if (!isSlot(slot)) return err(400, 'bad_request');
      const base = b.baseUpdatedAt === undefined ? Infinity : Number(b.baseUpdatedAt) || 0;
      let dead: string[] = [];
      const stop = await commit(d, au, (a) => {
        const cur = a.slots[slot];
        if (!cur) return null;
        if (cur.updatedAt > base) return err(409, 'conflict', { serverUpdatedAt: cur.updatedAt, savedAt: cur.savedAt });
        queueGarbage(a, savePath(h, slot, cur.updatedAt));
        delete a.slots[slot];
        dead = takeGarbage(d, a, h);
        return null;
      });
      if (stop) return stop;
      if (dead.length) await d.store.del(dead).catch(() => undefined);
      return ok({ slot });
    }
    case 'stage': {
      // changement de mot de passe, étape 1 : blob ré-chiffré avec la NOUVELLE clé, mis de côté (la copie en ligne reste intacte)
      const slot = String(b.slot ?? '');
      const src = Number(b.sourceUpdatedAt);
      const bytes = fromB64(b.blob);
      if (!isSlot(slot) || !acct.slots[slot] || !bytes || bytes.length < 29 || !Number.isFinite(src)) return err(400, 'bad_request');
      if (bytes.length > MAX_SAVE_BYTES) return err(413, 'too_large', { max: MAX_SAVE_BYTES });
      if (acct.slots[slot].updatedAt !== src) return err(409, 'conflict', { serverUpdatedAt: acct.slots[slot].updatedAt });
      // même texte rechiffré : même taille à quelques octets près (le stockage mis de côté reste borné par celui du compte)
      if (bytes.length > acct.slots[slot].size + 1024) return err(413, 'too_large', { max: acct.slots[slot].size + 1024 });
      // une seule copie mise de côté par emplacement : les anciennes (révisions remplacées depuis) sont supprimées
      const stale = (await d.store.list(`staging/${h}/${slot}.`)).filter((p) => p !== stagePath(h, slot, src));
      if (stale.length) await d.store.del(stale).catch(() => undefined);
      await d.store.put(stagePath(h, slot, src), bytes, {});
      return ok({ slot });
    }
    case 'changePassword': {
      const newAuth = fromB64(b.newAuthHash, 32);
      const newSalt = fromB64(b.newSalt, 16);
      const newIter = Number(b.newIterations);
      if (!newAuth || !newSalt || !Number.isInteger(newIter) || newIter < MIN_ITERATIONS || newIter > MAX_ITERATIONS) return err(400, 'bad_request');
      const staged: { slot: string; src: number; data: Uint8Array }[] = [];
      for (const [slot, s] of Object.entries(acct.slots)) {
        const r = await d.store.get(stagePath(h, slot, s.updatedAt));
        if (!r) return err(409, 'incomplete', { slot });
        staged.push({ slot, src: s.updatedAt, data: r.data });
      }
      // blobs ré-chiffrés sous de nouvelles révisions, puis index + vérificateur écrits d'un seul bloc (ETag)
      const revs: Record<string, number> = {};
      let t = now;
      for (const s of staged) {
        revs[s.slot] = ++t;
        await d.store.put(savePath(h, s.slot, revs[s.slot]), s.data);
      }
      const serverSalt = randomBytes(16);
      const stop = await commit(d, au, (a) => {
        for (const s of staged) if (a.slots[s.slot]?.updatedAt !== s.src) return err(409, 'conflict', { slot: s.slot });
        for (const s of staged) a.slots[s.slot] = { ...a.slots[s.slot], updatedAt: revs[s.slot] };
        a.salt = b64(newSalt);
        a.iterations = newIter;
        a.serverSalt = b64(serverSalt);
        a.verifier = verifierOf(serverSalt, newAuth);
        return null;
      });
      if (stop) {
        await d.store.del(staged.map((s) => savePath(h, s.slot, revs[s.slot]))).catch(() => undefined);
        return stop;
      }
      await d.store.del(staged.flatMap((s) => [savePath(h, s.slot, s.src), stagePath(h, s.slot, s.src)])).catch(() => undefined);
      return ok({ slots: listOf(au.acct) });
    }
    default:
      return err(400, 'bad_request');
  }
}
