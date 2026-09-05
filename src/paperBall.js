// Crumpled paper ball: hand position, cached geometry per seed, shared material per variant,
// physics -> mesh sync and the small scale animations (contract section 6, tech plan sections 3 and 6).
// Nothing here touches the DOM at import time; canvas textures are drawn lazily on first use.
import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { makeCanvasTexture, makeFbm2D } from './textures.js';
import { BALL_R } from './physics.js';

export const HAND_NDC = { x: 0.42, y: -0.52 };   // lower-right of the view, same screen spot for every aspect ratio
export const HAND_DIST = 0.55;                    // meters from the eye

const MAX_SEEDS = 6;
const TEX_SIZE = 512;

// ---------------------------------------------------------------------------------------------
// Hand position: NDC + distance -> world. Camera matrices (matrixWorld, projectionMatrixInverse) must be current.
// ---------------------------------------------------------------------------------------------
const _p = new THREE.Vector3();
const _camPos = new THREE.Vector3();

export function computeHandPosition(camera, out = new THREE.Vector3()) {
  _camPos.setFromMatrixPosition(camera.matrixWorld);
  _p.set(HAND_NDC.x, HAND_NDC.y, 0.5).unproject(camera);          // any depth on the pick ray
  return out.copy(_p).sub(_camPos).normalize().multiplyScalar(HAND_DIST).add(_camPos);
}

// ---------------------------------------------------------------------------------------------
// Geometry: crumpled icosahedron. One geometry per seed key (max 6), reference counted.
// ---------------------------------------------------------------------------------------------
const geoCache = new Map();          // key -> BufferGeometry (userData.refs = live meshes using it)
let noise = null;

function seedKey(seed) {
  const n = Number.isFinite(seed) ? Math.round(seed) : 1;
  return ((n % MAX_SEEDS) + MAX_SEEDS) % MAX_SEEDS;
}

function makePaperBallGeometry(radius, key) {
  if (!noise) noise = new ImprovedNoise();
  const geo = new THREE.IcosahedronGeometry(radius, 3);            // non-indexed, 1280 triangles: no cracks, flat facets
  const pos = geo.attributes.position;
  const off = 0.37 + key * 1.731;                                   // noise domain offset: a different crumple per seed
  const n = new THREE.Vector3();
  const d = new Float32Array(pos.count);
  let sum = 0;
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(pos, i).normalize();
    const low = noise.noise(n.x * 2.3 + off, n.y * 2.3, n.z * 2.3);
    const high = noise.noise(n.x * 6.5, n.y * 6.5 + off, n.z * 6.5);
    const ridge = 1 - Math.abs(noise.noise(n.x * 4.2 + off, n.y * 4.2 + off, n.z * 4.2));   // sharp creases
    d[i] = 1 + 0.18 * low + 0.07 * high - 0.12 * ridge;
    sum += d[i];
  }
  const k = radius * pos.count / sum;                              // mean radius == physics radius
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(pos, i).normalize().multiplyScalar(d[i] * k);
    pos.setXYZ(i, n.x, n.y, n.z);
  }
  geo.computeVertexNormals();                                       // per-face normals on the non-indexed mesh
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  geo.userData.refs = 0;
  geo.userData.seedKey = key;
  return geo;
}

function acquireGeometry(seed) {
  const key = seedKey(seed);
  let geo = geoCache.get(key);
  if (!geo) { geo = makePaperBallGeometry(BALL_R, key); geoCache.set(key, geo); }
  geo.userData.refs++;
  return geo;
}

// Frees the GPU buffers once no live mesh uses the geometry. The cache entry stays; three re-uploads it on next use.
function releaseGeometry(geo) {
  if (!geo || !geo.userData || geo.userData.refs === undefined) return;
  geo.userData.refs = Math.max(0, geo.userData.refs - 1);
  if (geo.userData.refs === 0) geo.dispose();
}

// ---------------------------------------------------------------------------------------------
// Paper textures (canvas) and shared materials per variant.
// ---------------------------------------------------------------------------------------------
const matCache = new Map();          // variant -> MeshStandardMaterial

// Grain plus thin crease lines baked into the base color. `base` is [r,g,b], `crease` the crease color.
function paintGrainAndCreases(ctx, w, h, rng, base, crease, grain, creaseSeed) {
  const fbm = makeFbm2D(creaseSeed, 72, w, 3);
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const dr = crease[0] - base[0], dg = crease[1] - base[1], db = crease[2] - base[2];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const g = (rng() - 0.5) * grain;
      const c = fbm(x, y) * 6.0;
      const iso = Math.abs(c - Math.round(c));                   // distance to the nearest iso level, 0..0.5
      const t = iso < 0.06 ? 1 - iso / 0.06 : 0;                 // thin dark line along each iso level
      px[i] = clamp255(base[0] + g + dr * t * 0.9);
      px[i + 1] = clamp255(base[1] + g + dg * t * 0.9);
      px[i + 2] = clamp255(base[2] + g + db * t * 0.9);
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

function setLetterSpacing(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

// Lumon: white paper, faint blue rules, a red margin, rows of macrodata digits, a tiny LUMON wordmark.
function drawLumonPaper(ctx, w, h, rng) {
  ctx.fillStyle = '#f7f7f2';
  ctx.fillRect(0, 0, w, h);
  paintGrainAndCreases(ctx, w, h, rng, [247, 247, 242], [217, 219, 212], 10, 31);

  const step = 28;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(191, 211, 226, 0.95)';                    // #BFD3E2 rules
  for (let y = 44; y < h; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(214, 116, 116, 0.55)';                    // margin line
  ctx.beginPath(); ctx.moveTo(70.5, 0); ctx.lineTo(70.5, h); ctx.stroke();

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  setLetterSpacing(ctx, 0);
  const mono = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
  for (let y = 64; y < h - 8; y += step) {
    for (let c = 0; c < 23; c++) {
      const scary = rng() < 0.05;                                   // a few digits stand out, as the refiners say
      ctx.font = `${scary ? '700 17px' : '500 15px'} ${mono}`;
      ctx.fillStyle = scary ? 'rgba(28, 42, 51, 0.85)' : `rgba(40, 40, 48, ${(0.35 + rng() * 0.35).toFixed(2)})`;
      ctx.fillText(String(rng() * 10 | 0), 84 + c * 18, y);
    }
  }

  // Wordmark: the word inside a thin oval, bottom right.
  const cx = w - 70, cy = h - 26;
  ctx.strokeStyle = '#4c6f92';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (typeof ctx.ellipse === 'function') ctx.ellipse(cx, cy, 36, 13, 0, 0, Math.PI * 2);
  else ctx.arc(cx, cy, 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#4c6f92';
  ctx.font = '700 11px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  setLetterSpacing(ctx, 3);
  ctx.fillText('LUMON', cx + 1.5, cy + 0.5);
  setLetterSpacing(ctx, 0);
}

// Beach: ivory paper with a printed serif paragraph block, running head and page number (a page torn from a novel).
const SYLLABLES = ['la', 're', 'mo', 'vi', 'ta', 'sen', 'dor', 'um', 'is', 'et', 'qua', 'ri', 'os', 'ne', 'ul',
  'ca', 'per', 'in', 'de', 'tu', 'ma', 'lo', 'sa', 've', 'ro', 'li', 'tem', 'por', 'ae', 'si'];

function pseudoWord(rng) {
  const n = 1 + (rng() * 3.2 | 0);
  let s = '';
  for (let i = 0; i < n; i++) s += SYLLABLES[rng() * SYLLABLES.length | 0];
  if (rng() < 0.08) s += ',';
  else if (rng() < 0.07) s += '.';
  return s;
}

// Draws justified pseudo-text lines from y downward; returns the y after the last line.
function drawParagraph(ctx, rng, { left, right, y, lineHeight, maxLines, firstIndent = 0, lastLine = true }) {
  const spaceW = ctx.measureText(' ').width;
  let lines = 0;
  let x0 = left + firstIndent;
  let words = [], widths = [], used = 0;
  while (lines < maxLines) {
    const wd = pseudoWord(rng);
    const ww = ctx.measureText(wd).width;
    const lineW = right - x0;
    if (words.length && used + spaceW * words.length + ww > lineW) {
      const gap = words.length > 1 ? (lineW - used) / (words.length - 1) : spaceW;   // justify
      let x = x0;
      for (let i = 0; i < words.length; i++) { ctx.fillText(words[i], x, y); x += widths[i] + gap; }
      y += lineHeight; lines++;
      words = [wd]; widths = [ww]; used = ww; x0 = left;
    } else {
      words.push(wd); widths.push(ww); used += ww;
    }
  }
  if (lastLine && words.length) {                                   // ragged last line
    let x = x0;
    for (let i = 0; i < words.length; i++) { ctx.fillText(words[i], x, y); x += widths[i] + spaceW; }
    y += lineHeight;
  }
  return y;
}

function drawBeachPaper(ctx, w, h, rng) {
  ctx.fillStyle = '#f1e9d6';
  ctx.fillRect(0, 0, w, h);
  paintGrainAndCreases(ctx, w, h, rng, [241, 233, 214], [214, 202, 178], 9, 47);

  // fibre flecks
  ctx.fillStyle = 'rgba(120, 100, 70, 0.22)';
  for (let i = 0; i < 110; i++) {
    const fx = rng() * w, fy = rng() * h;
    ctx.fillRect(fx, fy, 1 + rng() * 3, 1);
  }

  const ink = 'rgba(58, 52, 44, 0.84)';
  const serif = 'Georgia, "Times New Roman", Times, serif';
  ctx.fillStyle = ink;
  ctx.textBaseline = 'alphabetic';

  // running head + rule
  ctx.font = `600 11px ${serif}`;
  ctx.textAlign = 'center';
  setLetterSpacing(ctx, 3);
  ctx.fillText('THE SUMMER HOUSE', w / 2, 40);
  setLetterSpacing(ctx, 0);
  ctx.strokeStyle = 'rgba(58, 52, 44, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(56, 50.5); ctx.lineTo(w - 56, 50.5); ctx.stroke();

  // drop cap + first paragraph
  ctx.textAlign = 'left';
  const left = 56, right = w - 56, lh = 21;
  let y = 84;
  ctx.font = `600 46px ${serif}`;
  ctx.fillText('T', left, y + 30);
  ctx.font = `15px ${serif}`;
  y = drawParagraph(ctx, rng, { left: left + 36, right, y, lineHeight: lh, maxLines: 3, lastLine: false });
  y = drawParagraph(ctx, rng, { left, right, y, lineHeight: lh, maxLines: 6 });
  y += lh * 0.4;
  ctx.font = `italic 15px ${serif}`;
  y = drawParagraph(ctx, rng, { left, right, y, lineHeight: lh, maxLines: 2 });
  y += lh * 0.4;
  ctx.font = `15px ${serif}`;
  const remaining = Math.max(1, Math.floor((h - 64 - y) / lh));
  drawParagraph(ctx, rng, { left, right, y, lineHeight: lh, maxLines: remaining, firstIndent: 18 });

  // page number
  ctx.textAlign = 'center';
  ctx.font = `12px ${serif}`;
  ctx.fillText('217', w / 2, h - 22);
}

function makePaperMaterial(variant) {
  const beach = variant === 'beach';
  const map = makeCanvasTexture(TEX_SIZE, TEX_SIZE, beach ? drawBeachPaper : drawLumonPaper, {
    repeat: [2, 1], seed: beach ? 9 : 5, srgb: true,
  });
  const mat = new THREE.MeshStandardMaterial({
    map, color: 0xffffff, roughness: beach ? 0.92 : 0.95, metalness: 0, flatShading: true,
  });
  mat.name = `paper-${variant}`;
  return mat;
}

function getMaterial(variant) {
  const v = variant === 'beach' ? 'beach' : 'lumon';
  let m = matCache.get(v);
  if (!m) { m = makePaperMaterial(v); matCache.set(v, m); }
  return m;
}

// ---------------------------------------------------------------------------------------------
// Meshes
// ---------------------------------------------------------------------------------------------
const _euler = new THREE.Euler();

export function createPaperBallMesh({ variant = 'lumon', seed = 1 } = {}) {
  const geo = acquireGeometry(seed);
  const mesh = new THREE.Mesh(geo, getMaterial(variant));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'paperBall';
  // a random resting orientation so two balls with the same seed do not read as clones
  _euler.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
  mesh.quaternion.setFromEuler(_euler);
  mesh.userData.paperBall = {
    variant: variant === 'beach' ? 'beach' : 'lumon',
    seed: geo.userData.seedKey,
    anim: null,            // active scale animation (crinkle | popIn | shrink)
    boundBall: null,       // physics ball this mesh follows
    baseQ: new THREE.Quaternion(),   // visual orientation offset so orientation is continuous at the first sync
  };
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Physics -> mesh sync: position = lerp(prevP, p, alpha), orientation = slerp(prevQ, q, alpha) applied on top of
// the mesh orientation it had when it first started following the ball (no visual pop at launch).
// ---------------------------------------------------------------------------------------------
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

export function syncBallMesh(mesh, ball, alpha = 1) {
  if (!mesh || !ball) return;
  const p = ball.p, pp = ball.prevP || p;
  let a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  if (ball.state === 'sleeping') a = 1;                            // a resting ball sits exactly at p
  mesh.position.set(pp.x + (p.x - pp.x) * a, pp.y + (p.y - pp.y) * a, pp.z + (p.z - pp.z) * a);

  const q = ball.q, pq = ball.prevQ || q;
  if (!q) return;
  _qb.set(q.x, q.y, q.z, q.w);
  if (pq !== q) { _qa.set(pq.x, pq.y, pq.z, pq.w).slerp(_qb, a); } else { _qa.copy(_qb); }
  const pb = mesh.userData.paperBall;
  if (pb) {
    if (pb.boundBall !== ball) {
      // first sync for this ball: choose baseQ so that physicsQ * baseQ equals the current mesh orientation
      pb.boundBall = ball;
      pb.baseQ.copy(_qa).invert().multiply(mesh.quaternion).normalize();
    }
    mesh.quaternion.copy(_qa).multiply(pb.baseQ);
  } else {
    mesh.quaternion.copy(_qa);
  }
}

// ---------------------------------------------------------------------------------------------
// Scale animations, advanced by animateBallMeshes(dt) once per frame (dt in seconds).
// ---------------------------------------------------------------------------------------------
const animating = new Set();

function easeOutCubic(t) { const u = 1 - t; return 1 - u * u * u; }
function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; const u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; }

/** Grab squash: scale (1.08, 0.92, 1.08) -> (1, 1, 1) over 120 ms. */
export function crinkle(mesh) {
  const pb = mesh && mesh.userData.paperBall;
  if (!pb || (pb.anim && pb.anim.kind === 'shrink')) return;
  pb.anim = { kind: 'crinkle', t: 0, dur: 0.12 };
  mesh.scale.set(1.08, 0.92, 1.08);
  animating.add(mesh);
}

/** Spawn pop: scale 0 -> 1 with an ease-out-back over `ms` (default 220 ms). Not in the contract; optional for main.js. */
export function popIn(mesh, ms = 220) {
  const pb = mesh && mesh.userData.paperBall;
  if (!pb || (pb.anim && pb.anim.kind === 'shrink')) return;
  pb.anim = { kind: 'popIn', t: 0, dur: Math.max(0.001, ms / 1000) };
  mesh.scale.setScalar(0.001);
  animating.add(mesh);
}

function finishShrink(mesh, pb) {
  mesh.scale.setScalar(0.0001);
  mesh.visible = false;
  mesh.removeFromParent();
  releaseGeometry(mesh.geometry);
  const resolvers = pb.anim ? pb.anim.resolvers : null;
  pb.anim = null;
  pb.boundBall = null;
  animating.delete(mesh);
  if (resolvers) for (const r of resolvers) r(mesh);
}

/** Scale to 0 over `ms`, then remove from its parent and release the geometry (material stays shared). */
export function shrinkAndRemove(mesh, ms = 400) {
  return new Promise((resolve) => {
    const pb = mesh && mesh.userData.paperBall;
    if (!mesh) { resolve(mesh); return; }
    if (!pb) { mesh.removeFromParent(); resolve(mesh); return; }
    if (pb.anim && pb.anim.kind === 'shrink') { pb.anim.resolvers.push(resolve); return; }
    pb.anim = {
      kind: 'shrink', t: 0, dur: Math.max(0, ms) / 1000,
      fx: mesh.scale.x, fy: mesh.scale.y, fz: mesh.scale.z, resolvers: [resolve],
    };
    if (pb.anim.dur <= 0) { finishShrink(mesh, pb); return; }
    animating.add(mesh);
  });
}

/** Advance every active crinkle / popIn / shrink. dt in seconds. */
export function animateBallMeshes(dt) {
  if (animating.size === 0) return;
  const step = dt > 0 ? Math.min(dt, 0.1) : 0;
  for (const mesh of animating) {
    const pb = mesh.userData.paperBall;
    const an = pb && pb.anim;
    if (!an) { animating.delete(mesh); continue; }
    an.t += step;
    const t = an.dur > 0 ? Math.min(1, an.t / an.dur) : 1;
    if (an.kind === 'crinkle') {
      const k = 1 - easeOutCubic(t);
      mesh.scale.set(1 + 0.08 * k, 1 - 0.08 * k, 1 + 0.08 * k);
      if (t >= 1) { mesh.scale.setScalar(1); pb.anim = null; animating.delete(mesh); }
    } else if (an.kind === 'popIn') {
      const s = Math.max(0.001, easeOutBack(t));
      mesh.scale.setScalar(s);
      if (t >= 1) { mesh.scale.setScalar(1); pb.anim = null; animating.delete(mesh); }
    } else if (an.kind === 'shrink') {
      const k = (1 - t) * (1 - t);                                  // ease in toward zero
      mesh.scale.set(Math.max(0.0001, an.fx * k), Math.max(0.0001, an.fy * k), Math.max(0.0001, an.fz * k));
      if (t >= 1) finishShrink(mesh, pb);
    } else {
      pb.anim = null; animating.delete(mesh);
    }
  }
}

/** Frees every cached geometry, material and texture (full teardown; not needed between levels). */
export function disposePaperBallAssets() {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
  for (const m of matCache.values()) { if (m.map) m.map.dispose(); m.dispose(); }
  matCache.clear();
  animating.clear();
}
