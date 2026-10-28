/**
 * État d'interface des panneaux, regroupé par panneau (le reste de `Panels` : panneau affiché, sélection, onglet du coffre, glisser-déposer).
 * Ces états survivent aux reconstructions du DOM (`Panels.render`) ; ils ne sont jamais sauvegardés, sauf la qualité de fusion des cartes
 * (mémorisée sur l'appareil).
 */
import { HIGHLIGHT_COLORS, type HighlightCat } from '../sim/loot/highlight';
import type { StashCategory, StashHit, StashQuality } from '../sim/stash-search';
import type { MergeQuality } from '../sim/cube';
import type { CubeRecipe } from '../data/cube';
import type { SettingsCat } from './settings-catalog';

/** Filtre de butin : onglet, onglet Paliers (`tier*`) et onglet Surbrillance (`hl*`) */
export interface FilterUiState {
  tab: 'rules' | 'hl' | 'tiers';
  tierQuery: string;
  tierCat: HighlightCat | 'all';
  /** Filtre par palier : 'all', '0', '3', '4', '5' ou 'mod' (modifiés) */
  tierFilter: string;
  tierShown: number;
  tierSel: Set<string>;
  /** « Tout remettre par défaut » attend sa confirmation */
  tierConfirm: boolean;
  hlQuery: string;
  hlCat: HighlightCat | 'all';
  hlShown: number;
  /** Couleur des prochaines sélections */
  hlColor: number;
  /** Entrée dont la couleur se choisit */
  hlEdit: string | null;
}

export function newFilterUi(): FilterUiState {
  return {
    tab: 'rules',
    tierQuery: '',
    tierCat: 'all',
    tierFilter: 'all',
    tierShown: 70,
    tierSel: new Set<string>(),
    tierConfirm: false,
    hlQuery: '',
    hlCat: 'all',
    hlShown: 80,
    hlColor: HIGHLIGHT_COLORS[0],
    hlEdit: null,
  };
}

/** Coffre : recherche (texte, filtres rapides, vue, résultats ; vidée à la fermeture du coffre), envoi groupé et note éphémère */
export interface StashUiState {
  query: string;
  quality: Set<StashQuality>;
  category: Set<StashCategory>;
  view: 'list' | 'filters' | null;
  hits: StashHit[];
  /** « Tout au coffre » attend sa confirmation */
  ask: boolean;
  note: { text: string; until: number } | null;
  noteTimer: ReturnType<typeof setTimeout> | null;
}

export function newStashUi(): StashUiState {
  return { query: '', quality: new Set<StashQuality>(), category: new Set<StashCategory>(), view: null, hits: [], ask: false, note: null, noteTimer: null };
}

/** Cube horadrique : livre de recettes (catégorie, recette, sélection), notes du panneau et de la grille */
export interface CubeUiState {
  cat: CubeRecipe['category'];
  recipe: string | null;
  sel: number[];
  all: boolean;
  note: string;
  /** Note de la grille du Cube (onglets du coffre) */
  gridNote: string;
  /** Livre de recettes ouvert */
  book: boolean;
}

export function newCubeUi(): CubeUiState {
  return { cat: 'Runes', recipe: null, sel: [], all: false, note: '', gridNote: '', book: false };
}

/** Réglages : recherche, catégorie ouverte (relue du stockage local à chaque ouverture), rétablissement en attente de confirmation */
export interface SettingsUiState {
  query: string;
  resetAsk: SettingsCat | null;
  cat: SettingsCat | '' | null;
}

export function newSettingsUi(): SettingsUiState {
  return { query: '', resetAsk: null, cat: null };
}

/** Fusion des cartes du coffre de cartes : palier, qualité des cartes consommées (mémorisée sur l'appareil), fusion à confirmer */
export interface MergeUiState {
  tier: number;
  quality: MergeQuality;
  ask: { mode: 'upgrade' | 'same'; lots?: number } | null;
}

/** Clé de stockage local de la qualité de fusion */
export const MERGE_QUALITY_KEY = 'd2m.mergeq';

export function newMergeUi(): MergeUiState {
  return {
    tier: 1,
    quality: (() => {
      try {
        const v = localStorage.getItem(MERGE_QUALITY_KEY);
        return v === 'normalmagic' || v === 'notrare' ? v : 'normal';
      } catch {
        return 'normal';
      }
    })(),
    ask: null,
  };
}

/** Point de passage : Rush (boss et runs de farm) ou Campagne (zones d'un acte), difficulté et acte de la campagne, runs corrompues */
export interface WaypointUiState {
  mode: 'rush' | 'campaign';
  campDiff: number;
  campAct: string;
  /** Lancer les runs d'Enfer en zone corrompue (niveau 85) */
  corruptRun: boolean;
}

export function newWaypointUi(): WaypointUiState {
  return { mode: 'rush', campDiff: 0, campAct: 'act1', corruptRun: false };
}

/** Menus flottants de la colonne d'actions : menu ouvert, confirmation en attente, écouteurs installés, sertissage ouvert */
export interface MenuUiState {
  open: string | null;
  ask: string | null;
  listeners: boolean;
  corruptAsk: string | null;
  socketOpen: boolean;
}

export function newMenuUi(): MenuUiState {
  return { open: null, ask: null, listeners: false, corruptAsk: null, socketOpen: false };
}
