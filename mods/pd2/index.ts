/**
 * Contenu du mod Project Diablo 2, enregistré par-dessus la base à l'activation du jeu de règles `pd2` (src/mods/activate.ts). Chaque
 * groupe reprend sa place d'origine dans les tables de la base (ordre de tirage et d'affichage inchangés). Le contenu PD2 encore fondu dans
 * la base (valeurs, règles, cartes : voir README.md) en sortira lot après lot.
 */
import { applyTablePatch, type AddAt, type ModApi, type ModContent, type ModRegistry } from '../../src/mods/api';
import { PD2_CORRUPTION } from './data/corruption';
import { CORRUPTION_RECIPES, LARZUK_RECIPES, MAP_RECIPES, UBER_RECIPES } from './data/cube';
import { PD2_MISC_AFTER_TALISMAN, PD2_MISC_AFTER_TOME, PD2_MISC_TALISMAN } from './data/items/misc';
import { QUIVER_BASES, QUIVER_RUNEWORDS, QUIVER_UNIQUES } from './data/items/quivers';
import { PD2_UNIQUES, SUNDER_CHARMS } from './data/items/uniques';
import { PD2_AFFIXES_PATCH } from './data/items/affixes.patch';
import { PD2_BASES_PATCH } from './data/items/bases.patch';
import { PD2_RUNEWORDS_PATCH } from './data/items/runewords.patch';
import { PD2_CUBE_PATCH } from './data/cube.patch';
import { PD2_GEMS_PATCH, PD2_RUNES_PATCH } from './data/items/runes.patch';
import { PD2_UNIQUES_PATCH } from './data/items/uniques.patch';
import { PD2_SETS_PATCH, PD2_SET_ITEMS_PATCH } from './data/items/sets.patch';
import { PD2_LEVELS_PATCH, PD2_RUNS_PATCH } from './data/levels.patch';
import { PD2_TREASURE_PATCH } from './data/treasure.patch';
import { PD2_MONSTER_FIDELITY_PATCH } from './data/monsters.patch';
import { PD2_CLASSES_PATCH } from './data/classes.patch';
import { PD2_RATES } from './data/rates';
import * as PD2_VALUE from './data/loot-value';
import { PD2_MAP_AFFIXES, PD2_MAP_ZONES } from './data/maps';
import { PD2_HARD, PD2_NUMBERS, PD2_SYNERGIES } from './data/skills';
import { PD2_SKILLS_PATCH } from './data/skills.patch';
import { PD2_MERCS_PATCH } from './data/mercs.patch';
import { PD2_SKILL_RENAMES } from './data/skill-renames';
import { registerEndgame } from './sim/endgame';
import { registerLoot } from './sim/pandemonium';
import { registerCombatRules } from './rules/combat';
import { registerMercRules } from './rules/mercs';
import { registerCharacterRules } from './rules/character';
import { registerProgressionRules } from './rules/progression';
import { registerCubeRules } from './rules/cube';
import { registerSkillRules } from './rules/skills';
import { registerBotRules } from './bots';
import { registerPuzzle } from './ui/puzzle';
import LEGACY_IDS from './legacy-ids.json';
import EN from './i18n/en.json';

/** Ajoute une liste à une position : à la suite d'une entrée (dans l'ordre), ou juste avant une entrée (dans l'ordre) */
function addAll<T extends { id: string }>(reg: ModRegistry<T>, list: readonly T[], at: AddAt): void {
  let prev = at.after;
  for (const e of list) {
    reg.add(e, prev !== undefined ? { after: prev } : at);
    if (prev !== undefined) prev = e.id;
  }
}

const content: ModContent = {
  /** Identifiants d'avant les mods, sans espace de noms `pd2:` (déjà dans les sauvegardes ; tables de corruption lues par type d'objet) */
  legacyIds: LEGACY_IDS,
  register(api: ModApi) {
    // valeurs PD2 S13 sur les tables vanilla de la base (patch généré par diff, lot M6 : mods/pd2/tools/vanilla-diff.ts), avant les ajouts
    applyTablePatch(api.bases, PD2_BASES_PATCH);
    applyTablePatch(api.runes, PD2_RUNES_PATCH);
    applyTablePatch(api.gems, PD2_GEMS_PATCH);
    applyTablePatch(api.uniques, PD2_UNIQUES_PATCH);
    applyTablePatch(api.setItems, PD2_SET_ITEMS_PATCH);
    applyTablePatch(api.sets, PD2_SETS_PATCH);
    // affixes magiques et rares PD2 (wiki « Item_Affixes ») sur ceux de MagicPrefix / MagicSuffix (lot M10a)
    applyTablePatch(api.affixes, PD2_AFFIXES_PATCH);
    // mots runiques PD2 (wiki « Runewords ») sur ceux de Runes.txt (lot M10b)
    applyTablePatch(api.runewords, PD2_RUNEWORDS_PATCH);
    // recettes du Cube PD2 (wiki « Recipes », « Crafting ») sur celles de CubeMain.txt (lot M10c), avant les recettes propres au mod
    applyTablePatch(api.cubeRecipes, PD2_CUBE_PATCH);
    // niveaux de zone PD2 (wiki « Zones ») et niveaux des étapes de campagne qui les recopient
    applyTablePatch(api.levels, PD2_LEVELS_PATCH);
    applyTablePatch(api.runs, PD2_RUNS_PATCH);
    // classes de trésor PD2 (TC des boss, ubers) sur celles de D2 ; tables « junk » / « misc », NoDrop, Pandémonium et énigme : règles
    applyTablePatch(api.treasureClasses, PD2_TREASURE_PATCH);
    // fidélité des monstres PD2 (résistances des porte-clés et des ubers, vie, vol de vie, régénération), réappliquée aux monstres
    applyTablePatch(api.monsterFidelity, PD2_MONSTER_FIDELITY_PATCH);
    // caractéristiques des classes PD2 (mana par niveau, endurance) sur celles de CharStats.txt
    applyTablePatch(api.classes, PD2_CLASSES_PATCH);
    // mercenaires PD2 (lot M10d) : cinq actes, 13 sous-types, armes et objets de classe du wiki, sur ceux de Hireling.txt
    applyTablePatch(api.mercs, PD2_MERCS_PATCH);
    registerLoot(api);
    addAll(api.bases, PD2_MISC_AFTER_TOME, { after: 'tome_portal' });
    addAll(api.bases, [...PD2_MISC_TALISMAN, ...PD2_MISC_AFTER_TALISMAN], { after: 'token_absolution' });
    for (const b of QUIVER_BASES) api.bases.add(b);
    for (const u of [...PD2_UNIQUES, ...SUNDER_CHARMS, ...QUIVER_UNIQUES]) api.uniques.add(u);
    for (const w of QUIVER_RUNEWORDS) api.runewords.add(w);
    addAll(api.cubeRecipes, LARZUK_RECIPES, { after: 'sock_helm' });
    addAll(api.cubeRecipes, MAP_RECIPES, { before: 'pandemonium_keys' });
    addAll(api.cubeRecipes, CORRUPTION_RECIPES, { after: 'repair_any' });
    addAll(api.cubeRecipes, UBER_RECIPES, { before: 'cows_portal' });
    for (const t of PD2_CORRUPTION) api.corruption.add(t);
    for (const z of PD2_MAP_ZONES) api.mapZones.add(z);
    for (const a of PD2_MAP_AFFIXES) api.mapAffixes.add(a);
    // cartes d'endgame : génération, ouverture, butin, recettes, modificateurs de monde, boss de carte (règles nommées)
    registerEndgame(api);
    // formules de combat PD2 (résistances et immunités, vol de vie, coup écrasant, critiques, zone de mêlée, blessures ouvertes, froid)
    registerCombatRules(api);
    // règles PD2 des mercenaires (usure de l'équipement, dégâts contre les boss)
    registerMercRules(api);
    // règles des caractéristiques du personnage du jeu pd2 (plafond des résistances, score d'attaque et blocage de la classe)
    registerCharacterRules(api);
    // expérience selon l'écart de niveau du jeu pd2
    registerProgressionRules(api);
    // artisanat du jeu pd2 (toute base de l'emplacement, runes et propriétés fixes du wiki)
    registerCubeRules(api);
    // énigme de Larzuk : boîte à énigme fabriquée depuis le menu « Artisanat » (interface du mod), châsses jusqu'au maximum de la base
    registerPuzzle(api);
    // comportements PD2 des compétences (Sorcière : Inferno, Champ statique, Téléportation, Tempête de foudre, hydres, armures…)
    registerSkillRules(api);
    // bots : plans S13, cartes d'endgame, boîtes à énigme, seuils des tests de bots (lot M13)
    registerBotRules(api);
    // taux de butin et d'expérience du jeu pd2 (conforts de D2 Mobile et taux PD2 : cartes, orbes, énigme, charmes de brisure)
    api.rules.set('loot.rates', () => () => PD2_RATES);
    // catalogue de valeur du butin : charmes de brisure, Anneau mortel de Bul-Kathos, mots runiques PD2, éclat de Pierre-Monde, puis celui de la base
    api.rules.set('loot.value', (prev) => (kind, id) => {
      const own =
        kind === 'unique'
          ? PD2_VALUE.VALUE_UNIQUES[id]
          : kind === 'set'
            ? PD2_VALUE.VALUE_SET_ITEMS[id]
            : kind === 'runeword'
              ? PD2_VALUE.VALUE_RUNEWORDS[id]
              : kind === 'currency'
                ? PD2_VALUE.VALUE_CURRENCY[id]
                : undefined;
      return own ?? prev(kind, id);
    });
    // arbres PD2 S13 sur ceux de Diablo II (lot M9 : compétences ajoutées, retirées, déplacées ; prérequis, niveaux, textes, chiffres des
    // fichiers de classe d'avant les arbres vanilla), puis chiffres PD2 S13 du wiki (tables à 60 niveaux) : remplacent ces chiffres ;
    // synergies du même type remplacées
    applyTablePatch(api.skills, PD2_SKILLS_PATCH);
    api.skills.patchNumbers(PD2_NUMBERS);
    api.skills.patchSynergies(PD2_SYNERGIES);
    // anciennes sauvegardes (compétences renommées par les arbres S13) ; import .d2s : la table d'import, faite pour les arbres S13
    api.rules.set('skills.renames', () => () => PD2_SKILL_RENAMES);
    api.rules.set('skills.d2sImport', () => (_d2Id, tableId) => tableId);
    api.rules.set('skills.hardValue', () => (id, table, hard) => {
      const t = PD2_HARD[id]?.[table];
      if (!t) return 0;
      return t[Math.max(0, Math.min(t.length - 1, Math.floor(hard)))];
    });
    // réglages du mod (sous Settings.mods.pd2 ; autrefois à la racine des réglages, repris au chargement)
    api.settings.declare({
      autoPickupMaps: { app: 'all', values: ['none', 'all', 'rare', 'magic'], legacy: true },
      confirmCorrupt: { app: true, values: [true, false], legacy: true },
      confirmMapUpgrade: { app: true, values: [true, false], legacy: true },
    });
    api.i18n.add(EN);
  },
};

export default content;
