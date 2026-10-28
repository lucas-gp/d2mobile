/**
 * Mesure du butin par palier de taux (rates.ts) : runes moyennes/hautes, uniques et sets pour N kills
 * d'une mêlée type de cartes T2 (87 % normaux, 8 % champions, 4,5 % uniques, 0,5 % boss), puis
 * ramené à l'heure avec le volume calibré (35 runes/h au palier Normal).
 *   npx tsx mods/pd2/tools/bots/loot-rate-measure.ts [zone=map] [mapTier=2] [mf=300]
 */
import '../../../../tools/mods/auto';
import { Rng } from '../../../../src/core/rng';
import { RUNE_BY_ID } from '../../../../src/data/items/runes';
import { LOOT_RATE_IDS, applyLootPreset } from '../../../../src/data/rates';
import { mapExtraDrops } from '../../sim/maps';
import { rollTc } from '../../../../src/sim/loot/drops';
import { NO_BONUS } from '../../../../src/sim/loot/itemgen';

const zoneKey = process.argv[2] ?? 'map';
const mapTier = Number(process.argv[3] ?? 2);
const mf = Number(process.argv[4] ?? 300);
const N = 300_000;
const res: Record<string, { all: number; mid: number; high: number; uniq: number; set: number; rare: number; maps: number; orbs: number }> = {};
for (const id of LOOT_RATE_IDS) {
  applyLootPreset(id);
  const rng = new Rng('measure');
  const r = { all: 0, mid: 0, high: 0, uniq: 0, set: 0, rare: 0, maps: 0, orbs: 0 };
  for (let i = 0; i < N; i++) {
    const x = rng.next();
    const tc = x < 0.87 ? 'normal' : x < 0.95 ? 'champion' : x < 0.995 ? 'unique' : 'boss';
    const items = rollTc({ rng, ilvl: 85, mf, difficulty: 2, zoneKey, mapTier, bonus: NO_BONUS, gf: 0, quantity: 1 }, tc);
    // cartes et orbes lâchés (butin propre aux cartes, hors TC) : paliers T1-T3 selon mapTier
    for (const it of mapExtraDrops(rng, mapTier, tc)) {
      const b = (it as { base?: string }).base ?? '';
      if (b.startsWith('orb_') || b === 'worldstone_shard') r.orbs++;
      else if (b.includes('map')) r.maps++;
    }
    for (const it of items) {
      const base = (it as unknown as { baseId?: string; base?: string }).baseId ?? (it as unknown as { base?: string }).base ?? '';
      const rune = RUNE_BY_ID[base];
      if (rune) {
        r.all++;
        if (rune.rank >= 26) r.high++;
        else if (rune.rank >= 15) r.mid++;
      } else if ((it as { quality?: string }).quality === 'unique') r.uniq++;
      else if ((it as { quality?: string }).quality === 'set') r.set++;
      else if ((it as { quality?: string }).quality === 'rare') r.rare++;
    }
  }
  res[id] = r;
}
applyLootPreset('normal');
const killsPerHour = (35 / res.normal.all) * N;
console.log(`zone=${zoneKey} tier=${mapTier} mf=${mf}, ${N} kills par palier ; volume calibré : ${Math.round(killsPerHour)} kills/h (35 runes/h en Normal)`);
const h = (v: number) => +((v / N) * killsPerHour).toFixed(2);
console.table(
  Object.fromEntries(
    Object.entries(res).map(([k, r]) => [
      k,
      {
        'runes/h': h(r.all),
        'moyennes/h': h(r.mid),
        'hautes/h': h(r.high),
        'h entre hautes': r.high ? +(1 / h(r.high)).toFixed(1) : Infinity,
        'uniques/h': h(r.uniq),
        'sets/h': h(r.set),
        'rares/h': h(r.rare),
        'cartes/h': h(r.maps),
        'orbes/h': h(r.orbs),
        'cartes ×Normal': +(r.maps / Math.max(1, res.normal.maps)).toFixed(2),
        'orbes ×Normal': +(r.orbs / Math.max(1, res.normal.orbs)).toFixed(2),
      },
    ]),
  ),
);
