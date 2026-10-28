/**
 * Endgame (cartes, à partir du lot M5) : objets de carte et leur effet sur le monde, butin propre aux cartes, recettes de cartes (Cube,
 * opérations du coffre de cartes), parties de bots dans chaque carte (état du monde haché à chaque tick) et duels contre le boss de carte.
 * Les fonctions des cartes sont cherchées là où elles vivent (`mods/pd2/…` si le mod les porte, sinon `src/…`) : les clés ne dépendent
 * pas de l'emplacement du code, une référence d'avant le déplacement se compare donc à une exécution d'après.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Rng } from '../../../src/core/rng';
import { MAP_ZONES } from '../../../src/data/maps';
import { CUBE_RECIPES } from '../../../src/data/cube';
import { BotBrain, type BuildId } from '../../../src/sim/bot/brain';
import { referenceCharacter } from '../../../src/sim/bot/arena';
import { playRun } from '../../../src/sim/bot/runner';
import { rollMonsterDrops } from '../../../src/sim/loot/drops';
import { itemName } from '../../../src/sim/itemstats';
import type { Game } from '../../../src/sim/game';
import type { Item, Quality } from '../../../src/sim/item';
import { TICK_HZ } from '../../../src/sim/constants';
import { ser, sha1, type SectionResult } from '../lib';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Premier module présent parmi les chemins (relatifs à la racine du dépôt) */
async function mod<T>(...paths: string[]): Promise<T> {
  for (const p of paths) if (existsSync(join(ROOT, p))) return (await import(pathToFileURL(join(ROOT, p)).href)) as T;
  throw new Error(`aucun module : ${paths.join(', ')}`);
}

interface MapsModule {
  makeMap(rng: Rng, tier: number, quality?: Quality, zone?: string): Item;
  mapBonuses(it: Item): unknown;
  mapWorldSetup(it: Item): unknown;
  mapExtraDrops(rng: Rng, tier: number, rank: string): Item[];
  uniqueMapRewards(rng: Rng, zone: string, ilvl: number): Item[];
  treasureFallenDrops(rng: Rng, tier: number): Item[];
  horazonMaps(rng: Rng, tier: number): Item[];
  heroInvaderDrops(rng: Rng, ilvl: number): Item[];
  mapExtraGearDrops(rng: Rng, mods: { id: string; value: number }[], ilvl: number): Item[];
  applyMapRecipe(rng: Rng, e: unknown, items: Item[], clvl: number): unknown;
  corruptMap(rng: Rng, it: Item): string;
  corruptModText(c: { id: string; value: number }): string;
}

const BUILDS: BuildId[] = ['cold', 'whirlwind', 'summon', 'hammerdin'];
const QUALITIES: Quality[] = ['normal', 'magic', 'rare'];

function snap(g: Game): string {
  const w = g.world;
  return ser({ t: w.tick, p: w.player, m: w.monsters, mi: w.missiles, a: w.areas, it: w.items.length, ob: w.objects, mm: w.mapMods }, 4);
}

const h = (v: unknown) => sha1(ser(v, 8));

export async function run(): Promise<SectionResult> {
  const out: SectionResult = {};
  const M = await mod<MapsModule>('mods/pd2/sim/maps.ts', 'src/sim/maps.ts');

  // 1. objets de carte : chaque zone × qualité (unique pour les zones uniques), effet sur le monde, nom ; cartes tirées par palier
  for (const z of MAP_ZONES)
    for (const q of z.unique ? (['unique'] as Quality[]) : QUALITIES)
      for (const seed of [1, 2]) {
        const it = M.makeMap(new Rng(`fp:map:${z.id}:${q}:${seed}`), z.tier, q, z.id);
        out[`item/${z.id}/${q}/${seed}`] = h({ it, b: M.mapBonuses(it), s: M.mapWorldSetup(it), n: itemName(it) });
      }
  for (const tier of [1, 2, 3, 4])
    for (let seed = 0; seed < 40; seed++) {
      const it = M.makeMap(new Rng(`fp:rand:${tier}:${seed}`), tier);
      out[`rand/${tier}/${seed}`] = h({ it, s: M.mapWorldSetup(it) });
    }

  // 2. butin propre aux cartes
  for (const tier of [1, 2, 3, 4])
    for (const rank of ['normal', 'champion', 'unique', 'boss']) {
      const rng = new Rng(`fp:drops:${tier}:${rank}`);
      out[`drops/${tier}/${rank}`] = h(Array.from({ length: 300 }, () => M.mapExtraDrops(rng, tier, rank)));
    }
  for (const z of MAP_ZONES.filter((x) => x.unique)) for (const seed of [1, 2, 3]) out[`uniqueRewards/${z.id}/${seed}`] = h(M.uniqueMapRewards(new Rng(`fp:ur:${z.id}:${seed}`), z.id, 85));
  for (const tier of [1, 2, 3, 4]) {
    const rng = new Rng(`fp:ev:${tier}`);
    out[`events/${tier}`] = h(Array.from({ length: 20 }, () => [M.treasureFallenDrops(rng, tier), M.horazonMaps(rng, tier), M.heroInvaderDrops(rng, 80 + tier)]));
  }
  {
    const rng = new Rng('fp:gear');
    out['gear'] = h(Array.from({ length: 200 }, (_, i) => M.mapExtraGearDrops(rng, [{ id: i % 2 ? 'extraWeapon' : 'extraArmor', value: 20 + i }], 70 + (i % 20))));
  }

  // 3. recettes de cartes (fonctions du Cube), corruption d'une carte
  const mapRecipes = CUBE_RECIPES.filter((r) => r.effect.kind === 'mapOrb' || r.effect.kind === 'mapCombine' || r.effect.kind === 'mapScarab');
  for (const r of mapRecipes)
    for (const z of MAP_ZONES.filter((_, i) => i % 4 === 0))
      for (const q of z.unique ? (['unique'] as Quality[]) : QUALITIES) {
        const rng = new Rng(`fp:rec:${r.id}:${z.id}:${q}`);
        const items = [0, 1, 2].map(() => M.makeMap(rng, z.tier, q, z.id));
        let res: unknown;
        try {
          res = M.applyMapRecipe(rng, r.effect, items, 80);
        } catch (e) {
          res = 'ERR ' + (e as Error).message;
        }
        out[`recipe/${r.id}/${z.id}/${q}`] = h({ res, items });
      }
  for (const z of MAP_ZONES) {
    const rng = new Rng(`fp:corrupt:${z.id}`);
    const it = M.makeMap(rng, z.tier, z.unique ? 'unique' : 'rare', z.id);
    const note = M.corruptMap(rng, it);
    out[`corrupt/${z.id}`] = h({ note, it, s: M.mapWorldSetup(it), t: it.map?.corruptMod ? M.corruptModText(it.map.corruptMod) : '' });
  }

  // 4. coffre de cartes et opérations du jeu (Game : rangement, amélioration, fusion), avec orbes en inventaire
  {
    const g = referenceCharacter(85, 'cold', 4);
    const c = g.character;
    const rng = new Rng('fp:stash');
    const orbs = [
      'orb_arcane',
      'orb_zakarum',
      'orb_angelic',
      'orb_horadrim',
      'orb_destruction',
      'orb_cartographer',
      'orb_fortification',
      'worldstone_shard',
      'standard_heroes',
      'catalyst_shard',
      'horadrim_scarab',
    ];
    for (let i = 0; i < 30; i++) c.inventory[i] = M.makeMap(rng, 1 + (i % 3), i % 5 === 0 ? 'magic' : 'normal');
    const step = (k: string, v: unknown) => (out[`ops/${k}`] = h({ v, inv: c.inventory, ms: c.mapStash }));
    step('stashAll', g.stashAllBagMaps());
    for (const [i, o] of orbs.entries()) c.inventory[i] = { uid: `fp-orb-${i}`, base: o, quality: 'normal', ilvl: 1, sockets: 0, socketed: [], qty: 20 };
    for (const op of ['arcane', 'zakarum', 'angelic', 'horadrim', 'destruction', 'fortification', 'catalyst', 'heroes', 'scarab', 'corrupt'] as const)
      for (let idx = 0; idx < 4; idx++) {
        let v: unknown;
        try {
          v = g.upgradeMap({ from: 'mapstash', idx }, op as never);
        } catch (e) {
          v = 'ERR ' + (e as Error).message;
        }
        step(`upgrade/${op}/${idx}`, v);
      }
    for (const mode of ['same', 'upgrade'] as const)
      for (const tier of [1, 2, 3]) {
        let v: unknown;
        try {
          v = g.mergeMaps({ tier, mode });
        } catch (e) {
          v = 'ERR ' + (e as Error).message;
        }
        step(`merge/${mode}/${tier}`, v);
      }
  }

  // 5. parties de bots : chaque carte, 4 builds, 40 s de jeu, état du monde haché à chaque tick
  for (const [zi, z] of MAP_ZONES.entries())
    for (const build of BUILDS) {
      const g = referenceCharacter(86 + z.tier, build, 3);
      g.character.progression.highestDifficulty = 2;
      const brain = new BotBrain(g, { build, seed: 5 });
      brain.town();
      const c = g.character;
      let slot = c.inventory.indexOf(null);
      if (slot < 0) slot = 0;
      const rng = new Rng(`fp:run:${z.id}:${build}`);
      const it = M.makeMap(rng, z.tier, z.unique ? 'unique' : QUALITIES[zi % 3], z.id);
      if (zi % 4 === 3) M.corruptMap(rng, it);
      c.inventory[slot] = it;
      const hh = createHash('sha1');
      let n = 0;
      const off = g.onEvent((e) => hh.update('E' + ser(e, 3)));
      let rep: unknown;
      try {
        rep = playRun(g, brain, 'map', 2, { maxSeconds: 40, map: { invIndex: slot }, onTick: (gg) => (n++, hh.update(snap(gg))) });
      } catch (e) {
        rep = 'ERR ' + (e as Error).message;
      }
      off();
      out[`run/${z.id}/${build}`] = `${sha1(JSON.stringify(rep)).slice(0, 16)}:${hh.digest('hex')}:${n}`;
    }

  // 6. duels contre le boss de carte (arène dégagée, comme mods/pd2/tools/bots/map-boss-audit.ts) et butin du boss
  for (const z of MAP_ZONES.filter((_, i) => i % 3 === 0))
    for (const build of ['cold', 'whirlwind'] as BuildId[]) {
      const g = referenceCharacter(88 + z.tier, build, 2);
      const c = g.character;
      c.progression.highestDifficulty = 2;
      c.inventory[0] = M.makeMap(new Rng(`fp:duel:${z.id}`), z.tier, z.unique ? 'unique' : 'normal', z.id);
      const k = `duel/${z.id}/${build}`;
      if (!g.startMap({ invIndex: 0 }, 11).ok) {
        out[k] = 'refus';
        continue;
      }
      const w = g.world;
      const ps = w.pendingSpawns.find((p) => w.zone.spawns[p.idx]?.runBoss);
      if (!ps) {
        out[k] = 'sans boss';
        continue;
      }
      w.pendingSpawns = w.pendingSpawns.filter((p) => p !== ps);
      const group = w.spawnGroup(ps.idx);
      const boss = group.find((m) => m.runBoss) ?? group[0];
      out[`${k}/loot`] = h(Array.from({ length: 30 }, () => rollMonsterDrops(w, boss)));
      const spot = w.grid.nearestFree(boss.x - 9, boss.y, 6) ?? w.grid.nearestFree(boss.x + 9, boss.y, 6);
      if (spot) {
        w.player.x = w.player.px = spot.x;
        w.player.y = w.player.py = spot.y;
      }
      for (const m of w.monsters) if (!m.isSummon && !m.pet && m !== boss && m.leader !== boss.id) m.dead = true;
      const brain = new BotBrain(g, { build });
      const hh = createHash('sha1');
      const off = g.onEvent((e) => hh.update('E' + ser(e, 3)));
      let t = 0;
      try {
        for (; t < 25 * TICK_HZ && !w.player.dead && !boss.dead; t++) {
          brain.tick();
          g.step(1);
          hh.update(snap(g));
        }
      } catch (e) {
        hh.update('ERR ' + (e as Error).message);
      }
      off();
      out[k] = `${hh.digest('hex')}:${t}:${boss.dead ? 'mort' : Math.round(boss.hp)}`;
    }
  return out;
}
