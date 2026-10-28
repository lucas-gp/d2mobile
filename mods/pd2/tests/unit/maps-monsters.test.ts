/** Zones de carte PD2 : monstres thématiques du wiki (plus de substituts) et boss nommé de la carte. */
import { describe, expect, it } from 'vitest';
import { MAP_ZONE_BY_ID } from '../../../../src/data/maps';
import { MONSTER_BY_ID } from '../../../../src/data/monsters';
import { buildMapZone } from '../../data/zones/mapzone';
import { buildGrid } from '../../../../src/sim/world';

/** zone → [monstres attendus, monstre du boss, nom du boss] */
const EXPECTED: Record<string, [string[], string, string]> = {
  ancestral_trial: [['skeleton_mage', 'minion_destruction', 'skeleton', 'venom_lord', 'wraith'], 'venom_lord', 'Nathkill l’Engourdi'],
  sanatorium: [['ghoul_lord', 'dark_stalker', 'ghoul', 'wraith'], 'blood_lord', 'Le Gardien du sanatorium'],
  ruined_cistern: [['frog_demon', 'dark_stalker', 'putrid_defiler', 'zombie', 'skeleton_mage'], 'water_watcher', 'Hydre antique de la citerne'],
  pandemonium_citadel: [['succubus_witch', 'blood_lord', 'prowling_dead', 'zealot'], 'minion_destruction', 'Commandante sombre Alma'],
  horazon_memory: [['cantor', 'doom_knight', 'wraith', 'oblivion_knight'], 'succubus', 'Demoiselle de la mort Madinsane'],
  halls_torture: [['blunderbore', 'council_member', 'skeleton_archer', 'burning_dead', 'blood_lord'], 'council_member', 'Gimli l’Être invoqué'],
  kehjistan_marketplace: [['unraveler', 'ghoul_lord', 'dark_stalker', 'skeleton_mage', 'goatman'], 'maggot_queen', 'La Ruche viciée'],
  arreat_battlefield: [['afflicted', 'goatman', 'thornhulk', 'zombie', 'prowling_dead', 'foul_crow'], 'the_smith', 'Armurier de l’Égalité'],
  bastion_keep: [['goatman', 'warped_shaman', 'sand_raider', 'succubus', 'bat_demon'], 'doom_knight', 'Johnathan le Damné'],
  demon_road: [['succubus', 'putrid_defiler', 'minion', 'prowling_dead', 'wraith'], 'vile_mother', 'Thonos aux mille membres'],
  skovos_stronghold: [['afflicted', 'dark_stalker', 'zealot', 'zombie', 'thornhulk'], 'abyss_knight', 'Incarnation d’Akarat'],
  steppes_daken: [['blunderbore', 'putrid_defiler', 'soul_killer', 'prowling_dead', 'spear_cat', 'succubus', 'blood_lord'], 'siege_beast', 'Naz, le Roi maudit'],
  outer_void: [['abyss_knight', 'doom_knight', 'wraith', 'soul_killer', 'willowisp'], 'regurgitator', 'Dévoreur de rêves'],
};

describe('Monstres des zones de carte PD2', () => {
  for (const [id, [mons, bossMon, bossName]] of Object.entries(EXPECTED)) {
    it(id, () => {
      const def = MAP_ZONE_BY_ID[id];
      expect(def.monsters).toEqual(mons);
      expect(def.boss).toEqual({ monster: bossMon, name: bossName });
      for (const m of [...mons, bossMon]) expect(MONSTER_BY_ID[m], m).toBeDefined();
      const z = buildMapZone(def, 7, { density: 40, rarity: 20 });
      expect(() => buildGrid(z)).not.toThrow();
      const used = new Set(z.spawns.map((s) => s.monster));
      expect([...used].some((m) => mons.includes(m))).toBe(true);
      for (const m of used) expect([...mons, bossMon], m).toContain(m);
      const boss = z.spawns.find((s) => s.runBoss);
      expect(boss?.monster).toBe(bossMon);
      expect(boss?.uniqueName).toBe(bossName);
    });
  }
});
