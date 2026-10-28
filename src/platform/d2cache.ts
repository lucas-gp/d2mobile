/**
 * Cache hors ligne des fichiers D2 chiffrés (`d2/*.enc?v=…`) : l'API Cache est utilisée à la fois par le service worker
 * (cache-first, voir sw-template.js) et par les packs. Les adresses sont immuables (`?v=` = empreinte du dossier) : une
 * entrée n'est jamais revalidée, seules les anciennes empreintes sont purgées. Un « pack » enregistre la liste de ses
 * fichiers dans le cache lui-même, ce qui permet de recompter ce qui est réellement disponible hors ligne.
 */
import { D2_CACHE, primeStoreNames, storeName } from './storage-names';

/** Préfixe des entrées de comptabilité de pack (jamais de vrais fichiers) */
const PACK_PREFIX = '__pack/';
/** Adresse de la fiche d'un pack ; `ver` (`?v=…`) l'invalide avec le dossier chiffré */
const packKey = (id: string, ver: string): string => new URL(`${PACK_PREFIX}${id}${ver}`, new URL('./', location.href)).href;

/** Stockage plein pendant un téléchargement de pack */
export class QuotaError extends Error {
  constructor() {
    super('Stockage plein');
    this.name = 'QuotaError';
  }
}

export type PackStatus = { state: 'none' | 'partial' | 'ok'; have: number; total: number };

function api(): CacheStorage | null {
  return typeof caches === 'undefined' ? null : caches;
}

export const cacheAvailable = (): boolean => !!api();

/** Quota dépassé, sous toutes les formes que prennent les navigateurs */
export function isQuotaError(e: unknown): boolean {
  const x = e as { name?: string; code?: number; message?: string } | null;
  return !!x && (x.name === 'QuotaExceededError' || x.name === 'NS_ERROR_DOM_QUOTA_REACHED' || x.code === 22 || x.code === 1014 || /quota/i.test(x.message ?? ''));
}

async function open(): Promise<Cache | null> {
  try {
    const a = api();
    if (!a) return null;
    await primeStoreNames();
    return await a.open(storeName(D2_CACHE));
  } catch {
    return null;
  }
}

export async function isCached(url: string): Promise<boolean> {
  const c = await open();
  return !!c && !!(await c.match(url));
}

/**
 * Range un fichier dans le cache. 'quota' si le stockage est plein, 'none' si le cache est indisponible.
 * Les anciennes versions de la même adresse (autre `?v=`) sont supprimées d'abord.
 */
export async function storeFile(url: string, res: Response): Promise<'ok' | 'quota' | 'none'> {
  const c = await open();
  if (!c) return 'none';
  try {
    await purgeOtherVersions(c, url);
    await c.put(url, res);
    return 'ok';
  } catch (e) {
    return isQuotaError(e) ? 'quota' : 'none';
  }
}

/** Supprime les entrées de même chemin mais d'empreinte différente */
export async function purgeOtherVersions(c: Cache, url: string): Promise<number> {
  const u = new URL(url, 'http://x/');
  let n = 0;
  for (const k of await c.keys(url, { ignoreSearch: true })) {
    const ku = new URL(k.url, 'http://x/');
    if (ku.pathname === u.pathname && ku.search !== u.search) {
      await c.delete(k);
      n++;
    }
  }
  return n;
}

/** Enregistre la liste (adresses absolues) des fichiers d'un pack */
export async function recordPack(id: string, urls: string[], ver = ''): Promise<void> {
  const c = await open();
  if (!c) return;
  try {
    await c.put(packKey(id, ver), new Response(JSON.stringify(urls), { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    /* stockage plein : le pack restera « inconnu » */
  }
}

/** État réel d'un pack : combien de ses fichiers sont encore dans le cache (le navigateur peut en purger) */
export async function packStatus(id: string, ver = '', listOverride?: string[]): Promise<PackStatus> {
  const c = await open();
  if (!c) return { state: 'none', have: 0, total: 0 };
  let urls = listOverride;
  if (!urls) {
    const r = await c.match(packKey(id, ver));
    if (!r) return { state: 'none', have: 0, total: 0 };
    try {
      urls = (await r.json()) as string[];
    } catch {
      return { state: 'none', have: 0, total: 0 };
    }
  }
  let have = 0;
  for (const u of urls) if (await c.match(u)) have++;
  return { state: have === 0 ? 'none' : have === urls.length ? 'ok' : 'partial', have, total: urls.length };
}

/** Octets utilisés / disponibles estimés par le navigateur */
async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e || e.quota === undefined) return null;
    return { usage: e.usage ?? 0, quota: e.quota };
  } catch {
    return null;
  }
}

/** Demande un stockage persistant (iOS/Android purgent sinon localStorage et caches sous pression) */
export async function requestPersist(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Y a-t-il assez de place pour `needMb` Mo de plus ? (true si le navigateur ne sait pas répondre) */
export async function hasRoomFor(needMb: number): Promise<boolean> {
  const e = await storageEstimate();
  if (!e) return true;
  return e.quota - e.usage > needMb * 1048576 * 1.05;
}
