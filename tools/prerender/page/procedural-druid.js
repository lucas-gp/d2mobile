/**
 * Créatures du Druide et de la Sorcière : loup-garou, ours-garou, loup, corbeau, Hydre.
 * D'après les images D2 (loup-garou gris à museau long, ours-garou brun massif, Hydre à trois
 * têtes de serpent de feu). Socle : proc-kit.js.
 */
import * as THREE from 'three';
import { TAU, mat, blob, taper, spike, limb, box, horn, joint, applyRest, makeClip, smooth, biped, bipedClips, humanoidBody } from './proc-kit.js';

const P0 = (o) => ({ legUp: 0.8, legLow: 0.8, torsoH: 1.0, torsoW: 0.8, torsoD: 0.5, armUp: 0.7, armLow: 0.7, armR: 0.13, legR: 0.15, headR: 0.24, hunch: 0.5, stance: 0.3, ...o });

/* ------------------------------------------------------------------ */
/* Loup-garou / ours-garou (bipèdes à tête de bête)                     */
/* ------------------------------------------------------------------ */

function beastMan(name, o) {
  const P = P0(o.P);
  const b = biped(P);
  const { J, rest } = b;
  const fur = mat('fur', o.fur);
  const fur2 = mat('fur2', o.fur2);
  const belly = mat('belly', o.belly);
  const claw = mat('claw', 0xe8e0c8);
  const eye = mat('eye', o.eye);
  const nose = mat('nose', 0x1c1614);
  humanoidBody(b, P, { skin: fur, skin2: fur2, cloth: fur, boot: fur2 });
  J.chest.add(blob(belly, P.torsoW * 0.32, P.torsoH * 0.28, P.torsoD * 0.4, 0, 0.05, P.torsoD * 0.32, 0));
  const hr = P.headR;
  // museau, truffe, oreilles, crocs
  J.head.add(blob(fur, hr * 0.62, hr * 0.55, hr * o.snout * 1.15, 0, hr * 0.55, hr * (0.6 + o.snout * 0.6), 1));
  J.head.add(blob(fur2, hr * 1.05, hr * 0.5, hr * 0.6, 0, hr * 1.35, hr * 0.15, 0));
  J.head.add(blob(nose, hr * 0.2, hr * 0.16, hr * 0.16, 0, hr * 0.62, hr * (0.8 + o.snout * 1.1), 0));
  J.head.add(blob(fur2, hr * 0.42, hr * 0.15, hr * o.snout * 0.9, 0, hr * 0.2, hr * (0.55 + o.snout * 0.4), 0));
  for (const s of [1, -1]) {
    J.head.add(box(eye, hr * 0.22, hr * 0.12, hr * 0.16, s * hr * 0.4, hr * 1.05, hr * 0.85));
    J.head.add(spike(fur2, hr * o.ear, hr * 0.3, s * hr * 0.55, hr * 1.5, -hr * 0.1, -0.2, 0, -s * 0.35, 4));
    J.head.add(spike(claw, hr * 0.4, hr * 0.06, s * hr * 0.28, hr * 0.28, hr * (0.7 + o.snout * 0.7), Math.PI, 0, 0, 4));
  }
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(blob(fur, P.armR * 1.15, P.armR * 1.0, P.armR * 1.15, 0, -0.02, 0, 1));
    J[`elbow${side}`].add(blob(fur2, P.armR * 1.1, P.armR * 1.1, P.armR * 1.1, 0, 0, 0, 0));
    J[`hand${side}`].add(blob(fur2, P.armR * 1.0, P.armR * 1.1, P.armR * 0.9, 0, -0.08, 0.03, 0));
    for (let f = -1; f <= 1; f++) J[`hand${side}`].add(spike(claw, 0.28, 0.03, f * 0.07, -0.14, 0.09, 2.7, 0, f * 0.15, 4));
    J[`foot${side}`].add(spike(claw, 0.18, 0.04, 0, -0.06, P.legR * 2.6, Math.PI / 2, 0, 0, 4));
  }
  if (o.tail) {
    const t = horn(fur2, 4, 0.7, 0.1, 0.35, 0, 0);
    t.position.set(0, -0.1, -0.3);
    t.rotation.set(-2.5, 0, 0);
    J.hips.add(t);
  }
  rest.shoulderL = [-0.35, 0, -0.32];
  rest.shoulderR = [-0.35, 0, 0.32];
  applyRest(J, rest);
  b.root.name = name;
  return { root: b.root, clips: bipedClips(b, P) };
}

function buildWerewolf() {
  return beastMan('werewolfRoot', {
    P: { legUp: 0.85, legLow: 0.85, torsoH: 1.0, torsoW: 0.82, torsoD: 0.5, armUp: 0.75, armLow: 0.75, armR: 0.12, legR: 0.13, headR: 0.3, hunch: 0.55, stance: 0.28 },
    fur: 0x8a8478,
    fur2: 0x5c564c,
    belly: 0xc8c0ae,
    eye: 0xffc040,
    snout: 0.9,
    ear: 1.0,
    tail: true,
  });
}

function buildWerebear() {
  return beastMan('werebearRoot', {
    P: { legUp: 0.7, legLow: 0.7, torsoH: 1.2, torsoW: 1.3, torsoD: 0.8, armUp: 0.8, armLow: 0.8, armR: 0.2, legR: 0.23, headR: 0.36, hunch: 0.5, stance: 0.3, walkAmp: 0.45 },
    fur: 0x7a5232,
    fur2: 0x4e3320,
    belly: 0x9a7048,
    eye: 0xffb040,
    snout: 0.55,
    ear: 0.5,
    tail: false,
  });
}

/* ------------------------------------------------------------------ */
/* Quadrupède : loup                                                    */
/* ------------------------------------------------------------------ */

function buildWolf() {
  const root = new THREE.Group();
  const J = {};
  const rest = {};
  const fur = mat('fur', 0x8e8e90);
  const light = mat('light', 0xcfcfd0);
  const dark = mat('dark', 0x4a4a4e);
  const eye = mat('eye', 0xffd040);
  const legLen = 0.75;
  J.body = joint('body', root, 0, legLen + 0.15, 0);
  J.body.add(blob(fur, 0.34, 0.3, 0.72, 0, 0, -0.05, 1));
  J.body.add(blob(fur, 0.4, 0.36, 0.42, 0, 0.04, 0.42, 1));
  J.body.add(blob(light, 0.26, 0.16, 0.6, 0, -0.16, 0.05, 0));
  for (let i = 0; i < 4; i++) J.body.add(spike(dark, 0.22, 0.05, 0, 0.3, 0.55 - i * 0.28, -0.25, 0, 0, 4));
  J.neck = joint('neck', J.body, 0, 0.12, 0.72);
  rest.neck = [-0.25, 0, 0];
  J.head = joint('head', J.neck, 0, 0.1, 0.18);
  J.head.add(blob(fur, 0.22, 0.2, 0.26, 0, 0, 0.05, 1));
  J.head.add(blob(light, 0.14, 0.11, 0.26, 0, -0.06, 0.34, 1));
  J.head.add(blob(dark, 0.06, 0.05, 0.05, 0, -0.03, 0.6, 0));
  for (const s of [1, -1]) {
    J.head.add(box(eye, 0.06, 0.04, 0.04, s * 0.11, 0.06, 0.24));
    J.head.add(spike(fur, 0.24, 0.07, s * 0.13, 0.15, -0.06, -0.15, 0, -s * 0.2, 4));
  }
  J.tail = joint('tail', J.body, 0, 0.05, -0.72);
  rest.tail = [-1.0, 0, 0];
  J.tail.add(blob(fur, 0.09, 0.09, 0.36, 0, 0, -0.2, 0));
  const legs = [];
  for (const [n, x, z] of [
    ['FL', 0.24, 0.45],
    ['FR', -0.24, 0.45],
    ['BL', 0.22, -0.5],
    ['BR', -0.22, -0.5],
  ]) {
    legs.push(n);
    J[`up${n}`] = joint(`up${n}`, J.body, x, -0.1, z);
    rest[`up${n}`] = [n[0] === 'B' ? 0.3 : -0.1, 0, 0];
    J[`lo${n}`] = joint(`lo${n}`, J[`up${n}`], 0, -0.38, 0);
    rest[`lo${n}`] = [n[0] === 'B' ? -0.5 : 0.15, 0, 0];
    J[`up${n}`].add(limb(fur, 0.38, 0.1, 0.07, 5));
    J[`lo${n}`].add(limb(fur, 0.4, 0.07, 0.045, 5));
    J[`lo${n}`].add(box(dark, 0.09, 0.05, 0.16, 0, -0.4, 0.04));
  }
  applyRest(J, rest);
  const gait = (p, ph, amp) =>
    legs.forEach((n, i) => {
      const off = i === 0 || i === 3 ? 0 : Math.PI;
      p.r(`up${n}`, Math.sin(ph + off) * amp, 0, 0);
      p.r(`lo${n}`, Math.max(0, Math.cos(ph + off)) * amp * 0.9, 0, 0);
    });
  const clips = [
    makeClip(
      'Idle',
      1.6,
      9,
      J,
      rest,
      (u, p) => {
        const s = Math.sin(u * TAU);
        p.r('head', s * 0.05, Math.sin(u * TAU * 2) * 0.1, 0);
        p.r('tail', 0, s * 0.3, 0);
        p.p('body', 0, s * 0.01, 0);
      },
      true,
    ),
    makeClip(
      'Walk',
      0.55,
      9,
      J,
      rest,
      (u, p) => {
        gait(p, u * TAU, 0.75);
        p.p('body', 0, Math.abs(Math.sin(u * TAU)) * 0.06, 0);
        p.r('body', Math.sin(u * TAU * 2) * 0.05, 0, 0);
        p.r('tail', 0, Math.sin(u * TAU) * 0.4, 0);
      },
      true,
    ),
    makeClip(
      'Attack',
      0.7,
      11,
      J,
      rest,
      (u, p) => {
        const k = smooth(0, 0.35, u) * (1 - smooth(0.35, 0.5, u));
        const h = smooth(0.35, 0.5, u) * (1 - smooth(0.6, 1, u));
        p.r('body', -0.2 * k + 0.1 * h, 0, 0);
        p.p('body', 0, 0.06 * k, 0.55 * h - 0.15 * k);
        p.r('neck', -0.3 * k + 0.5 * h, 0, 0);
        p.r('head', 0.3 * h, 0, 0);
      },
      false,
    ),
    makeClip(
      'Hit',
      0.32,
      5,
      J,
      rest,
      (u, p) => {
        const k = Math.sin(u * Math.PI);
        p.r('body', -0.2 * k, 0, 0);
        p.p('body', 0, 0, -0.15 * k);
      },
      false,
    ),
    makeClip(
      'Death',
      1.0,
      11,
      J,
      rest,
      (u, p) => {
        const f = smooth(0.05, 0.6, u);
        p.r('body', 0, 0, 1.45 * f);
        p.p('body', 0, -(legLen * 0.75) * f, 0);
        legs.forEach((n) => p.r(`up${n}`, 0.5 * f, 0, 0));
        p.r('head', 0.3 * f, 0, 0);
      },
      false,
    ),
  ];
  root.name = 'wolfRoot';
  return { root, clips };
}

/* ------------------------------------------------------------------ */
/* Corbeau                                                              */
/* ------------------------------------------------------------------ */

function buildRaven() {
  const root = new THREE.Group();
  const J = {};
  const rest = {};
  const black = mat('black', 0x2a2a34);
  const sheen = mat('sheen', 0x4a4a5c);
  const beak = mat('beak', 0x9a9a8a);
  J.body = joint('body', root, 0, 0.42, 0);
  J.body.add(blob(black, 0.2, 0.18, 0.3, 0, 0, 0, 1));
  J.body.add(blob(sheen, 0.16, 0.12, 0.22, 0, 0.08, -0.02, 0));
  J.head = joint('head', J.body, 0, 0.14, 0.24);
  J.head.add(blob(black, 0.11, 0.11, 0.12, 0, 0.03, 0.02, 1));
  J.head.add(spike(beak, 0.2, 0.05, 0, 0.0, 0.1, Math.PI / 2, 0, 0, 4));
  J.head.add(box(mat('eye', 0xe8e0a0), 0.03, 0.03, 0.03, 0.07, 0.06, 0.08));
  J.head.add(box(mat('eye', 0xe8e0a0), 0.03, 0.03, 0.03, -0.07, 0.06, 0.08));
  J.tail = joint('tail', J.body, 0, 0, -0.28);
  rest.tail = [0.3, 0, 0];
  J.tail.add(box(black, 0.14, 0.03, 0.34, 0, 0, -0.14));
  for (const s of [1, -1]) {
    const n = s > 0 ? 'L' : 'R';
    J[`wing${n}`] = joint(`wing${n}`, J.body, s * 0.16, 0.06, 0.02);
    rest[`wing${n}`] = [0, 0, -s * 0.5];
    J[`wing${n}`].add(box(black, 0.5, 0.04, 0.34, s * 0.25, 0, -0.06));
    J[`wing${n}`].add(spike(sheen, 0.34, 0.05, s * 0.5, 0, -0.06, -Math.PI / 2, 0, (s * Math.PI) / 2, 4));
    J[`leg${n}`] = joint(`leg${n}`, J.body, s * 0.08, -0.14, 0.02);
    J[`leg${n}`].add(limb(beak, 0.24, 0.02, 0.015, 4));
    J[`leg${n}`].add(box(beak, 0.06, 0.02, 0.12, 0, -0.24, 0.04));
  }
  applyRest(J, rest);
  const clips = [
    makeClip(
      'Idle',
      1.0,
      9,
      J,
      rest,
      (u, p) => {
        const s = Math.sin(u * TAU);
        p.r('head', 0, Math.sin(u * TAU * 2) * 0.35, 0);
        p.p('body', 0, s * 0.012, 0);
      },
      true,
    ),
    makeClip(
      'Walk',
      0.5,
      9,
      J,
      rest,
      (u, p) => {
        const s = Math.sin(u * TAU);
        p.p('body', 0, Math.abs(s) * 0.05, 0);
        p.r('legL', s * 0.6, 0, 0);
        p.r('legR', -s * 0.6, 0, 0);
        p.r('head', 0, 0, 0);
        p.r('wingL', 0, 0, -0.3 * s);
        p.r('wingR', 0, 0, 0.3 * s);
      },
      true,
    ),
    makeClip(
      'Attack',
      0.5,
      9,
      J,
      rest,
      (u, p) => {
        const k = smooth(0, 0.4, u) * (1 - smooth(0.4, 0.5, u));
        const h = smooth(0.4, 0.5, u) * (1 - smooth(0.6, 1, u));
        p.r('body', -0.4 * k + 0.5 * h, 0, 0);
        p.p('body', 0, 0, 0.3 * h);
        p.r('wingL', 0, 0, -0.8 * (k + h));
        p.r('wingR', 0, 0, 0.8 * (k + h));
      },
      false,
    ),
    makeClip('Hit', 0.3, 5, J, rest, (u, p) => p.r('body', -0.3 * Math.sin(u * Math.PI), 0, 0), false),
    makeClip(
      'Death',
      0.8,
      9,
      J,
      rest,
      (u, p) => {
        const f = smooth(0.05, 0.7, u);
        p.r('body', 0, 0, 2.6 * f);
        p.p('body', 0, -0.3 * f, 0);
        p.r('wingL', 0, 0, -0.6 * f);
        p.r('wingR', 0, 0, 0.6 * f);
      },
      false,
    ),
  ];
  root.name = 'ravenRoot';
  return { root, clips };
}

/* ------------------------------------------------------------------ */
/* Hydre (Sorcière) : trois têtes de serpent de feu sur un foyer        */
/* ------------------------------------------------------------------ */

function buildHydra() {
  const root = new THREE.Group();
  const J = {};
  const rest = {};
  const scale = mat('scale', 0xd8501a);
  const belly = mat('belly', 0xf0a040);
  const fire = mat('fire', 0xffd050);
  const dark = mat('dark', 0x6a1e0a);
  J.base = joint('base', root, 0, 0.1, 0);
  J.base.add(blob(dark, 0.55, 0.16, 0.55, 0, 0.02, 0, 1));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    J.base.add(spike(fire, 0.45 + (i % 3) * 0.12, 0.09, Math.cos(a) * 0.36, 0.06, Math.sin(a) * 0.36, 0, 0, 0, 4));
  }
  const heads = [
    [0, 0.12, 0.0],
    [0.34, 0.1, -0.2],
    [-0.34, 0.1, -0.2],
  ];
  const seg = 4;
  heads.forEach(([x, y, z], h) => {
    let parent = joint(`n${h}0`, J.base, x, y, z);
    J[`n${h}0`] = parent;
    rest[`n${h}0`] = [-0.1, 0, h === 0 ? 0 : (h === 1 ? -1 : 1) * 0.35];
    for (let i = 0; i < seg; i++) {
      const r0 = 0.15 - i * 0.02;
      parent.add(taper(i % 2 ? belly : scale, r0, r0 - 0.02, 0.36, 6));
      const next = joint(`n${h}${i + 1}`, parent, 0, 0.36, 0);
      J[`n${h}${i + 1}`] = next;
      rest[`n${h}${i + 1}`] = [0.28, 0, 0];
      parent = next;
    }
    // tête de serpent : crâne, mâchoire, crocs, yeux, crête
    const head = new THREE.Group();
    head.add(blob(scale, 0.14, 0.11, 0.2, 0, 0.06, 0.1, 1));
    head.add(blob(belly, 0.1, 0.05, 0.16, 0, -0.02, 0.14, 0));
    head.add(spike(fire, 0.12, 0.02, 0.05, -0.02, 0.26, Math.PI, 0, 0, 3));
    head.add(spike(fire, 0.12, 0.02, -0.05, -0.02, 0.26, Math.PI, 0, 0, 3));
    head.add(box(mat('eye', 0xffffff), 0.05, 0.03, 0.03, 0.08, 0.1, 0.2));
    head.add(box(mat('eye', 0xffffff), 0.05, 0.03, 0.03, -0.08, 0.1, 0.2));
    for (let i = 0; i < 3; i++) head.add(spike(fire, 0.18 - i * 0.03, 0.03, 0, 0.16, -0.02 - i * 0.07, -0.6, 0, 0, 3));
    head.rotation.x = -0.2;
    parent.add(head);
  });
  applyRest(J, rest);
  const sway = (p, u, amp, lunge = 0) => {
    for (let h = 0; h < 3; h++) {
      const ph = u * TAU + h * 2.1;
      for (let i = 0; i <= seg; i++) p.r(`n${h}${i}`, Math.sin(ph - i * 0.6) * amp * 0.5 - lunge * 0.4, Math.sin(ph * 0.5 + i) * amp * 0.5, Math.cos(ph - i * 0.5) * amp * 0.35);
    }
  };
  const clips = [
    makeClip('Idle', 1.6, 9, J, rest, (u, p) => sway(p, u, 0.35), true),
    makeClip(
      'Attack',
      0.6,
      9,
      J,
      rest,
      (u, p) => {
        const k = smooth(0, 0.4, u) * (1 - smooth(0.4, 0.55, u));
        const h = smooth(0.4, 0.55, u) * (1 - smooth(0.6, 1, u));
        sway(p, u, 0.2, -k * 1.4 + h * 2.2);
      },
      false,
    ),
    makeClip(
      'Death',
      0.8,
      9,
      J,
      rest,
      (u, p) => {
        const f = smooth(0.05, 0.8, u);
        for (let h = 0; h < 3; h++) for (let i = 0; i <= seg; i++) p.r(`n${h}${i}`, 0.9 * f, 0, 0);
        p.p('base', 0, -0.1 * f, 0);
      },
      false,
    ),
  ];
  root.name = 'hydraRoot';
  return { root, clips };
}

export const DRUIDS = {
  werewolf: buildWerewolf,
  werebear: buildWerebear,
  wolf: buildWolf,
  raven: buildRaven,
  hydra: buildHydra,
};
