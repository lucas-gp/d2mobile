/**
 * Planification et préchargement des feuilles de sprites d'une zone.
 * Fonctions extraites de la classe GameRenderer (renderer.ts) : `this` y désigne l'instance.
 */
import type { ClassId } from '../data/classes';
import type { World } from '../sim/world';
import { estimateWeight, type PrepGroups, type PrepItem } from '../platform/d2local-prep';
import { zoneFxIds, zoneMonsterIds } from './roster';
import type { ZoneDef } from '../data/zone-types';
import { d2Map } from '../data/d2map';
import { FX_BY_CLASS, FX_COMMON } from './fx';
import { groundSheets } from './ground';
import { MONSTER_BY_ID } from '../data/monsters';
import type { GameRenderer } from './renderer';
import { CORE_MARGIN, classSheets, monsterSprite, monsterAttacksSummon, stagedRun, objectSheetsFor } from './renderer-shared';

/** Planches nécessaires à une zone (chargement zone par zone) */
/**
 * Planches à charger pour la zone. `core` : seulement ce qu'il faut pour afficher le départ (classe, sol, décor, objets, monstres déjà
 * présents ou dont le groupe se déclenche vite) ; le reste (monstres lointains, boss) arrive en arrière-plan et le monstre
 * attend sa planche, invisible, comme le font déjà les runs à vagues.
 */
export function sheetsForImpl(this: GameRenderer, w: World, core = false): string[] {
  const ids = new Set<string>(classSheets(w, this.bank));
  if (w.character.classId === 'sorceress') ids.add('hydra');
  for (const g of w.zone.d2Map && d2Map(w.zone.d2Map.id) ? [] : groundSheets(w.zone, this.bank)) ids.add(g);
  const onD2Map = !!(w.zone.d2Map && d2Map(w.zone.d2Map.id));
  for (const p of w.zone.props) {
    if (onD2Map && !this.bank.isImported(`prop_${p.prop}`)) continue;
    ids.add(`prop_${p.prop}`);
    // décor importé propre à la zone (murs de D2) : chargé en plus, la planche commune reste le repli
    if (this.bank.isImported(`prop_${p.prop}.${w.zone.id}`)) ids.add(`prop_${p.prop}.${w.zone.id}`);
  }
  // décor posé des cartes D2 (torches, feux, braziers…) : une planche par jeton et par acte
  const dmap = w.zone.d2Map ? d2Map(w.zone.d2Map.id) : undefined;
  for (const [id] of (dmap?.raw as { decor?: [string, number, number][] } | undefined)?.decor ?? []) if (this.bank.has(id)) ids.add(id);
  const monsters = new Set<string>();
  if (stagedRun(w)) {
    // runs à vagues (Trône de Baal) : seulement les monstres affichés (vivants ou cadavres
    // récents) et ceux qui vont apparaître bientôt — gardes jusqu'à leur mort, vague suivante,
    // boss une fois les vagues vaincues. La zone frôlait sinon le budget de textures.
    // cadavres : seulement ceux de la vague en cours (ceux des précédentes s'effacent quand la
    // suivante arrive) ; vague suivante préchargée — jamais plus de deux vagues de planches
    const wave = w.run?.wave ?? 0;
    const total = w.run?.totalWaves ?? 0;
    const since = w.run?.waveTick ?? 0;
    for (const m of w.monsters) if (!m.dead || (m.deathTick >= since && w.tick - m.deathTick < 25 * 12)) monsters.add(m.def.id);
    for (const p of w.pendingSpawns) {
      const sp = w.zone.spawns[p.idx];
      if (!sp) continue;
      if (sp.wave) {
        if (sp.wave <= wave + 1) monsters.add(sp.monster);
      } else if (sp.seal === 'diablo') {
        // Sanctuaire du Chaos : Diablo préchargé quand il ne reste qu'un sceau intact
        if (w.objects.filter((o) => o.kind === 'seal' && !o.used).length <= 1) monsters.add(sp.monster);
      } else if (sp.runBoss) {
        // le boss après la dernière vague vaincue (le joueur doit encore rejoindre la chambre)
        if (wave >= total && !w.monsters.some((m) => !m.dead && !m.isSummon)) monsters.add(sp.monster);
      } else monsters.add(sp.monster);
    }
  } else if (core) {
    for (const m of w.monsters) if (!m.dead) monsters.add(m.def.id);
    // groupes qui se déclenchent dans les ~20 premières secondes de marche (écran + portée de déclenchement + marge)
    const reach = this.viewReach() + CORE_MARGIN;
    for (const p of w.pendingSpawns) {
      const sp = w.zone.spawns[p.idx];
      if (sp && (sp.runBoss ? false : Math.hypot(p.x - w.player.x, p.y - w.player.y) <= Math.max(p.trigger, reach) + p.r)) monsters.add(sp.monster);
    }
    // a game mode's arena without spawn entries (zone's `monsterPool`, lot 300): its species come within the first seconds
    for (const id of w.zone.monsterPool ?? []) monsters.add(id);
  } else {
    for (const sp of w.zone.spawns) monsters.add(sp.monster);
    // a game mode's monsters without spawn entries (zone's `monsterPool`: Survivals' director), and any of them alive
    if (w.zone.monsterPool) {
      for (const id of w.zone.monsterPool) monsters.add(id);
      for (const m of w.monsters) if (!m.dead) monsters.add(m.def.id);
      // their projectiles' and spells' effects (lot 294: Survivals' archers shot a small glow, `fx_arrow` never loaded)
      for (const fx of zoneFxIds(w.character.classId, w.zone.monsterPool)) if (this.bank.has(fx)) ids.add(fx);
    }
  }
  // lot 312: the zones joined edge to edge near the hero (src/sim/seam-worlds.ts): their monsters are shown beyond the seam before the
  // crossing (their species and the copies already here), their objects too
  for (const l of w.seamLinks ?? []) {
    const z = l.world.zone;
    // its whole roster (the species its groups may draw, its super-uniques) and its monsters alive
    for (const id of zoneMonsterIds(z)) monsters.add(id);
    for (const m of l.world.monsters) if (!m.dead) monsters.add(m.def.id);
    for (const o of z.objects) for (const id of objectSheetsFor(this.bank, o.kind, o.id, o.variant)) ids.add(id);
    // its props drawn beyond the seam (src/render/renderer-seams.ts)
    for (const p of z.props) {
      if (!this.bank.isImported(`prop_${p.prop}`)) continue;
      ids.add(`prop_${p.prop}`);
      if (this.bank.isImported(`prop_${p.prop}.${z.id}`)) ids.add(`prop_${p.prop}.${z.id}`);
    }
  }
  for (const m of w.monsters) if (m.mirror && !m.dead) monsters.add(m.def.id);
  // the decor of the maps drawn beyond the seams (whether their zones are built yet or not)
  if (this.seamsOn)
    for (const sm of w.zone.seams ?? []) {
      const nm = d2Map(sm.to);
      for (const [id] of (nm?.raw as { decor?: [string, number, number][] } | undefined)?.decor ?? []) if (this.bank.has(id)) ids.add(id);
    }
  for (const id of monsters) {
    const def = monsterSprite(id, this.bank);
    if (def) ids.add(def);
    // invocations des monstres
    for (const a of monsterAttacksSummon(id, this.bank)) ids.add(a);
  }
  // effets de sorts importés de D2 : ceux de la classe jouée et les effets de contact communs
  for (const id of [...FX_COMMON, ...(FX_BY_CLASS[w.character.classId] ?? [])]) if (this.bank.has(`fx_${id}`)) ids.add(`fx_${id}`);
  for (const o of w.zone.objects) for (const id of objectSheetsFor(this.bank, o.kind, o.id, o.variant)) ids.add(id);
  // portails (départ de la run, retour en ville) : créés après le chargement de la zone
  for (const id of objectSheetsFor(this.bank, 'portal')) ids.add(id);
  // accès à la chambre de la zone (portail rouge de Baal, dalle de Duriel) et Baal sur son trône
  if (w.zone.chamberAt) for (const id of objectSheetsFor(this.bank, 'portal', 'chamber', w.zone.chamberKind)) ids.add(id);
  if (w.zone.waveArena && this.bank.has('baal')) ids.add('baal');
  return [...ids];
}

/**
 * Zone à venir (portail, retour en ville) : ses planches D2 sont mises en file de génération à basse priorité (mode local) ;
 * rien n'est chargé en mémoire graphique, la zone est donc déjà prête quand le joueur y entre.
 */
export function prefetchZoneImpl(this: GameRenderer, z: ZoneDef): void {
  const ids = new Set<string>(groundSheets(z, this.bank));
  for (const p of z.props) {
    ids.add(`prop_${p.prop}`);
    ids.add(`prop_${p.prop}.${z.id}`);
  }
  for (const sp of z.spawns) ids.add(sp.monster);
  for (const o of z.objects) for (const id of objectSheetsFor(this.bank, o.kind, o.id, o.variant)) ids.add(id);
  this.bank.prefetch([...ids]);
}

/**
 * Planches (et carte D2) dont une zone a besoin, sans monde ni rendu : sert à préparer les zones suivantes en arrière-plan (mode local).
 * Même contenu que `prepGroups` (sols et décors, distribution complète des monstres, objets, effets) hors équipement du joueur.
 */
export function planZoneAssetsImpl(this: GameRenderer, z: ZoneDef, classId: ClassId): { sheets: string[]; map?: string } {
  const bank = this.bank;
  const keep = (ids: Iterable<string>): string[] => [...new Set(ids)].filter((id) => bank.has(id) && bank.isImported(id));
  const dmap = z.d2Map ? d2Map(z.d2Map.id) : undefined;
  const ground = new Set<string>();
  if (!dmap) for (const g of groundSheets(z, bank)) ground.add(g);
  for (const p of z.props) {
    if (dmap && !bank.isImported(`prop_${p.prop}`)) continue;
    ground.add(`prop_${p.prop}`);
    ground.add(`prop_${p.prop}.${z.id}`);
  }
  for (const [id] of (dmap?.raw as { decor?: [string, number, number][] } | undefined)?.decor ?? []) ground.add(id);
  const ids = new Set<string>(zoneMonsterIds(z));
  const units = new Set<string>();
  for (const id of ids) {
    const s = monsterSprite(id, bank);
    if (s) units.add(s);
  }
  if (units.size && [...ids].some((id) => MONSTER_BY_ID[id]?.attacks.some((a) => a.kind === 'summon'))) units.add('hydra');
  const objects = new Set<string>();
  for (const o of z.objects) for (const id of objectSheetsFor(bank, o.kind, o.id, o.variant)) objects.add(id);
  for (const id of objectSheetsFor(bank, 'portal')) objects.add(id);
  const fx = zoneFxIds(classId, ids, { mapBoss: false });
  return { sheets: keep([...ground, ...units, ...objects, ...fx]), map: z.d2Map && dmap ? z.d2Map.id : undefined };
}

/**
 * Mode local sans repli : tout ce qui peut apparaître dans la zone, par étape de préparation (ordre de priorité : interface, icônes,
 * carte, sol et murs, joueur, personnages et monstres, objets, effets). `extra` : étapes fournies par l'application (sons).
 */
export function prepGroupsImpl(this: GameRenderer, w: World, low: boolean): PrepGroups {
  const bank = this.bank;
  const sheet = (id: string): PrepItem => ({ id, kind: 'sheet', weight: estimateWeight(id, 'sheet') });
  const extra = (id: string): PrepItem => ({ id, kind: 'extra', weight: estimateWeight(id, 'extra') });
  // seules les planches qu'un équivalent D2 peut produire sont fabriquées ; les autres gardent le sprite du jeu (rapporté)
  const sheets = (ids: Iterable<string>): PrepItem[] => [...new Set(ids)].filter((id) => bank.has(id) && bank.isImported(id)).map(sheet);
  const onD2Map = !!(w.zone.d2Map && d2Map(w.zone.d2Map.id));
  const dmap = w.zone.d2Map ? d2Map(w.zone.d2Map.id) : undefined;
  const ground = new Set<string>();
  if (!onD2Map) for (const g of groundSheets(w.zone, bank)) ground.add(g);
  for (const p of w.zone.props) {
    if (onD2Map && !bank.isImported(`prop_${p.prop}`)) continue;
    ground.add(`prop_${p.prop}`);
    ground.add(`prop_${p.prop}.${w.zone.id}`);
  }
  for (const [id] of (dmap?.raw as { decor?: [string, number, number][] } | undefined)?.decor ?? []) ground.add(id);
  const player = new Set<string>(classSheets(w, bank));
  if (w.character.classId === 'sorceress') player.add('hydra');
  // distribution complète : groupes posés, espèces sœurs, super-uniques, invocations, renforts d'un boss de carte, monstres déjà là
  const ids = new Set<string>(zoneMonsterIds(w.zone, { mapZone: w.run?.mapZone || undefined }));
  for (const m of w.monsters) ids.add(m.def.id);
  this.rosterIds = ids;
  const units = new Set<string>();
  for (const id of ids) {
    const s = monsterSprite(id, bank);
    if (s) units.add(s);
  }
  if (units.size && [...ids].some((id) => MONSTER_BY_ID[id]?.attacks.some((a) => a.kind === 'summon'))) units.add('hydra');
  const objects = new Set<string>();
  for (const o of w.zone.objects) for (const id of objectSheetsFor(this.bank, o.kind, o.id, o.variant)) objects.add(id);
  for (const id of objectSheetsFor(bank, 'portal')) objects.add(id);
  if (w.zone.chamberAt) for (const id of objectSheetsFor(bank, 'portal', 'chamber', w.zone.chamberKind)) objects.add(id);
  if (w.zone.waveArena) units.add('baal');
  const npcs = [...objects].filter((id) => id.startsWith('npc_'));
  for (const id of npcs) {
    objects.delete(id);
    units.add(id);
  }
  const hasMapBoss = !!w.run?.mapZone || w.zone.spawns.some((s) => s.runBoss && (w.run?.mapTier ?? 0) > 0);
  const fx = zoneFxIds(w.character.classId, ids, { mapBoss: hasMapBoss });
  return {
    ui: [extra('ui')],
    icons: ['icons:items', 'icons:skills', 'icons:loading', 'icons:ground'].map(extra),
    map: dmap && w.zone.d2Map ? [{ id: w.zone.d2Map.id, kind: 'map', weight: estimateWeight('', 'map'), tier: low ? 'lo' : 'hi' }] : [],
    ground: sheets(ground),
    player: sheets(player),
    units: sheets(units),
    objects: sheets(objects),
    fx: sheets(fx),
    sounds: [extra('text:npc')],
  };
}
