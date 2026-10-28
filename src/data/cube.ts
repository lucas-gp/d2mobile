// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Recettes du Cube horadrique de la base : Diablo II LoD 1.13c (CubeMain.txt, recettes d'une partie solo de l'extension ; lot M10c).
 * L'amélioration des runes et l'artisanat sont construits depuis la table (cube-d2.ts, `npm run vanilla`) ; les autres recettes sont
 * écrites ici et contrôlées contre la table (tests/unit/vanilla-cube.test.ts). Un mod les patche (Project Diablo 2 : runes « avec une
 * clé », trois familles d'artisanat de plus, Talisman du Pandémonium… : mods/pd2/data/cube.patch.ts). Données pures : les coûts en
 * matériaux, les objets acceptés et l'effet produit ; l'exécution est dans src/sim/cube.ts.
 * Sur mobile, le Cube est un livre de recettes : on choisit la recette, puis l'objet.
 * Recettes de CubeMain.txt non reprises (objets absents du jeu ou résultat que le moteur ne sait pas produire) : potions, flèches et
 * carreaux, haches de jet et javelots, objets de qualité inférieure, anneaux et objets magiques à affixe imposé (bouclier de pointes, épée de
 * la sangsue, arme d'hast sauvage), recettes avec la Pierre de Jordan, réparation avec recharge ; le niveau requis ajouté par
 * l'amélioration d'un objet (+5, +7) ; le parchemin de portail de la recette qui vide les châsses (absent du jeu).
 */
import { GEM_BY_ID, RUNES, RUNE_BY_ID } from './items/runes';
import { D2_RUNE_UPGRADES } from './cube-d2';
import type { Quality } from '../sim/item';
import { afterRegister } from '../mods/derived';

/** Coût : `n` unités prises dans une liste d'identifiants (dans l'ordre, ex. « 3 gemmes parfaites quelconques ») */
export interface CubeCost {
  ids: string[];
  n: number;
  label?: string;
}

export type CraftFamily = 'blood' | 'caster' | 'hitpower' | 'safety' | 'vampiric' | 'bountiful' | 'brilliant';

export interface CubeItemFilter {
  qualities?: Quality[];
  /** Types ou groupes de types acceptés (TYPE_GROUPS) */
  types?: string[];
  /** Aucune châsse */
  noSockets?: boolean;
  /** Au moins une châsse remplie */
  socketed?: boolean;
  notCorrupted?: boolean;
  notRuneword?: boolean;
  /** Maps : paliers acceptés (1-4) */
  mapTiers?: number[];
  /** Palier de la base (0 normal, 1 exceptionnel, 2 élite) */
  tiers?: (0 | 1 | 2)[];
  /** Au moins une châsse (vide ou remplie) */
  hasSockets?: boolean;
  notEthereal?: boolean;
  /** Objet qui a une durabilité (armes et armures) */
  durable?: boolean;
  /** Uniques précis acceptés (identifiants) */
  uniqueIds?: string[];
  /** Objet déjà corrompu, pas encore profané */
  corruptedOnly?: boolean;
}

export type CubeEffect =
  /** `cycle` : l'objet rendu fait aussi passer le niveau de difficulté d'ultime au suivant (0, 1, 2, puis 0) */
  | { kind: 'material'; id: string; qty: number; cycle?: string }
  | { kind: 'addSockets'; min: number; max: number; min2h?: number; max2h?: number }
  | { kind: 'unsocket' }
  | { kind: 'rerollMagic' }
  | { kind: 'rerollRare' }
  | { kind: 'jewelrySwap'; base: 'ring' | 'amulet' }
  | { kind: 'craft'; family: CraftFamily }
  | { kind: 'upgradeBase'; to: 1 | 2 }
  | { kind: 'corrupt' }
  /** Éclat souillé : corrompt Annihilus (propriété de corruption propre au charme) */
  | { kind: 'taint' }
  /** Profanation : seconde corruption d'une amulette déjà corrompue (50 % ; 60 % si l'Ombre de la haine est au niveau 1 ou 2) */
  | { kind: 'desecrate' }
  | { kind: 'mapOrb'; orb: 'arcane' | 'angelic' | 'zakarum' | 'horadrim' | 'destruction' | 'fortification' | 'catalyst' | 'heroes' }
  | { kind: 'mapCombine'; upgrade: boolean }
  | { kind: 'mapScarab' }
  /** Ouvre un portail vers l'une des runs (tirée au hasard) du Pandémonium */
  | { kind: 'portal'; runs: string[] }
  /** Portail des Vaches (D2) : difficulté la plus haute où Baal est tombé et où le Roi des Vaches n'a pas été tué depuis */
  | { kind: 'cowPortal' }
  /** Réparation (durabilité au maximum) */
  | { kind: 'repair' }
  /** Nouvel objet magique de même base, 1 à 2 châsses, niveau d'objet fixe */
  | { kind: 'socketedMagic'; ilvl: number }
  /** Amulette prismatique (préfixe imposé, toutes résistances +16-20, ilvl 50 ; D2 : ligne 331 de MagicPrefix.txt, sinon l'ancien `prismatic_cube`) */
  | { kind: 'prismatic'; prefix?: string }
  /** Jeton d'absolution consommé : une réinitialisation de plus */
  | { kind: 'respec' };

export interface CubeRecipe {
  id: string;
  name: string;
  category: 'Runes' | 'Gemmes' | 'Châsses' | 'Relances' | 'Artisanat' | 'Amélioration' | 'Corruption' | 'Cartes' | 'Pandémonium';
  desc: string;
  cost: CubeCost[];
  /** Objets de l'inventaire : nombre et filtre */
  items?: { n: number; accept: CubeItemFilter };
  effect: CubeEffect;
}

const PERFECT = ['ruby', 'sapphire', 'topaz', 'emerald', 'diamond', 'amethyst', 'skull'].map((k) => `gem_${k}_4`);
const one = (id: string, n = 1): CubeCost => ({ ids: [id], n });

/* ---------- runes : CubeMain.txt (3:1, une gemme ébréchée en plus à partir de Thul ; au-delà de Dol : recettes ladder) ---------- */
const runeRecipe = (u: (typeof D2_RUNE_UPGRADES)[number]): CubeRecipe => {
  const r = RUNE_BY_ID[u.from];
  const next = RUNE_BY_ID[u.to];
  return {
    id: `rune_${r.id}`,
    name: `${u.n} ${r.name} → ${next.name}`,
    category: 'Runes',
    desc: u.gem ? `${u.n} runes ${r.name} et une gemme (${GEM_BY_ID[u.gem].name}) donnent une rune ${next.name}.` : `${u.n} runes ${r.name} donnent une rune ${next.name}.`,
    cost: u.gem ? [one(r.id, u.n), one(u.gem)] : [one(r.id, u.n)],
    effect: { kind: 'material', id: next.id, qty: 1 },
  };
};
const runeRecipes: CubeRecipe[] = D2_RUNE_UPGRADES.map(runeRecipe);

/* ---------- gemmes : 3 → grade supérieur (CubeMain.txt) ---------- */
const GEM_KINDS = ['ruby', 'sapphire', 'topaz', 'emerald', 'diamond', 'amethyst', 'skull'];
const GRADE = ['ébréchée', 'fêlée', 'normale', 'sans défaut', 'parfaite'];
const gemRecipes: CubeRecipe[] = GEM_KINDS.flatMap((k) =>
  [0, 1, 2, 3].map((g) => ({
    id: `gem_${k}_${g}`,
    name: `3 ${k === 'skull' ? 'crânes' : 'gemmes'} ${GRADE[g]}s → ${GRADE[g + 1]}`,
    category: 'Gemmes' as const,
    desc: 'Trois gemmes identiques donnent la même gemme au grade supérieur.',
    cost: [one(`gem_${k}_${g}`, 3)],
    effect: { kind: 'material', id: `gem_${k}_${g + 1}`, qty: 1 },
  })),
);

export const CUBE_RECIPES: CubeRecipe[] = [
  ...runeRecipes,
  ...gemRecipes,
  /* ---------- châsses ---------- */
  {
    id: 'sock_weapon',
    name: 'Châsses : arme',
    category: 'Châsses',
    desc: 'Ral + Amn + Améthyste parfaite : 1 à 6 châsses sur une arme normale sans châsse (plafond de la base).',
    cost: [one('r08'), one('r11'), one('gem_amethyst_4')],
    items: { n: 1, accept: { qualities: ['normal'], types: ['weapon'], noSockets: true, notCorrupted: true } },
    effect: { kind: 'addSockets', min: 1, max: 6 },
  },
  {
    id: 'sock_shield',
    name: 'Châsses : bouclier',
    category: 'Châsses',
    desc: 'Tal + Amn + Rubis parfait : 1 à 6 châsses sur un bouclier normal sans châsse (plafond de la base).',
    cost: [one('r07'), one('r11'), one('gem_ruby_4')],
    items: { n: 1, accept: { qualities: ['normal'], types: ['shield', 'head'], noSockets: true, notCorrupted: true } },
    effect: { kind: 'addSockets', min: 1, max: 6 },
  },
  {
    id: 'sock_armor',
    name: 'Châsses : armure',
    category: 'Châsses',
    desc: 'Tal + Thul + Topaze parfaite : 1 à 6 châsses sur une armure normale sans châsse (plafond de la base).',
    cost: [one('r07'), one('r10'), one('gem_topaz_4')],
    items: { n: 1, accept: { qualities: ['normal'], types: ['armor'], noSockets: true, notCorrupted: true } },
    effect: { kind: 'addSockets', min: 1, max: 6 },
  },
  {
    id: 'sock_helm',
    name: 'Châsses : casque',
    category: 'Châsses',
    desc: 'Ral + Thul + Saphir parfait : 1 à 6 châsses sur un casque normal sans châsse (plafond de la base).',
    cost: [one('r08'), one('r10'), one('gem_sapphire_4')],
    items: { n: 1, accept: { qualities: ['normal'], types: ['helm', 'circlet', 'pelt', 'primal'], noSockets: true, notCorrupted: true } },
    effect: { kind: 'addSockets', min: 1, max: 6 },
  },
  {
    id: 'unsocket',
    name: 'Vider les châsses',
    category: 'Châsses',
    desc: 'Hel : détruit tout ce qui est serti (le mot runique est perdu), les châsses restent.',
    cost: [one('r15')],
    items: { n: 1, accept: { socketed: true, notCorrupted: true } },
    effect: { kind: 'unsocket' },
  },
  /* armes magiques à châsses (D2 / PD2) : nouvel objet magique de même base, 1 à 2 châsses */
  {
    id: 'sock_magic_chipped',
    name: 'Arme magique à châsses (ébréchées)',
    category: 'Châsses',
    desc: 'Arme magique + 3 gemmes ébréchées quelconques : nouvelle arme magique de même base, 1 à 2 châsses (niveau 25).',
    cost: [{ ids: GEM_KINDS.map((k) => `gem_${k}_0`), n: 3, label: '3 gemmes ébréchées' }],
    items: { n: 1, accept: { qualities: ['magic'], types: ['weapon'], notCorrupted: true } },
    effect: { kind: 'socketedMagic', ilvl: 25 },
  },
  {
    id: 'sock_magic_standard',
    name: 'Arme à châsses → arme magique (gemmes normales)',
    category: 'Châsses',
    desc: 'Arme à châsses + 3 gemmes normales quelconques : nouvelle arme magique de même base, 1 à 2 châsses (niveau 30). Ce qui était serti est perdu.',
    cost: [{ ids: GEM_KINDS.map((k) => `gem_${k}_2`), n: 3, label: '3 gemmes normales' }],
    items: { n: 1, accept: { types: ['weapon'], hasSockets: true, notCorrupted: true } },
    effect: { kind: 'socketedMagic', ilvl: 30 },
  },
  {
    id: 'sock_magic_flawless',
    name: 'Arme magique à châsses (sans défaut)',
    category: 'Châsses',
    desc: 'Arme magique + 3 gemmes sans défaut quelconques : nouvelle arme magique de même base, 1 à 2 châsses (niveau 30).',
    cost: [{ ids: GEM_KINDS.map((k) => `gem_${k}_3`), n: 3, label: '3 gemmes sans défaut' }],
    items: { n: 1, accept: { qualities: ['magic'], types: ['weapon'], notCorrupted: true } },
    effect: { kind: 'socketedMagic', ilvl: 30 },
  },
  /* ---------- relances ---------- */
  {
    id: 'reroll_magic',
    name: 'Relancer un objet magique',
    category: 'Relances',
    desc: 'Objet magique + 3 gemmes parfaites quelconques : nouvel objet magique, même base et même niveau.',
    cost: [{ ids: PERFECT, n: 3, label: '3 gemmes parfaites' }],
    items: { n: 1, accept: { qualities: ['magic'], notCorrupted: true } },
    effect: { kind: 'rerollMagic' },
  },
  {
    id: 'reroll_rare',
    name: 'Relancer un objet rare',
    category: 'Relances',
    desc: 'Objet rare + 6 crânes parfaits : nouvel objet rare, niveau ⌊0,4·niveau du perso⌋ + ⌊0,4·ilvl⌋.',
    cost: [one('gem_skull_4', 6)],
    items: { n: 1, accept: { qualities: ['rare'], notCorrupted: true } },
    effect: { kind: 'rerollRare' },
  },
  {
    id: 'amulets_ring',
    name: '3 amulettes → anneau',
    category: 'Relances',
    desc: 'Trois amulettes magiques donnent un anneau magique (niveau ⌊0,75·niveau du perso⌋).',
    cost: [],
    items: { n: 3, accept: { qualities: ['magic'], types: ['amulet'] } },
    effect: { kind: 'jewelrySwap', base: 'ring' },
  },
  {
    id: 'rings_amulet',
    name: '3 anneaux → amulette',
    category: 'Relances',
    desc: 'Trois anneaux magiques donnent une amulette magique (niveau ⌊0,75·niveau du perso⌋).',
    cost: [],
    items: { n: 3, accept: { qualities: ['magic'], types: ['ring'] } },
    effect: { kind: 'jewelrySwap', base: 'amulet' },
  },
  {
    id: 'prismatic_amulet',
    name: 'Amulette prismatique',
    category: 'Relances',
    desc: 'Amulette magique + une gemme parfaite de chaque sorte (hors crâne) : amulette magique Prismatique (toutes les résistances +16-20, niveau 50).',
    cost: ['ruby', 'sapphire', 'topaz', 'emerald', 'diamond', 'amethyst'].map((k) => one(`gem_${k}_4`)),
    items: { n: 1, accept: { qualities: ['magic'], types: ['amulet'] } },
    effect: { kind: 'prismatic', prefix: 'prismatic_p331' },
  },
  /* ---------- artisanat (CubeMain.txt : quatre familles, une gemme parfaite chacune ; base et rune selon l'emplacement : cube-d2.ts) ---------- */
  ...(
    [
      ['blood', 'Sang', 'gem_ruby_4', 'Rubis parfait', 'vol de vie, vie'],
      ['caster', 'Lanceur de sorts', 'gem_amethyst_4', 'Améthyste parfaite', 'régénération du mana, mana'],
      ['hitpower', 'Puissance', 'gem_sapphire_4', 'Saphir parfait', 'Nova de glace quand vous êtes frappé, épines'],
      ['safety', 'Sûreté', 'gem_emerald_4', 'Émeraude parfaite', 'réduction des dégâts physiques et magiques'],
    ] as const
  ).map(([family, name, gem, gemName, what]): CubeRecipe => ({
    id: `craft_${family}`,
    name: `Artisanat : ${name}`,
    category: 'Artisanat',
    desc: `Objet magique (base propre à chaque emplacement) + joyau + rune de l’emplacement + ${gemName} : objet d’artisan (${what}) + 1 à 4 propriétés aléatoires selon le niveau ; l’éthéré est conservé.`,
    cost: [one(gem)],
    items: { n: 1, accept: { qualities: ['magic'], types: ['amulet', 'ring', 'belt', 'gloves', 'boots', 'helm', 'armor', 'shield', 'weapon'], notCorrupted: true } },
    effect: { kind: 'craft', family },
  })),
  /* ---------- amélioration de base (CubeMain.txt) : normale → exceptionnelle → élite ; unique vers élite : recettes ladder ---------- */
  ...(
    [
      ['up_unique_weapon_1', 'Arme unique → exceptionnelle', ['r08', 'r12', 'gem_emerald_4'], ['unique'], 'weapon', 0, 1],
      ['up_unique_armor_1', 'Armure unique → exceptionnelle', ['r07', 'r13', 'gem_diamond_4'], ['unique'], 'armorAny', 0, 1],
      ['up_rare_weapon_1', 'Arme rare → exceptionnelle', ['r09', 'r11', 'gem_sapphire_4'], ['rare'], 'weapon', 0, 1],
      ['up_rare_armor_1', 'Armure rare → exceptionnelle', ['r08', 'r10', 'gem_amethyst_4'], ['rare'], 'armorAny', 0, 1],
      ['up_rare_weapon_2', 'Arme rare → élite', ['r19', 'r22', 'gem_sapphire_4'], ['rare'], 'weapon', 1, 2],
      ['up_rare_armor_2', 'Armure rare → élite', ['r18', 'r21', 'gem_amethyst_4'], ['rare'], 'armorAny', 1, 2],
    ] as const
  ).map(([id, name, ing, qualities, type, from, to]): CubeRecipe => ({
    id,
    name,
    category: 'Amélioration',
    desc: `${name} : même objet (propriétés conservées) sur la base du palier supérieur de la même famille.`,
    cost: ing.map((x) => one(x)),
    items: { n: 1, accept: { qualities: [...qualities], types: [type], tiers: [from], notCorrupted: true } },
    effect: { kind: 'upgradeBase', to },
  })),
  /* ---------- Pandémonium (CubeMain.txt, 1.11) et Jeton d'absolution (1.13) ---------- */
  {
    id: 'pandemonium_keys',
    name: 'Portail du Pandémonium',
    category: 'Pandémonium',
    desc: "Clé de la terreur (Comtesse), de la haine (Invocateur) et de la destruction (Nihlathak), en Enfer : un portail vers l'Antre de la Matrone (Lilith), les Sables oubliés (Duriel ultime) ou la Fournaise de la douleur (Izual ultime), sans répéter une zone avant d'avoir vu les trois.",
    cost: [one('key_terror'), one('key_hate'), one('key_destruction')],
    effect: { kind: 'portal', runs: ['uber_lilith', 'uber_duriel', 'uber_izual'] },
  },
  {
    id: 'pandemonium_finale',
    name: 'Finale du Pandémonium',
    category: 'Pandémonium',
    desc: 'Cervelle de Méphisto (Izual ultime), corne de Diablo (Lilith) et œil de Baal (Duriel ultime) ouvrent le portail vers Tristram : Méphisto, Diablo et Baal ultimes.',
    cost: [one('organ_brain'), one('organ_horn'), one('organ_eye')],
    effect: { kind: 'portal', runs: ['uber_tristram'] },
  },
  {
    id: 'token_absolution',
    name: "Jeton d'absolution",
    category: 'Pandémonium',
    desc: "Les quatre essences (tordue de souffrance, chargée de haine, ardente de terreur, purulente de destruction) forment un Jeton d'absolution.",
    cost: [one('essence_twisted'), one('essence_charged'), one('essence_burning'), one('essence_festering')],
    effect: { kind: 'material', id: 'token_absolution', qty: 1 },
  },
  {
    id: 'token_use',
    name: "Utiliser un Jeton d'absolution",
    category: 'Pandémonium',
    desc: 'Le jeton est consommé : une réinitialisation des points de compétence et de caractéristiques de plus.',
    cost: [one('token_absolution')],
    effect: { kind: 'respec' },
  },
  /* ---------- réparation (CubeMain.txt : objet non éthéré) ---------- */
  {
    id: 'repair_weapon',
    name: 'Réparer une arme',
    category: 'Amélioration',
    desc: 'Ort + arme non éthérée : durabilité au maximum.',
    cost: [one('r09')],
    items: { n: 1, accept: { types: ['weapon'], notEthereal: true, durable: true } },
    effect: { kind: 'repair' },
  },
  {
    id: 'repair_armor',
    name: 'Réparer une armure',
    category: 'Amélioration',
    desc: 'Ral + armure non éthérée (casque, armure, bouclier, gants, bottes, ceinture) : durabilité au maximum.',
    cost: [one('r08')],
    items: { n: 1, accept: { types: ['armorAny'], notEthereal: true, durable: true } },
    effect: { kind: 'repair' },
  },
];

/**
 * Emplacement d'artisanat d'un type de base (null : pas d'artisanat, ex. diadème). Les objets acceptés, la rune et les propriétés de chaque
 * emplacement sont ceux de la règle `cube.craft` (base : CubeMain.txt, cube-d2.ts).
 */
export function craftSlot(type: string, isWeapon: boolean): string | null {
  if (isWeapon) return 'weapon';
  if (type === 'pelt' || type === 'primal') return 'helm';
  if (type === 'head') return 'shield';
  if (type === 'quiver') return 'quiver';
  return ['amulet', 'ring', 'belt', 'gloves', 'boots', 'helm', 'armor', 'shield'].includes(type) ? type : null;
}

/* ---------- Vaches et quêtes (après les recettes d'accès aux ubers du mod pd2) ---------- */
const ENDGAME_RECIPES: CubeRecipe[] = [
  {
    id: 'cows_portal',
    name: 'Portail des Vaches',
    category: 'Pandémonium',
    desc: "Jambe de Wirt et Tome de portail ouvrent un portail vers le Niveau des Vaches, dans la plus haute difficulté où Baal est tombé. Tuer le Roi des Vaches ferme le portail dans cette difficulté jusqu'à la prochaine mort de Baal.",
    cost: [one('wirts_leg'), one('tome_portal')],
    effect: { kind: 'cowPortal' },
  },
  {
    id: 'quest_horadric_staff',
    name: 'Bâton horadrique',
    category: 'Amélioration',
    desc: "Le Bâton des Rois et l'Amulette de la Vipère forment le Bâton horadrique (quête d'Horadrim).",
    cost: [one('staff_of_kings'), one('viper_amulet')],
    effect: { kind: 'material', id: 'horadric_staff', qty: 1 },
  },
  {
    id: 'quest_khalim_will',
    name: 'Volonté de Khalim',
    category: 'Amélioration',
    desc: "L'Œil, le Cerveau, le Cœur et le Fléau de Khalim forment sa Volonté (quête de la Volonté de Khalim).",
    cost: [one('khalim_eye'), one('khalim_brain'), one('khalim_heart'), one('khalim_flail')],
    effect: { kind: 'material', id: 'khalim_will', qty: 1 },
  },
];
CUBE_RECIPES.push(...ENDGAME_RECIPES);

export const CUBE_BY_ID: Record<string, CubeRecipe> = Object.fromEntries(CUBE_RECIPES.map((r) => [r.id, r]));

// runes ajoutées ou retirées par un mod : la chaîne d'amélioration suit (src/mods/derived.ts). Une recette de rune dont la rune ou le résultat
// n'existe plus est retirée ; une rune ajoutée par un mod reçoit la recette qui y mène (2 runes de la précédente), après les recettes de runes.
const BASE_RUNES = new Set(RUNES.map((r) => r.id));
afterRegister('recettes des runes', (api) => {
  const ids = new Set(RUNES.map((r) => r.id));
  for (const r of api.cubeRecipes.all().filter((x) => x.category === 'Runes')) {
    const out = r.effect.kind === 'material' ? r.effect.id : '';
    if (!ids.has(out) || r.cost.some((k) => k.ids.some((id) => BASE_RUNES.has(id) && !ids.has(id)))) api.cubeRecipes.remove(r.id);
  }
  RUNES.forEach((r, i) => {
    if (i === 0 || BASE_RUNES.has(r.id)) return;
    const prev = RUNES[i - 1];
    const id = `rune_${prev.id}`;
    if (api.cubeRecipes.has(id)) return;
    const chain = api.cubeRecipes.all().filter((x) => x.category === 'Runes');
    const recipe: CubeRecipe = {
      id,
      name: `2 ${prev.name} → ${r.name}`,
      category: 'Runes',
      desc: `2 runes ${prev.name} donnent une rune ${r.name}.`,
      cost: [one(prev.id, 2)],
      effect: { kind: 'material', id: r.id, qty: 1 },
    };
    api.cubeRecipes.add(recipe, chain.length ? { after: chain[chain.length - 1].id } : { before: api.cubeRecipes.all()[0].id });
  });
});
