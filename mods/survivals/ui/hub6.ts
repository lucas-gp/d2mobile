/**
 * The Run's hub in six tabs and three panels (lot 295, the owner's note: "a main menu in this style", a picture of a Diablo-like hub with
 * its tabs on top and three framed panels). Each tab shows three panels of the game's own systems, never a new mechanic:
 *
 * | Tab        | Left                         | Centre                    | Right                       |
 * | ---------- | ---------------------------- | ------------------------- | --------------------------- |
 * | Personnage | equipment + charms           | bag (+ temporary pages)   | the runs (act, records)     |
 * | Coffre     | equipment                    | bag                       | shared stash                |
 * | Skills     | equipment                    | the hero's stats          | the class's skill trees     |
 * | Craft      | bag                          | Diablo II's cube crafts   | shared stash                |
 * | Cube       | bag                          | the Horadric Cube         | shared stash                |
 * | Merco      | the hireling's gear (hire)   | bag                       | shared stash                |
 *
 * Every action is a tap (one thumb): a tap on an item selects it and opens its sheet (tooltip and actions of the tab), a long press runs
 * the first action. The panels are drawn with the Diablo II interface's art loaded on the device (`--u-*`: stone panels, gold frames,
 * the items' inventory images); without it, plain dark panels. Side by side when the screen is wide (landscape, an unfolded Fold),
 * stacked in one scrolling column on a phone held upright, the tabs and the run's button under the thumb.
 */
import type { HudCtx } from '../../../src/mods/api';
import {
  BASE_BY_ID,
  CHARM_COLS,
  CHARM_ROWS,
  computeDerived,
  cubeCheck,
  CUBE_COLS,
  CUBE_ROWS,
  INV_COLS,
  INV_ROWS,
  itemIconOf,
  itemName,
  itemSize,
  itemTooltip,
  matCount,
  mercSlots,
  mercType,
  REGISTRIES,
  skillIcon,
  STASH_COLS,
  STASH_ROWS,
  STASH_TABS,
  TREES,
  type Game,
  type Item,
} from '../../../src/mods/sdk';
import { QUALITY_COLOR } from '../sim/loot';
import { ACTS, actUnlocked, entryLevel, isRunMode, lockReason, runZones, BEST_LEVEL } from '../sim/runmode';
import { lootPages, pageToBag, pagesBlockRun, sellFromPages } from '../sim/runloot';
import { equipFromBag } from '../sim/shop';
import { buyBlock, buyRank, FORGE, forgeRank, forgeSpent, nextCost, resetForge } from '../sim/forge';
import { setting } from '../sim/state';
import { openActScreen } from './acts';
import { button, ensureStyle, h } from './dom';
import { leaveButtons } from './menu';
import { gearPower, tierLine } from './sheet';
import { openShop } from './shop';
import { launchRun, pickedRun, recordLines, RESET_TEXT, runLabel, setPicked } from './runhub';

export type HubTab = 'perso' | 'coffre' | 'skills' | 'craft' | 'cube' | 'merco';
export const HUB_TABS: { id: HubTab; label: string }[] = [
  { id: 'perso', label: 'Personnage' },
  { id: 'coffre', label: 'Coffre' },
  { id: 'skills', label: 'Skills' },
  { id: 'craft', label: 'Craft' },
  { id: 'cube', label: 'Cube' },
  { id: 'merco', label: 'Merco' },
];

/** The panels of each tab (the owner's table), left to right */
export type PartId = 'equipment' | 'bag' | 'runs' | 'stash' | 'stats' | 'trees' | 'craft' | 'cube' | 'merc' | 'forge';
export const HUB_LAYOUT: Record<HubTab, [PartId, PartId, PartId]> = {
  perso: ['equipment', 'bag', 'runs'],
  coffre: ['equipment', 'bag', 'stash'],
  // lot 308: the training's permanent ranks in place of the equipment (shown by the Character and Stash tabs)
  skills: ['forge', 'stats', 'trees'],
  craft: ['bag', 'craft', 'stash'],
  cube: ['bag', 'cube', 'stash'],
  merco: ['merc', 'bag', 'stash'],
};

const PART_TITLE: Record<PartId, string> = {
  equipment: 'Équipement',
  bag: 'Inventaire',
  runs: 'Sélection des runs',
  stash: 'Coffre partagé',
  stats: 'Statistiques',
  trees: 'Arbres de compétences',
  craft: 'Artisanat',
  cube: 'Cube horadrique',
  merc: 'Mercenaire',
  forge: 'Entraînement',
};

/** Recipes of the Craft tab: those of Diablo II's Cube that work on one item of the bag (crafts, base upgrades, sockets, rerolls) */
export const CRAFT_CATEGORIES = ['Artisanat', 'Amélioration', 'Châsses', 'Relances'] as const;

/** The hero's equipment on an 8 × 7 grid of cells, as in Diablo II's inventory panel: [slot, column, row, width, height] */
export const EQUIP_LAYOUT: [string, number, number, number, number][] = [
  ['head', 3, 0, 2, 2],
  ['amulet', 5, 1, 1, 1],
  ['mainhand', 0, 1, 2, 4],
  ['body', 3, 2, 2, 3],
  ['offhand', 6, 1, 2, 4],
  ['gloves', 0, 5, 2, 2],
  ['ring1', 2, 5, 1, 1],
  ['belt', 3, 5, 2, 1],
  ['ring2', 5, 5, 1, 1],
  ['boots', 6, 5, 2, 2],
];
/** The hireling's: head, body, weapon, shield (Act V's), as on Diablo II's hireling panel */
const MERC_LAYOUT: Record<string, [number, number, number, number]> = {
  head: [3, 0, 2, 2],
  body: [3, 2, 2, 3],
  mainhand: [0, 1, 2, 4],
  offhand: [6, 1, 2, 4],
  gloves: [0, 5, 2, 2],
  belt: [3, 5, 2, 1],
  boots: [6, 5, 2, 2],
};
const SLOT_LABEL: Record<string, string> = {
  head: 'Tête',
  amulet: 'Amu.',
  mainhand: 'Arme',
  body: 'Torse',
  offhand: 'Bouclier',
  ring1: 'Ann.',
  gloves: 'Gants',
  belt: 'Ceinture',
  ring2: 'Ann.',
  boots: 'Bottes',
};

type Sel =
  | { from: 'inv'; idx: number }
  | { from: 'eq'; slot: string }
  | { from: 'charm'; idx: number }
  | { from: 'stash'; tab: number; idx: number }
  | { from: 'cube'; idx: number }
  | { from: 'merc'; slot: string }
  | { from: 'page'; idx: number };

interface HubState {
  tab: HubTab;
  sel: Sel | null;
  /** page of the stash shown (index in `c.stash`) */
  stashTab: number;
  /** the bag or the temporary pages */
  bagView: 'bag' | 'pages';
  tree: number;
  skill: string | null;
  recipe: string | null;
  craftItem: number | null;
  /** Lot 299: the Craft tab's category shown (one at a time: the list fits its panel) */
  craftCat: number;
  note: string;
  noteOk: boolean;
}
const STATE = new WeakMap<Game, HubState>();
export function hubState(g: Game): HubState {
  let s = STATE.get(g);
  if (!s) {
    s = { tab: 'perso', sel: null, stashTab: -1, bagView: 'bag', tree: 0, skill: null, recipe: null, craftItem: null, craftCat: 0, note: '', noteOk: true };
    STATE.set(g, s);
  }
  return s;
}

/** Pages of the stash the hub shows: the shared ones when the shared stash is attached, else the character's own */
export function stashPages(g: Game): number[] {
  const n = g.character.stash.length;
  const out: number[] = [];
  for (let i = n > STASH_TABS ? STASH_TABS : 0; i < n; i++) out.push(i);
  return out;
}

/** An item's picture: its Diablo II inventory image, coloured by quality */
function itemEl(it: Item, sel: boolean, onTap: () => void, onHold: (() => void) | null, place?: { col: number; row: number; w: number; h: number }): HTMLButtonElement {
  const b = h('button', { cls: `svh-it q-${it.quality}${sel ? ' sel' : ''}`, title: itemName(it), data: { uid: it.uid, base: it.base } });
  b.type = 'button';
  if (place) {
    b.style.gridColumn = `${place.col + 1} / span ${place.w}`;
    b.style.gridRow = `${place.row + 1} / span ${place.h}`;
  }
  b.append(skillIcon(itemIconOf(it)));
  if ((it.qty ?? 1) > 1) b.append(h('span', { cls: 'svh-qty', text: String(it.qty) }));
  hold(b, onTap, onHold);
  return b;
}

/** A tap runs `tap`, a long press (450 ms, the base's `HOLD_MS`) runs `long` */
function hold(el: HTMLElement, tap: () => void, long: (() => void) | null): void {
  let timer = 0;
  let held = false;
  let at: [number, number] = [0, 0];
  const stop = () => {
    clearTimeout(timer);
    timer = 0;
  };
  el.addEventListener('pointerdown', (e) => {
    held = false;
    at = [e.clientX, e.clientY];
    stop();
    if (long)
      timer = window.setTimeout(() => {
        timer = 0;
        held = true;
        long();
      }, 450);
  });
  el.addEventListener('pointermove', (e) => {
    if (timer && Math.hypot(e.clientX - at[0], e.clientY - at[1]) > 8) stop();
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) el.addEventListener(ev, stop);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (held) {
      held = false;
      return;
    }
    tap();
  });
}

/** A grid of cells (`cols` × `rows`) and its items placed by their size */
function gridOf(
  cells: (Item | null)[],
  cols: number,
  rows: number,
  kind: string,
  isSel: (i: number) => boolean,
  tap: (i: number) => void,
  long: (i: number) => (() => void) | null,
  cmax = 38,
): HTMLElement {
  const grid = h('div', { cls: 'svh-grid', data: { grid: kind } });
  grid.style.setProperty('--n', String(cols));
  grid.style.setProperty('--rows', String(rows));
  grid.style.setProperty('--cmax', `${cmax}px`);
  cells.forEach((it, i) => {
    if (!it || i >= cols * rows) return;
    const [w, hh] = itemSize(it);
    grid.append(itemEl(it, isSel(i), () => tap(i), long(i), { col: i % cols, row: Math.floor(i / cols), w: Math.min(w, cols - (i % cols)), h: Math.min(hh, rows - Math.floor(i / cols)) }));
  });
  return grid;
}

const sameSel = (a: Sel | null, b: Sel): boolean => !!a && JSON.stringify(a) === JSON.stringify(b);

/** The hub (Run mode, in town): `redraw` asks the widget to draw it again */
export function hub6(ctx: HudCtx, redraw: () => void): HTMLElement {
  ensureStyle();
  const g = ctx.game;
  const c = g.character;
  const st = hubState(g);
  const pages = stashPages(g);
  if (!pages.includes(st.stashTab)) st.stashTab = pages[0] ?? 0;
  const say = (text: string, ok = true) => {
    st.note = text;
    st.noteOk = ok;
    ctx.host.haptic(ok ? 'tap' : 'fail');
    redraw();
  };
  const pick = (s: Sel | null) => {
    st.sel = s && sameSel(st.sel, s) ? null : s;
    st.note = '';
    redraw();
  };

  /* ---------- actions of a selection, by tab (the first is the long press's) ---------- */
  const sellInv = (idx: number) => {
    const it = c.inventory[idx];
    if (!it) return;
    const price = g.sellPrice(it);
    if (g.sell(idx)) {
      st.sel = null;
      say(`Vendu : ${itemName(it)} · +${price} or`);
    } else say('Impossible', false);
  };
  /** the selected item's name, for the line told after an action */
  let selName = '';
  const act = (label: string, run: () => boolean | string, data: string, cls = ''): HTMLButtonElement => {
    const name = selName;
    const b = button(
      label,
      () => {
        const r = run();
        if (r === true) {
          st.sel = null;
          say(`${label} : ${name}`);
        } else say(typeof r === 'string' ? r : 'Impossible', false);
      },
      cls,
    );
    b.dataset.act = data;
    return b;
  };
  function actionsOf(sel: Sel): { it: Item | null; acts: HTMLButtonElement[] } {
    const tab = st.tab;
    const named = itemAt(sel);
    selName = named ? itemName(named) : '';
    if (sel.from === 'inv') {
      const it = c.inventory[sel.idx] ?? null;
      if (!it) return { it, acts: [] };
      const b = BASE_BY_ID[it.base];
      const acts: HTMLButtonElement[] = [];
      if (tab === 'cube') acts.push(act('Au Cube', () => g.cubeAdd(sel.idx) || 'Plus de place dans le Cube', 'to-cube', 'primary'));
      if (tab === 'craft')
        acts.push(
          button(
            st.recipe ? 'Pour la recette' : 'Choisir une recette',
            () => {
              if (!st.recipe) return say('Choisissez d’abord une recette (panneau du milieu)', false);
              st.craftItem = sel.idx;
              st.sel = null;
              say(`${itemName(it)} : prêt pour la recette`);
            },
            'primary',
          ),
        );
      if (tab === 'merco' && c.merc)
        acts.push(
          act(
            'Au mercenaire',
            () => {
              const r = g.mercEquip(sel.idx);
              return r.ok || (r.reason ?? 'Impossible');
            },
            'to-merc',
            'primary',
          ),
        );
      if (b?.slot && tab !== 'merco') acts.push(act('Équiper', () => equipFromBag(g, sel.idx), 'equip', tab === 'perso' || tab === 'coffre' ? 'primary' : ''));
      if (/charm$/.test(b?.type ?? '') && tab === 'perso') acts.push(act('Activer (charmes)', () => g.stowCharm(sel.idx) || 'Plus de place pour les charmes', 'stow', 'primary'));
      if (tab !== 'perso' && tab !== 'skills') acts.push(act('Au coffre', () => g.stash(sel.idx, st.stashTab) || 'Page du coffre pleine', 'to-stash'));
      const sell = button(`Vendre · ${g.sellPrice(it)} or`, () => sellInv(sel.idx));
      sell.dataset.act = 'sell';
      acts.push(sell);
      return { it, acts };
    }
    if (sel.from === 'eq') {
      const it = c.equipment[sel.slot as keyof typeof c.equipment] ?? null;
      return { it, acts: it ? [act('Retirer', () => g.unequip(sel.slot as never).ok || 'Inventaire plein', 'unequip')] : [] };
    }
    if (sel.from === 'charm') {
      const it = c.charmInv?.[sel.idx] ?? null;
      const sell = it ? button(`Vendre · ${g.sellPrice(it)} or`, () => (g.sellCharm(sel.idx) ? ((st.sel = null), say(`Vendu : ${itemName(it)}`)) : say('Impossible', false))) : null;
      if (sell) sell.dataset.act = 'sell';
      return { it, acts: it ? [act('Au sac', () => g.unstowCharm(sel.idx) || 'Inventaire plein', 'unstow'), ...(sell ? [sell] : [])] : [] };
    }
    if (sel.from === 'stash') {
      const it = c.stash[sel.tab]?.[sel.idx] ?? null;
      return { it, acts: it ? [act('Au sac', () => g.unstash(sel.tab, sel.idx) || 'Inventaire plein', 'unstash', 'primary')] : [] };
    }
    if (sel.from === 'cube') {
      const it = c.cube[sel.idx] ?? null;
      return { it, acts: it ? [act('Reprendre', () => g.cubeRemove(sel.idx) || 'Inventaire plein', 'from-cube', 'primary')] : [] };
    }
    if (sel.from === 'merc') {
      const it = (c.merc?.equipment as Record<string, Item | undefined> | undefined)?.[sel.slot] ?? null;
      return { it, acts: it ? [act('Reprendre', () => g.mercUnequip(sel.slot as never).ok || 'Inventaire plein', 'from-merc', 'primary')] : [] };
    }
    const it = lootPages(c)[sel.idx] ?? null;
    if (!it) return { it, acts: [] };
    const sell = button(`Vendre · ${g.sellPrice(it)} or`, () => {
      st.sel = null;
      say(`Vendu : ${itemName(it)} · +${sellFromPages(g, sel.idx)} or`);
    });
    sell.dataset.act = 'sell';
    return { it, acts: [act('Au sac', () => pageToBag(c, sel.idx) || 'Inventaire plein', 'page-bag', 'primary'), sell] };
  }
  function itemAt(sel: Sel): Item | null {
    if (sel.from === 'inv') return c.inventory[sel.idx] ?? null;
    if (sel.from === 'eq') return c.equipment[sel.slot as keyof typeof c.equipment] ?? null;
    if (sel.from === 'charm') return c.charmInv?.[sel.idx] ?? null;
    if (sel.from === 'stash') return c.stash[sel.tab]?.[sel.idx] ?? null;
    if (sel.from === 'cube') return c.cube[sel.idx] ?? null;
    if (sel.from === 'merc') return (c.merc?.equipment as Record<string, Item | undefined> | undefined)?.[sel.slot] ?? null;
    return lootPages(c)[sel.idx] ?? null;
  }
  /** The long press: the selection's first action at once */
  const mainOf = (sel: Sel) => () => {
    const a = actionsOf(sel).acts[0];
    if (a && !a.disabled) a.click();
  };
  const isSel = (s: Sel) => sameSel(st.sel, s);

  /* ---------- the panels ---------- */
  function equipmentPart(): HTMLElement {
    const grid = h('div', { cls: 'svh-grid svh-eq', data: { grid: 'equipment' } });
    grid.style.setProperty('--n', '8');
    grid.style.setProperty('--rows', '7');
    grid.style.setProperty('--cmax', '34px');
    for (const [slot, col, row, w, hh] of EQUIP_LAYOUT) {
      const it = c.equipment[slot as keyof typeof c.equipment];
      const place = { col, row, w, h: hh };
      if (it) {
        const s: Sel = { from: 'eq', slot };
        const b = itemEl(it, isSel(s), () => pick(s), mainOf(s), place);
        b.classList.add('svh-slot');
        b.dataset.slot = slot;
        grid.append(b);
      } else {
        const e = h('div', { cls: 'svh-slot empty', data: { slot }, text: SLOT_LABEL[slot] });
        e.style.gridColumn = `${col + 1} / span ${w}`;
        e.style.gridRow = `${row + 1} / span ${hh}`;
        grid.append(e);
      }
    }
    const out = h('div', { cls: 'svh-col' }, grid);
    out.append(h('p', { cls: 'svh-line', data: { sv: 'tier' }, text: tierLine(c) }));
    if (st.tab === 'perso') {
      const n = (c.charmInv ?? []).filter(Boolean).length;
      out.append(
        h('div', { cls: 'svh-sub', text: `Charmes actifs : ${n}` }),
        gridOf(
          c.charmInv ?? [],
          CHARM_COLS,
          CHARM_ROWS,
          'charms',
          (i) => isSel({ from: 'charm', idx: i }),
          (i) => pick({ from: 'charm', idx: i }),
          (i) => mainOf({ from: 'charm', idx: i }),
          24,
        ),
      );
    }
    return out;
  }

  function bagPart(): HTMLElement {
    const nPages = lootPages(c).length;
    if (!nPages) st.bagView = 'bag';
    const out = h('div', { cls: 'svh-col' });
    if (nPages) {
      const seg = h('div', { cls: 'svh-seg' });
      for (const [id, label] of [
        ['bag', 'Sac'],
        ['pages', `Pages temporaires (${nPages})`],
      ] as const) {
        const b = button(
          label,
          () => {
            st.bagView = id;
            st.sel = null;
            redraw();
          },
          st.bagView === id ? 'on' : '',
        );
        b.dataset.view = id;
        seg.append(b);
      }
      out.append(seg);
      if (pagesBlockRun(c)) out.append(h('p', { cls: 'svh-line svh-warn', data: { sv: 'pages' }, text: `Pages temporaires pleines : ${nPages} objets. Vendez-en ou rangez-en pour lancer une run.` }));
    }
    if (st.bagView === 'pages') {
      const list = h('div', { cls: 'svh-pages', data: { sv: 'page-list' } });
      lootPages(c).forEach((it, i) => {
        const s: Sel = { from: 'page', idx: i };
        const row = h(
          'div',
          { cls: `svh-prow${isSel(s) ? ' sel' : ''}` },
          itemEl(it, isSel(s), () => pick(s), mainOf(s)),
          h('span', { cls: 'svh-pname', text: itemName(it), style: { color: QUALITY_COLOR[it.quality] ?? '#d8cbb0' } }),
        );
        hold(row, () => pick(s), mainOf(s));
        list.append(row);
      });
      out.append(list);
    } else {
      const recipe = st.tab === 'craft' && st.recipe ? st.recipe : null;
      const grid = gridOf(
        c.inventory,
        INV_COLS,
        INV_ROWS,
        'bag',
        (i) => isSel({ from: 'inv', idx: i }) || (st.tab === 'craft' && st.craftItem === i),
        (i) => pick({ from: 'inv', idx: i }),
        (i) => mainOf({ from: 'inv', idx: i }),
      );
      // the Craft tab: the bag's items the recipe takes lit, the others dimmed
      if (recipe)
        for (const b of grid.querySelectorAll<HTMLElement>('.svh-it')) {
          const i = c.inventory.findIndex((x) => x?.uid === b.dataset.uid);
          const ok = i >= 0 && cubeCheck(c, recipe, [i]).ok;
          b.classList.toggle('fits', ok);
          b.classList.toggle('dim', !ok);
        }
      out.append(grid);
    }
    out.append(h('div', { cls: 'svh-gold', data: { sv: 'gold' } }, h('span', { text: 'Or' }), h('b', { text: String(c.gold) })));
    return out;
  }

  function runsPart(): HTMLElement {
    const sel = pickedRun(g);
    const list = actsList(() => redraw());
    const recs = recordLines(g, sel.act, sel.d);
    // lot 306: the act screen (zones, monsters, timed bosses, loot) from the panel too
    const more = button('Zones et boss des actes', () => openActScreen(ctx, redraw), 'svh-actmore');
    more.dataset.sv = 'act-screen';
    return h(
      'div',
      { cls: 'svh-col' },
      more,
      list,
      h('p', { cls: 'svh-line', text: `Chaque run repart du niveau ${entryLevel(sel.act, sel.d)}, sans compétence · ${runZones(sel.act, sel.d).length} zones, puis le boss de l’acte` }),
      h('p', { cls: 'svh-line', data: { sv: 'reset' }, text: RESET_TEXT }),
      recs.length ? h('div', { cls: 'svh-recs', data: { sv: 'records' } }, ...recs.map((t) => h('span', { text: t }))) : h('p', { cls: 'svh-line', text: 'Aucune run de cet acte pour l’instant.' }),
      h('p', { cls: 'svh-line', text: `Runs jouées : ${c.progression.milestones['survivals:runs'] ?? 0} · meilleur niveau atteint : ${c.progression.milestones[BEST_LEVEL] ?? 1}` }),
    );
  }

  function stashPart(): HTMLElement {
    // one page at a time, ‹ n / N › (twelve shared pages would not fit a row on a phone)
    const k = Math.max(0, pages.indexOf(st.stashTab));
    const go = (d: number) => () => {
      st.stashTab = pages[(k + d + pages.length) % pages.length];
      st.sel = null;
      redraw();
    };
    const prev = button('‹', go(-1), 'svh-step');
    prev.dataset.sv = 'stash-prev';
    const next = button('›', go(1), 'svh-step');
    next.dataset.sv = 'stash-next';
    const count = c.stash[st.stashTab]?.filter(Boolean).length ?? 0;
    const tabs = h(
      'div',
      { cls: 'svh-pager', data: { sv: 'stash-tabs' } },
      prev,
      h('span', { data: { sv: 'stash-page' }, text: `Page ${k + 1} / ${pages.length}${count ? ` · ${count} objets` : ''}` }),
      next,
    );
    const shared = c.stash.length > STASH_TABS;
    const t = st.stashTab;
    return h(
      'div',
      { cls: 'svh-col' },
      tabs,
      gridOf(
        c.stash[t] ?? [],
        STASH_COLS,
        STASH_ROWS,
        'stash',
        (i) => isSel({ from: 'stash', tab: t, idx: i }),
        (i) => pick({ from: 'stash', tab: t, idx: i }),
        (i) => mainOf({ from: 'stash', tab: t, idx: i }),
      ),
      h('p', { cls: 'svh-line', text: shared ? 'Pages partagées entre les personnages du même jeu de règles.' : 'Pages du personnage (le coffre partagé n’est pas chargé).' }),
    );
  }

  function statsPart(): HTMLElement {
    const d = computeDerived(c, 0);
    const attrs: [string, 'str' | 'dex' | 'vit' | 'ene', number][] = [
      ['Force', 'str', d.str],
      ['Dextérité', 'dex', d.dex],
      ['Vitalité', 'vit', d.vit],
      ['Énergie', 'ene', d.ene],
    ];
    const manual = setting(g, 'stats') === 'manual';
    const at = h('div', { cls: 'svh-table', data: { sv: 'attributes' } });
    for (const [label, k, v] of attrs) {
      const plus = c.statPoints > 0 && manual ? button('+', () => (g.allocateStat(k) ? redraw() : say('Impossible', false))) : null;
      if (plus) plus.dataset.stat = k;
      at.append(h('span', { text: label }), h('b', { text: String(Math.round(v)) }), plus ?? h('i'));
    }
    const r = (label: string, v: string) => [h('span', { text: label }), h('b', { text: v })];
    const rows = h(
      'div',
      { cls: 'svh-table two', data: { sv: 'stats' } },
      ...r('Niveau', String(c.level)),
      ...r('Points de vie', String(Math.round(d.lifeMax))),
      ...r('Dégâts de l’arme', `${Math.round(d.weaponDmg[0])}-${Math.round(d.weaponDmg[1])}`),
      ...r('Score d’attaque', String(Math.round(d.attackRating))),
      ...r('Défense', String(Math.round(d.defense))),
      ...r('Blocage', `${d.block} %`),
      ...r('Résistance au feu', `${d.res.fire} %`),
      ...r('Résistance au froid', `${d.res.cold} %`),
      ...r('Résistance à la foudre', `${d.res.light} %`),
      ...r('Résistance au poison', `${d.res.poison} %`),
      ...r('Réduction des dégâts', `${d.dr} % · ${d.drFlat}`),
      ...r('Vitesse d’attaque', `${d.ias} %`),
      ...r('Vitesse d’incantation', `${d.fcr} %`),
      ...r('Vitesse de course', `${d.frw} %`),
      ...r('Découverte d’objets magiques', `${d.mf} %`),
      ...r('Puissance de l’équipement', String(gearPower(c))),
    );
    return h(
      'div',
      { cls: 'svh-col' },
      h('div', { cls: 'svh-sub', text: c.statPoints > 0 ? `Attributs · ${c.statPoints} points` : 'Attributs' }),
      at,
      h('div', { cls: 'svh-sub', text: 'Statistiques' }),
      rows,
    );
  }

  function treesPart(): HTMLElement {
    const trees = Object.entries(TREES)
      .filter(([, t]) => t.cls === c.classId)
      .map(([id, t]) => ({ id, name: t.name }));
    if (st.tree >= trees.length) st.tree = 0;
    const seg = h('div', { cls: 'svh-seg' });
    trees.forEach((t, k) => {
      const b = button(
        t.name,
        () => {
          st.tree = k;
          st.skill = null;
          redraw();
        },
        k === st.tree ? 'on' : '',
      );
      b.dataset.tree = t.id;
      seg.append(b);
    });
    const tree = trees[st.tree];
    const d = computeDerived(c, 0);
    const grid = h('div', { cls: 'svh-tree', data: { sv: 'tree' } });
    const skills = REGISTRIES.skills.all().filter((s) => s.tree === tree?.id);
    for (const s of skills) {
      const pts = c.skills[s.id] ?? 0;
      const lvl = d.skillLevels[s.id] ?? pts;
      const b = h(
        'button',
        { cls: `svh-sk${pts > 0 ? ' learned' : ''}${st.skill === s.id ? ' sel' : ''}`, title: s.name, data: { skill: s.id } },
        skillIcon(s.icon),
        h('span', { cls: 'svh-sklv', text: String(lvl) }),
      );
      b.type = 'button';
      b.style.gridColumn = String(s.col + 1);
      b.style.gridRow = String(s.row);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        st.skill = st.skill === s.id ? null : s.id;
        redraw();
      });
      grid.append(b);
    }
    const sk = st.skill ? REGISTRIES.skills.get(st.skill) : null;
    return h(
      'div',
      { cls: 'svh-col' },
      seg,
      grid,
      sk
        ? h(
            'div',
            { cls: 'svh-skinfo', data: { sv: 'skill-info' } },
            h('b', { text: sk.name }),
            h('span', { text: `Niveau requis ${sk.reqLvl}${sk.prereqs.length ? ` · après ${sk.prereqs.map((p) => REGISTRIES.skills.get(p)?.name ?? p).join(', ')}` : ''}` }),
            h('span', { text: sk.desc }),
          )
        : null,
      h('p', { cls: 'svh-line', text: 'Les compétences se gagnent pendant chaque run, une carte par niveau (arbre en lecture seule ici).' }),
    );
  }

  /**
   * Lot 308: the training's permanent ranks (sim/forge.ts), bought with the character's gold: a row an upgrade (its picture, its name and
   * ranks, the effect now → next, the next rank's price; greyed when the purse cannot pay it), the purse, a reset giving every gold piece
   * back
   */
  function forgePart(): HTMLElement {
    const list = h('div', { cls: 'svh-forge', data: { sv: 'forge' } });
    for (const f of FORGE) {
      const r = forgeRank(c, f.id);
      const cost = nextCost(c, f.id);
      const why = buyBlock(c, f.id);
      const pips = h('span', { cls: 'svh-pips' }, ...f.costs.map((_, k) => h('i', { cls: k < r ? 'on' : '' })));
      const buy = button(
        cost === null ? 'Max' : `${cost} or`,
        () => {
          if (buyRank(c, f.id)) say(`${f.name} : rang ${forgeRank(c, f.id)}`);
          else say(buyBlock(c, f.id) ?? 'Impossible', false);
        },
        cost !== null && !why ? 'primary' : '',
      );
      buy.dataset.forge = f.id;
      buy.disabled = !!why;
      if (why) buy.title = why;
      list.append(
        h(
          'div',
          { cls: `svh-frow${cost === null ? ' max' : why ? ' poor' : ''}`, data: { forgeRow: f.id } },
          h('span', { cls: 'svh-fic' }, skillIcon(itemIconOf({ uid: `forge-${f.id}`, base: f.icon }))),
          h(
            'span',
            { cls: 'svh-ftext' },
            h('span', { cls: 'svh-fname' }, h('b', { text: f.name }), pips),
            // each part on its own (translated one by one): now → next
            h('span', { cls: 'svh-ffx' }, h('span', { text: f.effect(r) }), cost === null ? null : h('span', { cls: 'svh-fnext' }, h('span', { text: ' → ' }), h('span', { text: f.effect(r + 1) }))),
          ),
          buy,
        ),
      );
    }
    const spent = forgeSpent(c);
    const reset = button(
      spent ? `Réinitialiser · +${spent} or` : 'Réinitialiser',
      () => {
        const back = resetForge(c);
        say(back ? `Entraînement réinitialisé : +${back} or` : 'Aucun rang à rendre', back > 0);
      },
      'svh-freset',
    );
    reset.dataset.sv = 'forge-reset';
    reset.disabled = spent === 0;
    return h(
      'div',
      { cls: 'svh-col' },
      h('div', { cls: 'svh-gold', data: { sv: 'forge-gold' } }, h('span', { text: 'Or' }), h('b', { text: String(c.gold) })),
      list,
      reset,
      h('p', { cls: 'svh-line', text: 'Rangs permanents pour chaque run, payés en or. Réinitialiser rend tout l’or dépensé.' }),
    );
  }

  function craftPart(): HTMLElement {
    const recipes = REGISTRIES.cubeRecipes.all().filter((r) => (CRAFT_CATEGORIES as readonly string[]).includes(r.category) && r.items);
    if (st.recipe && !recipes.some((r) => r.id === st.recipe)) st.recipe = null;
    if (st.craftItem !== null && !c.inventory[st.craftItem]) st.craftItem = null;
    // lot 299 (owner: "a compact list of recipes, no scrollbar"): one category at a time (a row of tabs), its recipes in a compact grid,
    // the recipe picked detailed under it
    const cats = CRAFT_CATEGORIES.filter((cat) => recipes.some((r) => r.category === cat));
    const picked = st.recipe ? recipes.find((r) => r.id === st.recipe) : undefined;
    if (picked) st.craftCat = Math.max(0, cats.indexOf(picked.category as (typeof CRAFT_CATEGORIES)[number]));
    if (st.craftCat >= cats.length) st.craftCat = 0;
    const catSeg = h('div', { cls: 'svh-seg svh-cats', data: { sv: 'craft-cats' } });
    cats.forEach((cat, k) => {
      const b = button(
        cat,
        () => {
          st.craftCat = k;
          st.recipe = null;
          st.craftItem = null;
          redraw();
        },
        k === st.craftCat ? 'on' : '',
      );
      b.dataset.cat = cat;
      catSeg.append(b);
    });
    const list = h('div', { cls: 'svh-recipes', data: { sv: 'recipes' } });
    let box: HTMLElement | null = null;
    for (const r of recipes.filter((x) => x.category === cats[st.craftCat])) {
      const on = st.recipe === r.id;
      const b = button(
        r.name,
        () => {
          st.recipe = on ? null : r.id;
          st.craftItem = null;
          redraw();
        },
        `svh-recipe${on ? ' on' : ''}`,
      );
      b.dataset.recipe = r.id;
      list.append(b);
      if (!on) continue;
      const cost = h(
        'div',
        { cls: 'svh-cost' },
        ...r.cost.map((k) => {
          const have = k.ids.reduce((a, id) => a + matCount(c, id), 0);
          const name = k.label ?? k.ids.map((id) => BASE_BY_ID[id]?.name ?? id).join(' ou ');
          return h('span', { cls: have >= k.n ? 'ok' : 'miss', text: `${name} : ${have} / ${k.n}` });
        }),
      );
      const it = st.craftItem !== null ? c.inventory[st.craftItem] : null;
      const check = st.craftItem !== null ? cubeCheck(c, r.id, [st.craftItem]) : null;
      const make = button(
        'Fabriquer',
        () => {
          if (st.craftItem === null) return;
          const res = g.transmute(r.id, [st.craftItem]);
          st.craftItem = null;
          if (res.ok) say(res.item ? `Fabriqué : ${itemName(res.item)}` : (res.note ?? 'Fabriqué'));
          else say(res.reason ?? 'Impossible', false);
        },
        'primary',
      );
      make.dataset.sv = 'craft';
      make.disabled = !check?.ok;
      box = h(
        'div',
        { cls: 'svh-recipe-box', data: { sv: 'recipe' } },
        h('p', { cls: 'svh-line', text: r.desc }),
        cost,
        h('p', { cls: 'svh-line', data: { sv: 'craft-item' }, text: it ? `Objet : ${itemName(it)}` : 'Touchez un objet du sac (à gauche) : ceux que la recette prend sont éclairés.' }),
        check && !check.ok ? h('p', { cls: 'svh-line svh-warn', text: check.reason ?? 'Impossible' }) : null,
        make,
      );
    }
    return h(
      'div',
      { cls: 'svh-col' },
      catSeg,
      list,
      box ?? h('p', { cls: 'svh-line', text: 'Les recettes du Cube horadrique de Diablo II sur un objet : artisanat, amélioration, châsses, relances.' }),
    );
  }

  function cubePart(): HTMLElement {
    const matches = g.cubeMatches();
    const grid = gridOf(
      c.cube,
      CUBE_COLS,
      CUBE_ROWS,
      'cube',
      (i) => isSel({ from: 'cube', idx: i }),
      (i) => pick({ from: 'cube', idx: i }),
      (i) => mainOf({ from: 'cube', idx: i }),
      44,
    );
    const go = h('div', { cls: 'svh-col', data: { sv: 'transmute' } });
    if (matches.length)
      for (const r of matches) {
        const b = button(
          `Transmuter : ${r.name}`,
          () => {
            const res = g.transmuteGrid(r.id);
            if (res.ok) say(res.item ? `Transmuté : ${itemName(res.item)}` : res.material ? `Transmuté : ${BASE_BY_ID[res.material]?.name ?? res.material}` : (res.note ?? 'Transmuté'));
            else say(res.reason ?? 'Impossible', false);
          },
          'primary',
        );
        b.dataset.recipe = r.id;
        go.append(b);
      }
    else go.append(h('p', { cls: 'svh-line', text: c.cube.some(Boolean) ? 'Aucune recette ne correspond au contenu du Cube.' : 'Posez des objets du sac, des runes ou des gemmes dans le Cube.' }));
    // runes, gems and materials of the stash's tab: one unit to the Cube by a tap
    const mats = Object.entries(c.materials)
      .filter(([, n]) => n > 0)
      .sort(([a], [b]) => a.localeCompare(b));
    const box = h('div', { cls: 'svh-mats', data: { sv: 'materials' } });
    for (const [id, n] of mats) {
      const b = h('button', { cls: 'svh-mat', title: BASE_BY_ID[id]?.name ?? id, data: { mat: id } }, skillIcon(itemIconOf({ uid: id, base: id })), h('span', { cls: 'svh-qty', text: String(n) }));
      b.type = 'button';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (g.cubeFromTab(id)) say(`${BASE_BY_ID[id]?.name ?? id} : dans le Cube`);
        else say('Plus de place dans le Cube', false);
      });
      box.append(b);
    }
    return h(
      'div',
      { cls: 'svh-col' },
      h('div', { cls: 'svh-cube' }, grid),
      go,
      h('div', { cls: 'svh-sub', text: mats.length ? 'Runes et gemmes (un toucher : une dans le Cube)' : 'Runes et gemmes : aucune pour l’instant' }),
      box,
    );
  }

  function mercPart(): HTMLElement {
    const m = c.merc;
    const t = mercType(c);
    if (!m || !t) {
      // Diablo II's hirelings (the base's Kashya, Greiz, Asheara, Qual-Kehk), opened by the best level reached in a run
      const list = h('div', { cls: 'svh-col', data: { sv: 'hire' } });
      for (const o of g.mercOffers()) {
        list.append(h('div', { cls: 'svh-sub', text: `${o.type.title} · ${o.cost} or${o.unlocked ? '' : ` · ${o.reason}`}` }));
        const row = h('div', { cls: 'svh-seg' });
        list.append(row);
        for (const v of o.variants) {
          const b = button(
            v.name,
            () => {
              const r = g.hireMerc(o.type.id, v.id);
              if (r.ok) say(`${o.type.name} recrutée : ${g.character.merc?.name ?? ''}`);
              else say(r.reason ?? 'Impossible', false);
            },
            o.unlocked && c.gold >= o.cost ? 'primary' : '',
          );
          b.disabled = !o.unlocked || c.gold < o.cost;
          b.dataset.merc = `${o.type.id}:${v.id}`;
          row.append(b);
        }
      }
      return h('div', { cls: 'svh-col' }, h('p', { cls: 'svh-line', text: 'Aucun mercenaire. Recrutez-en un : il suit le héros dans chaque run et monte de niveau avec lui.' }), list);
    }
    const grid = h('div', { cls: 'svh-grid svh-eq', data: { grid: 'merc' } });
    grid.style.setProperty('--n', '8');
    grid.style.setProperty('--rows', '7');
    grid.style.setProperty('--cmax', '34px');
    for (const slot of mercSlots(t)) {
      const pl = MERC_LAYOUT[slot];
      if (!pl) continue;
      const [col, row, w, hh] = pl;
      const it = (m.equipment as Record<string, Item | undefined>)[slot];
      if (it) {
        const s: Sel = { from: 'merc', slot };
        const b = itemEl(it, isSel(s), () => pick(s), mainOf(s), { col, row, w, h: hh });
        b.classList.add('svh-slot');
        b.dataset.slot = slot;
        grid.append(b);
      } else {
        const e = h('div', { cls: 'svh-slot empty', data: { slot }, text: SLOT_LABEL[slot] });
        e.style.gridColumn = `${col + 1} / span ${w}`;
        e.style.gridRow = `${row + 1} / span ${hh}`;
        grid.append(e);
      }
    }
    const variant = t.variants.find((v) => v.id === m.variant);
    const res = m.dead
      ? button(
          `Ressusciter · ${g.resurrectCost()} or`,
          () => {
            const r = g.resurrectMerc();
            if (r.ok) say(`${m.name} est de retour`);
            else say(r.reason ?? 'Impossible', false);
          },
          'primary',
        )
      : null;
    if (res) res.dataset.sv = 'resurrect';
    return h(
      'div',
      { cls: 'svh-col', data: { sv: 'merc' } },
      h('div', { cls: 'svh-sub', text: `${m.name} · ${t.name}${variant?.name ? ` (${variant.name})` : ''}` }),
      h('p', { cls: 'svh-line', text: m.dead ? 'Mort : à ressusciter avant la prochaine run.' : `Niveau ${c.level} : celui du héros, il monte avec lui pendant la run.` }),
      grid,
      res,
      h('p', { cls: 'svh-line', text: 'Touchez un objet du sac (au milieu) pour le lui donner ; aucun prérequis dans ce mode.' }),
    );
  }

  const PART: Record<PartId, () => HTMLElement> = {
    equipment: equipmentPart,
    bag: bagPart,
    runs: runsPart,
    stash: stashPart,
    stats: statsPart,
    trees: treesPart,
    craft: craftPart,
    cube: cubePart,
    merc: mercPart,
    forge: forgePart,
  };

  /**
   * Lot 305 (owner: "I cannot see how to play Act II next"): every act of Normal, the closed ones greyed with what opens them; a further
   * difficulty's acts once its Act I is open (Baal beaten in the one before), else its Act I alone, greyed. `picked`: after a tap on an
   * open one (it becomes the run the hub starts)
   */
  function actsList(picked: () => void): HTMLElement {
    const sel = pickedRun(g);
    const list = h('div', { cls: 'svh-runs', data: { sv: 'acts' } });
    for (const d of [0, 1, 2]) {
      const acts = d === 0 || actUnlocked(c, 1, d) ? ACTS : ([1] as const);
      for (const act of acts) {
        const why = lockReason(c, act, d);
        const on = !why && act === sel.act && d === sel.d;
        const b = button(
          runLabel(act, d),
          () => {
            setPicked(g, { act, d });
            picked();
          },
          `svh-run${on ? ' on' : ''}${why ? ' locked' : ''}`,
        );
        if (why) {
          b.disabled = true;
          b.append(h('small', { text: why }));
        }
        b.dataset.act = String(act);
        b.dataset.diff = String(d);
        list.append(b);
      }
    }
    return list;
  }

  /* ---------- the frame ---------- */
  const tabs = h('nav', { cls: 'svh-tabs', data: { sv: 'tabs' } });
  for (const t of HUB_TABS) {
    const b = h('button', { cls: `svh-tab${st.tab === t.id ? ' on' : ''}`, data: { tab: t.id } }, tabIcon(g, t.id), h('span', { text: t.label }));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(st.tab === t.id));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (st.tab === t.id) return;
      st.tab = t.id;
      st.sel = null;
      st.note = '';
      redraw();
    });
    tabs.append(b);
  }
  const body = h('div', { cls: 'svh-body' });
  HUB_LAYOUT[st.tab].forEach((part, k) => {
    body.append(
      h('section', { cls: 'svh-panel', data: { pane: ['left', 'center', 'right'][k], part } }, h('header', { cls: 'svh-ph', text: PART_TITLE[part] }), h('div', { cls: 'svh-pc' }, PART[part]())),
    );
  });
  const pick0 = pickedRun(g);
  const blocked = pagesBlockRun(c);
  const play = button(
    'Lancer la run',
    () => {
      // lot 305: the act's maps first when another act than the town's is picked
      void launchRun(ctx, pick0.act, pick0.d);
    },
    'primary sv-play',
  );
  play.append(h('small', { text: runLabel(pick0.act, pick0.d) }));
  play.dataset.sv = 'play';
  play.disabled = blocked;
  const shop = button('Boutique', () => openShop(ctx, 'buy'), 'sv-shop-btn');
  shop.append(h('small', { text: `${c.gold} or` }));
  shop.dataset.sv = 'shop';
  const settings = button('Réglages', () => ctx.host.openPanel?.('settings'), 'svh-gear');
  settings.dataset.panel = 'settings';
  // lot 298 (owner): back to the character list or the home screen from the hub (no run going on: no confirmation)
  const nav = leaveButtons(ctx);
  // lot 305: held upright the acts' list is the Character tab's third panel, far below: a button opens it over the hub; lot 306: the
  // act screen (ui/acts.ts: each act's zones, monsters, timed bosses, loot and records; its button starts the run)
  const actPick = button('Choisir l’acte', () => openActScreen(ctx, redraw), 'svh-actpick');
  actPick.dataset.sv = 'act-pick';
  const bar = h('div', { cls: 'svh-bar' }, shop, play, ctx.host.openPanel ? settings : null, h('div', { cls: 'svh-nav', data: { sv: 'nav' } }, actPick, ...nav));
  const root = h('div', { cls: 'svh', data: { sv: 'run-hub', tab: st.tab } }, tabs, body, bar);
  if (st.note) root.append(h('div', { cls: `svh-note${st.noteOk ? '' : ' bad'}`, data: { sv: 'note' }, text: st.note }));
  if (st.sel) {
    const { it, acts } = actionsOf(st.sel);
    if (!it) st.sel = null;
    else {
      const close = button('✕', () => pick(null), 'svh-x');
      close.title = 'Fermer';
      root.append(
        h(
          'div',
          { cls: 'svh-detail', data: { sv: 'detail' } },
          h('div', { cls: 'svh-dhead' }, h('b', { text: itemName(it), style: { color: QUALITY_COLOR[it.quality] ?? '#e8d8b0' } }), close),
          h('div', { cls: 'svh-tip' }, itemTooltip(it, c)),
          h('div', { cls: 'svh-acts' }, ...acts),
        ),
      );
    }
  }
  return root;
}

/** The tab's picture: Diablo II's inventory images (a cap, a hammer, a helm), the class's first skill, the game's stash and cube icons */
function tabIcon(g: Game, tab: HubTab): HTMLElement {
  const item = (base: string) => skillIcon(itemIconOf({ uid: `tab-${base}`, base }));
  if (tab === 'perso') return item('cap');
  if (tab === 'coffre') return skillIcon('ui_stash');
  if (tab === 'craft') return item('war_hammer');
  if (tab === 'cube') return skillIcon('ui_cube');
  if (tab === 'merco') return item('helm');
  const first = REGISTRIES.skills.all().find((s) => TREES[s.tree]?.cls === g.character.classId && s.row === 1);
  return skillIcon(first?.icon ?? 'ui_skills');
}

/** Is the six-tab hub the one shown (Run mode) */
export const usesHub6 = (g: Game): boolean => isRunMode(g.character);
