/**
 * Lot « compétences et classes » (fidélité PD2 S13) : tables du wiki à 60 niveaux (échelle des sorts,
 * niveaux au-delà de 20, poison), refonte du Barbare, Druide, malédictions multiples, invocations
 * multiples, charges de l'Assassin, auras du Paladin, flèches multiples, endurance de classe.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SKILL_BY_ID, lin, skillHard, ramp, skillWdmg } from '../../../../src/data/skills';
import { PD2_NUMBERS } from '../../data/skills';
import { T } from '../../../../src/data/ramp';
import { CLASSES, CLASS_IDS, type ClassId } from '../../../../src/data/classes';
import { Game } from '../../../../src/sim/game';
import { World } from '../../../../src/sim/world';
import { ZoneBuilder } from '../../../../src/data/zones/builder';
import { addXp, xpToReach } from '../../../../src/sim/progression';
import { computeDerived } from '../../../../src/sim/character';
import { chargeCount } from '../../../../src/sim/assassin';
import { activeCurse } from '../../../../src/sim/actors';
import { maxCurses } from '../../../../src/sim/necromancer';
import { minionsOf } from '../../../../src/sim/minions';
import { petMax } from '../../../../src/sim/druid';
import { generateItem } from '../../../../src/sim/loot/itemgen';
import { Rng } from '../../../../src/core/rng';

const WIKI = JSON.parse(readFileSync(join(__dirname, '../../tools/skilldata/pd2-wiki.json'), 'utf8')) as Record<string, { tables: Record<string, number[]> }>;
const rng = (id: string, key: 'min' | 'max', L: number): number => ramp(SKILL_BY_ID[id].n[key]!, L);

function arena(cls: ClassId, skills: Record<string, number>, level = 60, count = 1): { g: Game; w: World } {
  const g = new Game(undefined, cls);
  addXp(g.character, xpToReach(level));
  g.character.skills = skills;
  const b = new ZoneBuilder('arena', 'Arène', 30, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  b.spawn({ monster: 'hell_bovine', x: 12, y: 15, count, r: 0, rank: 'normal' });
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 1, difficulty: 0, zoneLevel: 20, character: g.character });
  g.world.populate();
  g.world.godMode = true;
  for (const m of g.world.monsters) {
    m.aggro = false;
    m.speed = 0;
  }
  return { g, w: g.world };
}

function cast(g: Game, skill: string, targetId = 0, ticks = 30): void {
  const w = g.world;
  const t = w.monsters.find((m) => m.id === targetId) ?? w.monsters.find((m) => !m.dead && !m.isSummon);
  w.player.mana = w.player.manaMax;
  w.input.cast = { skill, tx: t?.x ?? w.player.x + 2, ty: t?.y ?? w.player.y, targetId: t?.id ?? 0 };
  g.step(ticks);
}

describe('PD2 : tables du wiki (P0-1, P0-2, P0-5)', () => {
  it('chaque champ remplacé reproduit la table du wiki aux niveaux 1 à 60 (arrondis près)', () => {
    let checked = 0;
    for (const [id, n] of Object.entries(PD2_NUMBERS)) {
      for (const key of ['min', 'max', 'min2', 'max2', 'wdmg', 'ar'] as const) {
        const r = n[key];
        if (!r || !('inc' in r)) continue;
        if (r.inc.every((x) => x === 0) && !r.tab) continue;
        // une table du wiki doit être reproduite à tous les niveaux (arrondis du wiki près)
        const near = (t: number[]): boolean => t.length === 60 && t.every((v, i) => Math.abs(ramp(r, i + 1) - v) <= Math.max(1.01, Math.abs(v) * 0.01));
        expect(Object.values(WIKI[id].tables).some(near), `${id}.${key}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(150);
  });

  it('plus de dégâts ×2 (HitShift) : Trait de feu 3-6 au niveau 1, 141-163 au niveau 20', () => {
    expect([rng('fire_bolt', 'min', 1), rng('fire_bolt', 'max', 1)]).toEqual([3, 6]);
    expect([Math.round(rng('fire_bolt', 'min', 20)), Math.round(rng('fire_bolt', 'max', 20))]).toEqual([141, 163]);
    expect([rng('ice_bolt', 'min', 1), rng('ice_bolt', 'max', 1)]).toEqual([3, 5]);
    expect([rng('frozen_orb', 'min', 1), rng('frozen_orb', 'max', 1)]).toEqual([40, 45]);
    expect([rng('teeth', 'min', 1), rng('teeth', 'max', 1)]).toEqual([3, 5]);
    expect([rng('fire_arrow', 'min', 1), rng('fire_arrow', 'max', 1)]).toEqual([8, 12]);
    expect([rng('grizzly', 'min', 1), rng('grizzly', 'max', 1)]).toEqual([20, 30]);
  });

  it('au-delà du niveau 20 : paliers PD2 22-28 et 29+ (Javelot de foudre 1 368 au niveau 30)', () => {
    expect(Math.round(rng('lightning_bolt', 'max', 30))).toBe(1368);
    expect(Math.round(rng('power_strike', 'max', 30))).toBe(336);
    expect([Math.round(rng('fire_bolt', 'min', 30)), Math.round(rng('fire_bolt', 'max', 30))]).toEqual([355, 387]);
    expect(Math.round(rng('immolation_arrow', 'min', 30))).toBe(620);
    // table complète : valeur exacte puis prolongement à la pente des deux dernières valeurs
    const t = T([1, 3, 6]);
    expect([ramp(t, 1), ramp(t, 3), ramp(t, 5)]).toEqual([1, 6, 12]);
  });

  it('poison PD2 : Javelot empoisonné 131-139 sur 1 s au niveau 20, Javelot de peste sur 3 s, Désécration 14-18', () => {
    expect([Math.round(rng('poison_javelin', 'min', 20)), Math.round(rng('poison_javelin', 'max', 20))]).toEqual([131, 139]);
    expect(lin(SKILL_BY_ID.poison_javelin.n.duration, 20)).toBe(1);
    expect(lin(SKILL_BY_ID.plague_javelin.n.duration, 20)).toBe(3);
    expect([rng('desecrate', 'min', 1), rng('desecrate', 'max', 1)]).toEqual([14, 18]);
    expect(lin(SKILL_BY_ID.poison_dagger.n.duration, 10)).toBe(2);
    expect(lin(SKILL_BY_ID.rabies.n.duration, 10)).toBe(5);
  });

  it('synergies du wiki : Barbare (Coup violent ← Étourdissement, Concentration), additives au bonus de dégâts', () => {
    const bash = SKILL_BY_ID.bash;
    expect(
      bash.synergies
        .filter((s) => s.what === 'dmg')
        .map((s) => `${s.skill}:${s.pct}`)
        .sort(),
    ).toEqual(['concentrate:20', 'stun:20']);
    // +20 % par niveau d'Étourdissement, ajoutés aux +50 % du niveau 1 (pas multipliés)
    expect(skillWdmg(bash, 1, { stun: 5 })).toBe(150);
    expect(SKILL_BY_ID.frenzy.synergies.length).toBeGreaterThan(0);
    expect(SKILL_BY_ID.war_cry.synergies.length).toBe(6);
  });

  it('coûts en mana du wiki (Tornade 2 + 0,125/niv., Corbeaux 1,5 + 0,25/niv.)', () => {
    expect(SKILL_BY_ID.tornado.n.mana).toEqual([2, 0.125]);
    expect(SKILL_BY_ID.raven.n.mana).toEqual([1.5, 0.25]);
  });
});

describe('PD2 : Barbare (P0-3)', () => {
  it('Ordres de bataille : vie et mana fixes (+50/+25 au niveau 1, +15/+7,5 par niveau)', () => {
    const { g } = arena('barbarian', { battle_orders: 1 });
    const c = g.character;
    const base = computeDerived(c, 0, []);
    const bo = computeDerived(c, 0, [{ id: 'battle_orders', level: 5, until: 1e9 }]);
    expect(bo.lifeMax - base.lifeMax).toBe(110);
    expect(Math.abs(bo.manaMax - base.manaMax - 55)).toBeLessThanOrEqual(1);
    expect(lin(SKILL_BY_ID.battle_orders.n.duration, 1)).toBe(300);
  });

  it('Frénésie : cinq charges à tous les niveaux, durée 15 s + 2 s par point', () => {
    const { g, w } = arena('barbarian', { frenzy: 1, double_swing: 1 });
    g.character.equipment.mainhand = generateItem(new Rng('a'), 'short_sword', 30, { forceQuality: 'normal' });
    g.character.equipment.offhand = generateItem(new Rng('b'), 'short_sword', 30, { forceQuality: 'normal' }); // PD2 : deux armes exigées
    g.world.refreshPlayer();
    const m = w.monsters[0];
    m.x = m.px = w.player.x + 1.2;
    m.y = m.py = w.player.y;
    m.hp = m.hpMax = 1e9;
    for (let i = 0; i < 60 && (w.player.buffs.find((b) => b.id === 'frenzy')?.stacks ?? 0) < 5; i++) cast(g, 'frenzy', m.id, 20);
    const fz = w.player.buffs.find((b) => b.id === 'frenzy');
    expect(fz?.stacks).toBe(5);
    expect(pd2HardFrenzy(0)).toBe(15);
    expect(pd2HardFrenzy(10)).toBe(35);
  });

  it('Cri de bataille réduit la résistance physique ; Cri de guerre 3-5 au niveau 1', () => {
    const { g, w } = arena('barbarian', { battle_cry: 5 });
    cast(g, 'battle_cry');
    const m = w.monsters[0];
    expect(m.red.phys?.v).toBe(lin(SKILL_BY_ID.battle_cry.n.value2, 5));
    expect([rng('war_cry', 'min', 1), rng('war_cry', 'max', 1)]).toEqual([3, 5]);
  });

  it('Commandement de bataille : +1 à toutes les compétences, +2 dès 10 points investis', () => {
    const { g } = arena('barbarian', { battle_command: 10, bash: 5 });
    const d = computeDerived(g.character, 0, [{ id: 'battle_command', level: 10, until: 1e9 }]);
    expect(d.skillLevels.bash).toBe(7);
  });
});

function pd2HardFrenzy(hard: number): number {
  return skillHard('frenzy', 'Duration (seconds)', hard);
}

describe('PD2 : malédictions et invocations multiples (P1-2, P1-3)', () => {
  it('Maîtrise des malédictions : deux malédictions sur un monstre à 10 points', () => {
    const { g, w } = arena('necromancer', { amplify_damage: 5, lower_resist: 5, curse_mastery: 10 });
    expect(maxCurses(w)).toBe(2);
    cast(g, 'amplify_damage');
    cast(g, 'lower_resist');
    const m = w.monsters[0];
    expect(activeCurse(m, 'amplify_damage', w.tick)).not.toBeNull();
    expect(activeCurse(m, 'lower_resist', w.tick)).not.toBeNull();
    // Amplification PD2 : −11 % de résistance physique au niveau 1 (+1 %/niv.), plus −100 %
    expect(m.red.phys?.v).toBeLessThan(50);
  });

  it('sans Maîtrise, la nouvelle malédiction remplace l’ancienne', () => {
    const { g, w } = arena('necromancer', { amplify_damage: 5, lower_resist: 5 });
    cast(g, 'amplify_damage');
    cast(g, 'lower_resist');
    const m = w.monsters[0];
    expect(activeCurse(m, 'amplify_damage', w.tick)).toBeNull();
    expect(activeCurse(m, 'lower_resist', w.tick)).not.toBeNull();
  });

  it('Maîtrise des golems : deux golems à 5 points', () => {
    const { g, w } = arena('necromancer', { clay_golem: 5, golem_mastery: 5 });
    cast(g, 'clay_golem');
    cast(g, 'clay_golem');
    cast(g, 'clay_golem');
    expect(minionsOf(w, 'clay_golem').length).toBe(2);
  });

  it('Corbeaux : 15 au plus ; loups spirituels selon la table ; Valkyrie : 2e au niveau 20', () => {
    expect(petMax('raven', 60)).toBe(15);
    expect(petMax('spirit_wolf', 1)).toBe(1);
    expect(petMax('grizzly', 20, 20)).toBe(2);
    expect(Math.floor(lin(SKILL_BY_ID.valkyrie.n.count, 20))).toBe(2);
  });
});

describe('PD2 : Assassin, Paladin, Amazone (P1-4, P1-5, P1-6)', () => {
  it('charges : effet immédiat à chaque coup, remise à zéro au troisième ; le Tigre garde ses charges', () => {
    const { g, w } = arena('assassin', { fists_of_fire: 5, tiger_strike: 5 });
    g.character.equipment.mainhand = generateItem(new Rng('k'), 'katar', 30, { forceQuality: 'normal' });
    g.world.refreshPlayer();
    const m = w.monsters[0];
    m.x = m.px = w.player.x + 1.2;
    m.y = m.py = w.player.y;
    m.hp = m.hpMax = 1e9;
    const counts: number[] = [];
    for (let i = 0; i < 12 && counts.length < 3; i++) {
      const before = chargeCount(w, 'fists_of_fire');
      cast(g, 'fists_of_fire', m.id, 25);
      const after = chargeCount(w, 'fists_of_fire');
      if (after !== before) counts.push(after);
    }
    expect(counts).toEqual([1, 2, 0]);
    for (let i = 0; i < 12 && chargeCount(w, 'tiger_strike') < 3; i++) cast(g, 'tiger_strike', m.id, 25);
    expect(chargeCount(w, 'tiger_strike')).toBe(3);
  });

  it('Puissance : valeur pleine pour le Paladin, « Ally Damage » pour les créatures', () => {
    const { g } = arena('paladin', { might: 10 });
    const d = computeDerived(g.character, 0, [{ id: 'aura_might', level: 10, until: 1e9 }]);
    const none = computeDerived(g.character, 0, []);
    expect(d.meleeDmgPct - none.meleeDmgPct).toBe(lin(SKILL_BY_ID.might.n.value, 10));
    expect(d.petDmgPct - none.petDmgPct).toBe(lin(SKILL_BY_ID.might.n.value2, 10));
  });

  it('Flèche de feu : 2 flèches au niveau 1 (rework S13)', () => {
    expect(Math.floor(lin(SKILL_BY_ID.fire_arrow.n.count, 1))).toBe(2);
    expect(skillHard('magic_arrow', 'Number of Arrows', 5)).toBe(2);
  });
});

describe('Classes : endurance PD2 (donnée)', () => {
  it('endurance de départ et gains par niveau et par vitalité pour les sept classes', () => {
    for (const id of CLASS_IDS) {
      const c = CLASSES[id];
      expect(c.stamina).toBeGreaterThan(140);
      expect(c.staminaPerLevel).toBeGreaterThanOrEqual(1);
      expect(c.staminaPerVit).toBeGreaterThanOrEqual(1);
    }
    expect(CLASSES.assassin.staminaPerLevel).toBe(1.25);
  });
});
