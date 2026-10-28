// @vitest-environment happy-dom
/**
 * Panneaux plein écran (DOM, sans navigateur) : rendu et actions principales de l'inventaire, du coffre, du marchand, des compétences,
 * du personnage et des réglages. Tests de comportement (ce que voit et fait le joueur), pas d'instantanés du DOM.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Rng } from '../../src/core/rng';
import { Game } from '../../src/sim/game';
import { addToCharacter } from '../../src/sim/inventory';
import { generateItem } from '../../src/sim/loot/itemgen';
import { addXp, xpToReach } from '../../src/sim/progression';
import { Panels } from '../../src/ui/panels';
import { STASH_VIEW, type PanelHost } from '../../src/ui/panels-shared';
import { withoutPd2 } from '../needs-pd2';

function setup(level = 30): { g: Game; p: Panels; root: HTMLElement; host: PanelHost } {
  Game.resetIds();
  const g = new Game(undefined, 'sorceress');
  addXp(g.character, xpToReach(level));
  g.enterTown();
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const host = {
    game: () => g,
    close: vi.fn(),
    onSettingsChanged: vi.fn(),
    exportSave: vi.fn(),
    importSave: vi.fn(),
    resetSave: vi.fn(),
    switchCharacter: vi.fn(),
    haptic: vi.fn(),
    itemSound: vi.fn(),
    message: vi.fn(),
    resetTips: vi.fn(),
  } as unknown as PanelHost;
  return { g, p: new Panels(root, host), root, host };
}

const q = <T extends HTMLElement = HTMLElement>(root: HTMLElement, sel: string): T => {
  const e = root.querySelector<T>(sel);
  if (!e) throw new Error(`absent : ${sel}`);
  return e;
};
const byText = (root: HTMLElement, sel: string, text: string): HTMLElement => {
  const e = [...root.querySelectorAll<HTMLElement>(sel)].find((x) => x.textContent?.includes(text));
  if (!e) throw new Error(`absent : ${sel} « ${text} »`);
  return e;
};

describe('Panneaux (DOM)', () => {
  beforeEach(() => localStorage.clear());

  it('accessibilité : fenêtre modale nommée, focus dans le panneau, rendu au bouton d’origine à la fermeture', () => {
    const { p, root } = setup();
    const hudBtn = document.createElement('button');
    document.body.append(hudBtn);
    hudBtn.focus();
    p.show('inventory');
    const panel = q(root, '.panel');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.getAttribute('aria-label')).toBe('Inventaire');
    expect(panel.contains(document.activeElement)).toBe(true);
    byText(root, '.panel header .tabs .btn', 'Personnage').click();
    expect(q(root, '.panel').getAttribute('aria-label')).toBe('Personnage');
    expect(q(root, '.panel').contains(document.activeElement)).toBe(true);
    q<HTMLButtonElement>(root, '.panel .close').click();
    expect(document.activeElement).toBe(hudBtn);
  });

  it('ouvre, ferme, et le même onglet referme le panneau', () => {
    const { p, root, host } = setup();
    p.show('inventory');
    expect(p.open).toBe(true);
    expect(q(root, '.panel h2').textContent).toBe('Inventaire');
    byText(root, '.panel header .tabs .btn', 'Personnage').click();
    expect(q(root, '.panel h2').textContent).toBe('Personnage');
    q<HTMLButtonElement>(root, '.panel .close').click();
    expect(p.open).toBe(false);
    expect(host.close).toHaveBeenCalledTimes(1);
    p.show('skills');
    p.show('skills');
    expect(p.open).toBe(false);
  });

  it.skipIf(withoutPd2)('inventaire : un objet du sac se sélectionne, s’affiche dans la colonne Objet et s’équipe', () => {
    const { g, p, root } = setup();
    const ring = generateItem(new Rng('ui-ring'), 'ring', 30, { forceQuality: 'magic' });
    delete g.character.equipment.ring1;
    delete g.character.equipment.ring2;
    addToCharacter(g.character, ring);
    p.show('inventory');
    const idx = g.character.inventory.findIndex((x) => x?.uid === ring.uid);
    q(root, `[data-inv="${idx}"]`).click();
    expect(p.sel).toEqual({ from: 'inv', idx });
    expect(q(root, '[data-zone="item"]').textContent).toContain('Anneau');
    q(root, '[data-act="use"]').click();
    expect(Object.values(g.character.equipment).some((x) => x?.uid === ring.uid)).toBe(true);
    expect(p.sel).toBeNull();
  });

  it('inventaire : une case d’équipement filtre le sac, le bouton Trier range', () => {
    const { g, p, root } = setup();
    const sort = vi.spyOn(g, 'sortInventory');
    p.show('inventory');
    delete g.character.equipment.head;
    p.render();
    byText(root, '.cell', 'Tête').click();
    expect(p.filterSlot).toBe('head');
    byText(root, '.btn', 'Trier').click();
    expect(sort).toHaveBeenCalledTimes(1);
  });

  it.skipIf(withoutPd2)('coffre : onglets Gemmes et Runes, retour au coffre, dépôt d’un objet', () => {
    const { g, p, root } = setup();
    const it = generateItem(new Rng('ui-stash'), 'cap', 10, { forceQuality: 'normal' });
    addToCharacter(g.character, it);
    p.show('stash');
    byText(root, '.stashtop .btn', 'Gemmes').click();
    expect(p.stashTab).toBe(STASH_VIEW.gems);
    byText(root, '.stashtop .btn', 'Runes').click();
    expect(p.stashTab).toBe(STASH_VIEW.runes);
    byText(root, '.stashtop .btn', 'Coffre').click();
    expect(p.stashTab).toBeGreaterThanOrEqual(0);
    const idx = g.character.inventory.findIndex((x) => x?.uid === it.uid);
    q(root, `[data-inv="${idx}"]`).click();
    q(root, '[data-act="move"]').click();
    expect(g.character.inventory.some((x) => x?.uid === it.uid)).toBe(false);
    expect(g.character.stash[p.stashTab].some((x) => x?.uid === it.uid)).toBe(true);
  });

  it('marchand : acheter une clé coûte de l’or, Racheter liste les objets vendus', () => {
    const { g, p, root } = setup();
    g.character.gold = 10_000;
    // lot 321: Malah sells keys (Diablo II's vendor table); Larzuk repairs, sells no key and does not gamble
    p.show('vendor', 'larzuk');
    expect(root.textContent).toContain('Larzuk');
    expect([...root.querySelectorAll('.btn')].some((b) => b.textContent === 'Clé (50 or)')).toBe(false);
    expect(root.textContent).not.toContain('Jeu d’argent');
    expect(root.textContent).toMatch(/Réparer|Équipement intact/);
    p.show('vendor', 'malah');
    expect(root.textContent).toContain('Malah');
    expect(root.textContent).not.toMatch(/Réparer l'équipement|Équipement intact/);
    byText(root, '.btn', 'Clé (50 or)').click();
    expect(g.character.gold).toBeLessThan(10_000);
    byText(root, '.btn', 'Racheter').click();
    expect(p.vendorTab).toBe('back');
    expect(root.textContent).toContain('Rien à racheter');
  });

  it('personnage : « + » répartit un point de caractéristique', () => {
    const { g, p, root } = setup(10);
    const before = g.character.base.vit;
    const pts = g.character.statPoints;
    p.show('character');
    const plus = [...root.querySelectorAll<HTMLButtonElement>('button.plus')].filter((b) => b.textContent === '+');
    plus[2].click(); // force, dextérité, vitalité, énergie
    expect(g.character.base.vit).toBe(before + 1);
    expect(g.character.statPoints).toBe(pts - 1);
  });

  it('compétences : choisir une compétence montre sa progression, « +1 point » l’apprend', () => {
    const { g, p, root } = setup(10);
    p.show('skills');
    const learnable = [...root.querySelectorAll<HTMLButtonElement>('button.sk.can')];
    expect(learnable.length).toBeGreaterThan(0);
    learnable[0].click();
    const id = p.skillSel!;
    const before = g.character.skills[id] ?? 0;
    expect(root.textContent).toContain('Actuel → suivant');
    byText(root, '.btn', '+1 point').click();
    expect(g.character.skills[id]).toBe(before + 1);
  });

  it('réglages : recherche, choix d’une valeur et rétablissement des défauts d’une catégorie', () => {
    const { g, p, root, host } = setup();
    p.show('settings');
    const search = q<HTMLInputElement>(root, 'input.set-search');
    search.value = 'zoom';
    search.dispatchEvent(new Event('input'));
    expect(root.querySelector('[data-opt="zoom"]')).not.toBeNull();
    expect(root.textContent).toContain('trouvé');
    byText(root, '.set-clear', '✕').click();
    expect(p.settingsUi.query).toBe('');
    byText(root, '.setcat', 'Affichage').click();
    byText(root, '[data-opt="quality"] .btn', 'Basse').click();
    expect(g.settings.quality).toBe('low');
    expect(host.onSettingsChanged).toHaveBeenCalled();
    byText(root, '.setreset', 'Rétablir').click();
    byText(root, '.btn.danger', 'Rétablir').click();
    expect(g.settings.quality).not.toBe('low');
  });

  it('réglages : exporter et importer passent par l’application', () => {
    const { p, root, host } = setup();
    p.show('settings');
    byText(root, '.setcat', 'Compte').click();
    byText(root, '.btn', 'Exporter la sauvegarde').click();
    byText(root, '.btn', 'Importer une sauvegarde').click();
    expect(host.exportSave).toHaveBeenCalledTimes(1);
    expect(host.importSave).toHaveBeenCalledTimes(1);
  });

  it('chaque autre panneau s’affiche avec son titre et la barre d’onglets', () => {
    const { g, p, root } = setup(80);
    g.character.progression.highestDifficulty = 2;
    const titles: Record<string, string> = {
      cube: 'Cube',
      maps: '',
      waypoint: 'Point de passage',
      filter: '',
      imbue: '',
      socketquest: '',
      help: 'Raccourcis clavier',
      changelog: '',
      credits: 'Crédits',
      merc: '',
    };
    for (const [name, title] of Object.entries(titles)) {
      p.show('close');
      p.show(name, name === 'merc' ? 'qual_kehk' : undefined);
      expect(p.current, name).toBe(name);
      const h = q(root, '.panel h2').textContent ?? '';
      if (title) expect(h, name).toContain(title);
      expect(root.querySelectorAll('.panel header .tabs .btn').length, name).toBeGreaterThanOrEqual(4);
    }
  });
});
