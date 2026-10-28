// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Les 33 runes (El → Zod) avec leurs effets par emplacement, et les gemmes, de Diablo II LoD 1.13c : lignes RUNES et table GEM_MODS
 * générées depuis les MPQ du joueur (Gems.txt, Misc.txt) par tools/vanilla/gen.ts (`npm run vanilla -- --write`), ne pas les modifier à
 * la main. Les effets sans équivalent dans le jeu (endurance, aveuglement, dégâts de blessures ouvertes) ne sont pas simulés : la rune n'a
 * alors pas d'effet à cet emplacement. Valeurs Project Diablo 2 : patch du mod (mods/pd2/data/items/runes.patch.ts).
 */
import type { GemDef, ItemBase, RuneDef, StatRoll } from '../types';

const f = (stat: string, v: number, param?: string): StatRoll => ({ stat, min: v, max: v, param });

export const RUNES: RuneDef[] = [
  { id: 'r01', name: 'El', rank: 1, reqLvl: 11, weapon: [f('lightRadius', 1), f('attackRating', 50)], armor: [f('lightRadius', 1), f('defFlat', 15)], shield: [f('lightRadius', 1), f('defFlat', 15)] },
  { id: 'r02', name: 'Eld', rank: 2, reqLvl: 11, weapon: [f('arUndead', 50), f('dmgUndeadPct', 75)], armor: [], shield: [f('block', 7)] },
  { id: 'r03', name: 'Tir', rank: 3, reqLvl: 13, weapon: [f('manaPerKill', 2)], armor: [f('manaPerKill', 2)], shield: [f('manaPerKill', 2)] },
  { id: 'r04', name: 'Nef', rank: 4, reqLvl: 13, weapon: [f('knockback', 1)], armor: [f('defMissile', 30)], shield: [f('defMissile', 30)] },
  { id: 'r05', name: 'Eth', rank: 5, reqLvl: 15, weapon: [f('reduceDef', 25)], armor: [f('manaRegenPct', 15)], shield: [f('manaRegenPct', 15)] },
  { id: 'r06', name: 'Ith', rank: 6, reqLvl: 15, weapon: [f('maxDmg', 9)], armor: [f('dmgToMana', 15)], shield: [f('dmgToMana', 15)] },
  { id: 'r07', name: 'Tal', rank: 7, reqLvl: 17, weapon: [f('poisonDmg', 75)], armor: [f('resPoison', 30)], shield: [f('resPoison', 35)] },
  { id: 'r08', name: 'Ral', rank: 8, reqLvl: 19, weapon: [f('addFireMin', 5), f('addFireMax', 30)], armor: [f('resFire', 30)], shield: [f('resFire', 35)] },
  { id: 'r09', name: 'Ort', rank: 9, reqLvl: 21, weapon: [f('addLightMin', 1), f('addLightMax', 50)], armor: [f('resLight', 30)], shield: [f('resLight', 35)] },
  { id: 'r10', name: 'Thul', rank: 10, reqLvl: 23, weapon: [f('addColdMin', 3), f('addColdMax', 14)], armor: [f('resCold', 30)], shield: [f('resCold', 35)] },
  { id: 'r11', name: 'Amn', rank: 11, reqLvl: 25, weapon: [f('lifeLeech', 7)], armor: [f('thornsFlat', 14)], shield: [f('thornsFlat', 14)] },
  { id: 'r12', name: 'Sol', rank: 12, reqLvl: 27, weapon: [f('minDmg', 9)], armor: [f('drFlat', 7)], shield: [f('drFlat', 7)] },
  { id: 'r13', name: 'Shael', rank: 13, reqLvl: 29, weapon: [f('ias', 20)], armor: [f('fhr', 20)], shield: [f('fbr', 20)] },
  { id: 'r14', name: 'Dol', rank: 14, reqLvl: 31, weapon: [f('fleeChance', 25)], armor: [f('lifeRegen', 7)], shield: [f('lifeRegen', 7)] },
  { id: 'r15', name: 'Hel', rank: 15, qlvl: 33, reqLvl: 0, weapon: [f('reqPct', 20)], armor: [f('reqPct', 15)], shield: [f('reqPct', 15)] },
  { id: 'r16', name: 'Io', rank: 16, reqLvl: 35, weapon: [f('vit', 10)], armor: [f('vit', 10)], shield: [f('vit', 10)] },
  { id: 'r17', name: 'Lum', rank: 17, reqLvl: 37, weapon: [f('ene', 10)], armor: [f('ene', 10)], shield: [f('ene', 10)] },
  { id: 'r18', name: 'Ko', rank: 18, reqLvl: 39, weapon: [f('dex', 10)], armor: [f('dex', 10)], shield: [f('dex', 10)] },
  { id: 'r19', name: 'Fal', rank: 19, reqLvl: 41, weapon: [f('str', 10)], armor: [f('str', 10)], shield: [f('str', 10)] },
  { id: 'r20', name: 'Lem', rank: 20, reqLvl: 43, weapon: [f('gf', 75)], armor: [f('gf', 50)], shield: [f('gf', 50)] },
  { id: 'r21', name: 'Pul', rank: 21, reqLvl: 45, weapon: [f('arDemon', 100), f('dmgDemonPct', 75)], armor: [f('defPct', 30)], shield: [f('defPct', 30)] },
  { id: 'r22', name: 'Um', rank: 22, reqLvl: 47, weapon: [f('openWounds', 25)], armor: [f('resAll', 15)], shield: [f('resAll', 22)] },
  { id: 'r23', name: 'Mal', rank: 23, reqLvl: 49, weapon: [f('preventMonsterHeal', 1)], armor: [f('mdr', 7)], shield: [f('mdr', 7)] },
  { id: 'r24', name: 'Ist', rank: 24, reqLvl: 51, weapon: [f('mf', 30)], armor: [f('mf', 25)], shield: [f('mf', 25)] },
  { id: 'r25', name: 'Gul', rank: 25, reqLvl: 53, weapon: [f('arPct', 20)], armor: [f('maxResPoison', 5)], shield: [f('maxResPoison', 5)] },
  { id: 'r26', name: 'Vex', rank: 26, reqLvl: 55, weapon: [f('manaLeech', 7)], armor: [f('maxResFire', 5)], shield: [f('maxResFire', 5)] },
  { id: 'r27', name: 'Ohm', rank: 27, reqLvl: 57, weapon: [f('edPct', 50)], armor: [f('maxResCold', 5)], shield: [f('maxResCold', 5)] },
  { id: 'r28', name: 'Lo', rank: 28, reqLvl: 59, weapon: [f('deadlyStrike', 20)], armor: [f('maxResLight', 5)], shield: [f('maxResLight', 5)] },
  { id: 'r29', name: 'Sur', rank: 29, reqLvl: 61, weapon: [], armor: [f('manaPct', 5)], shield: [f('mana', 50)] },
  { id: 'r30', name: 'Ber', rank: 30, reqLvl: 63, weapon: [f('crushingBlow', 20)], armor: [f('dr', 8)], shield: [f('dr', 8)] },
  { id: 'r31', name: 'Jah', rank: 31, reqLvl: 65, weapon: [f('ignoreDef', 1)], armor: [f('lifePct', 5)], shield: [f('life', 50)] },
  { id: 'r32', name: 'Cham', rank: 32, reqLvl: 67, weapon: [f('freezeTarget', 3)], armor: [f('cbf', 1)], shield: [f('cbf', 1)] },
  { id: 'r33', name: 'Zod', rank: 33, reqLvl: 69, weapon: [f('indestructible', 1)], armor: [f('indestructible', 1)], shield: [f('indestructible', 1)] },
];

export const RUNE_BY_ID: Record<string, RuneDef> = Object.fromEntries(RUNES.map((r) => [r.id, r]));
export const RUNE_BY_NAME: Record<string, RuneDef> = Object.fromEntries(RUNES.map((r) => [r.name.toLowerCase(), r]));

/* ------------------------------ Gemmes ------------------------------ */

/** Effets des gemmes par emplacement (Gems.txt : arme ; casque et armure ; bouclier), par identifiant : ne pas modifier à la main (tools/vanilla/gen.ts) */
const GEM_MODS: Record<string, { weapon: StatRoll[]; armor: StatRoll[]; shield: StatRoll[] }> = {
  gem_ruby_0: { weapon: [f('addFireMin', 3), f('addFireMax', 4)], armor: [f('life', 10)], shield: [f('resFire', 12)] },
  gem_ruby_1: { weapon: [f('addFireMin', 5), f('addFireMax', 8)], armor: [f('life', 17)], shield: [f('resFire', 16)] },
  gem_ruby_2: { weapon: [f('addFireMin', 8), f('addFireMax', 12)], armor: [f('life', 24)], shield: [f('resFire', 22)] },
  gem_ruby_3: { weapon: [f('addFireMin', 10), f('addFireMax', 16)], armor: [f('life', 31)], shield: [f('resFire', 28)] },
  gem_ruby_4: { weapon: [f('addFireMin', 15), f('addFireMax', 20)], armor: [f('life', 38)], shield: [f('resFire', 40)] },
  gem_sapphire_0: { weapon: [f('addColdMin', 1), f('addColdMax', 3)], armor: [f('mana', 10)], shield: [f('resCold', 12)] },
  gem_sapphire_1: { weapon: [f('addColdMin', 3), f('addColdMax', 5)], armor: [f('mana', 17)], shield: [f('resCold', 16)] },
  gem_sapphire_2: { weapon: [f('addColdMin', 4), f('addColdMax', 7)], armor: [f('mana', 24)], shield: [f('resCold', 22)] },
  gem_sapphire_3: { weapon: [f('addColdMin', 6), f('addColdMax', 10)], armor: [f('mana', 31)], shield: [f('resCold', 28)] },
  gem_sapphire_4: { weapon: [f('addColdMin', 10), f('addColdMax', 14)], armor: [f('mana', 38)], shield: [f('resCold', 40)] },
  gem_topaz_0: { weapon: [f('addLightMin', 1), f('addLightMax', 8)], armor: [f('mf', 9)], shield: [f('resLight', 12)] },
  gem_topaz_1: { weapon: [f('addLightMin', 1), f('addLightMax', 14)], armor: [f('mf', 13)], shield: [f('resLight', 16)] },
  gem_topaz_2: { weapon: [f('addLightMin', 1), f('addLightMax', 22)], armor: [f('mf', 16)], shield: [f('resLight', 22)] },
  gem_topaz_3: { weapon: [f('addLightMin', 1), f('addLightMax', 30)], armor: [f('mf', 20)], shield: [f('resLight', 28)] },
  gem_topaz_4: { weapon: [f('addLightMin', 1), f('addLightMax', 40)], armor: [f('mf', 24)], shield: [f('resLight', 40)] },
  gem_emerald_0: { weapon: [f('poisonDmg', 10)], armor: [f('dex', 3)], shield: [f('resPoison', 12)] },
  gem_emerald_1: { weapon: [f('poisonDmg', 20)], armor: [f('dex', 4)], shield: [f('resPoison', 16)] },
  gem_emerald_2: { weapon: [f('poisonDmg', 40)], armor: [f('dex', 6)], shield: [f('resPoison', 22)] },
  gem_emerald_3: { weapon: [f('poisonDmg', 60)], armor: [f('dex', 8)], shield: [f('resPoison', 28)] },
  gem_emerald_4: { weapon: [f('poisonDmg', 100)], armor: [f('dex', 10)], shield: [f('resPoison', 40)] },
  gem_diamond_0: { weapon: [f('dmgUndeadPct', 28)], armor: [f('attackRating', 20)], shield: [f('resAll', 6)] },
  gem_diamond_1: { weapon: [f('dmgUndeadPct', 34)], armor: [f('attackRating', 40)], shield: [f('resAll', 8)] },
  gem_diamond_2: { weapon: [f('dmgUndeadPct', 44)], armor: [f('attackRating', 60)], shield: [f('resAll', 11)] },
  gem_diamond_3: { weapon: [f('dmgUndeadPct', 54)], armor: [f('attackRating', 80)], shield: [f('resAll', 14)] },
  gem_diamond_4: { weapon: [f('dmgUndeadPct', 68)], armor: [f('attackRating', 100)], shield: [f('resAll', 19)] },
  gem_amethyst_0: { weapon: [f('attackRating', 40)], armor: [f('str', 3)], shield: [f('defFlat', 8)] },
  gem_amethyst_1: { weapon: [f('attackRating', 60)], armor: [f('str', 4)], shield: [f('defFlat', 12)] },
  gem_amethyst_2: { weapon: [f('attackRating', 80)], armor: [f('str', 6)], shield: [f('defFlat', 18)] },
  gem_amethyst_3: { weapon: [f('attackRating', 100)], armor: [f('str', 8)], shield: [f('defFlat', 24)] },
  gem_amethyst_4: { weapon: [f('attackRating', 150)], armor: [f('str', 10)], shield: [f('defFlat', 30)] },
  gem_skull_0: { weapon: [f('manaLeech', 1), f('lifeLeech', 2)], armor: [f('lifeRegen', 2), f('manaRegenPct', 8)], shield: [f('thornsFlat', 4)] },
  gem_skull_1: { weapon: [f('manaLeech', 2), f('lifeLeech', 2)], armor: [f('lifeRegen', 3), f('manaRegenPct', 8)], shield: [f('thornsFlat', 8)] },
  gem_skull_2: { weapon: [f('manaLeech', 2), f('lifeLeech', 3)], armor: [f('lifeRegen', 3), f('manaRegenPct', 12)], shield: [f('thornsFlat', 12)] },
  gem_skull_3: { weapon: [f('manaLeech', 3), f('lifeLeech', 3)], armor: [f('lifeRegen', 4), f('manaRegenPct', 12)], shield: [f('thornsFlat', 16)] },
  gem_skull_4: { weapon: [f('manaLeech', 3), f('lifeLeech', 4)], armor: [f('lifeRegen', 5), f('manaRegenPct', 19)], shield: [f('thornsFlat', 20)] },
};

const KINDS: { kind: string; name: string; fem: boolean }[] = [
  { kind: 'ruby', name: 'Rubis', fem: false },
  { kind: 'sapphire', name: 'Saphir', fem: false },
  { kind: 'topaz', name: 'Topaze', fem: true },
  { kind: 'emerald', name: 'Émeraude', fem: true },
  { kind: 'diamond', name: 'Diamant', fem: false },
  { kind: 'amethyst', name: 'Améthyste', fem: true },
  { kind: 'skull', name: 'Crâne', fem: false },
];

function gemName(k: (typeof KINDS)[number], g: number): string {
  const m = ['ébréché', 'fêlé', '', 'sans défaut', 'parfait'];
  const fe = ['ébréchée', 'fêlée', '', 'sans défaut', 'parfaite'];
  const adj = (k.fem ? fe : m)[g];
  return adj ? `${k.name} ${adj}` : k.name;
}

export const GEMS: GemDef[] = KINDS.flatMap((k) =>
  [0, 1, 2, 3, 4].map((g) => {
    const id = `gem_${k.kind}_${g}`;
    const m = GEM_MODS[id];
    return { id, name: gemName(k, g), kind: k.kind, grade: g, weapon: m.weapon, armor: m.armor, shield: m.shield };
  }),
);

export const GEM_BY_ID: Record<string, GemDef> = Object.fromEntries(GEMS.map((g) => [g.id, g]));

/** Base d'objet d'une rune (empilable) */
export const runeBase = (r: RuneDef): ItemBase => ({
  id: r.id,
  name: `Rune ${r.name}`,
  type: 'rune',
  tier: 0,
  qlvl: r.qlvl ?? r.reqLvl,
  reqLvl: r.reqLvl,
  reqStr: 0,
  reqDex: 0,
  maxSockets: 0,
  icon: 'rune',
  rarity: 1,
  stack: 99,
  price: Math.round(50 * Math.pow(1.35, r.rank)),
  noRandomDrop: true,
});
/** Base d'objet d'une gemme (empilable) */
export const gemBase = (g: GemDef): ItemBase => ({
  id: g.id,
  name: g.name,
  type: 'gem',
  tier: 0,
  qlvl: [1, 6, 12, 20, 30][g.grade],
  reqLvl: [1, 5, 12, 15, 18][g.grade],
  reqStr: 0,
  reqDex: 0,
  maxSockets: 0,
  icon: `gem_${g.kind}`,
  rarity: 1,
  stack: 99,
  price: [50, 150, 400, 1000, 3000][g.grade],
  noRandomDrop: true,
});

/** Bases d'objets pour les runes et gemmes (empilables). */
export const RUNE_GEM_BASES: ItemBase[] = [...RUNES.map(runeBase), ...GEMS.map(gemBase)];
