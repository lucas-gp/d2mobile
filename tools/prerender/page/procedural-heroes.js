/**
 * Personnages jouables procéduraux : Barbare, Paladin, Amazone, Assassin, Nécromancien. Chaque
 * fiche suit l'image D2 correspondante (ASSETS.md § 0, docs/internal/DIRECTION-ARTISTIQUE.md § 13) :
 * Barbare chauve et musclé aux sangles de cuir, Paladin en plates argentées et casque ailé,
 * Amazone au serre-tête et à l'arc, Assassin en cuir noir aux deux katars, Nécromancien aux cheveux
 * blancs et à la lame d'os luisante. Socle : proc-kit.js. Repère : regarde vers +Z, Y en haut.
 */
import * as THREE from 'three';
import { mat, blob, taper, spike, box, limb, applyRest, biped, humanoidBody, hold, sword, axe, bow, spear, shield } from './proc-kit.js';
import { HP, finish, hair } from './procedural-crowd.js';

/** Sangle diagonale en travers du torse */
function strap(m, P, rz, w = 0.09) {
  const s = box(m, w, P.torsoH * 1.15, P.torsoD * 1.08, 0, 0.05, 0);
  s.rotation.z = rz;
  return s;
}

function buildBarbarian() {
  const P = HP({ torsoW: 1.02, torsoD: 0.56, torsoH: 1.12, armR: 0.17, legR: 0.185, headR: 0.2, armSplay: 0.18, stance: 0.32, legUp: 0.86, legLow: 0.86 });
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0xb98a66);
  const skin2 = mat('skin2', 0x93694a);
  const leather = mat('leather', 0x3c2618);
  const kilt = mat('kilt', 0x6a2c1c);
  const studs = mat('studs', 0x9a9a98, { metalness: 0.5, roughness: 0.5 });
  const fur = mat('fur', 0x4a3826);
  humanoidBody(b, P, { skin, skin2, cloth: skin, boot: leather });
  // sangles croisées, ceinture large, boucle
  J.chest.add(strap(leather, P, 0.75));
  J.chest.add(strap(leather, P, -0.75));
  J.hips.add(box(leather, P.torsoW * 0.98, 0.16, P.torsoD * 1.02, 0, 0.0, 0));
  J.hips.add(box(studs, 0.14, 0.14, 0.06, 0, 0.0, P.torsoD * 0.53));
  // pagne bordeaux jusqu'aux genoux, devant et derrière
  J.hips.add(box(kilt, P.torsoW * 0.62, 0.78, 0.05, 0, -0.42, P.torsoD * 0.5));
  J.hips.add(box(kilt, P.torsoW * 0.62, 0.72, 0.05, 0, -0.4, -P.torsoD * 0.5));
  // crâne rasé, cicatrice sombre, barbe courte
  J.head.add(box(mat('scar', 0x6a3a30), P.headR * 0.5, P.headR * 0.07, P.headR * 0.08, P.headR * 0.28, P.headR * 1.05, P.headR * 1.0));
  J.head.add(blob(skin2, P.headR * 0.62, P.headR * 0.36, P.headR * 0.5, 0, P.headR * 0.18, P.headR * 0.72, 1));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    // épaulières de cuir cloutées, brassards de cuir
    J[`shoulder${side}`].add(blob(leather, 0.26, 0.15, 0.26, 0, 0.09, 0, 1));
    for (let i = 0; i < 3; i++) J[`shoulder${side}`].add(spike(studs, 0.12, 0.04, s * (0.05 + i * 0.09), 0.24, (i - 1) * 0.06, 0, 0, -s * 0.4));
    J[`elbow${side}`].add(box(leather, 0.19, 0.3, 0.19, 0, -0.32, 0));
    // bottes à revers de fourrure
    J[`knee${side}`].add(box(fur, 0.21, 0.16, 0.21, 0, -0.72, 0));
  }
  hold(J, 'handR', axe(mat('steel', 0x8a8e98, { metalness: 0.4 }), mat('wood', 0x3a2818), 1.15, 0.36), -0.35, 0, 0, -0.1, 0.05);
  return finish(b, P, 'barbarianHeroRoot');
}

function buildPaladin() {
  const P = HP({ torsoW: 0.82, torsoD: 0.5, torsoH: 1.1, armR: 0.14, legR: 0.16, headR: 0.2, armSplay: 0.14, stance: 0.28, legUp: 0.84, legLow: 0.84 });
  const b = biped(P);
  const { J } = b;
  const steel = mat('steel', 0xc4c8d0, { metalness: 0.55, roughness: 0.38 });
  const steel2 = mat('steel2', 0x7c808a, { metalness: 0.5, roughness: 0.5 });
  const gold = mat('gold', 0xd0a83c, { metalness: 0.6, roughness: 0.4 });
  const cloth = mat('tabard', 0xd8d2c4);
  const red = mat('red', 0x9a2a22);
  const skin = mat('skin', 0x8a5e40);
  humanoidBody(b, P, { skin, skin2: skin, cloth: steel, boot: steel2 });
  const hr = P.headR;
  // heaume fermé : calotte, visière à fente, protège-joues, cimier doré et panache
  J.head.add(blob(steel, hr * 1.16, hr * 1.16, hr * 1.2, 0, hr * 0.95, 0, 1));
  J.head.add(box(mat('visor', 0x0e0e12), hr * 1.3, hr * 0.12, hr * 0.3, 0, hr * 0.98, hr * 0.95));
  J.head.add(box(steel2, hr * 1.5, hr * 0.5, hr * 0.5, 0, hr * 0.5, hr * 0.7));
  J.head.add(box(gold, hr * 0.12, hr * 0.5, hr * 0.14, 0, hr * 0.45, hr * 1.02));
  J.head.add(box(gold, hr * 0.14, hr * 0.32, hr * 2.0, 0, hr * 2.05, 0));
  J.head.add(spike(red, hr * 1.8, hr * 0.32, 0, hr * 2.0, -hr * 0.8, -1.2, 0, 0, 5));
  // plastron bombé, gorgerin, ceinture d'or
  J.chest.add(blob(steel, P.torsoW * 0.56, P.torsoH * 0.4, P.torsoD * 0.6, 0, P.torsoH * 0.1, 0.03, 1));
  J.chest.add(box(gold, P.torsoW * 0.5, 0.05, P.torsoD * 0.1, 0, -P.torsoH * 0.12, P.torsoD * 0.5));
  J.neck.add(box(steel2, hr * 1.2, hr * 0.5, hr * 1.2, 0, 0, 0));
  J.hips.add(box(gold, P.torsoW * 0.98, 0.08, P.torsoD * 1.04, 0, -0.02, 0));
  // tassettes étagées et tabard étroit à croix dorée, devant et derrière
  for (let i = 0; i < 3; i++) J.hips.add(box(steel2, P.torsoW * (1.0 - i * 0.06), 0.13, P.torsoD * 1.06, 0, -0.14 - i * 0.12, 0));
  J.hips.add(box(cloth, 0.34, 0.86, 0.05, 0, -0.52, P.torsoD * 0.56));
  J.hips.add(box(cloth, 0.4, 0.8, 0.05, 0, -0.5, -P.torsoD * 0.56));
  J.hips.add(box(gold, 0.05, 0.4, 0.06, 0, -0.42, P.torsoD * 0.6));
  J.hips.add(box(gold, 0.2, 0.05, 0.06, 0, -0.3, P.torsoD * 0.6));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    // épaulières en coques aplaties, brassards, genouillères, jambières
    J[`shoulder${side}`].add(blob(steel, 0.2, 0.1, 0.22, s * 0.03, 0.09, 0, 1));
    J[`shoulder${side}`].add(blob(gold, 0.21, 0.03, 0.23, s * 0.03, 0.17, 0, 0));
    J[`elbow${side}`].add(box(steel, 0.17, 0.3, 0.17, 0, -0.32, 0));
    J[`knee${side}`].add(blob(gold, 0.14, 0.12, 0.14, 0, 0, 0.09, 0));
    J[`knee${side}`].add(box(steel, 0.18, 0.42, 0.18, 0, -0.4, 0));
    J[`foot${side}`].add(box(steel2, 0.2, 0.14, 0.5, 0, 0.0, 0.1));
  }
  // épée longue à garde d'or ; grand bouclier écu aux armes du Zakarum, tenu sur l'avant-bras gauche
  const blade = mat('blade', 0xdfe3ea, { metalness: 0.7, roughness: 0.3 });
  const sw = sword(blade, mat('grip', 0x3a2a1a), 1.3, 0.16);
  sw.add(box(gold, 0.36, 0.07, 0.1, 0, 0.16, 0));
  hold(J, 'handR', sw);
  const sh = shield(steel2, red, 0.5, true);
  sh.add(box(gold, 0.08, 0.5, 0.06, 0, 0, 0.14));
  sh.add(box(gold, 0.3, 0.08, 0.06, 0, 0.06, 0.14));
  hold(J, 'elbowL', sh, 0, Math.PI / 2, 0, -P.armLow * 0.5, 0);
  return finish(b, P, 'paladinHeroRoot');
}

function buildAmazon() {
  const P = HP({ torsoW: 0.64, torsoD: 0.4, torsoH: 1.02, armR: 0.098, legR: 0.128, headR: 0.2, hunch: 0.08, legUp: 0.86, legLow: 0.86 });
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0xd9a37c);
  const leather = mat('leather', 0x6b4728);
  const leather2 = mat('leather2', 0x3e2a18);
  const metal = mat('metal', 0xa2a6a8, { metalness: 0.5, roughness: 0.5 });
  const hairM = mat('hair', 0x5a3418);
  humanoidBody(b, P, { skin, skin2: skin, cloth: skin, boot: metal });
  // cheveux bruns sous un casque de bronze à cimier rouge (D2 : coiffe à crête), nuque dégagée
  J.head.add(blob(hairM, P.headR * 1.0, P.headR * 0.7, P.headR * 1.1, 0, P.headR * 1.0, -P.headR * 0.25, 1));
  J.head.add(blob(metal, P.headR * 1.1, P.headR * 0.8, P.headR * 1.14, 0, P.headR * 1.32, 0, 1));
  J.head.add(box(mat('band', 0xa03a24), P.headR * 0.2, P.headR * 0.55, P.headR * 1.9, 0, P.headR * 2.0, 0));
  J.head.add(spike(mat('crest', 0xa03a24), P.headR * 1.4, P.headR * 0.3, 0, P.headR * 2.0, -P.headR * 0.9, -1.2, 0, 0, 5));
  J.head.add(box(metal, P.headR * 0.12, P.headR * 0.6, P.headR * 0.14, 0, P.headR * 0.85, P.headR * 1.05));
  // brassière et jupe de lanières cloutées, épaulière métal sur l'épaule gauche
  J.chest.add(box(leather, P.torsoW * 0.88, P.torsoH * 0.34, P.torsoD * 1.04, 0, P.torsoH * 0.2, 0));
  J.hips.add(box(leather2, P.torsoW * 0.98, 0.18, P.torsoD * 1.04, 0, -0.02, 0));
  for (let i = 0; i < 5; i++) J.hips.add(box(leather, 0.09, 0.5, 0.04, (i - 2) * 0.12, -0.32, P.torsoD * 0.52));
  J.hips.add(box(leather, P.torsoW * 0.72, 0.4, 0.04, 0, -0.26, -P.torsoD * 0.52));
  J.shoulderL.add(blob(metal, 0.16, 0.11, 0.16, 0, 0.06, 0, 1));
  J.shoulderR.add(blob(leather, 0.14, 0.1, 0.14, 0, 0.05, 0, 1));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`elbow${side}`].add(box(leather2, 0.12, 0.2, 0.12, 0, -0.24, 0));
    // jambières argentées ouvragées, bottes hautes
    J[`knee${side}`].add(box(metal, 0.16, 0.34, 0.16, 0, -0.34, 0));
    J[`thigh${side}`].add(box(leather, 0.15, 0.06, 0.15, 0, -0.5, 0));
  }
  // grand bouclier rond dans le dos, arc en main gauche, carquois
  const back = shield(metal, mat('face', 0x5a4028), 0.5, false);
  back.rotation.set(0, Math.PI, 0);
  back.position.set(0, 0.1, -P.torsoD * 0.7);
  J.chest.add(back);
  const q = taper(leather2, 0.07, 0.06, 0.55, 6, 0.14, 0.05, -0.3);
  q.rotation.z = 0.3;
  J.chest.add(q);
  hold(J, 'handL', bow(mat('wood', 0x5c3c20), mat('cord', 0xe0d8c0), 1.7), 0, 0, 0, 0, 0.1);
  return finish(b, P, 'amazonHeroRoot');
}

/** Katar : poignée transversale et trois lames parallèles vers l'avant */
function katar(steel, grip, len = 0.7) {
  const g = new THREE.Group();
  g.add(box(grip, 0.16, 0.05, 0.05, 0, 0, 0));
  for (let i = -1; i <= 1; i++) g.add(spike(steel, len * (i === 0 ? 1 : 0.82), 0.032, i * 0.055, 0.02, 0, 0, 0, 0, 3));
  return g;
}

function buildAssassin() {
  const P = HP({ torsoW: 0.6, torsoD: 0.38, torsoH: 1.0, armR: 0.094, legR: 0.122, headR: 0.2, hunch: 0.06, legUp: 0.88, legLow: 0.88, stance: 0.26 });
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0xe2bfa8);
  const black = mat('black', 0x1c1c22);
  const black2 = mat('black2', 0x0e0e12);
  const silver = mat('silver', 0xc0c4cc, { metalness: 0.6, roughness: 0.4 });
  const hairM = mat('hair', 0x3a1e14);
  humanoidBody(b, P, { skin, skin2: skin, cloth: skin, boot: black2 });
  hair(J, hairM, P.headR, false);
  J.head.add(blob(hairM, P.headR * 0.4, P.headR * 0.45, P.headR * 0.4, 0, P.headR * 1.55, -P.headR * 0.7, 0));
  // haut de cuir noir échancré, gant et brassard noirs, pagne noir fendu, épaulière argentée à gauche
  J.chest.add(box(black, P.torsoW * 0.9, P.torsoH * 0.5, P.torsoD * 1.04, 0, P.torsoH * 0.12, 0));
  J.chest.add(box(silver, P.torsoW * 0.5, 0.05, P.torsoD * 1.06, 0, P.torsoH * 0.42, 0));
  J.hips.add(box(black, P.torsoW * 1.0, 0.16, P.torsoD * 1.04, 0, -0.02, 0));
  J.hips.add(box(silver, 0.08, 0.16, 0.06, P.torsoW * 0.5, -0.1, P.torsoD * 0.5));
  J.hips.add(box(silver, 0.08, 0.16, 0.06, -P.torsoW * 0.5, -0.1, P.torsoD * 0.5));
  J.hips.add(box(black, P.torsoW * 0.5, 0.62, 0.04, 0, -0.34, P.torsoD * 0.52));
  J.hips.add(box(black, P.torsoW * 0.5, 0.5, 0.04, 0, -0.28, -P.torsoD * 0.52));
  J.shoulderL.add(blob(silver, 0.18, 0.12, 0.18, 0, 0.06, 0, 1));
  J.shoulderL.add(spike(silver, 0.26, 0.05, 0.06, 0.16, 0, 0, 0, -0.6));
  J.shoulderR.add(blob(black, 0.13, 0.09, 0.13, 0, 0.05, 0, 1));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`elbow${side}`].add(limb(black, P.armLow * 0.95, P.armR * 1.15, P.armR * 0.95, 6));
    J[`shoulder${side}`].add(limb(black, P.armUp * 0.6, P.armR * 1.15, P.armR * 1.0, 6));
    J[`thigh${side}`].add(limb(black2, P.legUp * 0.98, P.legR * 1.32, P.legR * 1.08, 6));
    J[`knee${side}`].add(box(silver, 0.16, 0.2, 0.17, 0, 0, 0.04));
    J[`knee${side}`].add(limb(black2, P.legLow * 0.98, P.legR * 1.12, P.legR * 0.8, 6));
    J[`knee${side}`].add(box(silver, 0.17, 0.08, 0.17, 0, -0.5, 0.02));
  }
  hold(J, 'handR', katar(silver, mat('grip', 0x2a2a30), 1.0), -1.35, 0, 0, -0.1, 0.06);
  hold(J, 'handL', katar(silver, mat('grip', 0x2a2a30), 1.0), -1.35, 0, 0, -0.1, 0.06);
  return finish(b, P, 'assassinHeroRoot');
}

function buildNecromancer() {
  const P = HP({ torsoW: 0.72, torsoD: 0.42, torsoH: 1.05, armR: 0.11, legR: 0.135, headR: 0.2, hunch: 0.1, legUp: 0.86, legLow: 0.86, stance: 0.28 });
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0xe6cbb8);
  const black = mat('black', 0x1a1a1e);
  const trouser = mat('trouser', 0x2a2a30);
  const brown = mat('belt', 0x5a3a20);
  const hairM = mat('hair', 0xdad6ca);
  humanoidBody(b, P, { skin, skin2: skin, cloth: skin, boot: black });
  hair(J, hairM, P.headR, true);
  J.head.add(box(mat('band', 0x2a2a30), P.headR * 2.1, P.headR * 0.16, P.headR * 2.1, 0, P.headR * 1.25, 0));
  // gilet noir ouvert sur le torse nu, épaulières cloutées, ceinture brune et sacoche
  for (const s of [1, -1]) J.chest.add(box(black, P.torsoW * 0.28, P.torsoH * 0.62, P.torsoD * 1.05, s * P.torsoW * 0.34, P.torsoH * 0.05, 0));
  J.hips.add(box(trouser, P.torsoW * 0.98, 0.5, P.torsoD * 1.02, 0, -0.2, 0));
  J.hips.add(box(brown, P.torsoW * 1.0, 0.1, P.torsoD * 1.06, 0, 0.02, 0));
  J.hips.add(box(brown, 0.2, 0.2, 0.12, P.torsoW * 0.55, -0.1, 0.12));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(blob(brown, 0.17, 0.11, 0.17, 0, 0.06, 0, 1));
    J[`elbow${side}`].add(box(black, 0.13, 0.22, 0.13, 0, -0.3, 0));
    J[`knee${side}`].add(box(trouser, 0.17, 0.3, 0.17, 0, 0, 0.02));
    J[`knee${side}`].add(box(black, 0.17, 0.5, 0.17, 0, -0.42, 0));
  }
  // lame d'os recourbée à lueur bleutée
  const blade = new THREE.Group();
  const glow = mat('glow', 0x8fe8ff, { emissive: 0x3fc8f0, emissiveIntensity: 1.2 });
  blade.add(taper(mat('hilt', 0x6a5a40), 0.04, 0.04, 0.26, 5, 0, -0.13, 0));
  blade.add(box(mat('guard', 0xc8b890), 0.2, 0.05, 0.06, 0, 0.16, 0));
  const bl = taper(glow, 0.06, 0.012, 0.8, 4, 0, 0.18, 0);
  bl.rotation.z = 0.12;
  blade.add(bl);
  hold(J, 'handR', blade, -1.2, 0, 0, -0.1, 0.05);
  void applyRest;
  return finish(b, P, 'necromancerHeroRoot');
}

/* ------------------------------------------------------------------ */
/* Créatures des classes : golems, Valkyrie, mur d'os                   */
/* ------------------------------------------------------------------ */

/** Golem massif : torse en blocs, membres épais, tête petite (D2 : silhouette lourde et lisse) */
function golemBase(skin, dark, o = {}) {
  const P = HP({ torsoW: 1.32, torsoD: 0.8, torsoH: 1.25, armR: 0.25, legR: 0.24, headR: 0.2, armUp: 0.72, armLow: 0.72, legUp: 0.7, legLow: 0.7, hunch: 0.28, armSplay: 0.2, stance: 0.34, ...o });
  const b = biped(P);
  const { J } = b;
  humanoidBody(b, P, { skin, skin2: dark, cloth: skin, boot: dark }, { torso: 'box', head: 1.05 });
  // sillons entre les blocs
  J.chest.add(box(dark, P.torsoW * 0.96, 0.06, P.torsoD * 1.02, 0, -0.05, 0));
  J.hips.add(box(dark, P.torsoW * 0.95, 0.22, P.torsoD * 0.98, 0, -0.02, 0));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(blob(skin, 0.34, 0.24, 0.34, 0, 0.06, 0, 1));
    J[`elbow${side}`].add(blob(dark, 0.27, 0.27, 0.27, 0, 0, 0, 0));
    J[`knee${side}`].add(blob(dark, 0.26, 0.26, 0.26, 0, 0, 0.02, 0));
  }
  return { b, P, J };
}

function buildClayGolem() {
  const { b, P, J } = golemBase(mat('clay', 0xa9805a), mat('clay2', 0x6e4c32));
  for (const s of [1, -1]) J.head.add(box(mat('eyeC', 0x2a1a10), P.headR * 0.4, P.headR * 0.14, P.headR * 0.1, s * P.headR * 0.42, P.headR * 1.0, P.headR * 1.08));
  return finish(b, P, 'clayGolemRoot');
}

function buildBloodGolem() {
  const { b, P, J } = golemBase(mat('flesh', 0x8c2222), mat('flesh2', 0x521010));
  const glow = mat('bloodeye', 0xff6040, { emissive: 0xff2010, emissiveIntensity: 0.8 });
  for (const s of [1, -1]) J.head.add(box(glow, P.headR * 0.36, P.headR * 0.14, P.headR * 0.1, s * P.headR * 0.4, P.headR * 1.0, P.headR * 1.08));
  for (let i = 0; i < 5; i++) J.chest.add(spike(mat('bone', 0xd8c8a0), 0.22, 0.04, (i - 2) * 0.22, 0.32, -P.torsoD * 0.5, 0, 0, 0));
  return finish(b, P, 'bloodGolemRoot');
}

function buildIronGolem() {
  const steel = mat('iron', 0x8d939c, { metalness: 0.65, roughness: 0.4 });
  const dark = mat('iron2', 0x4a4e58, { metalness: 0.6, roughness: 0.5 });
  const { b, P, J } = golemBase(steel, dark, { torsoW: 1.4, armR: 0.27 });
  J.head.add(box(mat('slit', 0xffb040, { emissive: 0xff8020, emissiveIntensity: 0.9 }), P.headR * 1.2, P.headR * 0.14, P.headR * 0.1, 0, P.headR * 1.0, P.headR * 1.1));
  for (const s of [1, -1]) for (let i = 0; i < 3; i++) J.chest.add(box(dark, 0.08, 0.08, 0.05, s * (0.25 + i * 0.16), 0.3, P.torsoD * 0.52));
  return finish(b, P, 'ironGolemRoot');
}

function buildFireGolem() {
  const rock = mat('rock', 0x30231c);
  const rock2 = mat('rock2', 0x1a1210);
  const lava = mat('lava', 0xff7a1a, { emissive: 0xff5a10, emissiveIntensity: 1.0 });
  const { b, P, J } = golemBase(rock, rock2, { torsoW: 1.36 });
  // fissures de lave sur le torse, yeux et flammes
  for (let i = 0; i < 4; i++) J.chest.add(box(lava, 0.06, 0.4, 0.05, (i - 1.5) * 0.24, 0.05, P.torsoD * 0.52));
  for (const s of [1, -1]) J.head.add(box(lava, P.headR * 0.4, P.headR * 0.16, P.headR * 0.1, s * P.headR * 0.42, P.headR * 1.0, P.headR * 1.08));
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 2.2;
    J.head.add(spike(lava, 0.5 + (i % 2) * 0.2, 0.09, Math.sin(a) * P.headR * 0.9, P.headR * 1.8, 0, 0, 0, -a * 0.6));
  }
  for (const s of [1, -1]) J[`shoulder${s > 0 ? 'L' : 'R'}`].add(spike(lava, 0.5, 0.1, s * 0.1, 0.28, 0, 0, 0, -s * 0.4));
  return finish(b, P, 'fireGolemRoot');
}

function buildValkyrie() {
  const P = HP({ torsoW: 0.66, torsoD: 0.42, torsoH: 1.04, armR: 0.1, legR: 0.13, headR: 0.2, legUp: 0.88, legLow: 0.88, armSplay: 0.16 });
  const b = biped(P);
  const { J } = b;
  const skin = mat('skin', 0xd9a37c);
  const steel = mat('steel', 0x9aa8c4, { metalness: 0.55, roughness: 0.4 });
  const gold = mat('gold', 0xd0a83c, { metalness: 0.6, roughness: 0.4 });
  const blue = mat('blue', 0x3a4a78);
  humanoidBody(b, P, { skin, skin2: skin, cloth: steel, boot: blue }, { torso: 'box' });
  const hr = P.headR;
  J.head.add(blob(steel, hr * 1.12, hr * 0.9, hr * 1.16, 0, hr * 1.15, 0, 1));
  for (const s of [1, -1]) {
    J.head.add(spike(gold, hr * 1.7, hr * 0.3, s * hr * 1.0, hr * 1.5, -hr * 0.2, 0.2, 0, -s * 1.2));
    J.head.add(spike(steel, hr * 1.2, hr * 0.2, s * hr * 1.05, hr * 1.4, -hr * 0.4, 0.3, 0, -s * 1.6));
  }
  J.hips.add(box(blue, P.torsoW * 0.95, 0.4, P.torsoD * 1.02, 0, -0.24, 0));
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    J[`shoulder${side}`].add(blob(steel, 0.17, 0.12, 0.17, 0, 0.06, 0, 1));
    J[`elbow${side}`].add(box(steel, 0.12, 0.2, 0.12, 0, -0.26, 0));
    J[`knee${side}`].add(box(steel, 0.16, 0.34, 0.16, 0, -0.34, 0));
  }
  hold(J, 'handR', spear(steel, mat('wood', 0x5a4028), 2.1), -0.3, 0, 0, -0.12, 0.05);
  hold(J, 'elbowL', shield(gold, blue, 0.44, false), 0, Math.PI / 2, 0, -P.armLow * 0.5, 0);
  return finish(b, P, 'valkyrieRoot');
}

function buildBoneWall() {
  const P = HP({ torsoW: 0.2, torsoD: 0.2, torsoH: 0.2, armR: 0.02, legR: 0.02, headR: 0.02, legUp: 0.1, legLow: 0.1, armUp: 0.05, armLow: 0.05 });
  const b = biped(P);
  const { J } = b;
  const bone = mat('bone', 0xdcd2b4);
  const bone2 = mat('bone2', 0xa89c7c);
  // côtes et pointes d'os dressées en muraille
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.16;
    const h = 1.0 + ((i * 37) % 5) * 0.12;
    J.hips.add(spike(i % 2 ? bone : bone2, h, 0.09, x, -0.1, 0, ((i % 3) - 1) * 0.12, 0, (i - 3) * 0.06, 5));
  }
  J.hips.add(box(bone2, 1.2, 0.14, 0.18, 0, -0.05, 0));
  return finish(b, P, 'boneWallRoot');
}

export const HEROES = {
  hero_barbarian: buildBarbarian,
  hero_paladin: buildPaladin,
  hero_amazon: buildAmazon,
  hero_assassin: buildAssassin,
  hero_necromancer: buildNecromancer,
  clay_golem: buildClayGolem,
  blood_golem: buildBloodGolem,
  iron_golem: buildIronGolem,
  fire_golem: buildFireGolem,
  valkyrie: buildValkyrie,
  bone_wall: buildBoneWall,
};
