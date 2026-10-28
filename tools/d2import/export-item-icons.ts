/**
 * Images d'inventaire des objets de Diablo II (data\global\items\<invfile>.dc6, colonne `invfile` de weapons/armor/misc) : un atlas PNG
 * `game/icons/items.png` et son index `items.json` (identifiant de base du jeu → rectangle). L'identifiant est le nom anglais de D2
 * normalisé (« Short Staff » → short_staff) ; quelques bases du jeu portent un autre nom et passent par ALIAS.
 */
import type { GameData } from './data';
import { decodeDc6 } from './formats/dc6';
import { pack } from './atlas';
import { putJson, type Sink } from './sink';

/** base du jeu → nom D2 normalisé */
export const ITEM_ALIAS: Record<string, string> = {
  cap: 'cap_hat',
  leather_gloves: 'gloves_l',
  chain_gloves: 'heavy_gloves',
  boots: 'leather_boots',
  belt: 'belt_m',
  sash: 'sash_l',
  hp_potion: 'greater_healing_potion',
  mp_potion: 'greater_mana_potion',
  rejuv_potion: 'rejuv_potion',
  kris: 'kriss',
  key_terror: 'skeleton_key',
  key_hate: 'skeleton_key',
  key_destruction: 'skeleton_key',
  organ_eye: 'khalimeye',
  organ_brain: 'khalimbrain',
  hunters_guise: 'hunter_s_guise',
  light_plated_boots: 'light_plate_boots',
  hunters_bow: 'hunter_s_bow',
  arcane_orb: 'eldritch_orb',
  amulet: 'amulet',
  ring: 'ring',
  jewel: 'jewel',
};

/** Uniques à image propre (D2 : Annihilus = médaillon rond, Torche = flambeau, Fortune de Gheed = tablette ornée) */
export const UNIQUE_ICON: Record<string, string> = { u_annihilus: 'invch7', u_hellfire_torch: 'invtrch', u_gheeds_fortune: 'invch6' };
/** base du jeu → code de type D2 portant les variantes d'image (itemtypes.txt : VarInvGfx, InvGfx1..6). Les charmes de misc.txt pointent sur des images de baguette/bâton/parchemin sans rapport : les vraies sont invch1..9. */
export const VARIANT_TYPE: Record<string, string> = { small_charm: 'scha', large_charm: 'mcha', grand_charm: 'lcha', ring: 'ring', amulet: 'amul', jewel: 'jewl' };

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export async function exportItemIcons(data: GameData, out: Sink, log: (s: string) => void): Promise<number> {
  const { vfs } = data;
  const pal = data.palette(1);
  const byName = new Map<string, string>();
  for (const t of ['weapons', 'armor', 'misc']) for (const r of data.needTable(t).rows) if (r.name && r.invfile) byName.set(norm(r.name), r.invfile);
  const names = new Set([...byName.keys()]);
  const files = new Map<string, { w: number; h: number; rgba: Uint8Array }>();
  for (const [name, inv] of byName) {
    const bytes = vfs.get(`data\\global\\items\\${inv}.dc6`);
    if (!bytes) continue;
    const fr = decodeDc6(bytes).frames[0];
    if (!fr || fr.w < 4) continue;
    const rgba = new Uint8Array(fr.w * fr.h * 4);
    for (let i = 0; i < fr.w * fr.h; i++) {
      const c = fr.px[i];
      if (c) rgba.set([pal[c * 3], pal[c * 3 + 1], pal[c * 3 + 2], 255], i * 4);
    }
    files.set(name, { w: fr.w, h: fr.h, rgba });
  }
  // variantes d'image (`<base>` = variante 0, `<base>#n` = variante n) et images propres des uniques
  const types = data.needTable('itemtypes').rows;
  const readFile = (inv: string): boolean => {
    if (files.has(inv)) return true;
    const bytes = vfs.get(`data\\global\\items\\${inv}.dc6`);
    const fr = bytes ? decodeDc6(bytes).frames[0] : null;
    if (!fr || fr.w < 4) return false;
    const rgba = new Uint8Array(fr.w * fr.h * 4);
    for (let i = 0; i < fr.w * fr.h; i++) {
      const c = fr.px[i];
      if (c) rgba.set([pal[c * 3], pal[c * 3 + 1], pal[c * 3 + 2], 255], i * 4);
    }
    files.set(inv, { w: fr.w, h: fr.h, rgba });
    return true;
  };
  const wanted = new Map<string, string>(); // clé d'atlas → nom de fichier
  for (const [game, code] of Object.entries(VARIANT_TYPE)) {
    const t = types.find((r) => r.Code === code);
    const vs = t ? [1, 2, 3, 4, 5, 6].map((k) => t[`InvGfx${k}`]).filter((v): v is string => !!v && readFile(v)) : [];
    vs.forEach((v, k) => wanted.set(k === 0 ? game : `${game}#${k}`, v));
  }
  for (const [id, inv] of Object.entries(UNIQUE_ICON)) if (readFile(inv)) wanted.set(id, inv);
  for (const inv of wanted.values()) if (!files.has(inv)) throw new Error(inv);
  const list = [...files.entries()];
  const { placements, pages } = pack(
    list.map(([, im]) => im),
    2048,
    2048,
  );
  if (pages.length > 1) throw new Error('atlas d’objets sur plusieurs pages');
  const atlas = new Uint8Array(pages[0].w * pages[0].h * 4);
  const ids: Record<string, number[]> = {};
  list.forEach(([name, im], i) => {
    const pl = placements[i];
    for (let y = 0; y < im.h; y++) atlas.set(im.rgba.subarray(y * im.w * 4, (y + 1) * im.w * 4), ((pl.y + y) * pages[0].w + pl.x) * 4);
    ids[name] = [pl.x, pl.y, im.w, im.h];
  });
  for (const [key, inv] of wanted) ids[key] = ids[inv];
  for (const [game, d2] of Object.entries(ITEM_ALIAS)) if (ids[d2] && !ids[game]) ids[game] = ids[d2];
  await out.png('icons/items.png', pages[0].w, pages[0].h, atlas);
  await putJson(out, 'icons/items.json', { ids });
  log(`  images d'objets : ${files.size} images D2, ${Object.keys(ids).length} identifiants (${names.size} noms dans les tables)`);
  return Object.keys(ids).length;
}
