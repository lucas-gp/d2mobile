/**
 * Distribution complète d'une zone (mode graphismes locaux, sans repli visuel) : TOUT ce qui peut apparaître dans la zone, pour que ses
 * planches soient générées AVANT le départ. Fonctions pures (aucun accès au navigateur), testées contre la simulation.
 *
 * Sources de monstres : groupes posés (`spawns`), espèces sœurs tirées par groupe (`alts`), super-uniques (classe de l'espèce),
 * invocations des attaques (récursif : un invoqué peut en invoquer), renforts d'un boss de carte (espèces de la carte, jamais un boss),
 * relevés (une espèce déjà présente), champions et uniques (même planche que l'espèce).
 */
import { MONSTER_BY_ID } from '../data/monsters';
import { MAP_ZONE_BY_ID } from '../data/maps';
import type { MonsterAttack } from '../data/types';
import type { ZoneDef } from '../data/zone-types';
import { BUFF_FX, FX_BY_CLASS, FX_COMMON, MISSILE_FX, PROP_FLAME } from './fx';
import { superUniqueOf } from '../sim/spawn';

/** Identifiants d'espèces (MonsterDef.id) possibles dans la zone */
export function zoneMonsterIds(z: ZoneDef, opts: { mapZone?: string } = {}): string[] {
  const out = new Set<string>();
  const add = (id: string | undefined): void => {
    if (!id || out.has(id) || !MONSTER_BY_ID[id]) return;
    out.add(id);
    const def = MONSTER_BY_ID[id];
    for (const [alt] of def.alts ?? []) add(alt);
    for (const a of def.attacks) if (a.kind === 'summon' && a.summon) add(a.summon);
  };
  for (const s of z.spawns) {
    add(s.monster);
    if (s.rank === 'unique' && s.uniqueName) {
      const su = superUniqueOf(s.uniqueName);
      if (su?.monster) add(su.monster);
    }
  }
  // a game mode's species without spawn entries (zone's `monsterPool`: Survivals' director; lot 294): preloaded with their effects
  for (const id of z.monsterPool ?? []) add(id);
  // renforts du boss de carte : espèces de la carte (summonPool de mods/pd2/sim/map-boss.ts), « skeleton » pour un boss de campagne
  const mz = opts.mapZone ? MAP_ZONE_BY_ID[opts.mapZone] : undefined;
  if (mz) {
    for (const id of mz.monsters) add(id);
    add(mz.boss.monster);
    add('skeleton');
  }
  return [...out];
}

/** Élément → effets D2 de contact, de lancement et d'anneau que le rendu peut jouer (impactFx, novaFx, castFx de fx.ts) */
const ELEM_FX: Record<string, string[]> = {
  fire: ['meteorblast', 'firearrowblast', 'firehit', 'firecast', 'firenova', 'flame', 'firebolt', 'fireball', 'groundfire', 'groundfirebig', 'groundfiresmall'],
  cold: ['iceorbblast', 'icehit2', 'icecast', 'frostnova', 'icebolt', 'iceblast', 'glacialspike'],
  light: ['shockhitsm', 'lightningcast', 'elecnova', 'chargedbolt', 'lightningbolt', 'stormimpact', 'stormimpact2'],
  poison: ['poisonpuff', 'poisonhit', 'poisonnova', 'unholybolt'],
  magic: ['cursehit', 'novablue'],
};

/** Effets d'un motif de compétence de boss (`cast`) */
const PATTERN_FX: Record<string, string[]> = {
  firewall: ['groundfirebig'],
  blizzard: ['blizzardfall', 'blizzardfall2', 'stormimpact', 'stormimpact2'],
  chain: ['lightningbolt'],
  fan: ['lightningbolt'],
  prison: [],
  tentacle: [],
};

const NOVA_KINDS: Record<string, string> = { nova: 'elecnova', static_field: 'elecnova', frost_nova: 'frostnova', poison_nova: 'poisonnova', holy_nova: 'novablue', fire_nova: 'firenova' };

function attackFx(a: MonsterAttack, out: Set<string>): void {
  if (a.missile && MISSILE_FX[a.missile]) out.add(MISSILE_FX[a.missile]);
  if (a.missile) for (const id of ELEM_FX[a.element] ?? []) out.add(id);
  if (a.kind === 'nova' || a.kind === 'breath' || a.kind === 'cast') for (const id of ELEM_FX[a.element] ?? []) out.add(id);
  if (a.kind === 'nova') for (const id of Object.values(NOVA_KINDS)) out.add(id);
  if (a.kind === 'cast' && a.pattern) for (const id of PATTERN_FX[a.pattern] ?? []) out.add(id);
  if (a.kind === 'curse') for (const id of FX_BY_CLASS.necromancer.filter((x) => x.startsWith('curse_'))) out.add(id);
  if (a.kind === 'melee' && a.element !== 'phys') for (const id of ELEM_FX[a.element]?.slice(0, 3) ?? []) out.add(id);
}

/** Identifiants `fx_<nom>` de la zone : effets communs, de la classe, des auras et sorts persistants, de ses monstres et de leurs boss */
export function zoneFxIds(classId: string, monsterIds: Iterable<string>, opts: { mapBoss?: boolean } = {}): string[] {
  const out = new Set<string>([...FX_COMMON, ...(FX_BY_CLASS[classId] ?? [])]);
  for (const b of Object.values(BUFF_FX)) out.add(b.id);
  for (const f of Object.values(PROP_FLAME)) out.add(f.id);
  out.add('teleport');
  for (const id of monsterIds) {
    const def = MONSTER_BY_ID[id];
    if (!def) continue;
    for (const a of def.attacks) attackFx(a, out);
  }
  if (opts.mapBoss) for (const e of ['fire', 'cold', 'light', 'poison']) for (const id of ELEM_FX[e]) out.add(id);
  return [...out].map((id) => `fx_${id}`);
}
