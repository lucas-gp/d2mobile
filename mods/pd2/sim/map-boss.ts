/**
 * Boss de carte : statut de boss (vie, dégâts, résistance croissante aux contrôles), arène et laisse, phases (75/50/25 %),
 * enrage, compétences spéciales télégraphiées (kits de mods/pd2/data/map-boss-kits.ts) et mort spectaculaire.
 * Le boss garde l'IA et les attaques de son espèce (src/sim/ai.ts) ; ce module ajoute par-dessus une compétence spéciale
 * toutes les quelques secondes. Chaque zone frappée est d'abord marquée au sol (aire `mb_mark`, au moins 0,7 s), l'impact
 * est une action différée résolue ici : le joueur l'évite en sortant du marqueur.
 * L'état est une donnée simple sur le monstre (sauvegardé avec lui).
 */
import {
  cursePlayer,
  DIFF_MULT,
  dist,
  DT,
  emptyPacket,
  hexElemRes,
  hexPhysRes,
  hurtPet,
  MAP_ZONE_BY_ID,
  MONSTER_BY_ID,
  monsterDmg,
  simHooks,
  spawnArea,
  spawnMissile,
  TAU,
  TICK_HZ,
  type DamagePacket,
  type Element,
  type MapBossAction,
  type MapBossState,
  type Monster,
  type MonsterDef,
  type World,
} from '../../../src/mods/sdk';
import {
  ELEM_DMG_FACTOR,
  MAP_BOSS_ARCHETYPES,
  MAP_BOSS_ARENA_R,
  MAP_BOSS_CC_DR,
  MAP_BOSS_CC_FLOOR,
  MAP_BOSS_CC_RESET_SEC,
  MAP_BOSS_DMG,
  MAP_BOSS_DMG_SPECIES,
  MAP_BOSS_ENRAGE_SEC,
  MAP_BOSS_ENRAGE_STEP,
  MAP_BOSS_GCD,
  MAP_BOSS_HP,
  MAP_BOSS_HP_SPECIES,
  MAP_BOSS_KIT_DMG,
  MAP_BOSS_LEASH_R,
  MAP_BOSS_LEASH_REGEN,
  MAP_BOSS_PHASES,
  MAP_BOSS_SHIELD_SEC,
  MAP_BOSS_SUMMON_CAP,
  MAP_BOSS_SUMMON_N,
  mapBossKit,
  type MapBossArchetype,
  type MapBossPhaseAction,
} from '../data/map-boss-kits';

export type { MapBossState };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Multiplicateur de vie d'un boss de carte (en plus de monsterHp × DIFF_MULT) */
export function mapBossHpMul(def: MonsterDef, tier: number): number {
  return clamp(def.hp, MAP_BOSS_HP_SPECIES[0], MAP_BOSS_HP_SPECIES[1]) * (MAP_BOSS_HP[tier] ?? MAP_BOSS_HP[3]);
}

/** Multiplicateur de dégâts d'un boss de carte (en plus de monsterDmg × DIFF_MULT) */
export function mapBossDmgMul(def: MonsterDef, tier: number): number {
  return clamp(def.dmg, MAP_BOSS_DMG_SPECIES[0], MAP_BOSS_DMG_SPECIES[1]) * (MAP_BOSS_DMG[tier] ?? MAP_BOSS_DMG[3]);
}

/** Coup de référence des compétences spéciales (avant enrage) : courbe de dégâts du niveau, palier, affixe « dégâts des monstres » */
function mapBossKitHit(w: World, mlvl: number, tier: number): number {
  const affix = w.mapMods.filter((x) => x.id === 'monsterDamage').reduce((a, x) => a * (1 + x.value / 100), 1);
  return monsterDmg(mlvl) * DIFF_MULT[w.difficulty].dmg * (MAP_BOSS_KIT_DMG[tier] ?? MAP_BOSS_KIT_DMG[3]) * affix;
}

/** Pose l'état de boss de carte sur le monstre (appelé à l'apparition) */
export function initMapBoss(w: World, m: Monster): void {
  const zone = w.run?.mapZone ?? '';
  const tier = Math.max(1, Math.min(4, w.run?.mapTier ?? 1));
  const kit = mapBossKit(zone);
  m.mapBoss = {
    zone,
    tier,
    engaged: false,
    startTick: w.tick,
    phase: 0,
    nextAt: 0,
    cds: kit.skills.map(() => 0),
    lockUntil: 0,
    actions: [],
    adds: [],
    wards: [],
    shieldUntil: 0,
    cc: 0,
    ccTick: -9999,
    lastFreeze: 0,
    lastStun: 0,
    outTicks: 0,
    leashed: false,
    dot: 0,
    dotUntil: 0,
    dotNext: 0,
    dotElem: 'poison',
    dotDmg: 0,
    baseMin: m.dmgMin,
    baseMax: m.dmgMax,
    baseSpeed: m.speed,
    enrage: 0,
    haste: false,
    frenzy: false,
    hit: mapBossKitHit(w, m.mlvl, tier),
    dealt: {},
  };
}

/** Facteur de dégâts courant (enrage, frénésie de la dernière phase) */
function dmgFactor(st: MapBossState): number {
  return (1 + MAP_BOSS_ENRAGE_STEP * st.enrage) * (st.frenzy ? 1.25 : 1);
}

/** Dégâts bruts d'un impact de l'archétype `arch` dans l'élément `elem` */
function skillDamage(st: MapBossState, arch: MapBossArchetype, elem: Element): number {
  return st.hit * MAP_BOSS_ARCHETYPES[arch].dmg * ELEM_DMG_FACTOR[elem] * dmgFactor(st);
}

const packet = (elem: Element, v: number): DamagePacket => {
  const pk = emptyPacket(true);
  pk[elem] = v;
  return pk;
};

/**
 * Plafond d'un impact, en part de la vie max du joueur après ses résistances : aucune compétence ne tue d'un coup un
 * personnage à pleine vie, même sans résistances (le joueur qui ignore les marqueurs meurt en en prenant plusieurs).
 */
const MAP_BOSS_HIT_CAP: Record<MapBossArchetype, number> = { cone: 0.4, charge: 0.35, blink: 0.35, rain: 0.22, aura: 0.2, nova: 0.15, wall: 0.07, pool: 0.06, dot: 0.025, summon: 0, shield: 0 };

/** Résistance effective du joueur à l'élément (malédictions comprises) */
function playerRes(w: World, elem: Element): number {
  const p = w.player;
  const d = p.d;
  return elem === 'phys' ? clamp(d.dr, 0, 50) - hexPhysRes(p, w.tick) : elem === 'magic' ? 0 : Math.max(-100, d.res[elem] - hexElemRes(p, w.tick));
}

/** Paquet de dégâts d'un impact, plafonné (MAP_BOSS_HIT_CAP) */
function capPk(w: World, arch: MapBossArchetype, elem: Element, raw: number): DamagePacket {
  const cap = MAP_BOSS_HIT_CAP[arch] * w.player.hpMax;
  const eff = raw * (1 - playerRes(w, elem) / 100);
  return packet(elem, eff > cap && eff > 0 ? (raw * cap) / eff : raw);
}

/** Marqueur au sol (télégraphe) : visible `ticks` ticks, sans dégâts */
function mark(w: World, m: Monster, x: number, y: number, r: number, ticks: number, elem: Element): void {
  spawnArea(w, { kind: 'mb_mark', team: 1, owner: m.id, x, y, radius: r, ticks, every: 9999, dmg: emptyPacket(true), elem });
}

const warnTicks = (arch: MapBossArchetype): number => Math.round(MAP_BOSS_ARCHETYPES[arch].warn * TICK_HZ);

/** Touche le joueur (et les créatures alliées) dans un disque */
function strike(w: World, m: Monster, x: number, y: number, r: number, pk: DamagePacket): number {
  const p = w.player;
  let dealt = 0;
  if (!p.dead && dist(x, y, p.x, p.y) <= r + p.radius) dealt = w.hurtPlayerPacket(m, { ...pk });
  for (const pet of w.pets) if (!pet.dead && dist(x, y, pet.x, pet.y) <= r + pet.radius) hurtPet(w, pet, { ...pk }, m);
  return dealt;
}

/** Dégâts sur la durée (poison cumulable, saignement) : sans récupération après coup, résistances appliquées */
function dotDamage(w: World, elem: Element, amount: number): void {
  const p = w.player;
  if (p.dead || w.godMode) return;
  const dmg = amount * (1 - playerRes(w, elem) / 100);
  if (dmg <= 0) return;
  p.hp -= dmg;
  w.stats.damageTaken += dmg;
  w.events.push({ t: 'playerHurt', amount: dmg, elem, pctOfMax: dmg / p.hpMax, src: 'mapboss:dot' });
  if (p.hp <= 0) w.killPlayer();
}

const NOVA_MISSILE: Partial<Record<Element, string>> = { fire: 'firebolt_m', cold: 'coldbolt_m', light: 'lightning_m', poison: 'spit' };

/** Espèces des renforts : celles de la carte, ordinaires (jamais un boss) */
function summonPool(st: MapBossState, m: Monster): string[] {
  const z = MAP_ZONE_BY_ID[st.zone];
  const pool = (z?.monsters ?? []).filter((id) => MONSTER_BY_ID[id] && !MONSTER_BY_ID[id].boss && !MONSTER_BY_ID[id].coward);
  return pool.length ? pool : MONSTER_BY_ID[m.def.id]?.boss ? ['skeleton'] : [m.def.id];
}

function summon(w: World, m: Monster, st: MapBossState, n: number, ward = false): void {
  st.adds = st.adds.filter((id) => w.monsters.some((o) => o.id === id && !o.dead));
  const room = ward ? n : Math.min(n, MAP_BOSS_SUMMON_CAP - st.adds.length);
  const pool = summonPool(st, m);
  for (let k = 0; k < room; k++) {
    const a = (k / Math.max(1, room)) * TAU + w.rng.ai.float(0, 0.6);
    const r = ward ? 6 : 2.5;
    const s = simHooks.spawnMonster(
      w,
      pool[w.rng.ai.int(pool.length)],
      m.x + Math.cos(a) * r,
      m.y + Math.sin(a) * r,
      { rank: ward ? 'champion' : 'normal', noLoot: true },
      `mb:${m.id}:${w.tick}:${k}`,
    );
    if (!s) continue;
    s.aggro = true;
    s.xp *= 0.25;
    if (ward) {
      st.wards.push(s.id);
      s.name = `Gardien de ${m.name}`;
    } else st.adds.push(s.id);
    w.events.push({ t: 'teleport', id: s.id, fx: s.x, fy: s.y, tx: s.x, ty: s.y });
  }
  w.events.push({ t: 'nova', kind: 'mb_summon', x: m.x, y: m.y, radius: 3.5, elem: 'magic' });
}

const PHASE_TEXT: Record<MapBossPhaseAction, string> = {
  summon: 'appelle des renforts !',
  shield: 'se protège : tuez ses gardiens !',
  haste: 'accélère !',
  frenzy: 'entre en frénésie !',
};

function phaseAction(w: World, m: Monster, st: MapBossState, act: MapBossPhaseAction): void {
  w.events.push({ t: 'mapEvent', text: `${m.name} ${PHASE_TEXT[act]}` });
  w.events.push({ t: 'nova', kind: 'mb_phase', x: m.x, y: m.y, radius: 4, elem: 'fire' });
  switch (act) {
    case 'summon':
      summon(w, m, st, MAP_BOSS_SUMMON_N + (st.tier >= 3 ? 1 : 0));
      break;
    case 'shield':
      summon(w, m, st, 3, true);
      st.shieldUntil = w.tick + MAP_BOSS_SHIELD_SEC * TICK_HZ;
      break;
    case 'haste':
      st.haste = true;
      m.speed = st.baseSpeed * 1.25;
      m.atkSpdPct = (m.atkSpdPct ?? 0) + 20;
      break;
    case 'frenzy':
      st.frenzy = true;
      break;
  }
}

/** Lance la compétence `i` du kit vers le joueur */
export function castMapBossSkill(w: World, m: Monster, st: MapBossState, i: number): void {
  const kit = mapBossKit(st.zone);
  const sk = kit.skills[i];
  const A = MAP_BOSS_ARCHETYPES[sk.arch];
  const p = w.player;
  const t = w.tick;
  const warn = warnTicks(sk.arch);
  const dmg = skillDamage(st, sk.arch, sk.elem);
  const cdMul = (st.haste ? 0.85 : 1) * (st.frenzy ? 0.85 : 1);
  st.cds[i] = t + Math.round(A.cd * TICK_HZ * cdMul);
  st.nextAt = t + Math.round(MAP_BOSS_GCD[st.tier] * TICK_HZ * cdMul);
  st.lockUntil = t + Math.round(0.5 * TICK_HZ);
  m.facing = Math.atan2(p.y - m.y, p.x - m.x);
  m.mode = 'idle';
  w.events.push({ t: 'monsterAttack', id: m.id, tx: p.x, ty: p.y, kind: 'cast' });
  switch (sk.arch) {
    case 'nova':
      mark(w, m, m.x, m.y, A.radius + m.radius, warn, sk.elem);
      st.actions.push({ at: t + warn, arch: 'nova', elem: sk.elem, x: m.x, y: m.y, r: 0, dmg });
      st.lockUntil = t + warn;
      break;
    case 'cone': {
      const ang = m.facing;
      const half = 0.55;
      // marqueurs : trois rangées de disques qui dessinent le cône au sol
      for (const [d, n, r] of [
        [2, 1, 1.4],
        [4, 2, 1.6],
        [6, 3, 1.8],
      ] as const)
        for (let k = 0; k < n; k++) {
          const a = ang + (n === 1 ? 0 : (k / (n - 1) - 0.5) * 2 * half * 0.8);
          mark(w, m, m.x + Math.cos(a) * d, m.y + Math.sin(a) * d, r, warn, sk.elem);
        }
      st.actions.push({ at: t + warn, arch: 'cone', elem: sk.elem, x: m.x, y: m.y, r: A.radius, dmg, ang, half });
      st.lockUntil = t + warn;
      break;
    }
    case 'rain': {
      const n = 3 + st.tier;
      for (let k = 0; k < n; k++) {
        const a = w.rng.ai.float(0, TAU);
        const off = k === 0 ? 0 : w.rng.ai.float(1.2, 4.2);
        const x = p.x + Math.cos(a) * off;
        const y = p.y + Math.sin(a) * off;
        const delay = Math.round(k * 0.22 * TICK_HZ);
        // le marqueur de chaque impact apparaît en même temps que les autres et reste jusqu'à son impact
        mark(w, m, x, y, A.radius, warn + delay, sk.elem);
        st.actions.push({ at: t + warn + delay, arch: 'rain', elem: sk.elem, x, y, r: A.radius, dmg });
      }
      break;
    }
    case 'wall': {
      // mur en travers de la position du joueur (perpendiculaire à l'axe boss → joueur) : sortir de la ligne
      const a = Math.atan2(p.y - m.y, p.x - m.x) + Math.PI / 2;
      const L = 5;
      const x1 = p.x + Math.cos(a) * L;
      const y1 = p.y + Math.sin(a) * L;
      const x2 = p.x - Math.cos(a) * L;
      const y2 = p.y - Math.sin(a) * L;
      const life = warn + 5 * TICK_HZ;
      if (sk.elem === 'fire') {
        spawnArea(w, { kind: 'mon_firewall', team: 1, owner: m.id, x: x1, y: y1, x2, y2, radius: A.radius, ticks: life, every: 10, dmg: capPk(w, 'wall', 'fire', dmg), elem: 'fire', aux: warn });
      } else {
        for (let k = 0; k <= 6; k++) {
          const f = k / 6;
          spawnArea(w, {
            kind: 'mb_pool',
            team: 1,
            owner: m.id,
            x: x1 + (x2 - x1) * f,
            y: y1 + (y2 - y1) * f,
            radius: A.radius,
            ticks: life,
            every: 10,
            dmg: capPk(w, 'wall', sk.elem, dmg / 2),
            elem: sk.elem,
            aux: warn,
          });
        }
      }
      break;
    }
    case 'charge': {
      const spot = w.grid.nearestFree(p.x, p.y, 3) ?? { x: p.x, y: p.y };
      mark(w, m, spot.x, spot.y, A.radius, warn, sk.elem);
      st.actions.push({ at: t + warn, arch: 'charge', elem: sk.elem, x: spot.x, y: spot.y, r: A.radius, dmg });
      st.lockUntil = t + warn;
      break;
    }
    case 'summon':
      summon(w, m, st, MAP_BOSS_SUMMON_N);
      break;
    case 'aura':
      mark(w, m, m.x, m.y, A.radius, warn, sk.elem);
      st.actions.push({ at: t + warn, arch: 'aura', elem: sk.elem, x: m.x, y: m.y, r: A.radius, dmg, fx: sk.fx });
      st.lockUntil = t + warn;
      break;
    case 'pool':
      spawnArea(w, { kind: 'mb_pool', team: 1, owner: m.id, x: p.x, y: p.y, radius: A.radius, ticks: warn + 6 * TICK_HZ, every: 12, dmg: capPk(w, 'pool', sk.elem, dmg), elem: sk.elem, aux: warn });
      break;
    case 'blink': {
      // derrière le joueur (à l'opposé du boss), puis frappe autour de lui après le marqueur
      const a = Math.atan2(p.y - m.y, p.x - m.x);
      const spot = w.grid.nearestFree(p.x + Math.cos(a) * 2.2, p.y + Math.sin(a) * 2.2, 3);
      if (spot) {
        w.events.push({ t: 'teleport', id: m.id, fx: m.x, fy: m.y, tx: spot.x, ty: spot.y });
        m.x = m.px = spot.x;
        m.y = m.py = spot.y;
      }
      mark(w, m, m.x, m.y, A.radius, warn, sk.elem);
      st.actions.push({ at: t + warn, arch: 'blink', elem: sk.elem, x: m.x, y: m.y, r: A.radius, dmg });
      st.lockUntil = t + warn;
      break;
    }
    case 'dot':
      for (let k = 0; k < 3; k++) {
        const a = w.rng.ai.float(0, TAU);
        const off = k === 0 ? 0 : w.rng.ai.float(1.5, 3);
        const x = p.x + Math.cos(a) * off;
        const y = p.y + Math.sin(a) * off;
        mark(w, m, x, y, A.radius, warn, sk.elem);
        st.actions.push({ at: t + warn, arch: 'dot', elem: sk.elem, x, y, r: A.radius, dmg });
      }
      break;
    case 'shield':
      phaseAction(w, m, st, 'shield');
      break;
  }
}

/** Impact différé */
function resolve(w: World, m: Monster, st: MapBossState, a: MapBossAction): void {
  const hp0 = w.player.hp;
  resolveImpact(w, m, st, a);
  if (hp0 > w.player.hp) st.dealt[a.arch] = (st.dealt[a.arch] ?? 0) + hp0 - w.player.hp;
}

function resolveImpact(w: World, m: Monster, st: MapBossState, a: MapBossAction): void {
  const p = w.player;
  const kind = a.elem === 'fire' ? 'meteor' : 'boss_pulse';
  switch (a.arch) {
    case 'nova': {
      const n = 12 + 2 * st.tier;
      const kindM = NOVA_MISSILE[a.elem] ?? 'bone';
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * TAU;
        spawnMissile(w, { kind: kindM, team: 1, owner: m.id, x: m.x, y: m.y, angle: ang, speed: 8, radius: 0.35, range: 12, dmg: capPk(w, 'nova', a.elem, a.dmg), elem: a.elem });
      }
      w.events.push({ t: 'nova', kind: 'mb_nova', x: m.x, y: m.y, radius: 3, elem: a.elem });
      break;
    }
    case 'cone': {
      w.events.push({ t: 'impact', kind, x: m.x + Math.cos(a.ang!) * 4, y: m.y + Math.sin(a.ang!) * 4, radius: 3.5, elem: a.elem });
      const inCone = (x: number, y: number, r: number) => {
        const d = dist(a.x, a.y, x, y);
        if (d > a.r + r) return false;
        if (d < 1.2) return true;
        let da = Math.atan2(y - a.y, x - a.x) - a.ang!;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        return Math.abs(da) <= a.half! + r / Math.max(1, d);
      };
      if (!p.dead && inCone(p.x, p.y, p.radius)) w.hurtPlayerPacket(m, capPk(w, a.arch, a.elem, a.dmg));
      for (const pet of w.pets) if (!pet.dead && inCone(pet.x, pet.y, pet.radius)) hurtPet(w, pet, capPk(w, a.arch, a.elem, a.dmg), m);
      break;
    }
    case 'rain':
      w.events.push({ t: 'impact', kind, x: a.x, y: a.y, radius: a.r, elem: a.elem });
      strike(w, m, a.x, a.y, a.r, capPk(w, a.arch, a.elem, a.dmg));
      break;
    case 'charge': {
      const spot = w.grid.nearestFree(a.x, a.y, 3);
      if (spot) {
        w.events.push({ t: 'teleport', id: m.id, fx: m.x, fy: m.y, tx: spot.x, ty: spot.y });
        m.x = m.px = spot.x;
        m.y = m.py = spot.y;
      }
      w.events.push({ t: 'impact', kind: 'boss_pulse', x: a.x, y: a.y, radius: a.r, elem: a.elem });
      strike(w, m, a.x, a.y, a.r, capPk(w, a.arch, a.elem, a.dmg));
      break;
    }
    case 'blink':
      w.events.push({ t: 'impact', kind, x: a.x, y: a.y, radius: a.r, elem: a.elem });
      strike(w, m, a.x, a.y, a.r, capPk(w, a.arch, a.elem, a.dmg));
      break;
    case 'aura': {
      w.events.push({ t: 'nova', kind: 'mb_aura', x: m.x, y: m.y, radius: a.r, elem: a.elem });
      if (p.dead || dist(m.x, m.y, p.x, p.y) > a.r + p.radius) break;
      const dealt = w.hurtPlayerPacket(m, capPk(w, a.arch, a.elem, a.dmg));
      switch (a.fx) {
        case 'lower_resist':
        case 'weaken':
        case 'amplify_damage':
          cursePlayer(w, a.fx, 10 + 2 * st.tier);
          break;
        case 'mana_burn':
          p.mana = Math.max(0, p.mana - p.manaMax * 0.35);
          break;
        case 'life_drain':
          m.hp = Math.min(m.hpMax, m.hp + Math.min(m.hpMax * 0.02, dealt * 4));
          break;
        case 'chill':
          if (!p.d.cbf) {
            p.chillT = Math.max(p.chillT, 3 * TICK_HZ);
            p.chillPct = Math.max(p.chillPct, 0.4);
          }
          break;
      }
      break;
    }
    case 'dot':
      w.events.push({ t: 'impact', kind: 'boss_pulse', x: a.x, y: a.y, radius: a.r, elem: a.elem });
      if (!p.dead && dist(a.x, a.y, p.x, p.y) <= a.r + p.radius) {
        st.dot = Math.min(5, st.dot + 1);
        st.dotUntil = w.tick + 4 * TICK_HZ;
        st.dotElem = a.elem;
        st.dotDmg = a.dmg;
        if (st.dotNext < w.tick) st.dotNext = w.tick + TICK_HZ / 2;
      }
      break;
    default:
      break;
  }
}

/** Le boss reçoit-il un contrôle ? Durée réduite de moitié par contrôle récent (au moins ×0,125) */
function diminish(w: World, m: Monster, st: MapBossState): void {
  if (w.tick - st.ccTick > MAP_BOSS_CC_RESET_SEC * TICK_HZ) st.cc = 0;
  const mul = Math.max(MAP_BOSS_CC_FLOOR, Math.pow(MAP_BOSS_CC_DR, st.cc));
  let hit = false;
  if (m.freezeT > Math.max(0, st.lastFreeze - 1)) {
    const prev = Math.max(0, st.lastFreeze - 1);
    m.freezeT = prev + Math.max(1, Math.round((m.freezeT - prev) * mul));
    hit = true;
  }
  if (m.stunT > Math.max(0, st.lastStun - 1)) {
    const prev = Math.max(0, st.lastStun - 1);
    m.stunT = prev + Math.max(1, Math.round((m.stunT - prev) * mul));
    hit = true;
  }
  if (hit) {
    st.cc++;
    st.ccTick = w.tick;
  }
  st.lastFreeze = m.freezeT;
  st.lastStun = m.stunT;
}

/**
 * Tick du boss de carte, avant son IA. Renvoie true quand le boss ne doit pas agir autrement ce tick (sort en cours,
 * retour à l'arène).
 */
export function updateMapBoss(w: World, m: Monster): boolean {
  const st = m.mapBoss;
  if (!st) return false;
  diminish(w, m, st);
  const p = w.player;
  const fromHome = dist(p.x, p.y, m.spawnX, m.spawnY);
  if (!st.engaged) {
    if (!p.dead && (fromHome < MAP_BOSS_ARENA_R || m.hp < m.hpMax || (m.aggro && dist(p.x, p.y, m.x, m.y) < MAP_BOSS_ARENA_R))) {
      st.engaged = true;
      st.leashed = false;
      st.outTicks = 0;
      st.startTick = w.tick;
      st.nextAt = w.tick + Math.round(1.5 * TICK_HZ);
      m.aggro = true;
      w.events.push({ t: 'bossSpawn', id: m.id, name: m.name });
    }
    return false;
  }
  // laisse : le joueur a quitté l'arène (ou est mort) — le boss rentre et regagne sa vie, sans jamais être invulnérable
  st.outTicks = p.dead || fromHome > MAP_BOSS_LEASH_R ? st.outTicks + 1 : 0;
  if (st.outTicks > 2 * TICK_HZ) {
    if (!st.leashed) {
      st.leashed = true;
      st.actions = [];
      st.dot = 0;
    }
    m.aggro = false;
    m.hp = Math.min(m.hpMax, m.hp + m.hpMax * MAP_BOSS_LEASH_REGEN * DT);
    const dh = dist(m.x, m.y, m.spawnX, m.spawnY);
    if (dh > 1.5) {
      const s = st.baseSpeed * DT;
      w.moveActor(m, ((m.spawnX - m.x) / dh) * s, ((m.spawnY - m.y) / dh) * s, false);
      m.facing = Math.atan2(m.spawnY - m.y, m.spawnX - m.x);
      m.mode = 'walk';
    } else m.mode = 'idle';
    if (m.hp >= m.hpMax) {
      // retour au calme : le combat (et l'enrage) repartent de zéro au prochain engagement ; les phases franchies le restent
      st.engaged = false;
      st.enrage = 0;
    }
    return true;
  }
  if (st.leashed) {
    st.leashed = false;
    m.aggro = true;
  }
  // phases
  const frac = m.hp / m.hpMax;
  const kit = mapBossKit(st.zone);
  while (st.phase < 3 && frac <= MAP_BOSS_PHASES[st.phase]) {
    st.phase++;
    phaseAction(w, m, st, kit.phases[st.phase - 1]);
  }
  // enrage
  const sec = (w.tick - st.startTick) / TICK_HZ;
  const enr = sec > MAP_BOSS_ENRAGE_SEC[st.tier] ? Math.floor((sec - MAP_BOSS_ENRAGE_SEC[st.tier]) / 10) + 1 : 0;
  if (enr !== st.enrage) {
    if (st.enrage === 0 && enr > 0) w.events.push({ t: 'mapEvent', text: `${m.name} est enragé !` });
    st.enrage = enr;
  }
  const f = dmgFactor(st);
  m.dmgMin = st.baseMin * f;
  m.dmgMax = st.baseMax * f;
  // impacts différés
  if (st.actions.length) {
    const due = st.actions.filter((a) => a.at <= w.tick);
    if (due.length) {
      st.actions = st.actions.filter((a) => a.at > w.tick);
      for (const a of due) resolve(w, m, st, a);
    }
  }
  // poison / saignement cumulables
  if (st.dot > 0) {
    if (w.tick >= st.dotUntil || p.dead) st.dot = 0;
    else if (w.tick >= st.dotNext) {
      st.dotNext = w.tick + TICK_HZ / 2;
      const hp0 = p.hp;
      dotDamage(w, st.dotElem, Math.min(st.dot * st.dotDmg * 0.5, (st.dot * MAP_BOSS_HIT_CAP.dot * p.hpMax) / Math.max(0.05, 1 - playerRes(w, st.dotElem) / 100)));
      st.dealt.dot = (st.dealt.dot ?? 0) + Math.max(0, hp0 - p.hp);
    }
  }
  // bouclier : levé dès que les gardiens sont morts
  if (st.shieldUntil > w.tick) {
    st.wards = st.wards.filter((id) => w.monsters.some((o) => o.id === id && !o.dead));
    if (!st.wards.length) {
      st.shieldUntil = 0;
      w.events.push({ t: 'mapEvent', text: `Le bouclier de ${m.name} se brise !` });
    } else if (w.tick % TICK_HZ === 0) w.events.push({ t: 'nova', kind: 'mb_shield', x: m.x, y: m.y, radius: 1.8, elem: 'magic' });
  }
  if (m.freezeT > 0 || m.stunT > 0 || m.mode === 'attack' || m.mode === 'hit') return false;
  if (w.tick < st.lockUntil) {
    m.facing = Math.atan2(p.y - m.y, p.x - m.x);
    m.mode = 'idle';
    return true;
  }
  // compétence spéciale
  if (w.tick >= st.nextAt && !p.dead && dist(m.x, m.y, p.x, p.y) < 18 && w.grid.lineOfSight(m.x, m.y, p.x, p.y)) {
    st.adds = st.adds.filter((id) => w.monsters.some((o) => o.id === id && !o.dead));
    const ready: number[] = [];
    const weights: number[] = [];
    kit.skills.forEach((sk, i) => {
      if (sk.phase > st.phase || st.cds[i] > w.tick) return;
      if (sk.arch === 'summon' && st.adds.length >= MAP_BOSS_SUMMON_CAP - 1) return;
      if (sk.arch === 'shield' && st.shieldUntil > w.tick) return;
      ready.push(i);
      weights.push(MAP_BOSS_ARCHETYPES[sk.arch].weight);
    });
    if (ready.length) {
      castMapBossSkill(w, m, st, ready[w.rng.ai.weightedIndex(weights)]);
      return true;
    }
    st.nextAt = w.tick + 5;
  }
  return false;
}

/** Mort du boss : bannière, explosion ; ses renforts s'effondrent avec lui, les marqueurs s'éteignent */
export function onMapBossDeath(w: World, m: Monster): void {
  const st = m.mapBoss;
  if (!st) return;
  st.actions = [];
  st.dot = 0;
  st.shieldUntil = 0;
  for (const a of w.areas) if (a.owner === m.id && a.team === 1) a.dead = true;
  for (const o of w.monsters) {
    if (o.dead || (!st.adds.includes(o.id) && !st.wards.includes(o.id))) continue;
    o.hp = 0;
    o.dead = true;
    o.deathTick = w.tick;
    o.mode = 'death';
    w.events.push({ t: 'death', id: o.id, x: o.x, y: o.y, rank: o.rank, family: o.def.family, monster: o.def.id, name: o.name });
  }
  w.events.push({ t: 'mapEvent', text: `Boss vaincu : ${m.name}` });
  w.events.push({ t: 'impact', kind: 'meteor', x: m.x, y: m.y, radius: 4, elem: 'fire' });
  w.events.push({ t: 'nova', kind: 'mb_death', x: m.x, y: m.y, radius: 6, elem: 'fire' });
}
