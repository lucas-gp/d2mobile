/**
 * Personnage d'essai : Sorcière de niveau 99 en Enfer débloqué, équipée d'un build Froid d'endgame (Orbe gelé / Blizzard) tiré des guides D2/PD2
 * (Brasse, Voile de l'Aile-de-nuit, Esprit en Monarch, Chaînes d'honneur en armure, Maille arachnide, Kaléidoscope de Mara, Givre du corbeau,
 * Alliance de Bul-Kathos, Poing-de-mage, Voyageur de guerre, Annihilus et Torche), avec de quoi parcourir tout le contenu : runes, gemmes, clés
 * du Pandémonium, éclats, cartes, or. Sert à vérifier le jeu d'un bout à l'autre ; créé une seule fois sur l'appareil (voir app.ts).
 */
import { Rng } from '../core/rng';
import { classSkills } from '../data/skills';
import { RUNES } from '../data/items/runes';
import { Game } from './game';
import { addToCharacter, placeInInventory } from './inventory';
import { generateItem, makeStack } from './loot/itemgen';
import { RULES } from '../mods/rules';
import { addXp, xpToReach } from './progression';
import { socketItem } from './socket';
import type { Item } from './item';
import type { SaveData } from './save';

export const TEST_CHAR_NAME = 'Sorcière 99';

/** Compétences poussées au maximum (build Froid) ; toutes les autres sont à 1 pour tout essayer */
const MAXED: Record<string, number> = {
  frozen_orb: 20,
  blizzard: 20,
  cold_mastery: 20,
  ice_blast: 20,
  glacial_spike: 20,
  frost_nova: 20,
  ice_bolt: 20,
  ice_barrage: 20,
  chilling_armor: 20,
  shiver_armor: 20,
  cold_enchant: 20,
  energy_shield: 20,
  telekinesis: 1,
  teleport: 1,
  thunder_storm: 12,
  warmth: 20,
  fire_ball: 12,
  meteor: 12,
};

export function buildTestSorceress(): SaveData {
  const g = new Game(undefined, 'sorceress');
  const c = g.character;
  c.name = TEST_CHAR_NAME;
  addXp(c, xpToReach(99) - c.xp);
  // caractéristiques : de quoi porter l'équipement (Monarch 156 Force), le reste en Vitalité
  const pts = c.statPoints;
  c.base.str = 160;
  c.base.vit += Math.max(0, pts - 150);
  c.statPoints = 0;
  // compétences
  for (const s of classSkills('sorceress')) c.skills[s.id] = MAXED[s.id] ?? 1;
  c.skillPoints = 0;
  c.respecs = 5;
  c.hotbar.primary = 'frozen_orb';
  c.hotbar.slots = ['blizzard', 'ice_blast', 'glacial_spike', 'frost_nova', 'energy_shield', 'chilling_armor', 'fire_ball', 'meteor'];
  c.progression.highestDifficulty = 2;
  c.progression.mapTierMax = 1;
  c.gold = 5_000_000;
  // matériaux : toutes les runes, gemmes parfaites, clés, éclats, orbes, pièces du Pandémonium
  for (const r of RUNES) c.materials[r.id] = 8;
  for (const k of ['ruby', 'sapphire', 'topaz', 'emerald', 'diamond', 'amethyst', 'skull']) {
    for (let q = 1; q <= 4; q++) c.materials[`gem_${k}_${q}`] = q === 4 ? 12 : 4;
  }
  const mats: Record<string, number> = {
    key: 99,
    token_absolution: 2,
    key_terror: 3,
    key_hate: 3,
    key_destruction: 3,
    essence_twisted: 1,
    essence_charged: 1,
    essence_burning: 1,
    essence_festering: 1,
    organ_horn: 1,
    organ_eye: 1,
    organ_brain: 1,
  };
  for (const [id, n] of Object.entries(mats)) c.materials[id] = n;

  const rng = new Rng('testchar:sorc99');
  const gen = (base: string, extra: Parameters<typeof generateItem>[3] = {}): Item => generateItem(rng, base, 99, { forceQuality: 'normal', ...extra });
  const unique = (base: string, id: string): Item => generateItem(rng, base, 99, { forceUniqueId: id });
  const equip = (slot: keyof typeof c.equipment, it: Item) => {
    c.equipment[slot] = it;
  };
  // mots runiques : base à châsses, runes prises dans les matériaux (socketItem forme le mot dès que la séquence est complète)
  const runeword = (base: string, sockets: number, names: string[]): Item => {
    const it = gen(base, { forceQuality: 'normal' });
    it.sockets = sockets;
    for (const n of names) {
      const id = RUNES.find((r) => r.name.toLowerCase() === n.toLowerCase())!.id;
      c.materials[id] = (c.materials[id] ?? 0) + 1;
      socketItem(c, rng, it, { material: id });
    }
    return it;
  };
  equip('mainhand', unique('dimensional_shard', 'u_fathom'));
  equip('offhand', runeword('monarch', 4, ['Tal', 'Thul', 'Ort', 'Amn']));
  equip('body', runeword('archon_plate', 4, ['Dol', 'Um', 'Ber', 'Ist']));
  equip('head', unique('spired_helm', 'u_nightwings_veil'));
  equip('gloves', unique('light_gauntlets', 'u_magefist'));
  equip('boots', unique('battle_boots', 'u_wartraveler'));
  equip('belt', unique('spiderweb_sash', 'u_arachnid_mesh'));
  equip('amulet', unique('amulet', 'u_maras_kaleidoscope'));
  equip('ring1', unique('ring', 'u_raven_frost'));
  equip('ring2', unique('ring', 'u_bul_kathos_wedding_band'));
  // charmes et objets d'essai dans le sac
  for (const [base, id] of [
    ['small_charm', 'u_annihilus'],
    ['large_charm', 'u_hellfire_torch'],
    ['grand_charm', 'u_gheeds_fortune'],
  ] as const)
    addToCharacter(c, unique(base, id));
  addToCharacter(c, gen('large_charm'));
  // matériaux et objets d'essai du mod (pd2 : éclats, énigme, orbes, scarabée, cartes)
  RULES['debug.testCharacter'](c, rng);
  addToCharacter(c, makeStack(rng, 'hp_potion', 1));
  g.world.refreshPlayer();
  equipTestMerc(g);
  c.belt.forEach((b) => (b.qty = 8));
  g.world.refreshPlayer();
  return g.toSave();
}

/**
 * Mercenaire d'essai : Garde du désert (acte II, Défensif) avec Infini en arme (Conviction), Force d'âme en armure et Visage d'Andariel, comme
 * dans les builds d'endgame. Sert à la Sorcière 99 neuve et, via `?testmerc=1`, à n'importe quel personnage existant : l'ancien mercenaire et son
 * équipement reviennent dans le sac, rien d'autre n'est touché.
 */
export function equipTestMerc(g: Game): void {
  const c = g.character;
  const rng = new Rng('testchar:merc');
  const gen = (base: string, extra: Parameters<typeof generateItem>[3] = {}): Item => generateItem(rng, base, 99, { forceQuality: 'normal', ...extra });
  const unique = (base: string, id: string): Item => generateItem(rng, base, 99, { forceUniqueId: id });
  const runeword = (base: string, sockets: number, names: string[]): Item => {
    const it = gen(base, { forceQuality: 'normal' });
    it.sockets = sockets;
    for (const n of names) {
      const id = RUNES.find((r) => r.name.toLowerCase() === n.toLowerCase())!.id;
      c.materials[id] = (c.materials[id] ?? 0) + 1;
      socketItem(c, rng, it, { material: id });
    }
    return it;
  };
  // l'équipement de l'ancien mercenaire revient dans le sac (le recrutement le jetterait au sol)
  if (c.merc) {
    for (const it of Object.values(c.merc.equipment)) if (it) addToCharacter(c, it);
    c.merc.equipment = {};
  }
  // le Garde du désert exige le niveau des tombeaux : sans lui, le mercenaire actuel est conservé (pas de repli sur un autre type)
  const offer = g.mercOffers().find((o) => o.type.id === 'desert' && o.unlocked);
  if (!offer) return;
  c.gold += offer.cost;
  g.hireMerc(offer.type.id, offer.type.variants.find((v) => v.id === 'defiance')?.id ?? offer.type.variants[0].id);
  if (!c.merc) return;
  // chaque pièce est essayée : celles que son type ne peut pas porter sont ignorées
  const tryMerc = (it: Item): boolean => {
    // sac plein : l'objet est posé en bout de liste le temps de l'équiper
    const placed = placeInInventory(c, it) >= 0;
    if (!placed) c.inventory.push(it);
    const i = c.inventory.indexOf(it);
    const ok = g.mercEquip(i).ok;
    if (!ok && placed) c.inventory[i] = null;
    if (!placed && c.inventory[c.inventory.length - 1] === (ok ? null : it)) c.inventory.pop();
    return ok;
  };
  for (const base of ['giant_thresher', 'thresher', 'colossus_voulge', 'great_poleaxe']) if (tryMerc(runeword(base, 4, ['Ber', 'Mal', 'Ber', 'Ist']))) break;
  for (const base of ['archon_plate', 'sacred_armor', 'wire_fleece']) if (tryMerc(runeword(base, 4, ['El', 'Sol', 'Dol', 'Lo']))) break;
  tryMerc(unique('demonhead', 'u_andariels_visage'));
}
