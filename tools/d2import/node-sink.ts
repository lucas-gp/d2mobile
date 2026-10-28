/** Récepteur Node : fichiers sous un dossier (même octets qu'avant l'introduction du récepteur) */
import { join } from 'node:path';
import type { Sink } from './sink';
import { encodePng } from './png';
import { writeFileEnsured } from './manifest';

export class NodeSink implements Sink {
  constructor(readonly root: string) {}
  write(path: string, data: string | Uint8Array): void {
    writeFileEnsured(join(this.root, path), data);
  }
  async png(path: string, w: number, h: number, rgba: Uint8Array): Promise<number> {
    const png = encodePng(w, h, rgba);
    writeFileEnsured(join(this.root, path), png);
    return png.length;
  }
}
