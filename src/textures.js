// Procedural canvas textures. No image files anywhere in the project.
import * as THREE from 'three';

let MAX_ANISO = 8;
export function initTextures(renderer) {
  MAX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
}

// Deterministic PRNG so textures are identical every load.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    let t = (s += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D value noise in [0,1] with smooth interpolation; `period` in pixels. Tiles when size % period == 0.
export function makeValueNoise2D(seed, period, size) {
  const rng = mulberry32(seed);
  const n = Math.max(1, Math.round(size / period));
  const grid = new Float32Array(n * n);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = (x / period), gy = (y / period);
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const tx = fade(gx - x0), ty = fade(gy - y0);
    const ix0 = ((x0 % n) + n) % n, iy0 = ((y0 % n) + n) % n;
    const ix1 = (ix0 + 1) % n, iy1 = (iy0 + 1) % n;
    const a = grid[iy0 * n + ix0], b = grid[iy0 * n + ix1];
    const c = grid[iy1 * n + ix0], d = grid[iy1 * n + ix1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
}

// Fractal (multi-octave) tiling value noise in [0,1].
export function makeFbm2D(seed, basePeriod, size, octaves = 4) {
  const layers = [];
  let period = basePeriod, amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    layers.push({ fn: makeValueNoise2D(seed + o * 101, Math.max(2, period), size), amp });
    total += amp; period /= 2; amp /= 2;
  }
  return (x, y) => {
    let v = 0;
    for (const l of layers) v += l.fn(x, y) * l.amp;
    return v / total;
  };
}

/**
 * makeCanvasTexture(width, height, drawFn, opts) -> THREE.CanvasTexture
 *   drawFn(ctx, w, h, rng)
 *   opts.srgb (default true)  -> SRGBColorSpace for color maps; false for data maps (bump/roughness/alpha/normal)
 *   opts.repeat [x, y]        -> RepeatWrapping + texture.repeat
 *   opts.wrap                 -> override wrapping (default RepeatWrapping)
 *   opts.anisotropy           -> default = capped max supported
 *   opts.seed                 -> PRNG seed passed to drawFn
 *   opts.filter               -> 'linear' (default) | 'nearest'
 */
export function makeCanvasTexture(width, height, drawFn, opts = {}) {
  const {
    srgb = true, repeat = [1, 1], anisotropy = MAX_ANISO, seed = 1,
    wrap = THREE.RepeatWrapping, filter = 'linear',
  } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height, mulberry32(seed));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = wrap;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = anisotropy;
  if (filter === 'nearest') { tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipmapLinearFilter; }
  tex.userData.canvas = canvas;
  tex.userData.ctx = ctx;
  return tex;
}

// Redraw helper for animated canvas textures (monitor screens etc.).
export function redrawCanvasTexture(tex, drawFn) {
  const { canvas, ctx } = tex.userData;
  drawFn(ctx, canvas.width, canvas.height);
  tex.needsUpdate = true;
}

// Text on a flat field (placards, signs, magazine covers).
export function textTexture(lines, {
  width = 1024, height = 512, bg = '#f4f3ee', fg = '#1c2a33',
  font = '600 96px "Helvetica Neue", Arial, sans-serif', lineHeight = 120, letterSpacing = 0,
  border = null, align = 'center', padding = 0,
} = {}) {
  return makeCanvasTexture(width, height, (ctx, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 4; ctx.strokeRect(2, 2, w - 4, h - 4); }
    ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx && letterSpacing) ctx.letterSpacing = `${letterSpacing}px`;
    const x = align === 'left' ? padding : align === 'right' ? w - padding : w / 2;
    lines.forEach((t, i) => ctx.fillText(t, x, h / 2 + (i - (lines.length - 1) / 2) * lineHeight));
  }, { wrap: THREE.ClampToEdgeWrapping });
}

// Soft radial disc, white center to transparent edge (contact shadows, glow sprites).
export function radialAlphaTexture(size = 128, inner = 0.0, outer = 1.0, { srgb = false } = {}) {
  return makeCanvasTexture(size, size, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, (w / 2) * inner, w / 2, h / 2, (w / 2) * outer);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, { srgb, wrap: THREE.ClampToEdgeWrapping });
}

// Per-pixel noise field helper: fills the canvas from a callback returning [r,g,b] (0-255) per pixel.
export function fillPixels(ctx, w, h, pixelFn) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b, a = 255] = pixelFn(x, y);
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }
