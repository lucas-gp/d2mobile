/**
 * HUD of a round (slot `hud`): time, live monsters against the target, the next announced event, the bars of the named elites and a pause
 * button (the game pauses: automatic attack, the mode's settings, the game's options, leave the round). Shown only during a Survivals
 * round; refreshed at most 4 times a second (the base calls `update` every frame). In town, the hub between rounds (hub.ts).
 * The base's controls hidden meanwhile (rule `ui.hudHidden`, lot 285, owner's test: "too many buttons"): the panel buttons, the potions,
 * the skill page, the empty skill slots, the context button, the tips; the joystick, the attack, the skills bound and the gauges stay.
 */
import { inFlow, runZones, isRunMode, runInfo, skipZoneWait, zoneWaitLeft } from '../sim/runmode';
import type { HudCtx, HudWidget } from '../../../src/mods/api';
import type { Game } from '../../../src/mods/sdk';
import { roundOfRun } from '../data/chapters';
import { Director } from '../sim/director';
import { setting, stateOf } from '../sim/state';
import { governor } from '../sim/adaptive';
import { button, ensureStyle, h } from './dom';
import { pauseScreen } from './menu';
import { levelUpCards } from './levelup';
import { hubWidget } from './hub';
import { inRound } from '../sim/autopilot';
import { burstParts, killerParts } from '../sim/lost';
import { skillStrip } from './skillstrip';
import { runEndScreen } from './runhub';
import { automap } from './automap';
import { boundsLayer } from './bounds';

/** Base controls hidden in a round and in town (rule `ui.hudHidden`; src/ui/hud-parts.ts) */
export const ROUND_HIDDEN: readonly string[] = Object.freeze([
  'character',
  'inventory',
  'skills',
  'portal',
  'settings',
  'potions',
  'page',
  'empty-skills',
  'context',
  'image',
  'walk',
  'tips',
  'death',
]);
const NONE: readonly string[] = Object.freeze([]);

/**
 * Lot 290 (owner: no skill button, everything automatic): in every control, the attack and the skills bound hidden too; the screen keeps
 * the joystick, the gauges and the mode's pause, and shows the skills taken without a button (`skillStrip`); lot 301: the base's level line too (the
 * round's HUD tells the level and the zone)
 */
export const AUTO_HIDDEN: readonly string[] = Object.freeze([...ROUND_HIDDEN, 'attack', 'bound-skills', 'pcbar', 'level']);

/** Lot 294 (owner: no mana in Act I's flow, as the other game): the mana gauge hidden too (bar, globe); lot 301: the level's line (the run's HUD tells the zone top right) */
export const FLOW_HIDDEN: readonly string[] = Object.freeze([...AUTO_HIDDEN, 'mana']);

/** Controls of the base hidden now: in a round and in town (the hub has its own buttons); none elsewhere */
export function hudHidden(g: Game): readonly string[] {
  if (inRound(g) && inFlow(g.world)) return FLOW_HIDDEN;
  return inRound(g) || g.mode === 'town' ? AUTO_HIDDEN : NONE;
}

const NEXT: Record<string, string> = {
  champions: 'Champions',
  encircle: 'Encerclement',
  unique: 'Unique',
  miniboss: 'Super-unique',
  boss: 'Boss',
  wave: 'Vague d’élite',
};

/** Difficulty shown in the HUD (Normal: none) */
const DIFF_NAME = ['', 'Cauchemar', 'Enfer'];

export const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** Director of the round being played (null outside a round) */
export function directorOf(g: Game): Director | null {
  const d = g.mode === 'run' ? g.world.run?.director : null;
  return d instanceof Director ? d : null;
}

export function hudWidget(ctx: HudCtx): HudWidget {
  ensureStyle();
  // lot 301 (owner: "a long list in the middle of the screen"): the run's HUD in the corners, as Diablo II's; small, no boxes
  // top right, above the minimap: the zone's name, its act and zone n / N (and the difficulty)
  const zoneName = h('b', { cls: 'sv-zname', data: { sv: 'zone-name' } });
  const diff = h('span', { cls: 'sv-diff-chip', data: { sv: 'difficulty' } });
  const zone = h('span', { data: { sv: 'zone' } });
  const act = h('span', { data: { sv: 'act' } });
  // pause (left of the title): automatic attack, the mode's settings, the game's options, leave the round (menu.ts)
  const pause = button('❚❚', () => pauseScreen(ctx), 'sv-pause');
  pause.dataset.sv = 'pause';
  pause.title = 'Pause';
  pause.setAttribute('aria-label', 'Pause');
  const zoneBox = h('div', { cls: 'sv-zonebox', data: { sv: 'zone-box' } }, pause, h('div', { cls: 'sv-ztitle' }, zoneName, h('span', { cls: 'sv-zsub' }, act, zone, diff)));
  // top centre, one small line: the clock, the next event (a mini-boss and its countdown)
  const time = h('span', { cls: 'sv-time', data: { sv: 'time' } });
  const next = h('span', { cls: 'sv-next', data: { sv: 'next' } });
  // the round's named elites and bosses alive: a bar each (name, life), the round's bosses first, 3 at most (under the top line)
  const bars = h('div', { cls: 'sv-bosses', data: { sv: 'bosses' } });
  const top = h('div', { cls: 'sv-topc', data: { sv: 'top' } }, h('div', { cls: 'sv-topline' }, time, next), bars);
  // top left, under the life gauge: the run's kills and gold, the live monsters against the target (lot 296: always in sight)
  const kills = h('span', { data: { sv: 'kills' } });
  const gold = h('span', { cls: 'sv-goldchip', data: { sv: 'gold' } });
  const pop = h('span', { cls: 'sv-pop', data: { sv: 'pop' } });
  // adaptive density at work: the frames were slow, fewer monsters and fewer things drawn (sim/adaptive.ts)
  const load = h('span', { cls: 'sv-load', data: { sv: 'load' }, text: 'Fluidité' });
  load.title = 'Densité réduite pour garder le jeu fluide (réglage « Densité adaptative »)';
  load.style.display = 'none';
  const lvlEl = h('span', { cls: 'sv-lvl', data: { sv: 'level' } });
  const stats = h('div', { cls: 'sv-stats', data: { sv: 'stats' } }, lvlEl, kills, gold, pop, load);
  const row = h('div', { cls: 'sv-hud', data: { sv: 'hud' } }, zoneBox, top, stats);
  const hub = hubWidget(ctx);
  // the round lost (lot 288): in place of the base's death notice, for the 3 s before the hub, the killer and the hit (sim/lost.ts)
  const death = h('div', { cls: 'sv-death', data: { sv: 'death' } });
  death.style.display = 'none';
  // lot 290: the skills taken, a preview with no button (ui/skillstrip.ts)
  const skills = skillStrip();
  // lot 300 (owner): after a zone's mini-boss, 10 s to pick up its loot, counted down; a tap goes on to the next zone at once
  const waitNum = h('b', { cls: 'sv-wait-n' });
  const wait = h(
    'button',
    { cls: 'sv-wait', data: { sv: 'zone-wait' } },
    h('span', { text: 'Zone terminée : ramassez le butin' }),
    waitNum,
    h('small', { text: 'Zone suivante — touchez pour y aller' }),
  );
  wait.type = 'button';
  wait.style.display = 'none';
  wait.addEventListener('click', (e) => {
    e.stopPropagation();
    if (cur && skipZoneWait(cur)) wait.style.display = 'none';
  });
  let cur: Game | null = null;
  let lastWait = '';
  // lot 307: the round's automap (corner and centred, ui/automap.ts) in place of the base's minimap, the darkness beyond the arena's edge
  const map = automap();
  const bounds = boundsLayer();
  map.corner.style.display = 'none';
  const el = h('div', { cls: 'sv-root' }, bounds.el, row, death, wait, skills.el, hub.el, map.corner, map.big);
  // Diablo II's Tab: the centred map (a keyboard)
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !cur || !directorOf(cur) || document.querySelector('.sv-screen, #panels .panel')) return;
    e.preventDefault();
    map.toggle();
  });
  let deathKey = '';
  let at = 0;
  // a card waiting with no screen (Run mode: the first card of a run, a kept point back in the next zone, events of a world just left)
  let offerAt = 0;
  let last = '';
  let lastBars = '';
  return {
    el,
    update(g: Game) {
      const now = performance.now();
      // every frame shown during a round is measured (the adaptive density); out of a round, nothing
      if (directorOf(g) && setting(g, 'adaptive') === 'on') governor.frame(now);
      else governor.pause();
      hub.update(g);
      skills.update(g);
      cur = g;
      // lot 307: the automap and the arena's dark edge, in a round (not under its death notice nor an end screen)
      const dd = directorOf(g);
      const inPlay = !!dd && !g.world.player.dead && !!roundOfRun(g.runDef?.id);
      bounds.update(inPlay ? g.world : null, inPlay ? dd.box : null);
      if (inPlay) map.update(g, dd);
      const showMap = inPlay ? '' : 'none';
      if (map.corner.style.display !== showMap) map.corner.style.display = showMap;
      if (!inPlay && map.open) map.toggle();
      // lot 305: a won run's end over the boss's zone (sim/runmode.ts `runStep`), the game paused under it; shown again after the shop
      const endHere = g.mode === 'run' ? stateOf(g).endHere : null;
      if (endHere && !document.querySelector('.sv-screen')) runEndScreen(ctx, endHere, true);
      const left = inRound(g) ? zoneWaitLeft(g) : null;
      const wk = left === null ? '' : String(Math.ceil(left));
      if (wk !== lastWait) {
        lastWait = wk;
        wait.style.display = wk ? '' : 'none';
        waitNum.textContent = wk;
      }
      if (inRound(g) && isRunMode(g.character) && g.offers.length && !document.querySelector('.sv-screen')) {
        if (!offerAt) offerAt = now;
        else if (now - offerAt > 1000) {
          offerAt = 0;
          levelUpCards({ game: g, host: ctx.host, screen: ctx.screen, level: g.offers[0].level });
        }
      } else offerAt = 0;
      const lost = inRound(g) && g.world.player.dead ? stateOf(g).lastDeath : null;
      const dk = lost ? `${lost.round}:${lost.sec}` : '';
      if (dk !== deathKey) {
        deathKey = dk;
        death.style.display = lost ? '' : 'none';
        if (lost)
          death.replaceChildren(
            h('b', { text: isRunMode(g.character) ? 'Run terminée' : 'Manche perdue' }),
            h('span', { cls: 'sv-killer' }, ...killerParts(lost).map((t) => h('span', { text: t }))),
            ...(burstParts(lost.burst).length ? [h('span', { cls: 'sv-killer', data: { sv: 'burst' } }, ...burstParts(lost.burst).map((t) => h('span', { text: t })))] : []),
            h('small', { text: `${lost.name} · ${mmss(lost.sec)} · ${lost.kills} monstres tués` }),
          );
      }
      if (now - at < 250) return;
      at = now;
      const d = directorOf(g);
      const round = roundOfRun(g.runDef?.id);
      // lot 296: the row hidden under the death notice (it was drawn over the killer's line)
      row.style.display = d && round && !lost ? '' : 'none';
      // lot 301: the base's minimap moved under the zone's title (style in dom.ts); lot 307: hidden, the mode's automap in its place
      document.documentElement.toggleAttribute('data-sv-runhud', row.style.display === '');
      if (!d || !round) return;
      const st = d.state(g.world);
      updateBars(d);
      clearTitle(row);
      placeStats(stats);
      placeTop(top);
      const lvl = setting(g, 'adaptive') === 'on' ? governor.level : 0;
      const ri = runInfo(g.character);
      // at the death the zone's kills are already counted in the run's (`runmode.ts`, the hero's death)
      const runKills = ri ? ri.kills + (g.world.player.dead ? 0 : g.world.stats.kills) : 0;
      const runGold = ri ? Math.max(0, g.character.gold - ri.gold0) : 0;
      const key = `${Math.floor(st.sec)}|${st.alive}|${st.target}|${st.next?.what}|${st.next?.name}|${st.checkpoint}|${lvl}|${runKills}|${runGold}`;
      if (key === last) return;
      last = key;
      time.textContent = mmss(st.sec);
      kills.textContent = ri ? `${runKills} tués` : '';
      kills.style.display = ri ? '' : 'none';
      gold.textContent = ri ? `${runGold} or` : '';
      gold.style.display = ri ? '' : 'none';
      zone.textContent = ri ? `Zone ${ri.zone + 1} / ${runZones(ri.act, ri.d).length}` : '';
      zone.style.display = ri ? '' : 'none';
      zoneName.textContent = g.runDef?.name ?? round.name ?? '';
      act.textContent = ri ? `Acte ${ACT_NAME[ri.act] ?? ri.act}` : '';
      act.style.display = ri ? '' : 'none';
      lvlEl.textContent = `Niveau ${g.character.level}`;
      diff.textContent = DIFF_NAME[g.world.difficulty] ?? '';
      diff.style.display = diff.textContent ? '' : 'none';
      pop.textContent = `${st.alive} / ${st.target}`;
      pop.title = 'Monstres en vie / visés';
      next.textContent = st.checkpoint ? 'Prolongation' : st.next ? nextText(st.next, st.sec) : '';
      next.style.display = next.textContent ? '' : 'none';
      // telegraph: the chip of the next event pulses in its last 10 seconds
      next.classList.toggle('soon', !st.checkpoint && !!st.next && st.next.at - st.sec <= 10);
      load.style.display = lvl > 0 ? '' : 'none';
    },
  };

  function updateBars(d: Director): void {
    const list = d.namedMonsters().slice(0, 3);
    const k = list.map((m) => `${m.id}:${Math.ceil((40 * m.hp) / m.hpMax)}:${immunities(m).join('')}`).join(',');
    if (k === lastBars) return;
    lastBars = k;
    bars.replaceChildren(
      ...list.map((m) => {
        const boss = d.bossIds.includes(m.id);
        const fill = h('div', { cls: 'sv-boss-fill', style: { transform: `scaleX(${Math.max(0, Math.min(1, m.hp / m.hpMax))})` } });
        // its immunities under its name (lot 288: which element will not hurt it)
        const imm = immunities(m);
        return h(
          'div',
          { cls: `sv-boss${boss ? ' main' : ''}`, data: { svBoss: String(m.id) } },
          h('div', { cls: 'sv-boss-bar' }, fill),
          h('span', { cls: 'sv-boss-name', text: m.name }),
          imm.length ? h('span', { cls: 'sv-boss-imm', text: `Immunisé : ${imm.map((e) => IMM_NAME[e]).join(', ')}` }) : null,
        );
      }),
    );
    bars.style.display = list.length ? '' : 'none';
  }
}

/** Roman numbers of the acts (the zone's title, top right) */
const ACT_NAME: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };

/** Lot 301: the run's figures beside or under the base's life gauge (its globe or its bar, wherever the layout put it) */
function placeStats(stats: HTMLElement): void {
  // the base's level line shown (a round out of Act I's flow): under it
  const lv = document.querySelector<HTMLElement>('#hud .lvl');
  const lr = lv && getComputedStyle(lv).display !== 'none' ? lv.getBoundingClientRect() : null;
  if (lr && lr.height > 0) {
    stats.style.top = `${Math.round(lr.bottom + 4)}px`;
    stats.style.left = `${Math.round(Math.max(6, lr.left))}px`;
    stats.classList.toggle('beside', innerWidth > innerHeight);
    return;
  }
  const life = [...document.querySelectorAll<HTMLElement>('#hud .orb.life, #hud .bar.life')].find((e) => e.getBoundingClientRect().height > 0);
  const r = life?.getBoundingClientRect();
  // landscape: beside it (where the base's level line was), the field's height kept; portrait: under it
  const beside = innerWidth > innerHeight;
  stats.style.top = `${Math.round(r ? (beside ? r.top + 6 : r.bottom + 4) : 64)}px`;
  stats.style.left = `${Math.round(r ? (beside ? r.right + 10 : Math.max(6, r.left)) : 8)}px`;
  stats.classList.toggle('beside', beside);
}

/**
 * Lot 301: the clock's line and the bosses' bars at the top's centre; on a screen held upright (too narrow between the gauge and the
 * title) under the gauge's and the minimap's band instead
 */
function placeTop(top: HTMLElement): void {
  if (innerWidth > innerHeight * 0.9) {
    top.style.top = '';
    return;
  }
  let b = 0;
  for (const e of document.querySelectorAll<HTMLElement>('[data-sv="automap"], #hud .orb.life, #hud .bar.life, .sv-zonebox')) {
    const r = e.getBoundingClientRect();
    if (r.height > 0) b = Math.max(b, r.bottom);
  }
  top.style.top = `${Math.round(b + 6)}px`;
}

const IMM_NAME: Record<string, string> = { fire: 'Feu', cold: 'Froid', light: 'Foudre', poison: 'Poison', phys: 'Physique', magic: 'Magie' };

/** Elements a monster is immune to (resistance of 100 % or more) */
export function immunities(m: { res: Partial<Record<string, number>> }): string[] {
  return Object.keys(IMM_NAME).filter((e) => (m.res[e] ?? 0) >= 100);
}

/** Text of the next event's chip: what, who (a named elite or boss), in how long */
export function nextText(n: { what: string; at: number; name?: string }, sec: number): string {
  const what = n.name ?? NEXT[n.what] ?? n.what;
  return `${what} ${mmss(Math.max(0, n.at - sec))}`;
}

/**
 * The base's title (level and zone, top left) and the round's HUD row may meet on a phone in landscape: the row then goes under the title
 * (measured at each refresh; the row stays centered at the top otherwise)
 */
export function clearTitle(el: HTMLElement): void {
  if (typeof window === 'undefined' || !window.matchMedia?.('(orientation: landscape)').matches) {
    el.style.top = '';
    return;
  }
  const title = document.querySelector('.lvl');
  el.style.top = '';
  if (!title) return;
  const a = title.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  if (a.width && b.width && a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom) el.style.top = `${Math.round(a.bottom + 4)}px`;
}
