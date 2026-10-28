/**
 * Noms officiels anglais de Diablo II pour les entités du jeu (objets, sorts, affixes, monstres, zones) : association « identifiant → nom D2 » par les tables de D2.
 * Sortie : JSON { auto: {fr: en}, unresolved: [{id, fr, file}] }. Usage : npx tsx tools/i18n/gen-names.ts > /tmp/names.json
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { rows, slug } from '../audit/common';
import { d2 } from '../audit/common';

const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.ts$/.test(f)) files.push(p);
  }
};
walk('src/data');
const ents: { id: string; fr: string; file: string }[] = [];
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/id: '([a-z0-9_]+)',\s*name: (?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) ents.push({ id: m[1], fr: (m[2] ?? m[3]).replace(/\\'/g, "'"), file: f });
}
// anglais officiel par identifiant (slug du nom D2)
const en = new Map<string, string>();
const add = (name: string | undefined) => {
  if (!name) return;
  const n = name.replace(/ÿc./g, '').trim();
  if (n && !en.has(slug(n))) en.set(slug(n), n);
};
for (const t of ['skills', 'magicprefix', 'magicsuffix', 'levels', 'armor', 'weapons', 'misc', 'uniqueitems', 'setitems', 'sets', 'monstats', 'runes']) {
  try {
    for (const r of rows(t)) {
      add(r.skill ?? r.Skill);
      add(r.Name ?? r.name);
      add(r.index);
      add(r.LevelName);
      add(r.Id && t === 'monstats' ? d2().strings.get(String(r.NameStr)) : undefined);
      add(r['*Rune Name']);
    }
  } catch {
    /* table absente */
  }
}
const pairs = JSON.parse(readFileSync('tmp/pairs.json', 'utf8')) as Record<string, string>;
const auto: Record<string, string> = { ...pairs };
const unresolved: { id: string; fr: string; file: string }[] = [];
for (const e of ents) {
  if (auto[e.fr]) continue;
  const key = e.id.replace(/^[us]_/, '');
  const hit = en.get(slug(e.id)) ?? en.get(slug(key)) ?? en.get(slug(key.replace(/^set_/, '')));
  if (hit) auto[e.fr] = hit;
  else unresolved.push(e);
}
console.log(JSON.stringify({ auto, unresolved }));
