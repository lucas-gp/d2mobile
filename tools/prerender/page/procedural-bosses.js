/**
 * Boss de farm PD2 procéduraux : la Comtesse (et ses Traqueurs sombres, Acte I), Andariel (Acte I) et
 * Méphisto (Acte III). Chaque fiche suit l'image D2 correspondante (ASSETS.md § 0, docs/internal/DIRECTION-ARTISTIQUE.md § 13) :
 * la Comtesse est une rôdeuse corrompue en armure vert sombre, Andariel une démone cuivrée aux cheveux
 * rouges dressés et aux bras arachnéens griffus, Méphisto un spectre pâle cornu flottant dans un
 * linceul de fumée. Socle : proc-kit.js. Repère : regarde vers +Z, Y en haut.
 */
import * as THREE from 'three';
import { mat, blob, taper, spike, box, limb, horn, joint, biped, humanoidBody, hold, sword, bow } from './proc-kit.js';
import { HP, finish } from './procedural-crowd.js';

/** Comtesse / Traqueur sombre : rôdeuse corrompue, cuir et plaques vert sombre, épée courbe dans le dos */
function buildCountess() {
  const P = HP({ torsoW: 0.64, torsoD: 0.4, armR: 0.1, legR: 0.13, headR: 0.2, hunch: 0.1 });
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0x8fa088);
  const green = mat('green', 0x2c5c36);
  const green2 = mat('green2', 0x18321f);
  const plate = mat('plate', 0x3a6a44, { metalness: 0.35, roughness: 0.55 });
  const bone = mat('bone', 0xc8c2a0);
  humanoidBody(b, P, { skin, skin2: skin, cloth: green, boot: green2 });
  const hr = P.headR;
  // capuchon-capuche vert et cornes d'os, yeux luisants
  J.head.add(blob(green2, hr * 1.16, hr * 0.9, hr * 1.18, 0, hr * 1.15, -hr * 0.08, 1));
  J.head.add(box(mat('eye', 0xd8e860), hr * 0.9, hr * 0.14, hr * 0.12, 0, hr * 0.98, hr * 1.02));
  for (const s of [1, -1]) J.head.add(spike(bone, hr * 1.5, hr * 0.14, s * hr * 0.85, hr * 1.6, -hr * 0.1, 0.1, 0, -s * 0.75));
  // plastron, ceinture, jupe de lanières
  J.chest.add(box(plate, P.torsoW * 0.62, 0.28, P.torsoD * 1.06, 0, 0.14, 0.02));
  J.hips.add(box(green2, P.torsoW * 0.95, 0.4, P.torsoD * 0.95, 0, -0.22, 0));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(blob(plate, 0.17, 0.11, 0.17, 0, 0.06, 0, 1));
    J[`shoulder${side}`].add(spike(bone, 0.3, 0.05, s * 0.08, 0.1, 0, 0, 0, -s * 0.7));
    J[`elbow${side}`].add(box(plate, 0.12, 0.2, 0.12, 0, -0.26, 0));
    J[`knee${side}`].add(box(plate, 0.15, 0.3, 0.15, 0, -0.32, 0));
  }
  // cape déchirée dans le dos, arc corrompu à la main gauche, lame courbe à la droite
  J.chest.add(box(green2, P.torsoW * 0.85, 0.95, 0.05, 0, -0.35, -P.torsoD * 0.58));
  hold(J, 'handL', bow(mat('wood', 0x2a2a20), mat('cord', 0xb0b890), 1.45), 0, 0, 0, 0, 0.1);
  hold(J, 'handR', sword(mat('blade', 0x9aa89c, { metalness: 0.6, roughness: 0.4 }), mat('grip', 0x1e2a1e), 0.9, 0.11), -0.4, 0, 0, -0.1, 0.05);
  return finish(b, P, 'countessRoot');
}

/** Andariel : démone cuivrée, crinière de pointes rouges, quatre bras arachnéens griffus */
function buildAndariel() {
  const P = HP({ torsoW: 0.6, torsoD: 0.38, torsoH: 1.02, armR: 0.085, legR: 0.1, headR: 0.2, hunch: 0.14, legUp: 0.85, legLow: 0.85, stance: 0.24, armSplay: 0.55 });
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0xc98d58);
  const skin2 = mat('skin2', 0xa8683c);
  const red = mat('hair', 0xa8221a);
  const dark = mat('claw', 0x2c2420);
  const bone = mat('bone', 0xd8c8a0);
  humanoidBody(b, P, { skin, skin2, cloth: skin, boot: dark });
  const hr = P.headR;
  // yeux jaunes, pommettes, oreilles pointues
  J.head.add(box(mat('eye', 0xffd84a), hr * 0.9, hr * 0.14, hr * 0.12, 0, hr * 1.0, hr * 1.02));
  for (const s of [1, -1]) J.head.add(spike(skin2, hr * 0.9, hr * 0.12, s * hr * 1.0, hr * 1.0, 0, 0, 0, -s * 1.3));
  // crinière rouge : éventail de pointes redressées vers l'arrière
  for (let i = 0; i < 13; i++) {
    const a = (i / 12 - 0.5) * 2.0;
    J.head.add(spike(red, hr * (3.8 - Math.abs(i / 12 - 0.5) * 2.2), hr * 0.17, Math.sin(a) * hr * 0.75, hr * 1.55, -hr * 0.15, -0.25, 0, -a * 0.75, 5));
  }
  J.head.add(box(red, hr * 0.9, hr * 1.1, hr * 0.3, 0, hr * 0.6, -hr * 0.85));
  // pagne étroit, poitrine nue à peau cuivrée, ossements aux hanches
  J.hips.add(box(dark, P.torsoW * 0.7, 0.3, P.torsoD * 0.7, 0, -0.18, 0));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`hand${side}`].add(spike(dark, 0.32, 0.03, 0, -0.1, 0.02, Math.PI * 0.95, 0, 0));
    J[`hand${side}`].add(spike(dark, 0.28, 0.03, 0.04 * s, -0.08, 0.02, Math.PI * 0.9, 0, -s * 0.2));
    J[`knee${side}`].add(spike(bone, 0.22, 0.04, 0, -0.1, 0.1, -0.9, 0, 0));
    // deux bras arachnéens de plus, sortant des flancs de la cage thoracique (griffes noires)
    for (let k = 0; k < 2; k++) {
      const j0 = joint(`xarm${side}${k}`, J.chest, s * 0.28, 0.3 - k * 0.32, -0.08);
      j0.rotation.set(-0.5 + k * 0.5, 0, -s * (1.0 + k * 0.35));
      j0.add(limb(skin2, 0.75, 0.06, 0.04, 6));
      const j1 = joint(`xfore${side}${k}`, j0, 0, -0.75, 0);
      j1.rotation.set(-0.3, 0, s * (0.8 - k * 0.15));
      j1.add(blob(skin2, 0.06, 0.06, 0.06, 0, 0, 0, 0));
      j1.add(limb(skin2, 0.7, 0.045, 0.02, 6));
      j1.add(spike(dark, 0.36, 0.04, 0, -0.72, 0, Math.PI * 0.94, 0, 0));
      j1.add(spike(dark, 0.3, 0.03, 0.04, -0.7, 0, Math.PI * 0.88, 0, -0.25));
    }
  }
  // dos : épines dorsales
  for (let i = 0; i < 4; i++) J.chest.add(spike(bone, 0.24 - i * 0.03, 0.03, 0, 0.34 - i * 0.16, -P.torsoD * 0.5, -0.9, 0, 0));
  return finish(b, P, 'andarielRoot');
}

/** Méphisto : spectre pâle cornu, bras levés et griffus, buste d'os apparent, bas du corps en fumée */
function buildMephisto() {
  const P = HP({ torsoW: 0.66, torsoD: 0.4, torsoH: 1.0, armR: 0.09, legR: 0.09, headR: 0.22, hunch: 0.06, legUp: 0.8, legLow: 0.8, armUp: 0.85, armLow: 0.9, stance: 0.18, armSplay: 2.05 });
  const b = biped(P);
  const { J } = b;
  const smoke = mat('smoke', 0xd8d4cc);
  const smoke2 = mat('smoke2', 0xa8a49c);
  const flesh = mat('flesh', 0xb88868);
  const bone = mat('bone', 0xe8dcc0);
  const dark = mat('dark', 0x3a2c28);
  // jambes masquées par un linceul de fumée conique jusqu'au sol, plus large en bas
  J.hips.add(taper(smoke, 0.5, 0.26, P.legUp + P.legLow + 0.4, 9, 0, -(P.legUp + P.legLow) + 0.05, 0));
  // volutes de fumée qui s'évasent en bas : longues mèches autour du linceul
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 0.22 + (i % 3) * 0.06;
    J.hips.add(spike(i % 2 ? smoke : smoke2, 1.5 - (i % 3) * 0.35, 0.13, Math.cos(a) * r, -(P.legUp + P.legLow) + 0.1, Math.sin(a) * r, 0.5 * Math.sin(a), 0, -0.5 * Math.cos(a), 5));
  }
  // buste : peau pâle, côtes apparentes
  J.spine.add(blob(flesh, P.torsoW * 0.4, P.torsoH * 0.32, P.torsoD * 0.5, 0, P.torsoH * 0.2, 0, 1));
  J.chest.add(blob(flesh, P.torsoW * 0.5, P.torsoH * 0.34, P.torsoD * 0.56, 0, P.torsoH * 0.1, 0, 1));
  for (let i = 0; i < 4; i++) J.chest.add(box(bone, P.torsoW * (0.85 - i * 0.08), 0.045, 0.05, 0, P.torsoH * 0.28 - i * 0.15, P.torsoD * 0.5));
  J.neck.add(taper(flesh, P.headR * 0.45, P.headR * 0.4, 0.16, 6, 0, -0.02, 0));
  // tête : crâne allongé, mâchoire, yeux jaunes, cornes (crête de cinq cornes recourbées)
  const hr = P.headR;
  J.head.add(blob(flesh, hr * 0.95, hr * 1.25, hr * 0.95, 0, hr * 0.95, 0, 1));
  J.head.add(blob(dark, hr * 0.5, hr * 0.5, hr * 0.5, 0, hr * 0.35, hr * 0.5, 0));
  J.head.add(box(mat('eye', 0xffd840), hr * 0.8, hr * 0.12, hr * 0.1, 0, hr * 1.1, hr * 0.85));
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 1.6;
    const h = horn(bone, 4, hr * (2.1 - Math.abs(i / 4 - 0.5) * 1.1), hr * 0.16, -0.25, 0, -a * 0.3, 5);
    h.position.set(Math.sin(a) * hr * 0.75, hr * 1.85, -hr * 0.05);
    h.rotation.set(-0.15, 0, -a * 0.75);
    J.head.add(h);
  }
  // épaules à pointes, bras minces et longs aux mains griffues, levés en V
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(spike(bone, 0.5, 0.05, s * 0.06, 0.1, 0, 0, 0, -s * 0.9));
    J[`shoulder${side}`].add(blob(smoke2, 0.16, 0.12, 0.16, 0, 0.02, 0, 1));
    J[`elbow${side}`].add(spike(bone, 0.36, 0.045, s * 0.04, -0.02, -0.05, 0, 0, -s * 1.4));
    J[`shoulder${side}`].add(limb(flesh, P.armUp, P.armR * 1.05, P.armR * 0.85, 6));
    J[`elbow${side}`].add(limb(flesh, P.armLow, P.armR * 0.85, P.armR * 0.55, 6));
    for (let k = 0; k < 4; k++) J[`hand${side}`].add(spike(bone, 0.38 - Math.abs(k - 1.5) * 0.04, 0.025, (k - 1.5) * 0.045, -0.06, 0.02, Math.PI * (0.92 + k * 0.02), 0, (k - 1.5) * 0.2));
  }
  // volutes de fumée derrière les épaules
  for (const s of [1, -1]) for (let i = 0; i < 3; i++) J.chest.add(spike(smoke, 1.0 - i * 0.2, 0.14, s * (0.3 + i * 0.12), 0.1, -0.2, -1.1, 0, -s * (0.5 + i * 0.3), 5));
  return finish(b, P, 'mephistoRoot');
}

export const BOSSES = {
  countess: buildCountess,
  andariel: buildAndariel,
  mephisto: buildMephisto,
};

void THREE;
