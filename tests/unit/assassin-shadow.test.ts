/**
 * Ombres de l'Assassin (PD2) : la Guerrière lance les compétences des clics gauche et droit du joueur,
 * le Maître toute compétence d'Assassin ; lanceur répliqué (shadow-cast.ts) sans coût pour le joueur.
 */
import { withoutPd2 } from '../needs-pd2';
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, xpToReach } from '../../src/sim/progression';
import { SKILL_BY_ID, ramp } from '../../src/data/skills';
import { summonMinion, minionsOf } from '../../src/sim/minions';
import { chargeCount } from '../../src/sim/assassin';
import { SHADOW_CAST_EVERY, SHADOW_EXCLUDED, SHADOW_MAX_SPAWNS, SHADOW_SKILLS, shadowCast, shadowPool, shadowSkillLevel } from '../../src/sim/shadow-cast';
import type { Monster } from '../../src/sim/actors';

function setup(skills: Record<string, number>, primary = 'psychic_hammer', secondary = 'attack'): { g: Game; w: World; m: Monster } {
  const g = new Game(undefined, 'assassin');
  addXp(g.character, xpToReach(60));
  g.enterTown();
  for (const [k, v] of Object.entries(skills)) g.character.skills[k] = v;
  g.character.hotbar.primary = primary;
  g.character.hotbar.secondary = secondary;
  const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(6, 15);
  b.spawn({ monster: 'zombie', x: 16, y: 15, count: 1, r: 0 });
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty: 0, zoneLevel: 30, character: g.character });
  g.world.populate();
  const w = g.world;
  w.refreshPlayer();
  const m = w.monsters.find((x) => !x.dead && !x.isSummon)!;
  m.hp = m.hpMax = 1e9;
  m.dmgMin = m.dmgMax = 0;
  m.speed = 0;
  return { g, w, m };
}

const shadowOf = (w: World): Monster => minionsOf(w, 'shadow_warrior', 'shadow_master')[0];

describe('Ombres de l’Assassin : lancer des compétences du joueur', () => {
  it('liste blanche et exclusions disjointes ; buffs, invocations et déplacements exclus', () => {
    for (const id of SHADOW_SKILLS) {
      // une compétence de la liste peut n'exister qu'avec le mod (Sentinelle à éclairs en chaîne de PD2)
      if (withoutPd2 && !SKILL_BY_ID[id]) continue;
      expect(SKILL_BY_ID[id]).toBeDefined();
      expect(SHADOW_EXCLUDED[id]).toBeUndefined();
    }
    for (const id of ['venom', 'fade', 'burst_of_speed', 'blade_shield', 'dragon_flight', 'shadow_warrior', 'shadow_master']) expect(SHADOW_SKILLS).not.toContain(id);
  });

  it('Guerrière : Marteau psychique émis depuis sa position, dégâts du joueur, rien de consommé chez le joueur', () => {
    const { w, m } = setup({ psychic_hammer: 10, shadow_warrior: 10 });
    summonMinion(w, 'shadow_warrior', 10, 9, 18);
    const sh = shadowOf(w);
    const p = w.player;
    p.mana = p.manaMax;
    const before = { x: p.x, y: p.y, mana: p.mana, hp: p.hp, cd: { ...p.cooldowns } };
    const n = w.missiles.length;
    expect(shadowCast(w, sh, 'psychic_hammer', m)).toBe(true);
    const ms = w.missiles.slice(n);
    expect(ms.length).toBe(1);
    expect(ms[0].kind).toBe('psychic_hammer');
    expect(ms[0].x).toBeCloseTo(sh.x, 5);
    expect(ms[0].y).toBeCloseTo(sh.y, 5);
    expect(ms[0].owner).toBe(sh.id);
    expect(ms[0].shadow).toBe(true);
    expect(ms[0].level).toBe(p.d.skillLevels.psychic_hammer);
    // dégâts magiques dans la fourchette du joueur (synergies comprises, majorées d'une marge)
    const n0 = SKILL_BY_ID.psychic_hammer.n;
    const L = p.d.skillLevels.psychic_hammer;
    expect(ms[0].dmg.magic).toBeGreaterThanOrEqual(ramp(n0.min!, L) * 0.999);
    expect(ms[0].dmg.magic).toBeLessThanOrEqual(ramp(n0.max!, L) * 5);
    expect(p.x).toBe(before.x);
    expect(p.y).toBe(before.y);
    expect(p.mana).toBe(before.mana);
    expect(p.hp).toBe(before.hp);
    expect(p.cooldowns).toEqual(before.cd);
  });

  it('IA : l’ombre lance seule, cadence ≥ 0,8 s, sans mana du joueur ; le projectile blesse la cible au nom de l’ombre', () => {
    const { g, w, m } = setup({ psychic_hammer: 10, shadow_warrior: 10 });
    summonMinion(w, 'shadow_warrior', 10, 10, 15);
    const sh = shadowOf(w);
    const p = w.player;
    p.mana = p.manaMax = 1e6;
    const seen = new Set<number>();
    const ticks: number[] = [];
    for (let i = 0; i < 25 * 6; i++) {
      g.step(1);
      for (const ms of w.missiles) {
        if (ms.shadow && ms.kind === 'psychic_hammer' && !seen.has(ms.id)) {
          seen.add(ms.id);
          ticks.push(w.tick);
        }
      }
    }
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1]).toBeGreaterThanOrEqual(SHADOW_CAST_EVERY);
    expect(m.hp).toBeLessThan(m.hpMax);
    expect(p.mana).toBeGreaterThanOrEqual(1e6 - 1);
    expect(sh.dead).toBe(false);
  });

  it('PD2 : une seule ombre (partagée), sans durée ; le Maître remplace la Guerrière', () => {
    const { w } = setup({ shadow_warrior: 10, shadow_master: 10 });
    summonMinion(w, 'shadow_warrior', 10, 9, 15);
    summonMinion(w, 'shadow_warrior', 10, 9, 16);
    expect(minionsOf(w, 'shadow_warrior', 'shadow_master').length).toBe(1);
    expect(shadowOf(w).expireTick).toBeUndefined();
    summonMinion(w, 'shadow_master', 10, 9, 15);
    const all = minionsOf(w, 'shadow_warrior', 'shadow_master');
    expect(all.length).toBe(1);
    expect(all[0].pet).toBe('shadow_master');
  });

  it('Guerrière : clics gauche et droit ; Maître : toute compétence d’Assassin, niv. Maître ÷ 3 + niv. joueur ÷ 2', () => {
    const { w } = setup({ psychic_hammer: 10, tiger_strike: 6, fire_blast: 4, shadow_warrior: 10, shadow_master: 12 }, 'psychic_hammer', 'tiger_strike');
    summonMinion(w, 'shadow_warrior', 10, 9, 15);
    expect(shadowPool(w, shadowOf(w)).sort()).toEqual(['psychic_hammer', 'tiger_strike']);
    expect(shadowSkillLevel(w, shadowOf(w), 'psychic_hammer')).toBe(w.player.d.skillLevels.psychic_hammer);
    summonMinion(w, 'shadow_master', 12, 9, 15);
    const sm = shadowOf(w);
    const pool = shadowPool(w, sm);
    expect(pool).toContain('death_sentry');
    expect(pool).toContain('dragon_claw');
    // compétence que le joueur n'a pas : niveau du Maître ÷ 3
    expect(shadowSkillLevel(w, sm, 'death_sentry')).toBe(Math.max(1, Math.floor((sm.summonLevel ?? 0) / 3)));
    expect(shadowSkillLevel(w, sm, 'psychic_hammer')).toBe(Math.floor((sm.summonLevel ?? 0) / 3) + Math.floor(w.player.d.skillLevels.psychic_hammer / 2));
  });

  it('arts martiaux : l’ombre a ses propres charges, celles du joueur sont intactes', () => {
    const { w, m } = setup({ tiger_strike: 8, shadow_warrior: 10 }, 'tiger_strike');
    m.defense = 0;
    summonMinion(w, 'shadow_warrior', 10, 15, 15);
    const sh = shadowOf(w);
    sh.x = sh.px = m.x - 1;
    sh.y = sh.py = m.y;
    for (let i = 0; i < 6 && !(sh.shadowCharges ?? []).length; i++) shadowCast(w, sh, 'tiger_strike', m);
    expect((sh.shadowCharges ?? []).some((b) => b.id === 'charge_tiger_strike')).toBe(true);
    expect(chargeCount(w, 'tiger_strike')).toBe(0);
  });

  it('pas d’explosion : au plus N effets par lancer, deux tourelles par ombre ; ni joueur ni alliés blessés', () => {
    const { w, m } = setup({ shock_web: 20, lightning_sentry: 20, shadow_master: 20 });
    summonMinion(w, 'shadow_master', 20, 12, 15);
    const sh = shadowOf(w);
    const p = w.player;
    const hp = { p: p.hp, sh: sh.hp };
    const n = w.areas.length;
    shadowCast(w, sh, 'shock_web', m);
    expect(w.areas.slice(n).filter((a) => !a.dead).length).toBeLessThanOrEqual(SHADOW_MAX_SPAWNS);
    for (let i = 0; i < 4; i++) shadowCast(w, sh, 'lightning_sentry', m);
    const sentries = w.areas.filter((a) => !a.dead && a.kind === 'trap_lightning_sentry');
    expect(sentries.length).toBe(2);
    expect(sentries.every((a) => a.owner === sh.id && a.shadow)).toBe(true);
    w.step(25 * 3);
    expect(p.hp).toBeGreaterThanOrEqual(hp.p);
    expect(sh.hp).toBeGreaterThanOrEqual(hp.sh);
  });

  it('les pièges d’une ombre disparaissent avec elle', () => {
    const { g, w, m } = setup({ lightning_sentry: 10, shadow_master: 10 });
    summonMinion(w, 'shadow_master', 10, 12, 15);
    const sh = shadowOf(w);
    shadowCast(w, sh, 'lightning_sentry', m);
    expect(w.areas.some((a) => !a.dead && a.shadow)).toBe(true);
    w.killMonster(sh, null);
    g.step(2);
    expect(w.areas.some((a) => !a.dead && a.shadow)).toBe(false);
  });
});
