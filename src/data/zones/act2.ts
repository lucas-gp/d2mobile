// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Campagne de l'Acte II : Lut Gholein, le désert (Rocky Waste → Dry Hills → Far Oasis → Lost City → Valley of Snakes → Canyon of the Magi), les donjons de Levels.txt
 * (égouts, harem et caves du palais, Sanctuaire des arcanes, Stony Tomb, Halls of the Dead, Claw Viper Temple, repaire des vers, tunnels antiques) et les Tombeaux de Tal Rasha
 * avec Duriel. Mêmes règles que l'Acte I : escaliers dessinés par les cartes sous terre, portails en plein air, monstres, densité et uniques de Levels.txt, super-uniques et PNJ
 * aux emplacements de monpreset.txt.
 */
import { superUniqueHere } from '../superunique-zones';
import { addQuestObjects, addQuestObjectsSteps } from './d2objects';
import { runSteps, type Steps } from './steps';
import { d2Map, nearestOpen } from '../d2map';
import type { Difficulty } from '../types';
import type { ObjectDef, SpawnDef, ZoneDef } from '../zone-types';
import { ZoneBuilder } from './builder';
import { withD2Farm } from './d2farm';
import { addExitsTo, addWaypoint, dsObject, pushWaypoint, joinedFarm, S, wide, type A1Step } from './act1';
import { buildTombs, TOMB_SYMBOLS } from './tombs';

export type A2Step = A1Step;

export const ACT2_STEPS: A2Step[] = [
  S(
    'a2_town',
    'Lut Gholein',
    [
      { to: 'a2_rocky', at: 'rocky' },
      { to: 'a2_sewer1', at: 'sewer', label: 'Égouts' },
      { to: 'a2_harem1', at: 'harem', label: 'Palais' },
    ],
    false,
  ),
  S('a2_rocky', 'Rocky Waste', [
    { to: 'a2_town', at: 'prev' },
    { to: 'a2_dryhills', at: 'next' },
    { to: 'a2_stony1', at: 'stony', label: 'Stony Tomb' },
  ]),
  S('a2_dryhills', 'Dry Hills', [
    { to: 'a2_rocky', at: 'prev' },
    { to: 'a2_oasis', at: 'next' },
    { to: 'a2_halls1', at: 'halls', label: 'Halls of the Dead' },
  ]),
  S('a2_oasis', 'Far Oasis', [
    { to: 'a2_dryhills', at: 'prev' },
    { to: 'a2_lostcity', at: 'next' },
    { to: 'a2_maggot1', at: 'lair', label: 'Repaire des vers' },
  ]),
  S('a2_lostcity', 'Lost City', [
    { to: 'a2_oasis', at: 'prev' },
    { to: 'a2_valley', at: 'next' },
    { to: 'a2_tunnels', at: 'tunnels', label: 'Tunnels antiques' },
  ]),
  // lot 320: the Valley of Snakes is a dead end (Diablo II): the Canyon of the Magi is reached by the Summoner's portal in the
  // Arcane Sanctuary (src/sim/game.ts, `QUEST_PORTALS`) and left by its waypoint
  S('a2_valley', 'Valley of Snakes', [
    { to: 'a2_lostcity', at: 'prev' },
    { to: 'a2_viper1', at: 'viper', label: 'Temple des Vipères' },
  ]),
  S('a2_canyon', 'Canyon des Mages', [{ to: 'a2_tomb1', at: 'tombs', label: `Tombeau ${TOMB_SYMBOLS[0]}` }]),
  ...Array.from({ length: 7 }, (_, k) => S(`a2_tomb${k + 1}`, `Tombeau ${TOMB_SYMBOLS[k]}`, [{ to: 'a2_canyon', at: 'prev' }], false)),
  S('a2_sewer1', 'Égouts, niveau 1', [
    { to: 'a2_town', at: 'prev' },
    { to: 'a2_sewer2', at: 'next' },
  ]),
  S('a2_sewer2', 'Égouts, niveau 2', [
    { to: 'a2_sewer1', at: 'prev' },
    { to: 'a2_sewer3', at: 'next' },
  ]),
  S('a2_sewer3', 'Égouts, niveau 3', [{ to: 'a2_sewer2', at: 'prev' }]),
  S(
    'a2_harem1',
    'Harem, niveau 1',
    [
      { to: 'a2_town', at: 'prev' },
      { to: 'a2_harem2', at: 'next' },
    ],
    false,
  ),
  S('a2_harem2', 'Harem, niveau 2', [
    { to: 'a2_harem1', at: 'prev' },
    { to: 'a2_cellar1', at: 'next' },
  ]),
  S('a2_cellar1', 'Cave du palais, niveau 1', [
    { to: 'a2_harem2', at: 'prev' },
    { to: 'a2_cellar2', at: 'next' },
  ]),
  S('a2_cellar2', 'Cave du palais, niveau 2', [
    { to: 'a2_cellar1', at: 'prev' },
    { to: 'a2_cellar3', at: 'next' },
  ]),
  S('a2_cellar3', 'Cave du palais, niveau 3', [
    { to: 'a2_cellar2', at: 'prev' },
    { to: 'a2_arcane', at: 'next', label: 'Sanctuaire des arcanes' },
  ]),
  S('a2_arcane', 'Sanctuaire des arcanes', [{ to: 'a2_cellar3', at: 'prev' }]),
  S('a2_stony1', 'Stony Tomb, niveau 1', [
    { to: 'a2_rocky', at: 'prev' },
    { to: 'a2_stony2', at: 'next' },
  ]),
  S('a2_stony2', 'Stony Tomb, niveau 2', [{ to: 'a2_stony1', at: 'prev' }]),
  S('a2_halls1', 'Halls of the Dead, niveau 1', [
    { to: 'a2_dryhills', at: 'prev' },
    { to: 'a2_halls2', at: 'next' },
  ]),
  S('a2_halls2', 'Halls of the Dead, niveau 2', [
    { to: 'a2_halls1', at: 'prev' },
    { to: 'a2_halls3', at: 'next' },
  ]),
  S('a2_halls3', 'Halls of the Dead, niveau 3', [{ to: 'a2_halls2', at: 'prev' }]),
  S('a2_viper1', 'Temple des Vipères, niveau 1', [
    { to: 'a2_valley', at: 'prev' },
    { to: 'a2_viper2', at: 'next' },
  ]),
  S('a2_viper2', 'Temple des Vipères, niveau 2', [{ to: 'a2_viper1', at: 'prev' }]),
  S('a2_maggot1', 'Repaire des vers, niveau 1', [
    { to: 'a2_oasis', at: 'prev' },
    { to: 'a2_maggot2', at: 'next' },
  ]),
  S('a2_maggot2', 'Repaire des vers, niveau 2', [
    { to: 'a2_maggot1', at: 'prev' },
    { to: 'a2_maggot3', at: 'next' },
  ]),
  S('a2_maggot3', 'Repaire des vers, niveau 3', [{ to: 'a2_maggot2', at: 'prev' }]),
  S('a2_tunnels', 'Tunnels antiques', [{ to: 'a2_lostcity', at: 'prev' }]),
];
/** Tombeau de Tal Rasha (indice 0-6) selon la difficulté : Normal 3, Cauchemar 5, Enfer 1 (« le symbole du vrai tombeau change à chaque difficulté ») */
const TRUE_TOMB = [3, 5, 1];
const A2_BY_ID: Record<string, A2Step> = Object.fromEntries(ACT2_STEPS.map((s) => [s.id, s]));
const OUTDOORS = new Set(['a2_town', 'a2_rocky', 'a2_dryhills', 'a2_oasis', 'a2_lostcity', 'a2_valley', 'a2_canyon']);
/**
 * Lot 312: Act II's desert joined edge to edge as in Diablo II (src/data/zones/seams.ts), in the order the hero walks it: Lut Gholein, the
 * Rocky Waste, the Dry Hills, the Far Oasis, the Lost City, the Valley of Snakes (the Canyon of the Magi is reached by the Summoner's
 * portal in the game: its exit stays a portal)
 */
export const A2_CHAIN = ['a2_town', 'a2_rocky', 'a2_dryhills', 'a2_oasis', 'a2_lostcity', 'a2_valley'];

/** La campagne a besoin de toutes les cartes importées */
export const act2Available = (): boolean => ACT2_STEPS.every((s) => s.id.startsWith('a2_tomb') || !!d2Map(s.id)) && !!d2Map('tombs');

/** Super-uniques de monpreset.txt (Acte II) : [monstre du jeu, nom] */
const SUPER: Record<string, [string, string]> = {
  beetleburst: ['scarab', 'Beetleburst'],
  'dark elder': ['zombie', 'Dark Elder'],
  'bloodwitch the wild': ['panther_woman', 'Bloodwitch la Sauvage'],
  'the feature creep': ['baboon', 'Le Rampant'],
};

/** Ville : PNJ de monpreset (Atma, Fara, Drognan, Lysander, Elzix, Greiz, Geglash, Meshif, Warriv), coffre, cube et point de passage */
function town(z: ZoneDef): ZoneDef {
  const m = d2Map('a2_town');
  const presets = ((m?.raw as { presets?: [string, number, number][] } | undefined)?.presets ?? []).filter(([n]) => !!n);
  const at = (n: string, dx = 0, dy = 1.5) => {
    const p = presets.find((q) => q[0] === n);
    return p && m ? nearestOpen(m, p[1] + dx, p[2] + dy) : null;
  };
  z.spawns = [];
  z.objects = [];
  z.lights = [];
  z.town = true;
  const put = (kind: ObjectDef['kind'], p: { x: number; y: number } | null, id?: string) => {
    if (p) z.objects.push({ kind, x: p.x, y: p.y, ...(id ? { id } : {}) });
  };
  for (const [preset, id] of [
    ['atma', 'atma'],
    ['fara', 'fara'],
    ['drognan', 'drognan'],
    ['lysander', 'lysander'],
    ['elzix', 'elzix'],
    ['greiz', 'greiz'],
    ['geglash', 'geglash'],
    ['meshif1', 'meshif'],
    ['warriv2', 'warriv2'],
  ] as const)
    put('npc', at(preset), id);
  put('npc', at('warriv2', 2.5, 2.5), 'cain2');
  put('npc', at('atma', -2.5, 2.5), 'jerhyn');
  const bank = dsObject(m, 21);
  const wp = dsObject(m, 10);
  put('stash', bank && m ? wide(m, bank.x, bank.y + 1) : at('atma', 3, 3));
  put('cube', bank && m ? wide(m, bank.x + 3, bank.y + 2) : at('atma', 5.5, 3));
  pushWaypoint(z, m, wp && m ? wide(m, wp.x, wp.y + 1) : at('warriv2', 4, 3), wp ?? undefined);
  const st = wp && m ? wide(m, wp.x + 2, wp.y + 4) : at('warriv2', -3, 3);
  if (st) z.start = st;
  return z;
}

/** Zone de l'Acte II avec ses objets de quête (l'orifice n'est que dans le vrai tombeau de Tal Rasha) */
export function buildA2(id: string, seed: number, difficulty: Difficulty): ZoneDef {
  if (A2_CHAIN.includes(id)) return runSteps(buildA2Steps(id, seed, difficulty));
  const z = runSteps(buildA2Zone(id, seed, difficulty));
  if (!id.startsWith('a2_tomb')) return addQuestObjects(z, id);
  const k = Number(id.slice(7)) - 1;
  if (k === TRUE_TOMB[difficulty]) return addQuestObjects(z, 'a2_tomb');
  z.objects = z.objects.filter((o) => !(o.kind === 'quest' && o.id === 'q_orifice'));
  return z;
}

/** `buildA2` of a zone of the joined chain in steps (lot 312: a neighbour built behind the play, src/data/zones/steps.ts) */
export function* buildA2Steps(id: string, seed: number, difficulty: Difficulty): Steps<ZoneDef> {
  const z = yield* buildA2Zone(id, seed, difficulty);
  yield;
  return yield* addQuestObjectsSteps(z, id);
}

function* buildA2Zone(id: string, seed: number, difficulty: Difficulty): Steps<ZoneDef> {
  const step = A2_BY_ID[id];
  if (id.startsWith('a2_tomb')) {
    // sept tombeaux : un seul (selon la difficulté) est celui de Tal Rasha, avec Duriel ; les six autres se terminent par un gardien et ses coffres
    const k = Number(id.slice(7)) - 1;
    const z = buildTombs(seed + k * 7919, difficulty);
    if (k !== TRUE_TOMB[difficulty]) {
      z.spawns = z.spawns.filter((sp) => sp.monster !== 'duriel' && !sp.runBoss);
      z.exits = z.exits.filter((e) => e.to !== 'chamber');
      z.chamberAt = undefined;
      z.chamberKind = undefined;
    }
    z.name = `Tombeau ${TOMB_SYMBOLS[k]}`;
    const m = d2Map('tombs');
    const p = m ? wide(m, z.start.x + 3, z.start.y + 2) : z.start;
    z.exits.push({ x: p.x, y: p.y, kind: 'portal', to: 'zone:a2_canyon', label: 'Retour : Canyon des Mages' });
    return z;
  }
  const b = new ZoneBuilder(id, step.name, 72, 72, 'sand', { theme: 'tomb', mood: 'tombs', ambient: { color: 0x40382a, level: 0.3 } });
  b.start(10, 10);
  // boss de zone : Radament au fond des égouts, l'Invocateur dans sa salle des arcanes
  if (id === 'a2_sewer3') b.spawn({ monster: 'radament', x: 60, y: 60, count: 1, r: 0, rank: 'boss', trigger: 9 });
  if (id === 'a2_arcane') b.spawn({ monster: 'summoner', x: 60, y: 60, count: 1, r: 0, rank: 'boss', trigger: 9 });
  const z = A2_CHAIN.includes(id) ? yield* joinedFarm(b.build(), id, step, A2_CHAIN, seed, difficulty) : withD2Farm(b.build(), seed, difficulty);
  z.id = id;
  const m = d2Map(id);
  if (m) z.start = wide(m, z.start.x, z.start.y);
  const presets = ((m?.raw as { presets?: [string, number, number][] } | undefined)?.presets ?? []).filter(([n]) => !!n);
  const seen = new Set<string>();
  for (const [n, x, y] of presets) {
    const s = SUPER[n];
    if (!s || !m || seen.has(n) || !superUniqueHere(n, id)) continue;
    seen.add(n);
    const p = nearestOpen(m, x, y);
    const sp: SpawnDef = { monster: s[0], x: p.x, y: p.y, count: 4, r: 2, rank: 'unique', uniqueName: s[1], trigger: 11 };
    z.spawns.push(sp);
  }
  // plateformes de téléportation du Sanctuaire des arcanes : par paires entre les salles éloignées
  if (id === 'a2_arcane' && m) {
    const raw = m.raw as { anchors?: Record<string, [number, number]> };
    const a = raw.anchors;
    if (a?.prev && a?.next) {
      const pad = (x: number, y: number, to: [number, number]) => {
        const p = wide(m, x, y);
        z.exits.push({ x: p.x, y: p.y, kind: 'portal', to: `tp:${to[0]},${to[1]}`, label: 'Plateforme de téléportation' });
      };
      const A = nearestOpen(m, a.prev[0] + 6, a.prev[1] + 6);
      const B = nearestOpen(m, a.next[0] - 6, a.next[1] - 6);
      pad(A.x, A.y, [B.x, B.y]);
      pad(B.x, B.y, [A.x, A.y]);
    }
  }
  // Canyon : sept entrées de tombeaux réparties dans le canyon (la première est celle de la carte d'origine)
  if (id === 'a2_canyon' && m) {
    const cx = z.width / 2;
    const cy = z.height / 2;
    for (let k = 1; k < 7; k++) {
      const ang = (k / 7) * Math.PI * 2;
      const p = wide(m, cx + Math.cos(ang) * 34, cy + Math.sin(ang) * 34);
      z.exits.push({ x: p.x, y: p.y, kind: 'portal', to: `zone:a2_tomb${k + 1}`, label: `Tombeau ${TOMB_SYMBOLS[k]}`, variant: 'red' });
    }
  }
  if (id !== 'a2_town') addWaypoint(z);
  if (id === 'a2_town') return addExitsTo(town(z), step, A2_BY_ID, OUTDOORS);
  return addExitsTo(z, step, A2_BY_ID, OUTDOORS);
}
