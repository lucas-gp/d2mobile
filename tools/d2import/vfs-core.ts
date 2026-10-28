/**
 * Système de fichiers virtuel sur plusieurs archives MPQ.
 * Priorité : la dernière archive de la liste gagne. Ordre par défaut (du moins au plus prioritaire) :
 * d2char < d2data < d2exp < toute autre *.mpq du dossier (patch_d2.mpq, etc., par ordre alphabétique).
 * Déposer un patch dans le dossier d'entrée suffit : aucun changement d'outil.
 */
import type { MpqCore } from './mpq-core';
import { latin1 } from './bytes';

const KNOWN_ORDER = ['d2char.mpq', 'd2data.mpq', 'd2exp.mpq'];

export const norm = (p: string): string => p.replace(/\//g, '\\').toLowerCase();

/** Du moins au plus prioritaire : d2char < d2data < d2exp < autres *.mpq (alphabétique) ; `names` = noms de fichiers .mpq */
export function orderArchives<T extends string>(names: T[]): T[] {
  const lc = (s: string) => s.toLowerCase();
  const known = KNOWN_ORDER.filter((k) => names.some((f) => lc(f) === k)).map((k) => names.find((f) => lc(f) === k)!);
  const others = names.filter((f) => !KNOWN_ORDER.includes(lc(f))).sort((a, b) => lc(a).localeCompare(lc(b)));
  return [...known, ...others];
}

export interface ArchiveInfo {
  name: string;
  path: string;
  priority: number;
  files: number;
}

export class VfsCore {
  /** Du moins au plus prioritaire */
  readonly archives: { name: string; mpq: MpqCore; files: string[] }[] = [];
  private index: Map<string, number> | null = null;

  /** Ajoute une archive déjà ouverte (l'appelant fournit l'ordre : voir `orderArchives`) */
  add(name: string, mpq: MpqCore): void {
    this.archives.push({ name, mpq, files: mpq.listfile().map(norm) });
    this.index = null;
  }

  info(): ArchiveInfo[] {
    return this.archives.map((a, i) => ({ name: a.name, path: a.name, priority: i, files: a.files.length }));
  }

  /** Tous les chemins connus (union des listfiles, minuscules), triés */
  list(prefix = ''): string[] {
    const p = norm(prefix);
    const idx = this.buildIndex();
    const out: string[] = [];
    for (const k of idx.keys()) if (k.startsWith(p)) out.push(k);
    return out.sort();
  }

  private buildIndex(): Map<string, number> {
    if (this.index) return this.index;
    const m = new Map<string, number>();
    this.archives.forEach((a, i) => {
      for (const f of a.files) m.set(f, i);
    });
    return (this.index = m);
  }

  /** Archive gagnante pour un fichier (index) ou -1 */
  owner(path: string): number {
    const n = norm(path);
    for (let i = this.archives.length - 1; i >= 0; i--) if (this.archives[i].mpq.has(n)) return i;
    return -1;
  }

  has(path: string): boolean {
    return this.owner(path) >= 0;
  }

  get(path: string): Uint8Array | null {
    const n = norm(path);
    for (let i = this.archives.length - 1; i >= 0; i--) {
      const a = this.archives[i].mpq;
      if (a.has(n)) return a.get(n);
    }
    return null;
  }

  /** Diagnostic d'un fichier (archive gagnante) : voir `MpqCore.explain` */
  explain(path: string): string {
    const n = norm(path);
    for (let i = this.archives.length - 1; i >= 0; i--) if (this.archives[i].mpq.has(n)) return this.archives[i].mpq.explain(n);
    return `${path}: not in any archive`;
  }

  need(path: string): Uint8Array {
    const d = this.get(path);
    if (!d) throw new Error(`Fichier absent des archives : ${path}`);
    return d;
  }

  text(path: string): string | null {
    const d = this.get(path);
    return d ? latin1(d) : null;
  }
}
