/**
 * The Run's act screen (lot 306, the owner: "I like the menu and the zones' presentation" of another survivors game; adapted in Diablo
 * II's look, nothing taken): a waypoint of the acts, one row an act and difficulty, the act looked at unfolded under a gold frame: its
 * name, its event in red, two lines of what it holds, its zones (✓ once cleared), its monsters in small grey text, its timed bosses on
 * the act's clock as a row of chips (the act's boss in gold), what its boss drops, the records; a closed act is greyed with what opens
 * it, and a tap on it shows its bosses and loot all the same (not playable). The button at the foot, always in sight, starts the run:
 * "Enter Act I — Andariel awaits at 12:16". Everything is read from the mode's data (sim/actinfo.ts) and the save.
 *
 * Held upright: one column, the act looked at unfolded in its place; wide (landscape, a desktop): the acts on the left, the act looked
 * at on the right.
 */
import type { HudCtx } from '../../../src/mods/api';
import type { Game } from '../../../src/mods/sdk';
import { actBoss, actBosses, actLoot, actRecords, actRoster, actTimed, actZones } from '../sim/actinfo';
import { ACTS, actUnlocked, entryLevel, lockReason } from '../sim/runmode';
import { pagesBlockRun } from '../sim/runloot';
import { button, ensureStyle, h } from './dom';
import { mmss } from './hud';
import { launchRun, pickedRun, setPicked } from './runhub';

const ACT_NUM = ['I', 'II', 'III', 'IV', 'V'];
const DIFF = ['Normal', 'Cauchemar', 'Enfer'];

/** Each act's event (red line) and what it holds (two lines): the mode's own words */
const ACT_EVENT: Record<number, string> = {
  1: 'Andariel tient le monastère des Sœurs',
  2: 'Duriel garde le tombeau de Tal Rasha',
  3: 'Méphisto attend sous Travincal',
  4: 'Diablo s’éveille au Sanctuaire du Chaos',
  5: 'Baal marche sur le mont Arreat',
};
const ACT_FLAVOUR: Record<number, string> = {
  1: 'Cinq zones sur une seule horloge : un mini-boss ferme chaque zone, la horde grossit minute après minute jusqu’au repaire.',
  2: 'Les égouts, le désert et les tombeaux de Lut Gholein, zone après zone, jusqu’à la chambre de Duriel.',
  3: 'La jungle de Kurast, ses temples et le Conseil de Travincal avant la Durance de la Haine.',
  4: 'Les plaines du Désespoir, le fleuve de flammes, puis les sceaux du Sanctuaire du Chaos.',
  5: 'Les hauts plateaux d’Arreat, les Anciens au sommet, puis les vagues du trône.',
};

/** The act looked at on the screen (session): the hub's picked run by default */
const VIEWED = new WeakMap<Game, { act: number; d: number }>();

/** The acts the screen lists, by difficulty: every act of Normal; a further difficulty's acts once its Act I is open, else its Act I */
export function listedActs(g: Game): { act: number; d: number }[] {
  const out: { act: number; d: number }[] = [];
  for (const d of [0, 1, 2]) for (const act of d === 0 || actUnlocked(g.character, 1, d) ? ACTS : ([1] as const)) out.push({ act, d });
  return out;
}

/** The act's one line: open (best time, ✓ beaten, the longest survival, or new), or closed (what opens it) */
function stateParts(g: Game, act: number, d: number): { text: string; cls: string }[] {
  const why = lockReason(g.character, act, d);
  if (why)
    return [
      { text: 'Fermé', cls: 'lock' },
      { text: why, cls: '' },
    ];
  const r = actRecords(g.character, act, d);
  if (r.best !== undefined)
    return [
      { text: '✓', cls: 'ok' },
      { text: 'Meilleur temps', cls: '' },
      { text: mmss(r.best), cls: 'num' },
    ];
  if (r.surv !== undefined)
    return [
      { text: 'Plus longue survie', cls: '' },
      { text: mmss(r.surv), cls: 'num' },
    ];
  return [{ text: 'Jamais jouée', cls: '' }];
}

/** The button's lines: "Enter Act I" and its boss's time, or why it cannot start */
function enterLines(g: Game, act: number, d: number): { title: string; sub: string[]; ok: boolean } {
  const why = lockReason(g.character, act, d);
  const title = `Entrer dans l’acte ${ACT_NUM[act - 1]}`;
  if (why) return { title: 'Acte fermé', sub: [why], ok: false };
  if (pagesBlockRun(g.character)) return { title, sub: ['Pages temporaires pleines : vendez-en ou rangez-en'], ok: false };
  const boss = actBoss(act, d);
  if (boss?.at !== null && boss?.at !== undefined) return { title, sub: [boss.name, 'attend à', mmss(boss.at)], ok: true };
  return { title, sub: boss ? [boss.name, 'au bout de', String(actZones(g.character, act, d).length), 'zones'] : [], ok: true };
}

/** The act looked at, unfolded */
function detail(g: Game, act: number, d: number): HTMLElement {
  const c = g.character;
  const why = lockReason(c, act, d);
  const zones = actZones(c, act, d);
  const bosses = actBosses(act, d);
  const timed = actTimed(act, d);
  const rec = actRecords(c, act, d);
  const loot = actLoot(c, act, d);
  const boss = actBoss(act, d);
  const out = h('section', { cls: `sva-detail a${act}${why ? ' locked' : ''}`, data: { sv: 'act-detail', act: String(act), diff: String(d) } });
  const head: (HTMLElement | null)[] = [
    h('div', { cls: 'sva-dhead' }, h('h3', { text: `Acte ${ACT_NUM[act - 1]}` }), h('span', { cls: 'sva-dchip', text: DIFF[d] }), why ? h('span', { cls: 'sva-dchip lock', text: 'Fermé' }) : null),
    h('p', { cls: 'sva-event', text: ACT_EVENT[act] }),
    h('p', { cls: 'sva-flavour', text: ACT_FLAVOUR[act] }),
    why ? h('p', { cls: 'sva-why', data: { sv: 'why' }, text: why }) : null,
    !timed ? h('p', { cls: 'sva-note', data: { sv: 'untuned' }, text: 'Zones de la Campagne, pas encore réglées pour la Run' }) : null,
  ];
  for (const e of head) if (e) out.append(e);
  const zrow = h('div', { cls: 'sva-zones', data: { sv: 'zones' } });
  zones.forEach((z, i) =>
    zrow.append(
      h('span', { cls: `sva-zone${z.done ? ' done' : ''}`, data: { sv: 'zone-chip', zone: z.id } }, h('i', { text: String(i + 1) }), h('b', { text: z.name }), z.done ? h('em', { text: '✓' }) : null),
    ),
  );
  out.append(zrow);
  // the timed bosses on the act's clock (Act I), else the zones' bosses in order
  const tl = h('div', { cls: 'sva-time', data: { sv: 'timeline' } });
  for (const b of bosses) tl.append(h('span', { cls: `sva-tchip${b.final ? ' final' : ''}` }, b.at !== null ? h('b', { text: mmss(b.at) }) : null, h('em', { text: b.name })));
  out.append(h('div', { cls: 'sva-sub', text: timed ? 'Boss à l’horloge de l’acte' : 'Boss, zone après zone' }), tl);
  const roster = h('p', { cls: 'sva-roster', data: { sv: 'roster' } }, h('b', { text: 'Monstres' }));
  for (const n of actRoster(act, d)) roster.append(h('span', { text: n }));
  out.append(roster);
  // what was done there, what its boss drops
  const cleared = zones.filter((z) => z.done).length;
  const facts = h('div', { cls: 'sva-facts', data: { sv: 'facts' } });
  const fact = (...parts: (string | null)[]) => facts.append(h('p', {}, ...parts.filter((p): p is string => !!p).map((t) => h('span', { text: t }))));
  fact('Boss vaincus', `${cleared} / ${zones.length}`, !why ? 'Départ au niveau' : null, !why ? String(entryLevel(act, d)) : null, !why ? 'sans compétence' : null);
  if (loot.quest && boss) fact(loot.claimed ? 'Trésor de quête déjà reçu :' : 'Première victoire : trésor de quête de', boss.name, timed ? '· coffres des mini-boss et des uniques' : null);
  if (rec.runs)
    fact(
      'Runs',
      `${rec.wins} / ${rec.runs}`,
      ...(rec.best !== undefined ? ['Meilleur temps', mmss(rec.best)] : []),
      ...(rec.surv !== undefined ? ['Plus longue survie', mmss(rec.surv)] : []),
      'Zone la plus lointaine',
      `${rec.deep} / ${zones.length}`,
    );
  out.append(facts);
  return out;
}

/**
 * Opens the act screen over the hub; `changed`: the hub to draw again (the act picked there becomes the hub's run). The button at the
 * foot starts the act looked at
 */
export function openActScreen(ctx: HudCtx, changed: () => void): void {
  ensureStyle();
  const g = ctx.game;
  const node = h('div', { cls: 'sv-screen', data: { svScreen: 'acts' } });
  const scr = ctx.screen.open(node);
  const listed = listedActs(g);
  if (!VIEWED.get(g)) VIEWED.set(g, pickedRun(g));
  const draw = () => {
    const v = VIEWED.get(g) ?? pickedRun(g);
    const list = h('div', { cls: 'sva-list', data: { sv: 'act-list' } });
    list.style.setProperty('--rows', String(listed.length));
    for (const { act, d } of listed) {
      const why = lockReason(g.character, act, d);
      const on = act === v.act && d === v.d;
      const row = h(
        'button',
        { cls: `sva-row${on ? ' on' : ''}${why ? ' locked' : ''}`, data: { sv: 'act-card', act: String(act), diff: String(d) } },
        h('b', { cls: 'sva-name', text: `Acte ${ACT_NUM[act - 1]}` }),
        h('span', { cls: 'sva-diff', text: DIFF[d] }),
        h('span', { cls: 'sva-state' }, ...stateParts(g, act, d).map((p) => h('span', { cls: p.cls, text: p.text }))),
      );
      row.type = 'button';
      row.setAttribute('aria-pressed', String(on));
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        VIEWED.set(g, { act, d });
        // an open act becomes the hub's run; a closed one is only looked at
        if (!why) {
          setPicked(g, { act, d });
          changed();
        }
        ctx.host.haptic('tap');
        draw();
      });
      list.append(row);
      if (on) list.append(detail(g, act, d));
    }
    const e = enterLines(g, v.act, v.d);
    const enter = button(
      e.title,
      () => {
        setPicked(g, v);
        scr.close();
        changed();
        void launchRun(ctx, v.act, v.d);
      },
      'primary sv-play sva-enter',
    );
    enter.dataset.sv = 'enter';
    enter.disabled = !e.ok;
    if (e.sub.length) enter.append(h('small', {}, ...e.sub.map((t) => h('span', { text: t }))));
    const back = button('Retour', () => scr.close(), 'sva-back');
    back.dataset.sv = 'acts-back';
    const keep = node.querySelector('.sva-list')?.scrollTop ?? 0;
    node.replaceChildren(h('div', { cls: 'sv-box sva' }, h('div', { cls: 'sva-head' }, h('h2', { cls: 'sv-title', text: 'Choisir l’acte' })), list, h('div', { cls: 'sva-foot' }, back, enter)));
    list.scrollTop = keep;
  };
  draw();
}
