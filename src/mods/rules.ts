/**
 * Règles nommées remplaçables (plan, §2.4 (2)) : un point de règle du jeu a une implémentation de la base, qu'un mod REMPLACE (un seul
 * propriétaire, pas d'abonnés) en recevant l'implémentation précédente pour pouvoir la composer :
 * `api.rules.set('skills.hardValue', (base) => (id, table, hard) => …)`. Deux mods qui remplacent la même règle sont en conflit, sauf
 * `override` ; après le gel (fin de l'activation), plus aucun remplacement. Le jeu appelle la règle par une fonction d'accès exportée par le
 * module qui la porte (ex. `skillHard`, data/skills.ts), qui lit l'implémentation courante : aucun « contexte de règles » à passer.
 * Une règle de la base peut être inerte (aucune carte dans la base : `maps.*` ne font rien ou refusent) : elle marque le point où un mod
 * branche un système entier (cartes d'endgame du mod pd2, lot M5b).
 * Les règles de la base sont celles de Diablo II LoD 1.13c (`src/mods/d2/` : formules et constantes des MPQ, lot M8).
 * Module feuille (types, et les règles de la base, elles-mêmes feuilles).
 */
import type { Rng } from '../core/rng';
import type { CubeEffect } from '../data/cube';
import type { MapZoneDef } from '../data/maps';
import type { ItemBase, MonsterDef, StatRoll } from '../data/types';
import type { MapZoneOptions, ZoneDef } from '../data/zone-types';
import type { DamagePacket, Monster, Player } from '../sim/actors';
import type { Item, Quality } from '../sim/item';
import type { World } from '../sim/world';
import type { CharacterState } from '../sim/character-state';
import type { GambleEntry, Game, VendorEntry } from '../sim/game';
import type { DerivedStats } from '../sim/derived';
import type { CubeResult, MapOp, MapOpCheck, MapRef, MergeOpts, MergePreview, MergeResult } from '../sim/cube';
import type { DropContext } from '../sim/loot/drops';
import type { QualityBonus } from '../sim/loot/itemgen';
import type { Rates } from '../data/rates';
import * as D2C from './d2/combat';
import * as D2M from './d2/mercs';
import * as D2P from './d2/character';
import * as D2X from './d2/progression';
import * as D2K from './d2/cube';
import * as D2S from './d2/skills';
import * as D2B from './d2/bots';
import { baseCatalogValue } from '../data/items/loot-value';
import { D2_SKILL_TREE } from '../data/skills-d2';

/** Compétence de Diablo II par ligne de Skills.txt */
const D2_SKILL_BY_INDEX = new Map(D2_SKILL_TREE.map((s) => [s.d2Id, s.id]));

/** Modificateur de monde (`World.mapMods`) */
export interface WorldMod {
  id: string;
  value: number;
}

/** Ouverture d'une carte : zone construite, niveau de zone, modificateurs de monde, message d'ouverture (événement, carte unique) */
export interface MapLaunch {
  zone: ZoneDef;
  zoneLevel: number;
  mods: WorldMod[];
  message?: string;
}

/** Issue d'une recette de carte (Cube, coffre de cartes) */
export interface MapRecipeResult {
  ok: boolean;
  reason?: string;
  item?: Item;
  note?: string;
}

/** Signature de chaque règle */
export interface RuleTypes {
  /**
   * Valeur d'une table de compétence indexée par points durs (points investis, sans les bonus d'objets) : `table` est le nom de la
   * table (ex. « Number of Arrows ») ; 0 si la compétence n'a pas cette table. Base : aucune table (0).
   */
  'skills.hardValue': (id: string, table: string, hard: number) => number;
  /**
   * Compétences renommées des anciennes sauvegardes du jeu de règles (ancien identifiant → nouveau), reportées au chargement
   * (`migrateSkills`) ; les compétences inconnues sont remboursées. Base : aucune (lot M9).
   */
  'skills.renames': () => Readonly<Record<string, string>>;
  /**
   * Compétence du jeu pour la compétence d'indice `d2Id` (Skills.txt) d'un fichier .d2s importé ; undefined : sans équivalent (points
   * remboursés). `tableId` : celle de la table d'import (`d2s-tables.gen.json`, faite pour les arbres du jeu pd2). Base : la compétence de
   * Diablo II de cette ligne (skills-d2.ts, lot M9).
   */
  'skills.d2sImport': (d2Id: number, tableId: string | undefined) => string | undefined;
  /** Comportements des compétences de la Sorcière (lot M9b ; base : D2 1.13c, src/mods/d2/skills.ts) */
  'skills.sorceress': () => D2S.SorceressRules;
  /** Comportements des compétences de l'Amazone (lot M9c) */
  'skills.amazon': () => D2S.AmazonRules;
  /** Comportements des compétences du Barbare (lot M9d) */
  'skills.barbarian': () => D2S.BarbarianRules;
  /** Comportements des compétences du Paladin (lot M9e) */
  'skills.paladin': () => D2S.PaladinRules;
  /** Comportements des compétences du Nécromancien (lot M9f) */
  'skills.necromancer': () => D2S.NecromancerRules;
  /** Comportements des compétences du Druide (lot M9g) */
  'skills.druid': () => D2S.DruidRules;
  /** Comportements des compétences de l'Assassin (lot M9h) */
  'skills.assassin': () => D2S.AssassinRules;
  /** Maîtrise d'armes qui s'applique à l'arme tenue (identifiant de compétence) ; base : une maîtrise par type d'arme (D2) */
  'skills.masteryOf': (kind: string, twoHanded: boolean, classId: string) => string | undefined;
  /**
   * Rayon d'explosion d'un projectile du joueur selon son type (unités) ; undefined : celui du moteur (`BEHAVIORS` de
   * src/sim/missile-update.ts, valeurs de D2). Base : aucun changement.
   */
  'missiles.explode': (kind: string) => number | undefined;

  /* Cartes d'endgame (objets `item.map`, runs `map`) : base sans carte */
  /** Crée un objet de carte (palier, rareté, zone) ; base : refus (aucune carte) */
  'maps.make': (rng: Rng, tier: number, quality?: Quality, zone?: string) => Item;
  /** Part des monstres d'une carte qui reçoivent les immunités de sa zone (%) */
  'maps.immunePct': () => number;
  /** Bonus cumulés des affixes d'une carte (infobulle) */
  'maps.bonuses': (it: Item) => { xp: number; density: number; mf: number; rarity: number };
  /** Texte du modificateur de corruption d'une carte */
  'maps.corruptModText': (c: WorldMod) => string;
  /** Ouverture d'une carte (Game.startMap, reprise d'une run de carte) ; base : refus */
  'maps.launch': (it: Item, seed: number) => MapLaunch;
  /** Zone d'une carte (construction seule : outils, empreintes, tests) ; base : refus */
  'maps.buildZone': (def: MapZoneDef, seed: number, opts: MapZoneOptions) => ZoneDef;
  /** Recette de carte du Cube (effets `mapOrb`, `mapCombine`, `mapScarab`) */
  'maps.applyRecipe': (rng: Rng, e: CubeEffect, items: Item[], clvl: number) => MapRecipeResult;
  /** Corruption d'une carte (renvoie le texte de l'issue) */
  'maps.corrupt': (rng: Rng, it: Item) => string;
  /** Butin en plus d'un monstre tué dans une carte (cartes, orbes, événements, butin spécial du boss) */
  'maps.runDrops': (w: World, m: Monster, tier: number, zone: string) => Item[];
  /** Butin en plus hors des cartes, après celui de la run (`out` complété sur place : cartes tombées en Enfer) */
  'maps.campaignDrops': (w: World, m: Monster, difficulty: number, out: Item[]) => void;
  /** Contenu d'un conteneur d'événement de carte (coffre d'Horazon), palier de la carte */
  'maps.chestDrops': (w: World, tier: number) => Item[];
  /** Objets en plus d'un monstre tué sous modificateurs de monde (affixes « du Forgeron », « de l'Armurier ») */
  'maps.worldModDrops': (rng: Rng, mods: WorldMod[], ilvl: number) => Item[];
  /** Opérations d'une carte hors du Cube (menu de la carte), dans l'ordre d'affichage */
  'maps.ops': () => readonly MapOp[];
  /** Vérification d'une opération de carte, sans effet de bord (ingrédient, stock, raison du refus) */
  'maps.opCheck': (c: CharacterState, it: Item | null, opId: string) => MapOpCheck;
  /** Applique une opération à la carte désignée (refus sans rien consommer) */
  'maps.upgrade': (c: CharacterState, ref: MapRef, opId: string, rng: Rng) => CubeResult;
  /** Aperçu de la fusion en lot du coffre de cartes */
  'maps.mergePreview': (c: CharacterState, o: MergeOpts) => MergePreview;
  /** Fusion en lot du coffre de cartes (3 cartes → 1) */
  'maps.merge': (c: CharacterState, o: MergeOpts, rng: Rng) => MergeResult;
  /** Ingrédient de la fusion qui monte d'un palier (stock affiché) */
  'maps.upgradeCurrency': () => string;
  /** Multiplicateurs de vie et de dégâts d'un boss de carte (en plus du rang et de la difficulté) */
  'maps.bossStatMul': (def: MonsterDef, tier: number) => { hp: number; dmg: number };

  /* Monde et combat (modificateurs de monde, boss de carte) */
  /** Monstre créé, juste avant son entrée dans le monde (modificateurs de monde, état de boss de carte) */
  'world.monsterSpawned': (w: World, m: Monster, mapBoss: boolean) => void;
  /** Tick du monde sous modificateurs de monde (`World.mapMods` non vide) */
  'world.tick': (w: World, dt: number) => void;
  /** Coup d'un monstre sur le joueur : paquet de dégâts transformé (copie) */
  'combat.monsterHitPacket': (w: World, p: DamagePacket, src: Monster) => DamagePacket;
  /** Après un coup de monstre sur le joueur (dégâts infligés, mêlée ou non) */
  'combat.afterMonsterHit': (w: World, pl: Player, src: Monster | null, dealt: number, melee: boolean) => void;
  /** Récupération des coups des monstres en plus (%), seuil d'étourdissement */
  'combat.monsterFhrPct': (w: World) => number;
  /** Facteur des dégâts subis par un boss de carte (bouclier) */
  'combat.mapBossTaken': (w: World, m: Monster) => number;
  /** IA d'un boss de carte : vrai si le tick du monstre est entièrement pris en charge */
  'ai.mapBoss': (w: World, m: Monster) => boolean;
  /** Mort d'un boss de carte (bannière, renforts) */
  'runs.mapBossDeath': (w: World, m: Monster) => void;

  /* Formules de combat (lot M8a ; base : D2 1.13c, src/mods/d2/combat.ts) */
  /**
   * Résistance effective d'un monstre à un élément : résistance de base, pénétrations (maîtrises, objets), brisure (`sunder`),
   * réductions qui cassent les immunités (Conviction, malédictions), réduction « douce » ; `immune` : aucun dégât de cet élément
   */
  'combat.monsterRes': (baseRes: number, pierce: number, sunder: boolean, reduction: number, soft: number) => { res: number; immune: boolean };
  /** Vol de vie et de mana d'un coup du joueur (points rendus) : dégâts physiques infligés, vie du monstre avant le coup */
  'combat.leech': (w: World, m: Monster, p: DamagePacket, physDealt: number, hpBefore: number) => { life: number; mana: number };
  /** Dégâts d'un coup écrasant réussi (avant le coup), `res` : résistance physique effective du monstre */
  'combat.crushingBlow': (w: World, m: Monster, p: DamagePacket, player: Player | null, res: number) => number;
  /** Multiplicateur des dégâts physiques d'une attaque d'arme : coup critique (maîtrise : chance, multiplicateur en plus) et frappe mortelle, tirages compris */
  'combat.criticalMul': (w: World, crit: number, critMult: number) => number;
  /** Les attaques d'arme de mêlée infligent-elles des dégâts de zone autour de la cible ? */
  'combat.weaponSplash': () => boolean;
  /**
   * Monsters a hero's missile passes through after its first, beyond its own piercing (lot 294: a game mode whose arrows and bolts cross
   * the fodder, Survivals' Act I). Base: 0 (none; no draw consumed)
   */
  'combat.missilePierce': (w: World, kind: string) => number;
  /** Blessures ouvertes d'une attaque d'arme qui a touché (tirage compris) */
  'combat.openWounds': (w: World, t: Monster, dealt: number) => void;
  /** Vie perdue par un monstre qui saigne, pour un pas de `dt` secondes */
  'combat.bleedTick': (m: Monster, dt: number) => number;
  /** Froid et gel d'un coup sur un monstre que le froid atteint (non immunisé) ; `coldRes` : sa résistance effective au froid */
  'combat.chillFreeze': (w: World, m: Monster, p: DamagePacket, coldRes: () => number) => void;
  /** Part absorbée au plus par l'absorption élémentaire en pourcentage du joueur (%) */
  'combat.absorbPctMax': () => number;
  /** Le coup reçu (`dealt` points, vie maximale `hpMax`) met-il le joueur en récupération après coup ? Base : 1/12 de la vie (D2) */
  'combat.playerHitRecovery': (dealt: number, hpMax: number) => boolean;
  /**
   * Lot 321: what a rejuvenation potion gives back, as a share of the maximum life and mana (`small`: the small one, `full`: the full one)
   * and at most `cap` points of each. Base: Diablo II, 35 % and 100 %, no cap (Misc.txt `rvs`, `rvl`)
   */
  'potion.rejuv': () => { small: number; full: number; cap: number };

  /* Mercenaires (lot M8b ; base : D2 1.13c, src/mods/d2/mercs.ts) */
  /** L'objet porté par le mercenaire perd-il de la durabilité (coups portés, coups reçus) ? */
  'merc.itemWear': (it: Item) => boolean;
  /** Part des dégâts du mercenaire infligée à ce monstre (%) */
  'merc.bossDamagePct': (w: World, m: Monster) => number;
  /** Modèle des mercenaires (lot M10d) : statistiques, compétences, sous-types, équipement ; base : Hireling.txt de D2 */
  'merc.model': () => D2M.MercModel;
  /** Level that opens and prices the hirelings (lot 295: a game mode whose hero is level 1 between runs); base: the character's level */
  'merc.hireLevel': (c: CharacterState) => number;

  /* Caractéristiques du personnage (lot M8c ; base : D2 1.13c, src/mods/d2/character.ts) */
  /** Plafond des résistances maximales élémentaires du joueur (%) */
  'char.maxResCap': () => number;
  /** Score d'attaque propre à la classe, ajouté à celui de la Dextérité et des objets */
  'char.toHitFactor': (classId: string) => number;
  /** Blocage propre à la classe, ajouté à celui du bouclier porté */
  'char.blockFactor': (classId: string) => number;
  /**
   * Is a worn item (equipment, charm) active, its properties counted (lot 289: a game mode lets a hero wear gear above his level, asleep
   * until he meets its requirements)? Base: always (Diablo II: an item that cannot be used cannot be worn)
   */
  'char.itemActive': (c: CharacterState, item: Item) => boolean;
  /** Do the level, strength and dexterity requirements block wearing an item (lot 289)? Base: yes (the class and slot always do) */
  'char.equipNeedsReqs': (c: CharacterState) => boolean;
  /**
   * Does an item's class restriction block the hero from wearing it (lot 290: Survivals lets any hero wear any item of his slots)? Base:
   * yes (an item for the mercenary alone never goes on the hero)
   */
  'char.equipNeedsClass': (c: CharacterState) => boolean;
  /** Running speed of the player (units a second) from the base's (Diablo II: 5.2 and the run/walk FRW); base: unchanged (lot 291) */
  'player.speed': (w: World, base: number) => number;
  /**
   * Does the player keep walking while a skill or an attack is being cast (lot 291: a survivors game moves and fires at once)? Base: no
   * (Diablo II: casting roots the hero)
   */
  'player.castWhileMoving': (w: World) => boolean;
  /**
   * Is a skill asked while another cast or strike goes on cast at once beside it (lot 298: a survivors game fires every skill on its own
   * cooldown, one animation never holding the others back)? The skill (not the weapon's attack nor a melee strike, which keep their
   * swing) has no animation of its own: its effect, cost and cast event at once, the running cast going on. Base: no (Diablo II: one
   * cast at a time, the next one waits)
   */
  'player.parallelCast': (w: World) => boolean;
  /** A skill the hero just cast (`side`: beside a running one, rule `player.parallelCast`): a game mode's own floor or log. Base: nothing */
  'skills.onCast': (w: World, id: string, side: boolean) => void;
  /** Mana a skill costs (`skillManaCost`, `cost` the base's): a game mode with near-free skills (lot 292b, Survivals). Base: `cost` */
  'skills.manaCost': (w: World, id: string, cost: number) => number;
  /** Frames of a strike or cast the hero starts (`World.startCast`, `frames` Diablo II's): a game mode's quicker cadence. Base: `frames` */
  'skills.castFrames': (w: World, id: string, frames: number) => number;
  /**
   * Missiles a cast of a several-missile skill fires (`n` Diablo II's: Charged Bolt's bolts, Teeth's teeth), each missile's damage then
   * times `n` over the count returned (a cast's damage kept): a game mode with fewer, heavier bolts (lot 309, Survivals). Base: `n`
   */
  'skills.missileCount': (w: World, id: string, n: number) => number;
  /**
   * A hostile monster chases the player in a straight line at any distance when the way is clear (the base: only within 10 units, else
   * the flow field's grid steps). Base: false (lot 292b: Survivals' open arenas)
   */
  'ai.directChase': (w: World, m: Monster) => boolean;
  /**
   * Lot 301 (Survivals: "the monsters come at the hero then turn back"): how a monster keeps its target between the hero and his
   * creatures: `hold` ticks at least on the one chosen, a new one taken only when nearer by `margin` units, and a creature only within
   * `petRange` units (beyond, the hero). Base: 0, 0.5 and any distance (D2)
   */
  'ai.targetLock': (w: World, m: Monster) => { hold: number; margin: number; petRange: number };
  /**
   * Lot 301: a factor on a chasing monster's walk, `d` units from its target (Survivals' flow: the monsters brought beyond the screen
   * walk in quicker while off it). Base: 1
   */
  'ai.chaseSpeed': (w: World, m: Monster, d: number) => number;
  /** Lot 301: do the Fallen near a Fallen killed panic a moment (Diablo II)? Base: yes (Survivals' flow: no, they keep coming) */
  'ai.allyDeathFlee': (w: World, m: Monster) => boolean;
  /**
   * Lead of a monster's missile (lot 294: a game mode whose hero never stops walking; the shot aimed where he was at the attack's start
   * missed 98 % of the time): 0 the base's aim, k > 0 aimed ahead of the target by k × its motion until the intercept (the target going on as it goes)
   */
  'ai.missileLead': (w: World, m: Monster) => number;

  /* Progression (lot M8f ; base : D2 1.13c, src/mods/d2/progression.ts) */
  /** Part de l'expérience d'un monstre de niveau `mlvl` gagnée par un personnage de niveau `clvl` */
  'xp.levelFactor': (clvl: number, mlvl: number) => number;

  /* Cube horadrique (lot M10c ; base : D2 1.13c, src/mods/d2/cube.ts) */
  /**
   * Artisanat d'une famille (`craft_<famille>`) sur une base, à son emplacement d'artisanat (`craftSlot`) : rune de la recette et propriétés
   * fixes de l'objet d'artisan, null si la recette n'accepte pas cette base
   */
  'cube.craft': (family: string, slot: string, base: ItemBase) => { rune: string; mods: readonly StatRoll[] } | null;
  /**
   * Plafond de châsses d'une recette d'ajout de châsses (`addSockets`) sur une base : `ilvlCap` est celui de Diablo II (niveau de l'objet,
   * au moins 1) ; une refonte peut le lever pour certaines recettes (pd2 : boîte et pièce d'énigme de Larzuk, jusqu'au maximum de la base)
   */
  'cube.socketCap': (recipeId: string, base: ItemBase, ilvlCap: number) => number;

  /* Butin (classes de trésor : sim/loot/drops.ts ; runs : sim/runs.ts) */
  /**
   * Référence de classe de trésor propre à un jeu de règles, hors des TC de la table (`MONSTER_TC`) : vrai si elle est résolue ici (objets
   * poussés dans `out`, sous-références par `resolve`). Base : aucune (les TC de D2 sont toutes dans la table).
   */
  'loot.ref': (
    ctx: DropContext,
    ref: string,
    out: Item[],
    bonus: QualityBonus,
    depth: number,
    resolve: (ctx: DropContext, ref: string, out: Item[], bonus: QualityBonus, depth: number) => void,
  ) => boolean;
  /**
   * Taux de butin et d'expérience du jeu de règles (palier « Normal », avant le palier de butin du joueur) ; `base` : ceux de la base
   * (Diablo II LoD 1.13c : aucun multiplicateur, mana en 120 s, ni cartes ni orbes). Lot M8e.
   */
  'loot.rates': (base: Rates) => Rates;
  /** Nombre de joueurs du calcul du NoDrop (D2 : 1 en solo) */
  'loot.noDropPlayers': () => number;
  /** Butin en plus d'un monstre tué, après celui de sa TC et de la run (`items` complété sur place) */
  'loot.monsterDrops': (w: World, m: Monster, items: Item[]) => void;
  /**
   * Catalogue de valeur du butin (mise en avant au sol) : palier d'un unique ou d'un objet de set (3 à 5), paliers d'un mot runique
   * ([base ordinaire, élite ou éthérée]), châsses minimales d'une base recherchée, palier d'une monnaie (sinon selon son prix) ; undefined :
   * hors catalogue. Base : data/items/loot-value.ts
   */
  'loot.value': (kind: 'unique' | 'set' | 'runeword' | 'base' | 'currency', id: string) => number | readonly [number, number] | undefined;
  /**
   * Butin en plus d'un monstre tué hors des cartes, propre au jeu de règles (avant les cartes tombées en campagne). Base : la Torche du feu
   * de l'enfer de Tristram pandémoniaque, donnée par le code de D2 (src/sim/loot/uber-drops.ts, `provideBaseRule`)
   */
  'runs.extraDrops': (w: World, m: Monster, difficulty: number) => Item[];

  /* Bots (lot M13 ; base : D2 1.13c, src/mods/d2/bots.ts) */
  /**
   * Bots du jeu de règles : plans de compétences des builds, compétences traitées à part par le cerveau (zones, effets posés, armures,
   * invocations sur cadavre), mercenaire voulu, préparation de ville propre au jeu (Cube, cartes d'endgame), charmes de l'arène et seuils
   * des tests de bots
   */
  'bots.profile': () => D2B.BotRules;

  /* Game modes (lot 273, S0): every base implementation is inert, a game mode (mods `gamemode`, e.g. Survivals) replaces it */
  /**
   * Per-tick autopilot of a game mode, called by `Game.step` before each simulation step (after the player's controls were applied to
   * `world.input`, which it may read or overwrite). Base: nothing.
   */
  'game.autopilot': (g: Game) => void;
  /**
   * The zone a game mode will play next without going through a town (lot 300: Survivals' chained zones), so that the application
   * prepares its graphics while the current zone is played (local mode). Base: null (the next zone is the town, or the run left behind a
   * portal, as before).
   */
  'game.nextZone': (g: Game) => ZoneDef | null;
  /**
   * The current zone is never seen: a game mode's screen covers it whole (lot 305: Survivals' hub over the town in its Run). The
   * application then loads no D2 map for it (the loading cut short). Base: false.
   */
  'render.zoneHidden': (g: Game) => boolean;
  /**
   * Lot 311: the outdoor zones joined edge to edge (`ZoneDef.seams`): the neighbour's map drawn beyond the edge, the hero walking into it
   * without a portal nor a loading screen. Base: true; a game mode with its own zones' flow (Survivals) turns it off (its exits then stay
   * the walked-over portals they were).
   */
  'world.seams': (g: Game) => boolean;
  /**
   * The champions, uniques and bosses marked (lot 305: Survivals' crowd, the elites hard to see): a ring in the rank's colour under them,
   * the champions and uniques a little larger, the name over a unique's or a boss's head. Base: false.
   */
  'render.eliteMarks': (w: World) => boolean;
  /**
   * The imported D2 maps the game's character plays (lot 305: a Survivals Run reads 7 of Act I's 35 maps, a third of the start's bytes):
   * the start and an act's loading read only those. Base: all.
   */
  'maps.wanted': (g: Game, id: string) => boolean;
  /**
   * Skill offer on a level gained (`level`): skill identifiers among which the point is spent (`Game.offers`, `Game.takeOffer`), or null
   * for the free allocation of the base (no offer). `reroll`: number of rerolls already made for this level. Base: null.
   */
  'skills.offer': (g: Game, level: number, reroll: number) => readonly string[] | null;
  /** Why the skill tree cannot take a point by hand right now (null: it can). Base: null (free allocation) */
  'skills.manualLearn': (g: Game) => string | null;
  /** Experience lost on death (the game subtracts it); base: D2 1.13c, src/mods/d2/progression.ts */
  'death.xpPenalty': (c: CharacterState, difficulty: number) => number;
  /** Screen orientations in which the game can be played: `landscape` (base: "rotate your device" prompt in portrait) or `any` */
  'ui.orientation': (g: Game) => 'landscape' | 'any';
  /** Camera zoom: `base` is the one of the settings and window height, `view` the window size in CSS pixels. Base: `base` */
  'render.zoom': (g: Game, base: number, view: { width: number; height: number }) => number;
  /**
   * What the renderer draws at most (lot 284, S9): a game mode with a hundred monsters on screen caps the corpses, projectiles and damage
   * numbers drawn and thins the particles; the simulation is never touched. Base: `BASE_RENDER_LIMITS` (the base's drawing, unchanged)
   */
  'render.limits': (g: Game) => RenderLimits;
  /**
   * Controls of the base's HUD hidden (lot 285): names of `HUD_PARTS` (src/ui/hud-parts.ts: the panel buttons, potions, skill page, empty
   * skill slots, context button, tips…). A game mode with a reduced screen hides them; base: none (the base's HUD unchanged)
   */
  'ui.hudHidden': (g: Game) => readonly string[];
  /** May this consumable (potion, key, tome, throwing potion) be bought from a vendor? Base: yes (lot 285: Survivals sells none) */
  'shop.consumable': (g: Game, baseId: string) => boolean;
  /**
   * A game mode's own economy (lot 292, Survivals): the price a vendor pays for an item (`Game.sellPrice`: the sale, the buy-back, the
   * bulk sale), `price` the base's. Base: `price`
   */
  'shop.sellPrice': (g: Game, item: Item, price: number) => number;
  /**
   * The equipment vendor's stall just rolled (`Game.refreshVendor`, `stock` the base's): the array returned becomes `Game.vendor` (a mode
   * may keep its own stall between the base's refreshes, the same array: what was bought stays bought). Base: `stock`
   */
  'shop.vendorStock': (g: Game, stock: VendorEntry[]) => VendorEntry[];
  /** The gamble stall just rolled (`Game.refreshGamble`): the array returned becomes `Game.gambleStock`. Base: `stock` */
  'shop.gambleStock': (g: Game, stock: GambleEntry[]) => GambleEntry[];
  /**
   * Quality and item level of a gambled item (`Game.gamble`), drawn from `rng` before the item. Base: Diablo II's odds since lot 321
   * (`GAMBLE_ODDS`: about 0.05 % unique, 0.1 % set, 10 % rare, the rest magic; before: 70 / 24 / 3 / 3 %), the character's level −5 to +4
   */
  'shop.gambleRoll': (g: Game, rng: Rng) => { quality: Quality; ilvl: number };
  /** Rows of the comparison with the worn item (`diffDerived`: before, after, the base's rows). Base: `rows` */
  'ui.compareRows': (before: DerivedStats, after: DerivedStats, rows: CompareRow[]) => CompareRow[];
  /** A long press on an item's cell runs its main action (equip, buy, sell…), as the double tap does. Base: false */
  'ui.holdToAct': (g: Game) => boolean;
  /**
   * Settings panel of a game mode (lot 286): the options of the base's catalogue kept (`src/ui/settings-catalog.ts`, in this order) and the
   * mode's own rows, on one flat page (no folded category, no search box when few options are left). Base: null (the base's panel unchanged)
   */
  'ui.settings': (g: Game) => SettingsLayout | null;
  /**
   * Where the floating joystick takes the thumb (lot 287, owner's test in portrait: "the movement control at the centre of the screen"):
   * `center` (anywhere in the lower two thirds of the screen, the attack and skills in a column at the edge in portrait), `left` or
   * `right` (that half of the lower two thirds, the buttons on the other side). `view`: window size in CSS pixels and the left-handed
   * setting. Base: null (the base's zone: the left 45 % of the screen, the right one for a left-handed player; the base's layout)
   */
  'ui.joystick': (g: Game, view: { width: number; height: number; leftHanded: boolean }) => JoystickPlace | null;

  /* Personnage d'essai et interface */
  /** Personnage d'essai (?testchar=1) : matériaux et objets du mod (après l'équipement et les charmes, même flux d'aléa) */
  'debug.testCharacter': (c: CharacterState, rng: Rng) => void;
  /** Icône d'une monnaie du mod (planche d'icônes), undefined : icône générique */
  'ui.currencyIcon': (baseId: string) => string | undefined;
}

export type RuleName = keyof RuleTypes;

/** A row of an item's comparison with the worn one (rule `ui.compareRows`) */
export interface CompareRow {
  label: string;
  delta: number;
  unit: string;
}

/** Place of the floating joystick chosen by a game mode (rule `ui.joystick`) */
export type JoystickPlace = 'left' | 'center' | 'right';

/** No control of the HUD hidden (rule `ui.hudHidden`, base) */
/** The base's target keeping (Diablo II: the nearest every tick, half a unit of margin) */
export const BASE_TARGET_LOCK = Object.freeze({ hold: 0, margin: 0.5, petRange: Infinity });
export const NO_HUD_HIDDEN: readonly string[] = Object.freeze([]);

/** A row of a mode's own setting in the base's settings panel (rule `ui.settings`): a setting declared by the mod, its values */
export interface ModSettingRow {
  /** Setting declared by the mod (`api.settings.declare`, stored under `Settings.mods.<mod>`) */
  key: string;
  /** Label (French source text, translated like the base's) */
  label: string;
  /** Values offered: the setting's value, the button's label */
  values: readonly (readonly [string | number | boolean, string])[];
  help?: string;
}

/** Settings panel of a game mode (rule `ui.settings`) */
export interface SettingsLayout {
  /** Options of the base's catalogue kept (ids of `SETTINGS_ENTRIES`), in this order; the others are hidden */
  keep: readonly string[];
  /** Title of the mode's rows (shown before the base's options) */
  title?: string;
  /** The mode's own settings */
  rows?: readonly ModSettingRow[];
}

/** Drawing caps of the renderer (rule `render.limits`); the simulation keeps every monster, missile and hit */
export interface RenderLimits {
  /** Corpses drawn at most (the newest ones; the others are no longer drawn before their 11 s) */
  corpses: number;
  /** Projectiles drawn at most (the newest ones) */
  missiles: number;
  /** Damage numbers on screen at most (the oldest go first) */
  floaters: number;
  /** Share of the particles of the quality preset (0 to 1) */
  particles: number;
}

/** The base's drawing: every corpse and projectile, 40 damage numbers, the quality preset's particles */
export const BASE_RENDER_LIMITS: Readonly<RenderLimits> = Object.freeze({ corpses: Infinity, missiles: Infinity, floaters: 40, particles: 1 });

/** Lot 321: Diablo II's rejuvenation potions (Misc.txt: the small one 35 %, the full one 100 % of life and mana, no cap) */
export const D2_REJUV = Object.freeze({ small: 0.35, full: 1, cap: Infinity });

/**
 * Lot 321: Diablo II's gambling odds of each quality, the rest magic (Arreat Summit, "Gambling": about 1 in 2 000 a unique, 1 in 1 000 a
 * set item, 1 in 10 a rare)
 */
export const GAMBLE_ODDS = Object.freeze({ unique: 0.0005, set: 0.001, rare: 0.1 });

/** Implémentations de la base */
const noMaps = (): never => {
  throw new Error('Aucune carte dans ce jeu de règles');
};

const BASE_RULES: RuleTypes = {
  'skills.hardValue': () => 0,
  'skills.renames': () => ({}),
  'skills.d2sImport': (d2Id) => D2_SKILL_BY_INDEX.get(d2Id),
  'skills.sorceress': () => D2S.D2_SORCERESS,
  'skills.amazon': () => D2S.D2_AMAZON,
  'skills.barbarian': () => D2S.D2_BARBARIAN,
  'skills.paladin': () => D2S.D2_PALADIN,
  'skills.necromancer': () => D2S.D2_NECROMANCER,
  'skills.druid': () => D2S.D2_DRUID,
  'skills.assassin': () => D2S.D2_ASSASSIN,
  'skills.masteryOf': (kind) => D2S.d2MasteryOf(kind),
  'missiles.explode': () => undefined,
  'maps.make': noMaps,
  'maps.immunePct': () => 0,
  'maps.bonuses': () => ({ xp: 0, density: 0, mf: 0, rarity: 0 }),
  'maps.corruptModText': (c) => `${c.id} ${c.value}`,
  'maps.launch': noMaps,
  'maps.buildZone': noMaps,
  'maps.applyRecipe': () => ({ ok: false, reason: 'Recette inconnue' }),
  'maps.corrupt': noMaps,
  'maps.runDrops': () => [],
  'maps.campaignDrops': () => {},
  'maps.chestDrops': () => [],
  'maps.worldModDrops': () => [],
  'maps.ops': () => [],
  'maps.opCheck': () => ({ ok: false, reason: 'Opération inconnue', mat: '', matName: '', have: 0 }),
  'maps.upgrade': () => ({ ok: false, reason: 'Opération inconnue' }),
  'maps.mergePreview': () => ({ ok: false, reason: 'Aucune carte', lots: 0, eligible: 0, consumed: 0, byQuality: { normal: 0, magic: 0 }, orbsNeeded: 0, orbsHave: 0, toTier: 0 }),
  'maps.merge': () => ({ ok: false, reason: 'Aucune carte', lots: 0, consumed: 0, produced: 0, orbsUsed: 0, toTier: 0 }),
  'maps.upgradeCurrency': () => '',
  'maps.bossStatMul': () => ({ hp: 1, dmg: 1 }),
  'world.monsterSpawned': () => {},
  'world.tick': () => {},
  'combat.monsterHitPacket': (_w, p) => p,
  'combat.afterMonsterHit': () => {},
  'combat.monsterFhrPct': () => 0,
  'combat.mapBossTaken': () => 1,
  'ai.mapBoss': () => false,
  'runs.mapBossDeath': () => {},
  'combat.monsterRes': D2C.monsterRes,
  'combat.leech': D2C.leech,
  'combat.crushingBlow': D2C.crushingBlow,
  'combat.criticalMul': (w, crit) => D2C.criticalMul(w, crit),
  'combat.weaponSplash': () => false,
  'combat.missilePierce': () => 0,
  'combat.openWounds': D2C.openWounds,
  'combat.bleedTick': D2C.bleedTick,
  'combat.chillFreeze': D2C.chillAndFreeze,
  'combat.absorbPctMax': () => D2C.ABSORB_PCT_MAX,
  'combat.playerHitRecovery': D2C.playerHitRecovery,
  'potion.rejuv': () => D2_REJUV,
  'cube.craft': D2K.craft,
  'cube.socketCap': (_recipeId, _base, ilvlCap) => ilvlCap,
  'merc.itemWear': D2M.itemWear,
  'merc.bossDamagePct': D2M.bossDamagePct,
  'merc.model': () => D2M.D2_MERC_MODEL,
  'merc.hireLevel': (c) => c.level,
  'char.maxResCap': () => D2P.MAX_RES_CAP,
  'char.toHitFactor': D2P.toHitFactor,
  'char.blockFactor': D2P.blockFactor,
  'char.itemActive': () => true,
  'char.equipNeedsReqs': () => true,
  'char.equipNeedsClass': () => true,
  'player.speed': (_w, base) => base,
  'player.castWhileMoving': () => false,
  'player.parallelCast': () => false,
  'skills.onCast': () => undefined,
  'skills.manaCost': (_w, _id, cost) => cost,
  'skills.castFrames': (_w, _id, frames) => frames,
  'skills.missileCount': (_w, _id, n) => n,
  'ai.missileLead': () => 0,
  'ai.directChase': () => false,
  'ai.targetLock': () => BASE_TARGET_LOCK,
  'ai.allyDeathFlee': () => true,
  'ai.chaseSpeed': () => 1,
  'xp.levelFactor': D2X.xpLevelFactor,
  'loot.ref': () => false,
  'loot.rates': (base) => base,
  'loot.noDropPlayers': () => 1,
  'loot.monsterDrops': () => {},
  'loot.value': baseCatalogValue,
  'runs.extraDrops': () => [],
  'bots.profile': () => D2B.D2_BOTS,
  'game.autopilot': () => {},
  'game.nextZone': () => null,
  'render.zoneHidden': () => false,
  'world.seams': () => true,
  'render.eliteMarks': () => false,
  'maps.wanted': () => true,
  'skills.offer': () => null,
  'skills.manualLearn': () => null,
  'death.xpPenalty': D2X.deathXpLoss,
  'ui.orientation': () => 'landscape',
  'render.zoom': (_g, base) => base,
  'render.limits': () => BASE_RENDER_LIMITS,
  'ui.hudHidden': () => NO_HUD_HIDDEN,
  'shop.consumable': () => true,
  'shop.sellPrice': (_g, _item, price) => price,
  'shop.vendorStock': (_g, stock) => stock,
  'shop.gambleStock': (_g, stock) => stock,
  'shop.gambleRoll': (g, rng) => {
    const r = rng.float(0, 1);
    // lot 321: Diablo II's odds (`GAMBLE_ODDS`); before: 70 / 24 / 3 / 3 %, a unique every 33 gambles
    const o = GAMBLE_ODDS;
    const quality: Quality = r < o.unique ? 'unique' : r < o.unique + o.set ? 'set' : r < o.unique + o.set + o.rare ? 'rare' : 'magic';
    return { quality, ilvl: Math.max(1, g.character.level - 5 + rng.int(10)) };
  },
  'ui.compareRows': (_a, _b, rows) => rows,
  'ui.holdToAct': () => false,
  'ui.settings': () => null,
  'ui.joystick': () => null,
  'debug.testCharacter': () => {},
  'ui.currencyIcon': () => undefined,
};

/** Implémentations courantes (la base, ou celle du dernier mod qui l'a remplacée) : lues par les fonctions d'accès du jeu */
export const RULES: RuleTypes = { ...BASE_RULES };

const owners = new Map<RuleName, string>();
let frozen = false;

export function isRuleName(name: string): name is RuleName {
  return Object.hasOwn(BASE_RULES, name);
}

/**
 * Implémentation de la base d'une règle qui a besoin de la simulation (créer un objet…), fournie par le module de la simulation qui la porte,
 * à son chargement : ce module-ci reste une feuille. Le jeu est activé avant le chargement de la simulation (src/main.ts) : une règle déjà
 * remplacée par un mod garde celle du mod (qui a reçu, comme implémentation précédente, celle d'avant : sans effet) ; sinon la règle courante
 * devient celle-ci. Règles concernées : `runs.extraDrops` (src/sim/loot/uber-drops.ts).
 */
export function provideBaseRule<K extends RuleName>(name: K, impl: RuleTypes[K]): void {
  BASE_RULES[name] = impl;
  if (!owners.has(name)) RULES[name] = impl;
}

/** Remplace une règle pour le mod `mod` ; `make` reçoit l'implémentation précédente (base ou mod précédent) */
export function setRule<K extends RuleName>(mod: string, name: K, make: (prev: RuleTypes[K]) => RuleTypes[K], opts: { override?: boolean } = {}): void {
  if (frozen) throw new Error(`Règle « ${name} » : remplacement par « ${mod} » refusé après l'activation`);
  if (!isRuleName(name)) throw new Error(`Règle inconnue : « ${String(name)} » (remplacement par « ${mod} »)`);
  const by = owners.get(name);
  if (by && by !== mod && !opts.override) throw new Error(`Règle « ${name} » déjà remplacée par « ${by} » (conflit avec « ${mod} »)`);
  RULES[name] = make(RULES[name]);
  owners.set(name, mod);
}

/** Propriétaire de chaque règle remplacée (tests, diagnostic) */
export function ruleOwner(name: RuleName): string | undefined {
  return owners.get(name);
}

/** Gel des règles (fin de l'activation, activate.ts) */
export function freezeRules(): void {
  frozen = true;
}
