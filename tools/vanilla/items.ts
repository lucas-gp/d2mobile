/**
 * Tables d'objets de Diablo II LoD 1.13c (MPQ du joueur + Patch_D2.mpq, lus par tools/audit/common.ts) converties dans les structures du
 * jeu : uniques et sets (portage de tools/itemdata/gen-uniques.py), bases des classes (portage de gen-bases.py), valeurs D2 des bases
 * écrites à la main, runes (Gems.txt, Misc.txt). Les noms affichés (français) ne viennent pas des MPQ : ils sont repris des tables du
 * jeu par identifiant (ils ne dépendent pas du jeu de règles). Rien n'est écrit ici : voir gen.ts.
 */
import type { ItemBase, RuneDef, SetDef, SetItemDef, StatRoll, UniqueDef } from '../../src/data/types';
import type { B } from '../../src/data/items/bases-make';
import { rows } from '../audit/common';
import { convertMods, convertProp, convertRow, num, snake, type Kind } from './props';

/** Homonymes D2 (« Ancient Shield », « Demon Head ») et faute de frappe de la table (« Blood Spirt ») : comme gen-bases.py */
const ALIAS: Record<string, string> = { 'ancient_shield|ashd': 'ancient_shield_sacred', 'demon_head|head': 'demon_head_bone', 'blood_spirt|pelt': 'blood_spirit' };

let codes: Map<string, [string, Kind]> | null = null;
/** Code D2 d'un objet → (identifiant de base du jeu, catégorie) */
export function codeToBase(): Map<string, [string, Kind]> {
  if (codes) return codes;
  codes = new Map();
  for (const [t, kind] of [
    ['weapons', 'weapon'],
    ['armor', 'armor'],
  ] as const)
    for (const r of rows(t)) {
      const c = (r.code ?? '').trim();
      const n = (r.name ?? '').trim();
      if (c && n && !n.includes('/')) codes.set(c, [ALIAS[`${snake(n)}|${(r.type ?? '').trim()}`] ?? snake(n), kind]);
    }
  for (const [c, id, kind] of [
    ['rin', 'ring', 'jewelry'],
    ['amu', 'amulet', 'jewelry'],
    ['cm1', 'small_charm', 'charm'],
    ['cm2', 'large_charm', 'charm'],
    ['cm3', 'grand_charm', 'charm'],
    ['jew', 'jewel', 'jewelry'],
  ] as const)
    codes.set(c, [id, kind]);
  return codes;
}

/**
 * Base du jeu d'un code d'objet D2. « Cap/hat » est écarté des bases (nom à barre oblique) : le bonnet de Biggin, le Crâne infernal et le
 * Parangon de Sander s'y rattachent (gen-uniques.py ne le faisait que pour les uniques ; les deux pièces de set sont des sets vanilla).
 */
const baseOf = (code: string): [string, Kind] | undefined => codeToBase().get(code) ?? (code === 'cap' ? ['cap', 'armor'] : undefined);

/** Uniques de UniqueItems.txt (ordre de la table) ; `names` : nom affiché par identifiant, `bases` : bases connues du jeu */
export function vanillaUniques(names: ReadonlyMap<string, string>, bases: ReadonlySet<string>): UniqueDef[] {
  const out: UniqueDef[] = [];
  const seen = new Set<string>();
  for (const r of rows('uniqueitems')) {
    const name = (r.index ?? '').trim();
    if (!name || r.enabled !== '1' || name === 'Expansion') continue;
    const code = (r.code ?? '').trim();
    const b = baseOf(code);
    if (!b || !bases.has(b[0])) continue;
    const mods = convertRow(r, 12, b[1]);
    if (!mods.length) continue;
    let id = `u_${snake(name)}`;
    if (seen.has(id) && name === 'Rainbow Facet') {
      // 8 variantes D2 (4 éléments × mort / passage de niveau) : la première garde l'identifiant historique
      const elem =
        (
          [
            ['fireDmgPct', 'fire'],
            ['coldDmgPct', 'cold'],
            ['lightDmgPct', 'light'],
            ['poisonDmgPct', 'poison'],
          ] as const
        ).find(([st]) => mods.some((m) => m.stat === st))?.[1] ?? 'x';
      id = `${id}_${elem}_${mods.some((m) => m.stat === 'procLevelUp') ? 'levelup' : 'death'}`;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: names.get(id) ?? name, base: b[0], lvl: num(r.lvl), reqLvl: Math.max(1, num(r['lvl req'])), rarity: Math.max(1, num(r.rarity, 1)), mods });
  }
  return out;
}

/** Pièce dont l'identifiant du jeu suit le nom affiché et non l'index de SetItems.txt (« McAuley's Paragon », affiché « Sander's Paragon ») */
const SET_ITEM_ID: Record<string, string> = { "McAuley's Paragon": 's_sanders_paragon' };

/**
 * Sets de Sets.txt et pièces de SetItems.txt. Bonus portés par une pièce (`aprop1a..5b`) : selon le nombre de pièces portées
 * (`add func` 2 : le k-ième bonus à k+1 pièces), ou selon des pièces précises (`add func` 1 : le k-ième bonus avec la k-ième autre
 * pièce du set, dans l'ordre de la table, `with`).
 */
export function vanillaSets(names: ReadonlyMap<string, string>, bases: ReadonlySet<string>): { items: SetItemDef[]; sets: SetDef[] } {
  const setRows = new Map<string, Record<string, string>>();
  for (const r of rows('sets')) if (r.index) setRows.set(r.index, r);
  const setId = new Map<string, string>();
  for (const s of setRows.keys()) if (s !== 'Expansion') setId.set(s, `set_${snake(s)}`);
  const pieces: { r: Record<string, string>; id: string; kind: Kind; base: string }[] = [];
  for (const r of rows('setitems')) {
    const nm = (r.index ?? '').trim();
    if (!nm || nm === 'Expansion' || !setId.has(r.set)) continue;
    const b = baseOf((r.item ?? '').trim());
    if (!b || !bases.has(b[0])) continue;
    pieces.push({ r, id: SET_ITEM_ID[nm] ?? `s_${snake(nm)}`, kind: b[1], base: b[0] });
  }
  const bySet = new Map<string, string[]>();
  for (const p of pieces) bySet.set(p.r.set, [...(bySet.get(p.r.set) ?? []), p.id]);
  const items: SetItemDef[] = pieces.map(({ r, id, kind, base }) => {
    const others = bySet.get(r.set)!.filter((x) => x !== id);
    const partial: NonNullable<SetItemDef['partial']> = [];
    for (let k = 1; k <= 5; k++) {
      const ps: StatRoll[] = [];
      for (const s of ['a', 'b']) {
        const c = (r[`aprop${k}${s}`] ?? '').trim();
        if (c) ps.push(...convertProp(c, (r[`apar${k}${s}`] ?? '').trim(), num(r[`amin${k}${s}`]), num(r[`amax${k}${s}`]), kind));
      }
      if (!ps.length) continue;
      if (r['add func'] === '1' && others[k - 1]) partial.push({ count: 2, with: [others[k - 1]], mods: ps });
      else partial.push({ count: k + 1, mods: ps });
    }
    const it: SetItemDef = {
      id,
      name: names.get(id) ?? r.index.trim(),
      set: setId.get(r.set)!,
      base,
      lvl: num(r.lvl),
      reqLvl: Math.max(1, num(r['lvl req'])),
      rarity: Math.max(1, num(r.rarity, 1)),
      mods: convertRow(r, 9, kind),
    };
    if (partial.length) it.partial = partial;
    return it;
  });
  const sets: SetDef[] = [];
  for (const [sname, sr] of setRows) {
    if (sname === 'Expansion' || !bySet.get(sname)?.length) continue;
    const bonuses: SetDef['bonuses'] = [];
    for (let k = 2; k <= 5; k++) {
      const ps: StatRoll[] = [];
      for (const s of ['a', 'b']) {
        const c = (sr[`PCode${k}${s}`] ?? '').trim();
        if (c) ps.push(...convertProp(c, (sr[`PParam${k}${s}`] ?? '').trim(), num(sr[`PMin${k}${s}`]), num(sr[`PMax${k}${s}`]), 'jewelry'));
      }
      if (ps.length) bonuses.push({ count: k, mods: ps });
    }
    const full: StatRoll[] = [];
    for (let k = 1; k <= 8; k++) {
      const c = (sr[`FCode${k}`] ?? '').trim();
      if (c) full.push(...convertProp(c, (sr[`FParam${k}`] ?? '').trim(), num(sr[`FMin${k}`]), num(sr[`FMax${k}`]), 'jewelry'));
    }
    if (full.length) bonuses.push({ count: bySet.get(sname)!.length, mods: full });
    const id = setId.get(sname)!;
    sets.push({ id, name: names.get(id) ?? sname, items: bySet.get(sname)!, bonuses });
  }
  return { items, sets };
}

/** Effets d'une ligne de Gems.txt à un emplacement (`weapon`, `helm` : casque et armure, `shield`), valeurs fixes */
function gemSlot(g: Record<string, string>, p: string, kind: Kind): StatRoll[] {
  const mods = [1, 2, 3]
    .map((i) => ({ code: (g[`${p}Mod${i}Code`] ?? '').trim(), par: (g[`${p}Mod${i}Param`] ?? '').trim(), min: num(g[`${p}Mod${i}Min`]), max: num(g[`${p}Mod${i}Max`]) }))
    .filter((m) => m.code);
  const res = convertMods(mods, kind);
  for (const s of res) if (s.min !== s.max) throw new Error(`${g.name} : effet à plage (${s.stat})`);
  return res;
}

/** Gemmes : effets par emplacement de Gems.txt, par identifiant du jeu (`gem_<sorte>_<grade>`, grades ébréché 0 à parfait 4) */
export function vanillaGems(): Record<string, { weapon: StatRoll[]; armor: StatRoll[]; shield: StatRoll[] }> {
  const GRADE = ['Chipped', 'Flawed', '', 'Flawless', 'Perfect'];
  // fautes de la table : « Saphire », « Flawless » abrégé
  const fix = (n: string): string => n.replace('Saphire', 'Sapphire').replace('Flwless', 'Flawless');
  const out: Record<string, { weapon: StatRoll[]; armor: StatRoll[]; shield: StatRoll[] }> = {};
  for (const kind of ['ruby', 'sapphire', 'topaz', 'emerald', 'diamond', 'amethyst', 'skull'])
    for (let grade = 0; grade < 5; grade++) {
      const want = `${GRADE[grade]} ${kind[0].toUpperCase()}${kind.slice(1)}`.trim();
      const g = rows('gems').find((r) => fix((r.name ?? '').trim()) === want);
      if (!g) throw new Error(`Gems.txt : « ${want} » absente`);
      out[`gem_${kind}_${grade}`] = { weapon: gemSlot(g, 'weapon', 'weapon'), armor: gemSlot(g, 'helm', 'armor'), shield: gemSlot(g, 'shield', 'armor') };
    }
  return out;
}

/** Runes (r01 à r33) : effets par emplacement de Gems.txt (arme ; casque et armure ; bouclier), niveaux de Misc.txt */
export function vanillaRunes(): RuneDef[] {
  const misc = new Map(rows('misc').map((r) => [r.code, r]));
  const out: RuneDef[] = [];
  for (const g of rows('gems')) {
    const m = /^r(\d\d)$/.exec(g.code ?? '');
    if (!m) continue;
    const mi = misc.get(g.code)!;
    const qlvl = num(mi.level);
    const req = num(mi.levelreq);
    const r: RuneDef = { id: g.code, name: (mi.name ?? '').replace(/ Rune$/, ''), rank: Number(m[1]) } as RuneDef;
    if (qlvl !== req) r.qlvl = qlvl;
    r.reqLvl = req;
    r.weapon = gemSlot(g, 'weapon', 'weapon');
    r.armor = gemSlot(g, 'helm', 'armor');
    r.shield = gemSlot(g, 'shield', 'armor');
    out.push(r);
  }
  return out;
}

const SKIP_BASES = new Set([
  "Khalim's Flail",
  'KhalimFlail',
  'SuperKhalimFlail',
  'Horadric Malus',
  'Hellforge Hammer',
  "Wirt's Leg",
  'decoy dagger',
  'Gidbinn',
  'Horadric Staff',
  'Staff of the Kings',
  'Boneweave [S]',
  'Troll Belt [S]',
  'Cap/hat',
  'Rancid Gas Potion',
  'Oil Potion',
  'Choking Gas Potion',
  'Exploding Potion',
  'Strangling Gas Potion',
  'Fulminating Potion',
]);
const WTYPE: Record<string, ItemBase['type']> = {
  swor: 'sword',
  axe: 'axe',
  club: 'mace',
  mace: 'mace',
  hamm: 'mace',
  scep: 'scepter',
  knif: 'dagger',
  tkni: 'thrown',
  taxe: 'thrown',
  jave: 'javelin',
  ajav: 'javelin',
  spea: 'spear',
  aspe: 'spear',
  pole: 'polearm',
  staf: 'staff',
  bow: 'bow',
  abow: 'bow',
  xbow: 'crossbow',
  wand: 'wand',
  orb: 'orb',
  h2h: 'claw',
  h2h2: 'claw',
};
type Cls = NonNullable<ItemBase['classOnly']>;
const WCLASS: Record<string, Cls> = {
  bow: ['amazon', 'merc'],
  xbow: ['amazon', 'merc'],
  abow: 'amazon',
  aspe: 'amazon',
  ajav: 'amazon',
  spea: ['amazon', 'barbarian', 'merc'],
  pole: ['barbarian', 'merc'],
  jave: ['amazon', 'barbarian'],
  tkni: ['barbarian', 'amazon', 'assassin'],
  taxe: ['barbarian', 'amazon', 'assassin'],
  h2h: 'assassin',
  h2h2: 'assassin',
  scep: 'paladin',
  orb: 'sorceress',
};
const ATYPE: Record<string, ItemBase['type']> = { helm: 'helm', tors: 'armor', shie: 'shield', glov: 'gloves', boot: 'boots', belt: 'belt', phlm: 'primal', ashd: 'shield', head: 'head' };
const ACLASS: Record<string, Cls> = { phlm: 'barbarian', ashd: 'paladin', head: 'necromancer' };

/** Châsses maximales par palier d'ilvl (1-25, 26-40, 41+) : MaxSock1/25/40 du type (ItemTypes.txt), plafonnées par `gemsockets` */
function socketTiers(type: string, gems: number): [number, number, number] | undefined {
  if (gems <= 0) return undefined;
  const t = rows('itemtypes').find((r) => r.Code === type);
  if (!t) return undefined;
  return [Math.min(gems, num(t.MaxSock1)), Math.min(gems, num(t.MaxSock25)), Math.min(gems, num(t.MaxSock40))];
}

/** Ligne D2 → champs d'une base du jeu tirés des tables (le reste de la base, nom, icône, prix…, est propre au jeu) */
function d2Fields(r: Record<string, string>, weapon: boolean, twoHanded: boolean): Partial<B> {
  const norm = (r.normcode ?? '').trim();
  const uber = (r.ubercode ?? '').trim();
  const ultra = (r.ultracode ?? '').trim();
  const code = r.code.trim();
  const f: Partial<B> = {
    tier: code === norm ? 0 : code === uber ? 1 : code === ultra ? 2 : 0,
    qlvl: num(r.level),
    reqLvl: Math.max(1, num(r.levelreq)),
    reqStr: num(r.reqstr),
    reqDex: weapon ? num(r.reqdex) : 0,
  };
  if (weapon) {
    f.dmg = twoHanded ? [num(r['2handmindam']), num(r['2handmaxdam'])] : [num(r.mindam), num(r.maxdam)];
    const t = r.type.trim();
    if (['jave', 'ajav', 'tkni', 'taxe'].includes(t)) f.missileDmg = [num(r.minmisdam), num(r.maxmisdam)];
  } else {
    f.defense = [num(r.minac), num(r.maxac)];
    if (num(r.block) > 0) f.block = num(r.block);
  }
  // châsses maximales : `gemsockets` plafonné par le palier 41+ du type (une orbe à 4 `gemsockets` n'en a jamais plus de 3)
  const gems = num(r.gemsockets);
  const st = socketTiers(r.type.trim(), gems);
  f.maxSockets = st ? st[2] : gems;
  if (st) f.socketTiers = st;
  return f;
}

/**
 * Bases d'armes et d'armures D2 absentes des bases écrites à la main (`handIds`), dans l'ordre de Weapons.txt puis Armor.txt : portage de
 * gen-bases.py, plus les châsses par palier d'ilvl (`socketTiers`, ItemTypes.txt), qui plafonnent aussi `maxSockets`. Entrées de `mk()`.
 */
export function vanillaClassBases(names: ReadonlyMap<string, string>, handIds: ReadonlySet<string>): B[] {
  const out: B[] = [];
  const seen = new Set<string>();
  for (const [t, kind] of [
    ['weapons', 'w'],
    ['armor', 'a'],
  ] as const)
    for (const r of rows(t)) {
      const name = (r.name ?? '').trim();
      const code = (r.code ?? '').trim();
      const typ = (r.type ?? '').trim();
      if (!name || !code || SKIP_BASES.has(name) || name === 'Expansion') continue;
      const type = kind === 'w' ? WTYPE[typ] : ATYPE[typ];
      if (!type) continue;
      const cls = kind === 'w' ? WCLASS[typ] : ACLASS[typ];
      let id = snake(name);
      if (typ === 'ashd' && name === 'Ancient Shield') id = 'ancient_shield_sacred';
      if (typ === 'head' && name === 'Demon Head') id = 'demon_head_bone';
      if (handIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      // épées à deux mains (le Barbare peut les tenir à une main) : deux mains pour toutes les classes ; arcs, lances, armes d'hast, bâtons aussi
      const two = (r['2handed'] ?? '').trim() === '1' || ['bow', 'abow', 'xbow', 'spea', 'aspe', 'pole', 'staf'].includes(typ);
      const f = d2Fields(r, kind === 'w', two);
      const b = { id, name: names.get(id) ?? name, type } as B;
      if (cls) b.classOnly = cls;
      Object.assign(b, { tier: f.tier, qlvl: f.qlvl, reqLvl: f.reqLvl, reqStr: f.reqStr, reqDex: f.reqDex });
      if (kind === 'w') {
        b.dmg = f.dmg;
        if (two) b.twoHanded = true;
        if (f.missileDmg) b.missileDmg = f.missileDmg;
      } else {
        b.defense = f.defense;
        if (f.block) b.block = f.block;
      }
      b.maxSockets = f.maxSockets;
      if (f.socketTiers) b.socketTiers = f.socketTiers;
      b.icon = type;
      b.generated = true;
      out.push(b);
    }
  return out;
}

/**
 * Bases écrites à la main (bases.ts, bases d'uniques et de sets) qui ont une ligne D2 : identifiant de base → code D2. Les autres
 * (potions et or simplifiés, charmes et bijoux, objets de quête) n'ont pas de valeurs D2 à reprendre.
 */
export const HAND_CODE: Readonly<Record<string, string>> = { arcane_orb: 'ob4', cap: 'cap', blood_spirit: 'drb', chain_gloves: 'mgl', light_plated_boots: 'tbt' };

/** Valeurs D2 d'une base écrite à la main (tier, niveaux, prérequis, dégâts ou défense, blocage, châsses), ou null sans ligne D2 */
export function vanillaHandFields(id: string, twoHanded: boolean): Partial<B> | null {
  const want = HAND_CODE[id];
  for (const [t, weapon] of [
    ['weapons', true],
    ['armor', false],
  ] as const)
    for (const r of rows(t)) {
      const name = (r.name ?? '').trim();
      const code = (r.code ?? '').trim();
      if (!name || !code) continue;
      const typ = (r.type ?? '').trim();
      if (weapon && !WTYPE[typ]) continue;
      if (!weapon && !ATYPE[typ] && typ !== 'pelt' && typ !== 'circ') continue;
      const rid = ALIAS[`${snake(name)}|${typ}`] ?? snake(name);
      if (want ? code === want : rid === id) return d2Fields(r, weapon, twoHanded);
    }
  return null;
}
