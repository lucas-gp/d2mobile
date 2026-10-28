/**
 * Position (dans l'archive qui le contient) du premier secteur stocké d'un fichier : sert aux e2e qui abîment la copie à cet endroit.
 *   npx tsx tools/e2e/mpq-locate.ts <dossier> <chemin D2>   →   {"archive":"d2exp.mpq","at":123456}
 */
import { closeSync, existsSync, fstatSync, openSync, readSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import { MpqCore } from '../d2import/mpq-core';

const [dir, name] = process.argv.slice(2);
for (const a of ['d2exp.mpq', 'd2data.mpq', 'd2char.mpq']) {
  if (!existsSync(join(dir, a))) continue;
  const fd = openSync(join(dir, a), 'r');
  const m = new MpqCore(
    a,
    {
      size: fstatSync(fd).size,
      read(pos, len) {
        const b = Buffer.alloc(len);
        readSync(fd, b, 0, len, pos);
        return b;
      },
    },
    (d) => inflateSync(d),
  );
  if (m.has(name)) {
    const ex = m.explain(name);
    const at = Number(/at (\d+)/.exec(ex)![1]);
    const t = /sector table head ([0-9a-f ]+)/
      .exec(ex)![1]
      .split(' ')
      .slice(0, 4)
      .map((h) => parseInt(h, 16));
    console.log(JSON.stringify({ archive: a, at: at + (t[0] | (t[1] << 8) | (t[2] << 16)) }));
    closeSync(fd);
    process.exit(0);
  }
  closeSync(fd);
}
process.exit(1);
