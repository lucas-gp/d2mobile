/** Écrans de sélection des personnages (classique et Diablo II) : ce qu'ils savent des jeux de règles et des mods (src/mods). */
import type { MenuButton } from '../mods/ui';
import { charsForMode, launchModes, modeKinds, showModeChoice, variantsOf, type CreateOptions, type LaunchMode, type ModeKind } from './charselect-core';
import { el } from './dom';
import type { CharSummary } from '../platform/platform';

/** Ce que l'écran de sélection sait des jeux de règles et des mods (fourni par l'application : src/mods) */
export interface ScreenMods {
  /** Jeux de règles de contenu et modes de jeu proposés à la création */
  options: CreateOptions;
  /** Pourquoi un personnage ne peut pas être joué dans cette version (null : jouable) ; il reste grisé, jamais modifié */
  problem(ruleset: string): string | null;
  /** Boutons du menu ajoutés par les mods (point d'insertion `menu.buttons`) */
  menu: readonly MenuButton[];
  /** Erreur d'un bouton de mod (journal d'erreurs) */
  onError?(e: unknown): void;
  /** Mode of the page session (full ruleset id): its characters are listed, new characters are created in it */
  mode?: string;
  /**
   * The player picked a mode at launch: true when it is the session's mode (the screen goes on to the list), false when the page reloads
   * to activate it (the mode is remembered and the list opens after the reload)
   */
  switchMode?(id: string): boolean;
  /** Open the character list directly (the page has just reloaded for the mode the player picked) */
  openList?: boolean;
  /** Lot 299: a mode's lines on a character's card (slot `charselect.card`; null: the base's level and difficulty) */
  card?(c: CharSummary): string[] | null;
}

export const NO_MODS: ScreenMods = { options: { contents: [], modes: [] }, problem: () => null, menu: [] };

/** Modes offered at launch (empty or one: no choice) */
export function screenModes(mods: ScreenMods): LaunchMode[] {
  return launchModes(mods.options);
}

/** Lot 318: the same modes grouped by kind (Normal, Survivals) for the home screen in two steps */
export function screenKinds(mods: ScreenMods): ModeKind[] {
  return modeKinds(mods.options);
}

/** Characters listed in the session's mode (every character when there is no choice of mode) */
export function listedChars<T extends { ruleset: string }>(chars: readonly T[], mods: ScreenMods): T[] {
  const modes = screenModes(mods);
  return charsForMode(chars, mods.mode ?? modes[0]?.id ?? '', modes, (r) => mods.problem(r));
}

/** Nom affiché du jeu de règles d'un personnage (contenu, puis modes de jeu) */
export function rulesetLabel(o: CreateOptions, ruleset: string): string {
  const [content, ...modes] = ruleset.split('+');
  return [o.contents.find((c) => c.id === content)?.name ?? content, ...modes.map((m) => o.modes.find((x) => x.id === m)?.name ?? m)].join(' — ');
}

export { showModeChoice };

/** Boutons des mods (point d'insertion `menu.buttons`) : une erreur est journalisée, l'écran reste */
export function modMenuButtons(mods: ScreenMods, root: HTMLElement, refresh: () => void, make: (label: string, run: () => void) => HTMLElement): HTMLElement[] {
  return mods.menu.map((b) =>
    make(b.label, () => {
      try {
        void Promise.resolve(b.run({ root, refresh })).catch((e: unknown) => (mods.onError ?? console.error)(e));
      } catch (e) {
        (mods.onError ?? console.error)(e);
      }
    }),
  );
}

/**
 * Variants of the session's game mode on the creation screen (lot 289, `ModManifest.variants`: Survivals' "Run" and "Campaign"): one
 * toggle a variant, the first picked, and its description; null when the mode has none (the screens stay as before)
 */
export function variantPicker(mods: ScreenMods, cls: string): { el: HTMLElement; value(): string } | null {
  const list = variantsOf(mods.options, mods.mode);
  if (!list.length) return null;
  let picked = list[0].id;
  const desc = el('div', { cls: 'cs-variant-desc' });
  const row = el('div', { cls: 'cs-variant-row' });
  const box = el('div', { cls: `cs-variants ${cls}`, data: { variants: list.map((v) => v.id).join(',') } }, row, desc);
  const draw = () => {
    row.replaceChildren(
      ...list.map((v) => {
        const b = el('button', { cls: `btn cs-variant${v.id === picked ? ' sel primary' : ''}`, textContent: v.name, data: { variant: v.id } });
        b.type = 'button';
        b.setAttribute('aria-pressed', String(v.id === picked));
        b.addEventListener('click', () => {
          picked = v.id;
          draw();
        });
        return b;
      }),
    );
    desc.textContent = list.find((v) => v.id === picked)?.description ?? '';
  };
  draw();
  return { el: box, value: () => picked };
}
