/** Réglage « Statistiques anonymes d'utilisation » (Réglages › Avancé) : choix Oui / Non par appareil, voir src/platform/stats.ts et PRIVACY.md. */
import { el } from './dom';
import { stats } from '../platform/stats';

/**
 * Ligne « libellé | Oui / Non ». « Ne pas suivre » du navigateur : désactivé d'office, sans choix. `onChange` : redessiner le panneau.
 */
export function statsSection(onChange: () => void): HTMLElement {
  const c = stats();
  const mode = c.mode();
  const label = el('span', { textContent: 'Statistiques anonymes d’utilisation' });
  if (mode === 'dnt') return el('div', { cls: 'statrow' }, label, el('span', { cls: 'set-help', textContent: 'Désactivé (votre navigateur demande « Ne pas suivre »)' }));
  const box = el('div', { cls: 'tabs' });
  for (const [v, l] of [
    [true, 'Oui'],
    [false, 'Non'],
  ] as [boolean, string][]) {
    const b = el('button', { cls: `btn${(mode === 'on') === v ? ' sel' : ''}${v ? ' dflt' : ''}`, textContent: l });
    b.addEventListener('click', () => {
      c.setEnabled(v);
      onChange();
    });
    box.append(b);
  }
  return el('div', { cls: 'statrow' }, label, box);
}
