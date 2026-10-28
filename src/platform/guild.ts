/**
 * Coffre de guilde : client du petit service `server/guild` (coffre d'échange entre amis de confiance, code partagé).
 * Appelé en chemin relatif `/guild-api/...` (réécriture Vercel / proxy Vite). La session {guildId, token, nom, pseudo} est
 * stockée sur l'appareil (localStorage), jamais dans la sauvegarde du personnage ni synchronisée avec le cloud : le coffre est
 * commun à tous les personnages de l'appareil du même jeu de règles (un coffre de guilde par jeu de règles : session `d2m.guild`
 * pour `pd2`, celle d'origine, `d2m.guild.<id>` pour un autre ; le jeu de règles voyage avec chaque requête et le serveur refuse
 * un coffre d'un autre jeu de règles). Aucun objet n'est jamais dupliqué : le dépôt n'enlève l'objet local qu'après la
 * réponse OK du serveur ; le retrait vérifie la place avant l'appel ; chaque appel porte une clé d'idempotence `reqId` rejouée
 * telle quelle en cas de coupure réseau.
 */
import type { Item } from '../sim/item';
import { isPlausibleItem } from '../sim/item-check';
import { activeRuleset, contentRuleset } from '../mods/activate';
import { DEFAULT_RULESET } from '../sim/save';
import { logError } from './errorlog';

export { isPlausibleItem };

const GUILD_BASE = '/guild-api';
const KEY = 'd2m.guild';
/** Session et opérations en suspens du coffre de guilde d'un jeu de règles (`pd2` : les clés d'origine) */
function keysOf(ruleset: string): { session: string; pending: string } {
  if (ruleset === DEFAULT_RULESET) return { session: KEY, pending: `${KEY}.pending` };
  if (!/^[a-z0-9-]+$/.test(ruleset) || ruleset === 'pending') throw new Error(`Jeu de règles invalide pour un coffre de guilde : « ${ruleset} »`);
  return { session: `${KEY}.${ruleset}`, pending: `${KEY}.${ruleset}.pending` };
}
const TIMEOUT_MS = 8000;
/**
 * Opérations à reprendre après une coupure. `deposit` : dépôt incertain d'un objet resté local (rejoué puis annulé) ; `withdraw` : retrait
 * dont la réponse s'est perdue ; `redeposit` : objet retiré du coffre mais ni placé dans le sac ni remis au coffre (réseau coupé) : la seule
 * copie est ici, il est redéposé à la reprise.
 */
type Pending =
  { op: 'deposit'; reqId: string; item: Item; name?: string } | { op: 'withdraw'; reqId: string; id: string; name?: string } | { op: 'redeposit'; reqId: string; item: Item; name?: string };
const MAX_ITEM_BYTES = 4096;

export interface GuildSession {
  guildId: string;
  token: string;
  name: string;
  nick: string;
}
export interface GuildEntry {
  id: string;
  item: Item;
  by: string;
  at: number;
  name?: string;
}
interface GuildLogEntry {
  type: 'deposit' | 'withdraw' | 'join' | 'leave';
  by: string;
  name?: string;
  at: number;
}
export interface GuildState {
  name: string;
  /** Jeu de règles du coffre (absent d'un serveur d'avant la segmentation : `pd2`) */
  ruleset: string;
  code?: string;
  members: string[];
  items: GuildEntry[];
  log: GuildLogEntry[];
}

export type GuildErrorKind =
  'wrong_ruleset' | 'network' | 'full' | 'gone' | 'bad_code' | 'unauthorized' | 'members_full' | 'too_large' | 'rate' | 'server_full' | 'bad_item' | 'bad_request' | 'bag_full' | 'server';

const MESSAGES: Record<GuildErrorKind, string> = {
  wrong_ruleset: 'Ce coffre de guilde appartient à un autre jeu de règles.',
  network: 'Coffre de guilde indisponible',
  full: 'Le coffre de guilde est plein.',
  gone: 'Objet déjà pris par un autre membre.',
  bad_code: 'Code invalide : ce coffre n’existe pas.',
  unauthorized: 'Tu n’es plus membre de ce coffre.',
  members_full: 'Ce coffre a atteint son nombre maximal de membres.',
  too_large: 'Objet trop volumineux pour le coffre de guilde.',
  rate: 'Trop de requêtes : réessaie dans une minute.',
  server_full: 'Le service ne peut plus créer de coffre pour le moment.',
  bad_item: 'Cet objet ne peut pas être déposé.',
  bad_request: 'Requête refusée : vérifie les champs saisis.',
  bag_full: 'Inventaire plein : fais de la place avant de prendre cet objet.',
  server: 'Coffre de guilde indisponible',
};

export class GuildError extends Error {
  constructor(public kind: GuildErrorKind) {
    super(MESSAGES[kind]);
  }
}

const ERR_CODES: Record<string, GuildErrorKind> = {
  wrong_ruleset: 'wrong_ruleset',
  guild_full: 'full',
  gone: 'gone',
  bad_code: 'bad_code',
  unauthorized: 'unauthorized',
  members_full: 'members_full',
  item_too_large: 'too_large',
  too_large: 'too_large',
  rate: 'rate',
  server_full: 'server_full',
  bad_item: 'bad_item',
  bad_request: 'bad_request',
};

export interface GuildDeps {
  fetch?: typeof fetch;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  newReqId?: () => string;
  timeoutMs?: number;
  /** Jeu de règles du client (défaut : celui de la session, `pd2` sans activation) */
  ruleset?: () => string;
}

let reqCounter = 0;
function defaultReqId(): string {
  const a = new Uint8Array(12);
  try {
    crypto.getRandomValues(a);
  } catch {
    for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  }
  return `${Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')}-${(reqCounter++).toString(36)}`;
}

/** Raison pour laquelle un objet ne peut pas être déposé (null : déposable) */
export function depositBlock(item: Item): string | null {
  if (!item || typeof item.base !== 'string' || !item.base) return 'Objet invalide.';
  const anchored = item as unknown as Record<string, unknown>;
  if (anchored.soulbound || anchored.bound || anchored.cursed) return 'Cet objet est lié à ton personnage : impossible de le déposer.';
  let n = 0;
  try {
    n = JSON.stringify(item).length;
  } catch {
    return 'Objet invalide.';
  }
  if (n > MAX_ITEM_BYTES) return MESSAGES.too_large;
  return null;
}

export class GuildClient {
  private f: typeof fetch;
  private store: GuildDeps['storage'];
  private newReqId: () => string;
  private timeout: number;
  private rulesetOf: () => string;

  constructor(deps: GuildDeps = {}) {
    this.rulesetOf = deps.ruleset ?? (() => activeRuleset() ?? DEFAULT_RULESET);
    this.f = deps.fetch ?? ((...a) => fetch(...a));
    this.store = deps.storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : deps.storage;
    this.newReqId = deps.newReqId ?? defaultReqId;
    this.timeout = deps.timeoutMs ?? TIMEOUT_MS;
  }

  /** Jeu de règles du client : celui des coffres qu'il rejoint et des objets qu'il échange */
  /** Jeu de règles de contenu du coffre de guilde (un mode de jeu partage la guilde de son contenu : `pd2+survivals` → `pd2`) */
  get ruleset(): string {
    return contentRuleset(this.rulesetOf());
  }
  private get keys(): { session: string; pending: string } {
    return keysOf(this.ruleset);
  }

  session(): GuildSession | null {
    try {
      const v = JSON.parse(this.store?.getItem(this.keys.session) ?? 'null');
      if (v && typeof v.token === 'string' && typeof v.guildId === 'string') return { guildId: v.guildId, token: v.token, name: String(v.name ?? ''), nick: String(v.nick ?? '') };
    } catch {
      /* session illisible : traitée comme absente */
    }
    return null;
  }
  private setSession(s: GuildSession | null): void {
    try {
      if (s) this.store?.setItem(this.keys.session, JSON.stringify(s));
      else this.store?.removeItem(this.keys.session);
    } catch {
      /* stockage plein ou refusé */
    }
  }

  /** Un seul appel HTTP (timeout 8 s) ; erreurs mappées en GuildError */
  private async once<T>(method: 'GET' | 'POST', path: string, body?: unknown, auth = true): Promise<T> {
    const s = this.session();
    if (auth && !s) throw new GuildError('unauthorized');
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctl?.abort(), this.timeout);
    let res: Response;
    try {
      res = await this.f(`${GUILD_BASE}${path}`, {
        method,
        headers: { ...(auth && s ? { Authorization: `Bearer ${s.token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        // le jeu de règles voyage avec chaque requête (le serveur refuse un coffre d'un autre jeu de règles)
        body: body !== undefined ? JSON.stringify({ ...(body as object), ruleset: this.ruleset }) : undefined,
        signal: ctl?.signal,
        cache: 'no-store',
      });
    } catch {
      throw new GuildError('network');
    } finally {
      clearTimeout(timer);
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* corps absent ou HTML (réécriture hors service) */
    }
    if (!res.ok) {
      const code = (data as { error?: string } | null)?.error ?? '';
      const kind = ERR_CODES[code] ?? (res.status === 401 ? 'unauthorized' : 'server');
      if (kind === 'unauthorized' && auth) this.setSession(null);
      throw new GuildError(kind);
    }
    if (!data || typeof data !== 'object') throw new GuildError('server');
    return data as T;
  }

  /** Appel avec un seul rejeu automatique (même corps, donc même reqId) en cas de coupure réseau */
  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown, auth = true): Promise<T> {
    try {
      return await this.once<T>(method, path, body, auth);
    } catch (e) {
      if (e instanceof GuildError && e.kind === 'network') return this.once<T>(method, path, body, auth);
      throw e;
    }
  }

  /* --- opérations en suspens (réponse perdue) : rejouées avec la même clé à la reprise --- */
  private pendingList(): Pending[] {
    try {
      const v = JSON.parse(this.store?.getItem(this.keys.pending) ?? '[]');
      return Array.isArray(v) ? v.filter((x) => x && typeof x.reqId === 'string' && (x.op === 'deposit' || x.op === 'withdraw' || x.op === 'redeposit')) : [];
    } catch {
      return [];
    }
  }
  private savePending(l: Pending[]): void {
    try {
      if (l.length) this.store?.setItem(this.keys.pending, JSON.stringify(l.slice(-10)));
      else this.store?.removeItem(this.keys.pending);
    } catch {
      /* ignoré */
    }
  }
  private addPending(p: Pending): void {
    this.savePending([...this.pendingList().filter((x) => x.reqId !== p.reqId), p]);
  }
  private dropPending(reqId: string): void {
    this.savePending(this.pendingList().filter((x) => x.reqId !== reqId));
  }
  hasPending(): boolean {
    return this.pendingList().length > 0;
  }

  /**
   * Reprise après coupure : un retrait dont la réponse s'est perdue est rejoué (même clé) puis l'objet est placé dans le sac
   * (à défaut de place, remis au coffre) ; un dépôt incertain est rejoué puis aussitôt annulé (l'objet est resté local).
   * Renvoie le nombre d'objets récupérés dans le sac.
   */
  async recover(io: { hasRoom: (it: Item) => boolean; place: (it: Item) => boolean }): Promise<number> {
    let got = 0;
    for (const p of this.pendingList()) {
      try {
        if (p.op === 'withdraw') {
          const r = await this.once<{ item: Item }>('POST', '/withdraw', { id: p.id, reqId: p.reqId });
          if (r.item && io.hasRoom(r.item) && io.place(r.item)) got++;
          else if (r.item) await this.once('POST', '/deposit', { item: r.item, name: p.name ?? '', reqId: this.newReqId() });
        } else if (p.op === 'redeposit') {
          await this.once('POST', '/deposit', { item: p.item, name: p.name ?? '', reqId: p.reqId });
        } else {
          const r = await this.once<{ id: string }>('POST', '/deposit', { item: p.item, name: p.name ?? '', reqId: p.reqId });
          await this.once('POST', '/withdraw', { id: r.id, reqId: this.newReqId() });
        }
        this.dropPending(p.reqId);
      } catch (e) {
        if (e instanceof GuildError && (e.kind === 'network' || e.kind === 'server')) break; // on réessaiera
        this.dropPending(p.reqId); // gone / refusé / plus membre : rien de plus à faire
      }
    }
    return got;
  }

  async create(name: string, nick: string): Promise<GuildSession> {
    const r = await this.once<{ guildId: string; token: string; code: string }>('POST', '/create', { name: name.trim(), nick: nick.trim() }, false);
    const s = { guildId: r.guildId, token: r.token, name: name.trim(), nick: nick.trim() };
    this.setSession(s);
    return s;
  }
  async join(code: string, nick: string): Promise<GuildSession> {
    const r = await this.once<{ guildId: string; token: string; name: string }>('POST', '/join', { code: code.trim(), nick: nick.trim() }, false);
    const s = { guildId: r.guildId, token: r.token, name: r.name, nick: nick.trim() };
    this.setSession(s);
    return s;
  }
  async state(): Promise<GuildState> {
    const r = await this.call<GuildState>('GET', '/state');
    // serveur d'avant la segmentation : coffre de `pd2`
    const ruleset = typeof r.ruleset === 'string' ? r.ruleset : DEFAULT_RULESET;
    if (ruleset !== this.ruleset) throw new GuildError('wrong_ruleset');
    const s = this.session();
    if (s && r.name && s.name !== r.name) this.setSession({ ...s, name: r.name });
    return {
      ...r,
      ruleset,
      items: Array.isArray(r.items) ? r.items.filter((e) => e && typeof e.id === 'string' && isPlausibleItem(e.item)) : [],
      log: Array.isArray(r.log) ? r.log : [],
      members: Array.isArray(r.members) ? r.members : [],
    };
  }
  async leave(): Promise<void> {
    try {
      await this.once('POST', '/leave', {});
    } catch (e) {
      if (!(e instanceof GuildError) || e.kind === 'network' || e.kind === 'server') throw e; // injoignable : on reste membre
    }
    this.setSession(null);
  }

  /**
   * Dépose un objet : `remove()` n'est appelé qu'APRÈS la réponse OK du serveur. En cas d'échec rien n'est retiré.
   * Si `remove()` échoue (renvoie false) l'objet est aussitôt retiré du coffre (jamais en double).
   */
  async deposit(item: Item, label: string, remove: () => boolean): Promise<string> {
    const why = depositBlock(item);
    if (why) throw Object.assign(new GuildError('bad_item'), { message: why });
    const reqId = this.newReqId();
    let r: { id: string };
    try {
      r = await this.call<{ id: string }>('POST', '/deposit', { item, name: label.slice(0, 60), reqId });
    } catch (e) {
      // réseau coupé deux fois : la requête a peut-être été traitée ; l'objet reste local et sera annulé côté coffre à la reprise
      if (e instanceof GuildError && e.kind === 'network') this.addPending({ op: 'deposit', reqId, item, name: label.slice(0, 60) });
      throw e;
    }
    if (!remove()) {
      try {
        await this.call('POST', '/withdraw', { id: r.id, reqId: this.newReqId() });
      } catch {
        /* au pire l'objet est à la fois local et dans le coffre : à signaler plutôt qu'à masquer */
      }
      throw new GuildError('server');
    }
    return r.id;
  }

  /**
   * Retire un objet vers le sac. `hasRoom` est vérifié AVANT l'appel ; `place` ajoute l'objet reçu. Si l'ajout local
   * échoue (rare), l'objet est remis au coffre et l'erreur `bag_full` est levée.
   */
  async withdraw(entry: GuildEntry, io: { hasRoom: (it: Item) => boolean; place: (it: Item) => boolean }): Promise<Item> {
    if (!isPlausibleItem(entry.item)) throw new GuildError('bad_item');
    if (!io.hasRoom(entry.item)) throw new GuildError('bag_full');
    const reqId = this.newReqId();
    // noté avant l'appel : si la réponse se perd, la reprise rejoue la même clé et récupère l'objet sans doublon
    this.addPending({ op: 'withdraw', reqId, id: entry.id, name: entry.name });
    let r: { item: Item };
    try {
      r = await this.call<{ item: Item }>('POST', '/withdraw', { id: entry.id, reqId });
    } catch (e) {
      if (!(e instanceof GuildError) || e.kind !== 'network') this.dropPending(reqId);
      throw e;
    }
    this.dropPending(reqId);
    if (!isPlausibleItem(r.item)) throw new GuildError('bad_item');
    if (!io.place(r.item)) {
      // remise au coffre (avec une clé neuve : c'est un nouveau dépôt). Noté avant l'appel : si le réseau tombe ici (sac devenu plein
      // entre le test et l'ajout, puis coupure), l'objet n'existe plus que dans cette note, redéposée à la reprise (même clé, sans doublon)
      const back: Pending = { op: 'redeposit', reqId: this.newReqId(), item: r.item, name: entry.name ?? '' };
      this.addPending(back);
      try {
        await this.call('POST', '/deposit', { item: r.item, name: back.name, reqId: back.reqId });
        this.dropPending(back.reqId);
      } catch (e) {
        // erreur définitive (refus, plus membre) : la note est gardée, la reprise retentera ; l'objet n'est jamais jeté sans le dire
        if (!(e instanceof GuildError) || e.kind !== 'network') logError('guilde : remise au coffre', e);
      }
      throw new GuildError('bag_full');
    }
    return r.item;
  }
}

/** Instance utilisée par l'interface */
export const Guild = new GuildClient();
