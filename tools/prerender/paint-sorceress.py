"""
Atlas de couleurs des bâtons de la Sorcière et du Druide, dérivé de l'atlas CC0 KayKit du Mage : chaque case
(nuancier 128×256 : 8 colonnes × 4 rangées d'une image 1024²) est recolorée en conservant son dégradé de luminance. Bâton de bois sombre à
orbe violet, inspiré de la Sorcière de Diablo II (référence de style seulement).
    python3 tools/prerender/paint-sorceress.py
"""
from PIL import Image

DIR = 'assets-src/characters/kaykit-adventurers/accessories/'
CW, CH = 128, 256


def hexrgb(h):
    return ((h >> 16) & 255, (h >> 8) & 255, h & 255)


def recolor(im, col, row, target, gain=1.0):
    px = im.load()
    x0, y0 = col * CW, row * CH
    lums = []
    for y in range(y0, y0 + CH):
        for x in range(x0, x0 + CW):
            r, g, b, a = px[x, y]
            lums.append(0.2126 * r + 0.7152 * g + 0.0722 * b)
    mean = max(1.0, sum(lums) / len(lums))
    tr, tg, tb = target if isinstance(target, tuple) else hexrgb(target)
    i = 0
    for y in range(y0, y0 + CH):
        for x in range(x0, x0 + CW):
            k = (lums[i] / mean) ** gain
            i += 1
            a = px[x, y][3]
            px[x, y] = (min(255, int(tr * k)), min(255, int(tg * k)), min(255, int(tb * k)), a)


def copy_cell(im, src, dst):
    c = im.crop((src[0] * CW, src[1] * CH, src[0] * CW + CW, src[1] * CH + CH))
    im.paste(c, (dst[0] * CW, dst[1] * CH))


# bâton (atlas Mage) : bois sombre torsadé, griffes de bois, orbe et gemmes violets
staff = Image.open(DIR + 'mage_texture.png').convert('RGBA')
recolor(staff, 5, 1, 0x5a3a24)  # bois
recolor(staff, 3, 1, 0x4a3020)  # griffes (métal gris → bois sombre)
recolor(staff, 6, 2, 0xa048e8, 0.6)  # orbe
recolor(staff, 2, 2, 0x8a3ad0, 0.6)  # gemmes
staff.save(DIR + 'sorceress_staff_texture.png')
print('atlas écrit :', DIR + 'sorceress_staff_texture.png')

# bâton du Druide (même modèle) : bois clair noueux, griffes de bois, orbe et gemmes vert mousse
staff = Image.open(DIR + 'mage_texture.png').convert('RGBA')
recolor(staff, 5, 1, 0x7a5a34)  # bois
recolor(staff, 3, 1, 0x5a4026)  # griffes
recolor(staff, 6, 2, 0x5ad060, 0.6)  # orbe
recolor(staff, 2, 2, 0x3a9a48, 0.6)  # gemmes
staff.save(DIR + 'druid_staff_texture.png')
print('atlas écrit :', DIR + 'druid_staff_texture.png')
