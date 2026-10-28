/** Châsses depuis le menu de l'objet : recettes du Cube sur place et Larzuk, mêmes règles, coûts et issues que l'original. */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { Game } from '../../src/sim/game';
import { SOCKET_RECIPES, addSocketsCheck, addSocketsRecipesFor, addSocketsWith, cubeTransmute } from '../../src/sim/cube';
import { matCount } from '../../src/sim/materials';
import { generateItem } from '../../src/sim/loot/itemgen';
import type { Quality } from '../../src/sim/item';
import { withoutPd2 } from '../needs-pd2';

Game.resumeOnLoad = true;

const COST: Record<string, Record<string, number>> = {
  sock_weapon: { r08: 1, r11: 1, gem_amethyst_4: 1 },
  sock_shield: { r07: 1, r11: 1, gem_ruby_4: 1 },
  sock_armor: { r07: 1, r10: 1, gem_topaz_4: 1 },
  sock_helm: { r08: 1, r10: 1, gem_sapphire_4: 1 },
  sock_puzzlebox: { puzzlebox: 1 },
  sock_puzzlepiece: { puzzlepiece: 1 },
};
const BASE: Record<string, string> = {
  sock_weapon: 'long_sword',
  sock_shield: 'large_shield',
  sock_armor: 'plate_mail',
  sock_helm: 'cap',
  sock_puzzlebox: 'long_sword',
  sock_puzzlepiece: 'war_hammer',
};

function setup(rec: string, quality: Quality = 'normal') {
  const g = new Game(undefined, 'sorceress');
  const c = g.character;
  for (const [k, n] of Object.entries(COST[rec])) c.materials[k] = n + 1;
  c.inventory.fill(null);
  const item = generateItem(new Rng('sa:' + rec + quality), BASE[rec], 80, { forceQuality: quality });
  item.sockets = 0;
  item.socketed = [];
  c.inventory[0] = item;
  return { g, c, item };
}

/** Recettes présentes : les deux recettes de l'énigme de Larzuk viennent du mod pd2 (dépendance résiduelle, voir tests/needs-pd2.ts) */
const RECS = Object.keys(COST).filter((id) => !withoutPd2 || !id.startsWith('sock_puzzle'));

describe('ajout de châsses direct', () => {
  it('liste les recettes du Cube qui ajoutent des châsses (6 avec le mod pd2)', () => {
    expect(SOCKET_RECIPES.map((r) => r.id).sort()).toEqual(RECS.sort());
  });

  it.each(RECS)('%s : même issue que le Cube à graine égale, coût identique', (rec) => {
    const a = setup(rec);
    const b = setup(rec);
    expect(addSocketsCheck(a.c, a.item, rec).ok).toBe(true);
    const ra = addSocketsWith(a.c, { from: 'inv', idx: 0 }, rec, new Rng('seed-s'));
    const rb = cubeTransmute(b.c, new Rng('seed-s'), rec, [0]);
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(true);
    expect(ra.note).toBe(rb.note);
    expect(a.c.inventory[0]!.sockets).toBe(b.c.inventory[0]!.sockets);
    expect(a.c.inventory[0]!.sockets).toBeGreaterThan(0);
    for (const k of Object.keys(COST[rec])) {
      expect(matCount(a.c, k)).toBe(1);
      expect(matCount(b.c, k)).toBe(1);
    }
  });

  it('refus sans rien consommer : ingrédients manquants, déjà percé, mauvaise qualité, corrompu', () => {
    const a = setup('sock_weapon');
    a.c.materials.r11 = 0;
    expect(addSocketsWith(a.c, { from: 'inv', idx: 0 }, 'sock_weapon', new Rng('x'))).toMatchObject({ ok: false });
    expect(addSocketsCheck(a.c, a.item, 'sock_weapon').reason).toMatch(/^Il manque : /);
    expect(matCount(a.c, 'r08')).toBe(2);
    a.c.materials.r11 = 2;
    a.item.sockets = 2;
    expect(addSocketsCheck(a.c, a.item, 'sock_weapon').reason).toBe('Déjà percé');
    a.item.sockets = 0;
    a.item.quality = 'rare';
    expect(addSocketsCheck(a.c, a.item, 'sock_weapon').ok).toBe(false);
    expect(addSocketsWith(a.c, { from: 'inv', idx: 0 }, 'sock_weapon', new Rng('x')).ok).toBe(false);
    expect(matCount(a.c, 'r08')).toBe(2);
    a.item.quality = 'normal';
    a.item.corrupted = { outcome: 'none', mods: [] };
    expect(addSocketsCheck(a.c, a.item, 'sock_weapon').reason).toBe('Déjà corrompu');
    expect(matCount(a.c, 'gem_amethyst_4')).toBe(2);
  });

  it.skipIf(withoutPd2)('boîte à énigme : accepte un unique ; pièce d’énigme : refuse un unique', () => {
    const a = setup('sock_puzzlebox', 'unique');
    expect(addSocketsCheck(a.c, a.item, 'sock_puzzlebox').ok).toBe(true);
    const b = setup('sock_puzzlepiece', 'unique');
    expect(addSocketsCheck(b.c, b.item, 'sock_puzzlepiece').ok).toBe(false);
    expect(
      addSocketsRecipesFor(b.item)
        .map((r) => r.id)
        .sort(),
    ).toEqual(['sock_puzzlebox', 'sock_puzzlepiece', 'sock_weapon']);
  });

  it('agit sur le coffre et l’objet porté, et le menu du jeu exige la ville', () => {
    const a = setup('sock_weapon');
    a.c.stash[0] ??= [];
    a.c.stash[0][3] = a.c.inventory[0];
    a.c.inventory[0] = null;
    const r = a.g.addSocketsItem({ from: 'stash', tab: 0, idx: 3 }, 'sock_weapon');
    expect(r.ok).toBe(true);
    expect(a.c.stash[0][3]!.sockets).toBeGreaterThan(0);
    a.g.mode = 'run';
    expect(a.g.addSocketsItem({ from: 'stash', tab: 0, idx: 3 }, 'sock_weapon')).toMatchObject({ ok: false, reason: 'À faire en ville' });
  });
});

describe('Larzuk depuis le menu de l’objet', () => {
  function larzuk(quality: Quality) {
    const g = new Game(undefined, 'sorceress');
    const c = g.character;
    c.progression.milestones[`quest:siege:${g.difficulty}`] = 1;
    c.inventory.fill(null);
    const item = generateItem(new Rng('lz' + quality), 'long_sword', 80, { forceQuality: quality });
    item.sockets = 0;
    item.socketed = [];
    c.inventory[0] = item;
    return { g, c, item };
  }

  it('quête non accomplie : indisponible', () => {
    const { g, c } = larzuk('normal');
    delete c.progression.milestones[`quest:siege:${g.difficulty}`];
    expect(g.socketQuestCheck({ from: 'inv', idx: 0 })).toMatchObject({ ok: false, reason: expect.stringContaining('Quête non accomplie') });
  });

  it('disponible, résultat identique à socketQuest, une seule fois par difficulté', () => {
    const a = larzuk('normal');
    const b = larzuk('normal');
    const chk = a.g.socketQuestCheck({ from: 'inv', idx: 0 });
    expect(chk.ok).toBe(true);
    const ra = a.g.socketQuestItem({ from: 'inv', idx: 0 });
    const rb = b.g.socketQuest(0);
    expect(ra).toEqual(rb);
    expect(a.c.inventory[0]!.sockets).toBe(b.c.inventory[0]!.sockets);
    expect(chk.sockets![0]).toBe(ra.sockets);
    expect(a.g.socketQuestAvailable()).toBe(false);
    // second objet : utilisée
    a.c.inventory[1] = generateItem(new Rng('lz2'), 'long_sword', 80, { forceQuality: 'normal' });
    a.c.inventory[1]!.sockets = 0;
    expect(a.g.socketQuestCheck({ from: 'inv', idx: 1 })).toMatchObject({ ok: false, reason: 'Déjà utilisée à cette difficulté' });
    expect(a.g.socketQuestItem({ from: 'inv', idx: 1 }).ok).toBe(false);
    expect(a.c.inventory[1]!.sockets).toBe(0);
  });

  it('aperçu : magique 1 ou 2, rare 1 ; refus corrompu ou déjà percé ; ville requise', () => {
    const m = larzuk('magic');
    expect(m.g.socketQuestCheck({ from: 'inv', idx: 0 }).sockets).toEqual([1, 2]);
    const r = larzuk('rare');
    expect(r.g.socketQuestCheck({ from: 'inv', idx: 0 }).sockets).toEqual([1, 1]);
    r.item.corrupted = { outcome: 'none', mods: [] };
    expect(r.g.socketQuestCheck({ from: 'inv', idx: 0 }).reason).toBe('Déjà corrompu');
    r.item.corrupted = undefined;
    r.item.sockets = 1;
    expect(r.g.socketQuestCheck({ from: 'inv', idx: 0 }).ok).toBe(false);
    r.item.sockets = 0;
    r.g.mode = 'run';
    expect(r.g.socketQuestCheck({ from: 'inv', idx: 0 }).reason).toMatch(/ville/);
    expect(r.g.socketQuestItem({ from: 'inv', idx: 0 }).ok).toBe(false);
    expect(r.item.sockets).toBe(0);
  });
});
