/**
 * Export des icônes d'inventaire (DC6) : PNG individuel par objet avec la palette standard ; variantes de
 * couleur (tables InvTrans → invgrey / invgrey2 / invgreybrown, 21 teintes de colors.txt) quand elles existent.
 */
import { join } from 'node:path';
import type { GameData } from './data';
import { slug } from './data';
import { decodeDc6 } from './formats/dc6';
import type { Row } from './formats/txt';
import { encodePng } from './png';
import { writeFileEnsured, writeJson, updateManifest } from './manifest';
import { ICONS } from './scope';

export interface IconEntry {
  code: string;
  name: string;
  type: string;
  cells: { w: number; h: number };
  file: string;
  size: { w: number; h: number };
  variants: { color: string; file: string }[];
}

const INV_TABLES: Record<string, string> = { '1': 'invgrey', '2': 'invgrey2', '3': 'invgreybrown' };

export function exportIcons(data: GameData, outDir: string, log: (s: string) => void, palName = 'act1', codes: string[] = ICONS): IconEntry[] {
  const { vfs } = data;
  const pal = data.palette(palName);
  const colors = data.table('colors')?.rows ?? [];
  const rows: (Row & { __table: string })[] = ['weapons', 'armor', 'misc'].flatMap((t) => data.needTable(t).rows.map((r) => ({ ...r, __table: t })));
  const out: IconEntry[] = [];
  for (const code of codes) {
    const r = rows.find((x) => x.code === code);
    if (!r || !r.invfile) {
      log(`  ! objet sans icône : ${code}`);
      continue;
    }
    const bytes = vfs.get(`data\\global\\items\\${r.invfile}.dc6`);
    if (!bytes) {
      log(`  ! DC6 absent : ${r.invfile}`);
      continue;
    }
    const img = decodeDc6(bytes).frames[0];
    const render = (map?: Uint8Array): Uint8Array => {
      const o = new Uint8Array(img.w * img.h * 4);
      for (let i = 0; i < img.w * img.h; i++) {
        let c = img.px[i];
        if (!c) continue;
        if (map) c = map[c];
        o[i * 4] = pal[c * 3];
        o[i * 4 + 1] = pal[c * 3 + 1];
        o[i * 4 + 2] = pal[c * 3 + 2];
        o[i * 4 + 3] = 255;
      }
      return o;
    };
    const base = `items/icons/${code}-${slug(r.name)}`;
    writeFileEnsured(join(outDir, `${base}.png`), encodePng(img.w, img.h, render()));
    const variants: IconEntry['variants'] = [];
    const tblName = INV_TABLES[r.InvTrans ?? ''];
    const tbl = tblName ? vfs.get(`data\\global\\items\\palette\\${tblName}.dat`) : null;
    if (tbl && tbl.length >= colors.length * 256) {
      colors.forEach((c, k) => {
        const file = `${base}.${c.Code}.png`;
        writeFileEnsured(join(outDir, file), encodePng(img.w, img.h, render(tbl.subarray(k * 256, (k + 1) * 256))));
        variants.push({ color: c.Code, file });
      });
    }
    out.push({
      code,
      name: data.str(r.name),
      type: r.type,
      cells: { w: Number(r.invwidth), h: Number(r.invheight) },
      file: `${base}.png`,
      size: { w: img.w, h: img.h },
      variants,
    });
    log(`  ${code} ${data.str(r.name)} : ${img.w}×${img.h}${variants.length ? `, ${variants.length} variantes (${tblName})` : ''}`);
  }
  writeJson(join(outDir, 'items/icons/icons.json'), {
    palette: palName,
    variantNote: 'InvTrans 1/2/3 → invgrey/invgrey2/invgreybrown, teinte k = ligne k de colors.txt (correspondance conventionnelle, non vérifiée par comparaison avec le jeu)',
    icons: out,
  });
  updateManifest(outDir, 'icons', out);
  return out;
}
