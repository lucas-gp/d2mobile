/** Catalogue des réglages : catégories, options, recherche et valeurs par défaut (logique pure, sans DOM). */
import { SYNC_ENABLED } from '../platform/build-flags';
import { APP_SETTINGS_DEFAULTS, DEFAULT_SETTINGS, type Settings } from '../sim/save';
import { modSetting, modSettingDefaults, modSettingOwner, setModSetting } from '../mods/settings';

/** Champ de réglage : de `Settings`, ou réglage déclaré par un mod (rangé sous `Settings.mods.<mod>`, src/mods/settings.ts) */
export type SettingsField = keyof Settings | (string & {});

/** Valeur d'un champ de réglage (réglage de mod : sous `mods.<mod>`) */
export function fieldValue(st: Settings, k: SettingsField): unknown {
  return modSettingOwner(k) ? modSetting(st, k) : (st as unknown as Record<string, unknown>)[k];
}
/** Écrit un champ de réglage (réglage de mod : sous `mods.<mod>`) */
export function setFieldValue(st: Settings, k: SettingsField, v: unknown): void {
  if (modSettingOwner(k)) setModSetting(st, k, v as string | number | boolean);
  else (st as unknown as Record<string, unknown>)[k] = v;
}

export type SettingsCat = 'game' | 'display' | 'controls' | 'sound' | 'pickup' | 'confirm' | 'account' | 'advanced';

export interface SettingsCatInfo {
  id: SettingsCat;
  name: string;
  /** Pastille de la recherche (plus courte) */
  short: string;
}

/** Catégories dans l'ordre d'affichage */
export const SETTINGS_CATS: SettingsCatInfo[] = [
  { id: 'game', name: 'Jeu', short: 'Jeu' },
  { id: 'display', name: 'Affichage', short: 'Affichage' },
  { id: 'controls', name: 'Contrôles', short: 'Contrôles' },
  { id: 'sound', name: 'Son', short: 'Son' },
  { id: 'pickup', name: 'Ramassage automatique', short: 'Ramassage' },
  { id: 'confirm', name: 'Confirmations', short: 'Confirmations' },
  { id: 'account', name: 'Compte et sauvegardes', short: 'Compte' },
  { id: 'advanced', name: 'Avancé / Aide', short: 'Avancé' },
];

export interface SettingsEntry {
  /** Identifiant stable (relie l'entrée à son constructeur d'interface) */
  id: string;
  cat: SettingsCat;
  label: string;
  /** Aide d'une ligne sous l'option */
  help?: string;
  /** Sous-titre de regroupement dans la catégorie */
  group?: string;
  /** Champs pilotés par l'option (remis à zéro par « Rétablir ») */
  fields?: SettingsField[];
  /** Option d'un réglage de mod : affichée seulement si le mod qui le déclare est actif */
  mod?: boolean;
  /** Mots-clés de recherche (valeurs proposées, synonymes) */
  kw?: string;
}

const GROUP_IMAGE = 'Qualité d’image';
const GROUP_BUTTONS = 'Boutons à l’écran';
export const GROUP_HELP: Record<string, string> = {
  [GROUP_IMAGE]: 'Netteté, mise à l’échelle, lissage et ambiance de couleur (peut réduire la fluidité sur téléphone).',
};

/** Toutes les options, dans l'ordre d'affichage de chaque catégorie */
const ALL_SETTINGS_ENTRIES: SettingsEntry[] = [
  // Jeu
  { id: 'lang', cat: 'game', label: 'Language / Langue', kw: 'langue anglais français english french' },
  { id: 'lootRate', cat: 'game', label: 'Taux de butin', help: 'Quantité d’objets laissés par les monstres.', fields: ['lootRate'], kw: 'normal rapide très rapide abondant drop' },
  { id: 'lootFilter', cat: 'game', label: 'Filtre de butin', help: 'Choisit les objets affichés au sol.', kw: 'préréglage masquer objets sol' },
  { id: 'durability', cat: 'game', label: 'Durabilité des armes et armures', help: 'Les objets s’usent et se réparent chez le forgeron.', fields: ['durability'], kw: 'usure réparer' },
  { id: 'freeRespec', cat: 'game', label: 'Réinitialisation gratuite des points', help: 'Caractéristiques et compétences, sans limite ni coût.', fields: ['freeRespec'], kw: 'respec gratuit' },
  { id: 'potionUpgrade', cat: 'game', label: 'Potions qui montent en gamme', help: 'Soin, mana et rajeunissement suivent votre niveau.', fields: ['potionUpgrade'] },
  { id: 'instantCast', cat: 'game', label: 'Lancement instantané des sorts', help: 'Le sort part dès l’appui.', fields: ['instantCast'] },
  { id: 'tips', cat: 'game', label: 'Conseils de jeu', help: 'Petites bulles d’aide au bon moment.', fields: ['tips'], kw: 'astuces tutoriel' },
  { id: 'tipsReset', cat: 'game', label: 'Revoir les conseils', kw: 'astuces tutoriel' },
  { id: 'switchChar', cat: 'game', label: 'Changer de personnage', kw: 'personnage sélection' },
  // Affichage
  { id: 'quality', cat: 'display', label: 'Qualité graphique', help: 'Auto s’adapte à l’appareil.', fields: ['quality'], kw: 'auto basse moyenne haute performance' },
  { id: 'bigCells', cat: 'display', label: 'Grandes cases (inventaire, coffre)', help: 'Cases plus grandes au toucher ; Auto = écran tactile.', fields: ['bigCells'] },
  {
    id: 'bigInventory',
    cat: 'display',
    label: 'Grand inventaire',
    help: 'Sac de 10 × 8 cases au lieu de 10 × 4. Pour revenir à 4 rangées, libère celles du bas.',
    fields: ['bigInventory'],
    kw: 'sac cases rangées taille double',
  },
  { id: 'zoom', cat: 'display', label: 'Zoom', help: '80 % = vue élargie, 100 % = vue d’origine (défaut).', fields: ['zoom'], kw: 'caméra vue' },
  { id: 'lighting', cat: 'display', label: 'Luminosité', help: 'Obscurité hors du rayon de lumière.', fields: ['lighting'], kw: 'éclairage claire pénombre diablo 2 sombre' },
  {
    id: 'renderEngine',
    cat: 'display',
    label: 'Moteur de rendu',
    help: 'WebGPU est expérimental et s’applique au prochain lancement ; retour automatique sur WebGL s’il est indisponible.',
    fields: ['renderEngine'],
    kw: 'webgl webgpu gpu graphique moteur',
  },
  {
    id: 'dynamicLight',
    cat: 'display',
    label: 'Éclairage dynamique',
    help: 'Lueurs des sorts, du feu et des alliés, zones lointaines plus sombres. Se réduit tout seul si le jeu rame.',
    fields: ['dynamicLight'],
    kw: 'lumière lueur ombre torche sorts glow performance',
  },
  { id: 'damageNumbers', cat: 'display', label: 'Chiffres de dégâts', fields: ['damageNumbers'] },
  { id: 'screenShake', cat: 'display', label: 'Secousses d’écran', fields: ['screenShake'], kw: 'tremblement légères normales' },
  { id: 'imageSharpen', cat: 'display', group: GROUP_IMAGE, label: 'Netteté', fields: ['imageSharpen'], kw: 'image aucune légère moyenne forte filtre' },
  { id: 'imageScale', cat: 'display', group: GROUP_IMAGE, label: 'Mise à l’échelle', fields: ['imageScale'], kw: 'image normale douce pixel pixel-art' },
  { id: 'imageSmooth', cat: 'display', group: GROUP_IMAGE, label: 'Lissage des bords', fields: ['imageSmooth'], kw: 'image anticrénelage antialiasing' },
  { id: 'imageMood', cat: 'display', group: GROUP_IMAGE, label: 'Ambiance', fields: ['imageMood'], kw: 'image couleur normale sombre chaude froide vive' },
  {
    id: 'imageCompare',
    cat: 'display',
    group: GROUP_IMAGE,
    label: 'Comparer avec le rendu d’origine',
    help: 'Maintenez le bouton pour voir l’image sans filtre.',
    kw: 'maintenir pour comparer image',
  },
  { id: 'showCollisions', cat: 'display', label: 'Afficher les collisions', help: 'Diagnostic : montre les cases bloquées (murs invisibles).', fields: ['showCollisions'], kw: 'murs diagnostic' },
  { id: 'showPerf', cat: 'display', label: 'Affichage des performances', help: 'Images par seconde et mémoire.', fields: ['showPerf'], kw: 'fps diagnostic' },
  // Contrôles
  { id: 'controls', cat: 'controls', label: 'Commandes', help: 'Auto : selon l’appareil et la dernière entrée utilisée.', fields: ['controls'], kw: 'tactile souris clavier pc mode' },
  { id: 'shortcuts', cat: 'controls', label: 'Raccourcis clavier', kw: 'touches aide' },
  { id: 'leftHanded', cat: 'controls', label: 'Gaucher (commandes inversées)', fields: ['leftHanded'] },
  { id: 'haptics', cat: 'controls', label: 'Vibrations', fields: ['haptics'], kw: 'haptique normales fortes' },
  { id: 'walkButton', cat: 'controls', group: GROUP_BUTTONS, label: 'Bouton Marche / Course (touche R)', help: 'Le raccourci clavier R reste actif.', fields: ['walkButton'], kw: 'allure' },
  {
    id: 'imageButton',
    cat: 'controls',
    group: GROUP_BUTTONS,
    label: 'Bouton Image (touche V)',
    help: 'Qualité d’image en un tap, sous le bouton Réglages.',
    fields: ['imageButton'],
    kw: 'qualité d’image',
  },
  // Son
  { id: 'sound', cat: 'sound', label: 'Effets sonores', help: 'Volume (défaut 80 %).', fields: ['sound'], kw: 'volume bruitages' },
  { id: 'music', cat: 'sound', label: 'Musique d’ambiance', help: 'Volume (défaut 50 %).', fields: ['music'], kw: 'volume' },
  // Ramassage automatique
  { id: 'autoPickupRunes', cat: 'pickup', label: 'Runes', fields: ['autoPickupRunes'], kw: 'ramassage auto pul vex' },
  { id: 'autoPickupGems', cat: 'pickup', label: 'Gemmes', fields: ['autoPickupGems'], kw: 'ramassage auto sans défaut' },
  { id: 'autoPickupPotions', cat: 'pickup', label: 'Potions', help: 'Tant que la ceinture a de la place pour leur type.', fields: ['autoPickupPotions'], kw: 'ramassage auto' },
  { id: 'autoPickupMaterials', cat: 'pickup', label: 'Composants', help: 'Éclats, orbes, clés, essences…', fields: ['autoPickupMaterials'], kw: 'ramassage auto matériaux' },
  { id: 'autoPickupMaps', cat: 'pickup', label: 'Cartes', help: 'Vers le coffre de cartes.', fields: ['autoPickupMaps'], mod: true, kw: 'ramassage auto rares magiques' },
  { id: 'beltRefill', cat: 'pickup', label: 'Remplissage de la ceinture', help: 'Reprend les potions du sac quand la ceinture se vide.', fields: ['beltRefill'], kw: 'ramassage auto' },
  // Confirmations
  { id: 'confirmCorrupt', cat: 'confirm', label: 'Corrompre un objet', help: 'Demander confirmation avant de corrompre.', fields: ['confirmCorrupt'], mod: true, kw: 'confirmer corruption' },
  {
    id: 'confirmMapUpgrade',
    cat: 'confirm',
    label: 'Améliorer une carte',
    help: 'Demander confirmation (relance, retrait des affixes, fusion…).',
    fields: ['confirmMapUpgrade'],
    mod: true,
    kw: 'confirmer fusion scarabée',
  },
  // Compte et sauvegardes
  { id: 'sync', cat: 'account', label: 'Synchronisation', help: 'Compte en ligne pour retrouver vos personnages sur tous vos appareils.', kw: 'compte connexion cloud en ligne mot de passe' },
  { id: 'exportSave', cat: 'account', label: 'Exporter la sauvegarde', kw: 'fichier dossier sauvegardes' },
  { id: 'importSave', cat: 'account', label: 'Importer une sauvegarde', kw: 'fichier dossier sauvegardes d2 d2s' },
  { id: 'packs', cat: 'account', label: 'Contenu à télécharger', kw: 'packs art sprites diablo ii hors ligne données' },
  { id: 'd2Reset', cat: 'account', label: 'Ressaisir le mot de passe des sprites D2', kw: 'packs art sprites' },
  { id: 'resetSave', cat: 'account', label: 'Supprimer le personnage', help: 'Appui prolongé pour confirmer.', kw: 'effacer' },
  // Avancé / Aide
  { id: 'install', cat: 'advanced', label: 'Install the app', kw: 'install pwa application écran d’accueil home screen' },
  { id: 'update', cat: 'advanced', label: 'Mise à jour de l’application', kw: 'version installer' },
  { id: 'd2local', cat: 'advanced', label: 'Graphismes & fichiers Diablo II', kw: 'mpq fichiers générer locaux sprites diablo ii hors ligne stockage copie' },
  { id: 'errLog', cat: 'advanced', label: 'Journal d’erreurs', kw: 'diagnostic exporter bug' },
  {
    id: 'stats',
    cat: 'advanced',
    label: 'Statistiques anonymes d’utilisation',
    help: 'Compte les joueurs : un identifiant aléatoire, la version du jeu et « en jeu / au menu » sont envoyés chaque minute. Ni nom, ni sauvegarde, ni adresse. Désactivé : rien n’est envoyé et l’identifiant est supprimé.',
    kw: 'confidentialité vie privée données anonyme compteur analytics télémétrie privacy',
  },
  { id: 'changelog', cat: 'advanced', label: 'Nouveautés', kw: 'changelog version' },
  { id: 'credits', cat: 'advanced', label: 'Crédits', kw: 'à propos' },
];
/** Without the account (public build, or `SIGN_IN_OFFERED` false, build-flags.ts): no synchronisation section */
export const SETTINGS_ENTRIES: SettingsEntry[] = SYNC_ENABLED ? ALL_SETTINGS_ENTRIES : ALL_SETTINGS_ENTRIES.filter((e) => e.id !== 'sync');
/** Option affichée : réglage de la base, ou réglage d'un mod actif */
const shown = (e: SettingsEntry): boolean => !e.mod || (e.fields ?? []).every((k) => modSettingOwner(k) !== undefined);

/** Minuscules, sans accents ni apostrophes typographiques (recherche tolérante) */
export function normText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`]/g, "'").toLowerCase();
}

export function catInfo(id: SettingsCat): SettingsCatInfo {
  return SETTINGS_CATS.find((c) => c.id === id)!;
}

export function entriesOf(cat: SettingsCat): SettingsEntry[] {
  return SETTINGS_ENTRIES.filter((e) => e.cat === cat && shown(e));
}

/**
 * Options correspondant à la recherche : tous les mots doivent figurer (ET) dans le libellé, l'aide, les mots-clés ou le nom de
 * la catégorie ; `tr` ajoute la traduction pour retrouver une option en anglais.
 */
export function searchSettings(query: string, tr: (s: string) => string = (s) => s, entries: SettingsEntry[] = SETTINGS_ENTRIES): SettingsEntry[] {
  const words = normText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return entries.filter((e) => {
    if (!shown(e)) return false;
    const c = catInfo(e.cat);
    const hay = normText([e.label, tr(e.label), e.help ?? '', e.help ? tr(e.help) : '', e.kw ?? '', e.group ?? '', c.name, tr(c.name)].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/** Valeur par défaut de chaque champ proposé dans les réglages (défauts de l'application) */
export function settingDefaults(): Partial<Settings> {
  return {
    ...DEFAULT_SETTINGS,
    ...APP_SETTINGS_DEFAULTS,
    // réglages des mods actifs (sous mods.<mod> dans les réglages, à plat ici)
    ...(modSettingDefaults() as Partial<Settings>),
    imageSharpen: 0,
    imageSmooth: false,
    imageMood: 'normal',
    imageScale: 'normal',
    imageButton: false,
    walkButton: false,
    renderEngine: 'webgl',
  };
}

/** Champs de réglage d'une catégorie */
export function catFields(cat: SettingsCat): SettingsField[] {
  return entriesOf(cat).flatMap((e) => e.fields ?? []);
}

/** Rétablit les valeurs par défaut des seuls champs de la catégorie ; renvoie les champs modifiés. Ne touche ni aux sauvegardes ni aux comptes. */
export function resetCategory(st: Settings, cat: SettingsCat): SettingsField[] {
  const def = settingDefaults() as Record<string, unknown>;
  const changed: SettingsField[] = [];
  for (const k of catFields(cat)) {
    const v = def[k];
    if (v === undefined) continue;
    if (fieldValue(st, k) !== v) {
      setFieldValue(st, k, v);
      changed.push(k);
    }
  }
  return changed;
}
