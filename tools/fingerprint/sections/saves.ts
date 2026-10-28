/**
 * Sauvegardes : chargement et réécriture (chemin de l'application : `deserialize` → `new Game(save)` → `toSave`) de 300 personnages
 * pseudo-aléatoires ; mêmes sauvegardes estampillées des versions 1 à 6 (les migrations) ; sauvegardes INVALIDES (base d'objet
 * inconnue dans le sac, le coffre, l'équipement, une châsse, chez le mercenaire, au sol) ; coffre partagé ; conversion .d2s de 3 000
 * personnages Diablo II pseudo-aléatoires (et des vrais fichiers listés dans `FP_D2S`, séparés par « : »).
 *
 * Le format (numéro de version, étiquette de ruleset) est mis à part dans la clé `format` : il change quand le format change (voulu) ;
 * le contenu, lui, doit rester identique.
 */
import { existsSync, readFileSync } from 'node:fs';
import '../../../src/sim/game';
import { Game } from '../../../src/sim/game';
import { Rng } from '../../../src/core/rng';
import { deserialize, serialize, withDefaultSettings, SAVE_VERSION, DEFAULT_RULESET, type SaveData } from '../../../src/sim/save';
import { computeDerived } from '../../../src/sim/character';
import { generateItem } from '../../../src/sim/loot/itemgen';
import { convertD2s, importD2s, reportLines, type ImportResult } from '../../../src/sim/d2s/convert';
import { D2S_TABLES } from '../../../src/sim/d2s/tables';
import type { D2sCharacter, D2sItem, D2sProp } from '../../../src/sim/d2s/parse';
import type { Item } from '../../../src/sim/item';
import { fingerprintCharacter } from '../chargen';
import { json, ser, sha1, type SectionResult } from '../lib';

/** Champs de format écartés du contenu (versions, étiquette de ruleset) ; renvoyés à part */
const FORMAT_KEYS = ['version', 'ruleset'];
const formats = new Set<string>();
function body(s: SaveData): string {
  const o = { ...(s as unknown as Record<string, unknown>) };
  formats.add(json(FORMAT_KEYS.map((k) => o[k])));
  for (const k of FORMAT_KEYS) delete o[k];
  return json(o);
}

/** Sauvegarde à la façon de l'application : texte → migration → partie → sauvegarde ; caractéristiques dérivées comprises */
function load(text: string): string {
  // compteur d'identifiants remis à zéro à chaque cas : un cas ajouté ou changé ne décale pas les suivants
  Game.resetIds();
  try {
    const s = deserialize(text);
    const g = new Game(s, s.character.classId);
    return sha1(body(g.toSave()) + '|' + ser(computeDerived(g.character, 1), 6));
  } catch (e) {
    return 'ERR ' + (e as Error).message;
  }
}

function saveOf(i: number): SaveData {
  Game.resetIds();
  return {
    version: SAVE_VERSION,
    character: fingerprintCharacter(`save${i}`),
    settings: withDefaultSettings(),
    ruleset: DEFAULT_RULESET,
    run: null,
    runCounter: i,
    craftSeq: i * 3,
    town: 'act2',
    savedAt: 5,
  };
}

/** Versions estampillées (liste fixe : les clés ne changent pas quand SAVE_VERSION augmente ; une version courante se charge sans migration) */
const OLD_VERSIONS = [1, 2, 3, 4, 5, 6];

const BAD = 'zzz_base_inconnue';
const badItem = (rng: Rng): Item => ({ ...generateItem(rng, 'cap', 20, { forceQuality: 'magic' }), base: BAD });

const T = D2S_TABLES;
const rng = new Rng('d2sfp');
const pick = <X>(a: X[]): X => a[rng.range(0, a.length - 1)];
const codes = Object.keys(T.items);
const subCodes = codes.filter((k) => /^(r\d\d|g[a-z][a-z]|s[a-z][a-z]|jew|sk[a-z])$/.test(k) || ['jew'].includes(k));
const statIds = Object.keys(T.stats).map(Number);
const rwIds = Object.keys(T.runewords).map(Number);
const CLASSES = ['amazon', 'sorceress', 'necromancer', 'paladin', 'barbarian', 'druid', 'assassin'] as const;

function props(n: number): D2sProp[] {
  const out: D2sProp[] = [];
  for (let i = 0; i < n; i++)
    out.push({
      id: pick(statIds),
      param: rng.chance(0.3) ? rng.range(0, 300) : undefined,
      extra: rng.chance(0.1) ? rng.range(1, 20) : undefined,
      v: [rng.range(-20, 400), rng.range(0, 400), rng.range(0, 50)].slice(0, rng.range(1, 3)),
    });
  return out;
}
function item(depth = 0): D2sItem {
  const quality = rng.range(1, 8);
  const simple = rng.chance(0.15);
  const loc = pick([0, 0, 0, 1, 1, 2]);
  const children: D2sItem[] = [];
  const sockets = rng.chance(0.3) ? rng.range(1, 6) : 0;
  if (depth === 0 && sockets) for (let i = 0; i < rng.range(0, sockets + 1); i++) children.push(rng.chance(0.85) && subCodes.length ? { ...item(1), code: pick(subCodes) } : item(1));
  const maxDur = rng.chance(0.5) ? rng.range(10, 250) : undefined;
  return {
    code: rng.chance(0.03) ? 'zzz' : pick(codes),
    simple,
    identified: rng.chance(0.9),
    socketed: sockets > 0,
    ethereal: rng.chance(0.1),
    isEar: rng.chance(0.01),
    runeword: rng.chance(0.08),
    personalized: false,
    location: loc,
    equipped: loc === 1 ? rng.range(1, 12) : 0,
    x: rng.range(0, 11),
    y: rng.range(0, 11),
    page: pick([0, 1, 1, 4, 5, 5]),
    ilvl: rng.range(0, 110),
    quality,
    magicPrefix: rng.range(0, T.prefixes.length + 3),
    magicSuffix: rng.range(0, T.suffixes.length + 3),
    setId: rng.range(0, T.sets.length + 3),
    uniqueId: rng.range(0, T.uniques.length + 3),
    rareName1: rng.range(0, 200),
    rareName2: rng.range(0, 200),
    rareAffixes: [],
    runewordId: rng.chance(0.9) ? pick(rwIds) : rng.range(0, 3000),
    defense: rng.chance(0.6) ? rng.range(0, 900) : undefined,
    maxDur,
    dur: maxDur !== undefined ? rng.range(0, maxDur + 5) : undefined,
    quantity: rng.chance(0.1) ? rng.range(1, 500) : undefined,
    sockets,
    props: props(rng.range(0, 8)),
    setProps: [],
    rwProps: props(rng.range(0, 5)),
    children,
  };
}
function char(i: number): D2sCharacter {
  const level = rng.range(-2, 105);
  return {
    version: 0x60,
    name: `Fuzz${i}${rng.chance(0.05) ? '' : ''}`,
    classId: pick([...CLASSES]),
    level,
    hardcore: false,
    died: false,
    expansion: true,
    ladder: false,
    progression: rng.range(0, 15),
    difficulty: rng.range(-1, 2),
    baalDone: [rng.chance(0.5), rng.chance(0.3), rng.chance(0.1)],
    activeWeaponSet: rng.range(0, 1),
    merc: rng.chance(0.6) ? { dead: rng.chance(0.2), id: rng.range(0, 1e6), nameId: rng.range(0, 60), type: rng.range(0, 35), exp: 0 } : null,
    attrs: {
      strength: rng.range(10, 300),
      energy: rng.range(10, 300),
      dexterity: rng.range(10, 300),
      vitality: rng.range(10, 300),
      statPoints: rng.range(0, 50),
      skillPoints: rng.range(0, 20),
      hp: 100,
      mana: 100,
      stamina: 100,
      level,
      experience: rng.chance(0.5) ? rng.range(0, 3_000_000_000) : rng.range(0, 1000),
      gold: rng.range(0, 999999),
      stashGold: rng.range(0, 2_000_000),
    },
    skills: Array.from({ length: 30 }, () => (rng.chance(0.4) ? rng.range(0, 20) : 0)),
    items: Array.from({ length: rng.range(0, 60) }, () => item()),
    corpseItems: rng.chance(0.1) ? [item()] : [],
    mercItems: Array.from({ length: rng.range(0, 5) }, () => {
      const it = item();
      it.equipped = pick([1, 3, 4, 5, 2]);
      return it;
    }),
    golem: rng.chance(0.05) ? item() : null,
    truncated: rng.chance(0.05),
  };
}

export async function run(): Promise<SectionResult> {
  const out: SectionResult = {};
  for (let i = 0; i < 300; i++) {
    const s = saveOf(i);
    out[`load/${i}`] = load(serialize(s));
    if (i < 60) for (const v of OLD_VERSIONS) out[`v${v}/${i}`] = load(serialize({ ...s, version: v }));
  }
  // sauvegardes invalides : un objet de base inconnue à chaque endroit où un objet peut se trouver
  const r = new Rng('bad');
  const places: [string, (s: SaveData) => void][] = [
    ['inventory', (s) => (s.character.inventory[s.character.inventory.findIndex((x) => !x)] = badItem(r))],
    ['stash', (s) => (s.character.stash[1][79] = badItem(r))],
    ['equipment', (s) => (s.character.equipment.head = badItem(r))],
    ['charm', (s) => (s.character.charmInv[39] = badItem(r))],
    ['cube', (s) => (s.character.cube[0] = badItem(r))],
    ['socket', (s) => (s.character.equipment.body = { ...generateItem(r, 'quilted_armor', 30, { forceQuality: 'normal' }), sockets: 1, socketed: [badItem(r)] })],
    ['merc', (s) => (s.character.merc = { type: 'rogue', variant: 'fire', name: 'Aliza', dead: false, equipment: { head: badItem(r) } })],
    ['mapStash', (s) => (s.character.mapStash = [badItem(r)])],
  ];
  for (const [where, put] of places)
    for (let i = 0; i < 5; i++) {
      const s = saveOf(1000 + i);
      put(s);
      out[`invalid/${where}/${i}`] = load(serialize(s));
    }
  // coffre partagé : attaché, puis relu tel que l'application l'enregistre
  for (let i = 0; i < 20; i++) {
    Game.resetIds();
    const g = new Game(deserialize(serialize(saveOf(2000 + i))), 'sorceress');
    const tabs = Array.from({ length: 12 }, (_, k) => fingerprintCharacter(`shared${i}/${k}`).stash[0]);
    g.attachShared({ version: 1, tabs });
    out[`shared/${i}`] = sha1(json(g.sharedStash()) + '|' + body(g.toSave()));
  }
  // conversion .d2s
  const fp = (x: ImportResult) => sha1(body(x.save) + json({ ...x, save: undefined }) + json(reportLines(x.report)));
  for (let i = 0; i < 3000; i++) {
    const d = char(i);
    Game.resetIds();
    try {
      out[`d2s/fuzz${i}`] = fp(convertD2s(d, { savedAt: 5 }));
    } catch (e) {
      out[`d2s/fuzz${i}`] = 'ERR ' + (e as Error).message;
    }
  }
  for (const f of (process.env.FP_D2S ?? '').split(':').filter(Boolean)) if (existsSync(f)) out[`d2s/file/${f.split('/').pop()}`] = fp(importD2s(new Uint8Array(readFileSync(f))));
  out.format = sha1([...formats].sort().join('\n'));
  out['format#values'] = [...formats].sort().join(' ');
  return out;
}
