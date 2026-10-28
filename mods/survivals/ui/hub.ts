/**
 * Hub between rounds (lot 285, owner's test: "start the run directly, no walking in town"): in town, a screen over the town with the next
 * round to play (one tap starts it), the list of the rounds (the waypoint), and quick access to the character, the bag, the skills, the
 * stash, the equipment vendor (buy and sell) and the options, opened over it (`UiHost.openPanel`); the town is never walked. A character
 * just created starts its first round at once.
 */
import type { HudCtx } from '../../../src/mods/api';
import type { Game } from '../../../src/mods/sdk';
import { resumeRound } from '../sim/checkpoints';
import { stateOf } from '../sim/state';
import { killerParts } from '../sim/lost';
import { mmss } from './hud';
import { button, ensureStyle, h } from './dom';
import { currentDifficulty, startRound } from './waypoint';
import { isRunMode, runActive, vendorAtBest } from '../sim/runmode';

const stocked = new WeakSet<Game>();
import { pickedRun, playRun, showRunEnd } from './runhub';
import { hub6, hubState } from './hub6';
import { lootPages } from '../sim/runloot';

const DIFF = ['Normal', 'Cauchemar', 'Enfer'];

/** The round the hub offers: the first one not cleared of the highest difficulty open (the waypoint's "Resume") */
export function nextRound(g: Game): { round: ReturnType<typeof resumeRound>; difficulty: number } {
  const d = currentDifficulty(g);
  return { round: resumeRound(g.character, d), difficulty: d };
}

/** Starts the hub's round; false if the game refused it */
export function playNext(g: Game): boolean {
  const n = nextRound(g);
  return startRound(g, n.round, n.difficulty, () => undefined);
}

export function hubWidget(ctx: HudCtx): { el: HTMLElement; update(g: Game): void } {
  ensureStyle();
  const g = ctx.game;
  const el = h('div', { cls: 'sv-hub', data: { sv: 'hub' } });
  el.style.display = 'none';
  let key = '';
  const panel = (name: Parameters<NonNullable<typeof ctx.host.openPanel>>[0], label: string, badge = 0) => {
    const b = button(badge > 0 ? `${label} (${badge})` : label, () => ctx.host.openPanel?.(name));
    b.dataset.panel = name;
    return b;
  };
  const draw = () => {
    const c = g.character;
    // Run mode (lot 289): the six-tab hub in three panels (lot 295, ui/hub6.ts)
    if (isRunMode(c)) {
      el.classList.add('sv-hub6');
      el.replaceChildren(
        hub6(ctx, () => {
          key = '';
        }),
      );
      return;
    }
    el.classList.remove('sv-hub6');
    const n = nextRound(g);
    const play = button(
      `Jouer : ${n.round.name}`,
      () => {
        if (!playNext(g)) ctx.host.haptic('fail');
      },
      'primary sv-play',
    );
    play.dataset.sv = 'play';
    const rounds = ctx.host.openPanel ? panel('waypoint', 'Toutes les manches') : null;
    const quick = ctx.host.openPanel
      ? [
          panel('character', 'Personnage', c.statPoints),
          panel('inventory', 'Inventaire'),
          panel('skills', 'Compétences', c.skillPoints),
          panel('stash', 'Coffre'),
          panel('vendor', 'Marchand'),
          panel('settings', 'Réglages'),
        ]
      : [];
    // the round just lost (lot 288): where, how long, by whom
    const lost = stateOf(g).lastDeath;
    const lostBox = lost
      ? h(
          'div',
          { cls: 'sv-lost', data: { sv: 'lost' } },
          h('b', { text: `Manche perdue : ${lost.name}` }),
          h('span', { cls: 'sv-killer' }, ...killerParts(lost).map((t) => h('span', { text: t }))),
          h('span', { text: `Tenue ${mmss(lost.sec)} · niveau ${lost.level} · ${lost.kills} monstres tués` }),
        )
      : null;
    el.replaceChildren(
      h(
        'div',
        { cls: 'sv-box sv-hub-box' },
        h('h2', { cls: 'sv-title', text: `Survivals — ${DIFF[n.difficulty]}` }),
        lostBox,
        h('p', { cls: 'sv-sub', text: `${c.name} · niveau ${c.level} · ${c.gold} or` }),
        play,
        h('p', { cls: 'sv-sub', text: `Acte ${n.round.act} · monstres niv. ${n.round.recLevel[n.difficulty]} conseillé` }),
        h('div', { cls: 'sv-hub-grid' }, ...quick, rounds),
      ),
    );
  };
  return {
    el,
    update(gg: Game) {
      const town = gg.mode === 'town';
      el.style.display = town ? '' : 'none';
      if (!town) return;
      // a character just created: its first round at once
      const st = stateOf(gg);
      const c = gg.character;
      if (isRunMode(c)) {
        // a run still open is ended by the next step (sim/runmode.ts); a character just created runs Act I at once
        if (runActive(c)) return;
        if (st.autoStart) {
          st.autoStart = false;
          // a new character: Act I in Normal; a run interrupted by the app closed (lot 298): a new run of its act, from 0
          const pk = pickedRun(gg);
          if (playRun(gg, pk.act, pk.d)) return;
        }
        // the vendor's stall of the best level reached (once a session: the town's own is a level-1 one)
        if (!stocked.has(gg)) {
          stocked.add(gg);
          vendorAtBest(gg);
        }
        showRunEnd(ctx, gg);
        const p = pickedRun(gg);
        // redrawn when the hub's own state asks (`key` emptied) or the character changed under it (gold, runs, bag, stash, merc)
        const hs = hubState(gg);
        const rk = `run|${c.gold}|${p.act}|${p.d}|${c.progression.milestones['survivals:runs'] ?? 0}|${hs.tab}|${c.inventory.length}|${lootPages(c).length}|${c.merc ? `${c.merc.type}:${c.merc.dead}` : ''}`;
        if (rk === key) return;
        key = rk;
        draw();
        return;
      }
      if (st.autoStart) {
        st.autoStart = false;
        if (playNext(gg)) return;
      }
      const n = nextRound(gg);
      const k = `${c.level}|${c.gold}|${c.statPoints}|${c.skillPoints}|${n.round.id}|${n.difficulty}|${st.lastDeath ? `${st.lastDeath.round}:${st.lastDeath.sec}` : ''}`;
      if (k === key) return;
      key = k;
      draw();
    },
  };
}
