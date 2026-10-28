# d2audio — sons et musiques de Diablo II (usage privé)

Comme l'importeur d'images (`tools/d2import`) : **rien de Blizzard n'est jamais commité** ; les archives et les sorties sont hors dépôt
(`$D2_PRIVATE_DIR/`). Les sons de D2 sont en ADPCM + Huffman, que l'importeur TypeScript ne décode pas : on passe par **StormLib** (ctypes).

## Mise en place

```bash
mkdir -p $D2_PRIVATE_DIR/tools/deb && cd $D2_PRIVATE_DIR/tools/deb
apt-get download libstorm9 libtomcrypt1 libtommath1      # sans installation système
for f in *.deb; do dpkg -x $f ../root; done              # StormLib est alors dans $D2_PRIVATE_DIR/tools/root (ou D2_STORMLIB_DIR)
```

Archives : graphismes dans `$D2_PRIVATE_DIR/in` (d2data, d2char, d2exp), audio dans `$D2_PRIVATE_DIR/audio-in` (d2sfx, d2music, d2speech, d2xtalk).

## Commandes

```bash
python3 tools/d2audio/extract.py   # ~2 800 sons (Sounds.txt) → MP3 mono 22 kHz, en 135 paquets par « propriétaire » (classe, famille de monstres, objets…) : 16 Mo
python3 tools/d2audio/music.py     # 10 morceaux de zone (d2music.mpq) → MP3 mono 48 kbit/s : 17 Mo
```

Sortie : `<sortie>/game/audio/{index.json, pack-<nom>.bin, music-<clé>.mp3}`. `index.json` : `sounds` (handle → paquet, offset, longueur, volume,
boucle) et `music` (clé → fichier). Le dossier `game/` est ensuite servi sous `/d2/` en local par le serveur de développement.

Écartés : dialogues des PNJ et de quêtes, scènes. La musique de l'Acte V (`d2xmusic.mpq`) n'est pas fournie dans les archives utilisées : Harrogath, le Trône de Baal et les cartes reprennent
des morceaux des Actes I-IV (`MOOD_MUSIC`).

## Dans le jeu

`src/platform/d2sounds.ts` (index, paquets, décodage à la demande), `d2sound-map.ts` (événements → groupes : compétences, impacts, armes, monstres, objets,
pas, ambiances, musiques ; testé par `tests/unit/d2-sound-map.test.ts`) et `audio.ts`. Sans import, ou pour un son manquant ou pas encore décodé, le moteur
garde ses sons d'origine (échantillons CC0 et synthèse). Les Réglages n'ont rien de spécial : le curseur de musique règle aussi les morceaux D2.

## Mode local (navigateur)

Le jeu sait produire les mêmes fichiers (`audio/index.json`, paquets, musiques, voix) **dans le navigateur** à partir des archives du joueur, sans
StormLib ni ffmpeg : `tools/d2import/{mpq-audio,audio-build}.ts` (voir `tools/d2import/BROWSER.md`, phase 6). Cette chaîne Python reste la référence :
`tools/d2import/check-audio.ts` compare le décodage TypeScript à une extraction StormLib, octet pour octet.
