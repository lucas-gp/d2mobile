import { describe, expect, it } from 'vitest';
import {
  DYN_LEVELS,
  DYN_MIN_FACTOR,
  areaLightColor,
  dynLevel,
  edgeAmbient,
  effectiveDynamicLight,
  elemLightColor,
  sanitizeDynamicLight,
  selectLights,
  warmPlayerColor,
  type LightCandidate,
} from '../../src/render/dynamic-light';
import { PerfGuard, imageParams } from '../../src/render/image-quality';
import { withDefaultSettings } from '../../src/sim/save';

const cand = (x: number, y: number, kind: LightCandidate['kind'] = 'missile'): LightCandidate => ({ x, y, radius: 2, color: 0xffffff, intensity: 1, kind });

describe('éclairage dynamique : parties pures', () => {
  it('réglage absent = désactivé ; l’application met Léger', () => {
    expect(sanitizeDynamicLight(undefined)).toBe('off');
    expect(sanitizeDynamicLight('nimporte')).toBe('off');
    expect(withDefaultSettings().dynamicLight).toBeUndefined();
    expect(withDefaultSettings(null, true).dynamicLight).toBe('light');
    expect(withDefaultSettings({ dynamicLight: 'normal' }, true).dynamicLight).toBe('normal');
    expect(withDefaultSettings({ dynamicLight: 'zzz' as never }, true).dynamicLight).toBe('light');
    expect(dynLevel('off')).toBeNull();
  });

  it('le plafond est dur et garde les plus proches', () => {
    const cs: LightCandidate[] = [];
    for (let i = 0; i < 100; i++) cs.push(cand(i * 0.1, 0));
    const sel = selectLights(cs, 0, 0, 50, 24);
    expect(sel).toHaveLength(24);
    expect(Math.max(...sel.map((c) => c.x))).toBeLessThan(2.4 + 1e-9);
    expect(selectLights(cs, 0, 0, 50, DYN_LEVELS.light.cap)).toHaveLength(12);
    expect(selectLights(cs, 0, 0, 50, 0)).toEqual([]);
  });

  it('retire les lumières hors écran et ne modifie pas l’entrée', () => {
    const cs = [cand(100, 0), cand(1, 1), cand(-90, 5)];
    const copy = [...cs];
    const sel = selectLights(cs, 0, 0, 20, 24);
    expect(sel).toHaveLength(1);
    expect(sel[0].x).toBe(1);
    expect(cs).toEqual(copy);
  });

  it('à distance égale, projectiles avant objets avant alliés (ordre stable)', () => {
    const sel = selectLights([cand(3, 0, 'ally'), cand(0, 3, 'item'), cand(-3, 0, 'missile'), cand(0, -3, 'flash')], 0, 0, 50, 4);
    expect(sel.map((c) => c.kind)).toEqual(['flash', 'missile', 'item', 'ally']);
  });

  it('couleurs par élément', () => {
    expect(elemLightColor('fire')).toBe(0xff7a2a);
    expect(elemLightColor('cold')).toBe(0x7ab8ff);
    expect(elemLightColor('poison')).toBe(0x6ad04a);
    expect(elemLightColor('inconnu')).toBe(0xffffff);
    expect(elemLightColor(undefined)).toBe(0xffffff);
    expect(areaLightColor('fire_wall', 'fire')).toBe(0xff7a3a);
    expect(areaLightColor('blizzard', 'cold')).toBe(0x7ab8ff);
    expect(areaLightColor('autre', 'phys')).toBeNull();
  });

  it('le fond ne passe jamais sous le plancher de luminosité', () => {
    for (const lvl of Object.values(DYN_LEVELS)) expect(1 - lvl.edgeDark).toBeGreaterThanOrEqual(DYN_MIN_FACTOR);
    expect(DYN_LEVELS.light.edgeDark).toBeLessThanOrEqual(DYN_LEVELS.normal.edgeDark);
    const amb = 0xe6e0d6;
    const e = edgeAmbient(amb, 5); // demande excessive : bornée
    const ch = (c: number, sh: number) => (c >> sh) & 255;
    for (const sh of [16, 8, 0]) {
      expect(ch(e.base, sh)).toBeGreaterThanOrEqual(Math.floor(ch(amb, sh) * DYN_MIN_FACTOR) - 1);
      // base + fill restitue l'ambiance (au centre)
      expect(Math.abs(ch(e.base, sh) + ch(e.fill, sh) - ch(amb, sh))).toBeLessThanOrEqual(1);
    }
    expect(edgeAmbient(amb, 0).base).toBe(amb);
  });

  it('niveau effectif : rétrogradation Normal -> Léger -> Désactivé, qualité basse = désactivé', () => {
    expect(effectiveDynamicLight('normal', 0)).toBe('normal');
    expect(effectiveDynamicLight('normal', 1)).toBe('light');
    expect(effectiveDynamicLight('normal', 2)).toBe('off');
    expect(effectiveDynamicLight('light', 1)).toBe('off');
    expect(effectiveDynamicLight('light', 5)).toBe('off');
    expect(effectiveDynamicLight('normal', 0, false)).toBe('off');
    expect(effectiveDynamicLight(undefined, 0)).toBe('off');
  });

  it('lueur du joueur réchauffée sans sortir de la plage', () => {
    expect(warmPlayerColor(0xfff0dc, 0)).toBe(0xfff0dc);
    const w = warmPlayerColor(0xfff0dc, 1);
    expect((w >> 16) & 255).toBe(255);
    expect(w & 255).toBeLessThan(0xdc);
  });
});

describe('PerfGuard : l’éclairage dynamique se coupe avant les autres effets', () => {
  it('Normal -> Léger -> Désactivé avant toute baisse de qualité d’image', () => {
    const g = new PerfGuard(26, 1000, 100);
    const p = imageParams(2, true, 'dark', 'pixel');
    let t = 0;
    const run = (ms: number) => {
      let step = null;
      for (let i = 0; i < 80 && !step; i++) {
        t += ms;
        step = g.push(ms, t, p, 2);
      }
      return step;
    };
    expect(run(40)).toBe('light');
    expect(g.lightDrop).toBe(1);
    expect(g.scaleDrop).toBe(0);
    t += 200;
    expect(run(40)).toBe('light');
    expect(g.lightDrop).toBe(2);
    expect(g.scaleDrop).toBe(0);
    t += 200;
    expect(run(40)).toBe('scale');
    g.reset();
    expect(g.lightDrop).toBe(0);
  });

  it('sans éclairage demandé, comportement historique inchangé', () => {
    const g = new PerfGuard(26, 1000, 100);
    expect(g.push(10, 0, imageParams(), 0)).toBeNull();
    let step = null;
    for (let t = 0; t < 3000 && !step; t += 40) step = g.push(40, t, imageParams(0, false, 'normal', 'soft'));
    expect(step).toBe('scale');
  });
});
