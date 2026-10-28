// @vitest-environment happy-dom
/**
 * Character selection without the Diablo II art: choice of the mode at launch (shown only when there is a choice), list of the session
 * mode's characters only, characters of a missing mod greyed and kept, creation in the session's mode, mod buttons; remembered mode and
 * creation after a reload.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { characterScreen, type ScreenMods } from '../../src/ui/charselect';
import { charsForMode, kindOf, launchModes, modeKinds, modeName, showKindChoice, showModeChoice, type CreateOptions } from '../../src/ui/charselect-core';
import { listedChars, rulesetLabel } from '../../src/ui/charselect-mods';
import { bootRuleset, launchMode, pendingCreate, SaveStore, type CharSummary } from '../../src/platform/platform';
import { defaultRuleset, rulesetProblem } from '../../src/mods/activate';

const OPTS: CreateOptions = {
  contents: [
    { id: 'ov', name: 'Refonte', description: 'Une refonte.' },
    { id: 'd2', name: 'Diablo II', description: 'Le jeu de base.' },
  ],
  modes: [{ id: 'surv', name: 'Survie', description: 'Un choix à chaque niveau.', rulesets: ['d2'] }],
};
const ONE: CreateOptions = { contents: [OPTS.contents[0]], modes: [] };

const char = (slot: string, ruleset: string): CharSummary => ({ slot, name: slot, classId: 'sorceress', level: 3, difficulty: 0, savedAt: 1, ruleset });
const problem = (r: string) => (r.split('+').some((x) => x === 'absent' || x === 'pd3') ? 'Ce personnage demande le mod « absent », absent de cette version' : null);

function mods(over: Partial<ScreenMods> = {}): ScreenMods {
  return { options: OPTS, problem, menu: [], mode: 'ov', ...over };
}

const q = <T extends HTMLElement = HTMLElement>(root: HTMLElement, sel: string): T => {
  const e = root.querySelector<T>(sel);
  if (!e) throw new Error(`absent : ${sel}`);
  return e;
};
const byText = (root: HTMLElement, text: RegExp): HTMLButtonElement => {
  const b = [...root.querySelectorAll<HTMLButtonElement>('button')].find((x) => text.test(x.textContent ?? ''));
  if (!b) throw new Error(`bouton absent : ${text}`);
  return b;
};
const mount = (): HTMLElement => {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
};

describe('Modes at launch (logic shared by both screens)', () => {
  it('each playable content, then each game mode on the contents it accepts; a choice only with more than one', () => {
    expect(launchModes(OPTS)).toEqual([
      { id: 'ov', name: 'Refonte', description: 'Une refonte.' },
      { id: 'd2', name: 'Diablo II', description: 'Le jeu de base.' },
      { id: 'd2+surv', name: 'Diablo II — Survie', description: 'Le jeu de base. Un choix à chaque niveau.' },
    ]);
    expect(showModeChoice(launchModes(OPTS))).toBe(true);
    expect(showModeChoice(launchModes(ONE))).toBe(false);
    expect(showModeChoice(launchModes({ contents: [OPTS.contents[0]], modes: [{ id: 'm', name: 'M' }] }))).toBe(true);
    expect(modeName(launchModes(OPTS), 'd2+surv')).toBe('Diablo II — Survie');
    expect(modeName(launchModes(OPTS), 'pd3')).toBe('pd3');
    expect(rulesetLabel(OPTS, 'd2+surv')).toBe('Diablo II — Survie');
  });

  it('lot 318: the same modes grouped by kind (Normal, then each game mode), the same ids; a kind choice only with more than one', () => {
    const o: CreateOptions = {
      contents: [
        { id: 'pd2', name: 'Project Diablo 2', tagline: 'Saison 13' },
        { id: 'd2', name: 'Diablo II (original)' },
      ],
      modes: [{ id: 'survivals', name: 'Survivals', tagline: 'Des runs', rulesets: ['d2', 'pd2'] }],
    };
    const kinds = modeKinds(o);
    expect(kinds).toEqual([
      {
        id: 'normal',
        name: 'Normal',
        tagline: 'Campagne et fin de jeu',
        modes: [
          { id: 'pd2', name: 'Project Diablo 2', tagline: 'Saison 13' },
          { id: 'd2', name: 'Diablo II (original)' },
        ],
      },
      {
        id: 'survivals',
        name: 'Survivals',
        tagline: 'Des runs',
        modes: [
          { id: 'pd2+survivals', name: 'Project Diablo 2', tagline: 'Saison 13' },
          { id: 'd2+survivals', name: 'Diablo II (original)' },
        ],
      },
    ]);
    // no Diablo II files: no Campaign, Normal is the endgame only
    expect(modeKinds({ ...o, campaign: false })[0].tagline).toBe('Fin de jeu');
    expect(modeKinds({ ...o, campaign: true })[0].tagline).toBe('Campagne et fin de jeu');
    // every launch mode, once, in the same order
    expect(kinds.flatMap((k) => k.modes.map((m) => m.id))).toEqual(launchModes(o).map((m) => m.id));
    expect(kinds.flatMap((k) => k.modes.map((m) => kindOf(m.id)))).toEqual(['normal', 'normal', 'survivals', 'survivals']);
    expect(showKindChoice(kinds)).toBe(true);
    expect(showKindChoice(modeKinds({ ...o, modes: [] }))).toBe(false);
    // a game mode on no content offered: no kind for it
    expect(modeKinds({ ...o, modes: [{ id: 'x', name: 'X', rulesets: ['pd3'] }] }).map((k) => k.id)).toEqual(['normal']);
  });

  it('a mode lists only its own characters; one missing its mod is greyed in the mode of its content, else the first; one mode: all', () => {
    const modes = launchModes(OPTS);
    const list = [char('a', 'ov'), char('b', 'd2'), char('c', 'd2+surv'), char('d', 'd2+absent'), char('e', 'pd3'), char('f', 'ov+absent')];
    const ids = (m: string) => charsForMode(list, m, modes, problem).map((c) => c.slot);
    expect(ids('ov')).toEqual(['a', 'e', 'f']);
    expect(ids('d2')).toEqual(['b', 'd']);
    expect(ids('d2+surv')).toEqual(['c']);
    // every character appears in exactly one mode: none is hidden
    expect(['ov', 'd2', 'd2+surv'].flatMap(ids).sort()).toEqual(list.map((c) => c.slot));
    expect(charsForMode(list, 'ov', launchModes(ONE), problem)).toHaveLength(list.length);
    expect(listedChars(list, mods({ mode: 'd2' })).map((c) => c.slot)).toEqual(['b', 'd']);
    // without a session mode (tools), the first mode
    expect(listedChars(list, mods({ mode: undefined })).map((c) => c.slot)).toEqual(['a', 'e', 'f']);
  });
});

describe('Classic screen (without the Diablo II art)', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
  });

  it('the mode is asked first (lot 318: the kind, then the game, with Back); its list holds only its characters; creation in that mode', async () => {
    const root = mount();
    const switchMode = vi.fn(() => true);
    const list = [char('pd', 'ov'), char('van', 'd2')];
    const p = characterScreen(root, () => list, vi.fn(), mods({ mode: 'd2', switchMode }));
    const kinds = [...root.querySelectorAll<HTMLButtonElement>('[data-act="modetype"]')];
    expect(kinds.map((b) => b.dataset.type)).toEqual(['normal', 'surv']);
    expect(root.querySelector('[data-act="mode"]')).toBeNull();
    // the remembered mode's kind is marked; characters per kind
    expect(q(root, '[data-type="normal"]').classList.contains('cur')).toBe(true);
    expect(q(root, '[data-type="normal"]').textContent).toContain('2 personnages');
    expect(q(root, '[data-type="surv"]').textContent).toContain('Aucun personnage');
    q(root, '[data-type="normal"]').click();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-act="mode"]')];
    expect(buttons.map((b) => b.dataset.mode)).toEqual(['ov', 'd2']);
    expect(root.textContent).toContain('Normal — choisissez le jeu');
    // Back, then Escape, return to the kinds
    q(root, '[data-act="modeback"]').click();
    expect(root.querySelector('[data-act="mode"]')).toBeNull();
    q(root, '[data-type="normal"]').click();
    q(root, '[data-mode="ov"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.querySelector('[data-act="modetype"]')).toBeTruthy();
    q(root, '[data-type="normal"]').click();
    // the session's (remembered) mode is marked; character count per mode
    expect(q(root, '[data-mode="d2"]').classList.contains('cur')).toBe(true);
    expect(q(root, '[data-mode="ov"]').textContent).toContain('1 personnage');
    // lot 286: no "Import a D2 character" for now (flag), the Discord server in a new tab
    expect(root.textContent).not.toContain('Importer un personnage D2');
    const discord = q<HTMLAnchorElement>(root, '[data-act="discord"]');
    expect([discord.getAttribute('href'), discord.target, discord.rel]).toEqual(['https://discord.gg/j6w8YVauR', '_blank', 'noopener']);
    q(root, '[data-mode="d2"]').click();
    expect(switchMode).toHaveBeenCalledWith('d2');
    expect([...root.querySelectorAll<HTMLElement>('.sel-slot')].map((c) => c.dataset.slot)).toEqual(['van']);
    // back to the choice of mode
    q(root, '[data-act="exit"]').click();
    expect(root.querySelector('[data-act="modetype"]')).toBeTruthy();
    q(root, '[data-type="normal"]').click();
    q(root, '[data-mode="d2"]').click();
    q(root, '[data-act="create"]').click();
    expect(root.querySelector('[data-act="ruleset"]')).toBeNull();
    q<HTMLInputElement>(root, 'input').value = 'Kashya';
    byText(root, /^Créer$/).click();
    expect(await p).toEqual({ create: { classId: 'sorceress', name: 'Kashya', ruleset: 'd2' } });
  });

  it('another mode reloads the page: the screen stays; after the reload the list opens directly', () => {
    const root = mount();
    void characterScreen(root, () => [char('pd', 'ov')], vi.fn(), mods({ mode: 'd2', switchMode: () => false }));
    q(root, '[data-type="normal"]').click();
    q(root, '[data-mode="ov"]').click();
    expect(root.querySelector('.sel-slot')).toBeNull();
    const root2 = mount();
    void characterScreen(root2, () => [char('pd', 'ov')], vi.fn(), mods({ mode: 'ov', openList: true }));
    expect(root2.querySelector('[data-act="mode"]')).toBeNull();
    expect(q(root2, '.sel-slot').dataset.slot).toBe('pd');
  });

  it('lot 318: a kind played on one game only is picked straight away (its full ruleset id)', () => {
    const root = mount();
    const switchMode = vi.fn(() => false);
    void characterScreen(root, () => [], vi.fn(), mods({ mode: 'ov', switchMode }));
    q(root, '[data-type="surv"]').click();
    expect(switchMode).toHaveBeenCalledWith('d2+surv');
  });

  it('one mode only: no choice, every character, creation in the session ruleset', async () => {
    const root = mount();
    const p = characterScreen(root, () => [], vi.fn(), mods({ options: ONE }));
    expect(root.querySelector('[data-act="mode"]')).toBeNull();
    q<HTMLInputElement>(root, 'input').value = 'Akara';
    byText(root, /^Créer$/).click();
    expect(await p).toEqual({ create: { classId: 'sorceress', name: 'Akara', ruleset: 'ov' } });
  });

  it('character of a missing mod: greyed, explanation, never launched; the others play; mod buttons', async () => {
    const root = mount();
    const run = vi.fn();
    const list = [char('perdu', 'absent'), char('ok', 'ov')];
    const p = characterScreen(root, () => list, vi.fn(), mods({ options: ONE, menu: [{ label: 'Survie', run }] }));
    const off = q(root, '.sel-slot[data-slot="perdu"]');
    expect(off.classList.contains('off')).toBe(true);
    expect(off.textContent).toContain('Ce personnage demande le mod « absent », absent de cette version');
    expect(q<HTMLButtonElement>(root, '[data-act="play"]').disabled).toBe(true);
    expect(q(root, '.err').textContent).toMatch(/Conservé tel quel/);
    // double tap on a greyed character: nothing
    off.click();
    q(root, '.sel-slot[data-slot="perdu"]').click();
    q<HTMLButtonElement>(root, '[data-act="play"]').click();
    byText(root, /^Survie$/).click();
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ root: expect.any(HTMLElement) }));
    q(root, '.sel-slot[data-slot="ok"]').click();
    expect(q<HTMLButtonElement>(root, '[data-act="play"]').disabled).toBe(false);
    q<HTMLButtonElement>(root, '[data-act="play"]').click();
    expect(await p).toEqual({ play: 'ok' });
  });

  it('mod button that throws: logged, the screen stays', () => {
    const root = mount();
    const onError = vi.fn();
    void characterScreen(
      root,
      () => [char('ok', 'ov')],
      vi.fn(),
      mods({
        options: ONE,
        onError,
        menu: [
          {
            label: 'Cassé',
            run: () => {
              throw new Error('mod');
            },
          },
        ],
      }),
    );
    byText(root, /^Cassé$/).click();
    expect(onError).toHaveBeenCalledOnce();
    expect(root.querySelector('.sel-slot')).toBeTruthy();
  });
});

describe('Remembered mode', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('boot: pending creation, then the remembered mode, then the last character played; an unknown mode is ignored', () => {
    expect(launchMode.get()).toBeNull();
    localStorage.setItem('d2m.save.x', JSON.stringify({ version: 7, ruleset: 'd2', savedAt: 1, character: { name: 'X', classId: 'amazon', level: 1 } }));
    localStorage.setItem('d2m.active', 'd2m.save.x');
    expect(bootRuleset()).toBe('d2');
    launchMode.set(defaultRuleset());
    expect(localStorage.getItem('d2m.mode')).toBe(defaultRuleset());
    expect(bootRuleset()).toBe(defaultRuleset());
    pendingCreate.set({ classId: 'amazon', name: 'K', ruleset: 'd2' });
    expect(bootRuleset()).toBe('d2');
    pendingCreate.take();
    launchMode.set('pd3');
    expect(bootRuleset()).toBe('d2');
  });

  it('"open the list after the reload": read once', () => {
    expect(launchMode.takeOpenList()).toBe(false);
    launchMode.openListAfterReload();
    expect(launchMode.takeOpenList()).toBe(true);
    expect(launchMode.takeOpenList()).toBe(false);
  });
});

describe('Personnages d’un mod absent et création après rechargement', () => {
  beforeEach(() => localStorage.clear());

  it('sauvegarde d’un jeu de règles absent : listée telle quelle, octet pour octet, jamais réécrite ni choisie au démarrage', () => {
    const text = JSON.stringify({ version: 7, ruleset: 'pd3+absent', savedAt: 99, character: { name: 'Ancien', classId: 'druid', level: 40 } });
    localStorage.setItem('d2m.save.abc', text);
    localStorage.setItem('d2m.active', 'd2m.save.abc');
    const list = SaveStore.list();
    expect(list).toEqual([{ slot: 'd2m.save.abc', name: 'Ancien', classId: 'druid', level: 40, difficulty: 0, savedAt: 99, ruleset: 'pd3+absent', milestones: {} }]);
    expect(rulesetProblem('pd3+absent')).toMatch(/demande le mod « pd3 »/);
    // le démarrage active un jeu de règles de cette version, sans toucher au personnage
    expect(rulesetProblem(bootRuleset())).toBeNull();
    expect(localStorage.getItem('d2m.save.abc')).toBe(text);
  });

  it('création demandée pour un autre jeu de règles : retenue au rechargement (démarrage), lue une seule fois', () => {
    expect(pendingCreate.peek()).toBeNull();
    pendingCreate.set({ classId: 'amazon', name: 'Kashya', ruleset: 'd2' });
    expect(bootRuleset()).toBe('d2');
    expect(pendingCreate.take()).toEqual({ classId: 'amazon', name: 'Kashya', ruleset: 'd2' });
    expect(pendingCreate.take()).toBeNull();
    // jeu de règles inconnu ou entrée illisible : ignorés
    pendingCreate.set({ classId: 'amazon', name: 'x', ruleset: 'pd3' });
    expect(rulesetProblem(bootRuleset())).toBeNull();
    expect(bootRuleset()).not.toBe('pd3');
    localStorage.setItem('d2m.pendingCreate', '{');
    expect(pendingCreate.peek()).toBeNull();
    localStorage.setItem('d2m.pendingCreate', JSON.stringify({ classId: 'chevalier', name: 'x', ruleset: 'd2' }));
    expect(pendingCreate.take()).toBeNull();
  });
});
