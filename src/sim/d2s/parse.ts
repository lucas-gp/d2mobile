/**
 * Lecteur de fichiers de personnage Diablo II (.d2s), versions 1.10 à 1.14d (version 96 / 0x60) et, non testé, D2R 1.x (0x61).
 * Structure : en-tête (0x00-0x2fc : nom, classe, niveau, difficulté, quêtes, points de passage, mercenaire), attributs
 * ('gf', bits de ItemStatCost), compétences ('if', 30 octets), puis listes d'objets 'JM' (personnage, cadavre, mercenaire 'jf',
 * golem 'kf'). Les objets sont lus bit à bit (indicateurs, code, qualité, sous-types, défense, durabilité, propriétés magiques).
 * Pur (sans DOM) : l'interprétation vers le jeu est dans convert.ts.
 */
import { BitReader, D2sFormatError } from './bitreader';
import { D2S_TABLES, type D2sTables } from './tables';

export { D2sFormatError };

const D2S_CLASSES = ['amazon', 'sorceress', 'necromancer', 'paladin', 'barbarian', 'druid', 'assassin'] as const;
/** Premier identifiant de compétence de chaque classe (ordre de Skills.txt) */
export const D2S_SKILL_BASE = [6, 36, 66, 96, 126, 221, 251];

export interface D2sProp {
  /** Identifiant de statistique (ItemStatCost) */
  id: number;
  /** Paramètre (compétence, classe, élément…) */
  param?: number;
  /** Niveau de compétence (déclencheurs, charges) ou onglet de compétences (stat 188) */
  extra?: number;
  /** Valeurs, après retrait du décalage de sauvegarde (plusieurs pour min/max/durée) */
  v: number[];
}

export interface D2sItem {
  code: string;
  simple: boolean;
  identified: boolean;
  socketed: boolean;
  ethereal: boolean;
  isEar: boolean;
  runeword: boolean;
  personalized: boolean;
  /** 0 rangé, 1 équipé, 2 ceinture, 4 curseur, 6 serti */
  location: number;
  equipped: number;
  x: number;
  y: number;
  /** Page : 1 inventaire, 4 cube, 5 coffre */
  page: number;
  ilvl: number;
  /** 1 abîmé, 2 normal, 3 supérieur, 4 magique, 5 set, 6 rare, 7 unique, 8 artisanal */
  quality: number;
  magicPrefix: number;
  magicSuffix: number;
  setId: number;
  uniqueId: number;
  rareName1: number;
  rareName2: number;
  rareAffixes: number[];
  runewordId: number;
  defense?: number;
  maxDur?: number;
  dur?: number;
  quantity?: number;
  /** Nombre total de châsses (objets non simples, déjà serti ou non) */
  sockets: number;
  props: D2sProp[];
  setProps: D2sProp[][];
  rwProps: D2sProp[];
  children: D2sItem[];
  earName?: string;
}

interface D2sMerc {
  dead: boolean;
  id: number;
  nameId: number;
  type: number;
  exp: number;
}

export interface D2sCharacter {
  version: number;
  name: string;
  classId: (typeof D2S_CLASSES)[number];
  level: number;
  hardcore: boolean;
  died: boolean;
  expansion: boolean;
  ladder: boolean;
  /** Octet de progression (titre) */
  progression: number;
  /** Difficulté en cours (0 Normal, 1 Cauchemar, 2 Enfer), -1 si inconnue */
  difficulty: number;
  /** Difficultés dont la quête de Baal est terminée (index 0-2) */
  baalDone: boolean[];
  activeWeaponSet: number;
  merc: D2sMerc | null;
  attrs: {
    strength: number;
    energy: number;
    dexterity: number;
    vitality: number;
    statPoints: number;
    skillPoints: number;
    hp: number;
    mana: number;
    stamina: number;
    level: number;
    experience: number;
    gold: number;
    stashGold: number;
  };
  /** Niveaux de compétences (30 valeurs, dans l'ordre de la classe) */
  skills: number[];
  items: D2sItem[];
  corpseItems: D2sItem[];
  mercItems: D2sItem[];
  golem: D2sItem | null;
  /** Lecture des objets interrompue (variante non prise en charge ou fichier tronqué) : seuls les objets lus avant l'erreur sont présents */
  truncated: boolean;
}

const SUPPORTED = new Set([0x60, 0x61]);
/** Statistiques lues en série (np de ItemStatCost) : min/max (+ durée) */
const MULTI: Record<number, number> = { 17: 2, 48: 2, 50: 2, 52: 2, 54: 3, 57: 3 };

/** Arbre de Huffman de D2R pour les codes d'objets */
const HUFFMAN: unknown = [
  [
    [
      [
        ['w', 'u'],
        [['8', ['y', ['5', ['j', []]]]], 'h'],
      ],
      ['s', [['2', 'n'], 'x']],
    ],
    [
      [['c', ['k', 'f']], 'b'],
      [
        ['t', 'm'],
        ['9', '7'],
      ],
    ],
  ],
  [
    ' ',
    [
      [
        [['e', 'd'], 'p'],
        [
          'g',
          [
            [['z', 'q'], '3'],
            ['v', '6'],
          ],
        ],
      ],
      [
        ['r', 'l'],
        [
          'a',
          [
            ['1', ['4', '0']],
            ['i', 'o'],
          ],
        ],
      ],
    ],
  ],
];

export interface ParseOptions {
  tables?: D2sTables;
}

export function parseD2s(bytes: Uint8Array, opts: ParseOptions = {}): D2sCharacter {
  const T = opts.tables ?? D2S_TABLES;
  if (bytes.length < 0x300) throw new D2sFormatError('Fichier trop court pour un personnage Diablo II');
  const r = new BitReader(bytes);
  if (r.u32() !== 0xaa55aa55) throw new D2sFormatError('Ce fichier n’est pas un personnage Diablo II (.d2s)');
  const version = r.u32();
  if (!SUPPORTED.has(version)) throw new D2sFormatError(`Version de sauvegarde ${version} non prise en charge (1.10 à 1.14d uniquement)`);
  r.seekByte(0x10);
  const activeWeaponSet = r.u32() ? 1 : 0;
  r.seekByte(0x14);
  const name = r.str(16);
  const status = bytes[0x24];
  const progression = bytes[0x25];
  const cls = bytes[0x28];
  if (cls >= D2S_CLASSES.length) throw new D2sFormatError('Classe de personnage inconnue');
  const level = bytes[0x2b];
  const diffBytes = [bytes[0xa8], bytes[0xa9], bytes[0xaa]];
  const difficulty = diffBytes.findIndex((b) => (b & 0x80) !== 0);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const merc: D2sMerc | null = dv.getUint32(0xb3, true)
    ? { dead: dv.getUint16(0xb1, true) !== 0, id: dv.getUint32(0xb3, true), nameId: dv.getUint16(0xb7, true), type: dv.getUint16(0xb9, true), exp: dv.getUint32(0xbb, true) }
    : null;
  // quête de Baal (acte V, 6e quête) de chaque difficulté : indicateur « terminée » (bit 0) ou « fermée » (bit 12)
  const baalDone = [0, 1, 2].map((d) => {
    const q = dv.getUint16(0x159 + d * 96 + 0x50, true);
    return (q & 1) !== 0 || (q & 0x1000) !== 0;
  });

  // attributs
  r.seekByte(0x2fd);
  const attrs = { strength: 0, energy: 0, dexterity: 0, vitality: 0, statPoints: 0, skillPoints: 0, hp: 0, mana: 0, stamina: 0, level, experience: 0, gold: 0, stashGold: 0 };
  if (r.str(2) !== 'gf') throw new D2sFormatError('Section des caractéristiques introuvable');
  for (;;) {
    const id = r.bits(9);
    if (id === 0x1ff) break;
    const size = T.charBits[id];
    if (!size) throw new D2sFormatError(`Caractéristique inconnue (${id})`);
    let v = r.bits(size);
    if (id >= 6 && id <= 11) v = Math.floor(v / 256);
    switch (id) {
      case 0:
        attrs.strength = v;
        break;
      case 1:
        attrs.energy = v;
        break;
      case 2:
        attrs.dexterity = v;
        break;
      case 3:
        attrs.vitality = v;
        break;
      case 4:
        attrs.statPoints = v;
        break;
      case 5:
        attrs.skillPoints = v;
        break;
      case 7:
        attrs.hp = v;
        break;
      case 9:
        attrs.mana = v;
        break;
      case 11:
        attrs.stamina = v;
        break;
      case 12:
        attrs.level = v;
        break;
      case 13:
        attrs.experience = v;
        break;
      case 14:
        attrs.gold = v;
        break;
      case 15:
        attrs.stashGold = v;
        break;
    }
  }
  r.align();
  // compétences
  if (r.str(2) !== 'if') throw new D2sFormatError('Section des compétences introuvable');
  const skills: number[] = [];
  for (let i = 0; i < 30; i++) skills.push(r.u8());

  const readItem = (): D2sItem => readOneItem(r, version, T);
  const readList = (sink: D2sItem[]): void => {
    if (r.str(2) !== 'JM') throw new D2sFormatError('Liste d’objets introuvable');
    const n = r.u16();
    for (let i = 0; i < n; i++) sink.push(readItem());
  };
  const items: D2sItem[] = [];
  const corpseItems: D2sItem[] = [];
  const mercItems: D2sItem[] = [];
  let golem: D2sItem | null = null;
  const expansion = (status & 0x20) !== 0;
  // une erreur dans les objets (variante non prise en charge, fichier tronqué) ne perd pas ce qui a déjà été lu
  let truncated = false;
  try {
    readList(items);
    // cadavre : 'JM', nombre de cadavres, puis (12 octets + liste) par cadavre
    if (r.str(2) !== 'JM') throw new D2sFormatError('Section du cadavre introuvable');
    const corpses = r.u16();
    for (let i = 0; i < corpses; i++) {
      r.bits(96);
      readList(corpseItems);
    }
    if (expansion) {
      if (r.str(2) !== 'jf') throw new D2sFormatError('Section du mercenaire introuvable');
      if (merc) readList(mercItems);
      if (r.str(2) === 'kf' && r.u8() === 1) golem = readItem();
    }
  } catch (e) {
    if (!(e instanceof D2sFormatError)) throw e;
    truncated = true;
  }
  return {
    version,
    name,
    classId: D2S_CLASSES[cls],
    level: attrs.level || level,
    hardcore: (status & 4) !== 0,
    died: (status & 8) !== 0,
    expansion,
    ladder: (status & 0x40) !== 0,
    progression,
    difficulty,
    baalDone,
    activeWeaponSet,
    merc,
    attrs,
    skills,
    items,
    corpseItems,
    mercItems,
    golem,
    truncated,
  };
}

function readOneItem(r: BitReader, version: number, T: D2sTables): D2sItem {
  if (version <= 0x60 && r.str(2) !== 'JM') throw new D2sFormatError('En-tête d’objet introuvable');
  const it: D2sItem = {
    code: '',
    simple: false,
    identified: false,
    socketed: false,
    ethereal: false,
    isEar: false,
    runeword: false,
    personalized: false,
    location: 0,
    equipped: 0,
    x: 0,
    y: 0,
    page: 0,
    ilvl: 0,
    quality: 2,
    magicPrefix: 0,
    magicSuffix: 0,
    setId: 0,
    uniqueId: 0,
    rareName1: 0,
    rareName2: 0,
    rareAffixes: [],
    runewordId: 0,
    sockets: 0,
    props: [],
    setProps: [],
    rwProps: [],
    children: [],
  };
  // indicateurs (32 bits)
  const flags = r.u32();
  const f = (b: number) => ((flags >>> b) & 1) === 1;
  it.identified = f(4);
  it.socketed = f(11);
  it.isEar = f(16);
  it.simple = f(21);
  it.ethereal = f(22);
  it.personalized = f(24);
  it.runeword = f(26);
  r.bits(version <= 0x60 ? 10 : 3);
  it.location = r.bits(3);
  it.equipped = r.bits(4);
  it.x = r.bits(4);
  it.y = r.bits(4);
  it.page = r.bits(3);
  let socketChildren = 0;
  if (it.isEar) {
    r.bits(3);
    r.bits(7);
    let n = '';
    for (let i = 0; i < 15; i++) {
      const c = r.bits(7);
      if (!c) break;
      n += String.fromCharCode(c);
    }
    it.earName = n;
    it.code = 'ear';
    r.align();
    return it;
  }
  it.code = version <= 0x60 ? r.str(4).trim() : huffmanCode(r);
  const row = T.items[it.code];
  const kind = row?.[0];
  const flagsRow = row?.[3] ?? 0;
  if (!row) throw new D2sFormatError(`Objet de code inconnu « ${it.code} »`);
  if (flagsRow & 2) r.bits(T.stats[356]?.[1] ?? 2);
  socketChildren = r.bits(it.simple || flagsRow & 2 ? 1 : 3);
  if (!it.simple) {
    r.u32(); // identifiant de l'objet
    it.ilvl = r.bits(7);
    it.quality = r.bits(4);
    if (r.bit()) r.bits(3); // image
    if (r.bit()) r.bits(11); // affixe automatique (classe)
    switch (it.quality) {
      case 1:
        r.bits(3);
        break;
      case 3:
        r.bits(3);
        break;
      case 4:
        it.magicPrefix = r.bits(11);
        it.magicSuffix = r.bits(11);
        break;
      case 5:
        it.setId = r.bits(12);
        break;
      case 7:
        it.uniqueId = r.bits(12);
        break;
      case 6:
      case 8:
        it.rareName1 = r.bits(8);
        it.rareName2 = r.bits(8);
        for (let i = 0; i < 6; i++) if (r.bit()) it.rareAffixes.push(r.bits(11));
        break;
    }
    if (it.runeword) {
      it.runewordId = r.bits(12);
      r.bits(4);
    }
    if (it.personalized) {
      for (let i = 0; i < 16; i++) if (r.bits(version > 0x61 ? 8 : 7) === 0) break;
    }
    if (flagsRow & 4) r.bits(5); // livres (sort)
    r.bit(); // horodatage
    if (kind === 'a') it.defense = r.bits(T.stats[31][1]) - T.stats[31][2];
    if (kind === 'a' || kind === 'w') {
      it.maxDur = r.bits(T.stats[73][1]) - T.stats[73][2];
      if (it.maxDur > 0) it.dur = r.bits(T.stats[72][1]) - T.stats[72][2];
    }
    if (flagsRow & 1) it.quantity = r.bits(9);
    if (it.socketed) it.sockets = r.bits(4);
    let plist = 0;
    if (it.quality === 5) plist = r.bits(5);
    it.props = readProps(r, T);
    for (let b = 0; b < 5; b++) if ((plist >> b) & 1) it.setProps.push(readProps(r, T));
    if (it.runeword) it.rwProps = readProps(r, T);
  }
  r.align();
  for (let i = 0; i < socketChildren && !it.simple; i++) it.children.push(readOneItem(r, version, T));
  return it;
}

function huffmanCode(r: BitReader): string {
  let s = '';
  for (let i = 0; i < 4; i++) {
    let node = HUFFMAN;
    do node = (node as unknown[])[r.bit()];
    while (Array.isArray(node));
    s += node as string;
  }
  return s.trim();
}

function readProps(r: BitReader, T: D2sTables): D2sProp[] {
  const out: D2sProp[] = [];
  for (;;) {
    const id = r.bits(9);
    if (id === 0x1ff) return out;
    const n = MULTI[id] ?? 1;
    const p: D2sProp = { id, v: [] };
    for (let k = 0; k < n; k++) {
      const row = T.stats[id + k];
      if (!row) throw new D2sFormatError(`Propriété magique inconnue (${id + k})`);
      const [, bits, add, pbits, enc, df] = row;
      if (pbits) {
        let param = r.bits(pbits);
        if (df === 14) {
          p.extra = param & 7;
          param = (param >> 3) & 0x1fff;
        } else if (enc === 2 || enc === 3) {
          p.extra = param & 0x3f;
          param = (param >> 6) & 0x3ff;
        }
        p.param = param;
      }
      if (!bits) throw new D2sFormatError(`Propriété sans taille (${id + k})`);
      const v = r.bits(bits) - add;
      if (enc === 3) {
        p.v.push(v & 0xff, (v >> 8) & 0xff);
        continue;
      }
      p.v.push(v);
    }
    out.push(p);
  }
}
