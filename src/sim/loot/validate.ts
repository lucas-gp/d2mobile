/**
 * Validation d'un objet généré : chaque règle de génération (D2/PD2) est vérifiée a posteriori.
 * Utilisé par le bot de butin massif, les tests et le hook de debug.
 */
import { BASE_BY_ID } from '../../data/items/bases';
import { upgradeTarget } from '../cube';
import { MAP_AFFIX_BY_ID, MAP_ZONE_BY_ID } from '../../data/maps';
import { AFFIX_BY_ID, RUNEWORD_BY_ID, SET_ITEM_BY_ID, UNIQUE_BY_ID, runewordFits } from '../../data/items/index';
import { type StatRoll } from '../../data/types';
import type { Item } from '../item';
import { baseAffixLevel } from './itemgen';
import { affixAllowed, affixTypeMatches } from '../../data/items/affixes';

function checkRolls(where: string, mods: StatRoll[], values: number[] | undefined, errs: string[]): void {
  if (!values || values.length !== mods.length) {
    errs.push(`${where} : ${values?.length ?? 0} valeurs pour ${mods.length} propriétés`);
    return;
  }
  mods.forEach((m, i) => {
    const lo = Math.min(m.min, m.max);
    const hi = Math.max(m.min, m.max);
    if (values[i] < lo - 1e-9 || values[i] > hi + 1e-9) errs.push(`${where} : ${m.stat} = ${values[i]} hors [${lo}, ${hi}]`);
  });
}

export function validateItem(it: Item): string[] {
  const errs: string[] = [];
  const b = BASE_BY_ID[it.base];
  if (!b) return [`base inconnue ${it.base}`];
  if (!it.uid) errs.push('uid manquant');
  // les potions portent leur palier (0..4) dans ilvl
  // lot 316: a potion keeps its item level (its tier is read from it, src/sim/potion-tier.ts); 0-4 were the tiers written there before
  if (b.type === 'potion' ? !(it.ilvl >= 0 && it.ilvl <= 120) : !(it.ilvl >= 1 && it.ilvl <= 120)) errs.push(`ilvl ${it.ilvl}`);
  if (b.stack) {
    if (!(it.qty && it.qty >= 1)) errs.push(`pile sans quantité (${b.id})`);
    return errs;
  }
  if (b.type === 'map') {
    // cartes : zone du bon palier (unique ⇔ zone unique), affixes connus
    const m = it.map;
    const z = m ? MAP_ZONE_BY_ID[m.zone] : undefined;
    if (!m || !z) return [...errs, `carte sans zone valide (${m?.zone})`];
    if (z.tier !== m.tier) errs.push(`carte : zone ${z.id} de palier ${z.tier} ≠ ${m.tier}`);
    if ((it.quality === 'unique') !== !!z.unique) errs.push(`carte : qualité ${it.quality} sur la zone ${z.id}`);
    for (const mod of m.mods) if (!MAP_AFFIX_BY_ID[mod.id]) errs.push(`carte : affixe inconnu ${mod.id}`);
    return errs;
  }
  const maxSock = b.maxSockets + (it.corrupted?.addSockets ?? 0);
  if (it.sockets < 0 || it.sockets > Math.max(maxSock, 0)) errs.push(`châsses ${it.sockets} > ${maxSock}`);
  if (it.socketed.length > it.sockets) errs.push('plus d’objets sertis que de châsses');
  const alvl = baseAffixLevel(b, it.ilvl);
  switch (it.quality) {
    case 'magic':
    case 'rare': {
      const aff = it.affixes ?? [];
      const max = it.quality === 'magic' ? 1 : 3;
      let pre = 0;
      let suf = 0;
      const groups = new Set<string>();
      if (aff.length === 0) errs.push(`${it.quality} sans affixe`);
      for (const a of aff) {
        const def = AFFIX_BY_ID[a.id];
        if (!def) {
          errs.push(`affixe inconnu ${a.id}`);
          continue;
        }
        if (def.kind === 'prefix') pre++;
        else suf++;
        if (groups.has(def.group)) errs.push(`groupe d'affixe en double ${def.group}`);
        groups.add(def.group);
        if (!affixAllowed(def, b, false)) errs.push(`affixe ${a.id} interdit sur ${b.type}`);
        if (def.level > alvl) errs.push(`affixe ${a.id} niv ${def.level} > alvl ${alvl}`);
        if (it.quality === 'rare' && !(def.rare && (!def.rareTypes || affixTypeMatches(b, def.rareTypes)))) errs.push(`affixe ${a.id} réservé aux magiques`);
        checkRolls(`affixe ${a.id}`, def.mods, a.values, errs);
      }
      if (pre > max || suf > max) errs.push(`${pre} préfixes / ${suf} suffixes pour un ${it.quality}`);
      break;
    }
    case 'unique': {
      const u = it.uniqueId ? UNIQUE_BY_ID[it.uniqueId] : undefined;
      if (!u) {
        errs.push(`unique inconnu ${it.uniqueId}`);
        break;
      }
      if (u.base !== b.id && !upgradedFrom(u.base, b.id)) errs.push(`unique ${u.id} sur la mauvaise base ${b.id}`);
      if (u.lvl > it.ilvl) errs.push(`unique ${u.id} (niv ${u.lvl}) tombé à ilvl ${it.ilvl}`);
      checkRolls(`unique ${u.id}`, u.mods, it.rolls, errs);
      break;
    }
    case 'set': {
      const s = it.setId ? SET_ITEM_BY_ID[it.setId] : undefined;
      if (!s) {
        errs.push(`objet de set inconnu ${it.setId}`);
        break;
      }
      if (s.base !== b.id && !upgradedFrom(s.base, b.id)) errs.push(`set ${s.id} sur la mauvaise base ${b.id}`);
      if (s.lvl > it.ilvl) errs.push(`set ${s.id} (niv ${s.lvl}) tombé à ilvl ${it.ilvl}`);
      checkRolls(`set ${s.id}`, s.mods, it.rolls, errs);
      break;
    }
    case 'runeword': {
      const rw = it.runeword ? RUNEWORD_BY_ID[it.runeword] : undefined;
      if (!rw) {
        errs.push(`mot runique inconnu ${it.runeword}`);
        break;
      }
      if (!runewordFits(rw, b)) errs.push(`mot runique ${rw.id} sur une base interdite ${b.id}`);
      if (it.sockets !== rw.runes.length) errs.push(`mot runique ${rw.id} : ${it.sockets} châsses pour ${rw.runes.length} runes`);
      const socketed = it.socketed.map((s) => s.base);
      if (socketed.join(',') !== rw.runes.join(',')) errs.push(`mot runique ${rw.id} : runes ${socketed.join(',')} ≠ ${rw.runes.join(',')}`);
      break;
    }
    case 'superior':
      if (!(it.superiorPct && it.superiorPct >= 1 && it.superiorPct <= 15)) errs.push(`supérieur sans bonus valide (${it.superiorPct})`);
      break;
  }
  return errs;
}

/** Base obtenue par la recette d'amélioration du Cube (même famille, palier supérieur) */
function upgradedFrom(orig: string, now: string): boolean {
  return upgradeTarget(orig, 1) === now || upgradeTarget(orig, 2) === now || (!!upgradeTarget(orig, 1) && upgradeTarget(upgradeTarget(orig, 1)!, 2) === now);
}
