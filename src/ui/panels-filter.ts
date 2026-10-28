/**
 * Panneau des réglages de butin : règles du filtre, surlignage et paliers.
 * Fonctions extraites de la classe Panels (panels.ts) : `this` y désigne l'instance.
 */
import type { Game } from '../sim/game';
import { itemName } from '../sim/itemstats';
import { FILTER_PRESET_IDS } from '../sim/character';
import { el } from './dom';
import { labelClass } from './hud';
import { tr } from '../i18n';
import type { LootFilterSettings } from '../sim/character';
import { lootFilterDecision } from '../sim/loot/filter';
import type { HighlightEntry } from '../sim/lootfilter';
import { defaultTierOf, tierOf } from '../sim/loot/filter';
import { MAX_TIER_OVERRIDES, withTierOverrides, type OverrideTier } from '../sim/loot/tiers';
import type { TierOverrideEntry } from '../sim/lootfilter';
import {
  HIGHLIGHT_CATS,
  HIGHLIGHT_COLORS,
  catalogCounts,
  highlightName,
  recolorHighlights,
  searchCatalog,
  withHighlights,
  withoutHighlights,
  MAX_HIGHLIGHTS,
  type CatalogEntry,
  type HighlightCat,
} from '../sim/loot/highlight';
import type { Panels } from './panels';
import { PRESET_NAMES, filterSamples, RUNE_NAME } from './panels-shared';

/** Filtre de butin : préréglages, règles au tap, aperçu immédiat sur des objets d'exemple */
/** Décisions du filtre affichées dans l'aperçu (valeur de `lootFilterDecision`) */
const FILTER_STATUS = ['Masqué', 'Affiché', 'Mis en valeur', 'Faisceau', 'Exceptionnel'];

export function lootFilterImpl(this: Panels, g: Game): HTMLElement {
  const col1 = filterRules(this, g);
  const col2 = filterPreview(g);
  const sub = filterTabs(this, g);
  const inner =
    this.filterUi.tab === 'hl' ? this.highlightTab(g) : this.filterUi.tab === 'tiers' ? this.tiersTab(g) : el('div', { style: { display: 'flex', gap: '8px', flex: '1', minHeight: '0' } }, col1, col2);
  return this.frame('Filtre de butin', el('div', { cls: 'col', style: { flex: '1', minWidth: '0' } }, sub, inner));
}

/** Colonne des règles : préréglage, équipement, runes / gemmes / potions, ramassage et affichage */
function filterRules(p: Panels, g: Game): HTMLElement {
  const f = g.character.filter;
  const row = (label: string, input: HTMLElement) => el('div', { cls: 'statrow' }, el('span', { textContent: label }), input);
  const chips = <K extends keyof LootFilterSettings>(key: K, vals: [LootFilterSettings[K], string][]) => {
    const box = el('div', { cls: 'tabs' });
    for (const [v, l] of vals) {
      const b = el('button', { cls: `btn${f[key] === v ? ' sel' : ''}`, textContent: l });
      b.addEventListener('click', () => {
        g.setFilter({ [key]: v } as Partial<LootFilterSettings>);
        p.render();
      });
      box.append(b);
    }
    return box;
  };
  const yesNo = (key: keyof LootFilterSettings) =>
    chips(key, [
      [true as never, 'Oui'],
      [false as never, 'Non'],
    ]);
  const presets = el('div', { cls: 'tabs presets' });
  for (const id of FILTER_PRESET_IDS) {
    const b = el('button', { cls: `btn${f.preset === id ? ' sel' : ''}`, textContent: PRESET_NAMES[id] });
    b.addEventListener('click', () => {
      g.setFilter({ preset: id });
      p.render();
    });
    presets.append(b);
  }
  const col1 = el(
    'div',
    { cls: 'col scroll', style: { flex: '1.3' } },
    el('div', { cls: 'lvl', textContent: `Préréglage${f.preset === 'custom' ? ' (personnalisé)' : ''}` }),
    presets,
    el('div', { cls: 'lvl', textContent: 'Équipement' }),
    row(
      'Rareté minimale',
      chips('minQuality', [
        [0, 'Tout'],
        [1, 'Magique+'],
        [2, 'Rare+'],
        [3, 'Set/unique'],
      ]),
    ),
    row(
      'Bases normales et magiques',
      chips('minBaseTier', [
        [0, 'Toutes'],
        [1, 'Exceptionnelles+'],
        [2, 'Élites'],
      ]),
    ),
    row('Masquer l’équipement d’une autre classe', yesNo('classLock')),
    row('Masquer l’équipement dépassé par mon niveau', yesNo('levelAware')),
    row('Bases à châsses (mots runiques)', yesNo('showSocketedNormals')),
    row('Bases éthérées', yesNo('showEthereal')),
    row('Objets supérieurs', yesNo('showSuperior')),
    el('div', { cls: 'lvl', textContent: 'Runes, gemmes, potions' }),
    row(
      'Runes masquées',
      chips('hideLowRunes', [
        [0, 'Aucune'],
        [4, `< ${RUNE_NAME(4)}`],
        [9, `< ${RUNE_NAME(9)}`],
        [15, `< ${RUNE_NAME(15)}`],
      ]),
    ),
    row(
      'Faisceau dès',
      chips(
        'beamRuneRank',
        [8, 12, 15, 20].map((v) => [v, RUNE_NAME(v)] as [number, string]),
      ),
    ),
    row(
      'Gemmes dès',
      chips('minGemGrade', [
        [0, 'Ébréchées'],
        [2, 'Normales'],
        [3, 'Sans défaut'],
        [4, 'Parfaites'],
      ]),
    ),
    row('Étiquettes des potions', yesNo('showPotions')),
    row('Masquer l’or au sol', yesNo('hideGold')),
    row('Masquer les clés au sol', yesNo('hideKeys')),
    el('div', { cls: 'lvl', textContent: 'Ramassage et affichage' }),
    el('div', { cls: 'base', textContent: 'Seul l’or est ramassé automatiquement ; touchez les autres objets pour les ramasser.' }),
    row('Révéler les objets masqués (estompés)', yesNo('revealHidden')),
  );
  return col1;
}

/** Aperçu : décision du filtre pour des objets types */
function filterPreview(g: Game): HTMLElement {
  const list = el('div', { cls: 'filterpreview' });
  for (const it of filterSamples()) {
    const v = lootFilterDecision(g.character, it);
    list.append(
      el(
        'div',
        { cls: `fprow${v <= 0 ? ' off' : ''}` },
        el('span', { cls: `label-inline ${labelClass(it)}`, textContent: itemName(it) }),
        el('span', { cls: `fstat s${Math.max(0, v)}`, textContent: FILTER_STATUS[Math.max(0, v)] }),
      ),
    );
  }
  const col2 = el(
    'div',
    { cls: 'col scroll', style: { flex: '1' } },
    el('div', { cls: 'lvl', textContent: 'Aperçu' }),
    el('div', { cls: 'base', textContent: 'Or, cartes, orbes, sets et uniques sont toujours affichés et ramassés.' }),
    list,
  );
  return col2;
}

/** Onglets du panneau : Règles, Surbrillance (n), Paliers (n) */
function filterTabs(p: Panels, g: Game): HTMLElement {
  const f = g.character.filter;
  const sub = el('div', { cls: 'tabs' });
  for (const [id, label] of [
    ['rules', 'Règles'],
    ['hl', `Surbrillance (${f.highlight?.length ?? 0})`],
    ['tiers', `Paliers (${f.tierOverride?.length ?? 0})`],
  ] as const) {
    const b = el('button', { cls: `btn${p.filterUi.tab === id ? ' sel' : ''}`, textContent: label, data: { testid: `filter-tab-${id}` } });
    b.addEventListener('click', () => {
      p.filterUi.tab = id;
      p.render();
    });
    sub.append(b);
  }
  return sub;
}

/** Second onglet du filtre : liste de surbrillance (parcours de toute la base par catégorie ou recherche, sélection multiple, couleur au choix, affichage forcé) */
/** Résultats affichés par page dans l'onglet Surbrillance */
const HL_PAGE = 80;
const hlCss = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * Onglet « Surbrillance » du filtre de butin : recherche dans le catalogue (texte, catégorie), sélection en un toucher, couleur des prochaines
 * sélections, actions groupées sur les résultats affichés, liste sélectionnée (couleur, « forcé », retrait). Les deux colonnes se redessinent
 * sur place (sans reconstruire le panneau) pour garder la recherche et le défilement.
 */
class HighlightTab {
  readonly results = el('div', { cls: 'hlresults scroll', data: { testid: 'hl-results' } });
  readonly summary = el('div', { cls: 'base hlsum', data: { testid: 'hl-summary' } });
  readonly title = el('div', { cls: 'lvl' });
  readonly entries = el('div', { cls: 'col scroll hllist', data: { testid: 'hl-list' } });
  /** Résultats de la recherche en cours */
  found: CatalogEntry[] = [];

  constructor(
    readonly p: Panels,
    readonly g: Game,
  ) {}

  cur(): HighlightEntry[] {
    return this.g.character.filter.highlight ?? [];
  }

  set(list: HighlightEntry[]): void {
    this.g.setFilter({ highlight: list });
  }

  /** Liste sélectionnée (colonne de droite) et compteur de l'onglet */
  fillEntries(): void {
    const list = this.cur();
    this.title.textContent = `Ma liste (${list.length}/${MAX_HIGHLIGHTS})`;
    const tb = document.querySelector('[data-testid="filter-tab-hl"]');
    if (tb) tb.textContent = `Surbrillance (${list.length})`;
    this.entries.replaceChildren();
    if (!list.length)
      this.entries.append(
        el('div', {
          cls: 'base',
          textContent: 'Rien pour l’instant : parcours une catégorie ou cherche un objet à gauche et touche-le pour le sélectionner. Il s’affichera au sol dans la couleur choisie.',
        }),
      );
    for (const e of list) {
      const dot = el('button', { cls: 'hldot', title: 'Changer la couleur', style: { background: hlCss(e.color) }, data: { testid: 'hl-dot' } });
      dot.addEventListener('click', () => {
        this.p.filterUi.hlEdit = this.p.filterUi.hlEdit === e.id ? null : e.id;
        this.fillEntries();
      });
      const force = el('button', { cls: `btn${e.force ? ' sel' : ''}`, textContent: e.force ? 'Forcé' : 'Filtre', title: 'Forcé : affiché même masqué par le filtre ; Filtre : suit le filtre' });
      force.addEventListener('click', () => {
        this.set(this.cur().map((x) => (x.id === e.id ? { ...x, force: !x.force || undefined } : x)));
        this.fillEntries();
      });
      const del = el('button', { cls: 'btn', textContent: '✕', title: 'Retirer de la liste' });
      del.addEventListener('click', () => {
        this.set(withoutHighlights(this.cur(), [e.id]));
        this.fillEntries();
        this.fillResults(false);
      });
      this.entries.append(el('div', { cls: 'hlentry' }, dot, el('span', { cls: 'n', textContent: highlightName(e.id), style: { color: hlCss(e.color) } }), force, del));
      if (this.p.filterUi.hlEdit === e.id) {
        const pal = el('div', { cls: 'hlpalette' });
        for (const col of HIGHLIGHT_COLORS) {
          const sw = el('button', { cls: `hldot${col === e.color ? ' sel' : ''}`, style: { background: hlCss(col) } });
          sw.addEventListener('click', () => {
            this.set(recolorHighlights(this.cur(), [e.id], col));
            this.p.filterUi.hlEdit = null;
            this.fillEntries();
          });
          pal.append(sw);
        }
        this.entries.append(pal);
      }
    }
  }

  /** Nombre de résultats et de sélectionnés parmi eux */
  updateSummary(): void {
    const have = new Set(this.cur().map((x) => x.id));
    const n = this.found.reduce((k, e) => k + (have.has(e.id) ? 1 : 0), 0);
    this.summary.textContent = `${this.found.length} objet${this.found.length > 1 ? 's' : ''} · ${n} sélectionné${n > 1 ? 's' : ''}`;
  }

  /** Reconstruit la liste de résultats ; `reset` : retour en haut (nouvelle recherche ou catégorie) */
  fillResults(reset: boolean): void {
    if (reset) {
      this.p.filterUi.hlShown = HL_PAGE;
      this.found = searchCatalog(this.p.filterUi.hlQuery, this.p.filterUi.hlCat, Infinity, tr);
    }
    const keepTop = this.results.scrollTop;
    this.results.replaceChildren();
    const have = new Set(this.cur().map((x) => x.id));
    if (!this.found.length) this.results.append(el('div', { cls: 'base', textContent: 'Aucun résultat.' }));
    for (const e of this.found.slice(0, this.p.filterUi.hlShown)) {
      const on = have.has(e.id);
      const meta = [e.tier === 1 ? 'Exc.' : e.tier === 2 ? 'Élite' : '', e.lvl ? `niv. ${e.lvl}` : ''].filter(Boolean).join(' · ');
      const b = el(
        'button',
        { cls: `hlrow${on ? ' on' : ''}`, data: { testid: 'hl-result' } },
        el('span', { cls: 'k', textContent: on ? '☑' : '☐' }),
        el('span', { cls: 'n', textContent: e.name }),
        el('span', { cls: 'm', textContent: meta }),
      );
      b.addEventListener('click', () => {
        if (have.has(e.id)) {
          this.set(withoutHighlights(this.cur(), [e.id]));
        } else {
          const r = withHighlights(this.cur(), [e.id], this.p.filterUi.hlColor);
          if (!r.added) {
            this.p.host.message(`Liste pleine (${MAX_HIGHLIGHTS} objets maximum).`, '#e8b04a');
            return;
          }
          this.set(r.list);
        }
        this.fillEntries();
        this.fillResults(false);
      });
      this.results.append(b);
    }
    if (this.found.length > this.p.filterUi.hlShown) {
      const more = el('button', { cls: 'btn', textContent: `Afficher plus (${this.found.length - this.p.filterUi.hlShown} restants)`, data: { testid: 'hl-more' } });
      more.addEventListener('click', () => {
        this.p.filterUi.hlShown += HL_PAGE;
        this.fillResults(false);
      });
      this.results.append(more);
    }
    this.results.scrollTop = reset ? 0 : keepTop;
    this.updateSummary();
  }
}

export function highlightTabImpl(this: Panels, g: Game): HTMLElement {
  const t = new HighlightTab(this, g);
  const counts = catalogCounts();
  const search = el('input', { type: 'search', placeholder: 'Rechercher (nom, sans accents)…', value: t.p.filterUi.hlQuery, data: { testid: 'hl-search' } }) as HTMLInputElement;
  search.addEventListener('input', () => {
    t.p.filterUi.hlQuery = search.value;
    t.fillResults(true);
  });
  // catégorie : liste déroulante avec effectifs (gagne de la place sur petit écran)
  const cats = el('select', { data: { testid: 'hl-cat' } }) as HTMLSelectElement;
  for (const [id, label] of [['all', 'Tout'], ...HIGHLIGHT_CATS] as [HighlightCat | 'all', string][])
    cats.append(el('option', { value: id, textContent: `${label} (${counts[id]})`, selected: t.p.filterUi.hlCat === id }));
  cats.addEventListener('change', () => {
    t.p.filterUi.hlCat = cats.value as HighlightCat | 'all';
    t.fillResults(true);
  });

  // couleur appliquée aux nouvelles sélections
  const pick = el('div', { cls: 'hlpalette hlpick' });
  const paintPick = () => {
    pick.replaceChildren();
    for (const col of HIGHLIGHT_COLORS) {
      const sw = el('button', {
        cls: `hldot${col === t.p.filterUi.hlColor ? ' sel' : ''}`,
        title: 'Couleur des prochaines sélections',
        style: { background: hlCss(col) },
        data: { testid: 'hl-pick' },
      });
      sw.addEventListener('click', () => {
        t.p.filterUi.hlColor = col;
        paintPick();
      });
      pick.append(sw);
    }
  };
  paintPick();

  const all = el('button', { cls: 'btn', textContent: 'Tout sélectionner', title: 'Sélectionne tous les objets affichés (catégorie et recherche en cours)', data: { testid: 'hl-all' } });
  all.addEventListener('click', () => {
    const r = withHighlights(
      t.cur(),
      t.found.map((e) => e.id),
      t.p.filterUi.hlColor,
    );
    if (r.added < t.found.filter((e) => !t.cur().some((x) => x.id === e.id)).length) t.p.host.message(`Liste pleine : ${MAX_HIGHLIGHTS} objets maximum.`, '#e8b04a');
    t.set(r.list);
    t.fillEntries();
    t.fillResults(false);
  });
  const none = el('button', { cls: 'btn', textContent: 'Tout désélectionner', title: 'Retire de la liste tous les objets affichés', data: { testid: 'hl-none' } });
  none.addEventListener('click', () => {
    t.set(
      withoutHighlights(
        t.cur(),
        t.found.map((e) => e.id),
      ),
    );
    t.fillEntries();
    t.fillResults(false);
  });
  const recolor = el('button', {
    cls: 'btn',
    textContent: 'Appliquer la couleur',
    title: 'Applique la couleur choisie aux objets déjà sélectionnés parmi ceux affichés',
    data: { testid: 'hl-recolor' },
  });
  recolor.addEventListener('click', () => {
    t.set(
      recolorHighlights(
        t.cur(),
        t.found.map((e) => e.id),
        t.p.filterUi.hlColor,
      ),
    );
    t.fillEntries();
  });
  const clear = el('button', { cls: 'btn', textContent: 'Vider', title: 'Vide toute la liste de surbrillance', data: { testid: 'hl-clear' } });
  clear.addEventListener('click', () => {
    if (!t.cur().length) return;
    t.set([]);
    t.fillEntries();
    t.fillResults(false);
  });

  t.fillEntries();
  t.fillResults(true);
  const left = el(
    'div',
    { cls: 'col', style: { flex: '1.3', minWidth: '0' } },
    el('div', { style: { display: 'flex', gap: '6px' } }, search, cats),
    pick,
    el('div', { cls: 'hlbar' }, all, none, recolor),
    t.summary,
    t.results,
  );
  const right = el(
    'div',
    { cls: 'col', style: { flex: '1', minWidth: '0' } },
    el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'space-between' } }, t.title, clear),
    el('div', { cls: 'base', textContent: '« Forcé » : affiché même masqué par le filtre.' }),
    t.entries,
  );
  return el('div', { style: { display: 'flex', gap: '8px', flex: '1', minHeight: '0' } }, left, right);
}

/** Troisième onglet du filtre : réaffecter des objets à un autre palier de butin (5 graal, 4 exceptionnel, 3 utile, aucun) */
/** Résultats affichés par page dans l'onglet Paliers */
const TD_PAGE = 70;
const TD_LABEL: Record<number, string> = { 5: 'Palier 5', 4: 'Palier 4', 3: 'Palier 3', 0: 'Sans palier' };
/** Paliers dans l'ordre de ↑ (monter d'un palier) */
const TD_ORDER = [0, 3, 4, 5];

/**
 * Onglet « Paliers » du filtre de butin : palier d'affichage de chaque objet du catalogue (recherche, catégorie, palier), sélection,
 * déplacement d'un palier ou vers un palier donné, retour au palier par défaut. Les résultats se redessinent sur place.
 */
class TiersTab {
  readonly results = el('div', { cls: 'hlresults scroll', style: { minHeight: '170px' }, data: { testid: 'td-results' } });
  readonly summary = el('div', { cls: 'base hlsum', data: { testid: 'td-summary' } });
  /** Résultats de la recherche en cours, triés par palier */
  found: CatalogEntry[] = [];

  constructor(
    readonly p: Panels,
    readonly g: Game,
  ) {}

  cur(): TierOverrideEntry[] {
    return this.g.character.filter.tierOverride ?? [];
  }

  isMod(id: string): boolean {
    return this.cur().some((x) => x.id === id);
  }

  /** Change le palier des objets `ids` (null : palier par défaut) ; un palier égal au palier par défaut n'est pas un override */
  apply(ids: string[], tier: OverrideTier | null): void {
    if (!ids.length) return;
    // un palier égal au palier par défaut n'est pas un override
    const set = ids.filter((id) => tier !== null && defaultTierOf(id) !== tier);
    const clear = ids.filter((id) => tier === null || defaultTierOf(id) === tier);
    let list = withTierOverrides(this.cur(), clear, null).list;
    const r = withTierOverrides(list, set, tier);
    if (r.skipped) this.p.host.message(`Trop de paliers modifiés (${MAX_TIER_OVERRIDES} au plus).`, '#e8b04a');
    list = r.list;
    this.g.setFilter({ tierOverride: list.length ? list : undefined });
    this.p.filterUi.tierConfirm = false;
    const top = this.results.scrollTop;
    const shown = this.p.filterUi.tierShown;
    this.fillResults(true);
    this.p.filterUi.tierShown = shown;
    this.fillResults(false);
    this.results.scrollTop = top;
  }

  /** Reconstruit la liste de résultats ; `reset` : nouvelle recherche (filtres, tri par palier, retour en haut) */
  fillResults(reset: boolean): void {
    const c = this.g.character;
    if (reset) {
      this.p.filterUi.tierShown = TD_PAGE;
      const q = this.p.filterUi.tierQuery.trim();
      let list = searchCatalog(q, this.p.filterUi.tierCat, Infinity, tr);
      const t = this.p.filterUi.tierFilter;
      list = list.filter((e) => {
        const v = tierOf(c, e.id);
        if (t === 'mod') return this.isMod(e.id);
        if (t === 'all') return v > 0 || q !== '' || this.p.filterUi.tierCat !== 'all';
        return v === Number(t);
      });
      this.found = list
        .map((e, i) => ({ e, i, v: tierOf(c, e.id) }))
        .sort((a, b) => b.v - a.v || a.i - b.i)
        .map((x) => x.e);
    }
    const keepTop = this.results.scrollTop;
    this.results.replaceChildren();
    if (!this.found.length) this.results.append(el('div', { cls: 'base', textContent: 'Aucun résultat.' }));
    let lastTier = -1;
    for (const e of this.found.slice(0, this.p.filterUi.tierShown)) {
      const v = tierOf(c, e.id);
      if (v !== lastTier) {
        lastTier = v;
        this.results.append(el('div', { cls: `lvl tdhead t${v}`, textContent: TD_LABEL[v] }));
      }
      const mod = this.isMod(e.id);
      const on = this.p.filterUi.tierSel.has(e.id);
      const chk = el('button', { cls: 'tdchk', textContent: on ? '☑' : '☐', title: 'Sélectionner', data: { testid: 'td-chk' } });
      chk.addEventListener('click', () => {
        if (on) this.p.filterUi.tierSel.delete(e.id);
        else this.p.filterUi.tierSel.add(e.id);
        this.fillResults(false);
      });
      const up = el('button', { cls: 'btn tdbtn', textContent: '↑', title: 'Monter d’un palier', data: { testid: 'td-up' } });
      up.disabled = v >= 5;
      up.addEventListener('click', () => this.apply([e.id], (TD_ORDER[TD_ORDER.indexOf(v) + 1] ?? 5) as OverrideTier));
      const down = el('button', { cls: 'btn tdbtn', textContent: '↓', title: 'Descendre d’un palier (ou retirer)', data: { testid: 'td-down' } });
      down.disabled = v <= 0;
      down.addEventListener('click', () => this.apply([e.id], (TD_ORDER[Math.max(0, TD_ORDER.indexOf(v) - 1)] ?? 0) as OverrideTier));
      const meta = [e.tier === 1 ? 'Exc.' : e.tier === 2 ? 'Élite' : '', e.lvl ? `niv. ${e.lvl}` : ''].filter(Boolean).join(' · ');
      const reset = el('button', { cls: 'btn tdbtn', textContent: '↺', title: 'Remettre le palier par défaut', data: { testid: 'td-reset' } });
      reset.disabled = !mod;
      reset.addEventListener('click', () => this.apply([e.id], null));
      this.results.append(
        el(
          'div',
          { cls: `tdrow${on ? ' on' : ''}${mod ? ' mod' : ''}`, data: { testid: 'td-row', id: e.id, tier: String(v) } },
          chk,
          el('span', { cls: `tddot t${v}` }),
          el('span', { cls: 'n', textContent: e.name }),
          el('span', { cls: 'm', textContent: mod ? `modifié · ${meta}` : meta }),
          down,
          up,
          reset,
        ),
      );
    }
    if (this.found.length > this.p.filterUi.tierShown) {
      const more = el('button', { cls: 'btn', textContent: `Afficher plus (${this.found.length - this.p.filterUi.tierShown} restants)`, data: { testid: 'td-more' } });
      more.addEventListener('click', () => {
        this.p.filterUi.tierShown += TD_PAGE;
        this.fillResults(false);
      });
      this.results.append(more);
    }
    this.results.scrollTop = reset ? 0 : keepTop;
    const n = this.cur().length;
    this.summary.textContent = `${this.found.length} objet${this.found.length > 1 ? 's' : ''} · ${this.p.filterUi.tierSel.size} sélectionné${this.p.filterUi.tierSel.size > 1 ? 's' : ''} · ${n} objet${n > 1 ? 's' : ''} modifié${n > 1 ? 's' : ''}`;
    const tb = document.querySelector('[data-testid="filter-tab-tiers"]');
    if (tb) tb.textContent = `Paliers (${n})`;
  }
}

export function tiersTabImpl(this: Panels, g: Game): HTMLElement {
  const t = new TiersTab(this, g);
  const counts = catalogCounts();
  const search = el('input', { type: 'search', placeholder: 'Rechercher (nom, sans accents)…', value: t.p.filterUi.tierQuery, data: { testid: 'td-search' } }) as HTMLInputElement;
  search.addEventListener('input', () => {
    t.p.filterUi.tierQuery = search.value;
    t.fillResults(true);
  });
  const cats = el('select', { data: { testid: 'td-cat' } }) as HTMLSelectElement;
  for (const [id, label] of [['all', 'Tout'], ...HIGHLIGHT_CATS] as [HighlightCat | 'all', string][])
    cats.append(el('option', { value: id, textContent: `${label} (${counts[id]})`, selected: t.p.filterUi.tierCat === id }));
  cats.addEventListener('change', () => {
    t.p.filterUi.tierCat = cats.value as HighlightCat | 'all';
    t.fillResults(true);
  });
  const tiers = el('select', { data: { testid: 'td-tier' } }) as HTMLSelectElement;
  for (const [id, label] of [
    ['all', 'Tous les paliers'],
    ['5', 'Palier 5'],
    ['4', 'Palier 4'],
    ['3', 'Palier 3'],
    ['0', 'Sans palier'],
    ['mod', 'Modifiés'],
  ])
    tiers.append(el('option', { value: id, textContent: label, selected: t.p.filterUi.tierFilter === id }));
  tiers.addEventListener('change', () => {
    t.p.filterUi.tierFilter = tiers.value;
    t.fillResults(true);
  });

  const bar = el('div', { cls: 'hlbar' });
  bar.append(el('span', { cls: 'base', textContent: 'Déplacer la sélection vers :', style: { alignSelf: 'center' } }));
  for (const [tier, label] of [
    [5, '5'],
    [4, '4'],
    [3, '3'],
    [0, 'Aucun'],
    [null, 'Par défaut'],
  ] as [OverrideTier | null, string][]) {
    const b = el('button', { cls: 'btn', textContent: label, data: { testid: `td-move-${tier ?? 'default'}` } });
    b.addEventListener('click', () => t.apply([...t.p.filterUi.tierSel], tier));
    bar.append(b);
  }
  const selAll = el('button', { cls: 'btn', textContent: 'Sélectionner les affichés', data: { testid: 'td-all' } });
  selAll.addEventListener('click', () => {
    for (const e of t.found) t.p.filterUi.tierSel.add(e.id);
    t.fillResults(false);
  });
  const selNone = el('button', { cls: 'btn', textContent: 'Désélectionner', data: { testid: 'td-none' } });
  selNone.addEventListener('click', () => {
    t.p.filterUi.tierSel.clear();
    t.fillResults(false);
  });
  const resetAll = el('button', { cls: 'btn', textContent: t.p.filterUi.tierConfirm ? 'Confirmer : tout remettre ?' : 'Tout remettre par défaut', data: { testid: 'td-reset-all' } });
  resetAll.addEventListener('click', () => {
    if (!t.cur().length) return;
    if (!t.p.filterUi.tierConfirm) {
      t.p.filterUi.tierConfirm = true;
      resetAll.textContent = 'Confirmer : tout remettre ?';
      return;
    }
    t.p.filterUi.tierConfirm = false;
    resetAll.textContent = 'Tout remettre par défaut';
    t.g.setFilter({ tierOverride: undefined });
    t.fillResults(true);
  });
  t.fillResults(true);
  return el(
    'div',
    { cls: 'col', style: { flex: '1', minWidth: '0', minHeight: '0', overflowY: 'auto' } },
    el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, search, cats, tiers),
    el('div', { cls: 'base', textContent: 'Choisis le palier d’affichage (faisceau, couleur, annonce, son) de chaque objet. Cela ne rend jamais visible un objet masqué par le filtre.' }),
    bar,
    el('div', { cls: 'hlbar' }, selAll, selNone, resetAll),
    t.summary,
    t.results,
  );
}
