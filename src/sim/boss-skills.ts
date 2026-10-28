/**
 * Compétences de boss D2 (monstats.txt Skill1..8) à effet télégraphié : Mur de feu (Diablo DiabWall / PrimeFirewall, Invocateur VampireFirewall),
 * Blizzard et Éclair en chaîne (Méphisto), éclairs en éventail (MephistoMissile), Prison d'os (DiabPrison), Tentacules (Baal Tentacle).
 * Les zones sont des AreaEffect d'équipe 1 : elles ne touchent que le joueur et ses créatures, jamais les autres monstres.
 */
import { dist } from '../core/math';
import type { MonsterAttack } from '../data/types';
import { MISSILE_DMG } from '../data/curves';
import type { Monster } from './actors';
import { emptyPacket } from './actors';
import { hurtPet } from './druid';
import { spawnArea, spawnMissile } from './missiles';
import { TICK_HZ } from './constants';
import type { World } from './world';

/** Délais de télégraphie (ticks) avant les premiers dégâts de la zone */
const FIREWALL_WARN = 12;
const BLIZZARD_WARN = 15;
const GROUND_WARN = 18;
const PRISON_WARN = 20;

/** Éclair brisé de (x1,y1) vers (x2,y2) */
function bolt(w: World, x1: number, y1: number, x2: number, y2: number): void {
  const pts = [x1, y1];
  const len = dist(x1, y1, x2, y2) || 1;
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  for (let k = 1; k <= 4; k++) {
    const j = k < 4 ? w.rng.ai.float(-0.5, 0.5) : 0;
    pts.push(x1 + (x2 - x1) * (k / 4) + nx * j, y1 + (y2 - y1) * (k / 4) + ny * j);
  }
  w.events.push({ t: 'beam', kind: 'red_lightning', points: pts, elem: 'light' });
}

/** Lance la compétence `atk` (kind 'cast') du boss `m`, `dmg` étant le jet de dégâts de l'attaque (déjà mis à l'échelle de difficulté) */
export function castBossSkill(w: World, m: Monster, atk: MonsterAttack, dmg: number): void {
  const pl = w.player;
  const tgt = m.atkTarget;
  const base = Math.atan2(tgt.y - m.y, tgt.x - m.x);
  const pk = emptyPacket(true);
  pk[atk.element] += dmg * MISSILE_DMG[w.difficulty];
  const shots = atk.shots ?? 1;
  switch (atk.pattern) {
    case 'firewall': {
      // murs de feu en éventail devant le boss : visibles 0,5 s avant de brûler (D2 DiabWall, PrimeFirewall)
      for (let k = 0; k < shots; k++) {
        const a = base + (k - (shots - 1) / 2) * 0.42;
        const c = Math.cos(a);
        const s = Math.sin(a);
        spawnArea(w, {
          kind: 'mon_firewall',
          team: 1,
          owner: m.id,
          x: m.x + c * 2.2,
          y: m.y + s * 2.2,
          x2: m.x + c * 11,
          y2: m.y + s * 11,
          radius: 0.8,
          ticks: TICK_HZ * 4,
          every: 10,
          dmg: { ...pk },
          elem: 'fire',
          aux: FIREWALL_WARN,
        });
      }
      break;
    }
    case 'blizzard': {
      // Blizzard centré sur la position du joueur au début du sort : le cercle glacé prévient avant la chute des éclats (D2 Blizzard, niveau 5)
      spawnArea(w, {
        kind: 'mon_blizzard',
        team: 1,
        owner: m.id,
        x: tgt.x,
        y: tgt.y,
        radius: 4,
        ticks: BLIZZARD_WARN + Math.round(TICK_HZ * 3.2),
        every: 6,
        dmg: { ...pk },
        elem: 'cold',
        aux: BLIZZARD_WARN,
      });
      break;
    }
    case 'chain': {
      // Éclair en chaîne : frappe le point visé au début du sort (esquivable), puis rebondit vers les créatures voisines du joueur
      bolt(w, m.x, m.y, tgt.x, tgt.y);
      w.events.push({ t: 'impact', kind: 'chain_lightning', x: tgt.x, y: tgt.y, radius: 1.6, elem: 'light' });
      if (!pl.dead && dist(tgt.x, tgt.y, pl.x, pl.y) <= 1.6 + pl.radius) w.hurtPlayerPacket(m, { ...pk });
      let hops = 0;
      for (const pet of w.pets) {
        if (pet.dead || hops >= 2 || dist(tgt.x, tgt.y, pet.x, pet.y) > 5) continue;
        bolt(w, tgt.x, tgt.y, pet.x, pet.y);
        hurtPet(w, pet, { ...pk }, m);
        hops++;
      }
      break;
    }
    case 'fan': {
      // éclairs en éventail (MephistoMissile) : projectiles de foudre vers le joueur, écart aléatoire
      for (let k = 0; k < shots; k++) {
        const a = base + (k - (shots - 1) / 2) * 0.28 + w.rng.ai.float(-0.06, 0.06);
        spawnMissile(w, { kind: 'lightning_m', team: 1, owner: m.id, x: m.x, y: m.y, angle: a, speed: 14 * (m.missileMul ?? 1), radius: 0.3, range: atk.range + 4, dmg: { ...pk }, elem: atk.element });
      }
      break;
    }
    case 'prison': {
      // Prison d'os (DiabPrison) : cercle d'os autour du joueur ; quiconque y reste est immobilisé un instant, sans dégâts
      spawnArea(w, { kind: 'ground_pulse', team: 1, owner: m.id, x: tgt.x, y: tgt.y, radius: 2.4, ticks: PRISON_WARN, every: 1, dmg: emptyPacket(true), elem: 'magic', aux: 18 });
      break;
    }
    case 'tentacle': {
      // Tentacules (Baal Tentacle) : pointes qui jaillissent sous le joueur et autour de lui
      for (let k = 0; k < shots; k++) {
        const a = w.rng.ai.float(0, Math.PI * 2);
        const off = k === 0 ? 0 : 2.6;
        spawnArea(w, {
          kind: 'ground_pulse',
          team: 1,
          owner: m.id,
          x: tgt.x + Math.cos(a) * off,
          y: tgt.y + Math.sin(a) * off,
          radius: 1.5,
          ticks: GROUND_WARN,
          every: 1,
          dmg: { ...pk },
          elem: atk.element,
        });
      }
      break;
    }
  }
}
