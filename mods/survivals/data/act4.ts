// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Monster levels transcribed from Diablo II 1.13c's Levels.txt (MonLvl1Ex, MonLvl2Ex, MonLvl3Ex, MonDen, MonUMin/MonUMax): see LICENSE-DATA.md.
/**
 * Act IV's zones in the `levels` registry while the Survivals mode is active (lot 283): the base's registry has Acts I, II, III and V only
 * (adding Act IV there would change the `registries` fingerprint and the vanilla tools), so the mode adds its own entries,
 * `survivals:<zone>`, read by sim/zones.ts like Levels.txt's zones of the other acts. Monster levels and densities from Levels.txt
 * (Levels 104 to 108, expansion levels); their monsters are the base's level plans of the same zones (`LEVEL_PLANS`, the same families).
 */
import { LEVEL_PLANS } from '../../../src/mods/sdk';

interface Act4Level {
  id: string;
  name: string;
  den: number;
  lvl: [number, number, number];
  unique: [[number, number], [number, number], [number, number]];
  mons: [[string, number][], [string, number][], [string, number][]];
}

/** Zone key, Levels.txt name, monster levels (Normal, Nightmare, Hell), unique packs [min, max] by difficulty */
const ACT4: [string, string, [number, number, number], [[number, number], [number, number], [number, number]]][] = [
  [
    'a4_steppes',
    'Outer Steppes',
    [26, 56, 82],
    [
      [0, 1],
      [5, 6],
      [8, 10],
    ],
  ],
  [
    'a4_plains',
    'Plains of Despair',
    [26, 56, 83],
    [
      [0, 1],
      [5, 6],
      [8, 10],
    ],
  ],
  [
    'a4_city',
    'City of the Damned',
    [27, 57, 84],
    [
      [0, 1],
      [5, 6],
      [8, 10],
    ],
  ],
  [
    'a4_river',
    'River of Flame',
    [27, 57, 85],
    [
      [0, 1],
      [4, 5],
      [6, 7],
    ],
  ],
  [
    'chaos',
    'Chaos Sanctum',
    [28, 58, 85],
    [
      [0, 1],
      [4, 5],
      [6, 7],
    ],
  ],
];

/** Prefix of the mode's entries in the `levels` registry */
export const ACT4_PREFIX = 'survivals:';

/** Entries of the `levels` registry for Act IV (the zones whose level plan the base has) */
export function act4Levels(): Act4Level[] {
  return ACT4.filter(([zone]) => LEVEL_PLANS[zone]).map(([zone, name, lvl, unique]) => {
    const plan = LEVEL_PLANS[zone];
    return { id: `${ACT4_PREFIX}${zone}`, name, den: 800, lvl, unique, mons: [plan.mons[0], plan.mons[1], plan.mons[2]] };
  });
}
