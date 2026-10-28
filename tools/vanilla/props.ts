/**
 * Propriétés des tables d'objets de Diablo II (`prop`/`par`/`min`/`max` de UniqueItems.txt, SetItems.txt, Sets.txt ; `*ModCode` de
 * Gems.txt) converties en statistiques du jeu (`StatRoll`). Portage de `prop()` de tools/itemdata/gen-uniques.py (même sortie pour la
 * même entrée, vérifié au lot M6), plus quatre correspondances vers des statistiques ajoutées au jeu depuis : `howl` (fuite, valeur en 128es),
 * `noheal` (empêche la guérison), `att-undead` (score d'attaque contre les morts-vivants), `abs-fire` / `abs-cold` / `abs-ltng`
 * (absorption fixe). Une propriété que la simulation ne sait pas appliquer est ignorée (comptée dans `unsupported`).
 */
import { STATS } from '../../src/data/stats';
import { SKILL_BY_ID } from '../../src/data/skills';
import type { StatRoll } from '../../src/data/types';
import { rows } from '../audit/common';
import { skillIdOf } from './skills';

/** Catégorie de l'objet porteur : décide de la statistique (défense locale ou non, dégâts améliorés seulement sur une arme…) */
export type Kind = 'weapon' | 'armor' | 'jewelry' | 'charm';

/** `snake` de gen-uniques.py : minuscules, apostrophes retirées, le reste non alphanumérique en `_` */
export const snake = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** `num` de gen-uniques.py : entier tronqué, défaut si vide ou non numérique */
export function num(x: string | undefined, d = 0): number {
  const s = (x ?? '').trim();
  if (!s) return d;
  const v = Number(s);
  return Number.isFinite(v) ? Math.trunc(v) : d;
}

/** Arrondi de Python 3 (au pair le plus proche) : la conversion du poison en dépend */
export function pyRound(x: number): number {
  const f = Math.floor(x);
  const r = x - f;
  if (r > 0.5) return f + 1;
  if (r < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Statistiques que la simulation applique */
export const SUPPORTED: ReadonlySet<string> = new Set(Object.keys(STATS));
const SKILL_IDS: ReadonlySet<string> = new Set(Object.keys(SKILL_BY_ID));

const CLASS_STAT: Record<string, string> = { ama: 'amzSkills', sor: 'sorcSkills', nec: 'necSkills', pal: 'palSkills', bar: 'barSkills', dru: 'druidSkills', ass: 'asnSkills' };
const TAB_STAT = [
  'amzBowSkills',
  'amzPassiveSkills',
  'amzJavelinSkills',
  'fireSkills',
  'lightSkills',
  'coldSkills',
  'necCurseSkills',
  'necPoisonSkills',
  'necSummonSkills',
  'palCombatSkills',
  'palOffenseSkills',
  'palDefenseSkills',
  'barCombatSkills',
  'barMasterySkills',
  'barWarcrySkills',
  'summonSkills',
  'shapeSkills',
  'eleSkills',
  'asnTrapSkills',
  'asnShadowSkills',
  'asnMartialSkills',
];
const SIMPLE: Record<string, string> = {
  'res-all': 'resAll',
  'res-fire': 'resFire',
  'res-cold': 'resCold',
  'res-ltng': 'resLight',
  'res-pois': 'resPoison',
  'res-fire-max': 'maxResFire',
  'res-cold-max': 'maxResCold',
  'res-ltng-max': 'maxResLight',
  'res-pois-max': 'maxResPoison',
  'res-all-max': 'maxResAll',
  str: 'str',
  dex: 'dex',
  vit: 'vit',
  enr: 'ene',
  'all-stats': 'allAttr',
  hp: 'life',
  mana: 'mana',
  'hp%': 'lifePct',
  'mana%': 'manaPct',
  lifesteal: 'lifeLeech',
  manasteal: 'manaLeech',
  'mana-kill': 'manaPerKill',
  'heal-kill': 'lifePerKill',
  regen: 'lifeRegen',
  'regen-mana': 'manaRegenPct',
  light: 'lightRadius',
  'mag%': 'mf',
  'gold%': 'gf',
  allskills: 'allSkills',
  'red-dmg': 'drFlat',
  'red-dmg%': 'dr',
  'red-mag': 'mdr',
  crush: 'crushingBlow',
  deadly: 'deadlyStrike',
  openwounds: 'openWounds',
  block: 'block',
  att: 'attackRating',
  'att%': 'arPct',
  nofreeze: 'cbf',
  'res-pois-len': 'poisonLength',
  indestruct: 'indestructible',
  sock: 'socketsAdded',
  'extra-fire': 'fireDmgPct',
  'extra-cold': 'coldDmgPct',
  'extra-ltng': 'lightDmgPct',
  'extra-pois': 'poisonDmgPct',
  'pierce-fire': 'pierceFire',
  'pierce-cold': 'pierceCold',
  'pierce-ltng': 'pierceLight',
  'abs-fire%': 'absorbFire',
  'abs-cold%': 'absorbCold',
  'abs-ltng%': 'absorbLight',
  addxp: 'xpPct',
  'dmg-min': 'minDmg',
  'dmg-max': 'maxDmg',
  thorns: 'thornsFlat',
  'ignore-ac': 'ignoreDef',
  slow: 'slowTarget',
  knock: 'knockback',
  'half-freeze': 'halfFreeze',
  freeze: 'freezeTarget',
  'dmg-to-mana': 'dmgToMana',
  'dmg-undead': 'dmgUndeadPct',
  'dmg-demon': 'dmgDemonPct',
  'reduce-ac': 'reduceDef',
  manasteal2: 'manaLeech',
  'pierce-pois': 'piercePoison',
  'ac-miss': 'defMissile',
  'ac-hth': 'defMelee',
  'att-demon': 'arDemon',
  pierce: 'pierceChance',
  block1: 'fbr',
  block2: 'fbr',
  block3: 'fbr',
  // correspondances ajoutées au lot M6 (statistiques ajoutées au jeu après gen-uniques.py ; `howl` et `noheal` : plus bas)
  'att-undead': 'arUndead',
  'abs-fire': 'absorbFireFlat',
  'abs-cold': 'absorbColdFlat',
  'abs-ltng': 'absorbLightFlat',
};
const PROC: Record<string, string> = {
  'hit-skill': 'procHit',
  'att-skill': 'procAtt',
  'gethit-skill': 'procGetHit',
  'kill-skill': 'procKill',
  'death-skill': 'procDeath',
  'levelup-skill': 'procLevelUp',
};
/** Propriétés « par niveau » : statistique, catégorie exigée, diviseur du paramètre (`op param` d'ItemStatCost.txt : 3 → 1/8, 1 → 1/2) */
const PERLVL: Record<string, [string, Kind | null, number]> = {
  'ac/lvl': ['defPerLvl', 'armor', 8],
  'dmg/lvl': ['maxDmgPerLvl', 'weapon', 8],
  // item_tohit_perlevel : op param 1 (moitié du paramètre par niveau ; gen-uniques.py divisait par 8, corrigé au lot M10a)
  'att/lvl': ['attackRatingPerLvl', null, 2],
  'mag%/lvl': ['mfPerLvl', null, 8],
  'str/lvl': ['strPerLvl', null, 8],
  'dex/lvl': ['dexPerLvl', null, 8],
  'vit/lvl': ['vitPerLvl', null, 8],
};

let idName: Map<string, string> | null = null;
/** Compétence d'une propriété : identifiant numérique (Skills.txt `Id`) ou nom */
function skillRef(par: string): string {
  if (/^\d+$/.test(par)) {
    if (!idName) {
      idName = new Map();
      for (const r of rows('skills')) {
        const n = (r.skill ?? '').trim();
        if (n) idName.set(String(num(r.Id, -1)), skillIdOf(n));
      }
    }
    return idName.get(par) ?? skillIdOf(par);
  }
  return skillIdOf(par.trim());
}

/** Propriétés D2 non converties (rapport) */
export const unsupported = new Map<string, number>();
const miss = (k: string): void => void unsupported.set(k, (unsupported.get(k) ?? 0) + 1);

const R = (stat: string, lo: number, hi = lo, param?: string): StatRoll => (lo > hi ? { stat, min: hi, max: lo, param } : { stat, min: lo, max: hi, param });

/** Une propriété D2 → statistiques du jeu ([] si non gérée) */
function prop(p: string, par: string, lo: number, hi: number, kind: Kind): StatRoll[] {
  const armor = kind === 'armor';
  const weapon = kind === 'weapon';
  if (p === 'dmg%') return weapon ? [R('edPct', lo, hi)] : [];
  if (p === 'ac%') return armor ? [R('defPct', lo, hi)] : [];
  if (p === 'ac') return [R(armor ? 'defFlat' : 'defense', lo, hi)];
  if (/^swing[123]$/.test(p)) return [R('ias', lo, hi)];
  if (/^move[123]$/.test(p)) return [R('frw', lo, hi)];
  if (/^cast[123]$/.test(p)) return [R('fcr', lo, hi)];
  if (/^balance[123]$/.test(p)) return [R('fhr', lo, hi)];
  if (p === 'nofreeze') return [R('cbf', 1)];
  if (p === 'indestruct') return [R('indestructible', 1)];
  if (p === 'dmg-norm' || p === 'dmg') return weapon ? [R('minDmg', lo, lo), R('maxDmg', hi, hi)] : [];
  for (const [el, st] of [
    ['fire', 'Fire'],
    ['cold', 'Cold'],
    ['ltng', 'Light'],
  ] as const) {
    if (p === `dmg-${el}`) return [R(`add${st}Min`, lo, lo), R(`add${st}Max`, hi, hi)];
    if (p === `${el}-min`) return [R(`add${st}Min`, lo, hi)];
    if (p === `${el}-max`) return [R(`add${st}Max`, lo, hi)];
  }
  if (p === 'dmg-pois') {
    const len = num(par, 100);
    return [R('poisonDmg', Math.max(1, pyRound((lo * len) / 256)), Math.max(1, pyRound((hi * len) / 256)))];
  }
  if (p === 'ease') return hi < 0 ? [R('reqPct', -hi, -lo)] : [R('reqPct', -lo, -hi)];
  if (p === 'hp/lvl' || p === 'mana/lvl') {
    const v = num(par) / 8;
    return [R(p === 'hp/lvl' ? 'lifePerLvl' : 'manaPerLvl', v, v)];
  }
  if (p === 'skilltab') {
    const t = num(par, -1);
    return t >= 0 && t < TAB_STAT.length ? [R(TAB_STAT[t], lo, hi)] : [];
  }
  if (CLASS_STAT[p]) return [R(CLASS_STAT[p], lo, hi)];
  if (p === 'skill' || p === 'oskill') {
    const sid = skillRef(par);
    if (SKILL_IDS.has(sid)) return [R('oskill', lo, hi, sid)];
    miss(`skill:${sid}`);
    return [];
  }
  if (PROC[p]) {
    const sid = skillRef(par);
    if (SKILL_IDS.has(sid) && lo > 0) return [R(PROC[p], lo, lo, `${sid}:${Math.max(1, hi)}`)];
    miss(`skill:${sid}`);
    return [];
  }
  if (p === 'sock' && lo === 0 && hi === 0 && num(par)) return [R('socketsAdded', num(par))];
  if (p === 'dmg-mag') return [R('addMagicMin', lo, lo), R('addMagicMax', hi, hi)];
  if (p === 'thorns/lvl') return num(par) > 0 ? [R('thornsPerLvl', num(par) / 8)] : [];
  if (p === 'res-ltng/lvl') return num(par) > 0 ? [R('resLightPerLvl', num(par) / 8)] : [];
  if (p === 'dmg%/lvl') return num(par) > 0 && weapon ? [R('edMaxPctPerLvl', num(par) / 8)] : [];
  if (PERLVL[p]) {
    const [st, need, div] = PERLVL[p];
    if (need && need !== kind) return [];
    const v = num(par) / div;
    return v > 0 ? [R(st, v, v)] : [];
  }
  if (p === 'aura') {
    const sid = skillRef(par);
    return SKILL_IDS.has(sid) ? [R('itemAura', lo, lo, sid)] : [];
  }
  if (p === 'fireskill') return [R('fireSkills', lo, hi)];
  if (p === 'light-thorns') return [R('lightThornsFlat', lo, hi)];
  if (p === 'noheal') return [R('preventMonsterHeal', 1)];
  // « Hit Causes Monster to Flee » : valeur en 128es (32 = 25 %)
  if (p === 'howl') return [R('fleeChance', pyRound((lo * 100) / 128), pyRound((hi * 100) / 128))];
  if (SIMPLE[p] && SUPPORTED.has(SIMPLE[p])) return [R(SIMPLE[p], lo, hi)];
  return [];
}

/** Une propriété D2 (code, paramètre, min, max), statistiques inconnues de la simulation écartées */
export function convertProp(code: string, par: string, lo: number, hi: number, kind: Kind): StatRoll[] {
  const got = prop(code, par, lo, hi, kind).filter((s) => SUPPORTED.has(s.stat));
  if (!got.length) miss(code);
  return got;
}

/** Les propriétés `prop1..n` d'une ligne (UniqueItems.txt, SetItems.txt) */
export function convertRow(row: Record<string, string | undefined>, n: number, kind: Kind): StatRoll[] {
  const out: StatRoll[] = [];
  for (let i = 1; i <= n; i++) {
    const c = (row[`prop${i}`] ?? '').trim();
    if (!c) continue;
    out.push(...convertProp(c, (row[`par${i}`] ?? '').trim(), num(row[`min${i}`]), num(row[`max${i}`]), kind));
  }
  return out;
}

/**
 * Emplacement d'une gemme ou d'une rune (`*Mod1..3Code` de Gems.txt) : comme `convertProp`, sauf le poison en trois propriétés
 * (`pois-min`, `pois-max`, `pois-len`, émeraudes) : dégâts totaux = valeur × durée / 256, à la place de `pois-min`.
 */
export function convertMods(mods: readonly { code: string; par: string; min: number; max: number }[], kind: Kind): StatRoll[] {
  const out: StatRoll[] = [];
  const len = mods.find((m) => m.code === 'pois-len')?.min ?? 0;
  for (const m of mods) {
    if (m.code === 'pois-len' || m.code === 'pois-max') continue;
    if (m.code === 'pois-min') {
      const hi = mods.find((x) => x.code === 'pois-max')?.max ?? m.max;
      out.push(R('poisonDmg', pyRound((m.min * len) / 256), pyRound((hi * len) / 256)));
    } else out.push(...convertProp(m.code, m.par, m.min, m.max, kind));
  }
  return out;
}
