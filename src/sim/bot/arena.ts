/**
 * Arène du bot de combat : une salle dégagée, un personnage construit au niveau voulu avec le
 * plan de compétences du build et un équipement de référence, face à un groupe de monstres.
 * Mesure le temps de mise à mort, la vie perdue et la mort éventuelle.
 */
import { Rng } from '../../core/rng';
import { BASE_BY_ID } from '../../data/items/bases';
import type { Difficulty, MonsterRank, Slot } from '../../data/types';
import { ZoneBuilder } from '../../data/zones/builder';
import { TICK_HZ } from '../constants';
import { Game } from '../game';
import { generateItem } from '../loot/itemgen';
import { canEquip } from '../character';
import { addToCharacter } from '../inventory';
import { itemFinal } from '../itemstats';
import { xpToReach, addXp } from '../progression';
import { World } from '../world';
import { BotBrain, botRules, BUILD_CLASS, type BuildId } from './brain';
import type { ClassId } from '../../data/classes';

export interface ArenaResult {
  monster: string;
  rank: MonsterRank;
  level: number;
  difficulty: Difficulty;
  count: number;
  /** Temps pour tout tuer (s), ou null si échec */
  clearSec: number | null;
  /** Temps moyen de mise à mort par monstre (s) = temps total / nombre */
  perKillSec: number | null;
  lifeLostPct: number;
  potions: number;
  died: boolean;
  /** Lancers par compétence (diagnostic) */
  casts?: Record<string, number>;
  /** Un des monstres est immunisé à l'élément du build (D2 : un unique Enchanté par le froid peut le devenir, variantes d'immunité) */
  immune?: boolean;
  /** Plus forte résistance des monstres à l'élément du build, modificateurs d'élite compris (%) */
  elemRes?: number;
}

/** Équipement de référence d'un niveau : bases usuelles, qualité magique/rare tirée à ce niveau. */
const KIT: [Slot, string[]][] = [
  ['head', ['cap', 'skull_cap', 'circlet', 'coronet', 'tiara', 'diadem']],
  ['body', ['quilted_armor', 'leather_armor', 'studded_leather', 'light_plate', 'mage_plate', 'archon_plate']],
  ['gloves', ['gloves_l', 'heavy_gloves', 'light_gauntlets', 'vampirebone_gloves']],
  ['boots', ['leather_boots', 'heavy_boots', 'battle_boots', 'wyrmhide_boots']],
  ['belt', ['sash_l', 'light_belt', 'mesh_belt', 'spiderweb_sash']],
  ['amulet', ['amulet']],
  ['ring1', ['ring']],
  ['ring2', ['ring']],
  ['mainhand', ['short_staff', 'eagle_orb', 'sacred_globe', 'swirling_crystal', 'eldritch_orb', 'dimensional_shard']],
  ['offhand', ['buckler', 'small_shield', 'grim_shield']],
];

/** Druide : bâtons (dégâts d'arme pour l'ours-garou, deux mains) au lieu des orbes */
const DRUID_WEAPONS = ['short_staff', 'long_staff', 'gnarled_staff', 'battle_staff', 'war_staff', 'rune_staff', 'archon_staff'];
/** Druide : peaux (bonus automatique à une compétence) au lieu des calottes et diadèmes */
const DRUID_HEADS = ['wolf_head', 'antlers', 'spirit_mask', 'alpha_helm', 'totemic_mask', 'blood_spirit', 'earth_spirit', 'dream_spirit'];

/** Kits des classes D2 : armes, casques et boucliers propres à la classe (bases D2, le niveau choisit la dernière utilisable) */
const SWORDS = ['short_sword', 'saber', 'long_sword', 'war_sword', 'gladius', 'battle_sword', 'phase_blade', 'conquest_sword', 'mythical_sword'];
const CLASS_KITS: Partial<Record<ClassId, Partial<Record<Slot, string[]>>>> = {
  barbarian: {
    head: [
      'jawbone_cap',
      'fanged_helm',
      'horned_helm',
      'assault_helmet',
      'avenger_guard',
      'jawbone_visor',
      'lion_helm',
      'rage_mask',
      'savage_helmet',
      'slayer_guard',
      'carnage_helm',
      'fury_visor',
      'destroyer_helm',
      'conquerer_crown',
      'guardian_crown',
    ],
    mainhand: SWORDS,
    offhand: SWORDS,
  },
  paladin: {
    mainhand: SWORDS,
    offhand: [
      'targe',
      'rondache',
      'heraldic_shield',
      'aerin_shield',
      'crown_shield',
      'akaran_targe',
      'akaran_rondache',
      'protector_shield',
      'guilded_shield',
      'royal_shield',
      'sacred_targe',
      'sacred_rondache',
      'ancient_shield_sacred',
      'zakarum_shield',
      'vortex_shield',
    ],
  },
  amazon: {
    mainhand: [
      'short_bow',
      'hunters_bow',
      'long_bow',
      'composite_bow',
      'short_battle_bow',
      'long_battle_bow',
      'short_war_bow',
      'long_war_bow',
      'edge_bow',
      'razor_bow',
      'cedar_bow',
      'double_bow',
      'short_siege_bow',
      'long_siege_bow',
      'rune_bow',
      'gothic_bow',
      'spider_bow',
      'blade_bow',
      'shadow_bow',
      'great_bow',
      'diamond_bow',
      'crusader_bow',
      'ward_bow',
      'hydra_bow',
    ],
  },
  assassin: {
    mainhand: [
      'katar',
      'wrist_blade',
      'hatchet_hands',
      'cestus',
      'claws',
      'blade_talons',
      'scissors_katar',
      'quhab',
      'wrist_spike',
      'fascia',
      'hand_scythe',
      'greater_claws',
      'greater_talons',
      'scissors_quhab',
      'suwayyah',
      'wrist_sword',
      'war_fist',
      'battle_cestus',
      'feral_claws',
      'runic_talons',
      'scissors_suwayyah',
    ],
    offhand: [
      'katar',
      'wrist_blade',
      'hatchet_hands',
      'cestus',
      'claws',
      'blade_talons',
      'scissors_katar',
      'quhab',
      'wrist_spike',
      'fascia',
      'hand_scythe',
      'greater_claws',
      'greater_talons',
      'scissors_quhab',
      'suwayyah',
      'wrist_sword',
      'war_fist',
      'battle_cestus',
      'feral_claws',
      'runic_talons',
      'scissors_suwayyah',
    ],
  },
  necromancer: {
    mainhand: ['wand', 'yew_wand', 'bone_wand', 'grim_wand', 'burnt_wand', 'petrified_wand', 'tomb_wand', 'grave_wand', 'polished_wand', 'ghost_wand', 'lich_wand', 'unearthed_wand'],
    offhand: [
      'preserved_head',
      'zombie_head',
      'unraveller_head',
      'gargoyle_head',
      'demon_head_bone',
      'mummified_trophy',
      'fetish_trophy',
      'sexton_trophy',
      'cantor_trophy',
      'heirophant_trophy',
      'minion_skull',
      'hellspawn_skull',
      'overseer_skull',
      'succubae_skull',
      'bloodlord_skull',
    ],
  },
};
/** Builds de mêlée à l'arme, dont le kit de référence reçoit des dégâts améliorés */
const ED_BUILDS: Partial<Record<BuildId, number>> = { bear: 3, whirlwind: 3, frenzy: 3, zealot: 3, martial: 5, javazon: 3, bowazon: 3 };
/** Vie apportée par l'équipement de référence, par niveau, pour les classes D2 d'arme (Sorcière et Druide : kits déjà calés) */
const LIFE_PER_LEVEL: Partial<Record<ClassId, number>> = { barbarian: 3, paladin: 3, amazon: 3, assassin: 3, necromancer: 2 };
/** Vie de l'équipement par niveau propre à un build (l'ours-garou est une mêlée dans un kit de Druide) : prime sur la classe */
const LIFE_PER_LEVEL_BUILD: Partial<Record<BuildId, number>> = { bear: 3 };
/** Kits propres à un build (armes de jet de la javeline, dague du poison) */
const BUILD_KITS: Partial<Record<BuildId, Partial<Record<Slot, string[]>>>> = {
  javazon: {
    mainhand: [
      'javelin',
      'pilum',
      'short_spear',
      'glaive',
      'throwing_spear',
      'war_javelin',
      'great_pilum',
      'simbilan',
      'spiculum',
      'harpoon',
      'hyperion_javelin',
      'stygian_pilum',
      'balrog_spear',
      'ghost_glaive',
      'winged_harpoon',
    ],
  },
  pnova: { mainhand: ['dagger', 'dirk', 'kriss', 'blade', 'poignard', 'rondel', 'cinquedeas', 'stilleto', 'bone_knife', 'mithral_point', 'fanged_knife', 'legend_spike'] },
};

export function referenceCharacter(level: number, build: BuildId, seed = 1): Game {
  const g = new Game(undefined, BUILD_CLASS[build]);
  const c = g.character;
  c.name = `Arène-${seed}`;
  addXp(c, xpToReach(level));
  const brain = new BotBrain(g, { build });
  brain.spendSkillPoints();
  const rng = new Rng(`kit:${level}:${seed}`);
  for (const [slot, bases] of KIT) {
    const druid = BUILD_CLASS[build] === 'druid';
    const list = BUILD_KITS[build]?.[slot] ?? CLASS_KITS[BUILD_CLASS[build]]?.[slot] ?? (druid && slot === 'mainhand' ? DRUID_WEAPONS : druid && slot === 'head' ? DRUID_HEADS : bases);
    // comme le bot en jeu : pas d'objet dont les prérequis dépassent 10 + 1,6 × niveau (sinon tous les points vont en force/dextérité)
    const cap = 10 + level * 1.6;
    const ok = list
      .filter((b) => BASE_BY_ID[b] && BASE_BY_ID[b].qlvl <= level + 2 && BASE_BY_ID[b].reqStr <= cap && BASE_BY_ID[b].reqDex <= cap)
      .sort((a, b) => BASE_BY_ID[a].qlvl - BASE_BY_ID[b].qlvl);
    if (!ok.length) continue;
    const base = ok[ok.length - 1];
    if (slot === 'offhand' && BASE_BY_ID[c.equipment.mainhand?.base ?? '']?.twoHanded) continue;
    const it = generateItem(rng, base, level, {
      forceQuality: level >= 20 ? 'rare' : 'magic',
    });
    // les mêlées D2 vivent des dégâts améliorés de l'arme (mots runiques, uniques) : un rare tiré à
    // ce niveau n'en a aucun ; on lui prête l'ED d'un équipement de milieu de progression
    if ((slot === 'mainhand' || slot === 'offhand') && ED_BUILDS[build] && BASE_BY_ID[base].dmg) it.superiorPct = Math.min(300, Math.round(level * ED_BUILDS[build]!));
    // équipement de fin de partie : les classes de mêlée et d'arme comptent sur la vie et les résistances des objets (D2 : +300 à +500 de vie, ~75 % de résistances en Enfer)
    const lifePerLevel = LIFE_PER_LEVEL_BUILD[build] ?? LIFE_PER_LEVEL[BUILD_CLASS[build]];
    if (slot === 'body' && lifePerLevel)
      it.craftMods = [...(it.craftMods ?? []), { stat: 'life', value: Math.round(level * lifePerLevel) }, { stat: 'resAll', value: Math.min(75, Math.round(level * 0.9)) }];
    // vitesse d'attaque des gants et bottes de milieu de partie (D2 : 40 % et plus pour les armes)
    if (slot === 'gloves' && ED_BUILDS[build]) it.craftMods = [...(it.craftMods ?? []), { stat: 'ias', value: Math.min(40, Math.round(level * 0.5)) }];
    c.equipment[slot] = it;
  }
  // charme de référence de l'endgame du jeu de règles (pd2 : charme de brisure de l'élément du build) : ARENA_SUNDER=1
  const sunder = botRules().arenaCharms[build];
  if (sunder && level >= 75 && typeof process !== 'undefined' && process.env.ARENA_SUNDER) {
    addToCharacter(c, generateItem(rng, 'grand_charm', level, { forceUniqueId: sunder }));
  }
  // force/dextérité pour porter le kit, le reste en vitalité ; ce qui reste importable est retiré
  const need = Object.values(c.equipment).reduce(
    (a, it) => {
      const f = itemFinal(it!, level);
      return { s: Math.max(a.s, f.reqStr), d: Math.max(a.d, f.reqDex) };
    },
    { s: 0, d: 0 },
  );
  if (need.s > c.base.str) g.allocateStat('str', Math.min(c.statPoints, need.s - c.base.str));
  if (need.d > c.base.dex) g.allocateStat('dex', Math.min(c.statPoints, need.d - c.base.dex));
  brain.spendStatPoints();
  for (const [slot, it] of Object.entries(c.equipment)) if (!canEquip(c, it!).ok) delete c.equipment[slot as Slot];
  g.world.refreshPlayer();
  return g;
}

export function fightArena(opts: { monster: string; rank: MonsterRank; count: number; level: number; difficulty: Difficulty; build: BuildId; maxSec?: number; seed?: number }): ArenaResult {
  const g = referenceCharacter(opts.level, opts.build, opts.seed ?? 1);
  const b = new ZoneBuilder(`arena`, 'Arène', 36, 36, 'flagstone', {
    theme: 'crypt',
    mood: 'tombs',
    ambient: { color: 0x303040, level: 0.3 },
  });
  b.start(10, 18);
  b.block(0, 0, 36, 1);
  b.block(0, 35, 36, 36);
  b.block(0, 0, 1, 36);
  b.block(35, 0, 36, 36);
  b.spawn({
    monster: opts.monster,
    x: 22,
    y: 18,
    count: opts.count,
    r: 2,
    rank: opts.rank === 'minion' ? 'normal' : (opts.rank as 'normal' | 'champion' | 'unique' | 'boss'),
  });
  const zone = b.build();
  g.mode = 'run';
  g.world = new World({
    zone,
    seed: opts.seed ?? 1,
    difficulty: opts.difficulty,
    zoneLevel: opts.level,
    character: g.character,
  });
  g.world.populate();
  const w = g.world;
  const brain = new BotBrain(g, { build: opts.build });
  // préparation (comme un joueur avant d'engager) : armures, formes, créatures invoquées ;
  // les monstres attendent, le chronomètre ne tourne pas encore
  for (const m of w.monsters) m.aggro = false;
  const hold = () => {
    // pendant la préparation, monstres et créatures invoquées restent en place
    for (const m of w.monsters) {
      m.stunT = 2;
      if (!m.pet) m.aggro = false;
    }
  };
  for (let k = 0; k < TICK_HZ * 15; k++) {
    const p = w.player;
    if (p.mode !== 'cast' && p.mode !== 'attack' && !w.input.cast && !brain.maintain(false)) break;
    w.input.moveX = 0;
    w.input.moveY = 0;
    p.mana = p.manaMax;
    hold();
    w.step(1);
    w.events.drain();
  }
  for (const m of w.monsters) {
    m.stunT = 0;
    if (!m.pet) m.aggro = true;
  }
  const n0 = w.monsters.filter((m) => !m.isSummon).length;
  const elem = opts.build === 'cold' || opts.build === 'fire' || opts.build === 'light' ? opts.build : null;
  const immune = !!elem && w.monsters.some((m) => !m.isSummon && !m.pet && (m.res[elem] ?? 0) >= 100);
  const elemRes = elem ? Math.max(0, ...w.monsters.filter((m) => !m.isSummon && !m.pet).map((m) => m.res[elem] ?? 0)) : 0;
  const hp0 = w.player.hpMax;
  let minHp = w.player.hp;
  const maxTicks = Math.round((opts.maxSec ?? 90) * TICK_HZ);
  let t = 0;
  let died = false;
  for (; t < maxTicks; t++) {
    brain.tick();
    if (typeof process !== 'undefined' && process.env.ARENA_DEBUG && t % 25 === 0)
      console.log(
        `t=${t / 25}s ${brain.action} hp ${Math.round(w.player.hp)}/${Math.round(w.player.hpMax)} mana ${Math.round(w.player.mana)} mobs ${w.monsters.filter((m) => !m.isSummon && !m.dead).length} pets ${w.monsters.filter((m) => m.pet && !m.dead).length}`,
      );
    w.step(1);
    w.events.drain();
    minHp = Math.min(minHp, w.player.hp);
    if (w.player.dead) {
      died = true;
      break;
    }
    if (w.monsters.every((m) => m.dead || m.isSummon)) break;
  }
  const cleared = !died && w.monsters.every((m) => m.dead || m.isSummon);
  const sec = t / TICK_HZ;
  return {
    monster: opts.monster,
    rank: opts.rank,
    level: opts.level,
    difficulty: opts.difficulty,
    count: n0,
    clearSec: cleared ? sec : null,
    perKillSec: cleared ? sec / Math.max(1, n0) : null,
    lifeLostPct: Math.round((100 * (hp0 - minHp)) / hp0),
    potions: brain.stats.potions,
    died,
    casts: brain.stats.casts,
    immune,
    elemRes,
  };
}
