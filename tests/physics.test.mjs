// Trashketball physics tests. Run: node tests/physics.test.mjs  (exit code 1 on any failure).
import assert from 'node:assert/strict';
import { createWorld, FIXED_DT, BALL_R, GRAVITY, DRAG_K, MAX_SPEED } from '../src/physics.js';

let passes = 0, failures = 0;
function test(name, fn) {
  try {
    fn();
    passes++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures++;
    const msg = err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n      ') : String(err);
    console.log(`FAIL  ${name}\n      ${msg}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Fixtures (level 1 numbers from the contract, section 9.1)

const R = BALL_R;
const DEG = Math.PI / 180;
const L1_BIN = {
  x: 0.75, z: -4.40, height: 0.32, rOutTop: 0.150, rOutBot: 0.120, wall: 0.006, floorThick: 0.008, rimTube: 0.009,
  materials: {
    wall: { restitution: 0.40, friction: 0.20, rollDamping: 3.0 },
    bottom: { restitution: 0.22, friction: 0.40, rollDamping: 5.0 },
    rim: { restitution: 0.45, friction: 0.15, rollDamping: 3.0 },
  },
};
const L1_FLOOR = { restitution: 0.30, friction: 0.45, rollDamping: 4.0 };
const L1_BOUNDS = { minX: -7.5, maxX: 7.5, minZ: -14, maxZ: 12, minY: -1, maxY: 30 };
const BIN_H = L1_BIN.height, BIN_TB = L1_BIN.floorThick;
const R_IN_TOP = L1_BIN.rOutTop - L1_BIN.wall, R_IN_BOT = L1_BIN.rOutBot - L1_BIN.wall;
const R_MID = L1_BIN.rOutTop - L1_BIN.wall / 2;

function makeLevel(extra) {
  return { floor: L1_FLOOR, bin: L1_BIN, boxes: [], cylinders: [], bounds: L1_BOUNDS, ...(extra || {}) };
}
function levelWorld(extra, opts) {
  const w = createWorld(opts);
  w.setLevel(makeLevel(extra));
  return w;
}
function run(world, seconds) {
  const n = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < n; i++) world.step(FIXED_DT);
}
// Steps until pred() is true; returns the elapsed time or -1 on timeout.
function runUntil(world, pred, maxSeconds) {
  const n = Math.round(maxSeconds / FIXED_DT);
  for (let i = 0; i < n; i++) {
    world.step(FIXED_DT);
    if (pred()) return (i + 1) * FIXED_DT;
  }
  return -1;
}
function launch(world, x, y, z, vx, vy, vz, omega) {
  const b = world.createBall();
  world.launch(b, { x, y, z }, { x: vx || 0, y: vy || 0, z: vz || 0 }, omega || null);
  return b;
}
function rhoOf(b) { return Math.hypot(b.p.x - L1_BIN.x, b.p.z - L1_BIN.z); }
function counter(world, name, filter) {
  const c = { n: 0, last: null, all: [] };
  world.on(name, (e) => { if (filter && !filter(e)) return; c.n++; c.last = e; c.all.push(e); });
  return c;
}
function near(a, b, tol, what) {
  assert.ok(Math.abs(a - b) <= tol, `${what || 'value'}: ${a} not within ${tol} of ${b}`);
}
// Free flight: where the arc descends through y = yCross (interpolated between steps).
function descentCrossing(world, ball, yCross, maxSeconds) {
  const n = Math.round(maxSeconds / FIXED_DT);
  for (let i = 0; i < n; i++) {
    world.step(FIXED_DT);
    if (ball.v.y < 0 && ball.p.y <= yCross && ball.prevP.y > yCross) {
      const f = (ball.prevP.y - yCross) / (ball.prevP.y - ball.p.y);
      return {
        x: ball.prevP.x + (ball.p.x - ball.prevP.x) * f,
        z: ball.prevP.z + (ball.p.z - ball.prevP.z) * f,
        t: i * FIXED_DT + f * FIXED_DT,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Constants and API shape

test('exports the shared constants', () => {
  assert.equal(FIXED_DT, 1 / 240);
  assert.equal(BALL_R, 0.04);
  assert.equal(GRAVITY, 9.81);
  assert.equal(DRAG_K, 0.8);
  assert.equal(MAX_SPEED, 12);
});

test('world and ball have the contract shape', () => {
  const w = createWorld();
  for (const k of ['setLevel', 'createBall', 'launch', 'step', 'removeBall', 'predict', 'solveSpeedForTarget', 'on', 'off', 'isInBin', 'sleepBall']) {
    assert.equal(typeof w[k], 'function', `world.${k}`);
  }
  assert.ok(Array.isArray(w.balls));
  assert.equal(w.time, 0);
  const b = w.createBall();
  assert.equal(b.state, 'held');
  assert.equal(w.balls[0], b);
  for (const k of ['p', 'prevP', 'v', 'w']) assert.deepEqual(Object.keys(b[k]), ['x', 'y', 'z'], k);
  assert.deepEqual(b.q, { x: 0, y: 0, z: 0, w: 1 });
  assert.deepEqual(b.prevQ, { x: 0, y: 0, z: 0, w: 1 });
  assert.deepEqual(b.contacts, { rim: 0, inner: 0, outer: 0, bottom: 0, floor: 0, box: 0, cylinder: 0, ball: 0, ceiling: 0 });
  assert.deepEqual(b.boxTags, []);
  assert.equal(b.scored, false);
  assert.equal(b.enteredIn, false);
  assert.equal(b.side, 'above');
  assert.equal(b.inTimer, 0);
  assert.equal(b.sleepTimer, 0);
  assert.equal(b.firstContactAt, null);
  assert.equal(b.lastContactAt, null);
  assert.deepEqual(b.userData, {});
  w.removeBall(b);
  assert.equal(w.balls.length, 0);
});

// ---------------------------------------------------------------------------------------------
// Free flight (design doc section 6)

test('free flight: 7.816 m/s at 50 deg from (0, 1.30, 0) crosses y = 0.30 at x in 3.99..4.01', () => {
  const w = createWorld();   // no level: no colliders
  const v0 = 7.816, th = 50 * DEG;
  const b = launch(w, 0, 1.30, 0, v0 * Math.cos(th), v0 * Math.sin(th), 0);
  const c = descentCrossing(w, b, 0.30, 3);
  assert.ok(c, 'arc never descended through y = 0.30');
  assert.ok(c.x >= 3.99 && c.x <= 4.01, `x = ${c.x}`);
  near(c.t, 1.264, 0.01, 'flight time');
});

test('free flight without drag: 5.756 m/s at 50 deg crosses y = 0.30 at x = 4.007 (vacuum closed form)', () => {
  const w = createWorld({ dragK: 0 });
  const v0 = 5.756, th = 50 * DEG;
  const b = launch(w, 0, 1.30, 0, v0 * Math.cos(th), v0 * Math.sin(th), 0);
  const c = descentCrossing(w, b, 0.30, 3);
  assert.ok(c, 'arc never descended through y = 0.30');
  near(c.x, 4.007, 0.006, 'x');
  near(c.t, 1.083, 0.01, 'flight time');
});

test('free flight speed sensitivity: +-0.1 m/s moves the landing by about 0.07 m', () => {
  const th = 50 * DEG;
  const range = (v0) => {
    const w = createWorld();
    const b = launch(w, 0, 1.30, 0, v0 * Math.cos(th), v0 * Math.sin(th), 0);
    return descentCrossing(w, b, 0.30, 3).x;
  };
  near(range(7.716), 3.929, 0.012, 'range at 7.716');
  near(range(7.916), 4.071, 0.012, 'range at 7.916');
});

test('solveSpeedForTarget returns 7.816 +- 0.02 for the section 6 setup', () => {
  const w = createWorld();
  const v = w.solveSpeedForTarget({ x: 0, y: 1.30, z: 0 }, { x: 1, y: 0, z: 0 }, 50 * DEG, { x: 4, y: 0.30, z: 0 });
  near(v, 7.816, 0.02, 'speed');
  // Works along an arbitrary horizontal direction and with a non-unit dirH.
  const v2 = w.solveSpeedForTarget({ x: 1.1, y: 1.30, z: -0.2 }, { x: -0.7, y: 0, z: -8.4 }, 50 * DEG, { x: 0.75, y: 0.30, z: -4.4 });
  const dist = Math.hypot(0.75 - 1.1, -4.4 + 0.2);
  const wv = createWorld();
  const dirH = { x: (0.75 - 1.1) / dist, z: (-4.4 + 0.2) / dist };
  const b = launch(wv, 1.1, 1.30, -0.2, v2 * Math.cos(50 * DEG) * dirH.x, v2 * Math.sin(50 * DEG), v2 * Math.cos(50 * DEG) * dirH.z);
  const c = descentCrossing(wv, b, 0.30, 3);
  near(Math.hypot(c.x - 1.1, c.z + 0.2), dist, 0.002, 'landing distance');
  // Bins at 3.5 / 4.5 m (doc: 7.099 / 8.510 with the exact integrator; +-0.02 for the discrete one).
  near(w.solveSpeedForTarget({ x: 0, y: 1.30, z: 0 }, { x: 1, y: 0, z: 0 }, 50 * DEG, { x: 3.5, y: 0.30, z: 0 }), 7.099, 0.02, '3.5 m');
  near(w.solveSpeedForTarget({ x: 0, y: 1.30, z: 0 }, { x: 1, y: 0, z: 0 }, 50 * DEG, { x: 4.5, y: 0.30, z: 0 }), 8.510, 0.02, '4.5 m');
});

// ---------------------------------------------------------------------------------------------
// Floor

test('floor bounce restitution (no gravity): -3 m/s becomes +0.9 m/s, floorHit reports 3 m/s', () => {
  const w = createWorld({ gravity: 0, dragK: 0 });
  w.setLevel({ floor: L1_FLOOR });
  const hits = counter(w, 'floorHit');
  const b = launch(w, 0, 0.1, 0, 0, -3, 0);
  const t = runUntil(w, () => hits.n > 0, 0.2);
  assert.ok(t > 0, 'floorHit never fired');
  near(b.v.y, 0.9, 1e-9, 'v.y after bounce');
  near(hits.last.speed, 3, 1e-9, 'event speed');
  assert.deepEqual(hits.last.normal, { x: 0, y: 1, z: 0 });
  near(hits.last.point.y, 0, 1e-9, 'contact point on the floor');
  assert.equal(hits.last.ball, b);
  assert.equal(hits.last.tag, 'floor');
  assert.ok(b.p.y >= R - 1e-9, 'ball pushed out of the floor');
  assert.equal(b.contacts.floor, 1);
  assert.equal(b.firstContactAt, t);
});

test('floor bounce with gravity: rebound speed is 0.30 of the impact speed, then rests and sleeps', () => {
  const w = createWorld({ dragK: 0 });
  w.setLevel({ floor: L1_FLOOR });
  const hits = counter(w, 'floorHit');
  const rest = counter(w, 'rest');
  const b = launch(w, 0, 1.04, 0, 0, 0, 0);
  runUntil(w, () => hits.n > 0, 1);
  near(hits.last.speed, Math.sqrt(2 * GRAVITY * 1.0), 0.05, 'impact speed');
  near(b.v.y, 0.30 * hits.last.speed, 0.05, 'rebound');
  const t = runUntil(w, () => b.state === 'sleeping', 4);
  assert.ok(t > 0, 'ball never slept');
  assert.equal(rest.n, 1);
  assert.equal(rest.last.ball, b);
  near(b.p.y, R, 1e-6, 'rests on the floor');
  assert.deepEqual(b.v, { x: 0, y: 0, z: 0 });
});

test('impact events fire only above 0.45 m/s (a 0.26 m drop gives exactly two floorHit events)', () => {
  const w = levelWorld();
  const hits = counter(w, 'floorHit');
  const b = launch(w, 0, 0.30, 0);
  runUntil(w, () => b.state === 'sleeping', 5);
  assert.equal(b.state, 'sleeping');
  assert.equal(hits.n, 2, `floorHit count ${hits.n}`);
  for (const e of hits.all) assert.ok(e.speed > 0.45, `event speed ${e.speed}`);
});

test('a ball rolling on the floor slows down (rolling damping) and never jitters at rest', () => {
  const w = levelWorld();
  const b = launch(w, 0, R, 0, 1.5, 0, 0);
  run(w, 0.5);
  assert.ok(b.v.x > 0 && b.v.x < 1.5, `rolling speed ${b.v.x}`);
  near(b.p.y, R, 1e-6, 'height while rolling');
  let maxDev = 0;
  const t = runUntil(w, () => { maxDev = Math.max(maxDev, Math.abs(b.p.y - R)); return b.state === 'sleeping'; }, 5);
  assert.ok(t > 0, 'never slept');
  assert.ok(maxDev < 1e-3, `vertical jitter ${maxDev}`);
});

// ---------------------------------------------------------------------------------------------
// AABB and cylinder

const CRATE = { min: { x: -0.5, y: 0.5, z: -0.5 }, max: { x: 0.5, y: 1.5, z: 0.5 }, restitution: 0.5, friction: 0.3, rollDamping: 2.5, tag: 'crate' };
const FACES = [
  { n: { x: 1, y: 0, z: 0 }, c: { x: 0.5, y: 1, z: 0 } }, { n: { x: -1, y: 0, z: 0 }, c: { x: -0.5, y: 1, z: 0 } },
  { n: { x: 0, y: 1, z: 0 }, c: { x: 0, y: 1.5, z: 0 } }, { n: { x: 0, y: -1, z: 0 }, c: { x: 0, y: 0.5, z: 0 } },
  { n: { x: 0, y: 0, z: 1 }, c: { x: 0, y: 1, z: 0.5 } }, { n: { x: 0, y: 0, z: -1 }, c: { x: 0, y: 1, z: -0.5 } },
];

function faceBounce(speed) {
  for (const f of FACES) {
    const w = createWorld({ gravity: 0, dragK: 0 });
    w.setLevel({ boxes: [CRATE] });
    const hits = counter(w, 'boxHit');
    const start = { x: f.c.x + f.n.x * 0.3, y: f.c.y + f.n.y * 0.3, z: f.c.z + f.n.z * 0.3 };
    const b = launch(w, start.x, start.y, start.z, -f.n.x * speed, -f.n.y * speed, -f.n.z * speed);
    const t = runUntil(w, () => hits.n > 0, 1);
    assert.ok(t > 0, `no boxHit on face ${JSON.stringify(f.n)}`);
    const e = hits.last;
    assert.equal(e.tag, 'crate');
    near(e.normal.x, f.n.x, 1e-9, 'normal.x'); near(e.normal.y, f.n.y, 1e-9, 'normal.y'); near(e.normal.z, f.n.z, 1e-9, 'normal.z');
    near(e.speed, speed, 1e-9, 'impact speed');
    const vn = b.v.x * f.n.x + b.v.y * f.n.y + b.v.z * f.n.z;
    near(vn, 0.5 * speed, 1e-9, `reflected normal speed on face ${JSON.stringify(f.n)}`);
    const out = (b.p.x - f.c.x) * f.n.x + (b.p.y - f.c.y) * f.n.y + (b.p.z - f.c.z) * f.n.z;
    assert.ok(out >= R - 1e-9, `ball not pushed out of the box (${out})`);
    assert.equal(b.contacts.box, 1);
    assert.deepEqual(b.boxTags, ['crate']);
  }
}

test('AABB bounce from each of the six faces (slow approach, closest-point branch)', () => faceBounce(2));
test('AABB bounce from each of the six faces (fast approach, centre enters the box, entry-face branch)', () => faceBounce(11));

test('AABB corner and edge approaches use the rounded (Minkowski) normal', () => {
  const w = createWorld({ gravity: 0, dragK: 0 });
  w.setLevel({ boxes: [CRATE] });
  const hits = counter(w, 'boxHit');
  const s = Math.SQRT1_2;
  const b = launch(w, 0.5 + 0.3 * s, 1.5 + 0.3 * s, 0, -2 * s, -2 * s, 0);
  assert.ok(runUntil(w, () => hits.n > 0, 1) > 0);
  near(hits.last.normal.x, s, 1e-6, 'edge normal x');
  near(hits.last.normal.y, s, 1e-6, 'edge normal y');
  assert.ok(b.v.x > 0 && b.v.y > 0, 'reflected away from the edge');
});

test('thin boxes are padded to 0.05 m so a 12 m/s ball cannot tunnel through them', () => {
  const w = createWorld({ gravity: 0, dragK: 0 });
  w.setLevel({ boxes: [{ min: { x: -1, y: 0.999, z: -1 }, max: { x: 1, y: 1.001, z: 1 }, tag: 'glass' }] });
  const hits = counter(w, 'boxHit');
  const b = launch(w, 0, 1.5, 0, 0, -12, 0);
  run(w, 0.5);
  assert.equal(hits.n, 1);
  assert.equal(hits.last.tag, 'glass');
  assert.ok(b.p.y > 1.0 && b.v.y > 0, 'ball stayed above the pane');
});

test('cylinder: side and top-cap bounces with the right normals', () => {
  const cyl = { x: 0, z: 0, radius: 0.2, yMin: 0, yMax: 1, restitution: 0.4, friction: 0.3, rollDamping: 2.5, tag: 'plant' };
  let w = createWorld({ gravity: 0, dragK: 0 });
  w.setLevel({ cylinders: [cyl] });
  let hits = counter(w, 'cylinderHit');
  let b = launch(w, 0.6, 0.5, 0, -3, 0, 0);
  assert.ok(runUntil(w, () => hits.n > 0, 1) > 0, 'side hit');
  near(hits.last.normal.x, 1, 1e-9, 'side normal'); near(hits.last.normal.y, 0, 1e-9, 'side normal y');
  near(b.v.x, 1.2, 1e-9, 'side rebound');
  assert.ok(Math.hypot(b.p.x, b.p.z) >= 0.2 + R - 1e-9, 'pushed out of the side');
  assert.equal(hits.last.tag, 'plant');
  assert.deepEqual(b.boxTags, ['plant']);
  assert.equal(b.contacts.cylinder, 1);

  w = createWorld({ gravity: 0, dragK: 0 });
  w.setLevel({ cylinders: [cyl] });
  hits = counter(w, 'cylinderHit');
  b = launch(w, 0.05, 1.4, 0.03, 0, -11, 0);   // fast: centre enters the cap, entry-face branch
  assert.ok(runUntil(w, () => hits.n > 0, 1) > 0, 'top hit');
  near(hits.last.normal.y, 1, 1e-9, 'cap normal');
  near(b.v.y, 4.4, 1e-9, 'cap rebound');
  assert.ok(b.p.y >= 1 + R - 1e-9, 'pushed out of the cap');

  // Slow approach to the cap edge: rounded normal.
  w = createWorld({ gravity: 0, dragK: 0 });
  w.setLevel({ cylinders: [cyl] });
  hits = counter(w, 'cylinderHit');
  const s = Math.SQRT1_2;
  b = launch(w, 0.2 + 0.3 * s, 1 + 0.3 * s, 0, -2 * s, -2 * s, 0);
  assert.ok(runUntil(w, () => hits.n > 0, 1) > 0, 'edge hit');
  near(hits.last.normal.x, s, 1e-6, 'edge normal x'); near(hits.last.normal.y, s, 1e-6, 'edge normal y');
});

test('ceiling is reported as boxHit with tag ceiling and counted in contacts.ceiling', () => {
  const w = levelWorld({ boxes: [{ min: { x: -7, y: 2.9, z: -5 }, max: { x: 7, y: 3.0, z: 11 }, restitution: 0.35, tag: 'ceiling' }] });
  const hits = counter(w, 'boxHit');
  const b = launch(w, 0, 1.0, 0, 0, 8, 0);
  assert.ok(runUntil(w, () => hits.n > 0, 2) > 0, 'never hit the ceiling');
  assert.equal(hits.last.tag, 'ceiling');
  near(hits.last.normal.y, -1, 1e-9, 'ceiling normal points down');
  near(hits.last.point.y, 2.9, 1e-9, 'contact point on the ceiling');
  assert.ok(b.contacts.ceiling >= 1 && b.contacts.box >= 1);
  assert.deepEqual(b.boxTags, ['ceiling']);
  assert.ok(b.v.y < 0, 'ball comes back down');
  const pr = w.predict({ x: 0, y: 1.0, z: 0 }, { x: 0, y: 8, z: 0 }, { stopOnContact: true });
  assert.equal(pr.contact.type, 'box');
  assert.equal(pr.contact.tag, 'ceiling');
});

// ---------------------------------------------------------------------------------------------
// Bin: scoring, side flag, rim, walls, stacking

test('a ball dropped into the bin scores exactly once, rests on the inner floor without jitter, then sleeps', () => {
  const w = levelWorld();
  const scored = counter(w, 'scored');
  const rest = counter(w, 'rest');
  const bottomHits = counter(w, 'binFloorHit');
  const b = launch(w, L1_BIN.x, 0.9, L1_BIN.z);
  assert.equal(b.side, 'above');
  let maxDev = 0, settledSince = -1, t = 0;
  const restY = BIN_TB + R;
  const done = runUntil(w, () => {
    t += FIXED_DT;
    if (b.firstContactAt !== null && t - b.firstContactAt > 0.3) {
      if (settledSince < 0) settledSince = t;
      maxDev = Math.max(maxDev, Math.abs(b.p.y - restY));
    }
    return b.state === 'sleeping';
  }, 6);
  assert.ok(done > 0, 'never slept');
  assert.equal(b.side, 'inside');
  assert.equal(scored.n, 1, `scored ${scored.n} times`);
  assert.equal(scored.last.ball, b);
  assert.equal(scored.last.tag, 'swish');
  assert.equal(b.scored, true);
  assert.equal(b.enteredIn, true);
  assert.ok(bottomHits.n >= 1, 'binFloorHit fired');
  assert.equal(bottomHits.last.tag, 'bottom');
  assert.ok(w.isInBin(b));
  near(b.p.y, restY, 1e-6, 'rests on the inner floor');
  assert.ok(settledSince > 0 && maxDev < 5e-4, `inner floor jitter ${maxDev}`);
  assert.equal(rest.n, 1);
  // Sleeping balls never move or score again.
  const py = b.p.y;
  run(w, 1);
  assert.equal(b.p.y, py);
  assert.equal(scored.n, 1);
  assert.equal(b.state, 'sleeping');
});

test('a ball dropped beside the bin never scores and stops outside the outer wall', () => {
  const w = levelWorld();
  const scored = counter(w, 'scored');
  const b = launch(w, L1_BIN.x + L1_BIN.rOutTop + R + 0.02, 0.9, L1_BIN.z);
  let minRho = Infinity;
  const t = runUntil(w, () => { minRho = Math.min(minRho, rhoOf(b)); return b.state === 'sleeping'; }, 6);
  assert.ok(t > 0, 'never slept');
  assert.equal(b.side, 'outside');
  assert.equal(scored.n, 0);
  assert.equal(b.scored, false);
  assert.equal(b.enteredIn, false);
  assert.ok(!w.isInBin(b));
  assert.ok(minRho > L1_BIN.rOutBot + R - 1e-3, `centre came within ${minRho} of the axis`);
  near(b.p.y, R, 1e-6, 'rests on the floor');
});

test('a ball dropped onto the rim from directly above bounces (rimHit fires)', () => {
  const w = levelWorld();
  const rim = counter(w, 'rimHit');
  const scored = counter(w, 'scored');
  const b = launch(w, L1_BIN.x + R_MID, 0.6, L1_BIN.z);
  const t = runUntil(w, () => rim.n > 0, 1);
  assert.ok(t > 0, 'rimHit never fired');
  assert.ok(b.v.y > 0, 'ball bounces up');
  near(rim.last.normal.y, 1, 1e-6, 'rim normal');
  assert.ok(rim.last.speed > 1.9 && rim.last.speed < 2.2, `impact speed ${rim.last.speed} (2.13 in vacuum, less with drag)`);
  near(rim.last.point.y, BIN_H + L1_BIN.rimTube, 1e-6, 'contact point on top of the tube');
  assert.equal(rim.last.tag, 'rim');
  assert.ok(b.contacts.rim >= 1);
  const pr = w.predict({ x: L1_BIN.x + R_MID, y: 0.6, z: L1_BIN.z }, { x: 0, y: 0, z: 0 }, { stopOnContact: true });
  assert.equal(pr.contact.type, 'rim');
  near(pr.tContact, t, 1e-9, 'prediction contact time');
  run(w, 4);
  assert.equal(scored.n, 0, 'a ball on the rim never scores');
});

test('a ball settling on the rim slightly off-centre rolls off (never sleeps on the rim)', () => {
  for (const off of [0.002, -0.002]) {
    const w = levelWorld();
    const rim = counter(w, 'rimHit');
    const b = launch(w, L1_BIN.x + R_MID + off, 0.5, L1_BIN.z);
    const t = runUntil(w, () => b.state === 'sleeping', 8);
    assert.ok(t > 0, `offset ${off}: never slept`);
    assert.ok(rim.n >= 1, `offset ${off}: rim never hit`);
    assert.ok(b.p.y < BIN_H, `offset ${off}: came to rest at y = ${b.p.y} (on the rim)`);
    if (off < 0) {
      assert.equal(b.side, 'inside');
      assert.ok(w.isInBin(b) && b.scored, 'inward roll-off ends inside and scores');
    } else {
      assert.equal(b.side, 'outside');
      assert.ok(!b.scored, 'outward roll-off does not score');
      near(b.p.y, R, 1e-6, 'ends on the floor');
    }
  }
});

test('the outer wall stops a ball rolling on the floor into the bin', () => {
  const w = levelWorld();
  const wall = counter(w, 'binWallHit');
  const scored = counter(w, 'scored');
  const b = launch(w, L1_BIN.x - 0.5, R, L1_BIN.z, 3, 0, 0);
  assert.equal(b.side, 'outside');
  let minRho = Infinity, maxY = 0;
  const t = runUntil(w, () => { minRho = Math.min(minRho, rhoOf(b)); maxY = Math.max(maxY, b.p.y); return b.state === 'sleeping'; }, 6);
  assert.ok(t > 0, 'never slept');
  assert.ok(wall.n >= 1, 'binWallHit never fired');
  assert.equal(wall.last.tag, 'outer');
  assert.ok(wall.last.normal.x < -0.9, 'outer normal points away from the axis');
  assert.ok(minRho > L1_BIN.rOutBot + 0.03, `centre reached rho = ${minRho}`);
  assert.ok(maxY < 0.1, `ball climbed to ${maxY}`);
  assert.equal(scored.n, 0);
  assert.ok(b.contacts.outer >= 1);
  near(b.p.y, R, 1e-6, 'ends on the floor');
});

test('a ball thrown against the inner wall rattles in: binWallHit inner, scored once with tag rattle', () => {
  const w = levelWorld();
  const wall = counter(w, 'binWallHit');
  const scored = counter(w, 'scored');
  // Enter just inside the far rim with a horizontal component so it hits the inner wall first.
  const b = launch(w, L1_BIN.x - 0.05, BIN_H + 0.2, L1_BIN.z, 1.2, -1.0, 0);
  const t = runUntil(w, () => b.state === 'sleeping', 6);
  assert.ok(t > 0, 'never slept');
  assert.equal(b.side, 'inside');
  assert.ok(wall.all.some((e) => e.tag === 'inner'), 'no inner wall impact');
  assert.equal(scored.n, 1);
  assert.equal(scored.last.tag, 'rattle');
  assert.ok(w.isInBin(b));
  assert.ok(rhoOf(b) + R <= R_IN_TOP + 1e-6, 'centre stays inside the inner wall');
});

test('IN rule 1: holding the IN region for 0.30 s scores (shelf inside the bin keeps it above 0.5 H)', () => {
  const shelf = { min: { x: 0.65, y: 0.15, z: -4.5 }, max: { x: 0.85, y: 0.20, z: -4.3 }, restitution: 0.2, friction: 0.4, rollDamping: 4, tag: 'shelf' };
  const w = levelWorld({ boxes: [shelf] });
  const scored = counter(w, 'scored');
  const b = launch(w, L1_BIN.x, 0.6, L1_BIN.z);
  let t = 0, tIn = -1, tScore = -1, minY = Infinity;
  runUntil(w, () => {
    t += FIXED_DT;
    if (tIn < 0 && w.isInBin(b)) tIn = t;
    if (tIn > 0) minY = Math.min(minY, b.p.y);
    if (tScore < 0 && b.scored) tScore = t;
    return b.state === 'sleeping';
  }, 6);
  assert.ok(tIn > 0, 'never IN');
  assert.ok(tScore > 0, 'never scored');
  assert.ok(minY > 0.5 * BIN_H, `dipped to ${minY}, rule 2 would have fired`);
  near(tScore - tIn, 0.30, 0.005, 'hold time before scoring');
  assert.equal(scored.n, 1);
  assert.equal(scored.last.tag, 'bank');
});

test('IN rule 3: sleepBall() on a ball that is IN scores it (rule 3) and emits rest', () => {
  const w = levelWorld();
  const scored = counter(w, 'scored');
  const rest = counter(w, 'rest');
  const b = launch(w, L1_BIN.x, 0.9, L1_BIN.z);
  assert.ok(runUntil(w, () => w.isInBin(b), 2) > 0, 'never IN');
  assert.equal(b.scored, false, 'must not have scored yet (above 0.5 H, hold < 0.3 s)');
  assert.ok(b.p.y > 0.5 * BIN_H);
  w.sleepBall(b);
  assert.equal(b.state, 'sleeping');
  assert.equal(scored.n, 1);
  assert.equal(rest.n, 1);
  assert.deepEqual(b.v, { x: 0, y: 0, z: 0 });
  w.sleepBall(b);   // idempotent
  assert.equal(rest.n, 1);
});

test('balls stacked in the bin never tunnel through the wall and stay separated', () => {
  const w = levelWorld();
  const scored = counter(w, 'scored');
  const balls = [];
  const drops = [[0.02, 0], [-0.02, 0.01], [0, -0.02], [0.03, 0.02], [-0.01, -0.03], [0.015, 0.025]];
  for (const [dx, dz] of drops) {
    const b = launch(w, L1_BIN.x + dx, 0.9, L1_BIN.z + dz);
    const t = runUntil(w, () => b.state === 'sleeping', 8);
    assert.ok(t > 0, `ball ${b.id} never slept`);
    balls.push(b);
  }
  assert.ok(scored.n >= 3, `only ${scored.n} scored`);
  for (const b of balls) {
    assert.equal(b.side, 'inside');
    const rIn = R_IN_BOT + (R_IN_TOP - R_IN_BOT) * (b.p.y - BIN_TB) / (BIN_H - BIN_TB);
    assert.ok(rhoOf(b) + R <= rIn + 1e-6, `ball ${b.id} at rho ${rhoOf(b)}, y ${b.p.y} pokes through the wall`);
    assert.ok(b.p.y >= BIN_TB + R - 1e-6, `ball ${b.id} below the inner floor`);
    assert.ok(b.p.y < BIN_H + R, `ball ${b.id} ended above the rim`);
  }
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i].p, c = balls[j].p;
      const d = Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z);
      assert.ok(d >= 2 * R - 2e-3, `balls ${balls[i].id} and ${balls[j].id} overlap: ${d}`);
    }
  }
  assert.ok(balls.some((b) => b.contacts.ball > 0), 'no ball-ball contact recorded');
});

test('a ball dropped onto a sleeping ball bounces off it (ballHit) and settles on the floor beside it', () => {
  const w = levelWorld();
  const ballHits = counter(w, 'ballHit');
  const a = launch(w, 0, 0.3, 0);
  assert.ok(runUntil(w, () => a.state === 'sleeping', 5) > 0);
  const b = launch(w, 0.01, 0.5, 0);
  assert.ok(runUntil(w, () => ballHits.n > 0, 1) > 0, 'ballHit never fired');
  assert.equal(ballHits.last.ball, b);
  assert.equal(ballHits.last.other, a);
  assert.ok(ballHits.last.normal.y > 0.9);
  assert.ok(runUntil(w, () => b.state === 'sleeping', 6) > 0, 'never slept');
  const d = Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y, a.p.z - b.p.z);
  assert.ok(d >= 2 * R - 1e-3, `overlap ${d}`);
  assert.deepEqual(a.p, { x: a.p.x, y: a.p.y, z: a.p.z });
  assert.ok(b.contacts.ball >= 1);
});

// ---------------------------------------------------------------------------------------------
// Predict and step agree

test('predict matches step for the same launch (positions within 1e-6 at the same sample times)', () => {
  const desk = { min: { x: -1.5, y: 0.0, z: -3.2 }, max: { x: 0.2, y: 0.72, z: -2.4 }, restitution: 0.4, friction: 0.3, rollDamping: 2.5, tag: 'desk' };
  const w = levelWorld({ boxes: [desk] });
  const pos = { x: 1.10, y: 1.30, z: -0.20 };
  const dist = Math.hypot(L1_BIN.x - pos.x, L1_BIN.z - pos.z);
  const dirH = { x: (L1_BIN.x - pos.x) / dist, y: 0, z: (L1_BIN.z - pos.z) / dist };
  const el = 45 * DEG;
  const speed = w.solveSpeedForTarget(pos, dirH, el, { x: L1_BIN.x, y: BIN_H, z: L1_BIN.z });
  const vel = { x: speed * Math.cos(el) * dirH.x, y: speed * Math.sin(el), z: speed * Math.cos(el) * dirH.z };
  const pr = w.predict(pos, vel, { stopOnContact: false, maxTime: 3 });
  assert.ok(pr.count > 100, `count ${pr.count}`);
  assert.ok(pr.contact && pr.tContact > 0.5, 'expected a contact near the bin');
  const pts = Float32Array.from(pr.points.subarray(0, pr.count * 3));   // copy: the buffer is reused
  const b = launch(w, pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, { x: 18, y: 0, z: 0 });
  let compared = 0;
  for (let i = 1; i < pr.count && b.state === 'flying'; i++) {
    run(w, 4 * FIXED_DT);
    if (b.state !== 'flying') break;
    near(b.p.x, pts[i * 3], 1e-6, `x at sample ${i}`);
    near(b.p.y, pts[i * 3 + 1], 1e-6, `y at sample ${i}`);
    near(b.p.z, pts[i * 3 + 2], 1e-6, `z at sample ${i}`);
    compared++;
  }
  assert.ok(compared > 100, `only ${compared} samples compared`);
  assert.ok(b.firstContactAt !== null, 'the real ball made contact');
});

test('predict: stops at the first impact, samples every 4th step, reports the contact and reuses its buffer', () => {
  const w = levelWorld();
  const pr = w.predict({ x: L1_BIN.x, y: 0.9, z: L1_BIN.z }, { x: 0, y: 0, z: 0 }, { stopOnContact: true });
  assert.equal(pr.contact.type, 'binFloor');
  assert.equal(pr.contact.tag, 'bottom');
  near(pr.contact.point.y, BIN_TB, 1e-6, 'contact point on the inner floor');
  near(pr.contact.t, pr.tContact, 0, 'tContact');
  assert.ok(pr.count >= 2 && pr.count * 3 <= pr.points.length);
  assert.equal(pr.points.length, 3 * 720);
  // The last point is the contact-step position.
  near(pr.points[(pr.count - 1) * 3 + 1], BIN_TB + R, 1e-6, 'last point rests on the inner floor');
  // Sample spacing is 4 steps: the second point is where free fall gets in 4 steps.
  const dy = 0.9 - pr.points[4];
  assert.ok(dy > 0 && dy < 0.002, `second sample dy = ${dy}`);
  const beside = w.predict({ x: L1_BIN.x + 0.3, y: 0.9, z: L1_BIN.z }, { x: 0, y: 0, z: 0 });
  assert.equal(beside.contact.type, 'floor');
  assert.equal(beside.points, pr.points, 'buffer reused');
  const none = w.predict({ x: 0, y: 5, z: 0 }, { x: 0, y: 8, z: 0 }, { maxTime: 0.5 });
  assert.equal(none.contact, null);
  assert.equal(none.tContact, null);
  assert.equal(none.count, 1 + Math.round(0.5 / FIXED_DT / 4));
  const custom = w.predict({ x: 0, y: 5, z: 0 }, { x: 0, y: 8, z: 0 }, { maxTime: 1, sampleEvery: 1 });
  assert.equal(custom.count, 1 + 240);
  const full = w.predict({ x: 0, y: 20, z: 0 }, { x: 0, y: 0, z: 0 }, { maxTime: 10, sampleEvery: 1, stopOnContact: false });
  assert.equal(full.count, 720, 'capped at the buffer size');
});

test('predict stops when the arc falls below y = -0.5 (no floor) and does not disturb real balls', () => {
  const w = createWorld();
  const b = launch(w, 0, 1, 0, 1, 0, 0);
  run(w, 0.1);
  const snap = { ...b.p };
  const pr = w.predict({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { stopOnContact: true });
  assert.equal(pr.contact, null);
  const lastY = pr.points[(pr.count - 1) * 3 + 1];
  assert.ok(lastY < -0.5 && lastY > -0.6, `last y ${lastY}`);
  assert.deepEqual(b.p, snap);
  assert.equal(b.state, 'flying');
  assert.equal(w.balls.length, 1);
});

// ---------------------------------------------------------------------------------------------
// Lifecycle: held balls, multiple balls, bounds, spin, listeners

test('held balls are never simulated and never collide', () => {
  const w = levelWorld();
  const held = w.createBall();
  held.p.x = 0; held.p.y = R; held.p.z = 0;
  const ballHits = counter(w, 'ballHit');
  run(w, 0.5);
  assert.equal(held.state, 'held');
  assert.deepEqual(held.p, { x: 0, y: R, z: 0 });
  const b = launch(w, 0, 0.5, 0);
  assert.ok(runUntil(w, () => b.state === 'sleeping', 5) > 0);
  assert.equal(ballHits.n, 0, 'a held ball acted as a collider');
  near(b.p.y, R, 1e-6, 'dropped ball landed on the floor through the held one');
});

test('flying balls do not collide with each other; sleeping ones become static colliders', () => {
  const w = levelWorld();
  const ballHits = counter(w, 'ballHit');
  const a = launch(w, 0, 1, 0, 2, 3, 0);
  const b = launch(w, 0, 1, 0, 2, 3, 0);
  run(w, 0.5);
  assert.deepEqual(a.p, b.p);
  assert.equal(ballHits.n, 0);
  assert.ok(runUntil(w, () => a.state === 'sleeping' && b.state === 'sleeping', 6) > 0);
  const c = launch(w, a.p.x + 0.005, a.p.y + 0.5, a.p.z);
  assert.ok(runUntil(w, () => ballHits.n > 0, 1) > 0, 'sleeping ball did not collide');
  assert.equal(ballHits.last.ball, c);
});

test('leaving the level bounds emits outOfBounds once and sleeps the ball', () => {
  const w = levelWorld();
  const oob = counter(w, 'outOfBounds');
  const rest = counter(w, 'rest');
  const b = launch(w, 0, 1, -13.5, 0, 2, -8);
  const t = runUntil(w, () => oob.n > 0, 1);
  assert.ok(t > 0 && t < 0.2, `outOfBounds at ${t}`);
  assert.equal(b.state, 'sleeping');
  assert.equal(oob.last.ball, b);
  assert.equal(oob.last.tag, 'bounds');
  run(w, 0.5);
  assert.equal(oob.n, 1);
  assert.equal(rest.n, 0);
  // Without level bounds the design-doc defaults apply (y < -1 retires the ball).
  const w2 = createWorld();
  const oob2 = counter(w2, 'outOfBounds');
  const b2 = launch(w2, 0, 0.5, 0);
  assert.ok(runUntil(w2, () => oob2.n > 0, 2) > 0, 'default bounds did not retire the ball');
  assert.ok(b2.p.y < -1 && b2.p.y > -1.1);
});

test('hard cap: 8 s after launch a ball sleeps; an airborne one is retired as outOfBounds', () => {
  // Slope that keeps a ball rolling: a very bouncy floor with no damping would never settle;
  // instead use a ball trapped bouncing between two facing high-restitution walls with no gravity.
  const w = createWorld({ gravity: 0, dragK: 0 });
  w.setLevel({ boxes: [
    { min: { x: 1, y: -1, z: -1 }, max: { x: 2, y: 1, z: 1 }, restitution: 1, friction: 0, tag: 'wallA' },
    { min: { x: -2, y: -1, z: -1 }, max: { x: -1, y: 1, z: 1 }, restitution: 1, friction: 0, tag: 'wallB' },
  ] });
  const oob = counter(w, 'outOfBounds');
  const rest = counter(w, 'rest');
  const b = launch(w, 0, 0, 0, 6, 0, 0);
  const t = runUntil(w, () => b.state === 'sleeping', 9);
  near(t, 8, 0.01, 'retired at 8 s');
  assert.ok(oob.n + rest.n === 1, 'exactly one terminal event');
  assert.ok(b.contacts.box > 10, 'kept bouncing until the cap');
  if (oob.n) assert.equal(oob.last.tag, 'timeout');
});

test('spin: launch tumble decays in flight, rolling contact sets w = (n x v) / R capped at 60, q stays unit and prevQ lags', () => {
  const w = levelWorld();
  const b = launch(w, 0, 3, 0, 0, 0, 0, { x: 0, y: 0, z: 18 });
  run(w, 0.5);
  const wl = Math.hypot(b.w.x, b.w.y, b.w.z);
  near(wl, 18 * Math.exp(-0.8 * 0.5), 1e-6, 'in-flight spin decay');
  const qn = Math.hypot(b.q.x, b.q.y, b.q.z, b.q.w);
  near(qn, 1, 1e-9, 'unit quaternion');
  assert.ok(Math.abs(b.q.z) > 0.1, 'rotated about z');
  const q0 = { ...b.q };
  w.step(FIXED_DT);
  assert.deepEqual(b.prevQ, q0, 'prevQ is the orientation before the step');
  assert.notDeepEqual(b.q, q0);
  // Rolling on the floor toward +x: w about -z with |w| = |v| / R.
  const w2 = levelWorld();
  const r = launch(w2, 0, R, 0, 1.0, 0, 0);
  w2.step(FIXED_DT);
  assert.ok(r.w.z < 0 && Math.abs(r.w.x) < 1e-9 && Math.abs(r.w.y) < 1e-9, `rolling axis ${JSON.stringify(r.w)}`);
  near(-r.w.z, r.v.x / R, 1e-6, 'rolling rate');
  const w3 = levelWorld();
  const f = launch(w3, 0, R, 0, 11, 0, 0);
  w3.step(FIXED_DT);
  near(Math.hypot(f.w.x, f.w.y, f.w.z), 60, 1e-9, 'spin cap');
});

test('speed is clamped to MAX_SPEED at launch and after collisions', () => {
  const w = createWorld({ gravity: 0, dragK: 0 });
  const b = launch(w, 0, 1, 0, 30, 0, 0);
  near(Math.hypot(b.v.x, b.v.y, b.v.z), 12, 1e-9, 'launch clamp');
  w.step(FIXED_DT);
  near(Math.hypot(b.v.x, b.v.y, b.v.z), 12, 1e-9, 'still clamped');
});

test('listeners may remove or create balls during step without breaking the loop', () => {
  const w = levelWorld();
  const a = launch(w, 0, 0.3, 0);
  const b = launch(w, 1, 0.3, 0);
  const c = launch(w, 2, 0.3, 0);
  let created = null;
  w.on('floorHit', (e) => {
    if (e.ball === a) w.removeBall(a);
    if (e.ball === b && !created) { created = w.createBall(); }
  });
  let stepsB = 0;
  const yB = b.p.y;
  const t = runUntil(w, () => { stepsB++; return b.state === 'sleeping' && c.state === 'sleeping'; }, 6);
  assert.ok(t > 0, 'b or c never slept');
  assert.equal(w.balls.indexOf(a), -1);
  assert.ok(created && created.state === 'held');
  assert.ok(w.balls.includes(created));
  assert.ok(b.p.y < yB);
  near(b.p.y, R, 1e-6, 'b settled');
  near(c.p.y, R, 1e-6, 'c settled');
  assert.equal(w.balls.length, 3);
});

test('setLevel replaces colliders; a bin-less level never scores and time keeps accumulating', () => {
  const w = levelWorld();
  const scored = counter(w, 'scored');
  w.setLevel({ floor: L1_FLOOR, boxes: [], cylinders: [], bounds: L1_BOUNDS });
  const b = launch(w, L1_BIN.x, 0.9, L1_BIN.z);
  assert.ok(runUntil(w, () => b.state === 'sleeping', 5) > 0);
  assert.equal(scored.n, 0);
  assert.equal(w.isInBin(b), false);
  near(b.p.y, R, 1e-6, 'floor');
  near(w.time, Math.round(w.time / FIXED_DT) * FIXED_DT, 1e-9, 'time is a multiple of the step');
  assert.ok(w.time > 0.4);
  w.setLevel(null);
  const b2 = launch(w, 0, 1, 0);
  run(w, 0.1);
  assert.ok(b2.p.y < 1, 'still integrates with no level');
});

test('event payloads carry ball, point, normal, speed and tag; on/off work', () => {
  const w = levelWorld();
  const seen = [];
  const off = w.on('floorHit', (e) => seen.push(e));
  const b = launch(w, 0, 0.5, 0);
  runUntil(w, () => seen.length > 0, 2);
  assert.equal(seen.length, 1);
  const e = seen[0];
  assert.deepEqual(Object.keys(e).sort(), ['ball', 'normal', 'other', 'point', 'speed', 'tag'].sort());
  assert.equal(e.ball, b);
  assert.equal(typeof e.speed, 'number');
  assert.deepEqual(Object.keys(e.point), ['x', 'y', 'z']);
  assert.deepEqual(Object.keys(e.normal), ['x', 'y', 'z']);
  assert.notEqual(e.point, b.p, 'payload point is a copy');
  off();
  run(w, 1);
  assert.equal(seen.length, 1, 'listener removed');
  const fn = () => { throw new Error('nope'); };
  w.on('rest', fn);
  w.off('rest', fn);
  runUntil(w, () => b.state === 'sleeping', 5);
});

// ---------------------------------------------------------------------------------------------
// Stress: many random throws at a bin (tunneling, double scoring, balls that never sleep, jitter)

// Deterministic PRNG so a failure reproduces.
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const L2_BIN = {
  x: 1.60, z: -4.30, height: 0.32, rOutTop: 0.150, rOutBot: 0.110, wall: 0.008, floorThick: 0.010, rimTube: 0.012,
  materials: {
    wall: { restitution: 0.30, friction: 0.30, rollDamping: 4.0 },
    bottom: { restitution: 0.18, friction: 0.35, rollDamping: 5.0 },
    rim: { restitution: 0.32, friction: 0.25, rollDamping: 4.0 },
  },
};
const L2_FLOOR = { restitution: 0.45, friction: 0.30, rollDamping: 1.5 };
const L2_BOUNDS = { minX: -6.5, maxX: 6.5, minZ: -9, maxZ: 4.5, minY: -1, maxY: 30 };

// Geometry helpers for an arbitrary bin spec.
function binGeom(bin) {
  const H = bin.height, tb = bin.floorThick;
  const rInTop = bin.rOutTop - bin.wall, rInBot = bin.rOutBot - bin.wall;
  return {
    H, tb, rInTop, rInBot, rMid: bin.rOutTop - bin.wall / 2,
    rIn: (y) => rInBot + (rInTop - rInBot) * (y - tb) / (H - tb),
    rOut: (y) => bin.rOutBot + (bin.rOutTop - bin.rOutBot) * y / H,
    rho: (p) => Math.hypot(p.x - bin.x, p.z - bin.z),
  };
}

// Throws `n` balls from `origin` toward the bin axis, each with speed = speedFn(vBin, rnd) and a yaw drawn
// uniformly from +-yawDeg, at 45 degrees elevation (main.js). Sleeping balls persist as clutter with the
// game's caps (6 inside, 10 outside; oldest removed), so later throws land on a pile. Every step checks
// the wall/floor invariants for the flying ball; every finished throw checks its resting place.
function stressThrows({ bin, floor, bounds, boxes, origin, n, speedFn, yawDeg, seed, tol = 1e-3 }) {
  const w = createWorld();
  w.setLevel({ floor, bin, boxes: boxes || [], cylinders: [], bounds });
  const g = binGeom(bin);
  const rnd = mulberry32(seed);
  const scoresById = new Map();
  w.on('scored', (e) => scoresById.set(e.ball.id, (scoresById.get(e.ball.id) || 0) + 1));
  const oob = [];
  w.on('outOfBounds', (e) => oob.push(e.tag));
  const tx = bin.x - origin.x, tz = bin.z - origin.z, D = Math.hypot(tx, tz);
  const dirH = { x: tx / D, y: 0, z: tz / D };
  const rx = -dirH.z, rz = dirH.x;   // right = dirH x up
  const el = 45 * DEG;
  const vBin = w.solveSpeedForTarget(origin, dirH, el, { x: bin.x, y: bin.height, z: bin.z });
  assert.ok(vBin > 5 && vBin < 10, `vBin ${vBin}`);
  const stats = { vBin, scored: 0, rim: 0, inner: 0, outer: 0, bank: 0, maxSettle: 0, minRhoInside: Infinity, worstWall: 0, worstFloor: 0, ballHits: 0 };
  const clutter = [];
  const problems = [];
  for (let i = 0; i < n; i++) {
    const speed = speedFn(vBin, rnd);
    const yaw = (rnd() * 2 - 1) * yawDeg * DEG;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const dx = dirH.x * cy + rx * sy, dz = dirH.z * cy + rz * sy;
    const v = { x: speed * Math.cos(el) * dx, y: speed * Math.sin(el), z: speed * Math.cos(el) * dz };
    const b = w.createBall();
    w.launch(b, origin, v, { x: 18 * rx, y: 0, z: 18 * rz });
    const t0 = w.time;
    let ok = true;
    while (b.state === 'flying' && w.time - t0 < 8.5) {
      w.step(FIXED_DT);
      // Per-step invariants: a ball below the rim plane must be on its side's face of the wall.
      const p = b.p, y = p.y, rho = g.rho(p);
      if (y < g.H && y > 0) {
        if (b.side === 'inside') {
          const pen = rho + R - g.rIn(y);
          if (pen > stats.worstWall) stats.worstWall = pen;
          if (pen > tol && ok) { ok = false; problems.push(`throw ${i}: inside ball pokes ${pen.toFixed(4)} m into the inner wall at t=${(w.time - t0).toFixed(3)}`); }
          if (rho <= g.rInBot) {
            const fpen = g.tb + R - y;
            if (fpen > stats.worstFloor) stats.worstFloor = fpen;
            if (fpen > tol && ok) { ok = false; problems.push(`throw ${i}: inside ball sank ${fpen.toFixed(4)} m into the inner floor`); }
          }
        } else if (b.side === 'outside') {
          const pen = g.rOut(y) + R - rho;
          if (pen > stats.worstWall) stats.worstWall = pen;
          if (pen > tol && ok) { ok = false; problems.push(`throw ${i}: outside ball pokes ${pen.toFixed(4)} m into the outer wall at t=${(w.time - t0).toFixed(3)}`); }
        }
      }
      if (y < R - tol && ok) { ok = false; problems.push(`throw ${i}: ball sank into the floor (y=${y.toFixed(4)})`); }
    }
    const dt = w.time - t0;
    if (dt > stats.maxSettle) stats.maxSettle = dt;
    if (b.state !== 'sleeping') problems.push(`throw ${i}: ball still ${b.state} after ${dt.toFixed(2)} s`);
    const times = scoresById.get(b.id) || 0;
    if (times > 1) problems.push(`throw ${i}: scored ${times} times`);
    if (b.scored !== (times === 1)) problems.push(`throw ${i}: scored flag ${b.scored} but ${times} scored events`);
    const rho = g.rho(b.p), y = b.p.y;
    if (b.scored) {
      stats.scored++;
      if (b.contacts.rim) stats.rim++;
      if (b.contacts.inner) stats.inner++;
      if (b.contacts.outer || b.contacts.box) stats.bank++;
      if (rho < stats.minRhoInside) stats.minRhoInside = rho;
      if (!(rho + R <= g.rIn(y) + tol)) problems.push(`throw ${i}: scored ball rests in the wall material (rho ${rho.toFixed(4)}, y ${y.toFixed(4)})`);
      if (y < g.tb + R - tol) problems.push(`throw ${i}: scored ball rests below the inner floor (y ${y.toFixed(4)})`);
      if (!w.isInBin(b)) problems.push(`throw ${i}: scored ball is not IN at rest`);
    } else {
      if (b.contacts.outer) stats.outer++;
      if (rho < g.rMid && y < g.H + R) problems.push(`throw ${i}: unscored ball rests inside the bin (rho ${rho.toFixed(4)}, y ${y.toFixed(4)}, side ${b.side})`);
      if (y < g.H && rho - R < g.rOut(y) - tol) problems.push(`throw ${i}: ball rests in the outer wall material (rho ${rho.toFixed(4)}, y ${y.toFixed(4)})`);
      if (y < R - tol) problems.push(`throw ${i}: ball rests below the floor (y ${y.toFixed(4)})`);
      if (y > g.H + R && rho < bin.rOutTop + R) problems.push(`throw ${i}: ball rests on top of the bin (y ${y.toFixed(4)}, rho ${rho.toFixed(4)})`);
    }
    if (b.contacts.ball) stats.ballHits++;
    // Clutter caps as in main.js.
    clutter.push(b);
    let inside = 0;
    for (const c of clutter) if (c.scored) inside++;
    let outside = clutter.length - inside;
    while (inside > 6) { const k = clutter.findIndex((c) => c.scored); w.removeBall(clutter[k]); clutter.splice(k, 1); inside--; }
    while (outside > 10) { const k = clutter.findIndex((c) => !c.scored); w.removeBall(clutter[k]); clutter.splice(k, 1); outside--; }
  }
  assert.equal(oob.length, 0, `outOfBounds/timeout retirements: ${JSON.stringify(oob.slice(0, 5))}`);
  assert.equal(problems.length, 0, `${problems.length} problems:\n      ${problems.slice(0, 8).join('\n      ')}`);
  assert.ok(stats.maxSettle < 8, `slowest throw took ${stats.maxSettle} s to sleep`);
  return stats;
}

const L1_ORIGIN = { x: 1.2, y: 1.35, z: -0.6 };

test('stress: 200 random throws at the level 1 bin (6..9 m/s, yaw +-10 deg) never tunnel, never double score, all sleep', () => {
  const s = stressThrows({
    bin: L1_BIN, floor: L1_FLOOR, bounds: L1_BOUNDS, origin: L1_ORIGIN, n: 200, seed: 12345, yawDeg: 10,
    boxes: [{ min: { x: -7, y: 2.9, z: -5 }, max: { x: 7, y: 3.0, z: 11 }, restitution: 0.35, tag: 'ceiling' }],
    speedFn: (vBin, rnd) => 6 + 3 * rnd(),
  });
  assert.ok(s.scored >= 1, `only ${s.scored} of 200 scored`);
  assert.ok(s.maxSettle < 5, `slowest settle ${s.maxSettle} s`);
});

test('stress: 200 aimed throws at the level 1 bin (vBin +-0.6 m/s, yaw +-2.5 deg) rattle in, bank in and swish without tunneling', () => {
  const s = stressThrows({
    bin: L1_BIN, floor: L1_FLOOR, bounds: L1_BOUNDS, origin: L1_ORIGIN, n: 200, seed: 777, yawDeg: 2.5,
    speedFn: (vBin, rnd) => Math.min(9, Math.max(6, vBin + (rnd() * 2 - 1) * 0.6)),
  });
  assert.ok(s.scored >= 20, `only ${s.scored} of 200 scored`);
  assert.ok(s.rim + s.inner >= 5, `only ${s.rim + s.inner} rattled in`);
  assert.ok(s.outer >= 5, `only ${s.outer} misses hit the outer wall`);
  assert.ok(s.ballHits >= 5, `only ${s.ballHits} throws touched a sleeping ball`);
  assert.ok(s.worstWall < 1e-3, `worst wall penetration ${s.worstWall}`);
  assert.ok(s.worstFloor < 1e-3, `worst inner floor penetration ${s.worstFloor}`);
});

test('stress: 120 aimed throws at the level 2 basket (thicker wall, fatter rim, oak floor) behave the same', () => {
  const s = stressThrows({
    bin: L2_BIN, floor: L2_FLOOR, bounds: L2_BOUNDS, origin: { x: 0.45, y: 1.35, z: -0.4 }, n: 120, seed: 4242, yawDeg: 2.5,
    boxes: [{ min: { x: -6, y: 5.5, z: -5 }, max: { x: 6, y: 5.6, z: 4 }, restitution: 0.35, tag: 'ceiling' }],
    speedFn: (vBin, rnd) => vBin + (rnd() * 2 - 1) * 0.5,
  });
  assert.ok(s.scored >= 12, `only ${s.scored} of 120 scored`);
  assert.ok(s.worstWall < 1e-3, `worst wall penetration ${s.worstWall}`);
});

test('a ball resting on the bin floor keeps |v| below 0.01 for 2 s and does not drift (no jitter)', () => {
  // Placed at rest exactly on the inner floor.
  let w = levelWorld();
  let b = launch(w, L1_BIN.x, BIN_TB + R, L1_BIN.z);
  const restY = BIN_TB + R;
  let maxV = 0, maxDev = 0;
  for (let i = 0; i < Math.round(2 / FIXED_DT); i++) {
    w.step(FIXED_DT);
    maxV = Math.max(maxV, Math.hypot(b.v.x, b.v.y, b.v.z));
    maxDev = Math.max(maxDev, Math.abs(b.p.y - restY), Math.abs(b.p.x - L1_BIN.x), Math.abs(b.p.z - L1_BIN.z));
  }
  assert.ok(maxV < 0.01, `|v| reached ${maxV}`);
  assert.ok(maxDev < 1e-6, `drifted ${maxDev}`);
  assert.equal(b.state, 'sleeping');
  assert.ok(b.scored, 'a ball resting IN scores (rule 3 or rule 2)');
  // Dropped in off-centre with some sideways speed, so it bounces, grazes the inner wall and rolls. From
  // 0.1 s after its last impact until it sleeps the ball only rolls on the inner floor. No jitter means:
  // horizontal speed decays monotonically, |v| never grows by more than one step of gravity (the wall's
  // up-tilted normal can lift the ball a few microns for one step), y holds at the rest height, and the
  // 0.4 s sleep rule (not the 3 s fallback) puts it to sleep.
  w = levelWorld();
  b = launch(w, L1_BIN.x - 0.02, 0.6, L1_BIN.z + 0.01, 0.4, 0, -0.3);
  let lastImpact = -1;
  for (const name of ['binFloorHit', 'binWallHit', 'rimHit']) w.on(name, () => { lastImpact = w.time; });
  const samples = [];
  const slept = runUntil(w, () => {
    samples.push({ t: w.time, y: b.p.y, sp: Math.hypot(b.v.x, b.v.y, b.v.z), hs: Math.hypot(b.v.x, b.v.z) });
    return b.state === 'sleeping';
  }, 6);
  assert.ok(slept > 0, 'never slept');
  assert.ok(lastImpact > 0, 'no impact recorded');
  assert.ok(b.contacts.inner >= 1, 'never touched the inner wall');
  let prevV = Infinity, prevH = Infinity, rises = 0, hRises = 0, quietSteps = 0, worstRise = 0;
  maxDev = 0;
  for (const s of samples) {
    if (s.t - lastImpact <= 0.1) continue;
    if (s.sp > prevV + GRAVITY * FIXED_DT + 1e-9) { rises++; worstRise = Math.max(worstRise, s.sp - prevV); }
    if (s.hs > prevH + 1e-9) hRises++;
    prevV = s.sp; prevH = s.hs;
    maxDev = Math.max(maxDev, Math.abs(s.y - restY));
    quietSteps++;
  }
  assert.ok(quietSteps > 0.2 / FIXED_DT, `only ${quietSteps} rolling steps observed`);
  assert.equal(rises, 0, `|v| jumped ${rises} times while rolling (worst +${worstRise} m/s): jitter`);
  assert.equal(hRises, 0, `horizontal speed rose ${hRises} times while rolling: jitter`);
  assert.ok(maxDev < 1e-4, `bounced ${maxDev} m while rolling on the inner floor`);
  assert.ok(slept - lastImpact <= 1.5, `took ${(slept - lastImpact).toFixed(2)} s after the last impact to sleep`);
  const snap = { x: b.p.x, y: b.p.y, z: b.p.z };
  run(w, 2);
  assert.deepEqual(b.p, snap, 'sleeping ball moved');
  assert.deepEqual(b.v, { x: 0, y: 0, z: 0 });
  near(b.p.y, restY, 1e-6, 'rests on the inner floor');
});

test('a ball rolled slowly on the floor into the outer wall stops outside it (resting-contact branch, no impact)', () => {
  const limit = L1_BIN.rOutBot + R;
  for (const [gap, v0] of [[0.05, 1.0], [0.03, 0.30], [0.10, 0.80], [0.02, 0.20], [0.05, 0.44]]) {
    const w = levelWorld();
    const wall = counter(w, 'binWallHit');
    const scored = counter(w, 'scored');
    const b = launch(w, L1_BIN.x - (limit + gap), R, L1_BIN.z, v0, 0, 0);
    let minRho = Infinity, maxY = 0;
    const t = runUntil(w, () => { minRho = Math.min(minRho, rhoOf(b)); maxY = Math.max(maxY, b.p.y); return b.state === 'sleeping'; }, 6);
    assert.ok(t > 0, `gap ${gap} v ${v0}: never slept`);
    assert.ok(b.contacts.outer >= 1, `gap ${gap} v ${v0}: never touched the outer wall`);
    assert.ok(minRho >= limit - 1e-3, `gap ${gap} v ${v0}: centre reached rho ${minRho} (limit ${limit})`);
    assert.ok(rhoOf(b) >= limit - 1e-3, `gap ${gap} v ${v0}: rests at rho ${rhoOf(b)}`);
    assert.ok(maxY < R + 1e-3, `gap ${gap} v ${v0}: climbed the wall to ${maxY}`);
    near(b.p.y, R, 1e-6, 'ends on the floor');
    assert.equal(scored.n, 0);
    assert.equal(b.side, 'outside');
    if (v0 < 0.45) assert.equal(wall.n, 0, `gap ${gap} v ${v0}: a sub-threshold touch fired binWallHit`);
  }
});

// ---------------------------------------------------------------------------------------------

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
