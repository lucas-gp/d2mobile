/**
 * Panneaux plein écran (le jeu solo se met en pause pendant qu'ils sont ouverts) :
 * inventaire/équipement, matériaux, personnage, compétences, point de passage, coffre,
 * marchand, soigneuse, réglages, crédits. Tout se fait au tap ; rien ne repose sur le survol ;
 * vendre demande un appui maintenu, jeter un simple appui (l'objet tombe aux pieds).
 */
import type { Game } from '../sim/game';
import type { Item } from '../sim/item';
import type { Slot } from '../data/types';
import { SKILL_BY_ID } from '../data/skills';
import type { SkillTree } from '../data/types';
import { BASE_BY_ID } from '../data/items/bases';
import { RUNEWORDS } from '../data/items/runewords';
import { SHORTCUTS } from '../input/mode';
import { DragDrop, type DragSrc, type DropTarget } from './dragdrop';
import { el } from './dom';
import { icon, itemIconOf, labelClass } from './hud';
import { d2Ui } from './d2ui';
import { itemSize, occupancyOf, type GridRef, INV_COLS, INV_ROWS } from '../sim/inventory';
import { itemTooltip } from './itemtext';
import { RULES } from '../mods/rules';
import { CREDITS } from './credits';
import { CHANGELOG, markChangelogSeen } from './changelog';
import { getLang } from '../i18n';
import { type StashHit } from '../sim/stash-search';
import { characterImpl, skillsImpl, imbuePanelImpl, socketQuestPanelImpl, mercImpl } from './panels-hero';
import { cubeImpl, mapsImpl, campaignImpl, waypointImpl } from './panels-world';
import {
  buildActsImpl,
  socketPanelImpl,
  actionColumnImpl,
  placeActPopoverImpl,
  ensureMenuListenersImpl,
  menuListImpl,
  socketEntriesImpl,
  mapEntriesImpl,
  corruptEntryImpl,
  corruptOverlayImpl,
  closeMenuImpl,
} from './panels-actions';
import { charmsTabImpl, materialsTabImpl, mergeBlockImpl, mapStashTabImpl, guildTabViewImpl, resItemImpl, resourceDetailImpl, resourceTabImpl, cubeGridViewImpl } from './panels-bag';
import { inventoryImpl, type InventoryMode } from './panels-inventory';
import { keepUtilImpl, setStashNoteImpl, stashSearchBoxImpl, stashStepImpl, stashJumpImpl, applyStashSearchImpl, stashBarsImpl } from './panels-stash';
import { lootFilterImpl, highlightTabImpl, tiersTabImpl } from './panels-filter';
import { settingsImpl } from './panels-settings';
import { newCubeUi, newFilterUi, newMenuUi, newMergeUi, newSettingsUi, newStashUi, newWaypointUi } from './panels-state';
import { setBigCellsPref, type ActEntry, type ActSection, type ColBtn, type PanelHost, type Sel } from './panels-shared';
import type { CorruptRef, MapRef } from '../sim/cube';

/** A long press on an item's cell (rule `ui.holdToAct`): milliseconds */
export const HOLD_MS = 450;
export { D2_CHROME_W, D2_INFO_MIN_W, D2_GAP, d2RawScale, d2FitScale, type PanelHost } from './panels-shared';

/**
 * Panneaux plein écran. L'orchestration (affichage, glisser-déposer, rendu) et l'état commun (panneau affiché, sélection, onglet du
 * coffre) vivent ici, l'état propre à chaque panneau dans des groupes typés (`filterUi`, `stashUi`, `cubeUi`, `settingsUi`, `mergeUi`,
 * `waypointUi`, `menuUi` : panels-state.ts). Le contenu de chaque panneau est dans les modules `panels-*.ts` (fonctions liées à
 * l'instance), d'où les membres sans `private` : ils sont lus par ces modules, pas par le reste de l'application, qui se limite à
 * `show`, `hide`, `refresh`, `open` et `assignHoveredSkill`.
 */
export class Panels {
  readonly root: HTMLElement;
  current: string | null = null;
  sel: Sel = null;
  /** Téléchargement de pack en cours (annulable) */
  packAbort: AbortController | null = null;
  /** Onglet du marchand : acheter son étal, ou racheter ce qu'on vient de vendre */
  vendorTab: 'buy' | 'back' = 'buy';
  filterSlot: Slot | null = null;
  stashTab = 0;
  /** État d'interface par panneau (panels-state.ts) */
  readonly filterUi = newFilterUi();
  readonly stashUi = newStashUi();
  readonly cubeUi = newCubeUi();
  readonly settingsUi = newSettingsUi();
  readonly mergeUi = newMergeUi();
  readonly waypointUi = newWaypointUi();
  readonly menuUi = newMenuUi();
  skillTree: SkillTree | null = null;
  skillSel: string | null = null;
  npc: string | null = null;
  /** Onglet Mercenaire en ville : vue « Recrutement » (liste des mercenaires) au lieu de la fiche et du sac */
  mercHire = false;

  /** Glisser-déposer des objets : sources et grilles réenregistrées à chaque rendu */
  readonly dd = new DragDrop((src, dst) => this.handleDrop(src, dst));

  constructor(
    parent: HTMLElement,
    readonly host: PanelHost,
  ) {
    this.root = parent;
  }

  private handleDrop(src: DragSrc, dst: DropTarget): void {
    const g = this.host.game();
    const c = g.character;
    const fail = (reason?: string) => {
      this.host.haptic('fail');
      if (reason) this.host.message(reason, '#d66');
    };
    const ref = (k: 'inv' | 'charm' | 'stash', tab?: number): GridRef => (k === 'inv' ? { grid: 'inv' } : k === 'charm' ? { grid: 'charm' } : { grid: 'stash', tab: tab ?? 0 });
    if (src.kind === 'res') {
      // rune ou gemme du coffre : vers le Cube, ou sertie dans l'objet visé (équipé ou du sac)
      if (dst.kind === 'cube') {
        if (!g.cubeFromTab(src.id)) fail('Plus de place dans le Cube.');
      } else {
        const target =
          dst.kind === 'eq'
            ? { slot: dst.slot as Slot }
            : dst.kind === 'inv'
              ? (() => {
                  const idx = occupancyOf(c.inventory, INV_COLS, INV_ROWS)[dst.cell];
                  return idx >= 0 ? { invIndex: idx } : null;
                })()
              : null;
        if (!target) {
          // case vide du sac : la rune ou la gemme y est posée (comme un objet)
          if (dst.kind === 'inv' && occupancyOf(c.inventory, INV_COLS, INV_ROWS)[dst.cell] < 0 && BASE_BY_ID[src.id] && BASE_BY_ID[src.id].type !== 'currency') {
            if (!g.withdrawRuneTo(src.id, dst.cell)) return fail('Inventaire plein.');
            this.host.haptic('tap');
            this.render();
            return;
          }
          return fail();
        }
        const r = g.socket(target, { material: src.id, fromTab: true });
        if (!r.ok) fail(r.reason);
        else if (r.runeword) this.host.message(`Mot runique formé : ${RUNEWORDS.find((x) => x.id === r.runeword)?.name}`, '#e8b04a');
        else this.host.message(`${BASE_BY_ID[src.id]?.name ?? src.id} sertie.`);
      }
    } else if (dst.kind === 'cube') {
      return;
    } else if (dst.kind === 'eq') {
      if (src.kind === 'inv') {
        const r = g.equip(src.idx, dst.slot as Slot);
        if (!r.ok) fail(r.reason);
      } else return;
    } else if (src.kind === 'eq') {
      // de l'équipement vers le sac : l'objet est retiré (rangé à la première place libre)
      const r = g.unequip(src.slot as Slot);
      if (!r.ok) fail(r.reason);
    } else {
      const from = src.kind === 'inv' || src.kind === 'charm' ? ref(src.kind) : ref('stash', src.tab);
      const to = dst.kind === 'inv' || dst.kind === 'charm' ? ref(dst.kind) : ref('stash', dst.tab);
      if (!g.moveItem(from, src.idx, to, dst.cell)) fail(dst.kind === 'charm' ? 'Seuls les charmes se rangent ici.' : undefined);
      else this.host.haptic('tap');
    }
    this.sel = null;
    this.render();
  }

  /** Un panneau est affiché (le jeu solo est alors en pause) */
  /** Élément actif avant l'ouverture du panneau : il retrouve le focus à la fermeture */
  private returnFocus: HTMLElement | null = null;

  get open(): boolean {
    return this.current !== null;
  }

  /** Affiche le panneau `name` (`npc` : marchand ou PNJ qui l'ouvre) ; rouvrir le panneau affiché le ferme */
  show(name: string, npc?: string): void {
    if (name === 'waypoint') {
      const g = this.host.game();
      const act = g.campaignActive;
      // lot 319: in the Campaign the waypoint opens on the act and the difficulty the hero plays (lot 322: its Rush tab one tap away)
      if (act) {
        this.waypointUi.mode = 'campaign';
        this.waypointUi.campAct = act;
        this.waypointUi.campDiff = g.difficulty;
      }
    }
    if (name === 'close' || (this.current === name && !npc)) {
      this.hide();
      return;
    }
    this.current = name;
    this.npc = npc ?? null;
    this.mercHire = false;
    this.sel = null;
    this.resSel = null;
    this.filterSlot = null;
    if (name !== 'stash') this.resetStashSearch();
    this.render();
  }

  /** Ferme le panneau et rend la main à l'application (`host.close`) */
  hide(): void {
    this.hideTip();
    this.hoverSkill = null;
    this.current = null;
    this.resetStashSearch();
    this.renderedName = null;
    this.root.replaceChildren();
    // focus rendu à ce qui l'avait avant l'ouverture (bouton du HUD…), s'il est encore dans la page
    const back = this.returnFocus;
    this.returnFocus = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
    this.host.close();
  }

  /** Redessine le panneau affiché (état du jeu changé ailleurs) */
  refresh(): void {
    if (this.current) this.render();
  }

  /** Cadre commun d'un panneau : titre, onglets principaux, bouton de fermeture, colonnes de contenu */
  frame(title: string, ...content: HTMLElement[]): HTMLElement {
    const close = el('button', { cls: 'close', textContent: '✕', title: 'Fermer' });
    close.addEventListener('click', () => this.hide());
    const tabs = el('div', { cls: 'tabs' });
    const tabList: [string, string][] = [
      ['inventory', 'Inventaire'],
      ['character', 'Personnage'],
      ['skills', 'Compétences'],
    ];
    if (this.host.game().character.merc) tabList.push(['merc', 'Mercenaire']);
    tabList.push(['settings', 'Réglages']);
    for (const [id, label] of tabList) {
      const b = el('button', { cls: `btn${this.current === id ? ' sel' : ''}`, textContent: label });
      b.addEventListener('click', () => this.show(id));
      tabs.append(b);
    }
    return el('div', { cls: `panel${d2Ui('panel-inv') ? ' d2' : ''}` }, el('header', {}, el('h2', { textContent: title }), tabs, close), el('div', { cls: 'body' }, ...content));
  }

  /** Reconstruit entièrement le panneau affiché (positions de défilement conservées) */
  render(): void {
    this.hideTip();
    const g = this.host.game();
    this.dd.reset();
    setBigCellsPref(g.settings.bigCells);
    let p: HTMLElement;
    switch (this.current) {
      case 'inventory':
        p = this.inventory(g, 'inventory');
        break;
      case 'stash':
        p = this.inventory(g, 'stash');
        break;
      case 'vendor':
        p = this.inventory(g, 'vendor');
        break;
      case 'character':
        p = this.character(g);
        break;
      case 'skills':
        p = this.skills(g);
        break;
      case 'waypoint':
        p = this.waypoint(g);
        break;
      case 'cube':
        p = this.cube(g);
        break;
      case 'imbue':
        p = this.imbuePanel(g);
        break;
      case 'socketquest':
        p = this.socketQuestPanel(g);
        break;
      case 'maps':
        p = this.maps(g);
        break;
      case 'merc':
        p = this.merc(g);
        break;
      case 'settings':
        p = this.settings(g);
        break;
      case 'filter':
        p = this.lootFilter(g);
        break;
      case 'help': {
        const grid = el('div', { cls: 'help-grid' });
        for (const [k, d] of SHORTCUTS) grid.append(el('b', { textContent: k }), el('span', { textContent: d }));
        p = this.frame('Raccourcis clavier', el('div', { cls: 'col scroll help-panel' }, grid));
        break;
      }
      case 'changelog': {
        markChangelogSeen();
        const lang = getLang();
        const box = el('div', { cls: 'col scroll changelog', data: { notr: '1' } });
        for (const e of CHANGELOG) {
          box.append(el('div', { cls: 'lvl', textContent: e.date }));
          for (const line of lang === 'fr' ? e.fr : e.en) box.append(el('div', { cls: 'base', textContent: `• ${line}` }));
        }
        p = this.frame(lang === 'fr' ? 'Nouveautés' : 'What’s new', box);
        break;
      }
      case 'credits':
        p = this.frame('Crédits', el('div', { cls: 'col scroll credits', textContent: CREDITS }));
        break;
      default:
        p = el('div');
    }
    // la reconstruction ne doit pas ramener les conteneurs défilants en haut : positions rendues par chemin d'enfants (même panneau seulement)
    const keep = this.renderedName === this.current ? this.scrollSnapshot() : null;
    const opening = this.renderedName === null;
    const switched = this.renderedName !== this.current;
    // accessibilité : fenêtre modale annoncée par son titre ; à l'ouverture, l'élément actif est gardé pour lui rendre le focus à la fermeture
    if (opening) {
      const a = document.activeElement;
      this.returnFocus = a instanceof HTMLElement && a !== document.body ? a : null;
    }
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-modal', 'true');
    const title = p.querySelector('header h2')?.textContent;
    if (title) p.setAttribute('aria-label', title);
    p.tabIndex = -1;
    this.root.replaceChildren(p);
    this.renderedName = this.current;
    // focus dans le panneau ouvert ou changé d'onglet (lecteur d'écran, clavier) ; sans défilement ni clavier virtuel (conteneur, pas un champ)
    if (switched) p.focus({ preventScroll: true });
    if (keep) this.scrollRestore(keep);
    if (this.current === 'stash') this.applyStashSearch();
  }

  private renderedName: string | null = null;
  private resetStashSearch(): void {
    this.stashUi.query = '';
    this.stashUi.quality.clear();
    this.stashUi.category.clear();
    this.stashUi.view = null;
    this.stashUi.hits = [];
  }

  /** Positions de défilement (haut, gauche) des éléments du panneau affiché, par chemin d'indices d'enfants */
  private scrollSnapshot(): Map<string, [number, number]> {
    const out = new Map<string, [number, number]>();
    const walk = (e: Element, path: string) => {
      const h = e as HTMLElement;
      if (h.scrollTop > 0 || h.scrollLeft > 0) out.set(path, [h.scrollTop, h.scrollLeft]);
      for (let i = 0; i < e.children.length; i++) walk(e.children[i], `${path}/${i}`);
    };
    for (let i = 0; i < this.root.children.length; i++) walk(this.root.children[i], String(i));
    return out;
  }

  private scrollRestore(keep: Map<string, [number, number]>): void {
    const walk = (e: Element, path: string) => {
      const v = keep.get(path);
      if (v) {
        const h = e as HTMLElement;
        h.scrollTop = v[0];
        h.scrollLeft = v[1];
      }
      for (let i = 0; i < e.children.length; i++) walk(e.children[i], `${path}/${i}`);
    };
    for (let i = 0; i < this.root.children.length; i++) walk(this.root.children[i], String(i));
  }

  /* ------------------------------------------------------------------ */
  /* Inventaire / coffre / marchand                                      */
  /* ------------------------------------------------------------------ */

  /** Objet désigné par la sélection courante (`sel`), où qu'il soit */
  selectedItem(g: Game): Item | null {
    const s = this.sel;
    const c = g.character;
    if (!s) return null;
    if (s.from === 'inv') return c.inventory[s.idx] ?? null;
    if (s.from === 'charm') return c.charmInv[s.idx] ?? null;
    if (s.from === 'eq') return c.equipment[s.slot] ?? null;
    if (s.from === 'merc') return c.merc?.equipment[s.slot] ?? null;
    if (s.from === 'stash') return c.stash[s.tab]?.[s.idx] ?? null;
    if (s.from === 'back') return g.buyback[s.idx]?.item ?? null;
    if (s.from === 'mapstash') return c.mapStash?.[s.idx] ?? null;
    return g.vendor[s.idx]?.item ?? null;
  }

  /** Case d'objet : icône, quantité ou châsses ; toucher sélectionne, double-toucher (ou clic droit en mode PC) lance l'action principale */
  cell(item: Item | null, selected: boolean, onTap: () => void, extra = ''): HTMLButtonElement {
    const b = el('button', { cls: `cell${selected ? ' sel' : ''} ${extra}` });
    if (item) {
      const i = icon(itemIconOf(item), labelClass(item));
      b.append(i);
      if (item.qty && item.qty > 1) b.append(el('span', { cls: 'n', textContent: String(item.qty) }));
      if (item.sockets > 0 && !item.runeword) b.append(el('span', { cls: 'n', textContent: `${item.socketed.length}/${item.sockets}` }));
    }
    // a game mode's long press (rule `ui.holdToAct`, lot 292): the item chosen, then its main action, as the double tap
    let held = false;
    if (item && RULES['ui.holdToAct'](this.host.game())) {
      let timer = 0;
      let at: [number, number] = [0, 0];
      const stop = () => {
        clearTimeout(timer);
        timer = 0;
      };
      b.addEventListener('pointerdown', (e) => {
        held = false;
        at = [e.clientX, e.clientY];
        stop();
        timer = window.setTimeout(() => {
          timer = 0;
          held = true;
          onTap();
          this.host.haptic('tap');
          this.lastTap = null;
          this.mainRun?.();
        }, HOLD_MS);
      });
      b.addEventListener('pointermove', (e) => {
        if (timer && Math.hypot(e.clientX - at[0], e.clientY - at[1]) > 8) stop();
      });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) b.addEventListener(ev, stop);
    }
    b.addEventListener('click', () => {
      // the click that ends a long press already acted
      if (held) {
        held = false;
        return;
      }
      onTap();
      this.host.haptic('tap');
      if (!item) return;
      // double-toucher (ou double-clic) : action rapide de l'objet choisi, la même que le clic droit
      const now = performance.now();
      const last = this.lastTap;
      if (last && last.uid === item.uid && now - last.t < 450 && this.selectedItem(this.host.game())?.uid === item.uid) {
        this.lastTap = null;
        this.mainRun?.();
      } else this.lastTap = { uid: item.uid, t: now };
    });
    if (item) this.pcItemHover(b, item);
    return b;
  }

  /* Mode PC : info-bulle au survol et clic droit = action principale (équiper, acheter), comme Diablo II */
  private tip: HTMLElement | null = null;
  hoverSkill: string | null = null;

  private hideTip(): void {
    this.tip?.remove();
    this.tip = null;
  }

  private pcItemHover(b: HTMLElement, item: Item): void {
    const pc = () => document.documentElement.dataset.input === 'pc';
    const place = (e: MouseEvent) => {
      if (!this.tip) return;
      const r = this.tip.getBoundingClientRect();
      const x = e.clientX + 16 + r.width > window.innerWidth ? e.clientX - 16 - r.width : e.clientX + 16;
      const y = Math.max(4, Math.min(window.innerHeight - r.height - 4, e.clientY + 12));
      this.tip.style.left = `${Math.max(4, x)}px`;
      this.tip.style.top = `${y}px`;
    };
    b.addEventListener('mouseenter', (e) => {
      if (!pc()) return;
      this.hideTip();
      this.tip = el('div', { cls: 'pc-tip' }, itemTooltip(item, this.host.game().character));
      document.body.append(this.tip);
      place(e);
    });
    b.addEventListener('mousemove', place);
    b.addEventListener('mouseleave', () => this.hideTip());
    b.addEventListener('contextmenu', (e) => {
      if (!pc()) return;
      e.preventDefault();
      this.hideTip();
      b.click();
      this.mainRun?.();
    });
  }

  /** Touche F1-F8 pendant le survol d'une compétence du panneau : assigne la compétence à l'emplacement */
  assignHoveredSkill(slot: number): boolean {
    const id = this.hoverSkill;
    const g = this.host.game();
    if (!id || this.current !== 'skills') return false;
    const s = SKILL_BY_ID[id];
    if (!s || s.passive || id === 'teleport' || (g.character.skills[id] ?? 0) + (g.world.player.d.skillLevels[id] ?? 0) <= 0) return false;
    g.assignSkill(slot, id);
    this.host.message(`${s.name} : F${slot + 1}`);
    this.render();
    return true;
  }

  /** Grille d'objets à placement explicite (un objet couvre w × h cases) : Cube, onglets */
  slotGrid(
    cells: (Item | null)[],
    cols: number,
    rows: number,
    isSel: (i: number) => boolean,
    onTap: (i: number, it: Item) => void,
    size = 44,
    onCell?: (cell: HTMLElement, i: number, it: Item) => void,
  ): HTMLElement {
    const grid = el('div', {
      cls: 'grid sidegrid', // colonnes `minmax(0, …)` : la grille rétrécit au lieu de déborder quand la colonne est étroite (Fold déplié, grandes cases)
      style: { gridTemplateColumns: `repeat(${cols}, minmax(0, calc(${size}px * var(--s))))`, maxWidth: '100%' },
    });
    for (let i = 0; i < cols * rows; i++) {
      const bg = el('div', { cls: 'cell fitcell' });
      bg.style.gridColumn = String((i % cols) + 1);
      bg.style.gridRow = String(Math.floor(i / cols) + 1);
      grid.append(bg);
    }
    cells.forEach((it, i) => {
      if (!it || i >= cols * rows) return;
      const [w, h] = itemSize(it);
      const cell = this.cell(it, isSel(i), () => onTap(i, it));
      onCell?.(cell, i, it);
      cell.style.gridColumn = `${(i % cols) + 1} / span ${Math.min(w, cols - (i % cols))}`;
      cell.style.gridRow = `${Math.floor(i / cols) + 1} / span ${h}`;
      cell.style.width = 'auto';
      cell.style.height = 'auto';
      grid.append(cell);
    });
    return grid;
  }

  charmsTab(g: Game): HTMLElement {
    return charmsTabImpl.call(this, g);
  }

  materialsTab(g: Game): HTMLElement {
    return materialsTabImpl.call(this, g);
  }

  /** Onglet Cartes du coffre : cartes ramassées (rangées d'office), triées ; on en touche une, le détail et les actions sont dans les colonnes de droite */

  mergeBlock(g: Game): HTMLElement {
    return mergeBlockImpl.call(this, g);
  }

  mapStashTab(g: Game): HTMLElement {
    return mapStashTabImpl.call(this, g);
  }

  guildTabView(g: Game): HTMLElement {
    return guildTabViewImpl.call(this, g);
  }

  /** Rune, gemme ou matériau choisi dans l'onglet Runes / Gemmes / Matériaux du coffre */
  resSel: string | null = null;

  resItem(id: string, qty: number): Item {
    return resItemImpl.call(this, id, qty);
  }

  resourceDetail(g: Game, id: string): HTMLElement {
    return resourceDetailImpl.call(this, g, id);
  }

  resourceTab(g: Game, kind: 'runes' | 'gems' | 'mats'): HTMLElement {
    return resourceTabImpl.call(this, g, kind);
  }

  cubeGridView(g: Game, withInventory: boolean, compact = false): HTMLElement {
    return cubeGridViewImpl.call(this, g, withInventory, compact);
  }

  inventory(g: Game, mode: InventoryMode): HTMLElement {
    return inventoryImpl.call(this, g, mode);
  }

  /* ----- Barres de boutons du coffre : tri et envoi en lot ----- */

  keepUtil(): boolean {
    return keepUtilImpl.call(this);
  }

  setStashNote(text: string): void {
    return setStashNoteImpl.call(this, text);
  }

  stashSearchBox(_g: Game): HTMLElement[] {
    return stashSearchBoxImpl.call(this, _g);
  }

  stashStep(d: 1 | -1): void {
    return stashStepImpl.call(this, d);
  }

  stashJump(h: StashHit): void {
    return stashJumpImpl.call(this, h);
  }

  applyStashSearch(): void {
    return applyStashSearchImpl.call(this);
  }

  stashBars(g: Game, which: 'char' | 'chest'): HTMLElement[] {
    return stashBarsImpl.call(this, g, which);
  }

  showMaterials = false;
  showCharms = false;

  buildActs(g: Game, mode: string, it: Item | null, res: string | null): { btns: ColBtn[]; popover: HTMLElement | null; overlays: HTMLElement[] } {
    return buildActsImpl.call(this, g, mode, it, res);
  }

  socketPanel(g: Game, it: Item, s: NonNullable<Sel>): HTMLElement {
    return socketPanelImpl.call(this, g, it, s);
  }

  actionColumn(g: Game, mode: string, compact: boolean, inflow = false): HTMLElement {
    return actionColumnImpl.call(this, g, mode, compact, inflow);
  }

  placeActPopover(col: HTMLElement, pop: HTMLElement): void {
    return placeActPopoverImpl.call(this, col, pop);
  }

  mainRun: (() => void) | null = null;
  private lastTap: { uid: string; t: number } | null = null;

  closeMenu(): boolean {
    return closeMenuImpl.call(this);
  }

  ensureMenuListeners(): void {
    return ensureMenuListenersImpl.call(this);
  }

  menuList(key: string, sections: ActSection[], listCls = ''): HTMLElement {
    return menuListImpl.call(this, key, sections, listCls);
  }

  socketEntries(g: Game, it: Item, ref: CorruptRef): ActEntry[] {
    return socketEntriesImpl.call(this, g, it, ref);
  }

  mapEntries(g: Game, ref: MapRef, it: Item): ActEntry[] {
    return mapEntriesImpl.call(this, g, ref, it);
  }

  corruptEntry(g: Game, it: Item, ref: CorruptRef): ActEntry | null {
    return corruptEntryImpl.call(this, g, it, ref);
  }

  corruptOverlay(g: Game, it: Item, ref: CorruptRef, chk: { ok: boolean; cost: number; have: number }, run: () => void): HTMLElement | null {
    return corruptOverlayImpl.call(this, g, it, ref, chk, run);
  }

  /* ------------------------------------------------------------------ */
  /* Personnage                                                          */
  /* ------------------------------------------------------------------ */

  character(g: Game): HTMLElement {
    return characterImpl.call(this, g);
  }

  /* ------------------------------------------------------------------ */
  /* Compétences                                                         */
  /* ------------------------------------------------------------------ */

  skills(g: Game): HTMLElement {
    return skillsImpl.call(this, g);
  }

  /* ------------------------------------------------------------------ */
  /* Point de passage                                                    */
  /* ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ */
  /* Cube horadrique : livre de recettes                                 */
  /* ------------------------------------------------------------------ */

  imbueNote = '';

  imbuePanel(g: Game): HTMLElement {
    return imbuePanelImpl.call(this, g);
  }

  socketNote = '';

  socketQuestPanel(g: Game): HTMLElement {
    return socketQuestPanelImpl.call(this, g);
  }

  cube(g: Game): HTMLElement {
    return cubeImpl.call(this, g);
  }

  /* ------------------------------------------------------------------ */
  /* Mercenaire : fiche, équipement ; recrutement chez Qual-Kehk          */
  /* ------------------------------------------------------------------ */

  merc(g: Game): HTMLElement {
    return mercImpl.call(this, g);
  }

  /* ------------------------------------------------------------------ */
  /* Anya : ouverture des cartes                                         */
  /* ------------------------------------------------------------------ */

  maps(g: Game): HTMLElement {
    return mapsImpl.call(this, g);
  }

  campaign(g: Game): HTMLElement {
    return campaignImpl.call(this, g);
  }

  waypoint(g: Game): HTMLElement {
    return waypointImpl.call(this, g);
  }

  /* ------------------------------------------------------------------ */
  /* Réglages                                                            */
  /* ------------------------------------------------------------------ */

  lootFilter(g: Game): HTMLElement {
    return lootFilterImpl.call(this, g);
  }

  highlightTab(g: Game): HTMLElement {
    return highlightTabImpl.call(this, g);
  }

  tiersTab(g: Game): HTMLElement {
    return tiersTabImpl.call(this, g);
  }

  settings(g: Game): HTMLElement {
    return settingsImpl.call(this, g);
  }
}

export {};
