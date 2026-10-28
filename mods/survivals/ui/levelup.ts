/**
 * Level-up cards (slot `levelUp`): the game pauses on three cards of the offer (`Game.currentOffer`, rule `skills.offer`), each with the
 * skill's icon, its name, its level and what it does: one tap learns the skill; "Reroll" draws again (free once per round, then gold),
 * "Keep the point" leaves it for later (spent in town, or on a later screen). A tap counts only when it starts on the card after the screen
 * opened and 0.5 s have passed (a finger still on the joystick or an accidental tap does nothing; lesson of Dragon Ball Survivors); the
 * cards are dimmed until then. Lot 285 (owner's test on his phone): larger cards with the skill's icon, the tap read from the pointer itself
 * (pointer down then up on the card) as well as from the click. Several levels at once: one screen after the other (the base's level-up
 * gate), the choices left told under the title. With the "automatic choice" setting, the brain answers.
 */
import type { LevelUpCtx } from '../../../src/mods/api';
import { REGISTRIES, skillIcon, skillLines, type Game } from '../../../src/mods/sdk';
import { brainOf, planOf, RUN_AVOID } from '../sim/autopilot';
import { banish, banishesLeftOf, OFFER_SIZE, rerollCost, WEIGHTS, weightOf } from '../sim/offer';
import { forgeLeft, useForge } from '../sim/forge';
import { setting, stateOf } from '../sim/state';
import { inFlow, isRunMode } from '../sim/runmode';
import { button, ensureStyle, h } from './dom';
import { directorOf } from './hud';

/** Lock of the cards when the screen opens (ms) */
export const CARD_LOCK_MS = 500;
/** Figures of a card at most (the skill's progression, current → next level, as the skill tree's: damage first) */
export const CARD_FIGURES = 2;

/**
 * What the point changes, in figures (lot 287, after the owner's comparison with another survivors game, whose cards give the next
 * level's damage): the first `CARD_FIGURES` lines of the skill tree's own table for this character (src/ui/skilltext.ts), "now → next"
 * (only the next one for a new skill)
 */
export function cardFigures(g: Game, id: string): { label: string; value: string }[] {
  const d = g.world?.player?.d;
  if (!d) return [];
  // lot 294: no mana in Act I's flow, the cost line left out (the next figure in its place)
  const noMana = !!g.world && inFlow(g.world);
  return skillLines(id, d)
    .filter((l) => !(noMana && /mana/i.test(l.label)))
    .slice(0, CARD_FIGURES)
    .map((l) => ({ label: l.label, value: l.now === '—' ? l.next : `${l.now} → ${l.next}` }));
}

/**
 * Where a skill leads (lot 288, after the owner's comparison: the other game's cards tell what a pick builds towards): the skills it
 * strengthens (synergies of the class's skills, the character's own first) and the ones it opens (prerequisite of, with their required
 * level), two of each at most
 */
export function cardLinks(g: Game, id: string): { boosts: { name: string; pct: number }[]; opens: { name: string; level: number }[] } {
  const c = g.character;
  const all = REGISTRIES.skills.all();
  const owned = (x: string) => (c.skills[x] ?? 0) > 0;
  const boosts = all
    .filter((s) => s.id !== id && s.synergies.some((x) => x.skill === id))
    .sort((a, b) => Number(owned(b.id)) - Number(owned(a.id)))
    .slice(0, 2)
    .map((s) => ({ name: s.name, pct: s.synergies.find((x) => x.skill === id)!.pct }));
  const opens = all
    .filter((s) => s.prereqs.includes(id) && !owned(s.id))
    .sort((a, b) => a.reqLvl - b.reqLvl)
    .slice(0, 2)
    .map((s) => ({ name: s.name, level: s.reqLvl }));
  return { boosts, opens };
}

/** Banishes left in the round, the run's extra ones of the training included (lot 308; null out of a round: no banishing in town) */
export function banishesLeft(g: Game): number | null {
  return directorOf(g) ? banishesLeftOf(g) : null;
}

/** Label of a card's kind */
function tagOf(g: Game, id: string): string {
  const w = weightOf(g, id);
  if (w === WEIGHTS.invested) return 'Déjà investie';
  if (w === WEIGHTS.synergy) return 'Synergie';
  if (w === WEIGHTS.passive) return 'Passive';
  return 'Nouvelle';
}

/** Rerolls of the round being played (its director's, saved with the round), or of the town */
export function rerollsOf(g: Game): { free: boolean; paid: number } {
  return directorOf(g)?.rerolls ?? stateOf(g).townRerolls;
}

/** Free rerolls left now: the round's own, then the run's extra ones of the training (lot 308, sim/forge.ts; none in town) */
export function freeRerolls(g: Game): number {
  const s = rerollsOf(g);
  return (s.free ? 1 : 0) + (directorOf(g) ? forgeLeft(g.character, 'reroll') : 0);
}

/** Gold cost of the next reroll (0: a free one) */
export function nextRerollCost(g: Game): number {
  const s = rerollsOf(g);
  return freeRerolls(g) > 0 ? 0 : rerollCost(s.paid, g.difficulty);
}

/** Rerolls the current offer, paying for it; false if it cannot be paid */
export function payReroll(g: Game): boolean {
  const s = rerollsOf(g);
  const cost = nextRerollCost(g);
  if (cost > g.character.gold) return false;
  if (!g.rerollOffer()) return false;
  // the round's free reroll first, then the training's of the run
  if (cost === 0) {
    if (s.free) s.free = false;
    else useForge(g.character, 'reroll');
  } else {
    g.character.gold -= cost;
    s.paid++;
  }
  return true;
}

/**
 * The cards answered by the character's build plan (setting "automatic choice", and the bots of the mode's tests), as a player following a
 * build does: the plan's next skill when it is offered; else the round's free reroll; else the point is kept while the plan is not done
 * (spent in town on the plan, in its order, where the skill tree is free); else the first card. Measured (lot 282): taking the first card
 * left a level-47 Barbarian without Whirlwind, stuck at Baal for 60 h of play; taking any skill of the plan, a level-66 one with 3 points
 * in Whirlwind and 20 in Sword Mastery, stuck in Hell's Act II.
 */
export function autoAnswer(g: Game): void {
  const c = g.character;
  const plan = planOf(g);
  const planLeft = () => plan.some(([id, target]) => (c.skills[id] ?? 0) < target);
  for (let n = 0; g.offers.length && n < 200; n++) {
    const ids = g.offers[0].ids;
    // the plan's next skill: its first entry not done that can be learned now (the order the bots of the base spend their points in)
    const want = plan.find(([id, target]) => (c.skills[id] ?? 0) < target && g.canLearn(id).ok)?.[0];
    if (want && ids.includes(want) && g.takeOffer(want)) continue;
    if (nextRerollCost(g) === 0 && payReroll(g)) continue;
    // lot 296 (the bow Amazon offered no Multiple Shot in 25 runs): in a run, the plan's skill not offered, a card off the plan is banished
    // for the zone (the cards drawn again, as a player does with the "Banish" button), while the zone's banishes last
    if (isRunMode(c) && want) {
      const off = ids.find((id) => !plan.some(([p]) => p === id));
      if (off && banish(g, off) && g.rerollOffer()) continue;
    }
    // Run mode (lot 289): no town in a run to spend a kept point on the plan: another skill of the plan offered, else the first card
    if (isRunMode(c)) {
      const inPlan = ids.find((id) => plan.some(([p, target]) => p === id && (c.skills[id] ?? 0) < target) && g.canLearn(id).ok);
      // lot 302: a skill to avoid (the Paladin's Sacrifice) only when no other card can be learned
      const avoid = RUN_AVOID[c.classId] ?? [];
      const other = ids.find((id) => !avoid.includes(id) && g.canLearn(id).ok) ?? ids.find((id) => g.canLearn(id).ok);
      if (g.takeOffer(inPlan ?? other ?? '')) continue;
    }
    if (!planLeft() && g.takeOffer(ids.find((id) => g.canLearn(id).ok) ?? '')) continue;
    g.takeOffer(null);
  }
}

/** Points kept with the "automatic choice" setting: spent on the build plan in town (where the skill tree is free) */
export function spendKeptInTown(g: Game): void {
  if (g.mode !== 'town' || g.character.skillPoints <= 0 || g.offers.length || setting(g, 'cards') !== 'auto') return;
  brainOf(g).spendSkillPoints();
}

export function levelUpCards(ctx: LevelUpCtx): void {
  const g = ctx.game;
  if (!g.currentOffer()) return;
  if (setting(g, 'cards') === 'auto') {
    autoAnswer(g);
    return;
  }
  ensureStyle();
  const node = h('div', { cls: 'sv-screen sv-locked', data: { svScreen: 'cards' } });
  const scr = ctx.screen.open(node);
  let done = false;
  let open = false;
  const unlocked = () => open;
  setTimeout(() => {
    open = true;
    node.classList.remove('sv-locked');
  }, CARD_LOCK_MS);
  // "Banish" pressed: the next card tapped leaves the cards for the rest of the round (lot 288)
  let banishing = false;
  const take = (id: string, card: HTMLElement) => {
    if (done || !unlocked()) return;
    if (banishing) {
      banishing = false;
      if (banish(g, id) && g.rerollOffer()) {
        ctx.host.haptic('tap');
        draw();
      } else ctx.host.haptic('fail');
      return;
    }
    if (g.takeOffer(id)) {
      done = true;
      card.classList.add('picked');
      ctx.host.haptic('tap');
      scr.close();
    } else ctx.host.haptic('fail');
  };
  const draw = () => {
    const o = g.currentOffer();
    if (!o) {
      scr.close();
      return;
    }
    const c = g.character;
    // lot 308: four cards with the training's opening hand (a row of four in landscape)
    const cards = h('div', { cls: o.ids.length > OFFER_SIZE ? 'sv-cards four' : 'sv-cards' });
    for (const [n, id] of o.ids.entries()) {
      const s = REGISTRIES.skills.get(id);
      if (!s) continue;
      const lvl = c.skills[id] ?? 0;
      const art = h('span', { cls: 'sv-art' }, skillIcon(id));
      const figures = cardFigures(g, id);
      const links = cardLinks(g, id);
      const card = h(
        'button',
        { cls: 'sv-card', data: { skill: id } },
        // the card's number: the key that takes it on a keyboard (1 to 3)
        h('span', { cls: 'sv-key', text: String(n + 1) }),
        art,
        h(
          'span',
          { cls: 'sv-text' },
          h('span', { cls: 'sv-tag', text: tagOf(g, id) }),
          h('span', { cls: 'sv-name', text: s.name }),
          h('span', { cls: 'sv-lvl', text: `Niveau ${lvl} → ${lvl + 1}` }),
          h('span', { cls: 'sv-desc', text: s.desc }),
          figures.length ? h('span', { cls: 'sv-figs' }, ...figures.map((f) => h('span', { cls: 'sv-fig' }, h('span', { text: f.label }), h('b', { text: f.value })))) : null,
          // each part on its own: the skills' names are texts of the game's dictionaries
          links.boosts.length
            ? h('span', { cls: 'sv-link sv-boosts' }, h('span', { text: 'Renforce :' }), ...links.boosts.flatMap((b) => [h('span', { text: b.name }), h('span', { text: `+${b.pct} %/pt` })]))
            : null,
          links.opens.length
            ? h('span', { cls: 'sv-link sv-opens' }, h('span', { text: 'Ouvre :' }), ...links.opens.flatMap((o) => [h('span', { text: o.name }), h('span', { text: `(niv. ${o.level})` })]))
            : null,
        ),
      );
      card.type = 'button';
      // the tap read from the pointer (down then up on this card, after the screen opened) and from the click (keyboard, mouse)
      let down = false;
      card.addEventListener('pointerdown', () => (down = true));
      card.addEventListener('pointerleave', () => (down = false));
      card.addEventListener('pointerup', () => {
        if (down) take(id, card);
        down = false;
      });
      card.addEventListener('click', () => take(id, card));
      cards.append(card);
    }
    const cost = nextRerollCost(g);
    // counters on the buttons (lot 288): the round's free reroll, then its price; the banishes left in the round
    const free = freeRerolls(g);
    const reroll = button(cost === 0 ? (free > 1 ? `Relancer · ${free} gratuites` : 'Relancer · 1 gratuite') : `Relancer · ${cost} or`, () => {
      if (!unlocked()) return;
      if (payReroll(g)) draw();
      else ctx.host.haptic('fail');
    });
    reroll.dataset.sv = 'reroll';
    reroll.disabled = cost > c.gold;
    const keep = button('Garder le point', () => {
      if (!unlocked() || done) return;
      done = true;
      g.takeOffer(null);
      scr.close();
    });
    keep.dataset.sv = 'keep';
    const left = banishesLeft(g);
    const ban =
      left === null
        ? null
        : button(`Bannir · ${left}`, () => {
            if (!unlocked() || done || left <= 0) return;
            banishing = !banishing;
            draw();
          });
    if (ban) {
      ban.dataset.sv = 'banish';
      ban.disabled = left === 0;
      ban.title = 'Touchez ensuite la carte à retirer des tirages jusqu’à la fin de la manche';
      ban.classList.toggle('on', banishing);
    }
    node.classList.toggle('sv-banishing', banishing);
    node.replaceChildren(
      h(
        'div',
        { cls: 'sv-box sv-cards-box' },
        h('h2', { cls: 'sv-title', text: `Niveau ${o.level} : choisissez une compétence` }),
        g.offers.length > 1 ? h('p', { cls: 'sv-sub sv-count', text: `Encore ${g.offers.length - 1} choix après celui-ci` }) : null,
        // lot 308: the training's opening hand told (sim/forge.ts: one card more at the run's first choice)
        o.ids.length > OFFER_SIZE ? h('p', { cls: 'sv-sub sv-count', data: { sv: 'opening-hand' }, text: 'Main d’ouverture : une carte de plus' }) : null,
        cards,
        banishing ? h('p', { cls: 'sv-sub sv-count', text: 'Touchez la carte à bannir' }) : null,
        h('div', { cls: 'sv-row' }, reroll, ban, keep),
      ),
    );
  };
  draw();
  // keys 1 to 3 take a card (or banish it after B), R rerolls, B banishes, Escape keeps the point (a keyboard; the screen's own buttons otherwise)
  const onKey = (e: KeyboardEvent) => {
    if (!node.isConnected || done) {
      window.removeEventListener('keydown', onKey);
      return;
    }
    const n = Number(e.key);
    const cards = [...node.querySelectorAll<HTMLElement>('.sv-card')];
    if (n >= 1 && n <= cards.length) {
      e.preventDefault();
      take(cards[n - 1].dataset.skill ?? '', cards[n - 1]);
    } else if (e.key === 'r' || e.key === 'R') node.querySelector<HTMLButtonElement>('[data-sv="reroll"]')?.click();
    else if (e.key === 'b' || e.key === 'B') node.querySelector<HTMLButtonElement>('[data-sv="banish"]')?.click();
    else if (e.key === 'Escape') node.querySelector<HTMLButtonElement>('[data-sv="keep"]')?.click();
  };
  window.addEventListener('keydown', onKey);
}
