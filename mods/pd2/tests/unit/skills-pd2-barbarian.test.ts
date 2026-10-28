/** Barbare PD2 : comportement de chaque compétence corrigée confronté au wiki (mods/pd2/docs/audit/skills-pd2-barbarian.md). */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/sim/game';
import { World } from '../../../../src/sim/world';
import { ZoneBuilder } from '../../../../src/data/zones/builder';
import { addXp, xpToReach } from '../../../../src/sim/progression';
import { SKILL_BY_ID, lin } from '../../../../src/data/skills';
import { Rng } from '../../../../src/core/rng';
import { generateItem } from '../../../../src/sim/loot/itemgen';
import { canCast } from '../../../../src/sim/skills';
import { weaponMastery } from '../../../../src/sim/melee';
import { monsterIsImmune } from '../../../../src/sim/combat';
import type { Monster, DamagePacket } from '../../../../src/sim/actors';

type Spawn = { x: number; y: number };
type Hit = { m: Monster; pk: DamagePacket };

/** Arène vide 60×30 ; le Barbare (niveau 60) tient deux épées courtes en (10,15) ; monstres immobiles, sans attaque, vie énorme */
function arena(spawns: Spawn[], skills: Record<string, number> = {}, opts: { dual?: boolean; main?: string } = {}): { g: Game; w: World; ms: Monster[]; hits: Hit[] } {
  const g = new Game(undefined, 'barbarian');
  addXp(g.character, xpToReach(60));
  g.character.base.str = 300;
  g.character.base.dex = 200;
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 60, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  for (const s of spawns) b.spawn({ monster: 'zombie', x: s.x, y: s.y, count: 1, r: 0 });
  for (const [k, v] of Object.entries(skills)) g.character.skills[k] = v;
  g.character.equipment.mainhand = generateItem(new Rng('bar'), opts.main ?? 'short_sword', 30, { forceQuality: 'normal' });
  if (opts.dual !== false) g.character.equipment.offhand = generateItem(new Rng('bar2'), 'short_sword', 30, { forceQuality: 'normal' });
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
  const hits: Hit[] = [];
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
const by = (hits: Hit[], skill: string) => hits.filter((h) => h.pk.skill === skill);

describe('Barbare PD2 : combat', () => {
  it('Coup violent : repousse dans 75 % des cas seulement', () => {
    const { g, w, ms, hits } = arena([{ x: 11.2, y: 15 }], { bash: 1 });
    let kb = 0;
    const N = 80;
    for (let i = 0; i < N; i++) {
      place(ms[0], w.player.x + 1.2, w.player.y);
      cast(g, 'bash', ms[0], 24);
    }
    const hs = by(hits, 'bash').filter((h) => h.m === ms[0]);
    kb = hs.filter((h) => h.pk.knockback).length;
    expect(hs.length).toBeGreaterThan(40);
    expect(kb / hs.length).toBeGreaterThan(0.55);
    expect(kb / hs.length).toBeLessThan(0.93);
  });

  it('Double coup : deux armes frappent deux cibles différentes, une seule arme deux fois la même', () => {
    const dual = arena(
      [
        { x: 11.2, y: 15 },
        { x: 11.2, y: 16.2 },
      ],
      { double_swing: 3 },
    );
    place(dual.ms[0], dual.w.player.x + 1.2, dual.w.player.y);
    place(dual.ms[1], dual.w.player.x + 1.2, dual.w.player.y + 0.9);
    cast(dual.g, 'double_swing', dual.ms[0], 25);
    const ds = by(dual.hits, 'double_swing');
    expect(new Set(ds.map((h) => h.m)).size).toBe(2);
    const single = arena(
      [
        { x: 11.2, y: 15 },
        { x: 11.2, y: 16.2 },
      ],
      { double_swing: 3 },
      { dual: false },
    );
    place(single.ms[0], single.w.player.x + 1.2, single.w.player.y);
    place(single.ms[1], single.w.player.x + 1.2, single.w.player.y + 0.9);
    cast(single.g, 'double_swing', single.ms[0], 25);
    const ss = by(single.hits, 'double_swing');
    expect(ss.filter((h) => h.m === single.ms[0]).length).toBeGreaterThanOrEqual(2);
  });

  it('Frénésie et Berserk exigent deux armes', () => {
    const one = arena([{ x: 11.2, y: 15 }], { frenzy: 1, berserk: 1 }, { dual: false });
    expect(canCast(one.w, 'frenzy').ok).toBe(false);
    expect(canCast(one.w, 'berserk').ok).toBe(false);
    const two = arena([{ x: 11.2, y: 15 }], { frenzy: 1, berserk: 1 });
    expect(canCast(two.w, 'frenzy').ok).toBe(true);
    expect(canCast(two.w, 'berserk').ok).toBe(true);
  });

  it("Berserk : perce la résistance physique sans briser l'immunité", () => {
    const imm = arena([{ x: 11.2, y: 15 }], { berserk: 20 });
    imm.ms[0].res.phys = 100;
    place(imm.ms[0], imm.w.player.x + 1.2, imm.w.player.y);
    const hp0 = imm.ms[0].hp;
    cast(imm.g, 'berserk', imm.ms[0], 25);
    expect(by(imm.hits, 'berserk').length).toBeGreaterThan(0);
    expect(imm.ms[0].hp).toBe(hp0);
    expect(monsterIsImmune(imm.ms[0], 'phys', imm.w.player, imm.w)).toBe(true);
    // résistance de 60 % : les dégâts passent, la résistance est percée
    const res = arena([{ x: 11.2, y: 15 }], { berserk: 20 });
    res.ms[0].res.phys = 60;
    place(res.ms[0], res.w.player.x + 1.2, res.w.player.y);
    cast(res.g, 'berserk', res.ms[0], 25);
    expect(res.ms[0].hp).toBeLessThan(res.ms[0].hpMax);
  });

  it('Tourbillon : la vitesse (table PD2) allonge le balayage', () => {
    const low = arena([], { whirlwind: 1 });
    cast(low.g, 'whirlwind', null, 14, { x: 40, y: 15 });
    const high = arena([], { whirlwind: 20 });
    cast(high.g, 'whirlwind', null, 14, { x: 40, y: 15 });
    const d1 = low.w.player.x - 10;
    const d20 = high.w.player.x - 10;
    expect(d1).toBeGreaterThan(3);
    expect(d20 / d1).toBeGreaterThan(1.25);
    expect(lin(SKILL_BY_ID.whirlwind.n.v3, 20)).toBe(38);
  });

  it('Bond : la distance suit la table PD2 (15,3 yards au niveau 1)', () => {
    const a = arena([], { leap: 1 });
    cast(a.g, 'leap', null, 30, { x: 50, y: 15 });
    const run = a.w.player.x - 10;
    expect(run).toBeGreaterThan(6.5);
    expect(run).toBeLessThanOrEqual(7.8);
  });

  it("Lancer fractionné : revient vers le Barbare à 30 % des dégâts, une seule fois par cible à l'aller", () => {
    const a = arena([{ x: 14, y: 15 }], { split_throw: 20, double_swing: 1 }, { dual: false, main: 'throwing_axe' });
    place(a.ms[0], 14, 15);
    cast(a.g, 'split_throw', a.ms[0], 24);
    const out = by(a.hits, 'split_throw');
    // une seule touche à l'aller malgré plusieurs projectiles (liste de cibles partagée)
    expect(out.filter((h) => h.m === a.ms[0]).length).toBe(1);
    const outPhys = out[0].pk.phys;
    // le retour : des projectiles repartent (ret = 1) et touchent à 30 %
    let sawReturn = false;
    for (let i = 0; i < 60 && !sawReturn; i++) {
      a.g.step(1);
      sawReturn = a.w.missiles.some((m) => m.ret === 1);
    }
    expect(sawReturn).toBe(true);
    const r = a.w.missiles.find((m) => m.ret === 1)!;
    expect(r.pierce).toBe(true);
    expect(r.dmg.phys).toBeGreaterThan(0);
    expect(r.dmg.phys).toBeLessThan(outPhys * 0.5);
  });
});

describe('Barbare PD2 : maîtrises', () => {
  it('Maîtrise du lancer : chance de perforer de la table ; Maîtrise à deux mains : efficacité du coup dévastateur', () => {
    const t = arena([], { throwing_mastery: 10 }, { dual: false, main: 'throwing_axe' });
    expect(weaponMastery(t.w).pierce).toBeGreaterThan(20);
    const h = arena([], { two_hand_mastery: 10 }, { dual: false, main: 'great_sword' });
    const m = weaponMastery(h.w);
    expect(m.crush).toBeGreaterThan(0);
    expect(m.crushEff).toBeGreaterThan(10);
  });
});

describe('Barbare PD2 : passifs', () => {
  it("Vitesse accrue : sa vitesse d'attaque compte comme vitesse d'objet (pas de compétence)", () => {
    const a = arena([], { increased_speed: 10 });
    const d = a.w.player.d;
    expect(d.ias).toBeGreaterThanOrEqual(20);
    expect(d.iasSkill).toBe(0);
    const f = arena([], { increased_speed: 1, frenzy: 5 });
    expect(f.w.player.d.iasSkill).toBe(0);
  });
});

describe('Barbare PD2 : cris', () => {
  it('Hurlement : rayon de la table (4 yards au niveau 1), sans effet sur les champions', () => {
    const a = arena(
      [
        { x: 11, y: 15 },
        { x: 14, y: 15 },
        { x: 10.5, y: 16 },
      ],
      { howl: 1 },
    );
    a.ms[2].rank = 'champion';
    cast(a.g, 'howl', null, 20);
    expect(a.ms[0].fleeUntil ?? 0).toBeGreaterThan(a.w.tick);
    expect(a.ms[1].fleeUntil ?? 0).toBeLessThanOrEqual(a.w.tick);
    expect(a.ms[2].fleeUntil ?? 0).toBeLessThanOrEqual(a.w.tick);
    expect(lin(SKILL_BY_ID.howl.n.radius, 1)).toBeCloseTo(1.995, 2);
  });

  it("Cri de guerre : rayon de la table (5,3 yards) et simple recul (plus d'étourdissement)", () => {
    const a = arena(
      [
        { x: 11.5, y: 15 },
        { x: 15, y: 15 },
      ],
      { war_cry: 5 },
    );
    cast(a.g, 'war_cry', null, 20);
    expect(a.ms[0].hp).toBeLessThan(a.ms[0].hpMax);
    expect(a.ms[1].hp).toBe(a.ms[1].hpMax);
    expect(lin(SKILL_BY_ID.war_cry.n.stun, 5)).toBeLessThan(0.5);
  });

  it('Provocation : jamais de soin du monstre aux niveaux élevés (table au-delà de 100 %)', () => {
    const a = arena([{ x: 12, y: 15 }], { taunt: 60 });
    cast(a.g, 'taunt', null, 20);
    expect(a.ms[0].dmgMul ?? 1).toBeGreaterThanOrEqual(0);
    expect(a.ms[0].arMul ?? 1).toBeGreaterThanOrEqual(0);
  });
});
