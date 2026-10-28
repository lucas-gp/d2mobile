/**
 * Écrans de démarrage de Diablo II (extension) : menu principal, sélection des personnages et création, sur une scène de 800 × 600 mise à l'échelle.
 * Fonds, logo de feu, boutons, feu de camp et animations des personnages viennent des MPQ (tools/d2import/export-ui.ts) ; sans eux, l'écran
 * d'origine du jeu (charselect.ts) reste en place. Les textes sont en français.
 */
import { UI_REQUIRED } from '../../tools/d2import/ui-keys';
import { CLASS_IDS, CLASSES, type ClassId } from '../data/classes';
import type { CharSummary } from '../platform/platform';
import { CREDITS } from './credits';
import { d2Logo, d2Ui, type UiImage } from './d2ui';
import { el } from './dom';
import { charList } from './charlist';
import { clampTop, isDoubleTap, keepVisible, revealTop, selectLayout, type Tap } from './select-core';
import { cleanName, NAME_MAX, type CharChoice } from './charselect-core';
import { listedChars, modMenuButtons, NO_MODS, screenKinds, screenModes, showModeChoice, variantPicker, type ScreenMods } from './charselect-mods';
import { kindOf, modeName, showKindChoice, type ModeKind } from './charselect-core';
import { openD2Import } from './d2import';
import { openSyncDialog, syncButtonLabel } from './sync-ui';
import { DISCORD_URL, SYNC_ENABLED, d2ImportShown } from '../platform/build-flags';
import { bindUpdateButton, MENU_UPDATE_WIDEST } from './update-link';

const STEP_MS = 125; // une image sur deux de l'animation d'origine, jouée à 8 images/s (soit les 16 images/s de l'écran d'origine)

const REDUCED = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Une bande animée posée sur la scène : ancre (pieds) en (x, y) ; `play` enchaîne une animation unique puis une boucle */
class Sprite {
  readonly el = el('div', { cls: 'd2-sprite' });
  private img: UiImage | null = null;
  private start = performance.now();
  private loop = true;
  private next: (() => void) | null = null;
  constructor(
    private readonly sheet: (name: string) => UiImage | null,
    private readonly x: number,
    private readonly y: number,
    private readonly scale = 1,
  ) {}

  play(name: string, loop: boolean, next?: () => void): void {
    const img = this.sheet(name);
    if (!img) return;
    this.img = img;
    this.start = performance.now();
    this.loop = loop;
    this.next = next ?? null;
    const sc = this.scale;
    const s = this.el.style;
    s.width = `${(img.cw ?? img.w) * sc}px`;
    s.height = `${(img.ch ?? img.h) * sc}px`;
    s.left = `${this.x - (img.ax ?? 0) * sc}px`;
    s.top = `${this.y - (img.ay ?? 0) * sc}px`;
    s.backgroundImage = `url("${img.url}")`;
    s.backgroundSize = `${img.w * sc}px ${img.h * sc}px`;
    this.tick(performance.now());
  }

  tick(now: number): boolean {
    const img = this.img;
    if (!img) return true;
    const n = img.frames ?? 1;
    // the system's "reduce motion" (lot 298): the fire and the heroes keep a slower, discreet movement
    let f = Math.floor((now - this.start) / (REDUCED() ? STEP_MS * 2 : STEP_MS));
    if (!this.loop && f >= n) {
      f = n - 1;
      const cb = this.next;
      this.next = null;
      cb?.();
    } else f %= n;
    const cols = img.cols ?? 1;
    const sc = this.scale;
    this.el.style.backgroundPosition = `${-(f % cols) * (img.cw ?? img.w) * sc}px ${-Math.floor(f / cols) * (img.ch ?? img.h) * sc}px`;
    return this.el.isConnected;
  }
}

/** Un personnage de classe : au repos, marche vers le feu quand on le choisit (puis reste debout), recule quand on en choisit un autre */
class Hero extends Sprite {
  private chosen = false;
  constructor(
    readonly cls: ClassId,
    x: number,
    y: number,
    scale: number,
    animate: (s: Sprite) => void,
  ) {
    super((a) => d2Ui(`hero-${cls}-${a}`), x, y, scale);
    this.play('nu1', true);
    animate(this);
  }

  choose(on: boolean): void {
    if (on === this.chosen) return;
    this.chosen = on;
    if (on) this.play('fw', false, () => this.play('nu3', true));
    else this.play('bw', false, () => this.play('nu1', true));
  }
}

const sprites = new Set<Sprite>();
let ticker = 0;
function animate(s: Sprite): void {
  sprites.add(s);
  if (!ticker) ticker = requestAnimationFrame(frame);
}
function frame(now: number): void {
  for (const s of sprites) if (!s.tick(now)) sprites.delete(s);
  ticker = sprites.size ? requestAnimationFrame(frame) : 0;
}

/** Bande animée générique (logo de feu, feu de camp) */
function band(name: string, x: number, y: number, scale = 1): Sprite | null {
  if (!d2Ui(name)) return null;
  const s = new Sprite((a) => (a === 'loop' ? d2Ui(name) : null), x, y, scale);
  s.play('loop', true);
  animate(s);
  return s;
}

/** Diablo II logo, anchored as in the game ((400, 120) on the main menu): still letters, animated fire */
function logoBand(x: number, y: number, scale = 1): Sprite | null {
  if (!d2Logo()) return null;
  const s = new Sprite(() => d2Logo(), x, y, scale);
  s.el.dataset.sprite = 'logo';
  s.play('loop', true);
  animate(s);
  return s;
}

/** Origines D2 des sept personnages sur la scène de création (repère 800 × 600) : l'origine des DC6, les décalages d'image placent le cadre (positions de CreateCharacterScreen de Riiablo) */
const CREATE_ORIGIN: Record<ClassId, [number, number]> = {
  amazon: [179, 355],
  assassin: [269, 360],
  necromancer: [309, 335],
  barbarian: [389, 330],
  sorceress: [504, 340],
  paladin: [584, 360],
  druid: [694, 385],
};
/** Ordre d'empilement d'origine (du fond vers le devant) ; le personnage choisi passe devant */
const CREATE_STACK: ClassId[] = ['barbarian', 'necromancer', 'sorceress', 'assassin', 'paladin', 'amazon', 'druid'];

/**
 * Tap zones of the seven heroes (stage coordinates): one column each, split halfway between the drawn figures' centres (measured on the
 * stage, not their DC6 origins), from above their heads to below their feet. The sprites' frames are much wider than the figures and
 * overlap (the chosen hero is drawn in front): tapping the Barbarian or the Necromancer used to select the Assassin (owner, lot 285).
 */
const CREATE_HIT_X: [ClassId, number][] = [
  ['amazon', 174],
  ['assassin', 241],
  ['necromancer', 305],
  ['barbarian', 393],
  ['sorceress', 492],
  ['paladin', 585],
  ['druid', 697],
];
const CREATE_HIT_Y: [number, number] = [150, 420];

/** Columns of the heroes' tap zones: [class, left, right] in stage coordinates */
export function heroHitColumns(): [ClassId, number, number][] {
  return CREATE_HIT_X.map(([id, x], i) => {
    const prev = CREATE_HIT_X[i - 1]?.[1];
    const next = CREATE_HIT_X[i + 1]?.[1];
    const left = prev === undefined ? x - 50 : (prev + x) / 2;
    const right = next === undefined ? x + 50 : (x + next) / 2;
    return [id, Math.round(left), Math.round(right)];
  });
}

/** Origine D2 du feu de camp (frontend\\fire.dc6) */
const FIRE_AT: [number, number] = [378, 300];

function button(label: string, size: 'wide' | 'medium' | 'short', x: number, y: number, onClick: () => void, extra = ''): HTMLElement {
  const img = d2Ui(`btn-${size}`);
  const b = el('button', { cls: `d2b ${size} ${extra}`, textContent: label, style: { left: `${x}px`, top: `${y}px`, width: `${img?.w ?? 128}px`, height: `${img?.h ?? 35}px` } });
  b.addEventListener('click', onClick);
  return b;
}

function text(cls: string, content: string, x: number, y: number, w: number): HTMLElement {
  return el('div', { cls: `d2t ${cls}`, textContent: content, style: { left: `${x}px`, top: `${y}px`, width: `${w}px` } });
}

/** Small link of the main menu (a `.d2b` control: it goes to the dock in portrait) */
function link(label: string, onClick: () => void, extra = ''): HTMLElement {
  const b = el('button', { cls: `d2b link ${extra}`.trim(), textContent: label, style: { left: '0px', top: '0px', height: `${LINK_H}px` } });
  b.addEventListener('click', onClick);
  return b;
}

/** The game's Discord server, in a new tab */
function discordLink(): HTMLElement {
  return el('a', {
    cls: 'd2b link discord',
    textContent: 'Discord',
    href: DISCORD_URL,
    target: '_blank',
    rel: 'noopener',
    data: { act: 'discord' },
    style: { left: '0px', top: '0px', height: `${LINK_H}px` },
  });
}

const LINK_H = 30;
/** Top-right corner of the links (stage pixels) */
const LINK_TOP = 8;
const LINK_MARGIN = 8;
/** Bottom of the logo band ("Lord of Destruction") on the stage, the title under it, the footer */
const LOGO_BOTTOM = 226;
const MENU_FOOT = 564;
/** Portrait home screen (lot 304): top of the logo's drawing on the stage, its width (kept whole in the screen's width) */
const PM_LOGO_TOP = 10;
const PM_LOGO_W = 360;

/** Width of a link on the stage (15 px small capitals) */
export function linkWidth(label: string): number {
  return Math.max(84, Math.round(label.length * 7.4) + 34);
}

/**
 * Main menu on the 800 × 600 stage (lot 286): the title "Choose a game mode" under the logo band (never over "Lord of Destruction"), the
 * mode buttons 44 px apart (closer if many; 62 px with a few words under each, lot 318), one centred row of links under them, above the footer.
 */
export function menuLayout(buttons: number, linkWidths: readonly number[], tagged = false): { ask: number; play: number[]; linksTop: number; links: [number, number, number][] } {
  const ask = LOGO_BOTTOM + 14;
  const first = ask + 26;
  const lastMax = MENU_FOOT - 10 - 40;
  const gap = tagged ? MENU_TAGGED_STEP : 44;
  const step = buttons > 1 ? Math.min(gap, (lastMax - first) / (buttons - 1)) : gap;
  const play = Array.from({ length: buttons }, (_, i) => Math.round(first + step * i));
  // lot 292d (owner, after another game's home screen): the links are small stone buttons stacked in the top-right corner, beside the logo
  // (x, width, top of each; in portrait they go to the dock with the other buttons)
  const linksTop = LINK_TOP;
  const links = linkWidths.map((w, i): [number, number, number] => [800 - LINK_MARGIN - w, w, LINK_TOP + i * (LINK_H + 4)]);
  return { ask, play, linksTop, links };
}
/** Lot 318: spacing of the home screen's buttons with a few words under each (the words 37 px under the button's top) */
const MENU_TAGGED_STEP = 62;
const MENU_TAG_DY = 37;

export function d2ScreensReady(): boolean {
  return UI_REQUIRED.every((k) => !!d2Ui(k));
}

/**
 * Écrans de démarrage façon Diablo II (menu, sélection, création, crédits) sur une scène 800 × 600 mise à l'échelle ; en portrait, les
 * boutons et le champ du nom passent dans une barre en bas (« dock »). `run` rend le choix du joueur.
 */
class D2CharScreen {
  readonly box = el('div', { cls: 'charselect d2s' });
  readonly stage = el('div', { cls: 'd2stage' });
  readonly dock = el('div', { cls: 'd2dock' });
  /** Portrait: the small link buttons in the top-right corner (lot 292d), above the stage */
  readonly topbar = el('div', { cls: 'd2topbar' });
  /** Décalage vertical de la scène pendant la saisie au clavier tactile */
  shift = 0;
  /** Boutons et champ du nom de l'écran affiché (passent dans le dock en portrait) */
  controls: HTMLElement[] = [];
  docked = false;
  /** Home screen: its title and footer (in the dock with the mode buttons in portrait, lot 304) */
  menuTexts: HTMLElement[] = [];
  /** Lot 318: the few words under a home screen button (they follow it in the portrait dock) → that button */
  menuTags = new Map<HTMLElement, HTMLElement>();
  /** Lot 318: the kind of game picked on the home screen (its modes are shown with a Back button), null: the kinds */
  kind: string | null = null;
  /** Lot 318: Escape on the home screen's second step goes back to the kinds */
  readonly onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || this.view !== 'menu' || !this.kind || this.finished) return;
    e.preventDefault();
    this.showMenu(null, true);
  };
  selected: string | null = null;
  /** First visible row of the character list */
  top = 0;
  /** Screen shown, and the layout of the list when it is shown (redrawn when the layout changes with the window) */
  view: 'menu' | 'list' | 'other' = 'other';
  listLayout: 'stage' | 'compact' | null = null;
  lastTap: Tap | null = null;
  finished = false;
  ro!: ResizeObserver;
  resolve!: (c: CharChoice) => void;

  constructor(
    readonly root: HTMLElement,
    readonly list: () => CharSummary[],
    readonly onDelete: (slot: string) => void,
    readonly mods: ScreenMods = NO_MODS,
  ) {}

  run(): Promise<CharChoice> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.box.append(this.stage);
      this.root.append(this.box);
      // portrait : la scène 800 × 600 reste entière en haut, les boutons et le champ du nom passent dans une barre en bas, à taille tactile
      this.box.append(this.dock, this.topbar);
      this.fit();
      this.ro = new ResizeObserver(() => this.fit());
      this.ro.observe(this.box);
      document.addEventListener('keydown', this.onKey);
      if (this.mods.openList) this.showList();
      else this.showMenu();
    });
  }

  isPortrait(): boolean {
    // lot 304: the home screen in any portrait window (tablet, Fold unfolded too), the other screens on narrow ones
    return this.box.clientHeight > this.box.clientWidth * 1.15 && (this.box.clientWidth < 760 || this.view === 'menu');
  }

  /** Portrait étroit : boutons et champ du nom dans le dock (rangés par ligne puis colonne), sinon à leur place sur la scène */
  layout(): void {
    const want = this.isPortrait() && this.controls.length > 0;
    if (want !== this.docked) {
      this.docked = want;
      if (want) {
        const order = [...this.controls].sort((a, b) => Math.round(Number(a.dataset.t) / 40) - Math.round(Number(b.dataset.t) / 40) || Number(a.dataset.l) - Number(b.dataset.l));
        // the links in the top-right corner (lot 292d), the other controls in the dock
        const isLink = (c: HTMLElement) => c.classList.contains('link');
        this.dock.replaceChildren(...order.filter((c) => !isLink(c) && !c.classList.contains('dockbreak')));
        this.topbar.replaceChildren(...order.filter(isLink));
        for (const c of this.controls) {
          c.style.left = 'auto';
          c.style.top = 'auto';
        }
      } else {
        for (const c of this.controls) {
          c.style.left = `${c.dataset.l}px`;
          c.style.top = `${c.dataset.t}px`;
          this.stage.append(c);
        }
        this.dock.replaceChildren();
        this.topbar.replaceChildren();
      }
    }
    // lot 304: the home screen in portrait, the image over the whole screen; its title and footer go with the mode buttons
    const pm = this.docked && this.view === 'menu';
    this.box.classList.toggle('pmenu', pm);
    for (const t of this.menuTexts) {
      // lot 318: a button's few words right under it in the dock
      const of = this.menuTags.get(t);
      if (pm && of) {
        if (of.nextElementSibling !== t) of.after(t);
        continue;
      }
      const where = pm ? this.dock : this.stage;
      if (t.parentElement === where) continue;
      if (pm && t.classList.contains('sub')) where.prepend(t);
      else where.append(t);
    }
    this.dock.style.display = this.docked ? 'flex' : 'none';
    this.topbar.style.display = this.docked && this.topbar.childElementCount ? 'flex' : 'none';
    this.box.classList.toggle('docked', this.docked);
  }

  /** Mise à l'échelle de la scène dans la place disponible (au-dessus du dock en portrait), décalage pendant la saisie */
  fit(): void {
    if (this.view === 'list' && this.listLayout !== selectLayout(this.box.clientWidth, this.box.clientHeight, matchMedia('(pointer: coarse)').matches)) return this.showList();
    this.layout();
    if (this.box.classList.contains('pmenu')) return this.fitMenuPortrait();
    this.dock.style.bottom = '';
    const availH = this.docked ? Math.max(120, this.box.clientHeight - this.dock.offsetHeight) : this.box.clientHeight;
    const k = Math.min(this.box.clientWidth / 800, availH / 600) || 1;
    this.stage.style.top = `${availH / 2}px`;
    this.stage.style.transform = `translate(-50%, -50%) translateY(${this.docked ? 0 : this.shift}px) scale(${k})`;
  }

  /**
   * Home screen in portrait (lot 304, owner: "the image is not big enough, the buttons misplaced against it"): the stage (image and logo at
   * one scale) as wide as the logo allows, centred under the links' corner, prolonged by the image blurred (style.css); the title and the
   * mode buttons stacked over the image's lower part
   */
  fitMenuPortrait(): void {
    const W = this.box.clientWidth;
    const H = this.box.clientHeight;
    const tb = (this.topbar.childElementCount ? this.topbar.offsetTop + this.topbar.offsetHeight : 0) + 6;
    const dockH = this.dock.offsetHeight;
    // the image as large as the logo allows (its letters and "Expansion Set" are drawn on it: one scale for both), at most the height
    let k = Math.min((W - 12) / PM_LOGO_W, H / 600);
    // the title and the modes under the logo: a smaller image when they do not fit
    k = Math.max(0.3, Math.min(k, (H - tb - 6 - dockH) / (LOGO_BOTTOM - PM_LOGO_TOP)));
    // centred in the height, the logo under the links
    const top = Math.max(tb - PM_LOGO_TOP * k, (H - 600 * k) / 2);
    const logoBottom = top + LOGO_BOTTOM * k;
    // the dock over the image's lower part, under the logo
    const dockBottom = Math.max(logoBottom + 6 + dockH, Math.min(H, top + 600 * k) - 12);
    this.dock.style.bottom = `${Math.max(0, Math.round(H - Math.min(H, dockBottom)))}px`;
    this.stage.style.top = `${top + 300 * k}px`;
    this.stage.style.transform = `translate(-50%, -50%) scale(${k})`;
  }

  /** Ferme l'écran et rend le choix */
  done(c: CharChoice): void {
    if (this.finished) return;
    this.finished = true;
    this.ro.disconnect();
    document.removeEventListener('keydown', this.onKey);
    this.box.remove();
    this.resolve(c);
  }

  /** Affiche un écran : fond `bg` et éléments (boutons et champ du nom repérés comme contrôles du dock) */
  show(bg: string, ...children: (HTMLElement | Sprite | null)[]): void {
    this.shift = 0;
    this.view = 'other';
    this.box.classList.remove('sel-compact');
    for (const v of this.box.querySelectorAll(':scope > .charlist')) v.remove();
    const els = children.filter((c): c is HTMLElement | Sprite => !!c).map((c) => (c instanceof Sprite ? c.el : c));
    this.controls = els.filter((e) => e.classList.contains('d2b') || e.classList.contains('d2namebox') || e.classList.contains('d2variants'));
    for (const c of this.controls) {
      c.dataset.l = String(parseFloat(c.style.left) || 0);
      c.dataset.t = String(parseFloat(c.style.top) || 0);
    }
    this.docked = false;
    this.menuTexts = [];
    this.menuTags = new Map();
    this.dock.replaceChildren();
    this.topbar.replaceChildren();
    this.stage.replaceChildren(el('div', { cls: 'd2bg', style: { backgroundImage: `var(--u-${bg})` } }), ...els);
    this.fit();
  }

  /* ------------------------------ menu principal ------------------------------ */
  /**
   * Home screen. With a choice of modes, one button per mode replaces "Single Player": the mode is asked first. Lot 318 (owner: "two
   * categories, Survivals or Normal, then Diablo II original or Project Diablo 2"): with several kinds of game, the kind first (`kind`
   * null), then the game it is played on, with Back; the same modes, ids and saves. `focus`: the first button takes the keyboard focus.
   */
  showMenu(kind: string | null = null, focus = false): void {
    const modes = screenModes(this.mods);
    const choice = showModeChoice(modes);
    const kinds = screenKinds(this.mods);
    const twoSteps = choice && showKindChoice(kinds);
    const picked = twoSteps && kind ? (kinds.find((k) => k.id === kind) ?? null) : null;
    this.kind = picked?.id ?? null;
    const cur = this.mods.mode;
    const tags: [HTMLElement, HTMLElement][] = [];
    const tagged = (b: HTMLElement, tagline: string | undefined): HTMLElement => {
      if (tagline) tags.push([b, text('mdesc', tagline, 120, 0, 560)]);
      return b;
    };
    const modeButton = (id: string, name: string, description?: string): HTMLElement => {
      const b = button(name, 'wide', 264, 0, () => this.pickMode(id), `main mode${id === cur ? ' cur' : ''}`);
      b.dataset.act = 'mode';
      b.dataset.mode = id;
      if (description) b.title = description;
      return b;
    };
    let play: HTMLElement[];
    if (!choice) play = [button('Un joueur', 'wide', 264, 0, () => this.showList(), 'main')];
    else if (twoSteps && !picked)
      play = kinds.map((k) => {
        const b = button(k.name, 'wide', 264, 0, () => this.pickKind(k), `main mode kind${cur && kindOf(cur) === k.id ? ' cur' : ''}`);
        b.dataset.act = 'modetype';
        b.dataset.type = k.id;
        return tagged(b, k.tagline);
      });
    else if (picked) play = picked.modes.map((m) => tagged(modeButton(m.id, m.name, modes.find((x) => x.id === m.id)?.description), m.tagline));
    else play = modes.map((m) => modeButton(m.id, m.name, m.description));
    const back = picked ? button('Retour', 'medium', 336, 0, () => this.showMenu(null, true), 'modeback') : null;
    if (back) back.dataset.act = 'modeback';
    const steps = back ? [...play, back] : play;
    // lot 286 (owner: "too many options"): the modes first, then one row of small links (sign in, the mods' buttons, credits, Discord)
    const links = [
      ...(SYNC_ENABLED ? [link(syncButtonLabel(), () => void this.syncDialog())] : []),
      ...(d2ImportShown() ? [link('Importer un personnage D2', () => void this.importD2(), 'imp')] : []),
      ...modMenuButtons(
        this.mods,
        this.box,
        () => this.showList(),
        (label, run) => link(label, run),
      ),
      link('Crédits', () => this.showCredits()),
      // lot 290 (owner): check for updates from the home screen (ui/update-link.ts)
      bindUpdateButton(link(MENU_UPDATE_WIDEST, () => undefined, 'upd')),
      discordLink(),
    ];
    const at = menuLayout(
      steps.length,
      links.map((l) => linkWidth(l.dataset.act === 'update' ? MENU_UPDATE_WIDEST : (l.textContent ?? ''))),
      tags.length > 0,
    );
    steps.forEach((b, i) => (b.style.top = `${at.play[i]}px`));
    for (const [b, t] of tags) t.style.top = `${parseFloat(b.style.top) + MENU_TAG_DY}px`;
    links.forEach((l, i) => {
      l.style.left = `${at.links[i][0]}px`;
      l.style.top = `${at.links[i][2]}px`;
      l.style.width = `${at.links[i][1]}px`;
    });
    const title = picked ? `${picked.name} — choisissez le jeu` : 'Choisissez un mode de jeu';
    const ask = choice ? [text('sub', title, 150, at.ask, 500)] : [];
    // in the portrait dock, the links start a line of their own (an empty control, first of their row)
    const brk = el('div', { cls: 'd2b dockbreak', style: { left: '-1px', top: `${at.linksTop}px` } });
    const foot = text('foot', 'D2 Mobile — projet de fans non commercial inspiré de Diablo II', 100, 564, 600);
    const tagEls = tags.map(([, t]) => t);
    this.show('menu-bg', logoBand(400, 120), ...ask, ...steps, ...tagEls, brk, ...links, foot);
    this.view = 'menu';
    this.box.dataset.step = !twoSteps ? 'modes' : picked ? 'game' : 'kind';
    this.menuTexts = [...ask, ...tagEls, foot];
    this.menuTags = new Map(tags.map(([b, t]) => [t, b]));
    this.fit();
    if (focus) (steps.find((b) => b.classList.contains('cur')) ?? steps[0])?.focus({ preventScroll: true });
  }

  /** Lot 318: a kind picked on the home screen: its games (with Back), or its only one straight away */
  pickKind(k: ModeKind): void {
    if (k.modes.length === 1) return this.pickMode(k.modes[0].id);
    this.showMenu(k.id, true);
  }

  /** Mode picked on the main menu: its character list, after a reload when it is not the session's mode */
  pickMode(id: string): void {
    if (this.mods.switchMode?.(id) ?? true) this.showList();
  }

  showCredits(): void {
    const body = el('div', { cls: 'd2credits', textContent: CREDITS });
    this.show(
      'menu-bg',
      logoBand(400, 100, 0.8),
      body,
      button('Retour', 'medium', 336, 540, () => this.showMenu()),
    );
  }

  /** Fenêtre d'import de personnages Diablo II (.d2s) ; revient à la liste si des personnages ont été ajoutés */
  async importD2(): Promise<void> {
    const r = await openD2Import(this.box);
    if (r.changed) this.showList();
  }

  /** Fenêtre de synchronisation (compte) ; à la fermeture, la liste est relue (personnages récupérés) */
  async syncDialog(): Promise<void> {
    await openSyncDialog(this.box);
    this.showList();
  }

  /* ------------------------------ sélection ------------------------------ */
  /** Selection laid out as in the game (charlist.ts): 8 slots in 2 columns, Create New Character, Delete Character, Exit, OK */
  showList(): void {
    const chars = listedChars(this.list(), this.mods);
    if (!chars.length) return this.showCreate(false);
    if (!this.selected || !chars.some((c) => c.slot === this.selected)) this.selected = chars[0].slot;
    this.top = revealTop(
      this.top,
      chars.findIndex((c) => c.slot === this.selected),
      chars.length,
    );
    const layout = selectLayout(this.box.clientWidth, this.box.clientHeight, matchMedia('(pointer: coarse)').matches);
    const modes = screenModes(this.mods);
    const view = charList({
      chars,
      selected: this.selected,
      top: this.top,
      layout,
      art: true,
      problem: (c) => this.mods.problem(c.ruleset),
      card: (c) => this.mods.card?.(c) ?? null,
      mode: showModeChoice(modes) ? modeName(modes, this.mods.mode ?? '') : undefined,
      exit: true,
      on: {
        select: (slot) => {
          const now = performance.now();
          const double = isDoubleTap(this.lastTap, slot, now);
          this.lastTap = double ? null : { slot, t: now };
          const c = chars.find((x) => x.slot === slot);
          if (double && c && !this.mods.problem(c.ruleset)) return this.done({ play: slot });
          if (slot !== this.selected) {
            this.selected = slot;
            this.showList();
          }
        },
        play: (slot) => this.done({ play: slot }),
        create: () => this.showCreate(true),
        remove: (slot) => {
          this.onDelete(slot);
          this.selected = null;
          this.showList();
        },
        exit: () => this.showMenu(),
        scroll: (top) => {
          this.top = clampTop(top, chars.length);
          this.selected = keepVisible(chars, this.selected, this.top);
          this.showList();
        },
      },
    });
    this.listLayout = layout;
    if (layout === 'stage') this.show('select-bg', view);
    else this.showCompact(view);
    this.view = 'list';
  }

  /** Whole-screen layout (touch screens, small windows): the 800 × 600 stage is hidden */
  showCompact(view: HTMLElement): void {
    this.show('select-bg');
    this.box.classList.add('sel-compact');
    this.box.append(view);
  }

  /* ------------------------------ création ------------------------------ */
  /** Création : choix de la classe parmi les héros autour du feu, nom, Créer ; la scène remonte pendant la saisie au clavier tactile */
  showCreate(canBack: boolean): void {
    let cls: ClassId = 'sorceress';
    const heroes = CLASS_IDS.map((id) => new Hero(id, CREATE_ORIGIN[id][0], CREATE_ORIGIN[id][1], 1, animate));
    const stack = () => heroes.forEach((h) => (h.el.style.zIndex = String(h.cls === cls ? 20 : CREATE_STACK.indexOf(h.cls))));
    const title = text('title', '', 100, 18, 600);
    const desc = text('desc', '', 150, 52, 500);
    const input = el('input', { type: 'text', maxLength: NAME_MAX, placeholder: 'Nom du personnage', autocomplete: 'off', spellcheck: false, cls: 'd2input' });
    input.setAttribute('autocapitalize', 'words');
    const err = text('err', '', 200, 536, 400);
    // the game mode's variants (lot 289: Survivals' Run or Campaign), above the name
    const variants = variantPicker(this.mods, 'd2');
    const choose = (id: ClassId) => {
      cls = id;
      heroes.forEach((h) => h.choose(h.cls === id));
      stack();
      title.textContent = CLASSES[id].name;
      desc.textContent = CLASSES[id].desc;
    };
    heroes.forEach((h) => h.el.addEventListener('click', () => choose(h.cls)));
    // tap zones over the heroes (the sprites' frames overlap): one column a hero, in front of the figures and the fire
    const hits = heroHitColumns().map(([id, left, right]) => {
      const b = el('button', {
        cls: 'd2hero-hit',
        style: { left: `${left}px`, top: `${CREATE_HIT_Y[0]}px`, width: `${right - left}px`, height: `${CREATE_HIT_Y[1] - CREATE_HIT_Y[0]}px` },
      });
      b.type = 'button';
      b.dataset.cls = id;
      b.setAttribute('aria-label', CLASSES[id].name);
      b.addEventListener('click', () => choose(id));
      return b;
    });
    const ok = () => {
      const name = cleanName(input.value);
      if (!name) {
        err.textContent = 'Choisissez un nom.';
        input.focus();
        return;
      }
      this.done({ create: { classId: cls, name, ruleset: this.mods.mode ?? '', ...(variants ? { variant: variants.value() } : {}) } });
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') ok();
    });
    // le clavier d'un téléphone recouvre le bas de l'écran : la scène remonte pendant la saisie
    let settle = 0;
    input.addEventListener('focus', () => {
      window.clearTimeout(settle);
      if (this.docked || !matchMedia('(pointer: coarse)').matches) return;
      this.shift = -220 * (this.box.clientHeight / 600);
      this.fit();
    });
    // retour différé : un appui sur « Créer » retire d'abord le focus du champ, et la scène ne doit pas bouger sous le doigt
    input.addEventListener('blur', () => {
      settle = window.setTimeout(() => {
        this.shift = 0;
        this.fit();
      }, 400);
    });
    const fire = band('cs-fire', FIRE_AT[0], FIRE_AT[1], 1);
    if (fire) fire.el.style.zIndex = '10';
    this.show(
      'create-bg',
      fire,
      ...heroes,
      ...hits,
      title,
      desc,
      el('div', { cls: 'd2namebox', style: { left: '300px', top: '558px' } }, input),
      variants ? el('div', { cls: 'd2variants', style: { left: '200px', top: '418px', width: '400px' } }, variants.el) : null,
      err,
      button(canBack ? 'Retour' : 'Quitter', 'medium', 28, 548, () => (canBack ? this.showList() : this.showMenu())),
      button('Créer', 'medium', 644, 548, ok, 'ok'),
      ...(canBack || !SYNC_ENABLED ? [] : [button(syncButtonLabel(), 'medium', 164, 548, () => void this.syncDialog())]),
    );
    choose(cls);
  }
}

export function d2CharacterScreen(root: HTMLElement, list: () => CharSummary[], onDelete: (slot: string) => void, mods: ScreenMods = NO_MODS): Promise<CharChoice> {
  return new D2CharScreen(root, list, onDelete, mods).run();
}
