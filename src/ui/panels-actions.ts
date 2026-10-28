/**
 * Colonne d'actions d'un objet (menus, sertissage, corruption, cartes) et fenêtres associées.
 * Fonctions extraites de la classe Panels (panels.ts) : `this` y désigne l'instance.
 */
import { modSetting } from '../mods/settings';
import type { Game } from '../sim/game';
import type { Item } from '../sim/item';
import type { ItemBase, Slot } from '../data/types';
import { isMercOnly } from '../data/classes';
import { BASE_BY_ID } from '../data/items/bases';
import { RUNE_BY_ID } from '../data/items/runes';
import { RUNEWORDS, runewordFits } from '../data/items/runewords';
import { canSocket, freeSockets } from '../sim/socket';
import { addSocketsCheck, addSocketsRecipesFor, corruptShardCheck, corruptRefItem, type CorruptRef, type MapRef } from '../sim/cube';
import { RULES } from '../mods/rules';
import { corruptionOdds } from '../sim/corruption';
import { takeMapFromStash } from '../sim/mapstash';
import { isLooseKind, matCount } from '../sim/materials';
import { baseOf, itemName } from '../sim/itemstats';
import { isCharm, findSlotIn } from '../sim/inventory';
import { canWear, computeDerived } from '../sim/character';
import { el, fmt, holdButton } from './dom';
import { STASH_COLS, STASH_ROWS } from '../sim/inventory';
import { highlightKeys, highlightName, nextHighlightColor, withHighlight } from '../sim/loot/highlight';
import { canMercEquip } from '../sim/merc';
import type { Panels } from './panels';
import { modParts, modUiHost, shortLabel, STASH_VIEW, type Sel, type ActEntry, type ColBtn, type ActSection } from './panels-shared';
import { contributions } from '../mods/ui';

/**
 * Colonne d'actions (maquette du joueur) : toujours 8 boutons aux mêmes places, quel que soit l'objet.
 * 1. « Utiliser » (Équiper, Retirer, Ouvrir la carte, Ranger…), 2. « Transférer » (Déposer au coffre, Prendre, Acheter, Vendre…),
 * 3. Cube, 4. Corrompre, 5. Artisanat (liste flottante), 6. Mercenaire, 7. Surligner, 8. Jeter (rouge, en bas).
 * Une action qui ne s'applique pas à l'objet reste en place, grisée, avec la raison en petit (et en message au toucher).
 */
export function buildActsImpl(this: Panels, g: Game, mode: string, it: Item | null, res: string | null): { btns: ColBtn[]; popover: HTMLElement | null; overlays: HTMLElement[] } {
  const x = actContext(this, g, mode);
  const { b, overlays } = x;
  const s = this.sel;
  if (res) return resourceActs(x, res);
  if (!it || !s) return { btns: Object.values(b), popover: null, overlays };
  const base = baseOf(it);
  const ref: CorruptRef | null =
    s.from === 'inv' ? { from: 'inv', idx: s.idx } : s.from === 'stash' ? { from: 'stash', tab: s.tab, idx: s.idx } : s.from === 'eq' ? { from: 'eq', slot: s.slot } : null;
  // ---------- utiliser / transférer
  switch (s.from) {
    case 'inv':
      srcInvActs(x, it, base, s);
      break;
    case 'charm':
      srcCharmActs(x, it, base, s);
      break;
    case 'eq':
      srcEquippedActs(x, it, base, s);
      break;
    case 'merc':
      srcMercActs(x, it, base, s);
      break;
    case 'stash':
      srcStashActs(x, it, base, s);
      break;
    case 'vendor':
      srcVendorActs(x, it, base, s);
      break;
    case 'back':
      srcBuybackActs(x, it, base, s);
      break;
    case 'mapstash':
      srcMapStashActs(x, it, base, s);
      break;
  }
  const mref: MapRef | null = !it.map
    ? null
    : s.from === 'inv'
      ? { from: 'inv', idx: s.idx }
      : s.from === 'stash'
        ? { from: 'stash', tab: s.tab, idx: s.idx }
        : s.from === 'mapstash'
          ? { from: 'mapstash', idx: s.idx }
          : null;
  craftActs(x, it, s, ref, mref);
  corruptAct(x, it, ref, mref);
  highlightAct(x, it);
  let popover: HTMLElement | null = null;
  // liste flottante d'Artisanat ou panneau de sertissage
  if (b.craft.menu && this.menuUi.open === b.craft.menu.key) popover = this.menuList(b.craft.menu.key, b.craft.menu.sections, b.craft.menu.cls);
  if (!popover && (s.from === 'inv' || s.from === 'eq') && freeSockets(it) > 0 && !it.runeword && this.menuUi.socketOpen) popover = this.socketPanel(g, it, s);
  return { btns: Object.values(b), popover, overlays };
}

/** Contexte de construction de la colonne d'actions : boutons en cours et aides communes (succès, échec, action du jeu) */
interface ActCtx {
  p: Panels;
  g: Game;
  c: Game['character'];
  mode: string;
  b: Record<ColBtn['slot'], ColBtn>;
  town: boolean;
  /** Coffre ouvert sur une page d'objets (dépôt possible) */
  stashOpen: boolean;
  overlays: HTMLElement[];
  /** Action réussie : son de l'objet, sélection et menu fermés, rendu */
  done: (kind: string, after?: () => void) => void;
  /** Action refusée : vibration et raison en message */
  fail: (reason?: string) => void;
  /** Lance une action du jeu : succès → rendu, échec → raison en message */
  exec: (kind: string, fn: () => { ok: boolean; reason?: string } | boolean) => () => void;
  /** Bouton grisé avec sa raison */
  no: (slot: ColBtn['slot'], reason: string) => void;
  invIdxOf: (uid: string) => number;
}

function actContext(p: Panels, g: Game, mode: string): ActCtx {
  const c = g.character;
  const town = g.mode === 'town';
  const stashOpen = mode === 'stash' && p.stashTab >= 0;
  const mk = (slot: ColBtn['slot'], act: string, label: string, more: Partial<ColBtn> = {}): ColBtn => ({ slot, act, label, ok: false, ...more });
  const b: Record<ColBtn['slot'], ColBtn> = {
    use: mk('use', 'use', 'Utiliser'),
    move: mk('move', 'move', mode === 'vendor' ? 'Acheter / Vendre' : 'Déposer / Prendre'),
    cube: mk('cube', 'cube-add', 'Mettre dans le Cube'),
    corrupt: mk('corrupt', 'corrupt', 'Corrompre'),
    craft: mk('craft', 'craft-menu', 'Artisanat'),
    merc: mk('merc', 'merc-give', 'Donner au mercenaire'),
    hl: mk('hl', 'hl-quick', 'Surligner'),
    drop: mk('drop', 'drop', 'Jeter', { danger: true }),
  };
  const invIdxOf = (uid: string) => c.inventory.findIndex((x) => x?.uid === uid);
  const done = (kind: string, after: () => void = () => {}) => {
    p.host.itemSound(kind);
    p.sel = null;
    p.menuUi.open = null;
    after();
    p.render();
  };
  const fail = (reason?: string) => {
    p.host.haptic('fail');
    if (reason) p.host.message(reason, '#d66');
  };
  const exec = (kind: string, fn: () => { ok: boolean; reason?: string } | boolean) => () => {
    const r = fn();
    const ok = typeof r === 'boolean' ? r : r.ok;
    if (!ok) return fail(typeof r === 'boolean' ? undefined : r.reason);
    done(kind);
  };
  const no = (slot: ColBtn['slot'], reason: string) => {
    b[slot].reason = reason;
    b[slot].ok = false;
  };
  return { p, g, c, mode, b, town, stashOpen, overlays: [], done, fail, exec, no, invIdxOf };
}

/** Rune, gemme ou matériau choisi dans les onglets du coffre : prendre, tout prendre, sertir dans un objet, mettre au Cube */
function resourceActs(x: ActCtx, res: string): { btns: ColBtn[]; popover: HTMLElement | null; overlays: HTMLElement[] } {
  const { p, g, c, b, overlays, fail, no } = x;
  let popover: HTMLElement | null = null;
  const n = c.materials[res] ?? 0;
  const bt = BASE_BY_ID[res]?.type;
  const loose = bt === 'rune' || bt === 'gem';
  const rr = (fn: () => void) => () => {
    fn();
    p.host.haptic('tap');
    p.render();
  };
  if (loose) {
    Object.assign(b.move, {
      label: 'Prendre dans le sac',
      ok: n > 0,
      reason: n ? undefined : 'Il n’y en a plus',
      run: rr(() => {
        if (!g.withdrawRune(res, 1)) p.host.message('Inventaire plein.', '#d66');
      }),
    });
    Object.assign(b.use, {
      label: n > 1 ? `Tout prendre (×${n})` : 'Tout prendre',
      ok: n > 1,
      reason: n > 1 ? undefined : 'Une seule',
      run: rr(() => {
        const got = g.withdrawRune(res, n);
        if (got < n) p.host.message(got ? `${got} sortie${got > 1 ? 's' : ''} ; inventaire plein.` : 'Inventaire plein.', '#d66');
      }),
    });
    const cands: ActEntry[] = [];
    const add = (x: Item | null | undefined, target: { invIndex: number } | { slot: Slot }, where: string, id: string) => {
      if (!x || !canSocket(x, res).ok) return;
      const fr = freeSockets(x);
      cands.push({
        id,
        label: itemName(x),
        note: `${where} : ${fr} châsse${fr > 1 ? 's' : ''} libre${fr > 1 ? 's' : ''}`,
        run: () => {
          const r = g.socket(target, { material: res, fromTab: true });
          if (!r.ok) fail(r.reason ?? 'Impossible');
          else {
            p.host.haptic('tap');
            p.host.message(r.runeword ? `Mot runique formé : ${RUNEWORDS.find((z) => z.id === r.runeword)?.name}` : `${BASE_BY_ID[res]?.name ?? res} sertie.`, r.runeword ? '#e8b04a' : undefined);
          }
          p.menuUi.open = null;
          p.render();
        },
      });
    };
    c.inventory.forEach((x, i) => add(x, { invIndex: i }, 'sac', `sock-inv-${i}`));
    for (const [slot, x] of Object.entries(c.equipment)) add(x, { slot: slot as Slot }, 'équipé', `sock-eq-${slot}`);
    const secs: ActSection[] = [
      { title: 'Sertir dans…', entries: cands.slice(0, 14), foot: !n ? 'Il n’y en a plus.' : cands.length ? undefined : 'Aucun objet à châsse libre dans le sac ni sur vous.' },
    ];
    Object.assign(b.craft, { label: 'Sertir dans…', act: 'res-socket', ok: n > 0 && cands.length > 0, reason: n ? 'Aucune cible' : 'Il n’y en a plus' });
    b.craft.menu = { key: `res:${res}:craft`, sections: secs, cls: '' };
  } else no('use', 'Matériau');
  Object.assign(b.cube, {
    ok: n > 0,
    reason: n ? undefined : 'Il n’y en a plus',
    run: rr(() => {
      if (!g.cubeFromTab(res)) p.host.message(n ? 'Plus de place dans le Cube.' : 'Il n’y en a plus.', '#d66');
      p.cubeUi.gridNote = '';
    }),
  });
  for (const k of ['corrupt', 'merc', 'hl', 'drop'] as const) no(k, 'Pas ici');
  if (b.craft.menu === undefined) no('craft', 'Pas ici');
  else if (p.menuUi.open === b.craft.menu.key) popover = p.menuList(b.craft.menu.key, b.craft.menu.sections, b.craft.menu.cls);
  return { btns: Object.values(b), popover, overlays };
}

/** Objet du sac : utiliser (ouvrir la carte, ranger le charme, équiper, ranger dans l’onglet), vendre ou déposer, cube, jeter, mercenaire */
function srcInvActs(x: ActCtx, it: Item, base: ItemBase, s: Extract<NonNullable<Sel>, { from: 'inv' }>): void {
  const { p, g, c, mode, b, town, stashOpen, fail, exec, no } = x;
  const idx = s.idx;
  if (it.map) {
    const can = town ? { ok: true } : { ok: false, reason: 'À ouvrir en ville' };
    Object.assign(b.use, {
      label: 'Ouvrir la carte',
      ok: can.ok,
      reason: can.ok ? undefined : 'En ville',
      run: () => {
        const r = g.startMap({ invIndex: idx });
        if (!r.ok) return fail(r.reason ?? 'Impossible');
        p.hide();
      },
    });
  } else if (isCharm(it)) {
    Object.assign(b.use, { label: 'Ranger dans les charmes', ok: true, run: exec(base.type, () => (g.stowCharm(idx) ? true : { ok: false, reason: 'Inventaire des charmes plein' })) });
  } else if (base.slot && isMercOnly(base)) {
    no('use', 'Pour le mercenaire');
  } else if (base.slot) {
    const chk = canWear(c, it, { str: computeDerived(c, 0).str, dex: computeDerived(c, 0).dex });
    Object.assign(b.use, { label: 'Équiper', sub: base.slot === 'ring' ? 'anneau libre' : undefined, ok: chk.ok, reason: chk.ok ? undefined : chk.reason, run: exec(base.type, () => g.equip(idx)) });
  } else if (isLooseKind(it)) {
    Object.assign(b.use, { label: 'Ranger dans l’onglet', ok: true, run: exec(base.type, () => g.depositRune(idx)) });
  } else no('use', 'Rien à faire');
  if (mode === 'vendor') {
    Object.assign(b.move, { label: `Vendre`, sub: `${fmt(g.sellPrice(it))} or`, ok: true, hold: true, run: () => (g.sell(idx), (p.sel = null), p.render()) });
  } else if (stashOpen) {
    Object.assign(b.move, { label: 'Déposer au coffre', ok: true, run: exec(base.type, () => g.stash(idx, p.stashTab)) });
  } else no('move', mode === 'stash' ? 'Ouvrez l’onglet Coffre' : mode === 'inventory' ? 'Coffre ou marchand fermé' : 'Rien à faire');
  Object.assign(b.cube, { ok: true, run: exec(base.type, () => (g.cubeAdd(idx) ? ((p.cubeUi.gridNote = ''), true) : { ok: false, reason: 'Plus de place dans le Cube.' })) });
  Object.assign(b.drop, { ok: true, sub: 'à vos pieds', run: exec(base.type, () => (g.drop(idx), true)) });
  if (c.merc) {
    const mc = canMercEquip(c, it);
    Object.assign(b.merc, { ok: mc.ok, reason: mc.ok ? undefined : mc.reason, run: exec(base.type, () => g.mercEquip(idx)) });
  } else no('merc', 'Aucun mercenaire');
}
/** Charme actif : retirer vers le sac, vendre ou déposer au coffre, jeter */
function srcCharmActs(x: ActCtx, it: Item, base: ItemBase, s: Extract<NonNullable<Sel>, { from: 'charm' }>): void {
  const { p, g, c, mode, b, stashOpen, exec, no } = x;
  const idx = s.idx;
  Object.assign(b.use, { label: 'Retirer vers le sac', ok: true, run: exec(base.type, () => (g.unstowCharm(idx) ? true : { ok: false, reason: 'Inventaire plein' })) });
  if (mode === 'vendor') Object.assign(b.move, { label: 'Vendre', sub: `${fmt(g.sellPrice(it))} or`, ok: true, hold: true, run: () => (g.sellCharm(idx), (p.sel = null), p.render()) });
  else if (stashOpen) {
    Object.assign(b.move, {
      label: 'Déposer au coffre',
      ok: true,
      run: exec(base.type, () => {
        const at = findSlotIn(c.stash[p.stashTab], STASH_COLS, STASH_ROWS, it);
        return at >= 0 && g.moveItem({ grid: 'charm' }, idx, { grid: 'stash', tab: p.stashTab }, at);
      }),
    });
  } else no('move', 'Coffre ou marchand fermé');
  no('cube', 'Retirez-le d’abord');
  Object.assign(b.drop, { ok: true, sub: 'à vos pieds', run: exec(base.type, () => (g.dropCharm(idx), true)) });
  no('merc', 'Pas pour un charme');
}
/** Objet porté : retirer, déposer au coffre (retiré puis rangé) */
function srcEquippedActs(x: ActCtx, it: Item, base: ItemBase, s: Extract<NonNullable<Sel>, { from: 'eq' }>): void {
  const { p, g, b, stashOpen, done, fail, exec, no, invIdxOf } = x;
  const slot = s.slot;
  Object.assign(b.use, { label: 'Retirer', ok: true, run: exec(base.type, () => g.unequip(slot)) });
  if (stashOpen) {
    Object.assign(b.move, {
      label: 'Déposer au coffre',
      ok: true,
      run: () => {
        const r = g.unequip(slot);
        if (!r.ok) return fail(r.reason);
        const i = invIdxOf(it.uid);
        if (i < 0 || !g.stash(i, p.stashTab)) p.host.message('Plus de place au coffre : objet remis dans le sac.', '#d66');
        done(base.type);
      },
    });
  } else no('move', 'Coffre fermé');
  no('cube', 'Retirez-le d’abord');
  no('merc', 'Retirez-le d’abord');
  no('drop', 'Retirez-le d’abord');
}
/** Objet du mercenaire : le reprendre */
function srcMercActs(x: ActCtx, it: Item, base: ItemBase, s: Extract<NonNullable<Sel>, { from: 'merc' }>): void {
  const { g, b, exec, no } = x;
  const slot = s.slot;
  Object.assign(b.use, { label: 'Reprendre', ok: true, run: exec(base.type, () => g.mercUnequip(slot)) });
  no('move', 'Équipement du mercenaire');
  no('cube', 'Reprenez-le d’abord');
  no('merc', 'Déjà porté');
  no('drop', 'Reprenez-le d’abord');
}
/** Objet du coffre : prendre (puis équiper, mettre au cube, donner au mercenaire) */
function srcStashActs(x: ActCtx, it: Item, base: ItemBase, s: Extract<NonNullable<Sel>, { from: 'stash' }>): void {
  const { p, g, c, b, done, fail, exec, no, invIdxOf } = x;
  const { tab, idx } = s;
  Object.assign(b.move, { label: 'Prendre', ok: true, run: exec(base.type, () => g.unstash(tab, idx)) });
  const takeThen = (fn: (i: number) => { ok: boolean; reason?: string } | boolean) => () => {
    if (!g.unstash(tab, idx)) return fail('Inventaire plein');
    const r = fn(invIdxOf(it.uid));
    const ok = typeof r === 'boolean' ? r : r.ok;
    if (!ok) p.host.message(`${typeof r === 'boolean' ? 'Impossible' : (r.reason ?? 'Impossible')} : objet pris dans le sac.`, '#d66');
    done(base.type);
  };
  if (base.slot && !isMercOnly(base)) Object.assign(b.use, { label: 'Prendre et équiper', ok: true, run: takeThen((i) => (i >= 0 ? g.equip(i) : false)) });
  else no('use', 'Rien à faire');
  Object.assign(b.cube, { ok: true, run: takeThen((i) => (i >= 0 && g.cubeAdd(i) ? ((p.cubeUi.gridNote = ''), true) : { ok: false, reason: 'Plus de place dans le Cube.' })) });
  if (c.merc) {
    const mc = canMercEquip(c, it);
    Object.assign(b.merc, { ok: mc.ok, reason: mc.ok ? undefined : mc.reason, run: takeThen((i) => (i >= 0 ? g.mercEquip(i) : false)) });
  } else no('merc', 'Aucun mercenaire');
  no('drop', 'Prenez-le d’abord');
}
/** Objet de l’étal : acheter */
function srcVendorActs(x: ActCtx, it: Item, base: ItemBase, s: Extract<NonNullable<Sel>, { from: 'vendor' }>): void {
  const { g, b, exec, no } = x;
  const e = g.vendor[s.idx];
  const idx = s.idx;
  Object.assign(b.move, { label: 'Acheter', sub: e ? `${fmt(e.price)} or` : undefined, ok: !!e, run: exec(base.type, () => g.buy(idx)) });
  no('use', 'Achetez-le d’abord');
  for (const k of ['cube', 'merc', 'drop'] as const) no(k, 'Achetez-le d’abord');
}
/** Objet vendu : racheter */
function srcBuybackActs(x: ActCtx, it: Item, base: ItemBase, s: Extract<NonNullable<Sel>, { from: 'back' }>): void {
  const { g, b, exec, no } = x;
  const e = g.buyback[s.idx];
  const idx = s.idx;
  Object.assign(b.move, { label: 'Racheter', sub: e ? `${fmt(e.price)} or` : undefined, ok: !!e, run: exec(base.type, () => g.rebuy(idx)) });
  no('use', 'Rachetez-le d’abord');
  for (const k of ['cube', 'merc', 'drop'] as const) no(k, 'Rachetez-le d’abord');
}
/** Carte du coffre de cartes : ouvrir, prendre dans le sac, mettre au cube */
function srcMapStashActs(x: ActCtx, it: Item, base: ItemBase, s: Extract<NonNullable<Sel>, { from: 'mapstash' }>): void {
  const { p, g, c, b, fail, no } = x;
  const idx = s.idx;
  const can = g.mode === 'town' ? g.canOpenMaps() : { ok: false, reason: 'À ouvrir en ville' };
  Object.assign(b.use, {
    label: 'Ouvrir la carte',
    ok: can.ok,
    reason: can.ok ? undefined : 'En ville',
    run: () => {
      const r = g.startMap({ mapIdx: idx });
      if (!r.ok) return fail(r.reason ?? 'Impossible');
      p.hide();
    },
  });
  Object.assign(b.move, {
    label: 'Prendre dans le sac',
    ok: true,
    run: () => {
      if (takeMapFromStash(c, idx) < 0) p.host.message('Inventaire plein.', '#d66');
      p.host.haptic('tap');
      p.sel = null;
      p.render();
    },
  });
  Object.assign(b.cube, {
    ok: true,
    run: () => {
      const at = takeMapFromStash(c, idx);
      if (at < 0) p.host.message('Inventaire plein.', '#d66');
      else if (!g.cubeAdd(at)) p.host.message('Plus de place dans le Cube ; carte prise dans le sac.', '#d66');
      else p.cubeUi.gridNote = '';
      p.sel = null;
      p.render();
    },
  });
  no('merc', 'Pas pour une carte');
  no('drop', 'Prenez-la d’abord');
}

/** Artisanat : fusion et opérations de carte, châsses (Larzuk, Cube), sertissage ; menu flottant du bouton « Artisanat » / « Améliorer » */
function craftActs(x: ActCtx, it: Item, s: NonNullable<Sel>, ref: CorruptRef | null, mref: MapRef | null): void {
  const { p, g, c, b, town, no } = x;
  const craft: ActSection[] = [];
  if (it.map && mref) {
    if (s.from === 'mapstash' && it.map.tier <= 2) {
      const tier = it.map.tier;
      const pv = RULES['maps.mergePreview'](c, { tier, mode: 'upgrade', quality: p.mergeUi.quality });
      craft.push({
        title: 'Fusion',
        entries: [
          {
            id: 'merge-all',
            label: `Fusionner toutes les T${tier}`,
            right: pv.ok ? `×${pv.lots}` : undefined,
            ok: pv.ok && town,
            reason: town ? pv.reason : 'À faire en ville',
            run: () => {
              p.mergeUi.tier = tier;
              p.mergeUi.ask = { mode: 'upgrade' };
              p.menuUi.open = null;
              p.render();
            },
          },
        ],
      });
    }
    craft.push({ entries: p.mapEntries(g, mref, it), foot: 'Orbes : butin des cartes et des événements.', mapNote: !town });
  }
  if (ref && !it.map) {
    const sockets = p.socketEntries(g, it, ref);
    if (sockets.length) craft.push({ title: 'Châsses', entries: sockets });
    if ((s.from === 'inv' || s.from === 'eq') && freeSockets(it) > 0 && !it.runeword) {
      const n = freeSockets(it);
      craft.push({
        title: sockets.length ? 'Sertissage' : undefined,
        entries: [
          {
            id: 'socket-in',
            label: `Sertir (${n} libre${n > 1 ? 's' : ''})`,
            note: 'runes, gemmes, joyaux',
            run: () => {
              p.menuUi.socketOpen = !p.menuUi.socketOpen;
              p.menuUi.open = null;
              p.render();
            },
          },
        ],
      });
    }
  }
  const craftN = craft.reduce((a, x) => a + x.entries.length, 0);
  if (craftN) {
    Object.assign(b.craft, { act: it.map ? 'map-upgrade' : 'craft-menu', label: it.map ? 'Améliorer' : 'Artisanat', ok: true });
    b.craft.menu = { key: `${it.uid}:craft`, sections: craft, cls: it.map ? 'mapmenu' : '' };
  } else no('craft', ref || it.map ? 'Rien à faire' : 'Pas ici');
  if (it.map && !ref) b.craft.label = 'Améliorer';
}

/** Corrompre : objet (vérification et confirmation de `corruptEntry`) ou carte (même entrée que le menu Améliorer) */
function corruptAct(x: ActCtx, it: Item, ref: CorruptRef | null, mref: MapRef | null): void {
  const { p, g, b, town, overlays, no } = x;
  if (ref && !it.map) {
    const ce = p.corruptEntry(g, it, ref);
    if (ce) {
      Object.assign(b.corrupt, { ok: ce.ok !== false, reason: ce.reason, sub: ce.ok !== false ? ce.right : undefined, run: ce.run, title: ce.title });
      const ov = ce.overlay?.();
      if (ov) overlays.push(ov);
    } else no('corrupt', town ? 'Non corruptible' : 'En ville seulement');
  } else if (it.map && mref) {
    // même vérification et même confirmation que « Corrompre » du menu Améliorer
    const ce = p.mapEntries(g, mref, it).find((e) => e.id === 'mapop-corrupt')!;
    const key = `${it.uid}:craft`;
    Object.assign(b.corrupt, {
      ok: ce.ok !== false,
      reason: ce.reason,
      sub: ce.ok !== false ? ce.right : undefined,
      title: ce.ok !== false ? 'Corrompre cette carte' : `Corrompre : ${ce.reason}`,
      run: () => {
        if (!ce.ask) return ce.run();
        p.menuUi.open = key;
        p.menuUi.ask = `${key}:mapop-corrupt`;
        p.menuUi.socketOpen = false;
        p.render();
      },
    });
  } else no('corrupt', it.map ? 'Pas ici' : 'Pas ici');
}

/** Surligner : ajoute la première clé de surbrillance de l'objet au filtre */
function highlightAct(x: ActCtx, it: Item): void {
  const { p, g, c, b, no } = x;
  if (!it.map) {
    const key = highlightKeys(it)[0];
    const has = (c.filter.highlight ?? []).some((x) => x.id === key);
    Object.assign(b.hl, {
      label: has ? 'Déjà surligné' : 'Surligner',
      ok: !has,
      reason: undefined,
      run: () => {
        g.setFilter({ highlight: withHighlight(c.filter.highlight, { id: key, color: nextHighlightColor(c.filter.highlight) }) });
        p.host.message(`Surbrillance : ${highlightName(key)}`, '#e8b04a');
        p.menuUi.open = null;
        p.render();
      },
    });
  } else no('hl', 'Pas pour une carte');
}

/** Panneau de sertissage d'un objet du sac ou porté (liste flottante) : mots runiques possibles, puis runes / gemmes / joyaux à sertir */
export function socketPanelImpl(this: Panels, g: Game, it: Item, s: NonNullable<Sel>): HTMLElement {
  const c = g.character;
  const b = baseOf(it);
  const target = s.from === 'inv' ? { invIndex: s.idx } : { slot: (s as { slot: Slot }).slot };
  const box = el('div', { cls: 'scroll tip actmenu socketpanel', data: { testid: 'socket-panel' } });
  box.append(el('div', { cls: 'base actmenu-title', textContent: 'Sertir' }));
  const possible = RUNEWORDS.filter(
    (r) => r.runes.length === it.sockets && runewordFits(r, b) && (it.quality === 'normal' || it.quality === 'superior') && it.socketed.every((x, i) => r.runes[i] === x.base),
  );
  if (possible.length) {
    box.append(el('div', { cls: 'base', textContent: 'Mots runiques possibles :' }));
    for (const r of possible.slice(0, 6)) {
      const have = r.runes.slice(it.socketed.length).every((id) => matCount(c, id) > 0);
      box.append(
        el('div', { cls: `statrow ${have ? 'q-rune' : 'q-normal'}` }, el('span', { textContent: r.name }), el('b', { textContent: r.runes.map((id) => RUNE_BY_ID[id]?.name ?? id).join(' ') })),
      );
    }
  }
  const opts = el('div', { cls: 'tabs', style: { flexWrap: 'wrap' } });
  const ids = new Set<string>(Object.keys(c.materials));
  for (const it2 of c.inventory) if (it2 && isLooseKind(it2)) ids.add(it2.base);
  const mats = [...ids]
    .filter((id) => ['rune', 'gem'].includes(BASE_BY_ID[id]?.type ?? '') && matCount(c, id) > 0)
    .sort((a, z) => (RUNE_BY_ID[z]?.rank ?? 0) - (RUNE_BY_ID[a]?.rank ?? 0) || a.localeCompare(z));
  for (const id of mats) {
    const o = el('button', { cls: `btn ${BASE_BY_ID[id].type === 'rune' ? 'q-rune' : ''}`, textContent: `${BASE_BY_ID[id].name} ×${matCount(c, id)}` });
    o.addEventListener('click', () => {
      const r = g.socket(target, { material: id });
      if (!r.ok) this.host.haptic('fail');
      else if (r.runeword) this.host.message(`Mot runique formé : ${RUNEWORDS.find((x) => x.id === r.runeword)?.name}`, '#e8b04a');
      if (freeSockets(it) === 0) this.menuUi.socketOpen = false;
      this.render();
    });
    opts.append(o);
  }
  c.inventory.forEach((j, i) => {
    if (!j || baseOf(j).type !== 'jewel') return;
    const o = el('button', { cls: 'btn', textContent: itemName(j) });
    o.addEventListener('click', () => {
      if (!g.socket(target, { invIndex: i }).ok) this.host.haptic('fail');
      this.render();
    });
    opts.append(o);
  });
  if (!opts.childElementCount) opts.append(el('div', { cls: 'base', textContent: 'Aucune rune, gemme ni joyau à sertir.' }));
  box.append(opts);
  return box;
}

/** Dessine la colonne d'actions : 8 boutons plats de taille constante, liste flottante et fenêtre de confirmation en surcouche */
export function actionColumnImpl(this: Panels, g: Game, mode: string, compact: boolean, inflow = false): HTMLElement {
  const it = this.selectedItem(g);
  const res = !this.sel && mode === 'stash' && this.stashTab < 0 && this.stashTab !== STASH_VIEW.maps && this.stashTab !== STASH_VIEW.guild && this.stashTab !== STASH_VIEW.cube ? this.resSel : null;
  this.ensureMenuListeners();
  const { btns, popover, overlays } = this.buildActs(g, mode, it, res);
  const col = el('div', { cls: `actcol${compact ? ' compact' : ''}${inflow ? ' inflow' : ''}`, data: { zone: 'actions' } });
  // fiche du mercenaire : seules les actions utiles ici (donner, reprendre, équiper, artisanat, jeter)
  const only = mode === 'merc' ? ['merc', 'use', 'craft', 'drop'] : null;
  for (const x of btns) {
    if (only && !only.includes(x.slot)) continue;
    const disabled = !x.ok;
    const sub = disabled ? undefined : x.sub;
    const attrs = { cls: `btn actbtn${x.danger ? ' danger' : ''}${disabled ? ' disabled' : ''}${x.menu && this.menuUi.open === x.menu.key ? ' sel actmenu-toggle' : x.menu ? ' actmenu-toggle' : ''}` };
    const label = el('span', { cls: 'ab-label', textContent: shortLabel(x.label) });
    const e = x.hold && !disabled ? holdButton('', x.run!, 600, attrs.cls) : el('button', attrs);
    if (x.hold && !disabled) {
      e.querySelector('.hold-label')?.replaceWith(label);
      e.classList.add('actbtn');
    } else e.append(label);
    if (sub) e.append(el('span', { cls: 'ab-sub', textContent: sub }));
    e.dataset.slot = x.slot;
    e.dataset.act = x.act;
    e.dataset.testid = x.act;
    e.title = disabled && x.reason ? `${x.label} : ${x.reason}` : (x.title ?? x.label);
    if (disabled) e.setAttribute('aria-disabled', 'true');
    if (mode === 'merc' && x.slot === 'merc' && !disabled) e.classList.add('primary');
    else if (mode === 'merc') e.classList.remove('primary');
    else if (x.slot === 'move' && !disabled && !x.hold) e.classList.add('primary');
    else if (x.slot === 'use' && !disabled && !btns.some((y) => y.slot === 'move' && y.ok && !y.hold)) e.classList.add('primary');
    if (!(x.hold && !disabled)) {
      e.addEventListener('click', () => {
        if (disabled) {
          this.host.haptic('fail');
          if (x.reason) this.host.message(x.reason, '#d66');
          return;
        }
        if (x.menu) {
          this.menuUi.open = this.menuUi.open === x.menu.key ? null : x.menu.key;
          this.menuUi.ask = null;
          this.menuUi.socketOpen = false;
          this.render();
          return;
        }
        x.run?.();
      });
    }
    col.append(e);
  }
  // un tap sur la case et le double-tap / clic droit lancent l'action la plus directe : transfert si possible, sinon « utiliser »
  const quick =
    (mode === 'merc' ? btns.find((x) => x.slot === 'merc' && x.ok) : null) ?? btns.find((x) => x.slot === 'move' && x.ok && !x.hold) ?? btns.find((x) => x.slot === 'use' && x.ok && !x.hold);
  this.mainRun = quick?.run ?? null;
  if (popover) {
    col.append(popover);
    // la liste flottante ne doit jamais couvrir la colonne Objet (stats de l'objet visibles pendant le choix) : calée à gauche de celle-ci
    requestAnimationFrame(() => this.placeActPopover(col, popover));
  }
  for (const o of overlays) col.append(o);
  return col;
}

/** Cale une liste flottante (Artisanat, Améliorer, Sertir) à gauche de la colonne Objet, sans la recouvrir */
export function placeActPopoverImpl(this: Panels, col: HTMLElement, pop: HTMLElement): void {
  const item = this.root.querySelector<HTMLElement>('.itemcol');
  if (!item || !col.isConnected || !pop.isConnected || col.classList.contains('inflow')) return;
  const c = col.getBoundingClientRect();
  const i = item.getBoundingClientRect();
  if (!c.width || !i.width || i.left >= c.left) return;
  const body = (this.root.querySelector('.panel .body') as HTMLElement | null)?.getBoundingClientRect();
  const avail = Math.max(180, i.left - (body?.left ?? 0) - 12);
  pop.style.right = `${Math.round(c.right - i.left + 6)}px`;
  pop.style.width = `${Math.round(Math.min(360, avail))}px`;
}

/** Un seul menu déplié à la fois ; fermeture au clic en dehors ou sur Échap (avant que le panneau ne se ferme) */
export function ensureMenuListenersImpl(this: Panels): void {
  if (this.menuUi.listeners) return;
  this.menuUi.listeners = true;
  document.addEventListener(
    'pointerdown',
    (ev) => {
      if ((this.menuUi.open || this.menuUi.socketOpen) && !(ev.target as HTMLElement | null)?.closest?.('.actmenu, .actmenu-toggle, .corruptback')) this.closeMenu();
    },
    true,
  );
  window.addEventListener(
    'keydown',
    (ev) => {
      if (ev.key === 'Escape' && this.menuUi.ask) {
        // Échap ferme d'abord la confirmation, puis la liste au second appui
        this.menuUi.ask = null;
        this.root.querySelectorAll('.askback').forEach((n) => n.remove());
        ev.stopImmediatePropagation();
        ev.preventDefault();
      } else if (ev.key === 'Escape' && this.closeMenu()) {
        ev.stopImmediatePropagation();
        ev.preventDefault();
      }
    },
    true,
  );
}

/**
 * Liste flottante d'une action (« Artisanat », « Améliorer ») : bornée et défilante, lignes de 44 px,
 * libellé à gauche, coût ou stock à droite, raison grisée dessous. Les actions définitives passent par une confirmation.
 */
export function menuListImpl(this: Panels, key: string, sections: ActSection[], listCls = ''): HTMLElement {
  const list = el('div', { cls: `scroll tip actmenu ${listCls}`.trim() });
  for (const sec of sections) {
    if (sec.mapNote) list.append(el('div', { cls: 'base', textContent: 'À faire en ville.' }));
    if (sec.title) list.append(el('div', { cls: 'base actmenu-title', textContent: sec.title }));
    for (const e of sec.entries) {
      const ok = e.ok !== false;
      const row = el('button', { cls: `btn actmenu-item${ok ? '' : ' disabled'}${e.danger ? ' danger' : ''}` });
      row.dataset.act = e.id;
      row.append(el('span', { cls: 'am-label', textContent: e.label }));
      if (e.right) row.append(el('span', { cls: 'am-right', textContent: e.right }));
      const sub = !ok ? e.reason : e.note;
      if (sub) row.append(el('span', { cls: 'am-sub', textContent: sub }));
      if (e.title) row.title = e.title;
      if (!ok) row.style.opacity = '0.5';
      const askKey = `${key}:${e.id}`;
      row.addEventListener('click', () => {
        if (!ok) {
          this.host.haptic('fail');
          return;
        }
        if (!e.ask) return e.run();
        this.menuUi.ask = this.menuUi.ask === askKey ? null : askKey;
        this.render();
      });
      list.append(row);
      if (this.menuUi.ask === askKey && e.ask) {
        // fenêtre modale centrée, fixe : visible sans défiler la liste, gros boutons tactiles ; clic sur le fond = annuler
        const cancel = () => {
          this.menuUi.ask = null;
          this.render();
        };
        const back = el('div', {
          cls: 'corruptback askback',
          style: { position: 'fixed', inset: '0', zIndex: '1000', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', touchAction: 'none' },
        });
        back.dataset.testid = 'menu-ask';
        back.addEventListener('click', (ev) => {
          if (ev.target === back) cancel();
        });
        const box = el('div', {
          cls: 'tip actmenu-ask',
          style: {
            width: 'min(440px, 96vw)',
            maxHeight: '96vh',
            overflowY: 'auto',
            touchAction: 'pan-y',
            background: '#14110e',
            border: '1px solid #8a6a3a',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          },
        });
        for (const line of e.ask) box.append(el('div', { cls: 'base', textContent: line }));
        const yes = el('button', { cls: 'btn primary', textContent: 'Confirmer', style: { minHeight: '48px', flex: '1' } });
        yes.dataset.act = e.okAct ?? 'menu-ok';
        yes.addEventListener('click', () => {
          this.menuUi.ask = null;
          e.run();
        });
        const no = el('button', { cls: 'btn', textContent: 'Annuler', style: { minHeight: '48px', flex: '1' } });
        no.dataset.act = 'menu-cancel';
        no.addEventListener('click', cancel);
        box.append(el('div', { cls: 'tabs', style: { gap: '8px' } }, yes, no));
        back.append(box);
        list.append(back);
      }
    }
    if (sec.foot) list.append(el('div', { cls: 'base', textContent: sec.foot }));
  }
  return list;
}

/** Lignes « Percer (Larzuk) » et « Ajouter des châsses (Cube) » d'un objet : visibles seulement si l'objet est de la bonne famille et sans châsse */
export function socketEntriesImpl(this: Panels, g: Game, it: Item, ref: CorruptRef): ActEntry[] {
  const c = g.character;
  const out: ActEntry[] = [];
  if (it.map || it.sockets > 0 || it.corrupted || it.runeword || baseOf(it).maxSockets <= 0) return out;
  const town = g.mode === 'town';
  const lz = g.socketQuestCheck(ref);
  const left = g.socketQuestAvailable();
  if (g.socketQuestEligible(it).ok) {
    out.push({
      id: 'larzuk',
      okAct: 'larzuk-ok',
      label: 'Percer (Larzuk)',
      right: left ? '1 par difficulté' : 'utilisée',
      ok: lz.ok,
      reason: lz.reason,
      note: lz.ok ? 'Quête de Larzuk : 1 utilisation restante à cette difficulté' : undefined,
      ask: lz.ok ? ['Percer cet objet ? Il n’y en a qu’une par difficulté.', `Résultat attendu : ${lz.preview}.`] : undefined,
      run: () => {
        const r = g.socketQuestItem(ref);
        this.menuUi.open = null;
        if (!r.ok) {
          this.host.haptic('fail');
          this.host.message(r.reason ?? 'Impossible', '#d66');
        } else {
          this.host.itemSound(baseOf(it).type);
          this.host.haptic('tap');
          this.host.message(`Larzuk : ${r.sockets} châsse${(r.sockets ?? 0) > 1 ? 's' : ''}`, '#e8b04a');
        }
        this.render();
      },
    });
  }
  // lignes ajoutées par les mods (point d'insertion `item.socketActions` ; pd2 : fabrication de la boîte à énigme de Larzuk)
  const ctx = {
    game: g,
    host: modUiHost(this.host),
    item: it,
    ref,
    town,
    render: () => this.render(),
    closeMenu: () => {
      this.menuUi.open = null;
    },
  };
  for (const list of modParts(
    contributions('item.socketActions').map((f) => () => f(ctx)),
    [],
  ))
    out.push(...list);
  const sockRecipes = addSocketsRecipesFor(it);
  for (const rec of sockRecipes) {
    const chk = addSocketsCheck(c, it, rec.id);
    // une recette qui ne peut jamais convenir à cet objet (qualité) n'encombre pas la liste
    if (!chk.ok && /^(Objet normal|Ni unique|Objet non accepté)/.test(chk.reason ?? '')) continue;
    const cost = chk.parts.map((p) => `${p.n > 1 ? `${p.n} × ` : ''}${p.name}`).join(' + ');
    const rng = chk.range[0] === chk.range[1] ? `${chk.range[0]}` : `${chk.range[0]} à ${chk.range[1]}`;
    const ok = chk.ok && town;
    out.push({
      id: `sock-${rec.id}`,
      okAct: 'sock-ok',
      label: `${rec.name} (${rng} châsse${chk.range[1] > 1 ? 's' : ''})`,
      right: chk.parts.map((p) => `${p.have}/${p.n}`).join(' · '),
      ok,
      reason: !town && chk.ok ? 'À faire en ville' : chk.reason,
      note: cost,
      title: rec.desc,
      ask: ['Ajouter des châsses : le résultat est tiré au hasard.', `Coût : ${cost}.`],
      run: () => {
        const r = g.addSocketsItem(ref, rec.id);
        this.menuUi.open = null;
        if (!r.ok) {
          this.host.haptic('fail');
          this.host.message(r.reason ?? 'Impossible', '#d66');
        } else {
          this.host.itemSound(baseOf(it).type);
          this.host.haptic('tap');
          this.host.message(`Châsses : ${r.note}`, '#e8b04a');
        }
        this.render();
      },
    });
  }
  return out;
}

/** Opérations d'une carte (menu « Artisanat ») : les recettes du Cube (orbes, fortification, corruption…) en un clic, avec coût et stock */
export function mapEntriesImpl(this: Panels, g: Game, ref: MapRef, it: Item): ActEntry[] {
  const c = g.character;
  const town = g.mode === 'town';
  return RULES['maps.ops']().map((op) => {
    const chk = RULES['maps.opCheck'](c, it, op.id);
    const cost = `1 ${chk.matName.toLowerCase()}`;
    const ask = op.id === 'corrupt' ? modSetting(g.settings, 'confirmCorrupt') !== false : op.irreversible && modSetting(g.settings, 'confirmMapUpgrade') !== false;
    return {
      id: `mapop-${op.id}`,
      okAct: 'mapop-ok',
      label: op.label,
      right: chk.ok ? `${cost} — ${chk.have}` : undefined,
      ok: chk.ok && town,
      reason: chk.ok ? 'À faire en ville' : chk.reason,
      title: `${chk.matName} : ${chk.have}`,
      ask: ask ? [`${op.label} : définitif${op.id === 'corrupt' ? ' (la carte ne pourra plus être modifiée)' : ''}. Coût : ${cost}.`] : undefined,
      run: () => {
        const r = g.upgradeMap(ref, op.id);
        if (!r.ok) {
          this.host.haptic('fail');
          this.host.message(r.reason ?? 'Impossible', '#d66');
        } else {
          this.host.itemSound('map');
          this.host.haptic('tap');
          this.host.message(`${op.label}${r.note ? ` : ${r.note}` : ''}`, '#e8b04a');
        }
        this.render();
      },
    } satisfies ActEntry;
  });
}

/** Ligne « Corrompre » (sac, coffre, objet porté) : mêmes règles et même coût que la recette du Cube, avec la fenêtre de confirmation (probabilités) */
export function corruptEntryImpl(this: Panels, g: Game, it: Item, ref: CorruptRef): ActEntry | null {
  if (it.map || g.mode !== 'town') return null;
  const chk = corruptShardCheck(g.character, it);
  if (!chk.ok && chk.reason !== 'Déjà corrompu' && chk.reason !== 'Aucun éclat') return null;
  const run = () => {
    const r = g.corruptItemWithShard(ref);
    this.menuUi.corruptAsk = null;
    this.menuUi.open = null;
    if (!r.ok) {
      this.host.haptic('fail');
      this.host.message(r.reason ?? 'Impossible', '#d66');
    } else {
      this.host.itemSound(baseOf(it).type);
      this.host.haptic('tap');
      this.host.message(`Corruption : ${r.note}`, '#e8b04a');
    }
    this.render();
  };
  return {
    id: 'corrupt',
    label: 'Corrompre',
    right: `${chk.cost} éclat — ${chk.have}`,
    ok: chk.ok,
    reason: chk.reason,
    title: `Éclats de Pierre-Monde : ${chk.have}`,
    run: () => {
      if (modSetting(g.settings, 'confirmCorrupt') === false) return run();
      this.menuUi.corruptAsk = it.uid;
      this.menuUi.open = null;
      this.render();
    },
    overlay: () => this.corruptOverlay(g, it, ref, chk, run),
  };
}

/** Fenêtre de confirmation de la corruption, centrée et fixe : visible sans défiler quelle que soit la largeur de la colonne */
export function corruptOverlayImpl(this: Panels, g: Game, it: Item, ref: CorruptRef, chk: { ok: boolean; cost: number; have: number }, run: () => void): HTMLElement | null {
  if (this.menuUi.corruptAsk !== it.uid || !chk.ok || corruptRefItem(g.character, ref) !== it) return null;
  const o = corruptionOdds(it);
  const pc = (x: number) => `${Math.round(x * 100)} %`;
  const back = el('div', {
    cls: 'corruptback',
    style: { position: 'fixed', inset: '0', zIndex: '1000', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' },
  });
  const box = el('div', { cls: 'tip corruptbox', style: { width: 'min(440px, 96vw)', maxHeight: '96vh', overflowY: 'auto', background: '#14110e', border: '1px solid #8a6a3a', padding: '10px' } });
  back.addEventListener('click', (ev) => {
    if (ev.target === back) {
      this.menuUi.corruptAsk = null;
      this.render();
    }
  });
  box.append(
    el('div', { cls: 'base', textContent: `Corruption définitive : issue au hasard, impossible à annuler. Coût : ${chk.cost} éclat de Pierre-Monde (il vous en reste ${chk.have - chk.cost}).` }),
  );
  const line = (label: string, v: number, color?: string) => {
    if (v > 0) box.append(el('div', { cls: 'statrow' }, el('span', { textContent: label, style: color ? { color } : {} }), el('b', { textContent: pc(v), style: color ? { color } : {} })));
  };
  line('Châsses', o.sockets);
  line('Propriété de corruption', o.mod);
  line('Aucun effet', o.none);
  line('Brique : l’objet devient un rare aléatoire', o.brick, '#ff5a4a');
  const row = el('div', { cls: 'tabs', style: { gap: '8px' } });
  const ok = el('button', { cls: 'btn primary', textContent: 'Confirmer', style: { flex: '1', minHeight: '48px' } });
  const no = el('button', { cls: 'btn', textContent: 'Annuler', style: { flex: '1', minHeight: '48px' } });
  ok.dataset.act = 'corrupt-ok';
  ok.addEventListener('click', run);
  no.addEventListener('click', () => {
    this.menuUi.corruptAsk = null;
    this.render();
  });
  row.append(ok, no);
  box.append(row);
  back.append(box);
  return back;
}

/** Ferme le menu déplié sans reconstruire le panneau (le geste qui le ferme doit pouvoir atteindre sa cible) */
export function closeMenuImpl(this: Panels): boolean {
  if (!this.menuUi.open && !this.menuUi.socketOpen) return false;
  this.menuUi.open = null;
  this.menuUi.ask = null;
  this.menuUi.socketOpen = false;
  this.root.querySelectorAll('.actmenu').forEach((n) => n.remove());
  this.root.querySelectorAll<HTMLElement>('.actmenu-toggle').forEach((t) => t.classList.remove('sel'));
  return true;
}
