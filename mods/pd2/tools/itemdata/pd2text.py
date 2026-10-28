#!/usr/bin/env python3
"""
Conversion des phrases de propriétés du wiki Project Diablo 2 (« +[20-30]% Enhanced Damage ») en statistiques
de la simulation (identifiants de src/data/stats.ts). parse(phrase) → liste de (stat, min, max, param) ; une phrase
reconnue mais sans effet simulé renvoie [] et est comptée dans `ignored` ; une phrase inconnue est comptée dans
`unhandled`. Partagé par apply-pd2-uniques.py et gen-runewords.py.
"""
import collections
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))

skill_ids = set()
for _f in os.listdir(os.path.join(ROOT, 'src/data')):
    if _f.startswith('skills') and _f.endswith('.ts'):
        skill_ids |= set(re.findall(r"id: '(\w+)'", open(os.path.join(ROOT, 'src/data', _f)).read()))
SUPPORTED = set(re.findall(r"S\('(\w+)'", open(os.path.join(ROOT, 'src/data/stats.ts')).read()))
# noms PD2 → identifiants de compétences du jeu
SKILL_ALIAS = {'raise_skeletal_mage': 'skeletal_mage', 'raise_skeleton_warrior': 'raise_skeleton', 'raise_skeleton_archer': 'raise_skeleton_archer',
               'lycanthropy': 'shape_shifting', 'heart_of_wolverine': 'heart_wolverine', 'enchant_fire': 'enchant', 'summon_spirit_wolf': 'spirit_wolf',
               'summon_grizzly': 'grizzly', 'summon_fenris': 'summon_fenris', 'general_mastery': 'one_hand_mastery', 'javelin_and_spear_mastery': 'javelin_mastery', 'fissure': 'eruption',
               'sword_mastery': 'one_hand_mastery', 'axe_mastery': 'one_hand_mastery', 'mace_mastery': 'one_hand_mastery',
               'polearm_mastery': 'two_hand_mastery', 'spear_mastery': 'two_hand_mastery', 'throwing_mastery': 'throwing_mastery', 'frozen_armor': 'chilling_armor',
               'increased_stamina': 'combat_reflexes', 'thunderstorm': 'thunder_storm', 'holy_bolt': 'holy_bolt', 'fire_ball': 'fire_ball', 'fireball': 'fire_ball',
               'firebolt': 'fire_bolt', 'icebolt': 'ice_bolt', 'ice_blast': 'ice_blast', 'lower_resist': 'lower_resist', 'life_tap': 'life_tap'}

rules = []
unhandled = collections.Counter()
ignored = collections.Counter()

NUM = r'(-?\[?-?\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?\]?)'


def snake(name):
    s = name.strip().lower().replace("'", '').replace('’', '')
    return re.sub(r'[^a-z0-9]+', '_', s).strip('_')


def rng(tok):
    neg = tok.startswith('-[')
    tok = tok.lstrip('-').strip('[]') if neg else tok.strip('[]')
    m = re.match(r'^(-?\d+(?:\.\d+)?)(?:-(-?\d+(?:\.\d+)?))?$', tok)
    lo = float(m.group(1))
    hi = float(m.group(2)) if m.group(2) else lo
    if neg:
        lo, hi = -hi, -lo
    return (lo, hi) if lo <= hi else (hi, lo)


def R(stat, lo, hi=None, param=None):
    hi = lo if hi is None else hi
    return (stat, lo, hi, param)


def rule(pat, fn):
    rules.append((re.compile('^' + pat + '$', re.I), fn))


def simple(pat, stat, sign=1):
    rule(pat, lambda m: [R(stat, *sorted(v * sign for v in rng(m.group(1))))])


def skill_of(name):
    sid = snake(name)
    sid = SKILL_ALIAS.get(sid, sid)
    return sid if sid in skill_ids else None


# --- dégâts ---------------------------------------------------------------------------------
simple(r'\+?' + NUM + r'% Enhanced (?:Weapon )?Damage(?: \((?:Melee|Throwing) Only\))?', 'edPct')
simple(r'\+?' + NUM + r' to Minimum (?:Weapon )?Damage', 'minDmg')
simple(r'\+?' + NUM + r' to Maximum (?:Weapon )?Damage', 'maxDmg')
# « Damage +[40-85] » (dmg-norm D2) : dégâts minimum et maximum ajoutés ; « Damage +9 » : les deux
rule(r'(?:Damage|Adds) \+?\[(\d+)-(\d+)\]', lambda m: [R('minDmg', int(m.group(1))), R('maxDmg', int(m.group(2)))])
rule(r'(?:Damage|Adds) \+?' + NUM, lambda m: [R('minDmg', *rng(m.group(1))), R('maxDmg', *rng(m.group(1)))])
rule(r'Adds ' + NUM + r'(?: to |-)' + NUM + r' (?:Weapon |Physical )?Damage', lambda m: [R('minDmg', *rng(m.group(1))), R('maxDmg', *rng(m.group(2)))])
for word, st in (('Fire', 'addFire'), ('Cold', 'addCold'), ('Lightning', 'addLight'), ('Magic', 'addMagic')):
    rule(r'Adds ' + NUM + r'(?:-| to )' + NUM + ' ' + word + r' Damage(?: \(\w+ Duration: .*\))?',
         (lambda st: lambda m: [R(st + 'Min', *rng(m.group(1))), R(st + 'Max', *rng(m.group(2)))])(st))
    rule(r'\+' + NUM + ' ' + word + ' Damage', (lambda st: lambda m: [R(st + 'Min', *rng(m.group(1))), R(st + 'Max', *rng(m.group(1)))])(st))
    rule(r'\+' + NUM + ' to Maximum ' + word + ' Damage', (lambda st: lambda m: [R(st + 'Max', *rng(m.group(1)))])(st))
    rule(r'\+' + NUM + ' to Minimum ' + word + ' Damage', (lambda st: lambda m: [R(st + 'Min', *rng(m.group(1)))])(st))
rule(r'\+?' + NUM + r' Poison Damage over ([\d.]+) Seconds', lambda m: [R('poisonDmg', *[round(v) for v in rng(m.group(1))])])
rule(r'Adds ' + NUM + r'-' + NUM + r' Poison Damage over ([\d.]+) Seconds', lambda m: [R('poisonDmg', round(rng(m.group(2))[0]), round(rng(m.group(2))[1]))])
simple(r'\+?' + NUM + r' to Attack Rating', 'attackRating')
simple(r'\+?' + NUM + r'% Bonus to Attack Rating', 'arPct')
simple(r'\+?' + NUM + r'% Increased Attack Speed', 'ias')
simple(r'\+?' + NUM + r'% Faster Cast Rate', 'fcr')
simple(r'\+?' + NUM + r'% Faster Hit Recovery', 'fhr')
simple(r'\+?' + NUM + r'% Faster Run/Walk', 'frw')
simple(r'\+?' + NUM + r'% Faster Block Rate', 'fbr')
simple(r'\+?' + NUM + r'% Increased Chance of Blocking', 'block')
simple(r'\+?' + NUM + r'% Life Stolen per Hit', 'lifeLeech')
simple(r'\+?' + NUM + r'% Mana Stolen per Hit', 'manaLeech')
simple(r'\+?' + NUM + r'% Chance of Crushing Blow', 'crushingBlow')
simple(r'\+?' + NUM + r'% Deadly Strike', 'deadlyStrike')
simple(r'\+?' + NUM + r'% Chance of Open Wounds', 'openWounds')
simple(r'\+?' + NUM + r'% Chance to Pierce', 'pierceChance')
simple(r'\+?' + NUM + r'% Damage to Demons', 'dmgDemonPct')
simple(r'\+?' + NUM + r'% Damage to Undead', 'dmgUndeadPct')
simple(r'\+?' + NUM + r' to Attack Rating against Demons', 'arDemon')
simple(r'-?' + NUM + r'% Target Defense', 'reduceDef')
simple(r'Slows Target by ' + NUM + '%', 'slowTarget')
simple(r'Freezes Target \+?' + NUM, 'freezeTarget')
rule(r'Freezes Target', lambda m: [R('freezeTarget', 1)])
simple(r'\+?' + NUM + r' to Kick Damage', 'kickDmg')
simple(r'\+?' + NUM + r'% Chance to Stun', 'stunChance')
rule(r'Knockback', lambda m: [R('knockback', 1)])
rule(r'Indestructible', lambda m: [R('indestructible', 1)])
rule(r'Cannot Be Frozen', lambda m: [R('cbf', 1)])
rule(r'Half Freeze Duration', lambda m: [R('halfFreeze', 1)])
rule(r"Ignore Target'?s Defense", lambda m: [R('ignoreDef', 1)])
rule(r'Melee Attacks Deal Splash Damage', lambda m: [R('splashDmg', 1)])
simple(r'\+?' + NUM + r'% Increased Splash Radius', 'splashRadius')
# --- caractéristiques ------------------------------------------------------------------------
for word, st in (('Strength', 'str'), ('Dexterity', 'dex'), ('Vitality', 'vit'), ('Energy', 'ene')):
    simple(r'\+?' + NUM + r' (?:to )?' + word, st)
simple(r'\+?' + NUM + r' to All Attributes', 'allAttr')
simple(r'\+?' + NUM + r' to Life', 'life')
simple(r'\+?' + NUM + r' to Mana', 'mana')
simple(r'Increase Maximum Life ' + NUM + '%', 'lifePct')
simple(r'Increase Maximum Mana ' + NUM + '%', 'manaPct')
simple(r'\+?' + NUM + r' (?:to )?Mana after each Kill', 'manaPerKill')
simple(r'\+?' + NUM + r' Life after each Kill', 'lifePerKill')
simple(r'Replenish Life \+?' + NUM, 'lifeRegen')
simple(r'Regenerate Mana \+?' + NUM + r'%', 'manaRegenPct')
simple(r'\+?' + NUM + r'% Damage Taken Gained as Mana when Hit', 'dmgToMana')
simple(NUM + r'% Damage Gained as Mana when Hit', 'dmgToMana')
simple(r'\+?' + NUM + r' to Light Radius', 'lightRadius')
simple(r'\+?' + NUM + r'% Extra Gold from Monsters', 'gf')
simple(r'\+?' + NUM + r'% Better Chance of Getting Magic Items', 'mf')
simple(r'\+?' + NUM + r'% to Experience Gained', 'xpPct')
simple(r'Requirements \+?' + NUM + '%', 'reqPct', -1)
# --- défense -------------------------------------------------------------------------------
simple(r'\+?' + NUM + r'% Enhanced Defense', 'defPct')
simple(r'\+?' + NUM + r' Defense', 'defFlat')
simple(r'\+?' + NUM + r' Defense vs\. Missile', 'defMissile')
simple(r'\+?' + NUM + r' Defense vs\. Melee', 'defMelee')
simple(r'All Resistances \+?' + NUM + '%?', 'resAll')
for word, st in (('Cold', 'Cold'), ('Fire', 'Fire'), ('Lightning', 'Light'), ('Poison', 'Poison')):
    simple(word + r' Resist(?:ance)? \+?' + NUM + '%', 'res' + st)
    simple(r'\+?' + NUM + r'% to Maximum ' + word + ' Resist(?:ance)?', 'maxRes' + st)
    simple(r'-' + NUM + r'% to Enemy ' + word + ' Resistance', 'pierce' + st)
    simple(r'\+?' + NUM + r'% (?:to )?' + word + ' Skill Damage', {'Light': 'lightDmgPct'}.get(st, st.lower() + 'DmgPct'))
    if st != 'Poison':
        simple(word + r' Absorb \+?' + NUM + '%', 'absorb' + st)
simple(r'\+?' + NUM + r'% to All Maximum Resistances', 'maxResAll')
simple(r'Physical Damage Taken Reduced by ' + NUM, 'drFlat')
simple(r'Physical Damage Taken Reduced by ' + NUM + '%', 'dr')
simple(r'Damage Reduced by ' + NUM, 'drFlat')
simple(r'Damage Reduced by ' + NUM + '%', 'dr')
simple(r'Magic Damage Taken Reduced by ' + NUM, 'mdr')
simple(r'Magic Damage Reduced by ' + NUM, 'mdr')
simple(r'\+?' + NUM + r' Magic Absorb', 'mdr')
simple(r'Poison Length Reduced by ' + NUM + '%', 'poisonLength')
simple(r'Attacker Takes Damage of ' + NUM, 'thornsFlat')
simple(r'Attacker Takes Lightning Damage of ' + NUM, 'lightThornsFlat')
simple(r'\+?' + NUM + r'% Cooldown Reduction', 'cooldownRed')
# --- par niveau du personnage ----------------------------------------------------------------
PERLVL = {'Life': 'lifePerLvl', 'Mana': 'manaPerLvl', 'Strength': 'strPerLvl', 'Dexterity': 'dexPerLvl', 'Vitality': 'vitPerLvl', 'Defense': 'defPerLvl',
          'Attack Rating': 'attackRatingPerLvl', 'Maximum Damage': 'maxDmgPerLvl', 'Attack Rating against Demons': None, 'Attack Rating against Undead': None,
          'Maximum Fire Damage': None, 'Maximum Lightning Damage': 'maxLightDmgPerLvl', 'Maximum Cold Damage': 'maxColdPerLvl'}
PCT = r'\(\+?\[?([\d.]+)(?:-([\d.]+))?\]?%? per Character Level\)'


def perlvl(m):
    st = PERLVL.get(m.group(2))
    if st is None:
        ignored[m.group(0)] += 1
        return []
    lo = float(m.group(3))
    hi = float(m.group(4)) if m.group(4) else lo
    return [R(st, lo, hi)]


rule(r'\+?' + NUM + r' (?:to )?(Life|Mana|Strength|Dexterity|Vitality|Defense|Attack Rating(?: against Demons| against Undead)?|Maximum (?:Fire |Lightning |Cold )?Damage) ' + PCT, perlvl)
rule(NUM + r'% Better Chance of Getting Magic Items ' + PCT, lambda m: [R('mfPerLvl', float(m.group(2)), float(m.group(3) or m.group(2)))])
rule(r'\+?' + NUM + r'% Enhanced Maximum Damage ' + PCT, lambda m: [R('edMaxPctPerLvl', float(m.group(2)), float(m.group(3) or m.group(2)))])
for word, st in (('Fire', 'resFirePerLvl'), ('Cold', 'resColdPerLvl'), ('Lightning', 'resLightPerLvl')):
    rule(word + r' Resist(?:ance)? \+?' + NUM + r'% ' + PCT, (lambda st: lambda m: [R(st, float(m.group(2)), float(m.group(3) or m.group(2)))])(st))
rule(r'Attacker Takes Damage of ' + NUM + ' ' + PCT, lambda m: [R('thornsPerLvl', float(m.group(2)), float(m.group(3) or m.group(2)))])
rule(r'Cold Absorb ' + NUM + '%? ' + PCT, lambda m: [R('absorbColdPerLvl', float(m.group(2)), float(m.group(3) or m.group(2)))])
# --- compétences ---------------------------------------------------------------------------
simple(r'\+?' + NUM + r' to All Skills(?: \((?:Non-)?Staves Only\))?', 'allSkills')
CLASS_STAT = {'amazon': 'amzSkills', 'sorceress': 'sorcSkills', 'necromancer': 'necSkills', 'paladin': 'palSkills', 'barbarian': 'barSkills', 'druid': 'druidSkills', 'assassin': 'asnSkills'}
TREE_STAT = {'bow and crossbow': 'amzBowSkills', 'passive and magic': 'amzPassiveSkills', 'javelin and spear': 'amzJavelinSkills', 'fire': 'fireSkills', 'lightning': 'lightSkills',
             'cold': 'coldSkills', 'curses': 'necCurseSkills', 'poison and bone': 'necPoisonSkills', 'summoning': ('necSummonSkills', 'summonSkills'), 'offensive auras': 'palOffenseSkills',
             'defensive auras': 'palDefenseSkills', 'combat skills': ('palCombatSkills', 'barCombatSkills'), 'masteries': 'barMasterySkills', 'warcries': 'barWarcrySkills',
             'elemental': 'eleSkills', 'shape shifting': 'shapeSkills', 'shapeshifting': 'shapeSkills', 'traps': 'asnTrapSkills', 'shadow disciplines': 'asnShadowSkills',
             'martial arts': 'asnMartialSkills'}


def cls_rule(m):
    return [R(CLASS_STAT[m.group(2).lower()], *rng(m.group(1)))]


rule(r'\+' + NUM + r' to (Amazon|Sorceress|Necromancer|Paladin|Barbarian|Druid|Assassin) Skill Levels', cls_rule)
rule(r'\+' + NUM + r' to (Amazon|Sorceress|Necromancer|Paladin|Barbarian|Druid|Assassin) Skills', cls_rule)


def tree_rule(m):
    st = TREE_STAT.get(m.group(2).lower())
    cls = (m.group(3) or '').lower()
    if isinstance(st, tuple):
        st = st[1] if cls in ('druid', 'barbarian') else st[0]
    if not st:
        return []
    return [R(st, *rng(m.group(1)))]


rule(r'\+' + NUM + r' to (Fire|Cold|Lightning|Curses|Poison and Bone|Summoning|Offensive Auras|Defensive Auras|Combat Skills|Masteries|Warcries|Elemental|Shape ?Shifting|'
     r'Traps|Shadow Disciplines|Martial Arts|Bow and Crossbow|Passive and Magic|Javelin and Spear)(?: Skills)?(?: \((Amazon|Sorceress|Necromancer|Paladin|Barbarian|Druid|Assassin) Only\))?', tree_rule)


def oskill_rule(m):
    if re.search(r'Skills|Spells', m.group(2)):
        return None  # arbre de compétences : règle suivante
    sid = skill_of(m.group(2))
    if not sid:
        ignored['skill:' + m.group(2)] += 1
        return []
    return [R('oskill', *rng(m.group(1)), sid)]


rule(r'\+' + NUM + r' to ([A-Za-z\' -]+?) \((?:Amazon|Sorceress|Necromancer|Paladin|Barbarian|Druid|Assassin) Only\)', oskill_rule)
rule(r'\+' + NUM + r' to ([A-Za-z\' -]+?)(?: \((?:Non-Staves Only|Staves Only)\))?', lambda m: oskill_rule(m) if not re.search(r'Skills|Spells|All |Light Radius|Attack Rating|Life|Mana', m.group(2)) else None)

PROC = {'on striking': 'procHit', 'when struck': 'procGetHit', 'on attack': 'procAtt', 'on casting': 'procCast', 'when you die': None, 'when you level-up': 'procLevelUp',
        'when you kill an enemy': 'procKill', 'on block': 'procBlock', 'on melee attack': 'procAtt', 'on hit': 'procHit'}


def proc_rule(m):
    chance, lvl, sk, when = int(m.group(1)), int(m.group(2)), m.group(3), m.group(4).lower()
    sid = skill_of(sk)
    stat = PROC.get(when)
    if not sid or not stat:
        ignored['proc:' + sk + ' ' + when] += 1
        return []
    return [R(stat, chance, chance, '%s:%d' % (sid, lvl))]


rule(r'(\d+)% Chance to Cast Level (\d+) (.+?) (on Striking|when Struck|on Attack|on Melee Attack|on Casting|on Hit|when you Die|when you Level-Up|when you Kill an Enemy|on Block)', proc_rule)


def aura_rule(m):
    sid = skill_of(m.group(2))
    if not sid:
        ignored['aura:' + m.group(2)] += 1
        return []
    return [R('itemAura', *rng(m.group(1)), sid)]


rule(r'Level ' + NUM + r' (.+?) Aura When Equipped', aura_rule)

# variantes d'écriture du wiki
simple(r'\+?' + NUM + r' Enhanced Damage', 'edPct')
simple(r'\+?' + NUM + r'% Attack Speed', 'ias')
simple(r'\+?' + NUM + r' Maximum Damage', 'maxDmg')
simple(r'\+?' + NUM + r' Kick Damage', 'kickDmg')
simple(r'\+?' + NUM + r'% Increased Mana', 'manaPct')
simple(r'Melee Splash Radius Increased by ' + NUM + '%', 'splashRadius')
simple(r'Hit Causes Monsters? to Flee \+?' + NUM + '%', '-')
for word, st in (('Cold', 'Cold'), ('Fire', 'Fire'), ('Lightning', 'Light'), ('Poison', 'Poison')):
    simple(r'\+?' + NUM + '% ' + word + ' Resist(?:ance)?', 'res' + st)
    simple(r'-' + NUM + r'% Enemy ' + word + ' Resistance', 'pierce' + st)
rule(r'Socketed \(?' + NUM + r'\)?', lambda m: [R('socketsAdded', *rng(m.group(1).replace('(', '').replace(')', '')))])
rule(r'Socketed \((\d+)-(\d+)\)', lambda m: [R('socketsAdded', int(m.group(1)), int(m.group(2)))])
rule(r'\+' + NUM + r' to Poison (?:and Bone )?(?:Skills|Spells)(?: \(Necromancer Only\))?', lambda m: [R('necPoisonSkills', *rng(m.group(1)))])
rule(r'\+' + NUM + r' to Magic Skills', lambda m: [R('amzPassiveSkills', *rng(m.group(1)))])
rule(r'\+' + NUM + r' (Masteries|Warcries) \(Barbarian Only\)', lambda m: [R('barMasterySkills' if m.group(2) == 'Masteries' else 'barWarcrySkills', *rng(m.group(1)))])
rule(r'\+?' + NUM + r'% Reanimate As: Returned', lambda m: [R('reanimateReturned', *rng(m.group(1)))])


def proc_range(m):
    lo, hi = rng(m.group(2))
    m2 = re.match(r'(.*)', '')
    return proc_rule(_Fake(m.group(1), round((lo + hi) / 2), m.group(3), m.group(4)))


class _Fake:
    def __init__(self, *g):
        self.g = g

    def group(self, i):
        return self.g[i - 1]


rule(r'(\d+)% Chance to Cast Level (\[\d+-\d+\]) (.+?) (on Striking|when Struck|on Attack|on Melee Attack|on Casting|on Hit|when you Die|when you Level-Up|when you Kill an Enemy|on Kill|on Block)', proc_range)
rule(r'(\d+)% Chance to Cast Level (\d+) (.+?) (on Kill)', lambda m: proc_rule(_Fake(m.group(1), m.group(2), m.group(3), 'when you kill an enemy')))
rule(r'(\d+)% Chance to Cast Level (\d+) (.+?) on Striking or Casting', lambda m: proc_rule(_Fake(m.group(1), m.group(2), m.group(3), 'on striking')))
rule(r'Level ' + NUM + r' (Sanctuary|Might|Concentration|Conviction|Fanaticism|Thorns|Defiance|Blessed Aim|Holy Fire|Holy Freeze|Holy Shock|Meditation|Prayer|Vigor|Cleansing|Redemption|Salvation|Resist Fire|Resist Cold|Resist Lightning) when Equipped', aura_rule)

# restes « After » simulés (S13) : résistance aux malédictions, frappe mortelle, pénétration physique, blessures ouvertes, invocations
simple(r'Curse Resistance \+?' + NUM + r'%', 'curseRes')
simple(r'' + NUM + r'% Reduced Curse Duration', 'curseRes')
simple(r'\+?' + NUM + r'% Deadly Strike Multiplier', 'deadlyMult')
simple(r'\+?' + NUM + r'% Maximum Deadly Strike', 'maxDeadly')
simple(r'-' + NUM + r'% to Enemy Physical Resistance', 'piercePhys')
simple(r'\+?' + NUM + r' Open Wounds Damage per Second', 'openWoundsDps')
rule(r'You May Apply an Additional Curse', lambda m: [R('extraCurse', 1)])
SUMMON = {'skeleton warriors or skeleton archers': ['raise_skeleton', 'raise_skeleton_archer'], 'skeleton archers': ['raise_skeleton_archer'], 'skeleton warriors': ['raise_skeleton'],
          'skeleton mages': ['skeletal_mage'], 'spirit wolves': ['spirit_wolf'], 'revives': ['revive'], 'golem': ['golem_mastery'], 'golems': ['golem_mastery'], 'grizzlies': ['grizzly']}


def summon_rule(m):
    sk = SUMMON.get(m.group(2).lower())
    if not sk:
        ignored['summon:' + m.group(2)] += 1
        return []
    return [R('extraSummon', *rng(m.group(1)), s) for s in sk]


rule(r'You May (?:Now )?Summon \+?' + NUM + r' Additional (.+?)', summon_rule)

# reconnues mais non simulées (charges, défense par type, endurance, réparation…)
IGNORED = re.compile(r"^(Prevent Monster Heal|.*Curse Resistance.*|.*Curse Duration.*|Replenishes Quantity.*|Increased Stack Size.*|or|and|.*Deadly Strike Multiplier|.*Maximum Deadly Strike.*|.*Critical Strike.*|Drain Life.*|.*Monster Defense per Hit|.*Enemy Physical Resistance|.*per Character Level\).*|.*Charges\) / Replenish.*|.*Life after each (?:Demon Kill|Hit)|.*Reanimate [Aa]s.*|You May .*|You Cannot .*|Your .*|.*Crushing Blow Efficiency|.*Cooldown is Reduced.*|.*Leap.*|.*Random .*|.*\+?X to .*|.*Blood Warp.*|.*on Block|.*Fires \[?\d.*|.*Vendor Prices.*|.* / .*|.*Based on Missing Life.*|.*Absorb(?:s Cold Damage)?(?: \(.*)?|Level \d+ .+ When Equipped|Lightning \+\d+%|.*Only\)|Requirements \+?\d+%|Hit Blinds Target|Hit Causes Monster to Flee|Rest in Peace|Drain Life|Repairs|Replenishes Quantity|Summon|"
                     r"Level \d+ .+ \(\d+(?:/\d+)? Charges\)|Level \[\d+-\d+\] .+ \(\d+ Charges\)|.*Attack Rating against Undead.*|.*Stamina.*|Slain Monsters Rest in Peace|"
                     r"Monster Defense|Curse Resistance|Fires .*|Increased Stack Size|.*Durability.*|Ethereal.*|Socketed.*|Reanimate.*|Cannot be Sold.*|.*Open Wounds Damage.*|"
                     r"Lightning Resist.*|.*Throwing Only.*|.*Staves Only.*|Character Level \d+ .+|.*Display.*|You May Apply an Additional Curse|.*Lower Resist.*|"
                     r"Removed|Hit Causes Monster to Flee.*|.*Damage Reduced by.*vs.*|.*Crushing Blow Damage.*|Life Steal is.*|.*Uninterruptible.*|Shared Sockets.*)$", re.I)


def normalize(ph):
    ph = re.sub(r'\s+', ' ', ph or '').strip().rstrip('*').strip()
    ph = re.sub(r'\[(-?\d+)-(\d+)%\]', r'[\1-\2]%', ph)
    for a, b in (('Damaged Taken', 'Damage Taken'), ('Stolen Her Hit', 'Stolen per Hit'), ('FireResist', 'Fire Resist'), ('Per Hit', 'per Hit')):
        ph = ph.replace(a, b)
    return ph


def parse(ph, ctx=''):
    """Une phrase → liste de stats (vide si non simulée). Phrases inconnues comptées dans `unhandled`."""
    ph = normalize(ph)
    if not ph:
        return []
    for pat, fn in rules:
        m = pat.match(ph)
        if m:
            got = fn(m)
            if got is None:
                continue
            ok = [g for g in got if g[0] in SUPPORTED]
            if len(ok) < len(got):
                ignored[ph] += 1
            elif not got:
                ignored[ph] += 1
            return ok
    if IGNORED.match(ph):
        ignored[ph] += 1
        return []
    unhandled[ph] += 1
    return []


def recognized(ph):
    """Vrai si la phrase est reconnue par une règle (même sans effet simulé)."""
    ph = re.sub(r'\s+', ' ', ph or '').strip().rstrip('*').strip()
    return any(p.match(ph) for p, _ in rules) or bool(IGNORED.match(ph))


def fmt_num(v):
    return str(int(v)) if float(v).is_integer() else repr(round(float(v), 4))


def fmt(stats):
    parts = []
    for st, lo, hi, par in stats:
        args = fmt_num(lo) + ('' if hi == lo and not par else ', ' + fmt_num(hi)) + (", '%s'" % par if par else '')
        parts.append("r('%s', %s)" % (st, args))
    return '[' + ', '.join(parts) + ']'
