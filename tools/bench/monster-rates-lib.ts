/**
 * Mesure headless de la cadence d'attaque de chaque monstre : pour CHAQUE attaque de chaque espèce, le monstre (cible à portée, aucun
 * étourdissement, une seule attaque à la fois) est observé 40 s au plus ; on relève la durée d'animation (début d'attaque -> retour à l'état de repos)
 * et l'intervalle entre deux débuts d'attaque. L'attendu D2/PD2 vient de animdata.d2 + monstats.txt (monster-anim.gen.ts) : intervalle = durée d'animation + aidel.
 */
import { arena, at, run } from '../../tests/unit/arena-helper';
import { MONSTERS } from '../../src/data/monsters';
import { MONSTER_ANIM, type MonsterAnimTicks } from '../../src/data/monster-anim.gen';
import { attackAnimMode, TIMING_EXCLUDED } from '../../src/data/monster-timing';
import type { MonsterAttack, MonsterDef } from '../../src/data/types';

/** Exclus du banc (laissés tels quels) : Anciens, Rathma, Lucion, Clone PD2 et leurs versions ultimes ; plus les non-espèces */
export const EXCLUDED = new Set([...TIMING_EXCLUDED, 'treasure_fallen', 'baal_hydra']);

export interface RateRow {
  id: string;
  name: string;
  /** indice et nature de l'attaque */
  idx: number;
  kind: MonsterAttack['kind'];
  cooldown: number;
  /** mode d'animation D2 retenu (A1, S1…) ou '' si aucune donnée */
  mode: string;
  /** mesurés (ticks) */
  anim: number;
  interval: number | null;
  /** attendus (ticks) : animation D2, puis intervalle = animation + aidel */
  expAnim: number | null;
  expInterval: number | null;
  /** écart relatif de l'intervalle mesuré à l'attendu (+ = plus lent) */
  gap: number | null;
  note: string;
}

/** Intervalle D2 attendu : animation + délai d'IA (aidel de Cauchemar, milieu des trois difficultés) */
export function expectedTicks(t: MonsterAnimTicks | undefined, atk: MonsterAttack): { anim: number; interval: number; mode: string } | null {
  if (!t) return null;
  const mode = attackAnimMode(t, atk.kind);
  const a = mode ? t[mode] : undefined;
  if (!a) return null;
  return { anim: a[0], interval: a[0] + t.aidel[1], mode: (mode ?? '').toUpperCase() };
}

export function measureAttack(def: MonsterDef, idx: number, seconds = 40): { anim: number; interval: number | null; starts: number } {
  const atk = def.attacks[idx];
  const { g, w, ms } = arena(
    [
      { monster: def.id, x: 11.3, y: 15 },
      { monster: def.id === 'skeleton' ? 'zombie' : 'skeleton', x: 12.5, y: 16.5 },
    ],
    { live: true },
  );
  const m = at(ms, 11.3, 15);
  const ally = ms.find((x) => x !== m);
  m.def = { ...def, attacks: [atk] };
  m.atkCd = [0];
  m.aggro = true;
  m.speed = 0;
  m.x = m.px = 10 + m.radius + w.player.radius + 0.15;
  m.y = m.py = 15;
  m.dmgMin = m.dmgMax = 0;
  m.hp = m.hpMax = 1e9;
  if (ally) {
    ally.speed = 0;
    ally.dmgMin = ally.dmgMax = 0;
    ally.hpMax = 1000;
  }
  const starts: number[] = [];
  const lens: number[] = [];
  let prev = false;
  let t0 = 0;
  const n = Math.max(25 * seconds, 5 * (atk.cooldown + atk.frames));
  for (let i = 0; i < n; i++) {
    if (ally) ally.hp = 300;
    run(g, 1);
    m.aggro = true;
    const now = m.mode === 'attack';
    if (now && !prev) {
      starts.push(w.tick);
      t0 = w.tick;
    }
    if (!now && prev) lens.push(w.tick - t0);
    prev = now;
    if (starts.length >= 8) break;
  }
  const iv = starts.slice(1).map((s, i) => s - starts[i]);
  return { anim: lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0, interval: iv.length ? iv.reduce((a, b) => a + b, 0) / iv.length : null, starts: starts.length };
}

export function measureAll(filter?: (d: MonsterDef) => boolean): RateRow[] {
  const rows: RateRow[] = [];
  for (const def of MONSTERS) {
    if (EXCLUDED.has(def.id) || (filter && !filter(def))) continue;
    def.attacks.forEach((atk, idx) => {
      const exp = expectedTicks(MONSTER_ANIM[def.id], atk);
      let note = '';
      let r: ReturnType<typeof measureAttack> = { anim: 0, interval: null, starts: 0 };
      if (atk.kind === 'summon' && atk.revive) note = 'résurrection : non mesurée (cadavre requis)';
      else r = measureAttack(def, idx);
      if (!note && r.interval === null) note = r.starts ? 'une seule attaque observée (cooldown long)' : 'aucune attaque observée';
      const gap = exp && r.interval !== null ? r.interval / exp.interval - 1 : null;
      rows.push({
        id: def.id,
        name: def.name,
        idx,
        kind: atk.kind,
        cooldown: atk.cooldown,
        mode: exp?.mode ?? '',
        anim: r.anim,
        interval: r.interval,
        expAnim: exp?.anim ?? null,
        expInterval: exp?.interval ?? null,
        gap,
        note,
      });
    });
  }
  return rows;
}
