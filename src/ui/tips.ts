/**
 * Conseils de prise en main (mobile) : chacun s'affiche une seule fois, au moment où il sert
 * (arrivée en ville, premier niveau, premier objet, vie basse…), sous forme d'une carte discrète
 * qui se ferme d'un tap ou d'elle-même. Désactivables et réinitialisables dans les réglages.
 */
import type { Game } from '../sim/game';
import type { SimEvent } from '../sim/events';
import { el } from './dom';

export type TipId = 'controls' | 'waypoint' | 'skills' | 'stats' | 'potion' | 'inventory' | 'runDone' | 'aim' | 'portal';

interface TipDef {
  text: string;
  /** Bouton du HUD mis en valeur pendant le conseil */
  target?: () => HTMLElement | null;
}

/** Types ramassés qui ne sont pas de l'équipement */
const NOT_GEAR = new Set(['rune', 'gem', 'potion', 'gold', 'map', 'currency', 'key', 'misc', 'jewel']);

/**
 * Lot 320 (audit 3.14): the waypoint's tip in a town of the Campaign (the Rush's one, "leads to runs. Start with Tristram", is for
 * Harrogath's Rush menu only)
 */
const CAMPAIGN_WAYPOINT = 'Le point de passage (le cercle bleu de la ville) vous emmène aux points de passage déjà touchés de l’acte, et aux actes ouverts.';

/** Mêmes conseils pour la souris et le clavier (mode PC) */
const PC_TIPS: Partial<Record<TipId, string>> = {
  controls: 'Clic gauche : marcher ou attaquer (maintenez pour avancer). Clic droit : compétence de droite. Maj + clic : attaquer sur place. H : tous les raccourcis.',
  skills: 'Nouveau niveau ! Dépensez vos points de compétence : touche S. Survolez une compétence puis F1 à F8 pour l’assigner.',
  stats: 'Vous avez aussi des points de caractéristique (touche C) : la Vitalité donne de la vie, l’Énergie du mana.',
  potion: 'Vie basse : touche 1 pour boire une potion de vie, 2 pour le mana. Les potions ramassées remplissent la ceinture.',
  inventory: 'Objet ramassé ! Touche I pour l’inventaire : clic droit sur un objet pour l’équiper.',
  portal: 'La touche P ouvre (ou déplace) un portail vers Harrogath là où vous êtes : si vous mourez, il vous ramène dans la zone.',
  aim: 'Les compétences F1 à F8 partent vers le curseur de la souris.',
};

export class Tips {
  private card: HTMLElement | null = null;
  private glow: HTMLElement | null = null;
  private hideAt = 0;
  private queue: TipId[] = [];
  private townSince = 0;
  private readonly defs: Record<TipId, TipDef>;

  constructor(
    private readonly root: HTMLElement,
    buttons: { atk: HTMLElement; skills: HTMLElement; char: HTMLElement; inv: HTMLElement; hp: HTMLElement; skill1: HTMLElement | null },
  ) {
    this.defs = {
      controls: { text: 'Glissez le pouce gauche pour vous déplacer. Le grand bouton lance votre sort principal : il vise tout seul l’ennemi le plus proche.', target: () => buttons.atk },
      waypoint: { text: 'Le point de passage (le cercle bleu de la ville) mène aux runs. Commencez par Tristram en Normal.' },
      skills: { text: 'Nouveau niveau ! Dépensez vos points de compétence : bouton Compétences, en haut à droite.', target: () => buttons.skills },
      stats: { text: 'Vous avez aussi des points de caractéristique (bouton Personnage) : la Vitalité donne de la vie, l’Énergie du mana.', target: () => buttons.char },
      potion: { text: 'Vie basse : touchez la potion rouge pour vous soigner. Les potions ramassées remplissent la ceinture.', target: () => buttons.hp },
      inventory: { text: 'Objet ramassé ! Ouvrez l’inventaire pour le comparer à votre équipement et l’équiper.', target: () => buttons.inv },
      runDone: { text: 'Run terminée : le portail vous ramène en ville. Relancez-la au point de passage pour farmer, ou tentez la suivante.' },
      portal: {
        text: 'Le bouton portail ouvre (ou déplace) un portail vers Harrogath là où vous êtes : si vous mourez, il vous ramène dans la zone. Maintenez un bouton de sort pour changer sa compétence.',
      },
      aim: { text: 'Les boutons de sort se visent aussi : touchez puis glissez vers la cible, relâchez pour lancer.', target: () => buttons.skill1 },
    };
  }

  /** Affiche un conseil jamais vu (file d'attente : un seul à la fois) */
  trigger(g: Game, id: TipId): void {
    const s = g.settings;
    if (!s.tips || s.tipsSeen.includes(id) || this.queue.includes(id)) return;
    this.queue.push(id);
  }

  onEvents(g: Game, events: SimEvent[]): void {
    for (const e of events) {
      if (e.t === 'levelUp' && g.character.skillPoints > 0) this.trigger(g, 'skills');
      if (e.t === 'pickup' && !NOT_GEAR.has(e.kind)) this.trigger(g, 'inventory');
      // lot 320 (audit 3.14): no Rush vocabulary in the Campaign (no run to start again there, no portal home)
      if (e.t === 'runComplete' && !g.inCampaignZone()) this.trigger(g, 'runDone');
      // lot 314: no portal at will in a campaign (its button hidden there)
      if (e.t === 'zoneEnter' && g.mode === 'run' && g.portalAllowed()) this.trigger(g, 'portal');
    }
  }

  update(g: Game, now: number, panelOpen: boolean): void {
    const w = g.world;
    const c = g.character;
    if (w.zone.town) {
      if (!this.townSince) this.townSince = now;
      if (now - this.townSince > 1500) this.trigger(g, 'controls');
      if (now - this.townSince > 14000) this.trigger(g, 'waypoint');
    } else {
      this.townSince = 0;
      const p = w.player;
      if (!p.dead && p.hp < p.hpMax * 0.45 && c.belt.some((b) => b.kind === 'heal' && b.qty > 0)) this.trigger(g, 'potion');
      if (c.level >= 3 && c.hotbar.slots.some(Boolean)) this.trigger(g, 'aim');
    }
    if (c.statPoints > 0 && g.settings.tipsSeen.includes('skills')) this.trigger(g, 'stats');
    // affichage : pas pendant qu'un panneau est ouvert
    if (this.card && now > this.hideAt) this.close();
    if (!this.card && this.queue.length && !panelOpen) this.show(g, this.queue.shift()!, now);
  }

  private show(g: Game, id: TipId, now: number): void {
    if (!g.settings.tipsSeen.includes(id)) g.settings.tipsSeen.push(id);
    const pc = document.documentElement.dataset.input === 'pc';
    const base = id === 'waypoint' && g.campaignActive ? { ...this.defs.waypoint, text: CAMPAIGN_WAYPOINT } : this.defs[id];
    const def = pc ? { ...base, text: PC_TIPS[id] ?? base.text, target: PC_TIPS[id] === undefined ? base.target : undefined } : base;
    const ok = el('button', { cls: 'btn', textContent: 'Compris' });
    this.card = el('div', { cls: 'tip-card' }, el('div', { cls: 'tip-title', textContent: 'Conseil' }), el('div', { textContent: def.text }), ok);
    ok.addEventListener('click', () => this.close());
    this.root.appendChild(this.card);
    this.hideAt = now + 9000;
    this.glow = def.target?.() ?? null;
    this.glow?.classList.add('tip-glow');
  }

  close(): void {
    this.card?.remove();
    this.card = null;
    this.glow?.classList.remove('tip-glow');
    this.glow = null;
  }

  /** Réglages : tout revoir */
  reset(g: Game): void {
    g.settings.tipsSeen = [];
    this.queue = [];
    this.townSince = 0;
    this.close();
  }
}
