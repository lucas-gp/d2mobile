/**
 * The rounds as runs of the `runs` registry (`survivals:<round>`): hidden from the base's waypoint lists (the mode has its own section),
 * returning to the act's town (`campaign`: the Rogue Encampment, Lut Gholein, the Kurast Docks, the Pandemonium Fortress, Harrogath),
 * with the arena as zone, the director, the zone's monster levels (Levels.txt) and the D2 quest reward of the zone at the first clear (Den
 * of Evil, Radament, Izual: skill points; Lam Esen: stat points; Anya: resistances; the act's boss: its own, `rewardAs`). A Campaign
 * round in progress is resumed when the app is opened again (`resumeOnLoad`, the director's state in the save); a Run never is (lot 298:
 * a new run from its first zone, `abandonInterrupted`).
 */
import type { ModApi } from '../../../src/mods/api';
import { REGISTRIES, type RunDef, type World, type ZoneDef } from '../../../src/mods/sdk';
import { ROUNDS, runIdOf, type RoundDef } from '../data/chapters';
import { boxOf, buildArena, type ArenaBox } from './arena';
import { deathsIn, markCheckpoint, noteAttempt, noteDeath, takeAbandoned } from './checkpoints';
import { Director, pressureOf, roundSpecies } from './director';
import { attackElements } from './immunity';
import { currentGame, setting } from './state';
import { adaptiveCap, loadLevel } from './adaptive';
import { roundLevels, zonePool } from './zones';
import { actFlow, runZones, FLOW, flowActive, isRunMode, noteZoneCleared, RUN, runMercy, runPressure } from './runmode';

export { roundLevels };

/** Key of the zone for the rune treasure class and the sound mood: the base's run of the same place (Diablo II's loot unchanged) */
export function roundZoneKey(r: RoundDef): string {
  const base = REGISTRIES.runs.get(r.rewardAs ?? r.zones[0])?.zoneKey;
  if (base) return base;
  return r.boss || /jail|cata|cathedral|den|crypt/.test(r.zones[0]) ? 'andariel' : 'tristram';
}

/** Playable rectangle of a zone without a recorded one: the whole zone less a 3-unit border */
function fallbackBox(z: ZoneDef): ArenaBox {
  return { x0: 3, y0: 3, x1: z.width - 3, y1: z.height - 3 };
}

/** Live monster cap of the mode (setting `density` of the game being played; 90 without one) */
function cap(): number {
  const g = currentGame();
  return g ? Number(setting(g, 'density')) : 90;
}

export function roundRun(r: RoundDef): RunDef {
  return {
    id: runIdOf(r),
    name: r.name,
    zoneKey: roundZoneKey(r),
    desc: `Survivals, acte ${r.act} : ${r.name}.`,
    zoneLevel: roundLevels(r),
    recLevel: r.recLevel,
    focus: 'both',
    boss: r.boss?.monster ?? '',
    // lot 300: the species the director may bring (`monsterPool`) known with the zone, before its first step: the app prepares their
    // sheets as it loads the zone, and the next zone's while the current one is played (rule `game.nextZone`)
    build: (seed, d) => {
      const zone = buildArena(r, seed).zone;
      zone.monsterPool = roundSpecies(
        r.zones.flatMap((z) => zonePool(z, d)),
        r,
      );
      return zone;
    },
    botSkip: true,
    hidden: true,
    // a death loses the round, never the level, the gear or the checkpoints: it starts again from the waypoint
    abandonOnDeath: true,
    // closing the app in the middle of a Campaign round never loses it; a Run always starts again from its first zone (lot 298, owner)
    resumeOnLoad: (c) => !isRunMode(c),
    // Run mode (lot 289): leaving a zone ends the run (no portal back)
    abandonOnLeave: (c) => isRunMode(c),
    campaign: `act${r.act}`,
    ...(r.rewardAs ? { rewardAs: r.rewardAs } : {}),
    firstClear: { ...(r.firstClear ?? {}) },
    director: (w: World, run) => {
      const box = boxOf(w.zone) ?? fallbackBox(w.zone);
      const liveCap = () => {
        const g = currentGame();
        return adaptiveCap(cap(), loadLevel(!!g && setting(g, 'adaptive') === 'on'));
      };
      const elements = attackElements(w.character);
      // Run mode (lot 289): no mercy from deaths (a death ends the run), the run's pace and pressure, the zone's end tells the next one
      if (isRunMode(w.character))
        return new Director(
          w,
          run,
          r,
          box,
          {
            cap: cap(),
            liveCap,
            pressure: runPressure(w.character.level, r.recLevel[w.difficulty]),
            deaths: 0,
            elements,
            pace: RUN.pace,
            mercy: runMercy(r.act, w.difficulty, r.id),
            // lot 292c: Act I's flow kills four to five monsters a second, its life a kill smaller
            heal: flowActive(r.act, w.difficulty) ? FLOW.heal : RUN.heal,
            regen: flowActive(r.act, w.difficulty) ? FLOW.regen : RUN.regen,
            rangedCap: RUN.rangedCap,
            xp: flowActive(r.act, w.difficulty) ? FLOW.xp : RUN.xp,
            extraElites: RUN.extraElites,
            // Act I in Normal: one timed flow (lot 291)
            flow: actFlow(r.act, w.difficulty, runZones(r.act, w.difficulty).indexOf(r), !!r.boss),
            deathText: 'Run terminée : le héros est tombé.',
            // lot 307: chests, shrines and events in the arena (sim/poi.ts)
            pois: true,
          },
          (ww) => {
            markCheckpoint(ww.character, ww.difficulty, r.id);
            noteZoneCleared(ww.character, r);
            ww.events.push({ t: 'message', text: r.boss ? `Acte vaincu : ${r.name}` : `Zone terminée : ${r.name}`, color: '#e8b04a' });
          },
        );
      return new Director(
        w,
        run,
        r,
        box,
        {
          cap: cap(),
          liveCap,
          pressure: pressureOf(w.character.level, r.recLevel[w.difficulty], deathsIn(w.character, w.difficulty, r.id)),
          deaths: deathsIn(w.character, w.difficulty, r.id),
          elements,
        },
        (ww) => {
          if (markCheckpoint(ww.character, ww.difficulty, r.id)) ww.events.push({ t: 'message', text: `Point de reprise : ${r.name}`, color: '#e8b04a' });
        },
        (ww) => noteDeath(ww.character, ww.difficulty, r.id),
        (ww, sec, fresh) => {
          if (!fresh) return noteAttempt(ww.character, ww.difficulty, r.id, sec);
          // the previous attempt was left: a round lost, the round eased as after a death
          const left = takeAbandoned(ww.character, ww.difficulty, r.id);
          noteAttempt(ww.character, ww.difficulty, r.id, sec);
          if (!left) return;
          const deaths = deathsIn(ww.character, ww.difficulty, r.id);
          return { deaths, pressure: pressureOf(ww.character.level, r.recLevel[ww.difficulty], deaths) };
        },
      );
    },
  };
}

export function registerRounds(api: ModApi): void {
  for (const r of ROUNDS) api.runs.add(roundRun(r));
}
