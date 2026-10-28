/** Aide à la construction de cartes « à la main » sous forme de données. */
import type { Rng } from '../../core/rng';
import type { ExitDef, GroundKind, GroundPatch, LightDef, ObjectDef, PropPlacement, SpawnDef, WallDef, ZoneDef } from '../zone-types';

export class ZoneBuilder {
  readonly z: ZoneDef;

  constructor(id: string, name: string, width: number, height: number, ground: GroundKind, opts: { theme: string; mood: string; ambient: { color: number; level: number }; town?: boolean }) {
    this.z = {
      id,
      name,
      width,
      height,
      ground,
      ambient: opts.ambient,
      patches: [],
      walls: [],
      props: [],
      blockers: [],
      spawns: [],
      lights: [],
      exits: [],
      objects: [],
      start: { x: width / 2, y: height / 2 },
      town: opts.town,
      theme: opts.theme,
      mood: opts.mood,
    };
  }

  start(x: number, y: number): this {
    this.z.start = { x, y };
    return this;
  }

  patch(p: GroundPatch): this {
    this.z.patches.push(p);
    return this;
  }

  rect(kind: GroundKind, x0: number, y0: number, x1: number, y1: number): this {
    return this.patch({ kind, rect: [x0, y0, x1, y1] });
  }

  circle(kind: GroundKind, x: number, y: number, r: number): this {
    return this.patch({ kind, circle: [x, y, r] });
  }

  path(kind: GroundKind, width: number, ...points: [number, number][]): this {
    return this.patch({ kind, path: { points, width } });
  }

  prop(prop: string, x: number, y: number, scale?: number): this {
    const p: PropPlacement = { prop, x, y };
    if (scale && scale !== 1) p.scale = scale;
    this.z.props.push(p);
    return this;
  }

  wall(x0: number, y0: number, x1: number, y1: number, style = 'stone', thick = 1): this {
    const w: WallDef = { x0, y0, x1, y1, style, thick };
    this.z.walls.push(w);
    return this;
  }

  /** Salle rectangulaire fermée, avec ouvertures (portes) données par [côté, position, largeur] */
  room(x0: number, y0: number, x1: number, y1: number, doors: ['n' | 's' | 'e' | 'w', number, number][] = [], style = 'stone'): this {
    const sides: Record<string, [number, number, number, number]> = {
      n: [x0, y0, x1, y0],
      s: [x0, y1, x1, y1],
      w: [x0, y0, x0, y1],
      e: [x1, y0, x1, y1],
    };
    for (const [side, [ax, ay, bx, by]] of Object.entries(sides)) {
      const horizontal = ay === by;
      const ds = doors
        .filter((d) => d[0] === side)
        .map((d) => [d[1] - d[2] / 2, d[1] + d[2] / 2] as [number, number])
        .sort((a, b) => a[0] - b[0]);
      let cur = horizontal ? ax : ay;
      const end = horizontal ? bx : by;
      for (const [d0, d1] of ds) {
        if (d0 > cur) {
          if (horizontal) this.wall(cur, ay, d0, ay, style);
          else this.wall(ax, cur, ax, d0, style);
        }
        cur = Math.max(cur, d1);
      }
      if (cur < end) {
        if (horizontal) this.wall(cur, ay, end, ay, style);
        else this.wall(ax, cur, ax, end, style);
      }
    }
    return this;
  }

  /**
   * Mur en segments de décor de 4 unités (`<base>_a` le long de x, `<base>_b` le long de y)
   * entre deux points alignés, avec des ouvertures [début, fin] le long du mur.
   */
  wallRun(base: string | (() => string), x0: number, y0: number, x1: number, y1: number, gaps: [number, number][] = []): this {
    const pick = typeof base === 'string' ? () => base : base;
    const horizontal = y0 === y1;
    const a = horizontal ? Math.min(x0, x1) : Math.min(y0, y1);
    const len = Math.abs(horizontal ? x1 - x0 : y1 - y0);
    for (let k = 0; k < Math.round(len / 4); k++) {
      const c = a + 2 + 4 * k;
      if (gaps.some(([g0, g1]) => c > g0 && c < g1)) continue;
      if (horizontal) this.prop(`${pick()}_a`, c, y0);
      else this.prop(`${pick()}_b`, x0, c);
    }
    return this;
  }

  /** Herse : obstacle + objet visible, ouverts ensemble par la run (World.openGate) */
  gate(id: string, x0: number, y0: number, x1: number, y1: number): this {
    this.z.blockers.push({ rect: [x0, y0, x1, y1], opaque: false, gate: id });
    this.z.objects.push({ kind: 'gate', x: (x0 + x1) / 2, y: (y0 + y1) / 2, id });
    return this;
  }

  block(x0: number, y0: number, x1: number, y1: number, opaque = true): this {
    this.z.blockers.push({ rect: [x0, y0, x1, y1], opaque });
    return this;
  }

  spawn(s: SpawnDef): this {
    this.z.spawns.push(s);
    return this;
  }

  pack(monster: string, x: number, y: number, count: number, r = 2.5, extra: Partial<SpawnDef> = {}): this {
    return this.spawn({ monster, x, y, count, r, trigger: 11, ...extra });
  }

  light(l: LightDef): this {
    this.z.lights.push(l);
    return this;
  }

  exit(e: ExitDef): this {
    this.z.exits.push(e);
    return this;
  }

  object(o: ObjectDef): this {
    this.z.objects.push(o);
    return this;
  }

  /** Bordure infranchissable (forêt, falaise) décorée de props */
  border(rng: Rng, props: string[], margin = 3, spacing = 3.2): this {
    const { width: W, height: H } = this.z;
    this.block(0, 0, W, margin);
    this.block(0, H - margin, W, H);
    this.block(0, 0, margin, H);
    this.block(W - margin, 0, W, H);
    for (let t = 1; t < W; t += spacing) {
      this.prop(rng.pick(props), t + rng.float(-0.6, 0.6), margin - 0.8 + rng.float(-0.5, 0.5));
      this.prop(rng.pick(props), t + rng.float(-0.6, 0.6), H - margin + 0.8 + rng.float(-0.5, 0.5));
    }
    for (let t = margin + 2; t < H - margin; t += spacing) {
      this.prop(rng.pick(props), margin - 0.8 + rng.float(-0.5, 0.5), t + rng.float(-0.6, 0.6));
      this.prop(rng.pick(props), W - margin + 0.8 + rng.float(-0.5, 0.5), t + rng.float(-0.6, 0.6));
    }
    return this;
  }

  /** Semis de props décoratifs dans un rectangle, en évitant les zones réservées */
  scatter(rng: Rng, props: string[], n: number, x0: number, y0: number, x1: number, y1: number, avoid: [number, number, number][] = []): this {
    let placed = 0;
    let tries = 0;
    while (placed < n && tries < n * 30) {
      tries++;
      const x = rng.float(x0, x1);
      const y = rng.float(y0, y1);
      if (avoid.some(([ax, ay, ar]) => (x - ax) ** 2 + (y - ay) ** 2 < ar * ar)) continue;
      if (this.z.props.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < 4)) continue;
      this.prop(rng.pick(props), x, y);
      placed++;
    }
    return this;
  }

  build(): ZoneDef {
    return this.z;
  }
}
