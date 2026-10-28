/**
 * The hub's shop (lot 292, Run mode): one screen over the hub, reached without walking, four tabs and nothing else: **Buy** (the stock of
 * the run's end, its best buy marked), **Bag** (wear or sell what the runs brought), **Buy back** (what was sold in the session) and
 * **Gamble** (an unknown item of a base, Diablo II's odds). Each row: the item's name in its quality's colour, its price, its comparison
 * with the worn item (green better, red worse); a tap shows its full tooltip, a long press (or the row's button) buys, wears or sells.
 * Prices and stalls: `sim/economy.ts`, `sim/shop.ts`.
 */
import type { HudCtx } from '../../../src/mods/api';
import { BASE_BY_ID, compareDeltas, itemName, itemTooltip, type Game, type Item } from '../../../src/mods/sdk';
import { QUALITY_COLOR } from '../sim/loot';
import { bestBuy, bestSlotOf, buyShop, equipFromBag, gainOf, gambleShop, gambleStock, shopStock } from '../sim/shop';
import { button, ensureStyle, h } from './dom';
import { lootPages, pageToBag, sellFromPages } from '../sim/runloot';

export type ShopTab = 'buy' | 'bag' | 'back' | 'gamble';

/** A long press on a row (milliseconds): its main action */
export const HOLD = 450;

const SLOT_NAME: Record<string, string> = {
  head: 'Tête',
  body: 'Armure',
  mainhand: 'Arme',
  offhand: 'Main gauche',
  gloves: 'Gants',
  boots: 'Bottes',
  belt: 'Ceinture',
  amulet: 'Amulette',
  ring: 'Anneau',
};

/** The comparison's first rows (green better, red worse), at most `n` */
function deltaChips(g: Game, it: Item, n = 4): HTMLElement | null {
  const slot = bestSlotOf(g, it);
  if (!slot) return null;
  const rows = compareDeltas(it, g.character, slot as never).slice(0, n);
  if (!rows.length) return h('div', { cls: 'sv-deltas' }, h('span', { cls: 'sv-same', text: 'Comme l’objet porté' }));
  return h('div', { cls: 'sv-deltas' }, ...rows.map((r) => h('span', { cls: r.delta > 0 ? 'sv-up' : 'sv-down', text: `${r.label} ${r.delta > 0 ? '+' : ''}${r.delta}${r.unit}` })));
}

/** A row: name, line under it, comparison, actions; a tap opens the tooltip, a long press runs `main` */
function itemRow(g: Game, it: Item, sub: string, actions: HTMLButtonElement[], main: (() => void) | null, open: boolean, toggle: () => void, badge?: string): HTMLElement {
  const name = h('b', { cls: 'sv-iname', text: itemName(it), style: { color: QUALITY_COLOR[it.quality] ?? '#d8cbb0' } });
  const row = h(
    'div',
    { cls: `sv-item${open ? ' open' : ''}${badge ? ' best' : ''}`, data: { svItem: it.uid } },
    h('div', { cls: 'sv-iline' }, name, badge ? h('span', { cls: 'sv-badge', text: badge }) : null),
    h('div', { cls: 'sv-isub', text: sub }),
    BASE_BY_ID[it.base]?.slot ? deltaChips(g, it) : null,
    h('div', { cls: 'sv-row sv-iacts' }, ...actions),
    open ? h('div', { cls: 'sv-itip' }, itemTooltip(it, g.character)) : null,
  );
  let timer = 0;
  let held = false;
  let at: [number, number] = [0, 0];
  const stop = () => {
    clearTimeout(timer);
    timer = 0;
  };
  row.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    held = false;
    at = [e.clientX, e.clientY];
    stop();
    if (main)
      timer = window.setTimeout(() => {
        timer = 0;
        held = true;
        main();
      }, HOLD);
  });
  row.addEventListener('pointermove', (e) => {
    if (timer && Math.hypot(e.clientX - at[0], e.clientY - at[1]) > 8) stop();
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) row.addEventListener(ev, stop);
  row.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (held) {
      held = false;
      return;
    }
    toggle();
  });
  return row;
}

/** Opens the shop over the hub, on `tab` */
export function openShop(ctx: HudCtx, tab: ShopTab = 'buy'): { close(): void } {
  ensureStyle();
  const g = ctx.game;
  const node = h('div', { cls: 'sv-screen', data: { svScreen: 'shop' } });
  const scr = ctx.screen.open(node);
  let cur: ShopTab = tab;
  let openUid = '';
  let note = '';
  const say = (text: string, ok = true) => {
    note = text;
    ctx.host.haptic(ok ? 'tap' : 'fail');
    draw();
  };
  const toggle = (uid: string) => () => {
    openUid = openUid === uid ? '' : uid;
    draw();
  };
  const sell = (idx: number, it: Item) => {
    const price = g.sellPrice(it);
    if (g.sell(idx)) say([`Vendu : ${itemName(it)}`, `+${price} or`].join(' · '));
    else say('Impossible', false);
  };
  const equip = (idx: number, it: Item) => {
    if (equipFromBag(g, idx)) say(`Équipé : ${itemName(it)}`);
    else say('Impossible', false);
  };
  const draw = () => {
    const c = g.character;
    const stock = shopStock(g);
    const bag = c.inventory.map((it, idx) => ({ it, idx })).filter((x): x is { it: Item; idx: number } => !!x.it);
    const nPages = lootPages(c).length;
    const tabs: [ShopTab, string][] = [
      ['buy', `Acheter (${stock.length})`],
      ['bag', nPages ? `Sac (${bag.length} + ${nPages})` : `Sac (${bag.length})`],
      ['back', `Racheter (${g.buyback.length})`],
      ['gamble', 'Jeu d’argent'],
    ];
    const tabRow = h(
      'div',
      { cls: 'sv-row sv-tabs' },
      ...tabs.map(([id, label]) => {
        const b = button(
          label,
          () => {
            cur = id;
            openUid = '';
            note = '';
            draw();
          },
          cur === id ? 'primary' : '',
        );
        b.dataset.tab = id;
        return b;
      }),
    );
    const list = h('div', { cls: 'sv-items', data: { sv: `shop-${cur}` } });
    if (cur === 'buy') {
      const best = bestBuy(g);
      stock.forEach((e, i) => {
        const b = BASE_BY_ID[e.item.base];
        const can = c.gold >= e.price;
        const buy = button(`Acheter · ${e.price} or`, () => act(i), can ? 'primary' : '');
        buy.disabled = !can;
        buy.dataset.sv = 'buy';
        const act = (idx: number) => {
          const it = stock[idx]?.item;
          const r = buyShop(g, idx);
          if (!r.ok || !it) return say(r.reason ?? 'Impossible', false);
          say([`Acheté : ${itemName(it)}`, r.equipped ? 'équipé' : 'dans le sac'].join(' · '));
        };
        list.append(
          itemRow(
            g,
            e.item,
            `${SLOT_NAME[b?.slot ?? ''] ?? b?.name ?? ''} · niveau ${e.item.ilvl}`,
            [buy],
            can ? () => act(i) : null,
            openUid === e.item.uid,
            toggle(e.item.uid),
            best?.idx === i ? 'Meilleur achat' : undefined,
          ),
        );
      });
      if (!stock.length) list.append(h('p', { cls: 'sv-sub', text: 'Tout est vendu : un nouveau stock arrive à la fin de la prochaine run.' }));
    } else if (cur === 'bag') {
      for (const { it, idx } of bag) {
        const b = BASE_BY_ID[it.base];
        const gain = gainOf(g, it);
        const acts: HTMLButtonElement[] = [];
        if (b?.slot) {
          const eq = button('Équiper', () => equip(idx, it), gain !== null && gain > 0 ? 'primary' : '');
          eq.dataset.sv = 'equip';
          acts.push(eq);
        }
        const sl = button(`Vendre · ${g.sellPrice(it)} or`, () => sell(idx, it));
        sl.dataset.sv = 'sell';
        acts.push(sl);
        list.append(itemRow(g, it, `${SLOT_NAME[b?.slot ?? ''] ?? b?.name ?? ''} · niveau ${it.ilvl}`, acts, b?.slot ? () => equip(idx, it) : null, openUid === it.uid, toggle(it.uid)));
      }
      // lot 293: the temporary pages (the bag was full at a run's end): to the bag, or sold
      const pages = lootPages(c);
      if (pages.length) list.append(h('p', { cls: 'sv-sub sv-blocked', data: { sv: 'pages-title' }, text: `Pages temporaires : ${pages.length} objets` }));
      pages.forEach((it, i) => {
        const b = BASE_BY_ID[it.base];
        const toBag = button('Au sac', () => (pageToBag(c, i) ? say(`Au sac : ${itemName(it)}`) : say('Inventaire plein', false)));
        toBag.dataset.sv = 'page-bag';
        const sl = button(`Vendre · ${g.sellPrice(it)} or`, () => say([`Vendu : ${itemName(it)}`, `+${sellFromPages(g, i)} or`].join(' · ')));
        sl.dataset.sv = 'page-sell';
        list.append(
          itemRow(
            g,
            it,
            `${SLOT_NAME[b?.slot ?? ''] ?? b?.name ?? ''} · niveau ${it.ilvl} · page temporaire`,
            [toBag, sl],
            () => (pageToBag(c, i) ? say(`Au sac : ${itemName(it)}`) : say('Inventaire plein', false)),
            openUid === it.uid,
            toggle(it.uid),
          ),
        );
      });
      if (!bag.length && !pages.length) list.append(h('p', { cls: 'sv-sub', text: 'Le sac est vide : ce que les runs rapportent y arrive, même après une mort.' }));
    } else if (cur === 'back') {
      g.buyback.forEach((e, i) => {
        const back = () => {
          const r = g.rebuy(i);
          if (r.ok) say(`Racheté : ${itemName(e.item)}`);
          else say(r.reason ?? 'Impossible', false);
        };
        const btn = button(`Racheter · ${e.price} or`, back);
        btn.disabled = c.gold < e.price;
        list.append(itemRow(g, e.item, `Vendu ${e.price} or`, [btn], c.gold >= e.price ? back : null, openUid === e.item.uid, toggle(e.item.uid)));
      });
      if (!g.buyback.length) list.append(h('p', { cls: 'sv-sub', text: 'Rien à racheter : ce que tu vends ici arrive dans cet onglet.' }));
    } else {
      gambleStock(g).forEach((e, i) => {
        const b = BASE_BY_ID[e.base];
        const play = () => {
          const r = gambleShop(g, i);
          if (!r.ok || !r.item) return say(r.reason ?? 'Impossible', false);
          const idx = c.inventory.indexOf(r.item);
          const worn = (gainOf(g, r.item) ?? 0) > 0 && idx >= 0 && equipFromBag(g, idx);
          say([`Révélé : ${itemName(r.item)}`, worn ? 'équipé' : 'dans le sac'].join(' · '));
        };
        const btn = button(`Parier · ${e.price} or`, play, c.gold >= e.price ? 'primary' : '');
        btn.disabled = c.gold < e.price;
        btn.dataset.sv = 'gamble';
        list.append(
          h(
            'div',
            { cls: 'sv-item', data: { svGamble: e.base } },
            h('div', { cls: 'sv-iline' }, h('b', { cls: 'sv-iname', text: b?.name ?? e.base })),
            h('div', { cls: 'sv-isub', text: `${SLOT_NAME[b?.slot ?? ''] ?? ''} · objet inconnu` }),
            h('div', { cls: 'sv-row sv-iacts' }, btn),
          ),
        );
      });
      list.prepend(h('p', { cls: 'sv-sub', text: 'Un objet inconnu, révélé à l’achat : rare 1 fois sur 10, ensemble 1 sur 1 000, unique 1 sur 2 000.' }));
    }
    const close = button('Fermer', () => scr.close());
    close.dataset.sv = 'close';
    node.replaceChildren(
      h(
        'div',
        { cls: 'sv-box sv-shop' },
        h('div', { cls: 'sv-shop-head' }, h('h2', { cls: 'sv-title', text: 'Boutique' }), h('b', { cls: 'sv-purse', data: { sv: 'purse' }, text: `${c.gold} or` }), close),
        tabRow,
        h('p', { cls: 'sv-sub sv-hint', text: 'Toucher : le détail · appui long : acheter, équiper' }),
        note ? h('p', { cls: 'sv-sub sv-note', data: { sv: 'note' }, text: note }) : null,
        list,
      ),
    );
  };
  draw();
  return scr;
}
