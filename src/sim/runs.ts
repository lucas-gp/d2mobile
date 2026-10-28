/**
 * État d'une run en cours : objectif (boss), achèvement, portail de retour, vagues (Baal),
 * butin supplémentaire propre à la zone ou au jeu de règles (règles `maps.runDrops`, `runs.extraDrops`, `maps.campaignDrops`).
 */
import { RUN_BY_ID, townNameOf, type RunDirector } from '../data/runs';
import type { Difficulty } from '../data/types';
import type { Monster } from './actors';
import type { Item } from './item';
import type { World } from './world';
import { TICK_HZ } from './constants';
import { RULES } from '../mods/rules';
// implémentation de la base de `runs.extraDrops` (Torche du feu de l'enfer, D2)
import './loot/uber-drops';

export interface RunSnapshot {
  runId: string;
  difficulty: Difficulty;
  seed: number;
  mapTier: number;
  completed: boolean;
  wave: number;
  startTick: number;
}

export class RunState {
  completed = false;
  wave = 0;
  startTick = 0;
  completeTick = -1;
  /** Vagues : nombre total (0 = pas de vagues) */
  totalWaves = 0;
  /** Tick d'apparition de la dernière vague (le rendu libère les cadavres des précédentes) */
  waveTick = 0;
  bossLootMul = 1;
  gatesOpened = false;

  constructor(
    readonly runId: string,
    readonly zoneKey: string,
    readonly difficulty: Difficulty,
    readonly bossId: string,
    readonly mapTier = 0,
    /** Zone de carte (cartes uniques : butin spécial du boss) */
    readonly mapZone = '',
  ) {}

  /** Director of a game mode's run (`RunDef.director`): undefined until the first step, null for a run without one */
  director: RunDirector | null | undefined = undefined;

  update(w: World): void {
    if (this.director === undefined) this.director = RUN_BY_ID[this.runId]?.director?.(w, this) ?? null;
    if (this.director) this.director.tick(w);
    if (this.totalWaves > 0 && !this.completed) this.updateWaves(w);
    if (!this.completed && w.tick % 10 === 0) this.updateSeals(w);
  }

  /**
   * Sanctuaire du Chaos : Diablo apparaît au centre du pentagramme une fois tous les sceaux
   * brisés et tous leurs gardiens tués (D2 : le dernier sceau l'appelle).
   */
  private updateSeals(w: World): void {
    const diablo = w.pendingSpawns.find((s) => s.seal === 'diablo');
    if (!diablo) return;
    if (w.objects.some((o) => o.kind === 'seal' && !o.used)) return;
    if (w.pendingSpawns.some((s) => s.seal && s.seal !== 'diablo')) return;
    if (w.monsters.some((m) => m.sealGuard && !m.dead)) return;
    const boss = w.triggerSeal('diablo').find((m) => m.rank === 'boss');
    if (boss) w.events.push({ t: 'bossSpawn', id: boss.id, name: boss.name });
    w.events.push({ t: 'impact', kind: 'seal', x: diablo.x, y: diablo.y, radius: 4, elem: 'fire' });
  }

  /** Tick où la prochaine vague apparaît (Baal l'appelle, délai après la mort du dernier monstre de la salle) ; -1 : aucune vague appelée */
  private callAt = -1;

  private updateWaves(w: World): void {
    const arena = w.zone.waveArena;
    const dist = (x: number, y: number) => (arena ? Math.hypot(x - arena.x, y - arena.y) : 0);
    // salle des vagues : seuls les monstres de la salle comptent (sans carte de salle, toute la zone, comme avant)
    const alive = w.monsters.some((m) => !m.dead && !m.isSummon && (!arena || dist(m.x, m.y) < arena.r));
    const pendingHere = arena ? w.pendingSpawns.some((s) => !s.wave && !s.seal && dist(s.x, s.y) < arena.r) : false;
    const pendingWave = w.pendingSpawns.some((s) => s.wave);
    const DELAY = 4 * TICK_HZ;
    const call = () => {
      if (this.callAt < 0) {
        this.callAt = w.tick + DELAY;
        w.events.push({ t: 'baalCall' });
      }
      if (w.tick >= this.callAt) {
        this.callAt = -1;
        this.nextWave(w);
      }
    };
    if (this.wave === 0) {
      if (arena) {
        // les gardiens de la salle d'abord ; quand ils sont morts et que le joueur est dans la salle, Baal appelle la première vague
        if (this.callAt >= 0 || (!alive && !pendingHere && dist(w.player.x, w.player.y) < arena.r + 4)) call();
        return;
      }
      // la première vague se déclenche quand le joueur entre dans la salle du trône
      const trig = w.zone.spawns.find((s) => s.wave === 1);
      if (trig && Math.hypot(w.player.x - trig.x, w.player.y - trig.y) < 14) this.nextWave(w);
      return;
    }
    if (!alive && pendingWave) {
      if (arena) call();
      else if (w.tick % TICK_HZ === 0) this.nextWave(w);
    }
    // dernière vague vaincue : les herses de la run s'ouvrent (Chambre de la Pierre-Monde)
    if (!alive && !pendingWave && this.wave >= this.totalWaves && !this.gatesOpened) {
      this.gatesOpened = true;
      for (const o of w.objects) if (o.kind === 'gate' && !o.used && o.ref) w.openGate(o.ref);
      // Trône de Baal sur sa carte D2 : le portail rouge s'ouvre au trône vers la Chambre de la Pierre-Monde
      const at = w.zone.chamberAt;
      if (at) {
        const spot = w.grid.nearestFree(at.x, at.y, 5) ?? at;
        w.objects.push({
          id: w.newId(),
          kind: 'portal',
          x: spot.x,
          y: spot.y,
          radius: 1,
          used: false,
          ref: 'chamber',
          variant: w.zone.chamberKind ?? 'red',
          label: 'Portail vers la Chambre de la Pierre-Monde',
        });
        w.events.push({ t: 'portalOpen', x: spot.x, y: spot.y });
        w.events.push({ t: 'message', text: 'Un portail s’ouvre au trône…', color: '#e8b04a' });
      }
    }
  }

  nextWave(w: World): void {
    this.wave++;
    this.waveTick = w.tick;
    const n = w.triggerWave(this.wave);
    if (n > 0) w.events.push({ t: 'wave', index: this.wave, total: this.totalWaves });
    for (const m of w.monsters) if (!m.dead) m.aggro = true;
  }

  onKill(w: World, m: Monster): void {
    // boss de carte : bannière, explosion, ses renforts s'effondrent
    if (m.mapBoss) RULES['runs.mapBossDeath'](w, m);
    this.director?.onKill?.(w, m);
    if (this.completed) return;
    // carte : seul le boss marqué termine (son espèce peuple aussi la carte)
    // plusieurs boss de run (les trois Anciens) : la run se termine à la mort du dernier
    if (
      (m.runBoss || (this.mapTier === 0 && m.def.id === this.bossId)) &&
      !w.monsters.some((o) => o !== m && o.runBoss && !o.dead) &&
      !w.pendingSpawns.some((p) => p.seal && p.seal !== 'diablo' && w.zone.spawns[p.idx]?.runBoss)
    ) {
      this.completed = true;
      this.completeTick = w.tick;
      w.events.push({ t: 'runComplete', runId: this.runId, durationSec: (w.tick - this.startTick) / TICK_HZ });
      w.events.push({ t: 'portalOpen', x: m.x, y: m.y });
      const spot = w.grid.nearestFree(m.x + 2, m.y + 2, 5) ?? { x: m.x, y: m.y };
      // lot 319: Mephisto dead in the Campaign's Durance, Diablo II's red portal to the Pandemonium Fortress (Act IV), not a way home
      if (this.runId === 'a3_durance3')
        w.objects.push({ id: w.newId(), kind: 'portal', x: spot.x, y: spot.y, radius: 1, used: false, ref: 'act:act4', variant: 'red', label: `Portail vers ${townNameOf('act4')}` });
      else w.objects.push({ id: w.newId(), kind: 'portal', x: spot.x, y: spot.y, radius: 1, used: false, ref: 'town', label: `Portail vers ${townNameOf(RUN_BY_ID[this.runId]?.campaign)}` });
    }
  }

  /** Butin supplémentaire : cartes et orbes dans les cartes ; cartes de palier 1 en Enfer */
  extraDrops(w: World, m: Monster): Item[] {
    // le boss d'une carte (rang unique entouré de ses sbires) lâche comme un boss : cartes, orbes, événements (règle du mod des cartes)
    if (this.mapTier > 0) return RULES['maps.runDrops'](w, m, this.mapTier, this.mapZone);
    // butin propre au jeu de règles (mod pd2 : éclats des zones corrompues, objets du Pandémonium ; D2 : Torche du feu de l'enfer,
    // loot/uber-drops.ts ; clés, essences, organes et Annihilus viennent des TC des boss, data/treasure.ts)
    const out: Item[] = RULES['runs.extraDrops'](w, m, this.difficulty);
    // cartes tombées hors des cartes (règle du mod des cartes : palier 1 en Enfer)
    RULES['maps.campaignDrops'](w, m, this.difficulty, out);
    return out;
  }

  snapshot(seed: number): RunSnapshot {
    return { runId: this.runId, difficulty: this.difficulty, seed, mapTier: this.mapTier, completed: this.completed, wave: this.wave, startTick: this.startTick };
  }
}
