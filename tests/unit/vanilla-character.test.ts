/**
 * Caractéristiques du personnage de la base = Diablo II LoD 1.13c (lot M8c) : départ, vie, mana et gains par niveau et par point de
 * chaque classe (CharStats.txt, src/data/classes.ts : contrôlé contre les MPQ par `npm run vanilla` et vanilla-mpq.test.ts ; valeurs PD2 :
 * patch du mod), score d'attaque et blocage de la classe (ToHitFactor, BlockFactor), plafond des résistances (95 %).
 */
import { describe, expect, it } from 'vitest';
import { CLASSES } from '../../src/data/classes';
import { MAX_RES_CAP, blockFactor, toHitFactor } from '../../src/mods/d2/character';
import { D2_CLASS } from '../../src/mods/d2/tables';
import { RULES, ruleOwner } from '../../src/mods/rules';
import { computeDerived } from '../../src/sim/character';
import { Game } from '../../src/sim/game';
import { generateItem } from '../../src/sim/loot/itemgen';
import { itemFinal } from '../../src/sim/itemstats';
import { Rng } from '../../src/core/rng';
import { withoutPd2 } from '../needs-pd2';

/** CharStats.txt 1.13c (colonnes en quarts de point ramenées en points) */
const CHARSTATS = {
  amazon: { manaPerLevel: 1.5, stamina: 84, toHit: 5, block: 25 },
  sorceress: { manaPerLevel: 2, stamina: 74, toHit: -15, block: 20 },
  necromancer: { manaPerLevel: 2, stamina: 79, toHit: -10, block: 20 },
  paladin: { manaPerLevel: 1.5, stamina: 89, toHit: 20, block: 30 },
  barbarian: { manaPerLevel: 1, stamina: 92, toHit: 20, block: 25 },
  druid: { manaPerLevel: 2, stamina: 84, toHit: 5, block: 20 },
  assassin: { manaPerLevel: 1.5, stamina: 95, toHit: 15, block: 25 },
} as const;

describe('Caractéristiques D2 1.13c', () => {
  it('CharStats : mana par niveau et endurance de départ de la base (PD2 : patch du mod)', () => {
    for (const [id, v] of Object.entries(CHARSTATS)) {
      const c = CLASSES[id as keyof typeof CLASSES];
      if (withoutPd2) expect([c.manaPerLevel, c.stamina], id).toEqual([v.manaPerLevel, v.stamina]);
      else expect(c.stamina, id).toBeGreaterThan(v.stamina);
    }
    // gains identiques dans les deux jeux de règles : vie par niveau et par Vitalité, mana par Énergie
    expect([CLASSES.barbarian.lifePerLevel, CLASSES.barbarian.lifePerVit, CLASSES.sorceress.manaPerEne]).toEqual([2, 4, 2]);
  });
  it('ToHitFactor et BlockFactor de CharStats', () => {
    for (const [id, v] of Object.entries(CHARSTATS)) {
      expect([D2_CLASS[id].toHitFactor, D2_CLASS[id].blockFactor], id).toEqual([v.toHit, v.block]);
      expect([toHitFactor(id), blockFactor(id)]).toEqual([v.toHit, v.block]);
    }
    expect(D2_CLASS.sorceress.manaRegen).toBe(120);
  });
  it('score d’attaque : 5 × (Dextérité − 7) + ToHitFactor ; blocage : BlockFactor ajouté avec un bouclier seulement', () => {
    const g = new Game(undefined, 'paladin');
    delete g.character.equipment.offhand;
    const bare = computeDerived(g.character, 0);
    expect(bare.attackRating).toBe(5 * (g.character.base.dex - 7) + (withoutPd2 ? 20 : 0));
    expect(bare.block).toBe(0);
    const shield = generateItem(new Rng(2), 'buckler', 1, { forceQuality: 'normal' });
    g.character.equipment.offhand = shield;
    const own = itemFinal(shield, g.character.level).block ?? 0;
    expect(own).toBeGreaterThan(0);
    expect(computeDerived(g.character, 0).block).toBe(own + (withoutPd2 ? 30 : 0));
  });
  it('plafond des résistances maximales : 95 %', () => {
    expect(MAX_RES_CAP).toBe(95);
  });
  it('sans mod, les règles des caractéristiques sont celles de D2 ; avec pd2, celles du mod', () => {
    for (const r of ['char.maxResCap', 'char.toHitFactor', 'char.blockFactor'] as const) expect(ruleOwner(r)).toBe(withoutPd2 ? undefined : 'pd2');
    expect(RULES['char.maxResCap']()).toBe(withoutPd2 ? 95 : 90);
  });
});
