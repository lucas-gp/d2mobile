/**
 * Écritures DOM des mises à jour par image (HUD) : n'écrire que ce qui change. Réécrire un texte identique remplace son nœud et
 * invalide la mise en page ; une lecture de taille dans la même image (étiquettes au sol) force alors un recalcul complet.
 */

const texts = new WeakMap<HTMLElement, string>();

/**
 * Texte d'un élément, seulement s'il diffère du dernier texte écrit par cette fonction. Comparé au texte source et non au DOM : la couche
 * de traduction (src/i18n) remplace le texte affiché, qui ne serait jamais égal au français. À réserver aux éléments dont seul l'appelant
 * écrit le texte.
 */
export function setText(e: HTMLElement, v: string): void {
  if (texts.get(e) === v) return;
  texts.set(e, v);
  e.textContent = v;
}

const styles = new WeakMap<HTMLElement, Map<string, string>>();

/**
 * Propriété de style (nom CSS : `transform`, `clip-path`…), seulement si elle diffère de la dernière valeur écrite par cette fonction.
 * À réserver aux propriétés que seule la mise à jour par image écrit (sinon une écriture d'ailleurs ne serait pas vue).
 */
export function setStyle(e: HTMLElement, prop: string, v: string): void {
  let m = styles.get(e);
  if (!m) styles.set(e, (m = new Map()));
  if (m.get(prop) === v) return;
  m.set(prop, v);
  e.style.setProperty(prop, v);
}

const subs = new WeakMap<HTMLElement, Map<string, HTMLElement | null>>();

/** Descendant `sel` de `e`, gardé en mémoire tant qu'il est encore dans `e` (les boutons dont l'icône est remplacée sont recherchés à nouveau) */
export function sub(e: HTMLElement, sel: string): HTMLElement | null {
  let m = subs.get(e);
  if (!m) subs.set(e, (m = new Map()));
  const c = m.get(sel);
  if (c && e.contains(c)) return c;
  const n = e.querySelector<HTMLElement>(sel);
  m.set(sel, n);
  return n;
}
