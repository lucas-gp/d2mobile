/**
 * Auras du mercenaire de bout en bout : Conviction (Infini) autour du MERCENAIRE (résistance et défense des monstres à portée),
 * bonus alliés au joueur à portée uniquement, Prière à portée, comparaison avec la même aura côté joueur.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { addXp, xpToReach } from '../../src/sim/progression';
import { equipTestMerc } from '../../src/sim/testchar';
import { MERC_AURA_RADIUS, convDefAt, convictionDefPct, convictionRes, mercAuraAt, mercDerived, mercOf, syncMercAuras } from '../../src/sim/merc';
import { monsterReduction } from '../../src/sim/combat';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { withoutPd2 } from '../needs-pd2';

function setup() {
  const g = new Game(undefined, 'sorceress');
  addXp(g.character, xpToReach(99));
  g.character.gold = 1e7;
  g.enterTown();
  equipTestMerc(g);
  const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  b.spawn({ monster: 'zombie', x: 20, y: 15, count: 1, r: 0 });
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 3, difficulty: 0, zoneLevel: 30, character: g.character });
  g.world.populate();
  const w = g.world;
  const merc = mercOf(w)!;
  const mon = w.monsters.find((m) => !m.pet && !m.dead && m.def.id === 'zombie') ?? w.monsters.find((m) => !m.pet && !m.dead)!;
  return { g, w, merc, mon };
}

describe('auras du mercenaire', () => {
  it('Infini : Conviction niveau 12 présente sur le mercenaire', () => {
    const { g } = setup();
    const a = mercDerived(g.character, g.difficulty)!.auras.find((x) => x.id === 'conviction');
    expect(a?.level).toBe(12);
  });

  it('Conviction : résistance réduite autour du mercenaire, inchangée hors de portée', () => {
    const { w, merc, mon } = setup();
    const L = 12;
    const expected = convictionRes(L);
    expect(expected).toBeGreaterThan(20);
    merc.x = mon.x + 3;
    merc.y = mon.y;
    expect(monsterReduction(w, mon, 'fire', null)).toBe(expected);
    expect(monsterReduction(w, mon, 'cold', null)).toBe(expected);
    expect(monsterReduction(w, mon, 'poison', null)).toBe(0);
    merc.x = mon.x + MERC_AURA_RADIUS + 3;
    expect(monsterReduction(w, mon, 'fire', null)).toBe(0);
    expect(mercAuraAt(w, 'conviction', mon.x, mon.y)).toBe(0);
  });

  it('Conviction : défense des monstres réduite autour du mercenaire seulement', () => {
    const { w, merc, mon } = setup();
    merc.x = mon.x + 2;
    merc.y = mon.y;
    expect(convDefAt(w, mon.x, mon.y)).toBe(convictionDefPct(12));
    expect(convictionDefPct(12)).toBeGreaterThan(50);
    merc.x = mon.x + 30;
    expect(convDefAt(w, mon.x, mon.y)).toBe(0);
  });

  it('le joueur ne bénéficie pas de la Conviction du mercenaire comme de la sienne (pas de réduction globale)', () => {
    const { w } = setup();
    expect(w.player.d.conviction).toBe(0);
    expect(w.player.d.convictionDef).toBe(0);
  });

  it('alliés : les auras natives du mercenaire n’agissent sur le joueur qu’à portée', () => {
    const { g, w, merc } = setup();
    // Garde du désert « Défi » : aura Défi sur le joueur à portée
    syncMercAuras(w);
    expect(w.player.buffs.some((b) => b.id === 'maura_defiance')).toBe(true);
    const def0 = w.player.d.defense;
    merc.x = w.player.x + MERC_AURA_RADIUS + 5;
    merc.y = w.player.y;
    syncMercAuras(w);
    expect(w.player.buffs.some((b) => b.id === 'maura_defiance')).toBe(false);
    expect(w.player.d.defense).toBeLessThan(def0);
    merc.x = w.player.x + 2;
    syncMercAuras(w);
    expect(w.player.d.defense).toBe(def0);
    expect(g.character.merc?.dead).toBeFalsy();
  });

  it.skipIf(withoutPd2)('référence joueur : la Conviction du joueur donne la même réduction que celle du mercenaire (niveau égal)', () => {
    const { w, merc, mon } = setup();
    merc.x = mon.x + 40;
    w.player.buffs.push({ id: 'aura_conviction', level: 12, until: w.tick + 1e8 });
    w.refreshPlayer();
    expect(w.player.d.conviction).toBe(convictionRes(12));
    expect(monsterReduction(w, mon, 'fire', null)).toBe(convictionRes(12));
  });

  it('Défi du mercenaire : bonus au joueur à portée seulement', () => {
    const { w, merc } = setup();
    merc.x = w.player.x + 2;
    merc.y = w.player.y;
    // sans appeler l'IA : on vérifie la condition de portée via mercAuraAt
    expect(mercAuraAt(w, 'defiance', w.player.x, w.player.y)).toBeGreaterThan(0);
    merc.x = w.player.x + MERC_AURA_RADIUS + 1;
    expect(mercAuraAt(w, 'defiance', w.player.x, w.player.y)).toBe(0);
  });
});
