/**
 * Contrôle sous Node du chemin « navigateur » (inflate maison, PNG natif, lecture par tranches) contre la sortie du CLI :
 * `npx tsx tools/d2import/check-browser.ts <dossier game du CLI> <id|groupe>…` — JSON/texte octet pour octet, hachage du manifeste
 * identique (planches), pixels des PNG identiques (PNG décodés). Les identifiants sont ceux du catalogue (`paladin`, `ground_grass`,
 * `fx_…`, `icons:skills`, `ui`, `text:npc`…) ; `props`, `fx`, `extras`… sont des jetons de groupe.
 */
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import { openData, generateAsset, expandIds, CollectSink, type NamedSource } from './browser';

const [gameDir, ...ids] = process.argv.slice(2);
const inDir = process.env.D2_INPUT_DIR ?? join(process.env.D2_PRIVATE_DIR ?? join(process.env.HOME!, 'd2-private'), 'in');
const files: NamedSource[] = readdirSync(inDir)
  .filter((f) => f.toLowerCase().endsWith('.mpq'))
  .map((name) => {
    const fd = openSync(join(inDir, name), 'r');
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
void closeSync;

function pngPixelsHash(path: string): string {
  const d = readFileSync(path);
  const w = d.readUInt32BE(16);
  const h = d.readUInt32BE(20);
  const idat: Buffer[] = [];
  for (let p = 8; p < d.length;) {
    const len = d.readUInt32BE(p);
    if (d.toString('latin1', p + 4, p + 8) === 'IDAT') idat.push(d.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) raw.copy(px, y * w * 4, y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1));
  return createHash('sha1').update(px).digest('hex');
}

const data = openData(files);
const manifest = JSON.parse(readFileSync(join(gameDir, 'manifest.json'), 'utf8'));
let bad = 0;
let n = 0;
for (const id of expandIds(data, ids)) {
  const t0 = performance.now();
  const sink = new CollectSink();
  let ok = true;
  let detail = '';
  try {
    const r = await generateAsset(data, id, sink);
    const ref = r.kind === 'tile' ? manifest.tiles?.[id] : manifest.sheets?.[id];
    if (r.kind === 'sheet' && ref && (r.entry as { hash?: string }).hash !== ref.hash) {
      ok = false;
      detail = 'hash du manifeste';
    }
    for (const f of sink.files) {
      const p = join(gameDir, f.path);
      if (!existsSync(p)) {
        ok = false;
        detail = `absent de la référence : ${f.path}`;
      } else if (/\.(json|txt)$/.test(f.path)) {
        // les JSON de planche sont écrits compacts ; ceux du jeu (ui.json, icônes) sont indentés comme le CLI
        if (Buffer.compare(Buffer.from(f.bytes), readFileSync(p)) !== 0) {
          ok = false;
          detail = `JSON différent : ${f.path}`;
        }
      } else if (sink.pixelHashes[f.path] !== pngPixelsHash(p)) {
        ok = false;
        detail = `pixels différents : ${f.path}`;
      }
    }
    n += sink.files.length;
    detail ||= `${sink.files.length} fichiers`;
  } catch (e) {
    ok = false;
    detail = (e as Error).message;
  }
  if (!ok) bad++;
  console.log(`${id}: ${ok ? 'IDENTIQUE' : 'DIFFÉRENT'} (${detail}, ${Math.round(performance.now() - t0)} ms)`);
}
console.log(`${n} fichiers comparés, ${bad} écart(s)`);
process.exit(bad ? 1 : 0);
