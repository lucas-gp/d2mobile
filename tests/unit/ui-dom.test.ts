// @vitest-environment happy-dom
/** Briques DOM de l'interface : fabrique `el`, bouton à appui maintenu, info-bulle d'objet, lignes chiffrées d'une compétence. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Rng } from '../../src/core/rng';
import { Game } from '../../src/sim/game';
import { computeDerived } from '../../src/sim/character';
import { generateItem } from '../../src/sim/loot/itemgen';
import { addXp, xpToReach } from '../../src/sim/progression';
import { el, holdButton } from '../../src/ui/dom';
import { itemTooltip } from '../../src/ui/itemtext';
import { skillLines } from '../../src/ui/skilltext';

describe('Briques DOM', () => {
  afterEach(() => vi.useRealTimers());

  it('el : classes, styles, données, propriétés et enfants (les valeurs vides sont ignorées)', () => {
    const b = el('button', { cls: 'btn sel', textContent: 'OK', title: 'Valider', style: { opacity: '0.5' }, data: { act: 'go' } });
    const box = el('div', {}, b, 'texte', null, undefined, false);
    expect(b.className).toBe('btn sel');
    expect(b.title).toBe('Valider');
    expect(b.style.opacity).toBe('0.5');
    expect(b.dataset.act).toBe('go');
    expect(box.childNodes.length).toBe(2);
    expect(box.textContent).toBe('OKtexte');
  });

  it('holdButton : confirme seulement après l’appui maintenu complet', () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const b = holdButton('Supprimer', done, 600);
    b.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(300);
    b.dispatchEvent(new Event('pointerup'));
    vi.advanceTimersByTime(600);
    expect(done).not.toHaveBeenCalled();
    b.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(600);
    expect(done).toHaveBeenCalledTimes(1);
    expect(b.querySelector('.hold-label')?.textContent).toBe('Supprimer');
  });

  it('itemTooltip : nom, base et propriétés d’un objet magique', () => {
    Game.resetIds();
    const g = new Game(undefined, 'sorceress');
    addXp(g.character, xpToReach(40));
    const it = generateItem(new Rng('tip'), 'ring', 40, { forceQuality: 'magic' });
    const tip = itemTooltip(it, g.character);
    expect(tip.textContent).toContain('Anneau');
    expect(tip.querySelectorAll('div').length).toBeGreaterThan(2);
  });

  it('skillLines : niveau actuel et suivant, coût en mana et dégâts d’un sort', () => {
    const g = new Game(undefined, 'sorceress');
    addXp(g.character, xpToReach(30));
    g.character.skills.fire_ball = 5;
    const lines = skillLines('fire_ball', computeDerived(g.character, 0));
    const mana = lines.find((l) => l.label === 'Coût en mana');
    expect(mana && mana.now !== '—').toBe(true);
    expect(lines.some((l) => l.label.startsWith('Dégâts de feu'))).toBe(true);
    expect(skillLines('inconnue', computeDerived(g.character, 0))).toEqual([]);
  });
});
