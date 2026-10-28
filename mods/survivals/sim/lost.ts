/**
 * A round lost (lot 288, after the owner's comparison with another survivors game, whose death screen names the killer and the hit): the
 * last hit the character took in the round (monster, blow or spell, damage, element) and, at its death, the round's name, the time it
 * lasted, the character's level and the monsters killed. Read by the hub until the next round starts (ui/hub.ts). Session state only
 * (`SurvivalsState`, never saved).
 */
import { MONSTER_BY_ID, type Game, type SimEvent } from '../../../src/mods/sdk';
import { roundOfRun } from '../data/chapters';
import { Director } from './director';
import { stateOf, type LostRound } from './state';
import { noteRunDeath } from './runmode';

const LISTENING = new WeakSet<Game>();

/** Listens to the game's events once (the hits taken and the death in a round) */
export function watchLosses(g: Game): void {
  if (LISTENING.has(g)) return;
  LISTENING.add(g);
  g.onEvent((e) => noteEvent(g, e));
}

/** One event of the game: a hit taken in a round is kept, a death in a round makes the lost round's record */
export function noteEvent(g: Game, e: SimEvent): void {
  const round = g.mode === 'run' ? roundOfRun(g.runDef?.id) : undefined;
  if (!round) return;
  const st = stateOf(g);
  if (e.t === 'playerHurt' && e.src) {
    const [monster, kind] = e.src.split(':');
    st.lastHurt = { monster, kind: kind ?? 'coup', amount: Math.round(e.amount), elem: e.elem, tick: g.world.tick };
    st.hurts.push({ tick: g.world.tick, amount: e.amount });
    if (st.hurts.length > 200) st.hurts.splice(0, st.hurts.length - 200);
  } else if (e.t === 'playerDeath') {
    // Run mode (lot 289): the death ends the run (its kills counted now, the run-end screen in town)
    noteRunDeath(g);
    const d = g.world.run?.director;
    const h = st.lastHurt;
    st.lastDeath = {
      round: round.id,
      name: round.name,
      sec: d instanceof Director ? Math.floor(d.sec(g.world)) : 0,
      level: g.character.level,
      kills: g.world.stats.kills,
      killer: h && g.world.tick - h.tick <= 25 * 10 ? { monster: h.monster, kind: h.kind, amount: h.amount, elem: h.elem } : null,
      burst: burstOf(st.hurts, g.world.tick),
    };
  }
}

/** Seconds of the damage told at a death (lot 291, the other game's death screen: "N damage in the last 3 s") */
export const BURST_SECONDS = 3;

/** Damage taken in the `BURST_SECONDS` before `tick` (rounded) */
export function burstOf(hurts: readonly { tick: number; amount: number }[], tick: number): number {
  let n = 0;
  for (const x of hurts) if (tick - x.tick <= BURST_SECONDS * 25 && x.tick <= tick) n += x.amount;
  return Math.round(n);
}

/** "312 · dégâts reçus en 3 s": the parts of the burst's line (none: no damage told) */
export function burstParts(burst: number | undefined): string[] {
  return burst && burst > 0 ? [String(burst), 'dégâts reçus en 3 s'] : [];
}

const ELEM: Record<string, string> = { phys: 'dégâts physiques', fire: 'dégâts de feu', cold: 'dégâts de froid', light: 'dégâts de foudre', poison: 'dégâts de poison', magic: 'dégâts magiques' };

/**
 * "Tué par · Corpsefire · 19 · dégâts physiques · (coup)": the parts of the killer's line, each translated on its own (a monster's name
 * is a text of the game's dictionaries); one part when the killer is not known
 */
export function killerParts(l: LostRound): string[] {
  const k = l.killer;
  if (!k) return ['Tué en manche'];
  return ['Tué par', MONSTER_BY_ID[k.monster]?.name ?? k.monster, String(k.amount), ELEM[k.elem] ?? 'dégâts', k.kind === 'sort' ? '(sort)' : '(coup)'];
}
