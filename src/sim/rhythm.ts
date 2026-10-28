/**
 * Rythme des compétences à frappes multiples (Zèle, Furie, Mitraille, Frénésie à deux armes).
 *
 * Avant : toutes les frappes d'une compétence tombaient au même tick (au point de libération de l'animation).
 * Maintenant : la première frappe garde son point de libération, les suivantes s'échelonnent dans le MÊME cycle
 * d'animation (la durée du cycle, donc le DPS théorique, ne change pas ; seul l'instant des coups change : un
 * monstre tué en cours de séquence fait passer les coups restants à la cible suivante, les effets de coup se
 * répartissent dans le temps).
 *
 * Valeurs D2 vanilla (skills.txt du MPQ, tools/audit/common.ts) :
 *   Zèle / Furie : srvdofunc 13 (frappes multiples), anim A1, Param2 100 (chaque frappe suivante à 100 % de la cadence
 *                  d'animation de l'arme), sans UseAttackRate ; rythme de référence 4 images par frappe à 0 % de VA,
 *                  comprimé par la vitesse d'attaque (d'où `scale`).
 *   Mitraille    : srvdofunc 12, anim A1, UseAttackRate 1 : les flèches partent en rafale dans l'animation (1 image
 *                  d'écart au plus ; D2 les tire sur images consécutives).
 *   Frénésie     : anim SQ seqnum 11 (séquence « double attaque »), UseAttackRate 1 : la seconde arme frappe à
 *                  mi-chemin entre la libération et la fin du cycle (même séquence que Double lancer).
 *   Sacrifice    : A1 seqnum 2, un seul coup (aucun rythme à répartir). Fanatisme : aura (pas d'animation).
 */

/** Indice de la frappe en cours (0 = première) ; `undefined` : tout d'un coup (sorts d'objet, mercenaire, tests) */
let current: number | undefined;
/** Mémoire partagée entre les frappes d'une même séquence (ex. Frénésie : un seul cumul de charge) */
export const seqState: { hit: boolean } = { hit: false };

export function strikeIndex(): number | undefined {
  return current;
}

export function withStrike(k: number | undefined, fn: () => void): void {
  const prev = current;
  current = k;
  if (k === 0) seqState.hit = false;
  try {
    fn();
  } finally {
    current = prev;
  }
}

/** Faut-il jouer la frappe `i` (0-indexée) maintenant ? Sans séquence (`undefined`) : toutes d'un coup. */
export function playsStrike(i: number): boolean {
  return current === undefined || current === i;
}

/**
 * Instants (en images depuis le début de l'animation) des frappes 2..N.
 * `refStep` : écart de référence à 0 % de VA ; `scale` = images actuelles / images à 0 % de VA (compression par la VA).
 * L'écart est borné pour que la dernière frappe tombe avant la fin du cycle (`frames - 1`) : DPS inchangé.
 */
export function strikeSchedule(count: number, frames: number, releaseAt: number, refStep: number, scale: number): number[] {
  if (count <= 1) return [];
  const want = Math.max(1, Math.round(refStep * scale));
  const room = Math.max(0, frames - 1 - releaseAt);
  const step = Math.max(room > 0 ? 1 : 0, Math.min(want, Math.floor(room / (count - 1))));
  const out: number[] = [];
  for (let i = 1; i < count; i++) out.push(Math.min(frames - 1, releaseAt + i * step));
  return out;
}
