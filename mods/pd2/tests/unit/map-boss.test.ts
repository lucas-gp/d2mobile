/** Boss de carte : statut, vie, kits télégraphiés, phases, enrage, laisse, contrôles, butin (mods/pd2/sim/map-boss.ts) */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../../../src/core/rng';
import { DIFF_MULT, monsterHp } from '../../../../src/data/curves';
import { RUNE_BY_ID } from '../../../../src/data/items/runes';
import { MAP_ZONES, MAP_ZONE_BY_ID, type MapZoneDef } from '../../../../src/data/maps';
import { MAP_BOSS_ARCHETYPES, MAP_BOSS_ENRAGE_SEC, MAP_BOSS_HP, MAP_BOSS_KITS, MAP_BOSS_LEASH_R, MAP_BOSS_SHIELD_TAKEN, MIN_TELEGRAPH_SEC, type MapBossArchetype } from '../../data/map-boss-kits';
import { RATES } from '../../../../src/data/rates';
import { TICK_HZ } from '../../../../src/sim/constants';
import { Game } from '../../../../src/sim/game';
import { makeMap } from '../../sim/maps';
import { castMapBossSkill, mapBossHpMul, updateMapBoss } from '../../sim/map-boss';
import { MAP_BOSS_LOOT, rollMonsterDrops } from '../../../../src/sim/loot/drops';
import type { Monster } from '../../../../src/sim/actors';
import type { Item } from '../../../../src/sim/item';
import { perfMs } from '../../../../tests/perf';

const ARCHS = Object.keys(MAP_BOSS_ARCHETYPES) as MapBossArchetype[];
const ELEMS = ['phys', 'fire', 'cold', 'light', 'poison', 'magic'];
const KEY = { phys: 'physImmune', fire: 'fireImmune', cold: 'coldImmune', light: 'lightImmune', poison: 'poisonImmune' } as const;

/** Ouvre la carte `z` (blanche ou unique) et fait apparaître son boss, devant lequel le joueur est posé */
function bossOf(z: MapZoneDef, seed = 5): { g: Game; boss: Monster } {
  const g = new Game(undefined, 'sorceress');
  g.character.level = 90;
  g.character.progression.highestDifficulty = 2;
  g.character.inventory[0] = makeMap(new Rng('mb:' + z.id), z.tier, z.unique ? 'unique' : 'normal', z.id);
  g.character.materials.worldstone_shard = 0;
  expect(g.startMap({ invIndex: 0 }, seed).ok, z.id).toBe(true);
  const w = g.world;
  const ps = w.pendingSpawns.find((p) => w.zone.spawns[p.idx]?.runBoss)!;
  w.pendingSpawns = w.pendingSpawns.filter((p) => p !== ps);
  const boss = w.spawnGroup(ps.idx).find((m) => m.runBoss)!;
  return { g, boss };
}

/** Joueur à `d` unités du boss, invulnérable de fait (vie énorme), monstres ordinaires retirés, attaques de l'espèce neutralisées */
function isolate(g: Game, boss: Monster, d = 6): void {
  const w = g.world;
  for (const m of w.monsters) if (m !== boss && !m.pet) m.dead = true;
  w.pendingSpawns = [];
  const spot = w.grid.nearestFree(boss.x - d, boss.y, 4) ?? w.grid.nearestFree(boss.x + d, boss.y, 4)!;
  w.player.x = w.player.px = spot.x;
  w.player.y = w.player.py = spot.y;
  w.player.hp = w.player.hpMax = 1e7;
  boss.dmgMin = boss.dmgMax = 0;
  boss.mapBoss!.baseMin = boss.mapBoss!.baseMax = 0;
  boss.speed = 0;
  boss.mapBoss!.baseSpeed = 0;
}

describe('Boss de carte : statut', () => {
  it('les 37 cartes ont un boss de carte : rang unique sans modificateur aléatoire, vie de boss, kit de 3 à 5 compétences', () => {
    expect(MAP_ZONES.length).toBe(37);
    for (const z of MAP_ZONES) {
      const { g, boss } = bossOf(z);
      const st = boss.mapBoss!;
      expect(st, z.id).toBeTruthy();
      expect(boss.rank, z.id).toBe('unique');
      expect(boss.name, z.id).toBe(z.boss.name);
      expect(boss.mods, z.id).toEqual([]);
      expect(st.tier, z.id).toBe(z.tier);
      // vie : formule du palier (affixes de vie aucun sur une carte blanche ; cartes uniques : affixes fixes)
      const lifeMods = g.world.mapMods.filter((x) => x.id === 'monsterLife' || x.id === 'monsterLeech').reduce((a, x) => a * (1 + x.value / 100), 1);
      const want = monsterHp(boss.mlvl) * DIFF_MULT[2].hp * mapBossHpMul(boss.def, z.tier) * lifeMods;
      expect(Math.abs(boss.hpMax - want) / want, z.id).toBeLessThan(0.01);
      // nettement plus qu'un unique de la même espèce (×2 en Enfer) : au moins ×3
      const unique = monsterHp(boss.mlvl) * DIFF_MULT[2].hp * Math.min(boss.def.hp, 3) * 2;
      expect(boss.hpMax / unique, z.id).toBeGreaterThan(3);
      // ni régénération propre, ni sac à PV : fourchette du palier
      expect(boss.regen, z.id).toBe(0);
      const kit = MAP_BOSS_KITS[z.id];
      expect(kit, z.id).toBeTruthy();
      expect(kit.skills.length, z.id).toBeGreaterThanOrEqual(3);
      expect(kit.skills.length, z.id).toBeLessThanOrEqual(5);
      for (const sk of kit.skills) {
        expect(ARCHS, z.id).toContain(sk.arch);
        expect(ELEMS, z.id).toContain(sk.elem);
        if (sk.arch === 'aura') expect(sk.fx, z.id).toBeTruthy();
      }
      // au moins deux compétences dès le début, une nouvelle en phase basse
      expect(kit.skills.filter((s) => s.phase === 0).length, z.id).toBeGreaterThanOrEqual(2);
      expect(
        kit.skills.some((s) => s.phase > 0),
        z.id,
      ).toBe(true);
      expect(kit.phases.length, z.id).toBe(3);
      for (const a of kit.phases) expect(['summon', 'shield', 'haste', 'frenzy'], z.id).toContain(a);
      expect(MAP_BOSS_ENRAGE_SEC[st.tier], z.id).toBeGreaterThanOrEqual(150);
    }
  });

  it('vie par palier croissante, enrage plus tardif aux paliers hauts', () => {
    expect(MAP_BOSS_HP[1]).toBeLessThan(MAP_BOSS_HP[2]);
    expect(MAP_BOSS_HP[2]).toBeLessThan(MAP_BOSS_HP[3]);
    expect(MAP_BOSS_HP[3]).toBeLessThan(MAP_BOSS_HP[4]);
    expect(MAP_BOSS_ENRAGE_SEC[1]).toBe(150);
    expect(MAP_BOSS_ENRAGE_SEC[2]).toBe(180);
    expect(MAP_BOSS_ENRAGE_SEC[3]).toBe(210);
  });

  it('aucune immunité non annoncée (cartes uniques : aucune immunité)', () => {
    for (const z of MAP_ZONES) {
      for (const seed of [5, 6, 7]) {
        const { g, boss } = bossOf(z, seed);
        const announced = new Set(g.world.mapMods.map((x) => x.id));
        for (const e of ['phys', 'fire', 'cold', 'light', 'poison'] as const) {
          if (boss.res[e] >= 100) expect(announced.has(KEY[e]), `${z.id} ${e}`).toBe(true);
          if (z.unique) expect(boss.res[e], `${z.id} ${e}`).toBeLessThan(100);
        }
      }
    }
  });

  it('donjons : le reflet de Baal / Duriel est un boss de carte seul, escorté de monstres de la carte', () => {
    for (const id of ['plains_torment', 'sanctuary_sin']) {
      const { g, boss } = bossOf(MAP_ZONE_BY_ID[id]);
      expect(boss.mapBoss).toBeTruthy();
      expect(boss.rank).toBe('unique');
      expect(boss.mlvl).toBe(g.world.zoneLevel + 3);
      const clones = g.world.monsters.filter((m) => m !== boss && m.def.id === boss.def.id && !m.dead);
      expect(clones.length).toBe(0);
      expect(g.world.zone.spawns.some((s) => s.escort && Math.hypot(s.x - boss.spawnX, s.y - boss.spawnY) < 6)).toBe(true);
    }
  });
});

describe('Boss de carte : compétences télégraphiées', () => {
  it('chaque compétence de zone pose son marqueur au moins 0,7 s avant l’impact (toutes les cartes)', () => {
    const minWarn = Math.round(MIN_TELEGRAPH_SEC * TICK_HZ);
    const seen = new Set<string>();
    for (const z of MAP_ZONES) {
      const { g, boss } = bossOf(z);
      isolate(g, boss);
      const w = g.world;
      const st = boss.mapBoss!;
      st.engaged = true;
      MAP_BOSS_KITS[z.id].skills.forEach((sk, i) => {
        const A = MAP_BOSS_ARCHETYPES[sk.arch];
        const t0 = w.tick;
        const areas0 = new Set(w.areas.map((a) => a.id));
        const miss0 = w.missiles.length;
        st.actions = [];
        castMapBossSkill(w, boss, st, i);
        seen.add(sk.arch);
        const fresh = w.areas.filter((a) => !areas0.has(a.id) && a.owner === boss.id && a.team === 1);
        if (A.warn > 0) {
          expect(A.warn, sk.arch).toBeGreaterThanOrEqual(MIN_TELEGRAPH_SEC);
          // un marqueur (ou une zone dont les dégâts attendent le télégraphe) est posé immédiatement
          expect(fresh.length, `${z.id} ${sk.arch}`).toBeGreaterThan(0);
          for (const a of fresh) {
            if (a.kind === 'mb_mark') expect(a.life, `${z.id} ${sk.arch}`).toBeGreaterThanOrEqual(minWarn);
            else expect(a.aux, `${z.id} ${sk.arch} ${a.kind}`).toBeGreaterThanOrEqual(minWarn);
          }
          // chaque impact différé tombe au plus tôt 0,7 s après le lancement, au plus tard à l'extinction de son marqueur
          for (const a of st.actions) {
            expect(a.at - t0, `${z.id} ${sk.arch}`).toBeGreaterThanOrEqual(minWarn);
            const m = fresh.find((x) => x.kind === 'mb_mark' && Math.hypot(x.x - a.x, x.y - a.y) < 0.01);
            if (a.arch !== 'cone' && a.arch !== 'nova') expect(m, `${z.id} ${sk.arch} marqueur`).toBeTruthy();
          }
          // aucun projectile avant la fin du télégraphe (nova)
          expect(w.missiles.length, sk.arch).toBe(miss0);
        }
        for (const a of fresh) a.dead = true;
        st.actions = [];
      });
    }
    // le catalogue entier est utilisé par les kits (le bouclier sert de phase)
    for (const a of ARCHS) if (a !== 'shield') expect(seen.has(a), a).toBe(true);
  });

  it('le premier dégât d’une compétence arrive ≥ 0,7 s après le lancement, et le joueur qui sort du marqueur n’est pas touché (événements)', () => {
    const minWarn = Math.round(MIN_TELEGRAPH_SEC * TICK_HZ);
    for (const id of ['phlegethon', 'throne_insanity', 'torajan_jungle', 'fall_caldeum', 'horazon_memory', 'sanatorium']) {
      const z = MAP_ZONE_BY_ID[id];
      MAP_BOSS_KITS[id].skills.forEach((sk, i) => {
        if (sk.arch === 'summon') return;
        // 1) immobile : touché, mais pas avant le télégraphe
        {
          const { g, boss } = bossOf(z);
          isolate(g, boss, 4);
          const w = g.world;
          const st = boss.mapBoss!;
          st.engaged = true;
          st.nextAt = 1e9;
          st.lockUntil = 0;
          w.events.drain();
          const t0 = w.tick;
          castMapBossSkill(w, boss, st, i);
          st.nextAt = 1e9;
          let first = -1;
          for (let k = 0; k < 3 * TICK_HZ && first < 0; k++) {
            w.step(1);
            if (w.events.drain().some((e) => e.t === 'playerHurt')) first = w.tick - t0;
          }
          expect(first, `${id} ${sk.arch} touché immobile`).toBeGreaterThan(0);
          expect(first, `${id} ${sk.arch}`).toBeGreaterThanOrEqual(minWarn);
        }
        // 2) le joueur s'écarte de 12 unités pendant le télégraphe : rien (sauf l'aura, centrée sur le boss, et le pas de l'ombre qui le suit : on s'écarte aussi)
        {
          const { g, boss } = bossOf(z);
          isolate(g, boss, 4);
          const w = g.world;
          const st = boss.mapBoss!;
          st.engaged = true;
          castMapBossSkill(w, boss, st, i);
          st.nextAt = 1e9;
          const p = w.player;
          // s'éloigne du boss (hors de portée de l'anneau) et de ses marqueurs
          let spot: { x: number; y: number } | null = null;
          for (let k = 0; k < 16 && !spot; k++) {
            const a = (k / 16) * Math.PI * 2;
            const f = w.grid.nearestFree(boss.x + Math.cos(a) * 16, boss.y + Math.sin(a) * 16, 3);
            if (f && Math.hypot(f.x - boss.x, f.y - boss.y) >= 14 && w.areas.every((x) => x.dead || Math.hypot(x.x - f.x, x.y - f.y) > x.radius + 2)) spot = f;
          }
          expect(spot, `${id} ${sk.arch} : case de repli`).toBeTruthy();
          if (!spot) return;
          w.events.drain();
          p.x = p.px = spot.x;
          p.y = p.py = spot.y;
          let hurt = 0;
          for (let k = 0; k < 2 * TICK_HZ; k++) {
            w.step(1);
            for (const e of w.events.drain()) if (e.t === 'playerHurt') hurt += e.amount;
          }
          expect(hurt, `${id} ${sk.arch} évité`).toBe(0);
        }
      });
    }
  });

  it('aucun impact ne tue d’un coup un personnage à pleine vie, même sans résistances', () => {
    for (const id of ['phlegethon', 'throne_insanity', 'blood_moon', 'plains_torment', 'steppes_daken']) {
      const z = MAP_ZONE_BY_ID[id];
      MAP_BOSS_KITS[id].skills.forEach((sk, i) => {
        if (sk.arch === 'summon' || sk.arch === 'wall' || sk.arch === 'pool') return;
        const { g, boss } = bossOf(z);
        isolate(g, boss, 3);
        const w = g.world;
        const p = w.player;
        p.hpMax = 900;
        p.hp = 900;
        p.d.res = { phys: 0, fire: -50, cold: -50, light: -50, poison: -50, magic: 0 };
        const st = boss.mapBoss!;
        st.engaged = true;
        st.enrage = 3;
        castMapBossSkill(w, boss, st, i);
        st.nextAt = 1e9;
        let worst = 0;
        for (let k = 0; k < 2 * TICK_HZ && !p.dead; k++) {
          w.step(1);
          for (const e of w.events.drain()) if (e.t === 'playerHurt') worst = Math.max(worst, e.amount);
        }
        expect(worst, `${id} ${sk.arch}`).toBeLessThan(900 * 0.6);
      });
    }
  });
});

describe('Boss de carte : phases, enrage, bouclier, contrôles, laisse', () => {
  it('phases à 75 / 50 / 25 % : action de phase (renforts, bouclier, accélération, frénésie) et nouvelles compétences', () => {
    const { g, boss } = bossOf(MAP_ZONE_BY_ID.zoltun_kulle);
    isolate(g, boss, 8);
    const w = g.world;
    const st = boss.mapBoss!;
    updateMapBoss(w, boss);
    expect(st.engaged).toBe(true);
    const texts: string[] = [];
    for (const frac of [0.74, 0.49, 0.24]) {
      boss.hp = boss.hpMax * frac;
      w.step(1);
      for (const e of w.events.drain()) if (e.t === 'mapEvent') texts.push(e.text);
    }
    expect(st.phase).toBe(3);
    expect(texts.some((t) => t.includes('renforts'))).toBe(true);
    expect(texts.some((t) => t.includes('gardiens'))).toBe(true);
    expect(texts.some((t) => t.includes('frénésie'))).toBe(true);
    expect(st.adds.length).toBeGreaterThan(0);
    expect(st.frenzy).toBe(true);
  });

  it('bouclier : dégâts subis réduits tant qu’un gardien vit, levé quand ils meurent', () => {
    const { g, boss } = bossOf(MAP_ZONE_BY_ID.zoltun_kulle);
    isolate(g, boss, 8);
    const w = g.world;
    const st = boss.mapBoss!;
    updateMapBoss(w, boss);
    boss.hp = boss.hpMax * 0.49;
    st.phase = 1;
    w.step(1);
    expect(st.shieldUntil).toBeGreaterThan(w.tick);
    expect(st.wards.length).toBe(3);
    const hp0 = boss.hp;
    w.hurtMonster(boss, { phys: 0, fire: 1000, cold: 0, light: 0, poison: 0, magic: 0, spell: true });
    const shielded = hp0 - boss.hp;
    for (const id of st.wards) {
      const m = w.monsters.find((o) => o.id === id)!;
      w.killMonster(m, w.player);
    }
    w.step(1);
    expect(st.shieldUntil).toBe(0);
    const hp1 = boss.hp;
    w.hurtMonster(boss, { phys: 0, fire: 1000, cold: 0, light: 0, poison: 0, magic: 0, spell: true });
    expect(shielded).toBeCloseTo((hp1 - boss.hp) * MAP_BOSS_SHIELD_TAKEN, 0);
  });

  it('enrage : après le délai du palier, les dégâts montent par paliers de 10 s', () => {
    const { g, boss } = bossOf(MAP_ZONE_BY_ID.phlegethon);
    isolate(g, boss, 8);
    const w = g.world;
    const st = boss.mapBoss!;
    st.baseMin = 100;
    st.baseMax = 100;
    updateMapBoss(w, boss);
    w.step(1);
    expect(boss.dmgMin).toBeCloseTo(100);
    st.startTick = w.tick - (MAP_BOSS_ENRAGE_SEC[1] + 25) * TICK_HZ;
    w.step(1);
    expect(st.enrage).toBe(3);
    expect(boss.dmgMin).toBeGreaterThan(140);
  });

  it('contrôles : gel et étourdissement possibles, mais de moitié moins longs à chaque contrôle récent', () => {
    const { g, boss } = bossOf(MAP_ZONE_BY_ID.phlegethon);
    isolate(g, boss, 8);
    const w = g.world;
    const st = boss.mapBoss!;
    const durs: number[] = [];
    for (let k = 0; k < 4; k++) {
      boss.freezeT = 40;
      st.lastFreeze = 0;
      boss.freezeT = 40;
      updateMapBoss(w, boss);
      durs.push(boss.freezeT);
      boss.freezeT = 0;
      st.lastFreeze = 0;
    }
    expect(durs[0]).toBe(40);
    expect(durs[1]).toBe(20);
    expect(durs[2]).toBe(10);
    expect(durs[3]).toBe(5);
    // remise à zéro après 10 s sans contrôle
    st.ccTick = w.tick - 11 * TICK_HZ;
    boss.freezeT = 40;
    updateMapBoss(w, boss);
    expect(boss.freezeT).toBe(40);
  });

  it('laisse : le joueur qui quitte l’arène laisse le boss rentrer et regagner sa vie lentement, sans invulnérabilité', () => {
    const { g, boss } = bossOf(MAP_ZONE_BY_ID.phlegethon);
    isolate(g, boss, 8);
    const w = g.world;
    const st = boss.mapBoss!;
    boss.speed = st.baseSpeed = 3;
    updateMapBoss(w, boss);
    expect(st.engaged).toBe(true);
    boss.hp = boss.hpMax * 0.5;
    // le boss a été attiré hors de son point d'apparition
    boss.x = boss.px = boss.spawnX + 3;
    // joueur loin de l'arène
    const far = w.grid.nearestFree(boss.spawnX + MAP_BOSS_LEASH_R + 15, boss.spawnY, 20) ?? w.grid.nearestFree(boss.spawnX - MAP_BOSS_LEASH_R - 15, boss.spawnY, 20)!;
    w.player.x = w.player.px = far.x;
    w.player.y = w.player.py = far.y;
    for (let k = 0; k < 5 * TICK_HZ; k++) w.step(1);
    expect(st.leashed).toBe(true);
    expect(boss.hp).toBeGreaterThan(boss.hpMax * 0.5);
    expect(boss.hp).toBeLessThan(boss.hpMax * 0.65);
    expect(Math.hypot(boss.x - boss.spawnX, boss.y - boss.spawnY)).toBeLessThan(3);
    // toujours vulnérable
    const hp = boss.hp;
    w.hurtMonster(boss, { phys: 0, fire: 500, cold: 0, light: 0, poison: 0, magic: 0, spell: true });
    expect(boss.hp).toBeLessThan(hp);
  });

  it('mort : bannière « Boss vaincu », renforts effondrés, run terminée', () => {
    const { g, boss } = bossOf(MAP_ZONE_BY_ID.zoltun_kulle);
    isolate(g, boss, 8);
    const w = g.world;
    const st = boss.mapBoss!;
    updateMapBoss(w, boss);
    boss.hp = boss.hpMax * 0.7;
    w.step(1);
    expect(st.adds.length).toBeGreaterThan(0);
    w.events.drain();
    w.killMonster(boss, w.player);
    const ev = w.events.drain();
    expect(ev.some((e) => e.t === 'mapEvent' && e.text.startsWith('Boss vaincu'))).toBe(true);
    expect(ev.some((e) => e.t === 'runComplete')).toBe(true);
    for (const id of st.adds) expect(w.monsters.find((m) => m.id === id)?.dead).toBe(true);
    expect(w.areas.some((a) => a.owner === boss.id && !a.dead)).toBe(false);
  });

  it('coût par tick négligeable', () => {
    const { g, boss } = bossOf(MAP_ZONE_BY_ID.phlegethon);
    isolate(g, boss, 8);
    const w = g.world;
    updateMapBoss(w, boss);
    const t0 = performance.now();
    for (let k = 0; k < 20000; k++) updateMapBoss(w, boss);
    const per = (performance.now() - t0) / 20000;
    expect(per).toBeLessThan(perfMs(0.05));
  });

  it('le boss reste sauvegardable (état de données simples)', () => {
    const { boss } = bossOf(MAP_ZONE_BY_ID.phlegethon);
    const copy = structuredClone({ ...boss, def: undefined });
    expect(copy.mapBoss).toEqual(boss.mapBoss);
  });
});

describe('Boss de carte : butin', () => {
  const cls = (items: Item[]) => {
    const r = { items: items.length, gear: 0, rarePlus: 0, us: 0, runes: 0, maps: 0, orbs: 0, gems: 0, gold: 0 };
    for (const it of items) {
      if (it.map) r.maps++;
      else if (it.base.startsWith('orb_') || it.base === 'worldstone_shard') r.orbs++;
      else if (RUNE_BY_ID[it.base]) r.runes++;
      else if (it.base.startsWith('gem_')) r.gems++;
      else if (it.base === 'gold') r.gold++;
      else if (it.quality === 'unique' || it.quality === 'set' || it.quality === 'rare' || it.quality === 'magic') {
        r.gear++;
        if (it.quality !== 'magic') r.rarePlus++;
        if (it.quality === 'unique' || it.quality === 'set') r.us++;
      }
    }
    return r;
  };

  it('500 morts par palier : objets garantis, un rare au moins, unique/ensemble fréquent, runes, cartes et orbes inchangés', () => {
    for (const id of ['phlegethon', 'throne_insanity', 'blood_moon', 'plains_torment']) {
      const z = MAP_ZONE_BY_ID[id];
      const { g, boss } = bossOf(z);
      const w = g.world;
      const N = 500;
      const sum = { items: 0, gear: 0, us: 0, runes: 0, maps: 0, orbs: 0, gems: 0, gold: 0 };
      for (let i = 0; i < N; i++) {
        const r = cls(rollMonsterDrops(w, boss));
        expect(r.gear, id).toBeGreaterThanOrEqual(MAP_BOSS_LOOT.items[z.tier]);
        expect(r.rarePlus, id).toBeGreaterThanOrEqual(1);
        expect(r.gems, id).toBe(1);
        for (const k of Object.keys(sum) as (keyof typeof sum)[]) sum[k] += r[k];
      }
      const avg = (k: keyof typeof sum) => sum[k] / N;
      expect(avg('items'), id).toBeGreaterThanOrEqual(MAP_BOSS_LOOT.items[z.tier] + 4);
      expect(avg('us'), id).toBeGreaterThan(MAP_BOSS_LOOT.uniqueSet[z.tier] * 0.85);
      expect(avg('runes'), id).toBeGreaterThan(MAP_BOSS_LOOT.rune[z.tier] * 0.85);
      // cartes (1,2 × RATES.maps par boss, sans la division de densité) et orbes (0,8 × RATES.orbs), inchangés
      expect(avg('maps'), id).toBeCloseTo(1.2 * RATES.maps, 0);
      expect(avg('orbs'), id).toBeGreaterThan(Math.min(1, 0.8 * RATES.orbs) * 0.8);
    }
  });

  it('palier croissant : plus d’objets et plus d’uniques au donjon qu’au palier 1', () => {
    expect(MAP_BOSS_LOOT.items[4]).toBeGreaterThan(MAP_BOSS_LOOT.items[1]);
    expect(MAP_BOSS_LOOT.uniqueSet[4]).toBeGreaterThan(MAP_BOSS_LOOT.uniqueSet[1]);
  });
});
