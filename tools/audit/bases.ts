/** Audit 1 : bases d'objets (armor/weapons/misc) vs tables D2. Usage : npx tsx tools/audit/bases.ts */
import '../mods/auto';
import { rows, num, slug } from './common';
import { BASES, BASE_BY_ID } from '../../src/data/items/index';
import { baseSize } from '../../src/data/items/sizes';

interface Cmp {
  id: string;
  field: string;
  ours: unknown;
  d2: unknown;
}
const diffs: Cmp[] = [];
const missing: string[] = [];
const matched: string[] = [];
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

for (const [tname, isWeapon] of [
  ['armor', false],
  ['weapons', true],
] as const) {
  for (const r of rows(tname)) {
    if (!r.name || r.name === 'Expansion' || r.spawnable === '') continue;
    const id = slug(r.name);
    const ours = BASE_BY_ID[id];
    if (!ours) {
      missing.push(`${tname}:${r.name}(${r.code},type=${r.type},lvl=${r.level})`);
      continue;
    }
    matched.push(id);
    const push = (field: string, o: unknown, d: unknown) => {
      if (!eq(o, d)) diffs.push({ id, field, ours: o, d2: d });
    };
    push('qlvl', ours.qlvl, num(r.level));
    push('reqLvl', ours.reqLvl, num(r.levelreq));
    push('reqStr', ours.reqStr, num(r.reqstr));
    if (isWeapon) {
      push('reqDex', ours.reqDex, num(r.reqdex));
      const two = r['2handed'] === '1';
      const d: [number, number] = two ? [num(r['2handmindam']), num(r['2handmaxdam'])] : [num(r.mindam), num(r.maxdam)];
      if (ours.dmg) push('dmg', ours.dmg, d);
      if (num(r.minmisdam)) push('missileDmg', ours.missileDmg, [num(r.minmisdam), num(r.maxmisdam)]);
      push('twoHanded', !!ours.twoHanded, two);
    } else {
      push('reqDex', ours.reqDex, 0);
      push('defense', ours.defense, [num(r.minac), num(r.maxac)]);
      if (num(r.block) || ours.block) push('block', ours.block ?? 0, num(r.block));
    }
    push('maxSockets', ours.maxSockets, num(r.gemsockets));
    push('size', baseSize(ours), [num(r.invwidth), num(r.invheight)]);
    // champs D2 absents de notre modèle : durabilité et vitesse d'arme (non comparables)
  }
}
const byField: Record<string, number> = {};
for (const d of diffs) byField[d.field] = (byField[d.field] ?? 0) + 1;
console.log(`## Bases armor+weapons : ${matched.length} appariées, ${missing.length} D2 absentes chez nous`);
console.log('Écarts par champ :', JSON.stringify(byField));
console.log('\n### Absentes\n' + missing.join('\n'));
console.log('\n### Écarts (id | champ | nous | D2)');
for (const d of diffs) console.log(`${d.id} | ${d.field} | ${JSON.stringify(d.ours)} | ${JSON.stringify(d.d2)}`);
// misc.txt : types absents (par type D2), hors runes/gemmes déjà couverts par runes.ts
const missByType: Record<string, string[]> = {};
for (const r of rows('misc')) {
  if (!r.name || r.name === 'Expansion') continue;
  const id = slug(r.name);
  if (BASE_BY_ID[id]) continue;
  (missByType[r.type] ??= []).push(r.name);
}
console.log('\n### misc.txt : lignes D2 sans base chez nous (par type)');
for (const [t, a] of Object.entries(missByType)) console.log(`${t} (${a.length}) : ${a.slice(0, 12).join(', ')}${a.length > 12 ? ', …' : ''}`);
// bases de chez nous sans équivalent D2 (hors misc/runes/etc.)
const d2ids = new Set([...rows('armor'), ...rows('weapons'), ...rows('misc')].map((r) => slug(r.name)));
console.log('\n### Chez nous sans équivalent armor/weapons/misc D2 (par id)');
console.log(
  BASES.filter((b) => !d2ids.has(b.id))
    .map((b) => `${b.id}[${b.type}]`)
    .join(', '),
);
