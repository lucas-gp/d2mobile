/**
 * What the Run's act screen tells of an act (lot 306, ui/acts.ts), read from the mode's own data, never written by hand: its zones
 * (`runZones`), the monsters of their pools (Levels.txt, `zonePool`), its timed bosses on the act's clock (Act I's flow: `actFlow`'s
 * mini-boss times and the lair's `bossAt`, `clockGap` between zones; the other acts: their zones' bosses in order, untimed), what the
 * player has done there (checkpoints, records) and what its bosses drop.
 */
import { MONSTER_BY_ID, type CharacterState } from '../../../src/mods/sdk';
import type { RoundDef } from '../data/chapters';
import { questTcId } from '../data/loot';
import { checkpointDone } from './checkpoints';
import { eliteSpec, minibossesOf } from './director';
import { actBeaten, actFlow, flowActive, recKey, runZones } from './runmode';
import { zonePool } from './zones';

/** A timed boss of an act: its act second (null: untimed, a Campaign round), its name, the act's boss */
export interface TimedBoss {
  at: number | null;
  name: string;
  zone: string;
  final: boolean;
}

/** A monster's name shown (the boss's title after its comma dropped: "Andariel") */
const shortName = (id: string): string => (MONSTER_BY_ID[id]?.name ?? id).split(',')[0].trim();

/** Names of a round's mini-boss(es) (super-uniques: their own names; a boss species: its name) */
function miniNames(r: RoundDef): string[] {
  return minibossesOf(r)
    .map((e) => {
      const s = eliteSpec(e);
      return s ? (s.name ?? s.uniqueName ?? shortName(s.monster)) : '';
    })
    .filter(Boolean);
}

/** The act's bosses in order: each zone's mini-boss(es), then the act's boss; with their act second in a timed act (Act I's flow) */
export function actBosses(act: number, d: number): TimedBoss[] {
  const zones = runZones(act, d);
  const out: TimedBoss[] = [];
  zones.forEach((r, i) => {
    const flow = actFlow(act, d, i, !!r.boss);
    if (r.boss) {
      // a boss round before the last (Act V's Ancients): its bosses together, the act's boss being the last zone's
      const final = i === zones.length - 1;
      for (const id of [r.boss.monster, ...(r.boss.with ?? [])]) out.push({ at: flow ? flow.actSec0 + flow.bossAt : null, name: shortName(id), zone: r.name, final: final && id === r.boss.monster });
      return;
    }
    for (const name of miniNames(r)) out.push({ at: flow ? flow.actSec0 + flow.events.miniboss : null, name, zone: r.name, final: false });
  });
  return out;
}

/** The act's boss (its last zone's) */
export function actBoss(act: number, d: number): TimedBoss | undefined {
  return actBosses(act, d).find((b) => b.final);
}

/** Species of the act's zones (their pools, Levels.txt), names in order of first meeting, without the bosses' kinds */
export function actRoster(act: number, d: number): string[] {
  const names = new Set<string>();
  for (const r of runZones(act, d)) for (const z of r.zones) for (const [id] of zonePool(z, d)) if (!MONSTER_BY_ID[id]?.boss) names.add(shortName(id));
  return [...names];
}

/** One zone of an act on the screen: its name, cleared (its checkpoint in that difficulty) */
export function actZones(c: CharacterState, act: number, d: number): { id: string; name: string; done: boolean }[] {
  return runZones(act, d).map((r) => ({ id: r.id, name: r.name, done: checkpointDone(c, d, r.id) }));
}

/** The act's records in the save (none before a first run) */
export function actRecords(c: CharacterState, act: number, d: number): { runs: number; wins: number; best?: number; surv?: number; deep: number } {
  const m = c.progression.milestones;
  return {
    runs: m[recKey(d, act, 'runs')] ?? 0,
    wins: m[recKey(d, act, 'wins')] ?? 0,
    ...(m[recKey(d, act, 'best')] !== undefined ? { best: m[recKey(d, act, 'best')] } : {}),
    ...(m[recKey(d, act, 'surv')] !== undefined ? { surv: m[recKey(d, act, 'surv')] } : {}),
    deep: m[recKey(d, act, 'deep')] ?? 0,
  };
}

/** Is the act played as a timed run (Act I's flow), or with the Campaign's zones, not tuned for the Run yet */
export const actTimed = (act: number, d: number): boolean => flowActive(act, d);

/** The act's boss drops its quest treasure class at its first kill in the difficulty (data/loot.ts), beaten or not yet */
export function actLoot(c: CharacterState, act: number, d: number): { quest: boolean; claimed: boolean } {
  const last = runZones(act, d).at(-1);
  const boss = last?.boss?.monster;
  return { quest: !!boss && !!questTcId(boss, d), claimed: actBeaten(c, act, d) };
}
