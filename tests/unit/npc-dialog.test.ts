/** Dialogue des PNJ : les lignes adressées à une autre classe sont écartées */
import { describe, expect, it } from 'vitest';
import { linesFor } from '../../src/ui/npcdialog';

describe('dialogue des PNJ', () => {
  const lines = [
    { n: 1, text: 'I have heard that you Amazons excel at killing from a distance.' },
    { n: 2, text: 'The siege has been long.' },
    { n: 3, text: 'Few Barbarians have faced Baal.' },
  ];
  it('garde les lignes neutres et celles de sa classe', () => {
    expect(linesFor(lines, 'sorceress').map((l) => l.n)).toEqual([2]);
    expect(linesFor(lines, 'amazon').map((l) => l.n)).toEqual([1, 2]);
    expect(linesFor(lines, 'barbarian').map((l) => l.n)).toEqual([2, 3]);
  });
});
