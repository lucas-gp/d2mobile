/**
 * Hook de debug (window.__arpg) : créer un personnage à n'importe quel niveau, générer
 * n'importe quel objet, ouvrir n'importe quelle run, avancer la simulation, forcer un drop.
 * Utilisé par les bots navigateur, les tests E2E et à la main dans la console.
 */
import type { Game } from '../sim/game';
import { Rng } from '../core/rng';
import { addXp, xpToReach } from '../sim/progression';
import { generateItem, makeStack, type GenOptions } from '../sim/loot/itemgen';
import { addToCharacter } from '../sim/inventory';
import type { Difficulty } from '../data/types';
import type { Item } from '../sim/item';
import { classSkills } from '../data/skills';
import { RULES } from '../mods/rules';
import { MAP_UNIQUE_ZONES } from '../data/maps';
import { BASE_BY_ID } from '../data/items/bases';
import { spawnMonster } from '../sim/spawn';

export interface DebugHook {
  game(): Game;
  setLevel(level: number, autoSpend?: boolean): void;
  giveItem(baseId: string, opts?: GenOptions & { ilvl?: number; sockets?: number }): Item;
  giveStack(baseId: string, qty: number): void;
  dropItem(baseId: string, opts?: GenOptions & { ilvl?: number }): void;
  startRun(runId: string, difficulty?: Difficulty, seed?: number): boolean;
  town(): void;
  step(ticks: number): void;
  god(on?: boolean): void;
  killAll(): number;
  teleport(x: number, y: number): void;
  /**
   * Lot 312: a monster of species `id` set at (x, y) of the zone `zone` (the current one, or a neighbour joined edge to edge already
   * built), held there for `holdTicks` (stunned, asleep); its identifier, or -1
   */
  spawnIn(zone: string | null, id: string, x: number, y: number, holdTicks?: number): number;
  learnAll(level?: number): void;
  /** Cartes uniques (identifiant et palier) pour les tests E2E */
  uniqueMapZones(): { id: string; tier: number }[];
  /** Lot 321: the type of item base `id` (sword, staff…) for the E2E checks of the vendors' stalls */
  baseType(id: string): string | undefined;
  state(): Record<string, unknown>;
  [k: string]: unknown;
}

export function installDebugHook(getGame: () => Game, extra: Record<string, unknown> = {}): DebugHook {
  const rng = new Rng('debug');
  const hook: DebugHook = {
    game: getGame,
    setLevel(level, autoSpend = false) {
      const g = getGame();
      const c = g.character;
      if (level > c.level) addXp(c, xpToReach(level) - c.xp);
      if (autoSpend) {
        c.base.vit += c.statPoints;
        c.statPoints = 0;
      }
      g.world.refreshPlayer();
    },
    giveItem(baseId, opts = {}) {
      const g = getGame();
      const it = generateItem(rng, baseId, opts.ilvl ?? Math.max(1, g.character.level), opts);
      if (opts.sockets !== undefined) it.sockets = opts.sockets;
      addToCharacter(g.character, it);
      g.world.refreshPlayer();
      return it;
    },
    giveStack(baseId, qty) {
      addToCharacter(getGame().character, makeStack(rng, baseId, qty));
    },
    dropItem(baseId, opts = {}) {
      const g = getGame();
      const p = g.world.player;
      const it = generateItem(rng, baseId, opts.ilvl ?? g.world.zoneLevel, opts);
      g.world.dropItem(it, p.x + 1, p.y + 1);
    },
    startRun(runId, difficulty = 0, seed) {
      return getGame().startRun(runId, difficulty, seed);
    },
    town() {
      getGame().enterTown();
    },
    step(ticks) {
      getGame().step(ticks);
    },
    god(on = true) {
      getGame().world.godMode = on;
    },
    killAll() {
      const w = getGame().world;
      let n = 0;
      for (const m of w.monsters) {
        if (!m.dead && !m.isSummon) {
          w.killMonster(m, w.player);
          n++;
        }
      }
      return n;
    },
    spawnIn(zone, id, x, y, holdTicks = 0) {
      const g = getGame();
      const w = !zone || zone === g.world.zone.id ? g.world : g.seams.worldOf(zone);
      if (!w) return -1;
      const m = spawnMonster(w, id, x, y, { rank: 'normal' }, `debug:${w.tick}:${x.toFixed(1)}`);
      if (!m) return -1;
      if (holdTicks > 0) {
        m.stunT = holdTicks;
        m.aggro = false;
      }
      return m.id;
    },
    teleport(x, y) {
      const p = getGame().world.player;
      p.x = p.px = x;
      p.y = p.py = y;
    },
    giveMap(tier = 1, quality?: 'normal' | 'magic' | 'rare' | 'unique', zone?: string) {
      const g = getGame();
      const m = RULES['maps.make'](rng, tier, quality, zone);
      addToCharacter(g.character, m);
      return m;
    },
    uniqueMapZones() {
      return MAP_UNIQUE_ZONES.map((z) => ({ id: z.id, tier: z.tier }));
    },
    baseType(id) {
      return BASE_BY_ID[id]?.type;
    },
    learnAll(level = 1) {
      const g = getGame();
      for (const s of classSkills(g.character.classId)) g.character.skills[s.id] = Math.max(g.character.skills[s.id] ?? 0, level);
      g.world.refreshPlayer();
    },
    state() {
      const g = getGame();
      const w = g.world;
      return {
        mode: g.mode,
        zone: w.zone.id,
        tick: w.tick,
        level: g.character.level,
        xp: g.character.xp,
        hp: w.player.hp,
        hpMax: w.player.hpMax,
        mana: w.player.mana,
        x: w.player.x,
        y: w.player.y,
        dead: w.player.dead,
        monsters: w.aliveMonsters().length,
        items: w.items.length,
        kills: w.stats.kills,
        casts: w.stats.casts,
        playerMode: w.player.mode,
        gold: g.character.gold,
        inventory: g.character.inventory.filter(Boolean).length,
      };
    },
    ...extra,
  };
  window.__arpg = hook;
  return hook;
}
