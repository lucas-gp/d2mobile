/**
 * Compétences de l'Assassin de la base = Diablo II LoD 1.13c (lot M9h) : chiffres de Skills.txt (src/data/skills-d2.ts, contrôlé contre
 * les MPQ par `npm run vanilla`) confrontés aux valeurs documentées, règles de la base (src/mods/d2/skills.ts : SkillAss.cpp de D2MOO),
 * et, sans le mod, comportement en jeu (jeu de règles `d2`).
 */
import { describe, expect, it } from 'vitest';
import { D2_SKILL_TREE } from '../../src/data/skills-d2';
import { lin, ramp, type Lin, type Ramp } from '../../src/data/ramp';
import { D2_ASSASSIN } from '../../src/mods/d2/skills';
import { RULES, ruleOwner } from '../../src/mods/rules';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, xpToReach } from '../../src/sim/progression';
import { chargeCount } from '../../src/sim/assassin';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import type { Monster } from '../../src/sim/actors';
import { withoutPd2 } from '../needs-pd2';

const N = Object.fromEntries(D2_SKILL_TREE.map((t) => [t.id, t.n ?? {}]));
const at = (v: Lin | Ramp | undefined, L: number): number => (v && !Array.isArray(v) ? ramp(v, L) : lin(v, L));

describe('Assassin de Diablo II : chiffres des tables', () => {
  it('arts martiaux (Arreat Summit)', () => {
    // Frappe du tigre : +100 % de dégâts par charge (+20 par niveau), charges de 15 s ; Griffes de foudre 1-80 ; Lames de glace 15-35, 4 s
    expect(at(N.tiger_strike.wdmg, 2)).toBe(120);
    expect(lin(N.tiger_strike.duration, 1)).toBe(15);
    expect([at(N.claws_of_thunder.min, 1), at(N.claws_of_thunder.max, 1)]).toEqual([1, 80]);
    expect([at(N.blades_of_ice.min, 1), at(N.blades_of_ice.max, 1)]).toEqual([15, 35]);
    expect(lin(N.blades_of_ice.chill, 1)).toBe(4);
    // Serre du dragon : 1 coup de pied, +1 tous les 6 niveaux ; Envol du dragon : 1 s de recharge ; Frappe du cobra : 40 % (+5) volés
    expect([Math.floor(at(N.dragon_talon.count, 1)), Math.floor(at(N.dragon_talon.count, 6))]).toEqual([1, 2]);
    expect(N.dragon_flight.cooldown).toBe(1);
    expect(lin(N.cobra_strike.value, 2)).toBe(45);
  });
  it('disciplines et pièges', () => {
    // Évanescence : réduction des dégâts 1 % par niveau ; Venin : 60-80 de poison en 0,4 s ; guerrière de l'ombre : 6 s de recharge
    expect(lin(N.fade.value2, 10)).toBe(10);
    expect([at(N.venom.min, 1), at(N.venom.max, 1)]).toEqual([60, 80]);
    expect(N.shadow_warrior.cooldown).toBe(6);
    // Souffle mental : 10-20, étourdissement 2 s ; Sentinelle de lames : 4 s, 2 s de recharge ; Bouclier de lames 20 s (+5)
    expect([at(N.mind_blast.min, 1), at(N.mind_blast.max, 1), lin(N.mind_blast.stun, 1)]).toEqual([10, 20, 2]);
    expect(lin(N.blade_sentinel.duration, 1)).toBe(4);
    expect(lin(N.blade_shield.duration, 2)).toBe(25);
  });
});

describe('Assassin de Diablo II : règles de la base', () => {
  it('charges accumulées puis libérées, tourelles de D2, Tourelle de mort à 40-80 %', () => {
    expect(D2_ASSASSIN.chargesImmediate).toBe(false);
    expect(D2_ASSASSIN.chargeStage('cobra_strike', 3)).toBe(2);
    expect(D2_ASSASSIN.sentryShots('lightning_sentry', 7)).toBe(10);
    expect(D2_ASSASSIN.chargedBolts(20)).toBe(5);
    expect(D2_ASSASSIN.deathSentryCorpse).toEqual([0.4, 0.8]);
    expect(D2_ASSASSIN.bladeSentinelWeapon).toBe(48 / 128);
  });
  it.skipIf(!withoutPd2)('sont celles du jeu d2', () => {
    expect(ruleOwner('skills.assassin')).toBeUndefined();
    expect(RULES['skills.assassin']()).toBe(D2_ASSASSIN);
  });
});

function arena(skills: Record<string, number>): { g: Game; w: World; ms: Monster[] } {
  const g = new Game(undefined, 'assassin');
  addXp(g.character, xpToReach(40));
  g.enterTown();
  g.character.equipment.mainhand = generateItem(new Rng('w'), 'katar', 30, { forceQuality: 'normal' });
  const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  b.spawn({ monster: 'zombie', x: 11.2, y: 15, count: 1, r: 0 });
  g.character.skills = { ...skills };
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty: 0, zoneLevel: 30, character: g.character });
  g.world.populate();
  const ms = g.world.monsters.filter((x) => !x.dead && !x.isSummon);
  for (const x of ms) {
    x.hp = x.hpMax = 1e6;
    x.defense = 0;
    x.speed = 0;
  }
  g.world.player.mana = g.world.player.manaMax = 1e6;
  g.world.refreshPlayer();
  return { g, w: g.world, ms };
}
const cast = (g: Game, w: World, skill: string, t: Monster): void => {
  w.player.cooldowns = {};
  w.player.mode = 'idle';
  w.input.cast = { skill, tx: t.x, ty: t.y, targetId: t.id };
  for (let i = 0; i < 30; i++) g.step(1);
};

describe.skipIf(!withoutPd2)('Assassin de Diablo II : en jeu (jeu de règles d2)', () => {
  it('Frappe du tigre : les charges s’accumulent (3 au plus), une finition les consomme', () => {
    const { g, w, ms } = arena({ tiger_strike: 5, dragon_talon: 5 });
    for (let i = 0; i < 12 && chargeCount(w, 'tiger_strike') < 3; i++) cast(g, w, 'tiger_strike', ms[0]);
    expect(chargeCount(w, 'tiger_strike')).toBe(3);
    cast(g, w, 'tiger_strike', ms[0]);
    expect(chargeCount(w, 'tiger_strike')).toBe(3);
    for (let i = 0; i < 12 && chargeCount(w, 'tiger_strike') > 0; i++) cast(g, w, 'dragon_talon', ms[0]);
    expect(chargeCount(w, 'tiger_strike')).toBe(0);
  });
});
