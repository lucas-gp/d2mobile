/**
 * Place of the floating joystick in the mode (rule `ui.joystick`, lot 287, owner's test in portrait: "the movement control must be able
 * to be at the centre of the screen"): the joystick appears where the thumb touches. Automatic: anywhere in the lower two thirds of a
 * screen held upright (the attack and skills in a column at the edge), the thumb's side in landscape (left, right for a left-handed
 * player, as the base). Left, centre or right: the player's choice (the mode's settings), the buttons on the other side.
 */
import type { JoystickPlace } from '../../../src/mods/api';
import type { Game } from '../../../src/mods/sdk';
import { setting } from '../sim/state';

export function joystickPlace(g: Game, view: { width: number; height: number; leftHanded: boolean }): JoystickPlace {
  const v = setting(g, 'joystick');
  if (v === 'left' || v === 'center' || v === 'right') return v;
  if (view.height > view.width) return 'center';
  return view.leftHanded ? 'right' : 'left';
}
