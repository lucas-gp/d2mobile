"""
Rend une carte de ville D2 exportée (sol + structures) avec la grille de collision en losanges rouges, recadrée autour d'un point du monde.
Usage : python3 tools/audit/town-render.py <id> <x> <y> [demi-largeur en unités=18] [sortie.png]
Sert à repérer les « murs invisibles » : un losange rouge sans élément visible dessous.
"""
import base64, json, os, sys
from PIL import Image, ImageDraw

d = os.path.join(os.environ.get('D2_PRIVATE_DIR') or os.path.expanduser('~/d2-private'), 'out/game/maps')
mid, wx, wy = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
half = float(sys.argv[4]) if len(sys.argv) > 4 else 18
out = sys.argv[5] if len(sys.argv) > 5 else f'tools/audit/out/town-{mid}-view.png'
j = json.load(open(f'{d}/{mid}.json'))
ox, oy = j['canvas']['originX'], j['canvas']['originY']
cols, rows = j['grid']['cols'], j['grid']['rows']
blocked = base64.b64decode(j['grid']['blocked'])
def px(sx, sy):  # centre de sous-tuile -> pixel du canevas
    cx, cy = (sx + .5) / 5, (sy + .5) / 5
    return ox + (cx - cy) * 80, oy + (cx + cy) * 40
cxm, cym = px(wx * 2, wy * 2)
R = half * 2 * 5 * 0  # inutile
W, H = int(half * 2 * 5 * 8), int(half * 2 * 5 * 4)
x0, y0 = int(cxm - W / 2), int(cym - H / 2)
img = Image.new('RGBA', (W, H), (0, 0, 0, 255))
for c in j['ground']['chunks']:
    if c['x'] + c['w'] < x0 or c['x'] > x0 + W or c['y'] + c['h'] < y0 or c['y'] > y0 + H: continue
    img.alpha_composite(Image.open(f"{d}/{c['file']}").convert('RGBA'), (c['x'] - x0, c['y'] - y0)) if c['x'] >= x0 and c['y'] >= y0 else img.paste(Image.open(f"{d}/{c['file']}").convert('RGBA'), (c['x'] - x0, c['y'] - y0), Image.open(f"{d}/{c['file']}").convert('RGBA'))
atl = [Image.open(f"{d}/{a['file']}").convert('RGBA') for a in j['tiles']['hi']]
rects = j['tiles']['hiRects']
for p in sorted(j['places'], key=lambda p: (p[5], p[3] + p[4])):
    r = rects[p[0]]
    px0, py0 = p[1] - x0, p[2] - y0
    if px0 > W or py0 > H or px0 + r[3] < 0 or py0 + r[4] < 0: continue
    tile = atl[r[0]].crop((r[1], r[2], r[1] + r[3], r[2] + r[4]))
    img.alpha_composite(tile, (0, 0), (0, 0)) if False else img.paste(tile, (px0, py0), tile)
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
dr = ImageDraw.Draw(ov)
for sy in range(rows):
    for sx in range(cols):
        if blocked[sy * cols + sx]:
            x, y = px(sx, sy)
            x -= x0; y -= y0
            if -20 < x < W + 20 and -20 < y < H + 20:
                dr.polygon([(x, y - 8), (x + 16, y), (x, y + 8), (x - 16, y)], fill=(255, 0, 0, 90), outline=(255, 255, 0, 160))
img.alpha_composite(ov)
for dec in j['decor']:
    x, y = px(dec[1] * 2, dec[2] * 2)
    ImageDraw.Draw(img).text((x - x0, y - y0), dec[0][4:7], fill=(0, 255, 255, 255))
os.makedirs(os.path.dirname(out), exist_ok=True)
img.convert('RGB').save(out)
print(out, img.size)
