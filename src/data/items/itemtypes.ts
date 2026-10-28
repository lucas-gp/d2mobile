/**
 * Types d'objets de Diablo II (ItemTypes.txt, table générée itemtypes-d2.ts) : une base est-elle d'un type, en suivant l'arbre Equiv1 / Equiv2 ?
 * Lu par les affixes (affixes.ts) et les mots runiques (runewords.ts) de la base, dont les types sont des codes `d2:<code>`.
 */
import { D2_BASE_TYPES, D2_ITEM_TYPES } from './itemtypes-d2';

/** Types d'ItemTypes.txt dont hérite un code (lui compris), par l'arbre Equiv1 / Equiv2 */
const d2Ancestors = new Map<string, ReadonlySet<string>>();
function ancestorsOf(code: string): ReadonlySet<string> {
  let set = d2Ancestors.get(code);
  if (!set) {
    const s = new Set<string>();
    const todo = [code];
    while (todo.length) {
      const c = todo.pop()!;
      if (s.has(c)) continue;
      s.add(c);
      todo.push(...(D2_ITEM_TYPES[c] ?? []));
    }
    d2Ancestors.set(code, (set = s));
  }
  return set;
}

/** La base est-elle du type `code` d'ItemTypes.txt (son type ou l'un de ceux dont il hérite) ? Une base hors des tables de D2 n'en a aucun. */
export function d2TypeIs(b: { id: string }, code: string): boolean {
  const t = D2_BASE_TYPES[b.id];
  return t !== undefined && ancestorsOf(t).has(code);
}
