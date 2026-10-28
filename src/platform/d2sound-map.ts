/**
 * Correspondance entre les événements du jeu et les groupes de sons de Diablo II (index de tools/d2audio).
 * Fonctions pures : `has` dit si un groupe existe dans l'index importé, chaque fonction renvoie le premier groupe
 * disponible ou null (le moteur audio garde alors son son d'origine).
 */
export type Has = (group: string) => boolean;

const first = (has: Has, list: (string | null | undefined)[]): string | null => {
  for (const g of list) if (g && has(g)) return g;
  return null;
};

const norm = (s: string): string => s.replace(/_/g, '').toUpperCase();

export const CLASS_OWNER: Record<string, string> = {
  sorceress: 'SORCERESS',
  druid: 'DRUID',
  barbarian: 'BARBARIAN',
  paladin: 'PALADIN',
  amazon: 'AMAZON',
  assassin: 'ASSASSIN',
  necromancer: 'NECROMANCER',
};

/** Compétences dont le son n'a pas le nom de la compétence dans Sounds.txt (groupe sans « ESOUND_ ») */
const SKILL_SOUND: Record<string, string> = {
  // Sorcière
  fire_wall: 'SORCERESS_CAST_FIRE',
  blaze: 'SORCERESS_CAST_FIRE',
  warmth: 'SORCERESS_ENCHANT',
  combustion: 'SORCERESS_CAST_FIRE',
  hydra: 'HYDRA_APPEAR',
  lesser_hydra: 'HYDRA_APPEAR',
  ice_blast: 'SORCERESS_ICEBOLT',
  frozen_orb: 'SORCERESS_ICEBOLT',
  ice_barrage: 'SORCERESS_ICEBOLT',
  blizzard: 'SORCERESS_CAST_COLD',
  cold_enchant: 'SORCERESS_ENCHANT',
  chilling_armor: 'SORCERESS_FROZENARMOR',
  chain_lightning: 'SORCERESS_LIGHTNING',
  static_field: 'SORCERESS_CAST_LIGHTNING',
  thunder_storm: 'SORCERESS_THUNDER_CAST',
  // Druide
  maul: 'DRUIDWEREBEAR_ATTACK',
  feral_rage: 'DRUIDWEREWOLF_ATTACK',
  rabies: 'DRUIDWEREWOLF_ATTACK',
  hunger: 'DRUIDWEREWOLF_ATTACK',
  fury: 'DRUIDWEREWOLF_BITE',
  firestorm: 'DRUID_FIRECAST_A',
  molten_boulder: 'DRUID_BOULDEREXPLODE',
  eruption: 'DRUID_VOLCANO',
  gust: 'DRUID_WINDCAST',
  armageddon: 'DRUID_METEOR_EXPLODE',
  werewolf: 'DRUID_MORPH',
  werebear: 'DRUID_MORPH',
  shape_shifting: 'DRUID_MORPH',
  raven: 'DRUID_SUMMON',
  spirit_wolf: 'DRUID_SUMMON',
  summon_fenris: 'DRUID_SUMMON',
  grizzly: 'DRUID_SUMMON',
  oak_sage: 'DRUID_SUMMON',
  heart_wolverine: 'DRUID_SUMMON',
  spirit_barbs: 'DRUID_SUMMON',
  vines: 'DRUID_SUMMON',
  plague_poppy: 'DRUID_SUMMON',
  // Barbare
  war_cry: 'BARBARIAN_WARCRY',
  find_item: 'BARBARIAN_FINDOBJECT',
  find_potion: 'BARBARIAN_FINDOBJECT',
  leap_attack: 'BARBARIAN_LEAPATTACK',
  double_swing: 'BARBARIAN_GRUNT_SMALL',
  frenzy: 'BARBARIAN_GRUNT_LARGE',
  bash: 'BARBARIAN_GRUNT_LARGE',
  stun: 'BARBARIAN_GRUNT_LARGE',
  concentrate: 'BARBARIAN_GRUNT_LARGE',
  berserk: 'BARBARIAN_GRUNT_LARGE',
  // Amazone
  freezing_arrow: 'AMAZON_COLDARROW',
  ice_arrow: 'AMAZON_COLDARROW',
  multiple_shot: 'AMAZON_MULTI_ARROW',
  strafe: 'AMAZON_MULTI_ARROW',
  exploding_arrow: 'AMAZON_FIREARROW',
  immolation_arrow: 'AMAZON_FIREARROW',
  guided_arrow: 'AMAZON_MAGICARROW',
  power_strike: 'AMAZON_LIGHTNING',
  charged_strike: 'AMAZON_LIGHTNING',
  lightning_strike: 'AMAZON_LIGHTNING',
  lightning_fury: 'AMAZON_LIGHTNING',
  lightning_bolt: 'AMAZON_LIGHTNING',
  poison_javelin: 'AMAZON_CAST_POISON',
  plague_javelin: 'AMAZON_CAST_POISON',
  valkyrie: 'AMAZON_VALKYRIE_APPEAR',
  // Paladin
  smite: 'PALADIN_SACRIFICE',
  holy_light: 'PALADIN_AURA_HOLYLIGHT',
  holy_nova: 'PALADIN_HOLYBOLT_IMPACT',
  fist_of_the_heavens: 'PALADIN_HANDOFGOD_CAST',
  holy_shock: 'PALADIN_AURA_HOLYFIRE',
  holy_freeze: 'PALADIN_AURA_HOLYWIND',
  fanaticism: 'PALADIN_AURA_FANATACISM',
  holy_bolt: 'PALADIN_HOLYBOLT_CAST',
  holy_sword: 'PALADIN_ZEAL',
  joust: 'PALADIN_CHARGE',
  // Assassin
  fists_of_fire: 'ASSASSIN_CHARGEUP_TIGER',
  tiger_strike: 'ASSASSIN_CHARGEUP_TIGER',
  dragon_talon: 'ASSASSIN_KICK',
  dragon_claw: 'ASSASSIN_CHARGEUP_COBRA',
  cobra_strike: 'ASSASSIN_CHARGEUP_COBRA',
  claws_of_thunder: 'ASSASSIN_CHARGEUP_COBRA',
  blades_of_ice: 'ASSASSIN_CHARGEUP_COBRA',
  dragon_tail: 'ASSASSIN_KICK',
  dragon_flight: 'ASSASSIN_SHADOW_KICK',
  blade_fury: 'ASSASSIN_BLADEFURY_THROW',
  blade_shield: 'ASSASSIN_BLADESHIELD',
  cloak_of_shadows: 'ASSASSIN_CLOAKOFDARKNESS',
  burst_of_speed: 'ASSASSIN_QUICKNESS',
  shadow_warrior: 'ASSASSIN_SUMMON',
  shadow_master: 'ASSASSIN_SUMMON',
  venom: 'ASSASSIN_VENOM',
  psychic_hammer: 'ASSASSIN_PSYCHICHAMMER',
  // Nécromancien
  raise_skeleton: 'SKELETON_RAISE',
  raise_skeleton_archer: 'SKELETON_RAISE',
  skeletal_mage: 'SKELETON_RAISE',
  clay_golem: 'NECROMANCER_GOLEM_CAST',
  blood_golem: 'NECROMANCER_GOLEM_CAST',
  iron_golem: 'NECROMANCER_GOLEM_CAST',
  fire_golem: 'NECROMANCER_GOLEM_CAST',
  revive: 'NECROMANCER_REVIVE_CAST',
  corpse_explosion: 'NECROMANCER_CORPSEEXP',
  poison_nova: 'NECROMANCER_POISONNOVA',
  poison_explosion: 'NECROMANCER_POISON_CAST',
  bone_prison: 'NECROMANCER_BONE_CAST',
  bone_wall: 'NECROMANCER_BONE_CAST',
  lower_resist: 'NECROMANCER_CURSE_CAST',
  life_tap: 'NECROMANCER_REVERSEVAMPIRE',
  dim_vision: 'NECROMANCER_DIMVISION',
  iron_maiden: 'NECROMANCER_IRONMAIDEN',
};

const ELEM_CAST: Record<string, string> = { fire: 'CAST_FIRE', cold: 'CAST_COLD', light: 'CAST_LIGHTNING', poison: 'CAST_POISON' };

/** Son d'incantation d'une compétence : alias, nom de la compétence, puis son élément. Les attaques de base n'en ont pas (voir weaponSwing). */
export function castSound(has: Has, classId: string, skill: string, elem: string | undefined): string | null {
  const owner = CLASS_OWNER[classId];
  if (!owner || skill === 'attack') return null;
  const n = norm(skill);
  return first(has, [
    SKILL_SOUND[skill],
    `${owner}_${n}`,
    `${owner}_${n}_CAST`,
    `${owner}_AURA_${n}`,
    elem ? `${owner}_${ELEM_CAST[elem] ?? ''}` : null,
    elem ? `MONSTER_${ELEM_CAST[elem] ?? ''}` : null,
  ]);
}

/** Son d'impact d'un effet (`kind` = compétence ou effet de la simulation) */
export function impactSound(has: Has, classId: string, kind: string, elem: string, big: boolean): string | null {
  const owner = CLASS_OWNER[classId] ?? '';
  const n = norm(kind);
  const byElem: Record<string, string[]> = {
    fire: [big ? 'IMPACT_FIRE' : 'IMPACT_FIRE_LAYER', 'IMPACT_FIRE'],
    cold: ['IMPACT_COLD'],
    light: ['IMPACT_LIGHTNING'],
    poison: ['IMPACT_GOO'],
    magic: ['IMPACT_BLUEMOTIZE'],
    phys: [big ? 'IMPACT_BLUNT' : 'IMPACT_BLADE_SWING'],
  };
  return first(has, [`${owner}_${n}_IMPACT`, `${owner}_${n}`, ...(byElem[elem] ?? byElem.phys)]);
}

/** Type d'arme équipée → groupes de bruit d'arme (élan) et de coup */
export function weaponSounds(has: Has, type: string | undefined, twoHanded: boolean): { swing: string | null; hit: string | null } {
  const t = type ?? 'fist';
  const sw = (a: string, b?: string) => first(has, [a, b]);
  const swing =
    t === 'bow' || t === 'crossbow'
      ? sw('WEAPON_BOW')
      : t === 'claw' || t === 'fist'
        ? sw('WEAPON_PUNCH')
        : t === 'staff' || t === 'wand' || t === 'orb'
          ? sw('WEAPON_1HT', 'WEAPON_2HT')
          : twoHanded
            ? sw('WEAPON_2HS_LARGE', 'WEAPON_2HT')
            : t === 'dagger'
              ? sw('WEAPON_1HS_SMALL')
              : t === 'mace' || t === 'scepter'
                ? sw('WEAPON_1HT')
                : sw('WEAPON_1HS_LARGE');
  const hit =
    t === 'bow' || t === 'crossbow' || t === 'javelin' || t === 'thrown'
      ? first(has, ['IMPACT_ARROW'])
      : t === 'claw' || t === 'fist'
        ? first(has, ['IMPACT_CLAW'])
        : t === 'mace' || t === 'staff' || t === 'scepter' || t === 'wand' || t === 'orb'
          ? first(has, ['IMPACT_BLUNT'])
          : t === 'dagger' || t === 'spear'
            ? first(has, ['IMPACT_BLADE_THRUST'])
            : first(has, ['IMPACT_BLADE_SWING']);
  return { swing, hit };
}

/** Propriétaire des sons d'un monstre du jeu (nom de la famille dans Sounds.txt) */
export const MONSTER_OWNER: Record<string, string> = {
  hephasto: 'SMITH',
  suicide_minion: 'SUICIDEMINION',
  frozen_horror: 'FROZENHORROR',
  snowy_yeti: 'SNOWYETI',
  cantor: 'CANTOR',
  zealot: 'ZEALOT',
  frog_demon: 'FROGDEMON',
  thornhulk: 'THORNHULK',
  mosquito: 'MOSQUITO',
  bone_fetish: 'BONEFETISH',
  fetish_shaman: 'FETISHSHAMAN',
  fetish_blow: 'FETISHBLOW',
  fetish: 'FETISH',
  panther_woman: 'PANTHERWOMAN',
  slinger: 'SLINGER',
  vulture: 'VULTURE',
  sand_raider: 'SANDRAIDER',
  claw_viper: 'CLAWVIPER',
  locust: 'SWARM',
  baboon: 'BABOON',
  radament: 'RADAMENT',
  summoner: 'SUMMONER',
  quill_rat: 'QUILLRAT',
  brute: 'BRUTE',
  foul_crow: 'FOULCROW',
  arach: 'ARACH',
  izual: 'IZUAL',
  vile_mother: 'VILEMOTHER',
  regurgitator: 'REGURGITATOR',
  sand_leaper: 'SANDLEAPER',
  willowisp: 'WILLOWISP',
  bat_demon: 'BATDEMON',
  sand_maggot: 'SANDMAGGOT',
  goatman: 'GOATMAN',
  wraith: 'WRAITH',
  afflicted: 'BIGHEAD',
  ghoul_lord: 'VAMPIRE',
  blunderbore: 'BLUNDERBORE',
  minion: 'MINION',
  succubus: 'SUCCUBUS',
  succubus_witch: 'SUCCUBUSWITCH',
  putrid_defiler: 'PUTRIDDEFILER',
  imp: 'IMP',
  siege_beast: 'SIEGEBEAST',
  death_mauler: 'DEATHMAULER',
  overseer: 'OVERSEER',
  prowling_dead: 'REANIMATEDHORDE',
  dark_ranger: 'CR_ARCHER',
  dark_spearwoman: 'CR_LANCER',
  doom_knight: 'DOOMKNIGHT',
  abyss_knight: 'DOOMKNIGHT',
  balrog: 'MEGADEMON',
  flesh_beast: 'VILECHILD',
  maggot_young: 'MAGGOTBABY',
  maggot_queen: 'MAGGOTQUEEN',
  pain_worm: 'VILECHILD',
  water_watcher: 'TENTACLEHEAD',
  night_marauder: 'BABOON',
  spear_cat: 'SLINGER',
  blood_raven: 'BLOODRAVEN',
  the_smith: 'SMITH',
  fallen: 'FALLEN',
  treasure_fallen: 'FALLEN',
  fallen_shaman: 'FALLENSHAMAN',
  warped_shaman: 'FALLENSHAMAN',
  zombie: 'ZOMBIE',
  skeleton: 'SKELETON',
  skeleton_archer: 'SKELETON',
  skeleton_mage: 'SKELETON',
  burning_dead: 'SKELETON',
  griswold: 'SMITH',
  mummy: 'MUMMY',
  unraveler: 'GREATERMUMMY',
  storm_caster: 'FINGERMAGE',
  council_member: 'ZAKARUMHIGH',
  baal_hydra: 'HYDRA',
  scarab: 'BEETLE',
  duriel: 'DURIEL',
  ghoul: 'REANIMATEDHORDE',
  dark_stalker: 'COUNTESS',
  countess: 'COUNTESS',
  andariel: 'ANDARIEL',
  mephisto: 'MEPHISTO',
  hell_bovine: 'MOO',
  cow_king: 'MOO',
  minion_destruction: 'BAALMINION',
  venom_lord: 'MEGADEMON',
  oblivion_knight: 'UNDEADHORROR',
  soul_killer: 'TRAPPEDSOUL',
  blood_lord: 'BLOODLORD',
  baal: 'BAAL',
  diablo: 'DIABLO',
  pindleskin: 'UNDEADHORROR',
  dclone: 'DIABLO',
  uber_duriel: 'DURIEL',
  uber_mephisto: 'MEPHISTO',
  uber_diablo: 'DIABLO',
  uber_baal: 'BAAL',
  lilith: 'SUCCUBUS',
  uber_izual: 'IZUAL',
  eldritch: 'BAALMINION',
  shenk: 'OVERSEER',
  nihlathak: 'NIHLATHAK',
  ancient_talic: 'MEGADEMON',
  ancient_madawc: 'MEGADEMON',
  ancient_korlic: 'MEGADEMON',
  uber_talic: 'MEGADEMON',
  uber_madawc: 'MEGADEMON',
  uber_korlic: 'MEGADEMON',
  rathma: 'MEPHISTO',
  mendeln: 'ANDARIEL',
  lucion: 'BAAL',
};

export type MonsterSound = 'ATTACK' | 'HIT' | 'DEATH' | 'NEUTRAL';

export function monsterSound(has: Has, monsterId: string, kind: MonsterSound): string | null {
  const o = MONSTER_OWNER[monsterId];
  if (!o) return null;
  // la mort du Sbire de Baal a des variantes par type (DEATH_A1…D3)
  return first(has, [`${o}_${kind}`, kind === 'DEATH' ? `${o}_DEATH_A` : null]);
}

/** Bruit de dépôt d'un objet selon son type */
export function itemSound(has: Has, type: string | undefined, rune: boolean): string | null {
  const t = type ?? '';
  const byType: Record<string, string> = {
    rune: 'ITEM_RUNE',
    gem: 'ITEM_GEM',
    jewel: 'ITEM_JEWEL',
    ring: 'ITEM_RING',
    amulet: 'ITEM_AMULET',
    potion: 'ITEM_POTION',
    smallcharm: 'ITEM_CHARM',
    largecharm: 'ITEM_CHARM',
    grandcharm: 'ITEM_CHARM',
    map: 'ITEM_SCROLL',
    currency: 'ITEM_SCROLL',
    key: 'ITEM_KEY',
    sword: 'ITEM_SWORD',
    dagger: 'ITEM_SMALLMETALWEAPON',
    axe: 'ITEM_LARGEMETALWEAPON',
    mace: 'ITEM_LARGEMETALWEAPON',
    polearm: 'ITEM_LARGEMETALWEAPON',
    spear: 'ITEM_SMALLMETALWEAPON',
    scepter: 'ITEM_LARGEMETALWEAPON',
    bow: 'ITEM_BOW',
    crossbow: 'ITEM_CROSSBOW',
    javelin: 'ITEM_JAVELINS',
    thrown: 'ITEM_JAVELINS',
    staff: 'ITEM_STAFF',
    wand: 'ITEM_WAND',
    orb: 'ITEM_ORB',
    claw: 'ITEM_SMALLMETALWEAPON',
    helm: 'ITEM_HELM',
    circlet: 'ITEM_CAP',
    pelt: 'ITEM_HEAD',
    primal: 'ITEM_HEAD',
    armor: 'ITEM_PLATEARMOR',
    shield: 'ITEM_METALSHIELD',
    head: 'ITEM_HEAD',
    gloves: 'ITEM_GLOVES',
    boots: 'ITEM_BOOTS',
    belt: 'ITEM_BELT',
  };
  return first(has, [rune ? 'ITEM_RUNE' : null, byType[t], 'ITEM_FLIPPY']);
}

/** Pas du joueur : poids de l'équipement (classe) × allure × sol ; `indoor` = pierre intérieure */
export function stepSound(has: Has, classId: string, running: boolean, ground: string, town: boolean): string | null {
  const weight = classId === 'barbarian' ? 'HEAVY' : classId === 'paladin' ? 'MEDIUM' : 'LIGHT';
  const g = ground;
  const surface = town || g.includes('snow') ? 'SNOW' : /sandstone|sand/.test(g) ? 'SAND' : /crypt|flagstone|hellstone|cobble/.test(g) ? 'ISTONE' : 'DIRT';
  const gait = running ? 'RUN' : 'WALK';
  return first(has, [`${weight}_${gait}_${surface}`, `LIGHT_${gait}_${surface}`]);
}

/** Sons d'ambiance tirés au hasard dans une zone (chants d'oiseaux, gouttes, vent…) */
export const MOOD_EVENTS: Record<string, string[]> = {
  harrogath: ['EVENT_WILD_DAY'],
  tristram: ['EVENT_WILD_NIGHT'],
  cows: ['EVENT_WILD_DAY'],
  tombs: ['EVENT_TOMBS'],
  countess: ['EVENT_CRYPT'],
  andariel: ['EVENT_CATACOMBS'],
  mephisto: ['EVENT_TEMPLE'],
  chaos: ['EVENT_LAVA'],
  baal: ['EVENT_MESA', 'EVENT_ARCANE'],
  map: ['EVENT_CAVE'],
};

/** Voix de la classe quand le joueur est touché ou meurt */
export function voiceSound(has: Has, classId: string, kind: 'HIT' | 'DEATH'): string | null {
  const o = CLASS_OWNER[classId];
  return o ? first(has, [`${o}_${kind}`]) : null;
}

/** Son d'un boss qui apparaît */
export function bossTaunt(has: Has, monsterId: string): string | null {
  const o = MONSTER_OWNER[monsterId];
  return o ? first(has, [`MONSTER_${o}_TAUNT`]) : null;
}

/** Morceau de musique d'une zone (clés de tools/d2audio/music.py) ; la musique de l'Acte V n'est pas dans les archives d'origine */
export const MOOD_MUSIC: Record<string, string> = {
  harrogath: 'town4',
  pindle: 'caves',
  frozen: 'wilderness',
  vaught: 'crypt',
  arreat: 'mesa',
  tristram: 'tristram',
  cows: 'wilderness',
  tombs: 'tombs',
  countess: 'crypt',
  andariel: 'monastery',
  mephisto: 'kurastsewer',
  chaos: 'chaos',
  baal: 'sanctuary',
  map: 'mesa',
};

/** Cartes (zone « map ») : plusieurs morceaux par ambiance, l'un d'eux choisi d'après le nom de la carte */
const MAP_MUSIC: Record<string, string[]> = {
  cows: ['wilderness', 'jungle', 'desert', 'valley'],
  tombs: ['tombs', 'lair', 'sewer', 'harem', 'crypt'],
  tristram: ['tristram', 'monastery', 'crypt'],
  baal: ['sanctuary', 'mesa', 'spider', 'chaos', 'kurastsewer'],
  harrogath: ['town4', 'valley', 'town3'],
};

export function mapMusic(mood: string, name: string): string | null {
  const list = MAP_MUSIC[mood];
  if (!list) return MOOD_MUSIC[mood] ?? null;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

/** Phrase musicale jouée à la mort d'un boss (clés « st_* » de music.py) */
export const BOSS_STINGER: Record<string, string> = {
  andariel: 'st_andariel',
  mephisto: 'st_mephisto',
  nihlathak: 'st_izual',
  ancient_korlic: 'st_forge',
  shenk: 'st_den',
  duriel: 'st_horadric',
  diablo: 'st_forge',
  countess: 'st_bloodraven',
  griswold: 'st_tainted',
  baal: 'st_izual',
  cow_king: 'st_den',
};
