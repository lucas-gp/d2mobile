// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Patch Project Diablo 2 (saison 13) des tables vanilla de la base (Diablo II LoD 1.13c, régénérées depuis les MPQ : tools/vanilla/gen.ts).
 * Généré par diff (mods/pd2/tools/vanilla-diff.ts : tables du jeu pd2 d'avant le lot M6 − tables vanilla). Appliqué par mods/pd2/index.ts
 * avant les autres ajouts du mod ; mods/pd2/tests/unit/vanilla-patch.test.ts vérifie qu'il reproduit les tables pd2 à l'identique. Une
 * valeur PD2 changée volontairement : l'éditer ici, puis `npx tsx mods/pd2/tools/vanilla-diff.ts --no-vanilla --ref` (patch remis en
 * forme, empreintes de référence ré-enregistrées).
 */
import type { MercType, TablePatch } from '../../../src/mods/api';

/** Registre `mercs` : 4 entrée(s) patchée(s), 1 ajoutée(s) */
export const PD2_MERCS_PATCH: TablePatch<MercType> = {
  patch: {
    rogue: {
      weapons: ['bow', 'crossbow'],
      classItems: ['amazon'],
      variants: [
        {
          id: 'fire',
          name: 'Feu',
          desc: 'Aura Vigueur (vitesse de course). Flèche de feu, Flèche explosive.',
          aura: 'vigor',
          elem: 'fire',
          skills: [
            { id: 'attack', pct: 15 },
            { id: 'fire_arrow', pct: 60 },
            { id: 'exploding_arrow', pct: 25 },
          ],
        },
        {
          id: 'cold',
          name: 'Froid',
          desc: 'Aura Méditation (récupération du mana). Flèche de froid, Flèche de gel.',
          aura: 'meditation',
          elem: 'cold',
          skills: [
            { id: 'attack', pct: 15 },
            { id: 'cold_arrow', pct: 60 },
            { id: 'freezing_arrow', pct: 25 },
          ],
        },
        {
          id: 'phys',
          name: 'Physique',
          desc: 'Sans aura. Flèche magique, Mitraille, Ralentissement (les monstres touchés ralentissent).',
          elem: 'magic',
          skills: [
            { id: 'attack', pct: 15 },
            { id: 'slow_movement', pct: 15 },
            { id: 'magic_arrow', pct: 45 },
            { id: 'strafe', pct: 25 },
          ],
        },
      ],
    },
    desert: {
      weapons: ['polearm', 'spear', 'javelin'],
      classItems: ['amazon', 'barbarian'],
      oneHandDouble: true,
      variants: [
        {
          id: 'defiance',
          name: 'Défensif',
          desc: 'Aura Défi : défense augmentée pour le groupe. Estoc.',
          aura: 'defiance',
          elem: 'phys',
          skills: [
            { id: 'attack', pct: 20 },
            { id: 'jab', pct: 80 },
          ],
        },
        {
          id: 'blessed_aim',
          name: 'Offensif',
          desc: "Aura Visée bénie : score d'attaque augmenté pour le groupe. Estoc.",
          aura: 'blessed_aim',
          elem: 'phys',
          skills: [
            { id: 'attack', pct: 20 },
            { id: 'jab', pct: 80 },
          ],
        },
        {
          id: 'thorns',
          name: 'Combat',
          desc: 'Aura Épines : renvoie les coups de mêlée reçus. Estoc.',
          aura: 'thorns',
          elem: 'phys',
          skills: [
            { id: 'attack', pct: 20 },
            { id: 'jab', pct: 80 },
          ],
        },
      ],
    },
    ironwolf: {
      weapons: ['sword', 'wand', 'scepter', 'mace', 'orb'],
      classItems: ['paladin', 'sorceress'],
      variants: [
        {
          id: 'fire',
          name: 'Feu',
          desc: 'Aura Purification. Boule de feu, Météore ; maîtrise du feu (vie à chaque victime).',
          aura: 'cleansing',
          elem: 'fire',
          mastery: 'fire_mastery',
          skills: [
            { id: 'fire_ball', pct: 70 },
            { id: 'meteor', pct: 30 },
          ],
        },
        {
          id: 'cold',
          name: 'Froid',
          desc: 'Aura Prière (soins). Explosion de glace (gèle), Blizzard ; maîtrise du froid.',
          aura: 'prayer',
          elem: 'cold',
          mastery: 'cold_mastery',
          skills: [
            { id: 'ice_blast', pct: 70 },
            { id: 'blizzard', pct: 30 },
          ],
        },
        {
          id: 'light',
          name: 'Foudre',
          desc: 'Aura Choc sacré. Foudre, Champ statique ; maîtrise de la foudre.',
          aura: 'holy_shock',
          elem: 'light',
          mastery: 'lightning_mastery',
          skills: [
            { id: 'lightning', pct: 75 },
            { id: 'static_field', pct: 25 },
          ],
        },
      ],
    },
    barbarian: {
      weapons: ['sword', 'axe', 'mace'],
      classItems: ['barbarian'],
      oneHandDouble: true,
      variants: [
        {
          id: 'combat',
          name: 'Combat',
          desc: 'Aura Puissance. Coup violent, Attaque concentrée.',
          aura: 'might',
          elem: 'phys',
          skills: [
            { id: 'attack', pct: 20 },
            { id: 'concentrate', pct: 40 },
            { id: 'bash', pct: 40 },
          ],
        },
        {
          id: 'warcries',
          name: 'Cris de guerre',
          desc: 'Tourbillon, Cri de bataille (affaiblit les monstres), Ordres de bataille (vie et mana du groupe).',
          elem: 'phys',
          skills: [
            { id: 'attack', pct: 20 },
            { id: 'whirlwind', pct: 60 },
            { id: 'battle_cry', pct: 15 },
            { id: 'battle_orders', pct: 5 },
          ],
        },
      ],
    },
  },
  add: [
    {
      entry: {
        id: 'ascendant',
        act: 4,
        name: 'Ascendant',
        title: "Ascendant de l'acte IV",
        unlock: 'chaos',
        weapons: ['staff'],
        shield: false,
        classItems: [],
        oneHandDouble: false,
        style: 'caster',
        range: 8,
        atkTicks: 26,
        speed: 4.3,
        sprite: 'merc_ascendant',
        names: ['Kerith', 'Jered', 'Halbu', 'Kalan', 'Mehtan', 'Ezrok', 'Yshari', 'Arkhan', 'Valthek', 'Orsin'],
        variants: [
          {
            id: 'dark',
            name: 'Sombre',
            desc: "Sans aura. Amplification des dégâts (résistance physique réduite), Dents, Lance d'os, Armure d'os.",
            elem: 'magic',
            mastery: 'mastery',
            skills: [
              { id: 'amplify_damage', pct: 8 },
              { id: 'teeth', pct: 40 },
              { id: 'bone_spear', pct: 40 },
              { id: 'bone_armor', pct: 12 },
            ],
          },
          {
            id: 'light',
            name: 'Lumière',
            desc: 'Aura Sanctuaire. Éclair sacré, Lumière sacrée (soigne le groupe), Poing des cieux.',
            aura: 'sanctuary',
            elem: 'magic',
            mastery: 'mastery',
            skills: [
              { id: 'holy_bolt', pct: 65 },
              { id: 'holy_light', pct: 10 },
              { id: 'fist_of_the_heavens', pct: 25 },
            ],
          },
        ],
      },
      after: 'ironwolf',
    },
  ],
};
