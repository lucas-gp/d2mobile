/**
 * Lecteur d'archives MPQ pour Node (fichier sur disque, node:zlib). La logique est dans mpq-core.ts, partagée
 * avec le navigateur (tools/d2import/browser.ts) : octets identiques des deux côtés.
 */
import { closeSync, openSync, readSync, fstatSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { MpqCore, type ByteSource } from './mpq-core';

export { mpqHash } from './mpq-core';

export class Mpq extends MpqCore {
  private readonly fd: number;

  constructor(path: string) {
    const fd = openSync(path, 'r');
    const src: ByteSource = {
      size: fstatSync(fd).size,
      read(pos, len) {
        const b = Buffer.alloc(len);
        let got = 0;
        while (got < len) {
          const n = readSync(fd, b, got, len - got, pos + got);
          if (n <= 0) break;
          got += n;
        }
        if (got < len) throw new Error(`${path} : lecture tronquée à ${pos}`);
        return b;
      },
    };
    super(path, src, (d) => inflateSync(d));
    this.fd = fd;
  }

  close(): void {
    closeSync(this.fd);
  }
}
