/** Objets interactifs du monde : coffres, tonneaux, urnes, cadavres, sarcophages, sanctuaires, puits, objets de quête, PNJ, sorties. */
import { TICK_HZ } from './constants';
import type { DamagePacket, Monster, WorldObject } from './actors';
import type { World } from './world';
import { pickEquipBase, rollTc } from './loot/drops';
import { generateItem, NO_BONUS } from './loot/itemgen';
import { RULES } from '../mods/rules';
import { explode } from './explosion';
import { spawnMonster } from './spawn';
import { pickShrine, SHRINE_BY_ID, type ShrineDef } from '../data/shrines';
import { GEMS, GEM_BY_ID } from '../data/items/runes';
import { addLoose } from './materials';

/** Puits (objects.txt Parm3) : trois gorgées, puis réarmement */
const WELL_USES = 3;
/** Puits : part de la vie et du mana rendue par gorgée (adaptation : D2 rend « un peu » de vie, de mana et d'endurance, et guérit le poison) */
const WELL_RESTORE = 0.5;
const WELL_RESET_MIN = 5;

export function interactObject(w: World, o: WorldObject): void {
  switch (o.kind) {
    case 'weaponrack': {
      // lot 321: Diablo II's weapon rack gives one weapon, its armour stand one armour (before: two draws of a chest's treasure class, gold
      // included), of the zone's level, its quality drawn as a monster's item (magic find counted)
      if (o.used) return;
      o.used = true;
      const rng = w.rng.loot;
      const base = pickEquipBase(rng, w.zoneLevel, o.variant === 'armor' ? 'armor' : 'weapon');
      if (base) w.dropItem(generateItem(rng, base.id, w.zoneLevel, { mf: w.player.d.mf, rollEthereal: true }), o.x, o.y, 1.2);
      w.events.push({ t: 'impact', kind: 'open_weaponrack', x: o.x, y: o.y, radius: 0.8, elem: 'phys' });
      return;
    }
    case 'chest':
    case 'sarcophagus':
    case 'barrel': {
      if (o.used) return;
      o.used = true;
      if (o.variant === 'horazon') {
        // événement de carte : le coffre d'Horazon contient six cartes
        for (const it of RULES['maps.chestDrops'](w, Math.max(1, w.run?.mapTier ?? 1))) w.dropItem(it, o.x, o.y, 1.4);
        w.events.push({ t: 'impact', kind: 'open_chest', x: o.x, y: o.y, radius: 0.8, elem: 'phys' });
        return;
      }
      // petits conteneurs (tonneaux, urnes, cadavres) : un tirage ; coffres et sarcophages : deux
      const small = o.kind === 'barrel';
      const tc = small ? 'normal' : 'citem';
      const items = rollTc(
        {
          rng: w.rng.loot,
          ilvl: w.zoneLevel,
          mf: w.player.d.mf,
          difficulty: w.difficulty,
          zoneKey: w.run?.zoneKey ?? 'tristram',
          mapTier: w.run?.mapTier ?? 0,
          bonus: NO_BONUS,
          gf: w.player.d.gf,
          quantity: small ? 1 : 2,
        },
        tc,
      );
      for (const it of items) w.dropItem(it, o.x, o.y, 1.2);
      w.events.push({ t: 'impact', kind: `open_${o.kind}`, x: o.x, y: o.y, radius: 0.8, elem: 'phys' });
      return;
    }
    case 'shrine': {
      if (o.used) return;
      const def = shrineOf(w, o);
      o.used = true;
      if (def.resetMin > 0) o.resetAt = w.tick + def.resetMin * 60 * TICK_HZ;
      applyShrine(w, o, def);
      w.events.push({ t: 'shrine', kind: def.id, x: o.x, y: o.y });
      return;
    }
    case 'well': {
      if (o.used) return;
      const p = w.player;
      p.hp = Math.min(p.hpMax, p.hp + p.hpMax * WELL_RESTORE);
      p.mana = Math.min(p.manaMax, p.mana + p.manaMax * WELL_RESTORE);
      p.poisonT = 0;
      o.uses = (o.uses ?? WELL_USES) - 1;
      if (o.uses <= 0) {
        o.used = true;
        o.resetAt = w.tick + WELL_RESET_MIN * 60 * TICK_HZ;
      }
      w.events.push({ t: 'shrine', kind: 'well', x: o.x, y: o.y });
      w.events.push({ t: 'message', text: o.used ? 'Le puits est à sec' : 'Vous buvez au puits', color: '#8cf' });
      return;
    }
    case 'gate':
      return;
    case 'seal': {
      // Sanctuaire du Chaos : briser un sceau libère son gardien
      if (o.used) return;
      o.used = true;
      // une aile peut avoir deux sceaux (Vizir, Infecteur) : son gardien n'apparaît que quand tous sont brisés
      const armLeft = w.objects.filter((x) => x.kind === 'seal' && x.ref === o.ref && !x.used).length;
      if (!armLeft) w.triggerSeal(o.ref ?? '');
      const left = w.objects.filter((x) => x.kind === 'seal' && !x.used).length;
      w.events.push({ t: 'impact', kind: 'seal', x: o.x, y: o.y, radius: 2.5, elem: 'fire' });
      const text = !left
        ? o.ref === 'ancients'
          ? 'Les Anciens s’éveillent !'
          : 'Tous les sceaux sont brisés'
        : armLeft
          ? `Sceau brisé — encore ${left}`
          : `Gardien libéré — encore ${left} sceau${left > 1 ? 'x' : ''}`;
      w.events.push({ t: 'mapEvent', text });
      return;
    }
    default:
      // PNJ, Cube, coffre, objets de quête (traités par le jeu : inventaire et quêtes)
      w.events.push({ t: 'interact', kind: o.kind, ref: o.ref, objectId: o.id });
  }
}

/** Sanctuaires et puits vidés : ils se réarment après leur délai (shrines.txt « reset time in minutes ») */
export function rearmObjects(w: World): void {
  for (const o of w.objects) {
    if (!o.used || o.resetAt === undefined || w.tick < o.resetAt) continue;
    o.used = false;
    o.resetAt = undefined;
    o.uses = undefined;
  }
}

/** Effet du sanctuaire : fixé au premier usage (santé, mana, ou tirage « magique » au niveau de la zone) et gardé quand il se réarme */
function shrineOf(w: World, o: WorldObject): ShrineDef {
  const fixed = o.variant ? SHRINE_BY_ID[o.variant] : undefined;
  const def = fixed ?? pickShrine((n) => w.rng.misc.int(n), w.zoneLevel);
  o.variant = def.id;
  o.label = def.name;
  return def;
}

/** Monstres hostiles vivants à moins de r unités (sans passer par la grille spatiale, reconstruite à chaque tick) */
const near = (w: World, o: WorldObject, r: number): Monster[] => w.monsters.filter((m) => !m.dead && !m.isSummon && !m.pet && Math.hypot(m.x - o.x, m.y - o.y) <= r);

const packet = (p: Partial<DamagePacket>): DamagePacket => ({ phys: 0, fire: 0, cold: 0, light: 0, poison: 0, magic: 0, spell: true, ...p });

function applyShrine(w: World, o: WorldObject, def: ShrineDef): void {
  const p = w.player;
  const say = (text: string, color = '#9f9') => w.events.push({ t: 'message', text, color });
  switch (def.id) {
    case 'refill':
      p.hp = p.hpMax;
      p.mana = p.manaMax;
      break;
    case 'health':
      p.hp = p.hpMax;
      break;
    case 'mana':
      p.mana = p.manaMax;
      break;
    case 'health_exchange': {
      // la moitié de la vie, rendue cinq fois en mana
      const take = Math.floor((p.hp * def.arg0) / 100);
      p.hp = Math.max(1, p.hp - take);
      p.mana = Math.min(p.manaMax, p.mana + (take * def.arg1) / 100);
      break;
    }
    case 'mana_exchange': {
      const take = Math.floor((p.mana * def.arg0) / 100);
      p.mana -= take;
      p.hp = Math.min(p.hpMax, p.hp + (take * def.arg1) / 100);
      break;
    }
    case 'enirhs':
      say(`${[...w.character.name].reverse().join('')}…`, '#c9f');
      break;
    case 'portal': {
      // portail vers la ville, comme un parchemin
      const at = w.grid.nearestFree(o.x + 1.6, o.y + 0.8, 4) ?? { x: o.x, y: o.y };
      w.objects = w.objects.filter((x) => !(x.kind === 'portal' && x.ref === 'town'));
      w.objects.push({ id: w.newId(), kind: 'portal', x: at.x, y: at.y, radius: 1, used: false, ref: 'town', label: 'Portail vers la ville' });
      w.events.push({ t: 'portalOpen', x: at.x, y: at.y });
      break;
    }
    case 'gem':
      gemShrine(w);
      break;
    case 'storm': {
      // joueurs et monstres proches perdent la moitié de leur vie actuelle ; boules de feu (visuelles)
      p.hp = Math.max(1, p.hp - Math.floor((p.hp * def.arg0) / 100));
      for (const m of near(w, o, 20)) m.hp = Math.max(1, m.hp - Math.floor((m.hp * def.arg0) / 100));
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        w.events.push({ t: 'impact', kind: 'fireball', x: o.x + Math.cos(a) * 4, y: o.y + Math.sin(a) * 4, radius: 1.5, elem: 'fire' });
      }
      break;
    }
    case 'warping': {
      // le monstre ordinaire le plus proche devient unique
      let best: Monster | null = null;
      let bd = 30;
      for (const m of near(w, o, 30)) {
        if (m.rank !== 'normal') continue;
        const d = Math.hypot(m.x - o.x, m.y - o.y);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      if (best) {
        const b = best;
        const u = spawnMonster(w, b.def.id, b.x, b.y, { rank: 'unique' }, `shrine:${o.id}`);
        if (u) w.monsters = w.monsters.filter((m) => m !== b);
      }
      break;
    }
    case 'exploding':
    case 'poison': {
      // 5 à 10 potions lancées autour du sanctuaire (dégâts proches de ceux des potions de jet du niveau de la zone)
      const n = def.arg0 + w.rng.misc.int(def.arg1 - def.arg0 + 1);
      const lvl = Math.max(1, w.zoneLevel);
      for (let k = 0; k < n; k++) {
        const a = w.rng.misc.float(0, Math.PI * 2);
        const r = w.rng.misc.float(2, 7);
        const x = o.x + Math.cos(a) * r;
        const y = o.y + Math.sin(a) * r;
        if (def.id === 'exploding') explode(w, 0, x, y, 2.2, packet({ fire: w.rng.misc.float(lvl * 2, lvl * 4) }), 'fireball', 'fire');
        else explode(w, 0, x, y, 2.5, packet({ poisonDot: { dps: lvl * 1.5, ticks: 4 * TICK_HZ } }), 'poison_nova', 'poison');
      }
      break;
    }
    default:
      // sanctuaires « booster » : un effet par genre (PD2 : des sanctuaires différents se cumulent, le même se renouvelle)
      if (def.duration > 0) {
        p.buffs = p.buffs.filter((b) => b.id !== `shrine_${def.id}`);
        p.buffs.push({ id: `shrine_${def.id}`, level: 1, until: w.tick + def.duration });
        w.refreshPlayer();
      }
  }
  say(def.name);
}

/** Sanctuaire des gemmes : améliore une gemme au hasard (jusqu'à sans défaut → parfaite), sinon en donne une ; PD2 : marche avec les gemmes empilées */
function gemShrine(w: World): void {
  const c = w.character;
  const grade = (id: string) => GEM_BY_ID[id]?.grade ?? 9;
  const inInv = c.inventory.map((it, i) => ({ it, i })).filter((e) => e.it && GEM_BY_ID[e.it.base] && grade(e.it.base) < 4);
  const inTab = Object.keys(c.materials).filter((id) => GEM_BY_ID[id] && grade(id) < 4 && (c.materials[id] ?? 0) > 0);
  const up = (id: string) => `gem_${GEM_BY_ID[id].kind}_${grade(id) + 1}`;
  if (inInv.length) {
    const e = inInv[w.rng.misc.int(inInv.length)];
    const it = e.it!;
    const next = up(it.base);
    if ((it.qty ?? 1) > 1) {
      it.qty = (it.qty ?? 1) - 1;
      addLoose(c, { ...it, uid: `${it.uid}-g`, base: next, qty: 1 });
    } else c.inventory[e.i] = { ...it, base: next };
    w.events.push({ t: 'message', text: `${GEM_BY_ID[next].name} !`, color: '#9cf' });
  } else if (inTab.length) {
    const id = inTab[w.rng.misc.int(inTab.length)];
    c.materials[id]--;
    if (!c.materials[id]) delete c.materials[id];
    c.materials[up(id)] = (c.materials[up(id)] ?? 0) + 1;
    w.events.push({ t: 'message', text: `${GEM_BY_ID[up(id)].name} !`, color: '#9cf' });
  } else {
    // aucune gemme : une gemme au hasard, de qualité croissante avec le niveau de la zone (adaptation)
    const g = Math.min(3, Math.floor(w.zoneLevel / 20));
    const pool = GEMS.filter((x) => x.grade === g);
    const gem = pool[w.rng.misc.int(pool.length)];
    w.dropItem({ uid: `shrinegem-${w.tick}-${gem.id}`, base: gem.id, quality: 'normal', ilvl: w.zoneLevel, sockets: 0, socketed: [], qty: 1 }, w.player.x, w.player.y, 1);
  }
}
