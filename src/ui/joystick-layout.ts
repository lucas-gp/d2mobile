/**
 * Place of the floating joystick chosen by a game mode (rule `ui.joystick`, lot 287) and the layout of the round buttons that goes with it.
 * Pure functions read by the HUD (`Hud.relayout`); without a mode (place null) the base's layout is untouched: the joystick's zone is the
 * style sheet's (the left 45 % of the screen, the right one for a left-handed player) and the buttons keep their arc.
 */
import type { JoystickPlace } from '../mods/rules';

/** Share of the screen's height above the joystick's zone (the zone is the lower two thirds) */
export const JOY_ZONE_TOP = 1 / 3;
/** Share of the width of a side zone (`left`, `right`) */
export const JOY_SIDE_WIDTH = 0.5;

/** Inline style of the joystick's zone: null for the base's (style sheet) */
export function joystickZoneStyle(place: JoystickPlace | null, W: number, H: number, sat: number): { left: string; right: string; top: string; width: string } | null {
  if (!place) return null;
  const top = `${Math.round(Math.max(sat + 64, H * JOY_ZONE_TOP))}px`;
  if (place === 'center') return { left: '0', right: '0', top, width: 'auto' };
  const width = `${Math.round(W * JOY_SIDE_WIDTH)}px`;
  return place === 'left' ? { left: '0', right: 'auto', top, width } : { left: 'auto', right: '0', top, width };
}

/** Are the attack and skill buttons on the left of the screen? Opposite the joystick's side, else the left-handed setting */
export function buttonsOnLeft(place: JoystickPlace | null, leftHanded: boolean): boolean {
  if (place === 'right') return true;
  if (place === 'left') return false;
  return leftHanded;
}

/**
 * Skill buttons in a column above the attack (or in its place when it is hidden), at the screen's edge (portrait with the joystick in the centre: the base's arc reaches the
 * middle of a phone held upright, where the thumb moves); `ax`, `ay` the attack's centre, `s` the HUD's scale. Null: the base's arc.
 */
export function skillColumn(place: JoystickPlace | null, portrait: boolean, ax: number, ay: number, s: number, attackHidden = false): { x: number; y: number; r: number }[] | null {
  if (place !== 'center' || !portrait) return null;
  // the attack hidden by the mode (it attacks on its own: rule `ui.hudHidden`, lot 288): the column starts in its place
  const first = attackHidden ? ay + 12 * s : ay - (42 + 14 + 30) * s;
  return [0, 1, 2, 3].map((i) => ({ x: ax, y: first - i * 72 * s, r: 30 * s }));
}
