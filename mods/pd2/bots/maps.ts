/**
 * Cartes d'endgame des bots du jeu pd2 (préparation de ville `prepareMap` de la règle `bots.profile`), reprises telles quelles du cerveau de
 * la base d'avant le lot M13 (src/sim/bot/brain.ts) : rapatrier les cartes, les monter de palier, éviter les zones d'immunisés, améliorer
 * la carte choisie avec les orbes, puis l'ouvrir.
 */
import type { BotTown, Element, RunPlan } from '../../../src/mods/api';
import { computeDerived, MAP_ZONE_BY_ID, MONSTER_BY_ID, type Item } from '../../../src/mods/sdk';
import { MAP_IMMUNE_PCT } from '../data/maps';

/**
 * Part (0-1) des monstres d'une zone de carte immunisés à un élément en Enfer : résistance de
 * base ≥ 100, variantes immunisées (au prorata), immunités de la zone (MAP_IMMUNE_PCT).
 */
export function zoneImmuneShare(zoneId: string, elem: Element): number {
  const z = MAP_ZONE_BY_ID[zoneId];
  if (!z) return 0;
  let share = 0;
  for (const id of z.monsters) {
    const def = MONSTER_BY_ID[id];
    if (!def) continue;
    const base = (def.res as Record<string, number[] | undefined>)[elem]?.[2] ?? 0;
    if (base >= 100) share += 1;
    else if (def.resVariants?.length) {
      const imm = def.resVariants.filter((v) => ((v as Record<string, number[] | undefined>)[elem]?.[2] ?? 0) >= 100).length;
      share += imm / (def.resVariants.length + 1);
    }
  }
  share /= Math.max(1, z.monsters.length);
  if ((z.immune as string[]).includes(elem)) share += (1 - share) * (MAP_IMMUNE_PCT / 100);
  return share;
}

/**
 * Part d'immunisés à son élément au-delà de laquelle une zone de carte est évitée. La Foudre,
 * sans élément secondaire avant le niveau ~95, évite déjà les zones à 30 % d'immunisés
 * (Temple perdu, Cryptes royales : 3 morts sur 3 à la matrice).
 */
export const GOOD_ZONE_SHARE: Readonly<Record<string, number>> = {
  cold: 0.35,
  fire: 0.35,
  light: 0.25,
  wind: 0.3,
  fissure: 0.35,
  bear: 0.3,
  summon: 0.3,
  whirlwind: 0.3,
  frenzy: 0.3,
  hammerdin: 0.3,
  zealot: 0.3,
  javazon: 0.3,
  bowazon: 0.3,
  trapsin: 0.3,
  martial: 0.3,
  summoner: 0.3,
  bonemancer: 0.3,
  pnova: 0.3,
};
/** Nombre de cartes conservées (inventaire + coffre) : le surplus le moins bon est vendu */
const MAP_KEEP = 18;
/** Affixe de carte le plus gênant par build (résistance des monstres à son élément) */
const BAD_AFFIX: Readonly<Record<string, string>> = {
  cold: 'azure',
  fire: 'crimson',
  light: 'opal',
  wind: 'protection',
  fissure: 'crimson',
  bear: 'protection',
  summon: 'protection',
  whirlwind: 'protection',
  frenzy: 'protection',
  hammerdin: 'protection',
  zealot: 'protection',
  javazon: 'protection',
  bowazon: 'protection',
  trapsin: 'protection',
  martial: 'protection',
  summoner: 'protection',
  bonemancer: 'protection',
  pnova: 'protection',
};
const Q_RANK: Record<string, number> = { normal: 0, magic: 1, rare: 2, unique: 3 };
/** Ordre croissant de valeur d'une carte : palier, puis rareté, fortification */
function mapRank(it: Item): number {
  return it.map!.tier * 10 + (Q_RANK[it.quality] ?? 0) * 2 + (it.map!.fortified ? 1 : 0);
}

/**
 * Cartes (comme un joueur PD2) : rapatrie les cartes du coffre, monte de palier au cartographe,
 * choisit le palier le plus haut qui ne l'a pas tué récemment, améliore la carte avec les orbes
 * (Zakarum / arcanique / angélique, relance horadrique d'un affixe gênant pour son élément,
 * fortification, corruption) puis l'ouvre. Renvoie null s'il n'a aucune carte ouvrable.
 */
export function prepareMap(t: BotTown): RunPlan | null {
  const g = t.game;
  const c = g.character;
  if (!g.canOpenMaps().ok) return null;
  for (let tab = 0; tab < c.stash.length; tab++) for (let idx = 0; idx < c.stash[tab].length; idx++) if (c.stash[tab][idx]?.map && c.inventory.includes(null)) g.unstash(tab, idx);
  const maps = () =>
    c.inventory
      .map((it, i) => ({ it, i }))
      .filter((x): x is { it: Item; i: number } => !!x.it?.map)
      .sort((a, b) => mapRank(a.it) - mapRank(b.it));
  const mat = (id: string) => c.materials[id] ?? 0;
  // surplus : on ne garde que les meilleures cartes (le reste est vendu)
  const all = maps();
  for (const x of all.slice(0, Math.max(0, all.length - MAP_KEEP))) if (g.sell(x.i)) t.sold();
  // cartographe : trois cartes normales/magiques d'un palier → une du palier supérieur
  for (const tier of [1, 2]) {
    // pas de montée vers un palier qui l'a tué récemment (les cartes du palier du dessous
    // s'épuiseraient pendant que celles du dessus dorment)
    if (t.isRisky(`map:${tier + 1}`)) continue;
    for (let guard = 0; guard < 10 && mat('orb_cartographer') > 0; guard++) {
      const pool = maps().filter((x) => x.it.map!.tier === tier && (x.it.quality === 'normal' || x.it.quality === 'magic') && !x.it.corrupted);
      if (
        pool.length < 3 ||
        !g.transmute(
          'map_cartographer',
          pool.slice(0, 3).map((x) => x.i),
        ).ok
      )
        break;
    }
  }
  // comme un joueur PD2 : on évite les zones peuplées d'immunisés à son élément (sauf
  // brisure), on recycle les mauvaises cartes au Cube (3 → 1 du même palier)
  const elem = t.elem;
  const sunder = computeDerived(c, 2).sunder[elem];
  const share = (it: Item) => (sunder ? 0 : zoneImmuneShare(it.map!.zone, elem));
  const good = (it: Item) => share(it) <= GOOD_ZONE_SHARE[t.build];
  for (const tier of [1, 2, 3]) {
    for (let guard = 0; guard < 6; guard++) {
      const bad = maps().filter((x) => x.it.map!.tier === tier && !good(x.it) && !x.it.corrupted && (x.it.quality === 'normal' || x.it.quality === 'magic'));
      if (
        bad.length < 3 ||
        !g.transmute(
          'map_three',
          bad.slice(0, 3).map((x) => x.i),
        ).ok
      )
        break;
    }
  }
  // palier : le plus haut qui a une bonne carte et ne l'a pas tué deux fois récemment ; le
  // palier 1 reste toujours ouvert (les cartes rapportent plus que l'Enfer, morts comprises)
  const tiers = [...new Set(maps().map((x) => x.it.map!.tier))].sort((a, b) => b - a);
  // seuls des paliers risqués en stock : on joue le plus bas plutôt que de retourner en run
  const safeTiers = tiers.filter((x) => x === 1 || !t.isRisky(`map:${x}`));
  const open = safeTiers.length ? safeTiers : tiers.slice(-1);
  const tier = open.find((x) => maps().some((m) => m.it.map!.tier === x && good(m.it))) ?? open[open.length - 1];
  if (tier === undefined) return null;
  const score = (it: Item) => mapRank(it) - Math.round(share(it) * 20);
  const pick = () =>
    maps()
      .filter((x) => x.it.map!.tier === tier)
      .sort((a, b) => score(a.it) - score(b.it))
      .pop();
  let cur = pick()!;
  // scarabée : une carte de palier 3 devient un donjon (si le palier 4 n'est pas risqué)
  if (tier === 3 && mat('horadrim_scarab') > 0 && !t.isRisky('map:4') && g.transmute('map_scarab', [cur.i]).ok) {
    // le donjon produit n'occupe pas forcément l'emplacement de la carte consommée (premier emplacement libre)
    cur = maps().find((x) => x.it.map!.tier === 4 && !x.it.corrupted) ?? maps().find((x) => x.i === cur.i) ?? maps()[0];
    if (!cur) return null;
  }
  const it = cur.it;
  const orb = (id: string) => mat(`orb_${id}`) > 0 && g.transmute(`map_${id}`, [cur.i]).ok;
  if (!it.corrupted) {
    if (it.quality === 'normal') orb('zakarum') || orb('arcane');
    if (it.quality === 'magic') orb('angelic');
    const bad = BAD_AFFIX[t.build];
    if (it.quality === 'rare' && it.map!.mods.some((m) => m.id === bad || m.id === 'hindrance')) orb('horadrim');
    if (it.quality !== 'normal' && !it.map!.fortified && mat('orb_fortification') > 0 && it.map!.tier >= 2) orb('fortification');
    // corruption des cartes rares (garde deux éclats)
    if (it.quality === 'rare' && mat('worldstone_shard') > 2) g.transmute('corrupt', [cur.i]);
  }
  return { runId: 'map', difficulty: 2, map: { invIndex: cur.i, tier: it.map!.tier } };
}
