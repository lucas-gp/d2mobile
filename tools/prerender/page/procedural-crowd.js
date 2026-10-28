/**
 * Créatures procédurales courantes : démons (Déchus, Seigneur venimeux…), morts-vivants,
 * bovins, mercenaires et PNJ. Chaque fiche suit l'image D2 correspondante (ASSETS.md § 0,
 * docs/internal/DIRECTION-ARTISTIQUE.md § 13). Socle : proc-kit.js. Repère : regarde vers +Z, Y en haut.
 */
import * as THREE from 'three';
import { TAU, mat, blob, taper, spike, limb, box, horn, joint, applyRest, makeClip, smooth, biped, bipedClips, humanoidBody, hold, sword, axe, spear, staff, bow, shield, wing } from './proc-kit.js';

export const P0 = (o) => ({ legUp: 0.8, legLow: 0.8, torsoH: 1.0, torsoW: 0.8, torsoD: 0.5, armUp: 0.6, armLow: 0.62, armR: 0.12, legR: 0.14, headR: 0.24, hunch: 0.15, stance: 0.3, ...o });

export function finish(b, P, name) {
  b.root.name = name;
  return { root: b.root, clips: bipedClips(b, P) };
}

/** Yeux brillants (deux petites boîtes claires) sur la tête */
function eyes(J, m, hr, y = 0.95, z = 0.9, sep = 0.42, size = 0.3) {
  for (const s of [1, -1]) J.head.add(box(m, hr * size, hr * size * 0.55, hr * 0.2, s * hr * sep, hr * y, hr * z));
}

/** Éventail de pointes sur le crâne */
function crest(J, m, hr, n, len, spread = 1.6) {
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1) - 0.5) * spread;
    J.head.add(spike(m, len * (1 - Math.abs(i / (n - 1) - 0.5) * 0.7), hr * 0.16, Math.sin(a) * hr * 0.7, hr * 1.85, -hr * 0.1, -0.35, 0, -a * 0.8));
  }
}

/* ------------------------------------------------------------------ */
/* Démons                                                               */
/* ------------------------------------------------------------------ */

/** Déchu (D2) : petit diable rouge vif, crâne à crête de pointes, épée */
function fallenBase(P, robe) {
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0xd6281a);
  const skin2 = mat('skin2', 0x8a1a10);
  const cloth = mat('cloth', robe ? 0x5a1c2c : 0x5a2c1a);
  const eye = mat('eye', 0xffe060);
  const horn0 = mat('horn', 0xe6dcc0);
  humanoidBody(b, P, { skin, skin2, cloth: skin, boot: skin2 }, { head: 1.15 });
  const hr = P.headR * 1.15;
  J.hips.add(box(cloth, P.torsoW * 0.9, 0.4, P.torsoD * 0.9, 0, -0.18, 0));
  if (robe) J.hips.add(taper(cloth, P.torsoW * 0.6, P.torsoW * 0.36, 0.9, 6, 0, -0.85, 0));
  eyes(J, eye, hr);
  crest(J, horn0, hr, 5, 0.5, 1.7);
  for (const s of [1, -1]) {
    const h = horn(horn0, 3, 0.55, 0.05, -0.3, 0, s * 0.2);
    h.position.set(s * hr * 0.6, hr * 1.5, hr * 0.1);
    h.rotation.set(-0.2, 0, -s * 0.9);
    J.head.add(h);
    J.head.add(spike(skin2, 0.28, 0.05, s * hr * 0.95, hr * 0.85, 0, 0, 0, -s * 1.4));
  }
  return { b, J, skin2, cloth, horn0 };
}

function buildFallen() {
  const P = P0({ legUp: 0.42, legLow: 0.42, torsoH: 0.62, torsoW: 0.56, torsoD: 0.36, armUp: 0.48, armLow: 0.5, armR: 0.085, legR: 0.1, headR: 0.24, hunch: 0.5, stance: 0.32 });
  const { b, J } = fallenBase(P, false);
  hold(J, 'handR', sword(mat('steel', 0x8a8e98, { metalness: 0.4 }), mat('grip', 0x4a3020), 0.75, 0.09));
  return finish(b, P, 'fallenRoot');
}

function buildFallenShaman() {
  const P = P0({ legUp: 0.42, legLow: 0.42, torsoH: 0.66, torsoW: 0.56, torsoD: 0.36, armUp: 0.5, armLow: 0.52, armR: 0.085, legR: 0.1, headR: 0.25, hunch: 0.42, stance: 0.32 });
  const { b, J, horn0 } = fallenBase(P, true);
  const g = staff(mat('wood', 0x4a2e1a), horn0, 1.7, 0.16);
  g.add(box(mat('banner', 0x8a1a1a), 0.42, 0.62, 0.03, 0.26, 1.38, 0));
  g.add(spike(horn0, 0.3, 0.05, 0, 1.55, 0, 0));
  hold(J, 'handR', g, -0.15, 0, 0, -0.15, 0.06);
  return finish(b, P, 'shamanRoot');
}

function buildSoulKiller() {
  const P = P0({ legUp: 0.5, legLow: 0.5, torsoH: 0.7, torsoW: 0.6, torsoD: 0.4, armUp: 0.5, armLow: 0.55, armR: 0.09, legR: 0.11, headR: 0.24, hunch: 0.35, stance: 0.3 });
  const b = biped(P);
  const { J } = b;
  const dark = mat('dark', 0x2a3048);
  const skin = mat('skin', 0x46506a);
  const blue = mat('loin', 0x2a4ea8);
  const white = mat('eye', 0xe8f0ff);
  humanoidBody(b, P, { skin, skin2: dark, cloth: dark, boot: dark });
  J.hips.add(box(blue, P.torsoW * 0.9, 0.34, P.torsoD * 0.95, 0, -0.16, 0));
  const hood = taper(dark, 0.33, 0.02, 0.85, 6, 0, 0.1, -0.12);
  hood.rotation.x = -0.35;
  J.head.add(hood);
  J.head.add(blob(dark, 0.27, 0.3, 0.3, 0, 0.3, 0, 1));
  eyes(J, white, 0.27, 0.9, 0.9, 0.4, 0.28);
  hold(J, 'handR', spear(mat('steel', 0x9096a4, { metalness: 0.4 }), mat('wood', 0x4a3220), 1.7));
  return finish(b, P, 'soulKillerRoot');
}

function buildVenomLord() {
  const P = P0({ legUp: 0.95, legLow: 0.95, torsoH: 1.25, torsoW: 1.0, torsoD: 0.6, armUp: 1.0, armLow: 1.05, armR: 0.16, legR: 0.19, headR: 0.3, hunch: 0.3, stance: 0.3, armSplay: 0.3 });
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0x3e7a26);
  const plate = mat('plate', 0x86b83e);
  const dark = mat('dark', 0x1a2c10);
  const bone = mat('bone', 0xd8d4a8);
  const eye = mat('eye', 0xffe040);
  humanoidBody(b, P, { skin, skin2: dark, cloth: plate, boot: skin }, { torso: 'box' });
  const hr = P.headR;
  eyes(J, eye, hr, 1.0, 1.0, 0.45, 0.34);
  for (const s of [1, -1]) {
    const h = horn(bone, 5, 1.6, 0.11, -0.22, 0, s * 0.2);
    h.position.set(s * hr * 0.6, hr * 1.5, 0);
    h.rotation.set(-0.5, 0, -s * 0.7);
    J.head.add(h);
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(blob(plate, 0.3, 0.2, 0.3, 0, 0.1, 0, 1));
    for (let i = 0; i < 3; i++) J[`shoulder${side}`].add(spike(bone, 0.5 - i * 0.1, 0.06, s * (0.05 + i * 0.1), 0.22, 0, 0, 0, -s * (0.3 + i * 0.3)));
    J[`elbow${side}`].add(box(plate, 0.26, 0.4, 0.26, 0, -0.35, 0));
    J[`knee${side}`].add(box(plate, 0.3, 0.45, 0.3, 0, -0.35, 0));
    J[`knee${side}`].add(spike(bone, 0.3, 0.05, 0, 0, 0.2, Math.PI / 2.2));
    // ailes de chauve-souris repliées dans le dos
    const w = new THREE.Group();
    w.position.set(s * 0.25, 0.3, -0.3);
    w.rotation.set(0, s * 0.15, s * 0.05);
    wing(w, mat('membrane', 0x2a4a1c), bone, s, 1.0);
    J.chest.add(w);
  }
  // faux : hampe et lame courbe
  const g = staff(mat('wood', 0x3a2a1a), mat('none', 0x000000), 2.0, 0.001);
  const blade = horn(mat('steel', 0x9aa0a8, { metalness: 0.4 }), 4, 0.9, 0.07, 0.6, 0, 0);
  blade.position.set(0, 1.55, 0);
  g.add(blade);
  hold(J, 'handR', g, -0.2, 0, 0, -0.1, 0.05);
  return finish(b, P, 'venomRoot');
}

function buildMinion() {
  const P = P0({ legUp: 0.8, legLow: 0.8, torsoH: 1.1, torsoW: 1.15, torsoD: 0.72, armUp: 0.7, armLow: 0.72, armR: 0.21, legR: 0.24, headR: 0.3, hunch: 0.2, stance: 0.3, walkAmp: 0.5 });
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0x8a7268);
  const skin2 = mat('skin2', 0x5a4640);
  const steel = mat('steel', 0x484a56, { metalness: 0.4 });
  const horn0 = mat('horn', 0xdcd0b0);
  const eye = mat('eye', 0xff6a30);
  humanoidBody(b, P, { skin, skin2, cloth: skin, boot: steel });
  J.chest.add(box(steel, P.torsoW * 0.85, 0.34, P.torsoD * 0.95, 0, 0.32, 0));
  J.hips.add(box(steel, P.torsoW * 0.95, 0.4, P.torsoD * 0.9, 0, -0.28, 0));
  eyes(J, eye, P.headR, 1.0, 1.0, 0.42, 0.3);
  for (const s of [1, -1]) {
    const h = horn(horn0, 5, 1.1, 0.12, -0.15, 0, s * 0.35);
    h.position.set(s * 0.28, 0.34, 0);
    h.rotation.set(-0.1, 0, -s * 1.2);
    J.head.add(h);
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(blob(steel, 0.34, 0.22, 0.34, 0, 0.1, 0, 1));
    J[`shoulder${side}`].add(spike(steel, 0.32, 0.07, s * 0.1, 0.28, 0, 0, 0, -s * 0.5));
  }
  hold(J, 'handR', axe(steel, mat('wood', 0x3a2a1a), 1.3, 0.42), -1.2, 0, 0.05);
  return finish(b, P, 'minionRoot');
}

function buildScarab() {
  const root = new THREE.Group();
  const J = {};
  const rest = {};
  const shell = mat('shell', 0x8a9484, { metalness: 0.3, roughness: 0.6 });
  const dark = mat('dark', 0x3a4036);
  const bone = mat('bone', 0xd8d0b0);
  const orb = mat('orb', 0x90e080);
  J.body = joint('body', root, 0, 0.55, 0);
  J.body.add(blob(shell, 0.55, 0.36, 0.7, 0, 0.1, -0.1, 1));
  J.body.add(blob(dark, 0.3, 0.2, 0.34, 0, 0.42, -0.1, 0));
  J.body.add(blob(orb, 0.13, 0.13, 0.13, 0, 0.32, 0.4, 0));
  for (let i = 0; i < 5; i++) J.body.add(spike(dark, 0.3, 0.05, (i - 2) * 0.2, 0.42, -0.45 + Math.abs(i - 2) * 0.05, -0.4, 0, -(i - 2) * 0.2));
  J.head = joint('head', J.body, 0, 0.05, 0.66);
  J.head.add(blob(dark, 0.26, 0.22, 0.26, 0, 0, 0.1, 0));
  for (const s of [1, -1]) {
    const c = horn(bone, 3, 0.55, 0.08, 0.5, 0, s * 0.45);
    c.position.set(s * 0.12, -0.02, 0.28);
    c.rotation.set(1.3, 0, s * 0.3);
    J.head.add(c);
  }
  const legs = [];
  for (let i = 0; i < 3; i++)
    for (const s of [1, -1]) {
      const n = `leg${s > 0 ? 'L' : 'R'}${i}`;
      legs.push(n);
      J[`${n}0`] = joint(`${n}0`, J.body, s * 0.42, 0, 0.35 - i * 0.4);
      rest[`${n}0`] = [0, 0, s * 0.7];
      J[`${n}1`] = joint(`${n}1`, J[`${n}0`], 0, -0.5, 0);
      rest[`${n}1`] = [0, 0, -s * 1.1];
      J[`${n}0`].add(limb(dark, 0.5, 0.06, 0.05, 4));
      J[`${n}1`].add(limb(dark, 0.55, 0.05, 0.03, 4));
    }
  applyRest(J, rest);
  const walk = (p, ph, amp) =>
    legs.forEach((l, i) => {
      const g = i % 2 === 0 ? 0 : Math.PI;
      p.r(`${l}0`, Math.sin(ph + g + i) * amp, 0, 0);
      p.r(`${l}1`, Math.max(0, Math.cos(ph + g + i)) * amp * 0.6, 0, 0);
    });
  const clips = [
    makeClip(
      'Idle',
      1.4,
      9,
      J,
      rest,
      (u, p) => {
        p.p('body', 0, Math.sin(u * TAU) * 0.02, 0);
        p.r('head', 0, Math.sin(u * TAU) * 0.12, 0);
      },
      true,
    ),
    makeClip('Walk', 0.5, 9, J, rest, (u, p) => walk(p, u * TAU, 0.5), true),
    makeClip(
      'Attack',
      0.6,
      11,
      J,
      rest,
      (u, p) => {
        const k = smooth(0, 0.4, u) * (1 - smooth(0.4, 0.55, u));
        const h = smooth(0.4, 0.55, u) * (1 - smooth(0.6, 1, u));
        p.r('body', -0.4 * k + 0.25 * h, 0, 0);
        p.p('body', 0, 0.1 * k, 0.5 * h);
        p.r('head', 0.3 * h, 0, 0);
      },
      false,
    ),
    makeClip(
      'Cast',
      0.8,
      9,
      J,
      rest,
      (u, p) => {
        const k = smooth(0, 0.45, u) * (1 - smooth(0.8, 1, u));
        p.r('body', -0.5 * k, 0, 0);
        p.p('body', 0, 0.25 * k, 0);
        p.r('head', -0.3 * k, 0, 0);
      },
      false,
    ),
    makeClip('Hit', 0.32, 5, J, rest, (u, p) => p.p('body', 0, 0, -0.2 * Math.sin(u * Math.PI)), false),
    makeClip(
      'Death',
      1.0,
      11,
      J,
      rest,
      (u, p) => {
        const f = smooth(0.05, 0.7, u);
        p.p('body', 0, -0.3 * f, 0);
        p.r('body', 0, 0, 2.6 * f);
        legs.forEach((l) => {
          p.r(`${l}0`, 0, 0, 0.6 * f);
          p.r(`${l}1`, 0, 0, 0.5 * f);
        });
      },
      false,
    ),
  ];
  root.name = 'scarabRoot';
  return { root, clips };
}

/* ------------------------------------------------------------------ */
/* Squelettes, morts-vivants                                            */
/* ------------------------------------------------------------------ */

function skeletonBody(b, P, M) {
  const { J } = b;
  const { bone, dark } = M;
  J.hips.add(box(bone, P.torsoW * 0.7, 0.14, P.torsoD * 0.6, 0, 0.0, 0));
  J.hips.add(blob(bone, P.torsoW * 0.32, 0.16, P.torsoD * 0.3, 0, -0.1, 0.02, 0));
  for (let i = 0; i < 5; i++) J.spine.add(blob(bone, 0.075, 0.06, 0.075, 0, i * 0.11 - 0.02, -0.04, 0));
  // cage thoracique : sternum et côtes en arceaux
  J.chest.add(box(bone, 0.09, P.torsoH * 0.6, 0.05, 0, P.torsoH * 0.12, P.torsoD * 0.42));
  for (let i = 0; i < 5; i++) {
    const y = i * 0.13 - 0.05;
    const w = P.torsoW * (0.45 - Math.abs(i - 1.6) * 0.03);
    for (const s of [1, -1]) {
      J.chest.add(box(bone, w * 0.5, 0.05, 0.05, s * w * 0.3, y, P.torsoD * 0.38));
      J.chest.add(box(bone, 0.05, 0.05, P.torsoD * 0.8, s * w * 0.55, y, 0));
    }
  }
  J.chest.add(box(dark, P.torsoW * 0.5, P.torsoH * 0.5, P.torsoD * 0.3, 0, P.torsoH * 0.1, -0.02));
  // crâne : voûte, mâchoire, orbites sombres et lueur
  const hr = P.headR;
  J.head.add(blob(bone, hr, hr * 1.05, hr * 1.1, 0, hr * 0.9, 0.02, 1));
  J.head.add(blob(bone, hr * 0.6, hr * 0.32, hr * 0.7, 0, hr * 0.15, hr * 0.42, 0));
  for (const s of [1, -1]) {
    J.head.add(box(dark, hr * 0.34, hr * 0.3, hr * 0.2, s * hr * 0.38, hr * 0.95, hr * 0.95));
    J.head.add(box(M.glow, hr * 0.14, hr * 0.14, hr * 0.12, s * hr * 0.38, hr * 0.95, hr * 1.05));
  }
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(blob(bone, 0.09, 0.09, 0.09, 0, 0, 0, 0));
    J[`shoulder${side}`].add(limb(bone, P.armUp, 0.045, 0.035, 5));
    J[`elbow${side}`].add(blob(bone, 0.06, 0.06, 0.06, 0, 0, 0, 0));
    J[`elbow${side}`].add(limb(bone, P.armLow, 0.04, 0.03, 5));
    for (let f = -1; f <= 1; f++) J[`hand${side}`].add(spike(bone, 0.16, 0.018, f * 0.035, -0.02, 0.03, 2.6, 0, f * 0.1, 3));
    J[`thigh${side}`].add(limb(bone, P.legUp, 0.06, 0.045, 5));
    J[`knee${side}`].add(blob(bone, 0.075, 0.075, 0.075, 0, 0, 0.02, 0));
    J[`knee${side}`].add(limb(bone, P.legLow, 0.05, 0.035, 5));
    J[`foot${side}`].add(box(bone, 0.1, 0.05, 0.28, 0, -0.03, 0.08));
  }
}

const SKP = (o) => P0({ legUp: 0.85, legLow: 0.85, torsoH: 0.95, torsoW: 0.56, torsoD: 0.36, armUp: 0.72, armLow: 0.72, armR: 0.05, legR: 0.06, headR: 0.2, hunch: 0.2, stance: 0.32, ...o });
const skMats = () => ({ bone: mat('bone', 0xcbbf8c), dark: mat('dark', 0x2a2418), glow: mat('glow', 0xffb040) });

function buildSkeletonWarrior() {
  const P = SKP({});
  const b = biped(P);
  const M = skMats();
  skeletonBody(b, P, M);
  const wood = mat('wood', 0x6a4a2a);
  hold(b.J, 'handR', axe(mat('steel', 0x8a8e98, { metalness: 0.4 }), wood, 1.0, 0.36));
  const sh = shield(mat('rim', 0x5a5a62, { metalness: 0.4 }), wood, 0.4);
  hold(b.J, 'elbowL', sh, 0, Math.PI / 2, 0, -P.armLow * 0.5, 0);
  return finish(b, P, 'skWarriorRoot');
}

function buildSkeletonArcher() {
  const P = SKP({});
  const b = biped(P);
  const M = skMats();
  skeletonBody(b, P, M);
  const red = mat('rag', 0x8a2a1a);
  b.J.hips.add(box(red, P.torsoW * 0.8, 0.5, P.torsoD * 0.9, 0, -0.28, 0));
  b.J.chest.add(box(red, P.torsoW * 0.5, 0.16, P.torsoD * 0.9, 0, P.torsoH * 0.3, 0));
  b.J.shoulderR.add(blob(red, 0.13, 0.1, 0.13, 0, 0.02, 0, 0));
  b.J.thighL.add(box(red, 0.18, 0.5, 0.16, 0, -0.32, 0));
  hold(b.J, 'handL', bow(mat('wood', 0x5a3a1e), mat('cord', 0xd8d0b0), 1.45), 0, 0, 0, 0, 0.1);
  return finish(b, P, 'skArcherRoot');
}

function buildSkeletonMage() {
  const P = SKP({});
  const b = biped(P);
  const M = skMats();
  skeletonBody(b, P, M);
  const robe = mat('robe', 0x3a3a5a);
  b.J.hips.add(taper(robe, 0.32, 0.22, 0.85, 6, 0, -0.85, 0));
  b.J.chest.add(box(robe, P.torsoW * 0.5, 0.2, P.torsoD * 0.9, 0, P.torsoH * 0.32, 0));
  hold(b.J, 'handR', staff(mat('wood', 0x4a3220), mat('orb', 0x7ab8ff), 1.8, 0.12), -0.15, 0, 0, -0.1, 0.05);
  return finish(b, P, 'skMageRoot');
}

function buildOblivionKnight() {
  const P = SKP({ legUp: 1.0, legLow: 1.0, torsoH: 1.1, torsoW: 0.66, torsoD: 0.42, armUp: 0.82, armLow: 0.82, headR: 0.22, hunch: 0.15 });
  const b = biped(P);
  const M = skMats();
  skeletonBody(b, P, M);
  const armor = mat('armor', 0x3a3428, { metalness: 0.3 });
  const gold = mat('gold', 0xb8903a, { metalness: 0.4, roughness: 0.55 });
  const { J } = b;
  J.chest.add(box(armor, P.torsoW * 0.78, P.torsoH * 0.62, P.torsoD * 1.05, 0, P.torsoH * 0.1, 0));
  J.chest.add(box(gold, 0.12, P.torsoH * 0.6, 0.07, 0, P.torsoH * 0.1, P.torsoD * 0.54));
  J.hips.add(box(armor, P.torsoW * 0.8, 0.4, P.torsoD * 0.9, 0, -0.26, 0));
  J.hips.add(box(gold, P.torsoW * 0.85, 0.09, P.torsoD * 0.95, 0, -0.04, 0));
  J.head.add(blob(armor, 0.24, 0.16, 0.26, 0, 0.32, 0, 1));
  for (const s of [1, -1]) {
    const h = horn(gold, 3, 0.55, 0.06, -0.15, 0, s * 0.3);
    h.position.set(s * 0.2, 0.36, 0);
    h.rotation.set(0, 0, -s * 1.1);
    J.head.add(h);
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(blob(armor, 0.2, 0.13, 0.2, 0, 0.06, 0, 1));
    J[`shoulder${side}`].add(spike(gold, 0.26, 0.05, s * 0.1, 0.16, 0, 0, 0, -s * 0.5));
    J[`elbow${side}`].add(box(armor, 0.15, 0.25, 0.15, 0, -0.3, 0));
    J[`knee${side}`].add(box(armor, 0.15, 0.3, 0.15, 0, -0.32, 0));
  }
  // sphère d'énergie bleue dans la main gauche, lame à la droite
  J.handL.add(blob(mat('orb', 0x6a9cff), 0.11, 0.11, 0.11, 0, -0.16, 0.05, 1));
  hold(J, 'handR', sword(mat('steel', 0x7a7e8a, { metalness: 0.4 }), mat('grip', 0x3a2a1a), 0.95, 0.09));
  return finish(b, P, 'oblivionRoot');
}

function buildZombie() {
  const P = P0({ legUp: 0.82, legLow: 0.82, torsoH: 0.98, torsoW: 0.72, torsoD: 0.46, armUp: 0.6, armLow: 0.62, armR: 0.13, legR: 0.15, headR: 0.23, hunch: 0.55, stance: 0.3, walkAmp: 0.4 });
  const b = biped(P);
  const { J, rest } = b;
  const skin = mat('skin', 0x5a6a44);
  const skin2 = mat('skin2', 0x3a4630);
  const rag = mat('rag', 0x3a3226);
  const bone = mat('bone', 0x8a8a68);
  humanoidBody(b, P, { skin, skin2, cloth: skin, boot: skin2 });
  J.hips.add(box(rag, P.torsoW * 0.85, 0.5, P.torsoD * 0.9, 0, -0.28, 0));
  J.chest.add(box(rag, P.torsoW * 0.5, 0.3, P.torsoD * 0.95, 0, 0.05, 0.02));
  for (let i = 0; i < 3; i++) J.chest.add(box(bone, P.torsoW * 0.4, 0.04, 0.05, 0, -0.1 + i * 0.12, P.torsoD * 0.5));
  eyes(J, mat('eye', 0xd8c040), P.headR, 0.98, 0.95, 0.4, 0.22);
  J.head.add(box(bone, 0.18, 0.05, 0.05, 0, 0.1, P.headR * 1.0));
  // bras tendus vers l'avant, tête penchée
  rest.shoulderL = [-1.15, 0, -0.1];
  rest.shoulderR = [-1.05, 0, 0.1];
  rest.elbowL = [-0.15, 0, 0];
  rest.elbowR = [-0.2, 0, 0];
  rest.neck = [0.25, 0, 0.12];
  applyRest(J, rest);
  return finish(b, P, 'zombieRoot');
}

function buildMummy(big) {
  const k = big ? 1.12 : 1;
  const P = P0({
    legUp: 0.82 * k,
    legLow: 0.82 * k,
    torsoH: 1.0 * k,
    torsoW: 0.76 * k,
    torsoD: 0.48 * k,
    armUp: 0.6 * k,
    armLow: 0.62 * k,
    armR: 0.13 * k,
    legR: 0.15 * k,
    headR: 0.23 * k,
    hunch: 0.35,
    stance: 0.3,
    walkAmp: 0.42,
  });
  const b = biped(P);
  const { J, rest } = b;
  const wrap = mat('wrap', big ? 0x5a5a42 : 0x6c6c48);
  const wrap2 = mat('wrap2', big ? 0x3a3a2a : 0x4a4a30);
  humanoidBody(b, P, { skin: wrap, skin2: wrap2, cloth: wrap, boot: wrap2 });
  // bandelettes : anneaux autour du torse, du crâne et des membres
  const ring = (par, r, y, sx = 1, sz = 1) => {
    const g = new THREE.TorusGeometry(r, 0.03, 4, 9);
    g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, wrap2);
    m.position.y = y;
    m.scale.set(sx, 1, sz);
    m.castShadow = true;
    par.add(m);
  };
  for (let i = 0; i < 5; i++) ring(J.chest, P.torsoW * 0.5, -0.1 + i * 0.13, 1, 0.62);
  for (let i = 0; i < 3; i++) ring(J.head, P.headR * 1.0, P.headR * (0.5 + i * 0.4));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    for (let i = 0; i < 3; i++) {
      ring(J[`shoulder${side}`], P.armR * 1.05, -0.2 - i * 0.22);
      ring(J[`thigh${side}`], P.legR * 1.25, -0.2 - i * 0.25);
    }
    J[`elbow${side}`].add(box(wrap2, 0.1, 0.06, 0.1, 0, -0.4, 0.04));
  }
  eyes(J, mat('eye', big ? 0xff6030 : 0xffd060), P.headR, 0.98, 0.97, 0.4, 0.26);
  rest.shoulderL = [-0.95, 0, -0.1];
  rest.shoulderR = [-0.95, 0, 0.1];
  rest.elbowL = [-0.25, 0, 0];
  rest.elbowR = [-0.25, 0, 0];
  applyRest(J, rest);
  return finish(b, P, big ? 'greaterMummyRoot' : 'mummyRoot');
}

function buildGriswold() {
  const P = P0({ legUp: 0.86, legLow: 0.86, torsoH: 1.05, torsoW: 1.0, torsoD: 0.62, armUp: 0.66, armLow: 0.68, armR: 0.18, legR: 0.19, headR: 0.26, hunch: 0.18, stance: 0.3, walkAmp: 0.5 });
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0xd4a48a);
  const skin2 = mat('skin2', 0xa87a64);
  const tunic = mat('tunic', 0xc0601c);
  const dark = mat('dark', 0x2a221c);
  humanoidBody(b, P, { skin, skin2, cloth: tunic, boot: dark }, { head: 1.05 });
  J.hips.add(box(dark, P.torsoW * 0.9, 0.12, P.torsoD * 0.95, 0, -0.02, 0));
  J.hips.add(box(tunic, P.torsoW * 0.85, 0.4, P.torsoD * 0.95, 0, -0.24, 0));
  J.head.add(blob(skin2, P.headR * 1.02, P.headR * 0.3, P.headR * 0.5, 0, P.headR * 1.0, P.headR * 0.62, 0));
  J.head.add(box(mat('eye', 0x3a1a10), P.headR * 0.5, P.headR * 0.14, P.headR * 0.2, 0, P.headR * 0.95, P.headR * 0.95));
  for (const s of [1, -1]) J[`elbow${s > 0 ? 'L' : 'R'}`].add(box(dark, 0.26, 0.34, 0.26, 0, -0.34, 0));
  hold(J, 'handR', axe(mat('steel', 0x8a8e98, { metalness: 0.4 }), mat('wood', 0x4a3220), 1.5, 0.5), -1.1, 0, 0.05);
  return finish(b, P, 'griswoldRoot');
}

/* ------------------------------------------------------------------ */
/* Bovins                                                                */
/* ------------------------------------------------------------------ */

function bullHead(J, hr, hide, dark, hornM, eyeM, big) {
  J.head.add(blob(hide, hr * 0.95, hr * 0.95, hr * 1.0, 0, hr * 0.9, 0, 1));
  J.head.add(blob(hide, hr * 0.58, hr * 0.5, hr * 0.9, 0, hr * 0.5, hr * 0.9, 1));
  J.head.add(blob(dark, hr * 0.34, hr * 0.2, hr * 0.2, 0, hr * 0.42, hr * 1.7, 0));
  eyes(J, eyeM, hr, 1.05, 0.98, 0.5, 0.3);
  for (const s of [1, -1]) {
    const h = horn(hornM, 5, hr * (big ? 4.5 : 3.6), hr * 0.2, 0.22, 0, s * 0.4);
    h.position.set(s * hr * 0.75, hr * 1.5, hr * 0.15);
    h.rotation.set(-0.35, 0, -s * 1.15);
    J.head.add(h);
    J.head.add(blob(hide, hr * 0.32, hr * 0.14, hr * 0.22, s * hr * 1.0, hr * 1.3, -hr * 0.2, 0));
  }
}

function buildBovine(king) {
  const k = king ? 1.35 : 1;
  const P = P0({
    legUp: 0.8 * k,
    legLow: 0.8 * k,
    torsoH: 1.1 * k,
    torsoW: 1.0 * k,
    torsoD: 0.62 * k,
    armUp: 0.66 * k,
    armLow: 0.7 * k,
    armR: 0.18 * k,
    legR: 0.19 * k,
    headR: 0.3 * k,
    hunch: 0.3,
    stance: 0.3,
    walkAmp: 0.5,
  });
  const b = biped(P);
  const { J } = b;
  const hide = mat('hide', king ? 0xc4d8e8 : 0xb4ae9c);
  const hide2 = mat('hide2', king ? 0x88a4c0 : 0x7a7466);
  const dark = mat('dark', 0x3a3630);
  const hornM = mat('horn', king ? 0xf0f4f8 : 0xe0d8c0);
  const gold = mat('gold', 0xd0a83a, { metalness: 0.4 });
  const leather = mat('leather', 0x5a4632);
  humanoidBody(b, P, { skin: hide, skin2: hide2, cloth: hide, boot: dark });
  J.hips.add(box(leather, P.torsoW * 0.9, 0.36, P.torsoD * 0.95, 0, -0.2, 0));
  J.chest.add(box(leather, P.torsoW * 0.15, P.torsoH * 0.8, P.torsoD * 1.05, P.torsoW * 0.2, P.torsoH * 0.1, 0));
  bullHead(J, P.headR, hide, dark, hornM, mat('eye', 0xff3020), king);
  if (king) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * 2.4;
      J.head.add(spike(gold, 0.45, 0.07, Math.sin(a) * P.headR * 0.95, P.headR * 1.85, Math.cos(a) * P.headR * 0.4 - 0.05, 0, 0, -a * 0.35));
    }
    J.head.add(box(gold, P.headR * 2, 0.1, P.headR * 1.4, 0, P.headR * 1.8, 0));
    for (const s of [1, -1]) J[`shoulder${s > 0 ? 'L' : 'R'}`].add(blob(gold, 0.36, 0.2, 0.36, 0, 0.08, 0, 1));
  }
  const steel = mat('steel', 0x8a8e98, { metalness: 0.4 });
  hold(J, 'handR', king ? axe(steel, mat('wood', 0x4a3220), 1.9, 0.6) : spear(steel, mat('wood', 0x4a3220), 2.4, true), -1.15, 0, 0.05);
  return finish(b, P, king ? 'cowKingRoot' : 'bovineRoot');
}

/* ------------------------------------------------------------------ */
/* Humains : mercenaires, PNJ                                            */
/* ------------------------------------------------------------------ */

export const HP = (o) =>
  P0({ legUp: 0.8, legLow: 0.8, torsoH: 1.05, torsoW: 0.8, torsoD: 0.46, armUp: 0.58, armLow: 0.6, armR: 0.105, legR: 0.14, headR: 0.2, hunch: 0.1, stance: 0.28, walkAmp: 0.6, armSplay: 0.1, ...o });

/** Cheveux : calotte + mèches ; long = retombe dans le dos */
export function hair(J, m, hr, long = false) {
  J.head.add(blob(m, hr * 1.06, hr * 0.7, hr * 1.1, 0, hr * 1.32, -hr * 0.12, 1));
  if (long) J.head.add(box(m, hr * 1.5, hr * 2.4, hr * 0.5, 0, hr * 0.2, -hr * 0.78));
}

export function helm(J, steel, hr, plume) {
  J.head.add(blob(steel, hr * 1.12, hr * 1.1, hr * 1.16, 0, hr * 1.0, 0, 1));
  J.head.add(box(mat('visor', 0x14141a), hr * 1.0, hr * 0.16, hr * 0.2, 0, hr * 0.98, hr * 1.02));
  J.head.add(box(steel, hr * 0.14, hr * 0.9, hr * 0.2, 0, hr * 0.7, hr * 1.06));
  if (plume) for (let i = 0; i < 7; i++) J.head.add(spike(plume, hr * (1.0 + Math.sin((i / 6) * Math.PI) * 0.5), hr * 0.18, 0, hr * 1.95, (i - 3) * hr * 0.34, -0.15, 0, 0));
}

function buildRogue() {
  const P = HP({ torsoW: 0.62, torsoD: 0.38, armR: 0.096, legR: 0.128, hunch: 0.08 });
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0xdcb090);
  const red = mat('leather', 0xa02a22);
  const red2 = mat('leather2', 0x5a1a18);
  const hairM = mat('hair', 0x8a2418);
  humanoidBody(b, P, { skin, skin2: skin, cloth: red, boot: red2 });
  hair(J, hairM, P.headR, true);
  J.chest.add(box(mat('blue', 0x2a3a78), P.torsoW * 0.5, 0.2, P.torsoD * 1.05, 0, 0.12, 0.02));
  J.hips.add(box(red2, P.torsoW * 0.9, 0.34, P.torsoD * 0.9, 0, -0.2, 0));
  for (const s of [1, -1]) J[`shoulder${s > 0 ? 'L' : 'R'}`].add(blob(red2, 0.14, 0.1, 0.14, 0, 0.05, 0, 1));
  // capuchon-crête rouge, carquois et flèches dans le dos
  for (let i = 0; i < 4; i++) J.head.add(spike(red, 0.4 - i * 0.05, 0.05, 0, P.headR * 1.75 - i * 0.03, -0.06 - i * 0.07, -0.55));
  const q = taper(red2, 0.09, 0.08, 0.6, 6, 0.1, -0.2, -0.3);
  q.rotation.z = 0.25;
  J.chest.add(q);
  for (let i = 0; i < 3; i++) J.chest.add(spike(mat('fletch', 0xd8d0b0), 0.22, 0.02, 0.06 + i * 0.05, 0.4, -0.3, 0, 0, 0.25));
  hold(J, 'handL', bow(mat('wood', 0x5a3a1e), mat('cord', 0xe0d8c0), 1.5), 0, 0, 0, 0, 0.1);
  return finish(b, P, 'rogueRoot');
}

function buildDesert() {
  const P = HP({ torsoW: 0.78, armR: 0.122, legR: 0.154, headR: 0.21 });
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0xa8794f);
  const steel = mat('steel', 0x808a8c, { metalness: 0.4, roughness: 0.55 });
  const teal = mat('teal', 0x46705f);
  const teal2 = mat('teal2', 0x2e463c);
  const red = mat('plume', 0xa02820);
  humanoidBody(b, P, { skin, skin2: skin, cloth: teal, boot: teal2 }, { torso: 'box' });
  helm(J, steel, P.headR, red);
  J.chest.add(box(steel, P.torsoW * 0.92, 0.18, P.torsoD * 1.1, 0, 0.36, 0));
  J.hips.add(box(teal2, P.torsoW * 0.95, 0.42, P.torsoD * 0.95, 0, -0.26, 0));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(blob(steel, 0.17, 0.12, 0.17, 0, 0.06, 0, 1));
    J[`elbow${side}`].add(box(steel, 0.13, 0.22, 0.13, 0, -0.3, 0));
  }
  hold(J, 'handR', spear(steel, mat('wood', 0x5a4028), 2.3), -0.3, 0, 0, -0.12, 0.05);
  return finish(b, P, 'desertRoot');
}

function buildIronWolf() {
  const P = HP({ torsoW: 0.82, torsoD: 0.5, armR: 0.128, legR: 0.16, headR: 0.21 });
  const b = biped(P);
  const { J } = b;
  const steel = mat('steel', 0x9a9ea8, { metalness: 0.45, roughness: 0.5 });
  const steel2 = mat('steel2', 0x5a5c68, { metalness: 0.4 });
  const red = mat('tabard', 0x9a1c1c);
  const skin = mat('skin', 0xb08a68);
  humanoidBody(b, P, { skin: steel2, skin2: steel2, cloth: steel, boot: steel2 }, { torso: 'box' });
  helm(J, steel, P.headR, red);
  // tabard rouge devant et derrière, jupe de plates
  J.chest.add(box(red, P.torsoW * 0.55, P.torsoH * 0.95, 0.05, 0, -0.2, P.torsoD * 0.56));
  J.chest.add(box(red, P.torsoW * 0.55, P.torsoH * 1.0, 0.05, 0, -0.2, -P.torsoD * 0.56));
  J.hips.add(box(steel2, P.torsoW * 0.95, 0.4, P.torsoD * 0.95, 0, -0.26, 0));
  J.hips.add(box(red, 0.36, 0.7, 0.05, 0, -0.5, P.torsoD * 0.5));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(blob(steel, 0.2, 0.14, 0.2, 0, 0.06, 0, 1));
    J[`shoulder${side}`].add(spike(steel, 0.2, 0.05, s * 0.08, 0.16, 0, 0, 0, -s * 0.5));
    J[`elbow${side}`].add(box(steel, 0.15, 0.26, 0.15, 0, -0.3, 0));
    J[`knee${side}`].add(box(steel, 0.16, 0.3, 0.16, 0, -0.34, 0));
  }
  void skin;
  hold(J, 'handR', sword(steel, mat('grip', 0x3a2a1a), 1.15, 0.1));
  hold(J, 'elbowL', shield(steel2, red, 0.44, true), 0, Math.PI / 2, 0, -P.armLow * 0.5, 0);
  return finish(b, P, 'ironWolfRoot');
}

function buildAscendant() {
  const P = HP({ torsoW: 0.66, torsoD: 0.4, armR: 0.102, legR: 0.128, headR: 0.2, legUp: 0.8, legLow: 0.8 });
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0xd8b498);
  const white = mat('white', 0xece8dc);
  const gold = mat('gold', 0xe0b854, { metalness: 0.5, roughness: 0.5 });
  humanoidBody(b, P, { skin, skin2: skin, cloth: white, boot: white });
  hair(J, mat('hair', 0xdcd4c0), P.headR, true);
  J.hips.add(taper(white, P.torsoW * 0.62, P.torsoW * 0.34, 1.55, 8, 0, -1.5, 0));
  J.hips.add(box(gold, P.torsoW * 0.75, 0.08, P.torsoD * 0.9, 0, -0.02, 0));
  J.chest.add(box(gold, 0.1, P.torsoH * 0.8, 0.04, 0, 0.1, P.torsoD * 0.6));
  // couronne de lumière : pointes dorées rayonnantes
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * 2.6;
    J.head.add(spike(gold, 0.36, 0.035, Math.sin(a) * P.headR * 1.1, P.headR * 1.9, -0.05, 0, 0, -a * 0.55));
  }
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(blob(gold, 0.15, 0.1, 0.15, 0, 0.04, 0, 1));
    J[`elbow${side}`].add(taper(white, 0.11, 0.2, 0.5, 6, 0, -0.5, 0));
  }
  hold(J, 'handR', staff(gold, mat('orb', 0xfff0a0), 2.0, 0.13), -0.15, 0, 0, -0.12, 0.05);
  return finish(b, P, 'ascendantRoot');
}

function buildBarbarian() {
  const P = HP({ torsoW: 0.98, torsoD: 0.58, armR: 0.17, legR: 0.19, headR: 0.22, armSplay: 0.12 });
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0xd0a884);
  const skin2 = mat('skin2', 0xa07850);
  const green = mat('green', 0x2c3c28);
  const brass = mat('brass', 0xc8a03a, { metalness: 0.4, roughness: 0.55 });
  const fur = mat('fur', 0x6a5238);
  humanoidBody(b, P, { skin, skin2, cloth: green, boot: green });
  J.chest.add(box(green, P.torsoW * 0.8, P.torsoH * 0.6, P.torsoD * 1.05, 0, P.torsoH * 0.12, 0));
  J.chest.add(box(mat('red', 0x8a2a1a), 0.1, P.torsoH * 0.5, 0.04, 0, 0.0, P.torsoD * 0.56));
  J.hips.add(box(fur, P.torsoW * 0.9, 0.5, P.torsoD * 0.98, 0, -0.28, 0));
  J.head.add(box(skin2, P.headR * 1.4, P.headR * 0.14, P.headR * 0.3, 0, P.headR * 1.1, P.headR * 0.9));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(blob(brass, 0.22, 0.14, 0.22, 0, 0.06, 0, 1));
    for (let i = 0; i < 4; i++) J[`shoulder${side}`].add(spike(brass, 0.26 - i * 0.02, 0.05, s * (0.02 + i * 0.09), 0.18, (i - 1.5) * 0.08, (i - 1.5) * 0.2, 0, -s * (0.25 + i * 0.3)));
    J[`elbow${side}`].add(box(green, 0.18, 0.3, 0.18, 0, -0.3, 0));
    J[`knee${side}`].add(box(green, 0.18, 0.34, 0.18, 0, -0.34, 0));
  }
  hold(J, 'handR', sword(mat('steel', 0x8a8e98, { metalness: 0.4 }), mat('grip', 0x3a2a1a), 1.2, 0.13));
  return finish(b, P, 'barbarianRoot');
}

function buildQualKehk() {
  const P = HP({ torsoW: 0.98, torsoD: 0.58, armR: 0.179, legR: 0.192, headR: 0.22, armSplay: 0.2 });
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0xb88a68);
  const green = mat('cloth', 0x4a3a28);
  const red = mat('cloak', 0x7a1e1a);
  const white = mat('beard', 0xd8d0c0);
  humanoidBody(b, P, { skin, skin2: skin, cloth: green, boot: green });
  J.chest.add(box(red, P.torsoW * 1.0, P.torsoH * 1.3, 0.06, 0, -0.1, -P.torsoD * 0.6));
  J.head.add(blob(white, P.headR * 0.8, P.headR * 0.9, P.headR * 0.5, 0, P.headR * 0.25, P.headR * 0.62, 1));
  J.head.add(blob(white, P.headR * 1.0, P.headR * 0.5, P.headR * 0.9, 0, P.headR * 1.42, -P.headR * 0.2, 1));
  for (const s of [1, -1]) J[`shoulder${s > 0 ? 'L' : 'R'}`].add(blob(mat('fur', 0x6a5238), 0.24, 0.16, 0.24, 0, 0.06, 0, 1));
  hold(J, 'handR', axe(mat('steel', 0x8a8e98, { metalness: 0.4 }), mat('wood', 0x4a3220), 1.5, 0.45), -0.1, 0, 0, -0.1, 0.05);
  return finish(b, P, 'qualRoot');
}

function buildLarzuk() {
  const P = HP({ torsoW: 1.0, torsoD: 0.6, armR: 0.192, legR: 0.192, headR: 0.22, armSplay: 0.2 });
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0xc89070);
  const apron = mat('apron', 0x5a3a22);
  const dark = mat('dark', 0x2a2018);
  humanoidBody(b, P, { skin, skin2: skin, cloth: skin, boot: dark });
  hair(J, mat('hair', 0x1e1610), P.headR);
  J.chest.add(box(apron, P.torsoW * 0.7, P.torsoH * 1.1, 0.06, 0, -0.25, P.torsoD * 0.56));
  J.hips.add(box(apron, P.torsoW * 0.8, 0.55, P.torsoD * 0.95, 0, -0.3, 0));
  for (const s of [1, -1]) J[`elbow${s > 0 ? 'L' : 'R'}`].add(box(dark, 0.2, 0.32, 0.2, 0, -0.32, 0));
  const hammer = new THREE.Group();
  hammer.add(taper(mat('wood', 0x4a3220), 0.05, 0.05, 0.9, 5, 0, -0.2, 0));
  hammer.add(box(mat('steel', 0x6a6e78, { metalness: 0.4 }), 0.46, 0.22, 0.22, 0, 0.72, 0));
  hold(J, 'handR', hammer, -0.1, 0, 0, -0.1, 0.05);
  return finish(b, P, 'larzukRoot');
}

function buildMalah() {
  const P = HP({ torsoW: 0.66, torsoD: 0.4, armR: 0.096, legR: 0.115, headR: 0.2, hunch: 0.25, legUp: 0.8, legLow: 0.8 });
  const b = biped(P);
  const { J, rest } = b;
  const skin = mat('skin', 0xd4b09a);
  const robe = mat('robe', 0xe4dfd4);
  const sash = mat('sash', 0x7a3a2a);
  humanoidBody(b, P, { skin, skin2: skin, cloth: robe, boot: robe });
  hair(J, mat('hair', 0xa8a8b0), P.headR);
  J.head.add(blob(mat('hair', 0xa8a8b0), P.headR * 0.4, P.headR * 0.4, P.headR * 0.4, 0, P.headR * 1.5, -P.headR * 0.8, 0));
  J.hips.add(taper(robe, P.torsoW * 0.6, P.torsoW * 0.36, 1.5, 8, 0, -1.48, 0));
  J.hips.add(box(sash, P.torsoW * 0.8, 0.12, P.torsoD * 0.95, 0, -0.02, 0));
  J.chest.add(box(sash, 0.12, P.torsoH * 0.8, 0.04, 0.12, 0.05, P.torsoD * 0.58));
  rest.shoulderL = [-0.7, 0, -0.1];
  rest.shoulderR = [-0.7, 0, 0.1];
  rest.elbowL = [-0.9, 0, 0];
  rest.elbowR = [-0.9, 0, 0];
  applyRest(J, rest);
  return finish(b, P, 'malahRoot');
}

function buildAnya() {
  const P = HP({ torsoW: 0.62, torsoD: 0.38, armR: 0.096, legR: 0.128, headR: 0.2 });
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0xd4a888);
  const orange = mat('orange', 0xc8882a);
  const dark = mat('dark', 0x2e2218);
  humanoidBody(b, P, { skin, skin2: skin, cloth: orange, boot: dark });
  hair(J, mat('hair', 0x1a1412), P.headR, true);
  J.chest.add(box(dark, P.torsoW * 0.6, 0.3, P.torsoD * 1.05, 0, 0.16, 0.02));
  J.hips.add(box(orange, P.torsoW * 0.9, 0.36, P.torsoD * 0.9, 0, -0.2, 0));
  return finish(b, P, 'anyaRoot');
}

export const CROWD = {
  fallen: buildFallen,
  fallen_shaman: buildFallenShaman,
  soul_killer: buildSoulKiller,
  venom_lord: buildVenomLord,
  minion_destruction: buildMinion,
  scarab: buildScarab,
  skeleton_warrior: buildSkeletonWarrior,
  skeleton_archer: buildSkeletonArcher,
  skeleton_mage: buildSkeletonMage,
  oblivion_knight: buildOblivionKnight,
  zombie: buildZombie,
  mummy: () => buildMummy(false),
  greater_mummy: () => buildMummy(true),
  griswold: buildGriswold,
  hell_bovine: () => buildBovine(false),
  cow_king: () => buildBovine(true),
  merc_rogue: buildRogue,
  merc_desert: buildDesert,
  merc_ironwolf: buildIronWolf,
  merc_ascendant: buildAscendant,
  merc_barbarian: buildBarbarian,
  npc_qual_kehk: buildQualKehk,
  npc_larzuk: buildLarzuk,
  npc_malah: buildMalah,
  npc_anya: buildAnya,
};

void horn;
void limb;
