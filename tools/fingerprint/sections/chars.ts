/**
 * Dérivés des personnages : 1 500 personnages pseudo-aléatoires (chargen.ts) → caractéristiques finales (`computeDerived`, 3 difficultés),
 * statistiques de chaque objet porté (`itemFinal`, nom, niveau requis), mercenaire (`mercDerived`) et textes de 6 compétences de la classe
 * (`skillLines`). Puis textes de toutes les compétences pour 84 personnages (7 classes × 12), comme au lot 183.
 */
import { Game } from '../../../src/sim/game';
import { Rng } from '../../../src/core/rng';
import { SKILLS } from '../../../src/data/skills';
import { CLASS_IDS, TREE_CLASS } from '../../../src/data/classes';
import { computeDerived, newCharacter } from '../../../src/sim/character';
import { itemFinal, itemName, requiredLevel } from '../../../src/sim/itemstats';
import { mercDerived } from '../../../src/sim/merc-core';
import { addXp, xpToReach } from '../../../src/sim/progression';
import { skillLines } from '../../../src/ui/skilltext';
import { fingerprintCharacter } from '../chargen';
import { ser, sha1, type SectionResult } from '../lib';

export async function run(): Promise<SectionResult> {
  const out: SectionResult = {};
  for (let i = 0; i < 1500; i++) {
    // compteur d'identifiants remis à zéro à chaque personnage : un écart reste localisé au personnage concerné
    Game.resetIds();
    const c = fingerprintCharacter(`char${i}`);
    const rng = new Rng(`char${i}/q`);
    const parts: string[] = [];
    for (const d of [0, 1, 2] as const) parts.push(ser(computeDerived(c, d), 6));
    for (const it of Object.values(c.equipment)) if (it) parts.push(ser(itemFinal(it, c.level), 6), itemName(it), String(requiredLevel(it)));
    for (const d of [0, 2] as const) parts.push(ser(mercDerived(c, d), 6));
    const own = SKILLS.filter((s) => TREE_CLASS[s.tree] === c.classId);
    const d1 = computeDerived(c, 1);
    for (let k = 0; k < 6; k++) parts.push(ser(skillLines(own[rng.int(own.length)].id, d1), 5));
    out[`char${i}/${c.classId}/${c.level}`] = sha1(parts.join('|'));
  }
  const rng = new Rng('skilltext');
  for (const cls of CLASS_IDS) {
    for (let k = 0; k < 12; k++) {
      const c = newCharacter(undefined, cls);
      addXp(c, xpToReach(1 + rng.int(98)));
      c.base.ene = 10 + rng.int(300);
      for (const s of SKILLS) if (rng.chance(0.5)) c.skills[s.id] = rng.int(25);
      const d = computeDerived(c, rng.int(3) as 0 | 1 | 2);
      const h: string[] = [];
      for (const s of SKILLS) h.push(JSON.stringify(skillLines(s.id, d)));
      out[`text/${cls}/${k}`] = sha1(h.join('\n'));
    }
  }
  return out;
}
