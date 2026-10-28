// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Carquois PD2 (page Quivers du wiki) : flèches (arcs) et carreaux (arbalètes), normaux / exceptionnels / élites (qlvl 1 / 25 / 45),
 * 1 à 2 châsses, automod (flèches : +2 / +10 / +18 dégâts maximum ; carreaux : -2 / -4 / -6 % à la résistance physique ennemie),
 * 12 uniques et 3 mots runiques. Un carquois se porte dans l'emplacement secondaire avec l'arme qui lui correspond (arc ou arbalète) ;
 * il n'y a pas de munitions : c'est un objet à bonus passifs. Propriétés non simulées omises : régénération d'endurance,
 * « empêche la guérison des monstres », fuite des monstres, -défense des monstres par coup, squelettes archers, flèches froides supplémentaires.
 */
import type { ItemBase, RunewordDef, StatRoll, UniqueDef } from '../../../../src/mods/api';

const r = (stat: string, min: number, max = min, param?: string): StatRoll => ({ stat, min, max, param });

const q = (id: string, name: string, tier: 0 | 1 | 2, kind: 'arrows' | 'bolts', price: number): ItemBase => ({
  id,
  name,
  type: 'quiver',
  tier,
  qlvl: [1, 25, 45][tier],
  reqLvl: 1,
  reqStr: 0,
  reqDex: 0,
  maxSockets: 2,
  socketTiers: [1, 2, 2],
  implicit: kind === 'arrows' ? [r('maxDmg', [2, 10, 18][tier])] : [r('piercePhys', [2, 4, 6][tier])],
  icon: 'quiver',
  rarity: 2,
  price,
  slot: 'offhand',
  classOnly: 'amazon',
});

export const QUIVER_BASES: ItemBase[] = [
  q('blunt_arrows', 'Flèches émoussées', 0, 'arrows', 150),
  q('sharp_arrows', 'Flèches acérées', 1, 'arrows', 600),
  q('razor_arrows', 'Flèches tranchantes', 2, 'arrows', 1500),
  q('light_bolts', 'Carreaux légers', 0, 'bolts', 150),
  q('heavy_bolts', 'Carreaux lourds', 1, 'bolts', 600),
  q('war_bolts', 'Carreaux de guerre', 2, 'bolts', 1500),
];

const u = (id: string, name: string, base: string, lvl: number, reqLvl: number, rarity: number, mods: StatRoll[]): UniqueDef => ({ id, name, base, lvl, reqLvl, rarity, mods });

/** Les valeurs PD2 : « adds 6-10 » = minimum et maximum fixes ; l'automod de la base est déjà compté par la base */
export const QUIVER_UNIQUES: UniqueDef[] = [
  u('u_balefire', 'Brasier funeste', 'blunt_arrows', 14, 14, 1, [r('addFireMin', 6), r('addFireMax', 10), r('pierceFire', 5, 8), r('lifeLeech', 2, 3), r('defMissile', 20, 45), r('mf', 18, 32)]),
  u('u_swiftwind_needle', 'Aiguille du vent vif', 'sharp_arrows', 32, 32, 4, [r('frw', 20, 30), r('minDmg', 12), r('maxDmg', 14), r('dex', 15, 35), r('resCold', 50), r('resLight', -25)]),
  u('u_tombsong', 'Chant du tombeau', 'sharp_arrows', 36, 36, 3, [
    r('extraSummon', 4, 4, 'raise_skeleton_archer'),
    r('pierceChance', 20, 40),
    r('maxDmg', 10),
    r('dmgUndeadPct', 50, 100),
    r('arUndead', 125, 175),
    r('curseRes', 20),
  ]),
  u('u_aetherwing', "Aile d'éther", 'razor_arrows', 55, 55, 4, [
    r('procGetHit', 35, 35, 'static_field:40'),
    r('ias', 40),
    r('attackRatingPerLvl', 2, 4),
    r('addLightMin', 1),
    r('addLightMax', 775),
    r('pierceLight', 15, 25),
    r('maxResLight', 4, 6),
    r('resLight', 20, 35),
  ]),
  u('u_basilisks_quill', 'Plume du basilic', 'razor_arrows', 62, 62, 4, [
    r('amzSkills', 2),
    r('minDmg', 30, 40),
    r('poisonDmg', 810, 960),
    r('piercePoison', 20, 30),
    r('maxResPoison', 5),
    r('resPoison', 45),
    r('lifePerKill', 5, 8),
    r('gf', 75, 125),
  ]),
  u('u_dooms_finger', 'Doigt du destin', 'razor_arrows', 87, 68, 1, [
    r('amzPassiveSkills', 2),
    r('maxDmg', 60, 80),
    r('dmgDemonPct', 60, 80),
    r('maxDeadly', 10),
    r('deadlyStrike', 20, 30),
    r('mdr', 12),
    r('halfFreeze', 1),
  ]),
  u('u_ramfodder', 'Chair à bélier', 'light_bolts', 8, 8, 1, [r('ias', 10), r('fhr', 20), r('knockback', 1), r('life', 10, 25)]),
  u('u_anvilguard_strap', "Sangle de l'enclume", 'heavy_bolts', 34, 34, 3, [
    r('procGetHit', 10, 10, 'amplify_damage:31'),
    r('pierceChance', 20),
    r('preventMonsterHeal', 1),
    r('dr', 10, 18),
    r('thornsFlat', 400, 500),
    r('lightRadius', 2, 4),
  ]),
  u('u_shatterhead', 'Brise-crâne', 'heavy_bolts', 47, 47, 1, [r('amzBowSkills', 2), r('edPct', 30, 40), r('crushEff', 15, 25), r('crushingBlow', 20, 30), r('defFlat', 145), r('str', 10, 20)]),
  u('u_abyssal_ward', 'Garde des abysses', 'war_bolts', 60, 60, 3, [
    r('piercePhys', 10, 14),
    r('ias', -20),
    r('fleeChance', 6),
    r('maxResPoison', 4, 5),
    r('maxResCold', 4, 5),
    r('maxResLight', 4, 5),
    r('maxResFire', 4, 5),
    r('resAll', 15, 25),
  ]),
  u('u_bannerlords_call', 'Appel du porte-étendard', 'war_bolts', 60, 65, 3, [
    r('allSkills', 2),
    r('fcr', 20),
    r('curseLength', 20, 30),
    r('oskill', 2, 3, 'slow_movement'),
    r('oskill', 2, 3, 'inner_sight'),
    r('allAttr', 8, 14),
    r('dmgToMana', 18),
  ]),
  u('u_frozen_sorrow', 'Chagrin gelé', 'war_bolts', 87, 72, 1, [
    r('coldSkills', 3),
    r('coldArrowExtra', 3, 4),
    r('manaLeech', 4, 5),
    r('pierceCold', 6),
    r('deadlyStrike', 15, 25),
    r('slowTarget', 25),
    r('ene', 28),
    r('resFire', 40, 50),
  ]),
];

/** Mot runique de carquois ; runes par identifiant (r07 Tal, r08 Ral, r09 Ort, r10 Thul, r12 Sol, r14 Dol) */
function rw(id: string, name: string, runes: string[], reqLvl: number, mods: StatRoll[]): RunewordDef {
  return { id, name, runes, types: ['quiver'], reqLvl, mods };
}

/** Mots runiques de carquois à 2 châsses (valeurs PD2 S13) */
export const QUIVER_RUNEWORDS: RunewordDef[] = [
  rw('rw_ancients_scripture', 'Écriture des Anciens', ['r07', 'r09'], 21, [r('edPct', 10, 20), r('life', 20), r('resLight', 40, 50), r('resPoison', 40, 50)]),
  rw('rw_ancients_foresight', 'Prescience des Anciens', ['r08', 'r10'], 23, [r('edPct', 10, 20), r('mana', 20), r('manaRegenPct', 20), r('resCold', 40, 50), r('resFire', 40, 50)]),
  rw('rw_echo_quiver', 'Écho', ['r12', 'r14'], 31, [r('pierceChance', 20, 30), r('edPct', 20, 30), r('arPct', 50), r('lifeRegen', 30), r('drFlat', 9), r('lifePerKill', 2)]),
];
