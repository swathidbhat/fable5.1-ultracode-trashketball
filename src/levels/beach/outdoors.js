// The view beyond the glass: sky dome, sun glow, animated ocean, sloped sand, headland, sailboat,
// plus the PMREM environment built from the same sky. Art doc 03 section 4.
//
// Scale note: main.js runs the camera with far = 250 (the art doc assumed 1200), so everything out
// here is sized from the camera far plane: the dome sits just inside it and the water dissolves into
// the horizon color in-shader before the clip. Raising camera.far simply pushes the horizon out.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  SKY_VERT, SKY_FRAG, WATER_VERT, WATER_FRAG, SAND_VERT, SAND_FRAG, sandH, WATER_LEVEL,
} from './shaders.js';
import { mergeAll } from './geo.js';

// Toward the sun: azimuth 30 degrees right of -z, elevation 28 degrees.
export const SUN_DIR = new THREE.Vector3(0.441, 0.469, -0.765).normalize();
export const HORIZON_HEX = 0xDCEAF1;

const col = (hex) => new THREE.Color(hex);

export function makeSkyMaterial(disk = 6.0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: col(0x4A8FD9) },
      uMid: { value: col(0x8FC0EA) },
      uHorizon: { value: col(HORIZON_HEX) },
      uHaze: { value: col(0xEFE6D3) },
      uSunDir: { value: SUN_DIR.clone() },
      uSunColor: { value: col(0xFFF6E0) },
      uDisk: { value: disk },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,   // the gradient shows the art doc hexes as written; the horizon equals the fog color
  });
}

// Fog color expressed in the output (sRGB) space, which is what three mixes fog in after tone mapping.
function horizonOut() {
  const out = new THREE.Color();
  col(HORIZON_HEX).getRGB(out, THREE.SRGBColorSpace);
  return out;
}

function makeWaterMaterial(T, waveScale, hazeNear, hazeFar) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uWaveScale: { value: waveScale },
    uSunDir: { value: SUN_DIR.clone() },
    uSunColor: { value: col(0xFFF6E0) },
    uNear: { value: col(0x3FC1C0) },
    uMid: { value: col(0x1F8FB0) },
    uFar: { value: col(0x0F5F8F) },
    uSky: { value: col(0xBFD9F0) },
    uFoam: { value: col(0xF6FAF9) },
    uHazeColor: { value: horizonOut() },
    uHazeNear: { value: hazeNear },
    uHazeFar: { value: hazeFar },
    uBright: { value: 1.15 },
  }]);
  // Added after the merge: UniformsUtils.merge clones textures, which would leak a GPU copy.
  uniforms.uNoise = { value: T.noise };
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
    transparent: true, fog: true, depthWrite: true,
  });
}

function makeSandMaterial(T) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uDry: { value: col(0xE9DAB8) },
    uWet: { value: col(0xC8B48F) },
    uFoam: { value: col(0xF6FAF9) },
    uSunDir: { value: SUN_DIR.clone() },
    uSandNorm: { value: col(0xE9DAB8) },   // texture is normalized around its base hex (linear)
    uBright: { value: 1.45 },
  }]);
  uniforms.uSand = { value: T.sand };
  uniforms.uNoise = { value: T.noise };
  return new THREE.ShaderMaterial({ uniforms, vertexShader: SAND_VERT, fragmentShader: SAND_FRAG, fog: true });
}

// Near water: fully displaced. Far water: a frame around it (no double draw under the near plane),
// long swell only, out to the far plane.
function buildWater(T, far, segs, hazeNear, hazeFar) {
  const nearGeo = new THREE.PlaneGeometry(160, 160, segs, segs);
  nearGeo.rotateX(-Math.PI / 2);
  nearGeo.translate(0, WATER_LEVEL, -90);          // spans z -10 .. -170
  const nearMat = makeWaterMaterial(T, 1.0, hazeNear, hazeFar);
  const near = new THREE.Mesh(nearGeo, nearMat);
  near.name = 'waterNear';

  const innerZ = 165, innerX = 80;                  // 5 m of overlap under the near plane hides the seam
  const pieces = [];
  const piece = (w, d, cx, cz, sw, sd) => {
    const g = new THREE.PlaneGeometry(w, d, sw, sd);
    g.rotateX(-Math.PI / 2);
    g.translate(cx, 0, cz);
    pieces.push(g);
  };
  piece(far * 2, far - innerZ, 0, -(innerZ + far) / 2, 48, 12);                      // beyond the near plane
  piece(far - innerX, innerZ - 10, -(innerX + far) / 2, -(innerZ + 10) / 2, 12, 20); // west
  piece(far - innerX, innerZ - 10, (innerX + far) / 2, -(innerZ + 10) / 2, 12, 20);  // east
  const farGeo = mergeAll(pieces, 'far water');
  farGeo.translate(0, WATER_LEVEL - 0.02, 0);
  const farMat = makeWaterMaterial(T, 0.35, hazeNear, hazeFar);
  const farMesh = new THREE.Mesh(farGeo, farMat);
  farMesh.name = 'waterFar';
  for (const m of [near, farMesh]) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; }
  return { near, far: farMesh, materials: [nearMat, farMat] };
}

function buildSand(T) {
  const geo = new THREE.PlaneGeometry(400, 132, 240, 80);   // rotated: x +-200, z -4 .. -136
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const worldZ = -y - 70;
    pos.setZ(i, sandH(x, worldZ));
  }
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -70);
  geo.computeVertexNormals();
  const mat = makeSandMaterial(T);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sand';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return { mesh, material: mat };
}

function buildSailboat() {
  const group = new THREE.Group();
  group.name = 'sailboat';
  const hullMat = new THREE.MeshBasicMaterial({ color: 0xF4F0E8, transparent: true, opacity: 1, fog: true });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.9, 1.7), hullMat);
  group.add(hull);
  const main = new THREE.Shape();
  main.moveTo(0, 0.5); main.lineTo(0, 7.0); main.lineTo(3.4, 0.5); main.closePath();
  const jib = new THREE.Shape();
  jib.moveTo(-0.15, 0.6); jib.lineTo(-0.15, 5.4); jib.lineTo(-3.0, 0.6); jib.closePath();
  const sailGeo = mergeAll([new THREE.ShapeGeometry(main), new THREE.ShapeGeometry(jib)], 'sails');
  const sailMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide, transparent: true, opacity: 1, fog: true });
  group.add(new THREE.Mesh(sailGeo, sailMat));
  return { group, materials: [hullMat, sailMat] };
}

export function createOutdoors({ T, far = 250, isTouch = false }) {
  const R = THREE.MathUtils.clamp(far * 0.95, 120, 450);   // sky dome radius, inside the far plane
  const hazeFar = R * 0.98, hazeNear = R * 0.62;
  const statics = new THREE.Group();
  statics.name = 'outdoors';

  // Sky dome
  const skyMat = makeSkyMaterial(6.0);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 24), skyMat);
  sky.name = 'sky';
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  statics.add(sky);

  // Sun glow sprite along the sun direction (scaled with distance: same 10 degree apparent size)
  const sunDist = R * 0.85;
  const sunMat = new THREE.SpriteMaterial({
    map: T.sunGlow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85, fog: false,
  });
  const sun = new THREE.Sprite(sunMat);
  sun.name = 'sunGlow';
  sun.position.copy(SUN_DIR).multiplyScalar(sunDist);
  sun.scale.set(sunDist * 0.185, sunDist * 0.185, 1);
  statics.add(sun);

  // Ocean and sand
  const water = buildWater(T, far, isTouch ? 160 : 320, hazeNear, hazeFar);
  statics.add(water.near, water.far);
  const sand = buildSand(T);
  statics.add(sand.mesh);

  // Distant headland: a pale blue ridge on the left horizon (fog does the rest)
  const headMat = new THREE.MeshBasicMaterial({ color: 0x9DB0BF, fog: true });
  const headland = new THREE.Mesh(new THREE.SphereGeometry(R * 0.25, 16, 8), headMat);
  headland.name = 'headland';
  headland.scale.set(1, 0.25, 0.6);
  headland.position.set(-R * 0.40, -5, -R * 0.80);
  statics.add(headland);

  // Sailboat drifting across the horizon
  const boat = buildSailboat();
  const boatZ = -R * 0.74, boatSpan = R * 1.1, boatSpeed = 0.4;

  const update = (t) => {
    for (const m of water.materials) m.uniforms.uTime.value = t;
    sand.material.uniforms.uTime.value = t;
    const period = boatSpan / boatSpeed;
    const u = (t % period) / period;
    const x = boatSpan * 0.5 - boatSpeed * (t % period);
    boat.group.position.set(x, -0.7 + 0.12 * Math.sin(t * 1.3), boatZ);
    boat.group.rotation.z = 0.06 * Math.sin(t * 0.7);
    const fade = Math.min(1, u / 0.06, (1 - u) / 0.06);
    for (const m of boat.materials) m.opacity = fade;
  };
  update(0);

  return { statics, sailboat: boat.group, update, skyRadius: R };
}

// PMREM of the outdoor look: the same sky above, warm sand + a band of sea below. Falls back to
// RoomEnvironment, then to no environment. Returns the render target (dispose it with the level).
export function buildEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  let rt = null;
  const tmp = new THREE.Scene();
  const skyMat = makeSkyMaterial(1.5);
  const skyGeo = new THREE.SphereGeometry(200, 32, 16);
  tmp.add(new THREE.Mesh(skyGeo, skyMat));
  const groundGeo = new THREE.CircleGeometry(190, 32);
  const groundMat = new THREE.MeshBasicMaterial({ color: 0xD9C7A6 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.0;
  tmp.add(ground);
  const seaGeo = new THREE.RingGeometry(14, 196, 32, 1);
  const seaMat = new THREE.MeshBasicMaterial({ color: 0x2A9DB8 });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.9;
  tmp.add(sea);
  try {
    rt = pmrem.fromScene(tmp, 0.04, 0.1, 600);
  } catch (err) {
    console.warn('[beach] outdoor PMREM failed, trying RoomEnvironment', err);
    rt = null;
  }
  if (!rt) {
    try { rt = pmrem.fromScene(new RoomEnvironment(), 0.04); } catch (err) { console.warn('[beach] RoomEnvironment failed', err); rt = null; }
  }
  pmrem.dispose();
  skyGeo.dispose(); skyMat.dispose(); groundGeo.dispose(); groundMat.dispose(); seaGeo.dispose(); seaMat.dispose();
  return rt;
}
