/**
 * Probabilités de tirage d'une rune par TC (Monte-Carlo sur pickRune, réglages de rates.ts) :
 * part des runes moyennes (Hel-Gul) et hautes (Vex+). Multiplié par le volume de runes par
 * heure mesuré par le bot d'endgame, donne l'intervalle attendu entre deux runes hautes.
 *   npx tsx tools/bots/rune-odds.ts [tc=17] [runesParHeure=35]
 */
import '../mods/auto';
import { Rng } from '../../src/core/rng';
import { RUNE_BY_ID } from '../../src/data/items/runes';
import { pickRune } from '../../src/sim/loot/drops';

const tc = Number(process.argv[2] ?? 17);
const perHour = Number(process.argv[3] ?? 35);
const rng = new Rng('runes');
const N = 2_000_000;
let mid = 0;
let high = 0;
for (let i = 0; i < N; i++) {
  const r = RUNE_BY_ID[pickRune(rng, tc)].rank;
  if (r >= 26) high++;
  else if (r >= 15) mid++;
}
console.log(
  `TC ${tc} : moyennes ${((mid / N) * 100).toFixed(2)} %, hautes ${((high / N) * 100).toFixed(3)} % → à ${perHour} runes/h : ${((mid / N) * perHour).toFixed(1)} moyennes/h, une haute toutes les ${(1 / ((high / N) * perHour)).toFixed(1)} h`,
);
