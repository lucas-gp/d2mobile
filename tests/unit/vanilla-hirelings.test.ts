/**
 * Mercenaires de la base = Diablo II LoD 1.13c (lot M10d) : lignes d'embauche de Hireling.txt (src/data/mercs-d2.ts, contrôlé contre les
 * MPQ par `npm run vanilla`), modèle de la base (src/mods/d2/mercs.ts : MonsterAI.cpp et AiThink.cpp de D2MOO), et, sans le mod,
 * embauche et caractéristiques en jeu (jeu de règles `d2`).
 */
import { describe, expect, it } from 'vitest';
import { D2_HIRELINGS } from '../../src/data/mercs-d2';
import { D2_MERC_MODEL, d2HireRow } from '../../src/mods/d2/mercs';
import { MERCS, MERC_BY_ID, mercVariantsAt } from '../../src/data/mercs';
import { RULES, ruleOwner } from '../../src/mods/rules';
import { Game } from '../../src/sim/game';
import { addXp, xpToReach } from '../../src/sim/progression';
import { mercDerived, mercType } from '../../src/sim/merc-core';
import { mercVariant } from '../../src/data/mercs';
import { withoutPd2 } from '../needs-pd2';

describe('Mercenaires de Diablo II : Hireling.txt', () => {
  it('lignes d’embauche de l’extension : 4 actes, 3 difficultés, paliers de niveau', () => {
    expect(new Set(D2_HIRELINGS.map((r) => r.act))).toEqual(new Set([1, 2, 3, 5]));
    const rogue = D2_HIRELINGS.find((r) => r.act === 1 && r.variant === 'fire' && r.difficulty === 0)!;
    expect([rogue.id, rogue.level, rogue.hp, rogue.hpLvl, rogue.str, rogue.strLvl]).toEqual([0, 3, 45, 9, 35, 10]);
    expect(rogue.skills.map((s) => s.id)).toEqual(['inner_sight', 'fire_arrow']);
    // Garde du désert : Prière, Défi, Visée bénie en Normal et en Enfer ; Épines, Gel sacré, Puissance en Cauchemar
    const auras = (d: number) => [...new Set(D2_HIRELINGS.filter((r) => r.act === 2 && r.difficulty === d).map((r) => r.variant))];
    expect(auras(0)).toEqual(['prayer', 'defiance', 'blessed_aim']);
    expect(auras(1)).toEqual(['thorns', 'holy_freeze', 'might']);
    expect(auras(2)).toEqual(['prayer', 'defiance', 'blessed_aim']);
  });
});

describe('Mercenaires de Diablo II : modèle de la base', () => {
  it('caractéristiques : ligne + gains par niveau (force, dextérité, dégâts en huitièmes, résistances en quarts)', () => {
    const rogue = MERC_BY_ID.rogue;
    const s = D2_MERC_MODEL.baseStats(rogue, 'fire', 0, 10);
    expect(s.hp).toBe(45 + 7 * 9);
    expect(s.str).toBe(35 + Math.trunc((7 * 10) / 8));
    expect(s.res).toBe(Math.trunc((7 * 8) / 4));
    // palier suivant : niveau 36
    expect(d2HireRow(rogue, 'fire', 0, 40)!.level).toBe(36);
  });
  it('compétences : Level + LvlPerLvl / 32 par niveau, au niveau requis ; poids de tirage', () => {
    // types de D2 tels que la base les décrit (avec pd2, le registre porte ceux du mod)
    const desert = { id: 'desert', act: 2, weapons: [], shield: false, classItems: [], variants: [{ id: 'prayer', skills: [] }] };
    expect(D2_MERC_MODEL.skillLevel('prayer', 9, desert, 'prayer', 0)).toBe(3);
    expect(D2_MERC_MODEL.skillLevel('prayer', 20, desert, 'prayer', 0)).toBe(3 + ((11 * 7) >> 5));
    expect(D2_MERC_MODEL.skillLevel('glacial_spike', 15, { ...desert, id: 'ironwolf', act: 3, variants: [{ id: 'cold', skills: [] }] }, 'cold', 0)).toBe(0);
    expect(D2_MERC_MODEL.skillWeights(desert, desert.variants[0], 9, 0)).toEqual([
      { id: 'attack', pct: 30 },
      { id: 'jab', pct: 70 },
    ]);
  });
  it('quatre actes ; sous-types de l’acte II selon la difficulté ; casque, armure, arme (bouclier du Loup de fer)', () => {
    if (withoutPd2) expect(MERCS.map((t) => t.id)).toEqual(['rogue', 'desert', 'ironwolf', 'barbarian']);
    expect(D2_MERC_MODEL.variantsAt(MERC_BY_ID.desert.variants, 1).length).toBeGreaterThan(0);
    expect(D2_MERC_MODEL.slots(MERC_BY_ID.rogue)).toEqual(['mainhand', 'head', 'body']);
    expect(D2_MERC_MODEL.slots(MERC_BY_ID.ironwolf)).toContain('offhand');
    expect(D2_MERC_MODEL.slotFor(MERC_BY_ID.ironwolf, { id: 'two_handed_sword', type: 'sword', twoHanded: true })).toBeNull();
    expect(D2_MERC_MODEL.hireOf(2)).toBe(2);
  });
  it('sans mod, le modèle est celui de D2 ; avec pd2, celui du mod', () => {
    expect(ruleOwner('merc.model')).toBe(withoutPd2 ? undefined : 'pd2');
    if (withoutPd2) expect(RULES['merc.model']()).toBe(D2_MERC_MODEL);
  });
});

describe.skipIf(!withoutPd2)('Mercenaires de Diablo II : en jeu (jeu de règles d2)', () => {
  it('embauche en Cauchemar : Gel sacré proposé, difficulté enregistrée, aura et vie de la ligne', () => {
    const g = new Game(undefined, 'sorceress');
    addXp(g.character, xpToReach(45));
    g.character.gold = 1e7;
    g.difficulty = 1;
    const offer = g.mercOffers().find((o) => o.type.id === 'desert')!;
    expect(offer.variants.map((v) => v.id)).toEqual(['thorns', 'holy_freeze', 'might']);
    expect(mercVariantsAt(offer.type, 0).map((v) => v.id)).toEqual(['prayer', 'defiance', 'blessed_aim']);
    expect(g.hireMerc('desert', 'holy_freeze').ok).toBe(true);
    expect(g.character.merc!.hire).toBe(1);
    const md = mercDerived(g.character, 1)!;
    expect(md.auras.find((a) => a.id === 'holy_freeze')?.level).toBe(6 + ((2 * 10) >> 5));
    expect(md.lifeMax).toBe(567 + 2 * 25);
  });
  it('ancienne sauvegarde de la base (sous-types PD2) : Ascendant → Loup de fer, Barbare Cris de guerre → Coup violent', () => {
    const g = new Game(undefined, 'necromancer');
    addXp(g.character, xpToReach(40));
    g.character.merc = { type: 'ascendant', variant: 'dark', name: 'Kerith', dead: false, equipment: {} };
    expect(mercType(g.character)?.id).toBe('ironwolf');
    expect(g.character.merc.variant).toBe('fire');
    expect(mercVariant(MERC_BY_ID.barbarian, 'warcries').id).toBe('bash');
    expect(mercDerived(g.character, 0)).not.toBeNull();
  });
});
