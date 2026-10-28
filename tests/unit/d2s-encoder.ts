/**
 * Encodeur de .d2s pour les tests : fabrique un personnage 1.13 synthétique (en-tête, attributs, compétences, objets) en suivant la structure
 * documentée du format. Sert de référence inverse au lecteur de src/sim/d2s/parse.ts.
 */
import { D2S_SKILL_BASE, type D2sItem, type D2sProp } from '../../src/sim/d2s/parse';
import { D2S_TABLES } from '../../src/sim/d2s/tables';

const T = D2S_TABLES;

export class BitWriter {
  bytes: number[] = [];
  pos = 0;
  bits(v: number, n: number): this {
    for (let i = 0; i < n; i++) {
      const bit = Math.floor(v / 2 ** i) % 2;
      if ((this.pos & 7) === 0) this.bytes.push(0);
      if (bit) this.bytes[this.pos >> 3] |= 1 << (this.pos & 7);
      this.pos++;
    }
    return this;
  }
  align(): this {
    this.pos = (this.pos + 7) & ~7;
    return this;
  }
  str(s: string, n = s.length): this {
    for (let i = 0; i < n; i++) this.bits(i < s.length ? s.charCodeAt(i) : 0, 8);
    return this;
  }
  raw(a: ArrayLike<number>): this {
    for (let i = 0; i < a.length; i++) this.bits(a[i], 8);
    return this;
  }
}

export function newItem(code: string, o: Partial<D2sItem> = {}): D2sItem {
  return {
    code,
    simple: false,
    identified: true,
    socketed: false,
    ethereal: false,
    isEar: false,
    runeword: false,
    personalized: false,
    location: 0,
    equipped: 0,
    x: 0,
    y: 0,
    page: 1,
    ilvl: 50,
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
    ...o,
  };
}

const MULTI: Record<number, number> = { 17: 2, 48: 2, 50: 2, 52: 2, 54: 3, 57: 3 };

function writeProps(w: BitWriter, props: D2sProp[]): void {
  for (const p of props) {
    w.bits(p.id, 9);
    const n = MULTI[p.id] ?? 1;
    let vi = 0;
    for (let k = 0; k < n; k++) {
      const [, bits, add, pbits, enc, df] = T.stats[p.id + k];
      if (pbits) {
        let param = p.param ?? 0;
        if (df === 14) param = ((param & 0x1fff) << 3) | ((p.extra ?? 0) & 7);
        else if (enc === 2 || enc === 3) param = ((param & 0x3ff) << 6) | ((p.extra ?? 0) & 0x3f);
        w.bits(param, pbits);
      }
      let v = p.v[vi++] + add;
      if (enc === 3) v = (p.v[vi - 1] & 0xff) | ((p.v[vi++] & 0xff) << 8);
      w.bits(v, bits);
    }
  }
  w.bits(0x1ff, 9);
}

export function writeItem(w: BitWriter, it: D2sItem): void {
  const row = T.items[it.code];
  if (!row) throw new Error(`code ${it.code}`);
  const [kind, , , fl] = row;
  w.str('JM');
  let flags = 0;
  const set = (b: number, on: boolean) => (flags += on ? 2 ** b : 0);
  set(4, it.identified);
  set(11, it.socketed);
  set(21, it.simple);
  set(22, it.ethereal);
  set(23, true);
  set(26, it.runeword);
  w.bits(flags, 32).bits(101, 10).bits(it.location, 3).bits(it.equipped, 4).bits(it.x, 4).bits(it.y, 4).bits(it.page, 3);
  w.str(it.code, 3).bits(0x20, 8);
  if (fl & 2) w.bits(0, 2);
  w.bits(it.children.length, it.simple || fl & 2 ? 1 : 3);
  if (!it.simple) {
    w.bits(0x12345678, 32).bits(it.ilvl, 7).bits(it.quality, 4).bits(0, 1).bits(0, 1);
    switch (it.quality) {
      case 1:
      case 3:
        w.bits(0, 3);
        break;
      case 4:
        w.bits(it.magicPrefix, 11).bits(it.magicSuffix, 11);
        break;
      case 5:
        w.bits(it.setId, 12);
        break;
      case 7:
        w.bits(it.uniqueId, 12);
        break;
      case 6:
      case 8:
        w.bits(it.rareName1, 8).bits(it.rareName2, 8);
        for (let i = 0; i < 6; i++) {
          if (it.rareAffixes[i]) w.bits(1, 1).bits(it.rareAffixes[i], 11);
          else w.bits(0, 1);
        }
        break;
    }
    if (it.runeword) w.bits(it.runewordId, 12).bits(5, 4);
    if (fl & 4) w.bits(0, 5);
    w.bits(0, 1);
    if (kind === 'a') w.bits((it.defense ?? 0) + T.stats[31][2], T.stats[31][1]);
    if (kind === 'a' || kind === 'w') {
      w.bits((it.maxDur ?? 0) + T.stats[73][2], T.stats[73][1]);
      if (it.maxDur) w.bits((it.dur ?? 0) + T.stats[72][2], T.stats[72][1]);
    }
    if (fl & 1) w.bits(it.quantity ?? 1, 9);
    if (it.socketed) w.bits(it.sockets, 4);
    let plist = 0;
    if (it.quality === 5) {
      it.setProps.forEach((_, i) => (plist |= 1 << i));
      w.bits(plist, 5);
    }
    writeProps(w, it.props);
    for (const sp of it.setProps) writeProps(w, sp);
    if (it.runeword) writeProps(w, it.rwProps);
  }
  w.align();
  if (!it.simple) for (const c of it.children) writeItem(w, c);
}

export interface FakeChar {
  name: string;
  classIndex: number;
  level: number;
  expansion?: boolean;
  difficulty?: number;
  baalNormal?: boolean;
  baalNightmare?: boolean;
  attrs: { str: number; ene: number; dex: number; vit: number; statPoints: number; skillPoints: number; xp: number; gold: number; stashGold: number; hp: number; mana: number };
  skills: Record<number, number>;
  items: D2sItem[];
  merc?: { type: number; items: D2sItem[] };
}

export function encodeD2s(c: FakeChar): Uint8Array {
  const w = new BitWriter();
  w.bits(0xaa55aa55, 32).bits(0x60, 32).bits(0, 32).bits(0, 32);
  w.bits(0, 32); // arme active
  w.str(c.name, 16);
  w.bits(0x20 | (c.expansion === false ? 0 : 0), 8)
    .bits(0, 8)
    .bits(0, 16);
  w.bits(c.classIndex, 8).bits(0x10, 8).bits(0x1e, 8).bits(c.level, 8);
  w.bits(0, 32).bits(0, 32).bits(0xffffffff, 32);
  w.raw(new Uint8Array(64)).bits(0, 32).bits(0, 32).bits(0, 32).bits(0, 32).raw(new Uint8Array(32)); // compétences assignées, apparence
  const diff = [0, 0, 0];
  diff[c.difficulty ?? 0] = 0x80;
  w.raw(diff).bits(0, 32).bits(0, 16);
  w.bits(0, 16)
    .bits(c.merc ? 0x1234 : 0, 32)
    .bits(0, 16)
    .bits(c.merc?.type ?? 0, 16)
    .bits(0, 32);
  w.raw(new Uint8Array(144));
  w.str('Woo!').bits(6, 32).bits(0x12a, 16);
  const quests = new Uint8Array(96 * 3);
  if (c.baalNormal) quests[0x50] = 1;
  if (c.baalNightmare) quests[96 + 0x50] = 1;
  w.raw(quests);
  w.str('WS').bits(1, 32).bits(0x50, 16).raw(new Uint8Array(0x48));
  w.bits(0x77 * 256 + 1, 16)
    .bits(0x34, 16)
    .raw(new Uint8Array(0x30));
  w.str('gf');
  const a = c.attrs;
  const attr: [number, number, number][] = [
    [0, a.str, 10],
    [1, a.ene, 10],
    [2, a.dex, 10],
    [3, a.vit, 10],
    [4, a.statPoints, 10],
    [5, a.skillPoints, 8],
    [7, a.hp * 256, 21],
    [9, a.mana * 256, 21],
    [12, c.level, 7],
    [13, a.xp, 32],
    [14, a.gold, 25],
    [15, a.stashGold, 25],
  ];
  for (const [id, v, n] of attr) w.bits(id, 9).bits(v, n);
  w.bits(0x1ff, 9).align();
  w.str('if');
  const base = D2S_SKILL_BASE[c.classIndex];
  for (let i = 0; i < 30; i++) w.bits(c.skills[base + i] ?? 0, 8);
  w.str('JM').bits(c.items.length, 16);
  for (const it of c.items) writeItem(w, it);
  w.str('JM').bits(0, 16);
  w.str('jf');
  if (c.merc) {
    w.str('JM').bits(c.merc.items.length, 16);
    for (const it of c.merc.items) writeItem(w, it);
  }
  w.str('kf').bits(0, 8);
  const out = Uint8Array.from(w.bytes);
  new DataView(out.buffer).setUint32(8, out.length, true);
  return out;
}
