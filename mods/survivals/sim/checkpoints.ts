/**
 * Checkpoints of the mode, kept in the character's milestones (`progression.milestones`, numbers: the save format does not change): key
 * `survivals:cp:<difficulty>:<round>` = play time (seconds, at least 1) of the first kill of the round's mini-boss or boss. The rounds of
 * an act open one by one; "Resume" starts the first round not yet cleared: the last checkpoint.
 */
import type { CharacterState } from '../../../src/mods/sdk';
import { ROUNDS, type RoundDef } from '../data/chapters';

export const cpKey = (difficulty: number, round: string): string => `survivals:cp:${difficulty}:${round}`;

export function checkpointDone(c: CharacterState, difficulty: number, round: string): boolean {
  return c.progression.milestones[cpKey(difficulty, round)] !== undefined;
}

/** Records the checkpoint (first time only); true if it is new */
export function markCheckpoint(c: CharacterState, difficulty: number, round: string): boolean {
  const k = cpKey(difficulty, round);
  if (c.progression.milestones[k] !== undefined) return false;
  c.progression.milestones[k] = Math.max(1, Math.round(c.progression.playTime));
  delete c.progression.milestones[openKey(difficulty, round)];
  return true;
}

export interface RoundStatus {
  round: RoundDef;
  done: boolean;
  unlocked: boolean;
}

/** Rounds of the mode at a difficulty: cleared, open (the first, or the previous one cleared), locked */
export function roundStatus(c: CharacterState, difficulty: number): RoundStatus[] {
  return ROUNDS.map((round, i) => ({
    round,
    done: checkpointDone(c, difficulty, round.id),
    unlocked: i === 0 || checkpointDone(c, difficulty, ROUNDS[i - 1].id),
  }));
}

/** The round to resume: the first open round not cleared (the last checkpoint), or the last round when all are cleared */
export function resumeRound(c: CharacterState, difficulty: number): RoundDef {
  const st = roundStatus(c, difficulty);
  return (st.find((s) => s.unlocked && !s.done) ?? st[st.length - 1]).round;
}

/** Deaths suffered in a round not yet cleared (milestone `survivals:deaths:<difficulty>:<round>`): they ease it (`pressureOf`) */
export const deathsKey = (difficulty: number, round: string): string => `survivals:deaths:${difficulty}:${round}`;

export function deathsIn(c: CharacterState, difficulty: number, round: string): number {
  return checkpointDone(c, difficulty, round) ? 0 : (c.progression.milestones[deathsKey(difficulty, round)] ?? 0);
}

export function noteDeath(c: CharacterState, difficulty: number, round: string): void {
  delete c.progression.milestones[openKey(difficulty, round)];
  if (checkpointDone(c, difficulty, round)) return;
  const k = deathsKey(difficulty, round);
  c.progression.milestones[k] = (c.progression.milestones[k] ?? 0) + 1;
}

/**
 * Attempt in progress of a round not yet cleared (milestone `survivals:open:<difficulty>:<round>` = its seconds, written as it goes): an
 * attempt left after `ABANDON_AFTER` seconds or more without dying nor clearing the round (back to town, the app closed and the round
 * started again from the waypoint) counts as a round lost when the round is started again (`takeAbandoned`), as a death does, and eases
 * it the same way. Measured (lot 283): an Amazon of level 53 left Hell's Durance after 25 minutes 68 times (the bots' harness gives up,
 * as a player does), Mephisto and his Council at their full first-try strength each time
 */
export const ABANDON_AFTER = 300;
export const openKey = (difficulty: number, round: string): string => `survivals:open:${difficulty}:${round}`;

export function noteAttempt(c: CharacterState, difficulty: number, round: string, sec: number): void {
  if (checkpointDone(c, difficulty, round)) return;
  c.progression.milestones[openKey(difficulty, round)] = Math.max(1, Math.round(sec));
}

/** A new attempt of a round: true if the previous one was left (see `ABANDON_AFTER`), counted as a round lost */
export function takeAbandoned(c: CharacterState, difficulty: number, round: string): boolean {
  const k = openKey(difficulty, round);
  const sec = c.progression.milestones[k];
  delete c.progression.milestones[k];
  if (sec === undefined || sec < ABANDON_AFTER || checkpointDone(c, difficulty, round)) return false;
  noteDeath(c, difficulty, round);
  return true;
}
