/**
 * Moteur de pré-rendu exécuté dans Chromium headless (WebGL2 / SwiftShader).
 * Rend des modèles glTF animés sous la caméra isométrique fixe du jeu (orthographique,
 * lacet 45°, élévation 30°), avec l'éclairage gothique cuit, à ×4 puis réduit, étalonné et
 * quantifié vers la palette. Produit aussi la passe d'ombre portée séparée.
 * Voir docs/internal/DIRECTION-ARTISTIQUE.md (§1 à §5) pour les valeurs.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { PALETTE_HEX } from './palette.js';
import { buildProcedural } from './procedural.js';

/** px par unité de monde à l'échelle 1 (1 unité = 2 sous-tuiles D2 = 2 × 32/√2 px) */
export const K = (2 * 32) / Math.SQRT2;
/** Suréchantillonnage */
export const SS = 4;

const DEG = Math.PI / 180;
let renderer;
let scene;
let camera;
let shadowLight;
let shadowPlane;
const lightRig = [];
const gltfCache = new Map();

/* ------------------------------------------------------------------ */
/* Initialisation                                                      */
/* ------------------------------------------------------------------ */

export function init() {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();

  // Rig d'éclairage (DA §3.1)
  const key = new THREE.DirectionalLight(0xffe8c8, 3.6);
  key.position.copy(dirFromAzEl(0, 60)); // depuis +X, élévation 60°
  const fill = new THREE.DirectionalLight(0x8fa3c8, 0.6);
  fill.position.copy(dirFromAzEl(90, 20)); // depuis +Z
  const rim = new THREE.DirectionalLight(0xc9d6ff, 1.6);
  rim.position.copy(dirFromAzEl(225, 35)); // depuis −X −Z
  const hemi = new THREE.HemisphereLight(0x5a6070, 0x2a2018, 0.9);
  for (const l of [key, fill, rim, hemi]) {
    scene.add(l);
    lightRig.push(l);
  }
  for (const l of [key, fill, rim]) {
    l.target.position.set(0, 0, 0);
    scene.add(l.target);
  }

  // Lumière et sol dédiés à la passe d'ombre
  shadowLight = new THREE.DirectionalLight(0xffffff, 0);
  shadowLight.position.copy(dirFromAzEl(0, 60).normalize().multiplyScalar(30));
  shadowLight.castShadow = true;
  shadowLight.shadow.mapSize.set(4096, 4096);
  shadowLight.shadow.bias = -0.0005;
  shadowLight.target.position.set(0, 0, 0);
  scene.add(shadowLight);
  scene.add(shadowLight.target);
  shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ color: 0x000000, opacity: 1 }));
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.receiveShadow = true;
  shadowPlane.visible = false;
  scene.add(shadowPlane);

  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const yaw = 45 * DEG;
  const pitch = 30 * DEG;
  camera.position.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(100);
  camera.lookAt(0, 0, 0);
  buildPaletteLab();
  return { K, SS, renderer: renderer.getContext().getParameter(renderer.getContext().VERSION) };
}

function dirFromAzEl(azDeg, elDeg) {
  // azimut 0 = +X, 90 = +Z ; élévation au-dessus du sol
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(20);
}

/* ------------------------------------------------------------------ */
/* Chargement et préparation des modèles                               */
/* ------------------------------------------------------------------ */

async function loadGltf(url, fresh = false) {
  if (fresh || !gltfCache.has(url)) {
    gltfCache.set(url, new Promise((resolve, reject) => new GLTFLoader().load(url, resolve, undefined, (e) => reject(new Error(`${url} : ${e?.message ?? e}`)))));
  }
  return gltfCache.get(url);
}

/** Injection d'étalonnage matière : chroma réduit, luminance compressée, crasse procédurale (DA §4.2-1) */
function gradeMaterial(mat, opts) {
  const chroma = opts.chroma ?? 0.55;
  const grime = opts.grime ?? 0.22;
  const col = opts.colorize ? new THREE.Color(opts.colorize[0]) : new THREE.Color(1, 1, 1);
  const colK = opts.colorize ? opts.colorize[1] : 0;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uChroma = { value: chroma };
    shader.uniforms.uGrime = { value: grime };
    shader.uniforms.uColorize = { value: col };
    shader.uniforms.uColorizeK = { value: colK };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrimePos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrimePos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vGrimePos;
uniform float uChroma;
uniform float uGrime;
uniform vec3 uColorize;
uniform float uColorizeK;
float gHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(gHash(i+vec3(0,0,0)),gHash(i+vec3(1,0,0)),f.x), mix(gHash(i+vec3(0,1,0)),gHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(gHash(i+vec3(0,0,1)),gHash(i+vec3(1,0,1)),f.x), mix(gHash(i+vec3(0,1,1)),gHash(i+vec3(1,1,1)),f.x),f.y), f.z); }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec3 c = diffuseColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  if (uColorizeK > 0.0) {
    vec3 t = uColorize * (l / max(0.001, dot(uColorize, vec3(0.2126, 0.7152, 0.0722))));
    c = mix(c, t, uColorizeK);
  }
  c = mix(vec3(l), c, uChroma);
  c = c * 0.80 + 0.012;
  float n = gNoise(vGrimePos * 6.0) * 0.6 + gNoise(vGrimePos * 17.0) * 0.4;
  c *= 1.0 - uGrime * smoothstep(0.35, 0.9, n);
  diffuseColor.rgb = c;
}`,
      );
  };
  mat.customProgramCacheKey = () => `grade-${chroma}-${grime}-${colK > 0 ? 1 : 0}`;
}

function prepareMaterial(src, tint, opts) {
  const m = src.clone();
  if (!(m instanceof THREE.MeshStandardMaterial)) {
    const std = new THREE.MeshStandardMaterial({ color: m.color ?? 0xffffff, map: m.map ?? null, transparent: m.transparent, alphaTest: m.alphaTest });
    return prepareMaterial(std, tint, opts);
  }
  if (tint !== undefined && tint !== null) m.color.multiply(new THREE.Color(tint));
  const metal = opts.metal ?? false;
  m.roughness = metal ? 0.45 : 0.85;
  m.metalness = metal ? 0.6 : 0;
  m.envMap = null;
  if (m.emissive && !opts.keepEmissive) m.emissive.setRGB(0, 0, 0);
  gradeMaterial(m, opts);
  return m;
}

function findByName(root, name) {
  let found = null;
  root.traverse((o) => {
    if (!found && (o.name === name || o.name.endsWith(`|${name}`) || o.name.replace(/[._]/g, '') === name.replace(/[._]/g, ''))) found = o;
  });
  return found;
}

function resolveClip(clips, name) {
  if (!name) return null;
  return clips.find((c) => c.name === name) ?? clips.find((c) => c.name.endsWith(`|${name}`)) ?? clips.find((c) => c.name.toLowerCase().includes(name.toLowerCase())) ?? null;
}

/**
 * Construit une instance prête à rendre : maillages masqués, accessoires attachés aux os,
 * teintes par maillage/matériau, mise à l'échelle (hauteur cible ou empreinte au sol).
 */
async function buildModel(cfg) {
  // chargement neuf à chaque planche : deux clones squelettiques d'une même scène glTF
  // partagent des données de peau et le second s'affichait vide (npc_anya après la sorcière)
  // créature procédurale (Diablo, Baal…) : hiérarchie de nœuds + clips générés, sans fichier glTF
  const proc = cfg.procedural ? buildProcedural(cfg.procedural) : null;
  const gltf = proc ? { scene: proc.root, animations: proc.clips } : await loadGltf(cfg.model, true);
  const root = proc ? proc.root : skClone(gltf.scene);
  const holder = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.add(root);
  holder.add(pivot);
  const hide = new Set(cfg.hide ?? []);
  // atlas de remplacement (même disposition UV que l'original, orientation glTF)
  const override = cfg.textureOverride ? await loadTex(cfg.textureOverride) : null;
  if (override) override.flipY = false;
  const meshTints = cfg.meshTints ?? {};
  const matTints = cfg.matTints ?? {};
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (hide.has(o.name) || (o.parent && hide.has(o.parent.name))) {
      o.visible = false;
      return;
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((m0) => {
      let m = m0;
      if (override && m.map) {
        m = m.clone();
        m.map = override;
      }
      let tint = cfg.tint ?? null;
      const mt = meshTints[o.name] ?? meshTints[o.parent?.name ?? ''];
      if (mt !== undefined) tint = mt;
      if (matTints[m.name] !== undefined) tint = matTints[m.name];
      const colorize = (cfg.meshColorize ?? {})[o.name] ?? (cfg.matColorize ?? {})[m.name] ?? cfg.colorizeAll;
      const replace = (cfg.matColor ?? {})[m.name];
      if (replace !== undefined) {
        m = m.clone();
        m.color = new THREE.Color(replace);
        m.map = null;
      }
      const pm = prepareMaterial(m, tint, { metal: (cfg.metalMeshes ?? []).includes(o.name), chroma: cfg.chroma, grime: cfg.grime, colorize });
      // matériau masqué (ex. chapeau d'un maillage unique)
      if ((cfg.hideMats ?? []).includes(m0.name)) pm.visible = false;
      return pm;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
    o.castShadow = true;
    o.frustumCulled = false;
  });
  const mixer = new THREE.AnimationMixer(root);
  const clips = gltf.animations ?? [];
  // pose de référence pour la mise à l'échelle
  const refClip = resolveClip(clips, cfg.anims?.idle?.clip);
  if (refClip) {
    const act = mixer.clipAction(refClip);
    act.play();
    mixer.setTime(0);
  }
  applyBoneScale(root, cfg);
  // armes des créatures procédurales : hors du calcul de taille
  const weapons = [];
  if (proc) root.traverse((o) => o.userData?.weapon && weapons.push(o));
  for (const o of weapons) {
    o.userData.par = o.parent;
    o.parent.remove(o);
  }
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  const size = box.getSize(new THREE.Vector3());
  let s = 1;
  if (typeof cfg.height === 'number') s = cfg.height / Math.max(1e-3, size.y);
  else if (cfg.footprint) {
    // la chaîne met le modèle à l'échelle pour remplir l'empreinte de collision (données de jeu)
    const rot = (cfg.rot ?? 0) * DEG;
    const ex = Math.abs(Math.cos(rot)) * size.x + Math.abs(Math.sin(rot)) * size.z;
    const ez = Math.abs(Math.sin(rot)) * size.x + Math.abs(Math.cos(rot)) * size.z;
    s = Math.min(cfg.footprint[0] / Math.max(1e-3, ex), cfg.footprint[1] / Math.max(1e-3, ez));
  }
  pivot.scale.setScalar(s * (cfg.extraScale ?? 1));
  // écrasement vertical (murs bas façon D2) : l'empreinte au sol ne change pas
  if (cfg.heightScale) pivot.scale.y *= cfg.heightScale;
  if (cfg.centerXZ) {
    const c = box.getCenter(new THREE.Vector3());
    root.position.x -= c.x;
    root.position.z -= c.z;
  }
  root.position.y -= box.min.y * (cfg.groundAlign === false ? 0 : 1);
  holder.updateMatrixWorld(true);
  for (const o of weapons) o.userData.par.add(o);
  holder.updateMatrixWorld(true);
  // accessoires attachés APRÈS la mise à l'échelle du corps, normalisés par leur taille en unités
  for (const acc of cfg.accessories ?? []) {
    const ag = await loadGltf(acc.model);
    const a = ag.scene.clone(true);
    a.traverse((o) => {
      if (o.isMesh) {
        o.material = prepareMaterial(o.material, acc.tint ?? cfg.tint ?? null, { metal: acc.metal, chroma: cfg.chroma, grime: cfg.grime });
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    if (acc.rot) a.rotation.set(acc.rot[0] * DEG, acc.rot[1] * DEG, acc.rot[2] * DEG);
    if (acc.pos) a.position.set(...acc.pos);
    const bone = findByName(root, acc.bone);
    if (!bone) throw new Error(`Os introuvable : ${acc.bone} dans ${cfg.model}`);
    bone.add(a);
    if (acc.size) {
      holder.updateMatrixWorld(true);
      const ab = new THREE.Box3().setFromObject(a, true).getSize(new THREE.Vector3());
      const cur = Math.max(ab.x, ab.y, ab.z);
      if (cur > 1e-6) a.scale.multiplyScalar(acc.size / cur);
      if (acc.pos) a.position.multiplyScalar(1);
    } else if (acc.scale) a.scale.setScalar(acc.scale);
  }
  if (refClip) mixer.stopAllAction();
  holder.updateMatrixWorld(true);
  const finalBox = new THREE.Box3().setFromObject(holder, true);
  return { holder, pivot, root, mixer, clips, size: finalBox.getSize(new THREE.Vector3()), scale: s };
}

/* ------------------------------------------------------------------ */
/* Rendu d'une image                                                   */
/* ------------------------------------------------------------------ */

function setCamera(cellW, cellH, ax, ay, ks = 1) {
  // pied du personnage (origine du monde) exactement au pixel (ax, ay) de la cellule
  const k = K * ks;
  camera.left = -ax / k;
  camera.right = (cellW - ax) / k;
  camera.top = ay / k;
  camera.bottom = -(cellH - ay) / k;
  camera.updateProjectionMatrix();
  renderer.setSize(cellW * SS, cellH * SS, false);
}

function readPixels(w, h) {
  const gl = renderer.getContext();
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  // retournement vertical
  const row = w * 4;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) out.set(buf.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  return out;
}

const baseScales = new WeakMap();
function applyBoneScale(root, cfg) {
  for (const [name, sc] of Object.entries(cfg.boneScale ?? {})) {
    const b = root.getObjectByName(name);
    if (!b) continue;
    // échelle de référence mémorisée : on applique un facteur absolu, jamais cumulé
    if (!baseScales.has(b)) baseScales.set(b, b.scale.clone());
    const o = baseScales.get(b);
    b.scale.set(o.x * sc[0], o.y * sc[1], o.z * sc[2]);
  }
}

function poseModel(model, clipName, t, angle, cfg) {
  const { mixer, clips, holder } = model;
  mixer.stopAllAction();
  const clip = resolveClip(clips, clipName);
  if (clip) {
    const act = mixer.clipAction(clip);
    act.reset();
    act.setLoop(THREE.LoopRepeat, Infinity);
    act.play();
    mixer.setTime(Math.min(t, clip.duration - 1e-4));
  }
  applyBoneScale(model.root, cfg);
  // orientation : angle de monde du jeu (0 = +x) → rotation autour de Y (modèles tournés vers +Z)
  holder.rotation.y = Math.PI / 2 - angle + (cfg.yawOffset ?? 0) * DEG;
  if (cfg.rot !== undefined && cfg.static) holder.rotation.y = (cfg.rot ?? 0) * DEG * -1;
  if (cfg.lockRoot) {
    const r = model.root.getObjectByName(cfg.lockRoot);
    if (r) {
      r.position.x = 0;
      r.position.z = 0;
    }
  }
  holder.updateMatrixWorld(true);
}

function renderColor(w, h) {
  shadowPlane.visible = false;
  for (const l of lightRig) l.visible = true;
  renderer.shadowMap.enabled = false;
  renderer.render(scene, camera);
  return readPixels(w, h);
}

function renderShadow(model, w, h) {
  // passe d'ombre : le modèle ne s'écrit pas, seul le sol reçoit l'ombre portée
  const saved = [];
  model.holder.traverse((o) => {
    if (o.isMesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        saved.push([m, m.colorWrite, m.depthWrite]);
        m.colorWrite = false;
        m.depthWrite = false;
      }
    }
  });
  for (const l of lightRig) l.visible = false;
  shadowPlane.visible = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.needsUpdate = true;
  const r = Math.max(model.size.x, model.size.y, model.size.z) * 1.2 + 1;
  const cam = shadowLight.shadow.camera;
  cam.left = -r;
  cam.right = r;
  cam.top = r;
  cam.bottom = -r;
  cam.near = 0.1;
  cam.far = 80;
  cam.updateProjectionMatrix();
  renderer.render(scene, camera);
  const px = readPixels(w, h);
  for (const [m, cw, dw] of saved) {
    m.colorWrite = cw;
    m.depthWrite = dw;
  }
  shadowPlane.visible = false;
  for (const l of lightRig) l.visible = true;
  return px;
}

/* ------------------------------------------------------------------ */
/* Étalonnage, réduction, quantification                               */
/* ------------------------------------------------------------------ */

const S_CURVE = [
  [0, 0],
  [0.25, 0.17],
  [0.5, 0.47],
  [0.75, 0.8],
  [1, 0.96],
];
const CURVE_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const x = i / 255;
  let y = x;
  for (let k = 1; k < S_CURVE.length; k++) {
    const [x0, y0] = S_CURVE[k - 1];
    const [x1, y1] = S_CURVE[k];
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      const tt = t * t * (3 - 2 * t);
      y = y0 + (y1 - y0) * (0.5 * t + 0.5 * tt);
      break;
    }
  }
  CURVE_LUT[i] = y;
}
const SRGB_TO_LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linToSrgb(v) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

/** Étalonnage sRGB (DA §4.2-3) appliqué en place sur l'image ×4 */
function gradeImage(px, opts) {
  const expo = Math.pow(2, opts.exposure ?? 0);
  const sat = opts.saturation ?? 0.8;
  const shadowTint = [0x2a / 255, 0x22 / 255, 0x38 / 255];
  const hiTint = [0xf2 / 255, 0xd9 / 255, 0xa8 / 255];
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    // exposition en lumière linéaire
    let r = linToSrgb(SRGB_TO_LIN[px[i]] * expo) / 255;
    let g = linToSrgb(SRGB_TO_LIN[px[i + 1]] * expo) / 255;
    let b = linToSrgb(SRGB_TO_LIN[px[i + 2]] * expo) / 255;
    r = CURVE_LUT[Math.round(r * 255)];
    g = CURVE_LUT[Math.round(g * 255)];
    b = CURVE_LUT[Math.round(b * 255)];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = l + (r - l) * sat;
    g = l + (g - l) * sat;
    b = l + (b - l) * sat;
    if (l < 0.35) {
      const k = 0.12 * (1 - l / 0.35);
      r += (shadowTint[0] - r) * k;
      g += (shadowTint[1] - g) * k;
      b += (shadowTint[2] - b) * k;
    } else if (l > 0.7) {
      const k = 0.08 * ((l - 0.7) / 0.3);
      r += (hiTint[0] - r) * k;
      g += (hiTint[1] - g) * k;
      b += (hiTint[2] - b) * k;
    }
    px[i] = Math.max(0, Math.min(255, Math.round(r * 255)));
    px[i + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
    px[i + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
  }
}

/** Réduction par moyenne de surface en lumière linéaire, alpha prémultiplié (DA §5) */
function downsample(px, w, h, f) {
  const ow = Math.floor(w / f);
  const oh = Math.floor(h / f);
  const out = new Uint8ClampedArray(ow * oh * 4);
  const n = f * f;
  for (let oy = 0; oy < oh; oy++) {
    for (let ox = 0; ox < ow; ox++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < f; dy++) {
        let idx = ((oy * f + dy) * w + ox * f) * 4;
        for (let dx = 0; dx < f; dx++, idx += 4) {
          const al = px[idx + 3] / 255;
          if (al <= 0) continue;
          r += SRGB_TO_LIN[px[idx]] * al;
          g += SRGB_TO_LIN[px[idx + 1]] * al;
          b += SRGB_TO_LIN[px[idx + 2]] * al;
          a += al;
        }
      }
      const o = (oy * ow + ox) * 4;
      if (a <= 0) continue;
      out[o] = linToSrgb(r / a);
      out[o + 1] = linToSrgb(g / a);
      out[o + 2] = linToSrgb(b / a);
      out[o + 3] = Math.round((a / n) * 255);
    }
  }
  return { px: out, w: ow, h: oh };
}

/* ----------- Palette OKLab ----------- */
let PAL_LAB = [];
let PAL_RGB = [];
const quantCache = new Map();

function srgbToOklab(r, g, b) {
  const lr = SRGB_TO_LIN[r];
  const lg = SRGB_TO_LIN[g];
  const lb = SRGB_TO_LIN[b];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function buildPaletteLab() {
  PAL_RGB = PALETTE_HEX.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  PAL_LAB = PAL_RGB.map(([r, g, b]) => srgbToOklab(r, g, b));
}

function nearest(r, g, b) {
  const key = (r << 16) | (g << 8) | b;
  const c = quantCache.get(key);
  if (c !== undefined) return c;
  const [L, A, B] = srgbToOklab(r, g, b);
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < PAL_LAB.length; i++) {
    const p = PAL_LAB[i];
    const d = (p[0] - L) ** 2 * 1.2 + (p[1] - A) ** 2 + (p[2] - B) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  if (quantCache.size < 400000) quantCache.set(key, best);
  return best;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Seuil alpha binaire et quantification (tramage Bayer optionnel pour le décor) */
function finalize(img, opts) {
  const { px, w, h } = img;
  const dither = opts.dither ? 0.25 * 24 : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (opts.binaryAlpha !== false) {
        if (px[i + 3] < 128) {
          px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0;
          continue;
        }
        px[i + 3] = 255;
      } else if (px[i + 3] === 0) continue;
      if (opts.quantize === false) continue;
      let r = px[i];
      let g = px[i + 1];
      let b = px[i + 2];
      if (dither) {
        const d = (BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * dither;
        r = Math.max(0, Math.min(255, r + d));
        g = Math.max(0, Math.min(255, g + d));
        b = Math.max(0, Math.min(255, b + d));
      }
      const k = nearest(r | 0, g | 0, b | 0);
      px[i] = PAL_RGB[k][0];
      px[i + 1] = PAL_RGB[k][1];
      px[i + 2] = PAL_RGB[k][2];
    }
  }
  return img;
}

/** Rogne l'image à son contenu ; renvoie l'ancre recalculée */
function trim(img, ax, ay) {
  const { px, w, h } = img;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { w: 1, h: 1, ax: 0, ay: 0, data: '', empty: true, clipped: false };
  const tw = x1 - x0 + 1;
  const th = y1 - y0 + 1;
  const out = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) out.set(px.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1 + 1) * 4), y * tw * 4);
  const clipped = x0 === 0 || y0 === 0 || x1 === w - 1 || y1 === h - 1;
  return { w: tw, h: th, ax: ax - x0, ay: ay - y0, data: toB64(out), empty: false, clipped };
}

function toB64(u8) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  return btoa(s);
}

/* ------------------------------------------------------------------ */
/* API appelée par Node                                                */
/* ------------------------------------------------------------------ */

const models = new Map();

export async function loadSheet(cfg) {
  const m = await buildModel(cfg);
  if (models.has(cfg.id)) scene.remove(models.get(cfg.id).holder);
  models.set(cfg.id, m);
  const clips = {};
  for (const [k, a] of Object.entries(cfg.anims ?? {})) {
    const c = resolveClip(m.clips, a.clip);
    clips[k] = c ? { name: c.name, duration: c.duration } : null;
  }
  return { size: [m.size.x, m.size.y, m.size.z], scale: m.scale, clips };
}

/**
 * Mesure l'emprise à l'écran (px, échelle 1, relative au pied) d'une planche sur toutes ses
 * animations et directions, ombre portée comprise : la cellule de rendu en est déduite, aucune
 * image n'est plus rognée. Boîte englobante exacte des maillages skinnés, projetée par la caméra.
 */
export function measure(cfg) {
  const m = models.get(cfg.id);
  scene.add(m.holder);
  setCamera(2000, 2000, 1000, 1000, 1);
  // la matrice de vue n'est à jour qu'après un rendu : on la force avant de projeter
  camera.updateMatrixWorld(true);
  const ext = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const v = new THREE.Vector3();
  const add = (x, y, z) => {
    v.set(x, y, z).project(camera);
    const px = ((v.x + 1) / 2) * 2000 - 1000;
    const py = ((1 - v.y) / 2) * 2000 - 1000;
    ext.minX = Math.min(ext.minX, px);
    ext.maxX = Math.max(ext.maxX, px);
    ext.minY = Math.min(ext.minY, py);
    ext.maxY = Math.max(ext.maxY, py);
  };
  const cot = 1 / Math.tan(60 * DEG);
  const box = new THREE.Box3();
  const vtx = new THREE.Vector3();
  for (const a of Object.values(cfg.anims)) {
    const clip = resolveClip(m.clips, a.clip);
    const dur = clip ? clip.duration * (a.span ?? 1) : 0;
    const start = clip ? clip.duration * (a.start ?? 0) : 0;
    const nd = a.dirs ?? cfg.dirs;
    const dstep = Math.max(1, Math.floor(nd / 8));
    for (let dir = 0; dir < nd; dir += dstep) {
      const angle = (dir / nd) * Math.PI * 2;
      for (let f = 0; f < a.frames; f++) {
        const t = start + (a.frames <= 1 ? 0 : a.loop ? (f / a.frames) * dur : (f / (a.frames - 1)) * dur);
        poseModel(m, clip?.name, t, angle, cfg);
        // maillages visibles seulement (Box3.setFromObject compte aussi les armes masquées)
        box.makeEmpty();
        m.holder.traverseVisible((o) => {
          if (!o.isMesh) return;
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.count; i += 2) {
            o.getVertexPosition(i, vtx);
            vtx.applyMatrix4(o.matrixWorld);
            box.expandByPoint(vtx);
          }
        });
        if (box.isEmpty()) continue;
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) {
              add(x, y, z);
              // ombre portée au sol (lumière depuis +X, élévation 60°)
              if (cfg.shadow !== false) add(x - Math.max(0, y) * cot, 0, z);
            }
      }
    }
  }
  scene.remove(m.holder);
  return ext;
}

/**
 * Rend un lot d'images d'une planche : pour chaque direction demandée, les images d'une
 * animation. Renvoie pour chaque image les versions « hi » (échelle 1) et « lo » (½),
 * et l'ombre (à ½ de chaque palier).
 */
export function renderBatch(cfg, animKey, dirs) {
  const m = models.get(cfg.id);
  scene.add(m.holder);
  const a = cfg.anims[animKey];
  const clip = resolveClip(m.clips, a.clip);
  const dur = clip ? clip.duration * (a.span ?? 1) : 0;
  const start = clip ? clip.duration * (a.start ?? 0) : 0;
  // échelle de texture propre à la planche (grands monstres : texture réduite, agrandie en jeu)
  const ks = cfg.texScale ?? 1;
  const cw = Math.round(cfg.cell[0] * ks);
  const ch = Math.round(cfg.cell[1] * ks);
  const ax = cfg.anchor[0] * ks;
  const ay = cfg.anchor[1] * ks;
  setCamera(cw, ch, ax, ay, ks);
  const W = cw * SS;
  const H = ch * SS;
  const out = [];
  for (const dir of dirs) {
    const angle = (dir / cfg.dirs) * Math.PI * 2;
    for (let f = 0; f < a.frames; f++) {
      const t = start + (a.frames <= 1 ? 0 : a.loop ? (f / a.frames) * dur : (f / (a.frames - 1)) * dur);
      poseModel(m, clip?.name, t, angle, cfg);
      const color = renderColor(W, H);
      gradeImage(color, cfg);
      const hi = finalize(downsample(color, W, H, SS), cfg);
      const lo = finalize(downsample(color, W, H, SS * 2), cfg);
      const rec = { name: `${animKey}/${dir}/${f}`, hi: trim(hi, ax, ay), lo: trim(lo, ax / 2, ay / 2) };
      if (cfg.shadow !== false) {
        const sh = renderShadow(m, W, H);
        // ombre : alpha seul, à ½ puis ¼
        const shHi = downsample(sh, W, H, SS * 2);
        const shLo = downsample(sh, W, H, SS * 4);
        for (const im of [shHi, shLo]) for (let i = 0; i < im.px.length; i += 4) im.px[i] = im.px[i + 1] = im.px[i + 2] = 0;
        rec.shHi = trim(shHi, ax / 2, ay / 2);
        rec.shLo = trim(shLo, ax / 4, ay / 4);
      }
      out.push(rec);
    }
  }
  scene.remove(m.holder);
  return out;
}

/* ------------------------------------------------------------------ */
/* Tuiles de sol                                                       */
/* ------------------------------------------------------------------ */

const texCache = new Map();
function loadTex(url) {
  if (!texCache.has(url)) {
    texCache.set(
      url,
      new Promise((resolve, reject) =>
        new THREE.TextureLoader().load(
          url,
          (t) => {
            t.colorSpace = THREE.SRGBColorSpace;
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.anisotropy = 8;
            resolve(t);
          },
          undefined,
          reject,
        ),
      ),
    );
  }
  return texCache.get(url);
}

/**
 * Tuile de sol losange de `size` unités : un plan texturé dont les UV couvrent exactement une
 * période de la texture (sans raccord visible), sous le même éclairage et le même étalonnage.
 * `variant` fait tourner/retourner les UV (8 variantes sans couture).
 */
export async function renderTile(cfg) {
  const tex = await loadTex(cfg.texture);
  const size = cfg.size;
  // les taches débordent du losange : leur plan est doublé (densité de texture conservée),
  // sinon leur bord doux mélange du noir transparent (liseré sombre en dents de scie)
  const planeK = cfg.splat ? 2 : 1;
  const geo = new THREE.PlaneGeometry(size * planeK, size * planeK);
  const uv = geo.attributes.uv;
  const v = cfg.variant ?? 0;
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i);
    let w = uv.getY(i);
    for (let r = 0; r < (v & 3); r++) [u, w] = [w, 1 - u];
    if (v & 4) u = 1 - u;
    uv.setXY(i, u * (cfg.repeat ?? 1) * planeK, w * (cfg.repeat ?? 1) * planeK);
  }
  const mat = prepareMaterial(new THREE.MeshStandardMaterial({ map: tex, color: new THREE.Color(cfg.tint ?? 0xffffff) }), null, { chroma: cfg.chroma ?? 0.6, grime: 0.1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  scene.add(mesh);
  // losange : largeur size·2·K/√2·√2… = size × K × √2 ; hauteur moitié
  const W = Math.round(size * K * Math.SQRT2);
  const Hh = Math.round(W / 2);
  setCamera(W, Hh, W / 2, Hh / 2);
  const color = renderColor(W * SS, Hh * SS);
  scene.remove(mesh);
  gradeImage(color, cfg);
  const hi = finalize(downsample(color, W * SS, Hh * SS, SS), { ...cfg, binaryAlpha: false, dither: true });
  const lo = finalize(downsample(color, W * SS, Hh * SS, SS * 2), { ...cfg, binaryAlpha: false, dither: true });
  // masque : losange net pour les tuiles, tache organique à bord doux pour les raccords
  const seed = (cfg.variant ?? 0) * 17.13 + 3.1;
  for (const im of [hi, lo]) {
    for (let y = 0; y < im.h; y++) {
      for (let x = 0; x < im.w; x++) {
        const dx = (x + 0.5 - im.w / 2) / (im.w / 2);
        const dy = (y + 0.5 - im.h / 2) / (im.h / 2);
        const i = (y * im.w + x) * 4;
        if (cfg.splat) {
          const r = Math.hypot(dx, dy);
          const ang = Math.atan2(dy, dx);
          const wob = 0.12 * Math.sin(ang * 3 + seed) + 0.08 * Math.sin(ang * 7 + seed * 2.3) + 0.05 * Math.sin(ang * 13 + seed * 0.7);
          const edge = 0.78 + wob;
          const a = Math.max(0, Math.min(1, (edge - r) / 0.18));
          im.px[i + 3] = Math.round(a * 255);
        } else {
          im.px[i + 3] = Math.abs(dx) + Math.abs(dy) > 1.0 ? 0 : 255;
        }
      }
    }
  }
  return { hi: { w: hi.w, h: hi.h, ax: hi.w / 2, ay: hi.h / 2, data: toB64(hi.px) }, lo: { w: lo.w, h: lo.h, ax: lo.w / 2, ay: lo.h / 2, data: toB64(lo.px) } };
}

window.pr = { init, loadSheet, measure, renderBatch, renderTile };
window.prReady = true;
