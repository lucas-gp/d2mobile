/**
 * Sol de la zone : grille de tuiles losanges pré-rendues (4 × 4 unités, variantes sans
 * raccord) et taches organiques pour les chemins et parcelles. Construit une fois par zone.
 */
import { Container, Sprite } from 'pixi.js';
import type { ZoneDef, GroundKind } from '../data/zone-types';
import { hashSeed } from '../core/rng';
import type { SpriteBank } from './assets';
import { isoX, isoY } from './iso';
import { groundKindAt } from './groundcover';

/**
 * Planches de sol d'une zone. L'import D2 peut fournir un sol propre à la zone (`ground_<type>.<zone>`) : il est
 * chargé en plus du sol générique, qui reste le repli si la planche importée est illisible.
 */
export function groundSheets(z: ZoneDef, bank?: SpriteBank): string[] {
  const kinds = new Set<GroundKind>([z.ground, ...z.patches.map((p) => p.kind), ...(z.groundTiles?.kinds ?? [])]);
  const out: string[] = [];
  for (const k of kinds) {
    out.push(`ground_${k}`);
    if (bank?.isImported(`ground_${k}.${z.id}`)) out.push(`ground_${k}.${z.id}`);
  }
  return out;
}

/** Facteur d'agrandissement d'une tuile de `texels` de large pour qu'elle recouvre ses voisines de 1 texel par bord (voir `buildGround`) */
export function seamGrow(texels: number): number {
  return texels > 8 ? 1 + 2 / texels : 1;
}

export function buildGround(z: ZoneDef, bank: SpriteBank): Container {
  const root = new Container();
  root.label = 'ground';
  const sheetOf = (k: GroundKind) => bank.get(`ground_${k}.${z.id}`) ?? bank.get(`ground_${k}`);
  const base = sheetOf(z.ground);
  // côté d'une tuile en unités : 4 pour les sols du jeu, fourni par la planche pour les sols importés
  const T = base?.tileSize ?? 4;
  // sol par tuile (cartes à forme générée) : une planche par tuile, 255 = pas de tuile (noir)
  const gt = z.groundTiles;
  const tileSheets = gt?.kinds.map((k) => sheetOf(k) ?? base);
  const tileVariants = tileSheets?.map((sh) => (sh ? [...sh.frames.keys()].filter((k) => k.startsWith('tile/')) : []));
  if (base) {
    const variants = [...base.frames.keys()].filter((k) => k.startsWith('tile/'));
    // marge de 5 tuiles hors carte : pas de vide noir quand la caméra longe un bord
    const M = 5;
    for (let j = -M; j <= Math.ceil(z.height / T) + M; j++) {
      for (let i = -M; i <= Math.ceil(z.width / T) + M; i++) {
        const h = hashSeed(`${i},${j}`);
        let sheet = base;
        let vars = variants;
        let fx: { tint?: number; glow?: number } | undefined;
        if (gt && tileSheets && tileVariants) {
          // la tuile affichée (taille T de la planche, importée ou non) prend le sol de la case de forme sous son centre, ou de l'emprise (voir groundcover.ts)
          const k = groundKindAt(gt, i, j, T);
          if (k === 255 || !tileSheets[k]) continue;
          sheet = tileSheets[k]!;
          vars = tileVariants[k];
          // l'import D2 fournit déjà une vraie lave (ou boue) : l'effet ne sert qu'au sol générique du jeu
          fx = gt.fx?.[k] && !bank.isImported(`ground_${gt.kinds[k]}`) ? gt.fx[k] : undefined;
        }
        const ft = sheet.frames.get(vars[h % vars.length]);
        if (!ft) continue;
        const s = new Sprite(ft.tex);
        s.anchor.set(ft.ax / ft.tex.width, ft.ay / ft.tex.height);
        const cx = i * T + T / 2;
        const cy = j * T + T / 2;
        s.position.set(isoX(cx, cy), isoY(cx, cy));
        // chaque tuile déborde de 2 texels (≈ 1 texel par bord) : avec `roundPixels` les arêtes en losange de deux tuiles voisines
        // s'arrondissent chacune de leur côté au pixel d'écran, et un trait de fond noir apparaissait entre elles (retour joueur)
        s.scale.set((1 / sheet.scale) * seamGrow(ft.tex.width), (1 / sheet.scale) * seamGrow(ft.tex.height));
        s.cullable = true;
        if (fx?.tint !== undefined) s.tint = fx.tint;
        root.addChild(s);
        if (fx?.glow) {
          // lueur de la lave : la même tuile en mode additif, teintée
          const gs = new Sprite(ft.tex);
          gs.anchor.copyFrom(s.anchor);
          gs.position.copyFrom(s.position);
          gs.scale.copyFrom(s.scale);
          gs.blendMode = 'add';
          gs.tint = fx.glow;
          gs.alpha = 0.3;
          gs.cullable = true;
          root.addChild(gs);
        }
      }
    }
  }
  // parcelles : taches organiques posées en quinconce dans la forme
  for (const p of z.patches) {
    const sheet = sheetOf(p.kind);
    if (!sheet) continue;
    const splats = [...sheet.frames.keys()].filter((k) => k.startsWith('splat/'));
    if (!splats.length) continue;
    const pts: [number, number][] = [];
    const step = 1.3;
    if (p.rect) {
      const [x0, y0, x1, y1] = p.rect;
      for (let y = y0 + 0.6; y <= y1 - 0.4; y += step) for (let x = x0 + 0.6; x <= x1 - 0.4; x += step) pts.push([x, y]);
    } else if (p.circle) {
      const [cx, cy, r] = p.circle;
      for (let y = cy - r; y <= cy + r; y += step) for (let x = cx - r; x <= cx + r; x += step) if ((x - cx) ** 2 + (y - cy) ** 2 <= (r - 0.6) ** 2) pts.push([x, y]);
    } else if (p.path) {
      const { points, width } = p.path;
      for (let k = 1; k < points.length; k++) {
        const [ax, ay] = points[k - 1];
        const [bx, by] = points[k];
        const len = Math.hypot(bx - ax, by - ay);
        const n = Math.ceil(len / (step * 0.8));
        for (let t = 0; t <= n; t++) {
          const x = ax + ((bx - ax) * t) / n;
          const y = ay + ((by - ay) * t) / n;
          const nx = -(by - ay) / len;
          const ny = (bx - ax) / len;
          for (let w = -width / 2 + 0.6; w <= width / 2 - 0.5; w += step) pts.push([x + nx * w, y + ny * w]);
          if (width < 2.4) pts.push([x, y]);
        }
      }
    }
    for (const [x, y] of pts) {
      const h = hashSeed(`${p.kind}:${x.toFixed(2)},${y.toFixed(2)}`);
      const ft = sheet.frames.get(splats[h % splats.length]);
      if (!ft) continue;
      const s = new Sprite(ft.tex);
      s.anchor.set(0.5);
      const jx = ((h >>> 8) % 100) / 250 - 0.2;
      const jy = ((h >>> 16) % 100) / 250 - 0.2;
      s.position.set(isoX(x + jx, y + jy), isoY(x + jx, y + jy));
      s.scale.set(1 / sheet.scale);
      s.cullable = true;
      root.addChild(s);
    }
  }
  return root;
}
