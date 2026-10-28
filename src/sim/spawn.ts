/** Création des monstres : niveau, rang, modificateurs, statistiques issues des courbes. */
import { hashSeed } from '../core/rng';
import { MONSTER_BY_ID, MONSTER_MODS } from '../data/monsters';
import { SUPER_UNIQUE_ALIAS, SUPER_UNIQUE_DEFS, type SuperUniqueDef } from '../data/monsters-fidelity';
import { DIFF_MULT, RANK_MULT, monsterAr, monsterDef, monsterDmg, monsterHp, monsterRegenPerSec, monsterXp } from '../data/curves';
import type { Difficulty, MonsterDef, MonsterRank } from '../data/types';
import type { Element } from '../data/stats';
import type { Monster, SpawnOptions } from './actors';
import type { World } from './world';
import { monsterAuraLevel, pickEnchantAura } from './monster-auras';
import { simHooks } from './hooks';
import { RULES } from '../mods/rules';

export type { SpawnOptions } from './actors';

/** Cartes : plafond des résistances naturelles des monstres (sous l'immunité : 100 %) ; l'immunité ne vient que de ce que la carte annonce */
const MAP_NATURAL_RES_CAP = 75;

const UNIQUE_PREFIX = ['Griffe', 'Crâne', 'Sang', 'Ombre', 'Os', 'Cendre', 'Peste', 'Fiel', 'Suie', 'Rouille', 'Givre', 'Tonnerre', 'Charogne', 'Ronce', 'Venin'];
const UNIQUE_SUFFIX = ['-Noire', '-Pourrie', '-de-Fer', '-Hurlante', '-Brisée', '-Creuse', '-Lugubre', '-Sanglante', '-Ardente', '-Maudite'];
const UNIQUE_TITLE = ['le Dévoreur', "l'Affamé", 'le Profanateur', 'le Hideux', 'le Cruel', 'le Boucher', 'le Sombre', "l'Impie", 'le Fléau', 'le Tourmenteur'];

function uniqueName(w: World): string {
  const r = w.rng.spawn;
  return `${r.pick(UNIQUE_PREFIX)}${r.pick(UNIQUE_SUFFIX)} ${r.pick(UNIQUE_TITLE)}`;
}

/** Super-unique d'après le nom affiché par la zone (SuperUniques.txt ou alias français) */
function superUniqueKey(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase().replace(/’/g, "'");
  if (SUPER_UNIQUE_DEFS[n]) return n;
  const a = SUPER_UNIQUE_ALIAS[n] ?? SUPER_UNIQUE_ALIAS[name.toLowerCase()];
  if (a && SUPER_UNIQUE_DEFS[a]) return a;
  for (const [k, d] of Object.entries(SUPER_UNIQUE_DEFS)) if (d.name.toLowerCase() === n) return k;
  return undefined;
}
export const superUniqueOf = (name: string | undefined): SuperUniqueDef | undefined => {
  const k = superUniqueKey(name);
  return k ? SUPER_UNIQUE_DEFS[k] : undefined;
};

/** Espèce d'un groupe de zone : l'espèce demandée ou l'une de ses sœurs (MonsterDef.alts), tirée de façon stable par groupe */
export function speciesAlt(seed: number, idx: number, id: string): string {
  const alts = MONSTER_BY_ID[id]?.alts;
  if (!alts?.length) return id;
  const total = 1 + alts.reduce((s, [, w]) => s + w, 0);
  let r = ((hashSeed(`${seed}:${idx}:alt`) % 10000) / 10000) * total - 1;
  if (r < 0) return id;
  for (const [a, wt] of alts) {
    r -= wt;
    if (r < 0) return MONSTER_BY_ID[a] ? a : id;
  }
  return id;
}

/** Modificateurs transmis aux sbires (MonUMod « xfer ») : l'aura reste au chef */
const NO_XFER = new Set(['auraEnchanted']);
/** PD2 : porte-clés super-uniques plus robustes en Enfer (Bloodwitch ×9) */
const SU_HELL_HP: Record<string, number> = { 'bloodwitch the wild': 9 };

const tri = (d: Difficulty, v: [number, number, number]): number => v[d];

/**
 * D2 : un bonus de résistance n'est appliqué que s'il ne crée pas une troisième immunité et n'augmente pas une immunité
 * existante quand le monstre en a déjà deux (Arreat Summit, « Monster Bonuses »).
 */
export function addEliteRes(res: Record<Element, number>, e: Element, v: number): void {
  const immune = (Object.keys(res) as Element[]).filter((k) => res[k] >= 100).length;
  if (immune >= 2 && (res[e] >= 100 || res[e] + v >= 100)) return;
  res[e] += v;
}

export function spawnMonster(w: World, defId: string, x: number, y: number, opts: SpawnOptions, spawnKey: string): Monster | null {
  const def = MONSTER_BY_ID[defId];
  if (!def) throw new Error(`Monstre inconnu : ${defId}`);
  const pos = w.grid.nearestFree(x, y, 6);
  if (!pos) return null;
  const d = w.difficulty;
  // boss de carte : rang unique (nom doré, escorte de sbires) même pour une espèce de boss de campagne (Baal, Duriel des donjons)
  const mapBoss = !!opts.mapBoss && (w.run?.mapTier ?? 0) > 0;
  const rank: MonsterRank = def.boss && !mapBoss ? 'boss' : opts.rank;
  const rm = RANK_MULT[rank];
  const dm = DIFF_MULT[d];
  const suKey = rank === 'unique' && !mapBoss ? superUniqueKey(opts.uniqueName) : undefined;
  const su = suKey ? SUPER_UNIQUE_DEFS[suKey] : undefined;
  const mlvl = Math.min(110, def.bossLevel && rank === 'boss' ? def.bossLevel[d] : w.zoneLevel + rm.lvl);
  const res = baseResistances(w, def, opts, spawnKey);
  const mapRun = w.run?.runId === 'map';
  if (mapRun) for (const k of Object.keys(res) as Element[]) if (k !== 'magic') res[k] = Math.min(res[k], MAP_NATURAL_RES_CAP);
  const m: Monster = {
    kind: 'monster',
    id: w.newId(),
    team: 1,
    x: pos.x,
    y: pos.y,
    px: pos.x,
    py: pos.y,
    radius: def.radius,
    facing: w.rng.spawn.float(0, Math.PI * 2),
    hp: 1,
    hpMax: 1,
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
    def,
    mlvl,
    rank,
    name: def.name,
    mods: [],
    res,
    dmgMin: 0,
    dmgMax: 0,
    ar: monsterAr(mlvl),
    defense: monsterDef(mlvl),
    xp: 0,
    speed: def.speed,
    scale: def.scale,
    tint: def.tint ?? 0xffffff,
    aggro: false,
    atk: 0,
    atkCd: def.attacks.map(() => w.rng.spawn.int(20)),
    atkTarget: { x: 0, y: 0 },
    atkApplied: true,
    spawnX: pos.x,
    spawnY: pos.y,
    leader: opts.leader ?? 0,
    thinkTick: 0,
    wanderX: pos.x,
    wanderY: pos.y,
    phase: 0,
    summoned: 0,
    noLoot: opts.noLoot,
    red: {},
    spawnKey,
  };
  // boss : fiche par difficulté (monstats) ; autres : multiplicateurs de rang D2 par difficulté
  const mul = { hp: 0, dmg: 0, xp: 0 };
  mul.hp = (rank === 'boss' ? (def.hpD ? tri(d, def.hpD) : def.hp) : def.hp * tri(d, rm.hp)) * dm.hp;
  mul.dmg = (rank === 'boss' ? (def.dmgD ? tri(d, def.dmgD) : def.dmg) : def.dmg * tri(d, rm.dmg)) * dm.dmg;
  mul.xp = def.xp * rm.xp * dm.xp;
  rankDecor(w, m, opts, mul, su, suKey, mapBoss);
  applyMods(w, m, res, mul);
  if (rank === 'champion' && !m.mods.includes('fanatic')) m.speed *= 1.2;
  if (mapBoss) {
    const bm = RULES['maps.bossStatMul'](def, w.run!.mapTier);
    mul.hp = bm.hp * dm.hp;
    mul.dmg = bm.dmg * dm.dmg;
    mul.xp = Math.min(def.xp, 3) * rm.xp * dm.xp * 3;
  }
  // gardien de sceau : sa mort est obligatoire, jamais invulnérable (immunités ramenées à 90 %,
  // modificateurs d'unique compris)
  if (opts.baseRes) for (const k of Object.keys(res) as Element[]) res[k] = Math.min(90, res[k]);
  if (mapRun) for (const k of Object.keys(res) as Element[]) if (k !== 'magic' || mapBoss) res[k] = Math.min(res[k], MAP_NATURAL_RES_CAP);
  if (def.aura && !m.auraId) {
    m.auraId = def.aura[0];
    m.auraLvl = def.aura[1] || monsterAuraLevel(mlvl);
  }
  m.hpMax = Math.max(1, Math.round(monsterHp(mlvl) * mul.hp));
  m.hp = m.hpMax;
  // D2 : les super-uniques ne régénèrent pas
  m.regen = !su && !mapBoss && def.regen ? monsterRegenPerSec(m.hpMax, def.regen) : 0;
  const avg = monsterDmg(mlvl) * mul.dmg;
  m.dmgMin = avg * 0.75;
  m.dmgMax = avg * 1.25;
  m.xp = monsterXp(mlvl, w.difficulty) * mul.xp;
  // modificateurs de monde, immunités des cartes, état de boss de carte (règle du mod qui fournit les cartes)
  RULES['world.monsterSpawned'](w, m, mapBoss);
  w.monsters.push(m);
  return m;
}

/** Multiplicateurs de vie, dégâts et expérience d'un monstre, ajustés par le rang et les modificateurs */
interface StatMul {
  hp: number;
  dmg: number;
  xp: number;
}

/** Résistances de l'espèce à cette difficulté : variante du groupe (même tirage pour toute la meute), gardiens de sceau jamais immunisés */
function baseResistances(w: World, def: MonsterDef, opts: SpawnOptions, spawnKey: string): Record<Element, number> {
  const d = w.difficulty;
  const res: Record<Element, number> = { phys: 0, fire: 0, cold: 0, light: 0, poison: 0, magic: 0 };
  for (const [k, v] of Object.entries(def.res)) {
    if (v) res[k as Element] = v[d];
  }
  if (def.resVariants?.length && !opts.baseRes) {
    // même variante pour tout le groupe (clé « groupe:rang dans le groupe ») ; une variante remplace toutes les résistances
    const group = spawnKey.split(':')[0];
    const vi = hashSeed(`${w.seed}:${group}:${def.id}`) % def.resVariants.length;
    for (const [k, v] of Object.entries(def.resVariants[vi])) if (v) res[k as Element] = v[d];
  }
  // gardiens de sceaux (mort obligatoire) : jamais immunisés, quelle que soit l'espèce
  if (opts.baseRes) for (const k of Object.keys(res) as Element[]) res[k] = Math.min(res[k], 90);
  // cartes : seules les immunités annoncées sur la carte (zone et affixes, tirées plus loin sur une part des monstres) comptent ;
  // les immunités naturelles et les variantes immunisées de l'espèce sont ramenées à MAP_NATURAL_RES_CAP
  return res;
}

/** Rang : type de champion, modificateurs et nom d'unique (super-uniques : modificateurs fixes), sbires héritant de leur chef */
function rankDecor(w: World, m: Monster, opts: SpawnOptions, mul: StatMul, su: SuperUniqueDef | undefined, suKey: string | undefined, mapBoss: boolean): void {
  const { def, rank } = m;
  const d = w.difficulty;
  if (rank === 'champion') {
    // type de champion (D2 : champion, fantomatique, fanatique, possédé, berserker à chances égales), commun à toute la meute
    m.mods = opts.inheritMods ?? pickChampionType(w);
    m.tint = 0x7fa6ff;
    m.scale *= 1.08;
    m.name = `${def.name} ${m.mods.length ? (MONSTER_MODS.find((x) => x.id === m.mods[0])?.name ?? 'champion').toLowerCase() : 'champion'}`;
  } else if (rank === 'unique') {
    // D2 : 1/2/3 modificateurs aléatoires en Normal/Cauchemar/Enfer ; super-uniques : modificateurs fixes + 0/1/2 aléatoires
    if (su) m.mods.push(...su.mods);
    // boss de carte : aucun modificateur aléatoire (son kit de compétences les remplace)
    const n = mapBoss ? 0 : su ? d : d + 1;
    for (let i = 0; i < n; i++) {
      const p = pickMod(w, def, m.mods);
      if (p) m.mods.push(p);
    }
    m.tint = 0xd9b45a;
    m.scale *= 1.15;
    m.name = opts.uniqueName ?? uniqueName(w);
    if (suKey) {
      m.su = suKey;
      if (d === 2) mul.hp *= SU_HELL_HP[suKey] ?? 1;
    }
  } else if (rank === 'minion') {
    m.name = `${def.name} (sbire)`;
    // les sbires partagent les modificateurs de leur unique (sauf l'aura, qui reste au chef)
    if (opts.inheritMods) m.mods = opts.inheritMods.filter((x) => !NO_XFER.has(x));
  }
}

/** Effets des modificateurs d'élite (Arreat Summit) : dégâts, toucher, vitesse, résistances, aura ; plus forts sur l'unique que sur ses sbires */
function applyMods(w: World, m: Monster, res: Record<Element, number>, mul: StatMul): void {
  const d = w.difficulty;
  const { rank, mlvl } = m;
  const lead = rank === 'unique';
  for (const mod of m.mods) {
    switch (mod) {
      case 'extraStrong':
        // unique +135/112/99 % de dégâts, +90/75/66 % de toucher ; sbires +67/56/49 %, +45/37/33 %
        mul.dmg *= 1 + (lead ? [1.35, 1.12, 0.99] : [0.67, 0.56, 0.49])[d];
        m.ar *= 1 + (lead ? [0.9, 0.75, 0.66] : [0.45, 0.37, 0.33])[d];
        break;
      case 'extraFast':
        m.speed *= 2;
        break;
      case 'stoneSkin':
        addEliteRes(res, 'phys', 50);
        m.defense *= 2;
        break;
      case 'magicResistant':
        addEliteRes(res, 'cold', 40);
        addEliteRes(res, 'fire', 40);
        addEliteRes(res, 'light', 40);
        break;
      case 'spectralHit':
        for (const e of ['cold', 'fire', 'light'] as const) if (res[e] < 75) addEliteRes(res, e, 40);
        break;
      case 'fireEnchanted':
        addEliteRes(res, 'fire', 75);
        break;
      case 'coldEnchanted':
        addEliteRes(res, 'cold', 75);
        break;
      case 'lightningEnchanted':
        addEliteRes(res, 'light', 75);
        break;
      case 'manaBurn':
        addEliteRes(res, 'magic', 20);
        break;
      case 'auraEnchanted':
        if (lead) {
          m.auraId = pickEnchantAura(w, mlvl);
          m.auraLvl = monsterAuraLevel(mlvl);
        }
        break;
      // types de champions (Arreat Summit) : les dégâts +90/75/66 % viennent de RANK_MULT
      case 'ghostly':
        // résistance aux dégâts réglée à 80 % ; coups de froid (+33-50 %)
        res.phys = Math.max(res.phys, 80);
        m.tint = 0xb8d8ff;
        break;
      case 'fanatic':
        m.speed *= 2;
        m.defense *= 0.3;
        break;
      case 'berserk':
        // +270/225/198 % de dégâts et de toucher (au lieu de +90/75/66 %), ¼ de la vie d'un champion, expérience ×5
        mul.dmg *= [3.7, 3.25, 2.98][d] / tri(d, RANK_MULT.champion.dmg);
        m.ar *= [3.7, 3.25, 2.98][d];
        mul.hp *= 0.25;
        mul.xp *= 5 / 3;
        break;
      case 'possessed':
        // vie ×2 par rapport au champion
        mul.hp *= 2;
        break;
    }
  }
}

/** Monstre qui tire des projectiles (Tirs multiples) */
const shoots = (def: MonsterDef): boolean => def.attacks.some((a) => a.kind === 'missile');

function pickMod(w: World, def: MonsterDef, existing: string[]): string | undefined {
  const pool = MONSTER_MODS.filter((mm) => !mm.champion && !existing.includes(mm.id) && (!mm.notNormal || w.difficulty > 0) && (!mm.missile || shoots(def)));
  return w.rng.spawn.weighted(pool, (mm) => mm.weight)?.id;
}

function pickChampionType(w: World): string[] {
  const t = w.rng.spawn.pick(['', 'ghostly', 'fanatic', 'possessed', 'berserk']);
  return t ? [t] : [];
}

simHooks.spawnMonster = spawnMonster;
