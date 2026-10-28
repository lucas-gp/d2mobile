/**
 * Lot 312 — the zones joined edge to edge drawn as one (owner: "move between zones directly as if it were a single zone as in the real game",
 * src/sim/seam-worlds.ts): the neighbours' maps dressed like the zone's own (their decor and its lights, their zone's props and lights,
 * beyond the edge), their ground in a fixed order (the overlap never switches maps), and the crossing done on the scene as it is
 * (`seamSwapImpl`): everything anchored in the scene moved into the new zone's coordinates, the neighbour's map made the zone's (the rest
 * of it loaded behind the play), the zone's made a neighbour's; the actors, items, objects and missiles keep their views (the simulation
 * keeps their identifiers on both sides). Functions of `GameRenderer` (`this`), as the other `renderer-*` modules.
 */
import { Sprite, Texture } from 'pixi.js';
import type { World } from '../sim/world';
import type { SeamDef, ZoneDef } from '../data/zone-types';
import { PROP_BY_ID, propRect } from '../data/props';
import { d2Map } from '../data/d2map';
import { PROP_FLAME } from './fx';
import { depthKey, isoX, isoY } from './iso';
import { D2MapView } from './d2map';
import { PRIO } from '../platform/d2local-core';
import type { GameRenderer } from './renderer';

/** Order of the D2 maps' ground (the first map seen on top): where two maps overlap at a seam, the same map's ground on both sides */
const RANK = new Map<string, number>();
export function groundRank(id: string): number {
  let r = RANK.get(id);
  if (r === undefined) {
    r = RANK.size;
    RANK.set(id, r);
  }
  return -r;
}

/** What is placed of a map's dressing (its decor, its zone's props, its zone's lights), by index: the rest added when it is seen whole */
export interface Dressing {
  decor: Set<number>;
  props: Set<number>;
  lights: Set<number>;
}

const inRect = (r: readonly number[] | undefined, x: number, y: number, m: number) => !r || (x >= r[0] - m && y >= r[1] - m && x <= r[2] + m && y <= r[3] + m);

/**
 * A zone's props (the game's models, where a D2 sheet exists on a D2 map) and its lights, at `off` (the map's origin in the zone drawn),
 * within `limit` (the zone's own coordinates) when given; tagged with the zone's map so that a crossing moves or drops them
 */
export function dressZoneImpl(this: GameRenderer, z: ZoneDef, off: { x: number; y: number }, limit?: readonly [number, number, number, number]): void {
  const map = z.d2Map?.id ?? z.id;
  let d = this.dressings.get(map);
  if (!d) {
    d = { decor: new Set(), props: new Set(), lights: new Set() };
    this.dressings.set(map, d);
  }
  const onD2 = !!this.mapView || !!z.d2Map;
  for (let i = 0; i < z.props.length; i++) {
    const pl0 = z.props[i];
    if (d.props.has(i) || !inRect(limit, pl0.x, pl0.y, 8)) continue;
    const def = PROP_BY_ID[pl0.prop];
    if (!def || (onD2 && !this.bank.isImported(`prop_${pl0.prop}`))) {
      d.props.add(i);
      continue;
    }
    const pl = { ...pl0, x: pl0.x + off.x, y: pl0.y + off.y };
    const sheet = this.bank.get(`prop_${pl.prop}.${z.id}`) ?? this.bank.get(`prop_${pl.prop}`);
    const ft = sheet?.frames.get('idle/0/0');
    // (its sheet not loaded yet: tried again at the next dressing)
    if (!sheet || !ft) continue;
    d.props.add(i);
    const s = new Sprite(ft.tex);
    s.anchor.set(ft.ax / ft.tex.width, ft.ay / ft.tex.height);
    s.position.set(isoX(pl.x, pl.y), isoY(pl.x, pl.y));
    s.scale.set((pl.scale ?? 1) / sheet.scale);
    const rect = propRect(def, pl.x, pl.y, pl.scale ?? 1);
    const key = def.occluder || Math.max(def.w, def.h) > 2.5 ? depthKey(rect[2], rect[3]) - 2 : depthKey(pl.x, pl.y);
    s.zIndex = key;
    this.entityLayer.addChild(s);
    let shadow: Sprite | undefined;
    const sft = sheet.shadows.get('idle/0/0');
    if (sft) {
      shadow = new Sprite(sft.tex);
      shadow.anchor.set(sft.ax / sft.tex.width, sft.ay / sft.tex.height);
      shadow.position.copyFrom(s.position);
      shadow.scale.set((pl.scale ?? 1) / sheet.shadowScale);
      this.shadowLayer.addChild(shadow);
    }
    const flame = PROP_FLAME[pl.prop];
    if (flame && this.fx.has(flame.id)) this.fx.spawn(flame.id, pl.x, pl.y, { loop: true, z: flame.z, scale: flame.scale * (pl.scale ?? 1), delay: this.rng.float(0, 0.6), alpha: 0.9 });
    this.propViews.push({
      s,
      shadow,
      rect,
      occluder: !!def.occluder,
      key,
      alpha: 1,
      light: def.light ? { x: pl.x, y: pl.y, radius: def.light.radius, color: def.light.color, intensity: def.light.intensity, flicker: def.light.flicker } : undefined,
      map,
    });
  }
  for (let i = 0; i < z.lights.length; i++) {
    const l = z.lights[i];
    if (d.lights.has(i) || !inRect(limit, l.x, l.y, l.radius + 4)) continue;
    d.lights.add(i);
    this.propViews.push({
      s: new Sprite(Texture.EMPTY),
      rect: [0, 0, 0, 0],
      occluder: false,
      key: 0,
      alpha: 1,
      light: { x: l.x + off.x, y: l.y + off.y, radius: l.radius, color: l.color, intensity: l.intensity, flicker: l.flicker ?? 0 },
      map,
    });
  }
}

/** A map's decor (torches, fires… and their light), at `off`, within `limit` (the map's coordinates) when given */
export function dressDecorImpl(this: GameRenderer, mapId: string, off: { x: number; y: number }, limit?: readonly [number, number, number, number]): void {
  const dm = d2Map(mapId);
  if (!dm) return;
  let d = this.dressings.get(mapId);
  if (!d) {
    d = { decor: new Set(), props: new Set(), lights: new Set() };
    this.dressings.set(mapId, d);
  }
  this.buildDecor(dm.raw as { decor?: [string, number, number][] }, mapId, off, limit, d.decor);
}

/**
 * The neighbours' zones dressed once their worlds exist (the simulation builds them ahead, `World.seamLinks`): their props and lights in
 * the part of their map drawn. Called about once a second
 */
export function dressNeighboursImpl(this: GameRenderer, w: World): void {
  if (!this.seamsOn) return;
  for (const l of w.seamLinks) {
    if (!this.neighbours.some((n) => n.id === l.seam.to)) continue;
    this.dressDecor(l.seam.to, l.seam.at, l.seam.view);
    this.dressZone(l.world.zone, l.seam.at, l.seam.view);
  }
  // the zone's own (its sheets arrived since)
  const own = w.zone.d2Map?.id;
  if (own && this.mapView) {
    this.dressDecor(own, { x: 0, y: 0 });
    this.dressZone(w.zone, { x: 0, y: 0 });
  }
}

/** A neighbour's map drawn beyond the edge: loaded in the background (its part near the seam), under or over the zone's by `groundRank` */
export function showNeighbourImpl(this: GameRenderer, s: SeamDef, low: boolean, chunked = false): D2MapView | null {
  const nm = d2Map(s.to);
  if (!nm) return null;
  const v = new D2MapView((p) => this.bank.d2Read(p));
  v.ground.zIndex = groundRank(s.to);
  // its ground in the scene at once (its own container, under or over the zone's by its rank), its pieces appearing as they load (a few
  // an image when `chunked`: a neighbour started behind the play, after a crossing)
  void v.build(nm, low, this.groundLayer, this.entityLayer, s.hidden, s.view, undefined, s.at, chunked).then((ok) => {
    if (!ok || !this.neighbours.some((n) => n.view === v)) v.dispose();
  });
  v.cullStructures = true;
  this.neighbours.push({ id: s.to, view: v });
  this.dressDecor(s.to, s.at, s.view);
  return v;
}

/** Everything anchored in the scene moved by (dx, dy) world units (the zone's coordinates changed at a crossing); transient effects dropped */
function shiftScene(gr: GameRenderer, dx: number, dy: number): void {
  const ix = isoX(dx, dy);
  const iy = isoY(dx, dy);
  const kz = depthKey(dx, dy);
  gr.camX += dx;
  gr.camY += dy;
  for (const pv of gr.propViews) {
    if (pv.struct) continue;
    pv.s.position.set(pv.s.position.x + ix, pv.s.position.y + iy);
    pv.s.zIndex += kz;
    pv.key += kz;
    if (pv.shadow) pv.shadow.position.set(pv.shadow.position.x + ix, pv.shadow.position.y + iy);
    pv.rect = [pv.rect[0] + dx, pv.rect[1] + dy, pv.rect[2] + dx, pv.rect[3] + dy];
    if (pv.light) pv.light = { ...pv.light, x: pv.light.x + dx, y: pv.light.y + dy };
  }
  for (const v of gr.objectViews.values()) {
    v.s.position.set(v.s.position.x + ix, v.s.position.y + iy);
    v.s.zIndex += kz;
    if (v.shadow) v.shadow.position.set(v.shadow.position.x + ix, v.shadow.position.y + iy);
    if (v.fx) v.fx.position.set(v.fx.position.x + ix, v.fx.position.y + iy);
  }
  gr.fx.shift(dx, dy);
  for (const p of gr.particles) {
    p.x += dx;
    p.y += dy;
  }
  for (const f of gr.floaters) {
    f.x += dx;
    f.y += dy;
  }
  for (const r of gr.rings) {
    r.x += dx;
    r.y += dy;
  }
  for (const f of gr.flashes) {
    f.x += dx;
    f.y += dy;
  }
  // a tenth of a second long: dropped rather than moved
  for (const b of gr.bolts) for (const g of b.g) g.destroy();
  gr.bolts = [];
  for (const b of gr.beams) for (const sp of b.sprites) sp.destroy();
  gr.beams = [];
  // the overlays that follow the hero, his hireling or a cursed monster follow the new zone's actors: started again there
  for (const p of gr.buffFx.values()) gr.fx.end(p);
  gr.buffFx.clear();
  for (const p of gr.mercFx.values()) gr.fx.end(p);
  gr.mercFx.clear();
  for (const c of gr.curseFx.values()) gr.fx.end(c.play);
  gr.curseFx.clear();
}

/**
 * The hero walked into the neighbour at a seam (`w` the new zone, its coordinates = the old ones + (dx, dy)): the scene kept. False when
 * the scene cannot be kept (no map drawn, the neighbour's map not drawn): the application loads the zone as any other
 */
export function seamSwapImpl(this: GameRenderer, w: World, dx: number, dy: number): boolean {
  const old = this.mapView;
  const oldId = old?.map?.id;
  const newId = w.zone.d2Map?.id;
  const n = newId ? this.neighbours.find((x) => x.id === newId) : undefined;
  if (!old || !oldId || !newId || !n?.view.map || !this.seamsOn || this.worldRef?.zone.id === w.zone.id) return false;
  const t0 = performance.now();
  this.cancelPrep();
  const T: Record<string, number> = {};
  let tl = performance.now();
  const mk = (k: string) => {
    const t = performance.now();
    T[k] = Math.round((t - tl) * 10) / 10;
    tl = t;
  };
  shiftScene(this, dx, dy);
  mk('shift');
  // the maps: the neighbour's becomes the zone's, the zone's a neighbour's (cut to its part near the seam a little later)
  this.propViews = this.propViews.filter((pv) => !pv.struct);
  this.neighbours = this.neighbours.filter((x) => x !== n);
  const nv = n.view;
  nv.cullStructures = false;
  nv.setOffset(0, 0);
  for (const st of nv.structures) {
    st.s.visible = true;
    this.propViews.push({ s: st.s, rect: [0, 0, 0, 0], occluder: false, key: st.key, alpha: 1, struct: true });
  }
  this.mapView = nv;
  mk('newmap');
  const seams = w.zone.seams ?? [];
  const back = seams.find((s) => s.to === oldId);
  if (back) {
    // the structures on and near the screen moved now, the rest a few hundred an image (`flushOffset`)
    // (the last image's rectangle, in the new coordinates)
    const vr = this.viewRect;
    const sx = isoX(dx, dy);
    const sy = isoY(dx, dy);
    old.setOffset(back.at.x, back.at.y, vr ? [vr.x0 + sx - 600, vr.y0 + sy - 600, vr.x1 + sx + 600, vr.y1 + sy + 800] : undefined);
    this.flushViews = true;
    old.cullStructures = true;
    for (const st of old.structures) st.s.alpha = 1;
    this.neighbours.push({ id: oldId, view: old });
    // freed out of the part drawn once the image has gone on (the hero may walk back at once: then it is the zone's again, whole)
    window.setTimeout(() => {
      if (this.neighbours.some((x) => x.view === old)) old.trim(back.view);
    }, 1500);
  } else old.dispose();
  mk('oldmap');
  // the other neighbours: kept at their place if they are this zone's too, else dropped; this zone's others loaded behind the play
  const keep = new Set([newId, ...seams.map((s) => s.to)]);
  for (const x of [...this.neighbours]) {
    const s = seams.find((q) => q.to === x.id);
    if (!s) {
      // out of the scene now, freed behind the play
      const v = x.view;
      v.detach();
      window.setTimeout(() => v.dispose(), 900);
      this.neighbours = this.neighbours.filter((y) => y !== x);
    } else if (x.view !== old) x.view.setOffset(s.at.x, s.at.y);
  }
  mk('neighbours');
  // the dressings of the maps no longer drawn dropped
  const gone = this.propViews.filter((pv) => pv.map && !keep.has(pv.map));
  if (gone.length) {
    for (const pv of gone) {
      pv.s.destroy();
      pv.shadow?.destroy();
    }
    this.propViews = this.propViews.filter((pv) => !gone.includes(pv));
    this.decorViews = this.decorViews.filter((d) => !d.s.destroyed);
  }
  for (const id of [...this.dressings.keys()]) if (!keep.has(id)) this.dressings.delete(id);
  mk('dress');
  this.zoneId = w.zone.id;
  this.worldRef = w;
  // the new zone's light over a second (two zones of different light: no switch at the edge)
  if (this.ambient.color !== w.zone.ambient.color || this.ambient.level !== w.zone.ambient.level) this.ambientFade = { from: { ...this.ambient }, to: { ...w.zone.ambient }, t: 0 };
  this.waveSheets = w.tick;
  // behind the play, one job at a time a few images apart (each one short: the new zone's other neighbours started, its sheets, the rest
  // of its map placed a few pieces an image, its decor, props and lights)
  const epoch = nv;
  const jobs: (() => void)[] = [
    () => void this.bank.setActive(this.sheetsFor(w), undefined, PRIO.near),
    () => {
      for (const s of seams) {
        if (this.neighbours.some((x) => x.id === s.to)) continue;
        const nm = d2Map(s.to);
        if (nm) this.showNeighbour(s, this.mapLowFor(nm), true);
      }
    },
    () =>
      void nv.extend(w.zone.d2Map?.view, true).then((added) => {
        if (this.mapView !== epoch) return;
        for (const st of added) this.propViews.push({ s: st.s, rect: [0, 0, 0, 0], occluder: false, key: st.key, alpha: 1, struct: true });
        this.lastZoneMap.ms = performance.now() - t0;
      }),
    () => this.dressDecor(newId, { x: 0, y: 0 }),
    () => this.dressZone(w.zone, { x: 0, y: 0 }),
  ];
  let k = 0;
  const next = () => {
    const job = jobs.shift();
    if (!job || this.mapView !== epoch) return;
    const t = performance.now();
    job();
    T[`job${k++}`] = Math.round((performance.now() - t) * 10) / 10;
    window.setTimeout(next, 120);
  };
  window.setTimeout(next, 200);
  mk('scheduled');
  this.swapParts = T;
  this.lastZoneMap = { reused: true, ms: performance.now() - t0 };
  return true;
}
