/**
 * Contrôle de la génération à un seul palier (mode local paresseux) : les fichiers du palier demandé sont identiques, octet pour octet,
 * à ceux d'une génération des deux paliers, et l'autre palier n'est pas écrit.
 *   npx tsx tools/d2import/check-tiers.ts <id|groupe>…   (archives : $D2_INPUT_DIR ou $D2_PRIVATE_DIR/in)
 */
import { closeSync, fstatSync, openSync, readSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CollectSink, expandIds, generateAsset, openData, type NamedSource } from './browser';

const inDir = process.env.D2_INPUT_DIR ?? join(process.env.D2_PRIVATE_DIR ?? join(process.env.HOME!, 'd2-private'), 'in');
const fds: number[] = [];
const files: NamedSource[] = readdirSync(inDir)
  .filter((f) => f.toLowerCase().endsWith('.mpq'))
  .map((name) => {
    const fd = openSync(join(inDir, name), 'r');
    fds.push(fd);
    return {
      name,
      source: {
        size: fstatSync(fd).size,
        read(pos: number, len: number) {
          const b = new Uint8Array(len);
          readSync(fd, b, 0, len, pos);
          return b;
        },
      },
    };
  });
const data = openData(files);
const ids = expandIds(data, process.argv.slice(2));
let bad = 0;
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
for (const id of ids) {
  const full = new CollectSink();
  await generateAsset(data, id, full);
  for (const tier of ['lo', 'hi'] as const) {
    const one = new CollectSink();
    const t0 = performance.now();
    const r = await generateAsset(data, id, one, [tier]);
    const ms = Math.round(performance.now() - t0);
    const want = full.files.filter((f) => f.path.startsWith(`${tier}/`));
    const other = one.files.filter((f) => !f.path.startsWith(`${tier}/`));
    const miss = want.filter((w) => !one.files.some((o) => o.path === w.path && same(o.bytes, w.bytes)));
    const ok = want.length > 0 && !miss.length && !other.length && one.files.length === want.length;
    if (!ok) bad++;
    console.log(
      `${ok ? 'IDENTIQUE' : 'DIFFÉRENT'} ${id} [${tier} seul] : ${one.files.length} fichiers, ${ms} ms${other.length ? `, ${other.length} fichiers de l'autre palier` : ''}${miss.length ? `, écarts : ${miss.map((m) => m.path).join(',')}` : ''}${r.entry && 'tiers' in r.entry ? '' : ''}`,
    );
  }
}
for (const fd of fds) closeSync(fd);
process.exit(bad ? 1 : 0);
