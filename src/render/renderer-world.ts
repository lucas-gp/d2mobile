/**
 * Éléments du monde : objets au sol, décor, héraut, objets de zone, projectiles, zones d'effet, occlusion, lumières dynamiques.
 * Fonctions extraites de la classe GameRenderer (renderer.ts) : `this` y désigne l'instance.
 */
import { highlightColor } from '../sim/loot/highlight';
import { Graphics, Sprite, Texture } from 'pixi.js';
import type { World } from '../sim/world';
import type { AreaEffect, WorldObject } from '../sim/actors';
import { dirIndex, lerp } from '../core/math';
import { groundItemImage } from './d2ground';
import { MISSILE_FX } from './fx';
import { K, depthKey, isoX, isoY } from './iso';
import { areaLightColor, dynLevel, edgeAmbient, elemLightColor, selectLights, warmPlayerColor } from './dynamic-light';
import { beamTex, discTex, glowTex, lightTex, lootTex, shardTex } from './textures';
import type { GameRenderer } from './renderer';
import { newestCut } from './budget';
import { ELEM_COLOR, DECOR_LIGHT, LIGHTING, mixColor, scaleColor, itemColor, missileLook, objectSheetsFor } from './renderer-shared';

export function updateItemsImpl(this: GameRenderer, w: World): void {
  const seen = new Set<number>();
  // filtre modifié : les vues (faisceaux compris) sont reconstruites
  if (w.filterVersion !== this.itemFilterVersion) {
    this.itemFilterVersion = w.filterVersion;
    for (const v of this.itemViews.values()) {
      v.s.destroy();
      v.img?.destroy();
      v.beam?.destroy();
      v.halo?.destroy();
    }
    this.itemViews.clear();
  }
  const reveal = w.character.filter.revealHidden || this.revealAll;
  for (const gi of w.items) {
    if (gi.show <= 0 && !reveal) continue;
    seen.add(gi.id);
    let v = this.itemViews.get(gi.id);
    if (!v) {
      const s = new Sprite(lootTex());
      s.anchor.set(0.5);
      // la liste de surbrillance du filtre prime sur la couleur de rareté
      const hl = highlightColor(w.character.filter, gi.item);
      const color = hl ?? itemColor(gi.item);
      s.tint = color;
      this.entityLayer.addChild(s);
      v = { s, drop: 0, color, hl: hl !== undefined };
      // image de l'objet de Diablo II posé au sol ; le halo de rareté reste dessous, plus discret
      const d2 = groundItemImage(gi.item.base);
      if (d2) {
        const img = new Sprite(d2.tex);
        img.anchor.set(d2.ax / d2.tex.width, d2.ay / d2.tex.height);
        this.entityLayer.addChild(img);
        v.img = img;
        s.alpha = 0.55;
      }
      // objet masqué révélé : estompé
      if (gi.show <= 0) s.alpha = 0.4;
      this.itemViews.set(gi.id, v);
    }
    // faisceau (valeur), halo pulsé (exceptionnel), faisceau très haut + étincelles (haute rune) : quelques sprites seulement
    if ((gi.show >= 3 || v.hl) && !v.beam) {
      const b = new Sprite(beamTex());
      b.anchor.set(0.5, 1);
      b.tint = gi.show >= 5 && !v.hl ? 0xff5018 : v.color;
      b.alpha = 0.8;
      this.fxLayer.addChild(b);
      v.beam = b;
    }
    if ((gi.show >= 4 || v.hl) && !v.halo) {
      const h = new Sprite(glowTex());
      h.anchor.set(0.5);
      h.tint = v.hl ? v.color : gi.show >= 5 ? 0xff6a20 : 0xffd070;
      h.blendMode = 'add';
      this.fxLayer.addChild(h);
      v.halo = h;
    }
    const age = (w.tick - gi.dropTick) / 25;
    const hop = age < 0.5 ? Math.sin((age / 0.5) * Math.PI) * 1.2 : 0;
    v.s.position.set(isoX(gi.x, gi.y), isoY(gi.x, gi.y, hop));
    v.s.zIndex = depthKey(gi.x, gi.y) - 5;
    if (v.img) {
      v.img.position.set(isoX(gi.x, gi.y), isoY(gi.x, gi.y, hop));
      v.img.zIndex = depthKey(gi.x, gi.y) - 4;
      v.img.alpha = gi.show <= 0 ? 0.4 : 1;
    }
    if (v.beam) {
      v.beam.position.set(isoX(gi.x, gi.y), isoY(gi.x, gi.y));
      const tall = gi.show >= 5 ? 3.2 : gi.show >= 4 ? 1.8 : 1;
      v.beam.scale.set(gi.show >= 5 ? 1.5 : gi.show >= 4 ? 1.15 : 0.9, tall * (1 + 0.05 * Math.sin(this.time * 3 + gi.id)));
      v.beam.alpha = 0.55 + 0.25 * Math.sin(this.time * 2.5 + gi.id) + (gi.show >= 5 ? 0.15 : 0);
    }
    if (v.halo) {
      v.halo.position.set(isoX(gi.x, gi.y), isoY(gi.x, gi.y));
      const pulse = 0.5 + 0.5 * Math.sin(this.time * (gi.show >= 5 ? 6 : 3.5) + gi.id);
      v.halo.scale.set((gi.show >= 5 ? 1.1 : 0.8) + 0.25 * pulse);
      v.halo.alpha = 0.35 + 0.4 * pulse;
    }
    if (gi.show >= 5 && this.rng.next() < 0.14 * this.quality.particles) {
      this.spawnParticle(gi.x + this.rng.float(-0.3, 0.3), gi.y + this.rng.float(-0.3, 0.3), 0.2, 0, 0, this.rng.float(2, 4.5), 0.9, this.rng.next() < 0.5 ? 0xffa040 : 0xffe080, 0.12, 0);
    }
  }
  for (const [id, v] of this.itemViews) {
    if (!seen.has(id)) {
      v.s.destroy();
      v.img?.destroy();
      v.beam?.destroy();
      v.halo?.destroy();
      this.itemViews.delete(id);
    }
  }
}

/**
 * Décor posé du DS1 : un sprite par objet, trié en profondeur avec les personnages. Lot 312: `map` the map it belongs to, `off` where the
 * map's origin stands in the zone's coordinates (a neighbour joined edge to edge), `limit` only the decor in that part of the map (its own
 * coordinates; the part of a neighbour drawn), `done` the decor already placed (by index: the rest added later)
 */
export function buildDecorImpl(
  this: GameRenderer,
  raw: { decor?: [string, number, number][] },
  map?: string,
  off: { x: number; y: number } = { x: 0, y: 0 },
  limit?: readonly [number, number, number, number],
  done?: Set<number>,
): void {
  const list = raw.decor ?? [];
  for (let i = 0; i < list.length; i++) {
    const [id, mx, my] = list[i];
    if (done?.has(i)) continue;
    if (limit && (mx < limit[0] - 8 || my < limit[1] - 8 || mx > limit[2] + 8 || my > limit[3] + 8)) continue;
    const x = mx + off.x;
    const y = my + off.y;
    const sheet = this.bank.get(id);
    const ft = sheet?.frames.get('idle/0/0');
    // (a sheet not loaded yet: tried again at the next dressing; lot 312)
    if (!sheet || !ft) continue;
    done?.add(i);
    const s = new Sprite(ft.tex);
    s.anchor.set(ft.ax / ft.tex.width, ft.ay / ft.tex.height);
    s.position.set(isoX(x, y), isoY(x, y));
    s.scale.set(1 / sheet.scale);
    // torches accrochées au mur (Tombeaux) : devant la tuile de mur qui les porte
    s.zIndex = depthKey(x, y) + (/^dec_q[ed]_/.test(id) ? 260 : 0);
    this.entityLayer.addChild(s);
    const lt = DECOR_LIGHT[id.split('_')[1]];
    this.propViews.push({ s, rect: [0, 0, 0, 0], occluder: false, key: s.zIndex, alpha: 1, light: lt ? { x, y, radius: lt.r, color: lt.c, intensity: lt.i ?? 0.7, flicker: 0.25 } : undefined, map });
    if (sheet.anims.idle.frames > 1) this.decorViews.push({ s, sheet, phase: (mx * 7.3 + my * 3.1) % 1, id });
  }
}

export function buildHeraldImpl(this: GameRenderer, w: World): void {
  const at = w.zone.waveArena ? w.zone.chamberAt : undefined;
  const sheet = this.bank.get('baal');
  const ft = sheet?.frames.get('idle/2/0');
  if (!at || !sheet || !ft) return;
  const s = new Sprite(ft.tex);
  s.anchor.set(ft.ax / ft.tex.width, ft.ay / ft.tex.height);
  s.position.set(isoX(at.x, at.y), isoY(at.x, at.y));
  s.scale.set(1.25 / sheet.scale);
  s.zIndex = depthKey(at.x, at.y);
  this.entityLayer.addChild(s);
  this.propViews.push({ s, rect: [0, 0, 0, 0], occluder: false, key: s.zIndex, alpha: 1, light: { x: at.x, y: at.y, radius: 9, color: 0xff3a3a, intensity: 0.8, flicker: 0.3 } });
  this.herald = { s, sheet, x: at.x, y: at.y, callUntil: -1, born: 0 };
}

export function updateHeraldImpl(this: GameRenderer): void {
  const h = this.herald;
  if (!h) return;
  const calling = this.time < h.callUntil;
  const a = calling ? h.sheet.anims.cast : h.sheet.anims.idle;
  const t = calling ? this.time - h.born : this.time;
  // le sort se rejoue deux fois pendant l'appel, puis il reprend son souffle
  const f = Math.floor(t * a.fps) % a.frames;
  const ft = h.sheet.frames.get(`${calling ? 'cast' : 'idle'}/2/${f}`);
  if (ft && h.s.texture !== ft.tex) {
    h.s.texture = ft.tex;
    h.s.anchor.set(ft.ax / ft.tex.width, ft.ay / ft.tex.height);
  }
}

export function updateDecorImpl(this: GameRenderer): void {
  for (const d of this.decorViews) {
    if (!d.s.visible) continue;
    // lot 312: its sheet released or replaced since (a neighbour's decor kept beyond the seam): never a destroyed texture drawn
    if (d.id) {
      const cur = this.bank.get(d.id);
      if (!cur) continue;
      d.sheet = cur;
    }
    const a = d.sheet.anims.idle;
    const f = Math.floor((this.time + (d.phase * a.frames) / a.fps) * a.fps) % a.frames;
    const ft = d.sheet.frames.get(`idle/0/${f}`);
    if (ft && d.s.texture !== ft.tex) {
      d.s.texture = ft.tex;
      d.s.anchor.set(ft.ax / ft.tex.width, ft.ay / ft.tex.height);
    }
  }
}

export function updateObjectsImpl(this: GameRenderer, w: World): void {
  const seen = new Set<number>();
  for (const o of w.objects) {
    seen.add(o.id);
    const v = this.objectViews.get(o.id) ?? createObjectView(this, w, o);
    refreshObjectSheet(this, o, v);
    objectGlow(this, o, v);
    objectFrame(this, w, o, v);
  }
  for (const [id, v] of this.objectViews) {
    if (!seen.has(id)) {
      v.s.destroy();
      v.fx?.destroy();
      this.objectViews.delete(id);
    }
  }
}

type ObjView = GameRenderer['objectViews'] extends Map<number, infer V> ? V : never;

/** Vue d'un objet de la zone : planche (sauf point de passage et escaliers déjà dessinés par la carte D2), halo des portails, points de passage et sceaux */
function createObjectView(gr: GameRenderer, w: World, o: WorldObject): ObjView {
  // carte de Diablo II : la dalle du point de passage est dans ses tuiles, son objet du DS1 dessiné par sa planche D2 (lot 314, `variant`) ;
  // jamais le pilier du décor du jeu par-dessus (le propriétaire : « enlever le totem sur le waypoint »)
  const ids = gr.mapView && o.kind === 'waypoint' && w.zone.d2Map && !o.variant ? [] : o.variant === 'stairs' || o.variant === 'edge' ? [] : objectSheetsFor(gr.bank, o.kind, o.ref, o.variant);
  const sheet = ids.map((id) => gr.bank.get(id)).find((x) => !!x);
  let s: Sprite;
  if (sheet) {
    const key = sheet.kind === 'prop' || sheet.dirs === 1 ? 'idle/0/0' : 'idle/2/0';
    const ft = sheet.frames.get(key) ?? [...sheet.frames.values()][0];
    s = new Sprite(ft.tex);
    s.anchor.set(ft.ax / ft.tex.width, ft.ay / ft.tex.height);
    s.scale.set(1 / sheet.scale);
  } else {
    s = new Sprite(Texture.EMPTY);
  }
  s.position.set(isoX(o.x, o.y), isoY(o.x, o.y));
  s.zIndex = depthKey(o.x, o.y);
  gr.entityLayer.addChild(s);
  const v: ObjView = { s, sheet: sheet?.id.startsWith('obj_') ? sheet : undefined, ids, epoch: gr.bank.epoch, base: sheet };
  // escalier : l'escalier est déjà dessiné par la carte, la case de passage reste invisible
  if ((o.kind === 'waypoint' || o.kind === 'portal' || o.kind === 'seal') && o.variant !== 'stairs' && o.variant !== 'edge') {
    const fx = new Sprite(discTex());
    fx.anchor.set(0.5);
    fx.tint = o.kind === 'portal' ? 0x5080ff : o.kind === 'seal' ? 0xff3020 : 0x80a0ff;
    fx.position.set(isoX(o.x, o.y), isoY(o.x, o.y));
    gr.fxLayer.addChild(fx);
    v.fx = fx;
  }
  gr.objectViews.set(o.id, v);
  return v;
}

/** Mode local : planche D2 de l'objet arrivée ou remplacée après la création de la vue ; planche du portail chargée après coup */
function refreshObjectSheet(gr: GameRenderer, o: WorldObject, v: ObjView): void {
  // mode local : la planche D2 de l'objet (ou du PNJ) peut arriver, ou remplacer celle sur laquelle la vue a été créée, après sa création ;
  // sans cela la vue garderait une planche détruite par le remplacement à chaud (objet invisible ou erreur de rendu « addressModeU »)
  if (v.ids && v.epoch !== gr.bank.epoch) {
    v.epoch = gr.bank.epoch;
    const cur = v.ids.map((id) => gr.bank.get(id)).find((x) => !!x);
    if (cur && cur !== v.base) {
      v.base = cur;
      if (cur.id.startsWith('obj_')) v.sheet = cur;
      const ft = cur.frames.get(cur.kind === 'prop' || cur.dirs === 1 ? 'idle/0/0' : 'idle/2/0') ?? [...cur.frames.values()][0];
      if (ft) {
        v.s.texture = ft.tex;
        v.s.anchor.set(ft.ax / ft.tex.width, ft.ay / ft.tex.height);
        v.s.scale.set(1 / cur.scale);
      }
    }
  }
  // planche du portail chargée après la création de l'objet
  if (!v.sheet && o.kind === 'portal' && o.variant !== 'stairs' && o.variant !== 'edge') {
    const sh = objectSheetsFor(gr.bank, 'portal', o.ref, o.variant)
      .map((id) => gr.bank.get(id))
      .find((x) => !!x);
    if (sh) {
      v.sheet = sh;
      v.s.scale.set(1 / sh.scale);
    }
  }
}

/** Halo et particules (portails, sceaux, points de passage), mélange additif des portails importés */
function objectGlow(gr: GameRenderer, o: WorldObject, v: ObjView): void {
  // lumière : mélange additif (le noir du dessin est invisible), trié en profondeur avec les personnages
  if (o.kind === 'portal' && v.sheet && o.variant !== 'lair') v.s.blendMode = 'add';
  // portail et point de passage de Diablo II : le halo bleu de remplacement n'est dessiné que sans la planche importée
  if (v.fx && v.sheet && (o.kind === 'portal' || o.kind === 'waypoint')) v.fx.visible = false;
  if (v.fx) {
    const pulse = 1 + 0.06 * Math.sin(gr.time * 3 + o.id);
    const r = o.kind === 'portal' ? 1.3 : 1.6;
    v.fx.scale.set(((r * 2 * K) / 256) * pulse);
    v.fx.alpha = o.kind === 'seal' && o.used ? 0 : 0.5 + 0.2 * Math.sin(gr.time * 2);
    if (o.kind === 'seal' && !o.used && gr.rng.next() < 0.3 * gr.quality.particles)
      gr.spawnParticle(o.x + gr.rng.float(-0.6, 0.6), o.y + gr.rng.float(-0.6, 0.6), 0, 0, 0, 2, 0.9, 0xff5030, 0.3, 0.05);
    if (o.kind === 'portal' && gr.rng.next() < 0.5 * gr.quality.particles) gr.spawnParticle(o.x + gr.rng.float(-0.8, 0.8), o.y + gr.rng.float(-0.8, 0.8), 0, 0, 0, 2.5, 0.8, 0x6090ff, 0.35, 0.05);
  }
}

/** Image de l'objet : fermé ou ouvert, ouverture puis boucle des portails ; objets utilisés estompés, grilles ouvertes masquées */
function objectFrame(gr: GameRenderer, w: World, o: WorldObject, v: ObjView): void {
  if (v.sheet) {
    // objet de Diablo II : fermé (animé s'il y a plusieurs images) ou ouvert (dernière image de l'ouverture)
    const open = o.used && v.sheet.anims.attack;
    let anim = open ? 'attack' : 'idle';
    let f: number;
    if (o.kind === 'portal' && o.variant === 'lair') {
      // dalle du repaire de Duriel : image fixe
      f = 0;
    } else if (o.kind === 'portal' && v.sheet.anims.attack) {
      // portail : l'ouverture (mode « op » : d'une étincelle au portail plein) une fois, puis la boucle du portail ouvert (mode « on » : il tourne sur lui-même)
      v.born ??= gr.time;
      const opening = v.sheet.anims.attack;
      const age = gr.time - v.born;
      if (age < opening.frames / opening.fps) {
        anim = 'attack';
        f = Math.floor(age * opening.fps);
      } else {
        const on = v.sheet.anims.idle;
        anim = 'idle';
        f = Math.floor((age - opening.frames / opening.fps) * on.fps) % on.frames;
      }
    } else if (o.kind === 'waypoint' && v.sheet.anims.attack) {
      // point de passage de D2 (lot 314) : allumé (mode « on », en boucle) en ville et une fois touché, éteint (« nu ») sinon
      const lit = w.zone.town || w.character.progression.milestones[`wp:${w.zone.id}`] !== undefined;
      const on = v.sheet.anims.attack;
      anim = lit ? 'attack' : 'idle';
      f = lit ? Math.floor((gr.time + o.id * 0.37) * on.fps) % on.frames : 0;
    } else {
      const a = open ? v.sheet.anims.attack : v.sheet.anims.idle;
      // les images du mode neutre des objets de D2 sont des variantes/états (autels de plusieurs types, coffres…), pas une animation : image fixe
      f = open ? a.frames - 1 : 0;
    }
    const ft = v.sheet.frames.get(`${anim}/0/${f}`);
    if (ft && v.s.texture !== ft.tex) {
      v.s.texture = ft.tex;
      v.s.anchor.set(ft.ax / ft.tex.width, ft.ay / ft.tex.height);
    }
  } else if (o.used && (o.kind === 'chest' || o.kind === 'barrel' || o.kind === 'sarcophagus' || o.kind === 'seal')) v.s.alpha = 0.6;
  if (o.kind === 'gate') v.s.visible = !o.used;
}

export function updateMissilesImpl(this: GameRenderer, w: World, alpha: number): void {
  const seen = new Set<number>();
  // projectiles drawn at most (rule `render.limits`; base: all of them): the newest (highest identifiers)
  let cut = -Infinity;
  if (this.limits.missiles < w.missiles.length) {
    const keys = this.missileKeys;
    keys.length = 0;
    for (const m of w.missiles) if (!m.dead) keys.push(m.id);
    cut = newestCut(keys, this.limits.missiles);
  }
  for (const m of w.missiles) {
    if (m.dead || m.id < cut) continue;
    seen.add(m.id);
    let s = this.missileViews.get(m.id);
    const look = missileLook(m.kind, m.elem);
    const fxId = MISSILE_FX[m.kind];
    const fxSheet = fxId ? this.bank.get(`fx_${fxId}`) : undefined;
    if (!s) {
      // a sprite of a projectile gone, reused (texture, look and layer set again here)
      s = this.missilePool.take(
        () => new Sprite(Texture.EMPTY),
        (ps) => {
          ps.visible = true;
          ps.alpha = 1;
          ps.rotation = 0;
          ps.zIndex = 0;
          ps.tint = 0xffffff;
          ps.scale.set(1);
          ps.anchor.set(0);
        },
      );
      if (fxSheet?.anims.idle) {
        // projectile de Diablo II : image animée orientée selon la trajectoire
        s.texture = Texture.EMPTY;
        (fxSheet.blend === 'normal' ? this.entityLayer : this.fxLayer).addChild(s);
        this.missileFx.set(s, fxSheet);
      } else {
        s.texture = look.shard ? shardTex() : glowTex();
        s.anchor.set(0.5);
        s.tint = look.color;
        this.fxLayer.addChild(s);
        this.missileFx.delete(s);
      }
      this.missileViews.set(m.id, s);
    }
    const x = lerp(m.px, m.x, alpha);
    const y = lerp(m.py, m.y, alpha);
    s.position.set(isoX(x, y), isoY(x, y, m.z));
    const d2sheet = this.missileFx.get(s);
    if (d2sheet) {
      const a = d2sheet.anims.idle;
      const dir = a.dirs > 1 ? dirIndex(Math.atan2(m.vy, m.vx), a.dirs) : 0;
      const ft = d2sheet.frames.get(`idle/${dir}/${Math.floor((this.time + m.id * 0.13) * a.fps) % a.frames}`);
      if (ft) {
        s.texture = ft.tex;
        s.anchor.set(ft.ax / ft.tex.width, ft.ay / ft.tex.height);
        s.scale.set(1 / d2sheet.scale);
        s.visible = true;
        if (d2sheet.blend === 'normal') s.zIndex = depthKey(x, y) + 1;
      } else s.visible = false;
      continue;
    }
    if (look.shard) {
      const sx = isoX(m.vx, m.vy);
      const sy = isoY(m.vx, m.vy);
      s.rotation = Math.atan2(sy, sx);
      s.scale.set(look.size / 24);
    } else {
      const pulse = 1 + 0.12 * Math.sin(this.time * 20 + m.id);
      s.scale.set((look.size / 40) * pulse);
    }
    if (look.trail && this.rng.next() < look.trail * this.quality.particles) {
      this.spawnParticle(x, y, m.z, this.rng.float(-0.4, 0.4), this.rng.float(-0.4, 0.4), 0.3, look.trailLife, look.color, look.size / 90, 0);
    }
    // trombes et tornades : poussière qui monte en spirale
    if (look.swirl) {
      for (let i = 0; i < look.swirl * 2 * this.quality.particles; i++) {
        const a = this.time * 14 + i * 2.1 + m.id;
        const r = 0.25 + 0.2 * look.swirl;
        const z = this.rng.float(0, 1.2 * look.swirl);
        // entonnoir : plus large en haut
        const rz = r * (0.6 + z * 0.35);
        this.spawnParticle(x + Math.cos(a) * rz, y + Math.sin(a) * rz, z, -Math.sin(a) * 5, Math.cos(a) * 5, this.rng.float(2, 4), 0.35, look.color, 0.22 + 0.08 * look.swirl, 0);
      }
    }
  }
  for (const [id, s] of this.missileViews) {
    if (!seen.has(id)) {
      this.missileFx.delete(s);
      this.missilePool.give(s, (x) => {
        x.visible = false;
      });
      this.missileViews.delete(id);
    }
  }
}

export function updateAreasImpl(this: GameRenderer, w: World, dt: number): void {
  const seen = new Set<number>();
  const q = this.quality.particles;
  for (const a of w.areas) {
    if (a.dead) continue;
    seen.add(a.id);
    let v = this.areaViews.get(a.id);
    if (!v) {
      const s = new Sprite(discTex());
      s.anchor.set(0.5);
      s.tint = ELEM_COLOR[a.elem] ?? 0xffffff;
      s.alpha = 0;
      this.fxLayer.addChild(s);
      v = { s, t: 0 };
      this.areaViews.set(a.id, v);
    }
    v.t += dt;
    const s = v.s;
    const draw = Object.prototype.hasOwnProperty.call(AREA_DRAW, a.kind) ? AREA_DRAW[a.kind] : areaDefault;
    draw({ gr: this, a, v, s, q });
  }
  for (const [id, v] of this.areaViews) {
    if (!seen.has(id)) {
      v.s.destroy();
      this.areaViews.delete(id);
    }
  }
}

/** Décor entre la caméra et le joueur : devient transparent */
export function updateOcclusionImpl(this: GameRenderer, px: number, py: number): void {
  // test à l'écran : tout décor dessiné APRÈS le joueur dont l'image recouvre son corps
  const sx = isoX(px, py);
  const sy = isoY(px, py);
  const bx0 = sx - 12;
  const bx1 = sx + 12;
  const by0 = sy - 64;
  const by1 = sy - 6;
  const key = this.depthWithProps(px, py);
  this.playerOccluded = false;
  for (const pv of this.propViews) {
    const s = pv.s;
    if (s.texture === Texture.EMPTY) continue;
    let target = 1;
    if (pv.key > key) {
      const w = s.width;
      const h = s.height;
      const x0 = s.x - s.anchor.x * w;
      const y0 = s.y - s.anchor.y * h;
      const ix = Math.min(bx1, x0 + w) - Math.max(bx0, x0);
      const iy = Math.min(by1, y0 + h) - Math.max(by0, y0);
      // assez grand pour cacher quelqu'un, et recouvrement réel du corps
      if (h > 48 && ix > 8 && iy > 20) {
        target = 0.35;
        this.playerOccluded = true;
      }
    }
    if (target === 1 && pv.alpha === 1) continue;
    pv.alpha += (target - pv.alpha) * 0.2;
    if (Math.abs(pv.alpha - 1) < 0.01) pv.alpha = 1;
    s.alpha = pv.alpha;
  }
}

/** Silhouette claire du joueur, dessinée au-dessus du décor qui le cache (fondu) */
export function updatePlayerGhostImpl(this: GameRenderer, w: World): void {
  const v = this.actorViews.get(w.player.id);
  const want = this.playerOccluded && !!v?.sheet && !w.player.dead;
  if (!want && (!this.playerGhost || this.playerGhost.alpha <= 0.01)) {
    if (this.playerGhost) this.playerGhost.visible = false;
    return;
  }
  if (!this.playerGhost) {
    this.playerGhost = new Sprite(Texture.EMPTY);
    this.playerGhost.tint = 0xcfe0ff;
    this.playerGhost.alpha = 0;
    this.ghostLayer.addChild(this.playerGhost);
  }
  const g = this.playerGhost;
  if (v) {
    g.texture = v.body.texture;
    g.anchor.copyFrom(v.body.anchor);
    g.position.copyFrom(v.body.position);
    g.scale.copyFrom(v.body.scale);
  }
  g.visible = true;
  g.alpha += ((want ? 0.5 : 0) - g.alpha) * 0.25;
}

export function renderLightsImpl(this: GameRenderer, w: World, px: number, py: number): void {
  this.lightUsed = 0;
  const add = (x: number, y: number, radius: number, color: number, intensity: number) => {
    let s = this.lightPool[this.lightUsed];
    if (!s) {
      s = new Sprite(lightTex());
      s.anchor.set(0.5);
      s.blendMode = 'add';
      this.lightPool.push(s);
      this.lightLayer.addChild(s);
    }
    this.lightUsed++;
    const p = this.worldToScreen(x, y);
    s.visible = true;
    s.position.set(p.x / 2, p.y / 2);
    const sx = (radius * K * this.zoom) / 64 / 2;
    s.scale.set(sx, sx * 0.5);
    s.tint = color;
    s.alpha = intensity;
  };
  // rayon de lumière du joueur (D2) : bonus d'équipement
  const mode = LIGHTING[this.lighting];
  const dl = this.quality.dynamicLights ? dynLevel(this.dynLight) : null;
  const lr = (this.lightRadius + w.player.d.lightRadius * 0.5) * mode.radius;
  if (dl) {
    // éclairage dynamique : lueur du joueur réchauffée avec un vacillement doux
    const fl = 1 - dl.flicker + dl.flicker * Math.sin(this.time * 7) * Math.sin(this.time * 3.1);
    add(px, py, lr, warmPlayerColor(0xfff0dc, dl.warm), fl);
    add(px, py, lr * 0.55, warmPlayerColor(0xffe8d0, dl.warm), 0.5 * fl);
  } else {
    add(px, py, lr, 0xfff0dc, 1);
    add(px, py, lr * 0.55, 0xffe8d0, 0.5);
  }
  const view = Math.max(this.width, this.height) / K / this.zoom + 8;
  for (const pv of this.propViews) {
    const l = pv.light;
    if (!l) continue;
    if (Math.abs(l.x - px) > view || Math.abs(l.y - py) > view) continue;
    const fl = 1 - l.flicker * 0.5 + l.flicker * 0.5 * Math.sin(this.time * 9 + l.x * 3) * Math.sin(this.time * 5.3 + l.y);
    add(l.x, l.y, l.radius, l.color, l.intensity * fl);
  }
  this.dynLightsUsed = 0;
  if (dl) {
    // sources dynamiques : candidates -> plafond dur, priorité aux plus proches
    const c = this.lightCands;
    c.length = 0;
    for (const m of w.missiles) {
      if (m.dead || m.team !== 0) continue;
      c.push({ x: m.x, y: m.y, radius: 2.8, color: elemLightColor(m.elem), intensity: 0.7, kind: 'missile' });
    }
    for (const a of w.areas) {
      if (a.dead) continue;
      const col = areaLightColor(a.kind, a.elem);
      if (col !== null) c.push({ x: (a.x + a.x2) / 2, y: (a.y + a.y2) / 2, radius: 4, color: col, intensity: 0.7, kind: 'area' });
    }
    for (const gi of w.items) if (gi.show >= 3) c.push({ x: gi.x, y: gi.y, radius: 2.5, color: highlightColor(w.character.filter, gi.item) ?? itemColor(gi.item), intensity: 0.6, kind: 'item' });
    this.flashes = this.flashes.filter((f) => {
      f.life -= 1 / 60;
      if (f.life <= 0) return false;
      c.push({ x: f.x, y: f.y, radius: f.r, color: f.color, intensity: f.life / 0.18, kind: 'flash' });
      return true;
    });
    if (dl.allies) for (const m of w.monsters) if (m.pet && !m.dead) c.push({ x: m.x, y: m.y, radius: 2.4, color: m.pet === 'merc' ? 0xfff0dc : 0xffd8a0, intensity: 0.4, kind: 'ally' });
    const sel = selectLights(c, px, py, view, dl.cap);
    for (const l of sel) add(l.x, l.y, l.radius, l.color, l.intensity);
    this.dynLightsUsed = sel.length;
  } else if (this.quality.dynamicLights) {
    for (const m of w.missiles) {
      if (m.dead || m.team !== 0) continue;
      add(m.x, m.y, 2.8, ELEM_COLOR[m.elem] ?? 0xffffff, 0.7);
      if (this.lightUsed > 60) break;
    }
    for (const a of w.areas) if (!a.dead && (a.kind === 'fire_wall' || a.kind === 'fire_ground')) add((a.x + a.x2) / 2, (a.y + a.y2) / 2, 4, 0xff7a3a, 0.7);
    for (const gi of w.items) if (gi.show >= 3) add(gi.x, gi.y, 2.5, highlightColor(w.character.filter, gi.item) ?? itemColor(gi.item), 0.6);
    this.flashes = this.flashes.filter((f) => {
      f.life -= 1 / 60;
      if (f.life <= 0) return false;
      add(f.x, f.y, f.r, f.color, f.life / 0.18);
      return true;
    });
  }
  for (let i = this.lightUsed; i < this.lightPool.length; i++) this.lightPool[i].visible = false;
  // ambiance de la zone, éclaircie selon le réglage (clair : tout l'écran reste lisible,
  // la lueur du personnage et des torches reste visible par-dessus)
  let amb = mixColor(scaleColor(this.ambient.color, this.ambient.level), 0xe6e0d6, mode.ambient);
  // éclairage dynamique : zones lointaines un peu plus sombres (un seul grand sprite additif restitue l'ambiance au centre)
  const edge = this.edgeSprite;
  if (edge) edge.visible = false;
  if (dl && dl.edgeDark > 0) {
    const strength = dl.edgeDark * (w.zone.town ? 0.4 : 1) * (1 - mode.ambient * 0.8);
    const e = edgeAmbient(amb, strength);
    amb = e.base;
    let es = this.edgeSprite;
    if (!es) {
      es = new Sprite(lightTex());
      es.anchor.set(0.5);
      es.blendMode = 'add';
      this.lightLayer.addChild(es);
      this.edgeSprite = es;
    }
    es.visible = true;
    es.tint = e.fill;
    es.alpha = 1;
    es.position.set(this.width / 4, this.height / 4);
    const sc = Math.hypot(this.width, this.height) / 4 / 64;
    es.scale.set(sc);
  }
  this.app.renderer.render({ container: this.lightLayer, target: this.lightRT, clear: true, clearColor: amb });
  this.lightSprite.width = this.width;
  this.lightSprite.height = this.height;
}

export function drawCollisionsImpl(this: GameRenderer, w: World): void {
  if (!this.showCollisions) {
    if (this.collGfx) this.collGfx.visible = false;
    return;
  }
  if (this.collGfx && !this.collGfx.destroyed) {
    this.collGfx.visible = true;
    return;
  }
  const g = new Graphics();
  const gr = w.grid;
  const C = 0.5;
  for (let cy = 0; cy < gr.rows; cy++) {
    for (let cx = 0; cx < gr.cols; cx++) {
      if (!gr.blocked[cy * gr.cols + cx]) continue;
      const x0 = cx * C;
      const y0 = cy * C;
      g.poly([isoX(x0, y0), isoY(x0, y0), isoX(x0 + C, y0), isoY(x0 + C, y0), isoX(x0 + C, y0 + C), isoY(x0 + C, y0 + C), isoX(x0, y0 + C), isoY(x0, y0 + C)]);
    }
  }
  g.fill({ color: 0xff2020, alpha: 0.35 });
  this.fxLayer.addChild(g);
  this.collGfx = g;
}

/** Zone d'effet à dessiner : rendu, zone, vue (disque et âge), sprite, densité de particules de la qualité */
interface AreaDraw {
  gr: GameRenderer;
  a: AreaEffect;
  v: { s: Sprite; t: number };
  s: Sprite;
  q: number;
}

function areaBlizzard({ gr, a, v, s, q }: AreaDraw): void {
  s.position.set(isoX(a.x, a.y), isoY(a.x, a.y));
  s.scale.set((a.radius * 2 * K) / 256);
  // Blizzard de boss : cercle plus marqué (et clignotant) pendant le délai de télégraphie
  s.alpha = a.kind === 'mon_blizzard' && a.maxLife - a.life < a.aux ? 0.3 + 0.15 * Math.sin(v.t * 18) : 0.18;
  for (let i = 0; i < 3 * q; i++) {
    const ang = gr.rng.float(0, Math.PI * 2);
    const r = Math.sqrt(gr.rng.next()) * a.radius;
    gr.spawnParticle(a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r, 5, 0.6, 0.6, -9, 0.55, 0xa8d0ff, 0.28, 0, true);
  }
}

function areaMonFirewall({ gr, a, s, q }: AreaDraw): void {
  s.alpha = 0;
  // mur de feu de boss : étincelles discrètes pendant le délai de télégraphie, flammes ensuite
  const n = Math.ceil((a.kind === 'mon_firewall' && a.maxLife - a.life < a.aux ? 1.5 : 4) * q);
  for (let i = 0; i < n; i++) {
    const t = gr.rng.next();
    const x = lerp(a.x, a.x2, t);
    const y = lerp(a.y, a.y2, t);
    gr.spawnParticle(x, y, 0, gr.rng.float(-0.2, 0.2), gr.rng.float(-0.2, 0.2), gr.rng.float(2, 3.5), 0.5, 0xff7a2a, 0.5, -1);
  }
}

function areaFireGround({ gr, a, s, q }: AreaDraw): void {
  s.position.set(isoX(a.x, a.y), isoY(a.x, a.y));
  s.scale.set((a.radius * 2 * K) / 256);
  s.alpha = 0.22 * Math.min(1, a.life / 25);
  if (gr.rng.next() < 0.8 * q) gr.spawnParticle(a.x + gr.rng.float(-a.radius, a.radius) * 0.7, a.y + gr.rng.float(-a.radius, a.radius) * 0.7, 0, 0, 0, 2.2, 0.45, 0xff6a20, 0.35, -0.5);
}

function areaMeteorFall({ gr, a, s }: AreaDraw): void {
  // télégraphe au sol puis météore qui descend du ciel
  const t = 1 - a.life / a.maxLife;
  s.position.set(isoX(a.x, a.y), isoY(a.x, a.y));
  s.scale.set(((a.radius * 2 * K) / 256) * (0.6 + 0.4 * t));
  s.alpha = 0.25 + 0.25 * t;
  s.tint = 0xff5020;
  const z = (1 - t) * 14;
  const fx = a.x - (1 - t) * 6;
  const fy = a.y - (1 - t) * 6;
  gr.spawnParticle(fx, fy, z, 0, 0, 0, 0.25, 0xffa040, 1.4, 0);
}

function areaFissure({ gr, a, s, q }: AreaDraw): void {
  s.position.set(isoX(a.x, a.y), isoY(a.x, a.y));
  s.scale.set((a.radius * 2 * K) / 256);
  s.tint = 0x6a2a10;
  s.alpha = 0.3 * Math.min(1, a.life / 15);
  for (let i = 0; i < 2 * q; i++) {
    const ang = gr.rng.float(0, Math.PI * 2);
    const r = Math.sqrt(gr.rng.next()) * a.radius;
    gr.spawnParticle(a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r, 0, 0, 0, gr.rng.float(3, 6), 0.4, 0xff6a20, 0.45, 2);
  }
}

function areaFissureVent({ gr, a, s, q }: AreaDraw): void {
  s.position.set(isoX(a.x, a.y), isoY(a.x, a.y));
  s.scale.set((a.radius * 2 * K) / 256);
  s.tint = 0x6a2a10;
  s.alpha = 0.3 * Math.min(1, a.life / 15);
  if (gr.rng.next() < 0.6 * q) gr.spawnParticle(a.x + gr.rng.float(-a.radius, a.radius) * 0.6, a.y + gr.rng.float(-a.radius, a.radius) * 0.6, 0, 0, 0, gr.rng.float(3, 6), 0.4, 0xff6a20, 0.45, 2);
}

function areaVolcano({ gr, a, s, q }: AreaDraw): void {
  s.position.set(isoX(a.x, a.y), isoY(a.x, a.y));
  s.scale.set((a.radius * 1.2 * K) / 256);
  s.tint = 0x8a2a0a;
  s.alpha = 0.45 * Math.min(1, a.life / 15);
  if (gr.rng.next() < 0.9 * q) gr.spawnParticle(a.x, a.y, 0.6, gr.rng.float(-1, 1), gr.rng.float(-1, 1), gr.rng.float(5, 9), 0.7, gr.rng.next() < 0.5 ? 0xff7a20 : 0x5a4a40, 0.5, 8);
}

function areaArmaRock({ gr, a, s }: AreaDraw): void {
  const t = 1 - a.life / a.maxLife;
  s.position.set(isoX(a.x, a.y), isoY(a.x, a.y));
  s.scale.set(((a.radius * 2 * K) / 256) * (0.5 + 0.5 * t));
  s.tint = 0xff5020;
  s.alpha = 0.2 + 0.2 * t;
  gr.spawnParticle(a.x - (1 - t) * 3, a.y - (1 - t) * 3, (1 - t) * 10, 0, 0, 0, 0.2, 0xffa040, 1, 0);
}

function areaGroundPulse({ a, s }: AreaDraw): void {
  s.position.set(isoX(a.x, a.y), isoY(a.x, a.y));
  s.scale.set((a.radius * 2 * K) / 256);
  s.alpha = 0.15 + 0.3 * (1 - a.life / a.maxLife);
}

function areaMbMark({ a, v, s }: AreaDraw): void {
  // télégraphe de boss de carte : disque qui se renforce, puis clignote juste avant l'impact
  const t = 1 - a.life / a.maxLife;
  s.position.set(isoX(a.x, a.y), isoY(a.x, a.y));
  s.scale.set((a.radius * 2 * K) / 256);
  s.alpha = 0.34 + 0.36 * t + (a.life < 8 ? 0.2 * Math.sin(v.t * 40) : 0);
}

function areaMbPool({ gr, a, v, s, q }: AreaDraw): void {
  // zone persistante de boss de carte : clignote pendant le télégraphe (aux), puis bouillonne
  s.position.set(isoX(a.x, a.y), isoY(a.x, a.y));
  s.scale.set((a.radius * 2 * K) / 256);
  s.alpha = a.maxLife - a.life < a.aux ? 0.25 + 0.15 * Math.sin(v.t * 18) : 0.34 * Math.min(1, a.life / 25);
  if (gr.rng.next() < 0.6 * q)
    gr.spawnParticle(a.x + gr.rng.float(-a.radius, a.radius) * 0.7, a.y + gr.rng.float(-a.radius, a.radius) * 0.7, 0, 0, 0, 1.6, 0.6, ELEM_COLOR[a.elem] ?? 0xffffff, 0.35, -0.3);
}

function areaDefault({ s }: AreaDraw): void {
  s.alpha = 0;
}

/** Dessin des zones d'effet par nature (disque au sol, particules) ; les autres sont invisibles */
const AREA_DRAW: Record<string, (c: AreaDraw) => void> = {
  blizzard: areaBlizzard,
  mon_blizzard: areaBlizzard,
  mon_firewall: areaMonFirewall,
  fire_wall: areaMonFirewall,
  fire_ground: areaFireGround,
  blaze: areaFireGround,
  meteor_fall: areaMeteorFall,
  fissure: areaFissure,
  fissure_vent: areaFissureVent,
  volcano: areaVolcano,
  arma_rock: areaArmaRock,
  ground_pulse: areaGroundPulse,
  mb_mark: areaMbMark,
  mb_pool: areaMbPool,
};
