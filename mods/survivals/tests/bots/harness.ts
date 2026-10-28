/**
 * Bot of the Survivals mode: a character of the mode played by the automatic controls (rule `game.autopilot`: the bot's brain plus the
 * survival movement), which answers its level-up cards with its build plan as the "automatic choice" setting does (ui/levelup.ts,
 * `autoAnswer`: the plan's skill, else the free reroll, else the point kept for the plan in town), takes the loot of a cleared round as the end-of-round
 * screen's "Take all" does, prepares in town as the base's bots do (gear,
 * potions, repairs) in the town of the act (Rogue Encampment, Lut Gholein, Kurast Docks, Pandemonium Fortress, Harrogath), then starts the
 * round to resume (the last checkpoint), round after round, until the last round asked for is cleared (an act's boss, Baal for the whole
 * campaign) or time runs out. Deaths only lose the round, as for a player. A bot that loses the same round `FARM_AFTER` times in a row
 * goes back once, as a Diablo II player would, to the cleared round of the highest monster level `FARM_BELOW` levels below its own (in a lower
 * difficulty when none of its own is: a character that has just opened Hell farms Nightmare; after 2 deaths already when it is
 * `FARM_UNDER` levels below the round's recommended level), and stays
 * `FARM_SECONDS` in its overtime (experience, gold, gear) before trying again: without it, a round with nothing else to kill (Duriel in
 * his chamber) can be lost forever (lot 280: a Sorceress died 497 times there, level 24, no gold left for potions).
 */
import type { Game } from '../../../../src/sim/game';

export interface ActReport {
  cleared: boolean;
  /** Game time (seconds) */
  seconds: number;
  deaths: number;
  rounds: number;
  level: number;
  checkpoints: { round: string; minute: number; level: number }[];
  /** Live monsters at most during the play, and steps simulated */
  maxAlive: number;
  steps: number;
  /** By act reached: hours of play when its boss died (cumulated), deaths in the act, level then */
  acts: { act: number; hours: number; deaths: number; level: number }[];
  /** Round being played when time ran out */
  stuck?: string;
  /** Deaths by round */
  roundDeaths: Record<string, number>;
  /** Farming rounds played (see FARM_AFTER), rounds left after GIVE_UP_SECONDS */
  farms: number;
  givenUp: number;
  /** Towns the character was in between rounds (the act's: the Rogue Encampment `act1` to Harrogath `act5`) */
  towns: string[];
  /** Seconds played in rounds, and those with the mana below 10 % (lot 284: mana starvation measured) */
  roundSeconds: number;
  lowMana: number;
}

/** Deaths in a row in the same round before a farming round, and seconds of overtime farmed */
export const FARM_AFTER = 6;
export const FARM_SECONDS = 240;
/** Levels below the character of the round farmed (a cleared round has no mercy left: its full population for a stronger character) */
export const FARM_BELOW = 4;
/**
 * A character this many levels below the round's recommended level farms after 2 deaths in a row already (measured, lot 282: characters
 * that opened Hell at level 60 to 64 never gained a level there, Hell's death penalty taking back what its rounds gave)
 */
export const FARM_UNDER = 5;
/** Seconds after which a round not cleared is left (back to town) */
export const GIVE_UP_SECONDS = 25 * 60;

export async function playAct(g: Game, opts: { maxSeconds: number; difficulty?: 0 | 1 | 2; lastRound?: string }): Promise<ActReport> {
  const AP = await import('../../sim/autopilot');
  const LO = await import('../../sim/loot');
  const LU = await import('../../ui/levelup');
  const CP = await import('../../sim/checkpoints');
  const { TICK_HZ } = await import('../../../../src/sim/constants');
  const { ROUND_BY_ID } = await import('../../data/chapters');
  const d = opts.difficulty ?? 0;
  const last = opts.lastRound ?? 'a1r7';
  const rep: ActReport = {
    cleared: false,
    seconds: 0,
    deaths: 0,
    rounds: 0,
    level: 0,
    checkpoints: [],
    maxAlive: 0,
    steps: 0,
    acts: [],
    roundDeaths: {},
    farms: 0,
    givenUp: 0,
    towns: [],
    roundSeconds: 0,
    lowMana: 0,
  };
  const Z = await import('../../sim/zones');
  let streak = 0;
  let streakRound = '';
  let farming = false;
  let actDeaths = 0;
  const brain = AP.brainOf(g);
  for (let t = 0; t < opts.maxSeconds * TICK_HZ; t++) {
    if (g.mode === 'town' && !g.world.player.dead) {
      if (!rep.towns.includes(g.lastTown)) rep.towns.push(g.lastTown);
      if (CP.checkpointDone(g.character, d, last)) {
        rep.cleared = true;
        break;
      }
      brain.town();
      const resume = CP.resumeRound(g.character, d);
      // the cleared round of the highest monster level FARM_BELOW levels below the character, in this difficulty or a lower one (in Hell,
      // as a Diablo II player farms Nightmare: every Hell round is above a character that has just opened it)
      const under = g.character.level < resume.recLevel[d] - FARM_UNDER;
      const farm =
        (streak >= FARM_AFTER || (under && streak >= 2)) && streakRound === resume.id
          ? ([0, 1, 2] as const)
              .filter((dd) => dd <= d)
              .flatMap((dd) => CP.roundStatus(g.character, dd).map((st) => ({ ...st, dd, lvl: Z.roundLevels(st.round)[dd] })))
              .filter((st) => st.done && !st.round.boss && st.lvl <= g.character.level - FARM_BELOW)
              .sort((a, b) => b.lvl - a.lvl || b.dd - a.dd)[0]
          : undefined;
      streak = farm ? 0 : streak;
      farming = !!farm;
      if (farm) rep.farms++;
      g.startRun(`survivals:${(farm?.round ?? resume).id}`, farm?.dd ?? d);
      rep.rounds++;
    }
    if (g.offers.length) LU.autoAnswer(g);
    for (const e of g.step(1)) {
      if (e.t === 'playerDeath') {
        rep.deaths++;
        actDeaths++;
        const r = g.runDef?.id.slice(10) ?? '?';
        rep.roundDeaths[r] = (rep.roundDeaths[r] ?? 0) + 1;
        if (!farming) {
          streak = r === streakRound ? streak + 1 : 1;
          streakRound = r;
        }
      }
      if (e.t === 'runComplete' && e.runId.startsWith('survivals:') && !farming) {
        const round = ROUND_BY_ID[e.runId.slice(10)];
        rep.checkpoints.push({ round: round.id, minute: Math.round(t / TICK_HZ / 6) / 10, level: g.character.level });
        streak = 0;
        if (round.boss) {
          rep.acts.push({ act: round.act, hours: +(t / TICK_HZ / 3600).toFixed(2), deaths: actDeaths, level: g.character.level });
          actDeaths = 0;
        }
      }
    }
    rep.steps++;
    if (t % TICK_HZ === 0) {
      rep.maxAlive = Math.max(rep.maxAlive, g.world.monsters.filter((m) => !m.dead && m.team === 1 && !m.pet && !m.isSummon).length);
      const p = g.world.player;
      if (g.mode === 'run' && !p.dead) {
        rep.roundSeconds++;
        if (p.mana < p.manaMax * 0.1) rep.lowMana++;
      }
    }
    // round cleared: back to town after a few seconds of loot (the end-of-round screen is the player's)
    const run = g.world.run;
    // a round not cleared after 25 min: back to town (a player gives up too), and try again
    if (g.mode === 'run' && run && !run.completed && g.world.tick - run.startTick > TICK_HZ * GIVE_UP_SECONDS) {
      rep.givenUp++;
      g.townPortal();
    }
    if (g.mode === 'run' && run?.completed && g.world.tick - run.completeTick > TICK_HZ * (farming ? FARM_SECONDS : 5)) {
      // the end-of-round screen takes what is left on the ground (worn in an empty slot, kept or turned into gold), then the portal
      LO.collectAll(g);
      farming = false;
      g.townPortal();
    }
  }
  rep.seconds = rep.steps / TICK_HZ;
  rep.level = g.character.level;
  if (!rep.cleared) rep.stuck = CP.resumeRound(g.character, d).id;
  return rep;
}

/** One run of the Run mode (lot 289) played by the bot: how it ended */
export interface RunReport {
  outcome: 'victory' | 'death' | 'left' | 'timeout';
  act: number;
  d: number;
  /** Zone reached (1-based) of the act's zones */
  zone: number;
  zones: number;
  level: number;
  kills: number;
  /** Game seconds of the run */
  seconds: number;
  gold: number;
  items: number;
  /** Gold paid at the vendor before the run */
  spent: number;
  /** Power of the gear worn at the run's start (`gearPower`, lot 294: the curve of the loot run after run) */
  power?: number;
  /** Killer of a death (monster id) */
  killer?: string;
  /** Kills in the run's first minute (lot 303: the kills a second past the gentle first minute) */
  kills60?: number;
  /** Lot 308: the training's ranks owned at the run's start, and the gold paid for them before it */
  ranks?: number;
  forgeSpent?: number;
}

/**
 * Lot 308: the bot's training between runs (`opts.forge`), as a player sharing the purse with the shop: the cheapest next rank while it
 * costs at most `share` of the gold left. Returns the gold paid
 */
export async function forgeRun(g: Game, share: number): Promise<number> {
  const F = await import('../../sim/forge');
  const c = g.character;
  let paid = 0;
  for (;;) {
    const next = F.FORGE.map((f) => ({ id: f.id, cost: F.nextCost(c, f.id) }))
      .filter((x): x is { id: typeof x.id; cost: number } => x.cost !== null && x.cost <= c.gold * share)
      .sort((a, b) => a.cost - b.cost)[0];
    if (!next || !F.buyRank(c, next.id)) return paid;
    paid += next.cost;
  }
}

/** The run's loot sorted between runs as a player would (lot 293): what gains is worn, the rest sold (the bag and the temporary pages) */
export async function sortLoot(g: Game): Promise<void> {
  const SH = await import('../../sim/shop');
  const RMm = await import('../../sim/runmode');
  if (!RMm.isRunMode(g.character)) return;
  // lot 293: the run's loot sorted as a player would: what gains is worn, the rest sold (the bag and the temporary pages)
  const RL = await import('../../sim/runloot');
  const c = g.character;
  for (let i = RL.lootPages(c).length - 1; i >= 0; i--) RL.pageToBag(c, i);
  for (let i = 0; i < c.inventory.length; i++) {
    const it = c.inventory[i];
    if (!it) continue;
    // never another kind of weapon than the one worn (the build's skills need theirs)
    const { BASE_BY_ID } = await import('../../../../src/data/items/bases');
    const wb = c.equipment.mainhand ? BASE_BY_ID[c.equipment.mainhand.base] : undefined;
    const ib = BASE_BY_ID[it.base];
    if (ib?.slot === 'mainhand' && wb && (ib.type !== wb.type || !!ib.twoHanded !== !!wb.twoHanded)) continue;
    if ((SH.gainOf(g, it) ?? 0) > 0) SH.equipFromBag(g, i);
  }
  for (let i = 0; i < c.inventory.length; i++) {
    const it = c.inventory[i];
    if (it && SH.gainOf(g, it) !== null && (SH.gainOf(g, it) ?? 0) <= 0) g.sell(i);
  }
  while (RL.lootPages(c).length) RL.sellFromPages(g, 0);
}

/**
 * The bot's shopping in the hub between runs (lot 289), as a player spending a run's gold: a weapon builds (melee, bow and javelin) buys
 * the vendor's weapon of its class and of the kind worn that hits hardest (no requirement in Survivals, lot 290: active at once), when it
 * hits harder than the one worn and the gold is there. Returns the price paid (0: nothing bought)
 */
export async function shopRun(g: Game): Promise<number> {
  // lot 292: the hub's shop (sim/shop.ts): the best buy the purse pays, worn at once (any build, any slot)
  const SH = await import('../../sim/shop');
  const RMm = await import('../../sim/runmode');
  if (RMm.isRunMode(g.character)) {
    let spent = 0;
    for (let k = 0; k < 3; k++) {
      const best = SH.bestBuy(g);
      if (!best?.affordable) break;
      if (!SH.buyShop(g, best.idx).ok) break;
      spent += best.price;
    }
    return spent;
  }
  const { computeDerived, canWear } = await import('../../../../src/sim/character');
  const { baseOf } = await import('../../../../src/sim/itemstats');
  const { classCanUse } = await import('../../../../src/data/classes');
  const { buildOf } = await import('../../sim/autopilot');
  const build = buildOf(g);
  if (!['whirlwind', 'frenzy', 'zealot', 'hammerdin', 'bowazon', 'javazon', 'martial', 'bear'].includes(build)) return 0;
  const c = g.character;
  // the damage of a weapon (at the act's end: level and attributes)
  const hit = (it: import('../../../../src/sim/item').Item | undefined): number => {
    if (!it) return 0;
    const clone = { ...c, level: 20, base: { ...c.base, str: 150, dex: 150 }, equipment: { ...c.equipment, mainhand: it } };
    if (baseOf(it).twoHanded) delete clone.equipment.offhand;
    const d = computeDerived(clone, 0);
    return (d.weaponDmg[0] + d.weaponDmg[1]) / 2;
  };
  const worn = hit(c.equipment.mainhand);
  let best = -1;
  let bestHit = worn * 1.15;
  g.vendor.forEach((e, i) => {
    const b = baseOf(e.item);
    const wornKind = c.equipment.mainhand ? baseOf(c.equipment.mainhand).type : null;
    if (b.slot !== 'mainhand' || e.price > c.gold || !classCanUse(b, c.classId) || (wornKind && b.type !== wornKind) || !canWear(c, e.item).ok) return;
    const h = hit(e.item);
    if (h > bestHit) [best, bestHit] = [i, h];
  });
  if (best < 0) return 0;
  const price = g.vendor[best].price;
  const item = g.vendor[best].item;
  if (!g.buy(best).ok) return 0;
  const idx = c.inventory.indexOf(item);
  if (idx < 0 || !g.equip(idx, 'mainhand').ok) return 0;
  return price;
}

/**
 * Runs of the Run mode played by the bot from the hub (lot 289): each run starts at the act's entry level with the gear kept from the
 * previous ones (picked up in the runs: worn in an empty slot or in place of a clearly worse item, or kept), the cards answered by the
 * class's plan (`autoAnswer`), the zones chained until the act's boss or the death. Between runs a weapon build buys a weapon (`shopRun`);
 * the base bot's town routine is not used (the run's gear is the loot walked over and the vendor's weapon)
 */
export async function playRuns(
  g: Game,
  opts: { runs: number; act?: number; difficulty?: 0 | 1 | 2; maxRunSeconds?: number; stopOnWin?: boolean; shop?: boolean; ladder?: boolean; forge?: boolean },
): Promise<RunReport[]> {
  const LU = await import('../../ui/levelup');
  const RM = await import('../../sim/runmode');
  const RH = await import('../../ui/runhub');
  const ST = await import('../../sim/state');
  const { gearPower } = await import('../../ui/sheet');
  const { TICK_HZ } = await import('../../../../src/sim/constants');
  const act = opts.act ?? 1;
  let d = opts.difficulty ?? 0;
  const out: RunReport[] = [];
  for (let n = 0; n < opts.runs; n++) {
    // lot 292, the endgame farm: each run in the highest difficulty whose act is open (Andariel opens the next one's Act I)
    if (opts.ladder) d = ([2, 1, 0] as const).find((x) => RM.actUnlocked(g.character, act, x)) ?? 0;
    // a run still open (a resumed save): ended first
    for (let k = 0; k < 5 && g.mode === 'run'; k++) g.townPortal();
    g.step(1);
    await sortLoot(g);
    // lot 308: the training first with half the purse, then the shop
    const forgeSpent = opts.forge ? await forgeRun(g, 0.5) : 0;
    const spent = opts.shop ? await shopRun(g) : 0;
    const F = await import('../../sim/forge');
    const ranks = F.FORGE.reduce((a, f) => a + F.forgeRank(g.character, f.id), 0);
    RM.ensureStarterKit(g.character);
    const power = gearPower(g.character);
    if (!RH.playRun(g, act, d)) throw new Error(`run refused: act ${act} difficulty ${d}`);
    const gold0 = g.character.gold;
    let t = 0;
    let kills60: number | undefined;
    const max = (opts.maxRunSeconds ?? 3 * 3600) * TICK_HZ;
    for (; t < max && RM.runActive(g.character); t++) {
      if (g.offers.length) LU.autoAnswer(g);
      g.step(1);
      if (t === 60 * TICK_HZ && g.mode === 'run') kills60 = g.world.stats.kills;
    }
    if (RM.runActive(g.character)) {
      g.townPortal();
      g.step(1);
      const e = ST.stateOf(g).runEnd!;
      out.push({
        outcome: 'timeout',
        act,
        d,
        zone: e.zoneIndex,
        zones: e.zones,
        level: e.level,
        kills: e.kills,
        seconds: t / TICK_HZ,
        gold: g.character.gold - gold0,
        items: e.items,
        spent,
        power,
        ranks,
        forgeSpent,
      });
      continue;
    }
    // lot 305: a victory's end is held over the boss's zone (`endHere`, the end screen there); lot 306: read it too (tools/tiers.ts
    // stopped at the first victory) and leave the zone as the screen's "Hub" does
    const st = ST.stateOf(g);
    const e = (st.runEnd ?? st.endHere)!;
    if (st.endHere) {
      st.endHere = null;
      if (g.mode === 'run') g.townPortal();
      g.step(1);
    }
    out.push({
      outcome: e.outcome,
      act,
      d,
      zone: e.zoneIndex,
      zones: e.zones,
      level: e.level,
      kills: e.kills,
      seconds: t / TICK_HZ,
      gold: e.gold,
      items: e.items,
      spent,
      power,
      ranks,
      forgeSpent,
      ...(kills60 !== undefined ? { kills60 } : {}),
      ...(e.killer ? { killer: e.killer.monster } : {}),
    });
    if (opts.stopOnWin && e.outcome === 'victory') break;
  }
  return out;
}
