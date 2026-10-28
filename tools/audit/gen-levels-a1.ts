/**
 * Génère src/data/levels-a1.ts : peuplement des zones de l'Acte I d'après Levels.txt (monstres des trois difficultés rapportés à nos monstres, densité, uniques, niveaux).
 * Usage : npx tsx tools/audit/gen-levels-a1.ts [dossier de sortie] (contrôle contre les MPQ : `npm run vanilla -- levels`)
 */
import { writeFileSync } from 'node:fs';
import { D2_HEADER, rows, num } from './common';

/** Dossier de sortie (défaut : src/data ; tools/vanilla/gen.ts écrit dans un dossier temporaire pour comparer) */
const OUT = process.argv[2] ?? 'src/data';

const MAP: [RegExp, string][] = [
  [/^zombie/, 'zombie'],
  [/^fallenshaman/, 'fallen_shaman'],
  [/^fallen/, 'fallen'],
  [/^quillrat/, 'quill_rat'],
  [/^brute/, 'brute'],
  [/^(corruptrogue|cr_lancer|cr_archer)/, 'dark_stalker'],
  [/^skeleton/, 'skeleton'],
  [/^sk_archer/, 'skeleton_archer'],
  [/^skmage/, 'skeleton_mage'],
  [/^(crownest|foulcrow)/, 'foul_crow'],
  [/^goatman/, 'goatman'],
  [/^bighead/, 'afflicted'],
  [/^wraith/, 'wraith'],
  [/^fetish/, 'soul_killer'],
  [/^arach/, 'arach'],
  [/^vampire/, 'ghoul_lord'],
  [/^hellbovine/, 'hell_bovine'],
];
const ours = (d2: string): string | null => MAP.find(([re]) => re.test(d2))?.[1] ?? null;
const levels: Record<number, string> = {
  2: 'a1_bloodmoor',
  3: 'a1_coldplains',
  4: 'a1_stonyfield',
  5: 'a1_darkwood',
  6: 'a1_blackmarsh',
  7: 'a1_tamoe',
  8: 'a1_den',
  9: 'a1_cave1',
  10: 'a1_underpass1',
  11: 'a1_hole1',
  12: 'a1_pit1',
  13: 'a1_cave2',
  14: 'a1_underpass2',
  15: 'a1_hole2',
  16: 'a1_pit2',
  17: 'a1_burial',
  18: 'a1_crypt',
  19: 'a1_mausoleum',
  20: 'a1_tower',
  21: 'a1_cellar1',
  22: 'a1_cellar2',
  23: 'a1_cellar3',
  24: 'a1_cellar4',
  26: 'a1_monastery',
  27: 'a1_cloister',
  28: 'a1_barracks',
  29: 'a1_jail1',
  30: 'a1_jail2',
  31: 'a1_jail3',
  32: 'a1_inner',
  33: 'a1_cathedral',
  34: 'a1_cata1',
  35: 'a1_cata2',
  36: 'a1_cata3',
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
  `${OUT}/levels-a1.ts`,
  `${D2_HEADER}/** Zones de l'Acte I d'après Levels.txt (patch 1.13) : monstres [Normal, Cauchemar, Enfer], densité, niveaux, uniques. Généré par tools/audit/gen-levels-a1.ts. Niveaux Project Diablo 2 : patch du mod (mods/pd2/data/levels.patch.ts). */
export interface A1Level {
  name: string;
  den: number;
  lvl: [number, number, number];
  unique: [[number, number], [number, number], [number, number]];
  mons: [[string, number][], [string, number][], [string, number][]];
}

export const A1_LEVELS: Record<string, A1Level> = {
${out.join('\n')}
};
`,
);
console.log(out.length, 'zones');
