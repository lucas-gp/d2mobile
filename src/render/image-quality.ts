/**
 * Qualité d'image : logique pure (sans Pixi ni DOM) du filtre plein écran de la scène.
 * Réglages (netteté, lissage, ambiance) -> paramètres de shader ; identité = aucun filtre monté ;
 * garde de performance qui rétrograde le filtre quand les images deviennent lentes.
 */
import type { ImageMood, ImageScale, ImageSharpen } from '../sim/save';

export interface ImageParams {
  /** Mise à l'échelle : 0 = normale (rendu direct), 1 = douce (bilinéaire net), 2 = pixel-art (EPX) */
  scale: 0 | 1 | 2;
  /** Accentuation adaptative du contraste local, 0..1 */
  sharpen: number;
  /** Anti-crénelage des bords (FXAA léger) */
  fxaa: boolean;
  /** Exposition en diaphragmes (0 = neutre) */
  exposure: number;
  /** Contraste autour du gris moyen (1 = neutre) */
  contrast: number;
  /** Saturation (1 = neutre) */
  saturation: number;
  /** Température : positif = chaud (braise), négatif = froid (glace) */
  temperature: number;
  /** Teinte : positif = magenta, négatif = vert */
  tint: number;
  /** Assombrissement des bords, 0..1 */
  vignette: number;
}

export const SHARPEN_LEVELS: readonly number[] = [0, 0.25, 0.45, 0.65];

interface Mood {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  vignette: number;
  /** Netteté plancher apportée par l'ambiance (0..1) */
  sharpenFloor: number;
}

const NEUTRAL: Mood = { exposure: 0, contrast: 1, saturation: 1, temperature: 0, tint: 0, vignette: 0, sharpenFloor: 0 };

export const MOODS: Record<ImageMood, Mood> = {
  normal: NEUTRAL,
  dark: { exposure: -0.04, contrast: 1.1, saturation: 0.82, temperature: 0, tint: 0, vignette: 0.35, sharpenFloor: 0 },
  warm: { exposure: 0.02, contrast: 1.07, saturation: 1.06, temperature: 0.4, tint: 0.04, vignette: 0.22, sharpenFloor: 0 },
  cold: { exposure: -0.02, contrast: 1.08, saturation: 0.88, temperature: -0.42, tint: -0.03, vignette: 0.22, sharpenFloor: 0 },
  vivid: { exposure: 0.02, contrast: 1.06, saturation: 1.32, temperature: 0.03, tint: 0, vignette: 0, sharpenFloor: SHARPEN_LEVELS[1] },
};

export const MOOD_IDS = Object.keys(MOODS) as ImageMood[];

export function sanitizeSharpen(v: unknown): ImageSharpen {
  return v === 1 || v === 2 || v === 3 ? v : 0;
}
export function sanitizeScale(v: unknown): 0 | 1 | 2 {
  return v === 'soft' ? 1 : v === 'pixel' ? 2 : 0;
}
export function sanitizeMood(v: unknown): ImageMood {
  return typeof v === 'string' && v in MOODS ? (v as ImageMood) : 'normal';
}

/** Paramètres du shader pour des réglages (absents = neutres) */
export function imageParams(sharpen?: unknown, smooth?: unknown, mood?: unknown, scale?: unknown): ImageParams {
  const m = MOODS[sanitizeMood(mood)];
  return {
    scale: sanitizeScale(scale),
    sharpen: Math.max(SHARPEN_LEVELS[sanitizeSharpen(sharpen)], m.sharpenFloor),
    fxaa: smooth === true,
    exposure: m.exposure,
    contrast: m.contrast,
    saturation: m.saturation,
    temperature: m.temperature,
    tint: m.tint,
    vignette: m.vignette,
  };
}

/** Vrai quand le filtre ne changerait aucun pixel : il n'est alors pas monté du tout */
export function isIdentity(p: ImageParams): boolean {
  return p.scale === 0 && p.sharpen <= 0 && !p.fxaa && p.exposure === 0 && p.contrast === 1 && p.saturation === 1 && p.temperature === 0 && p.tint === 0 && p.vignette <= 0;
}

export function gradeIsNeutral(p: ImageParams): boolean {
  return p.exposure === 0 && p.contrast === 1 && p.saturation === 1 && p.temperature === 0 && p.tint === 0 && p.vignette <= 0;
}

/** Préréglages rapides du bouton en jeu : tous les réglages d'image d'un coup, avec des différences bien visibles */
export interface ImageSettingsLike {
  imageSharpen?: ImageSharpen;
  imageSmooth?: boolean;
  imageMood?: ImageMood;
  imageScale?: ImageScale;
}
export interface QuickPreset {
  id: 'off' | 'soft' | 'sharp' | 'cinema';
  label: string;
  values: Required<ImageSettingsLike>;
}
export const QUICK_PRESETS: readonly QuickPreset[] = [
  { id: 'off', label: 'Off', values: { imageSharpen: 0, imageSmooth: false, imageMood: 'normal', imageScale: 'normal' } },
  { id: 'soft', label: 'Doux', values: { imageSharpen: 0, imageSmooth: false, imageMood: 'normal', imageScale: 'soft' } },
  { id: 'sharp', label: 'Net', values: { imageSharpen: 2, imageSmooth: false, imageMood: 'vivid', imageScale: 'pixel' } },
  { id: 'cinema', label: 'Cinéma', values: { imageSharpen: 1, imageSmooth: false, imageMood: 'warm', imageScale: 'pixel' } },
];

/** Préréglage qui correspond exactement aux réglages (absents = neutres), sinon null (réglages personnalisés) */
export function quickPresetOf(s: ImageSettingsLike): QuickPreset | null {
  const v = {
    imageSharpen: sanitizeSharpen(s.imageSharpen),
    imageSmooth: s.imageSmooth === true,
    imageMood: sanitizeMood(s.imageMood),
    imageScale: (['normal', 'soft', 'pixel'] as const)[sanitizeScale(s.imageScale)],
  };
  return (
    QUICK_PRESETS.find((p) => p.values.imageSharpen === v.imageSharpen && p.values.imageSmooth === v.imageSmooth && p.values.imageMood === v.imageMood && p.values.imageScale === v.imageScale) ?? null
  );
}

/** Préréglage suivant du cycle Off, Doux, Net, Cinéma (réglages personnalisés : on repart de Doux) */
export function nextQuickPreset(s: ImageSettingsLike): QuickPreset {
  const cur = quickPresetOf(s);
  if (!cur) return QUICK_PRESETS[1];
  return QUICK_PRESETS[(QUICK_PRESETS.indexOf(cur) + 1) % QUICK_PRESETS.length];
}

export type GuardStep = 'light' | 'scale' | 'fxaa' | 'sharpen';

/**
 * Garde de performance : si l'intervalle moyen entre images dépasse `limitMs` pendant `windowMs` alors qu'un filtre
 * coûteux (éclairage dynamique, mise à l'échelle, lissage ou netteté) est actif, on coupe d'abord l'éclairage dynamique (un cran à la fois : Normal, Léger, Désactivé), puis on rétrograde la mise à l'échelle (pixel-art, douce, normale), puis le lissage, puis on baisse la netteté d'un cran à la fois.
 * L'état est celui de l'exécution : le réglage du joueur n'est jamais modifié. `reset()` quand les réglages changent.
 */
export class PerfGuard {
  /** Rétrogradations appliquées (lissage coupé ?, crans de netteté retirés) */
  fxaaOff = false;
  sharpenDrop = 0;
  scaleDrop = 0;
  /** Crans d'éclairage dynamique retirés (Normal -> Léger -> Désactivé) */
  lightDrop = 0;
  private sum = 0;
  private n = 0;
  private start = -1;
  private holdUntil = 0;
  constructor(
    private readonly limitMs = 26,
    private readonly windowMs = 3000,
    private readonly holdMs = 4000,
  ) {}

  reset(): void {
    this.fxaaOff = false;
    this.sharpenDrop = 0;
    this.scaleDrop = 0;
    this.lightDrop = 0;
    this.sum = 0;
    this.n = 0;
    this.start = -1;
    this.holdUntil = 0;
  }

  get degraded(): boolean {
    return this.fxaaOff || this.sharpenDrop > 0 || this.scaleDrop > 0 || this.lightDrop > 0;
  }

  /** Paramètres après rétrogradation */
  apply(p: ImageParams): ImageParams {
    let sharpen = p.sharpen;
    for (let i = 0; i < this.sharpenDrop; i++) sharpen = stepDown(sharpen);
    const scale = Math.max(0, p.scale - this.scaleDrop) as 0 | 1 | 2;
    return { ...p, scale, fxaa: p.fxaa && !this.fxaaOff, sharpen };
  }

  /**
   * Enregistre un intervalle d'image (ms) ; renvoie l'étape de rétrogradation si l'on vient d'en décider.
   * `p` = paramètres demandés (avant rétrogradation) ; `light` = niveau d'éclairage dynamique demandé (0 désactivé, 1 léger, 2 normal).
   */
  push(intervalMs: number, nowMs: number, p: ImageParams, light = 0): GuardStep | null {
    const cur = this.apply(p);
    const lightLeft = Math.max(0, light - this.lightDrop);
    const costly = lightLeft > 0 || cur.scale > 0 || cur.fxaa || cur.sharpen > 0;
    if (!costly || nowMs < this.holdUntil) {
      this.sum = 0;
      this.n = 0;
      this.start = -1;
      return null;
    }
    if (this.start < 0) this.start = nowMs;
    this.sum += Math.min(intervalMs, 250);
    this.n++;
    if (nowMs - this.start < this.windowMs) return null;
    const mean = this.sum / Math.max(1, this.n);
    this.sum = 0;
    this.n = 0;
    this.start = -1;
    if (mean <= this.limitMs) return null;
    this.holdUntil = nowMs + this.holdMs;
    if (lightLeft > 0) {
      this.lightDrop++;
      return 'light';
    }
    if (cur.scale > 0) {
      this.scaleDrop++;
      return 'scale';
    }
    if (cur.fxaa) {
      this.fxaaOff = true;
      return 'fxaa';
    }
    this.sharpenDrop++;
    return 'sharpen';
  }
}

function stepDown(v: number): number {
  for (let i = SHARPEN_LEVELS.length - 1; i >= 0; i--) if (SHARPEN_LEVELS[i] < v - 1e-6) return SHARPEN_LEVELS[i];
  return 0;
}
