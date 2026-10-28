/** Sertissage, mots runiques, Cube et corruption : règles et atomicité. */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { Game } from '../../src/sim/game';
import { generateItem } from '../../src/sim/loot/itemgen';
import { validateItem } from '../../src/sim/loot/validate';
import { itemFinal } from '../../src/sim/itemstats';

function staff(sockets: number, quality: 'normal' | 'magic' = 'normal') {
  const it = generateItem(new Rng('staff'), 'short_staff', 20, { forceQuality: quality });
  it.sockets = sockets;
  return it;
}

describe('Sertissage et mots runiques', () => {
  it('Tir + Ral dans un bâton à 2 châsses forme « Feuille », valeurs tirées, objet valide', () => {
    const g = new Game();
    const c = g.character;
    c.inventory[0] = staff(2);
    c.materials.r03 = 1;
    c.materials.r08 = 1;
    expect(g.socket({ invIndex: 0 }, { material: 'r03' }).ok).toBe(true);
    const r = g.socket({ invIndex: 0 }, { material: 'r08' });
    expect(r.runeword).toBe('rw_leaf');
    const it = c.inventory[0]!;
    expect(it.quality).toBe('runeword');
    expect(validateItem(it)).toEqual([]);
    expect(itemFinal(it).stats.get('fireSkills')).toBe(3);
    expect(c.materials.r03 ?? 0).toBe(0);
  });

  it('mauvais ordre, base magique ou châsses en trop : pas de mot runique', () => {
    const g = new Game();
    const c = g.character;
    c.inventory[0] = staff(2);
    c.inventory[1] = staff(2, 'magic');
    c.inventory[2] = staff(3);
    c.materials.r03 = 3;
    c.materials.r08 = 3;
    g.socket({ invIndex: 0 }, { material: 'r08' });
    expect(g.socket({ invIndex: 0 }, { material: 'r03' }).runeword).toBeUndefined();
    g.socket({ invIndex: 1 }, { material: 'r03' });
    expect(g.socket({ invIndex: 1 }, { material: 'r08' }).runeword).toBeUndefined();
    g.socket({ invIndex: 2 }, { material: 'r03' });
    expect(g.socket({ invIndex: 2 }, { material: 'r08' }).runeword).toBeUndefined();
  });

  it('refus atomique : sans châsse libre ou sans rune, rien n’est consommé', () => {
    const g = new Game();
    const c = g.character;
    c.inventory[0] = staff(1);
    c.materials.r01 = 2;
    expect(g.socket({ invIndex: 0 }, { material: 'r01' }).ok).toBe(true);
    expect(g.socket({ invIndex: 0 }, { material: 'r01' }).ok).toBe(false);
    expect(c.materials.r01).toBe(1);
    expect(g.socket({ invIndex: 0 }, { material: 'r09' }).ok).toBe(false);
  });
});

import { CUBE_RECIPES, craftSlot } from '../../src/data/cube';
import { BASE_BY_ID } from '../../src/data/items/bases';
import { corruptItem } from '../../src/sim/corruption';
import { itemAccepted, upgradeTarget } from '../../src/sim/cube';
import { withoutPd2 } from '../needs-pd2';
import { RULES } from '../../src/mods/rules';
import { TYPE_GROUPS, type ItemBase } from '../../src/data/types';

/** Objet d'essai accepté par un filtre de recette (et, `fits`, par la règle de la recette : bases de l'artisanat de D2) */
function sampleFor(rng: Rng, accept: NonNullable<(typeof CUBE_RECIPES)[number]['items']>['accept'], fits: (b: ItemBase) => boolean = () => true) {
  const bases = Object.values(BASE_BY_ID).filter((b) => b.slot && !b.noRandomDrop);
  for (const b of bases) {
    if (!fits(b)) continue;
    // amélioration de base : seulement les bases qui ont une version au palier suivant
    if (accept.tiers && !upgradeTarget(b.id, (accept.tiers[0] + 1) as 1 | 2)) continue;
    for (const q of accept.qualities ?? ['normal', 'magic', 'rare']) {
      if (q === 'crafted' || q === 'runeword' || q === 'low') continue;
      const it = generateItem(rng, b.id, 99, { forceQuality: q as 'normal' });
      if (it.quality !== q) continue;
      if (accept.socketed) {
        it.sockets = Math.max(1, Math.min(2, b.maxSockets));
        if (b.maxSockets === 0) continue;
        it.socketed = [{ uid: 'g', base: 'gem_ruby_2', quality: 'normal', ilvl: 1, sockets: 0, socketed: [], qty: 1 }];
      }
      if (accept.hasSockets && !it.sockets) it.sockets = Math.min(2, b.maxSockets);
      if (itemAccepted(it, accept)) return it;
    }
  }
  return null;
}

describe('Cube horadrique', () => {
  it('chaque recette : ingrédients existants, et produit un résultat valide quand on a tout', () => {
    const errs: string[] = [];
    for (const r of CUBE_RECIPES) {
      for (const k of r.cost) for (const id of k.ids) if (!BASE_BY_ID[id]) errs.push(`${r.id} : ingrédient inconnu ${id}`);
      if (r.effect.kind === 'material' && !BASE_BY_ID[r.effect.id]) errs.push(`${r.id} : produit inconnu ${r.effect.id}`);
      if (r.effect.kind.startsWith('map') || r.effect.kind === 'portal' || r.effect.kind === 'taint' || r.effect.kind === 'desecrate') continue; // cartes, Pandémonium, Annihilus et profanation : tests dédiés
      const g = new Game();
      const c = g.character;
      c.level = 80;
      c.progression.completions['baal:2'] = 1; // portail des Vaches : Baal tué
      for (const k of r.cost) for (const id of k.ids) c.materials[id] = 20;
      for (let k = 1; k <= 33; k++) c.materials[`r${String(k).padStart(2, '0')}`] = 5;
      const rng = new Rng(`cube-test:${r.id}`);
      const idx: number[] = [];
      for (let i = 0; i < (r.items?.n ?? 0); i++) {
        const e = r.effect;
        const it = sampleFor(rng, r.items!.accept, (b) => e.kind !== 'craft' || !!RULES['cube.craft'](e.family, craftSlot(b.type, TYPE_GROUPS.weapon.includes(b.type)) ?? '', b));
        if (!it) {
          errs.push(`${r.id} : aucun objet d'essai accepté`);
          break;
        }
        c.inventory[i] = it;
        idx.push(i);
      }
      if (r.effect.kind === 'craft') c.inventory[10] = generateItem(rng, 'jewel', 60, { forceQuality: 'magic' });
      const res = g.transmute(r.id, idx);
      if (!res.ok) errs.push(`${r.id} : refusée (${res.reason})`);
      if (res.item) for (const e of validateItem(res.item)) errs.push(`${r.id} : ${e}`);
    }
    expect(errs, errs.join('\n')).toEqual([]);
  });

  it('runes : PD2, 3 El + clé → Eld ; 2 Pul + clé → Um ; refus sans clé — D2, 3 El → Eld, Thul avec une topaze ébréchée, rien au-delà de Dol', () => {
    const g = new Game();
    const c = g.character;
    if (withoutPd2) {
      c.materials = { r01: 3, r10: 3, gem_topaz_0: 1 };
      expect(g.transmute('rune_r01', []).ok).toBe(true);
      expect(c.materials.r02).toBe(1);
      expect(g.transmute('rune_r10', []).ok).toBe(true);
      expect(c.materials.r11).toBe(1);
      expect(c.materials.gem_topaz_0 ?? 0).toBe(0);
      expect(g.transmute('rune_r21', []).ok).toBe(false);
      return;
    }
    c.materials = { r01: 3, key: 1, r21: 2 };
    expect(g.transmute('rune_r01', []).ok).toBe(true);
    expect(c.materials.r02).toBe(1);
    expect(g.transmute('rune_r21', []).ok).toBe(false);
    c.materials.key = 1;
    expect(g.transmute('rune_r21', []).ok).toBe(true);
    expect(c.materials.r22).toBe(1);
  });
});

describe('Corruption', () => {
  it('répartition des issues conforme à PD2 et objets toujours valides', () => {
    const rng = new Rng('corr');
    const count = (make: () => ReturnType<typeof generateItem>) => {
      const t: Record<string, number> = {};
      for (let i = 0; i < 2000; i++) {
        const it = make();
        corruptItem(rng, it);
        const o = it.corrupted!.outcome.startsWith('brick') ? 'brick' : it.corrupted!.outcome;
        t[o] = (t[o] ?? 0) + 1;
        expect(validateItem(it)).toEqual([]);
      }
      return t;
    };
    // base normale SANS châsse (une base déjà sertie suit la ligne « ne peut pas avoir de châsse »)
    const normal = count(() => Object.assign(generateItem(rng, 'archon_plate', 85, { forceQuality: 'normal' }), { sockets: 0 }));
    expect(normal.sockets / 2000).toBeGreaterThan(0.45);
    expect(normal.brick / 2000).toBeGreaterThan(0.45);
    const boots = count(() => generateItem(rng, 'leather_boots', 60, { forceQuality: 'rare' }));
    expect(boots.mod / 2000).toBeGreaterThan(0.7);
    expect(boots.brick / 2000).toBeGreaterThan(0.2);
    const helm = count(() => Object.assign(generateItem(rng, 'circlet', 60, { forceQuality: 'magic' }), { sockets: 0 }));
    expect(helm.sockets / 2000).toBeGreaterThan(0.2);
    expect(helm.mod / 2000).toBeGreaterThan(0.45);
  });

  it.skipIf(withoutPd2)('un objet corrompu ne peut plus passer au Cube ; le sertissage reste possible', () => {
    const g = new Game();
    const c = g.character;
    c.materials = { worldstone_shard: 2, r01: 1 };
    const it = generateItem(new Rng('x'), 'skull_cap', 50, { forceQuality: 'magic' });
    c.inventory[0] = it;
    expect(g.transmute('corrupt', [0]).ok).toBe(true);
    expect(g.transmute('corrupt', [0]).ok).toBe(false);
    if (it.sockets > it.socketed.length) expect(g.socket({ invIndex: 0 }, { material: 'r01' }).ok).toBe(true);
  });
});

describe('Cube : amélioration de base et familles d’artisanat', () => {
  /** Bâton court unique amélioré une fois (exceptionnel) ; renvoie la partie et les jets d'origine */
  const upgradeOnce = () => {
    const g = new Game();
    const c = g.character;
    for (const id of ['r08', 'r12', 'gem_emerald_4', 'r17', 'r21']) c.materials[id] = 2;
    const it = generateItem(new Rng('up'), 'short_staff', 99, { forceUniqueId: 'u_bane_ash' });
    const rolls = JSON.stringify(it.rolls);
    c.inventory[0] = it;
    const r = g.transmute('up_unique_weapon_1', [0]);
    return { g, c, r, rolls };
  };

  it('amélioration : l’unique garde ses propriétés sur la base du palier supérieur', () => {
    const { c, r, rolls } = upgradeOnce();
    expect(r.ok).toBe(true);
    expect(BASE_BY_ID[c.inventory[0]!.base].tier).toBe(1);
    expect(c.inventory[0]!.uniqueId).toBe('u_bane_ash');
    expect(JSON.stringify(c.inventory[0]!.rolls)).toBe(rolls);
    expect(validateItem(c.inventory[0]!)).toEqual([]);
  });

  // puis élite (PD2 ; D2 : recette ladder, absente d'une partie solo) : sauté sans le mod au lieu de réussir à vide
  it.skipIf(withoutPd2)('amélioration : puis élite (PD2)', () => {
    const { g, c } = upgradeOnce();
    expect(g.transmute('up_unique_weapon_2', [0]).ok).toBe(true);
    expect(BASE_BY_ID[c.inventory[0]!.base].tier).toBe(2);
    expect(validateItem(c.inventory[0]!)).toEqual([]);
  });

  it('amélioration refusée (déjà élite) : rien n’est consommé', () => {
    const g = new Game();
    const c = g.character;
    c.materials.r09 = 1;
    c.materials.r11 = 1;
    c.materials.gem_sapphire_4 = 1;
    c.inventory[0] = generateItem(new Rng('up2'), 'archon_staff', 99, { forceQuality: 'rare' });
    expect(g.transmute('up_rare_weapon_1', [0]).ok).toBe(false);
    expect(c.materials.r09).toBe(1);
    expect(c.inventory[0]!.base).toBe('archon_staff');
  });

  it('chaque famille d’artisanat donne ses propriétés fixes', () => {
    // amulettes : une propriété caractéristique de chaque famille (PD2 : page Crafting du wiki ; D2 : CubeMain.txt)
    const expected: Record<string, string> = withoutPd2
      ? { blood: 'frw', caster: 'manaRegenPct', hitpower: 'procGetHit', safety: 'block' }
      : { blood: 'lifePerKill', caster: 'fcr', hitpower: 'attackRating', safety: 'mdr', vampiric: 'manaLeech', bountiful: 'mf', brilliant: 'allAttr' };
    for (const [family, stat] of Object.entries(expected)) {
      const g = new Game();
      const c = g.character;
      c.level = 70;
      for (let k = 1; k <= 33; k++) c.materials[`r${String(k).padStart(2, '0')}`] = 3;
      for (const gem of ['ruby', 'sapphire', 'emerald', 'diamond', 'amethyst', 'topaz', 'skull']) c.materials[`gem_${gem}_4`] = 3;
      c.inventory[0] = generateItem(new Rng(`fam:${family}`), 'amulet', 70, { forceQuality: 'magic' });
      c.inventory[1] = generateItem(new Rng(`j:${family}`), 'jewel', 60, { forceQuality: 'magic' });
      const r = g.transmute(`craft_${family}`, [0]);
      expect(r.ok, `${family} : ${r.reason}`).toBe(true);
      expect(c.inventory[0]!.quality).toBe('crafted');
      expect(
        c.inventory[0]!.craftMods!.some((m) => m.stat === stat),
        family,
      ).toBe(true);
    }
  });
});
