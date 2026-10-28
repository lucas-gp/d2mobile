// @vitest-environment happy-dom
/**
 * Lot 306: the Run's act screen (ui/acts.ts) and a thinner field. The screen lists the acts (Normal's five, a further difficulty's Act
 * I), unfolds the act looked at with its zones, its monsters and its timed bosses read from the director's flow (Act I: each zone's
 * mini-boss `minibossBefore` s before its end on the act's clock, Andariel `bossAt` into the lair, the act boss last and gold), a closed
 * act shows its condition and bosses but cannot start, the button at the foot starts the run; the field's first three minutes about the
 * other game's (lot 296's study): about 5 alive at 0:10, 10 at 0:30, 15 at 1:00, 40 at 2:00, 60 at 3:00, full by 6:00.
 */
import { describe, expect, it } from 'vitest';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const A = await import('../../ui/acts');
  const AI = await import('../../sim/actinfo');
  const RM = await import('../../sim/runmode');
  const ST = await import('../../sim/state');
  const CP = await import('../../sim/checkpoints');
  const create = () => {
    const g = new env.G.Game(undefined, 'sorceress');
    g.character.name = 'Lot 306';
    for (const f of env.U.contributions('create.character')) f({ game: g });
    ST.stateOf(g).autoStart = false;
    return g;
  };
  const host = { message() {}, haptic() {}, itemSound() {}, openPanel() {} };
  const open = (g: unknown) => {
    document.body.replaceChildren();
    const ctx = { game: g, host, screen: { open: (n: HTMLElement) => (document.body.append(n), { close: () => n.remove() }) } };
    A.openActScreen(ctx as never, () => undefined);
    return (s: string) => document.body.querySelector<HTMLElement>(s);
  };
  return { ...env, A, AI, RM, CP, create, open };
}

describe('Survivals: the act screen and a thinner field (lot 306)', () => {
  it('Act I’s timed bosses are the director’s own times on the act’s clock, Andariel last', async () => {
    const { AI, RM } = await setup();
    const bosses = AI.actBosses(1, 0);
    expect(bosses.map((b) => b.name)).toEqual(['Corpsefire', 'Blood Raven', 'Rakanishu', 'The Countess', 'Andariel']);
    // each zone's mini-boss `minibossBefore` s before its end, the zones chained with `clockGap` s between them; Andariel `bossAt` in
    let t0 = 0;
    RM.FLOW.zones.forEach(([, secs], i) => {
      expect(bosses[i].at).toBe(i < 4 ? t0 + secs - RM.FLOW.minibossBefore : t0 + RM.FLOW.bossAt);
      t0 += secs + RM.FLOW.clockGap;
    });
    expect(bosses.filter((b) => b.final).map((b) => b.name)).toEqual(['Andariel']);
    // the monsters of the five zones' pools (Levels.txt), no boss among them
    const roster = AI.actRoster(1, 0);
    expect(roster).toContain('Zombie');
    expect(roster.length).toBeGreaterThan(8);
    expect(roster).not.toContain('Andariel');
    // Act II: the Campaign's seven zones, their bosses untimed, Duriel last; Act V's Ancients together, Baal the act's boss
    const a2 = AI.actBosses(2, 0);
    expect(a2.every((b) => b.at === null)).toBe(true);
    expect(a2.at(-1)).toMatchObject({ name: 'Duriel', final: true });
    expect(
      AI.actBosses(5, 0)
        .filter((b) => b.final)
        .map((b) => b.name),
    ).toEqual(['Baal']);
    expect(AI.actTimed(2, 0)).toBe(false);
  });

  it('the screen: Act I unfolded, the closed acts greyed and previewed, the button starts the run', async () => {
    const { RM, CP, create, open } = await setup();
    const g = create();
    let q = open(g);
    const rows = [...document.body.querySelectorAll<HTMLElement>('[data-sv="act-card"]')];
    // Normal's five acts, then Nightmare's and Hell's Act I
    expect(rows.map((r) => `${r.dataset.act}:${r.dataset.diff}`)).toEqual(['1:0', '2:0', '3:0', '4:0', '5:0', '1:1', '1:2']);
    expect(rows.filter((r) => r.classList.contains('locked')).length).toBe(6);
    expect(q('[data-sv="act-detail"]')?.dataset.act).toBe('1');
    expect(document.body.querySelectorAll('[data-sv="act-detail"] [data-sv="zone-chip"]').length).toBe(5);
    const chips = [...document.body.querySelectorAll<HTMLElement>('[data-sv="timeline"] > span')];
    expect(chips.at(-1)?.classList.contains('final')).toBe(true);
    expect(chips.at(-1)?.textContent).toBe('12:16Andariel');
    const enter = q('[data-sv="enter"]') as HTMLButtonElement;
    expect(enter.disabled).toBe(false);
    expect(enter.textContent).toContain('Andariel');
    // a closed act: its condition and bosses shown, the button disabled
    q('[data-sv="act-card"][data-act="3"]')!.click();
    expect(q('[data-sv="act-detail"]')?.dataset.act).toBe('3');
    expect(q('[data-sv="why"]')?.textContent).toMatch(/Duriel/);
    expect(q('[data-sv="untuned"]')).not.toBeNull();
    expect(q('[data-sv="act-detail"] [data-sv="timeline"]')?.textContent).toMatch(/Méphisto/);
    expect((q('[data-sv="enter"]') as HTMLButtonElement).disabled).toBe(true);
    // a zone cleared is ticked; the records of the save shown
    CP.markCheckpoint(g.character, 0, 'a1r1');
    g.character.progression.milestones[RM.recKey(0, 1, 'runs')] = 3;
    g.character.progression.milestones[RM.recKey(0, 1, 'surv')] = 200;
    q = open(g);
    q('[data-sv="act-card"][data-act="1"]')!.click();
    expect(q('[data-sv="zone-chip"][data-zone="a1r1"]')?.classList.contains('done')).toBe(true);
    expect(q('[data-sv="facts"]')?.textContent).toMatch(/1 \/ 5/);
    expect(q('[data-sv="act-card"][data-act="1"]')?.textContent).toMatch(/3:20/);
    // the button starts Act I's run
    q('[data-sv="enter"]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(g.runDef?.id).toBe('survivals:a1r1');
    expect(document.body.querySelector('[data-sv-screen="acts"]')).toBeNull();
  });

  it('the field’s first three minutes thinner (the other game’s), full by 6:00 as before', async () => {
    const { RM } = await setup();
    const alive = (t: number) => RM.flowDensity(t);
    expect(alive(10)).toBeLessThanOrEqual(7);
    expect(alive(30)).toBeGreaterThanOrEqual(8);
    expect(alive(30)).toBeLessThanOrEqual(11);
    expect(alive(60)).toBeGreaterThanOrEqual(13);
    expect(alive(60)).toBeLessThanOrEqual(17);
    expect(alive(120)).toBeGreaterThanOrEqual(35);
    // lot 309: the other game's field on the screen at 2:00-3:00 (50, 67 in a phone's window held upright)
    expect(alive(180)).toBeLessThanOrEqual(75);
    // about the density setting's 90 by 6:00 (the late game's kill rate kept)
    expect(alive(360)).toBeGreaterThanOrEqual(89);
  });
});
