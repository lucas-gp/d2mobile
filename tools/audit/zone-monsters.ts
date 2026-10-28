/**
 * Audit des espèces de monstres par zone : compare le peuplement du jeu (LEVEL_PLANS) aux colonnes mon / nmon de Levels.txt (patch 1.13), famille par famille
 * (« vampire4 » -> « vampire »), et écrit le tableau de docs/internal/audit/monsters-par-zone.md (zone | difficulté | espèces actuelles | espèces attendues | écart | correction).
 * Usage : npx tsx tools/audit/zone-monsters.ts > /tmp/table.md
 */
import '../mods/auto';
import { rows, num } from './common';
import { LEVEL_PLANS } from '../../src/data/levels';
import { MONSTER_FIDELITY } from '../../src/data/monsters-fidelity';

const ALIAS: Record<string, string> = { cr: 'corruptrogue', crownest: 'foulcrow', sk: 'skeleton', dkmag: 'doomknight', venomlord: 'megademon' };
/** « vampire4 » -> « vampire », « cr_archer6 » -> « corruptrogue » : famille de monstats */
const fam = (s: string): string => {
  const f = s.toLowerCase().replace(/\d+$/, '').replace(/_.*$/, '');
  return ALIAS[f] ?? f;
};
const ourFam = (id: string): string => fam(MONSTER_FIDELITY[id]?.d2 ?? id);
/** Substitutions voulues du jeu (le monstre D2 n'existe pas sous cette forme) : famille D2 -> espèce du jeu la plus proche */
const NEAREST: Record<string, string> = {};
/** Corrections de cet audit, par zone */
const FIXED: Record<string, string> = {
  mephisto: 'corrigé : blood_lord (bloodlord, Acte V) → ghoul_lord (vampire, Acte III) ; escorte idem',
  a3_durance3: 'corrigé : même plan que mephisto',
  chaos: "corrigé (repli sans carte) : blood_lord et soul_killer d'Acte V/III → oblivion_knight, venom_lord, storm_caster",
  eldritch: 'corrigé : Normal = imp + siege_beast (Levels.txt mon) ; Cauchemar/Enfer + skeleton_archer, slinger',
  nihlathak: 'corrigé : Cauchemar/Enfer = nmon (arach, fetish_shaman, baboon, claw_viper ; fallen_shaman retiré)',
  baal: 'corrigé : Cauchemar/Enfer + sand_raider, unraveler, claw_viper (nmon)',
  uber_duriel: 'corrigé : + locust (swarm)',
  river: 'corrigé : uniques plafonnés à la moitié des groupes (zone vidée de ses monstres ordinaires en Enfer)',
  a4_river: 'corrigé : idem',
  a3_causeway: 'corrigé : idem',
  a3_sewer2: 'corrigé : idem',
};
const levels = rows('levels');
const actRange = (key: string): [number, number] =>
  key.startsWith('a1_') ? [1, 39] : key.startsWith('a2_') ? [40, 74] : key.startsWith('a3_') ? [75, 102] : key.startsWith('a4_') ? [103, 108] : key.startsWith('a5_') ? [109, 132] : [0, 999];
const get = (r: Record<string, string>, p: string): string[] => Array.from({ length: 10 }, (_, i) => String(r[`${p}${i + 1}`] ?? '')).filter(Boolean);
const count = (xs: string[]): string => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join(', ');
const out = ['| zone | difficulté | espèces actuelles | espèces attendues (Levels.txt) | écart | correction |', '|---|---|---|---|---|---|'];
for (const [key, plan] of Object.entries(LEVEL_PLANS)) {
  const [lo, hi] = actRange(key);
  const r = levels.find((x) => String(x.LevelName) === plan.d2 && num(x.Id) >= lo && num(x.Id) <= hi);
  const fix = FIXED[key] ?? '-';
  if (!r) {
    out.push(`| ${key} | N/C/E | ${plan.mons[0].map((m) => m[0]).join(', ')} | « ${plan.d2} » : pas de ligne Levels.txt | zone propre au jeu (supposé) | ${fix} |`);
    continue;
  }
  const groups: { d: string; cur: string; exp: string; gap: string }[] = [];
  for (let d = 0; d < 3; d++) {
    const expRaw = get(r as never, d === 0 ? 'mon' : 'nmon');
    const exp = new Set(expRaw.map(fam));
    const have = new Set(plan.mons[d].map(([m]) => ourFam(m)));
    const miss = [...exp].filter((f) => !have.has(f) && !(NEAREST[f] && have.has(NEAREST[f])));
    const extra = [...have].filter((f) => !exp.has(f));
    const gap = [miss.length ? `manque ${miss.join(', ')}` : '', extra.length ? `en plus ${extra.join(', ')}` : ''].filter(Boolean).join(' ; ') || 'aucun';
    const cur = plan.mons[d].map(([m, w]) => (w > 1 ? `${m}×${w}` : m)).join(', ');
    const g = groups.find((x) => x.cur === cur && x.exp === count(expRaw) && x.gap === gap);
    if (g) g.d += `/${'NCE'[d]}`;
    else groups.push({ d: 'NCE'[d], cur, exp: count(expRaw), gap });
  }
  for (const g of groups) out.push(`| ${key} (${plan.d2}) | ${g.d} | ${g.cur} | ${g.exp} | ${g.gap} | ${fix} |`);
}
console.log(out.join('\n'));
