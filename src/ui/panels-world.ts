/**
 * Panneaux de monde : cube horadrique, cartes, campagne et points de passage.
 * Fonctions extraites de la classe Panels (panels.ts) : `this` y désigne l'instance.
 */
import type { Game } from '../sim/game';
import type { Item } from '../sim/item';
import { DIFF_NAMES } from '../data/types';
import { rushRecLevel } from '../data/runs';
import { BASE_BY_ID } from '../data/items/bases';
import { CUBE_RECIPES, type CubeRecipe } from '../data/cube';
import { itemAccepted } from '../sim/cube';
import { matCount } from '../sim/materials';
import { itemName } from '../sim/itemstats';
import { el } from './dom';
import { labelClass } from './hud';
import { itemTooltip } from './itemtext';
import { CAMPAIGNS } from '../data/campaigns';
import { QUESTS } from '../data/quests';
import { d2Info } from '../render/assets';
import { STASH_TABS } from '../sim/character';
import { CORRUPTION_TABLES } from '../data/corruption';
import type { Panels } from './panels';
import { modParts, modScreenOf, modUiHost } from './panels-shared';
import { contributions } from '../mods/ui';

export function cubeImpl(this: Panels, g: Game): HTMLElement {
  const c = g.character;
  const modeBar = el('div', { cls: 'tabs' });
  for (const [book, label] of [
    [false, 'Grille du Cube'],
    [true, 'Livre de recettes'],
  ] as const) {
    const b = el('button', { cls: `btn${this.cubeUi.book === book ? ' sel' : ''}`, textContent: label });
    b.addEventListener('click', () => {
      this.cubeUi.book = book;
      this.render();
    });
    modeBar.append(b);
  }
  if (!this.cubeUi.book) return this.frame('Cube horadrique', el('div', { cls: 'col scroll', style: { flex: '1' } }, modeBar, this.cubeGridView(g, true)));
  const cats: CubeRecipe['category'][] = ['Runes', 'Gemmes', 'Châsses', 'Relances', 'Artisanat', 'Amélioration', 'Corruption', 'Cartes', 'Pandémonium'];
  const have = (id: string) => matCount(c, id);
  const eligible = (r: CubeRecipe) => (r.items ? c.inventory.map((it, i) => (it && itemAccepted(it, r.items!.accept) ? i : -1)).filter((i) => i >= 0) : []);
  const affordable = (r: CubeRecipe) => r.cost.every((k) => k.ids.reduce((a, id) => a + have(id), 0) >= k.n) && eligible(r).length >= (r.items?.n ?? 0);
  const catBar = el('div', { cls: 'col' });
  for (const cat of cats) {
    const n = CUBE_RECIPES.filter((r) => r.category === cat && affordable(r)).length;
    const b = el('button', { cls: `btn${cat === this.cubeUi.cat ? ' primary' : ''}`, textContent: n ? `${cat} (${n})` : cat });
    b.addEventListener('click', () => {
      this.cubeUi.cat = cat;
      this.cubeUi.recipe = null;
      this.cubeUi.sel = [];
      this.render();
    });
    catBar.append(b);
  }
  // recettes de la catégorie : pour runes et gemmes, seulement celles dont on possède l'ingrédient
  const list = el('div', { cls: 'col scroll', style: { flex: '1', minWidth: '160px' } });
  const inCat = CUBE_RECIPES.filter((r) => r.category === this.cubeUi.cat);
  const shown = this.cubeUi.all || (this.cubeUi.cat !== 'Runes' && this.cubeUi.cat !== 'Gemmes') ? inCat : inCat.filter((r) => have(r.cost[0]?.ids[0] ?? '') > 0);
  if (!shown.length) list.append(el('div', { cls: 'base', textContent: 'Aucune recette réalisable avec vos matériaux.' }));
  for (const r of shown) {
    const b = el('button', { cls: `btn${r.id === this.cubeUi.recipe ? ' primary' : ''}${affordable(r) ? ' q-rune' : ''}`, textContent: r.name });
    b.addEventListener('click', () => {
      this.cubeUi.recipe = r.id;
      this.cubeUi.sel = [];
      this.cubeUi.note = '';
      this.render();
    });
    list.append(b);
  }
  if (this.cubeUi.cat === 'Runes' || this.cubeUi.cat === 'Gemmes') {
    const t = el('button', { cls: 'btn', textContent: this.cubeUi.all ? 'Masquer les recettes inaccessibles' : 'Toutes les recettes' });
    t.addEventListener('click', () => ((this.cubeUi.all = !this.cubeUi.all), this.render()));
    list.append(t);
  }
  // détail : coût, objets éligibles, transmutation
  const info = el('div', { cls: 'col scroll', style: { flex: '1.3', minWidth: '200px' } });
  const r = this.cubeUi.recipe ? CUBE_RECIPES.find((x) => x.id === this.cubeUi.recipe) : null;
  if (!r) info.append(el('div', { cls: 'tip', textContent: 'Choisissez une recette. Les recettes réalisables sont en couleur.' }));
  else {
    info.append(el('div', { cls: 'tip' }, el('div', { cls: 't', textContent: r.name }), el('div', { cls: 'base', textContent: r.desc })));
    const cost = el('div', { cls: 'tip' });
    for (const k of r.cost) {
      const got = k.ids.reduce((a, id) => a + have(id), 0);
      cost.append(
        el(
          'div',
          { cls: `statrow ${got >= k.n ? 'q-rune' : 'q-normal'}` },
          el('span', { textContent: k.label ?? `${k.n} × ${BASE_BY_ID[k.ids[0]]?.name ?? k.ids[0]}` }),
          el('b', { textContent: `${got} / ${k.n}` }),
        ),
      );
    }
    if (r.cost.length) info.append(cost);
    if (r.items) {
      const need = r.items.n;
      info.append(el('div', { cls: 'base', textContent: `Objet${need > 1 ? 's' : ''} à placer (${this.cubeUi.sel.length} / ${need}) :` }));
      const grid = el('div', { cls: 'tabs', style: { flexWrap: 'wrap' } });
      for (const i of eligible(r)) {
        const it = c.inventory[i]!;
        const on = this.cubeUi.sel.includes(i);
        const b = el('button', { cls: `btn ${labelClass(it)}${on ? ' primary' : ''}`, textContent: itemName(it) });
        b.addEventListener('click', () => {
          this.cubeUi.sel = on ? this.cubeUi.sel.filter((x) => x !== i) : [...this.cubeUi.sel, i].slice(-need);
          this.render();
        });
        grid.append(b);
      }
      if (!grid.childElementCount) grid.append(el('div', { cls: 'base', textContent: 'Aucun objet de l’inventaire ne convient.' }));
      info.append(grid);
    }
    const go = el('button', { cls: 'btn primary stickybottom', textContent: 'Transmuter' });
    go.addEventListener('click', () => {
      const res = g.transmute(r.id, this.cubeUi.sel);
      if (!res.ok) {
        this.host.haptic('fail');
        this.cubeUi.note = res.reason ?? 'Impossible';
      } else {
        this.host.haptic('tap');
        const what = res.material ? (BASE_BY_ID[res.material]?.name ?? res.material) : res.item ? itemName(res.item) : '';
        this.cubeUi.note = `Résultat : ${what}${res.note ? ` — ${res.note}` : ''}`;
        this.cubeUi.sel = [];
        if (res.run) {
          // portail du Pandémonium : la run s'ouvre aussitôt (Enfer)
          this.hide();
          g.enterPandemonium(res.run);
          return;
        }
      }
      this.render();
    });
    info.append(go);
    if (this.cubeUi.note) info.append(el('div', { cls: 'tip', textContent: this.cubeUi.note }));
    const last = this.cubeUi.sel.length ? c.inventory[this.cubeUi.sel[this.cubeUi.sel.length - 1]] : null;
    if (last) info.append(itemTooltip(last, c));
  }
  return this.frame('Cube horadrique', el('div', { cls: 'col scroll' }, modeBar, catBar), list, info);
}

export function mapsImpl(this: Panels, g: Game): HTMLElement {
  const c = g.character;
  const can = g.canOpenMaps();
  const list = el('div', { cls: 'col scroll', style: { flex: '1' } });
  list.append(
    el(
      'div',
      { cls: 'tip' },
      el('div', { cls: 't', textContent: 'Anya' }),
      el('div', {
        cls: 'base',
        textContent: can.ok
          ? `Palier le plus haut terminé : ${c.progression.mapTierMax || '—'}. Choisissez une carte : elle est consommée à l’ouverture. Les orbes et le Cube transforment les cartes.`
          : `Les cartes vous seront ouvertes plus tard. ${can.reason ?? ''}`,
      }),
    ),
  );
  const entries: { it: Item; open: () => { ok: boolean; reason?: string }; where: string }[] = [];
  c.inventory.forEach((it, i) => it?.map && entries.push({ it, open: () => g.startMap({ invIndex: i }), where: 'Inventaire' }));
  c.stash.forEach((tab, t) =>
    tab.forEach((it, i) => it?.map && entries.push({ it, open: () => g.startMap({ tab: t, idx: i }), where: t >= STASH_TABS ? `Coffre, page ${t - STASH_TABS + 1}` : `Coffre ${t + 1}` })),
  );
  (c.mapStash ?? []).forEach((it, i) => it.map && entries.push({ it, open: () => g.startMap({ mapIdx: i }), where: 'Coffre de cartes' }));
  entries.sort((a, b) => b.it.map!.tier - a.it.map!.tier || ['normal', 'magic', 'rare'].indexOf(b.it.quality) - ['normal', 'magic', 'rare'].indexOf(a.it.quality));
  if (!entries.length) list.append(el('div', { cls: 'base', textContent: 'Aucune carte dans l’inventaire ni le coffre.' }));
  for (const e of entries) {
    const row = el('div', { cls: 'runcard' }, itemTooltip(e.it, c), el('div', { cls: 'base', textContent: e.where }));
    const b = el('button', { cls: `btn${can.ok ? ' primary' : ''}`, textContent: 'Ouvrir la carte', disabled: !can.ok });
    b.addEventListener('click', () => {
      const r = e.open();
      if (!r.ok) {
        this.host.haptic('fail');
        b.textContent = r.reason ?? 'Impossible';
        return;
      }
      this.hide();
    });
    row.append(b);
    list.append(row);
  }
  return this.frame('Cartes', list);
}

/** Campagne de l'Acte IV : une carte par zone, découverte en jouant (points de passage) */
export function campaignImpl(this: Panels, g: Game): HTMLElement {
  const c = g.character;
  const diffs = el('div', { cls: 'tabs' });
  for (const d of [0, 1, 2] as const) {
    const ok = d <= c.progression.highestDifficulty;
    const b = el('button', { cls: `btn${this.waypointUi.campDiff === d ? ' sel' : ''}`, textContent: DIFF_NAMES[d], disabled: !ok });
    b.addEventListener('click', () => {
      this.waypointUi.campDiff = d;
      this.render();
    });
    diffs.append(b);
  }
  // lot 319 (Diablo II): only the acts open at this difficulty (Act I, then each act whose previous boss is dead); an act shut is not listed
  const acts = g.openActs(this.waypointUi.campDiff as 0 | 1 | 2);
  if (!acts.includes(this.waypointUi.campAct)) this.waypointUi.campAct = acts[acts.length - 1] ?? 'act1';
  const actBar = el(
    'div',
    { cls: 'tabs' },
    ...CAMPAIGNS.filter((c) => acts.includes(c.id)).map((c) => {
      const b = el('button', { cls: `btn${this.waypointUi.campAct === c.id ? ' sel' : ''}`, textContent: c.name });
      b.addEventListener('click', () => {
        this.waypointUi.campAct = c.id;
        this.render();
      });
      return b;
    }),
  );
  const cards = el('div', { cls: 'runs' });
  const camp = CAMPAIGNS.find((x) => x.id === this.waypointUi.campAct);
  if (camp && !camp.available()) {
    // cartes de la campagne pas encore chargées : téléchargement à la demande (une seule fois, gardées par le navigateur)
    const local = d2Info.local;
    const btn = el('button', { cls: 'btn primary', textContent: local ? `Préparer les cartes — ${camp.name}` : `Télécharger les cartes — ${camp.name}` });
    btn.addEventListener('click', () => {
      btn.disabled = true;
      void this.host
        .loadCampaign?.(`a${this.waypointUi.campAct.slice(3)}`, (d, t) => (btn.textContent = local ? `Préparation… ${d} / ${t}` : `Téléchargement… ${d} / ${t}`))
        .finally(() => this.render());
    });
    const note = local
      ? `Les cartes de l’${camp.name} sont fabriquées sur l’appareil à partir de tes fichiers Diablo II, une seule fois (quelques minutes, puis elles restent sur l’appareil). Les images de chaque zone sont préparées à ta première visite.`
      : `Les cartes de l’${camp.name} se téléchargent une seule fois (quelques dizaines de Mo, de préférence en Wi-Fi) puis restent sur l’appareil.`;
    return el('div', { cls: 'col', style: { flexShrink: '0' } }, actBar, el('div', { cls: 'tip', textContent: note }), btn);
  }
  // lot 319: a waypoint touched is a destination, whatever the hero's level (Diablo II asks none)
  for (const z of g.campaignZones(this.waypointUi.campAct)) {
    const ok = z.visited;
    const b = el(
      'button',
      { cls: `btn${ok ? ' primary' : ''}`, disabled: !ok },
      z.visited ? 'Aller' : 'Point de passage non activé',
      el('br'),
      el('small', {
        cls: 'base',
        textContent: z.visited ? `Monstres niv. ${z.run.zoneLevel[this.waypointUi.campDiff]}` : 'Touchez son point de passage',
      }),
    );
    b.addEventListener('click', () => {
      this.hide();
      g.startRun(z.run.id, this.waypointUi.campDiff as 0 | 1 | 2);
    });
    cards.append(el('div', { cls: 'runcard' }, el('h3', { textContent: z.run.name }), el('div', { cls: 'd', textContent: z.run.desc }), el('div', { cls: 'diffs' }, b)));
  }
  const quests = el('div', { cls: 'runcard' }, el('h3', { textContent: 'Quêtes' }));
  for (const q of QUESTS.filter((x) => x.act === this.waypointUi.campAct)) {
    const done = g.questDone(q.id, this.waypointUi.campDiff as 0 | 1 | 2);
    const rw = q.rewardText ?? '';
    quests.append(el('div', { cls: 'd', textContent: `${done ? '✓' : '○'} ${q.name} — ${q.desc}${rw ? ` (${rw})` : ''}` }));
  }
  return el(
    'div',
    { cls: 'col', style: { flexShrink: '0' } },
    actBar,
    el('div', {
      cls: 'tip',
      textContent:
        'Campagne : comme dans Diablo II, une zone qui a un point de passage s’ajoute ici dès que vous touchez le sien ; la ville est toujours ouverte. Une zone garde son état pendant la partie (elle est recréée au prochain lancement du jeu).',
    }),
    diffs,
    cards,
    quests,
  );
}

export function waypointImpl(this: Panels, g: Game): HTMLElement {
  const c = g.character;
  const hasCampaign = !!this.host.loadCampaign && (d2Info.mode !== 'off' || d2Info.local) && !d2Info.locked;
  // lot 322 (owner): the Rush tab is back in the Campaign's waypoint (its towns and zones), the player may switch to the Rush at any time; it
  // opens on the Campaign (Panels.show: the act and difficulty played). Lot 319's rest kept: only the open acts, no level, the quest locks
  // (a Rush run stays a run apart: no Campaign milestone, no lock passed). Harrogath, the Rush's hub, keeps both as before
  const inCampaign = !!g.campaignActive;
  const views = hasCampaign || inCampaign;
  const modeBar = views
    ? el(
        'div',
        { cls: 'tabs' },
        ...(['rush', 'campaign'] as const).map((m) => {
          const b = el('button', { cls: `btn${this.waypointUi.mode === m ? ' sel' : ''}`, textContent: m === 'rush' ? 'Rush — boss et runs' : 'Campagne' });
          b.addEventListener('click', () => {
            this.waypointUi.mode = m;
            this.render();
          });
          return b;
        }),
      )
    : null;
  // sections added by the mods (slot `town.waypoint`: a game mode's entry), first, in both views (none in the base: nothing changes)
  const ctx = { game: g, host: modUiHost(this.host), screen: modScreenOf(this.host, this.root), render: () => this.render(), close: () => this.hide() };
  const extra = modParts(
    contributions('town.waypoint').map((f) => () => f(ctx)),
    null,
  ).filter((n): n is HTMLElement => !!n);
  if (views && this.waypointUi.mode === 'campaign')
    return this.frame('Point de passage', el('div', { cls: 'col scroll', style: { flex: '1' } }, ...(modeBar ? [modeBar] : []), ...extra, this.campaign(g)));
  const cards = el('div', { cls: 'runs' });
  const opts = g.runOptions();
  const byRun = new Map<string, typeof opts>();
  for (const o of opts) byRun.set(o.run.id, [...(byRun.get(o.run.id) ?? []), o]);
  for (const [, list] of byRun) {
    const run = list[0].run;
    const diffs = el('div', { cls: 'diffs' });
    for (const o of list) {
      const done = c.progression.completions[`${run.id}:${o.difficulty}`] ?? 0;
      const claimed = c.progression.rewards.includes(`reward:${run.id}:${o.difficulty}`);
      const fc = run.firstClear;
      const reward = [
        fc.skillPoints ? `+${fc.skillPoints} compétence` : '',
        fc.statPoints ? `+${fc.statPoints} caractéristiques` : '',
        fc.resAll ? `+${fc.resAll} % résistances` : '',
        fc.respec ? '+1 réinitialisation' : '',
      ]
        .filter(Boolean)
        .join(', ');
      const b = el(
        'button',
        { cls: `btn${o.unlocked ? ' primary' : ''}`, disabled: !o.unlocked },
        `${DIFF_NAMES[o.difficulty]} — niv. ${rushRecLevel(run, o.difficulty)}`,
        el('br'),
        el('small', {
          cls: 'base',
          textContent: o.unlocked
            ? `Monstres niv. ${run.adaptive?.[o.difficulty] ? `${run.adaptive[o.difficulty]![0]}–${run.adaptive[o.difficulty]![1]} (suit votre niveau)` : run.zoneLevel[o.difficulty]}${done ? ` · ${done}×` : ''}`
            : (o.reason ?? ''),
        }),
        ...(reward && !claimed ? [el('br'), el('small', { cls: 'reward', textContent: `1er passage : ${reward}` })] : []),
      );
      b.addEventListener('click', () => {
        this.hide();
        g.startRun(run.id, o.difficulty, undefined, this.waypointUi.corruptRun && o.difficulty === 2);
      });
      diffs.append(b);
    }
    const focus = run.focus === 'xp' ? 'Expérience' : run.focus === 'items' ? 'Objets' : 'Expérience et objets';
    cards.append(el('div', { cls: 'runcard' }, el('h3', { textContent: run.name }), el('div', { cls: 'd', textContent: `${run.desc} Rapporte surtout : ${focus}.` }), diffs));
  }
  let corruptBar: HTMLElement | null = null;
  // zones corrompues : seulement avec un jeu de règles qui a la corruption (tables de corruption d'un mod ; pd2)
  if (c.progression.highestDifficulty >= 2 && c.level >= 75 && Object.keys(CORRUPTION_TABLES).length > 0) {
    const tg = el('button', {
      cls: `btn${this.waypointUi.corruptRun ? ' sel' : ''}`,
      textContent: this.waypointUi.corruptRun ? 'Zones corrompues : OUI (Enfer, niveau 85)' : 'Zones corrompues : non',
    });
    tg.addEventListener('click', () => {
      this.waypointUi.corruptRun = !this.waypointUi.corruptRun;
      this.render();
    });
    corruptBar = el('div', { cls: 'tabs' }, tg, el('span', { cls: 'base', textContent: '+30 % vie, +20 % dégâts, +40 % XP, +20 % butin, éclats de Pierre-Monde' }));
  }
  const pending = g.hasSuspendedRun ? el('div', { cls: 'tip', textContent: 'Une run est en attente derrière le portail de la ville : en lancer une autre l’abandonne (butin au sol compris).' }) : null;
  return this.frame(
    'Point de passage',
    el('div', { cls: 'col scroll', style: { flex: '1' } }, ...(modeBar ? [modeBar] : []), ...extra, ...(corruptBar ? [corruptBar] : []), ...(pending ? [pending] : []), cards),
  );
}
