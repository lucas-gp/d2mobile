/** Audit 3 : uniques et sets vs uniqueitems.txt / setitems.txt / sets.txt. Usage : npx tsx tools/audit/uniques.ts [--all] */
import '../mods/auto';
import { rows, num, slug } from './common';
import { UNIQUES } from '../../src/data/items/uniques';
import { SET_ITEMS, SETS } from '../../src/data/items/sets';
import { BASE_BY_ID } from '../../src/data/items/index';

const all = process.argv.includes('--all');
const s2 = (n: string) => slug(n.replace(/'/g, ''));
const base = (code: string): string => {
  for (const t of ['armor', 'weapons', 'misc']) {
    const r = rows(t).find((x) => x.code === code);
    if (r) return slug(r.name);
  }
  return '?';
};
const nums = (r: Record<string, string>, kind: 'u' | 's'): number[] => {
  const o: number[] = [];
  const cols =
    kind === 'u'
      ? Array.from({ length: 12 }, (_, i) => [`prop${i + 1}`, `min${i + 1}`, `max${i + 1}`])
      : [
          ...Array.from({ length: 9 }, (_, i) => [`prop${i + 1}`, `min${i + 1}`, `max${i + 1}`]),
          ...Array.from({ length: 5 }, (_, i) => [`aprop${i + 1}a`, `amin${i + 1}a`, `amax${i + 1}a`]),
          ...Array.from({ length: 5 }, (_, i) => [`aprop${i + 1}b`, `amin${i + 1}b`, `amax${i + 1}b`]),
        ];
  for (const [p, a, b] of cols) if (r[p]) o.push(num(r[a]), num(r[b]));
  return o.filter((x) => x);
};
const modNums = (mods: { min: number; max: number }[]) => new Set(mods.flatMap((m) => [Math.abs(m.min), Math.abs(m.max)]));

const d2u = rows('uniqueitems').filter((r) => r.index && r.enabled === '1' && r.code && r.rarity !== '');
const d2uAll = rows('uniqueitems').filter((r) => r.index && r.code);
console.log(`## Uniques : D2 ${d2uAll.length} lignes (dont ${d2u.length} enabled=1) ; nous ${UNIQUES.length} (dont ${UNIQUES.filter((u) => u.noRandomDrop).length} PD2 hors table)`);
const byId = new Map(UNIQUES.map((u) => [u.id, u]));
const absent: string[] = [],
  dl: string[] = [],
  simil: { n: string; r: number; h: number; t: number }[] = [];
let matched = 0;
for (const r of d2u) {
  const u = byId.get('u_' + s2(r.index));
  if (!u) {
    absent.push(`${r.index}(${r['*type']},lvl ${r.lvl})`);
    continue;
  }
  matched++;
  const b = base(r.code);
  const issues: string[] = [];
  if (u.lvl !== num(r.lvl)) issues.push(`lvl nous=${u.lvl} D2=${r.lvl}`);
  if (u.reqLvl !== num(r['lvl req'])) issues.push(`reqLvl nous=${u.reqLvl} D2=${r['lvl req']}`);
  if (u.base !== b) issues.push(`base nous=${u.base} D2=${b}`);
  if (u.rarity !== num(r.rarity)) issues.push(`rarity nous=${u.rarity} D2=${r.rarity}`);
  if (issues.length) dl.push(`${r.index}: ${issues.join('; ')}`);
  const d = [...new Set(nums(r, 'u'))];
  const o = modNums(u.mods);
  const h = d.filter((x) => o.has(x)).length;
  simil.push({ n: r.index, r: d.length ? h / d.length : 1, h, t: d.length });
}
console.log(`Appariés : ${matched} ; D2 enabled absents chez nous : ${absent.length}`);
console.log('Absents : ' + absent.join(', '));
console.log(`Écarts lvl/reqLvl/base/rarity : ${dl.length}\n  ` + dl.join('\n  '));
const lowU = simil.filter((s) => s.r < 0.6);
console.log(`Propriétés : ${lowU.length} uniques avec < 60 % des valeurs D2 retrouvées (sur ${simil.length}) :`);
for (const s of lowU) console.log(`  ${s.n}: ${s.h}/${s.t}`);
const d2names = new Set(d2uAll.map((r) => 'u_' + s2(r.index)));
console.log(
  'Chez nous sans ligne D2 : ' +
    UNIQUES.filter((u) => !d2names.has(u.id))
      .map((u) => u.id)
      .join(', '),
);

console.log('\n## Sets');
const d2si = rows('setitems').filter((r) => r.index);
const d2sets = rows('sets').filter((r) => r.index);
console.log(`D2 : ${d2sets.length} sets, ${d2si.length} pièces ; nous : ${SETS.length} sets, ${SET_ITEMS.length} pièces`);
const bySid = new Map(SET_ITEMS.map((s) => [s.id, s]));
const sAbsent: string[] = [],
  sDl: string[] = [],
  sLow: string[] = [];
for (const r of d2si) {
  const s = bySid.get('s_' + s2(r.index));
  if (!s) {
    sAbsent.push(r.index);
    continue;
  }
  const b = base(r.item);
  const issues: string[] = [];
  if (s.lvl !== num(r.lvl)) issues.push(`lvl nous=${s.lvl} D2=${r.lvl}`);
  if (s.reqLvl !== num(r['lvl req'])) issues.push(`reqLvl nous=${s.reqLvl} D2=${r['lvl req']}`);
  if (s.base !== b) issues.push(`base nous=${s.base} D2=${b}`);
  if (s.rarity !== num(r.rarity)) issues.push(`rarity nous=${s.rarity} D2=${r.rarity}`);
  if (issues.length) sDl.push(`${r.index}: ${issues.join('; ')}`);
  const d = [...new Set(nums(r, 's'))];
  const o = modNums([...s.mods, ...(s.partial ?? []).flatMap((p) => p.mods)]);
  const h = d.filter((x) => o.has(x)).length;
  if (d.length && h / d.length < 0.6) sLow.push(`${r.index}: ${h}/${d.length}`);
}
console.log(`Pièces absentes (${sAbsent.length}) : ${sAbsent.join(', ')}`);
console.log(`Écarts lvl/reqLvl/base/rarity (${sDl.length}) :\n  ` + sDl.join('\n  '));
console.log(`Pièces < 60 % de valeurs communes (${sLow.length}) :\n  ` + sLow.join('\n  '));
// bonus de sets
const setLow: string[] = [];
for (const r of d2sets) {
  const s = SETS.find((x) => x.id === 'set_' + s2(r.index));
  if (!s) {
    setLow.push(`${r.index}: ABSENT`);
    continue;
  }
  const d: number[] = [];
  for (const k of ['2', '3', '4', '5']) for (const x of ['a', 'b']) if (r[`PCode${k}${x}`]) d.push(num(r[`PMin${k}${x}`]), num(r[`PMax${k}${x}`]));
  for (let i = 1; i <= 8; i++) if (r[`FCode${i}`]) d.push(num(r[`FMin${i}`]), num(r[`FMax${i}`]));
  const dd = [...new Set(d.filter((x) => x))];
  const o = modNums(s.bonuses.flatMap((b) => b.mods));
  const h = dd.filter((x) => o.has(x)).length;
  if (dd.length && h / dd.length < 0.6) setLow.push(`${r.index}: ${h}/${dd.length} valeurs de bonus D2 retrouvées`);
}
console.log(`Bonus de sets < 60 % (${setLow.length}) :\n  ` + setLow.join('\n  '));
void BASE_BY_ID;
void all;
