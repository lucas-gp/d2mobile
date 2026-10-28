import { utf8 } from '../bytes';
/** .tbl : tables de chaînes localisées (clé → texte). Les fichiers plus prioritaires écrasent les autres. */
export function parseTbl(d: Uint8Array): Map<string, string> {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const n = v.getUint16(2, true);
  const nodes = v.getUint32(4, true);
  const base = 21 + n * 2;
  const out = new Map<string, string>();
  const cstr = (off: number): string => {
    let e = off;
    while (e < d.length && d[e] !== 0) e++;
    return utf8(d.subarray(off, e));
  };
  for (let i = 0; i < nodes; i++) {
    const o = base + i * 17;
    if (!d[o]) continue;
    out.set(cstr(v.getUint32(o + 7, true)), cstr(v.getUint32(o + 11, true)));
  }
  return out;
}
