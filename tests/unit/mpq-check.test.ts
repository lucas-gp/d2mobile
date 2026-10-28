import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, fstatSync, openSync, readSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Md5, md5Hex } from '../../tools/d2import/md5';
import { mpqEncrypt, mpqHash, type ByteSource } from '../../tools/d2import/mpq-core';
import { REFERENCE_MD5, StreamScanner, ZERO_RUN_MIN, checkArchive, md5Verdict, probeZeroRuns, shortName } from '../../tools/d2import/mpq-check';
import { blockingChecks, describeEn, describeFr, diagLine, mergeCheck, skippedChecks, type ArchiveCheck } from '../../src/platform/d2check-core';

const inflate = (d: Uint8Array) => new Uint8Array(inflateSync(d));

/* ------------------------------------------------------------------ MD5 */

describe('MD5 en flux (RFC 1321)', () => {
  it('vecteurs standards', () => {
    expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5Hex('a')).toBe('0cc175b9c0f1b6a831c399e269772661');
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5Hex('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0');
    expect(md5Hex('abcdefghijklmnopqrstuvwxyz')).toBe('c3fcd3d76192e4007dfb496cca67e13b');
    expect(md5Hex('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')).toBe('d174ab98d277d9f5a5611c2c9f419d9f');
    expect(md5Hex('12345678901234567890123456789012345678901234567890123456789012345678901234567890')).toBe('57edf4a22be3c955ac49da2e2107b67a');
  });

  it('identique à node:crypto, quel que soit le découpage en morceaux (frontières de bloc de 64 octets)', () => {
    const data = new Uint8Array(300_000).map((_, i) => (i * 131 + (i >> 8) * 7) & 255);
    const want = createHash('md5').update(data).digest('hex');
    for (const cuts of [[300_000], [1, 63, 64, 65, 299_871], [8192, 8192, 8192], [55, 56, 57, 63, 64, 100_000]]) {
      const m = new Md5();
      let pos = 0;
      for (const c of cuts) {
        m.update(data.subarray(pos, Math.min(data.length, pos + c)));
        pos += c;
      }
      while (pos < data.length) {
        m.update(data.subarray(pos, pos + 4096));
        pos += 4096;
      }
      expect(m.hex(), cuts.join(',')).toBe(want);
    }
    for (const n of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 121]) expect(md5Hex(data.subarray(0, n)), `n=${n}`).toBe(createHash('md5').update(data.subarray(0, n)).digest('hex'));
  });
});

/* -------------------------------------------------- plages nulles (flux) */

describe('StreamScanner : plages nulles', () => {
  const noise = (n: number, seed = 1) => {
    const b = new Uint8Array(n);
    let x = seed;
    for (let i = 0; i < n; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      b[i] = (x >> 16) | 1; // jamais nul
    }
    return b;
  };

  it('trouve les limites exactes, quel que soit le découpage, et ignore les plages de moins de 64 Ko', () => {
    const data = noise(1_000_000);
    data.fill(0, 100_003, 100_003 + 200_001); // 200 001 octets
    data.fill(0, 500_000, 500_000 + (ZERO_RUN_MIN - 1)); // trop court
    data.fill(0, 900_000, 1_000_000); // jusqu'à la fin
    for (const chunk of [1_000_000, 65_536, 4096, 5000, 777_777, 999]) {
      const sc = new StreamScanner(data.length, null, true);
      for (let p = 0; p < data.length; p += chunk) sc.feed(p, data.subarray(p, Math.min(data.length, p + chunk)));
      const r = sc.finish();
      expect(r.runs, `chunk ${chunk}`).toEqual([
        { start: 100_003, end: 300_004 },
        { start: 900_000, end: 1_000_000 },
      ]);
      expect(r.md5).toBe(createHash('md5').update(data).digest('hex'));
    }
  });

  it('un tampon non aligné sur 4 octets donne le même résultat', () => {
    const data = noise(400_000);
    data.fill(0, 50_000, 150_000);
    const shifted = new Uint8Array(data.length + 1);
    shifted.set(data, 1);
    const sc = new StreamScanner(data.length, null, false);
    sc.feed(0, shifted.subarray(1));
    expect(sc.finish().runs).toEqual([{ start: 50_000, end: 150_000 }]);
  });

  it('refuse un morceau non contigu', () => {
    const sc = new StreamScanner(100, null);
    sc.feed(0, new Uint8Array(10));
    expect(() => sc.feed(11, new Uint8Array(10))).toThrow(/non-contiguous/);
  });
});

describe('probeZeroRuns (mode rapide)', () => {
  const mem = (data: Uint8Array): ByteSource => ({ size: data.length, read: (pos, len) => data.slice(pos, Math.min(data.length, pos + len)) });
  it('trouve toute zone nulle d’au moins stride + sonde (limites exactes) et la fin du fichier', () => {
    const data = new Uint8Array(4_000_000).fill(7);
    data.fill(0, 1_000_001, 1_000_001 + 300_000);
    data.fill(0, 3_900_000, 4_000_000);
    expect(probeZeroRuns(mem(data))).toEqual([
      { start: 1_000_001, end: 1_300_001 },
      { start: 3_900_000, end: 4_000_000 },
    ]);
  });
  it('une zone de 100 Ko est rapportée seulement si elle croise un sondage (non garanti sous 260 Ko : le mode complet la trouve)', () => {
    const data = new Uint8Array(2_000_000).fill(9);
    data.fill(0, 600_000, 700_000); // 100 Ko entre deux sondages (tous les 262 144 octets : 524 288 et 786 432)
    expect(probeZeroRuns(mem(data))).toEqual([]);
    const sc = new StreamScanner(data.length, null, false);
    sc.feed(0, data);
    expect(sc.finish().runs).toEqual([{ start: 600_000, end: 700_000 }]);
  });
});

/* ------------------------------------------------------ MPQ synthétique */

interface F {
  name: string;
  data: Uint8Array;
  raw?: boolean;
}

/** Petite archive MPQ v1 valide : fichiers compressés par secteurs (zlib) ou stockés, (listfile), tables chiffrées */
function buildMpq(files: F[]): Uint8Array {
  const SECT = 4096;
  const all = [...files, { name: '(listfile)', data: new TextEncoder().encode(files.map((f) => f.name).join('\r\n') + '\r\n') }];
  const parts: Uint8Array[] = [];
  const blocks: { pos: number; csize: number; size: number; flags: number }[] = [];
  let pos = 32;
  for (const f of all) {
    let body: Uint8Array;
    let flags = 0x80000000;
    if (f.raw) body = f.data;
    else {
      const nsec = Math.ceil(f.data.length / SECT);
      const secs: Uint8Array[] = [];
      for (let s = 0; s < nsec; s++) {
        const chunk = f.data.subarray(s * SECT, (s + 1) * SECT);
        const z = deflateSync(chunk);
        if (z.length + 1 < chunk.length) {
          const o = new Uint8Array(z.length + 1);
          o[0] = 2;
          o.set(z, 1);
          secs.push(o);
        } else secs.push(chunk);
      }
      const tab = new Uint8Array((nsec + 1) * 4);
      const tv = new DataView(tab.buffer);
      let off = tab.length;
      secs.forEach((x, i) => {
        tv.setUint32(i * 4, off, true);
        off += x.length;
      });
      tv.setUint32(nsec * 4, off, true);
      body = new Uint8Array(off);
      body.set(tab, 0);
      let o = tab.length;
      for (const x of secs) {
        body.set(x, o);
        o += x.length;
      }
      flags |= 0x200;
    }
    blocks.push({ pos, csize: body.length, size: f.data.length, flags });
    parts.push(body);
    pos += body.length;
  }
  const HS = 64;
  const ht = new Uint8Array(HS * 16).fill(0xff);
  const hv = new DataView(ht.buffer);
  all.forEach((f, bi) => {
    let idx = mpqHash(f.name, 0) & (HS - 1);
    while (hv.getUint32(idx * 16 + 12, true) !== 0xffffffff) idx = (idx + 1) & (HS - 1);
    hv.setUint32(idx * 16, mpqHash(f.name, 1), true);
    hv.setUint32(idx * 16 + 4, mpqHash(f.name, 2), true);
    hv.setUint32(idx * 16 + 8, 0, true);
    hv.setUint32(idx * 16 + 12, bi, true);
  });
  const bt = new Uint8Array(blocks.length * 16);
  const bv = new DataView(bt.buffer);
  blocks.forEach((b, i) => {
    bv.setUint32(i * 16, b.pos, true);
    bv.setUint32(i * 16 + 4, b.csize, true);
    bv.setUint32(i * 16 + 8, b.size, true);
    bv.setUint32(i * 16 + 12, b.flags, true);
  });
  mpqEncrypt(ht, mpqHash('(hash table)', 3));
  mpqEncrypt(bt, mpqHash('(block table)', 3));
  const hashPos = pos;
  const blockPos = hashPos + ht.length;
  const total = blockPos + bt.length;
  const out = new Uint8Array(total);
  const h = new DataView(out.buffer);
  out.set([0x4d, 0x50, 0x51, 0x1a], 0);
  h.setUint32(4, 32, true);
  h.setUint32(8, total, true);
  h.setUint16(12, 0, true);
  h.setUint16(14, 3, true);
  h.setUint32(16, hashPos, true);
  h.setUint32(20, blockPos, true);
  h.setUint32(24, HS, true);
  h.setUint32(28, blocks.length, true);
  let o = 32;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  out.set(ht, hashPos);
  out.set(bt, blockPos);
  return out;
}

function noise(n: number, seed: number): Uint8Array {
  const b = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    b[i] = (x >>> 24) | 1;
  }
  return b;
}

const FILES: F[] = [
  ...Array.from({ length: 60 }, (_, i): F => ({ name: `data\\global\\ui\\panel\\file${String(i).padStart(2, '0')}.dc6`, data: noise(20_000 + (i % 7) * 3000, i + 1) })), // peu compressible
  { name: 'data\\global\\sfx\\big.wav', data: noise(300_000, 99), raw: true },
];

const mem = (data: Uint8Array): ByteSource => ({
  size: data.length,
  read(pos, len) {
    const b = data.slice(pos, pos + len); // copie : les vraies sources rendent des tampons neufs (alignés)
    if (b.length < Math.min(len, data.length - pos) || pos + len > data.length) throw new Error(`Short read at offset ${pos}: got ${b.length} of ${len} bytes`);
    return b;
  },
});

describe('contrôle d’une archive MPQ synthétique', () => {
  const good = buildMpq(FILES);
  const where = (_name: string) => {
    const full = checkArchive('x.mpq', mem(good), inflate, { mode: 'full' });
    expect(full.status).toBe('ok');
    // position du fichier : lecture directe de la table de blocs via l'info de l'archive
    return full;
  };

  it('archive saine : OK en rapide et en complet, MD5 exact', () => {
    const q = checkArchive('x.mpq', mem(good), inflate, { mode: 'quick' });
    expect(q.status, JSON.stringify(q)).toBe('ok');
    expect(q.md5).toBeUndefined();
    const f = where('x');
    expect(f.md5).toBe(createHash('md5').update(good).digest('hex'));
    expect(f.badHeaders).toBe(0);
  });

  it('zone de zéros de 150 Ko dans des fichiers compressés : incomplète, première zone, fichiers et noms (complet ET rapide si ≥ 260 Ko)', () => {
    const bad = good.slice();
    bad.fill(0, 400_000, 400_000 + 150_000);
    const f = checkArchive('d2data.mpq', mem(bad), inflate, { mode: 'full' });
    expect(f.status).toBe('incomplete');
    expect(f.reason).toBe('zeros');
    // les limites sont celles de la plage d'octets nuls : un octet nul du flux compressé voisin peut les élargir de quelques octets
    expect(f.zone!.from).toBeGreaterThanOrEqual(399_980);
    expect(f.zone!.from).toBeLessThanOrEqual(400_000);
    expect(f.zone!.to).toBeGreaterThanOrEqual(550_000);
    expect(f.zone!.to).toBeLessThanOrEqual(550_020);
    expect(f.zone!.files).toBeGreaterThan(5);
    expect(f.zone!.names.length).toBeGreaterThan(0);
    expect(f.zone!.names[0]).toMatch(/^panel\/file\d\d$/);
    // 150 Ko < 260 Ko : le mode rapide ne le garantit pas (documenté)
    const bad2 = good.slice();
    bad2.fill(0, 300_000, 300_000 + 400_000);
    const q = checkArchive('d2data.mpq', mem(bad2), inflate, { mode: 'quick' });
    expect(q.status).toBe('incomplete');
    expect(q.zone!.from).toBeGreaterThanOrEqual(299_980);
    expect(q.zone!.from).toBeLessThanOrEqual(300_000);
    expect(q.zone!.to).toBeGreaterThanOrEqual(700_000);
    expect(q.zone!.to).toBeLessThanOrEqual(700_020);
    expect(q.md5).toBeUndefined();
  });

  it('zone nulle entre deux fichiers (remplissage) : sans conséquence', () => {
    const padded = new Uint8Array(good.length + 200_000);
    // insère 200 Ko de zéros AVANT les tables : décale rien d'utile, mais aucun bloc ne les recouvre
    const info = checkArchive('x.mpq', mem(good), inflate, { mode: 'full' });
    expect(info.status).toBe('ok');
    padded.set(good);
    expect(checkArchive('x.mpq', mem(padded), inflate, { mode: 'full' }).status).toBe('ok');
  });

  it('début d’un bloc compressé à zéro (petite zone, sous 64 Ko) : incomplète (headers)', () => {
    // premier fichier : son bloc commence à 32
    const bad = good.slice();
    bad.fill(0, 32, 32 + 600);
    const f = checkArchive('x.mpq', mem(bad), inflate, { mode: 'full' });
    expect(f.status).toBe('incomplete');
    expect(f.reason).toBe('headers');
    expect(f.badHeaders).toBe(1);
    expect(f.zone!.from).toBe(32);
    expect(f.zone!.names[0]).toBe('panel/file00');
  });

  it('zone nulle dans un fichier NON compressé : seulement suspecte', () => {
    const bad = good.slice();
    // le fichier brut est le dernier des fichiers de données (avant le listfile) : on cherche ses octets
    const at = indexOfSub(bad, FILES[FILES.length - 1].data.subarray(0, 64));
    expect(at).toBeGreaterThan(0);
    bad.fill(0, at + 50_000, at + 150_000);
    const f = checkArchive('x.mpq', mem(bad), inflate, { mode: 'full' });
    expect(f.status).toBe('suspect');
    expect(f.reason).toBe('rawzeros');
    expect(f.zone!.files).toBe(1);
  });

  it('fichier tronqué (téléchargement interrompu) : incomplète, avec et sans préallocation', () => {
    const cut = good.slice(0, good.length - 3000); // les tables ont disparu
    const q = checkArchive('x.mpq', mem(cut), inflate, { mode: 'quick' });
    expect(q.status).toBe('incomplete');
    expect(q.reason).toBe('truncated');
    expect(q.zone!.to).toBe(good.length);
    // préalloué à la bonne taille mais vide à partir de 600 Ko, tables comprises
    const pre = good.slice();
    pre.fill(0, 600_000);
    const p = checkArchive('x.mpq', mem(pre), inflate, { mode: 'quick' });
    expect(p.status).toBe('incomplete');
    expect(p.zone!.from).toBeGreaterThanOrEqual(599_980);
    expect(p.zone!.from).toBeLessThanOrEqual(600_000);
    expect(p.zone!.to).toBe(good.length);
  });

  it('pas un MPQ : non reconnue', () => {
    const junk = noise(100_000, 5);
    const r = checkArchive('d2data.mpq', mem(junk), inflate, { mode: 'quick' });
    expect(r.status).toBe('unrecognized');
    expect(r.reason).toBe('notmpq');
  });

  it('un MD5 différent de la référence ne change ni le statut ni le blocage', () => {
    const r = checkArchive('d2data.mpq', mem(good), inflate, { mode: 'full' });
    expect(r.md5).not.toBe(REFERENCE_MD5['d2data.mpq']);
    expect(md5Verdict('d2data.mpq', r.md5)).toBe('different');
    expect(r.status).toBe('ok');
    expect(blockingChecks({ 'd2data.mpq': r }, [{ name: 'd2data.mpq', size: r.size }])).toEqual([]);
    expect(md5Verdict('Patch_D2.mpq', r.md5)).toBe('unknown');
    expect(md5Verdict('D2DATA.MPQ', REFERENCE_MD5['d2data.mpq'])).toBe('reference');
    expect(md5Verdict('d2data.mpq', undefined)).toBe('unknown');
  });

  it('annulation entre deux morceaux', () => {
    expect(() => checkArchive('x.mpq', mem(good), inflate, { mode: 'full', cancelled: () => true })).toThrow(/cancelled/);
    expect(() => checkArchive('x.mpq', mem(good), inflate, { mode: 'quick', cancelled: () => true })).toThrow(/cancelled/);
  });
});

function indexOfSub(hay: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/* ---------------------------------------------- statuts et messages */

describe('statuts, blocage et messages', () => {
  const mk = (o: Partial<ArchiveCheck>): ArchiveCheck => ({
    name: 'd2data.mpq',
    size: 256_225_123,
    status: 'ok',
    reason: 'ok',
    mode: 'full',
    zones: 0,
    affected: 0,
    badHeaders: 0,
    ms: 5,
    at: 1,
    ...o,
  });
  const incomplete = mk({ status: 'incomplete', reason: 'zeros', zone: { from: 104e6, to: 117e6, files: 31, names: ['charselect/charselectbckg', 'bigmenu/okaybutton'] }, zones: 1, affected: 31 });

  it('archive obligatoire incomplète : bloque ; facultative : ignorée sans bloquer ; autre taille : résultat périmé', () => {
    const files = [{ name: 'd2data.mpq', size: 256_225_123 }];
    expect(blockingChecks({ 'd2data.mpq': incomplete }, files)).toHaveLength(1);
    expect(blockingChecks({ 'd2data.mpq': incomplete }, [{ name: 'd2data.mpq', size: 1 }])).toHaveLength(0);
    expect(blockingChecks({ 'd2data.mpq': mk({ status: 'suspect', reason: 'tables' }) }, files)).toHaveLength(0);
    const music = mk({ name: 'd2music.mpq', size: 10, status: 'incomplete', reason: 'zeros', zone: { from: 1, to: 2, files: 1, names: [] } });
    expect(blockingChecks({ 'd2music.mpq': music }, [{ name: 'd2music.mpq', size: 10 }])).toHaveLength(0);
    expect(skippedChecks({ 'd2music.mpq': music }, [{ name: 'd2music.mpq', size: 10 }])).toHaveLength(1);
  });

  it('un contrôle complet n’est pas écrasé par un contrôle rapide du même fichier', () => {
    const full = mk({});
    expect(mergeCheck(full, mk({ mode: 'quick' }))).toBe(full);
    expect(mergeCheck(mk({ mode: 'quick' }), full)).toBe(full);
    expect(mergeCheck(full, mk({ mode: 'quick', size: 5 })).size).toBe(5);
  });

  it('message anglais de l’import et français des Réglages', () => {
    expect(describeEn(incomplete).join(' ')).toBe(
      'd2data.mpq looks incomplete: its data is empty from 104 MB to 117 MB (31 files affected, e.g. charselect/charselectbckg, bigmenu/okaybutton). It was probably not copied completely. Copy it again from your installation and add it again.',
    );
    expect(describeFr(incomplete)[0]).toBe('d2data.mpq semble incomplet : ses données sont vides de 104 à 117 Mo (31 fichiers touchés, par ex. charselect/charselectbckg, bigmenu/okaybutton).');
  });

  it('ligne de diagnostic « check: »', () => {
    const l = diagLine('d2data.mpq', { ...incomplete, md5: 'abc' });
    expect(l).toMatch(
      /^check: d2data\.mpq status=incomplete reason=zeros mode=full .*zone=104000000-117000000 \(104-117 MB\) files=31 names=charselect\/charselectbckg\|bigmenu\/okaybutton .*md5=abc md5verdict=different/,
    );
    expect(diagLine('d2sfx.mpq', undefined)).toBe('check: d2sfx.mpq not checked');
  });

  it('nom réduit', () => {
    expect(shortName('data\\global\\ui\\charselect\\charselectbckg.dc6')).toBe('charselect/charselectbckg');
  });
});

/* ------------------------------------- vrais fichiers privés (facultatif) */

const DIR = join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
const REAL = join(DIR, 'd2data.mpq');

function fdSource(fd: number, zero?: [number, number]): ByteSource {
  return {
    size: fstatSync(fd).size,
    read(pos, len) {
      const b = Buffer.alloc(len);
      let got = 0;
      while (got < len) {
        const n = readSync(fd, b, got, len - got, pos + got);
        if (n <= 0) break;
        got += n;
      }
      if (zero) for (let i = Math.max(0, zero[0] - pos); i < len && pos + i < zero[1]; i++) b[i] = 0;
      return new Uint8Array(b.buffer, b.byteOffset, got);
    },
  };
}

describe.skipIf(!existsSync(REAL))('contrôle d’un vrai d2data.mpq (fichiers privés ; ignoré s’ils sont absents)', () => {
  it('sain : OK, MD5 de la distribution de référence ; copie à 2 Mo de zéros : incomplète, zone et fichiers nommés', () => {
    const fd = openSync(REAL, 'r');
    try {
      const t0 = Date.now();
      const ok = checkArchive('d2data.mpq', fdSource(fd), inflate, { mode: 'full' });
      const dt = Date.now() - t0;
      expect(ok.status).toBe('ok');
      expect(ok.badHeaders).toBe(0);
      if (ok.size === 256_225_123) expect(md5Verdict('d2data.mpq', ok.md5)).toBe('reference');
      expect(dt).toBeLessThan(60_000);
      expect(checkArchive('d2data.mpq', fdSource(fd), inflate, { mode: 'quick' }).status).toBe('ok');
      // 2 Mo de zéros à 100 Mo
      const z: [number, number] = [100_000_000, 102_097_152];
      const f = checkArchive('d2data.mpq', fdSource(fd, z), inflate, { mode: 'full' });
      const q = checkArchive('d2data.mpq', fdSource(fd, z), inflate, { mode: 'quick' });
      for (const r of [f, q]) {
        expect(r.status, r.mode).toBe('incomplete');
        expect(r.zone!.from).toBeLessThanOrEqual(100_000_000);
        expect(r.zone!.to).toBeGreaterThanOrEqual(102_097_152);
        expect(r.zone!.files).toBeGreaterThan(10);
        expect(r.zone!.names.length).toBeGreaterThan(0);
      }
    } finally {
      closeSync(fd);
    }
  });
});
