/**
 * Génère src/data/monster-anim.gen.ts : durée réelle (en ticks de 25 Hz) des animations d'attaque (A1, A2) et de sort (S1..S4) de chaque monstre,
 * d'après animdata.d2 (images par direction × 256 / vitesse) et monstats.txt (Code du monstre, modes des compétences, aidel).
 * Sert à caler `frames` / `hitFrame` des attaques de monsters*.ts (voir monster-timing.ts) et d'attendu au banc tools/bench/monster-rates.ts.
 * Usage : npx tsx tools/audit/gen-monster-anim.ts
 */
import { writeFileSync } from 'node:fs';
import { d2, rows, num } from './common';
import { MONSTERS } from '../../src/data/monsters';
import { MONSTER_FIDELITY } from '../../src/data/monsters-fidelity';

const anim = d2().animdata;
const byId = new Map(rows('monstats').map((r) => [r.Id, r]));
const WC = ['HTH', 'MGK', 'FGT', 'SC', 'BOW', '1HS', '1HT', '2HS', '2HT', 'HVY', 'XBW', 'HT1', 'HT2', 'ST', 'SP', 'BL', 'CL', 'A1', 'A2'];
const out: string[] = [];
let n = 0;
for (const m of MONSTERS) {
  const id = MONSTER_FIDELITY[m.id]?.d2;
  const r = id ? byId.get(id) : undefined;
  if (!r) continue;
  const code = r.Code.toUpperCase();
  const parts: string[] = [];
  const skillModes: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const md = (r[`Sk${i}mode`] ?? '').toUpperCase();
    if (/^(A[12]|S[1-4])$/.test(md)) skillModes.push(md);
  }
  for (const mode of ['A1', 'A2', 'S1', 'S2', 'S3', 'S4']) {
    let rec;
    for (const wc of WC) {
      rec = anim.get(`${code}${mode}${wc}`);
      if (rec) break;
    }
    if (!rec) continue;
    const ticks = Math.max(1, Math.round((rec.framesPerDir * 256) / rec.speed));
    const fi = rec.flags.findIndex((f) => f === 1 || f === 4);
    const trig = fi >= 0 ? Math.max(1, Math.round(((fi + 1) * 256) / rec.speed)) : Math.round(ticks / 2);
    parts.push(`${mode.toLowerCase()}: [${ticks}, ${Math.min(trig, ticks)}]`);
  }
  if (!parts.length) continue;
  const used = [...new Set(skillModes)].join('');
  out.push(`  ${m.id}: { d2: '${id}', used: '${used}', aidel: [${num(r.aidel)}, ${num(r['aidel(N)'])}, ${num(r['aidel(H)'])}], ${parts.join(', ')} },`);
  n++;
}
writeFileSync(
  'src/data/monster-anim.gen.ts',
  `/**
 * Durées d'animation d'attaque/sort des monstres (ticks à 25 Hz : [durée, trame du coup]) d'après animdata.d2 et monstats.txt (aidel = délai d'IA N/C/E, \`used\` = modes des compétences).
 * Généré par tools/audit/gen-monster-anim.ts : ne pas modifier à la main.
 */
export interface MonsterAnimTicks {
  d2: string;
  used: string;
  aidel: [number, number, number];
  a1?: [number, number];
  a2?: [number, number];
  s1?: [number, number];
  s2?: [number, number];
  s3?: [number, number];
  s4?: [number, number];
}

export const MONSTER_ANIM: Record<string, MonsterAnimTicks> = {
${out.join('\n')}
};
`,
);
console.log(n, 'monstres');
