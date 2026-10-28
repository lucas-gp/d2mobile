/**
 * Icônes de compétences de Diablo II (data\global\ui\spells\*skillicon.dc6, 48 × 48) : un atlas PNG `game/icons/skills.png` et son
 * index `skills.json` (identifiant de compétence du jeu → case). Les identifiants sont ceux des noms de Skills.txt, plus des alias pour
 * les compétences du jeu qui portent un autre nom (PD2, noms d'avant la 1.10) ; une compétence sans icône D2 garde son icône du jeu.
 */
import type { GameData } from './data';
import { decodeDc6 } from './formats/dc6';
import { putJson, type Sink } from './sink';

const FILES: Record<string, string> = { sor: 'so', dru: 'dr', bar: 'ba', pal: 'pa', ama: 'am', ass: 'as', nec: 'ne' };

/** compétence du jeu → nom (normalisé) de la compétence D2 dont on prend l'icône */
const ALIAS: Record<string, string> = {
  // Sorcière
  lesser_hydra: 'hydra',
  combustion: 'blaze',
  cold_enchant: 'enchant',
  ice_barrage: 'frozen_orb',
  // Druide
  gust: 'hurricane',
  werewolf: 'feral_rage',
  werebear: 'maul',
  spirit_wolf: 'summon_spirit_wolf',
  heart_wolverine: 'heart_of_wolverine',
  spirit_barbs: 'spirit_of_barbs',
  grizzly: 'summon_grizzly',
  // Barbare
  one_hand_mastery: 'sword_mastery',
  two_hand_mastery: 'pole_arm_mastery',
  combat_reflexes: 'increased_stamina',
  split_throw: 'double_throw',
  deep_wounds: 'berserk',
  // Paladin
  holy_light: 'sanctuary',
  joust: 'charge',
  holy_sword: 'zeal',
  holy_nova: 'holy_bolt',
  // Amazone
  slow_movement: 'slow_missiles',
  decoy: 'dopplezon',
  javelin_mastery: 'pierce',
  // Assassin
  phoenix_strike: 'royal_strike',
  burst_of_speed: 'quickness',
  fire_blast: 'fire_trauma',
  shock_web: 'shock_field',
  wake_of_fire: 'wake_of_fire_sentry',
  wake_of_inferno: 'inferno_sentry',
  chain_lightning_sentry: 'lightning_sentry',
  // Nécromancien
  skeletal_mage: 'raise_skeletal_mage',
  blood_golem: 'bloodgolem',
  iron_golem: 'irongolem',
  fire_golem: 'firegolem',
  raise_skeleton_archer: 'raise_skeleton',
  curse_mastery: 'terror',
  desecrate: 'poison_explosion',
  dark_pact: 'life_tap',
  blood_warp: 'attract',
};

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
const CELL = 48;
const COLS = 12;

export async function exportSkillIcons(data: GameData, out: Sink, log: (s: string) => void): Promise<number> {
  const { vfs } = data;
  const rows = data.needTable('skills').rows;
  const pal = data.palette(1);
  const icons = new Map<string, Uint8Array>(); // clé D2 normalisée → RGBA 48 × 48
  for (const [cc, code] of Object.entries(FILES)) {
    const bytes = vfs.get(`data\\global\\ui\\spells\\${code}skillicon.dc6`);
    if (!bytes) {
      log(`  ! ${code}skillicon.dc6 absent`);
      continue;
    }
    const dc = decodeDc6(bytes);
    for (const r of rows.filter((x) => x.charclass === cc)) {
      const fr = dc.frames[Number(r.IconCel)];
      if (!fr) continue;
      const rgba = new Uint8Array(CELL * CELL * 4);
      for (let y = 0; y < Math.min(fr.h, CELL); y++) {
        for (let x = 0; x < Math.min(fr.w, CELL); x++) {
          const c = fr.px[y * fr.w + x];
          if (!c) continue;
          rgba.set([pal[c * 3], pal[c * 3 + 1], pal[c * 3 + 2], 255], (y * CELL + x) * 4);
        }
      }
      const k = norm(r.skill);
      if (!icons.has(k)) icons.set(k, rgba);
    }
  }
  const keys = new Map<string, string>(); // id du jeu → clé D2
  for (const k of icons.keys()) keys.set(k, k);
  for (const [game, d2] of Object.entries(ALIAS)) if (icons.has(d2) && !icons.has(game)) keys.set(game, d2);
  const unique = [...new Set(keys.values())];
  const cellOf = new Map(unique.map((k, i) => [k, i]));
  const W = COLS * CELL;
  const H = Math.ceil(unique.length / COLS) * CELL;
  const atlas = new Uint8Array(W * H * 4);
  unique.forEach((k, i) => {
    const src = icons.get(k)!;
    const x0 = (i % COLS) * CELL;
    const y0 = Math.floor(i / COLS) * CELL;
    for (let y = 0; y < CELL; y++) atlas.set(src.subarray(y * CELL * 4, (y + 1) * CELL * 4), ((y0 + y) * W + x0) * 4);
  });
  await out.png('icons/skills.png', W, H, atlas);
  const ids: Record<string, number> = {};
  for (const [game, d2] of keys) ids[game] = cellOf.get(d2)!;
  await putJson(out, 'icons/skills.json', { cell: CELL, cols: COLS, ids });
  log(`  icônes de compétences : ${unique.length} images D2, ${keys.size} identifiants du jeu`);
  return keys.size;
}

/** Écran de chargement de D2 (loading\loadingscreen.dc6, palette « loading ») : 10 images de 256 × 256 en bande verticale, la porte qui s'ouvre */
export async function exportLoadingArt(data: GameData, out: Sink, log: (s: string) => void): Promise<void> {
  const bytes = data.vfs.get('data\\global\\ui\\loading\\loadingscreen.dc6');
  if (!bytes) return;
  const dc = decodeDc6(bytes);
  const pal = data.palette('loading');
  const n = dc.frames.length;
  const W = 256;
  const H = 256 * n;
  const img = new Uint8Array(W * H * 4);
  dc.frames.forEach((fr, k) => {
    for (let y = 0; y < Math.min(256, fr.h); y++) {
      for (let x = 0; x < Math.min(256, fr.w); x++) {
        const c = fr.px[y * fr.w + x];
        img.set(c ? [pal[c * 3], pal[c * 3 + 1], pal[c * 3 + 2], 255] : [0, 0, 0, 255], ((k * 256 + y) * W + x) * 4);
      }
    }
  });
  await out.png('icons/loading.png', W, H, img);
  await putJson(out, 'icons/loading.json', { frames: n, size: 256 });
  log(`  écran de chargement : ${n} images`);
}
