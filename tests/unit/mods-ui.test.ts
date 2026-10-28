// @vitest-environment happy-dom
/**
 * Points d'insertion d'interface des mods (src/mods/ui.ts) et modes de jeu empilables (mods `gamemode`, src/mods/activate.ts) : chaque
 * test active, dans un graphe de modules neuf, un mod de démonstration (« mode de jeu » façon Survivals : écran de choix au level-up,
 * entrée au point de passage, section de la fiche, élément du HUD, bouton du menu, ligne d'artisanat), puis vérifie ce que la base affiche.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ModDef, ModManifest } from '../../src/mods/api';
import type { PanelHost } from '../../src/ui/panels-shared';

/** Graphe de modules neuf (aucun jeu de règles actif), manifests fournis (comme l'outil en ligne de commande) */
async function fresh(manifests: ModManifest[] = []) {
  vi.resetModules();
  const D = await import('../../src/mods/discover');
  D.provideManifests(manifests);
  return { A: await import('../../src/mods/activate'), U: await import('../../src/mods/ui') };
}

const manifest = (m: Partial<ModManifest> & Pick<ModManifest, 'id' | 'kind'>, content: ModDef['register'] = () => undefined): ModManifest => ({
  name: m.id,
  version: '1.0.0',
  load: () => Promise.resolve({ default: { register: content } }),
  ...m,
});

describe('Identifiants de jeu de règles avec modes de jeu', () => {
  it('contenu puis modes triés ; le contenu fixe la guilde, un mode a son propre coffre (lot 299)', async () => {
    const { A } = await fresh();
    expect(A.rulesetId('pd2', ['zz', 'aa', 'zz'])).toBe('pd2+aa+zz');
    expect(A.rulesetId('d2')).toBe('d2');
    expect(A.parseRuleset('d2+aa+zz')).toEqual({ content: 'd2', modes: ['aa', 'zz'] });
    expect(A.contentRuleset('pd2+surv')).toBe('pd2');
    const P = await import('../../src/platform/platform');
    expect(P.sharedKeyOf('pd2+surv')).toBe('d2m.shared.pd2+surv');
    expect(P.sharedKeyOf('d2+surv')).toBe('d2m.shared.d2+surv');
    expect(P.sharedSyncIdOf('d2+surv')).toBe('shared-d2_surv');
    expect(P.sharedRulesetOfSyncId('shared-d2_surv')).toBe('d2+surv');
    vi.resetModules();
  });

  it('jouable ou non : mod absent, mode absent, mode incompatible, identifiant mal formé ou non canonique', async () => {
    const { A } = await fresh([manifest({ id: 'ov', kind: 'overhaul', defaultOn: true }), manifest({ id: 'surv', kind: 'gamemode', rulesets: ['d2'] }), manifest({ id: 'all', kind: 'gamemode' })]);
    expect(A.rulesetProblem('d2')).toBeNull();
    expect(A.rulesetProblem('ov')).toBeNull();
    expect(A.rulesetProblem('d2+surv')).toBeNull();
    expect(A.rulesetProblem('ov+all')).toBeNull();
    expect(A.rulesetProblem('all+surv+d2')).toMatch(/demande le mod « all »/);
    expect(A.rulesetProblem('pd3')).toMatch(/demande le mod « pd3 », absent/);
    expect(A.rulesetProblem('d2+absent')).toMatch(/mode de jeu « absent », absent/);
    expect(A.rulesetProblem('ov+surv')).toMatch(/ne se joue pas avec ce jeu de règles/);
    expect(A.rulesetProblem('d2+surv+all')).toMatch(/illisible/);
    expect(A.rulesetProblem('D2')).toMatch(/illisible/);
    expect(A.rulesetProblem('d2++surv')).toMatch(/illisible/);
    expect(A.isKnownRuleset('d2+all+surv')).toBe(true);
    expect(A.gameModesFor('ov').map((m) => m.id)).toEqual(['all']);
    expect(A.gameModesFor('d2').map((m) => m.id)).toEqual(['all', 'surv']);
    // la refonte par défaut d'abord, puis la base ; les modes de jeu ne sont pas des jeux de règles de contenu
    expect(A.playableRulesets().map((r) => r.id)).toEqual(['ov', 'd2']);
    expect(Object.keys(A.rulesets())).toEqual(['d2', 'ov']);
    expect(A.rulesetSwitch('d2+surv')).toBe('same');
    expect(A.rulesetSwitch('ov+surv')).toBe('unknown');
    vi.resetModules();
  });

  it('activation : contenu puis modes ; changer de mode = recharger ; un mode avant le contenu est refusé', async () => {
    const order: string[] = [];
    const { A } = await fresh([
      manifest({ id: 'ov', kind: 'overhaul', defaultOn: true }, (api) => void order.push(api.modId)),
      manifest(
        { id: 'surv', kind: 'gamemode', i18n: { 'Survie : un choix à chaque niveau.': 'Survival: a choice at every level.' }, description: 'Survie : un choix à chaque niveau.' },
        (api) => void order.push(api.modId),
      ),
    ]);
    expect(() =>
      A.activateMods('x', [
        { id: 'surv', name: 's', version: '1', kind: 'gamemode', register: () => undefined },
        { id: 'ov', name: 'o', version: '1', kind: 'overhaul', register: () => undefined },
      ]),
    ).toThrow(/après le contenu/);
    await A.activateRuleset('ov+surv');
    expect(order).toEqual(['ov', 'surv']);
    expect(A.activeRuleset()).toBe('ov+surv');
    expect(A.activeModIds()).toEqual(['ov', 'surv']);
    expect(A.rulesetSwitch('ov')).toBe('reload');
    expect(A.rulesetSwitch('ov+surv')).toBe('same');
    await expect(A.activateRuleset('ov+absent')).rejects.toThrow(/inconnu/);
    // traductions des manifests (écran de création), avant le contenu
    const I = await import('../../src/i18n');
    I.setLang('en');
    await I.loadDict();
    expect(I.tr('Survie : un choix à chaque niveau.')).toBe('Survival: a choice at every level.');
    I.setLang('fr');
    vi.resetModules();
  });
});

describe("Points d'insertion d'interface", () => {
  it('ordre des contributeurs, gel, point inconnu, contribution mal formée', async () => {
    const { A, U } = await fresh([
      manifest({ id: 'ov', kind: 'overhaul', defaultOn: true }, (api) => {
        api.ui.add('menu.buttons', { label: 'Contenu', run: () => undefined });
        api.ui.add('levelUp', () => undefined);
      }),
      manifest({ id: 'surv', kind: 'gamemode' }, (api) => {
        api.ui.add('menu.buttons', { label: 'Survie', run: () => undefined });
        expect(() => api.ui.add('inconnu' as 'hud', () => null)).toThrow(/inconnu/);
        expect(() => api.ui.add('hud', { el: null } as unknown as () => null)).toThrow(/mal formée/);
        expect(() => api.ui.add('menu.buttons', { label: 'x' } as never)).toThrow(/mal formée/);
      }),
    ]);
    expect(U.contributions('menu.buttons')).toEqual([]);
    await A.activateRuleset('ov+surv');
    expect(U.contributions('menu.buttons').map((b) => b.label)).toEqual(['Contenu', 'Survie']);
    expect(U.uiOwners('menu.buttons')).toEqual(['ov', 'surv']);
    expect(U.uiOwners('levelUp')).toEqual(['ov']);
    expect(U.contributions('hud')).toEqual([]);
    expect(() => U.addUi('tard', 'hud', () => null)).toThrow(/après l'activation/);
    expect(U.isUiSlot('levelUp')).toBe(true);
    expect(U.UI_SLOT_NAMES).toContain('item.socketActions');
    const err = vi.fn();
    expect(
      U.safely(
        () => {
          throw new Error('mod cassé');
        },
        7,
        err,
      ),
    ).toBe(7);
    expect(err).toHaveBeenCalledOnce();
    vi.resetModules();
  });

  it('panneaux de la base : fiche, point de passage, artisanat (jeu d2, sans le mod pd2) ; un mod en erreur ne casse pas le panneau', async () => {
    const calls: string[] = [];
    const { A } = await fresh([
      manifest({ id: 'surv', kind: 'gamemode' }, (api) => {
        api.ui.add('character.sheet', ({ game }) => {
          const d = document.createElement('div');
          d.className = 'probe-sheet';
          d.textContent = `Vagues : ${game.character.level}`;
          return d;
        });
        api.ui.add('character.sheet', () => {
          throw new Error('section cassée');
        });
        api.ui.add('town.waypoint', (ctx) => {
          const b = document.createElement('button');
          b.className = 'probe-wp';
          b.addEventListener('click', () => {
            const s = ctx.screen.open(document.createElement('div'));
            calls.push('écran');
            s.close();
            ctx.close();
          });
          return b;
        });
        api.ui.add('item.socketActions', (ctx) => [
          {
            id: 'probe-act',
            label: `Essai (${ctx.town ? 'ville' : 'dehors'})`,
            ok: ctx.town,
            run: () => {
              ctx.host.message('fait');
              ctx.closeMenu();
              ctx.render();
            },
          },
        ]);
      }),
    ]);
    await A.activateRuleset('d2+surv');
    const { Game } = await import('../../src/sim/game');
    const { Panels } = await import('../../src/ui/panels');
    const { generateItem } = await import('../../src/sim/loot/itemgen');
    const { Rng } = await import('../../src/core/rng');
    const { BASES } = await import('../../src/data/items/bases');
    const E = await import('../../src/platform/errorlog');
    const reported = vi.spyOn(E, 'reportError').mockImplementation(() => undefined);
    Game.resetIds();
    const g = new Game(undefined, 'sorceress');
    g.enterTown();
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const host = { game: () => g, close: vi.fn(), haptic: vi.fn(), itemSound: vi.fn(), message: vi.fn() } as unknown as PanelHost;
    const p = new Panels(root, host);
    p.show('character');
    expect(root.querySelector('.probe-sheet')?.textContent).toBe('Vagues : 1');
    expect(reported).toHaveBeenCalledWith('mod (interface)', expect.any(Error));
    p.show('waypoint');
    const wp = root.querySelector<HTMLButtonElement>('.probe-wp')!;
    expect(wp).toBeTruthy();
    wp.click();
    expect(calls).toEqual(['écran']);
    expect(root.querySelector('.mod-screen')).toBeNull();
    // artisanat d'une arme sans châsse : la ligne du mod suit Larzuk
    const base = BASES.find((b) => b.maxSockets > 0 && b.type === 'sword')!;
    const it = generateItem(new Rng('probe'), base.id, 30, { forceQuality: 'normal' });
    it.sockets = 0;
    const entries = p.socketEntries(g, it, { from: 'inv', idx: 0 });
    const mine = entries.find((e) => e.id === 'probe-act')!;
    expect(mine.label).toBe('Essai (ville)');
    mine.run();
    expect(host.message).toHaveBeenCalledWith('fait', undefined);
    reported.mockRestore();
    vi.resetModules();
  });
});
