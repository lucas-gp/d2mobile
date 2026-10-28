/**
 * Créatures procédurales : Diablo, Baal, Duriel, Seigneur de sang (les autres : procedural-crowd.js).
 * Voir proc-kit.js pour le socle. Repère : la créature regarde vers +Z, Y en haut.
 */
import * as THREE from 'three';
import { TAU, mat, mesh, blob, taper, spike, limb, box, horn, joint, applyRest, makeClip, smooth, biped, bipedClips } from './proc-kit.js';
import { CROWD } from './procedural-crowd.js';
import { DRUIDS } from './procedural-druid.js';
import { HEROES } from './procedural-heroes.js';
import { BOSSES } from './procedural-bosses.js';

/* ------------------------------------------------------------------ */
/* Diablo : rouge vif, cornes, plastron d'os épineux                    */
/* ------------------------------------------------------------------ */

function buildDiablo() {
  const P = {
    legUp: 0.72,
    legLow: 0.72,
    torsoH: 1.25,
    torsoW: 1.35,
    torsoD: 0.78,
    armUp: 1.0,
    armLow: 1.0,
    armR: 0.27,
    legR: 0.31,
    headR: 0.3,
    hunch: 0.5,
    stance: 0.27,
    walkAmp: 0.5,
    armSplay: 0.34,
  };
  const b = biped(P);
  const { J, root } = b;
  const skin = mat('skin', 0xd01c12);
  const skinDark = mat('skinDark', 0x8a0e0a);
  const bone = mat('bone', 0xb4b072);
  const boneDark = mat('boneDark', 0x7a7a48);
  const horn0 = mat('horn', 0xeadfc4);
  const eye = mat('eye', 0xffe45a);
  const claw = mat('claw', 0xe6dcc0);

  // bassin et abdomen musclé
  J.hips.add(blob(skin, 0.55, 0.32, 0.38, 0, 0.06, 0, 1));
  J.spine.add(blob(skin, 0.5, 0.4, 0.34, 0, 0.32, 0.02, 1));
  // torse : masse rouge + grand plastron d'os à côtes saillantes
  J.chest.add(blob(skin, 0.68, 0.62, 0.46, 0, 0.12, 0, 1));
  J.chest.add(blob(bone, 0.62, 0.58, 0.3, 0, 0.16, 0.36, 1));
  for (let i = 0; i < 4; i++) {
    J.chest.add(box(boneDark, 0.72 - i * 0.08, 0.07, 0.1, 0, -0.12 + i * 0.17, 0.5));
    J.chest.add(spike(bone, 0.28, 0.06, -0.24, -0.1 + i * 0.16, 0.5, Math.PI / 2.4, 0, 0.5));
    J.chest.add(spike(bone, 0.28, 0.06, 0.24, -0.1 + i * 0.16, 0.5, Math.PI / 2.4, 0, -0.5));
  }
  J.chest.add(spike(bone, 0.5, 0.09, 0, 0.55, 0.46, Math.PI / 2.8));
  // dos : rangée d'épines
  for (let i = 0; i < 5; i++) J.chest.add(spike(bone, 0.36 - i * 0.03, 0.07, 0, 0.5 - i * 0.2, -0.42, -Math.PI / 2.4));
  // tête : crâne allongé, mâchoire, yeux, grandes cornes courbes vers l'arrière puis le haut
  J.head.add(blob(skin, 0.38, 0.4, 0.44, 0, 0.2, 0.05, 1));
  J.head.add(blob(skinDark, 0.28, 0.17, 0.36, 0, -0.04, 0.2, 0));
  J.head.add(box(eye, 0.09, 0.05, 0.05, -0.16, 0.26, 0.36));
  J.head.add(box(eye, 0.09, 0.05, 0.05, 0.16, 0.26, 0.36));
  for (const s of [1, -1]) {
    const h = horn(horn0, 6, 1.9, 0.14, -0.2, 0, s * 0.3);
    h.position.set(s * 0.22, 0.42, 0);
    h.rotation.set(-0.35, 0, -s * 0.85);
    J.head.add(h);
    const h2 = horn(horn0, 4, 0.55, 0.06, 0.32, 0, s * 0.25);
    h2.position.set(s * 0.26, 0.2, -0.05);
    h2.rotation.set(0.1, 0, -s * 1.5);
    J.head.add(h2);
    for (let i = 0; i < 3; i++) J.head.add(spike(horn0, 0.3, 0.05, s * (0.08 + i * 0.07), 0.46 - i * 0.03, -0.02 - i * 0.1, -0.5, 0, -s * (0.1 + i * 0.16)));
  }
  J.head.add(spike(horn0, 0.4, 0.07, 0, 0.5, 0.05, -0.15));
  // épaules à pointes, coudes à pointes, mains griffues
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(blob(skin, 0.3, 0.26, 0.3, 0, 0.02, 0, 1));
    J[`shoulder${side}`].add(blob(bone, 0.34, 0.14, 0.34, 0, 0.2, 0, 0));
    for (let i = 0; i < 3; i++) J[`shoulder${side}`].add(spike(bone, 0.5 - i * 0.08, 0.07, s * (0.05 + i * 0.12), 0.24, (i - 1) * 0.1, (i - 1) * 0.3, 0, -s * (0.35 + i * 0.3)));
    J[`shoulder${side}`].add(limb(skin, P.armUp, P.armR * 1.0, P.armR * 0.85, 7));
    J[`shoulder${side}`].add(blob(skin, 0.3, 0.42, 0.28, 0, -0.42, 0.03, 1));
    J[`elbow${side}`].add(blob(skinDark, 0.17, 0.17, 0.17, 0, 0, 0, 0));
    J[`elbow${side}`].add(limb(skin, P.armLow, P.armR * 0.8, P.armR * 0.6, 7));
    J[`elbow${side}`].add(blob(skin, 0.25, 0.4, 0.24, 0, -0.32, 0.02, 1));
    J[`elbow${side}`].add(spike(bone, 0.4, 0.06, s * 0.14, 0.04, -0.02, 0, 0, -s * 1.1));
    J[`hand${side}`].add(blob(skinDark, 0.16, 0.14, 0.2, 0, -0.06, 0.04, 0));
    for (let f = -1; f <= 1; f++) J[`hand${side}`].add(spike(claw, 0.34, 0.035, f * 0.07, -0.12, 0.1, 2.6, 0, f * 0.15, 4));
    // jambes : cuisse épaisse, jarret, sabot fendu
    J[`thigh${side}`].add(limb(skin, P.legUp, P.legR * 1.3, P.legR, 7));
    J[`knee${side}`].add(blob(skinDark, 0.2, 0.2, 0.2, 0, 0, 0.02, 0));
    J[`knee${side}`].add(spike(bone, 0.3, 0.06, 0, 0.02, 0.18, Math.PI / 2.2));
    J[`knee${side}`].add(limb(skin, P.legLow, P.legR, P.legR * 0.7, 7));
    J[`foot${side}`].add(box(skinDark, 0.26, 0.14, 0.44, 0, -0.06, 0.12));
    J[`foot${side}`].add(spike(claw, 0.24, 0.05, -0.08, -0.06, 0.34, Math.PI / 2, 0, 0));
    J[`foot${side}`].add(spike(claw, 0.24, 0.05, 0.08, -0.06, 0.34, Math.PI / 2, 0, 0));
  }
  // queue épineuse
  const tail = horn(skin, 5, 1.1, 0.14, 0.22, 0, 0);
  tail.position.set(0, -0.05, -0.3);
  tail.rotation.set(-2.2, 0, 0);
  J.hips.add(tail);
  root.name = 'diabloRoot';
  return { root, clips: bipedClips(b, P) };
}

/* ------------------------------------------------------------------ */
/* Baal : long spectre d'argent, couronne de longues épines             */
/* ------------------------------------------------------------------ */

function buildBaal() {
  const P = { legUp: 0.95, legLow: 1.0, torsoH: 1.3, torsoW: 0.95, torsoD: 0.5, armUp: 1.15, armLow: 1.3, armR: 0.14, legR: 0.17, headR: 0.24, hunch: 0.25, stance: 0.3, walkAmp: 0.5, armSplay: 0.5 };
  const b = biped(P);
  const { J, root } = b;
  const silver = mat('silver', 0xd6d8e2, { metalness: 0.35, roughness: 0.55 });
  const steel = mat('steel', 0x8e93a4, { metalness: 0.4, roughness: 0.5 });
  const dark = mat('dark', 0x24242e);
  const glow = mat('glow', 0xb01818);
  const eye = mat('eye', 0xff4030);
  J.hips.add(blob(dark, 0.32, 0.25, 0.24, 0, 0.05, 0, 1));
  J.hips.add(box(steel, 0.66, 0.18, 0.4, 0, -0.12, 0));
  J.spine.add(blob(dark, 0.3, 0.42, 0.22, 0, 0.3, 0, 1));
  // cage thoracique argentée, cœur rougeoyant
  J.chest.add(blob(dark, 0.42, 0.55, 0.28, 0, 0.1, 0, 1));
  J.chest.add(blob(glow, 0.16, 0.22, 0.1, 0, 0.16, 0.24, 0));
  for (let i = 0; i < 5; i++) {
    const y = -0.15 + i * 0.16;
    J.chest.add(spike(silver, 0.5 - i * 0.05, 0.05, -0.1, y, 0.22, Math.PI / 2.1, 0, 1.15 - i * 0.05, 4));
    J.chest.add(spike(silver, 0.5 - i * 0.05, 0.05, 0.1, y, 0.22, Math.PI / 2.1, 0, -(1.15 - i * 0.05), 4));
  }
  // dos : éventail d'épines
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 1.9;
    J.chest.add(spike(silver, 1.5 + Math.cos(a * 2) * 0.4, 0.075, Math.sin(a) * 0.3, 0.42, -0.26, -0.55, 0, -a * 1.0));
  }
  // tête : crâne, mâchoire, yeux, couronne de longues épines rayonnantes
  J.head.add(blob(silver, 0.24, 0.3, 0.28, 0, 0.16, 0.04, 1));
  J.head.add(blob(steel, 0.16, 0.1, 0.24, 0, -0.06, 0.14, 0));
  J.head.add(box(eye, 0.09, 0.05, 0.05, -0.12, 0.2, 0.3));
  J.head.add(box(eye, 0.09, 0.05, 0.05, 0.12, 0.2, 0.3));
  for (let i = 0; i < 11; i++) {
    const a = (i / 10 - 0.5) * 2.9;
    const len = 1.05 + Math.cos(a * 1.3) * 0.5;
    J.head.add(spike(silver, len, 0.055, Math.sin(a) * 0.14, 0.42, -0.06, -0.35 - Math.abs(a) * 0.05, 0, -a * 0.55));
  }
  for (const s of [1, -1]) {
    const h = horn(silver, 4, 0.8, 0.07, 0.3, 0, s * 0.2);
    h.position.set(s * 0.18, 0.2, 0.1);
    h.rotation.set(0.7, 0, -s * 0.8);
    J.head.add(h);
  }
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(blob(silver, 0.24, 0.2, 0.24, 0, 0.02, 0, 1));
    for (let i = 0; i < 4; i++) J[`shoulder${side}`].add(spike(silver, 0.7 - i * 0.1, 0.06, s * (0.02 + i * 0.05), 0.16, (i - 1.5) * 0.09, (i - 1.5) * 0.25, 0, -s * (0.4 + i * 0.32)));
    J[`shoulder${side}`].add(limb(steel, P.armUp, 0.12, 0.09, 6));
    J[`elbow${side}`].add(blob(silver, 0.12, 0.12, 0.12, 0, 0, 0, 0));
    J[`elbow${side}`].add(limb(silver, P.armLow, 0.09, 0.06, 6));
    J[`elbow${side}`].add(spike(silver, 0.5, 0.045, s * 0.08, 0.02, 0, 0, 0, -s * 1.25));
    // griffes-lames
    for (let f = -1; f <= 1; f++) J[`hand${side}`].add(spike(steel, 0.55, 0.03, f * 0.05, -0.05, 0.05, 2.7, 0, f * 0.18, 4));
    J[`thigh${side}`].add(limb(steel, P.legUp, 0.16, 0.12, 6));
    J[`knee${side}`].add(blob(silver, 0.14, 0.14, 0.14, 0, 0, 0.03, 0));
    J[`knee${side}`].add(spike(silver, 0.4, 0.05, 0, 0, 0.15, Math.PI / 2.1));
    J[`knee${side}`].add(limb(silver, P.legLow, 0.12, 0.07, 6));
    J[`foot${side}`].add(box(dark, 0.18, 0.1, 0.42, 0, -0.05, 0.12));
    J[`foot${side}`].add(spike(steel, 0.3, 0.04, 0, -0.05, 0.32, Math.PI / 2));
  }
  root.name = 'baalRoot';
  return { root, clips: bipedClips(b, P) };
}

/* ------------------------------------------------------------------ */
/* Seigneur de sang : brute rouge en armure sombre, casque à cornes, masses */
/* ------------------------------------------------------------------ */

function buildBloodLord() {
  const P = { legUp: 0.8, legLow: 0.8, torsoH: 1.05, torsoW: 1.2, torsoD: 0.72, armUp: 0.85, armLow: 0.85, armR: 0.22, legR: 0.26, headR: 0.3, hunch: 0.2, stance: 0.3, walkAmp: 0.5 };
  const b = biped(P);
  const { J, root } = b;
  const skin = mat('skin', 0xb02418);
  const skinDark = mat('skinDark', 0x701410);
  const steel = mat('steel', 0x5a5c68, { metalness: 0.4, roughness: 0.55 });
  const steelDark = mat('steelDark', 0x30323c, { metalness: 0.3 });
  const brass = mat('brass', 0xa88238, { metalness: 0.4, roughness: 0.6 });
  const horn0 = mat('horn', 0xd8cbaa);
  const eye = mat('eye', 0xffd040);
  J.hips.add(blob(skin, 0.55, 0.3, 0.4, 0, 0.05, 0, 1));
  // jupe de mailles et ceinture
  J.hips.add(box(steelDark, 0.9, 0.5, 0.6, 0, -0.32, 0));
  J.hips.add(box(brass, 1.0, 0.14, 0.66, 0, -0.02, 0));
  J.spine.add(blob(skin, 0.52, 0.38, 0.36, 0, 0.3, 0, 1));
  // torse musclé, plastron de plates
  J.chest.add(blob(skin, 0.7, 0.58, 0.46, 0, 0.1, 0, 1));
  J.chest.add(box(steel, 0.86, 0.16, 0.62, 0, 0.34, 0.02));
  J.chest.add(box(steelDark, 0.7, 0.32, 0.18, 0, 0.0, 0.42));
  J.chest.add(box(brass, 0.26, 0.26, 0.06, 0, 0.0, 0.52));
  J.head.add(blob(skin, 0.3, 0.3, 0.32, 0, 0.16, 0.04, 1));
  // casque à cornes et nasal
  J.head.add(blob(steel, 0.34, 0.22, 0.36, 0, 0.3, 0.0, 1));
  J.head.add(box(steelDark, 0.08, 0.3, 0.06, 0, 0.14, 0.32));
  J.head.add(box(eye, 0.08, 0.05, 0.05, -0.13, 0.2, 0.3));
  J.head.add(box(eye, 0.08, 0.05, 0.05, 0.13, 0.2, 0.3));
  for (const s of [1, -1]) {
    const h = horn(horn0, 4, 0.85, 0.09, -0.15, 0, s * 0.3);
    h.position.set(s * 0.3, 0.32, 0);
    h.rotation.set(0.1, 0, -s * 1.15);
    J.head.add(h);
  }
  const weapon = (j, s) => {
    const g = new THREE.Group();
    g.add(taper(steelDark, 0.045, 0.045, 1.0, 6, 0, -0.1, 0));
    const head = blob(steel, 0.2, 0.2, 0.2, 0, 0.98, 0, 0);
    g.add(head);
    for (let i = 0; i < 6; i++) g.add(spike(steel, 0.22, 0.05, Math.cos((i / 6) * TAU) * 0.17, 0.98, Math.sin((i / 6) * TAU) * 0.17, Math.sin((i / 6) * TAU) * 1.2, 0, -Math.cos((i / 6) * TAU) * 1.2));
    g.add(spike(steel, 0.26, 0.06, 0, 1.15, 0));
    g.rotation.set(-1.25, 0, s * 0.05);
    g.position.set(0, -0.08, 0.05);
    J[j].add(g);
  };
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(blob(steel, 0.36, 0.22, 0.36, 0, 0.1, 0, 1));
    J[`shoulder${side}`].add(spike(steel, 0.3, 0.07, s * 0.12, 0.28, 0, 0, 0, -s * 0.5));
    J[`shoulder${side}`].add(limb(skin, P.armUp, P.armR * 1.25, P.armR, 7));
    J[`elbow${side}`].add(blob(steelDark, 0.2, 0.2, 0.2, 0, 0, 0, 0));
    J[`elbow${side}`].add(limb(skin, P.armLow, P.armR, P.armR * 0.8, 7));
    J[`elbow${side}`].add(box(steel, 0.32, 0.3, 0.32, 0, -0.42, 0));
    J[`hand${side}`].add(blob(skinDark, 0.16, 0.14, 0.16, 0, -0.04, 0, 0));
    weapon(`hand${side}`, s);
    J[`thigh${side}`].add(limb(skin, P.legUp, P.legR * 1.3, P.legR, 7));
    J[`knee${side}`].add(blob(steel, 0.22, 0.2, 0.22, 0, 0, 0.03, 0));
    J[`knee${side}`].add(limb(skin, P.legLow, P.legR, P.legR * 0.75, 7));
    J[`knee${side}`].add(box(steelDark, 0.34, 0.4, 0.34, 0, -0.42, 0));
    J[`foot${side}`].add(box(steelDark, 0.32, 0.16, 0.5, 0, -0.06, 0.12));
  }
  root.name = 'bloodRoot';
  return { root, clips: bipedClips(b, P) };
}

/* ------------------------------------------------------------------ */
/* Duriel : insecte-crabe brun-rouge, tête à défenses, pinces           */
/* ------------------------------------------------------------------ */

function buildDuriel() {
  const root = new THREE.Group();
  const J = {};
  const rest = {};
  const shell = mat('shell', 0xa8482a);
  const shellDark = mat('shellDark', 0x5a2214);
  const belly = mat('belly', 0xd88a44);
  const bone = mat('bone', 0xeadfc4);
  const eye = mat('eye', 0xffd040);
  const wing = mat('wing', 0x7a2c18);
  J.body = joint('body', root, 0, 1.75, 0);
  rest.body = [-0.32, 0, 0];
  // abdomen (arrière), thorax, tête
  J.body.add(blob(shell, 0.95, 0.75, 1.3, 0, 0.1, -1.0, 1));
  J.body.add(blob(belly, 0.7, 0.4, 1.0, 0, -0.3, -0.95, 1));
  for (let i = 0; i < 6; i++) J.body.add(box(shellDark, 1.5 - i * 0.16, 0.06, 0.1, 0, 0.62 - i * 0.05, -0.45 - i * 0.34));
  J.body.add(blob(shell, 0.85, 0.7, 0.85, 0, 0.15, 0.0, 1));
  for (let i = 0; i < 5; i++) J.body.add(spike(shellDark, 0.55 - i * 0.05, 0.08, (i - 2) * 0.28, 0.78 - Math.abs(i - 2) * 0.05, -0.05, -0.15, 0, -(i - 2) * 0.14));
  for (let i = 0; i < 6; i++) J.body.add(spike(shellDark, 0.5, 0.07, (i % 2 ? 1 : -1) * 0.3, 0.62, -0.5 - i * 0.28, -0.45, 0, (i % 2 ? -1 : 1) * 0.12));
  // ailes repliées
  for (const s of [1, -1]) {
    const w = blob(wing, 0.1, 0.45, 1.25, s * 0.78, 0.45, -1.0, 0);
    w.rotation.set(-0.15, 0, -s * 0.45);
    J.body.add(w);
  }
  J.head = joint('head', J.body, 0, 0.1, 0.78);
  J.head.add(blob(shell, 0.55, 0.5, 0.6, 0, 0.05, 0.25, 1));
  J.head.add(blob(shellDark, 0.4, 0.22, 0.4, 0, -0.22, 0.42, 0));
  J.head.add(box(eye, 0.14, 0.08, 0.06, -0.26, 0.2, 0.7));
  J.head.add(box(eye, 0.14, 0.08, 0.06, 0.26, 0.2, 0.7));
  for (const s of [1, -1]) {
    const t = horn(bone, 5, 1.15, 0.13, 0.42, 0, -s * 0.18);
    t.position.set(s * 0.26, -0.15, 0.6);
    t.rotation.set(-1.0, 0, -s * 0.5);
    J.head.add(t);
    const m = horn(bone, 3, 0.5, 0.07, 0.6, 0, s * 0.3);
    m.position.set(s * 0.15, -0.3, 0.7);
    m.rotation.set(-1.5, 0, s * 0.5);
    J.head.add(m);
    const h = horn(bone, 4, 0.9, 0.11, -0.25, 0, s * 0.2);
    h.position.set(s * 0.3, 0.4, 0.15);
    h.rotation.set(-0.2, 0, -s * 0.9);
    J.head.add(h);
  }
  J.head.add(spike(bone, 0.6, 0.11, 0, 0.5, 0.3, -0.3));
  // six pattes à trois segments + deux bras à pinces
  const leg = (name, side, i) => {
    const s = side > 0 ? 1 : -1;
    const z = 0.35 - i * 0.62;
    J[`${name}0`] = joint(`${name}0`, J.body, s * 0.62, -0.1, z);
    rest[`${name}0`] = [0, 0, s * 0.55];
    J[`${name}1`] = joint(`${name}1`, J[`${name}0`], 0, -0.95, 0);
    rest[`${name}1`] = [0, 0, -s * 0.9];
    J[`${name}2`] = joint(`${name}2`, J[`${name}1`], 0, -1.05, 0);
    rest[`${name}2`] = [0, 0, s * 0.55];
    J[`${name}0`].add(limb(shell, 0.95, 0.14, 0.1, 5));
    J[`${name}1`].add(blob(shellDark, 0.13, 0.13, 0.13, 0, 0, 0, 0));
    J[`${name}1`].add(limb(shell, 1.05, 0.1, 0.06, 5));
    J[`${name}2`].add(spike(bone, 0.3, 0.05, 0, -0.2, 0, Math.PI, 0, 0));
    J[`${name}0`].add(spike(shellDark, 0.28, 0.05, 0, 0.0, -0.1, -0.4, 0, 0));
  };
  for (let i = 0; i < 3; i++) {
    leg(`legL${i}`, 1, i);
    leg(`legR${i}`, -1, i);
  }
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`arm${side}`] = joint(`arm${side}`, J.body, s * 0.7, 0.35, 0.55);
    rest[`arm${side}`] = [-0.9, 0, s * 0.2];
    J[`fore${side}`] = joint(`fore${side}`, J[`arm${side}`], 0, -0.8, 0);
    rest[`fore${side}`] = [-0.6, 0, 0];
    J[`arm${side}`].add(limb(shell, 0.8, 0.16, 0.13, 6));
    J[`fore${side}`].add(blob(shellDark, 0.17, 0.17, 0.17, 0, 0, 0, 0));
    J[`fore${side}`].add(limb(shell, 0.8, 0.13, 0.11, 6));
    J[`fore${side}`].add(blob(shell, 0.2, 0.28, 0.16, 0, -0.9, 0.02, 0));
    J[`fore${side}`].add(spike(bone, 0.5, 0.07, -0.08, -0.92, 0.05, Math.PI * 0.94, 0, 0.1));
    J[`fore${side}`].add(spike(bone, 0.5, 0.07, 0.08, -0.92, 0.05, Math.PI * 0.94, 0, -0.1));
  }
  const clips = [];
  const legs = ['legL0', 'legL1', 'legL2', 'legR0', 'legR1', 'legR2'];
  const walkLegs = (p, ph, amp) => {
    legs.forEach((l, i) => {
      const grp = (i % 3 === 1) === i < 3 ? 0 : Math.PI;
      const sw = Math.sin(ph + grp);
      p.r(`${l}0`, sw * amp, 0, 0);
      p.r(`${l}1`, Math.max(0, Math.cos(ph + grp)) * amp * 0.6, 0, 0);
    });
  };
  clips.push(
    makeClip(
      'Idle',
      1.8,
      9,
      J,
      rest,
      (u, p) => {
        const s = Math.sin(u * TAU);
        p.p('body', 0, s * 0.03, 0);
        p.r('head', s * 0.05, Math.sin(u * TAU * 2) * 0.08, 0);
        p.r('armL', 0, 0, s * 0.06);
        p.r('armR', 0, 0, -s * 0.06);
        p.r('foreL', s * 0.08, 0, 0);
        p.r('foreR', -s * 0.08, 0, 0);
      },
      true,
    ),
  );
  clips.push(
    makeClip(
      'Walk',
      0.8,
      9,
      J,
      rest,
      (u, p) => {
        walkLegs(p, u * TAU, 0.42);
        p.p('body', 0, -Math.abs(Math.sin(u * TAU)) * 0.05, 0);
        p.r('body', 0, Math.sin(u * TAU) * 0.05, 0);
        p.r('armL', Math.sin(u * TAU) * 0.2, 0, 0);
        p.r('armR', -Math.sin(u * TAU) * 0.2, 0, 0);
      },
      true,
    ),
  );
  clips.push(
    makeClip(
      'Attack',
      0.8,
      13,
      J,
      rest,
      (u, p) => {
        const wind = smooth(0, 0.4, u);
        const hit = smooth(0.4, 0.55, u);
        const back = smooth(0.6, 1, u);
        const k = wind * (1 - hit);
        const h = hit * (1 - back);
        p.r('armL', -0.9 * k + 0.7 * h, 0, 0);
        p.r('armR', -0.9 * k + 0.7 * h, 0, 0);
        p.r('foreL', -0.6 * k + 0.5 * h, 0, 0);
        p.r('foreR', -0.6 * k + 0.5 * h, 0, 0);
        p.r('body', -0.25 * k + 0.2 * h, 0, 0);
        p.r('head', -0.3 * k + 0.35 * h, 0, 0);
        p.p('body', 0, 0.12 * k, 0.55 * h);
      },
      false,
    ),
  );
  clips.push(
    makeClip(
      'Cast',
      0.8,
      11,
      J,
      rest,
      (u, p) => {
        const up = smooth(0, 0.45, u) * (1 - smooth(0.8, 1, u));
        p.r('armL', -0.8 * up, 0, 0.4 * up);
        p.r('armR', -0.8 * up, 0, -0.4 * up);
        p.r('head', -0.3 * up, 0, 0);
        p.r('body', -0.3 * up, 0, 0);
        p.p('body', 0, 0.2 * up, 0);
      },
      false,
    ),
  );
  clips.push(
    makeClip(
      'Hit',
      0.32,
      5,
      J,
      rest,
      (u, p) => {
        const k = Math.sin(u * Math.PI);
        p.r('body', -0.18 * k, 0, 0);
        p.r('head', -0.25 * k, 0, 0);
        p.p('body', 0, 0, -0.2 * k);
      },
      false,
    ),
  );
  clips.push(
    makeClip(
      'Death',
      1.2,
      13,
      J,
      rest,
      (u, p) => {
        const f = smooth(0.05, 0.75, u);
        p.p('body', 0, -0.8 * f, -0.2 * f);
        p.r('body', 0.25 * f, 0, 0);
        legs.forEach((l, i) => {
          p.r(`${l}0`, 0, 0, (i < 3 ? -1 : 1) * 0.9 * f);
          p.r(`${l}1`, 0, 0, (i < 3 ? 1 : -1) * 0.7 * f);
        });
        p.r('armL', 0.5 * f, 0, 0.5 * f);
        p.r('armR', 0.5 * f, 0, -0.5 * f);
        p.r('head', 0.4 * f, 0, 0);
      },
      false,
    ),
  );
  applyRest(J, rest);
  root.name = 'durielRoot';
  return { root, clips, J, rest };
}

const BUILDERS = { diablo: buildDiablo, baal: buildBaal, blood_lord: buildBloodLord, duriel: buildDuriel, ...CROWD, ...DRUIDS, ...HEROES, ...BOSSES };

export function buildProcedural(name) {
  const f = BUILDERS[name];
  if (!f) throw new Error(`Créature procédurale inconnue : ${name}`);
  const r = f();
  return { root: r.root, clips: r.clips };
}
