/**
 * Fabrique un personnage .d2s synthétique (Sorcière de niveau 80 en Cauchemar, équipée) pour essayer l'import.
 * Usage : npx tsx tools/d2s/make-sample.ts [sortie.d2s]
 */
import { writeFileSync } from 'node:fs';
import { D2S_TABLES as T } from '../../src/sim/d2s/tables';
import { encodeD2s, newItem } from '../../tests/unit/d2s-encoder';

const out = process.argv[2] ?? 'sample.d2s';
const idx = (l: [string, string][], n: string) => l.findIndex((u) => u[0] === n);
const rune = (code: string) => newItem(code, { simple: true, location: 6, page: 0 });
const spirit = Number(Object.entries(T.runewords).find(([, v]) => v[0] === 'Spirit')![0]);
writeFileSync(
  out,
  encodeD2s({
    name: 'Zorg',
    classIndex: 1,
    level: 80,
    difficulty: 1,
    baalNormal: true,
    attrs: { str: 60, ene: 150, dex: 70, vit: 200, statPoints: 3, skillPoints: 2, xp: 0, gold: 4321, stashGold: 99999, hp: 800, mana: 600 },
    skills: { 47: 20, 59: 20, 64: 20, 54: 1, 65: 20, 50: 5 },
    items: [
      newItem('xap', { location: 1, equipped: 1, defense: 90, maxDur: 12, dur: 12, quality: 7, uniqueId: idx(T.uniques, 'Harlequin Crest') }),
      newItem('rin', {
        location: 1,
        equipped: 6,
        quality: 7,
        uniqueId: idx(T.uniques, 'The Stone of Jordan'),
        props: [
          { id: 127, v: [1] },
          { id: 9, v: [25] },
        ],
      }),
      newItem('crs', {
        location: 1,
        equipped: 4,
        quality: 2,
        runeword: true,
        runewordId: spirit,
        socketed: true,
        sockets: 4,
        children: ['r07', 'r10', 'r09', 'r11'].map(rune),
        maxDur: 70,
        dur: 70,
        rwProps: [{ id: 105, v: [35] }],
      }),
      newItem('r24', { simple: true, x: 5, y: 0 }),
      newItem('hp5', { simple: true, location: 2, page: 0, x: 0 }),
    ],
  }),
);
console.log(`écrit : ${out}`);
