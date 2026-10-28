// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Sanctuaires de Diablo II (shrines.txt, patch 1.13) : les 22 effets (le code 0 « None » n'en est pas un), leurs arguments, durées
 * (« Duration in frames » : 25 images = 1 s, comme nos ticks), délai de réarmement (« reset time in minutes », 0 = une seule fois),
 * rareté et niveau de zone minimal (LevelMin).
 *
 * Objets (objects.txt, Parm0) : 1 = sanctuaire de santé, 2 = sanctuaire de mana, 3 = sanctuaire « magique » qui tire un effet au hasard
 * parmi ceux du niveau de la zone (pondération 3 / 2 / 1 pour une rareté 1 / 2 / 3).
 * Écarts PD2 (wiki General Changes) : le sanctuaire d'endurance donne aussi +35 % de vitesse et dure comme les autres (96 s) ;
 * des sanctuaires différents se cumulent ; les effets sont retirés à l'entrée d'une carte.
 * Les effets « OUT » de la table (santé / mana doublées, échanges) sont gardés : santé et mana remplissent leur réserve
 * (comportement observé des sanctuaires de santé et de mana), les échanges suivent la table.
 */
export interface ShrineDef {
  id: string;
  /** code de shrines.txt */
  code: number;
  name: string;
  arg0: number;
  arg1: number;
  /** durée de l'effet en ticks (0 = instantané) */
  duration: number;
  /** réarmement en minutes (0 = jamais) */
  resetMin: number;
  rarity: number;
  levelMin: number;
}

const S = (id: string, code: number, name: string, arg0: number, arg1: number, duration: number, resetMin: number, rarity: number, levelMin: number): ShrineDef => ({
  id,
  code,
  name,
  arg0,
  arg1,
  duration,
  resetMin,
  rarity,
  levelMin,
});

export const SHRINES: ShrineDef[] = [
  S('refill', 1, 'Sanctuaire de recharge', 100, 100, 0, 2, 1, 1),
  S('health', 2, 'Sanctuaire de santé', 200, 400, 0, 5, 2, 1),
  S('mana', 3, 'Sanctuaire de mana', 200, 400, 0, 5, 2, 1),
  S('health_exchange', 4, 'Sanctuaire d’échange de santé', 50, 500, 0, 0, 3, 2),
  S('mana_exchange', 5, 'Sanctuaire d’échange de mana', 50, 500, 0, 0, 3, 2),
  S('armor', 6, 'Sanctuaire d’armure', 100, 1, 2400, 5, 2, 5),
  S('combat', 7, 'Sanctuaire de combat', 200, 200, 2400, 5, 2, 8),
  S('resist_fire', 8, 'Sanctuaire de résistance au feu', 75, 0, 3600, 5, 2, 5),
  S('resist_cold', 9, 'Sanctuaire de résistance au froid', 75, 0, 3600, 5, 2, 26),
  S('resist_light', 10, 'Sanctuaire de résistance à la foudre', 75, 0, 3600, 5, 2, 32),
  S('resist_poison', 11, 'Sanctuaire de résistance au poison', 75, 0, 3600, 5, 2, 21),
  S('skill', 12, 'Sanctuaire de compétence', 2, 0, 2400, 5, 2, 1),
  S('recharge', 13, 'Sanctuaire de recharge de mana', 400, 0, 2400, 5, 2, 1),
  // PD2 : +35 % de vitesse, durée ramenée à celle des autres (D2 : 4 800 images)
  S('stamina', 14, 'Sanctuaire d’endurance', 200, 35, 2400, 5, 3, 1),
  S('experience', 15, 'Sanctuaire d’expérience', 50, 50, 3600, 0, 3, 1),
  S('enirhs', 16, 'Sanctuaire d’Enirhs', 0, 0, 0, 0, 3, 1),
  S('portal', 17, 'Sanctuaire du portail', 0, 0, 0, 0, 2, 3),
  S('gem', 18, 'Sanctuaire des gemmes', 0, 0, 0, 0, 3, 4),
  S('storm', 19, 'Sanctuaire de l’orage', 50, 2000, 0, 0, 2, 1),
  S('warping', 20, 'Sanctuaire de distorsion', 0, 0, 0, 0, 3, 3),
  S('exploding', 21, 'Sanctuaire explosif', 5, 10, 0, 0, 3, 1),
  S('poison', 22, 'Sanctuaire du poison', 5, 10, 0, 0, 3, 1),
];

export const SHRINE_BY_ID: Record<string, ShrineDef> = Object.fromEntries(SHRINES.map((s) => [s.id, s]));

/** Effet d'un sanctuaire « magique » (Parm0 = 3) : tirage pondéré parmi les effets permis au niveau de la zone (santé et mana ont leurs propres objets) */
export function pickShrine(roll: (n: number) => number, zoneLevel: number): ShrineDef {
  const pool = SHRINES.filter((s) => s.id !== 'health' && s.id !== 'mana' && s.levelMin <= Math.max(1, zoneLevel));
  const weight = (s: ShrineDef) => 4 - s.rarity;
  let r = roll(pool.reduce((a, s) => a + weight(s), 0));
  for (const s of pool) {
    r -= weight(s);
    if (r < 0) return s;
  }
  return pool[0];
}

/** Statistiques données par les effets de sanctuaire actifs (buffs `shrine_<id>`), à ajouter à celles de l'équipement */
export function shrineStats(buffIds: Iterable<string>): [string, number][] {
  const out: [string, number][] = [];
  for (const b of buffIds) {
    if (!b.startsWith('shrine_')) continue;
    const s = SHRINE_BY_ID[b.slice(7)];
    if (!s) continue;
    switch (s.id) {
      case 'armor':
        out.push(['shrineDefPct', s.arg0]);
        break;
      case 'combat':
        out.push(['arPct', s.arg0], ['shrineDmgPct', s.arg1]);
        break;
      case 'resist_fire':
        out.push(['resFire', s.arg0]);
        break;
      case 'resist_cold':
        out.push(['resCold', s.arg0]);
        break;
      case 'resist_light':
        out.push(['resLight', s.arg0]);
        break;
      case 'resist_poison':
        // D2 : « poison duration = 0 »
        out.push(['resPoison', s.arg0], ['poisonLength', 100]);
        break;
      case 'skill':
        out.push(['allSkills', s.arg0]);
        break;
      case 'recharge':
        out.push(['manaRegenPct', s.arg0]);
        break;
      case 'stamina':
        out.push(['frw', s.arg1]);
        break;
      case 'experience':
        out.push(['xpPct', s.arg0]);
        break;
    }
  }
  return out;
}
