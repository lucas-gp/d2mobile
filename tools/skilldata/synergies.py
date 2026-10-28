#!/usr/bin/env python3
"""
Extrait les synergies de dégâts de toutes les compétences depuis Skills.txt de Project Diablo 2
(colonnes EDmgSymPerCalc = dégâts élémentaires, DmgSymPerCalc = dégâts d'arme), lu depuis D2DATA.
Écrit un JSON { id_compétence: [[id_source, pct_par_niveau_investi, 'dmg'], …] } (par défaut
mods/pd2/tools/skilldata/synergies-pd2.json, versionné : c'est une donnée dérivée, pas la table brute).

    D2DATA=/chemin python3 tools/skilldata/synergies.py [sortie.json]
"""
import ast, csv, json, operator, os, re, sys

D = os.environ.get('D2DATA')


def snake(name):
    s = name.strip().lower().replace("'", '').replace("’", '')
    return re.sub(r'[^a-z0-9]+', '_', s).strip('_')


class Lin:
    def __init__(self, d=None):
        self.d = dict(d or {})

    def __add__(self, o):
        r = Lin(self.d)
        if isinstance(o, Lin):
            for k, v in o.d.items():
                r.d[k] = r.d.get(k, 0) + v
        return r

    __radd__ = __add__

    def __mul__(self, c):
        return Lin({k: v * c for k, v in self.d.items()})

    __rmul__ = __mul__


_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}


def lin_eval(expr):
    """Évalue une formule de synergie SANS eval (un Skills.txt piégé ne doit pas exécuter de code) : nombres, + - * /, parenthèses,
    L('<id>') ; tout le reste lève ValueError (formule ignorée, comme avant)."""
    if len(expr) > 2000:
        raise ValueError('formule trop longue')

    def ev(n):
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.Constant) and type(n.value) in (int, float):
            return n.value
        if isinstance(n, ast.BinOp) and type(n.op) in _OPS:
            return _OPS[type(n.op)](ev(n.left), ev(n.right))
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.USub):
            return -1 * ev(n.operand)
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == 'L' and len(n.args) == 1 and not n.keywords:
            a = n.args[0]
            if isinstance(a, ast.Constant) and isinstance(a.value, str):
                return Lin({a.value: 1.0})
        raise ValueError('construction refusée : %s' % type(n).__name__)

    return ev(ast.parse(expr, mode='eval'))


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def main():
    if not D:
        sys.exit('D2DATA requis (dossier contenant Skills13.txt ou Skills.txt)')
    path = os.path.join(D, 'Skills13.txt') if os.path.exists(os.path.join(D, 'Skills13.txt')) else os.path.join(D, 'Skills.txt')
    rows = [r for r in csv.DictReader(open(path, encoding='latin-1'), delimiter='\t') if r.get('skill')]
    out = {}
    for r in rows:
        sid = snake(r['skill'])
        syn = {}
        for col in ('EDmgSymPerCalc', 'DmgSymPerCalc'):
            f = (r.get(col) or '').strip()
            if not f:
                continue
            env = {'skill': None}
            expr = re.sub(r"skill\('([^']+)'\.blvl\)", lambda m: "L(%r)" % snake(m.group(1)), f)
            expr = re.sub(r"\bpar(\d)\b", lambda m: repr(num(r.get('Param' + m.group(1)))), expr)
            try:
                lin = lin_eval(expr)
            except Exception as e:  # noqa: BLE001
                print('formule ignorée', sid, f, e, file=sys.stderr)
                continue
            if isinstance(lin, Lin):
                for k, v in lin.d.items():
                    if v:
                        syn[k] = syn.get(k, 0) + v
        if syn:
            out[sid] = sorted([[k, round(v, 3), 'dmg'] for k, v in syn.items()], key=lambda x: x[0])

    dest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'mods', 'pd2', 'tools', 'skilldata', 'synergies-pd2.json')
    json.dump(out, open(dest, 'w'), indent=1, ensure_ascii=False)
    print(len(out), 'compétences avec synergies ->', dest)


if __name__ == '__main__':
    main()
