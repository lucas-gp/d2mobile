/**
 * Mots runiques. La table de la base est celle de Diablo II LoD 1.13c (runewords-d2.ts, Runes.txt régénéré depuis les MPQ : lot M10b) ;
 * un mod la patche (Project Diablo 2 : liste de 103 du wiki, mods/pd2/data/items/runewords.patch.ts). Règles (D2/PD2) : base normale ou
 * supérieure SANS affixe magique, nombre de châsses EXACT, runes serties dans l'ORDRE. Les valeurs à fourchette sont tirées au moment où le
 * mot runique se forme.
 */
import { typeMatches, type ItemType, type RunewordDef } from '../types';
import { d2TypeIs } from './itemtypes';
import { D2_RUNEWORDS } from './runewords-d2';

/** Mots runiques de la base ; un mod les patche (ceux des carquois sont ajoutés par le mod pd2) */
export const RUNEWORDS: RunewordDef[] = D2_RUNEWORDS;

/** Un type du mot runique : code `d2:` d'ItemTypes.txt, sinon type ou groupe du jeu */
const fitsType = (base: { id: string; type: ItemType }, t: string): boolean => (t.startsWith('d2:') ? d2TypeIs(base, t.slice(3)) : typeMatches(base.type, [t]));

/** La base accepte-t-elle ce mot runique ? (type d'objet et types exclus, puis sous-type PD2 éventuel : marteaux, épées à deux mains…) */
export function runewordFits(r: RunewordDef, base: { id: string; type: ItemType }): boolean {
  return r.types.some((t) => fitsType(base, t)) && !r.excludeTypes?.some((t) => fitsType(base, t)) && (!r.only?.[base.type] || r.only[base.type]!.includes(base.id));
}

export const RUNEWORD_BY_ID: Record<string, RunewordDef> = Object.fromEntries(RUNEWORDS.map((w) => [w.id, w]));
