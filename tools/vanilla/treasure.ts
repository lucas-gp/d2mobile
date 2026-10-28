/**
 * Classes de trésor de Diablo II LoD 1.13c (TreasureClassEx.txt, MonStats.txt, SuperUniques.txt des MPQ du joueur) converties dans le
 * modèle du moteur (src/data/treasure.ts) : une TC = tirages (`picks`), NoDrop, rapports de qualité (`mods`) et entrées pondérées, résolue
 * récursivement par sim/loot/drops.ts. Rien n'est écrit ici : voir gen.ts.
 *
 * Modèle du moteur (le même pour tous les jeux de règles) :
 * - une seule structure pour toutes les zones, celle de l'Enfer de l'Acte V (variante A) : le niveau des objets suit le niveau du monstre,
 *   pas l'acte ; les TC d'acte (« Act 2 (H) Equip A », « Act 5 Good »…) deviennent donc des feuilles du moteur : `equip` (bases d'équipement
 *   par niveau, armes de mêlée et arcs compris), `good` (bijoux, gemmes, runes : GOOD_TC, ZONE_RUNE_TC), `potion` (une potion par niveau),
 *   et les TC partagées `junk`, `misc`, `magic`, `cpot`, `citem`, `uitem` (celles de l'Enfer de l'Acte V) ;
 * - or : `gold`, `gold125`, `gold150`, `gold200` (« gld,mul=1280 » = ×1,25…) ; runes : `runes:N` (« Runes N », récursion RUNE_TC_RECURSION) ;
 * - objet précis : son identifiant de base (clé, essences, clés et organes du Pandémonium, potions de jet) ; un objet D2 absent du jeu
 *   (parchemins, flèches et carreaux) reste une entrée `d2:<code>` qui ne donne rien : le tirage garde ses probabilités ; un objet unique
 *   nommé (Annihilus du Clone de Diablo, « ROP ») : `unique:<identifiant>` (lot M10e) ;
 * - tirages garantis (`picks` < 0) : chaque entrée est tirée `poids` fois, dans l'ordre, jusqu'à |picks| au total (règle de D2), le poids
 *   écrit est donc le nombre de tirages effectifs ; entrées de même référence fusionnées (même loi) ;
 * - TC propre d'un boss : clé `<identifiant du monstre><difficulté>` (MonStats TreasureClass1, ou la TC de son super-unique), lue avant son
 *   champ `tc` (sim/loot/drops.ts) ; sans TC dans les tables (Anciens), une TC vide.
 * Ce que le moteur ne représente pas : TC de quête (premier meurtre), TC propres aux super-uniques ordinaires (ils tirent la TC d'unique),
 * TC des ubers de Tristram (aucune : la Torche est donnée par le code de D2, src/sim/loot/uber-drops.ts).
 */
import { rows, num } from '../audit/common';
import { codeToBase } from './items';
import { snake } from './props';

export interface VTc {
  id: string;
  picks: number;
  noDrop: number;
  mods?: { unique: number; set: number; rare: number; magic: number };
  entries: { ref: string; weight: number }[];
}

/** Objets divers des tables (Misc.txt) → base du jeu */
const MISC_CODES: Record<string, string> = {
  key: 'key',
  tes: 'essence_twisted',
  ceh: 'essence_charged',
  bet: 'essence_burning',
  fed: 'essence_festering',
  pk1: 'key_terror',
  pk2: 'key_hate',
  pk3: 'key_destruction',
  dhn: 'organ_horn',
  bey: 'organ_eye',
  mbr: 'organ_brain',
  toa: 'token_absolution',
};
/** Potions de soins, de mana, de rajeunissement : feuille `potion` du moteur */
const POTION_CODE = /^(hp\d|mp\d|rvs|rvl)$/;

/** TC partagées du moteur (structure de l'Enfer de l'Acte V) : clé → TC de la table */
export const SHARED: [string, string][] = [
  ['normal', 'Act 5 (H) H2H A'],
  ['caster', 'Act 5 (H) Cast A'],
  ['champion', 'Act 5 (H) Champ A'],
  ['citem', 'Act 5 (H) Citem A'],
  ['unique', 'Act 5 (H) Unique A'],
  ['uitem', 'Act 5 (H) Uitem A'],
  // TC générique d'un boss sans TC propre
  ['boss', 'Baal (H)'],
];
/** Feuilles du moteur que leur TC d'acte définit (la variante de l'Enfer de l'Acte V) */
const ENGINE: [string, string][] = [
  ['junk', 'Act 1 (H) Junk'],
  ['misc', 'Misc 2'],
  ['magic', 'Act 5 (H) Magic A'],
  ['cpot', 'Act 5 (H) Cpot A'],
];

/**
 * Boss : clé de la TC (préfixe, suivi de la difficulté) → TC de MonStats (variante principale) ou du super-unique ; `null` : aucune TC
 * dans les tables (TC vide). Dans l'ordre de la table du jeu (les TC imbriquées précèdent la leur).
 */
const BOSSES: [string, { monstats?: string; su?: string } | null][] = [
  ['countess', { su: 'The Countess' }],
  ['andariel', { monstats: 'andariel' }],
  ['pindleskin', { su: 'Pindleskin' }],
  ['eldritch', { su: 'Megaflow Rectifier' }],
  ['shenk', { su: 'Siege Boss' }],
  ['nihlathak', { monstats: 'nihlathakboss' }],
  ['ancient', null],
  ['cow_king', { su: 'The Cow King' }],
  ['mephisto', { monstats: 'mephisto' }],
  // TC propres de D2 des boss que le jeu fait tirer dans une autre (champ `tc`) ou dans la TC générique
  ['griswold', { monstats: 'griswold' }],
  ['duriel', { monstats: 'duriel' }],
  ['radament', { monstats: 'radament' }],
  ['summoner', { monstats: 'summoner' }],
  ['izual', { monstats: 'izual' }],
  ['hephasto', { monstats: 'hephasto' }],
  ['diablo', { monstats: 'diablo' }],
  ['baal', { monstats: 'baalcrab' }],
  ['blood_raven', { monstats: 'bloodraven' }],
  ['lilith', { monstats: 'uberandariel' }],
  ['uber_duriel', { monstats: 'uberduriel' }],
  ['uber_izual', { monstats: 'uberizual' }],
  // Clone de Diablo (« Diablo marche sur la Terre ») : TC « ROP », Annihilus (lot M10e)
  ['dclone', { monstats: 'diabloclone' }],
];

/** Nom de TC sans sa difficulté (« Countess Item (H) » → « Countess Item », « Duriel (H) - Base » → « Duriel - Base ») */
const plain = (name: string): string => name.replace(/ \([NH]\)/g, '');

export function vanillaTreasure(baseIds: ReadonlySet<string>, uniqueIds: ReadonlySet<string> = new Set()): { tcs: VTc[]; absent: Set<string> } {
  const T = new Map(rows('treasureclassex').map((r) => [r['Treasure Class'], r]));
  const absent = new Set<string>();
  const out = new Map<string, VTc>();

  const weapons = codeToBase();
  /** Référence du moteur d'une entrée (feuille), ou null : TC à traduire (`key` : clé de la TC traduite) */
  function leaf(raw: string): string | null {
    const name = raw.replace(/^"(.*)"$/, '$1');
    if (name === 'Ammo') {
      absent.add('Ammo');
      return 'd2:ammo';
    }
    const gold = /^gld(?:,mul=(\d+))?$/.exec(name);
    if (gold) {
      const mul = gold[1];
      const ref = mul === undefined ? 'gold' : ({ '1280': 'gold125', '1536': 'gold150', '2048': 'gold200' } as Record<string, string>)[mul];
      if (!ref) throw new Error(`or ×${mul} : sans équivalent`);
      return ref;
    }
    const runes = /^Runes (\d+)$/.exec(name);
    if (runes) return `runes:${runes[1]}`;
    const act = /^Act \d(?: \([NH]\))? (Equip|Melee|Bow|Good|Junk|Magic|Cpot|Citem|Uitem) [A-C]$/.exec(name) ?? /^Act \d(?: \([NH]\))? (Good|Junk)$/.exec(name);
    if (act) return ({ Equip: 'equip', Melee: 'equip', Bow: 'equip', Good: 'good', Junk: 'junk', Magic: 'magic', Cpot: 'cpot', Citem: 'citem', Uitem: 'uitem' } as Record<string, string>)[act[1]];
    if (/^H?potion \d$/i.test(name) || POTION_CODE.test(name)) return 'potion';
    if (/^Misc \d$/.test(name)) return 'misc';
    if (T.has(name)) return null;
    // unique nommé (UniqueItems.txt) connu du jeu
    if (uniqueIds.has(`u_${snake(name)}`)) return `unique:u_${snake(name)}`;
    // objet : divers, potion de jet (Weapons.txt), sinon absent du jeu
    const id = MISC_CODES[name] ?? weapons.get(name)?.[0];
    if (id && baseIds.has(id)) return id;
    absent.add(name);
    return `d2:${name.toLowerCase()}`;
  }

  /** Traduit la TC `name` sous la clé `key` (TC imbriquées : `<nom>` + difficulté) */
  function translate(name: string, key: string, d: number): VTc {
    const r = T.get(name);
    if (!r) throw new Error(`TreasureClassEx : ${name} introuvable`);
    const picks = num(r.Picks);
    const tc: VTc = { id: key, picks, noDrop: num(r.NoDrop), entries: [] };
    if (['Unique', 'Set', 'Rare', 'Magic'].some((c) => r[c])) tc.mods = { unique: num(r.Unique), set: num(r.Set), rare: num(r.Rare), magic: num(r.Magic) };
    let left = picks < 0 ? -picks : Infinity;
    for (let i = 1; i <= 10; i++) {
      const item = r[`Item${i}`];
      if (!item) continue;
      let w = num(r[`Prob${i}`]);
      if (picks < 0) {
        w = Math.min(w, left);
        left -= w;
      }
      if (w <= 0) continue;
      let ref = leaf(item);
      if (ref === null) {
        ref = `${snake(plain(item))}${d}`;
        if (!out.has(ref)) out.set(ref, translate(item, ref, d));
      }
      // TC d'acte de même nature (« Act 5 Junk » dans « Act 1 (H) Junk ») : même loi que la TC elle-même, tirage retiré
      if (ref === key) continue;
      const same = tc.entries.find((e) => e.ref === ref);
      if (same) same.weight += w;
      else tc.entries.push({ ref, weight: w });
    }
    return tc;
  }

  const ms = new Map(rows('monstats').map((x) => [x.Id, x]));
  const su = new Map(rows('superuniques').map((x) => [x.Superunique, x]));
  const tcOf = (spec: { monstats?: string; su?: string }, d: number): string => {
    if (spec.su) {
      const x = su.get(spec.su);
      if (!x) throw new Error(`SuperUniques : ${spec.su} introuvable`);
      return x[['TC', 'TC(N)', 'TC(H)'][d]] ?? '';
    }
    const x = ms.get(spec.monstats!);
    if (!x) throw new Error(`MonStats : ${spec.monstats} introuvable`);
    return x[`TreasureClass1${['', '(N)', '(H)'][d]}`] ?? '';
  };

  const list: VTc[] = [];
  for (const [key, name] of SHARED) list.push(translate(name, key, 0));
  for (const d of [0, 1, 2]) {
    for (const [key, spec] of BOSSES) {
      const id = `${key}${d}`;
      const name = spec ? tcOf(spec, d) : '';
      if (!spec) {
        list.push({ id, picks: 0, noDrop: 0, entries: [] });
        continue;
      }
      if (!name) continue; // pas de TC à cette difficulté (mini-ubers : Enfer seulement)
      const before = new Set(out.keys());
      const tc = translate(name, id, d);
      // TC imbriquées de ce boss d'abord (ordre de la table du jeu : Comtesse : runes, objets, puis la sienne)
      for (const k of [...out.keys()].filter((x) => !before.has(x)).reverse()) list.push(out.get(k)!);
      list.push(tc);
      // TC d'un boss reprise par un autre (« ROP » du Clone contient celle de Diablo) : la même clé, sans doublon
      if (!out.has(id)) out.set(id, tc);
    }
  }
  // feuilles partagées du moteur
  for (const [key, name] of ENGINE) list.push(translate(name, key, 0));
  for (const t of list) if (list.filter((x) => x.id === t.id).length > 1) throw new Error(`TC en double : ${t.id}`);
  return { tcs: list, absent };
}

/** TC « Good » de l'Enfer de l'Acte V (bijoux, gemmes, runes) et TC « Jewelry » */
export function vanillaGood(): { good: { jewelry: number; gems: number; runes: number }; jewelry: { ref: string; weight: number }[] } {
  const T = new Map(rows('treasureclassex').map((r) => [r['Treasure Class'], r]));
  const items = (name: string) => {
    const r = T.get(name)!;
    return Array.from({ length: 10 }, (_, i) => [r[`Item${i + 1}`], num(r[`Prob${i + 1}`])] as [string, number]).filter(([n]) => n);
  };
  const good = { jewelry: 0, gems: 0, runes: 0 };
  for (const [n, p] of items('Act 5 (H) Good')) {
    if (n.startsWith('Jewelry')) good.jewelry += p;
    else if (n.endsWith(' Gem')) good.gems += p;
    else if (n.startsWith('Runes')) good.runes += p;
    else throw new Error(`Act 5 (H) Good : ${n} inattendu`);
  }
  const codes = codeToBase();
  const jewelry = items('Jewelry C').map(([c, p]) => {
    const id = codes.get(c)?.[0];
    if (!id) throw new Error(`Jewelry C : ${c} sans base`);
    return { ref: id, weight: p };
  });
  return { good, jewelry };
}

/** Récursion des TC de runes : poids de « Runes N−1 » dans « Runes N » (Runes 2 à 16), et Runes 17 (Zod contre Runes 16) */
export function vanillaRuneRecursion(): { recursion: number[]; zod: number; rec17: number } {
  const T = new Map(rows('treasureclassex').map((r) => [r['Treasure Class'], r]));
  const items = (n: number) => {
    const r = T.get(`Runes ${n}`)!;
    return Array.from({ length: 10 }, (_, i) => [r[`Item${i + 1}`], num(r[`Prob${i + 1}`])] as [string, number]).filter(([x]) => x);
  };
  const recursion = [0];
  for (let n = 2; n <= 16; n++) recursion.push(items(n).find(([x]) => x === `Runes ${n - 1}`)?.[1] ?? 0);
  const r17 = items(17);
  return { recursion, zod: r17.find(([x]) => x === 'r33')?.[1] ?? 0, rec17: r17.find(([x]) => x === 'Runes 16')?.[1] ?? 0 };
}
