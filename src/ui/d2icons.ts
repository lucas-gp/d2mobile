/**
 * Icônes importées de Diablo II (tools/d2import : icônes de compétences 48 × 48) : découpées dans l'atlas au démarrage, servies par
 * `icon()`. Sans import, ou pour une compétence sans icône D2, l'icône d'origine du jeu est utilisée.
 */
const urls = new Map<string, string>();

/** Rend la main au navigateur (la découpe de centaines d'icônes en cours de jeu ne doit pas geler l'image) */
const breathe = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const CHUNK = 24;

/**
 * Image d'une icône découpée : URL de données (dossier en clair ou chiffré, comportement d'origine) ou, pour les graphismes générés sur
 * l'appareil, blob encodé HORS du fil principal (`toBlob`) — `toDataURL` encode en PNG sur le fil principal et gelait le jeu plusieurs secondes.
 */
let asyncCut = false;
const cut = (cv: HTMLCanvasElement): string | Promise<string> => {
  if (!asyncCut) return cv.toDataURL('image/png');
  return new Promise((resolve) => cv.toBlob((b) => resolve(b ? URL.createObjectURL(b) : cv.toDataURL('image/png')), 'image/png'));
};

export function d2IconUrl(id: string): string | undefined {
  return urls.get(id);
}

interface AtlasIndex {
  cell: number;
  cols: number;
  ids: Record<string, number>;
}

/** Images d'inventaire des objets (`item:<base>`) : rectangles de l'atlas, tailles variables */
async function loadItems(read: (path: string) => Promise<Uint8Array | null>): Promise<void> {
  const [indexRaw, pngRaw] = await Promise.all([read('icons/items.json'), read('icons/items.png')]);
  if (!indexRaw || !pngRaw) return;
  const index = JSON.parse(new TextDecoder().decode(indexRaw)) as { ids: Record<string, number[]> };
  const bmp = await createImageBitmap(new Blob([pngRaw as BlobPart], { type: 'image/png' }));
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d', { willReadFrequently: true });
  if (!g) return;
  const cache = new Map<string, string>();
  let n = 0;
  const pending: Promise<void>[] = [];
  for (const [id, [x, y, w, h]] of Object.entries(index.ids)) {
    if (++n % CHUNK === 0) await breathe();
    const key = `${x},${y}`;
    let url = cache.get(key);
    if (!url) {
      cv.width = w;
      cv.height = h;
      g.clearRect(0, 0, w, h);
      g.drawImage(bmp, x, y, w, h, 0, 0, w, h);
      const u = cut(cv);
      if (typeof u === 'string') {
        url = u;
        cache.set(key, url);
      } else {
        pending.push(
          u.then((v) => {
            cache.set(key, v);
            urls.set(`item:${id}`, v);
          }),
        );
        continue;
      }
    }
    urls.set(`item:${id}`, url);
  }
  await Promise.all(pending);
  // icônes qui partagent un rectangle déjà découpé (asynchrone) : même image
  for (const [id, [x, y]] of Object.entries(index.ids))
    if (!urls.has(`item:${id}`)) {
      const v = cache.get(`${x},${y}`);
      if (v) urls.set(`item:${id}`, v);
    }
  bmp.close();
}

export async function loadD2Icons(read: (path: string) => Promise<Uint8Array | null>, nonBlocking = false): Promise<number> {
  asyncCut = nonBlocking;
  try {
    await loadItems(read).catch(() => undefined);
    const [indexRaw, pngRaw] = await Promise.all([read('icons/skills.json'), read('icons/skills.png')]);
    if (!indexRaw || !pngRaw) return 0;
    const index = JSON.parse(new TextDecoder().decode(indexRaw)) as AtlasIndex;
    const bmp = await createImageBitmap(new Blob([pngRaw as BlobPart], { type: 'image/png' }));
    const cv = document.createElement('canvas');
    cv.width = cv.height = index.cell;
    const g = cv.getContext('2d', { willReadFrequently: true });
    if (!g) return 0;
    const cache = new Map<number, string>();
    let n = 0;
    const pending: Promise<void>[] = [];
    for (const [id, cell] of Object.entries(index.ids)) {
      if (++n % CHUNK === 0) await breathe();
      let url = cache.get(cell);
      if (!url) {
        g.clearRect(0, 0, index.cell, index.cell);
        g.drawImage(bmp, (cell % index.cols) * index.cell, Math.floor(cell / index.cols) * index.cell, index.cell, index.cell, 0, 0, index.cell, index.cell);
        const u = cut(cv);
        if (typeof u !== 'string') {
          pending.push(
            u.then((v) => {
              cache.set(cell, v);
              urls.set(id, v);
            }),
          );
          continue;
        }
        url = u;
        cache.set(cell, url);
      }
      urls.set(id, url);
    }
    await Promise.all(pending);
    for (const [id, cell] of Object.entries(index.ids))
      if (!urls.has(id)) {
        const v = cache.get(cell);
        if (v) urls.set(id, v);
      }
    bmp.close();
    return urls.size;
  } catch {
    return 0;
  }
}

/** Écran de chargement de Diablo II : bande de 10 images (la porte s'ouvre), image choisie d'après l'avancement */
let loading: { url: string; frames: number; size: number } | null = null;

export function d2LoadingArt(): { url: string; frames: number; size: number } | null {
  return loading;
}

export async function loadD2Loading(read: (path: string) => Promise<Uint8Array | null>): Promise<void> {
  try {
    const [indexRaw, pngRaw] = await Promise.all([read('icons/loading.json'), read('icons/loading.png')]);
    if (!indexRaw || !pngRaw) return;
    const j = JSON.parse(new TextDecoder().decode(indexRaw)) as { frames: number; size: number };
    loading = { url: URL.createObjectURL(new Blob([pngRaw as BlobPart], { type: 'image/png' })), frames: j.frames, size: j.size };
  } catch {
    /* sans écran D2 : chargement d'origine */
  }
}
