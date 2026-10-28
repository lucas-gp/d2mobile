// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { setStyle, setText, sub } from '../../src/ui/dom-memo';

describe('Écritures DOM mémorisées du HUD', () => {
  it('setText : n’écrit que si le texte source change, même si le DOM affiche une traduction', () => {
    const e = document.createElement('div');
    setText(e, 'Niveau 3');
    const node = e.firstChild;
    setText(e, 'Niveau 3');
    expect(e.firstChild).toBe(node); // pas de nouveau nœud texte
    e.textContent = 'Level 3'; // couche de traduction
    setText(e, 'Niveau 3');
    expect(e.textContent).toBe('Level 3');
    setText(e, 'Niveau 4');
    expect(e.textContent).toBe('Niveau 4');
  });

  it('setStyle : propriété écrite au changement seulement (propriétés personnalisées comprises)', () => {
    const e = document.createElement('div');
    setStyle(e, 'transform', 'scaleX(0.5)');
    expect(e.style.transform).toBe('scaleX(0.5)');
    e.style.transform = 'none'; // écriture d'ailleurs : non vue, par contrat
    setStyle(e, 'transform', 'scaleX(0.5)');
    expect(e.style.transform).toBe('none');
    setStyle(e, 'transform', 'scaleX(0.25)');
    expect(e.style.transform).toBe('scaleX(0.25)');
    setStyle(e, '--cd', '90deg');
    expect(e.style.getPropertyValue('--cd')).toBe('90deg');
  });

  it('sub : descendant gardé tant qu’il est dans l’élément, recherché de nouveau après remplacement', () => {
    const b = document.createElement('button');
    const a = document.createElement('span');
    a.className = 'cd';
    b.append(a);
    expect(sub(b, '.cd')).toBe(a);
    const c = document.createElement('span');
    c.className = 'cd';
    b.replaceChildren(c);
    expect(sub(b, '.cd')).toBe(c);
    b.replaceChildren();
    expect(sub(b, '.cd')).toBeNull();
  });
});
