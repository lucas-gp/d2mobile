/**
 * Quarantaine des objets illisibles au chargement d'une sauvegarde locale (personnage ou coffre partagé). Un objet dont la base est inconnue
 * de ce jeu (objet d'un mod absent, sauvegarde abîmée, version future) faisait planter le chargement ou l'affichage (`baseOf` : « Base
 * inconnue ») ; il est maintenant retiré de son emplacement et rangé, intact, dans `orphans`, sauvegardé avec le reste : rien n'est perdu ni
 * réécrit, et un jeu qui reconnaît de nouveau la base pourra le rendre. Seul ce qui empêcherait de jouer est écarté : un unique, un set,
 * un mot runique ou un affixe inconnus restent ignorés comme avant (l'objet garde sa base et ses autres propriétés).
 * Les sauvegardes IMPORTÉES (fichier choisi par le joueur) restent refusées par `checkSave` (save-check.ts), sans quarantaine.
 */
import { BASE_BY_ID } from '../data/items/bases';
import type { Item } from './item';

/** Objet mis de côté : son emplacement d'origine, la raison et l'objet tel qu'il était dans la sauvegarde */
export interface OrphanItem {
  /** Emplacement d'origine : `equipment.head`, `inventory`, `stash.3`, `merc.mainhand`, `shared.12`… */
  where: string;
  reason: string;
  item: unknown;
}

/** Raison de mettre l'objet en quarantaine, null s'il est utilisable (châsses comprises) */
export function orphanReason(it: unknown, depth = 0): string | null {
  if (!it || typeof it !== 'object' || Array.isArray(it)) return 'pas un objet';
  const x = it as Record<string, unknown>;
  if (typeof x.base !== 'string' || !Object.hasOwn(BASE_BY_ID, x.base)) return `base inconnue : ${String(x.base)}`;
  // châsses absentes : liste vide (réparée sur place) ; présentes mais illisibles : quarantaine
  if (x.socketed === undefined) x.socketed = [];
  if (!Array.isArray(x.socketed)) return 'châsses illisibles';
  if (depth < 3)
    for (const s of x.socketed) {
      const r = orphanReason(s, depth + 1);
      if (r) return `châsse : ${r}`;
    }
  return null;
}

/** Grille (sac, coffre, cube…) : les cases illisibles sont vidées ; `null` reste une case vide */
function sweepCells(cells: unknown, where: string, out: OrphanItem[]): void {
  if (!Array.isArray(cells)) return;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === null || cells[i] === undefined) continue;
    const reason = orphanReason(cells[i]);
    if (reason) {
      out.push({ where, reason, item: cells[i] });
      cells[i] = null;
    }
  }
}

/** Liste sans cases vides (coffre de cartes) : les objets illisibles sont retirés */
function sweepList(list: unknown, where: string, out: OrphanItem[], get: (x: unknown) => unknown = (x) => x): void {
  if (!Array.isArray(list)) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const reason = orphanReason(get(list[i]));
    if (reason) {
      out.unshift({ where, reason, item: list[i] });
      list.splice(i, 1);
    }
  }
}

/** Emplacements nommés (équipement du personnage ou du mercenaire) : les objets illisibles sont retirés */
function sweepSlots(slots: unknown, where: string, out: OrphanItem[]): void {
  if (!slots || typeof slots !== 'object') return;
  const o = slots as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (o[k] === null || o[k] === undefined) continue;
    const reason = orphanReason(o[k]);
    if (reason) {
      out.push({ where: `${where}.${k}`, reason, item: o[k] });
      delete o[k];
    }
  }
}

/**
 * Met en quarantaine les objets illisibles d'une sauvegarde de personnage déjà migrée (modifiée sur place) : équipement, sac, inventaire
 * des charmes, cube, coffre, coffre de cartes, mercenaire, combat en cours (objets au sol, carte). Les objets déjà en quarantaine y restent.
 * Renvoie le nombre d'objets mis de côté à ce chargement (0 pour une sauvegarde valide, qui n'est alors pas touchée).
 */
export function quarantineSave(d: { character?: unknown; run?: unknown; orphans?: OrphanItem[] }): number {
  const out: OrphanItem[] = [];
  const c = d.character as Record<string, unknown> | undefined;
  if (c && typeof c === 'object') {
    sweepSlots(c.equipment, 'equipment', out);
    sweepCells(c.inventory, 'inventory', out);
    sweepCells(c.charmInv, 'charmInv', out);
    sweepCells(c.cube, 'cube', out);
    if (Array.isArray(c.stash)) c.stash.forEach((tab, t) => sweepCells(tab, `stash.${t}`, out));
    sweepList(c.mapStash, 'mapStash', out);
    const merc = c.merc as { equipment?: unknown } | null | undefined;
    if (merc && typeof merc === 'object') sweepSlots(merc.equipment, 'merc', out);
  }
  const run = d.run as { mapItem?: unknown; world?: { items?: unknown } } | null | undefined;
  if (run && typeof run === 'object') {
    if (run.mapItem !== undefined && run.mapItem !== null) {
      const reason = orphanReason(run.mapItem);
      if (reason) {
        out.push({ where: 'run.mapItem', reason, item: run.mapItem });
        delete run.mapItem;
      }
    }
    sweepList(run.world?.items, 'run.ground', out, (x) => (x as { item?: unknown } | null)?.item);
  }
  if (out.length) d.orphans = [...(Array.isArray(d.orphans) ? d.orphans : []), ...out];
  return out.length;
}

/** Même quarantaine pour le coffre partagé (pages `shared.N`) ; renvoie le nombre d'objets mis de côté */
export function quarantineShared(s: { tabs: (Item | null)[][]; orphans?: OrphanItem[] }): number {
  const out: OrphanItem[] = [];
  s.tabs.forEach((tab, t) => sweepCells(tab, `shared.${t}`, out));
  if (out.length) s.orphans = [...(Array.isArray(s.orphans) ? s.orphans : []), ...out];
  return out.length;
}
