import { describe, expect, it } from 'vitest';
import { closeSync, existsSync, fstatSync, openSync, readSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { MpqCore, type ByteSource } from '../../tools/d2import/mpq-core';
import { decodeDc6 } from '../../tools/d2import/formats/dc6';

const DIR = join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
const FILE = join(DIR, 'd2data.mpq');
const CANDIDATES = ['d2exp.mpq', 'd2data.mpq', 'd2char.mpq'];
const NAME = 'data\\global\\ui\\charselect\\charselectbckg.dc6';

function source(fd: number, zero?: [number, number]): ByteSource {
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
      if (zero) for (let i = 0; i < len; i++) if (pos + i >= zero[0] && pos + i < zero[1]) b[i] = 0;
      return b;
    },
  };
}

// nécessite les vrais fichiers de l'utilisateur (absents en CI : le test est ignoré)
describe.skipIf(!existsSync(FILE))('MPQ : région de la copie remplie de zéros (symptôme « DC6 version 0 » du téléphone)', () => {
  it('sain : DC6 version 6 ; zéros dans un secteur : erreur explicite (plus de zéros silencieux) et diagnostic parlant', () => {
    const arch = CANDIDATES.find((a) => existsSync(join(DIR, a)) && new MpqCore(a, source(openSync(join(DIR, a), 'r')), (d) => inflateSync(d)).has(NAME));
    expect(arch, 'le fichier doit être dans une des archives').toBeTruthy();
    const fd = openSync(join(DIR, arch!), 'r');
    try {
      const ok = new MpqCore(arch!, source(fd), (d) => inflateSync(d));
      expect(decodeDc6(ok.get(NAME)!).frames.length).toBeGreaterThan(0);
      const ex = ok.explain(NAME);
      const at = Number(/at (\d+)/.exec(ex)![1]);
      const tab = /sector table head ([0-9a-f ]+)/
        .exec(ex)![1]
        .split(' ')
        .slice(0, 4)
        .map((h) => parseInt(h, 16));
      const first = tab[0] | (tab[1] << 8) | (tab[2] << 16) | (tab[3] << 24);
      // le premier secteur (début des données stockées) est effacé sur 4 Ko : avant le correctif, get() rendait des zéros
      const bad = new MpqCore(arch!, source(fd, [at + first, at + first + 4096]), (d) => inflateSync(d));
      let msg = '';
      let silentVersion = -1;
      try {
        const d = bad.get(NAME)!;
        silentVersion = new DataView(d.buffer, d.byteOffset).getUint32(0, true);
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(silentVersion, 'aucun tampon mal rempli rendu en silence').toBe(-1);
      expect(msg).toMatch(/secteur décodé trop court|déjà|zéros|invalid|incorrect|erreur/i);
      expect(bad.explain(NAME)).toMatch(/first sector head 00 00 00 00 00 00 00 00/);
      expect(bad.explain(NAME)).toMatch(/zeros in first/);
    } finally {
      closeSync(fd);
    }
  });
});
