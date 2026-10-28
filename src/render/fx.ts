/**
 * Effets de sorts de Diablo II (missiles et overlays DCC exportés par tools/d2import : planches `fx_<nom>`) : projectiles animés, explosions,
 * anneaux de nova, feux au sol, éclairs de lanceur. Sans planche importée, rien n'est dessiné ici et le rendu garde ses particules d'origine.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import type { Sheet, SpriteBank } from './assets';
import { dirIndex, clamp } from '../core/math';
import { isoX, isoY, depthKey } from './iso';

/** Missile du jeu (`kind`) → effet D2 */
export const MISSILE_FX: Record<string, string> = {
  fire_bolt: 'firebolt',
  hydra_bolt: 'firebolt',
  firebolt_m: 'firebolt',
  fireball: 'fireball',
  ice_bolt: 'icebolt',
  coldbolt_m: 'icebolt',
  ice_lance: 'icebolt',
  orb_shard: 'icebolt',
  ice_blast: 'iceblast',
  glacial_spike: 'glacialspike',
  frozen_orb: 'iceorb',
  charged_bolt: 'chargedbolt',
  lightning_m: 'chargedbolt',
  arrow: 'arrow',
  bone: 'arrow',
  fire_arrow: 'firearrow',
  immolation_arrow: 'firearrow',
  exploding_arrow: 'firearrow',
  cold_arrow: 'icearrow',
  ice_arrow: 'icearrow',
  freezing_arrow: 'icearrow',
  magic_arrow: 'magicarrow',
  guided_arrow: 'magicarrow',
  boulder: 'boulder',
  twister: 'twister',
  tornado: 'tornado',
  bone_spear: 'bonespear',
  bone_spirit: 'bonespirit',
  teeth: 'teeth',
  holy_bolt: 'holybolt',
  holybolt: 'holybolt',
  hammer: 'blessedhammer',
  poison_javelin: 'javelin',
  plague_javelin: 'javelin',
  lightning_bolt: 'lightningjavelin',
  lightning_fury: 'lightningjavelin',
  power_strike: 'lightningjavelin',
  spit: 'unholybolt',
  baal_wave: 'mephisto',
};

/** Planches d'effets à charger pour une classe (les autres ne servent pas) */
export const FX_BY_CLASS: Record<string, string[]> = {
  sorceress: [
    'firebolt',
    'fireball',
    'icebolt',
    'iceblast',
    'glacialspike',
    'iceorb',
    'iceorbblast',
    'chargedbolt',
    'lightningbolt',
    'elecnova',
    'frostnova',
    'firenova',
    'groundfire',
    'groundfirebig',
    'groundfiresmall',
    'blizzardfall',
    'blizzardfall2',
    'stormimpact',
    'stormimpact2',
    'flame',
    'meteor',
    'meteortail',
    'meteorindicator',
    'meteorblast',
    'firecast',
    'lightningcast',
    'icecast',
    'frozenarmor',
    'manashield',
    'shivers',
    'teleport',
    'warmth',
    'fireenchant',
  ],
  amazon: ['arrow', 'firearrow', 'icearrow', 'magicarrow', 'firearrowblast', 'icearrowblast', 'javelin', 'lightningjavelin', 'poisonpuff', 'valkyrie', 'groundfiresmall'],
  barbarian: ['battlecry', 'shout', 'whirl', 'stun'],
  necromancer: [
    'curse_amplify_damage',
    'curse_dim_vision',
    'curse_weaken',
    'curse_iron_maiden',
    'curse_terror',
    'curse_confuse',
    'curse_life_tap',
    'curse_attract',
    'curse_decrepify',
    'curse_lower_resist',
    'bonespear',
    'bonespirit',
    'bonespiritblast',
    'teeth',
    'teethblast',
    'poisonnova',
    'poisonpuff',
    'cursehit',
    'boneshield',
  ],
  paladin: [
    'holybolt',
    'blessedhammer',
    'holyshock',
    'auramight',
    'aurafire',
    'auracold',
    'auralight',
    'aurathorns',
    'holyfreeze',
    'auraprayer',
    'auradefiance',
    'auracleansing',
    'auraaim',
    'auraconcentration',
    'auraconviction',
    'aurafanatic',
    'aurameditation',
    'auraredemption',
    'aurasalvation',
    'aurasanctuary',
    'auraholyshock',
    'auraresistall',
    'redemption',
    'conversion',
    'novablue',
  ],
  assassin: ['firesentry', 'shockfield', 'lightningpiece', 'cloak', 'fade', 'blade', 'flame', 'groundfiresmall', 'poisonpuff'],
  druid: ['twister', 'tornado', 'boulder', 'cyclone', 'druidmorph', 'rabies', 'feral', 'groundfire', 'meteorblast', 'fireenchant'],
};
/** Effets de contact communs à toutes les classes */
export const FX_COMMON = ['groundfire', 'groundfiresmall', 'firehit', 'icehit2', 'shockhitsm', 'poisonhit', 'cursehit', 'firearrowblast', 'levelup'];

export interface FxOpts {
  /** angle de déplacement (monde) pour choisir la direction de l'image */
  angle?: number;
  scale?: number;
  /** durée (s) : obligatoire pour une boucle, sinon une lecture */
  life?: number;
  loop?: boolean;
  vx?: number;
  vy?: number;
  vz?: number;
  alpha?: number;
  /** effet lancé à la fin de celui-ci (mêmes coordonnées) */
  next?: { id: string; scale?: number };
  /** suit une position (lanceur) */
  follow?: () => { x: number; y: number } | null;
  /** décalage vertical (unités) */
  z?: number;
  /** retard avant le premier affichage (s) */
  delay?: number;
}

interface Play {
  s: Sprite;
  sheet: Sheet;
  id: string;
  t: number;
  x: number;
  y: number;
  z: number;
  o: FxOpts;
  stop: boolean;
  fade: number;
}

export class FxPlayer {
  private plays: Play[] = [];
  private cap = 120;

  constructor(
    private readonly bank: SpriteBank,
    private readonly add: Container,
    private readonly solid: Container,
  ) {}

  /** Nombre maximal d'effets simultanés (qualité graphique) */
  setCap(n: number): void {
    this.cap = n;
  }

  has(id: string): boolean {
    return !!this.bank.get(`fx_${id}`)?.anims.idle;
  }

  /** Durée d'une lecture (s) */
  duration(id: string): number {
    const a = this.bank.get(`fx_${id}`)?.anims.idle;
    return a ? a.frames / a.fps : 0;
  }

  spawn(id: string, x: number, y: number, o: FxOpts = {}): Play | null {
    const sheet = this.bank.get(`fx_${id}`);
    if (!sheet?.anims.idle || this.plays.length >= this.cap) return null;
    const s = new Sprite(Texture.EMPTY);
    s.visible = false;
    const additive = sheet.blend !== 'normal';
    (additive ? this.add : this.solid).addChild(s);
    const p: Play = { s, sheet, id, t: -(o.delay ?? 0), x, y, z: o.z ?? 0, o, stop: false, fade: 1 };
    this.plays.push(p);
    return p;
  }

  /** Lot 312: every effect moved by (dx, dy) world units (the zone's coordinates changed at a seam's crossing) */
  shift(dx: number, dy: number): void {
    for (const p of this.plays) {
      p.x += dx;
      p.y += dy;
    }
  }

  /** Arrête une boucle (fondu de 0,2 s) */
  end(p: Play | null): void {
    if (p) p.stop = true;
  }

  /** Rayonne un anneau : un exemplaire par direction de la planche, qui s'écarte du centre jusqu'au rayon en fin de lecture */
  ring(id: string, x: number, y: number, radius: number, scale = 1): boolean {
    const sheet = this.bank.get(`fx_${id}`);
    if (!sheet?.anims.idle) return false;
    const n = sheet.anims.idle.dirs;
    const dur = this.duration(id);
    for (let k = 0; k < n; k++) {
      const ang = (k * Math.PI * 2) / n;
      const v = (radius * 0.9) / dur;
      this.spawn(id, x, y, { angle: ang, scale, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v });
    }
    return true;
  }

  update(dt: number): void {
    for (let i = this.plays.length - 1; i >= 0; i--) {
      const p = this.plays[i];
      p.t += dt;
      if (p.t < 0) continue;
      const a = p.sheet.anims.idle;
      const n = a.frames;
      const looping = !!p.o.loop || (p.o.life !== undefined && a.loop);
      let f = Math.floor(p.t * a.fps);
      let done = false;
      if (looping) {
        if (p.stop) p.fade -= dt / 0.2;
        if (p.fade <= 0 || (p.o.life !== undefined && p.t >= p.o.life)) done = true;
        f %= n;
      } else if (f >= n) done = true;
      if (done) {
        if (p.o.next) this.spawn(p.o.next.id, p.x, p.y, { scale: p.o.next.scale ?? p.o.scale });
        p.s.destroy();
        this.plays.splice(i, 1);
        continue;
      }
      if (p.o.follow) {
        const f2 = p.o.follow();
        if (f2) {
          p.x = f2.x;
          p.y = f2.y;
        }
      }
      p.x += (p.o.vx ?? 0) * dt;
      p.y += (p.o.vy ?? 0) * dt;
      p.z += (p.o.vz ?? 0) * dt;
      const dir = a.dirs > 1 ? dirIndex(p.o.angle ?? 0, a.dirs) : 0;
      const ft = p.sheet.frames.get(`idle/${dir}/${clamp(f, 0, n - 1)}`);
      if (!ft) {
        p.s.visible = false;
        continue;
      }
      p.s.visible = true;
      p.s.texture = ft.tex;
      p.s.anchor.set(ft.ax / ft.tex.width, ft.ay / ft.tex.height);
      p.s.position.set(isoX(p.x, p.y), isoY(p.x, p.y, p.z));
      p.s.scale.set((p.o.scale ?? 1) / p.sheet.scale);
      p.s.alpha = (p.o.alpha ?? 1) * clamp(p.fade, 0, 1);
      if (p.sheet.blend === 'normal') p.s.zIndex = depthKey(p.x, p.y);
    }
  }

  clear(): void {
    for (const p of this.plays) p.s.destroy();
    this.plays = [];
  }
}

/** Effet de contact d'un impact de la simulation : explosion D2 et échelle (1 = taille d'origine) ; null si l'import n'a pas d'équivalent */
export function impactFx(has: (id: string) => boolean, kind: string, elem: string, radius: number): { id: string; scale: number } | null {
  const pick = (...c: [string, number][]): { id: string; scale: number } | null => {
    for (const [id, scale] of c) if (has(id)) return { id, scale };
    return null;
  };
  const big = radius > 1;
  switch (kind) {
    case 'meteor':
      return pick(['meteorblast', clamp(radius / 2.6, 0.6, 1.6)]);
    case 'frozen_orb':
      return pick(['iceorbblast', clamp(radius / 3, 0.5, 1.3)]);
    case 'bone_spirit':
      return pick(['bonespiritblast', 1]);
    case 'teeth':
    case 'bone_spear':
      return pick(['teethblast', 0.7]);
    case 'inferno_spout':
      return pick(['flame', 1.1]);
    case 'poison_cloud':
      return pick(['poisonpuff', clamp(radius / 2, 0.6, 1.6)]);
  }
  switch (elem) {
    case 'fire':
      return big ? pick(['meteorblast', clamp(radius / 3.4, 0.5, 1.2)], ['firearrowblast', 1.4]) : pick(['firearrowblast', 0.9], ['firehit', 1]);
    case 'cold':
      return big ? pick(['iceorbblast', clamp(radius / 3.6, 0.5, 1.1)], ['icehit2', 1.2]) : pick(['icehit2', 0.8]);
    case 'light':
      return pick(['shockhitsm', big ? 1.4 : 1]);
    case 'poison':
      return big ? pick(['poisonpuff', clamp(radius / 2.4, 0.6, 1.4)], ['poisonhit', 1.3]) : pick(['poisonhit', 1]);
    case 'magic':
      return pick(['cursehit', 1]);
  }
  return null;
}

/** Anneau de nova : effet D2 par type de nova ou, à défaut, par élément */
export function novaFx(has: (id: string) => boolean, kind: string, elem: string): string | null {
  const byKind: Record<string, string> = { nova: 'elecnova', static_field: 'elecnova', frost_nova: 'frostnova', poison_nova: 'poisonnova', holy_nova: 'novablue', fire_nova: 'firenova' };
  const byElem: Record<string, string> = { light: 'elecnova', cold: 'frostnova', fire: 'firenova', poison: 'poisonnova', magic: 'novablue' };
  for (const id of [byKind[kind], byElem[elem]]) if (id && has(id)) return id;
  return null;
}

/** Overlay au pied du lanceur pendant l'incantation d'un sort élémentaire */
export function castFx(has: (id: string) => boolean, elem: string): string | null {
  const id = ({ fire: 'firecast', cold: 'icecast', light: 'lightningcast' } as Record<string, string>)[elem];
  return id && has(id) ? id : null;
}

/** Sorts persistants du joueur (identifiant de bonus de la simulation) → overlay D2 en boucle et hauteur du centre de l'effet (unités) */
export const BUFF_FX: Record<string, { id: string; z: number; scale?: number }> = {
  aura_might: { id: 'auramight', z: 0 },
  aura_prayer: { id: 'auraprayer', z: 0 },
  aura_defiance: { id: 'auradefiance', z: 0 },
  aura_cleansing: { id: 'auracleansing', z: 0 },
  aura_blessed_aim: { id: 'auraaim', z: 0 },
  aura_vigor: { id: 'auraresistall', z: 0 },
  aura_meditation: { id: 'aurameditation', z: 0 },
  aura_redemption: { id: 'auraredemption', z: 0 },
  aura_salvation: { id: 'aurasalvation', z: 0 },
  aura_fanaticism: { id: 'aurafanatic', z: 0 },
  aura_concentration: { id: 'auraconcentration', z: 0 },
  aura_conviction: { id: 'auraconviction', z: 0 },
  aura_holy_fire: { id: 'aurafire', z: 0 },
  aura_resist_fire: { id: 'aurafire', z: 0 },
  aura_resist_cold: { id: 'auracold', z: 0 },
  aura_holy_freeze: { id: 'auracold', z: 0 },
  aura_resist_lightning: { id: 'auralight', z: 0 },
  aura_holy_shock: { id: 'auraholyshock', z: 0 },
  aura_thorns: { id: 'aurathorns', z: 0 },
  aura_sanctuary: { id: 'aurasanctuary', z: 0 },
  energy_shield: { id: 'manashield', z: 0.9 },
  chilling_armor: { id: 'frozenarmor', z: 0.6 },
  frozen_armor: { id: 'frozenarmor', z: 0.6 },
  shiver_armor: { id: 'shivers', z: 0.5 },
  bone_armor: { id: 'boneshield', z: 0.5 },
  cyclone_armor: { id: 'cyclone', z: 0.4 },
  enchant: { id: 'fireenchant', z: 0.6 },
  cold_enchant: { id: 'fireenchant', z: 0.6 },
  warmth: { id: 'warmth', z: 0.5 },
  fade: { id: 'fade', z: 0.4 },
  cloak_of_shadows: { id: 'cloak', z: 0.3 },
  blade_shield: { id: 'blade', z: 0.6 },
  battle_orders: { id: 'battlecry', z: 0 },
  battle_command: { id: 'battlecry', z: 0 },
  feral_rage: { id: 'feral', z: 0.4 },
  rabies: { id: 'rabies', z: 0.4 },
};

/** Décor qui brûle : flamme D2 animée posée sur le modèle (identifiant du décor → effet, hauteur de la flamme en unités, échelle) */
export const PROP_FLAME: Record<string, { id: string; z: number; scale: number }> = {
  campfire: { id: 'groundfire', z: 0.1, scale: 0.7 },
  bonfire: { id: 'groundfire', z: 0.1, scale: 0.7 },
  brazier: { id: 'groundfire', z: 0.55, scale: 0.6 },
  torch_post: { id: 'groundfiresmall', z: 1.8, scale: 0.55 },
  torch: { id: 'groundfiresmall', z: 1.9, scale: 0.55 },
  torch_wall: { id: 'groundfiresmall', z: 1.1, scale: 0.5 },
  lantern: { id: 'groundfiresmall', z: 1.6, scale: 0.3 },
};
