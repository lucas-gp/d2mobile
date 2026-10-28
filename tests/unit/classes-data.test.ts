/** Classes : tables de vie/mana, paliers FCR/FHR/FBR, arbres, restrictions d'objets par classe. */
import { describe, expect, it } from 'vitest';
import { CLASSES, CLASS_IDS, STAT_CLASS, TREES, TREE_CLASS, classCanUse, classOf, classOnlyList, isMercOnly, mercCanUse, type ClassId } from '../../src/data/classes';
import { computeDerived, canEquip, newCharacter } from '../../src/sim/character';
import { fbrFrames, fcrFrames, fhrFrames, nextFcrBreakpoint, nextFhrBreakpoint } from '../../src/sim/breakpoints';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { addXp, xpToReach } from '../../src/sim/progression';

const make = (cls: ClassId, level = 1) => {
  const c = newCharacter('T', cls);
  if (level > 1) addXp(c, xpToReach(level));
  c.level = Math.max(c.level, level);
  return c;
};

describe('Classes : vie et mana', () => {
  it.each(CLASS_IDS)('%s : vie et mana de départ = valeurs de la classe, sans objet', (id) => {
    const d = computeDerived(make(id), 0);
    expect(d.lifeMax).toBe(Math.round(CLASSES[id].life));
    expect(d.manaMax).toBe(Math.round(CLASSES[id].mana));
  });
  it.each(CLASS_IDS)('%s : chaque niveau ajoute la vie et le mana par niveau de la classe', (id) => {
    const cls = CLASSES[id];
    const c = make(id);
    c.level = 41; // 40 niveaux : les fractions (1,5 ; 1,75) se cumulent
    const d = computeDerived(c, 0);
    expect(d.lifeMax).toBe(Math.round(cls.life + 40 * cls.lifePerLevel));
    expect(d.manaMax).toBe(Math.round(cls.mana + 40 * cls.manaPerLevel));
  });
  it.each(CLASS_IDS)('%s : un point de vitalité / énergie vaut la valeur propre à la classe', (id) => {
    const cls = CLASSES[id];
    const c = make(id);
    const d0 = computeDerived(c, 0);
    c.base.vit += 10;
    c.base.ene += 10;
    const d1 = computeDerived(c, 0);
    expect(d1.lifeMax - d0.lifeMax).toBe(Math.round(10 * cls.lifePerVit));
    expect(d1.manaMax - d0.manaMax).toBeLessThanOrEqual(10 * cls.manaPerEne + 1);
    expect(d1.manaMax - d0.manaMax).toBeGreaterThanOrEqual(10 * cls.manaPerEne - 1);
  });
  it('le Barbare gagne plus de vie par vitalité que la Sorcière, qui a le plus de mana de départ', () => {
    expect(CLASSES.barbarian.lifePerVit).toBeGreaterThan(CLASSES.sorceress.lifePerVit);
    expect(CLASSES.sorceress.mana).toBe(Math.max(...CLASS_IDS.map((i) => CLASSES[i].mana)));
    expect(CLASSES.barbarian.life).toBeGreaterThan(CLASSES.sorceress.life);
  });
  it('classOf retombe sur la Sorcière pour un identifiant inconnu ou absent', () => {
    expect(classOf(undefined).id).toBe('sorceress');
    expect(classOf('ninja').id).toBe('sorceress');
    expect(classOf('paladin').id).toBe('paladin');
  });
});

describe('Classes : paliers de vitesse', () => {
  it.each(CLASS_IDS)('%s : paliers croissants, images décroissantes, départ à 0 %%', (id) => {
    for (const t of [CLASSES[id].fcr, CLASSES[id].fhr, CLASSES[id].fbr]) {
      expect(t[0][0]).toBe(0);
      for (let i = 1; i < t.length; i++) {
        expect(t[i][0]).toBeGreaterThan(t[i - 1][0]);
        expect(t[i][1]).toBeLessThan(t[i - 1][1]);
      }
    }
  });
  it('valeurs D2 de la Sorcière : 9 % → 12 images, 105 % → 8, 200 % → 7 ; juste sous un palier, rien ne change', () => {
    expect(fcrFrames(0, 'sorceress')).toBe(13);
    expect(fcrFrames(8, 'sorceress')).toBe(13);
    expect(fcrFrames(9, 'sorceress')).toBe(12);
    expect(fcrFrames(104, 'sorceress')).toBe(9);
    expect(fcrFrames(105, 'sorceress')).toBe(8);
    expect(fcrFrames(999, 'sorceress')).toBe(7);
    expect(fhrFrames(86, 'sorceress')).toBe(7);
    expect(fbrFrames(48, 'sorceress')).toBe(5);
  });
  it('palier suivant : prochain seuil strictement supérieur, nul au dernier', () => {
    expect(nextFcrBreakpoint(0, 'sorceress')).toBe(9);
    expect(nextFcrBreakpoint(9, 'sorceress')).toBe(20);
    expect(nextFcrBreakpoint(200, 'sorceress')).toBeNull();
    expect(nextFhrBreakpoint(280, 'sorceress')).toBeNull();
  });
  it('les classes lanceuses incantent plus vite que le Barbare à bonus égal', () => {
    expect(fcrFrames(0, 'sorceress')).toBeLessThanOrEqual(fcrFrames(0, 'barbarian'));
  });
});

describe('Classes : arbres et statistiques', () => {
  it.each(CLASS_IDS)('%s : 3 arbres distincts qui lui appartiennent, statistique de classe associée', (id) => {
    const cls = CLASSES[id];
    expect(new Set(cls.trees).size).toBe(3);
    for (const t of cls.trees) expect(TREE_CLASS[t]).toBe(id);
    expect(STAT_CLASS[cls.classStat]).toBe(id);
    expect(cls.trees).toContain(cls.defaultTree);
    for (const t of cls.trees) expect(STAT_CLASS[TREES[t].stat]).toBe(id);
  });
  it('21 arbres au total, aucun partagé', () => {
    expect(Object.keys(TREES)).toHaveLength(21);
  });
});

describe('Restrictions de classe des objets', () => {
  it('classOnlyList / classCanUse / mercCanUse / isMercOnly selon les formes de la liste', () => {
    expect(classOnlyList({})).toEqual([]);
    expect(classOnlyList({ classOnly: 'druid' })).toEqual(['druid']);
    expect(classCanUse({}, 'barbarian')).toBe(true);
    expect(classCanUse({ classOnly: 'druid' }, 'druid')).toBe(true);
    expect(classCanUse({ classOnly: 'druid' }, 'paladin')).toBe(false);
    expect(classCanUse({ classOnly: ['amazon', 'merc'] }, 'amazon')).toBe(true);
    expect(classCanUse({ classOnly: ['amazon', 'merc'] }, 'sorceress')).toBe(false);
    expect(mercCanUse({})).toBe(true);
    expect(mercCanUse({ classOnly: ['amazon', 'merc'] })).toBe(true);
    expect(mercCanUse({ classOnly: 'druid' })).toBe(false);
    expect(isMercOnly({ classOnly: ['merc'] })).toBe(true);
    expect(isMercOnly({ classOnly: ['amazon', 'merc'] })).toBe(false);
    expect(isMercOnly({})).toBe(false);
  });
  it('canEquip : armes de classe réservées (griffe → Assassin, orbe → Sorcière, sceptre → Paladin, pelage → Druide)', () => {
    const it = (b: string) => generateItem(new Rng(`cl-${b}`), b, 1, { forceQuality: 'normal' });
    const can = (cls: ClassId, b: string) => {
      const c = make(cls, 90);
      c.base.str = c.base.dex = 500;
      return canEquip(c, it(b)).ok;
    };
    for (const id of CLASS_IDS) {
      expect(can(id, 'katar')).toBe(id === 'assassin');
      expect(can(id, 'eagle_orb')).toBe(id === 'sorceress');
      expect(can(id, 'scepter')).toBe(id === 'paladin');
      expect(can(id, 'wolf_head')).toBe(id === 'druid');
      expect(can(id, 'preserved_head')).toBe(id === 'necromancer');
      expect(can(id, 'jawbone_cap')).toBe(id === 'barbarian');
      expect(can(id, 'long_bow')).toBe(id === 'amazon');
      expect(can(id, 'spear')).toBe(id === 'amazon' || id === 'barbarian');
    }
  });
  it('canEquip : le message de refus nomme la classe autorisée', () => {
    const c = make('sorceress', 90);
    const r = canEquip(c, generateItem(new Rng('x'), 'katar', 1, { forceQuality: 'normal' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain(CLASSES.assassin.name);
  });
});
