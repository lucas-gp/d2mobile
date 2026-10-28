/**
 * Contrôle du décodage audio de mpq-core.ts (Huffman + ADPCM) contre une référence produite par StormLib (tools/d2audio/storm.py) :
 *   npx tsx tools/d2import/check-audio.ts <dossier-des-archives-audio> <dossier-de-référence>
 * La référence est `ref.json` ({ archive: [[chemin, fichier, taille]…] }) plus les WAV extraits par StormLib. Comparaison octet par octet
 * (donc échantillon par échantillon) ; aucune donnée Blizzard n'est écrite dans le dépôt. Sort avec un code non nul au premier écart.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Mpq } from './mpq';
import { parseWav, streamMonoWav } from './audio-build';

const [arcDir, refDir] = process.argv.slice(2);
if (!arcDir || !refDir) {
  console.error('usage : check-audio.ts <archives> <référence>');
  process.exit(2);
}
const ref = JSON.parse(readFileSync(join(refDir, 'ref.json'), 'utf8')) as Record<string, [string, string, number][]>;
let bad = 0;
for (const [arc, list] of Object.entries(ref)) {
  const m = new Mpq(join(arcDir, `${arc}.mpq`));
  let ok = 0;
  let ms = 0;
  let bytes = 0;
  for (const [name, file, size] of list) {
    const want = readFileSync(join(refDir, file));
    const t = performance.now();
    const got = m.get(name);
    ms += performance.now() - t;
    if (!got) {
      console.log(`  ABSENT ${name}`);
      bad++;
      continue;
    }
    bytes += got.length;
    // même contenu, aussi par tranches (stream)
    const parts: Uint8Array[] = [];
    m.stream(name, (c) => void parts.push(c.slice()), 64 * 1024);
    const cat = Buffer.concat(parts);
    if (got.length !== size || Buffer.compare(Buffer.from(got), want) !== 0 || Buffer.compare(cat, want) !== 0) {
      console.log(`  ÉCART ${name} : ${got.length} octets, attendu ${size}`);
      bad++;
      continue;
    }
    ok++;
    if (arc === 'd2music') {
      // mélange mono par tranches : (G + D) >> 1 sur chaque trame de la référence stéréo
      const mono = streamMonoWav((sink) => m.stream(name, (c) => sink(c.slice()), 64 * 1024), size);
      const w = parseWav(want)!;
      const frames = Math.floor(Math.min(w.dataLen, size - w.dataStart) / 4);
      const wv = new DataView(want.buffer, want.byteOffset);
      let same = !!mono && mono.length === 44 + frames * 2;
      const mv = mono ? new DataView(mono.buffer, mono.byteOffset) : null;
      for (let i = 0; same && i < frames; i++) if (mv!.getInt16(44 + i * 2, true) !== (wv.getInt16(w.dataStart + i * 4, true) + wv.getInt16(w.dataStart + i * 4 + 2, true)) >> 1) same = false;
      if (!same) {
        console.log(`  ÉCART mono ${name}`);
        bad++;
      } else ok++;
    }
  }
  console.log(
    `${arc} : ${ok}/${list.length + (arc === 'd2music' ? list.length : 0)} contrôles identiques, ${(bytes / 1048576).toFixed(1)} Mo décodés en ${ms.toFixed(0)} ms (${(bytes / 1048576 / (ms / 1000)).toFixed(0)} Mo/s)`,
  );
  m.close();
}
process.exit(bad ? 1 : 0);
