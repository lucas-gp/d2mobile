#!/usr/bin/env python3
"""
Extrait du wiki Project Diablo 2 (pages « All_<Classe>_Skills », saison 13) les tables à 60 niveaux de
chaque compétence, ses synergies (« Receives Bonuses From ») et ses notes (puces sous la description).
Écrit mods/pd2/tools/skilldata/pd2-wiki.json (donnée dérivée versionnée), lu par mods/pd2/tools/skilldata/apply-pd2-wiki.py.

    python3 mods/pd2/tools/skilldata/pd2wiki.py                 # télécharge les 7 pages (curl)
    WIKI_DIR=/dossier python3 mods/pd2/tools/skilldata/pd2wiki.py  # pages déjà téléchargées (tmp-All_<Classe>_Skills.html)
"""
import html, json, os, re, subprocess, sys

CLASSES = ['Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress']
URL = 'https://wiki.projectdiablo2.com/wiki/All_%s_Skills'
# noms du wiki → identifiants du jeu (les autres : minuscules, mots joints par « _ »)
ALIAS = {
    'Javelin and Spear Mastery': 'javelin_mastery', 'Claw and Dagger Mastery': 'claw_mastery', 'One Handed Mastery': 'one_hand_mastery',
    'Two Handed Mastery': 'two_hand_mastery', 'Fissure': 'eruption', 'Lycanthropy': 'shape_shifting', 'Summon Ravens': 'raven',
    'Poison Creeper': 'plague_poppy', 'Heart of Wolverine': 'heart_wolverine', 'Summon Spirit Wolf': 'spirit_wolf', 'Carrion Vine': 'cycle_of_life',
    'Spirit of Barbs': 'spirit_barbs', 'Summon Dire Wolf': 'summon_fenris', 'Solar Creeper': 'vines', 'Summon Grizzly': 'grizzly',
    'Raise Skeleton Warrior': 'raise_skeleton', 'Raise Skeletal Mage': 'skeletal_mage', 'Poison Strike': 'poison_dagger', 'Enchant Fire': 'enchant',
}


def sid(name):
    if name in ALIAS:
        return ALIAS[name]
    return re.sub(r'[^a-z0-9]+', '_', name.lower().replace("'", '')).strip('_')


def text(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', s)).replace('\xa0', ' ')).strip()


def page(cls):
    d = os.environ.get('WIKI_DIR')
    if d:
        return open(os.path.join(d, 'tmp-All_%s_Skills.html' % cls), encoding='utf-8').read()
    return subprocess.run(['curl', '-s', '-m', '60', URL % cls], capture_output=True, check=True).stdout.decode('utf-8')


def num(s):
    s = s.replace(',', '').strip()
    try:
        return float(s)
    except ValueError:
        return None


def parse(cls, h):
    out = {}
    parts = re.split(r'<h2 id="[^"]*">', h)[1:]
    for part in parts:
        name = text(part[:part.find('</h2>')])
        if not name or name in ('Navigation', 'Contents'):
            continue
        body = re.split(r'<caption>\s*Changelog', part, 1)[0]  # avant le journal des changements
        rec = {'class': cls, 'name': name, 'tables': {}, 'syn': [], 'notes': []}
        for tb in re.findall(r'<table class="wikitable[^"]*">(.*?)</table>', body, re.S):
            # tables par niveau (colonnes 1..60) ou par niveau « dur » (points investis, colonnes 0..20) : préfixe « hard: »
            first = re.findall(r'<th[^>]*>(.*?)</th>', tb, re.S)
            pre = 'hard:' if first and text(first[0]) == 'Hard Level' else '' if first and text(first[0]) in ('Level', 'Charge') else None
            if pre is None:
                continue
            for tr in re.findall(r'<tr>(.*?)</tr>', tb, re.S):
                th = re.findall(r'<th[^>]*>(.*?)</th>', tr, re.S)
                tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)
                if len(th) not in (1, 2) or not tds:
                    continue
                vals = [num(text(x)) for x in tds]
                if any(v is None for v in vals):
                    continue
                # compétences à charges (Assassin) : « <charge>:<ligne> » (charge 1, 2, 3, « 1 + 3 » ou « All »)
                rec['tables'][pre + ':'.join(text(x) for x in th)] = vals
        # notes : puces avant la première table (« Attacks One Target 3 Times », « Poison Length : 1 Second »)
        head = body.split('<table', 1)[0]
        for ul in re.findall(r'</div>\s*<ul>(.*?)</ul>', head, re.S):
            rec['notes'] += [text(x) for x in re.findall(r'<li>(.*?)</li>', ul, re.S)]
        m = re.search(r'Receives Bonuses From:</b>\s*</p>\s*<ul>(.*?)</ul>', body, re.S | re.I)
        if m:
            for li in re.findall(r'<li>(.*?)</li>', m.group(1), re.S):
                t = text(li)
                mm = re.match(r'(.+?):\s*\+?([\d.]+)%?\s*(.*)$', t)
                if mm:
                    rec['syn'].append([sid(mm.group(1).strip()), float(mm.group(2)), mm.group(3).strip()])
                else:
                    rec['syn'].append([None, 0, t])
        out[sid(name)] = rec
    return out


def main():
    allr = {}
    for c in CLASSES:
        r = parse(c, page(c))
        print(c, len(r), 'compétences')
        allr.update(r)
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pd2-wiki.json')
    # une ligne par table : diff lisibles
    lines = ['{']
    keys = sorted(allr)
    for i, k in enumerate(keys):
        r = allr[k]
        tabs = ',\n'.join('   %s: %s' % (json.dumps(t), json.dumps([int(v) if v == int(v) else v for v in vals])) for t, vals in r['tables'].items())
        lines.append(' %s: {"class": %s, "name": %s, "syn": %s, "notes": %s, "tables": {\n%s\n }}%s' % (
            json.dumps(k), json.dumps(r['class']), json.dumps(r['name']), json.dumps(r['syn'], ensure_ascii=False), json.dumps(r['notes'], ensure_ascii=False), tabs, ',' if i < len(keys) - 1 else ''))
    lines.append('}')
    open(dest, 'w').write('\n'.join(lines) + '\n')
    print(len(allr), 'compétences ->', dest)


if __name__ == '__main__':
    sys.exit(main())
