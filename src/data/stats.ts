/**
 * Catalogue des statistiques. Chaque modificateur d'objet, de compétence passive ou de
 * caractéristique produit des valeurs dans une StatMap indexée par ces identifiants.
 * Les libellés servent aux infobulles (en français).
 */

export type Element = 'phys' | 'fire' | 'cold' | 'light' | 'poison' | 'magic';
export const ELEMENTS: Element[] = ['phys', 'fire', 'cold', 'light', 'poison', 'magic'];

export interface StatDef {
  id: string;
  /** Libellé ; {v} = valeur, {p} = paramètre (nom de compétence…) */
  label: string;
  /** Statistique locale à l'objet (ne s'agrège pas au personnage, modifie l'objet) */
  local?: boolean;
  /** Poids de priorité d'affichage (plus petit = plus haut) */
  order: number;
  /** Plafond éventuel */
  cap?: number;
}

const S = (id: string, label: string, order: number, extra: Partial<StatDef> = {}): StatDef => ({ id, label, order, ...extra });

const STAT_DEFS: StatDef[] = [
  // compétences
  S('allSkills', '+{v} à toutes les compétences', 1),
  S('sorcSkills', '+{v} aux compétences de Sorcière', 2),
  S('fireSkills', '+{v} aux compétences de Feu', 3),
  S('coldSkills', '+{v} aux compétences de Froid', 4),
  S('lightSkills', '+{v} aux compétences de Foudre', 5),
  S('druidSkills', '+{v} aux compétences de Druide', 2),
  S('eleSkills', '+{v} aux compétences Élémentaires (Druide)', 3),
  S('shapeSkills', '+{v} aux compétences de Métamorphose (Druide)', 4),
  S('summonSkills', "+{v} aux compétences d'Invocation (Druide)", 5),
  S('barSkills', '+{v} aux compétences de Barbare', 2),
  S('barCombatSkills', '+{v} aux compétences de Combat (Barbare)', 3),
  S('barMasterySkills', '+{v} aux Maîtrises (Barbare)', 4),
  S('barWarcrySkills', '+{v} aux Cris de guerre (Barbare)', 5),
  S('palSkills', '+{v} aux compétences de Paladin', 2),
  S('palCombatSkills', '+{v} aux compétences de Combat (Paladin)', 3),
  S('palDefenseSkills', '+{v} aux Auras défensives (Paladin)', 4),
  S('palOffenseSkills', '+{v} aux Auras offensives (Paladin)', 5),
  S('amzSkills', "+{v} aux compétences d'Amazone", 2),
  S('amzBowSkills', "+{v} aux compétences d'Arc et d'arbalète (Amazone)", 3),
  S('amzPassiveSkills', '+{v} aux compétences Passives et magiques (Amazone)', 4),
  S('amzJavelinSkills', '+{v} aux compétences de Javelot et de lance (Amazone)', 5),
  S('asnSkills', "+{v} aux compétences d'Assassin", 2),
  S('asnMartialSkills', '+{v} aux Arts martiaux (Assassin)', 3),
  S('asnShadowSkills', "+{v} aux Disciplines de l'ombre (Assassin)", 4),
  S('asnTrapSkills', '+{v} aux Pièges (Assassin)', 5),
  S('necSkills', '+{v} aux compétences de Nécromancien', 2),
  S('necSummonSkills', "+{v} aux compétences d'Invocation (Nécromancien)", 3),
  S('necPoisonSkills', '+{v} aux compétences de Poison et os (Nécromancien)', 4),
  S('necCurseSkills', '+{v} aux Malédictions (Nécromancien)', 5),
  S('oskill', '+{v} à {p}', 6),
  // vitesses
  S('fcr', "+{v}% de vitesse d'incantation", 10),
  S('fhr', '+{v}% de récupération après coup', 11),
  S('frw', '+{v}% de vitesse de course', 12),
  S('ias', "+{v}% de vitesse d'attaque", 13),
  // dégâts de sorts
  S('fireDmgPct', '+{v}% aux dégâts de Feu', 20),
  S('coldDmgPct', '+{v}% aux dégâts de Froid', 21),
  S('lightDmgPct', '+{v}% aux dégâts de Foudre', 22),
  S('poisonDmgPct', '+{v}% aux dégâts de Poison', 23),
  S('pierceFire', '-{v}% à la résistance au Feu ennemie', 24),
  S('pierceCold', '-{v}% à la résistance au Froid ennemie', 25),
  S('pierceLight', '-{v}% à la résistance à la Foudre ennemie', 26),
  S('pierceAll', '-{v}% aux résistances ennemies', 27),
  S('sunderFire', 'Les immunités au Feu des monstres sont brisées', 28),
  S('sunderCold', 'Les immunités au Froid des monstres sont brisées', 28),
  S('sunderLight', 'Les immunités à la Foudre des monstres sont brisées', 28),
  S('sunderPhys', 'Les immunités physiques des monstres sont brisées', 28),
  // arme (local)
  S('edPct', '+{v}% de dégâts améliorés', 30, { local: true }),
  S('minDmg', '+{v} aux dégâts minimum', 31, { local: true }),
  S('maxDmg', '+{v} aux dégâts maximum', 32, { local: true }),
  S('addFireMin', 'Ajoute {v} dégâts de feu (min)', 33),
  S('addFireMax', 'Ajoute {v} dégâts de feu (max)', 34),
  S('addColdMin', 'Ajoute {v} dégâts de froid (min)', 35),
  S('addColdMax', 'Ajoute {v} dégâts de froid (max)', 36),
  S('addLightMin', 'Ajoute {v} dégâts de foudre (min)', 37),
  S('addLightMax', 'Ajoute {v} dégâts de foudre (max)', 38),
  S('attackRating', "+{v} au score d'attaque", 39),
  S('crushingBlow', '{v}% de chances de coup écrasant', 40),
  S('deadlyStrike', '{v}% de chances de frappe mortelle', 41),
  S('openWounds', '{v}% de chances de blessures ouvertes', 42),
  // défense
  S('defPct', '+{v}% de défense améliorée', 50, { local: true }),
  S('defFlat', '+{v} en défense', 51, { local: true }),
  S('defense', '+{v} en défense', 52),
  S('block', '+{v}% de chances de blocage', 53),
  S('dr', 'Dégâts réduits de {v}%', 54, { cap: 50 }),
  S('drFlat', 'Dégâts réduits de {v}', 55),
  S('mdr', 'Dégâts magiques réduits de {v}', 56),
  // caractéristiques
  S('str', '+{v} en Force', 60),
  S('dex', '+{v} en Dextérité', 61),
  S('vit', '+{v} en Vitalité', 62),
  S('ene', '+{v} en Énergie', 63),
  S('allAttr', '+{v} à toutes les caractéristiques', 59),
  S('life', '+{v} à la vie', 64),
  S('mana', '+{v} au mana', 65),
  S('lifePct', 'Vie maximum augmentée de {v}%', 66),
  S('manaPct', 'Mana maximum augmenté de {v}%', 67),
  S('lifeRegen', 'Régénère {v} points de vie par seconde', 68),
  S('manaRegenPct', 'Régénération du mana +{v}%', 69),
  S('lifeLeech', '{v}% de la vie volée par coup', 70),
  S('manaLeech', '{v}% du mana volé par coup', 71),
  S('lifePerKill', '+{v} vie à chaque monstre tué', 72),
  S('manaPerKill', '+{v} mana à chaque monstre tué', 73),
  S('lifePerLvl', '+{v} à la vie (selon le niveau du personnage)', 74),
  S('manaPerLvl', '+{v} au mana (selon le niveau du personnage)', 75),
  // résistances
  S('resAll', 'Toutes les résistances +{v}%', 80),
  S('resFire', 'Résistance au Feu +{v}%', 81),
  S('resCold', 'Résistance au Froid +{v}%', 82),
  S('resLight', 'Résistance à la Foudre +{v}%', 83),
  S('resPoison', 'Résistance au Poison +{v}%', 84),
  S('maxResFire', '+{v}% à la résistance maximum au Feu', 85),
  S('maxResCold', '+{v}% à la résistance maximum au Froid', 86),
  S('maxResLight', '+{v}% à la résistance maximum à la Foudre', 87),
  S('maxResAll', '+{v}% à toutes les résistances maximum', 88),
  S('absorbFire', 'Absorbe {v}% des dégâts de Feu', 89),
  S('absorbCold', 'Absorbe {v}% des dégâts de Froid', 90),
  S('absorbLight', 'Absorbe {v}% des dégâts de Foudre', 91),
  S('absorbFireFlat', 'Absorbe {v} dégâts de Feu', 89),
  S('absorbColdFlat', 'Absorbe {v} dégâts de Froid', 90),
  S('absorbLightFlat', 'Absorbe {v} dégâts de Foudre', 91),
  S('absorbMagicFlat', 'Absorbe {v} dégâts magiques', 92),
  S('cbf', 'Ne peut pas être gelé', 92),
  S('poisonLength', 'Durée du poison réduite de {v}%', 93),
  S('curseLength', 'Durée des malédictions réduite de {v}%', 93),
  // butin
  S('mf', '{v}% de chances de trouver des objets magiques', 100),
  S('gf', "{v}% d'or supplémentaire des monstres", 101),
  S('xpPct', "+{v}% d'expérience gagnée", 102),
  S('lightRadius', '+{v} au rayon de lumière', 103),
  // divers
  S('reqPct', 'Prérequis -{v}%', 110, { local: true }),
  S('indestructible', 'Indestructible', 111, { local: true }),
  S('socketsAdded', 'Châsses ({v})', 112, { local: true }),
  S('manaAfterKill', '', 113),
  S('cooldownRed', 'Temps de recharge réduit de {v}%', 114),
  S('auraConviction', 'Aura de Conviction de niveau {v} quand équipé', 115),
  S('auraMeditation', 'Aura de Méditation de niveau {v} quand équipé', 116),
  S('auraConcentration', 'Aura de Concentration de niveau {v} quand équipé', 117),
  S('ctaBattleOrders', '+{v} à Ordres de bataille (charges)', 118),
  S('stunChance', "{v}% de chances d'étourdir", 43),
  S('freezeTarget', 'Gèle la cible +{v}', 44),
  S('poisonDmg', '+{v} dégâts de poison sur 3 secondes', 45),
  S('maxResPoison', '+{v}% à la résistance maximum au Poison', 88),
  S('spellDmgPct', '+{v}% aux dégâts des sorts', 19),
  S('dmgUndeadPct', '+{v}% de dégâts aux morts-vivants', 45),
  S('dmgDemonPct', '+{v}% de dégâts aux démons', 45),
  S('reduceDef', '-{v}% à la défense de la cible', 44),
  S('dmgToMana', '{v}% des dégâts subis sont convertis en mana', 76),
  S('slowTarget', 'Ralentit la cible de {v}%', 47),
  S('knockback', 'Repousse la cible', 46),
  S('preventMonsterHeal', 'Empêche les monstres de guérir', 46),
  S('fleeChance', 'Le coup fait fuir le monstre ({v}%)', 46),
  S('crushEff', "+{v}% à l'efficacité du coup écrasant", 40),
  S('coldArrowExtra', 'La Flèche de glace tire {v} flèches supplémentaires', 115),
  S('itemAura', 'Aura de {p} de niveau {v} quand équipé', 115),
  S('arPct', "+{v}% au score d'attaque", 39),
  S('thornsFlat', "L'attaquant subit {v} points de dégâts", 57),
  S('lightThornsFlat', "L'attaquant subit {v} points de dégâts de foudre", 58),
  S('ignoreDef', 'Ignore la défense de la cible', 44),
  S('procHit', '{v}% de chances de lancer {p} en frappant', 7),
  S('procAtt', '{v}% de chances de lancer {p} en attaquant', 7),
  S('procGetHit', '{v}% de chances de lancer {p} quand vous êtes frappé', 8),
  S('procKill', '{v}% de chances de lancer {p} en tuant un monstre', 8),
  S('procDeath', "{v}% de chances de lancer {p} à la mort d'un monstre", 8),
  S('procLevelUp', '{v}% de chances de lancer {p} au passage de niveau', 8),
  // bonus selon le niveau du personnage (D2 : « /lvl », en huitièmes de point par niveau)
  S('defPerLvl', '+{v} en défense par niveau du personnage', 52, { local: true }),
  S('maxDmgPerLvl', '+{v} aux dégâts maximum par niveau du personnage', 32, { local: true }),
  S('attackRatingPerLvl', "+{v} au score d'attaque par niveau du personnage", 39),
  S('mfPerLvl', '+{v}% de chances de trouver des objets magiques par niveau', 100),
  S('addMagicMin', 'Ajoute {v} dégâts magiques (min)', 40),
  S('addMagicMax', 'Ajoute {v} dégâts magiques (max)', 41),
  S('pierceChance', '+{v}% de chances de transpercer', 42),
  S('fbr', '+{v}% de vitesse de blocage', 14),
  S('halfFreeze', 'Durée de gel réduite de moitié', 94),
  S('splashDmg', 'Les attaques de mêlée infligent des dégâts de zone', 46),
  S('splashRadius', '+{v}% au rayon des dégâts de zone', 47),
  S('defMelee', '+{v} en défense contre les attaques de mêlée', 53),
  S('defMissile', '+{v} en défense contre les projectiles', 54),
  S('kickDmg', '+{v} aux dégâts des coups de pied', 33),
  S('curseRes', '+{v}% de résistance aux malédictions (durée réduite)', 55),
  S('deadlyMult', '+{v}% au multiplicateur de frappe mortelle', 41),
  S('maxDeadly', '+{v}% de frappe mortelle maximum', 41),
  S('piercePhys', '-{v}% à la résistance physique ennemie', 29),
  S('procBlock', '{v}% de chances de lancer {p} en bloquant', 8),
  S('extraSummon', 'Vous pouvez invoquer {v} {p} supplémentaire(s)', 115),
  S('extraCurse', 'Vous pouvez appliquer une malédiction supplémentaire', 115),
  S('extraShadow', 'Vous pouvez invoquer une ombre supplémentaire', 115),
  S('piercePoison', '-{v}% à la résistance au Poison ennemie', 28),
  S('reanimateReturned', '{v}% de chances de ranimer le monstre tué en Revenant', 116),
  S('arDemon', "+{v} au score d'attaque contre les démons", 40),
  S('procCast', '{v}% de chances de lancer {p} en incantant', 9),
  S('absorbColdPerLvl', 'Absorbe {v}% des dégâts de Froid par niveau du personnage', 90),
  S('thornsPerLvl', "L'attaquant subit {v} points de dégâts par niveau du personnage", 57),
  S('resFirePerLvl', 'Résistance au Feu +{v}% par niveau du personnage', 81),
  S('resColdPerLvl', 'Résistance au Froid +{v}% par niveau du personnage', 82),
  S('resLightPerLvl', 'Résistance à la Foudre +{v}% par niveau du personnage', 83),
  S('addLightMaxPerLvl', 'Ajoute {v} dégâts de foudre (max) par niveau du personnage', 38),
  S('maxColdPerLvl', 'Ajoute {v} dégâts de froid (max) par niveau du personnage', 36),
  S('maxLightDmgPerLvl', 'Ajoute {v} dégâts de foudre (max) par niveau du personnage', 38),
  S('edMaxPctPerLvl', '+{v}% de dégâts maximum améliorés par niveau du personnage', 30),
  S('strPerLvl', '+{v} en Force par niveau du personnage', 60),
  S('dexPerLvl', '+{v} en Dextérité par niveau du personnage', 61),
  S('vitPerLvl', '+{v} en Vitalité par niveau du personnage', 62),
  // affixes PD2 (table Item_Affixes)
  S('arUndead', "+{v} au score d'attaque contre les morts-vivants", 40),
  S('openWoundsDps', '+{v} aux dégâts des blessures ouvertes par seconde', 42),
  S('magicDmgPct', '+{v}% aux dégâts Magiques', 23),
  S('arPctPerLvl', "+{v}% au score d'attaque par niveau du personnage", 39),
  /** Bonus de compétence propre à une classe (D2 « staffmods » : « +3 à Boule de feu (Sorcière uniquement) ») */
  S('classSkill', '+{v} à {p}', 6),
];

export const STATS: Record<string, StatDef> = Object.fromEntries(STAT_DEFS.map((s) => [s.id, s]));

/** Carte de statistiques agrégées. Les compétences spécifiques sont stockées en `sk:<id>`. */
export type StatMap = Map<string, number>;

export function addStat(m: StatMap, id: string, v: number): void {
  if (!v) return;
  m.set(id, (m.get(id) ?? 0) + v);
}

export function mergeStats(into: StatMap, from: StatMap, mult = 1): void {
  for (const [k, v] of from) addStat(into, k, v * mult);
}
