/** Description chiffrée d'une compétence : niveau actuel et niveau suivant (chaque point se voit). */
import { RULES } from '../mods/rules';
import { SKILL_BY_ID, lin, manaCost, skillHard, ramp, skillWdmg, synergyPct } from '../data/skills';
import type { DerivedStats } from '../sim/derived';
import type { SorcSkill } from '../data/skills';
import { meleeArBonus, petMax } from '../sim/druid';
import { TREE_CLASS } from '../data/classes';

/** Compétences dont le bloc de lignes ci-dessous donne déjà dégâts d'arme et score d'attaque */
const DESCRIBED = new Set(['split_throw']);

export interface SkillLine {
  label: string;
  now: string;
  next: string;
}

function dmg(id: string, L: number, d: DerivedStats): [number, number] {
  const s = SKILL_BY_ID[id];
  if (!s?.n.min || !s.n.max || L <= 0) return [0, 0];
  const mul = (1 + synergyPct(s, d.hardPoints) / 100) * (1 + (d.elemDmgPct[s.element] ?? 0) / 100);
  return [ramp(s.n.min, L) * mul, ramp(s.n.max, L) * mul];
}

const r0 = (v: number) => Math.round(v).toLocaleString('fr-FR');
const r1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('fr-FR');

/** Contexte d'écriture des lignes d'une compétence : `both` ajoute une ligne « niveau actuel → niveau suivant » */
interface LineCtx {
  id: string;
  s: SorcSkill;
  d: DerivedStats;
  out: SkillLine[];
  both: (label: string, f: (l: number) => string) => void;
  /** Niveau actuel (0 : non apprise) et suivant */
  L: number;
  N: number;
}

/** Noms d'éléments dans « Dégâts de … » */
const ELEM_NAME = { fire: 'feu', cold: 'froid', light: 'foudre', poison: 'poison', magic: 'magiques', phys: 'physiques' };
/** Compétences dont les dégâts s'entendent par seconde */
const PER_SECOND = ['inferno', 'blaze', 'fire_wall', 'arctic_blast'];

/** Lignes chiffrées d'une compétence pour ce personnage : lignes communes, propres à la compétence, puis arme, étourdissement et synergies */
export function skillLines(id: string, d: DerivedStats): SkillLine[] {
  const s = SKILL_BY_ID[id];
  if (!s) return [];
  const L = d.skillLevels[id] ?? 0;
  const N = L + 1;
  const out: SkillLine[] = [];
  const both = (label: string, f: (l: number) => string) => out.push({ label, now: L > 0 ? f(L) : '—', next: f(N) });
  const ctx: LineCtx = { id, s, d, out, both, L, N };
  const pet = s.tree === 'summon' && !!s.n.pet;
  commonLines(ctx, pet);
  const specific = Object.prototype.hasOwnProperty.call(SPECIFIC_LINES, id) ? SPECIFIC_LINES[id] : undefined;
  specific?.(ctx);
  trailingLines(ctx, pet);
  return out;
}

/** Dégâts (deux éléments possibles), mana, rayon, durée, froid, éclairs, temps de recharge */
function commonLines({ id, s, d, out, both }: LineCtx, pet: boolean): void {
  const unit = PER_SECOND.includes(id) ? ' /s' : '';
  const elemName = ELEM_NAME;
  if (s.n.min && s.n.max) {
    const label =
      pet || id === 'raven'
        ? `Dégâts par coup (${elemName[s.element]})`
        : id === 'rabies' || id === 'plague_poppy'
          ? 'Poison (sur la durée)'
          : `Dégâts ${s.element === 'phys' ? 'physiques' : `de ${elemName[s.element]}`}${unit}`;
    both(label, (l) => {
      const [a, b] = dmg(id, l, d);
      return `${r0(a)} – ${r0(b)}`;
    });
  }
  if (s.element2 && s.n.min2 && s.n.max2) {
    const mul = (1 + synergyPct(s, d.hardPoints) / 100) * (1 + (d.elemDmgPct[s.element2] ?? 0) / 100);
    both(`Dégâts ${s.element2 === 'phys' ? 'physiques' : `de ${elemName[s.element2]}`}`, (l) => `${r0(ramp(s.n.min2!, l) * mul)} – ${r0(ramp(s.n.max2!, l) * mul)}`);
  }
  if (!s.passive) both('Coût en mana', (l) => r1(manaCost(s, l)));
  if (s.n.radius) both('Rayon', (l) => `${r1(lin(s.n.radius, l))} m`);
  if (id === 'static_field') both('Rayon', (l) => `${r1(RULES['skills.sorceress']().staticRadius(l, s.n.radius))} m`);
  if (s.n.duration) both('Durée', (l) => `${r1(lin(s.n.duration, l))} s`);
  if (s.n.chill) both(id === 'ice_blast' || id === 'glacial_spike' ? 'Gel' : 'Ralentissement', (l) => `${r1(lin(s.n.chill, l))} s`);
  if (s.n.count && id === 'charged_bolt') both('Éclairs', (l) => String(Math.min(28, Math.floor(lin(s.n.count, l)))));
  if (s.n.cooldown) out.push({ label: 'Temps de recharge', now: `${s.n.cooldown} s`, next: `${s.n.cooldown} s` });
}

/** Nombre de créatures, bonus d'arme et de précision, étourdissement, synergies (points investis dans chaque compétence liée) */
function trailingLines({ id, s, d, out, both, N }: LineCtx, pet: boolean): void {
  if (pet && id !== 'raven' && petMax(id, N) > 1) both('Nombre maximal', (l) => String(petMax(id, l)));
  const druidSkill = TREE_CLASS[s.tree] === 'druid';
  if (!s.passive && s.n.wdmg && !DESCRIBED.has(id)) both("Dégâts de l'arme", (l) => `+${r0(skillWdmg(s, l, d.hardPoints))} %`);
  if (!s.passive && s.n.ar && !druidSkill && !DESCRIBED.has(id)) both("Score d'attaque", (l) => `+${r0(ramp(s.n.ar!, l))} %`);
  if (s.melee && id !== 'shock_wave' && druidSkill) both("Score d'attaque", (l) => `+${r0(s.n.ar ? ramp(s.n.ar, l) : meleeArBonus(l))} %`);
  if (s.n.stun) both('Étourdissement', (l) => `${r1(lin(s.n.stun, l))} s`);
  for (const syn of s.synergies) {
    const pts = d.hardPoints[syn.skill] ?? 0;
    out.push({ label: `Synergie : ${SKILL_BY_ID[syn.skill].name}`, now: `+${r0(syn.pct * pts)} %`, next: `+${syn.pct} %/point` });
  }
}

function linesWarmth({ s, both }: LineCtx): void {
  both('Régénération du mana', (l) => `+${r0(lin(s.n.value, l))} %`);
  both("Score d'attaque", (l) => `+${r0(lin(s.n.value2, l))} %`);
}

function linesFireMastery({ s, both }: LineCtx): void {
  both('Dégâts de feu', (l) => `+${r0(lin(s.n.value, l))} %`);
  both('Pénétration feu', (l) => `-${Math.min(30, l)} %`);
}

function linesColdMastery({ s, both }: LineCtx): void {
  both('Dégâts de froid', (l) => `+${r0(lin(s.n.value, l))} %`);
  both('Pénétration froid', (l) => `-${Math.min(45, 5 + l)} %`);
}

function linesLightningMastery({ s, both }: LineCtx): void {
  both('Dégâts de foudre', (l) => `+${r0(lin(s.n.value, l))} %`);
}

function linesInferno({ both, N }: LineCtx): void {
  const sorc = RULES['skills.sorceress']();
  if (sorc.infernoFireRes(N) > 0) both('Résistance au feu ennemie', (l) => `-${sorc.infernoFireRes(l)} %`);
}

function linesStaticField({ s, both, N }: LineCtx): void {
  const sorc = RULES['skills.sorceress']();
  if (sorc.staticLightRes(N) > 0) both('Résistance à la foudre ennemie', (l) => `-${sorc.staticLightRes(l)} %`);
  else both('PV actuels retirés', (l) => `${r0(lin(s.n.value, l))} %`);
}

function linesShiverArmor({ s, both }: LineCtx): void {
  both('Défense', (l) => `+${r0(lin(s.n.value, l))} %`);
}

function linesEnergyShield({ d, out, both }: LineCtx): void {
  both('Dégâts absorbés', (l) => `${Math.min(90, 15 + 2 * (l - 1))} %`);
  out.push({ label: 'Mana par point de dégât', now: r1(Math.max(34 - (d.hardPoints.energy_shield ?? 0), 14) / 16), next: r1(Math.max(34 - (d.hardPoints.energy_shield ?? 0) - 1, 14) / 16) });
}

function linesChainLightning({ s, both }: LineCtx): void {
  both('Rebonds', (l) => String(Math.min(14, Math.floor(lin(s.n.count, l)))));
}

function linesBlaze({ s, both }: LineCtx): void {
  both('Vitesse de déplacement', (l) => `+${r0(lin(s.n.value, l))} %`);
}

function linesFireArrow({ s, both }: LineCtx): void {
  both('Flèches', (l) => String(Math.max(1, Math.floor(lin(s.n.count, l)))));
}

function linesMagicArrow({ id, d, out }: LineCtx): void {
  out.push({
    label: 'Flèches (points investis)',
    now: String(Math.max(1, skillHard(id, 'Number of Arrows', d.hardPoints[id] ?? 0))),
    next: String(Math.max(1, skillHard(id, 'Number of Arrows', (d.hardPoints[id] ?? 0) + 1))),
  });
}

function linesCombustion({ s, both }: LineCtx): void {
  both('Boules de feu', (l) => String(Math.max(1, Math.floor(lin(s.n.count, l)))));
}

function linesValkyrie({ s, both }: LineCtx): void {
  both('Valkyries', (l) => String(Math.max(1, Math.floor(lin(s.n.count, l)))));
}

// Barbare PD2
function linesBattleOrders({ s, both }: LineCtx): void {
  both('Vie', (l) => `+${r0(lin(s.n.value, l))}`);
  both('Mana', (l) => `+${r0(lin(s.n.value2, l))}`);
}

function linesBattleCommand({ id, s, d, out, both }: LineCtx): void {
  both('Dégâts', (l) => `+${r0(lin(s.n.value, l))} %`);
  out.push({
    label: 'Toutes les compétences (points investis)',
    now: `+${skillHard(id, 'All Skills +', d.hardPoints[id] ?? 0)}`,
    next: `+${skillHard(id, 'All Skills +', (d.hardPoints[id] ?? 0) + 1)}`,
  });
}

function linesBattleCry({ s, both }: LineCtx): void {
  both('Défense ennemie', (l) => `-${r0(lin(s.n.value, l))} %`);
  both('Résistance physique ennemie', (l) => `-${r0(lin(s.n.value2, l))} %`);
}

function linesShout({ s, both }: LineCtx): void {
  both('Défense', (l) => `+${r0(lin(s.n.value, l))} %`);
}

function linesTaunt({ s, both }: LineCtx): void {
  both('Dégâts et précision ennemis', (l) => `-${r0(lin(s.n.value, l))} %`);
}

function linesGrimWard({ s, both }: LineCtx): void {
  both('Dégâts (aura du fétiche)', (l) => `+${r0(lin(s.n.value, l))} %`);
  both("Score d'attaque (aura du fétiche)", (l) => `+${r0(lin(s.n.value2, l))}`);
}

function linesFrenzy({ id, s, d, out, both }: LineCtx): void {
  both('Charges', () => '5');
  both("Vitesse d'attaque (5 charges)", (l) => `+${r0(lin(s.n.v3, l))} %`);
  both('Vitesse de déplacement (5 charges)', (l) => `+${r0(lin(s.n.v4, l))} %`);
  out.push({ label: 'Durée (points investis)', now: `${skillHard(id, 'Duration (seconds)', d.hardPoints[id] ?? 0)} s`, next: `${skillHard(id, 'Duration (seconds)', (d.hardPoints[id] ?? 0) + 1)} s` });
}

function linesBerserk({ s, d, both }: LineCtx): void {
  both("Dégâts de l'arme", (l) => `+${r0(lin(s.n.v3, l) + synergyPct(s, d.hardPoints))} %`);
  both('Résistance physique ennemie percée', (l) => `-${r0(lin(s.n.value, l))} %`);
}

function linesConcentrate({ id, s, d, out, both }: LineCtx): void {
  both('Défense', (l) => `+${r0(lin(s.n.value, l))} %`);
  out.push({
    label: 'Physique converti en magique',
    now: `${skillHard(id, 'Physical Damage Converted to Magic %', d.hardPoints[id] ?? 0)} %`,
    next: `${skillHard(id, 'Physical Damage Converted to Magic %', (d.hardPoints[id] ?? 0) + 1)} %`,
  });
}

function linesDoubleThrow({ s, both }: LineCtx): void {
  both('Rebonds', (l) => String(Math.floor(lin(s.n.count, l))));
}

function linesTeleport({ both }: LineCtx): void {
  both('Malus de dégâts après le saut', (l) => `-${Math.max(0, 50 - (l - 1))} % (1 s)`);
}

// Druide
function linesWerewolf({ s, both }: LineCtx): void {
  both('Dégâts', (l) => `+${r0(lin(s.n.value, l))} %`);
  both("Vitesse d'attaque", (l) => `+${r0(lin(s.n.value2, l))} %`);
}

function linesWerebear({ s, out, both }: LineCtx): void {
  both('Dégâts', (l) => `+${r0(lin(s.n.value, l))} %`);
  both('Défense', (l) => `+${r0(lin(s.n.value2, l))} %`);
  out.push({ label: 'Vie', now: '+10 %', next: '+10 %' });
}

function linesShapeShifting({ s, both }: LineCtx): void {
  both('Vie sous forme animale', (l) => `+${r0(lin(s.n.value, l))} %`);
  both("Score d'attaque sous forme animale", (l) => `+${r0(lin(s.n.value2, l))} %`);
}

function linesFeralRage({ s, both }: LineCtx): void {
  both('Dégâts', (l) => `+${r0(lin(s.n.value, l))} %`);
  both('Vol de vie par charge', (l) => `${r0(lin(s.n.value2, l))} %`);
  both('Charges', (l) => String(Math.floor(lin(s.n.count, l))));
}

function linesMaul({ s, both }: LineCtx): void {
  both('Dégâts par charge', (l) => `+${r0(lin(s.n.value, l))} %`);
  both('Charges', (l) => String(Math.floor(lin(s.n.count, l))));
}

function linesFury({ s, both }: LineCtx): void {
  both('Dégâts', (l) => `+${r0(lin(s.n.value, l))} %`);
  both('Coups', (l) => String(Math.floor(lin(s.n.count, l))));
}

function linesHunger({ id, s, d, out, both }: LineCtx): void {
  both('Chance de blessure ouverte', (l) => `${r0(lin(s.n.value, l))} %`);
  both('Vitesse de déplacement', (l) => `+${r0(lin(s.n.value2, l))} %`);
  out.push({ label: 'Vol de vie (points investis)', now: `${skillHard(id, 'Life Steal +%', d.hardPoints[id] ?? 0)} %`, next: `${skillHard(id, 'Life Steal +%', (d.hardPoints[id] ?? 0) + 1)} %` });
}

function linesCycloneArmor({ s, d, both }: LineCtx): void {
  both('Dégâts élémentaires absorbés', (l) => r0(lin(s.n.value, l) + 3 * d.ene + synergyPct(s, d.hardPoints, 'other')));
}

function linesRaven({ s, both }: LineCtx): void {
  both('Corbeaux', (l) => String(petMax('raven', l)));
  both('Coups par corbeau', (l) => String(Math.floor(lin(s.n.value, l))));
}

function linesOakSage({ s, both }: LineCtx): void {
  both('Vie maximale', (l) => `+${r0(lin(s.n.value, l))}`);
}

function linesHeartWolverine({ s, both }: LineCtx): void {
  both('Dégâts (Druide et créatures)', (l) => `+${r0(lin(s.n.value, l))} %`);
  both("Score d'attaque", (l) => `+${r0(lin(s.n.value2, l))} %`);
}

function linesSpiritBarbs({ s, both }: LineCtx): void {
  both('Dégâts renvoyés aux attaquants', (l) => r0(lin(s.n.value, l)));
}

function linesCycleOfLife({ s, both }: LineCtx): void {
  both('Vie rendue par cadavre', (l) => `${r0(lin(s.n.value, l))} %`);
}

function linesVines({ s, both }: LineCtx): void {
  both('Mana rendu par cadavre', (l) => `${r0(lin(s.n.value, l))} %`);
}

// Classes D2 : maîtrises et passifs (mêmes formules que sim/character.ts et sim/melee.ts)
function linesOneHandMastery({ id, s, both }: LineCtx): void {
  if (s.n.wdmg) both("Dégâts de l'arme", (l) => `+${r0(ramp(s.n.wdmg!, l))} %`);
  if (s.n.ar) both("Score d'attaque", (l) => `+${r0(ramp(s.n.ar!, l))} %`);
  if (s.n.value && id === 'javelin_mastery') both('Multiplicateur de coup critique', (l) => `+${r0(lin(s.n.value, l))} %`);
  else if (s.n.value) both(id === 'two_hand_mastery' ? 'Coup dévastateur' : 'Coup critique', (l) => `${r0(lin(s.n.value, l))} %`);
}

function linesMultipleShot({ s, both }: LineCtx): void {
  both('Flèches', (l) => String(Math.floor(lin(s.n.count, l))));
}

function linesZeal({ out }: LineCtx): void {
  out.push({ label: 'Coups', now: '3', next: '3' });
}

function linesLightningFury({ s, both }: LineCtx): void {
  both('Éclairs secondaires', (l) => String(Math.floor(lin(s.n.count, l))));
}

function linesCriticalStrike({ s, both }: LineCtx): void {
  both('Coup critique', (l) => `${r0(lin(s.n.value, l))} %`);
}

function linesPenetrate({ s, both }: LineCtx): void {
  both("Score d'attaque", (l) => `+${r0(lin(s.n.value, l))} %`);
}

function linesDodge({ id, s, both }: LineCtx): void {
  both(id === 'dodge' ? 'Esquive (mêlée)' : 'Esquive', (l) => `${r0(lin(s.n.value, l))} %`);
  if (id === 'dodge') both('Récupération après un coup', (l) => `+${r0(lin(s.n.value2, l))} %`);
  else both('Vitesse de marche et de course', (l) => `+${r0(lin(s.n.value2, l))} %`);
}

function linesWeaponBlock({ s, both }: LineCtx): void {
  both("Parade avec l'arme", (l) => `${r0(lin(s.n.value, l))} %`);
}

function linesCombatReflexes({ id, s, d, out, both }: LineCtx): void {
  out.push({
    label: 'Récupération après un coup (points investis)',
    now: `+${skillHard(id, 'Faster Hit Recovery +%', d.hardPoints[id] ?? 0)} %`,
    next: `+${skillHard(id, 'Faster Hit Recovery +%', (d.hardPoints[id] ?? 0) + 1)} %`,
  });
  both('Vie', (l) => `+${r0(lin(s.n.value2, l))}`);
}

function linesIronSkin({ id, s, d, out, both }: LineCtx): void {
  both('Défense', (l) => `+${r0(lin(s.n.value, l))} %`);
  out.push({
    label: 'Réduction des dégâts physiques (points investis)',
    now: `${skillHard(id, 'Physical Damage Reduction %', d.hardPoints[id] ?? 0)} %`,
    next: `${skillHard(id, 'Physical Damage Reduction %', (d.hardPoints[id] ?? 0) + 1)} %`,
  });
}

function linesNaturalResistance({ s, both }: LineCtx): void {
  both('Résistance au feu, froid, foudre et poison', (l) => `+${r0(lin(s.n.value, l))} %`);
}

function linesIncreasedSpeed({ id, s, d, out, both }: LineCtx): void {
  both('Vitesse de déplacement', (l) => `+${r0(lin(s.n.value, l))} %`);
  out.push({
    label: "Vitesse d'attaque (points investis)",
    now: `+${skillHard(id, 'Increased Attack Speed +%', d.hardPoints[id] ?? 0)} %`,
    next: `+${skillHard(id, 'Increased Attack Speed +%', (d.hardPoints[id] ?? 0) + 1)} %`,
  });
}

function linesDeepWounds({ s, both }: LineCtx): void {
  both('Chance de blessure ouverte', (l) => `${r0(lin(s.n.value, l))} %`);
}

function linesSplitThrow({ s, both }: LineCtx): void {
  both('Projectiles', (l) => String(Math.max(2, Math.round(lin(s.n.count, l)))));
  both("Dégâts de l'arme", (l) => `+${r0(ramp(s.n.wdmg!, l))} %`);
  both("Score d'attaque", (l) => `+${r0(ramp(s.n.ar!, l))} %`);
}

function linesMight({ id, s, both }: LineCtx): void {
  both('Dégâts (Paladin)', (l) => `+${r0(lin(s.n.value, l))} %`);
  both('Dégâts (alliés)', (l) => `+${r0(lin(s.n.value2, l))} %`);
  if (id === 'fanaticism') both("Vitesse d'attaque (aura)", (l) => `+${r0(lin(s.n.v3, l))} %`);
  if (id === 'concentration') both('Marteau béni', (l) => `+${r0(lin(s.n.v3, l))} %`);
}

function linesBlessedAim({ s, both }: LineCtx): void {
  both("Score d'attaque (aura)", (l) => `+${r0(lin(s.n.value, l))} %`);
}

function linesDefiance({ s, both }: LineCtx): void {
  both('Défense (aura)', (l) => `+${r0(lin(s.n.value, l))} %`);
}

function linesVigor({ s, both }: LineCtx): void {
  both('Vitesse de déplacement (aura)', (l) => `+${r0(lin(s.n.value, l))} %`);
}

function linesHolySword({ s, both }: LineCtx): void {
  both("Parade avec l'arme", (l) => `${r0(lin(s.n.value, l))} %`);
  both('Dégâts aux morts-vivants et démons', (l) => `+${r0(lin(s.n.value2, l))} %`);
}

function linesCurseMastery({ id, d, out, both }: LineCtx): void {
  out.push({
    label: 'Malédictions par monstre (points investis)',
    now: String(Math.max(1, skillHard(id, 'Maximum Curses', d.hardPoints[id] ?? 0))),
    next: String(Math.max(1, skillHard(id, 'Maximum Curses', (d.hardPoints[id] ?? 0) + 1))),
  });
  both('Rayon des malédictions', (l) => `+${r1(0.66 * Math.floor(l / 3))} m`);
  both('Réductions des malédictions (bonus)', (l) => `-${Math.floor(l / 2)} %`);
}

function linesGolemMastery({ id, d, out }: LineCtx): void {
  out.push({
    label: 'Golems (points investis)',
    now: String(Math.max(1, skillHard(id, 'Number of Golems', d.hardPoints[id] ?? 0))),
    next: String(Math.max(1, skillHard(id, 'Number of Golems', (d.hardPoints[id] ?? 0) + 1))),
  });
}

function linesBloodWarp({ s, both }: LineCtx): void {
  both('Vie sacrifiée', (l) => `${r0(lin(s.n.value, l))} %`);
}

function linesIceBarrage({ d, out }: LineCtx): void {
  out.push({
    label: 'Lances',
    now: String(3 + Math.min(Math.floor((d.hardPoints.ice_barrage ?? 0) / 3), 2)),
    next: String(3 + Math.min(Math.floor(((d.hardPoints.ice_barrage ?? 0) + 1) / 3), 2)),
  });
}

/** Lignes propres à certaines compétences (après les lignes communes : dégâts, mana, rayon, durée…) */
const SPECIFIC_LINES: Record<string, (c: LineCtx) => void> = {
  warmth: linesWarmth,
  fire_mastery: linesFireMastery,
  cold_mastery: linesColdMastery,
  lightning_mastery: linesLightningMastery,
  inferno: linesInferno,
  frozen_armor: linesShiverArmor,
  static_field: linesStaticField,
  shiver_armor: linesShiverArmor,
  chilling_armor: linesShiverArmor,
  energy_shield: linesEnergyShield,
  chain_lightning: linesChainLightning,
  blaze: linesBlaze,
  fire_arrow: linesFireArrow,
  cold_arrow: linesFireArrow,
  magic_arrow: linesMagicArrow,
  combustion: linesCombustion,
  valkyrie: linesValkyrie,
  battle_orders: linesBattleOrders,
  battle_command: linesBattleCommand,
  battle_cry: linesBattleCry,
  shout: linesShout,
  taunt: linesTaunt,
  grim_ward: linesGrimWard,
  frenzy: linesFrenzy,
  berserk: linesBerserk,
  concentrate: linesConcentrate,
  double_throw: linesDoubleThrow,
  teleport: linesTeleport,
  werewolf: linesWerewolf,
  werebear: linesWerebear,
  shape_shifting: linesShapeShifting,
  feral_rage: linesFeralRage,
  maul: linesMaul,
  fury: linesFury,
  hunger: linesHunger,
  cyclone_armor: linesCycloneArmor,
  raven: linesRaven,
  oak_sage: linesOakSage,
  heart_wolverine: linesHeartWolverine,
  spirit_barbs: linesSpiritBarbs,
  cycle_of_life: linesCycleOfLife,
  vines: linesVines,
  one_hand_mastery: linesOneHandMastery,
  two_hand_mastery: linesOneHandMastery,
  throwing_mastery: linesOneHandMastery,
  javelin_mastery: linesOneHandMastery,
  claw_mastery: linesOneHandMastery,
  multiple_shot: linesMultipleShot,
  strafe: linesMultipleShot,
  zeal: linesZeal,
  lightning_fury: linesLightningFury,
  critical_strike: linesCriticalStrike,
  penetrate: linesPenetrate,
  dodge: linesDodge,
  evade: linesDodge,
  weapon_block: linesWeaponBlock,
  combat_reflexes: linesCombatReflexes,
  iron_skin: linesIronSkin,
  natural_resistance: linesNaturalResistance,
  increased_speed: linesIncreasedSpeed,
  deep_wounds: linesDeepWounds,
  split_throw: linesSplitThrow,
  might: linesMight,
  concentration: linesMight,
  fanaticism: linesMight,
  blessed_aim: linesBlessedAim,
  defiance: linesDefiance,
  vigor: linesVigor,
  holy_sword: linesHolySword,
  curse_mastery: linesCurseMastery,
  golem_mastery: linesGolemMastery,
  blood_warp: linesBloodWarp,
  ice_barrage: linesIceBarrage,
};
