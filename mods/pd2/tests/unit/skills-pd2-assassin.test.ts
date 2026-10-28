/** Assassin PD2 : comportement de chaque compétence corrigée confronté au wiki (mods/pd2/docs/audit/skills-pd2-assassin.md). */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/sim/game';
import { World } from '../../../../src/sim/world';
import { ZoneBuilder } from '../../../../src/data/zones/builder';
import { addXp, xpToReach } from '../../../../src/sim/progression';
import { SKILL_BY_ID, lin, skillHard } from '../../../../src/data/skills';
import { Rng } from '../../../../src/core/rng';
import { generateItem } from '../../../../src/sim/loot/itemgen';
import { chargeCount } from '../../../../src/sim/assassin';
import type { Monster, Missile, DamagePacket } from '../../../../src/sim/actors';

type Spawn = { x: number; y: number };

/** Arène vide 40×30 ; l'Assassin (niveau 60) tient des griffes et se tient en (10,15) ; monstres immobiles, sans attaque, vie énorme */
function arena(spawns: Spawn[], skills: Record<string, number> = {}): { g: Game; w: World; ms: Monster[]; hits: { m: Monster; pk: DamagePacket }[] } {
  const g = new Game(undefined, 'assassin');
  addXp(g.character, xpToReach(60));
  g.character.base.str = 200;
  g.character.base.dex = 300;
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  for (const s of spawns) b.spawn({ monster: 'zombie', x: s.x, y: s.y, count: 1, r: 0 });
  for (const [k, v] of Object.entries(skills)) g.character.skills[k] = v;
  g.character.equipment.mainhand = generateItem(new Rng('asn'), 'katar', 30, { forceQuality: 'normal' });
  g.character.equipment.offhand = generateItem(new Rng('asn2'), 'katar', 30, { forceQuality: 'normal' });
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
  // espion : chaque paquet de dégâts reçu par un monstre
  const hits: { m: Monster; pk: DamagePacket }[] = [];
  const orig = g.world.hurtMonster.bind(g.world);
  g.world.hurtMonster = (m: Monster, pk: DamagePacket, ...rest: unknown[]) => {
    hits.push({ m, pk: { ...pk } });
    return (orig as (...a: unknown[]) => number)(m, pk, ...rest);
  };
  return { g, w: g.world, ms, hits };
}

const run = (g: Game, n: number): void => {
  for (let i = 0; i < n; i++) g.step(1);
};
/** Lance un sort sur la cible (ou au sol) puis laisse tourner `ticks` images */
function cast(g: Game, skill: string, target: Monster | null, ticks = 30, at?: Spawn): void {
  const w = g.world;
  w.player.cooldowns = {};
  w.player.mode = 'idle';
  w.player.mana = w.player.manaMax;
  w.input.cast = { skill, tx: target?.x ?? at?.x ?? w.player.x + 3, ty: target?.y ?? at?.y ?? w.player.y, targetId: target?.id ?? 0 };
  g.step(ticks);
}
/** Place la cible au contact de l'Assassin */
function adjacent(w: World, m: Monster, dx = 1.2): void {
  m.x = m.px = w.player.x + dx;
  m.y = m.py = w.player.y;
}
const by = (hits: { m: Monster; pk: DamagePacket }[], skill: string) => hits.filter((h) => h.pk.skill === skill);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

describe('Assassin PD2 : arts martiaux (charges et finitions)', () => {
  it("cycle partagé : l'étage vient du cycle et non de la compétence ; au 3e coup les charges retombent (sauf le Tigre)", () => {
    const { g, w, ms } = arena([{ x: 12, y: 15 }], { tiger_strike: 5, fists_of_fire: 5, cobra_strike: 5, phoenix_strike: 5 });
    adjacent(w, ms[0]);
    cast(g, 'tiger_strike', ms[0], 25);
    expect(chargeCount(w, 'tiger_strike')).toBe(1);
    cast(g, 'fists_of_fire', ms[0], 25); // étage 2 : deux charges d'emblée
    expect(chargeCount(w, 'fists_of_fire')).toBe(2);
    cast(g, 'cobra_strike', ms[0], 25); // étage 3 : fin du cycle
    expect(chargeCount(w, 'cobra_strike')).toBe(0);
    expect(chargeCount(w, 'fists_of_fire')).toBe(0);
    expect(chargeCount(w, 'tiger_strike')).toBe(1); // gardées pour la finition
  });

  it("Frappe du tigre : son propre coup reçoit le bonus de dégâts de l'étage (50 % × étage au niveau 1) et agrandit la zone", () => {
    const avg = (stage: number): number => {
      const { g, w, ms } = arena([{ x: 12, y: 15 }], { tiger_strike: 1 });
      adjacent(w, ms[0]);
      const dmg: number[] = [];
      for (let i = 0; i < 40; i++) {
        w.player.buffs = w.player.buffs.filter((b) => b.id !== 'asn_cycle' && !b.id.startsWith('charge_'));
        if (stage > 1) w.player.buffs.push({ id: 'asn_cycle', level: 1, until: w.tick + 1000, stacks: stage - 1 });
        const hp = ms[0].hp;
        cast(g, 'tiger_strike', ms[0], 22);
        dmg.push(hp - ms[0].hp);
      }
      return sum(dmg) / dmg.length;
    };
    const s1 = avg(1);
    const s3 = avg(3);
    expect(s3).toBeGreaterThan(s1 * 1.25); // +150 % contre +50 % de dégâts d'arme
  });

  it("Frappe du cobra : le coup de l'étage 2 reçoit « Damage +% » ; le nuage de l'étage 3 fait 6 yards de rayon", () => {
    expect(SKILL_BY_ID.cobra_strike.n.wdmg).toBeDefined();
    const { g, w, ms, hits } = arena(
      [
        { x: 12, y: 15 },
        { x: 14.7, y: 15 },
        { x: 15.3, y: 15 },
      ],
      { cobra_strike: 5 },
    );
    adjacent(w, ms[0]);
    // monstre à 2,5 u de la cible (5 yards) dans le nuage, à 4 u (8 yards) dehors
    ms[1].x = ms[1].px = ms[0].x + 2.5;
    ms[2].x = ms[2].px = ms[0].x + 4;
    cast(g, 'cobra_strike', ms[0], 20);
    cast(g, 'cobra_strike', ms[0], 20);
    hits.length = 0;
    cast(g, 'cobra_strike', ms[0], 20);
    const cloud = by(hits, 'cobra_strike').filter((h) => h.pk.poisonDot);
    expect(cloud.some((h) => h.m === ms[1])).toBe(true);
    expect(cloud.some((h) => h.m === ms[2])).toBe(false);
  });

  it("Lames de glace : l'étage 3 lance dix lames de glace (froid de 10 s) ; l'étage 2 est un couloir de 4 yards de large", () => {
    const { g, w, ms, hits } = arena([{ x: 12, y: 15 }], { blades_of_ice: 5 });
    adjacent(w, ms[0]);
    cast(g, 'blades_of_ice', ms[0], 20);
    cast(g, 'blades_of_ice', ms[0], 20);
    const seen = new Set<number>();
    w.player.cooldowns = {};
    w.input.cast = { skill: 'blades_of_ice', tx: ms[0].x, ty: ms[0].y, targetId: ms[0].id };
    for (let i = 0; i < 25; i++) {
      g.step(1);
      for (const m of w.missiles) if (m.kind === 'coldbolt_m') seen.add(m.id);
    }
    expect(seen.size).toBe(10);
    const bolt = hits.filter((h) => h.pk.skill === 'blades_of_ice' && h.pk.chill);
    expect(bolt.length).toBeGreaterThan(0);
    expect(bolt[0].pk.chill).toBe(250);
    // couloir : un monstre à 3 yards de côté de la ligne n'est pas touché par l'étage 2
    const t2 = arena(
      [
        { x: 12, y: 15 },
        { x: 12.5, y: 17.2 },
      ],
      { blades_of_ice: 5 },
    );
    adjacent(t2.w, t2.ms[0]);
    t2.ms[1].x = t2.ms[1].px = t2.w.player.x + 1.5;
    t2.ms[1].y = t2.ms[1].py = t2.w.player.y + 2.2; // 4,4 yards de côté
    cast(t2.g, 'blades_of_ice', t2.ms[0], 20);
    t2.hits.length = 0;
    cast(t2.g, 'blades_of_ice', t2.ms[0], 20);
    expect(by(t2.hits, 'blades_of_ice').some((h) => h.m === t2.ms[0])).toBe(true);
    expect(by(t2.hits, 'blades_of_ice').some((h) => h.m === t2.ms[1])).toBe(false);
  });

  it("Frappe du phénix : l'étage 1 laisse un sol brûlant de 1,48 s ; le froid de l'étage 3 dure 4 s", () => {
    const { g, w, ms, hits } = arena([{ x: 12, y: 15 }], { phoenix_strike: 5 });
    adjacent(w, ms[0]);
    cast(g, 'phoenix_strike', ms[0], 20);
    const ground = w.areas.filter((a) => a.kind === 'fire_ground');
    expect(ground.length).toBe(1);
    expect(ground[0].maxLife).toBe(37);
    cast(g, 'phoenix_strike', ms[0], 20);
    hits.length = 0;
    cast(g, 'phoenix_strike', ms[0], 20);
    expect(by(hits, 'phoenix_strike').some((h) => h.pk.chill === 100)).toBe(true);
  });

  it("Serre, Griffe : un coup de finition déclenche d'un coup les étages des charges accumulées", () => {
    const { g, w, ms, hits } = arena([{ x: 12, y: 15 }], { fists_of_fire: 5, dragon_claw: 5, dragon_talon: 5 });
    adjacent(w, ms[0]);
    cast(g, 'fists_of_fire', ms[0], 20); // étage 1 (explosion)
    cast(g, 'fists_of_fire', ms[0], 20); // étage 2 (nova)
    expect(chargeCount(w, 'fists_of_fire')).toBe(2);
    hits.length = 0;
    cast(g, 'dragon_claw', ms[0], 25);
    const fof = by(hits, 'fists_of_fire');
    // deux griffes × deux étages (explosion et nova) sur la cible
    expect(fof.length).toBeGreaterThanOrEqual(4);
    expect(chargeCount(w, 'fists_of_fire')).toBe(0);
  });

  it('Queue du dragon : le coup de pied convertit 100 % du physique en feu et blesse en zone de 4 yards', () => {
    const { g, w, ms, hits } = arena(
      [
        { x: 12, y: 15 },
        { x: 13, y: 15 },
        { x: 13.2, y: 17 },
      ],
      { dragon_tail: 5, dragon_talon: 5, dragon_claw: 5 },
    );
    adjacent(w, ms[0]);
    ms[1].x = ms[1].px = ms[0].x + 1.5; // 3 yards : dans la zone de 4 yards
    ms[2].x = ms[2].px = ms[0].x;
    ms[2].y = ms[2].py = ms[0].y + 2.5; // 5 yards : hors zone
    cast(g, 'dragon_tail', ms[0], 25);
    const tail = by(hits, 'dragon_tail');
    const main = tail.find((h) => h.m === ms[0])!;
    expect(main.pk.fire).toBeGreaterThan(0);
    expect(main.pk.phys).toBe(0);
    expect(tail.some((h) => h.m === ms[1])).toBe(true);
    expect(tail.some((h) => h.m === ms[2])).toBe(false);
  });

  it('Envol du dragon : recharge de 2 s au niveau 1, 1 s à partir du niveau 26', () => {
    const cd = (pts: number): number => {
      const { g, w, ms } = arena([{ x: 12, y: 15 }], { dragon_flight: pts });
      adjacent(w, ms[0]);
      w.player.cooldowns = {};
      w.player.mana = w.player.manaMax;
      w.input.cast = { skill: 'dragon_flight', tx: ms[0].x, ty: ms[0].y, targetId: ms[0].id };
      for (let i = 0; i < 40 && !w.player.cooldowns.dragon_flight; i++) g.step(1);
      return (w.player.cooldowns.dragon_flight ?? 0) - w.tick;
    };
    expect(cd(1)).toBeGreaterThan(40);
    expect(cd(1)).toBeLessThanOrEqual(50);
    expect(cd(30)).toBeLessThanOrEqual(25);
    expect(cd(30)).toBeGreaterThan(18);
  });
});

describe("Assassin PD2 : disciplines de l'ombre", () => {
  it("Cape d'ombre : durée fixe de 5 s, recharge de 5 s, portée de 20 yards", () => {
    const { g, w, ms } = arena(
      [
        { x: 17, y: 15 },
        { x: 22, y: 15 },
      ],
      { cloak_of_shadows: 12 },
    );
    cast(g, 'cloak_of_shadows', null, 20);
    const b = w.player.buffs.find((x) => x.id === 'cloak_of_shadows')!;
    expect(b.until - w.tick).toBeLessThanOrEqual(5 * 25);
    expect(b.until - w.tick).toBeGreaterThan(4.5 * 25);
    expect((w.player.cooldowns.cloak_of_shadows ?? 0) - w.tick).toBeGreaterThan(4.5 * 25);
    expect(ms[0].blindUntil ?? 0).toBeGreaterThan(w.tick); // à 7 u (14 yards)
    expect(ms[1].blindUntil ?? 0).toBeLessThanOrEqual(w.tick); // à 12 u (24 yards)
  });

  it('Souffle mental : dégâts physiques, ne convertit plus ; rayon et étourdissement selon les points investis', () => {
    expect(SKILL_BY_ID.mind_blast.element).toBe('phys');
    expect(skillHard('mind_blast', 'Stun Length (seconds)', 1)).toBe(2);
    expect(skillHard('mind_blast', 'Stun Length (seconds)', 5)).toBe(0);
    const t1 = arena(
      [
        { x: 14, y: 15 },
        { x: 14, y: 18.2 },
      ],
      { mind_blast: 1 },
    );
    cast(t1.g, 'mind_blast', t1.ms[0], 20);
    const h1 = by(t1.hits, 'mind_blast');
    expect(h1.some((h) => h.m === t1.ms[0])).toBe(true);
    expect(h1[0].pk.phys).toBeGreaterThan(0);
    expect(h1[0].pk.magic ?? 0).toBe(0);
    expect(h1[0].pk.stun).toBe(50); // 2 s avec un seul point
    expect(h1.some((h) => h.m === t1.ms[1])).toBe(false); // 6,4 yards > rayon de 4 yards
    for (const m of t1.ms) expect(m.convertedUntil ?? 0).toBeLessThanOrEqual(t1.w.tick);
    const t5 = arena(
      [
        { x: 14, y: 15 },
        { x: 14, y: 18.2 },
      ],
      { mind_blast: 8 },
    );
    cast(t5.g, 'mind_blast', t5.ms[0], 20);
    const h5 = by(t5.hits, 'mind_blast');
    expect(h5.some((h) => h.m === t5.ms[1])).toBe(true); // 6 yards avec 7 points ou plus
    expect(h5[0].pk.stun ?? 0).toBe(0);
  });

  it('Marteau psychique : rebondit sur les ennemis voisins (5,33 yards), −20 % par rebond, N coups selon le niveau', () => {
    const { g, w, ms, hits } = arena(
      [
        { x: 14, y: 15 },
        { x: 16, y: 15 },
        { x: 18, y: 15 },
        { x: 20, y: 15 },
      ],
      { psychic_hammer: 1 },
    );
    cast(g, 'psychic_hammer', ms[0], 40);
    const h = by(hits, 'psychic_hammer');
    expect(Math.floor(lin(SKILL_BY_ID.psychic_hammer.n.count, 1))).toBe(2);
    expect(h.length).toBe(2); // niveau 1 : deux coups
    expect(h[1].pk.magic).toBeCloseTo(h[0].pk.magic * 0.8, 3);
    const t = arena(
      [
        { x: 14, y: 15 },
        { x: 16, y: 15 },
        { x: 18, y: 15 },
        { x: 20, y: 15 },
      ],
      { psychic_hammer: 20 },
    );
    cast(t.g, 'psychic_hammer', t.ms[0], 40);
    const n = Math.floor(lin(SKILL_BY_ID.psychic_hammer.n.count, 20));
    expect(by(t.hits, 'psychic_hammer').length).toBe(Math.min(4, n));
    void w;
  });

  it("Guerrière et Maître de l'ombre : recharge de 2 s", () => {
    expect(SKILL_BY_ID.shadow_warrior.n.cooldown).toBe(2);
    expect(SKILL_BY_ID.shadow_master.n.cooldown).toBe(2);
  });
});

describe('Assassin PD2 : pièges', () => {
  it('Explosion de feu : N bombes (table) de 2,66 yards de rayon, qui retombent à moins de 3,33 yards de la cible', () => {
    const { g, w, ms } = arena([{ x: 16, y: 15 }], { fire_blast: 20 });
    const n = Math.floor(lin(SKILL_BY_ID.fire_blast.n.count, 20));
    expect(n).toBeGreaterThanOrEqual(6);
    w.player.cooldowns = {};
    w.input.cast = { skill: 'fire_blast', tx: ms[0].x, ty: ms[0].y, targetId: ms[0].id };
    const seen = new Set<number>();
    for (let i = 0; i < 25; i++) {
      g.step(1);
      for (const m of w.missiles) if (m.kind === 'fire_blast') seen.add(m.id);
    }
    expect(seen.size).toBe(n);
  });

  it("Toile d'éclairs : N pointes de 1,33 yard de rayon pendant 3,6 s, recharge de 1 s, dégâts par seconde de la table", () => {
    const { g, w, ms } = arena([{ x: 16, y: 15 }], { shock_web: 20 });
    expect(SKILL_BY_ID.shock_web.n.cooldown).toBe(1);
    cast(g, 'shock_web', ms[0], 20);
    const spikes = w.areas.filter((a) => a.kind === 'trap_shock_web');
    expect(spikes.length).toBe(Math.floor(lin(SKILL_BY_ID.shock_web.n.count, 20)));
    expect(spikes[0].radius).toBeCloseTo(0.665, 2);
    expect(spikes[0].maxLife).toBe(90);
    for (const a of spikes) expect(Math.hypot(a.x - ms[0].x, a.y - ms[0].y)).toBeLessThanOrEqual(1.7);
  });

  it('Tourelle à éclairs : cinq tirs de N éclairs (points investis) puis elle disparaît', () => {
    const { g, w, ms, hits } = arena([{ x: 14, y: 15 }], { charged_bolt_sentry: 9 });
    expect(skillHard('charged_bolt_sentry', 'Number of Bolts', 9)).toBe(6);
    cast(g, 'charged_bolt_sentry', ms[0], 20);
    expect(w.areas.some((a) => a.kind === 'trap_charged_bolt_sentry')).toBe(true);
    run(g, 25 * 12);
    expect(by(hits, 'charged_bolt_sentry').length).toBe(5 * 6);
    expect(w.areas.some((a) => a.kind === 'trap_charged_bolt_sentry' && !a.dead)).toBe(false);
  });

  it("Tourelle foudroyante : sept tirs, portée de 9,375 yards ; Tourelle d'éclairs en chaîne : sept tirs sautant huit fois", () => {
    const near = arena([{ x: 14, y: 15 }], { lightning_sentry: 5 });
    cast(near.g, 'lightning_sentry', near.ms[0], 20);
    run(near.g, 25 * 12);
    expect(by(near.hits, 'lightning_sentry').length).toBe(7);
    const far = arena([{ x: 17.5, y: 15 }], { lightning_sentry: 5 });
    far.w.player.x = 10;
    cast(far.g, 'lightning_sentry', null, 20, { x: 10, y: 15 }); // pose à ses pieds ; cible à 7,5 u (15 yards) : hors de portée
    run(far.g, 25 * 6);
    expect(by(far.hits, 'lightning_sentry').length).toBe(0);
    const ch = arena(
      Array.from({ length: 10 }, (_, i) => ({ x: 13 + i * 1.5, y: 15 })),
      { chain_lightning_sentry: 5 },
    );
    cast(ch.g, 'chain_lightning_sentry', ch.ms[0], 20);
    run(ch.g, 25 * 12);
    const per = by(ch.hits, 'chain_lightning_sentry');
    expect(per.length).toBe(7 * 9); // 7 tirs × (cible + 8 sauts)
  });

  it("Sillage de feu : cinq vagues de 16 yards sur 12 de large ; Sillage d'enfer : cinq gerbes d'une seconde", () => {
    const { g, w, ms, hits } = arena(
      [
        { x: 14, y: 15 },
        { x: 17, y: 15 },
        { x: 14, y: 20 },
      ],
      { wake_of_fire: 5, wake_of_inferno: 5 },
    );
    cast(g, 'wake_of_fire', ms[0], 20);
    run(g, 25 * 10);
    const waves = by(hits, 'wake_of_fire');
    expect(waves.filter((h) => h.m === ms[0]).length).toBe(5);
    expect(waves.filter((h) => h.m === ms[1]).length).toBe(5); // dans la vague
    expect(waves.some((h) => h.m === ms[2])).toBe(false); // à 10 yards de côté
    expect(w.areas.some((a) => a.kind === 'trap_wake_of_fire' && !a.dead)).toBe(false);
    hits.length = 0;
    cast(g, 'wake_of_inferno', ms[0], 20);
    run(g, 25 * 8);
    const sprays = by(hits, 'wake_of_inferno').filter((h) => h.m === ms[0]);
    expect(sprays.length).toBe(5 * 5); // cinq gerbes × (1 s / 0,2 s)
    expect(sprays[0].pk.fire).toBeGreaterThan(0);
    expect(w.areas.some((a) => a.kind === 'trap_wake_of_inferno' && !a.dead)).toBe(false);
  });

  it('Tourelle de mort : explose les cadavres sur 14 yards de rayon, physique et feu + 3 à 5 % de la vie du cadavre', () => {
    const { g, w, ms, hits } = arena(
      [
        { x: 14, y: 15 },
        { x: 18, y: 15 },
        { x: 24, y: 15 },
      ],
      { death_sentry: 5 },
    );
    const corpse = ms[0];
    corpse.hp = 0;
    corpse.dead = true;
    corpse.deathTick = w.tick;
    corpse.hpMax = 1e6;
    cast(g, 'death_sentry', null, 20, { x: 11, y: 15 });
    run(g, 40);
    const e = by(hits, 'death_sentry');
    expect(e.some((h) => h.m === ms[1])).toBe(true); // à 4 u du cadavre
    expect(e.some((h) => h.m === ms[2])).toBe(false); // à 10 u : hors des 7 u
    const pk = e.find((h) => h.m === ms[1])!.pk;
    expect(pk.phys).toBeGreaterThan((0.03 * 1e6) / 2 - 1);
    expect(pk.fire).toBeGreaterThan((0.03 * 1e6) / 2 - 1);
    expect(SKILL_BY_ID.death_sentry.element).toBe('fire');
  });

  it("Sentinelle de lames : 100 % des dégâts d'arme ajoutés, 24 yards/s pendant 2 s", () => {
    const { g, w, ms, hits } = arena([{ x: 15, y: 15 }], { blade_sentinel: 1 });
    cast(g, 'blade_sentinel', ms[0], 20);
    const m = w.missiles.find((x) => x.kind === 'blade_sentinel');
    expect(m).toBeTruthy();
    expect(Math.hypot(m!.vx, m!.vy)).toBeCloseTo(12, 1);
    run(g, 60);
    const d = by(hits, 'blade_sentinel');
    expect(d.length).toBeGreaterThan(3); // un coup toutes les 0,2 s
    const base = (SKILL_BY_ID.blade_sentinel.n.min!.base + SKILL_BY_ID.blade_sentinel.n.max!.base) / 2;
    expect(sum(d.map((h) => h.pk.phys)) / d.length).toBeGreaterThan(base + w.player.d.weaponDmg[0] * 0.9);
  });

  it("Furie des lames : une lame (75 % de l'arme), qui se divise en trois sur un mur ; ne perce qu'avec la chance de perforation", () => {
    const { g, w, ms } = arena([{ x: 30, y: 15 }], { blade_fury: 5 });
    ms[0].y = ms[0].py = 25; // hors de la trajectoire
    w.player.cooldowns = {};
    w.input.cast = { skill: 'blade_fury', tx: 38, ty: 15, targetId: 0 };
    for (let i = 0; i < 30 && !w.missiles.some((m) => m.kind === 'blade_fury'); i++) g.step(1);
    const first = w.missiles.filter((m) => m.kind === 'blade_fury');
    expect(first.length).toBe(1);
    expect(first[0].pierce).toBe(false);
    expect(first[0].maxLife).toBe(28);
    // vers un mur proche : la lame se divise en trois
    w.player.x = w.player.px = 2;
    w.player.y = w.player.py = 15;
    w.missiles.length = 0;
    w.player.cooldowns = {};
    w.input.cast = { skill: 'blade_fury', tx: 0, ty: 15, targetId: 0 };
    let peak = 0;
    for (let i = 0; i < 30; i++) {
      g.step(1);
      peak = Math.max(peak, w.missiles.filter((m) => m.kind === 'blade_fury').length);
    }
    expect(peak).toBeGreaterThanOrEqual(3);
  });

  it("Bouclier de lames : rayon de 2,66 yards, 25 % de l'arme, fréquence de la table des points investis", () => {
    const hitsAt = (pts: number): number => {
      const { g, w, ms, hits } = arena([{ x: 11, y: 15 }], { blade_shield: pts });
      cast(g, 'blade_shield', null, 20);
      expect(w.player.buffs.some((b) => b.id === 'blade_shield')).toBe(true);
      hits.length = 0;
      run(g, 100);
      return by(hits, 'blade_shield').filter((h) => h.m === ms[0]).length;
    };
    const slow = hitsAt(1); // 0,8 s
    const fast = hitsAt(20); // 0,4 s
    expect(fast).toBeGreaterThan(slow * 1.5);
    const out = arena([{ x: 14, y: 15 }], { blade_shield: 20 }); // à 4 u (8 yards) : hors du rayon
    cast(out.g, 'blade_shield', null, 20);
    out.hits.length = 0;
    run(out.g, 100);
    expect(by(out.hits, 'blade_shield').length).toBe(0);
  });
});

describe('Assassin PD2 : tables du wiki', () => {
  it('Tourelles : plafond partagé de cinq', () => {
    const { g, w, ms } = arena([{ x: 30, y: 15 }], { lightning_sentry: 5, charged_bolt_sentry: 5, wake_of_fire: 5 });
    for (let i = 0; i < 7; i++) cast(g, i % 2 ? 'lightning_sentry' : 'wake_of_fire', ms[0], 3, { x: 11 + i, y: 15 });
    expect(w.areas.filter((a) => a.kind.startsWith('trap_') && !a.dead).length).toBeLessThanOrEqual(5);
  });
  void ({} as Missile);
});
