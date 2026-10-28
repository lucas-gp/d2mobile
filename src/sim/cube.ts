/**
 * Exécution des recettes du Cube (src/data/cube.ts). Tout est atomique : on vérifie coûts et
 * objets, puis on consomme et on produit ; en cas de refus, rien ne bouge.
 */
import { Rng } from '../core/rng';
import { BASE_BY_ID } from '../data/items/bases';
import { CUBE_BY_ID, craftSlot, type CraftFamily, type CubeCost, type CubeItemFilter, type CubeRecipe } from '../data/cube';
import { maxDurability } from './durability';
import { AFFIX_BY_ID } from '../data/items/affixes';
import { BASES } from '../data/items/bases';
import { typeMatches, type Slot, type StatRoll } from '../data/types';
import type { CharacterState } from './character-state';
import { cubeItems, isLooseKind, matCount, matTake } from './materials';
import type { Item, RolledMod } from './item';
import { addToCharacter, placeInInventory, repairInventory } from './inventory';
import { baseOf } from './itemstats';
import { eligibleAffixes, affixLevel, generateItem, maxSocketsForIlvl, rollValues } from './loot/itemgen';
import { corruptItem, desecrateItem, taintAnnihilus } from './corruption';
import { RULES } from '../mods/rules';
import { addMapToStash } from './mapstash';
import { derivedList } from '../mods/derived';

export interface CubeResult {
  ok: boolean;
  reason?: string;
  /** Objet produit ou modifié */
  item?: Item;
  /** Matériau produit */
  material?: string;
  /** Texte d'issue (corruption, craft) */
  note?: string;
  /** Run du Pandémonium ouverte par la recette (portail) */
  run?: string;
}

export function itemAccepted(it: Item, f: CubeItemFilter): boolean {
  const b = baseOf(it);
  if (f.qualities && !f.qualities.includes(it.quality)) return false;
  if (f.types && !typeMatches(b.type, f.types)) return false;
  if (f.noSockets && it.sockets > 0) return false;
  if (f.socketed && it.socketed.length === 0) return false;
  if (f.notCorrupted && it.corrupted) return false;
  if (f.notRuneword && it.runeword) return false;
  if (f.tiers && !f.tiers.includes(b.tier)) return false;
  if (f.mapTiers && !(it.map && f.mapTiers.includes(it.map.tier))) return false;
  if (!f.mapTiers && b.type === 'map' && !f.types?.includes('map')) return false;
  if (f.hasSockets && it.sockets <= 0) return false;
  if (f.notEthereal && it.ethereal) return false;
  if (f.durable && maxDurability(it) <= 0) return false;
  if (f.uniqueIds && !(it.uniqueId && f.uniqueIds.includes(it.uniqueId))) return false;
  if (f.corruptedOnly && (!it.corrupted || it.corrupted.desecrated)) return false;
  return true;
}

/** Emplacement d'artisanat d'un objet (null : ne s'artisane pas) */
function slotOf(it: Item): string | null {
  const t = baseOf(it).type;
  return craftSlot(t, typeMatches(t, ['weapon']));
}

/** Artisanat d'une famille sur cet objet (règle `cube.craft` : rune et propriétés fixes), null si l'objet ne s'artisane pas par cette recette */
function craftOf(family: CraftFamily, it: Item): { rune: string; mods: readonly StatRoll[] } | null {
  const slot = slotOf(it);
  return slot ? RULES['cube.craft'](family, slot, baseOf(it)) : null;
}

/** Coût total, y compris la rune d'artisanat qui dépend de l'emplacement */
function fullCost(r: CubeRecipe, items: Item[]): CubeCost[] {
  const cost = [...r.cost];
  if (r.effect.kind === 'craft' && items[0]) {
    const c = craftOf(r.effect.family, items[0]);
    if (c) cost.push({ ids: [c.rune], n: 1 });
  }
  return cost;
}

export function canPay(c: CharacterState, cost: CubeCost[]): boolean {
  const need = new Map<string, number>();
  for (const k of cost) {
    let left = k.n;
    for (const id of k.ids) {
      const have = matCount(c, id) - (need.get(id) ?? 0);
      const take = Math.min(have, left);
      if (take > 0) {
        need.set(id, (need.get(id) ?? 0) + take);
        left -= take;
      }
      if (left === 0) break;
    }
    if (left > 0) return false;
  }
  return true;
}

export function pay(c: CharacterState, cost: CubeCost[], order: 'visible' | 'tab' = 'visible'): void {
  for (const k of cost) {
    let left = k.n;
    for (const id of k.ids) {
      const take = Math.min(matCount(c, id), left);
      if (take > 0) {
        matTake(c, id, take, order);
        left -= take;
      }
      if (left === 0) break;
    }
  }
}

/** Vérification sans effet de bord (pour l'interface) */
export function cubeCheck(c: CharacterState, recipeId: string, invIdx: number[]): { ok: boolean; reason?: string } {
  const r = CUBE_BY_ID[recipeId];
  if (!r) return { ok: false, reason: 'Recette inconnue' };
  const items = invIdx.map((i) => c.inventory[i]).filter((x): x is Item => !!x);
  const n = r.items?.n ?? 0;
  if (new Set(invIdx).size !== invIdx.length || items.length !== n) return { ok: false, reason: n ? `Choisissez ${n} objet${n > 1 ? 's' : ''}` : 'Aucun objet requis' };
  if (r.items && !items.every((it) => itemAccepted(it, r.items!.accept))) return { ok: false, reason: 'Objet non accepté par la recette' };
  if (!canPay(c, fullCost(r, items))) return { ok: false, reason: 'Ingrédients manquants' };
  if (r.effect.kind === 'cowPortal' && cowDifficulty(c) === null) return { ok: false, reason: 'Le portail des Vaches est fermé (tuez Baal dans cette difficulté)' };
  if (r.effect.kind === 'craft' && !c.inventory.some((j, i) => j && baseOf(j).type === 'jewel' && !invIdx.includes(i))) return { ok: false, reason: 'Un joyau est nécessaire' };
  if (r.effect.kind === 'craft' && items[0] && !craftOf(r.effect.family, items[0])) return { ok: false, reason: 'Cet objet ne peut pas être artisané' };
  if (r.effect.kind === 'upgradeBase' && items[0] && !upgradeTarget(items[0].base, r.effect.to))
    return { ok: false, reason: `Pas de version ${r.effect.to === 1 ? 'exceptionnelle' : 'élite'} pour cette base` };
  if (r.effect.kind === 'addSockets') {
    const b = baseOf(items[0]);
    if (b.maxSockets <= 0) return { ok: false, reason: 'Cette base ne peut pas avoir de châsse' };
  }
  return { ok: true };
}

/**
 * Base du palier supérieur de la même famille : même type et même emplacement, au même rang
 * relatif de niveau (la plus basse normale → la plus basse exceptionnelle…). null s'il n'y en a pas.
 */
export function upgradeTarget(baseId: string, to: 1 | 2): string | null {
  const b = BASE_BY_ID[baseId];
  if (!b || b.tier >= to) return null;
  const same = (t: number) => BASES.filter((x) => x.type === b.type && x.slot === b.slot && x.tier === t && !x.noRandomDrop).sort((p, q) => p.qlvl - q.qlvl);
  const from = same(b.tier);
  const cand = same(to);
  if (!cand.length) return null;
  const i = Math.max(
    0,
    from.findIndex((x) => x.id === b.id),
  );
  const k = from.length <= 1 ? 0 : Math.round((i * (cand.length - 1)) / (from.length - 1));
  return cand[k].id;
}

function craftItem(rng: Rng, src: Item, clvl: number, family: CraftFamily): Item {
  const b = baseOf(src);
  // D2 (CubeMain.txt, plvl et ilvl 50) : ilvl = ⌊clvl/2⌋ + ⌊ilvl/2⌋ ; seul l'éthéré passe de l'ingrédient au résultat
  const ilvl = Math.max(1, Math.floor(clvl / 2) + Math.floor(src.ilvl / 2));
  const it: Item = { uid: src.uid, base: src.base, quality: 'crafted', ilvl, sockets: src.sockets, socketed: [], ethereal: src.ethereal, defRoll: src.defRoll };
  const fixed = craftOf(family, src)?.mods ?? [];
  it.craftMods = fixed.map((m): RolledMod => ({ stat: m.stat, value: rollValues(rng, [m])[0] ?? m.min, ...(m.param ? { param: m.param } : {}) }));
  // propriétés aléatoires : 1 à 4 selon l'ilvl (D2MOO, sub_6FC53CD0 : max(tirage 0-4, minimum 1/2/3/4 au-delà d'ilvl 30/50/70)), 3 préfixes et 3 suffixes au plus
  const roll = rng.next();
  const n = ilvl <= 30 ? (roll < 0.4 ? 1 : roll < 0.6 ? 2 : roll < 0.8 ? 3 : 4) : ilvl <= 50 ? (roll < 0.6 ? 2 : roll < 0.8 ? 3 : 4) : ilvl <= 70 ? (roll < 0.8 ? 3 : 4) : 4;
  const used = new Set<string>();
  it.affixes = [];
  const alvl = affixLevel(ilvl, b.qlvl);
  for (let k = 0; k < n; k++) {
    const kind = k % 2 === 0 ? 'prefix' : 'suffix';
    const pool = eligibleAffixes(b, alvl, kind, true, used);
    const a = rng.weighted(pool, (x) => x.freq);
    if (!a) continue;
    used.add(a.group);
    it.affixes.push({ id: a.id, values: rollValues(rng, a.mods) });
  }
  return it;
}

/**
 * Zone du portail des clés : PD2 ne répète pas une zone dans la même partie ; ici, une zone ne revient
 * qu'une fois les trois ouvertes (cycle mémorisé dans les jalons du personnage).
 */
function pickPortal(c: CharacterState, rng: Rng, runs: string[]): string {
  if (runs.length <= 1) return runs[0];
  const ms = c.progression.milestones;
  let left = runs.filter((id) => ms[`pandemonium:${id}`] === undefined);
  if (!left.length) {
    for (const id of runs) delete ms[`pandemonium:${id}`];
    left = runs;
  }
  const run = left[rng.int(left.length)];
  ms[`pandemonium:${run}`] = 1;
  return run;
}

/** Difficulté du portail des Vaches : la plus haute où Baal est tombé et dont le Roi des Vaches n'est pas déjà mort (jalon `cowsclosed:<d>`) */
function cowDifficulty(c: CharacterState): 0 | 1 | 2 | null {
  const p = c.progression;
  for (const d of [2, 1, 0] as const) {
    const baal = (p.completions[`baal:${d}`] ?? 0) > 0 || p.highestDifficulty > d;
    if (baal && p.milestones[`cowsclosed:${d}`] === undefined) return d;
  }
  return null;
}

/** Exécute une recette. `invIdx` : index d'inventaire des objets choisis. */
export function cubeTransmute(c: CharacterState, rng: Rng, recipeId: string, invIdx: number[], order: 'visible' | 'tab' = 'visible'): CubeResult {
  const check = cubeCheck(c, recipeId, invIdx);
  if (!check.ok) return check;
  const rec = CUBE_BY_ID[recipeId];
  const items = invIdx.map((i) => c.inventory[i]!) as Item[];
  const e = rec.effect;
  // calcul du résultat AVANT de consommer (atomicité)
  let produced: Item | undefined;
  let material: string | undefined;
  let note: string | undefined;
  let run: string | undefined;
  switch (e.kind) {
    case 'material':
      material = e.id;
      if (e.cycle) {
        // niveau de difficulté de l'ultime : 0 → 1 → 2 → 0 (jalon `uberdiff:<objet>`)
        const ms = c.progression.milestones;
        const lvl = ((ms[`uberdiff:${e.cycle}`] ?? 0) + 1) % 3;
        ms[`uberdiff:${e.cycle}`] = lvl;
        note = `niveau de difficulté ${lvl}`;
      }
      break;
    case 'taint': {
      note = taintAnnihilus(rng, items[0]);
      produced = items[0];
      break;
    }
    case 'desecrate': {
      const lvl = c.progression.milestones['uberdiff:shadow_hatred'] ?? 0;
      note = desecrateItem(rng, items[0], lvl >= 1 ? 0.6 : 0.5);
      produced = items[0];
      break;
    }
    case 'addSockets': {
      produced = items[0];
      note = rollAddSockets(rng, rec, items[0]);
      break;
    }
    case 'unsocket': {
      const it = items[0];
      it.socketed = [];
      if (it.runeword) {
        it.runeword = undefined;
        it.rolls = undefined;
        it.quality = it.superiorPct ? 'superior' : 'normal';
      }
      produced = it;
      break;
    }
    case 'rerollMagic':
    case 'rerollRare': {
      const src = items[0];
      const ilvl = e.kind === 'rerollRare' ? Math.max(1, Math.floor(0.4 * c.level) + Math.floor(0.4 * src.ilvl)) : src.ilvl;
      const it = generateItem(rng, src.base, ilvl, { forceQuality: e.kind === 'rerollRare' ? 'rare' : 'magic' });
      it.ethereal = src.ethereal;
      produced = it;
      break;
    }
    case 'jewelrySwap':
      produced = generateItem(rng, e.base, Math.max(1, Math.floor(0.75 * c.level)), { forceQuality: 'magic' });
      break;
    case 'craft':
      produced = craftItem(rng, items[0], c.level, e.family);
      break;
    case 'corrupt': {
      const r2 = items[0].map ? RULES['maps.corrupt'](rng, items[0]) : corruptItem(rng, items[0]);
      produced = items[0];
      note = r2;
      break;
    }
    case 'upgradeBase': {
      const it = items[0];
      const target = upgradeTarget(it.base, e.to);
      if (!target) return { ok: false, reason: `Pas de version ${e.to === 1 ? 'exceptionnelle' : 'élite'} pour cette base` };
      const ob = baseOf(it);
      const nb = BASE_BY_ID[target];
      // défense : même position relative dans la plage de la nouvelle base
      if (it.defRoll !== undefined && ob.defense && nb.defense) {
        const t = ob.defense[1] > ob.defense[0] ? (it.defRoll - ob.defense[0]) / (ob.defense[1] - ob.defense[0]) : 1;
        it.defRoll = Math.round(nb.defense[0] + t * (nb.defense[1] - nb.defense[0]));
      }
      it.base = target;
      it.sockets = Math.min(it.sockets, nb.maxSockets);
      produced = it;
      note = nb.name;
      break;
    }
    case 'cowPortal':
      run = 'cows';
      c.progression.milestones['cows:open'] = cowDifficulty(c) as number;
      break;
    case 'portal':
      run = pickPortal(c, rng, e.runs);
      break;
    case 'repair': {
      delete items[0].dur;
      produced = items[0];
      note = 'réparé';
      break;
    }
    case 'socketedMagic': {
      // D2 « usetype,mag » : nouvel objet magique de même base ; 1 ou 2 châsses à chances égales, bornées par la base
      const src = items[0];
      const it = generateItem(rng, src.base, e.ilvl, { forceQuality: 'magic' });
      it.ethereal = src.ethereal;
      it.sockets = Math.max(1, Math.min(baseOf(it).maxSockets, rng.range(1, 2)));
      it.socketed = [];
      produced = it;
      note = `${it.sockets} châsse${it.sockets > 1 ? 's' : ''}`;
      break;
    }
    case 'prismatic': {
      // préfixe imposé (cubemain « pre=331 ») ; le suffixe de l'amulette d'origine n'est pas conservé
      const it = generateItem(rng, 'amulet', 50, { forceQuality: 'magic' });
      const suffix = (it.affixes ?? []).filter((a) => AFFIX_BY_ID[a.id]?.kind === 'suffix');
      const pre = AFFIX_BY_ID[e.prefix ?? 'prismatic_cube'];
      it.affixes = [{ id: pre.id, values: rollValues(rng, pre.mods) }, ...suffix];
      produced = it;
      break;
    }
    case 'respec':
      c.respecs += 1;
      note = '+1 réinitialisation';
      break;
    case 'mapOrb':
    case 'mapCombine':
    case 'mapScarab': {
      const r2 = RULES['maps.applyRecipe'](rng, e, items, c.level);
      if (!r2.ok) return r2;
      produced = r2.item;
      note = r2.note;
      break;
    }
  }
  // validations AVANT toute consommation : un résultat impossible ou un joyau introuvable ne doivent rien coûter
  if (material && !BASE_BY_ID[material]) return { ok: false, reason: 'Résultat impossible' };
  const jewelIdx = e.kind === 'craft' ? c.inventory.findIndex((x, i) => x && baseOf(x).type === 'jewel' && !invIdx.includes(i)) : -1;
  if (e.kind === 'craft' && jewelIdx < 0) return { ok: false, reason: 'Un joyau est nécessaire' };
  // instantané : si le résultat ne peut pas être livré (inventaire plein), les ingrédients sont rendus
  const snapshot = { inv: c.inventory.slice(), mats: { ...c.materials }, gold: c.gold };
  // consommation
  pay(c, fullCost(rec, items), order);
  if (e.kind === 'craft') c.inventory[jewelIdx] = null;
  const inPlace =
    e.kind === 'addSockets' ||
    e.kind === 'unsocket' ||
    e.kind === 'corrupt' ||
    e.kind === 'taint' ||
    e.kind === 'desecrate' ||
    e.kind === 'upgradeBase' ||
    e.kind === 'repair' ||
    (e.kind === 'mapOrb' && produced === items[0]);
  if (!inPlace) {
    for (const i of invIdx) c.inventory[i] = null;
    if (produced) {
      // le résultat peut avoir une autre taille que les ingrédients : première place libre (à défaut, la remise d'aplomb le range)
      if (placeInInventory(c, produced) < 0) {
        c.inventory.push(produced);
        repairInventory(c);
      }
    }
  }
  if (material) {
    const it = { uid: `${material}-${rng.nextU32()}`, base: material, quality: 'normal' as const, ilvl: 1, sockets: 0, socketed: [], qty: 1 };
    if (!addToCharacter(c, it)) {
      c.inventory.splice(0, c.inventory.length, ...snapshot.inv);
      for (const k of Object.keys(c.materials)) delete c.materials[k];
      Object.assign(c.materials, snapshot.mats);
      c.gold = snapshot.gold;
      return { ok: false, reason: 'Inventaire plein : libérez de la place, rien n’a été consommé' };
    }
  }
  return { ok: true, item: produced, material, note, run };
}

/** Tire le nombre de châsses d'une recette `addSockets` et l'applique à l'objet (cube et ajout direct : même fonction) */
function rollAddSockets(rng: Rng, rec: CubeRecipe, it: Item): string {
  const e = rec.effect as Extract<CubeRecipe['effect'], { kind: 'addSockets' }>;
  const b = baseOf(it);
  const lo = b.twoHanded && e.min2h ? e.min2h : e.min;
  const hi = b.twoHanded && e.max2h ? e.max2h : e.max;
  const cap = RULES['cube.socketCap'](rec.id, b, Math.max(1, maxSocketsForIlvl(b, it.ilvl)));
  it.sockets = Math.max(1, Math.min(cap, rng.range(lo, hi)));
  return `${it.sockets} châsse${it.sockets > 1 ? 's' : ''}`;
}

/** Recettes du Cube qui ajoutent des châsses à un objet en place */
export const SOCKET_RECIPES = derivedList('recettes de châsses', () => Object.values(CUBE_BY_ID).filter((r) => r.effect.kind === 'addSockets'));

export interface SocketRecipeCheck {
  ok: boolean;
  reason?: string;
  /** Ingrédients (nom, quantité requise, stock) */
  parts: { name: string; n: number; have: number }[];
  /** Fourchette de châsses possible pour cet objet */
  range: [number, number];
}

/** Recettes d'ajout de châsses qui concernent ce type d'objet (le reste, qualité ou état, est dit par `addSocketsCheck`) */
export function addSocketsRecipesFor(it: Item): CubeRecipe[] {
  const t = baseOf(it).type;
  return SOCKET_RECIPES.filter((r) => !!r.items?.accept.types && typeMatches(t, r.items.accept.types));
}

/** Même conditions et même coût que la recette du Cube, sans effet de bord */
export function addSocketsCheck(c: CharacterState, it: Item | null, recipeId: string): SocketRecipeCheck {
  const rec = CUBE_BY_ID[recipeId];
  const parts = (rec?.cost ?? []).map((k) => ({
    name: k.ids.length === 1 ? (BASE_BY_ID[k.ids[0]]?.name ?? k.ids[0]) : (k.label ?? k.ids[0]),
    n: k.n,
    have: k.ids.reduce((a, id) => a + matCount(c, id), 0),
  }));
  if (!rec || rec.effect.kind !== 'addSockets' || !it) return { ok: false, reason: 'Recette inconnue', parts, range: [0, 0] };
  const e = rec.effect;
  const b = baseOf(it);
  const two = !!(b.twoHanded && e.min2h);
  const cap = RULES['cube.socketCap'](rec.id, b, Math.max(1, maxSocketsForIlvl(b, it.ilvl)));
  const range: [number, number] = [Math.max(1, Math.min(cap, two ? e.min2h! : e.min)), Math.max(1, Math.min(cap, two && e.max2h ? e.max2h : e.max))];
  const bad = (reason: string): SocketRecipeCheck => ({ ok: false, reason, parts, range });
  const f = rec.items!.accept;
  if (it.corrupted) return bad('Déjà corrompu');
  if (it.sockets > 0) return bad('Déjà percé');
  if (b.maxSockets <= 0) return bad('Cette base ne peut pas avoir de châsse');
  if (f.qualities && !f.qualities.includes(it.quality)) return bad(f.qualities.includes('magic') ? 'Ni unique, ni d’ensemble' : 'Objet normal ou supérieur requis');
  if (!itemAccepted(it, f)) return bad(it.runeword ? 'Mot runique : impossible' : 'Objet non accepté par la recette');
  const lack = parts.filter((p) => p.have < p.n).map((p) => p.name);
  if (lack.length || !canPay(c, rec.cost)) return bad(`Il manque : ${lack.join(', ') || 'ingrédients'}`);
  return { ok: true, parts, range };
}

/** Ajout de châsses direct (sans passer par le Cube) : mêmes règles, même coût, même issue à graine égale */
export function addSocketsWith(c: CharacterState, ref: CorruptRef, recipeId: string, rng: Rng): CubeResult {
  const it = corruptRefItem(c, ref);
  const chk = addSocketsCheck(c, it, recipeId);
  if (!chk.ok || !it) return { ok: false, reason: chk.reason };
  const rec = CUBE_BY_ID[recipeId];
  pay(c, rec.cost);
  return { ok: true, item: it, note: rollAddSockets(rng, rec, it) };
}

/** Où se trouve l'objet à corrompre (le Cube ne travaille que sur le sac ; ici aussi le coffre et l'équipement porté) */
export type CorruptRef = { from: 'inv'; idx: number } | { from: 'stash'; tab: number; idx: number } | { from: 'eq'; slot: Slot };

export function corruptRefItem(c: CharacterState, ref: CorruptRef): Item | null {
  if (ref.from === 'inv') return c.inventory[ref.idx] ?? null;
  if (ref.from === 'stash') return c.stash[ref.tab]?.[ref.idx] ?? null;
  return c.equipment[ref.slot] ?? null;
}

/** Même conditions et même coût que la recette « corrupt » du Cube, sans effet de bord */
export function corruptShardCheck(c: CharacterState, it: Item | null): { ok: boolean; reason?: string; cost: number; have: number } {
  const rec = CUBE_BY_ID.corrupt;
  // la recette vient d'un mod (pd2 : éclat de Pierre-Monde) ; sans elle, pas de corruption
  if (!rec) return { ok: false, reason: 'Recette inconnue', cost: 0, have: 0 };
  const have = rec.cost.reduce((a, k) => a + k.ids.reduce((b, id) => b + matCount(c, id), 0), 0);
  const cost = rec.cost.reduce((a, k) => a + k.n, 0);
  if (!it) return { ok: false, reason: 'Aucun objet', cost, have };
  if (it.corrupted) return { ok: false, reason: 'Déjà corrompu', cost, have };
  if (!itemAccepted(it, rec.items!.accept)) return { ok: false, reason: it.runeword ? 'Mot runique : non corruptible' : 'Objet non corruptible', cost, have };
  if (!canPay(c, rec.cost)) return { ok: false, reason: 'Aucun éclat', cost, have };
  return { ok: true, cost, have };
}

/** Corruption directe par éclat (sans passer par le Cube) : mêmes règles, même coût, même issue à graine égale */
export function corruptWithShard(c: CharacterState, ref: CorruptRef, rng: Rng): CubeResult {
  const it = corruptRefItem(c, ref);
  const chk = corruptShardCheck(c, it);
  if (!chk.ok || !it) return { ok: false, reason: chk.reason };
  pay(c, CUBE_BY_ID.corrupt.cost);
  const note = it.map ? RULES['maps.corrupt'](rng, it) : corruptItem(rng, it);
  return { ok: true, item: it, note };
}

/* ------------------------------------------------------------------ */
/* Cartes : amélioration directe et fusion en lot (opérations d'un mod, */
/* règles maps.ops, maps.opCheck, maps.upgrade, maps.mergePreview,      */
/* maps.merge : mods/pd2/sim/mapops.ts) ; types partagés avec l'UI.     */
/* ------------------------------------------------------------------ */

/** Où se trouve la carte : sac, page du coffre ou coffre de cartes */
export type MapRef = { from: 'inv'; idx: number } | { from: 'stash'; tab: number; idx: number } | { from: 'mapstash'; idx: number };

/** Opération d'une carte (menu de la carte) : identifiant, libellé, irréversible ou non */
export interface MapOp {
  id: string;
  label: string;
  irreversible: boolean;
}
export type MapOpId = string;

export interface MapOpCheck {
  ok: boolean;
  reason?: string;
  /** Ingrédient consommé (1 unité), son nom et le stock (même comptage que le Cube) */
  mat: string;
  matName: string;
  have: number;
}

export type MergeQuality = 'normal' | 'normalmagic' | 'notrare';
export interface MergeOpts {
  tier: number;
  /** 'upgrade' : orbe d'amélioration (palier +1) ; 'same' : 3 cartes → 1 du même palier, gratuit */
  mode: 'upgrade' | 'same';
  /** Plafond de lots (absent : tous les lots possibles) */
  maxLots?: number;
  /** Cartes consommables : 'normal' (défaut), 'normalmagic', 'notrare' (comme 'normalmagic', y compris fortifiées, héroïques ou infusées) */
  quality?: MergeQuality;
}
export interface MergePreview {
  ok: boolean;
  reason?: string;
  lots: number;
  /** Cartes éligibles (tous lots confondus) */
  eligible: number;
  consumed: number;
  byQuality: { normal: number; magic: number };
  orbsNeeded: number;
  orbsHave: number;
  /** Palier de la carte obtenue */
  toTier: number;
}
export interface MergeResult {
  ok: boolean;
  reason?: string;
  lots: number;
  consumed: number;
  produced: number;
  orbsUsed: number;
  toTier: number;
}

/** Range toutes les cartes du sac dans le coffre de cartes (jusqu'au plafond) ; renvoie le nombre rangé */
export function stashBagMaps(c: CharacterState): number {
  let n = 0;
  c.inventory.forEach((it, i) => {
    if (it?.map && addMapToStash(c, it)) {
      c.inventory[i] = null;
      n++;
    }
  });
  return n;
}

/* ------------------------------------------------------------------ */
/* Cube en grille : on pose les ingrédients dans le Cube (4 × 3 cases)  */
/* et la recette qui correspond exactement au contenu se déclenche.     */
/* ------------------------------------------------------------------ */

interface GridSplit {
  mats: Map<string, number>;
  others: Item[];
}

/** Ingrédient « matériau » du Cube : rune, gemme, ou monnaie (clé, clé d'uber, essence, organe, orbe…) */
function isCubeMat(it: Item): boolean {
  return isLooseKind(it) || BASE_BY_ID[it.base]?.type === 'currency';
}

function splitCube(c: CharacterState): GridSplit {
  const mats = new Map<string, number>();
  const others: Item[] = [];
  for (const it of cubeItems(c)) {
    if (isCubeMat(it)) mats.set(it.base, (mats.get(it.base) ?? 0) + (it.qty ?? 1));
    else others.push(it);
  }
  return { mats, others };
}

/** Objets cibles de la recette parmi les objets du Cube (le joyau de l'artisanat est à part) ; null si le contenu ne convient pas */
function gridTargets(r: CubeRecipe, others: Item[]): Item[] | null {
  const craft = r.effect.kind === 'craft';
  const n = (r.items?.n ?? 0) + (craft ? 1 : 0);
  if (others.length !== n) return null;
  let targets = others;
  if (craft) {
    const j = others.findIndex((it) => baseOf(it).type === 'jewel');
    if (j < 0) return null;
    targets = others.filter((_, i) => i !== j);
  }
  if (r.items && !targets.every((it) => itemAccepted(it, r.items!.accept))) return null;
  return targets;
}

/** Les ingrédients du Cube couvrent exactement le coût : runes et gemmes uniquement depuis le Cube, clés et monnaies depuis l'onglet */
function gridPays(c: CharacterState, cost: CubeCost[], mats: Map<string, number>): boolean {
  const left = new Map(mats);
  const stock = new Map<string, number>();
  for (const k of cost) {
    let need = k.n;
    for (const id of k.ids) {
      const t = Math.min(left.get(id) ?? 0, need);
      if (t > 0) {
        left.set(id, (left.get(id) ?? 0) - t);
        need -= t;
      }
      if (need === 0) break;
    }
    if (need > 0) {
      // ce qui manque au Cube : seules les clés et monnaies (pas les runes ni les gemmes) se prennent dans l'onglet
      const id = k.ids.find((x) => !isLooseKind({ base: x } as Item)) ?? '';
      if (!id) return false;
      const have = matCount(c, id) - (stock.get(id) ?? 0);
      if (have < need) return false;
      stock.set(id, (stock.get(id) ?? 0) + need);
    }
  }
  return [...left.values()].every((v) => v === 0);
}

/** Recettes qui correspondent exactement au contenu du Cube */
export function cubeMatches(c: CharacterState): CubeRecipe[] {
  const { mats, others } = splitCube(c);
  if (!mats.size && !others.length) return [];
  const out: CubeRecipe[] = [];
  for (const r of CUBE_BY_ID_LIST) {
    const targets = gridTargets(r, others);
    if (!targets) continue;
    if (!gridPays(c, fullCost(r, targets), mats)) continue;
    if (r.effect.kind === 'craft' && !others.some((it) => baseOf(it).type === 'jewel')) continue;
    out.push(r);
  }
  return out;
}

const CUBE_BY_ID_LIST = derivedList('recettes du Cube (index)', () => Object.values(CUBE_BY_ID));

/**
 * Exécute une recette sur le contenu du Cube : les objets cibles passent dans l'inventaire (à leur place habituelle), les runes et gemmes se déposent un instant dans
 * l'onglet de runes pour être consommées, puis la recette s'exécute comme d'habitude. En cas d'échec, tout revient dans le Cube.
 */
export function cubeRunGrid(c: CharacterState, rng: Rng, recipeId: string): CubeResult {
  const rec = CUBE_BY_ID[recipeId];
  if (!rec || !cubeMatches(c).some((r) => r.id === recipeId)) return { ok: false, reason: 'Le contenu du Cube ne correspond à aucune recette' };
  const { others } = splitCube(c);
  const jewel = rec.effect.kind === 'craft' ? others.find((it) => baseOf(it).type === 'jewel') : undefined;
  const snapshot = c.cube.slice();
  const invSnapshot = c.inventory.slice();
  const matSnapshot = { ...c.materials };
  const restore = () => {
    c.cube.splice(0, c.cube.length, ...snapshot);
    c.inventory.splice(0, c.inventory.length, ...invSnapshot);
    for (const k of Object.keys(c.materials)) delete c.materials[k];
    Object.assign(c.materials, matSnapshot);
  };
  // objets cibles (et joyau) vers l'inventaire
  const idx: number[] = [];
  for (let i = 0; i < c.cube.length; i++) {
    const it = c.cube[i];
    if (!it || isCubeMat(it)) continue;
    c.cube[i] = null;
    const at = placeInInventory(c, it);
    if (at < 0) {
      restore();
      return { ok: false, reason: 'Inventaire plein' };
    }
    if (it !== jewel) idx.push(at);
  }
  // runes, gemmes et monnaies : un instant dans l'onglet
  for (let i = 0; i < c.cube.length; i++) {
    const it = c.cube[i];
    if (!it || !isCubeMat(it)) continue;
    c.cube[i] = null;
    c.materials[it.base] = (c.materials[it.base] ?? 0) + (it.qty ?? 1);
  }
  const res = cubeTransmute(c, rng, recipeId, idx, 'tab');
  if (!res.ok) restore();
  return res;
}

export {};
