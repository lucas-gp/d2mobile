/**
 * Repères d'une carte D2 pour une run : l'entrée (tuiles spéciales du DS1 : orientation 11, sinon la tuile spéciale d'orientation 10 la plus loin du boss)
 * et la place du boss (emplacements de monstres du DS1, noms de monpreset.txt). Absents : on retombe sur les heuristiques de d2farm.ts.
 */
import type { D2MapData } from '../d2map';

export interface Anchors {
  entry?: { x: number; y: number };
  boss?: { x: number; y: number };
}

/** Nom d'emplacement du boss de chaque carte (monpreset.txt) ; les Anciens : le milieu des trois statues */
const BOSS_PLACE: Record<string, string[]> = {
  tristram: ['griswold'],
  uber_tristram: ['griswold'],
  countess: ['the countess'],
  andariel: ['andariel'],
  mephisto: ['mephisto'],
  pindleskin: ['pindleskin'],
  baal: ['baalthrone'],
  baal_chamber: ['baalcrab'],
  ancients: ['ancientstatue1', 'ancientstatue2', 'ancientstatue3'],
};

export function d2Anchors(m: D2MapData): Anchors {
  // cartes assemblées (Acte I) : arrivée et sortie annoncées par l'export
  const own = (m.raw as { anchors?: Record<string, [number, number]> }).anchors;
  if (own?.prev && own?.next) return { entry: { x: own.prev[0], y: own.prev[1] }, boss: { x: own.next[0], y: own.next[1] } };
  const presets = ((m.raw as { presets?: [string, number, number][] }).presets ?? []).filter(([n]) => !!n);
  const want = BOSS_PLACE[m.id];
  const found = want ? presets.filter(([n]) => want.includes(n)) : [];
  const boss = found.length ? { x: found.reduce((s, p) => s + p[1], 0) / found.length, y: found.reduce((s, p) => s + p[2], 0) / found.length } : undefined;
  // les tuiles spéciales sont en cases (2,5 unités), au centre de la case
  const tiles = (k: string) => (m.landmarks[k] ?? []).map(([x, y]) => ({ x: (x + 0.5) * 2.5, y: (y + 0.5) * 2.5 }));
  let entry: Anchors['entry'];
  const e11 = tiles('special11');
  if (e11.length) entry = { x: e11.reduce((s, p) => s + p.x, 0) / e11.length, y: e11.reduce((s, p) => s + p.y, 0) / e11.length };
  else if (boss) {
    const e10 = tiles('special10');
    if (e10.length) entry = e10.reduce((a, b) => (Math.hypot(b.x - boss.x, b.y - boss.y) > Math.hypot(a.x - boss.x, a.y - boss.y) ? b : a));
  }
  return { entry, boss };
}
