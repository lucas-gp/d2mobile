/** Stockage Vercel Blob (store privé) pour la synchronisation */
import { BlobError, BlobPreconditionFailedError, del, get, list, put } from '@vercel/blob';
import { StoreConflict, type Store } from './core.js';

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Stockage Vercel Blob privé (lecture sans cache, écriture conditionnelle `ifMatch` / `createOnly` traduite en `StoreConflict`) */
export function blobStore(token?: string): Store {
  const base = token ? { token } : {};
  return {
    async get(path) {
      const r = await get(path, { access: 'private', useCache: false, ...base });
      if (!r || r.statusCode !== 200) return null;
      return { data: await readAll(r.stream), etag: r.blob.etag };
    },
    async put(path, data, opts = {}) {
      try {
        const r = await put(path, Buffer.from(data), {
          access: 'private',
          addRandomSuffix: false,
          contentType: 'application/octet-stream',
          cacheControlMaxAge: 60,
          ...(opts.ifMatch ? { ifMatch: opts.ifMatch } : { allowOverwrite: !opts.createOnly }),
          ...base,
        });
        return { etag: (r as { etag?: string }).etag ?? '' };
      } catch (e) {
        if (e instanceof BlobPreconditionFailedError) throw new StoreConflict();
        if (opts.createOnly && e instanceof BlobError && /exist/i.test(e.message)) throw new StoreConflict();
        throw e;
      }
    },
    async del(paths) {
      if (paths.length) await del(paths, base);
    },
    async list(prefix) {
      const out: string[] = [];
      let cursor: string | undefined;
      do {
        const r = await list({ prefix, limit: 500, cursor, ...base });
        out.push(...r.blobs.map((b) => b.pathname));
        cursor = r.hasMore ? r.cursor : undefined;
      } while (cursor);
      return out;
    },
  };
}
