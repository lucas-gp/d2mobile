/**
 * Controls of the base's HUD a game mode may hide (rule `ui.hudHidden`, lot 285: Survivals keeps the joystick, the attack and the skills
 * bound, its pause button and the HUD's gauges). Hidden by one style sheet rewritten when the list changes (never per frame); without a
 * mode the list is empty and the sheet too: the base's HUD is unchanged.
 */

/** Name → selector in the HUD (`#hud`) */
export const HUD_PARTS: Readonly<Record<string, string>> = {
  character: '[data-testid="character"]',
  inventory: '[data-testid="inventory"]',
  skills: '[data-testid="skills"]',
  portal: '[data-testid="portal"]',
  settings: '[data-testid="settings"]',
  potions: '[data-testid="potion-hp"], [data-testid="potion-mp"], [data-testid="potion-rejuv"], [data-testid="throw-potion"], [data-testid^="pc-potion-"], [data-testid="pc-throw"]',
  page: '[data-testid="page"]',
  /** Skill buttons with no skill bound (touch slots, PC slots) */
  'empty-skills': '.sbtn:not(.main):not(.small):not([data-skill]), [data-testid^="pc-slot"]:not([data-skill])',
  context: '[data-testid="context"]',
  /** The death notice ("You are dead, back to town, a portal will bring you back": lot 288, a mode with its own) */
  death: '.death',
  /** The attack button (lot 288: a game mode that attacks on its own) */
  attack: '[data-testid="attack"]',
  /** Touch skill buttons with a skill bound (lot 288: a mode whose brain casts them) */
  'bound-skills': '.sbtn[data-skill]:not(.main):not(.small)',
  image: '[data-testid="image-quality"]',
  walk: '[data-testid="walk"]',
  tips: '.tip-card:not(.update-card)',
  /** The mouse controls' bar (left and right click skills, F1-F8 slots, belt: lot 294, a mode that casts every skill on its own) */
  pcbar: '[data-testid="pcbar"]',
  /** The mana gauge: bar, Diablo II's globe, the PC bar's orb (lot 294: a game mode whose skills cost no mana) */
  mana: '.bar.mana, .orb.mana, .pcorb.mana',
  /** The level and zone's line beside the life gauge (lot 301: a game mode with its own zone title) */
  level: '.lvl',
};

/** Style sheet hiding `names` (unknown names ignored) */
export function hudHiddenCss(names: readonly string[]): string {
  const sel = names
    .map((n) => HUD_PARTS[n])
    .filter((s): s is string => !!s)
    .flatMap((s) => s.split(',').map((x) => `#hud ${x.trim()}`));
  return sel.length ? `${sel.join(',\n')} { display: none !important; }` : '';
}

let lastKey = '';

/** Applies the list (the sheet is rewritten only when it changes) */
export function applyHudHidden(names: readonly string[]): void {
  const key = names.join(',');
  if (key === lastKey) return;
  lastKey = key;
  let s = document.getElementById('hud-hidden') as HTMLStyleElement | null;
  if (!s) {
    if (!names.length) return;
    s = document.createElement('style');
    s.id = 'hud-hidden';
    document.head.append(s);
  }
  s.textContent = hudHiddenCss(names);
}
