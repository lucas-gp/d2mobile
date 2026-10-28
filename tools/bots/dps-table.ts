/**
 * Table de DPS des sorts d'un personnage sauvegardé par les bots (dégâts moyens par seconde de
 * lancement, Blizzard/Météore comptés sur leur durée), contre un monstre sans résistance.
 *   npx tsx tools/bots/dps-table.ts [sauvegarde…]
 */
import '../mods/auto';
import { readFileSync } from 'node:fs';
import { SKILL_BY_ID } from '../../src/data/skills';
import { Game } from '../../src/sim/game';
import { migrate } from '../../src/sim/save';
import { castFrames, skillDamageRange } from '../../src/sim/skills';
import { TICK_HZ } from '../../src/sim/constants';

/** Effets posés au sol : secondes de dégâts par lancement (même table que le bot) */
const PERSISTENT: Record<string, number> = { blizzard: 2, meteor: 1.4, fire_wall: 2.5, hydra: 6, lesser_hydra: 6 };

const files = process.argv.slice(2);
if (!files.length) for (const b of ['cold', 'fire', 'light']) files.push(`test-results/bots/endmaps-${b}-1.json`);
for (const f of files) {
  const raw = JSON.parse(readFileSync(f, 'utf8'));
  const g = new Game(migrate(raw.save ?? raw));
  g.startRun('tristram', 2);
  const w = g.world;
  const rows: [string, number, string][] = [];
  for (const id of Object.keys(g.character.skills)) {
    const s = SKILL_BY_ID[id];
    if (!s || s.passive || s.buff || !(g.character.skills[id] > 0)) continue;
    const r = skillDamageRange(w, id);
    const avg = (r.min + r.max) / 2;
    if (avg <= 0) continue;
    const frames = castFrames(w, id);
    const cd = Math.max(s.n.cooldown ?? 0, frames / TICK_HZ);
    const dps = PERSISTENT[id] ? (avg * PERSISTENT[id]) / cd : (avg * TICK_HZ) / frames;
    rows.push([id, Math.round(dps), `${r.elem}, niv. effectif ${w.player.d.skillLevels[id] ?? 0}, ${Math.round(avg)} par coup`]);
  }
  rows.sort((a, b) => b[1] - a[1]);
  console.log(`\n${f} — niveau ${g.character.level}`);
  for (const [id, dps, info] of rows.slice(0, 6)) console.log(`  ${id.padEnd(18)} ${String(dps).padStart(7)} DPS  (${info})`);
}
