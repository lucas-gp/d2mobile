/**
 * Compétences : chaque compétence de chaque classe lancée en boucle dans une arène vivante (6 familles de monstres), aux niveaux 1, 8 et 20,
 * avec 1 à 3 équipements par classe ; état du monde et événements hachés à chaque tick (160 ticks). Même protocole qu'aux lots 182-189.
 */
import { Game } from '../../../src/sim/game';
import { World } from '../../../src/sim/world';
import { ZoneBuilder } from '../../../src/data/zones/builder';
import { addXp, xpToReach } from '../../../src/sim/progression';
import { SKILLS } from '../../../src/data/skills';
import { TREE_CLASS } from '../../../src/data/classes';
import { Rng } from '../../../src/core/rng';
import { generateItem } from '../../../src/sim/loot/itemgen';
import { createHash } from 'node:crypto';
import { ser, type SectionResult } from '../lib';

const KITS: Record<string, [string, string | null]> = {
  sword: ['long_sword', 'small_shield'],
  bow: ['short_bow', null],
  staff: ['war_staff', null],
  javelin: ['javelin', 'small_shield'],
  claw: ['katar', 'katar'],
};
const CLASS_KITS: Record<string, string[]> = {
  sorceress: ['staff'],
  druid: ['staff', 'sword'],
  barbarian: ['sword', 'staff'],
  paladin: ['sword'],
  amazon: ['bow', 'javelin', 'sword'],
  necromancer: ['sword'],
  assassin: ['claw', 'sword'],
};
const MONS = ['zombie', 'fallen', 'skeleton_archer', 'quill_rat', 'fallen_shaman', 'mummy'];

export async function run(): Promise<SectionResult> {
  const out: SectionResult = {};
  for (const s of SKILLS) {
    const cls = TREE_CLASS[s.tree];
    if (!cls) continue;
    for (const kit of CLASS_KITS[cls]) {
      for (const L of [1, 8, 20]) {
        const g = new Game(undefined, cls);
        addXp(g.character, xpToReach(60));
        g.character.base.str = 250;
        g.character.base.dex = 200;
        g.enterTown();
        const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
        b.start(10, 15);
        b.block(0, 0, 40, 1);
        b.block(0, 29, 40, 30);
        MONS.forEach((m, i) => b.spawn({ monster: m, x: 16 + (i % 3) * 3, y: 11 + Math.floor(i / 3) * 6, count: 2, r: 1 }));
        g.character.skills[s.id] = L;
        const [main, off] = KITS[kit];
        g.character.equipment.mainhand = generateItem(new Rng('k1'), main, 30, { forceQuality: 'normal' });
        if (off) g.character.equipment.offhand = generateItem(new Rng('k2'), off, 30, { forceQuality: 'normal' });
        g.mode = 'run';
        g.world = new World({ zone: b.build(), seed: 11, difficulty: 1, zoneLevel: 40, character: g.character });
        g.world.populate();
        g.world.refreshPlayer();
        const w = g.world;
        const h = createHash('sha1');
        const unsub = g.onEvent((e) => h.update('E' + ser(e, 3)));
        let err = '';
        try {
          for (let k = 0; k < 160; k++) {
            if (k % 12 === 0) {
              w.player.mana = w.player.manaMax;
              const tgt = w.monsters.find((m) => !m.dead && !m.isSummon);
              w.input.cast = { skill: s.id, tx: tgt?.x ?? w.player.x + 3, ty: tgt?.y ?? w.player.y, targetId: tgt?.id ?? 0 };
            }
            g.step(1);
            h.update(ser({ t: w.tick, p: w.player, m: w.monsters, mi: w.missiles, a: w.areas, it: w.items.length }, 4));
            if (g.mode !== 'run') break;
          }
        } catch (e) {
          err = 'ERR ' + (e as Error).message;
        }
        unsub();
        out[`${cls}/${s.id}/${kit}/${L}`] = err || h.digest('hex');
      }
    }
  }
  return out;
}
