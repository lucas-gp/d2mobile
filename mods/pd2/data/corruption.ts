// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Tables de corruption PD2 (mods/pd2/docs/ETUDE-PD2.md §5.3), traduites dans les statistiques du jeu. Chaque colonne (faible / moyenne /
 * forte) est une liste de lignes équiprobables ; une ligne peut porter plusieurs propriétés. Les lignes sans équivalent ici (malédictions,
 * blocage plus rapide, dégâts contre démons) sont omises. Ordre et identifiants (type d'objet) : ceux de la table d'origine.
 */
import type { CorruptionTable, StatRoll } from '../../../src/mods/api';

const r = (stat: string, min: number, max = min): StatRoll => ({ stat, min, max });
type Line = StatRoll[];

const RES4 = (min: number, max: number): Line[] => [[r('resFire', min, max)], [r('resCold', min, max)], [r('resLight', min, max)], [r('resPoison', min, max)]];
const MAXRES4 = (mx: [number, number], res: [number, number]): Line[] =>
  (['Fire', 'Cold', 'Light'] as const).map((e) => [r(`maxRes${e}`, mx[0], mx[1]), r(`res${e}`, res[0], res[1])]).concat([[r('maxResPoison', mx[0], mx[1]), r('resPoison', res[0], res[1])]]);
const ATTR4 = (min: number, max: number): Line[] => [[r('str', min, max)], [r('dex', min, max)], [r('vit', min, max)], [r('ene', min, max)]];

export const PD2_CORRUPTION: CorruptionTable[] = [
  {
    id: 'weapon',
    odds: [0.5, 0.3, 0.2],
    weak: [[r('edPct', 40, 80)], [r('attackRating', 150, 250)], [r('fcr', 10)], [r('lifePerKill', 3, 6)], [r('manaPerKill', 3, 5)], [r('mf', 20, 30)], [r('reqPct', 25, 50)]],
    medium: [
      [r('fcr', 20)],
      [r('ias', 30, 40)],
      [r('edPct', 40, 60), r('lifeLeech', 5)],
      [r('crushingBlow', 20, 30)],
      [r('deadlyStrike', 20, 30)],
      [r('pierceFire', 7, 10)],
      [r('pierceCold', 7, 10)],
      [r('pierceLight', 7, 10)],
    ],
    strong: [
      [r('allSkills', 1)],
      [r('ias', 30), r('crushingBlow', 20, 30)],
      [r('edPct', 80, 120), r('ias', 20)],
      [r('edPct', 80, 120), r('attackRating', 250)],
      [r('edPct', 50, 70), r('deadlyStrike', 25)],
      [r('fcr', 10), r('fireDmgPct', 5)],
      [r('fcr', 10), r('coldDmgPct', 5)],
      [r('fcr', 10), r('lightDmgPct', 5)],
    ],
  },
  {
    id: 'shield',
    odds: [0.48, 0.32, 0.2],
    weak: [[r('fhr', 20, 30)], [r('mf', 20, 30)], [r('life', 30, 40)], ...RES4(35, 40)],
    medium: [[r('indestructible', 1), r('defPct', 50, 80)], [r('fcr', 10)], [r('block', 10, 20)], [r('lifePct', 4, 6)], [r('drFlat', 6, 10)], [r('mdr', 6, 10)], [r('cbf', 1)]],
    strong: [[r('allSkills', 1)], [r('resAll', 20, 25)], [r('dr', 6, 8)], ...MAXRES4([4, 5], [15, 20])],
  },
  {
    id: 'armor',
    odds: [0.48, 0.32, 0.2],
    weak: [[r('fhr', 20, 30)], [r('defPct', 50, 80)], [r('mf', 20, 30)], [r('mana', 30, 40)], ...RES4(30, 35)],
    medium: [[r('indestructible', 1), r('defPct', 50, 80)], [r('fcr', 10)], [r('frw', 20)], [r('lifePct', 4, 6)], [r('drFlat', 6, 10)], [r('mdr', 6, 10)], [r('cbf', 1)]],
    strong: [[r('allSkills', 1)], [r('resAll', 20, 25)], [r('dr', 6, 8)], ...MAXRES4([4, 5], [15, 15])],
  },
  {
    id: 'helm',
    odds: [0.48, 0.32, 0.2],
    weak: [[r('fhr', 20, 30)], [r('defPct', 50, 80)], [r('mf', 20, 30)], [r('lifeRegen', 20, 30)], ...RES4(30, 35)],
    medium: [
      [r('indestructible', 1), r('defPct', 50, 80)],
      [r('attackRating', 150, 250), r('lightRadius', 2, 4)],
      [r('lifeLeech', 3, 5)],
      [r('manaLeech', 3, 5)],
      [r('lifePct', 4, 6)],
      [r('lifePerKill', 3, 4)],
      [r('manaPerKill', 3, 4)],
      [r('cbf', 1)],
    ],
    strong: [[r('allSkills', 1)], [r('resAll', 15, 20)], [r('dr', 4, 6)], ...MAXRES4([4, 5], [15, 15])],
  },
  {
    id: 'boots',
    odds: [0.48, 0.32, 0.2],
    weak: [[r('defPct', 50, 80)], [r('manaRegenPct', 10, 15)], [r('gf', 50, 100)], [r('mf', 10, 25)], ...RES4(15, 20)],
    medium: [[r('indestructible', 1), r('defPct', 50, 80)], [r('fhr', 10)], [r('life', 20, 40)], [r('resAll', 5, 8)], [r('lifePerKill', 2, 3)], [r('manaPerKill', 2, 3)], [r('lifeRegen', 15, 25)]],
    strong: [[r('frw', 15)], [r('dr', 3, 4)], [r('block', 10)], ...MAXRES4([2, 3], [10, 10])],
  },
  {
    id: 'gloves',
    odds: [0.48, 0.32, 0.2],
    weak: [[r('defPct', 50, 80)], [r('manaRegenPct', 20, 30)], [r('gf', 50, 100)], [r('mf', 10, 25)], ...RES4(10, 15)],
    medium: [[r('pierceAll', 10, 15)], [r('attackRating', 100, 150)], [r('lifeLeech', 2, 3)], [r('manaLeech', 2, 3)], [r('allAttr', 3, 6)], [r('life', 20, 40)], [r('lifeRegen', 15, 20)]],
    strong: [[r('fcr', 10)], [r('ias', 10)], [r('block', 10)], [r('edPct', 30, 40)], [r('deadlyStrike', 10)], [r('manaPerKill', 3, 4)], [r('resAll', 5, 8)]],
  },
  {
    id: 'belt',
    odds: [0.48, 0.32, 0.2],
    weak: [...ATTR4(7, 10), ...RES4(10, 15)],
    medium: [[r('pierceAll', 10, 15)], [r('fhr', 10)], [r('allAttr', 3, 6)], [r('lifeRegen', 15, 20)], [r('attackRating', 100, 150)], [r('gf', 60, 100)], [r('mf', 20, 30)]],
    strong: [[r('fcr', 10)], [r('ias', 10)], [r('frw', 10)], [r('block', 10)], [r('maxResAll', 2)], [r('resAll', 5, 8)], [r('dr', 3, 4)]],
  },
  {
    id: 'ring',
    odds: [0.48, 0.32, 0.2],
    weak: [...ATTR4(7, 10), ...RES4(10, 15)],
    medium: [[r('attackRating', 100, 150)], [r('lifePerKill', 2, 3)], [r('manaPerKill', 2, 3)], [r('drFlat', 4, 6)], [r('mdr', 4, 6)], [r('life', 30, 40)], [r('gf', 40, 80)], [r('mf', 15, 20)]],
    strong: [[r('fcr', 10)], [r('frw', 10)], [r('manaLeech', 3, 4)], [r('lifeLeech', 3, 4)], [r('allAttr', 4, 6)], [r('resAll', 4, 6)], [r('dr', 3)]],
  },
  {
    id: 'amulet',
    odds: [0.48, 0.32, 0.2],
    weak: [...ATTR4(6, 12), ...RES4(15, 20)],
    medium: [[r('pierceAll', 10, 20)], [r('fhr', 10)], [r('block', 10)], [r('lifePerKill', 2, 3)], [r('manaPerKill', 2, 3)], [r('allAttr', 6, 8)], [r('gf', 60, 100)], [r('mf', 20, 30)]],
    strong: [[r('allSkills', 1)], [r('fcr', 10)], [r('frw', 10)], [r('edPct', 30, 40)], [r('cbf', 1)], [r('maxResAll', 2)], [r('resAll', 7, 10)]],
  },
];
