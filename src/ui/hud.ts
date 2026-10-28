/**
 * HUD tactile : barres, cible, minicarte, boutons (menus, portail), grappe de compétences,
 * potions, bouton contextuel, étiquettes au sol, messages, vignette, écran de mort.
 * Couche DOM : lit l'état du jeu, n'accède jamais au moteur de rendu (hors positions écran
 * fournies par l'application).
 */
import { setStyle, setText, sub } from './dom-memo';
import { tr } from '../i18n';
import { appUpdate } from '../platform/platform';
import { d2IconUrl } from './d2icons';
import { icon } from './icon';
import { d2Ui } from './d2ui';
import type { Game } from '../sim/game';
import type { SimEvent } from '../sim/events';
import { SKILL_BY_ID } from '../data/skills';
import { levelProgress } from '../sim/progression';
import { itemName } from '../sim/itemstats';
import { highlightColor } from '../sim/loot/highlight';
import { BASE_BY_ID } from '../data/items/bases';
import { skillManaCost, canCast } from '../sim/skills';
import { beltCapacity } from '../sim/character';
import { throwSelected } from '../sim/throwpotion';
import { el, fmt } from './dom';
import { quickPresetOf } from '../render/image-quality';
import { AnnounceQueue } from './announce-queue';
import { CELL } from '../sim/grid';
import { zoneFogOf, type Fog } from '../sim/fog';
import { contextTarget } from '../sim/targeting';
import type { Monster } from '../sim/actors';
import { MONSTER_MODS } from '../data/monsters';
import { AURA_NAMES } from '../sim/monster-auras';
import { summonEntries, summonKey } from '../sim/summon-bar';
import type { World } from '../sim/world';
import type { JoystickPlace } from '../mods/rules';
import { buttonsOnLeft, joystickZoneStyle, skillColumn } from './joystick-layout';

export { icon };

/** Images d'inventaire des objets : ui/itemicon.ts (lot 295 : aussi pour les mods, par le SDK) */
export { itemIconOf, itemIconId } from './itemicon';

export interface HudLayout {
  s: number;
  atk: { x: number; y: number; r: number };
  skills: { x: number; y: number; r: number }[];
  tele: { x: number; y: number; r: number };
  hp: { x: number; y: number; r: number };
  mp: { x: number; y: number; r: number };
  rej: { x: number; y: number; r: number };
  thr: { x: number; y: number; r: number };
  page: { x: number; y: number };
  ctx: { x: number; y: number };
}

/**
 * HUD de la partie (DOM sur le canvas) : barres, cible, minicarte, boutons, compétences, potions, messages, étiquettes au sol. L'application
 * appelle `update` à chaque image, `onEvents` avec les événements de la simulation et `drawMinimap` toutes les 6 images.
 */
export class Hud {
  readonly root: HTMLElement;
  readonly joyZone: HTMLElement;
  readonly joyBase: HTMLElement;
  readonly joyKnob: HTMLElement;
  readonly atkBtn: HTMLButtonElement;
  readonly skillBtns: HTMLButtonElement[] = [];
  readonly teleBtn: HTMLButtonElement;
  readonly hpBtn: HTMLButtonElement;
  readonly mpBtn: HTMLButtonElement;
  readonly rejBtn: HTMLButtonElement;
  /** Bouton de lancer d'une potion de jet (visible seulement si on en porte) */
  readonly throwBtn: HTMLButtonElement;
  readonly pcThrow: HTMLButtonElement;
  readonly pageBtn: HTMLButtonElement;
  readonly ctxBtn: HTMLButtonElement;
  /** Bascule marche / course : petit bouton près du joystick (et en mode PC, au-dessus du globe de vie) */
  readonly walkBtn: HTMLButtonElement;
  readonly imageBtn: HTMLButtonElement;
  private imageShown = '';
  private walkShown: boolean | null = null;
  readonly portalBtn: HTMLButtonElement;
  readonly invBtn: HTMLButtonElement;
  readonly skillsBtn: HTMLButtonElement;
  readonly charBtn: HTMLButtonElement;
  readonly settingsBtn: HTMLButtonElement;
  /** Mode PC (souris + clavier) : barre de compétences façon Diablo II, sans joystick ni boutons ronds */
  pc = false;
  /** Alt maintenu : toutes les étiquettes d'objets au sol, y compris celles masquées par le filtre */
  altLabels = false;
  readonly pcBar: HTMLElement;
  readonly pcLeft: HTMLButtonElement;
  readonly pcRight: HTMLButtonElement;
  readonly pcSlots: HTMLButtonElement[] = [];
  readonly pcBelt: Record<'heal' | 'mana' | 'rejuv', HTMLButtonElement>;
  private pcOrbs: { life: HTMLElement; lifeFill: HTMLElement; mana: HTMLElement; manaFill: HTMLElement } | null = null;
  private leftHanded = false;
  readonly labels: HTMLElement;
  readonly minimap: HTMLCanvasElement;
  private bigCanvas!: HTMLCanvasElement;
  private bigMap = false;
  private lifeFill: HTMLElement;
  /** Globes de vie et de mana façon Diablo II (null sans l'art importé) */
  private orbs: { life: HTMLElement; lifeGlobe: HTMLElement; lifeTxt: HTMLElement; mana: HTMLElement; manaGlobe: HTMLElement; manaTxt: HTMLElement } | null = null;
  private mercBar: HTMLElement;
  /** Barre d'invocations : une pastille par type de créature vivante */
  private summonBar: HTMLElement;
  private summonTip: HTMLElement;
  private summonKeyLast = '';
  private summonAt = -1e9;
  private summonTipUntil = 0;
  private mercFill: HTMLElement;
  private mercTxt: HTMLElement;
  private lifeTxt: HTMLElement;
  private manaFill: HTMLElement;
  private manaTxt: HTMLElement;
  private xpFill: HTMLElement;
  private lvlTxt: HTMLElement;
  private leftAt = 0;
  private leftN = 0;
  private buffs: HTMLElement;
  private target: HTMLElement;
  /** Boss de carte engagé dont la barre est affichée (0 : aucun) */
  private mapBossId = 0;
  private targetName: HTMLElement;
  private targetSub: HTMLElement;
  private targetFill: HTMLElement;
  private msgs: HTMLElement;
  private vignette: HTMLElement;
  private deathEl: HTMLElement;
  private deathSub: HTMLElement;
  readonly perf: HTMLElement;
  page = 0;
  layout!: HudLayout;
  private labelEls = new Map<number, HTMLElement>();
  /** Largeur mesurée d'une étiquette et texte affiché à la mesure (la traduction remplace le texte juste après la création) */
  private labelWidth = new WeakMap<HTMLElement, { w: number; text: string | null }>();
  private lastHotbarKey = '';
  private lastPcKey = '';
  targetId = 0;

  constructor(parent: HTMLElement) {
    this.root = parent;
    this.lifeFill = el('div', { cls: 'fill' });
    this.lifeTxt = el('div', { cls: 'txt' });
    this.manaFill = el('div', { cls: 'fill' });
    this.manaTxt = el('div', { cls: 'txt' });
    this.xpFill = el('div', { cls: 'fill' });
    this.lvlTxt = el('div', { cls: 'lvl' });
    this.buffs = el('div', { cls: 'buffs' });
    // vie du mercenaire (masquée sans mercenaire)
    this.mercFill = el('div', { cls: 'fill' });
    this.mercTxt = el('div', { cls: 'txt' });
    this.mercBar = el('div', { cls: 'bar merc' }, this.mercFill, this.mercTxt);
    this.summonBar = el('div', { cls: 'summons', data: { testid: 'summons' } });
    this.summonBar.style.display = 'none';
    this.summonTip = el('div', { cls: 'sumtip' });
    this.summonTip.style.display = 'none';
    const bars = el(
      'div',
      { cls: 'bars' },
      el('div', { cls: 'bar life' }, this.lifeFill, this.lifeTxt),
      el('div', { cls: 'bar mana' }, this.manaFill, this.manaTxt),
      el('div', { cls: 'bar xp' }, this.xpFill),
      this.lvlTxt,
      this.buffs,
      this.mercBar,
      this.summonBar,
      this.summonTip,
    );
    if (d2Ui('orb-left') && d2Ui('orb-life')) this.orbs = this.buildOrbs();
    this.targetName = el('div', { cls: 'name' });
    this.targetSub = el('div', { cls: 'sub' });
    this.targetFill = el('div', { cls: 'fill' });
    this.target = el('div', { cls: 'target' }, this.targetName, el('div', { cls: 'bar' }, this.targetFill), this.targetSub);
    this.minimap = el('canvas', { cls: 'minimap', width: 120, height: 120 });
    // tap : la carte passe en grand au centre de l'écran (comme la carte automatique de Diablo II), re-tap pour la réduire
    this.minimap.addEventListener('click', () => this.toggleBigMap());
    this.bigCanvas = el('canvas', { cls: 'minimap-big', width: 520, height: 520 });
    this.bigCanvas.style.display = 'none';
    this.bigCanvas.addEventListener('click', () => {
      this.bigMap = false;
      this.bigCanvas.style.display = 'none';
    });
    this.portalBtn = el('button', { cls: 'tbtn', data: { testid: 'portal' }, title: 'Ouvrir le portail de ville ici (déplace le portail actuel)' }, icon('ui_portal'));
    this.invBtn = el('button', { cls: 'tbtn', data: { testid: 'inventory' }, title: 'Inventaire' }, icon('ui_inventory'));
    this.skillsBtn = el('button', { cls: 'tbtn', data: { testid: 'skills' }, title: 'Compétences' }, icon('ui_skills'));
    this.charBtn = el('button', { cls: 'tbtn', data: { testid: 'character' }, title: 'Personnage' }, icon('ui_character'));
    this.settingsBtn = el('button', { cls: 'tbtn', data: { testid: 'settings' }, title: 'Réglages' }, icon('ui_settings'));
    this.imageBtn = el('button', { cls: 'imgbtn', data: { testid: 'image-quality' }, textContent: 'Image' });
    const top = el(
      'div',
      { cls: 'topright' },
      el('div', { cls: 'col' }, this.charBtn, this.skillsBtn),
      el('div', { cls: 'col' }, this.invBtn, this.portalBtn),
      el('div', { cls: 'col' }, this.minimap, this.settingsBtn, this.imageBtn),
    );
    this.joyBase = el('div', { cls: 'joy-base' });
    this.joyKnob = el('div', { cls: 'joy-knob' });
    this.joyZone = el('div', { cls: 'joy-zone', data: { testid: 'joystick' } }, this.joyBase, this.joyKnob);
    this.labels = el('div', { cls: 'labels' });
    this.atkBtn = el('button', { cls: 'sbtn main', data: { testid: 'attack' } });
    for (let i = 0; i < 4; i++) this.skillBtns.push(el('button', { cls: 'sbtn', data: { testid: `skill${i}` } }));
    this.teleBtn = el('button', { cls: 'sbtn', data: { testid: 'teleport' } }, icon('teleport'));
    this.hpBtn = el('button', { cls: 'sbtn small', data: { testid: 'potion-hp' } }, icon(d2IconUrl('item:hp_potion') ? 'item:hp_potion' : 'potion'), el('span', { cls: 'qty' }));
    this.mpBtn = el('button', { cls: 'sbtn small', data: { testid: 'potion-mp' } }, icon(d2IconUrl('item:mp_potion') ? 'item:mp_potion' : 'potion'), el('span', { cls: 'qty' }));
    this.rejBtn = el('button', { cls: 'sbtn small', data: { testid: 'potion-rejuv' } }, icon(d2IconUrl('item:rejuv_potion') ? 'item:rejuv_potion' : 'potion'), el('span', { cls: 'qty' }));
    setStyle(this.rejBtn, 'display', 'none');
    this.throwBtn = el('button', { cls: 'sbtn small', data: { testid: 'throw-potion' }, title: 'Lancer une potion de jet' }, icon('potion'), el('span', { cls: 'qty' }));
    this.throwBtn.style.display = 'none';
    if (!d2IconUrl('item:hp_potion')) {
      this.hpBtn.style.color = '#e03030';
      this.mpBtn.style.color = '#4060ff';
    }
    this.pageBtn = el('button', { cls: 'pagebtn', data: { testid: 'page' }, textContent: '1' });
    this.ctxBtn = el('button', { cls: 'ctxbtn', data: { testid: 'context' } });
    this.walkBtn = el('button', { cls: 'walkbtn', data: { testid: 'walk' } });
    this.msgs = el('div', { cls: 'msgs' });
    this.vignette = el('div', { cls: 'vignette' });
    // lot 316: the town of the act (it named Harrogath in every act), written when the hero dies
    this.deathSub = el('small', { textContent: '' });
    this.deathEl = el('div', { cls: 'death' }, 'Vous êtes mort', this.deathSub);
    setStyle(this.deathEl, 'display', 'none');
    this.perf = el('div', { cls: 'perf' });
    this.perf.style.display = 'none';
    parent.classList.toggle('d2hud', !!this.orbs);
    parent.append(
      this.vignette,
      this.bigCanvas,
      this.joyZone,
      this.labels,
      ...(this.orbs ? [this.orbs.life, this.orbs.mana] : []),
      bars,
      this.target,
      top,
      this.atkBtn,
      ...this.skillBtns,
      this.teleBtn,
      this.hpBtn,
      this.mpBtn,
      this.rejBtn,
      this.throwBtn,
      this.pageBtn,
      this.ctxBtn,
      this.walkBtn,
      this.msgs,
      this.deathEl,
      this.perf,
    );
    // barre PC : compétence gauche, F1-F8, ceinture 1-3, compétence droite
    const cap = (txt: string) => el('span', { cls: 'kc', textContent: txt });
    this.pcLeft = el('button', { cls: 'pcbtn big', data: { testid: 'pc-left' }, title: 'Compétence du clic gauche (clic : changer)' });
    this.pcRight = el('button', { cls: 'pcbtn big', data: { testid: 'pc-right' }, title: 'Compétence du clic droit (clic : changer)' });
    for (let i = 0; i < 8; i++) this.pcSlots.push(el('button', { cls: 'pcbtn', data: { testid: `pc-slot${i}` }, title: `F${i + 1} (clic droit : changer)` }));
    const beltBtn = (kind: 'heal' | 'mana' | 'rejuv', key: string, fallback: string, color: string) => {
      const b = el(
        'button',
        { cls: 'pcbtn belt', data: { testid: `pc-potion-${kind}` }, title: `Potion — touche ${key}` },
        icon(d2IconUrl(`item:${fallback}`) ? `item:${fallback}` : 'potion'),
        el('span', { cls: 'qty' }),
        cap(key),
      );
      if (!d2IconUrl(`item:${fallback}`)) b.style.color = color;
      return b;
    };
    this.pcBelt = { heal: beltBtn('heal', '1', 'hp_potion', '#e03030'), mana: beltBtn('mana', '2', 'mp_potion', '#4060ff'), rejuv: beltBtn('rejuv', '3', 'rejuv_potion', '#c050d0') };
    this.pcThrow = el('button', { cls: 'pcbtn belt', data: { testid: 'pc-throw' }, title: 'Potion de jet — touche G' }, icon('potion'), el('span', { cls: 'qty' }), cap('G'));
    this.pcThrow.style.display = 'none';
    this.pcBar = el(
      'div',
      { cls: 'pcbar', data: { testid: 'pcbar' } },
      el('div', { cls: 'pcgrp' }, this.pcLeft),
      el('div', { cls: 'pcgrp slots' }, ...this.pcSlots),
      el('div', { cls: 'pcgrp belt' }, this.pcBelt.heal, this.pcBelt.mana, this.pcBelt.rejuv, this.pcThrow),
      el('div', { cls: 'pcgrp' }, this.pcRight),
    );
    this.pcSlots.forEach((b, i) => b.append(cap(`F${i + 1}`)));
    this.pcLeft.append(cap('G'));
    this.pcRight.append(cap('D'));
    if (!this.orbs) {
      const mk = (cls: string) => {
        const fill = el('div', { cls: 'pcfill' });
        return { box: el('div', { cls: `pcorb ${cls}` }, fill), fill };
      };
      const l = mk('life');
      const m = mk('mana');
      this.pcOrbs = { life: l.box, lifeFill: l.fill, mana: m.box, manaFill: m.fill };
      parent.append(l.box, m.box);
    }
    parent.append(this.pcBar);
    this.relayout(false);
  }

  /** Place of the joystick asked by a game mode (rule `ui.joystick`); null: the base's */
  private joyPlace: JoystickPlace | null = null;

  /** The attack button hidden by a game mode (rule `ui.hudHidden`, lot 288): the skills' column takes its place */
  private attackHidden = false;

  /** The mana gauge hidden by a game mode (rule `ui.hudHidden`, lot 294): the bars follow the life globe alone */
  private manaHidden = false;

  /** Notes the parts of the HUD a game mode hides (read every frame; the layout is redone only when the attack's or the mana's visibility changes) */
  setHiddenParts(names: readonly string[]): void {
    const hidden = names.includes('attack');
    const mana = names.includes('mana');
    if (hidden === this.attackHidden && mana === this.manaHidden) return;
    this.attackHidden = hidden;
    this.manaHidden = mana;
    this.relayout(this.leftHanded);
  }

  /** Applies the joystick's place of a game mode (read every frame by the application; the layout is redone only when it changes) */
  setJoystickPlace(place: JoystickPlace | null): void {
    if (place === this.joyPlace) return;
    this.joyPlace = place;
    this.relayout(this.leftHanded);
  }

  /** Bascule du mode de commandes : la barre PC remplace joystick et boutons ronds (masqués par CSS) */
  setMode(pc: boolean): void {
    this.pc = pc;
    this.root.classList.toggle('pc', pc);
    this.lastHotbarKey = '';
    this.relayout(this.leftHanded);
  }

  /** Affiche ou masque la grande carte */
  toggleBigMap(): void {
    this.bigMap = !this.bigMap;
    this.bigCanvas.style.display = this.bigMap ? 'block' : 'none';
  }

  /** Grande carte affichée */
  get bigMapOpen(): boolean {
    return this.bigMap;
  }

  /** Globe de Diablo II : cadre (statue et vasque) devant, sphère remplie de bas en haut derrière */
  private buildOrbs(): NonNullable<Hud['orbs']> {
    const make = (side: 'life' | 'mana') => {
      const globe = el('div', { cls: 'globe' });
      const txt = el('span', { cls: 'otxt' });
      const box = el('div', { cls: `orb ${side}` }, el('div', { cls: 'globe empty' }), globe, el('div', { cls: 'oframe' }), txt);
      return { box, globe, txt };
    };
    const l = make('life');
    const m = make('mana');
    return { life: l.box, lifeGlobe: l.globe, lifeTxt: l.txt, mana: m.box, manaGlobe: m.globe, manaTxt: m.txt };
  }

  /** Disposition (ETUDE-MOBILE §14.1) : tailles × s, arc de compétences autour de l'attaque */
  relayout(leftHanded: boolean): void {
    this.leftHanded = leftHanded;
    const joy = this.joyPlace;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const s = Math.max(0.85, Math.min(1.25, H / 390));
    document.documentElement.style.setProperty('--s', String(s));
    document.documentElement.style.setProperty('--pcs', String(Math.min(1.15, Math.max(0.85, H / 720))));
    const cs = getComputedStyle(document.documentElement);
    const sab = parseFloat(cs.getPropertyValue('--sab')) || 0;
    const sar = parseFloat(cs.getPropertyValue('--sar')) || 0;
    const sal = parseFloat(cs.getPropertyValue('--sal')) || 0;
    // buttons on the left: left-handed, or a game mode's joystick on the right (rule `ui.joystick`; base: the left-handed setting)
    const onLeft = buttonsOnLeft(joy, leftHanded);
    const mirror = (x: number) => (onLeft ? W - x : x);
    const ax = W - (onLeft ? sal : sar) - 66 * s - 10;
    const ay = H - sab - 66 * s - 6;
    const atk = { x: mirror(ax), y: ay, r: 42 * s };
    const angles = [190, 155, 120, 85];
    const column = skillColumn(joy, H > W, mirror(ax), ay, s, this.attackHidden);
    const skills =
      column ??
      angles.map((a) => {
        const rad = (a * Math.PI) / 180;
        return { x: mirror(ax + Math.cos(rad) * 120 * s), y: ay - Math.sin(rad) * 120 * s, r: 30 * s };
      });
    // téléportation : au-dessus de l'arc, rentrée de 35 px sur l'attaque (à 50° elle sortait de l'écran à droite) ; au-dessus de la colonne
    const tele = column ? { x: mirror(ax), y: column[3].y - 62 * s, r: 25 * s } : { x: mirror(ax + 35 * s), y: ay - 172 * s, r: 25 * s };
    // écran très bas (pliable fermé en paysage, environ 344 px) : la téléportation montait sur le bouton Réglages, sous la minicarte ;
    // elle passe alors à sa gauche (à sa droite pour les gauchers), à la même hauteur
    const gear = this.settingsBtn.getBoundingClientRect();
    if (gear.width && tele.y - tele.r < gear.bottom + 4 && tele.y + tele.r > gear.top - 4 && Math.abs(tele.x - (gear.left + gear.width / 2)) < tele.r + gear.width / 2 + 4)
      tele.x = onLeft ? gear.right + tele.r + 6 : gear.left - tele.r - 6;
    // potions à gauche de l'arc (sans toucher la compétence 1)
    const hp = { x: mirror(ax - 252 * s), y: ay + 22 * s, r: 28 * s };
    const mp = { x: mirror(ax - 194 * s), y: ay + 28 * s, r: 24 * s };
    const rej = { x: mirror(ax - 223 * s), y: ay - 22 * s, r: 20 * s };
    const thr = { x: mirror(ax - 280 * s), y: ay - 36 * s, r: 22 * s };
    // bascule de page dans le creux de l'arc (entre attaque et compétences 2-3) : jamais sous le HUD du haut
    const pa = (137 * Math.PI) / 180;
    const pageR = Math.max(21, 21 * s);
    const pd = 42 * s + pageR + 6;
    const page = { x: mirror(ax + Math.cos(pa) * pd), y: ay - Math.sin(pa) * pd };
    const ctx = { x: mirror(ax - 150 * s), y: ay - 170 * s };
    this.layout = { s, atk, skills, tele, hp, mp, rej, thr, page, ctx };
    const place = (b: HTMLElement, c: { x: number; y: number; r: number }) => {
      b.style.left = `${c.x - c.r}px`;
      b.style.top = `${c.y - c.r}px`;
      b.style.width = `${c.r * 2}px`;
      b.style.height = `${c.r * 2}px`;
    };
    place(this.atkBtn, atk);
    this.skillBtns.forEach((b, i) => place(b, skills[i]));
    place(this.teleBtn, tele);
    place(this.hpBtn, hp);
    place(this.mpBtn, mp);
    place(this.rejBtn, rej);
    place(this.throwBtn, thr);
    this.pageBtn.style.left = `${page.x - pageR}px`;
    this.pageBtn.style.top = `${page.y - pageR}px`;
    this.ctxBtn.style.left = `${ctx.x}px`;
    this.ctxBtn.style.top = `${ctx.y}px`;
    this.ctxBtn.style.transform = 'translate(-50%, -50%)';
    // zone of the floating joystick: a game mode's (rule `ui.joystick`: the lower two thirds, the centre included), else the style sheet's
    const zone = joystickZoneStyle(joy, W, H, parseFloat(cs.getPropertyValue('--sat')) || 0);
    this.joyZone.style.left = zone?.left ?? (leftHanded ? 'auto' : '0');
    this.joyZone.style.right = zone?.right ?? (leftHanded ? '0' : 'auto');
    this.joyZone.style.top = zone?.top ?? '';
    this.joyZone.style.width = zone?.width ?? '';
    if (joy) this.joyZone.dataset.place = joy;
    else delete this.joyZone.dataset.place;
    this.walkBtn.style.left = leftHanded ? 'auto' : `${sal + 10}px`;
    this.walkBtn.style.right = leftHanded ? `${sar + 10}px` : 'auto';
    this.joyBase.style.width = this.joyBase.style.height = `${120 * s}px`;
    this.joyKnob.style.width = this.joyKnob.style.height = `${52 * s}px`;
    if (this.orbs) {
      // globes seuls (sans cadre) en haut à gauche, vie puis mana ; le texte de niveau et les barres suivent à leur droite
      const k = s * 0.62;
      const size = 80 * k;
      const top = parseFloat(cs.getPropertyValue('--sat')) || 0;
      const left = (leftHanded ? sar : sal) + 8;
      if (this.pc) {
        // comme Diablo II : vie à gauche, mana à droite, en bas de l'écran
        const kp = Math.min(1.1, Math.max(0.8, H / 720)) * 0.95;
        const sz = 80 * kp;
        for (const [i, o] of [this.orbs.life, this.orbs.mana].entries()) {
          o.style.transform = `scale(${kp})`;
          o.style.transformOrigin = 'left top';
          o.style.top = `${H - sab - sz - 4}px`;
          o.style.bottom = 'auto';
          o.style.left = `${i === 0 ? sal + 6 : W - sar - sz - 6}px`;
          o.style.right = 'auto';
        }
        document.documentElement.style.setProperty('--orb-bars-left', `${sal + 10}px`);
        this.lastHotbarKey = '';
        return;
      }
      for (const [i, o] of [this.orbs.life, this.orbs.mana].entries()) {
        o.style.transform = `scale(${k})`;
        o.style.transformOrigin = 'left top';
        o.style.top = `${top + 6}px`;
        o.style.bottom = 'auto';
        o.style.left = `${left + i * (size + 6)}px`;
        o.style.right = 'auto';
      }
      document.documentElement.style.setProperty('--orb-bars-left', `${left + (this.manaHidden ? 1 : 2) * size + 18}px`);
    }
    this.lastHotbarKey = '';
  }

  /** Emplacements visibles de la page courante */
  visibleSlots(g: Game): (string | null)[] {
    const hb = g.character.hotbar.slots;
    return hb.slice(this.page * 4, this.page * 4 + 4);
  }

  /** Pastilles d'invocations (compte recalculé une fois par demi-seconde, DOM refait seulement si quelque chose change) */
  private updateSummons(w: World, now: number): void {
    if (this.summonTipUntil && now > this.summonTipUntil) {
      this.summonTipUntil = 0;
      this.summonTip.style.display = 'none';
    }
    if (now - this.summonAt < 500) return;
    this.summonAt = now;
    const list = summonEntries(w);
    const key = summonKey(list);
    if (key === this.summonKeyLast) return;
    this.summonKeyLast = key;
    this.summonBar.replaceChildren();
    this.summonBar.style.display = list.length ? 'flex' : 'none';
    for (const e of list) {
      const full = e.cap > 0 && e.count >= e.cap;
      const text = `${e.name} : ${e.count}${e.cap > 0 ? ` / ${e.cap}` : ''}`;
      const chip = el(
        'div',
        { cls: `sumchip${full ? ' full' : ''}`, title: text, data: { testid: `summon-${e.id}`, count: String(e.count) } },
        icon(d2IconUrl(e.id) ? e.id : 'ui_skills'),
        el('span', { cls: 'n', textContent: e.cap > 0 ? `${e.count}/${e.cap}` : String(e.count) }),
      );
      chip.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      chip.addEventListener('click', () => {
        this.summonTip.textContent = text;
        this.summonTip.style.display = 'block';
        this.summonTipUntil = performance.now() + 3000;
      });
      this.summonBar.append(chip);
    }
    if (!list.length) this.summonTip.style.display = 'none';
  }

  /** Met à jour barres, globes, cible, boutons et compétences d'après l'état du jeu (une fois par image affichée) */
  update(g: Game, now: number): void {
    const w = g.world;
    const p = w.player;
    const c = g.character;
    setStyle(this.lifeFill, 'transform', `scaleX(${Math.max(0, p.hp / p.hpMax)})`);
    this.lifeFill.classList.toggle('poisoned', (p.poisonT ?? 0) > 0);
    setText(this.lifeTxt, `${fmt(Math.max(0, p.hp))} / ${fmt(p.hpMax)}`);
    if (this.orbs) {
      const o = this.orbs;
      const lr = Math.max(0, Math.min(1, p.hp / p.hpMax));
      const mr = Math.max(0, Math.min(1, p.mana / p.manaMax));
      setStyle(o.lifeGlobe, 'clip-path', `inset(${(1 - lr) * 100}% 0 0 0)`);
      setStyle(o.manaGlobe, 'clip-path', `inset(${(1 - mr) * 100}% 0 0 0)`);
      o.lifeGlobe.classList.toggle('poisoned', (p.poisonT ?? 0) > 0);
      setText(o.lifeTxt, `${fmt(Math.max(0, p.hp))}`);
      setText(o.manaTxt, `${fmt(p.mana)}`);
    }
    if (this.pcOrbs) {
      setStyle(this.pcOrbs.lifeFill, 'height', `${Math.max(0, Math.min(1, p.hp / p.hpMax)) * 100}%`);
      setStyle(this.pcOrbs.manaFill, 'height', `${Math.max(0, Math.min(1, p.mana / p.manaMax)) * 100}%`);
    }
    setStyle(this.manaFill, 'transform', `scaleX(${Math.max(0, p.mana / p.manaMax)})`);
    setText(this.manaTxt, `${fmt(p.mana)} / ${fmt(p.manaMax)}`);
    setStyle(this.xpFill, 'transform', `scaleX(${levelProgress(c)})`);
    const ms = c.merc;
    setStyle(this.mercBar, 'display', ms ? 'block' : 'none');
    if (ms) {
      const mm = w.monsters.find((m) => m.pet === 'merc' && !m.dead);
      const ratio = ms.dead || !mm ? 0 : mm.hp / mm.hpMax;
      setStyle(this.mercFill, 'transform', `scaleX(${Math.max(0, ratio)})`);
      this.mercBar.classList.toggle('dead', ms.dead);
      setText(this.mercTxt, ms.dead ? `${ms.name} — mort` : ms.name);
    }
    this.updateSummons(w, now);
    const pts = c.statPoints + c.skillPoints > 0 ? ' ✦' : '';
    // carte : monstres restants (vivants + groupes pas encore apparus), « 50+ » au-delà de 50
    let left = '';
    if (g.mode === 'run' && w.run?.runId === 'map' && !w.run.completed) {
      if (now - this.leftAt > 300) {
        this.leftAt = now;
        this.leftN = mapMonstersLeft(w);
      }
      left = this.leftN > MONSTERS_LEFT_CAP ? ` · ${MONSTERS_LEFT_CAP}+ monstres` : ` · ${this.leftN} monstre${this.leftN > 1 ? 's' : ''}`;
    }
    setText(this.lvlTxt, `Niveau ${c.level}${pts}${g.mode === 'run' && g.runDef ? ` — ${g.runDef.name}${g.corrupt ? ' (corrompue)' : ''}` : ` — ${w.zone.name}`}${left}`);
    setStyle(this.vignette, 'opacity', p.hp < p.hpMax * 0.3 && !p.dead ? String(0.4 + 0.3 * Math.sin(now / 200)) : '0');
    if (p.dead) setText(this.deathSub, deathLine(g));
    setStyle(this.deathEl, 'display', p.dead ? 'grid' : 'none');
    // badges de points à dépenser
    setBadge(this.charBtn, c.statPoints);
    setBadge(this.skillsBtn, c.skillPoints);
    // mise à jour de l'application prête : point sur l'engrenage
    if (appUpdate.status === 'available') setBadge(this.settingsBtn, 1, '!');
    else setBadge(this.settingsBtn, 0);
    // barre de compétences
    const hbKey = `${c.hotbar.primary}|${c.hotbar.secondary ?? ''}|${c.hotbar.slots.join(',')}|${this.page}|${this.pc ? 1 : 0}`;
    if (hbKey !== this.lastHotbarKey) {
      this.lastHotbarKey = hbKey;
      setSkillIcon(this.atkBtn, c.hotbar.primary);
      this.visibleSlots(g).forEach((id, i) => setSkillIcon(this.skillBtns[i], id));
      setText(this.pageBtn, String(this.page + 1));
    }
    const inTown = w.zone.town;
    setStyle(this.portalBtn, 'opacity', inTown ? '0.35' : '1');
    const cd = (b: HTMLElement, id: string | null) => {
      if (!id) return;
      const until = p.cooldowns[id] ?? 0;
      const s = SKILL_BY_ID[id];
      const total = s?.n.cooldown ? s.n.cooldown * 25 : 1;
      const rem = Math.max(0, until - w.tick);
      const cdEl = sub(b, '.cd');
      if (cdEl) setStyle(cdEl, '--cd', `${(rem / total) * 360}deg`);
      const ok = inTown ? false : id === 'attack' || p.mana >= skillManaCost(w, id);
      b.classList.toggle('nomana', !ok);
    };
    cd(this.atkBtn, c.hotbar.primary);
    this.visibleSlots(g).forEach((id, i) => cd(this.skillBtns[i], id));
    if (this.pc) {
      const pcSet = (b: HTMLElement, id: string | null, keep: string) => {
        setSkillIcon(b, id);
        b.append(el('span', { cls: 'kc', textContent: keep }));
      };
      if (hbKey !== this.lastPcKey) {
        this.lastPcKey = hbKey;
        pcSet(this.pcLeft, c.hotbar.primary, 'G');
        pcSet(this.pcRight, c.hotbar.secondary ?? 'attack', 'D');
        this.pcSlots.forEach((b, i) => pcSet(b, c.hotbar.slots[i] ?? null, `F${i + 1}`));
      }
      cd(this.pcLeft, c.hotbar.primary);
      cd(this.pcRight, c.hotbar.secondary ?? 'attack');
      this.pcSlots.forEach((b, i) => cd(b, c.hotbar.slots[i] ?? null));
    }
    setStyle(this.teleBtn, 'display', (c.skills.teleport ?? 0) > 0 || (p.d.skillLevels.teleport ?? 0) > 0 ? 'grid' : 'none');
    const hp = c.belt.find((b) => b.kind === 'heal')!;
    const mp = c.belt.find((b) => b.kind === 'mana')!;
    setText(sub(this.hpBtn, '.qty')!, `${hp.qty}/${beltCapacity(c)}`);
    setText(sub(this.mpBtn, '.qty')!, `${mp.qty}`);
    this.hpBtn.classList.toggle('empty', hp.qty <= 0);
    this.mpBtn.classList.toggle('empty', mp.qty <= 0);
    // potion de rajeunissement : le bouton n'apparaît que si la ceinture en porte
    const rj = c.belt.find((b) => b.kind === 'rejuv');
    setStyle(this.rejBtn, 'display', rj && rj.qty > 0 ? 'grid' : 'none');
    if (this.pc) {
      for (const [k, b] of Object.entries(this.pcBelt) as ['heal' | 'mana' | 'rejuv', HTMLElement][]) {
        const q = c.belt.find((x) => x.kind === k)?.qty ?? 0;
        setText(sub(b, '.qty')!, String(q));
        b.classList.toggle('empty', q <= 0);
      }
    }
    setText(sub(this.rejBtn, '.qty')!, `${rj?.qty ?? 0}`);
    // potion de jet : le bouton n'apparaît que si on en porte (icône du type sélectionné, compteur de la pile)
    const tid = throwSelected(c);
    const tq = tid ? (c.throwPots?.[tid] ?? 0) : 0;
    const tlabel = tid ? `Lancer : ${BASE_BY_ID[tid]?.name ?? tid}` : 'Potion de jet';
    for (const b of [this.throwBtn, this.pcThrow]) {
      setStyle(b, 'display', tid ? (b === this.pcThrow ? 'grid' : this.pc ? 'none' : 'grid') : 'none');
      setText(sub(b, '.qty')!, String(tq));
      b.title = `${tlabel} — touche G`;
      if (tid && b.dataset.tid !== tid) {
        b.dataset.tid = tid;
        const ic = d2IconUrl(`item:${tid}`) ? `item:${tid}` : 'potion';
        b.querySelector('.icon')?.replaceWith(icon(ic));
      }
    }
    // allure : marche ou course (réglage local)
    const preset = quickPresetOf(g.settings);
    const imgKey = `${g.settings.imageButton === false}|${preset?.id ?? 'custom'}`;
    if (imgKey !== this.imageShown) {
      this.imageShown = imgKey;
      setStyle(this.imageBtn, 'display', g.settings.imageButton === true ? '' : 'none');
      this.imageBtn.dataset.mode = preset?.id ?? 'custom';
      setText(this.imageBtn, preset ? (preset.id === 'off' ? 'Image' : preset.label) : 'Image*');
      this.imageBtn.title = "Qualité d'image : appuyer = préréglage suivant, maintenir = comparer (touche V)";
    }
    setStyle(this.walkBtn, 'display', g.settings.walkButton === true ? '' : 'none');
    const walking = g.settings.walkMode === true;
    if (walking !== this.walkShown) {
      this.walkShown = walking;
      setText(this.walkBtn, walking ? 'Marche' : 'Course');
      this.walkBtn.dataset.mode = walking ? 'walk' : 'run';
      this.walkBtn.title = walking ? 'Marche (6 yards/s) — touche R pour courir' : 'Course — touche R pour marcher';
    }
    // bouton contextuel
    const ctx = contextTarget(w);
    if (ctx) {
      setStyle(this.ctxBtn, 'display', 'block');
      if (ctx.kind === 'item') {
        const gi = w.items.find((i) => i.id === ctx.id);
        setText(this.ctxBtn, gi ? `Ramasser : ${tr(itemName(gi.item))}` : 'Ramasser');
      } else setText(this.ctxBtn, ctx.label);
      this.ctxBtn.dataset.kind = ctx.kind;
      this.ctxBtn.dataset.id = String(ctx.id);
    } else setStyle(this.ctxBtn, 'display', 'none');
    // buffs
    const bk = p.buffs.map((b) => b.id).join(',');
    if (this.buffs.dataset.k !== bk) {
      this.buffs.dataset.k = bk;
      this.buffs.replaceChildren(
        ...p.buffs.map((b) => el('div', { cls: `buff ${SKILL_BY_ID[b.id]?.tree ?? ''}`, data: { id: b.id } }, icon(SKILL_BY_ID[b.id] ? b.id : 'ui_vortex'), el('span', { cls: 't' }))),
      );
    }
    for (const node of Array.from(this.buffs.children)) {
      const b = p.buffs.find((x) => x.id === (node as HTMLElement).dataset.id);
      if (!b) continue;
      // formes, esprits : permanents (pas de minuteur) ; charges de Rage sauvage / Mutilation ;
      // Armure du cyclone : dégâts encore absorbables
      const secs = Math.ceil((b.until - w.tick) / 25);
      const txt = b.id === 'cyclone_armor' ? String(Math.round(p.absorbPool ?? 0)) : b.stacks !== undefined ? `×${b.stacks}` : secs > 3600 ? '' : String(secs);
      setText(sub(node as HTMLElement, '.t')!, txt);
    }
    // cible ; boss de carte engagé : sa grande barre (nom, phase) prend la place de la cible
    if (!this.mapBossId && w.tick % 10 === 0) this.mapBossId = w.monsters.find((m) => m.mapBoss?.engaged && !m.dead)?.id ?? 0;
    const boss = this.mapBossId ? (w.monsters.find((m) => m.id === this.mapBossId && !m.dead && m.mapBoss?.engaged) as Monster | undefined) : undefined;
    if (!boss) this.mapBossId = 0;
    this.target.classList.toggle('boss', !!boss);
    const t = boss ?? (w.monsters.find((m) => m.id === this.targetId && !m.dead) as Monster | undefined);
    if (boss?.mapBoss) {
      const st = boss.mapBoss;
      setStyle(this.target, 'display', 'block');
      setText(this.targetName, boss.name);
      setStyle(this.targetName, 'color', '#e8b04a');
      setStyle(this.targetFill, 'transform', `scaleX(${Math.max(0, boss.hp / boss.hpMax)})`);
      setText(this.targetSub, [`Phase ${st.phase + 1} / 4`, st.shieldUntil > w.tick ? 'Bouclier' : '', st.enrage > 0 ? 'Enragé' : ''].filter(Boolean).join(' — '));
    } else if (t) {
      setStyle(this.target, 'display', 'block');
      setText(this.targetName, t.name);
      setStyle(this.targetName, 'color', t.rank === 'unique' || t.rank === 'boss' ? '#c8a050' : t.rank === 'champion' ? '#8aa8ff' : '#e8dcc4');
      setStyle(this.targetFill, 'transform', `scaleX(${Math.max(0, t.hp / t.hpMax)})`);
      const imm = (['fire', 'cold', 'light', 'poison', 'phys'] as const).filter((e) => (t.res[e] ?? 0) >= 100);
      const names: Record<string, string> = { fire: 'Feu', cold: 'Froid', light: 'Foudre', poison: 'Poison', phys: 'Physique' };
      setText(this.targetSub, [imm.length ? `Immunisé : ${imm.map((e) => names[e]).join(', ')}` : '', t.mods.length ? t.mods.map((x) => modName(x, t)).join(', ') : ''].filter(Boolean).join(' — '));
    } else setStyle(this.target, 'display', 'none');
    void canCast;
  }

  /** Étiquettes au sol (tap = ramasser). Positions fournies par l'application (rendu) */
  updateLabels(g: Game, screens: { id: number; x: number; y: number }[]): void {
    const w = g.world;
    const seen = new Set<number>();
    // anti-chevauchement : on empile verticalement les étiquettes proches, 12 max (les plus précieuses d'abord)
    if (!screens.length && !this.labelEls.size) return;
    const byId = new Map<number, (typeof w.items)[number]>();
    for (const i of w.items) byId.set(i.id, i);
    const items = screens
      .map((s) => ({ s, gi: byId.get(s.id)! }))
      .filter((x) => x.gi)
      .sort((a, b) => b.gi.show - a.gi.show)
      .slice(0, 12);
    const placed: { x: number; y: number; w: number }[] = [];
    for (const { s, gi } of items) {
      seen.add(gi.id);
      let e = this.labelEls.get(gi.id);
      if (!e) {
        e = el('div', {
          cls: `label ${labelClass(gi.item)}${gi.show <= 0 ? ' hidden-item' : ''}`,
          textContent: gi.show >= 5 ? `★ ${itemName(gi.item)} ★` : itemName(gi.item),
          data: { id: String(gi.id) },
        });
        this.labels.appendChild(e);
        this.labelEls.set(gi.id, e);
      }
      // surbrillance du filtre : couleur choisie (prime sur la rareté)
      const hl = highlightColor(g.character.filter, gi.item);
      // largeur mesurée seulement quand l'apparence change (création, palier, surbrillance) : lire offsetWidth après les écritures de
      // l'image forçait un calcul de mise en page par étiquette et par image
      const look = `${gi.show}|${this.altLabels ? 1 : 0}|${hl ?? ''}`;
      const known = this.labelWidth.get(e);
      let wdt = known?.w ?? 0;
      if (!known || known.text !== e.textContent || e.dataset.look !== look) {
        e.dataset.look = look;
        e.classList.toggle('hidden-item', gi.show <= 0);
        e.classList.toggle('tier-exc', gi.show === 4);
        e.classList.toggle('tier-hr', gi.show >= 5);
        e.classList.toggle('alt-show', this.altLabels);
        e.classList.toggle('hl', hl !== undefined);
        e.style.color = hl === undefined ? '' : `#${hl.toString(16).padStart(6, '0')}`;
        wdt = Math.max(60, e.offsetWidth || 90);
        this.labelWidth.set(e, { w: wdt, text: e.textContent });
      }
      let y = s.y - 6;
      for (let k = 0; k < 6; k++) {
        const hit = placed.find((p) => Math.abs(p.x - s.x) < (p.w + wdt) / 2 && Math.abs(p.y - y) < 19);
        if (!hit) break;
        y = hit.y - 20;
      }
      placed.push({ x: s.x, y, w: wdt });
      setStyle(e, 'left', `${Math.round(s.x)}px`);
      setStyle(e, 'top', `${Math.round(y)}px`);
    }
    for (const [id, e] of this.labelEls) {
      if (!seen.has(id)) {
        e.remove();
        this.labelEls.delete(id);
      }
    }
  }

  /** Message court en haut de l'écran (cinq au plus, les plus anciens s'effacent) */
  message(text: string, color = '#e8dcc4'): void {
    const m = el('div', { cls: 'msg', textContent: text });
    m.style.color = color;
    this.msgs.appendChild(m);
    while (this.msgs.children.length > 5) this.msgs.firstChild?.remove();
    setTimeout(() => m.remove(), 3300);
  }

  private announces = new AnnounceQueue();
  private announceBox: HTMLElement | null = null;
  private announceTimer = 0;

  /** Annonce centrale : file d'attente, 3 lignes empilées maximum, doublons regroupés en « ×N ». */
  bannerText(text: string, color?: string, prio = 3, key = text): void {
    if (this.announces.push({ key, text, color, prio }, performance.now())) this.renderAnnounces();
    this.scheduleAnnounces();
  }

  private scheduleAnnounces(): void {
    if (this.announceTimer || this.announces.idle) return;
    this.announceTimer = window.setTimeout(() => {
      this.announceTimer = 0;
      if (this.announces.tick(performance.now())) this.renderAnnounces();
      this.scheduleAnnounces();
    }, 250);
  }

  private renderAnnounces(): void {
    if (!this.announceBox) {
      this.announceBox = el('div', { cls: 'announces' });
      this.root.appendChild(this.announceBox);
    }
    const box = this.announceBox;
    box.textContent = '';
    for (const a of this.announces.visible) {
      const d = el('div', { cls: `banner banner-p${a.prio}`, textContent: a.count > 1 ? `${a.text} ×${a.count}` : a.text });
      if (a.color) d.style.color = a.color;
      box.appendChild(d);
    }
  }

  /** Réagit aux événements de la simulation : messages, montée de niveau, ramassage, fin de run, boss, vagues, événements de carte, butin, entrée de zone */
  onEvents(g: Game, events: SimEvent[]): void {
    for (const e of events) {
      switch (e.t) {
        case 'message':
          this.message(e.text, e.color);
          break;
        case 'levelUp':
          this.bannerText(`Niveau ${e.level} !`);
          break;
        case 'pickup':
          if (e.kind === 'rune' || e.kind === 'map' || e.kind === 'currency') this.message(`Ramassé : ${e.name}`, '#ff9a30');
          break;
        case 'runComplete':
          // lot 320 (audit 3.14): no Rush banner (a run's time) in the Campaign, where a zone's boss is no run
          if (!g.inCampaignZone()) this.bannerText(`${g.runDef?.name ?? 'Run'} terminée — ${Math.floor(e.durationSec / 60)} min ${Math.round(e.durationSec % 60)} s`);
          break;
        case 'bossSpawn':
          this.bannerText(e.name, '#e05030');
          break;
        case 'wave':
          this.bannerText(`Vague ${e.index} / ${e.total}`, '#e05030');
          break;
        case 'mapEvent':
          this.bannerText(e.text, '#ffcf40');
          break;
        case 'itemDrop':
          if (e.tier >= 4) {
            const gi = g.world.items.find((i) => i.item.uid === e.uid);
            const name = gi ? itemName(gi.item) : 'Objet exceptionnel';
            if (e.tier >= 5) this.bannerText(`★ ${name} ★`, '#ff6a2a', 5, `drop:${gi?.item.base ?? name}`);
            else this.bannerText(name, '#ffb050', 4, `drop:${gi ? `${gi.item.base}:${gi.item.quality}:${gi.item.uniqueId ?? gi.item.setId ?? ''}` : name}`);
          }
          break;
        case 'zoneEnter':
          break;
      }
    }
  }

  /** Texte de l'affichage des performances (null : masqué) */
  setPerf(text: string | null): void {
    this.perf.style.display = text === null ? 'none' : 'block';
    if (text !== null) this.perf.textContent = text;
  }

  /** Minicarte : murs, décor, monstres, joueur (dessin 2D, hors moteur de rendu) */
  /** Brouillard de la carte d'endgame : tuiles déjà vues (remis à zéro à chaque nouvelle zone) */
  private fog: Uint8Array | null = null;
  private fogZone: unknown = null;

  /** Lot 312: wall dots of the zones joined edge to edge drawn on the minimap at its last drawing (measures, e2e) */
  minimapLinkDots = 0;
  /** Lot 321: at the minimap's last drawing, the monsters and objects marked, and the cells of the zone explored (e2e) */
  minimapMarks = { monsters: 0, objects: 0, explored: 0 };

  /** Redessine la minicarte (et la grande carte si elle est ouverte) */
  drawMinimap(g: Game): void {
    // lot 321: Diablo II's automap in the Campaign (its zones and towns): the cells around the hero remembered as he walks
    if (automapMemory(g)) exploreAround(g.world);
    this.drawMinimapOn(g, this.minimap, 1);
    if (this.bigMap) this.drawMinimapOn(g, this.bigCanvas, 2.4);
  }

  private drawMinimapOn(g: Game, cv: HTMLCanvasElement, zoom: number): void {
    const w = g.world;
    const ctx = cv.getContext('2d')!;
    const S = cv.width;
    ctx.clearRect(0, 0, S, S);
    const p = w.player;
    const scale = 2.2 * zoom;
    const tr = (x: number, y: number): [number, number] => {
      const dx = x - p.x;
      const dy = y - p.y;
      return [S / 2 + (dx - dy) * scale * 0.7, S / 2 + (dx + dy) * scale * 0.35];
    };
    // carte d'endgame à forme générée : brouillard, les tuiles de 4 unités autour du joueur se révèlent au fil de l'exploration
    const gt = w.zone.groundTiles;
    let fog: Uint8Array | null = null;
    if (gt) {
      if (this.fogZone !== w.zone) {
        this.fogZone = w.zone;
        this.fog = new Uint8Array(gt.cols * gt.rows);
      }
      fog = this.fog!;
      const R = 5;
      const tx = Math.floor(p.x / gt.size);
      const ty = Math.floor(p.y / gt.size);
      for (let y = Math.max(0, ty - R); y <= Math.min(gt.rows - 1, ty + R); y++)
        for (let x = Math.max(0, tx - R); x <= Math.min(gt.cols - 1, tx + R); x++) if ((x - tx) ** 2 + (y - ty) ** 2 <= R * R) fog[y * gt.cols + x] = 1;
    }
    // lot 321 (audit 5.6, 5.7): in the Campaign, only what the hero has seen (the walls, the waypoints, exits, portals, shrines and NPCs
    // of the explored cells), no monster nor chest; the mercenary shown (Diablo II's automap). Rush runs and endgame maps keep theirs.
    const memory = !gt && automapMemory(g);
    const own = memory ? zoneFogOf(w, CELL) : null;
    const seenAt = (x: number, y: number): boolean => {
      if (!own || own.isSeen(x, y)) return true;
      for (const l of w.seamLinks ?? []) if (zoneFogOf(l.world, CELL).isSeen(x - l.seam.at.x, y - l.seam.at.y)) return true;
      return false;
    };
    if (w.zone.d2Map || gt) {
      // carte de Diablo II (ou forme générée) : contours des murs tirés de la grille de collision (style automap : traits clairs)
      const cell = CELL;
      const R = Math.ceil(S / 2 / (scale * 0.35) / 2 / cell);
      ctx.fillStyle = 'rgba(214,210,196,0.85)';
      // `g2` drawn with its origin at (ox, oy) of the zone; `skip`: the zone's own map, already drawn (a neighbour's part over it left out)
      const walls = (g2: World['grid'], ox: number, oy: number, skip: World['grid'] | null, mem: Fog | null) => {
        const cx0 = Math.floor((p.x - ox) / cell);
        const cy0 = Math.floor((p.y - oy) / cell);
        for (let cy = cy0 - R; cy <= cy0 + R; cy++) {
          if (cy < 1 || cy >= g2.rows - 1) continue;
          for (let cx = cx0 - R; cx <= cx0 + R; cx++) {
            if (cx < 1 || cx >= g2.cols - 1) continue;
            const i = cy * g2.cols + cx;
            if (!g2.blocked[i] || (g2.blocked[i - 1] && g2.blocked[i + 1] && g2.blocked[i - g2.cols] && g2.blocked[i + g2.cols])) continue;
            if (fog && gt && !fog[Math.floor((cy * cell) / gt.size) * gt.cols + Math.floor((cx * cell) / gt.size)]) continue;
            if (mem && !mem.isSeen((cx + 0.5) * cell, (cy + 0.5) * cell)) continue;
            const wx = (cx + 0.5) * cell + ox;
            const wy = (cy + 0.5) * cell + oy;
            if (skip && wx >= 0 && wy >= 0 && wx < skip.cols * cell && wy < skip.rows * cell) continue;
            const [x, y] = tr(wx, wy);
            if (x < 0 || y < 0 || x > S || y > S) continue;
            ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
            if (skip) linkDots++;
          }
        }
      };
      let linkDots = 0;
      walls(w.grid, 0, 0, null, own);
      // lot 312: the zones joined edge to edge go on beyond the seam, as on the screen (their walls where their maps lie)
      for (const l of w.seamLinks ?? []) walls(l.world.grid, l.seam.at.x, l.seam.at.y, w.grid, memory ? zoneFogOf(l.world, CELL) : null);
      if (zoom === 1) this.minimapLinkDots = linkDots;
    }
    ctx.fillStyle = 'rgba(160,140,110,0.5)';
    // forme générée : le décor est déjà dans les contours (et sous le brouillard)
    if (!gt)
      for (const pr of w.zone.props) {
        if (memory && !seenAt(pr.x, pr.y)) continue;
        const [x, y] = tr(pr.x, pr.y);
        if (x < 0 || y < 0 || x > S || y > S) continue;
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    ctx.strokeStyle = 'rgba(200,180,140,0.6)';
    ctx.lineWidth = 2;
    for (const wl of w.zone.walls) {
      if (memory && !seenAt((wl.x0 + wl.x1) / 2, (wl.y0 + wl.y1) / 2)) continue;
      const [x0, y0] = tr(wl.x0, wl.y0);
      const [x1, y1] = tr(wl.x1, wl.y1);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    let marks = 0;
    for (const o of w.objects) {
      if (memory && (!AUTOMAP_KINDS.has(o.kind) || !seenAt(o.x, o.y))) continue;
      const [x, y] = tr(o.x, o.y);
      ctx.fillStyle = o.kind === 'portal' || o.kind === 'waypoint' ? '#6af' : o.kind === 'npc' ? '#ff0' : '#c93';
      ctx.fillRect(x - 2, y - 2, 4, 4);
      marks++;
    }
    let foes = 0;
    for (const m of w.monsters) {
      if (m.dead || m.isSummon) continue;
      if (memory && m.pet !== 'merc') continue;
      const [x, y] = tr(m.x, m.y);
      if (x < 0 || y < 0 || x > S || y > S) continue;
      ctx.fillStyle = m.pet === 'merc' && memory ? '#4c4' : m.rank === 'boss' || m.rank === 'unique' ? '#fc3' : m.rank === 'champion' ? '#58f' : '#c22';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      if (!m.pet) foes++;
    }
    if (zoom === 1) this.minimapMarks = { monsters: foes, objects: marks, explored: own?.count ?? 0 };
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Lot 321: the Campaign's automap remembers (its zones and towns; Diablo II's automap): a Rush run, an endgame map or a game mode's round
 * keeps the minimap it had
 */
export function automapMemory(g: Game): boolean {
  return g.inCampaignZone() || g.mode === 'town';
}

/** Objects Diablo II's automap marks once seen: waypoints, exits and portals, shrines, the town's NPCs and stash (no chest, no barrel) */
export const AUTOMAP_KINDS = new Set(['waypoint', 'portal', 'shrine', 'npc', 'stash']);

/** Lot 321: the cells around the hero explored, in his zone and in the zones joined to it edge to edge (their own coordinates) */
export function exploreAround(w: World): void {
  const p = w.player;
  zoneFogOf(w, CELL).reveal(p.x, p.y);
  for (const l of w.seamLinks ?? []) zoneFogOf(l.world, CELL).reveal(p.x - l.seam.at.x, p.y - l.seam.at.y);
}

function setBadge(b: HTMLElement, n: number, text?: string): void {
  let badge = b.querySelector('.badge') as HTMLElement | null;
  if (n > 0) {
    if (!badge) {
      badge = el('span', { cls: 'badge' });
      b.appendChild(badge);
    }
    badge.textContent = text ?? String(n);
  } else badge?.remove();
}

function setSkillIcon(b: HTMLElement, id: string | null): void {
  b.replaceChildren();
  if (!id) {
    b.style.opacity = '0.35';
    return;
  }
  b.style.opacity = '1';
  const s = SKILL_BY_ID[id];
  const i = icon(id);
  b.className = b.className.replace(/\b(fire|cold|light)\b/g, '').trim();
  if (s) b.classList.add(s.tree);
  b.append(i, el('span', { cls: 'cd' }));
  b.dataset.skill = id;
}

/** Au-delà de ce nombre, le compteur de monstres restants affiche « 50+ » */
export const MONSTERS_LEFT_CAP = 50;

/** Monstres restant dans une carte : vivants (hors invocations) + monstres des groupes pas encore apparus */
export function mapMonstersLeft(w: World): number {
  let n = 0;
  for (const m of w.monsters) if (!m.dead && !m.isSummon && !m.pet) n++;
  for (const p of w.pendingSpawns) if (!p.wave && !p.seal) n += w.zone.spawns[p.idx]?.count ?? 0;
  return n;
}

export function labelClass(item: { base: string; quality: string; sockets: number; ethereal?: boolean; corrupted?: unknown }): string {
  const b = BASE_BY_ID[item.base];
  if (b?.type === 'rune') return 'q-rune';
  if (b?.type === 'currency' || b?.type === 'map') return 'q-currency';
  if (b?.type === 'gem' || b?.type === 'potion') return 'q-normal';
  // comme Diablo II : objet normal ou supérieur à châsses ou éthéré = nom grisé
  if ((item.quality === 'normal' || item.quality === 'superior') && (item.sockets > 0 || item.ethereal)) return 'q-socket';
  return `q-${item.quality}`;
}

/** Modificateurs d'élites (data/monsters.ts) et aura portée (Aura enchantée : « Aura enchantée (Fanatisme) ») */
function modName(m: string, t?: Monster): string {
  const n = MONSTER_MODS.find((x) => x.id === m)?.name ?? m;
  return m === 'auraEnchanted' && t?.auraId ? `${n} (${AURA_NAMES[t.auraId] ?? t.auraId})` : n;
}

/** Lot 316: the death screen's line: the town of the act the hero wakes in, and the portal back to the zone (none where a death ends the run) */
export function deathLine(g: Game): string {
  const town = g.townName();
  return g.runDef?.abandonOnDeath ? `Retour dans ${town}` : `Retour dans ${town} — un portail vous ramènera ici`;
}
