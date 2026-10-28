/**
 * Onglets du sac : charmes, matériaux, fusion, coffre de cartes, guilde, runes et gemmes, grille du cube (le panneau Inventaire lui-même : panels-inventory.ts).
 * Fonctions extraites de la classe Panels (panels.ts) : `this` y désigne l'instance.
 */
import { modSetting } from '../mods/settings';
import type { Game } from '../sim/game';
import type { Item } from '../sim/item';
import { BASES, BASE_BY_ID } from '../data/items/bases';
import { RUNES, RUNE_BY_ID } from '../data/items/runes';
import type { MergePreview, MergeQuality, MergeOpts } from '../sim/cube';
import { RULES } from '../mods/rules';
import { MAP_STASH_MAX, sortMapStash } from '../sim/mapstash';
import { CUBE_COLS, CUBE_ROWS, matCount } from '../sim/materials';
import { cssCellAt } from './dragdrop';
import { itemName, itemFinal, modLabel } from '../sim/itemstats';
import type { RolledMod } from '../sim/item';
import { CHARM_COLS, CHARM_ROWS, hasRoomFor, placeInInventory } from '../sim/inventory';
import { el } from './dom';
import { icon, itemIconId, itemIconOf, labelClass } from './hud';
import { INV_COLS, INV_ROWS } from '../sim/inventory';
import { itemTooltip } from './itemtext';
import { tr } from '../i18n';
import { guildTab } from './guild-ui';
import type { Panels } from './panels';
import { CHARM_SUM, bigCellsOn } from './panels-shared';
import { MERGE_QUALITY_KEY } from './panels-state';

/** Inventaire des charmes (PD2) : grille 10 × 4 où les charmes rangés sont actifs sans prendre de place dans le sac */
export function charmsTabImpl(this: Panels, g: Game): HTMLElement {
  const c = g.character;
  const n = c.charmInv.filter(Boolean).length;
  const box = el('div', { cls: 'col charmtab', style: { gap: '4px' } }, el('div', { cls: 'lvl', textContent: `Charmes actifs : ${n}` }));
  box.append(el('div', { cls: 'base', textContent: 'Les charmes rangés ici sont actifs sans prendre de place dans le sac. Glissez-y un charme du sac (ou clic droit sur le charme).' }));
  const grid = this.slotGrid(
    c.charmInv,
    CHARM_COLS,
    CHARM_ROWS,
    (i) => this.sel?.from === 'charm' && this.sel.idx === i,
    (i) => {
      this.sel = { from: 'charm', idx: i };
      this.render();
    },
    bigCellsOn() ? 44 : 38,
    (cell, i) => {
      this.dd.attach(cell, { kind: 'charm', idx: i });
      cell.dataset.charm = String(i);
    },
  );
  grid.classList.add('charmgrid');
  grid.style.flexShrink = '0';
  this.dd.addGrid({ el: grid, kind: 'charm', cellAt: cssCellAt(grid, CHARM_COLS, CHARM_ROWS) });
  box.append(grid);
  // somme des bonus principaux des charmes actifs
  const sum = new Map<string, number>();
  for (const it of c.charmInv) {
    if (!it) continue;
    for (const m of itemFinal(it, c.level).mods) if (CHARM_SUM.includes(m.stat) && !m.param) sum.set(m.stat, (sum.get(m.stat) ?? 0) + m.value);
  }
  const res = el('div', { cls: 'tip charmsum' }, el('div', { cls: 'base', textContent: 'Bonus des charmes' }));
  for (const k of CHARM_SUM) {
    const v = sum.get(k);
    if (v) res.append(el('div', { textContent: modLabel({ stat: k, value: v } as RolledMod) }));
  }
  if (res.childElementCount === 1) res.append(el('div', { cls: 'base', textContent: 'Aucun bonus.' }));
  box.append(res);
  return box;
}

/** Onglet de runes du coffre : stock empilé des runes et gemmes ; toucher une ligne en sort une unité dans l'inventaire */
export function materialsTabImpl(this: Panels, g: Game): HTMLElement {
  const c = g.character;
  const box = el('div', { cls: 'col', style: { gap: '4px' } }, el('div', { cls: 'lvl', textContent: 'Onglet des runes' }));
  box.append(el('div', { cls: 'base', textContent: 'Les runes et gemmes rangées ici ne prennent pas de place. Touchez-en une pour la sortir dans l’inventaire ; elle y occupe une case.' }));
  const all = el('button', { cls: 'btn primary', textContent: 'Ranger les runes et gemmes de l’inventaire' });
  all.addEventListener('click', () => {
    const n = g.depositAllRunes();
    this.host.message(n ? `${n} rune${n > 1 ? 's' : ''} ou gemme${n > 1 ? 's' : ''} rangée${n > 1 ? 's' : ''} dans l’onglet.` : 'Aucune rune ni gemme dans l’inventaire.');
    this.render();
  });
  box.append(all);
  const entries = Object.entries(c.materials).sort((a, b) => {
    const ra = RUNE_BY_ID[a[0]]?.rank ?? 0;
    const rb = RUNE_BY_ID[b[0]]?.rank ?? 0;
    return rb - ra || a[0].localeCompare(b[0]);
  });
  if (!entries.length) box.append(el('div', { cls: 'base', textContent: 'L’onglet est vide.' }));
  for (const [id, n] of entries) {
    const b = BASE_BY_ID[id];
    const loose = b?.type === 'rune' || b?.type === 'gem';
    const row = el('div', { cls: `statrow ${b?.type === 'rune' ? 'q-rune' : 'q-normal'}` });
    row.append(icon(itemIconId(id), b?.type === 'rune' ? 'q-rune' : ''), el('span', { textContent: b?.name ?? id }), el('b', { textContent: `×${n}` }));
    if (loose) {
      const take = el('button', { cls: 'btn', textContent: 'Sortir' });
      take.addEventListener('click', () => {
        if (!g.withdrawRune(id, 1)) this.host.message('Inventaire plein.', '#d66');
        this.render();
      });
      row.append(take);
    }
    box.append(row);
  }
  return box;
}

/** Bloc « Fusionner » du coffre de cartes : 3 cartes → 1 (palier supérieur avec l'Orbe du cartographe, ou même palier gratuit), en lot */
export function mergeBlockImpl(this: Panels, g: Game): HTMLElement {
  const box = el('div', { cls: 'col mergeblock', style: { gap: '3px', border: '1px solid #5a4a2a', padding: '4px', flex: 'none' }, data: { testid: 'map-merge' } });
  const q = this.mergeUi.quality;
  const t = this.mergeUi.tier;
  box.append(mergeTierRow(this, g, t, q));
  if (mergeConfirm(this, g, box, t, q)) return box;
  this.mergeUi.ask = null;
  mergeActions(this, g, box, t, q);
  return box;
}

/** Paliers T1-T3 (cartes éligibles / total du palier) et filtre de qualité des cartes fusionnées (mémorisé sur l'appareil) */
function mergeTierRow(p: Panels, g: Game, t: number, q: MergeQuality): HTMLElement {
  const c = g.character;
  const row1 = el('div', { cls: 'tabs', style: { flexWrap: 'wrap', alignItems: 'center', gap: '3px' } });
  row1.append(el('b', { textContent: 'Fusion' }));
  for (const tier of [1, 2, 3]) {
    const n = RULES['maps.mergePreview'](c, { tier, mode: 'same', quality: q }).eligible;
    const all = (c.mapStash ?? []).filter((m) => m.map?.tier === tier).length;
    // « éligibles / total du palier » : le total du palier compte toutes les qualités, l'éligible suit le filtre de qualité choisi
    const b = el('button', { cls: `btn${tier === t ? ' primary' : ''}`, textContent: `T${tier} : ${n} / ${all}` });
    b.dataset.act = `merge-t${tier}`;
    b.title = `${n} carte${n > 1 ? 's' : ''} T${tier} éligible${n > 1 ? 's' : ''} sur ${all} (selon le filtre de qualité)`;
    b.addEventListener('click', () => {
      p.mergeUi.tier = tier;
      p.mergeUi.ask = null;
      p.render();
    });
    row1.append(b);
  }
  const sel = el('select', { cls: 'btn' }) as HTMLSelectElement;
  sel.dataset.act = 'merge-q';
  for (const [v, label] of [
    ['normal', 'Normales seulement'],
    ['normalmagic', '+ magiques'],
    ['notrare', 'Tout sauf rares'],
  ] as const) {
    const o = el('option', { textContent: label }) as HTMLOptionElement;
    o.value = v;
    o.selected = v === q;
    sel.append(o);
  }
  sel.addEventListener('change', () => {
    p.mergeUi.quality = sel.value as MergeQuality;
    try {
      localStorage.setItem(MERGE_QUALITY_KEY, p.mergeUi.quality);
    } catch {
      /* sans mémoire locale */
    }
    p.mergeUi.ask = null;
    p.render();
  });
  row1.append(sel);
  return row1;
}

/** Fusion de `t` cartes au palier `t` (mode et nombre de lots) ; messages, son et rendu */
function runMerge(p: Panels, g: Game, t: number, q: MergeQuality, mode: 'upgrade' | 'same', lots?: number): void {
  const opts: MergeOpts = { tier: t, mode, quality: q, maxLots: lots };
  const r = g.mergeMaps(opts);
  p.mergeUi.ask = null;
  if (!r.ok) {
    p.host.haptic('fail');
    p.host.message(r.reason ?? 'Impossible', '#d66');
  } else {
    p.host.itemSound('map');
    p.host.haptic('tap');
    p.host.message(
      `${r.produced} carte${r.produced > 1 ? 's' : ''} T${r.toTier} obtenue${r.produced > 1 ? 's' : ''}, ${r.consumed} carte${r.consumed > 1 ? 's' : ''} T${t} consommée${r.consumed > 1 ? 's' : ''}`,
      '#e8b04a',
    );
    if (p.sel?.from === 'mapstash') p.sel = null;
  }
  p.render();
}

/** Bouton d'une fusion : grisé avec sa raison si impossible (ou hors de la ville) ; demande confirmation selon le réglage */
function mergeButton(
  p: Panels,
  g: Game,
  t: number,
  q: MergeQuality,
  act: string,
  label: string,
  mode: 'upgrade' | 'same',
  lots: number | undefined,
  primary = false,
): { b: HTMLButtonElement; pv: MergePreview; why: string | undefined } {
  const c = g.character;
  const town = g.mode === 'town';
  const pv = RULES['maps.mergePreview'](c, { tier: t, mode, quality: q, maxLots: lots });
  const ok = pv.ok && town;
  const why = town ? pv.reason : 'À faire en ville';
  const b = el('button', { cls: `btn${primary && ok ? ' primary' : ''}${ok ? '' : ' disabled'}`, textContent: label, title: ok ? undefined : why });
  b.dataset.act = act;
  if (!ok) b.style.opacity = '0.5';
  b.addEventListener('click', () => {
    if (!ok) {
      p.host.haptic('fail');
      p.host.message(why ?? 'Impossible', '#d66');
      return;
    }
    if (modSetting(g.settings, 'confirmMapUpgrade') === false) return runMerge(p, g, t, q, mode, lots);
    p.mergeUi.ask = { mode, lots };
    p.render();
  });
  return { b, pv, why: ok ? undefined : why };
}

/** Confirmation d'une fusion demandée (coût en orbes) ; vrai si elle est affichée */
function mergeConfirm(p: Panels, g: Game, box: HTMLElement, t: number, q: MergeQuality): boolean {
  const c = g.character;
  const ask = p.mergeUi.ask && RULES['maps.mergePreview'](c, { tier: t, mode: p.mergeUi.ask.mode, quality: q, maxLots: p.mergeUi.ask.lots });
  if (p.mergeUi.ask && ask?.ok) {
    const a = p.mergeUi.ask;
    const cost = a.mode === 'upgrade' ? `Coût : ${ask.orbsNeeded} orbe${ask.orbsNeeded > 1 ? 's' : ''} du cartographe.` : 'Gratuit.';
    box.append(el('div', { cls: 'base', textContent: `Fusionner ${ask.consumed} cartes T${t} en ${ask.lots} carte${ask.lots > 1 ? 's' : ''} T${ask.toTier} ? ${cost}` }));
    const ok = el('button', { cls: 'btn primary', textContent: 'Confirmer' });
    ok.dataset.act = 'merge-ok';
    ok.addEventListener('click', () => runMerge(p, g, t, q, a.mode, a.lots));
    const no = el('button', { cls: 'btn', textContent: 'Annuler' });
    no.addEventListener('click', () => {
      p.mergeUi.ask = null;
      p.render();
    });
    box.append(el('div', { cls: 'tabs' }, ok, no));
    return true;
  }
  return false;
}

/** Fusions possibles (vers le palier supérieur, à palier égal gratuite), rangement des cartes du sac, orbes disponibles */
function mergeActions(p: Panels, g: Game, box: HTMLElement, t: number, q: MergeQuality): void {
  const c = g.character;
  const row2 = el('div', { cls: 'tabs', style: { flexWrap: 'wrap', gap: '3px' } });
  const reasons: string[] = [];
  if (t <= 2) {
    const one = mergeButton(p, g, t, q, 'merge-up', `3 → T${t + 1}`, 'upgrade', 1);
    const all = mergeButton(p, g, t, q, 'merge-up-all', `Tout ×${Math.max(1, RULES['maps.mergePreview'](c, { tier: t, mode: 'upgrade', quality: q }).lots)}`, 'upgrade', undefined, true);
    one.b.title = `3 cartes T${t} → 1 carte T${t + 1} (1 orbe du cartographe)`;
    all.b.title = `Tous les lots possibles, limités par les orbes (${matCount(c, RULES['maps.upgradeCurrency']())})`;
    if (one.why) reasons.push(one.why);
    row2.append(one.b, all.b);
  }
  const same = mergeButton(p, g, t, q, 'merge-same', `3 → 1 gratuit ×${Math.max(1, RULES['maps.mergePreview'](c, { tier: t, mode: 'same', quality: q }).lots)}`, 'same', undefined);
  same.b.title = `3 cartes T${t} → 1 carte normale T${t} (gratuit, libère de la place)`;
  row2.append(same.b);
  const bag = c.inventory.filter((x) => x?.map).length;
  const stashBtn = el('button', { cls: `btn${bag ? '' : ' disabled'}`, textContent: `Sac → coffre (${bag})`, title: 'Ranger toutes les cartes du sac dans le coffre de cartes' });
  stashBtn.dataset.act = 'merge-bag';
  if (!bag) stashBtn.style.opacity = '0.5';
  stashBtn.addEventListener('click', () => {
    if (!bag) return;
    const n = g.stashAllBagMaps();
    p.host.message(
      n === bag ? `${n} carte${n > 1 ? 's' : ''} rangée${n > 1 ? 's' : ''} dans le coffre de cartes.` : `${n} carte${n > 1 ? 's' : ''} rangée${n > 1 ? 's' : ''} ; coffre de cartes plein.`,
      n ? '#e8b04a' : '#d66',
    );
    p.render();
  });
  row2.append(stashBtn);
  box.append(row2);
  const note = reasons[0] ?? same.why;
  box.append(el('div', { cls: 'base', style: { fontSize: '11px' }, textContent: `Orbes du cartographe : ${matCount(c, RULES['maps.upgradeCurrency']())}${note ? ` — ${note}` : ''}` }));
}

export function mapStashTabImpl(this: Panels, g: Game): HTMLElement {
  const c = g.character;
  const list = c.mapStash ?? [];
  const box = el('div', { cls: 'col', style: { gap: '4px' } });
  const bar = el('div', { cls: 'tabs', style: { flexWrap: 'wrap', alignItems: 'center' } });
  bar.append(el('b', { textContent: `Cartes : ${list.length} / ${MAP_STASH_MAX}` }));
  const sort = el('button', { cls: 'btn', textContent: 'Tout trier', data: { testid: 'map-sort' } });
  sort.addEventListener('click', () => {
    sortMapStash(c);
    this.sel = null;
    this.host.haptic('tap');
    this.render();
  });
  bar.append(sort);
  // décompte complet (le total « n / 200 » est la somme de ces nombres)
  const byTier: Record<string, number> = {};
  const byQ: Record<string, number> = {};
  for (const m of list) {
    const tk = (m.map?.tier ?? 0) >= 4 ? 'Donjons' : `P${m.map?.tier ?? '?'}`;
    byTier[tk] = (byTier[tk] ?? 0) + 1;
    const qk = ({ normal: 'normales', magic: 'magiques', rare: 'rares', unique: 'uniques' } as Record<string, string>)[m.quality] ?? m.quality;
    byQ[qk] = (byQ[qk] ?? 0) + 1;
  }
  const fmtCounts = (o: Record<string, number>) =>
    Object.entries(o)
      .sort()
      .map(([k, v]) => `${tr(k)} : ${v}`)
      .join(' · ');
  box.append(bar, el('div', { cls: 'base', textContent: list.length ? `${tr('Par palier')} — ${fmtCounts(byTier)} | ${tr('Par qualité')} — ${fmtCounts(byQ)}` : '' }), this.mergeBlock(g));
  if (this.sel?.from === 'mapstash' && !list[this.sel.idx]) this.sel = null;
  if (!list.length) box.append(el('div', { cls: 'base', textContent: 'Aucune carte dans le coffre de cartes.' }));
  list.forEach((it, i) => {
    const on = this.sel?.from === 'mapstash' && this.sel.idx === i;
    const row = el('button', { cls: `btn maprow${on ? ' sel' : ''}`, data: { testid: `map-row-${i}`, midx: String(i) } });
    row.append(icon(itemIconOf(it), labelClass(it)), el('span', { cls: 'mr-name', textContent: itemName(it) }));
    row.addEventListener('click', () => {
      this.sel = { from: 'mapstash', idx: i };
      this.resSel = null;
      this.host.haptic('tap');
      this.render();
    });
    box.append(row);
  });
  return box;
}

/** Onglet « Guilde » : coffre partagé avec d'autres joueurs (service distant, voir platform/guild.ts) */
export function guildTabViewImpl(this: Panels, g: Game): HTMLElement {
  const c = g.character;
  return guildTab({
    character: () => g.character,
    candidate: () => {
      const s = this.sel;
      const it = this.selectedItem(g);
      if (!s || !it) return null;
      const uid = it.uid;
      // seuls le sac, les charmes, le coffre et les cartes peuvent être déposés (pas l'équipement porté ni le marchand)
      if (s.from === 'inv') return { item: it, remove: () => (c.inventory[s.idx]?.uid === uid ? ((c.inventory[s.idx] = null), true) : false) };
      if (s.from === 'charm') return { item: it, remove: () => (c.charmInv?.[s.idx]?.uid === uid ? ((c.charmInv[s.idx] = null), g.world.refreshPlayer(), true) : false) };
      if (s.from === 'stash') return { item: it, remove: () => (c.stash[s.tab]?.[s.idx]?.uid === uid ? ((c.stash[s.tab][s.idx] = null), true) : false) };
      if (s.from === 'mapstash') {
        return {
          item: it,
          remove: () => {
            const i = c.mapStash?.findIndex((x) => x.uid === uid) ?? -1;
            if (i < 0) return false;
            c.mapStash!.splice(i, 1);
            return true;
          },
        };
      }
      return null;
    },
    hasRoom: (it) => hasRoomFor(c, it),
    place: (it) => placeInInventory(c, it) >= 0,
    changed: () => {
      this.sel = null;
      this.host.haptic('tap');
      this.render();
    },
    notify: (m, col) => this.host.message(m, col),
  });
}

/** Objet de rune/gemme/matériau pour l'infobulle (une unité) */
export function resItemImpl(this: Panels, id: string, qty: number): Item {
  return { uid: `res-${id}`, base: id, quality: 'normal', ilvl: 1, sockets: 0, socketed: [], qty };
}

/** Détail de la rune / gemme / matériau sélectionné (infobulle) ; les actions sont dans la colonne d'actions */
export function resourceDetailImpl(this: Panels, g: Game, id: string): HTMLElement {
  return el('div', { cls: 'col', style: { gap: '4px' } }, itemTooltip(this.resItem(id, g.character.materials[id] ?? 0), g.character));
}

/** Onglets Runes / Gemmes / Matériaux du coffre (comme D2R) : une case par type, avec sa quantité ; toucher une case en affiche le détail et les actions (sortir, sertir, Cube) ; glisser-déposer vers le sac, un objet à châsses ou le Cube */
export function resourceTabImpl(this: Panels, g: Game, kind: 'runes' | 'gems' | 'mats'): HTMLElement {
  const c = g.character;
  let ids: string[];
  let cols: number;
  if (kind === 'runes') {
    ids = RUNES.map((r) => r.id);
    cols = 7;
  } else if (kind === 'gems') {
    const order = ['diamond', 'emerald', 'ruby', 'topaz', 'amethyst', 'sapphire', 'skull'];
    cols = order.length;
    ids = [];
    for (let grade = 0; grade < 5; grade++) for (const k of order) ids.push(`gem_${k}_${grade}`);
  } else {
    cols = 6;
    ids = BASES.filter((b) => b.type === 'currency' && b.id !== 'gold' && b.stack).map((b) => b.id);
    for (const id of Object.keys(c.materials)) if (!ids.includes(id) && BASE_BY_ID[id]?.type !== 'rune' && BASE_BY_ID[id]?.type !== 'gem') ids.push(id);
  }
  if (this.resSel && !ids.includes(this.resSel)) this.resSel = null;
  const grid = el('div', { cls: 'grid resgrid', style: { gridTemplateColumns: `repeat(${cols}, minmax(0, calc(34px * min(var(--s), 1.1))))`, maxWidth: '100%' } });
  for (const id of ids) {
    const b = BASE_BY_ID[id];
    if (!b) continue;
    const n = c.materials[id] ?? 0;
    const cell = el('button', { cls: `cell rescell${n ? '' : ' dim'}${this.resSel === id ? ' sel' : ''}`, title: b.name });
    cell.append(icon(itemIconId(id), b.type === 'rune' ? 'q-rune' : ''));
    if (n) cell.append(el('span', { cls: 'n', textContent: String(n) }));
    if (n) this.dd.attach(cell, { kind: 'res', id });
    cell.dataset.res = id;
    cell.addEventListener('click', () => {
      this.resSel = this.resSel === id ? null : id;
      this.sel = null;
      this.menuUi.open = null;
      this.host.haptic('tap');
      this.render();
    });
    grid.append(cell);
  }
  const hint = el('div', { cls: 'base', textContent: 'Touchez une case : détail et actions à droite. Glissez-la (appui long au doigt) sur le sac ou un objet à châsses.' });
  hint.style.maxWidth = `${cols * 38}px`;
  const left = el('div', { cls: 'col', style: { gap: '4px', flex: '1 1 0', minWidth: '0' } }, hint, grid);
  return left;
}

/** Cube horadrique en grille : on y pose les ingrédients depuis l'inventaire ; la recette qui correspond exactement au contenu se propose */
export function cubeGridViewImpl(this: Panels, g: Game, withInventory: boolean, compact = false): HTMLElement {
  const c = g.character;
  const box = el('div', { cls: 'col', style: { gap: '6px' } }, el('div', { cls: 'lvl', textContent: 'Cube horadrique' }));
  if (!compact)
    box.append(
      el('div', { cls: 'base', textContent: 'Posez les ingrédients dans le Cube (touchez un objet de l’inventaire, ou une rune), puis transmutez. Tout ce qui est dans le Cube est utilisé.' }),
    );
  box.append(
    this.slotGrid(
      c.cube,
      CUBE_COLS,
      CUBE_ROWS,
      (i) => this.sel?.from === 'cube' && this.sel.idx === i,
      (i) => {
        if (!g.cubeRemove(i)) this.host.message('Inventaire plein.', '#d66');
        this.sel = null;
        this.cubeUi.gridNote = '';
        this.render();
      },
      compact ? 36 : 44,
    ),
  );
  if (compact) box.lastElementChild?.classList.add('cubeframe');
  if (box.lastElementChild) this.dd.addGrid({ el: box.lastElementChild as HTMLElement, kind: 'cube', cellAt: () => 0 });
  const matches = g.cubeMatches();
  if (!matches.length) box.append(el('div', { cls: 'base', textContent: c.cube.some(Boolean) ? 'Aucune recette ne correspond à ce contenu.' : 'Le Cube est vide.' }));
  for (const r of matches) {
    const go = el('button', { cls: 'btn primary stickybottom', textContent: `Transmuter : ${r.name}` });
    go.addEventListener('click', () => {
      const res = g.transmuteGrid(r.id);
      if (!res.ok) {
        this.host.haptic('fail');
        this.cubeUi.gridNote = res.reason ?? 'Impossible';
      } else {
        this.host.haptic('tap');
        const what = res.material ? (BASE_BY_ID[res.material]?.name ?? res.material) : res.item ? itemName(res.item) : '';
        this.cubeUi.gridNote = `Résultat : ${what}${res.note ? ` — ${res.note}` : ''}`;
        if (res.run) {
          this.hide();
          g.enterPandemonium(res.run);
          return;
        }
      }
      this.render();
    });
    box.append(go);
  }
  if (this.cubeUi.gridNote) box.append(el('div', { cls: 'tip', textContent: this.cubeUi.gridNote }));
  if (withInventory) {
    box.append(el('div', { cls: 'lvl', textContent: 'Inventaire' }));
    box.append(
      this.slotGrid(
        c.inventory,
        INV_COLS,
        INV_ROWS,
        () => false,
        (i) => {
          if (!g.cubeAdd(i)) this.host.message('Plus de place dans le Cube.', '#d66');
          this.cubeUi.gridNote = '';
          this.render();
        },
      ),
    );
    // runes de l'onglet : sortir directement dans le Cube n'existe pas, on les sort d'abord dans l'inventaire
    const tabCount = Object.values(c.materials).reduce((a, b) => a + b, 0);
    if (tabCount)
      box.append(
        el('div', {
          cls: 'base',
          textContent: `Onglet des runes : ${tabCount} unité${tabCount > 1 ? 's' : ''} (Coffre > onglet Runes pour les sortir). Les clés et recettes de l’onglet sont utilisées automatiquement.`,
        }),
      );
  }
  return box;
}
