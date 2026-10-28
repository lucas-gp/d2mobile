/**
 * Règles de combat de la base = Diablo II LoD 1.13c (lot M8a, src/mods/d2/combat.ts) : chaque formule contre les tables des MPQ
 * (src/mods/d2/tables.ts, contrôlé par `npm run vanilla` et vanilla-mpq.test.ts) et contre le code du jeu reconstitué (D2MOO, fonctions
 * citées dans le module) ou les exemples documentés (Arreat Summit, maxroll « Immunities », « Attack Modifiers »). Indépendant du jeu de
 * règles actif : les fonctions de la base sont appelées directement ; le dernier test vérifie qu'elles sont celles du jeu `d2`.
 */
import { describe, expect, it } from 'vitest';
import { ABSORB_PCT_MAX, playerHitRecovery, chillAndFreeze, criticalMul, crushingBlow, leech, monsterRes, openWounds, openWoundsPerFrame, bleedTick } from '../../src/mods/d2/combat';
import { D2_DIFFICULTY, D2_MONSTER_COMBAT } from '../../src/mods/d2/tables';
import { RULES, ruleOwner } from '../../src/mods/rules';
import { emptyPacket, type DamagePacket, type Monster } from '../../src/sim/actors';
import type { World } from '../../src/sim/world';
import { withoutPd2 } from '../needs-pd2';

/** Générateur aux tirages imposés (`chance(p)` : vrai si le tirage suivant est < p) */
function rolls(...v: number[]): { chance: (p: number) => boolean } {
  let i = 0;
  return { chance: (p) => v[i++ % v.length] < p };
}

interface FakeOpts {
  difficulty?: 0 | 1 | 2;
  lifeLeech?: number;
  manaLeech?: number;
  stats?: Record<string, number>;
  level?: number;
  rng?: { chance: (p: number) => boolean };
}
function world(o: FakeOpts = {}): World {
  return {
    difficulty: o.difficulty ?? 0,
    character: { level: o.level ?? 1 },
    rng: { combat: o.rng ?? rolls(0.5) },
    player: { d: { lifeLeech: o.lifeLeech ?? 0, manaLeech: o.manaLeech ?? 0, all: new Map(Object.entries(o.stats ?? {})) } },
  } as unknown as World;
}
function monster(id: string, extra: Partial<Monster> = {}): Monster {
  return { def: { id }, rank: 'normal', hp: 1000, chillT: 0, chillPct: 0, freezeT: 0, dead: false, ...extra } as unknown as Monster;
}
const packet = (o: Partial<DamagePacket>): DamagePacket => ({ ...emptyPacket(false), ...o });

describe('Combat D2 1.13c : tables des MPQ', () => {
  it('DifficultyLevels.txt : vol de vie ÷ 1/2/3, froid et gel des monstres ÷ 1/2/4, pénalité de résistance 0/−40/−100', () => {
    expect(D2_DIFFICULTY.LifeStealDivisor).toEqual([1, 2, 3]);
    expect(D2_DIFFICULTY.ManaStealDivisor).toEqual([1, 2, 3]);
    expect(D2_DIFFICULTY.MonsterColdDivisor).toEqual([1, 2, 4]);
    expect(D2_DIFFICULTY.MonsterFreezeDivisor).toEqual([1, 2, 4]);
    expect(D2_DIFFICULTY.ResistPenalty).toEqual([0, -40, -100]);
  });
  it('MonStats.txt : Drain, coldeffect et drapeau boss (zombie, squelette, Andariel)', () => {
    expect(D2_MONSTER_COMBAT.zombie).toEqual({ drain: [100, 75, 50], cold: [-50, -40, -25] });
    expect(D2_MONSTER_COMBAT.andariel.boss).toBe(true);
    expect(D2_MONSTER_COMBAT.skeleton.drain).toEqual([0, 0, 0]);
  });
});

describe('Combat D2 1.13c : résistances et immunités des monstres', () => {
  it('réductions à 1/5 sur un immunisé (Déchu de l’Enfer, 110 % : 55 % de réduction le ramènent à 99 %)', () => {
    expect(monsterRes(110, 0, false, 54).immune).toBe(true);
    expect(monsterRes(110, 0, false, 55)).toEqual({ res: 99, immune: false });
    // Bishibosh (140 % de feu) : 205 % de réductions cumulées (maxroll)
    expect(monsterRes(140, 0, false, 204).immune).toBe(true);
    expect(monsterRes(140, 0, false, 205).res).toBe(99);
  });
  it('pénétrations : sans effet sur un immunisé, pleines une fois l’immunité cassée ou sous 100 %', () => {
    expect(monsterRes(100, 500, false, 0).immune).toBe(true);
    expect(monsterRes(110, 20, false, 55).res).toBe(79);
    expect(monsterRes(50, 30, false, 20).res).toBe(0);
  });
  it('plancher −100 %, résistance négative pleine (pas de division), aucune brisure', () => {
    expect(monsterRes(0, 40, false).res).toBe(-40);
    expect(monsterRes(-50, 500, false).res).toBe(-100);
    expect(monsterRes(150, 30, true).immune).toBe(true);
  });
});

describe('Combat D2 1.13c : vol de vie, coup écrasant, critiques', () => {
  it('vol de vie : × Drain du monstre ÷ diviseur de la difficulté, plafonné à la vie restante', () => {
    const z = monster('zombie');
    // Enfer : Drain 50 %, ÷ 3 ; 300 dégâts physiques → 150 → 10 % : 15 / 3 = 5 ; 5 % : 2
    expect(leech(world({ difficulty: 2, lifeLeech: 10, manaLeech: 5 }), z, packet({}), 300, 1e9)).toEqual({ life: 5, mana: 2 });
    // Normal : Drain 100 %, ÷ 1 ; plafond : il ne restait que 60 PV
    expect(leech(world({ lifeLeech: 10 }), z, packet({}), 300, 60).life).toBe(6);
    // squelettes : Drain 0, rien
    expect(leech(world({ lifeLeech: 100 }), monster('skeleton'), packet({}), 300, 1e9)).toEqual({ life: 0, mana: 0 });
  });
  it('coup écrasant : 1/4 de la vie, 1/8 boss et super-unique, diviseur doublé à distance, résistance physique positive seulement', () => {
    const w = world();
    expect(crushingBlow(w, monster('zombie'), packet({}), null, 0)).toBe(250);
    expect(crushingBlow(w, monster('andariel', { rank: 'boss' }), packet({}), null, 0)).toBe(125);
    // drapeau boss de MonStats, pas le rang du moteur : un zombie au rang de boss reste au quart
    expect(crushingBlow(w, monster('zombie', { rank: 'boss' }), packet({}), null, 0)).toBe(250);
    expect(crushingBlow(w, monster('zombie', { rank: 'unique', su: 'rakanishu' }), packet({}), null, 0)).toBe(125);
    expect(crushingBlow(w, monster('zombie', { rank: 'unique' }), packet({}), null, 0)).toBe(250);
    expect(crushingBlow(w, monster('zombie'), packet({ ar: 100 }), null, 0)).toBe(125);
    expect(crushingBlow(w, monster('zombie'), packet({}), null, 50)).toBe(125);
    expect(crushingBlow(w, monster('zombie'), packet({}), null, -100)).toBe(250);
    expect(crushingBlow(w, monster('zombie'), packet({}), null, 150)).toBe(0);
  });
  it('critique de la maîtrise puis frappe mortelle, chacun ×2, sans plafond', () => {
    // critique (30 %) réussi : ×2 sans tirer la frappe mortelle
    expect(criticalMul(world({ rng: rolls(0.1), stats: { deadlyStrike: 50 } }), 30)).toBe(2);
    // critique raté, frappe mortelle (50 %) réussie : ×2
    expect(criticalMul(world({ rng: rolls(0.9, 0.2), stats: { deadlyStrike: 50 } }), 30)).toBe(2);
    expect(criticalMul(world({ rng: rolls(0.9, 0.6), stats: { deadlyStrike: 50 } }), 30)).toBe(1);
    // 95 % de frappe mortelle : pas de plafond à 75 %
    expect(criticalMul(world({ rng: rolls(0.9), stats: { deadlyStrike: 95 } }), 0)).toBe(2);
  });
  it('récupération après coup du joueur : seulement à 1/12 de sa vie maximale ou plus (lot M13)', () => {
    expect(playerHitRecovery(4, 60)).toBe(false);
    expect(playerHitRecovery(5, 60)).toBe(true);
    expect(playerHitRecovery(100, 1200)).toBe(true);
    expect(playerHitRecovery(99, 1200)).toBe(false);
  });

  it('absorption élémentaire en pourcentage : 40 % au plus', () => {
    expect(ABSORB_PCT_MAX).toBe(40);
  });
});

describe('Combat D2 1.13c : blessures ouvertes, froid et gel', () => {
  it('saignement par image (1/256) : 9L+31, 18L−104, 27L−374, 36L−779, 45L−1319 (+40 compris)', () => {
    expect(openWoundsPerFrame(1)).toBe(40);
    for (const L of [2, 15]) expect(openWoundsPerFrame(L)).toBe(9 * L + 31);
    for (const L of [16, 30]) expect(openWoundsPerFrame(L)).toBe(18 * L - 104);
    for (const L of [31, 45]) expect(openWoundsPerFrame(L)).toBe(27 * L - 374);
    for (const L of [46, 60]) expect(openWoundsPerFrame(L)).toBe(36 * L - 779);
    for (const L of [61, 99]) expect(openWoundsPerFrame(L)).toBe(45 * L - 1319);
  });
  it('blessures ouvertes : 8 s, moitié sur un champion ou un unique, remplacent le saignement en cours, sans résistance', () => {
    const w = world({ level: 50, stats: { openWounds: 100 }, rng: rolls(0) });
    const m = monster('zombie', { bleedDps: 9999, bleedT: 3, bleedStacks: 3 });
    openWounds(w, m, 10);
    expect(m.bleedT).toBe(200);
    expect(m.bleedStacks).toBe(1);
    expect(m.bleedDps).toBeCloseTo((1021 / 256) * 25, 9);
    const c = monster('zombie', { rank: 'champion' });
    openWounds(w, c, 10);
    expect(c.bleedDps).toBeCloseTo((510 / 256) * 25, 9);
    expect(bleedTick(monster('zombie', { bleedDps: 100, res: { phys: 50 } } as Partial<Monster>), 0.04)).toBeCloseTo(4, 9);
  });
  it('froid : durée réduite par la résistance puis ÷ 1/2/4, ralentissement de MonStats ; gel ÷ 1/2/4, jamais sur un boss ou un unique', () => {
    const z = (difficulty: 0 | 1 | 2, extra: Partial<Monster> = {}): { w: World; m: Monster } => ({ w: world({ difficulty }), m: monster('zombie', extra) });
    let { w, m } = z(2);
    chillAndFreeze(w, m, packet({ chill: 100 }), () => 0);
    expect([m.chillT, m.chillPct]).toEqual([25, 0.25]);
    ({ w, m } = z(0));
    chillAndFreeze(w, m, packet({ chill: 100 }), () => 50);
    expect([m.chillT, m.chillPct]).toEqual([50, 0.5]);
    ({ w, m } = z(1));
    chillAndFreeze(w, m, packet({ freeze: 100 }), () => 0);
    expect([m.freezeT, m.chillT]).toEqual([50, 0]);
    ({ w, m } = z(1, { rank: 'unique' }));
    chillAndFreeze(w, m, packet({ freeze: 100 }), () => 0);
    expect([m.freezeT, m.chillT, m.chillPct]).toEqual([0, 50, 0.4]);
    const a = monster('andariel');
    chillAndFreeze(world({ difficulty: 0 }), a, packet({ freeze: 40 }), () => 0);
    expect([a.freezeT, a.chillT]).toEqual([0, 40]);
  });
  it('coldeffect nul ou positif : ni froid ni gel', () => {
    const id = Object.entries(D2_MONSTER_COMBAT).find(([, v]) => v.cold[0] >= 0)?.[0];
    expect(id).toBeDefined();
    const m = monster(id!);
    chillAndFreeze(world(), m, packet({ chill: 100, freeze: 100 }), () => 0);
    expect([m.chillT, m.freezeT]).toEqual([0, 0]);
  });
});

describe('Combat : règles du jeu de règles actif', () => {
  it('sans mod, les règles de combat sont celles de D2 ; avec pd2, celles du mod', () => {
    for (const r of [
      'combat.monsterRes',
      'combat.leech',
      'combat.crushingBlow',
      'combat.criticalMul',
      'combat.weaponSplash',
      'combat.openWounds',
      'combat.bleedTick',
      'combat.chillFreeze',
      'combat.absorbPctMax',
    ] as const)
      expect(ruleOwner(r)).toBe(withoutPd2 ? undefined : 'pd2');
    if (withoutPd2) {
      expect(RULES['combat.monsterRes']).toBe(monsterRes);
      expect(RULES['combat.weaponSplash']()).toBe(false);
      expect(RULES['combat.absorbPctMax']()).toBe(40);
    }
    // lot 321: the 1/12 threshold of Diablo II in both games (pd2 no longer interrupts at every hit)
    expect(ruleOwner('combat.playerHitRecovery')).toBe(undefined);
    expect(RULES['combat.playerHitRecovery']).toBe(playerHitRecovery);
  });
});
