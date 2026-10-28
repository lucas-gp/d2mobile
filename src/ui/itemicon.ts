/**
 * Choix de l'image d'inventaire d'un objet (atlas `item:<clé>` de tools/d2import/export-item-icons.ts) : image propre des uniques
 * (`item:<uniqueId>`), sinon variante déterministe dérivée de l'uid (charmes, anneaux, amulettes, joyaux : `item:<base>#n`),
 * sinon image de base (variante 0). Aucun champ stocké : les sauvegardes existantes gardent la même image d'un chargement à l'autre.
 */
import { BASE_BY_ID } from '../data/items/bases';
import { RUNE_BY_ID } from '../data/items/runes';
import { RULES } from '../mods/rules';
import { d2IconUrl } from './d2icons';

function uidHash(uid: string): number {
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) h = Math.imul(h ^ uid.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Clé d'atlas (sans le préfixe `item:`) : `has` dit si une clé existe dans l'atlas importé */
export function pickItemIconKey(item: { uid: string; base: string; uniqueId?: string }, has: (key: string) => boolean): string | null {
  if (item.uniqueId && has(item.uniqueId)) return item.uniqueId;
  let n = 1;
  while (has(`${item.base}#${n}`)) n++;
  if (n === 1) return null; // pas de variantes : image de base
  const v = uidHash(item.uid) % n; // 0 = image de base
  return v === 0 ? null : `${item.base}#${v}`;
}

/** Nom D2 (clé de l'atlas d'images) des runes (« Tal Rune ») et gemmes (« Flawless Ruby ») : leurs identifiants de jeu sont r07, gem_ruby_3… */
function d2GemRuneKey(baseId: string): string | null {
  const r = RUNE_BY_ID[baseId];
  if (r) return `${r.name.toLowerCase()}_rune`;
  const m = /^gem_(\w+)_(\d)$/.exec(baseId);
  if (!m) return null;
  const kind = m[1] === 'sapphire' ? 'saphire' : m[1]; // D2 : « Saphire » dans misc.txt
  return `${['chipped_', 'flawed_', '', 'flawless_', 'perfect_'][Number(m[2])]}${kind}`;
}

/** Image d'un objet précis : image propre de l'unique ou variante d'image (charmes, bijoux), sinon celle de sa base */
export function itemIconOf(item: { uid: string; base: string; uniqueId?: string }): string {
  const k = pickItemIconKey(item, (key) => !!d2IconUrl(`item:${key}`));
  return k ? `item:${k}` : itemIconId(item.base);
}

export function itemIconId(baseId: string): string {
  // image d'inventaire de Diablo II quand elle est importée
  if (d2IconUrl(`item:${baseId}`)) return `item:${baseId}`;
  const alias = d2GemRuneKey(baseId);
  if (alias && d2IconUrl(`item:${alias}`)) return `item:${alias}`;
  // anciens exports de l'atlas : la rune Jah s'appelait « jo_rune » (Jah n'avait alors pas d'image propre : orbe orange)
  if (alias === 'jah_rune' && d2IconUrl('item:jo_rune')) return 'item:jo_rune';
  const b = BASE_BY_ID[baseId];
  if (!b) return 'orb_currency';
  if (b.type === 'currency') {
    if (b.id === 'gold') return 'gold';
    if (b.id === 'key') return 'key';
    if (b.id === 'token_absolution') return 'token';
    return RULES['ui.currencyIcon'](b.id) ?? 'orb_currency';
  }
  if (b.type === 'tpot') return 'potion';
  if (b.type === 'quiver') return 'type_quiver';
  if (b.type === 'gem') return 'gem';
  if (b.type === 'map') return 'map';
  if (
    b.type === 'spear' ||
    b.type === 'javelin' ||
    b.type === 'claw' ||
    b.type === 'scepter' ||
    b.type === 'crossbow' ||
    b.type === 'thrown' ||
    b.type === 'primal' ||
    b.type === 'head' ||
    b.type === 'pelt'
  )
    return `type_${b.type}`;
  return b.type;
}
