/** Images d'une attaque de mêlée selon la forme (module feuille : utilisé par skills.ts et druid.ts). */
import { attackFrames, effectiveIas, framesForSpeed } from './breakpoints';
import type { World } from './world';

/** Images d'une attaque de mêlée selon la forme (D2 : loup-garou rapide, ours-garou lent) */
export function meleeFrames(w: World, id: string): number {
  const d = w.player.d;
  const form = d.form;
  let f =
    form === 'werewolf'
      ? framesForSpeed(13, effectiveIas(d.ias - d.iasSkill) + d.iasSkill)
      : form === 'werebear'
        ? framesForSpeed(14, effectiveIas(d.ias - d.iasSkill) + d.iasSkill)
        : attackFrames(d.ias - d.iasSkill, w.character.classId, d.atkSets, d.iasSkill);
  if (id === 'fury') f = Math.round(f * 1.5);
  return f;
}
