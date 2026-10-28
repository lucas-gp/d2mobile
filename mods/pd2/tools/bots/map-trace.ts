/**
 * Trace d’une carte jouée par le bot depuis une sauvegarde de bot (vie, cibles, résistances, sorts) :
 *   BUILD=trapsin npx tsx mods/pd2/tools/bots/map-trace.ts <zone> [sauvegarde] [pas en s]
 */
import '../../../../tools/mods/auto';
import { readFileSync } from 'node:fs';
import { Rng } from '../../../../src/core/rng';
import { BotBrain } from '../../../../src/sim/bot/brain';
import { Game } from '../../../../src/sim/game';
import { makeMap } from '../../sim/maps';
import { migrate } from '../../../../src/sim/save';
import { computeDerived } from '../../../../src/sim/character';
const zone = process.argv[2] ?? 'phlegethon';
const raw = JSON.parse(readFileSync(process.argv[3] ?? 'test-results/bots/premaps-cold-1.json', 'utf8'));
const g = new Game(migrate(raw.save));
const c = g.character;
const brain = new BotBrain(g, { build: (process.env.BUILD ?? 'cold') as never });
brain.town();
const d = computeDerived(c, 2);
console.log('niv', c.level, 'vie', d.lifeMax, 'res', JSON.stringify(d.res), 'skills', JSON.stringify(c.skills), 'hotbar', JSON.stringify(c.hotbar));
if (['tristram', 'tombs', 'cows', 'baal'].includes(zone)) g.startRun(zone, 2);
else {
  c.inventory[0] = makeMap(new Rng('t'), 1, 'normal', zone);
  g.startMap({ invIndex: 0 });
}
let w = g.world;
let kills = 0;
const hurt: Record<string, number> = {};
const hist: string[] = [];
const casts: Record<string, number> = {};
g.onEvent((e) => {
  if (e.t === 'death') kills++;
  if (e.t === 'playerHurt') hurt[e.elem] = Math.round((hurt[e.elem] ?? 0) + e.amount);
});
for (let t = 0; t < 25 * 600 && g.mode === 'run'; t++) {
  brain.tick();
  g.step(1);
  w = g.world;
  const p = g.world.player;
  if (brain.action.startsWith('sort')) casts[brain.action] = (casts[brain.action] ?? 0) + 1;
  if (t % (25 * Number(process.argv[4] ?? 5)) === 0) {
    const near = w.monsters.filter((m) => !m.dead && Math.hypot(m.x - p.x, m.y - p.y) < 12);
    console.log(
      `${t / 25}s hp ${Math.round(p.hp)}/${Math.round(p.hpMax)} mana ${Math.round(p.mana)} tués ${kills} proches ${near.length} ${near
        .slice(0, 3)
        .map((m) => `${m.def.id}:${m.rank} ${Math.round(m.hp)}/${Math.round(m.hpMax)} res ${JSON.stringify(m.res)}`)
        .join(' ; ')} | ${brain.action} | ceinture ${c.belt.map((b) => b.kind + ':' + b.qty).join(',')} potions ${brain.stats.potions} | subi ${JSON.stringify(hurt)}`,
    );
  }
  if (t % 5 === 0) hist.push(`${(t / 25).toFixed(1)}:${Math.round(p.hp)}${p.mode === 'cast' ? 'c' : p.mode === 'hit' ? 'h' : ''}:${brain.action.split(' ')[0]}`);
  if (hist.length > 30) hist.shift();
  if (p.dead) {
    console.log('MORT à', t / 25, 'derniers PV :', hist.join(' '), '| ceinture', c.belt.map((b) => b.kind + ':' + b.qty).join(','));
    break;
  }
}
console.log('sorts', JSON.stringify(casts));
