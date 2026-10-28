#!/usr/bin/env python3
"""
Génère mods/pd2/data/skills.ts à partir de mods/pd2/tools/skilldata/pd2-wiki.json (tables PD2 S13 à 60 niveaux,
mods/pd2/tools/skilldata/pd2wiki.py) : pour chaque compétence, les champs numériques listés dans MAP remplacent
ceux des fichiers skills*.ts (dégâts, précision, % de dégâts d'arme, durées, nombres de projectiles…),
les synergies de dégâts sont celles du wiki, et les tables « par point dur » utiles sont exportées.

Les tables sont exactes à tous les niveaux : une rampe par paliers R() quand la table suit les paliers
de Skills.txt (2-8, 9-16, 17-22, 23-28, 29+ ; c'est le cas des dégâts élémentaires), sinon la table
complète T([...60 valeurs]). Idempotent :

    python3 mods/pd2/tools/skilldata/apply-pd2-wiki.py
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
WIKI = json.load(open(os.path.join(HERE, 'pd2-wiki.json')))
DEST = os.environ.get('DEST') or os.path.join(HERE, '..', '..', 'data', 'skills.ts')


def dmg(prefix):
    """min/max ← « <prefix> (min) » / « <prefix> (max) »"""
    return {'min': prefix + ' (min)', 'max': prefix + ' (max)'}


def dmg2(prefix):
    return {'min2': prefix + ' (min)', 'max2': prefix + ' (max)'}


def dmg3(prefix):
    return {'min3': prefix + ' (min)', 'max3': prefix + ' (max)'}


def neg(table):
    """Valeur affichée négative (réduction appliquée à l'ennemi) : on garde la valeur absolue."""
    return ('neg', table)


def const(v):
    return ('const', v)


def half(table):
    """Table en yards convertie en unités du monde (1 unité = 2 yards)."""
    return ('half', table)


AR, WD = 'Attack Rating +%', 'Damage +%'
DUR = 'Duration (seconds)'

# champ du jeu ← table du wiki (ou constante tirée des notes du wiki)
MAP = {
    # ------------------------------ Sorcière ------------------------------
    'fire_bolt': dmg('Fire Damage'),
    'inferno': dmg('Fire Damage'),
    # Mur de feu et Embrasement (rework S13) : dégâts PAR SECONDE du wiki (« Burning », « Trail », « Explosion »)
    'fire_wall': {**dmg('Burning Damage'), 'duration': const(3), 'cooldown': const(1.52)},
    'blaze': {**dmg('Trail Damage'), **dmg2('Explosion Damage'), 'value': 'Movement Speed +%', 'duration': DUR},
    'fire_ball': dmg('Fire Damage'),
    'lesser_hydra': {**dmg('Fire Damage'), 'duration': const(5)},
    'enchant': {**dmg('Fire Attack Damage'), 'duration': const(300)},
    'meteor': {**dmg('Fire Damage'), **dmg2('Burning Damage'), 'cooldown': const(0.52)},
    'combustion': dmg('Fire Damage'),
    'hydra': {**dmg('Fire Damage'), 'duration': const(5)},
    'ice_bolt': {**dmg('Cold Damage'), 'chill': 'Cold Length (seconds)'},
    'cold_enchant': {**dmg('Cold Attack Damage'), 'duration': const(300)},
    'frost_nova': {**dmg('Cold Damage'), 'chill': 'Cold Length (seconds)'},
    'ice_blast': {**dmg('Cold Damage'), 'chill': 'Freeze Length (seconds)'},
    'shiver_armor': {**dmg('Cold Damage'), 'value': 'Defense +%', 'duration': DUR},
    'glacial_spike': dmg('Cold Damage'),
    'blizzard': {**dmg('Cold Damage'), 'duration': const(2), 'cooldown': const(0.92)},
    'ice_barrage': dmg('Cold Damage'),
    'chilling_armor': {**dmg('Cold Damage'), 'value': 'Defense +%', 'duration': DUR},
    'frozen_orb': {**dmg('Cold Damage'), 'chill': 'Cold Length (seconds)'},
    'charged_bolt': {**dmg('Lightning Damage'), 'count': 'Number of Bolts'},
    'telekinesis': dmg('Lightning Damage'),
    'nova': dmg('Lightning Damage'),
    'lightning': dmg('Lightning Damage'),
    'chain_lightning': {**dmg('Lightning Damage'), 'count': 'Number of Chains per Bolt'},
    'thunder_storm': {**dmg('Lightning Damage'), 'duration': DUR},
    'energy_shield': {'value': 'Absorbs % Damage', 'duration': DUR},
    'warmth': {'value': 'Mana Recovery +%', 'value2': 'Attack Rating +%'},
    'fire_mastery': {'value': 'Fire Damage +%'},
    'cold_mastery': {'value': 'Cold Damage +%'},
    'lightning_mastery': {'value': 'Lightning Damage +%'},
    # ------------------------------ Amazone ------------------------------
    'magic_arrow': {**dmg('Magic Damage'), 'ar': AR, 'value': const(50)},
    'fire_arrow': {**dmg('Fire Damage'), **dmg2('Burning Damage'), 'ar': AR, 'count': 'Number of Arrows', 'value': const(50)},
    'cold_arrow': {**dmg('Cold Damage'), 'ar': AR, 'count': 'Number of Arrows', 'value': const(50), 'chill': const(4)},
    'multiple_shot': {'wdmg': WD, 'ar': AR, 'count': 'Number of Arrows'},
    'exploding_arrow': {**dmg('Fire Damage'), 'ar': AR, 'count': 'Secondary Explosions'},
    'ice_arrow': {**dmg('Cold Damage'), 'ar': AR, 'chill': const(1)},
    'guided_arrow': {'wdmg': WD},
    'confuse': {'value': 'Enemy Attack Speed +%', 'duration': const(20)},
    'immolation_arrow': {**dmg('Fire Damage'), **dmg2('Burning Damage'), 'ar': AR},
    'strafe': {'wdmg': WD, 'ar': AR, 'count': 'Number of Targets'},
    'freezing_arrow': {**dmg('Cold Damage'), 'ar': AR, 'chill': const(0.48)},
    'inner_sight': {'value': neg('Enemy Defense'), 'value2': neg('Enemy Attack Rating %'), 'radius': half('Radius (yards)'), 'duration': DUR},
    'critical_strike': {'value': 'Critical Strike +%'},
    'dodge': {'value': 'Dodge Chance +%', 'value2': 'Faster Hit Recovery +%'},
    'evade': {'value': 'Evade Chance +%', 'value2': 'Movement Speed +%'},
    'slow_movement': {'value': neg('Enemy Movement Speed %'), 'value2': neg('Enemy Missile Speed %'), 'radius': half('Radius (yards)'), 'duration': DUR},
    'penetrate': {'value': 'Attack Rating +%'},
    'pierce': {'value': 'Pierce Chance +%'},
    'decoy': {**dmg('Physical Damage'), 'value2': 'All Resistances %', 'duration': const(30)},
    'valkyrie': {'ar': 'Attack Rating +', 'count': 'Number of Valkyries', 'v3': 'Valk Power Strike Level', 'value2': 'All Resistances %'},
    'jab': {'wdmg': WD, 'ar': AR},
    'power_strike': {**dmg('Lightning Damage'), **dmg2('Nova Damage'), 'ar': AR},
    'poison_javelin': {**dmg('Poison Damage'), 'duration': const(1)},
    'javelin_mastery': {'wdmg': WD, 'value': 'Critical Strike Multiplier +%'},
    'lightning_bolt': dmg('Lightning Damage'),
    'charged_strike': {**dmg('Lightning Damage'), 'count': 'Number of Bolts'},
    'plague_javelin': {**dmg('Poison Damage'), 'ar': AR, 'duration': const(3)},
    'fend': {'wdmg': WD, 'ar': AR},
    'lightning_strike': {**dmg('Lightning Damage'), 'count': 'Number of Chains per Bolt'},
    'lightning_fury': {**dmg('Lightning Damage'), 'count': 'Maximum Number of Bolts'},
    # ------------------------------ Assassin ------------------------------
    'dragon_talon': {'wdmg': 'Kick Damage +%', 'ar': AR, 'count': 'Number of Kicks'},
    'dragon_claw': {'wdmg': WD, 'ar': AR},
    'dragon_tail': {'value': 'Kick Fire Damage +%', 'ar': AR},
    # Envol du dragon : recharge selon le niveau (2 s → 1 s), lue dans `value`
    'dragon_flight': {'wdmg': 'Kick Damage +%', 'ar': AR, 'value': 'Cooldown (seconds)'},
    'claw_mastery': {'wdmg': WD, 'ar': AR, 'value': 'Critical Strike +%'},
    'psychic_hammer': {**dmg('Magic Damage'), 'count': 'Number of Hits'},
    'burst_of_speed': {'value2': 'Movement Speed +%', 'duration': DUR},
    'weapon_block': {'value': 'Parry Chance %'},
    # durée fixe 5 s, recharge 5 s, portée 20 yards
    'cloak_of_shadows': {'value': 'Defense +%', 'value2': neg('Enemy Defense %'), 'duration': const(5), 'cooldown': const(5), 'radius': const(10)},
    'mind_blast': dmg('Physical Damage'),
    # recharge de 2 s (6 s avant la S13)
    'shadow_warrior': {'cooldown': const(2)},
    'shadow_master': {'cooldown': const(2)},
    'fade': {'value': 'All Resistances +%', 'value2': 'Physical Damage Reduction %', 'v3': neg('Curse Duration %'), 'duration': DUR},
    'venom': {**dmg('Poison Damage'), 'duration': DUR},
    'fire_blast': {**dmg('Fire Damage'), 'count': 'Number of Bombs'},
    'shock_web': {**dmg('Lightning Damage'), 'count': 'Number of Spikes', 'cooldown': const(1)},
    'blade_sentinel': dmg('Physical Damage'),
    'charged_bolt_sentry': dmg('Lightning Damage'),
    'wake_of_fire': dmg('Fire Damage'),
    'blade_fury': {**dmg('Physical Damage'), 'ar': AR},
    'lightning_sentry': dmg('Lightning Damage'),
    'wake_of_inferno': dmg('Fire Damage'),
    'death_sentry': dmg('Physical Damage'),
    'chain_lightning_sentry': dmg('Lightning Damage'),
    'blade_shield': {**dmg('Physical Damage'), 'duration': DUR, 'ar': AR},
    # charges PD2 : coup 1, 2 et 3 (« 1 + 3 » : brûlure du sol, partagée par les charges 1 et 3)
    'fists_of_fire': {**dmg('1:Fire Damage'), **dmg2('2:Fire Nova Damage'), **dmg3('3:Meteor Fire Damage'), 'ar': 'All:Fists of Fire Attack Rating +%',
                      'value': '1 + 3:Burning Damage (min)', 'value2': '1 + 3:Burning Damage (max)', 'v3': 'None*:Physical Damage Converted to Fire %'},
    'claws_of_thunder': {**dmg('1:Lightning Damage'), **dmg2('2:Nova Damage'), **dmg3('3:Lightning & Bolt Damage'), 'ar': 'All:Claws of Thunder Attack Rating +%'},
    'blades_of_ice': {**dmg('1:Cold Damage'), **dmg2('2:Cold Wave damage'), **dmg3('3:Ice Bolt Damage'), 'ar': 'All:Blades of Ice Attack Rating +%'},
    'phoenix_strike': {**dmg('1:Fire Damage'), **dmg2('2:Lightning Damage'), **dmg3('3:Cold Damage'), 'value': '1:Burning Damage (min)', 'value2': '1:Burning Damage (max)', 'ar': 'All:Phoenix Strike Attack Rating +%'},
    'cobra_strike': {**dmg('1:Poison Bolt Damage'), **dmg3('3:Poison Cloud Damage'), 'value': '2:Life/Mana Steal +%', 'wdmg': '2:Damage +%', 'ar': 'All:Cobra Strike Attack Rating +%'},
    'tiger_strike': {'wdmg': '1:Damage +%', 'ar': 'All:Tiger Strike Attack Rating +%'},
    # ------------------------------ Barbare ------------------------------
    'bash': {'wdmg': WD, 'flat': 'Damage +', 'ar': AR},
    'double_swing': {'wdmg': WD, 'ar': AR},
    'double_throw': {'wdmg': WD, 'ar': AR, 'count': 'Number of Bounces'},
    'stun': {**dmg('Physical Damage'), 'ar': AR, 'stun': 'Stun Length (seconds)'},
    'split_throw': {'wdmg': WD, 'ar': AR, 'count': 'Number of Projectiles'},
    'leap_attack': {'wdmg': WD, 'ar': AR},
    'concentrate': {'wdmg': WD, 'ar': AR, 'value': 'Defense +%'},
    'frenzy': {'wdmg': WD, 'ar': AR, 'v3': 'Attack Speed +%', 'v4': 'Movement Speed +%', 'v5': 'Frenzy Melee Splash Radius +%'},
    'whirlwind': {'wdmg': WD, 'ar': AR, 'v3': 'Whirlwind Velocity +%'},
    'leap': {'radius': half('Leap Distance (yards)')},
    'berserk': {'v3': WD, 'ar': AR, 'value': neg('Physical Resistance Pierce %'), 'duration': const(0.52)},
    'one_hand_mastery': {'wdmg': WD, 'ar': AR, 'value': 'Critical Strike +%', 'v3': 'Melee Splash Radius +%'},
    'two_hand_mastery': {'wdmg': WD, 'ar': AR, 'value': 'Crushing Blow +%', 'v3': 'Melee Splash Radius +%', 'v4': 'Crushing Blow Efficiency +%'},
    'throwing_mastery': {'wdmg': WD, 'ar': AR, 'value': 'Critical Strike +%', 'v3': 'Pierce Chance +%'},
    'combat_reflexes': {'value2': 'Life +'},
    'iron_skin': {'value': 'Defense +%'},
    'increased_speed': {'value': 'Movement Speed +%'},
    'natural_resistance': {'value': 'All Resistances +%'},
    'deep_wounds': {'value': 'Open Wounds +%', 'v3': 'Open Wounds Damage'},
    'howl': {'duration': const(3), 'radius': half('Howl Radius (yards)')},
    'find_potion': {'value': 'Potion Chance %'},
    'find_item': {'value': 'Item Chance %'},
    'shout': {'value': 'Defense +%', 'duration': const(300)},
    'taunt': {'value': neg('Enemy Damage %'), 'value2': neg('Enemy Attack Rating %')},
    'battle_cry': {'value': neg('Enemy Defense %'), 'value2': neg('Enemy Physical Resistance %'), 'duration': const(12)},
    'battle_orders': {'value': 'Life +', 'value2': 'Mana +', 'duration': const(300)},
    'grim_ward': {'value': 'Damage +%', 'value2': 'Attack Rating +', 'duration': const(40)},
    'war_cry': {**dmg('Physical Damage'), 'radius': half('Radius (yards)'), 'stun': const(0.24)},
    'battle_command': {'value': 'Damage +%', 'duration': const(300)},
    # ------------------------------ Druide ------------------------------
    'firestorm': dmg('Burning Damage'),
    # Souffle arctique : longueur du jet = « Range (Yards) » ; résistance au froid de l'ennemi ; éclats de givre à la mort (« Nova Damage »)
    'arctic_blast': {**dmg('Cold Damage'), **dmg2('Nova Damage'), 'radius': half('Range (Yards)'), 'value': neg('Enemy Cold Resistance %')},
    'gust': {'value': 'Cooldown (seconds)', 'chill': const(0.48), 'radius': const(1.33)},
    # Rocher en fusion : sol brûlant (« Burning Damage »), vitesse et distance du rocher (yards → unités)
    'molten_boulder': {**dmg('Physical Damage'), **dmg2('Fire Damage'), **dmg3('Burning Damage'), 'value': const(50), 'value2': half('Boulder Velocity (yards/sec)'), 'v3': half('Boulder Total Distance (yards)'), 'radius': const(2.33), 'cooldown': const(0.52)},
    'eruption': {**dmg('Fire Damage'), 'radius': const(2.33), 'duration': const(2.2), 'cooldown': const(0.52)},
    'twister': {**dmg('Physical Damage'), 'count': 'Number of Twisters'},
    'volcano': {**dmg('Physical Damage'), **dmg2('Fire Damage'), 'duration': const(6), 'cooldown': const(0.52)},
    'tornado': dmg('Physical Damage'),
    'hurricane': {**dmg('Cold Damage'), 'duration': DUR, 'radius': const(3)},
    'armageddon': {**dmg('Fire Damage'), **dmg2('Physical Damage'), **dmg3('Burning Damage'), 'duration': DUR, 'radius': const(3)},
    'cyclone_armor': {'value': 'Elemental Damage Absorbed', 'cooldown': const(2)},
    'rabies': {**dmg('Poison Damage'), 'ar': AR, 'duration': const(5)},
    'fire_claws': {**dmg('Burning Damage'), 'ar': AR},
    'shock_wave': {**dmg('Physical Damage'), 'count': 'Number of Waves', 'stun': const(0.24), 'radius': const(6)},
    # métamorphoses PD2 : bonus de forme ; les attaques animales n'ont plus de dégâts physiques propres
    'werewolf': {'value': WD, 'value2': 'Attack Speed +%', 'v3': 'Physical Damage Reduction', 'v4': 'Magic Damage Reduction'},
    'shape_shifting': {'value': 'Life +%', 'value2': AR},
    'werebear': {'value': WD, 'value2': 'Defense +%', 'v3': 'Uninterrupted Attack %'},
    'feral_rage': {'value': WD, 'ar': AR, 'count': 'Max Charges', 'duration': const(30), 'min': const(0), 'max': const(0)},
    'maul': {'value': const(40), 'ar': AR, 'count': 'Max Charges', 'duration': const(20), 'min': const(0), 'max': const(0)},
    'fury': {'value': WD, 'ar': AR, 'count': const(3), 'min': const(0), 'max': const(0)},
    'hunger': {'value': 'Open Wounds +%', 'value2': 'Movement Speed +%', 'v3': 'Open Wounds Damage', 'duration': DUR, 'min': const(0), 'max': const(0)},
    # Corbeaux PD2 S13 : 100 % froid, cinq coups chacun, 15 au plus
    'raven': {'min': const(0), 'max': const(0), **dmg2('Cold Damage'), 'count': 'Number of Ravens', 'value': const(5)},
    # Liane empoisonnée : plaques de poison (« Number of Growths »), résistance au poison de l'ennemi, recharge 1 s
    'plague_poppy': {**dmg('Poison Damage'), 'duration': const(4), 'value': neg('Enemy Poison Resistance %'), 'count': 'Number of Growths', 'cooldown': const(1)},
    'cycle_of_life': {'value': 'Heals (min)', 'value2': 'Heals (max)', 'cooldown': const(1)},
    'vines': {'value': 'Mana Recovered (min)', 'value2': 'Mana Recovered (max)', 'cooldown': const(1)},
    'spirit_wolf': {**dmg('Physical Damage'), 'count': 'Number of Wolves'},
    'summon_fenris': {**dmg('Physical Damage'), 'count': 'Number of Wolves'},
    'grizzly': {**dmg('Physical Damage'), 'cooldown': const(2)},
    'heart_wolverine': {'value': 'Damage +%', 'value2': 'Attack Rating +%'},
    'spirit_barbs': {'value': 'Damage Returned', 'value2': 'Deadly Strike +%'},
    'oak_sage': {'value': 'Max Life', 'value2': 'Regeneration Value'},
    # ------------------------------ Nécromancien ------------------------------
    'teeth': {**dmg('Magic Damage'), 'count': 'Number of Teeth'},
    'bone_armor': {'value': 'Physical Damage Absorbed'},
    'raise_skeleton': {'count': 'Number of Warriors'},
    'poison_dagger': {**dmg('Poison Damage'), 'ar': AR, 'duration': const(2), 'value': neg('Poison Resistance Pierce %')},
    'desecrate': {**dmg('Poison Damage'), 'duration': const(3)},
    'bone_spear': {**dmg('Magic Damage'), 'count': 'Number of Spears'},
    'corpse_explosion': {**dmg('Physical Damage'), **dmg2('Fire Damage'), 'radius': half('Radius (yards)')},
    'confuse': {'value': 'Enemy Attack Speed +%', 'duration': const(20)},
    'blood_golem': {'value2': 'Life After Each Hit', 'v3': 'Open Wounds Damage'},
    'clay_golem': {'value': neg('Slows Target %')},
    'iron_golem': {'value': 'Damage Returned %'},
    'bone_wall': {'value': 'Damage Returned'},
    'bone_prison': {'value': 'Damage Returned'},
    'fire_golem': {**dmg('Fire Attack Damage'), **dmg2('Fire Aura Damage')},
    'poison_nova': {**dmg('Poison Damage'), 'duration': const(2)},
    'bone_spirit': dmg('Magic Damage'),
    'dark_pact': dmg('Magic Damage'),
    'revive': {'duration': DUR, 'value': 'Physical Damage +%', 'value2': 'Elemental Damage +%'},
    'skeleton_mastery': {'value': 'Skeleton Base Life +', 'value2': 'Warrior Base Damage +', 'v3': 'Warrior Velocity +%', 'v4': 'Mage/Archer Velocity +%', 'v5': 'Mage Elemental Damage +%'},
    'golem_mastery': {'value': 'Life +%', 'value2': 'Velocity +%', 'v3': 'Attack Rating +'},
    'iron_maiden': {'value': 'Damage Returned %', 'duration': DUR},
    'weaken': {'value': neg('Enemy Damage %'), 'value2': neg('Enemy Defense %'), 'duration': DUR},
    'amplify_damage': {'value': neg('Enemy Physical Resistance %'), 'duration': DUR},
    'dim_vision': {'value': neg('Enemy Attack Rating'), 'duration': DUR},
    'terror': {'duration': const(3)},
    'life_tap': {'duration': DUR},
    'attract': {'value': neg('Enemy Defense'), 'duration': 'Duration'},
    'decrepify': {'value': neg('Enemy Physical Resistance %'), 'value2': neg('Enemy Movement Speed %'), 'v3': neg('Enemy Attack/Cast Speed %'), 'duration': DUR},
    'lower_resist': {'value': neg('Enemy Fire/Cold/Lightning/Poison Resistance %'), 'duration': DUR},
    # ------------------------------ Paladin ------------------------------
    'sacrifice': {'wdmg': WD, 'ar': AR, 'value': 'Damage to Self %'},
    'smite': {'wdmg': WD, 'stun': 'Stun Length (seconds)', 'v3': 'Crushing Blow Efficiency +%'},
    'holy_bolt': {**dmg('Magic Damage'), **dmg2('Heals')},
    'zeal': {'wdmg': WD, 'ar': AR},
    'charge': {'wdmg': WD, 'ar': AR},
    'vengeance': {**dmg('Fire Damage'), 'ar': AR, 'value': 'Elemental Damage +%'},
    'blessed_hammer': dmg('Magic Damage'),
    'holy_light': {**dmg('Magic Damage'), **dmg2('Heals'), 'radius': const(2)},
    'joust': {'wdmg': WD, 'ar': AR, 'value': 'Critical Strike +%', 'v3': 'Movement Speed +%', 'v4': 'Cooldown (seconds)'},
    'holy_sword': {'value': 'Parry Chance %', 'value2': 'Damage to Demons/Undead +%', 'duration': DUR},
    'holy_nova': {**dmg('Magic Damage'), 'value': 'Heals', 'cooldown': const(4)},
    'holy_shield': {**dmg('Smite Damage +'), 'value': 'Defense +%', 'value2': 'Block Chance +%', 'duration': DUR},
    'fist_of_the_heavens': {**dmg('Lightning Damage'), **dmg2('Bolt Magic Damage')},
    'prayer': {'value': 'Heals', 'value2': 'Life After Each Hit +'},
    'resist_fire': {'value': 'Fire Resistance +%', 'v3': 'Fire Damage +%'},
    'resist_cold': {'value': 'Cold Resistance +%', 'v3': 'Cold Damage +%'},
    'resist_lightning': {'value': 'Lightning Resistance +%', 'v3': 'Lightning Damage +%'},
    'defiance': {'value': 'Defense +%', 'value2': 'Physical Damage Reduction %'},
    'cleansing': {'value': neg('Curse & Poison Duration %')},
    'vigor': {'value': 'Movement Speed +%'},
    'meditation': {'value': 'Mana Recovery +%'},
    'redemption': {'value': 'Chance to Redeem Soul %', 'value2': 'Mana Recovered', 'v3': 'Life Recovered'},
    'salvation': {'value': 'Fire/Cold/Lightning Resistance +%', 'v3': 'Fire/Cold/Lightning Damage +%'},
    'might': {'value': 'Your Damage +%', 'value2': 'Ally Damage +%'},
    'holy_fire': {**dmg('Fire Aura Damage'), **dmg2('Fire Attack Damage'), 'ar': AR, 'radius': half('Radius (yards)')},
    'thorns': {'value': 'Damage Returned', 'v3': 'Open Wounds +%'},
    'blessed_aim': {'value': 'Attack Rating +%', 'value2': 'Deadly Strike +%'},
    'concentration': {'value': 'Your Damage +%', 'value2': 'Ally Damage +%', 'v3': 'Blessed Hammer Damage +%', 'ar': AR},
    'holy_freeze': {**dmg('Cold Aura Damage'), **dmg2('Cold Attack Damage'), 'value': neg('Enemy Speed %'), 'ar': AR, 'radius': const(4)},
    'holy_shock': {**dmg('Lightning Aura Damage'), **dmg2('Lightning Attack Damage'), 'ar': AR, 'radius': const(5.33)},
    'sanctuary': {**dmg('Magic Aura Damage'), **dmg2('Magic Attack Damage'), 'value': neg('Enemy Magic Resistance %'), 'ar': AR, 'radius': const(6)},
    'fanaticism': {'value': 'Your Damage +%', 'value2': 'Ally Damage +%', 'v3': 'Attack Speed +%', 'ar': AR},
    'conviction': {'value': neg('Enemy Defense %'), 'value2': neg('Enemy Fire/Cold/Lightning Resistance %'), 'radius': half('Radius (yards)')},
}

# tables « par point dur » exportées telles quelles (indice = points investis, 0..20)
HARD = {
    'magic_arrow': ['Number of Arrows'], 'penetrate': ['Physical Resistance Pierce %'], 'decoy': ['Number of Decoys'],
    'frenzy': ['Duration (seconds)'], 'concentrate': ['Physical Damage Converted to Magic %'], 'iron_skin': ['Physical Damage Reduction %'],
    'increased_speed': ['Increased Attack Speed +%'], 'combat_reflexes': ['Faster Hit Recovery +%'], 'taunt': ['Duration (seconds)'],
    'battle_command': ['All Skills +'], 'firestorm': ['Number of Tendrils'], 'fire_claws': ['Number of Tendrils'], 'raven': ['Ravens per Cast'],
    'plague_poppy': ['Total Creepers'], 'grizzly': ['Number of Bears'], 'skeletal_mage': ['Number of Magi'], 'raise_skeleton_archer': ['Number of Archers'],
    'revive': ['Number of Revives'], 'golem_mastery': ['Number of Golems'], 'curse_mastery': ['Maximum Curses'], 'blade_shield': ['Damage Frequency (seconds)'],
    'charged_bolt_sentry': ['Number of Bolts'], 'burst_of_speed': ['Attack Speed +%'], 'maul': ['Stun Length (seconds)'], 'hunger': ['Life Steal +%'],
    'eruption': ['Vent Frequency (seconds)'], 'smite': ['Crushing Blow +%'], 'prayer': ['Passive Life Replenish +'], 'meditation': ['Passive Mana after Each Kill'],
    'vigor': ['Passive Faster Run/Walk %'], 'blessed_aim': ['Passive Enemy Defense %'], 'cleansing': ['Passive Curse & Poison Duration %'],
    'resist_fire': ['Passive Maximum Fire Resistance +%'], 'resist_cold': ['Passive Maximum Cold Resistance +%'], 'resist_lightning': ['Passive Maximum Lightning Resistance +%'],
    'exploding_arrow': ['Primary Explosion Radius (yards)'], 'freezing_arrow': ['Radius (yards)'], 'leap': ['Knockback Radius (yards)'],
    'shadow_warrior': [], 'mind_blast': ['Base Radius (yards)', 'Stun Length (seconds)'], 'spirit_barbs': ['Maximum Deadly Strike +%'], 'life_tap': ['Life Steal +%', 'Radius (yards)'], 'terror': ['Enemy Movement Speed %'],
    'decrepify': ['Leap/Leap Attack Speed %', 'Radius (yards)'], 'bone_armor': ['Defense +%'],
    'amplify_damage': ['Radius (yards)'], 'dim_vision': ['Radius (yards)'], 'iron_maiden': ['Radius (yards)'], 'weaken': ['Radius (yards)'],
    'lower_resist': ['Radius (yards)'], 'attract': ['Radius (yards)'],
}

# synergies : description du wiki → type du jeu (les autres ne sont pas des synergies de dégâts)
CURSES = ['amplify_damage', 'dim_vision', 'weaken', 'iron_maiden', 'terror', 'confuse', 'life_tap', 'attract', 'decrepify', 'lower_resist']


def syn_kind(desc):
    d = desc.lower()
    if 'freeze length' in d or 'duration' in d:
        return 'duration'
    if 'absorbed' in d:
        return 'other'
    bad = ('radius', 'returned', 'open wounds', 'conversion', 'healed', 'life', 'mana', 'defense', 'attack rating', 'strength', 'resistance', 'enhanced damage at level')
    if 'damage' in d and not any(b in d for b in bad):
        return 'dmg'
    return None


def fmt(x):
    x = round(x, 4)
    return ('%d' % x) if x == int(x) else ('%g' % x)


def fit(vals):
    """Rampe par paliers (base, inc 2-8, 9-16, 17-22, 23-28, 29+) si elle reproduit la table (arrondis du wiki près)."""
    n = len(vals)
    if n < 29:
        return None
    v = lambda L: vals[L - 1]
    inc = [(v(8) - v(1)) / 7, (v(16) - v(8)) / 8, (v(22) - v(16)) / 6, (v(28) - v(22)) / 6, (v(n) - v(28)) / (n - 28)]
    base = v(1)

    def ramp(L):
        r = base
        r += inc[0] * max(0, min(L, 8) - 1)
        r += inc[1] * max(0, min(L, 16) - 8)
        r += inc[2] * max(0, min(L, 22) - 16)
        r += inc[3] * max(0, min(L, 28) - 22)
        r += inc[4] * max(0, L - 28)
        return r
    tol = lambda x: max(1.01, abs(x) * 0.01)
    if all(abs(ramp(L) - v(L)) <= tol(v(L)) for L in range(1, n + 1)):
        return [base] + inc
    return None


def series(vals, field):
    if all(x == vals[0] for x in vals):
        return '[%s, 0]' % fmt(vals[0]) if field not in RAMP_FIELDS else 'R(%s, 0, 0, 0, 0, 0)' % fmt(vals[0])
    if field not in RAMP_FIELDS:
        # durées, nombres, pourcentages : exacts (linéaire strict, sinon table complète)
        step = vals[1] - vals[0]
        if all(abs(vals[i] - (vals[0] + step * i)) < 0.005 for i in range(len(vals))):
            return '[%s, %s]' % (fmt(vals[0]), fmt(step))
        return 'T([%s])' % ', '.join(fmt(x) for x in vals)
    f = fit(vals)
    if f:
        return 'R(%s)' % ', '.join(fmt(x) for x in f)
    return 'T([%s])' % ', '.join(fmt(x) for x in vals)


RAMP_FIELDS = {'min', 'max', 'min2', 'max2', 'min3', 'max3', 'ar', 'wdmg', 'flat'}
NUM_FIELDS = {'cooldown', 'speed', 'range'}


# coût en mana : la table du wiki quand elle est linéaire (base + par niveau) ; Inferno et Souffle arctique
# (coût par seconde de canalisation) et Furie des lames (coût par lame) gardent leur mode de calcul
MANA_SKIP = {'inferno', 'arctic_blast', 'blade_fury'}
# tables presque linéaires (paliers d'arrondi) : pente moyenne des niveaux 1 à 20
MANA_APPROX = {'frenzy'}


# Druide : coût fixe « Mana Cost: N » des notes du wiki (sans table par niveau), alors que le jeu ajoutait le gain par niveau de D2
MANA_FLAT = {'volcano': 12, 'hurricane': 30, 'armageddon': 35, 'rabies': 10, 'fury': 4, 'plague_poppy': 8}


def mana(sid):
    if sid in MANA_FLAT:
        return 'mana: [%s, 0]' % MANA_FLAT[sid]
    t = WIKI.get(sid, {}).get('tables', {}).get('Mana Cost')
    if not t or sid in MANA_SKIP or len(t) < 20:
        return None
    if sid in MANA_APPROX or all(abs((t[i] - t[0]) - (t[1] - t[0]) * i) < 0.02 for i in range(len(t))):
        slope = (t[19] - t[0]) / 19 if sid in MANA_APPROX else t[1] - t[0]
        return 'mana: [%s, %s]' % (fmt(t[0]), fmt(slope))
    return None


def main():
    nums, syns, hards, missing = [], [], [], []
    for sid in sorted(set(MAP) | {k for k in WIKI if mana(k)}):
        w = WIKI.get(sid)
        if not w:
            missing.append(sid)
            continue
        parts = [mana(sid)] if mana(sid) else []
        for field, spec in MAP.get(sid, {}).items():
            if isinstance(spec, tuple) and spec[0] == 'const':
                v = fmt(spec[1])
                parts.append('%s: %s' % (field, v if field in NUM_FIELDS else 'R(%s, 0, 0, 0, 0, 0)' % v if field in RAMP_FIELDS else '[%s, 0]' % v))
                continue
            sign = 1
            if isinstance(spec, tuple) and spec[0] == 'neg':
                sign, spec = -1, spec[1]
            elif isinstance(spec, tuple) and spec[0] == 'half':
                sign, spec = 0.5, spec[1]
            vals = w['tables'].get(spec)
            if vals is None:
                missing.append('%s.%s ← %s' % (sid, field, spec))
                continue
            parts.append('%s: %s' % (field, series([sign * x for x in vals], field)))
        nums.append('  %s: { %s },' % (sid, ', '.join(parts)))
    for sid in sorted(WIKI):
        out = []
        for target, pct, desc in WIKI[sid]['syn']:
            kind = syn_kind(desc)
            if not kind or not pct:
                continue
            targets = [c for c in CURSES if c not in (sid, 'iron_maiden')] if target == 'all_other_curses' else [target]
            for t in targets:
                if t in WIKI and t != sid and not any(o[0] == t and o[2] == kind for o in out):
                    out.append((t, pct, kind))
        if out:
            syns.append("  %s: [%s]," % (sid, ', '.join("{ skill: '%s', pct: %s, what: '%s' }" % (t, fmt(p), k) for t, p, k in out)))
    for sid in sorted(HARD):
        rows = []
        for t in HARD[sid]:
            vals = WIKI[sid]['tables'].get('hard:' + t)
            if vals is None:
                missing.append('%s hard:%s' % (sid, t))
                continue
            rows.append('%s: [%s]' % (json.dumps(t), ', '.join(fmt(x) for x in vals)))
        if rows:
            hards.append('  %s: { %s },' % (sid, ', '.join(rows)))
    out = """// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Chiffres PD2 S13 des compétences (wiki Project Diablo 2, tables à 60 niveaux) : ils REMPLACENT les champs de même nom des fichiers
 * src/data/skills*.ts (patch des registres à l'activation, index.ts : api.skills.patchNumbers). Rampe par paliers R() quand la table suit
 * les paliers de Skills.txt, table complète T() sinon : exact à tous les niveaux, y compris au-delà de 20 (bonus d'objets). Synergies :
 * api.skills.patchSynergies ; tables par points durs : règle skills.hardValue. Généré par mods/pd2/tools/skilldata/apply-pd2-wiki.py :
 * ne pas modifier à la main.
 */
import { R, T, type SkillDef, type SkillNumbers } from '../../../src/mods/api';

export const PD2_NUMBERS: Record<string, Partial<SkillNumbers>> = {
%s
};

/** Synergies de dégâts (et de durée) du wiki : remplacent celles du même type des fichiers skills*.ts */
export const PD2_SYNERGIES: Record<string, SkillDef['synergies']> = {
%s
};

/** Tables PD2 indexées par points durs (0..20) */
export const PD2_HARD: Record<string, Record<string, number[]>> = {
%s
};
""" % ('\n'.join(nums), '\n'.join(syns), '\n'.join(hards))
    open(os.path.abspath(DEST), 'w').write(out)
    print('écrit', os.path.relpath(DEST, os.getcwd()), len(nums), 'compétences,', len(syns), 'listes de synergies,', len(hards), 'tables dures')
    if missing:
        print('ABSENT du wiki :', '; '.join(missing))


if __name__ == '__main__':
    main()
