/** Fabrique d'icônes de l'interface (compétences, objets, boutons). */
import { d2IconUrl } from './d2icons';
import { el } from './dom';

/** Icône `id` : image importée de Diablo II si elle existe, sinon le SVG libre `public/icons/<id>.svg` en masque teinté par la classe CSS */
export function icon(id: string, cls = ''): HTMLElement {
  const i = el('span', { cls: `icon ${cls}` });
  const d2 = d2IconUrl(id);
  if (d2) {
    // icône importée de Diablo II : image en couleurs, pas un masque teinté
    i.classList.add('d2');
    i.style.setProperty('--d2', `url("${d2}")`);
    return i;
  }
  // URL absolue : une url() relative dans une variable CSS se résout par rapport à la feuille
  // de style (dist/assets/) en production, pas par rapport à la page
  i.style.setProperty('--icon', `url("${new URL(`${import.meta.env.BASE_URL}icons/${id}.svg`, document.baseURI).href}")`);
  return i;
}
