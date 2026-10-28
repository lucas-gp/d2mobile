/**
 * Banc de cadence d'attaque des monstres : npx tsx tools/bench/monster-rates.ts [--write] [id,id…]
 * Écrit docs/internal/audit/monster-attack-rates.md avec --write (sinon affiche seulement les écarts > 15 %).
 */
import { writeFileSync } from 'node:fs';
import { measureAll } from './monster-rates-lib';

const args = process.argv.slice(2);
const write = args.includes('--write');
const only = args.find((a) => !a.startsWith('--'))?.split(',');
const rows = measureAll(only ? (d) => only.includes(d.id) : undefined);
const f = (v: number | null, d = 0) => (v === null ? '—' : v.toFixed(d));
const lines = ['| espèce | attaque | mode D2 | animation mesurée / attendue (ticks) | intervalle mesuré / attendu (ticks) | écart | remarque |', '|---|---|---|---|---|---|---|'];
let bad = 0;
for (const r of rows) {
  const slowOk = r.cooldown > 30 && r.gap !== null && r.gap > 0.15;
  const verdict = r.gap === null ? '' : r.gap < -0.15 ? 'TROP RAPIDE' : r.gap > 0.15 ? (slowOk ? 'plus lent (limiteur de conception)' : 'TROP LENT') : 'ok';
  if (verdict.startsWith('TROP')) bad++;
  const line = `| ${r.name} (${r.id}) | ${r.kind}#${r.idx} (cd ${r.cooldown}) | ${r.mode || '—'} | ${f(r.anim, 1)} / ${f(r.expAnim)} | ${f(r.interval, 1)} / ${f(r.expInterval)} | ${r.gap === null ? '—' : `${r.gap >= 0 ? '+' : ''}${(r.gap * 100).toFixed(0)} %`} | ${[verdict === 'ok' ? '' : verdict, r.note].filter(Boolean).join(' ; ')} |`;
  lines.push(line);
  if (!write && (only || verdict.startsWith('TROP') || r.note)) console.log(line);
}
console.log(`${rows.length} attaques, ${bad} hors tolérance (±15 %)`);
if (write)
  writeFileSync(
    'docs/internal/audit/monster-attack-rates.md',
    [
      "# Cadence d'attaque des monstres",
      '',
      'Généré par `npx tsx tools/bench/monster-rates.ts --write`. Attendu D2 = animation (animdata.d2) + aidel (monstats.txt, Cauchemar). Tolérance ±15 %.',
      '',
      ...lines,
      '',
    ].join('\n'),
  );
