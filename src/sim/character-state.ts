/**
 * État sauvegardé d'un personnage (module feuille de types). Les fonctions qui l'utilisent sont dans `character.ts`, qui le réexporte ;
 * les modules qui n'ont besoin que du type l'importent d'ici, sans dépendre de la logique du personnage.
 */
import type { MercId, MercSlot } from '../data/mercs';
import type { Difficulty, Slot } from '../data/types';
import type { ClassId } from '../data/classes';
import type { Item } from './item';
import type { LootFilterSettings } from './lootfilter';

export interface BeltSlot {
  kind: 'heal' | 'mana' | 'rejuv';
  tier: number;
  qty: number;
}

export interface Hotbar {
  primary: string;
  /** Compétence du clic droit (mode PC) ; absente des anciennes sauvegardes : attaque normale */
  secondary?: string;
  slots: (string | null)[];
}

export interface Progression {
  /** Runs complétées : clé `${runId}:${difficulty}` → nombre */
  completions: Record<string, number>;
  /** Récompenses uniques déjà reçues (points de compétence, résistances) */
  rewards: string[];
  highestDifficulty: Difficulty;
  mapTierMax: number;
  /** Temps de jeu cumulé (s) */
  playTime: number;
  /** Temps de jeu au premier passage de chaque étape (pour les mesures) */
  milestones: Record<string, number>;
  /** Points bonus gagnés (premiers passages) — nécessaires pour la réinitialisation */
  bonusSkillPoints: number;
  bonusStatPoints: number;
}

export interface CharacterState {
  name: string;
  classId: ClassId;
  level: number;
  xp: number;
  statPoints: number;
  skillPoints: number;
  /** Caractéristiques de base (classe + points alloués) */
  base: { str: number; dex: number; vit: number; ene: number };
  /** Points durs par compétence */
  skills: Record<string, number>;
  respecs: number;
  hotbar: Hotbar;
  equipment: Partial<Record<Slot, Item>>;
  inventory: (Item | null)[];
  /** Inventaire des charmes (PD2) : grille 10 × 4 ; seuls les charmes qui y sont rangés sont actifs. Absent des anciennes sauvegardes (migration v6) */
  charmInv: (Item | null)[];
  belt: BeltSlot[];
  /** Potions de jet (D2) : quantité par type (25 au plus) et type sélectionné pour le lancer ; absent des anciennes sauvegardes */
  throwPots?: Record<string, number>;
  throwSel?: string;
  gold: number;
  stash: (Item | null)[][];
  /** Coffre de cartes : cartes ramassées (objets `map`), 200 au plus ; absent des anciennes sauvegardes = vide */
  mapStash?: Item[];
  /** Onglet « matériaux » : runes, gemmes et orbes empilés (id de base → quantité) */
  materials: Record<string, number>;
  /** Les runes et gemmes ramassées prennent une case d'inventaire (comme Diablo II) au lieu d'aller directement dans l'onglet de runes ; faux pour les bots */
  looseRunes?: boolean;
  stashGold: number;
  cube: (Item | null)[];
  filter: LootFilterSettings;
  progression: Progression;
  /** Bonus permanents obtenus (résistances d'Anya, etc.) */
  bonuses: Record<string, number>;
  /** Mercenaire recruté (null : aucun) */
  merc?: MercState | null;
}

/** Mercenaire recruté : type, variante (aura ou élément), nom, état et équipement */
export interface MercState {
  type: MercId;
  variant: string;
  name: string;
  dead: boolean;
  equipment: Partial<Record<MercSlot, Item>>;
  /** Difficulté d'embauche (D2 : choisit la ligne de Hireling.txt ; absente : Normal, ou modèle qui ne l'enregistre pas) */
  hire?: number;
}
