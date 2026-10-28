/**
 * File d'annonces (logique pure, sans DOM) : au plus `maxVisible` annonces à l'écran, empilées (les plus récentes en bas),
 * chacune lisible au moins `minMs`. Les doublons (même clé) sont regroupés en « ×N » ; à priorité égale l'ordre d'arrivée
 * est respecté, les plus rares passent d'abord. Aucun chevauchement : l'affichage est une pile verticale.
 */
export interface Announce {
  key: string;
  text: string;
  color?: string;
  /** plus grand = plus important (haute rune 5, exceptionnel 4, boss/niveau 3…) */
  prio: number;
}

export interface Shown extends Announce {
  id: number;
  count: number;
  since: number;
}

export class AnnounceQueue {
  visible: Shown[] = [];
  pending: Shown[] = [];
  private nextId = 1;
  constructor(
    readonly maxVisible = 3,
    readonly minMs = 1600,
    readonly lifeMs = 3200,
    readonly maxPending = 12,
  ) {}

  /** Ajoute une annonce ; renvoie true si l'affichage change. */
  push(a: Announce, now: number): boolean {
    const vis = this.visible.find((v) => v.key === a.key);
    if (vis) {
      vis.count++;
      vis.since = now;
      return true;
    }
    const pen = this.pending.find((v) => v.key === a.key);
    if (pen) {
      pen.count++;
      return false;
    }
    this.pending.push({ ...a, id: this.nextId++, count: 1, since: now });
    if (this.pending.length > this.maxPending) {
      let low = 0;
      for (let i = 1; i < this.pending.length; i++) if (this.pending[i].prio < this.pending[low].prio) low = i;
      this.pending.splice(low, 1);
    }
    return this.fill(now);
  }

  /** Fait avancer le temps (expiration, remplacement) ; renvoie true si l'affichage change. */
  tick(now: number): boolean {
    let changed = false;
    const before = this.visible.length;
    this.visible = this.visible.filter((v) => now - v.since < this.lifeMs);
    if (this.visible.length !== before) changed = true;
    // pile pleine et file d'attente : la plus ancienne, lue assez longtemps, cède la place
    if (this.pending.length && this.visible.length >= this.maxVisible && now - this.visible[0].since >= this.minMs) {
      this.visible.shift();
      changed = true;
    }
    return this.fill(now) || changed;
  }

  get idle(): boolean {
    return !this.visible.length && !this.pending.length;
  }

  private fill(now: number): boolean {
    let changed = false;
    while (this.pending.length && this.visible.length < this.maxVisible) {
      let best = 0;
      for (let i = 1; i < this.pending.length; i++) if (this.pending[i].prio > this.pending[best].prio) best = i;
      const [n] = this.pending.splice(best, 1);
      n.since = now;
      this.visible.push(n);
      changed = true;
    }
    return changed;
  }
}
