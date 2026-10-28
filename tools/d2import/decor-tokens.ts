import { latin1 } from './bytes';

/** Jetons du décor posé des cartes (sans dépendance Node : partagé avec le navigateur via game-map.ts) */
/** Jetons décoratifs : seuls ceux-là sont posés (pas de coffres, sceaux, portes, autels, points de passage, lumières invisibles…) */
export const TOKENS: Record<number, string[]> = {
  1: ['b1', 'b2', 'to', 'z1', 'z2', 'z3', 'z4', 'z5', 'a1', 'a2', 'bf', 'br', 'fx', 'fy', 'fz', 'n2', 'a4', 'w1', 'ct', 'qa', 'qb', 'it', 'bz', 'by', 'gi', 'bp'],
  2: ['qe', 'qd', 'bm', 'b3', 'fl'],
  3: ['bi', 'fb', 'a4', 'w2'],
  4: ['e1', 'e2', 'e3', 'e4', 'e5', 'e8', '35', 'he'],
  5: ['3m', '3n', '2x', '2p', '29', '2y', '2z', '2w', '6i', '6j', '6k', '6e', 'a1', 'a2'],
};

export const DECOR_SHEETS: { token: string; act: number }[] = Object.entries(TOKENS).flatMap(([a, ts]) => ts.map((token) => ({ token, act: Number(a) })));
export const decorId = (token: string, act: number): string => `dec_${token}_a${act}`;

/**
 * monpreset.txt (acte → noms des emplacements de monstres et de PNJ, dans l'ordre des lignes : l'identifiant d'un monstre de DS1 est cet indice).
 * Sans dépendance Node (partagé avec le navigateur) ; la table vient du patch 1.10+ (Patch_D2.mpq).
 */
export function parseMonPresets(bytes: Uint8Array): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const line of latin1(bytes).split(/\r?\n/).slice(1)) {
    const [act, place] = line.split('\t');
    if (!/^\d+$/.test(act ?? '')) continue;
    out.set(Number(act), [...(out.get(Number(act)) ?? []), place ?? '']);
  }
  return out;
}
