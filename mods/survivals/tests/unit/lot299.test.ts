// @vitest-environment happy-dom
/**
 * Lot 299, the owner's returns: the run-end screen's actions in a bar always at the panel's foot; the characters, their saves and their
 * stash apart by mode (`d2+survivals`, `pd2+survivals`), an unreadable Survivals ruleset read as `d2+survivals`; a Run character's card
 * telling its progress instead of its level (slot `charselect.card`).
 */
import { describe, expect, it } from 'vitest';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const RM = await import('../../sim/runmode');
  const RH = await import('../../ui/runhub');
  return { ...env, RM, RH };
}

const card = (U: Awaited<ReturnType<typeof setup>>['U'], milestones: Record<string, number>) =>
  U.contributions('charselect.card').map((f) => f({ ruleset: 'd2+survivals', classId: 'sorceress', className: 'Sorcière', level: 10, difficulty: 0, milestones }))[0];

describe('Survivals lot 299: the character card', () => {
  it('a Run character: its farthest act and zone, its runs and victories, its record; never the level', async () => {
    const { U, RM } = await setup();
    const k = RM.recKey;
    expect(card(U, { [RM.MODE_KEY]: 1 })).toEqual(['Sorcière · Run', 'Aucune run pour l’instant']);
    const m = { [RM.MODE_KEY]: 1, [k(0, 1, 'runs')]: 7, [k(0, 1, 'wins')]: 2, [k(0, 1, 'deep')]: 5, [k(0, 1, 'best')]: 702, [k(1, 1, 'runs')]: 3, [k(1, 1, 'deep')]: 2, [k(1, 1, 'surv')]: 130 };
    const lines = card(U, m)!;
    expect(lines[0]).toBe('Sorcière · Run');
    // the highest difficulty played (Nightmare), its zone; the runs and victories of every act; its longest run (no victory there)
    expect(lines[1]).toBe('Acte I — Cauchemar · zone 2 / 5');
    expect(lines[2]).toBe('Runs 10 · victoires 2 · survie 2:10');
    expect(lines.join(' ')).not.toMatch(/Niveau|10 Sorcière/);
    delete m[k(1, 1, 'runs')];
    expect(card(U, m)![2]).toBe('Runs 7 · victoires 2 · record 11:42');
  });

  it('a Campaign character (and one made before lot 289) keeps the base’s level and difficulty', async () => {
    const { U, RM } = await setup();
    expect(card(U, { [RM.MODE_KEY]: 2 })).toBeNull();
    expect(card(U, {})).toBeNull();
  });
});

describe('Survivals lot 299: the modes apart', () => {
  it('the saves: a character of `survivals` alone is listed and loaded as `d2+survivals`; the stash is the mode’s own', async () => {
    const P = await import('../../../../src/platform/platform');
    const S = await import('../../../../src/sim/save');
    const { G } = await setup();
    localStorage.clear();
    const g = new G.Game(undefined, 'sorceress');
    const save = { ...g.toSave(), ruleset: 'survivals' };
    localStorage.setItem('d2m.save.x', S.serialize(save));
    expect(P.SaveStore.list().find((c) => c.slot === 'd2m.save.x')?.ruleset).toBe('d2+survivals');
    expect(P.SaveStore.load('d2m.save.x')?.ruleset).toBe('d2+survivals');
    expect(P.sharedKeyOf('d2+survivals')).not.toBe(P.sharedKeyOf('d2'));
    expect(P.sharedKeyOf('pd2+survivals')).not.toBe(P.sharedKeyOf('d2+survivals'));
    expect(P.sharedKeyOf('pd2+survivals')).not.toBe(P.sharedKeyOf('pd2'));
  });
});

describe('Survivals lot 299: the run-end screen', () => {
  it('the title, the body, then the three actions in a bar at the panel’s foot', async () => {
    const { RH, G } = await setup();
    const g = new G.Game(undefined, 'sorceress');
    const root = document.createElement('div');
    document.body.append(root);
    const ctx = { game: g, screen: { open: (n: HTMLElement) => (root.append(n), { close: () => n.remove() }) }, host: { haptic: () => undefined } } as never;
    RH.runEndScreen(ctx, {
      outcome: 'death',
      act: 1,
      d: 0,
      zone: 'Plaines glacées',
      zoneIndex: 2,
      zones: 5,
      sec: 150,
      level: 7,
      kills: 187,
      gold: 91,
      items: 14,
      itemNames: Array.from({ length: 14 }, (_, i) => `Objet ${i}`),
      killer: { monster: 'Brute', kind: 'blow', amount: 31, elem: 'physical' },
      burst: 312,
      records: ['kills', 'deep'],
      nextAct: null,
      nextDifficulty: false,
      survival: 180,
      purse: 400,
      pages: 3,
    });
    const box = root.querySelector('.sv-end')!;
    const kids = [...box.children];
    expect(kids.map((k) => k.className)).toEqual(['sv-title', 'sv-end-body', 'sv-row sv-end-acts']);
    const acts = kids[2] as HTMLElement;
    // lot 305: the replay (and the next act after a victory) first, then the shop and the hub
    expect([...acts.querySelectorAll('button')].map((b) => b.dataset.sv)).toEqual(['again', 'visit-shop', 'hub']);
    // everything else in the body (which scrolls on its own if needed)
    const body = kids[1] as HTMLElement;
    for (const sv of ['killer', 'burst', 'gold-flow', 'new-records', 'end-pages', 'reset']) expect(body.querySelector(`[data-sv="${sv}"]`), sv).not.toBeNull();
    expect(body.textContent).toContain('Zone atteinte2 / 5');
    root.remove();
  });
});
