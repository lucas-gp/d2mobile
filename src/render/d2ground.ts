/**
 * Images des objets posés au sol (tools/d2import : dernière image de l'animation de chute de chaque objet de Diablo II), lues dans l'atlas
 * `icons/ground.png`. Sans import, le rendu garde le halo coloré d'origine.
 */
import { Rectangle, Texture } from 'pixi.js';

export interface GroundItemImage {
  tex: Texture;
  ax: number;
  ay: number;
}

const images = new Map<string, GroundItemImage>();

export function groundItemImage(baseId: string): GroundItemImage | undefined {
  return images.get(baseId);
}

export async function loadGroundItems(read: (path: string) => Promise<Uint8Array | null>): Promise<number> {
  try {
    const [indexRaw, pngRaw] = await Promise.all([read('icons/ground.json'), read('icons/ground.png')]);
    if (!indexRaw || !pngRaw) return 0;
    const index = JSON.parse(new TextDecoder().decode(indexRaw)) as { ids: Record<string, number[]> };
    const source = Texture.from(await createImageBitmap(new Blob([pngRaw as BlobPart], { type: 'image/png' }))).source;
    source.scaleMode = 'nearest';
    for (const [id, [x, y, w, h, ax, ay]] of Object.entries(index.ids)) images.set(id, { tex: new Texture({ source, frame: new Rectangle(x, y, w, h) }), ax, ay });
    return images.size;
  } catch {
    return 0;
  }
}
