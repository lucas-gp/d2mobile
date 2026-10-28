/**
 * Projection isométrique 2:1 (lacet 45°, élévation 30°), identique à la caméra de la chaîne
 * de pré-rendu. N'existe que dans la couche de rendu : la simulation ignore les pixels.
 */

/** px par unité de monde à l'échelle 1 (1 unité = 2 sous-tuiles D2) */
export const K = (2 * 32) / Math.SQRT2;
const C = K / Math.SQRT2; // 32 px : pas horizontal d'une unité sur un axe
const V = K * Math.cos(Math.PI / 6); // hauteur d'une unité verticale

export function isoX(x: number, y: number): number {
  return (x - y) * C;
}

export function isoY(x: number, y: number, z = 0): number {
  return (x + y) * C * 0.5 - z * V;
}

/** Inverse : point écran (px monde) → coordonnées au sol */
export function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  const a = sx / C; // x − y
  const b = (2 * sy) / C; // x + y
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Vecteur écran (dx droite, dy bas) → direction de monde normalisée (joystick) */
export function screenDirToWorld(dx: number, dy: number): { x: number; y: number } {
  // écran : droite = (x − y), bas = (x + y)/2 → inverse avec le tassement 2:1
  const a = dx;
  const b = dy * 2;
  const wx = (a + b) / 2;
  const wy = (b - a) / 2;
  const l = Math.hypot(wx, wy) || 1;
  return { x: wx / l, y: wy / l };
}

/** Clé de tri de profondeur (plus grand = devant) */
export function depthKey(x: number, y: number): number {
  return (x + y) * 64;
}
