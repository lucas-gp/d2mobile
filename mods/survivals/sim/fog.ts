/**
 * Fog of war of an arena (lot 307, owner: "maps not revealed by default, discovered by moving"): the arena cut in cells of `FOG.cell`
 * units, a cell explored once the hero has come within `FOG.reveal` units of it (about what the screen shows around him), kept for the
 * zone's whole life (a world is a zone). The automap draws only the explored cells (ui/automap.ts), as Diablo II's.
 */
import { Fog, type World } from '../../../src/mods/sdk';
import type { ArenaBox } from './arena';

// lot 321: the cells' class moved to the base (src/sim/fog.ts), shared with the Campaign's automap
export { Fog };

export const FOG = {
  /** Side of a cell (units; the base's `Fog` cell) */
  cell: 2,
  /** Units around the hero explored (as `POI.find`) */
  reveal: 14,
  /** Ticks between two reveals (5: five a second) */
  every: 5,
};

const FOGS = new WeakMap<World, Fog>();

/** The fog of a world's arena, made at its first call (`box`: the arena's playable rectangle) */
export function fogOf(w: World, box: ArenaBox): Fog {
  let f = FOGS.get(w);
  if (!f) FOGS.set(w, (f = new Fog(box, FOG.cell)));
  return f;
}

/** The fog of a world if it has one (the automap; none outside a round) */
export function fogIf(w: World): Fog | undefined {
  return FOGS.get(w);
}

/** Every `FOG.every` ticks: the cells around the hero explored */
export function exploreStep(w: World, box: ArenaBox): void {
  if (w.tick % FOG.every !== 0 && FOGS.has(w)) return;
  fogOf(w, box).reveal(w.player.x, w.player.y, FOG.reveal);
}
