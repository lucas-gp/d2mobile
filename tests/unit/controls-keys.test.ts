/** Controls : clavier réel (écouteurs window), mapping touches par mode, panneaux ouverts, bascule PC ↔ tactile, souris. */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { Controls } from '../../src/input/controls';

type Handler = (e: Record<string, unknown>) => void;
function fakeEl(): Record<string, unknown> {
  const h = new Map<string, Handler[]>();
  return {
    h,
    addEventListener: (t: string, f: Handler) => h.set(t, [...(h.get(t) ?? []), f]),
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    dataset: {},
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }),
    fire(t: string, e: Record<string, unknown>) {
      for (const f of h.get(t) ?? []) f({ preventDefault() {}, stopPropagation() {}, cancelable: true, ...e });
    },
  };
}

function setup(mode: 'pc' | 'touch') {
  const win = new Map<string, Handler[]>();
  (globalThis as unknown as { window: unknown }).window = {
    addEventListener: (t: string, f: Handler) => win.set(t, [...(win.get(t) ?? []), f]),
    innerWidth: 1280,
    innerHeight: 720,
  };
  const g = new Game();
  g.character.hotbar.primary = 'attack';
  g.character.hotbar.secondary = 'frost_nova';
  g.character.hotbar.slots = ['fire_bolt', 'ice_bolt', null, null, null, null, null, 'blizzard'];
  const stage = fakeEl();
  const hud = new Proxy(
    {
      layout: { s: 1 },
      page: 0,
      visibleSlots: (gg: Game) => gg.character.hotbar.slots.slice(0, 4),
      pcSlots: Array.from({ length: 8 }, fakeEl),
      skillBtns: Array.from({ length: 4 }, fakeEl),
      pcBelt: { heal: fakeEl(), mana: fakeEl(), rejuv: fakeEl() },
      targetId: 0,
      toggles: 0,
      toggleBigMap() {
        (this as { toggles: number }).toggles++;
      },
      bigMapOpen: false,
    },
    { get: (t: Record<string | symbol, unknown>, k) => (t[k] ??= fakeEl()) },
  );
  const mapper = {
    screenToWorld: (x: number, y: number) => ({ x: g.world.player.x + (x - 640) / 40, y: g.world.player.y + (y - 360) / 40 }),
    worldToScreen: () => ({ x: 0, y: 0 }),
    setAimIndicator() {},
  };
  const c = new Controls(() => g, hud as never, mapper, stage as never);
  let curMode = mode;
  c.mode = () => curMode;
  const log = { panels: [] as string[], walk: 0, alt: [] as boolean[] };
  c.onPanel = (n) => log.panels.push(n);
  c.onWalk = () => log.walk++;
  c.onAlt = (d) => log.alt.push(d);
  const fire = (t: 'keydown' | 'keyup', code: string, extra: Record<string, unknown> = {}) => {
    for (const f of win.get(t) ?? []) f({ code, key: code, cancelable: true, preventDefault() {}, target: {}, ...extra });
  };
  return {
    g,
    c,
    stage: stage as ReturnType<typeof fakeEl> & { fire: (t: string, e: Record<string, unknown>) => void },
    log,
    fire,
    hud: hud as unknown as { page: number; toggles: number; bigMapOpen: boolean },
    setMode: (m: 'pc' | 'touch') => (curMode = m),
  };
}
const mv = (g: Game) => ({ x: g.world.input.moveX, y: g.world.input.moveY });

describe('Controls : déplacement au clavier', () => {
  it('flèches et WASD marchent en tactile ; la touche maintenue puis relâchée arrête le mouvement', () => {
    const { g, c, fire } = setup('touch');
    fire('keydown', 'KeyW');
    c.apply();
    expect(Math.hypot(mv(g).x, mv(g).y)).toBeGreaterThan(0.5);
    fire('keyup', 'KeyW');
    c.apply();
    expect(mv(g)).toEqual({ x: 0, y: 0 });
  });
  it('deux touches opposées s’annulent', () => {
    const { g, c, fire } = setup('touch');
    fire('keydown', 'ArrowLeft');
    fire('keydown', 'ArrowRight');
    c.apply();
    expect(mv(g)).toEqual({ x: 0, y: 0 });
  });
  it('les directions opposées donnent des vecteurs opposés de même longueur', () => {
    const a = setup('touch');
    a.fire('keydown', 'ArrowUp');
    a.c.apply();
    const up = mv(a.g);
    const b = setup('touch');
    b.fire('keydown', 'ArrowDown');
    b.c.apply();
    const down = mv(b.g);
    expect(down.x).toBeCloseTo(-up.x, 6);
    expect(down.y).toBeCloseTo(-up.y, 6);
    expect(Math.hypot(up.x, up.y)).toBeCloseTo(1, 5);
  });
  it('en mode PC, S ne déplace plus (il ouvre les compétences) mais les flèches marchent encore', () => {
    const { g, c, fire, log } = setup('pc');
    fire('keydown', 'KeyS');
    c.apply();
    expect(mv(g)).toEqual({ x: 0, y: 0 });
    expect(log.panels).toEqual(['skills']);
    fire('keyup', 'KeyS');
    fire('keydown', 'ArrowUp');
    c.apply();
    expect(Math.hypot(mv(g).x, mv(g).y)).toBeGreaterThan(0.5);
  });
  it('Ctrl / Méta + touche est ignoré (raccourcis du navigateur)', () => {
    const { g, c, fire } = setup('touch');
    fire('keydown', 'KeyW', { ctrlKey: true });
    fire('keydown', 'KeyW', { metaKey: true });
    c.apply();
    expect(mv(g)).toEqual({ x: 0, y: 0 });
  });
  it('un contrôleur désactivé annule tout déplacement', () => {
    const { g, c, fire } = setup('touch');
    fire('keydown', 'KeyW');
    c.enabled = false;
    c.apply();
    expect(mv(g)).toEqual({ x: 0, y: 0 });
  });
  it('la répétition automatique d’une touche ne relance pas l’action', () => {
    const { c, fire, log } = setup('pc');
    fire('keydown', 'KeyI');
    fire('keydown', 'KeyI', { repeat: true });
    fire('keydown', 'KeyI', { repeat: true });
    expect(log.panels).toEqual(['inventory']);
    void c;
  });
  it('une saisie dans un champ de texte n’actionne rien', () => {
    const { fire, log } = setup('pc');
    fire('keydown', 'KeyI', { target: { tagName: 'INPUT' } });
    expect(log.panels).toEqual([]);
  });
});

describe('Controls : mapping selon le mode', () => {
  it('R : bascule marche/course en PC, potion de vie en tactile', () => {
    const pc = setup('pc');
    pc.fire('keydown', 'KeyR');
    expect(pc.log.walk).toBe(1);
    expect(pc.g.world.input.potion).toBeFalsy();
    const t = setup('touch');
    t.fire('keydown', 'KeyR');
    expect(t.log.walk).toBe(0);
    expect(t.g.world.input.potion).toBe('heal');
  });
  it('les chiffres : ceinture en PC, emplacements de la page en tactile', () => {
    const pc = setup('pc');
    pc.fire('keydown', 'Digit2');
    expect(pc.g.world.input.potion).toBe('mana');
    const t = setup('touch');
    t.fire('keydown', 'Digit2');
    expect(t.g.world.input.potion).toBeFalsy();
    expect(t.g.world.input.cast?.skill).toBe('ice_bolt');
  });
  it('F5 vise un emplacement vide sans rien lancer ; F8 lance la compétence de l’emplacement 8', () => {
    const { g, fire } = setup('pc');
    fire('keydown', 'F5');
    expect(g.world.input.cast).toBeFalsy();
    fire('keydown', 'F8');
    expect(g.world.input.cast?.skill).toBe('blizzard');
  });
  it('la bascule de mode à chaud change l’interprétation des touches sans recréer le contrôleur', () => {
    const s = setup('pc');
    s.fire('keydown', 'KeyR');
    expect(s.log.walk).toBe(1);
    s.setMode('touch');
    s.fire('keyup', 'KeyR');
    s.fire('keydown', 'KeyR');
    expect(s.log.walk).toBe(1);
    expect(s.g.world.input.potion).toBe('heal');
  });
  it('Tab : carte en PC, changement de page en tactile', () => {
    const pc = setup('pc');
    pc.fire('keydown', 'Tab');
    expect(pc.hud.toggles).toBe(1);
    const t = setup('touch');
    t.fire('keydown', 'Tab');
    expect(t.hud.page).toBe(1);
    t.fire('keyup', 'Tab');
    t.fire('keydown', 'Tab');
    expect(t.hud.page).toBe(0);
  });
  it('Espace téléporte seulement si la compétence est apprise', () => {
    const a = setup('pc');
    a.fire('keydown', 'Space');
    expect(a.g.world.input.cast).toBeFalsy();
    const b = setup('pc');
    b.g.character.skills.teleport = 1;
    b.fire('keydown', 'Space');
    expect(b.g.world.input.cast?.skill).toBe('teleport');
  });
  it('Alt (mode PC) lève/abaisse l’affichage des objets ; sans effet en tactile', () => {
    const pc = setup('pc');
    pc.fire('keydown', 'AltLeft');
    pc.fire('keyup', 'AltLeft');
    expect(pc.log.alt).toEqual([true, false]);
    const t = setup('touch');
    t.fire('keydown', 'AltLeft');
    expect(t.log.alt).toEqual([]);
  });
});

describe('Controls : panneau ouvert et Échap', () => {
  it('panneau ouvert : les potions et les lancers sont bloqués, la touche de compétence tente d’assigner au survol', () => {
    const { g, c, fire, log } = setup('pc');
    c.panelOpen = () => true;
    const assigned: number[] = [];
    c.onAssignHover = (slot) => (assigned.push(slot), true);
    fire('keydown', 'Digit1');
    fire('keydown', 'F2');
    fire('keydown', 'KeyP');
    expect(g.world.input.potion).toBeFalsy();
    expect(g.world.input.cast).toBeFalsy();
    expect(assigned).toEqual([1]);
    fire('keydown', 'KeyI'); // les panneaux restent commutables
    expect(log.panels).toEqual(['inventory']);
  });
  it('Échap : ferme le panneau ouvert, sinon la grande carte, sinon les réglages (PC) / fermeture (tactile)', () => {
    const s = setup('pc');
    s.c.panelOpen = () => true;
    s.fire('keydown', 'Escape');
    s.c.panelOpen = () => false;
    s.hud.bigMapOpen = true;
    s.fire('keyup', 'Escape');
    s.fire('keydown', 'Escape');
    s.hud.bigMapOpen = false;
    s.fire('keyup', 'Escape');
    s.fire('keydown', 'Escape');
    expect(s.log.panels).toEqual(['close', 'settings']);
    expect(s.hud.toggles).toBe(1);
    const t = setup('touch');
    t.fire('keydown', 'Escape');
    expect(t.log.panels).toEqual(['close']);
  });
});

describe('Controls : souris', () => {
  it('en tactile, un clic droit de souris ne lance pas la compétence secondaire', () => {
    const { g, c, stage } = setup('touch');
    stage.fire('pointerdown', { pointerType: 'mouse', button: 2, clientX: 800, clientY: 360, shiftKey: false });
    c.apply();
    expect(g.world.input.cast?.skill).not.toBe('frost_nova');
  });
  it('en PC, le bouton du milieu est ignoré', () => {
    const { g, c, stage } = setup('pc');
    stage.fire('pointerdown', { pointerType: 'mouse', button: 1, clientX: 800, clientY: 360, shiftKey: false });
    c.apply();
    expect(g.world.input.cast).toBeFalsy();
    expect(mv(g)).toEqual({ x: 0, y: 0 });
  });
  it('le clic droit vise le point cliqué : la cible du lancer suit le curseur', () => {
    const { g, c, stage } = setup('pc');
    const p = g.world.player;
    stage.fire('pointerdown', { pointerType: 'mouse', button: 2, clientX: 640 + 4 * 40, clientY: 360, shiftKey: false });
    c.apply();
    const cast = g.world.input.cast as { tx: number; ty: number };
    expect(cast.tx).toBeCloseTo(p.x + 4, 3);
    expect(cast.ty).toBeCloseTo(p.y, 3);
  });
  it('un clic gauche sur le sol met le joueur en marche vers un point à droite du curseur ou plus loin', () => {
    const { g, c, stage } = setup('pc');
    stage.fire('pointerdown', { pointerType: 'mouse', button: 0, clientX: 640 - 200, clientY: 360, shiftKey: false });
    c.apply();
    const a = mv(g);
    expect(Math.hypot(a.x, a.y)).toBeGreaterThan(0.5);
    const { g: g2, c: c2, stage: s2 } = setup('pc');
    s2.fire('pointerdown', { pointerType: 'mouse', button: 0, clientX: 640 + 200, clientY: 360, shiftKey: false });
    c2.apply();
    const b = mv(g2);
    expect(b.x * a.x + b.y * a.y).toBeLessThan(0); // sens opposé
  });
});
