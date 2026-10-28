/**
 * Zones de cartes d'endgame, générées à partir de la définition de la carte (src/data/maps.ts) et de sa
 * forme (mapshapes.ts : cavernes, cratère, îlots, rivière, village, salles, spirale, anneaux…) :
 *  - extérieur (« champ ») : cases de 2 unités, bords naturels garnis du décor de bordure, danger
 *    (lave, boue, vide) infranchissable mais transparent ;
 *  - intérieur (« labyrinthe ») : cases de 4 unités, murs du décor sur chaque bord (pleins au fond,
 *    bas devant : lisibilité façon D2), au-delà le noir.
 * Départ et arène du boss aux deux bouts de la forme, événements dans les poches, groupes répartis
 * sur la surface praticable (densité constante par unité²).
 * La densité (affixes) multiplie le nombre de groupes ; la rareté des monstres (affixe
 * « des Champions ») augmente la part d'élites ; le boss de la carte termine la run.
 */
import type { MapZoneDef } from '../../../../src/mods/api';
import { MONSTER_BY_ID, Rng, ZoneBuilder, type MapEvent, type MapZoneOptions, type SpawnDef, type ZoneDef } from '../../../../src/mods/sdk';
import { buildShaped } from './mapbuild';

export type { MapEvent, MapZoneOptions };
export const MAP_EVENTS: MapEvent[] = ['treasure', 'horazon', 'horde', 'shrines', 'rival', 'ambush', 'wanderer', 'mendeln', 'altar', 'heroes'];
export const MAP_EVENT_NAMES: Record<MapEvent, string> = {
  treasure: 'Un Déchu au trésor rôde…',
  horazon: 'Le coffre d’Horazon est caché ici',
  horde: 'Une horde de champions garde un trésor',
  shrines: 'Un cercle d’autels sacrés brille quelque part',
  rival: 'Un rival maudit rôde sur la carte',
  ambush: 'Un coffre piégé : l’embuscade guette',
  wanderer: 'Les ténèbres elles-mêmes rôdent par ici…',
  mendeln: 'Le Mal vous appelle depuis le Vide…',
  altar: 'Un autel mystérieux vibre de potentiel…',
  heroes: 'Une présence corrompue vous traque…',
};

/**
 * Rang d'un groupe. Cartes denses (~3× plus de groupes) : la part d'élites baisse un peu (uniques 5 %, champions 11 %,
 * avant 7 % et 13 %) — ~15 groupes d'élite par carte au lieu de ~6 ; le surplus de monstres est surtout du menu fretin
 * (mesuré au bot d'endgame : avec les anciennes parts, morts par heure ×2,2 et cartes de 12-13 min en moyenne).
 */
function packRank(rng: Rng, rarity: number): SpawnDef['rank'] {
  const k = 1 + rarity / 100;
  const x = rng.next();
  return x < 0.05 * k ? 'unique' : x < 0.16 * k ? 'champion' : 'normal';
}

export function buildMapZone(def: MapZoneDef, seed: number, opts: MapZoneOptions): ZoneDef {
  const rng = new Rng(`map:${def.id}:${seed}`);
  const families = opts.extraFamily ? [...def.monsters, ...opts.extraFamily.split(',')] : def.monsters;
  // tailles variées : normaux 5-9 (une horde de 10-13 une fois sur quatorze, dans les grandes salles), champions 4-5, uniques 5-6
  // (une fois sur deux avec une escorte de 3-4 monstres ordinaires de la même famille) ; `room` : la place
  // libre autour du point (unités), les hordes ne se posent que dans les grandes salles et clairières
  const pack = (b: ZoneBuilder, x: number, y: number, room = 99) => {
    const rank = packRank(rng, opts.rarity);
    const monster = rng.pick(families);
    const horde = rank === 'normal' && room >= 6 && rng.chance(1 / 14);
    const count = rank === 'unique' ? rng.range(5, 6) : rank === 'champion' ? rng.range(4, 5) : horde ? rng.range(10, 13) : rng.range(5, 9);
    b.spawn({ monster, x, y, count, r: Math.min(4.2, 2.2 + count * 0.13), rank, trigger: 12 });
    if (rank === 'unique' && rng.chance(0.5)) {
      const a = rng.float(0, Math.PI * 2);
      b.spawn({ monster, x: x + Math.cos(a) * 3, y: y + Math.sin(a) * 3, count: rng.range(3, 4), r: 2, rank: 'normal', trigger: 12, escort: true });
    }
  };
  const bossAt = (b: ZoneBuilder, x: number, y: number, chest: [number, number], twin: [number, number]) => {
    // espèce de boss de campagne (Baal, Duriel des donjons) : le reflet vient seul, escorté de monstres de la carte
    // (sinon ses quatre sbires seraient eux aussi des Baal)
    if (MONSTER_BY_ID[def.boss.monster]?.boss) {
      b.spawn({ monster: def.boss.monster, x, y, count: 1, r: 0, rank: 'unique', uniqueName: def.boss.name, trigger: 10, runBoss: true });
      b.spawn({ monster: families.find((f) => !MONSTER_BY_ID[f]?.boss) ?? 'skeleton', x: x + 2.5, y: y + 2.5, count: 4, r: 2, rank: 'normal', trigger: 10, escort: true });
    } else b.spawn({ monster: def.boss.monster, x, y, count: 5, r: 3, rank: 'unique', uniqueName: def.boss.name, trigger: 10, runBoss: true });
    if (opts.extraBoss) b.spawn({ monster: rng.pick(families), x: twin[0], y: twin[1], count: 3, r: 2, rank: 'unique', trigger: 10 });
    b.object({ kind: 'chest', x: chest[0], y: chest[1] });
  };
  // événement : le Déchu au trésor rôde, ou le coffre d'Horazon est gardé par une meute
  const eventAt = (b: ZoneBuilder, x: number, y: number) => {
    if (opts.event === 'treasure') b.spawn({ monster: 'treasure_fallen', x, y, count: 1, r: 1, rank: 'unique', uniqueName: 'Déchu au trésor', trigger: 11 });
    else if (opts.event === 'horazon') {
      b.object({ kind: 'chest', variant: 'horazon', x, y });
      pack(b, x + 2.5, y + 2.5);
    } else if (opts.event === 'horde') {
      // trois meutes de champions autour de deux coffres
      b.object({ kind: 'chest', x, y });
      b.object({ kind: 'chest', x: x + 1.5, y: y + 1 });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.5;
        b.spawn({ monster: rng.pick(families), x: x + Math.cos(a) * 4, y: y + Math.sin(a) * 4, count: 4, r: 2, rank: 'champion', trigger: 12 });
      }
    } else if (opts.event === 'shrines') {
      // trois autels en cercle (bonus temporaires), gardés par une meute
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        b.object({ kind: 'shrine', x: x + Math.cos(a) * 2.2, y: y + Math.sin(a) * 2.2 });
      }
      pack(b, x + 4, y + 4);
    } else if (opts.event === 'rival') {
      // un monstre unique de plus, aussi coriace que les gardiens, avec son escorte
      b.spawn({ monster: rng.pick(families), x, y, count: 4, r: 2, rank: 'unique', uniqueName: 'Rival maudit', trigger: 11 });
    } else if (opts.event === 'wanderer') {
      // Rôdeur des ténèbres (PD2) : jusqu'à trois boss de carte renforcés, qui lâchent des éclats de Pierre-Monde
      for (let k = 0; k < 3; k++) b.spawn({ monster: rng.pick(families), x: x + k * 3, y: y + (k % 2) * 3, count: 1, r: 1, rank: 'unique', uniqueName: 'Rôdeur des ténèbres', trigger: 11 });
    } else if (opts.event === 'mendeln') {
      // Ombre de Mendeln (PD2) : trois vagues de morts-vivants, la dernière avec champions et élite ; l'ombre peut lâcher un Éclat du Vide
      for (let k = 0; k < 3; k++)
        b.spawn({
          monster: rng.pick(['ghoul', 'zombie', 'prowling_dead']),
          x: x + Math.cos(k * 2.1) * 4,
          y: y + Math.sin(k * 2.1) * 4,
          count: 5 + k * 2,
          r: 2,
          rank: k === 2 ? 'champion' : 'normal',
          trigger: 11,
        });
      b.spawn({ monster: 'ghoul', x, y, count: 1, r: 1, rank: 'unique', uniqueName: 'Ombre de Mendeln', trigger: 11 });
    } else if (opts.event === 'altar') {
      // Autel du Catalyseur (PD2) : le gardien de l'autel, entouré de sa garde, lâche des Éclats du Catalyseur
      b.object({ kind: 'shrine', x, y });
      b.spawn({ monster: rng.pick(families), x: x + 3, y: y + 3, count: 3, r: 2, rank: 'unique', uniqueName: 'Gardien du Catalyseur', trigger: 11 });
    } else if (opts.event === 'heroes') {
      // Invasion de héros corrompus (PD2) : trois envahisseurs puissants surgissent, chacun lâche de l'équipement rare
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.4;
        b.spawn({ monster: rng.pick(families), x: x + Math.cos(a) * 4, y: y + Math.sin(a) * 4, count: 1, r: 1, rank: 'unique', uniqueName: 'Héros corrompu', trigger: 14 });
      }
    } else if (opts.event === 'ambush') {
      // un coffre isolé entouré d'une grande meute dormante qui se réveille en groupe
      b.object({ kind: 'chest', x, y });
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.8;
        b.spawn({ monster: rng.pick(families), x: x + Math.cos(a) * 3.2, y: y + Math.sin(a) * 3.2, count: rng.range(5, 7), r: 1.6, rank: 'normal', trigger: 12 });
      }
    }
  };

  return buildShaped(def, rng, opts, pack, bossAt, eventAt);
}
