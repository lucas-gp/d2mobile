/** Cartes PD2 : zones ajoutées, affixes à effet réel, événements Autel / Héros, Éclat du Catalyseur et Étendard des Héros. */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../../../src/core/rng';
import { MAP_AFFIXES, MAP_AFFIX_BY_ID, MAP_ZONE_BY_ID } from '../../../../src/data/maps';
import { MONSTER_BY_ID } from '../../../../src/data/monsters';
import { buildMapZone } from '../../data/zones/mapzone';
import { findPath } from '../../../../src/sim/bot/pathfind';
import { Game, MAP_MIN_LEVEL } from '../../../../src/sim/game';
import { applyMapRecipe, heroInvaderDrops, makeMap, mapBonuses, mapExtraGearDrops, mapWorldSetup, type MapInfo } from '../../sim/maps';
import { mapFx, mapHitPacket, mapTick } from '../../sim/mapmods';
import { emptyPacket } from '../../../../src/sim/actors';
import { addXp, xpToReach } from '../../../../src/sim/progression';
import { buildGrid } from '../../../../src/sim/world';
import { spawnMonster } from '../../../../src/sim/spawn';
import type { World } from '../../../../src/sim/world';

let uid = 0;
function mon(w: World, id = 'zombie', rank: 'normal' | 'unique' = 'normal') {
  return spawnMonster(w, id, w.player.x + 5, w.player.y, { rank }, `t${uid++}`)!;
}
import type { CubeEffect } from '../../../../src/data/cube';

function mapper(): Game {
  const g = new Game();
  addXp(g.character, xpToReach(MAP_MIN_LEVEL + 5));
  g.character.progression.highestDifficulty = 2;
  return g;
}
function open(mods: { id: string; value: number }[], quality: 'magic' | 'rare' = 'rare', zone = 'kyovashad') {
  const g = mapper();
  const it = makeMap(new Rng('t'), 3, quality, zone);
  (it.map as MapInfo).mods = mods;
  g.character.inventory[0] = it;
  expect(g.startMap({ invIndex: 0 }, 5).ok).toBe(true);
  return g.world;
}

describe('Cartes PD2 : zones et affixes', () => {
  it('13 zones ajoutées (12 ordinaires + Vide extérieur unique), toutes parcourables', () => {
    const ids = [
      'ancestral_trial',
      'sanatorium',
      'ruined_cistern',
      'pandemonium_citadel',
      'horazon_memory',
      'halls_torture',
      'kehjistan_marketplace',
      'arreat_battlefield',
      'bastion_keep',
      'demon_road',
      'skovos_stronghold',
      'steppes_daken',
      'outer_void',
    ];
    for (const id of ids) {
      const d = MAP_ZONE_BY_ID[id];
      expect(d, id).toBeTruthy();
      for (const m of [...d.monsters, d.boss.monster]) expect(MONSTER_BY_ID[m], `${id}/${m}`).toBeTruthy();
      const z = buildMapZone(d, 3, { density: 20, rarity: 0 });
      const g = buildGrid(z);
      // cartes ×2 (jusqu’à ~90 000 sous-cases praticables) : budget du bot (150 000 nœuds, valeur par défaut de findPath)
      for (const s of z.spawns) expect(findPath(g, z.start.x, z.start.y, s.x, s.y, 150000), `${id}`).toBeTruthy();
    }
    expect(MAP_ZONE_BY_ID.outer_void.unique).toBeTruthy();
    // ~26 s seul ; plus de 60 s quand toute la suite charge la machine (PC, runners de la CI)
  }, 180_000);

  it('46 affixes ; chaque affixe a un effet reconnu (monstre, joueur, famille ou butin)', () => {
    expect(MAP_AFFIXES.length).toBe(46);
    const known = new Set([
      'monsterLife',
      'monsterDamage',
      'monsterFireDmg',
      'monsterColdDmg',
      'monsterLightDmg',
      'monsterPoisonDmg',
      'monsterSpeed',
      'monsterFireRes',
      'monsterColdRes',
      'monsterLightRes',
      'monsterMagicRes',
      'monsterPhysRes',
      'monsterRarity',
      'monsterLeech',
      'monsterAtkSpeed',
      'monsterAr',
      'monsterDef',
      'monsterFhr',
      'monsterCrush',
      'monsterWound',
      'monsterRegen',
      'extraFire',
      'extraCold',
      'extraLight',
      'extraPoison',
      'extraMagic',
      'extraBoss',
      'zoneLevel',
      'itemQuantity',
      'extraWeapon',
      'extraArmor',
      'playerResAll',
      'playerDefense',
      'playerBlock',
      'playerFhr',
      'playerDrain',
    ]);
    for (const a of MAP_AFFIXES) expect(known.has(a.mod) || a.mod.startsWith('family:'), a.id).toBe(true);
    for (const a of MAP_AFFIXES) if (a.mod.startsWith('family:')) expect(MONSTER_BY_ID[a.mod.slice(7)], a.id).toBeTruthy();
  });

  it('familles de monstres ajoutées : elles apparaissent dans la zone', () => {
    const it = makeMap(new Rng('f'), 3, 'rare', 'kyovashad');
    (it.map as MapInfo).mods = [
      { id: 'lustful', value: 1 },
      { id: 'souless', value: 1 },
    ];
    const s = mapWorldSetup(it);
    expect(s.zoneOpts.extraFamily).toBe('succubus_witch,burning_dead');
    const z = buildMapZone(MAP_ZONE_BY_ID.kyovashad, 2, { ...s.zoneOpts });
    expect(z.spawns.some((sp) => sp.monster === 'succubus_witch' || sp.monster === 'burning_dead')).toBe(true);
  });

  it('monstres : Sangsue, Rapide, Précision, Robustesse, Tangerine modifient les statistiques', () => {
    const base = open([]);
    const w = open([
      { id: 'leech', value: 20 },
      { id: 'fast', value: 60 },
      { id: 'silver', value: 50 },
      { id: 'sturdiness', value: 100 },
      { id: 'tangerine', value: 20 },
    ]);
    const a = mon(base);
    const b = mon(w);
    expect(b.atkSpdPct).toBe(60);
    expect(b.leechPct).toBeCloseTo(8);
    expect(b.ar).toBeCloseTo(a.ar * 1.5, -1);
    expect(b.defense).toBeGreaterThan(a.defense * 1.9);
    expect(b.res.magic).toBeGreaterThan(a.res.magic);
    expect(b.hpMax).toBeGreaterThan(a.hpMax * 1.15);
  });

  it('coups : dégâts de feu convertis, blessures et bonus élémentaires', () => {
    const w = open([
      { id: 'smoking', value: 100 },
      { id: 'hibernal', value: 50 },
      { id: 'bloody', value: 100 },
    ]);
    const pk = emptyPacket(false);
    pk.phys = 100;
    pk.cold = 10;
    const out = mapHitPacket(w, pk, mon(w));
    expect(out.fire).toBeCloseTo(100);
    expect(out.cold).toBeCloseTo(15);
    expect(out.phys).toBeCloseTo(130);
    expect(pk.phys).toBe(100); // paquet d'origine intact
    const none = open([]);
    expect(mapHitPacket(none, pk, mon(none))).toBe(pk);
  });

  it('joueur : Maladresse, Déséquilibre, Malsaine', () => {
    const base = open([]);
    const w = open([
      { id: 'fumbling', value: 30 },
      { id: 'imbalance', value: 20 },
      { id: 'unhealthy', value: 80 },
    ]);
    w.refreshPlayer();
    base.refreshPlayer();
    expect(w.player.d.block).toBeLessThanOrEqual(base.player.d.block);
    expect(w.player.d.fhr).toBe(Math.max(0, base.player.d.fhr - 20));
    const hp = w.player.hp;
    for (let i = 0; i < 100; i++) mapTick(w, 0.04);
    expect(w.player.hp).toBeLessThan(hp);
    expect(mapFx(w).drain).toBe(80);
  });

  it('régénération des monstres et résilience', () => {
    const w = open([
      { id: 'regeneration', value: 2048 },
      { id: 'resilience', value: 100 },
    ]);
    const m = mon(w);
    m.hp = m.hpMax * 0.5;
    for (let i = 0; i < 50; i++) mapTick(w, 0.04);
    expect(m.hp).toBeGreaterThan(m.hpMax * 0.5);
    expect(mapFx(w).fhr).toBe(100);
  });

  it('Forgeron / Armurier : armes et armures en plus', () => {
    const rng = new Rng('gear');
    let weapons = 0;
    let armors = 0;
    for (let i = 0; i < 300; i++) {
      const out = mapExtraGearDrops(
        rng,
        [
          { id: 'extraWeapon', value: 50 },
          { id: 'extraArmor', value: 50 },
        ],
        88,
      );
      for (const it of out) expect(it.quality).toBe('magic');
      weapons += mapExtraGearDrops(rng, [{ id: 'extraWeapon', value: 100 }], 88).length;
      armors += out.length;
    }
    expect(weapons).toBeGreaterThan(100);
    expect(armors).toBeGreaterThan(100);
    expect(mapExtraGearDrops(rng, [], 88)).toEqual([]);
  });
});

describe('Événements Autel du Catalyseur et Invasion de héros', () => {
  it('événements placés et atteignables (champ et labyrinthe)', () => {
    for (const id of ['kyovashad', 'royal_crypts']) {
      const d = MAP_ZONE_BY_ID[id];
      const altar = buildMapZone(d, 11, { density: 0, rarity: 0, event: 'altar' });
      expect(altar.spawns.some((s) => s.uniqueName === 'Gardien du Catalyseur')).toBe(true);
      const heroes = buildMapZone(d, 11, { density: 0, rarity: 0, event: 'heroes' });
      expect(heroes.spawns.filter((s) => s.uniqueName === 'Héros corrompu').length).toBe(3);
      for (const z of [altar, heroes]) {
        const sp = z.spawns.find((s) => s.uniqueName === 'Gardien du Catalyseur' || s.uniqueName === 'Héros corrompu')!;
        expect(findPath(buildGrid(z), z.start.x, z.start.y, sp.x, sp.y, 90000)).toBeTruthy();
      }
    }
  });

  it('butin : Éclats du Catalyseur (1-3) et deux objets rares par héros', () => {
    const rng = new Rng('h');
    const hero = heroInvaderDrops(rng, 89);
    expect(hero.length).toBe(2);
    for (const it of hero) expect(it.quality).toBe('rare');
  });

  it('Éclat du Catalyseur : infuse une carte magique ou rare, qui reçoit alors un événement', () => {
    const rng = new Rng('c');
    const fx = { kind: 'mapOrb', orb: 'catalyst' } as CubeEffect;
    const normal = makeMap(rng, 2, 'normal');
    expect(applyMapRecipe(rng, fx, [normal], 90).ok).toBe(false);
    const rare = makeMap(rng, 2, 'rare');
    expect(applyMapRecipe(rng, fx, [rare], 90).ok).toBe(true);
    expect((rare.map as MapInfo).catalyst).toBe(true);
    expect(applyMapRecipe(rng, fx, [rare], 90).ok).toBe(false);
    const g = mapper();
    g.character.inventory[0] = rare;
    g.startMap({ invIndex: 0 }, 9);
    expect(JSON.stringify(g.world.events)).toContain('mapEvent');
  });

  it('Étendard des Héros : bonus héroïques sur magique, rare ou unique, une seule fois', () => {
    const rng = new Rng('s');
    const fx = { kind: 'mapOrb', orb: 'heroes' } as CubeEffect;
    expect(applyMapRecipe(rng, fx, [makeMap(rng, 2, 'normal')], 90).ok).toBe(false);
    const magic = makeMap(rng, 2, 'magic');
    magic.map!.mods = [];
    const before = mapBonuses(magic);
    expect(applyMapRecipe(rng, fx, [magic], 90).ok).toBe(true);
    const after = mapBonuses(magic);
    expect(after.xp - before.xp).toBe(10);
    expect(after.density - before.density).toBe(20);
    expect(after.mf - before.mf).toBe(20);
    expect(applyMapRecipe(rng, fx, [magic], 90).ok).toBe(false);
    const uniq = makeMap(rng, 2, 'unique');
    expect(applyMapRecipe(rng, fx, [uniq], 90).ok).toBe(true);
    expect(MAP_AFFIX_BY_ID.fumbling).toBeTruthy();
  });
});
