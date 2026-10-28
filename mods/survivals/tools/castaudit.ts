/**
 * Lot 309 (owner: "Charged Bolt seems to spam its spells too fast, check every spell"): every damaging skill a Run can offer, one at a
 * time, in a fresh run of Act I's flow (no other skill), cast again as soon as the mode lets it at a pack of five sandbags (zombies whose
 * life is restored every step, the first 3 units away, 1 for a melee strike: `sim/cadence.ts` `castPack`), in three set-ups: the skill's
 * own level with 1 point (`low`), level 15 with 5 points (`mid`, the Run's rank cap), and `mid` with 20 % faster cast rate (`fcr`, a
 * tier-3 set of gear's). One JSON line a skill and set-up: seconds between two casts, Diablo II's cast animation (FCR 0), the mode's
 * floor, missiles a cast and a second, the damage a second on the first sandbag and on the five.
 *   npx tsx mods/survivals/tools/castaudit.ts [classes=all] [setups=low,mid,fcr] [seconds=12]
 * `SV_FLOW` overrides the tuning (sim/runmode.ts), e.g. SV_FLOW='{"animFloor":0}' for lot 308's floors.
 */
import { activateForTools } from '../../../tools/mods/node';

await activateForTools('d2+survivals');
const { Game } = await import('../../../src/sim/game');
const { withDefaultSettings } = await import('../../../src/sim/save');
const { setDurabilityEnabled } = await import('../../../src/sim/durability');
const { castFrames } = await import('../../../src/sim/skills');
const { TICK_HZ } = await import('../../../src/sim/constants');
const { REGISTRIES } = await import('../../../src/mods/sdk');
const RM = await import('../sim/runmode');
const { castPack, auditedSkills, meleeAttack } = await import('../sim/cadence');
if (process.env.SV_FLOW) Object.assign(RM.FLOW, JSON.parse(process.env.SV_FLOW) as object);

const ALL = ['amazon', 'assassin', 'barbarian', 'druid', 'necromancer', 'paladin', 'sorceress'];
const [clsS = 'all', setupsS = 'low,mid,fcr', secS = '12'] = process.argv.slice(2);
setDurabilityEnabled(false);

for (const cls of clsS === 'all' ? ALL : clsS.split(',')) {
  for (const id of auditedSkills(cls, 30)) {
    const req = REGISTRIES.skills.get(id)?.reqLvl ?? 1;
    for (const setup of setupsS.split(',')) {
      const g = new Game(undefined, cls as never, true);
      RM.setVariant(g.character, 'run');
      g.settings = withDefaultSettings({ ...g.settings, mods: { survivals: { control: 'semi', density: 90 } } } as never, true);
      RM.startRunMode(g, 1, 0);
      g.takeOffer(null);
      g.character.level = setup === 'low' ? Math.max(1, req) : Math.max(15, req);
      const r = castPack(g, id, setup === 'low' ? 1 : 5, Number(secS), setup === 'fcr' ? 20 : 0);
      if (!r) continue;
      const w = g.world;
      console.log(
        JSON.stringify({
          cls,
          skill: id,
          setup,
          level: g.character.level,
          d2Sec: +(castFrames(w, id) / TICK_HZ).toFixed(2),
          floorSec: id === 'attack' || meleeAttack(cls, id) ? RM.minCastOf(id, true) : +Math.max(RM.spellCooldown(id, cls), (RM.FLOW.animK ?? 0) * (castFrames(w, id) / TICK_HZ)).toFixed(2),
          everySec: r.every === null ? null : +r.every.toFixed(2),
          casts: r.casts,
          missilesPerCast: +r.missiles.toFixed(1),
          missilesPerSec: r.every ? +(r.missiles / r.every).toFixed(2) : null,
          dps1: Math.round(r.dps1),
          dps5: Math.round(r.dps),
        }),
      );
    }
  }
}
process.exit(0);
