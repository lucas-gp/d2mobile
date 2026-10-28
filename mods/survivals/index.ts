/**
 * Content of the Survivals mode, registered over the base when the ruleset `d2+survivals` is activated (src/mods/activate.ts). It only
 * replaces the game-mode hooks of the base (docs/MODS.md, "Game-mode hooks"), adds its rounds to the `runs` registry and its screens to
 * the UI slots; the content rules (loot, experience, skills, monsters) stay those of the content ruleset. See README.md.
 */
import type { ModApi, ModContent } from '../../src/mods/api';
import { castFrames, REGISTRIES, scalePacket, TICK_HZ } from '../../src/mods/sdk';
import { onScreen, setView } from './sim/view';
import { autopilot, inRound, noteCast, rotationEvery, swingOf } from './sim/autopilot';
import { drawOffer } from './sim/offer';
import { act4Levels } from './data/act4';
import { collectAll, noConsumable, registerLoot, stripConsumables } from './sim/loot';
import { BEST_LEVEL, classTakenAt, FLOW, floorCast, flowActSec, flowFrames, flowMissiles, inFlow, isRunMode, nextRunZone, runStep, setVariant } from './sim/runmode';
import { registerRounds } from './sim/rounds';
import { ROUNDS } from './data/chapters';
import { sellPriceOf } from './sim/economy';
import { gambleRoll, shopRules } from './sim/shop';
import { compareRows, gearSheet } from './ui/sheet';
import { inRoundWorld, MANA, setCurrentGame, setting, SETTINGS, stateOf } from './sim/state';
import { loadLevel, roundLimits } from './sim/adaptive';
import { watchLosses } from './sim/lost';
import { hudHidden, hudWidget } from './ui/hud';
import { levelUpCards, spendKeptInTown } from './ui/levelup';
import { recapScreen } from './ui/recap';
import { runCard } from './ui/charcard';
import { helpScreen, settingsLayout } from './ui/menu';
import { joystickPlace } from './ui/controls';
import { waypointSection } from './ui/waypoint';
import EN from './i18n/en.json';

/**
 * Least number of world units across the shorter side of the window (wider view than the base in portrait and on small screens; lot 287,
 * owner's comparison with another survivors game: 16 instead of 12, more ground and more monsters on screen)
 */
export const MIN_VIEW_UNITS = 16;
/** Lowest zoom: at the "high" quality (internal resolution 2) a sprite's pixel still covers a pixel of the screen, never dropped */
export const MIN_ZOOM = 0.5;
/** Pixels per world unit at zoom 1 (docs: 45.25) */
const PX_PER_UNIT = 45.25;

/** Camera zoom of the mode: never narrower than `MIN_VIEW_UNITS` units across the shorter side, not below `MIN_ZOOM` */
export function survivalsZoom(base: number, view: { width: number; height: number }): number {
  const fit = Math.min(view.width, view.height) / (PX_PER_UNIT * MIN_VIEW_UNITS);
  return Math.max(MIN_ZOOM, Math.min(base, fit));
}

/**
 * Lot 301: a monster's target held 1 s, another taken 2 units nearer, and never a creature of the hero (owner: "they must always come at
 * the hero"; the creatures jumping about, re-placed near him, turned the monsters back and forth): they still block the way (rule
 * `ai.targetLock`)
 */
const FLOW_TARGET_LOCK = Object.freeze({ hold: 25, margin: 2, petRange: -1 });

const content: ModContent = {
  register(api: ModApi) {
    api.i18n.add(EN);
    api.settings.declare(Object.fromEntries(Object.entries(SETTINGS).map(([k, v]) => [k, { app: v.app, values: v.values }])));
    // playable in portrait as in landscape (as Dragon Ball Survivors), with a wider camera
    api.rules.set('ui.orientation', () => () => 'any');
    // lot 301: the window and zoom told to the director, which brings the monsters in just beyond the screen (sim/view.ts)
    api.rules.set('render.zoom', () => (_g, base, view) => {
      const zoom = survivalsZoom(base, view);
      setView({ width: view.width, height: view.height, zoom });
      return zoom;
    });
    // during a round: corpses, projectiles and damage numbers drawn at most, by load level (sim/adaptive.ts); the base's drawing otherwise
    api.rules.set('render.limits', (prev) => (g) => roundLimits(inRound(g), loadLevel(setting(g, 'adaptive') === 'on')) ?? prev(g));
    // the rounds (runs `survivals:<round>`) and their director
    // Act IV's zones in the `levels` registry (Levels.txt), as the other acts' (data/act4.ts)
    for (const lv of act4Levels()) api.levels.add(lv);
    registerRounds(api);
    // Diablo II's quest drops of the act bosses and the super-uniques' own treasure classes (data/loot.ts)
    registerLoot(api);
    // controls (semi-automatic, automatic) and stat points by profile, before each step
    api.rules.set('game.autopilot', () => (g) => {
      setCurrentGame(g);
      // Run mode (lot 289): the zones chained, the run's end in town (sim/runmode.ts)
      runStep(g, (gg) => void collectAll(gg));
      // the hits taken and the death of a round, for the lost round's screen (sim/lost.ts)
      watchLosses(g);
      stripConsumables(g.character);
      // lot 294: no mana in Act I's flow, the gauge always full (a monster's mana burn, Energy Shield's absorption never leave it short)
      if (g.mode === 'run' && inFlow(g.world)) {
        g.world.player.mana = g.world.player.manaMax;
      }
      autopilot(g);
      spendKeptInTown(g);
    });
    // lot 300: the run's next zone named, its graphics prepared during the current one (no error at the passage)
    api.rules.set('game.nextZone', (prev) => (g) => nextRunZone(g) ?? prev(g));
    // lot 311: the Campaign's zones joined edge to edge are the base's; Survivals keeps its own flow (arenas, hub, portals)
    api.rules.set('world.seams', () => () => false);
    // lot 305 (owner: the loading of a run too long): the town under the Run's hub is never seen, its D2 map is not loaded
    api.rules.set('render.zoneHidden', (prev) => (g) => (g.mode === 'town' && isRunMode(g.character)) || prev(g));
    // lot 305 (a run's start too long): a Run character reads only the D2 maps of the mode's rounds (Act I: 7 of 35; the town under the
    // hub is never seen, the base's Harrogath stands for it); the Campaign keeps every map (its town is walked, Act I's needs them all)
    const wanted = new Set(ROUNDS.map((r) => r.map ?? r.zones[0]));
    api.rules.set('maps.wanted', (prev) => (g, id) => (!isRunMode(g.character) || wanted.has(id)) && prev(g, id));
    // lot 305 (owner: "I have trouble seeing the champions and bosses among the others"): the elites marked in the mode's arenas
    api.rules.set('render.eliteMarks', (prev) => (w) => w.zone.id.startsWith('survivals:') || prev(w));
    // level-up: three cards of the class's tree; during a round, the tree is read-only (points kept are spent in town)
    api.rules.set('skills.offer', () => (g, level, reroll) => drawOffer(g, level, reroll));
    api.rules.set('skills.manualLearn', () => (g) => (inRound(g) ? 'Pendant une manche, les points se dépensent avec les cartes' : null));
    api.ui.add('levelUp', (ctx) => levelUpCards(ctx));
    api.ui.add('run.complete', (ctx) => recapScreen(ctx));
    // lot 299: a Run character's card tells its progress, not its level (reset at each run)
    api.ui.add('charselect.card', (ctx) => runCard(ctx));
    api.ui.add('town.waypoint', (ctx) => waypointSection(ctx));
    api.ui.add('hud', (ctx) => hudWidget(ctx));
    api.ui.add('menu.buttons', { label: 'Survivals : comment jouer', run: ({ root }) => helpScreen(root) });
    // gear without restriction (lot 290, owner's order; Run and Campaign): any item of a slot is worn whatever its level, strength,
    // dexterity or class requirement, and counts at once (the base's rule `char.itemActive`: always); a mercenary's item stays his
    api.rules.set('char.equipNeedsReqs', () => () => false);
    api.rules.set('char.equipNeedsClass', () => () => false);
    // lot 295 (the hub's Mercenary tab): Diablo II's hirelings opened and priced by the best level reached in a run (the hero is level 1
    // between runs); the hireling's gear without requirements too (rule `char.equipNeedsReqs` above)
    api.rules.set('merc.hireLevel', (prev) => (c) => (isRunMode(c) ? Math.max(prev(c), c.progression.milestones[BEST_LEVEL] ?? 1) : prev(c)));
    // Run mode (lot 289, the default): no experience lost on death (the run ends, the level starts again at the next one)
    // Act I's flow (lot 291): the hero runs at about 4 units a second and keeps walking while he casts (the other game studied)
    api.rules.set('player.speed', (prev) => (w, base) => (inFlow(w) ? prev(w, base) * FLOW.speed : prev(w, base)));
    // lot 292b (owner's test: "while attacking the hero cannot move"): in every round of the mode the hero walks while he strikes or casts
    // (the walk drawn), and a hit never roots him (no hit recovery); the monsters chase him straight across the open arenas
    api.rules.set('player.castWhileMoving', (prev) => (w) => (inRoundWorld(w) && FLOW.castWhileMoving) || prev(w));
    api.rules.set('combat.playerHitRecovery', () => () => false, { override: true });
    // lot 298 (owner: "not every skill is cast, one cast holds the others"): in Act I's flow a skill asked while another one is cast goes
    // off beside it (`FLOW.parallel`), each skill on its own floor (`FLOW.minCast`, set at every cast: lot 294's floor kept by skill), the
    // rotation's log of the casts (sim/autopilot.ts)
    api.rules.set('player.parallelCast', (prev) => (w) => (inFlow(w) && FLOW.parallel) || prev(w));
    api.rules.set('skills.onCast', (prev) => (w, id, side) => {
      prev(w, id, side);
      if (!inFlow(w)) return;
      // lot 301: only this skill's own cooldown (lot 298's `castGap` on the other spells is gone)
      // lot 309: and never before its cast animation is played twice over (`FLOW.animK`)
      floorCast(w, id, swingOf(id), rotationEvery(id) * (FLOW.classSpell[w.character.classId] ?? 1), castFrames(w, id) / TICK_HZ);
      noteCast(w, id);
    });
    api.rules.set('ai.directChase', () => (w) => inRoundWorld(w));
    // lot 301 (owner: "the monsters come at the hero then turn back"): in Act I's flow a monster keeps its target 1 s at least and takes
    // another one only 2 units nearer (it went back and forth between the hero and his creatures), and the Fallen never panic at a
    // Fallen's death (a field of a hundred dying: they kept turning back); the shooters' distance and the fears cast stay
    api.rules.set('ai.targetLock', (prev) => (w, m) => (inFlow(w) ? FLOW_TARGET_LOCK : prev(w, m)));
    api.rules.set('ai.allyDeathFlee', (prev) => (w, m) => !inFlow(w) && prev(w, m));
    // lot 301: brought beyond the screen, a monster walks in `FLOW.offscreenSpeed` times quicker while off it (the field's pressure of
    // lot 300's ring kept: a hero four units a second outran them from that far)
    api.rules.set('ai.chaseSpeed', (prev) => (w, m, d) => {
      const k = prev(w, m, d);
      if (!inFlow(w) || FLOW.offscreenSpeed === 1 || d < 8) return k;
      const p = w.player;
      return onScreen(m.x - p.x, m.y - p.y) ? k : k * FLOW.offscreenSpeed;
    });
    // lot 294: the class's own factor on the monsters' hits in Act I's flow (`FLOW.classTaken`), their missiles' (`FLOW.missileDmg`; lot 303:
    // a melee class's own on them, `FLOW.classMissile`)
    api.rules.set(
      'combat.monsterHitPacket',
      (prev) => (w, p, src) => {
        const out = prev(w, p, src);
        const cls = w.character.classId;
        const k = inFlow(w) ? classTakenAt(cls, flowActSec(w)) * (p.ranged ? FLOW.missileDmg * (FLOW.classMissile[cls] ?? 1) : 1) : 1;
        return k === 1 ? out : scalePacket(out, k);
      },
      { override: true },
    );
    // lot 294: in Act I's flow the archers and casters aim ahead of the walking hero (`FLOW.missileLead`)
    api.rules.set('ai.missileLead', (prev) => (w, m) => (inFlow(w) ? FLOW.missileLead : prev(w, m)));
    // lot 292b (owner: "the mana goes down too fast"): skills cost a small share of their mana in a round (sim/state.ts `MANA`); lot 294
    // (owner: "no mana, as the other game"): nothing in Act I's flow of the Run
    api.rules.set('skills.manaCost', (prev) => (w, id, cost) => (inFlow(w) ? prev(w, id, cost) * MANA.flow : inRoundWorld(w) ? prev(w, id, cost) * MANA.share : prev(w, id, cost)));
    // lot 292c (owner, after the other game: "the hero attacks very fast and never stops"): a quicker cadence of strikes and casts in Act I's flow
    // lot 292c: a melee blow strikes the monsters around its target too (the base's splash, PD2's rule), in every Survivals round
    api.rules.set('combat.weaponSplash', (prev) => () => FLOW.splash || prev(), { override: true });
    // lot 294: in Act I's flow the hero's arrows and bolts pass through the fodder (`FLOW.pierce`)
    api.rules.set('combat.missilePierce', (prev) => (w, kind) => (inFlow(w) ? Math.max(kind.includes('arrow') ? FLOW.pierceArrows : FLOW.pierce, prev(w, kind)) : prev(w, kind)));
    // lot 309 (owner: "Charged Bolt spams"): a several-missile skill fires `FLOW.boltRate` missiles a second at most, each heavier by as much
    api.rules.set('skills.missileCount', (prev) => (w, id, n) => (inFlow(w) ? flowMissiles(w.character.classId, id, prev(w, id, n)) : prev(w, id, n)));
    api.rules.set(
      'skills.castFrames',
      (prev) => (w, id, frames) => (inFlow(w) ? flowFrames(w.character.classId, id, prev(w, id, frames), id === 'attack' || !!REGISTRIES.skills.get(id)?.melee) : prev(w, id, frames)),
    );
    api.rules.set('death.xpPenalty', (prev) => (c, d) => (isRunMode(c) ? 0 : prev(c, d)));
    api.ui.add('create.character', ({ game, variant }) => {
      // Run (default) or Campaign, as picked on the creation screen (manifest's variants)
      setVariant(game.character, variant);
      // a new character starts in the Rogue Encampment, where the act's rounds begin; no potion nor key in the mode
      game.lastTown = 'act1';
      // lot 291 (the other game studied: neither damage numbers nor screen shake), by default; the settings change them
      game.settings.damageNumbers = false;
      game.settings.screenShake = 0;
      stripConsumables(game.character, true);
      // straight into the first round (the hub starts it: ui/hub.ts)
      stateOf(game).autoStart = true;
    });
    // no potion, key nor tome sold (the mode drops none either: sim/loot.ts)
    api.rules.set('shop.consumable', () => (_g, id) => !noConsumable(id));
    // Run mode's economy (lot 292, sim/economy.ts): the shop pays a fifth of its own price; the Campaign keeps the base's prices
    api.rules.set('shop.sellPrice', (prev) => (g, item, price) => (isRunMode(g.character) ? sellPriceOf(item, prev(g, item, price)) : prev(g, item, price)));
    // the hub's shop (lot 292, sim/shop.ts): a stock of the class at each run's end, Diablo II's gamble odds at the stall's level
    api.rules.set('shop.vendorStock', () => shopRules.vendorStock);
    api.rules.set('shop.gambleStock', () => shopRules.gambleStock);
    api.rules.set('shop.gambleRoll', (prev) => (g, rng) => (isRunMode(g.character) ? gambleRoll(g.character, rng) : prev(g, rng)));
    // items compared with the worn ones: the damage, its speed, the damage reduction and the block too (lot 292)
    api.rules.set('ui.compareRows', () => compareRows);
    // a long press on an item's cell equips it (lot 292: one thumb), as the double tap
    api.rules.set('ui.holdToAct', () => () => true);
    api.ui.add('character.sheet', (ctx) => gearSheet(ctx.game));
    // in a round, the controls on screen: the joystick, the attack and the skills bound, the mode's pause button (ui/hud.ts); the HUD's
    // gauges stay. In town, the hub covers the town (ui/hub.ts)
    api.rules.set('ui.hudHidden', () => (g) => hudHidden(g));
    // the settings panel: the mode's own settings and a few of the base's, on one page (ui/menu.ts)
    // the floating joystick where the thumb touches: the centre of a screen held upright, by default (ui/controls.ts)
    api.rules.set('ui.joystick', () => (g, view) => joystickPlace(g, view));
    const layout = settingsLayout();
    api.rules.set('ui.settings', () => () => layout);
  },
};

export default content;
