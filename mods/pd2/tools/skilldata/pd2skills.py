#!/usr/bin/env python3
"""
Extrait des tables Project Diablo 2 (saison 13 : Skills.txt et SkillDesc.txt, lus depuis D2DATA) les
données des compétences des cinq classes D2 : niveau requis, prérequis directs, position dans l'arbre,
coût en mana, précision, dégâts d'arme (%) et dégâts élémentaires (échantillonnés aux niveaux de gen.py).
Écrit tools/skilldata/pd2-skills.json (donnée dérivée versionnée ; les tables brutes restent hors dépôt).

    D2DATA=/dossier python3 mods/pd2/tools/skilldata/pd2skills.py

D2DATA doit contenir Skills13.txt et SkillDesc13.txt (copies de season-13/Skills.txt et SkillDesc.txt).
"""
import ast, csv, json, operator, os, re, sys

D = os.environ.get('D2DATA')
if not D and __name__ == '__main__':
    sys.exit('D2DATA requis')
LV = [1, 2, 3, 8, 9, 16, 17, 20]
CLASSES = {'ama': 'amazon', 'sor': 'sorceress', 'nec': 'necromancer', 'pal': 'paladin', 'bar': 'barbarian', 'dru': 'druid', 'ass': 'assassin'}
# noms internes PD2 → identifiants du jeu
ALIAS = {
    'royal_strike': 'phoenix_strike', 'ampdmg': 'amplify_damage', 'lowres': 'lower_resist', 'irongolem': 'iron_golem',
    'firegolem': 'fire_golem', 'bloodgolem': 'blood_golem', 'raise_skeletal_mage': 'skeletal_mage', 'dopplezon': 'decoy',
    'shock_field': 'shock_web', 'fire_trauma': 'fire_blast', 'quickness': 'burst_of_speed', 'wake_of_fire_sentry': 'wake_of_fire',
    'inferno_sentry': 'wake_of_inferno', 'wearwolf': 'werewolf', 'wearbear': 'werebear', 'curmas': 'curse_mastery',
    'javelin_and_spear_mastery': 'javelin_mastery',
}


def snake(name):
    s = name.strip().lower().replace("'", '').replace('’', '')
    s = re.sub(r'[^a-z0-9]+', '_', s).strip('_')
    return ALIAS.get(s, s)


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def load(f):
    return list(csv.DictReader(open(os.path.join(D, f), encoding='latin-1'), delimiter='\t'))


def elen(row, lvl):
    v = num(row.get('ELen'))
    for L in range(2, lvl + 1):
        v += num(row.get('ELevLen1' if L <= 8 else 'ELevLen2' if L <= 16 else 'ELevLen3'))
    return v


def calc(f, row, lvl):
    """Évalue une formule Skills.txt (synergies = 0)."""
    if f is None or not f.strip():
        return 0.0
    par = [num(row.get('Param%d' % i)) for i in range(1, 9)]
    e = f.strip()
    # tables d'expressions : edmn/edns = dégâts élémentaires min, edmx/edxs = max, toht = précision, edln = durée
    tab = {'edmn': edmg(row, lvl, 'Min'), 'edns': 256 * edmg(row, lvl, 'Min'), 'edmx': edmg(row, lvl, 'Max'), 'edxs': 256 * edmg(row, lvl, 'Max'),
           'toht': num(row.get('ToHit')) + num(row.get('LevToHit')) * (lvl - 1), 'edln': elen(row, lvl)}
    e = re.sub(r'\b(edmn|edns|edmx|edxs|toht|edln)\b', lambda m: repr(tab[m.group(1)]), e)
    e = re.sub(r"skill\('[^']+'\.\w+\)", '0', e)
    e = re.sub(r"stat\('[^']+'\.\w+\)", '0', e)
    e = re.sub(r'\bln(\d)(\d)\b', lambda m: '(%r+(lvl-1)*%r)' % (par[int(m.group(1)) - 1], par[int(m.group(2)) - 1]), e)
    e = re.sub(r'\bdm(\d)(\d)\b', lambda m: '(%r+((%r-%r)*110*lvl)/(100*(lvl+6)))' % (par[int(m.group(1)) - 1], par[int(m.group(2)) - 1], par[int(m.group(1)) - 1]), e)
    e = re.sub(r'\bpar(\d)\b', lambda m: repr(par[int(m.group(1)) - 1]), e)
    if '?' in e:
        e = re.sub(r'\(([^()?]*)\)\s*\?\s*([^:()]+?)\s*:\s*([^)]+?)\)', r'(\2 if \1 else \3))', e)
    try:
        return float(safe_eval(e, {'lvl': lvl, 'blvl': lvl}))
    except Exception:  # noqa: BLE001
        return float('nan')


# Évaluation des formules SANS eval : un Skills.txt piégé (fichier de mod téléchargé) ne doit pas pouvoir exécuter de code.
# Seuls les nombres, les noms de `names`, l'arithmétique, les comparaisons, and / or / not, « a if c else b » et min / max sont admis.
_BIN = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv, ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod}
_CMP = {ast.Lt: operator.lt, ast.LtE: operator.le, ast.Gt: operator.gt, ast.GtE: operator.ge, ast.Eq: operator.eq, ast.NotEq: operator.ne}
_FN = {'min': min, 'max': max}


def safe_eval(expr, names):
    """Évalue une expression arithmétique (voir ci-dessus) ; toute autre construction lève ValueError."""
    if len(expr) > 2000:
        raise ValueError('formule trop longue')

    def ev(n):
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.Constant) and type(n.value) in (int, float):
            return n.value
        if isinstance(n, ast.Name) and n.id in names:
            return names[n.id]
        if isinstance(n, ast.BinOp) and type(n.op) in _BIN:
            return _BIN[type(n.op)](ev(n.left), ev(n.right))
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, (ast.USub, ast.UAdd, ast.Not)):
            v = ev(n.operand)
            return -v if isinstance(n.op, ast.USub) else +v if isinstance(n.op, ast.UAdd) else not v
        if isinstance(n, ast.BoolOp) and isinstance(n.op, (ast.And, ast.Or)):
            v = ev(n.values[0])
            for x in n.values[1:]:
                if (not v) if isinstance(n.op, ast.And) else v:
                    break
                v = ev(x)
            return v
        if isinstance(n, ast.Compare) and all(type(o) in _CMP for o in n.ops):
            left = ev(n.left)
            for o, c in zip(n.ops, n.comparators):
                right = ev(c)
                if not _CMP[type(o)](left, right):
                    return False
                left = right
            return True
        if isinstance(n, ast.IfExp):
            return ev(n.body) if ev(n.test) else ev(n.orelse)
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in _FN and not n.keywords and n.args:
            return _FN[n.func.id](*[ev(a) for a in n.args])
        raise ValueError('construction refusée : %s' % type(n).__name__)

    return ev(ast.parse(expr, mode='eval'))


def mana(row, lvl):
    v = (num(row.get('mana')) + num(row.get('lvlmana')) * (lvl - 1)) * (2 ** int(num(row.get('manashift')))) / 256.0
    mn = num(row.get('minmana'))
    return max(v, mn) if mn else v


def edmg(row, lvl, which):
    v = num(row.get('E' + which))
    levs = [num(row.get('E%sLev%d' % (which, i))) for i in range(1, 6)]
    for L in range(2, lvl + 1):
        v += levs[0 if L <= 8 else 1 if L <= 16 else 2 if L <= 22 else 3 if L <= 28 else 4]
    return v


def dmg_calc(row):
    """Formule (calcN) du pourcentage de dégâts d'arme, d'après sa description."""
    for k in ('calc1', 'calc2', 'calc3', 'calc4'):
        d = (row.get('*%s desc' % k) or '').lower()
        if re.search(r'(damage|dmg|dm)\s*(%|percent)', d) and 'splash' not in d and 'synergy' not in d and 'convert' not in d and 'self' not in d and 'per' not in d.replace('percent', ''):
            return k
    return None


def main():
    skills = {r['skill']: r for r in load('Skills13.txt') if r.get('skill')}
    desc = {r['skilldesc']: r for r in load('SkillDesc13.txt') if r.get('skilldesc')}
    out = {}
    for name, r in skills.items():
        cc = r.get('charclass')
        if cc not in CLASSES:
            continue
        d = desc.get(r.get('skilldesc'))
        if not d or int(num(d.get('SkillPage'))) not in (1, 2, 3):
            continue
        sid = snake(name)
        rec = {
            'name': name, 'class': CLASSES[cc], 'page': int(num(d['SkillPage'])), 'row': int(num(d['SkillRow'])), 'col': int(num(d['SkillColumn'])),
            'reqLvl': int(num(r.get('reqlevel'))), 'prereqs': [snake(r['reqskill%d' % i]) for i in (1, 2, 3) if r.get('reqskill%d' % i)],
            'passive': r.get('passive') == '1', 'srvdofunc': r.get('srvdofunc'),
            'mana': [round(mana(r, 1), 4), round(mana(r, 2) - mana(r, 1), 4)],
            'ar': [num(r.get('ToHit')), num(r.get('LevToHit'))] if r.get('ToHit') or r.get('LevToHit') else None,
        }
        k = dmg_calc(r)
        if k:
            rec['wdmgCalc'] = r.get(k)
            rec['wdmg'] = [round(calc(r.get(k), r, L), 2) for L in LV]
        if r.get('EMin') or r.get('EMax') or r.get('EMinLev1'):
            rec['etype'] = r.get('EType')
            rec['min'] = [round(edmg(r, L, 'Min'), 2) for L in LV]
            rec['max'] = [round(edmg(r, L, 'Max'), 2) for L in LV]
        # effets passifs / d'aura : statistique -> échantillons (formules passivecalcN / aurastatcalcN)
        pc, ac = {}, {}
        for i in range(1, 7):
            st, cf = r.get('passivestat%d' % i), r.get('passivecalc%d' % i)
            if st and cf:
                pc[st] = [round(calc(cf, r, L), 3) for L in LV]
            st, cf = r.get('aurastat%d' % i), r.get('aurastatcalc%d' % i)
            if st and cf:
                ac[st] = [round(calc(cf, r, L), 3) for L in LV]
        if pc:
            rec['pcalc'] = pc
        if ac:
            rec['acalc'] = ac
        rec['raw'] = {kk: r[kk] for kk in ('calc1', 'calc2', 'calc3', 'calc4', 'Param1', 'Param2', 'Param3', 'Param4', 'Param5', 'Param6', 'Param7', 'Param8', 'SrcDam', 'HitShift', 'srvmissile', 'srvmissilea', 'aurastat1', 'aurastat2', 'passivestat1', 'passivestat2') if r.get(kk)}
        rec['calcDesc'] = {kk: r['*%s desc' % kk] for kk in ('calc1', 'calc2', 'calc3', 'calc4') if r.get('*%s desc' % kk)}
        out[sid] = rec
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pd2-skills.json')
    json.dump(out, open(dest, 'w'), indent=1, ensure_ascii=False)
    print(len(out), 'compétences PD2 ->', dest)


if __name__ == '__main__':
    main()
