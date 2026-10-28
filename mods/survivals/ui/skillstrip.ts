/**
 * Skills taken, shown without a button (lot 290, owner: "no skill button any more, everything is automatic: just a preview of the skills
 * taken with their icon and a refresh after each automatic cast"). A row of icons at the bottom of the screen during a round, never a touch
 * target (`pointer-events: none`, `aria-hidden`): the hero's active skills (points put in, passives and the plain attack aside, the
 * highest first, `STRIP_MAX` at most: all of them since lot 305); after each cast of one (the automatic control's), its icon darkens and fills back clockwise over its
 * cooldown (Diablo II's, when it has one) or `REFRESH_TICKS` at least; the skill the mana cannot pay for now is dimmed.
 */
import { REGISTRIES, skillIcon, skillManaCost, type Game } from '../../../src/mods/sdk';
import { h } from './dom';
import { inRound } from '../sim/autopilot';

/** Icons shown at most (lot 305: every active skill learned, was 6; in rows of 8, dom.ts) */
export const STRIP_MAX = 24;
/** Ticks of the refresh shown after a cast of a skill with no cooldown (0.6 s) */
export const REFRESH_TICKS = 15;

/** The skills shown: active, with points, the highest first (then by name, stable) */
export function stripSkills(g: Game): string[] {
  const c = g.character;
  return Object.entries(c.skills)
    .filter(([id, n]) => (n ?? 0) > 0 && id !== 'attack' && !REGISTRIES.skills.get(id)?.passive)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0) || a[0].localeCompare(b[0]))
    .slice(0, STRIP_MAX)
    .map(([id]) => id);
}

/** Share of the refresh done (1: ready) of a skill cast at tick `castAt` (cooldown until `until`), at tick `now` */
export function refreshShare(castAt: number | undefined, until: number, now: number): number {
  if (castAt === undefined) return 1;
  const total = Math.max(REFRESH_TICKS, until - castAt);
  return Math.max(0, Math.min(1, (now - castAt) / total));
}

export function skillStrip(): { el: HTMLElement; update(g: Game): void } {
  const el = h('div', { cls: 'sv-skills', data: { sv: 'skills' } });
  el.setAttribute('aria-hidden', 'true');
  let key = '';
  let cells: { id: string; cell: HTMLElement }[] = [];
  /** Tick of the last cast of each skill, by game (the player's casts: events of the steps) */
  let game: Game | null = null;
  let off: (() => void) | null = null;
  const castAt = new Map<string, number>();
  return {
    el,
    update(g: Game) {
      const show = inRound(g);
      el.style.display = show ? '' : 'none';
      if (g !== game) {
        off?.();
        game = g;
        castAt.clear();
        off = g.onEvent((e) => {
          if (e.t === 'cast' && e.id === g.world.player.id) castAt.set(e.skill, g.world.tick);
        });
      }
      if (!show) return;
      const ids = stripSkills(g);
      const k = ids.join();
      if (k !== key) {
        key = k;
        cells = ids.map((id) => {
          const cell = h('span', { cls: 'sv-sk', data: { skill: id } }, skillIcon(id), h('span', { cls: 'sv-sk-cd' }));
          return { id, cell };
        });
        el.replaceChildren(...cells.map((x) => x.cell));
      }
      const w = g.world;
      const p = w.player;
      for (const { id, cell } of cells) {
        const share = refreshShare(castAt.get(id), p.cooldowns[id] ?? 0, w.tick);
        cell.style.setProperty('--sv-cd', `${Math.round(share * 360)}deg`);
        cell.classList.toggle('cooling', share < 1);
        cell.classList.toggle('nomana', p.mana < skillManaCost(w, id));
      }
    },
  };
}
