/**
 * Préparation en arrière-plan des zones suivantes (mode local), dans l'ordre de « leveling » (voir d2plan.ts) : après la préparation
 * bloquante de la zone courante, le jeu fabrique à basse priorité les planches et la carte des zones à venir. Jamais bloquant :
 * se met en pause quand le jeu rame, que la page est cachée, que l'économiseur de données ou la batterie faible l'exigent, ou qu'un
 * chargement est en cours. Reprend seule après un rechargement (les zones faites sont mémorisées, les assets déjà générés sautés).
 */
import type { PlanZone, RunLite } from './d2plan';
import type { Tier } from './d2local-core';

const PREGEN_KEY = 'd2m.d2pregen';
const PREGEN_DONE_KEY = 'd2m.d2pregen.done';
/** images par seconde en dessous desquelles on laisse le jeu tranquille */
export const PREGEN_MIN_FPS = 40;
/** assets demandés d'un coup : on revérifie les conditions entre deux lots */
const PREGEN_CHUNK = 10;

export function pregenEnabled(): boolean {
  try {
    return localStorage.getItem(PREGEN_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setPregenEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(PREGEN_KEY);
    else localStorage.setItem(PREGEN_KEY, 'off');
  } catch {
    /* ignoré */
  }
}

export interface PregenCtx {
  enabled: boolean;
  hasFiles: boolean;
  /** chargement bloquant en cours (écran de chargement) */
  loading: boolean;
  /** copie des fichiers en cours */
  copying: boolean;
  quotaFull: boolean;
  /** « tout générer » ou une génération urgente occupe déjà la file */
  queueBusy: boolean;
  visible: boolean;
  /** images par seconde mesurées en jeu (0 = inconnu) */
  fps: number;
  saveData: boolean;
  /** niveau de batterie 0-1 et branché ; null si indisponible */
  battery: { level: number; charging: boolean } | null;
}

export type PauseReason = 'off' | 'nofiles' | 'loading' | 'copying' | 'quota' | 'busy' | 'hidden' | 'fps' | 'saver' | 'battery';

/** Raison de ne PAS préparer maintenant, ou null (on peut) */
export function pregenPause(c: PregenCtx): PauseReason | null {
  if (!c.enabled) return 'off';
  if (!c.hasFiles) return 'nofiles';
  if (c.quotaFull) return 'quota';
  if (c.copying) return 'copying';
  if (c.loading) return 'loading';
  if (!c.visible) return 'hidden';
  if (c.saveData) return 'saver';
  if (c.battery && !c.battery.charging && c.battery.level < 0.2) return 'battery';
  if (c.queueBusy) return 'busy';
  if (c.fps > 0 && c.fps < PREGEN_MIN_FPS) return 'fps';
  return null;
}

interface PregenState {
  tier: Tier;
  done: string[];
}

/** Copie en mémoire (stockage local indisponible) */
let memState: PregenState | null = null;

function loadPregenDone(tier: Tier): Set<string> {
  let v: PregenState | null = memState;
  try {
    const raw = localStorage.getItem(PREGEN_DONE_KEY);
    v = raw ? (JSON.parse(raw) as PregenState) : null;
  } catch {
    /* ignoré : copie mémoire */
  }
  // changement de palier : tout est à refaire à la nouvelle résolution (ce qui existe déjà est sauté par le service)
  return v && v.tier === tier && Array.isArray(v.done) ? new Set(v.done) : new Set();
}

function savePregenDone(tier: Tier, done: Set<string>): void {
  memState = { tier, done: [...done] };
  try {
    localStorage.setItem(PREGEN_DONE_KEY, JSON.stringify(memState));
  } catch {
    /* ignoré */
  }
}

export function resetPregenDone(): void {
  memState = null;
  try {
    localStorage.removeItem(PREGEN_DONE_KEY);
  } catch {
    /* ignoré */
  }
}

export interface PregenStatus {
  total: number;
  /** zones dont TOUS les assets du palier courant sont prêts */
  done: number;
  /** zones abandonnées après plusieurs échecs (archive manquante, génération impossible) */
  skipped: number;
  current: string | null;
  paused: PauseReason | null;
  finished: boolean;
  /** dernière raison d'échec (assets et message) */
  lastError: string;
}

export interface PregenDeps {
  order: () => RunLite[];
  /** prépare ce qu'il faut pour connaître la zone (données de sa carte chargées) ; false si impossible pour l'instant */
  prepare: (r: RunLite) => Promise<boolean>;
  /** plan d'une run (null : zone impossible à construire) */
  plan: (r: RunLite) => PlanZone | null;
  tier: () => Tier;
  ctx: () => PregenCtx;
  /** demande un asset à basse priorité ; true une fois prêt */
  request: (id: string, tier: Tier) => Promise<boolean>;
  ready: (id: string, tier: Tier) => boolean;
  /** pourquoi un asset n'est pas prêt (message de l'échec) */
  why: (id: string) => string;
  /** une carte n'est préparée que si les cartes DS1 sont activées */
  mapsEnabled: () => boolean;
}

/** Essais avant d'abandonner une zone */
export const PREGEN_TRIES = 3;

export class Pregen {
  private done = new Set<string>();
  private tries = new Map<string, number>();
  private skipped = new Set<string>();
  private running = false;
  private timer = 0;
  status: PregenStatus = { total: 0, done: 0, skipped: 0, current: null, paused: null, finished: false, lastError: '' };
  onChange: (() => void) | null = null;

  constructor(private readonly d: PregenDeps) {}

  start(everyMs = 3000): void {
    if (this.timer) return;
    this.timer = window.setInterval(() => void this.tick(), everyMs);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  /** Recommence la liste (après un effacement, un changement de palier ou l'ajout d'une archive) */
  reset(): void {
    this.done.clear();
    this.tries.clear();
    this.skipped.clear();
    resetPregenDone();
    this.status = { ...this.status, finished: false, lastError: '' };
  }

  /** Les zones abandonnées sont retentées (une archive vient d'être ajoutée) */
  retrySkipped(): void {
    this.skipped.clear();
    this.tries.clear();
    this.status = { ...this.status, finished: false, lastError: '' };
  }

  private emit(p: Partial<PregenStatus>): void {
    this.status = { ...this.status, ...p };
    this.onChange?.();
  }

  private fail(id: string, tier: Tier, why: string): void {
    const n = (this.tries.get(id) ?? 0) + 1;
    this.tries.set(id, n);
    if (n >= PREGEN_TRIES) this.skipped.add(id);
    this.emit({ lastError: why, skipped: this.skipped.size });
    void tier;
  }

  /** Un pas : au plus une zone (par lots de 10 assets). Une zone n'est « préparée » que quand tous ses assets sont prêts. */
  async tick(): Promise<void> {
    if (this.running) return;
    const tier = this.d.tier();
    // la liste faite est relue à chaque pas : un effacement ailleurs (Réglages) la remet à zéro
    this.done = loadPregenDone(tier);
    const order = this.d.order();
    const pause = pregenPause(this.d.ctx());
    const left = order.filter((r) => !this.done.has(r.id) && !this.skipped.has(r.id));
    this.emit({ total: order.length, done: order.filter((r) => this.done.has(r.id)).length, skipped: this.skipped.size, paused: pause, finished: left.length === 0 });
    if (pause || !left.length) return;
    this.running = true;
    try {
      const r = left[0];
      this.emit({ current: r.name });
      if (!(await this.d.prepare(r))) {
        this.fail(r.id, tier, `${r.name}: map data not available`);
        return;
      }
      const z = this.d.plan(r);
      if (!z) {
        this.skipped.add(r.id);
        this.emit({ lastError: `${r.name}: zone cannot be built`, skipped: this.skipped.size });
        return;
      }
      const ids = z.sheets.filter((id) => !this.d.ready(id, tier));
      const mapId = z.map && this.d.mapsEnabled() ? `map:${z.map}` : null;
      if (mapId && !this.d.ready(mapId, tier)) ids.push(mapId);
      for (let i = 0; i < ids.length; i += PREGEN_CHUNK) {
        const stop = pregenPause({ ...this.d.ctx(), queueBusy: false });
        if (stop) {
          this.emit({ paused: stop });
          return; // reprise au prochain tour : les assets déjà prêts sont sautés
        }
        if (tier !== this.d.tier()) return;
        await Promise.all(ids.slice(i, i + PREGEN_CHUNK).map((id) => this.d.request(id, tier)));
      }
      // « préparée » seulement si tout est réellement prêt au palier courant
      const notReady = [...z.sheets, ...(mapId ? [mapId] : [])].filter((id) => !this.d.ready(id, tier));
      if (notReady.length) {
        this.fail(
          r.id,
          tier,
          `${r.name}: ${notReady.length} not ready (${notReady
            .slice(0, 3)
            .map((id) => `${id}: ${this.d.why(id)}`)
            .join('; ')})`,
        );
        return;
      }
      this.done.add(r.id);
      savePregenDone(tier, this.done);
      this.emit({ done: order.filter((x) => this.done.has(x.id)).length, current: null, lastError: '' });
    } finally {
      this.running = false;
    }
  }
}
