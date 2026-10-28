/**
 * Filtre plein écran « Qualité d'image » : un seul passage combinant lissage des bords (FXAA léger),
 * netteté adaptative (accentuation de contraste local, esprit CAS) et étalonnage colorimétrique.
 * Shader écrit pour ce projet (algorithmes publics classiques), GLSL ES 3.00 converti par Pixi pour WebGL1.
 */
import { Filter, GlProgram, UniformGroup } from 'pixi.js';
import type { ImageParams } from './image-quality';

const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vTexel;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
  vTexel = uInputSize.zw;
}`;

const FRAGMENT = `
in vec2 vTextureCoord;
in vec2 vTexel;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uSharpen;
uniform float uFxaa;
uniform float uScale;  // 0 normale, 1 douce, 2 pixel-art
uniform float uK;      // pixels d'écran par pixel du rendu natif
uniform vec4 uGrade;   // exposition (facteur), contraste, saturation, vignette
uniform vec2 uWarm;    // température, teinte
uniform float uGradeOn;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
bool same(vec4 a, vec4 b) { return max(max(abs(a.r - b.r), abs(a.g - b.g)), max(abs(a.b - b.b), abs(a.a - b.a))) < 0.07; }

// EPX : le coin (sx, sy) du pixel prend la couleur de ses deux voisins s'ils sont égaux et que les opposés diffèrent
vec4 epx(vec4 c, vec4 n, vec4 s, vec4 e, vec4 w, float sx, float sy) {
  vec4 h = sx > 0.5 ? e : w;
  vec4 v = sy > 0.5 ? s : n;
  vec4 ho = sx > 0.5 ? w : e;
  vec4 vo = sy > 0.5 ? n : s;
  return (same(v, h) && !same(h, vo) && !same(v, ho)) ? v : c;
}

void main(void) {
  vec2 px = vTexel;
  vec2 uv = vTextureCoord;
  vec4 m;
  vec3 n, s, e, w;

  if (uScale > 0.5) {
    // rendu natif agrandi : on lit les pixels du rendu à leur centre exact, puis on reconstruit
    vec2 t = uv / px;
    vec2 ti = floor(t);
    vec2 f = t - ti;
    vec2 c0 = (ti + 0.5) * px;
    vec4 c = texture(uTexture, c0);
    vec4 nn = texture(uTexture, c0 + vec2(0.0, -px.y));
    vec4 ss = texture(uTexture, c0 + vec2(0.0, px.y));
    vec4 ee = texture(uTexture, c0 + vec2(px.x, 0.0));
    vec4 ww = texture(uTexture, c0 + vec2(-px.x, 0.0));
    n = nn.rgb; s = ss.rgb; e = ee.rgb; w = ww.rgb;
    if (uScale < 1.5) {
      // « sharp bilinear » : plateau net au centre, transition d'un pixel d'écran sur les bords
      vec2 ad = (ti + 0.5 + clamp((f - 0.5) * uK, -0.5, 0.5)) * px;
      m = texture(uTexture, ad);
    } else {
      vec4 q00 = epx(c, nn, ss, ee, ww, 0.0, 0.0);
      vec4 q10 = epx(c, nn, ss, ee, ww, 1.0, 0.0);
      vec4 q01 = epx(c, nn, ss, ee, ww, 0.0, 1.0);
      vec4 q11 = epx(c, nn, ss, ee, ww, 1.0, 1.0);
      vec2 wt = clamp((f - 0.5) * uK + 0.5, 0.0, 1.0);
      m = mix(mix(q00, q10, wt.x), mix(q01, q11, wt.x), wt.y);
    }
  } else {
    m = texture(uTexture, uv);
    n = texture(uTexture, uv + vec2(0.0, -px.y)).rgb;
    s = texture(uTexture, uv + vec2(0.0, px.y)).rgb;
    e = texture(uTexture, uv + vec2(px.x, 0.0)).rgb;
    w = texture(uTexture, uv + vec2(-px.x, 0.0)).rgb;
  }
  vec3 col = m.rgb;
  float a = m.a;

  if (uFxaa > 0.5 && uScale < 0.5) {
    // FXAA allégé : on ne touche que les bords nets, en moyennant le long de leur direction
    vec3 nw = texture(uTexture, uv + vec2(-px.x, -px.y)).rgb;
    vec3 ne = texture(uTexture, uv + vec2(px.x, -px.y)).rgb;
    vec3 sw = texture(uTexture, uv + vec2(-px.x, px.y)).rgb;
    vec3 se = texture(uTexture, uv + vec2(px.x, px.y)).rgb;
    float lM = luma(col), lNW = luma(nw), lNE = luma(ne), lSW = luma(sw), lSE = luma(se);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    float range = lMax - lMin;
    if (range > max(0.12, lMax * 0.3)) {
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      float reduce = max((lNW + lNE + lSW + lSE) * 0.0625, 0.0078);
      float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
      dir = clamp(dir * rcp, vec2(-1.2), vec2(1.2)) * px;
      vec3 a1 = 0.5 * (texture(uTexture, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture(uTexture, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
      vec3 b1 = a1 * 0.5 + 0.25 * (texture(uTexture, uv + dir * -0.5).rgb + texture(uTexture, uv + dir * 0.5).rgb);
      float lB = luma(b1);
      vec3 aa = (lB < lMin || lB > lMax) ? a1 : b1;
      col = mix(col, aa, 0.6);
    }
  }

  if (uSharpen > 0.0) {
    // netteté adaptative : le poids baisse là où le contraste local est déjà fort (pas de halo sur les bords)
    vec3 mn = min(col, min(min(n, s), min(e, w)));
    vec3 mx = max(col, max(max(n, s), max(e, w)));
    vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(0.0001)), 0.0, 1.0));
    float k = uScale > 0.5 ? 0.12 : 0.2;
    vec3 wgt = -amp * (uSharpen * k);
    col = clamp((col + wgt * (n + s + e + w)) / (1.0 + 4.0 * wgt), 0.0, 1.0);
  }

  if (uGradeOn > 0.5) {
    // étalonnage (couleurs non prémultipliées)
    vec3 c = a > 0.001 ? col / a : col;
    c *= uGrade.x;
    c *= vec3(1.0 + 0.16 * uWarm.x, 1.0 + 0.02 * uWarm.x, 1.0 - 0.18 * uWarm.x);
    c.g *= 1.0 - 0.1 * uWarm.y;
    c = (c - 0.5) * uGrade.y + 0.5;
    float l = luma(c);
    c = mix(vec3(l), c, uGrade.z);
    vec2 d = vTextureCoord - 0.5;
    c *= 1.0 - uGrade.w * smoothstep(0.25, 0.8, length(d * vec2(1.25, 1.0)) * 1.25);
    col = clamp(c, 0.0, 1.0) * a;
  }
  finalColor = vec4(col, a);
}`;

export class ImageFilter extends Filter {
  private readonly u: UniformGroup;

  constructor(resolution: number) {
    const u = new UniformGroup({
      uSharpen: { value: 0, type: 'f32' },
      uFxaa: { value: 0, type: 'f32' },
      uScale: { value: 0, type: 'f32' },
      uK: { value: 1, type: 'f32' },
      uGrade: { value: new Float32Array([1, 1, 1, 0]), type: 'vec4<f32>' },
      uWarm: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
      uGradeOn: { value: 0, type: 'f32' },
    });
    super({
      glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: 'image-quality' }),
      resources: { imageUniforms: u },
      // 1:1 avec le canvas : ni flou ni sous-échantillonnage (les sprites sont pixelisés)
      resolution,
      antialias: 'off',
      blendRequired: false,
    });
    this.u = u;
  }

  /** `k` = pixels d'écran par pixel du rendu natif (mise à l'échelle) */
  set(p: ImageParams, gradeOn: boolean, k = 1): void {
    const v = this.u.uniforms;
    v.uScale = p.scale;
    v.uK = k;
    v.uSharpen = p.sharpen;
    v.uFxaa = p.fxaa ? 1 : 0;
    const g = v.uGrade as Float32Array;
    g[0] = Math.pow(2, p.exposure);
    g[1] = p.contrast;
    g[2] = p.saturation;
    g[3] = p.vignette;
    const w = v.uWarm as Float32Array;
    w[0] = p.temperature;
    w[1] = p.tint;
    v.uGradeOn = gradeOn ? 1 : 0;
    this.u.update();
  }
}
