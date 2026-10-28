/**
 * Socle des créatures procédurales : briques géométriques, squelette de nœuds, clips, bipède.
 * Les modèles libres (CC0) sont trop arrondis pour ces monstres ; on les construit donc ici, en
 * géométrie facettée (ombrage plat, pointes, cornes courbes, plaques) d'après les images de
 * Diablo II (ASSETS.md § 0, docs/internal/DIRECTION-ARTISTIQUE.md § 13). Chaque créature est une hiérarchie de
 * nœuds nommés + de vrais AnimationClip Three.js (Idle, Walk, Attack, Cast, Hit, Death) : le reste
 * de la chaîne (pose, mesure, rendu, ombre) fonctionne comme pour un glTF.
 * Repère : la créature regarde vers +Z, Y en haut. Le rendu est mis à l'échelle par `cfg.height`.
 */
import * as THREE from 'three';

export const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Briques                                                             */
/* ------------------------------------------------------------------ */

export function mat(name, color, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, metalness: 0, ...o });
  m.name = name;
  return m;
}

export function mesh(geo, m, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  o.castShadow = true;
  return o;
}

/** Ellipsoïde facettée (icosaèdre étiré) */
export function blob(m, rx, ry, rz, x = 0, y = 0, z = 0, detail = 1) {
  return mesh(new THREE.IcosahedronGeometry(1, detail), m, x, y, z, rx, ry, rz);
}

/** Tronc de cône facetté ; base en y = 0, sommet en y = h */
export function taper(m, rBase, rTop, h, sides = 6, x = 0, y = 0, z = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBase, h, sides);
  g.translate(0, h / 2, 0);
  return mesh(g, m, x, y, z);
}

/** Pointe (cône) qui part de (x, y, z) vers +Y ; orientée par (rx, ry, rz) */
export function spike(m, len, r, x, y, z, rx = 0, ry = 0, rz = 0, sides = 4) {
  const o = taper(m, r, 0.001, len, sides, x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}

/** Segment de membre suspendu au nœud (pend vers −Y) */
export function limb(m, len, r0, r1, sides = 6) {
  const g = new THREE.CylinderGeometry(r0, r1, len, sides);
  g.translate(0, -len / 2, 0);
  return mesh(g, m);
}

export function box(m, w, h, d, x = 0, y = 0, z = 0) {
  return mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);
}

/** Corne / pointe courbe : chaîne de troncs de cône, chaque maillon plié de (bx, by, bz) */
export function horn(m, segs, len, r, bx, by, bz, sides = 5) {
  const top = new THREE.Group();
  let parent = top;
  const step = len / segs;
  for (let i = 0; i < segs; i++) {
    const r0 = r * (1 - i / segs);
    const r1 = r * (1 - (i + 1) / segs) + 0.002;
    parent.add(taper(m, r0, r1, step * 1.08, sides));
    const next = new THREE.Group();
    next.position.y = step;
    next.rotation.set(bx, by, bz);
    parent.add(next);
    parent = next;
  }
  return top;
}

export function joint(name, parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** Pose de repos appliquée aux nœuds (les joints non animés par un clip gardent leur pose) */
export function applyRest(J, rest) {
  for (const [j, r] of Object.entries(rest)) {
    J[j].rotation.order = 'YXZ';
    J[j].rotation.set(r[0], r[1], r[2]);
  }
}

/* ------------------------------------------------------------------ */
/* Animation : clips générés par échantillonnage                        */
/* ------------------------------------------------------------------ */

const E = new THREE.Euler();
const Q = new THREE.Quaternion();

/**
 * fn(u, pose) : u ∈ [0, 1] ; pose.r(joint, rx, ry, rz) ajoute une rotation à la pose de repos,
 * pose.p(joint, dx, dy, dz) un décalage de position. Renvoie un AnimationClip échantillonné.
 */
export function makeClip(name, duration, keys, J, rest, fn, loop) {
  const times = [];
  const rot = new Map();
  const pos = new Map();
  const n = loop ? keys : keys - 1;
  // toutes les articulations à pose de repos sont pilotées à chaque clé (jamais de pose incohérente)
  const allRot = new Set(Object.keys(rest));
  for (let k = 0; k < keys; k++) {
    const u = k / n;
    times.push(u * duration);
    const accR = {};
    const accP = {};
    fn(u, {
      r: (j, x = 0, y = 0, z = 0) => {
        const a = (accR[j] ??= [0, 0, 0]);
        a[0] += x;
        a[1] += y;
        a[2] += z;
      },
      p: (j, x = 0, y = 0, z = 0) => {
        const a = (accP[j] ??= [0, 0, 0]);
        a[0] += x;
        a[1] += y;
        a[2] += z;
      },
    });
    for (const j of new Set([...allRot, ...Object.keys(accR)])) {
      const b = rest[j] ?? [0, 0, 0];
      const d = accR[j] ?? [0, 0, 0];
      E.set(b[0] + d[0], b[1] + d[1], b[2] + d[2], 'YXZ');
      Q.setFromEuler(E);
      if (!rot.has(j)) rot.set(j, []);
      rot.get(j).push(Q.x, Q.y, Q.z, Q.w);
    }
    for (const j of Object.keys(accP)) {
      const b = J[j].position;
      const d = accP[j];
      if (!pos.has(j)) pos.set(j, []);
      pos.get(j).push(b.x + d[0], b.y + d[1], b.z + d[2]);
    }
  }
  const tracks = [];
  for (const [j, v] of rot) tracks.push(new THREE.QuaternionKeyframeTrack(`${j}.quaternion`, times, v));
  for (const [j, v] of pos) tracks.push(new THREE.VectorKeyframeTrack(`${j}.position`, times, v));
  return new THREE.AnimationClip(name, duration, tracks);
}

export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ */
/* Bipède (Diablo, Baal, Seigneur de sang)                              */
/* ------------------------------------------------------------------ */

/**
 * P : { legUp, legLow, torsoH, torsoW, torsoD, armUp, armLow, armR, legR, headR, hunch, stance,
 *       skin, dark } ; renvoie { root, J, rest }
 */
export function biped(P) {
  const root = new THREE.Group();
  const J = {};
  const rest = {};
  const hipsY = P.legUp + P.legLow;
  J.hips = joint('hips', root, 0, hipsY, 0);
  J.spine = joint('spine', J.hips, 0, 0.05, 0);
  rest.spine = [P.hunch * 0.35, 0, 0];
  J.chest = joint('chest', J.spine, 0, P.torsoH * 0.45, 0);
  rest.chest = [P.hunch * 0.65, 0, 0];
  J.neck = joint('neck', J.chest, 0, P.torsoH * 0.55, P.torsoD * 0.1);
  rest.neck = [-P.hunch * 0.6, 0, 0];
  J.head = joint('head', J.neck, 0, 0.08, 0.05);
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`] = joint(`shoulder${side}`, J.chest, s * (P.torsoW * 0.5 + P.armR * 0.5), P.torsoH * 0.42, 0);
    rest[`shoulder${side}`] = [0, 0, -s * (P.armSplay ?? 0.14)];
    J[`elbow${side}`] = joint(`elbow${side}`, J[`shoulder${side}`], 0, -P.armUp, 0);
    rest[`elbow${side}`] = [-0.25, 0, 0];
    J[`hand${side}`] = joint(`hand${side}`, J[`elbow${side}`], 0, -P.armLow, 0);
    J[`thigh${side}`] = joint(`thigh${side}`, J.hips, s * P.torsoW * P.stance, -0.05, 0);
    rest[`thigh${side}`] = [-0.12, 0, s * 0.05];
    J[`knee${side}`] = joint(`knee${side}`, J[`thigh${side}`], 0, -P.legUp, 0);
    rest[`knee${side}`] = [0.42, 0, 0];
    J[`foot${side}`] = joint(`foot${side}`, J[`knee${side}`], 0, -P.legLow, 0);
    rest[`foot${side}`] = [-0.3, 0, 0];
  }
  applyRest(J, rest);
  return { root, J, rest };
}

export function bipedClips(b, P) {
  const { J, rest } = b;
  const clips = [];
  const w = P.walkAmp ?? 0.62;
  clips.push(
    makeClip(
      'Idle',
      1.6,
      9,
      J,
      rest,
      (u, p) => {
        const s = Math.sin(u * TAU);
        p.r('chest', s * 0.03, 0, 0);
        p.r('head', -s * 0.03, Math.sin(u * TAU * 2) * 0.05, 0);
        p.r('shoulderL', s * 0.05, 0, s * 0.03);
        p.r('shoulderR', -s * 0.04, 0, -s * 0.03);
        p.p('hips', 0, s * 0.012, 0);
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
        const ph = u * TAU;
        const s = Math.sin(ph);
        const c = Math.cos(ph);
        p.r('thighL', -s * w, 0, 0);
        p.r('thighR', s * w, 0, 0);
        p.r('kneeL', Math.max(0, c) * 0.7, 0, 0);
        p.r('kneeR', Math.max(0, -c) * 0.7, 0, 0);
        p.r('shoulderL', s * 0.45, 0, 0);
        p.r('shoulderR', -s * 0.45, 0, 0);
        p.r('chest', 0, s * 0.12, 0);
        p.r('spine', 0, -s * 0.06, 0);
        p.p('hips', 0, -Math.abs(s) * 0.05, 0);
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
        const wind = smooth(0, 0.42, u);
        const hit = smooth(0.42, 0.58, u);
        const back = smooth(0.62, 1, u);
        const arm = -2.7 * wind * (1 - hit) + -0.35 * hit * (1 - back);
        p.r('shoulderR', arm, 0, 0);
        p.r('elbowR', -0.5 * wind * (1 - hit), 0, 0);
        p.r('shoulderL', -0.9 * wind * (1 - back), 0, 0.2 * wind);
        p.r('chest', -0.25 * wind + 0.5 * hit * (1 - back), -0.35 * wind * (1 - hit) + 0.3 * hit * (1 - back), 0);
        p.r('head', 0.2 * hit * (1 - back), 0, 0);
        p.r('thighL', -0.35 * hit * (1 - back), 0, 0);
        p.r('thighR', 0.3 * hit * (1 - back), 0, 0);
        p.p('hips', 0, -0.05 * hit, 0.35 * hit * (1 - back));
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
        p.r('shoulderL', -1.7 * up, 0, 0.5 * up);
        p.r('shoulderR', -1.7 * up, 0, -0.5 * up);
        p.r('elbowL', -0.4 * up, 0, 0);
        p.r('elbowR', -0.4 * up, 0, 0);
        p.r('chest', -0.3 * up, 0, 0);
        p.r('head', -0.35 * up, 0, 0);
        p.p('hips', 0, 0.06 * up, 0);
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
        p.r('chest', -0.32 * k, 0, 0);
        p.r('head', -0.25 * k, 0, 0);
        p.r('shoulderL', 0.3 * k, 0, 0);
        p.r('shoulderR', 0.3 * k, 0, 0);
        p.p('hips', 0, 0, -0.12 * k);
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
        const f = smooth(0.05, 0.8, u);
        p.r('hips', -1.42 * f, 0, 0);
        p.p('hips', 0, -(P.legUp + P.legLow) * 0.62 * f, -0.3 * f);
        p.r('kneeL', 0.7 * f, 0, 0);
        p.r('kneeR', 0.3 * f, 0, 0);
        p.r('shoulderL', 0.6 * f, 0, 0.9 * f);
        p.r('shoulderR', 0.4 * f, 0, -0.9 * f);
        p.r('head', 0.35 * f, 0, 0);
      },
      false,
    ),
  );
  return clips;
}

/* ------------------------------------------------------------------ */
/* Corps humanoïde générique, armes, ailes                              */
/* ------------------------------------------------------------------ */

/**
 * Corps humanoïde sur un bipède : bassin, torse, tête, membres, mains, pieds.
 * M : { skin, skin2, cloth, boot } (matériaux) ; o : { torso: 'blob'|'box', head: rayon relatif, neck }
 */
export function humanoidBody(b, P, M, o = {}) {
  const { J } = b;
  const cloth = M.cloth ?? M.skin;
  J.hips.add(blob(M.skin2 ?? M.skin, P.torsoW * 0.44, 0.24, P.torsoD * 0.5, 0, 0.04, 0, 1));
  J.spine.add(
    o.torso === 'box' ? box(cloth, P.torsoW * 0.8, P.torsoH * 0.5, P.torsoD * 0.9, 0, P.torsoH * 0.2, 0) : blob(cloth, P.torsoW * 0.42, P.torsoH * 0.34, P.torsoD * 0.5, 0, P.torsoH * 0.22, 0, 1),
  );
  J.chest.add(
    o.torso === 'box' ? box(cloth, P.torsoW * 0.94, P.torsoH * 0.55, P.torsoD, 0, P.torsoH * 0.1, 0) : blob(cloth, P.torsoW * 0.52, P.torsoH * 0.36, P.torsoD * 0.58, 0, P.torsoH * 0.1, 0, 1),
  );
  J.neck.add(taper(M.skin, P.headR * 0.5, P.headR * 0.42, 0.14, 6, 0, -0.02, 0));
  const hr = P.headR * (o.head ?? 1);
  J.head.add(blob(M.skin, hr, hr * 1.1, hr * 1.08, 0, hr * 0.9, 0.02, 1));
  J.head.add(blob(M.skin, hr * 0.62, hr * 0.5, hr * 0.7, 0, hr * 0.28, hr * 0.5, 0));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(blob(cloth, P.armR * 1.35, P.armR * 1.25, P.armR * 1.35, 0, 0, 0, 1));
    J[`shoulder${side}`].add(limb(M.skin, P.armUp, P.armR * 1.05, P.armR * 0.85, 6));
    J[`elbow${side}`].add(blob(M.skin2 ?? M.skin, P.armR * 0.9, P.armR * 0.9, P.armR * 0.9, 0, 0, 0, 0));
    J[`elbow${side}`].add(limb(M.skin, P.armLow, P.armR * 0.85, P.armR * 0.62, 6));
    J[`hand${side}`].add(blob(M.skin, P.armR * 0.8, P.armR * 0.9, P.armR * 0.7, 0, -0.05, 0.02, 0));
    J[`thigh${side}`].add(limb(cloth, P.legUp, P.legR * 1.25, P.legR, 6));
    J[`knee${side}`].add(blob(cloth, P.legR * 1.05, P.legR * 1.05, P.legR * 1.05, 0, 0, 0.02, 0));
    J[`knee${side}`].add(limb(M.boot ?? cloth, P.legLow, P.legR, P.legR * 0.72, 6));
    J[`foot${side}`].add(box(M.boot ?? cloth, P.legR * 1.5, P.legR * 0.8, P.legR * 3.2, 0, -P.legR * 0.35, P.legR * 0.9));
  }
}

/** Fixe une arme (groupe local, lame vers +Y) dans la main, inclinée vers l'avant */
export function hold(J, hand, g, rx = -1.25, ry = 0, rz = 0, y = -0.08, z = 0.05) {
  g.rotation.set(rx, ry, rz);
  g.position.set(0, y, z);
  g.userData.weapon = true; // exclue du calcul de taille (lance de 2 m ≠ créature de 2 m)
  J[hand].add(g);
  return g;
}

/** Épée : poignée, garde, lame (longueur len) */
export function sword(steel, grip, len = 1.1, w = 0.1) {
  const g = new THREE.Group();
  g.add(taper(grip, 0.04, 0.04, 0.3, 5, 0, -0.15, 0));
  g.add(box(steel, w * 2.6, 0.06, 0.08, 0, 0.16, 0));
  g.add(taper(steel, w * 0.5, w * 0.06, len, 4, 0, 0.18, 0));
  g.children[2].scale.z = 0.35;
  return g;
}

/** Hache à un fer : manche, fer courbe */
export function axe(steel, wood, len = 1.1, head = 0.32) {
  const g = new THREE.Group();
  g.add(taper(wood, 0.05, 0.045, len, 5, 0, -0.2, 0));
  g.add(box(steel, head * 1.1, head, 0.06, head * 0.5, len - 0.32, 0));
  g.add(spike(steel, head * 0.5, 0.05, head * 1.0, len - 0.32, 0, 0, 0, -Math.PI / 2));
  g.add(spike(steel, 0.3, 0.05, 0, len - 0.05, 0, 0));
  return g;
}

/** Lance / hallebarde : hampe longue, fer à pointe (et lame latérale si glaive) */
export function spear(steel, wood, len = 2.2, glaive = false) {
  const g = new THREE.Group();
  g.add(taper(wood, 0.045, 0.04, len, 5, 0, -0.5, 0));
  g.add(spike(steel, 0.45, 0.09, 0, len - 0.55, 0, 0, 0, 0, 4));
  if (glaive) {
    g.add(box(steel, 0.3, 0.42, 0.04, 0.16, len - 0.62, 0));
    g.add(spike(steel, 0.3, 0.07, 0.3, len - 0.8, 0, 0, 0, -1.2));
  }
  return g;
}

/** Bâton : hampe, tête ornée (orbe ou crâne) */
export function staff(wood, head, len = 1.9, big = 0.14) {
  const g = new THREE.Group();
  g.add(taper(wood, 0.05, 0.04, len, 5, 0, -0.5, 0));
  g.add(blob(head, big, big, big, 0, len - 0.4, 0, 1));
  return g;
}

/** Arc : deux branches courbes (chaîne de segments) et corde */
export function bow(wood, string, span = 1.5) {
  const g = new THREE.Group();
  for (const s of [1, -1]) {
    const h = horn(wood, 5, span * 0.5, 0.035, s * 0.34, 0, 0, 4);
    h.rotation.set(s > 0 ? 0 : Math.PI, 0, 0);
    g.add(h);
  }
  g.add(taper(string, 0.008, 0.008, span * 0.8, 3, 0, -span * 0.4, span * 0.27));
  return g;
}

/** Bouclier rond ou en écu, posé à plat contre l'avant-bras */
export function shield(rim, face, r = 0.42, kite = false) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(r, r, 0.08, kite ? 5 : 10);
  geo.rotateX(Math.PI / 2);
  g.add(mesh(geo, rim, 0, 0, 0));
  const geo2 = new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.1, kite ? 5 : 10);
  geo2.rotateX(Math.PI / 2);
  g.add(mesh(geo2, face, 0, 0, 0.02));
  g.add(blob(rim, r * 0.22, r * 0.22, 0.09, 0, 0, 0.08, 0));
  return g;
}

/** Membrane d'aile : triangle(s) plat(s) entre des points, double face */
export function membrane(m, pts) {
  const v = [];
  for (let i = 1; i < pts.length - 1; i++) v.push(...pts[0], ...pts[i], ...pts[i + 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  const mm = m.clone();
  mm.side = THREE.DoubleSide;
  return mesh(g, mm);
}

/** Aile de démon (doigts osseux + membranes) attachée à un nœud ; s = ±1 */
export function wing(parent, skinM, boneM, s, size = 1) {
  const fingers = [
    [s * 1.7, 1.5, -0.35],
    [s * 2.3, 0.7, -0.5],
    [s * 2.1, -0.4, -0.45],
    [s * 1.2, -1.1, -0.3],
  ].map((p) => p.map((c) => c * size));
  const root = [0, 0.2 * size, 0];
  parent.add(membrane(skinM, [root, ...fingers, [0, -0.7 * size, 0]]));
  for (const f of fingers) {
    const len = Math.hypot(...f);
    const sp = spike(boneM, len, 0.06, 0, 0, 0, 0, 0, 0, 4);
    sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...f).normalize());
    parent.add(sp);
  }
}
