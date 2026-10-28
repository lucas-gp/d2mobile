/**
 * Génère src/data/levels-a5.ts : peuplement des zones de l'Acte V d'après Levels.txt (comme gen-levels-a1.ts) et src/data/superuniques.ts :
 * table des super-uniques de SuperUniques.txt rapportés à nos monstres (par la classe de monstats), pour toutes les campagnes.
 * Usage : npx tsx tools/audit/gen-levels-a5.ts [dossier de sortie] (contrôle contre les MPQ : `npm run vanilla -- levels`)
 */
import { writeFileSync } from 'node:fs';
import { D2_HEADER, rows, num } from './common';

/** Dossier de sortie (défaut : src/data ; tools/vanilla/gen.ts écrit dans un dossier temporaire pour comparer) */
const OUT = process.argv[2] ?? 'src/data';

const MAP: [RegExp, string][] = [
  [/^minion/, 'minion'],
  [/^suicideminion/, 'suicide_minion'],
  [/^deathmauler/, 'death_mauler'],
  [/^overseer/, 'overseer'],
  [/^imp/, 'imp'],
  [/^sk_archer/, 'skeleton_archer'],
  [/^skmage/, 'skeleton_mage'],
  [/^skeleton/, 'skeleton'],
  [/^quillrat/, 'quill_rat'],
  [/^bighead/, 'afflicted'],
  [/^(foulcrow|crownest)/, 'foul_crow'],
  [/^vulture/, 'vulture'],
  [/^thornhulk/, 'thornhulk'],
  [/^slinger/, 'slinger'],
  [/^siegebeast/, 'siege_beast'],
  [/^(cr_archer|cr_lancer|corruptrogue)/, 'dark_stalker'],
  [/^blunderbore/, 'blunderbore'],
  [/^goatman/, 'goatman'],
  [/^fallenshaman/, 'fallen_shaman'],
  [/^fallen/, 'fallen'],
  [/^snowyeti/, 'snowy_yeti'],
  [/^frozenhorror/, 'frozen_horror'],
  [/^succubuswitch/, 'succubus_witch'],
  [/^succubus/, 'succubus'],
  [/^bloodlord/, 'blood_lord'],
  [/^sandraider/, 'sand_raider'],
  [/^sandleaper/, 'sand_leaper'],
  [/^wraith/, 'wraith'],
  [/^clawviper/, 'claw_viper'],
  [/^reanimatedhorde/, 'prowling_dead'],
  [/^willowisp/, 'willowisp'],
  [/^batdemon/, 'bat_demon'],
  [/^putriddefiler/, 'putrid_defiler'],
  [/^fetishblow/, 'fetish_blow'],
  [/^fetishshaman/, 'fetish_shaman'],
  [/^bonefetish/, 'bone_fetish'],
  [/^fetish/, 'fetish'],
  [/^scarab/, 'scarab'],
  [/^mummy/, 'mummy'],
  [/^unraveler/, 'unraveler'],
  [/^cantor/, 'cantor'],
  [/^vilemother/, 'vile_mother'],
  [/^regurgitator/, 'regurgitator'],
  [/^vampire/, 'ghoul_lord'],
  [/^dkmag/, 'oblivion_knight'],
  [/^doomknight/, 'oblivion_knight'],
  [/^fingermage/, 'storm_caster'],
  [/^megademon/, 'venom_lord'],
  [/^sandmaggot/, 'sand_maggot'],
  [/^baboon/, 'baboon'],
  [/^arach/, 'arach'],
  [/^pantherwoman/, 'panther_woman'],
  [/^zealot/, 'zealot'],
  [/^zombie/, 'zombie'],
  [/^brute/, 'brute'],
  [/^swarm/, 'locust'],
  [/^frogdemon/, 'frog_demon'],
  [/^mosquito/, 'mosquito'],
  [/^goatman/, 'goatman'],
  [/^hellbovine/, 'hell_bovine'],
];
const ours = (d2: string): string | null => MAP.find(([re]) => re.test(d2))?.[1] ?? null;
const levels: Record<number, string> = {
  110: 'a5_foothills',
  111: 'a5_highlands',
  112: 'a5_plateau',
  113: 'a5_crystal1',
  114: 'a5_river',
  115: 'a5_crystal2',
  116: 'a5_echo',
  117: 'a5_tundra',
  118: 'a5_glacial1',
  119: 'a5_glacial2',
  122: 'a5_anguish',
  123: 'a5_death',
  125: 'a5_abaddon',
  126: 'a5_acheron',
  127: 'a5_infernal',
  128: 'a5_keep1',
  129: 'a5_keep2',
  130: 'a5_keep3',
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
  const un = [`[${num(r.MonUMin)}, ${num(r.MonUMax)}]`, `[${num(r['MonUMin(N)'])}, ${num(r['MonUMax(N)'])}]`, `[${num(r['MonUMin(H)'])}, ${num(r['MonUMax(H)'])}]`];
  out.push(
    `  ${key}: { name: '${String(r.LevelName).replace(/'/g, "\\'")}', den: ${num(r['MonDen']) || (id === 110 ? 450 : 0)}, lvl: [${num(r.MonLvl1Ex)}, ${num(r.MonLvl2Ex)}, ${num(r.MonLvl3Ex)}], unique: [${un.join(', ')}], mons: [${mix('mon')}, ${mix('nmon')}, ${mix('nmon')}] },`,
  );
}
writeFileSync(
  `${OUT}/levels-a5.ts`,
  `${D2_HEADER}/** Zones de l'Acte V d'après Levels.txt (patch 1.13) : monstres [Normal, Cauchemar, Enfer], densité, niveaux, uniques. Généré par tools/audit/gen-levels-a5.ts. Niveaux Project Diablo 2 : patch du mod (mods/pd2/data/levels.patch.ts). */
export interface A5Level {
  name: string;
  den: number;
  lvl: [number, number, number];
  unique: [[number, number], [number, number], [number, number]];
  mons: [[string, number][], [string, number][], [string, number][]];
}

export const A5_LEVELS: Record<string, A5Level> = {
${out.join('\n')}
};
`,
);
const sup: string[] = [];
for (const r of rows('superuniques')) {
  const name = String(r.Superunique);
  const cls = String(r.Class ?? '').toLowerCase();
  const m = ours(cls);
  if (!name || !m) continue;
  sup.push(`  '${name.toLowerCase().replace(/'/g, "\\'")}': ['${m}', '${name.replace(/'/g, "\\'")}'],`);
}
writeFileSync(
  `${OUT}/superuniques.ts`,
  `${D2_HEADER}/** Super-uniques de SuperUniques.txt rapportés à nos monstres (classe de monstats) : nom de preset en minuscules → [monstre du jeu, nom affiché]. Généré par tools/audit/gen-levels-a5.ts. */
export const SUPER_UNIQUES: Record<string, [string, string]> = {
${sup.join('\n')}
};
`,
);
console.log(out.length, 'zones,', sup.length, 'super-uniques');
