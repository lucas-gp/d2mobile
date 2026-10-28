/** Systèmes de combat (audit 05) : vitesse d'attaque D2, FBR, absorption, poison, blessures ouvertes, pénalité de niveau. */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, xpToReach } from '../../src/sim/progression';
import { attackFrames, effectiveIas, fbrFrames, fhrFrames, framesForSpeed } from '../../src/sim/breakpoints';
import { animA, animCat, WSM_BY_BASE } from '../../src/data/attack-anim';
import { BASE_BY_ID } from '../../src/data/items';
import { castFrames, strikeCount, strikePlan, WHIRLWIND_FRAMES } from '../../src/sim/skills';
import { playsStrike, strikeSchedule, withStrike } from '../../src/sim/rhythm';
import { applyAbsorb, damagePlayer } from '../../src/sim/combat';
import { addBleed } from '../../src/sim/melee';
import { emptyPacket } from '../../src/sim/actors';
import type { Monster } from '../../src/sim/actors';
import { withoutPd2 } from '../needs-pd2';

function arena(cls: 'barbarian' | 'amazon' | 'sorceress'): { g: Game; w: World; m: Monster } {
  const g = new Game(undefined, cls);
  addXp(g.character, xpToReach(30));
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 30, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  b.spawn({ monster: 'zombie', x: 11.2, y: 15, count: 1, r: 0 });
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty: 0, zoneLevel: 30, character: g.character });
  g.world.populate();
  const m = g.world.monsters.find((x) => !x.dead && !x.isSummon)!;
  m.hp = m.hpMax = 1e9;
  m.dmgMin = m.dmgMax = 0;
  return { g, w: g.world, m };
}

describe('vitesse d’attaque D2', () => {
  it('rendement décroissant : 120*x/(120+x)', () => {
    expect(effectiveIas(60)).toBe(40);
    expect(effectiveIas(120)).toBe(60);
    expect(effectiveIas(500)).toBeLessThan(100);
  });

  it('une dague (WSM −20) frappe plus vite qu’une hache à deux mains (WSM +10) à IAS égal', () => {
    expect(WSM_BY_BASE.dagger).toBe(-20);
    expect(WSM_BY_BASE.battle_axe).toBe(10);
    const dagger = [{ A: animA('barbarian', animCat(BASE_BY_ID.dagger)), wsm: WSM_BY_BASE.dagger }];
    const axe = [{ A: animA('barbarian', 'melee2'), wsm: 10 }];
    for (const ias of [0, 40, 100]) expect(attackFrames(ias, 'barbarian', dagger)).toBeLessThan(attackFrames(ias, 'barbarian', axe));
  });

  it('exemples D2 : paladin 1 main swinging 0 % → 14 images, +8 % TAS → 13 ; sorcière sans arme à 150 % IAS ≥ 8', () => {
    const pal = [{ A: animA('paladin', 'swing1'), wsm: 0 }];
    expect(attackFrames(0, 'paladin', pal)).toBe(14);
    expect(framesForSpeed(15, 8)).toBe(13);
    expect(attackFrames(150, 'sorceress')).toBeGreaterThanOrEqual(8);
  });

  it('IAS de compétence ajouté sans rendement décroissant ; double maniement : arme la plus rapide', () => {
    const s = [{ A: 15, wsm: 0 }];
    expect(attackFrames(0, 'barbarian', s, 60)).toBeLessThan(attackFrames(60, 'barbarian', s));
    const dual = [
      { A: 15, wsm: 10 },
      { A: 15, wsm: -20 },
    ];
    expect(attackFrames(0, 'barbarian', dual)).toBe(attackFrames(0, 'barbarian', [dual[1]]));
  });

  it('les caractéristiques dérivées portent l’animation de l’arme équipée', () => {
    const { w } = arena('barbarian');
    expect(w.player.d.atkSets.length).toBeGreaterThan(0);
    expect(w.player.d.iasSkill).toBeGreaterThanOrEqual(0);
  });
});

describe('vitesse de blocage', () => {
  it('table par classe : paladin 5 images à 0 %, 4 à 13 % ; sorcière 9 images', () => {
    expect(fbrFrames(0, 'paladin')).toBe(5);
    expect(fbrFrames(13, 'paladin')).toBe(4);
    expect(fbrFrames(0, 'sorceress')).toBe(9);
    expect(fbrFrames(200, 'sorceress')).toBe(3);
  });
});

describe('absorption', () => {
  it('ne soigne jamais et réduit : pourcentage puis plat 1 pour 1', () => {
    expect(applyAbsorb(100, 20, 0)).toBeCloseTo(80);
    expect(applyAbsorb(100, 20, 30)).toBeCloseTo(50);
    expect(applyAbsorb(10, 0, 50)).toBe(0);
  });

  it('un coup de feu absorbé ne rend pas de vie au joueur', () => {
    const { g, w, m } = arena('barbarian');
    g.character.bonuses = { ...g.character.bonuses, absorbFire: 30, absorbFireFlat: 10 };
    w.refreshPlayer();
    m.ar = 1e9;
    w.player.mode = 'idle';
    w.player.hpMax = 1e6;
    w.player.hp = 5e5;
    const p = emptyPacket(true);
    p.fire = 100;
    const dealt = damagePlayer(w, w.player, p, m);
    const res = w.player.d.res.fire;
    expect(dealt).toBeCloseTo(Math.max(0, 100 * (1 - res / 100) * 0.7 - 10), 3);
    expect(w.player.hp).toBeLessThanOrEqual(5e5 - dealt + 1e-6);
  });
});

describe('blessures ouvertes', () => {
  it('se cumulent jusqu’à 3 fois sur 5 s', () => {
    const { m } = arena('barbarian');
    m.bleedT = 0;
    m.bleedDps = 0;
    m.bleedStacks = 0;
    addBleed(m, 10);
    expect(m.bleedDps).toBe(10);
    addBleed(m, 10);
    addBleed(m, 10);
    expect(m.bleedDps).toBe(30);
    addBleed(m, 10);
    expect(m.bleedDps).toBe(30);
    expect(m.bleedT).toBe(125);
    addBleed(m, 40);
    expect(m.bleedDps).toBeGreaterThan(30);
  });
});

describe('poison des monstres', () => {
  it('le poison le plus fort remplace, un plus faible n’écrase pas', () => {
    const { w, m } = arena('barbarian');
    w.player.d.res.poison = 0;
    m.res.poison = 0;
    const hit = (dps: number): void => {
      const p = emptyPacket(true);
      p.poisonDot = { dps, ticks: 100 };
      w.hurtMonster(m, p);
    };
    hit(10);
    expect(m.poisonDps).toBeCloseTo(10);
    hit(5);
    expect(m.poisonDps).toBeCloseTo(10);
    hit(20);
    expect(m.poisonDps).toBeCloseTo(20);
  });
});

describe('récupération après coup et blocage par classe / forme', () => {
  it('tables FHR des Breakpoints PD2', () => {
    expect(fhrFrames(0, 'barbarian')).toBe(9);
    expect(fhrFrames(86, 'barbarian')).toBe(4);
    expect(fhrFrames(0, 'druid', { weapon: '1h' })).toBe(14);
    expect(fhrFrames(0, 'druid', { weapon: 'other' })).toBe(13);
    expect(fhrFrames(456, 'druid', { weapon: '1h' })).toBe(4);
    expect(fhrFrames(0, 'druid', { form: 'werewolf' })).toBe(7);
    expect(fhrFrames(280, 'druid', { form: 'werewolf' })).toBe(2);
    expect(fhrFrames(0, 'druid', { form: 'werebear' })).toBe(13);
    expect(fhrFrames(0, 'paladin', { weapon: 'spearstaff' })).toBe(13);
    expect(fhrFrames(0, 'paladin', { weapon: 'other' })).toBe(9);
  });
  it('tables FBR : Amazone une main, formes animales, Bouclier sacré', () => {
    expect(fbrFrames(0, 'amazon', { weapon: '1h' })).toBe(17);
    expect(fbrFrames(0, 'amazon', { weapon: 'other' })).toBe(5);
    expect(fbrFrames(0, 'druid', { form: 'werewolf' })).toBe(9);
    expect(fbrFrames(0, 'druid', { form: 'werebear' })).toBe(12);
    expect(fbrFrames(0, 'paladin', { holyShield: true })).toBe(2);
    expect(fbrFrames(86, 'paladin', { holyShield: true })).toBe(1);
  });
  it('un coup encaissé assez fort interrompt, un coup déjà en récupération ne relance pas', () => {
    const { w, m } = arena('barbarian');
    const pl = w.player;
    // 1 point sur 12 de vie maximale : au seuil de D2 (1/12, règle combat.playerHitRecovery ; le mod pd2 le garde depuis le lot 321)
    pl.hp = 1e9;
    pl.hpMax = 12;
    pl.mode = 'idle';
    const p = emptyPacket(true);
    p.phys = 1;
    damagePlayer(w, pl, p, null);
    expect(pl.mode).toBe('hit');
    pl.modeT = 5;
    damagePlayer(w, pl, p, null);
    expect(pl.modeT).toBe(5);
    void m;
  });

  it('sous 1/12 de la vie, le coup n’interrompt pas, dans la base comme dans le jeu pd2 (lot 321 : plus de « tout coup » au pd2)', () => {
    const { w } = arena('barbarian');
    const pl = w.player;
    pl.hp = pl.hpMax = 1e9;
    pl.mode = 'idle';
    const p = emptyPacket(true);
    p.phys = 1;
    damagePlayer(w, pl, p, null);
    expect(pl.mode).toBe('idle');
  });
});

describe('Tourbillon PD2', () => {
  // cadence fixe du Tourbillon : règle skills.barbarian du mod (D2 : celle de l'arme)
  it.skipIf(withoutPd2)('ne dépend pas de la vitesse d’attaque', () => {
    const { w } = arena('barbarian');
    const base = castFrames(w, 'whirlwind');
    w.player.d.ias += 200;
    expect(castFrames(w, 'whirlwind')).toBe(base);
    expect(base).toBeLessThanOrEqual(WHIRLWIND_FRAMES + 2);
  });
});

describe('régénération vie / mana et MF / GF', () => {
  it('Régénération de vie (replenish) : +N pv/s, aucune régénération naturelle', () => {
    const { w } = arena('barbarian');
    w.player.hp = 10;
    w.player.d.lifeRegen = 0;
    w.step(50);
    expect(w.player.hp).toBeCloseTo(10, 5);
    w.player.d.lifeRegen = 20;
    w.step(50); // 2 s
    expect(w.player.hp).toBeCloseTo(50, 0);
  });
  it('Régénération de mana : manaMax/refill × (1 + %), le % des objets accélère le rythme', () => {
    const { w } = arena('sorceress');
    const base = (w.player.manaMax / 25) * 1;
    w.player.mana = 0;
    w.player.d.manaRegen = base;
    w.step(25);
    const m1 = w.player.mana;
    w.player.mana = 0;
    w.player.d.manaRegen = base * 2;
    w.step(25);
    expect(w.player.mana / m1).toBeCloseTo(2, 1);
  });
  it('MF : rendements décroissants D2 (unique 250, set 500, rare 600), magique linéaire', async () => {
    const { effectiveMf } = await import('../../src/sim/loot/itemgen');
    expect(effectiveMf(250, 'unique')).toBeCloseTo(125, 5);
    expect(effectiveMf(500, 'set')).toBeCloseTo(250, 5);
    expect(effectiveMf(600, 'rare')).toBeCloseTo(300, 5);
    expect(effectiveMf(300, 'magic')).toBe(300);
    expect(effectiveMf(0, 'unique')).toBe(0);
  });
  it('GF : or × (100+gf)/100 sans rendement décroissant', async () => {
    const { rollTc } = await import('../../src/sim/loot/drops');
    const { Rng } = await import('../../src/core/rng');
    const sum = (gf: number): number => {
      let t = 0;
      for (let i = 0; i < 400; i++)
        for (const it of rollTc({ rng: new Rng(i + 1), ilvl: 60, mf: 0, gf, difficulty: 2, zoneKey: '', mapTier: 0, bonus: { unique: 0, set: 0, rare: 0, magic: 0 }, quantity: 1 } as never, 'gold'))
          t += (it as { qty?: number }).qty ?? 0;
      return t;
    };
    expect(sum(200) / sum(0)).toBeGreaterThan(2.9);
    expect(sum(200) / sum(0)).toBeLessThan(3.1);
  });
});

describe('rythme des compétences à frappes multiples (rhythm.ts)', () => {
  it('échéancier : première frappe à la libération, écart de 4 images à 0 % de VA, borné au cycle', () => {
    // cycle long : l'écart de référence (4 images) s'applique tel quel
    expect(strikeSchedule(3, 30, 8, 4, 1)).toEqual([12, 16]);
    // la vitesse d'attaque comprime l'écart (échelle 0,5 -> 2 images)
    expect(strikeSchedule(3, 30, 8, 4, 0.5)).toEqual([10, 12]);
    // cycle court : bornes pour que la dernière frappe tombe avant la fin (DPS inchangé)
    const short = strikeSchedule(3, 9, 4, 4, 1);
    expect(short).toEqual([6, 8]);
    expect(Math.max(...short)).toBeLessThanOrEqual(8);
    expect(strikeSchedule(1, 9, 4, 4, 1)).toEqual([]);
  });

  it('playsStrike : sans séquence tout est joué, avec séquence seulement la frappe courante', () => {
    expect(playsStrike(2)).toBe(true);
    withStrike(1, () => {
      expect(playsStrike(1)).toBe(true);
      expect(playsStrike(0)).toBe(false);
    });
    expect(playsStrike(0)).toBe(true);
  });

  function hitTicks(cls: 'paladin' | 'barbarian' | 'amazon' | 'sorceress', skill: string): { ticks: number[]; frames: number; dmg: number; w: World } {
    const { g, w, m } = arena(cls as 'barbarian');
    g.character.skills[skill] = 10;
    w.refreshPlayer();
    w.player.mana = w.player.manaMax = 9999;
    const frames = castFrames(w, skill);
    const hp0 = m.hp;
    const ok = w.startCast(skill, m.x, m.y, m.id);
    expect(ok).toBe(true);
    const ticks: number[] = [];
    let last = m.hp;
    for (let t = 0; t < frames + 2; t++) {
      w.step(1);
      if (m.hp < last) ticks.push(t);
      last = m.hp;
    }
    return { ticks, frames, dmg: hp0 - m.hp, w };
  }

  it.skipIf(withoutPd2)('Zèle : trois frappes échelonnées dans un cycle de même durée qu’avant (DPS théorique inchangé)', () => {
    const { ticks, frames } = hitTicks('paladin', 'zeal');
    expect(ticks.length).toBeGreaterThanOrEqual(2); // un coup peut rater
    expect(new Set(ticks).size).toBe(ticks.length); // plus jamais tous au même tick
    expect(ticks[ticks.length - 1]).toBeLessThan(frames);
  });

  it('nombre de frappes : Zèle (D2 : 2 au niveau 1 ; mod : 3), Furie/Mitraille selon le niveau, Frénésie 1 (2 à deux armes)', () => {
    const { w } = arena('barbarian');
    expect(strikeCount(w, 'zeal')).toBe(withoutPd2 ? 2 : 3);
    expect(strikeCount(w, 'frenzy')).toBe(1);
    expect(strikePlan(w, 'frenzy', 12, 6)).toBeUndefined();
    expect(strikeCount(w, 'sacrifice')).toBe(1);
    // le plan ne dépasse jamais le cycle : la dernière frappe tombe avant la dernière image
    const plan = strikePlan(w, 'zeal', 9, 4)!;
    expect(plan.length).toBe(strikeCount(w, 'zeal') - 1);
    expect(plan.every((t) => t > 4 && t <= 8)).toBe(true);
    expect(strikeCount(w, 'fanaticism')).toBe(1);
  });
});
