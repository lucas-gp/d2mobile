/**
 * Génère src/data/levels-a2.ts : peuplement des zones de l'Acte II d'après Levels.txt (monstres des trois difficultés rapportés à nos monstres, densité, uniques, niveaux).
 * Usage : npx tsx tools/audit/gen-levels-a2.ts [dossier de sortie] (contrôle contre les MPQ : `npm run vanilla -- levels`)
 */
import { writeFileSync } from 'node:fs';
import { D2_HEADER, rows, num } from './common';

/** Dossier de sortie (défaut : src/data ; tools/vanilla/gen.ts écrit dans un dossier temporaire pour comparer) */
const OUT = process.argv[2] ?? 'src/data';

const MAP: [RegExp, string][] = [
  [/^pantherwoman/, 'panther_woman'],
  [/^slinger/, 'slinger'],
  [/^vulture/, 'vulture'],
  [/^sandraider/, 'sand_raider'],
  [/^clawviper/, 'claw_viper'],
  [/^swarm/, 'locust'],
  [/^baboon/, 'baboon'],
  [/^scarab/, 'scarab'],
  [/^sandmaggot/, 'sand_maggot'],
  [/^sandleaper/, 'sand_leaper'],
  [/^crownest/, 'foul_crow'],
  [/^mummy/, 'mummy'],
  [/^unraveler/, 'unraveler'],
  [/^zombie/, 'zombie'],
  [/^skeleton4/, 'burning_dead'],
  [/^skeleton/, 'skeleton'],
  [/^sk_archer/, 'skeleton_archer'],
  [/^skmage/, 'skeleton_mage'],
  [/^brute/, 'brute'],
  [/^blunderbore/, 'blunderbore'],
  [/^batdemon/, 'bat_demon'],
  [/^wraith/, 'wraith'],
  [/^goatman/, 'goatman'],
  [/^vampire/, 'ghoul_lord'],
];
const ours = (d2: string): string | null => MAP.find(([re]) => re.test(d2))?.[1] ?? null;
const levels: Record<number, string> = {
  41: 'a2_rocky',
  42: 'a2_dryhills',
  43: 'a2_oasis',
  44: 'a2_lostcity',
  45: 'a2_valley',
  46: 'a2_canyon',
  47: 'a2_sewer1',
  48: 'a2_sewer2',
  49: 'a2_sewer3',
  51: 'a2_harem2',
  52: 'a2_cellar1',
  53: 'a2_cellar2',
  54: 'a2_cellar3',
  55: 'a2_stony1',
  56: 'a2_halls1',
  57: 'a2_halls2',
  58: 'a2_viper1',
  59: 'a2_stony2',
  60: 'a2_halls3',
  61: 'a2_viper2',
  62: 'a2_maggot1',
  63: 'a2_maggot2',
  64: 'a2_maggot3',
  65: 'a2_tunnels',
  74: 'a2_arcane',
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
  `${OUT}/levels-a2.ts`,
  `${D2_HEADER}/** Zones de l'Acte II d'après Levels.txt (patch 1.13) : monstres [Normal, Cauchemar, Enfer], densité, niveaux, uniques. Généré par tools/audit/gen-levels-a2.ts. Niveaux Project Diablo 2 : patch du mod (mods/pd2/data/levels.patch.ts). */
export interface A2Level {
  name: string;
  den: number;
  lvl: [number, number, number];
  unique: [[number, number], [number, number], [number, number]];
  mons: [[string, number][], [string, number][], [string, number][]];
}

export const A2_LEVELS: Record<string, A2Level> = {
${out.join('\n')}
};
`,
);
console.log(out.length, 'zones');
