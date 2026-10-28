/**
 * Correspondance entre les planches du jeu (public/sprites) et les unités de Diablo II.
 * Une planche absente de cette table, ou dont l'import échoue, garde le sprite actuel du jeu.
 * Les équipements sont des choix par défaut (le jeu n'a qu'une apparence par unité) : à ajuster ici.
 */
import { DECOR_SHEETS, decorId } from './decor-tokens';
import { WAYPOINT_SHEETS, waypointSheet } from '../../src/data/d2waypoints';
export type GameAnim = 'idle' | 'walk' | 'attack' | 'cast' | 'hit' | 'death';

export interface GameActor {
  /** identifiant de la planche du jeu */
  id: string;
  kind: 'chars' | 'monsters' | 'objects';
  /** dossier D2 : classe de personnage (pa, so…) ou code de monstre (fa, zm…) */
  code: string;
  /** classe d'arme du COF ; par défaut BaseW de monstats.txt (monstres) */
  wclass?: string;
  /** code d'équipement par calque ; null = calque non dessiné ; absent = première variante (« lit » de préférence) */
  gear?: Record<string, string | null>;
  /** mode D2 par animation du jeu (défauts : nu, wl, a1, sc, gh, dt) ; false = animation absente */
  modes?: Partial<Record<GameAnim, string | false>>;
  act: number;
  /**
   * Allègement des planches lourdes (boss) : ne garde qu'une image sur `thin` pour les animations rapides
   * (≥ 17 i/s dans animdata) et pour la mort ; la cadence est divisée d'autant. Absent = toutes les images.
   */
  thin?: number;
  note?: string;
  /** objet de lumière : tous les calques sont additifs */
  additive?: boolean;
  /** pièce d'équipement exportée seule (arme main droite/gauche, bouclier) : l'ordre de dessin par rapport au torse est noté pour chaque image */
  partLayer?: 'rh' | 'lh' | 'sh';
}

const DEFAULT_MODES: Record<GameAnim, string> = { idle: 'nu', walk: 'wl', attack: 'a1', cast: 'sc', hit: 'gh', death: 'dt' };
export const modeFor = (a: GameActor, anim: GameAnim): string | null => {
  const m = a.modes?.[anim];
  return m === false ? null : (m ?? DEFAULT_MODES[anim]);
};

// le joueur se déplace à 5,2 unités/s ≈ 10,4 sous-tuiles/s : c'est la course de D2 (9), pas la marche (6)
const player = (id: string, code: string, wclass: string, gear: Record<string, string | null>): GameActor => ({
  id,
  kind: 'chars',
  code,
  wclass,
  act: 1,
  modes: { walk: 'rn' },
  gear: { hd: 'lit', tr: 'lit', lg: 'lit', ra: 'lit', la: 'lit', lh: null, sh: null, s1: 'lit', s2: 'lit', ...gear },
});
const mon = (id: string, code: string, extra: Partial<GameActor> = {}): GameActor => ({ id, kind: 'monsters', code, act: 1, ...extra });
/** Objet du décor : modes D2 nu (neutre) et op (ouvert) ; le jeu les lit comme « idle » et « attack » */
const obj = (id: string, code: string, act: number): GameActor => ({ id, kind: 'objects', code, act, modes: { idle: 'nu', attack: 'op', walk: false, cast: false, hit: false, death: false } });
/** Décor fixe tiré d'un objet D2 (image « nu » seule) : planche « prop_… » à la place du décor d'origine du jeu */
const propObj = (id: string, code: string, act: number): GameActor => ({ ...obj(id, code, act), modes: { idle: 'nu', attack: false, walk: false, cast: false, hit: false, death: false } });
const npc = (id: string, code: string): GameActor => mon(id, code, { modes: { walk: false, attack: false, cast: false, hit: false, death: false } });

/** Variante d'armure : torse, jambes, épaulières et bras du palier moyen (« med ») ou lourd (« hvy ») ; la planche de base est le palier léger */
const tiered = (base: GameActor, tier: 'med' | 'hvy'): GameActor => ({
  ...base,
  id: `${base.id}_${tier}`,
  gear: { ...base.gear, tr: tier, lg: tier, ra: tier, la: tier, s1: tier, s2: tier },
});

const CLASSES: GameActor[] = [
  // classes (16 directions)
  player('sorceress', 'so', 'stf', { rh: null }),
  player('druid', 'dz', 'hth', {}),
  player('barbarian', 'ba', '1hs', { rh: null }),
  player('paladin', 'pa', '1hs', { rh: null }),
  player('amazon', 'am', 'bow', { lh: null }),
  player('assassin', 'ai', 'ht1', { rh: null, lh: null }),
  player('necromancer', 'ne', '1hs', { rh: null }),
];

/**
 * Corps par classe d'arme (armes à deux mains, lances, bâtons, dagues) : les animations D2 dépendent de la classe d'arme du COF, une arme
 * n'a de dessin que dans « sa » classe. Id `<classe>_w<classe d'arme>`, armure de palier moyen, pièces d'arme et de casque propres (voir export-game.ts).
 */
export const WCLASS_VARIANTS: Record<string, string[]> = {
  barbarian: ['2hs', '2ht', 'stf', '1ht'],
  paladin: ['2hs', '2ht', 'stf', '1ht'],
  necromancer: ['2hs', '2ht', 'stf', '1ht'],
  amazon: ['2hs', '2ht', 'stf', '1hs', '1ht'],
  sorceress: ['1hs', '2hs', '2ht'],
};
const wvariants = (): GameActor[] =>
  CLASSES.flatMap((c) =>
    (WCLASS_VARIANTS[c.id] ?? []).map((wc) => ({
      ...tiered(c, 'med'),
      id: `${c.id}_w${wc}`,
      wclass: wc,
      thin: 2,
      gear: { ...tiered(c, 'med').gear, rh: null, lh: null, sh: null },
    })),
  );

export const GAME_ACTORS: GameActor[] = [
  ...CLASSES,
  ...wvariants(),
  // apparence de l'armure portée (palier moyen et lourd de chaque classe), choisie par l'équipement (src/render/armor-tier.ts)
  ...CLASSES.flatMap((c) => [tiered(c, 'med'), tiered(c, 'hvy')]),

  // Acte I
  mon('fallen', 'fa'),
  mon('fallen_shaman', 'fs'),
  mon('zombie', 'zm'),
  mon('skeleton_warrior', 'sk', { wclass: '1hs', gear: { rh: 'scm', sh: 'buc', s4: null, s5: null } }),
  mon('skeleton_archer', 'sk', { wclass: 'bow', gear: { lh: 'sbw', s4: null, s5: null } }),
  mon('skeleton_mage', 'sk', { wclass: 'hth', gear: { s4: 'fir', s5: 'fir' } }),
  mon('griswold', 'gz'),
  mon('dark_stalker', 'cr', { wclass: '1hs', gear: { rh: 'scm', sh: 'buc', lh: null } }),
  mon('countess', 'cr', { wclass: '1hs', gear: { hd: 'hvy', tr: 'hvy', lg: 'hvy', ra: 'hvy', la: 'hvy', s1: 'hvy', s2: 'hvy', s3: 'hvy', rh: 'lsd', sh: null, lh: null } }),
  mon('andariel', 'an', { act: 1, thin: 2 }),
  // Acte II
  mon('scarab', 'sc'),
  mon('mummy', 'mm', { act: 2, note: 'Cadavre desséché… (dossier MM)' }),
  mon('greater_mummy', 'gy', { act: 2, note: 'Démêleur (dossier GY, grande momie)' }),
  mon('duriel', 'du', { act: 2, thin: 2 }),
  // Acte III
  mon('soul_killer', 'fe'),
  mon('venom_lord', 'dm', { act: 4 }),
  mon('mephisto', 'mp', { act: 3, thin: 2 }),
  // Acte IV
  mon('oblivion_knight', 'um', { act: 4, gear: { s3: 'unh', s4: 'unh' } }),
  mon('blood_lord', 'l3', { act: 5, gear: { rh: 'axe', lh: 'axe' }, note: 'Seigneur de sang d’Acte V (Frénésie, mêlée) et non le vampire VA du même nom' }),
  mon('diablo', 'di', { act: 4, thin: 2 }),
  mon('minion_destruction', '43', { act: 5, note: 'Sbire de Baal (dossier 43) ; XX = petits démons d’Acte V' }),
  // Acte V
  mon('baal', '42', { act: 5, thin: 2 }),
  mon('hell_bovine', 'ec', { act: 1, gear: { rh: 'hal' } }),
  mon('cow_king', 'ec', { act: 1, gear: { rh: 'pax' } }),
  // boss de farm de l'Acte V (SuperUniques / MonStats d'expansion)
  mon('pindleskin', 're', { act: 5, note: 'Guerrier souillé (DefiledWarrior)' }),
  mon('eldritch', 'xx', { act: 5, note: 'Eldritch le Redresseur (Megaflow Rectifier)' }),
  mon('shenk', 'os', { act: 5, thin: 2, note: 'Shenk le Contremaître (OverSeer)' }),
  mon('nihlathak', 'xu', { act: 5 }),
  // Pandémonium : Lilith (Tentatrice infernale) et Izual (modèle 22)
  mon('lilith', '0b', { act: 4, thin: 2, note: 'Lilith (modèle de la Tentatrice infernale)' }),
  mon('uber_izual', '22', { act: 4, thin: 2, note: 'Izual' }),
  mon('ancient_talic', '0d', { act: 5, thin: 2, note: 'Ancien barbare 1' }),
  mon('ancient_madawc', '0f', { act: 5, thin: 2, note: 'Ancien barbare 2' }),
  mon('ancient_korlic', '0e', { act: 5, thin: 2, note: 'Ancien barbare 3' }),

  // invocations et formes
  mon('clay_golem', 'g1'),
  mon('blood_golem', 'g2'),
  mon('fire_golem', 'g3'),
  mon('iron_golem', 'g4'),
  // le dossier VK ne contient que des images vides (un point) : D2 dessine la Valkyrie avec le corps de l'Amazone en armure lourde
  {
    id: 'valkyrie',
    kind: 'chars',
    code: 'am',
    wclass: '2ht',
    act: 1,
    modes: { cast: false },
    gear: { hd: 'fhl', tr: 'hvy', lg: 'hvy', ra: 'hvy', la: 'hvy', s1: 'hvy', s2: 'hvy', rh: 'spr', lh: null, sh: null },
  },
  mon('wolf', 'wf'),
  mon('raven', 'hk'),
  mon('werewolf', '40'),
  mon('werebear', 'b7'),
  mon('hydra', 'hx', { modes: { walk: false, cast: false, hit: false } }),
  mon('bone_wall', 'bw'),

  // monstres de Levels.txt ajoutés (monsters-d2.ts) : planche propre à chacun (celle du jeu sert sans l'import)
  mon('hephasto', '5p', { act: 4 }),
  mon('suicide_minion', 'xy', { act: 5 }),
  mon('frozen_horror', 'f0', { act: 5 }),
  mon('snowy_yeti', 'io', { act: 5 }),
  mon('cantor', 'zp', { act: 3 }),
  mon('zealot', 'zz', { act: 3 }),
  mon('frog_demon', 'fd', { act: 3 }),
  mon('thornhulk', 'th', { act: 3 }),
  mon('mosquito', 'mo', { act: 3 }),
  mon('bone_fetish', 'fk', { act: 3 }),
  mon('fetish_shaman', 'fw', { act: 3 }),
  mon('fetish_blow', 'fc', { act: 3 }),
  mon('fetish', 'fe', { act: 3 }),
  mon('panther_woman', 'pw', { act: 2 }),
  mon('slinger', 'pw', { act: 2 }),
  mon('vulture', 'vd', { act: 2 }),
  mon('sand_raider', 'sr', { act: 2 }),
  mon('claw_viper', 'sd', { act: 2 }),
  mon('locust', 'sw', { act: 2 }),
  mon('baboon', 'bb', { act: 2 }),
  mon('radament', 'rd', { act: 2 }),
  mon('summoner', 'su', { act: 2 }),
  { ...npc('npc_warriv2', 'wx'), act: 2 },
  { ...npc('npc_ormus', 'or'), act: 3 },
  { ...npc('npc_hratli', 'hr'), act: 3 },
  { ...npc('npc_asheara', 'ah'), act: 3 },
  { ...npc('npc_alkor', 'al'), act: 3 },
  { ...npc('npc_natalya', 'tz'), act: 3 },
  { ...npc('npc_meshif3', 'm3'), act: 3 },
  { ...npc('npc_atma', 'as'), act: 2 },
  { ...npc('npc_drognan', 'dr'), act: 2 },
  { ...npc('npc_fara', 'of'), act: 2 },
  { ...npc('npc_greiz', 'gr'), act: 2 },
  { ...npc('npc_elzix', 'el'), act: 2 },
  { ...npc('npc_geglash', 'ge'), act: 2 },
  { ...npc('npc_jerhyn', 'je'), act: 2 },
  { ...npc('npc_lysander', 'ly'), act: 2 },
  { ...npc('npc_meshif', 'ms'), act: 2 },
  mon('quill_rat', 'si', { act: 1 }),
  mon('brute', 'ye', { act: 1 }),
  mon('foul_crow', 'bk', { act: 1 }),
  mon('arach', 'sp', { act: 1 }),
  { ...npc('npc_akara', 'ps'), act: 1 },
  { ...npc('npc_charsi', 'ci'), act: 1 },
  { ...npc('npc_gheed', 'gh'), act: 1 },
  { ...npc('npc_kashya', 'rc'), act: 1 },
  { ...npc('npc_warriv', 'wa'), act: 1 },
  mon('vile_mother', 'vm', { act: 4 }),
  mon('regurgitator', 'cs', { act: 4 }),
  mon('sand_leaper', 'sl', { act: 4 }),
  mon('willowisp', 'ww', { act: 4 }),
  mon('bat_demon', 'bt', { act: 4 }),
  mon('sand_maggot', 'sm', { act: 4 }),
  mon('goatman', 'gm', { act: 1 }),
  mon('wraith', 'wr', { act: 1 }),
  mon('afflicted', 'bh', { act: 1 }),
  mon('ghoul_lord', 'va', { act: 2 }),
  mon('blunderbore', 'pn', { act: 2 }),
  mon('minion', 'xx', { act: 5 }),
  mon('succubus', '0b', { act: 5 }),
  mon('succubus_witch', '0c', { act: 5 }),
  mon('putrid_defiler', '45', { act: 5 }),
  mon('imp', 'ip', { act: 5 }),
  mon('siege_beast', 'ox', { act: 5 }),
  mon('death_mauler', 'm5', { act: 5 }),
  mon('overseer', 'os', { act: 5 }),
  mon('prowling_dead', 're', { act: 5 }),
  // espèces ajoutées (lot monstres) : modèles D2 propres, repli sur la planche commune tant qu'ils ne sont pas importés
  mon('dark_ranger', 'cr', { act: 1, wclass: 'bow', gear: { lh: 'sbw', rh: null, sh: null } }),
  mon('dark_spearwoman', 'cr', { act: 1 }),
  mon('doom_knight', 'um', { act: 4 }),
  mon('abyss_knight', 'um', { act: 4 }),
  mon('balrog', 'dm', { act: 4 }),
  mon('flesh_beast', 'vc', { act: 4 }),
  mon('maggot_young', 'sb', { act: 2 }),
  mon('maggot_queen', 'mq', { act: 2 }),
  mon('pain_worm', '46', { act: 5 }),
  mon('water_watcher', 'te', { act: 3 }),
  mon('night_marauder', 'bb', { act: 3 }),
  mon('spear_cat', 'pw', { act: 2 }),
  mon('blood_raven', 'cr', { act: 1, wclass: 'bow', gear: { lh: 'sbw', rh: null, sh: null } }),
  mon('the_smith', '5p', { act: 1 }),

  // mercenaires
  mon('merc_rogue', 'rg', { wclass: 'hth', gear: { lh: 'sbw' } }),
  mon('merc_desert', 'gu', { wclass: 'hth', gear: { rh: 'spr' } }),
  mon('merc_ironwolf', 'iw', { wclass: '1hs', gear: { rh: 'lsd', sh: 'kit' } }),
  mon('merc_barbarian', '0a', { wclass: '1hs', gear: { rh: 'lsd', lh: null } }),

  // monstres qui partagent une planche du jeu (soul_killer) mais ont leur propre modèle dans D2 : planche importée
  // au nom du monstre, utilisée à la place de la planche commune tant que l'import est présent
  mon('storm_caster', 'fr', { act: 4, modes: { cast: 's1' }, note: 'Mage des tempêtes (Grand Vizir du Chaos)' }),
  mon('council_member', 'hp', { act: 3, modes: { cast: 's1' }, note: 'Membre du Conseil' }),

  // objets interactifs (data\global\objects) : planches « obj_… » (repli : la planche « prop_… » du décor) ; « idle » = fermé, « attack » = ouvert / activé
  obj('obj_chest', 'l2', 1),
  obj('obj_barrel', 'b1', 1),
  obj('obj_sarcophagus', 'mc', 2),
  obj('obj_shrine', 'sh', 1),
  // portail de ville (TP) : mode « op » = portail ouvert (boucle), « on » = ouverture
  { ...obj('obj_portal', 'tp', 1), additive: true, modes: { idle: 'on', attack: 'op', walk: false, cast: false, hit: false, death: false } },

  // portail rouge de la Chambre de la Pierre-Monde (« baals portal », dessins DC6 : « op » s'ouvre, « on » tourne) et ouverture du repaire de Duriel (« SJ »)
  { ...obj('obj_portal_red', '4x', 5), additive: true, modes: { idle: 'on', attack: 'op', walk: false, cast: false, hit: false, death: false } },
  { ...obj('obj_lair_door', 'sj', 2), modes: { idle: 'nu', attack: 'op', walk: false, cast: false, hit: false, death: false } },

  // points de passage (lot 314) : leur dessin (la dalle est dans les tuiles en Acte I), « nu » = éteint, « on » = allumé (boucle) ; une planche par jeton d'objects.txt (src/data/d2waypoints.ts)
  ...WAYPOINT_SHEETS.map(({ token, act }) => ({ ...obj(waypointSheet(token, act), token, act), modes: { idle: 'nu', attack: 'on', walk: false, cast: false, hit: false, death: false } }) as GameActor),

  // décors fixes sans tuile D2 : objets de data\global\objects (tonneau, caisse, bougies, urne, piles de crânes et d'os, râtelier)
  propObj('prop_barrel', 'b1', 1),
  propObj('prop_crates', 'ct', 1),
  propObj('prop_candles', 'a1', 1),
  propObj('prop_tomb_urn', 'u1', 2),
  propObj('prop_skull', 'is', 4),
  propObj('prop_bones', 'ib', 4),
  propObj('prop_weaponrack_prop', 'w1', 1),

  // décor posé des cartes DS1 (decor.ts) : une planche par jeton et par acte
  ...DECOR_SHEETS.map(({ token, act }) => propObj(decorId(token, act), token, act)),

  // PNJ
  npc('npc_anya', 'xs'),
  // PNJ de la Forteresse du Pandémonium
  { ...npc('npc_jamella', 'ja'), act: 4 },
  { ...npc('npc_halbu', '20'), act: 4 },
  { ...npc('npc_tyrael', 'ty'), act: 4 },
  { ...npc('npc_cain', 'dc'), act: 4 },
  npc('npc_larzuk', 'xr'),
  npc('npc_malah', 'xt'),
  npc('npc_qual_kehk', 'xv'),
];
