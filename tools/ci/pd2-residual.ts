/**
 * Dépendances résiduelles de la base à Project Diablo 2 (plan des mods, lot M14) : ce qui, hors de `mods/pd2/`, dépend encore de PD2,
 * mesuré par recherche d'identifiants. Écrit docs/internal/MODS-RESIDUEL.md ; `--check` échoue si le fichier n'est plus à jour (CI) :
 * une nouvelle dépendance de la base au mod se voit dans la revue.
 *
 *   npm run mods:residual            réécrit docs/internal/MODS-RESIDUEL.md
 *   npm run mods:residual -- --check vérifie qu'il est à jour (code de sortie 1 sinon)
 *
 * Mesures (aucun numéro de ligne, pour rester stable) :
 * 1. identifiants des entrées que le mod enregistre et que la base n'a pas (registres de src/mods après activation de `pd2` ; hors tables de corruption, lues par
 *    type d'objet, affixes de carte, lus dans l'objet de carte et homonymes de mots courants (`fast`, `health`), et recettes sans « _ »,
 *    homonymes d'effets) écrits en littéral dans le code de la base (`src/`, hors commentaires) ;
 * 2. préfixes d'identifiants du mod construits dans la base (`sock_puzzle…`, gabarits `orb_${…}`), hors préfixes que la base emploie aussi ;
 * 3. fichiers de la base nommés `*pd2*` et identifiants de code `PD2_…` / `pd2…` ;
 * 4. mentions « PD2 » / « Project Diablo » (commentaires et textes) par dossier de `src/` ;
 * 5. tests de la base sautés sans le mod (`it.skipIf(withoutPd2)`, tests/needs-pd2.ts).
 */
import ts from 'typescript';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = join(ROOT, 'docs/internal/MODS-RESIDUEL.md');

/**
 * Identifiants des entrées enregistrées par le mod pd2 (vide sans le mod), hors entrées de la base que son patch retire puis remet à sa place
 * (affixes, mots runiques, recettes du Cube de D2 réordonnés : lot M10) : un identifiant présent dans les tables de la base n'est pas propre
 * au mod.
 */
async function modIds(): Promise<{ ids: string[]; baseIds: string[] }> {
  if (!existsSync(join(ROOT, 'mods/pd2/manifest.ts'))) return { ids: [], baseIds: [] };
  type Reg = { ids(): string[]; ownerOf(id: string): string | undefined };
  const { REGISTRIES } = await import('../../src/mods/registries');
  // tables de la base, avant l'activation (contenu des modules de src/data)
  const base = new Map(Object.entries(REGISTRIES as Record<string, Reg>).map(([name, r]) => [name, new Set(r.ids())]));
  const { activateForTools } = await import('../mods/node');
  await activateForTools('pd2');
  const out: string[] = [];
  for (const [name, r] of Object.entries(REGISTRIES) as [string, Reg][]) {
    if (name === 'corruption' || name === 'mapAffixes') continue;
    for (const id of r.ids()) if (r.ownerOf(id) === 'pd2' && !base.get(name)?.has(id) && (name !== 'cubeRecipes' || id.includes('_'))) out.push(id);
  }
  return { ids: [...new Set(out)], baseIds: [...new Set([...base.values()].flatMap((x) => [...x]))] };
}

const rel = (p: string) => relative(ROOT, p).split('\\').join('/');
function walk(dir: string, re: RegExp, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, re, out);
    else if (re.test(f)) out.push(p);
  }
  return out;
}

/** Littéraux de chaîne (têtes de gabarit, clés d'objet littéral comprises) d'un fichier, hors commentaires */
function literals(file: string): { text: string; template: boolean }[] {
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: { text: string; template: boolean }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push({ text: n.text, template: false });
    else if (ts.isTemplateExpression(n)) out.push({ text: n.head.text, template: true });
    else if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name)) out.push({ text: n.name.text, template: false });
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}

/** `baseIds` : identifiants des tables de la base (un préfixe que la base emploie aussi, comme `rune_`, n'est pas propre au mod) */
export function report(ids: string[], baseIds: readonly string[] = []): string {
  const idSet = new Set(ids);
  const srcFiles = walk(join(ROOT, 'src'), /\.ts$/);
  const exact = new Map<string, Set<string>>();
  const prefix = new Map<string, Set<string>>();
  for (const f of srcFiles) {
    for (const { text, template } of literals(f)) {
      if (idSet.has(text)) (exact.get(rel(f)) ?? exact.set(rel(f), new Set()).get(rel(f))!).add(text);
      else if (text.length >= 4 && /_$/.test(text) && ids.some((id) => id.startsWith(text)) && !baseIds.some((id) => id.startsWith(text)))
        (prefix.get(rel(f)) ?? prefix.set(rel(f), new Set()).get(rel(f))!).add(`${text}${template ? '${…}' : '…'}`);
      else if (!template && text === 'sock_puzzle') (prefix.get(rel(f)) ?? prefix.set(rel(f), new Set()).get(rel(f))!).add('sock_puzzle…');
    }
  }
  // outillage du test de suppression lui-même (ce script, tests/needs-pd2.ts) écarté
  const named = [...walk(join(ROOT, 'src'), /pd2/i), ...walk(join(ROOT, 'tools'), /pd2/i), ...walk(join(ROOT, 'tests'), /pd2/i), ...walk(join(ROOT, 'docs'), /pd2/i)]
    .map(rel)
    .filter((f) => f !== 'tools/ci/pd2-residual.ts' && f !== 'tests/needs-pd2.ts');
  const codeIds = new Map<string, number>();
  const mentions = new Map<string, number>();
  for (const f of srcFiles) {
    const s = readFileSync(f, 'utf8');
    const n = (s.match(/\b(PD2_[A-Z0-9_]+|pd2[A-Z]\w*)\b/g) ?? []).length;
    if (n) codeIds.set(rel(f), n);
    const dir = rel(f).split('/').slice(0, 2).join('/');
    mentions.set(dir, (mentions.get(dir) ?? 0) + (s.match(/PD2|Project Diablo/g) ?? []).length);
  }
  const skips: string[] = [];
  for (const f of walk(join(ROOT, 'tests'), /\.test\.ts$/)) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/it\.skipIf\(withoutPd2\)\((['"`])(.*?)\1/g)) skips.push(`\`${rel(f)}\` : ${m[2]}`);
    // tests générés par boucle, sautés pour une liste d'identifiants : `it.skipIf(withoutPd2 && LISTE.has(…))`, `const LISTE = new Set([…])`
    for (const m of src.matchAll(/withoutPd2 && (\w+)\.has\(/g)) {
      const ids = new RegExp(`const ${m[1]} = new Set\\(\\[([^\\]]*)\\]`).exec(src)?.[1].match(/[\w-]+/g) ?? [];
      for (const id of ids) skips.push(`\`${rel(f)}\` : ${id} (test généré)`);
    }
  }
  const fmt = (m: Map<string, Set<string>>) =>
    [...m]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(
        ([f, s]) =>
          `| \`${f}\` | ${s.size} | ${[...s]
            .sort()
            .map((x) => `\`${x}\``)
            .join(', ')} |`,
      )
      .join('\n');
  const totalExact = [...exact.values()].reduce((n, s) => n + s.size, 0);
  return `# Dépendances résiduelles de la base à Project Diablo 2

> Généré par \`npm run mods:residual\` (tools/ci/pd2-residual.ts) : ne pas modifier à la main. La CI (job \`suppression\`) vérifie qu'il est à
> jour. Plan : lots M0 à M14 (docs/JOURNAL.md, lots 198 et suivants) ; système de mods : src/mods/README.md.

Le **test de suppression** (\`node tools/ci/suppression.mjs\`, job CI \`suppression\`) prouve ce qui est déjà isolé : sans \`mods/\`, le projet
compile, passe le lint et les tests de la base, et le build public ne contient aucun texte propre au mod. Il ne prouve **pas** que la base
soit Diablo II vanilla : tout ce qui suit est encore PD2 dans la base, et un personnage joué sans le mod peut encore rencontrer du contenu
PD2 (règles et interface de la partie 6, cartes) ; un identifiant de la partie 1 est inconnu sans le mod, et le code qui le lit ne fait
rien. Le jeu \`d2\` est proposé à la création depuis le lot M12b (bots de la base de l'Acte I à Baal, aucune erreur des panneaux ni des menus
d'objets sans le mod : docs/JOURNAL.md, lot 245).

## 1. Identifiants du mod écrits dans le code de la base (${totalExact} identifiants, ${exact.size} fichiers)

Le contenu a été déplacé dans \`mods/pd2\` (lot M4), mais ces fichiers de \`src/\` le désignent encore par son identifiant. Sans le mod,
l'identifiant est inconnu : le code qui le lit ne fait rien. Restent, depuis le lot M10f (butin, Cube, catalogue de valeur, Pandémonium sortis
de la base : règles \`loot.value\`, \`cube.craft\`, patchs) et le lot M13 (bots : règle \`bots.profile\`), la simulation, les textes, sons et
effets des compétences propres à PD2 (l'interface de l'énigme de Larzuk est dans le mod depuis le lot M12b : point d'insertion
\`item.socketActions\`, règle \`cube.socketCap\`).
Un identifiant que la base a aussi (entrée de D2 que le patch du mod retire puis remet à sa place) n'est pas compté.

| Fichier | Nombre | Identifiants |
| --- | --- | --- |
${fmt(exact)}

## 2. Préfixes d'identifiants du mod construits dans la base

| Fichier | Nombre | Préfixes |
| --- | --- | --- |
${fmt(prefix)}

## 3. Fichiers et identifiants de code PD2 encore dans la base

Fichiers nommés \`*pd2*\` hors du mod (données PD2 fondues ou remplaçant le vanilla, lots M6, M10) :

${named.map((f) => `- \`${f}\``).join('\n')}

Identifiants de code \`PD2_…\` / \`pd2…\` (ex. \`PD2_AFFIXES\`, \`PD2_RUNEWORDS\`) par fichier de \`src/\` :

${[...codeIds]
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([f, n]) => `- \`${f}\` : ${n}`)
  .join('\n')}

## 4. Mentions « PD2 » / « Project Diablo » dans \`src/\` (commentaires et textes), par dossier

${[...mentions]
  .filter(([, n]) => n)
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([d, n]) => `- \`${d}\` : ${n}`)
  .join('\n')}

## 5. Tests de la base sautés sans le mod (${skips.length})

Tests dont le code testé est dans la base mais qui utilisent un objet, une recette ou une table du mod (\`it.skipIf(withoutPd2)\`,
tests/needs-pd2.ts) :

${skips.map((s) => `- ${s}`).join('\n')}

## 6. Non isolé par conception à ce stade (relevé du plan, non mesuré par ce script)

- **Tables vanilla de la base** (lots M6a à M6d, M10) : bases d'objets, runes, gemmes, uniques, sets, affixes, mots runiques, recettes du Cube, niveaux de zone (\`levels-a*.ts\`, et
  niveaux des runs et des étapes construites à part : blocs générés de \`runs.ts\` et \`zones/act1.ts\`), classes de trésor (bloc généré
  de \`treasure.ts\`) et fidélité des monstres (\`monsters-fidelity.ts\`, \`monsters-d2.ts\`) régénérés depuis les MPQ
  (\`tools/vanilla/gen.ts\`, \`npm run vanilla\`), valeurs PD2 en patch généré par diff (\`mods/pd2/data/**.patch.ts\`,
  \`mods/pd2/tools/vanilla-diff.ts\`). Restent propres au jeu dans ces tables (ni D2 ni contrôlées) : noms affichés, icônes, prix,
  poids, \`+mana\` implicite des orbes, niveau de qualité des gemmes ; propriétés D2 que la simulation n'applique pas (charges,
  aveuglement, endurance…) absentes. Compétences des objets : celles de Diablo II depuis le lot M9a (Empaler, Explosion de poison,
  maîtrises d'armes du Barbare… : identifiants de skills-d2.ts).
  Butin : le modèle du moteur (structure de l'Enfer de l'Acte V pour toutes les zones, \`GOOD_GEMS\` et \`ZONE_RUNE_TC\` par zone et non
  par acte, TC d'unique pour les super-uniques ordinaires, ni TC de quête ni objet unique nommé ; or plus généreux en début de
  partie) ; clés \`map\` et \`pandemonium\` de \`ZONE_RUNE_TC\`. Pandémonium (lot M10e) : celui de D2 1.11 dans la base (clés et organes
  des TC, Finale par les organes, Torche du dernier mal primordial : \`src/sim/loot/uber-drops.ts\`, Annihilus du Clone : TC « ROP »,
  unique nommé \`unique:…\`) ; l'Étendard des Héros (absent du jeu de base) et l'accès au Clone de Diablo en solo (D2 : vente de
  Pierres de Jordan sur Battle.net seulement ; la run \`uber_dclone\` n'est ouverte que par le mod) manquent. Monstres : écrits à la main dans \`monsters.ts\` (kits d'attaques, échelles de
  vie et de dégâts, niveaux des boss \`bossLevel\`) ;
  monstres propres à PD2 dans la base : Déchu au trésor (événement de carte), ubers PD2 (Anciens ultimes, Rathma, Mendeln, Lucion) et
  leurs zones (\`zones/farm.ts\`), copies des boss de la base faites au chargement (les boss PD2 ne sont pas touchés).
- **Affixes** (lot M10a) : table de la base = MagicPrefix.txt / MagicSuffix.txt 1.13c (\`affixes-d2.ts\`, types d'ItemTypes.txt
  \`itemtypes-d2.ts\`), table PD2 en patch (\`mods/pd2/data/items/affixes.patch.ts\`). Restent dans la base : les noms de types du wiki
  PD2 (\`AFFIX_TYPES\`, lus par le patch et par les noms des rares), les anciens affixes du jeu (\`LEGACY_AFFIXES\`, sauvegardes), et les
  règles PD2 de génération (deux affixes garantis au-delà d'un ilvl, « staffmods » PD2, charmes majeurs « skillers » : \`itemgen.ts\`) ;
  propriétés D2 non appliquées (charges, endurance, réparation : 130 lignes tirables écartées), affixes propres à une classe
  (\`classspecific\`) et AutoMagic.txt (non utilisé par le moteur) absents.
- **Mots runiques** (lot M10b) : table de la base = Runes.txt 1.13c (\`runewords-d2.ts\`, lignes \`complete\`, types d'ItemTypes.txt),
  table PD2 en patch (\`mods/pd2/data/items/runewords.patch.ts\` ; variantes PD2 par type, comme Esprit sur bouclier, en entrées à part).
  Propriétés D2 non appliquées absentes (charges, absorption magique, compétences D2 retirées par PD2…).
- **Cube** (lot M10c) : recettes de la base = CubeMain.txt 1.13c d'une partie solo (sans les recettes ladder : runes au-delà de Dol,
  uniques vers élite) ; amélioration des runes et artisanat générés (\`cube-d2.ts\`, règle \`cube.craft\` : \`src/mods/d2/cube.ts\`), autres
  recettes écrites dans \`cube.ts\` et contrôlées contre la table (\`vanilla-cube.test.ts\`) ; valeurs PD2 en patch
  (\`mods/pd2/data/cube.patch.ts\` : runes « avec une clé », familles vampirique, abondance et éclat, Talisman, Zod) et artisanat PD2 en
  règle (\`mods/pd2/rules/cube.ts\`). Non reprises (objets ou résultats absents du moteur) : potions, flèches, haches de jet et javelots,
  qualité inférieure, objets magiques à affixe imposé, recettes de la Pierre de Jordan, recharge, niveau requis ajouté par
  l'amélioration ; le parchemin de portail de la recette qui vide les châsses. Restent du moteur, communs aux deux jeux de règles :
  le livre de recettes (choix de la recette, puis de l'objet), le portail du Pandémonium sans répétition, l'éthéré conservé à l'artisanat.
- **Tables PD2 sans équivalent vanilla** : aucune depuis le lot M10d (mercenaires : Hireling.txt dans la base, \`src/data/mercs-d2.ts\` et modèle \`merc.model\` ; tableaux, paliers et sous-types PD2 dans le mod, \`mods/pd2/data/mercs.gen.ts\`, \`mercs.patch.ts\`).
- **Compétences** : arbres de la base = les 210 compétences de Diablo II LoD 1.13c (lot M9a : Skills.txt et SkillDesc.txt,
  \`skills-d2.ts\` : place dans l'arbre, niveau requis, prérequis, synergies que la simulation applique), arbres PD2 S13 en patch
  (\`mods/pd2/data/skills.patch.ts\` : 21 compétences PD2 ajoutées, 12 de D2 retirées, déplacements, prérequis, textes et chiffres des
  fichiers de classe d'avant le lot), renommages des anciennes sauvegardes et import .d2s en règles (\`skills.renames\`,
  \`skills.d2sImport\`) ; les chiffres, synergies et tables par points durs PD2 sont dans le mod (lot M7 : \`api.skills.patchNumbers\`,
  \`patchSynergies\`, règle \`skills.hardValue\`). Restent dans la base : la simulation des 21 compétences propres à PD2 (partie 1
  ci-dessus : fichiers de classe de \`src/sim\`, textes, sons, effets), les chiffres « D2 » des fichiers de classe des classes pas
  encore faites (aucune depuis le lot M9h : les sept classes, lots M9b à M9h : chiffres de Skills.txt et Missiles.txt dans
  \`skills-d2.ts\`, comportements PD2 de leurs compétences dans les règles \`skills.sorceress\`, \`skills.amazon\`,
  \`skills.barbarian\`, \`skills.masteryOf\`, \`skills.paladin\`, \`skills.necromancer\`, \`skills.druid\`, \`skills.assassin\` du mod ;
  chiffres des effets des charges 2 et 3 des attaques à charges de l'Assassin : fichier de classe, Arreat Summit), rayons d'explosion PD2 dans \`missiles.explode\` ; statistiques des créatures invoquées, constantes de
  cadence et de rayon du moteur : modèle du moteur), les noms de tables par points durs lus par la simulation (\`skillHard\`, tables du wiki PD2), les règles de
  classe de D2 et de PD2 des caractéristiques dérivées étant des règles depuis le lot M8d (Chaleur, Maîtrises, armures de la Sorcière,
  Bouclier d'énergie, cadence des auras, Prière, Sanctuaire, Épines, esquive : \`skills.sorceress\`, \`skills.paladin\`,
  \`skills.amazon\`) ; les
  12 compétences de D2 recréées sont simulées, sauf l'Endurance accrue (le moteur n'a pas d'endurance). Sans
  le mod, une compétence qui lit une table par points durs reçoit 0 (valeur de repli de la simulation quand elle en a une).
- **Règles en dur** : formules de combat dans le mod depuis le lot M8a (règles \`combat.monsterRes\`, \`combat.leech\`,
  \`combat.crushingBlow\`, \`combat.criticalMul\`, \`combat.weaponSplash\`, \`combat.openWounds\`, \`combat.bleedTick\`, \`combat.chillFreeze\`,
  \`combat.absorbPctMax\` : \`mods/pd2/rules/combat.ts\` ; \`combat.playerHitRecovery\`, depuis le lot M13 : récupération après coup du joueur
  au seuil de D2, 1/12 de la vie, dans la base et, depuis le lot 321, dans le jeu pd2 aussi : le « tout coup qui touche » du pd2 est retiré), règles des mercenaires depuis le lot M8b (\`merc.itemWear\`,
  \`merc.bossDamagePct\`, et le modèle \`merc.model\` depuis le lot M10d : \`mods/pd2/rules/mercs.ts\`) et des caractéristiques depuis le lot M8c (\`char.maxResCap\`,
  \`char.toHitFactor\`, \`char.blockFactor\` : \`mods/pd2/rules/character.ts\` ; caractéristiques des classes de CharStats.txt, mana par
  niveau et endurance PD2 en patch : \`mods/pd2/data/classes.patch.ts\`) et de l'expérience selon l'écart de niveau depuis le lot M8f
  (\`xp.levelFactor\` : \`mods/pd2/rules/progression.ts\`), taux de butin et d'expérience depuis le lot M8e (règle \`loot.rates\` :
  conforts de D2 Mobile et taux PD2 dans \`mods/pd2/data/rates.ts\`, base sans multiplicateur ; les paliers de butin du joueur restent
  calibrés sur le jeu pd2) ; base : Diablo II LoD 1.13c, \`src/mods/d2/\` ; restent dans la base les règles
  PD2 des compétences (Sanctuaire contre les morts-vivants, Prière, Drain de vie, esquive, Bouclier d'énergie : fichiers de classe et
  \`derive-calc\`), des tableaux de statistiques et compétences des sous-types PD2 de mercenaires (données, M10 ; bonus de set du
  mercenaire et objets de l'ancien mercenaire rendus au joueur : règle de D2 non vérifiée, gardés) ;
  approximations du moteur communes aux deux jeux de règles (récupération après coup des monstres, incantation jamais interrompue par un
  coup, blocage en mouvement, auras des monstres).
- **Cartes et endgame** : zones, affixes, génération, ouverture, butin, recettes, modificateurs de monde et boss de carte sont dans le mod
  (lots M5a à M5c : règles nommées \`maps.*\`, \`world.*\`, \`combat.*\`, \`ai.mapBoss\`, \`runs.mapBossDeath\`). Restent dans la base : le
  cadre des runs de carte (\`Game.startMap\`, \`RunState.mapTier\`, \`Monster.mapBoss\` et son état \`sim/map-boss-state.ts\`, plafond
  des résistances naturelles en carte de \`spawn.ts\`, butin du boss de carte \`MAP_BOSS_LOOT\` de \`drops.ts\`), le coffre de cartes
  (\`mapstash*\`, rangement et ramassage) et l'interface des cartes (onglet du coffre de cartes, menu et fusion, infobulle : elles lisent
  les registres et les règles \`maps.*\`, opérations comprises depuis le lot M5c) ; zones corrompues (\`Game.startRun\`), ubers PD2
  (monstres et zones ; leur butin et les exclusivités DClone/Rathma sont dans le mod depuis le lot M6d : \`mods/pd2/sim/pandemonium.ts\`).
- **Bots** (lot M13) : plans de compétences, listes de compétences du cerveau, mercenaire voulu, préparation de ville (boîtes à énigme,
  cartes d'endgame), charmes de l'arène et seuils des tests de bots par jeu de règles (règle \`bots.profile\` : base \`src/mods/d2/bots.ts\`, mod
  \`mods/pd2/bots/\`). Restent dans le cerveau de la base, communs aux deux jeux de règles : l'esquive des marqueurs au sol des boss de carte
  (inerte hors carte), le rangement des cartes au coffre (type d'objet \`map\`). Écart mesuré des bots de la base avec D2 (lot M13, docs/JOURNAL.md) :
  la campagne est jouable (Druide feu : Baal du Normal en 4 h 20 à 4 h 48 de jeu, celui du Cauchemar à 7 h 41, l'Enfer ensuite), mais
  les classes de mêlée et d'arc et la Sorcière meurent presque à chaque run en début de partie : Tristram (zone au niveau du personnage)
  et la Comtesse sont les seules runs ouvertes aux bots avant le niveau 14 (zones de campagne non proposées), l'économie de D2 est
  sans multiplicateur et les courbes de vie et de dégâts des monstres du moteur sont calibrées sur le jeu pd2.
- **Réglages et interface** : les réglages du mod pd2 sont sous \`Settings.mods.pd2\` (lot M11c, \`api.settings.declare\`) ; leurs options
  restent décrites dans le catalogue de la base (\`settings-catalog.ts\`, \`mod: true\` : affichées seulement avec le mod) : les points
  d'insertion d'interface des mods (lot M12, \`src/mods/ui.ts\`, docs/MODS.md : menu, création, fiche, level-up, HUD, point de passage,
  artisanat) n'ont pas encore de point pour les réglages, ni pour les infobulles, les onglets du coffre (coffre de cartes) et le menu des
  cartes, qui restent dans la base.
`;
}

const found = await modIds();
const text = report(found.ids, found.baseIds);
if (process.argv.includes('--check')) {
  const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (cur !== text) {
    console.error('docs/internal/MODS-RESIDUEL.md n’est plus à jour : lancez npm run mods:residual');
    process.exit(1);
  }
  console.log('docs/internal/MODS-RESIDUEL.md à jour');
} else {
  writeFileSync(OUT, text);
  console.log(`docs/internal/MODS-RESIDUEL.md écrit`);
}
