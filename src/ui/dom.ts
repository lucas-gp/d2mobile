/** Mini-utilitaires DOM de l'interface (aucune dépendance au moteur de rendu). */

type Child = Node | string | null | undefined | false;

/**
 * Crée un élément : `cls` (classes), `style`, `data` (attributs data-*), autres propriétés DOM, enfants (texte ou nœuds ; null, undefined et
 * false ignorés). Un bouton sans texte reçoit son infobulle comme nom accessible.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Omit<HTMLElementTagNameMap[K], 'style' | 'dataset'>> & { cls?: string; style?: Partial<CSSStyleDeclaration>; data?: Record<string, string> } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  const { cls, style, data, ...rest } = props as Record<string, unknown> & { cls?: string; style?: Partial<CSSStyleDeclaration>; data?: Record<string, string> };
  if (cls) e.className = cls;
  if (style) Object.assign(e.style, style);
  if (data) for (const [k, v] of Object.entries(data)) e.dataset[k] = v;
  for (const [k, v] of Object.entries(rest)) (e as unknown as Record<string, unknown>)[k] = v;
  for (const c of children) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(c));
  // bouton sans texte (icône seule) : son infobulle sert de nom accessible
  if (tag === 'button' && e.title && !e.hasAttribute('aria-label') && !e.textContent?.trim()) e.setAttribute('aria-label', e.title);
  return e;
}

/** Nombre arrondi avec séparateurs de milliers (format français) */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

/** Bouton « appui maintenu pour confirmer » (jeter, vendre) : 600 ms */
export function holdButton(label: string, onConfirm: () => void, ms = 600, cls = 'btn'): HTMLButtonElement {
  const b = el('button', { cls: `${cls} hold` }, el('span', { cls: 'hold-fill' }), el('span', { cls: 'hold-label', textContent: label }));
  wireHold(b, onConfirm, ms);
  return b;
}

/** Appui maintenu `ms` millisecondes sur `b` (qui contient un `.hold-fill`) pour confirmer ; relâcher ou sortir annule */
export function wireHold(b: HTMLElement, onConfirm: () => void, ms: number): void {
  let timer = 0;
  const fill = b.querySelector('.hold-fill') as HTMLElement;
  const cancel = () => {
    window.clearTimeout(timer);
    fill.style.transition = 'none';
    fill.style.width = '0%';
  };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    fill.style.transition = `width ${ms}ms linear`;
    fill.style.width = '100%';
    timer = window.setTimeout(() => {
      cancel();
      onConfirm();
    }, ms);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, cancel);
}
