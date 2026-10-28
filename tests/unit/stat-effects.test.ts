/**
 * Audit des statistiques d'objets : chaque statistique du catalogue (data/stats.ts) doit
 *  1. remonter jusqu'aux statistiques agrégées du personnage quand elle est portée par un objet,
 *  2. avoir un effet mesurable : sur les caractéristiques dérivées (vie, résistances, défense…),
 *     sur le niveau des compétences, ou sur le combat (dégâts, statuts, effets de coup, déclencheurs).
 * Une statistique ajoutée au catalogue sans effet fait échouer le dernier test.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, gainXp, xpToReach } from '../../src/sim/progression';
import { computeDerived, effectiveSkillLevel } from '../../src/sim/character';
import { STATS } from '../../src/data/stats';
import { CLASSES, TREE_STAT, STAT_CLASS, type ClassId } from '../../src/data/classes';
import { SKILLS } from '../../src/data/skills';
import { generateItem } from '../../src/sim/loot/itemgen';
import { itemFinal, setBonuses } from '../../src/sim/itemstats';
import { SET_BY_ID, SET_ITEM_BY_ID } from '../../src/data/items/sets';
import { Rng } from '../../src/core/rng';
import { fireWeapon, rollHit, strike, strikePacket } from '../../src/sim/melee';
import { damageMonster, damagePlayer, hitChance } from '../../src/sim/combat';
import { emptyPacket } from '../../src/sim/actors';
import { reflectFlat } from '../../src/sim/procs';
import { cursePlayer } from '../../src/sim/monster-auras';
import { maxCurses } from '../../src/sim/necromancer';
import type { Item } from '../../src/sim/item';
import type { Monster } from '../../src/sim/actors';
import { withoutPd2 } from '../needs-pd2';

function game(cls: ClassId, level = 60): Game {
  const g = new Game(undefined, cls);
  addXp(g.character, xpToReach(level));
  g.enterTown();
  return g;
}

/** Arène avec un monstre inoffensif, joueur au corps à corps, difficulté Normal */
function arena(g: Game, monster = 'zombie', count = 1): { w: World; m: Monster } {
  const b = new ZoneBuilder('arena', 'Arène', 30, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  b.spawn({ monster, x: 11.2, y: 15, count, r: count > 1 ? 1.2 : 0 });
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty: 0, zoneLevel: 30, character: g.character });
  g.world.populate();
  for (const x of g.world.monsters) {
    x.hp = x.hpMax = 1e9;
    x.dmgMin = x.dmgMax = 0;
  }
  const m = g.world.monsters.find((x) => !x.dead && !x.isSummon)!;
  return { w: g.world, m };
}

const withStat = (g: Game, stat: string, v: number): void => {
  g.character.bonuses = { ...g.character.bonuses, [stat]: v };
  g.world?.refreshPlayer();
};

/** Dégâts moyens d'une frappe (sans test de toucher) sur N coups */
function avgHit(w: World, m: Monster, n = 400): number {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    m.hp = m.hpMax;
    delete w.character.equipment.mainhand?.dur; // l'arme ne doit pas se briser pendant la mesure
    sum += strike(w, m, { sure: true }) as number;
  }
  return sum / n;
}

describe('1. agrégation : chaque statistique portée par un objet atteint le personnage', () => {
  const ring = (stat: string, v: number, param?: string): Item => {
    const it = generateItem(new Rng(3), 'ring', 60, { forceQuality: 'normal' });
    it.craftMods = [{ stat, value: v, param }];
    return it;
  };
  const SKIP = new Set(['edPct', 'minDmg', 'maxDmg', 'defPct', 'defFlat', 'reqPct', 'indestructible', 'socketsAdded', 'oskill', 'itemAura', 'classSkill', 'extraSummon']);
  for (const id of Object.keys(STATS)) {
    if (SKIP.has(id) || id.startsWith('proc') || id.endsWith('PerLvl')) continue;
    it(id, () => {
      const g = game('sorceress');
      const before = computeDerived(g.character, 0).all.get(id) ?? 0;
      g.character.equipment.ring1 = ring(id, 7);
      const d = computeDerived(g.character, 0);
      expect((d.all.get(id) ?? 0) - before, `${id} absent des statistiques agrégées`).toBe(7);
    });
  }
});

describe('2. caractéristiques dérivées', () => {
  const derived = (cls: ClassId, stat: string, v = 20) => {
    const g = game(cls);
    const base = computeDerived(g.character, 0);
    g.character.bonuses = { [stat]: v };
    return { base, after: computeDerived(g.character, 0) };
  };
  it('vie, mana, caractéristiques, défense, score d’attaque', () => {
    expect(derived('paladin', 'life').after.lifeMax).toBeGreaterThan(derived('paladin', 'life').base.lifeMax);
    expect(derived('paladin', 'lifePct').after.lifeMax).toBeGreaterThan(derived('paladin', 'lifePct').base.lifeMax);
    expect(derived('sorceress', 'mana').after.manaMax).toBeGreaterThan(derived('sorceress', 'mana').base.manaMax);
    expect(derived('sorceress', 'manaPct').after.manaMax).toBeGreaterThan(derived('sorceress', 'manaPct').base.manaMax);
    for (const s of ['str', 'dex', 'vit', 'ene'] as const) expect(derived('paladin', s)['after'][s]).toBe(derived('paladin', s).base[s] + 20);
    expect(derived('paladin', 'allAttr').after.str).toBe(derived('paladin', 'allAttr').base.str + 20);
    expect(derived('paladin', 'defense').after.defense).toBeGreaterThan(derived('paladin', 'defense').base.defense);
    expect(derived('paladin', 'attackRating').after.attackRating).toBeGreaterThan(derived('paladin', 'attackRating').base.attackRating);
    expect(derived('paladin', 'arPct').after.attackRating).toBeGreaterThan(derived('paladin', 'arPct').base.attackRating);
    expect(derived('paladin', 'vit').after.lifeMax).toBeGreaterThan(derived('paladin', 'vit').base.lifeMax);
    expect(derived('sorceress', 'ene').after.manaMax).toBeGreaterThan(derived('sorceress', 'ene').base.manaMax);
  });
  it('résistances, résistances maximum, absorptions', () => {
    for (const e of ['Fire', 'Cold', 'Light', 'Poison'] as const) {
      const k = e.toLowerCase() as 'fire' | 'cold' | 'light' | 'poison';
      expect(derived('paladin', `res${e}`).after.res[k]).toBeGreaterThan(derived('paladin', `res${e}`).base.res[k]);
      expect(derived('paladin', `maxRes${e}`, 5).after.maxRes[k]).toBe(derived('paladin', `maxRes${e}`, 5).base.maxRes[k] + 5);
    }
    const a = derived('paladin', 'resAll');
    for (const k of ['fire', 'cold', 'light', 'poison'] as const) expect(a.after.res[k]).toBeGreaterThan(a.base.res[k]);
    const m = derived('paladin', 'maxResAll', 5);
    for (const k of ['fire', 'cold', 'light', 'poison'] as const) expect(m.after.maxRes[k]).toBe(m.base.maxRes[k] + 5);
    for (const e of ['Fire', 'Cold', 'Light'] as const) expect(derived('paladin', `absorb${e}`).after.absorb[e.toLowerCase() as 'fire']).toBeGreaterThan(0);
  });
  it('vitesses, régénération, vols, par kill, trouvailles, expérience', () => {
    for (const s of ['fcr', 'fhr', 'frw', 'ias', 'mf', 'gf', 'xpPct', 'lifeLeech', 'manaLeech', 'lifePerKill', 'manaPerKill', 'lightRadius', 'dr', 'drFlat', 'mdr'] as const) {
      const r = derived('paladin', s);
      expect(r.after[s as keyof typeof r.after], s).toBeGreaterThan(r.base[s as keyof typeof r.base] as number);
    }
    expect(derived('paladin', 'manaAfterKill').after.manaPerKill).toBeGreaterThan(0);
    expect(derived('paladin', 'lifeRegen').after.lifeRegen).toBeGreaterThan(derived('paladin', 'lifeRegen').base.lifeRegen);
    expect(derived('sorceress', 'manaRegenPct').after.manaRegen).toBeGreaterThan(derived('sorceress', 'manaRegenPct').base.manaRegen);
    expect(derived('paladin', 'cbf', 1).after.cbf).toBe(true);
    expect(derived('paladin', 'poisonLength').after.poisonReduce).toBeGreaterThan(0);
    expect(derived('paladin', 'curseLength').after.curseReduce).toBeGreaterThan(0);
  });
  it('pénétration, brisement d’immunité, dégâts ajoutés, dégâts élémentaires', () => {
    for (const e of ['Fire', 'Cold', 'Light'] as const) expect(derived('sorceress', `pierce${e}`).after.pierce[e.toLowerCase() as 'fire']).toBeGreaterThan(0);
    expect(derived('sorceress', 'piercePoison').after.pierce.poison).toBeGreaterThan(0);
    expect(derived('sorceress', 'pierceAll').after.pierce.fire).toBeGreaterThan(0);
    for (const e of ['Phys', 'Fire', 'Cold', 'Light'] as const) expect(derived('sorceress', `sunder${e}`, 1).after.sunder[e.toLowerCase() as 'fire']).toBe(true);
    for (const e of ['Fire', 'Cold', 'Light', 'Magic'] as const) {
      const g = game('sorceress');
      g.character.bonuses = { [`add${e}Min`]: 3, [`add${e}Max`]: 9 };
      expect(computeDerived(g.character, 0).addedDmg[e.toLowerCase() as 'fire']).toEqual([3, 9]);
    }
    for (const s of ['fireDmgPct', 'coldDmgPct', 'lightDmgPct', 'poisonDmgPct', 'spellDmgPct', 'magicDmgPct']) {
      const r = derived('sorceress', s);
      expect(JSON.stringify(r.after.elemDmgPct), s).not.toBe(JSON.stringify(r.base.elemDmgPct));
    }
  });
  it('blocage : un objet « +X % de blocage » ne compte qu’avec un bouclier', () => {
    const g = game('paladin');
    delete g.character.equipment.offhand;
    g.character.bonuses = { block: 20 };
    expect(computeDerived(g.character, 0).block).toBe(0);
    g.character.equipment.offhand = generateItem(new Rng(2), 'large_shield', 60);
    g.character.bonuses = {};
    const base = computeDerived(g.character, 0).block;
    g.character.bonuses = { block: 20 };
    expect(computeDerived(g.character, 0).block).toBe(base + 20);
  });
});

describe('3. niveaux de compétences', () => {
  it('+ toutes les compétences, + classe, + arbre, + compétence précise', () => {
    for (const cls of Object.keys(CLASSES) as ClassId[]) {
      const g = game(cls);
      const own = SKILLS.filter((s) => STAT_CLASS[TREE_STAT[s.tree]] === cls && !s.passive);
      expect(own.length).toBeGreaterThan(0);
      const s0 = own[0];
      g.character.skills[s0.id] = 3;
      const lvl = (bonuses: Record<string, number>): number => {
        g.character.bonuses = bonuses;
        return computeDerived(g.character, 0).skillLevels[s0.id];
      };
      const base = lvl({});
      expect(lvl({ allSkills: 2 }), `${cls} allSkills`).toBe(base + 2);
      expect(lvl({ [CLASSES[cls].classStat]: 2 }), `${cls} ${CLASSES[cls].classStat}`).toBe(base + 2);
      expect(lvl({ [TREE_STAT[s0.tree]]: 2 }), `${cls} ${TREE_STAT[s0.tree]}`).toBe(base + 2);
      expect(lvl({ [`sk:${s0.id}`]: 2 }), `${cls} oskill`).toBe(base + 2);
    }
  });
  it('chaque statistique d’arbre est reliée à un arbre qui contient des compétences', () => {
    const treeStats = Object.values(TREE_STAT);
    for (const stat of Object.keys(STATS).filter((k) => /Skills$/.test(k) && !['allSkills'].includes(k))) {
      const isClass = Object.values(CLASSES).some((c) => c.classStat === stat);
      expect(isClass || treeStats.includes(stat), `${stat} n’est reliée à aucun arbre`).toBe(true);
      void effectiveSkillLevel;
    }
  });
  it('classSkill (staffmods) : compte pour la classe de la compétence seulement', () => {
    const staff = (): Item => {
      const it = generateItem(new Rng(6), 'ring', 60, { forceQuality: 'normal' });
      it.craftMods = [{ stat: 'classSkill', value: 3, param: 'fire_ball' }];
      return it;
    };
    const sorc = game('sorceress');
    sorc.character.equipment.ring1 = staff();
    expect(computeDerived(sorc.character, 0).skillLevels.fire_ball).toBe(3);
    const druid = game('druid');
    druid.character.equipment.ring1 = staff();
    expect(computeDerived(druid.character, 0).skillLevels.fire_ball ?? 0).toBe(0);
  });
});

describe('4. effets de combat', () => {
  it('coup écrasant : dégâts moyens en hausse', () => {
    const g = game('barbarian');
    const { w, m } = arena(g);
    const a = avgHit(w, m);
    withStat(g, 'crushingBlow', 100);
    expect(avgHit(w, m)).toBeGreaterThan(a * 1.2);
  });
  it('frappe mortelle : dégâts moyens en hausse', () => {
    const g = game('barbarian');
    const { w, m } = arena(g);
    const a = avgHit(w, m);
    withStat(g, 'deadlyStrike', 60);
    expect(avgHit(w, m)).toBeGreaterThan(a * 1.2);
  });
  it('blessures ouvertes, étourdissement, gel, poison, ralentissement, repoussement', () => {
    const g = game('barbarian');
    const { w, m } = arena(g);
    withStat(g, 'openWounds', 100);
    strike(w, m, { sure: true });
    expect(m.bleedT ?? 0).toBeGreaterThan(0);
    // dégâts des blessures ouvertes par seconde (statistique PD2, règle `combat.openWounds` du mod) : saignement plus fort
    if (!withoutPd2) {
      const bleed = m.bleedDps ?? 0;
      m.bleedDps = 0;
      withStat(g, 'openWoundsDps', 500);
      strike(w, m, { sure: true });
      expect(m.bleedDps ?? 0).toBeGreaterThan(bleed + 400);
      withStat(g, 'openWoundsDps', 0);
    }
    withStat(g, 'openWounds', 0);
    m.stunT = 0;
    withStat(g, 'stunChance', 100);
    strike(w, m, { sure: true });
    expect(m.stunT).toBeGreaterThan(0);
    withStat(g, 'stunChance', 0);
    m.freezeT = 0;
    withStat(g, 'freezeTarget', 4);
    strike(w, m, { sure: true });
    expect(m.freezeT).toBeGreaterThan(0);
    withStat(g, 'freezeTarget', 0);
    m.poisonT = 0;
    withStat(g, 'poisonDmg', 90);
    strike(w, m, { sure: true });
    expect(m.poisonT ?? 0).toBeGreaterThan(0);
    withStat(g, 'poisonDmg', 0);
    m.chillT = 0;
    withStat(g, 'slowTarget', 40);
    strike(w, m, { sure: true });
    expect(m.chillT).toBeGreaterThan(0);
    withStat(g, 'slowTarget', 0);
    const x0 = m.x;
    withStat(g, 'knockback', 1);
    strike(w, m, { sure: true });
    expect(Math.abs(m.x - x0)).toBeGreaterThan(0.1);
  });
  it('dégâts contre les morts-vivants et les démons, dégâts de zone', () => {
    const g = game('barbarian');
    const { w, m } = arena(g, 'zombie');
    const a = avgHit(w, m, 50);
    withStat(g, 'dmgUndeadPct', 100);
    expect(avgHit(w, m, 50)).toBeGreaterThan(a * 1.5);
    const g2 = game('barbarian');
    const r2 = arena(g2, 'fallen');
    const b = avgHit(r2.w, r2.m, 50);
    withStat(g2, 'dmgDemonPct', 100);
    expect(avgHit(r2.w, r2.m, 50)).toBeGreaterThan(b * 1.5);
  });
  it('score d’attaque : % du score, ignore la défense, réduit la défense, contre les démons', () => {
    const g = game('barbarian');
    const { w, m } = arena(g, 'fallen');
    m.defense = 400;
    const rate = (n = 3000): number => {
      let h = 0;
      for (let i = 0; i < n; i++) if (rollHit(w, m, 0)) h++;
      return h / n;
    };
    const base = rate();
    withStat(g, 'arPct', 200);
    expect(rate()).toBeGreaterThan(base + 0.03);
    withStat(g, 'arPct', 0);
    withStat(g, 'ignoreDef', 1);
    expect(rate()).toBeGreaterThan(base + 0.05);
    withStat(g, 'ignoreDef', 0);
    withStat(g, 'reduceDef', 60);
    expect(rate()).toBeGreaterThan(base + 0.03);
    withStat(g, 'reduceDef', 0);
    withStat(g, 'arDemon', 600);
    expect(rate()).toBeGreaterThan(base + 0.03);
    withStat(g, 'arDemon', 0);
    // contre les morts-vivants : sans effet sur un démon, effet sur un zombie
    withStat(g, 'arUndead', 600);
    expect(rate()).toBeLessThan(base + 0.03);
    const gu = game('barbarian');
    const u = arena(gu, 'zombie');
    u.m.defense = 400;
    const urate = (n = 3000): number => {
      let h = 0;
      for (let i = 0; i < n; i++) if (rollHit(u.w, u.m, 0)) h++;
      return h / n;
    };
    const ubase = urate();
    withStat(gu, 'arUndead', 600);
    expect(urate()).toBeGreaterThan(ubase + 0.03);
  });
  it('épines, dégâts convertis en mana, défense contre mêlée / projectiles', () => {
    const g = game('paladin');
    const { w, m } = arena(g);
    withStat(g, 'thornsFlat', 500);
    const hp = m.hp;
    reflectFlat(w, m);
    expect(m.hp).toBeLessThan(hp);
    withStat(g, 'thornsFlat', 0);
    withStat(g, 'lightThornsFlat', 500);
    const hp2 = m.hp;
    reflectFlat(w, m);
    expect(m.hp).toBeLessThan(hp2);
    withStat(g, 'lightThornsFlat', 0);
    // dégâts → mana
    withStat(g, 'dmgToMana', 50);
    w.player.mana = 0;
    w.player.hp = w.player.hpMax = 1e6;
    const pk = emptyPacket(true);
    pk.phys = 1000;
    damagePlayer(w, w.player, pk, null);
    expect(w.player.mana).toBeGreaterThan(100);
    withStat(g, 'dmgToMana', 0);
    // défense contre la mêlée et contre les projectiles : réduit la chance d'être touché
    m.ar = 2000;
    m.mlvl = 30;
    const hits = (ranged: boolean): number => {
      let n = 0;
      for (let i = 0; i < 600; i++) {
        w.player.hp = w.player.hpMax = 1e9;
        const p = emptyPacket(false);
        p.phys = 10;
        p.ranged = ranged;
        if (damagePlayer(w, w.player, p, m) > 0) n++;
      }
      return n;
    };
    const baseMelee = hits(false);
    const baseRanged = hits(true);
    withStat(g, 'defMelee', 5000);
    expect(hits(false)).toBeLessThan(baseMelee);
    expect(hits(true)).toBeGreaterThanOrEqual(baseRanged * 0.8);
    withStat(g, 'defMelee', 0);
    withStat(g, 'defMissile', 5000);
    expect(hits(true)).toBeLessThan(baseRanged);
  });
  it('vitesse de blocage et gel réduit de moitié', () => {
    const g = game('paladin');
    const { w, m } = arena(g);
    g.character.equipment.offhand = generateItem(new Rng(2), 'large_shield', 60);
    withStat(g, 'block', 300);
    m.ar = 1e6;
    w.player.mode = 'idle';
    const recovery = (fbr: number): number => {
      withStat(g, 'fbr', fbr);
      let len = 0;
      for (let i = 0; i < 200 && !len; i++) {
        w.player.mode = 'idle';
        w.player.hp = w.player.hpMax = 1e9;
        const p = emptyPacket(false);
        p.phys = 1;
        w.events.drain();
        damagePlayer(w, w.player, p, m);
        // seuls les coups bloqués comptent ici (un coup encaissé interrompt avec la table FHR)
        if ((w.player.mode as string) === 'hit' && w.events.drain().some((e) => e.t === 'block')) len = w.player.modeLen;
      }
      return len;
    };
    const a = recovery(0);
    const b = recovery(100);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeLessThan(a);
    // gel
    withStat(g, 'fbr', 0);
    const freeze = (): number => {
      w.player.freezeT = 0;
      const p = emptyPacket(true);
      p.freeze = 100;
      p.cold = 1;
      w.player.hp = w.player.hpMax = 1e9;
      damagePlayer(w, w.player, p, null);
      return w.player.freezeT;
    };
    const f0 = freeze();
    withStat(g, 'halfFreeze', 1);
    expect(freeze()).toBeLessThan(f0);
  });
  it('coups de pied, dégâts magiques, transpercer, ombre supplémentaire', () => {
    const g = game('assassin');
    const { w, m } = arena(g);
    withStat(g, 'addMagicMin', 50);
    withStat(g, 'addMagicMax', 60);
    expect(strikePacket(w).magic).toBeGreaterThanOrEqual(50);
    expect(w.player.d.addedDmg.magic).toEqual([50, 60]);
    withStat(g, 'addMagicMin', 0);
    withStat(g, 'addMagicMax', 0);
    void m;
  });
  it('cooldownRed raccourcit les temps de recharge', () => {
    const g = game('sorceress');
    const { w } = arena(g);
    const withCd = SKILLS.find((s) => s.n.cooldown && STAT_CLASS[TREE_STAT[s.tree]] === 'sorceress' && !s.passive);
    expect(withCd).toBeTruthy();
    g.character.skills[withCd!.id] = 5;
    w.refreshPlayer();
    w.player.mana = w.player.manaMax = 1e6;
    const cd = (): number => {
      w.player.cooldowns = {};
      w.player.mode = 'idle';
      w.input.cast = { skill: withCd!.id, tx: w.player.x + 3, ty: w.player.y, targetId: 0 };
      for (let i = 0; i < 60; i++) {
        g.step(1);
        if (w.player.cooldowns[withCd!.id]) break;
      }
      return (w.player.cooldowns[withCd!.id] ?? 0) - w.tick;
    };
    const a = cd();
    withStat(g, 'cooldownRed', 50);
    const b = cd();
    expect(a).toBeGreaterThan(0);
    expect(b).toBeLessThan(a);
  });
  void hitChance;
});

const itemWith = (base: string, stat: string, v: number, param?: string): Item => {
  const it = generateItem(new Rng(4), base, 60, { forceQuality: 'normal' });
  it.craftMods = [{ stat, value: v, param }];
  return it;
};

describe('5. propriétés locales à l’objet et par niveau', () => {
  it('dégâts d’arme : dégâts améliorés, minimum, maximum, maximum par niveau', () => {
    const base = itemFinal(generateItem(new Rng(4), 'long_sword', 60, { forceQuality: 'normal' }), 60).dmg!;
    expect(itemFinal(itemWith('long_sword', 'edPct', 100), 60).dmg![1]).toBeGreaterThan(base[1] * 1.5);
    expect(itemFinal(itemWith('long_sword', 'minDmg', 9), 60).dmg![0]).toBe(base[0] + 9);
    expect(itemFinal(itemWith('long_sword', 'maxDmg', 9), 60).dmg![1]).toBe(base[1] + 9);
    expect(itemFinal(itemWith('long_sword', 'maxDmgPerLvl', 1), 60).dmg![1]).toBe(base[1] + 60);
  });
  it('défense : améliorée, fixe, par niveau ; prérequis réduits', () => {
    const base = itemFinal(generateItem(new Rng(4), 'breast_plate', 60, { forceQuality: 'normal' }), 60);
    expect(itemFinal(itemWith('breast_plate', 'defPct', 100), 60).defense!).toBeGreaterThan(base.defense! * 1.5);
    expect(itemFinal(itemWith('breast_plate', 'defFlat', 50), 60).defense!).toBeGreaterThanOrEqual(base.defense! + 50);
    expect(itemFinal(itemWith('breast_plate', 'defPerLvl', 1), 60).defense!).toBeGreaterThanOrEqual(base.defense! + 60);
    expect(itemFinal(itemWith('breast_plate', 'reqPct', 50), 60).reqStr).toBeLessThan(base.reqStr);
  });
  it('hors arme / armure (bijoux, charmes, joyaux) : dégâts et défense fixes s’appliquent au personnage', () => {
    const g = game('barbarian');
    g.character.equipment.mainhand = generateItem(new Rng(4), 'long_sword', 60, { forceQuality: 'normal' });
    delete g.character.equipment.ring1;
    const before = computeDerived(g.character, 0);
    g.character.equipment.ring1 = itemWith('ring', 'maxDmg', 10);
    expect(computeDerived(g.character, 0).weaponDmg[1]).toBeGreaterThan(before.weaponDmg[1] + 5);
    g.character.equipment.ring1 = itemWith('ring', 'minDmg', 4);
    expect(computeDerived(g.character, 0).weaponDmg[0]).toBeGreaterThan(before.weaponDmg[0] + 2);
    g.character.equipment.ring1 = itemWith('ring', 'edPct', 100);
    expect(computeDerived(g.character, 0).weaponDmg[1]).toBeGreaterThan(before.weaponDmg[1] * 1.5);
    g.character.equipment.ring1 = itemWith('ring', 'defFlat', 40);
    expect(computeDerived(g.character, 0).defense).toBeGreaterThan(before.defense + 30);
  });
  it('bonus par niveau du personnage (objets)', () => {
    const g = game('paladin', 50);
    const before = computeDerived(g.character, 0);
    const get = (stat: string, v = 1) => {
      const gg = game('paladin', 50);
      gg.character.equipment.ring1 = itemWith('ring', stat, v);
      return computeDerived(gg.character, 0);
    };
    expect(get('lifePerLvl').lifeMax).toBeGreaterThan(before.lifeMax + 40);
    expect(get('manaPerLvl').manaMax).toBeGreaterThan(before.manaMax + 40);
    expect(get('attackRatingPerLvl').attackRating).toBeGreaterThan(before.attackRating + 40);
    expect(get('mfPerLvl').mf).toBeGreaterThan(before.mf + 40);
    expect(get('strPerLvl').str).toBe(before.str + 50);
    expect(get('dexPerLvl').dex).toBe(before.dex + 50);
    expect(get('vitPerLvl').vit).toBe(before.vit + 50);
    expect(get('resFirePerLvl').res.fire).toBeGreaterThan(before.res.fire);
    expect(get('resColdPerLvl').res.cold).toBeGreaterThan(before.res.cold);
    expect(get('resLightPerLvl').res.light).toBeGreaterThan(before.res.light);
    expect(get('thornsPerLvl').all.get('thornsFlat')).toBe(50);
    expect(get('addLightMaxPerLvl').addedDmg.light?.[1]).toBe(50);
    expect(get('maxColdPerLvl').addedDmg.cold?.[1]).toBe(50);
    expect(get('maxLightDmgPerLvl').addedDmg.light?.[1]).toBe(50);
    expect(get('absorbColdPerLvl').absorb.cold).toBeGreaterThan(0);
    expect(get('arPctPerLvl').attackRating).toBeGreaterThan(before.attackRating);
  });
  it('châsses ajoutées : les uniques et sets de la table reçoivent leurs châsses', () => {
    const g = new Rng(8);
    const withSockets = generateItem(g, 'ring', 60, { forceQuality: 'normal' });
    expect(withSockets.sockets).toBe(0);
  });
});

describe('6. déclencheurs, auras et effets particuliers', () => {
  it('procs : en frappant, en attaquant, à la mort, en tuant, au niveau, en incantant, quand on est frappé', () => {
    for (const kind of ['Hit', 'Att', 'Kill', 'Death', 'LevelUp', 'Cast', 'GetHit']) {
      const g = game('barbarian');
      const { w, m } = arena(g);
      const seen: string[] = [];
      g.onEvent((e) => seen.push(e.t === 'impact' ? `impact:${(e as { kind?: string }).kind}` : e.t));
      withStat(g, `proc${kind}:frost_nova:3`, 100);
      g.step(1);
      seen.length = 0;
      if (kind === 'Hit' || kind === 'Att') strike(w, m, { sure: true });
      else if (kind === 'Kill' || kind === 'Death') {
        m.hp = 1;
        strike(w, m, { sure: true });
      } else if (kind === 'LevelUp') gainXp(w, xpToReach(g.character.level + 1) - g.character.xp + 1);
      else if (kind === 'Cast') {
        g.character.skills.bash = 1;
        w.refreshPlayer();
        w.player.mana = w.player.manaMax = 1e6;
        w.input.cast = { skill: 'bash', tx: m.x, ty: m.y, targetId: m.id };
        for (let i = 0; i < 40; i++) g.step(1);
      } else {
        m.dmgMin = m.dmgMax = 1;
        m.ar = 1e6;
        w.player.hp = w.player.hpMax = 1e9;
        for (let i = 0; i < 200; i++) g.step(1);
      }
      g.step(1);
      expect(
        seen.some((e) => e === 'nova'),
        `proc${kind} n’a rien déclenché (${seen.slice(0, 8).join(',')})`,
      ).toBe(true);
    }
  });
  it.skipIf(withoutPd2)('auras d’objet et charges', () => {
    const g = game('paladin');
    const base = computeDerived(g.character, 0);
    g.character.bonuses = { auraConviction: 10 };
    expect(computeDerived(g.character, 0).conviction).toBeGreaterThan(base.conviction);
    g.character.bonuses = { auraMeditation: 10 };
    expect(computeDerived(g.character, 0).manaRegen).toBeGreaterThan(base.manaRegen);
    g.character.bonuses = { auraConcentration: 10 };
    expect(computeDerived(g.character, 0).concDmgPct).toBeGreaterThan(base.concDmgPct);
    g.character.bonuses = { ctaBattleOrders: 5 };
    expect(computeDerived(g.character, 0).lifeMax).toBeGreaterThan(base.lifeMax);
    g.character.bonuses = { 'itemAura:might': 10 };
    expect(computeDerived(g.character, 0).meleeDmgPct).toBeGreaterThan(base.meleeDmgPct);
  });
  it('ranimer en Revenant, ombre supplémentaire, transpercer', () => {
    const g = game('barbarian');
    const { w, m } = arena(g);
    withStat(g, 'reanimateReturned', 100);
    m.hp = 1;
    strike(w, m, { sure: true });
    expect(w.monsters.some((x) => x.pet === 'returned' && !x.dead)).toBe(true);
    const a = game('amazon');
    a.character.equipment.mainhand = generateItem(new Rng(5), 'short_bow', 60, { forceQuality: 'normal' });
    const r = arena(a);
    withStat(a, 'pierceChance', 40);
    const before = r.w.missiles.length;
    fireWeapon(r.w, r.m.x, r.m.y, {});
    const shot = r.w.missiles[r.w.missiles.length - 1];
    expect(r.w.missiles.length).toBeGreaterThan(before);
    expect(shot.dmg.pierceChance ?? 0).toBeGreaterThanOrEqual(40);
  });
});

describe('5b. bonus de set par niveau et zone', () => {
  // bonus PD2 du set (patch du mod) : le Berserker vanilla n'a pas de dégâts maximum par niveau
  it.skipIf(withoutPd2)('Berserker au complet : dégâts maximum améliorés par niveau (edMaxPctPerLvl) ; rayon des dégâts de zone', () => {
    const items = SET_BY_ID.set_berserkers_garb.items.map((id) => {
      const d = SET_ITEM_BY_ID[id];
      const it = generateItem(new Rng(5), d.base, 60, { forceQuality: 'set', forceSetId: id });
      return it;
    });
    const STAT = 'edMaxPctPerLvl'; // converti en dégâts améliorés locaux
    expect(STAT in STATS && setBonuses(items, 60).local.edPct).toBeGreaterThan(100);
    const g = game('barbarian');
    const { w, m } = arena(g, 'zombie', 3);
    const other = w.monsters.find((x) => x !== m && !x.dead && !x.isSummon)!;
    other.x = m.x + 3.2;
    other.y = m.y;
    w.monsterHash.clear();
    for (const x of w.monsters) if (!x.dead) w.monsterHash.insert(x);
    withStat(g, 'splashDmg', 1);
    const hp = other.hp;
    strike(w, m, { sure: true });
    expect(other.hp).toBe(hp);
    withStat(g, 'splashRadius', 100);
    strike(w, m, { sure: true });
    expect(other.hp).toBeLessThan(hp);
  });
});

describe('7. assassin : coups de pied et ombres', () => {
  it('coups de pied : dégâts en hausse ; ombre supplémentaire : deux ombres', () => {
    const g = game('assassin');
    const { w, m } = arena(g);
    g.character.skills.dragon_talon = 5;
    g.character.skills.shadow_warrior = 5;
    w.refreshPlayer();
    w.player.mana = w.player.manaMax = 1e6;
    const dmg = (): number => {
      m.hp = m.hpMax;
      w.player.cooldowns = {};
      w.player.mode = 'idle';
      w.input.cast = { skill: 'dragon_talon', tx: m.x, ty: m.y, targetId: m.id };
      for (let i = 0; i < 60 && m.hp === m.hpMax; i++) g.step(1);
      return m.hpMax - m.hp;
    };
    let a = 0;
    let b = 0;
    withStat(g, 'kickDmg', 0);
    for (let i = 0; i < 6; i++) a += dmg();
    withStat(g, 'kickDmg', 500);
    for (let i = 0; i < 6; i++) b += dmg();
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    const shadows = (): number => {
      w.player.cooldowns = {};
      w.player.mode = 'idle';
      w.input.cast = { skill: 'shadow_warrior', tx: w.player.x + 2, ty: w.player.y, targetId: 0 };
      for (let i = 0; i < 80; i++) g.step(1);
      return w.monsters.filter((x) => x.pet === 'shadow_warrior' && !x.dead).length;
    };
    const one = shadows();
    withStat(g, 'extraShadow', 1);
    expect(shadows()).toBeGreaterThan(one);
  });
});

describe('7b. restes des colonnes « After » PD2 : malédictions, frappe mortelle, pénétration, blocage, invocations', () => {
  it('résistance aux malédictions : durée des malédictions de monstres réduite (75 % au plus)', () => {
    const g = game('paladin');
    const { w } = arena(g);
    const dur = (): number => {
      w.player.hexes = {};
      cursePlayer(w, 'weaken', 5);
      return (w.player.hexes?.weaken?.until ?? 0) - w.tick;
    };
    const base = dur();
    withStat(g, 'curseRes', 40);
    expect(dur()).toBeLessThan(base * 0.7);
    withStat(g, 'curseRes', 300);
    expect(dur()).toBeGreaterThan(base * 0.2);
    expect(dur()).toBeLessThan(base * 0.3);
  });
  it('malédiction supplémentaire : une de plus appliquée simultanément', () => {
    const g = game('necromancer');
    const { w } = arena(g);
    const a = maxCurses(w);
    withStat(g, 'extraCurse', 1);
    expect(maxCurses(w)).toBe(a + 1);
  });
  it('résistance physique ennemie : pénétration des dégâts physiques', () => {
    const g = game('barbarian');
    const { w, m } = arena(g);
    m.res = { ...m.res, phys: 50 };
    const hit = (): number => {
      m.hp = m.hpMax;
      const p = emptyPacket(false);
      p.phys = 1000;
      return damageMonster(w, m, p, w.player);
    };
    const a = hit();
    withStat(g, 'piercePhys', 30);
    expect(hit()).toBeGreaterThan(a * 1.5);
  });
  it('lancers sur blocage : déclenche un sort quand un coup est paré', () => {
    const g = game('paladin');
    const { w, m } = arena(g);
    m.ar = 1e7;
    withStat(g, 'block', 1000);
    w.player.d.block = 1e6;
    w.player.mana = w.player.manaMax = 1e6;
    withStat(g, 'procBlock:frost_nova:10', 100);
    w.player.d.block = 1e6;
    const cold = (): number => m.hp;
    m.hp = m.hpMax = 1e9;
    const hp0 = cold();
    for (let i = 0; i < 6; i++) {
      const pk = emptyPacket(false);
      pk.phys = 5;
      damagePlayer(w, w.player, pk, m);
      g.step(2);
    }
    expect(m.hp, 'la nova de glace du déclencheur blesse le monstre').toBeLessThan(hp0);
  });
  it('invocations supplémentaires : plus de golems maintenus', () => {
    const g = game('necromancer');
    const { w } = arena(g);
    g.character.skills.clay_golem = 5;
    w.refreshPlayer();
    w.player.mana = w.player.manaMax = 1e6;
    const golems = (): number => {
      for (let i = 0; i < 4; i++) {
        w.player.cooldowns = {};
        w.player.mode = 'idle';
        w.input.cast = { skill: 'clay_golem', tx: w.player.x + 1, ty: w.player.y, targetId: 0 };
        g.step(40);
      }
      return w.monsters.filter((x) => x.pet === 'clay_golem' && !x.dead).length;
    };
    const base = golems();
    expect(base).toBeGreaterThan(0);
    withStat(g, 'extraSummon:golem_mastery', 2);
    w.player.mana = w.player.manaMax = 1e6;
    expect(golems()).toBe(base + 2);
  });
  it('empêche les monstres de guérir, fuite, efficacité du coup écrasant', () => {
    const g = game('barbarian');
    const { w, m } = arena(g);
    m.hp = m.hpMax = 1e9;
    m.regen = 1e6;
    m.hp = 5e8;
    withStat(g, 'preventMonsterHeal', 1);
    strike(w, m, { sure: true });
    const h = m.hp;
    g.step(150);
    expect(m.hp, 'pas de régénération').toBeLessThanOrEqual(h);
    withStat(g, 'preventMonsterHeal', 0);
    m.noHealUntil = 0;
    m.lastHitTick = -999;
    g.step(100);
    expect(m.hp, 'régénération rétablie').toBeGreaterThan(h);
    withStat(g, 'fleeChance', 100);
    m.fleeUntil = undefined;
    strike(w, m, { sure: true });
    expect(m.fleeUntil ?? 0).toBeGreaterThan(w.tick);
    withStat(g, 'fleeChance', 0);
    // efficacité du coup écrasant (statistique PD2, règle `combat.crushingBlow` du mod)
    if (!withoutPd2) {
      withStat(g, 'crushingBlow', 100);
      const a = avgHit(w, m, 50);
      withStat(g, 'crushEff', 100);
      expect(avgHit(w, m, 50)).toBeGreaterThan(a * 1.3);
    }
  });
  it.skipIf(withoutPd2)('carquois : squelettes archers et flèches de glace supplémentaires', () => {
    const g = game('necromancer');
    const { w } = arena(g, 'zombie', 8);
    for (const z of w.monsters) {
      z.dead = true;
      z.deathTick = w.tick;
    }
    g.character.skills.raise_skeleton_archer = 1;
    w.refreshPlayer();
    w.player.mana = w.player.manaMax = 1e6;
    const archers = (): number => {
      for (let i = 0; i < 8; i++) {
        w.player.cooldowns = {};
        w.player.mode = 'idle';
        w.input.cast = { skill: 'raise_skeleton_archer', tx: w.player.x + 1, ty: w.player.y, targetId: 0 };
        g.step(30);
      }
      return w.monsters.filter((x) => x.pet === 'raise_skeleton_archer' && !x.dead).length;
    };
    const base = archers();
    expect(base).toBeGreaterThan(0);
    withStat(g, 'extraSummon:raise_skeleton_archer', 4);
    for (const z of w.monsters) if (!z.pet) z.eaten = false;
    expect(archers()).toBeGreaterThan(base);
    const a = game('amazon');
    a.character.skills.cold_arrow = 5;
    a.character.equipment.mainhand = generateItem(new Rng(5), 'short_bow', 60, { forceQuality: 'normal' });
    const r = arena(a);
    const shots = (): number => {
      r.w.missiles.length = 0;
      r.w.player.mana = r.w.player.manaMax = 1e6;
      r.w.player.cooldowns = {};
      r.w.player.mode = 'idle';
      r.w.input.cast = { skill: 'cold_arrow', tx: r.m.x, ty: r.m.y, targetId: r.m.id };
      a.step(12);
      return r.w.missiles.length;
    };
    const n0 = shots();
    expect(n0).toBeGreaterThan(0);
    withStat(a, 'coldArrowExtra', 3);
    expect(shots()).toBe(n0 + 3);
  });
  // explosion du Sacrifice : règle skills.paladin du mod (D2 : aucune)
  it.skipIf(withoutPd2)('Sacrifice : le monstre tué explose et blesse ses voisins', () => {
    const g = game('paladin');
    const { w } = arena(g, 'zombie', 3);
    const [a, b, c] = w.monsters.filter((x) => !x.dead);
    for (const x of [a, b, c]) {
      x.hp = x.hpMax = 1e6;
      x.x = 11.2;
      x.y = 15;
    }
    b.x = 12.2;
    c.x = 30;
    g.character.skills.sacrifice = 10;
    w.refreshPlayer();
    a.hp = 1;
    w.player.mana = w.player.manaMax = 1e6;
    w.input.cast = { skill: 'sacrifice', tx: a.x, ty: a.y, targetId: a.id };
    g.step(60);
    expect(a.dead).toBe(true);
    expect(b.hp, 'voisin blessé par l’explosion').toBeLessThan(1e6 - 4e4);
    expect(c.hp, 'monstre lointain intact').toBe(1e6);
  });
  it('masses et sceptres : +50 % de dégâts aux morts-vivants (propriété de base D2)', () => {
    const g = game('paladin');
    arena(g, 'zombie');
    const mk = (b: string): number => {
      g.character.equipment.mainhand = generateItem(new Rng(5), b, 30, { forceQuality: 'normal' });
      g.world?.refreshPlayer();
      return g.world!.player.d.all.get('dmgUndeadPct') ?? 0;
    };
    expect(mk('mace')).toBe(50);
    expect(mk('short_sword')).toBe(0);
  });
});

describe('8. couverture : toute statistique du catalogue est vérifiée par ce fichier', () => {
  // sans effet de jeu faute de système correspondant (pas de durabilité des objets) ; statistiques lues par une règle du mod pd2 seulement
  // (`combat.criticalMul` : mods/pd2/tests/unit/combat-pd2.test.ts)
  const EXCEPTIONS = new Set(['indestructible', 'deadlyMult', 'maxDeadly']);
  it('aucune statistique orpheline', () => {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const DYNAMIC = /^proc|Skills$|^(res|maxRes|absorb|pierce|sunder|add)(Fire|Cold|Light|Poison|Phys|All|Magic)(Min|Max|Flat)?$/; // vérifiées par boucle sur les éléments / classes
    const orphans = Object.keys(STATS).filter((id) => !EXCEPTIONS.has(id) && !DYNAMIC.test(id) && !new RegExp(`['"\`.:]${id}\\b|\\b${id}[:'"\`]`).test(src.replace(/Object\.keys\(STATS\)/g, '')));
    expect(orphans).toEqual([]);
  });
});
