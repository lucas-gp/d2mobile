/**
 * Niveaux des monstres des zones que les tables levels-a*.ts ne couvrent pas (runs du point de passage, zones de farm, étapes de campagne
 * construites à part), lus dans Levels.txt de Diablo II LoD 1.13c (MonLvl1Ex…MonLvl3Ex : Normal, Cauchemar, Enfer). Écrits dans les blocs
 * générés de src/data/runs.ts et src/data/zones/act1.ts par gen.ts (table `levels`). Les villes (niveau 1) et les zones propres à
 * Project Diablo 2 (ubers du mod) n'ont pas de ligne : elles restent écrites dans le code. Rien n'est écrit ici : voir gen.ts.
 */
import { rows, num } from '../audit/common';

type Tri = [number, number, number];

/** Runs et étapes de campagne de runs.ts → ligne de Levels.txt (Id) */
export const RUN_LEVEL_IDS: Record<string, number> = {
  tristram: 38,
  tombs: 66,
  river: 107,
  a4_steppes: 104,
  a4_plains: 105,
  a4_city: 106,
  a4_river: 107,
  a4_chaos: 108,
  countess: 25,
  andariel: 37,
  mephisto: 102,
  cows: 39,
  chaos: 108,
  pindleskin: 121,
  eldritch: 111,
  nihlathak: 124,
  ancients: 120,
  baal: 131,
  // Pandémonium (1.11) : Antre de la Matriarche, Sables oubliés, Fournaise de la douleur, Tristram pandémoniaque
  uber_lilith: 133,
  uber_duriel: 134,
  uber_izual: 135,
  uber_tristram: 136,
  // étapes de campagne construites à part (Acte II : Harem niveau 2, Tombeaux de Tal Rasha ; Acte III : Durance 3 ; Acte V : sommet, temple…)
  a2_harem1: 51,
  a2_tomb1: 66,
  a2_tomb2: 67,
  a2_tomb3: 68,
  a2_tomb4: 69,
  a2_tomb5: 70,
  a2_tomb6: 71,
  a2_tomb7: 72,
  a3_durance3: 102,
  a5_summit: 120,
  a5_temple: 121,
  a5_vaught: 124,
  a5_throne: 131,
};

/** Étapes de l'Acte I construites à part (zones/act1.ts) → ligne de Levels.txt : Tristram, Cellier de la tour 5, Catacombes 4 */
export const A1_LEVEL_IDS: Record<string, number> = { a1_tristram: 38, a1_countess: 25, a1_andariel: 37 };

/** Niveaux [Normal, Cauchemar, Enfer] de chaque clé */
export function vanillaZoneLevels(ids: Record<string, number>): Record<string, Tri> {
  const L = new Map(rows('levels').map((r) => [Number(r.Id), r]));
  const out: Record<string, Tri> = {};
  for (const [k, id] of Object.entries(ids)) {
    const r = L.get(id);
    if (!r) throw new Error(`Levels.txt : ligne ${id} (${k}) introuvable`);
    const l: Tri = [num(r.MonLvl1Ex), num(r.MonLvl2Ex), num(r.MonLvl3Ex)];
    if (l.some((x) => x <= 0)) throw new Error(`Levels.txt : ${r.LevelName} (${k}) sans niveau de monstre`);
    out[k] = l;
  }
  return out;
}
