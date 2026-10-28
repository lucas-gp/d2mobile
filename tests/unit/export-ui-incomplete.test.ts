import { describe, expect, it } from 'vitest';
import { exportUi } from '../../tools/d2import/export-ui';

describe('exportUi : interface incomplète', () => {
  it('sans les DC6 indispensables : échec nommant les images et fichiers manquants, ui.json jamais écrit', async () => {
    const written: string[] = [];
    const data = { vfs: { get: () => null }, palette: () => new Uint8Array(768) } as never;
    const sink = {
      png: async (p: string) => void written.push(p),
      json: async (p: string) => void written.push(p),
      put: async (p: string) => void written.push(p),
      write: async (p: string) => void written.push(p),
    } as never;
    await expect(exportUi(data, sink, () => undefined)).rejects.toThrow(
      /Interface incomplete: 0 images built, missing menu-bg, select-bg, create-bg, hero-sorceress-nu1, btn-wide.*absent: charselect\/charselectbckg/,
    );
    expect(written.some((w) => w.endsWith('ui.json'))).toBe(false);
  });
});
