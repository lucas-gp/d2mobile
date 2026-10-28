/**
 * Auras et malédictions des monstres (D2 / PD2).
 * - Aura enchantée (modificateur d'unique) et auras fixes : Puissance, Concentration, Fanatisme, Vigueur profitent aux monstres
 *   proches ; Conviction, Gel sacré, Feu sacré et Choc sacré frappent le joueur. PD2 : niveau mlvl/7, valeurs de la page Monsters.
 * - Malédictions lancées sur le joueur (une seule à la fois, comme D2) : Amplification des dégâts (modificateur « Maudit »),
 *   Affaiblissement, Décrépitude, Malédiction de défense, Résistance réduite (Uber Baal PD2 : −75 %).
 */
import { clamp, dist } from '../core/math';
import { SKILL_BY_ID, lin } from '../data/skills';
import type {} from '../data/stats';
import { MISSILE_DMG } from '../data/curves';
import { emptyPacket, type Monster, type Player } from './actors';
import { TICK_HZ } from './constants';
import { spawnMissile } from './missiles';
import type { World } from './world';

/** Auras qu'une Aura enchantée peut tirer (PD2 : Concentration remplace Visée bénie ; Vigueur ajoutée ; Choc sacré dès mlvl 20) */
const ENCHANT_AURAS = ['might', 'concentration', 'fanaticism', 'conviction', 'vigor', 'holy_fire', 'holy_freeze', 'holy_shock'] as const;
export const AURA_NAMES: Record<string, string> = {
  might: 'Puissance',
  concentration: 'Concentration',
  fanaticism: 'Fanatisme',
  conviction: 'Conviction',
  vigor: 'Vigueur',
  holy_fire: 'Feu sacré',
  holy_freeze: 'Gel sacré',
  holy_shock: 'Choc sacré',
};
/** Rayon des auras de monstres (mètres du jeu) */
const MONSTER_AURA_RADIUS = 7;

/* PD2, page Monsters « Monster Aura Stats » : niveaux d'aura 1 à 13 (mlvl 7 à 91) */
const MIGHT = [40, 50, 60, 70, 80, 90, 100, 110, 122, 134, 146, 158, 170];
const CONCENTRATION = [30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
const FANATIC_PARTY = [25, 33, 42, 50, 59, 67, 76, 84, 93, 101, 110, 118, 127];
const FANATIC_IAS = [14, 18, 20, 23, 25, 26, 27, 28, 29, 30, 31, 31, 32];
const CONVICTION_RES = [27, 31, 35, 39, 43, 47, 51, 55, 59, 63, 67, 71, 75];
const CONVICTION_DEF = [49, 56, 61, 66, 70, 73, 75, 77, 79, 80, 82, 83, 85];
const VIGOR = [24, 31, 36, 41, 45, 48, 50, 52, 54, 55, 57, 58, 60];
const at = (t: number[], L: number): number => t[clamp(Math.floor(L), 1, t.length) - 1];

export const monsterAuraLevel = (mlvl: number): number => Math.max(1, Math.floor(mlvl / 7));

export function pickEnchantAura(w: World, mlvl: number): string {
  const pool = ENCHANT_AURAS.filter((a) => a !== 'holy_shock' || mlvl >= 20);
  return w.rng.spawn.pick(pool);
}

const nearBuf: Monster[] = [];

/** Pulsation d'aura (toutes les 0,4 s) : bonus aux alliés, effets sur le joueur proche */
export function updateMonsterAura(w: World, m: Monster): void {
  const id = m.auraId;
  if (!id || w.tick % 10 !== m.id % 10) return;
  const L = m.auraLvl ?? monsterAuraLevel(m.mlvl);
  const until = w.tick + 15;
  if (id === 'might' || id === 'concentration' || id === 'fanaticism' || id === 'vigor') {
    for (const o of w.monsterHash.query(m.x, m.y, MONSTER_AURA_RADIUS, nearBuf)) {
      if (o.dead || o.isSummon || o.pet) continue;
      const b = o.auraBuff && o.auraBuff.until > w.tick ? o.auraBuff : { dmg: 0, ar: 0, spd: 0, atk: 0, until };
      b.until = until;
      if (id === 'might') b.dmg = Math.max(b.dmg, at(MIGHT, L));
      else if (id === 'concentration') b.dmg = Math.max(b.dmg, at(CONCENTRATION, L));
      else if (id === 'fanaticism') {
        b.dmg = Math.max(b.dmg, at(FANATIC_PARTY, L));
        b.atk = Math.max(b.atk, at(FANATIC_IAS, L));
      } else b.spd = Math.max(b.spd, at(VIGOR, L));
      o.auraBuff = b;
    }
    return;
  }
  const p = w.player;
  if (p.dead || dist(m.x, m.y, p.x, p.y) > MONSTER_AURA_RADIUS) return;
  switch (id) {
    case 'conviction':
      setHex(p, 'conviction', L, until);
      break;
    case 'holy_freeze':
      if (!p.d.cbf) {
        p.chillT = Math.max(p.chillT, 20);
        p.chillPct = Math.max(p.chillPct, lin(SKILL_BY_ID.holy_freeze.n.value, L) / 100);
      }
      break;
    case 'holy_fire':
    case 'holy_shock':
      // dégâts d'aura : une pulsation par seconde
      if (w.tick % TICK_HZ === m.id % 10) {
        const n = SKILL_BY_ID[id].n;
        const dmg = w.rng.combat.float(lin(n.min, L), lin(n.max, L));
        w.hurtPlayer(m, id === 'holy_fire' ? 'fire' : 'light', dmg, true);
      }
      break;
  }
}

/** Multiplicateurs reçus d'une aura alliée */
export function auraDmgMul(m: Monster, tick: number): number {
  return m.auraBuff && m.auraBuff.until > tick ? 1 + m.auraBuff.dmg / 100 : 1;
}
export function auraSpeedMul(m: Monster, tick: number): number {
  return m.auraBuff && m.auraBuff.until > tick ? 1 + m.auraBuff.spd / 100 : 1;
}
export function auraAtkMul(m: Monster, tick: number): number {
  return m.auraBuff && m.auraBuff.until > tick ? 1 + m.auraBuff.atk / 100 : 1;
}

/* ---------------- malédictions sur le joueur ---------------- */

function setHex(p: Player, id: string, lvl: number, until: number): void {
  p.hexes ??= {};
  const cur = p.hexes[id];
  if (!cur || cur.until < until || cur.lvl < lvl) p.hexes[id] = { lvl: Math.max(lvl, cur && cur.until > until ? cur.lvl : 0), until };
}

const CURSES = ['amplify_damage', 'weaken', 'decrepify', 'defense_curse', 'lower_resist'];

/** Malédiction lancée par un monstre : elle remplace la précédente (une seule à la fois) */
export function cursePlayer(w: World, id: string, lvl: number): void {
  const p = w.player;
  if (p.dead) return;
  p.hexes ??= {};
  for (const c of CURSES) if (c !== id) delete p.hexes[c];
  const s = SKILL_BY_ID[id];
  const sec = id === 'defense_curse' ? 8 : id === 'lower_resist' && lvl >= 50 ? 25 : lin(s?.n.duration, lvl) || 8;
  // résistance aux malédictions : durée réduite (75 % au plus)
  const dur = sec * (1 - Math.min(75, p.d.all.get('curseRes') ?? 0) / 100);
  p.hexes[id] = { lvl, until: w.tick + Math.max(1, Math.round(dur * TICK_HZ)) };
  if (id === 'decrepify' && !p.d.cbf) {
    p.chillT = Math.max(p.chillT, Math.round(dur * TICK_HZ));
    p.chillPct = Math.max(p.chillPct, 0.5);
  }
  w.events.push({ t: 'impact', kind: 'curse', x: p.x, y: p.y, radius: 0.8, elem: 'magic' });
}

const hex = (p: Player, id: string, tick: number): { lvl: number; until: number } | undefined => {
  const h = p.hexes?.[id];
  return h && h.until > tick ? h : undefined;
};

/** Résistance physique perdue (Amplification −100, Décrépitude −50) */
export function hexPhysRes(p: Player, tick: number): number {
  if (!p.hexes) return 0;
  return hex(p, 'amplify_damage', tick) ? 100 : hex(p, 'decrepify', tick) ? 50 : 0;
}

/** Résistance élémentaire perdue (Conviction, Résistance réduite ; Uber Baal : niveau ≥ 50 → −75 fixe) */
export function hexElemRes(p: Player, tick: number): number {
  if (!p.hexes) return 0;
  const conv = hex(p, 'conviction', tick);
  const lr = hex(p, 'lower_resist', tick);
  return (conv ? at(CONVICTION_RES, conv.lvl) : 0) + (lr ? (lr.lvl >= 50 ? 75 : lin(SKILL_BY_ID.lower_resist.n.value, lr.lvl)) : 0);
}

/** Défense perdue (%) : Conviction, Malédiction de défense */
export function hexDefensePct(p: Player, tick: number): number {
  if (!p.hexes) return 0;
  const conv = hex(p, 'conviction', tick);
  return Math.max(conv ? at(CONVICTION_DEF, conv.lvl) : 0, hex(p, 'defense_curse', tick) ? 50 : 0);
}

/** Multiplicateur des dégâts infligés par le joueur (Affaiblissement −33 %, Décrépitude −50 %) */
export function hexPlayerDmgMul(p: Player, tick: number): number {
  if (!p.hexes) return 1;
  if (hex(p, 'decrepify', tick)) return 0.5;
  if (hex(p, 'weaken', tick)) return 1 - lin(SKILL_BY_ID.weaken.n.value, 1) / 100;
  return 1;
}

/**
 * Modificateur « Maudit » (D2) : 75 % de chances de lancer Amplification des dégâts de niveau mlvl/5 + 1 quand un coup
 * ou un projectile de l'unique (ou de ses sbires) touche le joueur.
 */
export function onMonsterHitPlayer(w: World, src: Monster | null): void {
  if (!src || !src.mods.includes('cursed')) return;
  if (w.rng.combat.chance(0.75)) cursePlayer(w, 'amplify_damage', Math.floor(src.mlvl / 5) + 1);
}

/**
 * Enchanté par la foudre (D2) : quand l'unique est touché, il libère 8 éclairs chargés de niveau mlvl/2, chacun de
 * (2 × niveau) − 1 points de foudre (pondérés comme les autres projectiles de monstres, MISSILE_DMG). Au plus une salve par 0,4 s.
 */
export function lightningEnchantedBurst(w: World, m: Monster): void {
  if (m.dead || (m.lastBoltTick ?? -99) > w.tick - 10) return;
  m.lastBoltTick = w.tick;
  const lvl = Math.max(1, Math.floor(m.mlvl / 2));
  const dmg = (2 * lvl - 1) * MISSILE_DMG[w.difficulty];
  for (let i = 0; i < 8; i++) {
    const pk = emptyPacket(true);
    pk.light = dmg;
    spawnMissile(w, { kind: 'lightning_m', team: 1, owner: m.id, x: m.x, y: m.y, angle: w.rng.combat.float(0, Math.PI * 2), speed: 7, radius: 0.3, range: 6, dmg: pk, elem: 'light' });
  }
}
