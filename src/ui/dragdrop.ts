/**
 * Glisser-déposer des objets (sac, coffre, équipement, runes et gemmes du coffre) : souris (glisser dès 8 px) ou tactile (appui long, pour ne pas
 * gêner le défilement). Le panneau enregistre à chaque rendu ses cases sources, ses grilles et ses emplacements ; ici : le geste, le « fantôme » qui
 * suit le doigt, et la recherche de la case visée.
 */
export type DragSrc = { kind: 'inv'; idx: number } | { kind: 'charm'; idx: number } | { kind: 'stash'; tab: number; idx: number } | { kind: 'eq'; slot: string } | { kind: 'res'; id: string };
export type DropTarget = { kind: 'inv' | 'charm' | 'stash' | 'cube'; cell: number; tab?: number } | { kind: 'eq'; slot: string };

export interface DropGrid {
  el: HTMLElement;
  kind: 'inv' | 'charm' | 'stash' | 'cube';
  tab?: number;
  /** case (indice ligne par ligne) sous un point de l'écran, null hors grille */
  cellAt(x: number, y: number): number | null;
}

/** Grille de cases `cols × rows` posée dans un panneau D2 mis à l'échelle (origine x0, y0 et pas en pixels D2) */
export function d2CellAt(inner: HTMLElement, x0: number, y0: number, pitch: number, cols: number, rows: number): (x: number, y: number) => number | null {
  return (x, y) => {
    const r = inner.getBoundingClientRect();
    const k = r.width / inner.offsetWidth || 1;
    const col = Math.floor(((x - r.left) / k - x0) / pitch);
    const row = Math.floor(((y - r.top) / k - y0) / pitch);
    return col >= 0 && col < cols && row >= 0 && row < rows ? row * cols + col : null;
  };
}

/** Grille CSS : cases carrées de la largeur de la grille divisée par les colonnes */
export function cssCellAt(grid: HTMLElement, cols: number, rows: number): (x: number, y: number) => number | null {
  return (x, y) => {
    const r = grid.getBoundingClientRect();
    const pitch = r.width / cols;
    const col = Math.floor((x - r.left) / pitch);
    const row = Math.floor((y - r.top) / pitch);
    return col >= 0 && col < cols && row >= 0 && row < rows ? row * cols + col : null;
  };
}

const MOVE_PX = 8;
const HOLD_MS = 220;

/**
 * Glisser-déposer des objets d'un panneau : sources (`attach`), grilles (`addGrid`) et emplacements d'équipement (`addSlot`) sont
 * réenregistrés à chaque rendu (`reset`) ; le dépôt appelle `onDrop(source, cible)`.
 */
export class DragDrop {
  private grids: DropGrid[] = [];
  private slots: { el: HTMLElement; slot: string }[] = [];

  constructor(private readonly onDrop: (src: DragSrc, dst: DropTarget) => void) {}

  /** À appeler au début de chaque rendu du panneau */
  reset(): void {
    this.grids = [];
    this.slots = [];
  }

  /** Grille où l'on peut déposer (case visée calculée par `cellAt`) */
  addGrid(g: DropGrid): void {
    this.grids.push(g);
  }

  /** Emplacement d'équipement où l'on peut déposer */
  addSlot(el: HTMLElement, slot: string): void {
    this.slots.push({ el, slot });
  }

  /** Rend une case glissable */
  attach(node: HTMLElement, src: DragSrc): void {
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      const touch = e.pointerType !== 'mouse';
      let armed = !touch;
      let dragging = false;
      let ghost: HTMLElement | null = null;
      let gx = 0;
      let gy = 0;
      const timer = touch
        ? window.setTimeout(() => {
            armed = true;
            navigator.vibrate?.(8);
          }, HOLD_MS)
        : 0;
      const stopScroll = (ev: TouchEvent) => {
        if (armed || dragging) ev.preventDefault();
      };
      const begin = (): void => {
        dragging = true;
        const r = node.getBoundingClientRect();
        gx = sx - r.left;
        gy = sy - r.top;
        ghost = node.cloneNode(true) as HTMLElement;
        ghost.className = `${node.className} dd-ghost`;
        ghost.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;pointer-events:none;z-index:99999;opacity:.85;transform:none;`;
        document.body.append(ghost);
        node.classList.add('dd-src');
      };
      const move = (ev: PointerEvent): void => {
        const d = Math.hypot(ev.clientX - sx, ev.clientY - sy);
        if (!dragging) {
          if (d < MOVE_PX) return;
          if (!armed) return cleanup(); // le doigt a bougé avant l'appui long : c'est un défilement
          begin();
        }
        if (ghost) {
          ghost.style.left = `${ev.clientX - gx}px`;
          ghost.style.top = `${ev.clientY - gy}px`;
        }
        ev.preventDefault();
      };
      const up = (ev: PointerEvent): void => {
        const wasDragging = dragging;
        const rect = ghost?.getBoundingClientRect();
        cleanup();
        if (!wasDragging) return;
        // le clic qui suit un glisser ne doit pas sélectionner l'objet
        const swallow = (c: Event) => c.stopPropagation();
        window.addEventListener('click', swallow, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 80);
        const dst = this.targetAt(ev.clientX, ev.clientY, rect);
        if (dst) this.onDrop(src, dst);
      };
      const cancel = (): void => cleanup();
      const cleanup = (): void => {
        window.clearTimeout(timer);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('touchmove', stopScroll);
        ghost?.remove();
        node.classList.remove('dd-src');
        dragging = false;
      };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('touchmove', stopScroll, { passive: false });
    });
  }

  private targetAt(px: number, py: number, ghost?: DOMRect): DropTarget | null {
    for (const s of this.slots) {
      const r = s.el.getBoundingClientRect();
      if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) return { kind: 'eq', slot: s.slot };
    }
    for (const g of this.grids) {
      const r = g.el.getBoundingClientRect();
      if (px < r.left || px > r.right || py < r.top || py > r.bottom) continue;
      // case visée : coin haut-gauche de l'objet déplacé (un objet de plusieurs cases se pose par son coin), à défaut le doigt
      const cell = (ghost && g.cellAt(ghost.left + 4, ghost.top + 4)) ?? g.cellAt(px, py);
      if (cell !== null) return { kind: g.kind, cell, tab: g.tab };
    }
    return null;
  }
}
