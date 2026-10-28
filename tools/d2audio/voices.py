#!/usr/bin/env python3
"""Voix des PNJ de Harrogath (d2xtalk.mpq : Larzuk, Malah, Qual-Kehk, Anya) pour le jeu (usage privé, sorties hors dépôt) : phrases de bavardage et
salutations (les dialogues de quête sont écartés), MP3 mono 22 kHz 40 kbit/s, ajoutés à l'index de extract.py sous la clé « voices ».
  python3 tools/d2audio/voices.py [--out $D2_PRIVATE_DIR/out]"""
import json, os, re, subprocess, sys, tempfile

sys.path.insert(0, os.path.dirname(__file__))
import storm  # noqa: E402

H = os.path.join(os.environ.get('D2_PRIVATE_DIR') or os.path.expanduser('~/d2-private'), '')
args = sys.argv[1:]
OUT = os.path.expanduser(args[args.index('--out') + 1]) if '--out' in args else H + 'out'
AUDIO = os.path.join(OUT, 'game', 'audio')
os.makedirs(AUDIO, exist_ok=True)

NPCS = {'larzuk': 'Larzuk', 'malah': 'Malah', 'qual_kehk': 'Qual-Kehk', 'anya': 'Anya'}
SKIP = re.compile(r'(_q\d|_intro|_complete|_entry|_rescue|_init|_early|_after|_successful|_found|_secret|_ama|_asn|_bar|_dru|_nec|_pal|_sor|_ama_)', re.I)
arch = storm.Archive(H + 'audio-in/d2xtalk.mpq')
names = [n.strip() for n in arch.get('(listfile)').decode('latin1').split('\n') if n.strip()]
tmp = tempfile.mkdtemp(prefix='d2voices-', dir=H)
voices = {}
for key, folder in NPCS.items():
    files = [n for n in names if re.match(r'data\\local\\sfx\\Act5\\' + re.escape(folder) + r'\\', n, re.I) and not SKIP.search(n.split('\\')[-1])]
    out = []
    for n in sorted(files):
        d = arch.get(n)
        if not d:
            continue
        w = os.path.join(tmp, 'v.wav')
        open(w, 'wb').write(d)
        dst = os.path.join(AUDIO, f'voice-{key}-{len(out)}.mp3')
        if os.path.exists(dst):
            os.remove(dst)
        p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', w, '-ac', '1', '-ar', '22050', '-c:a', 'libmp3lame', '-b:a', '40k', dst], capture_output=True)
        if p.returncode:
            continue
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst], capture_output=True, text=True).stdout.strip() or 0)
        if dur > 9:  # les longs monologues de bavardage ne se rejouent pas à chaque toucher
            os.remove(dst)
            continue
        out.append(os.path.basename(dst))
    voices[key] = out
    print(f'{key:10} {len(out)} phrases')
# phrases de bavardage numérotées (dialogue des PNJ) : ESOUND_<PNJ>_ACT5_GOSSIP_<n> dans Sounds.txt ↔ texte « <Pnj>Gossip<n> » ; toutes les durées
import csv
rows = list(csv.reader(open(os.path.join(OUT, 'Sounds.txt'), encoding='latin1'), delimiter='\t'))
gossip = {}
# (clé du jeu, nom de son, acte) : Harrogath (d2xtalk) et Actes I et IV (d2speech)
HANDLE = {'larzuk': ('LARZUK', 5), 'malah': ('MALAH', 5), 'anya': ('ANYA', 5), 'qual_kehk': ('QUALKEHK', 5),
          'akara': ('AKARA', 1), 'charsi': ('CHARSI', 1), 'gheed': ('GHEED', 1), 'kashya': ('KASHYA', 1), 'warriv': ('WARRIV', 1), 'cain1': ('CAIN', 1),
          'tyrael': ('TYRAEL', 4), 'cain4': ('CAIN', 4), 'jamella': ('JAMELLA', 4), 'halbu': ('HALBU', 4),
          'atma': ('ATMA', 2), 'fara': ('FARA', 2), 'drognan': ('DROGNAN', 2), 'lysander': ('LYSANDER', 2), 'elzix': ('ELZIX', 2), 'greiz': ('GREIZ', 2), 'geglash': ('GEGLASH', 2),
          'meshif': ('MESHIF', 2), 'jerhyn': ('JERHYN', 2), 'cain2': ('CAIN', 2), 'warriv2': ('WARRIV', 2),
          'ormus': ('ORMUS', 3), 'hratli': ('HRATLI', 3), 'asheara': ('ASHEARA', 3), 'alkor': ('ALKOR', 3), 'natalya': ('NATALYA', 3), 'meshif3': ('MESHIF', 3), 'cain3': ('CAIN', 3)}
ARCHS = [arch] + [storm.Archive(H + 'audio-in/' + f) for f in ('d2speech.mpq', 'd2sfx.mpq') if os.path.exists(H + 'audio-in/' + f)]
for key, (hname, act) in HANDLE.items():
    lst = []
    for r in rows[1:]:
        m = re.match(r'ESOUND_' + hname + r'_ACT' + str(act) + r'_GOSSIP_(\d+)$', r[0])
        if not m or len(r) < 3:
            continue
        d = None
        for a in ARCHS:
            d = a.get('data\\local\\sfx\\' + r[2].replace('/', '\\'))
            if d:
                break
        if not d:
            continue
        w = os.path.join(tmp, 'g.wav')
        open(w, 'wb').write(d)
        n = int(m.group(1))
        dst = os.path.join(AUDIO, f'gossip-{key}-{n}.mp3')
        p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', w, '-ac', '1', '-ar', '22050', '-c:a', 'libmp3lame', '-b:a', '40k', dst], capture_output=True)
        if p.returncode == 0:
            lst.append({'n': n, 'f': os.path.basename(dst)})
    gossip[key] = sorted(lst, key=lambda e: e['n'])
    print(f'{key:10} {len(lst)} phrases de bavardage')
ip = os.path.join(AUDIO, 'index.json')
index = json.load(open(ip)) if os.path.exists(ip) else {'v': 1, 'sounds': {}}
index['voices'] = voices
index['gossip'] = gossip
json.dump(index, open(ip, 'w'), separators=(',', ':'))
for f in os.listdir(tmp):
    os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
print('total', sum(len(v) for v in voices.values()), 'phrases,', round(sum(os.path.getsize(os.path.join(AUDIO, f)) for v in voices.values() for f in v) / 1048576, 1), 'Mo')
