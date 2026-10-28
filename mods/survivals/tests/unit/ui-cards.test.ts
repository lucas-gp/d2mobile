// @vitest-environment happy-dom
/**
 * Level-up cards and end-of-round screen (lot 276, S3; lot 285): three cards with the skill's icon, locked for 0.5 s, a tap (click, or
 * pointer down then up on the card) learns, "Keep the point", rerolls (free once a round, then gold), several levels one screen after
 * the other (the base's gate), automatic choice; the end-of-round screen takes the loot left in the arena, chains the next round.
 */
import { describe, expect, it, vi } from 'vitest';
import type { LevelUpGate } from '../../../../src/mods/ui';
import { activate } from './activate';

const noop = () => undefined;
const host = { message: noop, haptic: noop, itemSound: noop };

/** A screen host as the application's: mounts the node, counts the open screens, runs the level-up gate */
function screens() {
  const root = document.createElement('div');
  document.body.append(root);
  let gate: LevelUpGate;
  const screen = {
    open: (node: HTMLElement) => {
      root.append(node);
      gate.screenOpened();
      return {
        close: () => {
          if (!node.isConnected) return;
          node.remove();
          gate.screenClosed();
        },
      };
    },
  };
  return { root, screen, setGate: (g: LevelUpGate) => (gate = g) };
}

describe('Level-up cards', () => {
  it('three cards with icons, locked 0.5 s, a tap learns; several levels one after the other; keep the point', async () => {
    vi.useFakeTimers();
    const { G, U, P } = await activate();
    const g = new G.Game(undefined, 'sorceress');
    g.startRun('survivals:a1r1', 0, 1);
    const s = screens();
    const gate = new U.LevelUpGate((level) => {
      for (const f of U.contributions('levelUp')) f({ game: g, host, screen: s.screen, level });
    });
    s.setGate(gate);
    P.gainXp(g.world, P.xpToReach(4));
    for (const e of g.step(1)) if (e.t === 'levelUp') gate.push(e.level);
    expect(g.offers.length).toBe(3);
    let cards = [...s.root.querySelectorAll<HTMLButtonElement>('.sv-card')];
    expect(cards.length).toBe(3);
    // the skill's icon on each card
    expect(cards.every((c) => c.querySelector('.sv-art .icon'))).toBe(true);
    expect(s.root.textContent).toContain('Niveau 2 : choisissez une compétence');
    expect(s.root.textContent).toContain('Encore 2 choix après celui-ci');
    expect(s.root.querySelector('.sv-locked')).not.toBeNull();
    cards[0].click();
    expect(g.offers.length).toBe(3);
    vi.advanceTimersByTime(500);
    expect(s.root.querySelector('.sv-locked')).toBeNull();
    const id = cards[0].dataset.skill!;
    cards[0].click();
    expect(g.character.skills[id]).toBeGreaterThan(0);
    // the second level's screen: a tap read from the pointer (down then up on the card)
    expect(s.root.textContent).toContain('Niveau 3 : choisissez une compétence');
    vi.advanceTimersByTime(500);
    cards = [...s.root.querySelectorAll<HTMLButtonElement>('.sv-card')];
    const id2 = cards[1].dataset.skill!;
    const lvl2 = g.character.skills[id2] ?? 0;
    cards[1].dispatchEvent(new Event('pointerdown'));
    cards[1].dispatchEvent(new Event('pointerup'));
    expect(g.character.skills[id2]).toBe(lvl2 + 1);
    // a pointer up without its down on the card (a finger lifted from the joystick) does nothing
    expect(s.root.textContent).toContain('Niveau 4 : choisissez une compétence');
    vi.advanceTimersByTime(500);
    const c3 = s.root.querySelector<HTMLButtonElement>('.sv-card')!;
    c3.dispatchEvent(new Event('pointerup'));
    expect(g.offers.length).toBe(1);
    s.root.querySelector<HTMLButtonElement>('[data-sv="keep"]')!.click();
    expect(g.offers).toEqual([]);
    expect(g.character.skillPoints).toBe(1);
    expect(s.root.querySelector('.sv-card')).toBeNull();
    vi.useRealTimers();
    vi.resetModules();
  });

  it('reroll: free once a round, then paid in gold (refused without the gold)', async () => {
    vi.useFakeTimers();
    const { G, U, P } = await activate();
    const g = new G.Game(undefined, 'sorceress');
    g.character.name = 'Reroll';
    g.startRun('survivals:a1r1', 0, 1);
    const s = screens();
    const gate = new U.LevelUpGate((level) => {
      for (const f of U.contributions('levelUp')) f({ game: g, host, screen: s.screen, level });
    });
    s.setGate(gate);
    P.gainXp(g.world, P.xpToReach(2));
    for (const e of g.step(1)) if (e.t === 'levelUp') gate.push(e.level);
    const reroll = () => s.root.querySelector<HTMLButtonElement>('[data-sv="reroll"]')!;
    expect(reroll().textContent).toBe('Relancer · 1 gratuite');
    vi.advanceTimersByTime(500);
    reroll().click();
    expect(g.currentOffer()?.rerolls).toBe(1);
    expect(reroll().textContent).toBe('Relancer · 500 or');
    expect(reroll().disabled).toBe(true);
    g.character.gold = 600;
    const { payReroll } = await import('../../ui/levelup');
    expect(payReroll(g)).toBe(true);
    expect(g.character.gold).toBe(100);
    expect(payReroll(g)).toBe(false);
    vi.useRealTimers();
    vi.resetModules();
  });

  it('automatic choice: the brain takes the cards, no screen', async () => {
    const { G, U, P } = await activate();
    const g = new G.Game(undefined, 'sorceress');
    g.settings.mods = { survivals: { cards: 'auto' } };
    g.startRun('survivals:a1r1', 0, 1);
    P.gainXp(g.world, P.xpToReach(3));
    g.step(1);
    const s = screens();
    for (const f of U.contributions('levelUp')) f({ game: g, host, screen: s.screen, level: 2 });
    expect(g.offers).toEqual([]);
    expect(s.root.children.length).toBe(0);
    vi.resetModules();
  });
});

describe('End of a round', () => {
  it('takes the loot left on the ground (no list), then the next round at once, or back to the camp', async () => {
    const { G, U } = await activate();
    const SDK = await import('../../../../src/mods/sdk');
    const g = new G.Game(undefined, 'sorceress');
    g.character.level = 16;
    g.startRun('survivals:a1r1', 0, 1);
    for (let i = 0; i < 25 * 481; i++) {
      g.step(1);
      g.world.player.hp = g.world.player.hpMax;
    }
    const boss = g.world.monsters.find((m) => m.name === 'Corpsefire')!;
    g.world.killMonster(boss, g.world.player);
    g.step(1);
    // a magic ring far from the character, left on the ground: worn at the end (the ring slots are empty)
    const ring = SDK.generateItem(new SDK.Rng('ring'), 'ring', 10, { forceQuality: 'magic' });
    const p = g.world.player;
    g.world.items.push({ id: g.world.newId(), item: ring, x: p.x + 20, y: p.y, dropTick: g.world.tick, show: 1 });
    const s = screens();
    s.setGate(new U.LevelUpGate(noop));
    for (const f of U.contributions('run.complete')) f({ game: g, host, screen: s.screen, summary: { ...g.lastRunSummary! } });
    expect(s.root.textContent).toContain('Lande sanglante : point de reprise atteint');
    expect(g.world.items.filter((x) => x.show > 0)).toEqual([]);
    expect(g.character.equipment.ring1?.uid).toBe(ring.uid);
    expect(s.root.textContent).toContain('Équipé');
    expect(s.root.querySelector('.sv-loot')).toBeNull();
    const next = s.root.querySelector<HTMLButtonElement>('[data-sv="next"]')!;
    expect(next.textContent).toBe('Manche suivante : Plaines glacées');
    next.click();
    expect(g.mode).toBe('run');
    expect(g.runDef?.id).toBe('survivals:a1r2');
    expect(s.root.querySelector('.sv-screen')).toBeNull();
    vi.resetModules();
  }, 60_000);
});
