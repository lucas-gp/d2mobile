/**
 * Matrice des cartes : chaque zone de carte jouée N fois par le bot depuis une sauvegarde de bot
 * (issue, durée, morts, causes). Sert à régler la survie en cartes sans rejouer des heures.
 *   npx tsx mods/pd2/tools/bots/map-matrix.ts --save=test-results/bots/endmaps-cold-1.json --build=cold --n=3 --tiers=1,2,3
 * --playable : seulement les zones qu'un joueur du build joue (part d'immunisés à son élément
 * sous GOOD_ZONE_SHARE, comme le bot en partie libre) ; les cartes uniques sont exclues.
 */
import '../../../../tools/mods/auto';
import { readFileSync } from 'node:fs';
import { MAP_RANDOM_ZONES } from '../../../../src/data/maps';
import { Rng } from '../../../../src/core/rng';
import type { BuildId } from '../../../../src/sim/bot/brain';
import { BotBrain } from '../../../../src/sim/bot/brain';
import { GOOD_ZONE_SHARE, zoneImmuneShare } from '../../bots';
import { playRun } from '../../../../src/sim/bot/runner';
import { Game } from '../../../../src/sim/game';
import { makeMap } from '../../sim/maps';
import { migrate } from '../../../../src/sim/save';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const build = (args.get('build') ?? 'cold') as BuildId;
const savePath = args.get('save') ?? `test-results/bots/endmaps-${build}-1.json`;
const n = Number(args.get('n') ?? 3);
const tiers = (args.get('tiers') ?? '1,2,3').split(',').map(Number);
const quality = (args.get('quality') ?? 'normal') as 'normal' | 'magic' | 'rare';
const raw = JSON.parse(readFileSync(savePath, 'utf8'));

const bySrc: Record<string, number> = {};
const ttkNormal: number[] = [];
let total = 0;
let deaths = 0;
let done = 0;
const ELEM = { cold: 'cold', fire: 'fire', light: 'light' } as const;
const playable = args.has('playable');
for (const z of MAP_RANDOM_ZONES.filter((x) => tiers.includes(x.tier) && (!playable || zoneImmuneShare(x.id, ELEM[build as keyof typeof ELEM]) <= GOOD_ZONE_SHARE[build]))) {
  const cells: string[] = [];
  const causes: string[] = [];
  for (let k = 0; k < n; k++) {
    const g = new Game(migrate(structuredClone(raw.save)));
    g.character.name = `Matrice-${k}`;
    if (args.has('es')) g.character.skills.energy_shield = Number(args.get('es'));
    // --skills=cold_mastery:20,fire_ball:1 : essai d'une autre répartition des points
    for (const kv of (args.get('skills') ?? '').split(',').filter(Boolean)) {
      const [id, v] = kv.split(':');
      g.character.skills[id] = Number(v);
    }
    const brain = new BotBrain(g, { build, seed: k + 1 });
    brain.town();
    const c = g.character;
    let slot = c.inventory.indexOf(null);
    if (slot < 0) slot = 0;
    c.inventory[slot] = makeMap(new Rng(`matrix:${z.id}:${k}`), z.tier, quality, z.id);
    const off = g.onEvent((e) => {
      if (e.t === 'playerHurt') bySrc[e.src ?? '?'] = (bySrc[e.src ?? '?'] ?? 0) + e.amount;
    });
    const r = playRun(g, brain, 'map', 2, { maxSeconds: 600, map: { invIndex: slot } });
    off();
    for (const t of r.ttk.normal ?? []) ttkNormal.push(t);
    total++;
    if (r.died) deaths++;
    if (r.completed) done++;
    cells.push(`${r.died ? '✗' : r.completed ? '✓' : '⌛'}${Math.round(r.seconds)}s/${r.kills}`);
    if (r.death)
      causes.push(
        `${r.death.lastHits
          .map((h) => h.elem)
          .slice(-3)
          .join('+')} ← ${[...new Set(r.death.nearby.map((x) => x.split(':')[0]))].join(',')}`,
      );
  }
  console.log(`P${z.tier} ${z.id.padEnd(18)} ${cells.join('  ')}${causes.length ? `   morts : ${causes.join(' | ')}` : ''}`);
}
ttkNormal.sort((a, b) => a - b);
const med = ttkNormal[Math.floor(ttkNormal.length / 2)] ?? 0;
console.log(`\n${total} cartes : ${done} terminées, ${deaths} morts (${Math.round((deaths / total) * 100)} %), TTK médian des monstres normaux ${med.toFixed(2)} s`);
const sum = Object.values(bySrc).reduce((a, b) => a + b, 0);
console.log(
  'Dégâts subis par source :',
  Object.entries(bySrc)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([k, v]) => `${k} ${Math.round((v / sum) * 100)} %`)
    .join(', '),
);
