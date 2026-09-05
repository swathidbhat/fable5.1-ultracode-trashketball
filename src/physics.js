// Trashketball physics: several paper balls (spheres of radius BALL_R) against static analytic colliders.
//
// - Fixed step FIXED_DT, semi-implicit Euler with implicit linear drag: v = (v + G h) / (1 + k h).
// - Colliders, resolved twice per step in this order: floor plane, world AABBs, capped vertical
//   cylinders, the bin (rim torus, frustum wall segments, bottom cap), sleeping balls (static spheres).
// - Contact response per docs/design/01-physics-and-throw.md section 3.6: an approach faster than
//   0.45 m/s is an impact (restitution + Coulomb friction impulse + event), anything slower is a
//   resting contact (normal velocity removed, tangential velocity damped by the rolling coefficient).
// - Bin side flag (3.3), scoring predicate (4) and sleep rules (2) exactly as documented.
//
// No three.js. Vectors are plain {x, y, z}. Every scratch value lives at module scope, so the
// integrate/collide path (step, predict, solveSpeedForTarget) never allocates. Event payloads are
// the one exception: an impact allocates its payload (a handful per throw, never per step) so that
// listeners may keep it. Events are queued during a ball's step and emitted after its physics is
// complete, so listeners may safely create or remove balls.
//
// Allocation hygiene (V8): a double stored into a field that ever held null is boxed on every store,
// and a fresh double passed to a function the JIT did not inline is boxed too. So per-step numbers
// live in fields initialised with numbers (mutated in place), contact parameters travel through the
// `sim` scratch object rather than as arguments, and the two nullable timestamps the contract asks
// for (ball.lastContactAt, predict().tContact) are accessors over numeric fields (-1 = null).
import { Emitter } from './events.js';

export const FIXED_DT = 1 / 240;   // physics step (s)
export const BALL_R = 0.04;        // ball radius (m)
export const GRAVITY = 9.81;
export const DRAG_K = 0.8;         // linear air drag, s^-1 (a = -k v)
export const MAX_SPEED = 12;

const R = BALL_R;
const V_BOUNCE = 0.45;             // m/s: faster approaches are impacts (bounce + event), slower are resting contacts
const SPIN_DECAY = 0.8;            // s^-1 decay of angular velocity in flight
const MAX_SPIN = 60;               // rad/s cap on rolling spin
const SLEEP_SPEED = 0.06, SLEEP_TIME = 0.40;   // in contact and this slow for this long -> sleep
const SLOW_SPEED = 0.30, SLOW_TIME = 3.0;      // jitter fallback: touched something and this slow for this long -> sleep
const MAX_AGE = 8.0;               // hard cap on a ball's life after launch (s)
const IN_HOLD = 0.30;              // seconds the IN predicate must hold to score (rule 1)
const PREDICT_CAP = 720;           // points the prediction buffer can hold (3 s at 240 Hz)
const MIN_THICK = 0.05;            // minimum AABB / cylinder thickness per axis (tunneling guarantee, doc 3.4)
const MAX_TAGS = 32;               // cap on ball.boxTags growth
const MAX_PENDING = 32;            // impact events queued per ball per step (2 passes over every collider)
const EPS = 1e-9;

const BALL_MAT = { restitution: 0.30, friction: 0.30, rollDamping: 3.0 };   // spent (sleeping) balls
const DEFAULT_FLOOR = { restitution: 0.30, friction: 0.45, rollDamping: 4.0 };
const DEFAULT_BOX = { restitution: 0.35, friction: 0.30, rollDamping: 2.5 };
const DEFAULT_CYL = { restitution: 0.40, friction: 0.30, rollDamping: 2.5 };
const DEFAULT_BIN_MATS = {
  wall: { restitution: 0.40, friction: 0.20, rollDamping: 3.0 },
  bottom: { restitution: 0.22, friction: 0.40, rollDamping: 5.0 },
  rim: { restitution: 0.45, friction: 0.15, rollDamping: 3.0 },
};
// Used when a level gives no bounds: design doc 2 (y < -1 or |xz| > 20 retires the ball).
const DEFAULT_BOUNDS = { minX: -20, maxX: 20, minZ: -20, maxZ: 20, minY: -1, maxY: 30 };
const EMPTY = [];
const NO_OPTS = {};

// Contact kinds: predict() type, event name, ball.contacts key.
const K_FLOOR = { type: 'floor', event: 'floorHit', key: 'floor' };
const K_BOX = { type: 'box', event: 'boxHit', key: 'box' };
const K_CYL = { type: 'cylinder', event: 'cylinderHit', key: 'cylinder' };
const K_RIM = { type: 'rim', event: 'rimHit', key: 'rim' };
const K_INNER = { type: 'binWall', event: 'binWallHit', key: 'inner' };
const K_OUTER = { type: 'binWall', event: 'binWallHit', key: 'outer' };
const K_BOTTOM = { type: 'binFloor', event: 'binFloorHit', key: 'bottom' };
const K_BALL = { type: 'ball', event: 'ballHit', key: 'ball' };

// ---------------------------------------------------------------------------------------------
// Module-scope scratch state (single-threaded: step / predict / solve never interleave).

const sim = {
  world: null,
  live: false,        // true: a real ball (bookkeeping + events). false: the prediction scratch ball
  now: 0,             // sim time at the end of the current step, stamped on contacts
  contact: false,     // some contact happened during the current step
  ballContact: false, // a sleeping ball pushed the ball during the current step (triggers the extra static pass)
  hit: false,         // prediction: the first impact has been recorded
  hitKind: null, hitTag: null, hitX: 0, hitY: 0, hitZ: 0,
  pending: 0,         // impact events queued for the ball being stepped
  h: FIXED_DT,        // step length of the current step
  nx: 0, ny: 1, nz: 0, d: 0,   // contact being resolved: unit normal toward the ball, penetration depth
  ux: 1, uz: 0, rho: 0,        // bin frame of the ball being tested: radial unit vector, radial distance
};

const pendingPool = [];
for (let i = 0; i < MAX_PENDING; i++) {
  pendingPool.push({ kind: null, tag: null, nx: 0, ny: 0, nz: 0, px: 0, py: 0, pz: 0, speed: 0, other: null });
}

// Ball record (contract section 3). A class rather than a literal: V8 keeps instances built from plain
// `this.x = ...` assignments in fast mode with in-place double fields, whereas a literal that carries an
// accessor is created in dictionary mode, where every numeric store allocates. The nullable timestamps
// the contract specifies are prototype getters over the numeric fields firstContactT / lastContactT
// (-1 = null), so the per-step store in resolveContact never boxes.
class Ball {
  constructor(id) {
    this.id = id;
    this.state = 'held';
    this.p = { x: 0, y: 0, z: 0 };
    this.prevP = { x: 0, y: 0, z: 0 };
    this.v = { x: 0, y: 0, z: 0 };
    this.w = { x: 0, y: 0, z: 0 };
    this.q = { x: 0, y: 0, z: 0, w: 1 };
    this.prevQ = { x: 0, y: 0, z: 0, w: 1 };
    this.scored = false;
    this.launchedAt = 0;
    this.firstContactT = -1;   // sim time of the first contact since launch, -1 = none
    this.lastContactT = -1;    // sim time of the last contact step, -1 = none
    this.contacts = { rim: 0, inner: 0, outer: 0, bottom: 0, floor: 0, box: 0, cylinder: 0, ball: 0, ceiling: 0 };
    this.boxTags = [];
    this.enteredIn = false;
    this.side = 'above';
    this.inTimer = 0;
    this.sleepTimer = 0;
    this.slowTimer = 0;
    this.lastNormal = { x: 0, y: 1, z: 0 };
    this.lastTag = null;
    this.userData = {};
  }
  get firstContactAt() { return this.firstContactT < 0 ? null : this.firstContactT; }
  set firstContactAt(t) { this.firstContactT = t === null || t === undefined ? -1 : t; }
  get lastContactAt() { return this.lastContactT < 0 ? null : this.lastContactT; }
  set lastContactAt(t) { this.lastContactT = t === null || t === undefined ? -1 : t; }
}

function makeBallRecord(id) { return new Ball(id); }

// predict() result. Same reasoning: a class so the nullable tContact can be a prototype getter over a
// numeric field while the instance stays a fast object.
class PredictResult {
  constructor() {
    this.points = new Float32Array(3 * PREDICT_CAP);
    this.count = 0;
    this.contact = null;
    this.tContactT = -1;   // -1 = no contact
  }
  get tContact() { return this.tContactT < 0 ? null : this.tContactT; }
}

// Scratch ball used by predict() and solveSpeedForTarget().
const scratch = makeBallRecord(-1);

// predict() result, reused across calls.
const predictContact = { type: 'floor', tag: null, point: { x: 0, y: 0, z: 0 }, t: 0 };
const predictResult = new PredictResult();

// ---------------------------------------------------------------------------------------------
// Integrator and spin

// Reads the step length from sim.h and the constants from the world (no double arguments: see the
// allocation note at the top).
function integrate(b, world) {
  const v = b.v, p = b.p, h = sim.h;
  const s = 1 / (1 + world.dragK * h);
  v.x *= s;
  v.y = (v.y - world.gravity * h) * s;
  v.z *= s;
  p.x += v.x * h;
  p.y += v.y * h;
  p.z += v.z * h;
}

function clampSpeed(v) {
  const l2 = v.x * v.x + v.y * v.y + v.z * v.z;
  if (l2 > MAX_SPEED * MAX_SPEED) {
    const s = MAX_SPEED / Math.sqrt(l2);
    v.x *= s; v.y *= s; v.z *= s;
  }
}

// Decay spin in flight, then rotate q by the axis-angle (w/|w|, |w| h) about world axes (premultiply)
// and renormalize.
function updateSpin(b, contact) {
  const w = b.w, q = b.q, h = sim.h;
  if (!contact) {
    const f = Math.exp(-SPIN_DECAY * h);
    w.x *= f; w.y *= f; w.z *= f;
  }
  const wl = Math.sqrt(w.x * w.x + w.y * w.y + w.z * w.z);
  if (wl < 1e-9) return;
  const half = 0.5 * wl * h;
  const s = Math.sin(half) / wl;
  const ax = w.x * s, ay = w.y * s, az = w.z * s, aw = Math.cos(half);
  const x = aw * q.x + ax * q.w + ay * q.z - az * q.y;
  const y = aw * q.y - ax * q.z + ay * q.w + az * q.x;
  const z = aw * q.z + ax * q.y - ay * q.x + az * q.w;
  const ww = aw * q.w - ax * q.x - ay * q.y - az * q.z;
  const inv = 1 / Math.sqrt(x * x + y * y + z * z + ww * ww);
  q.x = x * inv; q.y = y * inv; q.z = z * inv; q.w = ww * inv;
}

// ---------------------------------------------------------------------------------------------
// Contact response (design doc 3.6). The contact comes in through sim: n = (sim.nx, sim.ny, sim.nz)
// unit normal toward the ball, sim.d = penetration depth, sim.h = step length.

function resolveContact(b, mat, kind, tag, other) {
  const nx = sim.nx, ny = sim.ny, nz = sim.nz, d = sim.d, h = sim.h;
  const p = b.p, v = b.v;
  p.x += nx * d; p.y += ny * d; p.z += nz * d;
  const vn = v.x * nx + v.y * ny + v.z * nz;
  if (vn >= 0) return;
  const impact = -vn > V_BOUNCE;
  if (impact) {
    const jn = -(1 + mat.restitution) * vn;
    v.x += nx * jn; v.y += ny * jn; v.z += nz * jn;
    const vn2 = v.x * nx + v.y * ny + v.z * nz;
    const tx = v.x - nx * vn2, ty = v.y - ny * vn2, tz = v.z - nz * vn2;
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (tl > 1e-6) {
      const j = Math.min(mat.friction * jn, tl) / tl;
      v.x -= tx * j; v.y -= ty * j; v.z -= tz * j;
    }
  } else {
    v.x -= nx * vn; v.y -= ny * vn; v.z -= nz * vn;
    const vn2 = v.x * nx + v.y * ny + v.z * nz;
    const f = Math.exp(-mat.rollDamping * h);
    const tx = v.x - nx * vn2, ty = v.y - ny * vn2, tz = v.z - nz * vn2;
    v.x = nx * vn2 + tx * f; v.y = ny * vn2 + ty * f; v.z = nz * vn2 + tz * f;
  }
  sim.contact = true;

  // Rolling without slipping: w = (n x v) / R, capped.
  let wx = (ny * v.z - nz * v.y) / R, wy = (nz * v.x - nx * v.z) / R, wz = (nx * v.y - ny * v.x) / R;
  const wl = Math.sqrt(wx * wx + wy * wy + wz * wz);
  if (wl > MAX_SPIN) { const s = MAX_SPIN / wl; wx *= s; wy *= s; wz *= s; }
  b.w.x = wx; b.w.y = wy; b.w.z = wz;

  if (sim.live) {
    if (b.firstContactT < 0) b.firstContactT = sim.now;
    b.lastContactT = sim.now;
    b.lastNormal.x = nx; b.lastNormal.y = ny; b.lastNormal.z = nz;
    b.lastTag = tag;
    const c = b.contacts;
    const ceiling = kind === K_BOX && tag === 'ceiling';
    if (impact) {
      c[kind.key]++;
      if (ceiling) c.ceiling++;
    } else {
      // Resting contacts count once, so classification sees every surface the ball touched.
      if (c[kind.key] === 0) c[kind.key] = 1;
      if (ceiling && c.ceiling === 0) c.ceiling = 1;
    }
    if (kind === K_BOX || kind === K_CYL) {
      const bt = b.boxTags;
      if ((bt.length === 0 || bt[bt.length - 1] !== tag) && bt.length < MAX_TAGS) bt.push(tag);
    }
    if (impact && sim.pending < MAX_PENDING) {
      const e = pendingPool[sim.pending++];
      e.kind = kind; e.tag = tag; e.other = other;
      e.nx = nx; e.ny = ny; e.nz = nz;
      e.px = p.x - nx * R; e.py = p.y - ny * R; e.pz = p.z - nz * R;
      e.speed = -vn;
    }
  } else if (impact && !sim.hit) {
    sim.hit = true;
    sim.hitKind = kind;
    sim.hitTag = tag;
    sim.hitX = p.x - nx * R; sim.hitY = p.y - ny * R; sim.hitZ = p.z - nz * R;
  }
}

// Emit the impact events queued while stepping ball b (after its physics for the step is complete).
function flushPending(world, b) {
  const n = sim.pending;
  sim.pending = 0;
  const em = world.emitter;
  for (let i = 0; i < n; i++) {
    const e = pendingPool[i];
    em.emit(e.kind.event, {
      ball: b,
      point: { x: e.px, y: e.py, z: e.pz },
      normal: { x: e.nx, y: e.ny, z: e.nz },
      speed: e.speed,
      tag: e.tag,
      other: e.other,
    });
    e.other = null;
  }
}

// ---------------------------------------------------------------------------------------------
// Colliders

function collideFloor(b, floor) {
  const p = b.p;
  if (p.y < R) {
    sim.nx = 0; sim.ny = 1; sim.nz = 0; sim.d = R - p.y;
    resolveContact(b, floor, K_FLOOR, 'floor', null);
  }
}

// World-space AABB (design doc 3.2).
function collideBox(b, box) {
  const p = b.p, mn = box.min, mx = box.max;
  const qx = p.x < mn.x ? mn.x : (p.x > mx.x ? mx.x : p.x);
  const qy = p.y < mn.y ? mn.y : (p.y > mx.y ? mx.y : p.y);
  const qz = p.z < mn.z ? mn.z : (p.z > mx.z ? mx.z : p.z);
  const dx = p.x - qx, dy = p.y - qy, dz = p.z - qz;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 > 0) {
    if (d2 >= R * R) return;
    const dist = Math.sqrt(d2);
    sim.nx = dx / dist; sim.ny = dy / dist; sim.nz = dz / dist; sim.d = R - dist;
    resolveContact(b, box, K_BOX, box.tag, null);
    return;
  }
  // Centre inside the box: the face it entered through is the last slab crossed (largest entry time).
  const pp = b.prevP;
  let bestT = -1, nx = 0, ny = 0, nz = 0, d = 0, t;
  if (pp.x < mn.x) { t = (mn.x - pp.x) / (p.x - pp.x); if (t > bestT) { bestT = t; nx = -1; ny = 0; nz = 0; d = R + (p.x - mn.x); } }
  else if (pp.x > mx.x) { t = (mx.x - pp.x) / (p.x - pp.x); if (t > bestT) { bestT = t; nx = 1; ny = 0; nz = 0; d = R + (mx.x - p.x); } }
  if (pp.y < mn.y) { t = (mn.y - pp.y) / (p.y - pp.y); if (t > bestT) { bestT = t; nx = 0; ny = -1; nz = 0; d = R + (p.y - mn.y); } }
  else if (pp.y > mx.y) { t = (mx.y - pp.y) / (p.y - pp.y); if (t > bestT) { bestT = t; nx = 0; ny = 1; nz = 0; d = R + (mx.y - p.y); } }
  if (pp.z < mn.z) { t = (mn.z - pp.z) / (p.z - pp.z); if (t > bestT) { bestT = t; nx = 0; ny = 0; nz = -1; d = R + (p.z - mn.z); } }
  else if (pp.z > mx.z) { t = (mx.z - pp.z) / (p.z - pp.z); if (t > bestT) { bestT = t; nx = 0; ny = 0; nz = 1; d = R + (mx.z - p.z); } }
  if (bestT < 0) {
    // No slab was crossed this step (pushed in by another collider): take the least-penetrated face.
    let best = p.x - mn.x; nx = -1; ny = 0; nz = 0;
    let pen = mx.x - p.x; if (pen < best) { best = pen; nx = 1; ny = 0; nz = 0; }
    pen = p.y - mn.y; if (pen < best) { best = pen; nx = 0; ny = -1; nz = 0; }
    pen = mx.y - p.y; if (pen < best) { best = pen; nx = 0; ny = 1; nz = 0; }
    pen = p.z - mn.z; if (pen < best) { best = pen; nx = 0; ny = 0; nz = -1; }
    pen = mx.z - p.z; if (pen < best) { best = pen; nx = 0; ny = 0; nz = 1; }
    d = R + best;
  }
  sim.nx = nx; sim.ny = ny; sim.nz = nz; sim.d = d;
  resolveContact(b, box, K_BOX, box.tag, null);
}

// Capped vertical cylinder: a rectangle [0, radius] x [yMin, yMax] in the (rho, y) half-plane,
// handled like the AABB (closest point when the centre is outside, entry face when it is inside).
function collideCylinder(b, c) {
  const p = b.p;
  const dx = p.x - c.x, dz = p.z - c.z;
  const rho = Math.sqrt(dx * dx + dz * dz);
  let ux = 1, uz = 0;
  if (rho > 1e-6) { ux = dx / rho; uz = dz / rho; }
  const qr = rho < c.radius ? rho : c.radius;
  const qy = p.y < c.yMin ? c.yMin : (p.y > c.yMax ? c.yMax : p.y);
  const dr = rho - qr, dy = p.y - qy;
  const d2 = dr * dr + dy * dy;
  if (d2 > 0) {
    if (d2 >= R * R) return;
    const dist = Math.sqrt(d2);
    const nr = dr / dist;
    sim.nx = nr * ux; sim.ny = dy / dist; sim.nz = nr * uz; sim.d = R - dist;
    resolveContact(b, c, K_CYL, c.tag, null);
    return;
  }
  const pp = b.prevP;
  const pdx = pp.x - c.x, pdz = pp.z - c.z;
  const prho = Math.sqrt(pdx * pdx + pdz * pdz);
  let bestT = -1, nr = 0, ny = 0, d = 0, t;
  if (prho > c.radius) { t = (c.radius - prho) / (rho - prho); if (t > bestT) { bestT = t; nr = 1; ny = 0; d = R + (c.radius - rho); } }
  if (pp.y < c.yMin) { t = (c.yMin - pp.y) / (p.y - pp.y); if (t > bestT) { bestT = t; nr = 0; ny = -1; d = R + (p.y - c.yMin); } }
  else if (pp.y > c.yMax) { t = (c.yMax - pp.y) / (p.y - pp.y); if (t > bestT) { bestT = t; nr = 0; ny = 1; d = R + (c.yMax - p.y); } }
  if (bestT < 0) {
    let best = c.radius - rho; nr = 1; ny = 0;
    let pen = c.yMax - p.y; if (pen < best) { best = pen; nr = 0; ny = 1; }
    pen = p.y - c.yMin; if (pen < best) { best = pen; nr = 0; ny = -1; }
    d = R + best;
  }
  sim.nx = nr * ux; sim.ny = ny; sim.nz = nr * uz; sim.d = d;
  resolveContact(b, c, K_CYL, c.tag, null);
}

// Refresh the bin frame (sim.ux, sim.uz, sim.rho) of ball b after a contact moved it.
function binFrame(b, bin) {
  const dx = b.p.x - bin.x, dz = b.p.z - bin.z;
  const rho = Math.sqrt(dx * dx + dz * dz);
  sim.rho = rho;
  if (rho > 1e-6) { sim.ux = dx / rho; sim.uz = dz / rho; } else { sim.ux = 1; sim.uz = 0; }
}

// One frustum wall segment A->B in the (rho, y) plane with a designated normal (design doc 3.3), so a
// centre that lands inside the wall material is still pushed to the correct side. Reads the bin frame
// from sim. Returns true when a contact was resolved (the caller then refreshes the frame).
function collideWall(b, wseg, mat, kind, tag) {
  const p = b.p, ux = sim.ux, uz = sim.uz, rho = sim.rho;
  const qr = rho - wseg.ax, qy = p.y - wseg.ay;
  const t = (qr * wseg.ex + qy * wseg.ey) / wseg.L;
  if (t > 0 && t < 1) {
    const s = qr * wseg.nx + qy * wseg.ny;   // signed distance, negative when the centre is in the material
    if (s < R) {
      sim.nx = wseg.nx * ux; sim.ny = wseg.ny; sim.nz = wseg.nx * uz; sim.d = R - s;
      resolveContact(b, mat, kind, tag, null);
      return true;
    }
    return false;
  }
  const px = t <= 0 ? wseg.ax : wseg.bx, py = t <= 0 ? wseg.ay : wseg.by;
  const dr = rho - px, dy = p.y - py;
  const dist = Math.sqrt(dr * dr + dy * dy);
  if (dist < R) {
    let nr = wseg.nx, ny = wseg.ny;
    if (dist > 1e-9) { nr = dr / dist; ny = dy / dist; }
    sim.nx = nr * ux; sim.ny = ny; sim.nz = nr * uz; sim.d = R - dist;
    resolveContact(b, mat, kind, tag, null);
    return true;
  }
  return false;
}

// Bin: surface of revolution about (bin.x, bin.z). Side flag, then rim torus, then by side:
// inner wall + bottom cap (inside) or outer wall (outside). Above: rim only.
function collideBin(b, bin) {
  const p = b.p;
  binFrame(b, bin);
  const rho = sim.rho;

  if (p.y > bin.H + R) b.side = 'above';
  else if (b.side === 'above') b.side = rho < bin.rMid ? 'inside' : 'outside';   // decided once on the way down

  const er = rho - bin.rMid, ey = p.y - bin.H;
  const dist = Math.sqrt(er * er + ey * ey);
  const reach = bin.rt + R;
  if (dist < reach) {
    let nr = 0, ny = 1;
    if (dist > 1e-6) { nr = er / dist; ny = ey / dist; }
    sim.nx = nr * sim.ux; sim.ny = ny; sim.nz = nr * sim.uz; sim.d = reach - dist;
    resolveContact(b, bin.mats.rim, K_RIM, 'rim', null);
    binFrame(b, bin);
  }

  if (b.side === 'inside') {
    if (collideWall(b, bin.inner, bin.mats.wall, K_INNER, 'inner')) binFrame(b, bin);
    if (sim.rho <= bin.rInBot && p.y - bin.tb < R) {
      sim.nx = 0; sim.ny = 1; sim.nz = 0; sim.d = R - (p.y - bin.tb);
      resolveContact(b, bin.mats.bottom, K_BOTTOM, 'bottom', null);
    }
  } else if (b.side === 'outside') {
    collideWall(b, bin.outer, bin.mats.wall, K_OUTER, 'outer');
  }
}

// Sleeping balls are static spheres (design doc 3.5). Held and flying balls never collide.
function collideBalls(b, balls) {
  const p = b.p;
  for (let i = 0; i < balls.length; i++) {
    const o = balls[i];
    if (o === b || o.state !== 'sleeping') continue;
    const dx = p.x - o.p.x, dy = p.y - o.p.y, dz = p.z - o.p.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= 4 * R * R) continue;
    sim.ballContact = true;
    const dist = Math.sqrt(d2);
    if (dist > 1e-9) { sim.nx = dx / dist; sim.ny = dy / dist; sim.nz = dz / dist; sim.d = 2 * R - dist; }
    else { sim.nx = 0; sim.ny = 1; sim.nz = 0; sim.d = 2 * R; }
    resolveContact(b, BALL_MAT, K_BALL, 'ball', o);
  }
}

function collideStatic(b, lv, bin) {
  const boxes = lv.boxes, cyls = lv.cylinders;
  if (lv.floor) collideFloor(b, lv.floor);
  for (let i = 0; i < boxes.length; i++) collideBox(b, boxes[i]);
  for (let i = 0; i < cyls.length; i++) collideCylinder(b, cyls[i]);
  if (bin) collideBin(b, bin);
}

// Two passes over the whole collider list so paired contacts (floor + outer wall, bottom + inner wall) settle.
// When a sleeping ball pushed this one during the step, one more pass over the static colliders follows, so
// a ball wedged between a spent ball and the bin wall ends the step on the correct face of the wall (the
// residual of the sequential projection then lives in the soft ball-ball overlap, never in the thin wall).
function collideAll(b, world) {
  const lv = world.level, bin = world.bin, balls = world.balls;
  sim.ballContact = false;
  for (let pass = 0; pass < 2; pass++) {
    collideStatic(b, lv, bin);
    collideBalls(b, balls);
  }
  if (sim.ballContact) collideStatic(b, lv, bin);
}

// One integrate + collide + clamp step of length sim.h, shared by step() and predict().
function advance(b, world) {
  const p = b.p, pp = b.prevP;
  pp.x = p.x; pp.y = p.y; pp.z = p.z;
  integrate(b, world);
  sim.contact = false;
  collideAll(b, world);
  clampSpeed(b.v);
}

// ---------------------------------------------------------------------------------------------
// Bin helpers, scoring

function initSide(b, bin) {
  if (!bin) { b.side = 'above'; return; }
  const p = b.p;
  if (p.y > bin.H + R) { b.side = 'above'; return; }
  const dx = p.x - bin.x, dz = p.z - bin.z;
  b.side = Math.sqrt(dx * dx + dz * dz) < bin.rMid ? 'inside' : 'outside';
}

// IN predicate (design doc 4): inside the cup, clear of the wall by half a radius, below the rim by a radius.
function isIn(p, bin) {
  if (!(p.y > bin.tb && p.y < bin.H - R)) return false;
  const dx = p.x - bin.x, dz = p.z - bin.z;
  const rho = Math.sqrt(dx * dx + dz * dz);
  const rIn = bin.rInBot + (bin.rInTop - bin.rInBot) * (p.y - bin.tb) / (bin.H - bin.tb);
  return rho < rIn - 0.5 * R;
}

// Classification hint carried on the 'scored' payload tag (main.js owns the final call).
function scoreKind(b) {
  const c = b.contacts;
  if (c.box > 0 || c.cylinder > 0 || c.outer > 0) return 'bank';
  if (c.rim > 0 || c.inner > 0) return 'rattle';
  return 'swish';
}

// Scoring rules (design doc 4). Called once per step for every flying ball (tick = true adds sim.h to
// the IN timer), and once more, without a tick, when a ball is put to sleep (rule 3).
function updateScore(world, b, tick, sleeping) {
  const bin = world.bin;
  if (!bin || b.scored) return;
  if (!isIn(b.p, bin)) { b.inTimer = 0; return; }
  if (tick) b.inTimer += sim.h;
  b.enteredIn = true;
  if (b.inTimer >= IN_HOLD - EPS || b.p.y < 0.5 * bin.H || sleeping) {
    b.scored = true;
    world.emitter.emit('scored', statePayload(b, scoreKind(b)));
  }
}

function putToSleep(b) {
  b.state = 'sleeping';
  zeroVec(b.v);
  zeroVec(b.w);
  b.sleepTimer = 0; b.slowTimer = 0;
}

// One step of length sim.h for a flying ball.
function stepBall(world, b) {
  const q = b.q, pq = b.prevQ, h = sim.h;
  pq.x = q.x; pq.y = q.y; pq.z = q.z; pq.w = q.w;
  sim.pending = 0;
  advance(b, world);
  const contact = sim.contact;
  updateSpin(b, contact);
  flushPending(world, b);

  const p = b.p, v = b.v, bd = world.level.bounds;
  if (p.x < bd.minX || p.x > bd.maxX || p.z < bd.minZ || p.z > bd.maxZ || p.y < bd.minY || p.y > bd.maxY) {
    putToSleep(b);
    world.emitter.emit('outOfBounds', statePayload(b, 'bounds'));
    return;
  }
  const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (contact && speed < SLEEP_SPEED) b.sleepTimer += h; else b.sleepTimer = 0;
  if (b.firstContactT >= 0 && speed < SLOW_SPEED) b.slowTimer += h; else b.slowTimer = 0;
  const expired = sim.now - b.launchedAt >= MAX_AGE - EPS;
  if (expired && !contact) {
    // Hard cap reached while airborne: retire it (design doc 2) rather than freezing it in mid-air.
    putToSleep(b);
    world.emitter.emit('outOfBounds', statePayload(b, 'timeout'));
    return;
  }
  const goSleep = expired || b.sleepTimer >= SLEEP_TIME - EPS || b.slowTimer >= SLOW_TIME - EPS;
  if (goSleep) putToSleep(b);
  updateScore(world, b, true, goSleep);
  if (goSleep) world.emitter.emit('rest', statePayload(b, b.lastTag));
}

// Free flight (no colliders) with the shared integrator: horizontal distance along (dx, dz) where the arc
// descends through y = targetY; 0 when it never does (too short).
function freeFlightRange(world, pos, dx, dz, vh, vy, targetY) {
  const b = scratch;
  const p = b.p, pp = b.prevP, v = b.v;
  p.x = pos.x; p.y = pos.y; p.z = pos.z;
  v.x = vh * dx; v.y = vy; v.z = vh * dz;
  const h = FIXED_DT;
  sim.h = h;
  let t = 0;
  while (t < 6) {
    pp.x = p.x; pp.y = p.y; pp.z = p.z;
    integrate(b, world);
    t += h;
    if (v.y < 0 && p.y <= targetY && pp.y > targetY) {
      const f = (pp.y - targetY) / (pp.y - p.y);
      const x = pp.x + (p.x - pp.x) * f, z = pp.z + (p.z - pp.z) * f;
      return (x - pos.x) * dx + (z - pos.z) * dz;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------------------------
// Level normalization

function makeMat(m, def) {
  return {
    restitution: m && m.restitution !== undefined ? m.restitution : def.restitution,
    friction: m && m.friction !== undefined ? m.friction : def.friction,
    rollDamping: m && m.rollDamping !== undefined ? m.rollDamping : def.rollDamping,
  };
}

function makeWallSegment(ax, ay, bx, by, inner) {
  const dx = bx - ax, dy = by - ay;
  const L = Math.sqrt(dx * dx + dy * dy);
  const ex = dx / L, ey = dy / L;
  // inner: normal toward the axis, tilted up. outer: away from the axis, tilted down.
  return inner
    ? { ax, ay, bx, by, ex, ey, L, nx: -ey, ny: ex }
    : { ax, ay, bx, by, ex, ey, L, nx: ey, ny: -ex };
}

function buildBin(spec) {
  const H = spec.height, wall = spec.wall;
  const rOutTop = spec.rOutTop, rOutBot = spec.rOutBot;
  const rInTop = rOutTop - wall, rInBot = rOutBot - wall;
  const tb = spec.floorThick, rt = spec.rimTube;
  const mats = spec.materials || DEFAULT_BIN_MATS;
  return {
    x: spec.x, z: spec.z, H, rOutTop, rOutBot, rInTop, rInBot, tb, rt,
    rMid: rOutTop - wall / 2,
    inner: makeWallSegment(rInBot, tb, rInTop, H, true),
    outer: makeWallSegment(rOutBot, 0, rOutTop, H, false),
    mats: {
      wall: makeMat(mats.wall, DEFAULT_BIN_MATS.wall),
      bottom: makeMat(mats.bottom, DEFAULT_BIN_MATS.bottom),
      rim: makeMat(mats.rim, DEFAULT_BIN_MATS.rim),
    },
  };
}

// Sorted, padded to MIN_THICK about the centre (thin slabs would break the tunneling guarantee).
function padAxis(lo, hi, out, axis) {
  let a = lo, b = hi;
  if (a > b) { const t = a; a = b; b = t; }
  if (b - a < MIN_THICK) { const c = 0.5 * (a + b); a = c - MIN_THICK / 2; b = c + MIN_THICK / 2; }
  out.min[axis] = a; out.max[axis] = b;
}

function normalizeBox(src) {
  const mat = makeMat(src, DEFAULT_BOX);
  const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, ...mat, tag: src.tag !== undefined ? src.tag : 'box' };
  padAxis(src.min.x, src.max.x, box, 'x');
  padAxis(src.min.y, src.max.y, box, 'y');
  padAxis(src.min.z, src.max.z, box, 'z');
  return box;
}

function normalizeCylinder(src) {
  const mat = makeMat(src, DEFAULT_CYL);
  let y0 = src.yMin, y1 = src.yMax;
  if (y0 > y1) { const t = y0; y0 = y1; y1 = t; }
  if (y1 - y0 < MIN_THICK) { const c = 0.5 * (y0 + y1); y0 = c - MIN_THICK / 2; y1 = c + MIN_THICK / 2; }
  return {
    x: src.x, z: src.z, radius: Math.max(src.radius, 0.005), yMin: y0, yMax: y1, ...mat,
    tag: src.tag !== undefined ? src.tag : 'cylinder',
  };
}

function normalizeBounds(bd) {
  const d = DEFAULT_BOUNDS;
  if (!bd) return d;
  return {
    minX: bd.minX !== undefined ? bd.minX : d.minX, maxX: bd.maxX !== undefined ? bd.maxX : d.maxX,
    minZ: bd.minZ !== undefined ? bd.minZ : d.minZ, maxZ: bd.maxZ !== undefined ? bd.maxZ : d.maxZ,
    minY: bd.minY !== undefined ? bd.minY : d.minY, maxY: bd.maxY !== undefined ? bd.maxY : d.maxY,
  };
}

function emptyLevel() {
  return { floor: null, boxes: EMPTY, cylinders: EMPTY, bounds: DEFAULT_BOUNDS };
}

function zeroVec(v) { v.x = 0; v.y = 0; v.z = 0; }

// Payload for the state events (scored, rest, outOfBounds): the ball's current position, its last
// contact normal and its current speed.
function statePayload(b, tag) {
  const l2 = b.v.x * b.v.x + b.v.y * b.v.y + b.v.z * b.v.z;
  return {
    ball: b,
    point: { x: b.p.x, y: b.p.y, z: b.p.z },
    normal: { x: b.lastNormal.x, y: b.lastNormal.y, z: b.lastNormal.z },
    speed: Math.sqrt(l2),
    tag,
    other: null,
  };
}

// ---------------------------------------------------------------------------------------------
// World

// options: { dragK = DRAG_K, gravity = GRAVITY } (tests override them; the game uses the defaults).
export function createWorld(options) {
  const opts = options || NO_OPTS;
  const emitter = new Emitter();
  let nextId = 1;

  const world = {
    balls: [],
    time: 0,
    level: emptyLevel(),   // normalized { floor, boxes, cylinders, bounds }; read-only
    bin: null,             // normalized bin, read-only
    emitter,
    dragK: opts.dragK !== undefined ? opts.dragK : DRAG_K,
    gravity: opts.gravity !== undefined ? opts.gravity : GRAVITY,

    on(name, fn) { return emitter.on(name, fn); },
    once(name, fn) { return emitter.once(name, fn); },
    off(name, fn) { emitter.off(name, fn); },

    // levelPhysics = { floor, bin, boxes, cylinders, bounds } (contract section 3). Any part may be missing.
    setLevel(lp) {
      if (!lp) { world.level = emptyLevel(); world.bin = null; return; }
      world.level = {
        floor: lp.floor ? makeMat(lp.floor, DEFAULT_FLOOR) : null,
        boxes: lp.boxes && lp.boxes.length ? lp.boxes.map(normalizeBox) : EMPTY,
        cylinders: lp.cylinders && lp.cylinders.length ? lp.cylinders.map(normalizeCylinder) : EMPTY,
        bounds: normalizeBounds(lp.bounds),
      };
      world.bin = lp.bin ? buildBin(lp.bin) : null;
      for (let i = 0; i < world.balls.length; i++) {
        const b = world.balls[i];
        if (b.state === 'flying') initSide(b, world.bin);
      }
    },

    createBall() {
      const b = makeBallRecord(nextId++);
      world.balls.push(b);
      return b;
    },

    // p = prevP = pos, v = vel (clamped), w = omega (or 0); state 'flying'; contact bookkeeping reset.
    launch(ball, pos, vel, omega) {
      const b = ball;
      b.p.x = pos.x; b.p.y = pos.y; b.p.z = pos.z;
      b.prevP.x = pos.x; b.prevP.y = pos.y; b.prevP.z = pos.z;
      b.v.x = vel.x; b.v.y = vel.y; b.v.z = vel.z;
      clampSpeed(b.v);
      if (omega) { b.w.x = omega.x; b.w.y = omega.y; b.w.z = omega.z; } else zeroVec(b.w);
      b.prevQ.x = b.q.x; b.prevQ.y = b.q.y; b.prevQ.z = b.q.z; b.prevQ.w = b.q.w;
      b.state = 'flying';
      b.scored = false;
      b.launchedAt = world.time;
      b.firstContactT = -1; b.lastContactT = -1;
      const c = b.contacts;
      c.rim = 0; c.inner = 0; c.outer = 0; c.bottom = 0; c.floor = 0; c.box = 0; c.cylinder = 0; c.ball = 0; c.ceiling = 0;
      b.boxTags.length = 0;
      b.enteredIn = false;
      b.inTimer = 0; b.sleepTimer = 0; b.slowTimer = 0;
      b.lastNormal.x = 0; b.lastNormal.y = 1; b.lastNormal.z = 0;
      b.lastTag = null;
      initSide(b, world.bin);
    },

    // One fixed step for every flying ball. Held balls are skipped, sleeping balls are static colliders.
    step(dt) {
      const h = dt > 0 ? dt : FIXED_DT;
      sim.world = world; sim.live = true; sim.now = world.time + h; sim.h = h;
      const balls = world.balls;
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (b.state !== 'flying') continue;
        stepBall(world, b);
        if (balls[i] !== b) i--;   // a listener removed a ball at or before this index: re-examine it
      }
      world.time += h;
    },

    removeBall(ball) {
      const i = world.balls.indexOf(ball);
      if (i >= 0) world.balls.splice(i, 1);
    },

    // Predicted arc from (pos, vel) using the exact step() code path (same integrator, same colliders).
    // Reuses one result object and one Float32Array(3 * 720): copy anything you need to keep.
    // Samples every `sampleEvery` steps (index 0 = pos); when stopping on an impact the contact-step
    // position is appended as the last point. contact.type: 'floor' | 'box' | 'cylinder' | 'rim' |
    // 'binWall' | 'binFloor' | 'ball' (a sleeping ball).
    predict(pos, vel, options) {
      const o = options || NO_OPTS;
      const maxTime = o.maxTime !== undefined ? o.maxTime : 3;
      const stopOnContact = o.stopOnContact !== undefined ? o.stopOnContact : true;
      const every = o.sampleEvery !== undefined && o.sampleEvery > 0 ? (o.sampleEvery | 0) : 4;
      const b = scratch;
      b.state = 'flying';
      b.p.x = pos.x; b.p.y = pos.y; b.p.z = pos.z;
      b.prevP.x = pos.x; b.prevP.y = pos.y; b.prevP.z = pos.z;
      b.v.x = vel.x; b.v.y = vel.y; b.v.z = vel.z;
      clampSpeed(b.v);
      zeroVec(b.w);
      initSide(b, world.bin);
      sim.world = world; sim.live = false; sim.hit = false; sim.hitKind = null; sim.hitTag = null;

      const pts = predictResult.points;
      const h = FIXED_DT;
      sim.h = h;
      let count = 1, steps = 0, t = 0;
      pts[0] = pos.x; pts[1] = pos.y; pts[2] = pos.z;
      predictResult.contact = null;
      predictResult.tContactT = -1;

      while (t < maxTime - EPS && count < PREDICT_CAP) {
        advance(b, world);
        t += h; steps++;
        let sampled = false;
        if (steps % every === 0) {
          const k = count * 3;
          pts[k] = b.p.x; pts[k + 1] = b.p.y; pts[k + 2] = b.p.z;
          count++; sampled = true;
        }
        if (sim.hit && predictResult.contact === null) {
          predictContact.type = sim.hitKind.type;
          predictContact.tag = sim.hitTag;
          predictContact.point.x = sim.hitX; predictContact.point.y = sim.hitY; predictContact.point.z = sim.hitZ;
          predictContact.t = t;
          predictResult.contact = predictContact;
          predictResult.tContactT = t;
          if (stopOnContact) {
            if (!sampled && count < PREDICT_CAP) {
              const k = count * 3;
              pts[k] = b.p.x; pts[k + 1] = b.p.y; pts[k + 2] = b.p.z;
              count++;
            }
            break;
          }
        }
        if (b.p.y < -0.5) {
          if (!sampled && count < PREDICT_CAP) {
            const k = count * 3;
            pts[k] = b.p.x; pts[k + 1] = b.p.y; pts[k + 2] = b.p.z;
            count++;
          }
          break;
        }
      }
      predictResult.count = count;
      return predictResult;
    },

    // Bisection on launch speed (2..14 m/s, 25 iterations) so the free-flight arc along the horizontal unit
    // vector dirH at `elevation` (rad) descends through y = target.y at the target's horizontal distance.
    solveSpeedForTarget(pos, dirH, elevation, target) {
      let dx = dirH.x, dz = dirH.z;
      const dl = Math.sqrt(dx * dx + dz * dz);
      if (dl > 1e-9) { dx /= dl; dz /= dl; } else { dx = 0; dz = -1; }
      const tx = target.x - pos.x, tz = target.z - pos.z;
      const D = Math.sqrt(tx * tx + tz * tz);
      const ce = Math.cos(elevation), se = Math.sin(elevation);
      let lo = 2, hi = 14;
      for (let i = 0; i < 25; i++) {
        const mid = 0.5 * (lo + hi);
        const range = freeFlightRange(world, pos, dx, dz, mid * ce, mid * se, target.y);
        if (range < D) lo = mid; else hi = mid;
      }
      return 0.5 * (lo + hi);
    },

    isInBin(ball) {
      return world.bin ? isIn(ball.p, world.bin) : false;
    },

    // Force a flying ball to sleep (recycling). Scores it if it is IN (rule 3), then emits 'rest'.
    sleepBall(ball) {
      if (ball.state !== 'flying') return;
      putToSleep(ball);
      updateScore(world, ball, false, true);
      emitter.emit('rest', statePayload(ball, ball.lastTag));
    },
  };
  return world;
}
