import { describe, expect, it } from 'vitest';
import {
  MOODS,
  MOOD_IDS,
  PerfGuard,
  QUICK_PRESETS,
  nextQuickPreset,
  quickPresetOf,
  sanitizeScale,
  SHARPEN_LEVELS,
  imageParams,
  isIdentity,
  sanitizeMood,
  sanitizeSharpen,
} from '../../src/render/image-quality';
import { DEFAULT_SETTINGS, withDefaultSettings, APP_SETTINGS_DEFAULTS } from '../../src/sim/save';

describe('Qualité d’image : préréglages', () => {
  it('réglages absents ou « normal » = identité (aucun filtre monté)', () => {
    expect(isIdentity(imageParams())).toBe(true);
    expect(isIdentity(imageParams(0, false, 'normal'))).toBe(true);
    expect(isIdentity(imageParams(undefined, undefined, undefined))).toBe(true);
  });

  it('chaque réglage actif sort de l’identité', () => {
    expect(isIdentity(imageParams(1))).toBe(false);
    expect(isIdentity(imageParams(0, true))).toBe(false);
    for (const m of MOOD_IDS.filter((m) => m !== 'normal')) expect(isIdentity(imageParams(0, false, m)), m).toBe(false);
  });

  it('netteté croissante, valeurs invalides ramenées à Aucune', () => {
    const v = [0, 1, 2, 3].map((l) => imageParams(l).sharpen);
    expect(v).toEqual([...SHARPEN_LEVELS]);
    expect([...v].sort((a, b) => a - b)).toEqual(v);
    expect(sanitizeSharpen(7)).toBe(0);
    expect(sanitizeSharpen('2')).toBe(0);
    expect(sanitizeMood('rose')).toBe('normal');
  });

  it('sens des ambiances', () => {
    expect(MOODS.warm.temperature).toBeGreaterThan(0);
    expect(MOODS.cold.temperature).toBeLessThan(0);
    expect(MOODS.dark.contrast).toBeGreaterThan(1);
    expect(MOODS.dark.saturation).toBeLessThan(1);
    expect(MOODS.dark.vignette).toBeGreaterThan(0);
    expect(MOODS.vivid.saturation).toBeGreaterThan(1);
    expect(imageParams(0, false, 'vivid').sharpen).toBeGreaterThan(0);
    expect(imageParams(3, false, 'vivid').sharpen).toBe(SHARPEN_LEVELS[3]);
  });
});

describe('Qualité d’image : réglages sauvegardés', () => {
  it('absent par défaut (rien ne change)', () => {
    expect(DEFAULT_SETTINGS.imageSharpen).toBeUndefined();
    expect(APP_SETTINGS_DEFAULTS.imageMood).toBeUndefined();
    const s = withDefaultSettings(null, true);
    expect(isIdentity(imageParams(s.imageSharpen, s.imageSmooth, s.imageMood))).toBe(true);
  });
  it('valeurs corrompues assainies', () => {
    const s = withDefaultSettings({ imageSharpen: 9 as never, imageMood: 'x' as never, imageSmooth: 1 as never });
    expect(s.imageSharpen).toBe(0);
    expect(s.imageMood).toBe('normal');
    expect(s.imageSmooth).toBe(true);
    expect(withDefaultSettings({ imageSharpen: 2, imageMood: 'cold' }).imageMood).toBe('cold');
  });
});

describe('Qualité d’image : garde de performance (horloge simulée)', () => {
  const run = (g: PerfGuard, p: ReturnType<typeof imageParams>, ms: number, from: number, secs: number) => {
    const out: (string | null)[] = [];
    for (let t = from; t < from + secs * 1000; t += ms) out.push(g.push(ms, t, p));
    return out.filter(Boolean);
  };

  it('ne fait rien quand c’est fluide ou sans filtre coûteux', () => {
    const g = new PerfGuard();
    expect(run(g, imageParams(2, true), 16, 0, 20)).toEqual([]);
    expect(run(g, imageParams(0, false, 'dark'), 60, 30000, 20)).toEqual([]);
    expect(g.degraded).toBe(false);
  });

  it('coupe d’abord le lissage puis baisse la netteté cran par cran, avec temporisation', () => {
    const g = new PerfGuard();
    const p = imageParams(3, true, 'dark');
    const steps = run(g, p, 50, 0, 40);
    expect(steps[0]).toBe('fxaa');
    expect(steps.slice(1)).toEqual(['sharpen', 'sharpen', 'sharpen']);
    expect(g.apply(p).fxaa).toBe(false);
    expect(g.apply(p).sharpen).toBe(0);
    // l’ambiance reste appliquée
    expect(g.apply(p).saturation).toBe(MOODS.dark.saturation);
    expect(steps.length).toBe(4);
    // une seule rétrogradation par fenêtre : 3 s d’évaluation + 4 s de pause
    const g2 = new PerfGuard();
    expect(run(g2, p, 50, 0, 6)).toEqual(['fxaa']);
  });

  it('reset rend les réglages d’origine', () => {
    const g = new PerfGuard();
    const p = imageParams(2, true);
    run(g, p, 60, 0, 10);
    expect(g.degraded).toBe(true);
    g.reset();
    expect(g.apply(p)).toEqual(p);
  });
});

describe('Qualité d’image : mise à l’échelle et préréglages rapides', () => {
  it('mise à l’échelle : assainie, et non neutre', () => {
    expect([undefined, 'normal', 'soft', 'pixel', 'x'].map(sanitizeScale)).toEqual([0, 0, 1, 2, 0]);
    expect(isIdentity(imageParams(0, false, 'normal', 'soft'))).toBe(false);
    expect(isIdentity(imageParams(0, false, 'normal', 'normal'))).toBe(true);
  });

  it('le cycle fait Off, Doux, Net, Cinéma puis Off', () => {
    let s: Record<string, unknown> = {};
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const p = nextQuickPreset(s);
      seen.push(p.id);
      s = { ...p.values };
    }
    expect(seen).toEqual(['soft', 'sharp', 'cinema', 'off', 'soft']);
  });

  it('réglages personnalisés : le cycle repart de Doux ; chaque préréglage se reconnaît', () => {
    expect(quickPresetOf({ imageSharpen: 3 })).toBeNull();
    expect(nextQuickPreset({ imageSharpen: 3 }).id).toBe('soft');
    for (const p of QUICK_PRESETS) expect(quickPresetOf(p.values)?.id).toBe(p.id);
    expect(quickPresetOf({})?.id).toBe('off');
  });

  it('Off est l’identité, les autres préréglages sont bien distincts', () => {
    const ps = QUICK_PRESETS.map((p) => imageParams(p.values.imageSharpen, p.values.imageSmooth, p.values.imageMood, p.values.imageScale));
    expect(isIdentity(ps[0])).toBe(true);
    for (const p of ps.slice(1)) expect(isIdentity(p)).toBe(false);
    expect(new Set(ps.map((p) => JSON.stringify(p))).size).toBe(ps.length);
  });

  it('la garde rétrograde la mise à l’échelle avant le lissage et la netteté', () => {
    const g = new PerfGuard();
    const p = imageParams(2, true, 'normal', 'pixel');
    const steps: (string | null)[] = [];
    for (let t = 0; t < 60000; t += 50) steps.push(g.push(50, t, p));
    expect(steps.filter(Boolean)).toEqual(['scale', 'scale', 'fxaa', 'sharpen', 'sharpen']);
    expect(g.apply(p).scale).toBe(0);
  });
});
