/** Point d'entrée du catalogue d'objets : enregistre toutes les bases annexes. */
import { BASES, BASE_BY_ID, registerBases } from './bases';
import { EXTRA_BASES } from './uniques';
import { SET_BASES } from './sets';
import { GEMS, RUNES, RUNE_GEM_BASES, gemBase, runeBase } from './runes';
import { MISC_BASES } from './misc';
import { QUEST_BASES } from './quest';
import { afterRegister } from '../../mods/derived';

let done = false;
function ensureCatalog(): void {
  if (done) return;
  done = true;
  registerBases(EXTRA_BASES);
  registerBases(SET_BASES);
  registerBases(RUNE_GEM_BASES);
  registerBases(MISC_BASES);
  registerBases(QUEST_BASES);
}
ensureCatalog();
// rune ou gemme ajoutée par un mod : sa base d'objet, comme celles de la base (src/mods/derived.ts)
afterRegister('bases des runes et gemmes', (api) => {
  for (const r of RUNES) if (!api.bases.has(r.id)) api.bases.add(runeBase(r));
  for (const g of GEMS) if (!api.bases.has(g.id)) api.bases.add(gemBase(g));
});

export { BASES, BASE_BY_ID };
export * from './affixes';
export * from './uniques';
export * from './sets';
export * from './runes';
export * from './runewords';
