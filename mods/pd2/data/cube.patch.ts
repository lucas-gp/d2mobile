// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Patch Project Diablo 2 (saison 13) des tables vanilla de la base (Diablo II LoD 1.13c, régénérées depuis les MPQ : tools/vanilla/gen.ts).
 * Généré par diff (mods/pd2/tools/vanilla-diff.ts : tables du jeu pd2 d'avant le lot M6 − tables vanilla). Appliqué par mods/pd2/index.ts
 * avant les autres ajouts du mod ; mods/pd2/tests/unit/vanilla-patch.test.ts vérifie qu'il reproduit les tables pd2 à l'identique. Une
 * valeur PD2 changée volontairement : l'éditer ici, puis `npx tsx mods/pd2/tools/vanilla-diff.ts --no-vanilla --ref` (patch remis en
 * forme, empreintes de référence ré-enregistrées).
 */
import type { CubeRecipe, TablePatch } from '../../../src/mods/api';

/** Registre `cubeRecipes` : 37 entrée(s) patchée(s), 26 ajoutée(s) */
export const PD2_CUBE_PATCH: TablePatch<CubeRecipe> = {
  patch: {
    rune_r01: {
      desc: '3 runes El et une clé donnent une rune Eld.',
      cost: [
        { ids: ['r01'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    rune_r02: {
      desc: '3 runes Eld et une clé donnent une rune Tir.',
      cost: [
        { ids: ['r02'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    rune_r03: {
      desc: '3 runes Tir et une clé donnent une rune Nef.',
      cost: [
        { ids: ['r03'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    rune_r04: {
      desc: '3 runes Nef et une clé donnent une rune Eth.',
      cost: [
        { ids: ['r04'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    rune_r05: {
      desc: '3 runes Eth et une clé donnent une rune Ith.',
      cost: [
        { ids: ['r05'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    rune_r06: {
      desc: '3 runes Ith et une clé donnent une rune Tal.',
      cost: [
        { ids: ['r06'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    rune_r07: {
      desc: '3 runes Tal et une clé donnent une rune Ral.',
      cost: [
        { ids: ['r07'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    rune_r08: {
      desc: '3 runes Ral et une clé donnent une rune Ort.',
      cost: [
        { ids: ['r08'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    rune_r09: {
      desc: '3 runes Ort et une clé donnent une rune Thul.',
      cost: [
        { ids: ['r09'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    rune_r10: {
      desc: '3 runes Thul et une clé donnent une rune Amn.',
      cost: [
        { ids: ['r10'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    rune_r11: {
      desc: '3 runes Amn et une clé donnent une rune Sol.',
      cost: [
        { ids: ['r11'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    rune_r12: {
      desc: '3 runes Sol et une clé donnent une rune Shael.',
      cost: [
        { ids: ['r12'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    rune_r13: {
      desc: '3 runes Shael et une clé donnent une rune Dol.',
      cost: [
        { ids: ['r13'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    gem_ruby_3: {
      desc: 'Trois gemmes identiques donnent la même gemme au grade supérieur (clé requise pour la parfaite).',
      cost: [
        { ids: ['gem_ruby_3'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    gem_sapphire_3: {
      desc: 'Trois gemmes identiques donnent la même gemme au grade supérieur (clé requise pour la parfaite).',
      cost: [
        { ids: ['gem_sapphire_3'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    gem_topaz_3: {
      desc: 'Trois gemmes identiques donnent la même gemme au grade supérieur (clé requise pour la parfaite).',
      cost: [
        { ids: ['gem_topaz_3'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    gem_emerald_3: {
      desc: 'Trois gemmes identiques donnent la même gemme au grade supérieur (clé requise pour la parfaite).',
      cost: [
        { ids: ['gem_emerald_3'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    gem_diamond_3: {
      desc: 'Trois gemmes identiques donnent la même gemme au grade supérieur (clé requise pour la parfaite).',
      cost: [
        { ids: ['gem_diamond_3'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    gem_amethyst_3: {
      desc: 'Trois gemmes identiques donnent la même gemme au grade supérieur (clé requise pour la parfaite).',
      cost: [
        { ids: ['gem_amethyst_3'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    gem_skull_3: {
      desc: 'Trois gemmes identiques donnent la même gemme au grade supérieur (clé requise pour la parfaite).',
      cost: [
        { ids: ['gem_skull_3'], n: 3 },
        { ids: ['key'], n: 1 },
      ],
    },
    sock_weapon: { items: { n: 1, accept: { qualities: ['normal', 'superior'], types: ['weapon'], noSockets: true, notCorrupted: true } } },
    sock_shield: {
      desc: 'Tal + Amn + Rubis parfait : 1 à 4 châsses sur un bouclier normal sans châsse.',
      items: { n: 1, accept: { qualities: ['normal', 'superior'], types: ['shield'], noSockets: true, notCorrupted: true } },
      effect: { kind: 'addSockets', min: 1, max: 4 },
    },
    sock_armor: {
      desc: 'Tal + Thul + Topaze parfaite : 1 à 4 châsses sur une armure normale sans châsse.',
      items: { n: 1, accept: { qualities: ['normal', 'superior'], types: ['armor'], noSockets: true, notCorrupted: true } },
      effect: { kind: 'addSockets', min: 1, max: 4 },
    },
    sock_helm: {
      desc: 'Ral + Thul + Saphir parfait : 1 à 3 châsses sur un casque normal sans châsse.',
      items: { n: 1, accept: { qualities: ['normal', 'superior'], types: ['helm', 'circlet'], noSockets: true, notCorrupted: true } },
      effect: { kind: 'addSockets', min: 1, max: 3 },
    },
    prismatic_amulet: { effect: { kind: 'prismatic' } },
    craft_blood: {
      desc: 'Objet magique ou rare + joyau + rune de l’emplacement + Rubis parfait : objet d’artisan (vol de vie, vie, blessures ouvertes, coup écrasant) + 1 à 4 propriétés aléatoires selon le niveau ; l’éthéré est conservé.',
      items: { n: 1, accept: { qualities: ['magic', 'rare'], types: ['amulet', 'ring', 'belt', 'gloves', 'boots', 'helm', 'armor', 'shield', 'weapon', 'quiver'], notCorrupted: true } },
    },
    craft_caster: {
      desc: 'Objet magique ou rare + joyau + rune de l’emplacement + Améthyste parfaite : objet d’artisan (vitesse d’incantation, mana, énergie) + 1 à 4 propriétés aléatoires selon le niveau ; l’éthéré est conservé.',
      items: { n: 1, accept: { qualities: ['magic', 'rare'], types: ['amulet', 'ring', 'belt', 'gloves', 'boots', 'helm', 'armor', 'shield', 'weapon', 'quiver'], notCorrupted: true } },
    },
    craft_hitpower: {
      desc: 'Objet magique ou rare + joyau + rune de l’emplacement + Saphir parfait : objet d’artisan (score d’attaque, récupération après coup, Nova de glace quand vous êtes frappé) + 1 à 4 propriétés aléatoires selon le niveau ; l’éthéré est conservé.',
      items: { n: 1, accept: { qualities: ['magic', 'rare'], types: ['amulet', 'ring', 'belt', 'gloves', 'boots', 'helm', 'armor', 'shield', 'weapon', 'quiver'], notCorrupted: true } },
    },
    craft_safety: {
      desc: 'Objet magique ou rare + joyau + rune de l’emplacement + Émeraude parfaite : objet d’artisan (réduction des dégâts, défense, résistances) + 1 à 4 propriétés aléatoires selon le niveau ; l’éthéré est conservé.',
      items: { n: 1, accept: { qualities: ['magic', 'rare'], types: ['amulet', 'ring', 'belt', 'gloves', 'boots', 'helm', 'armor', 'shield', 'weapon', 'quiver'], notCorrupted: true } },
    },
    up_unique_weapon_1: {
      name: 'Arme unique/set → exceptionnelle',
      desc: 'Arme unique/set → exceptionnelle : même objet (propriétés conservées) sur la base du palier supérieur de la même famille.',
      items: { n: 1, accept: { qualities: ['unique', 'set'], types: ['weapon'], tiers: [0], notCorrupted: true } },
    },
    up_unique_armor_1: {
      name: 'Armure unique/set → exceptionnelle',
      desc: 'Armure unique/set → exceptionnelle : même objet (propriétés conservées) sur la base du palier supérieur de la même famille.',
      items: { n: 1, accept: { qualities: ['unique', 'set'], types: ['armorAny'], tiers: [0], notCorrupted: true } },
    },
    up_rare_weapon_1: {
      name: 'Arme rare/artisan → exceptionnelle',
      desc: 'Arme rare/artisan → exceptionnelle : même objet (propriétés conservées) sur la base du palier supérieur de la même famille.',
      items: { n: 1, accept: { qualities: ['rare', 'crafted'], types: ['weapon'], tiers: [0], notCorrupted: true } },
    },
    up_rare_armor_1: {
      name: 'Armure rare/artisan → exceptionnelle',
      desc: 'Armure rare/artisan → exceptionnelle : même objet (propriétés conservées) sur la base du palier supérieur de la même famille.',
      items: { n: 1, accept: { qualities: ['rare', 'crafted'], types: ['armorAny'], tiers: [0], notCorrupted: true } },
    },
    up_rare_weapon_2: {
      name: 'Arme rare/artisan → élite',
      desc: 'Arme rare/artisan → élite : même objet (propriétés conservées) sur la base du palier supérieur de la même famille.',
      items: { n: 1, accept: { qualities: ['rare', 'crafted'], types: ['weapon'], tiers: [1], notCorrupted: true } },
    },
    up_rare_armor_2: {
      name: 'Armure rare/artisan → élite',
      desc: 'Armure rare/artisan → élite : même objet (propriétés conservées) sur la base du palier supérieur de la même famille.',
      items: { n: 1, accept: { qualities: ['rare', 'crafted'], types: ['armorAny'], tiers: [1], notCorrupted: true } },
    },
    pandemonium_keys: {
      desc: "Clé de la terreur (Comtesse, Blood Raven), de la haine (Invocateur, Bloodwitch) et de la destruction (Nihlathak, Izual), en Enfer : un portail vers l'Antre de la Matrone (Lilith), les Sables oubliés (Duriel ultime) ou la Fournaise de la douleur (Izual ultime), sans répéter une zone avant d'avoir vu les trois.",
    },
    pandemonium_finale: {
      desc: "Le Talisman du Pandémonium ouvre le portail vers Tristram : Méphisto, Diablo et Baal ultimes. Le dernier à tomber lâche la Torche du feu de l'enfer.",
      cost: [{ ids: ['pandemonium_talisman'], n: 1 }],
    },
  },
  add: [
    {
      entry: {
        id: 'rune_r14',
        name: '3 Dol → Hel',
        category: 'Runes',
        desc: '3 runes Dol et une clé donnent une rune Hel.',
        cost: [
          { ids: ['r14'], n: 3 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r15', qty: 1 },
      },
      after: 'rune_r13',
    },
    {
      entry: {
        id: 'rune_r15',
        name: '3 Hel → Io',
        category: 'Runes',
        desc: '3 runes Hel et une clé donnent une rune Io.',
        cost: [
          { ids: ['r15'], n: 3 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r16', qty: 1 },
      },
      after: 'rune_r14',
    },
    {
      entry: {
        id: 'rune_r16',
        name: '3 Io → Lum',
        category: 'Runes',
        desc: '3 runes Io et une clé donnent une rune Lum.',
        cost: [
          { ids: ['r16'], n: 3 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r17', qty: 1 },
      },
      after: 'rune_r15',
    },
    {
      entry: {
        id: 'rune_r17',
        name: '3 Lum → Ko',
        category: 'Runes',
        desc: '3 runes Lum et une clé donnent une rune Ko.',
        cost: [
          { ids: ['r17'], n: 3 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r18', qty: 1 },
      },
      after: 'rune_r16',
    },
    {
      entry: {
        id: 'rune_r18',
        name: '3 Ko → Fal',
        category: 'Runes',
        desc: '3 runes Ko et une clé donnent une rune Fal.',
        cost: [
          { ids: ['r18'], n: 3 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r19', qty: 1 },
      },
      after: 'rune_r17',
    },
    {
      entry: {
        id: 'rune_r19',
        name: '3 Fal → Lem',
        category: 'Runes',
        desc: '3 runes Fal et une clé donnent une rune Lem.',
        cost: [
          { ids: ['r19'], n: 3 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r20', qty: 1 },
      },
      after: 'rune_r18',
    },
    {
      entry: {
        id: 'rune_r20',
        name: '3 Lem → Pul',
        category: 'Runes',
        desc: '3 runes Lem et une clé donnent une rune Pul.',
        cost: [
          { ids: ['r20'], n: 3 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r21', qty: 1 },
      },
      after: 'rune_r19',
    },
    {
      entry: {
        id: 'rune_r21',
        name: '2 Pul → Um',
        category: 'Runes',
        desc: '2 runes Pul et une clé donnent une rune Um.',
        cost: [
          { ids: ['r21'], n: 2 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r22', qty: 1 },
      },
      after: 'rune_r20',
    },
    {
      entry: {
        id: 'rune_r22',
        name: '2 Um → Mal',
        category: 'Runes',
        desc: '2 runes Um et une clé donnent une rune Mal.',
        cost: [
          { ids: ['r22'], n: 2 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r23', qty: 1 },
      },
      after: 'rune_r21',
    },
    {
      entry: {
        id: 'rune_r23',
        name: '2 Mal → Ist',
        category: 'Runes',
        desc: '2 runes Mal et une clé donnent une rune Ist.',
        cost: [
          { ids: ['r23'], n: 2 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r24', qty: 1 },
      },
      after: 'rune_r22',
    },
    {
      entry: {
        id: 'rune_r24',
        name: '2 Ist → Gul',
        category: 'Runes',
        desc: '2 runes Ist et une clé donnent une rune Gul.',
        cost: [
          { ids: ['r24'], n: 2 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r25', qty: 1 },
      },
      after: 'rune_r23',
    },
    {
      entry: {
        id: 'rune_r25',
        name: '2 Gul → Vex',
        category: 'Runes',
        desc: '2 runes Gul et une clé donnent une rune Vex.',
        cost: [
          { ids: ['r25'], n: 2 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r26', qty: 1 },
      },
      after: 'rune_r24',
    },
    {
      entry: {
        id: 'rune_r26',
        name: '2 Vex → Ohm',
        category: 'Runes',
        desc: '2 runes Vex et une clé donnent une rune Ohm.',
        cost: [
          { ids: ['r26'], n: 2 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r27', qty: 1 },
      },
      after: 'rune_r25',
    },
    {
      entry: {
        id: 'rune_r27',
        name: '2 Ohm → Lo',
        category: 'Runes',
        desc: '2 runes Ohm et une clé donnent une rune Lo.',
        cost: [
          { ids: ['r27'], n: 2 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r28', qty: 1 },
      },
      after: 'rune_r26',
    },
    {
      entry: {
        id: 'rune_r28',
        name: '2 Lo → Sur',
        category: 'Runes',
        desc: '2 runes Lo et une clé donnent une rune Sur.',
        cost: [
          { ids: ['r28'], n: 2 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r29', qty: 1 },
      },
      after: 'rune_r27',
    },
    {
      entry: {
        id: 'rune_r29',
        name: '2 Sur → Ber',
        category: 'Runes',
        desc: '2 runes Sur et une clé donnent une rune Ber.',
        cost: [
          { ids: ['r29'], n: 2 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r30', qty: 1 },
      },
      after: 'rune_r28',
    },
    {
      entry: {
        id: 'rune_r30',
        name: '2 Ber → Jah',
        category: 'Runes',
        desc: '2 runes Ber et une clé donnent une rune Jah.',
        cost: [
          { ids: ['r30'], n: 2 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r31', qty: 1 },
      },
      after: 'rune_r29',
    },
    {
      entry: {
        id: 'rune_r31',
        name: '2 Jah → Cham',
        category: 'Runes',
        desc: '2 runes Jah et une clé donnent une rune Cham.',
        cost: [
          { ids: ['r31'], n: 2 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r32', qty: 1 },
      },
      after: 'rune_r30',
    },
    {
      entry: {
        id: 'rune_r32',
        name: '2 Cham → Zod',
        category: 'Runes',
        desc: '2 runes Cham et une clé donnent une rune Zod.',
        cost: [
          { ids: ['r32'], n: 2 },
          { ids: ['key'], n: 1 },
        ],
        effect: { kind: 'material', id: 'r33', qty: 1 },
      },
      after: 'rune_r31',
    },
    {
      entry: {
        id: 'craft_vampiric',
        name: 'Artisanat : Vampirique',
        category: 'Artisanat',
        desc: 'Objet magique ou rare + joyau + rune de l’emplacement + Crâne parfait : objet d’artisan (vol de mana, régénération, durée du poison réduite) + 1 à 4 propriétés aléatoires selon le niveau ; l’éthéré est conservé.',
        cost: [{ ids: ['gem_skull_4'], n: 1 }],
        items: { n: 1, accept: { qualities: ['magic', 'rare'], types: ['amulet', 'ring', 'belt', 'gloves', 'boots', 'helm', 'armor', 'shield', 'weapon', 'quiver'], notCorrupted: true } },
        effect: { kind: 'craft', family: 'vampiric' },
      },
      after: 'craft_safety',
    },
    {
      entry: {
        id: 'craft_bountiful',
        name: 'Artisanat : Abondance',
        category: 'Artisanat',
        desc: 'Objet magique ou rare + joyau + rune de l’emplacement + Topaze parfaite : objet d’artisan (découverte d’objets magiques, or, rayon de lumière) + 1 à 4 propriétés aléatoires selon le niveau ; l’éthéré est conservé.',
        cost: [{ ids: ['gem_topaz_4'], n: 1 }],
        items: { n: 1, accept: { qualities: ['magic', 'rare'], types: ['amulet', 'ring', 'belt', 'gloves', 'boots', 'helm', 'armor', 'shield', 'weapon', 'quiver'], notCorrupted: true } },
        effect: { kind: 'craft', family: 'bountiful' },
      },
      after: 'craft_vampiric',
    },
    {
      entry: {
        id: 'craft_brilliant',
        name: 'Artisanat : Éclat',
        category: 'Artisanat',
        desc: 'Objet magique ou rare + joyau + rune de l’emplacement + Diamant parfait : objet d’artisan (vitesse d’attaque, défense, résistances, gel réduit de moitié) + 1 à 4 propriétés aléatoires selon le niveau ; l’éthéré est conservé.',
        cost: [{ ids: ['gem_diamond_4'], n: 1 }],
        items: { n: 1, accept: { qualities: ['magic', 'rare'], types: ['amulet', 'ring', 'belt', 'gloves', 'boots', 'helm', 'armor', 'shield', 'weapon', 'quiver'], notCorrupted: true } },
        effect: { kind: 'craft', family: 'brilliant' },
      },
      after: 'craft_bountiful',
    },
    {
      entry: {
        id: 'up_unique_weapon_2',
        name: 'Arme unique/set → élite',
        category: 'Amélioration',
        desc: 'Arme unique/set → élite : même objet (propriétés conservées) sur la base du palier supérieur de la même famille.',
        cost: [
          { ids: ['r17'], n: 1 },
          { ids: ['r21'], n: 1 },
          { ids: ['gem_emerald_4'], n: 1 },
        ],
        items: { n: 1, accept: { qualities: ['unique', 'set'], types: ['weapon'], tiers: [1], notCorrupted: true } },
        effect: { kind: 'upgradeBase', to: 2 },
      },
      after: 'up_unique_armor_1',
    },
    {
      entry: {
        id: 'up_unique_armor_2',
        name: 'Armure unique/set → élite',
        category: 'Amélioration',
        desc: 'Armure unique/set → élite : même objet (propriétés conservées) sur la base du palier supérieur de la même famille.',
        cost: [
          { ids: ['r18'], n: 1 },
          { ids: ['r20'], n: 1 },
          { ids: ['gem_diamond_4'], n: 1 },
        ],
        items: { n: 1, accept: { qualities: ['unique', 'set'], types: ['armorAny'], tiers: [1], notCorrupted: true } },
        effect: { kind: 'upgradeBase', to: 2 },
      },
      after: 'up_unique_weapon_2',
    },
    {
      entry: {
        id: 'pandemonium_talisman',
        name: 'Talisman du Pandémonium',
        category: 'Pandémonium',
        desc: 'Cervelle de Méphisto (Izual ultime), corne de Diablo (Lilith) et œil de Baal (Duriel ultime) forment le Talisman du Pandémonium.',
        cost: [
          { ids: ['organ_brain'], n: 1 },
          { ids: ['organ_horn'], n: 1 },
          { ids: ['organ_eye'], n: 1 },
        ],
        effect: { kind: 'material', id: 'pandemonium_talisman', qty: 1 },
      },
      after: 'pandemonium_keys',
    },
    {
      entry: {
        id: 'repair_any',
        name: 'Réparer un objet (Zod)',
        category: 'Amélioration',
        desc: 'Zod + Crâne parfait + arme ou armure, éthérée comprise : durabilité au maximum.',
        cost: [
          { ids: ['r33'], n: 1 },
          { ids: ['gem_skull_4'], n: 1 },
        ],
        items: { n: 1, accept: { types: ['weapon', 'armorAny'], durable: true } },
        effect: { kind: 'repair' },
      },
      after: 'repair_armor',
    },
  ],
};
