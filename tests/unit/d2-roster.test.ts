import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { RUNS } from '../../src/data/runs';
import { MAP_ZONES } from '../../src/data/maps';
import { MONSTER_BY_ID } from '../../src/data/monsters';
import { RULES } from '../../src/mods/rules';
import { World } from '../../src/sim/world';
import { zoneFxIds, zoneMonsterIds } from '../../src/render/roster';
import { FX_BY_CLASS, FX_COMMON, MISSILE_FX } from '../../src/render/fx';

/** Tout monstre qu'une zone peut produire (groupes posés, sœurs, super-uniques) est dans la distribution complète de sa préparation */
describe('distribution complète des zones (mode local sans repli)', () => {
  it('chaque run de la table : les 200 tirages de groupes restent dans la distribution', () => {
    const g = new Game(undefined, 'sorceress');
    let checked = 0;
    for (const run of RUNS) {
      if (run.hidden && !run.campaign && !run.build) continue;
      for (const seed of [1, 7, 12345]) {
        for (const d of [0, 2] as const) {
          let ok = false;
          try {
            ok = g.startRun(run.id, d, seed);
          } catch {
            continue;
          }
          if (!ok) continue;
          const w = g.world;
          const roster = new Set(zoneMonsterIds(w.zone, { mapZone: w.run?.mapZone || undefined }));
          // tout déclencher : chaque groupe en attente apparaît
          for (const p of [...w.pendingSpawns]) w.spawnGroup(p.idx);
          for (const m of w.monsters) {
            expect(roster.has(m.def.id), `${run.id}/${d}/${seed} : ${m.def.id} absent de la distribution`).toBe(true);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  }, 120000);

  it("cartes d'endgame : espèces, renforts du boss (espèces de la carte, jamais un boss) et boss", () => {
    for (const def of MAP_ZONES) {
      const zone = RULES['maps.buildZone'](def, 99, { density: 0, rarity: 0 });
      const roster = new Set(zoneMonsterIds(zone, { mapZone: def.id }));
      for (const id of def.monsters) expect(roster.has(id), `${def.id} : ${id}`).toBe(true);
      expect(roster.has(def.boss.monster)).toBe(true);
      // renfort de secours d'un boss de campagne (mods/pd2/sim/map-boss.ts : summonPool)
      expect(roster.has('skeleton')).toBe(true);
      for (const s of zone.spawns) expect(roster.has(s.monster), `${def.id} : groupe ${s.monster}`).toBe(true);
    }
  });

  it('une espèce sœur (alts) et une invocation sont dans la distribution', () => {
    const withAlts = Object.values(MONSTER_BY_ID).find((m) => m.alts?.length);
    expect(withAlts).toBeTruthy();
    const zone = { spawns: [{ monster: withAlts!.id, x: 0, y: 0, r: 1, count: 1 }] } as never;
    const r = new Set(zoneMonsterIds(zone));
    for (const [a] of withAlts!.alts!) if (MONSTER_BY_ID[a]) expect(r.has(a)).toBe(true);
    const summoner = Object.values(MONSTER_BY_ID).find((m) => m.attacks.some((a) => a.kind === 'summon' && a.summon && MONSTER_BY_ID[a.summon]));
    expect(summoner).toBeTruthy();
    const z2 = { spawns: [{ monster: summoner!.id, x: 0, y: 0, r: 1, count: 1 }] } as never;
    const r2 = new Set(zoneMonsterIds(z2));
    for (const a of summoner!.attacks) if (a.kind === 'summon' && a.summon && MONSTER_BY_ID[a.summon]) expect(r2.has(a.summon)).toBe(true);
  });

  it('effets : communs, de la classe, des projectiles des monstres', () => {
    const missile = Object.values(MONSTER_BY_ID).find((m) => m.attacks.some((a) => a.missile && MISSILE_FX[a.missile]));
    expect(missile).toBeTruthy();
    const fx = new Set(zoneFxIds('paladin', [missile!.id]));
    for (const id of FX_COMMON) expect(fx.has(`fx_${id}`)).toBe(true);
    for (const id of FX_BY_CLASS.paladin) expect(fx.has(`fx_${id}`)).toBe(true);
    for (const a of missile!.attacks) if (a.missile && MISSILE_FX[a.missile]) expect(fx.has(`fx_${MISSILE_FX[a.missile]}`)).toBe(true);
    // une autre classe n'apporte pas les effets de la première
    expect(fx.has('fx_firebolt')).toBe(true); // via l'élément du monstre éventuel ou le projectile : jamais exclu
    const none = new Set(zoneFxIds('barbarian', []));
    expect(none.has('fx_frostnova')).toBe(false);
  });

  it('un World sans carte : la distribution inclut les monstres déjà posés', () => {
    const g = new Game(undefined, 'sorceress');
    g.startRun('tristram', 0, 3);
    const w: World = g.world;
    const roster = new Set(zoneMonsterIds(w.zone));
    for (const s of w.zone.spawns) expect(roster.has(s.monster)).toBe(true);
  });
});
