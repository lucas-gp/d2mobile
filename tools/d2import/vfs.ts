/**
 * Système de fichiers virtuel sur plusieurs archives MPQ (Node : ouverture d'un dossier). La logique est dans
 * vfs-core.ts, partagée avec le navigateur.
 * Priorité : la dernière archive de la liste gagne. Ordre par défaut (du moins au plus prioritaire) :
 * d2char < d2data < d2exp < toute autre *.mpq du dossier (patch_d2.mpq, etc., par ordre alphabétique).
 * Déposer un patch dans le dossier d'entrée suffit : aucun changement d'outil.
 */
import { readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { Mpq } from './mpq';
import { VfsCore, orderArchives } from './vfs-core';

export { norm, type ArchiveInfo } from './vfs-core';

export class Vfs extends VfsCore {
  /** Ouvre les archives d'un dossier (+ archives supplémentaires explicites, les plus prioritaires) */
  static open(inputDir: string, extra: string[] = []): Vfs {
    const all = readdirSync(inputDir).filter((f) => f.toLowerCase().endsWith('.mpq'));
    const paths = orderArchives(all)
      .map((f) => join(inputDir, f))
      .concat(extra);
    if (!paths.length) throw new Error(`Aucune archive .mpq dans ${inputDir}`);
    const v = new Vfs();
    for (const p of paths) v.add(basename(p), new Mpq(p));
    return v;
  }

  close(): void {
    for (const a of this.archives) (a.mpq as Mpq).close();
  }
}
