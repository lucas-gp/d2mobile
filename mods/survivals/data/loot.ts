// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Treasure classes transcribed from Diablo II 1.13c's TreasureClassEx.txt and SuperUniques.txt (TC columns): see LICENSE-DATA.md.
/**
 * Diablo II's treasure classes the base's table does not have, used by the Survivals mode in place of the base's simplification (lot 283):
 * - the quest drops of the act bosses (`Andarielq`, `Durielq`, `Mephistoq`, `Diabloq`, `Baalq`, by difficulty): the first kill of an act
 *   boss in a difficulty, as Diablo II's quest kill (no gold nor junk, better quality ratios), in place of its regular treasure class;
 * - the treasure classes of the super-uniques (`Act n Super A/B/C`, the `x` ones of Pindleskin and Thresh Socket, `Council`, Griswold's
 *   for the Smith, the Countess', the Cow King's, Baal's subjects' `Act 5 Champ C`): the base drops a super-unique met in its zones with
 *   the treasure class of a unique.
 * Base references: `equip` (an equipment base by item level, Diablo II's `Act n Equip x`), `equip_magic` (`Act n Magic x`), `good`,
 * `junk`, `uitem`, `cpot`, `gold125/150/200` (`gld,mul=1280/1536/2048`), `d2:tsc`, the Hell essences (`tes`, `ceh`, `bet`, `fed`).
 */
import type { TreasureClass as TreasureClassDef } from '../../../src/mods/sdk';

/** Hell essence of each act boss's quest treasure class (tes, ceh, bet, fed) */
const ESSENCE: Record<string, string> = {
  andariel: 'essence_twisted',
  duriel: 'essence_twisted',
  mephisto: 'essence_charged',
  diablo: 'essence_burning',
  baal: 'essence_festering',
};
const GOLD = ['gold125', 'gold150', 'gold200'];

const tc = (id: string, picks: number, noDrop: number, entries: [string, number][], mods?: TreasureClassDef['mods']): TreasureClassDef => ({
  id,
  picks,
  noDrop,
  ...(mods ? { mods } : {}),
  entries: entries.map(([ref, weight]) => ({ ref, weight })),
});

/** Identifier of the quest treasure class of an act boss at a difficulty (undefined: none) */
export function questTcId(monster: string, d: number): string | undefined {
  return ESSENCE[monster] ? `survivals:${monster}q${d}` : undefined;
}

/**
 * Treasure classes added to the `treasureClasses` registry when the mode is active. `has`: the content ruleset's treasure classes (pd2
 * has no `cpot`, Diablo II's potion class: its own `potion` instead, so that a super-unique still drops its two potions)
 */
export function survivalsTcs(has: (id: string) => boolean = () => true): TreasureClassDef[] {
  const out: TreasureClassDef[] = [];
  const cpot = has('cpot') ? 'cpot' : 'potion';
  for (const d of [0, 1, 2]) {
    const hell = (m: string, n: number): [string, number][] => (d === 2 ? [[ESSENCE[m], n]] : []);
    // Andarielq: 7 picks, NoDrop 19, Unique 995, Set 995, Rare 1024, Magic 1024; Equip A 19, Good 3 (Hell: tes 1)
    out.push(tc(`survivals:andarielq${d}`, 7, 19, [['equip', 19], ['good', 3], ...hell('andariel', 1)], { unique: 995, set: 995, rare: 1024, magic: 1024 }));
    // Durielq: 5 picks, NoDrop 0: tsc 1, Durielq - Base 2 (7 picks, NoDrop 19, 993/993/1024/1024; Equip A 19, Good 3; Hell: tes 2)
    out.push(tc(`survivals:durielq_base${d}`, 7, 19, [['equip', 19], ['good', 3], ...hell('duriel', 2)], { unique: 993, set: 993, rare: 1024, magic: 1024 }));
    out.push(
      tc(`survivals:durielq${d}`, 5, 0, [
        ['d2:tsc', 1],
        [`survivals:durielq_base${d}`, 2],
      ]),
    );
    // Mephistoq, Diabloq, Baalq: 7 picks, NoDrop 15, 993/993/1024/1024; Equip 52, Good 3 (Hell: ceh, bet, fed 1)
    for (const m of ['mephisto', 'diablo', 'baal']) out.push(tc(`survivals:${m}q${d}`, 7, 15, [['equip', 52], ['good', 3], ...hell(m, 1)], { unique: 993, set: 993, rare: 1024, magic: 1024 }));
    // Council: 3 picks, NoDrop 19, Unique 650, Set 800, Rare 800, Magic 1024; gold 9, Equip A 15, Junk 5, Good 3, Magic A 4
    out.push(
      tc(
        `survivals:council${d}`,
        3,
        19,
        [
          [GOLD[d], 9],
          ['equip', 15],
          ['junk', 5],
          ['good', 3],
          ['equip_magic', 4],
        ],
        { unique: 650, set: 800, rare: 800, magic: 1024 },
      ),
    );
  }
  // Act n Super A/B/C: a list (picks -4) of 2 Uitem and 2 Cpot, Unique 800, Set 800, Rare 972, Magic 1024; the `x` ones 512 / 654 / 972 / 1024
  out.push(
    tc(
      'survivals:super',
      -4,
      0,
      [
        ['uitem', 2],
        [cpot, 2],
      ],
      { unique: 800, set: 800, rare: 972, magic: 1024 },
    ),
  );
  out.push(
    tc(
      'survivals:superx',
      -4,
      0,
      [
        ['uitem', 2],
        [cpot, 2],
      ],
      { unique: 512, set: 654, rare: 972, magic: 1024 },
    ),
  );
  return out;
}

/** Treasure class kind of a super-unique (key of SUPER_UNIQUE_DEFS), from SuperUniques.txt's TC columns */
const SUPER_TC: Record<string, string> = {
  bishibosh: 'super',
  bonebreak: 'super',
  coldcrow: 'super',
  rakanishu: 'super',
  'treehead woodfist': 'super',
  griswold: 'griswold',
  'the countess': 'countess',
  'pitspawn fouldog': 'super',
  'flamespike the crawler': 'unique',
  boneash: 'super',
  'bloodwitch the wild': 'super',
  fangskin: 'super',
  beetleburst: 'super',
  leatherarm: 'super',
  'coldworm the burrower': 'super',
  'fire eye': 'super',
  'dark elder': 'super',
  'ancient kaa the soulless': 'super',
  // SuperUniques.txt: "Smith", the same table as Griswold's
  'the smith': 'griswold',
  'web mage the burning': 'super',
  'witch doctor endugu': 'super',
  stormtree: 'super',
  'sarina the battlemaid': 'super',
  'icehawk riftwing': 'super',
  'ismail vilehand': 'council',
  'geleb flamefinger': 'council',
  'bremm sparkfist': 'council',
  'toorc icefist': 'council',
  'wyand voidfinger': 'council',
  'maffer dragonhand': 'council',
  'winged death': 'super',
  'the tormentor': 'super',
  taintbreeder: 'super',
  'riftwraith the cannibal': 'super',
  'infector of souls': 'super',
  'lord de seis': 'super',
  'grand vizier of chaos': 'super',
  'the cow king': 'cow_king',
  corpsefire: 'super',
  'siege boss': 'super',
  'axe dweller': 'super',
  'bonesaw breaker': 'super',
  'dac farren': 'super',
  'megaflow rectifier': 'super',
  'eyeback unleashed': 'super',
  'threash socket': 'superx',
  pindleskin: 'superx',
  'snapchip shatter': 'super',
  'anodized elite': 'super',
  'vinvear molech': 'super',
  'sharp tooth sayer': 'super',
  'magma torquer': 'super',
  'blaze ripper': 'super',
  frozenstein: 'super',
  'baal subject 1': 'champion',
  'baal subject 2': 'champion',
  'baal subject 3': 'champion',
  'baal subject 4': 'champion',
  'baal subject 5': 'champion',
};

/**
 * Treasure class of a super-unique at a difficulty (undefined: the base's, a boss species with its own). `has`: the content ruleset's
 * treasure classes; one it does not have (pd2 has neither Griswold's nor the Cow King's) leaves the content ruleset's own drop
 */
export function superUniqueTcId(key: string, d: number, has: (id: string) => boolean = () => true): string | undefined {
  const id = superTc(key, d);
  return id && has(id) ? id : undefined;
}

function superTc(key: string, d: number): string | undefined {
  const k = SUPER_TC[key];
  if (!k) return undefined;
  if (k === 'super' || k === 'superx') return `survivals:${k}`;
  if (k === 'council') return `survivals:council${d}`;
  if (k === 'champion' || k === 'unique') return k;
  return `${k}${d}`;
}
