/** Comparaison d'équipement du panneau d'inventaire : diffDerived, compareDeltas, isUpgrade (logique pure, sans DOM). */
import { describe, expect, it } from 'vitest';
import { compareDeltas, diffDerived, isUpgrade } from '../../src/ui/itemtext';
import { computeDerived, newCharacter } from '../../src/sim/character';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { addXp, xpToReach } from '../../src/sim/progression';
import type { ClassId } from '../../src/data/classes';
import type { Item } from '../../src/sim/item';
import type { DerivedStats } from '../../src/sim/derived';

const mk = (base: string, q: 'normal' | 'magic' | 'rare' | 'unique' = 'normal', seed = base): Item => generateItem(new Rng(`it-${seed}`), base, 60, { forceQuality: q });
const hero = (cls: ClassId = 'paladin', lvl = 40) => {
  const c = newCharacter('T', cls);
  addXp(c, xpToReach(lvl));
  c.base.str = c.base.dex = 200;
  return c;
};
const label = (d: { label: string; delta: number }[], l: string) => d.find((x) => x.label === l);
const fake = (o: Partial<DerivedStats> & Record<string, unknown> = {}): DerivedStats =>
  ({
    lifeMax: 100,
    manaMax: 50,
    defense: 10,
    res: { fire: 0, cold: 0, light: 0, poison: 0, phys: 0, magic: 0 },
    fcr: 0,
    fhr: 0,
    frw: 0,
    mf: 0,
    skillLevels: {},
    elemDmgPct: { fire: 0, cold: 0, light: 0, poison: 0, phys: 0, magic: 0 },
    ...o,
  }) as unknown as DerivedStats;

describe('diffDerived', () => {
  it('ne liste que les statistiques qui changent, avec l’unité', () => {
    const d = diffDerived(fake(), fake({ lifeMax: 130, res: { fire: 20, cold: 0, light: 0, poison: 0, phys: 0, magic: 0 } }));
    expect(d).toEqual([
      { label: 'Vie', delta: 30, unit: '' },
      { label: 'Rés. Feu', delta: 20, unit: ' %' },
    ]);
  });
  it('les pertes sont négatives ; aucune différence = liste vide', () => {
    expect(diffDerived(fake({ defense: 50 }), fake({ defense: 20 }))).toEqual([{ label: 'Défense', delta: -30, unit: '' }]);
    expect(diffDerived(fake(), fake())).toEqual([]);
  });
  it('arrondit à 0,1 près et masque un écart plus petit', () => {
    expect(diffDerived(fake({ mf: 10 }), fake({ mf: 10.04 }))).toEqual([]);
    expect(label(diffDerived(fake({ mf: 10 }), fake({ mf: 10.26 })), 'Magic find')!.delta).toBe(0.3);
  });
  it('niveaux de compétences : le plus grand écart d’une compétence, pas la somme', () => {
    const a = fake({ skillLevels: { fire_bolt: 2, ice_bolt: 2 } });
    const b = fake({ skillLevels: { fire_bolt: 3, ice_bolt: 3, blizzard: 1, nova: 1 } });
    expect(label(diffDerived(a, b), 'Niveaux de compétences')!.delta).toBe(1);
    const lose = fake({ skillLevels: { fire_bolt: 0 } });
    expect(label(diffDerived(a, lose), 'Niveaux de compétences')!.delta).toBe(-2);
  });
});

describe('compareDeltas', () => {
  it('une armure vaut plus de défense que rien ; l’objet comparé n’est pas modifié dans l’état du joueur', () => {
    const c = hero();
    const armor = mk('plate_mail', 'normal');
    const d = compareDeltas(armor, c);
    expect(label(d, 'Défense')!.delta).toBeGreaterThan(50);
    expect(c.equipment.body).toBeUndefined();
  });
  it('remplacer une armure meilleure par une pire donne un écart négatif', () => {
    const c = hero();
    c.equipment.body = mk('plate_mail', 'normal');
    const d = compareDeltas(mk('quilted_armor', 'normal'), c);
    expect(label(d, 'Défense')!.delta).toBeLessThan(0);
  });
  it('un objet qui ne s’équipe pas (potion) n’a pas de comparaison', () => {
    expect(compareDeltas(mk('hp_potion'), hero())).toEqual([]);
  });
  it('une arme à deux mains retire le bouclier porté : la défense du bouclier est perdue dans la comparaison', () => {
    const c = hero();
    c.equipment.offhand = mk('large_shield', 'normal');
    c.equipment.mainhand = mk('short_sword', 'normal');
    const withSwordShield = computeDerived(c, 0).defense;
    const d = compareDeltas(mk('great_sword', 'normal'), c);
    expect(withSwordShield).toBeGreaterThan(0);
    expect(label(d, 'Défense')!.delta).toBeLessThan(0);
    expect(c.equipment.offhand).toBeDefined(); // simulation seulement
  });
  it('un anneau va dans l’emplacement libre ; slotOverride force l’autre', () => {
    const c = hero();
    c.equipment.ring1 = mk('ring', 'magic', 'r1');
    const ring = mk('ring', 'magic', 'r2');
    const a = compareDeltas(ring, c);
    const b = compareDeltas(ring, c, 'ring1');
    expect(Array.isArray(a)).toBe(true);
    // le remplacement de ring1 ne peut pas faire mieux que l'ajout dans ring2 sur les statistiques positives
    const gainA = a.reduce((s, x) => s + x.delta, 0);
    const gainB = b.reduce((s, x) => s + x.delta, 0);
    expect(gainA).toBeGreaterThanOrEqual(gainB);
  });
});

describe('isUpgrade', () => {
  it('une grosse armure sur un personnage nu est une amélioration', () => {
    expect(isUpgrade(mk('plate_mail'), hero())).toBe(true);
  });
  it('une armure inférieure à celle déjà portée n’en est pas une', () => {
    const c = hero();
    c.equipment.body = mk('plate_mail');
    expect(isUpgrade(mk('quilted_armor'), c)).toBe(false);
  });
  it('un objet non équipable à cause de la classe (griffe pour un Paladin) n’est jamais une amélioration', () => {
    expect(isUpgrade(mk('katar'), hero('paladin'))).toBe(false);
  });
  it('trop exigeant en force : jamais une amélioration', () => {
    const c = hero();
    c.base.str = 10;
    expect(isUpgrade(mk('plate_mail'), c)).toBe(false);
  });
  it('un objet sans emplacement (potion) n’est pas une amélioration', () => {
    expect(isUpgrade(mk('hp_potion'), hero())).toBe(false);
  });
});
