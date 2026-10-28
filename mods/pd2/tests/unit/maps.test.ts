/** Cartes d'endgame : zones parcourables, affixes par palier, run complète, sauvegarde, butin, recettes. */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../../../src/core/rng';
import { MAP_AFFIX_BY_ID, MAP_ZONES } from '../../../../src/data/maps';
import { PROP_BY_ID } from '../../../../src/data/props';
import { MONSTER_BY_ID } from '../../../../src/data/monsters';
import { buildMapZone } from '../../data/zones/mapzone';
import { findPath } from '../../../../src/sim/bot/pathfind';
import { Game, MAP_MIN_LEVEL } from '../../../../src/sim/game';
import { makeMap, mapExtraDrops, mapWorldSetup } from '../../sim/maps';
import { addXp, xpToReach } from '../../../../src/sim/progression';
import { deserialize, serialize } from '../../../../src/sim/save';
import { buildGrid } from '../../../../src/sim/world';
import { reachFrom } from './map-reach';

function mapper(): Game {
  const g = new Game();
  addXp(g.character, xpToReach(MAP_MIN_LEVEL + 5));
  g.character.progression.highestDifficulty = 2;
  return g;
}

describe('Cartes', () => {
  it('chaque zone de carte : décor et monstres connus, départ libre, tout est atteignable', () => {
    const errs: string[] = [];
    for (const def of MAP_ZONES) {
      for (const m of [...def.monsters, def.boss.monster]) if (!MONSTER_BY_ID[m]) errs.push(`${def.id} : monstre inconnu ${m}`);
      for (let seed = 1; seed <= 4; seed++) {
        const z = buildMapZone(def, seed, { density: 60, rarity: 40, extraBoss: seed === 2, extraFamily: seed === 3 ? 'zombie' : undefined });
        for (const p of z.props) if (!PROP_BY_ID[p.prop]) errs.push(`${def.id} : décor inconnu ${p.prop}`);
        const { grid: g, reach } = reachFrom(z);
        if (g.circleBlocked(z.start.x, z.start.y, 0.4)) errs.push(`${def.id}/${seed} : départ bloqué`);
        for (const s of z.spawns) if (!reach(s.x, s.y)) errs.push(`${def.id}/${seed} : ${s.monster} inatteignable`);
        for (const o of z.objects) if (!reach(o.x, o.y)) errs.push(`${def.id}/${seed} : objet ${o.kind} inatteignable`);
        // le boss par l'A* des bots (même limite de nœuds qu'en jeu)
        const boss = z.spawns.find((s) => s.runBoss)!;
        if (!findPath(g, z.start.x, z.start.y, boss.x, boss.y)) errs.push(`${def.id}/${seed} : boss hors de portée de l'A*`);
        if (!z.spawns.some((s) => s.runBoss)) errs.push(`${def.id} : pas de boss`);
      }
    }
    expect(errs.slice(0, 15), errs.slice(0, 15).join('\n')).toEqual([]);
  }, 60000);

  it('affixes : valeurs dans les plages du palier, nombre selon la rareté', () => {
    const rng = new Rng('maps');
    for (let i = 0; i < 600; i++) {
      const tier = 1 + (i % 4);
      const q = (['normal', 'magic', 'rare'] as const)[i % 3];
      const m = makeMap(rng, tier, q);
      const n = m.map!.mods.length;
      if (q === 'normal') expect(n).toBe(0);
      if (q === 'magic') expect(n).toBeGreaterThanOrEqual(1);
      if (q === 'rare') expect(n).toBeGreaterThanOrEqual(4);
      for (const mod of m.map!.mods) {
        const a = MAP_AFFIX_BY_ID[mod.id];
        const bands = tier === 1 ? [0] : tier === 2 ? [0, 1] : tier === 3 ? [1, 2] : [2];
        expect(
          bands.some((b) => mod.value >= a.ranges[b][0] && mod.value <= a.ranges[b][1]),
          `${mod.id}=${mod.value} au palier ${tier}`,
        ).toBe(true);
      }
    }
  });

  it('run de carte : ouverture, boss → fin, palier enregistré ; sauvegarde en pleine carte', () => {
    const g = mapper();
    const c = g.character;
    expect(c.inventory.filter((x) => x?.map).length).toBe(0);
    g.enterTown(); // Anya offre trois cartes
    const idx = c.inventory.findIndex((x) => x?.map);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(g.startMap({ invIndex: idx }).ok).toBe(true);
    expect(g.world.zoneLevel).toBeGreaterThanOrEqual(87);
    g.world.godMode = true;
    g.step(20);
    const text = serialize(g.toSave());
    const g2 = new Game(deserialize(text));
    expect(g2.mode).toBe('run');
    expect(g2.world.zone.name).toBe(g.world.zone.name);
    const w = g.world;
    const b = w.zone.spawns.findIndex((s) => s.runBoss);
    const [boss] = w.spawnGroup(b);
    w.killMonster(boss, w.player);
    expect(g.step(1).some((e) => e.t === 'runComplete')).toBe(true);
    expect(c.progression.mapTierMax).toBe(1);
  });

  it('butin de carte : cartes du palier (parfois +1), orbes, toutes valides', () => {
    const rng = new Rng('drops');
    const tiers: Record<number, number> = {};
    let orbs = 0;
    for (let i = 0; i < 3000; i++) {
      for (const it of mapExtraDrops(rng, 1, i % 10 === 0 ? 'champion' : 'normal')) {
        if (it.map) tiers[it.map.tier] = (tiers[it.map.tier] ?? 0) + 1;
        else orbs++;
      }
    }
    expect(tiers[1]).toBeGreaterThan(0);
    expect(tiers[2]).toBeGreaterThan(0);
    expect(orbs).toBeGreaterThan(0);
    const boss = mapExtraDrops(rng, 2, 'boss');
    expect(boss.some((x) => x.map)).toBe(true);
    const setup = mapWorldSetup(makeMap(rng, 3, 'rare'));
    expect(setup.zoneLevel).toBeGreaterThanOrEqual(89);
  });

  it('Cube : orbes et cartographe transforment les cartes', () => {
    const g = mapper();
    const c = g.character;
    const rng = new Rng('cube-maps');
    c.inventory[0] = makeMap(rng, 1, 'normal');
    c.materials.orb_zakarum = 1;
    expect(g.transmute('map_zakarum', [0]).ok).toBe(true);
    expect(c.inventory[0]!.quality).toBe('rare');
    c.inventory[1] = makeMap(rng, 1);
    c.inventory[2] = makeMap(rng, 1);
    c.inventory[3] = makeMap(rng, 1);
    c.materials.orb_cartographer = 1;
    expect(g.transmute('map_cartographer', [1, 2, 3]).ok).toBe(true);
    expect(c.inventory.filter((x) => x?.map?.tier === 2).length).toBe(1);
    c.materials.worldstone_shard = 1;
    expect(g.transmute('corrupt', [0]).ok).toBe(true);
    expect(c.inventory[0]!.map!.corruptMod).toBeTruthy();
  });
});

import { MAP_UNIQUE_ZONES } from '../../../../src/data/maps';
import { horazonMaps, treasureFallenDrops, uniqueMapRewards } from '../../sim/maps';
import { validateItem } from '../../../../src/sim/loot/validate';
import { interactObject } from '../../../../src/sim/objects';

Game.resumeOnLoad = true; // ces tests vérifient la reprise de run (le jeu, lui, revient toujours en ville)

describe('Cartes uniques et événements', () => {
  it('neuf cartes uniques : aucune immunité, affixes fixes, jamais tirées pour une carte ordinaire', () => {
    expect(MAP_UNIQUE_ZONES.length).toBe(9);
    const rng = new Rng('uniq');
    for (const z of MAP_UNIQUE_ZONES) {
      const m = makeMap(rng, z.tier, 'unique', z.id);
      expect(validateItem(m), z.id).toEqual([]);
      expect(m.map!.mods).toEqual(z.unique!.mods);
      expect(mapWorldSetup(m).mods.some((x) => x.id.endsWith('Immune'))).toBe(false);
    }
    for (let i = 0; i < 400; i++) {
      const m = makeMap(rng, 1 + (i % 3));
      expect(MAP_UNIQUE_ZONES.some((z) => z.id === m.map!.zone)).toBe(false);
      expect(validateItem(m)).toEqual([]);
    }
  });

  it('boss de chaque carte unique : butin spécial valide', () => {
    for (const z of MAP_UNIQUE_ZONES) {
      const items = uniqueMapRewards(new Rng(`rew:${z.id}`), z.id, 88 + z.tier);
      expect(items.length, z.id).toBeGreaterThan(0);
      for (const it of items) expect(validateItem(it), `${z.id} : ${it.base}`).toEqual([]);
      if (z.unique!.reward === 'etherealUniques') expect(items.every((x) => x.ethereal && x.quality === 'unique')).toBe(true);
      if (z.unique!.reward === 'corruptedUniques') expect(items.every((x) => x.corrupted)).toBe(true);
      if (z.unique!.reward === 'puzzle') expect(items.some((x) => x.base === 'puzzlebox')).toBe(true);
    }
  });

  it('run de carte unique : le boss lâche son butin spécial', () => {
    const g = mapper();
    const c = g.character;
    c.inventory[0] = makeMap(new Rng('run-uniq'), 2, 'unique', 'imperial_palace');
    expect(g.startMap({ invIndex: 0 }).ok).toBe(true);
    const w = g.world;
    w.godMode = true;
    const [boss] = w.spawnGroup(w.zone.spawns.findIndex((s) => s.runBoss));
    w.killMonster(boss, w.player);
    g.step(2);
    expect(w.items.some((gi) => gi.item.base === 'puzzlebox')).toBe(true);
  });

  it('événements : horde, autels, rival et embuscade sont posés et atteignables', () => {
    for (const id of ['kyovashad', 'royal_crypts']) {
      const d = MAP_ZONES.find((z) => z.id === id)!;
      const base = buildMapZone(d, 11, { density: 0, rarity: 0 });
      for (const event of ['horde', 'shrines', 'rival', 'ambush'] as const) {
        const z = buildMapZone(d, 11, { density: 0, rarity: 0, event });
        const grid = buildGrid(z);
        const added = [...z.objects.filter((o) => !base.objects.some((b) => b.x === o.x && b.y === o.y)), ...z.spawns.filter((sp) => !base.spawns.some((b) => b.x === sp.x && b.y === sp.y))];
        expect(added.length, `${id}/${event}`).toBeGreaterThan(0);
        // le point de l'événement est joignable à pied depuis le départ
        expect(findPath(grid, z.start.x, z.start.y, added[0].x, added[0].y, 90000), `${id}/${event}`).toBeTruthy();
        if (event === 'shrines') expect(z.objects.filter((o) => o.kind === 'shrine').length).toBe(base.objects.filter((o) => o.kind === 'shrine').length + 3);
        if (event === 'rival') expect(z.spawns.some((sp) => sp.uniqueName === 'Rival maudit')).toBe(true);
      }
    }
  });

  it('événements : Déchu au trésor et coffre d’Horazon placés, atteignables, butin valide', () => {
    const def = MAP_ZONES.find((z) => z.id === 'kyovashad')!;
    const lab = MAP_ZONES.find((z) => z.id === 'royal_crypts')!;
    for (const d of [def, lab]) {
      const t = buildMapZone(d, 7, { density: 0, rarity: 0, event: 'treasure' });
      expect(t.spawns.some((s) => s.monster === 'treasure_fallen')).toBe(true);
      const h = buildMapZone(d, 7, { density: 0, rarity: 0, event: 'horazon' });
      const chest = h.objects.find((o) => o.variant === 'horazon')!;
      expect(chest).toBeTruthy();
      expect(findPath(buildGrid(h), h.start.x, h.start.y, chest.x, chest.y, 90000)).toBeTruthy();
      // sans événement, la zone est identique à avant (graine inchangée)
      expect(JSON.stringify(buildMapZone(d, 7, { density: 0, rarity: 0 }).spawns)).toBe(JSON.stringify(buildMapZone(d, 7, { density: 0, rarity: 0, event: undefined }).spawns));
    }
    const rng = new Rng('ev');
    const maps = horazonMaps(rng, 2);
    expect(maps.length).toBe(6);
    for (const it of [...maps, ...treasureFallenDrops(rng, 3)]) expect(validateItem(it)).toEqual([]);
  });

  it('le coffre d’Horazon s’ouvre en jeu et lâche six cartes', () => {
    const g = mapper();
    const c = g.character;
    c.inventory[0] = makeMap(new Rng('hz'), 1, 'normal');
    expect(g.startMap({ invIndex: 0 }).ok).toBe(true);
    const w = g.world;
    w.objects.push({ id: w.newId(), kind: 'chest', x: w.player.x + 1, y: w.player.y, radius: 0.8, used: false, variant: 'horazon', label: 'Coffre d’Horazon' });
    const before = w.items.length;
    interactObject(w, w.objects[w.objects.length - 1]);
    expect(w.items.filter((gi) => gi.item.map).length - before).toBeGreaterThanOrEqual(6);
  });
});
