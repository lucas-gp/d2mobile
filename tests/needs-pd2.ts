/**
 * Tests de la base qui dépendent encore du contenu du mod pd2 (objets, recettes, tables déplacés dans mods/pd2, mais encore lus par la
 * base) : sautés sans le mod (`MODS=`, test de suppression : tools/ci/suppression.mjs). Chaque `it.skipIf(withoutPd2)` est une
 * dépendance résiduelle de la base à Project Diablo 2, recensée dans docs/internal/MODS-RESIDUEL.md : elle disparaît quand le code
 * concerné passe dans le mod ou devient piloté par les registres (lots M5 à M10).
 */
import { activeModIds } from '../src/mods/activate';

/** Vrai quand le mod pd2 n'est pas actif (jeu de règles `d2`) */
export const withoutPd2 = !activeModIds().includes('pd2');
