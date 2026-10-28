/** Nécromancien PD2 : comportement de chaque compétence confronté au wiki (mods/pd2/docs/audit/skills-pd2-necromancer.md). */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/sim/game';
import { World } from '../../../../src/sim/world';
import { ZoneBuilder } from '../../../../src/data/zones/builder';
import { addXp, xpToReach } from '../../../../src/sim/progression';
import { SKILL_BY_ID, lin, skillHard } from '../../../../src/data/skills';
import { castNecromancer, curseRadius, bloodWarpCooldown, bloodWarpMinCost } from '../../../../src/sim/necromancer';
import { golemSynergy, minionStats, minionsOf } from '../../../../src/sim/minions';
import { hurtPet as hurtPetFn } from '../../../../src/sim/druid';
import { emptyPacket } from '../../../../src/sim/actors';
import type { Monster } from '../../../../src/sim/actors';

type Spawn = { x: number; y: number };

function arena(spawns: Spawn[], skills: Record<string, number> = {}, difficulty: 0 | 1 | 2 = 0): { g: Game; w: World; ms: Monster[] } {
  const g = new Game(undefined, 'necromancer');
  addXp(g.character, xpToReach(60));
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  for (const s of spawns) b.spawn({ monster: 'zombie', x: s.x, y: s.y, count: 1, r: 0 });
  for (const [k, v] of Object.entries(skills)) g.character.skills[k] = v;
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty, zoneLevel: 30, character: g.character });
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

const cast = (w: World, skill: string, tx: number, ty: number, targetId = 0): void => {
  w.player.cooldowns = {};
  w.player.mode = 'idle';
  w.input.cast = { skill, tx, ty, targetId };
};
const run = (g: Game, n: number): void => {
  for (let i = 0; i < n; i++) g.step(1);
};
/** Lance un sort et laisse la lancée aboutir */
const doCast = (g: Game, w: World, skill: string, tx: number, ty: number, targetId = 0, steps = 20): void => {
  cast(w, skill, tx, ty, targetId);
  run(g, steps);
};
/** Transforme un monstre en cadavre intact */
const corpse = (w: World, m: Monster): void => {
  m.hp = 0;
  w.killMonster(m, null);
};
const curseAt = (w: World, m: Monster, ids: string[]): void => {
  m.curses = ids.map((id) => ({ id, until: w.tick + 5000, level: 1, src: 0 }));
};

describe('Nécromancien PD2 : invocations', () => {
  it('Squelette archer : flèche physique qui traverse (et non un trait de froid)', () => {
    const { g, w, ms } = arena(
      [
        { x: 12, y: 15 },
        { x: 17, y: 15 },
        { x: 19, y: 15 },
      ],
      { raise_skeleton: 1, raise_skeleton_archer: 1 },
    );
    corpse(w, ms[0]);
    doCast(g, w, 'raise_skeleton_archer', ms[0].x, ms[0].y, 0, 10);
    const archer = w.monsters.find((m) => m.pet === 'raise_skeleton_archer')!;
    expect(archer).toBeTruthy();
    const seen: string[] = [];
    let pierce = false;
    for (let i = 0; i < 200; i++) {
      g.step(1);
      for (const mi of w.missiles) {
        seen.push(`${mi.kind}:${mi.elem}`);
        if (mi.pierce) pierce = true;
      }
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === 'arrow:phys')).toBe(true);
    expect(pierce).toBe(true);
  });

  it('Mage squelette : projectile élémentaire qui traverse', () => {
    const { g, w, ms } = arena(
      [
        { x: 12, y: 15 },
        { x: 17, y: 15 },
      ],
      { raise_skeleton: 1, skeletal_mage: 1 },
    );
    corpse(w, ms[0]);
    doCast(g, w, 'skeletal_mage', ms[0].x, ms[0].y, 0, 10);
    expect(w.monsters.some((m) => m.pet === 'skeletal_mage')).toBe(true);
    let pierce = false;
    for (let i = 0; i < 200; i++) {
      g.step(1);
      if (w.missiles.some((mi) => mi.pierce)) pierce = true;
    }
    expect(pierce).toBe(true);
  });

  it('Guerrier squelette : dégâts de zone de mêlée sur les voisins de la cible', () => {
    const { g, w, ms } = arena(
      [
        { x: 12, y: 15 },
        { x: 13, y: 15 },
        { x: 13, y: 15.8 },
      ],
      { raise_skeleton: 5, skeleton_mastery: 1 },
    );
    corpse(w, ms[0]);
    doCast(g, w, 'raise_skeleton', ms[0].x, ms[0].y, 0, 10);
    const sk = minionsOf(w, 'raise_skeleton')[0];
    expect(sk).toBeTruthy();
    sk.dmgMin = sk.dmgMax = 100;
    sk.ar = 1e6;
    const h = [ms[1].hp, ms[2].hp];
    sk.x = sk.px = 12.4;
    sk.y = sk.py = 15;
    run(g, 120);
    expect(ms[1].hp < h[0] || ms[2].hp < h[1]).toBe(true);
    expect(ms[1].hp < h[0] && ms[2].hp < h[1], 'la cible et son voisin sont tous deux touchés').toBe(true);
  });

  it('Maîtrise des squelettes : +15 de vie par niveau et vitesse des guerriers / mages (tables du wiki)', () => {
    const { w } = arena([], { skeleton_mastery: 10, raise_skeleton: 5 });
    const n = SKILL_BY_ID.skeleton_mastery.n;
    expect(lin(n.value, 10)).toBe(150);
    expect(lin(n.v3!, 10)).toBe(10);
    expect(lin(n.v4!, 10)).toBe(10);
    const plain = arena([], { raise_skeleton: 5 }).w;
    expect(minionStats(w, 'raise_skeleton', 5).speed!).toBeGreaterThan(minionStats(plain, 'raise_skeleton', 5).speed!);
  });

  it('Synergies de dégâts des squelettes et des golems (Maîtrise, golems entre eux)', () => {
    const base = arena([], { raise_skeleton: 5 }).w;
    const syn = arena([], { raise_skeleton: 5, skeleton_mastery: 10 }).w;
    const a = minionStats(base, 'raise_skeleton', 5).dmg[1];
    const b = minionStats(syn, 'raise_skeleton', 5).dmg[1];
    expect(b / a).toBeGreaterThan(1.6);
    const g = arena([], { clay_golem: 1, golem_mastery: 5, blood_golem: 2 }).w;
    // Golem d'argile : 40 % par point de Maîtrise des golems et de Golem de sang
    expect(golemSynergy(g, 'clay_golem')).toBeCloseTo(1 + 0.4 * (5 + 2), 5);
    expect(golemSynergy(g, 'blood_golem')).toBeCloseTo(1 + 0.12 * (5 + 1), 5);
  });

  it('Maîtrise des golems : +10 % de vie par niveau (et non 20 %)', () => {
    expect(lin(SKILL_BY_ID.golem_mastery.n.value, 10)).toBe(100);
    expect(lin(SKILL_BY_ID.golem_mastery.n.value, 1)).toBe(10);
  });

  it('Golems : recharge de 1 s indépendante par type', () => {
    for (const id of ['clay_golem', 'blood_golem', 'iron_golem', 'fire_golem']) expect(SKILL_BY_ID[id].n.cooldown, id).toBe(1);
    const { g, w } = arena([], { clay_golem: 1, blood_golem: 1, golem_mastery: 10 });
    w.player.cooldowns = {};
    w.input.cast = { skill: 'clay_golem', tx: 12, ty: 15, targetId: 0 };
    run(g, 20);
    expect((w.player.cooldowns.clay_golem ?? 0) > w.tick, "le Golem d'argile est en recharge").toBe(true);
    expect((w.player.cooldowns.blood_golem ?? 0) > w.tick).toBe(false);
  });

  it('Golem de fer : immunisé au poison', () => {
    const { g, w } = arena([], { clay_golem: 1, blood_golem: 1, iron_golem: 1 });
    doCast(g, w, 'iron_golem', 12, 15, 0, 10);
    const gl = minionsOf(w, 'iron_golem')[0];
    expect(gl.res.poison).toBe(100);
  });

  it("Golem d'argile : lent de 3 % au niveau 1 (table du wiki), 20 % de coups écrasants", () => {
    expect(lin(SKILL_BY_ID.clay_golem.n.value, 1)).toBe(3);
    expect(lin(SKILL_BY_ID.clay_golem.n.value, 12)).toBe(18);
  });

  it('Golem de sang : 8 de vie par coup au Nécromancien et blessures ouvertes (niveau 1)', () => {
    const n = SKILL_BY_ID.blood_golem.n;
    expect(lin(n.value2!, 1)).toBe(8);
    expect(lin(n.v3!, 1)).toBe(30);
    const { g, w, ms } = arena([{ x: 12, y: 15 }], { clay_golem: 1, blood_golem: 1 });
    doCast(g, w, 'blood_golem', 11.5, 15, 0, 10);
    const gl = minionsOf(w, 'blood_golem')[0];
    gl.dmgMin = gl.dmgMax = 50;
    gl.ar = 1e6;
    gl.x = gl.px = 11.4;
    gl.y = gl.py = 15;
    w.player.hp = w.player.hpMax - 1000;
    const hp0 = w.player.hp;
    run(g, 100);
    expect(w.player.hp).toBeGreaterThan(hp0);
    expect(ms[0].bleedT ?? 0).toBeGreaterThan(0);
  });

  it('Golem de feu : aura de 8 yards (4 unités) toutes les 1,2 s', () => {
    const { g, w, ms } = arena(
      [
        { x: 13.5, y: 15 },
        { x: 17, y: 15 },
      ],
      { clay_golem: 1, blood_golem: 1, iron_golem: 1, fire_golem: 1 },
    );
    doCast(g, w, 'fire_golem', 11, 15, 0, 25);
    const gl = minionsOf(w, 'fire_golem')[0];
    gl.x = gl.px = 11;
    gl.y = gl.py = 15;
    gl.speed = 0;
    gl.dmgMin = gl.dmgMax = 0;
    const h = ms.map((m) => m.hp);
    run(g, 40);
    expect(ms[0].hp, "à 2,5 unités : dans l'aura").toBeLessThan(h[0]);
    expect(ms[1].hp, "à 6 unités : hors de l'aura").toBe(h[1]);
  });

  it("Ressusciter : +50 % de vitesse, dégâts physiques +30 %/niveau et plus d'effet de la Maîtrise des squelettes", () => {
    const { g, w, ms } = arena([{ x: 12, y: 15 }], { raise_skeleton: 1, skeleton_mastery: 20, skeletal_mage: 1, raise_skeleton_archer: 1, revive: 5 });
    ms[0].dmgMin = ms[0].dmgMax = 100;
    ms[0].speed = 5;
    corpse(w, ms[0]);
    doCast(g, w, 'revive', ms[0].x, ms[0].y, 0, 10);
    const r = minionsOf(w, 'revive')[0];
    expect(r).toBeTruthy();
    expect(r.speed).toBeCloseTo(7.5, 5);
    expect(lin(SKILL_BY_ID.revive.n.value!, 5)).toBe(150);
    // 100 × 0,6 × (1 + 150 %) ; pas de bonus de Maîtrise des squelettes (niveau 20 aurait ajouté beaucoup plus)
    expect(r.dmgMin).toBeCloseTo(100 * 0.6 * 2.5, 3);
  });
});

describe('Nécromancien PD2 : os et poison', () => {
  it("Lance d'os : 1 lance, 2 au niveau 15, 3 au niveau 25", () => {
    for (const [lvl, n] of [
      [1, 1],
      [14, 1],
      [15, 2],
      [24, 2],
      [25, 3],
    ] as const) {
      const { g, w } = arena([{ x: 16, y: 15 }], { teeth: 1, bone_spear: lvl });
      cast(w, 'bone_spear', 16, 15);
      for (let i = 0; i < 40 && !w.missiles.some((m) => m.kind === 'bone_spear'); i++) g.step(1);
      expect(w.missiles.filter((m) => m.kind === 'bone_spear').length, `niveau ${lvl}`).toBe(n);
    }
  });

  it("Armure d'os : recharge de 2 s et +10 % de défense par point", () => {
    expect(SKILL_BY_ID.bone_armor.n.cooldown).toBe(2);
    expect(skillHard('bone_armor', 'Defense +%', 5)).toBe(50);
    const a = arena([], { teeth: 1, bone_armor: 5 });
    const before = a.w.player.d.defense;
    doCast(a.g, a.w, 'bone_armor', 10, 15, 0, 20);
    expect(a.w.player.d.defense).toBeGreaterThan(before);
  });

  it('Explosion de cadavre : dégâts de la table + 5 à 10 % de la vie du cadavre, rayon de 5 yards', () => {
    const { g, w, ms } = arena(
      [
        { x: 12, y: 15 },
        { x: 14.2, y: 15 },
        { x: 18, y: 15 },
      ],
      { poison_dagger: 1, corpse_explosion: 1 },
    );
    const c = ms[0];
    c.hpMax = 10000;
    corpse(w, c);
    const h = [ms[1].hp, ms[2].hp];
    doCast(g, w, 'corpse_explosion', c.x, c.y, 0, 15);
    expect(lin(SKILL_BY_ID.corpse_explosion.n.radius, 1)).toBeCloseTo(2.5, 5);
    const dmg = h[0] - ms[1].hp;
    // niveau 1 : 2-5 physique + 2-5 feu, + 500 à 1000 de la vie du cadavre
    expect(dmg).toBeGreaterThan(500 * 0.9);
    expect(dmg).toBeLessThan(1000 + 20);
    expect(ms[2].hp, 'hors du rayon').toBe(h[1]);
    expect(c.eaten).toBe(true);
  });

  it('Frappe empoisonnée : nuage de 2,66 yards au coup, et nuage à la mort du porteur empoisonné', () => {
    const { g, w, ms } = arena(
      [
        { x: 11.2, y: 15 },
        { x: 11.2, y: 16.2 },
        { x: 11.2, y: 17.6 },
      ],
      { poison_dagger: 5 },
    );
    w.player.d.attackRating = 1e6;
    const mh = w.character.equipment;
    void mh;
    run(g, 2);
    w.player.x = 10.4;
    w.player.y = 15;
    // le coup peut rater : on relance jusqu'à toucher
    for (let i = 0; i < 40 && !ms[0].psCloud; i++) castNecromancer(w, 'poison_dagger', ms[0].x, ms[0].y, ms[0].id, 5);
    expect(ms[0].psCloud, 'la cible est empoisonnée').toBeDefined();
    expect((ms[1].poisonT ?? 0) > 0, 'le voisin est empoisonné par le nuage').toBe(true);
    expect(ms[2].poisonT ?? 0, "le troisième, hors du nuage, ne l'est pas").toBe(0);
    // mort du porteur : un nuage se libère
    ms[1].poisonT = 50;
    ms[1].hp = 1;
    w.killMonster(ms[1], null);
    expect((ms[2].poisonT ?? 0) > 0, 'nuage de mort').toBe(true);
  });

  it('Profanation : cinq cadavres (dix au plus) et un nuage de poison de 4 yards chacun', () => {
    const { g, w, ms } = arena(
      [
        { x: 16, y: 15 },
        { x: 16, y: 16 },
        { x: 28, y: 15 },
      ],
      { poison_dagger: 1, corpse_explosion: 1, desecrate: 5 },
    );
    const before = w.monsters.filter((m) => m.dead).length;
    doCast(g, w, 'desecrate', ms[0].x, ms[0].y, ms[0].id, 15);
    const made = w.monsters.filter((m) => m.desecrated);
    expect(made.length).toBe(5);
    expect(made.every((m) => m.dead && !m.eaten)).toBe(true);
    expect(w.monsters.filter((m) => m.dead).length - before).toBe(5);
    expect((ms[0].poisonT ?? 0) > 0 && (ms[1].poisonT ?? 0) > 0).toBe(true);
    expect(ms[2].poisonT ?? 0, 'monstre lointain').toBe(0);
    doCast(g, w, 'desecrate', ms[0].x, ms[0].y, ms[0].id, 5);
    expect(w.monsters.filter((m) => m.desecrated && !m.eaten).length, 'dix cadavres au plus').toBeLessThanOrEqual(10);
    // les cadavres servent à Explosion de cadavre
    const exp = w.monsters.filter((m) => m.desecrated && !m.eaten).length;
    doCast(g, w, 'corpse_explosion', ms[0].x, ms[0].y, 0, 10);
    expect(w.monsters.filter((m) => m.desecrated && !m.eaten).length).toBe(exp - 1);
  });

  it("Mur d'os : recharge de 1 s, renvoie des dégâts fixes ; Prison d'os : recharge de 5 s", () => {
    expect(SKILL_BY_ID.bone_wall.n.cooldown).toBe(1);
    expect(SKILL_BY_ID.bone_prison.n.cooldown).toBe(5);
    expect(lin(SKILL_BY_ID.bone_wall.n.value, 1)).toBe(15);
    const { g, w, ms } = arena([{ x: 13, y: 15 }], { teeth: 1, bone_armor: 1, bone_wall: 1 });
    doCast(g, w, 'bone_wall', 12.5, 15, 0, 10);
    const wall = w.monsters.find((m) => m.pet === 'bone_wall')!;
    expect(wall).toBeTruthy();
    // un monstre frappe le mur : il subit les dégâts renvoyés
    const hp0 = ms[0].hp;
    wall.hp = wall.hpMax = 1e6;
    ms[0].dmgMin = ms[0].dmgMax = 10;
    ms[0].ar = 1e6;
    ms[0].x = ms[0].px = wall.x + 0.7;
    ms[0].y = ms[0].py = wall.y;
    ms[0].aggro = true;
    ms[0].speed = 3;
    // attaque directe via le chemin de dégâts des créatures
    hurtPetFn(w, wall, { ...emptyPacket(false), phys: 10 }, ms[0]);
    expect(ms[0].hp).toBeLessThan(hp0);
  });
});

describe('Nécromancien PD2 : malédictions', () => {
  it('rayons de la table en yards (6 yards = 3 unités pour Amplification), +0,66 yard par trois niveaux de Maîtrise', () => {
    const a = arena([], { amplify_damage: 1 }).w;
    expect(curseRadius(a, 'amplify_damage')).toBeCloseTo(3, 5);
    expect(curseRadius(a, 'weaken')).toBeCloseTo(4, 5);
    expect(curseRadius(a, 'terror')).toBeCloseTo(3, 5);
    const b = arena([], { amplify_damage: 1, curse_mastery: 6 }).w;
    expect(curseRadius(b, 'amplify_damage')).toBeCloseTo((6 + 0.66 * 2) / 2, 5);
  });

  it('Amplification : une cible à 2,5 unités est maudite (rayon PD2), une à 4 non', () => {
    const { g, w, ms } = arena(
      [
        { x: 12, y: 15 },
        { x: 14.5, y: 15 },
        { x: 18.5, y: 15 },
      ],
      { amplify_damage: 1 },
    );
    doCast(g, w, 'amplify_damage', ms[0].x, ms[0].y, ms[0].id, 15);
    expect(ms[0].curses?.some((c) => c.id === 'amplify_damage')).toBe(true);
    expect(ms[1].curses?.some((c) => c.id === 'amplify_damage')).toBe(true);
    expect(ms[2].curses?.length ?? 0).toBe(0);
    expect(ms[0].red.phys?.v).toBe(11);
  });

  it('Affaiblissement : dégâts −10 % et défense −10 % au niveau 1', () => {
    const { g, w, ms } = arena([{ x: 12, y: 15 }], { amplify_damage: 1, life_tap: 1, weaken: 1 });
    ms[0].defense = 1000;
    doCast(g, w, 'weaken', ms[0].x, ms[0].y, ms[0].id, 15);
    expect(ms[0].dmgMul).toBeCloseTo(0.9, 5);
    expect(ms[0].defMul).toBeCloseTo(0.9, 5);
  });

  it("Décrépitude : déplacement −10 %, cadence d'attaque −10 % (plafond −60 %), résistance physique réduite", () => {
    const { g, w, ms } = arena([{ x: 12, y: 15 }], { amplify_damage: 1, life_tap: 1, weaken: 1, decrepify: 1 });
    doCast(g, w, 'decrepify', ms[0].x, ms[0].y, ms[0].id, 15);
    expect(ms[0].curseMove).toBeCloseTo(0.9, 5);
    expect(ms[0].curseAtk).toBeCloseTo(0.9, 5);
    expect(ms[0].red.phys?.v).toBeGreaterThanOrEqual(10);
    expect(ms[0].dmgMul, 'plus de réduction des dégâts (retirée en PD2)').toBeUndefined();
  });

  it('Terreur : fuite 3 s, vitesse −15 % (hors boss et uniques)', () => {
    const { g, w, ms } = arena([{ x: 12, y: 15 }], { dim_vision: 1, terror: 1 });
    doCast(g, w, 'terror', ms[0].x, ms[0].y, ms[0].id, 15);
    expect(ms[0].curseMove, '1 point : −17 % (table du wiki)').toBeCloseTo(0.83, 5);
    expect((ms[0].fleeUntil ?? 0) > w.tick).toBe(true);
    expect(SKILL_BY_ID.terror.n.duration && lin(SKILL_BY_ID.terror.n.duration, 1)).toBe(3);
  });

  it("Confusion : 20 s, cadence d'attaque +50 %, durée ÷2 en Cauchemar et ÷4 en Enfer", () => {
    const times: number[] = [];
    for (const d of [0, 1, 2] as const) {
      const { g, w, ms } = arena([{ x: 12, y: 15 }], { dim_vision: 1, terror: 1, confuse: 1 }, d);
      doCast(g, w, 'confuse', ms[0].x, ms[0].y, ms[0].id, 15);
      expect(ms[0].curseAtk).toBeCloseTo(1.5, 5);
      times.push(((ms[0].confusedUntil ?? 0) - w.tick) / 25);
    }
    expect(times[0]).toBeGreaterThan(18);
    expect(times[1] / times[0]).toBeCloseTo(0.5, 1);
    expect(times[2] / times[0]).toBeCloseTo(0.25, 1);
  });

  it('Attraction : aucune autre malédiction ne la remplace', () => {
    const { g, w, ms } = arena([{ x: 12, y: 15 }], { dim_vision: 1, terror: 1, confuse: 1, attract: 1, amplify_damage: 1 });
    doCast(g, w, 'attract', ms[0].x, ms[0].y, ms[0].id, 15);
    expect(ms[0].curses?.map((c) => c.id)).toEqual(['attract']);
    doCast(g, w, 'amplify_damage', ms[0].x, ms[0].y, ms[0].id, 15);
    expect(ms[0].curses?.map((c) => c.id)).toEqual(['attract']);
  });

  it('Maîtrise des malédictions : deux malédictions au niveau 10, chacune garde sa durée', () => {
    const { g, w, ms } = arena([{ x: 12, y: 15 }], { amplify_damage: 1, dim_vision: 1, curse_mastery: 10 });
    doCast(g, w, 'amplify_damage', ms[0].x, ms[0].y, ms[0].id, 15);
    doCast(g, w, 'dim_vision', ms[0].x, ms[0].y, ms[0].id, 15);
    expect(ms[0].curses?.length).toBe(2);
    // Vision réduite (7 s) s'éteint avant Amplification (6 s +0,2/niv.) : l'effet de l'autre persiste
    run(g, 25 * 8);
    expect(ms[0].curses?.some((c) => c.id === 'dim_vision')).toBe(false);
    expect(ms[0].blindUntil === undefined || ms[0].blindUntil <= w.tick).toBe(true);
  });

  it('Drain de vie : vol de vie 8 % (+2 %/point) et +1 % par deux niveaux de Maîtrise', () => {
    const { g, w, ms } = arena([{ x: 12, y: 15 }], { amplify_damage: 1, life_tap: 1, curse_mastery: 4 });
    doCast(g, w, 'life_tap', ms[0].x, ms[0].y, ms[0].id, 15);
    expect(ms[0].curses?.find((c) => c.id === 'life_tap')?.v, '8 % + 2 %/point + 1 % par deux niveaux de Maîtrise').toBe(10 + 2);
  });

  it('Pacte sombre : dévore une malédiction (jamais la dernière) et explose, plus fort avec plusieurs malédictions', () => {
    const { g, w, ms } = arena(
      [
        { x: 12, y: 15 },
        { x: 12.8, y: 15 },
        { x: 20, y: 15 },
      ],
      { amplify_damage: 1, dark_pact: 5, curse_mastery: 10 },
    );
    curseAt(w, ms[0], ['amplify_damage', 'weaken', 'terror']);
    curseAt(w, ms[2], ['weaken']);
    const h = ms.map((m) => m.hp);
    doCast(g, w, 'dark_pact', ms[0].x, ms[0].y, ms[0].id, 15);
    expect(
      ms[0].curses?.map((c) => c.id),
      'la plus ancienne est dévorée',
    ).toEqual(['weaken', 'terror']);
    expect(ms[0].hp).toBeLessThan(h[0]);
    expect(ms[1].hp, "le voisin dans le rayon d'explosion est touché").toBeLessThan(h[1]);
    expect(ms[2].hp, 'hors de la zone de lancement').toBe(h[2]);
    // une seule malédiction : conservée
    curseAt(w, ms[0], ['weaken']);
    doCast(g, w, 'dark_pact', ms[0].x, ms[0].y, ms[0].id, 15);
    expect(ms[0].curses?.length).toBe(1);
  });
});

describe('Nécromancien PD2 : Distorsion de sang', () => {
  it('recharge 5,8 s au niveau 1 (−0,2 s par niveau), coût minimal, vie rendue en 5 s', () => {
    expect(bloodWarpCooldown(1)).toBeCloseTo(5.8, 5);
    expect(bloodWarpCooldown(30)).toBe(0);
    expect(bloodWarpMinCost(arena([]).w, 1)).toBe(2);
    expect(bloodWarpMinCost(arena([]).w, 40)).toBe(60);
    const { g, w } = arena([], { clay_golem: 1, blood_golem: 1, blood_warp: 1 });
    const p = w.player;
    p.hp = 100;
    cast(w, 'blood_warp', p.x + 5, p.y);
    run(g, 30);
    expect(p.hp, '12 % de la vie actuelle').toBeLessThan(93);
    expect((p.cooldowns.blood_warp ?? 0) - w.tick).toBeGreaterThan(25 * 4);
    expect(p.warpRegen, 'la vie cédée revient peu à peu').toBeDefined();
    run(g, 25 * 6);
    expect(p.warpRegen).toBeUndefined();
  });
});
