/** Types et règles partagées des écrans de choix de personnage (classique et Diablo II) : module feuille. */
import type { ClassId } from '../data/classes';

export const NAME_MAX = 16;

/** `ruleset` : identifiant complet du jeu de règles du nouveau personnage (contenu et modes de jeu, src/mods/activate.ts `rulesetId`) ; vide : celui de la session */
export type CharChoice = { play: string } | { create: { classId: ClassId; name: string; ruleset: string; variant?: string } };

/** Pseudo : lettres, chiffres, espaces, tirets et apostrophes, 16 caractères au plus */
export function cleanName(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N} '’-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

/** Un jeu de règles de contenu ou un mode de jeu proposé à la création */
export interface CreateOption {
  id: string;
  name: string;
  description?: string;
  /** Lot 318: a few words under its button on the home screen */
  tagline?: string;
  /** Mode de jeu : jeux de règles de contenu acceptés (absent : tous) */
  rulesets?: readonly string[];
  /** Game mode: variants offered at creation, the first by default (lot 289, `ModManifest.variants`) */
  variants?: readonly { id: string; name: string; description?: string }[];
}

/** Variants of the game mode of a full ruleset id (`d2+survivals`): the creation screen offers them (none: no choice) */
export function variantsOf(o: CreateOptions, ruleset: string | undefined): readonly { id: string; name: string; description?: string }[] {
  const mode = ruleset?.split('+')[1];
  return (mode && o.modes.find((m) => m.id === mode)?.variants) || [];
}

/** Choix proposés à la création : jeux de règles de contenu jouables (le défaut d'abord) et modes de jeu */
export interface CreateOptions {
  contents: CreateOption[];
  modes: CreateOption[];
  /** false: the Campaign cannot be played (no Diablo II files), Normal is the endgame only */
  campaign?: boolean;
}

/** A mode offered at launch: a playable content ruleset, alone or with a game mode (`id`: full ruleset id, `pd2`, `d2+survivals`) */
export interface LaunchMode {
  id: string;
  name: string;
  description?: string;
}

/** Modes offered at launch: each playable content ruleset (the default first), then each game mode on each content it accepts */
export function launchModes(o: CreateOptions): LaunchMode[] {
  const out: LaunchMode[] = o.contents.map((c) => ({ id: c.id, name: c.name, ...(c.description ? { description: c.description } : {}) }));
  for (const c of o.contents)
    for (const m of modesFor(o, c.id)) {
      const description = [c.description, m.description].filter(Boolean).join(' ');
      out.push({ id: `${c.id}+${m.id}`, name: `${c.name} — ${m.name}`, ...(description ? { description } : {}) });
    }
  return out;
}

/** The choice of a mode is shown only when there is more than one (otherwise the screens behave as before: one list, every character) */
export function showModeChoice(modes: readonly LaunchMode[]): boolean {
  return modes.length > 1;
}

/** Lot 318: one choice of the home screen in two steps (a kind of game, then the game it is played on): its label and a few words */
export interface ModeChoice {
  id: string;
  name: string;
  tagline?: string;
}

/** A kind of game (Normal: the contents alone; or a game mode, Survivals) and the modes it gathers, one per content (`id`: full ruleset id) */
export interface ModeKind extends ModeChoice {
  modes: ModeChoice[];
}

/** Id of the kind "Normal" (the contents without a game mode) */
export const NORMAL_KIND = 'normal';

/**
 * Lot 318 (owner: "two categories, Survivals or Normal, then Diablo II original or Project Diablo 2"): the modes of `launchModes`
 * grouped by kind, in the same order (Normal first, then each game mode on at least one content); the same ids, saves and links
 */
export function modeKinds(o: CreateOptions): ModeKind[] {
  const base = (c: CreateOption, id: string): ModeChoice => ({ id, name: c.name, ...(c.tagline ? { tagline: c.tagline } : {}) });
  const out: ModeKind[] = [];
  if (o.contents.length) out.push({ id: NORMAL_KIND, name: 'Normal', tagline: o.campaign === false ? 'Fin de jeu' : 'Campagne et fin de jeu', modes: o.contents.map((c) => base(c, c.id)) });
  for (const m of o.modes) {
    const modes = o.contents.filter((c) => modesFor(o, c.id).includes(m)).map((c) => base(c, `${c.id}+${m.id}`));
    if (modes.length) out.push({ id: m.id, name: m.name, ...(m.tagline ? { tagline: m.tagline } : {}), modes });
  }
  return out;
}

/** Kind of a full ruleset id (`pd2+survivals` → `survivals`, `d2` → Normal) */
export function kindOf(id: string): string {
  return id.split('+').slice(1).join('+') || NORMAL_KIND;
}

/** The home screen asks the kind first only when there is more than one (otherwise one button per mode, as before) */
export function showKindChoice(kinds: readonly ModeKind[]): boolean {
  return kinds.length > 1;
}

/** Modes de jeu qui se posent sur ce contenu */
export function modesFor(o: CreateOptions, content: string): CreateOption[] {
  return o.modes.filter((m) => !m.rulesets || m.rulesets.includes(content));
}

/** Minimal view of a character for the per-mode list */
export interface RulesetOf {
  ruleset: string;
}

/**
 * Characters listed in a mode: those of that exact ruleset. A character that cannot be played in this version (mod missing: `problem`)
 * is listed, greyed, in the mode of its content ruleset when that mode exists, otherwise in the first mode, so that it is never hidden
 * (and never deleted nor migrated). With a single mode, every character is listed.
 */
export function charsForMode<T extends RulesetOf>(chars: readonly T[], mode: string, modes: readonly LaunchMode[], problem: (ruleset: string) => string | null): T[] {
  if (!showModeChoice(modes)) return [...chars];
  const ids = modes.map((m) => m.id);
  return chars.filter((c) => {
    if (c.ruleset === mode) return true;
    if (!problem(c.ruleset)) return false;
    const content = c.ruleset.split('+')[0];
    return (ids.includes(content) ? content : ids[0]) === mode;
  });
}

/** Display name of a mode (its id when it is not offered in this version) */
export function modeName(modes: readonly LaunchMode[], id: string): string {
  return modes.find((m) => m.id === id)?.name ?? id;
}
