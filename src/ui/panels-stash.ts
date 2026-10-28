/**
 * Coffre : recherche, navigation dans les résultats et barres d'onglets.
 * Fonctions extraites de la classe Panels (panels.ts) : `this` y désigne l'instance.
 */
import type { Game } from '../sim/game';
import { countStashable } from '../sim/stash-all';
import { itemName } from '../sim/itemstats';
import { el } from './dom';
import { labelClass } from './hud';
import { getLang, tr } from '../i18n';
import { STASH_TABS } from '../sim/character';
import { CATEGORY_FILTERS, MAP_TAB, QUALITY_FILTERS, hasStashSearch, qualityLabel, searchStash, type StashHit } from '../sim/stash-search';
import type { Panels } from './panels';

/** Garder potions, clés et tomes lors de « Tout au coffre » (mémorisé ; coché par défaut) */
export function keepUtilImpl(this: Panels): boolean {
  try {
    return localStorage.getItem('d2m.stashall.keep') !== '0';
  } catch {
    return true;
  }
}

export function setStashNoteImpl(this: Panels, text: string): void {
  this.stashUi.note = { text, until: Date.now() + 8000 };
  if (this.stashUi.noteTimer) clearTimeout(this.stashUi.noteTimer);
  this.stashUi.noteTimer = setTimeout(() => {
    this.stashUi.noteTimer = null;
    this.stashUi.note = null;
    if (this.current === 'stash') this.render();
  }, 8100);
}

/**
 * Éléments sous un panneau du mode Coffre. `char` : « Tout au coffre » + réglage « garder potions/clés », avec la confirmation et
 * l'annulation en bulle au-dessus ; `chest` : « Trier » (page affichée) et « Tout trier » (toutes les pages).
 */
/** Zone de recherche du coffre : champ, effacer, résultat précédent/suivant, liste, filtres ; compteur ; recouvrement (liste ou filtres) */
export function stashSearchBoxImpl(this: Panels, _g: Game): HTMLElement[] {
  const input = el('input', { type: 'text', cls: 'ssinput', placeholder: 'Rechercher…', value: this.stashUi.query, autocomplete: 'off', spellcheck: false, data: { testid: 'stash-search-input' } });
  input.setAttribute('enterkeyhint', 'search');
  input.setAttribute('aria-label', 'Rechercher dans le coffre');
  input.addEventListener('input', () => {
    this.stashUi.query = input.value;
    this.applyStashSearch();
  });
  // les raccourcis clavier du jeu ne doivent pas réagir à la saisie
  input.addEventListener('keydown', (e) => e.stopPropagation());
  input.addEventListener('keyup', (e) => e.stopPropagation());
  const mk = (txt: string, title: string, id: string, f: () => void): HTMLButtonElement => {
    const b = el('button', { cls: 'btn ssbtn', textContent: txt, title, data: { testid: `stash-search-${id}` } });
    b.addEventListener('click', f);
    return b;
  };
  const clear = mk('✕', 'Effacer la recherche', 'clear', () => {
    this.stashUi.query = '';
    this.stashUi.quality.clear();
    this.stashUi.category.clear();
    this.stashUi.view = null;
    input.value = '';
    this.applyStashSearch();
  });
  const prev = mk('‹', 'Résultat précédent', 'prev', () => this.stashStep(-1));
  const next = mk('›', 'Résultat suivant', 'next', () => this.stashStep(1));
  const list = mk('☰', 'Liste des résultats', 'list', () => {
    this.stashUi.view = this.stashUi.view === 'list' ? null : 'list';
    this.applyStashSearch();
  });
  const filt = mk('⚙', 'Filtres : qualité, catégorie', 'filters', () => {
    this.stashUi.view = this.stashUi.view === 'filters' ? null : 'filters';
    this.applyStashSearch();
  });
  const box = el('div', { cls: 'stashsearch' }, input, clear, prev, next, list, filt);
  const count = el('div', { cls: 'stashcount', data: { testid: 'stash-count' } });
  const over = el('div', { cls: 'stashres', data: { testid: 'stash-results' } });
  return [box, count, over];
}

/** Résultat précédent / suivant (à partir de l'objet choisi) */
export function stashStepImpl(this: Panels, d: 1 | -1): void {
  const hits = this.stashUi.hits;
  if (!hits.length) return;
  const s = this.sel;
  const cur = s?.from === 'stash' ? hits.findIndex((h) => h.tab === s.tab && h.idx === s.idx) : s?.from === 'mapstash' ? hits.findIndex((h) => h.tab === MAP_TAB && h.idx === s.idx) : -1;
  const at = cur < 0 ? (d > 0 ? 0 : hits.length - 1) : (cur + d + hits.length) % hits.length;
  this.stashJump(hits[at]);
}

/** Va à la page de l'objet et le sélectionne (colonne Objet et actions) */
export function stashJumpImpl(this: Panels, h: StashHit): void {
  this.stashTab = h.tab;
  this.sel = h.tab === MAP_TAB ? { from: 'mapstash', idx: h.idx } : { from: 'stash', tab: h.tab, idx: h.idx };
  this.resSel = null;
  this.stashUi.view = null;
  this.host.haptic('tap');
  this.render();
}

/** Met à jour la recherche sans reconstruire le panneau (le champ garde le focus) : estompage, compteur, pastilles, liste, filtres */
export function applyStashSearchImpl(this: Panels): void {
  const g = this.host.game();
  const c = g.character;
  const filters = { quality: [...this.stashUi.quality], category: [...this.stashUi.category] };
  const active = hasStashSearch(this.stashUi.query, filters);
  const hits = (this.stashUi.hits = searchStash(c, this.stashUi.query, filters, { tr, lang: getLang() }));
  const set = new Set(hits.map((h) => `${h.tab}:${h.idx}`));
  const root = this.root;
  for (const n of root.querySelectorAll<HTMLElement>('.scell')) {
    const hit = set.has(`${n.dataset.stab}:${n.dataset.sidx}`);
    n.classList.toggle('sr-hit', active && hit);
    n.classList.toggle('sr-dim', active && !hit);
  }
  for (const n of root.querySelectorAll<HTMLElement>('.maprow')) {
    const hit = set.has(`${MAP_TAB}:${n.dataset.midx}`);
    n.classList.toggle('sr-hit', active && hit);
    n.classList.toggle('sr-dim', active && !hit);
  }
  const pageHits = new Set(hits.filter((h) => h.tab !== MAP_TAB).map((h) => h.tab));
  const mapHits = hits.filter((h) => h.tab === MAP_TAB).length;
  const pageBtns = Array.from(root.querySelectorAll<HTMLElement>('[data-testid^="stash-page-"]'));
  const shownPages = new Set(
    pageBtns
      .map((b) => /^stash-page-(\d+)$/.exec(b.dataset.testid ?? '')?.[1])
      .filter((x): x is string => x !== undefined)
      .map(Number),
  );
  const hiddenHit = [...pageHits].some((t) => !shownPages.has(t) && (g.sharedTabs > 0 ? t >= STASH_TABS === this.stashTab >= STASH_TABS : true));
  for (const b of pageBtns) {
    const t = /^stash-page-(\d+)$/.exec(b.dataset.testid ?? '')?.[1];
    b.classList.toggle('srhit', t !== undefined ? pageHits.has(Number(t)) : hiddenHit);
  }
  root.querySelector('[data-testid="stash-top-coffre"]')?.classList.toggle('srhit', pageHits.size > 0);
  root.querySelector('[data-testid="stash-top-cartes"]')?.classList.toggle('srhit', mapHits > 0);
  const count = root.querySelector<HTMLElement>('.stashcount');
  if (count) {
    const n = hits.length;
    const pages = pageHits.size;
    count.style.display = active ? '' : 'none';
    count.textContent = !n
      ? 'Aucun résultat'
      : `${n} résultat${n > 1 ? 's' : ''}${pages ? ` sur ${pages} page${pages > 1 ? 's' : ''}` : ''}${mapHits && pages ? `, dont ${mapHits} dans les cartes` : mapHits ? ' dans les cartes' : ''}`;
    count.classList.toggle('none', !n);
  }
  const q = (id: string) => root.querySelector<HTMLButtonElement>(`[data-testid="stash-search-${id}"]`);
  for (const id of ['prev', 'next', 'list']) {
    const b = q(id);
    if (b) b.disabled = !hits.length;
  }
  q('clear')?.classList.toggle('on', active);
  const fb = q('filters');
  if (fb) {
    const nf = this.stashUi.quality.size + this.stashUi.category.size;
    fb.textContent = nf ? `⚙${nf}` : '⚙';
    fb.classList.toggle('sel', this.stashUi.view === 'filters' || nf > 0);
  }
  q('list')?.classList.toggle('sel', this.stashUi.view === 'list');
  const over = root.querySelector<HTMLElement>('.stashres');
  if (!over) return;
  over.replaceChildren();
  over.classList.toggle('open', this.stashUi.view !== null);
  if (this.stashUi.view === 'filters') {
    const chips = <T extends string>(title: string, defs: [T, string][], on: Set<T>) => {
      const row = el('div', { cls: 'chips' }, el('b', { textContent: title }));
      for (const [k, label] of defs) {
        const b = el('button', { cls: `btn chip${on.has(k) ? ' sel' : ''}`, textContent: label, data: { testid: `stash-chip-${k}` } });
        b.addEventListener('click', () => {
          if (on.has(k)) on.delete(k);
          else on.add(k);
          this.applyStashSearch();
        });
        row.append(b);
      }
      return row;
    };
    const reset = el('button', { cls: 'btn chip', textContent: 'Effacer les filtres' });
    reset.addEventListener('click', () => {
      this.stashUi.quality.clear();
      this.stashUi.category.clear();
      this.applyStashSearch();
    });
    over.append(chips('Qualité', QUALITY_FILTERS, this.stashUi.quality), chips('Catégorie', CATEGORY_FILTERS, this.stashUi.category), reset);
  } else if (this.stashUi.view === 'list') {
    if (!hits.length) over.append(el('div', { cls: 'srempty', textContent: 'Aucun résultat' }));
    const shared = g.sharedTabs > 0;
    for (const h of hits.slice(0, 300)) {
      const it = h.tab === MAP_TAB ? c.mapStash?.[h.idx] : c.stash[h.tab]?.[h.idx];
      if (!it) continue;
      const page = h.tab === MAP_TAB ? 'Cartes' : shared && h.tab >= STASH_TABS ? `p. ${h.tab - STASH_TABS + 1}` : `p. ${h.tab + 1}`;
      const row = el(
        'button',
        { cls: 'btn srrow', data: { testid: 'stash-res-row' } },
        el('span', { cls: `srname ${labelClass(it)}`, textContent: itemName(it) }),
        el('small', { textContent: `${page} · ${qualityLabel(it)}` }),
      );
      row.addEventListener('click', () => this.stashJump(h));
      over.append(row);
    }
    if (hits.length > 300) over.append(el('div', { cls: 'srempty', textContent: `… et ${hits.length - 300} autres : affinez la recherche.` }));
  }
}

export function stashBarsImpl(this: Panels, g: Game, which: 'char' | 'chest'): HTMLElement[] {
  const bar = el('div', { cls: 'stashbar', data: { testid: `stash-bar-${which}` } });
  const out: HTMLElement[] = [bar];
  const done = (text: string, sound: string): void => {
    this.sel = null;
    this.resSel = null;
    this.stashUi.ask = false;
    this.host.itemSound(sound);
    this.host.haptic('tap');
    this.setStashNote(text);
    this.render();
  };
  if (which === 'chest') {
    const one = el('button', { cls: 'btn', textContent: 'Trier', title: 'Trier la page affichée : catégorie, qualité, niveau, sans trou', data: { testid: 'stash-sort-page' } });
    one.addEventListener('click', () => {
      if (!g.sortStash('page', this.stashTab)) {
        this.host.haptic('fail');
        return this.host.message('Tri impossible sur cette page.', '#d66');
      }
      done('Page triée.', 'armor');
    });
    const all = el('button', { cls: 'btn', textContent: 'Tout trier', title: 'Trier tout le coffre et replier les objets sur les premières pages', data: { testid: 'stash-sort-all' } });
    all.addEventListener('click', () => {
      const before = g.character.stash.length;
      if (!g.sortStash('all')) {
        this.host.haptic('fail');
        return this.host.message('Tri impossible.', '#d66');
      }
      const freed = before - g.character.stash.length;
      if (this.stashTab >= g.character.stash.length) this.stashTab = g.character.stash.length - 1;
      done(freed > 0 ? `Coffre trié, ${freed} page${freed > 1 ? 's' : ''} libérée${freed > 1 ? 's' : ''}.` : 'Coffre trié.', 'armor');
    });
    bar.append(one, all);
    return out;
  }
  const keep = this.keepUtil();
  const n = countStashable(g.character, { keepPotions: keep, keepUtility: keep });
  const send = el('button', {
    cls: `btn${n ? '' : ' disabled'}`,
    textContent: `Tout au coffre${n ? ` (${n})` : ''}`,
    title: 'Envoyer tout le sac au coffre (équipement, charmes actifs, ceinture et quête restent en place)',
    data: { testid: 'stash-all' },
  });
  if (!n) send.style.opacity = '0.5';
  send.addEventListener('click', () => {
    if (!n) {
      this.host.haptic('fail');
      return this.host.message('Rien à envoyer au coffre.', '#d66');
    }
    this.stashUi.note = null;
    this.stashUi.ask = !this.stashUi.ask;
    this.render();
  });
  const tog = el('button', {
    cls: `btn stashkeep${keep ? ' sel' : ''}`,
    textContent: `${keep ? '✓' : '✗'} Garder potions, clés`,
    title: 'Potions, clés et tomes de portail restent dans le sac',
    data: { testid: 'stash-keep' },
  });
  tog.addEventListener('click', () => {
    try {
      localStorage.setItem('d2m.stashall.keep', keep ? '0' : '1');
    } catch {
      /* sans mémoire locale */
    }
    this.render();
  });
  bar.append(send, tog);
  if (this.stashUi.ask && n) {
    const yes = el('button', { cls: 'btn primary', textContent: 'Envoyer', data: { testid: 'stash-all-yes' } });
    const no = el('button', { cls: 'btn', textContent: 'Non' });
    no.addEventListener('click', () => {
      this.stashUi.ask = false;
      this.render();
    });
    yes.addEventListener('click', () => {
      const r = g.stashAllBag({ keepPotions: keep, keepUtility: keep });
      const plural = (k: number, w: string) => `${k} ${w}${k > 1 ? 's' : ''}`;
      let text = `${plural(r.moved, 'objet')} envoyé${r.moved > 1 ? 's' : ''}`;
      if (r.kept) text += `, ${r.kept} gardé${r.kept > 1 ? 's' : ''}`;
      if (r.reasons.full) text += ` (coffre plein : ${r.reasons.full})`;
      if (!r.moved) {
        this.host.haptic('fail');
        this.stashUi.ask = false;
        this.host.message(r.reasons.full ? 'Le coffre est plein.' : 'Rien à envoyer au coffre.', '#d66');
        return this.render();
      }
      done(`${text}.`, 'armor');
    });
    out.push(el('div', { cls: 'stashpop', data: { testid: 'stash-all-ask' } }, el('div', { textContent: `Envoyer ${n} objet${n > 1 ? 's' : ''} au coffre ?` }), el('div', { cls: 'row' }, yes, no)));
  } else if (this.stashUi.note && this.stashUi.note.until > Date.now()) {
    const undo = el('button', { cls: 'btn', textContent: 'Annuler', data: { testid: 'stash-undo' } });
    if (!g.canUndoStash()) undo.style.display = 'none';
    undo.addEventListener('click', () => {
      if (g.undoStash()) {
        this.stashUi.note = null;
        this.host.itemSound('armor');
        this.host.message('Opération annulée.', '#e8b04a');
      } else this.host.message('Annulation impossible : le contenu a changé depuis.', '#d66');
      this.render();
    });
    out.push(el('div', { cls: 'stashpop', data: { testid: 'stash-note' } }, el('div', { textContent: this.stashUi.note.text }), el('div', { cls: 'row' }, undo)));
  }
  return out;
}
