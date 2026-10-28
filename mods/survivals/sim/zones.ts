/**
 * Zones of the rounds: monster levels and pools by difficulty, read from Levels.txt (`levels` registry; Act IV's zones are the mode's own
 * entries `survivals:<zone>`, data/act4.ts, lot 283) and, for the lairs of the act bosses (Tal Rasha's Tomb, the Throne of Destruction),
 * from the base's level plans and runs of the same places.
 */
import { LEVEL_PLANS, MONSTER_BY_ID, REGISTRIES } from '../../../src/mods/sdk';
import { ACT4_PREFIX } from '../data/act4';
import type { RoundDef } from '../data/chapters';

/** Levels.txt entry of a zone: the base's registry, else the mode's (Act IV) */
const levelOf = (zone: string) => REGISTRIES.levels.get(zone) ?? REGISTRIES.levels.get(`${ACT4_PREFIX}${zone}`);

/** Monster levels of a zone by difficulty: Levels.txt (`levels` registry, Act IV included), else the base's run of that zone (the lairs) */
export function zoneLevels(zone: string): [number, number, number] | undefined {
  const lv = levelOf(zone);
  if (lv) return [lv.lvl[0], lv.lvl[1], lv.lvl[2]];
  const run = REGISTRIES.runs.get(zone);
  return run ? [run.zoneLevel[0], run.zoneLevel[1], run.zoneLevel[2]] : undefined;
}

/** Monster levels of a round by difficulty: its lair's for a boss round, else its first zone's (Levels.txt) */
export function roundLevels(r: RoundDef): [number, number, number] {
  if (r.boss) return r.boss.level;
  return zoneLevels(r.zones[0]) ?? [1, 36, 67];
}

/** Weighted pool of a zone at a difficulty (Levels.txt, else the base's level plan), monsters known to the game only */
export function zonePool(zone: string, diff: number): [string, number][] {
  const lv = levelOf(zone);
  const mons = lv ? lv.mons[diff] : LEVEL_PLANS[zone]?.mons[diff];
  return (mons ?? []).filter(([id]) => !!MONSTER_BY_ID[id]);
}
