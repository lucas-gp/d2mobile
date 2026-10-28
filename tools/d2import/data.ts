/** Accès aux données de jeu : tables Excel, chaînes localisées, animdata, palettes (mises en cache) */
import type { VfsCore as Vfs } from './vfs-core';
import { parseTxt, type Table } from './formats/txt';
import { parseTbl } from './formats/tbl';
import { parseAnimData, type AnimRecord } from './formats/animdata';
import { loadPalette, type Palette } from './formats/palette';

export class GameData {
  private tables = new Map<string, Table>();
  private strs: Map<string, string> | null = null;
  private anim: Map<string, AnimRecord> | null = null;
  private pals = new Map<string, Palette>();

  constructor(
    readonly vfs: Vfs,
    readonly lang = 'eng',
    /** dossier d'import (MPQ et fichiers complémentaires comme obj.txt) */
    readonly inDir = '',
  ) {}

  /** Table Excel (ex. « monstats ») ou null si absente */
  table(name: string): Table | null {
    if (this.tables.has(name)) return this.tables.get(name)!;
    const t = this.vfs.text(`data\\global\\excel\\${name}.txt`);
    if (t === null) return null;
    const parsed = parseTxt(t);
    this.tables.set(name, parsed);
    return parsed;
  }

  needTable(name: string): Table {
    const t = this.table(name);
    if (!t) throw new Error(`table absente : ${name}.txt`);
    return t;
  }

  /** Chaînes : string.tbl < expansionstring.tbl < patchstring.tbl (les suivantes écrasent) */
  get strings(): Map<string, string> {
    if (this.strs) return this.strs;
    const m = new Map<string, string>();
    for (const f of ['string', 'expansionstring', 'patchstring']) {
      const d = this.vfs.get(`data\\local\\lng\\${this.lang}\\${f}.tbl`);
      if (d) for (const [k, v] of parseTbl(d)) m.set(k, v);
    }
    return (this.strs = m);
  }

  str(key: string): string {
    return this.strings.get(key) ?? key;
  }

  /** animdata (le fichier le plus prioritaire de la pile d'archives) */
  get animdata(): Map<string, AnimRecord> {
    if (!this.anim) {
      const d = this.vfs.get('data\\global\\animdata.d2');
      this.anim = d ? parseAnimData(d) : new Map();
    }
    return this.anim;
  }

  palette(name: string | number): Palette {
    const k = String(name);
    if (!this.pals.has(k)) this.pals.set(k, loadPalette(this.vfs, name));
    return this.pals.get(k)!;
  }
}

export const slug = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
