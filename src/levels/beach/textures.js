// Procedural canvas textures for the beach house (art doc 03 section 3.10).
// Twelve textures total, all generated once at level build and disposed with the level.
import * as THREE from 'three';
import { makeCanvasTexture, makeFbm2D, fillPixels, clamp255 } from '../../textures.js';

const TAU = Math.PI * 2;

// Whitewashed oak planks. 2048 px covers 4 x 4 m: planks 92 px (0.18 m) wide, 1024 px (2 m) long, staggered per column.
function drawOak(ctx, w, h, rng) {
  const swatches = ['#DED0B8', '#E8DCC8', '#EDE2D0', '#F0E6D4', '#E2D4BC'];
  const pw = 92, pl = 1024;
  ctx.fillStyle = '#B8A88E';
  ctx.fillRect(0, 0, w, h);
  for (let cx = 0, col = 0; cx < w; cx += pw, col++) {
    const offset = Math.floor(rng() * pl);
    for (let y = offset - pl; y < h; y += pl) {
      const seed = rng() * 100;
      ctx.fillStyle = swatches[Math.floor(rng() * swatches.length)];
      ctx.fillRect(cx, y + 1, pw - 2, pl - 2);
      // grain: wobbling vertical lines
      ctx.strokeStyle = 'rgba(120,95,60,0.07)';
      ctx.lineWidth = 1;
      for (let g = 0; g < 40; g++) {
        const gx = cx + 3 + rng() * (pw - 6);
        ctx.beginPath();
        for (let yy = y + 2; yy <= y + pl - 2; yy += 16) {
          const x = gx + 3 * Math.sin(yy * 0.02 + seed + g * 0.3);
          if (yy === y + 2) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      // knots
      const knots = Math.floor(rng() * 3);
      for (let k = 0; k < knots; k++) {
        const kx = cx + 12 + rng() * (pw - 24), ky = y + 40 + rng() * (pl - 80);
        ctx.fillStyle = 'rgba(140,110,70,0.35)';
        ctx.beginPath(); ctx.ellipse(kx, ky, 8, 5, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(120,95,60,0.25)';
        for (let r = 1; r <= 3; r++) {
          ctx.beginPath(); ctx.ellipse(kx, ky, 8 + r * 4, 5 + r * 3, 0, 0, TAU); ctx.stroke();
        }
      }
    }
  }
  // subtle whitewash veil
  ctx.fillStyle = 'rgba(255,250,240,0.10)';
  ctx.fillRect(0, 0, w, h);
}

// Ivory wool rug with an over-under weave. 1024 px covers about 1.15 x 1.2 m.
function drawRug(ctx, w, h, rng) {
  ctx.fillStyle = '#D9CDB8';
  ctx.fillRect(0, 0, w, h);
  const s = 6;
  for (let y = 0; y < h; y += s) {
    const row = (y / s) | 0;
    for (let x = 0; x < w; x += s) {
      const col = (x / s) | 0;
      const jitter = Math.round((rng() - 0.5) * 12);
      const l = clamp255(184 + jitter);
      ctx.fillStyle = `rgba(${clamp255(200 + jitter)},${l},${clamp255(164 + jitter)},0.5)`;
      if ((row + col) % 2 === 0) ctx.fillRect(x, y + 1, s - 1, 3);   // horizontal stitch
      else ctx.fillRect(x + 1, y, 3, s - 1);                          // vertical stitch
    }
  }
  // No border here: the texture tiles 4 x 3 across the rug, so the level draws one clean border as geometry.
}

// Cream boucle: thousands of tiny loops. Used as map and bump.
function drawBoucle(ctx, w, h, rng) {
  ctx.fillStyle = '#EDE6DA';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 20000; i++) {
    const r = 1 + rng() * 1.5;
    ctx.fillStyle = `hsl(38, 22%, ${84 + rng() * 8}%)`;
    ctx.beginPath(); ctx.arc(rng() * w, rng() * h, r, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(170,160,145,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3000; i++) {
    const a = rng() * TAU;
    ctx.beginPath(); ctx.arc(rng() * w, rng() * h, 1.5 + rng() * 1.5, a, a + 3 + rng() * 2); ctx.stroke();
  }
}

// Honed white marble with grey and warm veins.
function drawMarble(ctx, w, h, rng) {
  ctx.fillStyle = '#F2EFE9';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    const x = rng() * w, y = rng() * h, r = 100 + rng() * 200;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(200,192,180,0.12)');
    g.addColorStop(1, 'rgba(200,192,180,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const vein = (color, width, branchy) => {
    const side = Math.floor(rng() * 4);
    const start = side === 0 ? [rng() * w, 0] : side === 1 ? [w, rng() * h] : side === 2 ? [rng() * w, h] : [0, rng() * h];
    const pts = [start];
    const n = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) pts.push([rng() * w, rng() * h]);
    const path = (wd, alpha) => {
      ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = wd; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const xc = (pts[i][0] + pts[i + 1][0]) / 2, yc = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], xc, yc);
      }
      const l = pts[pts.length - 1]; ctx.lineTo(l[0], l[1]);
      ctx.stroke();
    };
    path(width * 4, 0.08); path(width * 2, 0.2); path(width, 0.6);
    ctx.globalAlpha = 1;
    if (branchy) {
      const nb = 2 + Math.floor(rng() * 3);
      for (let b = 0; b < nb; b++) {
        const p = pts[1 + Math.floor(rng() * (pts.length - 1))];
        const ex = p[0] + (rng() - 0.5) * 300, ey = p[1] + (rng() - 0.5) * 300;
        ctx.strokeStyle = color; ctx.globalAlpha = 0.35; ctx.lineWidth = width * 0.4;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]);
        ctx.quadraticCurveTo(p[0] + (rng() - 0.5) * 120, p[1] + (rng() - 0.5) * 120, ex, ey); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  };
  for (let i = 0; i < 7; i++) vein('#B9AFA3', 1.5 + rng() * 1.5, true);
  for (let i = 0; i < 2; i++) vein('#C9B79C', 1.5 + rng(), false);
}

// Rattan weave with transparent holes (RGBA). Alpha doubles as the cutout.
function drawRattan(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const step = 20, sw = 14;
  const strip = (x, y, ww, hh, base, edge, horizontal) => {
    ctx.fillStyle = base; ctx.fillRect(x, y, ww, hh);
    ctx.fillStyle = edge;
    if (horizontal) { ctx.fillRect(x, y, ww, 2); ctx.fillRect(x, y + hh - 2, ww, 2); }
    else { ctx.fillRect(x, y, 2, hh); ctx.fillRect(x + ww - 2, y, 2, hh); }
  };
  for (let y = 0; y < h; y += step) strip(0, y, w, sw, '#C9A56E', '#8E6E3A', true);
  for (let x = 0; x < w; x += step) strip(x, 0, sw, h, '#B8934F', '#8E6E3A', false);
  // over/under: put the horizontal strand back on top at alternating intersections
  for (let y = 0, j = 0; y < h; y += step, j++) {
    for (let x = 0, i = 0; x < w; x += step, i++) {
      if ((i + j) % 2 === 0) strip(x, y, sw, sw, '#C9A56E', '#8E6E3A', true);
    }
  }
}

// Limewash plaster: soft mottling and fine grit.
function drawPlaster(ctx, w, h, rng) {
  ctx.fillStyle = '#F4F0E8';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 600; i++) {
    const x = rng() * w, y = rng() * h, r = 20 + rng() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(220,210,195,0.05)');
    g.addColorStop(1, 'rgba(220,210,195,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.03)';
  for (let i = 0; i < 3000; i++) ctx.fillRect(rng() * w, rng() * h, 1, 1);
}

// Bleached timber (beams, island slats, fan blades). 512 x 2048, grain along y.
function drawTimber(ctx, w, h, rng) {
  ctx.fillStyle = '#C6AE87';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(120,95,60,0.10)';
  ctx.lineWidth = 1;
  for (let g = 0; g < 300; g++) {
    const gx = rng() * w, ph = rng() * 10;
    ctx.beginPath();
    for (let y = 0; y <= h; y += 24) {
      const x = gx + 4 * Math.sin(y * 0.01 + ph);
      if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(90,70,45,0.15)';
  for (let y = 0; y < h; y += 40) ctx.fillRect(0, y, w, 1);
  for (let k = 0; k < 4; k++) {
    const kx = 40 + rng() * (w - 80), ky = 100 + rng() * (h - 200);
    ctx.fillStyle = 'rgba(142,116,84,0.5)';
    ctx.beginPath(); ctx.ellipse(kx, ky, 10, 16, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(168,143,106,0.45)';
    for (let r = 1; r <= 3; r++) { ctx.beginPath(); ctx.ellipse(kx, ky, 10 + r * 5, 16 + r * 7, 0, 0, TAU); ctx.stroke(); }
  }
}

// Dry sand: speckles, broad tonal blobs and faint wind ripples. 1024 px covers 8 x 8 m.
function drawSand(ctx, w, h, rng) {
  ctx.fillStyle = '#E9DAB8';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 20; i++) {
    const x = rng() * w, y = rng() * h, r = 200 + rng() * 200;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(200,180,140,0.08)');
    g.addColorStop(1, 'rgba(200,180,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 40000; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(200,180,143,0.5)' : 'rgba(245,236,216,0.5)';
    ctx.fillRect(rng() * w, rng() * h, 1, 1);
  }
  ctx.strokeStyle = 'rgba(180,160,120,0.06)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 30; i++) {
    const y0 = rng() * h, ph = rng() * TAU;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 16) {
      const y = y0 + 6 * Math.sin(x * 0.03 + ph);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// Tiling value noise, independent seeds per channel. Alpha stays opaque so RGB survives the canvas upload.
function drawNoise(ctx, w, h) {
  const fr = makeFbm2D(11, 64, w, 4), fg = makeFbm2D(23, 64, w, 4), fb = makeFbm2D(37, 64, w, 4);
  fillPixels(ctx, w, h, (x, y) => [clamp255(fr(x, y) * 255), clamp255(fg(x, y) * 255), clamp255(fb(x, y) * 255), 255]);
}

// Neutral linen crosshatch, tinted through material.color.
function drawLinen(ctx, w, h) {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let i = 0; i < w; i += 3) { ctx.fillRect(i, 0, 1, h); ctx.fillRect(0, i, w, 1); }
}

// Sun glow sprite: warm radial falloff.
function drawSunGlow(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,231,176,1)');
  g.addColorStop(0.25, 'rgba(255,231,176,0.35)');
  g.addColorStop(1, 'rgba(255,231,176,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// Print atlas (1024 x 1024): magazine cover, wall art canvas, fiddle-leaf texture. Regions in canvas pixels.
export const ATLAS = {
  magazine: [0, 0, 384, 512],
  leaf: [0, 512, 288, 904],
  art: [384, 0, 1024, 480],
  stripe: [512, 560, 768, 816],
};

function drawAtlas(ctx, w, h, rng) {
  ctx.fillStyle = '#F5F1EA';
  ctx.fillRect(0, 0, w, h);
  // magazine cover
  {
    const [x0, y0, x1, y1] = ATLAS.magazine;
    const mw = x1 - x0, mh = y1 - y0;
    ctx.fillStyle = '#F5F1EA'; ctx.fillRect(x0, y0, mw, mh);
    const g = ctx.createLinearGradient(0, y0 + mh * 0.25, 0, y1);
    g.addColorStop(0, '#3FC1C0'); g.addColorStop(1, '#0F5F8F');
    ctx.fillStyle = g; ctx.fillRect(x0, y0 + mh * 0.32, mw, mh * 0.68);
    ctx.fillStyle = 'rgba(246,250,249,0.7)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const yy = y0 + mh * (0.55 + i * 0.07);
      ctx.moveTo(x0, yy);
      for (let x = x0; x <= x1; x += 12) ctx.lineTo(x, yy + 3 * Math.sin(x * 0.08 + i));
      ctx.lineTo(x1, yy + 6); ctx.lineTo(x0, yy + 6); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#1E1D1B';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 58px Georgia, "Times New Roman", serif';
    ctx.fillText('SURF & SAND', x0 + mw / 2, y0 + mh * 0.14);
    ctx.font = '500 22px Georgia, "Times New Roman", serif';
    ctx.fillText('THE COASTAL ISSUE', x0 + mw / 2, y0 + mh * 0.25);
    ctx.fillStyle = '#F5F1EA';
    ctx.font = 'italic 500 26px Georgia, "Times New Roman", serif';
    ctx.fillText('Houses that face the sea', x0 + mw / 2, y0 + mh * 0.90);
  }
  // wall art: three soft blobs on an ivory ground
  {
    const [x0, y0, x1, y1] = ATLAS.art;
    ctx.fillStyle = '#F2EDE4'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    const blob = (cx, cy, r, color) => {
      const g = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
      g.addColorStop(0, color); g.addColorStop(0.7, color + 'AA'); g.addColorStop(1, color + '00');
      ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    };
    blob(x0 + 210, y0 + 200, 170, '#D9C7A6');
    blob(x0 + 420, y0 + 250, 150, '#7FA6B8');
    blob(x0 + 330, y0 + 330, 90, '#C1704A');
  }
  // stripe pillow: alternating 40 px oat / sand bands
  {
    const [x0, y0, x1, y1] = ATLAS.stripe;
    for (let y = y0, i = 0; y < y1; y += 40, i++) {
      ctx.fillStyle = i % 2 ? '#C9B79C' : '#E3D6C3';
      ctx.fillRect(x0, y, x1 - x0, Math.min(40, y1 - y));
    }
  }
  // fiddle-leaf: fill, midrib, side veins, darker edge
  {
    const [x0, y0, x1, y1] = ATLAS.leaf;
    const lw = x1 - x0, lh = y1 - y0;
    ctx.fillStyle = '#3E6B3A'; ctx.fillRect(x0, y0, lw, lh);
    const g = ctx.createRadialGradient(x0 + lw / 2, y0 + lh / 2, lh * 0.15, x0 + lw / 2, y0 + lh / 2, lh * 0.6);
    g.addColorStop(0, 'rgba(90,138,76,0.35)'); g.addColorStop(1, 'rgba(20,40,20,0.35)');
    ctx.fillStyle = g; ctx.fillRect(x0, y0, lw, lh);
    ctx.strokeStyle = 'rgba(200,220,180,0.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x0 + lw / 2, y0 + lh); ctx.lineTo(x0 + lw / 2, y0 + 10); ctx.stroke();
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const yy = y0 + lh * (0.2 + i * 0.13);
      ctx.beginPath(); ctx.moveTo(x0 + lw / 2, yy);
      ctx.quadraticCurveTo(x0 + lw * 0.75, yy - lh * 0.05, x0 + lw - 8, yy - lh * 0.12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0 + lw / 2, yy);
      ctx.quadraticCurveTo(x0 + lw * 0.25, yy - lh * 0.05, x0 + 8, yy - lh * 0.12); ctx.stroke();
    }
  }
}

// uv rect (u0, v0, u1, v1) of an atlas region, accounting for the canvas y flip.
export function atlasUV(region, size = 1024) {
  const [x0, y0, x1, y1] = region;
  return { u0: x0 / size, u1: x1 / size, v0: 1 - y1 / size, v1: 1 - y0 / size };
}

// Remap a geometry's uv attribute from [0,1]^2 (or its own bounding range when `normalize`) into an atlas rect.
export function remapUV(geometry, rect, normalize = false) {
  const uv = geometry.attributes.uv;
  let minU = 0, minV = 0, spanU = 1, spanV = 1;
  if (normalize) {
    minU = Infinity; minV = Infinity; let maxU = -Infinity, maxV = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      if (u < minU) minU = u; if (u > maxU) maxU = u; if (v < minV) minV = v; if (v > maxV) maxV = v;
    }
    spanU = Math.max(1e-6, maxU - minU); spanV = Math.max(1e-6, maxV - minV);
  }
  for (let i = 0; i < uv.count; i++) {
    const tu = (uv.getX(i) - minU) / spanU, tv = (uv.getY(i) - minV) / spanV;
    uv.setXY(i, rect.u0 + tu * (rect.u1 - rect.u0), rect.v0 + tv * (rect.v1 - rect.v0));
  }
  uv.needsUpdate = true;
  return geometry;
}

export function createBeachTextures(quality = 'high') {
  const oakSize = quality === 'low' ? 1024 : 2048;
  const T = {
    oak: makeCanvasTexture(oakSize, oakSize, drawOak, { seed: 7 }),
    rug: makeCanvasTexture(1024, 1024, drawRug, { seed: 8 }),
    boucle: makeCanvasTexture(512, 512, drawBoucle, { seed: 9 }),
    marble: makeCanvasTexture(1024, 1024, drawMarble, { seed: 10 }),
    rattan: makeCanvasTexture(512, 512, drawRattan, { seed: 11 }),
    plaster: makeCanvasTexture(512, 512, drawPlaster, { seed: 12 }),
    timber: makeCanvasTexture(512, 2048, drawTimber, { seed: 13 }),
    sand: makeCanvasTexture(1024, 1024, drawSand, { seed: 14 }),
    noise: makeCanvasTexture(256, 256, drawNoise, { srgb: false, seed: 15 }),
    linen: makeCanvasTexture(256, 256, drawLinen, { seed: 16 }),
    sunGlow: makeCanvasTexture(256, 256, drawSunGlow, { wrap: THREE.ClampToEdgeWrapping, seed: 17 }),
    atlas: makeCanvasTexture(1024, 1024, drawAtlas, { wrap: THREE.ClampToEdgeWrapping, seed: 18 }),
  };
  // The oak plank pattern is scaled so 2048 px = 4 m regardless of the low-quality downsize.
  T.noise.generateMipmaps = false;
  T.noise.minFilter = THREE.LinearFilter;
  T.noise.magFilter = THREE.LinearFilter;
  return T;
}

export function disposeBeachTextures(T) {
  for (const k of Object.keys(T)) { T[k].dispose(); }
}
