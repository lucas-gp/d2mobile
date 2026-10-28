/**
 * Partie commune des panneaux plein écran : constantes de mise en page Diablo II, calculs d'échelle,
 * types (hôte, sélection, entrées d'action) et petits utilitaires. Module sans état d'instance.
 */
import type { UiHost, UiScreen } from '../mods/ui';
import { safely } from '../mods/ui';
import { reportError } from '../platform/errorlog';
import type { Game } from '../sim/game';
import type { Item } from '../sim/item';
import type { Slot } from '../data/types';
import { RUNE_BY_ID } from '../data/items/runes';
import { el } from './dom';
import { d2Ui } from './d2ui';
import { type Pack } from '../platform/packs';
import type { Settings } from '../sim/save';
import type { FilterPreset } from '../sim/character';
import { generateItem, makeStack } from '../sim/loot/itemgen';
import { Rng } from '../core/rng';
import { type MercSlot } from '../data/mercs';

export const SLOT_FR: Record<Slot, string> = {
  head: 'Tête',
  amulet: 'Amulette',
  mainhand: 'Arme',
  body: 'Torse',
  offhand: 'Bouclier / carquois',
  ring1: 'Anneau',
  gloves: 'Gants',
  belt: 'Ceinture',
  ring2: 'Anneau',
  boots: 'Bottes',
};

export interface PanelHost {
  game(): Game;
  close(): void;
  onSettingsChanged(s: Settings): void;
  /** Comparaison de la qualité d'image : true = rendu sans filtre */
  onImageCompare?(on: boolean): void;
  /** Moteur de rendu actif et message d'état (WebGPU indisponible, échec mémorisé…) */
  renderEngineInfo?(): { active: 'webgl' | 'webgpu'; status: { text: string; kind: 'info' | 'warn' } | null };
  /** Sauvegarde puis recharge le jeu (appliquer le moteur de rendu) */
  reloadGame?(): void;
  exportSave(): void;
  importSave(): void;
  resetSave(): void;
  haptic(kind: 'tap' | 'fail'): void;
  /** Bruit de manipulation d'un objet (équiper, ranger) : son D2 du type d'objet */
  itemSound(type: string | undefined): void;
  /** Message à l'écran (HUD) */
  message(text: string, color?: string): void;
  /** Conseils de prise en main : tout revoir */
  resetTips(): void;
  /** Écran de choix du personnage (un emplacement par classe) */
  switchCharacter(): void;
  /** Précharge un pack de contenu (zones et monstres) ; absent sans l'import D2 */
  downloadPack?(pack: Pack, onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<number>;
  /** État réel d'un pack dans le cache hors ligne (relu, pas seulement mémorisé) */
  packStatus?(pack: Pack): Promise<{ state: 'none' | 'partial' | 'ok'; have: number; total: number; purged: boolean }>;
  /** Journal d'erreurs : nombre d'entrées et export */
  errorLogCount?(): number;
  exportErrorLog?(): void;
  /** Charge les cartes d'une campagne (« a1 »…) à la demande */
  loadCampaign?(act: string, onProgress: (done: number, total: number) => void): Promise<number>;
  /** Identifiants de cartes d'une campagne dans l'index importé (vide sans import) */
  campaignMaps?(act: string): Promise<string[]>;
  /** Écran plein d'un mod (points d'insertion d'interface, src/mods/ui.ts) ; absent : posé sur les panneaux */
  modScreen?: UiScreen;
}

/** Retours de l'interface donnés à un mod (points d'insertion des panneaux) */
export function modUiHost(h: PanelHost): UiHost {
  return { message: (t, c) => h.message(t, c), haptic: (k) => h.haptic(k), itemSound: (t) => h.itemSound(t) };
}

/** Écran plein d'un mod depuis un panneau : celui de l'application, sinon posé sur le conteneur des panneaux */
export function modScreenOf(h: PanelHost, root: HTMLElement): UiScreen {
  return (
    h.modScreen ?? {
      open: (node) => {
        const wrap = el('div', { cls: 'mod-screen' }, node);
        root.append(wrap);
        return { close: () => wrap.remove() };
      },
    }
  );
}

/** Contributions d'un point d'insertion des panneaux, appelées une à une : l'erreur d'un mod est journalisée, le panneau reste */
export function modParts<T>(calls: readonly (() => T)[], fallback: T): T[] {
  return calls.map((f) => safely(f, fallback, (e) => reportError('mod (interface)', e)));
}

export type Sel =
  | { from: 'inv'; idx: number }
  | { from: 'eq'; slot: Slot }
  | { from: 'merc'; slot: MercSlot }
  | { from: 'stash'; tab: number; idx: number }
  | { from: 'vendor'; idx: number }
  | { from: 'back'; idx: number }
  | { from: 'cube'; idx: number }
  | { from: 'charm'; idx: number }
  | { from: 'mapstash'; idx: number }
  | null;

/**
 * Vues du coffre désignées par une valeur négative de `Panels.stashTab` (les valeurs ≥ 0 sont des pages d'objets ;
 * `STASH_TABS` et au-delà : coffre partagé). `cube` : grille du Cube sans onglet propre.
 */
export const STASH_VIEW = { runes: -1, cube: -2, gems: -3, mats: -4, maps: -5, guild: -6 } as const;

export const CHARM_SUM = ['life', 'mana', 'str', 'dex', 'vit', 'ene', 'resAll', 'resFire', 'resCold', 'resLight', 'resPoison', 'mf', 'gf', 'allSkills', 'fcr', 'frw', 'ias'];

/** Emplacements du panneau d'inventaire de Diablo II (image 320 × 432) : x, y, largeur, hauteur */
export const D2_EQ_RECT: Record<Slot, [number, number, number, number]> = {
  head: [134, 4, 56, 56],
  amulet: [206, 31, 28, 29],
  mainhand: [18, 46, 58, 114],
  body: [134, 74, 56, 87],
  offhand: [249, 46, 58, 115],
  ring1: [92, 176, 28, 29],
  gloves: [18, 176, 58, 59],
  belt: [134, 176, 58, 29],
  ring2: [206, 176, 28, 29],
  boots: [249, 176, 58, 59],
};
export const D2_GRID = { x: 18, y: 255, pitch: 29, cols: 10, size: 28 };

/** Échelle d'un panneau D2 pour qu'il tienne en hauteur dans l'écran (le panneau fait 432 px de haut dans le jeu d'origine) */
let bigCellsPref: Settings['bigCells'] = 'auto';
export function setBigCellsPref(v: Settings['bigCells']): void {
  bigCellsPref = v;
}
/** Grandes cases : seulement si le joueur les demande (« oui ») ; « auto » équivaut à « non » : le panneau agrandi débordait de l'écran sur mobile */
export function bigCellsOn(): boolean {
  return bigCellsPref === 'on';
}
/** Échelle minimale en mode grandes cases : une case D2 de 28 px devient ≥ 37 px à l'écran (le panneau défile alors verticalement) */
const BIG_CELL_K = 1.33;
/** Largeur prise par le cadre : insets du panneau (2 × 6), marges du corps (2 × 6) et espacement ; l'onglet de navigation est maintenant horizontal, en haut */
export const D2_CHROME_W = 12 + 12 + 6;
/** Hauteur de la barre d'onglets du haut (plus basse sur téléphone paysage) */
function d2HeaderH(vh = window.innerHeight): number {
  return vh <= 420 ? 32 : 44;
}
/** Largeur minimale réservée à la colonne « Objet » (infobulle) à côté d'un panneau D2 */
export const D2_INFO_MIN_W = 190;
/** Écart entre deux colonnes du corps d'un panneau D2 (px écran) */
export const D2_GAP = 6;
/** Largeur minimale réservée à la colonne latérale (gemmes, runes, cartes du coffre : contenu non mis à l'échelle) */
const D2_SIDE_MIN_W = 280;
/**
 * Échelle brute (sans plancher) : le panneau doit tenir en hauteur ET en largeur (écrans carrés ou pliables dépliés).
 * `w` = largeur totale, en pixels D2, des panneaux mis à l'échelle sur la rangée (320 pour un seul, 646 pour inventaire + coffre),
 * `h` = hauteur d'un panneau, `reserve` = largeur en pixels écran à laisser aux colonnes non mises à l'échelle (objet, actions…),
 * `mult` = réduction voulue sur l'ajustement en hauteur (panneaux doubles), `hdr` = hauteur de la barre d'onglets.
 */
export function d2RawScale(vw: number, vh: number, w: number, h: number, reserve: number, mult = 1, hdr = 44, vres = 0): number {
  const byH = Math.min(1.7, (vh - 12 - 12 - hdr - vres) / h) * mult;
  const byW = w > 0 ? (vw - D2_CHROME_W - reserve) / w : Infinity;
  return Math.min(byH, byW);
}
export function d2FitScale(vw: number, vh: number, w: number, h: number, reserve: number, mult = 1, hdr = 44, floor = 0.6, vres = 0): number {
  return Math.max(floor, d2RawScale(vw, vh, w, h, reserve, mult, hdr, vres));
}
function d2Scale(h: number, w: number, reserve: number, mult: number, floor = 0.6, vres = 0): number {
  const fit = d2FitScale(window.innerWidth, window.innerHeight, w, h, reserve, mult, d2HeaderH(), floor, vres);
  return bigCellsOn() ? Math.max(fit, BIG_CELL_K) : fit;
}

/** Largeur de la colonne d'actions (une seule colonne, toujours) : plus étroite sur petit écran */
function d2ActW(vw = window.innerWidth, vh = window.innerHeight): number {
  return vw >= 1000 && vh >= 560 ? 100 : 80;
}
/** Largeur minimale de la colonne Objet : étroite sur petit écran (l'infobulle défile) */
export function d2ItemMinW(vw = window.innerWidth): number {
  return vw >= 1000 ? D2_INFO_MIN_W : 150;
}
/** Échelle plancher des panneaux de la vue Coffre / Marchand : les 4 zones restent côte à côte, quitte à réduire */
const D2_STASH_FLOOR = 0.4;
/** Hauteur de la barre de boutons sous les panneaux Personnage et Coffre (taille réelle, 44 px au toucher) */
const STASH_BAR_H = 44;

/** Libellé court d'un bouton d'action (le libellé complet reste en infobulle) */
export function shortLabel(l: string): string {
  const m: Record<string, string> = {
    'Déposer au coffre': 'Déposer',
    'Prendre dans le sac': 'Prendre',
    'Prendre et équiper': 'Prendre+équiper',
    'Mettre dans le Cube': 'Cube',
    'Donner au mercenaire': 'Mercenaire',
    'Ranger dans les charmes': 'Ranger',
    'Ranger dans l’onglet': 'Ranger',
    'Retirer vers le sac': 'Retirer',
    'Ouvrir la carte': 'Ouvrir',
    'Sertir dans…': 'Sertir…',
    'Déposer / Prendre': 'Transférer',
    'Acheter / Vendre': 'Transférer',
    'Déjà surligné': 'Surligné',
  };
  return m[l] ?? l.replace(/ \(×\d+\)$/, '');
}

/**
 * Lot 305 (owner: "in portrait the menus are really not ergonomic": the D2 panel small at the bottom left, a large black space, the
 * actions cut at the right): a game mode played upright (rule `ui.orientation` 'any') on a phone held in portrait stacks a panel's
 * columns (style.css): the D2 panel at the top, as wide as the screen, the actions in rows under it, the item's text below them
 */
export function portraitStack(vw = window.innerWidth, vh = window.innerHeight): boolean {
  return vh > vw && vw < 700 && document.documentElement.classList.contains('any-orientation');
}
/** Height kept under a stacked D2 panel (px): the actions' rows (two of 40 px) and the item's or skill's text */
export const PSTACK_VRES = 210;

/** Disposition de la vue Inventaire / Coffre / Marchand : Personnage | Coffre | Objet | Actions toujours côte à côte, panneaux D2 réduits au besoin */
export function d2Layout(mode: string, twoD2: boolean, sideOnly: boolean): { mult: number; rowW: number; reserve: number; floor: number; vres: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (mode === 'inventory' && portraitStack(vw, vh)) return { mult: 1, rowW: 0, reserve: 0, floor: 0.4, vres: PSTACK_VRES };
  const w = d2Ui('panel-inv')?.w ?? 320;
  const gap = vw < 1000 ? 4 : D2_GAP;
  const fixed = d2ItemMinW(vw) + d2ActW(vw, vh);
  const mult = vh < 600 ? 1 : 0.8;
  if (mode === 'inventory') return { mult: 1, rowW: 0, reserve: fixed + 2 * gap, floor: D2_STASH_FLOOR, vres: 0 };
  // vue Coffre : barre de boutons (Trier, Tout au coffre) sous les panneaux, à taille réelle
  const vres = mode === 'stash' ? STASH_BAR_H + 4 : 0;
  const sideMin = vw < 1000 ? 260 : D2_SIDE_MIN_W;
  if (sideOnly) return { mult, rowW: w, reserve: fixed + sideMin + 3 * gap, floor: D2_STASH_FLOOR, vres };
  return { mult, rowW: twoD2 ? 2 * w + gap : w, reserve: fixed + 2 * gap, floor: D2_STASH_FLOOR, vres };
}

/** Panneau D2 posé à l'échelle : conteneur de la taille finale, image d'origine à l'intérieur (les enfants se placent en pixels D2) */
export function d2Panel(name: string, mult = 1, rowW = 0, reserve = 0, floor = 0.6, vres = 0, extraH = 0, stretch?: { at: number; strip: number }): { wrap: HTMLElement; inner: HTMLElement } | null {
  const img = d2Ui(name);
  if (!img) return null;
  const H = img.h + extraH;
  const k = d2Scale(H, rowW || img.w, reserve, mult, floor, vres);
  const inner = el('div', { cls: 'd2panel' });
  // --k : échelle du panneau, pour que les polices restent ≥ 11 px à l'écran (font-size: calc(11px / var(--k)))
  inner.style.cssText = `width:${img.w}px;height:${H}px;transform:scale(${k});--k:${k}`;
  if (stretch && extraH > 0) {
    // panneau rallongé sans déformer l'art : haut de l'image (jusqu'à `at`), bandes de grille répétées (`strip` px de l'image, à partir de `strip0`), bas de l'image
    const band = (y: number, h: number, srcY: number) => {
      const d = el('div', { cls: 'd2bg' });
      d.style.cssText = `top:${y}px;height:${h}px;width:${img.w}px;background-image:url("${img.url}");background-position:0 -${srcY}px`;
      return d;
    };
    inner.append(band(0, stretch.at, 0));
    for (let y = 0; y < extraH; y += stretch.strip) inner.append(band(stretch.at + y, Math.min(stretch.strip, extraH - y), stretch.at - stretch.strip));
    inner.append(band(stretch.at + extraH, img.h - stretch.at, stretch.at));
  } else inner.style.backgroundImage = `url("${img.url}")`;
  const wrap = el('div', { cls: 'd2wrap' }, inner);
  wrap.style.cssText = `width:${img.w * k}px;height:${H * k}px;flex:none`;
  return { wrap, inner };
}

/** Case D2 : rectangle placé dans le panneau */
export function d2Place(node: HTMLElement, x: number, y: number, w: number, h: number): void {
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  node.style.width = `${w}px`;
  node.style.height = `${h}px`;
}

/** Ligne d'un menu d'actions d'objet (« Artisanat ▾ », « Gérer ▾ ») */
export interface ActEntry {
  id: string;
  label: string;
  /** Coût ou stock, à droite */
  right?: string;
  /** Précision grisée sous le libellé (coût détaillé, conséquence) */
  note?: string;
  /** Faux : ligne grisée, `reason` en dit la cause */
  ok?: boolean;
  reason?: string;
  danger?: boolean;
  title?: string;
  /** Lignes de la confirmation (absente : action directe) */
  ask?: string[];
  okAct?: string;
  run: () => void;
  /** Fenêtre annexe (confirmation de la corruption), ajoutée à la barre d'actions */
  overlay?: () => HTMLElement | null;
}
/** Bouton de la colonne d'actions (8 emplacements fixes) */
export interface ColBtn {
  slot: 'use' | 'move' | 'cube' | 'corrupt' | 'craft' | 'merc' | 'hl' | 'drop';
  /** `data-act` (sélecteur stable des tests) */
  act: string;
  label: string;
  /** Petite ligne : prix, coût, stock */
  sub?: string;
  ok: boolean;
  /** Raison affichée quand le bouton est grisé */
  reason?: string;
  danger?: boolean;
  title?: string;
  /** Vente : appui long */
  hold?: boolean;
  run?: () => void;
  /** Liste flottante ouverte par le bouton */
  menu?: { key: string; sections: ActSection[]; cls: string };
}
export interface ActSection {
  title?: string;
  entries: ActEntry[];
  foot?: string;
  mapNote?: boolean;
}

export const SETTINGS_CAT_KEY = 'd2m.settings.cat';
export const PRESET_NAMES: Record<FilterPreset, string> = {
  all: 'Tout voir',
  leveling: 'Montée de niveau',
  standard: 'Standard',
  runewords: 'Mots runiques',
  endgame: 'Fin de partie',
  strict: 'Strict',
  runehunt: 'Chasse aux runes',
  custom: 'Personnalisé',
};

/** Objets d'exemple de l'aperçu du filtre (tirages fixes) */
let FILTER_SAMPLES: Item[] | null = null;
export function filterSamples(): Item[] {
  if (FILTER_SAMPLES) return FILTER_SAMPLES;
  const rng = new Rng('apercu-filtre');
  const gen = (base: string, q: Item['quality'], extra: Partial<Item> = {}) => Object.assign(generateItem(rng, base, 85, { forceQuality: q }), extra);
  FILTER_SAMPLES = [
    makeStack(rng, 'r03'),
    makeStack(rng, 'r09'),
    makeStack(rng, 'r15'),
    makeStack(rng, 'r23'),
    makeStack(rng, 'gem_ruby_1'),
    makeStack(rng, 'gem_ruby_3'),
    makeStack(rng, 'gem_ruby_4'),
    makeStack(rng, 'hp_potion'),
    gen('archon_plate', 'normal', { sockets: 4 }),
    gen('mage_plate', 'normal', { ethereal: true }),
    gen('crystal_sword', 'superior'),
    gen('wand', 'magic'),
    gen('tomb_wand', 'magic'),
    gen('eldritch_orb', 'magic'),
    gen('ring', 'magic'),
    gen('dusk_shroud', 'rare'),
    gen('grand_charm', 'magic'),
    gen('grim_shield', 'unique'),
  ];
  return FILTER_SAMPLES;
}

export function RUNE_NAME(rank: number): string {
  return Object.values(RUNE_BY_ID).find((r) => r.rank === rank)?.name ?? String(rank);
}

export function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
