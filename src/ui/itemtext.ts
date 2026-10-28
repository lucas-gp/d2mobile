/** Infobulles d'objets et comparaison avec l'équipement porté (lecture seule). */
import type { Item, RolledMod } from '../sim/item';
import { durabilityEnabled, durabilityOf, isIndestructible, maxDurability } from '../sim/durability';
import { quiverFits } from '../data/items/quivers';
import { baseOf, itemFinal, itemName, modLabel, partialActive, partialValue, wornSetPieces } from '../sim/itemstats';
import { canEquip, canWear, computeDerived, type CharacterState } from '../sim/character';
import { SET_BY_ID, SET_ITEM_BY_ID } from '../data/items/sets';
import { RUNEWORDS, runewordFits } from '../data/items/runewords';
import { GEM_BY_ID, RUNE_BY_ID } from '../data/items/runes';
import type { DerivedStats } from '../sim/derived';
import type { ItemBase, Slot } from '../data/types';
import { el } from './dom';
import { labelClass } from './hud';
import { targetSlot } from '../sim/inventory';
import { RULES } from '../mods/rules';
import { MAP_AFFIX_BY_ID, MAP_TIER_LEVEL, MAP_ZONE_BY_ID } from '../data/maps';

const TYPE_FR: Record<string, string> = {
  staff: 'Bâton',
  orb: 'Orbe (Sorcière)',
  wand: 'Baguette',
  sword: 'Épée',
  dagger: 'Dague',
  mace: 'Masse',
  axe: 'Hache',
  bow: 'Arc',
  crossbow: 'Arbalète',
  polearm: 'Arme d’hast',
  spear: 'Lance',
  javelin: 'Javelot (Amazone)',
  claw: 'Griffes (Assassin)',
  scepter: 'Sceptre (Paladin)',
  thrown: 'Arme de jet',
  primal: 'Casque primitif (Barbare)',
  head: 'Tête réduite (Nécromancien)',
  circlet: 'Diadème',
  helm: 'Casque',
  pelt: 'Peau (Druide)',
  armor: 'Armure',
  shield: 'Bouclier',
  gloves: 'Gants',
  boots: 'Bottes',
  belt: 'Ceinture',
  amulet: 'Amulette',
  ring: 'Anneau',
  smallcharm: 'Charme',
  largecharm: 'Charme',
  grandcharm: 'Charme',
  jewel: 'Joyau',
  rune: 'Rune',
  gem: 'Gemme',
  potion: 'Potion',
  tpot: 'Potion de jet',
  map: 'Carte',
  currency: 'Objet',
};

import { throwDescription } from '../sim/throwpotion';

export function itemTooltip(item: Item, c: CharacterState): HTMLElement {
  const b = baseOf(item);
  const f = itemFinal(item, c.level);
  const d = computeDerived(c, 0);
  const box = el('div', { cls: 'tip' });
  headerLines(box, item, b, f, c, d);
  if (item.map) {
    mapLines(box, item, item.map);
    return box;
  }
  runeGemLines(box, b);
  if (f.mods.length) modLines(box, item, f.mods);
  if (item.sockets > 0) socketLines(box, item, b);
  if (item.setId) setLines(box, item, item.setId, c);
  footerLines(box, item, b, c, d);
  return box;
}

/** Nom, base et type, dégâts / défense / blocage, prérequis (en rouge s'ils ne sont pas remplis), quantité, potions de jet */
function headerLines(box: HTMLElement, item: Item, b: ItemBase, f: ReturnType<typeof itemFinal>, c: CharacterState, d: DerivedStats): void {
  box.append(el('div', { cls: `t ${labelClass(item)}`, textContent: itemName(item) }));
  if (item.quality !== 'normal' || item.runeword)
    box.append(el('div', { cls: 'base', textContent: `${b.name} (${TYPE_FR[b.type] ?? b.type}${b.tier === 1 ? ', exceptionnel' : b.tier === 2 ? ', élite' : ''})` }));
  else box.append(el('div', { cls: 'base', textContent: `${TYPE_FR[b.type] ?? b.type}${b.tier === 1 ? ' exceptionnel' : b.tier === 2 ? ' élite' : ''}` }));
  if (f.dmg) box.append(el('div', { textContent: `Dégâts : ${f.dmg[0]} – ${f.dmg[1]}${b.twoHanded ? ' (deux mains)' : ''}` }));
  if (f.defense !== undefined) box.append(el('div', { textContent: `Défense : ${f.defense}` }));
  if (f.block) box.append(el('div', { textContent: `Blocage : ${f.block} %` }));
  const reqs: [string, number, number][] = [
    ['Niveau', f.reqLvl, c.level],
    ['Force', f.reqStr, d.str],
    ['Dextérité', f.reqDex, d.dex],
  ];
  // a game mode that lifts the requirements (rule `char.equipNeedsReqs`, lot 290: Survivals) shows them, never in red
  const reqsCount = RULES['char.equipNeedsReqs'](c);
  for (const [n, need, have] of reqs)
    if (need > 1 || (n === 'Niveau' && need > 1)) box.append(el('div', { cls: `req${have < need && reqsCount ? ' bad' : ''}`, textContent: `${n} requis(e) : ${need}` }));
  if (b.stack && item.qty && item.qty > 1) box.append(el('div', { textContent: `Quantité : ${item.qty}` }));
  if (b.type === 'tpot') {
    box.append(el('hr'));
    for (const l of throwDescription(b.id)) box.append(el('div', { cls: 'mod', textContent: l }));
    box.append(el('div', { cls: 'base', textContent: 'Se lance avec la touche G ou le bouton de lancer ; ignore vos caractéristiques ; jamais en ville.' }));
  }
}

/** Carte d'endgame : niveau de zone, zone unique ou immunités, affixes, fortifiée / infusée / héroïque, corruption, bonus cumulés */
function mapLines(box: HTMLElement, item: Item, m: NonNullable<Item['map']>): void {
  const bonus = RULES['maps.bonuses'](item);
  box.append(el('div', { textContent: `Niveau de zone : ${MAP_TIER_LEVEL[m.tier]}` }));
  const uz = MAP_ZONE_BY_ID[m.zone]?.unique;
  if (uz) box.append(el('div', { cls: 'q-unique', textContent: `${uz.text} · aucun monstre immunisé` }));
  // immunités de la carte (PD2 les annonce sur la carte) : certains monstres de la zone sont immunisés à ces éléments
  const ELEM_NAMES: Record<string, string> = { fire: 'Feu', cold: 'Froid', light: 'Foudre', poison: 'Poison', phys: 'Physique' };
  const immune = MAP_ZONE_BY_ID[m.zone]?.immune ?? [];
  if (!uz) {
    box.append(
      el('div', {
        cls: 'mod bad',
        textContent: immune.length ? `Immunités : ${immune.map((e) => ELEM_NAMES[e] ?? e).join(', ')} (${RULES['maps.immunePct']()} % des monstres)` : 'Aucune immunité propre à la zone',
      }),
    );
  }
  if (m.mods.length) box.append(el('hr'));
  for (const mod of m.mods) {
    const a = MAP_AFFIX_BY_ID[mod.id];
    if (a) box.append(el('div', { cls: 'mod', textContent: a.text.replace('{v}', String(mod.value)) }));
  }
  if (m.fortified) box.append(el('div', { cls: 'mod', textContent: 'Fortifiée : moitié moins de monstres, deux fois plus résistants et généreux' }));
  if (m.catalyst) box.append(el('div', { cls: 'mod', textContent: 'Infusée : la zone contient un événement' }));
  if (m.heroic) box.append(el('div', { cls: 'mod', textContent: 'Héroïque : +10 % d’expérience, +20 % de densité, +20 % d’objets magiques et d’or' }));
  if (m.corruptMod)
    box.append(
      el('div', { cls: 'mod corrupt' }, el('span', { cls: 'corrupt-dot', textContent: '* ', title: 'Modifié par la corruption' }), `Corrompue : ${RULES['maps.corruptModText'](m.corruptMod)}`),
    );
  const parts = [bonus.xp ? `+${bonus.xp} % d'expérience` : '', bonus.density ? `+${bonus.density} % de densité` : '', bonus.mf ? `+${bonus.mf} % MF et or` : ''].filter(Boolean);
  if (parts.length) box.append(el('div', { cls: 'base', textContent: parts.join(' · ') }));
}

/** Rune ou gemme : effet par emplacement ; rune : mots runiques qui l'utilisent */
function runeGemLines(box: HTMLElement, b: ItemBase): void {
  const rune = RUNE_BY_ID[b.id];
  if (rune) {
    box.append(el('hr'));
    const fmtList = (l: typeof rune.weapon) => l.map((m) => modLabel({ stat: m.stat, value: m.max, param: m.param })).join(', ');
    box.append(
      el('div', { cls: 'mod', textContent: `Arme : ${fmtList(rune.weapon)}` }),
      el('div', { cls: 'mod', textContent: `Armure/Casque : ${fmtList(rune.armor)}` }),
      el('div', { cls: 'mod', textContent: `Bouclier : ${fmtList(rune.shield)}` }),
    );
  }
  const gem = GEM_BY_ID[b.id];
  if (gem) {
    box.append(el('hr'));
    const fmtList = (l: typeof gem.weapon) => l.map((m) => modLabel({ stat: m.stat, value: m.max, param: m.param })).join(', ');
    box.append(
      el('div', { cls: 'mod', textContent: `Arme : ${fmtList(gem.weapon)}` }),
      el('div', { cls: 'mod', textContent: `Armure/Casque : ${fmtList(gem.armor)}` }),
      el('div', { cls: 'mod', textContent: `Bouclier : ${fmtList(gem.shield)}` }),
    );
  }
  if (rune) {
    const rws = RUNEWORDS.filter((r) => r.runes.includes(b.id));
    if (rws.length)
      box.append(
        el('div', {
          cls: 'base',
          textContent: `Mots runiques : ${rws
            .slice(0, 8)
            .map((r) => r.name)
            .join(', ')}${rws.length > 8 ? ` (+${rws.length - 8})` : ''}`,
        }),
      );
  }
}

/** Propriétés (lignes changées par la corruption marquées d'un point rouge) */
function modLines(box: HTMLElement, item: Item, mods: RolledMod[]): void {
  box.append(el('hr'));
  // lignes ajoutées ou modifiées par la corruption : petit point rouge devant (comme dans PD2)
  const corruptKeys = new Set((item.corrupted?.mods ?? []).map((x) => `${x.stat}|${x.param ?? ''}`));
  for (const m of mods) {
    const t = modLabel(m);
    if (!t) continue;
    if (corruptKeys.has(`${m.stat}|${m.param ?? ''}`)) box.append(el('div', { cls: 'mod' }, el('span', { cls: 'corrupt-dot', textContent: '● ', title: 'Modifié par la corruption' }), t));
    else box.append(el('div', { cls: 'mod', textContent: t }));
  }
}

/** Châsses (serties / total) et, sur une base normale ou supérieure, mots runiques possibles */
function socketLines(box: HTMLElement, item: Item, b: ItemBase): void {
  const filled = item.socketed.map((s) => baseOf(s).name).join(', ');
  const sockText = `Châsses : ${item.socketed.length}/${item.sockets}${filled ? ` — ${filled}` : ''}`;
  // châsses ajoutées par la corruption : point rouge
  if (item.corrupted?.addSockets) box.append(el('div', { cls: 'base' }, el('span', { cls: 'corrupt-dot', textContent: '● ', title: 'Modifié par la corruption' }), sockText));
  else box.append(el('div', { cls: 'base', textContent: sockText }));
  // runewords possibles sur cette base (aide au joueur)
  if (!item.runeword && (item.quality === 'normal' || item.quality === 'superior')) {
    const rw = RUNEWORDS.filter((r) => r.runes.length === item.sockets && runewordFits(r, b)).slice(0, 4);
    if (rw.length) box.append(el('div', { cls: 'base', textContent: `Mots runiques possibles : ${rw.map((r) => `${r.name} (${r.runes.map((x) => RUNE_BY_ID[x].name).join(' ')})`).join(' ; ')}` }));
  }
}

/** Objet de set : pièces portées, bonus de la pièce et du set (actifs ou non) */
function setLines(box: HTMLElement, item: Item, setId: string, c: CharacterState): void {
  const si = SET_ITEM_BY_ID[setId];
  const set = SET_BY_ID[si?.set ?? ''];
  if (set && si) {
    // pièces portées : celles de l'équipement ; l'objet affiché compte s'il est lui-même équipé
    const worn = wornSetPieces(
      Object.values(c.equipment).filter((x): x is Item => !!x),
      set.id,
    );
    const modText = (m: { stat: string; max: number; param?: string }) => modLabel({ stat: m.stat, value: m.max, param: m.param } as RolledMod);
    const line = (text: string, on: boolean) => {
      if (text) box.append(el('div', { cls: `set-line ${on ? 'set-on' : 'set-off'}`, textContent: `${on ? '✔' : '✖'} ${text}` }));
    };
    box.append(el('hr'), el('div', { cls: 'q-set', textContent: `${set.name} (${worn.size}/${set.items.length})` }));
    for (const id of set.items) box.append(el('div', { cls: `set-piece ${worn.has(id) ? 'set-on' : 'set-off'}`, textContent: `${worn.has(id) ? '•' : '◦'} ${SET_ITEM_BY_ID[id].name}` }));
    if (si.partial?.length) {
      box.append(el('div', { cls: 'base', textContent: 'Bonus de cette pièce' }));
      si.partial.forEach((p, pi) => {
        const need = p.with?.length ? ` + ${p.with.map((id) => SET_ITEM_BY_ID[id]?.name ?? id).join(', ')}` : '';
        p.mods.forEach((m, mi) => line(`(${p.count} pièces${need}) ${modText({ ...m, max: partialValue(item, si, pi, mi, m) })}`, partialActive(p, worn)));
      });
    }
    if (set.bonuses.length) {
      box.append(el('div', { cls: 'base', textContent: 'Bonus du set' }));
      for (const bz of set.bonuses) for (const m of bz.mods) line(`(${bz.count === set.items.length ? 'complet' : `${bz.count} pièces`}) ${modText(m)}`, worn.size >= bz.count);
    }
  }
}

/** Éthéré, durabilité, corruption, raison pour laquelle l'objet ne s'équipe pas */
function footerLines(box: HTMLElement, item: Item, b: ItemBase, c: CharacterState, d: DerivedStats): void {
  if (item.ethereal) box.append(el('div', { cls: 'base', textContent: 'Éthéré (+25 % de dégâts et de défense de base, −10 en Force et Dextérité requises)' }));
  const mx = durabilityEnabled() ? maxDurability(item) : 0;
  if (mx > 0) {
    const indestr = isIndestructible(item);
    const cur = durabilityOf(item);
    box.append(
      el('div', {
        cls: `base${cur <= 0 ? ' bad' : cur / mx < 0.25 ? ' warn' : ''}`,
        textContent: indestr ? 'Indestructible' : cur <= 0 ? `Brisé (0 / ${mx}) : sans effet` : `Durabilité : ${cur} / ${mx}`,
      }),
    );
  }
  if (item.corrupted)
    box.append(el('div', { cls: 'corrupt', textContent: item.corrupted.bricked ? 'Corrompu (transformé) — ● : ligne modifiée par la corruption' : 'Corrompu — ● : ligne modifiée par la corruption' }));
  const ok = b.slot ? canEquip(c, item, { str: d.str, dex: d.dex }) : { ok: true };
  const wear = b.slot ? canWear(c, item, { str: d.str, dex: d.dex }) : { ok: true };
  if (!wear.ok && wear.reason) box.append(el('div', { cls: 'req bad', textContent: wear.reason }));
  else if (!ok.ok) {
    // a game mode lifts what blocks it (lots 289, 290): worn asleep until the requirement is met (rule `char.itemActive`), or at once
    if (!RULES['char.itemActive'](c, item)) {
      if (ok.reason) box.append(el('div', { cls: 'req bad', textContent: ok.reason }));
      box.append(el('div', { cls: 'req bad', textContent: 'Porté, il reste inactif tant que ce prérequis manque' }));
    } else box.append(el('div', { cls: 'req', textContent: 'Aucun prérequis dans ce mode : actif dès qu’il est porté' }));
  }
}

/** Différences de statistiques si l'on équipe l'objet (vie, mana, résistances, FCR…) */
export function compareDeltas(item: Item, c: CharacterState, slotOverride?: Slot): { label: string; delta: number; unit: string }[] {
  const slot = slotOverride ?? targetSlot(c, item);
  if (!slot) return [];
  const before = computeDerived(c, 0);
  const clone: CharacterState = { ...c, equipment: { ...c.equipment, [slot]: item }, inventory: c.inventory.map((x) => (x === item ? null : x)) };
  const off = clone.equipment.offhand;
  if (baseOf(item).twoHanded && !(off && baseOf(off).type === 'quiver' && quiverFits(baseOf(off), baseOf(item)))) delete clone.equipment.offhand;
  const after = computeDerived(clone, 0);
  return diffDerived(before, after);
}

export function diffDerived(a: DerivedStats, b: DerivedStats): { label: string; delta: number; unit: string }[] {
  const out: { label: string; delta: number; unit: string }[] = [];
  const add = (label: string, x: number, y: number, unit = '') => {
    const d = Math.round((y - x) * 10) / 10;
    if (d !== 0) out.push({ label, delta: d, unit });
  };
  add('Vie', a.lifeMax, b.lifeMax);
  add('Mana', a.manaMax, b.manaMax);
  add('Défense', a.defense, b.defense);
  add('Rés. Feu', a.res.fire, b.res.fire, ' %');
  add('Rés. Froid', a.res.cold, b.res.cold, ' %');
  add('Rés. Foudre', a.res.light, b.res.light, ' %');
  add('Rés. Poison', a.res.poison, b.res.poison, ' %');
  add('Incantation', a.fcr, b.fcr, ' %');
  add('Récup. coup', a.fhr, b.fhr, ' %');
  add('Course', a.frw, b.frw, ' %');
  add('Magic find', a.mf, b.mf, ' %');
  // plus grand écart de niveau sur une compétence (« +1 aux compétences de Froid » touche une dizaine de compétences : la somme afficherait ±10)
  let skDelta = 0;
  for (const k of new Set([...Object.keys(a.skillLevels), ...Object.keys(b.skillLevels)])) {
    const dk = (b.skillLevels[k] ?? 0) - (a.skillLevels[k] ?? 0);
    if (Math.abs(dk) > Math.abs(skDelta)) skDelta = dk;
  }
  add('Niveaux de compétences', 0, skDelta);
  add('Dégâts feu', a.elemDmgPct.fire, b.elemDmgPct.fire, ' %');
  add('Dégâts froid', a.elemDmgPct.cold, b.elemDmgPct.cold, ' %');
  add('Dégâts foudre', a.elemDmgPct.light, b.elemDmgPct.light, ' %');
  // a game mode's rows (rule `ui.compareRows`, lot 292: damage, damage reduction, speeds); base: these
  return RULES['ui.compareRows'](a, b, out);
}

/** Score simple d'amélioration (flèche verte sur la case) */
export function isUpgrade(item: Item, c: CharacterState): boolean {
  const b = baseOf(item);
  if (!b.slot) return false;
  const d = computeDerived(c, 0);
  if (!canWear(c, item, { str: d.str, dex: d.dex }).ok) return false;
  const deltas = compareDeltas(item, c);
  let score = 0;
  for (const x of deltas) {
    const w = x.label === 'Niveaux de compétences' ? 25 : x.label.startsWith('Rés') ? 1.2 : x.label === 'Incantation' ? 1 : x.label === 'Vie' || x.label === 'Mana' ? 0.3 : 0.2;
    score += x.delta * w;
  }
  return score > 3;
}
