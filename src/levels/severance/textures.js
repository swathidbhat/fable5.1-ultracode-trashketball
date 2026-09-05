// Canvas textures for the Lumon MDR level. Everything is drawn at load; no image files.
// Texture budget (contract 9.2, max 12 per level): carpet, ceiling tile, diffuser grid, wall seam,
// partition felt, linoleum, perforation, decal atlas (signs + wordmark + portrait + droplet + stripes),
// and three screen textures (built in screen.js). Contact shadows share one radial alpha texture.
import * as THREE from 'three';
import { makeCanvasTexture, makeValueNoise2D, fillPixels, hexToRgb, clamp255, mulberry32 } from '../../textures.js';

export const PALETTE = {
  carpet: '#417F50', carpetDark: '#356A42', carpetLight: '#4C8F5B',
  wall: '#F1F3EE', wallSeam: '#E4E7E1', skirting: '#DADDD6',
  ceiling: '#EAEDE7', tbar: '#D3D7D0',
  diffuser: '#F0F8F2', diffuserLine: '#DDE8E0', diffuserEmissive: '#EFF9F1',
  hallWall: '#EDF3EC', hallFloor: '#E4E7E1', hallPanel: '#EEF5FF',
  deskTop: '#F4F4F1', deskFrame: '#E9EAE6', deskRing: '#B9BDB7',
  partition: '#2F6B5A', partitionTrim: '#EEF0EB', cord: '#C9CCC5',
  monitorRear: '#37516B', monitorBezel: '#2F4459',
  screenBg: '#0A1E33', screenInk: '#A9D6E8', screenHi: '#E8F6FC', screenDim: '#5F86A3',
  keyboard: '#E5E0CF', keyBlock: '#D9D3C0', keycap: '#E0DAC7', fnKey: '#7FA3C0', recess: '#D2CCB8', trackball: '#152638',
  chairFabric: '#2C5E52', chairShell: '#E3E6E1', chairMetal: '#9EA3A0', caster: '#2A2A2A',
  binBody: '#3C5A73', binInterior: '#1B2A3A', binRim: '#C8CDD1',
  doorSlab: '#EDEFEA', doorFrame: '#B9BEB7', lever: '#B0B4AE',
  portraitFrame: '#8C7440', ink: '#12274A', powderBlue: '#A9C6DA', paper: '#F7F7F2',
  background: '#EAEFE9',
};

// Decal atlas layout in canvas pixels [x, y, w, h] on a 1024 x 1024 canvas.
export const ATLAS_SIZE = 1024;
export const ATLAS = {
  wordmark: [0, 0, 1024, 600],
  portrait: [0, 600, 318, 424],
  mdr: [330, 610, 360, 120],
  breakroom: [700, 610, 300, 100],
  wellness: [330, 745, 500, 120],
  nameplate: [850, 745, 160, 36],
  droplet: [880, 790, 96, 120],
  stripes: [990, 790, 30, 120],
  wayfinding: [330, 930, 680, 85],
};

// Remap a geometry's uv attribute (0..1 square) into one atlas rect. Canvas y runs down, texture v runs up.
export function remapUV(geo, rect, size = ATLAS_SIZE) {
  const [rx, ry, rw, rh] = rect;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, (rx + u * rw) / size, 1 - (ry + (1 - v) * rh) / size);
  }
  uv.needsUpdate = true;
  return geo;
}

// Draw text with manual tracking (letter spacing in px), centered on (cx, cy).
export function drawTracked(ctx, text, cx, cy, spacing) {
  const widths = [];
  let total = 0;
  for (const ch of text) { const w = ctx.measureText(ch).width; widths.push(w); total += w; }
  total += spacing * Math.max(0, text.length - 1);
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  let x = cx - total / 2;
  let i = 0;
  for (const ch of text) { ctx.fillText(ch, x, cy); x += widths[i++] + spacing; }
  ctx.textAlign = prevAlign;
}

// 1. Carpet: green base, two-octave luminance noise, faint loop-pile checker. Used as map and bumpMap.
export function carpetTexture() {
  const [br, bg, bb] = hexToRgb(PALETTE.carpet);
  return makeCanvasTexture(256, 256, (ctx, w, h, rng) => {
    const blurred = makeValueNoise2D(11, 4, w);
    fillPixels(ctx, w, h, (x, y) => {
      const n1 = rng() * 2 - 1;
      const n2 = blurred(x, y) * 2 - 1;
      let lum = 1 + 0.07 * (0.6 * n1 + 0.4 * n2);
      if (((x >> 1) + (y >> 1)) & 1) lum *= 0.97;
      return [clamp255(br * lum), clamp255(bg * lum), clamp255(bb * lum)];
    });
  }, { srgb: true, repeat: [28, 32], seed: 7 });
}

// 2. Ceiling tile: one 0.6 m tile with a T-bar border, pinhole speckle and a couple of fissures.
export function ceilingTexture() {
  return makeCanvasTexture(256, 256, (ctx, w, h, rng) => {
    ctx.fillStyle = PALETTE.ceiling; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#DDE0D9';
    for (let i = 0; i < 400; i++) ctx.fillRect((rng() * w) | 0, (rng() * h) | 0, 1, 1);
    ctx.strokeStyle = '#D9DCD5'; ctx.lineWidth = 1.5;
    for (let s = 0; s < 2; s++) {
      ctx.beginPath();
      let x = 20 + rng() * 200, y = 20 + rng() * 200;
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (rng() - 0.5) * 24; y += (rng() - 0.5) * 24; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.fillStyle = PALETTE.tbar;
    ctx.fillRect(0, 0, w, 6); ctx.fillRect(0, 0, 6, h); ctx.fillRect(0, h - 6, w, 6); ctx.fillRect(w - 6, 0, 6, h);
    ctx.fillStyle = '#C7CBC4';
    ctx.fillRect(0, 0, w, 1); ctx.fillRect(0, 0, 1, h);
  }, { srgb: true, repeat: [14 / 0.6, 16 / 0.6], seed: 3 });
}

// 3. Fluorescent diffuser grid (emissiveMap).
export function diffuserTexture() {
  return makeCanvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = PALETTE.diffuser; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = PALETTE.diffuserLine;
    for (let i = 0; i < w; i += 8) { ctx.fillRect(i, 0, 1, h); ctx.fillRect(0, i, w, 1); }
  }, { srgb: true, repeat: [10, 5] });
}

// 4. Wall: cool white with a vertical panel seam at the right edge (one tile = 1.2 m) and 1% noise.
export function wallTexture() {
  const [r, g, b] = hexToRgb(PALETTE.wall);
  const [sr, sg, sb] = hexToRgb(PALETTE.wallSeam);
  return makeCanvasTexture(512, 512, (ctx, w, h, rng) => {
    fillPixels(ctx, w, h, (x) => {
      const n = 1 + (rng() - 0.5) * 0.02;
      if (x >= w - 3) return [clamp255(sr * n), clamp255(sg * n), clamp255(sb * n)];
      return [clamp255(r * n), clamp255(g * n), clamp255(b * n)];
    });
  }, { srgb: true, repeat: [1, 1], seed: 5 });
}

// 5. Partition felt bump (gray noise, softened).
export function feltTexture() {
  return makeCanvasTexture(128, 128, (ctx, w, h, rng) => {
    const soft = makeValueNoise2D(21, 2, w);
    fillPixels(ctx, w, h, (x, y) => {
      const v = 128 + 26 * (0.5 * (rng() * 2 - 1) + 0.5 * (soft(x, y) * 2 - 1));
      return [clamp255(v), clamp255(v), clamp255(v)];
    });
  }, { srgb: false, repeat: [8, 3], seed: 9 });
}

// 11. Hallway linoleum speckle.
export function linoleumTexture() {
  return makeCanvasTexture(256, 256, (ctx, w, h, rng) => {
    ctx.fillStyle = PALETTE.hallFloor; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) {
      ctx.fillStyle = rng() < 0.5 ? '#D6D9D2' : '#EEF0EA';
      ctx.fillRect((rng() * w) | 0, (rng() * h) | 0, 1, 1);
    }
  }, { srgb: true, repeat: [3, 15], seed: 13 });
}

// Bin perforation bump: a grid of dark dots at 16 px pitch.
export function perforationTexture() {
  return makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3A3A3A';
    for (let y = 8; y < h; y += 16) {
      for (let x = 8; x < w; x += 16) { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
    }
  }, { srgb: false, repeat: [6, 1] });
}

// Draws the Lumon droplet path into a w x h box at (x, y).
export function dropletPath(ctx, x, y, w, h) {
  const s = w / 128;
  ctx.beginPath();
  ctx.moveTo(x + 64 * s, y + 8 * s);
  ctx.bezierCurveTo(x + 80 * s, y + 50 * s, x + 108 * s, y + 70 * s, x + 108 * s, y + 108 * s);
  ctx.arc(x + 64 * s, y + 108 * s, 44 * s, 0, Math.PI, false);
  ctx.bezierCurveTo(x + 20 * s, y + 70 * s, x + 48 * s, y + 50 * s, x + 64 * s, y + 8 * s);
  ctx.closePath();
}

function placard(ctx, rect, lines, { fontPx = 0.28, tracking = 0.08, sub = null } = {}) {
  const [x, y, w, h] = rect;
  ctx.save();
  ctx.fillStyle = '#F4F6F2'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PALETTE.doorFrame; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = PALETTE.ink; ctx.textBaseline = 'middle';
  const px = Math.round(h * fontPx);
  ctx.font = `600 ${px}px Arial, "Helvetica Neue", sans-serif`;
  const cy = sub ? y + h * 0.40 : y + h / 2;
  lines.forEach((t, i) => drawTracked(ctx, t, x + w / 2, cy + (i - (lines.length - 1) / 2) * px * 1.25, px * tracking));
  if (sub) {
    ctx.font = `400 ${Math.round(h * 0.14)}px Arial, "Helvetica Neue", sans-serif`;
    ctx.fillStyle = '#4A5B6E';
    drawTracked(ctx, sub, x + w / 2, y + h * 0.76, 0);
  }
  ctx.restore();
}

function wordmark(ctx, rect) {
  const [x, y, w, h] = rect;
  const cx = x + w / 2, cy = y + h / 2, rx = 440, ry = 250;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, rx - 7, ry - 7, 0, 0, Math.PI * 2); ctx.clip();
  ctx.lineWidth = 10;
  for (const dy of [-200, -100, 0, 100, 200]) {
    ctx.beginPath(); ctx.moveTo(-rx, dy); ctx.lineTo(rx, dy); ctx.stroke();
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-rx, -65, rx * 2, 130);
  ctx.fillStyle = PALETTE.ink;
  ctx.textBaseline = 'middle';
  ctx.scale(1.25, 1);
  ctx.font = '900 150px "Arial Black", "Helvetica Neue", Arial, sans-serif';
  drawTracked(ctx, 'LUMON', 0, 4, 150 * 0.14);
  ctx.restore();
}

function portrait(ctx, rect) {
  const [x, y, w, h] = rect;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / 256, h / 320);
  const bg = ctx.createRadialGradient(128, 140, 20, 128, 160, 220);
  bg.addColorStop(0, '#3B2A1F'); bg.addColorStop(1, '#1E1510');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 320);
  // jacket
  ctx.fillStyle = '#1A1612';
  ctx.beginPath(); ctx.moveTo(38, 200); ctx.lineTo(218, 200); ctx.lineTo(250, 320); ctx.lineTo(6, 320); ctx.closePath(); ctx.fill();
  // collar
  ctx.fillStyle = '#E9E4D8';
  ctx.beginPath(); ctx.moveTo(108, 196); ctx.lineTo(128, 236); ctx.lineTo(148, 196); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2A2320';
  ctx.beginPath(); ctx.moveTo(116, 200); ctx.lineTo(128, 262); ctx.lineTo(140, 200); ctx.closePath(); ctx.fill();
  // neck
  ctx.fillStyle = '#B08A6A'; ctx.fillRect(112, 180, 32, 30);
  // head
  const face = ctx.createLinearGradient(68, 130, 188, 130);
  face.addColorStop(0, '#D8B99A'); face.addColorStop(1, '#8A6A50');
  ctx.fillStyle = face;
  ctx.beginPath(); ctx.ellipse(128, 130, 60, 76, 0, 0, Math.PI * 2); ctx.fill();
  // hair and brow
  ctx.save();
  ctx.beginPath(); ctx.ellipse(128, 130, 60, 76, 0, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#3A2A22'; ctx.fillRect(60, 54, 136, 26);
  ctx.fillStyle = 'rgba(58,42,34,0.9)';
  ctx.fillRect(96, 108, 26, 5); ctx.fillRect(134, 108, 26, 5);
  ctx.fillStyle = '#2A1E18';
  ctx.beginPath(); ctx.ellipse(108, 122, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(148, 122, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#6A4A38'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(122, 152); ctx.lineTo(132, 154); ctx.stroke();
  ctx.strokeStyle = '#5A3A2C'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(110, 172); ctx.lineTo(146, 172); ctx.stroke();
  ctx.restore();
  // painterly noise
  const rng = mulberry32(77);
  ctx.fillStyle = 'rgba(255,240,220,0.04)';
  for (let i = 0; i < 2600; i++) ctx.fillRect(rng() * 256, rng() * 320, 2, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let i = 0; i < 2000; i++) ctx.fillRect(rng() * 256, rng() * 320, 2, 2);
  // label and inner border
  ctx.fillStyle = '#C9B27A'; ctx.font = 'italic 600 11px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('THE FOUNDER', 128, 306);
  ctx.strokeStyle = '#5A4520'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 246, 310);
  ctx.restore();
}

function stripes(ctx, rect) {
  const [x, y, w, h] = rect;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = PALETTE.powderBlue; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#F2F6F8'; ctx.lineWidth = 4;
  for (let d = -h; d < w + h; d += 12) {
    ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + d + h, y + h); ctx.stroke();
  }
  ctx.restore();
}

// 7, 8, 9, 10. Decal atlas: wordmark, portrait, placards, nameplate, droplet, finger-trap stripes, wayfinding.
export function atlasTexture() {
  return makeCanvasTexture(ATLAS_SIZE, ATLAS_SIZE, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    wordmark(ctx, ATLAS.wordmark);
    portrait(ctx, ATLAS.portrait);
    placard(ctx, ATLAS.mdr, ['MACRODATA REFINEMENT'], { fontPx: 0.26 });
    placard(ctx, ATLAS.breakroom, ['BREAK ROOM'], { fontPx: 0.30, sub: 'Refiners are reminded that the break room is not a reward.' });
    placard(ctx, ATLAS.wellness, ['WELLNESS  ->'], { fontPx: 0.34 });
    {
      const [x, y, rw, rh] = ATLAS.nameplate;
      ctx.fillStyle = '#D9C58F'; ctx.fillRect(x, y, rw, rh);
      ctx.strokeStyle = '#8C7440'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, rw - 2, rh - 2);
      ctx.fillStyle = PALETTE.ink; ctx.textBaseline = 'middle';
      ctx.font = '600 18px Georgia, "Times New Roman", serif';
      drawTracked(ctx, 'KIER EAGAN', x + rw / 2, y + rh / 2 + 1, 2.5);
    }
    {
      const [x, y, rw, rh] = ATLAS.droplet;
      ctx.fillStyle = '#FFFFFF';
      dropletPath(ctx, x, y, rw, rh);
      ctx.fill();
    }
    stripes(ctx, ATLAS.stripes);
    placard(ctx, ATLAS.wayfinding, ['<-  OPTICS & DESIGN          PERPETUITY WING  ->'], { fontPx: 0.38, tracking: 0.06 });
  }, { srgb: true, wrap: THREE.ClampToEdgeWrapping, anisotropy: 8 });
}

// 12. Keycap grid (256 x 96): 4 rows x 12 rounded keys on the key block; the top-left cell stays empty
// (there is no Escape key on a Lumon keyboard).
export function keycapTexture() {
  return makeCanvasTexture(256, 96, (ctx, w, h) => {
    ctx.fillStyle = PALETTE.keyBlock; ctx.fillRect(0, 0, w, h);
    const cw = w / 12, ch = h / 4, r = 3;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 12; col++) {
        if (row === 0 && col === 0) continue;
        const x = col * cw + 2, y = row * ch + 2, kw = cw - 4, kh = ch - 4;
        ctx.fillStyle = PALETTE.keycap;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + kw - r, y); ctx.quadraticCurveTo(x + kw, y, x + kw, y + r);
        ctx.lineTo(x + kw, y + kh - r); ctx.quadraticCurveTo(x + kw, y + kh, x + kw - r, y + kh);
        ctx.lineTo(x + r, y + kh); ctx.quadraticCurveTo(x, y + kh, x, y + kh - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.fillRect(x + 1, y + kh - 2, kw - 2, 1);
      }
    }
  }, { srgb: true, wrap: THREE.ClampToEdgeWrapping });
}
