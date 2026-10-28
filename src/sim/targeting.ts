/**
 * Auto-visée (docs/internal/ETUDE-MOBILE.md §14.4) : requêtes en LECTURE SEULE sur le monde.
 * Utilisées par les contrôles tactiles, le clavier/souris et les bots.
 */
import { SKILL_BY_ID, lin } from '../data/skills';
import { angleDiff, dist } from '../core/math';
import type { Monster } from './actors';
import type { World } from './world';
import { attackReach } from './melee';

export interface AimContext {
  /** Direction du joystick (monde), si actif ou relâché depuis < 300 ms */
  joy: { x: number; y: number } | null;
  /** Cible actuelle (hystérésis) */
  currentId: number;
  /** Cible verrouillée par un tap sur un ennemi */
  lockedId: number;
}

export interface AimResult {
  x: number;
  y: number;
  targetId: number;
}

const buf: Monster[] = [];

const W_DEFAULT = { prox: 1, cone: 0.8, type: 0.35, sticky: 0.4, threat: 0.25, lowHp: 0.1 };

export function acquisitionRange(skill: string, w?: World): number {
  // attaque de base : portée de l'arme (arc et arbalète, armes de jet) ; compétences d'arme : leur portée
  if (skill === 'attack') return w ? Math.max(4, attackReach(w) + 2) : 4;
  if (SKILL_BY_ID[skill]?.melee) return Math.max(4, SKILL_BY_ID[skill].range + 2);
  const s = SKILL_BY_ID[skill];
  return Math.max(s?.range ?? 8, 3) + 2;
}

function scoreSingle(w: World, m: Monster, ctx: AimContext, rAcq: number): number {
  const p = w.player;
  const d = dist(p.x, p.y, m.x, m.y);
  if (d > rAcq) return -Infinity;
  if ((m.convertedUntil ?? 0) > w.tick) return -Infinity;
  if (d > 3 && !w.grid.lineOfSight(p.x, p.y, m.x, m.y)) return -Infinity;
  const prox = 1 - d / rAcq;
  const toM = Math.atan2(m.y - p.y, m.x - p.x);
  let cone: number;
  if (ctx.joy) {
    const th = Math.abs(angleDiff(Math.atan2(ctx.joy.y, ctx.joy.x), toM));
    cone = th <= Math.PI / 3 ? Math.cos(th) : -0.5;
  } else cone = 0.25 * Math.cos(angleDiff(p.facing, toM));
  const type = m.rank === 'boss' || m.rank === 'unique' ? 1 : m.rank === 'champion' ? 0.6 : 0;
  const sticky = m.id === ctx.currentId ? 1 : 0;
  const threat = m.mode === 'attack' && d <= 1.8 ? 1 : 0;
  const lowHp = 1 - m.hp / m.hpMax;
  const W = W_DEFAULT;
  return W.prox * prox + W.cone * cone + W.type * type + W.sticky * sticky + W.threat * threat + W.lowHp * lowHp;
}

/** Meilleure cible unique pour une compétence (le plus proche pondéré, élites, cône du joystick) */
export function pickSingle(w: World, skill: string, ctx: AimContext): Monster | null {
  const p = w.player;
  const rAcq = acquisitionRange(skill, w);
  const locked = ctx.lockedId ? w.monsters.find((m) => m.id === ctx.lockedId && !m.dead) : null;
  if (locked && dist(p.x, p.y, locked.x, locked.y) <= rAcq * 1.5) return locked;
  let best: Monster | null = null;
  let bs = -Infinity;
  let cur = -Infinity;
  for (const m of w.monstersNear(p.x, p.y, rAcq, buf)) {
    const s = scoreSingle(w, m, ctx, rAcq);
    if (m.id === ctx.currentId) cur = s;
    if (s > bs) {
      bs = s;
      best = m;
    }
  }
  // hystérésis : on ne change de cible que si l'écart dépasse 0,25
  if (best && best.id !== ctx.currentId && cur > -Infinity && bs < cur + 0.25) return w.monsters.find((m) => m.id === ctx.currentId) ?? best;
  return best;
}

/** Point au sol couvrant la grappe d'ennemis la plus dense (sorts de zone) */
export function pickGround(w: World, skill: string, ctx: AimContext): { x: number; y: number; targetId: number } | null {
  const p = w.player;
  const rAcq = acquisitionRange(skill, w);
  const s = SKILL_BY_ID[skill];
  const aoe = s?.n.radius ? lin(s.n.radius, 1) : 2.5;
  const near = [...w.monstersNear(p.x, p.y, rAcq, buf)];
  if (near.length === 0) return null;
  let best: Monster | null = null;
  let bs = -Infinity;
  for (const m of near) {
    let score = 0;
    for (const o of near) {
      const d = dist(m.x, m.y, o.x, o.y);
      if (d <= aoe) score += o.rank === 'boss' ? 3 : o.rank === 'unique' || o.rank === 'champion' ? 2 : 1;
    }
    score += scoreSingle(w, m, ctx, rAcq) * 0.5;
    if (score > bs) {
      bs = score;
      best = m;
    }
  }
  if (!best) return null;
  return { x: best.x, y: best.y, targetId: best.id };
}

/** Résout la visée automatique d'une compétence : point et cible */
export function autoAim(w: World, skill: string, ctx: AimContext): AimResult {
  const p = w.player;
  const s = SKILL_BY_ID[skill];
  const rule = skill === 'attack' ? 'nearest' : (s?.target ?? 'nearest');
  const fallbackDir = ctx.joy ? Math.atan2(ctx.joy.y, ctx.joy.x) : p.facing;
  const range = skill === 'attack' ? attackReach(w) + 0.2 : (s?.range ?? 8);
  if (rule === 'self') return { x: p.x, y: p.y, targetId: 0 };
  if (rule === 'direction') {
    const r = skill === 'teleport' ? range : range * 0.7;
    return { x: p.x + Math.cos(fallbackDir) * r, y: p.y + Math.sin(fallbackDir) * r, targetId: 0 };
  }
  if (rule === 'densest') {
    const g = pickGround(w, skill, ctx);
    if (g) return g;
  } else {
    const t = rule === 'strongest' ? (pickStrongest(w, skill, ctx) ?? pickSingle(w, skill, ctx)) : pickSingle(w, skill, ctx);
    if (t) return { x: t.x, y: t.y, targetId: t.id };
  }
  return { x: p.x + Math.cos(fallbackDir) * range * 0.7, y: p.y + Math.sin(fallbackDir) * range * 0.7, targetId: 0 };
}

function pickStrongest(w: World, skill: string, ctx: AimContext): Monster | null {
  const p = w.player;
  const rAcq = acquisitionRange(skill, w);
  let best: Monster | null = null;
  let bs = -Infinity;
  for (const m of w.monstersNear(p.x, p.y, rAcq, buf)) {
    const rank = m.rank === 'boss' ? 4 : m.rank === 'unique' ? 3 : m.rank === 'champion' ? 2 : 0;
    const s = rank + scoreSingle(w, m, ctx, rAcq) * 0.5;
    if (s > bs) {
      bs = s;
      best = m;
    }
  }
  return best && best.rank !== 'normal' && best.rank !== 'minion' ? best : null;
}

/** Objet ou interactif le plus proche à portée du bouton contextuel */
export function contextTarget(w: World, radius = 2): { kind: 'item' | 'object'; id: number; label: string } | null {
  const p = w.player;
  let best: { kind: 'item' | 'object'; id: number; label: string; d: number } | null = null;
  for (const gi of w.items) {
    if (gi.show <= 0) continue;
    const d = dist(p.x, p.y, gi.x, gi.y);
    if (d <= radius && (!best || d < best.d)) best = { kind: 'item', id: gi.id, label: 'Ramasser', d };
  }
  for (const o of w.objects) {
    // lot 312: a neighbour's object shown beyond the seam is used in its own zone
    if (o.kind === 'gate' || o.mirror) continue;
    if (
      o.used &&
      (o.kind === 'chest' || o.kind === 'barrel' || o.kind === 'shrine' || o.kind === 'sarcophagus' || o.kind === 'seal' || o.kind === 'well' || o.kind === 'weaponrack' || o.kind === 'quest')
    )
      continue;
    const d = dist(p.x, p.y, o.x, o.y);
    if (d <= radius + 0.5 && (!best || d < best.d - 0.3)) best = { kind: 'object', id: o.id, label: o.label, d };
  }
  return best ? { kind: best.kind, id: best.id, label: best.label } : null;
}

/** Height (world units along −x −y, the screen's up) of a standing figure's body above its feet: a person (NPC) is tapped on its body too */
const BODY_UP = 1.6;

/**
 * The object a tap or a click at (x, y) means (lot 311, owner: "after a first interaction, the others do not work"): the nearest one within
 * 1.4 units of its feet, or of a person's body drawn above them (an NPC is touched on his chest, not at his feet); the gates are scenery
 */
export function objectAt<O extends { id: number; kind: string; x: number; y: number; mirror?: true }>(objects: readonly O[], x: number, y: number, max = 1.4): O | null {
  let best: O | null = null;
  let bd = max;
  for (const o of objects) {
    if (o.kind === 'gate' || o.mirror) continue;
    let d = dist(x, y, o.x, o.y);
    if (o.kind === 'npc') {
      // distance to the segment from the feet to the head (screen up = world −x −y)
      const t = Math.max(0, Math.min(BODY_UP, (o.x - x + (o.y - y)) / 2));
      d = Math.min(d, dist(x, y, o.x - t, o.y - t));
    }
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}
