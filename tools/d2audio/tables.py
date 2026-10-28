"""Tables .txt de D2 (colonnes séparées par des tabulations) lues dans les archives"""
import os, re
from storm import Vfs

H = os.path.join(os.environ.get('D2_PRIVATE_DIR') or os.path.expanduser('~/d2-private'), '')

def open_vfs():
    return Vfs([H + 'in/d2char.mpq', H + 'in/d2data.mpq', H + 'in/d2exp.mpq'])

def table(v, name):
    raw = v.get(f'data\\global\\excel\\{name}.txt')
    if raw is None:
        raise FileNotFoundError(name)
    lines = raw.decode('latin1').replace('\r', '').split('\n')
    head = lines[0].split('\t')
    rows = []
    for l in lines[1:]:
        if not l.strip():
            continue
        c = l.split('\t')
        rows.append({head[i]: (c[i] if i < len(c) else '') for i in range(len(head))})
    return rows

def norm(s):
    return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')
