/**
 * Étape 5 — Page d'aperçu locale (preview/index.html) : lecteur d'animation, scène de test isométrique
 * (sol et murs de l'Acte 1, Paladin et 3 monstres triés en profondeur) et grille d'icônes.
 * Les données sont injectées dans preview/data.js (chargé par balise <script>, donc fonctionne en file://).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readManifest, writeFileEnsured } from './manifest';
import { PREVIEW_HTML } from './preview-page';

interface TileRec {
  id: string;
  file: string;
  dt1: string;
  kind: string;
  orientation: number;
  mainIndex: number;
  subIndex: number;
  rarity: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
  color: [number, number, number];
  opaque: number;
  atlas: { page: number; x: number; y: number };
}

export function buildPreview(outDir: string, log: (s: string) => void): void {
  const manifest = readManifest(outDir) as Record<string, any>;
  const data: Record<string, unknown> = { chars: manifest.chars ?? [], monsters: manifest.monsters ?? [], icons: manifest.icons ?? [], tiles: [] };
  const sets: unknown[] = [];
  for (const t of (manifest.tiles ?? []) as { json: string; dir: string }[]) {
    const p = join(outDir, t.json);
    if (!existsSync(p)) continue;
    const meta = JSON.parse(readFileSync(p, 'utf8'));
    const tiles: TileRec[] = meta.tiles;
    // sol « herbe » : le groupe de sols (mainIndex) le plus vert et le plus nombreux
    const floors = tiles.filter((x) => x.kind === 'floor' && x.opaque >= 6000 && x.color[1] > x.color[0] * 1.03 && x.color[1] > x.color[2] * 1.15);
    const groups = new Map<string, TileRec[]>();
    for (const f of floors) groups.set(`${f.dt1}#${f.mainIndex}`, [...(groups.get(`${f.dt1}#${f.mainIndex}`) ?? []), f]);
    const grass = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? tiles.filter((x) => x.kind === 'floor').slice(0, 8);
    // murs : premier fichier « stonewall », orientations 1 (gauche) et 2 (droite), même groupe
    const walls = tiles.filter((x) => x.kind === 'wall' && /stonewall/i.test(x.dt1));
    const pickWall = (o: number) => {
      const w = walls.filter((x) => x.orientation === o);
      const main = w[0]?.mainIndex;
      return w.filter((x) => x.mainIndex === main).slice(0, 6);
    };
    sets.push({
      ...meta,
      dir: t.dir,
      scene: { grass: grass.map((x) => x.id), wallLeft: pickWall(1).map((x) => x.id), wallRight: pickWall(2).map((x) => x.id) },
    });
    log(`  scène ${meta.level} : ${grass.length} sols d'herbe, murs ${pickWall(1).length}/${pickWall(2).length}`);
  }
  data.tiles = sets;
  writeFileEnsured(join(outDir, 'preview', 'data.js'), `window.D2DATA = ${JSON.stringify(data)};\n`);
  writeFileEnsured(join(outDir, 'preview', 'index.html'), PREVIEW_HTML);
  log(`  écrit : ${join(outDir, 'preview', 'index.html')}`);
}
