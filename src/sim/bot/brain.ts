/**
 * Cerveau de bot commun aux bots de combat et de progression.
 *
 * Il ne lit que l'état de la simulation et n'agit que par les mêmes entrées qu'un joueur
 * (joystick, sorts, potions, ramassage, façade Game en ville). Aucune triche : il n'équipe
 * que ce qu'il trouve, ne voit pas les monstres non apparus autrement que par les
 * déclencheurs de zone (équivalent de l'exploration), et subit les mêmes règles.
 */
import type { World } from '../world';
import { MERC_BY_ID, type MercId } from '../../data/mercs';
import { canMercEquip, mercDerived, mercOf } from '../merc';
import { dist } from '../../core/math';
import { lin } from '../../data/skills';
import { Rng } from '../../core/rng';
import { SKILL_BY_ID } from '../../data/skills';
import { runZoneLevel } from '../../data/runs';
import { levelXp } from '../../data/xp';
import { levelDiffMultiplier } from '../progression';
import type { Element } from '../../data/stats';
import type { Difficulty, Slot } from '../../data/types';
import type { Monster } from '../actors';
import { activeCurse } from '../actors';
import { beltCapacity, canWear, computeDerived, type CharacterState } from '../character';
import { fcrFrames } from '../breakpoints';
import type { DerivedStats } from '../derived';
import type { Game } from '../game';
import { baseOf, itemFinal } from '../itemstats';
import { quiverFits } from '../../data/items/quivers';
import type { Item } from '../item';
import { findSlot, hasRoomFor, inventoryFree, targetSlot, placeInCharmInv } from '../inventory';
import { lootFilterDecision, SHOW_GOOD, SHOW_NORMAL } from '../loot/filter';
import { canCast, hasBuff, skillDamageRange, skillManaCost, castFrames } from '../skills';
import { TICK_HZ } from '../constants';
import { findPath } from './pathfind';
import { RULES } from '../../mods/rules';
import type { BotRules, BotTown, RunPlan, SkillPlan, WantedMerc } from '../../mods/d2/bots';
import { effectiveMonsterRes, hitChance, monsterReduction } from '../combat';
import { RUNES } from '../../data/items/runes';
import { RUNEWORDS, runewordFits } from '../../data/items/index';
import { freeSockets, socketItem } from '../socket';
import { CUBE_RECIPES, type CubeRecipe } from '../../data/cube';
import { cubeCheck, cubeTransmute, itemAccepted } from '../cube';
import { GEM_BY_ID } from '../../data/items/runes';
import { TREE_CLASS, classCanUse, type ClassId } from '../../data/classes';
import { meleeArBonus, petMax, petsOf, playerForm, skillDamageRange2, SPIRITS, VINES } from '../druid';
import { attackReach, isRangedKind, isThrownKind, offhandWeapon, weaponKind, weaponMastery } from '../melee';
import { chargeCount } from '../assassin';
import { ramp } from '../../data/skills';

export type BuildId =
  | 'cold'
  | 'fire'
  | 'light'
  | 'wind'
  | 'fissure'
  | 'bear'
  | 'summon'
  | 'whirlwind'
  | 'frenzy'
  | 'hammerdin'
  | 'zealot'
  | 'javazon'
  | 'bowazon'
  | 'trapsin'
  | 'martial'
  | 'summoner'
  | 'bonemancer'
  | 'pnova';

/** Classe jouée par chaque build (Sorcière : cold, fire, light ; Druide : les quatre autres) */
export const BUILD_CLASS: Record<BuildId, ClassId> = {
  cold: 'sorceress',
  fire: 'sorceress',
  light: 'sorceress',
  wind: 'druid',
  fissure: 'druid',
  bear: 'druid',
  summon: 'druid',
  whirlwind: 'barbarian',
  frenzy: 'barbarian',
  hammerdin: 'paladin',
  zealot: 'paladin',
  javazon: 'amazon',
  bowazon: 'amazon',
  trapsin: 'assassin',
  martial: 'assassin',
  summoner: 'necromancer',
  bonemancer: 'necromancer',
  pnova: 'necromancer',
};
/** Builds de mêlée : ils vont au contact au lieu de garder leurs distances */
const MELEE_BUILDS = new Set<BuildId>(['bear', 'whirlwind', 'frenzy', 'hammerdin', 'zealot', 'martial']);
/** Builds d'arme (mêlée ou tir) : la valeur de l'équipement compte les dégâts d'arme */
const WEAPON_BUILDS = new Set<BuildId>([...MELEE_BUILDS, 'javazon', 'bowazon']);

/** Bots du jeu de règles actif (plans, listes de compétences, mercenaire, ville : règle `bots.profile`, src/mods/d2/bots.ts) */
export function botRules(): BotRules {
  return RULES['bots.profile']();
}

/** Plan de compétences du build dans le jeu de règles actif : le premier élément apprenable reçoit le point (vide : aucun plan) */
export function buildPlan(build: BuildId): SkillPlan {
  return botRules().plans[build] ?? [];
}

const BUILD_ELEM: Record<BuildId, Element> = {
  cold: 'cold',
  fire: 'fire',
  light: 'light',
  wind: 'phys',
  fissure: 'fire',
  bear: 'phys',
  summon: 'phys',
  whirlwind: 'phys',
  frenzy: 'phys',
  hammerdin: 'magic',
  zealot: 'phys',
  javazon: 'light',
  bowazon: 'phys',
  trapsin: 'light',
  martial: 'phys',
  summoner: 'phys',
  bonemancer: 'magic',
  pnova: 'poison',
};
/** Compétences qui exigent un cadavre : lancées par la préparation, pas par le choix d'attaque */
const NEEDS_CORPSE = new Set(['corpse_explosion', 'death_sentry', 'find_potion', 'find_item', 'grim_ward', 'leap', 'howl', 'taunt', 'battle_cry']);
/** Ensembles tirés des listes du profil des bots (compétences de zone, effets posés sans cumul, dégâts sur la durée), recalculés au changement de profil */
let listsOf: BotRules | null = null;
let lists = { aoe: new Set<string>(), noStack: new Set<string>(), dots: new Set<string>() };
function botLists(): typeof lists {
  const r = botRules();
  if (r !== listsOf) {
    listsOf = r;
    lists = { aoe: new Set(r.aoe), noStack: new Set(r.noStack), dots: new Set(r.dots) };
  }
  return lists;
}

export interface BotOptions {
  build: BuildId;
  /** Prend tout ce qui passe le filtre (joueur appliqué) ou seulement le précieux */
  greedy: boolean;
  seed: number;
  /** Temps de ville simulé par visite (menus, marchand), compté dans le rythme */
  townSeconds: number;
}

const DEFAULT_BOT: BotOptions = {
  build: 'cold',
  greedy: true,
  seed: 1,
  townSeconds: 25,
};

export interface BotStats {
  casts: Record<string, number>;
  potions: number;
  teleports: number;
  stuckResets: number;
  pickups: number;
  equips: number;
  mercHires: number;
  mercRevives: number;
  mercEquips: number;
  sold: number;
  goldSpent: number;
  runewords?: number;
  /** Recettes d'équipement appliquées au Cube (montée de base, artisanat, châsses) */
  cubeGear?: number;
  /** Gemmes serties dans l'équipement */
  gems?: number;
  /** Gemmes combinées au Cube */
  gemUps?: number;
  /** Ticks passés par catégorie de décision (sort, fuite, butin, exploration…) */
  time: Record<string, number>;
}

/** Valeur d'un ensemble de statistiques pour le build (sert à comparer deux équipements) */
function gearValue(d: DerivedStats, build: BuildId): number {
  const e = BUILD_ELEM[build];
  // compétences du plan présentes dans le jeu de règles (un plan peut nommer celles d'un mod)
  const main = buildPlan(build)
    .filter(([id]) => SKILL_BY_ID[id] && !SKILL_BY_ID[id].passive)
    .map(([id]) => id);
  const skillLv = Math.max(0, ...main.map((id) => d.skillLevels[id] ?? 0));
  const resSum = (['fire', 'cold', 'light', 'poison'] as Element[]).reduce((s, k) => s + Math.min(75, d.res[k]), 0);
  const cls = BUILD_CLASS[build];
  const melee = WEAPON_BUILDS.has(build);
  const fcr = melee ? 0 : (cls === 'druid' ? 25 - fcrFrames(d.fcr, cls) : cls === 'sorceress' ? 20 - fcrFrames(d.fcr) : 20 - fcrFrames(d.fcr, cls)) * 22;
  // mêlée : dégâts d'arme, score d'attaque, vitesse d'attaque, vol de vie
  const weapon = melee
    ? ((d.weaponDmg[0] + d.weaponDmg[1]) / 2 + (d.offDmg ? (d.offDmg[0] + d.offDmg[1]) / 2 : 0)) * 3 +
      d.attackRating * 0.05 +
      d.ias * 1.2 +
      d.lifeLeech * 12 +
      (d.all.get('edPct') ?? 0) * 0.3 +
      d.defense * 0.08
    : 0;
  // brisure de l'immunité à son élément : la clé de l'endgame pour un build mono-élément
  const sunder = d.sunder[e] ? 400 : 0;
  return (
    sunder +
    weapon +
    skillLv * 30 +
    (d.elemDmgPct[e] ?? 0) * 0.7 +
    (d.pierce[e] ?? 0) * 1.2 +
    d.lifeMax * 0.45 +
    d.manaMax * 0.12 +
    resSum * 0.9 +
    fcr +
    d.fhr * 0.15 +
    d.frw * 0.35 +
    d.mf * 0.18 +
    d.defense * 0.015 +
    d.manaRegen * 1.5 +
    (d.dr ?? 0) * 3
  );
}

/** Valeur du personnage si `item` remplaçait l'objet de l'emplacement `slot` */
function valueWith(c: CharacterState, item: Item | null, slot: Slot, build: BuildId, difficulty: Difficulty): number {
  const eq = { ...c.equipment };
  if (item) {
    eq[slot] = item;
    const isQ = (x: Item | undefined) => !!x && baseOf(x).type === 'quiver';
    if (baseOf(item).twoHanded && !(isQ(eq.offhand) && quiverFits(baseOf(eq.offhand!), baseOf(item)))) delete eq.offhand;
    if (slot === 'offhand' && !isQ(item) && eq.mainhand && baseOf(eq.mainhand).twoHanded) delete eq.mainhand;
  } else delete eq[slot];
  const clone: CharacterState = { ...c, equipment: eq };
  let v = gearValue(computeDerived(clone, difficulty), build);
  // les compétences de tir/jet/griffes exigent leur arme (weaponreq) : une épée les rend muettes
  const kinds = BUILD_WEAPON_KINDS[build];
  if (kinds && !(eq.mainhand && kinds.includes(baseOf(eq.mainhand).type))) v -= 4000;
  // Frénésie : elle frappe des deux armes ; un bouclier en main gauche lui retire la moitié de ses coups
  if ((build === 'frenzy' || build === 'martial') && eq.offhand && baseOf(eq.offhand).type === 'shield') v -= 800;
  return v;
}

/** Arme exigée par la compétence principale du build (sinon aucune exigence) */
/**
 * Can the bot put the item on: the game's rule (`canWear`), and its class's items only (a game mode that lifts the class restriction, rule
 * `char.equipNeedsClass`, lot 290: the bot's build values do not know another class's weapons)
 */
function botCanWear(c: CharacterState, it: Item, d: { str: number; dex: number }): boolean {
  return canWear(c, it, d).ok && classCanUse(baseOf(it), c.classId);
}

/** Do an item's requirements keep the bot from it (level, attributes above `cap`)? Never when the game mode lifts them (lot 290) */
function reqsBlock(c: CharacterState, f: { reqLvl: number; reqStr: number; reqDex: number }, cap: number): boolean {
  return RULES['char.equipNeedsReqs'](c) && (f.reqLvl > c.level || f.reqStr > cap || f.reqDex > cap);
}

const BUILD_WEAPON_KINDS: Partial<Record<BuildId, string[]>> = {
  javazon: ['javelin', 'spear'],
  bowazon: ['bow', 'crossbow'],
  martial: ['claw'],
};

/** Rune sertissable hors mot runique : basse (jusqu'à Um) et en surplus (4 et plus) */
function surplusRune(id: string, count: number): boolean {
  const r = RUNES.find((x) => x.id === id);
  return !!r && r.rank <= 22 && count >= 4;
}

export type { RunPlan } from '../../mods/d2/bots';

/**
 * Plan de Cube pour réunir les runes d'un mot runique : les runes déjà possédées sont réservées,
 * les manquantes sont montées à partir du surplus des runes inférieures (3:1, 2:1 dès Pul, une
 * clé par recette). Renvoie la liste ordonnée des recettes, ou null si impossible.
 */
function runePlan(materials: Record<string, number>, runes: string[]): string[] | null {
  const m: Record<string, number> = { ...materials };
  const steps: string[] = [];
  const missing: string[] = [];
  for (const r of runes) {
    if ((m[r] ?? 0) > 0) m[r]--;
    else missing.push(r);
  }
  const idx = Object.fromEntries(RUNES.map((r, i) => [r.id, i]));
  let budget = 40;
  const produce = (id: string): boolean => {
    if (budget-- <= 0) return false;
    const i = idx[id];
    if (!i) return false;
    const prev = RUNES[i - 1];
    const n = prev.rank >= 21 ? 2 : 3;
    if ((m.key ?? 0) <= 0) return false;
    for (let k = 0; k < n; k++) {
      if ((m[prev.id] ?? 0) > 0) m[prev.id]--;
      else if (!produce(prev.id)) return false;
    }
    m.key--;
    steps.push(`rune_${prev.id}`);
    return true;
  };
  for (const r of missing) if (!produce(r)) return null;
  return steps;
}

/** Situation d'un combat du bot (fight) : cibles retenues, la plus proche, monstres au contact, sous le feu, build de mêlée */
interface FightCtx {
  w: World;
  p: World['player'];
  c: World['character'];
  threats: Monster[];
  targets: Monster[];
  closest: Monster;
  cd: number;
  adjacent: number;
  underFire: boolean;
  meleeBuild: boolean;
}

export class BotBrain {
  readonly opt: BotOptions;
  readonly rng: Rng;
  readonly stats: BotStats = {
    casts: {},
    potions: 0,
    teleports: 0,
    stuckResets: 0,
    pickups: 0,
    equips: 0,
    mercHires: 0,
    mercRevives: 0,
    mercEquips: 0,
    sold: 0,
    goldSpent: 0,
    time: {},
  };
  private path: { x: number; y: number }[] = [];
  private pathGoal: { x: number; y: number } | null = null;
  private pathTick = -999;
  private pathFailTick = -999;
  private failGoal: { x: number; y: number } | null = null;
  private lastPos = { x: 0, y: 0, tick: 0 };
  private blacklist = new Map<string, number>();
  /** Tentatives de ramassage par objet au sol (abandon si l'objet reste au sol) */
  private pickTries = new Map<number, number>();
  private lastPersistent = new Map<string, { x: number; y: number; tick: number }>();
  private fleeUntil = 0;
  private hopelessCache = new Map<number, { tick: number; v: boolean }>();
  /** Monstres impossibles à rejoindre (tick jusqu'auquel on les ignore) */
  private unreachable = new Map<number, number>();
  private fleeDir = { x: 0, y: 0 };
  private lastHp = 0;
  private lastHurtTick = -999;
  private lastKite = -999;
  /** Téléportation de déplacement en cours de vérification, et suspension après un échec */
  private tpFrom: { x: number; y: number; tick: number } | null = null;
  private tpBlockedUntil = 0;
  /** Ticks passés sans rien à faire (fin de run sans portail) */
  idleTicks = 0;
  /** Expérience et durée des dernières runs par run:difficulté (choix empirique quand la run sûre ne rapporte plus) */
  private readonly runSamples = new Map<string, { xp: number; sec: number; level: number }[]>();
  /** Issue des dernières runs par run:difficulté (vrai = mort) */
  readonly recentDeaths = new Map<string, { died: boolean; level: number; at: number }[]>();
  /** Secondes de jeu cumulées des runs notées (horloge des tentatives) */
  private playClock = 0;
  /** Enregistre l'issue d'une run (appelé par la boucle de session) : on garde les 3 dernières.
   *  `died` : mort, ou échec d'une run classique (non terminée à temps). */
  noteRun(runId: string, difficulty: number, died: boolean, xp = 0, seconds = 0): void {
    const k = `${runId}:${difficulty}`;
    const sm = this.runSamples.get(k) ?? [];
    sm.push({ xp, sec: seconds, level: this.game.character.level });
    this.runSamples.set(k, sm.slice(-8));
    const l = this.recentDeaths.get(k) ?? [];
    this.playClock += seconds;
    l.push({ died, level: this.game.character.level, at: this.playClock });
    this.recentDeaths.set(k, l.slice(-3));
  }

  /** Dernière décision (trace de débogage) */
  action = '';
  /** Monde courant : l'état tactique est réinitialisé à chaque nouvelle zone (ticks repartant de 0) */
  private worldRef: unknown = null;

  constructor(
    readonly game: Game,
    opt: Partial<BotOptions> = {},
  ) {
    this.opt = { ...DEFAULT_BOT, ...opt };
    this.rng = new Rng(`bot:${this.opt.seed}`);
  }

  /* ------------------------------------------------------------------ */
  /* Ville                                                               */
  /* ------------------------------------------------------------------ */

  /** Préparation en ville : points, équipement, vente, potions. Renvoie la run choisie (ou la carte à ouvrir). */
  town(): RunPlan | null {
    this.spendSkillPoints();
    this.purgeStash();
    this.makeRunewords();
    this.combineGems();
    this.cubeGear();
    this.manageGear();
    this.spendStatPoints();
    this.manageGear();
    this.manageMerc();
    this.sellJunk();
    // second passage : un inventaire plein avant la vente empêchait de déséquiper pour le Cube
    this.cubeGear();
    this.manageGear();
    this.buyGear();
    this.manageGear();
    this.buyPotions();
    this.setupHotbar();
    return this.prepareMap() ?? this.chooseRun();
  }

  /**
   * Mots runiques (comme un joueur) : pour chaque base à châsses vides de l'inventaire ou du
   * coffre et chaque mot runique applicable dont les runes sont disponibles — au besoin en
   * montant des runes au Cube —, simule l'objet obtenu et le forme s'il améliore l'équipement.
   */
  makeRunewords(): void {
    const g = this.game;
    const c = g.character;
    const cap = 10 + c.level * 1.6;
    for (let n = 0; n < 3; n++) {
      let best: { gain: number; loc: { tab: number; idx: number } | { inv: number }; rw: (typeof RUNEWORDS)[number]; steps: string[] } | null = null;
      const bases: { it: Item; loc: { tab: number; idx: number } | { inv: number } }[] = [];
      c.inventory.forEach((it, inv) => it && bases.push({ it, loc: { inv } }));
      c.stash.forEach((t, tab) => t.forEach((it, idx) => it && bases.push({ it, loc: { tab, idx } })));
      for (const { it, loc } of bases) {
        if ((it.quality !== 'normal' && it.quality !== 'superior') || it.sockets < 2 || it.socketed.length || it.runeword) continue;
        const b = baseOf(it);
        const slot = targetSlot(c, it);
        if (!slot) continue;
        for (const rw of RUNEWORDS) {
          if (rw.runes.length !== it.sockets || (RULES['char.equipNeedsReqs'](c) && rw.reqLvl > c.level) || !runewordFits(rw, b)) continue;
          const steps = runePlan(c.materials, rw.runes);
          if (!steps) continue;
          // simulation sur copies : même tirage de valeurs qu'une formation réelle, en moyenne
          const sim: Item = structuredClone(it);
          const fake = { ...c, materials: Object.fromEntries(rw.runes.map((r) => [r, 9])) } as CharacterState;
          const rng = new Rng(`rwsim:${rw.id}`);
          for (const r of rw.runes) socketItem(fake, rng, sim, { material: r });
          if (!sim.runeword) continue;
          const f = itemFinal(sim, c.level);
          if (reqsBlock(c, f, cap)) continue;
          const slots: Slot[] = b.slot === 'ring' ? ['ring1', 'ring2'] : [slot];
          for (const sl of slots) {
            const gain = valueWith(c, sim, sl, this.opt.build, g.difficulty) - valueWith(c, c.equipment[sl] ?? null, sl, this.opt.build, g.difficulty) - steps.length * 2;
            if (gain > 15 && (!best || gain > best.gain)) best = { gain, loc, rw, steps };
          }
        }
      }
      if (!best) return;
      for (const id of best.steps) if (!g.transmute(id, []).ok) return;
      let inv: number;
      if ('inv' in best.loc) inv = best.loc.inv;
      else {
        const target = c.stash[best.loc.tab][best.loc.idx];
        if (!g.unstash(best.loc.tab, best.loc.idx)) return;
        inv = c.inventory.indexOf(target);
      }
      for (const r of best.rw.runes) if (!g.socket({ invIndex: inv }, { material: r }).ok) return;
      this.stats.runewords = (this.stats.runewords ?? 0) + 1;
    }
  }

  /**
   * Gemmes (comme un joueur) : trois gemmes identiques montent au grade supérieur jusqu'à
   * « sans défaut » ; la parfaite (qui coûte une clé) seulement quand les clés abondent.
   */
  combineGems(): void {
    const g = this.game;
    const c = g.character;
    for (const r of CUBE_RECIPES) {
      if (r.category !== 'Gemmes') continue;
      const perfect = r.cost.some((k) => k.ids.includes('key'));
      for (let n = 0; n < 20; n++) {
        if (perfect && (c.materials.key ?? 0) < 6) break;
        if (!g.transmute(r.id, []).ok) break;
        this.stats.gemUps = (this.stats.gemUps ?? 0) + 1;
      }
    }
  }

  /**
   * Cube et sertissage de l'équipement (comme un joueur) : pour chaque objet porté et chaque
   * objet magique ou rare de l'inventaire, simule sur une copie du personnage les recettes d'un
   * objet (montée de base, artisanat, châsses) suivies des meilleures gemmes dans les châsses
   * libres, et applique la meilleure si le gain dépasse le coût des ingrédients. Les runes
   * restent aux mots runiques : seules les gemmes sont serties hors mot runique.
   */
  cubeGear(): void {
    const g = this.game;
    const c = g.character;
    // joyaux gardés au coffre : l'artisanat les veut dans l'inventaire
    for (let tab = 0; tab < c.stash.length; tab++)
      for (let idx = 0; idx < c.stash[tab].length; idx++) if (c.stash[tab][idx] && baseOf(c.stash[tab][idx]!).type === 'jewel' && c.inventory.filter((x) => !x).length > 2) g.unstash(tab, idx);
    const rules = botRules();
    rules.townCube(this.townCtx());
    for (let n = 0; n < 4; n++) {
      if (n) rules.townCube(this.townCtx());
      const best = this.bestCubeMove();
      if (!best) break;
      let idx: number;
      if (best.slot && best.fromSlot) {
        if (!g.unequip(best.slot).ok) break;
        idx = c.inventory.indexOf(best.item);
      } else idx = c.inventory.indexOf(best.item);
      if (idx < 0) break;
      if (best.recipe) {
        const r = g.transmute(best.recipe.id, [idx]);
        if (!r.ok) break;
        this.stats.cubeGear = (this.stats.cubeGear ?? 0) + 1;
      }
      const it = c.inventory[idx];
      if (!it) break;
      for (const gem of this.gemFill(c, it)) if (g.socket({ invIndex: idx }, { material: gem }).ok) this.stats.gems = (this.stats.gems ?? 0) + 1;
      if (best.slot) g.equip(idx, best.slot);
    }
    // gemmes dans les châsses libres de l'équipement porté (sans passer par l'inventaire)
    for (const sl of Object.keys(c.equipment) as Slot[]) {
      const it = c.equipment[sl];
      if (!it || !this.gemmable(it)) continue;
      const fill = this.gemFill(c, it);
      if (!fill.length) continue;
      const sim = structuredClone(it);
      const fake = { ...c, materials: { ...c.materials } } as CharacterState;
      for (const gem of fill) socketItem(fake, new Rng('gemsim'), sim, { material: gem });
      if (this.slotValue(sim, sl) - this.slotValue(it, sl) <= 2 * fill.length) continue;
      for (const gem of fill) if (g.socket({ slot: sl }, { material: gem }).ok) this.stats.gems = (this.stats.gems ?? 0) + 1;
    }
  }

  /** Châsses libres qu'on remplit de gemmes : pas sur une base normale (réservée aux mots runiques) */
  private gemmable(it: Item): boolean {
    return freeSockets(it) > 0 && !it.runeword && it.quality !== 'normal' && it.quality !== 'superior';
  }

  private slotValue(it: Item | null, sl: Slot): number {
    return valueWith(this.game.character, it, sl, this.opt.build, this.game.difficulty);
  }

  /** Meilleures gemmes (dans l'ordre) pour les châsses libres de `it`, choisies une à une par valeur */
  private gemFill(c: CharacterState, it: Item): string[] {
    if (!this.gemmable(it)) return [];
    const slot = targetSlot(c, it);
    if (!slot) return [];
    const mats = { ...c.materials };
    const sim = structuredClone(it);
    const out: string[] = [];
    while (freeSockets(sim) > 0) {
      let best: { id: string; v: number } | null = null;
      for (const id of Object.keys(mats)) {
        if (!(mats[id] > 0) || (!GEM_BY_ID[id] && !surplusRune(id, mats[id]))) continue;
        const t = structuredClone(sim);
        socketItem({ ...c, materials: { [id]: 1 } } as CharacterState, new Rng('gemsim'), t, { material: id });
        const v = this.slotValue(t, slot);
        if (!best || v > best.v) best = { id, v };
      }
      if (!best || best.v <= this.slotValue(sim, slot) + 1) break;
      socketItem({ ...c, materials: { [best.id]: 1 } } as CharacterState, new Rng('gemsim'), sim, { material: best.id });
      mats[best.id]--;
      out.push(best.id);
    }
    return out;
  }

  /** Coût d'une recette en « valeur » : les runes hautes (Lum et au-delà) coûtent leur rang */
  private recipeCost(r: CubeRecipe): number {
    let cost = 0;
    for (const k of r.cost)
      for (const id of k.ids.slice(0, 1)) {
        const rank = RUNES.find((x) => x.id === id)?.rank ?? 0;
        cost += k.n * (rank >= 17 ? rank * 2 : 3);
      }
    return cost + (r.effect.kind === 'craft' ? 8 : 0);
  }

  /** Meilleure recette d'équipement simulée (voir cubeGear), ou null */
  private bestCubeMove(): { item: Item; slot: Slot | null; fromSlot: boolean; recipe: CubeRecipe | null; gain: number } | null {
    const c = this.game.character;
    if (inventoryFree(c) <= 0) return null;
    const cap = 10 + c.level * 1.6;
    const cands: { item: Item; fromSlot: Slot | null }[] = [];
    for (const sl of Object.keys(c.equipment) as Slot[]) if (c.equipment[sl]) cands.push({ item: c.equipment[sl]!, fromSlot: sl });
    for (const it of c.inventory) if (it && (it.quality === 'magic' || it.quality === 'rare') && baseOf(it).slot) cands.push({ item: it, fromSlot: null });
    const hasJewel = c.inventory.some((x) => x && baseOf(x).type === 'jewel');
    // pré-filtre peu coûteux (ingrédients fixes disponibles) avant toute simulation
    const recipes = CUBE_RECIPES.filter(
      (r) =>
        r.items?.n === 1 &&
        (r.effect.kind === 'upgradeBase' || r.effect.kind === 'addSockets' || (r.effect.kind === 'craft' && hasJewel)) &&
        r.cost.every((k) => k.ids.reduce((a, id) => a + (c.materials[id] ?? 0), 0) >= k.n),
    );
    if (!recipes.length) return null;
    let best: { item: Item; slot: Slot | null; fromSlot: boolean; recipe: CubeRecipe | null; gain: number } | null = null;
    for (const { item, fromSlot } of cands) {
      if (item.corrupted || item.runeword) continue;
      const slots: Slot[] = fromSlot ? [fromSlot] : baseOf(item).slot === 'ring' ? ['ring1', 'ring2'] : [targetSlot(c, item)!].filter(Boolean);
      for (const r of recipes) {
        if (!itemAccepted(item, r.items!.accept)) continue;
        // simulation : copie du personnage, l'objet (déséquipé au besoin) dans l'inventaire
        const sim = structuredClone(c) as CharacterState;
        let idx = c.inventory.indexOf(item);
        if (fromSlot) {
          delete sim.equipment[fromSlot];
          const spot = findSlot(sim, item);
          if (spot < 0) continue;
          idx = spot;
          sim.inventory[idx] = structuredClone(item);
        }
        if (!cubeCheck(sim, r.id, [idx]).ok) continue;
        const samples = r.effect.kind === 'upgradeBase' ? 1 : 3;
        let total = 0;
        let ok = true;
        for (let k = 0; k < samples && ok; k++) {
          const s2 = k === samples - 1 ? sim : (structuredClone(sim) as CharacterState);
          const res = cubeTransmute(s2, new Rng(`cubesim:${r.id}:${item.uid}:${k}`), r.id, [idx]);
          const out = res.item;
          if (!res.ok || !out) {
            ok = false;
            break;
          }
          for (const gem of this.gemFill(s2, out)) socketItem(s2, new Rng('gemsim'), out, { material: gem });
          const f = itemFinal(out, c.level);
          if (reqsBlock(c, f, cap)) {
            ok = false;
            break;
          }
          total += Math.max(...slots.map((sl) => this.slotValue(out, sl) - this.slotValue(c.equipment[sl] ?? null, sl)));
        }
        if (!ok) continue;
        const gain = total / samples - this.recipeCost(r);
        if (gain > 10 && (!best || gain > best.gain)) best = { item, slot: fromSlot ?? slots[0] ?? null, fromSlot: !!fromSlot, recipe: r, gain };
      }
    }
    return best;
  }

  /** Vrai si le bot vient de mourir deux fois sur les trois dernières tentatives de `key` (retentée 3 niveaux plus tard) */
  private isRisky(key: string): boolean {
    const l = this.recentDeaths.get(key) ?? [];
    const deaths = l.filter((e) => e.died);
    if (deaths.length < 2) return false;
    const last = deaths[deaths.length - 1];
    // retentée trois niveaux plus tard, ou après 12 min de jeu : au niveau 75 (plafond de la phase) on ne
    // gagne presque plus de niveaux, et attendre « 3 niveaux » bloquerait le bot sur une run trop facile
    // (Baal en Cauchemar, porte de l'Enfer) pour toujours ; un joueur réessaie après avoir farmé du butin
    return this.game.character.level < last.level + 3 && this.playClock < last.at + 12 * 60;
  }

  /** Préparation de ville vue par le profil des bots (règle `bots.profile` : Cube, cartes d'endgame, mercenaire) */
  private townCtx(): BotTown {
    return {
      game: this.game,
      build: this.opt.build,
      elem: BUILD_ELEM[this.opt.build],
      melee: MELEE_BUILDS.has(this.opt.build),
      isRisky: (key) => this.isRisky(key),
      sold: () => {
        this.stats.sold++;
      },
    };
  }

  /** Carte d'endgame préparée par le jeu de règles (mod pd2 : cartes, orbes), ou null */
  prepareMap(): RunPlan | null {
    return botRules().prepareMap(this.townCtx());
  }

  spendSkillPoints(): void {
    const g = this.game;
    const c = g.character;
    const plan = buildPlan(this.opt.build);
    // game mode offers (rule `skills.offer`): each level's point goes to an offered skill, the plan's first wanted one, else the first
    // learnable one (none: the point is kept)
    for (let n = 0; g.offers.length && n < 200; n++) {
      const ids = g.offers[0].ids;
      const want = plan.find(([id, target]) => ids.includes(id) && (c.skills[id] ?? 0) < target && g.canLearn(id).ok)?.[0];
      if (!g.takeOffer(want ?? ids.find((id) => g.canLearn(id).ok) ?? null)) g.takeOffer(null);
    }
    // points kept: spent by hand only where the game mode allows it (rule `skills.manualLearn`; base: always)
    if (RULES['skills.manualLearn'](g)) return;
    let guard = 200;
    while (c.skillPoints > 0 && guard-- > 0) {
      let done = false;
      for (const [id, target] of plan) {
        if ((c.skills[id] ?? 0) >= target) continue;
        if (g.learnSkill(id)) {
          done = true;
          break;
        }
      }
      if (!done) break;
    }
  }

  /** Force/dextérité juste nécessaires aux objets utiles, le reste en vitalité (build classique) */
  spendStatPoints(): void {
    const g = this.game;
    const c = g.character;
    if (c.statPoints <= 0) return;
    let needStr = c.base.str;
    let needDex = c.base.dex;
    const cap = 10 + c.level * 1.6;
    for (const it of c.inventory) {
      if (!it || !baseOf(it).slot) continue;
      const slot = targetSlot(c, it);
      if (!slot) continue;
      const f = itemFinal(it, c.level);
      if (!RULES['char.equipNeedsReqs'](c) || reqsBlock(c, f, cap)) continue;
      if (valueWith(c, it, slot, this.opt.build, g.difficulty) <= valueWith(c, c.equipment[slot] ?? null, slot, this.opt.build, g.difficulty) + 5) continue;
      needStr = Math.max(needStr, f.reqStr);
      needDex = Math.max(needDex, f.reqDex);
    }
    // mêlée (ours-garou) : de la dextérité pour toucher (score d'attaque), comme un joueur D2
    if (MELEE_BUILDS.has(this.opt.build)) needDex = Math.max(needDex, Math.round(20 + c.level * 2.5));
    // Amazones : le score d'attaque décide du tir (un javelot ou une flèche manquée ne fait rien)
    if (this.opt.build === 'javazon' || this.opt.build === 'bowazon') needDex = Math.max(needDex, Math.round(20 + c.level * 2.5));
    const s = Math.min(c.statPoints, Math.max(0, needStr - c.base.str));
    if (s > 0) g.allocateStat('str', s);
    const d = Math.min(c.statPoints, Math.max(0, needDex - c.base.dex));
    if (d > 0) g.allocateStat('dex', d);
    // un peu d'énergie au tout début (mana), puis tout en vitalité
    if (c.statPoints > 0 && c.level < 8 && c.base.ene < 45) g.allocateStat('ene', Math.min(c.statPoints, 45 - c.base.ene));
    // sorcière : l'énergie suit le niveau, la réserve de mana se vide vite avec une régénération lente
    if (this.opt.build === 'cold' && c.statPoints > 0 && c.level >= 8) {
      const e = Math.min(c.statPoints, Math.max(0, Math.round(c.level * 1.2) - c.base.ene));
      if (e > 0) g.allocateStat('ene', e);
    }
    if (c.statPoints > 0) g.allocateStat('vit', c.statPoints);
  }

  /** Équipe toute amélioration trouvée (comparaison par valeur de build) */
  manageGear(): void {
    const g = this.game;
    const c = g.character;
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      for (let i = 0; i < c.inventory.length; i++) {
        const it = c.inventory[i];
        if (!it || !baseOf(it).slot) continue;
        if (!botCanWear(c, it, computeDerived(c, g.difficulty))) continue;
        const slots: Slot[] = baseOf(it).slot === 'ring' ? ['ring1', 'ring2'] : [targetSlot(c, it)!];
        let bestSlot: Slot | null = null;
        let bestGain = 0;
        for (const slot of slots) {
          const gain = valueWith(c, it, slot, this.opt.build, g.difficulty) - valueWith(c, c.equipment[slot] ?? null, slot, this.opt.build, g.difficulty);
          // emplacement vide : n'importe quel gain net suffit (un joueur D2 met toujours un casque)
          if (gain > Math.max(bestGain, c.equipment[slot] ? 3 : 0.3)) {
            bestGain = gain;
            bestSlot = slot;
          }
        }
        if (bestSlot && g.equip(i, bestSlot).ok) {
          this.stats.equips++;
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  /** Mercenaire voulu dans le jeu de règles (règle `bots.profile`) */
  wantedMerc(): WantedMerc | null {
    return botRules().wantedMerc(this.townCtx());
  }

  /** Recrute, ressuscite et équipe le mercenaire (inventaire et coffre) */
  manageMerc(): void {
    const g = this.game;
    const c = g.character;
    const want = this.wantedMerc();
    if (want && (!c.merc || c.merc.type !== want.type || (want.rehire && c.merc.variant !== want.variant))) {
      const offer = g.mercOffers().find((o) => o.type.id === want.type);
      // une réserve d'or pour les potions ; tôt dans la partie (niveau < 25), un mercenaire bon marché
      // est le meilleur investissement (D2 : on recrute dès l'acte I) : on économise pour lui
      const reserve = c.level < 25 ? 60 + c.level * 6 : 500 + c.level * 40;
      this.mercSaving = false;
      if (offer && c.gold >= offer.cost + reserve && g.hireMerc(want.type as MercId, want.variant).ok) this.stats.mercHires++;
      else if (offer && c.level < 25 && offer.cost < 900) this.mercSaving = true;
    }
    if (c.merc?.dead && c.gold >= g.resurrectCost() + 200) {
      if (g.resurrectMerc().ok) this.stats.mercRevives++;
    }
    if (!c.merc) return;
    const value = (): number => {
      const md = mercDerived(c, g.difficulty);
      if (!md) return 0;
      const t = MERC_BY_ID[c.merc!.type];
      const avg = t.style === 'caster' ? (md.spell[0] + md.spell[1]) / 2 : (md.dmg[0] + md.dmg[1]) / 2 + Object.values(md.added).reduce((a, r) => a + (r[0] + r[1]) / 2, 0);
      const off = (avg * (md.ar / (md.ar + 1000))) / md.atkTicks;
      const res = (md.res.fire + md.res.cold + md.res.light) / 3;
      const ehp = md.lifeMax * (1 + md.defense / 2000) * (100 / Math.max(25, 100 - res));
      const auras = md.auras.reduce((a, x) => a + (x.id === 'conviction' ? 3 : x.id === 'meditation' ? 1.5 : 0.5), 0);
      return Math.sqrt(off * ehp) * (1 + auras / 10);
    };
    for (let pass = 0; pass < 2; pass++) {
      let base = value();
      // inventaire puis coffre : l'objet qui améliore le plus chaque emplacement
      const cands: { it: Item; take: () => number }[] = [];
      c.inventory.forEach((it) => it && cands.push({ it, take: () => c.inventory.indexOf(it) }));
      c.stash.forEach((tab, t) =>
        tab.forEach((it, i) => {
          if (it && !it.map)
            cands.push({
              it,
              take: () => (g.unstash(t, i) ? c.inventory.indexOf(it) : -1),
            });
        }),
      );
      for (const { it, take } of cands) {
        const r = canMercEquip(c, it);
        if (!r.ok || !r.slot) continue;
        const prev = c.merc.equipment[r.slot];
        c.merc.equipment[r.slot] = it;
        const v = value();
        if (prev) c.merc.equipment[r.slot] = prev;
        else delete c.merc.equipment[r.slot];
        if (v <= base * 1.02) continue;
        const idx = take();
        if (idx >= 0 && g.mercEquip(idx).ok) {
          this.stats.mercEquips++;
          base = value();
        }
      }
    }
  }

  /** Vend ce qui n'est pas une amélioration ; garde uniques, sets et bases à châsses au coffre */
  sellJunk(): void {
    const g = this.game;
    const c = g.character;
    // inventaire des charmes : un charme qui n'apporte rien repasse dans le sac, d'où il est vendu ci-dessous
    for (let i = 0; i < c.charmInv.length; i++) {
      const it = c.charmInv[i];
      if (!it) continue;
      const before = gearValue(computeDerived(c, g.difficulty), this.opt.build);
      c.charmInv[i] = null;
      const after = gearValue(computeDerived(c, g.difficulty), this.opt.build);
      c.charmInv[i] = it;
      if (before - after <= 2) g.unstowCharm(i);
    }
    for (let i = 0; i < c.inventory.length; i++) {
      const it = c.inventory[i];
      if (!it) continue;
      const t = baseOf(it).type;
      if (t === 'smallcharm' || t === 'largecharm' || t === 'grandcharm') {
        // un charme n'est gardé (rangé dans l'inventaire des charmes) que s'il apporte quelque chose
        const slot = placeInCharmInv(c, it);
        if (slot >= 0) {
          const after = gearValue(computeDerived(c, g.difficulty), this.opt.build);
          c.charmInv[slot] = null;
          const before = gearValue(computeDerived(c, g.difficulty), this.opt.build);
          if (after - before > 2) {
            c.charmInv[slot] = it;
            c.inventory[i] = null;
            g.world.refreshPlayer();
            continue;
          }
        }
      }
      if (t === 'map') {
        // cartes : au coffre, sinon gardées dans l'inventaire (jamais vendues ici)
        for (let tab = 0; tab < c.stash.length && c.inventory[i]; tab++) g.stash(i, tab);
        continue;
      }
      if (this.worthKeeping(it)) {
        let stashed = false;
        for (let tab = 0; tab < c.stash.length && !stashed; tab++) stashed = g.stash(i, tab);
        if (stashed) continue;
      }
      if (g.sell(i)) this.stats.sold++;
    }
  }

  /**
   * Ce qui mérite le coffre : uniques et sets pas encore portables (niveau requis), bases à châsses
   * vides pour un mot runique accessible bientôt, monnaies. Le reste a déjà été comparé à
   * l'équipement porté et part chez le marchand.
   */
  worthKeeping(it: Item): boolean {
    const c = this.game.character;
    const b = baseOf(it);
    if (b.type === 'currency' || b.type === 'key') return true;
    // joyaux : ingrédient d'artisanat (trois de réserve)
    if (b.type === 'jewel') return [...c.inventory, ...c.stash.flat()].filter((x) => x && baseOf(x).type === 'jewel').length <= 3;
    if (it.quality === 'unique' || it.quality === 'set') return itemFinal(it, c.level).reqLvl > c.level;
    if ((it.quality === 'normal' || it.quality === 'superior') && it.sockets >= 2 && !it.socketed.length)
      return RUNEWORDS.some((rw) => rw.runes.length === it.sockets && rw.reqLvl <= c.level + 15 && runewordFits(rw, b));
    return false;
  }

  /** Vide le coffre de ce qui ne mérite plus d'y être (objets devenus portables et moins bons) */
  purgeStash(): void {
    const g = this.game;
    const c = g.character;
    for (let tab = 0; tab < c.stash.length; tab++)
      for (let idx = 0; idx < c.stash[tab].length; idx++) {
        const it = c.stash[tab][idx];
        if (!it || it.map || this.worthKeeping(it) || !hasRoomFor(c, it)) continue;
        if (!g.unstash(tab, idx)) continue;
        const i = c.inventory.indexOf(it);
        // un objet devenu portable a encore sa chance d'être équipé avant la vente
        if (baseOf(it).slot && botCanWear(c, it, computeDerived(c, g.difficulty))) continue;
        if (i >= 0 && g.sell(i)) this.stats.sold++;
      }
  }

  /**
   * Achat d'équipement chez le marchand (comme un joueur D2 avec son or) : l'objet au meilleur gain
   * de valeur, sans entamer la réserve de potions ; un emplacement vide se remplit dès qu'il y a un gain.
   */
  buyGear(): void {
    const g = this.game;
    const c = g.character;
    this.savingFor = 0;
    const kinds = BUILD_WEAPON_KINDS[this.opt.build];
    const mismatch = !!kinds && !(c.equipment.mainhand && kinds.includes(baseOf(c.equipment.mainhand).type));
    for (let n = 0; n < 6; n++) {
      // arme de style manquante (javelot, arc, griffes) : elle passe avant les potions
      const reserve = mismatch ? 0 : Math.max(25, c.level * 6) * 3;
      const d = computeDerived(c, g.difficulty);
      let best: { idx: number; gain: number } | null = null;
      let wish: { price: number; gain: number } | null = null;
      g.vendor.forEach((e, idx) => {
        const b = baseOf(e.item);
        if (!b.slot || !botCanWear(c, e.item, d)) return;
        const slots: Slot[] = b.slot === 'ring' ? ['ring1', 'ring2'] : [targetSlot(c, e.item)!];
        for (const sl of slots) {
          const gain = valueWith(c, e.item, sl, this.opt.build, g.difficulty) - valueWith(c, c.equipment[sl] ?? null, sl, this.opt.build, g.difficulty);
          if (gain <= (c.equipment[sl] ? 6 : 0.5)) continue;
          if (e.price <= c.gold - reserve) {
            if (!best || gain > best.gain) best = { idx, gain };
          } else if (b.slot === 'mainhand' && e.price <= c.gold + 300 && gain > (wish?.gain ?? 0)) wish = { price: e.price, gain };
        }
      });
      if (!best) {
        // une arme nettement meilleure est à portée : on met de l'or de côté (peu de potions)
        if (wish && (mismatch || (wish as { gain: number }).gain > 15)) this.savingFor = (wish as { price: number }).price;
        return;
      }
      const before = c.gold;
      if (!g.buy((best as { idx: number }).idx).ok) return;
      this.stats.goldSpent += before - c.gold;
      this.manageGear();
    }
  }

  /** Prix de l'arme de style que le bot met de côté (0 : rien à économiser) */
  private savingFor = 0;
  /** Économie en cours pour recruter un mercenaire */
  private mercSaving = false;

  buyPotions(): void {
    const g = this.game;
    const c = g.character;
    // le forgeron d'abord : un équipement brisé n'a plus aucun bonus
    const before0 = c.gold;
    if (g.repairQuote() > 0 && g.repairEquipment()) this.stats.goldSpent += before0 - c.gold;
    for (const kind of ['hp_potion', 'mp_potion'] as const) {
      // on économise pour l'arme de style : trois potions de soin suffisent, pas de mana
      const saving = this.savingFor > 0 || this.mercSaving;
      const cap = saving ? (kind === 'hp_potion' ? 3 : 0) : 16;
      const held = c.belt.filter((b) => b.kind === (kind === 'hp_potion' ? 'heal' : 'mana')).reduce((n, b) => n + b.qty, 0);
      for (let k = saving ? held : 0; k < cap; k++) {
        const before = c.gold;
        if (!g.buyConsumable(kind, 1).ok) break;
        this.stats.goldSpent += before - c.gold;
      }
    }
  }

  setupHotbar(): void {
    const c = this.game.character;
    const actives = Object.keys(c.skills).filter((id) => c.skills[id] > 0 && !SKILL_BY_ID[id].passive && id !== 'teleport');
    c.hotbar.slots = [...actives.slice(0, 8), ...new Array(Math.max(0, 8 - actives.length)).fill(null)];
  }

  /** Run débloquée la plus exigeante adaptée au niveau (le plus d'XP par minute) */
  chooseRun(): RunPlan | null {
    const lvOf = this.game.character.level;
    const hi = this.game.character.progression.highestDifficulty;
    // Vaches : lancées depuis le menu comme avant la recette du Cube, mais seulement au niveau conseillé et dans une difficulté déjà ouverte
    // Baal : le joueur peut s'y lancer dès 25/40/60 ; le bot garde ses niveaux d'origine (38/60/80), calibrés sur sa progression
    const BOT_BAAL_LEVEL = [38, 60, 80];
    const opts = this.game
      .runOptions()
      .filter((o) => o.unlocked && !o.run.botSkip && (o.run.id !== 'cows' || (lvOf >= o.run.recLevel[o.difficulty] && o.difficulty <= hi)))
      .filter((o) => o.run.id !== 'baal' || lvOf >= BOT_BAAL_LEVEL[o.difficulty])
      // le menu Rush ouvre le Cauchemar dès 40 et l'Enfer dès 60 pour le joueur ; le bot garde le niveau conseillé de chaque run
      .filter((o) => lvOf >= o.run.recLevel[o.difficulty]);
    // ordre d'avant le menu des Vaches : la run des Vaches vient en dernier (l'ordre départage les égalités, donc la trajectoire du bot)
    opts.sort((a, b) => Number(a.run.id === 'cows') - Number(b.run.id === 'cows'));
    if (!opts.length) return null;
    const lv = this.game.character.level;
    // la run débloquée qui rapporte le plus d'expérience par monstre (L-XP de la difficulté,
    // pénalité d'écart de niveau comprise) ; les niveaux conseillés protègent des runs trop dures
    const score = (x: (typeof opts)[number]) => {
      const zl = runZoneLevel(x.run, x.difficulty, lv);
      return levelXp(zl, x.difficulty) * levelDiffMultiplier(lv, zl);
    };
    // comme un joueur : on évite une run où l'on vient de mourir deux fois sur les trois dernières
    // (on la retente trois niveaux plus tard, mieux équipé)
    const risky = (x: (typeof opts)[number]) => this.isRisky(`${x.run.id}:${x.difficulty}`);
    opts.sort((a, b) => score(b) - score(a));
    // … sauf si l'alternative sûre rapporte moins de la moitié (pénalité d'écart de niveau) ;
    // une run où l'on meurt plus d'une fois sur deux est évitée quoi qu'elle rapporte
    const deadly = (x: (typeof opts)[number]) => {
      const l = this.recentDeaths.get(`${x.run.id}:${x.difficulty}`) ?? [];
      const d = l.filter((e) => e.died);
      return l.length >= 3 && d.length >= 2 && lv < d[d.length - 1].level + 6;
    };
    const safe = opts.find((x) => !risky(x));
    if (typeof process !== 'undefined' && process.env.DEBUG_CHOOSE)
      console.log('choose', lv, opts.map((x) => `${x.run.id}:${x.difficulty} s=${Math.round(score(x))} risky=${risky(x)} deadly=${deadly(x)}`).join(' | '), 'safe', safe?.run.id);
    let o = safe && (score(safe) >= 0.5 * score(opts[0]) || deadly(opts[0])) ? safe : opts[0];
    // la run « sûre » ne rapporte presque plus rien (Tristram à 16 au niveau 29) : mieux vaut retenter
    // une run plus dure, même où l'on est mort, que de tourner des heures sans progresser
    // choix empirique : chaque run est essayée trois fois au niveau actuel (± 2), puis on garde la plus
    // rentable en expérience par seconde (mort comprise : une run où l'on meurt en 10 s ne rapporte rien)
    if (safe && score(safe) < 0.1 * score(opts[0])) {
      const win = (x: (typeof opts)[number]) => (this.runSamples.get(`${x.run.id}:${x.difficulty}`) ?? []).filter((e) => Math.abs(e.level - lv) <= 2);
      const rate = (x: (typeof opts)[number]) => {
        const w = win(x);
        return (
          w.reduce((a, e) => a + e.xp, 0) /
          Math.max(
            1,
            w.reduce((a, e) => a + e.sec + this.opt.townSeconds, 0),
          )
        );
      };
      const untried = opts.find((x) => win(x).length < 3 && score(x) >= 0.3 * score(opts[0]));
      o = untried ?? opts.filter((x) => win(x).length >= 3).sort((a, b) => rate(b) - rate(a))[0] ?? o;
    }
    return { runId: o.run.id, difficulty: o.difficulty };
  }

  /* ------------------------------------------------------------------ */
  /* Run : une décision par tick                                         */
  /* ------------------------------------------------------------------ */

  /** Écrit l'entrée du joueur pour le prochain tick. */
  tick(): void {
    const w = this.game.world;
    const p = w.player;
    const inp = w.input;
    inp.moveX = 0;
    inp.moveY = 0;
    if (p.dead || w.zone.town) return;
    if (this.worldRef !== w) this.resetTactics(w);
    // comptabilité du temps : catégorie de la décision précédente, ou mode bloquant du joueur
    const cat = p.mode === 'cast' || p.mode === 'attack' ? 'incantation' : p.mode === 'hit' ? 'touché' : this.action.split(' ')[0] || 'début';
    this.stats.time[cat] = (this.stats.time[cat] ?? 0) + 1;
    const t = w.tick;
    if (p.hp < this.lastHp - 0.01) this.lastHurtTick = t;
    this.lastHp = p.hp;

    // potions
    if (p.potionCd <= 0) {
      if (p.hp < p.hpMax * 0.4 && this.hasPotion('rejuv')) inp.potion = 'rejuv';
      else if (p.hp < p.hpMax * 0.7 && p.healT <= 0 && this.hasPotion('heal')) inp.potion = 'heal';
      else if (p.mana < p.manaMax * 0.4 && p.manaHealT <= 0 && this.hasPotion('mana')) inp.potion = 'mana';
      if (inp.potion) this.stats.potions++;
    }
    if (p.mode === 'cast' || p.mode === 'attack' || p.mode === 'hit') return;

    // détection de blocage
    if (t - this.lastPos.tick >= TICK_HZ * 2) {
      if (dist(p.x, p.y, this.lastPos.x, this.lastPos.y) < 0.3 && this.pathGoal) {
        this.stats.stuckResets++;
        this.blacklist.set(`${Math.round(this.pathGoal.x)},${Math.round(this.pathGoal.y)}`, t + TICK_HZ * 20);
        this.path = [];
        this.pathGoal = null;
      }
      this.lastPos = { x: p.x, y: p.y, tick: t };
    }

    // boss de carte : un joueur voit les marqueurs au sol et s'en écarte (évitement minimal, mods/pd2/sim/map-boss.ts)
    const dodge = this.mapBossDodge();
    if (dodge) {
      this.action = 'esquive';
      this.fleeDir = dodge;
      this.fleeUntil = t + 6;
      inp.moveX = dodge.x;
      inp.moveY = dodge.y;
      return;
    }

    // fuite en cours
    if (t < this.fleeUntil) {
      this.action = 'fuite';
      inp.moveX = this.fleeDir.x;
      inp.moveY = this.fleeDir.y;
      return;
    }

    const near = w.monstersNear(p.x, p.y, 13);
    const threats = near.filter((m) => m.aggro || dist(p.x, p.y, m.x, m.y) < 8);

    // buffs, forme et créatures
    if (this.maintain(threats.length > 0)) return;
    if (threats.length) {
      this.idleTicks = 0;
      if (this.fight(threats)) return;
    }

    // ramassage
    const loot = this.nextLoot();
    if (loot) {
      this.idleTicks = 0;
      this.action = 'butin';
      if (dist(p.x, p.y, loot.x, loot.y) < 1.2) {
        const n = (this.pickTries.get(loot.id) ?? 0) + 1;
        this.pickTries.set(loot.id, n);
        inp.pickup = loot.id;
        this.stats.pickups++;
        return;
      }
      this.moveTo(loot.x, loot.y);
      return;
    }

    // exploration : monstres restants, déclencheurs, coffres
    const goal = this.exploreGoal();
    if (goal) {
      this.action = `explore ${goal.x.toFixed(0)},${goal.y.toFixed(0)}`;
      this.idleTicks = 0;
      if (goal.object && dist(p.x, p.y, goal.x, goal.y) < 1.4) {
        inp.interact = goal.object;
        return;
      }
      this.moveTo(goal.x, goal.y);
      return;
    }
    this.action = 'rien';
    this.idleTicks++;
  }

  /**
   * Direction pour sortir des zones télégraphiées d'un boss de carte (marqueurs au sol, zones persistantes, murs) qui
   * couvrent le personnage ; null s'il n'est dans aucune. Seules les zones posées par un boss de carte comptent.
   */
  private mapBossDodge(): { x: number; y: number } | null {
    const w = this.game.world;
    if (!w.run?.mapTier || !w.areas.length) return null;
    const p = w.player;
    const zones: { x: number; y: number; x2: number; y2: number; r: number; seg: boolean }[] = [];
    for (const a of w.areas) {
      if (a.dead || a.team !== 1 || (a.kind !== 'mb_mark' && a.kind !== 'mb_pool' && a.kind !== 'mon_firewall')) continue;
      if (!w.monsters.find((m) => m.id === a.owner)?.mapBoss) continue;
      zones.push({ x: a.x, y: a.y, x2: a.x2, y2: a.y2, r: a.radius + p.radius + 0.3, seg: a.kind === 'mon_firewall' });
    }
    if (!zones.length) return null;
    const inside = (x: number, y: number): number => {
      let n = 0;
      for (const z of zones) {
        let cx = z.x;
        let cy = z.y;
        if (z.seg) {
          const dx = z.x2 - z.x;
          const dy = z.y2 - z.y;
          const k = Math.max(0, Math.min(1, ((x - z.x) * dx + (y - z.y) * dy) / (dx * dx + dy * dy || 1)));
          cx = z.x + dx * k;
          cy = z.y + dy * k;
        }
        if (dist(x, y, cx, cy) <= z.r) n++;
      }
      return n;
    };
    if (!inside(p.x, p.y)) return null;
    // huit directions : la plus courte sortie praticable (le moins de zones à l'arrivée, puis la plus proche)
    let best: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let score = Infinity;
      for (const step of [1.5, 2.5, 3.5]) {
        const x = p.x + dx * step;
        const y = p.y + dy * step;
        if (!w.grid.walkLine(p.x, p.y, x, y, p.radius)) break;
        const n = inside(x, y);
        score = Math.min(score, n * 10 + step);
        if (n === 0) break;
      }
      if (score < bestScore) {
        bestScore = score;
        best = { x: dx, y: dy };
      }
    }
    return best;
  }

  private resetTactics(w: unknown): void {
    this.worldRef = w;
    this.path = [];
    this.pathGoal = null;
    this.pathTick = -999;
    this.lastPos = { x: 0, y: 0, tick: 0 };
    this.blacklist.clear();
    this.pickTries.clear();
    this.lastPersistent.clear();
    this.hopelessCache.clear();
    this.unreachable.clear();
    this.fleeUntil = 0;
    this.idleTicks = 0;
    this.lastHp = 0;
    this.lastHurtTick = -999;
    this.lastKite = -999;
  }

  /**
   * Buffs (armures, Bouclier d'énergie, Armure du cyclone), forme d'ours-garou et créatures du
   * Druide (loups, grizzly, corbeaux, liane, esprit). Renvoie vrai si un sort est lancé.
   */
  /** Dernier lancer d'Armure d'os (voir maintainClass) */
  private boneArmorAt = -1e9;

  maintain(fighting: boolean): boolean {
    const w = this.game.world;
    const p = w.player;
    const c = w.character;
    const has = (id: string) => (c.skills[id] ?? 0) > 0;
    const go = (id: string): boolean => {
      if (!canCast(w, id).ok) return false;
      this.action = `buff ${id}`;
      this.cast(id, p.x, p.y, 0);
      return true;
    };
    for (const b of botRules().buffs) {
      if (typeof b === 'string') {
        if (has(b) && !hasBuff(w, b) && go(b)) return true;
        continue;
      }
      // armures exclusives (une seule active à la fois) : la première apprise du groupe, si aucune n'est active
      const pick = b.find(has);
      if (pick && !b.some((x) => hasBuff(w, x)) && go(pick)) return true;
    }
    if (c.classId === 'barbarian') {
      // cris de guerre : précast, puis relance quand ils s'éteignent
      for (const id of ['battle_orders', 'battle_command', 'shout']) if (has(id) && !hasBuff(w, id) && go(id)) return true;
      return false;
    }
    if (c.classId !== 'druid') return this.maintainClass(fighting, has, go);
    const bear = this.melee();
    // esprit (Cœur du glouton pour les dégâts s'il est appris, sinon Sage du chêne) et liane (la
    // charognarde soigne) : une invocation ramène l'ours à forme humaine, on attend l'accalmie
    const spirit = ['heart_wolverine', 'oak_sage'].find(has);
    const vine = ['cycle_of_life', 'plague_poppy'].find(has);
    const calm = !fighting || !bear;
    if (calm && spirit && !petsOf(w).some((m) => SPIRITS.includes(m.pet!)) && go(spirit)) return true;
    if (calm && vine && !petsOf(w).some((m) => VINES.includes(m.pet!)) && go(vine)) return true;
    for (const id of ['grizzly', 'summon_fenris', 'spirit_wolf', 'raven']) {
      if (!has(id)) continue;
      const L = p.d.skillLevels[id] ?? 0;
      if (petsOf(w, id).length < petMax(id, L) && (calm || (id === 'raven' && !bear)) && go(id)) return true;
    }
    if (!bear && has('cyclone_armor') && !hasBuff(w, 'cyclone_armor') && go('cyclone_armor')) return true;
    if (bear && has('werebear') && playerForm(w) !== 'werebear' && go('werebear')) return true;
    return false;
  }

  /** Préparation propre aux classes D2 : auras du Paladin, Valkyrie, buffs de l'Assassin, créatures du Nécromancien */
  private maintainClass(fighting: boolean, has: (id: string) => boolean, go: (id: string) => boolean): boolean {
    const w = this.game.world;
    const p = w.player;
    const c = w.character;
    const minions = (...ids: string[]) => w.monsters.filter((m) => m.pet && !m.dead && ids.includes(m.pet));
    switch (c.classId) {
      case 'paladin': {
        const pref = this.opt.build === 'zealot' ? ['fanaticism', 'concentration', 'might'] : ['concentration', 'fanaticism', 'might'];
        const aura = pref.find(has);
        if (aura && p.d.aura?.id !== aura && go(aura)) return true;
        if (has('holy_shield') && !hasBuff(w, 'holy_shield') && (fighting || !w.zone.town) && go('holy_shield')) return true;
        return false;
      }
      case 'amazon': {
        if (has('valkyrie') && minions('valkyrie').length === 0 && go('valkyrie')) return true;
        return false;
      }
      case 'assassin': {
        for (const b of ['burst_of_speed', 'fade', 'venom']) if (has(b) && !hasBuff(w, b) && go(b)) return true;
        for (const b of ['shadow_master', 'shadow_warrior']) if (has(b) && minions('shadow_master', 'shadow_warrior').length === 0 && go(b)) return true;
        if (fighting && has('blade_shield') && !hasBuff(w, 'blade_shield') && go('blade_shield')) return true;
        return false;
      }
      case 'necromancer': {
        // en combat, l'Armure d'os s'épuise en une seconde en Enfer : la relancer sans cesse consomme tout le temps de jeu
        // (nécromancien poison : 2 Novas lancées en 10 s) ; au plus une fois par 8 s sous les coups
        if (has('bone_armor') && !hasBuff(w, 'bone_armor') && (!fighting || w.tick - this.boneArmorAt > TICK_HZ * 8) && go('bone_armor')) {
          this.boneArmorAt = w.tick;
          return true;
        }
        const golem = ['fire_golem', 'iron_golem', 'blood_golem', 'clay_golem'].find(has);
        if (golem && minions('clay_golem', 'blood_golem', 'iron_golem', 'fire_golem').length === 0 && go(golem)) return true;
        // cadavres proches : squelettes, mages, morts ressuscités
        const corpse = w.monsters.find((m) => m.dead && !m.isSummon && !m.eaten && !m.noLoot && dist(p.x, p.y, m.x, m.y) < 9 && w.tick - m.deathTick < TICK_HZ * 9);
        if (corpse) {
          for (const id of botRules().corpseRaises) {
            if (!has(id)) continue;
            const L = p.d.skillLevels[id] ?? 0;
            const max = Math.floor(lin(SKILL_BY_ID[id].n.count, L));
            if (minions(id).length >= max || !canCast(w, id).ok) continue;
            this.action = `cadavre ${id}`;
            this.cast(id, corpse.x, corpse.y, 0);
            return true;
          }
        }
        return false;
      }
    }
    return false;
  }

  /** Build de mêlée déjà transformé (avant l'ours-garou, l'ours joue comme un lanceur de sorts) */
  melee(): boolean {
    if (this.game.character.classId !== 'druid') return MELEE_BUILDS.has(this.opt.build);
    return MELEE_BUILDS.has(this.opt.build) && (this.game.character.skills.werebear ?? 0) > 0 && (this.game.character.skills.maul ?? 0) > 0;
  }

  /** Attaque d'arme d'une classe D2 (Barbare…) : dégâts attendus par seconde, cible et groupe */
  private weaponScore(id: string, threats: Monster[], closest: Monster, boss: Monster | undefined): { score: number; target: Monster } | null {
    const w = this.game.world;
    const p = w.player;
    const d = p.d;
    const s = SKILL_BY_ID[id];
    const L = d.skillLevels[id] ?? 0;
    if (L <= 0) return null;
    // Sacrifice coûte de la vie : seulement en pleine forme
    if (id === 'sacrifice' && p.hp < p.hpMax * 0.7) return null;
    const target = boss && dist(p.x, p.y, boss.x, boss.y) < 6 ? boss : closest;
    const m = weaponMastery(w);
    const wd = (s.n.wdmg ? ramp(s.n.wdmg, L) : id === 'berserk' ? lin(s.n.v3, L) : 0) + m.dmg + d.meleeDmgPct;
    const arb = (s.n.ar ? ramp(s.n.ar, L) : 0) + m.ar;
    const flat = s.n.flat ? ramp(s.n.flat, L) : 0;
    const thrown = isThrownKind(weaponKind(w)) && !!d.missileDmg;
    const wr = thrown ? d.missileDmg! : d.weaponDmg;
    const wAvg = (wr[0] + wr[1]) / 2;
    const offAvg = d.offDmg ? (d.offDmg[0] + d.offDmg[1]) / 2 : 0;
    let hits = 1;
    let cluster = 1;
    switch (id) {
      case 'double_swing':
        hits = 2;
        break;
      case 'multiple_shot': {
        // mesuré au moteur : ~17 % des flèches touchent une cible isolée, ~60 % un groupe de cinq
        const near = Math.min(5, threats.filter((o) => dist(target.x, target.y, o.x, o.y) < 3).length);
        hits = Math.floor(lin(s.n.count, L)) * (0.165 + 0.115 * (near - 1));
        break;
      }
      case 'strafe': {
        // toutes les flèches vont sur la cible seule, davantage de coups sur un groupe (mesuré au moteur)
        const near = Math.min(5, threats.filter((o) => dist(target.x, target.y, o.x, o.y) < 3).length);
        hits = Math.floor(lin(s.n.count, L)) * (0.95 + 0.08 * (near - 1));
        break;
      }
      case 'jab':
        hits = 3 * 0.9;
        break;
      case 'dragon_talon':
        hits = Math.floor(lin(s.n.count, L)) * 0.8;
        break;
      case 'charged_strike':
      case 'lightning_strike':
        hits = 1 + Math.floor(lin(s.n.count, L)) * 0.3;
        break;
      case 'lightning_fury':
        // éclairs secondaires à l'impact : ~1,6 coup sur une cible, plus sur un groupe
        hits = 1.6;
        cluster = Math.min(5, threats.filter((o) => dist(target.x, target.y, o.x, o.y) < 4).length);
        break;
      case 'fend':
        cluster = Math.min(5, threats.filter((o) => dist(p.x, p.y, o.x, o.y) < 2.6).length);
        break;
      case 'frenzy':
        hits = offAvg > 0 ? 2 : 1;
        break;
      case 'zeal':
        hits = Math.floor(lin(s.n.count, L));
        break;
      case 'whirlwind':
        // traverse le groupe : chaque monstre du chemin est touché une fois par arme
        cluster = Math.min(8, threats.filter((o) => dist(p.x, p.y, o.x, o.y) < 5).length);
        hits = offAvg > 0 ? 2 : 1;
        break;
      case 'berserk':
        break;
    }
    // Berserk PD2 (barbarian.ts) : dégâts PHYSIQUES qui réduisent la résistance physique de la cible (moitié contre une
    // immunité) ; le bot le croyait magique et insensible aux immunités, d'où des Berserk en boucle sur un unique
    // immunisé au physique (Tourbillon : morts en Enfer au lieu de décrocher)
    const berserkRed = id === 'berserk' ? lin(s.n.value ?? [0, 0], L) : 0;
    const physRes = effectiveMonsterRes(target.res.phys ?? 0, 0, d.sunder.phys ?? false, berserkRed);
    const magic = false;
    const mul = physRes.immune ? 0 : 1 - physRes.res / 100;
    const hit = hitChance(d.attackRating * (1 + arb / 100), target.defense, w.character.level, target.mlvl);
    const base = ((wAvg + (hits > 1 && offAvg > 0 ? offAvg : wAvg)) / 2) * (1 + wd / 100) + flat;
    let perHit = base * mul * hit;
    if (s.n.min && s.n.max && !magic && s.element !== 'phys') {
      const er = effectiveMonsterRes(target.res[s.element] ?? 0, d.pierce[s.element] ?? 0, d.sunder[s.element] ?? false);
      // dégâts élémentaires de la compétence avec synergies et bonus élémentaire (comme le moteur)
      const er2 = skillDamageRange(w, id, L);
      if (!er.immune) perHit += ((er2.min + er2.max) / 2) * (1 - er.res / 100) * hit;
    }
    const score = (perHit * hits * Math.pow(Math.max(1, cluster), 0.8) * TICK_HZ) / castFrames(w, id);
    void attackReach;
    void offhandWeapon;
    return score > 0 ? { score, target } : null;
  }

  /** Attaque animale du Druide : dégâts attendus par seconde et cible (null si inutilisable) */
  private meleeScore(id: string, threats: Monster[], closest: Monster, boss: Monster | undefined): { score: number; target: Monster } | null {
    const w = this.game.world;
    const p = w.player;
    const d = p.d;
    const s = SKILL_BY_ID[id];
    const L = d.skillLevels[id] ?? 0;
    if (L <= 0) return null;
    if (TREE_CLASS[s.tree] !== 'druid') return this.weaponScore(id, threats, closest, boss);
    const target = boss && dist(p.x, p.y, boss.x, boss.y) < 6 ? boss : closest;
    const wAvg = (d.weaponDmg[0] + d.weaponDmg[1]) / 2;
    const physRes = effectiveMonsterRes(target.res.phys ?? 0, 0, d.sunder.phys ?? false);
    let extra = 0;
    let hits = 1;
    let add = 0;
    let cluster = 1;
    let weaponMul = 1;
    const addElem = (lvl: number) => {
      const r = skillDamageRange(w, id, lvl);
      const er = effectiveMonsterRes(target.res[r.elem] ?? 0, d.pierce[r.elem] ?? 0, d.sunder[r.elem] ?? false);
      return er.immune ? 0 : ((r.min + r.max) / 2) * (1 - er.res / 100);
    };
    const physAdd = () => {
      const r = skillDamageRange(w, id, L);
      return r.elem === 'phys' ? (r.min + r.max) / 2 : 0;
    };
    switch (id) {
      case 'feral_rage':
        extra = lin(s.n.value, L);
        add = physAdd() * (physRes.immune ? 0 : 1 - physRes.res / 100);
        break;
      case 'maul': {
        const stacks = p.buffs.find((b) => b.id === 'maul')?.stacks ?? 0;
        extra = lin(s.n.value, L) * (1 + stacks);
        add = physAdd() * (1 + (lin(s.n.value, L) * stacks) / 100) * (physRes.immune ? 0 : 1 - physRes.res / 100);
        break;
      }
      case 'fury':
        extra = lin(s.n.value, L);
        add = physAdd() * (physRes.immune ? 0 : 1 - physRes.res / 100);
        hits = Math.min(5, Math.floor(lin(s.n.count, L)));
        break;
      case 'fire_claws':
      case 'hunger':
      case 'rabies':
        add = addElem(L);
        break;
      case 'shock_wave':
        weaponMul = 0.5;
        add = addElem(L);
        cluster = Math.min(8, threats.filter((m) => dist(p.x, p.y, m.x, m.y) < lin(s.n.radius, L)).length);
        if (cluster === 0) return null;
        break;
    }
    const physMul = physRes.immune ? 0 : 1 - physRes.res / 100;
    const hit = id === 'shock_wave' ? 1 : hitChance(d.attackRating * (1 + meleeArBonus(L) / 100), target.defense, w.character.level, target.mlvl);
    const perHit = (wAvg * weaponMul * (1 + (d.meleeDmgPct + extra) / 100) * physMul + add) * hit;
    const score = (perHit * hits * Math.pow(cluster, 0.8) * TICK_HZ) / castFrames(w, id);
    return score > 0 ? { score, target } : null;
  }

  /** Dégâts par seconde des créatures en jeu (loups, grizzly, corbeaux, liane empoisonnée) */
  private petDps(): number {
    let dps = 0;
    for (const m of petsOf(this.game.world)) if (m.dmgMax > 0) dps += ((m.dmgMin + m.dmgMax) / 2) * (TICK_HZ / Math.max(1, m.def.attacks[0].cooldown));
    return dps;
  }

  /** Dégâts par seconde du mercenaire contre un monstre (immunités comprises) */
  private mercDps(m: Monster): number {
    const w = this.game.world;
    const merc = mercOf(w);
    const md = merc ? mercDerived(w.character, w.difficulty) : null;
    if (!merc || !md) return 0;
    const t = MERC_BY_ID[w.character.merc!.type];
    const part = (elem: Element, avg: number) => {
      const er = effectiveMonsterRes(m.res[elem] ?? 0, 0, false, monsterReduction(w, m, elem, null));
      return er.immune ? 0 : avg * (1 - er.res / 100);
    };
    let hit = 0;
    if (t.style === 'caster') hit = part(t.variants.find((v) => v.id === w.character.merc!.variant)?.elem ?? 'fire', (md.spell[0] + md.spell[1]) / 2);
    else {
      hit = part('phys', (md.dmg[0] + md.dmg[1]) / 2) * hitChance(md.ar, m.defense, md.lvl, m.mlvl);
      for (const [e, r] of Object.entries(md.added)) hit += part(e as Element, (r[0] + r[1]) / 2);
    }
    return (hit * TICK_HZ) / md.atkTicks;
  }

  private hasPotion(kind: 'heal' | 'mana' | 'rejuv'): boolean {
    return this.game.character.belt.some((b) => b.kind === kind && b.qty > 0);
  }

  private cast(skill: string, tx: number, ty: number, targetId: number): void {
    this.action = `sort ${skill}`;
    this.game.world.input.cast = { skill, tx, ty, targetId };
    this.stats.casts[skill] = (this.stats.casts[skill] ?? 0) + 1;
    if (skill === 'teleport') this.stats.teleports++;
  }

  /** Choix et lancement d'une attaque ; renvoie faux si rien d'utile n'a été fait */
  private fight(threats: Monster[]): boolean {
    const w = this.game.world;
    const p = w.player;
    const c = w.character;
    // cibles : on renonce aux monstres qu'on ne peut pas tuer (on les contourne, comme en PD2), et
    // pour 10 s à ceux qu'on ne peut pas rejoindre (derrière une clôture, hors de vue)
    const targets = threats.filter((m) => !this.hopeless(m) && !((this.unreachable.get(m.id) ?? 0) > w.tick));
    let closest = targets[0] ?? threats[0];
    let cd = Infinity;
    for (const m of targets) {
      const d = dist(p.x, p.y, m.x, m.y);
      if (d < cd) {
        cd = d;
        closest = m;
      }
    }
    // jeu de règles qui le demande (D2) : comme un joueur, le chaman qui ressuscite son groupe tombe d'abord (sinon la mêlée frappe sans fin
    // des Déchus relevés aussitôt) : cible prioritaire s'il est à portée et atteignable
    if (botRules().focusRevivers) {
      let rd = 7;
      for (const m of targets) {
        const d = dist(p.x, p.y, m.x, m.y);
        if (d < rd && m.def.attacks.some((a) => a.revive) && w.grid.walkLine(p.x, p.y, m.x, m.y)) {
          rd = d;
          closest = m;
          cd = d;
        }
      }
    }
    // au contact : monstre agressif réellement atteignable (pas derrière une clôture)
    const adjacent = threats.filter((m) => m.aggro && dist(p.x, p.y, m.x, m.y) < m.radius + p.radius + 0.9 && w.grid.walkLine(m.x, m.y, p.x, p.y)).length;
    const underFire = w.tick - this.lastHurtTick < TICK_HZ * 1.5;

    // sortir de la mêlée quand la vie baisse ou qu'on est encerclé
    const meleeBuild = this.melee();
    const f: FightCtx = { w, p, c, threats, targets, closest, cd, adjacent, underFire, meleeBuild };
    for (const step of [
      this.fightShouts,
      this.fightEscape,
      this.fightDisengage,
      this.fightKite,
      this.fightStatic,
      this.fightNoTarget,
      this.fightStorms,
      this.fightCurses,
      this.fightMartial,
      this.fightHammer,
    ]) {
      const r = step.call(this, f);
      if (r !== undefined) return r;
    }
    return this.fightBest(f);
  }

  /** Barbare encerclé : cris de guerre quand la vie baisse (étourdissement, affaiblissement, fuite des monstres) */
  private fightShouts(f: FightCtx): boolean | undefined {
    const { w, p, c, adjacent } = f;
    // Barbare encerclé : cris de guerre (étourdissement, affaiblissement, fuite des monstres), comme un joueur D2
    // (seulement quand la vie baisse : le cri n'est pas une attaque, il ne doit pas retarder les kills)
    if (c.classId === 'barbarian' && w.difficulty >= 2 && adjacent >= 4 && p.hp < p.hpMax * 0.65) {
      for (const id of ['war_cry', 'battle_cry', 'howl']) {
        if (id === 'howl' && p.hp > p.hpMax * 0.4) continue;
        if ((c.skills[id] ?? 0) > 0 && canCast(w, id).ok && p.mana >= skillManaCost(w, id)) {
          this.cast(id, p.x, p.y, 0);
          return true;
        }
      }
    }
    return undefined;
  }

  /** Sous le feu, vie basse ou encerclé : téléportation à l’opposé, ou fuite brève (la mêlée tient et boit) */
  private fightEscape(f: FightCtx): boolean | undefined {
    const { w, p, c, threats, adjacent, underFire, meleeBuild } = f;
    if (underFire && (meleeBuild ? p.hp < p.hpMax * 0.35 && adjacent >= 1 : (adjacent >= 1 && p.hp < p.hpMax * 0.55) || adjacent >= 4)) {
      const esc = this.escapeDir(threats);
      if ((c.skills.teleport ?? 0) > 0 && canCast(w, 'teleport').ok && p.mana > skillManaCost(w, 'teleport') + 10) {
        const tx = p.x + esc.x * 9;
        const ty = p.y + esc.y * 9;
        const f = w.grid.nearestFree(tx, ty, 3);
        if (f) {
          this.cast('teleport', f.x, f.y, 0);
          return true;
        }
      }
      // la mêlée ne fuit pas des monstres plus rapides qu'elle (Déchus, loups) : elle tient et boit
      if (adjacent >= 2 && p.hp < p.hpMax * 0.4 && !(meleeBuild && (this.hasPotion('heal') || this.hasPotion('rejuv')))) {
        this.fleeDir = esc;
        this.fleeUntil = w.tick + Math.round(TICK_HZ * 0.6);
        return true;
      }
    }
    return undefined;
  }

  /** Plus de soins et vie basse sous le feu : décrochage hors de vue par téléportation */
  private fightDisengage(f: FightCtx): boolean | undefined {
    const { w, p, c, threats, underFire } = f;
    // plus de soins et la vie basse sous le feu : on décroche hors de vue (téléportation)
    const noHeal = !this.hasPotion('heal') && !this.hasPotion('rejuv');
    if (underFire && noHeal && p.hp < p.hpMax * 0.5 && (c.skills.teleport ?? 0) > 0 && canCast(w, 'teleport').ok && p.mana > skillManaCost(w, 'teleport') + 10) {
      const esc = this.escapeDir(threats);
      for (const d of [10, 7, 5]) {
        const f = w.grid.nearestFree(p.x + esc.x * d, p.y + esc.y * d, 3);
        if (f && w.grid.lineOfSight(p.x, p.y, f.x, f.y)) {
          this.cast('teleport', f.x, f.y, 0);
          return true;
        }
      }
    }
    return undefined;
  }

  /** Jeu à distance : recul bref quand la mêlée arrive au contact */
  private fightKite(f: FightCtx): boolean | undefined {
    const { w, p, c, threats, meleeBuild } = f;
    // garder ses distances (jeu de Sorcière) : recul bref quand la mêlée arrive au contact
    const melee = threats.filter((m) => m.aggro && !m.def.keepDistance && dist(p.x, p.y, m.x, m.y) < 2.6).length;
    const novaReady = (c.skills.frost_nova ?? 0) > 0 && canCast(w, 'frost_nova').ok && melee >= 3;
    if (!meleeBuild && !novaReady && ((melee >= 1 && p.hp < p.hpMax * 0.8) || melee >= 3) && w.tick - this.lastKite > TICK_HZ * 0.9) {
      const esc = this.escapeDir(threats);
      this.lastKite = w.tick;
      this.fleeDir = esc;
      this.fleeUntil = w.tick + Math.round(TICK_HZ * 0.45);
      this.action = 'recul';
      return true;
    }
    return undefined;
  }

  /** Build foudre : Champ statique d’abord sur un groupe ou une élite sans réduction active */
  private fightStatic(f: FightCtx): boolean | undefined {
    const { w, p, targets } = f;
    // build foudre : Champ statique d'abord pour réduire la résistance du groupe (PD2), si
    // au moins deux cibles ou une élite proches n'ont plus la réduction active
    // (seulement quand il réduit vraiment : niveau effectif ≥ 6, résistance ≥ 25 %)
    if (this.opt.build === 'light' && targets.length && (p.d.skillLevels.static_field ?? 0) >= 6 && canCast(w, 'static_field').ok) {
      const r = RULES['skills.sorceress']().staticRadius(p.d.skillLevels.static_field ?? 1, SKILL_BY_ID.static_field.n.radius) - 0.5;
      const bare = targets.filter((m) => dist(p.x, p.y, m.x, m.y) < r && (m.res.light ?? 0) >= 25 && !((m.red.light?.until ?? 0) > w.tick));
      if (bare.length >= 2 || bare.some((m) => m.rank !== 'normal' && m.rank !== 'minion')) {
        this.cast('static_field', p.x, p.y, 0);
        return true;
      }
    }
    return undefined;
  }

  /** Uniquement des monstres abandonnés : décrochage s’ils nous touchent (faux : rien à faire) */
  private fightNoTarget(f: FightCtx): boolean | undefined {
    const { w, p, c, threats, targets, underFire } = f;
    if (!targets.length) {
      // uniquement des monstres abandonnés : on décroche (téléportation) s'ils nous touchent
      if (!underFire) return false;
      const esc = this.escapeDir(threats);
      if ((c.skills.teleport ?? 0) > 0 && canCast(w, 'teleport').ok && p.mana > skillManaCost(w, 'teleport') + 10) {
        const f = w.grid.nearestFree(p.x + esc.x * 10, p.y + esc.y * 10, 3);
        if (f && w.grid.lineOfSight(p.x, p.y, f.x, f.y)) {
          this.cast('teleport', f.x, f.y, 0);
          return true;
        }
      }
      this.fleeDir = esc;
      this.fleeUntil = w.tick + Math.round(TICK_HZ * 0.8);
      this.action = 'décroche';
      return true;
    }
    return undefined;
  }

  /** Druide : Ouragan et Armageddon quand les ennemis approchent */
  private fightStorms(f: FightCtx): boolean | undefined {
    const { w, p, c, targets } = f;
    // Druide : Ouragan et Armageddon tournent autour de lui quand les ennemis approchent
    for (const b of ['hurricane', 'armageddon']) {
      if ((c.skills[b] ?? 0) > 0 && !hasBuff(w, b) && canCast(w, b).ok && targets.some((m) => dist(p.x, p.y, m.x, m.y) < 6)) {
        this.cast(b, p.x, p.y, 0);
        return true;
      }
    }
    return undefined;
  }

  /** Nécromancien : malédiction du groupe ou de l’élite */
  private fightCurses(f: FightCtx): boolean | undefined {
    const { w, p, c, targets, closest } = f;
    // malédictions du Nécromancien sur le groupe ou l'élite
    if (c.classId === 'necromancer') {
      const curses = this.opt.build === 'pnova' ? ['lower_resist', 'amplify_damage'] : this.opt.build === 'bonemancer' ? ['decrepify', 'weaken'] : ['amplify_damage', 'lower_resist'];
      const id = curses.find((x) => (c.skills[x] ?? 0) > 0);
      if (id && canCast(w, id).ok) {
        // champions possédés : insensibles aux malédictions (applyCurse) ; sans ce filtre le bot relançait la même
        // malédiction à l'infini sans jamais attaquer (nécromancien poison : 70 % de morts ou de combats sans fin)
        const curable = targets.filter((m) => !m.mods.includes('possessed'));
        const t = curable.find((m) => m.rank !== 'normal' && m.rank !== 'minion') ?? curable.find((m) => m === closest) ?? curable[0];
        const cursed = (m: Monster) => (activeCurse(m, id, w.tick)?.until ?? 0) > w.tick + TICK_HZ * 2;
        const pack = t ? targets.filter((m) => dist(m.x, m.y, t.x, t.y) < 4).length : 0;
        if (t && !cursed(t) && dist(p.x, p.y, t.x, t.y) < 10 && (pack >= 3 || t.rank !== 'normal')) {
          this.cast(id, t.x, t.y, t.id);
          return true;
        }
      }
    }
    return undefined;
  }

  /** Arts martiaux : trois charges puis un coup de finition */
  private fightMartial(f: FightCtx): boolean | undefined {
    const { w, p, c, closest } = f;
    // arts martiaux : trois charges puis un coup de finition
    if (this.opt.build === 'martial') {
      const fin = ['dragon_claw', 'dragon_talon', 'dragon_tail'].filter((x) => (c.skills[x] ?? 0) > 0 && canCast(w, x).ok).sort((a, b) => (c.skills[b] ?? 0) - (c.skills[a] ?? 0))[0];
      const ups = ['phoenix_strike', 'claws_of_thunder', 'blades_of_ice', 'fists_of_fire', 'cobra_strike', 'tiger_strike'].filter((x) => (c.skills[x] ?? 0) > 0 && canCast(w, x).ok);
      // PD2 : les charges produisent leur effet à chaque coup (cycle de trois) ; le coup de finition consomme les charges du Tigre
      const tiger = chargeCount(w, 'tiger_strike');
      const t = closest;
      const td2 = dist(p.x, p.y, t.x, t.y);
      const reach = attackReach(w) + t.radius + p.radius - 0.15;
      if (td2 > reach) {
        this.moveTo(t.x, t.y);
        return true;
      }
      if (fin && (tiger >= 3 || !ups.length)) {
        this.cast(fin, t.x, t.y, t.id);
        return true;
      }
      const up = [...ups].filter((x) => x !== 'tiger_strike').sort((a, b) => (c.skills[b] ?? 0) - (c.skills[a] ?? 0))[0] ?? ups[0];
      if (up) {
        this.cast(up, t.x, t.y, t.id);
        return true;
      }
      if (fin) {
        this.cast(fin, t.x, t.y, t.id);
        return true;
      }
    }
    return undefined;
  }

  /** Marteau béni en boucle dès que des monstres sont dans la spirale */
  private fightHammer(f: FightCtx): boolean | undefined {
    const { w, p, targets, closest } = f;
    // Marteau béni : le Paladin le lance en boucle dès que des monstres sont dans la spirale
    if (this.opt.build === 'hammerdin' && canCast(w, 'blessed_hammer').ok && p.mana > skillManaCost(w, 'blessed_hammer') + p.manaMax * 0.05) {
      const near = targets.filter((m) => dist(p.x, p.y, m.x, m.y) < 5.5);
      // les tireurs gardent leurs distances : on s'approche jusqu'à ce que la spirale les atteigne
      if (!near.length) {
        this.moveTo(closest.x, closest.y);
        return true;
      }
      if (near.length) {
        const t = near.find((m) => m.rank === 'boss' || m.rank === 'unique') ?? near.reduce((a, b) => (dist(p.x, p.y, a.x, a.y) < dist(p.x, p.y, b.x, b.y) ? a : b));
        this.cast('blessed_hammer', t.x, t.y, t.id);
        return true;
      }
    }
    return undefined;
  }

  /** Meilleur sort (bestSkill) : approche, ligne de vue, lancer ; sans sort possible, coup d’arme, approche ou recul */
  private fightBest(f: FightCtx): boolean {
    const { w, p, threats, targets, closest, cd, adjacent, underFire, meleeBuild } = f;
    // meilleur sort
    const best = this.bestSkill(targets, closest, adjacent);
    if (!best) {
      // plus de mana : on s'éloigne en attendant la régénération ou on frappe au bâton
      if (cd < 1.8) {
        this.cast('attack', closest.x, closest.y, closest.id);
        return true;
      }
      // la mêlée s'approche pour frapper à l'arme plutôt que de reculer (sans mana ni vie pour son sort)
      if (meleeBuild && cd < 12) {
        this.moveTo(closest.x, closest.y);
        return true;
      }
      if (cd < 5 && underFire) {
        const esc = this.escapeDir(threats);
        this.fleeDir = esc;
        this.fleeUntil = w.tick + Math.round(TICK_HZ * 0.4);
        this.action = 'recul (mana)';
        return true;
      }
      return false;
    }
    const { skill, target } = best;
    const s = SKILL_BY_ID[skill];
    // Charge électrique tirée de près : l'éventail se referme sur la cible
    const range = skill === 'attack' ? 1.5 : s?.melee ? s.range + target.radius + p.radius - 0.15 : skill === 'charged_bolt' ? 5 : Math.max(2, (s?.range ?? 8) * 0.85);
    const td = dist(p.x, p.y, target.x, target.y);
    const needLos = skill !== 'frost_nova' && skill !== 'static_field' && skill !== 'nova' && skill !== 'shock_wave';
    if (td > range || (needLos && td > 2 && !w.grid.lineOfSight(p.x, p.y, target.x, target.y))) {
      // chemin bloqué vers la cible (détection de blocage) : cible inaccessible pour un temps
      if (this.blacklisted(target.x, target.y)) {
        this.unreachable.set(target.id, w.tick + TICK_HZ * 10);
        return false;
      }
      this.moveTo(target.x, target.y);
      return true;
    }
    this.cast(skill, target.x, target.y, target.id);
    if (botRules().persistent[skill])
      this.lastPersistent.set(skill, {
        x: target.x,
        y: target.y,
        tick: w.tick,
      });
    return true;
  }

  /**
   * The attack the bot would use now against these monsters, without moving (lot 290: a game mode's semi-automatic control, the player on
   * the joystick and every skill cast on its own): the most profitable skill and its target, else null (the caller swings its weapon)
   */
  attackChoice(threats: Monster[]): { skill: string; target: Monster } | null {
    const p = this.game.world.player;
    if (!threats.length) return null;
    let closest = threats[0];
    for (const m of threats) if (dist(p.x, p.y, m.x, m.y) < dist(p.x, p.y, closest.x, closest.y)) closest = m;
    const adjacent = threats.filter((m) => dist(p.x, p.y, m.x, m.y) < m.radius + p.radius + 0.9).length;
    const best = this.bestSkill(threats, closest, adjacent);
    return best ? { skill: best.skill, target: best.target } : null;
  }

  /** Sort le plus rentable contre ce groupe (dégâts attendus par seconde, résistances comprises) */
  private bestSkill(threats: Monster[], closest: Monster, adjacent: number): { skill: string; target: Monster; score: number } | null {
    const w = this.game.world;
    const p = w.player;
    const c = w.character;
    let best: { skill: string; target: Monster; score: number } | null = null;
    const boss = threats.find((m) => m.rank === 'boss' || m.rank === 'unique');
    for (const id of Object.keys(c.skills)) {
      if (!(c.skills[id] > 0)) continue;
      const s = SKILL_BY_ID[id];
      if (!s || s.passive || s.buff || s.tree === 'summon' || id === 'teleport' || id === 'telekinesis') continue;
      if (s.kind === 'minion' || s.kind === 'curse' || s.kind === 'aura' || s.kind === 'shout' || s.kind === 'charge' || s.kind === 'finisher' || NEEDS_CORPSE.has(id)) continue;
      if (!canCast(w, id).ok) continue;
      // garder du mana pour la fuite
      if (p.mana - skillManaCost(w, id) < p.manaMax * 0.08 && id !== 'fire_bolt' && id !== 'ice_bolt' && id !== 'charged_bolt' && id !== 'firestorm') continue;
      // l'ours-garou ne lance pas de sort (il reprendrait forme humaine)
      if (c.classId === 'druid' && this.melee() && !s.melee) continue;
      // Amazones à distance : elles ne s'approchent pas pour frapper au corps à corps
      // (tant qu'elles n'ont pas l'arme de tir/jet : sans javelot ni arc, Estoc vaut mieux qu'une dague)
      if ((this.opt.build === 'javazon' || this.opt.build === 'bowazon') && s.melee && s.range < 4 && (isThrownKind(weaponKind(w)) || isRangedKind(weaponKind(w)))) continue;
      let target = closest;
      let score = 0;
      if (s.melee) {
        const m = this.meleeScore(id, threats, closest, boss);
        if (!m) continue;
        if (!best || m.score > best.score) best = { skill: id, target: m.target, score: m.score };
        continue;
      }
      if (id === 'static_field') {
        const t = boss ?? closest;
        if (dist(p.x, p.y, t.x, t.y) > 4.5) continue;
        // plancher du Champ statique du jeu de règles (marge comprise) : inutile en dessous
        const pct = t.hp / t.hpMax;
        if (pct < botRules().staticCutoff(w.difficulty)) continue;
        score = t.hpMax * 0.25 * (t.rank === 'boss' ? 0.5 : 1) * (1 - Math.max(0, t.res.light) / 100);
        target = t;
      } else {
        const r = skillDamageRange(w, id);
        let avg = (r.min + r.max) / 2;
        if (avg <= 0) continue;
        // Charge électrique : un éventail d'éclairs, dont ~45 % touchent à courte portée
        if (id === 'charged_bolt') avg *= Math.max(1, Math.floor(lin(s.n.count, c.skills[id] ?? 1)) * 0.45);
        const frames = castFrames(w, id);
        // cible : l'élite pour le mono-cible, le centre du groupe pour les zones
        if (botLists().aoe.has(id)) {
          let bc = -1;
          for (const m of threats) {
            const n = threats.filter((o) => dist(o.x, o.y, m.x, m.y) < 3).length;
            if (n > bc) {
              bc = n;
              target = m;
            }
          }
        } else if (boss) target = boss;
        const er = effectiveMonsterRes(target.res[r.elem] ?? 0, p.d.pierce[r.elem] ?? 0, p.d.sunder[r.elem] ?? false, monsterReduction(w, target, r.elem, null));
        if (er.immune) continue;
        let resMul = 1 - er.res / 100;
        // Druide : second élément (Rocher en fusion, Volcan), trois vagues de Tempête de feu
        const r2 = skillDamageRange2(w, id);
        if (r2) {
          const er2 = effectiveMonsterRes(target.res[r2.elem] ?? 0, p.d.pierce[r2.elem] ?? 0, p.d.sunder[r2.elem] ?? false, monsterReduction(w, target, r2.elem, null));
          if (!er2.immune) resMul += (((r2.min + r2.max) / 2) * (1 - er2.res / 100)) / avg;
        }
        if (id === 'firestorm') avg *= 1.5;
        // Dents : une gerbe de projectiles en éventail, ~22 % touchent une cible à distance, ~55 % au contact (mesuré au moteur)
        if (id === 'teeth') {
          const td = dist(p.x, p.y, target.x, target.y);
          avg *= Math.floor(lin(s.n.count, c.skills[id] ?? 1)) * (td < 2 ? 0.55 : td < 4 ? 0.35 : 0.22);
        }
        // la Concentration renforce aussi le Marteau béni
        if (id === 'blessed_hammer') avg *= 1 + p.d.concDmgPct / 100;
        const cluster = botLists().aoe.has(id) ? Math.min(6, threats.filter((o) => dist(o.x, o.y, target.x, target.y) < 3).length) : 1;
        let dps = (avg * resMul * Math.pow(cluster, 0.8) * TICK_HZ) / frames;
        // dégâts de poison sur la durée : ils ne se cumulent pas (le poison est relancé), la cadence utile est total / durée
        if (s.n.duration && (s.element === 'poison' || botLists().dots.has(id))) {
          const secs = lin(s.n.duration, c.skills[id] ?? 1);
          dps = (avg * resMul * Math.pow(cluster, 0.8)) / Math.max(secs, frames / TICK_HZ);
        }
        if (botRules().persistent[id]) {
          // effet posé : dégâts par seconde pendant sa durée ; les zones se cumulent (Blizzard,
          // Météore), leur cadence est limitée par le temps de recharge ou d'incantation
          const cd = Math.max(s.n.cooldown ?? 0, frames / TICK_HZ);
          dps = (avg * resMul * Math.pow(cluster, 0.8) * botRules().persistent[id]) / cd;
          // les hydres ne se cumulent pas au-delà du maximum : pas de relance au même endroit
          const last = this.lastPersistent.get(id);
          if (botLists().noStack.has(id) && last && w.tick - last.tick < botRules().persistent[id] * TICK_HZ * 0.8 && dist(last.x, last.y, target.x, target.y) < 2.5) continue;
        }
        if (id === 'frost_nova') {
          if (adjacent < 3) continue;
          dps *= adjacent;
        }
        score = dps;
      }
      if (!best || score > best.score) best = { skill: id, target, score };
    }
    return best ? { skill: best.skill, target: best.target, score: best.score } : null;
  }

  /**
   * Monstre auquel le bot renonce : immunisé à tous ses sorts, ou qu'il mettrait bien trop
   * longtemps à tuer (20 s pour un monstre ordinaire ou un champion, 60 s pour un unique).
   * Le boss de la run n'est jamais abandonné. Recalculé toutes les secondes.
   */
  private hopeless(m: Monster): boolean {
    const w = this.game.world;
    // boss de run, et runs à vagues (la vague suivante attend la mort de tous) : on insiste
    if (m.runBoss || m.sealGuard || m.rank === 'boss' || (w.run?.totalWaves ?? 0) > 0) return false;
    const hit = this.hopelessCache.get(m.id);
    if (hit && w.tick - hit.tick < TICK_HZ) return hit.v;
    const p = w.player;
    const c = w.character;
    let dps = 0;
    const lrL = c.skills.lower_resist ?? 0;
    const lowerResist = lrL > 0 && this.opt.build === 'pnova' ? lin(SKILL_BY_ID.lower_resist.n.value, lrL) : 0;
    for (const id of Object.keys(c.skills)) {
      const s = SKILL_BY_ID[id];
      if (!(c.skills[id] > 0) || !s || s.passive || s.buff || id === 'teleport' || id === 'telekinesis' || id === 'static_field') continue;
      const r = skillDamageRange(w, id);
      const avg = (r.min + r.max) / 2;
      if (avg <= 0) continue;
      // la malédiction Résistance réduite (active, ou que le bot lancera : il l'attend sur les élites) lève l'immunité (moitié de la
      // réduction) : sans elle, un monstre immunisé au poison était « sans espoir » et jamais maudit ni attaqué
      let red = monsterReduction(w, m, r.elem, null);
      if (lowerResist > 0 && !m.mods.includes('possessed') && (r.elem === 'fire' || r.elem === 'cold' || r.elem === 'light' || r.elem === 'poison')) red = Math.max(red, lowerResist);
      const er = effectiveMonsterRes(m.res[r.elem] ?? 0, p.d.pierce[r.elem] ?? 0, p.d.sunder[r.elem] ?? false, red);
      // second élément (Tornade : physique + froid, Rocher en fusion, Volcan) : il suffit seul contre un immunisé au premier
      const r2 = skillDamageRange2(w, id);
      let part = er.immune ? 0 : avg * (1 - er.res / 100);
      if (r2) {
        const er2 = effectiveMonsterRes(m.res[r2.elem] ?? 0, p.d.pierce[r2.elem] ?? 0, p.d.sunder[r2.elem] ?? false, monsterReduction(w, m, r2.elem, null));
        if (!er2.immune) part += ((r2.min + r2.max) / 2) * (1 - er2.res / 100);
      }
      if (part <= 0) continue;
      const frames = castFrames(w, id);
      const cdn = botRules().persistent[id] ? Math.max(s.n.cooldown ?? 0, frames / TICK_HZ) : frames / TICK_HZ;
      dps = Math.max(dps, (part * (botRules().persistent[id] ?? 1)) / cdn);
    }
    if (c.classId !== 'sorceress') {
      for (const id of Object.keys(c.skills)) {
        if (SKILL_BY_ID[id]?.melee && c.skills[id] > 0) dps = Math.max(dps, this.meleeScore(id, [m], m, undefined)?.score ?? 0);
      }
      if (c.classId === 'druid') dps += this.petDps();
    }
    dps += this.mercDps(m);
    // champion possédé (D2) : vie ×2 d'un champion, on l'attend comme un unique
    const limit = m.rank === 'unique' || m.mods.includes('possessed') ? 60 : 20;
    const v = dps <= 0 || m.hp / dps > limit;
    this.hopelessCache.set(m.id, { tick: w.tick, v });
    return v;
  }

  private escapeDir(threats: Monster[]): { x: number; y: number } {
    const w = this.game.world;
    const p = w.player;
    let ex = 0;
    let ey = 0;
    for (const m of threats) {
      const d = Math.max(0.5, dist(p.x, p.y, m.x, m.y));
      ex += (p.x - m.x) / (d * d);
      ey += (p.y - m.y) / (d * d);
    }
    // on évite de fuir dans un mur : on essaie quelques angles autour de la direction idéale
    const base = Math.atan2(ey, ex);
    for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, Math.PI]) {
      const a = base + off;
      const tx = p.x + Math.cos(a) * 3;
      const ty = p.y + Math.sin(a) * 3;
      const intoPack = w.pendingSpawns.some((s) => !s.wave && dist(tx, ty, s.x, s.y) < s.trigger + s.r + 1);
      if (!intoPack && w.grid.walkLine(p.x, p.y, tx, ty, 0.35)) return { x: Math.cos(a), y: Math.sin(a) };
    }
    return { x: Math.cos(base), y: Math.sin(base) };
  }

  /** Objet au sol à ramasser (selon le filtre et la place disponible) */
  private nextLoot(): { id: number; x: number; y: number } | null {
    const w = this.game.world;
    const p = w.player;
    const c = w.character;
    // cases libres → nombre approximatif d'objets de taille moyenne (3 cases)
    const free = Math.floor(inventoryFree(c) / 3);
    let best: { id: number; x: number; y: number; d: number } | null = null;
    for (const gi of w.items) {
      if (gi.show <= 0) continue;
      if (w.tick - gi.dropTick < 4) continue;
      const d = dist(p.x, p.y, gi.x, gi.y);
      if (d > 16) continue;
      if (this.blacklisted(gi.x, gi.y)) continue;
      if ((this.pickTries.get(gi.id) ?? 0) > 12) continue;
      const b = baseOf(gi.item);
      let want: boolean;
      if (b.id === 'gold') want = true;
      else if (b.type === 'potion') {
        const kind = b.id === 'hp_potion' ? 'heal' : b.id === 'mp_potion' ? 'mana' : 'rejuv';
        const slot = c.belt.find((s) => s.kind === kind);
        want = !!slot && slot.qty < beltCapacity(c);
      } else {
        const v = lootFilterDecision(c, gi.item);
        // emplacement d'équipement vide : même un objet normal vaut mieux que rien (un joueur D2 met un casque)
        const empty =
          !!b.slot &&
          v >= SHOW_NORMAL &&
          free > 2 &&
          b.slot !== 'ring' &&
          b.slot !== 'amulet' &&
          !c.equipment[(targetSlot(c, gi.item) ?? 'head') as Slot] &&
          itemFinal(gi.item, c.level).reqLvl <= c.level;
        want = v >= SHOW_GOOD || empty || (this.opt.greedy && v >= SHOW_NORMAL && free > 4 && !!b.slot);
        if (b.slot && !hasRoomFor(c, gi.item)) want = false;
      }
      if (!want) continue;
      if (!best || d < best.d) best = { id: gi.id, x: gi.x, y: gi.y, d };
    }
    return best;
  }

  private blacklisted(x: number, y: number): boolean {
    const k = `${Math.round(x)},${Math.round(y)}`;
    const u = this.blacklist.get(k);
    return u !== undefined && u > this.game.world.tick;
  }

  /** But d'exploration : monstre vivant restant, déclencheur d'apparition, coffre, portail de fin */
  private exploreGoal(): { x: number; y: number; object?: number } | null {
    const w = this.game.world;
    const p = w.player;
    let best: { x: number; y: number; d: number; object?: number } | null = null;
    // run terminée : on ne finit que ce qui est tout proche, puis on rentre
    const done = !!w.run?.completed;
    const consider = (x: number, y: number, bias: number, object?: number, required = false) => {
      // un objectif obligatoire (sceau) n'est jamais écarté : il est toujours accessible, et un
      // blocage passager (mêlée) le mettrait en liste noire plus longtemps que la patience du bot
      if (!required && this.blacklisted(x, y)) return;
      if (done && dist(p.x, p.y, x, y) > 10) return;
      const d = dist(p.x, p.y, x, y) * bias;
      if (!best || d < best.d) best = { x, y, d, object };
    };
    for (const m of w.monsters) if (!m.dead && !m.isSummon && !this.hopeless(m)) consider(m.x, m.y, 1);
    for (const s of w.pendingSpawns) if (!s.wave && !s.seal) consider(s.x, s.y, 1);
    // vagues pas encore lancées : aller là où elles se déclenchent (salle du trône)
    if (w.run && w.run.totalWaves > 0 && w.run.wave === 0) {
      const first = w.pendingSpawns.find((s) => s.wave === 1);
      if (first) consider(first.x, first.y + 8, 1.2);
    }
    for (const o of w.objects) {
      if (o.used) continue;
      if (o.kind === 'chest' || o.kind === 'sarcophagus' || o.kind === 'shrine') consider(o.x, o.y, 0.8, o.id);
      // Sanctuaire du Chaos : briser les sceaux (Diablo apparaît ensuite au centre)
      if (o.kind === 'seal') consider(o.x, o.y, 1, o.id, true);
      // Trône de Baal : le portail vers la Chambre de la Pierre-Monde, une fois les vagues vaincues
      if (o.kind === 'portal' && o.ref === 'chamber') consider(o.x, o.y, 3, o.id, true);
    }
    if (best) return best;
    // plus rien : le portail de fin de run
    if (w.run?.completed) {
      const portal = w.objects.find((o) => o.kind === 'portal' && o.ref === 'town');
      if (portal) return { x: portal.x, y: portal.y, object: portal.id };
    }
    return null;
  }

  /** Déplacement vers un point par A* (recalculé au plus toutes les 0,6 s ou si le but change) */
  private moveTo(x: number, y: number): void {
    const w = this.game.world;
    const p = w.player;
    const inp = w.input;
    const shift = this.pathGoal ? dist(this.pathGoal.x, this.pathGoal.y, x, y) : Infinity;
    const since = w.tick - this.pathTick;
    // recherche de chemin (A*, coûteuse) : pas plus d'une fois par 5 ticks pour un but qui glisse
    // (monstre poursuivi), et 12 ticks d'attente avant de retenter un but qui vient d'échouer
    const failedRecently = !!this.failGoal && w.tick - this.pathFailTick < 12 && dist(this.failGoal.x, this.failGoal.y, x, y) < 2;
    const replan = (shift > 1.5 && (shift >= 4 || since >= 5 || this.path.length === 0)) || since > TICK_HZ * 0.6 || this.path.length === 0;
    if (replan && !failedRecently) {
      if (w.grid.walkLine(p.x, p.y, x, y, 0.35)) this.path = [{ x, y }];
      else this.path = findPath(w.grid, p.x, p.y, x, y) ?? [];
      this.pathGoal = { x, y };
      this.pathTick = w.tick;
      if (this.path.length === 0) {
        this.pathFailTick = w.tick;
        this.failGoal = { x, y };
        this.blacklist.set(`${Math.round(x)},${Math.round(y)}`, w.tick + TICK_HZ * 30);
        return;
      }
    } else if (failedRecently) return;
    while (this.path.length && dist(p.x, p.y, this.path[0].x, this.path[0].y) < 0.35) this.path.shift();
    const next = this.path[0];
    if (!next) return;
    // téléportation sur les longs trajets
    const c = w.character;
    // une téléportation restée sans effet (aucun point libre) suspend la téléportation 2 s
    if (this.tpFrom && w.tick - this.tpFrom.tick > 12) {
      if (Math.hypot(p.x - this.tpFrom.x, p.y - this.tpFrom.y) < 0.5) this.tpBlockedUntil = w.tick + TICK_HZ * 2;
      this.tpFrom = null;
    }
    if ((c.skills.teleport ?? 0) > 0 && p.mana > p.manaMax * 0.5 && w.tick >= this.tpBlockedUntil && canCast(w, 'teleport').ok) {
      let far: { x: number; y: number } | null = null;
      for (const pt of this.path) if (dist(p.x, p.y, pt.x, pt.y) <= 10) far = pt;
      if (far && dist(p.x, p.y, far.x, far.y) > 6) {
        this.cast('teleport', far.x, far.y, 0);
        this.tpFrom = { x: p.x, y: p.y, tick: w.tick };
        return;
      }
    }
    const dx = next.x - p.x;
    const dy = next.y - p.y;
    const l = Math.hypot(dx, dy) || 1;
    inp.moveX = dx / l;
    inp.moveY = dy / l;
  }
}
