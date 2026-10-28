/**
 * Noms officiels (string.tbl d'après les tables du jeu) pour chaque entité de src/data : par identifiant (slug du nom D2), sinon par le nom français officiel.
 * Sortie JSON { overrides: {fr: en}, unresolved: [...] }. Usage : npx tsx tools/i18n/gen-official.ts > tmp/official2.json
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Vfs } from '../d2import/vfs';
import { GameData } from '../d2import/data';
import { IN_DIR, PATCH } from '../audit/common';

/** identifiant comparable : sans apostrophes, espaces ni tirets */
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '');

const mk = (lang: string) => new GameData(Vfs.open(IN_DIR, existsSync(PATCH) ? [PATCH] : []), lang, IN_DIR);
const E = mk('eng');
const F = mk('fra');
const clean = (s: string) => s.replace(/ÿc./g, '').trim();
const disp = (g: GameData, key: string | undefined) => (key ? clean(g.strings.get(key) ?? key) : '');

type Cat = 'unique' | 'set' | 'runeword' | 'affix' | 'skill' | 'monster' | 'level' | 'base';
interface Src {
  cat: Cat;
  table: string;
  keys: (r: Record<string, string>) => string[];
}
const SRC: Src[] = [
  { cat: 'unique', table: 'uniqueitems', keys: (r) => [r.index] },
  { cat: 'set', table: 'setitems', keys: (r) => [r.index] },
  { cat: 'set', table: 'sets', keys: (r) => [r.index] },
  { cat: 'runeword', table: 'runes', keys: (r) => [r.Name] },
  { cat: 'affix', table: 'magicprefix', keys: (r) => [r.Name] },
  { cat: 'affix', table: 'magicsuffix', keys: (r) => [r.Name] },
  { cat: 'skill', table: 'skilldesc', keys: (r) => [r['str name']] },
  { cat: 'monster', table: 'monstats', keys: (r) => [r.NameStr] },
  { cat: 'level', table: 'levels', keys: (r) => [r.LevelName] },
  { cat: 'base', table: 'armor', keys: (r) => [r.namestr, r.name] },
  { cat: 'base', table: 'weapons', keys: (r) => [r.namestr, r.name] },
  { cat: 'base', table: 'misc', keys: (r) => [r.namestr, r.name] },
  { cat: 'base', table: 'gems', keys: (r) => [r.name] },
];
const byId = new Map<Cat, Map<string, string>>();
const byFr = new Map<Cat, Map<string, string>>();
for (const s of SRC) {
  const t = E.table(s.table);
  if (!t) continue;
  const ids = byId.get(s.cat) ?? new Map();
  const frs = byFr.get(s.cat) ?? new Map();
  for (const r of t.rows) {
    for (const k of s.keys(r as Record<string, string>)) {
      if (!k) continue;
      const en = disp(E, k);
      if (!en) continue;
      for (const key of [k, en]) if (!ids.has(slug(key))) ids.set(slug(key), en);
      const fr = disp(F, k);
      if (fr && fr !== en && !frs.has(fr)) frs.set(fr, en);
    }
  }
  byId.set(s.cat, ids);
  byFr.set(s.cat, frs);
}
// stats/skills : le nom d'un sort vient de skills.txt (skill → skilldesc → str name)
{
  const ids = byId.get('skill') ?? new Map();
  const frs = byFr.get('skill') ?? new Map();
  for (const r of E.needTable('skills').rows) {
    const d = E.needTable('skilldesc').rows.find((x) => x.skilldesc === r.skilldesc);
    const k = d?.['str name'];
    if (!k) continue;
    const en = disp(E, k);
    ids.set(slug(r.skill), en);
    const fr = disp(F, k);
    if (fr && fr !== en) frs.set(fr, en);
  }
  byId.set('skill', ids);
  byFr.set('skill', frs);
}

const catOf = (file: string): Cat[] => {
  if (/uniques/.test(file)) return ['unique'];
  if (/sets/.test(file)) return ['set'];
  if (/runewords/.test(file)) return ['runeword'];
  if (/affixes/.test(file)) return ['affix'];
  if (/skills/.test(file)) return []; // les compétences gardent leurs noms déjà vérifiés (ids de compétences PD2 ≠ table D2)
  if (/monsters|superuniques/.test(file)) return ['monster'];
  if (/levels|zones|runs|waypoints|campaigns|maps/.test(file)) return ['level', 'monster'];
  if (/bases|misc|runes|cube/.test(file)) return ['base', 'unique', 'set'];
  return [];
};

const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.ts$/.test(f)) files.push(p);
  }
};
walk('src/data');
const overrides: Record<string, string> = {};
const unresolved: { id: string; fr: string; file: string }[] = [];
for (const f of files) {
  const cats = catOf(f);
  if (!cats.length) continue;
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/id: '([a-z0-9_]+)',\s*name: (?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
    const id = m[1];
    const fr = (m[2] ?? m[3]).replace(/\\'/g, "'");
    const key = id.replace(/^[us]_/, '');
    let hit: string | undefined;
    for (const c of cats) {
      hit = byId.get(c)?.get(slug(id)) ?? byId.get(c)?.get(slug(key)) ?? byFr.get(c)?.get(fr);
      if (hit) break;
    }
    if (hit && hit === `${fr} Rune`) hit = fr; // les runes se nomment « Tal » dans nos listes
    if (hit) overrides[fr] = hit;
    else unresolved.push({ id, fr, file: f });
  }
}
console.error(`overrides ${Object.keys(overrides).length} non résolus ${unresolved.length}`);
console.log(JSON.stringify({ overrides, unresolved }));
