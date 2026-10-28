/**
 * Événements émis par la simulation. Le rendu, l'audio et l'interface les consomment
 * en lecture seule : ils ne modifient jamais la simulation.
 */
import type { Element } from '../data/stats';

export type SimEvent =
  | { t: 'baalCall' }
  | { t: 'hit'; target: number; amount: number; elem: Element; crit?: boolean; x: number; y: number; toPlayer: boolean }
  | { t: 'immune'; target: number; elem: Element; x: number; y: number }
  | { t: 'death'; id: number; x: number; y: number; rank: string; family: string; monster?: string; name?: string }
  | { t: 'cast'; id: number; skill: string; x: number; y: number; tx: number; ty: number }
  | { t: 'impact'; kind: string; x: number; y: number; radius: number; elem: Element }
  | { t: 'nova'; kind: string; x: number; y: number; radius: number; elem: Element }
  | { t: 'beam'; kind: string; points: number[]; elem: Element }
  | { t: 'teleport'; id: number; fx: number; fy: number; tx: number; ty: number }
  | { t: 'itemDrop'; uid: string; x: number; y: number; tier: number }
  | { t: 'pickup'; uid: string; name: string; kind: string }
  | { t: 'goldPickup'; amount: number }
  | { t: 'levelUp'; level: number }
  | { t: 'playerHurt'; amount: number; elem: Element; pctOfMax: number; src?: string }
  | { t: 'playerDeath' }
  | { t: 'potion'; kind: string }
  | { t: 'shrine'; kind: string; x: number; y: number }
  | { t: 'message'; text: string; color?: string }
  | { t: 'bossSpawn'; id: number; name: string }
  | { t: 'runComplete'; runId: string; durationSec: number }
  | { t: 'portalOpen'; x: number; y: number }
  | { t: 'block'; id: number }
  | { t: 'monsterAttack'; id: number; tx: number; ty: number; kind: string }
  | { t: 'wave'; index: number; total: number }
  | { t: 'mapEvent'; text: string }
  | { t: 'corrupt'; uid: string; outcome: string; bricked: boolean }
  | { t: 'zoneEnter'; zone: string }
  | { t: 'interact'; kind: string; ref?: string; objectId: number };

export class EventQueue {
  private buf: SimEvent[] = [];
  /** Borne de sécurité : si personne ne consomme (bots), on tronque. */
  constructor(private readonly max = 4000) {}

  push(e: SimEvent): void {
    if (this.buf.length >= this.max) this.buf.splice(0, this.buf.length - this.max + 1);
    this.buf.push(e);
  }

  drain(): SimEvent[] {
    const out = this.buf;
    this.buf = [];
    return out;
  }

  get length(): number {
    return this.buf.length;
  }
}

/**
 * Lot 312: an event of a zone joined edge to edge seen from the zone the hero is in (src/sim/seam-worlds.ts): its places moved by (dx, dy);
 * the identifiers are the same in both zones. A copy (the event itself unchanged)
 */
export function shiftEvent(e: SimEvent, dx: number, dy: number): SimEvent {
  if (dx === 0 && dy === 0) return e;
  switch (e.t) {
    case 'hit':
    case 'immune':
    case 'death':
    case 'impact':
    case 'nova':
    case 'itemDrop':
    case 'shrine':
    case 'portalOpen':
      return { ...e, x: e.x + dx, y: e.y + dy };
    case 'cast':
      return { ...e, x: e.x + dx, y: e.y + dy, tx: e.tx + dx, ty: e.ty + dy };
    case 'teleport':
      return { ...e, fx: e.fx + dx, fy: e.fy + dy, tx: e.tx + dx, ty: e.ty + dy };
    case 'monsterAttack':
      return { ...e, tx: e.tx + dx, ty: e.ty + dy };
    case 'beam':
      return { ...e, points: e.points.map((v, i) => v + (i % 2 ? dy : dx)) };
    default:
      return e;
  }
}
