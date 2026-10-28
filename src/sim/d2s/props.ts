/**
 * Propriétés magiques d'un objet D2 (identifiants de ItemStatCost) → modificateurs du jeu (data/stats.ts).
 * Seules les statistiques que la simulation applique sont conservées ; le reste est compté comme perdu.
 */
import { STATS } from '../../data/stats';
import type { RolledMod } from '../item';
import type { D2sProp } from './parse';
import type { D2sTables } from './tables';

/** Statistique D2 → statistique du jeu (valeur telle quelle) */
const DIRECT: Record<number, string> = {
  0: 'str',
  1: 'ene',
  2: 'dex',
  3: 'vit',
  7: 'life',
  9: 'mana',
  16: 'defPct',
  19: 'attackRating',
  20: 'block',
  21: 'minDmg',
  22: 'maxDmg',
  27: 'manaRegenPct',
  34: 'drFlat',
  35: 'mdr',
  36: 'dr',
  39: 'resFire',
  40: 'maxResFire',
  41: 'resLight',
  42: 'maxResLight',
  43: 'resCold',
  44: 'maxResCold',
  45: 'resPoison',
  46: 'maxResPoison',
  74: 'lifeRegen',
  76: 'lifePct',
  77: 'manaPct',
  78: 'thornsFlat',
  79: 'gf',
  80: 'mf',
  81: 'knockback',
  85: 'xpPct',
  86: 'lifePerKill',
  89: 'lightRadius',
  93: 'ias',
  96: 'frw',
  99: 'fhr',
  102: 'fbr',
  105: 'fcr',
  110: 'poisonLength',
  112: 'fleeChance',
  114: 'dmgToMana',
  115: 'ignoreDef',
  117: 'preventMonsterHeal',
  118: 'halfFreeze',
  119: 'arPct',
  121: 'dmgDemonPct',
  122: 'dmgUndeadPct',
  123: 'arDemon',
  124: 'arUndead',
  127: 'allSkills',
  128: 'lightThornsFlat',
  134: 'freezeTarget',
  135: 'openWounds',
  136: 'crushingBlow',
  137: 'kickDmg',
  138: 'manaPerKill',
  141: 'deadlyStrike',
  142: 'absorbFire',
  143: 'absorbFireFlat',
  144: 'absorbLight',
  145: 'absorbLightFlat',
  147: 'absorbMagicFlat',
  148: 'absorbCold',
  149: 'absorbColdFlat',
  150: 'slowTarget',
  152: 'indestructible',
  153: 'cbf',
  156: 'pierceChance',
};
/** Bonus par niveau du personnage : la valeur D2 est en huitièmes de point par niveau */
const PER_LVL: Record<number, string> = {
  214: 'defPerLvl',
  216: 'lifePerLvl',
  217: 'manaPerLvl',
  218: 'maxDmgPerLvl',
  219: 'edMaxPctPerLvl',
  220: 'strPerLvl',
  221: 'dexPerLvl',
  223: 'vitPerLvl',
  224: 'attackRatingPerLvl',
  225: 'arPctPerLvl',
  226: 'maxColdPerLvl',
  228: 'addLightMaxPerLvl',
  230: 'resColdPerLvl',
  231: 'resFirePerLvl',
  232: 'resLightPerLvl',
  234: 'absorbColdPerLvl',
  238: 'thornsPerLvl',
  240: 'mfPerLvl',
};
const CLASS_SKILLS = ['amzSkills', 'sorcSkills', 'necSkills', 'palSkills', 'barSkills', 'druidSkills', 'asnSkills'];
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
const PROCS: Record<number, string> = { 195: 'procAtt', 196: 'procKill', 197: 'procDeath', 198: 'procHit', 199: 'procLevelUp', 201: 'procGetHit' };
/** Sans effet ou sans équivalent attendu : ne compte pas comme une perte (dégâts secondaires, châsses, durabilité, charges, prix…) */
const IGNORED = new Set([4, 5, 18, 23, 24, 25, 55, 56, 58, 59, 67, 68, 70, 71, 72, 73, 75, 82, 87, 88, 90, 92, 94, 98, 111, 113, 116, 154, 157, 158, 159, 160, 194, 204, 252, 253, 254, 356]);

export interface MappedProps {
  mods: RolledMod[];
  /** Propriétés sans équivalent (identifiants D2) */
  lost: number[];
}

export interface MapContext {
  /** Base d'armure (la défense fixe devient `defFlat`, locale) ou autre */
  armor: boolean;
}

export function mapProps(props: D2sProp[], T: D2sTables, ctx: MapContext): MappedProps {
  const mods: RolledMod[] = [];
  const lost: number[] = [];
  const add = (stat: string, value: number, param?: string): boolean => {
    if (!STATS[stat]) return false;
    value = Math.round(value * 1000) / 1000;
    if (value !== 0) mods.push(param === undefined ? { stat, value } : { stat, value, param });
    return true;
  };
  for (const p of props) {
    const v = p.v[0] ?? 0;
    let ok = true;
    const id = p.id;
    if (IGNORED.has(id)) continue;
    if (DIRECT[id]) ok = add(DIRECT[id], v);
    else if (PER_LVL[id]) ok = add(PER_LVL[id], v / 8);
    else
      switch (id) {
        case 17:
          ok = add('edPct', v);
          break;
        case 31:
          ok = add(ctx.armor ? 'defFlat' : 'defense', v);
          break;
        case 48:
          ok = add('addFireMin', v) && add('addFireMax', p.v[1] ?? v);
          break;
        case 50:
          ok = add('addLightMin', v) && add('addLightMax', p.v[1] ?? v);
          break;
        case 52:
          ok = add('addMagicMin', v) && add('addMagicMax', p.v[1] ?? v);
          break;
        case 54:
          ok = add('addColdMin', v) && add('addColdMax', p.v[1] ?? v);
          break;
        case 57:
          ok = add('poisonDmg', Math.max(1, Math.round((((p.v[0] ?? 0) + (p.v[1] ?? 0)) / 2) * ((p.v[2] ?? 0) / 256))));
          break;
        case 91:
          ok = add('reqPct', -v);
          break;
        case 120:
          ok = add('reduceDef', Math.abs(v));
          break;
        case 83:
          ok = p.param !== undefined && !!CLASS_SKILLS[p.param] && add(CLASS_SKILLS[p.param], v);
          break;
        case 126:
          ok = add(['fireSkills', 'lightSkills', 'coldSkills'][p.param ?? 9] ?? '', v);
          break;
        case 188: {
          const stat = TAB_STAT[(p.param ?? 0) * 3 + (p.extra ?? 0)];
          ok = !!stat && add(stat, v);
          break;
        }
        case 97:
        case 107: {
          const sid = T.skills[String(p.param)];
          ok = !!sid && add('oskill', v, sid);
          break;
        }
        case 151: {
          const sid = T.skills[String(p.param)];
          ok = !!sid && add('itemAura', v, sid);
          break;
        }
        default:
          if (PROCS[id]) {
            const sid = T.skills[String(p.param)];
            ok = !!sid && add(PROCS[id], v, `${sid}:${Math.max(1, p.extra ?? 1)}`);
          } else ok = false;
      }
    if (!ok) lost.push(id);
  }
  return { mods: mergeMods(mods), lost };
}

/** Réunit les modificateurs identiques (même statistique et même paramètre) */
function mergeMods(mods: RolledMod[]): RolledMod[] {
  const out: RolledMod[] = [];
  for (const m of mods) {
    const e = out.find((x) => x.stat === m.stat && x.param === m.param);
    if (e) e.value += m.value;
    else out.push({ ...m });
  }
  return out;
}
