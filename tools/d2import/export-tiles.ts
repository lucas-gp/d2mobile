/**
 * Export des tuiles d'un niveau : les DT1 d'un type de niveau (lvltypes.txt) sont décodés, chaque tuile est
 * écrite en PNG individuel (sol / mur / autre) avec ses métadonnées isométriques, puis regroupée dans un atlas.
 */
import { join } from 'node:path';
import type { GameData } from './data';
import { slug } from './data';
import { decodeDt1, type Dt1Tile } from './formats/dt1';
import { encodePng } from './png';
import { pack } from './atlas';
import { writeFileEnsured, writeJson, updateManifest } from './manifest';
import { LEVELS } from './scope';

export interface TileSetEntry {
  level: string;
  slug: string;
  act: number;
  dir: string;
  tiles: number;
  atlasPages: number;
  json: string;
}

function toRgba(t: Dt1Tile, pal: Uint8Array): Uint8Array {
  const { w, h, px } = t.image;
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const c = px[i];
    if (!c) continue;
    out[i * 4] = pal[c * 3];
    out[i * 4 + 1] = pal[c * 3 + 1];
    out[i * 4 + 2] = pal[c * 3 + 2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

export function exportTiles(data: GameData, outDir: string, log: (s: string) => void): TileSetEntry[] {
  const { vfs } = data;
  const levels = data.needTable('levels');
  const types = data.needTable('lvltypes');
  const res: TileSetEntry[] = [];
  for (const spec of LEVELS) {
    const row = levels.rows.find((r) => (r.LevelName ? data.str(r.LevelName) : r.Name).toLowerCase() === spec.name.toLowerCase());
    if (!row) {
      log(`  ! niveau introuvable dans levels.txt : ${spec.name}`);
      continue;
    }
    const act = Number(row.Act) + 1;
    const typeRow = types.rows.find((r) => r.Id === row.LevelType);
    if (!typeRow) {
      log(`  ! type de niveau introuvable : ${row.LevelType}`);
      continue;
    }
    const files = Object.entries(typeRow)
      .filter(([k, v]) => /^File \d+$/.test(k) && v && v !== '0')
      .map(([, v]) => v);
    const pal = data.palette(act);
    const dir = join('tiles', `act${act}`, spec.slug);
    interface Rec {
      id: string;
      file: string;
      dt1: string;
      kind: string;
      orientation: number;
      mainIndex: number;
      subIndex: number;
      rarity: number;
      w: number;
      h: number;
      ox: number;
      oy: number;
      declared: { w: number; h: number };
      roofHeight: number;
      blocks: number;
      /** couleur moyenne des pixels opaques (aide au choix de tuiles dans les aperçus) */
      color: [number, number, number];
      /** nombre de pixels opaques (un sol plein en compte 6400) */
      opaque: number;
      atlas?: { page: number; x: number; y: number };
      rgba: Uint8Array;
    }
    const recs: Rec[] = [];
    const sources: { dt1: string; tiles: number }[] = [];
    for (const f of files) {
      const path = `data\\global\\tiles\\${f.replace(/\//g, '\\')}`;
      const bytes = vfs.get(path);
      if (!bytes) {
        log(`  ! DT1 absent : ${path}`);
        continue;
      }
      const tiles = decodeDt1(bytes);
      const base = slug(f.replace(/\.dt1$/i, '').replace(/^act\d\//i, ''));
      sources.push({ dt1: f, tiles: tiles.length });
      for (const t of tiles) {
        if (!t.image.px.some((p) => p)) continue;
        const sub = t.kind === 'floor' ? 'floor' : t.kind === 'wall' ? 'wall' : 'other';
        const id = `${base}-${String(t.index).padStart(4, '0')}`;
        recs.push({
          id,
          file: `${sub}/${id}.png`,
          dt1: f,
          kind: t.kind,
          orientation: t.orientation,
          mainIndex: t.mainIndex,
          subIndex: t.subIndex,
          rarity: t.rarity,
          w: t.image.w,
          h: t.image.h,
          ox: t.image.ox,
          oy: t.image.oy,
          declared: { w: t.width, h: t.height },
          roofHeight: t.roofHeight,
          blocks: t.blocks,
          color: [0, 0, 0],
          opaque: 0,
          rgba: toRgba(t, pal),
        });
        const last = recs[recs.length - 1];
        let n = 0;
        const sum = [0, 0, 0];
        for (let i = 0; i < last.rgba.length; i += 4) {
          if (!last.rgba[i + 3]) continue;
          n++;
          sum[0] += last.rgba[i];
          sum[1] += last.rgba[i + 1];
          sum[2] += last.rgba[i + 2];
        }
        last.opaque = n;
        if (n) last.color = [Math.round(sum[0] / n), Math.round(sum[1] / n), Math.round(sum[2] / n)];
      }
      log(`  ${f} : ${tiles.length} tuiles`);
    }
    for (const r of recs) writeFileEnsured(join(outDir, dir, r.file), encodePng(r.w, r.h, r.rgba));
    // atlas
    const { placements, pages } = pack(recs, 2048, 2048);
    const atlases = pages.map((p) => ({ w: p.w, h: p.h, data: new Uint8Array(p.w * p.h * 4) }));
    recs.forEach((r, i) => {
      const pl = placements[i];
      r.atlas = pl;
      const a = atlases[pl.page];
      for (let y = 0; y < r.h; y++) a.data.set(r.rgba.subarray(y * r.w * 4, (y + 1) * r.w * 4), ((pl.y + y) * a.w + pl.x) * 4);
    });
    atlases.forEach((a, i) => writeFileEnsured(join(outDir, dir, `atlas-${i}.png`), encodePng(a.w, a.h, a.data)));
    const meta = {
      level: spec.name,
      levelId: Number(row.Id),
      act,
      palette: `act${act}`,
      levelType: { id: Number(typeRow.Id), name: typeRow.Name },
      grid: {
        tile: { w: 160, h: 80, subtiles: 5 },
        subtile: { w: 32, h: 16 },
        projection: 'écran x = (tx - ty) × 80, y = (tx + ty) × 40 ; l’origine de la tuile est le coin haut-gauche de son losange 160×80',
      },
      notes: [
        'ox, oy : décalage du coin haut-gauche de l’image par rapport à l’origine de la tuile (oy < 0 : la tuile dépasse vers le haut, cas des murs)',
        'kind : floor (orientation 0), wall (orientations 1 à 12), other (ombres, arbres, toits… orientation brute conservée)',
        'declared : dimensions déclarées dans l’en-tête DT1 (hauteur négative pour les murs)',
      ],
      sources,
      atlas: pages.map((p, i) => ({ file: `atlas-${i}.png`, w: p.w, h: p.h })),
      tiles: recs.map(({ rgba: _rgba, ...r }) => r),
    };
    writeJson(join(outDir, dir, 'tiles.json'), meta);
    log(`  ${spec.name} : ${recs.length} tuiles, ${pages.length} page(s) d'atlas`);
    res.push({ level: spec.name, slug: spec.slug, act, dir: dir.replace(/\\/g, '/'), tiles: recs.length, atlasPages: pages.length, json: `${dir}/tiles.json`.replace(/\\/g, '/') });
  }
  updateManifest(outDir, 'tiles', res);
  return res;
}
