/**
 * Registre typé d'une table de jeu (bases, uniques, mots runiques, recettes du Cube, runs…), posé SUR les tables existantes : le tableau
 * (ordre de tirage, d'affichage) et l'index par identifiant (`*_BY_ID`) restent les objets que le reste du code importe, et chaque
 * opération les modifie sur place, en gardant leur identité. Les entrées présentes à la création appartiennent à la base.
 *
 * Règles (voir README.md) : un ajout sur un identifiant existant, un patch ou un retrait sur un identifiant absent sont des
 * erreurs ; une entrée ajoutée par un mod porte son espace de noms (`<mod>:<id>`), sauf identifiant historique déclaré ; deux mods qui
 * patchent le même champ de la même entrée sont en conflit, sauf `override`. Après le gel (fin de l'activation), plus aucune modification.
 * Module feuille : n'importe rien.
 */

/** Identifiant de la base (le jeu sans mod) : propriétaire des entrées d'origine */
export const BASE_MOD_ID = 'base';

/** Modification refusée : message en français, nom du registre et identifiant en tête */
export class RegistryError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'RegistryError';
  }
}

export interface RegistryHooks<T> {
  /** Index secondaire à tenir à jour (ex. runes par nom) : appelé à l'ajout (true), au retrait (false), et des deux côtés d'un patch */
  index?: (entry: T, present: boolean) => void;
  /** Champs dont dépend l'index secondaire : un patch qui n'en touche aucun ne le recalcule pas (l'ordre de ses clés ne bouge pas) */
  indexFields?: readonly string[];
}

export class Registry<T extends { id: string }> {
  /** Propriétaire de chaque entrée : `base` ou l'identifiant du mod qui l'a ajoutée */
  private readonly owners = new Map<string, string>();
  /** Champs déjà patchés par un mod : identifiant → champ → mod */
  private readonly patched = new Map<string, Map<string, string>>();
  private frozen = false;

  /**
   * `list` : la table ordonnée (null : table sans ordre, index seul) ; `byId` : son index. L'index peut contenir des entrées absentes de la
   * table (affixes historiques, familiers et mercenaires parmi les monstres) : elles sont lisibles et appartiennent aussi à la base.
   */
  constructor(
    readonly name: string,
    private readonly list: T[] | null,
    private readonly byId: Record<string, T>,
    private readonly hooks: RegistryHooks<T> = {},
  ) {
    for (const id of Object.keys(byId)) this.owners.set(id, BASE_MOD_ID);
    if (list) for (const e of list) this.owners.set(e.id, BASE_MOD_ID);
  }

  get size(): number {
    return this.list ? this.list.length : Object.keys(this.byId).length;
  }
  has(id: string): boolean {
    return Object.hasOwn(this.byId, id);
  }
  get(id: string): T | undefined {
    return this.has(id) ? this.byId[id] : undefined;
  }
  /** Identifiants dans l'ordre de la table (ou de l'index pour une table sans ordre, dont les entrées peuvent ne pas porter `id`) */
  ids(): string[] {
    return this.list ? this.list.map((e) => e.id) : Object.keys(this.byId);
  }
  /** Entrées dans l'ordre de la table (lecture seule) */
  all(): readonly T[] {
    return this.list ?? Object.values(this.byId);
  }
  /** Propriétaire d'une entrée (`base` ou un mod), undefined si absente */
  ownerOf(id: string): string | undefined {
    return this.owners.get(id);
  }
  get isFrozen(): boolean {
    return this.frozen;
  }

  private check(mod: string, what: string, id: string): void {
    if (this.frozen) throw new RegistryError(`Registre « ${this.name} » gelé : ${what} de « ${id} » par « ${mod} » refusé après l'activation`);
  }

  /**
   * Ajoute une entrée en fin de table, ou juste après (`at.after`) / avant (`at.before`) une entrée existante : la table ET l'ordre des
   * clés de l'index suivent cette position (un contenu déplacé de la base vers un mod garde exactement son ordre de tirage et d'affichage).
   * `legacy` : identifiants historiques admis sans espace de noms pour ce mod.
   */
  add(mod: string, entry: T, legacy?: ReadonlySet<string>, at: { after?: string; before?: string } = {}): void {
    const id = entry.id;
    this.check(mod, 'ajout', id);
    if (this.has(id)) throw new RegistryError(`Registre « ${this.name} » : « ${id} » existe déjà (ajout par « ${mod} »)`);
    if (mod !== BASE_MOD_ID && !id.startsWith(`${mod}:`) && !legacy?.has(id)) throw new RegistryError(`Registre « ${this.name} » : « ${id} » ajouté par « ${mod} » doit commencer par « ${mod}: »`);
    const anchor = at.after ?? at.before;
    if (anchor === undefined) {
      this.list?.push(entry);
      this.byId[id] = entry;
    } else {
      const a = this.get(anchor);
      if (!a || (at.after !== undefined && at.before !== undefined))
        throw new RegistryError(`Registre « ${this.name} » : position d'ajout de « ${id} » invalide (« ${anchor} » absent, ou after et before ensemble)`);
      const after = at.after !== undefined;
      if (this.list) {
        const i = this.list.indexOf(a);
        if (i < 0) throw new RegistryError(`Registre « ${this.name} » : « ${anchor} » hors de la table, position d'ajout de « ${id} » impossible`);
        this.list.splice(after ? i + 1 : i, 0, entry);
      }
      // index : les clés qui suivent la position sont réinsérées après la nouvelle (ordre d'insertion des clés = ordre d'itération)
      const keys = Object.keys(this.byId);
      const k = keys.indexOf(anchor) + (after ? 1 : 0);
      const tail = keys.slice(k).map((key) => [key, this.byId[key]] as const);
      for (const [key] of tail) delete this.byId[key];
      this.byId[id] = entry;
      for (const [key, e] of tail) this.byId[key] = e;
    }
    this.owners.set(id, mod);
    this.hooks.index?.(entry, true);
  }

  /**
   * Remplace des champs d'une entrée existante, sur place (l'identifiant ne change jamais) : un champ déjà présent garde sa place dans
   * l'objet, un champ nouveau s'ajoute à la fin, un champ à `undefined` est retiré (patch d'une table vanilla : champ absent du mod).
   * `keyOrder` : ordre final des champs de l'entrée (mêmes champs), quand un champ ajouté prend place au milieu de l'objet.
   */
  patch(mod: string, id: string, fields: Partial<T>, opts: { override?: boolean; keyOrder?: readonly string[] } = {}): void {
    this.check(mod, 'patch', id);
    const e = this.get(id);
    if (!e) throw new RegistryError(`Registre « ${this.name} » : patch de « ${id} » par « ${mod} », entrée absente`);
    if ('id' in fields && fields.id !== id) throw new RegistryError(`Registre « ${this.name} » : l'identifiant de « ${id} » ne se patche pas`);
    const done = this.patched.get(id) ?? new Map<string, string>();
    for (const k of Object.keys(fields)) {
      const by = done.get(k);
      if (by && by !== mod && !opts.override) throw new RegistryError(`Registre « ${this.name} » : champ « ${k} » de « ${id} » déjà patché par « ${by} » (conflit avec « ${mod} »)`);
    }
    const reindex = !this.hooks.indexFields || Object.keys(fields).some((k) => this.hooks.indexFields!.includes(k));
    if (reindex) this.hooks.index?.(e, false);
    const rec = e as Record<string, unknown>;
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) delete rec[k];
      else rec[k] = v;
    }
    if (opts.keyOrder) {
      const keys = Object.keys(rec);
      if (keys.length !== opts.keyOrder.length || !opts.keyOrder.every((k) => Object.hasOwn(rec, k)))
        throw new RegistryError(`Registre « ${this.name} » : ordre des champs de « ${id} » par « ${mod} » invalide (${opts.keyOrder.join(', ')} / ${keys.join(', ')})`);
      const vals = opts.keyOrder.map((k) => [k, rec[k]] as const);
      for (const k of keys) delete rec[k];
      for (const [k, v] of vals) rec[k] = v;
    }
    if (reindex) this.hooks.index?.(e, true);
    if (mod !== BASE_MOD_ID) {
      for (const k of Object.keys(fields)) done.set(k, mod);
      this.patched.set(id, done);
    }
  }

  /** Retire une entrée (table et index) */
  remove(mod: string, id: string): void {
    this.check(mod, 'retrait', id);
    const e = this.get(id);
    if (!e) throw new RegistryError(`Registre « ${this.name} » : retrait de « ${id} » par « ${mod} », entrée absente`);
    if (this.list) {
      const i = this.list.indexOf(e);
      if (i >= 0) this.list.splice(i, 1);
    }
    delete this.byId[id];
    this.owners.delete(id);
    this.patched.delete(id);
    this.hooks.index?.(e, false);
  }

  /** Incohérences entre la table et son index (identifiant en double, entrée de la table absente de l'index ou remplacée) ; vide si tout va bien */
  problems(): string[] {
    const out: string[] = [];
    if (!this.list) return out;
    const seen = new Set<string>();
    for (const e of this.list) {
      if (seen.has(e.id)) out.push(`${this.name} : « ${e.id} » en double`);
      seen.add(e.id);
      if (this.byId[e.id] !== e) out.push(`${this.name} : « ${e.id} » absent de l'index ou différent`);
    }
    return out;
  }

  /** Nombre d'entrées appartenant à chaque mod (hors base) */
  ownersCount(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const m of this.owners.values()) if (m !== BASE_MOD_ID) out[m] = (out[m] ?? 0) + 1;
    return out;
  }

  /** Gel : plus aucune modification par l'API ; `freezeTables` gèle aussi la table et l'index eux-mêmes (Object.freeze, développement et tests) */
  freeze(freezeTables = false): void {
    this.frozen = true;
    if (freezeTables) {
      if (this.list) Object.freeze(this.list);
      Object.freeze(this.byId);
    }
  }
}
