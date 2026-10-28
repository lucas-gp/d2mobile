/**
 * Lot 312 — the zones joined edge to edge alive together (owner: "move between zones directly as if it were a single zone as in the real
 * game, with no black area"; lot 311 drew the neighbour's map beyond the edge, its monsters, objects and lights appeared at the crossing).
 *
 * Design (the least invasive that keeps each zone's identity: level, difficulty scaling, magic find, quests, waypoint, minimap, save):
 * every zone stays its own `World` (its grid, its monsters, its rules); the neighbours of the zone the hero is in are built ahead (as
 * entering them would build them: same seed, same zone level) and kept while he walks the chain, and the one whose seam is near is
 * SIMULATED beside it, in lockstep (same tick):
 *
 * - its player is a **proxy** of the hero (his place in its coordinates, his stats and buffs shared), so its monsters see him, wake, chase
 *   and strike as they would in their zone; they stay on their own map (as in Diablo II, a monster does not leave its level), coming to
 *   the edge; their blows are forwarded to the hero in his zone (`World.seam.hurtPlayer`), the attacker's copy as the source;
 * - its monsters, ground items, objects, missiles and areas near the seam (the part of its map drawn, `SeamDef.view`) are **mirrored** in
 *   the hero's zone (`mirror: true` copies at their place in its coordinates, the SAME identifiers: each world of the chain numbers its
 *   entities apart, `WorldOptions.idBase`): the renderer, the minimap, the targeting, the hero's skills and missiles see them like the
 *   zone's own. A copy is never simulated here; what the hero's zone does to it (damage, chill, curses, aggro…) is written back to the
 *   original before the neighbour's step, a copy killed kills the original in its zone (experience, loot, quests there,
 *   `World.seam.killMirror`), a copied item picked up is taken out of its zone (`pickedMirror`); beyond its map's edge a zone sees and
 *   shoots into the neighbours' maps (`WalkGrid.outside`: their walls stop sight and missiles), so a monster sees the hero across the
 *   seam and the hero's missile flies on over the neighbour's ground, striking the copies there;
 * - crossing (`cross`) swaps the roles: the neighbour becomes the zone (the hero's state, his companions moved in, keeping their
 *   identifiers), the zone becomes a neighbour whose monsters stay where they are (no respawn, no teleport, no re-roll); walking back
 *   finds them as they were. The worlds of the chain are kept while the hero walks it (at most `CACHE_MAX`); any other change of zone
 *   (waypoint, portal, death, a new game) starts again from the zone entered, as before. The save holds the zone the hero is in, as for
 *   every zone (its neighbours are built again from their seed after a reload).
 *
 * The simulation stays deterministic: the neighbours are built and activated at distances of the hero's position (`SEAM_PREPARE`,
 * `SEAM_ACTIVE`); the application may build one earlier in idle time (`prepareStep`), which builds the same world.
 */
import type { World } from './world';
import type { AreaEffect, DamagePacket, GroundItem, Missile, Monster, WorldObject } from './actors';
import type { SeamDef } from '../data/zone-types';
import type { RunDef } from '../data/runs';
import { runSteps, type Steps } from '../data/zones/steps';
import { shiftEvent, type SimEvent } from './events';
import { CELL } from './grid';
import { syncMercAuras } from './merc';
import { freeIdBase } from './zone-keep';

/** The hero within this distance (world units) of a seam's crossing: the neighbour is simulated, its entities shown (about 1.5 screens) */
export const SEAM_ACTIVE = 40;
/** …and stays simulated until he is this far */
export const SEAM_RELEASE = 48;
/** The neighbour's world is built at this distance at the latest (the application builds it earlier in idle time) */
export const SEAM_PREPARE = 60;
/** The application prepares a neighbour in idle time from this distance (about 2 screens) */
export const SEAM_IDLE = 90;
/** Worlds of a chain kept at most (the zone the hero is in and its neighbours first) */
export const CACHE_MAX = 5;
/** Margin (world units) around the neighbour's part drawn where its entities are mirrored */
const MIRROR_MARGIN = 6;

/** What the game gives the seam manager (src/sim/game.ts) */
export interface SeamHost {
  readonly world: World;
  /** the seams are on (rule `world.seams`) */
  seamsOn(): boolean;
  /** the neighbour zone `id`'s world as entering it would build it, not yet populated; null if it cannot be built (no map) */
  buildSeamWorld(id: string, idBase: number): { world: World; def: RunDef | null; town: boolean } | null;
  /** the same in steps (a few milliseconds each), for idle time */
  seamWorldSteps(id: string, idBase: number): Steps<{ world: World; def: RunDef | null; town: boolean } | null>;
  /** an event of a neighbour's step that concerns the game (a monster killed: quests of its zone; a level gained) */
  neighbourEvent(e: SimEvent, n: { world: World; def: RunDef | null }): void;
  /** Lot 316: the zone `id`'s world kept for the session (src/sim/zone-keep.ts), taken out of the store; null if none */
  keptSeamWorld?(id: string): { world: World; def: RunDef | null; town: boolean } | null;
  /** Lot 316: a world leaving the chain (another change of zone, too many kept): kept for the session when it is a zone of the Campaign */
  keepSeamWorld?(w: World, def: RunDef | null): void;
  /** Lot 316: the identifier ranges the game's other worlds use (the kept zones) */
  idBasesInUse?(): Set<number>;
}

interface Pair<T> {
  m: T;
  o: T;
}

/** A world of the chain */
interface Link {
  id: string;
  world: World;
  def: RunDef | null;
  town: boolean;
  /** simulated beside the zone the hero is in */
  active: boolean;
  /** last tick it was the zone or a neighbour (the oldest goes first) */
  used: number;
  /** mirrors of its entities in the zone the hero is in, by identifier (while it is an active neighbour) */
  mon: Map<number, Pair<Monster>>;
  items: Map<number, Pair<GroundItem>>;
  objs: Map<number, Pair<WorldObject>>;
  mis: Map<number, Pair<Missile>>;
  areas: Map<number, Pair<AreaEffect>>;
}

/** Fields of a monster that are its place (moved by the seam's offset), never written back */
const OWN = new Set(['x', 'y', 'px', 'py', 'mirror']);

/** Distance from a point to a rectangle [x0, y0, x1, y1] (0 inside) */
function rectDist(x: number, y: number, r: readonly [number, number, number, number]): number {
  const dx = Math.max(r[0] - x, 0, x - r[2]);
  const dy = Math.max(r[1] - y, 0, y - r[3]);
  return Math.hypot(dx, dy);
}

export class SeamWorlds {
  /** the zone the hero is in, as last seen (another world there: the chain starts again) */
  private current: World | null = null;
  private links = new Map<string, Link>();
  /** the identifier range of the neighbour being prepared in idle time */
  private pendingBase = -1;
  /** events of the neighbours' steps, in the coordinates of the zone the hero is in (taken by `Game.step`) */
  private out: SimEvent[] = [];
  /** a neighbour being prepared in idle time (`prepareStep`): its build's steps under way */
  private pending: { id: string; steps: ReturnType<SeamHost['seamWorldSteps']> } | null = null;

  constructor(private readonly host: SeamHost) {}

  /** The worlds of the chain (tests, measures) */
  worlds(): { id: string; world: World; active: boolean }[] {
    return [...this.links.values()].map((l) => ({ id: l.id, world: l.world, active: l.active }));
  }

  /** The world of zone `id` in the chain, if it is built */
  worldOf(id: string): World | null {
    return this.links.get(id)?.world ?? null;
  }

  /** Events of the neighbours' steps since the last call (already handled for their own zone; for the renderer, the sound, the HUD) */
  takeEvents(): SimEvent[] {
    const o = this.out;
    this.out = [];
    return o;
  }

  /** The seams of the zone the hero is in (none when the rule is off) */
  private seamsOf(w: World): SeamDef[] {
    return w.zone.seams?.length && this.host.seamsOn() ? w.zone.seams : [];
  }

  /** The zone the hero is in changed otherwise than by a seam (portal, waypoint, death…): the chain starts again from it */
  private adopt(w: World): void {
    const prev = this.current;
    if (prev) {
      stripMirrors(prev);
      prev.seamLinks = [];
      prev.seam = null;
      prev.grid.outside = null;
    }
    for (const l of this.links.values())
      if (l.world !== w) {
        l.world.seam = null;
        l.world.grid.outside = null;
        stripMirrors(l.world);
        // lot 316: kept for the session (a zone of the Campaign), found as it is when the hero comes back
        if (!l.town) this.host.keepSeamWorld?.(l.world, l.def);
      }
    this.links.clear();
    this.pending = null;
    this.pendingBase = -1;
    this.current = w;
    if (!this.seamsOf(w).length) return;
    const l = this.newLink(w.zone.id, w, null, !!w.zone.town);
    l.used = w.tick;
    this.links.set(l.id, l);
    w.seam = this.hooks(w);
    w.grid.outside = this.outside(w);
  }

  /**
   * The hero at (x, y) of the zone he is in may cross seam `s` there: the neighbour (when built) has room for him at the same place (its
   * own props in the overlap: a rock of one zone is not in the other's grid). Elsewhere in the crossing he goes on walking, and crosses
   * where it has room: never moved aside as he crosses
   */
  canCross(s: SeamDef, x: number, y: number, r: number): boolean {
    const n = this.links.get(s.to)?.world;
    return !n || !n.grid.circleBlocked(x - s.at.x, y - s.at.y, r);
  }

  /** Beyond a chain world's map: the walls of the neighbours built where they lie (`WalkGrid.outside`), the outside elsewhere */
  private outside(w: World): (x: number, y: number) => boolean {
    return (x, y) => {
      for (const s of w.zone.seams ?? []) {
        const n = this.links.get(s.to)?.world;
        if (!n) continue;
        const cx = Math.floor((x - s.at.x) / CELL);
        const cy = Math.floor((y - s.at.y) / CELL);
        if (n.grid.inBounds(cx, cy)) return n.grid.opaque[cy * n.grid.cols + cx] === 1;
      }
      return true;
    };
  }

  private newLink(id: string, world: World, def: RunDef | null, town: boolean): Link {
    return { id, world, def, town, active: false, used: 0, mon: new Map(), items: new Map(), objs: new Map(), mis: new Map(), areas: new Map() };
  }

  private hooks(w: World): NonNullable<World['seam']> {
    return {
      hurtPlayer: (src, pk) => this.forwardHurt(w, src, pk),
      killMirror: (m) => this.killMirror(m),
      pickedMirror: (gi) => this.pickedMirror(gi),
    };
  }

  /** Builds the world of zone `id` (once): a proxy of the hero, its monsters placed, the hero's companions left out */
  private build(id: string): Link | null {
    const have = this.links.get(id);
    if (have) return have;
    // a build begun in idle time finished at once (the same world), else the whole build now
    // lot 316: the zone kept for the session, as it was left
    const kept = this.host.keptSeamWorld?.(id);
    if (kept) {
      this.pending = null;
      this.pendingBase = -1;
      return this.finish(id, kept, true);
    }
    let built: ReturnType<SeamHost['buildSeamWorld']>;
    if (this.pending?.id === id) {
      built = runSteps(this.pending.steps);
      this.pending = null;
      this.pendingBase = -1;
    } else {
      built = this.host.buildSeamWorld(id, this.allocBase());
    }
    if (!built) return null;
    return this.finish(id, built);
  }

  /** Lot 316: an identifier range no world of the chain, the zone being prepared or a kept zone uses (the lowest free) */
  private allocBase(): number {
    const used = this.host.idBasesInUse?.() ?? new Set<number>();
    if (this.current) used.add(this.current.idBase);
    used.add(this.host.world.idBase);
    for (const l of this.links.values()) used.add(l.world.idBase);
    if (this.pendingBase >= 0) used.add(this.pendingBase);
    return freeIdBase(used);
  }

  private finish(id: string, built: NonNullable<ReturnType<SeamHost['buildSeamWorld']>>, kept = false): Link {
    const w = built.world;
    if (!built.town && !kept) w.populate();
    stripMirrors(w);
    w.seamLinks = [];
    // the mercenary and the summons follow the hero: they are in his zone, not here
    w.monsters = w.monsters.filter((m) => !m.pet);
    syncMercAuras(w);
    w.proxy = true;
    w.events.drain();
    const l = this.newLink(id, w, built.def, built.town);
    this.links.set(id, l);
    w.seam = this.hooks(w);
    w.grid.outside = this.outside(w);
    this.evict();
    return l;
  }

  /** At most `CACHE_MAX` worlds: the oldest neighbours of neighbours go first */
  private evict(): void {
    if (this.links.size <= CACHE_MAX || !this.current) return;
    const near = new Set([this.current.zone.id, ...this.seamsOf(this.current).map((s) => s.to)]);
    const old = [...this.links.values()].filter((l) => !near.has(l.id)).sort((a, b) => a.used - b.used);
    while (this.links.size > CACHE_MAX && old.length) {
      const l = old.shift()!;
      l.world.seam = null;
      l.world.grid.outside = null;
      this.links.delete(l.id);
      // lot 316: out of the chain, kept for the session
      if (!l.town) this.host.keepSeamWorld?.(l.world, l.def);
    }
  }

  /**
   * One step of the chain, after the zone's own step (`Game.step`): what the zone did to the neighbours' copies written back, the
   * neighbours near a seam built, activated and stepped (lockstep), their entities mirrored in the zone
   */
  step(): void {
    const host = this.host;
    if (host.world !== this.current) this.adopt(host.world);
    const A = this.current!;
    const seams = this.seamsOf(A);
    if (!seams.length) return;
    const hero = A.player;
    for (const s of seams) {
      const l = this.links.get(s.to);
      if (l?.active) this.writeBack(l);
    }
    // distances: built, simulated
    for (const s of seams) {
      const d = rectDist(hero.x, hero.y, s.cross);
      let l = this.links.get(s.to);
      if (!l && d <= SEAM_PREPARE) l = this.build(s.to) ?? undefined;
      if (!l) continue;
      l.used = A.tick;
      const want = l.active ? d <= SEAM_RELEASE : d <= SEAM_ACTIVE;
      if (want && !l.active) {
        // frozen while the hero was far: its time catches up with the zone's (no step skipped while it is simulated)
        l.world.tick = Math.max(l.world.tick, A.tick);
        if (l.world.run && l.world.run.startTick === 0) l.world.run.startTick = l.world.tick;
      }
      if (!want && l.active) clearPairs(l);
      l.active = want;
    }
    for (const s of seams) {
      const l = this.links.get(s.to);
      if (l?.active) this.stepNeighbour(l, s);
    }
    this.mirror();
  }

  /** The neighbour's step: its proxy where the hero is, the life and mana its step gave him (leech, a kill's life) passed on */
  private stepNeighbour(l: Link, s: SeamDef): void {
    const N = l.world;
    this.syncProxy(N, s);
    const p = N.player;
    const hp0 = p.hp;
    const mana0 = p.mana;
    N.step(1);
    this.passOn(N, hp0, mana0);
    for (const e of N.events.drain()) {
      if (e.t === 'playerDeath' || e.t === 'runComplete' || e.t === 'zoneEnter' || e.t === 'interact') continue;
      this.host.neighbourEvent(e, l);
      this.out.push(shiftEvent(e, s.at.x, s.at.y));
    }
  }

  /** The proxy of the hero in a neighbour: his state (shared stats and buffs), his place in its coordinates */
  private syncProxy(N: World, s: SeamDef): void {
    const hero = this.current!.player;
    const p = N.player;
    Object.assign(p, hero);
    p.x = hero.x - s.at.x;
    p.y = hero.y - s.at.y;
    p.px = hero.px - s.at.x;
    p.py = hero.py - s.at.y;
    p.goal = null;
    p.cast = null;
    N.viewReach = this.current!.viewReach;
    N.autoCfg = this.current!.autoCfg;
  }

  /** What a neighbour's step gave the proxy (life and mana: leech, life after a kill) goes to the hero */
  private passOn(N: World, hp0: number, mana0: number): void {
    const hero = this.current!.player;
    const p = N.player;
    if (hero.dead) return;
    if (p.hp > hp0) hero.hp = Math.min(hero.hpMax, hero.hp + (p.hp - hp0));
    if (p.mana > mana0) hero.mana = Math.min(hero.manaMax, hero.mana + (p.mana - mana0));
  }

  /** What the zone did to the copies of a neighbour's monsters this tick goes to the originals (life, chill, curses, aggro…) */
  private writeBack(l: Link): void {
    for (const { m, o } of l.mon.values()) {
      if (o.dead) continue;
      const mm = m as unknown as Record<string, unknown>;
      const oo = o as unknown as Record<string, unknown>;
      for (const k in mm) {
        if (OWN.has(k)) continue;
        if (mm[k] !== oo[k]) oo[k] = mm[k];
      }
    }
  }

  /** The link that shows the entity `id` in the zone the hero is in */
  private linkOf(id: number, kind: 'mon' | 'items' | 'objs'): Link | null {
    for (const l of this.links.values()) if (l.active && l[kind].has(id)) return l;
    return null;
  }

  /** A neighbour's blow at the proxy lands on the hero, its copy as the source (its hit chance, its mods, the hero's thorns) */
  private forwardHurt(N: World, src: Monster | null, pk: DamagePacket): number {
    const A = this.current;
    if (!A || A === N) return 0;
    const l = this.links.get(N.zone.id);
    const m = src ? (l?.mon.get(src.id)?.m ?? null) : null;
    return A.hurtPlayerPacket(m, pk);
  }

  /** A copy killed in the zone the hero is in: the original dies in its own zone (experience, loot, quests there) */
  private killMirror(m: Monster): void {
    const l = this.linkOf(m.id, 'mon');
    const o = l?.mon.get(m.id)?.o;
    if (!l || !o || o.dead) return;
    const N = l.world;
    const s = this.seamsOf(this.current!).find((x) => x.to === l.id);
    if (s) this.syncProxy(N, s);
    const p = N.player;
    const hp0 = p.hp;
    const mana0 = p.mana;
    // the blow's last state (its life at 0, the killer's marks) first
    this.writeBack(l);
    o.dead = false;
    N.killMonster(o, p);
    this.passOn(N, hp0, mana0);
  }

  /** A copied item picked up in the zone the hero is in: taken out of its own zone */
  private pickedMirror(gi: GroundItem): void {
    const l = this.linkOf(gi.id, 'items');
    const o = l?.items.get(gi.id)?.o;
    if (!l || !o) return;
    const i = l.world.items.indexOf(o);
    if (i >= 0) l.world.items.splice(i, 1);
    l.items.delete(gi.id);
  }

  /** The active neighbours' entities near their seam mirrored in the zone the hero is in (the copies of the last step replaced) */
  private mirror(): void {
    const A = this.current!;
    const seams = this.seamsOf(A);
    stripMirrors(A);
    const links: World['seamLinks'] = [];
    for (const s of seams) {
      const l = this.links.get(s.to);
      if (!l) continue;
      links.push({ world: l.world, seam: s, active: l.active });
      if (!l.active) continue;
      const N = l.world;
      const [x0, y0, x1, y1] = s.view;
      const inside = (x: number, y: number, k = MIRROR_MARGIN) => x >= x0 - k && x <= x1 + k && y >= y0 - k && y <= y1 + k;
      const ax = s.at.x;
      const ay = s.at.y;
      const backTo = `zone:${A.zone.id}`;
      mirrorList(
        l.mon,
        N.monsters,
        A.monsters,
        (o) => !o.pet && inside(o.x, o.y),
        (m, o) => {
          m.x = o.x + ax;
          m.y = o.y + ay;
          m.px = o.px + ax;
          m.py = o.py + ay;
        },
      );
      mirrorList(
        l.items,
        N.items,
        A.items,
        (o) => inside(o.x, o.y),
        (m, o) => {
          m.x = o.x + ax;
          m.y = o.y + ay;
        },
      );
      mirrorList(
        l.objs,
        N.objects,
        A.objects,
        (o) => o.ref !== backTo && inside(o.x, o.y),
        (m, o) => {
          m.x = o.x + ax;
          m.y = o.y + ay;
        },
      );
      mirrorList(
        l.mis,
        N.missiles,
        A.missiles,
        (o) => !o.dead && inside(o.x, o.y, MIRROR_MARGIN * 3),
        (m, o) => {
          m.x = o.x + ax;
          m.y = o.y + ay;
          m.px = o.px + ax;
          m.py = o.py + ay;
          m.tx = o.tx + ax;
          m.ty = o.ty + ay;
        },
      );
      mirrorList(
        l.areas,
        N.areas,
        A.areas,
        (o) => !o.dead && inside(o.x, o.y, MIRROR_MARGIN * 3),
        (m, o) => {
          m.x = o.x + ax;
          m.y = o.y + ay;
          m.x2 = o.x2 + ax;
          m.y2 = o.y2 + ay;
        },
      );
    }
    A.seamLinks = links;
  }

  /**
   * The hero walks into the neighbour at seam `s` (of the zone he is in): the neighbour becomes the zone (the hero, his companions and
   * his walk moved in, their identifiers kept), the zone a neighbour (its monsters stay, simulated while he is near). The new zone's
   * world, or null if the neighbour cannot be built (the hero stays)
   */
  cross(s: SeamDef): World | null {
    const A = this.host.world;
    if (A !== this.current) this.adopt(A);
    const l = this.build(s.to);
    if (!l) return null;
    const B = l.world;
    const dx = -s.at.x;
    const dy = -s.at.y;
    // the last step's copies are the originals' state (written back before the neighbour's step): taken out of the zone
    stripMirrors(A);
    for (const k of this.links.values()) clearPairs(k);
    B.tick = Math.max(B.tick, A.tick);
    moveHero(A, B, dx, dy);
    movePets(A, B, dx, dy);
    syncMercAuras(B);
    B.refreshPlayer();
    B.proxy = false;
    A.proxy = true;
    // the debug and test switch follows the hero
    B.godMode = A.godMode;
    A.seamLinks = [];
    for (const k of this.links.values()) k.active = false;
    this.current = B;
    this.links.get(A.zone.id)!.used = A.tick;
    l.used = B.tick;
    // the zone left is simulated at once (the hero stands at its edge) and shown beyond the seam from the first image
    const back = this.seamsOf(B).find((x) => x.to === A.zone.id);
    const la = this.links.get(A.zone.id);
    if (back && la) {
      la.active = true;
      this.syncProxy(A, back);
    }
    this.mirror();
    this.evict();
    return B;
  }

  /**
   * Idle-time preparation (the application, between images): the nearest neighbour within `SEAM_IDLE` of the hero not built yet is built
   * a few steps at a time (its zone laid out on its map, its objects, its world): one step, then more while `more()` says so (the
   * application's time budget: the simulation reads no clock), the next call going on. True if something was done
   */
  prepareStep(more: () => boolean = () => false): boolean {
    const A = this.host.world;
    if (A !== this.current) return false;
    const seams = this.seamsOf(A);
    if (!this.pending) {
      let best: SeamDef | null = null;
      let bd = SEAM_IDLE;
      for (const s of seams) {
        if (this.links.has(s.to)) continue;
        const d = rectDist(A.player.x, A.player.y, s.cross);
        if (d <= bd) {
          bd = d;
          best = s;
        }
      }
      if (!best) return false;
      // lot 316: a zone kept for the session needs no build
      const kept = this.host.keptSeamWorld?.(best.to);
      if (kept) {
        this.finish(best.to, kept, true);
        return true;
      }
      const base = this.allocBase();
      this.pending = { id: best.to, steps: this.host.seamWorldSteps(best.to, base) };
      this.pendingBase = base;
    }
    const p = this.pending;
    for (;;) {
      const r = p.steps.next();
      if (r.done) {
        this.pending = null;
        this.pendingBase = -1;
        if (r.value && !this.links.has(p.id)) this.finish(p.id, r.value);
        return true;
      }
      if (!more()) return true;
    }
  }

  /** A neighbour within `SEAM_IDLE` of the hero is still to be built (the application asks for idle time) */
  wantsPrepare(): boolean {
    const A = this.host.world;
    if (A !== this.current) return false;
    if (this.pending) return true;
    return this.seamsOf(A).some((s) => !this.links.has(s.to) && rectDist(A.player.x, A.player.y, s.cross) <= SEAM_IDLE);
  }
}

/** The copies of the neighbours' entities taken out of a world */
export function stripMirrors(w: World): void {
  if (w.monsters.some((m) => m.mirror)) w.monsters = w.monsters.filter((m) => !m.mirror);
  if (w.items.some((g) => g.mirror)) w.items = w.items.filter((g) => !g.mirror);
  if (w.objects.some((o) => o.mirror)) w.objects = w.objects.filter((o) => !o.mirror);
  if (w.missiles.some((m) => m.mirror)) w.missiles = w.missiles.filter((m) => !m.mirror);
  if (w.areas.some((a) => a.mirror)) w.areas = w.areas.filter((a) => !a.mirror);
}

function clearPairs(l: Link): void {
  l.mon.clear();
  l.items.clear();
  l.objs.clear();
  l.mis.clear();
  l.areas.clear();
}

/** Copies (`mirror`) of the entities of `from` that `keep` selects, appended to `to`, kept from step to step by identifier */
function mirrorList<T extends { id: number; mirror?: true }>(pairs: Map<number, Pair<T>>, from: readonly T[], to: T[], keep: (o: T) => boolean, place: (m: T, o: T) => void): void {
  const seen = new Set<number>();
  for (const o of from) {
    if (o.mirror || !keep(o)) continue;
    let p = pairs.get(o.id);
    if (!p || p.o !== o) {
      p = { m: { ...o }, o };
      pairs.set(o.id, p);
    } else Object.assign(p.m, o);
    p.m.mirror = true;
    place(p.m, o);
    seen.add(o.id);
    to.push(p.m);
  }
  for (const id of pairs.keys()) if (!seen.has(id)) pairs.delete(id);
}

/** The hero's state into the zone he walks into: the same, at the same place in its coordinates (identifier kept: the renderer's view) */
function moveHero(A: World, B: World, dx: number, dy: number): void {
  const h = A.player;
  const p = B.player;
  Object.assign(p, h);
  p.x = h.x + dx;
  p.y = h.y + dy;
  p.px = h.px + dx;
  p.py = h.py + dy;
  p.goal = h.goal ? { ...h.goal, x: h.goal.x + dx, y: h.goal.y + dy } : null;
  p.cast = h.cast ? { ...h.cast, tx: h.cast.tx + dx, ty: h.cast.ty + dy } : null;
  p.buffs = h.buffs.map((b) => ({ ...b }));
  // the walk goes on: the joystick, the keys and a held click write into the new zone's input from the next image
  const ia = A.input;
  Object.assign(B.input, ia, { cast: ia.cast ? { ...ia.cast, tx: ia.cast.tx + dx, ty: ia.cast.ty + dy } : null, throwAt: null, pickup: null, interact: null });
  A.input.moveX = 0;
  A.input.moveY = 0;
  A.input.cast = null;
}

/** The mercenary and the summons follow the hero (their identifiers kept), at the same place in the new zone's coordinates */
function movePets(A: World, B: World, dx: number, dy: number): void {
  const pets = A.monsters.filter((m) => m.pet);
  if (!pets.length) return;
  A.monsters = A.monsters.filter((m) => !m.pet);
  B.monsters = B.monsters.filter((m) => !m.pet);
  for (const m of pets) {
    m.x += dx;
    m.y += dy;
    m.px += dx;
    m.py += dy;
    m.spawnX += dx;
    m.spawnY += dy;
    m.wanderX += dx;
    m.wanderY += dy;
    if (m.atkTarget) m.atkTarget = { x: m.atkTarget.x + dx, y: m.atkTarget.y + dy };
    m.tgt = 0;
    if (B.grid.circleBlocked(m.x, m.y, Math.min(m.radius, 0.3))) {
      const f = B.grid.nearestFree(m.x, m.y, 4) ?? { x: B.player.x, y: B.player.y };
      m.x = m.px = f.x;
      m.y = m.py = f.y;
    }
    B.monsters.push(m);
  }
}
