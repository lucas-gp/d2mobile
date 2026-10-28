/** Récepteur navigateur : PNG par CompressionStream, octets remis à un rappel (Worker : API Cache) */
import type { Sink } from './sink';
import { encodePngWeb } from './png-web';

export class WebSink implements Sink {
  /** octets écrits (hors chemins déjà remis) : cumul par préfixe de dossier, pour les mesures */
  readonly stats = new Map<string, { files: number; bytes: number }>();
  constructor(readonly put: (path: string, bytes: Uint8Array) => void | Promise<void>) {}
  private count(path: string, n: number): void {
    const k = path.split('/')[0];
    const s = this.stats.get(k) ?? { files: 0, bytes: 0 };
    s.files++;
    s.bytes += n;
    this.stats.set(k, s);
  }
  async write(path: string, data: string | Uint8Array): Promise<void> {
    const b = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    this.count(path, b.length);
    await this.put(path, b);
  }
  async png(path: string, w: number, h: number, rgba: Uint8Array): Promise<number> {
    const b = await encodePngWeb(w, h, rgba);
    this.count(path, b.length);
    await this.put(path, b);
    return b.length;
  }
}
