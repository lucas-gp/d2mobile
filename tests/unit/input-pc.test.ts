/** Couche d'entrée PC : détection du mode, touches Diablo II, boutons de souris, clic droit = compétence secondaire */
import { beforeEach, describe, expect, it } from 'vitest';
import { InputModeStore, watchCapabilities, keyActionPc, keyActionTouch, mouseButtonIntent, movementKeys, resolveInputMode, skillForButton, type Capabilities } from '../../src/input/mode';
import { withDefaultSettings } from '../../src/sim/save';
import { Game } from '../../src/sim/game';
import { Controls } from '../../src/input/controls';

const MOUSE: Capabilities = { primaryFine: true, primaryHover: true, anyFine: true, anyCoarse: false };
const PHONE: Capabilities = { primaryFine: false, primaryHover: false, anyFine: false, anyCoarse: true };
const HYBRID: Capabilities = { primaryFine: true, primaryHover: true, anyFine: true, anyCoarse: true };
const TABLET_MOUSE: Capabilities = { primaryFine: false, primaryHover: false, anyFine: true, anyCoarse: true };

describe('Détection du mode de commandes', () => {
  it('PC : pointeur précis qui survole, sans écran tactile', () => {
    expect(resolveInputMode('auto', MOUSE, null)).toBe('pc');
  });
  it('téléphone : tactile, même après une touche de clavier', () => {
    expect(resolveInputMode('auto', PHONE, null)).toBe('touch');
    expect(resolveInputMode('auto', PHONE, 'mouse')).toBe('touch');
  });
  it('portable tactile : PC par défaut, tactile si le doigt est la dernière entrée', () => {
    expect(resolveInputMode('auto', HYBRID, null)).toBe('pc');
    expect(resolveInputMode('auto', HYBRID, 'touch')).toBe('touch');
    expect(resolveInputMode('auto', HYBRID, 'mouse')).toBe('pc');
  });
  it('tablette avec souris branchée : bascule en PC à la première souris', () => {
    expect(resolveInputMode('auto', TABLET_MOUSE, null)).toBe('touch');
    expect(resolveInputMode('auto', TABLET_MOUSE, 'mouse')).toBe('pc');
  });
  it('le réglage force le mode', () => {
    expect(resolveInputMode('touch', MOUSE, 'mouse')).toBe('touch');
    expect(resolveInputMode('pc', PHONE, 'touch')).toBe('pc');
  });
  it('bascule à la volée avec la dernière entrée, et prévient les écouteurs', () => {
    const st = new InputModeStore(HYBRID);
    const seen: string[] = [];
    st.onChange((m) => seen.push(m));
    expect(st.current).toBe('pc');
    st.noteInput('touch');
    st.noteInput('touch');
    st.noteInput('mouse');
    expect(seen).toEqual(['touch', 'pc']);
    st.noteInput('touch');
    st.setPref('pc');
    expect(st.current).toBe('pc');
    st.setPref('auto');
    expect(st.current).toBe('touch');
  });
  it('le réglage « Commandes » est persisté (défaut auto, valeur invalide corrigée)', () => {
    expect(withDefaultSettings().controls).toBe('auto');
    expect(withDefaultSettings({ controls: 'pc' }).controls).toBe('pc');
    expect(withDefaultSettings({ controls: 'xx' as never }).controls).toBe('auto');
  });
});

describe('Capacités suivies pendant la partie (matchMedia change)', () => {
  it('une souris branchée sur une tablette passe en mode PC, débranchée revient au tactile ; arrêt de l’écoute', () => {
    const state: Record<string, boolean> = { '(pointer: fine)': false, '(hover: hover)': false, '(any-pointer: fine)': false, '(any-pointer: coarse)': true };
    const fns = new Map<string, Set<() => void>>();
    const mq = (q: string) => ({
      get matches() {
        return state[q] ?? false;
      },
      addEventListener: (_: 'change', f: () => void) => void (fns.get(q) ?? fns.set(q, new Set()).get(q)!).add(f),
      removeEventListener: (_: 'change', f: () => void) => void fns.get(q)?.delete(f),
    });
    const fire = (q: string, v: boolean) => {
      state[q] = v;
      for (const f of fns.get(q) ?? []) f();
    };
    const store = new InputModeStore({ primaryFine: false, primaryHover: false, anyFine: false, anyCoarse: true });
    const stop = watchCapabilities(store, mq);
    expect(store.current).toBe('touch');
    fire('(pointer: fine)', true);
    fire('(hover: hover)', true);
    fire('(any-pointer: fine)', true);
    fire('(any-pointer: coarse)', false);
    expect(store.current).toBe('pc');
    fire('(pointer: fine)', false);
    fire('(hover: hover)', false);
    fire('(any-pointer: fine)', false);
    fire('(any-pointer: coarse)', true);
    expect(store.current).toBe('touch');
    stop();
    expect([...fns.values()].every((s) => s.size === 0)).toBe(true);
  });
});

describe('Touches (mode PC, comme Diablo II)', () => {
  it('F1-F8 = emplacements 0 à 7', () => {
    for (let i = 1; i <= 8; i++) expect(keyActionPc(`F${i}`)).toEqual({ t: 'skill', slot: i - 1 });
    expect(keyActionPc('F9')).toBeNull();
  });
  it('1-4 = ceinture ; I, C, S, M, Tab, Échap, H et ?', () => {
    expect(keyActionPc('Digit1')).toEqual({ t: 'potion', kind: 'heal' });
    expect(keyActionPc('Digit2')).toEqual({ t: 'potion', kind: 'mana' });
    expect(keyActionPc('Digit3')).toEqual({ t: 'potion', kind: 'rejuv' });
    expect(keyActionPc('KeyI')).toEqual({ t: 'panel', name: 'inventory' });
    expect(keyActionPc('KeyC')).toEqual({ t: 'panel', name: 'character' });
    expect(keyActionPc('KeyS')).toEqual({ t: 'panel', name: 'skills' });
    expect(keyActionPc('KeyM')).toEqual({ t: 'map' });
    expect(keyActionPc('Tab')).toEqual({ t: 'map' });
    expect(keyActionPc('Escape')).toEqual({ t: 'escape' });
    expect(keyActionPc('KeyH')).toEqual({ t: 'panel', name: 'help' });
    expect(keyActionPc('Slash', '?')).toEqual({ t: 'panel', name: 'help' });
  });
  it('le mode tactile garde son clavier de secours (chiffres = page de compétences)', () => {
    expect(keyActionTouch('Digit2')).toEqual({ t: 'skill', slot: 1 });
    expect(keyActionTouch('F1')).toBeNull();
  });
  it('S ouvre les compétences en mode PC : plus de déplacement WASD', () => {
    expect(movementKeys('pc')).not.toContain('KeyS');
    expect(movementKeys('touch')).toContain('KeyS');
  });
});

describe('Boutons de souris', () => {
  it('gauche = principale, droit = secondaire, milieu ignoré', () => {
    expect(mouseButtonIntent(0)).toBe('primary');
    expect(mouseButtonIntent(2)).toBe('secondary');
    expect(mouseButtonIntent(1)).toBe('none');
  });
  it('la compétence secondaire retombe sur l’attaque normale', () => {
    expect(skillForButton({ primary: 'fire_bolt', secondary: 'frost_nova' }, 'secondary')).toBe('frost_nova');
    expect(skillForButton({ primary: 'fire_bolt' }, 'secondary')).toBe('attack');
    expect(skillForButton({ primary: 'fire_bolt' }, 'primary')).toBe('fire_bolt');
  });
});

/* ------------------------------ Controls avec un faux DOM ------------------------------ */

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
  const winHandlers = new Map<string, Handler[]>();
  (globalThis as unknown as { window: unknown }).window = {
    addEventListener: (t: string, f: Handler) => winHandlers.set(t, [...(winHandlers.get(t) ?? []), f]),
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
      toggleBigMap() {},
      bigMapOpen: false,
    },
    {
      get: (t: Record<string | symbol, unknown>, k) => (t[k] ??= fakeEl()),
    },
  );
  const mapper = {
    screenToWorld: (x: number, y: number) => ({ x: g.world.player.x + (x - 640) / 40, y: g.world.player.y + (y - 360) / 40 }),
    worldToScreen: () => ({ x: 0, y: 0 }),
    setAimIndicator() {},
  };
  const c = new Controls(() => g, hud as never, mapper, stage as never);
  c.mode = () => mode;
  const panels: string[] = [];
  c.onPanel = (n) => panels.push(n);
  return { g, c, stage: stage as ReturnType<typeof fakeEl> & { fire: (t: string, e: Record<string, unknown>) => void }, winHandlers, panels, hud };
}

describe('Controls en mode PC', () => {
  beforeEach(() => undefined);

  it('clic droit sur le sol : lance la compétence secondaire vers le curseur', () => {
    const { g, c, stage } = setup('pc');
    stage.fire('pointerdown', { pointerType: 'mouse', button: 2, clientX: 800, clientY: 360, shiftKey: false });
    c.apply();
    expect(g.world.input.cast?.skill).toBe('frost_nova');
  });

  it('clic gauche sur le sol : marche vers le curseur sans lancer de compétence', () => {
    const { g, c, stage } = setup('pc');
    const x0 = g.world.player.x;
    stage.fire('pointerdown', { pointerType: 'mouse', button: 0, clientX: 1000, clientY: 360, shiftKey: false });
    c.apply();
    expect(g.world.input.cast).toBeFalsy();
    expect(g.world.input.moveX !== 0 || g.world.input.moveY !== 0).toBe(true);
    expect(g.world.player.x).toBe(x0);
  });

  it('Maj + clic gauche : attaque sur place, aucun déplacement', () => {
    const { g, c, stage } = setup('pc');
    stage.fire('pointerdown', { pointerType: 'mouse', button: 0, clientX: 1000, clientY: 360, shiftKey: true });
    c.apply();
    expect(g.world.input.cast?.skill).toBe('attack');
    expect(g.world.input.moveX).toBe(0);
    expect(g.world.input.moveY).toBe(0);
  });

  it('clic gauche sur un monstre : attaque avec la compétence principale', () => {
    const { g, c, stage } = setup('pc');
    g.startRun('tristram', 0, 1);
    g.world.spawnGroup(0);
    g.world.input.cast = null;
    const m = g.world.monsters.find((x) => !x.dead && !x.isSummon)!;
    m.x = g.world.player.x + 0.6;
    m.y = g.world.player.y + 0.6;
    const px = 640 + (m.x - g.world.player.x) * 40;
    const py = 360 + (m.y - 0.6 - g.world.player.y) * 40;
    stage.fire('pointerdown', { pointerType: 'mouse', button: 0, clientX: px, clientY: py, shiftKey: false });
    c.apply();
    const cast = g.world.input.cast as { skill: string; targetId: number } | null;
    expect(cast?.skill).toBe('attack');
    expect(cast?.targetId).toBe(m.id);
  });

  it('F1 lance la compétence de l’emplacement 1, 1 boit une potion de vie, I ouvre l’inventaire', () => {
    const { g, c, panels } = setup('pc');
    c.handleKey({ code: 'F1', key: 'F1', cancelable: true, preventDefault() {} } as never);
    expect(g.world.input.cast?.skill).toBe('fire_bolt');
    g.world.input.cast = null;
    c.handleKey({ code: 'Digit1', key: '1', cancelable: true, preventDefault() {} } as never);
    expect(g.world.input.potion).toBe('heal');
    c.handleKey({ code: 'KeyI', key: 'i', cancelable: true, preventDefault() {} } as never);
    c.handleKey({ code: 'Escape', key: 'Escape', cancelable: true, preventDefault() {} } as never);
    expect(panels).toEqual(['inventory', 'settings']);
  });

  it('en mode tactile, les touches PC ne font rien (F1) et le clic de souris ne marche pas', () => {
    const { g, c } = setup('touch');
    c.handleKey({ code: 'F1', key: 'F1', cancelable: true, preventDefault() {} } as never);
    expect(g.world.input.cast).toBeFalsy();
  });
});
