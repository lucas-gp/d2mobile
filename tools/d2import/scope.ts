/**
 * Périmètre du premier lot (déclaratif : étendre = ajouter des entrées ici, sans toucher au reste).
 */

export interface AnimSpec {
  /** nom de l'animation dans les sorties */
  name: string;
  /** code de mode D2 (plrmode.txt / monmode.txt) */
  mode: string;
  loop: boolean;
}

export interface CharSpec {
  id: string;
  /** dossier de classe dans data\global\chars */
  code: string;
  /** nom de l'équipement porté (dossier de sortie) */
  variant: string;
  /** classe d'arme du COF (1hs = une main, frappe) */
  weaponClass: string;
  /** code d'équipement par calque ; absent ou null = calque non dessiné (ex. pas de bouclier) */
  gear: Record<string, string | null>;
  act: number;
  anims: AnimSpec[];
}

export interface MonsterSpec {
  /** colonne Class de monstats.txt */
  cls: string;
  act: number;
  anims: AnimSpec[];
  /** forçage optionnel du code d'équipement par calque */
  gear?: Record<string, string>;
}

const LOOPING = (name: string, mode: string): AnimSpec => ({ name, mode, loop: true });
const ONCE = (name: string, mode: string): AnimSpec => ({ name, mode, loop: false });

export const CHARS: CharSpec[] = [
  {
    id: 'paladin',
    code: 'pa',
    variant: 'light-1hs',
    weaponClass: '1hs',
    // armure légère (lit) partout, épée courte en main droite, ni bouclier ni main gauche
    gear: { hd: 'lit', tr: 'lit', lg: 'lit', ra: 'lit', la: 'lit', rh: 'ssd', lh: null, sh: null, s1: 'lit', s2: 'lit' },
    act: 1,
    anims: [
      LOOPING('idle', 'nu'),
      LOOPING('walk', 'wl'),
      LOOPING('run', 'rn'),
      ONCE('attack', 'a1'),
      ONCE('cast', 'sc'),
      ONCE('hit', 'gh'),
      ONCE('death', 'dt'),
      LOOPING('town-idle', 'tn'),
      LOOPING('town-walk', 'tw'),
    ],
  },
];

const MONSTER_ANIMS: AnimSpec[] = [LOOPING('idle', 'nu'), LOOPING('walk', 'wl'), ONCE('attack', 'a1'), ONCE('hit', 'gh'), ONCE('death', 'dt')];

export const MONSTERS: MonsterSpec[] = [
  { cls: 'Fallen', act: 1, anims: MONSTER_ANIMS },
  { cls: 'Zombie', act: 1, anims: MONSTER_ANIMS },
  { cls: 'QuillRat', act: 1, anims: MONSTER_ANIMS },
];

/** Niveau dont on exporte les tuiles (nom affiché dans levels.txt via string.tbl) */
export const LEVELS: { name: string; slug: string }[] = [{ name: 'Blood Moor', slug: 'blood-moor' }];

/** Icônes d'objets (colonne « code » de weapons/armor/misc.txt) : variété d'armes, armures, bijoux, runes, potions */
export const ICONS: string[] = [
  'ssd', // Short Sword (arme)
  'lsd', // Long Sword
  'ful', // Full Plate Mail (armure)
  'lea', // Leather Armor
  'buc', // Buckler (bouclier)
  'skp', // Skull Cap (casque)
  'rin', // Ring
  'amu', // Amulet
  'r01', // El Rune
  'r33', // Zod Rune
  'hp3', // Healing Potion
  'mp3', // Mana Potion
];
