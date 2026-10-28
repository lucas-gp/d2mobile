/** Paladin PD2 : comportement de chaque compétence corrigée confronté au wiki (mods/pd2/docs/audit/skills-pd2-paladin.md). */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/sim/game';
import { World } from '../../../../src/sim/world';
import { ZoneBuilder } from '../../../../src/data/zones/builder';
import { addXp, xpToReach } from '../../../../src/sim/progression';
import { SKILL_BY_ID, lin } from '../../../../src/data/skills';
import { Rng } from '../../../../src/core/rng';
import { generateItem } from '../../../../src/sim/loot/itemgen';
import { setAura } from '../../../../src/sim/paladin';
import { monsterReduction } from '../../../../src/sim/combat';
import { emptyPacket, type Monster, type DamagePacket } from '../../../../src/sim/actors';

type Spawn = { x: number; y: number };

/** Arène vide 40×30 ; le Paladin (niveau 60) tient une épée et un bouclier en (10,15) ; monstres immobiles, sans attaque, vie énorme */
function arena(spawns: Spawn[], skills: Record<string, number> = {}): { g: Game; w: World; ms: Monster[]; hits: { m: Monster; pk: DamagePacket }[] } {
  const g = new Game(undefined, 'paladin');
  addXp(g.character, xpToReach(60));
  g.character.base.str = 200;
  g.character.base.dex = 200;
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  for (const s of spawns) b.spawn({ monster: 'zombie', x: s.x, y: s.y, count: 1, r: 0 });
  for (const [k, v] of Object.entries(skills)) g.character.skills[k] = v;
  g.character.equipment.mainhand = generateItem(new Rng('pal'), 'short_sword', 30, { forceQuality: 'normal' });
  g.character.equipment.offhand = generateItem(new Rng('pal2'), 'buckler', 30, { forceQuality: 'normal' });
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
  const hits: { m: Monster; pk: DamagePacket }[] = [];
  const orig = g.world.hurtMonster.bind(g.world);
  g.world.hurtMonster = (m: Monster, pk: DamagePacket, ...rest: unknown[]) => {
    hits.push({ m, pk: { ...pk } });
    return (orig as (...a: unknown[]) => number)(m, pk, ...rest);
  };
  return { g, w: g.world, ms, hits };
}

function cast(g: Game, skill: string, target: Monster | null, ticks = 30, at?: Spawn): void {
  const w = g.world;
  w.player.cooldowns = {};
  w.player.mode = 'idle';
  w.player.mana = w.player.manaMax;
  w.input.cast = { skill, tx: target?.x ?? at?.x ?? w.player.x + 3, ty: target?.y ?? at?.y ?? w.player.y, targetId: target?.id ?? 0 };
  g.step(ticks);
}
function place(m: Monster, x: number, y: number): void {
  m.x = m.px = x;
  m.y = m.py = y;
}
const by = (hits: { m: Monster; pk: DamagePacket }[], skill: string) => hits.filter((h) => h.pk.skill === skill);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

describe('Paladin PD2 : combat', () => {
  it('Châtiment : ne repousse pas (PvE), coup écrasant 5 % + 1 %/point, efficacité de la table', () => {
    const { g, w, ms, hits } = arena([{ x: 12, y: 15 }], { smite: 5 });
    place(ms[0], w.player.x + 1.2, w.player.y);
    cast(g, 'smite', ms[0], 25);
    const h = by(hits, 'smite').find((x) => x.m === ms[0])!;
    expect(h).toBeTruthy();
    expect(h.pk.knockback).toBeUndefined();
    expect(h.pk.crush).toBeGreaterThanOrEqual(9); // 5 % au niveau 1, +1 % par point investi (5 points : 9 %)
    expect(h.pk.crushEff).toBeGreaterThan(15);
    expect(lin(SKILL_BY_ID.smite.n.v3, 1)).toBe(15);
  });

  it('Charge : la zone de mêlée grandit avec la distance parcourue (0 / +20 / +40 / +60 %)', () => {
    const near = arena(
      [
        { x: 11.5, y: 15 },
        { x: 11.5, y: 17.25 },
      ],
      { charge: 5, smite: 1 },
    );
    place(near.ms[0], near.w.player.x + 1.2, near.w.player.y);
    place(near.ms[1], near.ms[0].x, near.ms[0].y + 2.1);
    cast(near.g, 'charge', near.ms[0], 25);
    expect(by(near.hits, 'charge').some((h) => h.m === near.ms[1])).toBe(false);
    const far = arena(
      [
        { x: 17, y: 15 },
        { x: 17, y: 17.1 },
      ],
      { charge: 5, smite: 1 },
    );
    cast(far.g, 'charge', far.ms[0], 25);
    expect(by(far.hits, 'charge').some((h) => h.m === far.ms[1])).toBe(true); // 7 unités parcourues : +60 %, zone 2,3
  });

  it("Vengeance : explosion de feu, froid et foudre autour de la cible, qui se propage d'ennemi en ennemi", () => {
    const { g, w, ms, hits } = arena(
      [
        { x: 11.2, y: 15 },
        { x: 13, y: 15 },
        { x: 15, y: 15 },
        { x: 24, y: 15 },
      ],
      { vengeance: 60, zeal: 1, sacrifice: 1 },
    );
    place(ms[0], w.player.x + 1.2, w.player.y);
    place(ms[1], ms[0].x + 2.1, ms[0].y);
    place(ms[2], ms[0].x + 4.2, ms[0].y);
    place(ms[3], ms[0].x + 14, ms[0].y);
    for (let i = 0; i < 12; i++) cast(g, 'vengeance', ms[0], 12);
    const v = by(hits, 'vengeance');
    const onFirst = v.filter((h) => h.m === ms[0] && h.pk.fire > 0 && h.pk.cold > 0 && h.pk.light > 0);
    expect(onFirst.length).toBeGreaterThan(0);
    expect(v.some((h) => h.m === ms[1] && h.pk.fire > 0)).toBe(true); // dans les 4,66 yards
    expect(v.some((h) => h.m === ms[2] && h.pk.fire > 0)).toBe(true); // atteint par rebond (chance 95 % au niveau 60)
    expect(v.some((h) => h.m === ms[3])).toBe(false); // hors de la portée maximale
    // la part physique de l'arme est convertie : les trois éléments reçoivent au moins le dégât physique du coup
    expect(onFirst[0].pk.fire).toBeGreaterThan(30);
  });

  it('Éclair sacré : traverse les cibles (pierce)', () => {
    const { g, w, ms } = arena([{ x: 16, y: 15 }], { holy_bolt: 5 });
    let pierce: boolean | undefined;
    cast(g, 'holy_bolt', ms[0], 1);
    for (let i = 0; i < 30 && pierce === undefined; i++) {
      pierce = w.missiles.find((m) => m.kind === 'holy_bolt')?.pierce;
      g.step(1);
    }
    expect(pierce).toBe(true);
  });

  it('Lumière sacrée : 4 yards autour de la cible ; ennemi ciblé = dégâts entiers, camp opposé = moitié', () => {
    expect(lin(SKILL_BY_ID.holy_light.n.radius, 1)).toBe(2);
    const foe = arena(
      [
        { x: 15, y: 15 },
        { x: 16.5, y: 15 },
        { x: 11, y: 15 },
      ],
      { holy_light: 10, holy_bolt: 1 },
    );
    const { g, w, ms, hits } = foe;
    for (let i = 0; i < 20; i++) cast(g, 'holy_light', ms[0], 14);
    const hl = by(hits, 'holy_light');
    expect(hl.some((h) => h.m === ms[1])).toBe(true); // voisin de la cible
    expect(hl.some((h) => h.m === ms[2])).toBe(false); // proche du Paladin mais loin de la cible
    const full = sum(hl.filter((h) => h.m === ms[0]).map((h) => h.pk.magic));
    const ally = arena([{ x: 11, y: 15 }], { holy_light: 10, holy_bolt: 1 });
    for (let i = 0; i < 20; i++) cast(ally.g, 'holy_light', null, 14, { x: 0, y: 0 }); // sans cible : centrée sur le Paladin, dégâts ÷ 2
    const half = sum(
      by(ally.hits, 'holy_light')
        .filter((h) => h.m === ally.ms[0])
        .map((h) => h.pk.magic),
    );
    expect(half).toBeGreaterThan(0);
    expect(full / half).toBeGreaterThan(1.5);
    expect(full / half).toBeLessThan(2.6);
    void w;
  });

  it('Joute : recharge de la table et vitesse de déplacement pendant 2 s', () => {
    const { g, w, ms } = arena([{ x: 16, y: 15 }], { joust: 1, vengeance: 1, zeal: 1, sacrifice: 1 });
    const frw0 = w.player.d.frw;
    cast(g, 'joust', ms[0], 12);
    expect(w.player.cooldowns.joust).toBeGreaterThan(w.tick + 70); // ≈ 4 s au niveau 1
    expect(w.player.buffs.some((b) => b.id === 'joust_run')).toBe(true);
    expect(w.player.d.frw).toBeGreaterThan(frw0);
    expect(lin(SKILL_BY_ID.joust.n.v4, 25)).toBeLessThan(2);
  });
});

describe('Paladin PD2 : auras', () => {
  it('rayons du wiki : Gel sacré 8 yards, Choc sacré 10,66, Sanctuaire 12', () => {
    expect(lin(SKILL_BY_ID.holy_freeze.n.radius, 10)).toBeCloseTo(4, 1);
    expect(lin(SKILL_BY_ID.holy_shock.n.radius, 10)).toBeCloseTo(5.33, 1);
    expect(lin(SKILL_BY_ID.sanctuary.n.radius, 10)).toBeCloseTo(6, 1);
    expect(lin(SKILL_BY_ID.holy_fire.n.radius, 30)).toBeCloseTo(4.67, 1);
  });

  it("Feu sacré / Concentration : le score d'attaque de la table s'ajoute", () => {
    const { w } = arena([{ x: 30, y: 15 }], { holy_fire: 10, concentration: 10, might: 1, blessed_aim: 1 });
    const ar0 = w.player.d.attackRating;
    setAura(w, 'holy_fire', 10);
    const ar1 = w.player.d.attackRating;
    expect(ar1).toBeGreaterThan(ar0);
    setAura(w, 'concentration', 10);
    expect(w.player.d.attackRating).toBeGreaterThan(ar0);
  });

  it('Prière : de la vie à chaque coup porté', () => {
    const { w, ms } = arena([{ x: 12, y: 15 }], { prayer: 10 });
    setAura(w, 'prayer', 10);
    expect(w.player.d.all.get('lifeAfterHit')).toBeGreaterThanOrEqual(3);
    w.player.hp = 10;
    const pk = emptyPacket(false);
    pk.phys = 50;
    w.hurtMonster(ms[0], pk);
    expect(w.player.hp).toBeGreaterThanOrEqual(10 + 3);
  });

  it("Conviction : n'affecte que les monstres dans son rayon", () => {
    const { w, ms } = arena(
      [
        { x: 12, y: 15 },
        { x: 38, y: 15 },
      ],
      { conviction: 20, sanctuary: 1, holy_fire: 1, thorns: 1, might: 1, holy_freeze: 1 },
    );
    setAura(w, 'conviction', 20);
    expect(monsterReduction(w, ms[0], 'fire', null)).toBeGreaterThan(0);
    expect(monsterReduction(w, ms[1], 'fire', null)).toBe(0);
  });

  it('Sanctuaire : le porteur ignore la résistance physique des morts-vivants', () => {
    const { w, ms } = arena([{ x: 12, y: 15 }], { sanctuary: 5, might: 1, holy_fire: 1, thorns: 1, holy_freeze: 1 });
    expect(ms[0].def.family === 'undead' || ms[0].def.family === 'skeleton').toBe(true);
    ms[0].res.phys = 90;
    ms[0].hp = ms[0].hpMax = 1e9;
    const dmg = (): number => {
      const before = ms[0].hp;
      const pk = emptyPacket(false);
      pk.phys = 1000;
      w.hurtMonster(ms[0], pk);
      return before - ms[0].hp;
    };
    const without = dmg();
    setAura(w, 'sanctuary', 5);
    const withAura = dmg();
    expect(withAura).toBeGreaterThan(without * 5);
  });
});
