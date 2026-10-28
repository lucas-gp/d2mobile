/**
 * Recettes du Cube horadrique de Diablo II LoD 1.13c (CubeMain.txt) converties dans les structures du jeu (lot M10c) : amélioration des
 * runes et artisanat, les deux familles de recettes que la base construit depuis la table. Rien n'est écrit ici : voir gen.ts (table `cube`).
 *
 * Recettes retenues : `enabled`, hors `ladder` (D2MOO, recherche de recette du Cube de PlrTrade.cpp : une recette ladder n'existe que dans une
 * partie ladder ; une partie solo n'en est pas une). Les autres recettes de la base (gemmes, châsses, relances, améliorations, réparations,
 * Pandémonium…) sont écrites dans src/data/cube.ts et contrôlées contre la table par tests/unit/vanilla-cube.test.ts (`cubeRows`).
 */
import type { StatRoll } from '../../src/data/types';
import { rows } from '../audit/common';
import { vanillaItemTypes } from './affixes';
import { codeToBase } from './items';
import { convertProp, num } from './props';

/** Ligne de CubeMain.txt utile : entrées, sortie, niveaux, propriétés */
export interface CubeRow {
  row: number;
  description: string;
  inputs: string[];
  output: string;
  lvl: number;
  plvl: number;
  ilvl: number;
  mods: { code: string; param: string; min: number; max: number }[];
}

/** Recettes actives d'une partie solo de l'extension (enabled, hors ladder) */
export function cubeRows(): CubeRow[] {
  const out: CubeRow[] = [];
  rows('cubemain').forEach((r, row) => {
    if (r.enabled !== '1' || r.ladder === '1') return;
    const inputs = [1, 2, 3, 4, 5, 6, 7].map((k) => (r[`input ${k}`] ?? '').replace(/"/g, '').trim()).filter(Boolean);
    const mods = [1, 2, 3, 4, 5]
      .map((k) => ({ code: (r[`mod ${k}`] ?? '').trim(), param: (r[`mod ${k} param`] ?? '').trim(), min: num(r[`mod ${k} min`]), max: num(r[`mod ${k} max`]) }))
      .filter((m) => m.code);
    out.push({
      row,
      description: (r.description ?? '').replace(/"/g, '').trim(),
      inputs,
      output: (r.output ?? '').replace(/"/g, '').trim(),
      lvl: num(r.lvl),
      plvl: num(r.plvl),
      ilvl: num(r.ilvl),
      mods,
    });
  });
  return out;
}

let gems: Map<string, string> | null = null;
/** Code de gemme de Gems.txt → identifiant du jeu (`gem_<sorte>_<grade>`, grades ébréché 0 à parfait 4) */
export function gemId(code: string): string | undefined {
  if (!gems) {
    gems = new Map();
    const GRADE: Record<string, number> = { Chipped: 0, Flawed: 1, Flawless: 3, Flwless: 3, Perfect: 4 };
    for (const r of rows('gems')) {
      const m = /^(?:(Chipped|Flawed|Flawless|Flwless|Perfect) )?(\w+)$/.exec((r.name ?? '').trim());
      if (!m || /^r\d\d$/.test(r.code ?? '')) continue;
      const kind = m[2].toLowerCase().replace('saphire', 'sapphire');
      gems.set((r.code ?? '').trim(), `gem_${kind}_${m[1] ? GRADE[m[1]] : 2}`);
    }
  }
  return gems.get(code);
}

/** Entrée « code,qty=n » → [code, n] */
const qty = (s: string): [string, number] => {
  const [code, ...flags] = s.split(',');
  const q = flags.find((f) => f.startsWith('qty='));
  return [code, q ? Number(q.slice(4)) : 1];
};

/** Amélioration des runes : rune, nombre, gemme éventuelle, rune obtenue (ordre de la table) */
export function vanillaRuneUpgrades(): { from: string; n: number; gem?: string; to: string }[] {
  const out: { from: string; n: number; gem?: string; to: string }[] = [];
  for (const r of cubeRows()) {
    if (!/^r\d\d$/.test(r.output) || !/^r\d\d(,|$)/.test(r.inputs[0] ?? '')) continue;
    const [from, n] = qty(r.inputs[0]);
    const extra = r.inputs.slice(1).map((i) => gemId(qty(i)[0]));
    if (extra.length > 1 || extra.some((g) => !g)) throw new Error(`CubeMain ligne ${r.row} : entrées de rune inattendues (${r.inputs.join(' + ')})`);
    out.push(extra[0] ? { from, n, gem: extra[0], to: r.output } : { from, n, to: r.output });
  }
  return out;
}

/** Familles d'artisanat de D2 : gemme parfaite de la recette */
const FAMILY: Record<string, string> = { gpb: 'hitpower', gpr: 'blood', gpv: 'caster', gpg: 'safety' };
/** Types d'objets d'une entrée d'artisanat qui n'est pas une base : emplacement du jeu */
const TYPE_SLOT: Record<string, string> = { amul: 'amulet', ring: 'ring', blun: 'weapon', axe: 'weapon', rod: 'weapon', spea: 'weapon' };

export interface VanillaCraft {
  rune: string;
  gem: string;
  /** Objets acceptés : bases du jeu (la base de la recette et, `upg`, ses versions exceptionnelle et élite) ou codes `d2:` d'ItemTypes.txt */
  accept: string[];
  mods: StatRoll[];
}

/**
 * Artisanat (sorties `usetype,crf`) : famille → emplacement → rune, gemme, objets acceptés et propriétés fixes. `slotOfBase` : emplacement
 * d'artisanat d'une base du jeu (craftSlot de src/data/cube.ts).
 */
export function vanillaCrafts(slotOfBase: (id: string) => string | null): Record<string, Record<string, VanillaCraft>> {
  const map = codeToBase();
  const types = vanillaItemTypes();
  const armorRows = new Map(rows('armor').map((r) => [(r.code ?? '').trim(), r]));
  const out: Record<string, Record<string, VanillaCraft>> = {};
  for (const r of cubeRows()) {
    if (r.output !== 'usetype,crf') continue;
    const [item, ...rest] = r.inputs;
    const [code, ...flags] = item.split(',');
    const gem = rest.find((i) => FAMILY[i]);
    const rune = rest.find((i) => /^r\d\d$/.test(i));
    if (!gem || !rune || !rest.includes('jew') || !flags.includes('mag')) throw new Error(`CubeMain ligne ${r.row} : artisanat inattendu (${r.inputs.join(' + ')})`);
    let slot: string | null;
    let accept: string[];
    // comme le chargement de CubeMain.txt (D2MOO, HoradricCube.cpp) : un type d'ItemTypes.txt avant un code d'objet (« axe » : toutes les haches)
    const base = types[code] ? undefined : map.get(code);
    if (base) {
      slot = slotOfBase(base[0]);
      const ar = armorRows.get(code);
      const codes = flags.includes('upg') && ar ? [code, (ar.ubercode ?? '').trim(), (ar.ultracode ?? '').trim()] : [code];
      accept = [...new Set(codes.map((c) => map.get(c)?.[0]).filter((x): x is string => !!x))];
    } else {
      slot = TYPE_SLOT[code] ?? null;
      accept = [`d2:${code}`];
    }
    if (!slot) throw new Error(`CubeMain ligne ${r.row} : emplacement inconnu pour ${code}`);
    const fam = FAMILY[gem];
    const mods = r.mods.flatMap((m) => convertProp(m.code, m.param, m.min, m.max, m.code.startsWith('ac') ? 'armor' : 'weapon'));
    (out[fam] ??= {})[slot] = { rune, gem: gemId(gem)!, accept, mods };
  }
  return out;
}
