// Feedback animations driven by main.js: FOV kick, bin wobble, rim glow, bin squash.
// No three.js import on purpose: everything works on the plain properties of the objects
// handed in (camera.fov, group.quaternion, group.scale, material.emissive), so this module
// imports cleanly anywhere. Every animation restores the original transform when it ends.

const DEG = Math.PI / 180;
const WOBBLE_CAP = 6 * DEG;
const WOBBLE_DECAY = 0.18;   // s, exponential envelope
const WOBBLE_HZ = 6;
const KICK_UP = 0.06;        // s
const KICK_DOWN = 0.16;      // s
const GLOW_MS = 0.25;        // s
const SQUASH_MS = 0.12;      // s

let reducedMotion = false;

export function setReducedMotion(on) { reducedMotion = !!on; }
export function isReducedMotion() { return reducedMotion; }

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * ((t - 1) ** 3) + c1 * ((t - 1) ** 2);
};

// Mark an object dirty when a level froze it with matrixAutoUpdate = false.
function markDirty(obj) {
  if (obj && obj.matrixAutoUpdate === false && typeof obj.updateMatrix === 'function') obj.updateMatrix();
}

// ---------------------------------------------------------------------------
// FOV kick on release: +1.5..2.5 degrees over 60 ms, back over 160 ms.

const kick = { active: false, camera: null, base: 0, amp: 0, t: 0 };

export function fovKick(camera, power = 0.5) {
  if (reducedMotion || !camera) return;
  if (!kick.active || kick.camera !== camera) kick.base = camera.fov;
  kick.camera = camera;
  kick.amp = 1.5 + 1.0 * clamp01(power);
  kick.t = 0;
  kick.active = true;
}

// main.js calls this when a resize changes the resting fov while a kick may be running.
export function setBaseFov(fov) {
  if (typeof fov === 'number' && Number.isFinite(fov)) kick.base = fov;
}

function updateKick(dt) {
  if (!kick.active) return;
  const cam = kick.camera;
  kick.t += dt;
  let f;
  if (kick.t < KICK_UP) f = easeOutQuad(kick.t / KICK_UP);
  else if (kick.t < KICK_UP + KICK_DOWN) f = 1 - easeInOutQuad((kick.t - KICK_UP) / KICK_DOWN);
  else { endKick(); return; }
  cam.fov = kick.base + kick.amp * f;
  cam.updateProjectionMatrix();
}

function endKick() {
  if (!kick.active) return;
  const cam = kick.camera;
  if (cam) { cam.fov = kick.base; cam.updateProjectionMatrix(); }
  kick.active = false;
  kick.camera = null;
}

// ---------------------------------------------------------------------------
// Bin wobble: damped sine about a horizontal axis perpendicular to the impact direction.
// The bin group pivots at its base center, so a rotation tilts the whole bin.

const wobble = {
  active: false, group: null, amp: 0, t: 0, duration: 0.5,
  axis: { x: 1, y: 0, z: 0 },
  orig: { x: 0, y: 0, z: 0, w: 1 },
};
const _axis = { x: 1, y: 0, z: 0 };
const _q = { x: 0, y: 0, z: 0, w: 1 };

function horizontalAxisFromImpact(dir, out) {
  let dx = 0, dz = -1;
  if (dir && Number.isFinite(dir.x) && Number.isFinite(dir.z)) { dx = dir.x; dz = dir.z; }
  let len = Math.hypot(dx, dz);
  if (len < 1e-6) { dx = 0; dz = -1; len = 1; }
  dx /= len; dz /= len;
  // up x d: rotating about this axis by a positive angle tips the top of the bin along d,
  // so the first swing goes the way the ball pushed it.
  out.x = dz; out.y = 0; out.z = -dx;
  return out;
}

export function binWobble(binGroup, impactDir, amplitudeDeg = 4) {
  if (!binGroup || !binGroup.quaternion) return;
  let A = Math.max(0, amplitudeDeg) * DEG;
  if (reducedMotion) A *= 0.5;
  if (A <= 0) return;
  horizontalAxisFromImpact(impactDir, _axis);

  if (wobble.active && wobble.group === binGroup) {
    // Add to what is still swinging (cap 6 degrees), blend the axis by amplitude.
    const cur = wobble.amp * Math.exp(-wobble.t / WOBBLE_DECAY);
    const ax = wobble.axis.x * cur + _axis.x * A;
    const az = wobble.axis.z * cur + _axis.z * A;
    const len = Math.hypot(ax, az);
    if (len > 1e-6) { wobble.axis.x = ax / len; wobble.axis.z = az / len; }
    else { wobble.axis.x = _axis.x; wobble.axis.z = _axis.z; }
    A = Math.min(WOBBLE_CAP, cur + A);
  } else {
    if (wobble.active) endWobble();
    const q = binGroup.quaternion;
    wobble.orig.x = q.x; wobble.orig.y = q.y; wobble.orig.z = q.z; wobble.orig.w = q.w;
    wobble.axis.x = _axis.x; wobble.axis.y = 0; wobble.axis.z = _axis.z;
    A = Math.min(WOBBLE_CAP, A);
  }
  wobble.group = binGroup;
  wobble.amp = A;
  wobble.t = 0;
  wobble.duration = reducedMotion ? 0.2 : 0.5;
  wobble.active = true;
}

function updateWobble(dt) {
  if (!wobble.active) return;
  wobble.t += dt;
  if (wobble.t >= wobble.duration) { endWobble(); return; }
  const ang = wobble.amp * Math.exp(-wobble.t / WOBBLE_DECAY) * Math.sin(2 * Math.PI * WOBBLE_HZ * wobble.t);
  const h = ang * 0.5, s = Math.sin(h), c = Math.cos(h);
  // q = axisAngle * orig  (world-space tilt applied on top of the original orientation)
  const ax = wobble.axis.x * s, ay = wobble.axis.y * s, az = wobble.axis.z * s, aw = c;
  const o = wobble.orig;
  _q.x = aw * o.x + ax * o.w + ay * o.z - az * o.y;
  _q.y = aw * o.y - ax * o.z + ay * o.w + az * o.x;
  _q.z = aw * o.z + ax * o.y - ay * o.x + az * o.w;
  _q.w = aw * o.w - ax * o.x - ay * o.y - az * o.z;
  wobble.group.quaternion.set(_q.x, _q.y, _q.z, _q.w);
  markDirty(wobble.group);
}

function endWobble() {
  if (!wobble.active) return;
  const g = wobble.group, o = wobble.orig;
  if (g && g.quaternion) { g.quaternion.set(o.x, o.y, o.z, o.w); markDirty(g); }
  wobble.active = false;
  wobble.group = null;
}

// ---------------------------------------------------------------------------
// Rim glow: emissive to the accent at 0.6, decaying to the original over 250 ms.

const glow = { active: false, mat: null, t: 0, origHex: 0, origIntensity: 1, colorHex: 0xffffff };

function materialOf(mesh) {
  if (!mesh) return null;
  const m = mesh.material;
  if (Array.isArray(m)) return m.find((x) => x && x.emissive) || null;
  return m && m.emissive ? m : null;
}

export function rimGlow(rimMesh, colorHex = 0x7fe0cc) {
  const mat = materialOf(rimMesh);
  if (!mat) return;
  if (glow.active && glow.mat !== mat) endGlow();
  if (!glow.active) {
    glow.origHex = mat.emissive.getHex();
    glow.origIntensity = typeof mat.emissiveIntensity === 'number' ? mat.emissiveIntensity : 1;
  }
  glow.mat = mat;
  glow.colorHex = colorHex;
  glow.t = 0;
  glow.active = true;
  mat.emissive.setHex(colorHex);
  mat.emissiveIntensity = 0.6;
}

function updateGlow(dt) {
  if (!glow.active) return;
  glow.t += dt;
  const u = glow.t / GLOW_MS;
  if (u >= 1) { endGlow(); return; }
  glow.mat.emissiveIntensity = 0.6 * (1 - easeOutQuad(u));
}

function endGlow() {
  if (!glow.active) return;
  const mat = glow.mat;
  if (mat && mat.emissive) { mat.emissive.setHex(glow.origHex); mat.emissiveIntensity = glow.origIntensity; }
  glow.active = false;
  glow.mat = null;
}

// ---------------------------------------------------------------------------
// Bin squash on a floor thud: scale.y 0.97 -> 1 over 120 ms with easeOutBack.

const squash = { active: false, group: null, t: 0, origY: 1 };

export function binSquash(binGroup) {
  if (!binGroup || !binGroup.scale) return;
  if (squash.active && squash.group !== binGroup) endSquash();
  if (!squash.active) squash.origY = binGroup.scale.y;
  squash.group = binGroup;
  squash.t = 0;
  squash.active = true;
  binGroup.scale.y = squash.origY * 0.97;
  markDirty(binGroup);
}

function updateSquash(dt) {
  if (!squash.active) return;
  squash.t += dt;
  const u = squash.t / SQUASH_MS;
  if (u >= 1) { endSquash(); return; }
  squash.group.scale.y = squash.origY * (0.97 + 0.03 * easeOutBack(u));
  markDirty(squash.group);
}

function endSquash() {
  if (!squash.active) return;
  const g = squash.group;
  if (g && g.scale) { g.scale.y = squash.origY; markDirty(g); }
  squash.active = false;
  squash.group = null;
}

// ---------------------------------------------------------------------------

export function update(dt) {
  if (!(dt > 0)) return;
  updateKick(dt);
  updateWobble(dt);
  updateGlow(dt);
  updateSquash(dt);
}

// Finish everything immediately and restore originals (used on level switch).
export function reset() {
  endKick();
  endWobble();
  endGlow();
  endSquash();
}

export function isActive() {
  return kick.active || wobble.active || glow.active || squash.active;
}
