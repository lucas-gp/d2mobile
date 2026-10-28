/**
 * Génère src/data/monsters-fidelity.ts d'après monstats.txt, monumod.txt et SuperUniques.txt (Diablo II LoD 1.13c, MPQ du joueur) :
 * - résistances [N, C, E] de la variante principale de chaque monstre et variantes d'immunité (D2 : même espèce, immunité selon la variante) ;
 * - régénération (DamageRegen : PV max × valeur / 4096 par image, 25 images/s) ;
 * - boss : vie et dégâts par difficulté relatifs aux courbes (vie ≈ base monstats / 95, dégâts ≈ A1 moyen / 77, même échelle que gen-monsters-d2.ts) ;
 * - super-uniques : espèce, modificateurs fixes (Mod1-3), taille du groupe (MinGrp/MaxGrp), alias des noms affichés par les zones.
 * Valeurs Project Diablo 2 (résistances des porte-clés et des ubers, multiplicateurs de vie, vie des ubers, efficacité du vol de vie,
 * régénération des ubers) : patch du mod (mods/pd2/data/monsters.patch.ts, généré par diff), dont la provenance est vérifiée par
 * mods/pd2/tools/audit/monster-fidelity-pd2.ts (`writeFidelity` avec la table du wiki PD2).
 * Relançable : npx tsx tools/audit/gen-monster-fidelity.ts [dossier de sortie] [--report] ; `npm run vanilla -- monsters` : contrôle.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { D2_HEADER, rows, num } from './common';

const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'src/data';

type Tri = [number, number, number];
const EL: [string, string][] = [
  ['phys', 'ResDm'],
  ['magic', 'ResMa'],
  ['fire', 'ResFi'],
  ['light', 'ResLi'],
  ['cold', 'ResCo'],
  ['poison', 'ResPo'],
];
const SFX = ['', '(N)', '(H)'];
const range = (base: string, a: number, b: number): string[] => Array.from({ length: b - a + 1 }, (_, i) => `${base}${a + i}`);

/**
 * Nos monstres -> variantes monstats (la première est la principale ; les autres donnent les variantes d'immunité tirées par groupe).
 * `su` : super-unique dont la vie est celle de la classe × bonus d'unique (×4/×3/×2).
 */
const SPECS: Record<string, { v: string[]; boss?: boolean; su?: boolean }> = {
  fallen: { v: range('fallen', 1, 4) },
  fallen_shaman: { v: range('fallenshaman', 1, 4) },
  zombie: { v: ['zombie1', 'zombie2', 'zombie5'] },
  ghoul: { v: ['zombie3', 'zombie4'] },
  skeleton: { v: ['skeleton1', 'skeleton2', 'skeleton3', 'skeleton5'] },
  burning_dead: { v: ['skeleton4'] },
  skeleton_archer: { v: range('sk_archer', 1, 5) },
  skeleton_mage: { v: ['skmage_cold1', 'skmage_ltng1', 'skmage_fire1', 'skmage_pois1'] },
  mummy: { v: range('mummy', 1, 5) },
  unraveler: { v: range('unraveler', 1, 5) },
  warped_shaman: { v: ['fallenshaman5'] },
  storm_caster: { v: ['fingermage3'] },
  council_member: { v: range('councilmember', 1, 3) },
  scarab: { v: range('scarab', 1, 5) },
  dark_stalker: { v: range('corruptrogue', 1, 4) },
  hell_bovine: { v: ['hellbovine'] },
  minion_destruction: { v: ['baalminion1'] },
  venom_lord: { v: ['venomlord', 'megademon3'] },
  oblivion_knight: { v: ['doomknight3', 'dkmag1'] },
  soul_killer: { v: range('fetish', 1, 5).map((x, i) => (i === 0 ? 'fetish4' : i === 3 ? 'fetish1' : x)) },
  blood_lord: { v: range('bloodlord', 1, 5).map((x, i) => (i === 0 ? 'bloodlord3' : i === 2 ? 'bloodlord1' : x)) },
  // monsters-d2.ts
  goatman: { v: range('goatman', 1, 5) },
  wraith: { v: range('wraith', 1, 5) },
  afflicted: { v: range('bighead', 1, 5) },
  ghoul_lord: { v: range('vampire', 1, 5) },
  blunderbore: { v: range('blunderbore', 1, 4) },
  minion: { v: range('minion', 1, 8) },
  succubus: { v: range('succubus', 1, 5) },
  succubus_witch: { v: range('succubuswitch', 1, 5) },
  putrid_defiler: { v: range('putriddefiler', 1, 5) },
  imp: { v: range('imp', 1, 5) },
  siege_beast: { v: range('siegebeast', 1, 5) },
  death_mauler: { v: range('deathmauler', 1, 5) },
  overseer: { v: range('overseer', 1, 5) },
  vile_mother: { v: range('vilemother', 1, 3) },
  regurgitator: { v: range('regurgitator', 1, 3) },
  sand_leaper: { v: range('sandleaper', 1, 5) },
  willowisp: { v: range('willowisp', 1, 4) },
  bat_demon: { v: range('batdemon', 1, 5) },
  sand_maggot: { v: range('sandmaggot', 1, 5) },
  quill_rat: { v: range('quillrat', 1, 5) },
  brute: { v: range('brute', 1, 5) },
  foul_crow: { v: range('foulcrow', 1, 4) },
  arach: { v: range('arach', 1, 5) },
  panther_woman: { v: range('pantherwoman', 1, 4) },
  slinger: { v: ['slinger1', 'slinger3', 'slinger4'] },
  vulture: { v: range('vulture', 1, 4) },
  sand_raider: { v: range('sandraider', 1, 5) },
  claw_viper: { v: range('clawviper', 1, 5) },
  locust: { v: range('swarm', 1, 4) },
  baboon: { v: range('baboon', 1, 5) },
  fetish: { v: range('fetish', 1, 5) },
  fetish_blow: { v: range('fetishblow', 1, 5) },
  fetish_shaman: { v: range('fetishshaman', 1, 5) },
  bone_fetish: { v: range('bonefetish', 1, 5) },
  mosquito: { v: range('mosquito', 1, 4) },
  thornhulk: { v: range('thornhulk', 1, 4) },
  frog_demon: { v: range('frogdemon', 1, 3) },
  zealot: { v: range('zealot', 1, 3) },
  cantor: { v: range('cantor', 1, 4) },
  snowy_yeti: { v: range('snowyeti', 1, 4) },
  frozen_horror: { v: range('frozenhorror', 1, 5) },
  suicide_minion: { v: range('suicideminion', 1, 8) },
  prowling_dead: { v: range('reanimatedhorde', 1, 5) },
  // espèces ajoutées par ce lot (monsters-d2.ts)
  dark_ranger: { v: range('cr_archer', 1, 5) },
  dark_spearwoman: { v: range('cr_lancer', 1, 5) },
  doom_knight: { v: ['doomknight1', 'dkfig1'] },
  abyss_knight: { v: ['doomknight2'] },
  balrog: { v: ['megademon1', 'megademon2'] },
  flesh_beast: { v: range('vilechild', 1, 3) },
  maggot_young: { v: range('maggotbaby', 1, 5) },
  maggot_queen: { v: range('maggotqueen', 1, 5), boss: false },
  pain_worm: { v: range('painworm', 1, 5) },
  water_watcher: { v: ['tentaclehead1', 'tentaclehead3'] },
  flying_scimitar: { v: ['flyingscimitar'] },
  night_marauder: { v: ['baboon6'] },
  spear_cat: { v: ['slinger2'] },
  // boss
  griswold: { v: ['griswold'], boss: true },
  duriel: { v: ['duriel'], boss: true },
  countess: { v: ['corruptrogue3'], boss: true, su: true },
  andariel: { v: ['andariel'], boss: true },
  mephisto: { v: ['mephisto'], boss: true },
  pindleskin: { v: ['reanimatedhorde5'], boss: true, su: true },
  eldritch: { v: ['minion1'], boss: true, su: true },
  shenk: { v: ['overseer1'], boss: true, su: true },
  nihlathak: { v: ['nihlathakboss'], boss: true },
  ancient_talic: { v: ['ancientbarb1'], boss: true, su: true },
  ancient_madawc: { v: ['ancientbarb2'], boss: true, su: true },
  ancient_korlic: { v: ['ancientbarb3'], boss: true, su: true },
  cow_king: { v: ['hellbovine'], boss: true, su: true },
  baal: { v: ['baalcrab'], boss: true },
  diablo: { v: ['diablo'], boss: true },
  izual: { v: ['izual'], boss: true },
  hephasto: { v: ['hephasto'], boss: true },
  radament: { v: ['radament'], boss: true },
  summoner: { v: ['summoner'], boss: true },
  blood_raven: { v: ['bloodraven'], boss: true },
  the_smith: { v: ['smith'], boss: true },
  dclone: { v: ['diabloclone'], boss: true },
  uber_duriel: { v: ['uberduriel'], boss: true },
  uber_mephisto: { v: ['ubermephisto'], boss: true },
  uber_diablo: { v: ['uberdiablo'], boss: true },
  uber_baal: { v: ['uberbaal'], boss: true },
  lilith: { v: ['uberandariel'], boss: true },
  uber_izual: { v: ['uberizual'], boss: true },
};

/**
 * Écarts d'un monstre à appliquer par-dessus Diablo II (table d'un mod : wiki PD2) : résistances phys/magie/feu/foudre/froid/poison en Enfer
 * (`all` : aux trois difficultés), vie × (Enfer, ou partout avec `all`), vie de base imposée (`uberHp`), dégâts × en Enfer (`hellDmg`),
 * efficacité du vol de vie (`drain`, %), régénération imposée.
 */
export interface Pd2Fidelity {
  res?: number[];
  all?: boolean;
  hp?: number;
  uberHp?: number;
  hellDmg?: number;
  drain?: number;
  regen?: number;
}

/* ---------------- super-uniques ---------------- */
const MOD: Record<string, string> = {
  strong: 'extraStrong',
  fast: 'extraFast',
  curse: 'cursed',
  resist: 'magicResistant',
  fire: 'fireEnchanted',
  lightning: 'lightningEnchanted',
  cold: 'coldEnchanted',
  manahit: 'manaBurn',
  teleport: 'teleport',
  spectralhit: 'spectralHit',
  stoneskin: 'stoneSkin',
  multishot: 'multishot',
  aura: 'auraEnchanted',
};
/** classe monstats -> notre espèce (les super-uniques dont l'espèce existe) */
const CLASS: Record<string, string> = {};
for (const [id, s] of Object.entries(SPECS)) if (!s.boss) for (const v of s.v) CLASS[v] ??= id;
Object.assign(CLASS, {
  fallen2: 'fallen',
  cr_archer1: 'dark_ranger',
  bighead2: 'afflicted',
  quillrat4: 'quill_rat',
  skmage_pois3: 'skeleton_mage',
  pantherwoman1: 'panther_woman',
  clawviper3: 'claw_viper',
  scarab2: 'scarab',
  mummy2: 'mummy',
  maggotqueen1: 'maggot_queen',
  sandraider3: 'sand_raider',
  zombie5: 'zombie',
  unraveler3: 'unraveler',
  arach4: 'arach',
  fetishshaman4: 'fetish_shaman',
  thornhulk3: 'thornhulk',
  corruptrogue5: 'dark_stalker',
  batdemon3: 'bat_demon',
  councilmember1: 'council_member',
  councilmember2: 'council_member',
  councilmember3: 'council_member',
  megademon3: 'venom_lord',
  willowisp3: 'willowisp',
  vilemother2: 'vile_mother',
  regurgitator2: 'regurgitator',
  doomknight3: 'oblivion_knight',
  fingermage3: 'storm_caster',
  hellbovine: 'cow_king',
  zombie1: 'zombie',
  overseer1: 'overseer',
  bloodlord3: 'blood_lord',
  reanimatedhorde2: 'prowling_dead',
  imp3: 'imp',
  minion1: 'minion',
  deathmauler1: 'death_mauler',
  siegebeast3: 'siege_beast',
  reanimatedhorde5: 'prowling_dead',
  frozenhorror1: 'frozen_horror',
  succubus4: 'succubus',
  succubuswitch2: 'succubus_witch',
  overseer3: 'overseer',
  imp5: 'imp',
  deathmauler5: 'death_mauler',
  snowyeti4: 'snowy_yeti',
  fallenshaman5: 'warped_shaman',
  unraveler5: 'unraveler',
  baalhighpriest: 'council_member',
  venomlord: 'venom_lord',
  baalminion1: 'minion_destruction',
  griswold: 'griswold',
  radament: 'radament',
  summoner: 'summoner',
  smith: 'the_smith',
  hephasto: 'hephasto',
  nihlathakboss: 'nihlathak',
  ancientbarb1: 'ancient_talic',
  ancientbarb2: 'ancient_madawc',
  ancientbarb3: 'ancient_korlic',
  corruptrogue3: 'dark_stalker',
});
/** Noms affichés par nos zones (français, PD2) -> super-unique */
const ALIAS: Record<string, string> = {
  bonebreaker: 'bonebreak',
  'flamespike le rampant': 'flamespike the crawler',
  'bloodwitch la sauvage': 'bloodwitch the wild',
  'le rampant': 'the feature creep',
  'battlemaid sarina': 'sarina the battlemaid',
  'le forgeron': 'the smith',
  'treehead woodfist': 'treehead woodfist',
  'grand vizir du chaos': 'grand vizier of chaos',
  'seigneur de seis': 'lord de seis',
  'infecteur d’âmes': 'infector of souls',
  "infecteur d'âmes": 'infector of souls',
  'colenzo l’annihilateur': 'baal subject 1',
  'achmel le maudit': 'baal subject 2',
  'bartuc le sanglant': 'baal subject 3',
  'ventar le déchaîné': 'baal subject 4',
  'lister le tourmenteur': 'baal subject 5',
  'eldritch the rectifier': 'megaflow rectifier',
  'shenk the overseer': 'siege boss',
  'the countess': 'the countess',
};
const ms = new Map(rows('monstats').map((r) => [r.Id, r]));
const get = (id: string) => {
  const r = ms.get(id);
  if (!r) throw new Error(`monstats : ${id} introuvable`);
  return r;
};
const resOf = (id: string): Record<string, Tri> => {
  const r = get(id);
  const o: Record<string, Tri> = {};
  for (const [k, c] of EL) {
    const v = [0, 1, 2].map((d) => num(r[c + SFX[d]])) as Tri;
    if (v.some((x) => x)) o[k] = v;
  }
  return o;
};
const fmtRes = (o: Record<string, Tri>): string =>
  `{ ${Object.entries(o)
    .map(([k, v]) => `${k}: [${v.join(', ')}]`)
    .join(', ')} }`;
const avg = (r: Record<string, string>, a: string, b: string, d: number) =>
  (num(r[(d ? a.charAt(0).toUpperCase() + a.slice(1) : a) + SFX[d]]) + num(r[(d ? b.charAt(0).toUpperCase() + b.slice(1) : b) + SFX[d]])) / 2;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Écrit monsters-fidelity.ts dans `outDir` : Diablo II, plus les écarts `pd2` (vide : la table de la base) */
export function writeFidelity(outDir: string, PD2: Record<string, Pd2Fidelity> = {}): { report: string[]; su: number } {
  const out: string[] = [];
  const report: string[] = [];
  for (const [id, s] of Object.entries(SPECS)) {
    const variants = s.v.map(resOf);
    const fields: string[] = [`d2: '${s.v[0]}'`];
    const pd = PD2[id];
    let base = variants[0];
    if (pd?.res) {
      // PD2 : remplace l'Enfer (porte-clés) ou les trois difficultés (ubers)
      base = { ...base };
      EL.forEach(([k], i) => {
        const cur = base[k] ?? [0, 0, 0];
        base[k] = pd.all ? [pd.res![i], pd.res![i], pd.res![i]] : [cur[0], cur[1], pd.res![i]];
      });
    }
    fields.push(`res: ${fmtRes(base)}`);
    const distinct = new Map(variants.map((v) => [JSON.stringify(v), v]));
    if (distinct.size > 1 && !s.boss)
      fields.push(
        `resVariants: [${[...distinct.values()]
          .map((v) => {
            // une variante remplace toutes les résistances (les éléments absents valent 0)
            const full: Record<string, Tri> = {};
            for (const [k] of EL) full[k] = v[k] ?? [0, 0, 0];
            return fmtRes(full);
          })
          .join(', ')}]`,
      );
    const r = get(s.v[0]);
    const regen = pd?.regen ?? (num(r.DamageRegen) || 0);
    fields.push(`regen: ${regen}`);
    if (pd?.drain !== undefined) fields.push(`drain: ${pd.drain}`);
    if (s.boss) {
      const uMul = s.su ? [4, 3, 2] : [1, 1, 1];
      const hp = [0, 1, 2].map((d) => {
        const b = pd?.uberHp ?? avg(r, 'minHP', 'maxHP', d);
        return r2((b / 95) * uMul[d] * (d === 2 || PD2[id]?.all ? (pd?.hp ?? 1) : 1));
      }) as Tri;
      fields.push(`hpD: [${hp.join(', ')}]`);
      const dm = [0, 1, 2].map((d) => r2((avg(r, 'A1MinD', 'A1MaxD', d) / 77) * (d === 2 ? (pd?.hellDmg ?? 1) : 1))) as Tri;
      if (dm.every((x) => x > 0)) fields.push(`dmgD: [${dm.join(', ')}]`);
      report.push(`${id}: hpD=${hp.join('/')} dmgD=${dm.join('/')} lvl=${[0, 1, 2].map((d) => r['Level' + SFX[d]]).join('/')}`);
    }
    out.push(`  ${id}: { ${fields.join(', ')} },`);
  }

  const umod = new Map(rows('monumod').map((x) => [x.id, x.uniquemod]));
  const su: string[] = [];
  for (const x of rows('superuniques')) {
    if (!x.Superunique || !x.Class) continue;
    const key = x.Superunique.toLowerCase();
    const mods = [x.Mod1, x.Mod2, x.Mod3].map((m) => MOD[umod.get(m) ?? ''] ?? '').filter(Boolean);
    const mon = CLASS[x.Class] ?? '';
    su.push(
      `  '${key.replace(/'/g, "\\'")}': { name: '${x.Name.replace(/'/g, "\\'")}', monster: '${mon}', mods: [${mods.map((m) => `'${m}'`).join(', ')}], grp: [${num(x.MinGrp)}, ${num(x.MaxGrp)}] },`,
    );
  }

  // Blood Raven n'est pas un super-unique (monstats bloodraven, boss de quête) : seule, ses zombies viennent de sa compétence Nest
  su.push(`  'blood raven': { name: 'Blood Raven', monster: 'blood_raven', mods: [], grp: [0, 0] },`);

  writeFileSync(
    join(outDir, 'monsters-fidelity.ts'),
    `${D2_HEADER}/**
 * Fidélité des monstres à Diablo II LoD 1.13c (MonStats.txt, MonUMod.txt, SuperUniques.txt) : résistances et variantes d'immunité,
 * régénération, vie et dégâts des boss par difficulté, super-uniques. Généré par tools/audit/gen-monster-fidelity.ts depuis les MPQ du
 * joueur (\`npm run vanilla -- monsters\`) : ne pas modifier à la main. Valeurs Project Diablo 2 : patch du mod (mods/pd2/data/monsters.patch.ts).
 */
type Tri = [number, number, number];
type Res = Partial<Record<'phys' | 'magic' | 'fire' | 'light' | 'cold' | 'poison', Tri>>;

export interface MonsterFidelity {
  /** variante monstats principale */
  d2: string;
  res: Res;
  resVariants?: Res[];
  /** DamageRegen (PV max × regen / 4096 par image) */
  regen: number;
  /** efficacité du vol de vie / mana sur ce monstre (% ; absente : 100 ; le Drain de MonStats, par difficulté, attend la règle de vol de vie vanilla, lot M8) */
  drain?: number;
  /** boss : multiplicateurs de vie et de dégâts par difficulté (remplacent hp / dmg) */
  hpD?: Tri;
  dmgD?: Tri;
}

export const MONSTER_FIDELITY: Record<string, MonsterFidelity> = {
${out.join('\n')}
};

export interface SuperUniqueDef {
  name: string;
  /** notre espèce ('' : classe sans équivalent) */
  monster: string;
  /** modificateurs fixes (Mod1-3) */
  mods: string[];
  /** sbires [min, max] */
  grp: [number, number];
}

export const SUPER_UNIQUE_DEFS: Record<string, SuperUniqueDef> = {
${su.join('\n')}
};

/** Noms affichés par les zones -> clé de SUPER_UNIQUE_DEFS */
export const SUPER_UNIQUE_ALIAS: Record<string, string> = ${JSON.stringify(ALIAS, null, 2)};
`,
  );
  return { report, su: su.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { report, su } = writeFidelity(OUT);
  if (process.argv.includes('--report')) console.log(report.join('\n'));
  console.log(`monstres : ${Object.keys(SPECS).length}, super-uniques : ${su}`);
}
