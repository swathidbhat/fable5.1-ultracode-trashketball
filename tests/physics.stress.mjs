// Stress test: many random throws at the level 1 bin. Checks for tunneling, double scoring,
// balls that never settle, and jitter at rest. Run with: node tests/physics.stress.mjs
import { createWorld, FIXED_DT, BALL_R } from '../src/physics.js';

const bin = {
  x: 0.75, z: -4.40, height: 0.32, rOutTop: 0.150, rOutBot: 0.120, wall: 0.006, floorThick: 0.008, rimTube: 0.009,
  materials: {
    wall: { restitution: 0.40, friction: 0.20, rollDamping: 3.0 },
    bottom: { restitution: 0.22, friction: 0.40, rollDamping: 5.0 },
    rim: { restitution: 0.45, friction: 0.15, rollDamping: 3.0 },
  },
};
const level = {
  floor: { restitution: 0.30, friction: 0.45, rollDamping: 4.0 },
  bin,
  boxes: [
    { min: { x: -7, y: 0, z: -5.2 }, max: { x: 7, y: 2.9, z: -5.0 }, restitution: 0.35, friction: 0.3, rollDamping: 2.5, tag: 'wall' },
    { min: { x: -7, y: 2.9, z: -5.2 }, max: { x: 7, y: 3.0, z: 11 }, restitution: 0.35, friction: 0.3, rollDamping: 2.5, tag: 'ceiling' },
  ],
  cylinders: [],
  bounds: { minX: -7.5, maxX: 7.5, minZ: -14, maxZ: 12, minY: -1, maxY: 30 },
};

// Deterministic PRNG so failures reproduce.
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const world = createWorld();
world.setLevel(level);
let scoredEvents = 0;
const scoredIds = new Map();
world.on('scored', ({ ball }) => { scoredEvents++; scoredIds.set(ball.id, (scoredIds.get(ball.id) || 0) + 1); });

const hand = { x: 1.2, y: 1.35, z: -0.6 };
const dirH = { x: bin.x - hand.x, y: 0, z: bin.z - hand.z };
const len = Math.hypot(dirH.x, dirH.z); dirH.x /= len; dirH.z /= len;
const el = 45 * Math.PI / 180;
const vBin = world.solveSpeedForTarget(hand, dirH, el, { x: bin.x, y: bin.height, z: bin.z });

const failures = [];
let scored = 0, thrown = 0;
const rInAt = (y) => (bin.rOutBot - bin.wall) + ((bin.rOutTop - bin.wall) - (bin.rOutBot - bin.wall)) * ((y - bin.floorThick) / (bin.height - bin.floorThick));
const rOutAt = (y) => bin.rOutBot + (bin.rOutTop - bin.rOutBot) * (y / bin.height);

for (let i = 0; i < 200; i++) {
  // Clear previous balls so each throw is independent apart from a few kept as clutter.
  for (const b of world.balls.slice()) if (world.balls.length > 6) world.removeBall(b);
  const ball = world.createBall();
  const speed = vBin + (rnd() * 2 - 1) * 1.6;
  const yaw = (rnd() * 2 - 1) * (6 * Math.PI / 180);
  const dx = dirH.x * Math.cos(yaw) + (dirH.z) * Math.sin(yaw);
  const dz = dirH.z * Math.cos(yaw) - (dirH.x) * Math.sin(yaw);
  const v = { x: speed * Math.cos(el) * dx, y: speed * Math.sin(el), z: speed * Math.cos(el) * dz };
  world.launch(ball, hand, v, { x: 0, y: 0, z: 18 });
  thrown++;
  let t = 0;
  while (ball.state === 'flying' && t < 9) {
    world.step(FIXED_DT); t += FIXED_DT;
    const rho = Math.hypot(ball.p.x - bin.x, ball.p.z - bin.z);
    // Inside the wall material?
    if (ball.p.y > 0 && ball.p.y < bin.height) {
      const rin = rInAt(Math.max(bin.floorThick, ball.p.y)), rout = rOutAt(ball.p.y);
      if (rho > rin - BALL_R * 0.25 && rho < rout + BALL_R * 0.25 && ball.p.y > bin.floorThick + BALL_R * 0.5) {
        // Centre inside the wall band: tolerated only transiently while resolving; flag if it persists.
        ball.userData.wallFrames = (ball.userData.wallFrames || 0) + 1;
        if (ball.userData.wallFrames > 6) { failures.push(`throw ${i}: centre stuck inside the wall band at t=${t.toFixed(2)} rho=${rho.toFixed(3)} y=${ball.p.y.toFixed(3)}`); break; }
      } else ball.userData.wallFrames = 0;
    }
    if (ball.p.y < -0.01) { failures.push(`throw ${i}: fell through the floor`); break; }
  }
  if (ball.state === 'flying') failures.push(`throw ${i}: still flying after 9 s`);
  if (ball.scored) {
    scored++;
    const rho = Math.hypot(ball.p.x - bin.x, ball.p.z - bin.z);
    if (rho > rInAt(ball.p.y) + 1e-3) failures.push(`throw ${i}: scored but rests outside the inner radius (rho ${rho.toFixed(3)})`);
    if (ball.p.y < bin.floorThick + BALL_R - 2e-3 && ball.state === 'sleeping' && rho < bin.rOutBot - bin.wall - BALL_R) {
      // resting below the inner floor means it tunneled through the bottom
      if (ball.p.y < bin.floorThick - 1e-3) failures.push(`throw ${i}: below the bin floor (y ${ball.p.y.toFixed(3)})`);
    }
  }
}
for (const [id, n] of scoredIds) if (n > 1) failures.push(`ball ${id} scored ${n} times`);

// Resting jitter check: a ball dropped into the bin should stay still for 2 s after sleeping.
{
  for (const b of world.balls.slice()) world.removeBall(b);
  const b = world.createBall();
  world.launch(b, { x: bin.x, y: 0.6, z: bin.z }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  let t = 0;
  while (b.state === 'flying' && t < 5) { world.step(FIXED_DT); t += FIXED_DT; }
  const p0 = { ...b.p };
  for (let k = 0; k < 480; k++) world.step(FIXED_DT);
  const moved = Math.hypot(b.p.x - p0.x, b.p.y - p0.y, b.p.z - p0.z);
  if (moved > 1e-4) failures.push(`resting ball drifted ${moved.toFixed(5)} m after sleeping`);
  if (!b.scored) failures.push('ball dropped into the bin did not score');
}

console.log(`vBin ${vBin.toFixed(3)} m/s; ${thrown} throws, ${scored} scored (${Math.round(100 * scored / thrown)}%), ${scoredEvents} scored events`);
if (failures.length) {
  console.log('FAILURES:');
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
console.log('PASS stress');
