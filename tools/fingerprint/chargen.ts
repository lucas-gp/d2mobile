/**
 * Personnages pseudo-aléatoires à graine fixe pour les empreintes : classe, niveau, caractéristiques, compétences, équipement complet
 * (qualités variées, dont uniques et sets), charmes, sac, coffre et mercenaire équipé. Même graine = même personnage.
 */
// le module Game d'abord : il branche les points d'extension tardifs (sim/hooks.ts), comme dans le jeu
import '../../src/sim/game';
import { Rng } from '../../src/core/rng';
import '../../src/data/items/index';
import { BASES } from '../../src/data/items/bases';
import { CLASS_IDS, TREE_CLASS, type ClassId } from '../../src/data/classes';
import { SKILLS } from '../../src/data/skills';
import { MERCS } from '../../src/data/mercs';
import type { ItemBase, Slot } from '../../src/data/types';
import { CHARM_COLS, CHARM_ROWS, newCharacter, type CharacterState } from '../../src/sim/character';
import { addXp, xpToReach } from '../../src/sim/progression';
import { generateItem } from '../../src/sim/loot/itemgen';
import { placeIn, placeInStash } from '../../src/sim/inventory';

const QUALITIES = [undefined, 'normal', 'superior', 'magic', 'rare', 'set', 'unique'] as const;
const SLOTS: Slot[] = ['head', 'body', 'mainhand', 'offhand', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2'];

let bySlot: Record<string, ItemBase[]> | null = null;
function basesFor(slot: Slot): ItemBase[] {
  if (!bySlot) {
    bySlot = {};
    for (const b of BASES) {
      if (!b.slot) continue;
      const s = b.slot === 'ring' ? 'ring1' : b.slot;
      (bySlot[s] ??= []).push(b);
      if (b.slot === 'ring') (bySlot.ring2 ??= []).push(b);
    }
  }
  return bySlot[slot] ?? [];
}
const pick = <X>(rng: Rng, a: readonly X[]): X => a[rng.int(a.length)];

export function fingerprintCharacter(seed: string, classId?: ClassId): CharacterState {
  const rng = new Rng(seed);
  const cls = classId ?? pick(rng, CLASS_IDS);
  const c = newCharacter(`Fp-${seed}`, cls);
  addXp(c, xpToReach(1 + rng.int(99)));
  for (const k of ['str', 'dex', 'vit', 'ene'] as const) c.base[k] += rng.int(220);
  for (const s of SKILLS) if (TREE_CLASS[s.tree] === cls && rng.chance(0.45)) c.skills[s.id] = 1 + rng.int(25);
  const ilvl = Math.min(99, c.level + rng.int(20));
  for (const slot of SLOTS) {
    const list = basesFor(slot);
    if (!list.length || rng.chance(0.12)) continue;
    const q = pick(rng, QUALITIES);
    c.equipment[slot] = generateItem(rng, pick(rng, list).id, ilvl, { forceQuality: q, mf: rng.int(400), rollEthereal: rng.chance(0.2) });
  }
  const charms = BASES.filter((b) => b.type === 'smallcharm' || b.type === 'largecharm' || b.type === 'grandcharm');
  for (let i = 0; i < rng.int(6); i++) placeIn(c.charmInv, CHARM_COLS, CHARM_ROWS, generateItem(rng, pick(rng, charms).id, ilvl, { forceQuality: rng.chance(0.2) ? 'unique' : 'magic' }));
  const all = BASES.filter((b) => !!b.slot);
  for (let i = 0; i < rng.int(8); i++) {
    const it = generateItem(rng, pick(rng, all).id, ilvl, { mf: 200 });
    const free = c.inventory.findIndex((x) => x === null);
    if (free >= 0) c.inventory[free] = it;
  }
  for (let i = 0; i < rng.int(10); i++) placeInStash(c.stash[rng.int(c.stash.length)], generateItem(rng, pick(rng, all).id, ilvl, { mf: 300 }));
  if (rng.chance(0.6)) {
    const t = pick(rng, MERCS);
    const v = pick(rng, t.variants);
    c.merc = { type: t.id, variant: v.id, name: t.names[0], dead: false, equipment: {} };
    for (const slot of ['head', 'body', 'mainhand'] as const) {
      const list = basesFor(slot);
      if (rng.chance(0.7)) c.merc.equipment[slot] = generateItem(rng, pick(rng, list).id, ilvl, { forceQuality: pick(rng, QUALITIES) });
    }
  }
  c.gold = rng.int(500000);
  return c;
}
