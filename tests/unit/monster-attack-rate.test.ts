/** Cadence d'attaque des monstres : aucune attaque plus rapide que D2 (animation animdata.d2 + aidel), les coups de mêlée sans limiteur collent à D2 (±15 %). */
import { describe, expect, it } from 'vitest';
import { measureAll, measureAttack } from '../../tools/bench/monster-rates-lib';
import { MONSTER_BY_ID, MONSTERS } from '../../src/data/monsters';
import { MONSTER_ANIM } from '../../src/data/monster-anim.gen';
import { applyAnimTiming, TIMING_EXCLUDED } from '../../src/data/monster-timing';

const rows = measureAll();
const pct = (g: number | null) => (g === null ? 0 : g);

describe('cadence d’attaque des monstres', () => {
  it('toutes les espèces des cinq actes sont couvertes (hors exclusions demandées)', () => {
    const ids = new Set(rows.map((r) => r.id));
    for (const m of MONSTERS) if (!TIMING_EXCLUDED.has(m.id) && m.attacks.length && MONSTER_ANIM[m.id]) expect(ids.has(m.id), m.id).toBe(true);
    expect(ids.size).toBeGreaterThan(100);
  });

  it('aucune attaque ne revient plus vite que l’animation D2 + délai d’IA (−15 % de tolérance)', () => {
    const fast = rows.filter((r) => r.expInterval !== null && pct(r.gap) < -0.15).map((r) => `${r.id}#${r.idx} ${r.interval}/${r.expInterval}`);
    expect(fast).toEqual([]);
  });

  it('les coups de mêlée et charges sans limiteur de cooldown sont à ±15 % de l’intervalle D2', () => {
    const off = rows
      .filter((r) => (r.kind === 'melee' || r.kind === 'charge') && r.cooldown <= 30 && r.gap !== null && Math.abs(r.gap) > 0.15)
      .map((r) => `${r.id}#${r.idx} ${r.interval}/${r.expInterval}`);
    expect(off).toEqual([]);
  });

  it('la durée d’animation jouée = celle de animdata (Seigneur venimeux : coup de 24 ticks, plus 14 comme avant)', () => {
    const v = MONSTER_BY_ID.venom_lord.attacks[0];
    expect(v.frames).toBe(MONSTER_ANIM.venom_lord.a1![0]);
    expect(v.frames).toBeGreaterThanOrEqual(22);
    const r = measureAttack(MONSTER_BY_ID.venom_lord, 0);
    expect(r.interval!).toBeGreaterThanOrEqual(36);
  });

  it('les espèces exclues (Anciens, Rathma, Lucion, Clone) ne sont jamais recalées', () => {
    for (const id of TIMING_EXCLUDED) {
      const d = { ...MONSTER_BY_ID.fallen, id, attacks: [{ ...MONSTER_BY_ID.fallen.attacks[0], frames: 99 }] };
      applyAnimTiming(d);
      expect(d.attacks[0].frames, id).toBe(99);
    }
  });
});
