/** Paires officielles français → anglais tirées des string.tbl de D2 (clé commune des deux langues). Usage : npx tsx tools/i18n/official.ts > tmp/official.json */
import { existsSync } from 'node:fs';
import { Vfs } from '../d2import/vfs';
import { GameData } from '../d2import/data';
import { IN_DIR, PATCH } from '../audit/common';

const mk = (lang: string) => new GameData(Vfs.open(IN_DIR, existsSync(PATCH) ? [PATCH] : []), lang, IN_DIR).strings;
const en = mk('eng');
let fr: Map<string, string>;
try {
  fr = mk('fra');
} catch {
  fr = new Map();
}
const clean = (s: string) => s.replace(/ÿc./g, '').trim();
const out: Record<string, string> = {};
for (const [k, f] of fr) {
  const e = en.get(k);
  if (e && clean(f) && clean(e) && clean(f) !== clean(e)) out[clean(f)] = clean(e);
}
console.error(`eng ${en.size} fra ${fr.size} paires ${Object.keys(out).length}`);
console.log(JSON.stringify(out));
