/** Audit 6 : compétences (niveau requis, prérequis, mana, recharge) vs skills.txt. Usage : npx tsx tools/audit/skills.ts [--all] */
import '../mods/auto';
import { rows, num, slug } from './common';
import { readFileSync } from 'node:fs';
import { SKILLS } from '../../src/data/skills';

/** Table PD2 S13 de référence du projet (tools/skilldata) : un écart D2 confirmé par elle = écart PD2 connu */
const PD2: Record<string, any> = JSON.parse(readFileSync(new URL('../skilldata/pd2-skills.json', import.meta.url), 'utf8').replace(/\bNaN\b/g, 'null'));
const tag = (id: string, field: 'reqLvl' | 'prereqs' | 'mana', ours: unknown) => {
  const p = PD2[id];
  if (!p) return '[PD2 ?]';
  const same =
    field === 'prereqs'
      ? JSON.stringify([...p.prereqs].sort()) === JSON.stringify([...(ours as string[])].sort())
      : field === 'reqLvl'
        ? p.reqLvl === ours
        : Math.abs(p.mana[0] - (ours as number[])[0]) < 0.13 && Math.abs(p.mana[1] - (ours as number[])[1]) < 0.13;
  return same ? '[écart PD2 connu]' : '[écart à vérifier : ≠ pd2-skills.json]';
};

const all = process.argv.includes('--all');
const D = new Map(
  rows('skills')
    .filter((r) => r.skill && r.charclass)
    .map((r) => [slug(r.skill), r]),
);
const cost = (r: Record<string, string>) => {
  const k = 2 ** num(r.manashift) / 256;
  return { base: num(r.mana) * k, per: num(r.lvlmana) * k };
};
let matched = 0;
const absent: string[] = [];
const lvl: string[] = [],
  mana: string[] = [],
  pre: string[] = [],
  cd: string[] = [];
let manaOk = 0,
  manaCmp = 0;
for (const s of SKILLS) {
  const r = D.get(s.id) ?? D.get(s.id.replace(/_/g, ''));
  if (!r) {
    absent.push(s.id);
    continue;
  }
  matched++;
  if (s.reqLvl !== num(r.reqlevel)) lvl.push(`${s.id}: reqLvl nous=${s.reqLvl} D2=${r.reqlevel} ${tag(s.id, 'reqLvl', s.reqLvl)}`);
  const dp = [r.reqskill1, r.reqskill2, r.reqskill3].filter(Boolean).map(slug).sort().join(',');
  const op = [...s.prereqs].sort().join(',');
  if (dp !== op) pre.push(`${s.id}: prérequis nous=[${op}] D2=[${dp}] ${tag(s.id, 'prereqs', s.prereqs)}`);
  if (!s.passive && (s.n.mana[0] || s.n.mana[1])) {
    const c = cost(r);
    manaCmp++;
    const near = (a: number, b: number) => Math.abs(a - b) < 0.13;
    // D2 : coût(l) = (mana + lvlmana*(l-1)) * 2^shift / 256, minimum minmana
    const o20 = Math.max(1, s.n.mana[0] + s.n.mana[1] * 19),
      d20 = Math.max(num(r.minmana) || 0, c.base + c.per * 19);
    if (near(Math.max(1, s.n.mana[0]), Math.max(1, c.base)) && near(o20, d20)) manaOk++;
    else mana.push(`${s.id}: mana niv.1/niv.20 nous=${Math.max(1, s.n.mana[0]).toFixed(2)}/${o20.toFixed(2)} D2=${c.base.toFixed(2)}/${d20.toFixed(2)} ${tag(s.id, 'mana', s.n.mana)}`);
  }
  const delay = num(r.delay);
  const ocd = s.n.cooldown ?? 0;
  if ((delay || ocd) && Math.abs(delay / 25 - ocd) > 0.05) cd.push(`${s.id}: recharge nous=${ocd}s D2=${(delay / 25).toFixed(2)}s (delay ${delay} images)`);
}
console.log(`## Compétences : ${SKILLS.length} chez nous ; ${matched} appariées par nom ; ${absent.length} sans équivalent skills.txt : ${absent.join(', ')}`);
const pc = (a: string[]) => (all ? a : a.slice(0, 60));
const conf = (a: string[]) =>
  `${a.filter((x) => x.includes('[écart PD2 connu]')).length} PD2 connus / ${a.filter((x) => x.includes('à vérifier')).length} à vérifier / ${a.filter((x) => x.includes('[PD2 ?]')).length} sans entrée PD2`;
console.log(`### Niveau requis : ${lvl.length} écarts (${conf(lvl)})\n  ${lvl.join('\n  ')}`);
console.log(`### Prérequis : ${pre.length} écarts (${conf(pre)})\n  ${pc(pre).join('\n  ')}`);
console.log(`### Mana : ${manaOk}/${manaCmp} conformes (tolérance 0,13) ; ${mana.length} écarts (${conf(mana)})\n  ${pc(mana).join('\n  ')}`);
console.log(`### Recharge : ${cd.length} écarts\n  ${pc(cd).join('\n  ')}`);
console.log(`D2 : ${D.size} compétences de classe/monstre dans skills.txt (hors vides)`);
