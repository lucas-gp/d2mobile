/** Petites fonctions mathématiques pures partagées par la simulation et le rendu (angles, distances, interpolation). */
export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** Angle normalisé dans [0, 2π). */
function normAngle(a: number): number {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}

/** Écart angulaire signé le plus court de a vers b, dans (-π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = normAngle(b - a);
  if (d > Math.PI) d -= TAU;
  return d;
}

/** Index de direction (0..n-1) pour un angle de monde ; 0 = axe +x. */
export function dirIndex(angle: number, n: number): number {
  const step = TAU / n;
  return Math.round(normAngle(angle) / step) % n;
}

/** Distance d'un point à un segment. */
export function distPointSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const l2 = abx * abx + aby * aby;
  let t = l2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / l2 : 0;
  t = clamp(t, 0, 1);
  return dist(px, py, ax + abx * t, ay + aby * t);
}
