/**
 * Contrôles : tactile (joystick flottant, attaque, arc de compétences, visée auto/manuelle,
 * téléportation par glissement, potions) et clavier/souris en second plan.
 * Produit uniquement des intentions dans `world.input` ; la visée automatique est une requête
 * en lecture seule de la simulation (sim/targeting.ts).
 */
import type { Game } from '../sim/game';
import type { Hud } from '../ui/hud';
import { SKILL_BY_ID, lin } from '../data/skills';
import { autoAim, objectAt, type AimContext } from '../sim/targeting';
import { dist } from '../core/math';
import { TERRAIN_RADIUS } from '../sim/constants';
import { attackReach } from '../sim/melee';
import type { World } from '../sim/world';
import { screenDirToWorld } from '../render/iso';
import { keyActionPc, keyActionTouch, mouseButtonIntent, movementKeys, skillForButton, type InputMode, type KeyAction } from './mode';

/** Constantes (docs/internal/ETUDE-MOBILE.md §14.1) */
const C = {
  JOY_R: 60,
  JOY_DEAD: 10,
  JOY_FOLLOW: 1.5,
  TAP_MAX_MS: 250,
  TAP_MOVE: 12,
  AIM_R: 100,
  AIM_CENTER: 18,
  AIM_CANCEL: 170,
  AIM_REARM: 150,
  HOLD_REPEAT: 200,
  MANUAL_LOCK_MS: 3000,
  /**
   * Tampon d'entrée : une intention émise pendant une incantation ou un coup reçu est tenue
   * tant que le personnage est occupé (au plus 800 ms : récupération après coup à 0 % de
   * FRC ≈ 600 ms), puis part dès qu'il est libre. À 200 ms, un sort relâché pendant un coup
   * reçu était perdu (E2E tactile).
   */
  INPUT_BUFFER_MS: 800,
};

export interface ScreenMapper {
  screenToWorld(x: number, y: number): { x: number; y: number };
  worldToScreen(x: number, y: number): { x: number; y: number };
  setAimIndicator(p: { x: number; y: number; r: number; color: number; line: boolean } | null): void;
}

interface Press {
  id: number;
  skill: string | null;
  kind: 'attack' | 'skill' | 'teleport';
  x0: number;
  y0: number;
  x: number;
  y: number;
  t0: number;
  mode: 'auto' | 'manual' | 'cancel';
  el: HTMLElement;
  lastCast: number;
}

export class Controls {
  private joyId = -1;
  private joyOrigin = { x: 0, y: 0 };
  private joyVec = { x: 0, y: 0 };
  private joyReleased = -9999;
  private presses = new Map<number, Press>();
  private buffered: { skill: string; tx: number; ty: number; targetId: number; at: number } | null = null;
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, inside: false };
  /** Bouton de souris maintenu (mode PC) : cible fixée à l'appui pour le clic gauche sur un monstre */
  private hold: { intent: 'primary' | 'secondary'; targetId: number; moveOnFloor: boolean; released: boolean } | null = null;
  /** Marche vers un point cliqué au sol (se poursuit après le relâchement, comme Diablo II) */
  private walkTo: { x: number; y: number; until: number; lx: number; ly: number; lt: number } | null = null;
  private hoverId = 0;
  /** Mode courant (fourni par l'application) et état du panneau : le mode PC ne change pas la simulation, seulement les intentions */
  mode: () => InputMode = () => 'touch';
  panelOpen: () => boolean = () => false;
  /** Touche de compétence pressée pendant le survol d'une compétence d'un panneau : l'assigne ; renvoie vrai si prise en charge */
  onAssignHover: ((slot: number) => boolean) | null = null;
  onAlt: ((down: boolean) => void) | null = null;
  private lockedId = 0;
  private lockedUntil = 0;
  private currentId = 0;
  onPanel: ((name: string) => void) | null = null;
  /** Bascule marche / course (touche R, bouton du HUD) */
  onWalk: (() => void) | null = null;
  /** Qualité d'image : préréglage suivant / comparer (true = rendu d'origine tant que l'on appuie) */
  onImageCycle: (() => void) | null = null;
  onImageCompare: ((on: boolean) => void) | null = null;
  /** Appui long sur un emplacement de compétence : choix de la compétence à y mettre (indice d'emplacement 0-7) */
  onSkillPicker: ((slot: number | 'primary' | 'secondary') => void) | null = null;
  onHaptic: ((kind: 'tap' | 'fail' | 'cancel') => void) | null = null;
  enabled = true;

  constructor(
    private readonly game: () => Game,
    private readonly hud: Hud,
    private readonly mapper: ScreenMapper,
    private readonly stage: HTMLElement,
  ) {
    this.bindJoystick();
    this.bindButton(hud.atkBtn, 'attack');
    hud.skillBtns.forEach((b, i) => this.bindButton(b, 'skill', i));
    this.bindButton(hud.teleBtn, 'teleport');
    const tap = (b: HTMLElement, fn: () => void) =>
      b.addEventListener('pointerdown', (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        fn();
      });
    tap(hud.hpBtn, () => this.potion('heal'));
    tap(hud.mpBtn, () => this.potion('mana'));
    tap(hud.rejBtn, () => this.potion('rejuv'));
    tap(hud.throwBtn, () => this.throwPot());
    tap(hud.pageBtn, () => {
      hud.page = (hud.page + 1) % 2;
      this.onHaptic?.('tap');
    });
    tap(hud.ctxBtn, () => this.context());
    tap(hud.walkBtn, () => {
      this.onWalk?.();
      this.onHaptic?.('tap');
    });
    // bouton de qualité d'image : un tap = préréglage suivant, appui long = comparer (rendu d'origine tant que l'on appuie)
    {
      const b = hud.imageBtn;
      let timer = 0;
      let comparing = false;
      const end = () => {
        window.clearTimeout(timer);
        timer = 0;
        if (comparing) {
          comparing = false;
          this.onImageCompare?.(false);
        }
      };
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        timer = window.setTimeout(() => {
          timer = 0;
          comparing = true;
          this.onImageCompare?.(true);
          this.onHaptic?.('tap');
        }, 380);
      });
      b.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        if (timer) {
          window.clearTimeout(timer);
          timer = 0;
          this.onImageCycle?.();
          this.onHaptic?.('tap');
        } else end();
      });
      b.addEventListener('pointerleave', end);
      b.addEventListener('pointercancel', end);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    // les menus s'ouvrent au « click » (fin du tap) : ouverts au pointerdown, le click
    // synthétisé ensuite tombait sur l'onglet du panneau apparu sous le doigt (clic fantôme)
    const menu = (btn: HTMLElement, name: string) => {
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onPanel?.(name);
      });
    };
    menu(hud.invBtn, 'inventory');
    menu(hud.skillsBtn, 'skills');
    menu(hud.charBtn, 'character');
    menu(hud.settingsBtn, 'settings');
    // portail : ouvre (ou déplace) le portail de ville à l'endroit où l'on se trouve, sans consommable
    hud.portalBtn.addEventListener('pointerdown', (e) => {
      if (e.cancelable) e.preventDefault();
      const g = this.game();
      if (g.portalAllowed() && g.openPortal()) this.onHaptic?.('tap');
    });
    // étiquettes au sol : tap = aller ramasser
    hud.labels.addEventListener('pointerdown', (e) => {
      const t = (e.target as HTMLElement).closest('.label') as HTMLElement | null;
      if (!t) return;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      this.game().world.input.pickup = Number(t.dataset.id);
    });
    this.bindPcBar();
    // tap dans le monde : verrouille un ennemi
    stage.addEventListener('pointerdown', (e) => this.worldTap(e));
    this.bindKeyboard();
  }

  /* ------------------------------ Joystick ------------------------------ */

  private bindJoystick(): void {
    const z = this.hud.joyZone;
    z.addEventListener('pointerdown', (e) => {
      if (this.joyId >= 0) return;
      if (e.cancelable) e.preventDefault();
      z.setPointerCapture(e.pointerId);
      this.joyId = e.pointerId;
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.joyVec = { x: 0, y: 0 };
      z.classList.add('active');
      this.drawJoy(e.clientX, e.clientY);
    });
    z.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyId) return;
      const s = this.hud.layout.s;
      const R = C.JOY_R * s;
      let dx = e.clientX - this.joyOrigin.x;
      let dy = e.clientY - this.joyOrigin.y;
      const d = Math.hypot(dx, dy);
      // la base suit le doigt au-delà de 1,5 R
      if (d > R * C.JOY_FOLLOW) {
        const k = (d - R * C.JOY_FOLLOW) / d;
        this.joyOrigin.x += dx * k;
        this.joyOrigin.y += dy * k;
        dx = e.clientX - this.joyOrigin.x;
        dy = e.clientY - this.joyOrigin.y;
      }
      const dd = Math.hypot(dx, dy);
      const dead = C.JOY_DEAD * s;
      if (dd < dead) this.joyVec = { x: 0, y: 0 };
      else {
        const mag = Math.min(1, (dd - dead) / (R - dead));
        this.joyVec = { x: (dx / dd) * mag, y: (dy / dd) * mag };
      }
      this.drawJoy(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.releaseJoy();
    };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
    z.addEventListener('lostpointercapture', end);
  }

  private releaseJoy(): void {
    this.joyId = -1;
    this.joyVec = { x: 0, y: 0 };
    this.joyReleased = performance.now();
    this.hud.joyZone.classList.remove('active');
  }

  private drawJoy(fx: number, fy: number): void {
    const s = this.hud.layout.s;
    const R = C.JOY_R * s;
    const zr = this.hud.joyZone.getBoundingClientRect();
    const ox = this.joyOrigin.x - zr.left;
    const oy = this.joyOrigin.y - zr.top;
    this.hud.joyBase.style.left = `${ox - R}px`;
    this.hud.joyBase.style.top = `${oy - R}px`;
    let kx = fx - this.joyOrigin.x;
    let ky = fy - this.joyOrigin.y;
    const d = Math.hypot(kx, ky);
    if (d > R) {
      kx *= R / d;
      ky *= R / d;
    }
    const kr = 26 * s;
    this.hud.joyKnob.style.left = `${ox + kx - kr}px`;
    this.hud.joyKnob.style.top = `${oy + ky - kr}px`;
  }

  /** Remise à zéro globale (perte de focus, rotation, onglet caché) */
  resetAll(): void {
    this.releaseJoy();
    for (const p of this.presses.values()) p.el.classList.remove('pressed');
    this.presses.clear();
    this.mapper.setAimIndicator(null);
    this.keys.clear();
    this.hold = null;
    this.walkTo = null;
    this.onAlt?.(false);
  }

  /**
   * Lot 311: the hero walked into the neighbouring zone at a seam: the coordinates moved by (dx, dy), the joystick, the keys and the held
   * mouse kept (he goes on walking), what named the former zone's monsters dropped
   */
  onSeam(dx: number, dy: number): void {
    if (this.walkTo) {
      this.walkTo.x += dx;
      this.walkTo.y += dy;
      this.walkTo.lx += dx;
      this.walkTo.ly += dy;
    }
    this.approach = null;
    if (this.hold) this.hold.targetId = 0;
    this.lockedId = 0;
    this.currentId = 0;
  }

  /* ------------------------------ Boutons ------------------------------ */

  private skillOf(kind: Press['kind'], idx: number): string | null {
    const g = this.game();
    if (kind === 'attack') return g.character.hotbar.primary;
    if (kind === 'teleport') return 'teleport';
    return this.hud.visibleSlots(g)[idx] ?? null;
  }

  private bindButton(b: HTMLElement, kind: Press['kind'], idx = 0): void {
    b.addEventListener('pointerdown', (e) => {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      const skill = this.skillOf(kind, idx);
      if (!skill) {
        // emplacement vide : un tap ouvre le choix de compétence
        if (kind === 'skill') this.onSkillPicker?.(this.hud.page * 4 + idx);
        return;
      }
      b.setPointerCapture(e.pointerId);
      const p: Press = { id: e.pointerId, skill, kind, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), mode: 'auto', el: b, lastCast: 0 };
      this.presses.set(e.pointerId, p);
      b.classList.add('pressed');
      // compétences « spam » (attaque principale) : lancement immédiat puis répétition
      if (kind === 'attack') {
        this.castAuto(skill);
        p.lastCast = performance.now();
      } else if (this.game().settings.instantCast && kind === 'skill') {
        this.castAuto(skill);
        this.presses.delete(e.pointerId);
      } else if (kind === 'skill') {
        // appui long immobile : liste des compétences apprises (comme le menu de choix de Diablo II)
        const id = e.pointerId;
        window.setTimeout(() => {
          const q = this.presses.get(id);
          if (!q || q.mode !== 'auto' || Math.hypot(q.x - q.x0, q.y - q.y0) > C.TAP_MOVE) return;
          this.presses.delete(id);
          b.classList.remove('pressed');
          this.mapper.setAimIndicator(null);
          this.onHaptic?.('tap');
          this.onSkillPicker?.(this.hud.page * 4 + idx);
        }, 550);
      }
    });
    b.addEventListener('pointermove', (e) => {
      const p = this.presses.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      const s = this.hud.layout.s;
      const d = Math.hypot(p.x - p.x0, p.y - p.y0);
      const outside = p.x < 0 || p.y < 0 || p.x > window.innerWidth || p.y > window.innerHeight;
      if (p.mode === 'cancel') {
        if (d < C.AIM_REARM * s && !outside) p.mode = 'manual';
      } else if (d > C.AIM_CANCEL * s || outside) {
        if (p.kind !== 'attack') {
          p.mode = 'cancel';
          this.onHaptic?.('cancel');
        }
      } else if (d > C.TAP_MOVE && d >= C.AIM_CENTER * s) p.mode = 'manual';
      else if (d < C.AIM_CENTER * s && p.mode === 'manual') p.mode = 'auto';
      this.updateAimIndicator(p);
    });
    const end = (e: PointerEvent) => {
      const p = this.presses.get(e.pointerId);
      if (!p) return;
      this.presses.delete(e.pointerId);
      b.classList.remove('pressed');
      this.mapper.setAimIndicator(null);
      if (p.kind === 'attack') return;
      if (e.type === 'pointercancel' || p.mode === 'cancel') return;
      if (p.mode === 'manual') {
        const t = this.manualTarget(p);
        this.issue(p.skill!, t.x, t.y, 0);
      } else this.castAuto(p.skill!);
    };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
  }

  /** Point de visée manuel : 100 px de glissé = pleine portée */
  private manualTarget(p: Press): { x: number; y: number } {
    const g = this.game();
    const pl = g.world.player;
    const s = this.hud.layout.s;
    const dx = p.x - p.x0;
    const dy = p.y - p.y0;
    const d = Math.hypot(dx, dy);
    const dir = screenDirToWorld(dx, dy);
    const sk = SKILL_BY_ID[p.skill ?? ''];
    const range = p.skill === 'attack' ? 1.5 : (sk?.range ?? 8);
    let frac = Math.min(1, d / (C.AIM_R * s));
    if (p.kind === 'teleport') frac = Math.max(0.3, frac);
    return { x: pl.x + dir.x * range * frac, y: pl.y + dir.y * range * frac };
  }

  private updateAimIndicator(p: Press): void {
    const g = this.game();
    if (p.mode === 'manual' || p.mode === 'cancel') {
      const t = this.manualTarget(p);
      const sk = SKILL_BY_ID[p.skill ?? ''];
      const r = sk?.n.radius ? lin(sk.n.radius, 1) : 0.8;
      let color = p.mode === 'cancel' ? 0x808080 : 0x60a0ff;
      if (p.kind === 'teleport' && g.world.grid.circleBlocked(t.x, t.y, TERRAIN_RADIUS)) color = 0xff4040;
      this.mapper.setAimIndicator({ x: t.x, y: t.y, r, color, line: true });
    } else {
      const a = autoAim(g.world, p.skill!, this.aimCtx());
      const sk = SKILL_BY_ID[p.skill ?? ''];
      this.mapper.setAimIndicator({ x: a.x, y: a.y, r: sk?.n.radius ? lin(sk.n.radius, 1) : 0.8, color: 0xffd060, line: false });
    }
  }

  private aimCtx(): AimContext {
    const now = performance.now();
    const joyActive = this.joyId >= 0 && Math.hypot(this.joyVec.x, this.joyVec.y) > 0.05;
    const joy = joyActive || now - this.joyReleased < 300 ? screenDirToWorldSafe(this.joyVec) : null;
    return { joy, currentId: this.currentId, lockedId: now < this.lockedUntil ? this.lockedId : 0 };
  }

  private castAuto(skill: string): void {
    const g = this.game();
    const a = autoAim(g.world, skill, this.aimCtx());
    if (a.targetId) this.currentId = a.targetId;
    this.issue(skill, a.x, a.y, a.targetId);
  }

  /** Envoie une intention ; si le joueur est occupé, tampon de 200 ms (1 élément) */
  private issue(skill: string, tx: number, ty: number, targetId: number, standStill = false): void {
    const w = this.game().world;
    const p = w.player;
    if (p.mode === 'cast' || p.mode === 'attack' || p.mode === 'hit') {
      this.buffered = { skill, tx, ty, targetId, at: performance.now() };
      return;
    }
    // attaque de mêlée (attaque normale, attaques animales du Druide) hors de portée : on s'approche
    this.walkTo = null;
    const reach = meleeReach(skill, w);
    if (reach && targetId && !standStill) {
      const m = w.monsters.find((x) => x.id === targetId);
      if (m && dist(p.x, p.y, m.x, m.y) > reach + m.radius + p.radius) {
        w.input.pickup = null;
        this.approach = { id: targetId, skill, until: performance.now() + 1500 };
        return;
      }
    }
    w.input.cast = { skill, tx, ty, targetId };
  }

  private approach: { id: number; skill: string; until: number } | null = null;

  private potion(kind: 'heal' | 'mana' | 'rejuv'): void {
    this.game().world.input.potion = kind;
    this.onHaptic?.('tap');
  }

  /** Lance la potion de jet : vers le curseur (PC, souris dans la fenêtre), sinon le monstre visé, le plus proche, ou devant soi */
  private throwPot(): void {
    const g = this.game();
    const w = g.world;
    const p = w.player;
    let t: { x: number; y: number } | null = null;
    if (this.mode() === 'pc' && this.mouse.inside) t = this.cursorWorld();
    else {
      const cur = this.currentId ? w.monsters.find((m) => m.id === this.currentId && !m.dead) : undefined;
      let best = cur;
      if (!best) {
        let bd = 12;
        for (const m of w.monstersNear(p.x, p.y, 12)) {
          const d = Math.hypot(m.x - p.x, m.y - p.y);
          if (d < bd) {
            bd = d;
            best = m;
          }
        }
      }
      t = best ? { x: best.x, y: best.y } : { x: p.x + Math.cos(p.facing) * 6, y: p.y + Math.sin(p.facing) * 6 };
    }
    w.input.throwAt = t;
    this.onHaptic?.('tap');
  }

  private context(): void {
    const g = this.game();
    const kind = this.hud.ctxBtn.dataset.kind;
    const id = Number(this.hud.ctxBtn.dataset.id);
    if (kind === 'item') g.world.input.pickup = id;
    else if (kind === 'object') g.world.input.interact = id;
  }

  private worldTap(e: PointerEvent): void {
    if (this.mode() === 'pc') {
      this.pcDown(e);
      return;
    }
    const g = this.game();
    const w = g.world;
    const p = this.mapper.screenToWorld(e.clientX, e.clientY);
    let best = null as null | { id: number; d: number };
    for (const m of w.monsters) {
      if (m.dead || m.isSummon) continue;
      const d = dist(p.x, p.y, m.x, m.y - 0.6);
      if (d < 1.4 && (!best || d < best.d)) best = { id: m.id, d };
    }
    if (best) {
      this.lockedId = best.id;
      this.lockedUntil = performance.now() + C.MANUAL_LOCK_MS;
      this.currentId = best.id;
      return;
    }
    // objets interactifs (coffres, PNJ, points de passage) : le plus proche, un PNJ touché aussi sur son corps
    const o = objectAt(w.objects, p.x, p.y);
    if (o) w.input.interact = o.id;
  }

  /* ------------------------------ Clavier / souris ------------------------------ */

  private cursorWorld(): { x: number; y: number } {
    return this.mapper.screenToWorld(this.mouse.x, this.mouse.y);
  }

  private shiftHeld(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  /** Lance la compétence d'un emplacement (clavier) : vers le curseur si la souris est dans la fenêtre, sinon visée automatique */
  private castSlot(skill: string | null): void {
    if (!skill) return;
    if (this.mouse.inside) {
      const c = this.cursorWorld();
      this.issue(skill, c.x, c.y, this.monsterAt(c), this.mode() === 'pc' && this.shiftHeld());
    } else this.castAuto(skill);
  }

  private runAction(a: KeyAction, e: KeyboardEvent): void {
    const g = this.game();
    const pc = this.mode() === 'pc';
    const open = this.panelOpen();
    switch (a.t) {
      case 'skill': {
        if (open) {
          if (pc && this.onAssignHover?.(a.slot)) e.preventDefault();
          return;
        }
        const skill = pc ? g.character.hotbar.slots[a.slot] : this.hud.visibleSlots(g)[a.slot];
        this.castSlot(skill ?? null);
        break;
      }
      case 'potion':
        if (!open) this.potion(a.kind);
        break;
      case 'throw':
        if (!open) this.throwPot();
        break;
      case 'walk':
        this.onWalk?.();
        break;
      case 'panel':
        this.onPanel?.(a.name);
        break;
      case 'map':
        this.hud.toggleBigMap();
        break;
      case 'escape':
        if (open) this.onPanel?.('close');
        else if (this.hud.bigMapOpen) this.hud.toggleBigMap();
        else if (pc) this.onPanel?.('settings');
        else this.onPanel?.('close');
        break;
      case 'portal':
        if (!open && g.portalAllowed()) g.openPortal();
        break;
      case 'context':
        if (!open) this.context();
        break;
      case 'teleport':
        if (!open && g.character.skills.teleport) {
          const c = this.cursorWorld();
          this.issue('teleport', c.x, c.y, 0);
        }
        break;
      case 'image':
        this.onImageCycle?.();
        break;
      case 'page':
        this.hud.page = (this.hud.page + 1) % 2;
        break;
    }
  }

  /** Point d'entrée testable du clavier : traduit une touche en action selon le mode */
  handleKey(e: KeyboardEvent): void {
    const pc = this.mode() === 'pc';
    const a = pc ? keyActionPc(e.code, e.key) : keyActionTouch(e.code);
    if (!a) return;
    // F1-F8 (et Tab, Alt) : le navigateur n'a rien à y faire en jeu
    if ((a.t === 'skill' && pc) || e.code === 'Tab') if (e.cancelable) e.preventDefault();
    this.runAction(a, e);
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.ctrlKey || e.metaKey) return;
      this.keys.add(e.code);
      if ((e.code === 'AltLeft' || e.code === 'AltRight') && this.mode() === 'pc') {
        if (e.cancelable) e.preventDefault();
        this.onAlt?.(true);
        return;
      }
      if (e.repeat) {
        if (e.code === 'Tab' || /^F[1-8]$/.test(e.code)) if (e.cancelable) e.preventDefault();
        return;
      }
      this.handleKey(e);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'AltLeft' || e.code === 'AltRight') this.onAlt?.(false);
    });
    this.stage.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = true;
      this.updateHover();
    });
    this.stage.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return;
      this.hoverId = 0;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      const i = mouseButtonIntent(e.button);
      // relâché : l'intention est appliquée au moins une fois (un clic bref entre deux images ne se perd pas)
      if (this.hold && this.hold.intent === i) this.hold.released = true;
    });
    this.stage.addEventListener('contextmenu', (e) => {
      if (e.cancelable) e.preventDefault();
    });
  }

  /** Cible sous le curseur (barre de vie, curseur de ciblage) */
  private updateHover(): void {
    if (this.mode() !== 'pc') {
      this.stage.classList.remove('cur-pc', 'cur-attack', 'cur-use');
      this.hoverId = 0;
      return;
    }
    const c = this.cursorWorld();
    this.hoverId = this.monsterAt(c);
    const use = !this.hoverId && !!objectAt(this.game().world.objects, c.x, c.y);
    const cl = this.stage.classList;
    cl.add('cur-pc');
    cl.toggle('cur-attack', this.hoverId > 0);
    cl.toggle('cur-use', use);
  }

  /** Appui souris en mode PC : gauche = marcher / attaquer / interagir, droit = compétence secondaire, Maj = sans se déplacer */
  private pcDown(e: PointerEvent): void {
    const intent = mouseButtonIntent(e.button);
    if (intent === 'none') return;
    if (e.cancelable) e.preventDefault();
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    this.mouse.inside = true;
    const w = this.game().world;
    const c = this.cursorWorld();
    const tid = this.monsterAt(c);
    const stand = e.shiftKey || this.shiftHeld();
    this.walkTo = null;
    this.approach = null;
    this.hold = { intent, targetId: tid, moveOnFloor: intent === 'primary' && !tid && !stand, released: false };
    if (intent === 'primary' && tid) {
      this.lockedId = tid;
      this.lockedUntil = performance.now() + C.MANUAL_LOCK_MS;
      this.currentId = tid;
    }
    if (intent === 'primary' && !tid && !stand) {
      // PNJ, coffre, point de passage : on interagit au lieu de marcher
      const o = objectAt(w.objects, c.x, c.y);
      if (o) {
        w.input.interact = o.id;
        this.hold = null;
        return;
      }
    }
  }

  /** Intentions du mode PC pour cette image (marche maintenue ou vers un point, compétence du bouton maintenu) */
  private applyPc(inp: World['input'], w: World, mv: { x: number; y: number }): void {
    const g = this.game();
    const now = performance.now();
    const stand = this.shiftHeld();
    const free = w.player.mode !== 'cast' && w.player.mode !== 'attack' && !inp.cast;
    const h = this.hold;
    if (h) {
      const c = this.cursorWorld();
      if (h.moveOnFloor) {
        this.walkTo = { x: c.x, y: c.y, until: now + 8000, lx: w.player.x, ly: w.player.y, lt: now };
      } else if (free || h.released) {
        const skill = skillForButton(g.character.hotbar, h.intent) ?? 'attack';
        if (h.intent === 'primary' && h.targetId) {
          const m = w.monsters.find((x) => x.id === h.targetId && !x.dead);
          if (!m) this.hold = null;
          else this.issue(skill, m.x, m.y, m.id, stand);
        } else this.issue(skill, c.x, c.y, this.monsterAt(c), stand);
      }
    }
    if (this.hold?.released) this.hold = null;
    const wt = this.walkTo;
    if (wt && !mv.x && !mv.y) {
      const pl = w.player;
      const d = dist(pl.x, pl.y, wt.x, wt.y);
      if (now - wt.lt > 500) {
        // bloqué (mur, obstacle) : on s'arrête
        if (dist(pl.x, pl.y, wt.lx, wt.ly) < 0.12 && !this.hold) this.walkTo = null;
        wt.lx = pl.x;
        wt.ly = pl.y;
        wt.lt = now;
      }
      if (d < 0.3 || now > wt.until) this.walkTo = null;
      else if (this.walkTo) {
        // chemin autour des obstacles (A*) ; inatteignable : on va au point le plus proche puis on s'arrête
        const sd = w.steer(wt.x, wt.y);
        if (sd) {
          mv.x = sd.x;
          mv.y = sd.y;
        } else if (!this.hold) this.walkTo = null;
      }
    }
  }

  private bindPcBar(): void {
    const h = this.hud;
    const down = (b: HTMLElement, fn: (e: PointerEvent) => void) => {
      b.addEventListener('pointerdown', (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        fn(e);
      });
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    // compétences gauche / droite : un clic ouvre le choix de la compétence (comme le menu de Diablo II)
    down(h.pcLeft, () => this.onSkillPicker?.('primary'));
    down(h.pcRight, () => this.onSkillPicker?.('secondary'));
    h.pcSlots.forEach((b, i) =>
      down(b, (e) => {
        if (e.button === 2) this.onSkillPicker?.(i);
        else this.castSlot(this.game().character.hotbar.slots[i] ?? null);
      }),
    );
    down(h.pcBelt.heal, () => this.potion('heal'));
    down(h.pcBelt.mana, () => this.potion('mana'));
    down(h.pcBelt.rejuv, () => this.potion('rejuv'));
    down(h.pcThrow, () => this.throwPot());
  }

  private monsterAt(p: { x: number; y: number }): number {
    const w = this.game().world;
    let best = 0;
    let bd = 1.5;
    for (const m of w.monsters) {
      if (m.dead || m.isSummon) continue;
      const d = dist(p.x, p.y, m.x, m.y - 0.6);
      if (d < bd) {
        bd = d;
        best = m.id;
      }
    }
    return best;
  }

  /* ------------------------------ Application par image ------------------------------ */

  /** Écrit les intentions de la frame dans world.input */
  apply(): void {
    const g = this.game();
    const w = g.world;
    const inp = w.input;
    if (!this.enabled) {
      inp.moveX = inp.moveY = 0;
      return;
    }
    // déplacement : joystick, sinon clavier (event.code : fonctionne en AZERTY)
    let mx = 0;
    let my = 0;
    const jl = Math.hypot(this.joyVec.x, this.joyVec.y);
    if (jl > 0) {
      const d = screenDirToWorld(this.joyVec.x, this.joyVec.y);
      mx = d.x * jl;
      my = d.y * jl;
    } else {
      let sx = 0;
      let sy = 0;
      const mk = new Set(movementKeys(this.mode()));
      const k = (code: string) => mk.has(code) && this.keys.has(code);
      if (k('KeyW') || k('ArrowUp')) sy -= 1;
      if (k('KeyS') || k('ArrowDown')) sy += 1;
      if (k('KeyA') || k('ArrowLeft')) sx -= 1;
      if (k('KeyD') || k('ArrowRight')) sx += 1;
      if (sx || sy) {
        const d = screenDirToWorld(sx, sy);
        mx = d.x;
        my = d.y;
      }
    }
    // approche d'une cible de mêlée
    if (!mx && !my && this.approach) {
      const m = w.monsters.find((x) => x.id === this.approach!.id && !x.dead);
      if (!m || performance.now() > this.approach.until) this.approach = null;
      else if (dist(w.player.x, w.player.y, m.x, m.y) > (meleeReach(this.approach.skill, w) ?? 1.3) - 0.1 + m.radius + w.player.radius) {
        // chemin autour des obstacles (A*), droit vers la cible quand rien ne gêne
        const sd = w.steer(m.x, m.y);
        if (sd) {
          mx = sd.x;
          my = sd.y;
        } else this.approach = null;
      } else {
        inp.cast = { skill: this.approach.skill, tx: m.x, ty: m.y, targetId: m.id };
        this.approach = null;
      }
    }
    // souris (mode PC) : marche, attaque et compétence secondaire
    if (this.mode() === 'pc') {
      const mv = { x: mx, y: my };
      this.applyPc(inp, w, mv);
      mx = mv.x;
      my = mv.y;
      this.updateHover();
    }
    inp.moveX = mx;
    inp.moveY = my;
    // attaque principale maintenue : répétition à la cadence du personnage
    const now = performance.now();
    for (const p of this.presses.values()) {
      if (p.kind !== 'attack') continue;
      if (now - p.t0 < C.HOLD_REPEAT && p.lastCast) continue;
      const pl = w.player;
      if (pl.mode === 'cast' || pl.mode === 'attack' || inp.cast) continue;
      if (p.mode === 'manual') {
        const t = this.manualTarget(p);
        this.issue(p.skill!, t.x, t.y, 0);
      } else this.castAuto(p.skill!);
      p.lastCast = now;
    }
    // tampon d'entrée
    if (this.buffered) {
      const pl = w.player;
      if (now - this.buffered.at > C.INPUT_BUFFER_MS) this.buffered = null;
      else if (pl.mode !== 'cast' && pl.mode !== 'attack' && pl.mode !== 'hit' && !inp.cast) {
        inp.cast = { skill: this.buffered.skill, tx: this.buffered.tx, ty: this.buffered.ty, targetId: this.buffered.targetId };
        this.buffered = null;
      }
    }
    // cible affichée : cible courante auto-visée si encore valable
    const cur = w.monsters.find((m) => m.id === this.currentId && !m.dead);
    if (!cur || dist(cur.x, cur.y, w.player.x, w.player.y) > 16) {
      const a = autoAim(w, g.character.hotbar.primary, this.aimCtx());
      this.currentId = a.targetId;
    }
    this.hud.targetId = this.mode() === 'pc' ? this.hoverId || (this.hold?.targetId ?? 0) : this.currentId;
    // indicateur de visée maintenu à jour pendant les glissés
    for (const p of this.presses.values()) if (p.kind !== 'attack' || p.mode === 'manual') this.updateAimIndicator(p);
  }
}

function screenDirToWorldSafe(v: { x: number; y: number }): { x: number; y: number } | null {
  if (Math.hypot(v.x, v.y) < 0.05) return null;
  return screenDirToWorld(v.x, v.y);
}

/** Allonge d'une attaque de mêlée (null : compétence à distance) */
function meleeReach(skill: string, w: World): number | null {
  if (skill === 'attack') return attackReach(w);
  const s = SKILL_BY_ID[skill];
  return s?.melee ? Math.max(s.range, s.range < 3 ? attackReach(w) : 0) : null;
}
