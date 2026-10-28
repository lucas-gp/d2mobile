#!/usr/bin/env python3
"""Musiques de Diablo II pour le jeu (usage privé, sorties hors dépôt) : les morceaux utiles à chaque zone du jeu (d2music.mpq, ADPCM +
Huffman décodés par StormLib) en MP3 mono 22 kHz 48 kbit/s, ajoutés à l'index de extract.py sous la clé « music ».
  python3 tools/d2audio/music.py [--out $D2_PRIVATE_DIR/out]"""
import json, os, subprocess, sys, tempfile

sys.path.insert(0, os.path.dirname(__file__))
import storm  # noqa: E402

H = os.path.join(os.environ.get('D2_PRIVATE_DIR') or os.path.expanduser('~/d2-private'), '')
args = sys.argv[1:]
OUT = os.path.expanduser(args[args.index('--out') + 1]) if '--out' in args else H + 'out'
AUDIO = os.path.join(OUT, 'game', 'audio')
os.makedirs(AUDIO, exist_ok=True)

# (la musique de l'Acte V est dans d2xmusic.mpq, absent des archives utilisées : Harrogath, le Trône de Baal et les cartes reprennent d'autres morceaux)
# clé du jeu → fichier de d2music.mpq (Sounds.txt : ESOUND_MUSIC_*)
TRACKS = {
    'town': 'act1\\town1.wav',
    'tristram': 'act1\\tristram.wav',
    'wilderness': 'act1\\wild.wav',
    'tombs': 'act2\\tombs.wav',
    'crypt': 'act1\\crypt.wav',
    'kurast': 'act3\\kurast.wav',
    'chaos': 'act4\\diablo.wav',
    'sanctuary': 'act2\\sanctuary.wav',
    'mesa': 'act4\\mesa.wav',
    'caves': 'act1\\caves.wav',
    'monastery': 'act1\\monastery.wav',
    'desert': 'act2\\desert.wav',
    'harem': 'act2\\harem.wav',
    'lair': 'act2\\lair.wav',
    'sewer': 'act2\\sewer.wav',
    'valley': 'act2\\valley.wav',
    'town2': 'act2\\town2.wav',
    'jungle': 'act3\\jungle.wav',
    'kurastsewer': 'act3\\kurastsewer.wav',
    'spider': 'act3\\spider.wav',
    'town3': 'act3\\town3.wav',
    'town4': 'act4\\town4.wav',
    'options': 'common\\options.wav',
    # courtes phrases de quête (joueuses une fois : mort d'un boss)
    'st_andariel': 'act1\\andarielaction.wav',
    'st_bloodraven': 'act1\\bloodravenresolution.wav',
    'st_den': 'act1\\denofevilaction.wav',
    'st_horadric': 'act2\\horadricaction.wav',
    'st_radament': 'act2\\radamentresolution.wav',
    'st_tainted': 'act2\\taintedsunaction.wav',
    'st_mephisto': 'act3\\mefdeathaction.wav',
    'st_orb': 'act3\\orbaction.wav',
    'st_forge': 'act4\\forgeaction.wav',
    'st_izual': 'act4\\izualaction.wav',
}
arch = storm.Archive(H + 'audio-in/d2music.mpq')
tmp = tempfile.mkdtemp(prefix='d2music-', dir=H)
music = {}
for key, f in TRACKS.items():
    d = arch.get('data\\global\\music\\' + f)
    if d is None:
        print('absent :', f)
        continue
    w = os.path.join(tmp, key + '.wav')
    open(w, 'wb').write(d)
    dst = os.path.join(AUDIO, f'music-{key}.mp3')
    p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', w, '-ac', '1', '-ar', '22050', '-c:a', 'libmp3lame', '-b:a', '48k', dst], capture_output=True)
    os.remove(w)
    if p.returncode:
        print('échec :', f, p.stderr[:200])
        continue
    music[key] = {'file': f'music-{key}.mp3', 'l': os.path.getsize(dst)}
    print(f'{key:12} {music[key]["l"] / 1048576:.1f} Mo')
ip = os.path.join(AUDIO, 'index.json')
index = json.load(open(ip)) if os.path.exists(ip) else {'v': 1, 'sounds': {}}
index['music'] = music
json.dump(index, open(ip, 'w'), separators=(',', ':'))
os.rmdir(tmp)
print(f'{len(music)} morceaux, {sum(m["l"] for m in music.values()) / 1048576:.1f} Mo')
