/** Audit 4 : monstres (résistances, niveaux de boss) et zones vs monstats.txt / levels.txt. Usage : npx tsx tools/audit/monsters.ts */
import '../mods/auto';
import { rows, num, d2 } from './common';
import { MONSTERS } from '../../src/data/monsters';
import { MONSTER_FIDELITY } from '../../src/data/monsters-fidelity';

/** id de chez nous -> Id monstats.txt (variante principale) */
const MAP: Record<string, string> = {
  fallen: 'fallen1',
  fallen_shaman: 'fallenshaman1',
  zombie: 'zombie1',
  skeleton: 'skeleton1',
  skeleton_archer: 'sk_archer1',
  griswold: 'griswold',
  mummy: 'mummy1',
  unraveler: 'unraveler3',
  skeleton_mage: 'skmage_cold1',
  warped_shaman: 'fallenshaman5',
  burning_dead: 'skeleton4',
  storm_caster: 'fingermage3',
  council_member: 'councilmember1',
  scarab: 'scarab3',
  duriel: 'duriel',
  ghoul: 'zombie3',
  dark_stalker: 'corruptrogue3',
  countess: 'countess',
  andariel: 'andariel',
  mephisto: 'mephisto',
  pindleskin: 'pindleskin',
  eldritch: 'eldritch',
  shenk: 'shenkboss',
  nihlathak: 'nihlathakboss',
  ancient_talic: 'ancientbarb1',
  ancient_madawc: 'ancientbarb2',
  ancient_korlic: 'ancientbarb3',
  hell_bovine: 'hellbovine',
  cow_king: 'cowking',
  minion_destruction: 'baalminion1',
  venom_lord: 'venomlord',
  oblivion_knight: 'doomknight3',
  soul_killer: 'fetish4',
  blood_lord: 'bloodlord3',
  baal: 'baalcrab',
  diablo: 'diablo',
  lilith: 'uberandariel',
  uber_izual: 'uberizual',
};
const RES: [string, string][] = [
  ['phys', 'ResDm'],
  ['magic', 'ResMa'],
  ['fire', 'ResFi'],
  ['light', 'ResLi'],
  ['cold', 'ResCo'],
  ['poison', 'ResPo'],
];
const byId = new Map(rows('monstats').map((r) => [r.Id, r]));
const sfx = ['', '(N)', '(H)'];
const out: string[] = [];
let cmpRes = 0,
  badRes = 0,
  cmpLvl = 0,
  badLvl = 0;
const noMap: string[] = [];
for (const m of MONSTERS) {
  // correspondance générée (gen-monster-fidelity.ts), sinon table historique
  const id = MONSTER_FIDELITY[m.id]?.d2 ?? MAP[m.id];
  const d = id ? byId.get(id) : undefined;
  if (!d) {
    noMap.push(`${m.id}${id ? ` (monstats ${id} introuvable)` : ''}`);
    continue;
  }
  for (const [k, col] of RES) {
    const o = (m.res as any)[k] as number[] | undefined;
    const base = (m.resVariants ?? []).length ? ' (variantes)' : '';
    for (let i = 0; i < 3; i++) {
      const dv = num(d[col + sfx[i]]);
      const ov = o ? o[i] : 0;
      cmpRes++;
      if (Math.min(100, ov) !== Math.min(100, dv)) {
        badRes++;
        out.push(`RES ${m.id}/${id} ${k} [${['N', 'C', 'E'][i]}] nous=${ov} D2=${dv}${base}`);
      }
    }
  }
  if (m.bossLevel) {
    for (let i = 0; i < 3; i++) {
      const dv = num(d['Level' + sfx[i]]);
      cmpLvl++;
      if (m.bossLevel[i] !== dv) {
        badLvl++;
        out.push(`LVL ${m.id}/${id} [${['N', 'C', 'E'][i]}] nous=${m.bossLevel[i]} D2=${dv}`);
      }
    }
  }
}
console.log(`## Monstres : ${MONSTERS.length} chez nous ; ${MONSTERS.length - noMap.length} appariés à monstats.txt (${noMap.length} sans équivalent : ${noMap.join(', ')})`);
console.log(`Résistances comparées : ${cmpRes}, écarts : ${badRes} ; niveaux de boss comparés : ${cmpLvl}, écarts : ${badLvl}`);
console.log(out.join('\n'));
console.log(
  '\n## monstats D2 : monstres actifs par acte non représentés (nombre de familles) : ' +
    new Set(
      rows('monstats')
        .filter((r) => r.enabled === '1' && r.Level && !r.npc)
        .map((r) => r.MonType || r.Id),
    ).size +
    ' familles D2 / ' +
    MONSTERS.length +
    ' nôtres',
);

console.log('\n## levels.txt vs nos runs (niveau des monstres par difficulté ; MonLvlNEx = tables 1.10+)');
import { RUNS } from '../../src/data/runs';
/** run -> Id levels.txt de la zone de référence (boss / zone la plus profonde) */
const RUN_LEVEL: Record<string, number> = {
  tristram: 38,
  tombs: 66,
  countess: 25,
  andariel: 37,
  mephisto: 102,
  cows: 39,
  chaos: 108,
  pindleskin: 121,
  eldritch: 111,
  nihlathak: 124,
  ancients: 120,
  baal: 131,
};
const lv = new Map(rows('levels').map((r) => [Number(r.Id), r]));
for (const run of RUNS) {
  const id = RUN_LEVEL[run.id];
  const r = id !== undefined ? lv.get(id) : undefined;
  if (!r) {
    console.log(`  ${run.id}: nous=${run.zoneLevel.join('/')} (pas d'équivalent levels.txt)`);
    continue;
  }
  const d = [num(r.MonLvl1Ex), num(r.MonLvl2Ex), num(r.MonLvl3Ex)];
  const same = d.every((v, i) => v === run.zoneLevel[i]);
  console.log(`  ${run.id}: nous=${run.zoneLevel.join('/')} D2(${r.LevelName})=${d.join('/')} ${same ? 'conforme' : 'ECART'}`);
}
void d2;
