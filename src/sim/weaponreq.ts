/**
 * Armes exigées par certaines compétences (D2) : griffes pour les Griffes de foudre, arme de jet
 * pour le Double lancer, arc pour les flèches, lance ou javelot pour l'Estoc, etc.
 */
import { SKILL_BY_ID } from '../data/skills';
import { offhandWeapon, weaponKind, type WeaponKind } from './weapons';
import type { World } from './world';

const THROWN: WeaponKind[] = ['thrown', 'javelin'];
const SPEAR: WeaponKind[] = ['spear', 'javelin'];
const BOWS: WeaponKind[] = ['bow', 'crossbow'];

interface Req {
  kinds: WeaponKind[];
  text: string;
  /** Deux armes (griffes) exigées */
  dual?: boolean;
}

const REQ: Record<string, Req> = {
  double_throw: { kinds: THROWN, text: 'Arme de jet requise' },
  split_throw: { kinds: THROWN, text: 'Arme de jet requise' },
  dragon_claw: { kinds: ['claw'], text: 'Deux griffes requises', dual: true },
  claws_of_thunder: { kinds: ['claw'], text: 'Griffes requises' },
  blades_of_ice: { kinds: ['claw'], text: 'Griffes requises' },
  phoenix_strike: { kinds: ['claw'], text: 'Griffes requises' },
  poison_dagger: { kinds: ['dagger'], text: 'Dague requise' },
  magic_arrow: { kinds: BOWS, text: 'Arc ou arbalète requis' },
  fire_arrow: { kinds: BOWS, text: 'Arc ou arbalète requis' },
  cold_arrow: { kinds: BOWS, text: 'Arc ou arbalète requis' },
  multiple_shot: { kinds: BOWS, text: 'Arc ou arbalète requis' },
  exploding_arrow: { kinds: BOWS, text: 'Arc ou arbalète requis' },
  ice_arrow: { kinds: BOWS, text: 'Arc ou arbalète requis' },
  guided_arrow: { kinds: BOWS, text: 'Arc ou arbalète requis' },
  immolation_arrow: { kinds: BOWS, text: 'Arc ou arbalète requis' },
  strafe: { kinds: BOWS, text: 'Arc ou arbalète requis' },
  freezing_arrow: { kinds: BOWS, text: 'Arc ou arbalète requis' },
  jab: { kinds: SPEAR, text: 'Lance ou javelot requis' },
  power_strike: { kinds: SPEAR, text: 'Lance ou javelot requis' },
  impale: { kinds: SPEAR, text: 'Lance ou javelot requis' },
  charged_strike: { kinds: SPEAR, text: 'Lance ou javelot requis' },
  fend: { kinds: SPEAR, text: 'Lance ou javelot requis' },
  lightning_strike: { kinds: SPEAR, text: 'Lance ou javelot requis' },
  poison_javelin: { kinds: ['javelin'], text: 'Javelot requis' },
  lightning_bolt: { kinds: ['javelin'], text: 'Javelot requis' },
  plague_javelin: { kinds: ['javelin'], text: 'Javelot requis' },
  lightning_fury: { kinds: ['javelin'], text: 'Javelot requis' },
  smite: { kinds: [], text: 'Bouclier requis' },
};

/** Types d'arme exigés par une compétence (liste vide : aucune exigence d'arme) */
export function weaponKindsFor(id: string): WeaponKind[] {
  return REQ[id]?.kinds ?? [];
}

/** Raison pour laquelle la compétence ne peut pas être lancée avec l'équipement actuel, sinon null */
export function weaponRequirement(w: World, id: string): string | null {
  // PD2 : Frénésie et Berserk exigent deux armes
  if ((id === 'frenzy' || id === 'berserk') && SKILL_BY_ID[id]) return offhandWeapon(w) ? null : 'Deux armes requises';
  const r = REQ[id];
  if (!r || !SKILL_BY_ID[id]) return null;
  if (id === 'smite') return w.character.equipment.offhand && !offhandWeapon(w) ? null : r.text;
  const k = weaponKind(w);
  if (!r.kinds.includes(k)) return r.text;
  if (r.dual) {
    const off = offhandWeapon(w);
    if (!off || !r.kinds.includes(weaponKind({ ...w, character: { ...w.character, equipment: { mainhand: off } } } as World))) return r.text;
  }
  return null;
}
