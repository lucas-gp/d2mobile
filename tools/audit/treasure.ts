/** Audit 5 : classes de trésor (treasureclassex.txt) vs src/data/treasure.ts. Usage : npx tsx tools/audit/treasure.ts */
import '../mods/auto';
import { rows, num } from './common';
import { MONSTER_TC, RUNE_TC_RECURSION, RUNES17_RECURSION, RUNES17_ZOD, GOOD_GEMS, GOOD_TC, JEWELRY_TC, ZONE_RUNE_TC } from '../../src/data/treasure';
import { RATES } from '../../src/data/rates';
import { RULES } from '../../src/mods/rules';

const T = new Map(rows('treasureclassex').map((r) => [r['Treasure Class'], r]));
const items = (r: Record<string, string>) => Array.from({ length: 10 }, (_, i) => [r[`Item${i + 1}`], num(r[`Prob${i + 1}`])] as [string, number]).filter(([n]) => n);
const fmt = (r?: Record<string, string>) =>
  r
    ? `picks ${r.Picks} noDrop ${r.NoDrop || 0} u/s/r/m ${r.Unique || '-'}/${r.Set || '-'}/${r.Rare || '-'}/${r.Magic || '-'} | ${items(r)
        .map(([n, p]) => `${n}:${p}`)
        .join(', ')}`
    : 'ABSENT';

console.log('## 1. Classes de monstres (D2 Enfer A5 vs nos MONSTER_TC)');
const PAIRS: [string, string][] = [
  ['normal', 'Act 5 (H) H2H A'],
  ['caster', 'Act 5 (H) Cast A'],
  ['champion', 'Act 5 (H) Champ A'],
  ['citem', 'Act 5 (H) Citem A'],
  ['unique', 'Act 5 (H) Unique A'],
  ['uitem', 'Act 5 (H) Uitem A'],
  ['boss', 'Baal (H)'],
  ['andariel0', 'Andariel'],
  ['andariel1', 'Andariel (N)'],
  ['andariel2', 'Andariel (H)'],
  ['mephisto0', 'Mephisto'],
  ['mephisto1', 'Mephisto (N)'],
  ['mephisto2', 'Mephisto (H)'],
  ['countess0', 'Countess'],
  ['countess1', 'Countess (N)'],
  ['countess2', 'Countess (H)'],
  ['countess_rune0', 'Countess Rune'],
  ['countess_rune1', 'Countess Rune (N)'],
  ['countess_rune2', 'Countess Rune (H)'],
  ['countess_item0', 'Countess Item'],
  ['countess_item1', 'Countess Item (N)'],
  ['countess_item2', 'Countess Item (H)'],
  ['nihlathak0', 'Nihlathak'],
  ['nihlathak1', 'Nihlathak (N)'],
  ['nihlathak2', 'Nihlathak (H)'],
  ['pindleskin2', 'Act 5 (H) Super Cx'],
  ['eldritch2', 'Act 5 (H) Super Cx'],
  ['shenk2', 'Act 5 (H) Super Cx'],
];
for (const [ours, d2] of PAIRS) {
  const o = MONSTER_TC[ours];
  const r = T.get(d2);
  const os = o
    ? `picks ${o.picks} noDrop ${o.noDrop} u/s/r/m ${o.mods ? `${o.mods.unique}/${o.mods.set}/${o.mods.rare}/${o.mods.magic}` : '-'} | ${o.entries.map((e) => `${e.ref}:${e.weight}`).join(', ')}`
    : 'ABSENT';
  console.log(`- ${ours} <-> ${d2}\n    nous: ${os}\n    D2  : ${fmt(r)}`);
}
console.log('\n## 2. Cow King (D2 : TC "Cow King*")');
for (const n of ['Cow King', 'Cow King (N)', 'Cow King (H)']) console.log(`  D2 ${n}: ${fmt(T.get(n))}`);
console.log(
  '  nous : cow_king spawn rank boss (zones/cows.ts) -> TC "boss" générique (picks 7 noDrop 15) ; pas de TC dédié =>',
  MONSTER_TC['cowking'] ?? MONSTER_TC['cow_king'] ?? 'aucun TC Cow King',
);

console.log('\n## 3. Récursion des TC de runes (Runes N -> Runes N-1)');
let badRec = 0;
for (let n = 2; n <= 16; n++) {
  const r = T.get(`Runes ${n}`)!;
  const it = items(r);
  const rec = it.find(([k]) => k === `Runes ${n - 1}`)?.[1] ?? 0;
  const ours = RUNE_TC_RECURSION[n - 1];
  const probs = `${it[0][1]}/${it[1][1]}`;
  if (ours !== rec || probs !== '3/2') {
    badRec++;
    console.log(`  Runes ${n}: nous=${ours} D2=${rec} (poids runes D2 ${probs})`);
  }
}
const r17 = items(T.get('Runes 17')!);
console.log(`  Runes 17: Zod nous=${RUNES17_ZOD} D2=${r17[0][1]}, récursion nous=${RUNES17_RECURSION} D2=${r17[1][1]}`);
console.log(`  -> ${badRec} écarts sur Runes 2..16`);

console.log('\n## 4. TC « Good » : rune max et gemmes par acte/difficulté (D2)');
for (const act of [1, 2, 3, 4, 5])
  for (const [d, sfx] of [
    [0, ''],
    [1, ' (N)'],
    [2, ' (H)'],
  ] as const) {
    const r = T.get(`Act ${act}${sfx} Good`);
    if (!r) continue;
    console.log(
      `  Act ${act} diff ${d}: ${items(r)
        .map(([n, p]) => `${n}:${p}`)
        .join(', ')}`,
    );
  }
console.log('  nous GOOD_TC =', JSON.stringify(GOOD_TC), ' GOOD_GEMS =', JSON.stringify(GOOD_GEMS), '(poids [ébréchée, fêlée, normale, sans défaut, parfaite])');
console.log('  nous ZONE_RUNE_TC (niveau TC Runes N par difficulté) =', JSON.stringify(ZONE_RUNE_TC));
console.log(
  '  JEWELRY_TC nous =',
  JEWELRY_TC.map((e) => `${e.ref}:${e.weight}`).join(', '),
  '| D2 Jewelry A =',
  items(T.get('Jewelry A')!)
    .map(([n, p]) => `${n}:${p}`)
    .join(', '),
);

console.log('\n## 5. Multiplicateurs de conception (écarts voulus, hors D2)');
console.log(
  `  RATES.runes=${RATES.runes} good=${RATES.good} gems=${RATES.gems} highRuneBias=${RATES.highRuneBias} noDrop=${RATES.noDrop} quality=${JSON.stringify(RATES.quality)} ; NoDrop joueurs=${RULES['loot.noDropPlayers']()}`,
);
