/**
 * Points of interest of a Run's zone (lot 307, owner: "points of interest on the map are missing to make me want to move: chests,
 * shrines, events…"). Placed with the arena (sim/arena.ts, `placePois`: away from the hero's start and from each other, on open ground
 * reachable from the start), found when the hero comes near (the automap shows them then, never before: no spoiler), used by walking over
 * them (the mode has no button):
 * - **shrines** (Diablo II's objects and effects, shrines.txt): 2 a zone (1 in a boss's lair), a run-only buff of `POI.shrineSec` seconds
 *   (Experience, Skill, Armor, Combat, a Resist shrine) or the Fire shrine's nova (shrines.txt 19, "Fire": the monsters around burn);
 * - a **chest**: a modest extra source (the mode's loot is rare): its gold, an item half of the time;
 * - a **cursed chest**: opened, a champion pack rises around it; the chest's loot (a rare item) falls when the pack is dead;
 * - a **champion lair** (bones and skulls of Diablo II on the ground): the hero coming near wakes its pack, told by a banner ("X
 *   approche…"); the pack killed leaves an elite chest;
 * - an **elite chest** after a champion pack of the director's timeline killed (`POI.packChest` of the time: "guaranteed-ish").
 * The Campaign keeps its rounds as they were (the director strips the objects placed: `stripPois`).
 */
import { Rng, type Item, type Monster, type World, type ZoneDef } from '../../../src/mods/sdk';
import type { ArenaBox } from './arena';

export type PoiKind = 'shrine' | 'chest' | 'cursed' | 'lair';

/** A point of interest placed with the arena */
export interface PoiSpot {
  kind: PoiKind;
  x: number;
  y: number;
  /** A shrine's effect (shrines.txt's id: `storm` is code 19, Diablo II's Fire shrine) */
  shrine?: string;
}

export const POI = {
  /** A zone's points of interest (a boss's lair: `boss`) */
  plan: ['shrine', 'shrine', 'chest', 'cursed', 'lair'] as readonly PoiKind[],
  boss: ['shrine', 'chest'] as readonly PoiKind[],
  /** Units from the hero's start at least (a share of the arena's side for a small one) */
  fromStart: 24,
  /** Units between two points at least */
  apart: 16,
  /** Units from the arena's edge at least */
  margin: 5,
  /** Units within which the hero finds a point (as the fog's reveal: sim/fog.ts) */
  find: 14,
  /** Units within which the hero uses a point by walking over it (the base's interaction is 1.6: the mode's wins) */
  use: 1.8,
  /** Units within which a champion lair wakes */
  wake: 11,
  /** A shrine's buff (seconds; Diablo II's 96 s shortened for zones of 90 to 180 s) */
  shrineSec: 40,
  /** The Fire shrine: units of its nova, share of an elite's life it burns (the ordinary monsters die) */
  fire: { r: 10, elite: 0.35 },
  /** Chance a champion pack of the timeline leaves an elite chest when its last member dies */
  packChest: 0.75,
  /** Champions of a cursed chest's or a lair's pack (more than the timeline's 2 to 3) */
  pack: [3, 4] as readonly [number, number],
  /** Chances of an item: a chest's, an elite chest's; the share of rare among them */
  item: { chest: 0.5, elite: 0.6, rare: 0.35 },
};

/** Shrines of a run (shrines.txt ids) and their weight; the four Resist shrines share one weight */
export const RUN_SHRINES: readonly (readonly [string, number])[] = [
  ['storm', 4],
  ['experience', 4],
  ['skill', 4],
  ['armor', 4],
  ['combat', 4],
  ['resist_fire', 1],
  ['resist_cold', 1],
  ['resist_light', 1],
  ['resist_poison', 1],
];

/** Names told when a shrine is used (Diablo II's shrines; the base's own names but the Fire shrine's) */
export const SHRINE_NAME: Record<string, string> = {
  storm: 'Sanctuaire de feu',
  experience: 'Sanctuaire d’expérience',
  skill: 'Sanctuaire de compétence',
  armor: 'Sanctuaire d’armure',
  combat: 'Sanctuaire de combat',
  resist_fire: 'Sanctuaire de résistance au feu',
  resist_cold: 'Sanctuaire de résistance au froid',
  resist_light: 'Sanctuaire de résistance à la foudre',
  resist_poison: 'Sanctuaire de résistance au poison',
};

/** Reference of a placed point's world object (`WorldObject.ref`) */
export const POI_REF = 'svpoi:';

/**
 * The arena's points of interest: `plan`'s kinds placed at random on `open` ground (a disc of 1.5 units), `POI.margin` from the edge,
 * `POI.fromStart` from the start and `POI.apart` from each other (both shortened for a small arena); a kind with no room left is skipped
 */
export function placePois(rng: Rng, box: ArenaBox, start: { x: number; y: number }, open: (x: number, y: number) => boolean, plan: readonly PoiKind[]): PoiSpot[] {
  const side = Math.min(box.x1 - box.x0, box.y1 - box.y0);
  const fromStart = Math.min(POI.fromStart, side * 0.3);
  const apart = Math.min(POI.apart, side * 0.22);
  const m = Math.min(POI.margin, side * 0.1);
  const out: PoiSpot[] = [];
  const used = new Set<string>();
  const clear = (x: number, y: number) => open(x, y) && open(x - 1, y) && open(x + 1, y) && open(x, y - 1) && open(x, y + 1);
  for (const kind of plan) {
    for (let tries = 0; tries < 400; tries++) {
      const x = rng.float(box.x0 + m, box.x1 - m);
      const y = rng.float(box.y0 + m, box.y1 - m);
      if (Math.hypot(x - start.x, y - start.y) < fromStart) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.y - y) < apart)) continue;
      if (!clear(x, y)) continue;
      const spot: PoiSpot = { kind, x, y };
      if (kind === 'shrine') spot.shrine = pickShrine(rng, used);
      out.push(spot);
      break;
    }
  }
  return out;
}

/** A run's shrine by weight, never twice in a zone */
function pickShrine(rng: Rng, used: Set<string>): string {
  const pool = RUN_SHRINES.filter(([id]) => !used.has(id));
  let r = rng.float(
    0,
    pool.reduce((a, [, w]) => a + w, 0),
  );
  for (const [id, w] of pool) {
    r -= w;
    if (r < 0) {
      used.add(id);
      return id;
    }
  }
  used.add(pool[0][0]);
  return pool[0][0];
}

const SPOTS = new WeakMap<ZoneDef, PoiSpot[]>();

/** The points placed in an arena zone: its objects (a shrine, a chest) and, for a lair, its bones and skulls on the ground */
export function addPois(zone: ZoneDef, spots: PoiSpot[]): void {
  SPOTS.set(zone, spots);
  spots.forEach((s, i) => {
    if (s.kind === 'shrine') zone.objects.push({ kind: 'shrine', x: s.x, y: s.y, id: `${POI_REF}${i}`, variant: s.shrine });
    else if (s.kind === 'chest' || s.kind === 'cursed') zone.objects.push({ kind: 'chest', x: s.x, y: s.y, id: `${POI_REF}${i}`, ...(s.kind === 'cursed' ? { variant: 'cursed' } : {}) });
    else
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.4;
        zone.props.push({ prop: k % 2 ? 'skull' : 'bones', x: s.x + Math.cos(a) * 1.6, y: s.y + Math.sin(a) * 1.6 });
      }
  });
}

/** The points placed in a zone (none for a zone not built by the mode) */
export function spotsOf(zone: ZoneDef): readonly PoiSpot[] {
  return SPOTS.get(zone) ?? [];
}

/** A point of interest in play */
export interface PoiLive {
  kind: PoiKind | 'elite';
  x: number;
  y: number;
  shrine?: string;
  /** Its world object (a shrine, a chest), absent for a lair */
  obj?: number;
  /** Found by the hero (shown on the automap) */
  found: boolean;
  /** Used (a shrine taken, a chest opened, a lair woken) */
  used: boolean;
}

/** A pack whose death gives something: the timeline's champions (an elite chest at times), a cursed chest's or a lair's (their loot) */
interface Pack {
  ids: number[];
  why: 'champions' | 'cursed' | 'lair';
  x: number;
  y: number;
}

/** What the points need from the director: a champion pack at a point (identifiers), the seconds of the zone */
export interface PoiHost {
  packAt(w: World, at: { x: number; y: number }, count: number): number[];
  /** An item of a chest (sim/loot.ts `chestItem`), gold paid at once (sim/economy.ts `chestGold`) */
  item(w: World, quality: 'magic' | 'rare'): Item | null;
  gold(w: World, kind: 'unique' | 'miniboss'): number;
  announce(w: World, text: string): void;
}

export class Pois {
  readonly list: PoiLive[] = [];
  private packs: Pack[] = [];
  private readonly rng: Rng;

  constructor(
    w: World,
    private readonly host: PoiHost,
  ) {
    this.rng = new Rng(`survivals:poi:${w.zone.id}:${w.seed}`);
    spotsOf(w.zone).forEach((s, i) => {
      const o = w.objects.find((x) => x.ref === `${POI_REF}${i}`);
      if (o) o.label = s.kind === 'shrine' ? (SHRINE_NAME[s.shrine ?? ''] ?? o.label) : s.kind === 'cursed' ? 'Coffre maudit' : 'Coffre';
      this.list.push({ kind: s.kind, x: s.x, y: s.y, shrine: s.shrine, obj: o?.id, found: false, used: false });
    });
  }

  /** Every step: points found and used by the hero, packs killed */
  tick(w: World): void {
    const p = w.player;
    if (p.dead) return;
    for (const poi of this.list) {
      if (poi.used) continue;
      const d = Math.hypot(poi.x - p.x, poi.y - p.y);
      if (!poi.found && d <= POI.find) poi.found = true;
      if (poi.kind === 'lair' ? d <= POI.wake : d <= POI.use) this.use(w, poi);
    }
    if (w.tick % 5 === 0 && this.packs.length) this.packsDead(w);
  }

  /** A champion pack of the director's timeline: an elite chest at times when its last member dies */
  watchPack(ids: number[], x: number, y: number): void {
    if (ids.length) this.packs.push({ ids, why: 'champions', x, y });
  }

  /** Points found and not used yet (the automap's markers) */
  shown(): PoiLive[] {
    return this.list.filter((p) => p.found && !p.used);
  }

  private use(w: World, poi: PoiLive): void {
    const o = poi.obj !== undefined ? w.objects.find((x) => x.id === poi.obj) : undefined;
    // used already by a tap (the base's interaction): taken as used
    if (o?.used) {
      poi.used = true;
      return;
    }
    poi.used = true;
    poi.found = true;
    if (o) o.used = true;
    switch (poi.kind) {
      case 'shrine':
        useShrine(w, poi.shrine ?? 'armor', poi.x, poi.y);
        return;
      case 'chest':
        this.loot(w, poi.x, poi.y, POI.item.chest, 'unique', 'Coffre');
        return;
      case 'elite':
        this.loot(w, poi.x, poi.y, POI.item.elite, 'unique', 'Coffre d’élite');
        return;
      case 'cursed': {
        const ids = this.host.packAt(w, { x: poi.x, y: poi.y }, POI.pack[0] + this.rng.int(POI.pack[1] - POI.pack[0] + 1));
        this.host.announce(w, 'Coffre maudit : des champions surgissent !');
        w.events.push({ t: 'impact', kind: 'open_chest', x: poi.x, y: poi.y, radius: 0.8, elem: 'phys' });
        if (ids.length) this.packs.push({ ids, why: 'cursed', x: poi.x, y: poi.y });
        else this.loot(w, poi.x, poi.y, 1, 'miniboss', 'Coffre maudit', true);
        return;
      }
      case 'lair': {
        const ids = this.host.packAt(w, { x: poi.x, y: poi.y }, POI.pack[0] + this.rng.int(POI.pack[1] - POI.pack[0] + 1));
        const leader = w.monsters.find((m) => m.id === ids[0]);
        this.host.announce(w, leader ? `${leader.name} approche…` : 'Des champions approchent !');
        if (ids.length) this.packs.push({ ids, why: 'lair', x: poi.x, y: poi.y });
        return;
      }
    }
  }

  /** Packs whose members are all dead: their reward */
  private packsDead(w: World): void {
    const alive = new Set<number>();
    for (const m of w.monsters) if (!m.dead) alive.add(m.id);
    this.packs = this.packs.filter((pk) => {
      if (pk.ids.some((id) => alive.has(id))) {
        // the place the pack fights at: its leader's, then any member's (the chest falls where the last one died)
        const m = w.monsters.find((x) => !x.dead && pk.ids.includes(x.id));
        if (m) [pk.x, pk.y] = [m.x, m.y];
        return true;
      }
      if (pk.why === 'cursed') this.loot(w, pk.x, pk.y, 1, 'miniboss', 'Coffre maudit', true);
      else if (pk.why === 'lair' || this.rng.chance(POI.packChest)) this.dropChest(w, pk.x, pk.y);
      return false;
    });
  }

  /** An elite chest left where a pack died (opened by walking over it) */
  private dropChest(w: World, x: number, y: number): void {
    const o = { id: w.newId(), kind: 'chest', x, y, radius: 0.8, used: false, ref: `${POI_REF}elite`, label: 'Coffre d’élite' };
    w.objects.push(o);
    // found at once: it falls in sight
    this.list.push({ kind: 'elite', x, y, obj: o.id, found: true, used: false });
  }

  /** A chest's loot: `chance` of an item (rare `POI.item.rare` of the time, always for `rare`), its gold told */
  private loot(w: World, x: number, y: number, chance: number, gold: 'unique' | 'miniboss', name: string, rare = false): void {
    if (this.rng.chance(chance)) {
      const it = this.host.item(w, rare || this.rng.chance(POI.item.rare) ? 'rare' : 'magic');
      if (it) w.dropItem(it, x, y, 1.2);
    }
    const n = this.host.gold(w, gold);
    w.events.push({ t: 'impact', kind: 'open_chest', x, y, radius: 0.8, elem: 'phys' });
    w.events.push({ t: 'message', text: n > 0 ? `${name} : +${n} or` : name, color: '#e8b04a' });
  }
}

/** A run's shrine used at (x, y): its buff (the base's shrine stats, `shrine_<id>`) or the Fire shrine's nova; told by its name */
export function useShrine(w: World, id: string, x: number, y: number): void {
  const p = w.player;
  if (id === 'storm') {
    // Diablo II's Fire shrine (shrines.txt 19): a ring of fire; the mode's own: the hero is spared, the ordinary monsters around burn
    const hit: Monster[] = w.monsters.filter((m) => !m.dead && m.team === 1 && !m.pet && !m.isSummon && Math.hypot(m.x - x, m.y - y) <= POI.fire.r);
    for (const m of hit) {
      if (m.rank === 'normal' || m.rank === 'minion') w.killMonster(m, p);
      else if (!m.runBoss) m.hp = Math.max(1, m.hp - m.hpMax * POI.fire.elite);
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      w.events.push({ t: 'impact', kind: 'fireball', x: x + Math.cos(a) * 5, y: y + Math.sin(a) * 5, radius: 1.6, elem: 'fire' });
    }
  } else {
    const buff = `shrine_${id}`;
    p.buffs = p.buffs.filter((b) => b.id !== buff);
    p.buffs.push({ id: buff, level: 1, until: w.tick + Math.round(POI.shrineSec * 25) });
    w.refreshPlayer();
  }
  w.events.push({ t: 'shrine', kind: id, x, y });
  w.events.push({ t: 'mapEvent', text: SHRINE_NAME[id] ?? id });
}

/** The Campaign's rounds without the points placed (their objects taken out of the world; the arena is the same) */
export function stripPois(w: World): void {
  w.objects = w.objects.filter((o) => !o.ref?.startsWith(POI_REF));
}
