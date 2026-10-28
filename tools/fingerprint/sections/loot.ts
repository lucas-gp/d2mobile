/**
 * Butin : génération d'objets (chaque base × 7 niveaux × 7 qualités forcées × 2 options, puis chaque unique et chaque objet de set ; 63 700
 * objets au lot 188) et tirages des classes de trésor (chaque TC de monstre × 3 difficultés × 4 niveaux × 2 zones, 40 tirages chacun).
 */
import '../../../src/sim/game';
import { Rng } from '../../../src/core/rng';
import '../../../src/data/items/index';
import { BASE_BY_ID } from '../../../src/data/items/bases';
import { UNIQUES } from '../../../src/data/items/uniques';
import { SET_ITEMS } from '../../../src/data/items/sets';
import { MONSTER_TC, ZONE_RUNE_TC } from '../../../src/data/treasure';
import { generateItem, NO_BONUS } from '../../../src/sim/loot/itemgen';
import { rollTc } from '../../../src/sim/loot/drops';
import { Game } from '../../../src/sim/game';
import { createHash } from 'node:crypto';
import { sha1, type SectionResult } from '../lib';

export async function run(): Promise<SectionResult> {
  const out: SectionResult = {};
  const h = createHash('sha1');
  Game.resetIds();
  const rng = new Rng('itemfp');
  for (const id of Object.keys(BASE_BY_ID)) {
    for (const ilvl of [1, 12, 30, 55, 75, 90, 99])
      for (const q of [undefined, 'normal', 'superior', 'magic', 'rare', 'set', 'unique'] as const)
        for (const k of [0, 1]) h.update(JSON.stringify(generateItem(rng, id, ilvl, { forceQuality: q, mf: k * 300, rollEthereal: k === 1 })));
    out[`gen/${id}`] = h.copy().digest('hex').slice(0, 16);
  }
  for (const u of UNIQUES) out[`unique/${u.id}`] = sha1(JSON.stringify(generateItem(rng, u.base, 99, { forceUniqueId: u.id })));
  for (const s of SET_ITEMS) out[`set/${s.id}`] = sha1(JSON.stringify(generateItem(rng, s.base, 99, { forceSetId: s.id })));
  const zones = Object.keys(ZONE_RUNE_TC).slice(0, 2);
  for (const tc of Object.keys(MONSTER_TC))
    for (const difficulty of [0, 1, 2] as const)
      for (const ilvl of [5, 30, 70, 90])
        for (const zoneKey of zones) {
          const r = new Rng(`tc/${tc}/${difficulty}/${ilvl}/${zoneKey}`);
          const drops: string[] = [];
          try {
            for (let n = 0; n < 40; n++) drops.push(JSON.stringify(rollTc({ rng: r, ilvl, mf: n * 25, difficulty, zoneKey, mapTier: 0, bonus: NO_BONUS, gf: 0, quantity: 1 }, tc)));
            out[`tc/${tc}/${difficulty}/${ilvl}/${zoneKey}`] = sha1(drops.join('\n'));
          } catch (e) {
            out[`tc/${tc}/${difficulty}/${ilvl}/${zoneKey}`] = 'ERR ' + (e as Error).message;
          }
        }
  return out;
}
