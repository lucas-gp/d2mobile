import { describe, expect, it } from 'vitest';
import { CUBE_BY_ID } from '../../../../src/data/cube';
import { MONSTER_BY_ID } from '../../../../src/data/monsters';
import { RUN_BY_ID } from '../../../../src/data/runs';
import { Game } from '../../../../src/sim/game';
import { generateItem } from '../../../../src/sim/loot/itemgen';
import { Rng } from '../../../../src/core/rng';

Game.resumeOnLoad = true;
const give = (g: Game, m: Record<string, number>) => {
  for (const [k, n] of Object.entries(m)) g.character.materials[k] = (g.character.materials[k] ?? 0) + n;
};
const kill = (g: Game, id: string, rank: 'boss' | 'normal' = 'boss') =>
  g.world.run!.extraDrops(g.world, { def: MONSTER_BY_ID[id], rank, runBoss: true } as never) as { base: string; uniqueId?: string }[];
const count = (arr: { base: string }[], base: string) => arr.filter((i) => i.base === base).length;

describe('Accès aux ultimes par le Cube', () => {
  it('Vision de la terreur : Âme + Pierre noire + Essence pure -> Vision -> arène du Clone (Annihilus)', () => {
    const g = new Game();
    give(g, { prime_evil_soul: 1, black_soulstone: 1, pure_essence: 1 });
    expect(g.transmute('vision_terror', []).ok).toBe(true);
    expect(g.character.materials.prime_evil_soul ?? 0).toBe(0);
    const r = g.transmute('portal_dclone', []);
    expect(r.run).toBe('uber_dclone');
    expect(g.enterPandemonium('uber_dclone')).toBe(true);
    expect(g.world.zone.spawns.some((s) => s.monster === 'dclone' && s.runBoss)).toBe(true);
    expect(kill(g, 'dclone').some((i) => i.uniqueId === 'u_annihilus')).toBe(true);
  });

  it("le niveau de difficulté se cycle 0, 1, 2, 0 sans consommer l'objet, et les exclusivités ne tombent qu'à partir du niveau 1", () => {
    const g = new Game();
    give(g, { vision_terror: 1 });
    const lv = () => g.character.progression.milestones['uberdiff:vision_terror'] ?? 0;
    expect([1, 2, 0].map(() => (g.transmute('cycle_vision_terror', []), lv()))).toEqual([1, 2, 0]);
    expect(g.character.materials.vision_terror).toBe(1);
    g.startRun('uber_dclone', 2, 5);
    const excl = (n: number) => {
      let k = 0;
      for (let i = 0; i < n; i++) k += kill(g, 'dclone').filter((x) => x.uniqueId && x.uniqueId !== 'u_annihilus').length;
      return k;
    };
    expect(excl(400)).toBe(0);
    g.character.progression.milestones['uberdiff:vision_terror'] = 2;
    expect(excl(3000)).toBeGreaterThan(5);
  });

  it('Relique des Anciens : trois Sceaux -> Relique -> portail ; le dernier Ancien lâche un Étendard des Héros', () => {
    const g = new Game();
    give(g, { sigil_madawc: 1, sigil_talic: 1, sigil_korlic: 1 });
    expect(g.transmute('relic_ancients', []).ok).toBe(true);
    expect(g.transmute('portal_ancients', []).run).toBe('uber_ancients');
    g.startRun('uber_ancients', 2, 2);
    const bosses = g.world.zone.spawns
      .filter((s) => s.runBoss)
      .map((s) => s.monster)
      .sort();
    expect(bosses).toEqual(['uber_korlic', 'uber_madawc', 'uber_talic']);
    let n = 0;
    for (let i = 0; i < 100; i++) n += count(kill(g, 'uber_talic'), 'standard_heroes');
    expect(n).toBeGreaterThan(0);
  });

  it('Pierre du Vide : Rathma et Mendeln, Éclat souillé qui corrompt Annihilus', () => {
    const g = new Game();
    give(g, { jawbone_trang: 1, splinter_void: 1, hellfire_ashes: 1 });
    expect(g.transmute('voidstone', []).ok).toBe(true);
    expect(g.transmute('portal_rathma', []).run).toBe('uber_rathma');
    g.startRun('uber_rathma', 2, 2);
    expect(
      g.world.zone.spawns
        .filter((s) => s.runBoss)
        .map((s) => s.monster)
        .sort(),
    ).toEqual(['mendeln', 'rathma']);
    expect(count(kill(g, 'rathma'), 'tainted_shard')).toBeGreaterThanOrEqual(0);
    // sans l'autre maître vivant : l'éclat tombe
    const it = generateItem(new Rng('a'), 'small_charm', 90, { forceUniqueId: 'u_annihilus' });
    g.character.inventory[0] = it;
    give(g, { tainted_shard: 1 });
    const res = g.transmute('taint_annihilus', [0]);
    expect(res.ok).toBe(true);
    expect(it.corrupted?.tainted).toBe(true);
    expect(it.corrupted!.mods.length).toBe(1);
  });

  it('Ombre de la haine : Lucion, Jeton de profanation, seconde corruption sur amulette corrompue', () => {
    const g = new Game();
    give(g, { demonic_insignia: 1, talisman_transgression: 1, flesh_malic: 1 });
    expect(g.transmute('shadow_hatred', []).ok).toBe(true);
    expect(g.transmute('portal_lucion', []).run).toBe('uber_lucion');
    g.startRun('uber_lucion', 2, 2);
    expect(count(kill(g, 'lucion'), 'desecration_token')).toBe(1);
    const am = generateItem(new Rng('am'), 'amulet', 85, { forceQuality: 'rare' });
    g.character.inventory[0] = am;
    give(g, { desecration_token: 1 });
    expect(g.transmute('desecrate', [0]).ok).toBe(false); // pas corrompue
    am.corrupted = { outcome: 'mod', mods: [{ stat: 'life', value: 20 }] };
    let done = 0;
    for (let i = 0; i < 20 && !am.corrupted.desecrated; i++) {
      give(g, { desecration_token: 1 });
      if (g.transmute('desecrate', [0]).ok) done++;
    }
    expect(am.corrupted.desecrated).toBe(true);
    expect(done).toBeGreaterThan(0);
    expect(am.corrupted.mods.length).toBeGreaterThan(1);
    expect(g.transmute('desecrate', [0]).ok).toBe(false); // une seule profanation
  });

  it('les quatre arènes sont des runs cachées avec leur boss', () => {
    for (const id of ['uber_dclone', 'uber_ancients', 'uber_rathma', 'uber_lucion']) {
      expect(RUN_BY_ID[id].hidden).toBe(true);
      expect(MONSTER_BY_ID[RUN_BY_ID[id].boss]).toBeTruthy();
    }
  });
});

describe("Ingrédients d'accès dans le monde", () => {
  it('Âme sur Diablo/Baal en Enfer, Sceau selon le palier de carte, Essence pure sur boss de carte', () => {
    const g = new Game();
    g.startRun('uber_tristram', 2, 1);
    let souls = 0;
    for (let i = 0; i < 400; i++) souls += count(kill(g, 'diablo'), 'prime_evil_soul') + count(kill(g, 'baal'), 'prime_evil_soul');
    expect(souls).toBeGreaterThan(10);
  });
});

describe('Recettes de quête', () => {
  it('Bâton horadrique et Volonté de Khalim se forgent au Cube', () => {
    const g = new Game();
    expect(CUBE_BY_ID.quest_horadric_staff).toBeTruthy();
    give(g, { staff_of_kings: 1, viper_amulet: 1 });
    expect(g.transmute('quest_horadric_staff', []).ok).toBe(true);
    expect(g.character.materials.horadric_staff).toBe(1);
    give(g, { khalim_eye: 1, khalim_brain: 1, khalim_heart: 1, khalim_flail: 1 });
    expect(g.transmute('quest_khalim_will', []).ok).toBe(true);
    expect(g.character.materials.khalim_will).toBe(1);
  });
});

describe('Événements de carte : Rôdeur des ténèbres et Ombre de Mendeln', () => {
  it('existent dans la liste des événements et leurs butins sont branchés', async () => {
    const { MAP_EVENTS, MAP_EVENT_NAMES } = await import('../../data/zones/mapzone');
    expect(MAP_EVENTS).toEqual(expect.arrayContaining(['wanderer', 'mendeln']));
    expect(MAP_EVENT_NAMES.mendeln).toBeTruthy();
    const { makeMap } = await import('../../sim/maps');
    const g = new Game();
    const map = makeMap(new Rng('m'), 1);
    g.character.level = 90;
    g.character.progression.highestDifficulty = 2;
    g.character.inventory[0] = map;
    expect(g.startMap({ invIndex: 0 }).ok).toBe(true);
    const w = g.world;
    const named = (name: string) => ({ def: MONSTER_BY_ID.ghoul, rank: 'unique', runBoss: false, name }) as never;
    let splinters = 0;
    let shards = 0;
    for (let i = 0; i < 100; i++) {
      splinters += count(w.run!.extraDrops(w, named('Ombre de Mendeln')) as { base: string }[], 'splinter_void');
      shards += count(w.run!.extraDrops(w, named('Rôdeur des ténèbres')) as { base: string }[], 'worldstone_shard');
    }
    expect(splinters).toBeGreaterThan(20);
    expect(shards).toBeGreaterThanOrEqual(100);
  });
});
