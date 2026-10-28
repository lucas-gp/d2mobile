/**
 * A Run character's card on the selection screen (lot 299, slot `charselect.card`; owner: "the level shown is no use in Run mode, it is
 * not kept from one run to the next"): its progress instead, from the records the mode keeps (`survivals:rec:*`, `survivals:runs`). The
 * Campaign's characters (and those made before lot 289) keep the base's level and difficulty.
 */
import type { CharCardCtx } from '../../../src/mods/api';
import { ACTS, MODE_KEY, recKey, runZones } from '../sim/runmode';
import { mmss } from './hud';
import { runLabel } from './runhub';

/** The card's lines of a Run character (null: the base's "Level N Class" and difficulty) */
export function runCard(ctx: CharCardCtx): string[] | null {
  const m = ctx.milestones;
  if (m[MODE_KEY] !== 1) return null;
  const head = `${ctx.className} · Run`;
  // the farthest act played: the highest difficulty, then the highest act with a run
  let at: { act: number; d: number } | null = null;
  let runs = 0;
  let wins = 0;
  for (const d of [0, 1, 2])
    for (const act of ACTS) {
      const n = m[recKey(d, act, 'runs')] ?? 0;
      if (!n) continue;
      runs += n;
      wins += m[recKey(d, act, 'wins')] ?? 0;
      at = { act, d };
    }
  if (!at) return [head, 'Aucune run pour l’instant'];
  const deep = m[recKey(at.d, at.act, 'deep')] ?? 1;
  const zones = runZones(at.act, at.d).length;
  const best = m[recKey(at.d, at.act, 'best')];
  const surv = m[recKey(at.d, at.act, 'surv')];
  const third =
    best !== undefined
      ? `Runs ${runs} · victoires ${wins} · record ${mmss(best)}`
      : surv !== undefined
        ? `Runs ${runs} · victoires ${wins} · survie ${mmss(surv)}`
        : `Runs ${runs} · victoires ${wins}`;
  return [head, `${runLabel(at.act, at.d)} · zone ${Math.min(deep, zones)} / ${zones}`, third];
}
