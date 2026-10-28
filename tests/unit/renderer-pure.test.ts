/** Rendu sans WebGL : projection isométrique, conversions écran ↔ monde, tri de profondeur, couleurs d'objets, planches d'objets. */
import { describe, expect, it } from 'vitest';
import { GameRenderer, QUALITY_PRESETS, itemColor, objectSheets } from '../../src/render/renderer';
import { K, depthKey, isoX, isoY, screenDirToWorld, screenToWorld } from '../../src/render/iso';

interface Fake {
  zoom: number;
  width: number;
  height: number;
  camX: number;
  camY: number;
  shakeX: number;
  shakeY: number;
  propViews: { rect: [number, number, number, number]; occluder: boolean; key: number }[];
  worldToScreen(x: number, y: number, z?: number): { x: number; y: number };
  screenToWorld(x: number, y: number): { x: number; y: number };
  depthWithProps(x: number, y: number): number;
}
/** Un rendu sans constructeur (pas de WebGL) : seules les méthodes pures sont utilisées */
function renderer(o: Partial<Fake> = {}): Fake {
  const r = Object.create(GameRenderer.prototype) as Fake;
  return Object.assign(r, { zoom: 1, width: 800, height: 600, camX: 20, camY: 20, shakeX: 0, shakeY: 0, propViews: [] }, o);
}

describe('Projection isométrique 2:1', () => {
  it('un pas en x descend à droite, un pas en y descend à gauche (losange 2:1)', () => {
    expect(isoX(1, 0)).toBeGreaterThan(0);
    expect(isoX(0, 1)).toBeLessThan(0);
    expect(isoX(1, 0)).toBeCloseTo(-isoX(0, 1), 9);
    expect(isoY(1, 0)).toBeCloseTo(isoY(0, 1), 9);
    expect(Math.abs(isoX(1, 0))).toBeCloseTo(2 * Math.abs(isoY(1, 0)), 9);
  });
  it("l'altitude relève le point à l'écran sans le déplacer latéralement", () => {
    expect(isoY(3, 4, 1)).toBeLessThan(isoY(3, 4, 0));
    expect(isoX(3, 4)).toBe(isoX(3, 4));
  });
  it('screenToWorld est l’inverse exact de la projection au sol', () => {
    for (const [x, y] of [
      [0, 0],
      [10, 3],
      [-4, 7.5],
      [33.3, 21.1],
    ]) {
      const p = screenToWorld(isoX(x, y), isoY(x, y));
      expect(p.x).toBeCloseTo(x, 8);
      expect(p.y).toBeCloseTo(y, 8);
    }
  });
  it('screenDirToWorld : renvoie un vecteur unitaire, et la droite de l’écran = +x −y', () => {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-0.3, 0.9],
      [5, -5],
    ]) {
      const d = screenDirToWorld(dx, dy);
      expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 9);
    }
    const right = screenDirToWorld(1, 0);
    expect(right.x).toBeGreaterThan(0);
    expect(right.y).toBeLessThan(0);
    const down = screenDirToWorld(0, 1);
    expect(down.x).toBeGreaterThan(0);
    expect(down.y).toBeGreaterThan(0);
    expect(screenDirToWorld(0, 0)).toEqual({ x: 0, y: 0 });
  });
  it('la clé de profondeur croît avec x + y (plus bas à l’écran = devant)', () => {
    expect(depthKey(5, 5)).toBeGreaterThan(depthKey(4, 5));
    expect(depthKey(6, 4)).toBe(depthKey(5, 5));
    expect(K).toBeGreaterThan(40);
  });
});

describe('GameRenderer : conversions écran ↔ monde', () => {
  it('le point visé par la caméra est au centre de l’écran', () => {
    const r = renderer({ camX: 12, camY: 7 });
    const s = r.worldToScreen(12, 7);
    expect(s.x).toBeCloseTo(400, 6);
    expect(s.y).toBeCloseTo(300, 6);
  });
  it('aller-retour monde → écran → monde pour plusieurs zooms et caméras', () => {
    for (const zoom of [0.8, 1, 1.5, 2.2]) {
      const r = renderer({ zoom, camX: 31, camY: 12 });
      for (const [x, y] of [
        [31, 12],
        [35, 20],
        [10, 40],
      ]) {
        const s = r.worldToScreen(x, y);
        const w = r.screenToWorld(s.x, s.y);
        expect(w.x).toBeCloseTo(x, 6);
        expect(w.y).toBeCloseTo(y, 6);
      }
    }
  });
  it('le zoom agrandit les distances à l’écran proportionnellement', () => {
    const a = renderer({ zoom: 1 }).worldToScreen(25, 20);
    const b = renderer({ zoom: 2 }).worldToScreen(25, 20);
    expect(b.x - 400).toBeCloseTo(2 * (a.x - 400), 6);
    expect(b.y - 300).toBeCloseTo(2 * (a.y - 300), 6);
  });
  it('le tremblement d’écran décale à la fois la projection et son inverse', () => {
    const r = renderer({ shakeX: 6, shakeY: -4 });
    const s = r.worldToScreen(20, 20);
    expect(s.x).toBeCloseTo(406, 6);
    expect(s.y).toBeCloseTo(296, 6);
    const w = r.screenToWorld(s.x, s.y);
    expect(w.x).toBeCloseTo(20, 6);
    expect(w.y).toBeCloseTo(20, 6);
  });
  it('l’altitude z remonte le point à l’écran de façon linéaire', () => {
    const r = renderer();
    const y0 = r.worldToScreen(20, 20, 0).y;
    const y1 = r.worldToScreen(20, 20, 1).y;
    const y2 = r.worldToScreen(20, 20, 2).y;
    expect(y1).toBeLessThan(y0);
    expect(y0 - y1).toBeCloseTo(y1 - y2, 6);
  });
  it('un écran plus grand garde le centre au milieu', () => {
    const r = renderer({ width: 1920, height: 1080 });
    const s = r.worldToScreen(20, 20);
    expect(s.x).toBe(960);
    expect(s.y).toBe(540);
  });
});

describe('GameRenderer : tri de profondeur avec les décors', () => {
  const prop = { rect: [10, 10, 14, 14] as [number, number, number, number], occluder: true, key: 5000 };
  it('sans décor, la profondeur est la clé de base', () => {
    expect(renderer().depthWithProps(7, 9)).toBe(depthKey(7, 9));
  });
  it('un acteur devant l’empreinte d’un grand décor passe devant lui, même si sa clé de base est plus petite', () => {
    const r = renderer({ propViews: [prop] });
    // (15, 8) est à l'est de l'empreinte (x > x1) : base 1472 < 5000, il doit dépasser la clé du décor
    expect(depthKey(15, 8)).toBeLessThan(prop.key);
    expect(r.depthWithProps(15, 8)).toBe(prop.key + 1);
  });
  it('un acteur derrière ou dans l’empreinte garde sa profondeur d’origine', () => {
    const r = renderer({ propViews: [prop] });
    expect(r.depthWithProps(12, 12)).toBe(depthKey(12, 12)); // dans l'empreinte
    expect(r.depthWithProps(8, 8)).toBe(depthKey(8, 8)); // derrière (x et y avant l'empreinte)
  });
  it('un décor non occultant est ignoré', () => {
    const r = renderer({ propViews: [{ ...prop, occluder: false }] });
    expect(r.depthWithProps(15, 8)).toBe(depthKey(15, 8));
  });
  it('trop loin du décor, aucun effet', () => {
    const r = renderer({ propViews: [prop] });
    expect(r.depthWithProps(30, 8)).toBe(depthKey(30, 8));
    expect(r.depthWithProps(15, 25)).toBe(depthKey(15, 25));
  });
  it('un acteur déjà plus loin que la clé du décor n’est pas reculé', () => {
    const r = renderer({ propViews: [{ ...prop, key: 100 }] });
    expect(r.depthWithProps(15, 8)).toBe(depthKey(15, 8));
  });
  it('plusieurs décors se cumulent : on passe devant le plus haut', () => {
    const r = renderer({ propViews: [prop, { rect: [12, 6, 16, 12], occluder: true, key: 9000 }] });
    expect(r.depthWithProps(17, 9)).toBe(9001);
  });
});

describe('Rendu : couleurs d’objets, planches, qualité', () => {
  it('itemColor : qualité pour l’équipement, couleurs fixes pour potions, gemmes, monnaie, runes', () => {
    expect(itemColor({ base: 'long_bow', quality: 'unique' })).toBe(0xc7b377);
    expect(itemColor({ base: 'long_bow', quality: 'set' })).toBe(0x00ff00);
    expect(itemColor({ base: 'long_bow', quality: 'rare' })).toBe(0xffff64);
    expect(itemColor({ base: 'long_bow', quality: 'inconnue' })).toBe(0xffffff);
    expect(itemColor({ base: 'hp_potion', quality: 'normal' })).toBe(0xd03030);
    expect(itemColor({ base: 'mp_potion', quality: 'normal' })).toBe(0x3050e0);
    expect(itemColor({ base: 'gold', quality: 'normal' })).toBe(0xe8c060);
  });
  it('une rune élevée est plus vive qu’une rune basse', () => {
    const lo = itemColor({ base: 'r01', quality: 'normal' });
    const hi = itemColor({ base: 'r33', quality: 'normal' });
    expect(lo).toBe(0xffa860);
    expect(hi).toBe(0xff9020);
  });
  it('objectSheets : planche D2 d’abord, décor du jeu en repli ; PNJ de Cain unifiés ; types inconnus vides', () => {
    expect(objectSheets('chest')).toEqual(['obj_chest', 'prop_chest_prop']);
    expect(objectSheets('npc', 'cain2')).toEqual(['npc_cain']);
    expect(objectSheets('npc', 'akara')).toEqual(['npc_akara']);
    expect(objectSheets('barrel', undefined, 'urn')[0]).toBe('prop_tomb_urn');
    expect(objectSheets('barrel')[0]).toBe('obj_barrel');
    expect(objectSheets('portal', undefined, 'red')[0]).toBe('obj_portal_red');
    expect(objectSheets('portal')).toEqual(['obj_portal']);
    expect(objectSheets('quest', 'qchest1')[0]).toBe('obj_chest');
    expect(objectSheets('quest', 'malus')[0]).toBe('obj_shrine');
    expect(objectSheets('inconnu')).toEqual([]);
  });
  it('qualités graphiques : particules et résolution croissantes, lumières dynamiques coupées en « bas »', () => {
    const { low, medium, high } = QUALITY_PRESETS;
    expect(low.particles).toBeLessThan(medium.particles);
    expect(medium.particles).toBeLessThan(high.particles);
    expect(low.dynamicLights).toBe(false);
    expect(high.resolution).toBeGreaterThanOrEqual(medium.resolution);
  });
});
