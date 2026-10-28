/**
 * Valeur d'un objet au sol (palier 3 utile / 4 exceptionnel / 5 graal), d'après le catalogue src/data/items/loot-value.ts
 * (listes de filtres de butin PD2, pickits de bots et listes d'échange : docs/internal/audit/loot-valeur.md) et des règles génériques :
 * - uniques et ensembles : catalogue ; sinon 3 seulement si base élite et niveau requis >= 60 ; sinon aucun palier ;
 * - mots runiques : catalogue (base ordinaire / élite ou éthérée) ; sinon 3 ;
 * - bases sans qualité : bases recherchées avec leurs châsses, éthérées = 4 ;
 * - charmes, joyaux, bijoux, gants, bottes, ceintures, diadèmes, rares d'élite : score de modificateurs pondérés.
 * Pur et sans dépendance au filtre du joueur (lootTier de filter.ts l'appelle).
 */
import { BASE_BY_ID } from '../../data/items/bases';
import '../../data/items/index';
import { AFFIX_BY_ID } from '../../data/items/affixes';
import { RULES } from '../../mods/rules';
import { requiredLevel } from '../itemstats';
import type { Item, RolledMod } from '../item';

const CLASS_SKILLS = /^(amz|sorc|nec|pal|bar|druid|asn)Skills$/;

/** Points d'un modificateur recherché (0 : sans intérêt pour la valeur) */
function modPoints(stat: string, v: number): number {
  if (stat.endsWith('Skills')) return (CLASS_SKILLS.test(stat) ? 4 : 3) * v;
  switch (stat) {
    case 'fcr':
      return v >= 30 ? 3 : v >= 20 ? 2 : v >= 10 ? 1 : 0;
    case 'ias':
      return Math.min(2, v / 15);
    case 'fhr':
      return v >= 24 ? 1.5 : v >= 10 ? 0.5 : 0;
    case 'frw':
      return v >= 40 ? 2 : v >= 30 ? 1.5 : v >= 20 ? 0.5 : 0;
    case 'resAll':
      return v / 5;
    case 'resFire':
    case 'resCold':
    case 'resLight':
    case 'resPoison':
      return v >= 40 ? 1.5 : v >= 30 ? 1 : v >= 20 ? 0.5 : 0;
    case 'life':
      return v >= 60 ? 2 : v >= 40 ? 1.5 : v >= 20 ? 0.5 : 0;
    case 'mana':
      return v >= 60 ? 1 : 0;
    case 'mf':
      return v / 15;
    case 'edPct':
      return Math.min(3, v / 20);
    case 'lifeLeech':
    case 'manaLeech':
      return v >= 6 ? 1 : 0;
    case 'str':
    case 'dex':
      return v >= 20 ? 1 : 0;
    case 'socketsAdded':
      return 1.5;
    case 'deadlyStrike':
    case 'crushingBlow':
      return v >= 20 ? 1.5 : 0;
    case 'dr':
    case 'drFlat':
    case 'mdr':
      return v >= 8 ? 1 : 0;
    default:
      return 0;
  }
}

/** Score de valeur des modificateurs d'un objet magique, rare, artisanal ou charme */
function modScore(item: Item): number {
  let s = 0;
  for (const a of item.affixes ?? []) {
    const def = AFFIX_BY_ID[a.id];
    if (!def) continue;
    def.mods.forEach((m, i) => {
      s += modPoints(m.stat, a.values[i] ?? m.min);
    });
  }
  const add = (ms?: RolledMod[]): void => {
    for (const m of ms ?? []) s += modPoints(m.stat, m.value);
  };
  add(item.craftMods);
  add(item.automod);
  return s;
}

function hasSkillMod(item: Item): boolean {
  return !!item.affixes?.some((a) => AFFIX_BY_ID[a.id]?.mods.some((m) => m.stat.endsWith('Skills')));
}

/**
 * Score d'un petit charme (échelle propre aux charmes : les plages des affixes sont petites, `modPoints` — pensé pour les bijoux et
 * les rares — ne les atteint jamais) : vie 16-20 (« de Vita ») et résistances 10-11 sont les modificateurs recherchés.
 */
export function smallCharmScore(item: Item): number {
  let s = 0;
  for (const a of item.affixes ?? []) {
    const def = AFFIX_BY_ID[a.id];
    if (!def) continue;
    def.mods.forEach((m, i) => {
      const v = a.values[i] ?? m.min;
      switch (m.stat) {
        case 'life':
          s += v >= 16 ? 3 : v >= 11 ? 1.5 : 0.5;
          break;
        case 'resAll':
          s += v >= 4 ? 2.5 : 1.5;
          break;
        case 'resFire':
        case 'resCold':
        case 'resLight':
        case 'resPoison':
          s += v >= 10 ? 1.5 : v >= 8 ? 0.75 : 0;
          break;
        case 'mf':
          s += v >= 6 ? 2 : 1;
          break;
        case 'fhr':
          s += 1.5;
          break;
        case 'maxDmg':
        case 'minDmg':
          s += 1.5;
          break;
        case 'frw':
          s += 0.5;
          break;
        case 'gf':
          s += v >= 8 ? 0.5 : 0;
          break;
        case 'str':
        case 'dex':
          s += v >= 2 ? 0.5 : 0;
          break;
        default:
          break;
      }
    });
  }
  return s;
}

const SMALL_SLOTS = new Set(['ring', 'amulet', 'circlet', 'gloves', 'boots', 'belt']);

/** Palier du catalogue d'un unique ou d'un objet de set (règle `loot.value` : catalogue de la base et des mods) */
const tierOfEntry = (kind: 'unique' | 'set', id: string): number | undefined => RULES['loot.value'](kind, id) as number | undefined;
/** Paliers d'un mot runique du catalogue : [base ordinaire, élite ou éthérée] */
const runewordTiers = (id: string): readonly [number, number] | undefined => RULES['loot.value']('runeword', id) as readonly [number, number] | undefined;
/** Châsses minimales d'une base recherchée du catalogue */
export const catalogBaseSockets = (id: string): number | undefined => RULES['loot.value']('base', id) as number | undefined;

/** Palier de valeur (0, 3, 4 ou 5) des objets d'équipement, bijoux, charmes et bases ; 0 pour tout le reste (runes, monnaies, cartes : voir lootTier) */
export function valueTier(item: Item): number {
  const b = BASE_BY_ID[item.base];
  if (!b) return 0;
  const elite = b.tier === 2;
  switch (item.quality) {
    case 'unique':
      return tierOfEntry('unique', item.uniqueId ?? '') ?? (elite && requiredLevel(item) >= 60 ? 3 : 0);
    case 'set':
      return tierOfEntry('set', item.setId ?? '') ?? (elite && requiredLevel(item) >= 60 ? 3 : 0);
    case 'runeword': {
      const e = runewordTiers(item.runeword ?? '');
      return e ? e[elite || item.ethereal ? 1 : 0] : 3;
    }
    case 'normal':
    case 'superior':
    case 'low': {
      const min = catalogBaseSockets(b.id);
      if (min !== undefined && item.sockets >= min) return item.ethereal ? 4 : min >= 6 ? 3 : 0;
      // arme élite à 6 châsses : base de mot runique recherchée
      if (elite && b.slot && item.sockets >= 6 && b.type !== 'quiver') return item.ethereal ? 4 : 3;
      return 0;
    }
    case 'magic':
    case 'rare':
    case 'crafted': {
      const sc = modScore(item);
      switch (b.type) {
        // charmes à +1 compétences (branche ou classe) : toujours exceptionnels
        case 'smallcharm': {
          const cs = smallCharmScore(item);
          return hasSkillMod(item) || cs >= 4.5 ? 4 : cs >= 3 ? 3 : 0;
        }
        case 'largecharm':
          return hasSkillMod(item) || sc >= 9 ? 4 : sc >= 6 ? 3 : 0;
        case 'grandcharm':
          return hasSkillMod(item) || sc >= 10 ? 4 : sc >= 6 ? 3 : 0;
        case 'jewel':
          return sc >= 7 ? 4 : sc >= 4 ? 3 : 0;
      }
      if (SMALL_SLOTS.has(b.type)) return sc >= 9 ? 4 : sc >= 6 ? 3 : 0;
      if (!elite) return 0;
      return sc >= 12 ? 4 : sc >= 8 ? 3 : 0;
    }
  }
  return 0;
}

/** Plus haut palier atteignable par un id du catalogue (pour la liste recommandée) */
export function catalogMaxTier(kind: 'unique' | 'set' | 'runeword', id: string): number {
  if (kind === 'unique' || kind === 'set') return tierOfEntry(kind, id) ?? 0;
  const e = runewordTiers(id);
  return e ? Math.max(e[0], e[1]) : 0;
}
