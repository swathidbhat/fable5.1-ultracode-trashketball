// Furniture and fittings for the beach house (art doc 03 sections 3.3 to 3.9): the curved boucle sofa,
// the sage velvet sofa, the marble coffee table and its props, the rug, three rattan pendants, the
// ceiling fan, the floor lamp and the two plants. Static parts go into material buckets (one mesh per
// material); the fan blades and the olive canopy come back as live meshes.
import * as THREE from 'three';
import { boxCollider, boxColliderFromObject, cylinderCollider } from '../util.js';
import { mulberry32 } from '../../textures.js';
import { ATLAS, atlasUV, remapUV } from './textures.js';
import { DEG, rbox, placed, tint, shadowMesh, grainUV, mergeAll } from './geo.js';

const TAU = Math.PI * 2;
const SOFA = { tag: 'sofa', restitution: 0.15, friction: 0.80, rollDamping: 6.0 };
const VELVET = { tag: 'velvet', restitution: 0.15, friction: 0.80, rollDamping: 6.0 };
const TABLE = { tag: 'table', restitution: 0.55, friction: 0.25, rollDamping: 3.0 };
const PLANT = { tag: 'plant', restitution: 0.45, friction: 0.40, rollDamping: 3.0 };

export const PENDANTS = [
  { x: -0.6, y: 3.50, z: -2.3, r: 0.42 },
  { x: 0.1, y: 3.75, z: -2.0, r: 0.32 },
  { x: 0.6, y: 3.40, z: -2.7, r: 0.36 },
];
export const FAN_HUB = { x: -1.9, y: 4.75, z: -2.3 };
export const LAMP = { x: -4.6, z: -0.6 };
export const FIG = { x: 2.6, z: -4.4 };
export const OLIVE = { x: -4.8, z: -4.2 };
const BEAM_Z = [-4.2, -2.2, -0.2, 1.8, 3.8];

const _v = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// Clone `geo`, apply rotations in the listed order (['x'|'y'|'z', radians]) then translate.
function orient(geo, ops, x, y, z) {
  const g = geo.clone();
  for (const [axis, a] of ops) {
    if (axis === 'x') g.rotateX(a); else if (axis === 'y') g.rotateY(a); else g.rotateZ(a);
  }
  g.translate(x, y, z);
  return g;
}

// Bake every mesh under `obj` (already in the scene graph) into buckets in world space and drop it.
// Meshes carry userData.bucket and an optional userData.tint. Shared prototype geometries are not
// disposed here; the caller owns them.
function bake(buckets, obj, defaultKey) {
  obj.updateWorldMatrix(true, true);
  const meshes = [];
  obj.traverse((m) => { if (m.isMesh) meshes.push(m); });
  for (const m of meshes) {
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    if (m.userData.tint !== undefined) tint(g, m.userData.tint);
    buckets.add(m.userData.bucket || defaultKey, g);
  }
  obj.removeFromParent();
}

// Cables and downrods hang from the beam undersides where a beam crosses them, else from the ceiling.
function hangFrom(x, z) {
  if (Math.abs(x) <= 0.16) return 5.08;
  for (const bz of BEAM_Z) if (Math.abs(z - bz) <= 0.12) return 5.20;
  return 5.5;
}

// ---------------------------------------------------------------------------------------------
// 3.3 Curved cream boucle sofa: four modules plus two bolster ends on an arc around the table

function buildCurvedSofa({ group, buckets, colliders, rng }) {
  const C = { x: 0.4, z: -2.3 }, R = 2.35;
  const bodyG = rbox(0.74, 0.42, 0.95, 0.16);
  const seatG = rbox(0.72, 0.16, 0.80, 0.08);
  const backG = rbox(0.72, 0.48, 0.26, 0.13);
  const bolsterG = rbox(0.30, 0.55, 0.95, 0.14);
  const pillowG = rbox(0.5, 0.5, 0.14, 0.05);
  const stripeG = remapUV(pillowG.clone(), atlasUV(ATLAS.stripe));
  const proxy = new THREE.MeshBasicMaterial();

  const moduleAt = (deg) => {
    const th = deg * DEG;
    const mg = new THREE.Group();
    mg.position.set(C.x + R * Math.cos(th), 0, C.z + R * Math.sin(th));
    mg.rotation.y = Math.PI / 2 - th;          // local +z points radially outward (the sofa back)
    group.add(mg);
    return mg;
  };
  const part = (mg, geo, x, y, z, rx = 0, ry = 0, rz = 0, key = 'boucle', tintHex) => {
    const m = new THREE.Mesh(geo, proxy);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.userData.bucket = key;
    if (tintHex !== undefined) m.userData.tint = tintHex;
    mg.add(m);
    return m;
  };

  // pillows: 2 ochre, 1 navy, 1 stripe on modules 1, 2 and 4
  const pillowPlan = [[[0, 0xD9A65B]], [[0, 0x2E4A6B]], [], [[-0.16, 0xD9A65B], [0.16, null]]];
  [153, 171, 189, 207].forEach((deg, i) => {
    const mg = moduleAt(deg);
    // seat and back get separate AABBs so a ball landing on the cushion rests at cushion height
    const seat = new THREE.Group(), back = new THREE.Group();
    mg.add(seat, back);
    part(seat, bodyG, 0, 0.21, 0);
    part(seat, seatG, 0, 0.50 - rng() * 0.03, -0.05);
    part(back, backG, 0, 0.66, 0.345, -10 * DEG);
    for (const [px, hex] of pillowPlan[i]) {
      const yaw = (rng() - 0.5) * 16 * DEG;
      const p = hex === null
        ? part(back, stripeG, px, 0.83, 0.12, -12 * DEG, yaw, 0, 'atlas')
        : part(back, pillowG, px, 0.83, 0.12, -12 * DEG, yaw, 0, 'linen', hex);
      p.scale.y = 0.9;
    }
    colliders.boxes.push(boxColliderFromObject(seat, SOFA), boxColliderFromObject(back, SOFA));
    bake(buckets, mg, 'boucle');
  });
  for (const deg of [139, 221]) {
    const mg = moduleAt(deg);
    part(mg, bolsterG, 0, 0.30, 0);
    colliders.boxes.push(boxColliderFromObject(mg, SOFA));
    bake(buckets, mg, 'boucle');
  }
  for (const g of [bodyG, seatG, backG, bolsterG, pillowG, stripeG]) g.dispose();
  proxy.dispose();
}

// ---------------------------------------------------------------------------------------------
// 3.4 Sage velvet 2.5-seater with capsule bolster arms, facing -x

function buildVelvetSofa({ buckets, colliders, rng }) {
  const cx = 2.5, cz = -2.2;
  buckets.add('brass', placed(rbox(0.85, 0.14, 2.3, 0.03), cx, 0.07, cz));
  buckets.add('velvet', placed(rbox(0.95, 0.34, 2.4, 0.10), cx, 0.31, cz));
  const cushion = rbox(0.72, 0.14, 1.12, 0.06);
  buckets.add('velvet', placed(cushion, 2.45, 0.55, cz - 0.58));
  buckets.add('velvet', placed(cushion, 2.45, 0.55, cz + 0.58));
  buckets.add('velvet', placed(rbox(0.22, 0.42, 2.4, 0.10), 2.865, 0.69, cz, 0, 0, 8 * DEG));
  const backC = rbox(0.16, 0.40, 1.10, 0.07);
  buckets.add('velvet', placed(backC, 2.675, 0.72, cz - 0.58, 0, 0, 12 * DEG));
  buckets.add('velvet', placed(backC, 2.675, 0.72, cz + 0.58, 0, 0, 12 * DEG));
  const arm = new THREE.CapsuleGeometry(0.13, 0.75, 6, 24);
  buckets.add('velvet', placed(arm, cx, 0.58, -3.4, 0, 0, Math.PI / 2));
  buckets.add('velvet', placed(arm, cx, 0.58, -1.0, 0, 0, Math.PI / 2));
  const pillow = rbox(0.5, 0.5, 0.14, 0.05);
  for (const [z, hex] of [[-2.85, 0xC1704A], [-2.2, 0xE3D6C3], [-1.55, 0xC1704A]]) {
    const g = orient(pillow, [['y', Math.PI / 2 + (rng() - 0.5) * 0.25], ['z', -12 * DEG]], 2.54, 0.86, z);
    g.scale(1, 0.9, 1);
    buckets.add('linen', tint(g, hex));
  }
  for (const g of [cushion, backC, arm, pillow]) g.dispose();

  colliders.boxes.push(
    boxCollider(2.0, 0, -3.4, 3.0, 0.62, -1.0, VELVET),          // body + seat cushions
    boxCollider(2.55, 0.62, -3.4, 3.0, 0.93, -1.0, VELVET),      // back + back cushions
    boxCollider(2.0, 0.45, -3.53, 3.0, 0.71, -3.27, VELVET),     // window-side arm
    boxCollider(2.0, 0.45, -1.13, 3.0, 0.71, -0.87, VELVET),     // camera-side arm
  );
}

// ---------------------------------------------------------------------------------------------
// 3.5 / 3.6 Coffee table with props, and the rug

function buildTableAndRug({ statics, buckets, colliders, mats }) {
  const top = shadowMesh(placed(rbox(1.6, 0.05, 0.9, 0.02), -0.2, 0.335, -2.3), mats.marblePhys);
  top.name = 'tableTop';
  statics.add(top);
  buckets.add('travertine', placed(rbox(1.0, 0.30, 0.5, 0.03), -0.2, 0.15, -2.3));

  const profile = [[0, 0], [0.10, 0], [0.17, 0.03], [0.20, 0.08], [0.19, 0.11]].map(([x, y]) => new THREE.Vector2(x, y));
  buckets.add('props', tint(placed(new THREE.LatheGeometry(profile, 48), -0.6, 0.36, -2.5), 0xE4DED4));

  const mag = remapUV(new THREE.BoxGeometry(0.23, 0.006, 0.30), atlasUV(ATLAS.magazine));
  buckets.add('atlas', placed(mag, 0.2, 0.363, -2.1, 0, 12 * DEG, 0));

  const book = new THREE.BoxGeometry(0.24, 0.03, 0.32);
  const label = new THREE.BoxGeometry(0.004, 0.02, 0.06).translate(-0.121, 0, 0);
  buckets.add('props', tint(placed(book, -0.15, 0.375, -2.2, 0, -6 * DEG, 0), 0x2E4A6B));
  buckets.add('props', tint(placed(label, -0.15, 0.375, -2.2, 0, -6 * DEG, 0), 0xC9A46A));
  buckets.add('props', tint(placed(book, -0.15, 0.405, -2.2, 0, 4 * DEG, 0), 0xE3D6C3));
  buckets.add('props', tint(placed(label, -0.15, 0.405, -2.2, 0, 4 * DEG, 0), 0xC9A46A));
  buckets.add('props', tint(placed(new THREE.CylinderGeometry(0.04, 0.04, 0.09, 24), 0.35, 0.405, -2.45), 0xF3EEE6));
  buckets.add('props', tint(placed(new THREE.CylinderGeometry(0.002, 0.002, 0.012, 5), 0.35, 0.456, -2.45), 0x1E1D1B));
  mag.dispose(); book.dispose(); label.dispose();

  colliders.boxes.push(
    boxCollider(-1.0, 0, -2.75, 0.6, 0.36, -1.85, TABLE),
    boxCollider(-0.80, 0.36, -2.70, -0.40, 0.47, -2.30, TABLE),   // bowl
    boxCollider(-0.29, 0.36, -2.36, -0.01, 0.42, -2.04, TABLE),   // books
  );

  const rug = shadowMesh(placed(rbox(4.6, 0.018, 3.6, 0.008), 0, 0.009, -2.3), mats.rug, false, true);
  rug.name = 'rug';
  statics.add(rug);
}

// ---------------------------------------------------------------------------------------------
// 3.9 Pendants (three point lights), ceiling fan, floor lamp (fourth point light)

function buildPendants({ buckets, group }) {
  const cable = new THREE.CylinderGeometry(0.004, 0.004, 1, 6);
  const bulb = new THREE.SphereGeometry(0.03, 12, 8);
  for (const p of PENDANTS) {
    const shade = new THREE.SphereGeometry(p.r, 32, 16, 0, TAU, 0, Math.PI / 2);   // dome up, opening down
    buckets.add('rattan', placed(shade, p.x, p.y, p.z));
    shade.dispose();
    const top = hangFrom(p.x, p.z);
    const len = top - (p.y + p.r);
    buckets.add('props', tint(placed(cable, p.x, top - len / 2, p.z, 0, 0, 0, 1, len, 1), 0x1E1D1B));
    buckets.add('bulb', placed(bulb, p.x, p.y + 0.14, p.z));
    const light = new THREE.PointLight(0xFFD3A0, 5, 6, 2);
    light.position.set(p.x, p.y + 0.14, p.z);
    light.name = 'pendantLight';
    group.add(light);
  }
  cable.dispose(); bulb.dispose();
}

function buildFan({ buckets, group, mats }) {
  const h = FAN_HUB;
  const top = hangFrom(h.x, h.z);
  const rodLen = top - (h.y + 0.07);
  buckets.add('props', tint(placed(new THREE.CylinderGeometry(0.015, 0.015, rodLen, 8), h.x, top - rodLen / 2, h.z), 0x2A2622));
  buckets.add('props', tint(placed(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 32), h.x, h.y, h.z), 0x2A2622));
  const blade = grainUV(new THREE.BoxGeometry(0.75, 0.012, 0.12), 'x', 0.5, 2.0);
  const parts = [];
  for (let i = 0; i < 4; i++) parts.push(orient(blade, [['x', 12 * DEG]], 0.45, 0, 0).rotateY(i * Math.PI / 2));
  blade.dispose();
  const blades = shadowMesh(mergeAll(parts, 'fan blades'), mats.timber);
  blades.position.set(h.x, h.y - 0.08, h.z);
  blades.name = 'fanBlades';
  group.add(blades);
  return blades;
}

function buildFloorLamp({ buckets, group }) {
  const { x, z } = LAMP;
  buckets.add('brass', placed(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 32), x, 0.01, z));
  buckets.add('brass', placed(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 12), x, 0.77, z));
  buckets.add('lampShade', placed(new THREE.CylinderGeometry(0.18, 0.22, 0.28, 32, 1, true), x, 1.5, z));
  const light = new THREE.PointLight(0xFFDDB0, 3, 5, 2);
  light.position.set(x, 1.5, z);
  light.name = 'lampLight';
  group.add(light);
}

// ---------------------------------------------------------------------------------------------
// 3.8 Plants: fiddle-leaf fig by the bin (Gerald) and the instanced-leaf olive tree

function leafGeometry() {
  const outline = [[0, 0], [0.06, 0.04], [0.10, 0.12], [0.11, 0.20], [0.08, 0.27], [0, 0.30],
    [-0.08, 0.27], [-0.11, 0.20], [-0.10, 0.12], [-0.06, 0.04]].map(([x, y]) => new THREE.Vector3(x, y, 0));
  const curve = new THREE.CatmullRomCurve3(outline, true);
  const shape = new THREE.Shape(curve.getPoints(40).map((p) => new THREE.Vector2(p.x, p.y)));
  return remapUV(new THREE.ShapeGeometry(shape, 1), atlasUV(ATLAS.leaf), true);
}

function buildFig({ buckets, colliders, rng }) {
  const { x, z } = FIG;
  buckets.add('props', tint(placed(new THREE.CylinderGeometry(0.30, 0.24, 0.55, 32), x, 0.275, z), 0xCFC5B4));
  buckets.add('props', tint(placed(new THREE.CircleGeometry(0.27, 32), x, 0.551, z, -Math.PI / 2), 0x4A3B2E));
  buckets.add('props', tint(placed(new THREE.CylinderGeometry(0.02, 0.03, 1.3, 8), x, 0.55 + 0.65, z), 0x5E4A38));

  const leaf = leafGeometry();
  const anchors = [];      // { p: Vector3, dx, dz } outward direction for the leaves
  const branch = new THREE.CylinderGeometry(0.006, 0.01, 1, 6).translate(0, 0.5, 0);
  for (let i = 0; i < 5; i++) {
    const h = 1.2 + i * 0.2;
    const yaw = i * 72 * DEG + rng() * 0.6;
    const tilt = (30 + rng() * 20) * DEG;
    const len = 0.35 + rng() * 0.15;
    buckets.add('props', tint(placed(branch, x, h, z, 0, yaw, tilt, 1, len, 1), 0x5E4A38));
    // leaves along the branch (the branch tip is (0, len, 0) rotated by z tilt then y yaw)
    for (let k = 1; k <= 4; k++) {
      const s = k / 4;
      _v.set(0, len * s, 0).applyAxisAngle(Z_AXIS, tilt).applyAxisAngle(Y_AXIS, yaw);
      anchors.push({ p: new THREE.Vector3(x + _v.x, h + _v.y, z + _v.z), dx: _v.x, dz: _v.z });
    }
  }
  // two leaves at the crown
  anchors.push({ p: new THREE.Vector3(x, 1.85, z), dx: 0.3, dz: -1 }, { p: new THREE.Vector3(x, 1.85, z), dx: -1, dz: 0.4 });
  for (const a of anchors.slice(0, 22)) {
    const spread = (rng() - 0.5) * 80 * DEG;
    const yaw = Math.atan2(-a.dx, -a.dz) + spread;    // leaf tip points to -z before the yaw
    const droop = (20 + rng() * 20) * DEG;
    buckets.add('leaf', orient(leaf, [['z', (rng() - 0.5) * 0.4], ['x', -(Math.PI / 2 + droop)], ['y', yaw]], a.p.x, a.p.y, a.p.z));
  }
  leaf.dispose(); branch.dispose();
  colliders.cylinders.push(cylinderCollider(x, z, 0.30, 0, 0.55, PLANT));
}

function buildOlive({ buckets, colliders, group, rng, mats }) {
  const { x, z } = OLIVE;
  buckets.add('props', tint(placed(new THREE.CylinderGeometry(0.34, 0.28, 0.6, 32), x, 0.3, z), 0xCFC5B4));
  buckets.add('props', tint(placed(new THREE.CircleGeometry(0.31, 32), x, 0.601, z, -Math.PI / 2), 0x4A3B2E));
  buckets.add('props', tint(placed(new THREE.CylinderGeometry(0.035, 0.05, 1.6, 10), x, 1.4, z), 0x6B5B4A));
  const branch = new THREE.CylinderGeometry(0.015, 0.03, 0.7, 8).translate(0, 0.35, 0);
  buckets.add('props', tint(placed(branch, x, 1.7, z, 0, 0.6, 35 * DEG), 0x6B5B4A));
  buckets.add('props', tint(placed(branch, x, 1.8, z, 0, 3.5, 35 * DEG), 0x6B5B4A));
  branch.dispose();

  const N = 450;
  const canopy = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.04, 0.11), mats.olive, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  const c1 = new THREE.Color(0x8A9A7E), c2 = new THREE.Color(0xB8C2AE), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    let vx, vy, vz;
    do { vx = rng() * 2 - 1; vy = rng() * 2 - 1; vz = rng() * 2 - 1; } while (vx * vx + vy * vy + vz * vz > 1);
    p.set(x + vx * 0.8, 2.3 + vy * 0.7, z + vz * 0.7);
    e.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    q.setFromEuler(e);
    m.compose(p, q, s);
    canopy.setMatrixAt(i, m);
    canopy.setColorAt(i, c.copy(c1).lerp(c2, rng()));
  }
  canopy.instanceMatrix.needsUpdate = true;
  if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
  canopy.computeBoundingSphere();
  canopy.castShadow = true;
  canopy.receiveShadow = false;
  canopy.name = 'oliveCanopy';
  group.add(canopy);
  colliders.cylinders.push(cylinderCollider(x, z, 0.34, 0, 0.6, PLANT));
  return canopy;
}

// ---------------------------------------------------------------------------------------------

export function buildFurniture({ mats, buckets, statics, colliders, group, seed = 42 }) {
  const rng = mulberry32(seed);
  buildCurvedSofa({ group, buckets, colliders, rng });
  buildVelvetSofa({ buckets, colliders, rng });
  buildTableAndRug({ statics, buckets, colliders, mats });
  buildPendants({ buckets, group });
  const fanBlades = buildFan({ buckets, group, mats });
  buildFloorLamp({ buckets, group });
  buildFig({ buckets, colliders, rng });
  const canopy = buildOlive({ buckets, colliders, group, rng, mats });
  return { fanBlades, canopy };
}
