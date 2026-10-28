/** Application des modificateurs de map (endgame) aux monstres créés. */
import type { DamagePacket, Monster, Player, World } from '../../../src/mods/sdk';

export function applyMapModsToMonster(w: World, m: Monster): void {
  for (const mod of w.mapMods) {
    switch (mod.id) {
      case 'monsterLife':
        m.hpMax = Math.round(m.hpMax * (1 + mod.value / 100));
        m.hp = m.hpMax;
        break;
      case 'monsterDamage':
        m.dmgMin *= 1 + mod.value / 100;
        m.dmgMax *= 1 + mod.value / 100;
        break;
      case 'monsterSpeed':
        m.speed *= 1 + mod.value / 100;
        break;
      case 'monsterFireRes':
        m.res.fire += mod.value;
        break;
      case 'monsterColdRes':
        m.res.cold += mod.value;
        break;
      case 'monsterLightRes':
        m.res.light += mod.value;
        break;
      case 'monsterPhysRes':
        m.res.phys += mod.value;
        break;
      case 'fireImmune':
        if (w.rng.spawn.chance(mod.value / 100)) m.res.fire = Math.max(m.res.fire, 100);
        break;
      case 'coldImmune':
        if (w.rng.spawn.chance(mod.value / 100)) m.res.cold = Math.max(m.res.cold, 100);
        break;
      case 'lightImmune':
        if (w.rng.spawn.chance(mod.value / 100)) m.res.light = Math.max(m.res.light, 100);
        break;
      case 'poisonImmune':
        if (w.rng.spawn.chance(mod.value / 100)) m.res.poison = Math.max(m.res.poison, 110);
        break;
      case 'physImmune':
        if (w.rng.spawn.chance(mod.value / 100)) m.res.phys = Math.max(m.res.phys, 100);
        break;
      case 'monsterLeech':
        // « de Sangsue » : +X % de vie et vol de vie (X/2,5 % des dégâts infligés)
        m.hpMax = Math.round(m.hpMax * (1 + mod.value / 100));
        m.hp = m.hpMax;
        m.leechPct = (m.leechPct ?? 0) + mod.value / 2.5;
        break;
      case 'monsterAtkSpeed':
        m.atkSpdPct = (m.atkSpdPct ?? 0) + mod.value;
        break;
      case 'monsterAr':
        m.ar = Math.round(m.ar * (1 + mod.value / 100));
        break;
      case 'monsterDef':
        m.defense = Math.round(m.defense * (1 + mod.value / 100));
        break;
      case 'monsterMagicRes':
        m.res.magic += mod.value;
        break;
      case 'extraFastUniques':
        if (m.rank === 'unique' || m.rank === 'champion') m.speed *= 1.3;
        break;
    }
  }
}

/** Somme des valeurs d'un modificateur de map donné */
function mapModValue(w: World, id: string): number {
  let v = 0;
  for (const m of w.mapMods) if (m.id === id) v += m.value;
  return v;
}

/** Effets de carte agrégés par monde (mis en cache : les tables sont petites mais les accès fréquents) */
export interface MapFx {
  /** Un effet de coup de monstre est actif */
  hit: boolean;
  fireDmg: number;
  coldDmg: number;
  lightDmg: number;
  poisonDmg: number;
  extra: Record<'fire' | 'cold' | 'light' | 'poison' | 'magic', number>;
  wound: number;
  crush: number;
  fhr: number;
  regen: number;
  drain: number;
}
const FX = new WeakMap<object, { n: number; fx: MapFx }>();

export function mapFx(w: World): MapFx {
  const c = FX.get(w);
  if (c && c.n === w.mapMods.length) return c.fx;
  const v = (id: string) => mapModValue(w, id);
  const fx: MapFx = {
    hit: false,
    fireDmg: v('monsterFireDmg'),
    coldDmg: v('monsterColdDmg'),
    lightDmg: v('monsterLightDmg'),
    poisonDmg: v('monsterPoisonDmg'),
    extra: { fire: v('extraFire'), cold: v('extraCold'), light: v('extraLight'), poison: v('extraPoison'), magic: v('extraMagic') },
    wound: v('monsterWound'),
    crush: v('monsterCrush'),
    fhr: v('monsterFhr'),
    regen: v('monsterRegen'),
    drain: v('playerDrain'),
  };
  fx.hit = !!(fx.fireDmg || fx.coldDmg || fx.lightDmg || fx.poisonDmg || fx.wound || fx.crush || Object.values(fx.extra).some(Boolean));
  FX.set(w, { n: w.mapMods.length, fx });
  return fx;
}

/** Coup de monstre sur le joueur : dégâts élémentaires bonus et part des dégâts physiques convertie (copie du paquet) */
export function mapHitPacket(w: World, p: DamagePacket, src: Monster | null): DamagePacket {
  const fx = mapFx(w);
  if (!fx.hit || !src) return p;
  const q = { ...p };
  if (fx.fireDmg) q.fire *= 1 + fx.fireDmg / 100;
  if (fx.coldDmg) q.cold *= 1 + fx.coldDmg / 100;
  if (fx.lightDmg) q.light *= 1 + fx.lightDmg / 100;
  if (fx.poisonDmg) q.poison *= 1 + fx.poisonDmg / 100;
  if (!p.spell && p.phys > 0) {
    q.fire += (p.phys * fx.extra.fire) / 100;
    q.cold += (p.phys * fx.extra.cold) / 100;
    q.light += (p.phys * fx.extra.light) / 100;
    q.poison += (p.phys * fx.extra.poison) / 100;
    q.magic += (p.phys * fx.extra.magic) / 100;
    // blessures ouvertes : le coup saigne (+30 % de dégâts physiques)
    if (fx.wound && w.rng.combat.chance(fx.wound / 100)) q.phys += p.phys * 0.3;
  }
  return q;
}

/** Après un coup de monstre : coup écrasant (12,5 % de la vie actuelle, jamais mortel) et vol de vie du monstre */
export function mapAfterHit(w: World, pl: Player, src: Monster | null, dealt: number, melee: boolean): void {
  if (!src) return;
  if (src.leechPct && dealt > 0) src.hp = Math.min(src.hpMax, src.hp + (dealt * src.leechPct) / 100);
  const fx = mapFx(w);
  if (fx.crush && melee && pl.hp > 1 && w.rng.combat.chance(fx.crush / 100)) pl.hp = Math.max(1, pl.hp - pl.hp * 0.125);
}

/** Régénération des monstres (affixe « de Régénération », X/1024 % de la vie max par seconde) et drain de vie du joueur (« Malsaine ») */
export function mapTick(w: World, dt: number): void {
  const fx = mapFx(w);
  if (fx.regen) {
    const rate = fx.regen / 1024 / 100;
    for (const m of w.monsters) if (!m.dead && m.hp < m.hpMax && m.rank !== 'minion') m.hp = Math.min(m.hpMax, m.hp + m.hpMax * rate * dt);
  }
  const p = w.player;
  if (fx.drain && !p.dead && p.hp > 1) p.hp = Math.max(1, p.hp - (p.hpMax * fx.drain * dt) / 20000);
}
