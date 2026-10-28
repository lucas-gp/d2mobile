/**
 * Génération des assets graphiques dans le navigateur (Web Worker) à partir de MPQ fournis par le joueur : mêmes exporteurs
 * que le CLI (export-game.ts : sheets.ts, props.ts, ground.ts, export-fx.ts, export-*icons.ts, export-ui.ts…), branchés sur un
 * récepteur `Sink` au lieu du disque, sans API Node. Les lectures du fichier sont synchrones (FileReaderSync, disponible dans
 * les Workers) : tous les décodeurs restent identiques à ceux du CLI. Chemins produits = ceux du dossier du CLI (`hi/`, `lo/`,
 * `icons/`, `ui/`, `audio/npc-text.json`).
 */
import { MpqCore, type ByteSource } from './mpq-core';
import { VfsCore, orderArchives } from './vfs-core';
import { inflateZlib } from './inflate';
import { GameData } from './data';
import { GAME_ACTORS } from './game-map';
import { partActors, writeActorSheet } from './sheets';
import type { Sink } from './sink';
import { encodePngWeb } from './png-web';
import { sha1Hex } from './sha1';
import { readExact } from './io-core';
import { exportProps } from './props';
import { exportGrounds } from './ground';
import { exportFx } from './export-fx';
import { exportSkillIcons, exportLoadingArt } from './export-skill-icons';
import { exportUi } from './export-ui';
import { exportNpcText } from './export-npc-text';
import { exportItemIcons } from './export-item-icons';
import { exportGroundItems } from './export-ground-items';
import { WALLS, TILE_PROPS } from './prop-map';
import { GROUNDS } from './ground-map';
import { FX } from './fx-map';
import { MAPS } from './map-specs';
import { buildMap, type MapTables } from './map-build';
import { parseMonPresets } from './decor-tokens';

declare class FileReaderSync {
  readAsArrayBuffer(b: Blob): ArrayBuffer;
}

/** Source d'octets à accès aléatoire sur un File/Blob (Worker uniquement) ; aucune copie complète du fichier */
export function blobSource(blob: Blob): ByteSource {
  const rd = new FileReaderSync();
  return {
    size: blob.size,
    read(pos, len) {
      return readExact((p, l) => new Uint8Array(rd.readAsArrayBuffer(blob.slice(p, p + l))), blob.size, pos, len);
    },
  };
}

export interface NamedSource {
  name: string;
  source: ByteSource;
}

/** Ouvre les archives (ordre de priorité : d2char < d2data < d2exp < autres, alphabétique) */
export function openVfs(files: NamedSource[]): VfsCore {
  const order = orderArchives(files.map((f) => f.name));
  const v = new VfsCore();
  for (const n of order) {
    const f = files.find((x) => x.name === n)!;
    v.add(f.name, new MpqCore(f.name, f.source, inflateZlib));
  }
  return v;
}

export const openData = (files: NamedSource[], lang = 'eng'): GameData => new GameData(openVfs(files), lang, '');

export interface GeneratedFile {
  /** chemin relatif à `game/` (ex. `hi/paladin.json`) */
  path: string;
  bytes: Uint8Array;
}

export interface GeneratedSheet {
  id: string;
  files: GeneratedFile[];
  entry: { hash: string; hi: { bytes: number; gpu: number }; lo: { bytes: number; gpu: number }; kind: string };
  warnings: string[];
  /** SHA-1 des pixels RGBA de chaque page (contrôle contre le CLI) */
  pixelHashes: Record<string, string>;
}

/** Récepteur qui garde tout en mémoire (contrôles d'identité avec le CLI) */
export class CollectSink implements Sink {
  files: GeneratedFile[] = [];
  pixelHashes: Record<string, string> = {};
  write(path: string, data: string | Uint8Array): void {
    this.files.push({ path, bytes: typeof data === 'string' ? new TextEncoder().encode(data) : data });
  }
  async png(path: string, w: number, h: number, rgba: Uint8Array): Promise<number> {
    const b = await encodePngWeb(w, h, rgba);
    this.files.push({ path, bytes: b });
    this.pixelHashes[path] = sha1Hex(rgba);
    return b.length;
  }
}

/** Identifiants des planches d'unités et de décors (GAME_ACTORS) */
export const SHEET_IDS = GAME_ACTORS.map((a) => a.id);

/** Planche d'unité en mémoire (hi + lo, ombres comprises) : mêmes noms et même JSON que `cli.ts game <id>` */
export async function generateSheet(data: GameData, id: string): Promise<GeneratedSheet> {
  const a = GAME_ACTORS.find((x) => x.id === id) ?? partActors(data).find((x) => x.id === id);
  if (!a) throw new Error(`planche inconnue : ${id}`);
  const sink = new CollectSink();
  const r = await writeActorSheet(data, a, sink);
  return { id, files: sink.files, entry: r.entry, warnings: r.warnings, pixelHashes: sink.pixelHashes };
}

/**
 * Catalogue des assets générables avec les archives données. Préfixes :
 *   units (GAME_ACTORS) et parts (pièces d'équipement, dépend des calques présents) = planches d'acteur ;
 *   props (murs, colonnes), fx_* (effets), grounds (sols : entrées `tiles` du manifeste) ;
 *   extras = atlas d'icônes et d'interface (`icons:*`), un identifiant par fichier d'atlas.
 */
export interface Catalog {
  units: string[];
  parts: string[];
  props: string[];
  fx: string[];
  grounds: string[];
  extras: string[];
  /** cartes DS1 générables (toutes les pièces sont dans les archives), dans l'ordre de `maps/index.json` */
  maps: string[];
}

export const EXTRAS = ['icons:skills', 'icons:loading', 'icons:items', 'icons:ground', 'ui', 'text:npc'] as const;

/** Cartes dont tous les fichiers DS1 sont présents (les variantes « a|b » : au moins une) */
export function availableMaps(data: GameData): string[] {
  const has = (f: string): boolean => f.split('|').some((c) => data.vfs.has(`data\\global\\tiles\\${c.replace(/\//g, '\\')}`));
  return MAPS.filter((m) => (m.parts ? m.parts.every((p) => has(p.ds1)) : !!m.ds1 && has(m.ds1))).map((m) => m.id);
}

export function catalog(data: GameData): Catalog {
  return {
    units: SHEET_IDS,
    parts: partActors(data).map((a) => a.id),
    props: [...WALLS.map((w) => w.id), ...TILE_PROPS.map((p) => p.id)],
    fx: FX.map((f) => `fx_${f.id}`),
    grounds: GROUNDS.map((g) => g.id),
    extras: [...EXTRAS],
    maps: availableMaps(data),
  };
}

/** Développe les jetons de groupe (`all`, `units`, `parts`, `props`, `fx`, `grounds`, `extras`) en identifiants */
export function expandIds(data: GameData, ids: string[]): string[] {
  const c = catalog(data);
  const out: string[] = [];
  for (const id of ids) {
    if (id === 'all') out.push(...c.extras, ...c.grounds, ...c.props, ...c.fx, ...c.units, ...c.parts);
    else if (id === 'maps') out.push(...c.maps.map(mapAssetId));
    else if (id === 'extras' || id === 'icons') out.push(...c.extras);
    else if (id in c) out.push(...(c as unknown as Record<string, string[]>)[id]);
    else out.push(id);
  }
  return [...new Set(out)];
}

export type AssetKind = 'sheet' | 'tile' | 'files' | 'map';

/** Identifiants des cartes : `map:<id>` = JSON + PNG des paliers demandés ; `mapdata:<id>` = JSON seul (même calcul, sans encodage) */
export const mapAssetId = (id: string): string => `map:${id}`;
export const mapDataAssetId = (id: string): string => `mapdata:${id}`;

const monPresetCache = new WeakMap<GameData, Map<number, string[]>>();
/** Tables hors MPQ de base : obj.txt n'est dans aucune archive (décor posé et repères désactivés) ; monpreset.txt vient du patch 1.10+ du joueur */
export function mapTables(data: GameData): MapTables {
  let mp = monPresetCache.get(data);
  if (!mp) {
    const b = data.vfs.get('data\\global\\excel\\monpreset.txt');
    mp = b ? parseMonPresets(b) : new Map();
    monPresetCache.set(data, mp);
  }
  return { decorOf: null, markOf: null, monpreset: mp };
}

export interface AssetResult {
  id: string;
  kind: AssetKind;
  /** entrée de manifeste (planches, sols) */
  entry?: Record<string, unknown>;
  warnings: string[];
  /** cartes : durée par phase (ms) et métriques */
  info?: Record<string, number>;
}

/** Génère un asset du catalogue vers le récepteur ; jette si l'asset est impossible (le sprite d'origine reste alors en place) */
export async function generateAsset(data: GameData, id: string, out: Sink, tiers: readonly ('hi' | 'lo')[] = ['hi', 'lo'], checkpoint?: () => void): Promise<AssetResult> {
  const warnings: string[] = [];
  if (id.startsWith('map:') || id.startsWith('mapdata:')) {
    // « map:<id>@k/n » : part k sur n de l'encodage des images (deux Workers se partagent une grande carte)
    const mm = /^(?:map|mapdata):([a-z0-9_]+)(?:@(\d+)\/(\d+))?$/.exec(id);
    if (!mm) throw new Error(`identifiant de carte invalide : ${id}`);
    const mid = mm[1];
    const slice = mm[2] !== undefined ? { k: Number(mm[2]), n: Number(mm[3]) } : undefined;
    const spec = MAPS.find((m) => m.id === mid);
    if (!spec) throw new Error(`carte inconnue : ${mid}`);
    const info: Record<string, number> = {};
    const r = await buildMap(data, spec, out, (s) => warnings.push(s.trim()), {
      tiers: id.startsWith('mapdata:') ? [] : tiers,
      tables: mapTables(data),
      onPhase: (p, ms) => (info[p] = Math.round(ms)),
      checkpoint,
      slice,
    });
    info.chunks = r.chunks;
    info.structures = r.structures;
    info.peakBuffer = r.peakBuffer;
    info.bytes = r.bytes;
    return { id, kind: 'map', warnings, info };
  }
  const log = (s: string) => warnings.push(s.trim());
  const failed = (): never => {
    throw new Error(warnings.find((w) => w.includes('ÉCHEC')) ?? `échec : ${id}`);
  };
  switch (id) {
    case 'icons:skills':
      await exportSkillIcons(data, out, log);
      return { id, kind: 'files', warnings };
    case 'icons:loading':
      await exportLoadingArt(data, out, log);
      return { id, kind: 'files', warnings };
    case 'icons:items':
      await exportItemIcons(data, out, log);
      return { id, kind: 'files', warnings };
    case 'icons:ground':
      await exportGroundItems(data, out, log);
      return { id, kind: 'files', warnings };
    case 'ui':
      await exportUi(data, out, log);
      return { id, kind: 'files', warnings };
    case 'text:npc':
      await exportNpcText(data, out, log);
      return { id, kind: 'files', warnings };
  }
  if (GROUNDS.some((g) => g.id === id)) {
    const r = await exportGrounds(data, out, log, [id], tiers);
    return r[id] ? { id, kind: 'tile', entry: r[id] as unknown as Record<string, unknown>, warnings } : failed();
  }
  if (WALLS.some((w) => w.id === id) || TILE_PROPS.some((p) => p.id === id)) {
    const r = await exportProps(data, out, log, [id], tiers);
    return r[id] ? { id, kind: 'sheet', entry: r[id] as unknown as Record<string, unknown>, warnings } : failed();
  }
  if (id.startsWith('fx_')) {
    const r = await exportFx(data, out, log, [id], tiers);
    return r[id] ? { id, kind: 'sheet', entry: r[id] as Record<string, unknown>, warnings } : failed();
  }
  const a = GAME_ACTORS.find((x) => x.id === id) ?? partActors(data).find((x) => x.id === id);
  if (!a) throw new Error(`asset inconnu : ${id}`);
  const r = await writeActorSheet(data, a, out, tiers);
  return { id, kind: 'sheet', entry: r.entry, warnings: r.warnings };
}

export { looksLikeMpq, quickFingerprint } from './mpq-probe';
