/** Empaquetage simple par étagères (« shelf packing ») en pages de taille maximale donnée */
export interface Packable {
  w: number;
  h: number;
}
export interface Placement {
  page: number;
  x: number;
  y: number;
}

export function pack<T extends Packable>(items: T[], maxW = 2048, maxH = 2048, pad = 1): { placements: Placement[]; pages: { w: number; h: number }[] } {
  const order = items.map((_, i) => i).sort((a, b) => items[b].h - items[a].h || items[b].w - items[a].w);
  const placements: Placement[] = new Array(items.length);
  const pages: { w: number; h: number }[] = [];
  let page = -1;
  let x = 0;
  let y = 0;
  let shelfH = 0;
  let usedW = 0;
  const newPage = () => {
    pages.push({ w: 0, h: 0 });
    page++;
    x = y = shelfH = usedW = 0;
  };
  newPage();
  for (const i of order) {
    const it = items[i];
    if (x + it.w > maxW) {
      y += shelfH + pad;
      x = 0;
      shelfH = 0;
    }
    if (y + it.h > maxH) {
      newPage();
    }
    placements[i] = { page, x, y };
    x += it.w + pad;
    shelfH = Math.max(shelfH, it.h);
    usedW = Math.max(usedW, x - pad);
    pages[page].w = Math.max(pages[page].w, usedW);
    pages[page].h = Math.max(pages[page].h, y + shelfH);
  }
  return { placements, pages };
}
