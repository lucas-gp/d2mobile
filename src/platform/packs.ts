/**
 * Contenus téléchargeables : chaque pack regroupe des zones (cartes D2) et les monstres qui les peuplent. Les fichiers d'un pack sont
 * de toute façon téléchargés à la première visite d'une zone puis gardés dans le cache hors ligne du service worker (adresses immuables,
 * `?v=` = empreinte, cache-first, voir d2cache.ts) : le pack précharge le tout d'un coup (Wi-Fi) et en tient la liste pour afficher
 * l'état réel (complet / incomplet / purgé par le navigateur).
 */
import { RUNS } from '../data/runs';
import { derivedList } from '../mods/derived';
import { MONSTER_BY_ID } from '../data/monsters';
import { d2Map } from '../data/d2map';
import { packStatus, type PackStatus } from './d2cache';

export interface Pack {
  id: string;
  name: string;
  desc: string;
  /** zones (identifiants de run) du pack */
  runs: string[];
  /** taille approximative à télécharger (Mo) en haute / basse résolution */
  mb: [number, number];
}

export const PACKS: Pack[] = [
  {
    id: 'rush',
    name: 'Base — Harrogath et runs Rush',
    desc: 'La ville, Tristram, les Tombeaux, les Vaches, les boss de farm et le Trône de Baal.',
    runs: derivedList('runs des packs', () => RUNS.filter((r) => !r.campaign && (!r.hidden || r.id === 'cows')).map((r) => r.id)),
    mb: [190, 110],
  },
  {
    id: 'act1',
    name: 'Campagne — Acte I',
    desc: 'Le Camp des Rôdeuses, les plaines, grottes, cimetière, Tour oubliée, monastère, prisons, cathédrale et catacombes (36 zones).',
    runs: derivedList('runs des packs', () => RUNS.filter((r) => r.campaign === 'act1').map((r) => r.id)),
    mb: [520, 260],
  },
  {
    id: 'act2',
    name: 'Campagne — Acte II',
    desc: 'Lut Gholein, le désert, égouts, palais, tombeaux, repaire des vers, Sanctuaire des arcanes et les Tombeaux de Tal Rasha (28 zones).',
    runs: derivedList('runs des packs', () => RUNS.filter((r) => r.campaign === 'act2').map((r) => r.id)),
    mb: [520, 260],
  },
  {
    id: 'act3',
    name: 'Campagne — Acte III',
    desc: 'Port de Kurast, jungle, Kurast, Travincal, donjons, temples et Durance de la Haine (27 zones).',
    runs: derivedList('runs des packs', () => RUNS.filter((r) => r.campaign === 'act3').map((r) => r.id)),
    mb: [560, 280],
  },
  {
    id: 'act5',
    name: 'Campagne — Acte V',
    desc: "Harrogath, les terres d'Arreat, cavernes de glace, Sommet d'Arreat, temple de Nihlathak, Donjon de la Pierre-Monde et Trône de la Destruction (20 zones).",
    runs: derivedList('runs des packs', () => RUNS.filter((r) => r.campaign === 'act5').map((r) => r.id)),
    mb: [450, 230],
  },
  {
    id: 'act4',
    name: 'Campagne — Acte IV',
    desc: 'Forteresse du Pandémonium, Marches extérieures, Plaines du désespoir, Cité des damnés, Fleuve de flammes et Sanctuaire du Chaos.',
    runs: derivedList('runs des packs', () => RUNS.filter((r) => r.campaign === 'act4').map((r) => r.id)),
    mb: [115, 65],
  },
];

const KEY = 'd2m.packs';

export function packState(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

/**
 * État RÉEL d'un pack : relu dans le cache hors ligne (le navigateur peut purger sous pression de stockage), pas seulement
 * dans la mémoire locale. `purged` : marqué téléchargé mais plus (entièrement) dans le cache.
 */
export async function packRealState(id: string, ver: string): Promise<PackStatus & { purged: boolean }> {
  const st = await packStatus(id, ver);
  const marked = !!packState()[id];
  if (st.state !== 'ok' && marked) unmarkPack(id);
  return { ...st, purged: marked && st.state !== 'ok' };
}

function unmarkPack(id: string): void {
  try {
    const s = packState();
    delete s[id];
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignoré */
  }
}

function markPack(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...packState(), [id]: Date.now() }));
  } catch {
    /* sans stockage : pas de mémoire de l'état */
  }
}

/** Identifiants de cartes et de planches de monstres d'un pack (zones construites aux trois difficultés pour recenser leurs monstres) */
function packContent(pack: Pack): { maps: string[]; sheets: string[] } {
  const maps = new Set<string>();
  const monsters = new Set<string>();
  for (const id of pack.runs) {
    const run = RUNS.find((r) => r.id === id);
    if (!run) continue;
    for (const d of [0, 2] as const) {
      try {
        const z = run.build(7, d);
        if (z.d2Map && d2Map(z.d2Map.id)) maps.add(z.d2Map.id);
        for (const s of z.spawns) monsters.add(s.monster);
      } catch {
        /* zone indisponible */
      }
    }
    monsters.add(run.boss);
  }
  const sheets = new Set<string>();
  for (const m of monsters) {
    const def = MONSTER_BY_ID[m];
    if (def) sheets.add(def.id);
  }
  return { maps: [...maps], sheets: [...sheets] };
}

/** Ce que le téléchargement d'un pack demande à la banque de sprites (interface étroite : testable sans navigateur) */
export interface PackBank {
  tier: 'hi' | 'lo';
  rawUrl(path: string): string;
  /** 1 : disponible (tiré ou déjà gardé), 0 : fichier inexistant (404) ; lève sur échec réseau ou quota */
  prefetchRaw(path: string): Promise<number>;
  sheetPaths(id: string): Promise<string[]>;
  readonly d2Version: string;
}

export interface PackOptions {
  /** annulation par le joueur */
  signal?: AbortSignal;
  /** reste-t-il assez de place pour ce pack (Mo) ? Absent : pas de contrôle */
  hasRoom?: (mb: number) => Promise<boolean>;
  /** enregistre la liste des fichiers disponibles (comptabilité réelle du hors ligne) */
  record?: (id: string, urls: string[], ver: string) => Promise<void>;
}

export class PackError extends Error {
  constructor(
    message: string,
    readonly kind: 'room' | 'quota' | 'cancel' | 'incomplete',
  ) {
    super(message);
    this.name = 'PackError';
  }
}

/** Chemins (relatifs à d2/, sans .enc) de tous les fichiers d'un pack, dédoublonnés */
async function packPaths(pack: Pack, bank: Pick<PackBank, 'tier' | 'sheetPaths'>, loadMaps?: (prefix: string) => Promise<number>): Promise<{ paths: string[]; planningFailures: number }> {
  // les cartes d'une campagne se chargent à la demande : d'abord, pour en lister le contenu
  if (/^act[1-5]$/.test(pack.id) && loadMaps) await loadMaps(`a${pack.id.slice(3)}`);
  const { maps, sheets } = packContent(pack);
  const paths = new Set<string>();
  const low = bank.tier === 'lo';
  for (const id of maps) {
    const raw = d2Map(id)?.raw as { ground: { chunks: { file: string; lo: string }[] }; tiles: { hi: { file: string }[]; lo: { file: string }[] } } | undefined;
    if (!raw) continue;
    for (const c of raw.ground.chunks) paths.add(`maps/${low ? c.lo : c.file}`);
    for (const p of low ? raw.tiles.lo : raw.tiles.hi) paths.add(`maps/${p.file}`);
  }
  let planningFailures = 0;
  for (const id of sheets) {
    try {
      for (const p of await bank.sheetPaths(id)) paths.add(p);
    } catch {
      // liste d'une planche illisible : le pack ne pourra pas être déclaré complet
      planningFailures++;
    }
  }
  return { paths: [...paths], planningFailures };
}

/**
 * Précharge un pack dans le cache hors ligne ; `onProgress(fait, total)` après chaque fichier. Renvoie le nombre de
 * fichiers disponibles. Le pack n'est marqué « téléchargé » que si TOUS ses fichiers sont bien dans le cache : un échec
 * réseau (réessayé une fois), un stockage plein, un manque d'espace ou une annulation lèvent une `PackError`.
 */
export async function downloadPack(
  pack: Pack,
  bank: PackBank,
  onProgress: (done: number, total: number) => void,
  loadMaps?: (prefix: string) => Promise<number>,
  opts: PackOptions = {},
): Promise<number> {
  const need = pack.mb[bank.tier === 'lo' ? 1 : 0];
  if (opts.hasRoom && !(await opts.hasRoom(need))) throw new PackError(`Espace insuffisant (≈ ${need} Mo nécessaires)`, 'room');
  const { paths, planningFailures } = await packPaths(pack, bank, loadMaps);
  const ok: string[] = [];
  let failed = planningFailures;
  let done = 0;
  let fatal = null as PackError | null;
  const queue = [...paths];
  // quatre téléchargements en parallèle
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let p = queue.shift(); p !== undefined && !fatal; p = queue.shift()) {
        if (opts.signal?.aborted) {
          fatal = new PackError('Téléchargement annulé', 'cancel');
          break;
        }
        let res = -1;
        for (let attempt = 0; attempt < 2 && res < 0; attempt++) {
          try {
            res = await bank.prefetchRaw(p);
          } catch (e) {
            if ((e as Error).name === 'QuotaError') {
              fatal = new PackError('Stockage plein : libérez de la place sur l’appareil', 'quota');
              break;
            }
          }
        }
        if (fatal) break;
        if (res === 1) ok.push(bank.rawUrl(p));
        else if (res < 0) failed++;
        onProgress(++done, paths.length);
      }
    }),
  );
  // ce qui est déjà rangé reste enregistré (reprise, état « incomplet » réel)
  await opts.record?.(pack.id, ok, bank.d2Version);
  if (fatal) throw fatal;
  if (failed) throw new PackError(`${failed} fichier(s) n’ont pas pu être téléchargés : réessayez`, 'incomplete');
  markPack(pack.id);
  return ok.length;
}
