/**
 * Requêtes sur l'arme portée (type, allonge, main gauche, maîtrises). Module feuille extrait de
 * melee.ts : permet à skills.ts et weaponreq.ts de les utiliser sans cycle d'imports.
 */
import { SKILL_BY_ID, lin, ramp } from '../data/skills';
import type { ItemBase } from '../data/types';
import { baseOf } from './itemstats';
import type { Item } from './item';
import type { World } from './world';
import { RULES } from '../mods/rules';

export type WeaponKind = 'sword' | 'axe' | 'mace' | 'scepter' | 'dagger' | 'polearm' | 'spear' | 'thrown' | 'javelin' | 'claw' | 'bow' | 'crossbow' | 'staff' | 'wand' | 'orb' | 'none';

function weaponItem(w: World): Item | undefined {
  return w.character.equipment.mainhand;
}

function weaponBase(w: World): ItemBase | null {
  const it = weaponItem(w);
  return it ? baseOf(it) : null;
}

export function weaponKind(w: World): WeaponKind {
  const b = weaponBase(w);
  return b && b.dmg ? (b.type as WeaponKind) : 'none';
}

/** Arme de tir : les attaques partent en projectiles */
export function isRangedKind(k: WeaponKind): boolean {
  return k === 'bow' || k === 'crossbow';
}

/** Arme de jet : couteaux, haches et javelots lancés */
export function isThrownKind(k: WeaponKind): boolean {
  return k === 'thrown' || k === 'javelin';
}

/** Allonge de l'attaque de base (unités) : armes d'hast et lances portent plus loin */
export function attackReach(w: World): number {
  const k = weaponKind(w);
  if (k === 'polearm') return 1.9;
  if (k === 'spear') return 1.7;
  if (isRangedKind(k) || isThrownKind(k)) return 9;
  return 1.3;
}

/** Arme tenue en main gauche (double maniement : Barbare, griffes de l'Assassin) */
export function offhandWeapon(w: World): Item | undefined {
  const it = w.character.equipment.offhand;
  return it && baseOf(it).dmg ? it : undefined;
}

/** Maîtrise applicable à l'arme tenue : règle `skills.masteryOf` (D2 : une par type d'arme) */
function masteryOf(w: World, kind: WeaponKind): string | undefined {
  return RULES['skills.masteryOf'](kind, !!weaponBase(w)?.twoHanded, w.character.classId);
}

/** Bonus des maîtrises pour l'arme tenue : dégâts %, score d'attaque %, coup critique % (à une main) et coup dévastateur % (à deux mains) */
export function weaponMastery(
  w: World,
  kind: WeaponKind = weaponKind(w),
): { dmg: number; ar: number; crit: number; crush: number; crushEff: number; pierce: number; splash: number; critMult: number } {
  const d = w.player.d;
  const out = { dmg: 0, ar: 0, crit: 0, crush: 0, crushEff: 0, pierce: 0, splash: 0, critMult: 0 };
  const id = masteryOf(w, kind);
  if (id) {
    const s = SKILL_BY_ID[id];
    const L = d.skillLevels[id] ?? 0;
    if (s && L > 0) {
      out.dmg += s.n.wdmg ? ramp(s.n.wdmg, L) : 0;
      out.ar += s.n.ar ? ramp(s.n.ar, L) : 0;
      if (id === 'two_hand_mastery') {
        out.crush += lin(s.n.value, L);
        // PD2 : « Crushing Blow Efficiency » de la Maîtrise à deux mains
        if (s.n.v4) out.crushEff += lin(s.n.v4, L);
      } else if (id !== 'javelin_mastery') out.crit += lin(s.n.value, L);
      // PD2 : la Maîtrise du lancer ajoute une chance de perforer
      if (id === 'throwing_mastery' && s.n.v3) out.pierce += lin(s.n.v3, L);
      // PD2 : les maîtrises à une et deux mains agrandissent la zone des dégâts de mêlée
      if (id === 'one_hand_mastery' || id === 'two_hand_mastery') out.splash += lin(s.n.v3, L);
    }
  }
  const cs = d.skillLevels['critical_strike'] ?? 0;
  if (cs > 0) out.crit += lin(SKILL_BY_ID.critical_strike.n.value, cs);
  const pen = d.skillLevels['penetrate'] ?? 0;
  if (pen > 0) out.ar += lin(SKILL_BY_ID.penetrate.n.value, pen);
  // PD2 S13 : la Maîtrise du javelot et de la lance ajoute au multiplicateur de coup critique (×2 de base), quelle que soit l'arme
  const jm = d.skillLevels['javelin_mastery'] ?? 0;
  if (jm > 0) out.critMult += lin(SKILL_BY_ID.javelin_mastery.n.value, jm);
  return out;
}
