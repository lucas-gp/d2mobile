/**
 * Langues : le jeu est écrit en français ; l'anglais (langue par défaut) est une couche de traduction appliquée au texte affiché.
 * Dictionnaire `en.json` : phrase française → anglais, avec « {0} », « {v} »… à la place des valeurs variables (gabarits). Les noms d'objets, de sorts, de monstres et de zones
 * y figurent avec leur nom officiel de Diablo II. La traduction se fait au niveau du DOM (observateur de mutations) : tout texte affiché est couvert, y compris les phrases composées.
 */

export type Lang = 'en' | 'fr';
const KEY = 'd2m.lang';

let lang: Lang = 'en';
const listeners = new Set<(l: Lang) => void>();

export function getLang(): Lang {
  return lang;
}

/** Langue enregistrée sur l'appareil (anglais par défaut) */
function loadLang(): Lang {
  try {
    const s = localStorage.getItem(KEY);
    return s === 'fr' ? 'fr' : 'en';
  } catch {
    return 'en';
  }
}

interface Tpl {
  re: RegExp;
  lit: string;
  en: string;
  names: string[];
  /** Longueur du texte fixe (départage deux gabarits de même fragment le plus long) */
  fixed: number;
}

/** Dictionnaire anglais : chunk séparé (≈ 300 Ko), chargé au démarrage en parallèle des images ; tant qu'il n'est pas là, les textes restent en français */
let dict: Record<string, string> | null = null;
let dictLoading: Promise<void> | null = null;
/** Traductions ajoutées par les mods du jeu de règles actif (src/mods : `api.i18n.add`), après celles de la base */
const modDicts: Readonly<Record<string, string>>[] = [];
/** Ajoute les traductions des mods au dictionnaire, après celles de la base ; une clé déjà présente garde la traduction de la base (les tests du mod refusent ce cas) */
function withMods(base: Record<string, string>): Record<string, string> {
  if (!modDicts.length) return base;
  const out = { ...base };
  for (const d of modDicts) for (const [k, v] of Object.entries(d)) if (!Object.hasOwn(out, k)) out[k] = v;
  return out;
}
export function loadDict(): Promise<void> {
  dictLoading ??= import('./en.json').then((m) => {
    dict = withMods(m.default as Record<string, string>);
    cache.clear();
    if (typeof document !== 'undefined' && lang === 'en') refresh();
  });
  return dictLoading;
}

/** Traductions d'un mod, à l'activation du jeu de règles (src/mods/activate.ts) */
export function addTranslations(_mod: string, entries: Readonly<Record<string, string>>): void {
  modDicts.push(entries);
  if (!dict) return;
  dict = withMods(dict);
  exact.clear();
  tpls.length = 0;
  fragRe = null;
  fragMap = null;
  cache.clear();
  if (typeof document !== 'undefined' && lang === 'en') refresh();
}
/** Langue prête : en anglais, attend le dictionnaire (jamais bloquant en français) */
export function i18nReady(): Promise<void> {
  return lang === 'en' ? loadDict().catch(() => undefined) : Promise.resolve();
}
const exact = new Map<string, string>();
const tpls: Tpl[] = [];
let fragRe: RegExp | null = null;
let fragMap: Map<string, string> | null = null;
const cache = new Map<string, string>();

const PH = /\{([A-Za-z0-9_]+)\}/g;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function build(): void {
  if (!dict || exact.size || tpls.length) return;
  for (const [fr, en] of Object.entries(dict)) {
    if (!en) continue;
    if (PH.test(fr)) {
      PH.lastIndex = 0;
      const names: string[] = [];
      let src = '';
      let last = 0;
      let lit = '';
      for (const m of fr.matchAll(PH)) {
        const stat = fr.slice(last, m.index);
        // marqueur collé à une lettre (suffixe de pluriel : « objet{1} ») : peut être vide (« 1 objet »)
        src += esc(stat) + (/\p{L}$/u.test(stat) ? '(.*?)' : '(.+?)');
        if (stat.length > lit.length) lit = stat;
        names.push(m[1]);
        last = (m.index ?? 0) + m[0].length;
      }
      const tail = fr.slice(last);
      src += esc(tail);
      if (tail.length > lit.length) lit = tail;
      tpls.push({ re: new RegExp(`^${src}$`, 's'), lit: lit.trim(), en, names, fixed: fr.replace(PH, '').length });
    } else {
      PH.lastIndex = 0;
      exact.set(fr, en);
    }
  }
  // gabarits les plus précis d'abord (plus de texte fixe)
  tpls.sort((a, b) => b.lit.length - a.lit.length || b.fixed - a.fixed);
  // repli : noms et expressions connus à l'intérieur d'une phrase composée (frontières de mots, plus longs d'abord)
  fragMap = new Map([...exact].filter(([fr]) => fr.length >= 3 && fr !== 'Pas' && !/^[\d\s.,%+\-−]+$/.test(fr) && fr.length <= 60));
  const keys = [...fragMap.keys()].sort((a, b) => b.length - a.length);
  if (keys.length) fragRe = new RegExp(`(?<![\\p{L}\\p{N}])(?:${keys.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
}

function viaTemplate(s: string): string | null {
  for (const t of tpls) {
    if (t.lit && !s.includes(t.lit)) continue;
    const m = t.re.exec(s);
    if (!m) continue;
    const vals = new Map<string, string>();
    t.names.forEach((n, i) => vals.set(n, tr(m[i + 1])));
    return t.en.replace(PH, (_, n: string) => vals.get(n) ?? `{${n}}`);
  }
  return null;
}

/** Texte composé (phrases accolées, « a · b ») : chaque segment connu est traduit, les séparateurs sont conservés ; null si aucun segment n'est connu */
const SEG = /(\s*\n\s*|(?<=[.!?])\s+|\s+·\s+|\s+\/\s+|,\s+)/;
function viaSegments(core: string, strict = false): string | null {
  if (core.length > 600) return null;
  const parts = core.split(SEG);
  if (parts.length < 3) return null;
  let any = false;
  let all = true;
  const out = parts.map((p, i) => {
    if (i % 2 === 1 || !p) return p;
    const t = exact.get(p) ?? viaTemplate(p);
    if (t === null) {
      if (/[A-Za-zÀ-ÿ]{3}/.test(p)) all = false;
      return p;
    }
    any = true;
    return t;
  });
  return any && (all || !strict) ? out.join('') : null;
}

/** Nom choisi par le joueur (personnage, guilde) : entouré d'isolants Unicode invisibles, jamais traduit (« Tour » reste « Tour ») */
export function verbatim(s: string): string {
  return `\u2068${s.replace(/[\u2068\u2069]/g, '')}\u2069`;
}
const VERBATIM = /\u2068[^\u2068\u2069]*\u2069/g;
const KEPT = /\uE000(\d+)\uE001/g;

/** Traduit un texte français affiché (anglais : couche de traduction ; français : tel quel) */
export function tr(s: string): string {
  if (lang !== 'en' || !s) return s;
  const hit = cache.get(s);
  if (hit !== undefined) return hit;
  if (!dict) return s; // dictionnaire pas encore chargé : texte français, retraduit à son arrivée
  if (s.includes('\u2068')) {
    // noms du joueur mis de côté (marques privées) le temps de traduire le reste, puis remis tels quels
    const kept: string[] = [];
    const res = tr(s.replace(VERBATIM, (m) => `\uE000${kept.push(m) - 1}\uE001`)).replace(KEPT, (_, i: string) => kept[Number(i)] ?? '');
    cache.set(s, res);
    return res;
  }
  build();
  const lead = /^\s*/.exec(s)![0];
  const trail = /\s*$/.exec(s)![0];
  const core = s.slice(lead.length, s.length - trail.length);
  let out: string | null = null;
  if (core) {
    out = exact.get(core) ?? viaSegments(core, true) ?? viaTemplate(core) ?? viaSegments(core);
    if (out === null && core.length <= 160 && fragRe && fragMap) out = core.replace(fragRe, (m) => fragMap!.get(m) ?? m);
  }
  const res = out === null ? s : lead + out + trail;
  if (cache.size > 6000) cache.clear();
  cache.set(s, res);
  return res;
}

/* ---------------------------- Traduction du DOM ---------------------------- */

const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
const origText = new WeakMap<Node, string>();
const outText = new WeakMap<Node, string>();
const origAttr = new WeakMap<Element, Map<string, string>>();
const outAttr = new WeakMap<Element, Map<string, string>>();
let obs: MutationObserver | null = null;

const HAS_LETTER = /[A-Za-zÀ-ÿ]/;

function doText(n: Text): void {
  if (n.parentElement?.closest('[data-notr]')) return; // texte déjà dans la bonne langue (journal des nouveautés)
  const cur = n.data;
  if (outText.get(n) === cur) return;
  if (!HAS_LETTER.test(cur)) return;
  origText.set(n, cur);
  const t = tr(cur);
  if (t !== cur) {
    outText.set(n, t);
    n.data = t;
  } else outText.delete(n);
}

function doAttr(e: Element, name: string): void {
  const cur = e.getAttribute(name);
  if (cur === null) return;
  if (outAttr.get(e)?.get(name) === cur) return;
  if (!HAS_LETTER.test(cur)) return;
  let o = origAttr.get(e);
  if (!o) origAttr.set(e, (o = new Map()));
  o.set(name, cur);
  const t = tr(cur);
  if (t !== cur) {
    let w = outAttr.get(e);
    if (!w) outAttr.set(e, (w = new Map()));
    w.set(name, t);
    e.setAttribute(name, t);
  }
}

function walk(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    doText(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) for (const a of ATTRS) doAttr(root as Element, a);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
    else for (const a of ATTRS) doAttr(n as Element, a);
  }
}

/** Remet le texte d'origine (français) ou retraduit tout le document */
function refresh(): void {
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const o = origText.get(n);
      if (o === undefined) continue;
      const t = lang === 'en' ? tr(o) : o;
      if ((n as Text).data !== t) (n as Text).data = t;
      outText.set(n, t);
    } else {
      const o = origAttr.get(n as Element);
      if (!o) continue;
      for (const [name, v] of o) {
        const t = lang === 'en' ? tr(v) : v;
        if ((n as Element).getAttribute(name) !== t) (n as Element).setAttribute(name, t);
        let w = outAttr.get(n as Element);
        if (!w) outAttr.set(n as Element, (w = new Map()));
        w.set(name, t);
      }
    }
  }
  if (lang === 'en') walk(document.body);
}

/** Installe l'observateur de traduction sur le document (une fois) */
export function installI18n(): void {
  document.documentElement.lang = lang;
  if (obs) return;
  obs = new MutationObserver((muts) => {
    if (lang !== 'en') {
      // français : on mémorise seulement les nouveaux textes (pour pouvoir repasser en anglais)
      for (const m of muts) {
        if (m.type === 'childList') m.addedNodes.forEach((n) => walkOrig(n));
        else if (m.type === 'characterData') walkOrig(m.target);
      }
      return;
    }
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach((n) => walk(n));
      else if (m.type === 'characterData') doText(m.target as Text);
      else if (m.type === 'attributes') doAttr(m.target as Element, m.attributeName!);
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  if (lang === 'en') walk(document.body ?? document.documentElement);
}

function walkOrig(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    if (HAS_LETTER.test((root as Text).data)) origText.set(root, (root as Text).data);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) if (HAS_LETTER.test((n as Text).data)) origText.set(n, (n as Text).data);
}

/** Change de langue (mémorisée sur l'appareil) et retraduit l'écran */
export function setLang(l: Lang): void {
  if (l === lang) return;
  lang = l;
  cache.clear();
  if (l === 'en') void loadDict().catch(() => undefined);
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* sans stockage : la langue ne survit pas au rechargement */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = l;
    refresh();
  }
  for (const f of listeners) f(l);
}

export function initLang(): Lang {
  lang = loadLang();
  if (lang === 'en') void loadDict().catch(() => undefined);
  return lang;
}
