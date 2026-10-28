/** Import de personnages Diablo II (.d2s) : lecteur, conversion vers la sauvegarde du jeu, rapport */
import { describe, expect, it } from 'vitest';
import { encodeD2s, newItem, type FakeChar } from './d2s-encoder';
import { parseD2s, D2sFormatError } from '../../src/sim/d2s/parse';
import { importD2s, reportLines } from '../../src/sim/d2s/convert';
import { D2S_TABLES as T } from '../../src/sim/d2s/tables';
import { Game } from '../../src/sim/game';
import { deserialize, serialize } from '../../src/sim/save';
import { itemFinal, itemName } from '../../src/sim/itemstats';
import { computeDerived } from '../../src/sim/character';
import { maxDurability } from '../../src/sim/durability';

const uniq = (n: string) => T.uniques.findIndex((u) => u[0] === n);
const setIt = (n: string) => T.sets.findIndex((u) => u[0] === n);
const rw = (n: string) => Number(Object.entries(T.runewords).find(([, v]) => v[0] === n)![0]);
const pre = (n: string) => T.prefixes.findIndex((u) => u[0] === n) + 1;
const suf = (n: string) => T.suffixes.findIndex((u) => u[0] === n) + 1;
const rune = (code: string) => newItem(code, { simple: true, location: 6, page: 0 });

function fake(): FakeChar {
  return {
    name: 'Zorg',
    classIndex: 1,
    level: 80,
    difficulty: 1,
    baalNormal: true,
    attrs: { str: 60, ene: 150, dex: 70, vit: 200, statPoints: 3, skillPoints: 2, xp: 0, gold: 4321, stashGold: 99999, hp: 800, mana: 600 },
    // Boule de feu (id 47), Orbe de glace (59), Blizzard (64), Téléportation (54), Maîtrise du froid (65), Armure de givre (50)
    skills: { 47: 20, 59: 20, 64: 20, 54: 1, 65: 20, 50: 5 },
    items: [
      // casque magique : +15 % défense, +7 force, +20 résistance au feu (préfixe Solide, suffixe du Renard)
      newItem('xap', {
        location: 1,
        equipped: 1,
        defense: 90,
        maxDur: 12,
        dur: 6,
        quality: 4,
        magicPrefix: pre('Sturdy'),
        magicSuffix: suf('of the Fox'),
        props: [
          { id: 16, v: [15] },
          { id: 0, v: [7] },
          { id: 39, v: [20] },
          { id: 188, param: 1, extra: 2, v: [2] },
        ],
      }),
      // anneau unique : la Pierre de Jordan
      newItem('rin', {
        location: 1,
        equipped: 6,
        quality: 7,
        uniqueId: uniq('The Stone of Jordan'),
        props: [
          { id: 127, v: [1] },
          { id: 9, v: [25] },
          { id: 50, v: [1, 12] },
        ],
      }),
      // amulette rare
      newItem('amu', {
        location: 1,
        equipped: 2,
        quality: 6,
        rareName1: 1,
        rareName2: 156,
        rareAffixes: [1, 5],
        props: [
          { id: 80, v: [27] },
          { id: 105, v: [10] },
          { id: 204, param: 54, extra: 5, v: [5, 5] },
        ],
      }),
      // mot runique : Esprit (Tal Thul Ort Amn) sur une épée de cristal à 4 châsses
      newItem('crs', {
        location: 1,
        equipped: 4,
        quality: 2,
        runeword: true,
        runewordId: rw('Spirit'),
        socketed: true,
        sockets: 4,
        children: ['r07', 'r10', 'r09', 'r11'].map(rune),
        maxDur: 70,
        dur: 70,
        rwProps: [{ id: 105, v: [35] }],
      }),
      // bouclier : éthéré, supérieur
      newItem('xsh', { location: 1, equipped: 5, quality: 3, ethereal: true, defense: 150, maxDur: 20, dur: 20, props: [{ id: 16, v: [10] }] }),
      // pièce de set dans l'inventaire (case 3,1)
      newItem('lrg', { x: 3, y: 1, quality: 5, setId: setIt("Civerb's Ward"), defense: 40, maxDur: 60, dur: 60, setProps: [[{ id: 36, v: [10] }]], props: [{ id: 20, v: [30] }] }),
      // charme magique, rune et gemme en vrac, potions dans la ceinture, tome sans équivalent
      newItem('cm3', { x: 7, y: 1, quality: 4, magicPrefix: pre('Sturdy'), props: [{ id: 0, v: [3] }] }),
      newItem('r24', { simple: true, x: 5, y: 0 }),
      newItem('gpr', { simple: true, x: 6, y: 0 }),
      newItem('hp5', { simple: true, location: 2, page: 0, x: 0 }),
      newItem('hp5', { simple: true, location: 2, page: 0, x: 1 }),
      newItem('mp3', { simple: true, location: 2, page: 0, x: 2 }),
      newItem('tbk', { simple: true, x: 9, y: 0 }),
      // objet du coffre personnel
      newItem('7cr', { page: 5, x: 2, y: 2, quality: 2, maxDur: 20, dur: 20 }),
      // arme de rechange
      newItem('wnd', { location: 1, equipped: 11, quality: 2, maxDur: 20, dur: 20 }),
    ],
    merc: { type: 7, items: [newItem('xap', { location: 1, equipped: 1, defense: 90, maxDur: 12, dur: 12 })] },
  };
}

describe('lecteur .d2s', () => {
  it('relit en-tête, attributs, compétences et objets', () => {
    const c = parseD2s(encodeD2s(fake()));
    expect(c.name).toBe('Zorg');
    expect(c.classId).toBe('sorceress');
    expect(c.level).toBe(80);
    expect(c.attrs.energy).toBe(150);
    expect(c.attrs.gold).toBe(4321);
    expect(c.attrs.stashGold).toBe(99999);
    expect(c.skills[59 - 36]).toBe(20);
    expect(c.difficulty).toBe(1);
    expect(c.baalDone).toEqual([true, false, false]);
    expect(c.items).toHaveLength(15);
    const rwi = c.items.find((i) => i.code === 'crs')!;
    expect(rwi.runeword).toBe(true);
    expect(rwi.children.map((x) => x.code)).toEqual(['r07', 'r10', 'r09', 'r11']);
    const amu = c.items.find((i) => i.code === 'amu')!;
    expect(amu.props.find((p) => p.id === 204)).toMatchObject({ param: 54, extra: 5, v: [5, 5] });
    expect(c.merc?.type).toBe(7);
    expect(c.mercItems).toHaveLength(1);
  });

  it('refuse proprement les fichiers invalides', () => {
    expect(() => parseD2s(new Uint8Array(1000))).toThrow(D2sFormatError);
    const b = encodeD2s(fake());
    b[4] = 0x63; // D2R récent
    expect(() => parseD2s(b)).toThrow(/Version/);
    expect(() => parseD2s(b.slice(0, 400))).toThrow(D2sFormatError);
  });
});

describe('identifiants D2 (tables générées)', () => {
  it("uniques, sets, mots runiques et affixes : identifiants du jeu d'origine (ancres vérifiées avec un lecteur indépendant)", () => {
    // les lignes « Expansion » ne comptent pas ; Harlequin Crest = 248 ; mots runiques = 26 + rang de la ligne (Délire aussi sous 2718)
    expect(T.uniques[248][0]).toBe('Harlequin Crest');
    expect(T.uniques[0][0]).toBe('The Gnasher');
    expect(T.sets[0][0]).toBe("Civerb's Ward");
    expect(T.sets.some((s) => s[0] === 'Expansion')).toBe(false);
    expect(T.runewords['27'][0]).toBe("Ancient's Pledge");
    expect(T.runewords['59'][0]).toBe('Enigma');
    expect(T.runewords['155'][1]).toBe('rw_spirit');
    expect(T.runewords['156'][1]).toBe('rw_splendor');
    expect(T.runewords['2718'][0]).toBe('Delirium');
    expect(T.prefixes[1][0]).toBe('Sturdy'); // identifiant 2
    expect(T.suffixes[0][0]).toBe('of Health'); // identifiant 1
    // la quasi-totalité des uniques et sets d'origine ont leur équivalent dans le jeu
    expect(T.uniques.filter((u) => u[1]).length).toBeGreaterThan(370);
    expect(T.sets.filter((u) => u[1]).length).toBeGreaterThan(120);
  });
});

describe('import vers la sauvegarde du jeu', () => {
  const { save, report } = importD2s(encodeD2s(fake()));
  const c = save.character;

  it('personnage : classe, niveau, caractéristiques, compétences, or, difficulté', () => {
    expect(c.name).toBe('Zorg');
    expect(c.classId).toBe('sorceress');
    expect(c.level).toBe(80);
    expect(c.base).toEqual({ str: 60, dex: 70, vit: 200, ene: 150 });
    expect(c.statPoints).toBe(3);
    expect(c.skillPoints).toBe(2);
    expect(c.skills.fire_ball).toBe(20);
    expect(c.skills.frozen_orb).toBe(20);
    expect(c.skills.blizzard).toBe(20);
    expect(c.skills.teleport).toBe(1);
    expect(c.gold).toBe(4321);
    expect(c.stashGold).toBe(99999);
    expect(c.progression.highestDifficulty).toBe(1);
    expect(c.hotbar.primary).not.toBe('attack');
  });

  it('objets : équipement, uniques, sets, mots runiques, châsses', () => {
    expect(c.equipment.head?.base).toBe('war_hat');
    expect(c.equipment.head?.quality).toBe('magic');
    expect(itemName(c.equipment.head!)).toMatch(/Solide.*du Renard/);
    const head = itemFinal(c.equipment.head!);
    expect(head.mods.find((m) => m.stat === 'str')?.value).toBe(7);
    expect(head.mods.find((m) => m.stat === 'resFire')?.value).toBe(20);
    expect(c.equipment.head?.dur).toBeGreaterThan(0);
    expect(c.equipment.head?.dur).toBeLessThan(maxDurability(c.equipment.head!));
    expect(c.equipment.ring1?.uniqueId).toBe('u_the_stone_of_jordan');
    expect(c.equipment.ring1?.rolls?.length).toBeGreaterThan(0);
    expect(c.equipment.amulet?.quality).toBe('rare');
    expect(c.equipment.amulet?.rareName).toBeTruthy();
    expect(itemFinal(c.equipment.amulet!).mods.find((m) => m.stat === 'mf')?.value).toBe(27);
    expect(c.equipment.mainhand?.quality).toBe('runeword');
    expect(c.equipment.mainhand?.runeword).toBe('rw_spirit');
    expect(c.equipment.mainhand?.socketed.map((s) => s.base)).toEqual(['r07', 'r10', 'r09', 'r11']);
    expect(c.equipment.offhand?.ethereal).toBe(true);
    expect(c.equipment.offhand?.quality).toBe('superior');
    const civ = c.inventory[1 * 10 + 3];
    expect(civ?.setId).toBe('s_civerbs_ward');
    expect(c.charmInv.some((x) => x?.base === 'grand_charm')).toBe(true); // les charmes importés vont dans l'inventaire des charmes (PD2)
    expect(c.materials.r24).toBe(1);
    expect(c.materials.gem_ruby_4).toBe(1);
    expect(c.stash[0][2 * 10 + 2]?.base).toBe('phase_blade');
    expect(c.belt.find((b) => b.kind === 'heal')?.qty).toBe(2);
    expect(c.belt.find((b) => b.kind === 'mana')?.qty).toBe(1);
    // arme de rechange rangée dans le sac
    expect([...c.inventory, ...c.stash.flat()].some((i) => i?.base === 'wand')).toBe(true);
  });

  it('mercenaire : Garde du désert Défensif avec son casque', () => {
    expect(c.merc?.type).toBe('desert');
    expect(c.merc?.variant).toBe('defiance');
    expect(c.merc?.equipment.head?.base).toBe('war_hat');
  });

  it('rapport d’import lisible', () => {
    const lines = reportLines(report);
    expect(lines[0]).toMatch(/^Objets importés : \d+$/);
    expect(lines.join('\n')).toMatch(/emplacement alternatif/);
    expect(report.skipped.length).toBe(0);
    expect(report.imported).toBeGreaterThanOrEqual(12);
  });

  it('sauvegarde valide : aller-retour JSON, chargement dans le jeu, simulation', () => {
    const back = deserialize(serialize(save));
    const g = new Game(back);
    expect(g.character.name).toBe('Zorg');
    expect(g.character.equipment.mainhand?.runeword).toBe('rw_spirit');
    const d = computeDerived(g.character, 1);
    expect(d.lifeMax).toBeGreaterThan(300);
    for (const it of [...Object.values(g.character.equipment), ...Object.values(g.character.merc?.equipment ?? {})]) expect(() => itemFinal(it!)).not.toThrow();
    expect(g.startRun('tristram', 0, 5)).toBe(true);
    g.step(20);
    expect(g.world.player.dead).toBe(false);
  });

  it('fichier tronqué : les objets lus avant la coupure sont importés, le rapport le signale', () => {
    const bytes = encodeD2s(fake());
    const cut = bytes.slice(0, 0x2fd + 4 + 30 + 2 + 2 + 300);
    const c = parseD2s(cut);
    expect(c.truncated).toBe(true);
    const { save, report } = importD2s(cut);
    expect(save.character.name).toBe('Zorg');
    expect(save.character.skills.fire_ball).toBe(20);
    expect(reportLines(report).join('\n')).toMatch(/n’a pas pu être lue/);
  });

  it('mot runique et unique absents du jeu : rare nommé avec propriétés converties, signalé comme approximatif', () => {
    const f = fake();
    f.items = [
      newItem('crs', {
        location: 1,
        equipped: 4,
        quality: 2,
        runeword: true,
        runewordId: rw('Armageddon'),
        socketed: true,
        sockets: 2,
        children: ['r07', 'r10'].map(rune),
        maxDur: 70,
        dur: 70,
        rwProps: [{ id: 105, v: [35] }],
      }),
      newItem('fla', { x: 0, y: 0, quality: 7, uniqueId: uniq('Gore Ripper'), maxDur: 20, dur: 20, props: [{ id: 136, v: [30] }] }),
    ];
    const out = importD2s(encodeD2s(f));
    const mh = out.save.character.equipment.mainhand!;
    expect(mh.quality).toBe('rare');
    expect(mh.rareName).toBe('Armageddon');
    expect(itemFinal(mh).mods.find((m) => m.stat === 'fcr')?.value).toBe(35);
    expect(out.report.approx.length).toBe(2);
    expect(reportLines(out.report).join('\n')).toMatch(/approximative \(2\)/);
  });

  it('un objet inconnu du jeu est listé dans le rapport', () => {
    const f = fake();
    f.items.push(newItem('msf', { page: 1, x: 8, y: 3, quality: 2 }));
    const out = importD2s(encodeD2s(f)).report;
    expect(reportLines(out).join('\n')).toMatch(/Objets non importés \(1\) : Staff of the Kings/);
  });
});
