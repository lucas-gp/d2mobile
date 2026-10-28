/**
 * Équilibrage des builds et de l'économie (lot « builds + économie ») : garde-fous sur les
 * corrections mesurées à l'arène de classes (tools/bots/class-arena.ts) et sur l'inflation du butin.
 */
import { describe, expect, it } from 'vitest';
import { BASE_RATES, LOOT_PRESETS } from '../../src/data/rates';
import { buildPlan, type BuildId } from '../../src/sim/bot/brain';
import { withoutPd2 } from '../needs-pd2';

const order = (build: BuildId, id: string, lvl?: number): number => buildPlan(build).findIndex(([s, l]) => s === id && (lvl === undefined || l === lvl));

describe('plans de compétences des builds', () => {
  it("Vent : la Tornade monte avant l'Armure du cyclone (Tornade et Ouragan fermés aux niveaux bas)", () => {
    expect(order('wind', 'twister', 10)).toBeGreaterThan(-1);
    expect(order('wind', 'twister', 10)).toBeLessThan(order('wind', 'cyclone_armor', 8));
  });
});

describe('inflation du butin des cartes', () => {
  // cartes et orbes : taux du jeu pd2 (la base D2 n'a ni cartes ni orbes)
  it.skipIf(withoutPd2)("cartes et orbes à Abondant : au plus 4× le palier Normal (plafond de l'économie de cartes)", () => {
    const a = LOOT_PRESETS.abundant;
    expect((a.maps ?? BASE_RATES.maps) / BASE_RATES.maps).toBeLessThanOrEqual(4);
    expect((a.orbs ?? BASE_RATES.orbs) / BASE_RATES.orbs).toBeLessThanOrEqual(4);
  });

  it("les paliers de butin n'augmentent jamais les charmes de brisure (Normal = Abondant)", () => {
    for (const p of Object.values(LOOT_PRESETS)) expect((p as Record<string, unknown>).sunder).toBeUndefined();
  });
});
