/** Palettes : .dat = 256 entrées BGR (768 octets). Index 0 = transparent. */
import type { VfsCore as Vfs } from '../vfs-core';

export type Palette = Uint8Array; // 256 * 3, RGB

export function parsePalette(d: Uint8Array): Palette {
  if (d.length < 768) throw new Error(`palette invalide (${d.length} octets)`);
  const p = new Uint8Array(768);
  for (let i = 0; i < 256; i++) {
    p[i * 3] = d[i * 3 + 2];
    p[i * 3 + 1] = d[i * 3 + 1];
    p[i * 3 + 2] = d[i * 3];
  }
  return p;
}

/** Palette d'un acte (1..5) ; `units`, `sky`, etc. accessibles par nom */
export function loadPalette(vfs: Vfs, name: string | number): Palette {
  const n = typeof name === 'number' ? `act${name}` : name;
  return parsePalette(vfs.need(`data\\global\\palette\\${n}\\pal.dat`));
}

/** Table de remplacement d'index (256 octets), utilisée pour les variantes de couleur des icônes */
export function parseColorMap(d: Uint8Array): Uint8Array {
  if (d.length < 256) throw new Error('table de couleurs invalide');
  return d.subarray(0, 256);
}
