/**
 * Chargement des cartes Diablo II importées (index et fichiers JSON lus par un lecteur fourni : dossier servi, cache local) et enregistrement
 * dans `d2map.ts` ; les cartes de campagne se chargent à la demande, acte par acte.
 */
import { parseD2Map, registerD2Map } from './d2map';

type Reader = (path: string) => Promise<Uint8Array | null>;

let allIds: string[] = [];
const loaded = new Set<string>();

/** Cartes des campagnes : `a1_…` à `a5_…` (chargées à la demande) ; les autres (villes, runs d'origine) se chargent au démarrage */
const campaignOf = (id: string): string | null => /^a([1-5])_/.exec(id)?.[0].slice(0, 2) ?? null;

async function readIndex(read: Reader): Promise<string[]> {
  if (allIds.length) return allIds;
  const raw = await read('maps/index.json');
  if (!raw) return [];
  allIds = (JSON.parse(new TextDecoder().decode(raw)) as { maps: string[] }).maps;
  return allIds;
}

/** Cartes importées de la campagne `prefix` (« a1 »…) présentes dans l'index */
export async function campaignMapIds(read: Reader, prefix: string): Promise<string[]> {
  return (await readIndex(read)).filter((id) => id.startsWith(`${prefix}_`));
}

/**
 * Charge les cartes importées de l'index qui passent `want` (quatre téléchargements en parallèle) ; renvoie le nombre de cartes enregistrées.
 * `onProgress(fait, total)` après chaque carte : l'écran de chargement avance au lieu de rester figé.
 */
export async function loadD2Maps(read: Reader, onProgress?: (done: number, total: number) => void, want: (id: string) => boolean = (id) => !campaignOf(id)): Promise<number> {
  try {
    const ids = (await readIndex(read)).filter((id) => want(id) && !loaded.has(id));
    let done = 0;
    let n = 0;
    const queue = [...ids];
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let id = queue.shift(); id; id = queue.shift()) {
          const j = await read(`maps/${id}.json`);
          if (j) {
            registerD2Map(parseD2Map(JSON.parse(new TextDecoder().decode(j))));
            loaded.add(id);
            n++;
          }
          onProgress?.(++done, ids.length);
        }
      }),
    );
    return n;
  } catch {
    return 0;
  }
}

/** Charge les cartes d'une campagne (« a1 »…) ; `only` : celles-là seulement (lot 305, rule `maps.wanted`) */
export const loadCampaignMaps = (read: Reader, prefix: string, onProgress?: (done: number, total: number) => void, only: (id: string) => boolean = () => true): Promise<number> =>
  loadD2Maps(read, onProgress, (id) => id.startsWith(`${prefix}_`) && only(id));
