/**
 * Chaque compétence produit son effet dans la simulation, jouée par sa classe (Diablo II : 30 par classe ; arbres PD2 S13 avec le
 * mod) : dégâts sur la cible, aura/armure/forme
 * active, invocation, déplacement, bonus passif.
 */
import { describe, expect, it } from 'vitest';
import { withoutPd2 } from '../needs-pd2';
import { SKILLS, SKILL_BY_ID, classSkills, ramp } from '../../src/data/skills';
import { CLASS_IDS, TREE_CLASS, type ClassId } from '../../src/data/classes';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, xpToReach } from '../../src/sim/progression';
import { computeDerived } from '../../src/sim/character';
import { hasBuff } from '../../src/sim/skills';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { weaponMastery } from '../../src/sim/melee';
import { weaponKindsFor } from '../../src/sim/weaponreq';
import { minionStats } from '../../src/sim/minions';
import type { DerivedStats } from '../../src/sim/derived';

/** Classes dont le moteur est écrit (les autres restent à faire : leurs tests sont ignorés) */
const IMPLEMENTED: ClassId[] = ['sorceress', 'druid', 'barbarian', 'paladin', 'amazon', 'assassin', 'necromancer'];

type Meas = (d: DerivedStats, g: Game) => number;
const kindOf = (g: Game, k: 'sword' | 'axe' | 'mace' | 'polearm' | 'thrown' | 'spear' | 'claw'): number => {
  g.world.refreshPlayer();
  return weaponMastery(g.world, k).dmg;
};
/** Nombre de compétences par classe : 30 dans Diablo II (base), arbres PD2 S13 avec le mod */
const SKILL_COUNT: Record<string, number> = withoutPd2
  ? { sorceress: 30, druid: 30, barbarian: 30, paladin: 30, amazon: 30, assassin: 30, necromancer: 30 }
  : { sorceress: 33, druid: 31, barbarian: 29, paladin: 33, amazon: 29, assassin: 31, necromancer: 33 };
/**
 * Compétences sans effet mesurable ici : Endurance accrue (le moteur n'a pas d'endurance), Résistance des invocations (résistances des
 * créatures : tests/unit/vanilla-skills-necromancer.test.ts)
 */
const NOT_SIMULATED_YET = new Set(['increased_stamina', 'summon_resist']);
const PASSIVE_STAT: Record<string, Meas> = {
  warmth: (d) => d.manaRegen,
  fire_mastery: (d) => d.elemDmgPct.fire,
  cold_mastery: (d) => d.pierce.cold,
  lightning_mastery: (d) => d.elemDmgPct.light,
  shape_shifting: (d) => d.lifeMax,
  one_hand_mastery: (_d, g) => kindOf(g, 'sword'),
  sword_mastery: (_d, g) => kindOf(g, 'sword'),
  axe_mastery: (_d, g) => kindOf(g, 'axe'),
  mace_mastery: (_d, g) => kindOf(g, 'mace'),
  pole_arm_mastery: (_d, g) => kindOf(g, 'polearm'),
  spear_mastery: (_d, g) => kindOf(g, 'spear'),
  two_hand_mastery: (_d, g) => kindOf(g, 'polearm'),
  throwing_mastery: (_d, g) => kindOf(g, 'thrown'),
  combat_reflexes: (d) => d.fhr,
  deep_wounds: (d) => d.skillLevels.deep_wounds,
  iron_skin: (d) => d.defense,
  increased_speed: (d) => d.frw,
  natural_resistance: (d) => d.res.fire,
  critical_strike: (_d, g) => weaponMastery(g.world, 'sword').crit,
  dodge: (d) => d.dodgeMelee,
  avoid: (d) => d.dodgeMissile,
  javelin_mastery: (_d, g) => kindOf(g, 'spear'),
  penetrate: (_d, g) => weaponMastery(g.world, 'sword').ar,
  evade: (d) => d.dodgeAny,
  pierce: (d) => d.skillLevels.pierce,
  claw_mastery: (_d, g) => kindOf(g, 'claw'),
  weapon_block: (d) => d.weaponBlock,
  skeleton_mastery: (_d, g) => minionStats(g.world, 'raise_skeleton', 5).hp,
  golem_mastery: (_d, g) => minionStats(g.world, 'clay_golem', 5).hp,
  curse_mastery: (d) => d.skillLevels.curse_mastery,
};
/** Compétences supplémentaires (points durs) nécessaires pour mesurer un passif */
const PASSIVE_EXTRA: Record<string, Record<string, number>> = {
  skeleton_mastery: { raise_skeleton: 5 },
  golem_mastery: { clay_golem: 5 },
};
/** Auras à effet sur les statistiques : mesure comparée avec et sans l'aura */
const AURA_STAT: Record<string, Meas> = {
  resist_fire: (d) => d.res.fire,
  defiance: (d) => d.defense,
  resist_cold: (d) => d.res.cold,
  cleansing: (d) => d.curseReduce,
  resist_lightning: (d) => d.res.light,
  vigor: (d) => d.frw,
  meditation: (d) => d.manaRegen,
  salvation: (d) => d.res.fire,
  might: (d) => d.meleeDmgPct,
  blessed_aim: (d) => d.attackRating,
  concentration: (d) => d.meleeDmgPct,
  thorns: (d) => (d.all.get('thornsFlat') ?? 0) + d.thorns,
  fanaticism: (d) => d.ias,
  conviction: (d) => d.conviction,
};
/** Auras qui agissent à chaque tick sur les monstres proches ou sur le Paladin */
const AURA_TICK = new Set(['prayer', 'redemption', 'holy_fire', 'holy_freeze', 'holy_shock', 'sanctuary']);
/** Buffs passifs mesurés sous une forme animale */
const PASSIVE_BUFFS: Record<string, { id: string; level: number; until: number }[]> = { shape_shifting: [{ id: 'werewolf', level: 1, until: 1e9 }] };
const BUFFS = new Set([
  'holy_sword',
  'blaze',
  'enchant',
  'cold_enchant',
  'frozen_armor',
  'shiver_armor',
  'chilling_armor',
  'thunder_storm',
  'energy_shield',
  'cyclone_armor',
  'hurricane',
  'armageddon',
  'werewolf',
  'werebear',
  'shout',
  'battle_orders',
  'battle_command',
  'holy_shield',
  'bone_armor',
  'burst_of_speed',
  'fade',
  'venom',
  'blade_shield',
  'hunger',
]);
/** Compétences dont l'effet n'est pas un simple coup sur la cible : contrôle, cris sans dégâts, ramassage de butin */
const NO_DAMAGE = new Set([
  'howl',
  'taunt',
  'battle_cry',
  'find_potion',
  'find_item',
  'grim_ward',
  'leap',
  'inner_sight',
  'slow_movement',
  'cloak_of_shadows',
  'death_sentry',
  'raise_skeleton',
  'skeletal_mage',
  'revive',
  'raise_skeleton_archer',
  'corpse_explosion',
  'blood_warp',
  'gust',
]);
/** Malédictions du Nécromancien */
const CURSE_SKILL = new Set(['amplify_damage', 'dim_vision', 'weaken', 'iron_maiden', 'terror', 'confuse', 'life_tap', 'attract', 'decrepify', 'lower_resist']);
/** Créatures : la compétence doit en faire apparaître (identifiant de créature) */
const MINION: Record<string, string> = {
  raise_skeleton: 'raise_skeleton',
  skeletal_mage: 'skeletal_mage',
  revive: 'revive',
  clay_golem: 'clay_golem',
  blood_golem: 'blood_golem',
  iron_golem: 'iron_golem',
  fire_golem: 'fire_golem',
  valkyrie: 'valkyrie',
  decoy: 'decoy',
  shadow_warrior: 'shadow_warrior',
  shadow_master: 'shadow_master',
  bone_wall: 'bone_wall',
  bone_prison: 'bone_wall',
};
/** Esprits et lianes nourricières : on vérifie l'invocation (et l'aura pour les esprits) */
/** Compétences qui agissent sur un cadavre */
const CORPSE = new Set([
  'hunger',
  'find_potion',
  'find_item',
  'grim_ward',
  'raise_skeleton',
  'skeletal_mage',
  'revive',
  'corpse_explosion',
  'poison_explosion',
  'raise_skeleton_archer',
  'death_sentry',
]);
/** Sans effet sur les champions : cible normale */
const NORMAL_ONLY = new Set(['taunt', 'howl', ...CORPSE]);
const SUPPORT_PETS = new Set(['oak_sage', 'heart_wolverine', 'spirit_barbs', 'cycle_of_life', 'vines']);
/** Compétences qui ne blessent que les morts-vivants (Éclair sacré de D2) : cible morte-vivante */
const UNDEAD_TARGET = new Set(['holy_bolt']);
/** Arme nécessaire pour jouer la compétence (nom de base D2) */
const KIND_BASE: Record<string, string> = { thrown: 'throwing_knife', bow: 'short_bow', crossbow: 'light_crossbow', javelin: 'javelin', spear: 'spear', claw: 'katar', dagger: 'dagger' };
/** Bouclier pour Châtiment et Charge */
const SHIELD = new Set(['smite']);

function arena(skill: string, cls: ClassId): { g: Game; w: World } {
  const g = new Game(undefined, cls);
  addXp(g.character, xpToReach(60));
  g.character.skills = { [skill]: 10 };
  // PD2 : Frénésie et Berserk exigent deux armes
  if (skill === 'frenzy' || skill === 'berserk') {
    g.character.equipment.mainhand = generateItem(new Rng('g'), 'short_sword', 30, { forceQuality: 'normal' });
    g.character.equipment.offhand = generateItem(new Rng('h'), 'short_sword', 30, { forceQuality: 'normal' });
  }
  if (SHIELD.has(skill)) g.character.equipment.offhand = generateItem(new Rng('s'), 'buckler', 30, { forceQuality: 'normal' });
  const kinds = weaponKindsFor(skill);
  if (kinds.length) {
    g.character.equipment.mainhand = generateItem(new Rng('g'), KIND_BASE[kinds[0]], 30, { forceQuality: 'normal' });
    if (skill === 'dragon_claw') g.character.equipment.offhand = generateItem(new Rng('h'), 'katar', 30, { forceQuality: 'normal' });
  }
  // griffes en main pour les compétences de l'Assassin qui les exigent ou les utilisent
  if (['dragon_tail', 'dragon_talon', 'dragon_flight', 'tiger_strike', 'fists_of_fire', 'cobra_strike'].includes(skill) && cls === 'assassin')
    g.character.equipment.mainhand = generateItem(new Rng('g'), 'katar', 30, { forceQuality: 'normal' });
  const b = new ZoneBuilder('arena', 'Arène', 30, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  b.spawn({ monster: UNDEAD_TARGET.has(skill) ? 'zombie' : 'hell_bovine', x: 14, y: 15, count: 1, r: 0, rank: NORMAL_ONLY.has(skill) ? 'normal' : 'champion' });
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 1, difficulty: 0, zoneLevel: 20, character: g.character });
  g.world.populate();
  // champion simple : un type fantomatique (80 % de rés. physique) ou possédé (insensible aux malédictions) fausserait la mesure,
  // comme la régénération (D2 DamageRegen) qui rend sa vie à la cible entre deux coups espacés
  for (const m of g.world.monsters) {
    m.mods = [];
    m.res.phys = 0;
    m.regen = 0;
  }
  g.world.godMode = true;
  return { g, w: g.world };
}

describe('Compétences des classes', () => {
  it('le catalogue compte les compétences de chaque classe (Diablo II : 30 ; PD2 S13 avec le mod)', () => {
    let total = 0;
    for (const c of CLASS_IDS) {
      expect(classSkills(c).length).toBe(SKILL_COUNT[c]);
      total += SKILL_COUNT[c];
    }
    expect(SKILLS.length).toBe(total);
  });

  // compétences dont l'effet observé dépend des chiffres PD2 (tables à 60 niveaux, tables par points durs : mods/pd2/data/skills.ts)
  const PD2_NUMBERS_NEEDED = new Set(['exploding_arrow', 'freezing_arrow', 'valkyrie', 'combat_reflexes', 'stun', 'hunger', 'molten_boulder', 'vengeance']);
  for (const s of SKILLS) {
    const cls = TREE_CLASS[s.tree];
    const run = IMPLEMENTED.includes(cls) && !NOT_SIMULATED_YET.has(s.id) ? it.skipIf(withoutPd2 && PD2_NUMBERS_NEEDED.has(s.id)) : it.skip;
    run(`${cls} — ${s.id} (${s.name}) : effet observable`, () => {
      if (s.kind === 'aura' && !AURA_TICK.has(s.id)) {
        const g = new Game(undefined, cls);
        addXp(g.character, xpToReach(60));
        g.character.skills = { [s.id]: 10 };
        const before = AURA_STAT[s.id](computeDerived(g.character, 0), g);
        const after = AURA_STAT[s.id](computeDerived(g.character, 0, [{ id: `aura_${s.id}`, level: 10, until: 1e9 }]), g);
        expect(after, `${s.id} doit améliorer sa statistique`).toBeGreaterThan(before);
        // lancer la compétence active bien l'aura
        g.mode = 'run';
        const { g: g2, w } = arena(s.id, cls);
        w.input.cast = { skill: s.id, tx: w.player.x, ty: w.player.y, targetId: 0 };
        for (let t = 0; t < 40 && !hasBuff(w, `aura_${s.id}`); t++) g2.step(1);
        expect(hasBuff(w, `aura_${s.id}`), `${s.id} doit s'activer`).toBe(true);
        return;
      }
      if (s.passive) {
        const g = new Game(undefined, cls);
        addXp(g.character, xpToReach(40));
        if (s.id === 'weapon_block') {
          g.character.equipment.mainhand = generateItem(new Rng('g'), 'katar', 30, { forceQuality: 'normal' });
          g.character.equipment.offhand = generateItem(new Rng('h'), 'katar', 30, { forceQuality: 'normal' });
        }
        g.character.skills = { ...PASSIVE_EXTRA[s.id] };
        g.world.refreshPlayer();
        const before = PASSIVE_STAT[s.id](computeDerived(g.character, 0, PASSIVE_BUFFS[s.id]), g);
        g.character.skills = { ...PASSIVE_EXTRA[s.id], [s.id]: 10 };
        g.world.refreshPlayer();
        const after = PASSIVE_STAT[s.id](computeDerived(g.character, 0, PASSIVE_BUFFS[s.id]), g);
        expect(after, `${s.id} doit augmenter sa statistique`).toBeGreaterThan(before);
        return;
      }
      const { g, w } = arena(s.id, cls);
      if (AURA_TICK.has(s.id)) {
        const m0 = w.monsters[0];
        m0.aggro = false;
        m0.speed = 0;
        m0.x = m0.px = w.player.x + 1.5;
        m0.y = m0.py = w.player.y;
        if (s.id === 'prayer') w.player.hp = w.player.hpMax * 0.4;
        if (s.id === 'redemption') w.killMonster(m0, w.player);
        if (s.id === 'sanctuary') m0.def = { ...m0.def, family: 'undead' };
        const hp0 = w.player.hp;
        const mh0 = m0.hp;
        w.input.cast = { skill: s.id, tx: w.player.x, ty: w.player.y, targetId: 0 };
        for (let t = 0; t < 25 * 12; t++) {
          w.godMode = true;
          g.step(1);
        }
        if (s.id === 'prayer') expect(w.player.hp, 'la Prière soigne').toBeGreaterThan(hp0);
        else if (s.id === 'redemption') expect(m0.eaten, 'la Rédemption rachète le cadavre').toBe(true);
        else expect(m0.dead || m0.hp < mh0, `${s.id} doit blesser les monstres proches`).toBe(true);
        return;
      }
      const m = w.monsters[0];
      m.aggro = false;
      m.speed = 0;
      // attaques de mêlée : la cible au contact
      if (s.melee || s.id === 'gust' || s.id === 'howl' || s.id === 'war_cry') {
        m.x = m.px = w.player.x + 1.2;
        m.y = m.py = w.player.y;
      }
      if (CORPSE.has(s.id)) w.killMonster(m, w.player);
      // PD2 : Pacte sombre dévore les malédictions d'un monstre maudit
      if (s.id === 'dark_pact')
        m.curses = [
          { id: 'amplify_damage', until: w.tick + 2000, level: 1, src: 0 },
          { id: 'weaken', until: w.tick + 2000, level: 1, src: 0 },
        ];
      const hp0 = m.hp;
      const x0 = w.player.x;
      let casts = 0;
      // compétence à longue recharge (D2 : Javelot de peste 4 s, Ouragan 6 s…) : plus de temps, et seuls les lancers possibles comptent
      const horizon = 25 * Math.max(8, Math.round((s.n.cooldown ?? 0) * 6 + 8));
      for (let t = 0; t < horizon; t++) {
        const p = w.player;
        p.mana = p.manaMax;
        if (p.mode !== 'cast' && p.mode !== 'attack' && !w.input.cast && casts < 12 && (p.cooldowns[s.id] ?? 0) <= w.tick) {
          const tx = s.id === 'teleport' ? p.x + 6 : m.x;
          const ty = s.id === 'teleport' ? p.y - 4 : m.y;
          w.input.cast = { skill: s.id, tx, ty, targetId: m.id };
          casts++;
        }
        g.step(1);
        if (s.id === 'teleport' && Math.abs(w.player.x - x0) > 2) break;
        if (BUFFS.has(s.id) && hasBuff(w, s.id)) break;
        if (SUPPORT_PETS.has(s.id) && w.monsters.some((x) => x.pet === s.id)) break;
      }
      if (s.id === 'teleport') {
        expect(Math.abs(w.player.x - x0)).toBeGreaterThan(2);
        return;
      }
      if (BUFFS.has(s.id)) {
        expect(hasBuff(w, s.id), `${s.id} doit être actif`).toBe(true);
        return;
      }
      if (SUPPORT_PETS.has(s.id)) {
        expect(
          w.monsters.some((x) => x.pet === s.id && !x.dead),
          `${s.id} doit être invoqué`,
        ).toBe(true);
        if (s.id === 'oak_sage' || s.id === 'heart_wolverine' || s.id === 'spirit_barbs') expect(hasBuff(w, s.id), `aura ${s.id}`).toBe(true);
        return;
      }
      if (s.id === 'hydra' || s.id === 'lesser_hydra') expect(w.monsters.some((x) => x.isSummon)).toBe(true);
      if (MINION[s.id]) {
        expect(
          w.monsters.some((x) => x.pet === MINION[s.id] && !x.dead),
          `${s.id} doit invoquer sa créature`,
        ).toBe(true);
        return;
      }
      if (s.kind === 'curse' && CURSE_SKILL.has(s.id)) {
        expect(m.curse?.id === s.id || m.dead, `${s.id} doit maudire la cible`).toBe(true);
        return;
      }
      if (NO_DAMAGE.has(s.id)) {
        const moved = Math.abs(w.player.x - x0) > 1;
        const fled = (m.fleeUntil ?? 0) > w.tick;
        const weakened = (m.debuffUntil ?? 0) > w.tick;
        const eaten = w.monsters.some((x) => x.eaten);
        const slowed = (m.slowMissileUntil ?? 0) > w.tick;
        const cloaked = hasBuff(w, 'cloak_of_shadows');
        const chilled = (m.chillT ?? 0) > 0 || (m.stunT ?? 0) > 0;
        expect(moved || fled || weakened || eaten || slowed || cloaked || chilled || m.dead || m.hp < hp0, `${s.id} doit produire son effet`).toBe(true);
        return;
      }
      expect(m.dead || m.hp < hp0, `${s.id} doit blesser la cible (${m.hp.toFixed(0)}/${hp0.toFixed(0)})`).toBe(true);
    });
  }

  it('les niveaux de compétence : valeurs exactes de la table aux niveaux échantillonnés (D2, ou PD2 S13 avec le mod)', () => {
    const bash = SKILL_BY_ID.bash;
    // Coup violent niveau 8 : D2 (Skills.txt) +85 % de dégâts, +55 % de précision, +8 dégâts ; PD2 S13 +225 %, +170 %, +8
    expect(ramp(bash.n.wdmg!, 8)).toBe(withoutPd2 ? 85 : 225);
    expect(ramp(bash.n.ar!, 8)).toBe(withoutPd2 ? 55 : 170);
    expect(ramp(bash.n.flat!, 8)).toBe(8);
  });
});
