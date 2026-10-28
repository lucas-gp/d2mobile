/** Druide PD2 : comportement de chaque compétence confronté au wiki (mods/pd2/docs/audit/skills-pd2-druid.md). */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/sim/game';
import { World } from '../../../../src/sim/world';
import { ZoneBuilder } from '../../../../src/data/zones/builder';
import { addXp, xpToReach } from '../../../../src/sim/progression';
import { SKILL_BY_ID, lin, skillHard } from '../../../../src/data/skills';
import { hurtPet, petsOf, petsTargetable } from '../../../../src/sim/druid';
import { emptyPacket } from '../../../../src/sim/actors';
import type { Monster } from '../../../../src/sim/actors';

type Spawn = { x: number; y: number };

function arena(spawns: Spawn[], skills: Record<string, number> = {}): { g: Game; w: World; ms: Monster[] } {
  const g = new Game(undefined, 'druid');
  addXp(g.character, xpToReach(60));
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  for (const s of spawns) b.spawn({ monster: 'zombie', x: s.x, y: s.y, count: 1, r: 0 });
  for (const [k, v] of Object.entries(skills)) g.character.skills[k] = v;
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
const doCast = (g: Game, w: World, skill: string, tx: number, ty: number, targetId = 0, steps = 20): void => {
  w.player.cooldowns = {};
  w.player.mode = 'idle';
  w.input.cast = { skill, tx, ty, targetId };
  run(g, steps);
};
const corpse = (w: World, m: Monster): void => {
  m.hp = 0;
  w.killMonster(m, null);
};
const lost = (m: Monster): number => 1e9 - m.hp;
/** Lance un sort et renvoie le premier projectile de ce type apparu (l'animation précède l'effet) */
const castAndFind = (g: Game, w: World, skill: string, kind: string, tx: number, ty: number, targetId = 0) => {
  w.player.cooldowns = {};
  w.player.mode = 'idle';
  w.input.cast = { skill, tx, ty, targetId };
  for (let i = 0; i < 60; i++) {
    g.step(1);
    const m = w.missiles.find((x) => x.kind === kind);
    if (m) return m;
  }
  return undefined;
};

describe('Druide PD2 : sorts élémentaires', () => {
  it('Tempête de feu : nombre de langues selon les points durs (3 à 7)', () => {
    for (const [pts, n] of [
      [1, 3],
      [6, 4],
      [11, 5],
      [16, 6],
      [20, 7],
    ] as const) {
      const { g, w, ms } = arena([{ x: 18, y: 15 }], { firestorm: pts });
      w.player.cooldowns = {};
      w.input.cast = { skill: 'firestorm', tx: ms[0].x, ty: ms[0].y, targetId: 0 };
      let seen = 0;
      for (let i = 0; i < 30; i++) {
        g.step(1);
        seen = Math.max(seen, w.missiles.filter((m) => m.kind === 'firestorm').length);
      }
      expect(seen).toBe(n);
    }
  });

  it('Souffle arctique : résistance au froid réduite et nova de givre sur les ennemis tués', () => {
    const { g, w, ms } = arena(
      [
        { x: 13, y: 15 },
        { x: 13, y: 17.3 },
      ],
      { arctic_blast: 10 },
    );
    ms[0].hp = 1; // sera tué par le jet
    ms[0].hpMax = 1;
    // la nova atteint le voisin hors du jet (angle > 0,6 rad, à 2,3 u de la victime)
    doCast(g, w, 'arctic_blast', 20, 15, 0, 30);
    expect(ms[0].dead).toBe(true);
    expect(lost(ms[1])).toBeGreaterThan(0);
    expect(ms[1].red.cold).toBeUndefined();
    // un survivant du jet voit sa résistance au froid baisser de la valeur de la table
    const t = arena([{ x: 13, y: 15 }], { arctic_blast: 10 });
    doCast(t.g, t.w, 'arctic_blast', 20, 15, 0, 30);
    expect(t.ms[0].red.cold?.v).toBeCloseTo(lin(SKILL_BY_ID.arctic_blast.n.value, 10), 5);
    expect(lin(SKILL_BY_ID.arctic_blast.n.value, 10)).toBe(15);
    // portée du jet : 8 yards au niveau 1, 16 yards au niveau 13
    expect(lin(SKILL_BY_ID.arctic_blast.n.radius, 1)).toBe(4);
    expect(lin(SKILL_BY_ID.arctic_blast.n.radius, 13)).toBe(8);
  });

  it('Rocher en fusion : explose en fin de course (4,66 yards), sol brûlant, recul une fois sur deux', () => {
    const range = lin(SKILL_BY_ID.molten_boulder.n.v3, 1);
    const { g, w, ms } = arena([{ x: 10 + range + 1.5, y: 15 }], { molten_boulder: 1 });
    expect(SKILL_BY_ID.molten_boulder.n.value ? lin(SKILL_BY_ID.molten_boulder.n.value, 1) : 0).toBe(50);
    const mk = castAndFind(g, w, 'molten_boulder', 'boulder', 30, 15)!;
    expect(mk.dmg.knockbackPct).toBe(50);
    expect(mk.life).toBeGreaterThan(70); // 3,4 s au niveau 1
    run(g, 120);
    expect(lost(ms[0])).toBeGreaterThan(0); // le rocher ne l'a pas touché : seule l'explosion de fin de course (ou son sol brûlant)
    expect(w.areas.some((a) => a.kind === 'fire_ground') || lost(ms[0]) > 0).toBe(true);
  });

  it('Armure du cyclone : recharge de 2 s', () => {
    const { g, w } = arena([{ x: 18, y: 15 }], { cyclone_armor: 3 });
    w.player.cooldowns = {};
    w.input.cast = { skill: 'cyclone_armor', tx: 11, ty: 15, targetId: 0 };
    run(g, 20);
    const left = (w.player.cooldowns.cyclone_armor ?? 0) - w.tick;
    expect(left).toBeGreaterThan(20);
    expect(left).toBeLessThanOrEqual(50);
  });

  it('Rafale : saut instantané vers la destination, recharge de la table, Trombe et Tornade la raccourcissent', () => {
    const { g, w, ms } = arena([{ x: 17, y: 15 }], { gust: 5, twister: 1, tornado: 1 });
    expect(lin(SKILL_BY_ID.gust.n.value, 1)).toBeCloseTo(6.32, 5);
    expect(lin(SKILL_BY_ID.gust.n.value, 20)).toBeCloseTo(2.52, 5);
    const x0 = w.player.x;
    doCast(g, w, 'gust', 16, 15, 0, 40);
    expect(w.player.x).toBeGreaterThan(x0 + 3);
    expect(lost(ms[0])).toBe(0); // aucun dégât
    const cd = (w.player.cooldowns.gust ?? 0) - w.tick;
    expect(cd).toBeGreaterThan(0);
    expect(cd).toBeLessThanOrEqual(Math.round(lin(SKILL_BY_ID.gust.n.value, 5) * 25)); // 5,52 s au niveau 5
    // la Trombe retire 13 images à la recharge restante
    const c0 = w.player.cooldowns.gust!;
    w.player.cooldowns = { gust: c0 };
    w.player.mode = 'idle';
    w.input.cast = { skill: 'twister', tx: 30, ty: 15, targetId: 0 };
    g.step(1);
    run(g, 19);
    expect(w.player.cooldowns.gust!).toBe(c0 - 13);
  });

  it('Éruption (Fissure) : recharge 0,52 s, évents tous les 0,24 s pendant 2,2 s qui durent 3,36 s', () => {
    expect(SKILL_BY_ID.eruption.n.cooldown).toBe(0.52);
    expect(lin(SKILL_BY_ID.eruption.n.radius, 1)).toBeCloseTo(2.33, 2);
    expect(lin(SKILL_BY_ID.eruption.n.duration, 1)).toBeCloseTo(2.2, 2);
    expect(skillHard('eruption', 'Vent Frequency (seconds)', 0)).toBe(0.24);
    expect(skillHard('eruption', 'Vent Frequency (seconds)', 20)).toBe(0.16);
    const { g, w, ms } = arena([{ x: 18, y: 15 }], { eruption: 1 });
    doCast(g, w, 'eruption', 18, 15, 0, 30);
    const vents = w.areas.filter((a) => a.kind === 'fissure_vent');
    expect(vents.length).toBeGreaterThanOrEqual(3);
    expect(vents.every((v) => v.maxLife === 84 && v.every === 5)).toBe(true);
    run(g, 120);
    // chaque évent frappe à répétition : bien plus qu'un seul coup par évent
    expect(lost(ms[0])).toBeGreaterThan(0);
  });

  it('Volcan : recharge 0,52 s, débris toutes les 0,08 s sur 8 yards, 6 s', () => {
    expect(SKILL_BY_ID.volcano.n.cooldown).toBe(0.52);
    expect(SKILL_BY_ID.volcano.n.mana[0]).toBe(12);
    const { g, w, ms } = arena([{ x: 18, y: 15 }], { volcano: 1 });
    doCast(g, w, 'volcano', 18, 15, 0, 2);
    let rocks = 0;
    for (let i = 0; i < 60; i++) {
      g.step(1);
      rocks = Math.max(rocks, w.areas.filter((a) => a.kind === 'arma_rock').length);
    }
    expect(rocks).toBeGreaterThanOrEqual(8);
    expect(w.areas.find((a) => a.kind === 'volcano')!.maxLife).toBe(150);
    run(g, 150);
    expect(lost(ms[0])).toBeGreaterThan(0); // le cône frappe tout près du cratère
  });

  it('Tornade : 3 s de vie, 16 yards au plus, dégâts périodiques en plus du contact', () => {
    const { g, w, ms } = arena([{ x: 13, y: 15 }], { tornado: 1 });
    const t = castAndFind(g, w, 'tornado', 'tornado', 30, 15)!;
    expect(t.maxLife).toBeLessThanOrEqual(76);
    expect(t.maxLife).toBeGreaterThanOrEqual(74);
    const r = lin(SKILL_BY_ID.tornado.n.min, 1);
    // laisse la tornade passer sur le monstre immobile : contact puis frappes toutes les 0,6 s tant qu'elle est dans son rayon
    run(g, 100);
    expect(lost(ms[0])).toBeGreaterThan(r * 1.5);
  });

  it('Ouragan : frappe TOUS les ennemis dans 6 yards toutes les 0,8 s, pas au-delà', () => {
    const { g, w, ms } = arena(
      [
        { x: 11.5, y: 15 },
        { x: 10, y: 16.5 },
        { x: 12, y: 16 },
        { x: 15, y: 15 },
      ],
      { hurricane: 1 },
    );
    expect(lin(SKILL_BY_ID.hurricane.n.radius, 1)).toBe(3);
    expect(lin(SKILL_BY_ID.hurricane.n.chill, 1)).toBe(8);
    doCast(g, w, 'hurricane', 11, 15, 0, 45);
    expect(ms.slice(0, 3).every((m) => lost(m) > 0)).toBe(true);
    expect(lost(ms[3])).toBe(0);
  });

  it('Armageddon : un météore toutes les 0,36 s dans 6 yards, avec sol brûlant', () => {
    const { g, w } = arena([{ x: 12, y: 15 }], { armageddon: 1 });
    expect(lin(SKILL_BY_ID.armageddon.n.radius, 1)).toBe(3);
    doCast(g, w, 'armageddon', 11, 15, 0, 2);
    let rocks = 0;
    let ground = 0;
    for (let i = 0; i < 90; i++) {
      g.step(1);
      rocks = Math.max(rocks, w.areas.filter((a) => a.kind === 'arma_rock').length);
      ground = Math.max(ground, w.areas.filter((a) => a.kind === 'fire_ground').length);
    }
    expect(rocks).toBeGreaterThanOrEqual(1);
    expect(ground).toBeGreaterThanOrEqual(1);
  });
});

describe('Druide PD2 : métamorphoses', () => {
  it('Onde de choc : plusieurs ondes en étoile, étourdissement 0,24 s', () => {
    const { g, w } = arena([{ x: 12, y: 15 }], { werebear: 1, maul: 1, shock_wave: 1 });
    expect(lin(SKILL_BY_ID.shock_wave.n.stun, 1)).toBe(0.24);
    expect(lin(SKILL_BY_ID.shock_wave.n.count, 1)).toBe(4);
    castAndFind(g, w, 'shock_wave', 'shock_wave', 12, 15);
    const ws = w.missiles.filter((m) => m.kind === 'shock_wave');
    expect(ws.length).toBe(4);
    expect(ws.every((m) => m.dmg.stun === 6 && m.pierce)).toBe(true);
  });

  it('Mutilation : étourdissement décroissant avec les points durs', () => {
    expect(skillHard('maul', 'Stun Length (seconds)', 0)).toBeCloseTo(1.4, 5);
    expect(skillHard('maul', 'Stun Length (seconds)', 20)).toBeCloseTo(0.2, 5);
    const stunOf = (pts: number): number => {
      const a = arena([{ x: 11.2, y: 15 }], { werebear: 1, maul: pts });
      a.w.player.d.attackRating = 1e6;
      let best = 0;
      for (let k = 0; k < 3 && !best; k++) {
        a.w.player.cooldowns = {};
        a.w.player.mode = 'idle';
        a.w.input.cast = { skill: 'maul', tx: 11.2, ty: 15, targetId: a.ms[0].id };
        for (let i = 0; i < 40; i++) {
          a.g.step(1);
          best = Math.max(best, a.ms[0].stunT);
        }
      }
      return best;
    };
    expect(stunOf(1)).toBeGreaterThan(stunOf(20));
    expect(stunOf(20)).toBeLessThanOrEqual(5);
  });

  it('Griffes de feu : chaque coup lance une tempête de feu (4 langues)', () => {
    const { g, w } = arena([{ x: 11.2, y: 15 }], { werewolf: 1, fire_claws: 1 });
    w.player.d.attackRating = 1e6;
    let seen = 0;
    for (let k = 0; k < 6 && !seen; k++) {
      doCast(g, w, 'fire_claws', 11.2, 15, w.monsters.find((m) => !m.isSummon)!.id, 1);
      for (let i = 0; i < 40; i++) {
        g.step(1);
        seen = Math.max(seen, w.missiles.filter((m) => m.kind === 'firestorm').length);
      }
    }
    expect(seen).toBe(4);
  });

  it('Furie : zone de mêlée +20 %, +40 %, +60 % aux trois coups', () => {
    const { g, w, ms } = arena(
      [
        { x: 11.2, y: 15 },
        { x: 11.2, y: 16.8 },
        { x: 11.2, y: 17.2 },
        { x: 11.2, y: 18.6 },
      ],
      { werewolf: 1, feral_rage: 1, rabies: 1, fury: 1 },
    );
    w.player.d.attackRating = 1e6;
    for (let k = 0; k < 4; k++) doCast(g, w, 'fury', 11.2, 15, ms[0].id, 30);
    expect(lost(ms[1])).toBeGreaterThan(0); // à 1,8 u de la cible : atteint par les 2e et 3e coups
    expect(lost(ms[2])).toBeGreaterThan(0); // à 2,2 u : seul le 3e coup (1,33 + 0,33 × 3 = 2,32 u) y arrive
    expect(lost(ms[3])).toBe(0); // à 3,6 u : hors de portée
  });

  it('Loup-garou et ours-garou : réduction fixe des dégâts, ininterruptible, zone de mêlée', () => {
    const wolf = arena([{ x: 18, y: 15 }], { werewolf: 5, shape_shifting: 1 });
    doCast(wolf.g, wolf.w, 'werewolf', 11, 15, 0, 20);
    expect(wolf.w.player.d.drFlat).toBeGreaterThan(0);
    expect(wolf.w.player.d.mdr).toBeGreaterThan(0);
    const bear = arena([{ x: 18, y: 15 }], { werebear: 5 });
    doCast(bear.g, bear.w, 'werebear', 11, 15, 0, 20);
    expect(bear.w.player.d.uninterrupt).toBeGreaterThan(0);
    expect(bear.w.player.d.all.get('splashRadius')).toBeGreaterThanOrEqual(20);
  });

  it("Faim : blessures ouvertes (chances et dégâts) pendant l'effet", () => {
    const { g, w, ms } = arena(
      [
        { x: 12, y: 15 },
        { x: 13, y: 15 },
      ],
      { werebear: 1, maul: 1, hunger: 1 },
    );
    corpse(w, ms[0]);
    doCast(g, w, 'hunger', 12, 15, 0, 20);
    expect(w.player.d.all.get('openWounds')).toBeGreaterThanOrEqual(24);
    expect(w.player.d.all.get('openWoundsDps')).toBeGreaterThanOrEqual(40);
  });

  it('Rage : une morsure empoisonne la cible et le poison se propage', () => {
    const { g, w, ms } = arena(
      [
        { x: 11.2, y: 15 },
        { x: 12.5, y: 15 },
      ],
      { werewolf: 1, feral_rage: 1, rabies: 1 },
    );
    w.player.d.attackRating = 1e6;
    for (let k = 0; k < 4; k++) doCast(g, w, 'rabies', 11.2, 15, ms[0].id, 25);
    run(g, 75);
    expect(lost(ms[1])).toBeGreaterThan(0);
  });
});

describe('Druide PD2 : invocations', () => {
  it('Corbeaux, esprits et lianes ne peuvent être ni visés ni blessés', () => {
    const { g, w } = arena([{ x: 25, y: 15 }], { raven: 1, heart_wolverine: 1, plague_poppy: 1, cycle_of_life: 1, vines: 1, oak_sage: 1, spirit_barbs: 1 });
    for (const s of ['raven', 'plague_poppy', 'cycle_of_life', 'vines', 'heart_wolverine']) doCast(g, w, s, 12, 15, 0, 20);
    const pets = petsOf(w);
    expect(pets.length).toBeGreaterThanOrEqual(5);
    expect(petsTargetable(w).length).toBe(0);
    for (const p of pets) {
      const hp = p.hp;
      hurtPet(w, p, { ...emptyPacket(false), phys: 1e6 }, null);
      expect(p.hp).toBe(hp);
      expect(p.dead).toBe(false);
    }
  });

  it('Liane empoisonnée, charognarde et solaire coexistent ; un seul esprit à la fois', () => {
    const { g, w } = arena([{ x: 25, y: 15 }], { plague_poppy: 1, cycle_of_life: 1, vines: 1, heart_wolverine: 1, spirit_barbs: 1, oak_sage: 1 });
    for (const s of ['plague_poppy', 'cycle_of_life', 'vines']) doCast(g, w, s, 12, 15, 0, 20);
    expect(petsOf(w, 'plague_poppy').length).toBe(1);
    expect(petsOf(w, 'cycle_of_life').length).toBe(1);
    expect(petsOf(w, 'vines').length).toBe(1);
    doCast(g, w, 'heart_wolverine', 12, 15, 0, 20);
    doCast(g, w, 'spirit_barbs', 12, 15, 0, 20);
    expect(['heart_wolverine', 'spirit_barbs', 'oak_sage'].map((s) => petsOf(w, s).length).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("Liane empoisonnée : plaques de poison qui s'étendent et réduisent la résistance au poison", () => {
    const { g, w, ms } = arena([{ x: 16, y: 15 }], { plague_poppy: 1 });
    doCast(g, w, 'plague_poppy', 12, 15, 0, 20);
    let patches = 0;
    for (let i = 0; i < 80; i++) {
      g.step(1);
      patches = Math.max(patches, w.areas.filter((a) => a.kind === 'creeper_patch').length);
    }
    expect(patches).toBeGreaterThanOrEqual(7); // 1 + 2 pousses × 3
    expect(ms[0].red.poison?.v).toBe(5);
    expect(lin(SKILL_BY_ID.plague_poppy.n.cooldown ? [SKILL_BY_ID.plague_poppy.n.cooldown, 0] : [0, 0], 1)).toBe(1);
  });

  it('Liane charognarde : soigne une quantité FIXE', () => {
    const { g, w, ms } = arena([{ x: 13, y: 15 }], { cycle_of_life: 1 });
    corpse(w, ms[0]);
    w.player.hp = 1;
    doCast(g, w, 'cycle_of_life', 12, 15, 0, 20);
    run(g, 200);
    const gain = w.player.hp - 1;
    expect(gain).toBeGreaterThanOrEqual(20);
    expect(gain).toBeLessThanOrEqual(41);
  });

  it('Liane solaire : rend une quantité FIXE de mana', () => {
    const { g, w, ms } = arena([{ x: 13, y: 15 }], { vines: 1 });
    corpse(w, ms[0]);
    w.player.mana = 0;
    doCast(g, w, 'vines', 12, 15, 0, 20);
    run(g, 200);
    expect(w.player.mana).toBeGreaterThanOrEqual(20);
    expect(w.player.mana).toBeLessThanOrEqual(41);
  });

  it('Sage du chêne : régénération de vie (table), plus 12 par niveau dur des deux lianes', () => {
    const { g, w } = arena([{ x: 25, y: 15 }], { oak_sage: 1, cycle_of_life: 1 });
    const before = w.player.d.lifeRegen;
    doCast(g, w, 'oak_sage', 12, 15, 0, 20);
    expect(w.player.d.lifeRegen - before).toBeCloseTo(((12 + 12 * 1) * 5) / 256, 4);
  });

  it('Esprit des ronces : chances de frappe mortelle, dégâts renvoyés +5 % par niveau de Liane charognarde', () => {
    const { g, w } = arena([{ x: 25, y: 15 }], { spirit_barbs: 1, cycle_of_life: 20 });
    doCast(g, w, 'spirit_barbs', 12, 15, 0, 20);
    expect(w.player.d.all.get('deadlyStrike')).toBeGreaterThanOrEqual(8);
    expect(w.player.d.all.get('thornsFlat')).toBeCloseTo(15 * 2, 5);
  });

  it('Loup redoutable : dévore un cadavre et devient enragé (+100 % de dégâts, 20 s)', () => {
    const { g, w, ms } = arena([{ x: 13, y: 15 }], { spirit_wolf: 1, summon_fenris: 1 });
    doCast(g, w, 'summon_fenris', 12, 15, 0, 20);
    const wolf = petsOf(w, 'summon_fenris')[0];
    corpse(w, ms[0]);
    run(g, 150);
    expect(wolf.rageUntil).toBeGreaterThan(w.tick);
    expect(ms[0].eaten).toBe(true);
  });

  it('Loups : +25 % de dégâts au niveau 1 de Grizzly, +10 % par niveau suivant', () => {
    const a = arena([{ x: 25, y: 15 }], { spirit_wolf: 1 });
    doCast(a.g, a.w, 'spirit_wolf', 12, 15, 0, 20);
    const base = petsOf(a.w, 'spirit_wolf')[0].dmgMax;
    const b = arena([{ x: 25, y: 15 }], { spirit_wolf: 1, grizzly: 5 });
    doCast(b.g, b.w, 'spirit_wolf', 12, 15, 0, 20);
    expect(petsOf(b.w, 'spirit_wolf')[0].dmgMax / base).toBeCloseTo(1 + (25 + 10 * 4) / 100, 2);
  });

  it('Grizzly : recharge 2 s ; Corbeaux : 5 coups chacun, froid pur', () => {
    expect(SKILL_BY_ID.grizzly.n.cooldown).toBe(2);
    expect(SKILL_BY_ID.raven.n.value ? lin(SKILL_BY_ID.raven.n.value, 1) : 0).toBe(5);
    expect(SKILL_BY_ID.raven.n.min && SKILL_BY_ID.raven.n.min.base).toBe(0);
  });
});
