/**
 * Paliers de butin réaffectés par le joueur (`LootFilterSettings.tierOverride`).
 * Ids du même espace que la surbrillance : `base:`, `unique:`, `set:`, `runeword:`.
 * Priorité : unique / set / mot runique (le plus précis) puis base ; la base ne s'applique qu'aux objets sans identité propre
 * (ni unique, ni set, ni mot runique). Palier 0 = « aucun palier » (le filtre décide seul).
 * Un override ne change que la mise en valeur (faisceau, couleur, annonce, son) : il ne rend jamais visible un objet masqué.
 */
import type { Item } from '../item';
import type { LootFilterSettings, TierOverrideEntry } from '../lootfilter';
import { highlightKeys } from './highlight';

export const MAX_TIER_OVERRIDES = 400;
export type OverrideTier = TierOverrideEntry['tier'];
const TIERS: readonly number[] = [0, 3, 4, 5];

/** Valide une liste lue d'une sauvegarde : entrées bien formées, sans doublon, plafonnée */
export function sanitizeTierOverride(raw: unknown): TierOverrideEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: TierOverrideEntry[] = [];
  const seen = new Set<string>();
  for (const e of raw as Partial<TierOverrideEntry>[]) {
    if (!e || typeof e.id !== 'string' || !/^(base|unique|set|runeword):.+/.test(e.id) || seen.has(e.id) || typeof e.tier !== 'number' || !TIERS.includes(e.tier)) continue;
    seen.add(e.id);
    out.push({ id: e.id, tier: e.tier as OverrideTier });
    if (out.length >= MAX_TIER_OVERRIDES) break;
  }
  return out;
}

/** Palier forcé pour cet objet (la clé la plus précise l'emporte), undefined sans override */
export function matchTierOverride(f: Pick<LootFilterSettings, 'tierOverride'>, item: Item): OverrideTier | undefined {
  const list = f.tierOverride;
  if (!list?.length) return undefined;
  const specific = !!((item.uniqueId && item.quality === 'unique') || item.setId || item.runeword);
  for (const key of highlightKeys(item)) {
    if (key.startsWith('base:') && specific) break;
    const e = list.find((x) => x.id === key);
    if (e) return e.tier;
  }
  return undefined;
}

/** Fixe le palier de plusieurs ids (`null` : par défaut = retire l'override), dans la limite du plafond. `skipped` : refusés par le plafond */
export function withTierOverrides(list: TierOverrideEntry[] | undefined, ids: Iterable<string>, tier: OverrideTier | null): { list: TierOverrideEntry[]; skipped: number } {
  const idSet = new Set(ids);
  const out = (list ?? []).filter((x) => !idSet.has(x.id) || (tier !== null && true));
  if (tier === null) return { list: out, skipped: 0 };
  const byId = new Map(out.map((x) => [x.id, x] as const));
  let skipped = 0;
  for (const id of idSet) {
    const e = byId.get(id);
    if (e) e.tier = tier;
    else if (out.length >= MAX_TIER_OVERRIDES) skipped++;
    else out.push({ id, tier });
  }
  return { list: out.map((x) => ({ ...x })), skipped };
}
