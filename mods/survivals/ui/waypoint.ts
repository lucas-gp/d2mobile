/**
 * "Survivals" section of the waypoint (slot `town.waypoint`): at each difficulty open to the character (the highest first and unfolded,
 * with its rounds cleared), "Resume" (the first open round not cleared: the last checkpoint) and the rounds act by act (cleared, open,
 * locked; an act opens when the previous act's boss is killed).
 * The act of the round to resume is unfolded, the other acts reached are folded, the acts not reached yet are not listed. A round far
 * below the character's level is marked: Diablo II's level gap cuts its experience. The mode's settings are in the settings panel (rule `ui.settings`).
 */
import type { TownCtx } from '../../../src/mods/api';
import type { Game } from '../../../src/mods/sdk';
import { runIdOf, type RoundDef } from '../data/chapters';
import type { RoundStatus } from '../sim/checkpoints';
import { resumeRound, roundStatus } from '../sim/checkpoints';
import { roundLevels } from '../sim/rounds';
import { button, ensureStyle, h } from './dom';
import { isRunMode } from '../sim/runmode';

const DIFF = ['Normal', 'Cauchemar', 'Enfer'];
const ACT_NUM = ['I', 'II', 'III', 'IV', 'V'];

/** Rounds of an act: name, monster level, advice, state, "Play" */
function roundList(g: Game, level: number, st: RoundStatus[], d: number, close: () => void): HTMLElement {
  const list = h('div', { cls: 'sv-list' });
  for (const s of st) {
    const lvl = roundLevels(s.round)[d];
    const gap = level - lvl > 5;
    const state = s.done ? 'Terminée' : s.unlocked ? 'Ouverte' : 'Verrouillée';
    const play = button('Jouer', () => startRound(g, s.round, d, close));
    play.disabled = !s.unlocked;
    play.dataset.round = s.round.id;
    list.append(
      h(
        'div',
        { cls: `sv-round${s.done ? ' done' : ''}${s.unlocked ? '' : ' locked'}` },
        h(
          'div',
          {},
          h('div', { text: s.round.name }),
          h('small', { cls: 'base', text: `Monstres niv. ${lvl} · conseillé ${s.round.recLevel[d]}` }),
          gap ? h('small', { cls: 'base', text: ' · expérience réduite (écart de niveau)' }) : null,
        ),
        h('span', { cls: 'sv-state', text: state }),
        play,
      ),
    );
  }
  return list;
}

/** Starts a round (closing the panels first, as the base's waypoint does) */
export function startRound(g: Game, r: RoundDef, difficulty: number, close: () => void): boolean {
  close();
  return g.startRun(runIdOf(r), difficulty as 0 | 1 | 2);
}

/**
 * Difficulty unfolded in the section: the highest one open to the character (Baal in Normal opens Nightmare, Baal in Nightmare opens Hell,
 * as in Diablo II); the others are folded, each with its rounds cleared out of the campaign's
 */
export function currentDifficulty(g: Game): number {
  return Math.max(0, Math.min(2, g.character.progression.highestDifficulty));
}

export function waypointSection(ctx: TownCtx): HTMLElement | null {
  ensureStyle();
  const g = ctx.game;
  const c = g.character;
  // Run mode (lot 289): runs start from the hub, never from a round's list
  if (isRunMode(c)) return null;
  const top = currentDifficulty(g);
  const out = h('div', { cls: 'runcard sv-waypoint', data: { sv: 'waypoint' } }, h('h3', { text: 'Survivals' }));
  for (let d = top; d >= 0; d--) {
    const resume = resumeRound(c, d);
    const st = roundStatus(c, d);
    const done = st.filter((x) => x.done).length;
    const diff = h(
      'details',
      { cls: 'sv-diff', data: { diff: String(d) } },
      h('summary', {}, h('span', { text: DIFF[d] }), h('small', { cls: 'base', text: ` · Manches terminées : ${done} / ${st.length}` })),
    );
    if (d === top) diff.open = true;
    diff.append(
      h(
        'div',
        { cls: 'sv-row', style: { justifyContent: 'flex-start' } },
        button(`Reprendre : ${resume.name}`, () => startRound(g, resume, d, ctx.close), 'primary'),
      ),
    );
    const acts = [...new Set(st.map((x) => x.round.act))];
    for (const act of acts) {
      const rounds = st.filter((x) => x.round.act === act);
      // an act not reached yet (its first round locked) is not listed
      if (!rounds[0].unlocked) continue;
      const box = h('details', { cls: 'sv-act', data: { act: String(act) } }, h('summary', { text: `Acte ${ACT_NUM[act - 1]}` }));
      if (act === resume.act) box.open = true;
      box.append(roundList(g, c.level, rounds, d, ctx.close));
      diff.append(box);
    }
    out.append(diff);
  }
  return out;
}
