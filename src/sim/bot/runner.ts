/**
 * Boucles de bots : une run complète (ville → run → retour) et une session de progression
 * (niveau 1 → objectif), avec mesures : temps par étape, morts et leurs causes, TTK, butin.
 * Aucune dépendance au rendu : tourne dans Node (vitest) comme dans le navigateur (hook).
 */
import type { Difficulty } from '../../data/types';
import { BASE_BY_ID } from '../../data/items/bases';
import { TICK_HZ } from '../constants';
import type { SimEvent } from '../events';
import { Game } from '../game';
import { BotBrain, BUILD_CLASS, type BotOptions } from './brain';
import { classOf } from '../../data/classes';

interface DeathCause {
  run: string;
  difficulty: Difficulty;
  level: number;
  /** Élément et montant des derniers coups (2 s) */
  lastHits: { elem: string; amount: number }[];
  /** Monstres à moins de 6 unités */
  nearby: string[];
}

export interface RunReport {
  runId: string;
  difficulty: Difficulty;
  seconds: number;
  completed: boolean;
  died: boolean;
  timedOut: boolean;
  stuck: boolean;
  kills: number;
  levelStart: number;
  levelEnd: number;
  xpGained: number;
  drops: Record<string, number>;
  potions: number;
  /** Temps pour tuer (s) par rang : du premier coup reçu par le monstre à sa mort */
  ttk: Record<string, number[]>;
  /** Répartition du temps de la run (s) par décision du bot */
  time: Record<string, number>;
  /** Résistances et vie du personnage au départ de la run */
  res: Record<string, number>;
  life: number;
  death?: DeathCause;
  /** Carte d'endgame : palier (4 = donjon) et rareté */
  map?: { tier: number; quality: string; fortified: boolean };
}

export interface RunOptions {
  maxSeconds: number;
  /** Rappel à chaque tick (ex. mesures de performance) */
  onTick?: (g: Game) => void;
  /** Ouvre la carte de l'inventaire à cet index au lieu de la run `runId` */
  map?: { invIndex: number };
}

/** Joue une run complète avec le cerveau fourni, depuis la ville. */
export function playRun(game: Game, brain: BotBrain, runId: string, difficulty: Difficulty, opts: RunOptions): RunReport {
  const c = game.character;
  const levelStart = c.level;
  const xpStart = c.xp;
  const mapItem = opts.map ? c.inventory[opts.map.invIndex] : null;
  if (opts.map) {
    const ok = game.startMap({ invIndex: opts.map.invIndex });
    if (!ok.ok) throw new Error(`carte impossible à ouvrir : ${ok.reason}`);
  } else game.startRun(runId, difficulty);
  const rep: RunReport = {
    runId,
    difficulty,
    seconds: 0,
    completed: false,
    died: false,
    timedOut: false,
    stuck: false,
    kills: 0,
    levelStart,
    levelEnd: levelStart,
    xpGained: 0,
    drops: {},
    potions: 0,
    ttk: {},
    time: {},
    res: { ...game.world.player.d.res },
    life: game.world.player.hpMax,
    map: mapItem?.map ? { tier: mapItem.map.tier, quality: mapItem.quality, fortified: !!mapItem.map.fortified } : undefined,
  };
  const time0 = { ...brain.stats.time };
  const firstHit = new Map<number, number>();
  const recentHurt: { tick: number; elem: string; amount: number }[] = [];
  const maxTicks = Math.round(opts.maxSeconds * TICK_HZ);
  const onEvent = (e: SimEvent) => {
    const w = game.world;
    switch (e.t) {
      case 'hit':
        if (!e.toPlayer && !firstHit.has(e.target)) firstHit.set(e.target, w.tick);
        break;
      case 'death': {
        rep.kills++;
        const f = firstHit.get(e.id);
        // boss de carte : temps de mise à mort à part (rang unique sinon)
        const key = e.rank === 'unique' && w.monsters.find((m) => m.id === e.id)?.mapBoss ? 'mapboss' : e.rank;
        if (f !== undefined) (rep.ttk[key] ??= []).push((w.tick - f) / TICK_HZ);
        break;
      }
      case 'playerHurt':
        recentHurt.push({
          tick: w.tick,
          elem: e.elem,
          amount: Math.round(e.amount),
        });
        break;
      case 'itemDrop': {
        const gi = w.items.find((i) => i.item.uid === e.uid);
        if (gi) {
          const b = BASE_BY_ID[gi.item.base];
          const key = b?.type === 'rune' ? 'rune' : b?.type === 'gem' ? 'gem' : b?.id === 'gold' ? 'gold' : b?.type === 'potion' ? 'potion' : gi.item.quality;
          rep.drops[key] = (rep.drops[key] ?? 0) + 1;
        }
        break;
      }
      case 'playerDeath':
        if (!rep.died) {
          rep.died = true;
          const p = w.player;
          rep.death = {
            run: runId,
            difficulty,
            level: c.level,
            lastHits: recentHurt.filter((h) => w.tick - h.tick <= TICK_HZ * 2).map((h) => ({ elem: h.elem, amount: h.amount })),
            nearby: w.monsters.filter((m) => !m.dead && Math.hypot(m.x - p.x, m.y - p.y) < 6).map((m) => `${m.def.id}:${m.rank}${m.mods.length ? `[${m.mods.join(',')}]` : ''}`),
          };
        }
        break;
      case 'runComplete':
        rep.completed = true;
        break;
    }
  };
  const off = game.onEvent(onEvent);
  let ticks = 0;
  while (game.mode === 'run') {
    brain.tick();
    game.step(1);
    opts.onTick?.(game);
    ticks++;
    if (recentHurt.length > 64) recentHurt.splice(0, recentHurt.length - 32);
    if (game.mode !== 'run') break;
    // fin : run terminée et plus rien à faire → portail ; bloqué → abandon
    const run = game.world.run;
    // une carte se nettoie entièrement (densité et butin) ; une run classique se quitte après le boss
    const linger = opts.map ? 150 : 20;
    if (rep.completed && (brain.idleTicks > TICK_HZ * 2 || (run && game.world.tick - run.completeTick > TICK_HZ * linger))) {
      game.townPortal();
      break;
    }
    if (brain.idleTicks > TICK_HZ * 15) {
      rep.stuck = true;
      game.townPortal();
      break;
    }
    if (ticks >= maxTicks) {
      rep.timedOut = true;
      game.townPortal();
      break;
    }
  }
  off();
  rep.seconds = ticks / TICK_HZ;
  rep.levelEnd = c.level;
  rep.xpGained = c.xp - xpStart;
  rep.potions = brain.stats.potions;
  for (const [k, v] of Object.entries(brain.stats.time)) {
    const d = v - (time0[k] ?? 0);
    if (d > 0) rep.time[k] = Math.round((d / TICK_HZ) * 10) / 10;
  }
  return rep;
}

export interface ProgressionReport {
  build: string;
  runs: RunReport[];
  /** Temps cumulé (s, simulation + ville estimée) à chaque niveau atteint */
  levelTimes: Record<number, number>;
  /** Premières fois : unique, set, rune par rang, première run de chaque difficulté */
  firsts: Record<string, number>;
  totalSeconds: number;
  finalLevel: number;
  deaths: DeathCause[];
  equipped: string[];
}

export interface ProgressionOptions {
  bot?: Partial<BotOptions>;
  targetLevel: number;
  /** Plafond de temps de jeu (s) */
  maxSeconds: number;
  maxRunSeconds?: number;
  /** Arrêt anticipé (ex. map débloquée) */
  until?: (g: Game) => boolean;
  onRun?: (r: RunReport, g: Game) => void;
}

/** Session de progression : le bot enchaîne les runs en n'utilisant que ce qu'il trouve. */
export function progressionSession(opts: ProgressionOptions, game = new Game(undefined, BUILD_CLASS[opts.bot?.build ?? 'cold'])): ProgressionReport {
  const brain = new BotBrain(game, opts.bot);
  const rep: ProgressionReport = {
    build: brain.opt.build,
    runs: [],
    levelTimes: {},
    firsts: {},
    totalSeconds: 0,
    finalLevel: 1,
    deaths: [],
    equipped: [],
  };
  const c = game.character;
  // la graine du bot change le nom, donc les graines de toutes les runs (reproductible)
  if (brain.opt.seed !== 1) c.name = `${classOf(c.classId).name}-${brain.opt.seed}`;
  let clock = 0;
  // chaque run crée un monde neuf dont le tick part de 0
  const now = () => Math.round(clock + (game.mode === 'run' ? game.world.tick / TICK_HZ : 0));
  const off = game.onEvent((e) => {
    if (e.t === 'levelUp' && rep.levelTimes[e.level] === undefined) rep.levelTimes[e.level] = now();
    if (e.t === 'pickup') {
      if (e.kind === 'rune') {
        const k = `rune:${e.name}`;
        if (rep.firsts[k] === undefined) rep.firsts[k] = now();
        return;
      }
      const it = findItem(game, e.uid);
      const key = it && (it.quality === 'unique' || it.quality === 'set') ? it.quality : null;
      if (key && rep.firsts[key] === undefined) rep.firsts[key] = now();
    }
  });
  let guard = 0;
  while (c.level < opts.targetLevel && clock < opts.maxSeconds && guard++ < 5000) {
    const plan = brain.town();
    clock += brain.opt.townSeconds;
    if (!plan) break;
    const r = playRun(game, brain, plan.runId, plan.difficulty, {
      // cartes (~20 000 u², ~1 000 monstres : 6 à 12 min) : arrêt d’une run bloquée à 25 min, runs classiques à 10 min
      maxSeconds: opts.maxRunSeconds ?? (plan.map ? 1500 : 600),
      onTick: () => undefined,
      map: plan.map,
    });
    // les cartes sont comptées par palier (map:1 … map:4)
    const sub = plan.map ? plan.map.tier : plan.difficulty;
    const key = `run:${plan.runId}:${sub}`;
    if (rep.firsts[key] === undefined) rep.firsts[key] = Math.round(clock);
    clock += r.seconds;
    // une run classique non terminée en 10 min (boss hors de portée : immunisés) compte comme un
    // échec, comme une mort : le bot ne s'y relance pas sans fin
    brain.noteRun(plan.runId, sub, r.died || (!plan.map && !r.completed), r.xpGained, r.seconds);
    rep.runs.push(r);
    if (r.death) rep.deaths.push(r.death);
    opts.onRun?.(r, game);
    if (opts.until?.(game)) break;
  }
  off();
  rep.totalSeconds = Math.round(clock);
  rep.finalLevel = c.level;
  rep.equipped = Object.entries(c.equipment).map(([s, it]) => `${s}:${it!.base}:${it!.quality}`);
  return rep;
}

function findItem(game: Game, uid: string) {
  const c = game.character;
  for (const it of c.inventory) if (it?.uid === uid) return it;
  for (const tab of c.stash) for (const it of tab) if (it?.uid === uid) return it;
  for (const it of Object.values(c.equipment)) if (it?.uid === uid) return it;
  return null;
}
