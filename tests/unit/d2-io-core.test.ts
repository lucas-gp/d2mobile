import { describe, expect, it } from 'vitest';
import { CopyDamagedError, COPY_CHUNK, copyVerified, crc32, readExact, verifyAgainstCrc, writeFully } from '../../tools/d2import/io-core';
import { looksCorrupt } from '../../src/platform/d2local-core';

/** Poignée synchrone factice (mémoire) avec défauts configurables */
function fake(opts: { half?: boolean; corruptOnce?: number; alwaysCorrupt?: number; shortRead?: boolean } = {}) {
  let data = new Uint8Array(0);
  let corrupted = false;
  const h = {
    writes: 0,
    getSize: () => data.length,
    truncate(n: number) {
      const d = new Uint8Array(n);
      d.set(data.subarray(0, Math.min(n, data.length)));
      data = d;
    },
    flush() {},
    write(b: ArrayBufferView, o: { at: number }) {
      const u = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      const n = opts.half && u.length > 1 ? Math.ceil(u.length / 2) : u.length;
      if (data.length < o.at + n) h.truncate(o.at + n);
      data.set(u.subarray(0, n), o.at);
      h.writes++;
      const pos = opts.alwaysCorrupt ?? (opts.corruptOnce !== undefined && !corrupted ? opts.corruptOnce : undefined);
      if (pos !== undefined && o.at <= pos && pos < o.at + n) {
        data[pos] ^= 0xff;
        corrupted = true;
      }
      return n;
    },
    read(b: ArrayBufferView, o: { at: number }) {
      const u = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      const n = Math.max(0, Math.min(opts.shortRead ? Math.ceil(u.length / 2) : u.length, data.length - o.at));
      u.set(data.subarray(o.at, o.at + n));
      return n;
    },
    bytes: () => data,
  };
  return h;
}

const CH = 64;
const mk = (n: number) => {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = (i * 31 + 7) & 0xff;
  return a;
};
const source = (a: Uint8Array) => ({ size: a.length, read: (p: number, l: number) => a.slice(p, p + l) });

describe('io-core : copie vérifiée', () => {
  it('CRC32 connu', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('écriture partielle : la boucle écrit tout', () => {
    const h = fake({ half: true });
    const b = mk(1000);
    writeFully(h, b, 10);
    expect(h.bytes().slice(10, 1010)).toEqual(b);
    expect(h.writes).toBeGreaterThan(1);
  });

  it('écriture à zéro octet : erreur explicite', () => {
    expect(() => writeFully({ write: () => 0 }, mk(10), 0)).toThrow(/Write failed/);
  });

  it('copie complète avec écritures et lectures partielles', () => {
    const a = mk(CH * 3 + 17);
    const h = fake({ half: true, shortRead: true });
    const r = copyVerified(source(a), h, { chunk: CH });
    expect(h.bytes()).toEqual(a);
    expect(r.crcs.length).toBe(4);
    expect(r.rewritten).toBe(0);
    expect(verifyAgainstCrc(source(h.bytes()), r.crcs, CH)).toBe(-1);
  });

  it('une corruption à l’écriture est détectée puis réécrite', () => {
    const a = mk(CH * 2 + 5);
    const h = fake({ corruptOnce: CH + 3 });
    const r = copyVerified(source(a), h, { chunk: CH });
    expect(h.bytes()).toEqual(a);
    expect(r.rewritten).toBe(1);
  });

  it('une corruption persistante finit en erreur « abîmé »', () => {
    const a = mk(CH * 2);
    const h = fake({ alwaysCorrupt: 5 });
    expect(() => copyVerified(source(a), h, { chunk: CH })).toThrow(CopyDamagedError);
  });

  it('la vérification par empreintes trouve le morceau altéré', () => {
    const a = mk(CH * 4);
    const h = fake();
    const r = copyVerified(source(a), h, { chunk: CH });
    const d = h.bytes().slice();
    d[CH * 2 + 9] ^= 1;
    expect(verifyAgainstCrc(source(d), r.crcs, CH)).toBe(2);
    expect(verifyAgainstCrc(source(h.bytes().slice(0, d.length - 1)), r.crcs, CH)).toBe(3);
  });

  it('reprise : CRC conservés, reste copié', () => {
    const a = mk(CH * 5);
    const h = fake();
    const first = copyVerified(source(a), h, { chunk: CH });
    const h2 = fake();
    h2.write(a.subarray(0, CH * 2), { at: 0 });
    const r = copyVerified(source(a), h2, { chunk: CH, from: CH * 2, crcs: first.crcs.slice(0, 2) });
    expect(h2.bytes()).toEqual(a);
    expect(r.crcs).toEqual(first.crcs);
  });

  it('lecture courte : une relecture, puis erreur', () => {
    let calls = 0;
    const ok = readExact((p, l) => (++calls === 1 ? new Uint8Array(l - 1) : new Uint8Array(l)), 100, 0, 50);
    expect(ok.length).toBe(50);
    expect(calls).toBe(2);
    expect(() => readExact((_p, l) => new Uint8Array(l - 1), 100, 0, 50)).toThrow(/Short read/);
    // la fin du fichier n'est pas une lecture courte
    expect(readExact((_p, _l) => new Uint8Array(10), 100, 90, 50).length).toBe(10);
  });

  it('erreurs de données corrompues reconnues', () => {
    expect(looksCorrupt('DCC : signature invalide')).toBe(true);
    expect(looksCorrupt('inflate : distance invalide')).toBe(true);
    expect(looksCorrupt('annulé')).toBe(false);
    expect(COPY_CHUNK).toBe(8 * 1024 * 1024);
  });
});
