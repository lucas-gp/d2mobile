/**
 * U-turns of the monsters chasing the hero (lot 301, owner: "they come at the hero then turn back, it is strange"), measured for
 * `tools/turns.ts` and the unit test: each monster's heading (`facing`, the way it walks) against the bearing to its target, tick by tick
 */
import { TICK_HZ, type Game } from '../../../src/mods/sdk';

export interface TurnRow {
  seconds: number;
  /** Monsters followed (alive, hostile, walking at least once) */
  monsters: number;
  /** U-turns a monster a minute, without reason (not fleeing, not a shooter, the same target) */
  perMinute: number;
  /** U-turns by cause */
  causes: Record<string, number>;
  /** Share of the monsters' walking ticks spent moving less than 10 % of their speed (stuck in a crowd) */
  stuck: number;
}

/** Plays `seconds` (god mode, the joystick on a slow circle) and counts the U-turns */
export function countTurns(g: Game, seconds: number): TurnRow {
  const st = new Map<number, { toward: number; tgt: number; aggro: boolean }>();
  const causes: Record<string, number> = {};
  const seen = new Set<number>();
  const trail = new Map<number, [number, number][]>();
  let walkTicks = 0;
  let stuckTicks = 0;
  for (let t = 0; t < seconds * TICK_HZ; t++) {
    const w = g.world;
    w.godMode = true;
    const still = process.env.SV_STILL === '1';
    w.input.moveX = still ? 0 : Math.cos(t / 60);
    w.input.moveY = still ? 0 : Math.sin(t / 60);
    const before = new Map(w.monsters.map((m) => [m.id, { x: m.x, y: m.y }]));
    g.step(1);
    // the way each monster went over the last 5 ticks (its displacement: separation and walls included), when it moved
    for (const m of w.monsters) {
      const h = (trail.get(m.id) ?? []).concat([[m.x, m.y]]).slice(-6);
      trail.set(m.id, h);
    }
    if (g.world !== w) {
      st.clear();
      continue;
    }
    for (const m of w.monsters) {
      if (m.dead || m.team !== 1 || m.pet || m.isSummon) continue;
      const h = trail.get(m.id)!;
      if (h.length < 6) continue;
      const vx = h[5][0] - h[0][0];
      const vy = h[5][1] - h[0][1];
      if (Math.hypot(vx, vy) < (m.speed * 5 * 0.3) / TICK_HZ) continue;
      // brought back ahead of the hero (the director's `recycle`) or teleported: not a walk
      if (h.some((q, i) => i > 0 && Math.hypot(q[0] - h[i - 1][0], q[1] - h[i - 1][1]) > 1)) {
        st.delete(m.id);
        continue;
      }
      const heading = Math.atan2(vy, vx);
      const tgt = m.tgt ? w.pets.find((x) => x.id === m.tgt) : undefined;
      const tx = tgt && !tgt.dead ? tgt.x : w.player.x;
      const ty = tgt && !tgt.dead ? tgt.y : w.player.y;
      const b = Math.atan2(ty - m.y, tx - m.x);
      let diff = Math.abs(((heading - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      diff = (diff * 180) / Math.PI;
      const prev = before.get(m.id);
      if (prev && m.aggro && !(m.def.keepDistance ?? 0)) {
        walkTicks++;
        if (Math.hypot(m.x - prev.x, m.y - prev.y) < (m.speed * 0.1) / TICK_HZ) stuckTicks++;
      }
      seen.add(m.id);
      const s = st.get(m.id);
      if (diff < 60) st.set(m.id, { toward: w.tick, tgt: m.tgt ?? 0, aggro: m.aggro });
      else if (diff > 120 && s && w.tick - s.toward <= TICK_HZ) {
        const cause =
          m.fleeUntil !== undefined && m.fleeUntil > w.tick
            ? 'flee'
            : m.def.coward
              ? 'coward'
              : (m.def.keepDistance ?? 0) > 0
                ? 'shooter'
                : (m.tgt ?? 0) !== s.tgt && !!(s.tgt ? w.pets.find((x) => x.id === s.tgt && !x.dead) : !w.player.dead)
                  ? 'target'
                  : !m.aggro || !s.aggro
                    ? 'calm'
                    : 'other';
        causes[cause] = (causes[cause] ?? 0) + 1;
        if (process.env.SV_TURNS_LOG && cause === 'other')
          console.log(
            JSON.stringify({
              t: w.tick,
              id: m.def.id,
              rank: m.rank,
              d: +Math.hypot(tx - m.x, ty - m.y).toFixed(1),
              mode: m.mode,
              facing: +((((m.facing - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 57.3).toFixed(0),
              heading: +diff.toFixed(0),
              atk: m.atk,
              curses: JSON.stringify((m as never as { curses?: unknown }).curses ?? null),
              blind: m.blindUntil,
              line: w.grid.walkLine(m.x, m.y, tx, ty, 0.3),
            }),
          );
        st.delete(m.id);
      }
    }
  }
  const bad = Object.entries(causes)
    .filter(([k]) => k !== 'flee' && k !== 'shooter' && k !== 'coward')
    .reduce((a, [, n]) => a + n, 0);
  return {
    seconds,
    monsters: seen.size,
    perMinute: +((bad / Math.max(1, seen.size)) * (60 / seconds)).toFixed(3),
    causes,
    stuck: +(stuckTicks / Math.max(1, walkTicks)).toFixed(3),
  };
}
