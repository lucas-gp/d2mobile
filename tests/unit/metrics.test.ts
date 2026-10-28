/** Mesures de qualité (tools/quality/metrics-lib.ts) : longueur des fonctions, imports relatifs (valeur / type), composantes cycliques. */
import { describe, expect, it } from 'vitest';
import { cyclicComponents, functionLengths, relativeImports } from '../../tools/quality/metrics-lib';

describe('Mesures de qualité', () => {
  it('compte les lignes des fonctions, méthodes et fonctions fléchées nommées', () => {
    const src = ['export function a(): void {', '  const b = () => {', '    return 1;', '  };', '}', 'class C {', '  m(): number {', '    return 2;', '  }', '}'].join('\n');
    const f = functionLengths('x.ts', src);
    expect(f.map((x) => [x.name, x.line, x.lines])).toEqual([
      ['a', 1, 5],
      ['b', 2, 3],
      ['m', 7, 3],
    ]);
  });

  it('résout les imports relatifs et distingue les imports de type', () => {
    const known = new Set(['src/a.ts', 'src/b.ts', 'src/c/index.ts', 'src/d.ts']);
    const src = "import { x } from './b';\nimport type { T } from './c';\nimport { type U } from './d';\nimport { y } from 'pixi.js';\ntype V = typeof import('./a');";
    expect(relativeImports('src/a.ts', src, known, false)).toEqual(['src/b.ts']);
    expect(relativeImports('src/a.ts', src, known, true).sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/c/index.ts', 'src/d.ts']);
  });

  it('trouve les composantes cycliques et ignore les fichiers isolés', () => {
    const g = new Map([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a']],
      ['d', ['a']],
      ['e', ['e2']],
      ['e2', ['e']],
    ]);
    expect(cyclicComponents(g)).toEqual([
      ['a', 'b', 'c'],
      ['e', 'e2'],
    ]);
  });
});
