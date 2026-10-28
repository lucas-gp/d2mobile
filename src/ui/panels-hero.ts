/**
 * Panneaux du héros : personnage, arbre de compétences, mercenaire, imprégnation et quête des châsses.
 * Fonctions extraites de la classe Panels (panels.ts) : `this` y désigne l'instance.
 */
import type { Game } from '../sim/game';
import { DIFF_NAMES, type SkillTree } from '../data/types';
import { SKILLS, SKILL_BY_ID, TREE_NAMES, type SorcSkill } from '../data/skills';
import { classOf } from '../data/classes';
import { baseOf, itemName } from '../sim/itemstats';
import { xpToReach } from '../sim/progression';
import { nextFcrBreakpoint, nextFhrBreakpoint } from '../sim/breakpoints';
import { el, fmt, holdButton } from './dom';
import { icon, labelClass } from './hud';
import { itemSize, occupancy, INV_COLS } from '../sim/inventory';
import { itemTooltip } from './itemtext';
import { skillLines } from './skilltext';
import { getLang, verbatim } from '../i18n';
import { MERC_AURA_RANGE_TEXT, mercAuraLines } from './merc-auras';
import { MERC_BY_ID, mercSlots, mercVariant, type MercSlot } from '../data/mercs';
import { canMercEquip, mercDerived, mercOf, mercSkillLvl } from '../sim/merc';
import type { Panels } from './panels';
import { D2_INFO_MIN_W, D2_GAP, d2Panel, d2Place, formatTime, modParts, modUiHost, portraitStack, PSTACK_VRES } from './panels-shared';
import { contributions } from '../mods/ui';

export function characterImpl(this: Panels, g: Game): HTMLElement {
  const alloc = statAllocation(this, g);
  const stats = statSheet(g);
  // sections ajoutées par les mods (point d'insertion `character.sheet`)
  const host = modUiHost(this.host);
  for (const n of modParts(
    contributions('character.sheet').map((f) => () => f({ game: g, host })),
    null,
  ))
    if (n) stats.append(n);
  // lot 305: held upright (a game mode in portrait), the sheet over the whole width, its text under it
  const pd = portraitStack() ? d2Panel('panel-char', 1, 0, 0, 0.4, PSTACK_VRES) : d2Panel('panel-char', 1, 0, D2_INFO_MIN_W + D2_GAP);
  if (!pd) return this.frame('Personnage', alloc, stats);
  d2CharacterSheet(this, g, pd.inner);
  return this.frame('Personnage', pd.wrap, stats);
}

/** Caractéristiques (hors art D2) : valeur, base, + et +5, réinitialisations */
function statAllocation(p: Panels, g: Game): HTMLElement {
  const c = g.character;
  const d = g.world.player.d;
  const alloc = el('div', { cls: 'col' });
  alloc.append(
    el('div', { cls: 'lvl', textContent: `${verbatim(c.name)} — ${classOf(c.classId).name} niveau ${c.level}` }),
    el('div', { cls: 'statrow' }, el('span', { textContent: 'Points à répartir' }), el('b', { textContent: String(c.statPoints) })),
  );
  for (const [k, label, hint] of [
    ['str', 'Force', "Porter l'équipement lourd (prérequis bloquants)"],
    ['dex', 'Dextérité', "Blocage, score d'attaque, prérequis"],
    ['vit', 'Vitalité', '+2 vie par point'],
    ['ene', 'Énergie', '+2 mana par point'],
  ] as const) {
    const plus = el('button', { cls: 'plus', textContent: '+', disabled: c.statPoints <= 0 });
    plus.addEventListener('click', () => {
      g.allocateStat(k, 1);
      p.render();
    });
    const plus5 = el('button', { cls: 'plus', textContent: '5', disabled: c.statPoints < 5, title: '+5' });
    plus5.addEventListener('click', () => {
      g.allocateStat(k, 5);
      p.render();
    });
    alloc.append(
      el(
        'div',
        { cls: 'statrow' },
        el('span', { textContent: `${label} : ` }, el('b', { textContent: String(d[k]) }), el('small', { cls: 'base', textContent: `  (base ${c.base[k]})` })),
        el('span', {}, plus, ' ', plus5),
      ),
      el('div', { cls: 'base', style: { fontSize: '11px' }, textContent: hint }),
    );
  }
  const respec = respecButton(p, g, g.settings.freeRespec ? 'Réinitialiser les points (gratuit)' : `Réinitialiser les points (${c.respecs} restante${c.respecs > 1 ? 's' : ''})`, 'btn danger');
  const respecStatsBtn = respecButton(p, g, 'Réinitialiser les stats seulement', 'btn danger', 'stats');
  alloc.append(respecStatsBtn, respec);

  return alloc;
}

/** Colonne des statistiques dérivées (vie, mana, résistances, vitesses et prochains paliers, butin, temps de jeu) */
function statSheet(g: Game): HTMLElement {
  const c = g.character;
  const d = g.world.player.d;
  const r = (label: string, v: string) => el('div', { cls: 'statrow' }, el('span', { textContent: label }), el('b', { textContent: v }));
  const nf = nextFcrBreakpoint(d.fcr, c.classId);
  const nh = nextFhrBreakpoint(d.fhr, c.classId);
  const stats = el(
    'div',
    { cls: 'col scroll', style: { flex: '1' } },
    r('Vie', `${fmt(d.lifeMax)}`),
    r('Mana', `${fmt(d.manaMax)} (+${d.manaRegen.toFixed(1)}/s)`),
    r('Défense', fmt(d.defense)),
    r('Blocage', `${d.block} %`),
    r('Rés. Feu', `${d.res.fire} % (max ${d.maxRes.fire})`),
    r('Rés. Froid', `${d.res.cold} % (max ${d.maxRes.cold})`),
    r('Rés. Foudre', `${d.res.light} % (max ${d.maxRes.light})`),
    r('Rés. Poison', `${d.res.poison} % (max ${d.maxRes.poison})`),
    r("Vitesse d'incantation", `${d.fcr} %${nf !== null ? ` (palier suivant : ${nf} %)` : ''}`),
    r('Récupération après coup', `${d.fhr} %${nh !== null ? ` (palier suivant : ${nh} %)` : ''}`),
    r('Vitesse de course', `${d.frw} %`),
    r('Dégâts de feu / froid / foudre', `+${d.elemDmgPct.fire} / +${d.elemDmgPct.cold} / +${d.elemDmgPct.light} %`),
    r('Pénétration feu / froid / foudre', `-${d.pierce.fire} / -${d.pierce.cold} / -${d.pierce.light} %`),
    r('Magic find', `${d.mf} %`),
    r('Or supplémentaire', `${d.gf} %`),
    r('Réduction des dégâts', `${d.dr} % / ${d.drFlat}`),
    r('Temps de jeu', formatTime(c.progression.playTime)),
    r('Difficulté débloquée', DIFF_NAMES[c.progression.highestDifficulty]),
  );
  return stats;
}

/** Feuille de personnage de Diablo II : les zones de l'image reçoivent nom, niveau, caractéristiques, vie, mana, résistances */
function d2CharacterSheet(p: Panels, g: Game, inner: HTMLElement): void {
  const c = g.character;
  const d = g.world.player.d;
  // feuille de personnage de Diablo II : les zones de l'image reçoivent nom, niveau, caractéristiques, vie, mana, résistances
  const put = (cls: string, text: string, x: number, y: number, w: number, h: number, extra?: (n: HTMLElement) => void): HTMLElement => {
    const n = el('div', { cls, textContent: text });
    d2Place(n, x, y, w, h);
    n.style.lineHeight = `${h}px`;
    extra?.(n);
    inner.append(n);
    return n;
  };
  const nextXp = c.level >= 99 ? 0 : xpToReach(c.level + 1);
  put('d2txt name', verbatim(c.name), 11, 10, 171, 17);
  put('d2txt', classOf(c.classId).name, 193, 10, 117, 17);
  const two = (label: string, v: string, x: number, y: number, w: number) => {
    put('d2lbl', label, x, y - 1, w, 12);
    put('d2txt', v, x, y + 10, w, 20);
  };
  two('Niv.', String(c.level), 10, 32, 44);
  two('Expérience', fmt(c.xp), 66, 32, 116);
  two('Niveau suivant', nextXp ? fmt(nextXp) : '—', 192, 32, 118);
  // caractéristiques à gauche, avec leurs boutons + et +5
  const rowsY: Record<'str' | 'dex' | 'vit' | 'ene', number> = { str: 83, dex: 145, vit: 231, ene: 293 };
  for (const [k, label] of [
    ['str', 'Force'],
    ['dex', 'Dextérité'],
    ['vit', 'Vitalité'],
    ['ene', 'Énergie'],
  ] as const) {
    const y = rowsY[k];
    put('d2lbl', label, 14, y, 61, 17);
    put('d2txt', String(d[k]), 76, y, 39, 17);
    for (const [n, txt, x] of [
      [1, '+', 119],
      [5, '5', 141],
    ] as const) {
      const b = el('button', { cls: 'plus d2plus', textContent: txt, disabled: c.statPoints < n });
      d2Place(b, x, y, 20, 17);
      b.addEventListener('click', () => {
        g.allocateStat(k, n);
        p.render();
      });
      inner.append(b);
    }
  }
  // colonne de droite : vitesses, défense, blocage, vie, mana, résistances
  const line = (label: string, v: string, y: number, lx = 161, lw = 108, vx = 271, vw = 39) => {
    put('d2lbl', label, lx + 4, y, lw - 4, 17);
    put('d2txt', v, vx, y, vw, 17);
  };
  line("Vit. d'incantation", `${d.fcr}%`, 83, 161, 98, 260, 50);
  line('Récupération', `${d.fhr}%`, 107, 161, 98, 260, 50);
  line('Défense', fmt(d.defense), 145);
  line('Blocage', `${d.block}%`, 169);
  line('Vit. de course', `${d.frw}%`, 193);
  put('d2lbl', 'Vie', 165, 231, 65, 17);
  put('d2txt', fmt(Math.max(0, Math.floor(g.world.player.hp))), 231, 231, 38, 17);
  put('d2txt', fmt(d.lifeMax), 272, 231, 38, 17);
  put('d2lbl', 'Réd. dégâts', 165, 255, 65, 17);
  put('d2txt', `${d.dr}%`, 231, 255, 38, 17);
  put('d2txt', String(d.drFlat), 272, 255, 38, 17);
  put('d2lbl', 'Mana', 165, 293, 65, 17);
  put('d2txt', fmt(Math.floor(g.world.player.mana)), 231, 293, 38, 17);
  put('d2txt', fmt(d.manaMax), 272, 293, 38, 17);
  const res: [string, number, string][] = [
    ['Rés. feu', d.res.fire, '#ff8a5a'],
    ['Rés. froid', d.res.cold, '#8ab8ff'],
    ['Rés. foudre', d.res.light, '#ffe060'],
    ['Rés. poison', d.res.poison, '#8fdc60'],
  ];
  res.forEach(([label, v, color], i) => {
    const y = 332 + i * 24;
    put('d2lbl', label, 178, y, 92, 17, (n) => (n.style.color = color));
    put('d2txt', `${v}%`, 271, y, 39, 17, (n) => (n.style.color = color));
  });
  put('d2lbl', 'Points à répartir', 6, 372, 118, 14);
  put('d2txt big', String(c.statPoints), 128, 389, 32, 32, (n) => (n.style.fontSize = '16px'));
  const respec2 = respecButton(p, g, g.settings.freeRespec ? 'Tout réinit. (gratuit)' : `Tout réinit. (${c.respecs})`, 'btn danger d2small');
  d2Place(respec2, 8, 412, 112, 18);
  inner.append(respec2);
  const respecStats = respecButton(p, g, 'Réinit. stats', 'btn danger d2small', 'stats');
  d2Place(respecStats, 8, 392, 112, 18);
  inner.append(respecStats);
}

export function skillsImpl(this: Panels, g: Game): HTMLElement {
  const c = g.character;
  const cls = classOf(c.classId);
  if (!this.skillTree || !cls.trees.includes(this.skillTree)) this.skillTree = cls.defaultTree;
  const tabs = treeTabs(this, g, cls.trees);
  const list = SKILLS.filter((s) => s.tree === this.skillTree);
  const tree = cssSkillTree(this, g, list);
  let left: HTMLElement = el(
    'div',
    { cls: 'col scroll' },
    tabs,
    el('div', { cls: 'statrow' }, el('span', { textContent: 'Points disponibles' }), el('b', { textContent: String(c.skillPoints) })),
    tree,
  );
  const pd = portraitStack() ? d2Panel('panel-blank', 1, 0, 0, 0.4, PSTACK_VRES) : d2Panel('panel-blank', 1, 0, D2_INFO_MIN_W + D2_GAP);
  if (pd) {
    d2SkillTree(this, g, list, cls.trees, pd.inner);
    left = pd.wrap;
  } else left.append(respecButton(this, g, 'Réinitialiser les compétences', 'btn danger', 'skills'));
  const info = el('div', { cls: 'col scroll', style: { flex: '1' } });
  if (this.skillSel) info.append(...skillDetail(this, g, this.skillSel));
  else info.append(...skillHint(this, g));
  return this.frame('Compétences', left, info);
}

/** Points investis dans un arbre */
function treePoints(c: Game['character'], t: SkillTree): number {
  return SKILLS.filter((s) => s.tree === t).reduce((a, s) => a + (c.skills[s.id] ?? 0), 0);
}

/** Onglets des arbres (grille CSS) */
function treeTabs(p: Panels, g: Game, trees: SkillTree[]): HTMLElement {
  const c = g.character;
  const tabs = el('div', { cls: 'tabs' });
  for (const t of trees) {
    const pts = treePoints(c, t);
    const b = el('button', { cls: `btn ${t}${p.skillTree === t ? ' sel' : ''}`, textContent: `${TREE_NAMES[t]} (${pts})` });
    b.addEventListener('click', () => {
      p.skillTree = t;
      p.skillSel = null;
      p.render();
    });
    tabs.append(b);
  }
  return tabs;
}

/** Bouton d'une compétence de l'arbre : points investis et bonus, classes `learned` / `can` / `sel` */
function skillButton(p: Panels, g: Game, s: SorcSkill, extraCls: string): HTMLButtonElement {
  const c = g.character;
  const d = g.world.player.d;
  const hard = c.skills[s.id] ?? 0;
  const eff = d.skillLevels[s.id] ?? 0;
  const can = g.canLearnManually(s.id).ok;
  return el(
    'button',
    { cls: `sk ${extraCls}${s.tree}${hard > 0 ? ' learned' : ''}${can ? ' can' : ''}${p.skillSel === s.id ? ' sel' : ''}` },
    icon(s.id),
    el('span', { cls: 'pts' }, String(hard), eff > hard ? el('span', { cls: 'bonus', textContent: `+${eff - hard}` }) : ''),
  );
}

/** Arbre en grille CSS 3 × 6 (cases vides comprises) */
function cssSkillTree(p: Panels, g: Game, list: SorcSkill[]): HTMLElement {
  const tree = el('div', { cls: 'tree' });
  for (let row = 1; row <= 6; row++) {
    for (let col = 0; col < 3; col++) {
      const s = list.find((x) => x.row === row && x.col === col);
      if (!s) {
        tree.append(el('div'));
        continue;
      }
      const b = skillButton(p, g, s, '');
      b.addEventListener('click', () => {
        p.skillSel = s.id;
        p.render();
      });
      tree.append(b);
    }
  }
  return tree;
}

/** Arbre façon Diablo II : cases 3 × 6 sur fond de pierre (origine X0, Y0 ; pas DX, DY ; côté SZ) */
const D2_TREE = { X0: 32, DX: 106, Y0: 44, DY: 58, SZ: 44 };
const d2TreePos = (row: number, col: number) => ({ x: D2_TREE.X0 + col * D2_TREE.DX, y: D2_TREE.Y0 + (row - 1) * D2_TREE.DY });

/** Flèches sombres des prérequis (dans le même arbre), du bord de la case source au bord de la case cible */
function skillArrows(list: SorcSkill[]): SVGSVGElement {
  const SZ = D2_TREE.SZ;
  const pos = d2TreePos;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '320');
  svg.setAttribute('height', '432');
  svg.setAttribute('class', 'd2arrows');
  const ns = 'http://www.w3.org/2000/svg';
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    for (const [w, color] of [
      [6, '#0a0a0a'],
      [3, '#4a4a46'],
    ] as const) {
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', String(x1));
      l.setAttribute('y1', String(y1));
      l.setAttribute('x2', String(x2));
      l.setAttribute('y2', String(y2));
      l.setAttribute('stroke', color);
      l.setAttribute('stroke-width', String(w));
      l.setAttribute('stroke-linecap', 'round');
      svg.append(l);
    }
    const a = Math.atan2(y2 - y1, x2 - x1);
    const head = document.createElementNS(ns, 'polygon');
    const hx = x2;
    const hy = y2;
    const pt = (ang: number, r: number) => `${hx + Math.cos(a + ang) * r},${hy + Math.sin(a + ang) * r}`;
    head.setAttribute('points', `${hx},${hy} ${pt(Math.PI - 0.5, 9)} ${pt(Math.PI + 0.5, 9)}`);
    head.setAttribute('fill', '#4a4a46');
    head.setAttribute('stroke', '#0a0a0a');
    head.setAttribute('stroke-width', '1.5');
    svg.append(head);
  };
  for (const s of list) {
    for (const pid of s.prereqs) {
      const ps = SKILL_BY_ID[pid];
      if (!ps || ps.tree !== s.tree) continue;
      const a = pos(ps.row, ps.col);
      const b = pos(s.row, s.col);
      const ax = a.x + SZ / 2;
      const ay = a.y + SZ / 2;
      const bx = b.x + SZ / 2;
      const by = b.y + SZ / 2;
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      // du bord de la case source au bord de la case cible
      const m = SZ / 2 + 2;
      const f = (v: number, d: number) => v + (d / len) * m;
      line(f(ax, dx), f(ay, dy), bx - (dx / len) * (m + 6), by - (dy / len) * (m + 6));
    }
  }
  return svg;
}

/** Arbre sur l'art D2 : flèches, cases, onglets des trois arbres, points restants et réinitialisation */
function d2SkillTree(p: Panels, g: Game, list: SorcSkill[], trees: SkillTree[], inner: HTMLElement): void {
  const c = g.character;
  const SZ = D2_TREE.SZ;
  const pos = d2TreePos;
  inner.append(skillArrows(list));
  for (const s of list) {
    const b = skillButton(p, g, s, 'd2sk ');
    const { x, y } = pos(s.row, s.col);
    d2Place(b, x, y, SZ, SZ);
    b.addEventListener('click', () => {
      p.skillSel = s.id;
      p.render();
    });
    b.title = s.name;
    b.addEventListener('mouseenter', () => (p.hoverSkill = s.id));
    b.addEventListener('mouseleave', () => (p.hoverSkill = null));
    inner.append(b);
  }
  // onglets des trois arbres en haut, points restants en bas à gauche
  trees.forEach((t, i) => {
    const pts = treePoints(c, t);
    const b = el('button', { cls: `btn d2small d2tab ${t}${p.skillTree === t ? ' sel' : ''}`, textContent: `${TREE_NAMES[t]} (${pts})` });
    d2Place(b, 12 + i * 100, 8, 96, 26);
    b.addEventListener('click', () => {
      p.skillTree = t;
      p.skillSel = null;
      p.render();
    });
    inner.append(b);
  });
  const pl = el('div', { cls: 'd2lbl', textContent: 'Points de compétence' });
  d2Place(pl, 12, 398, 150, 14);
  const pn = el('div', { cls: 'd2txt big', textContent: String(c.skillPoints) });
  d2Place(pn, 150, 394, 40, 22);
  pn.style.fontSize = '16px';
  pn.style.lineHeight = '22px';
  inner.append(pl, pn);
  const rs = respecButton(p, g, 'Réinit. compétences', 'btn danger d2small', 'skills');
  d2Place(rs, 196, 394, 118, 20);
  inner.append(rs);
}

/** Réinitialisation (appui maintenu) de tout, des caractéristiques ou des compétences ; désactivée sans réinitialisation disponible */
function respecButton(p: Panels, g: Game, label: string, cls: string, part?: 'stats' | 'skills'): HTMLButtonElement {
  const c = g.character;
  const rs = holdButton(
    label,
    () => {
      if (!(part ? g.respec(part) : g.respec())) p.host.haptic('fail');
      p.render();
    },
    900,
    cls,
  );
  if (c.respecs <= 0 && !g.settings.freeRespec) rs.disabled = true;
  return rs;
}

/** Détail de la compétence choisie : description, progression chiffrée (actuel → suivant), +1 point, assignation aux emplacements */
function skillDetail(p: Panels, g: Game, id: string): HTMLElement[] {
  const c = g.character;
  const d = g.world.player.d;
  const s = SKILL_BY_ID[id];
  const hard = c.skills[id] ?? 0;
  const eff = d.skillLevels[id] ?? 0;
  const tip = el(
    'div',
    { cls: 'tip' },
    el('div', { cls: `t ${s.tree}`, textContent: s.name }),
    el('div', {
      cls: 'base',
      textContent: `Niveau ${eff}${eff > hard ? ` (${hard} investi(s) + ${eff - hard} bonus)` : ''} — requis : niveau ${s.reqLvl}${s.prereqs.length ? `, ${s.prereqs.map((p) => SKILL_BY_ID[p].name).join(', ')}` : ''}`,
    }),
    el('div', { textContent: s.desc }),
    el('hr'),
  );
  const table = el('div');
  table.append(el('div', { cls: 'statrow base' }, el('span', { textContent: '' }), el('span', { textContent: 'Actuel → suivant' })));
  for (const l of skillLines(id, d)) table.append(el('div', { cls: 'statrow' }, el('span', { textContent: l.label }), el('b', { textContent: `${l.now} → ${l.next}` })));
  tip.append(table);
  const out: HTMLElement[] = [tip];
  const bar = el('div', { cls: 'tabs', style: { flexWrap: 'wrap' } });
  const learn = el('button', { cls: 'btn primary', textContent: '+1 point' });
  const chk = g.canLearnManually(id);
  if (!chk.ok) {
    learn.disabled = true;
    learn.textContent = chk.reason ?? 'Indisponible';
  }
  learn.addEventListener('click', () => {
    if (g.learnSkill(id)) p.host.haptic('tap');
    p.render();
  });
  bar.append(learn);
  if (!s.passive && hard + eff > 0 && id !== 'teleport') {
    const prim = el('button', { cls: `btn${c.hotbar.primary === id ? ' sel' : ''}`, textContent: 'Attaque principale' });
    prim.addEventListener('click', () => {
      g.assignSkill('primary', id);
      p.render();
    });
    bar.append(prim);
    const sec = el('button', { cls: `btn${(c.hotbar.secondary ?? 'attack') === id ? ' sel' : ''}`, textContent: 'Clic droit' });
    sec.addEventListener('click', () => {
      g.assignSkill('secondary', id);
      p.render();
    });
    bar.append(sec);
    for (let i = 0; i < 8; i++) {
      const b = el('button', { cls: `btn${c.hotbar.slots[i] === id ? ' sel' : ''}`, textContent: `P${Math.floor(i / 4) + 1}·${(i % 4) + 1}` });
      b.addEventListener('click', () => {
        g.assignSkill(i, c.hotbar.slots[i] === id ? null : id);
        p.render();
      });
      bar.append(b);
    }
  }
  out.push(bar);
  return out;
}

/** Sans compétence choisie : aide et « attaque normale en principal » */
function skillHint(p: Panels, g: Game): HTMLElement[] {
  const c = g.character;
  const out: HTMLElement[] = [];
  out.push(
    el('div', {
      cls: 'tip',
      textContent:
        "Touchez une compétence pour voir sa progression chiffrée, investir un point et l'assigner à l'attaque principale ou à un emplacement (2 pages de 4). Les passifs s'appliquent sans emplacement.",
    }),
  );
  const attackBtn = el('button', { cls: `btn${c.hotbar.primary === 'attack' ? ' sel' : ''}`, textContent: 'Attaque normale en principal' });
  attackBtn.addEventListener('click', () => {
    g.assignSkill('primary', 'attack');
    p.render();
  });
  out.push(attackBtn);
  return out;
}

/** Charsi : imprégnation d'un objet normal ou magique (une fois par difficulté) */
export function imbuePanelImpl(this: Panels, g: Game): HTMLElement {
  const c = g.character;
  const box = el('div', { cls: 'col scroll', style: { flex: '1' } });
  box.append(el('div', { cls: 'tip', textContent: 'Charsi : « Donnez-moi un objet normal sans châsse, je le forgerai en objet rare. Une seule fois par difficulté. »' }));
  if (this.imbueNote) box.append(el('div', { cls: 'tip', textContent: this.imbueNote }));
  if (!g.imbueAvailable()) box.append(el('div', { cls: 'base', textContent: 'Imprégnation déjà utilisée à cette difficulté (ou Malus horadrique pas encore rapporté).' }));
  else {
    const list = el('div', { cls: 'tabs', style: { flexWrap: 'wrap' } });
    c.inventory.forEach((it, i) => {
      if (!it || !baseOf(it).slot || !['low', 'normal', 'superior'].includes(it.quality) || it.sockets > 0) return;
      const b = el('button', { cls: `btn ${labelClass(it)}`, textContent: itemName(it) });
      b.addEventListener('click', () => {
        const r = g.imbue(i);
        this.imbueNote = r.ok ? 'Charsi : « Voilà qui est mieux ! »' : (r.reason ?? 'Impossible');
        this.host.haptic(r.ok ? 'tap' : 'fail');
        this.render();
      });
      list.append(b);
    });
    if (!list.childElementCount) list.append(el('div', { cls: 'base', textContent: 'Aucun objet convenable dans l’inventaire.' }));
    box.append(list);
  }
  const shop = el('button', { cls: 'btn', textContent: 'Commercer' });
  shop.addEventListener('click', () => {
    g.openVendor('charsi');
    this.show('vendor', 'charsi');
  });
  box.append(shop);
  return this.frame('Charsi', box);
}

/** Larzuk : percement d'un objet (Siège d'Harrogath, une fois par difficulté) */
export function socketQuestPanelImpl(this: Panels, g: Game): HTMLElement {
  const c = g.character;
  const box = el('div', { cls: 'col scroll', style: { flex: '1' } });
  box.append(el('div', { cls: 'tip', textContent: 'Larzuk : « Montrez-moi un objet sans châsse : un objet normal en reçoit autant que possible, un magique une ou deux, les autres une. »' }));
  if (this.socketNote) box.append(el('div', { cls: 'tip', textContent: this.socketNote }));
  const list = el('div', { cls: 'tabs', style: { flexWrap: 'wrap' } });
  c.inventory.forEach((it, i) => {
    if (!it || !baseOf(it).slot || baseOf(it).maxSockets <= 0 || it.sockets > 0 || it.quality === 'runeword') return;
    const b = el('button', { cls: `btn ${labelClass(it)}`, textContent: itemName(it) });
    b.addEventListener('click', () => {
      const r = g.socketQuest(i);
      this.socketNote = r.ok ? `Larzuk : « ${r.sockets} châsse${(r.sockets ?? 0) > 1 ? 's' : ''}. Bon usage ! »` : (r.reason ?? 'Impossible');
      this.host.haptic(r.ok ? 'tap' : 'fail');
      this.render();
    });
    list.append(b);
  });
  if (!list.childElementCount) list.append(el('div', { cls: 'base', textContent: 'Aucun objet convenable dans l’inventaire.' }));
  box.append(list);
  const shop = el('button', { cls: 'btn', textContent: 'Commercer' });
  shop.addEventListener('click', () => {
    g.openVendor('larzuk');
    this.show('vendor', 'larzuk');
  });
  box.append(shop);
  return this.frame('Larzuk', box);
}

export function mercImpl(this: Panels, g: Game): HTMLElement {
  const st = g.character.merc;
  const town = g.mode === 'town';
  const cols: HTMLElement[] = [];
  const sheet = mercSheet(this, g);
  const hireView = town && this.mercHire;
  if (!hireView) cols.push(sheet);
  // inventaire : objets que le mercenaire peut porter
  if (st && !hireView) cols.push(mercInventory(this, g));
  // recrutement (auprès de Qual-Kehk)
  // en ville, le recrutement est aussi accessible depuis l'onglet Mercenaire (utile en mode Rush : pas besoin de marcher jusqu'au capitaine des mercenaires)
  if ((this.npc && CAPTAINS[this.npc]) || (town && (this.mercHire || !st))) cols.push(mercHireList(this, g, hireView));
  return this.frame('Mercenaire', ...cols);
}

/** Lot 321: the captains who hire, by NPC (the hire list's title) */
const CAPTAINS: Record<string, string> = { kashya: 'Kashya', greiz: 'Greiz', asheara: 'Asheara', qual_kehk: 'Qual-Kehk' };

/** Fiche du mercenaire actuel : nom, variante, équipement, statistiques, auras, compétences ; « Ressusciter » en haut, collant */
function mercSheet(p: Panels, g: Game): HTMLElement {
  const c = g.character;
  const st = c.merc;
  const t = st ? MERC_BY_ID[st.type] : null;
  const town = g.mode === 'town';
  const sheet = el('div', { cls: 'col scroll mercsheet' });
  // action principale (Ressusciter) tout en haut de la fiche, collante : visible sans défiler
  const reviveSlot = el('div', { cls: 'actionbar' });
  if (st && t) {
    const md = mercDerived(c, g.difficulty)!;
    const live = mercOf(g.world);
    const variant = mercVariant(t, st.variant);
    sheet.append(
      el('div', { cls: 'lvl', textContent: `${st.name} — ${t.title}` }),
      el('div', { cls: 'base', textContent: `${variant?.name ?? ''} — niveau ${md.lvl}${st.dead ? ' — MORT' : ''}` }),
      reviveSlot,
    );
    if (town && p.npc !== 'qual_kehk') {
      const changeBtn = el('button', { cls: 'btn', textContent: 'Changer de mercenaire' });
      changeBtn.addEventListener('click', () => {
        p.mercHire = true;
        p.render();
      });
      sheet.append(changeBtn);
    }
    const eq = el('div', { cls: 'grid', style: { gridTemplateColumns: 'repeat(4, auto)' } });
    const names: Record<MercSlot, string> = { mainhand: 'Arme', offhand: 'Bouclier', head: 'Tête', body: 'Torse', gloves: 'Gants', boots: 'Bottes', belt: 'Ceinture' };
    for (const s of mercSlots(t)) {
      const it = st.equipment[s] ?? null;
      const cell = p.cell(it, p.sel?.from === 'merc' && p.sel.slot === s, () => {
        p.sel = it ? { from: 'merc', slot: s } : null;
        p.render();
      });
      if (!it) cell.append(el('span', { cls: 'slotname', textContent: s === 'offhand' && !t.shield ? 'Carquois' : names[s] }));
      eq.append(cell);
    }
    sheet.append(eq);
    const row = (k: string, v: string) => el('div', { cls: 'statrow' }, el('span', { textContent: k }), el('b', { textContent: v }));
    const life = live ? `${Math.round(live.hp)} / ${md.lifeMax}` : `${md.lifeMax}`;
    sheet.append(
      row('Vie', life),
      row(t.style === 'caster' ? 'Sorts' : 'Dégâts', t.style === 'caster' ? `${Math.round(md.spell[0])}-${Math.round(md.spell[1])}` : `${Math.round(md.dmg[0])}-${Math.round(md.dmg[1])}`),
      row('Défense', fmt(md.defense)),
      row("Score d'attaque", fmt(md.ar)),
      row('Résistances', `${md.res.fire} / ${md.res.cold} / ${md.res.light} / ${md.res.poison}`),
      row('Force / Dextérité', `${md.str} / ${md.dex}`),
    );
    if (md.auras.length) {
      const lang = getLang();
      const box = el('div', { cls: 'mercauras' }, el('div', { cls: 'base', textContent: lang === 'fr' ? 'Auras actives' : 'Active auras' }));
      for (const a of mercAuraLines(md.auras, lang)) box.append(el('div', { textContent: `• ${a.name} ${lang === 'fr' ? 'niv.' : 'lvl'} ${a.level}${a.text ? ` — ${a.text}` : ''}` }));
      box.append(el('div', { cls: 'base', textContent: MERC_AURA_RANGE_TEXT[lang === 'fr' ? 0 : 1] }));
      sheet.append(box);
    }
    // compétences PD2 du sous-type : niveau actuel (« — » : pas encore apprise) et probabilité
    const sks = variant.skills.filter((s) => s.id !== 'attack');
    if (sks.length) sheet.append(row('Compétences', sks.map((s) => `${SKILL_BY_ID[s.id]?.name ?? s.id} ${mercSkillLvl(s.id, md.lvl, md.allSkills) || '—'} (${s.pct} %)`).join(', ')));
    if (md.lifePerKill > 0) sheet.append(row('Vie par victime', fmt(md.lifePerKill)));
    if ((md.pierceRes.phys ?? 0) !== 0) sheet.append(row('Résistance physique ennemie', `${-(md.pierceRes.phys ?? 0)} %`));
    if (st.dead) {
      const cost = g.resurrectCost();
      const b = el('button', { cls: `btn${town ? ' primary' : ''}`, textContent: town ? `Ressusciter (${fmt(cost)} or)` : 'Ressuscitez-le en ville (Qual-Kehk)', disabled: !town });
      b.addEventListener('click', () => {
        const r = g.resurrectMerc();
        if (!r.ok) {
          p.host.haptic('fail');
          b.textContent = r.reason ?? 'Impossible';
          return;
        }
        p.render();
      });
      reviveSlot.append(b);
    }
  } else {
    sheet.append(el('div', { cls: 'tip', textContent: 'Aucun mercenaire. Qual-Kehk, à Harrogath, en recrute dès le niveau 5.' }));
  }
  return sheet;
}

/** Sac côté mercenaire : objets qu'il peut porter mis en évidence, détail et actions de l'objet choisi */
function mercInventory(p: Panels, g: Game): HTMLElement {
  const c = g.character;
  const grid = el('div', { cls: 'grid', style: { gridTemplateColumns: `repeat(${INV_COLS}, auto)` } });
  const occM = occupancy(c);
  c.inventory.forEach((it, i) => {
    if (!it && occM[i] >= 0) return;
    const ok = !!it && canMercEquip(c, it).ok;
    const cell = p.cell(
      it,
      p.sel?.from === 'inv' && p.sel.idx === i,
      () => {
        p.sel = it ? { from: 'inv', idx: i } : null;
        p.render();
      },
      ok ? 'upgrade' : '',
    );
    if (it && !ok) cell.style.opacity = '0.35';
    if (it) {
      const [w, h] = itemSize(it);
      cell.style.gridColumn = `span ${Math.min(w, INV_COLS - (i % INV_COLS))}`;
      cell.style.gridRow = `span ${h}`;
      if (w > 1 || h > 1) {
        cell.style.width = 'auto';
        cell.style.height = 'auto';
      }
    }
    grid.append(cell);
  });
  const info = el('div', { cls: 'col' });
  const it = p.selectedItem(g);
  if (it) {
    info.append(p.actionColumn(g, 'merc', true, true));
    info.append(itemTooltip(it, c));
    const r = canMercEquip(c, it);
    if (p.sel?.from === 'inv' && !r.ok) info.append(el('div', { cls: 'base', textContent: r.reason ?? '' }));
  } else info.append(el('div', { cls: 'tip', textContent: 'Les objets que votre mercenaire peut porter sont mis en évidence. Touchez-en un puis « Donner au mercenaire ».' }));
  return el('div', { cls: 'col scroll mercinv' }, grid, info);
}

/** Recrutement (Qual-Kehk, ou onglet Mercenaire en ville) : offres par type et variante ; remplacer demande un appui maintenu */
function mercHireList(p: Panels, g: Game, hireView: boolean): HTMLElement {
  const c = g.character;
  const st = c.merc;
  const list = el('div', { cls: 'col scroll', style: { flex: '1' } });
  list.append(el('div', { cls: 'lvl', textContent: (p.npc && CAPTAINS[p.npc]) || 'Recrutement' }));
  if (hireView && st) {
    const back = el('button', { cls: 'btn', textContent: 'Retour à la fiche du mercenaire' });
    back.addEventListener('click', () => {
      p.mercHire = false;
      p.render();
    });
    list.append(back);
  }
  // lot 321: a town hires its own act's mercenaries, as Diablo II's captains (Harrogath, the Rush's hub too: also those of the acts out of reach)
  const acts = g.mercActsHere();
  const offers = g.mercOffers().filter((o) => !acts || acts.includes(o.type.act));
  if (!offers.length) list.append(el('div', { cls: 'tip', textContent: 'Aucun mercenaire à recruter ici.' }));
  for (const o of offers) {
    const card = el('div', { cls: 'runcard' }, el('h3', { textContent: o.type.title }), el('div', { cls: 'd', textContent: o.unlocked ? `${fmt(o.cost)} or` : (o.reason ?? '') }));
    const vs = el('div', { cls: 'tabs', style: { flexWrap: 'wrap' } });
    for (const v of o.variants) {
      const label = `${v.name}`;
      const hire = () => {
        const r = g.hireMerc(o.type.id, v.id);
        if (!r.ok) {
          p.host.haptic('fail');
          p.host.message(r.reason ?? 'Impossible', '#e05030');
          return;
        }
        p.host.message(`${c.merc!.name} vous rejoint.`, '#8f8');
        p.sel = null;
        p.render();
      };
      // remplacer un mercenaire demande un appui maintenu (pas de congé par erreur)
      const b = st ? holdButton(label, hire, 900, 'btn') : el('button', { cls: 'btn primary', textContent: label });
      if (!st) b.addEventListener('click', hire);
      if (!o.unlocked) (b as HTMLButtonElement).disabled = true;
      b.title = v.desc;
      vs.append(b);
    }
    card.append(vs, el('div', { cls: 'base', textContent: o.variants.map((v) => `${v.name} : ${v.desc}`).join(' ') }));
    list.append(card);
  }
  list.append(
    el(
      'div',
      { cls: 'tip' },
      el('div', {
        cls: 'base',
        textContent: st
          ? 'Recruter un autre mercenaire congédie l’actuel ; son équipement revient dans votre sac (ou tombe à vos pieds s’il est plein).'
          : 'Choisissez un mercenaire : il vous suit, combat, porte une arme, un casque, une armure, des gants, des bottes et une ceinture.',
      }),
    ),
  );
  return list;
}
