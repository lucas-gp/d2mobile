/**
 * Character selection laid out as in Diablo II (LoD 1.13c): the selected character's name at the top, eight slots in two columns of four
 * (standing character, name, level and class, difficulty), the selected slot framed, "Create New Character" and "Delete Character" under
 * the frame, "Exit" and "OK" at the bottom; double-click or double-tap plays. Rows of two scroll when there are more than eight characters.
 *
 * Two layouts of the same elements (`select-core.ts` `selectLayout`): `stage`, on the game's 800 × 600 screen at the game's coordinates
 * (mouse, large window), and `compact`, on the whole screen with targets of at least 44 px (touch screens, small windows). The Diablo II
 * art (background, selection frame, buttons, characters) comes from the player's files (`d2Ui`); without it, the same layout is drawn by
 * the style sheet, with the class icons.
 */
import { CLASSES, type ClassId } from '../data/classes';
import { DIFF_NAMES } from '../data/types';
import type { CharSummary } from '../platform/platform';
import { animatedSprite, d2Ui } from './d2ui';
import { el } from './dom';
import { verbatim } from '../i18n';
import { icon } from './icon';
import { scrollInfo, visibleRange, moveSelection, revealTop } from './select-core';

/** Class icon (skill) standing in for the character without the Diablo II art */
export const PORTRAIT: Record<ClassId, string> = {
  sorceress: 'fire_ball',
  druid: 'werewolf',
  barbarian: 'whirlwind',
  paladin: 'blessed_hammer',
  amazon: 'magic_arrow',
  assassin: 'tiger_strike',
  necromancer: 'raise_skeleton',
};

/** Offset from a character's D2 anchor at rest to its feet (x: centre of the body, y: bottom), measured on the DC6 offsets */
export const ANCHOR_TO_FEET: Record<ClassId, [number, number]> = {
  amazon: [-16, 81],
  assassin: [-30, 55],
  barbarian: [4, 52],
  druid: [3, 49],
  necromancer: [-2, 64],
  paladin: [6, 53],
  sorceress: [-17, 54],
};

export interface CharListEvents {
  select(slot: string): void;
  play(slot: string): void;
  create(): void;
  /** Delete after the confirmation */
  remove(slot: string): void;
  exit(): void;
  scroll(top: number): void;
}

export interface CharListOptions {
  /** Characters of the session's mode, most recently played first */
  chars: CharSummary[];
  selected: string | null;
  /** First visible row */
  top: number;
  layout: 'stage' | 'compact';
  /** Diablo II art available */
  art: boolean;
  /** Why a character cannot be played (null: playable) */
  problem(c: CharSummary): string | null;
  /** Name of the mode, under the title (only when the player chose among several) */
  mode?: string;
  /** "Exit" shown (to the main menu or the choice of mode) */
  exit: boolean;
  /** Lot 299: a mode's lines in place of the level and the difficulty (null: the base's) */
  card?(c: CharSummary): string[] | null;
  /** Extra buttons (screen without the Diablo II art: import, sync, mods) */
  extras?: HTMLElement[];
  on: CharListEvents;
}

/** Standing character of a slot: the class's animation from the game's files (animated when selected), else the class icon */
function figure(c: CharSummary, art: boolean, animate: boolean): HTMLElement {
  const fig = el('span', { cls: 'sel-fig' });
  const name = `hero-${c.classId}-nu1`;
  const img = art ? d2Ui(name) : null;
  if (!img) {
    fig.classList.add('noart');
    fig.append(icon(PORTRAIT[c.classId] ?? 'fire_ball'));
    return fig;
  }
  const sp = (animate && animatedSprite(name, 1)) || el('span');
  const [dx, dy] = ANCHOR_TO_FEET[c.classId] ?? [0, 60];
  const fx = (img.ax ?? 0) + dx;
  const fy = (img.ay ?? 0) + dy;
  sp.className = 'sel-sprite';
  const s = sp.style;
  s.width = `${img.cw ?? img.w}px`;
  s.height = `${img.ch ?? img.h}px`;
  s.backgroundImage = `url("${img.url}")`;
  s.backgroundSize = `${img.w}px ${img.h}px`;
  if (!animate) s.backgroundPosition = '0 0';
  // feet at the bottom centre of the slot's figure; the scale follows the slot height (--slot-h, set by the view)
  s.left = `calc(50% - ${fx}px)`;
  s.top = `calc(96% - ${fy}px)`;
  s.transformOrigin = `${fx}px ${fy}px`;
  s.setProperty('--fy', String(fy));
  fig.append(sp);
  return fig;
}

function slotEl(c: CharSummary, o: CharListOptions, at: number): HTMLElement {
  const sel = c.slot === o.selected;
  const problem = o.problem(c);
  const lines = problem ? null : (o.card?.(c) ?? null);
  const b = el(
    'button',
    { cls: `sel-slot ${o.art ? 'd2plate' : 'char'} ${c.classId}${sel ? ' sel' : ''}${problem ? ' off' : ''}`, data: { slot: c.slot, at: String(at) } },
    figure(c, o.art, sel && !problem),
    el(
      'span',
      { cls: 'sel-info' },
      el('b', { cls: 'sel-name', textContent: c.name ? verbatim(c.name) : CLASSES[c.classId]?.name || '' }),
      ...(lines?.length
        ? [el('span', { cls: 'sel-lvl', textContent: lines[0] }), ...lines.slice(1).map((t) => el('span', { cls: 'sel-diff sel-card', textContent: t }))]
        : [
            el('span', { cls: 'sel-lvl' }, el('span', { textContent: `Niveau ${c.level}` }), ' ', el('span', { textContent: CLASSES[c.classId]?.name ?? '' })),
            problem ? el('span', { cls: 'sel-off', textContent: problem }) : el('span', { cls: 'sel-diff', textContent: DIFF_NAMES[c.difficulty as 0 | 1 | 2] ?? '' }),
          ]),
    ),
  );
  b.addEventListener('click', () => o.on.select(c.slot));
  return b;
}

/** `extra`: role class kept from the earlier screens (`ok`, `primary`, `danger`), used by the browser tests */
function btn(label: string, act: string, art: boolean, size: 'tall' | 'medium', run: () => void, disabled = false, extra = ''): HTMLButtonElement {
  const b = el('button', { cls: `${art ? `sel-btn d2b ${size}` : 'sel-btn btn'}${extra ? ` ${extra}` : ''}`, textContent: label, data: { act }, disabled });
  b.addEventListener('click', run);
  return b;
}

/** Confirmation before deleting, as in the game ("Are you sure…?" No / Yes) */
function confirmDelete(view: HTMLElement, c: CharSummary, o: CharListOptions): void {
  view.querySelector('.sel-confirm')?.remove();
  const close = () => box.remove();
  const no = btn('Non', 'confirm-no', o.art, 'medium', close);
  const yes = btn('Oui', 'confirm-yes', o.art, 'medium', () => {
    close();
    o.on.remove(c.slot);
  });
  const box = el(
    'div',
    { cls: 'sel-confirm' },
    el(
      'div',
      { cls: 'sel-confirm-box' },
      el('p', { textContent: `Êtes-vous sûr de vouloir supprimer ${c.name ? verbatim(c.name) : CLASSES[c.classId]?.name || ''} ?` }),
      el('div', { cls: 'sel-confirm-row' }, no, yes),
    ),
  );
  view.append(box);
  no.focus();
}

/** Builds the selection view (`.charlist`); the screen redraws it on each change */
export function charList(o: CharListOptions): HTMLElement {
  const n = o.chars.length;
  const idx = Math.max(
    0,
    o.chars.findIndex((c) => c.slot === o.selected),
  );
  const top = revealTop(o.top, idx, n);
  const [a, b] = visibleRange(top, n);
  const cur = o.chars[idx] ?? null;
  const curProblem = cur ? o.problem(cur) : null;
  const view = el('div', { cls: `charlist ${o.layout}${o.art ? ' art' : ''}` });

  const grid = el('div', { cls: 'sel-grid' }, ...o.chars.slice(a, b).map((c, i) => slotEl(c, o, a + i)));
  const scroll = scrollInfo(top, n);
  const main = el('div', { cls: 'sel-main' }, grid);
  if (scroll) {
    const up = el('button', { cls: 'sel-arrow', textContent: '▲', disabled: !scroll.up, data: { act: 'up' } });
    const down = el('button', { cls: 'sel-arrow', textContent: '▼', disabled: !scroll.down, data: { act: 'down' } });
    up.addEventListener('click', () => o.on.scroll(top - 1));
    down.addEventListener('click', () => o.on.scroll(top + 1));
    main.append(el('div', { cls: 'sel-scroll' }, up, el('span', { cls: 'sel-count', textContent: scroll.label }), down));
    grid.addEventListener('wheel', (e) => {
      e.preventDefault();
      o.on.scroll(top + Math.sign(e.deltaY));
    });
    // vertical swipe on the slots: one row
    let y0: number | null = null;
    grid.addEventListener('touchstart', (e) => (y0 = e.touches[0]?.clientY ?? null), { passive: true });
    grid.addEventListener('touchend', (e) => {
      const y = e.changedTouches[0]?.clientY;
      if (y0 !== null && y !== undefined && Math.abs(y - y0) > 40) o.on.scroll(top + (y < y0 ? 1 : -1));
      y0 = null;
    });
  }

  const title = el(
    'div',
    { cls: 'sel-title' },
    el('div', { cls: 'sel-big', textContent: cur ? cur.name || CLASSES[cur.classId]?.name || '' : '' }),
    ...(o.mode ? [el('div', { cls: 'sel-mode', textContent: o.mode })] : []),
    ...(curProblem ? [el('div', { cls: 'err', textContent: 'Conservé tel quel : il redeviendra jouable avec le mod.' })] : []),
  );

  const bar = el(
    'div',
    { cls: 'sel-bar' },
    btn('Créer un nouveau personnage', 'create', o.art, 'tall', () => o.on.create()),
    btn('Supprimer le personnage', 'delete', o.art, 'tall', () => cur && confirmDelete(view, cur, o), !cur, o.art ? '' : 'danger'),
    ...(o.exit ? [btn('Quitter', 'exit', o.art, 'medium', () => o.on.exit())] : []),
    btn('OK', 'play', o.art, 'medium', () => cur && !curProblem && o.on.play(cur.slot), !cur || !!curProblem, o.art ? 'ok' : 'primary'),
  );
  view.append(title, main, bar, ...(o.extras?.length ? [el('div', { cls: 'sel-extras' }, ...o.extras)] : []));

  // keyboard, as in the game: arrows move the selection, Enter plays, Escape exits (while this view is shown)
  const onKey = (e: KeyboardEvent) => {
    if (!view.isConnected) return document.removeEventListener('keydown', onKey);
    if (view.querySelector('.sel-confirm') || (e.target as HTMLElement | null)?.tagName === 'INPUT') return;
    if (e.key.startsWith('Arrow')) {
      const next = moveSelection(idx, e.key, n);
      if (next !== idx && o.chars[next]) {
        e.preventDefault();
        o.on.select(o.chars[next].slot);
      }
    } else if (e.key === 'Enter' && cur && !curProblem) o.on.play(cur.slot);
    else if (e.key === 'Escape' && o.exit) o.on.exit();
  };
  document.addEventListener('keydown', onKey);

  // characters scaled to the height of a slot (the stage's slots are 93 px; the compact layout measures them)
  if (o.layout === 'stage') view.style.setProperty('--slot-h', '93');
  else if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (!view.isConnected) return ro.disconnect();
      const h = grid.firstElementChild?.clientHeight;
      if (h) view.style.setProperty('--slot-h', String(h));
    });
    ro.observe(grid);
  }
  return view;
}
