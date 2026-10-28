/** Textures procédurales générées en jeu (lumières, halos, étincelles, anneaux de sorts). */
import { Texture } from 'pixi.js';

const cache = new Map<string, Texture>();

function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): Texture {
  const have = cache.get(key);
  if (have) return have;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = Texture.from(c);
  cache.set(key, t);
  return t;
}

/** Disque de lumière (dégradé radial, blanc → transparent) pour la carte de lumière */
export function lightTex(): Texture {
  return canvasTex('light', 128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.3)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
}

/** Halo doux (particules additives) */
export function glowTex(): Texture {
  return canvasTex('glow', 64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.7)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

/** Ring under an elite (lot 305, rule `render.eliteMarks`): a bright rim, soft inside, white to be tinted by rank */
export function eliteRingTex(): Texture {
  return canvasTex('elite-ring', 64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 18, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.3)');
    gr.addColorStop(0.72, 'rgba(255,255,255,1)');
    gr.addColorStop(0.88, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

/** Étincelle dure */
export function sparkTex(): Texture {
  return canvasTex('spark', 16, 16, (g) => {
    const gr = g.createRadialGradient(8, 8, 0, 8, 8, 8);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 16, 16);
  });
}

/** Anneau (novas) : ellipse 2:1 au sol */
export function ringTex(): Texture {
  return canvasTex('ring', 256, 128, (g) => {
    g.save();
    g.scale(1, 0.5);
    const gr = g.createRadialGradient(128, 128, 90, 128, 128, 126);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.8, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(128, 128, 127, 0, Math.PI * 2);
    g.fill();
    g.restore();
  });
}

/** Disque au sol (zone d'effet, indicateur de visée) : ellipse 2:1 */
export function discTex(): Texture {
  return canvasTex('disc', 256, 128, (g) => {
    g.save();
    g.scale(1, 0.5);
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 127);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)');
    gr.addColorStop(0.85, 'rgba(255,255,255,0.25)');
    gr.addColorStop(0.95, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(128, 128, 127, 0, Math.PI * 2);
    g.fill();
    g.restore();
  });
}

/** Faisceau vertical (objet de valeur au sol) */
export function beamTex(): Texture {
  return canvasTex('beam', 32, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 32, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 256);
    const fade = g.createLinearGradient(0, 0, 0, 256);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = fade;
    g.fillRect(0, 0, 32, 256);
  });
}

/** Segment d'éclair (étiré entre deux points) */
export function boltTex(): Texture {
  return canvasTex('bolt', 64, 16, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 16);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 16);
  });
}

/** Éclat de glace (losange allongé) */
export function shardTex(): Texture {
  return canvasTex('shard', 32, 12, (g) => {
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    g.moveTo(0, 6);
    g.lineTo(20, 0);
    g.lineTo(32, 6);
    g.lineTo(20, 12);
    g.closePath();
    g.fill();
  });
}

/** Petite silhouette d'objet au sol (sac, gemme…) colorée par la rareté */
export function lootTex(): Texture {
  return canvasTex('loot', 16, 12, (g) => {
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    g.ellipse(8, 7, 7, 4.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(8, 9, 6, 2.5, 0, 0, Math.PI * 2);
    g.fill();
  });
}
