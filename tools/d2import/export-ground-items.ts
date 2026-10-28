/**
 * Objets posés au sol (data\global\items\<flippyfile>.dc6, colonne `flippyfile` de weapons/armor/misc) : dernière image de l'animation de chute,
 * en atlas `game/icons/ground.png` + `ground.json` (identifiant de base → rectangle et ancre au point de pose). Mêmes identifiants que les images d'inventaire.
 */
import type { GameData } from './data';
import { decodeDc6 } from './formats/dc6';
import { pack } from './atlas';
import { putJson, type Sink } from './sink';
import { ITEM_ALIAS } from './export-item-icons';

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export async function exportGroundItems(data: GameData, out: Sink, log: (s: string) => void): Promise<number> {
  const { vfs } = data;
  const pal = data.palette(1);
  const byName = new Map<string, string>();
  for (const t of ['weapons', 'armor', 'misc']) for (const r of data.needTable(t).rows) if (r.name && r.flippyfile) byName.set(norm(r.name), r.flippyfile);
  const files = new Map<string, { w: number; h: number; rgba: Uint8Array; ax: number; ay: number }>();
  for (const [name, flp] of byName) {
    const bytes = vfs.get(`data\\global\\items\\${flp}.dc6`);
    if (!bytes) continue;
    const dc = decodeDc6(bytes);
    const fr = dc.frames[dc.frames.length - 1];
    if (!fr || fr.w < 2) continue;
    const rgba = new Uint8Array(fr.w * fr.h * 4);
    for (let i = 0; i < fr.w * fr.h; i++) {
      const c = fr.px[i];
      if (c) rgba.set([pal[c * 3], pal[c * 3 + 1], pal[c * 3 + 2], 255], i * 4);
    }
    // l'image est posée sur son centre : le point de pose est le milieu du bas
    files.set(name, { w: fr.w, h: fr.h, rgba, ax: Math.round(fr.w / 2), ay: fr.h - 2 });
  }
  const list = [...files.entries()];
  const { placements, pages } = pack(
    list.map(([, im]) => im),
    2048,
    2048,
  );
  if (pages.length > 1) throw new Error('atlas d’objets au sol sur plusieurs pages');
  const atlas = new Uint8Array(pages[0].w * pages[0].h * 4);
  const ids: Record<string, number[]> = {};
  list.forEach(([name, im], i) => {
    const pl = placements[i];
    for (let y = 0; y < im.h; y++) atlas.set(im.rgba.subarray(y * im.w * 4, (y + 1) * im.w * 4), ((pl.y + y) * pages[0].w + pl.x) * 4);
    ids[name] = [pl.x, pl.y, im.w, im.h, im.ax, im.ay];
  });
  for (const [game, d2] of Object.entries(ITEM_ALIAS)) if (ids[d2] && !ids[game]) ids[game] = ids[d2];
  await out.png('icons/ground.png', pages[0].w, pages[0].h, atlas);
  await putJson(out, 'icons/ground.json', { ids });
  log(`  objets au sol : ${files.size} images D2, ${Object.keys(ids).length} identifiants`);
  return Object.keys(ids).length;
}
