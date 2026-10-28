import { describe, expect, it } from 'vitest';
import { lootTier, SHOW_EXCEPTIONAL, SHOW_HIGH_RUNE, SHOW_VALUABLE } from '../../src/sim/loot/filter';
import { makeStack } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { AnnounceQueue } from '../../src/ui/announce-queue';
import { d2FitScale, d2RawScale, D2_CHROME_W, D2_INFO_MIN_W, D2_GAP } from '../../src/ui/panels';
import type { Item } from '../../src/sim/item';
import { withoutPd2 } from '../needs-pd2';

const rng = new Rng('tier');
const stack = (id: string): Item => makeStack(rng, id, 1);
const gear = (base: string, quality: Item['quality']): Item => ({ uid: 'u', base, quality, ilvl: 80, sockets: 0, socketed: [] });

describe('lootTier : grands charmes à +1 branche de compétences', () => {
  it('exceptionnel pour un grand charme bleu avec +1 à une branche (ex. Feu) ; sans compétence ni modificateur : rien', () => {
    const gc = (id: string): Item => ({ ...gear('grand_charm', 'magic'), affixes: [{ id, values: [1] }] });
    expect(lootTier(gc('fire_tree_1'))).toBe(SHOW_EXCEPTIONAL);
    expect(lootTier(gc('light_tree_1'))).toBe(SHOW_EXCEPTIONAL);
    const rich: Item = {
      ...gc('fire_tree_1'),
      affixes: [
        { id: 'fire_tree_1', values: [1] },
        { id: 'of_the_colossus', values: [60] },
        { id: 'prismatic', values: [25] },
      ],
    };
    expect(lootTier(rich)).toBe(SHOW_EXCEPTIONAL);
    expect(lootTier({ ...gear('grand_charm', 'magic'), affixes: [] })).toBe(0);
  });
});

describe('lootTier : palier de rareté unique', () => {
  it('runes : HR >= Vex, exceptionnelles Um..Gul, valeur Lem/Pul, le reste 0', () => {
    expect(lootTier(stack('r26'))).toBe(SHOW_HIGH_RUNE);
    expect(lootTier(stack('r33'))).toBe(SHOW_HIGH_RUNE);
    expect(lootTier(stack('r25'))).toBe(SHOW_EXCEPTIONAL);
    expect(lootTier(stack('r22'))).toBe(SHOW_EXCEPTIONAL);
    expect(lootTier(stack('r20'))).toBe(SHOW_VALUABLE);
    expect(lootTier(stack('r09'))).toBe(0);
  });
  it.skipIf(withoutPd2)('monnaies : éclats et essences exceptionnels, or et clé sans palier', () => {
    expect(lootTier(stack('worldstone_shard'))).toBe(SHOW_EXCEPTIONAL);
    expect(lootTier(stack('essence_twisted'))).toBe(SHOW_EXCEPTIONAL);
    expect(lootTier(stack('orb_arcane'))).toBe(SHOW_VALUABLE);
    expect(lootTier(stack('gold'))).toBe(0);
    expect(lootTier(stack('key'))).toBe(0);
  });
  it('uniques et sets hors catalogue : de valeur seulement sur base élite de niveau >= 60, sinon aucun palier', () => {
    expect(lootTier(gear('archon_staff', 'unique'))).toBe(SHOW_VALUABLE);
    expect(lootTier(gear('ring', 'unique'))).toBe(0);
    expect(lootTier(gear('war_staff', 'unique'))).toBe(0);
    expect(lootTier(gear('archon_staff', 'set'))).toBe(SHOW_VALUABLE);
    expect(lootTier(gear('war_staff', 'set'))).toBe(0);
    expect(lootTier(gear('archon_staff', 'rare'))).toBe(0);
  });
});

describe('AnnounceQueue : file d’annonces', () => {
  const a = (key: string, prio = 3) => ({ key, text: key, prio });
  it('3 visibles au plus, doublons regroupés', () => {
    const q = new AnnounceQueue();
    for (const k of ['a', 'b', 'c', 'd']) q.push(a(k), 0);
    expect(q.visible.map((v) => v.key)).toEqual(['a', 'b', 'c']);
    q.push(a('a'), 100);
    expect(q.visible[0].count).toBe(2);
    q.push(a('d'), 100);
    expect(q.pending[0].count).toBe(2);
  });
  it('une annonce reste lisible au moins 1,6 s avant d’être remplacée, les plus rares d’abord', () => {
    const q = new AnnounceQueue();
    for (const k of ['a', 'b', 'c']) q.push(a(k), 0);
    q.push(a('low', 1), 0);
    q.push(a('hr', 5), 0);
    q.tick(1500);
    expect(q.visible.map((v) => v.key)).toEqual(['a', 'b', 'c']);
    q.tick(1700);
    expect(q.visible.map((v) => v.key)).toContain('hr');
    expect(q.visible.length).toBeLessThanOrEqual(3);
    expect(q.visible.every((v) => v.key !== 'low')).toBe(true);
  });
  it('tout expire et la file devient inactive', () => {
    const q = new AnnounceQueue();
    for (let i = 0; i < 8; i++) q.push(a(`k${i}`), 0);
    for (let t = 0; t <= 20000; t += 250) q.tick(t);
    expect(q.idle).toBe(true);
  });
});

describe('d2FitScale : tient en largeur et en hauteur', () => {
  it('écran carré : plus petit que l’échelle fixée par la hauteur', () => {
    const byH = d2FitScale(2000, 800, 320, 432, 0);
    const sq = d2FitScale(600, 800, 320, 432, D2_INFO_MIN_W);
    expect(sq).toBeLessThan(byH);
    expect(sq * 320 + D2_CHROME_W + D2_INFO_MIN_W).toBeLessThanOrEqual(600);
  });
  it('largeur de panneau paramétrée : deux panneaux (coffre) tiennent avec le menu et la colonne d’infos', () => {
    const row = 2 * 320 + D2_GAP;
    for (const [vw, vh] of [
      [900, 800],
      [1000, 900],
      [840, 900],
      [1280, 720],
    ] as const) {
      const k = d2FitScale(vw, vh, row, 432, D2_INFO_MIN_W + D2_GAP, 0.8);
      expect(k * row + D2_CHROME_W + D2_INFO_MIN_W + D2_GAP).toBeLessThanOrEqual(vw + 0.001);
      expect(k * 432).toBeLessThanOrEqual(vh - 24 - 44 + 0.001);
    }
    // un panneau seul est plus grand qu'une rangée de deux
    expect(d2FitScale(1000, 900, 320, 432, D2_INFO_MIN_W)).toBeGreaterThan(d2FitScale(1000, 900, 646, 432, D2_INFO_MIN_W, 0.8));
  });
  it('barre d’onglets horizontale : la hauteur est réduite de la barre, la largeur du menu vertical est rendue', () => {
    expect(D2_CHROME_W).toBe(30);
    expect(d2RawScale(740, 360, 320, 432, D2_INFO_MIN_W, 1, 38)).toBeCloseTo((360 - 24 - 38) / 432, 5);
    // sac + coffre côte à côte ne tiennent plus sur téléphone paysage : l'échelle brute passe sous le plancher de 0,6
    expect(d2RawScale(740, 360, 646, 432, 190 + 176 + 12, 0.8, 38)).toBeLessThan(0.72);
  });
  it('ne régresse pas : PC 1920x1080 inchangé (plafond 1,7 puis 0,8), paysage 740x360 ≈ 0,8', () => {
    expect(d2FitScale(1920, 1080, 646, 432, D2_INFO_MIN_W + D2_GAP, 0.8)).toBeCloseTo(1.36, 5);
    expect(d2FitScale(1920, 1080, 320, 432, D2_INFO_MIN_W)).toBe(1.7);
    expect(d2FitScale(740, 360, 320, 432, D2_INFO_MIN_W)).toBeCloseTo(0.676, 2);
  });
  it('plancher à 0,6 sur très petit écran (le corps défile alors)', () => {
    expect(d2FitScale(390, 844, 646, 432, D2_INFO_MIN_W + D2_GAP, 0.8)).toBe(0.6);
  });
});
