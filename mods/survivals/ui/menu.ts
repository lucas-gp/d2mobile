/**
 * Screens of the mode: "How to play" (main menu button, slot `menu.buttons`), the mode's settings page (rule `ui.settings`: its own rows
 * and the few options of the base kept, in the base's settings panel, opened from the hub and the pause) and the pause of a round (HUD's
 * pause button: the bag and the skill tree (lot 292b), settings, leave the round).
 */
import { isRunMode, runInfo } from '../sim/runmode';
import { runLoot } from '../sim/runloot';
import { QUALITY_COLOR } from '../sim/loot';
import { itemName, type Game } from '../../../src/mods/sdk';
import type { HudCtx, SettingsLayout } from '../../../src/mods/api';
import { SETTINGS, type SettingName } from '../sim/state';
import { button, ensureStyle, h } from './dom';

export const HELP_LINES = [
  'Run (par défaut) : un acte par run, du niveau 1, ses zones enchaînées jusqu’au boss de l’acte ou jusqu’à la mort. L’équipement, l’or et les actes ouverts restent d’une run à l’autre.',
  'Campagne (au choix à la création) : le niveau et les compétences restent, une mort ne coûte que la manche.',
  'Chaque manche est une arène taillée dans une zone de l’acte : survivez aux vagues de ses monstres, puis tuez son super-unique.',
  'Le super-unique tué est un point de reprise : la manche suivante s’ouvre et un portail ramène en ville.',
  'À chaque niveau, choisissez une compétence parmi trois cartes de votre arbre (ou gardez le point).',
  'Mourir fait perdre la manche en cours, jamais le niveau, l’équipement ni les points de reprise : on recommence la manche.',
  'Contrôle semi-automatique : le joystick déplace ; à l’arrêt, le personnage attaque et entretient ses sorts tout seul.',
  'Le butin se ramasse en marchant dessus : un objet qui va dans un emplacement vide, ou nettement meilleur que celui porté, est équipé ; le reste part au sac ou en or.',
  'Pas de potion : chaque monstre tué rend un peu de vie et de mana. L’or sert chez le marchand, entre deux manches.',
];

/** "How to play" over the character screen */
export function helpScreen(root: HTMLElement): void {
  ensureStyle();
  const wrap = h('div', { cls: 'sv-screen' });
  const close = () => wrap.remove();
  wrap.append(
    h(
      'div',
      { cls: 'sv-box' },
      h('h2', { cls: 'sv-title', text: 'Survivals : comment jouer' }),
      h('div', { cls: 'sv-help' }, ...HELP_LINES.map((l) => h('p', { text: l }))),
      h('div', { cls: 'sv-row' }, button('Fermer', close, 'primary')),
    ),
  );
  root.append(wrap);
}

const LABELS: Record<SettingName, { title: string; values: Record<string, string> }> = {
  control: { title: 'Contrôle', values: { semi: 'Semi-automatique', auto: 'Automatique' } },
  joystick: { title: 'Joystick', values: { auto: 'Auto (centre en portrait)', left: 'À gauche', center: 'Au centre', right: 'À droite' } },
  cards: { title: 'Cartes de compétence', values: { choose: 'Je choisis', auto: 'Choix automatique' } },
  stats: { title: 'Points de caractéristiques', values: { balanced: 'Équilibré', vitality: 'Vitalité', manual: 'Manuel' } },
  density: { title: 'Monstres vivants au plus', values: { 60: '60', 90: '90', 120: '120' } },
  adaptive: { title: 'Densité adaptative (fluidité)', values: { on: 'Oui', off: 'Non' } },
};

/**
 * Options of the base's settings kept in the mode (lot 286, owner's screenshot: "far fewer settings"), in this order: language, sound,
 * controls (layout, joystick side, vibrations), drawing (quality, damage numbers, screen shake), the character, the app. Hidden: the loot
 * rate, filter and automatic pickup (the mode's loot is picked up by walking over it), durability, respec, potions (none in the mode),
 * zoom and lighting (the mode's camera and arenas), image filters, diagnostics, extra buttons (hidden in a round), confirmations of PD2's
 * crafts, the account, saves, packs and the rest of the help (kept on the main menu and the character list).
 */
export const KEPT_SETTINGS: readonly string[] = ['lang', 'sound', 'music', 'controls', 'leftHanded', 'haptics', 'quality', 'damageNumbers', 'screenShake', 'switchChar', 'install', 'update'];

/** The mode's settings page (rule `ui.settings`): its own rows first, then the base's options kept */
export function settingsLayout(): SettingsLayout {
  return {
    title: 'Survivals',
    keep: KEPT_SETTINGS,
    rows: (Object.keys(LABELS) as SettingName[]).map((key) => ({
      key,
      label: LABELS[key].title,
      values: SETTINGS[key].values.map((v) => [v, LABELS[key].values[String(v)]] as const),
    })),
  };
}

/** Pause of a round (HUD's pause button): the game waits until "Resume" */
export function pauseScreen(ctx: HudCtx): void {
  const g = ctx.game;
  ensureStyle();
  const node = h('div', { cls: 'sv-screen', data: { svScreen: 'pause' } });
  const s = ctx.screen.open(node);
  const draw = () => {
    const options = ctx.host.openPanel
      ? button('Réglages', () => {
          s.close();
          ctx.host.openPanel?.('settings');
        })
      : null;
    if (options) options.dataset.sv = 'options';
    // lot 292b (owner): the bag (the loot, a change of gear) and the skill tree (read only) during a round, the game paused under them
    const panel = (name: 'inventory' | 'skills', label: string) => {
      if (!ctx.host.openPanel) return null;
      const b = button(label, () => {
        s.close();
        ctx.host.openPanel?.(name);
      });
      b.dataset.sv = name;
      return b;
    };
    const bag = panel('inventory', 'Inventaire');
    const tree = panel('skills', 'Compétences');
    const leave = button(isRunMode(g.character) ? 'Abandonner la run' : 'Quitter la manche', () => {
      s.close();
      g.townPortal();
    });
    leave.dataset.sv = 'leave';
    const resume = button('Reprendre la partie', () => s.close(), 'primary');
    resume.dataset.sv = 'resume';
    // lot 298 (owner: "I cannot find how to go back to the character list nor to the home screen"): both, confirmed (a round is going on)
    const nav = leaveButtons(ctx, (text, go) => confirmLeave(text, go));
    node.replaceChildren(
      h(
        'div',
        { cls: 'sv-box' },
        h('h2', { cls: 'sv-title', text: 'Pause' }),
        h('div', { cls: 'sv-row' }, resume, bag, tree, options, leave),
        runLootNote(g),
        nav.length ? h('div', { cls: 'sv-row sv-nav' }, ...nav) : null,
      ),
    );
  };
  /** The confirmation over the pause: what happens to the round, then leave or stay */
  const confirmLeave = (text: string, go: () => void) => {
    const yes = button(text, go, 'primary');
    yes.dataset.sv = 'nav-yes';
    const no = button('Rester', draw);
    no.dataset.sv = 'nav-no';
    node.replaceChildren(
      h(
        'div',
        { cls: 'sv-box', data: { sv: 'nav-confirm' } },
        h('h2', { cls: 'sv-title', text: text }),
        h('p', { cls: 'sv-sub', text: leaveRule(isRunMode(g.character)) }),
        h('div', { cls: 'sv-row' }, no, yes),
      ),
    );
  };
  draw();
}

/**
 * The run's loot in the pause (lot 300, owner: "the items picked up do not show in the inventory during the run"): how many were picked
 * up (in the bag, shown by "Inventaire"), and those kept apart because the bag is full (to the bag or the temporary pages at the run's end)
 */
export function runLootNote(g: Game): HTMLElement | null {
  const info = runInfo(g.character);
  if (!info) return null;
  const apart = runLoot(g.character);
  const head = h('p', {
    cls: 'sv-sub',
    data: { sv: 'run-loot' },
    text: apart.length
      ? `Butin de la run : ${info.items} objet(s) ramassé(s) · sac plein : ${apart.length} en attente (au sac ou aux pages temporaires en fin de run)`
      : `Butin de la run : ${info.items} objet(s) ramassé(s), dans l’inventaire`,
  });
  if (!apart.length) return head;
  return h(
    'div',
    { cls: 'sv-run-loot' },
    head,
    h(
      'p',
      { cls: 'sv-sub', data: { sv: 'run-loot-list' } },
      ...apart.slice(-12).map((it, i) => h('span', { text: `${i ? ' · ' : ''}${itemName(it)}`, style: { color: QUALITY_COLOR[it.quality] ?? '' } })),
    ),
  );
}

/** What leaving a round in progress does (the rules of the mode: a Run starts again from 0, a Campaign round is resumed) */
export function leaveRule(run: boolean): string {
  return run
    ? 'La run en cours sera abandonnée : le butin ramassé est gardé, la prochaine run repart du niveau 1, de la première zone.'
    : 'La manche en cours est enregistrée : elle reprendra là où vous l’avez laissée.';
}

/**
 * "Choix du personnage" and "Écran d'accueil" (lot 298): the base's character list or home screen, after the save. `ask` confirms first
 * (the pause: a round is going on), absent in the hub (nothing to lose)
 */
export function leaveButtons(ctx: HudCtx, ask?: (text: string, go: () => void) => void): HTMLButtonElement[] {
  const out: HTMLButtonElement[] = [];
  const add = (label: string, sv: string, go: (() => void) | undefined) => {
    if (!go) return;
    const b = button(label, () => (ask ? ask(label, go) : go()));
    b.dataset.sv = sv;
    out.push(b);
  };
  add('Choix du personnage', 'to-chars', ctx.host.characterList ? () => ctx.host.characterList?.() : undefined);
  add('Écran d’accueil', 'to-home', ctx.host.homeScreen ? () => ctx.host.homeScreen?.() : undefined);
  return out;
}
