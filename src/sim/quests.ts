/**
 * Logique des quêtes (data/quests.ts) : objectifs, objets de quête (rangés dans l'onglet Matériaux comme les autres monnaies), livraisons
 * aux PNJ, objets du monde (orifice, Forge infernale, Orbe de contrainte, cages), récompenses et verrous d'acte.
 * Tout est indexé par difficulté, comme dans Diablo II.
 */
import { Rng } from '../core/rng';
import { ACT_GATE, HELLFORGE_RUNES, QUEST_LOCKS, QUESTS, QUEST_BY_ID, QUEST_OBJECTS, type QuestDef, type QuestLockDef } from '../data/quests';
import { BASE_BY_ID } from '../data/items/bases';
import { GEMS } from '../data/items/runes';
import type { Difficulty } from '../data/types';
import { DIFF_NAMES } from '../data/types';
import type { RunDef } from '../data/runs';
import type { CharacterState } from './character-state';
import type { Item } from './item';
import type { World } from './world';
import { addToCharacter } from './inventory';
import { matCount, matTake } from './materials';
import { generateItem } from './loot/itemgen';
import { corruptItem } from './corruption';

/** Ce dont la logique de quête a besoin du jeu */
export interface QuestHost {
  character: CharacterState;
  world: World;
  difficulty: Difficulty;
  runDef: RunDef | null;
}

const unit = (id: string, tag: string): Item => ({ uid: `${id}-${tag}`, base: id, quality: 'normal', ilvl: 1, sockets: 0, socketed: [], qty: 1 });
const say = (g: QuestHost, text: string, color = '#e8b04a') => g.world.events.push({ t: 'message', text, color });

/** Quête accomplie à une difficulté (quête de run : la run a été terminée) */
export function questDone(c: CharacterState, id: string, d: Difficulty): boolean {
  const q = QUEST_BY_ID[id];
  const p = c.progression;
  if (q?.goal.kind === 'run') return q.goal.runs.some((r) => (p.completions[`${r}:${d}`] ?? 0) > 0);
  return p.milestones[`quest:${id}:${d}`] !== undefined;
}

const hasQuestItem = (c: CharacterState, id: string): boolean => matCount(c, id) > 0;

/** Donne un objet de quête (onglet Matériaux) */
function giveQuestItem(g: QuestHost, id: string): void {
  addToCharacter(g.character, unit(id, `q${g.world.tick}`));
  say(g, `${BASE_BY_ID[id]?.name ?? id} obtenu`, '#d9b45a');
}

/** Accorde la quête et sa récompense (une fois par difficulté) */
export function completeQuest(g: QuestHost, q: QuestDef, d: Difficulty = g.difficulty): void {
  const c = g.character;
  const key = `quest:${q.id}:${d}`;
  if (c.progression.milestones[key] !== undefined) return;
  c.progression.milestones[key] = Math.round(c.progression.playTime);
  const r = q.reward ?? {};
  const parts: string[] = [];
  if (r.skillPoints) {
    c.skillPoints += r.skillPoints;
    c.progression.bonusSkillPoints += r.skillPoints;
    parts.push(`+${r.skillPoints} point${r.skillPoints > 1 ? 's' : ''} de compétence`);
  }
  if (r.statPoints) {
    c.statPoints += r.statPoints;
    c.progression.bonusStatPoints += r.statPoints;
    parts.push(`+${r.statPoints} points de caractéristiques`);
  }
  for (const id of r.runes ?? []) if (addToCharacter(c, unit(id, `q${q.id}${d}`))) parts.push(BASE_BY_ID[id]?.name ?? id);
  if (r.life) {
    c.bonuses.life = (c.bonuses.life ?? 0) + r.life;
    parts.push(`+${r.life} points de vie`);
  }
  if (r.resAll) {
    c.bonuses.resAll = (c.bonuses.resAll ?? 0) + r.resAll;
    parts.push(`+${r.resAll} % à toutes les résistances`);
  }
  if (r.imbue) parts.push('Charsi peut imprégner un objet');
  if (r.socket) parts.push('Larzuk peut percer un objet');
  if (r.freeMerc) {
    c.progression.milestones[`freeMerc:${r.freeMerc}`] = 0;
    parts.push('un mercenaire offert');
  }
  if (r.ring) {
    const rng = new Rng(`gidbinn:${c.name}:${d}`);
    const ring = generateItem(rng, 'ring', Math.min(99, c.level + 4), { forceQuality: 'rare' });
    corruptItem(rng, ring);
    addToCharacter(c, ring);
    parts.push('un anneau rare corrompu');
  }
  if (r.hellforge) {
    // une rune de la plage de la difficulté (chances égales), une gemme parfaite, deux sans défaut, une normale (PD2 : empilées)
    const rng = new Rng(`hellforge:${c.name}:${d}:${g.world.tick}`);
    const [lo, hi] = HELLFORGE_RUNES[d];
    const rune = `r${String(lo + rng.int(hi - lo + 1)).padStart(2, '0')}`;
    const w = g.world;
    const at = w.objects.find((o) => o.kind === 'quest' && o.ref === 'q_hellforge') ?? w.player;
    const drop = (id: string) => w.dropItem(unit(id, `hf${d}${w.tick}${rng.int(1e6)}`), at.x, at.y, 1.6);
    drop(rune);
    const gem = (grade: number) => GEMS.filter((x) => x.grade === grade)[rng.int(7)].id;
    for (const grade of [4, 3, 3, 2]) drop(gem(grade));
    parts.push(`la Forge vous donne la rune ${BASE_BY_ID[rune]?.name.replace('Rune ', '') ?? rune}`);
  }
  say(g, `Quête accomplie : ${q.name}${parts.length ? ` — ${parts.join(', ')}` : ''}`);
  g.world.refreshPlayer();
}

const inZone = (q: QuestDef, z: string) => q.zone === z || !!q.zones?.includes(z) || (q.zone === 'a2_tomb' && z.startsWith('a2_tomb'));

/** Zone atteinte : quêtes « entrer » */
export function onZoneEnter(g: QuestHost, zone: string): void {
  for (const q of QUESTS) if (q.goal.kind === 'enter' && q.zone === zone && !questDone(g.character, q.id, g.difficulty)) completeQuest(g, q);
}

/** Mort d'un monstre : quêtes de meurtre ou de nettoyage, objets de quête lâchés (Marteau, Fléau, Figurine de jade) */
export function onMonsterDeath(g: QuestHost, e: { id: number; x: number; y: number; monster?: string; name?: string; rank?: string }): void {
  const z = g.runDef?.id;
  if (!z) return;
  const c = g.character;
  const d = g.difficulty;
  const w = g.world;
  for (const q of QUESTS) {
    if (!inZone(q, z) || questDone(c, q.id, d)) continue;
    const goal = q.goal;
    if (goal.kind === 'kill' && ((goal.monster && e.monster === goal.monster) || (goal.name && e.name === goal.name))) {
      if (!goal.all) completeQuest(g, q);
      else {
        // tous ceux de ce genre : aucun vivant, aucun en attente d'apparition
        const alive = w.monsters.some((m) => !m.dead && m.id !== e.id && m.def.id === goal.monster);
        const pending = w.pendingSpawns.some((p) => w.zone.spawns[p.idx]?.monster === goal.monster);
        if (!alive && !pending) completeQuest(g, q);
      }
    } else if (goal.kind === 'clear' && !w.monsters.some((m) => !m.dead && m.id !== e.id && !m.isSummon) && w.pendingSpawns.length === 0) completeQuest(g, q);
  }
  const drop = (id: string) => w.dropItem(unit(id, `d${d}${w.tick}`), e.x, e.y, 0.8);
  const notYet = (id: string, quest: string) => !questDone(c, quest, d) && !hasQuestItem(c, id) && !w.items.some((gi) => gi.item.base === id);
  // Héphasto garde le marteau de la Forge infernale
  if (e.monster === 'hephasto' && notYet('hellforge_hammer', 'forge')) drop('hellforge_hammer');
  // un membre du Haut Conseil porte le Fléau de Khalim (le premier tué)
  if (e.monster === 'council_member' && z === 'a3_travincal' && notYet('khalim_flail', 'khalim') && !hasQuestItem(c, 'khalim_will')) drop('khalim_flail');
  // L'Oiseau d'or : le premier champion ou unique tué dans l'Acte III porte la Figurine de jade (une fois par difficulté)
  const elite = e.rank === 'champion' || e.rank === 'unique';
  if (elite && g.runDef?.campaign === 'act3' && c.progression.milestones[`jade:${d}`] === undefined && notYet('jade_figurine', 'golden_bird') && !hasQuestItem(c, 'golden_bird')) {
    c.progression.milestones[`jade:${d}`] = Math.round(c.progression.playTime);
    drop('jade_figurine');
  }
}

/** Objet de quête du monde touché : il donne un objet, en consomme un, ou fait avancer la quête */
export function useQuestObject(g: QuestHost, objectId: number): void {
  const w = g.world;
  const o = w.objects.find((x) => x.id === objectId);
  if (!o || o.used) return;
  const def = QUEST_OBJECTS.find((q) => q.id === o.ref);
  if (!def) return;
  const c = g.character;
  const d = g.difficulty;
  const q = def.quest ? QUEST_BY_ID[def.quest] : undefined;
  if (def.needs) {
    if (q && questDone(c, q.id, d)) {
      say(g, 'Plus rien à faire ici.', '#aaa');
      return;
    }
    if (!hasQuestItem(c, def.needs)) {
      say(g, `Il vous faut : ${BASE_BY_ID[def.needs]?.name ?? def.needs}`, '#d66');
      return;
    }
    matTake(c, def.needs, 1);
    o.used = true;
    w.events.push({ t: 'impact', kind: 'seal', x: o.x, y: o.y, radius: 2.5, elem: 'fire' });
    if (q) completeQuest(g, q);
    return;
  }
  o.used = true;
  w.events.push({ t: 'impact', kind: 'open_chest', x: o.x, y: o.y, radius: 0.8, elem: 'phys' });
  if (def.gives) {
    // lot 319: the Tree of Inifuss has nothing more to give once its scroll was deciphered (the key held) or the Cairn Stones opened
    const done = (q && questDone(c, q.id, d)) || (def.id === 'q_inifuss' && (hasQuestItem(c, 'cairn_key') || lockOpened(c, 'cairn', d)));
    if (!done && !hasQuestItem(c, def.gives)) giveQuestItem(g, def.gives);
    else if (!def.quest && !hasQuestItem(c, def.gives)) giveQuestItem(g, def.gives);
    else say(g, 'Vide.', '#aaa');
    // Soleil terni : l'autel détruit, l'amulette est à vous
    if (def.id === 'q_viper_altar' && q) completeQuest(g, q);
    return;
  }
  if (def.id === 'q_prison') {
    // Sauvetage sur le mont Arreat : toutes les cages de la zone ouvertes
    say(g, 'Un soldat de Harrogath est libre !', '#9f9');
    if (q && !w.objects.some((x) => x.kind === 'quest' && x.ref === 'q_prison' && !x.used)) completeQuest(g, q);
    return;
  }
  if (def.id === 'q_anya' && q) {
    say(g, 'Anya : « Merci ! Nihlathak m’a enfermée ici… »', '#ffd98a');
    completeQuest(g, q);
    return;
  }
  if (def.id === 'q_journal') say(g, 'Journal d’Horazon : « …le Canyon des Mages garde les sept tombeaux. »', '#ffd98a');
}

/** Livraisons aux PNJ (D2 : on rapporte l'objet à celui qui l'a demandé) */
const DELIVERIES: { npc: string; item: string; quest?: string; swap?: string; text: string }[] = [
  // lot 319: Akara deciphers the Scroll of Inifuss (Diablo II: the Key to the Cairn Stones)
  {
    npc: 'akara',
    item: 'inifuss_scroll',
    swap: 'cairn_key',
    text: 'Akara : « Ce parchemin donne l’ordre des Pierres de Cairn : touchez-les et Tristram s’ouvrira. »',
  },
  { npc: 'charsi', item: 'horadric_malus', quest: 'malus', text: 'Charsi : « Mon Malus ! Je vais pouvoir imprégner un de vos objets. »' },
  { npc: 'meshif3', item: 'jade_figurine', swap: 'golden_bird', text: 'Meshif : « Cette figurine ? Prenez plutôt cet oiseau d’or, Alkor saura quoi en faire. »' },
  { npc: 'alkor', item: 'golden_bird', quest: 'golden_bird', text: 'Alkor : « Buvez cette Potion de vie. »' },
  { npc: 'alkor', item: 'lam_esen_tome', quest: 'lam_esen', text: 'Alkor : « Le Grimoire de Lam Esen ! Lisez ce passage… »' },
  { npc: 'ormus', item: 'gidbinn', quest: 'gidbinn', text: 'Ormus : « Le Gidbinn ! Ormus vous remercie : prenez cet anneau. »' },
];

/** Parler à un PNJ : remet les objets de quête attendus */
export function talkTo(g: QuestHost, npc: string): void {
  const c = g.character;
  for (const dl of DELIVERIES) {
    if (dl.npc !== npc || !hasQuestItem(c, dl.item)) continue;
    if (dl.quest && questDone(c, dl.quest, g.difficulty)) continue;
    matTake(c, dl.item, 1);
    say(g, dl.text, '#ffd98a');
    if (dl.swap) giveQuestItem(g, dl.swap);
    if (dl.quest) completeQuest(g, QUEST_BY_ID[dl.quest]);
  }
}

/**
 * Verrou d'acte (D2) : l'acte suivant s'ouvre à la mort du boss de l'acte précédent, à la même difficulté. Null = ouvert.
 * Lot 320 (audit 3.12): by difficulty only, as Diablo II: an act walked in Normal is not open in Nightmare before its gate's boss dies in
 * Nightmare (the zones visited, which are not kept by difficulty, and a difficulty beaten no longer open it)
 */
export function actLock(c: CharacterState, campaign: string, d: Difficulty): string | null {
  const gate = ACT_GATE[campaign];
  if (!gate || questDone(c, gate, d)) return null;
  const q = QUEST_BY_ID[gate];
  return `${q.name} (${DIFF_NAMES[d]}) ouvre cet acte`;
}

/* ------------------------------------------------------------------ */
/* Lot 319: quest locks on the Campaign's passages                     */
/* ------------------------------------------------------------------ */

/** The lock on the passage from zone `from` to `to` (`chamber`: the true tomb's door), if Diablo II has one there */
export function questLockOf(from: string, to: string): QuestLockDef | undefined {
  return QUEST_LOCKS.find((l) => l.to === to && (l.from === from || (l.from === 'a2_tomb' && from.startsWith('a2_tomb'))));
}

/** The lock `id` opened otherwise than by its quest at difficulty `d` (the Cairn Stones by their key, a save of before the locks) */
const lockOpened = (c: CharacterState, id: string, d: Difficulty): boolean => c.progression.milestones[`gate:${id}:${d}`] !== undefined;

/**
 * Lot 319: what keeps the passage from `from` to `to` shut at difficulty `d` (the hint to show), or null when it is open: no lock there, its
 * quest done, the lock opened otherwise, or a difficulty already beaten (as `actLock`: nothing closes again on a hero who went further)
 */
export function questLock(c: CharacterState, from: string, to: string, d: Difficulty): string | null {
  const l = questLockOf(from, to);
  if (!l || questDone(c, l.quest, d) || lockOpened(c, l.id, d) || d < c.progression.highestDifficulty) return null;
  return l.hint;
}

/**
 * Lot 319: the hero at a shut passage. The Cairn Stones open with their key (Diablo II: the deciphered Scroll of Inifuss; the key is spent,
 * the portal stays open at this difficulty). True: the passage is open (now or already); false: the hint was shown.
 */
export function tryQuestLock(g: QuestHost, from: string, to: string): boolean {
  const c = g.character;
  const d = g.difficulty;
  const why = questLock(c, from, to, d);
  if (!why) return true;
  const l = questLockOf(from, to)!;
  if (l.id === 'cairn' && hasQuestItem(c, 'cairn_key')) {
    matTake(c, 'cairn_key', 1);
    c.progression.milestones[`gate:cairn:${d}`] = Math.round(c.progression.playTime);
    say(g, 'Les Pierres de Cairn s’illuminent : le portail de Tristram s’ouvre.', '#ffd98a');
    return true;
  }
  say(g, why, '#d9b45a');
  return false;
}

/** Marker of a character whose save went through `migrateQuestLocks` (or made since the locks) */
export const LOCKS_MIGRATED = 'locks:319';

/**
 * Lot 319: a save of before the quest locks (no marker). A passage the hero already went through stays open: the lock is recorded as opened at
 * his highest difficulty (lower ones are open anyway, `questLock`); Duriel's door counts as passed once Duriel is dead there. Nothing else
 * changes; the marker is set so it runs once (a character made since then is marked at once and keeps every lock of Diablo II).
 */
export function migrateQuestLocks(c: CharacterState): void {
  const ms = c.progression.milestones;
  if (ms[LOCKS_MIGRATED] !== undefined) return;
  const d = c.progression.highestDifficulty;
  for (const l of QUEST_LOCKS) {
    const passed = l.to === 'chamber' ? questDone(c, 'duriel', d) : ms[`zone:${l.to}`] !== undefined;
    if (passed && !questDone(c, l.quest, d)) ms[`gate:${l.id}:${d}`] ??= 0;
  }
  ms[LOCKS_MIGRATED] = 0;
}
