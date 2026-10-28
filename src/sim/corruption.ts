/**
 * Corruption PD2 (Éclat de Pierre-Monde) : issue unique et définitive (mods/pd2/docs/ETUDE-PD2.md §5.2).
 *  - base normale pouvant avoir des châsses : 50 % châsses au maximum de la base / 50 % « brique »
 *  - base normale sans châsse possible : 50 % brique / 50 % rien
 *  - autre objet pouvant recevoir des châsses (0 châsse) : 25 % châsses / 50 % propriété / 25 % brique
 *  - autre objet sans châsse possible (bijoux, gants, bottes, ceintures, objets sertis) : 75 % propriété / 25 % brique
 * Brique : l'objet devient un rare aléatoire de même base (éthéré conservé) et reçoit EN PLUS
 * une corruption (châsses ou propriété). Choix mobile : l'état corrompu bloque les recettes,
 * pas le sertissage dans les châsses existantes.
 */
import type { Rng } from '../core/rng';
import { corruptionTableFor } from '../data/corruption';
import { typeMatches } from '../data/types';
import type { Item, RolledMod } from './item';
import { baseOf } from './itemstats';
import { generateItem, maxSocketsForIlvl, rollValues } from './loot/itemgen';

function canHaveSockets(it: Item): boolean {
  const b = baseOf(it);
  return b.maxSockets > 0 && it.sockets === 0 && typeMatches(b.type, ['weapon', 'armor', 'shield', 'helm', 'circlet']);
}

/** Nombre de châsses d'une corruption sur un objet non normal (§5.2) */
function socketCount(rng: Rng, it: Item): number {
  const b = baseOf(it);
  const cap = Math.max(1, maxSocketsForIlvl(b, it.ilvl));
  let n: number;
  if (typeMatches(b.type, ['weapon'])) n = b.twoHanded ? rng.weighted([3, 4, 5, 6], (v) => [30, 28, 24, 18][v - 3])! : rng.weighted([2, 3, 4], (v) => [48, 28, 24][v - 2])!;
  else n = rng.weighted([1, 2, 3], (v) => [48, 28, 24][v - 1])!;
  return Math.min(cap, n);
}

function rollMod(rng: Rng, it: Item): { mods: RolledMod[]; tier: string } | null {
  const b = baseOf(it);
  const t = corruptionTableFor(b.type, typeMatches(b.type, ['weapon']));
  if (!t) return null;
  const x = rng.next();
  const col = x < t.odds[0] ? 'weak' : x < t.odds[0] + t.odds[1] ? 'medium' : 'strong';
  const line = rng.pick(t[col]);
  const values = rollValues(rng, line);
  return { mods: line.map((m, i) => ({ stat: m.stat, value: values[i] })), tier: col };
}

/** Probabilités d'issue (somme = 1) de la corruption d'un objet, selon les règles ci-dessus (carte : toujours une propriété) */
export function corruptionOdds(it: Item): { sockets: number; mod: number; brick: number; none: number } {
  if (it.map) return { sockets: 0, mod: 1, brick: 0, none: 0 };
  const normal = it.quality === 'normal' || it.quality === 'superior' || it.quality === 'low';
  if (normal) return canHaveSockets(it) ? { sockets: 0.5, mod: 0, brick: 0.5, none: 0 } : { sockets: 0, mod: 0, brick: 0.5, none: 0.5 };
  return canHaveSockets(it) ? { sockets: 0.25, mod: 0.5, brick: 0.25, none: 0 } : { sockets: 0, mod: 0.75, brick: 0.25, none: 0 };
}

/** Corrompt l'objet en place ; renvoie le texte de l'issue. */
export function corruptItem(rng: Rng, it: Item): string {
  const b = baseOf(it);
  const normal = it.quality === 'normal' || it.quality === 'superior' || it.quality === 'low';
  const x = rng.next();
  const apply = (kind: 'sockets' | 'mod'): string => {
    if (kind === 'sockets') {
      const n = normal ? Math.max(1, maxSocketsForIlvl(b, it.ilvl)) : socketCount(rng, it);
      it.corrupted = { ...(it.corrupted ?? { outcome: 'sockets', mods: [] }), outcome: it.corrupted?.bricked ? 'brick+sockets' : 'sockets', addSockets: n - it.sockets };
      it.sockets = n;
      return `${n} châsse${n > 1 ? 's' : ''}`;
    }
    const m = rollMod(rng, it);
    it.corrupted = { ...(it.corrupted ?? { outcome: 'mod', mods: [] }), outcome: it.corrupted?.bricked ? 'brick+mod' : 'mod', mods: m?.mods ?? [] };
    return m ? `propriété de corruption (${m.tier === 'weak' ? 'faible' : m.tier === 'medium' ? 'moyenne' : 'forte'})` : 'aucun effet';
  };
  const brick = (): string => {
    const fresh = generateItem(rng, it.base, it.ilvl, { forceQuality: 'rare' });
    const keepUid = it.uid;
    const eth = it.ethereal;
    for (const k of Object.keys(it) as (keyof Item)[]) delete (it as unknown as Record<string, unknown>)[k];
    Object.assign(it, fresh, { uid: keepUid, ethereal: eth });
    it.corrupted = { outcome: 'brick', mods: [], bricked: true };
    // la brique reçoit en plus une corruption
    const extra = canHaveSockets(it) && rng.chance(1 / 3) ? apply('sockets') : apply('mod');
    return `objet transformé en rare (+ ${extra})`;
  };
  if (normal) {
    if (canHaveSockets(it)) return x < 0.5 ? apply('sockets') : brick();
    if (x < 0.5) {
      it.corrupted = { outcome: 'none', mods: [] };
      return 'aucun effet';
    }
    return brick();
  }
  if (canHaveSockets(it)) return x < 0.25 ? apply('sockets') : x < 0.75 ? apply('mod') : brick();
  return x < 0.75 ? apply('mod') : brick();
}

/** Profanation (Lucion) : seconde corruption d'une amulette déjà corrompue ; échec = jeton perdu, amulette inchangée */
export function desecrateItem(rng: Rng, it: Item, chance: number): string {
  if (!it.corrupted) return 'amulette non corrompue';
  if (!rng.chance(chance)) return 'la profanation échoue';
  const m = rollMod(rng, it);
  it.corrupted.desecrated = true;
  if (!m) return 'aucun effet';
  it.corrupted.mods = [...it.corrupted.mods, ...m.mods];
  return `seconde corruption (${m.tier === 'weak' ? 'faible' : m.tier === 'medium' ? 'moyenne' : 'forte'})`;
}

/** Propriétés possibles de l'Annihilus corrompu par l'Éclat souillé (une seule, tirée au hasard) */
const TAINT_LINES: { stat: string; min: number; max: number }[][] = [
  [{ stat: 'allSkills', min: 1, max: 1 }],
  [{ stat: 'resAll', min: 5, max: 10 }],
  [{ stat: 'life', min: 40, max: 80 }],
  [{ stat: 'xpPct', min: 5, max: 10 }],
  [{ stat: 'mf', min: 15, max: 30 }],
];

/** Éclat souillé de Rathma : corrompt Annihilus en lui ajoutant une propriété définitive */
export function taintAnnihilus(rng: Rng, it: Item): string {
  const line = rng.pick(TAINT_LINES);
  it.corrupted = { outcome: 'mod', mods: line.map((m) => ({ stat: m.stat, value: rng.range(m.min, m.max) })), tainted: true };
  return 'Annihilus corrompu';
}
