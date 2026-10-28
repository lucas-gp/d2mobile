import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { inflateZlib } from '../../tools/d2import/inflate';
import { encodePngWeb } from '../../tools/d2import/png-web';
import { encodePng } from '../../tools/d2import/png';

/** Données déterministes, mêlant répétitions et bruit (blocs fixes, dynamiques et stockés) */
function sample(n: number): Uint8Array {
  const out = new Uint8Array(n);
  let s = 12345;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    out[i] = i % 7 < 4 ? (i >> 3) & 0xff : (s >>> 16) & 0xff;
  }
  return out;
}

describe('inflate navigateur (lecture MPQ synchrone)', () => {
  it('relit ce que zlib écrit, à tous les niveaux', () => {
    for (const level of [0, 1, 6, 9]) {
      for (const n of [0, 1, 300, 4096, 70000]) {
        const src = sample(n);
        const got = inflateZlib(deflateSync(src, { level }), n);
        expect(Buffer.compare(Buffer.from(got), Buffer.from(src))).toBe(0);
      }
    }
  });

  it("PNG du navigateur : mêmes pixels que l'encodeur du CLI", async () => {
    const w = 37;
    const h = 11;
    const rgba = sample(w * h * 4);
    const a = Buffer.from(await encodePngWeb(w, h, rgba));
    const b = encodePng(w, h, rgba);
    // mêmes en-têtes ; seul le niveau de compression du flux zlib peut différer
    expect(a.subarray(0, 33).equals(b.subarray(0, 33))).toBe(true);
    const idat = (p: Buffer) => {
      const i = p.indexOf('IDAT');
      return inflateZlib(p.subarray(i + 4, i + 4 + p.readUInt32BE(i - 4)), (w * 4 + 1) * h);
    };
    expect(Buffer.compare(Buffer.from(idat(a)), Buffer.from(idat(b)))).toBe(0);
  });
});
