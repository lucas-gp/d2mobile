/**
 * Génère src/data/monsters-d2.ts : les monstres de Diablo II qui peuplent les zones de farm mais manquaient au jeu (Homme-bouc, Spectre, Affligé, Seigneur goule,
 * Panse-sanglante, Sbire, Tentatrice, Furie stygienne, Souilleur, Diablotin, Bête de siège, Mutileur, Surveillant, Mort rôdeur), d'après monstats.txt
 * (vie, dégâts, expérience, vitesse, résistances) avec les mêmes échelles que les monstres existants (vie ≈ 0,0105 × vie D2 moyenne, dégâts ≈ 0,013 × dégât moyen).
 * Usage : npx tsx tools/audit/gen-monsters-d2.ts [dossier de sortie] (`npm run vanilla -- monsters` : contrôle contre le fichier du jeu)
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { D2_HEADER, rows, num } from './common';

const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'src/data';

interface Spec {
  id: string;
  d2: string;
  fr: string;
  family: 'demon_small' | 'demon_medium' | 'demon_large' | 'undead' | 'skeleton' | 'beast';
  /** planche du jeu utilisée sans l'import D2 */
  sprite: string;
  role: 'melee' | 'swarm' | 'fire' | 'cold' | 'poison' | 'ranged';
  radius: number;
  scale: number;
  act: number;
}

/** Compétences de monstats.txt rapportées aux attaques du jeu (mêlée élémentaire, projectiles, nova, charge, invocation) */
const M = (k: string, el: string, dmg = 0.8) => `{ ...missile('${k}', '${el}', 9, ${dmg}, 40), weight: 4 }`;
const N = (el: string, r = 4.5) => `nova('${el}', ${r}, 0.8, 110, 3)`;
const CH = (range = 6, dmg = 1.4) => `{ kind: 'charge', range: ${range}, frames: 14, hitFrame: 8, element: 'phys', dmgMul: ${dmg}, cooldown: 120, weight: 3 }`;
const SU = (id: string) => `{ kind: 'summon', range: 14, frames: 22, hitFrame: 12, element: 'magic', dmgMul: 0, cooldown: 220, summon: '${id}', weight: 2 }`;
/** malédiction lancée sur le joueur (Defense Curse, Weaken, Decrepify de monstats) */
const CU = (curse: string) => `{ kind: 'curse', range: 9, frames: 18, hitFrame: 10, element: 'magic', dmgMul: 0, cooldown: 200, curse: '${curse}', weight: 2 }`;
/** soin des alliés (Zakarum Heal, Healing Vortex) */
const HE = `{ kind: 'heal', range: 8, frames: 18, hitFrame: 10, element: 'magic', dmgMul: 0, cooldown: 150, weight: 3 }`;
/** Châtiment (Smite) : coup qui étourdit le joueur */
const SM = (dmg = 1.1) => `{ ...melee(16, 8, ${dmg}, 0.7), stun: 12, cooldown: 90, weight: 4 }`;
const SKILLS: Record<string, { melee?: string; extra?: string[] }> = {
  goatman: { melee: 'light' },
  afflicted: { melee: 'light' },
  ghoul_lord: { melee: 'cold', extra: [M('firebolt_m', 'fire', 0.9), N('fire')] },
  succubus: { extra: [M('bone', 'magic'), CU('defense_curse')] },
  succubus_witch: { extra: [M('bone', 'magic'), M('firebolt_m', 'fire'), CU('weaken')] },
  imp: { extra: [M('firebolt_m', 'fire'), N('fire', 3.5)] },
  siege_beast: { extra: [CH(7, 1.6), N('phys', 3.5)] },
  overseer: { extra: [SU('minion'), HE, SM()] },
  // Nest : la Génitrice relâche des Bêtes de chair (vilechild), pas des diablotins
  vile_mother: { extra: [SU('flesh_beast')] },
  blunderbore: { extra: [SM(1.2)] },
  putrid_defiler: { melee: 'poison', extra: [SU('pain_worm')] },
  sand_maggot: { extra: [SU('maggot_young')] },
  maggot_queen: { extra: [SU('maggot_young')] },
  dark_spearwoman: { extra: [CH(4, 1.1)] },
  balrog: { extra: [`{ kind: 'breath', range: 4, frames: 18, hitFrame: 10, element: 'fire', dmgMul: 0.9, cooldown: 60, weight: 5 }`] },
  abyss_knight: { extra: [M('bone', 'magic', 0.55)] },
  water_watcher: { extra: [N('poison', 3)] },
  sand_leaper: { melee: 'poison', extra: [CH(5, 1.2)] },
  willowisp: { extra: [M('lightning_m', 'light', 0.9), N('light', 4)] },
  sand_raider: { melee: 'fire' },
  bat_demon: { melee: 'light' },
  quill_rat: { melee: 'poison' },
  foul_crow: { melee: 'poison' },
  claw_viper: { melee: 'light', extra: [CH(5, 1.3)] },
  locust: { extra: [CH(4, 1.1)] },
  prowling_dead: { extra: [CH(6, 1.3)] },
  fetish: { melee: 'poison' },
  mosquito: { melee: 'poison' },
  thornhulk: { extra: [N('poison', 4)] },
  frog_demon: { extra: [CH(6, 1.3)] },
  cantor: { extra: [M('lightning_m', 'light', 0.9), N('light', 4), HE] },
  snowy_yeti: { melee: 'cold' },
  frozen_horror: { melee: 'cold', extra: [N('cold', 4)] },
  suicide_minion: { extra: [N('fire', 3)] },
};

const SPECS: Spec[] = [
  { id: 'goatman', d2: 'goatman2', fr: 'Homme-bouc', family: 'demon_medium', sprite: 'fallen', role: 'melee', radius: 0.45, scale: 0.95, act: 1 },
  { id: 'wraith', d2: 'wraith4', fr: 'Spectre', family: 'undead', sprite: 'dark_stalker', role: 'melee', radius: 0.4, scale: 0.95, act: 1 },
  { id: 'afflicted', d2: 'bighead1', fr: 'Affligé', family: 'undead', sprite: 'zombie', role: 'melee', radius: 0.45, scale: 0.95, act: 1 },
  { id: 'ghoul_lord', d2: 'vampire1', fr: 'Seigneur goule', family: 'demon_medium', sprite: 'dark_stalker', role: 'fire', radius: 0.5, scale: 1, act: 2 },
  { id: 'blunderbore', d2: 'blunderbore2', fr: 'Panse-sanglante', family: 'demon_large', sprite: 'blood_lord', role: 'melee', radius: 0.65, scale: 1.2, act: 2 },
  { id: 'minion', d2: 'minion6', fr: 'Sbire asservi', family: 'demon_medium', sprite: 'minion_destruction', role: 'melee', radius: 0.5, scale: 1, act: 5 },
  { id: 'succubus', d2: 'succubus4', fr: 'Tentatrice infernale', family: 'demon_medium', sprite: 'dark_stalker', role: 'cold', radius: 0.4, scale: 1, act: 5 },
  { id: 'succubus_witch', d2: 'succubuswitch3', fr: 'Furie stygienne', family: 'demon_medium', sprite: 'dark_stalker', role: 'fire', radius: 0.4, scale: 1, act: 5 },
  { id: 'putrid_defiler', d2: 'putriddefiler2', fr: 'Souilleur répugnant', family: 'demon_medium', sprite: 'oblivion_knight', role: 'poison', radius: 0.5, scale: 1, act: 5 },
  { id: 'imp', d2: 'imp1', fr: 'Diablotin', family: 'demon_small', sprite: 'fallen', role: 'swarm', radius: 0.3, scale: 0.8, act: 5 },
  { id: 'siege_beast', d2: 'siegebeast2', fr: 'Bête de siège', family: 'demon_large', sprite: 'blood_lord', role: 'melee', radius: 0.8, scale: 1.4, act: 5 },
  { id: 'death_mauler', d2: 'deathmauler1', fr: 'Mutileur de la mort', family: 'beast', sprite: 'hell_bovine', role: 'melee', radius: 0.5, scale: 1, act: 5 },
  { id: 'overseer', d2: 'overseer1', fr: 'Surveillant', family: 'demon_medium', sprite: 'oblivion_knight', role: 'melee', radius: 0.5, scale: 1.05, act: 5 },
  { id: 'vile_mother', d2: 'vilemother1', fr: 'Génitrice de chair', family: 'demon_medium', sprite: 'blood_lord', role: 'melee', radius: 0.5, scale: 1, act: 4 },
  { id: 'regurgitator', d2: 'regurgitator1', fr: 'Corpulent', family: 'demon_large', sprite: 'blood_lord', role: 'poison', radius: 0.7, scale: 1.25, act: 4 },
  { id: 'sand_leaper', d2: 'sandleaper5', fr: 'Rôdeur des falaises', family: 'beast', sprite: 'hell_bovine', role: 'swarm', radius: 0.4, scale: 0.95, act: 4 },
  { id: 'willowisp', d2: 'willowisp3', fr: 'Âme brûlante', family: 'undead', sprite: 'dark_stalker', role: 'fire', radius: 0.4, scale: 0.9, act: 4 },
  { id: 'bat_demon', d2: 'batdemon5', fr: 'Familier sombre', family: 'demon_small', sprite: 'fallen', role: 'swarm', radius: 0.35, scale: 0.85, act: 4 },
  { id: 'sand_maggot', d2: 'sandmaggot5', fr: 'Ver de sang', family: 'beast', sprite: 'zombie', role: 'melee', radius: 0.4, scale: 0.9, act: 4 },
  { id: 'quill_rat', d2: 'quillrat1', fr: 'Rat à piquants', family: 'beast', sprite: 'fallen', role: 'swarm', radius: 0.35, scale: 0.8, act: 1 },
  { id: 'brute', d2: 'brute2', fr: 'Brute', family: 'demon_large', sprite: 'hell_bovine', role: 'melee', radius: 0.6, scale: 1.2, act: 1 },
  { id: 'foul_crow', d2: 'foulcrow2', fr: 'Corbeau impur', family: 'beast', sprite: 'fallen', role: 'swarm', radius: 0.3, scale: 0.75, act: 1 },
  { id: 'arach', d2: 'arach1', fr: 'Arach', family: 'beast', sprite: 'scarab', role: 'melee', radius: 0.55, scale: 1.1, act: 1 },
  { id: 'panther_woman', d2: 'pantherwoman1', fr: 'Chasseresse', family: 'beast', sprite: 'dark_stalker', role: 'melee', radius: 0.4, scale: 0.95, act: 2 },
  { id: 'slinger', d2: 'slinger1', fr: 'Lanceuse', family: 'beast', sprite: 'dark_stalker', role: 'ranged', radius: 0.4, scale: 0.95, act: 2 },
  { id: 'vulture', d2: 'vulture1', fr: 'Charognard', family: 'beast', sprite: 'fallen', role: 'swarm', radius: 0.35, scale: 0.85, act: 2 },
  { id: 'sand_raider', d2: 'sandraider1', fr: 'Pillard des sables', family: 'demon_medium', sprite: 'dark_stalker', role: 'melee', radius: 0.45, scale: 1, act: 2 },
  { id: 'claw_viper', d2: 'clawviper2', fr: 'Vipère griffue', family: 'beast', sprite: 'dark_stalker', role: 'melee', radius: 0.4, scale: 0.95, act: 2 },
  { id: 'locust', d2: 'swarm1', fr: 'Essaim', family: 'beast', sprite: 'fallen', role: 'swarm', radius: 0.3, scale: 0.7, act: 2 },
  { id: 'baboon', d2: 'baboon1', fr: 'Bête des dunes', family: 'beast', sprite: 'hell_bovine', role: 'melee', radius: 0.5, scale: 1, act: 2 },
  { id: 'fetish', d2: 'fetish2', fr: 'Fétiche', family: 'demon_small', sprite: 'soul_killer', role: 'swarm', radius: 0.35, scale: 0.85, act: 3 },
  { id: 'fetish_blow', d2: 'fetishblow2', fr: 'Fétiche sarbacane', family: 'demon_small', sprite: 'soul_killer', role: 'poison', radius: 0.35, scale: 0.85, act: 3 },
  { id: 'fetish_shaman', d2: 'fetishshaman2', fr: 'Chaman fétiche', family: 'demon_small', sprite: 'soul_killer', role: 'fire', radius: 0.35, scale: 0.9, act: 3 },
  { id: 'bone_fetish', d2: 'bonefetish4', fr: "Fétiche d'os", family: 'undead', sprite: 'soul_killer', role: 'swarm', radius: 0.35, scale: 0.85, act: 3 },
  { id: 'mosquito', d2: 'mosquito1', fr: 'Moustique géant', family: 'beast', sprite: 'fallen', role: 'swarm', radius: 0.3, scale: 0.8, act: 3 },
  { id: 'thornhulk', d2: 'thornhulk1', fr: "Colosse d'épines", family: 'demon_large', sprite: 'hell_bovine', role: 'melee', radius: 0.7, scale: 1.3, act: 3 },
  { id: 'frog_demon', d2: 'frogdemon1', fr: 'Démon-grenouille', family: 'beast', sprite: 'hell_bovine', role: 'melee', radius: 0.5, scale: 1.05, act: 3 },
  { id: 'zealot', d2: 'zealot1', fr: 'Zélote', family: 'demon_medium', sprite: 'oblivion_knight', role: 'melee', radius: 0.45, scale: 1, act: 3 },
  { id: 'cantor', d2: 'cantor1', fr: 'Chantre', family: 'demon_medium', sprite: 'oblivion_knight', role: 'fire', radius: 0.45, scale: 1, act: 3 },
  { id: 'snowy_yeti', d2: 'snowyeti1', fr: 'Yéti des neiges', family: 'beast', sprite: 'hell_bovine', role: 'melee', radius: 0.6, scale: 1.2, act: 5 },
  { id: 'frozen_horror', d2: 'frozenhorror1', fr: 'Horreur gelée', family: 'demon_large', sprite: 'blood_lord', role: 'melee', radius: 0.7, scale: 1.3, act: 5 },
  { id: 'suicide_minion', d2: 'suicideminion6', fr: 'Sbire kamikaze', family: 'demon_small', sprite: 'minion_destruction', role: 'swarm', radius: 0.4, scale: 0.9, act: 5 },
  { id: 'prowling_dead', d2: 'reanimatedhorde3', fr: 'Mort rôdeur', family: 'undead', sprite: 'zombie', role: 'melee', radius: 0.45, scale: 0.95, act: 5 },
  // espèces absentes jusqu'ici (audit 03, P1-7), sur des modèles existants
  { id: 'dark_ranger', d2: 'cr_archer1', fr: 'Archère sombre', family: 'demon_small', sprite: 'dark_stalker', role: 'ranged', radius: 0.4, scale: 0.95, act: 1 },
  { id: 'dark_spearwoman', d2: 'cr_lancer1', fr: 'Lancière sombre', family: 'demon_small', sprite: 'dark_stalker', role: 'melee', radius: 0.4, scale: 0.95, act: 1 },
  { id: 'doom_knight', d2: 'doomknight1', fr: 'Chevalier funeste', family: 'skeleton', sprite: 'oblivion_knight', role: 'melee', radius: 0.45, scale: 1.1, act: 4 },
  { id: 'abyss_knight', d2: 'doomknight2', fr: "Chevalier de l'abîme", family: 'skeleton', sprite: 'oblivion_knight', role: 'fire', radius: 0.45, scale: 1.1, act: 4 },
  { id: 'balrog', d2: 'megademon1', fr: 'Balrog', family: 'demon_large', sprite: 'venom_lord', role: 'melee', radius: 0.6, scale: 1.2, act: 4 },
  { id: 'flesh_beast', d2: 'vilechild1', fr: 'Bête de chair', family: 'demon_small', sprite: 'zombie', role: 'swarm', radius: 0.35, scale: 0.7, act: 4 },
  { id: 'maggot_young', d2: 'maggotbaby1', fr: 'Jeune ver des sables', family: 'beast', sprite: 'zombie', role: 'swarm', radius: 0.3, scale: 0.6, act: 2 },
  { id: 'maggot_queen', d2: 'maggotqueen1', fr: 'Reine des vers', family: 'beast', sprite: 'zombie', role: 'melee', radius: 0.8, scale: 1.5, act: 2 },
  { id: 'pain_worm', d2: 'painworm1', fr: 'Ver de douleur', family: 'beast', sprite: 'zombie', role: 'swarm', radius: 0.3, scale: 0.6, act: 5 },
  { id: 'water_watcher', d2: 'tentaclehead1', fr: 'Guetteur des eaux', family: 'beast', sprite: 'hydra', role: 'poison', radius: 0.5, scale: 1.1, act: 3 },
  { id: 'night_marauder', d2: 'baboon6', fr: 'Maraudeur nocturne', family: 'beast', sprite: 'hell_bovine', role: 'melee', radius: 0.5, scale: 1, act: 3 },
  { id: 'spear_cat', d2: 'slinger2', fr: 'Chatte-lancière', family: 'beast', sprite: 'dark_stalker', role: 'ranged', radius: 0.4, scale: 0.95, act: 2 },
];

/** Champs supplémentaires : teinte des espèces sur modèle partagé, variantes d'espèce par groupe (alts : D2 mêle ces familles
 *  dans les mêmes zones, Levels.txt), immobilité, Self-resurrect */
const EXTRA: Record<string, string[]> = {
  dark_ranger: ['tint: 0xc0a0ff'],
  dark_spearwoman: ['tint: 0xa0c0ff'],
  doom_knight: ['tint: 0xb0b0b0'],
  abyss_knight: ['tint: 0x8080ff'],
  balrog: ['tint: 0xff7050'],
  flesh_beast: ['tint: 0xe08080'],
  maggot_young: ['tint: 0xd8c090'],
  maggot_queen: ['tint: 0xd8c090'],
  pain_worm: ['tint: 0xc06060'],
  water_watcher: ['tint: 0x60a0a0'],
  night_marauder: ['tint: 0x505070'],
  spear_cat: ['tint: 0xd0b070'],
  slinger: ["alts: [['spear_cat', 0.5]]"],
  baboon: ["alts: [['night_marauder', 0.3]]"],
  frog_demon: ["alts: [['water_watcher', 0.25]]"],
  prowling_dead: ['selfRes: true'],
};
/** Espèces immobiles (Guetteur des eaux : tentacule qui sort de l'eau) */
const STILL = new Set(['water_watcher']);

const ms = new Map(rows('monstats').map((r) => [String(r.Id ?? r.id).toLowerCase(), r]));
const res = (r: Record<string, string>, k: string): string => {
  const n = num(r[k]);
  const c = num(r[`${k}(N)`]);
  const h = num(r[`${k}(H)`]);
  return n || c || h ? `[${n}, ${c || n}, ${h || c || n}]` : '';
};
const out: string[] = [];
const owners: string[] = [];
const actors: string[] = [];
for (const s of SPECS) {
  const r = ms.get(s.d2)!;
  const hp = (num(r.minHP) + num(r.maxHP)) / 2;
  const dmg = (num(r.A1MinD) + num(r.A1MaxD)) / 2;
  const speed = STILL.has(s.id) ? 0 : Math.max(1.4, Math.round(Math.max(num(r.Velocity), num(r.Run)) * 0.5 * 1.16 * 10) / 10);
  const el = { melee: '', swarm: '', fire: 'fire', cold: 'cold', poison: 'poison', ranged: 'phys' }[s.role];
  const sk = SKILLS[s.id] ?? {};
  const attacks =
    s.role === 'melee' || s.role === 'swarm'
      ? `[melee(14, 7, 1, ${s.radius > 0.6 ? 0.9 : 0.6}${sk.melee ? `, '${sk.melee}'` : ''})${(sk.extra ?? []).map((e) => `, ${e}`).join('')}]`
      : `[melee(14, 7, 1, 0.6${sk.melee ? `, '${sk.melee}'` : ''}), { ...missile('${el === 'fire' ? 'firebolt_m' : el === 'cold' ? 'coldbolt_m' : el === 'phys' ? 'arrow' : 'spit'}', '${el}', 9, 0.8, 45), weight: 4 }${(sk.extra ?? []).map((e) => `, ${e}`).join('')}]`;
  const resists = (['ResDm:phys', 'ResMa:magic', 'ResFi:fire', 'ResLi:light', 'ResCo:cold', 'ResPo:poison'] as const)
    .map((p) => {
      const [k, e] = p.split(':');
      const v = res(r as Record<string, string>, k);
      return v ? `${e}: ${v}` : '';
    })
    .filter(Boolean)
    .join(', ');
  out.push(`  {
    id: '${s.id}',
    name: '${s.fr.replace(/'/g, "\\'")}',
    family: '${s.family}',
    sprite: '${s.sprite}',
    radius: ${s.radius},
    scale: ${s.scale},
    speed: ${speed},
    ai: '${s.role === 'melee' ? 'melee' : s.role === 'swarm' ? 'swarm' : 'caster'}',
    hp: ${Math.round(hp * 0.0105 * 100) / 100},
    dmg: ${Math.max(0.7, Math.round(dmg * 0.013 * 100) / 100)},
    xp: ${Math.round((num(r.Exp) / 95) * 100) / 100},
    // monstats ${s.d2}
    attacks: ${attacks},
    res: { ${resists} },
    aggro: ${s.role === 'melee' || s.role === 'swarm' ? 12 : 13},${s.role === 'melee' || s.role === 'swarm' || STILL.has(s.id) ? '' : '\n    keepDistance: 4,'}${(EXTRA[s.id] ?? []).map((e) => `\n    ${e},`).join('')}
  },`);
  owners.push(`  ${s.id}: '${s.d2.replace(/\d+$/, '').toUpperCase()}',`);
  actors.push(`  mon('${s.id}', '${String(r.Code).toLowerCase()}', { act: ${s.act} }),`);
}
writeFileSync(
  join(OUT, 'monsters-d2.ts'),
  `${D2_HEADER}/**
 * Monstres de Diablo II ajoutés pour peupler les zones de farm comme Levels.txt (voir levels.ts). Généré par tools/audit/gen-monsters-d2.ts d'après monstats.txt : ne pas modifier à la main.
 */
import type { MonsterDef } from './types';
import { melee, missile, nova } from './monster-attacks';

export const MONSTERS_D2: MonsterDef[] = [
${out.join('\n')}
];
`,
);
console.log('--- propriétaires de sons (d2sound-map.ts)\n' + owners.join('\n') + '\n--- acteurs (game-map.ts)\n' + actors.join('\n'));
