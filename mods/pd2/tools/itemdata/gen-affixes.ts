/**
 * Génère la table complète des affixes magiques / rares de Project Diablo 2 (S13) d'après la page
 * wiki « Item_Affixes » (équipement, joyaux, petits / grands / énormes charmes ; ~1 130 lignes). Chaque ligne garde
 * son identifiant de table (ligne de MagicPrefix / MagicSuffix), son groupe d'exclusion, ses niveaux (alvl min-max,
 * rlvl), sa fréquence, ses types d'objets (noms du wiki, résolus par AFFIX_TYPES dans affixes.ts) et sa rareté
 * (jaune : magique et rare ; bleu : magique seulement). Les attributs (texte anglais) sont convertis en stats du jeu ;
 * une ligne dont un attribut n'a pas d'équivalent moteur est écartée (liste en sortie). Noms français :
 * tools/itemdata/affixes-fr.json (noms officiels du string.tbl français de D2, complétés à la main pour PD2).
 *
 * Usage : npx tsx mods/pd2/tools/itemdata/gen-affixes.ts [Item_Affixes.html] [sortie.ts]
 * Sans argument, la page est téléchargée depuis wiki.projectdiablo2.com (curl).
 *
 * Depuis le lot M10a, cette table n'est plus dans le dépôt (autrefois src/data/items/affixes-pd2.ts) : la base tire les affixes de D2
 * (src/data/items/affixes-d2.ts, régénérés depuis les MPQ) et le mod les remplace par son patch, calculé par diff
 * (mods/pd2/data/items/affixes.patch.ts, mods/pd2/tools/vanilla-diff.ts). Pour reprendre une nouvelle version du wiki : générer la table
 * vers un fichier temporaire (second argument), mettre les écarts dans le patch, puis `vanilla-diff.ts --no-vanilla --ref`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const OUT = process.argv[3] ?? join(tmpdir(), 'affixes-pd2.ts');
const URL = 'https://wiki.projectdiablo2.com/wiki/Item_Affixes';

function loadHtml(): string {
  const p = process.argv[2];
  if (p && existsSync(p)) return readFileSync(p, 'utf8');
  return execFileSync('curl', ['-s', '-m', '60', URL], { encoding: 'utf8', maxBuffer: 64 << 20 });
}

const FR: Record<string, string> = JSON.parse(readFileSync(join(HERE, 'affixes-fr.json'), 'utf8'));

/* ------------------------------------------------------------------ */
/* Lecture des tableaux                                                */
/* ------------------------------------------------------------------ */

const SECTIONS = [
  'Equipment_Prefixes',
  'Equipment_Suffixes',
  'Jewel_Prefixes',
  'Jewel_Suffixes',
  'Small_Charm_Prefixes',
  'Small_Charm_Suffixes',
  'Large_Charm_Prefixes',
  'Large_Charm_Suffixes',
  'Grand_Charm_Prefixes',
  'Grand_Charm_Suffixes',
];

const unescape = (s: string): string =>
  s
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
const text = (s: string): string => unescape(s.replace(/<br\s*\/?>/g, ' | ').replace(/<[^>]+>/g, '')).trim();

interface WikiRow {
  section: string;
  kind: 'prefix' | 'suffix';
  id: number;
  name: string;
  attrs: string[];
  /** types par couleur : jaune = magique et rare, bleu = magique seulement */
  types: { rare: boolean; list: string[] }[];
  level: number;
  maxLevel?: number;
  reqLvl: number;
  freq: number;
  group: number;
}

function parse(html: string): WikiRow[] {
  const out: WikiRow[] = [];
  for (const sec of SECTIONS) {
    const start = html.indexOf(`<h3 id="${sec}"`);
    if (start < 0) throw new Error(`section absente : ${sec}`);
    const body = html.slice(start, html.indexOf('</table>', start));
    for (const tr of body.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
      const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
      if (tds.length < 8) continue;
      const types = [...tds[3].matchAll(/<span class="d2-(yellow|blue)"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => ({
        rare: m[1] === 'yellow',
        list: text(m[2])
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      }));
      const [lo, hi] = text(tds[4]).split('-').map(Number);
      out.push({
        section: sec,
        kind: sec.endsWith('Prefixes') ? 'prefix' : 'suffix',
        id: Number(text(tds[0])),
        name: text(tds[1]),
        attrs: text(tds[2])
          .split(' | ')
          .map((x) => x.replace(/,$/, '').trim())
          .filter(Boolean),
        types,
        level: lo,
        maxLevel: hi,
        reqLvl: Number(text(tds[5])),
        freq: Number(text(tds[6])),
        group: Number(text(tds[7])),
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Attributs → stats                                                   */
/* ------------------------------------------------------------------ */

interface Roll {
  stat: string;
  min: number;
  max: number;
  param?: string;
}
type Conv = Roll[] | 'skipMod' | { drop: string };

const N = String.raw`(\[\d+-\d+\]|\d+(?:\.\d+)?)`;
const range = (s: string): [number, number] => {
  const m = s.match(/^\[(\d+)-(\d+)\]$/);
  return m ? [Number(m[1]), Number(m[2])] : [Number(s), Number(s)];
};
const R = (stat: string, s: string, param?: string): Roll => {
  const [min, max] = range(s);
  return { stat, min, max, ...(param ? { param } : {}) };
};
const fixed = (stat: string, v: number, param?: string): Roll => ({ stat, min: v, max: v, ...(param ? { param } : {}) });

const ELEM: Record<string, string> = { Fire: 'Fire', Cold: 'Cold', Lightning: 'Light', Poison: 'Poison', Magic: 'Magic' };
const CLASS_STAT: Record<string, string> = {
  Amazon: 'amzSkills',
  Assassin: 'asnSkills',
  Barbarian: 'barSkills',
  Druid: 'druidSkills',
  Necromancer: 'necSkills',
  Paladin: 'palSkills',
  Sorceress: 'sorcSkills',
};
const TREE_STAT: Record<string, string> = {
  'Javelin and Spear Skills|Amazon': 'amzJavelinSkills',
  'Bow and Crossbow Skills|Amazon': 'amzBowSkills',
  'Passive and Magic Skills|Amazon': 'amzPassiveSkills',
  'Traps|Assassin': 'asnTrapSkills',
  'Shadow Disciplines|Assassin': 'asnShadowSkills',
  'Martial Arts|Assassin': 'asnMartialSkills',
  'Warcries|Barbarian': 'barWarcrySkills',
  'Combat Skills|Barbarian': 'barCombatSkills',
  'Combat Masteries|Barbarian': 'barMasterySkills',
  'Summoning|Druid': 'summonSkills',
  'Shape Shifting|Druid': 'shapeSkills',
  'Elemental|Druid': 'eleSkills',
  'Summoning Spells|Necromancer': 'necSummonSkills',
  'Poison & Bone Spells|Necromancer': 'necPoisonSkills',
  'Curses|Necromancer': 'necCurseSkills',
  'Offensive Auras|Paladin': 'palOffenseSkills',
  'Defensive Auras|Paladin': 'palDefenseSkills',
  'Combat Skills|Paladin': 'palCombatSkills',
  'Lightning Spells|Sorceress': 'lightSkills',
  'Fire Spells|Sorceress': 'fireSkills',
  'Cold Spells|Sorceress': 'coldSkills',
};
const PROC_SKILL: Record<string, string> = {
  Nova: 'nova',
  'Charged Bolt': 'charged_bolt',
  'Frost Nova': 'frost_nova',
  Fireball: 'fire_ball',
  Lightning: 'lightning',
  'Chain Lightning': 'chain_lightning',
  'Ice Barrage': 'ice_barrage',
  'Amplify Damage': 'amplify_damage',
  'Lower Resist': 'lower_resist',
  Hydra: 'hydra',
  Firebolt: 'fire_bolt',
};
const PROC_KIND: Record<string, string> = { 'on Striking': 'procHit', 'when Struck': 'procGetHit', 'on Casting': 'procCast' };
const SPEED: Record<string, string> = { 'Run/Walk': 'frw', 'Cast Rate': 'fcr', 'Hit Recovery': 'fhr', 'Block Rate': 'fbr' };

const RULES: [RegExp, (m: RegExpMatchArray) => Conv][] = [
  // bonus par niveau du personnage (valeur par niveau, non tirée)
  [new RegExp(String.raw`^\+${N} to Life \(\+([\d.]+) per Level\)$`), (m) => [fixed('lifePerLvl', Number(m[2]))]],
  [new RegExp(String.raw`^\+${N} to Mana \(\+([\d.]+) per Level\)$`), (m) => [fixed('manaPerLvl', Number(m[2]))]],
  [new RegExp(String.raw`^\+${N} Defense \(\+([\d.]+) per Level\)$`), (m) => [fixed('defPerLvl', Number(m[2]))]],
  [new RegExp(String.raw`^\+${N} to Maximum Damage \(\+([\d.]+) per Level\)$`), (m) => [fixed('maxDmgPerLvl', Number(m[2]))]],
  [new RegExp(String.raw`^\+${N} to Attack Rating \(\+([\d.]+) per Level\)$`), (m) => [fixed('attackRatingPerLvl', Number(m[2]))]],
  [new RegExp(String.raw`^${N}% Bonus to Attack Rating \(([\d.]+)% per Level\)$`), (m) => [fixed('arPctPerLvl', Number(m[2]))]],
  // vie, mana, caractéristiques
  [new RegExp(String.raw`^\+${N} to Life$`), (m) => [R('life', m[1])]],
  [new RegExp(String.raw`^\+${N} to Mana$`), (m) => [R('mana', m[1])]],
  [new RegExp(String.raw`^\+${N} to (Strength|Dexterity|Energy|Vitality)$`), (m) => [R({ Strength: 'str', Dexterity: 'dex', Energy: 'ene', Vitality: 'vit' }[m[2]]!, m[1])]],
  [new RegExp(String.raw`^Replenish Life \+${N}$`), (m) => [R('lifeRegen', m[1])]],
  [new RegExp(String.raw`^Regenerate Mana ${N}%$`), (m) => [R('manaRegenPct', m[1])]],
  [new RegExp(String.raw`^\+${N} (?:to )?Life after each Kill$`), (m) => [R('lifePerKill', m[1])]],
  [new RegExp(String.raw`^\+${N} to Mana after each Kill$`), (m) => [R('manaPerKill', m[1])]],
  [new RegExp(String.raw`^${N}% (Life|Mana) Stolen per Hit$`), (m) => [R(m[2] === 'Life' ? 'lifeLeech' : 'manaLeech', m[1])]],
  [new RegExp(String.raw`^${N}% Damage Taken Gained as Mana when Hit$`), (m) => [R('dmgToMana', m[1])]],
  // dégâts d'arme
  [new RegExp(String.raw`^\+${N}% Enhanced Damage$`), (m) => [R('edPct', m[1])]],
  [new RegExp(String.raw`^\+${N} (?:to )?Minimum Damage$`), (m) => [R('minDmg', m[1])]],
  [new RegExp(String.raw`^\+${N} (?:to )?Maximum Damage$`), (m) => [R('maxDmg', m[1])]],
  [new RegExp(String.raw`^Adds ${N} to ${N} (Fire|Cold|Lightning) Damage(?: \(.*chill\))?$`), (m) => [R(`add${ELEM[m[3]]}Min`, m[1]), R(`add${ELEM[m[3]]}Max`, m[2])]],
  [new RegExp(String.raw`^\+${N} (Fire|Cold|Lightning) Damage$`), (m) => [fixed(`add${ELEM[m[2]]}Min`, range(m[1])[0]), R(`add${ELEM[m[2]]}Max`, m[1])]],
  [new RegExp(String.raw`^\+${N} Poison Damage over ${N} seconds$`), (m) => [R('poisonDmg', m[1])]],
  [new RegExp(String.raw`^\+${N} to Attack Rating$`), (m) => [R('attackRating', m[1])]],
  [new RegExp(String.raw`^\+${N} to Attack Rating against (Demons|Undead)$`), (m) => [R(m[2] === 'Demons' ? 'arDemon' : 'arUndead', m[1])]],
  [new RegExp(String.raw`^\+${N}% Damage to (Demons|Undead)$`), (m) => [R(m[2] === 'Demons' ? 'dmgDemonPct' : 'dmgUndeadPct', m[1])]],
  [new RegExp(String.raw`^${N}% Chance of Open Wounds$`), (m) => [R('openWounds', m[1])]],
  [new RegExp(String.raw`^\+${N} Open Wounds Damage per Second$`), (m) => [R('openWoundsDps', m[1])]],
  [new RegExp(String.raw`^${N}% Deadly Strike$`), (m) => [R('deadlyStrike', m[1])]],
  [new RegExp(String.raw`^${N}% Crushing Blow$`), (m) => [R('crushingBlow', m[1])]],
  [new RegExp(String.raw`^\+${N}% Increased Attack Speed$`), (m) => [R('ias', m[1])]],
  [new RegExp(String.raw`^\+?${N}% Faster (Run/Walk|Cast Rate|Hit Recovery|Block Rate)$`), (m) => [R(SPEED[m[2]], m[1])]],
  [new RegExp(String.raw`^\+${N}% Chance to Pierce$`), (m) => [R('pierceChance', m[1])]],
  [/^Knockback$/, () => [fixed('knockback', 1)]],
  [/^Ignore Target's Defense$/, () => [fixed('ignoreDef', 1)]],
  [
    new RegExp(String.raw`^${N}% Chance to Cast Level (\d+) (.+?) (on Striking|when Struck|on Casting)$`),
    (m) => {
      const sk = PROC_SKILL[m[3]];
      return sk ? [R(PROC_KIND[m[4]], m[1], `${sk}:${m[2]}`)] : { drop: `déclencheur inconnu ${m[3]}` };
    },
  ],
  // défense
  [new RegExp(String.raw`^\+${N}% Enhanced Defense$`), (m) => [R('defPct', m[1])]],
  [new RegExp(String.raw`^\+${N} Defense$`), (m) => [R('defFlat', m[1])]],
  [new RegExp(String.raw`^${N}% Increased Chance of Blocking$`), (m) => [R('block', m[1])]],
  [new RegExp(String.raw`^Physical Damage Taken Reduced by ${N}%$`), (m) => [R('dr', m[1])]],
  [new RegExp(String.raw`^Physical Damage Taken Reduced by ${N}$`), (m) => [R('drFlat', m[1])]],
  [new RegExp(String.raw`^Magic Damage Taken Reduced by ${N}$`), (m) => [R('mdr', m[1])]],
  [new RegExp(String.raw`^Attacker Takes Damage of ${N}$`), (m) => [R('thornsFlat', m[1])]],
  [new RegExp(String.raw`^All Resistances \+${N}%?$`), (m) => [R('resAll', m[1])]],
  [new RegExp(String.raw`^(Fire|Cold|Lightning|Poison) Resist \+${N}%$`), (m) => [R(`res${ELEM[m[1]]}`, m[2])]],
  [new RegExp(String.raw`^Poison Length Reduced by ${N}%$`), (m) => [R('poisonLength', m[1])]],
  [/^Half Freeze Duration$/, () => [fixed('halfFreeze', 1)]],
  // compétences et sorts
  [new RegExp(String.raw`^\+${N} to (\w+) Skill(?: Level)?s$`), (m) => (CLASS_STAT[m[2]] ? [R(CLASS_STAT[m[2]], m[1])] : { drop: `classe ${m[2]}` })],
  [
    new RegExp(String.raw`^\+${N} to (.+) \((\w+) Only\)$`),
    (m) => {
      const s = TREE_STAT[`${m[2]}|${m[3]}`];
      return s ? [R(s, m[1])] : { drop: `arbre ${m[2]} (${m[3]})` };
    },
  ],
  [new RegExp(String.raw`^\+${N}% to (Fire|Cold|Lightning|Poison|Magic) Skill Damage$`), (m) => [R(`${ELEM[m[2]].toLowerCase()}DmgPct`, m[1])]],
  [new RegExp(String.raw`^-${N} to Enemy (Fire|Cold|Lightning|Poison) Resistance$`), (m) => [R(`pierce${ELEM[m[2]]}`, m[1])]],
  // butin, divers
  [new RegExp(String.raw`^${N}% Better Chance of Getting Magic Items$`), (m) => [R('mf', m[1])]],
  [new RegExp(String.raw`^${N}% Extra Gold from Monsters$`), (m) => [R('gf', m[1])]],
  [new RegExp(String.raw`^\+${N} to Light Radius$`), (m) => [R('lightRadius', m[1])]],
  [new RegExp(String.raw`^Socketed \(${N}\)$`), (m) => [R('socketsAdded', m[1])]],
  [new RegExp(String.raw`^Requirements -${N}%$`), (m) => [R('reqPct', m[1])]],
  [/^Indestructible$/, () => [fixed('indestructible', 1)]],
  // sans équivalent moteur : endurance (pas de jauge d'endurance), réparation automatique, charges, soin des monstres
  [/Slower Stamina Drain$/, () => 'skipMod'],
  [/^Heal Stamina/, () => ({ drop: 'endurance (absente du jeu)' })],
  [/^Repairs \d+ Durability/, () => ({ drop: 'réparation automatique (non simulée)' })],
  [/charges\)$/, () => ({ drop: 'charges de compétence (non simulées)' })],
  [/^Prevent Monster Heal$/, () => ({ drop: 'les monstres ne se soignent pas' })],
];

function convert(attr: string): Conv {
  for (const [re, f] of RULES) {
    const m = attr.match(re);
    if (m) return f(m);
  }
  return { drop: `attribut inconnu « ${attr} »` };
}

/* ------------------------------------------------------------------ */
/* Types d'objets                                                      */
/* ------------------------------------------------------------------ */

/** Types du wiki connus de AFFIX_TYPES (affixes.ts) (carquois compris) */
const KNOWN_TYPES = new Set([
  'Armor',
  'Chest',
  'Helm',
  'HelmNC',
  'Circlet',
  'Druid Helm',
  'Barbarian Helm',
  'Non-Druid Helm',
  'Non-Barbarian Helm',
  'Shield',
  'ShieldNC',
  'Necromancer Shield',
  'Paladin Shield',
  'Non-Necromancer Shield',
  'Non-Paladin Shield',
  'Gloves',
  'Boots',
  'Belt',
  'Non-Gloves Armor',
  'Amulet',
  'Ring',
  'Jewel',
  'Small Charm',
  'Large Charm',
  'Grand Charm',
  'Weapon',
  'WeaponP',
  'WeaponPS',
  'Melee Weapon',
  'Melee WeaponP',
  'Non-Throwing Melee WeaponPS',
  'Non-Scepter Melee WeaponP',
  'Missile Weapon',
  'Non-Orb Weapon',
  'Non-Scepter WeaponP',
  'Non-Scepter Weapon',
  'Non-Rod Weapon',
  'Non-Throwing Weapon',
  'Non-Blunt Melee Weapon',
  'Orb',
  'Staff',
  'Wand',
  'Scepter',
  'Rod',
  'Non-Staff Rod',
  'Club',
  'Hammer',
  'Tipped Mace',
  'Claw',
  'Sword',
  'Crystal Sword',
  'Dagger',
  'Knife',
  'Throwing Knife',
  'Throwing Axe',
  'Axe',
  'Polearm',
  'Scythe',
  'Spear',
  'SpearNC',
  'Amazon Spear',
  'Javelin',
  'JavelinNC',
  'Amazon Weapon',
  'Quiver',
]);
const IGNORED_TYPES = new Set<string>();

/* ------------------------------------------------------------------ */
/* Assemblage                                                          */
/* ------------------------------------------------------------------ */

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

interface Out {
  id: string;
  name: string;
  kind: 'prefix' | 'suffix';
  group: number;
  level: number;
  maxLevel?: number;
  reqLvl: number;
  freq: number;
  types: string[];
  rareTypes: string[];
  mods: Roll[];
  wiki: number;
}

const rows = parse(loadHtml());
const drops = new Map<string, number>();
const unknownTypes = new Set<string>();
const byKey = new Map<string, Out>();
for (const r of rows) {
  const mods: Roll[] = [];
  let drop: string | null = null;
  for (const a of r.attrs) {
    const c = convert(a);
    if (c === 'skipMod') continue;
    if (Array.isArray(c)) mods.push(...c);
    else drop ??= c.drop;
  }
  if (!drop && !mods.length) drop = 'aucun attribut';
  if (!drop && !(r.freq > 0)) drop = 'fréquence nulle';
  if (!drop && r.level > 99) drop = 'alvl > 99 (jamais tiré)';
  const types: string[] = [];
  const rareTypes: string[] = [];
  for (const t of r.types)
    for (const x of t.list) {
      if (IGNORED_TYPES.has(x)) continue;
      if (!KNOWN_TYPES.has(x)) {
        unknownTypes.add(x);
        continue;
      }
      types.push(x);
      if (t.rare) rareTypes.push(x);
    }
  if (!drop && !types.length) drop = 'aucun type connu';
  if (drop) {
    drops.set(drop, (drops.get(drop) ?? 0) + 1);
    continue;
  }
  const key = `${r.kind}:${r.id}`;
  const prev = byKey.get(key);
  if (prev) {
    // même ligne de table listée dans plusieurs sections (équipement + joyaux…) : types réunis
    if (JSON.stringify(prev.mods) !== JSON.stringify(mods)) console.warn(`ligne ${key} : attributs différents selon la section`);
    for (const t of types) if (!prev.types.includes(t)) prev.types.push(t);
    for (const t of rareTypes) if (!prev.rareTypes.includes(t)) prev.rareTypes.push(t);
    continue;
  }
  const fr = FR[`${r.kind === 'prefix' ? 'P' : 'S'}:${r.name}`];
  if (!fr) throw new Error(`nom français manquant : ${r.name}`);
  byKey.set(key, {
    id: `${slug(r.name)}_${r.kind[0]}${r.id}`,
    name: fr,
    kind: r.kind,
    group: r.group,
    level: Math.max(1, r.level),
    maxLevel: r.maxLevel,
    reqLvl: Math.max(1, Math.min(r.reqLvl, Math.max(1, r.level))),
    freq: r.freq,
    types,
    rareTypes,
    mods,
    wiki: r.id,
  });
}

const q = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const lines: string[] = [];
for (const a of byKey.values()) {
  const rare = a.rareTypes.length === 0 ? 0 : a.rareTypes.length === a.types.length ? 1 : q(a.rareTypes.join('|'));
  const mods = a.mods.map((m) => `r(${q(m.stat)}, ${m.min}, ${m.max}${m.param ? `, ${q(m.param)}` : ''})`).join(', ');
  lines.push(`  A(${q(a.id)}, ${q(a.name)}, '${a.kind[0]}', ${a.group}, ${a.level}, ${a.maxLevel ?? 0}, ${a.reqLvl}, ${a.freq}, ${rare}, ${q(a.types.join('|'))}, [${mods}]),`);
}

const src = `/**
 * Affixes magiques / rares de Project Diablo 2 (S13) : équipement, joyaux, charmes par taille.
 * Généré par tools/itemdata/gen-affixes.ts d'après la page wiki Item_Affixes : ne pas modifier à la main.
 * A(id, nom, p|s, groupe, alvl min, alvl max (0 : aucun), rlvl, fréquence, rare (1 : oui, 0 : magique seulement,
 *   'Type|…' : rare sur ces types seulement), types (noms du wiki, cf. AFFIX_TYPES), stats)
 */
import type { AffixDef, StatRoll } from '../types';

const r = (stat: string, min: number, max: number, param?: string): StatRoll => (param ? { stat, min, max, param } : { stat, min, max });
function A(id: string, name: string, k: 'p' | 's', group: number, level: number, maxLevel: number, reqLvl: number, freq: number, rare: 0 | 1 | string, types: string, mods: StatRoll[]): AffixDef {
  const a: AffixDef = { id, name, kind: k === 'p' ? 'prefix' : 'suffix', group: \`g\${group}\`, level, reqLvl, freq, types: types.split('|'), mods, rare: rare !== 0 };
  if (maxLevel) a.maxLevel = maxLevel;
  if (typeof rare === 'string') a.rareTypes = rare.split('|');
  return a;
}

export const PD2_AFFIXES: AffixDef[] = [
${lines.join('\n')}
];
`;
writeFileSync(OUT, src);

// paires français → anglais officiel des noms (à fusionner dans src/i18n/en.json) : suffixes « of … »
// (seulement les noms encore absents du dictionnaire : les noms déjà traduits gardent leur entrée)
const known: Record<string, string> = JSON.parse(readFileSync(join(ROOT, 'src/i18n/en.json'), 'utf8'));
const en: Record<string, string> = {};
for (const r of rows) {
  const fr = FR[`${r.kind === 'prefix' ? 'P' : 'S'}:${r.name}`];
  if (fr && !(fr in en) && !(fr in known)) en[fr] = r.kind === 'suffix' ? `of ${r.name}` : r.name;
}
writeFileSync(join(HERE, 'affixes-en.json'), `${JSON.stringify(Object.fromEntries(Object.entries(en).sort()), null, 1)}\n`);
console.log(
  `lignes du wiki ${rows.length}, affixes générés ${byKey.size} (préfixes ${[...byKey.values()].filter((a) => a.kind === 'prefix').length}, suffixes ${[...byKey.values()].filter((a) => a.kind === 'suffix').length})`,
);
for (const [k, v] of drops) console.log(`  écartées : ${v} × ${k}`);
if (unknownTypes.size) console.log(`  types inconnus : ${[...unknownTypes].join(', ')}`);
