/**
 * Le monde : une instance de zone (run, ville ou map) avec ses entités.
 * La simulation avance par pas fixes de 1/25 s via tick(). Elle ne connaît ni pixels
 * ni sprites : tout est en unités de monde, et le rendu lit cet état sans le modifier.
 */
import { fireProcs } from './procs';
import { throwPotion } from './throwpotion';
import { reanimateReturned } from './minions';
import { releasePsCloud, tickWarpRegen } from './necromancer';
import { Rng, hashSeed } from '../core/rng';
import { angleDiff, clamp, dist2, TAU } from '../core/math';
import type { Difficulty } from '../data/types';
import type { SeamDef, ZoneDef } from '../data/zone-types';
import type { Element } from '../data/stats';
import { CELL, FlowField, WalkGrid } from './grid';
import { buildGrid } from './buildgrid';

export { buildGrid };
import { Navigator } from './nav';
import { SpatialHash } from './spatial';
import { EventQueue } from './events';
import type { AreaEffect, GroundItem, Missile, Monster, Player, WorldObject } from './actors';
import { DT, FLOW_RADIUS_CELLS, INTERACT_RADIUS, MAX_GROUND_ITEMS, MAX_LIVE_MONSTERS, PLAYER_RADIUS, TERRAIN_RADIUS, TICK_HZ } from './constants';
import type { CharacterState } from './character-state';
import { computeDerived } from './character';
import { damageMonster, damagePlayer } from './combat';
import { updateMonster, monsterDeathEffects } from './ai';
import { RULES } from '../mods/rules';
import { updateMissile, updateArea } from './missile-update';
import { shadowOwned } from './shadow-cast';
import { canCast, castFrames, skillManaCost, strikePlan } from './skills';
import { castSkill, applyPassiveTick } from './skill-cast';
import { druidPreCast, onPetDeath, petsTargetable } from './druid';
import { onMercDeath, onMercKill, spawnMerc } from './merc';
import { SKILL_BY_ID } from '../data/skills';
import { gainXp, xpForKill } from './progression';
import { rollMonsterDrops } from './loot/drops';
import type { Item } from './item';
import { spawnMonster, speciesAlt, superUniqueOf, type SpawnOptions } from './spawn';
import { lootFilterDecision } from './loot/filter';
import { setLootClass } from './loot/itemgen';
import { tryAutoPickup, pickupGroundItem, refillBelt } from './inventory';
import type { AutoPickupCfg } from './loot/filter';
import { interactObject, rearmObjects } from './objects';
import { QUEST_OBJECTS } from '../data/quests';
import type { RunState } from './runs';
import type { WorldSnapshot } from './save';
import { MONSTER_BY_ID } from '../data/monsters';
import { Rng as RngClass } from '../core/rng';

export interface PlayerInput {
  /** Vecteur de déplacement (joystick), norme 0..1, en coordonnées de monde */
  moveX: number;
  moveY: number;
  cast: { skill: string; tx: number; ty: number; targetId: number } | null;
  potion: 'heal' | 'mana' | 'rejuv' | null;
  /** Lancer d'une potion de jet vers ce point */
  throwAt?: { x: number; y: number } | null;
  pickup: number | null;
  interact: number | null;
}

export interface WorldOptions {
  zone: ZoneDef;
  seed: number;
  difficulty: Difficulty;
  /** Niveau de zone (niveau des monstres) */
  zoneLevel: number;
  character: CharacterState;
  /** Modificateurs de la map (endgame) */
  mapMods?: { id: string; value: number }[];
  run?: RunState;
  /**
   * Lot 312: the first identifier of the world's entities (0 by default): the zones joined edge to edge alive at the same time
   * (src/sim/seam-worlds.ts) number theirs apart, so that a monster keeps its identifier when it is shown in the next zone
   */
  idBase?: number;
}

/**
 * Lot 312: what a world joined edge to edge to the current one hands to the seam manager (src/sim/seam-worlds.ts); null for every other
 * world. `hurtPlayer`: a proxy world (the hero is in the next zone) forwards a monster's blow to the zone he is in; `killMirror`: a copy of
 * a neighbour's monster killed here dies in its own zone; `pickedMirror`: a copy of a neighbour's ground item picked up here is taken out
 * of its own zone
 */
export interface SeamHooks {
  hurtPlayer?(src: Monster | null, pk: Parameters<typeof damagePlayer>[2]): number;
  killMirror?(m: Monster, killer: Player | null): void;
  pickedMirror?(gi: GroundItem): void;
}

/** Rapport marche / course de Diablo II (6 yards/s contre 9 sans FRW) */
export const WALK_RATIO = 6 / 9;

/**
 * Palier de potion (0 à 4) atteint à un niveau de personnage : les potions montent en gamme avec le joueur (réglage `potionUpgrade`).
 * Lot 316: the items' own tier is read from their item level (src/sim/potion-tier.ts); this table of the setting is kept as it was (the
 * owner: default settings unchanged; Survivals' balance is measured with it)
 */
export const POTION_TIER_LEVELS = [1, 10, 20, 35, 50];
export function potionTierForLevel(level: number): number {
  let t = 0;
  for (let i = 0; i < POTION_TIER_LEVELS.length; i++) if (level >= POTION_TIER_LEVELS[i]) t = i;
  return t;
}

export class World {
  readonly zone: ZoneDef;
  readonly grid: WalkGrid;
  readonly flow: FlowField;
  readonly events = new EventQueue();
  rng: { combat: Rng; ai: Rng; loot: Rng; spawn: Rng; misc: Rng };
  readonly difficulty: Difficulty;
  readonly zoneLevel: number;
  readonly seed: number;
  /** Lot 316: the first identifier of the world's entities (`WorldOptions.idBase`): the zones kept for the session number theirs apart */
  readonly idBase: number;
  character: CharacterState;
  readonly player: Player;
  monsters: Monster[] = [];
  /** Créatures du Druide que les monstres peuvent attaquer (recalculé à chaque tick) */
  pets: Monster[] = [];
  missiles: Missile[] = [];
  areas: AreaEffect[] = [];
  items: GroundItem[] = [];
  /** Incrémenté à chaque changement du filtre (le rendu reconstruit les objets au sol) */
  filterVersion = 0;
  objects: WorldObject[] = [];
  readonly monsterHash = new SpatialHash<Monster>(4);
  tick = 0;
  /** Vrai pendant le lancer d'un sort déclenché par un objet (pas de déclencheurs en chaîne) */
  inProc = false;
  /** Ombre de l'Assassin qui lance en ce moment une compétence du joueur (shadow-cast.ts) : c'est elle l'attaquante */
  actingAs: Monster | null = null;
  godMode = false;
  input: PlayerInput = { moveX: 0, moveY: 0, cast: null, potion: null, pickup: null, interact: null };
  run: RunState | null;
  /** Réglages de ramassage automatique / remplissage de la ceinture (posés par Game ; absent : comportement historique, or seulement) */
  autoCfg: AutoPickupCfg | null = null;
  /**
   * Portée de l'écran en unités de monde (posée par le rendu ; 0 = neutre pour module/tests/bots) : un groupe à
   * déclencheur apparaît au plus tard quand le joueur est à cette distance, donc hors de l'écran, même sur grand écran.
   */
  viewReach = 0;
  private beltMsgTick = -9999;
  mapMods: { id: string; value: number }[];
  /** Déclencheurs d'apparition non encore activés */
  pendingSpawns: { idx: number; x: number; y: number; r: number; trigger: number; wave?: number; seal?: string }[] = [];
  private nextId = 1;
  private flowTick = -999;
  private queryBuf: Monster[] = [];
  /**
   * Lot 312: a zone joined edge to edge to the one the hero is in, simulated beside it (src/sim/seam-worlds.ts): its player is the hero's
   * proxy (moved by the seam manager, never by inputs), its blows at him forwarded. False for every other world
   */
  proxy = false;
  /** Lot 312: the seam manager's hooks (see `SeamHooks`); null outside the zones joined edge to edge */
  seam: SeamHooks | null = null;
  /**
   * Lot 312: the zones joined edge to edge to this one that are built (set by the seam manager on the zone the hero is in; empty for the
   * others): their world, the seam (where the neighbour's map lies here) and whether it is simulated now. Read by the renderer and the
   * minimap (the neighbour's map, monsters and objects drawn beyond the edge before the crossing)
   */
  seamLinks: { world: World; seam: SeamDef; active: boolean }[] = [];
  /** Statistiques de la run pour les bots et l'écran de fin */
  stats = { kills: 0, damageTaken: 0, deaths: 0, itemsDropped: 0, potionsUsed: 0, casts: 0, byRank: {} as Record<string, number> };

  constructor(opts: WorldOptions) {
    if (opts.idBase) this.nextId = opts.idBase + 1;
    this.idBase = opts.idBase ?? 0;
    this.zone = opts.zone;
    this.seed = opts.seed >>> 0;
    this.difficulty = opts.difficulty;
    this.zoneLevel = opts.zoneLevel;
    this.character = opts.character;
    setLootClass(this.character.classId ?? 'sorceress');
    this.run = opts.run ?? null;
    this.mapMods = opts.mapMods ?? [];
    const root = new Rng(hashSeed(`world:${opts.zone.id}:${this.seed}`));
    this.rng = { combat: root.fork('combat'), ai: root.fork('ai'), loot: root.fork('loot'), spawn: root.fork('spawn'), misc: root.fork('misc') };
    this.grid = buildGrid(opts.zone);
    this.flow = new FlowField(this.grid);
    this.player = this.freshPlayer(opts.zone.start.x, opts.zone.start.y, this.newId());
    this.buildObjects();
    // le mercenaire vivant accompagne le joueur dans chaque zone
    spawnMerc(this);
  }

  /** The hero as the world makes him at (x, y): full life and mana, no buff, no cooldown (a new world; a kept zone entered again, lot 316) */
  private freshPlayer(x: number, y: number, id: number): Player {
    const d = computeDerived(this.character, this.difficulty);
    return {
      kind: 'player',
      id,
      team: 0,
      x,
      y,
      px: x,
      py: y,
      radius: PLAYER_RADIUS,
      facing: Math.PI / 4,
      hp: d.lifeMax,
      hpMax: d.lifeMax,
      mana: d.manaMax,
      manaMax: d.manaMax,
      mode: 'idle',
      modeT: 0,
      modeLen: 0,
      dead: false,
      deathTick: 0,
      chillT: 0,
      chillPct: 0,
      freezeT: 0,
      stunT: 0,
      burnDps: 0,
      burnT: 0,
      lastHitTick: -999,
      d,
      cast: null,
      healT: 0,
      healPerTick: 0,
      manaHealT: 0,
      manaHealPerTick: 0,
      potionCd: 0,
      buffs: [],
      shieldActive: false,
      poisonT: 0,
      poisonRate: 0,
      goal: null,
      cooldowns: {},
      lastDeathTick: -1,
      tpPenaltyUntil: 0,
      tpPenaltyPct: 0,
    };
  }

  /** Lot 316: a kept zone entered again: its hero made anew at (x, y), keeping his identifier (the game then gives him his life and mana) */
  resetHero(x: number, y: number): void {
    Object.assign(this.player, this.freshPlayer(x, y, this.player.id));
    this.input = { moveX: 0, moveY: 0, cast: null, potion: null, pickup: null, interact: null };
  }

  newId(): number {
    return this.nextId++;
  }

  /** Au moins une créature du Druide en jeu (évite le filtrage à chaque tick pour la Sorcière) */
  get hasPets(): boolean {
    return this.monsters.some((m) => m.pet && !m.dead);
  }

  /** Crée les monstres. Les groupes avec déclencheur n'apparaissent qu'à l'approche du joueur. */
  populate(): void {
    this.zone.spawns.forEach((s, idx) => {
      if (s.trigger || s.wave || s.seal) {
        this.pendingSpawns.push({ idx, x: s.x, y: s.y, r: s.r, trigger: s.trigger ?? 0, wave: s.wave, seal: s.seal });
      } else {
        this.spawnGroup(idx);
      }
    });
  }

  spawnGroup(idx: number): Monster[] {
    const s = this.zone.spawns[idx];
    const out: Monster[] = [];
    // boss de carte : statut de boss (mods/pd2/sim/map-boss.ts)
    const mapBoss = !!s.runBoss && (this.run?.mapTier ?? 0) > 0;
    const opts: SpawnOptions = { rank: s.rank ?? 'normal', uniqueName: s.uniqueName, baseRes: s.sealGuard, mapBoss };
    // super-unique (SuperUniques.txt) : espèce de sa classe et taille de groupe MinGrp-MaxGrp (un chef placé seul reste seul)
    const su = s.rank === 'unique' && !mapBoss ? superUniqueOf(s.uniqueName) : undefined;
    const monster = su?.monster && MONSTER_BY_ID[su.monster] && !MONSTER_BY_ID[su.monster].boss ? su.monster : s.wave || s.seal || s.uniqueName ? s.monster : speciesAlt(this.seed, idx, s.monster);
    const leader = spawnMonster(this, monster, s.x, s.y, opts, `${idx}:0`);
    if (!leader) return out;
    if (s.runBoss) leader.runBoss = true;
    if (s.sealGuard) leader.sealGuard = true;
    out.push(leader);
    // les champions et uniques viennent avec des sbires / un groupe
    const n = su && s.count > 1 ? su.grp[0] + this.rng.spawn.int(su.grp[1] - su.grp[0] + 1) : s.count - 1;
    for (let i = 0; i < n; i++) {
      const a = this.rng.spawn.float(0, TAU);
      const r = this.rng.spawn.float(0.6, Math.max(1, s.r));
      const rank = s.rank === 'unique' ? 'minion' : s.rank === 'champion' ? 'champion' : 'normal';
      const m = spawnMonster(
        this,
        monster,
        s.x + Math.cos(a) * r,
        s.y + Math.sin(a) * r,
        // D2 : la meute partage les modificateurs du chef (champions : type ; uniques : modificateurs transmissibles)
        { rank, leader: leader.id, inheritMods: s.rank === 'champion' || s.rank === 'unique' ? leader.mods : undefined },
        `${idx}:${i + 1}`,
      );
      if (m) out.push(m);
    }
    return out;
  }

  /**
   * Champ de flux vers le joueur, recalculé à la demande : aucun coût tant qu'aucun monstre n'a
   * à contourner un obstacle. Il ne change que si le joueur change de cellule (au plus toutes
   * les 6 ticks, ~0,25 s) ou si la grille change (herse) : rafraîchi chaque seconde par sécurité.
   */
  flowField(): FlowField {
    const p = this.player;
    const moved = this.flow.targetCx !== Math.floor(p.x / CELL) || this.flow.targetCy !== Math.floor(p.y / CELL);
    const age = this.tick - this.flowTick;
    if ((moved && age >= 6) || age >= 25) {
      // lot 312: the hero beyond this zone's edge (a proxy world): its monsters come to the nearest walkable point of the edge
      if (this.proxy) this.flow.compute(clamp(p.x, CELL * 2.5, this.grid.cols * CELL - CELL * 2.5), clamp(p.y, CELL * 2.5, this.grid.rows * CELL - CELL * 2.5), FLOW_RADIUS_CELLS);
      else this.flow.compute(p.x, p.y, FLOW_RADIUS_CELLS);
      this.flowTick = this.tick;
    }
    return this.flow;
  }

  triggerWave(wave: number): number {
    let n = 0;
    this.pendingSpawns = this.pendingSpawns.filter((p) => {
      if (p.wave === wave) {
        n += this.spawnGroup(p.idx).length;
        return false;
      }
      return true;
    });
    return n;
  }

  /** Ouvre un sceau : ses gardiens apparaissent, déjà en chasse */
  triggerSeal(ref: string): Monster[] {
    const out: Monster[] = [];
    this.pendingSpawns = this.pendingSpawns.filter((p) => {
      if (p.seal !== ref) return true;
      out.push(...this.spawnGroup(p.idx));
      return false;
    });
    for (const m of out) m.aggro = true;
    return out;
  }

  private buildObjects(): void {
    for (const o of this.zone.objects) {
      this.objects.push({
        id: this.newId(),
        kind: o.kind,
        x: o.x,
        y: o.y,
        radius: 0.8,
        used: false,
        variant: o.variant,
        ref: o.id,
        label: o.variant === 'horazon' ? 'Coffre d’Horazon' : objectLabel(o.kind, o.id, o.variant),
      });
    }
    for (const e of this.zone.exits) {
      this.objects.push({
        id: this.newId(),
        kind: e.kind,
        x: e.x,
        y: e.y,
        radius: e.variant === 'stairs' ? 1.8 : e.variant === 'edge' ? 3 : 1,
        used: false,
        ref: e.to,
        label: e.label,
        variant: e.variant ?? e.locked,
      });
    }
  }

  /** Ouvre une herse : la grille devient praticable, l'objet disparaît */
  openGate(id: string, announce = true): void {
    for (const b of this.zone.blockers) {
      if (b.gate !== id || !b.rect) continue;
      this.grid.unblockRect(b.rect[0], b.rect[1], b.rect[2], b.rect[3]);
      // carte de Diablo II : la herse ne perce pas les murs voisins, ce que la carte bloquait reste bloqué
      const m = this.zone.d2Map;
      if (m && m.cols === this.grid.cols && m.rows === this.grid.rows) {
        const cx0 = Math.max(0, Math.floor(b.rect[0] / CELL));
        const cy0 = Math.max(0, Math.floor(b.rect[1] / CELL));
        const cx1 = Math.min(this.grid.cols - 1, Math.ceil(b.rect[2] / CELL) - 1);
        const cy1 = Math.min(this.grid.rows - 1, Math.ceil(b.rect[3] / CELL) - 1);
        for (let cy = cy0; cy <= cy1; cy++)
          for (let cx = cx0; cx <= cx1; cx++)
            if (m.blocked[cy * m.cols + cx]) {
              this.grid.blocked[cy * m.cols + cx] = 1;
              this.grid.opaque[cy * m.cols + cx] = m.opaque[cy * m.cols + cx];
            }
      }
    }
    for (const o of this.objects) if (o.kind === 'gate' && o.ref === id) o.used = true;
    this.flowTick = -999;
    if (announce) this.events.push({ t: 'message', text: 'Un passage s’ouvre…', color: '#e8b04a' });
  }

  /** Recalcule les stats dérivées du joueur (équipement, points…) en conservant les ratios PV/mana. */
  refreshPlayer(): void {
    const p = this.player;
    const hpRatio = p.hpMax > 0 ? p.hp / p.hpMax : 1;
    const manaRatio = p.manaMax > 0 ? p.mana / p.manaMax : 1;
    p.d = computeDerived(this.character, this.difficulty, p.buffs);
    // modificateurs de carte qui touchent le joueur
    for (const mod of this.mapMods) {
      if (mod.id === 'playerResAll') for (const e of ['fire', 'cold', 'light', 'poison'] as const) p.d.res[e] -= mod.value;
      else if (mod.id === 'playerDefense') p.d.defense = Math.round(p.d.defense * (1 - mod.value / 100));
      else if (mod.id === 'playerFrw') p.d.frw += mod.value;
      else if (mod.id === 'playerBlock') {
        p.d.block = Math.round(p.d.block * (1 - mod.value / 100));
        p.d.weaponBlock = Math.round(p.d.weaponBlock * (1 - mod.value / 100));
      } else if (mod.id === 'playerFhr') p.d.fhr = Math.max(0, p.d.fhr - mod.value);
    }
    p.hpMax = p.d.lifeMax;
    p.manaMax = p.d.manaMax;
    if (!p.dead) {
      p.hp = clamp(hpRatio * p.hpMax, 1, p.hpMax);
      p.mana = clamp(manaRatio * p.manaMax, 0, p.manaMax);
    }
  }

  /* -------------------------------------------------------------- */
  /* Instantané (sauvegarde en pleine run)                            */
  /* -------------------------------------------------------------- */

  snapshot(): WorldSnapshot {
    const p = this.player;
    return {
      tick: this.tick,
      player: { x: p.x, y: p.y, hp: p.hp, mana: p.mana, buffs: p.buffs.map((b) => ({ ...b })), facing: p.facing, cooldowns: { ...p.cooldowns } },
      monsters: this.monsters.filter((m) => !m.dead && !m.mirror).map((m) => ({ ...structuredClone({ ...m, def: undefined }), def: m.def.id })),
      pendingSpawns: this.pendingSpawns.map((s) => s.idx),
      items: this.items.filter((g) => !g.mirror).map((g) => ({ item: g.item, x: g.x, y: g.y })),
      objects: this.objects.filter((o) => !o.mirror).map((o) => ({ kind: o.kind, x: o.x, y: o.y, used: o.used, ref: o.ref, label: o.label, variant: o.variant })),
      rng: { combat: this.rng.combat.getState(), ai: this.rng.ai.getState(), loot: this.rng.loot.getState(), spawn: this.rng.spawn.getState(), misc: this.rng.misc.getState() },
      run: { wave: this.run?.wave ?? 0, completed: this.run?.completed ?? false, startTick: this.run?.startTick ?? 0 },
    };
  }

  /** Restaure un instantané sur un monde fraîchement construit (sans populate). */
  restore(s: WorldSnapshot): void {
    this.tick = s.tick;
    const p = this.player;
    p.x = p.px = s.player.x;
    p.y = p.py = s.player.y;
    p.buffs = s.player.buffs.map((b) => ({ ...b }));
    p.cooldowns = { ...s.player.cooldowns };
    p.facing = s.player.facing;
    p.shieldActive = p.buffs.some((b) => b.id === 'energy_shield');
    this.refreshPlayer();
    p.hp = Math.min(p.hpMax, s.player.hp);
    p.mana = Math.min(p.manaMax, s.player.mana);
    this.monsters = s.monsters.map((ms) => {
      const def = MONSTER_BY_ID[ms.def];
      return { ...ms, def } as unknown as Monster;
    });
    for (const m of this.monsters) if (m.id >= this.nextId) this.nextId = m.id + 1;
    this.pendingSpawns = [];
    for (const idx of s.pendingSpawns) {
      const sp = this.zone.spawns[idx];
      if (sp) this.pendingSpawns.push({ idx, x: sp.x, y: sp.y, r: sp.r, trigger: sp.trigger ?? 0, wave: sp.wave, seal: sp.seal });
    }
    this.items = s.items.map((g) => ({ id: this.newId(), item: g.item, x: g.x, y: g.y, dropTick: this.tick - 100, show: lootFilterDecision(this.character, g.item) }));
    // zone régénérée depuis sa graine (forme de carte changée depuis la sauvegarde) : rien ne reste coincé dans un mur
    const unstick = (o: { x: number; y: number; px?: number; py?: number }) => {
      if (!this.grid.isBlockedAt(o.x, o.y)) return;
      const f = this.grid.nearestFree(o.x, o.y, 6) ?? this.zone.start;
      o.x = f.x;
      o.y = f.y;
      if (o.px !== undefined) ((o.px = f.x), (o.py = f.y));
    };
    unstick(p);
    for (const m of this.monsters) unstick(m);
    for (const g of this.items) unstick(g);
    this.objects = s.objects.map((o) => ({ id: this.newId(), kind: o.kind, x: o.x, y: o.y, radius: 1, used: o.used, ref: o.ref, label: o.label, variant: o.variant }));
    for (const o of this.objects) if (o.kind === 'gate' && o.used && o.ref) this.openGate(o.ref, false);
    this.rng.combat = RngClass.fromState(s.rng.combat);
    this.rng.ai = RngClass.fromState(s.rng.ai);
    this.rng.loot = RngClass.fromState(s.rng.loot);
    this.rng.spawn = RngClass.fromState(s.rng.spawn);
    this.rng.misc = RngClass.fromState(s.rng.misc);
    if (this.run) {
      this.run.wave = s.run.wave;
      this.run.completed = s.run.completed;
      this.run.startTick = s.run.startTick;
    }
  }

  /* -------------------------------------------------------------- */
  /* Boucle                                                          */
  /* -------------------------------------------------------------- */

  step(n = 1): void {
    for (let i = 0; i < n; i++) this.tickOnce();
  }

  /** Personnage coincé dans un mur ou un décor (téléportation, bord de carte…) : replacé sur la case libre la plus proche */
  private unstickPlayer(): void {
    const p = this.player;
    // seul le POINT compte : en passant un coin ou une marche (voir moveActor) le disque peut mordre un mur sans que le personnage soit coincé
    const tr = 0.02;
    if (p.dead || !this.grid.circleBlocked(p.x, p.y, tr)) return;
    for (let r = 0.5; r <= 12; r += 0.5) {
      for (let k = 0; k < 24; k++) {
        const x = p.x + Math.cos((k / 24) * Math.PI * 2) * r;
        const y = p.y + Math.sin((k / 24) * Math.PI * 2) * r;
        if (this.grid.circleBlocked(x, y, tr)) continue;
        p.x = p.px = x;
        p.y = p.py = y;
        p.goal = null;
        return;
      }
    }
  }

  private tickOnce(): void {
    this.tick++;
    const p = this.player;
    p.px = p.x;
    p.py = p.y;
    for (const m of this.monsters) {
      m.px = m.x;
      m.py = m.y;
    }
    // lot 312: a proxy world's player is the hero's stand-in, moved by the seam manager (no inputs, no regeneration, never stuck)
    if (!this.proxy) {
      if (this.tick % 12 === 0) this.unstickPlayer();
      this.updatePlayer();
    }
    this.checkTriggers();
    this.monsterHash.clear();
    for (const m of this.monsters) if (!m.dead) this.monsterHash.insert(m);
    this.pets = this.hasPets ? petsTargetable(this) : [];
    // lot 312: the copies of a neighbour's monsters move with their originals (src/sim/seam-worlds.ts)
    for (const m of this.monsters) if (!m.mirror) updateMonster(this, m);
    if (this.mapMods.length) RULES['world.tick'](this, DT);
    for (const ms of this.missiles) if (!ms.dead && !ms.mirror) ms.shadow ? shadowOwned(this, ms, updateMissile) : updateMissile(this, ms);
    for (const a of this.areas) if (!a.dead && !a.mirror) a.shadow ? shadowOwned(this, a, updateArea) : updateArea(this, a);
    if (this.tick % 25 === 0) {
      this.cleanup();
      rearmObjects(this);
    }
    if (this.run) this.run.update(this);
    if (!p.dead && !this.proxy) tryAutoPickup(this);
    if (this.autoCfg?.beltRefill && !p.dead && !this.proxy && this.tick % 25 === 12 && refillBelt(this.character) > 0 && this.tick - this.beltMsgTick >= 125) {
      this.beltMsgTick = this.tick;
      this.events.push({ t: 'message', text: 'Ceinture rechargée', color: '#8c8' });
    }
  }

  private cleanup(): void {
    this.missiles = this.missiles.filter((m) => !m.dead);
    this.areas = this.areas.filter((a) => !a.dead);
    // corps : conservés 12 s puis retirés
    this.monsters = this.monsters.filter((m) => !m.dead || this.tick - m.deathTick < TICK_HZ * 12);
    if (this.items.length > MAX_GROUND_ITEMS && !this.items.some((g) => g.mirror)) {
      // on retire d'abord les objets masqués par le filtre, les plus anciens
      this.items.sort((a, b) => b.show - a.show || b.dropTick - a.dropTick);
      this.items.length = MAX_GROUND_ITEMS;
    }
  }

  private checkTriggers(): void {
    if (this.pendingSpawns.length === 0) return;
    const p = this.player;
    let live = -1;
    this.pendingSpawns = this.pendingSpawns.filter((s) => {
      if (s.wave || s.seal) return true;
      const tr = Math.max(s.trigger, this.viewReach) + s.r;
      const d2 = dist2(p.x, p.y, s.x, s.y);
      if (d2 <= tr * tr) {
        // plafond de monstres vivants : le groupe encore loin (anneau de la portée de l'écran) attend ; à sa propre
        // portée de déclenchement, ou s'il s'agit du boss de la run, il apparaît toujours (le joueur le trouve là où il l'attend)
        const near = (s.trigger + s.r) ** 2;
        if (d2 > near && !this.zone.spawns[s.idx]?.runBoss) {
          if (live < 0) live = this.liveMonsters();
          if (live >= MAX_LIVE_MONSTERS) return true;
        }
        const out = this.spawnGroup(s.idx);
        if (live >= 0) live += out.length;
        return false;
      }
      return true;
    });
  }

  /** Monstres vivants hostiles (hors créatures du joueur et du mercenaire) */
  liveMonsters(): number {
    let n = 0;
    for (const m of this.monsters) if (!m.dead && m.team === 1 && !m.pet && !m.isSummon && !m.mirror) n++;
    return n;
  }

  /* -------------------------------------------------------------- */
  /* Joueur                                                          */
  /* -------------------------------------------------------------- */

  private updatePlayer(): void {
    const p = this.player;
    const inp = this.input;
    if (p.dead) {
      p.modeT++;
      return;
    }
    this.tickPlayerStatus();
    this.applyPlayerInputs();
    // modes bloquants : incantation, coup reçu, gel
    if (this.continuePlayerAction()) {
      // a game mode where a skill does not wait for the running cast (rule `player.parallelCast`, lot 298): cast at once beside it
      if (inp.cast && RULES['player.parallelCast'](this) && this.sideCast(inp.cast.skill, inp.cast.tx, inp.cast.ty, inp.cast.targetId) !== 'wait') inp.cast = null;
      // a game mode where the hero walks while casting (lot 291); base: casting roots him
      if ((p.mode === 'cast' || p.mode === 'attack') && RULES['player.castWhileMoving'](this)) this.movePlayer(true);
      return;
    }
    if (p.freezeT > 0) return;

    // nouvelle incantation
    if (inp.cast) {
      const c = inp.cast;
      inp.cast = null;
      if (this.startCast(c.skill, c.tx, c.ty, c.targetId)) {
        if (RULES['player.castWhileMoving'](this)) this.movePlayer(true);
        return;
      }
    }
    this.movePlayer();
  }

  /** Décomptes des statuts, régénération, poison, soins sur la durée, buffs expirés, effets passifs */
  private tickPlayerStatus(): void {
    const p = this.player;
    if (p.chillT > 0) p.chillT--;
    if (p.freezeT > 0) p.freezeT--;
    if (p.potionCd > 0) p.potionCd--;
    // régénération
    const d = p.d;
    p.mana = Math.min(p.manaMax, p.mana + d.manaRegen * DT);
    if (d.lifeRegen > 0) p.hp = Math.min(p.hpMax, p.hp + d.lifeRegen * DT);
    // poison (D2) : dégâts sur la durée, une seule source active
    if ((p.poisonT ?? 0) > 0 && !p.dead) {
      p.poisonT--;
      p.hp -= p.poisonRate;
      if (p.hp <= 0) this.killPlayer();
    }
    if (p.healT > 0) {
      p.healT--;
      p.hp = Math.min(p.hpMax, p.hp + p.healPerTick);
    }
    if (p.manaHealT > 0) {
      p.manaHealT--;
      p.mana = Math.min(p.manaMax, p.mana + p.manaHealPerTick);
    }
    if (p.warpRegen) tickWarpRegen(this);
    // buffs expirés
    if (p.buffs.length && p.buffs.some((b) => b.until <= this.tick)) {
      p.buffs = p.buffs.filter((b) => b.until > this.tick);
      p.shieldActive = p.buffs.some((b) => b.id === 'energy_shield');
      this.refreshPlayer();
    }
    applyPassiveTick(this);
  }

  /** Entrées ponctuelles : potion, potion de jet, objet à ramasser ou objet du décor à utiliser (devient le but de la marche) */
  private applyPlayerInputs(): void {
    const p = this.player;
    const inp = this.input;
    if (inp.potion) {
      this.usePotion(inp.potion);
      inp.potion = null;
    }
    if (inp.throwAt) {
      throwPotion(this, inp.throwAt.x, inp.throwAt.y);
      inp.throwAt = null;
    }
    if (inp.pickup != null) {
      const gi = this.items.find((g) => g.id === inp.pickup);
      if (gi) p.goal = { x: gi.x, y: gi.y, kind: 'pickup', ref: gi.id };
      inp.pickup = null;
    }
    if (inp.interact != null) {
      const o = this.objects.find((ob) => ob.id === inp.interact);
      // lot 312: a neighbour's object shown here is used once the hero has walked into its zone (same identifier there)
      if (o) p.goal = { x: o.x, y: o.y, kind: 'interact', ref: o.id };
      inp.interact = null;
    }
  }

  /** Incantation, attaque (frappes suivantes d'une séquence) ou coup reçu en cours ; vrai tant que le joueur est occupé */
  private continuePlayerAction(): boolean {
    const p = this.player;
    if (p.mode === 'cast' || p.mode === 'attack') {
      p.modeT++;
      if (p.cast && !p.cast.released && p.modeT >= p.cast.releaseAt) {
        p.cast.released = true;
        castSkill(this, p.cast.skill, p.cast.tx, p.cast.ty, p.cast.targetId, p.cast.strikes ? 0 : undefined);
      }
      // frappes suivantes d'une séquence (Zèle, Furie, Mitraille, Frénésie à deux armes) : voir rhythm.ts
      while (p.cast && p.cast.released && p.cast.strikes && (p.cast.strikesDone ?? 0) < p.cast.strikes.length && (p.modeT >= p.cast.strikes[p.cast.strikesDone ?? 0] || p.modeT >= p.modeLen)) {
        const k = (p.cast.strikesDone ?? 0) + 1;
        p.cast.strikesDone = k;
        castSkill(this, p.cast.skill, p.cast.tx, p.cast.ty, p.cast.targetId, k);
      }
      if (p.modeT >= p.modeLen) {
        p.mode = 'idle';
        p.cast = null;
      } else return true;
    }
    if (p.mode === 'hit') {
      p.modeT++;
      if (p.modeT >= p.modeLen) p.mode = 'idle';
      else return true;
    }
    return false;
  }

  /** Marche : direction du joystick, ou but (ramasser, utiliser) atteint ou contourné ; décoincement contre les obstacles */
  /** `casting`: the hero walks while a cast goes on (rule `player.castWhileMoving`): his mode and facing are the cast's */
  private movePlayer(casting = false): void {
    const p = this.player;
    const inp = this.input;
    let mx = inp.moveX;
    let my = inp.moveY;
    const ml = Math.hypot(mx, my);
    if (ml > 0.05) {
      p.goal = null;
    } else if (p.goal) {
      const dx = p.goal.x - p.x;
      const dy = p.goal.y - p.y;
      const dd = Math.hypot(dx, dy);
      if (dd <= INTERACT_RADIUS) {
        const g = p.goal;
        p.goal = null;
        if (g.kind === 'pickup') {
          const gi = this.items.find((it) => it.id === g.ref);
          if (gi) pickupGroundItem(this, gi);
        } else if (g.kind === 'interact') {
          const o = this.objects.find((ob) => ob.id === g.ref);
          if (o && !o.mirror) interactObject(this, o);
        }
        mx = 0;
        my = 0;
      } else {
        const sd = this.steer(p.goal.x, p.goal.y);
        if (sd) {
          mx = sd.x;
          my = sd.y;
        } else {
          // inatteignable et point le plus proche atteint : on abandonne
          p.goal = null;
        }
      }
    }
    const mlen = Math.hypot(mx, my);
    if (mlen > 0.05) {
      const speed = this.playerSpeed();
      const nx = mx / mlen;
      const ny = my / mlen;
      if (!casting) p.facing = Math.atan2(ny, nx);
      let moved: boolean;
      if (this.nudgeT > 0 && nx * this.nudgeDx + ny * this.nudgeDy > 0.7) moved = this.nudgeStep();
      else {
        this.nudgeT = 0;
        moved = this.moveActor(p, nx * speed * DT, ny * speed * DT, true);
      }
      if (moved) this.moveStuck = this.nudgeT > 0 ? this.moveStuck : 0;
      else if (++this.moveStuck >= 2 && this.nudgePlayer(nx, ny)) moved = true;
      if (!moved && p.goal && this.moveStuck > 12) p.goal = null;
      if (!casting) p.mode = 'walk';
    } else {
      this.moveStuck = 0;
      if (p.mode === 'walk') p.mode = 'idle';
    }
  }

  playerSpeed(walking = this.autoCfg?.walkMode === true): number {
    const p = this.player;
    // marche D2 : 6 yards/s contre 9 + FRW à la course ; la FRW ne joue qu'à la course
    let s = 5.2 * WALK_RATIO;
    if (!walking) {
      // rendements décroissants façon D2 sur la FRW d'équipement
      const frw = p.d.frw;
      const eff = (150 * frw) / (150 + frw);
      s = 5.2 * (1 + eff / 100);
    }
    if (p.chillT > 0) s *= 1 - p.chillPct;
    // a game mode's speed (lot 291); base: unchanged
    return RULES['player.speed'](this, s);
  }

  /** Tick avant lequel on ne peut plus lancer de potion de jet (recharge) */
  throwReadyTick = 0;

  startCast(skill: string, tx: number, ty: number, targetId: number): boolean {
    const p = this.player;
    const check = canCast(this, skill);
    if (!check.ok) {
      if (check.reason) this.events.push({ t: 'message', text: check.reason, color: '#9aa' });
      return false;
    }
    const cost = skillManaCost(this, skill);
    p.mana -= cost;
    druidPreCast(this, skill);
    // a game mode's cadence (rule `skills.castFrames`, lot 292c); base: Diablo II's frames
    const frames = Math.max(1, Math.round(RULES['skills.castFrames'](this, skill, castFrames(this, skill))));
    p.mode = skill === 'attack' || SKILL_BY_ID[skill]?.melee ? 'attack' : 'cast';
    p.modeT = 0;
    p.modeLen = frames;
    p.goal = null;
    if (tx !== p.x || ty !== p.y) p.facing = Math.atan2(ty - p.y, tx - p.x);
    const releaseAt = Math.max(1, Math.floor(frames * 0.55));
    p.cast = { skill, tx, ty, targetId, released: false, releaseAt, strikes: strikePlan(this, skill, frames, releaseAt) };
    this.stats.casts++;
    this.events.push({ t: 'cast', id: p.id, skill, x: p.x, y: p.y, tx, ty });
    RULES['skills.onCast'](this, skill, false);
    return true;
  }

  /**
   * A skill cast beside the running cast or strike (rule `player.parallelCast`, lot 298): its cost, its effect and its cast event at once,
   * no animation of its own (the running one goes on, its facing kept). `wait`: the weapon's attack or a melee strike (not a bow's or a
   * throw's skill, lot 301), which keep their
   * swing (asked again once the hero is free); `refused`: the skill cannot be cast now (cooldown, requirement)
   */
  sideCast(skill: string, tx: number, ty: number, targetId: number): 'cast' | 'wait' | 'refused' {
    const p = this.player;
    // lot 301: a shot of the bow or a throw (a ranged skill of the weapon) goes off beside too; a swing waits for the hero
    const swing = !!SKILL_BY_ID[skill]?.melee && SKILL_BY_ID[skill]?.kind !== 'ranged';
    if (skill === 'attack' || swing || p.cast?.skill === skill) return 'wait';
    if (!canCast(this, skill).ok) return 'refused';
    p.mana -= skillManaCost(this, skill);
    druidPreCast(this, skill);
    castSkill(this, skill, tx, ty, targetId);
    this.stats.casts++;
    this.events.push({ t: 'cast', id: p.id, skill, x: p.x, y: p.y, tx, ty });
    RULES['skills.onCast'](this, skill, true);
    return 'cast';
  }

  usePotion(kind: 'heal' | 'mana' | 'rejuv'): boolean {
    const p = this.player;
    const c = this.character;
    if (p.potionCd > 0) return false;
    const pool = c.belt;
    const idx = pool.findIndex((b) => b.kind === kind && b.qty > 0) >= 0 ? pool.findIndex((b) => b.kind === kind && b.qty > 0) : -1;
    if (idx < 0) return false;
    const slot = pool[idx];
    slot.qty--;
    // montée en gamme automatique (réglage `potionUpgrade`, activé par défaut dans l'application) : la potion vaut au moins le palier de son niveau
    const tier = this.autoCfg?.potionUpgrade ? Math.max(slot.tier, potionTierForLevel(c.level)) : slot.tier;
    const tierPct = [0.25, 0.35, 0.5, 0.7, 1][clamp(tier, 0, 4)];
    if (kind === 'heal') {
      p.healT = 25;
      p.healPerTick = (p.hpMax * tierPct) / 25;
    } else if (kind === 'mana') {
      p.manaHealT = 20;
      p.manaHealPerTick = (p.manaMax * tierPct) / 20;
    } else {
      // lot 321: rule `potion.rejuv` (Diablo II: 35 % for the small one, 100 % for the full one; pd2: 35 % / 65 %, at most 2 000)
      const r = RULES['potion.rejuv']();
      const pct = tier >= 1 ? r.full : r.small;
      p.hp = Math.min(p.hpMax, p.hp + Math.min(r.cap, p.hpMax * pct));
      p.mana = Math.min(p.manaMax, p.mana + Math.min(r.cap, p.manaMax * pct));
    }
    p.potionCd = 12;
    this.stats.potionsUsed++;
    this.events.push({ t: 'potion', kind });
    return true;
  }

  private navigator: Navigator | null = null;
  /** Ticks consécutifs où le joueur pousse sans avancer (aimant de sortie) */
  private moveStuck = 0;

  /**
   * Direction de marche vers un point (clic, toucher, objet, PNJ) en contournant les obstacles : A* sur la grille de marche (voir nav.ts).
   * Renvoie un vecteur unitaire (objet réutilisé) ou null si on est arrivé ou si le point est inatteignable et que le plus proche est atteint.
   */
  steer(tx: number, ty: number): { x: number; y: number } | null {
    this.navigator ??= new Navigator(this.grid);
    return this.navigator.steer(this.player.x, this.player.y, tx, ty, this.tick);
  }

  /** Recherches de chemin lancées (mesures) */
  get navPlans(): number {
    return this.navigator?.plans ?? 0;
  }

  /**
   * Aimant de sortie : le joueur pousse (nx,ny) sans avancer depuis au moins 2 ticks (bosse d'un mur, marche d'escalier, coin) ; on cherche à
   * côté, perpendiculairement, la position la plus proche (0,8 au plus) depuis laquelle le pas voulu passe, et on l'y pousse de 0,1 par tick.
   */
  private nudgeT = 0;
  private nudgeVx = 0;
  private nudgeVy = 0;
  private nudgeDx = 0;
  private nudgeDy = 0;

  /** Un tick de décalage engagé (0,1 au plus, jamais dans un mur ni dans un monstre) */
  private nudgeStep(): boolean {
    const p = this.player;
    const x = p.x + this.nudgeVx * 0.1;
    const y = p.y + this.nudgeVy * 0.1;
    this.nudgeT--;
    if (this.grid.circleBlocked(x, y, Math.min(p.radius, TERRAIN_RADIUS)) || this.bodyBlocked(x, y, p.radius, p.x, p.y)) {
      this.nudgeT = 0;
      return false;
    }
    p.x = x;
    p.y = y;
    return true;
  }

  private nudgePlayer(nx: number, ny: number): boolean {
    const p = this.player;
    const g = this.grid;
    const r = Math.min(p.radius, TERRAIN_RADIUS);
    const step = 0.22;
    for (let s = 0.1; s <= 0.81; s += 0.1) {
      let bestDot = -2;
      let bx = 0;
      let by = 0;
      for (let k = 0; k < 16; k++) {
        const vx = NUDGE_DIRS[k * 2];
        const vy = NUDGE_DIRS[k * 2 + 1];
        const dot = vx * nx + vy * ny;
        // pas à reculons dans le mur voulu : on cherche surtout sur les côtés et en avant
        if (dot < -0.4 || dot <= bestDot) continue;
        const ox = vx * s;
        const oy = vy * s;
        if (g.circleBlocked(p.x + ox, p.y + oy, r) || g.circleBlocked(p.x + ox * 0.5, p.y + oy * 0.5, r)) continue;
        // depuis cette position, le pas voulu doit passer
        if (g.circleBlocked(p.x + ox + nx * step, p.y + oy + ny * step, r) || g.circleBlocked(p.x + ox + nx * step * 2.4, p.y + oy + ny * step * 2.4, r)) continue;
        bestDot = dot;
        bx = vx;
        by = vy;
      }
      if (bestDot > -2) {
        // on s'engage : le décalage se poursuit sur les ticks suivants même si le glissement ordinaire ramènerait le joueur contre le mur
        this.nudgeVx = bx;
        this.nudgeVy = by;
        this.nudgeDx = nx;
        this.nudgeDy = ny;
        this.nudgeT = Math.ceil(s / 0.1);
        return this.nudgeStep();
      }
    }
    return false;
  }

  /**
   * Direction unitaire (objet réutilisé) d'un allié ou d'un monstre vers le joueur : ligne droite si le trajet est praticable,
   * sinon le champ de flux (qui contourne les murs), sinon tout droit.
   */
  dirToPlayer(m: { x: number; y: number }): { x: number; y: number } {
    const p = this.player;
    const o = this.allyDir;
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    const d = Math.hypot(dx, dy) || 1;
    o.x = dx / d;
    o.y = dy / d;
    if (d < 10 && this.grid.walkLine(m.x, m.y, p.x, p.y, TERRAIN_RADIUS + 0.02)) return o;
    const f = this.flowField().direction(m.x, m.y);
    if (f) {
      o.x = f.x;
      o.y = f.y;
    }
    return o;
  }
  private readonly allyDir = { x: 0, y: 0 };

  /**
   * Anti-coincement d'un allié qui suit le joueur : immobile plus d'une seconde alors qu'il est à plus de 5 de lui, il est replacé
   * près du joueur (sur un point relié, jamais à travers un mur). `moved` : distance parcourue ce tick, `speed` : vitesse en unités par seconde.
   */
  allyStuck(m: Monster, moved: number, speed: number, d: number): void {
    if (moved >= speed * DT * 0.25 || d <= 5) {
      m.stuckT = 0;
      return;
    }
    m.stuckT = (m.stuckT ?? 0) + 1;
    if (m.stuckT < TICK_HZ) return;
    m.stuckT = 0;
    const p = this.player;
    for (const [ox, oy] of [
      [-1.2, 0],
      [1.2, 0],
      [0, 1.2],
      [0, -1.2],
      [0.8, 0.8],
      [-0.8, -0.8],
    ]) {
      const x = p.x + ox;
      const y = p.y + oy;
      if (this.grid.circleBlocked(x, y, TERRAIN_RADIUS) || !this.grid.connected(p.x, p.y, x, y)) continue;
      this.events.push({ t: 'teleport', id: m.id, fx: m.x, fy: m.y, tx: x, ty: y });
      m.x = m.px = x;
      m.y = m.py = y;
      m.mode = 'idle';
      return;
    }
  }

  /** Côté de la dernière pousse latérale par acteur (+1/-1) : évite de faire des allers-retours entre deux côtés équivalents */
  private nudgeSide = new WeakMap<object, number>();

  /**
   * Pousse latérale (unitaire) vers le côté libre le plus proche : on cherche, perpendiculairement à la marche voulue (ux,uy), le plus petit
   * décalage (0,5 au plus) à partir duquel le chemin devant est dégagé sur ~0,5 ; null s'il n'y en a pas (mur large : le glissement s'en charge).
   */
  private lateralStep(a: object & { x: number; y: number }, ux: number, uy: number, r: number): { x: number; y: number } | null {
    const g = this.grid;
    const px = -uy;
    const px2 = ux;
    const pref = this.nudgeSide.get(a) ?? 1;
    for (let s = 0.08; s <= 0.521; s += 0.04) {
      for (const k of [pref, -pref]) {
        const ox = px * k * s;
        const oy = px2 * k * s;
        if (g.circleBlocked(a.x + ox, a.y + oy, r)) continue;
        // le décalage lui-même doit être praticable (à mi-chemin) et le pas devant dégagé
        if (g.circleBlocked(a.x + ox * 0.5, a.y + oy * 0.5, r)) continue;
        if (g.circleBlocked(a.x + ox + ux * 0.25, a.y + oy + uy * 0.25, r) || g.circleBlocked(a.x + ox + ux * 0.5, a.y + oy + uy * 0.5, r)) continue;
        this.nudgeSide.set(a, k);
        return { x: px * k, y: px2 * k };
      }
    }
    return null;
  }

  /**
   * Déplace un acteur avec glissement contre les murs. Si le mouvement direct est bloqué,
   * on essaie les composantes, puis des directions tournées (±30°, ±60°) pour ne pas
   * coincer un déplacement au joystick dans les couloirs.
   */
  moveActor(a: Player | Monster, dx: number, dy: number, isPlayer: boolean): boolean {
    // collision de terrain « point » façon D2 pour tous (joueur, mercenaire, invocations, monstres) : le rayon de corps ne sert qu'aux autres corps.
    // Un monstre au rayon de 0,4 se coinçait dans tous les passages d'une sous-tuile alors que le champ de flux le guidait par le centre des cases.
    const r = Math.min(a.radius, TERRAIN_RADIUS);
    const g = this.grid;
    const tryMove = (mx: number, my: number): boolean => {
      const nx = a.x + mx;
      const ny = a.y + my;
      if (g.circleBlocked(nx, ny, r)) return false;
      if (isPlayer && this.bodyBlocked(nx, ny, a.radius, a.x, a.y)) return false;
      a.x = nx;
      a.y = ny;
      return true;
    };
    if (tryMove(dx, dy)) return true;
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) return false;
    // glissement sur les axes (seulement si la composante est franche : un filet de vitesse sur un axe est un accrochage, voir pousse latérale)
    if (Math.abs(dx) > 0.3 * l && tryMove(dx, 0)) return true;
    if (Math.abs(dy) > 0.3 * l && tryMove(0, dy)) return true;
    const ang = Math.atan2(dy, dx);
    for (const off of [0.52, -0.52, 1.05, -1.05]) {
      const aa = ang + off;
      const f = Math.cos(off);
      if (tryMove(Math.cos(aa) * l * f, Math.sin(aa) * l * f)) return true;
    }
    // pousse latérale : un coin ou un pilier étroit ne bloque qu'une partie du corps, on se décale (0,5 au plus) vers le côté libre à pleine vitesse
    {
      const lat = this.lateralStep(a, dx / l, dy / l, r);
      if (lat && (tryMove(lat.x * l * 0.9 + (dx / l) * l * 0.4, lat.y * l * 0.9 + (dy / l) * l * 0.4) || tryMove(lat.x * l, lat.y * l))) return true;
    }
    for (const off of [1.31, -1.31, 1.4, -1.4]) {
      const aa = ang + off;
      const f = Math.max(Math.cos(off), 0.3);
      if (tryMove(Math.cos(aa) * l * f, Math.sin(aa) * l * f)) return true;
    }
    // joueur et alliés : mur en dents de scie puis passage de coin façon point D2
    // mur en dents de scie (escalier en diagonale) : normale lissée sur les sous-tuiles bloquées voisines, glissement le long de la tangente moyenne
    {
      const cx0 = Math.floor(a.x / CELL);
      const cy0 = Math.floor(a.y / CELL);
      let gx = 0;
      let gy = 0;
      for (let oy = -2; oy <= 2; oy++) {
        for (let ox = -2; ox <= 2; ox++) {
          if (!g.isBlockedCell(cx0 + ox, cy0 + oy)) continue;
          const ex = a.x - (cx0 + ox + 0.5) * CELL;
          const ey = a.y - (cy0 + oy + 0.5) * CELL;
          const d2 = ex * ex + ey * ey + 0.05;
          gx += ex / d2;
          gy += ey / d2;
        }
      }
      const gl = Math.hypot(gx, gy);
      if (gl > 1e-6) {
        const nx = gx / gl;
        const ny = gy / gl;
        const into = dx * nx + dy * ny;
        if (into < 0) {
          const tx = dx - into * nx;
          const ty = dy - into * ny;
          if (Math.hypot(tx, ty) > l * 0.2 && (tryMove(tx, ty) || tryMove(tx * 0.5, ty * 0.5))) return true;
        }
      }
    }
    const trySoft = (mx: number, my: number): boolean => {
      const nx = a.x + mx;
      const ny = a.y + my;
      if (g.circleBlocked(nx, ny, 0.02)) return false;
      const ax = Math.floor(a.x / CELL);
      const ay = Math.floor(a.y / CELL);
      const bx = Math.floor(nx / CELL);
      const by = Math.floor(ny / CELL);
      let ok = g.circleBlocked(a.x, a.y, r);
      if (!ok) {
        // on pousse en diagonale vers un passage de coin de la sous-tuile courante (voir WalkGrid.cornerGap) : le point peut s'en approcher
        for (let oy = -1; oy <= 1 && !ok; oy += 2)
          for (let ox = -1; ox <= 1; ox += 2)
            if (mx * ox > 1e-6 && my * oy > 1e-6 && g.cornerGap(ax, ay, ox, oy)) {
              ok = true;
              break;
            }
      }
      if (ax !== bx && ay !== by && g.isBlockedCell(bx, ay) && g.isBlockedCell(ax, by) && !g.cornerGap(ax, ay, bx - ax, by - ay)) return false;
      if (!ok) return false;
      if (isPlayer && this.bodyBlocked(nx, ny, a.radius, a.x, a.y)) return false;
      a.x = nx;
      a.y = ny;
      return true;
    };
    // pas entier puis pas réduits (le point peut s'arrêter à 1 cm du coin au tick précédent : le pas entier échoue alors pour 0,02)
    for (const f of [1, 0.5, 0.25]) {
      if (trySoft(dx * f, dy * f)) return true;
    }
    return (Math.abs(dx) > 0.3 * l && trySoft(dx, 0)) || (Math.abs(dy) > 0.3 * l && trySoft(0, dy));
  }

  /** Le joueur est bloqué par les corps des monstres vivants (on se fait encercler, comme dans D2). */
  private bodyBlocked(x: number, y: number, r: number, ox: number, oy: number): boolean {
    const near = this.monsterHash.query(x, y, r + 1.5, this.queryBuf);
    for (const m of near) {
      if (m.dead || m.isSummon) continue;
      const rr = r + m.radius * 0.8;
      const d2n = dist2(x, y, m.x, m.y);
      if (d2n < rr * rr) {
        // autorise à s'éloigner d'un monstre déjà en contact
        if (d2n < dist2(ox, oy, m.x, m.y)) return true;
      }
    }
    return false;
  }

  knockback(m: Monster, sx: number, sy: number, dist: number): void {
    const a = Math.atan2(m.y - sy, m.x - sx);
    this.moveActor(m, Math.cos(a) * dist, Math.sin(a) * dist, false);
  }

  /* -------------------------------------------------------------- */
  /* Requêtes (lecture seule, utilisées par l'IA, la visée et les bots) */
  /* -------------------------------------------------------------- */

  monstersNear(x: number, y: number, r: number, out: Monster[] = []): Monster[] {
    this.monsterHash.query(x, y, r, out);
    let w = 0;
    for (let i = 0; i < out.length; i++) if (!out[i].dead && !out[i].isSummon) out[w++] = out[i];
    out.length = w;
    return out;
  }

  aliveMonsters(): Monster[] {
    return this.monsters.filter((m) => !m.dead && !m.isSummon);
  }

  /* -------------------------------------------------------------- */
  /* Morts, butin, expérience                                        */
  /* -------------------------------------------------------------- */

  killMonster(m: Monster, killer: Player | null): void {
    if (m.dead) return;
    // lot 312: a copy of a neighbour's monster: it dies in its own zone (experience, loot, quests there), the copy follows it
    if (m.mirror && this.seam?.killMirror) {
      m.dead = true;
      m.hp = 0;
      this.seam.killMirror(m, killer);
      return;
    }
    m.dead = true;
    m.hp = 0;
    m.mode = 'death';
    m.modeT = 0;
    m.modeLen = 20;
    m.deathTick = this.tick;
    m.chillT = 0;
    m.freezeT = 0;
    m.burnT = 0;
    this.events.push({ t: 'death', id: m.id, x: m.x, y: m.y, rank: m.rank, family: m.def.family, monster: m.def.id, name: m.name });
    if (m.mercHit) onMercKill(this, m);
    if (m.psCloud) releasePsCloud(this, m);
    if (m.isSummon) {
      if (m.pet === 'merc') onMercDeath(this, m);
      else onPetDeath(this, m);
      return;
    }
    // a game mode may keep them coming (rule `ai.allyDeathFlee`, lot 301)
    if (m.def.id === 'fallen' && RULES['ai.allyDeathFlee'](this, m)) {
      // D2 : les Déchus proches paniquent un instant à la mort d'un des leurs (pas les élites)
      for (const o of this.monstersNear(m.x, m.y, 6)) {
        if (o.def.id === 'fallen' && (o.rank === 'normal' || o.rank === 'minion')) o.fleeUntil = this.tick + TICK_HZ + this.rng.ai.int(TICK_HZ);
      }
    }
    monsterDeathEffects(this, m);
    this.stats.kills++;
    this.stats.byRank[m.rank] = (this.stats.byRank[m.rank] ?? 0) + 1;
    const p = this.player;
    if (!p.dead) {
      const xp = xpForKill(this, m);
      if (xp > 0) gainXp(this, xp);
      fireProcs(this, 'Kill', m);
      fireProcs(this, 'Death', m);
      const rr = p.d.all.get('reanimateReturned') ?? 0;
      if (rr > 0 && !m.noLoot && this.rng.combat.chance(Math.min(100, rr) / 100)) reanimateReturned(this, m);
      if (p.d.lifePerKill) p.hp = Math.min(p.hpMax, p.hp + p.d.lifePerKill);
      if (p.d.manaPerKill) p.mana = Math.min(p.manaMax, p.mana + p.d.manaPerKill);
    }
    if (!m.noLoot) {
      const drops = rollMonsterDrops(this, m);
      for (const it of drops) this.dropItem(it, m.x, m.y);
    }
    if (this.run) this.run.onKill(this, m);
    void killer;
  }

  dropItem(item: Item, x: number, y: number, spread = 1.4): GroundItem {
    const a = this.rng.misc.float(0, TAU);
    const r = this.rng.misc.float(0.2, spread);
    let tx = x + Math.cos(a) * r;
    let ty = y + Math.sin(a) * r;
    const free = this.grid.nearestFree(tx, ty, 4);
    if (free) {
      tx = free.x;
      ty = free.y;
    } else {
      tx = x;
      ty = y;
    }
    const gi: GroundItem = { id: this.newId(), item, x: tx, y: ty, dropTick: this.tick, show: lootFilterDecision(this.character, item) };
    this.items.push(gi);
    this.stats.itemsDropped++;
    this.events.push({ t: 'itemDrop', uid: item.uid, x: tx, y: ty, tier: gi.show });
    return gi;
  }

  killPlayer(): void {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.hp = 0;
    p.mode = 'death';
    p.modeT = 0;
    p.modeLen = 25;
    p.cast = null;
    p.goal = null;
    p.lastDeathTick = this.tick;
    this.stats.deaths++;
    this.events.push({ t: 'playerDeath' });
  }

  /** Réapplique le filtre de butin aux objets au sol (réglages modifiés) */
  refilter(): void {
    for (const gi of this.items) gi.show = lootFilterDecision(this.character, gi.item);
    this.filterVersion++;
  }

  /** Dégâts d'un monstre au joueur (appelé par l'IA et les projectiles ennemis). */
  hurtPlayer(src: Monster | null, elem: Element, amount: number, spell: boolean, extra?: { freeze?: number }): number {
    const pk = { phys: 0, fire: 0, cold: 0, light: 0, poison: 0, magic: 0, spell, freeze: extra?.freeze };
    pk[elem] = amount;
    // lot 312: a proxy world's blows land on the hero in the zone he is in
    if (this.proxy && this.seam?.hurtPlayer) return this.seam.hurtPlayer(src, pk);
    const dmg = damagePlayer(this, this.player, pk, src);
    this.stats.damageTaken += dmg;
    return dmg;
  }

  hurtPlayerPacket(src: Monster | null, pk: Parameters<typeof damagePlayer>[2]): number {
    if (this.proxy && this.seam?.hurtPlayer) return this.seam.hurtPlayer(src, pk);
    const dmg = damagePlayer(this, this.player, pk, src);
    this.stats.damageTaken += dmg;
    return dmg;
  }

  hurtMonster(m: Monster, pk: Parameters<typeof damageMonster>[2]): number {
    return damageMonster(this, m, pk, this.actingAs ?? this.player);
  }

  /** Temps de jeu de la zone en secondes */
  get seconds(): number {
    return this.tick / TICK_HZ;
  }

  /** Angle d'orientation vers une cible ; utilitaire pour l'IA */
  turnToward(a: Monster | Player, x: number, y: number, maxStep = TAU): void {
    const target = Math.atan2(y - a.y, x - a.x);
    const d = angleDiff(a.facing, target);
    a.facing += clamp(d, -maxStep, maxStep);
  }
}

function objectLabel(kind: string, id?: string, variant?: string): string {
  switch (kind) {
    case 'well':
      return 'Puits';
    case 'quest':
      return QUEST_OBJECTS.find((q) => q.id === id)?.label ?? 'Objet de quête';
    case 'stash':
      return 'Coffre';
    case 'cube':
      return 'Cube horadrique';
    case 'chest':
      return 'Coffre';
    case 'shrine':
      return variant === 'health' ? 'Sanctuaire de santé' : variant === 'mana' ? 'Sanctuaire de mana' : 'Sanctuaire';
    case 'barrel':
      return variant === 'urn' ? 'Urne' : variant === 'corpse' ? 'Dépouille' : 'Tonneau';
    case 'sarcophagus':
      return 'Sarcophage';
    case 'weaponrack':
      return variant === 'armor' ? 'Présentoir d’armure' : 'Râtelier';
    case 'seal':
      return 'Sceau';
    case 'waypoint':
      return 'Point de passage';
    case 'npc':
      return id === 'malah'
        ? 'Malah (soigneuse)'
        : id === 'larzuk'
          ? 'Larzuk (marchand)'
          : id === 'anya'
            ? 'Anya'
            : id === 'qual_kehk'
              ? 'Qual-Kehk (mercenaires)'
              : id === 'ormus'
                ? 'Ormus (mage)'
                : id === 'alkor'
                  ? 'Alkor (alchimiste)'
                  : id === 'hratli'
                    ? 'Hratli (forgeron)'
                    : id === 'asheara'
                      ? 'Asheara (mercenaires)'
                      : id === 'natalya'
                        ? 'Natalya'
                        : id === 'meshif3'
                          ? 'Meshif (voyage)'
                          : id === 'cain3'
                            ? 'Deckard Cain'
                            : id === 'atma'
                              ? 'Atma (aubergiste)'
                              : id === 'fara'
                                ? 'Fara (forgeronne)'
                                : id === 'elzix'
                                  ? 'Elzix (marchand)'
                                  : id === 'drognan'
                                    ? 'Drognan (mage)'
                                    : id === 'lysander'
                                      ? 'Lysander (alchimiste)'
                                      : id === 'greiz'
                                        ? 'Greiz (mercenaires)'
                                        : id === 'warriv2'
                                          ? 'Warriv (voyage)'
                                          : id === 'geglash'
                                            ? 'Geglash'
                                            : id === 'meshif'
                                              ? 'Meshif'
                                              : id === 'jerhyn'
                                                ? 'Jerhyn'
                                                : id === 'cain2'
                                                  ? 'Deckard Cain'
                                                  : id === 'akara'
                                                    ? 'Akara (soigneuse)'
                                                    : id === 'charsi'
                                                      ? 'Charsi (forgeronne)'
                                                      : id === 'gheed'
                                                        ? 'Gheed (marchand)'
                                                        : id === 'kashya'
                                                          ? 'Kashya (mercenaires)'
                                                          : id === 'warriv'
                                                            ? 'Warriv (voyage)'
                                                            : id === 'jamella'
                                                              ? 'Jamella (soigneuse)'
                                                              : id === 'halbu'
                                                                ? 'Halbu (forgeron)'
                                                                : id === 'tyrael'
                                                                  ? 'Tyrael'
                                                                  : id === 'cain' || id === 'cain5'
                                                                    ? 'Deckard Cain'
                                                                    : 'PNJ';
    default:
      return kind;
  }
}

/** Construit la grille de collision à partir des données de la zone. */
/** 16 directions unitaires (x, y) autour du joueur pour l'aimant de sortie */
const NUDGE_DIRS = Float64Array.from({ length: 32 }, (_, i) => (i % 2 ? Math.sin(((i >> 1) / 16) * Math.PI * 2) : Math.cos(((i >> 1) / 16) * Math.PI * 2)));
