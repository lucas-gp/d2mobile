"""
Sons du jeu : sélection d'échantillons CC0 de Kenney (assets-src/audio/kenney/, packs RPG Audio,
Impact Sounds, Interface Sounds, Sci-Fi Sounds) convertis en MP3 mono légers (lisibles partout,
iPhone compris) dans public/audio/, avec un index {nom: nombre de variantes}.
Le moteur audio (src/platform/audio.ts) les superpose aux sons procéduraux, qui restent le repli.
    pip install imageio-ffmpeg && python3 tools/audio/build-audio.py
"""
import json
import os
import subprocess

import imageio_ffmpeg

SRC = 'assets-src/audio/kenney/'
OUT = 'public/audio/'
FF = imageio_ffmpeg.get_ffmpeg_exe()

# nom de jeu → fichiers sources (variantes tirées au hasard), durée max (s)
SOUNDS = {
    'coins': (['handleCoins.ogg', 'handleCoins2.ogg'], 0.9),
    'drop': (['dropLeather.ogg', 'impactGeneric_light_000.ogg', 'impactGeneric_light_001.ogg'], 0.5),
    'clink': (['impactGlass_light_000.ogg', 'impactGlass_light_001.ogg', 'impactGlass_light_002.ogg'], 0.4),
    'bell': (['impactBell_heavy_000.ogg'], 1.5),
    'step_snow': ([f'footstep_snow_00{i}.ogg' for i in range(5)], 0.4),
    'step_stone': ([f'footstep_concrete_00{i}.ogg' for i in range(5)], 0.3),
    'step_grass': ([f'footstep_grass_00{i}.ogg' for i in range(5)], 0.35),
    'hurt': (['impactPunch_medium_000.ogg', 'impactPunch_medium_001.ogg', 'impactPunch_medium_002.ogg'], 0.45),
    'thud': (['impactSoft_medium_000.ogg', 'impactSoft_medium_001.ogg', 'impactSoft_medium_002.ogg'], 0.3),
    'boom': (['explosionCrunch_000.ogg', 'explosionCrunch_001.ogg', 'explosionCrunch_002.ogg'], 0.8),
    'boom_low': (['lowFrequency_explosion_000.ogg'], 1.6),
    'ice': (['impactGlass_medium_000.ogg', 'impactGlass_medium_001.ogg', 'impactGlass_medium_002.ogg'], 0.55),
    'tele': (['forceField_000.ogg'], 0.7),
    'zap': (['laserSmall_000.ogg', 'laserSmall_001.ogg', 'laserSmall_002.ogg'], 0.3),
    'click': (['click_001.ogg', 'click_002.ogg'], 0.15),
    'error': (['error_001.ogg'], 0.25),
    'confirm': (['confirmation_001.ogg'], 0.4),
}

os.makedirs(OUT, exist_ok=True)
index = {}
total = 0
for name, (files, dur) in SOUNDS.items():
    for i, f in enumerate(files):
        dst = f'{OUT}{name}_{i}.mp3'
        fade = max(0.02, dur * 0.15)
        subprocess.run(
            [FF, '-y', '-loglevel', 'error', '-i', SRC + f, '-t', str(dur), '-af', f'afade=t=out:st={dur - fade}:d={fade}', '-ac', '1', '-ar', '22050', '-b:a', '48k', dst],
            check=True,
        )
        total += os.path.getsize(dst)
    index[name] = len(files)
with open(OUT + 'index.json', 'w') as fp:
    json.dump(index, fp, indent=1)
print(f'{sum(index.values())} fichiers, {total / 1024:.0f} Ko → {OUT}')
