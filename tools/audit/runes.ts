/** Audit 2 : runes, gemmes, mots runiques vs misc.txt / gems.txt / runes.txt. Usage : npx tsx tools/audit/runes.ts */
import '../mods/auto';
import { rows, num, slug } from './common';
import { RUNES, GEMS } from '../../src/data/items/runes';
import { RUNEWORDS } from '../../src/data/items/runewords';
import { BASE_BY_ID } from '../../src/data/items/index';

/** Décode une ligne de mod D2 en valeurs comparables (poison : dégâts totaux = min*durée/256 ; codes « -len » ignorés). */
function modVals(g: Record<string, string> | undefined, p: string): number[] {
  const out: number[] = [];
  if (!g) return out;
  for (let i = 1; i <= 3; i++) {
    const c = g[`${p}Mod${i}Code`];
    if (!c || c.endsWith('-len')) continue;
    let mn = num(g[`${p}Mod${i}Min`]),
      mx = num(g[`${p}Mod${i}Max`]);
    if (c === 'dmg-pois') {
      mn = mx = Math.round((mn * num(g[`${p}Mod${i}Param`])) / 256);
    }
    if (c === 'pois-min') {
      const len = [1, 2, 3].map((j) => (g[`${p}Mod${j}Code`] === 'pois-len' ? num(g[`${p}Mod${j}Min`]) : 0)).find(Boolean) ?? 0;
      mn = mx = Math.round((mn * len) / 256);
    }
    if (c === 'pois-max') continue;
    out.push(Math.abs(mn), Math.abs(mx));
  }
  return out;
}
const vals = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b).join('/');
const miscByCode = new Map(rows('misc').map((r) => [r.code, r]));

console.log('## Runes (niveau requis, effets par emplacement)');
const gems = rows('gems');
let nDiff = 0;
for (const r of RUNES) {
  const code = r.id; // r01..r33
  const m = miscByCode.get(code)!;
  const g = gems.find((x) => x.code === code);
  const lv = num(m.levelreq);
  const lvOk = lv === r.reqLvl;
  const slot = (p: 'weapon' | 'helm' | 'shield') => modVals(g, p);
  const ours = { weapon: r.weapon, armor: r.armor, shield: r.shield } as any;
  const ov = (k: string) => (ours[k] as any[]).flatMap((s) => [Math.abs(s.min), Math.abs(s.max)]);
  const row = (k: string, d: number[]) => {
    const a = vals(ov(k).filter((x) => x !== 0));
    const b = vals(d.filter((x) => x !== 0));
    const ok = a === b;
    if (!ok) nDiff++;
    return ok
      ? ''
      : `  ${k}: nous=${a || '-'} D2=${b || '-'} (codes ${[1, 2, 3]
          .map((i) => g?.[`${k === 'armor' ? 'helm' : k}Mod${i}Code`])
          .filter(Boolean)
          .join(',')})`;
  };
  const lines = [row('weapon', slot('weapon')), row('armor', slot('helm')), row('shield', slot('shield'))].filter(Boolean);
  if (!lvOk || lines.length) console.log(`${r.name} (${code}) lvl nous=${r.reqLvl} D2=${lv}${lvOk ? '' : ' [ECART]'}\n${lines.join('\n')}`);
}
console.log(`-> ${nDiff} effets (rune x emplacement) différents`);

console.log('\n## Gemmes (valeurs par grade)');
// D2 : codes gcv gfv gsv gzv gpv, puis par gemme : amethyst gc? On balaie les lignes de gems.txt dont le nom contient un grade.
for (const g of GEMS) {
  const names = { 0: 'Chipped', 1: 'Flawed', 2: '', 3: 'Flawless', 4: 'Perfect' } as any;
  const kind = g.kind[0].toUpperCase() + g.kind.slice(1);
  const want = `${names[g.grade]} ${kind}`.trim();
  const fix = (n: string) => n.replace('Saphire', 'Sapphire').replace('Flwless', 'Flawless');
  const d = gems.find((x) => fix(x.name) === want);
  if (!d) {
    console.log(`${g.id}: ligne D2 « ${want} » introuvable`);
    continue;
  }
  const dv = (p: string) => vals(modVals(d, p).filter((x) => x !== 0));
  const ov = (a: any[]) => vals(a.flatMap((s) => [s.min, s.max]).filter((x) => x !== 0));
  const cmp = [
    ['weapon', 'weapon', g.weapon],
    ['helm', 'armor', g.armor],
    ['shield', 'shield', g.shield],
  ] as const;
  for (const [p, label, arr] of cmp)
    if (dv(p) !== ov(arr as any[]))
      console.log(
        `${g.id} ${label}: nous=${ov(arr as any[])} D2=${dv(p)} (codes ${[1, 2, 3]
          .map((i) => d[`${p}Mod${i}Code`])
          .filter(Boolean)
          .join(',')})`,
      );
  const m = [...miscByCode.values()].find((x) => x.name === want);
  // eslint-disable-next-line no-constant-condition -- contrôle du niveau requis volontairement désactivé (`&& false`), gardé pour mémoire
  if (m && num(m.levelreq) !== [1, 5, 12, 15, 18][g.grade] && false) console.log('lvl');
}

console.log('\n## Mots runiques');
const runeName = (id: string) => RUNES.find((r) => r.id === id)!.name;
const d2rw = rows('runes').filter((r) => r['Rune Name']);
const complete = d2rw.filter((r) => r.complete === '1');
console.log(`D2 runes.txt : ${d2rw.length} lignes, ${complete.length} complètes (1.13/1.14). Nous : ${RUNEWORDS.length}`);
const seq = (r: any) =>
  [1, 2, 3, 4, 5, 6]
    .map((i) => r[`Rune${i}`])
    .filter(Boolean)
    .map((c: string) => runeName(c.toLowerCase()))
    .join(' ');
const oursBySeq = new Map<string, typeof RUNEWORDS>();
for (const w of RUNEWORDS) {
  const k = w.runes.map(runeName).join(' ');
  oursBySeq.set(k, [...(oursBySeq.get(k) ?? []), w]);
}
const usedOurs = new Set<string>();
const absent: string[] = [],
  seqDiff: string[] = [],
  lvlDiff: string[] = [],
  ok: string[] = [];
for (const r of complete) {
  const name = r['Rune Name'];
  const s = seq(r);
  const byId = RUNEWORDS.find((w) => w.id === 'rw_' + slug(name));
  const bySeq = oursBySeq.get(s);
  const w = byId ?? bySeq?.[0];
  if (!w) {
    absent.push(`${name} (${s})`);
    continue;
  }
  usedOurs.add(w.id);
  const ws = w.runes.map(runeName).join(' ');
  if (ws !== s) {
    seqDiff.push(`${name}: nous=${ws} D2=${s}`);
    continue;
  }
  const expLvl = Math.max(...s.split(' ').map((n) => RUNES.find((x) => x.name === n)!.reqLvl));
  if (w.reqLvl < expLvl) lvlDiff.push(`${name}: nous=${w.reqLvl} < niveau des runes ${expLvl}`);
  else ok.push(name);
}
console.log(`Recettes identiques : ${ok.length}`);
console.log(`D2 complets absents chez nous (${absent.length}) :\n  ` + absent.join('\n  '));
console.log(`Même nom, recette différente (${seqDiff.length}) :\n  ` + seqDiff.join('\n  '));
console.log(`Niveau requis < niveau des runes (${lvlDiff.length}) :\n  ` + lvlDiff.join('\n  '));
const d2seqs = new Set(d2rw.map(seq));
console.log(`Chez nous mais pas dans runes.txt D2 (même recette absente) (${RUNEWORDS.filter((w) => !d2seqs.has(w.runes.map(runeName).join(' '))).length}) :`);
console.log(
  '  ' +
    RUNEWORDS.filter((w) => !d2seqs.has(w.runes.map(runeName).join(' ')))
      .map((w) => `${w.name}[${w.runes.map(runeName).join(' ')}]`)
      .join('\n  '),
);

console.log('\n### Similarité des propriétés (valeurs numériques D2 retrouvées dans les nôtres ; PD2 modifie beaucoup de mots runiques)');
const low: string[] = [];
for (const r of complete) {
  const w = RUNEWORDS.find((x) => x.id === 'rw_' + slug(r['Rune Name'])) ?? oursBySeq.get(seq(r))?.[0];
  if (!w) continue;
  const d: number[] = [];
  for (let i = 1; i <= 7; i++)
    if (r[`T1Code${i}`]) {
      const a = num(r[`T1Min${i}`]),
        b = num(r[`T1Max${i}`]);
      d.push(a, b);
    }
  const ours = new Set(w.mods.flatMap((m) => [m.min, m.max]));
  const dd = [...new Set(d.filter((x) => x))];
  const hit = dd.filter((x) => ours.has(x)).length;
  const ratio = dd.length ? hit / dd.length : 1;
  if (ratio < 0.5) low.push(`${r['Rune Name']}: ${hit}/${dd.length} valeurs D2 retrouvées (nos mods: ${w.mods.length}, D2: ${[1, 2, 3, 4, 5, 6, 7].filter((i) => r[`T1Code${i}`]).length})`);
}
console.log(`${low.length} mots runiques < 50 % de valeurs communes :\n  ` + low.join('\n  '));
void BASE_BY_ID;
