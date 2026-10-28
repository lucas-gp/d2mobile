/**
 * Génère src/data/levels-a3.ts : peuplement des zones de l'Acte III d'après Levels.txt (monstres des trois difficultés rapportés à nos monstres, densité, uniques, niveaux).
 * Usage : npx tsx tools/audit/gen-levels-a3.ts [dossier de sortie] (contrôle contre les MPQ : `npm run vanilla -- levels`)
 */
import { writeFileSync } from 'node:fs';
import { D2_HEADER, rows, num } from './common';

/** Dossier de sortie (défaut : src/data ; tools/vanilla/gen.ts écrit dans un dossier temporaire pour comparer) */
const OUT = process.argv[2] ?? 'src/data';

const MAP: [RegExp, string][] = [
  [/^mosquito/, 'mosquito'],
  [/^thornhulk/, 'thornhulk'],
  [/^fetishblow/, 'fetish_blow'],
  [/^fetishshaman/, 'fetish_shaman'],
  [/^bonefetish/, 'bone_fetish'],
  [/^fetish/, 'fetish'],
  [/^frogdemon/, 'frog_demon'],
  [/^zealot/, 'zealot'],
  [/^cantor/, 'cantor'],
  [/^baboon/, 'baboon'],
  [/^vulture/, 'vulture'],
  [/^willowisp/, 'willowisp'],
  [/^(foulcrow|crownest)/, 'foul_crow'],
  [/^swarm/, 'locust'],
  [/^sandleaper/, 'sand_leaper'],
  [/^sandraider/, 'sand_raider'],
  [/^arach/, 'arach'],
  [/^batdemon/, 'bat_demon'],
  [/^sandmaggot/, 'sand_maggot'],
  [/^mummy/, 'mummy'],
  [/^unraveler/, 'unraveler'],
  [/^wraith/, 'wraith'],
  [/^zombie/, 'zombie'],
  [/^skeleton/, 'skeleton'],
  [/^sk_archer/, 'skeleton_archer'],
  [/^skmage/, 'skeleton_mage'],
  [/^vampire/, 'ghoul_lord'],
  [/^blunderbore/, 'blunderbore'],
  [/^(corruptrogue|cr_lancer|cr_archer)/, 'dark_stalker'],
  [/^brute/, 'brute'],
  [/^clawviper/, 'claw_viper'],
  [/^scarab/, 'scarab'],
];
const ours = (d2: string): string | null => MAP.find(([re]) => re.test(d2))?.[1] ?? null;
const levels: Record<number, string> = {
  76: 'a3_spider',
  77: 'a3_marsh',
  78: 'a3_jungle',
  79: 'a3_lower',
  80: 'a3_bazaar',
  81: 'a3_upper',
  82: 'a3_causeway',
  83: 'a3_travincal',
  84: 'a3_cave1',
  85: 'a3_cave2',
  86: 'a3_pit1',
  87: 'a3_pit2',
  88: 'a3_flayer1',
  89: 'a3_flayer2',
  90: 'a3_pit3',
  91: 'a3_flayer3',
  92: 'a3_sewer1',
  93: 'a3_sewer2',
  94: 'a3_temple1',
  95: 'a3_temple2',
  96: 'a3_temple3',
  97: 'a3_temple4',
  98: 'a3_temple5',
  99: 'a3_temple6',
  100: 'a3_durance1',
  101: 'a3_durance2',
};
const out: string[] = [];
for (const r of rows('levels')) {
  const id = num(r.Id);
  const key = levels[id];
  if (!key) continue;
  const mix = (pre: string): string => {
    const c = new Map<string, number>();
    for (let i = 1; i <= 10; i++) {
      const m = ours(String(r[`${pre}${i}`] ?? '').toLowerCase());
      if (m) c.set(m, (c.get(m) ?? 0) + 1);
    }
    return `[${[...c].map(([m, n]) => `['${m}', ${n}]`).join(', ')}]`;
  };
  const u = (k: string) => `[${num(r[`MonU${k}`] ?? r[`MonU${k}(N)`])}, ${num(r[`MonU${k}(H)`] ?? r[`MonU${k}`])}]`;
  const un = [`[${num(r.MonUMin)}, ${num(r.MonUMax)}]`, `[${num(r['MonUMin(N)'])}, ${num(r['MonUMax(N)'])}]`, `[${num(r['MonUMin(H)'])}, ${num(r['MonUMax(H)'])}]`];
  void u;
  out.push(
    `  ${key}: { name: '${String(r.LevelName).replace(/'/g, "\\'")}', den: ${num(r['MonDen'])}, lvl: [${num(r.MonLvl1Ex)}, ${num(r.MonLvl2Ex)}, ${num(r.MonLvl3Ex)}], unique: [${un.join(', ')}], mons: [${mix('mon')}, ${mix('nmon')}, ${mix('nmon')}] },`,
  );
}
writeFileSync(
  `${OUT}/levels-a3.ts`,
  `${D2_HEADER}/** Zones de l'Acte III d'après Levels.txt (patch 1.13) : monstres [Normal, Cauchemar, Enfer], densité, niveaux, uniques. Généré par tools/audit/gen-levels-a3.ts. Niveaux Project Diablo 2 : patch du mod (mods/pd2/data/levels.patch.ts). */
export interface A3Level {
  name: string;
  den: number;
  lvl: [number, number, number];
  unique: [[number, number], [number, number], [number, number]];
  mons: [[string, number][], [string, number][], [string, number][]];
}

export const A3_LEVELS: Record<string, A3Level> = {
${out.join('\n')}
};
`,
);
console.log(out.length, 'zones');
