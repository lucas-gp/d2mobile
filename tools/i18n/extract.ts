/**
 * Extrait des sources toutes les chaînes affichables en français (littéraux et gabarits) : catalogue de clés avec « {0} » à la place des expressions.
 * Usage : npx tsx tools/i18n/extract.ts > /tmp/catalog.json
 */
import { extractStrings } from './extract-lib';

const obj: Record<string, string[]> = {};
for (const [k, v] of extractStrings()) obj[k] = [...v].slice(0, 3);
console.log(JSON.stringify(obj));
