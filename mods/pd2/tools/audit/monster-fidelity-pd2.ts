// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Provenance du patch PD2 de la fidélité des monstres (mods/pd2/data/monsters.patch.ts, généré par diff : mods/pd2/tools/vanilla-diff.ts) :
 * la table du wiki PD2 (page Monsters) ci-dessous, appliquée par le générateur de la base (tools/audit/gen-monster-fidelity.ts,
 * `writeFidelity`) aux tables de Diablo II des MPQ du joueur, redonne exactement la fidélité du jeu de règles `pd2` (base + patch).
 * Autrefois dans le générateur de la base (tables PD2 et PD2_UBER_HP, multiplicateur des dégâts d'Andariel en Enfer).
 *
 *   npx tsx mods/pd2/tools/audit/monster-fidelity-pd2.ts     contrôle (code de sortie 1 en cas d'écart ; sans MPQ : rien à contrôler)
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { IN_DIR } from '../../../../tools/audit/common';
import type { Pd2Fidelity } from '../../../../tools/audit/gen-monster-fidelity';

/**
 * PD2 (wiki, page Monsters) : résistances phys/magie/feu/foudre/froid/poison en Enfer (porte-clés) ou partout (ubers), vie ×, Drain ;
 * vie des ubers d'après leur fiche (Base-HP), pas les colonnes 1.13 ; Andariel : +23 % de vie et +10 % de dégâts en Enfer.
 */
export const PD2_MONSTERS: Record<string, Pd2Fidelity> = {
  countess: { res: [20, 20, 108, 33, 130, 20], hp: 3, drain: 100 },
  blood_raven: { res: [50, 50, 50, 50, 50, 50], hp: 2, drain: 75 },
  summoner: { res: [0, 0, 75, 75, 75, 0], hp: 8, drain: 50 },
  nihlathak: { res: [0, 25, 33, 33, 70, 70], hp: 3, drain: 100 },
  izual: { res: [30, 30, 30, 30, 75, 30], drain: 50 },
  andariel: { hp: 1.23, hellDmg: 1.1 },
  // ubers (S5+) : mêmes valeurs aux trois difficultés ; ceux de Tristram ne régénèrent pas
  lilith: { res: [50, 50, 90, 90, 90, 90], all: true, drain: 33, regen: 4, uberHp: 6600 },
  uber_duriel: { res: [50, 50, 90, 90, 90, 95], all: true, drain: 100, regen: 4, uberHp: 6600 },
  uber_izual: { res: [50, 50, 90, 90, 90, 95], all: true, drain: 50, regen: 4, uberHp: 6600 },
  uber_mephisto: { res: [40, 40, 60, 60, 60, 60], all: true, drain: 0, hp: 1.1, regen: 0, uberHp: 5695 },
  uber_diablo: { res: [40, 40, 60, 60, 60, 60], all: true, drain: 15, hp: 1.1, regen: 0, uberHp: 6427 },
  uber_baal: { res: [40, 40, 60, 60, 60, 60], all: true, drain: 20, hp: 1.1, regen: 0, uberHp: 6336 },
  dclone: { res: [30, 30, 30, 30, 30, 30], all: true, drain: 5, uberHp: 10530 },
};

/** Contrôle : vrai si la fidélité du jeu pd2 actif est celle que donne la table */
async function check(): Promise<boolean> {
  const { writeFidelity } = await import('../../../../tools/audit/gen-monster-fidelity');
  const tmp = mkdtempSync(join(process.env.FP_TMP ?? tmpdir(), 'mf-pd2-'));
  try {
    writeFidelity(tmp, PD2_MONSTERS);
    const want = (await import(pathToFileURL(join(tmp, 'monsters-fidelity.ts')).href)).MONSTER_FIDELITY as Record<string, unknown>;
    const { activateForTools } = await import('../../../../tools/mods/node');
    await activateForTools('pd2');
    const { MONSTER_FIDELITY } = await import('../../../../src/data/monsters-fidelity');
    const have = MONSTER_FIDELITY as Record<string, unknown>;
    const ids = [...new Set([...Object.keys(want), ...Object.keys(have)])];
    const bad = ids.filter((id) => JSON.stringify(want[id]) !== JSON.stringify(have[id]));
    for (const id of bad.slice(0, 10)) console.log(`${id}\n  table PD2 : ${JSON.stringify(want[id])}\n  jeu pd2   : ${JSON.stringify(have[id])}`);
    if (JSON.stringify(Object.keys(want)) !== JSON.stringify(Object.keys(have))) console.log('ordre des monstres différent');
    console.log(bad.length ? `${bad.length} monstre(s) différent(s)` : `fidélité pd2 identique à la table du wiki PD2 appliquée aux MPQ (${ids.length} monstres)`);
    return bad.length === 0;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (!existsSync(join(IN_DIR, 'd2data.mpq'))) console.log(`MPQ absents (${IN_DIR}) : rien à contrôler`);
  else if (!(await check())) process.exit(1);
}
