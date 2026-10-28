/**
 * Audit des boss de carte (37 cartes) : espèce, vie, résistances, dégâts, temps de mise à mort par le bot
 * (personnage de référence du palier) et butin par mise à mort (N tirages du butin du boss).
 *   npx tsx mods/pd2/tools/bots/map-boss-audit.ts [--builds=cold,whirlwind] [--loot=500] [--ttk=1] [--zones=a,b] [--out=fichier.json]
 * Niveaux du personnage de référence : P1 85, P2 88, P3 91, donjon 94 (personnage d'endgame adapté au palier).
 */
import '../../../../tools/mods/auto';
import { writeFileSync } from 'node:fs';
import { Rng } from '../../../../src/core/rng';
import { MAP_ZONES, type MapZoneDef } from '../../../../src/data/maps';
import { RUNE_BY_ID } from '../../../../src/data/items/runes';
import { TICK_HZ } from '../../../../src/sim/constants';
import { makeMap } from '../../sim/maps';
import { rollMonsterDrops } from '../../../../src/sim/loot/drops';
import { referenceCharacter } from '../../../../src/sim/bot/arena';
import { BotBrain, type BuildId } from '../../../../src/sim/bot/brain';
import type { Game } from '../../../../src/sim/game';
import type { Monster } from '../../../../src/sim/actors';
import type { Item } from '../../../../src/sim/item';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const builds = (args.get('builds') ?? 'cold,whirlwind').split(',') as BuildId[];
const lootN = Number(args.get('loot') ?? 500);
const doTtk = args.get('ttk') !== '0';
const zones = args.get('zones') ? MAP_ZONES.filter((z) => args.get('zones')!.split(',').includes(z.id)) : MAP_ZONES;
const LEVEL: Record<number, number> = { 1: 85, 2: 88, 3: 91, 4: 94 };
const MAX_SEC = Number(args.get('max') ?? 300);

/** Ouvre la carte `def` (blanche, sans affixe) pour le personnage de `g` ; renvoie le boss apparu */
/**
 * Personnage d'endgame : celui de l'arène (src/sim/bot/arena.ts, équipement rare du niveau) avec en plus +100 % de résistances
 * sur l'amulette, pour compenser la pénalité de l'Enfer (−100) comme le fait un joueur des cartes (75 % partout).
 */
function endgameCharacter(level: number, build: BuildId): Game {
  const g = referenceCharacter(level, build, 1);
  const amu = g.character.equipment.amulet;
  if (amu && !args.has('raw')) {
    amu.craftMods = [...(amu.craftMods ?? []), { stat: 'resAll', value: 100 }];
    g.world.refreshPlayer();
  }
  return g;
}

function openMap(g: Game, def: MapZoneDef, seed: number): Monster {
  const it = makeMap(new Rng(`audit:${def.id}`), def.tier, def.unique ? 'unique' : 'normal', def.id);
  (g as unknown as { launchMap(it: Item, seed: number): void }).launchMap(it, seed);
  const w = g.world;
  const ps = w.pendingSpawns.find((p) => w.zone.spawns[p.idx]?.runBoss);
  if (!ps) throw new Error(`${def.id} : pas de boss en attente`);
  w.pendingSpawns = w.pendingSpawns.filter((p) => p !== ps);
  const group = w.spawnGroup(ps.idx);
  const boss = group.find((m) => m.runBoss) ?? group[0];
  return boss;
}

interface Row {
  zone: string;
  name: string;
  tier: number;
  species: string;
  rank: string;
  mlvl: number;
  hp: number;
  res: Record<string, number>;
  dmg: number;
  mods: string[];
  escorts: number;
  ttk: Record<string, { sec: number | null; bossSec: number | null; died: boolean; lifeLostPct: number }>;
  loot?: Record<string, number>;
}

function classify(items: Item[], acc: Record<string, number>): void {
  acc.items = (acc.items ?? 0) + items.length;
  for (const it of items) {
    const rune = RUNE_BY_ID[it.base];
    const k = it.map
      ? 'maps'
      : it.base.startsWith('orb_') || it.base === 'worldstone_shard'
        ? 'orbs'
        : rune
          ? rune.rank >= 26
            ? 'runeHigh'
            : rune.rank >= 15
              ? 'runeMid'
              : 'runeLow'
          : it.base.startsWith('gem_')
            ? 'gems'
            : it.base === 'gold'
              ? 'gold'
              : it.uniqueId?.startsWith('u_sunder')
                ? 'sunder'
                : it.base.endsWith('potion')
                  ? 'potions'
                  : it.quality === 'unique' || it.quality === 'set' || it.quality === 'rare' || it.quality === 'magic'
                    ? it.quality
                    : 'other';
    acc[k] = (acc[k] ?? 0) + 1;
    if (k === 'gold') acc.goldAmt = (acc.goldAmt ?? 0) + (it.qty ?? 0);
    if (rune) acc.runes = (acc.runes ?? 0) + 1;
    if ((k === 'unique' || k === 'set') && (it as { ilvl?: number }).ilvl) acc.uniqSetIlvl = (acc.uniqSetIlvl ?? 0) + it.ilvl;
  }
}

const rows: Row[] = [];
for (const def of zones) {
  const level = LEVEL[def.tier];
  const g0 = endgameCharacter(level, builds[0]);
  const boss0 = openMap(g0, def, 11);
  const w0 = g0.world;
  const row: Row = {
    zone: def.id,
    name: def.boss.name,
    tier: def.tier,
    species: boss0.def.id,
    rank: (boss0 as Monster & { mapBoss?: unknown }).mapBoss ? 'mapboss' : boss0.rank,
    mlvl: boss0.mlvl,
    hp: boss0.hpMax,
    res: { ...boss0.res },
    dmg: Math.round((boss0.dmgMin + boss0.dmgMax) / 2),
    mods: [...boss0.mods],
    escorts: w0.monsters.filter((m) => !m.dead && m !== boss0 && !m.isSummon && m.leader === boss0.id).length,
    ttk: {},
  };
  // butin : N tirages du butin du boss (même monstre, flux de butin qui avance)
  if (lootN > 0) {
    const acc: Record<string, number> = {};
    for (let i = 0; i < lootN; i++) classify(rollMonsterDrops(w0, boss0), acc);
    for (const k of Object.keys(acc)) acc[k] = Math.round((acc[k] / lootN) * 1000) / 1000;
    row.loot = acc;
  }
  if (doTtk) {
    for (const build of builds) {
      const g = endgameCharacter(level, build);
      const boss = openMap(g, def, 11);
      const w = g.world;
      // personnage devant l'arène : à ~9 unités du boss, côté libre
      const spot = w.grid.nearestFree(boss.x - 9, boss.y, 6) ?? w.grid.nearestFree(boss.x + 9, boss.y, 6) ?? w.grid.nearestFree(boss.x, boss.y + 9, 8);
      if (spot) {
        w.player.x = w.player.px = spot.x;
        w.player.y = w.player.py = spot.y;
      }
      // combat de boss seul : le reste de la carte est considéré nettoyé (seuls le boss et son escorte comptent)
      for (const m of w.monsters) if (!m.isSummon && !m.pet && m !== boss && m.leader !== boss.id) m.dead = true;
      w.pendingSpawns = w.pendingSpawns.filter((p) => w.zone.spawns[p.idx]?.escort && Math.hypot(p.x - boss.x, p.y - boss.y) < 6);
      const brain = new BotBrain(g, { build });
      const hp0 = w.player.hpMax;
      let minHp = w.player.hp;
      let firstHit = -1;
      let t = 0;
      let died = false;
      const bySrc: Record<string, number> = {};
      for (; t < MAX_SEC * TICK_HZ; t++) {
        brain.tick();
        w.step(1);
        for (const e of w.events.drain()) if (e.t === 'playerHurt') bySrc[e.src ?? 'zone'] = (bySrc[e.src ?? 'zone'] ?? 0) + e.amount;
        if (firstHit < 0 && boss.hp < boss.hpMax) firstHit = t;
        minHp = Math.min(minHp, w.player.hp);
        if (w.player.dead) {
          died = true;
          break;
        }
        if (boss.dead) break;
      }
      row.ttk[build] = {
        sec: boss.dead ? Math.round((t / TICK_HZ) * 10) / 10 : null,
        bossSec: boss.dead && firstHit >= 0 ? Math.round(((t - firstHit) / TICK_HZ) * 10) / 10 : null,
        died,
        lifeLostPct: Math.round((100 * (hp0 - minHp)) / hp0),
      };
      if (args.has('debug')) {
        const st = (boss as Monster & { mapBoss?: { dealt: Record<string, number>; phase: number; enrage: number } }).mapBoss;
        console.log(
          `  ${build} t=${(t / TICK_HZ).toFixed(1)}s hp ${Math.round(boss.hp)}/${boss.hpMax} joueur ${Math.round(w.player.hp)}/${Math.round(hp0)} pots ${brain.stats.potions} phase ${st?.phase} enrage ${st?.enrage}`,
        );
        console.log(
          '   subis',
          JSON.stringify(Object.fromEntries(Object.entries(bySrc).map(([k, v]) => [k, Math.round(v)]))),
          'kit',
          JSON.stringify(Object.fromEntries(Object.entries(st?.dealt ?? {}).map(([k, v]) => [k, Math.round(v)]))),
        );
      }
    }
  }
  rows.push(row);
  const r = row;
  console.log(
    `${r.zone.padEnd(22)} T${r.tier} ${r.species.padEnd(18)} ${r.rank.padEnd(7)} lvl ${r.mlvl} PV ${String(r.hp).padStart(8)} dmg ${String(r.dmg).padStart(5)} res ${Object.entries(r.res)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}${v}`)
      .join('/')} mods ${r.mods.join(',')} esc ${r.escorts} | ${Object.entries(r.ttk)
      .map(([b, x]) => `${b} ${x.bossSec ?? '—'}s${x.died ? '†' : ''} (${x.lifeLostPct}%)`)
      .join(' ')} | ${
      r.loot
        ? Object.entries(r.loot)
            .map(([k, v]) => `${k} ${v}`)
            .join(' ')
        : ''
    }`,
  );
}
if (args.get('out')) writeFileSync(args.get('out')!, JSON.stringify(rows, null, 1));
