#!/usr/bin/env python3
"""Sons de Diablo II pour le jeu (usage privé, sorties hors dépôt) : lit Sounds.txt, décode les WAV des MPQ (StormLib :
ADPCM + Huffman), les convertit en MP3 mono léger (ffmpeg) et les regroupe en paquets par « propriétaire » (classe, famille de monstres,
objets…) chargés à la demande. Sortie : <sortie>/game/audio/{index.json, pack-<nom>.bin}.
  python3 tools/d2audio/extract.py [--out $D2_PRIVATE_DIR/out] [--only <propriétaire>,…]
Le jeu lit index.json : { sounds: { HANDLE: {p: paquet, o: offset, l: longueur, v: volume 0-1, loop: 0|1, d: durée s} } }."""
import json, os, re, subprocess, sys, tempfile, concurrent.futures as cf

sys.path.insert(0, os.path.dirname(__file__))
import storm  # noqa: E402

H = os.path.join(os.environ.get('D2_PRIVATE_DIR') or os.path.expanduser('~/d2-private'), '')
args = sys.argv[1:]
OUT = os.path.expanduser(args[args.index('--out') + 1]) if '--out' in args else H + 'out'
ONLY = args[args.index('--only') + 1].split(',') if '--only' in args else None
AUDIO = os.path.join(OUT, 'game', 'audio')
os.makedirs(AUDIO, exist_ok=True)

ARCHIVES = [('speech', 'audio-in/d2speech.mpq'), ('xtalk', 'audio-in/d2xtalk.mpq'), ('data', 'in/d2data.mpq'), ('sfx', 'audio-in/d2sfx.mpq'), ('exp', 'in/d2exp.mpq')]
arch = [storm.Archive(H + p) for _, p in ARCHIVES]  # la dernière gagne


import threading
LOCK = threading.Lock()  # StormLib n'est pas réentrante : les lectures d'archives sont sérialisées, seules les conversions ffmpeg tournent en parallèle


def find(path):
  with LOCK:
    for a in reversed(arch):
        d = a.get(path)
        if d is not None:
            return d
    return None


# --- Sounds.txt (dans d2data, éventuellement remplacé par d2exp)
# Sounds.txt de d2data/d2exp : celui du patch 1.13c nomme les sons autrement (« cursor_pass » sans préfixe ESOUND_) et ne correspond plus aux noms utilisés par le jeu
sounds_txt = next(a.get('data\\global\\excel\\Sounds.txt') for a in reversed(arch[:5]) if a.get('data\\global\\excel\\Sounds.txt') is not None).decode('latin1').splitlines()
head = sounds_txt[0].split('\t')
rows = []
for l in sounds_txt[1:]:
    c = l.split('\t')
    if len(c) > 5 and c[0].startswith('ESOUND_'):
        rows.append(dict(zip(head, c)))

# --- filtre : on garde ce qui s'entend en jeu, pas les dialogues de quêtes ni les scènes
NPC = {'CAIN', 'WARRIV', 'AKARA', 'KASHYA', 'CHARSI', 'GHEED', 'DROGNAN', 'ATMA', 'FARA', 'LYSANDER', 'GREIZ', 'ELZIX', 'GEGLASH', 'MESHIF',
       'ORMUS', 'HRATLI', 'ALKOR', 'ASHEARA', 'JERHYN', 'NATALYA', 'TYRAEL', 'LARZUK', 'MALAH', 'ANYA', 'QUALKEHK', 'NIHLATHAK', 'IZUAL'}
DROP = re.compile(r'(_ACT\d|CHAT_|_FIND_|_COMPLETE|_BEGIN|_NEAR_|_TRIGGER|_RESCUE|NEEDKEY|IMPOSSIBLE|CANTCARRY|CANTUSEYET|NOT_IN_TOWN|^ESOUND_SCENE|^ESOUND_QUEST|^ESOUND_MUSIC|^ESOUND_CORRUPT)')
ROOM = {'COMMON'}


def owner(handle):
    parts = handle[len('ESOUND_'):].split('_')
    o = parts[0]
    if o in ('IMPACT', 'WEAPON', 'LIGHT', 'MEDIUM', 'HEAVY', 'ITEM', 'CURSOR', 'OBJECT', 'SHRINE'):
        return 'common'
    if o == 'EVENT':
        return 'event-' + parts[1].lower()
    if o == 'MONSTER':
        return 'monster-skills'
    return o.lower()


wanted = []
seen = set()
for r in rows:
    if r['Handle'] in seen:
        continue
    seen.add(r['Handle'])
    fn = r['FileName']
    if fn == 'none.wav' or DROP.search(r['Handle']):
        continue
    o = owner(r['Handle'])
    # PNJ : seulement leurs salutations à l'ouverture du dialogue (pas de dialogues de quêtes)
    if o.upper() in NPC and not re.search(r'_GREETING_\d$', r['Handle']):
        continue
    if ONLY and o not in ONLY:
        continue
    wanted.append((r, o))
print(f'{len(wanted)} sons retenus sur {len(rows)}')

tmp = tempfile.mkdtemp(prefix='d2audio-', dir=H)


def convert(item):
    r, o = item
    fn = r['FileName']
    data = None
    for base in ('data\\global\\sfx\\', 'data\\local\\sfx\\', 'data\\local\\sfx\\common\\'):
        data = find(base + fn)
        if data is not None:
            break
    if data is None:
        return (r, o, None, 0)
    w = os.path.join(tmp, r['Index'] + '.wav')
    m = w[:-4] + '.mp3'
    open(w, 'wb').write(data)
    # ambiances et musiques longues : plus légères ; effets : 48 kbit/s mono (le jeu est en mono)
    p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', w, '-ac', '1', '-ar', '22050', '-c:a', 'libmp3lame', '-b:a', '40k', m], capture_output=True)
    os.remove(w)
    if p.returncode != 0 or not os.path.exists(m):
        return (r, o, None, 0)
    b = open(m, 'rb').read()
    os.remove(m)
    dur = max(0, (len(data) - 44)) / 2 / 22050 if data[:4] == b'RIFF' else 0
    return (r, o, b, dur)


results = []
with cf.ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as ex:
    for i, res in enumerate(ex.map(convert, wanted)):
        results.append(res)
        if i % 500 == 0:
            print(f'  {i}/{len(wanted)}', flush=True)

packs = {}
index = {}
failed = []
for r, o, b, dur in results:
    if b is None:
        failed.append(r['Handle'])
        continue
    pk = packs.setdefault(o, bytearray())
    index[r['Handle']] = {'p': o, 'o': len(pk), 'l': len(b), 'v': round(int(r['Volume'] or 255) / 255, 3), 'loop': int(r['Loop'] or 0)}
    pk.extend(b)
for o, b in packs.items():
    open(os.path.join(AUDIO, f'pack-{o}.bin'), 'wb').write(bytes(b))
if ONLY and os.path.exists(os.path.join(AUDIO, 'index.json')):
    old = json.load(open(os.path.join(AUDIO, 'index.json')))['sounds']
    old.update(index)
    index = old
ip = os.path.join(AUDIO, 'index.json')
old = json.load(open(ip)) if os.path.exists(ip) else {}  # les musiques (music.py) et les voix (voices.py) sont conservées
json.dump({'v': 1, 'sounds': index, 'music': old.get('music', {}), 'voices': old.get('voices', {}), 'gossip': old.get('gossip', {})}, open(ip, 'w'), separators=(',', ':'))
tot = sum(len(b) for b in packs.values())
print(f'{len(index)} sons, {len(packs)} paquets, {tot / 1048576:.1f} Mo ; {len(failed)} échecs {failed[:6]}')

import shutil
shutil.rmtree(tmp, ignore_errors=True)
