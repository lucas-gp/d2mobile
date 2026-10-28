// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Règles des mercenaires de Project Diablo 2 (lot M8b : autrefois en dur dans src/sim/merc.ts, déplacées telles quelles ; lot M10d :
 * modèle des mercenaires, autrefois dans src/data/mercs.ts), branchées sur les règles nommées `merc.*` du jeu (src/mods/rules.ts) ; la
 * base a celles de Diablo II LoD 1.13c (src/mods/d2/mercs.ts).
 */
import type { MercModel, ModApi } from '../../../src/mods/api';
import { MERC_SKILL_BP, MERC_SKILL_TABLE, MERC_STATS, MERC_STAT_LVL0 } from '../data/mercs.gen';

/** Niveau du mercenaire pour les tableaux PD2 (2 à 98) */
const statLevel = (lvl: number): number => Math.max(MERC_STAT_LVL0, Math.min(98, Math.floor(lvl)));

/** Niveau « dur » d'une compétence ou d'une aura selon le niveau du mercenaire (0 : pas encore apprise) */
function skillLevel(skill: string, mlvl: number): number {
  const bp = MERC_SKILL_BP[skill];
  if (!bp) return skill === 'attack' ? 1 : 0;
  let l = 0;
  for (const [ml, sl] of bp) if (mlvl >= ml) l = sl;
  return l;
}

/** Variantes des anciennes sauvegardes (auras D2 du Guerrier du désert, « bash » du Barbare) */
const LEGACY_VARIANT: Record<string, Record<string, string>> = {
  desert: { prayer: 'defiance', holy_freeze: 'defiance', might: 'blessed_aim' },
  barbarian: { bash: 'combat' },
};

type Slot = ReturnType<MercModel['slots']>[number];
const MERC_SLOTS: Slot[] = ['mainhand', 'offhand', 'head', 'body', 'gloves', 'boots', 'belt'];
/** Gourdins (interdits aux Loups de fer et aux Barbares) et marteaux (interdits aux Loups de fer) */
const CLUBS = new Set(['club', 'spiked_club', 'cudgel', 'barbed_club', 'truncheon', 'tyrant_club']);
const HAMMERS = new Set(['war_hammer', 'maul', 'great_maul', 'battle_hammer', 'war_club', 'martel_de_fer', 'legendary_mallet', 'ogre_maul', 'thunder_maul']);

/**
 * Modèle PD2 : tableaux de statistiques du wiki par acte et par niveau (2 à 98), identiques quelle que soit la difficulté ; paliers de
 * compétences du wiki ; probabilités fixes des sous-types ; tous portent casque, plastron, gants, bottes et ceinture (liste d'équipement du
 * wiki : carquois de l'Éclaireuse, ni gourdins ni marteaux pour le Loup de fer, heaumes de Barbare) ; la difficulté d'embauche n'est
 * pas enregistrée.
 */
export const PD2_MERC_MODEL: MercModel = {
  statLevel,
  baseStats: (t, _variant, _hire, lvl) => {
    const tab = MERC_STATS[t.act as 1 | 2 | 3 | 4 | 5];
    const i = statLevel(lvl) - MERC_STAT_LVL0;
    return { hp: tab.hp[i], def: tab.def[i], str: tab.str[i], dex: tab.dex[i], ar: tab.ar[i], res: tab.res[i], dmin: tab.dmin[i], dmax: tab.dmax[i] };
  },
  skillLevel: (skill, lvl) => skillLevel(skill, statLevel(lvl)),
  skillTable: (skill, row, lvl) => {
    const r = MERC_SKILL_TABLE[skill]?.[row];
    if (!r || lvl <= 0) return 0;
    return r[Math.min(r.length - 1, lvl - 1)];
  },
  skillWeights: (_t, v) => v.skills,
  variantAlias: (typeId, id) => LEGACY_VARIANT[typeId]?.[id] ?? id,
  typeAlias: () => undefined,
  variantsAt: (variants) => variants,
  slots: (t) => MERC_SLOTS.filter((s) => s !== 'offhand' || t.shield || t.weapons.includes('bow')),
  slotFor: (t, b) => {
    const co = b.classOnly === undefined ? [] : Array.isArray(b.classOnly) ? b.classOnly : [b.classOnly];
    if (co.length && !co.some((c) => c === 'merc' || t.classItems.includes(c))) return null;
    switch (b.type) {
      case 'helm':
      case 'circlet':
        return 'head';
      case 'primal':
        return t.id === 'barbarian' ? 'head' : null;
      case 'armor':
        return 'body';
      case 'gloves':
      case 'boots':
      case 'belt':
        return b.type;
      case 'shield':
        return t.shield ? 'offhand' : null;
      case 'quiver':
        return t.weapons.includes('bow') ? 'offhand' : null; // l'Éclaireuse porte un carquois dans l'emplacement secondaire
    }
    if (!t.weapons.includes(b.type)) return null;
    if (t.id === 'ironwolf' && ((b.type === 'sword' && b.twoHanded) || (b.type === 'mace' && (CLUBS.has(b.id) || HAMMERS.has(b.id))))) return null;
    if (t.id === 'barbarian' && b.type === 'mace' && CLUBS.has(b.id)) return null;
    return 'mainhand';
  },
  hireOf: () => undefined,
};

export function registerMercRules(api: ModApi): void {
  // PD2 : les objets éthérés portés par un mercenaire ne s'usent pas (les autres s'usent)
  api.rules.set('merc.itemWear', () => (it) => !it.ethereal);
  // dégâts du mercenaire : pleins contre tous les monstres, boss compris
  api.rules.set('merc.bossDamagePct', () => () => 100);
  // modèle PD2 : tableaux et compétences du wiki, cinq actes, tous les emplacements d'équipement
  api.rules.set('merc.model', () => () => PD2_MERC_MODEL);
}
