/**
 * Bots : 18 builds × 15 runs (de Tristram en Normal à Baal en Enfer), personnage de référence à graine fixe, 50 s de jeu par run ;
 * rapport de run et état du monde (joueur, monstres, projectiles, zones d'effet, objets) haché à chaque tick, événements compris.
 * `FP_BOTS=cold,fire` restreint aux builds cités (diagnostic). La plus longue section (≈ 3 min 30).
 */
import { createHash } from 'node:crypto';
import { BotBrain, BUILD_CLASS, type BuildId } from '../../../src/sim/bot/brain';
import { referenceCharacter } from '../../../src/sim/bot/arena';
import { playRun } from '../../../src/sim/bot/runner';
import { ser, sha1, type SectionResult } from '../lib';
import type { Game } from '../../../src/sim/game';

const PLAN: [string, 0 | 1 | 2, number][] = [
  ['tristram', 0, 20],
  ['tombs', 1, 50],
  ['countess', 1, 55],
  ['a4_plains', 2, 80],
  ['cows', 2, 85],
  ['pindleskin', 2, 88],
  ['chaos', 2, 90],
  ['andariel', 1, 60],
  ['river', 1, 62],
  ['mephisto', 2, 85],
  ['nihlathak', 2, 86],
  ['eldritch', 2, 84],
  ['a4_chaos', 2, 90],
  ['ancients', 2, 92],
  ['baal', 2, 95],
];

function snap(g: Game): string {
  const w = g.world;
  return ser({ t: w.tick, p: w.player, m: w.monsters, mi: w.missiles, a: w.areas, it: w.items.length, ob: w.objects }, 4);
}

export async function run(): Promise<SectionResult> {
  const out: SectionResult = {};
  const only = process.env.FP_BOTS?.split(',');
  for (const build of Object.keys(BUILD_CLASS) as BuildId[]) {
    if (only && !only.includes(build)) continue;
    for (const [runId, diff, level] of PLAN) {
      const g = referenceCharacter(level, build, 3);
      const brain = new BotBrain(g, { build, seed: 5 });
      brain.town();
      const h = createHash('sha1');
      let n = 0;
      const off = g.onEvent((e) => h.update('E' + ser(e, 3)));
      const rep = playRun(g, brain, runId, diff, {
        maxSeconds: 50,
        onTick: (gg) => {
          n++;
          h.update(snap(gg));
        },
      });
      off();
      out[`${build}/${runId}/${diff}`] = `${sha1(JSON.stringify(rep)).slice(0, 16)}:${h.digest('hex')}:${n}`;
    }
  }
  return out;
}
