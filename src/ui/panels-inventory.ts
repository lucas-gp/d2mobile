/**
 * Panneau Inventaire / Coffre / Marchand : colonne du personnage (équipement, or, sac), volet latéral (coffre ou étal),
 * colonne « Objet » (détail de la sélection) et colonne d'actions. Deux mises en page : grilles CSS, ou art de Diablo II
 * (`d2Panel` non nul) où chaque case est placée à la main aux coordonnées du panneau d'origine.
 * Fonctions extraites de la classe Panels (panels.ts) : l'instance est passée en paramètre (`p`) ou liée à `this`.
 */
import { RULES } from '../mods/rules';
import type { Game } from '../sim/game';
import type { Item } from '../sim/item';
import type { Slot } from '../data/types';
import { BASE_BY_ID } from '../data/items/bases';
import { THROW_PACK } from '../data/throwpotions';
import { POTION_PRICES, vendorPotionTier } from '../data/vendors';
import { cssCellAt, d2CellAt } from './dragdrop';
import { baseOf, itemName } from '../sim/itemstats';
import { isCharm } from '../sim/inventory';
import { canWear, computeDerived, STASH_TABS } from '../sim/character';
import type { DerivedStats } from '../sim/derived';
import { el, fmt } from './dom';
import { itemSize, occupancy, packList, padInventory, INV_BASE_ROWS, repairInventory, INV_COLS, INV_ROWS, STASH_COLS, STASH_ROWS, VENDOR_COLS, VENDOR_ROWS } from '../sim/inventory';
import { compareDeltas, isUpgrade, itemTooltip } from './itemtext';
import { PUBLIC_BUILD } from '../platform/build-flags';
import type { Panels } from './panels';
import { SLOT_FR, D2_EQ_RECT, D2_GRID, STASH_VIEW, d2ItemMinW, d2Layout, d2Panel, d2Place } from './panels-shared';

export type InventoryMode = 'inventory' | 'stash' | 'vendor';

/** Cases d'équipement de la grille CSS (3 colonnes ; null = case vide) */
const EQUIP_ORDER: (Slot | null)[] = ['head', 'amulet', null, 'mainhand', 'body', 'offhand', 'ring1', 'gloves', 'ring2', null, 'belt', 'boots'];

/** Panneau d'inventaire D2 : or et boutons sous le sac (x, y, l, h ; y décalé des rangées du grand inventaire) */
const D2_INV_GOLD: [number, number, number, number] = [107, 392, 88, 18];
const D2_INV_BTN = {
  mats: [208, 383, 50, 20],
  charms: [262, 383, 50, 20],
  cube: [104, 410, 100, 19],
  sort: [208, 410, 104, 19],
} as const;

/** Panneau d'échange D2 (coffre, marchand) : grille de 10 × 10 cases de 29 px à partir de (16, 63) */
const TRADE = { x: 16, y: 63, pitch: 29, rows: 10, frameX: 14, frameW: 292 };
/** Onglets du coffre sur le panneau d'échange : largeur selon la longueur du libellé (« Matériaux », « Cartes (n) » sont les plus longs) */
const TRADE_TAB_W = [52, 42, 42, 52, 38, 56];
const TRADE_TAB_W_DEFAULT = 42;

/** Pages du coffre : une seule rangée de 7 boutons au plus ; au-delà, fenêtre de 5 pages + « ‹ » « › » */
const PAGE_ROW = 7;
const PAGE_WIN = PAGE_ROW - 2;

/** Consommables du marchand (paquets de 4 pour les potions, à l'unité sinon) */
const VENDOR_CONSUMABLES = [
  ['hp_potion', 'Potion de soins'],
  ['mp_potion', 'Potion de mana'],
  ['key', 'Clé (50 or)'],
  ['tome_portal', 'Tome de portail (450 or)'],
] as const;
/** Lot 321: the potions' names by Diablo II tier (Misc.txt hp1-hp5, mp1-mp5) */
const POTION_TIER_NAMES: Record<string, readonly string[]> = {
  hp_potion: ['Potion de soins mineure', 'Potion de soins légère', 'Potion de soins', 'Potion de soins majeure', 'Super potion de soins'],
  mp_potion: ['Potion de mana mineure', 'Potion de mana légère', 'Potion de mana', 'Potion de mana majeure', 'Super potion de mana'],
};
/** Potions de jet vendues par paquets de THROW_PACK au prix de weapons.txt */
const THROW_POTIONS = ['fulminating_potion', 'strangling_gas_potion', 'exploding_potion', 'choking_gas_potion', 'oil_potion', 'rancid_gas_potion'];

/** Boutons sous l'équipement (Runes, Charmes, Cube, Trier) : repositionnés sur l'art D2 */
interface BagButtons {
  mats: HTMLButtonElement;
  charms: HTMLButtonElement;
  cube: HTMLButtonElement;
  sort: HTMLButtonElement;
}

export function inventoryImpl(this: Panels, g: Game, mode: InventoryMode): HTMLElement {
  const c = g.character;
  repairInventory(c);
  const d = computeDerived(c, 0);
  const { left, eqCells, btns } = characterColumn(this, g);
  // grille d'inventaire 10 × 4 (10 × 8 avec le grand inventaire) : toutes les cases existent dans le tableau
  padInventory(c);
  const { grid, invCells } = bagGrid(this, g, d);
  let mid: HTMLElement | null = el('div', { cls: 'col scroll' }, grid);
  if (this.showMaterials) mid.append(this.materialsTab(g));
  if (this.showCharms) mid.append(this.charmsTab(g));
  // panneau d'inventaire de Diablo II : équipement et sac (10 × 4) aux emplacements d'origine
  let left2: HTMLElement = left;
  // largeur de la rangée : inventaire seul (+ infobulle), inventaire + coffre/marchand (+ infobulle), ou inventaire + colonne latérale (gemmes, runes…)
  const twoD2 = mode !== 'inventory' && !(mode === 'stash' && this.stashTab < 0);
  const sideOnly = mode === 'stash' && this.stashTab < 0;
  // mise en page : sac | coffre | objet | actions ; sur écran étroit, un seul volet (Sac ou Coffre) + objet + actions
  const lay = d2Layout(mode, twoD2, sideOnly);
  // grand inventaire : rangées de grille ajoutées sous la grille d'origine, tout ce qui est en dessous descend d'autant
  const dy = (INV_ROWS - INV_BASE_ROWS) * D2_GRID.pitch;
  const pd = d2Panel('panel-inv', lay.mult, lay.rowW, lay.reserve, lay.floor, lay.vres, dy, { at: D2_GRID.y + INV_BASE_ROWS * D2_GRID.pitch, strip: INV_BASE_ROWS * D2_GRID.pitch });
  if (pd) {
    mountOnD2Inventory(this, g, pd.inner, eqCells, invCells, btns, dy);
    left2 = pd.wrap;
    if (this.showMaterials) {
      // la liste des matériaux passe dans la colonne de détails
      mid.remove();
      mid = null;
    } else mid = null;
  }

  // coffre ou marchand
  let side: HTMLElement | null = mode === 'stash' ? stashSide(this, g) : mode === 'vendor' ? vendorSide(this, g) : null;

  // coffre et marchand sur le panneau d'échange de Diablo II (grille 10 colonnes, onglets et titre dans la barre du haut)
  let sideNote: HTMLElement[] = [];
  let sideCount: HTMLElement | null = null;
  // les onglets Runes / Gemmes / Matériaux / Cube ont leur propre mise en page (pas la grille 10 × 10 du coffre)
  const bs = side && mode !== 'inventory' && !(mode === 'stash' && this.stashTab < 0) ? d2Panel('panel-buysell', lay.mult, lay.rowW, lay.reserve, lay.floor, lay.vres) : null;
  if (bs && side) {
    ({ sideNote, sideCount } = mountOnTradePanel(this, g, mode, side, bs.inner));
    side = bs.wrap;
  }
  if (!bs && side) placeSideGridCss(side);

  let leftCol: HTMLElement = left2;
  if (mode === 'stash') {
    // barres de boutons à taille réelle sous les panneaux : « Tout au coffre » sous le Personnage, « Trier » / « Tout trier » sous le Coffre
    leftCol = el('div', { cls: 'col stashcol', style: { flex: 'none' } }, el('div', { cls: 'stashinner' }, left2, ...this.stashBars(g, 'char')));
    if (side && this.stashTab >= 0) side = el('div', { cls: 'col stashcol', style: { flex: 'none' } }, el('div', { cls: 'stashinner' }, side, ...this.stashBars(g, 'chest')));
  }
  leftCol.dataset.zone = 'char';
  if (side) side.dataset.zone = 'chest';
  const info = itemColumn(this, g, mode);
  info.append(...sideNote);
  if (sideCount) info.prepend(sideCount);
  if (pd && this.showMaterials) info.prepend(this.materialsTab(g));
  if (pd && this.showCharms) info.prepend(this.charmsTab(g));
  const title = mode === 'stash' ? 'Coffre' : mode === 'vendor' ? 'Marchand' : 'Inventaire';
  const act = this.actionColumn(g, mode, false);
  const cols: (HTMLElement | null)[] = side ? [leftCol, mid, side, info, act] : [leftCol, mid, info, act];
  return this.frame(title, ...cols.filter((x): x is HTMLElement => !!x));
}

/** Colonne du personnage hors art D2 : équipement (3 colonnes), or, boutons Runes / Charmes / Cube / Trier */
function characterColumn(p: Panels, g: Game): { left: HTMLElement; eqCells: Map<Slot, HTMLElement>; btns: BagButtons } {
  const c = g.character;
  const eq = el('div', { cls: 'grid', style: { gridTemplateColumns: 'repeat(3, auto)' } });
  const eqCells = new Map<Slot, HTMLElement>();
  for (const s of EQUIP_ORDER) {
    if (!s) {
      eq.append(el('div'));
      continue;
    }
    const it = c.equipment[s] ?? null;
    const cell = p.cell(it, p.sel?.from === 'eq' && p.sel.slot === s, () => {
      p.sel = { from: 'eq', slot: s };
      p.filterSlot = s;
      p.render();
    });
    if (!it) cell.append(el('span', { cls: 'slotname', textContent: SLOT_FR[s] }));
    eqCells.set(s, cell);
    p.dd.addSlot(cell, s);
    if (it) p.dd.attach(cell, { kind: 'eq', slot: s });
    eq.append(cell);
  }
  const gold = el('div', { cls: 'statrow' }, el('span', { textContent: 'Or' }), el('b', { textContent: fmt(c.gold) }));
  const mats = el('button', { cls: 'btn', textContent: 'Runes' });
  const cube = el('button', { cls: 'btn', textContent: 'Cube' });
  cube.addEventListener('click', () => {
    p.sel = null;
    p.show('cube');
  });
  mats.addEventListener('click', () => {
    p.sel = null;
    p.showMaterials = !p.showMaterials;
    p.render();
  });
  const charmCount = c.charmInv.filter(Boolean).length;
  const charms = el('button', { cls: `btn${p.showCharms ? ' sel' : ''}`, textContent: `Charmes (${charmCount})` });
  charms.dataset.charms = '1';
  charms.addEventListener('click', () => {
    p.sel = null;
    p.showCharms = !p.showCharms;
    p.render();
  });
  const sort = el('button', { cls: 'btn', textContent: 'Trier' });
  sort.addEventListener('click', () => {
    g.sortInventory();
    p.sel = null;
    p.render();
  });
  const left = el('div', { cls: 'col' }, eq, gold, el('div', { cls: 'tabs' }, mats, charms, cube, sort));
  return { left, eqCells, btns: { mats, charms, cube, sort } };
}

/**
 * Sac en grille CSS : un objet s'étend sur sa taille (w × h), les cases couvertes ne sont pas dessinées.
 * Classes de case : `bad` (non équipable), `upgrade` (meilleur que l'objet porté), `dim` (hors du filtre d'emplacement).
 * `invCells[i]` = case de l'indice i, reprise par le panneau D2.
 */
function bagGrid(p: Panels, g: Game, d: DerivedStats): { grid: HTMLElement; invCells: HTMLElement[] } {
  const c = g.character;
  const grid = el('div', { cls: 'grid', style: { gridTemplateColumns: `repeat(${INV_COLS}, auto)` } });
  const occ = occupancy(c);
  const invCells: HTMLElement[] = [];
  c.inventory.forEach((it, i) => {
    let extra = '';
    if (it) {
      const b = baseOf(it);
      if (b.slot && !canWear(c, it, { str: d.str, dex: d.dex }).ok) extra = 'bad';
      else if (isUpgrade(it, c)) extra = 'upgrade';
      if (p.filterSlot && b.slot && b.slot !== p.filterSlot && !(b.slot === 'ring' && p.filterSlot.startsWith('ring'))) extra += ' dim';
    }
    const cell = p.cell(
      it,
      p.sel?.from === 'inv' && p.sel.idx === i,
      () => {
        p.sel = it ? { from: 'inv', idx: i } : null;
        p.render();
      },
      extra,
    );
    if (extra.includes('dim')) cell.style.opacity = '0.35';
    if (it) {
      p.dd.attach(cell, { kind: 'inv', idx: i });
      cell.dataset.inv = String(i);
    }
    invCells.push(cell);
    if (it) {
      // objet de plusieurs cases : il s'étend sur sa taille D2 (hors panneau D2 où les cases sont placées à la main)
      const [w, h] = itemSize(it);
      cell.style.gridColumn = `span ${Math.min(w, INV_COLS - (i % INV_COLS))}`;
      cell.style.gridRow = `span ${h}`;
      if (w > 1 || h > 1) {
        cell.style.width = 'auto';
        cell.style.height = 'auto';
      }
      grid.append(cell);
    } else if (occ[i] < 0) grid.append(cell);
  });
  p.dd.addGrid({ el: grid, kind: 'inv', cellAt: cssCellAt(grid, INV_COLS, INV_ROWS) });
  return { grid, invCells };
}

/** Pose équipement, objets du sac, or et boutons sur l'art du panneau d'inventaire D2 (`dy` : décalage du grand inventaire) */
function mountOnD2Inventory(p: Panels, g: Game, inner: HTMLElement, eqCells: Map<Slot, HTMLElement>, invCells: HTMLElement[], btns: BagButtons, dy: number): void {
  const c = g.character;
  for (const [s, cell] of eqCells) {
    cell.classList.add('d2cell', 'd2eq');
    d2Place(cell, ...D2_EQ_RECT[s]);
    inner.append(cell);
  }
  // chaque objet occupe w × h cases à partir de sa case en haut à gauche ; les cases vides ne sont pas dessinées (la grille est dans l'image)
  invCells.forEach((cell, i) => {
    const it = c.inventory[i];
    if (!it) return;
    const [w, h] = itemSize(it);
    cell.classList.add('d2cell');
    d2Place(cell, D2_GRID.x + (i % D2_GRID.cols) * D2_GRID.pitch, D2_GRID.y + Math.floor(i / D2_GRID.cols) * D2_GRID.pitch, w * D2_GRID.pitch - 1, h * D2_GRID.pitch - 1);
    inner.append(cell);
  });
  const goldTxt = el('div', { cls: 'd2gold', textContent: fmt(c.gold) });
  const [gx, gy, gw, gh] = D2_INV_GOLD;
  d2Place(goldTxt, gx, gy + dy, gw, gh);
  btns.mats.classList.add('d2small');
  btns.cube.classList.add('d2small');
  btns.sort.classList.add('d2small');
  btns.charms.classList.add('d2small');
  for (const k of ['mats', 'charms', 'cube', 'sort'] as const) {
    const [x, y, w, h] = D2_INV_BTN[k];
    d2Place(btns[k], x, y + dy, w, h);
  }
  inner.append(goldTxt, btns.mats, btns.charms, btns.cube, btns.sort);
  p.dd.addGrid({ el: inner, kind: 'inv', cellAt: d2CellAt(inner, D2_GRID.x, D2_GRID.y, D2_GRID.pitch, INV_COLS, INV_ROWS) });
}

/**
 * Volet du coffre. Onglets : Coffre (unique, partagé par tous les personnages), Gemmes, Matériaux, Runes, Cartes, Guilde ; les pages se
 * choisissent dessous. Sans coffre partagé attaché (module, tests) : pages personnelles. « À vider » n'apparaît que s'il reste des objets
 * dans les anciennes pages personnelles. Corrige `p.stashTab` s'il désigne une page absente.
 */
function stashSide(p: Panels, g: Game): HTMLElement {
  const c = g.character;
  const unified = g.sharedTabs > 0;
  const left = g.personalLeftovers();
  if (unified && p.stashTab >= 0 && p.stashTab < STASH_TABS && !left) p.stashTab = STASH_TABS;
  if (p.stashTab >= c.stash.length) p.stashTab = unified ? STASH_TABS : 0;
  if (PUBLIC_BUILD && p.stashTab === STASH_VIEW.guild) p.stashTab = unified ? STASH_TABS : 0;
  const shared = unified && p.stashTab >= STASH_TABS;
  const tabs = stashTopTabs(p, g, unified, left, shared);
  const pages = stashPageButtons(p, g, unified, shared);
  if (p.stashTab < 0) {
    const body =
      p.stashTab === STASH_VIEW.runes
        ? p.resourceTab(g, 'runes')
        : p.stashTab === STASH_VIEW.gems
          ? p.resourceTab(g, 'gems')
          : p.stashTab === STASH_VIEW.mats
            ? p.resourceTab(g, 'mats')
            : p.stashTab === STASH_VIEW.maps
              ? p.mapStashTab(g)
              : p.stashTab === STASH_VIEW.guild
                ? p.guildTabView(g)
                : p.cubeGridView(g, false);
    tabs.classList.add('stashtabs');
    return el('div', { cls: 'col scroll', style: { flex: '3', minWidth: '0' } }, tabs, body);
  }
  // objets du coffre rangés dans la grille 10 × 8 selon leur taille (chaque objet à l'indice de sa case en haut à gauche)
  const sg = el('div', { cls: 'grid sidegrid', style: { gridTemplateColumns: `repeat(${STASH_COLS}, auto)` }, data: { rows: String(STASH_ROWS) } });
  c.stash[p.stashTab].forEach((it, i) => {
    if (!it || i >= STASH_COLS * STASH_ROWS) return;
    const [w, h] = itemSize(it);
    const cell = p.cell(it, p.sel?.from === 'stash' && p.sel.tab === p.stashTab && p.sel.idx === i, () => {
      p.sel = { from: 'stash', tab: p.stashTab, idx: i };
      p.render();
    });
    p.dd.attach(cell, { kind: 'stash', tab: p.stashTab, idx: i });
    cell.classList.add('scell');
    cell.dataset.sidx = String(i);
    cell.dataset.stab = String(p.stashTab);
    setPackedPos(cell, i % STASH_COLS, Math.floor(i / STASH_COLS), w, h);
    sg.append(cell);
  });
  p.dd.addGrid({ el: sg, kind: 'stash', tab: p.stashTab, cellAt: cssCellAt(sg, STASH_COLS, STASH_ROWS) });
  const note =
    p.stashTab >= STASH_TABS
      ? el('div', { cls: 'base', textContent: 'Coffre unique : commun à tous tes personnages.' })
      : unified
        ? el('div', { cls: 'base', textContent: 'Anciennes pages personnelles : déplace ces objets dans le coffre (il est plein).' })
        : null;
  return el('div', { cls: 'col scroll' }, tabs, note, pages, ...p.stashSearchBox(g), sg);
}

/** Onglets du haut du coffre (Coffre, Gemmes, Matériaux, Runes, Cartes, Guilde hors version publique, À vider) */
function stashTopTabs(p: Panels, g: Game, unified: boolean, left: number, shared: boolean): HTMLElement {
  const c = g.character;
  const tabs = el('div', { cls: 'tabs stashtop' });
  const top: [number, string, boolean][] = [
    unified ? [STASH_TABS, 'Coffre', shared] : [p.stashTab >= 0 ? p.stashTab : 0, 'Coffre', p.stashTab >= 0],
    [STASH_VIEW.gems, 'Gemmes', p.stashTab === STASH_VIEW.gems],
    [STASH_VIEW.mats, 'Matériaux', p.stashTab === STASH_VIEW.mats],
    [STASH_VIEW.runes, 'Runes', p.stashTab === STASH_VIEW.runes],
    [STASH_VIEW.maps, `Cartes (${c.mapStash?.length ?? 0})`, p.stashTab === STASH_VIEW.maps],
    ...(PUBLIC_BUILD ? [] : ([[STASH_VIEW.guild, 'Guilde', p.stashTab === STASH_VIEW.guild]] as [number, string, boolean][])),
  ];
  if (unified && left) top.push([0, `À vider (${left})`, p.stashTab >= 0 && !shared]);
  for (const [t, label, on] of top) {
    const b = el('button', { cls: `btn${on ? ' sel' : ''}`, textContent: label, data: { testid: `stash-top-${label.split(' ')[0].toLowerCase()}` } });
    b.addEventListener('click', () => {
      p.stashTab = t;
      p.sel = null;
      p.resSel = null;
      p.render();
    });
    tabs.append(b);
  }
  return tabs;
}

/** Boutons des pages du coffre visibles (partagées ou personnelles), par fenêtre de PAGE_WIN au-delà de PAGE_ROW pages */
function stashPageButtons(p: Panels, g: Game, unified: boolean, shared: boolean): HTMLElement {
  const c = g.character;
  const pages = el('div', { cls: 'tabs stashpages' });
  const visPages: number[] = [];
  for (let t = 0; t < c.stash.length; t++) {
    if (unified && t >= STASH_TABS !== shared) continue;
    visPages.push(t);
  }
  let winStart = 0;
  let shown = visPages;
  if (visPages.length > PAGE_ROW) {
    const cur = Math.max(0, visPages.indexOf(p.stashTab));
    winStart = Math.floor(cur / PAGE_WIN) * PAGE_WIN;
    shown = visPages.slice(winStart, winStart + PAGE_WIN);
  }
  const goPage = (t: number): void => {
    p.stashTab = t;
    p.sel = null;
    p.resSel = null;
    p.render();
  };
  if (visPages.length > PAGE_ROW) {
    const prev = el('button', { cls: 'btn', textContent: '‹', data: { testid: 'stash-page-prev' } });
    if (winStart <= 0) prev.disabled = true;
    else prev.addEventListener('click', () => goPage(visPages[winStart - PAGE_WIN]));
    pages.append(prev);
  }
  for (const t of shown) {
    const b = el('button', { cls: `btn${t === p.stashTab ? ' sel' : ''}`, textContent: unified && shared ? String(t - STASH_TABS + 1) : String(t + 1), data: { testid: `stash-page-${t}` } });
    b.addEventListener('click', () => goPage(t));
    pages.append(b);
  }
  if (visPages.length > PAGE_ROW) {
    const next = el('button', { cls: 'btn', textContent: '›', data: { testid: 'stash-page-next' } });
    if (winStart + PAGE_WIN >= visPages.length) next.disabled = true;
    else next.addEventListener('click', () => goPage(visPages[winStart + PAGE_WIN]));
    pages.append(next);
  }
  return pages;
}

/** Position d'une case dans une grille « rangée » (data-col/row/w/h), lue ensuite par le panneau D2 ou la grille CSS */
function setPackedPos(cell: HTMLElement, col: number, row: number, w: number, h: number): void {
  cell.dataset.col = String(col);
  cell.dataset.row = String(row);
  cell.dataset.w = String(w);
  cell.dataset.h = String(h);
}

/** Étal ou rachat du marchand rangé dans la grille 10 × 10 selon la taille des objets */
function shelfGrid(p: Panels, entries: { item: Item }[], from: 'vendor' | 'back'): HTMLElement {
  const grid = el('div', { cls: 'grid sidegrid', style: { gridTemplateColumns: `repeat(${VENDOR_COLS}, auto)` }, data: { rows: String(VENDOR_ROWS) } });
  const packed = packList(
    entries.map((v) => v.item),
    VENDOR_COLS,
    VENDOR_ROWS,
  );
  entries.forEach((v, i) => {
    const pos = packed[i];
    if (!pos) return;
    const cell = p.cell(v.item, p.sel?.from === from && p.sel.idx === i, () => {
      p.sel = { from, idx: i };
      p.render();
    });
    setPackedPos(cell, pos.col, pos.row, pos.w, pos.h);
    grid.append(cell);
  });
  return grid;
}

/** Volet du marchand : services (consommables, potions de jet, jeu d'argent, réparation, vente groupée), onglets Acheter / Racheter, étal */
function vendorSide(p: Panels, g: Game): HTMLElement {
  const vg = shelfGrid(p, g.vendor, 'vendor');
  const pots = vendorServices(p, g);
  // onglets Acheter / Racheter (le rachat rend un objet vendu par erreur, au prix de vente)
  const vtabs = el('div', { cls: 'tabs' });
  for (const [id, label] of [
    ['buy', 'Acheter'],
    ['back', `Racheter (${g.buyback.length})`],
  ] as const) {
    const tb = el('button', { cls: `btn${p.vendorTab === id ? ' primary' : ''}`, textContent: label });
    tb.addEventListener('click', () => {
      p.vendorTab = id;
      p.sel = null;
      p.render();
    });
    vtabs.append(tb);
  }
  let shelf: HTMLElement = vg;
  if (p.vendorTab === 'back') {
    const bg = shelfGrid(p, g.buyback, 'back');
    shelf = el('div', { cls: 'col' }, g.buyback.length ? null : el('div', { cls: 'base', textContent: 'Rien à racheter : les objets que tu vends apparaissent ici.' }), bg);
  }
  return el('div', { cls: 'col scroll' }, el('div', { cls: 'lvl', textContent: vendorTitle(p, g) }), pots, vtabs, shelf);
}

/** Lot 321: the trading NPC's name (src/data/vendors.ts), « Marchand » for the generic stall */
function vendorTitle(p: Panels, g: Game): string {
  return g.vendorDef(p.npc)?.name ?? 'Marchand';
}

/** Rangée de services du marchand */
function vendorServices(p: Panels, g: Game): HTMLElement {
  const pots = el('div', { cls: 'tabs' });
  // lot 321: what this NPC sells, gambles or repairs in Diablo II (src/data/vendors.ts); the generic stall (no NPC) keeps every service
  const def = g.vendorDef(p.npc);
  const potTier = vendorPotionTier(def, g.difficulty);
  const sells = (id: string): boolean => !def || (id === 'key' ? !!def.keys : id === 'tome_portal' ? !!def.tome : id === 'hp_potion' || id === 'mp_potion' ? potTier !== null : !!def.throwPotions);
  for (const [id, label] of VENDOR_CONSUMABLES) {
    // a game mode may sell none (rule `shop.consumable`: Survivals, no potion nor key)
    if (!RULES['shop.consumable'](g, id) || !sells(id)) continue;
    const single = id === 'key' || id === 'tome_portal';
    // an NPC's potions: their Diablo II name and price (Minor … Super, Misc.txt)
    const text = potTier !== null && !single ? `${POTION_TIER_NAMES[id][potTier]} ×4 (${fmt(POTION_PRICES[id as 'hp_potion' | 'mp_potion'][potTier] * 4)} or)` : single ? label : `${label} ×4`;
    const b = el('button', { cls: 'btn', textContent: text });
    b.addEventListener('click', () => {
      const r = g.buyConsumable(id, single ? 1 : 4, p.npc);
      if (!r.ok) p.host.haptic('fail');
      p.render();
    });
    pots.append(b);
  }
  for (const id of THROW_POTIONS) {
    if (!RULES['shop.consumable'](g, id) || !sells(id)) continue;
    const tb = BASE_BY_ID[id];
    const b = el('button', { cls: 'btn', textContent: `${tb.name} ×5 (${fmt(tb.price * 5)} or)`, data: { testid: `buy-${id}` } });
    b.addEventListener('click', () => {
      const r = g.buyConsumable(id, THROW_PACK);
      if (!r.ok) {
        p.host.haptic('fail');
        p.host.message(r.reason ?? 'Impossible', '#d66');
      }
      p.render();
    });
    pots.append(b);
  }
  // jeu d'argent : objets inconnus à prix fixe (lot 321 : chez Gheed, Elzix, Alkor, Jamella et Anya seulement)
  const gamb = el('div', { cls: 'tabs', style: { flexWrap: 'wrap' } }, el('div', { cls: 'base', textContent: 'Jeu d’argent (objet inconnu)', style: { width: '100%' } }));
  if (!def || def.gamble)
    g.gambleStock.forEach((e, i) => {
      const b = BASE_BY_ID[e.base];
      const btn = el('button', { cls: 'btn', textContent: `${b?.name ?? e.base} — ${fmt(e.price)} or` });
      btn.addEventListener('click', () => {
        const r = g.gamble(i);
        if (!r.ok) p.host.message(r.reason ?? 'Impossible', '#d66');
        else {
          p.host.message(`Révélé : ${itemName(r.item!)}`, '#e8b04a');
          p.host.haptic('tap');
        }
        p.render();
      });
      gamb.append(btn);
    });
  if (!def || def.gamble) pots.append(gamb);
  // réparation (lot 321 : chez les forgerons, Charsi, Fara, Hratli, Halbu et Larzuk)
  if (def && !def.repair) {
    pots.append(sellAllButton(p, g));
    return pots;
  }
  const quote = g.repairQuote();
  const repair = el('button', { cls: 'btn', textContent: quote > 0 ? `Réparer l'équipement (${fmt(quote)} or)` : 'Équipement intact' });
  repair.disabled = quote <= 0;
  repair.addEventListener('click', () => {
    if (g.repairEquipment()) p.host.haptic('tap');
    else p.host.message('Pas assez d’or pour réparer.', '#d66');
    p.render();
  });
  pots.append(repair, sellAllButton(p, g));
  return pots;
}

/** « Vendre les objets ordinaires » (tout marchand achète) */
function sellAllButton(p: Panels, g: Game): HTMLElement {
  const sellAll = el('button', { cls: 'btn', textContent: 'Vendre les objets ordinaires' });
  sellAll.addEventListener('click', () => {
    const list = g.sellCommonList();
    if (!list.length) {
      p.host.haptic('fail');
      return;
    }
    // confirmation : la vente groupée est en un seul appui (les objets vendus restent rachetables dans l'onglet « Racheter »)
    const gold = list.reduce((a, e) => a + g.sellPrice(e.item), 0);
    if (!confirm(`Vendre ${list.length} objet(s) ordinaire(s) pour ${fmt(gold)} or ? (rachetables dans l’onglet « Racheter »)`)) return;
    const r = g.sellCommon();
    if (r.count) p.host.message(`${r.count} objet(s) vendu(s) : +${fmt(r.gold)} or`, '#e8b04a');
    p.render();
  });
  return sellAll;
}

/**
 * Déplace le contenu du volet (coffre ou étal) sur l'art du panneau d'échange D2 : cases rangées, rangées inutilisées voilées, titre,
 * onglets et pages du coffre, recherche. Rend les notes et le compteur à reporter dans la colonne « Objet ».
 */
function mountOnTradePanel(p: Panels, g: Game, mode: InventoryMode, side: HTMLElement, inner: HTMLElement): { sideNote: HTMLElement[]; sideCount: HTMLElement | null } {
  let sideNote: HTMLElement[] = [];
  let sideCount: HTMLElement | null = null;
  const grid2 = side.querySelector('.sidegrid');
  const cells = grid2 ? Array.from(grid2.children) : [];
  cells.forEach((cell) => {
    const n = cell as HTMLElement;
    const col = Number(n.dataset.col);
    const row = Number(n.dataset.row);
    const w = Number(n.dataset.w);
    const h = Number(n.dataset.h);
    n.classList.add('d2cell');
    d2Place(n, TRADE.x + col * TRADE.pitch, TRADE.y + row * TRADE.pitch, w * TRADE.pitch - 1, h * TRADE.pitch - 1);
    inner.append(n);
  });
  // le panneau d'échange a 10 × 10 cases : les rangées au-delà de celles du coffre sont voilées
  const usedRows = Number((grid2 as HTMLElement | null)?.dataset.rows ?? TRADE.rows);
  if (usedRows < TRADE.rows) {
    const lock = el('div', { cls: 'd2lock' });
    d2Place(lock, TRADE.frameX, TRADE.y + usedRows * TRADE.pitch, TRADE.frameW, (TRADE.rows - usedRows) * TRADE.pitch - 1);
    inner.append(lock);
  }
  const title = el('div', { cls: 'd2txt name', textContent: mode === 'stash' ? 'Coffre' : vendorTitle(p, g) });
  d2Place(title, 8, 2, 300, 26);
  title.style.lineHeight = '26px';
  title.style.fontSize = '14px';
  inner.append(title);
  const tabRow = side.querySelector('.tabs');
  if (mode === 'stash' && tabRow) {
    // six onglets dans les 292 px du cadre
    let tx = TRADE.frameX;
    Array.from(tabRow.children).forEach((b, i) => {
      const n = b as HTMLElement;
      n.classList.add('d2small');
      n.style.fontSize = '10px';
      n.style.whiteSpace = 'nowrap';
      d2Place(n, tx, 33, TRADE_TAB_W[i] ?? TRADE_TAB_W_DEFAULT, 22);
      tx += (TRADE_TAB_W[i] ?? TRADE_TAB_W_DEFAULT) + 2;
      inner.append(n);
    });
    // pages du coffre : sur les deux rangées voilées du bas
    side.querySelectorAll('.stashpages .btn').forEach((b, i) => {
      const n = b as HTMLElement;
      n.classList.add('d2small');
      d2Place(n, TRADE.frameX + i * 38, 322, 36, 22);
      inner.append(n);
    });
    // recherche : sur la rangée voilée au-dessus des pages ; liste et filtres recouvrent la grille
    const sb = side.querySelector<HTMLElement>('.stashsearch');
    if (sb) {
      sb.classList.add('d2abs');
      d2Place(sb, TRADE.frameX, 297, TRADE.frameW, 23);
      inner.append(sb);
    }
    const ov = side.querySelector<HTMLElement>('.stashres');
    if (ov) {
      ov.classList.add('d2abs');
      d2Place(ov, TRADE.frameX, TRADE.y, TRADE.frameW, 232);
      inner.append(ov);
    }
    sideCount = side.querySelector<HTMLElement>('.stashcount');
  } else if (tabRow) sideNote = Array.from(side.querySelectorAll<HTMLElement>(':scope > .tabs')).reverse();
  const note = side.querySelector('.base');
  if (note) sideNote.push(note as HTMLElement);
  if (mode === 'stash' && p.stashTab >= 0) p.dd.addGrid({ el: inner, kind: 'stash', tab: p.stashTab, cellAt: d2CellAt(inner, TRADE.x, TRADE.y, TRADE.pitch, STASH_COLS, STASH_ROWS) });
  return { sideNote, sideCount };
}

/** Sans l'art D2 : même rangement que le panneau d'échange, en grille CSS */
function placeSideGridCss(side: HTMLElement): void {
  for (const n of Array.from(side.querySelectorAll<HTMLElement>('.sidegrid[data-rows] > *'))) {
    n.style.gridColumn = `${Number(n.dataset.col) + 1} / span ${n.dataset.w}`;
    n.style.gridRow = `${Number(n.dataset.row) + 1} / span ${n.dataset.h}`;
    n.style.width = 'auto';
    n.style.height = 'auto';
  }
}

/** Onglet du coffre dont le détail est une ressource empilée (runes, gemmes, matériaux, cube) plutôt qu'un objet */
function resourceView(p: Panels, mode: InventoryMode): boolean {
  return mode === 'stash' && p.stashTab < 0 && p.stashTab !== STASH_VIEW.maps && p.stashTab !== STASH_VIEW.guild && p.stashTab !== STASH_VIEW.cube;
}

/** Colonne « Objet » : détail de l'objet choisi (comparaison avec l'équipement porté), de la ressource choisie, ou aide ; emplacement fixe */
function itemColumn(p: Panels, g: Game, mode: InventoryMode): HTMLElement {
  const c = g.character;
  const info = el('div', { cls: 'col scroll itemcol', data: { zone: 'item' }, style: { flex: '1 1 0', minWidth: `${d2ItemMinW()}px` } });
  const it = p.selectedItem(g);
  const res = !it && resourceView(p, mode) ? p.resSel : null;
  if (it) {
    info.append(itemTooltip(it, c));
    const b = baseOf(it);
    if (p.sel?.from === 'inv' && isCharm(it)) info.append(el('div', { cls: 'base', textContent: 'Dans le sac, ce charme est inactif : rangez-le dans les charmes.' }));
    // comparaison avec l'équipement porté
    if (b.slot && p.sel?.from !== 'eq') {
      const deltas = compareDeltas(it, c);
      if (deltas.length) {
        const cmp = el('div', { cls: 'tip' }, el('div', { cls: 'base', textContent: "Si vous l'équipez :" }));
        for (const x of deltas) cmp.append(el('div', { cls: `delta ${x.delta > 0 ? 'up' : 'down'}`, textContent: `${x.label} ${x.delta > 0 ? '+' : ''}${x.delta}${x.unit}` }));
        info.append(cmp);
      }
      const slot = b.slot === 'ring' ? 'ring1' : b.slot;
      const worn = c.equipment[slot as Slot];
      if (worn) info.append(el('div', { cls: 'base', textContent: 'Porté actuellement :' }), itemTooltip(worn, c));
    }
  } else if (res) {
    info.append(p.resourceDetail(g, res));
  } else {
    info.append(
      el('div', {
        cls: 'tip itemhint',
        textContent:
          mode === 'vendor'
            ? "Touchez un objet pour l'acheter ou le vendre."
            : mode === 'stash'
              ? 'Touchez un objet du sac, du coffre ou porté : son détail s’affiche ici, ses actions à droite. Double-toucher (ou clic droit) : déposer, prendre ou équiper.'
              : "Touchez un objet pour le voir, le comparer et l'équiper. Touchez un emplacement d'équipement pour filtrer l'inventaire.",
      }),
    );
  }
  if (resourceView(p, mode)) info.append(p.cubeGridView(g, false, true));
  return info;
}
