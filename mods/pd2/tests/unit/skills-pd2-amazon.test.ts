/** Amazone PD2 : comportement de chaque compétence confronté au wiki (mods/pd2/docs/audit/skills-pd2-amazon.md). */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/sim/game';
import { World } from '../../../../src/sim/world';
import { ZoneBuilder } from '../../../../src/data/zones/builder';
import { addXp, xpToReach } from '../../../../src/sim/progression';
import { SKILL_BY_ID, lin, skillHard } from '../../../../src/data/skills';
import { Rng } from '../../../../src/core/rng';
import { generateItem } from '../../../../src/sim/loot/itemgen';
import { weaponMastery } from '../../../../src/sim/melee';
import { valkyriePowerStrike } from '../../../../src/sim/amazon';
import { damagePlayer } from '../../../../src/sim/combat';
import { emptyPacket } from '../../../../src/sim/actors';
import type { Monster, Missile } from '../../../../src/sim/actors';

type Spawn = { x: number; y: number };

/** Arène vide à 40×30 ; l'Amazone (niveau 60, force et dextérité élevées) tient `weapon` et se tient en (10,15) */
function arena(spawns: Spawn[], skills: Record<string, number> = {}, weapon = 'long_battle_bow'): { g: Game; w: World; ms: Monster[] } {
  const g = new Game(undefined, 'amazon');
  addXp(g.character, xpToReach(60));
  g.character.base.str = 200;
  g.character.base.dex = 300;
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  for (const s of spawns) b.spawn({ monster: 'zombie', x: s.x, y: s.y, count: 1, r: 0 });
  for (const [k, v] of Object.entries(skills)) g.character.skills[k] = v;
  g.character.equipment.mainhand = generateItem(new Rng('amz'), weapon, 30, { forceQuality: 'normal' });
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty: 0, zoneLevel: 30, character: g.character });
  g.world.populate();
  const ms = g.world.monsters.filter((x) => !x.dead && !x.isSummon);
  for (const x of ms) {
    x.hp = x.hpMax = 1e9;
    x.dmgMin = x.dmgMax = 0;
    x.defense = 0;
    x.res = { phys: 0, fire: 0, cold: 0, light: 0, poison: 0, magic: 0 };
    x.speed = 0;
  }
  g.world.player.mana = g.world.player.manaMax = 1e6;
  g.world.refreshPlayer();
  return { g, w: g.world, ms };
}

const run = (g: Game, n: number): void => {
  for (let i = 0; i < n; i++) g.step(1);
};
const lost = (m: Monster): number => 1e9 - m.hp;
/** Lance un sort et renvoie tous les projectiles de ce type vus (premier état de chacun) */
function castSeen(g: Game, w: World, skill: string, kind: string, tx: number, ty: number, targetId = 0, steps = 60): Missile[] {
  w.player.cooldowns = {};
  w.player.mode = 'idle';
  w.input.cast = { skill, tx, ty, targetId };
  const seen = new Map<number, Missile>();
  for (let i = 0; i < steps; i++) {
    g.step(1);
    for (const m of w.missiles) if (m.kind === kind && !seen.has(m.id)) seen.set(m.id, { ...m, dmg: { ...m.dmg }, hits: [...m.hits] });
  }
  return [...seen.values()];
}
const line = (n: number, gap: number, x0 = 14): Spawn[] => Array.from({ length: n }, (_, i) => ({ x: x0 + i * gap, y: 15 }));

describe('Amazone PD2 : arc et arbalète', () => {
  it("Flèche magique : traverse toujours ses cibles ; 75 % de l'arme dont la moitié en magie", () => {
    const { g, w, ms } = arena(line(3, 1.5), { magic_arrow: 1 });
    const seen = castSeen(g, w, 'magic_arrow', 'magic_arrow', ms[0].x, ms[0].y);
    expect(seen.length).toBe(1);
    expect(seen[0].pierce).toBe(true);
    for (const m of ms) expect(lost(m)).toBeGreaterThan(0); // une seule flèche, trois victimes
    // 50 % du dégât d'arme converti : la part magique de la flèche dépasse la part physique restante
    expect(seen[0].dmg.magic).toBeGreaterThan(seen[0].dmg.phys);
  });

  it("Flèche de feu : 50 % de l'arme, portée 12 yards, sol en feu de 1,48 s à l'impact (synergie de la Flèche magique seule)", () => {
    const { g, w, ms } = arena([{ x: 14, y: 15 }], { fire_arrow: 5, magic_arrow: 5, immolation_arrow: 5 });
    const seen = castSeen(g, w, 'fire_arrow', 'fire_arrow', ms[0].x, ms[0].y, 0, 40);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    const maxLife = Math.max(...seen.map((m) => m.maxLife));
    expect(maxLife * 0.04 * 16).toBeLessThanOrEqual(7.2); // 12 yards = 6 u (+ marge de la cible)
    expect(seen[0].aux).toBeGreaterThan(0);
    const ground = w.areas.filter((a) => a.kind === 'fire_ground');
    expect(ground.length).toBeGreaterThan(0);
    expect(ground[0].radius).toBeCloseTo(0.67, 2);
    expect(ground[0].maxLife).toBe(37);
    // le dps du sol suit la table « Burning Damage » avec +18 % par point de Flèche magique seulement (pas d'Immolation)
    const s = SKILL_BY_ID.fire_arrow;
    const avg = (lin(s.n.min2 as never, 5) + lin(s.n.max2 as never, 5)) / 2;
    expect(seen[0].aux).toBeCloseTo(avg * 1.9, 0);
  });

  it('Flèche de froid : ralentissement de 4 s à tous les niveaux', () => {
    for (const pts of [1, 12]) {
      const { g, w, ms } = arena([{ x: 14, y: 15 }], { cold_arrow: pts });
      const seen = castSeen(g, w, 'cold_arrow', 'cold_arrow', ms[0].x, ms[0].y, 0, 40);
      expect(seen[0].dmg.chill).toBe(100);
    }
  });

  it("Tir multiple : portée 17,33 yards ; chaque ennemi traversé retire 20 % des dégâts d'origine (plancher 20 %)", () => {
    const { g, w, ms } = arena(line(6, 1.2), { multiple_shot: 1 });
    w.player.cooldowns = {};
    w.input.cast = { skill: 'multiple_shot', tx: ms[0].x, ty: ms[0].y, targetId: 0 };
    const trace: Record<number, number> = {};
    const first = new Map<number, number>();
    for (let i = 0; i < 60; i++) {
      g.step(1);
      for (const m of w.missiles) {
        if (m.kind !== 'arrow' || m.dmg.pierceDecay === undefined) continue;
        m.pierce = true; // la perforation est forcée : on mesure la perte de dégâts
        if (!first.has(m.id)) first.set(m.id, m.dmg.phys);
        if (m.dmg.phys > 0) trace[m.hits.length] = Math.max(trace[m.hits.length] ?? 0, m.dmg.phys / first.get(m.id)!);
      }
    }
    expect(SKILL_BY_ID.multiple_shot.range).toBeCloseTo(8.67, 2);
    expect(trace[1]).toBeCloseTo(0.8, 1);
    expect(trace[2]).toBeCloseTo(0.6, 1);
    expect(trace[4]).toBeCloseTo(0.2, 1);
    expect(trace[5]).toBeCloseTo(0.2, 1); // plancher
  });

  it("Flèche explosive : rayon de l'explosion principale selon les points investis, explosions secondaires selon le niveau", () => {
    expect(skillHard('exploding_arrow', 'Primary Explosion Radius (yards)', 1)).toBe(2);
    for (const [pts, radius] of [
      [1, 1],
      [5, 1.33],
      [20, 2.66],
    ] as const) {
      const { g, w, ms } = arena([{ x: 14, y: 15 }], { exploding_arrow: pts });
      w.player.cooldowns = {};
      w.input.cast = { skill: 'exploding_arrow', tx: ms[0].x, ty: ms[0].y, targetId: 0 };
      let sec: (typeof w.areas)[number] | undefined;
      let aux = 0;
      for (let i = 0; i < 40; i++) {
        g.step(1);
        sec = sec ?? w.areas.find((a) => a.kind === 'exploding_sec');
        aux = aux || (w.missiles.find((m) => m.kind === 'exploding_arrow')?.aux ?? 0);
      }
      expect(aux).toBeCloseTo(radius, 1);
      expect(sec).toBeDefined();
      expect(sec!.aux).toBe(Math.floor(lin(SKILL_BY_ID.exploding_arrow.n.count!, pts)));
      expect(sec!.radius).toBeCloseTo(3.33, 2); // 6,66 yards autour de l'impact
    }
  });

  it('Flèche de glace : gel de 1 s, +1,25 image par point de Flèche de froid et de Flèche de gel', () => {
    for (const [cold, freezing, frames] of [
      [0, 0, 25],
      [20, 20, 75],
    ] as const) {
      const { g, w, ms } = arena([{ x: 14, y: 15 }], { ice_arrow: 1, cold_arrow: cold, freezing_arrow: freezing });
      w.player.d.hardPoints.cold_arrow = cold;
      w.player.d.hardPoints.freezing_arrow = freezing;
      const seen = castSeen(g, w, 'ice_arrow', 'ice_arrow', ms[0].x, ms[0].y, 0, 40);
      expect(seen[0].dmg.freeze).toBe(frames);
    }
    expect(SKILL_BY_ID.ice_arrow.range).toBeCloseTo(6.33, 2);
  });

  it("Flèche guidée : touche toujours, traverse deux ennemis au plus, 50 % de l'arme", () => {
    const { g, w, ms } = arena(line(5, 1.3), { guided_arrow: 1 });
    const seen = castSeen(g, w, 'guided_arrow', 'guided_arrow', ms[0].x, ms[0].y, 0, 60);
    expect(seen.length).toBe(1);
    expect(seen[0].dmg.ar).toBeUndefined();
    expect(seen[0].dmg.pierceMax).toBe(2);
    const hit = ms.filter((m) => lost(m) > 0).length;
    expect(hit).toBe(3); // la cible et deux traversées
    expect(SKILL_BY_ID.guided_arrow.range).toBeCloseTo(12.67, 2);
  });

  it('Flèche guidée : +1 % de dégâts convertis en magie par 2 points de Flèche magique', () => {
    const { g, w, ms } = arena([{ x: 14, y: 15 }], { guided_arrow: 1, magic_arrow: 20 });
    const seen = castSeen(g, w, 'guided_arrow', 'guided_arrow', ms[0].x, ms[0].y, 0, 40);
    expect(seen[0].dmg.magic).toBeGreaterThan(0);
    const share = seen[0].dmg.magic / (seen[0].dmg.magic + seen[0].dmg.phys);
    expect(share).toBeCloseTo(0.1, 1);
  });

  it('Flèche immolatrice : plus de recharge, explosion de 2,66 yards, sol brûlant de 2 yards pendant 2 s', () => {
    expect(SKILL_BY_ID.immolation_arrow.n.cooldown).toBeUndefined();
    const { g, w, ms } = arena([{ x: 14, y: 15 }], { immolation_arrow: 5 });
    castSeen(g, w, 'immolation_arrow', 'immolation_arrow', ms[0].x, ms[0].y, 0, 40);
    const ground = w.areas.find((a) => a.kind === 'fire_ground');
    expect(ground).toBeDefined();
    expect(ground!.radius).toBeCloseTo(1, 2);
    expect(ground!.maxLife).toBe(50);
  });

  it('Mitraille : portée 18,66 yards', () => {
    expect(SKILL_BY_ID.strafe.range).toBeCloseTo(9.33, 2);
    // une cible hors de portée (12 u) n'est pas visée par la volée
    const { g, w, ms } = arena([{ x: 22.5, y: 15 }], { strafe: 1 });
    const seen = castSeen(g, w, 'strafe', 'arrow', ms[0].x, ms[0].y, 0, 40);
    expect(Math.max(0, ...seen.map((m) => m.maxLife)) * 0.04 * 16).toBeLessThanOrEqual(10.5);
  });

  it('Flèche de gel : gèle 0,48 s, rayon de 2,66 à 6 yards selon les points investis', () => {
    for (const [pts, radius] of [
      [1, 1.33],
      [20, 3],
    ] as const) {
      const { g, w, ms } = arena([{ x: 14, y: 15 }], { freezing_arrow: pts });
      const seen = castSeen(g, w, 'freezing_arrow', 'freezing_arrow', ms[0].x, ms[0].y, 0, 40);
      expect(seen[0].dmg.freeze).toBe(12);
      expect(seen[0].aux).toBeCloseTo(radius, 2);
    }
  });
});

describe('Amazone PD2 : passifs et capacités magiques', () => {
  it("Vue intérieure : rayon de 6,66 à 20 yards, défense et score d'attaque de l'ennemi réduits", () => {
    const near = arena(
      [
        { x: 12.5, y: 15 },
        { x: 18, y: 15 },
      ],
      { inner_sight: 1 },
    );
    near.w.player.cooldowns = {};
    near.w.input.cast = { skill: 'inner_sight', tx: 10, ty: 15, targetId: 0 };
    run(near.g, 20);
    expect(near.ms[0].arMul).toBeCloseTo(0.9, 2); // −10 % au niveau 1
    expect(near.ms[0].defMul).toBeLessThan(1);
    expect(near.ms[1].arMul).toBeUndefined(); // 8 u : hors du rayon de 3,33 u
    const far = arena([{ x: 18, y: 15 }], { inner_sight: 20 });
    far.w.player.cooldowns = {};
    far.w.input.cast = { skill: 'inner_sight', tx: 10, ty: 15, targetId: 0 };
    run(far.g, 20);
    expect(far.ms[0].arMul).toBeLessThan(0.75);
  });

  it('Ralentissement : marche et projectiles ennemis ralentis (rayon 12 à 16 yards)', () => {
    const { g, w, ms } = arena(
      [
        { x: 14, y: 15 },
        { x: 24, y: 15 },
      ],
      { slow_movement: 1 },
    );
    w.player.cooldowns = {};
    w.input.cast = { skill: 'slow_movement', tx: 10, ty: 15, targetId: 0 };
    run(g, 20);
    expect(ms[0].slowMul).toBeCloseTo(0.8, 2);
    expect(ms[0].missileMul).toBeCloseTo(0.75, 2);
    expect(ms[1].missileMul).toBeUndefined(); // 14 u : hors des 6 u du niveau 1
    expect(lin(SKILL_BY_ID.slow_movement.n.radius!, 1)).toBeCloseTo(6, 1);
    expect(lin(SKILL_BY_ID.slow_movement.n.radius!, 20)).toBeCloseTo(8, 1);
  });

  it('Dérobade : vitesse de marche accrue (15 % au niveau 1) ; Esquive : récupération accélérée', () => {
    const base = arena([], {});
    const frw0 = base.w.player.d.frw;
    const fhr0 = base.w.player.d.fhr;
    const a = arena([], { evade: 1, dodge: 1 });
    expect(a.w.player.d.frw - frw0).toBe(15);
    expect(a.w.player.d.fhr - fhr0).toBe(5);
    const b = arena([], { evade: 20, dodge: 20 });
    expect(b.w.player.d.frw - frw0).toBe(lin(SKILL_BY_ID.evade.n.value2!, 20));
    expect(b.w.player.d.frw - frw0).toBe(53);
    expect(b.w.player.d.fhr - fhr0).toBe(24);
  });

  it('Esquive : délai de 4 images (0,16 s) après une esquive réussie', () => {
    const { w, ms } = arena([{ x: 11, y: 15 }], { dodge: 20 });
    const p = w.player;
    p.mode = 'idle';
    p.d.dodgeMelee = 75;
    const pk = emptyPacket(false);
    pk.phys = 1;
    let blocks = 0;
    for (let i = 0; i < 200; i++) {
      damagePlayer(w, p, { ...pk }, ms[0]);
      blocks += w.events.drain().filter((e) => e.t === 'block').length;
    }
    expect(blocks).toBe(1); // même image : une seule esquive possible
    expect(p.dodgeAt).toBe(w.tick + 4);
  });

  it('Pénétration : abaisse la résistance physique ennemie (−1 % tous les 2 points)', () => {
    const none = arena([], {});
    const a = arena([], { penetrate: 1 });
    const b = arena([], { penetrate: 20 });
    expect(a.w.player.d.pierce.phys - none.w.player.d.pierce.phys).toBe(0);
    expect(b.w.player.d.pierce.phys - none.w.player.d.pierce.phys).toBe(10);
  });

  it("Maîtrise du javelot et de la lance : multiplicateur de coup critique (+10 % au niveau 1, quelle que soit l'arme)", () => {
    const a = arena([], { javelin_mastery: 1 });
    expect(weaponMastery(a.w).critMult).toBe(10);
    const b = arena([], { javelin_mastery: 20 });
    expect(weaponMastery(b.w).critMult).toBe(29);
    // elle n'ajoute rien à la chance de coup critique
    expect(weaponMastery(b.w).crit).toBe(0);
  });
});

describe('Amazone PD2 : javelot et lance', () => {
  it('Estoc : trois coups sur la même cible, chacun aux dégâts complets', () => {
    const { g, w, ms } = arena([{ x: 11.2, y: 15 }], { jab: 5 }, 'spear');
    w.player.d.weaponDmg = [100, 100];
    const dmg: number[] = [];
    const orig = w.hurtMonster.bind(w);
    w.hurtMonster = (m, pk) => {
      dmg.push(pk.phys);
      return orig(m, pk);
    };
    for (let i = 0; i < 8 && dmg.length < 3; i++) {
      w.player.cooldowns = {};
      w.player.mode = 'idle';
      w.input.cast = { skill: 'jab', tx: ms[0].x, ty: ms[0].y, targetId: ms[0].id };
      run(g, 20);
    }
    expect(dmg.length).toBeGreaterThanOrEqual(3);
    const [a, b, c] = dmg;
    expect(b / a).toBeGreaterThan(0.95);
    expect(c / a).toBeGreaterThan(0.95);
  });

  it('Parade : trois attaques, zone de mêlée agrandie de 20 / 40 / 60 %', () => {
    const { g, w, ms } = arena(
      [
        { x: 11.2, y: 15 },
        { x: 11.2, y: 16 },
      ],
      { fend: 5 },
      'spear',
    );
    const hits: Record<number, number> = {};
    const orig = w.hurtMonster.bind(w);
    w.hurtMonster = (m, pk) => {
      hits[m.id] = (hits[m.id] ?? 0) + 1;
      return orig(m, pk);
    };
    let casts = 0;
    for (let i = 0; i < 8; i++) {
      w.player.cooldowns = {};
      w.player.mode = 'idle';
      w.input.cast = { skill: 'fend', tx: ms[0].x, ty: ms[0].y, targetId: ms[0].id };
      run(g, 20);
      casts++;
    }
    const perCast = (hits[ms[0].id] ?? 0) / casts;
    expect(perCast).toBeGreaterThan(2); // ~3 coups par attaque (un coup peut rater)
    expect(perCast).toBeLessThanOrEqual(3);
    expect(hits[ms[1].id] ?? 0).toBeGreaterThan(casts); // le voisin est lui aussi frappé plusieurs fois
  });

  it('Frappe foudroyante : chaîne de 10,66 yards', () => {
    // deux ennemis à 5,6 u l\'un de l\'autre : hors de la chaîne (5,33 u)
    const far = arena(
      [
        { x: 11.2, y: 15 },
        { x: 16.8, y: 15 },
      ],
      { lightning_strike: 20 },
      'spear',
    );
    far.w.player.cooldowns = {};
    far.w.input.cast = { skill: 'lightning_strike', tx: 11.2, ty: 15, targetId: far.ms[0].id };
    run(far.g, 25);
    expect(lost(far.ms[1])).toBe(0);
    const near = arena(
      [
        { x: 11.2, y: 15 },
        { x: 16.2, y: 15 },
      ],
      { lightning_strike: 20 },
      'spear',
    );
    near.w.player.cooldowns = {};
    near.w.input.cast = { skill: 'lightning_strike', tx: 11.2, ty: 15, targetId: near.ms[0].id };
    run(near.g, 25);
    expect(lost(near.ms[1])).toBeGreaterThan(0);
  });

  it('Furie de la foudre : des éclairs à CHAQUE impact (perforation comprise), 10 yards, au plus 6 ennemis traversés', () => {
    const { g, w, ms } = arena([...line(3, 1.4, 14), { x: 14, y: 19 }, { x: 14, y: 11 }], { lightning_fury: 5, pierce: 20 }, 'javelin');
    w.player.d.hardPoints.pierce = 20;
    const bolts: number[] = [];
    const orig = w.hurtMonster.bind(w);
    w.hurtMonster = (m, pk) => {
      if (pk.skill === 'lightning_fury' && pk.light > 0) bolts.push(m.id);
      return orig(m, pk);
    };
    const seen = castSeen(g, w, 'lightning_fury', 'lightning_fury', ms[0].x, ms[0].y, 0, 60);
    expect(seen[0].dmg.pierceMax).toBe(6);
    expect(SKILL_BY_ID.lightning_fury.n.count).toBeDefined();
    expect(bolts.length).toBeGreaterThan(0);
    // les ennemis de la ligne dont l'éclair part au deuxième impact existent : plus d'éclairs qu'un seul impact n'en libère
    const impacts = new Set(bolts).size;
    expect(impacts).toBeGreaterThanOrEqual(3);
  });

  it('Recharges : Javelot de peste 1 s, Valkyrie 1 s, Javelot empoisonné sans recharge', () => {
    expect(SKILL_BY_ID.plague_javelin.n.cooldown).toBe(1);
    expect(SKILL_BY_ID.valkyrie.n.cooldown).toBe(1);
    expect(SKILL_BY_ID.poison_javelin.n.cooldown).toBeUndefined();
  });

  it('Javelot de peste : nuage de 6 yards de rayon', () => {
    const { g, w, ms } = arena([{ x: 14, y: 15 }], { plague_javelin: 5 }, 'javelin');
    const seen = castSeen(g, w, 'plague_javelin', 'plague_javelin', ms[0].x, ms[0].y, 0, 40);
    expect(seen[0].aux).toBe(3);
  });
});

describe('Amazone PD2 : Leurre et Valkyrie', () => {
  it('Leurre : tire des flèches sur les ennemis proches de lui (20,66 yards), 30 s, dégâts de la table avec synergies', () => {
    const { g, w, ms } = arena([{ x: 20, y: 15 }], { decoy: 5, strafe: 5, valkyrie: 5 });
    w.player.cooldowns = {};
    w.input.cast = { skill: 'decoy', tx: 16, ty: 15, targetId: 0 };
    run(g, 20);
    const decoy = w.monsters.find((m) => m.pet === 'decoy' && !m.dead)!;
    expect(decoy).toBeDefined();
    expect(decoy.def.attacks[0].kind).toBe('missile');
    expect(decoy.def.attacks[0].range).toBeCloseTo(10.33, 2);
    const s = SKILL_BY_ID.decoy;
    const base = lin(s.n.min as never, 5);
    // synergies : +10 % par point de Mitraille et de Valkyrie
    expect(decoy.dmgMin).toBeCloseTo(base * 2, 0);
    run(g, 100);
    expect(lost(ms[0])).toBeGreaterThan(0);
    expect((decoy.expireTick ?? 0) - w.tick).toBeGreaterThan(25 * 25);
  });

  it('Leurre : reçoit la chance de perforation du joueur', () => {
    const { g, w, ms } = arena([{ x: 20, y: 15 }], { decoy: 5, pierce: 20 });
    w.player.cooldowns = {};
    w.input.cast = { skill: 'decoy', tx: 16, ty: 15, targetId: 0 };
    const seen: number[] = [];
    for (let i = 0; i < 80; i++) {
      g.step(1);
      for (const m of w.missiles) if (m.team === 0 && m.kind === 'arrow' && m.dmg.pierceChance) seen.push(m.dmg.pierceChance);
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toBe(lin(SKILL_BY_ID.pierce.n.value!, 20));
    void ms;
  });

  it('Valkyrie : Frappe puissante à chaque coup (éclair + nova de 4,3 yards), +20 % à la nova par point de Frappe puissante', () => {
    const summon = (skills: Record<string, number>) => {
      const a = arena(
        [
          { x: 12, y: 15 },
          { x: 13, y: 15.4 },
          { x: 17, y: 15 },
        ],
        { valkyrie: 10, ...skills },
      );
      a.w.player.cooldowns = {};
      a.w.input.cast = { skill: 'valkyrie', tx: 11, ty: 15, targetId: 0 };
      run(a.g, 20);
      const valk = a.w.monsters.find((m) => m.pet === 'valkyrie' && !m.dead)!;
      expect(valk).toBeDefined();
      return { ...a, valk };
    };
    const a = summon({});
    const b = summon({ power_strike: 20, penetrate: 10, decoy: 10 });
    expect(Math.round(lin(SKILL_BY_ID.valkyrie.n.v3!, 10))).toBe(10); // niveau 10 de la Valkyrie : Frappe puissante niveau 10 (table du wiki)
    // résistances de la table, score d'attaque +40 par point de Pénétration
    expect(a.valk.res.light).toBeGreaterThan(0);
    expect(b.valk.ar).toBeGreaterThan(a.valk.ar);
    expect(b.valk.dmgMax).toBeGreaterThan(a.valk.dmgMax * 1.3); // +15 % par point de Leurre
    const novaLoss = (r: ReturnType<typeof summon>): number => {
      for (const m of r.ms) m.hp = m.hpMax = 1e9;
      for (let i = 0; i < 40; i++) valkyriePowerStrike(r.w, r.valk, r.ms[0]);
      return lost(r.ms[1]);
    };
    const la = novaLoss(a);
    const lb = novaLoss(b);
    expect(la).toBeGreaterThan(0); // la nova touche l'ennemi voisin
    expect(lb / la).toBeGreaterThan(2.5); // +20 % × 20 points : ×5 en moyenne
    expect(lost(b.ms[2])).toBe(0); // hors des 4,3 yards
  });
});
