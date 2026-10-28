/**
 * The hero's real numbers (lot 292, the study: the other game has neither a stat sheet nor a comparison; ours has both): rows added to the
 * comparison of an item with the worn one (rule `ui.compareRows`: the weapon's damage, the attack speed, the damage reduction, the block;
 * green better, red worse in the base's tooltip), and a section of the character sheet (slot `character.sheet`): life, resistances, damage
 * reduction, damage, speeds, and in Run mode the gear's power and the endgame tier.
 */
import { computeDerived, type CharacterState, type DerivedStats, type Game } from '../../../src/mods/sdk';
import { gearScore } from '../sim/loot';
import { isRunMode } from '../sim/runmode';
import { endgameTier } from '../sim/shop';
import { h } from './dom';

type Row = { label: string; delta: number; unit: string };

const avgDmg = (d: DerivedStats): number => (d.weaponDmg[0] + d.weaponDmg[1]) / 2;

/** The comparison's rows with the mode's own first: the weapon's damage and attack speed, then the base's, then the damage reduction and the block */
export function compareRows(a: DerivedStats, b: DerivedStats, rows: Row[]): Row[] {
  const out: Row[] = [];
  const add = (to: Row[], label: string, x: number, y: number, unit = '') => {
    const d = Math.round((y - x) * 10) / 10;
    if (d !== 0) to.push({ label, delta: d, unit });
  };
  add(out, 'Dégâts (arme)', avgDmg(a), avgDmg(b));
  add(out, "Vitesse d'attaque", a.ias, b.ias, ' %');
  const tail: Row[] = [];
  add(tail, 'Réduction des dégâts', a.dr, b.dr, ' %');
  add(tail, 'Réduction fixe', a.drFlat, b.drFlat);
  add(tail, 'Blocage', a.block, b.block, ' %');
  return [...out, ...rows, ...tail];
}

export const TIER_NAMES = ['Normal', 'Cauchemar', 'Enfer', 'Enfer vaincu'];

/** Power of the gear: what it adds to the naked hero (`gearScore`), one number */
export function gearPower(c: CharacterState): number {
  const naked = gearScore(computeDerived({ ...c, equipment: {} }, 0));
  return Math.max(0, Math.round(gearScore(computeDerived(c, 0)) - naked));
}

/** Endgame tier (Act I's difficulty open, the farm) and the gear's power, one line (the hub, the sheet) */
export function tierLine(c: CharacterState): string {
  return `Palier : ${TIER_NAMES[endgameTier(c)]} · Puissance de l’équipement ${gearPower(c)}`;
}

/** Section of the character sheet: the numbers that keep the hero alive and those that kill */
export function gearSheet(g: Game): HTMLElement | null {
  const c = g.character;
  const d = g.world?.player?.d ?? computeDerived(c, 0);
  const r = (label: string, v: string) => h('div', { cls: 'statrow' }, h('span', { text: label }), h('b', { text: v }));
  const rows = [
    r('Vie', String(Math.round(d.lifeMax))),
    r('Résistances feu / froid / foudre / poison', `${d.res.fire} / ${d.res.cold} / ${d.res.light} / ${d.res.poison} %`),
    r('Réduction des dégâts', `${d.dr} % · ${d.drFlat} fixe`),
    r('Défense · blocage', `${Math.round(d.defense)} · ${d.block} %`),
    r("Dégâts de l'arme", `${Math.round(d.weaponDmg[0])}-${Math.round(d.weaponDmg[1])}`),
    r("Vitesse d'attaque · d'incantation", `${d.ias} % · ${d.fcr} %`),
    r('Vitesse de course', `${d.frw} %`),
  ];
  return h(
    'div',
    { cls: 'col', data: { sv: 'sheet' } },
    h('div', { cls: 'lvl', text: 'Survivals' }),
    ...rows,
    isRunMode(c) ? h('div', { cls: 'base', data: { sv: 'tier' }, text: tierLine(c) }) : null,
  );
}
