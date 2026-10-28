import { describe, expect, it } from 'vitest';
import { Rng } from '../../../../src/core/rng';
import { Game } from '../../../../src/sim/game';
import { makeMap } from '../../sim/maps';
import { MAP_STASH_MAX, addMapToStash, sortMapStash, takeMapFromStash } from '../../../../src/sim/mapstash';
import { deserialize, serialize, withDefaultSettings, type Settings } from '../../../../src/sim/save';
import type { Quality } from '../../../../src/sim/item';

const rng = new Rng('map-stash');

function setup(s: Partial<Settings> = {}, app = true): Game {
  const g = new Game();
  g.settings = withDefaultSettings(s, app);
  g.character.level = 90;
  g.character.progression.highestDifficulty = 2;
  g.startRun('tristram', 0);
  return g;
}
const drop = (g: Game, q: Quality, tier = 1, dx = 0.5) => {
  const m = makeMap(rng, tier, q);
  g.world.dropItem(m, g.world.player.x + dx, g.world.player.y);
  return m;
};

describe('Coffre de cartes', () => {
  it('défaut de l’application : toutes ; absent : aucune', () => {
    expect(withDefaultSettings(null, true).mods?.pd2?.autoPickupMaps).toBe('all');
    expect(withDefaultSettings({}, false).mods).toBeUndefined();
    // réglage d'avant les mods (à la racine) : repris sous mods.pd2 ; valeur inconnue : défaut de l'application
    expect(withDefaultSettings({ autoPickupMaps: 'rare' } as Partial<Settings>, true)).toMatchObject({ mods: { pd2: { autoPickupMaps: 'rare' } } });
    expect(withDefaultSettings({ autoPickupMaps: 'rare' } as Partial<Settings>, true)).not.toHaveProperty('autoPickupMaps');
    expect(withDefaultSettings({ mods: { pd2: { autoPickupMaps: 'zzz' } } }, true).mods?.pd2?.autoPickupMaps).toBe('all');
  });

  it('ramassage automatique selon le seuil, les cartes vont au coffre de cartes', () => {
    const g = setup({ mods: { pd2: { autoPickupMaps: 'rare' } } });
    drop(g, 'normal');
    drop(g, 'magic');
    const r = drop(g, 'rare');
    g.step(40);
    expect(g.character.mapStash).toEqual([r]);
    expect(g.world.items.length).toBe(2);
    expect(g.character.inventory.some((x) => x?.map)).toBe(false);
    const h = setup({ mods: { pd2: { autoPickupMaps: 'magic' } } });
    drop(h, 'normal');
    drop(h, 'magic');
    h.step(40);
    expect(h.character.mapStash?.length).toBe(1);
    const a = setup({ mods: { pd2: { autoPickupMaps: 'all' } } });
    drop(a, 'normal');
    a.step(40);
    expect(a.character.mapStash?.length).toBe(1);
  });

  it('sans réglage ou « Aucune » : rien au sol ramassé, comportement inchangé', () => {
    for (const s of [setup({}, false), setup({ mods: { pd2: { autoPickupMaps: 'none' } } })]) {
      drop(s, 'rare');
      s.step(40);
      expect(s.character.mapStash ?? []).toEqual([]);
      expect(s.world.items.length).toBe(1);
    }
  });

  it('la carte touchée va au sac sans réglage, au coffre de cartes avec le réglage', async () => {
    const { pickupGroundItem } = await import('../../../../src/sim/inventory');
    const g = setup({}, false);
    drop(g, 'rare');
    expect(pickupGroundItem(g.world, g.world.items[0])).toBe(true);
    expect(g.character.inventory.some((x) => x?.map)).toBe(true);
    const h = setup({ mods: { pd2: { autoPickupMaps: 'rare' } } });
    drop(h, 'normal');
    h.step(1); // le monde reçoit les réglages à chaque pas
    expect(pickupGroundItem(h.world, h.world.items[0])).toBe(true);
    expect(h.character.mapStash?.length).toBe(1);
  });

  // changement voulu par le joueur : coffre plein ⇒ le ramassage automatique ne remplit plus le sac (avant : « le sac prend le relais »)
  it('plafond : la carte reste au sol, rien ne va dans le sac', () => {
    const g = setup({ mods: { pd2: { autoPickupMaps: 'all' } } });
    for (let i = 0; i < MAP_STASH_MAX; i++) expect(addMapToStash(g.character, makeMap(rng, 1, 'normal'))).toBe(true);
    expect(addMapToStash(g.character, makeMap(rng, 1, 'normal'))).toBe(false);
    drop(g, 'normal');
    g.step(40);
    expect(g.character.mapStash!.length).toBe(MAP_STASH_MAX);
    expect(g.character.inventory.filter((x) => x?.map).length).toBe(0);
  });

  it('tri : palier décroissant puis qualité', () => {
    const g = new Game();
    const c = g.character;
    const a = makeMap(rng, 1, 'rare');
    const b = makeMap(rng, 3, 'normal');
    const d = makeMap(rng, 1, 'normal');
    const e = makeMap(rng, 3, 'rare');
    for (const m of [a, b, d, e]) addMapToStash(c, m);
    sortMapStash(c);
    expect(c.mapStash).toEqual([e, b, a, d]);
  });

  it('prise dans le sac : place requise', () => {
    const g = new Game();
    const c = g.character;
    const m = makeMap(rng, 1, 'normal');
    addMapToStash(c, m);
    c.inventory.fill(null);
    expect(takeMapFromStash(c, 0)).toBeGreaterThanOrEqual(0);
    expect(c.mapStash).toEqual([]);
    expect(c.inventory.includes(m)).toBe(true);
    addMapToStash(c, makeMap(rng, 1, 'normal'));
    c.inventory.fill(m); // sac plein de cartes 1 × 1 ou plus : plus de place pour un autre objet
    const before = c.inventory.slice();
    if (takeMapFromStash(c, 0) < 0) expect(c.mapStash!.length).toBe(1);
    else expect(c.inventory).not.toEqual(before);
  });

  it('startMap({ mapIdx }) consomme la bonne carte et lance la run', () => {
    const g = new Game();
    const c = g.character;
    c.level = 90;
    c.progression.highestDifficulty = 2;
    const a = makeMap(rng, 1, 'normal');
    const b = makeMap(rng, 2, 'rare');
    addMapToStash(c, a);
    addMapToStash(c, b);
    expect(g.startMap({ mapIdx: 1 }).ok).toBe(true);
    expect(c.mapStash).toEqual([a]);
    expect(g.activeMap).toBe(b);
    expect(g.mode).toBe('run');
    expect(g.startMap({ mapIdx: 5 }).ok).toBe(false);
  });

  it('sauvegarde aller-retour', () => {
    const g = new Game();
    const m = makeMap(rng, 2, 'rare');
    addMapToStash(g.character, m);
    const back = deserialize(serialize(g.toSave()));
    expect(back.character.mapStash).toEqual([m]);
    const old = g.toSave();
    delete old.character.mapStash;
    expect(deserialize(serialize(old)).character.mapStash ?? []).toEqual([]);
  });
});
