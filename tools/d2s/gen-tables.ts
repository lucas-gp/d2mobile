/**
 * Génère src/data/d2s-tables.gen.json : tables de correspondance pour l'import des personnages Diablo II (.d2s),
 * tirées des tables du jeu d'origine (MPQ + Patch_D2) et des données du jeu (bases, uniques, sets, mots runiques).
 * Le résultat est commité : aucune dépendance au dossier privé à l'exécution. Compétences (`skills`) : correspondance faite pour les
 * arbres PD2 S13 d'avant le lot M9a (lue par la règle `skills.d2sImport` du mod pd2 ; la base lit l'identifiant de Skills.txt dans
 * src/data/skills-d2.ts) : une régénération doit lire les compétences du jeu pd2 et non celles de la base.
 * Usage : npx tsx tools/d2s/gen-tables.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { rows, num } from '../audit/common';
import '../../src/data/items/index';
import { BASE_BY_ID } from '../../src/data/items/bases';
import { UNIQUES, SETS } from '../../src/data/items/index';
import { RUNEWORD_BY_ID } from '../../src/data/items/runewords';
import { SKILL_BY_ID } from '../../src/data/skills';
import { SET_ITEM_BY_ID } from '../../src/data/items/sets';

const OUT = 'src/data/d2s-tables.gen.json';
const snake = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
const warn: string[] = [];

/* ----------------------------- Statistiques (ItemStatCost) ----------------------------- */
const stats: Record<number, [string, number, number, number, number, number]> = {};
const csv: Record<number, number> = {};
for (const r of rows('ItemStatCost')) {
  const id = num(r['ID']);
  const sb = num(r['Save Bits']);
  if (sb > 0 || r['Save Param Bits']) stats[id] = [r['Stat'], sb, num(r['Save Add']), num(r['Save Param Bits']), num(r['Encode']), num(r['descfunc'])];
  if (id <= 15) csv[id] = num(r['CSvBits']);
}

/* ------------------------------------ Types d'objets ------------------------------------ */
const types = new Map<string, string[]>();
for (const r of rows('ItemTypes')) types.set(r['Code'], [r['Equiv1'], r['Equiv2']].filter(Boolean));
const isType = (t: string, target: string, seen = new Set<string>()): boolean => {
  if (t === target) return true;
  if (seen.has(t)) return false;
  seen.add(t);
  return (types.get(t) ?? []).some((p) => isType(p, target, seen));
};

/* ------------------------------------- Objets (codes) ------------------------------------- */
const ALIAS: Record<string, string> = {
  'ancient_shield|ashd': 'ancient_shield_sacred',
  'demon_head|head': 'demon_head_bone',
  'blood_spirt|pelt': 'blood_spirit',
  gauntlets: 'gaunlets_h',
  cap_hat: 'cap',
  gloves: 'gloves_l',
};
type ItemRow = [kind: 'a' | 'w' | 'm', game: string, name: string, flags: number];
const items: Record<string, ItemRow> = {};
const unmapped: string[] = [];
for (const [file, kind] of [
  ['Weapons', 'w'],
  ['Armor', 'a'],
  ['Misc', 'm'],
] as const) {
  for (const r of rows(file)) {
    const code = r['code'];
    const name = r['name'] ?? '';
    if (!code) continue;
    const type = r['type'] ?? '';
    let flags = 0;
    if (num(r['stackable']) === 1) flags |= 1;
    if (isType(type, 'ques')) flags |= 2;
    if (isType(type, 'book')) flags |= 4;
    let game = '';
    if (kind !== 'm') {
      const s = snake(name);
      game = ALIAS[`${s}|${type}`] ?? ALIAS[s] ?? s;
      if (!BASE_BY_ID[game]) {
        unmapped.push(`${code} ${name}`);
        game = '';
      }
    } else {
      // divers : runes, gemmes, bijoux, charmes, potions, clés
      let m: RegExpMatchArray | null;
      if ((m = code.match(/^r(\d\d)$/))) game = `r${m[1]}`;
      else if (code === 'rin') game = 'ring';
      else if (code === 'amu') game = 'amulet';
      else if (code === 'jew') game = 'jewel';
      else if (code === 'cm1') game = 'small_charm';
      else if (code === 'cm2') game = 'large_charm';
      else if (code === 'cm3') game = 'grand_charm';
      else if (code === 'key') game = 'key';
      else if (code === 'tbk') game = 'tome_portal';
      else if ((m = code.match(/^hp(\d)$/))) game = `pot:heal:${Number(m[1]) - 1}`;
      else if ((m = code.match(/^mp(\d)$/))) game = `pot:mana:${Number(m[1]) - 1}`;
      else if (code === 'rvs') game = 'pot:rejuv:0';
      else if (code === 'rvl') game = 'pot:rejuv:1';
    }
    items[code] = [kind, game, name, flags];
  }
}
// gemmes D2 : codes g{c,f,s,z,p}{v,w,g,r,b,y} (c ébréché, f fêlé, s normal, z sans défaut, p parfait ; v améthyste, w diamant, g émeraude, r rubis, b saphir, y topaze)
const GEMCODE: Record<string, string> = { v: 'amethyst', w: 'diamond', g: 'emerald', r: 'ruby', b: 'sapphire', y: 'topaz' };
for (const [c, kind] of Object.entries(GEMCODE)) {
  for (const [gc, grade] of Object.entries({ c: 0, f: 1, s: 2, z: 3, p: 4 })) {
    const code = `g${gc}${c}`;
    if (items[code]) items[code][1] = `gem_${kind}_${grade}`;
  }
}
for (const [gc, grade] of Object.entries({ c: 0, f: 1, u: 2, l: 3, z: 4 })) if (items[`sk${gc}`]) items[`sk${gc}`][1] = `gem_skull_${grade}`;

/* ----------------------------- Uniques, sets, mots runiques ----------------------------- */
const uniqueIds = new Set(UNIQUES.map((u) => u.id));
// les lignes « Expansion » ne comptent pas dans les identifiants (le jeu les ignore) ; les autres lignes (séparateurs « Armor »…) comptent
const uniques: [string, string][] = rows('UniqueItems')
  .filter((r) => r['index'] !== 'Expansion')
  .map((r) => {
    const n = r['index'];
    let g = `u_${snake(n)}`;
    if (!uniqueIds.has(g)) {
      const alt = UNIQUES.find((u) => u.id.startsWith(`${g}_`));
      g = alt ? alt.id : '';
    }
    return [n, g];
  });
const sets: [string, string][] = rows('SetItems')
  .filter((r) => r['index'] !== 'Expansion')
  .map((r) => {
    const n = r['index'];
    const g = `s_${snake(n)}`;
    return [n, SET_ITEM_BY_ID[g] ? g : ''];
  });
void SETS;
// Mots runiques : l'identifiant enregistré est 26 + le rang de la ligne « RunewordN » parmi celles qui existent (N croissant ; une ligne manquante ne
// compte pas, un doublon en compte deux) ; Délire (Runeword22) est enregistré sous 2718 par le jeu
const runewords: Record<number, [string, string]> = {};
{
  const rw = rows('Runes')
    .map((r, i) => ({ r, i, n: Number(/^Runeword(\d+)$/.exec(r['Name'])?.[1] ?? NaN) }))
    .filter((x) => Number.isFinite(x.n))
    .sort((a, b) => a.n - b.n || a.i - b.i);
  rw.forEach(({ r, n }, k) => {
    const name = r['Rune Name'];
    const cands = [`rw_${snake(name)}`, `rw_${snake(name.replace(/^The /, ''))}`];
    const g = cands.find((c) => RUNEWORD_BY_ID[c]) ?? '';
    runewords[27 + k] = [name, g];
    if (n === 22) runewords[2718] = [name, g];
  });
}

/* ------------------------------------ Affixes magiques ------------------------------------ */
const fr = JSON.parse(readFileSync('tools/itemdata/affixes-fr.json', 'utf8')) as Record<string, string>;
const prefixes = rows('MagicPrefix').map((r) => (r['Name'] ? [r['Name'], fr[`P:${r['Name']}`] ?? ''] : ['', '']));
const suffixes = rows('MagicSuffix').map((r) => (r['Name'] ? [r['Name'], fr[`S:${r['Name'].replace(/^of (the )?/i, '')}`] ?? ''] : ['', '']));

/* --------------------------------------- Compétences --------------------------------------- */
const SKILL_FIX: Record<string, string> = {
  raise_skeletal_mage: 'skeletal_mage',
  wearwolf: 'werewolf',
  wake_of_fire_sentry: 'wake_of_fire',
  inferno_sentry: 'wake_of_inferno',
  sword_mastery: 'one_hand_mastery',
  axe_mastery: 'one_hand_mastery',
  mace_mastery: 'one_hand_mastery',
  polearm_mastery: 'two_hand_mastery',
  spear_mastery: 'two_hand_mastery',
  increased_stamina: 'combat_reflexes',
  frozen_armor: 'chilling_armor',
};
const skills: Record<number, string> = {};
const skillMiss: string[] = [];
for (const r of rows('Skills')) {
  const id = num(r['Id']);
  const n = snake(r['skill'] ?? '');
  if (!n) continue;
  const g = SKILL_FIX[n] ?? n;
  if (SKILL_BY_ID[g]) skills[id] = g;
  else if (r['charclass']) skillMiss.push(`${id}:${n}`);
}

const out = { version: 1, charBits: csv, stats, items, uniques, sets, runewords, prefixes, suffixes, skills };
writeFileSync(OUT, JSON.stringify(out));
const mapped = (x: [string, string][]) => x.filter((e) => e[1]).length;
console.log(`stats ${Object.keys(stats).length}, objets ${Object.keys(items).length} (non reconnus ${unmapped.length}) : ${unmapped.slice(0, 40).join('; ')}`);
console.log(`uniques ${mapped(uniques)}/${uniques.length}, sets ${mapped(sets)}/${sets.length}, mots runiques ${Object.values(runewords).filter((e) => e[1]).length}/${Object.keys(runewords).length}`);
console.log(
  `affixes FR ${prefixes.filter((p) => p[1]).length}/${prefixes.filter((p) => p[0]).length} préfixes, ${suffixes.filter((p) => p[1]).length}/${suffixes.filter((p) => p[0]).length} suffixes`,
);
console.log(`compétences ${Object.keys(skills).length}; sans équivalent : ${skillMiss.join(', ')}`);
console.log(
  `uniques sans correspondance : ${uniques
    .filter((u) => !u[1])
    .slice(0, 60)
    .map((u) => u[0])
    .join('; ')}`,
);
console.log(
  `sets sans correspondance : ${sets
    .filter((u) => !u[1])
    .map((u) => u[0])
    .join('; ')}`,
);
console.log(
  `runewords sans correspondance : ${Object.values(runewords)
    .filter((u) => !u[1])
    .map((u) => u[0])
    .join('; ')}`,
);
void warn;
