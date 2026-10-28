// @vitest-environment happy-dom
/**
 * Lot 288 (the owner's comparison with another survivors game, a study of its screens): the attack button hidden while the character
 * attacks on its own, the skills too in automatic (lot 290: in every control, a preview of the skills taken instead); the round lost names its killer and the hit (in the round, then on the hub); the
 * cards tell what a skill strengthens and opens, count the rerolls and banishes (a banished skill leaves the draws for the round, kept
 * with the round's save); the round's banner; the named elites' immunities.
 */
import { describe, expect, it, vi } from 'vitest';
import { activate } from './activate';

async function inRound(level = 10) {
  const env = await activate();
  const g = new env.G.Game(undefined, 'sorceress');
  g.character.level = level;
  g.character.xp = env.P.xpToReach(level) + 10;
  g.startRun('survivals:a1r1', 0, 5);
  return { ...env, g };
}

describe('Survivals: controls hidden (lots 288, 290)', () => {
  it('no attack nor skill button in any control (lot 290: everything automatic), a saved manual control plays the semi-automatic', async () => {
    const { g } = await inRound();
    const { hudHidden, ROUND_HIDDEN, AUTO_HIDDEN } = await import('../../ui/hud');
    const { setting } = await import('../../sim/state');
    expect(hudHidden(g)).toBe(AUTO_HIDDEN);
    expect(AUTO_HIDDEN).toEqual(expect.arrayContaining(['attack', 'bound-skills']));
    expect(ROUND_HIDDEN).toContain('death');
    g.settings.mods = { survivals: { control: 'auto' } };
    expect(hudHidden(g)).toBe(AUTO_HIDDEN);
    g.settings.mods = { survivals: { control: 'manual' } };
    expect(hudHidden(g)).toBe(AUTO_HIDDEN);
    expect(setting(g, 'control')).toBe('semi');
    const { HUD_PARTS } = await import('../../../../src/ui/hud-parts');
    for (const k of ['attack', 'bound-skills', 'death']) expect(HUD_PARTS[k]).toBeTruthy();
  });

  it('semi-automatic: the skill taken is cast on its own (no button), the preview shows it and its refresh after the cast', async () => {
    const { g } = await inRound();
    const c = g.character;
    c.skills = { fire_bolt: 3 };
    c.skillPoints = 0;
    g.world.refreshPlayer();
    const { skillStrip, stripSkills, refreshShare } = await import('../../ui/skillstrip');
    expect(stripSkills(g)).toEqual(['fire_bolt']);
    const strip = skillStrip();
    strip.update(g);
    expect(strip.el.getAttribute('aria-hidden')).toBe('true');
    expect(strip.el.querySelectorAll('button').length).toBe(0);
    expect([...strip.el.querySelectorAll<HTMLElement>('[data-skill]')].map((x) => x.dataset.skill)).toEqual(['fire_bolt']);
    // a monster in reach: the semi-automatic control casts the skill by itself
    const w = g.world;
    const p = w.player;
    let cast = false;
    const off = g.onEvent((e) => {
      if (e.t === 'cast' && e.skill === 'fire_bolt') cast = true;
    });
    for (let t = 0; t < 25 * 20 && !cast; t++) {
      p.hp = p.hpMax;
      p.mana = p.manaMax;
      g.step(1);
    }
    off();
    expect(cast).toBe(true);
    strip.update(g);
    const cell = strip.el.querySelector<HTMLElement>('[data-skill="fire_bolt"]')!;
    expect(cell.classList.contains('cooling')).toBe(true);
    for (let t = 0; t < 25; t++) g.step(1);
    expect(refreshShare(0, 0, 15)).toBe(1);
    expect(refreshShare(10, 0, 13)).toBeCloseTo(0.2);
    expect(refreshShare(undefined, 0, 0)).toBe(1);
  }, 60_000);
});

describe('Survivals: the round lost (lot 288)', () => {
  it('names the last hit taken: monster, damage, element, blow or spell; time, level, kills; shown on the hub until the next round', async () => {
    const { g } = await inRound();
    const { stateOf } = await import('../../sim/state');
    const { killerParts, noteEvent } = await import('../../sim/lost');
    g.step(25 * 5);
    noteEvent(g, { t: 'playerHurt', amount: 18.6, elem: 'phys', pctOfMax: 0.3, src: 'fallen1:coup' });
    g.world.killPlayer();
    g.step(1);
    const l = stateOf(g).lastDeath!;
    expect(l.round).toBe('a1r1');
    expect(l.level).toBe(10);
    expect(l.sec).toBeGreaterThanOrEqual(4);
    expect(l.killer).toMatchObject({ monster: 'fallen1', amount: 19, elem: 'phys', kind: 'coup' });
    const parts = killerParts(l);
    expect(parts[0]).toBe('Tué par');
    expect(parts).toContain('19');
    expect(parts).toContain('dégâts physiques');
    expect(killerParts({ ...l, killer: null })).toEqual(['Tué en manche']);
    // the round's own notice in place of the base's
    const { hudWidget } = await import('../../ui/hud');
    const root = document.createElement('div');
    const ctx = { game: g, host: { haptic: () => undefined, openPanel: () => undefined }, screen: { open: () => ({ close: () => undefined }) } };
    const w = hudWidget(ctx as never);
    root.append(w.el);
    w.update!(g);
    expect(root.querySelector('[data-sv="death"]')!.textContent).toContain('Manche perdue');
    // back in town: the hub tells it
    for (let i = 0; i < 25 * 4; i++) g.step(1);
    expect(g.mode).toBe('town');
    w.update!(g);
    expect(root.querySelector('[data-sv="lost"]')!.textContent).toContain('Manche perdue : Lande sanglante');
    expect(root.querySelector('[data-sv="lost"]')!.textContent).toContain('Tué par');
    // a new round clears it
    g.startRun('survivals:a1r1', 0, 6);
    stateOf(g);
    expect(stateOf(g).lastDeath).toBeNull();
    vi.resetModules();
  });
});

describe('Survivals: cards (lot 288)', () => {
  it('what a skill strengthens and opens; banishing leaves the draws for the round (2 a round, saved with the round)', async () => {
    const { g } = await inRound(12);
    // the round's director is made at its first step
    g.step(1);
    g.character.skillPoints = 5;
    const { cardLinks, banishesLeft } = await import('../../ui/levelup');
    const { banish, BANISHES, candidates, drawOffer } = await import('../../sim/offer');
    const fb = cardLinks(g, 'fire_bolt');
    expect(fb.boosts.map((b) => b.name).length).toBeGreaterThan(0);
    expect(fb.opens.length).toBeGreaterThan(0);
    expect(fb.opens.every((o) => o.level > 0)).toBe(true);
    expect(banishesLeft(g)).toBe(BANISHES);
    const pool = candidates(g);
    expect(pool.length).toBeGreaterThan(2);
    expect(banish(g, pool[0])).toBe(true);
    expect(banish(g, pool[0])).toBe(false);
    expect(candidates(g)).not.toContain(pool[0]);
    for (let r = 0; r < 20; r++) expect(drawOffer(g, 13, r)).not.toContain(pool[0]);
    expect(banish(g, pool[1])).toBe(true);
    expect(banish(g, pool[2])).toBe(false);
    expect(banishesLeft(g)).toBe(0);
    // kept with the round's save, given back on resume
    const d = g.world.run!.director as unknown as { snapshot(): unknown; restore(s: unknown): void; banished: string[] };
    const snap = JSON.parse(JSON.stringify(d.snapshot()));
    expect(snap.banished).toEqual([pool[0], pool[1]]);
    d.banished = [];
    d.restore(snap);
    expect(d.banished).toEqual([pool[0], pool[1]]);
    // out of a round: no banishing
    g.enterTown();
    expect(banishesLeft(g)).toBeNull();
    expect(banish(g, pool[3] ?? pool[0])).toBe(false);
    vi.resetModules();
  });
});

describe('Survivals: banners and immunities (lot 288)', () => {
  it("the round's banner at its start; a named elite's immunities", async () => {
    const env = await activate();
    const g = new env.G.Game(undefined, 'sorceress');
    g.startRun('survivals:a1r1', 0, 7);
    const texts: string[] = [];
    for (let i = 0; i < 3; i++) for (const e of g.step(1)) if (e.t === 'mapEvent') texts.push(e.text);
    expect(texts).toContain('Acte 1 — Lande sanglante');
    const { immunities } = await import('../../ui/hud');
    expect(immunities({ res: { fire: 100, cold: 40, light: 120 } })).toEqual(['fire', 'light']);
    expect(immunities({ res: {} })).toEqual([]);
    vi.resetModules();
  });
});
