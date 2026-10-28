/** Audit 7 : formules et constantes (classes, FCR/FHR, pénalités de résistance, XP) vs charstats/difficultylevels/experience. Usage : npx tsx tools/audit/formulas.ts */
import '../mods/auto';
import { rows, num } from './common';
import { CLASSES } from '../../src/data/classes';
import { RES_PENALTY } from '../../src/data/curves';
import { XP_TABLE, expRatio } from '../../src/data/xp';
import { attackFrames } from '../../src/sim/breakpoints';
import { animA } from '../../src/data/attack-anim';
import type { ClassId } from '../../src/data/classes';

console.log('## Classes (charstats.txt ; vie/mana en quarts de point dans D2)');
const cs = new Map(rows('charstats').map((r) => [r.class.toLowerCase(), r]));
for (const c of Object.values(CLASSES)) {
  const d = cs.get(c.id === 'sorceress' ? 'sorceress' : c.id)!;
  const diffs: string[] = [];
  const cmp = (n: string, a: number, b: number) => {
    if (a !== b) diffs.push(`${n} nous=${a} D2=${b}`);
  };
  cmp('str', c.base.str, num(d.str));
  cmp('dex', c.base.dex, num(d.dex));
  cmp('vit', c.base.vit, num(d.vit));
  cmp('ene', c.base.ene, num(d.int));
  cmp('lifePerLevel', c.lifePerLevel, num(d.LifePerLevel) / 4);
  cmp('manaPerLevel', c.manaPerLevel, num(d.ManaPerLevel) / 4);
  cmp('lifePerVit', c.lifePerVit, num(d.LifePerVitality) / 4);
  cmp('manaPerEne', c.manaPerEne, num(d.ManaPerMagic) / 4);
  console.log(`- ${c.id}: ${diffs.length ? diffs.join('; ') : 'conforme'}  (vie départ nous=${c.life} ; D2 hpadd=${d.hpadd})`);
}

console.log('\n## Paliers FCR/FHR : reconstruction par la formule D2');
console.log('frames = ceil(256*B / floor(256*(100+Eff)/100)) - 1, Eff = floor(120*x/(120+x)) ; on cherche le B (images de départ) qui reproduit le tableau entier.');
const eff = (x: number) => Math.floor((120 * x) / (120 + x));
function findB(tbl: [number, number][]): number | null {
  for (let B = 6; B <= 60; B++) {
    const fr = (x: number) => Math.ceil((256 * B) / Math.floor((256 * (100 + eff(x))) / 100)) - 1;
    if (tbl.every(([bp, f]) => fr(bp) === f && (bp === 0 || fr(bp - 1) === f + 1))) return B;
  }
  return null;
}
for (const c of Object.values(CLASSES)) {
  const bF = findB(c.fcr),
    bH = findB(c.fhr);
  console.log(
    `- ${c.id}: FCR ${bF ? `reproduit par la formule (B=${bF})` : "non reproduit par la formule simple (vitesse d'animation ≠ 256 ?)"} ; FHR ${bH ? `reproduit (B=${bH})` : 'non reproduit par la formule simple (à comparer à animdata/tables publiées)'}`,
  );
}
console.log('  charstats #spell/#gethit (images de base D2) :', [...cs.values()].map((r) => `${r.class}: cast ${r['#spell']}, gethit ${r['#gethit']}`).join(' | '));
const sw = (cls: ClassId, ias: number) => attackFrames(ias, cls, [{ A: animA(cls, 'swing1'), wsm: 0 }]);
console.log(
  `  Attaque (formule D2 : WSM + IAS effectif 120*x/(120+x), A par classe/arme dans data/attack-anim.ts) : 1 main WSM 0, IAS 0/30/60/150 : sorcière ${[0, 30, 60, 150].map((x) => sw('sorceress', x)).join('/')} ; barbare ${[0, 30, 60, 150].map((x) => sw('barbarian', x)).join('/')} ; amazone ${[0, 30, 60, 150].map((x) => sw('amazon', x)).join('/')}. Ancienne approximation : ${[0, 30, 60, 150].map((x) => Math.max(6, 16 - Math.floor(x / 15))).join('/')}.`,
);

console.log('\n## Difficulté (difficultylevels.txt)');
const dl = rows('difficultylevels');
dl.forEach((r, i) =>
  console.log(
    `- ${r.Name}: ResistPenalty nous=${RES_PENALTY[i as 0 | 1 | 2]} D2=${r.ResistPenalty} ${RES_PENALTY[i as 0 | 1 | 2] === num(r.ResistPenalty) ? 'conforme' : 'ECART'} ; DeathExpPenalty D2=${r.DeathExpPenalty} ; MonsterSkillBonus=${r.MonsterSkillBonus} ; LifeStealDivisor=${r.LifeStealDivisor} ; ManaStealDivisor=${r.ManaStealDivisor} ; MonsterFreezeDivisor=${r.MonsterFreezeDivisor} ; MonsterColdDivisor=${r.MonsterColdDivisor} ; UniqueDamageBonus=${r.UniqueDamageBonus} ; ChampionDamageBonus=${r.ChampionDamageBonus}`,
  ),
);

console.log('\n## XP (experience.txt)');
const ex = rows('experience').filter((r) => /^\d+$/.test(r.Level));
let bad = 0;
for (const r of ex) {
  const L = num(r.Level);
  if (L < 1) continue;
  if (XP_TABLE[L] !== num(r.Sorceress)) {
    bad++;
    console.log(`  niveau ${L}: nous=${XP_TABLE[L]} D2=${r.Sorceress}`);
  }
}
console.log(`  table XP : ${bad} écarts sur ${ex.length - 1} niveaux`);
let badR = 0;
for (const r of ex) {
  const L = num(r.Level);
  if (L >= 1 && Math.abs(expRatio(L) - num(r.ExpRatio) / 1024) > 1e-9) {
    badR++;
    console.log(`  ExpRatio niveau ${L}: nous=${Math.round(expRatio(L) * 1024)} D2=${r.ExpRatio}`);
  }
}
console.log(`  ExpRatio : ${badR} écarts`);
