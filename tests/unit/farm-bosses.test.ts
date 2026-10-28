import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { MONSTER_BY_ID } from '../../src/data/monsters';
import { RUN_BY_ID } from '../../src/data/runs';
import { rollTc } from '../../src/sim/loot/drops';
import { NO_BONUS } from '../../src/sim/loot/itemgen';
import { withoutPd2 } from '../needs-pd2';

const ctx = (rng: Rng, d: 0 | 1 | 2, zoneKey: string) => ({ rng, ilvl: [7, 42, 79][d], mf: 0, difficulty: d, zoneKey, mapTier: 0, bonus: NO_BONUS, gf: 0, quantity: 1 });

describe('Boss de farm PD2 : Comtesse, Andariel, Méphisto', () => {
  it('chaque run existe, à ses niveaux MonStats, et sa zone contient un boss qui termine la run', () => {
    for (const [id, boss, levels] of [
      ['countess', 'countess', [7, 42, 79]],
      ['andariel', 'andariel', [12, 49, 85]],
      ['mephisto', 'mephisto', [26, 59, 87]],
    ] as const) {
      const run = RUN_BY_ID[id];
      expect(run, id).toBeTruthy();
      expect(MONSTER_BY_ID[boss].bossLevel).toEqual(levels);
      for (const d of [0, 1, 2] as const) {
        const z = run.build(1, d);
        expect(
          z.spawns.some((s) => s.monster === boss && s.rank === 'boss' && s.runBoss),
          `${id} ${d}`,
        ).toBe(true);
      }
    }
  });

  it.skipIf(withoutPd2)("la Comtesse lâche des runes à chaque mort (Runes 4 / 8 / 12) et plus haut en Enfer qu'en Normal", () => {
    const rank = (d: 0 | 1 | 2) => {
      const rng = new Rng(`countess-${d}`);
      let total = 0;
      let sum = 0;
      for (let k = 0; k < 300; k++) {
        const runes = rollTc(ctx(rng, d, 'countess'), `countess${d}`).filter((it) => it.base.startsWith('r') && /^r\d+$/.test(it.base));
        total += runes.length;
        for (const r of runes) sum += Number(r.base.slice(1));
      }
      return { perKill: total / 300, avg: sum / Math.max(1, total) };
    };
    const n = rank(0);
    const h = rank(2);
    expect(n.perKill).toBeGreaterThan(1);
    expect(h.perKill).toBeGreaterThan(1);
    expect(h.avg).toBeGreaterThan(n.avg + 2);
  });

  it('Andariel craint le feu (résistance négative) et est presque immunisée au poison en Normal', () => {
    const a = MONSTER_BY_ID.andariel;
    expect(a.res.fire![2]).toBeLessThan(0);
    expect(a.res.poison![0]).toBeGreaterThanOrEqual(80);
  });
});

describe("Boss de farm de l'Acte V : Pindleskin, Eldritch et Shenk, Nihlathak, les Anciens", () => {
  it('chaque run existe, ses zones contiennent leurs boss de run et le bot de progression les ignore', () => {
    for (const [id, bosses] of [
      ['pindleskin', ['pindleskin']],
      ['eldritch', ['shenk']],
      ['nihlathak', ['nihlathak']],
      ['ancients', ['ancient_talic', 'ancient_madawc', 'ancient_korlic']],
    ] as const) {
      const run = RUN_BY_ID[id];
      expect(run, id).toBeTruthy();
      expect(run.botSkip).toBe(true);
      for (const d of [0, 1, 2] as const) {
        const z = run.build(1, d);
        for (const b of bosses)
          expect(
            z.spawns.some((s) => s.monster === b && s.rank === 'boss' && s.runBoss),
            `${id} ${b} ${d}`,
          ).toBe(true);
      }
    }
  });

  it.skipIf(withoutPd2)('chaque boss lâche du butin à chaque difficulté (TC propre)', () => {
    for (const id of ['pindleskin', 'eldritch', 'shenk', 'nihlathak', 'ancient_talic']) {
      const tc = MONSTER_BY_ID[id].tc!;
      for (const d of [0, 1, 2] as const) {
        const rng = new Rng(`${id}-${d}`);
        let n = 0;
        for (let k = 0; k < 40; k++) n += rollTc(ctx(rng, d, tc), `${tc}${d}`).length;
        expect(n, `${id} ${d}`).toBeGreaterThan(40);
      }
    }
  });

  it("la run des Anciens ne se termine qu'à la mort du dernier", async () => {
    const { Game } = await import('../../src/sim/game');
    const g = new Game();
    g.startRun('ancients', 0, 3);
    const w = g.world;
    w.triggerWave?.(0);
    for (const s of [...w.pendingSpawns]) if (w.zone.spawns[s.idx].runBoss) w.pendingSpawns.splice(w.pendingSpawns.indexOf(s), 1);
    const mk = (id: string) => ({ ...w.monsters[0], id: w.newId(), def: MONSTER_BY_ID[id], runBoss: true, dead: false }) as never;
    const a = mk('ancient_talic');
    const b = mk('ancient_madawc');
    w.monsters.push(a, b);
    (a as { dead: boolean }).dead = true;
    w.run!.onKill(w, a);
    expect(w.run!.completed).toBe(false);
    (b as { dead: boolean }).dead = true;
    w.run!.onKill(w, b);
    expect(w.run!.completed).toBe(true);
  });
});

describe('Pandémonium', () => {
  it('les trois clés ouvrent un portail du Pandémonium, les organes la finale (PD2 : par le Talisman)', async () => {
    const { Game } = await import('../../src/sim/game');
    const { makeStack } = await import('../../src/sim/loot/itemgen');
    const { addToCharacter } = await import('../../src/sim/inventory');
    const g = new Game();
    const c = g.character;
    for (const id of ['key_terror', 'key_hate', 'key_destruction']) addToCharacter(c, makeStack(new Rng(id), id, 1));
    const r = g.transmute('pandemonium_keys', []);
    expect(r.ok).toBe(true);
    expect(['uber_lilith', 'uber_duriel', 'uber_izual']).toContain(r.run);
    expect(c.materials.key_terror).toBeUndefined();
    expect(g.enterPandemonium(r.run!)).toBe(true);
    expect(g.world.zone.spawns.some((s) => s.runBoss)).toBe(true);
    g.enterTown();
    // l'ancienne finale par les quatre essences n'existe plus : elles font le Jeton d'absolution
    for (const id of ['organ_horn', 'organ_eye', 'organ_brain']) addToCharacter(c, makeStack(new Rng(id), id, 1));
    if (withoutPd2) {
      // D2 (CubeMain.txt) : les trois organes ouvrent directement la finale
      expect(g.transmute('pandemonium_finale', []).run).toBe('uber_tristram');
      expect(c.materials.organ_horn ?? 0).toBe(0);
    } else {
      // PD2 : les organes forment le Talisman, qui ouvre la finale
      expect(g.transmute('pandemonium_finale', []).ok).toBe(false);
      expect(g.transmute('pandemonium_talisman', []).ok).toBe(true);
      expect(c.materials.organ_horn ?? 0).toBe(0);
      expect(g.transmute('pandemonium_finale', []).run).toBe('uber_tristram');
      expect(c.materials.pandemonium_talisman ?? 0).toBe(0);
    }
    g.startRun('uber_tristram', 2, 3);
    const bosses = g.world.zone.spawns
      .filter((s) => s.runBoss)
      .map((s) => s.monster)
      .sort();
    expect(bosses).toEqual(['uber_baal', 'uber_diablo', 'uber_mephisto']);
  });

  // D2 (code du jeu, src/sim/loot/uber-drops.ts) comme PD2 (mod) : la Torche tombe du dernier des trois
  it("la Torche du feu de l'enfer ne se forge pas : elle tombe du dernier mal primordial de Tristram", async () => {
    const { CUBE_BY_ID } = await import('../../src/data/cube');
    expect(CUBE_BY_ID.hellfire_torch).toBeUndefined();
    const { Game } = await import('../../src/sim/game');
    Game.resumeOnLoad = true;
    const g = new Game();
    g.startRun('uber_tristram', 2, 3);
    const w = g.world;
    w.pendingSpawns.length = 0;
    const mk = (id: string, dead: boolean) => ({ ...w.monsters[0], id: w.newId(), def: MONSTER_BY_ID[id], rank: 'boss', runBoss: true, dead, name: id }) as never;
    w.monsters.length = 0;
    const meph = mk('uber_mephisto', true);
    const diablo = mk('uber_diablo', false);
    w.monsters.push(meph, diablo);
    const torch = (m: never) => (w.run!.extraDrops(w, m) as { uniqueId?: string }[]).filter((x) => x.uniqueId === 'u_hellfire_torch').length;
    expect(torch(meph)).toBe(0); // Diablo vit encore
    (diablo as { dead: boolean }).dead = true;
    expect(torch(diablo)).toBe(1);
    // Annihilus ne tombe pas de Diablo ultime (Clone de Diablo seulement)
    for (let k = 0; k < 40; k++) expect((w.run!.extraDrops(w, diablo) as { uniqueId?: string }[]).some((x) => x.uniqueId === 'u_annihilus')).toBe(false);
  });

  it('les ubers ne figurent pas au menu du point de passage et ont leur TC', async () => {
    const { Game } = await import('../../src/sim/game');
    const g = new Game();
    expect(g.runOptions().some((o) => o.run.id.startsWith('uber_'))).toBe(false);
    expect(RUN_BY_ID.uber_lilith.hidden).toBe(true);
    for (const id of ['lilith', 'uber_duriel', 'uber_izual', 'uber_mephisto', 'uber_diablo', 'uber_baal']) expect(MONSTER_BY_ID[id].tc).toBeTruthy();
  });
});

describe('Zones corrompues', () => {
  it.skipIf(withoutPd2)("une run d'Enfer corrompue passe au niveau 85 avec ses modificateurs, survit à la sauvegarde et lâche des éclats", async () => {
    const { Game, CORRUPT_LEVEL } = await import('../../src/sim/game');
    Game.resumeOnLoad = true;
    const g = new Game();
    expect(g.startRun('tombs', 0, 3, true)).toBe(true);
    expect(g.corrupt).toBe(false); // Enfer seulement
    g.startRun('tombs', 2, 3, true);
    expect(g.corrupt).toBe(true);
    expect(g.world.zoneLevel).toBe(CORRUPT_LEVEL);
    expect(g.world.mapMods.some((m) => m.id === 'corrupted')).toBe(true);
    const save = JSON.parse(JSON.stringify(g.toSave()));
    expect(save.run.corrupt).toBe(true);
    const g2 = new Game(save);
    expect(g2.corrupt).toBe(true);
    expect(g2.world.mapMods.length).toBeGreaterThan(0);
    let shards = 0;
    const w = g2.world;
    const boss = { def: MONSTER_BY_ID.duriel, rank: 'boss', runBoss: true } as never;
    for (let k = 0; k < 60; k++) shards += (w.run!.extraDrops(w, boss) as { base: string }[]).filter((i) => i.base === 'worldstone_shard').length;
    expect(shards).toBeGreaterThan(20);
    expect(g.startRun('uber_tristram', 2, 3, true) && g.corrupt).toBe(false);
  });
});

describe('Clone de Diablo', () => {
  it.skipIf(withoutPd2)("n'apparaît plus au hasard (PD2 : accès par la Vision de la terreur) et lâche Annihilus", async () => {
    const { Game } = await import('../../src/sim/game');
    Game.resumeOnLoad = true;
    const g = new Game();
    for (let seed = 1; seed <= 200; seed++) {
      g.startRun('tombs', 2, seed);
      expect(g.world.zone.spawns.some((s) => s.monster === 'dclone')).toBe(false);
    }
    g.startRun('uber_dclone', 2, 3);
    const drops = g.world.run!.extraDrops(g.world, { def: MONSTER_BY_ID.dclone, rank: 'boss', runBoss: false } as never) as { uniqueId?: string }[];
    expect(drops[0].uniqueId).toBe('u_annihilus');
  });
});
