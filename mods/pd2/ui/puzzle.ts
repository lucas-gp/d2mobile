/**
 * Énigme de Larzuk (lot M12b : autrefois dans la base, src/sim/cube.ts, src/sim/game.ts et src/ui/panels-actions.ts, déplacée telle quelle) :
 * fabrication directe de la boîte à énigme (10 pièces → 1 boîte, même recette `puzzlebox` du Cube, en ville seulement), proposée dans le
 * menu « Artisanat » d'un objet sans châsse (point d'insertion `item.socketActions`, src/mods/ui.ts) ; plafond de châsses des deux recettes
 * de l'énigme : le maximum de la base, quel que soit le niveau de l'objet (règle `cube.socketCap`).
 */
import type { ItemActCtx, ModActEntry, ModApi } from '../../../src/mods/api';
import { addSocketsRecipesFor, BASE_BY_ID, CUBE_BY_ID, matCount, pay, type CharacterState, type CubeResult } from '../../../src/mods/sdk';

/** Pièces d'énigme en stock et nécessaires (recette `puzzlebox` du Cube), sans effet de bord */
export function puzzleBoxCheck(c: CharacterState): { ok: boolean; have: number; need: number; reason?: string } {
  const k = CUBE_BY_ID.puzzlebox.cost[0];
  const have = k.ids.reduce((a, id) => a + matCount(c, id), 0);
  return { ok: have >= k.n, have, need: k.n, reason: have >= k.n ? undefined : `Il manque : ${BASE_BY_ID[k.ids[0]]?.name ?? k.ids[0]} (${have}/${k.n})` };
}

/** Fabrique une boîte à énigme (10 pièces), en ville seulement */
export function craftPuzzleBox(c: CharacterState, town: boolean): CubeResult {
  if (!town) return { ok: false, reason: 'À faire en ville' };
  const chk = puzzleBoxCheck(c);
  if (!chk.ok) return { ok: false, reason: chk.reason };
  pay(c, CUBE_BY_ID.puzzlebox.cost);
  c.materials.puzzlebox = (c.materials.puzzlebox ?? 0) + 1;
  return { ok: true, note: 'Boîte à énigme de Larzuk' };
}

/** Ligne « Fabriquer une boîte à énigme » du menu « Artisanat » : pour un objet que la boîte peut percer, dès qu'on a une pièce ou une boîte */
export function puzzleActions(ctx: ItemActCtx): ModActEntry[] {
  const c = ctx.game.character;
  const pieces = puzzleBoxCheck(c);
  if (!addSocketsRecipesFor(ctx.item).some((r) => r.id === 'sock_puzzlebox') || (pieces.have <= 0 && (c.materials.puzzlebox ?? 0) <= 0)) return [];
  return [
    {
      id: 'craft-puzzlebox',
      okAct: 'craft-puzzlebox-ok',
      label: 'Fabriquer une boîte à énigme (10 pièces)',
      right: `${pieces.have}/${pieces.need}`,
      ok: pieces.ok && ctx.town,
      reason: !ctx.town && pieces.ok ? 'À faire en ville' : pieces.reason,
      note: `Coût : ${pieces.need} × Pièce d’énigme de Larzuk`,
      run: () => {
        const r = craftPuzzleBox(c, ctx.game.mode === 'town');
        ctx.closeMenu();
        if (!r.ok) {
          ctx.host.haptic('fail');
          ctx.host.message(r.reason ?? 'Impossible', '#d66');
        } else {
          ctx.host.haptic('tap');
          ctx.host.message(`Fabriqué : ${r.note}`, '#e8b04a');
        }
        ctx.render();
      },
    },
  ];
}

export function registerPuzzle(api: ModApi): void {
  api.ui.add('item.socketActions', puzzleActions);
  api.rules.set('cube.socketCap', (prev) => (recipeId, base, ilvlCap) => (recipeId.startsWith('sock_puzzle') ? base.maxSockets : prev(recipeId, base, ilvlCap)));
}
