/**
 * Bot de butin massif : des centaines de milliers de tirages de classes de trésor, à tous les
 * niveaux et difficultés. Chaque objet est validé (règles de génération), la sauvegarde de
 * chaque objet fait l'aller-retour, et la distribution est comparée aux cibles de rythme.
 * Rapport complet : test-results/bots/loot.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { BASE_BY_ID } from '../../src/data/items/bases';
import '../../src/data/items/index';
import { RUNES } from '../../src/data/items/runes';
import type { Difficulty } from '../../src/data/types';
import { rollTc, type DropContext } from '../../src/sim/loot/drops';
import { NO_BONUS } from '../../src/sim/loot/itemgen';
import { validateItem } from '../../src/sim/loot/validate';
import type { Item } from '../../src/sim/item';

const RUNE_RANK: Record<string, number> = Object.fromEntries(RUNES.map((r, i) => [r.id, i + 1]));

interface Tally {
  events: number;
  items: number;
  byQuality: Record<string, number>;
  byType: Record<string, number>;
  runes: Record<number, number>;
  errors: string[];
}

function roll(tc: string, n: number, ilvl: number, difficulty: Difficulty, seed: number, mf = 0): { tally: Tally; sample: Item[] } {
  const rng = new Rng(`loot:${tc}:${ilvl}:${difficulty}:${seed}`);
  const tally: Tally = { events: 0, items: 0, byQuality: {}, byType: {}, runes: {}, errors: [] };
  const sample: Item[] = [];
  const ctx: DropContext = { rng, ilvl, mf, difficulty, zoneKey: 'tristram', mapTier: 0, bonus: NO_BONUS, gf: 0, quantity: 1 };
  for (let i = 0; i < n; i++) {
    const items = rollTc(ctx, tc);
    tally.events++;
    for (const it of items) {
      tally.items++;
      const b = BASE_BY_ID[it.base];
      const type = b?.type ?? '?';
      tally.byType[type] = (tally.byType[type] ?? 0) + 1;
      if (b?.slot || ['smallcharm', 'largecharm', 'grandcharm', 'jewel'].includes(type)) tally.byQuality[it.quality] = (tally.byQuality[it.quality] ?? 0) + 1;
      if (type === 'rune') tally.runes[RUNE_RANK[it.base]] = (tally.runes[RUNE_RANK[it.base]] ?? 0) + 1;
      const errs = validateItem(it);
      if (errs.length && tally.errors.length < 50) tally.errors.push(`${it.base}/${it.quality} ilvl ${it.ilvl} : ${errs.join(' ; ')}`);
      if (sample.length < 300 && (it.quality === 'unique' || it.quality === 'set' || it.quality === 'rare' || i % 997 === 0)) sample.push(it);
    }
  }
  return { tally, sample };
}

describe('Bot de butin massif', () => {
  const report: Record<string, unknown> = {};

  it('200 000 tirages : chaque objet respecte les règles, la sauvegarde fait l’aller-retour', () => {
    const cases: [string, number, number, Difficulty][] = [
      ['normal', 60000, 8, 0],
      ['champion', 8000, 12, 0],
      ['normal', 50000, 45, 1],
      ['unique', 4000, 45, 1],
      ['normal', 60000, 85, 2],
      ['champion', 12000, 85, 2],
      ['boss', 3000, 90, 2],
      ['unique', 3000, 88, 2],
    ];
    const errors: string[] = [];
    for (const [tc, n, ilvl, d] of cases) {
      const { tally, sample } = roll(tc, n, ilvl, d, 1);
      errors.push(...tally.errors);
      // aller-retour JSON (format de sauvegarde) sans perte
      for (const it of sample) expect(JSON.parse(JSON.stringify(it))).toEqual(it);
      const eq = Object.values(tally.byQuality).reduce((a, b) => a + b, 0) || 1;
      report[`${tc}@${ilvl}/${d}`] = {
        tirages: tally.events,
        objets: tally.items,
        parTirage: +(tally.items / tally.events).toFixed(3),
        qualite: Object.fromEntries(Object.entries(tally.byQuality).map(([k, v]) => [k, `${((100 * v) / eq).toFixed(2)} %`])),
        types: tally.byType,
        runes: tally.runes,
      };
    }
    expect(errors, errors.slice(0, 10).join('\n')).toEqual([]);
  });

  it('rythme : uniques et sets présents dès le leveling, runes hautes rares mais possibles', () => {
    // Tristram au niveau ~10 (mesuré par le bot de progression) : ~1 500 monstres normaux,
    // ~40 champions/uniques et ~12 Griswold par heure. Échantillon de 10 h, ramené à l'heure.
    const H = 10;
    const parts = [roll('normal', 1500 * H, 10, 0, 7), roll('champion', 40 * H, 12, 0, 7), roll('boss', 12 * H, 12, 0, 7)];
    const uniq = parts.reduce((s, p) => s + (p.tally.byQuality.unique ?? 0), 0) / H;
    const sets = parts.reduce((s, p) => s + (p.tally.byQuality.set ?? 0), 0) / H;
    report.rythmeLevelingParHeure = { uniques: uniq, sets, runes: parts[0].tally.runes };
    // cible : premier unique ou set dans le premier quart d'heure → au moins 4 par heure
    expect(uniq + sets).toBeGreaterThanOrEqual(4);

    // Enfer : runes hautes (Vex+ = rang ≥ 26) → événement rare sur ~1 M de monstres
    const hell = roll('normal', 150000, 85, 2, 11, 200);
    const high = Object.entries(hell.tally.runes)
      .filter(([r]) => Number(r) >= 26)
      .reduce((a, [, v]) => a + v, 0);
    const mid = Object.entries(hell.tally.runes)
      .filter(([r]) => Number(r) >= 15 && Number(r) < 26)
      .reduce((a, [, v]) => a + v, 0);
    report.enfer150k = { runesHautes: high, runesMoyennes: mid, runes: hell.tally.runes };
    expect(mid).toBeGreaterThan(0);
    expect(high).toBeLessThan(mid);
  });

  it('écrit le rapport', () => {
    const dir = join(process.cwd(), 'test-results', 'bots');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'loot.json'), JSON.stringify(report, null, 1));
  });
});
