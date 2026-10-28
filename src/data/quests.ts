// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de Diablo II (hors licence MIT) : voir LICENSE-DATA.md et docs/DERIVED-DATA.md.
/**
 * Les 27 quêtes de Diablo II (6 / 6 / 6 / 3 / 6), suivies par le jeu, récompense accordée une fois par difficulté.
 * Objectifs : zone nettoyée, monstre tué (tous ceux de son genre avec `all`), run terminée, zone atteinte, ou événement de quête
 * (`event` : objet trouvé, rapporté au PNJ ou utilisé sur un objet du monde ; voir `Game.useQuestObject` et `Game.talkTo`).
 * Récompenses d'origine (D2 1.13 / PD2) : points de compétence (Antre du Mal 1, Radament 1, Izual 2 : 4 par difficulté), caractéristiques
 * (Lam Esen 5), Potion de vie (+20 vie), parchemin de résistance (+10 % aux résistances, Prison de glace), imprégnation (Outils du métier),
 * châsses de Larzuk (Siège d'Harrogath, règles PD2), runes Ral, Ort, Tal (Sauvetage sur le mont Arreat), Forge infernale (une rune selon
 * la difficulté, une gemme parfaite, deux sans défaut, une normale), anneau rare corrompu (Gidbinn, PD2), mercenaire offert (Kashya, Asheara, Qual-Kehk).
 */

type QuestGoal =
  | { kind: 'clear' }
  | { kind: 'kill'; monster?: string; name?: string; /** tous les monstres de ce genre dans la zone */ all?: boolean }
  | { kind: 'run'; runs: string[] }
  | { kind: 'enter' }
  | { kind: 'event' };

interface QuestReward {
  skillPoints?: number;
  statPoints?: number;
  /** runes offertes (toutes difficultés) */
  runes?: string[];
  /** Charsi imprègne un objet (une fois par difficulté) */
  imbue?: boolean;
  /** Larzuk perce un objet (une fois par difficulté) */
  socket?: boolean;
  /** vie maximale permanente (Potion de vie) */
  life?: number;
  /** résistances permanentes (parchemin de résistance) */
  resAll?: number;
  /** prochain mercenaire de cet acte offert */
  freeMerc?: 'act1' | 'act3' | 'act5';
  /** anneau rare corrompu (Gidbinn, PD2) */
  ring?: boolean;
  /** Forge infernale : une rune tirée dans la plage de la difficulté, une gemme parfaite, deux sans défaut, une normale */
  hellforge?: boolean;
}

export interface QuestDef {
  id: string;
  act: 'act1' | 'act2' | 'act3' | 'act4' | 'act5';
  name: string;
  desc: string;
  /** zone où se joue l'objectif */
  zone: string;
  /** autres zones où l'objectif compte (run de farm qui reprend la zone) */
  zones?: string[];
  goal: QuestGoal;
  reward?: QuestReward;
  /** récompense en clair (panneau des quêtes) */
  rewardText?: string;
  /** PNJ qui parle de la quête (identifiant de PNJ) et ses phrases : en cours, accomplie */
  giver?: string;
  say?: [string, string];
}

export const QUESTS: QuestDef[] = [
  // ---- Acte I
  {
    id: 'den',
    act: 'act1',
    name: "L'Antre du Mal",
    desc: "Nettoyez l'Antre du Mal, dans la Blood Moor.",
    zone: 'a1_den',
    goal: { kind: 'clear' },
    reward: { skillPoints: 1 },
    rewardText: '+1 point de compétence',
    giver: 'akara',
    say: ["« L'Antre du Mal grouille de monstres au nord de la Blood Moor : nettoyez-le, vous gagnerez en puissance. »", '« Bien joué ! Vous voilà plus fort. »'],
  },
  {
    id: 'raven',
    act: 'act1',
    name: 'Le Cimetière des Sœurs',
    desc: 'Tuez Blood Raven au cimetière de la Terre des sépultures.',
    zone: 'a1_burial',
    goal: { kind: 'kill', name: 'Blood Raven' },
    reward: { freeMerc: 'act1' },
    rewardText: 'Kashya offre une Rôdeuse',
    giver: 'kashya',
    say: ["« Blood Raven, jadis l'une des nôtres, hante le cimetière de la Terre des sépultures : libérez son âme. »", '« Elle repose enfin en paix. Une de mes Rôdeuses vous suivra sans solde. »'],
  },
  {
    id: 'cain',
    act: 'act1',
    name: 'À la recherche de Cain',
    desc: 'Délivrez Deckard Cain à Tristram.',
    zone: 'a1_tristram',
    goal: { kind: 'run', runs: ['tristram', 'a1_tristram'] },
    giver: 'akara',
    say: ['« Cain a disparu. Cherchez les pierres de la Stony Field : elles mènent à Tristram. »', '« Cain est sauf grâce à vous. »'],
  },
  {
    id: 'tower',
    act: 'act1',
    name: 'La Tour oubliée',
    desc: 'Tuez la Comtesse au fond des caves de la tour.',
    zone: 'a1_countess',
    goal: { kind: 'run', runs: ['countess', 'a1_countess'] },
    rewardText: 'les runes de la Comtesse',
    giver: 'akara',
    say: ["« La Comtesse s'est retranchée dans les caves de la Tour oubliée. Abattez-la. »", '« Les runes de la Comtesse sont à vous. »'],
  },
  {
    id: 'malus',
    act: 'act1',
    name: 'Les Outils du métier',
    desc: 'Rapportez à Charsi le Malus horadrique, resté dans les Casernes du monastère.',
    zone: 'a1_barracks',
    goal: { kind: 'event' },
    reward: { imbue: true },
    rewardText: 'Charsi imprègne un objet normal',
    giver: 'charsi',
    say: [
      "« En fuyant le monastère, j'ai laissé mon marteau enchanté, le Malus horadrique, dans les Casernes. Rapportez-le-moi et je renforcerai votre équipement. »",
      '« Mon Malus ! Donnez-moi un objet normal sans châsse : je le forgerai en objet rare. »',
    ],
  },
  {
    id: 'andariel',
    act: 'act1',
    name: "Les Sœurs à l'abattoir",
    desc: 'Tuez Andariel au fond des catacombes.',
    zone: 'a1_andariel',
    goal: { kind: 'run', runs: ['andariel', 'a1_andariel'] },
    rewardText: "la route de l'Acte II",
    giver: 'kashya',
    say: ['« Andariel règne au fond des catacombes. Mettez fin à son règne. »', "« Andariel n'est plus : la route de l'est est ouverte. »"],
  },
  // ---- Acte II
  {
    id: 'radament',
    act: 'act2',
    name: 'La Tanière de Radament',
    desc: 'Tuez Radament au fond des égouts de Lut Gholein et lisez son Livre de compétence.',
    zone: 'a2_sewer3',
    goal: { kind: 'kill', monster: 'radament' },
    reward: { skillPoints: 1 },
    rewardText: '+1 point de compétence',
    giver: 'atma',
    say: ['« Radament sème la mort dans nos égouts : faites-le taire. »', '« Merci : cette bête hantait nos nuits. »'],
  },
  {
    id: 'staff',
    act: 'act2',
    name: 'Le Bâton horadrique',
    desc: 'Réunissez le Bâton des Rois (Repaire des vers, niveau 3) et l’Amulette de la Vipère, assemblez le Bâton horadrique dans le Cube et placez-le dans l’orifice du vrai tombeau de Tal Rasha.',
    zone: 'a2_maggot3',
    goal: { kind: 'event' },
    rewardText: "l'accès à la chambre de Tal Rasha",
    giver: 'cain2',
    say: [
      '« Le Bâton horadrique a été brisé : le Bâton des Rois repose dans le Repaire des vers, sa tête dans le Temple des Vipères. Le Cube les réunira. »',
      '« Le Bâton est en place : la chambre de Tal Rasha s’ouvre. »',
    ],
  },
  {
    id: 'tainted',
    act: 'act2',
    name: 'Le Soleil terni',
    desc: 'Détruisez l’autel du serpent au Temple des Vipères, niveau 2.',
    zone: 'a2_viper2',
    goal: { kind: 'event' },
    rewardText: 'l’Amulette de la Vipère',
    giver: 'drognan',
    say: ['« Cette éclipse est l’œuvre des Vipères griffues : trouvez leur temple sous la Vallée des serpents. »', '« Le soleil brille de nouveau sur Lut Gholein. »'],
  },
  {
    id: 'arcane',
    act: 'act2',
    name: 'Le Sanctuaire des arcanes',
    desc: 'Trouvez le Sanctuaire des arcanes, sous le palais de Jerhyn.',
    zone: 'a2_arcane',
    goal: { kind: 'enter' },
    giver: 'jerhyn',
    say: ['« Le palais cache le passage vers le Sanctuaire des arcanes d’Horazon. »', '« Vous avez trouvé le Sanctuaire des arcanes. »'],
  },
  {
    id: 'summoner',
    act: 'act2',
    name: "L'Invocateur",
    desc: "Tuez l'Invocateur dans le Sanctuaire des arcanes.",
    zone: 'a2_arcane',
    goal: { kind: 'kill', monster: 'summoner' },
    giver: 'drognan',
    say: ["« L'Invocateur se cache dans le Sanctuaire des arcanes, au-delà du palais. »", '« Le Sanctuaire est libéré de son maître. »'],
  },
  {
    id: 'duriel',
    act: 'act2',
    name: 'Les Sept Tombeaux',
    desc: 'Tuez Duriel dans les Tombeaux de Tal Rasha.',
    zone: 'a2_tomb1',
    goal: { kind: 'run', runs: ['tombs', 'a2_tomb1', 'a2_tomb2', 'a2_tomb3', 'a2_tomb4', 'a2_tomb5', 'a2_tomb6', 'a2_tomb7'] },
    rewardText: "la route de l'Acte III",
    giver: 'jerhyn',
    say: ["« Tal Rasha repose dans l'un des sept tombeaux ; Duriel le garde. »", '« Duriel est tombé : la ville vous en sera reconnaissante. »'],
  },
  // ---- Acte III
  {
    id: 'golden_bird',
    act: 'act3',
    name: "L'Oiseau d'or",
    desc: 'Le premier champion ou unique tué dans l’Acte III porte une figurine de jade : montrez-la à Meshif, puis portez l’Oiseau d’or à Alkor.',
    zone: 'a3_spider',
    goal: { kind: 'event' },
    reward: { life: 20 },
    rewardText: 'Potion de vie (+20 vie)',
    giver: 'cain3',
    say: ['« Des marchands parlent d’une figurine de jade dans la jungle. Meshif saura en dire plus. »', '« La Potion de vie d’Alkor coule désormais dans vos veines. »'],
  },
  {
    id: 'gidbinn',
    act: 'act3',
    name: "La Lame de l'ancienne religion",
    desc: 'Trouvez le Gidbinn sur son autel de la Jungle des Écorcheurs et rapportez-le à Ormus.',
    zone: 'a3_jungle',
    goal: { kind: 'event' },
    reward: { ring: true, freeMerc: 'act3' },
    rewardText: 'anneau rare corrompu, mercenaire offert',
    giver: 'hratli',
    say: ['« L’enchantement du port faiblit. Seul le Gidbinn, une lame sacrée de la Jungle des Écorcheurs, peut le raviver. »', '« Le Gidbinn protège de nouveau le port. »'],
  },
  {
    id: 'khalim',
    act: 'act3',
    name: 'La Volonté de Khalim',
    desc: 'Réunissez l’Œil (Caverne des araignées), le Cerveau (Donjon des Écorcheurs, niveau 3), le Cœur (Égouts de Kurast, niveau 2) et le Fléau (Haut Conseil) de Khalim, forgez sa Volonté dans le Cube et brisez l’Orbe de contrainte du Travincal.',
    zone: 'a3_travincal',
    goal: { kind: 'event' },
    rewardText: 'l’accès à la Durance de la Haine',
    giver: 'cain3',
    say: ['« Seule la Volonté de Khalim peut briser l’Orbe de contrainte qui scelle la Durance de la Haine. »', '« L’Orbe est brisé : la Durance de la Haine vous est ouverte. »'],
  },
  {
    id: 'lam_esen',
    act: 'act3',
    name: 'Le Grimoire de Lam Esen',
    desc: 'Trouvez le Grimoire de Lam Esen dans le Temple en ruine et rapportez-le à Alkor.',
    zone: 'a3_temple1',
    goal: { kind: 'event' },
    reward: { statPoints: 5 },
    rewardText: '+5 points de caractéristiques',
    giver: 'alkor',
    say: ['« Un livre très particulier, écrit par le sage Lam Esen, dort dans l’un des temples de Kurast. Rapportez-le-moi. »', '« Le livre noir… votre esprit s’en trouve grandi. »'],
  },
  {
    id: 'council',
    act: 'act3',
    name: 'Le Temple noirci',
    desc: 'Tuez le Haut Conseil de Zakarum au Travincal.',
    zone: 'a3_travincal',
    goal: { kind: 'kill', monster: 'council_member', all: true },
    rewardText: 'le Fléau de Khalim',
    giver: 'ormus',
    say: ['« Le Haut Conseil de Zakarum s’est livré à Mephisto. Détruisez-le au Travincal. »', '« Le Conseil n’est plus. »'],
  },
  {
    id: 'mephisto',
    act: 'act3',
    name: 'Le Gardien',
    desc: 'Tuez Mephisto au fond de la Durance de la Haine.',
    zone: 'a3_durance3',
    goal: { kind: 'run', runs: ['mephisto', 'a3_durance3'] },
    rewardText: "la route de l'Acte IV",
    giver: 'natalya',
    say: ['« Mephisto attend au fond de la Durance de la Haine. »', '« Un des Maux Primordiaux a été terrassé. »'],
  },
  // ---- Acte IV
  {
    id: 'izual',
    act: 'act4',
    name: "L'Ange déchu",
    desc: 'Tuez Izual, enchaîné dans les Plaines du désespoir.',
    zone: 'a4_plains',
    goal: { kind: 'kill', monster: 'izual' },
    reward: { skillPoints: 2 },
    rewardText: '+2 points de compétence',
    giver: 'tyrael',
    say: ['« Izual, jadis mon lieutenant, souffre dans les Plaines du désespoir. Libérez-le. »', '« Son âme repose, grâce à vous. »'],
  },
  {
    id: 'forge',
    act: 'act4',
    name: 'La Forge infernale',
    desc: 'Prenez le marteau d’Héphasto le Forgeron et brisez la Pierre d’âme de Mephisto sur la Forge infernale.',
    zone: 'a4_river',
    zones: ['river'],
    goal: { kind: 'event' },
    reward: { hellforge: true },
    rewardText: 'une rune et quatre gemmes',
    giver: 'cain',
    say: ['« Portez la Pierre d’âme de Mephisto à la Forge infernale et frappez-la avec le marteau d’Héphasto. »', '« La Pierre d’âme est détruite : Mephisto ne reviendra plus. »'],
  },
  {
    id: 'diablo',
    act: 'act4',
    name: 'La Fin de la terreur',
    desc: 'Tuez Diablo dans le Sanctuaire du Chaos.',
    zone: 'a4_chaos',
    goal: { kind: 'run', runs: ['chaos', 'a4_chaos'] },
    rewardText: "la route de l'Acte V",
    giver: 'tyrael',
    say: ['« Brisez les cinq sceaux et affrontez Diablo dans le Sanctuaire du Chaos. »', '« Le Seigneur de la Terreur est vaincu. »'],
  },
  // ---- Acte V
  {
    id: 'siege',
    act: 'act5',
    name: "Le Siège d'Harrogath",
    desc: 'Tuez Shenk le Contremaître dans les Bloody Foothills.',
    zone: 'a5_foothills',
    zones: ['eldritch'],
    goal: { kind: 'kill', monster: 'shenk' },
    reward: { socket: true },
    rewardText: 'Larzuk perce un objet',
    giver: 'larzuk',
    say: ['« Shenk le Contremaître dirige le siège depuis les Bloody Foothills. Tuez-le et je percerai l’objet de votre choix. »', '« Le siège est levé ! Montrez-moi l’objet à percer. »'],
  },
  {
    id: 'rescue',
    act: 'act5',
    name: 'Sauvetage sur le mont Arreat',
    desc: 'Libérez les soldats de Qual-Kehk, prisonniers dans les Hautes terres rigides.',
    zone: 'a5_highlands',
    goal: { kind: 'event' },
    // lot 321 (audit 3.7): Diablo II's Qual-Kehk also offers a Barbarian mercenary
    reward: { runes: ['r08', 'r09', 'r07'], freeMerc: 'act5' },
    rewardText: 'runes Ral, Ort et Tal, un mercenaire barbare offert',
    giver: 'qual_kehk',
    say: ['« Mes hommes ont été faits prisonniers sur le champ de bataille des Hautes terres. Libérez-les. »', '« Mes hommes sont libres. Prenez ces runes, et placez-les dans le bon ordre. »'],
  },
  {
    id: 'anya',
    act: 'act5',
    name: 'La Prison de glace',
    desc: 'Délivrez Anya, prisonnière de la glace au bord de la Rivière gelée.',
    zone: 'a5_river',
    goal: { kind: 'event' },
    reward: { resAll: 10 },
    rewardText: 'parchemin de résistance (+10 % aux résistances)',
    giver: 'malah',
    say: [
      '« Anya, la jeune alchimiste, a disparu. Nihlathak l’a emprisonnée, j’en suis sûre. Cherchez-la sous le Passage cristallin. »',
      '« Anya est sauve ! Prenez ce parchemin : il vous protégera des éléments. »',
    ],
  },
  {
    id: 'nihlathak',
    act: 'act5',
    name: "La Trahison d'Harrogath",
    desc: 'Tuez Nihlathak au fond des Halls de Vaught.',
    zone: 'a5_vaught',
    goal: { kind: 'run', runs: ['nihlathak', 'a5_vaught'] },
    giver: 'anya',
    say: ['« Nihlathak a trahi Harrogath : châtiez-le dans ses Halls. »', '« Justice est rendue. »'],
  },
  {
    id: 'ancients',
    act: 'act5',
    name: 'Le Rite de passage',
    desc: "Vainquez les trois Anciens au Sommet d'Arreat.",
    zone: 'a5_summit',
    goal: { kind: 'run', runs: ['ancients', 'a5_summit'] },
    giver: 'qual_kehk',
    say: ["« Les trois Anciens gardent le Sommet d'Arreat. »", '« Les Anciens ont rendu les armes. »'],
  },
  {
    id: 'baal',
    act: 'act5',
    name: 'La Veille de la destruction',
    desc: 'Tuez Baal dans la Chambre de la Pierre-Monde.',
    zone: 'a5_throne',
    goal: { kind: 'run', runs: ['baal', 'a5_throne'] },
    rewardText: 'la difficulté suivante',
    giver: 'qual_kehk',
    say: ['« Baal est la dernière épreuve : le Trône de la Destruction. »', '« Le monde est sauvé. »'],
  },
];

export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

/** Objets de quête (inventaire) */
export const QUEST_ITEMS: { id: string; name: string; quest: string }[] = [
  { id: 'horadric_malus', name: 'Malus horadrique', quest: 'malus' },
  { id: 'staff_of_kings', name: 'Bâton des Rois', quest: 'staff' },
  { id: 'viper_amulet', name: 'Amulette de la Vipère', quest: 'staff' },
  { id: 'horadric_staff', name: 'Bâton horadrique', quest: 'staff' },
  { id: 'jade_figurine', name: 'Figurine de jade', quest: 'golden_bird' },
  { id: 'golden_bird', name: 'L’Oiseau d’or', quest: 'golden_bird' },
  { id: 'gidbinn', name: 'Le Gidbinn', quest: 'gidbinn' },
  { id: 'khalim_eye', name: 'Œil de Khalim', quest: 'khalim' },
  { id: 'khalim_brain', name: 'Cerveau de Khalim', quest: 'khalim' },
  { id: 'khalim_heart', name: 'Cœur de Khalim', quest: 'khalim' },
  { id: 'khalim_flail', name: 'Fléau de Khalim', quest: 'khalim' },
  { id: 'khalim_will', name: 'Volonté de Khalim', quest: 'khalim' },
  { id: 'lam_esen_tome', name: 'Grimoire de Lam Esen', quest: 'lam_esen' },
  { id: 'hellforge_hammer', name: 'Marteau de la Forge infernale', quest: 'forge' },
  // lot 319: Diablo II's Scroll of Inifuss (the Tree of Inifuss, Dark Wood), deciphered by Akara into the Key to the Cairn Stones
  { id: 'inifuss_scroll', name: 'Parchemin d’Inifuss', quest: 'cain' },
  { id: 'cairn_key', name: 'Clé des Pierres de Cairn', quest: 'cain' },
  // Jambe de Wirt (Tristram de campagne) : avec un Tome de portail, le Cube ouvre le niveau des Vaches
  { id: 'wirts_leg', name: 'Jambe de Wirt', quest: '' },
];
export const QUEST_ITEM_IDS = new Set(QUEST_ITEMS.map((q) => q.id));

/**
 * Objets du monde liés aux quêtes. Les DS1 en posent certains (Malus des Casernes, Grimoire du Temple en ruine,
 * journal du Sanctuaire des arcanes, orifice des Tombeaux, Forge infernale, coffres dorés de Khalim, dépouille de Wirt) ; à défaut, ils se posent au bout de la zone.
 */
export interface QuestObjectDef {
  /** genre (worldobjects.ts : q_… / qchest_…) */
  id: string;
  /** zone ; « a2_tomb » = le vrai tombeau de Tal Rasha */
  zone: string;
  label: string;
  /** objet de quête obtenu en l'ouvrant */
  gives?: string;
  /** objet de quête consommé (orifice, Orbe, Forge) */
  needs?: string;
  quest: string;
  /** nombre d'exemplaires (cages des prisonniers) */
  count?: number;
  /** emplacement de monstre du DS1 (monpreset) où le poser : Orbe de contrainte, Frozenstein (Anya), barbares prisonniers */
  preset?: string;
}

export const QUEST_OBJECTS: QuestObjectDef[] = [
  { id: 'q_malus', zone: 'a1_barracks', label: 'Malus horadrique', gives: 'horadric_malus', quest: 'malus' },
  // lot 319: the Tree of Inifuss (its DS1 object in the Dark Wood) gives the scroll that leads to the Cairn Stones
  { id: 'q_inifuss', zone: 'a1_darkwood', label: 'Arbre d’Inifuss', gives: 'inifuss_scroll', quest: 'cain' },
  { id: 'q_wirt', zone: 'a1_tristram', label: 'Dépouille de Wirt', gives: 'wirts_leg', quest: '' },
  { id: 'qchest_staff', zone: 'a2_maggot3', label: 'Coffre doré', gives: 'staff_of_kings', quest: 'staff' },
  { id: 'q_viper_altar', zone: 'a2_viper2', label: 'Autel du serpent', gives: 'viper_amulet', quest: 'tainted' },
  { id: 'q_orifice', zone: 'a2_tomb', label: 'Orifice', needs: 'horadric_staff', quest: 'staff' },
  { id: 'q_journal', zone: 'a2_arcane', label: 'Journal d’Horazon', quest: 'summoner' },
  { id: 'q_gidbinn', zone: 'a3_jungle', label: 'Autel du Gidbinn', gives: 'gidbinn', quest: 'gidbinn' },
  { id: 'qchest_eye', zone: 'a3_cave2', label: 'Coffre doré', gives: 'khalim_eye', quest: 'khalim' },
  { id: 'qchest_brain', zone: 'a3_flayer3', label: 'Coffre doré', gives: 'khalim_brain', quest: 'khalim' },
  { id: 'qchest_heart', zone: 'a3_sewer2', label: 'Coffre doré', gives: 'khalim_heart', quest: 'khalim' },
  { id: 'q_lam_esen', zone: 'a3_temple1', label: 'Grimoire de Lam Esen', gives: 'lam_esen_tome', quest: 'lam_esen' },
  { id: 'q_compelling_orb', zone: 'a3_travincal', label: 'Orbe de contrainte', needs: 'khalim_will', quest: 'khalim', preset: 'compellingorb' },
  { id: 'q_hellforge', zone: 'a4_river', label: 'Forge infernale', needs: 'hellforge_hammer', quest: 'forge' },
  { id: 'q_hellforge', zone: 'river', label: 'Forge infernale', needs: 'hellforge_hammer', quest: 'forge' },
  { id: 'q_prison', zone: 'a5_highlands', label: 'Cage des prisonniers', quest: 'rescue', count: 3, preset: 'act5barb1' },
  { id: 'q_anya', zone: 'a5_river', label: 'Anya, prisonnière de la glace', quest: 'anya', preset: 'frozenstein' },
];

/** Plages de runes de la Forge infernale (D2 : 1 chance sur 11 chacune) : El–Amn, Sol–Um, Hel–Gul */
export const HELLFORGE_RUNES: [number, number][] = [
  [1, 11],
  [12, 22],
  [15, 25],
];

/** Boss dont la quête ouvre chaque acte (D2 : on ne voyage vers l'acte suivant qu'après sa mort, à chaque difficulté) */
export const ACT_GATE: Record<string, string> = { act2: 'andariel', act3: 'duriel', act4: 'mephisto', act5: 'diablo' };

/**
 * Lot 319: Diablo II's quest locks on the Campaign's passages. The passage from `from` to `to` stays shut until `quest` is done at that
 * difficulty (or the lock was opened otherwise: the Cairn Stones by their key). `hint`: what the hero is told at the shut passage. Every
 * lock is lifted by playing: its quest is reachable without passing it.
 */
export interface QuestLockDef {
  id: string;
  /** zone the passage is in (`a2_tomb`: any tomb of the Canyon, the true one holding the door) */
  from: string;
  /** zone behind it (`chamber`: the true tomb's door to Duriel's Lair) */
  to: string;
  quest: string;
  hint: string;
}

export const QUEST_LOCKS: QuestLockDef[] = [
  {
    id: 'cairn',
    from: 'a1_stonyfield',
    to: 'a1_tristram',
    quest: 'cain',
    hint: 'Pierres de Cairn inertes : portez à Akara le parchemin de l’Arbre d’Inifuss (Bois sombre).',
  },
  { id: 'palace', from: 'a2_town', to: 'a2_harem1', quest: 'tainted', hint: 'Les gardes de Jerhyn barrent le palais : levez d’abord l’éclipse (Temple des Vipères).' },
  // lot 320: the Canyon of the Magi is reached by the Summoner's portal (`QUEST_PORTALS`), no longer from the Valley of Snakes
  {
    id: 'canyon',
    from: 'a2_arcane',
    to: 'a2_canyon',
    quest: 'summoner',
    hint: 'Le Canyon des Mages reste introuvable : seul l’Invocateur en connaît le chemin.',
  },
  { id: 'chamber', from: 'a2_tomb', to: 'chamber', quest: 'staff', hint: 'La porte est scellée. Placez le Bâton horadrique dans l’orifice.' },
  {
    id: 'durance',
    from: 'a3_travincal',
    to: 'a3_durance1',
    quest: 'khalim',
    hint: 'La Durance est scellée : brisez l’Orbe de contrainte avec la Volonté de Khalim.',
  },
  // lot 320: Nihlathak's Temple is reached by Anya's portal in Harrogath (`QUEST_PORTALS`), no longer from the Frigid Highlands
  { id: 'temple', from: 'harrogath', to: 'a5_temple', quest: 'anya', hint: 'Le Temple de Nihlathak est fermé : délivrez d’abord Anya de la glace.' },
  {
    id: 'keep',
    from: 'a5_summit',
    to: 'a5_keep1',
    quest: 'ancients',
    hint: 'Les Anciens gardent le Donjon de la Pierre-Monde : affrontez-les au Sommet d’Arreat.',
  },
];

/**
 * Lot 320: Diablo II's red portals that a quest opens where it ends (audit 2.9, 2.16): the Summoner's to the Canyon of the Magi, by his
 * platform in the Arcane Sanctuary, and Anya's to Nihlathak's Temple, beside her in Harrogath once she is freed. Not drawn before (the
 * zone has no such exit); opened in front of the hero when the quest is done there, found again at each visit after it
 * (src/sim/game.ts, `questPortals`). `near`: where it stands (the spawn of a zone's monster, or an NPC of the town).
 */
export interface QuestPortalDef {
  /** the zone it opens in (its zone id: Harrogath's for the act's town) */
  zone: string;
  to: string;
  quest: string;
  near: { monster: string } | { npc: string };
  label: string;
  /** what the hero is told when it opens in front of him */
  opened: string;
}

export const QUEST_PORTALS: QuestPortalDef[] = [
  {
    zone: 'a2_arcane',
    to: 'a2_canyon',
    quest: 'summoner',
    near: { monster: 'summoner' },
    label: 'Portail vers le Canyon des Mages',
    opened: 'Le journal d’Horazon ouvre un portail vers le Canyon des Mages.',
  },
  {
    zone: 'harrogath',
    to: 'a5_temple',
    quest: 'anya',
    near: { npc: 'anya' },
    label: 'Portail vers le Temple de Nihlathak',
    opened: 'Anya ouvre un portail vers le Temple de Nihlathak.',
  },
];

/**
 * Lot 319: Diablo II's transporters, by NPC: the act each one takes the hero to (Warriv: Act I → II and back, Meshif: Act II → III and
 * back, Tyrael: Act IV → V). Act III → IV: Mephisto's red portal. The way on opens with the act's gate (`ACT_GATE`); the way back is open.
 * `line`: what the NPC says while the way is shut.
 */
export const TRAVELERS: Record<string, { to: string; line: string }> = {
  warriv: { to: 'act2', line: 'Warriv : « La route de l’est reste fermée tant qu’Andariel règne sur le monastère. »' },
  warriv2: { to: 'act1', line: 'Warriv : « Je peux vous ramener au Camp des Rôdeuses. »' },
  meshif: { to: 'act3', line: 'Meshif : « Mon navire vous mènera à l’est, une fois Duriel vaincu. »' },
  meshif3: { to: 'act2', line: 'Meshif : « Je peux vous ramener à Lut Gholein. »' },
  tyrael: { to: 'act5', line: 'Tyrael : « Diablo attend dans le Sanctuaire du Chaos. Brisez les cinq sceaux. »' },
};
