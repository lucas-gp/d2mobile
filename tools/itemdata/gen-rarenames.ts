/**
 * Noms des objets rares (D2 : RarePrefix.txt 46 lignes, RareSuffix.txt 155 lignes, types d'objets par suffixe)
 * → src/data/items/rare-names.ts. Noms français officiels du string.tbl français de D2 (genre du suffixe :
 * le préfixe s'accorde quand il a des variantes). Ordre français : « Morsure de la Bête » (Beast Bite).
 * Usage : npx tsx tools/itemdata/gen-rarenames.ts (MPQ de D2 requis, cf. tools/audit/common.ts)
 */
import { existsSync, writeFileSync } from 'node:fs';
import { Vfs } from '../d2import/vfs';
import { GameData } from '../d2import/data';
import { IN_DIR, PATCH, rows } from '../audit/common';

const fr = new GameData(Vfs.open(IN_DIR, existsSync(PATCH) ? [PATCH] : []), 'fra', IN_DIR).strings;

/** Codes itemtypes de D2 → types acceptés par affixTypeMatches (noms du wiki ou types du jeu) */
const ITYPE: Record<string, string[]> = {
  armo: ['Armor'],
  weap: ['Weapon'],
  misc: ['Amulet', 'Ring', 'Jewel'],
  rod: ['Rod'],
  tors: ['Chest'],
  helm: ['Helm'],
  shld: ['Shield'],
  swor: ['Sword'],
  axe: ['Axe'],
  ring: ['Ring'],
  amul: ['Amulet'],
  scep: ['Scepter'],
  knif: ['Knife'],
  spea: ['Spear'],
  pole: ['Polearm'],
  h2h: ['Claw'],
  mace: ['Tipped Mace'],
  club: ['Club'],
  hamm: ['Hammer'],
  wand: ['Wand'],
  miss: ['Missile Weapon'],
  jave: ['Javelin'],
  staf: ['Staff'],
  bow: ['bow'],
  glov: ['gloves'],
  boot: ['boots'],
  belt: ['belt'],
  orb: ['orb'],
  jewl: ['jewel'],
  blun: ['mace', 'scepter', 'staff', 'wand'],
};

const clean = (s: string): string =>
  s
    .replace(/ÿc./g, '')
    .replace(/^\[[a-z]{2}\]/, '')
    .trim();
/** « [fs]voilée[ms]voilé… » → variantes masculine / féminine */
function genders(s: string): { m: string; f: string; fem: boolean } {
  s = clean(s);
  const tag = (t: string) => s.match(new RegExp(String.raw`\[${t}\]([^[]*)`))?.[1]?.trim();
  const m = tag('ms');
  const f = tag('fs');
  if (m || f) return { m: m ?? f!, f: f ?? m!, fem: s.startsWith('[fs]') };
  return { m: s, f: s, fem: false };
}
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const types = (r: Record<string, string>, k: 'itype' | 'etype', n: number): string[] => {
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const c = r[`${k}${i}`];
    if (!c) continue;
    if (!ITYPE[c]) throw new Error(`type D2 inconnu ${c}`);
    for (const t of ITYPE[c]) if (!out.includes(t)) out.push(t);
  }
  return out;
};
const q = (s: string): string => `'${s.replace(/'/g, "\\'")}'`;

/** Coquilles du string.tbl français */
const FIX: Record<string, string> = { Skull: 'du Crâne', Havoc: 'de la Désolation' };
const pre: string[] = [];
const seen = new Set<string>();
for (const r of rows('rareprefix')) {
  const g = genders(FIX[r.name] ?? fr.get(r.name) ?? r.name);
  const key = `${g.m}|${g.f}`;
  if (seen.has(key)) continue; // « Storm » figure deux fois dans la table
  seen.add(key);
  pre.push(g.m === g.f ? `[${q(g.m)}]` : `[${q(g.m)}, ${q(g.f)}]`);
}
const suf: string[] = [];
for (const r of rows('raresuffix')) {
  const g = genders(fr.get(r.name) ?? r.name);
  const it = types(r, 'itype', 7);
  const et = types(r, 'etype', 4);
  suf.push(`  [${q(cap(g.m))}, ${g.fem ? 1 : 0}, ${q(it.join('|'))}${et.length ? `, ${q(et.join('|'))}` : ''}],`);
}

writeFileSync(
  'src/data/items/rare-names.ts',
  `/**
 * Noms des objets rares de D2 (RarePrefix / RareSuffix, noms français officiels). Généré par
 * tools/itemdata/gen-rarenames.ts : ne pas modifier à la main.
 */

/** Préfixes : [masculin, féminin?] */
export const RARE_PREFIXES: [string, string?][] = [
  ${pre.join(',\n  ')},
];

/** Suffixes : [nom, féminin (1), types acceptés, types exclus] */
export const RARE_SUFFIXES: [string, 0 | 1, string, string?][] = [
${suf.join('\n')}
];
`,
);
console.log(`préfixes ${pre.length}, suffixes ${suf.length}`);
