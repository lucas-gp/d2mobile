/**
 * The Run mode's choices (lot 289) and the run-end screen. Between runs the hero is in town, covered by the six-tab hub (lot 295,
 * ui/hub6.ts), whose Character tab lists the acts and difficulties opened and their records (below). The run-end screen tells the outcome (the killer
 * and the hit, or the act beaten and what it opened), the time, the level reached, the kills, the gold, the items found and the records
 * beaten, with "Play again" (the same act at once) and "Hub".
 */
import type { HudCtx } from '../../../src/mods/api';
import { itemName, type Game } from '../../../src/mods/sdk';
import { brainOf, spendStats } from '../sim/autopilot';
import { burstParts, killerParts } from '../sim/lost';
import { actUnlocked, flowActive, runZones, lastChoice, recKey, startRunMode, unlockedActs } from '../sim/runmode';
import { stateOf, type RunEnd } from '../sim/state';
import { mmss } from './hud';
import { button, ensureStyle, h } from './dom';
import { bestBuy, shopStock } from '../sim/shop';
import { openShop } from './shop';

const DIFF = ['Normal', 'Cauchemar', 'Enfer'];
const ACT_NUM = ['I', 'II', 'III', 'IV', 'V'];

/** The points of a run's entry level above 1: stats by the profile, skills by the class's build plan (a later act or difficulty) */
export function prepareRun(g: Game): void {
  spendStats(g);
  brainOf(g).spendSkillPoints();
}

/** Starts a run of the act from the hub */
export function playRun(g: Game, act: number, d: number): boolean {
  return startRunMode(g, act, d, prepareRun);
}

/**
 * Starts a run of the act from a screen (lot 305: the hub's "Start the run", the end screen's "Next act" and "Replay"): the act's D2
 * maps loaded first when they are not (another act than the town's), then the run; false (and a refusal's feedback) if refused
 */
export async function launchRun(ctx: HudCtx, act: number, d: number): Promise<boolean> {
  const g = ctx.game;
  // without a loader (tests) the run starts at once, in the same call
  const load = ctx.host.loadActMaps?.(act);
  if (load) await load.catch(() => undefined);
  if (playRun(g, act, d)) return true;
  ctx.host.haptic('fail');
  return false;
}

/** The act and difficulty picked in the hub (session), the last run's by default */
const PICKED = new WeakMap<Game, { act: number; d: number }>();
export function pickedRun(g: Game): { act: number; d: number } {
  const p = PICKED.get(g);
  const open = unlockedActs(g.character);
  return p && open.some((o) => o.act === p.act && o.d === p.d) ? p : lastChoice(g.character);
}
/** The act and difficulty picked in the hub's run list (lot 295: the Character tab's right panel) */
export function setPicked(g: Game, o: { act: number; d: number }): void {
  PICKED.set(g, o);
}

export const runLabel = (act: number, d: number): string => `Acte ${ACT_NUM[act - 1]} — ${DIFF[d]}`;

/** Records of an act in a difficulty, one line each (none before a first run) */
export function recordLines(g: Game, act: number, d: number): string[] {
  const m = g.character.progression.milestones;
  const runs = m[recKey(d, act, 'runs')] ?? 0;
  if (!runs) return [];
  const out = [`Victoires : ${m[recKey(d, act, 'wins')] ?? 0} / ${runs} runs`];
  const best = m[recKey(d, act, 'best')];
  if (best !== undefined) out.push(`Meilleur temps : ${mmss(best)}`);
  const surv = m[recKey(d, act, 'surv')];
  if (surv !== undefined) out.push(`Plus longue survie : ${mmss(surv)}`);
  out.push(`Zone la plus lointaine : ${m[recKey(d, act, 'deep')] ?? 1} / ${runZones(act, d).length}`);
  out.push(`Plus de monstres tués : ${m[recKey(d, act, 'kills')] ?? 0}`);
  return out;
}

/** What a run keeps and what it does not (lot 294: the level back to 1 at each run is the rule, not a bug) */
export const RESET_TEXT = 'Roguelite : les niveaux et les compétences se regagnent pendant chaque run ; l’équipement, l’or et le coffre restent.';

/**
 * The run-end screen (once, over the hub). Lot 305: `here`, over the act boss's zone where the hero stays (a won run: no town loaded
 * before the player chooses); its "Hub" then goes to town
 */
export function runEndScreen(ctx: HudCtx, end: RunEnd, here = false): void {
  const g = ctx.game;
  ensureStyle();
  const node = h('div', { cls: 'sv-screen', data: { svScreen: 'run-end', outcome: end.outcome, here: here ? '1' : '' } });
  const scr = ctx.screen.open(node);
  /** Leaves the screen (and the boss's zone when over it) before what the button does */
  const leave = () => {
    stateOf(g).endHere = null;
    scr.close();
  };
  const title = end.outcome === 'victory' ? `Victoire : ${runLabel(end.act, end.d)}` : end.outcome === 'death' ? `Run terminée : ${end.zone}` : `Run abandonnée : ${end.zone}`;
  const lines: [string, string][] = [
    ['Durée', mmss(end.sec)],
    // lot 296: the longest run so far beside this one (the other game's "Best time" on its death screen)
    ...(end.survival !== undefined && !end.bestSurvival && end.survival > end.sec ? ([['Plus longue survie', mmss(end.survival)]] as [string, string][]) : []),
    ['Zone atteinte', `${end.zoneIndex} / ${end.zones}`],
    ['Niveau atteint', String(end.level)],
    ['Monstres tués', String(end.kills)],
    ['Or gagné', String(Math.max(0, end.gold))],
    ['Objets trouvés', String(end.items)],
  ];
  const REC: Record<string, string> = { best: 'Record : meilleur temps', kills: 'Record : monstres tués', deep: 'Record : zone la plus lointaine' };
  // lot 292: "New best time" for every fastest victory (the first one too), the other records as before
  const recs = [
    ...(end.bestTime ? ['Nouveau meilleur temps !'] : []),
    ...(end.bestSurvival ? ['Nouvelle plus longue survie !'] : []),
    ...end.records.filter((r) => r !== 'best' || !end.bestTime).map((r) => REC[r]),
  ];
  const shop = button(
    'Boutique',
    () => {
      // over the boss's zone the end screen comes back when the shop closes (ui/hud.ts)
      scr.close();
      openShop(ctx, 'buy');
    },
    'sv-end-shop',
  );
  shop.dataset.sv = 'visit-shop';
  const best = bestBuy(g);
  const bestLine = best
    ? h('p', {
        cls: 'sv-bestbuy',
        data: { sv: 'best-buy' },
        text: `Meilleur achat : ${itemName(g.vendor[best.idx]?.item ?? shopStock(g)[best.idx].item)} · ${best.price} or${best.affordable ? '' : ` (il manque ${best.price - g.character.gold} or)`}`,
      })
    : null;
  // lot 305 (owner: "the play again button gives the feeling Act I is replayed, and I cannot see how to play Act II next"): the next act
  // named when the victory opened it, the replay names its act, the hub
  const go = (act: number) => {
    leave();
    void launchRun(ctx, act, end.d).then((ok) => {
      // refused (the bag's pages full…): the hub tells why
      if (!ok && g.mode === 'run') g.townPortal();
    });
  };
  const nextAct = end.outcome === 'victory' && end.act < 5 && actUnlocked(g.character, end.act + 1, end.d) ? end.act + 1 : null;
  const next = nextAct ? button(`Acte suivant : ${runLabel(nextAct, end.d)}`, () => go(nextAct), 'primary sv-end-next') : null;
  if (next && nextAct && !flowActive(nextAct, end.d)) next.append(h('small', { text: 'Zones de la Campagne, pas encore réglées pour la Run' }));
  if (next) next.dataset.sv = 'next-act';
  const again = button(`Rejouer l’acte ${ACT_NUM[end.act - 1]}`, () => go(end.act), next ? '' : 'primary');
  again.dataset.sv = 'again';
  const hub = button('Hub', () => {
    leave();
    if (here && g.mode === 'run') g.townPortal();
  });
  hub.dataset.sv = 'hub';
  // lot 299 (owner: "at the end of a run I have to scroll to reach the buttons"): the title on top, the actions in a bar always at the
  // panel's foot, the rest between them, compact (two figures a row when the width allows), scrolling on its own if it still overflows
  const body = h(
    'div',
    { cls: 'sv-end-body', data: { sv: 'end-body' } },
    end.outcome === 'death'
      ? h(
          'p',
          { cls: 'sv-sub sv-killer', data: { sv: 'killer' } },
          ...killerParts({ round: '', name: end.zone, sec: end.sec, level: end.level, kills: end.kills, killer: end.killer }).map((t) => h('span', { text: t })),
        )
      : null,
    // lot 291: the damage of the last 3 s
    end.outcome === 'death' && burstParts(end.burst).length ? h('p', { cls: 'sv-sub sv-killer', data: { sv: 'burst' } }, ...burstParts(end.burst).map((t) => h('span', { text: t }))) : null,
    end.nextAct ? h('p', { cls: 'sv-sub', data: { sv: 'unlocked' }, text: `${runLabel(end.nextAct, end.d)} ouvert` }) : null,
    end.nextDifficulty ? h('p', { cls: 'sv-sub', data: { sv: 'unlocked' }, text: `${DIFF[end.d + 1]} ouvert` }) : null,
    goldFlow(end),
    h('div', { cls: 'sv-recap sv-end-recap' }, ...lines.map(([k, v]) => h('div', { cls: 'sv-kv' }, h('span', { text: k }), h('b', { text: v })))),
    recs.length ? h('p', { cls: 'sv-sub sv-records', data: { sv: 'new-records' } }, ...recs.map((t) => h('b', { text: t }))) : null,
    end.pages ? h('p', { cls: 'sv-sub sv-blocked', data: { sv: 'end-pages' }, text: `Sac plein : ${end.pages} objets dans les pages temporaires (Boutique, onglet Sac)` }) : null,
    bestLine,
    end.itemNames.length ? h('p', { cls: 'sv-sub sv-end-note', text: `Gardés : ${end.itemNames.slice(0, 12).join(', ')}` }) : null,
    h('p', { cls: 'sv-sub sv-end-note', text: 'Tout ce qui a été ramassé est gardé, même après une mort.' }),
    h('p', { cls: 'sv-sub sv-end-note', data: { sv: 'reset' }, text: RESET_TEXT }),
  );
  node.append(h('div', { cls: 'sv-box sv-end' }, h('h2', { cls: 'sv-title', text: title }), body, h('div', { cls: 'sv-row sv-end-acts', data: { sv: 'end-actions' } }, next, again, shop, hub)));
}

/** The run's gold flowing into the purse (lot 292): "+N" and the purse counting up over about a second (at once without animations) */
export function goldFlow(end: RunEnd): HTMLElement {
  const gain = Math.max(0, end.gold);
  const purse = end.purse ?? gain;
  const plus = h('b', { cls: 'sv-plus', text: `+${gain}` });
  const total = h('b', { data: { sv: 'purse' }, text: String(purse) });
  const box = h('div', { cls: 'sv-gold', data: { sv: 'gold-flow' } }, h('span', { text: 'Or' }), plus, h('span', { text: '→ bourse' }), total);
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!gain || still || typeof requestAnimationFrame !== 'function') return box;
  const t0 = performance.now();
  const D = 1100;
  total.textContent = String(purse - gain);
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / D);
    plus.textContent = `+${Math.round(gain * (1 - k))}`;
    total.textContent = String(purse - gain + Math.round(gain * k));
    if (k < 1 && box.isConnected) requestAnimationFrame(step);
    else {
      plus.textContent = `+${gain}`;
      total.textContent = String(purse);
    }
  };
  requestAnimationFrame(step);
  return box;
}

/** The run's end not shown yet: opened once over the hub */
export function showRunEnd(ctx: HudCtx, g: Game): boolean {
  const st = stateOf(g);
  const end = st.runEnd;
  if (!end) return false;
  st.runEnd = null;
  runEndScreen(ctx, end);
  return true;
}
