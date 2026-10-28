// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Recettes du Cube propres à Project Diablo 2 (mods/pd2/docs/ETUDE-PD2.md §3.2, §4, §6.4 ; page Recipes du wiki PD2), enregistrées à leur
 * place d'origine dans le livre de recettes de la base (src/data/cube.ts) : énigme de Larzuk (après les châsses de casque), cartes (avant
 * le Pandémonium), corruption (après les réparations), accès aux ubers et corruption d'Annihilus (avant le portail des Vaches).
 * Les valeurs PD2 des recettes de la base (runes « avec une clé », familles d'artisanat vampirique, abondance et éclat, Talisman du
 * Pandémonium…) sont le patch généré par diff (cube.patch.ts, lot M10c) ; les runes et propriétés de l'artisanat PD2 par emplacement sont
 * ci-dessous (règle `cube.craft` : mods/pd2/rules/cube.ts).
 */
import type { CraftFamily, CubeCost, CubeRecipe, StatRoll } from '../../../src/mods/api';

const one = (id: string, n = 1): CubeCost => ({ ids: [id], n });
const r = (stat: string, min: number, max: number, param?: string): StatRoll => (param ? { stat, min, max, param } : { stat, min, max });

/** Après `sock_helm`, dans l'ordre */
export const LARZUK_RECIPES: CubeRecipe[] = [
  {
    id: 'sock_puzzlebox',
    name: 'Boîte à énigme de Larzuk',
    category: 'Châsses',
    desc: 'Sur tout objet sans châsse (y compris unique ou set) : 1 à 2 châsses, 2 à 4 sur une arme à deux mains.',
    cost: [one('puzzlebox')],
    items: { n: 1, accept: { types: ['weapon', 'armor', 'shield', 'helm', 'circlet'], noSockets: true, notCorrupted: true, notRuneword: true } },
    effect: { kind: 'addSockets', min: 1, max: 2, min2h: 2, max2h: 4 },
  },
  {
    id: 'puzzlebox',
    name: 'Boîte à énigme de Larzuk',
    category: 'Châsses',
    desc: 'Dix pièces d’énigme de Larzuk forment une boîte (châsses sur un unique ou un set).',
    cost: [one('puzzlepiece', 10)],
    effect: { kind: 'material', id: 'puzzlebox', qty: 1 },
  },
  {
    id: 'sock_puzzlepiece',
    name: 'Pièce d’énigme de Larzuk',
    category: 'Châsses',
    desc: 'Sur un objet sans châsse, ni unique ni set : 1 à 2 châsses, 2 à 4 sur une arme à deux mains.',
    cost: [one('puzzlepiece')],
    items: { n: 1, accept: { qualities: ['normal', 'superior', 'magic', 'rare', 'crafted'], types: ['weapon', 'armor', 'shield', 'helm', 'circlet'], noSockets: true, notCorrupted: true } },
    effect: { kind: 'addSockets', min: 1, max: 2, min2h: 2, max2h: 4 },
  },
];

/** Avant `pandemonium_keys`, dans l'ordre */
export const MAP_RECIPES: CubeRecipe[] = [
  /* ---------- cartes (orbes « infusés » : sans ingrédient, PD2 §6.4) ---------- */
  ...(
    [
      ['arcane', 'Orbe arcanique', 'carte normale → magique (ou relance d’une magique)'],
      ['zakarum', 'Orbe de Zakarum', 'carte normale → rare'],
      ['angelic', 'Orbe angélique', 'carte magique → rare'],
      ['horadrim', 'Orbe horadrique', 'relance une carte rare'],
      ['destruction', 'Orbe de destruction', 'carte magique ou rare → normale'],
      ['fortification', 'Orbe de fortification', 'carte fortifiée : moitié moins de monstres, deux fois plus de vie, de butin et d’expérience par monstre'],
    ] as const
  ).map(([orb, name, desc]): CubeRecipe => ({
    id: `map_${orb}`,
    name,
    category: 'Cartes',
    desc: `${name} : ${desc}.`,
    cost: [one(`orb_${orb}`)],
    items: { n: 1, accept: { types: ['map'], notCorrupted: true } },
    effect: { kind: 'mapOrb', orb },
  })),
  {
    id: 'map_catalyst',
    name: 'Éclat du Catalyseur',
    category: 'Cartes',
    desc: 'Éclat du Catalyseur : la carte magique ou rare contiendra un événement aléatoire.',
    cost: [one('catalyst_shard')],
    items: { n: 1, accept: { types: ['map'], qualities: ['magic', 'rare'], notCorrupted: true } },
    effect: { kind: 'mapOrb', orb: 'catalyst' },
  },
  {
    id: 'map_heroes',
    name: 'Étendard des Héros',
    category: 'Cartes',
    desc: 'Étendard des Héros : carte magique, rare ou unique héroïque (+10 % d’expérience, +20 % de densité, +20 % d’objets magiques et d’or).',
    cost: [one('standard_heroes')],
    items: { n: 1, accept: { types: ['map'], qualities: ['magic', 'rare', 'unique'] } },
    effect: { kind: 'mapOrb', orb: 'heroes' },
  },
  {
    id: 'map_cartographer',
    name: 'Orbe du cartographe',
    category: 'Cartes',
    desc: 'Trois cartes du même palier (1 ou 2) donnent une carte normale du palier supérieur.',
    cost: [one('orb_cartographer')],
    items: { n: 3, accept: { types: ['map'], mapTiers: [1, 2] } },
    effect: { kind: 'mapCombine', upgrade: true },
  },
  {
    id: 'map_three',
    name: '3 cartes → 1 carte',
    category: 'Cartes',
    desc: 'Trois cartes du même palier donnent une carte normale aléatoire du même palier.',
    cost: [],
    items: { n: 3, accept: { types: ['map'], mapTiers: [1, 2, 3] } },
    effect: { kind: 'mapCombine', upgrade: false },
  },
  {
    id: 'map_scarab',
    name: 'Scarabée horadrique',
    category: 'Cartes',
    desc: 'Une carte de palier 3 devient un donjon rare (niveau 90).',
    cost: [one('horadrim_scarab')],
    items: { n: 1, accept: { types: ['map'], mapTiers: [3] } },
    effect: { kind: 'mapScarab' },
  },
];

/** Après `repair_any` */
export const CORRUPTION_RECIPES: CubeRecipe[] = [
  /* ---------- corruption ---------- */
  {
    id: 'corrupt',
    name: 'Corrompre (Éclat de Pierre-Monde)',
    category: 'Corruption',
    desc: 'Corruption PD2 : définitive. Base normale : 50 % sans effet / 50 % châsses ; autres : 25 % sans effet, 50 % propriété de corruption, 25 % objet transformé.',
    cost: [one('worldstone_shard')],
    items: { n: 1, accept: { notCorrupted: true, notRuneword: true, types: ['weapon', 'armor', 'shield', 'helm', 'circlet', 'boots', 'gloves', 'belt', 'ring', 'amulet', 'map'] } },
    effect: { kind: 'corrupt' },
  },
];

const uberAccess = (id: string, name: string, cost: CubeCost[], result: string, desc: string): CubeRecipe => ({
  id,
  name,
  category: 'Pandémonium',
  desc,
  cost,
  effect: { kind: 'material', id: result, qty: 1 },
});
const uberPortal = (id: string, name: string, item: string, run: string, desc: string): CubeRecipe => ({
  id,
  name,
  category: 'Pandémonium',
  desc,
  cost: [one(item)],
  effect: { kind: 'portal', runs: [run] },
});
const uberCycle = (item: string, name: string): CubeRecipe => ({
  id: `cycle_${item}`,
  name: `Renforcer : ${name}`,
  category: 'Pandémonium',
  desc: `Fait passer ${name} au niveau de difficulté suivant (0, 1, 2, puis retour à 0) : plus de dangers, plus de chances d'exclusivités.`,
  cost: [one(item)],
  effect: { kind: 'material', id: item, qty: 1, cycle: item },
});

/* ---------- Pandémonium, suite (page Recipes de PD2 : Uber Access, Uber Difficulty) : avant `cows_portal`, dans l'ordre ---------- */
export const UBER_RECIPES: CubeRecipe[] = [
  uberAccess(
    'relic_ancients',
    'Relique des Anciens',
    [one('sigil_madawc'), one('sigil_talic'), one('sigil_korlic')],
    'relic_ancients',
    'Les Sceaux de Madawc (cartes de palier 1), de Talic (palier 2) et de Korlic (palier 3) forment la Relique des Anciens.',
  ),
  uberPortal(
    'portal_ancients',
    'Portail des Anciens ultimes',
    'relic_ancients',
    'uber_ancients',
    "La Relique des Anciens ouvre un portail vers le sommet d'Arreat : Talic, Madawc et Korlic ultimes. Ils lâchent des Étendards des Héros.",
  ),
  uberAccess(
    'vision_terror',
    'Vision de la terreur',
    [one('prime_evil_soul'), one('black_soulstone'), one('pure_essence')],
    'vision_terror',
    "L'Âme du Mal primordial (Méphisto, Diablo, Baal en Enfer), la Pierre d'âme noire (Tristram pandémoniaque) et l'Essence démoniaque pure (boss de carte) forment la Vision de la terreur.",
  ),
  uberPortal(
    'portal_dclone',
    'Portail du Clone de Diablo',
    'vision_terror',
    'uber_dclone',
    'La Vision de la terreur ouvre le combat contre le Clone de Diablo, qui lâche Annihilus. Aux niveaux 1 et 2, il peut lâcher une exclusivité.',
  ),
  uberAccess(
    'voidstone',
    'Pierre du Vide',
    [one('jawbone_trang'), one('splinter_void'), one('hellfire_ashes')],
    'voidstone',
    "La Mâchoire de Trang-Oul (morts-vivants), l'Éclat du Vide (Ombre de Mendeln) et les Cendres du feu de l'enfer forment la Pierre du Vide.",
  ),
  uberPortal('portal_rathma', 'Portail de Rathma', 'voidstone', 'uber_rathma', 'La Pierre du Vide ouvre le combat contre Mendeln et Rathma, qui lâchent un Éclat souillé (corrompt Annihilus).'),
  uberAccess(
    'shadow_hatred',
    'Ombre de la haine',
    [one('demonic_insignia'), one('talisman_transgression'), one('flesh_malic')],
    'shadow_hatred',
    "L'Insigne démoniaque (zones rouges), le Talisman de la Transgression (zones corrompues) et la Chair de Malic (démons) forment l'Ombre de la haine.",
  ),
  uberPortal('portal_lucion', 'Portail de Lucion', 'shadow_hatred', 'uber_lucion', "L'Ombre de la haine ouvre le combat contre Lucion, dont la mort donne un Jeton de profanation."),
  uberCycle('vision_terror', 'la Vision de la terreur'),
  uberCycle('voidstone', 'la Pierre du Vide'),
  uberCycle('shadow_hatred', "l'Ombre de la haine"),
  {
    id: 'taint_annihilus',
    name: 'Corrompre Annihilus (Éclat souillé)',
    category: 'Corruption',
    desc: "L'Éclat souillé de Rathma corrompt Annihilus : une propriété de corruption propre au charme (définitive).",
    cost: [one('tainted_shard')],
    items: { n: 1, accept: { uniqueIds: ['u_annihilus'], notCorrupted: true } },
    effect: { kind: 'taint' },
  },
  {
    id: 'desecrate',
    name: 'Profanation (Jeton de profanation)',
    category: 'Corruption',
    desc: "Autel du Temple du Triumvirat : seconde corruption d'une amulette déjà corrompue, 50 % de réussite (60 % si l'Ombre de la haine est au niveau 1 ou 2). En cas d'échec le jeton est perdu et l'amulette reste telle quelle.",
    cost: [one('desecration_token')],
    items: { n: 1, accept: { types: ['amulet'], corruptedOnly: true } },
    effect: { kind: 'desecrate' },
  },
];

/**
 * Rune de l'emplacement par famille d'artisanat (tableau « Crafting Comparison Chart » de PD2).
 * Ordre des commentaires : amulette, anneau, ceinture, gants, bottes, casque, armure, bouclier, arme.
 * Les diadèmes ne s'artisanent pas (PD2) ; les peaux suivent les casques, les têtes réduites les boucliers.
 */
export const CRAFT_RUNES: Record<CraftFamily, Record<string, string>> = {
  // Amn, Sol, Tal, Nef, Eth, Ral, Thul, Ith, Ort
  blood: { amulet: 'r11', ring: 'r12', belt: 'r07', gloves: 'r04', boots: 'r05', helm: 'r08', armor: 'r10', shield: 'r06', weapon: 'r09', quiver: 'r08' },
  // Ral, Amn, Ith, Ort, Thul, Nef, Tal, Eth, Tir
  caster: { amulet: 'r08', ring: 'r11', belt: 'r06', gloves: 'r09', boots: 'r10', helm: 'r04', armor: 'r07', shield: 'r05', weapon: 'r03', quiver: 'r05' },
  // Thul, Amn, Tal, Ort, Ral, Ith, Nef, Eth, Tir
  hitpower: { amulet: 'r10', ring: 'r11', belt: 'r07', gloves: 'r09', boots: 'r08', helm: 'r06', armor: 'r04', shield: 'r05', weapon: 'r03', quiver: 'r05' },
  // Thul, Amn, Tal, Ral, Ort, Ith, Eth, Nef, Sol
  safety: { amulet: 'r10', ring: 'r11', belt: 'r07', gloves: 'r08', boots: 'r09', helm: 'r06', armor: 'r05', shield: 'r04', weapon: 'r12', quiver: 'r04' },
  // Dol, Hel, Eld, Io, El, Lum, Tir, Sol, Shael
  vampiric: { amulet: 'r14', ring: 'r15', belt: 'r02', gloves: 'r16', boots: 'r01', helm: 'r17', armor: 'r03', shield: 'r12', weapon: 'r13', quiver: 'r12' },
  // Ko, Lum, El, Hel, Io, Tir, Eld, Dol, Shael
  bountiful: { amulet: 'r18', ring: 'r17', belt: 'r01', gloves: 'r15', boots: 'r16', helm: 'r03', armor: 'r02', shield: 'r14', weapon: 'r13', quiver: 'r14' },
  // Tal, Hel, Io, Shael, Ko, Eld, El, Ort, Sol
  brilliant: { amulet: 'r07', ring: 'r15', belt: 'r16', gloves: 'r13', boots: 'r18', helm: 'r02', armor: 'r01', shield: 'r09', weapon: 'r12', quiver: 'r09' },
};

/**
 * Propriétés fixes de l'artisanat par famille et par emplacement : tableau « Crafting Comparison Chart »
 * de la page Crafting de PD2, valeurs « After ». « Nova de glace niveau 4 quand vous êtes frappé » = procGetHit.
 */
const FN = 'frost_nova:4';
export const CRAFT_MODS: Record<CraftFamily, Record<string, StatRoll[]>> = {
  blood: {
    amulet: [r('frw', 10, 10), r('lifePerKill', 3, 6), r('life', 10, 20)],
    ring: [r('str', 5, 10), r('lifeLeech', 2, 3), r('life', 10, 20)],
    belt: [r('openWounds', 10, 20), r('lifeLeech', 3, 6), r('life', 10, 20)],
    gloves: [r('crushingBlow', 5, 10), r('lifeLeech', 2, 4), r('life', 10, 20)],
    boots: [r('openWounds', 5, 10), r('lifeLeech', 2, 4), r('life', 10, 20)],
    helm: [r('crushingBlow', 10, 15), r('lifeLeech', 2, 4), r('life', 10, 20)],
    armor: [r('lifePerKill', 4, 6), r('defPct', 30, 50), r('lifePct', 5, 8)],
    shield: [r('block', 10, 20), r('lifeLeech', 3, 6), r('lifePct', 5, 8)],
    weapon: [r('edPct', 50, 80), r('lifeLeech', 3, 6), r('life', 10, 20)],
    quiver: [r('crushingBlow', 10, 20), r('life', 10, 20), r('lifeLeech', 3, 6)],
  },
  caster: {
    amulet: [r('fcr', 5, 10), r('manaRegenPct', 4, 10), r('mana', 10, 20)],
    ring: [r('ene', 5, 10), r('manaPerKill', 1, 2), r('mana', 10, 20)],
    belt: [r('fcr', 10, 10), r('manaRegenPct', 4, 10), r('mana', 10, 20)],
    gloves: [r('fcr', 5, 10), r('manaPerKill', 1, 3), r('mana', 10, 20)],
    boots: [r('manaPct', 10, 15), r('manaRegenPct', 4, 10), r('mana', 10, 20)],
    helm: [r('fcr', 10, 10), r('manaRegenPct', 5, 10), r('ene', 10, 20)],
    armor: [r('fcr', 10, 15), r('manaPerKill', 3, 6), r('ene', 15, 25)],
    shield: [r('block', 10, 20), r('fcr', 10, 10), r('manaPct', 20, 30)],
    weapon: [r('allSkills', 1, 1), r('fcr', 10, 20), r('mana', 10, 20)],
    quiver: [r('fcr', 10, 10), r('mana', 10, 20), r('manaPerKill', 2, 4)],
  },
  hitpower: {
    amulet: [r('attackRating', 150, 250), r('fhr', 10, 20), r('procGetHit', 5, 5, FN)],
    ring: [r('dex', 5, 10), r('maxDmg', 2, 4), r('procGetHit', 5, 5, FN)],
    belt: [r('fbr', 10, 10), r('fhr', 10, 20), r('procGetHit', 5, 5, FN)],
    gloves: [r('knockback', 1, 1), r('reduceDef', 10, 20), r('procGetHit', 5, 5, FN)],
    boots: [r('defMelee', 60, 120), r('fhr', 10, 20), r('procGetHit', 5, 5, FN)],
    helm: [r('attackRating', 100, 200), r('fhr', 10, 20), r('procGetHit', 5, 5, FN)],
    armor: [r('defPct', 75, 100), r('fhr', 30, 40), r('procGetHit', 8, 8, FN)],
    shield: [r('block', 10, 20), r('fbr', 20, 30), r('procGetHit', 5, 5, FN)],
    weapon: [r('edPct', 50, 80), r('reduceDef', 10, 20), r('procGetHit', 5, 5, FN)],
    quiver: [r('knockback', 1, 1), r('reduceDef', 10, 20), r('procGetHit', 8, 8, FN)],
  },
  safety: {
    amulet: [r('block', 10, 10), r('mdr', 4, 7), r('drFlat', 4, 7)],
    ring: [r('vit', 5, 10), r('mdr', 2, 5), r('drFlat', 2, 5)],
    belt: [r('defPct', 10, 30), r('resPoison', 10, 20), r('mdr', 2, 5), r('drFlat', 2, 5)],
    gloves: [r('defPct', 10, 30), r('resCold', 10, 20), r('mdr', 2, 5), r('drFlat', 2, 5)],
    boots: [r('defPct', 20, 60), r('resFire', 10, 20), r('mdr', 2, 5), r('drFlat', 2, 5)],
    helm: [r('defPct', 30, 60), r('defMissile', 100, 150), r('dr', 4, 6)],
    armor: [r('defPct', 50, 75), r('defMelee', 100, 150), r('dr', 4, 6)],
    shield: [r('defPct', 50, 75), r('defMelee', 100, 150), r('dr', 4, 6)],
    weapon: [r('edPct', 50, 80), r('knockback', 1, 1), r('mdr', 2, 5), r('drFlat', 2, 5)],
    quiver: [r('mdr', 4, 7), r('drFlat', 4, 7), r('frw', 10, 10)],
  },
  vampiric: {
    amulet: [r('curseLength', 15, 25), r('manaLeech', 3, 6), r('lifeRegen', 20, 30)],
    ring: [r('poisonLength', 15, 25), r('manaLeech', 2, 3), r('minDmg', 2, 4)],
    belt: [r('poisonLength', 15, 25), r('manaLeech', 3, 6), r('lifeRegen', 10, 20)],
    gloves: [r('deadlyStrike', 5, 10), r('manaLeech', 2, 4), r('lifeRegen', 10, 20)],
    boots: [r('poisonLength', 15, 25), r('manaLeech', 2, 4), r('lifeRegen', 10, 20)],
    helm: [r('deadlyStrike', 10, 15), r('manaLeech', 2, 4), r('lifeRegen', 10, 15)],
    armor: [r('manaLeech', 4, 6), r('defPct', 30, 50), r('poisonLength', 30, 50)],
    shield: [r('block', 10, 20), r('manaLeech', 3, 6), r('poisonLength', 30, 50)],
    weapon: [r('dmgDemonPct', 100, 140), r('dmgUndeadPct', 100, 140), r('manaLeech', 3, 6), r('lifeRegen', 10, 15)],
    quiver: [r('manaLeech', 3, 6), r('poisonLength', 30, 50), r('lifeRegen', 15, 25)],
  },
  bountiful: {
    amulet: [r('vit', 10, 20), r('mf', 20, 30), r('lightRadius', 1, 3)],
    ring: [r('vit', 5, 10), r('mf', 10, 20), r('lightRadius', 1, 3)],
    belt: [r('defPct', 25, 50), r('mf', 20, 30), r('lightRadius', 1, 3)],
    gloves: [r('defPct', 25, 50), r('mf', 15, 25), r('lightRadius', 1, 3)],
    boots: [r('defPct', 25, 50), r('mf', 15, 25), r('lightRadius', 1, 3)],
    helm: [r('defPct', 25, 50), r('mf', 20, 30), r('lightRadius', 1, 3)],
    armor: [r('defPct', 30, 50), r('mf', 20, 30), r('gf', 30, 50)],
    shield: [r('block', 10, 20), r('mf', 20, 30), r('gf', 30, 50)],
    weapon: [r('allSkills', 1, 1), r('mf', 20, 30), r('lightRadius', 1, 3)],
    quiver: [r('vit', 5, 10), r('mf', 15, 25), r('gf', 20, 30)],
  },
  brilliant: {
    amulet: [r('defMissile', 100, 150), r('allAttr', 4, 8), r('resAll', 5, 10)],
    ring: [r('defMissile', 50, 100), r('resAll', 3, 5), r('halfFreeze', 1, 1)],
    belt: [r('ias', 5, 10), r('defPct', 25, 50), r('halfFreeze', 1, 1)],
    gloves: [r('ias', 5, 10), r('arPct', 10, 20), r('defPct', 25, 50)],
    boots: [r('frw', 5, 10), r('defMissile', 100, 150), r('halfFreeze', 1, 1)],
    helm: [r('ias', 5, 10), r('defPct', 25, 50), r('halfFreeze', 1, 1)],
    armor: [r('block', 10, 20), r('defPct', 25, 50), r('resAll', 5, 10)],
    shield: [r('block', 10, 20), r('resAll', 5, 10), r('halfFreeze', 1, 1)],
    weapon: [r('ias', 20, 20), r('edPct', 20, 40), r('attackRating', 50, 100)],
    quiver: [r('resAll', 5, 10), r('defMissile', 100, 150), r('fhr', 10, 10)],
  },
};
