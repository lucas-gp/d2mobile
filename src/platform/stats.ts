/**
 * Statistiques anonymes d'utilisation (voir PRIVACY.md) : compter les joueurs différents, rien d'autre. Un identifiant aléatoire tiré sur l'appareil
 * (jamais lié à un compte, un nom, une sauvegarde ou une adresse), envoyé avec : en jeu ou au menu, version du jeu, site (public / owner). Aucun cookie,
 * aucune empreinte d'appareil, aucun contenu de jeu. Appelé en chemin relatif `/stats-api/ping` (réécriture Vercel / proxy Vite) ; sans service derrière,
 * l'appel échoue en silence et le client cesse d'insister.
 *
 * Cadence : un ping à l'ouverture puis toutes les 60 s, seulement quand l'onglet est visible. Réglage joueur « Statistiques anonymes d'utilisation » (activé par
 * défaut) : désactivé → rien n'est envoyé et l'identifiant est supprimé. « Ne pas suivre » (DNT) et Global Privacy Control du navigateur sont respectés.
 * Jamais bloquant : toute erreur est avalée.
 */
import { PUBLIC_BUILD } from './build-flags';

export type StatsSite = 'public' | 'owner';

const BASE = '/stats-api';
const ID_KEY = 'd2m.stats.id';
const OFF_KEY = 'd2m.stats.off';
/** Date de création de l'identifiant (ms) : au-delà de 13 mois, il est remplacé par un nouveau (durée de vie maximale d'un traceur de mesure d'audience, CNIL) */
const ID_AT_KEY = 'd2m.stats.idAt';
/** 13 mois (395 jours, arrondi par défaut) */
export const STATS_ID_MAX_AGE_MS = 395 * 86_400_000;
export const STATS_EVERY_MS = 60_000;
/** Au-delà de ce nombre d'échecs de suite, le client cesse d'insister pour la session (le service est absent ou en panne) */
const MAX_FAILS = 5;

interface KeyStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** Ce que le client lit de son environnement (injectable en test) */
export interface StatsEnv {
  storage: () => KeyStore | null;
  /** « Ne pas suivre » ou Global Privacy Control actif */
  doNotTrack: () => boolean;
  visible: () => boolean;
  /** Abonnement au retour de visibilité de l'onglet ; retourne le désabonnement */
  onVisible: (cb: () => void) => () => void;
  randomId: () => string | null;
  fetch: typeof fetch | null;
}

function browserStorage(): KeyStore | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** UUID v4 : `crypto.randomUUID`, sinon `getRandomValues` ; sans l'un ni l'autre, pas d'identifiant (donc pas de ping) */
function browserRandomId(): string | null {
  try {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
    if (typeof crypto?.getRandomValues === 'function') {
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }
  } catch {
    /* indisponible */
  }
  return null;
}

function browserDnt(): boolean {
  try {
    const n = navigator;
    const w = window;
    return n.doNotTrack === '1' || n.doNotTrack === 'yes' || n.msDoNotTrack === '1' || w.doNotTrack === '1' || n.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

const browserEnv = (): StatsEnv => ({
  storage: browserStorage,
  doNotTrack: browserDnt,
  visible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  onVisible: (cb) => {
    const h = (): void => {
      if (document.visibilityState !== 'hidden') cb();
    };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  },
  randomId: browserRandomId,
  fetch: typeof fetch === 'function' ? fetch.bind(globalThis) : null,
});

export type StatsMode = 'on' | 'off' | 'dnt';

export class StatsClient {
  private playing = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsub: (() => void) | null = null;
  private memId: string | null = null;
  private lastSent = -Infinity;
  private fails = 0;
  private skip = 0;
  private dead = false;
  private running = false;
  private readonly env: StatsEnv;
  constructor(
    private readonly site: StatsSite,
    private version: string,
    env: Partial<StatsEnv> = {},
    private readonly clock: () => number = () => Date.now(),
  ) {
    this.env = { ...browserEnv(), ...env };
  }

  /** Choix du joueur et du navigateur : `off` (désactivé par le joueur), `dnt` (« Ne pas suivre » du navigateur), `on` */
  mode(): StatsMode {
    if (this.env.doNotTrack()) return 'dnt';
    if (this.memOff) return 'off';
    try {
      return this.env.storage()?.getItem(OFF_KEY) === '1' ? 'off' : 'on';
    } catch {
      return 'on';
    }
  }

  /** Active ou désactive les statistiques ; désactiver supprime l'identifiant et arrête les envois tout de suite */
  setEnabled(on: boolean): void {
    try {
      const s = this.env.storage();
      if (on) s?.removeItem(OFF_KEY);
      else s?.setItem(OFF_KEY, '1');
    } catch {
      /* stockage indisponible : le choix vaut pour cette session seulement */
      this.memOff = !on;
    }
    if (on) {
      this.memOff = false;
      if (this.running) this.begin();
    } else {
      this.forgetId();
      this.halt();
    }
  }
  private memOff = false;

  private allowed(): boolean {
    return this.mode() === 'on' && !this.dead && !!this.env.fetch;
  }

  private forgetId(): void {
    this.memId = null;
    try {
      this.env.storage()?.removeItem(ID_KEY);
      this.env.storage()?.removeItem(ID_AT_KEY);
    } catch {
      /* rien à supprimer */
    }
  }

  /** Identifiant anonyme de l'appareil (créé au premier envoi) ; sans stockage, valable pour la page seulement */
  private id(): string | null {
    try {
      const s = this.env.storage();
      const have = s?.getItem(ID_KEY);
      const now = this.clock();
      if (have && /^[0-9a-f-]{36}$/.test(have)) {
        const at = Number(s?.getItem(ID_AT_KEY));
        // identifiant d'avant la date de création (lot 247) : sa durée de vie compte à partir d'aujourd'hui
        if (!Number.isFinite(at) || at <= 0 || at > now) s?.setItem(ID_AT_KEY, String(now));
        else if (now - at > STATS_ID_MAX_AGE_MS) return this.renew(s, now);
        return have;
      }
      if (this.memId) {
        s?.setItem(ID_KEY, this.memId);
        s?.setItem(ID_AT_KEY, String(now));
        return this.memId;
      }
      return this.renew(s, now);
    } catch {
      this.memId ??= this.env.randomId();
      return this.memId;
    }
  }

  /** Nouvel identifiant aléatoire, daté */
  private renew(s: KeyStore | null | undefined, now: number): string | null {
    const fresh = this.env.randomId();
    if (!fresh) return null;
    this.memId = fresh;
    s?.setItem(ID_KEY, fresh);
    s?.setItem(ID_AT_KEY, String(now));
    return fresh;
  }

  /** Démarre les envois (une seule fois) : ping tout de suite puis toutes les 60 s quand l'onglet est visible */
  start(version?: string): void {
    if (version) this.version = version;
    if (this.running) return;
    this.running = true;
    this.begin();
  }

  private begin(): void {
    this.halt();
    if (!this.allowed()) {
      // « Ne pas suivre » ou désactivé : aucun identifiant conservé
      if (this.mode() !== 'on') this.forgetId();
      return;
    }
    this.timer = setInterval(() => this.tick(), STATS_EVERY_MS);
    this.unsub = this.env.onVisible(() => {
      if (this.clock() - this.lastSent >= STATS_EVERY_MS) this.tick();
    });
    this.tick();
  }

  private halt(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.unsub?.();
    this.unsub = null;
  }

  stop(): void {
    this.running = false;
    this.halt();
  }

  /** Personnage en jeu (vrai) ou menu (faux) */
  setPlaying(v: boolean): void {
    this.playing = v;
  }

  private tick(): void {
    try {
      if (!this.allowed()) return this.halt();
      if (!this.env.visible()) return;
      if (this.skip > 0) {
        this.skip--;
        return;
      }
      const id = this.id();
      if (!id) return;
      this.lastSent = this.clock();
      const body = JSON.stringify({ id, playing: this.playing, ver: this.version, site: this.site });
      void this.env.fetch!(`${BASE}/ping`, { method: 'POST', body, keepalive: true, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'text/plain' } })
        .then(
          (r) => this.done(r.status),
          () => this.done(0),
        )
        .catch(() => undefined);
    } catch {
      /* jamais bloquant */
    }
  }

  private done(status: number): void {
    if (status >= 200 && status < 300) {
      this.fails = 0;
      return;
    }
    // 404 : pas de service derrière /stats-api (version publique sans STATS_API_URL) → on n'insiste pas ; autre échec : on espace puis on abandonne
    if (status === 404 || status === 405 || ++this.fails >= MAX_FAILS) {
      this.dead = true;
      this.halt();
      return;
    }
    this.skip = Math.min(2 ** this.fails, 8);
  }
}

let shared: StatsClient | null = null;

/** Client commun de l'application (un seul par page) */
export function stats(): StatsClient {
  shared ??= new StatsClient(PUBLIC_BUILD ? 'public' : 'owner', 'dev');
  return shared;
}

/**
 * Démarre les statistiques de l'application. Rien en développement (sauf `?stats-test`), en benchmark ni sous un navigateur piloté (tests de bout en bout) :
 * ces lancements ne sont pas des joueurs.
 */
export function startStats(version: string): void {
  try {
    const q = new URLSearchParams(location.search);
    const bot = navigator.webdriver === true;
    if (q.has('bench') || bot || (import.meta.env.DEV && !q.has('stats-test'))) return;
    stats().start(version.replace(/[^\w.-]/g, '').slice(0, 16) || 'dev');
  } catch {
    /* jamais bloquant */
  }
}
