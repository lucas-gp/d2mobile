// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Apparence des armes portées : [code de calque D2 (« normcode » de weapons.txt), classe d'arme à une main, classe d'arme à deux mains] de chaque base.
 * La planche `<classe>_rh_<code>` (ou `_lh_` pour les arcs) est superposée au corps quand l'import D2 la fournit et que la classe d'arme du corps correspond.
 * Généré par tools/d2import/gen-weapon-look.ts ; une base absente n'a pas d'arme visible.
 */
import { BASE_BY_ID } from '../data/items/bases';

export const WEAPON_LOOK: Record<string, [string, string, string]> = {
  short_staff: ['sst', 'stf', 'stf'],
  long_staff: ['lst', 'stf', 'stf'],
  gnarled_staff: ['cst', 'stf', 'stf'],
  battle_staff: ['bst', 'stf', 'stf'],
  war_staff: ['wst', 'stf', 'stf'],
  rune_staff: ['wst', 'stf', 'stf'],
  archon_staff: ['wst', 'stf', 'stf'],
  eagle_orb: ['ob1', '1hs', '1hs'],
  sacred_globe: ['ob2', '1hs', '1hs'],
  smoked_sphere: ['ob3', '1hs', '1hs'],
  swirling_crystal: ['ob5', '1hs', '1hs'],
  dimensional_shard: ['ob5', '1hs', '1hs'],
  eldritch_orb: ['ob2', '1hs', '1hs'],
  wand: ['wnd', '1hs', '1hs'],
  bone_wand: ['bwn', '1hs', '1hs'],
  tomb_wand: ['bwn', '1hs', '1hs'],
  lich_wand: ['bwn', '1hs', '1hs'],
  long_sword: ['lsd', '1hs', '1hs'],
  two_handed_sword: ['2hs', '1hs', '2hs'],
  broad_axe: ['bax', 'stf', 'stf'],
  bearded_axe: ['bax', 'stf', 'stf'],
  bec_de_corbin: ['hal', 'stf', 'stf'],
  hunters_bow: ['hbw', 'bow', 'bow'],
  chu_ko_nu: ['rxb', 'xbw', 'xbw'],
  short_sword: ['ssd', '1hs', '1hs'],
  crystal_sword: ['crs', '1hs', '1hs'],
  broad_sword: ['bsd', '1hs', '1hs'],
  phase_blade: ['crs', '1hs', '1hs'],
  dagger: ['dgr', '1ht', '1ht'],
  mace: ['mac', '1hs', '1hs'],
  flail: ['fla', '1hs', '1hs'],
  hand_axe: ['hax', '1hs', '1hs'],
  war_axe: ['wax', '1hs', '1hs'],
  short_bow: ['sbw', 'bow', 'bow'],
  long_bow: ['lbw', 'bow', 'bow'],
  long_war_bow: ['lwb', 'bow', 'bow'],
  cedar_bow: ['lbw', 'bow', 'bow'],
  rune_bow: ['swb', 'bow', 'bow'],
  gothic_bow: ['lwb', 'bow', 'bow'],
  shadow_bow: ['lbw', 'bow', 'bow'],
  crusader_bow: ['lbb', 'bow', 'bow'],
  hydra_bow: ['lwb', 'bow', 'bow'],
  spear: ['spr', '2ht', '2ht'],
  voulge: ['vou', 'stf', 'stf'],
  pike: ['pik', '2ht', '2ht'],
  war_spear: ['spr', '2ht', '2ht'],
  bill: ['vou', 'stf', 'stf'],
  lance: ['pik', '2ht', '2ht'],
  hyperion_spear: ['spr', '2ht', '2ht'],
  thresher: ['scy', 'stf', 'stf'],
  giant_thresher: ['wsc', 'stf', 'stf'],
  axe: ['axe', '1hs', '1hs'],
  double_axe: ['2ax', '1hs', '1hs'],
  military_pick: ['mpi', '1hs', '1hs'],
  large_axe: ['lax', 'stf', 'stf'],
  battle_axe: ['btx', 'stf', 'stf'],
  great_axe: ['gax', 'stf', 'stf'],
  giant_axe: ['gix', 'stf', 'stf'],
  yew_wand: ['ywn', '1hs', '1hs'],
  grim_wand: ['gwn', '1hs', '1hs'],
  club: ['clb', '1hs', '1hs'],
  scepter: ['scp', '1hs', '1hs'],
  grand_scepter: ['gsc', '1hs', '1hs'],
  war_scepter: ['wsp', '1hs', '1hs'],
  spiked_club: ['spc', '1hs', '1hs'],
  morning_star: ['mst', '1hs', '1hs'],
  war_hammer: ['whm', '1hs', '1hs'],
  maul: ['mau', 'stf', 'stf'],
  great_maul: ['gma', 'stf', 'stf'],
  scimitar: ['scm', '1hs', '1hs'],
  saber: ['sbr', '1hs', '1hs'],
  falchion: ['flc', '1hs', '1hs'],
  war_sword: ['wsd', '1hs', '1hs'],
  claymore: ['clm', '1hs', '2hs'],
  giant_sword: ['gis', '1hs', '2hs'],
  bastard_sword: ['bsw', '1hs', '2hs'],
  flamberge: ['flb', '1hs', '2hs'],
  great_sword: ['gsd', '1hs', '2hs'],
  dirk: ['dir', '1ht', '1ht'],
  kriss: ['kri', '1ht', '1ht'],
  blade: ['bld', '1ht', '1ht'],
  throwing_knife: ['tkf', '1ht', '1ht'],
  throwing_axe: ['tax', '1hs', '1hs'],
  balanced_knife: ['bkf', '1ht', '1ht'],
  balanced_axe: ['bal', '1hs', '1hs'],
  javelin: ['jav', '1ht', '1ht'],
  pilum: ['pil', '1ht', '1ht'],
  short_spear: ['ssp', '1ht', '1ht'],
  glaive: ['glv', '1ht', '1ht'],
  throwing_spear: ['tsp', '1ht', '1ht'],
  trident: ['tri', '2ht', '2ht'],
  brandistock: ['brn', '2ht', '2ht'],
  spetum: ['spt', '2ht', '2ht'],
  bardiche: ['bar', 'stf', 'stf'],
  scythe: ['scy', 'stf', 'stf'],
  poleaxe: ['pax', 'stf', 'stf'],
  halberd: ['hal', 'stf', 'stf'],
  war_scythe: ['wsc', 'stf', 'stf'],
  composite_bow: ['cbw', 'bow', 'bow'],
  short_battle_bow: ['sbb', 'bow', 'bow'],
  long_battle_bow: ['lbb', 'bow', 'bow'],
  short_war_bow: ['swb', 'bow', 'bow'],
  light_crossbow: ['lxb', 'xbw', 'xbw'],
  crossbow: ['mxb', 'xbw', 'xbw'],
  heavy_crossbow: ['hxb', 'xbw', 'xbw'],
  repeating_crossbow: ['rxb', 'xbw', 'xbw'],
  hatchet: ['hax', '1hs', '1hs'],
  cleaver: ['axe', '1hs', '1hs'],
  twin_axe: ['2ax', '1hs', '1hs'],
  crowbill: ['mpi', '1hs', '1hs'],
  naga: ['wax', '1hs', '1hs'],
  military_axe: ['lax', 'stf', 'stf'],
  tabar: ['btx', 'stf', 'stf'],
  gothic_axe: ['gax', 'stf', 'stf'],
  ancient_axe: ['gix', 'stf', 'stf'],
  burnt_wand: ['wnd', '1hs', '1hs'],
  petrified_wand: ['ywn', '1hs', '1hs'],
  grave_wand: ['gwn', '1hs', '1hs'],
  cudgel: ['clb', '1hs', '1hs'],
  rune_scepter: ['scp', '1hs', '1hs'],
  holy_water_sprinkler: ['gsc', '1hs', '1hs'],
  divine_scepter: ['wsp', '1hs', '1hs'],
  barbed_club: ['spc', '1hs', '1hs'],
  flanged_mace: ['mac', '1hs', '1hs'],
  jagged_star: ['mst', '1hs', '1hs'],
  knout: ['fla', '1hs', '1hs'],
  battle_hammer: ['whm', '1hs', '1hs'],
  war_club: ['mau', 'stf', 'stf'],
  martel_de_fer: ['gma', 'stf', 'stf'],
  gladius: ['ssd', '1hs', '1hs'],
  cutlass: ['scm', '1hs', '1hs'],
  shamshir: ['sbr', '1hs', '1hs'],
  tulwar: ['flc', '1hs', '1hs'],
  dimensional_blade: ['crs', '1hs', '1hs'],
  battle_sword: ['bsd', '1hs', '1hs'],
  rune_sword: ['lsd', '1hs', '1hs'],
  ancient_sword: ['wsd', '1hs', '1hs'],
  espadon: ['2hs', '1hs', '2hs'],
  dacian_falx: ['clm', '1hs', '2hs'],
  tusk_sword: ['gis', '1hs', '2hs'],
  gothic_sword: ['bsw', '1hs', '2hs'],
  zweihander: ['flb', '1hs', '2hs'],
  executioner_sword: ['gsd', '1hs', '2hs'],
  poignard: ['dgr', '1ht', '1ht'],
  rondel: ['dir', '1ht', '1ht'],
  cinquedeas: ['kri', '1ht', '1ht'],
  stilleto: ['bld', '1ht', '1ht'],
  battle_dart: ['tkf', '1ht', '1ht'],
  francisca: ['tax', '1hs', '1hs'],
  war_dart: ['bkf', '1ht', '1ht'],
  hurlbat: ['bal', '1hs', '1hs'],
  war_javelin: ['jav', '1ht', '1ht'],
  great_pilum: ['pil', '1ht', '1ht'],
  simbilan: ['ssp', '1ht', '1ht'],
  spiculum: ['glv', '1ht', '1ht'],
  harpoon: ['tsp', '1ht', '1ht'],
  fuscina: ['tri', '2ht', '2ht'],
  war_fork: ['brn', '2ht', '2ht'],
  yari: ['spt', '2ht', '2ht'],
  lochaber_axe: ['bar', 'stf', 'stf'],
  battle_scythe: ['scy', 'stf', 'stf'],
  partizan: ['pax', 'stf', 'stf'],
  grim_scythe: ['wsc', 'stf', 'stf'],
  jo_staff: ['sst', 'stf', 'stf'],
  quarterstaff: ['lst', 'stf', 'stf'],
  cedar_staff: ['cst', 'stf', 'stf'],
  gothic_staff: ['bst', 'stf', 'stf'],
  edge_bow: ['sbw', 'bow', 'bow'],
  razor_bow: ['hbw', 'bow', 'bow'],
  double_bow: ['cbw', 'bow', 'bow'],
  short_siege_bow: ['sbb', 'bow', 'bow'],
  long_siege_bow: ['lbb', 'bow', 'bow'],
  arbalest: ['lxb', 'xbw', 'xbw'],
  siege_crossbow: ['mxb', 'xbw', 'xbw'],
  balista: ['hxb', 'xbw', 'xbw'],
  katar: ['ktr', 'ht1', 'ht1'],
  wrist_blade: ['wrb', 'ht1', 'ht1'],
  hatchet_hands: ['axf', 'ht1', 'ht1'],
  cestus: ['ces', 'ht1', 'ht1'],
  claws: ['clw', 'ht1', 'ht1'],
  blade_talons: ['btl', 'ht1', 'ht1'],
  scissors_katar: ['skr', 'ht1', 'ht1'],
  quhab: ['ktr', 'ht1', 'ht1'],
  wrist_spike: ['wrb', 'ht1', 'ht1'],
  fascia: ['axf', 'ht1', 'ht1'],
  hand_scythe: ['ces', 'ht1', 'ht1'],
  greater_claws: ['clw', 'ht1', 'ht1'],
  greater_talons: ['btl', 'ht1', 'ht1'],
  scissors_quhab: ['skr', 'ht1', 'ht1'],
  suwayyah: ['ktr', 'ht1', 'ht1'],
  wrist_sword: ['wrb', 'ht1', 'ht1'],
  war_fist: ['axf', 'ht1', 'ht1'],
  battle_cestus: ['ces', 'ht1', 'ht1'],
  feral_claws: ['clw', 'ht1', 'ht1'],
  runic_talons: ['btl', 'ht1', 'ht1'],
  scissors_suwayyah: ['skr', 'ht1', 'ht1'],
  tomahawk: ['hax', '1hs', '1hs'],
  small_crescent: ['axe', '1hs', '1hs'],
  ettin_axe: ['2ax', '1hs', '1hs'],
  war_spike: ['mpi', '1hs', '1hs'],
  berserker_axe: ['wax', '1hs', '1hs'],
  feral_axe: ['lax', 'stf', 'stf'],
  silver_edged_axe: ['bax', 'stf', 'stf'],
  decapitator: ['btx', 'stf', 'stf'],
  champion_axe: ['gax', 'stf', 'stf'],
  glorious_axe: ['gix', 'stf', 'stf'],
  polished_wand: ['wnd', '1hs', '1hs'],
  ghost_wand: ['ywn', '1hs', '1hs'],
  unearthed_wand: ['gwn', '1hs', '1hs'],
  truncheon: ['clb', '1hs', '1hs'],
  mighty_scepter: ['scp', '1hs', '1hs'],
  seraph_rod: ['gsc', '1hs', '1hs'],
  caduceus: ['wsp', '1hs', '1hs'],
  tyrant_club: ['spc', '1hs', '1hs'],
  reinforced_mace: ['mac', '1hs', '1hs'],
  devil_star: ['mst', '1hs', '1hs'],
  scourge: ['fla', '1hs', '1hs'],
  legendary_mallet: ['whm', '1hs', '1hs'],
  ogre_maul: ['mau', 'stf', 'stf'],
  thunder_maul: ['gma', 'stf', 'stf'],
  falcata: ['ssd', '1hs', '1hs'],
  ataghan: ['scm', '1hs', '1hs'],
  elegant_blade: ['sbr', '1hs', '1hs'],
  hydra_edge: ['flc', '1hs', '1hs'],
  conquest_sword: ['bsd', '1hs', '1hs'],
  cryptic_sword: ['lsd', '1hs', '1hs'],
  mythical_sword: ['wsd', '1hs', '1hs'],
  legend_sword: ['2hs', '1hs', '2hs'],
  highland_blade: ['clm', '1hs', '2hs'],
  balrog_blade: ['gis', '1hs', '2hs'],
  champion_sword: ['bsw', '1hs', '2hs'],
  colossal_sword: ['flb', '1hs', '2hs'],
  colossus_blade: ['gsd', '1hs', '2hs'],
  mithral_point: ['dir', '1ht', '1ht'],
  fanged_knife: ['kri', '1ht', '1ht'],
  legend_spike: ['bld', '1ht', '1ht'],
  flying_knife: ['tkf', '1ht', '1ht'],
  flying_axe: ['tax', '1hs', '1hs'],
  winged_knife: ['bkf', '1ht', '1ht'],
  winged_axe: ['bal', '1hs', '1hs'],
  hyperion_javelin: ['jav', '1ht', '1ht'],
  stygian_pilum: ['pil', '1ht', '1ht'],
  balrog_spear: ['ssp', '1ht', '1ht'],
  ghost_glaive: ['glv', '1ht', '1ht'],
  winged_harpoon: ['tsp', '1ht', '1ht'],
  stygian_pike: ['tri', '2ht', '2ht'],
  mancatcher: ['brn', '2ht', '2ht'],
  ghost_spear: ['spt', '2ht', '2ht'],
  war_pike: ['pik', '2ht', '2ht'],
  ogre_axe: ['bar', 'stf', 'stf'],
  colossus_voulge: ['vou', 'stf', 'stf'],
  cryptic_axe: ['pax', 'stf', 'stf'],
  great_poleaxe: ['hal', 'stf', 'stf'],
  walking_stick: ['sst', 'stf', 'stf'],
  stalagmite: ['lst', 'stf', 'stf'],
  elder_staff: ['cst', 'stf', 'stf'],
  shillelah: ['bst', 'stf', 'stf'],
  spider_bow: ['sbw', 'bow', 'bow'],
  blade_bow: ['hbw', 'bow', 'bow'],
  great_bow: ['cbw', 'bow', 'bow'],
  diamond_bow: ['sbb', 'bow', 'bow'],
  ward_bow: ['swb', 'bow', 'bow'],
  pellet_bow: ['lxb', 'xbw', 'xbw'],
  gorgon_crossbow: ['mxb', 'xbw', 'xbw'],
  colossus_crossbow: ['hxb', 'xbw', 'xbw'],
  demon_crossbow: ['rxb', 'xbw', 'xbw'],
  clasped_orb: ['ob4', '1hs', '1hs'],
  dragon_stone: ['ob5', '1hs', '1hs'],
  stag_bow: ['am1', 'bow', 'bow'],
  reflex_bow: ['am2', 'bow', 'bow'],
  maiden_spear: ['am3', '2ht', '2ht'],
  maiden_pike: ['am4', '2ht', '2ht'],
  maiden_javelin: ['am5', '1ht', '1ht'],
  glowing_orb: ['ob1', '1hs', '1hs'],
  crystalline_globe: ['ob2', '1hs', '1hs'],
  cloudy_sphere: ['ob3', '1hs', '1hs'],
  sparkling_ball: ['ob4', '1hs', '1hs'],
  ashwood_bow: ['am1', 'bow', 'bow'],
  ceremonial_bow: ['am2', 'bow', 'bow'],
  ceremonial_spear: ['am3', '2ht', '2ht'],
  ceremonial_pike: ['am4', '2ht', '2ht'],
  ceremonial_javelin: ['am5', '1ht', '1ht'],
  heavenly_stone: ['ob1', '1hs', '1hs'],
  demon_heart: ['ob3', '1hs', '1hs'],
  vortex_orb: ['ob4', '1hs', '1hs'],
  matriarchal_bow: ['am1', 'bow', 'bow'],
  grand_matron_bow: ['am2', 'bow', 'bow'],
  matriarchal_spear: ['am3', '2ht', '2ht'],
  matriarchal_pike: ['am4', '2ht', '2ht'],
  matriarchaljavelin: ['am5', '1ht', '1ht'],
};

/** Classe d'arme du corps de chaque classe dans l'import D2 : [classe d'arme, calque (rh = main droite, lh = main gauche)] */
export const BODY_WCLASS: Record<string, [string, string]> = {
  sorceress: ['stf', 'rh'],
  barbarian: ['1hs', 'rh'],
  paladin: ['1hs', 'rh'],
  necromancer: ['1hs', 'rh'],
  amazon: ['bow', 'lh'],
  assassin: ['ht1', 'rh'],
};

/** Corps par classe d'arme exportés (tools/d2import/game-map.ts : WCLASS_VARIANTS) */
export const WCLASS_BODIES: Record<string, string[]> = {
  barbarian: ['2hs', '2ht', 'stf', '1ht'],
  paladin: ['2hs', '2ht', 'stf', '1ht'],
  necromancer: ['2hs', '2ht', 'stf', '1ht'],
  amazon: ['2hs', '2ht', 'stf', '1hs', '1ht'],
  sorceress: ['1hs', '2hs', '2ht'],
};

/** Classe d'arme D2 d'une base (une ou deux mains) ; null si l'arme n'a pas de dessin (orbe) */
export function weaponClassOf(baseId: string): { wc: string; code: string } | null {
  const b = BASE_BY_ID[baseId];
  const look = WEAPON_LOOK[baseId];
  if (!b || !look) return null;
  return { wc: b.twoHanded ? look[2] : look[1], code: look[0] };
}

/** Classe d'arme du corps (id de planche) : celle d'une variante `<classe>_w<wc>`, sinon celle de la classe */
export function bodyWclass(classId: string, bodyId: string): string {
  const m = /_w([a-z0-9]{3})$/.exec(bodyId);
  return m ? m[1] : (BODY_WCLASS[classId]?.[0] ?? '1hs');
}

/** Corps à utiliser pour l'arme portée : la variante de sa classe d'arme quand l'import la fournit, sinon null (corps de la classe) */
export function bodyVariantFor(classId: string, base: string, baseId: string, has: (sheet: string) => boolean): string | null {
  const w = weaponClassOf(baseId);
  const spec = BODY_WCLASS[classId];
  if (!w || !spec || w.wc === spec[0]) return null;
  const id = `${base}_w${w.wc}`;
  return WCLASS_BODIES[classId]?.includes(w.wc) && has(id) ? id : null;
}

/** Premier dessin d'arme du jeu pour une classe d'arme : arme par défaut quand celle de la base n'a pas de planche */
const DEFAULT_CODE: Record<string, string> = { '1hs': 'ssd', stf: 'sst', bow: 'sbw', ht1: 'ktr', '2hs': 'bsd', '2ht': 'spr', '1ht': 'dgr' };
function defaultCode(wc: string): string {
  if (DEFAULT_CODE[wc] && Object.values(WEAPON_LOOK).some((v) => v[0] === DEFAULT_CODE[wc])) return DEFAULT_CODE[wc];
  for (const [id, v] of Object.entries(WEAPON_LOOK)) {
    const b = BASE_BY_ID[id];
    if (b && (b.twoHanded ? v[2] : v[1]) === wc) return v[0];
  }
  return 'ssd';
}

/**
 * Planche de l'arme portée (`<corps>_<calque>_<code>`) pour le corps choisi : le dessin de la base quand sa classe d'arme est celle du corps, sinon l'arme
 * par défaut de cette classe. Rien pour un orbe, pour une Amazone sans arme adaptée, ni pour la Sorcière et l'Assassin dont l'arme ne correspond pas.
 */
export function weaponPartId(classId: string, body: string, baseId: string, has: (sheet: string) => boolean): string | null {
  const spec = BODY_WCLASS[classId];
  const b = BASE_BY_ID[baseId];
  if (!spec || !b) return null;
  const wcBody = bodyWclass(classId, body);
  const layer = wcBody === 'bow' ? 'lh' : 'rh';
  // l'arc de l'Amazone ne se dessine qu'avec le corps « arc » ; une autre arme n'a de dessin que sur sa propre variante
  if (classId === 'amazon' && wcBody === 'bow' && b.type !== 'bow') return null;
  const w = weaponClassOf(baseId);
  const matches = !!w && w.wc === wcBody;
  if ((classId === 'sorceress' || classId === 'assassin') && !matches && wcBody === spec[0]) return null;
  const own = w && matches ? `${body}_${layer}_${w.code}` : '';
  if (own && has(own)) return own;
  // arme sans dessin propre dans cette classe d'arme : un dessin voisin du même genre (hallebarde pour les armes d'hast), sinon l'arme par défaut
  // orbe sans planche propre (seuls certains codes d'orbe ont un dessin D2) : l'orbe voisin
  if (b.type === 'orb') {
    for (const c of ['ob1', 'ob3', 'ob4', 'ob2', 'ob5']) if (has(`${body}_${layer}_${c}`)) return `${body}_${layer}_${c}`;
  }
  const KIN: Record<string, string> = { polearm: 'hal', mace: 'mau', axe: 'lax', sword: 'bsd', spear: 'spr' };
  const kin = KIN[b.type] ? `${body}_${layer}_${KIN[b.type]}` : '';
  if (kin && has(kin)) return kin;
  return `${body}_${layer}_${defaultCode(wcBody)}`;
}
