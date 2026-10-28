/**
 * DS1 : carte d'un niveau de Diablo II (cases de 5 × 5 sous-tuiles). Couches : sols, murs (avec leur orientation), ombres, marqueurs ;
 * objets (PNJ, coffres, décor) ; chaque case de sol ou de mur désigne une tuile d'un DT1 par (indice principal, sous-indice, orientation).
 */
export interface Ds1Object {
  type: number;
  id: number;
  /** position en sous-tuiles */
  x: number;
  y: number;
  flags: number;
}

export interface Ds1 {
  version: number;
  /** largeur et hauteur en cases (tuiles) */
  width: number;
  height: number;
  act: number;
  /** fichiers DT1 utilisés (chemins relatifs à data\global\tiles) */
  dt1: string[];
  /** couches de murs : valeur brute de chaque case, puis orientation */
  walls: { cells: Uint32Array; orient: Uint32Array }[];
  floors: Uint32Array[];
  shadow: Uint32Array | null;
  tags: Uint32Array | null;
  objects: Ds1Object[];
}

export interface Cell {
  main: number;
  sub: number;
  hidden: boolean;
  /** octet bas : 0 = case vide pour les murs */
  prop1: number;
}

export function cell(v: number): Cell {
  return { main: (v >>> 20) & 0x3f, sub: (v >>> 8) & 0xff, hidden: v >>> 31 === 1, prop1: v & 0xff };
}

export function decodeDs1(d: Uint8Array): Ds1 {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  let p = 0;
  const i32 = (): number => {
    const v = dv.getInt32(p, true);
    p += 4;
    return v;
  };
  const version = i32();
  const width = i32() + 1;
  const height = i32() + 1;
  const act = version >= 8 ? Math.min(i32(), 4) + 1 : 1;
  const tagType = version >= 10 ? i32() : 0;
  const dt1: string[] = [];
  if (version >= 3) {
    const n = i32();
    for (let i = 0; i < n; i++) {
      let s = '';
      while (d[p] !== 0) s += String.fromCharCode(d[p++]);
      p++;
      dt1.push(
        s
          .replace(/\//g, '\\')
          .replace(/^.*\\tiles\\/i, '')
          .replace(/\.tg1$/i, '.dt1')
          .toLowerCase(),
      );
    }
  }
  if (version >= 9 && version <= 13) p += 8;
  const nWalls = version >= 4 ? i32() : 1;
  const nFloors = version >= 16 ? i32() : 1;
  const size = width * height;
  const layer = (): Uint32Array => {
    const a = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      a[i] = dv.getUint32(p, true);
      p += 4;
    }
    return a;
  };
  const walls: Ds1['walls'] = [];
  const wallCells: Uint32Array[] = [];
  const orient: Uint32Array[] = [];
  // ordre du flux : pour chaque couche de murs, la couche de murs puis son orientation ; ensuite les sols, l'ombre et les marqueurs
  for (let i = 0; i < nWalls; i++) {
    wallCells.push(layer());
    orient.push(layer());
  }
  for (let i = 0; i < nWalls; i++) walls.push({ cells: wallCells[i], orient: orient[i] });
  const floors: Uint32Array[] = [];
  for (let i = 0; i < nFloors; i++) floors.push(layer());
  const shadow = version >= 4 ? layer() : null;
  const tags = tagType === 1 || tagType === 2 ? layer() : null;
  const objects: Ds1Object[] = [];
  if (version >= 2) {
    const n = i32();
    for (let i = 0; i < n; i++) {
      const type = i32();
      const id = i32();
      const x = i32();
      const y = i32();
      const flags = version > 5 ? i32() : 0;
      objects.push({ type, id, x, y, flags });
    }
  }
  return { version, width, height, act, dt1, walls, floors, shadow, tags, objects };
}

/**
 * Assemble plusieurs cartes en une seule : chaque pièce est posée à (cx, cy) en cases ; les couches manquantes sont vides. `over` (lot 317) : la
 * pièce remplace tout ce que les pièces précédentes avaient posé sous elle (couches et objets), au lieu de ne recouvrir que ses cases non vides
 */
export function mergeDs1(parts: { ds1: Ds1; cx: number; cy: number; over?: boolean }[], width: number, height: number): Ds1 {
  const size = width * height;
  const nWalls = Math.max(...parts.map((p) => p.ds1.walls.length));
  const nFloors = Math.max(...parts.map((p) => p.ds1.floors.length));
  const walls = Array.from({ length: nWalls }, () => ({ cells: new Uint32Array(size), orient: new Uint32Array(size) }));
  const floors = Array.from({ length: nFloors }, () => new Uint32Array(size));
  const shadow = new Uint32Array(size);
  const objects: Ds1Object[] = [];
  const dt1 = new Set<string>();
  for (const { ds1, cx, cy, over } of parts) {
    for (const f of ds1.dt1) dt1.add(f);
    if (over) {
      const x0 = Math.max(0, cx);
      const y0 = Math.max(0, cy);
      const x1 = Math.min(width, cx + ds1.width);
      const y1 = Math.min(height, cy + ds1.height);
      const layers = [...walls.flatMap((w) => [w.cells, w.orient]), ...floors, shadow];
      for (let y = y0; y < y1; y++) for (const l of layers) l.fill(0, y * width + x0, y * width + x1);
      for (let k = objects.length - 1; k >= 0; k--) {
        const o = objects[k];
        if (o.x >= x0 * 5 && o.x < x1 * 5 && o.y >= y0 * 5 && o.y < y1 * 5) objects.splice(k, 1);
      }
    }
    const put = (dst: Uint32Array, src: Uint32Array | null): void => {
      if (!src) return;
      for (let y = 0; y < ds1.height; y++)
        for (let x = 0; x < ds1.width; x++) {
          const v = src[y * ds1.width + x];
          if (!v) continue;
          const X = cx + x;
          const Y = cy + y;
          if (X < 0 || Y < 0 || X >= width || Y >= height) continue;
          dst[Y * width + X] = v;
        }
    };
    ds1.walls.forEach((w, i) => {
      put(walls[i].cells, w.cells);
      put(walls[i].orient, w.orient);
    });
    ds1.floors.forEach((f, i) => put(floors[i], f));
    put(shadow, ds1.shadow);
    for (const o of ds1.objects) objects.push({ ...o, x: o.x + cx * 5, y: o.y + cy * 5 });
  }
  return { version: 18, width, height, act: parts[0].ds1.act, dt1: [...dt1], walls, floors, shadow, tags: null, objects };
}
