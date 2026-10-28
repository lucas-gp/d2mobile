/**
 * Mercenaires : chaque type × variante (13 sous-types) × niveaux 1 à 99 (pas de 7) × 3 difficultés, nu puis équipé d'un même kit
 * (casque, armure, arme de son style, à graine fixe) → `mercDerived` sérialisé.
 */
import '../../../src/sim/game';
import { Rng } from '../../../src/core/rng';
import '../../../src/data/items/index';
import { BASES } from '../../../src/data/items/bases';
import { MERCS } from '../../../src/data/mercs';
import { TYPE_GROUPS } from '../../../src/data/types';
import { newCharacter } from '../../../src/sim/character';
import { mercDerived } from '../../../src/sim/merc-core';
import { addXp, xpToReach } from '../../../src/sim/progression';
import { generateItem } from '../../../src/sim/loot/itemgen';
import { ser, sha1, type SectionResult } from '../lib';

export async function run(): Promise<SectionResult> {
  const out: SectionResult = {};
  for (const t of MERCS) {
    const weapon = BASES.find((b) => (t.weapons as string[]).includes(b.type) && !b.noRandomDrop) ?? BASES.find((b) => TYPE_GROUPS.weapon.includes(b.type))!;
    for (const v of t.variants) {
      for (let lvl = 1; lvl <= 99; lvl += 7) {
        const c = newCharacter(undefined, 'sorceress');
        addXp(c, xpToReach(lvl));
        c.merc = { type: t.id, variant: v.id, name: t.names[0], dead: false, equipment: {} };
        const parts: string[] = [];
        for (const d of [0, 1, 2] as const) parts.push(ser(mercDerived(c, d), 6));
        const rng = new Rng(`merc/${t.id}/${v.id}/${lvl}`);
        c.merc.equipment.head = generateItem(rng, 'cap', lvl, { forceQuality: 'rare' });
        c.merc.equipment.body = generateItem(rng, 'quilted_armor', lvl, { forceQuality: 'magic' });
        c.merc.equipment.mainhand = generateItem(rng, weapon.id, lvl, { forceQuality: 'rare' });
        for (const d of [0, 1, 2] as const) parts.push(ser(mercDerived(c, d), 6));
        out[`${t.id}/${v.id}/${lvl}`] = sha1(parts.join('|'));
      }
    }
  }
  return out;
}
