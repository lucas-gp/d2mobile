/**
 * Acteurs (joueur, monstres, créatures) : pièces d'équipement, animation, placement et profondeur.
 * Fonctions extraites de la classe GameRenderer (renderer.ts) : `this` y désigne l'instance.
 */
import { classOf } from '../data/classes';
import { Sprite, Text, Texture } from 'pixi.js';
import type { World } from '../sim/world';
import { dirIndex, lerp, clamp } from '../core/math';
import { K, depthKey, isoX, isoY } from './iso';
import { eliteRingTex, glowTex } from './textures';
import { RULES } from '../mods/rules';
import { tr } from '../i18n';
import type { GameRenderer } from './renderer';
import { playerSheet, partSheetIds, classSheets, PROCEDURAL_PETS, walkFps, actorSheet, type ActorView } from './renderer-shared';
import { inView, newestCut } from './budget';

/** Seconds a corpse stays drawn (it fades out over its last 2 s) */
const CORPSE_TICKS = 25 * 11;

/** Superpose au corps du joueur son casque et son bouclier (images de même nom que celles du corps, ancrées aux pieds) */
export function syncPartsImpl(this: GameRenderer, v: ActorView, w: World): void {
  const want = new Set(partSheetIds(w, this.bank));
  v.parts ??= new Map();
  for (const [id, s] of v.parts) {
    if (!want.has(id)) {
      s.destroy();
      v.parts.delete(id);
    }
  }
  for (const id of want) {
    const sheet = this.bank.get(id);
    if (!sheet) {
      // planche libérée ou pas encore chargée : jamais de texture détruite affichée
      const gone = v.parts.get(id);
      if (gone) {
        gone.texture = Texture.EMPTY;
        gone.visible = false;
      }
      continue;
    }
    if (!v.lastName) {
      const early = v.parts.get(id);
      if (early) early.visible = false;
      continue;
    }
    let s = v.parts.get(id);
    if (!s) {
      s = new Sprite(Texture.EMPTY);
      this.entityLayer.addChild(s);
      v.parts.set(id, s);
    }
    const ft = sheet.frames.get(v.lastName);
    if (!ft || !v.body.visible) {
      s.visible = false;
      continue;
    }
    s.visible = true;
    s.texture = ft.tex;
    s.anchor.set(ft.ax / ft.tex.width, ft.ay / ft.tex.height);
    s.position.copyFrom(v.body.position);
    s.scale.copyFrom(v.body.scale);
    // arme ou bouclier dessiné avant le torse dans le COF (bras tourné vers l'arrière) : derrière le corps
    s.zIndex = v.body.zIndex + (ft.behind ? -0.5 : 0.5);
    s.tint = v.body.tint;
    s.alpha = v.body.alpha;
  }
}

export function setFrameImpl(this: GameRenderer, v: ActorView, anim: string, dir: number, frame: number): void {
  const sheet = v.sheet;
  if (!sheet) return;
  const a = sheet.anims[anim] ?? sheet.anims.idle;
  if (!a) return;
  const animName = sheet.anims[anim] ? anim : 'idle';
  const d = a.dirs === sheet.dirs ? dir : Math.round((dir / sheet.dirs) * a.dirs) % a.dirs;
  const f = clamp(frame, 0, a.frames - 1);
  const name = `${animName}/${d}/${f}`;
  v.lastName = name;
  const ft = sheet.frames.get(name);
  if (ft) {
    v.body.texture = ft.tex;
    v.body.anchor.set(ft.ax / ft.tex.width, ft.ay / ft.tex.height);
    if (ft.flip) v.body.scale.x = -Math.abs(v.body.scale.x);
  }
  const sft = sheet.shadows.get(name);
  if (sft) {
    v.shadow.texture = sft.tex;
    v.shadow.anchor.set(sft.ax / sft.tex.width, sft.ay / sft.tex.height);
    v.shadow.visible = true;
  } else v.shadow.visible = false;
}

export function updateActorsImpl(this: GameRenderer, w: World, alpha: number): void {
  const seen = this.seenActors;
  seen.clear();
  // corpses drawn at most (rule `render.limits`; base: all of them): the newest
  let corpseCut = -Infinity;
  if (this.limits.corpses < Infinity) {
    const keys = this.corpseKeys;
    keys.length = 0;
    for (const m of w.monsters) if (m.dead && w.tick - m.deathTick <= CORPSE_TICKS) keys.push(m.deathTick);
    corpseCut = newestCut(keys, this.limits.corpses);
  }
  const p = w.player;
  // joueur
  {
    const v = this.getActorView(p.id, playerSheet(w, this.bank));
    seen.add(p.id);
    const x = lerp(p.px, p.x, alpha);
    const y = lerp(p.py, p.y, alpha);
    this.placeActor(v, x, y, 1);
    const sheet = v.sheet;
    if (sheet) {
      const dirs = sheet.dirs;
      const dir = dirIndex(p.facing, dirs);
      let anim = 'idle';
      let frame = 0;
      // a game mode where the hero walks while he strikes or casts (rule `player.castWhileMoving`, lot 292b): since lot 294 (owner: "the
      // attack is replaced by the walk at once") the strike or cast is drawn for its whole length, facing its target, while he moves;
      // the walk comes back with the next frame after it
      if (p.dead) {
        anim = 'death';
        frame = Math.floor((p.modeT / 25) * (sheet.anims.death?.fps ?? 16));
      } else if (p.mode === 'cast' || p.mode === 'attack') {
        anim = p.mode === 'attack' ? 'attack' : 'cast';
        frame = Math.floor((p.modeT / Math.max(1, p.modeLen)) * (sheet.anims[anim]?.frames ?? 1));
      } else if (p.mode === 'hit') {
        anim = 'hit';
        frame = Math.floor((p.modeT / Math.max(1, p.modeLen)) * (sheet.anims.hit?.frames ?? 1));
      } else if (p.mode === 'walk') {
        anim = 'walk';
        const wa = sheet.anims.walk;
        frame = Math.floor(this.time * walkFps(wa, w.playerSpeed(), (wa?.fps ?? 16) * (w.playerSpeed() / 5.2))) % (wa?.frames ?? 1);
      } else {
        frame = Math.floor(this.time * (sheet.anims.idle?.fps ?? 10)) % (sheet.anims.idle?.frames ?? 1);
      }
      this.setFrame(v, anim, dir, frame);
      let tint = 0xffffff;
      if (p.freezeT > 0) tint = 0x8ab4ff;
      else if (p.chillT > 0) tint = 0xb8d0ff;
      if (w.tick - p.lastHitTick < 3) tint = 0xff9090;
      v.body.tint = tint;
      this.syncParts(v, w);
    } else this.syncParts(v, w);
  }
  // lot 305 (owner: "I have trouble seeing the champions and bosses among the other monsters"): a game mode marks them (rule
  // `render.eliteMarks`): a ring in the rank's colour under them, the champions and uniques a little larger, the name over a unique's
  // or a boss's head; a sprite and at most a text per elite (a few among 100+ monsters)
  const marks = RULES['render.eliteMarks'](w);
  this.eliteMarkCount = 0;
  // monstres et invocations
  for (const m of w.monsters) {
    if (m.dead && (w.tick - m.deathTick > CORPSE_TICKS || m.deathTick < corpseCut)) continue;
    const sid = actorSheet(m, this.bank);
    const v = this.getActorView(m.id, sid);
    seen.add(m.id);
    const x = m.dead ? m.x : lerp(m.px, m.x, alpha);
    const y = m.dead ? m.y : lerp(m.py, m.y, alpha);
    if (PROCEDURAL_PETS.has(sid)) {
      this.drawPetFx(w, v, m, x, y);
      continue;
    }
    const sheet = v.sheet;
    const baseScale = m.scale / m.def.scale;
    const elite = marks && !m.dead && !m.pet && (m.rank === 'champion' || m.rank === 'unique' || m.rank === 'boss');
    this.placeActor(v, x, y, (m.isSummon ? m.scale : baseScale) * (elite && m.rank !== 'boss' ? ELITE_SCALE : 1));
    // outside the drawn rectangle: hidden, not animated (its aura too)
    if (!inView(this.viewRect, v.body.position.x, v.body.position.y)) {
      v.body.visible = false;
      v.shadow.visible = false;
      if (v.aura) v.aura.visible = false;
      if (v.mark) v.mark.visible = false;
      if (v.label) v.label.visible = false;
      // drawn again from its next frame on (a frozen monster too: its pose and shadow are set again)
      v.lastAnim = '';
      continue;
    }
    v.body.visible = true;
    if (v.aura) v.aura.visible = true;
    if (m.dead) v.body.zIndex = depthKey(x, y) - 30; // les corps passent sous les vivants
    if (!sheet) continue;
    const dir = dirIndex(m.facing, sheet.dirs);
    let anim = 'idle';
    let frame = 0;
    const frozen = m.freezeT > 0;
    if (m.dead) {
      anim = 'death';
      frame = Math.floor(((w.tick - m.deathTick) / 25) * (sheet.anims.death?.fps ?? 14));
    } else if (m.mode === 'attack') {
      const atk = m.def.attacks[m.atk];
      anim = atk && (atk.kind === 'missile' || atk.kind === 'nova' || atk.kind === 'summon' || atk.kind === 'cast') && sheet.anims.cast ? 'cast' : 'attack';
      frame = Math.floor((m.modeT / Math.max(1, m.modeLen)) * (sheet.anims[anim]?.frames ?? 1));
    } else if (m.mode === 'hit') {
      anim = 'hit';
      frame = Math.floor((m.modeT / Math.max(1, m.modeLen)) * (sheet.anims.hit?.frames ?? 1));
    } else if (m.mode === 'walk') {
      anim = 'walk';
      const slow = m.chillT > 0 ? 1 - m.chillPct : 1;
      const wa = sheet.anims.walk;
      frame = Math.floor((this.time + m.id * 0.37) * walkFps(wa, m.speed * slow, (wa?.fps ?? 12) * slow * (m.speed / Math.max(1, m.def.speed)))) % (wa?.frames ?? 1);
    } else {
      frame = Math.floor((this.time + m.id * 0.53) * (sheet.anims.idle?.fps ?? 10)) % (sheet.anims.idle?.frames ?? 1);
    }
    if (frozen && v.lastAnim) {
      // gel : l'animation s'arrête sur place
    } else {
      this.setFrame(v, anim, dir, frame);
      v.lastAnim = anim;
    }
    let tint = m.pet ? m.tint : m.rank === 'champion' ? 0x9cb6ff : m.rank === 'unique' ? 0xffe0a0 : 0xffffff;
    if (frozen) tint = 0x7aa8ff;
    else if (m.chillT > 0) tint = 0xa8c8ff;
    else if (m.burnT > 0 && w.tick % 6 < 3) tint = 0xffb080;
    if (!m.dead && w.tick - m.lastHitTick < 2) tint = 0xff8a8a;
    v.body.tint = tint;
    v.body.alpha = m.dead ? clamp(1 - (w.tick - m.deathTick - 25 * 9) / 50, 0, 1) * (m.pet ? 0.6 : 1) : m.pet === 'spirit_wolf' ? 0.82 : 1;
    v.shadow.alpha = m.dead ? v.body.alpha * 0.6 : 1;
    if ((m.rank === 'unique' || m.rank === 'boss') && !m.dead) {
      if (!v.aura) {
        v.aura = new Sprite(glowTex());
        v.aura.anchor.set(0.5);
        v.aura.tint = m.rank === 'boss' ? 0xff3020 : 0xd0a040;
        this.fxLayer.addChild(v.aura);
      }
      v.aura.position.set(isoX(x, y), isoY(x, y));
      const s = (m.radius * 2.6 * K) / 64;
      v.aura.scale.set(s, s * 0.5);
      v.aura.alpha = 0.35 + 0.1 * Math.sin(this.time * 4 + m.id);
    } else if (v.aura) {
      v.aura.destroy();
      v.aura = undefined;
    }
    if (elite) {
      const color = ELITE_COLOR[m.rank] ?? 0xffffff;
      if (!v.mark) {
        v.mark = new Sprite(eliteRingTex());
        v.mark.anchor.set(0.5);
        this.decalLayer.addChild(v.mark);
      }
      v.mark.tint = color;
      v.mark.visible = true;
      v.mark.position.set(isoX(x, y), isoY(x, y));
      const s = (Math.max(0.6, m.radius) * (m.rank === 'boss' ? 3.2 : 2.8) * K) / 64;
      v.mark.scale.set(s, s * 0.5);
      v.mark.alpha = 0.75 + 0.25 * Math.sin(this.time * 5 + m.id);
      this.eliteMarkCount++;
      if (m.rank !== 'champion') {
        if (!v.label) {
          v.label = new Text({
            text: tr(m.name),
            style: { fontFamily: 'Georgia, serif', fontSize: 13, fontWeight: 'bold', fill: color, stroke: { color: 0x000000, width: 3 } },
            resolution: Math.min(2, globalThis.devicePixelRatio || 1),
          });
          v.label.anchor.set(0.5, 1);
          this.textLayer.addChild(v.label);
        }
        v.label.visible = true;
        // over the head (the text layer is in screen pixels): the frame's top above the feet (its anchor), a little higher
        const feet = this.worldToScreen(x, y);
        const top = v.body.height * (v.body.anchor?.y ?? 1);
        v.label.position.set(Math.round(feet.x), Math.round(feet.y - Math.max(top * 0.8, K * 1.2) * this.zoom - 4));
      } else if (v.label) {
        v.label.destroy();
        v.label = undefined;
      }
    } else {
      if (v.mark) {
        v.mark.destroy();
        v.mark = undefined;
      }
      if (v.label) {
        v.label.destroy();
        v.label = undefined;
      }
    }
  }
  for (const [id, v] of this.actorViews) {
    if (!seen.has(id)) {
      this.releaseActorView(v);
      this.actorViews.delete(id);
    }
  }
  this.updateBuffFx(w);
}

/** Lot 305 (rule `render.eliteMarks`): the champions and uniques drawn this much larger */
const ELITE_SCALE = 1.15;
/** Lot 305: the ring's and the name's colour by rank, Diablo II's names (champions blue, uniques gold, bosses red-orange) */
const ELITE_COLOR: Record<string, number> = { champion: 0x6f8fff, unique: 0xd8b048, boss: 0xff5a2a };

export function placeActorImpl(this: GameRenderer, v: ActorView, x: number, y: number, scale: number): void {
  const sx = isoX(x, y);
  const sy = isoY(x, y);
  v.body.position.set(sx, sy);
  v.shadow.position.set(sx, sy);
  const sheet = v.sheet;
  const s = scale / (sheet?.scale ?? 1);
  v.body.scale.set(s);
  v.shadow.scale.set(scale / (sheet?.shadowScale ?? 0.5));
  v.body.zIndex = this.depthWithProps(x, y);
}

/** Tri de profondeur : un acteur devant l'empreinte d'un grand décor passe devant lui */
export function depthWithPropsImpl(this: GameRenderer, x: number, y: number): number {
  let key = depthKey(x, y);
  for (const pv of this.propViews) {
    if (!pv.occluder) continue;
    // accès par indice : la déstructuration d'un tableau alloue un itérateur à chaque acteur et chaque image (mesuré : ~12 Mo/s)
    const r = pv.rect;
    const x0 = r[0];
    const y0 = r[1];
    const x1 = r[2];
    const y1 = r[3];
    if (x < x0 - 4 || y < y0 - 4 || x > x1 + 6 || y > y1 + 6) continue;
    const inFront = x > x1 || y > y1;
    if (inFront && key <= pv.key) key = pv.key + 1;
  }
  return key;
}

export function classSheetsChangedImpl(this: GameRenderer, w: World): boolean {
  const want = classSheets(w, this.bank);
  if (want.some((id) => !this.bank.get(id))) return true;
  const base = classOf(w.character.classId).sprite;
  // planches de la classe (corps, paliers d'armure, variantes d'arme, pièces) qui ne sont plus voulues
  return this.bank.loadedIds().some((id) => (id === base || id.startsWith(`${base}_`)) && !want.includes(id));
}
