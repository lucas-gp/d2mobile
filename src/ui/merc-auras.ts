/** Onglet Mercenaire : auras actives (niveau et effet en une ligne, FR/EN) */
import { SKILL_BY_ID } from '../data/skills';
import { MERC_AURA_RADIUS, convictionDefPct, convictionRes, nv } from '../sim/merc';

export interface MercAuraLine {
  name: string;
  level: number;
  text: string;
}

const NAMES_EN: Record<string, string> = {
  conviction: 'Conviction',
  defiance: 'Defiance',
  blessed_aim: 'Blessed Aim',
  might: 'Might',
  concentration: 'Concentration',
  fanaticism: 'Fanaticism',
  prayer: 'Prayer',
  cleansing: 'Cleansing',
  vigor: 'Vigor',
  meditation: 'Meditation',
  thorns: 'Thorns',
  holy_fire: 'Holy Fire',
  holy_freeze: 'Holy Freeze',
  holy_shock: 'Holy Shock',
  sanctuary: 'Sanctuary',
  battle_orders: 'Battle Orders',
  resist_fire: 'Resist Fire',
  resist_cold: 'Resist Cold',
  resist_lightning: 'Resist Lightning',
  salvation: 'Salvation',
  redemption: 'Redemption',
};

const r = (n: number): number => Math.round(n);

/** Effet d'une aura de mercenaire de niveau L : [FR, EN] */
function effect(id: string, L: number): [string, string] {
  const v = (k: string) => r(nv(id, k, L));
  switch (id) {
    case 'conviction':
      return [
        `Monstres à portée : −${r(convictionRes(L))} % résistances feu/froid/foudre, −${r(convictionDefPct(L))} % défense`,
        `Nearby monsters: −${r(convictionRes(L))}% fire/cold/lightning resistance, −${r(convictionDefPct(L))}% defense`,
      ];
    case 'defiance':
      return [`+${v('value')} % défense pour vous et lui`, `+${v('value')}% defense for you and it`];
    case 'blessed_aim':
      return [`+${v('value')} % score d’attaque`, `+${v('value')}% attack rating`];
    case 'might':
      return [`+${v('value')} % dégâts (lui), +${v('value2')} % (vous)`, `+${v('value')}% damage (it), +${v('value2')}% (you)`];
    case 'concentration':
      return [`+${v('value')} % dégâts (lui), +${v('value2')} % (vous), ne s’interrompt pas`, `+${v('value')}% damage (it), +${v('value2')}% (you), no interruption`];
    case 'fanaticism':
      return [`+${v('value')} % dégâts, +${v('v3')} % score d’attaque, +${v('v4')} % vitesse d’attaque`, `+${v('value')}% damage, +${v('v3')}% attack rating, +${v('v4')}% attack speed`];
    case 'prayer':
      return [`Soigne le groupe (~${v('value')} PV/s)`, `Heals the party (~${v('value')} life/s)`];
    case 'cleansing':
      return [`−${v('value')} % durée des malédictions et du poison`, `−${v('value')}% curse and poison duration`];
    case 'vigor':
      return [`+${v('value')} % vitesse de déplacement`, `+${v('value')}% movement speed`];
    case 'meditation':
      return ['Régénère du mana', 'Regenerates mana'];
    case 'thorns':
      return [`Renvoie ${v('value')} dégâts de mêlée à l’attaquant (vous)`, `Reflects ${v('value')} melee damage to attackers (you)`];
    case 'holy_fire':
    case 'holy_freeze':
    case 'holy_shock':
      return [`Brûle/frappe les ennemis proches : ${v('min')}-${v('max')} par seconde`, `Damages nearby enemies: ${v('min')}-${v('max')} per second`];
    case 'sanctuary':
      return [`Dégâts magiques aux morts-vivants proches (${v('min')}-${v('max')}) et repousse`, `Magic damage to nearby undead (${v('min')}-${v('max')}) and knockback`];
    case 'battle_orders':
      return [`+${v('value')} % vie maximale`, `+${v('value')}% maximum life`];
    case 'resist_fire':
    case 'resist_cold':
    case 'resist_lightning':
      return [`+${v('value')} % à la résistance`, `+${v('value')}% to the resistance`];
    default:
      return ['', ''];
  }
}

/** Lignes d'affichage des auras (la principale d'abord) */
export function mercAuraLines(auras: { id: string; level: number }[], lang: 'fr' | 'en'): MercAuraLine[] {
  return auras.map((a) => {
    const [fr, en] = effect(a.id, a.level);
    return { name: lang === 'fr' ? (SKILL_BY_ID[a.id]?.name ?? a.id) : (NAMES_EN[a.id] ?? SKILL_BY_ID[a.id]?.name ?? a.id), level: a.level, text: lang === 'fr' ? fr : en };
  });
}

export const MERC_AURA_RANGE_TEXT: [string, string] = [`Portée : ${MERC_AURA_RADIUS} cases autour du mercenaire`, `Range: ${MERC_AURA_RADIUS} tiles around the mercenary`];
