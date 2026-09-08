// Level 1: Lumon Industries, Macrodata Refinement. Contract section 9 / 9.1 / 9.2; art direction in
// docs/design/02-level1-severance-art.md. Everything is primitives plus canvas textures; static meshes are
// merged by material at the end of the build so the whole room renders in well under 150 draw calls.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCanvasTexture, redrawCanvasTexture, mulberry32 } from '../textures.js';
import { disposeTree, boxCollider, cylinderCollider, makeContactShadow, freezeStatic } from './util.js';
import {
  PALETTE, ATLAS, remapUV,
  carpetTexture, ceilingTexture, diffuserTexture, wallTexture, feltTexture, linoleumTexture,
  perforationTexture, atlasTexture, keycapTexture,
} from './severance/textures.js';
import { SCREEN_W, SCREEN_H, createScreenState, advanceScreen, drawScreen } from './severance/screen.js';

// ---------------------------------------------------------------------------------------------
// Fixed numbers (contract 9.1)

const CEILING_Y = 2.90;
const ROOM = { minX: -7, maxX: 7, minZ: -5, maxZ: 11 };
const BOUNDS = { minX: -7.5, maxX: 7.5, minZ: -14, maxZ: 12, minY: -1, maxY: 30 };
const BIN = { x: 0.75, z: -4.40, height: 0.32, rOutTop: 0.150, rOutBot: 0.120, wall: 0.006, floorThick: 0.008, rimTube: 0.009 };
const BIN_MATERIALS = {
  wall: { restitution: 0.40, friction: 0.20, rollDamping: 3.0 },
  bottom: { restitution: 0.22, friction: 0.40, rollDamping: 5.0 },
  rim: { restitution: 0.45, friction: 0.15, rollDamping: 3.0 },
};
const DESK = { x: -1.40, z: -2.00 };
const HALL = { minX: -3.7, maxX: -2.1, endZ: -13.1 };     // open doorway and corridor behind it
const DOOR2 = { minX: 4.4, maxX: 6.0 };                    // closed break-room door
const DOME_POS = new THREE.Vector3(4.90, CEILING_Y - 0.05, -4.70);
const WALL_Z = -5.0;                                        // north wall face

const DEG = Math.PI / 180;
const REDRAW_INTERVAL = 1 / 12;

let rectAreaInit = false;
function ensureRectAreaLib() {
  if (rectAreaInit) return;
  if (!THREE.UniformsLib.LTC_FLOAT_1) RectAreaLightUniformsLib.init();
  rectAreaInit = true;
}

// ---------------------------------------------------------------------------------------------
// Small geometry helpers

function scaleUV(geo, su, sv = 1) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

// A crumpled paper ball: sphere with a position-hashed displacement (seam-safe), flat shaded by the material.
function crumpledGeometry(r, seed) {
  const g = new THREE.SphereGeometry(r, 12, 9);
  const p = g.attributes.position;
  const s = seed * 13.37;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 97.3 + y * 57.1 + z * 23.7 + s) * Math.cos(y * 71.9 - z * 41.3 + x * 17.1 - s);
    const k = 1 + 0.15 * n;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

// Merge a list of positioned meshes into one mesh per material, in `root` space. Colliders must be
// computed before calling this (the source meshes are removed). Falls back to keeping the clones as
// separate meshes if geometries cannot be merged.
const _rel = new THREE.Matrix4();
function bakeMeshes(root, meshes) {
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  for (const m of meshes) {
    m.updateWorldMatrix(true, false);
    _rel.multiplyMatrices(inv, m.matrixWorld);
    const g = m.geometry.clone().applyMatrix4(_rel);
    let b = buckets.get(m.material);
    if (!b) { b = { geos: [], cast: false, receive: false, renderOrder: 0 }; buckets.set(m.material, b); }
    b.geos.push(g);
    b.cast = b.cast || m.castShadow;
    b.receive = b.receive || m.receiveShadow;
    b.renderOrder = Math.max(b.renderOrder, m.renderOrder);
    m.removeFromParent();
  }
  const out = [];
  for (const [mat, b] of buckets) {
    let merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (merged) {
      if (b.geos.length > 1) for (const g of b.geos) g.dispose();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = b.cast; mesh.receiveShadow = b.receive; mesh.renderOrder = b.renderOrder;
      root.add(mesh); out.push(mesh);
    } else {
      for (const g of b.geos) {
        const mesh = new THREE.Mesh(g, mat);
        mesh.castShadow = b.cast; mesh.receiveShadow = b.receive; mesh.renderOrder = b.renderOrder;
        root.add(mesh); out.push(mesh);
      }
    }
  }
  return out;
}

// Fit a directional light's ortho shadow frustum around a world-space box.
const _corner = new THREE.Vector3();
function fitShadowFrustum(light, targetPos, box, margin = 0.3) {
  const rot = new THREE.Matrix4().lookAt(light.position, targetPos, THREE.Object3D.DEFAULT_UP);
  const inv = rot.clone().invert();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < 8; i++) {
    _corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    _corner.sub(light.position).applyMatrix4(inv);
    minX = Math.min(minX, _corner.x); maxX = Math.max(maxX, _corner.x);
    minY = Math.min(minY, _corner.y); maxY = Math.max(maxY, _corner.y);
    minZ = Math.min(minZ, _corner.z); maxZ = Math.max(maxZ, _corner.z);
  }
  const cam = light.shadow.camera;
  cam.left = minX - margin; cam.right = maxX + margin;
  cam.bottom = minY - margin; cam.top = maxY + margin;
  cam.near = Math.max(0.1, -maxZ - margin);
  cam.far = -minZ + margin;
  cam.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------------------------
// The level

export function createSeveranceLevel(ctx) {
  const { scene, renderer, camera } = ctx;
  const isTouch = !!ctx.isTouch;
  const lowQuality = ctx.quality === 'low';

  const group = new THREE.Group();
  group.name = 'severance';
  scene.add(group);

  const statics = [];          // meshes merged by material at the end
  const boxes = [];            // physics AABBs
  const cylinders = [];
  const dynamic = [];          // objects that keep matrixAutoUpdate after freezeStatic

  // --- textures (12: carpet, ceiling, diffuser, wall, felt, linoleum, perforation, atlas, keycaps, 3 screens)
  const texCarpet = carpetTexture();
  const texCeiling = ceilingTexture();
  const texDiffuser = diffuserTexture();
  const texWall = wallTexture();
  const texFelt = feltTexture();
  const texLino = linoleumTexture();
  const texPerf = perforationTexture();
  const texAtlas = atlasTexture();
  const texKeys = keycapTexture();

  // --- materials (shared; the bake groups by identity)
  const MSM = (p) => new THREE.MeshStandardMaterial(p);
  const M = {
    carpet: MSM({ color: 0xffffff, map: texCarpet, bumpMap: texCarpet, bumpScale: 0.0015, roughness: 1.0, metalness: 0 }),
    ceiling: MSM({ color: PALETTE.ceiling, map: texCeiling, roughness: 0.95 }),
    wall: MSM({ color: 0xffffff, map: texWall, roughness: 0.9 }),
    skirting: MSM({ color: PALETTE.skirting, roughness: 0.7 }),
    panel: MSM({ color: 0xffffff, emissive: PALETTE.diffuserEmissive, emissiveIntensity: 1.5, emissiveMap: texDiffuser, roughness: 0.6 }),
    hallPanel: MSM({ color: 0xffffff, emissive: PALETTE.hallPanel, emissiveIntensity: 1.5, emissiveMap: texDiffuser, roughness: 0.6 }),
    hallWall: MSM({ color: PALETTE.hallWall, roughness: 0.9 }),
    hallFloor: MSM({ color: 0xffffff, map: texLino, roughness: 0.28, metalness: 0.05 }),
    deskTop: MSM({ color: PALETTE.deskTop, roughness: 0.45 }),
    deskFrame: MSM({ color: PALETTE.deskFrame, roughness: 0.6 }),
    deskRing: MSM({ color: PALETTE.deskRing, roughness: 0.5 }),
    partition: MSM({ color: PALETTE.partition, roughness: 0.98, bumpMap: texFelt, bumpScale: 0.002 }),
    trim: MSM({ color: PALETTE.partitionTrim, roughness: 0.6 }),
    cord: MSM({ color: PALETTE.cord, roughness: 0.8 }),
    monitorRear: MSM({ color: PALETTE.monitorRear, roughness: 0.7 }),
    monitorBezel: MSM({ color: PALETTE.monitorBezel, roughness: 0.6 }),
    keyboard: MSM({ color: PALETTE.keyboard, roughness: 0.6 }),
    keyBlock: MSM({ color: 0xffffff, map: texKeys, roughness: 0.6 }),
    fnKey: MSM({ color: PALETTE.fnKey, roughness: 0.6 }),
    recess: MSM({ color: PALETTE.recess, roughness: 0.6 }),
    trackball: MSM({ color: PALETTE.trackball, roughness: 0.15, metalness: 0.1 }),
    webcam: new THREE.MeshBasicMaterial({ color: 0x0A0A0A }),
    chairFabric: MSM({ color: PALETTE.chairFabric, roughness: 0.95 }),
    chairShell: MSM({ color: PALETTE.chairShell, roughness: 0.5 }),
    chairMetal: MSM({ color: PALETTE.chairMetal, metalness: 0.7, roughness: 0.35 }),
    caster: MSM({ color: PALETTE.caster, roughness: 0.4 }),
    binBody: MSM({ color: PALETTE.binBody, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide, bumpMap: texPerf, bumpScale: 0.0008 }),
    binInner: MSM({ color: PALETTE.binInterior, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide }),
    binRim: MSM({ color: PALETTE.binRim, metalness: 0.85, roughness: 0.3, emissive: 0x000000, emissiveIntensity: 1 }),
    doorSlab: MSM({ color: PALETTE.doorSlab, roughness: 0.7 }),
    doorFrame: MSM({ color: PALETTE.doorFrame, roughness: 0.6 }),
    lever: MSM({ color: PALETTE.lever, metalness: 0.6, roughness: 0.35 }),
    portraitFrame: MSM({ color: PALETTE.portraitFrame, metalness: 0.5, roughness: 0.5 }),
    portrait: MSM({ color: 0xffffff, map: texAtlas, emissive: 0xffffff, emissiveMap: texAtlas, emissiveIntensity: 0, roughness: 0.85 }),
    placard: MSM({ color: 0xffffff, map: texAtlas, roughness: 0.6 }),
    decal: new THREE.MeshBasicMaterial({ color: 0xffffff, map: texAtlas, transparent: true, depthWrite: false }),
    binDecal: new THREE.MeshBasicMaterial({ color: PALETTE.wall, map: texAtlas, transparent: true, depthWrite: false }),
    paper: MSM({ color: PALETTE.paper, roughness: 0.9 }),
    paperBall: MSM({ color: PALETTE.paper, roughness: 0.92, flatShading: true }),
    powder: MSM({ color: 0xffffff, map: texAtlas, roughness: 0.7 }),
    pencil: MSM({ color: PALETTE.keyBlock, roughness: 0.8 }),
    dome: MSM({ color: 0x0E0E10, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.72 }),
    domeMount: MSM({ color: 0x1A1A1C, roughness: 0.5 }),
    led: MSM({ color: 0x1A0000, emissive: 0xFF2A2A, emissiveIntensity: 1.0, roughness: 0.4 }),
  };
  const wallProps = { tag: 'wall', restitution: 0.38, friction: 0.30, rollDamping: 3.0 };
  const ceilingProps = { tag: 'ceiling', restitution: 0.35, friction: 0.30, rollDamping: 3.0 };
  const deskProps = { tag: 'desk', restitution: 0.40, friction: 0.35, rollDamping: 3.5 };
  const partitionProps = { tag: 'partition', restitution: 0.25, friction: 0.50, rollDamping: 3.0 };
  const monitorProps = { tag: 'monitor', restitution: 0.35, friction: 0.30, rollDamping: 3.0 };
  const chairProps = { tag: 'chair', restitution: 0.30, friction: 0.50, rollDamping: 3.0 };
  const doorProps = { tag: 'door', restitution: 0.40, friction: 0.30, rollDamping: 3.0 };

  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = group, isStatic = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    if (isStatic) statics.push(m);
    return m;
  };

  // ============================================================================================
  // 3.1 Shell

  {
    const floor = mesh(new THREE.PlaneGeometry(14, 16), M.carpet, 0, 0, 3);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;

    const ceil = mesh(new THREE.PlaneGeometry(14, 16), M.ceiling, 0, CEILING_Y, 3);
    ceil.rotation.x = Math.PI / 2;

    // north wall around the two doors: full-height segments plus headers, all merged into one wall mesh
    const H = CEILING_Y;
    const wallBox = (w, h, d, x, y, z) => {
      const g = scaleUV(new THREE.BoxGeometry(w, h, d), Math.max(w, d) / 1.2);
      const m = mesh(g, M.wall, x, y, z);
      m.receiveShadow = true;
      return m;
    };
    const northZ = WALL_Z - 0.10;
    const seg = (x0, x1) => wallBox(x1 - x0, H, 0.2, (x0 + x1) / 2, H / 2, northZ);
    seg(ROOM.minX, HALL.minX);
    seg(HALL.maxX, DOOR2.minX);
    seg(DOOR2.maxX, ROOM.maxX);
    const header = (x0, x1) => wallBox(x1 - x0, H - 2.1, 0.2, (x0 + x1) / 2, (H + 2.1) / 2, northZ);
    header(HALL.minX, HALL.maxX);
    header(DOOR2.minX, DOOR2.maxX);
    wallBox(14.4, H, 0.2, 0, H / 2, ROOM.maxZ + 0.1);                 // south
    wallBox(0.2, H, 16, ROOM.maxX + 0.1, H / 2, 3);                    // east
    wallBox(0.2, H, 16, ROOM.minX - 0.1, H / 2, 3);                    // west

    // skirting: 0.10 tall, 0.012 proud of the wall face, none across the doorways
    const skirt = (len, x, z, alongX) => {
      const g = alongX ? new THREE.BoxGeometry(len, 0.10, 0.012) : new THREE.BoxGeometry(0.012, 0.10, len);
      mesh(g, M.skirting, x, 0.05, z);
    };
    skirt(HALL.minX - ROOM.minX, (ROOM.minX + HALL.minX) / 2, WALL_Z + 0.006, true);
    skirt(DOOR2.minX - HALL.maxX, (HALL.maxX + DOOR2.minX) / 2, WALL_Z + 0.006, true);
    skirt(ROOM.maxX - DOOR2.maxX, (DOOR2.maxX + ROOM.maxX) / 2, WALL_Z + 0.006, true);
    skirt(14, 0, ROOM.maxZ - 0.006, true);
    skirt(16, ROOM.maxX - 0.006, 3, false);
    skirt(16, ROOM.minX + 0.006, 3, false);

    // colliders: walls (doorway left open), headers, ceiling
    boxes.push(boxCollider(ROOM.minX - 0.2, 0, WALL_Z - 0.2, HALL.minX, CEILING_Y, WALL_Z, wallProps));
    boxes.push(boxCollider(HALL.maxX, 0, WALL_Z - 0.2, DOOR2.minX, CEILING_Y, WALL_Z, wallProps));
    boxes.push(boxCollider(DOOR2.maxX, 0, WALL_Z - 0.2, ROOM.maxX + 0.2, CEILING_Y, WALL_Z, wallProps));
    boxes.push(boxCollider(HALL.minX, 2.1, WALL_Z - 0.2, HALL.maxX, CEILING_Y, WALL_Z, wallProps));
    boxes.push(boxCollider(DOOR2.minX, 2.1, WALL_Z - 0.2, DOOR2.maxX, CEILING_Y, WALL_Z, wallProps));
    boxes.push(boxCollider(ROOM.minX - 0.2, 0, ROOM.maxZ, ROOM.maxX + 0.2, CEILING_Y, ROOM.maxZ + 0.2, wallProps));
    boxes.push(boxCollider(ROOM.maxX, 0, ROOM.minZ - 0.2, ROOM.maxX + 0.2, CEILING_Y, ROOM.maxZ + 0.2, wallProps));
    boxes.push(boxCollider(ROOM.minX - 0.2, 0, ROOM.minZ - 0.2, ROOM.minX, CEILING_Y, ROOM.maxZ + 0.2, wallProps));
    boxes.push(boxCollider(ROOM.minX, CEILING_Y, ROOM.minZ, ROOM.maxX, CEILING_Y + 0.2, ROOM.maxZ, ceilingProps));
  }

  // --- fluorescent panels: 30 on a 2.4 m grid; the nine over the play area stay individual (ceiling rattle)
  const panels = [];
  {
    const panelGeo = new THREE.BoxGeometry(1.2, 0.02, 0.6);
    for (const x of [-4.8, -2.4, 0, 2.4, 4.8]) {
      for (const z of [-3.6, -1.2, 1.2, 3.6, 6.0, 8.4]) {
        const near = Math.abs(x) <= 2.4 && z <= 1.2;
        const p = mesh(panelGeo, M.panel, x, CEILING_Y - 0.015, z, group, !near);
        if (near) { p.userData.baseY = p.position.y; panels.push(p); dynamic.push(p); }
      }
    }
  }

  // ============================================================================================
  // Hallway behind the open door (x -3.7..-2.1, z -5 .. -13.1)

  {
    const cx = (HALL.minX + HALL.maxX) / 2;
    const hw = HALL.maxX - HALL.minX;                       // 1.6
    const zBack = HALL.endZ - 0.1;                          // outer face of the end wall
    // floor runs from just inside the doorway to the end wall (a threshold strip under the frame)
    const floor = mesh(new THREE.PlaneGeometry(hw, (WALL_Z + 0.05) - zBack), M.hallFloor, cx, 0.001, ((WALL_Z + 0.05) + zBack) / 2);
    floor.rotation.x = -Math.PI / 2;
    // ceiling stops inside the wall thickness so it never shares a plane with the MDR ceiling
    const ceil = mesh(new THREE.PlaneGeometry(hw, (WALL_Z - 0.1) - HALL.endZ), M.hallWall, cx, CEILING_Y, ((WALL_Z - 0.1) + HALL.endZ) / 2);
    ceil.rotation.x = Math.PI / 2;
    // side walls end flush with the north wall face
    const sideLen = WALL_Z - zBack, sideZ = (WALL_Z + zBack) / 2;
    mesh(new THREE.BoxGeometry(0.1, CEILING_Y, sideLen), M.hallWall, HALL.minX - 0.05, CEILING_Y / 2, sideZ);
    mesh(new THREE.BoxGeometry(0.1, CEILING_Y, sideLen), M.hallWall, HALL.maxX + 0.05, CEILING_Y / 2, sideZ);
    mesh(new THREE.BoxGeometry(hw + 0.2, CEILING_Y, 0.1), M.hallWall, cx, CEILING_Y / 2, HALL.endZ - 0.05);
    const hp = new THREE.BoxGeometry(1.2, 0.02, 0.6);
    for (const z of [-6.5, -9.0, -11.5]) mesh(hp, M.hallPanel, cx, CEILING_Y - 0.015, z);
    // end wall: a 0.9 m globe and the wayfinding sign
    const globe = mesh(remapUV(new THREE.PlaneGeometry(0.9, 0.53), ATLAS.wordmark), M.decal, cx, 2.05, HALL.endZ + 0.006);
    globe.renderOrder = 2;
    mesh(remapUV(new THREE.PlaneGeometry(1.36, 0.17), ATLAS.wayfinding), M.placard, cx, 1.35, HALL.endZ + 0.006);
    // door 1 frame (three strips)
    mesh(new THREE.BoxGeometry(0.05, 2.1, 0.22), M.doorFrame, HALL.minX - 0.025, 1.05, WALL_Z);
    mesh(new THREE.BoxGeometry(0.05, 2.1, 0.22), M.doorFrame, HALL.maxX + 0.025, 1.05, WALL_Z);
    mesh(new THREE.BoxGeometry(HALL.maxX - HALL.minX + 0.1, 0.05, 0.22), M.doorFrame, cx, 2.125, WALL_Z);
    // hallway colliders
    boxes.push(boxCollider(HALL.minX - 0.2, 0, HALL.endZ, HALL.minX, CEILING_Y, WALL_Z, wallProps));
    boxes.push(boxCollider(HALL.maxX, 0, HALL.endZ, HALL.maxX + 0.2, CEILING_Y, WALL_Z, wallProps));
    boxes.push(boxCollider(HALL.minX - 0.2, 0, HALL.endZ - 0.2, HALL.maxX + 0.2, CEILING_Y, HALL.endZ, wallProps));
    boxes.push(boxCollider(HALL.minX, CEILING_Y, HALL.endZ, HALL.maxX, CEILING_Y + 0.2, WALL_Z, ceilingProps));
  }

  // ============================================================================================
  // 3.6 North wall dressing: portrait above the bin, placards, wordmark, break-room door, wellness sign

  let portraitMesh;
  {
    const zFace = WALL_Z + 0.015;
    portraitMesh = mesh(remapUV(new THREE.PlaneGeometry(0.6, 0.8), ATLAS.portrait), M.portrait, BIN.x, 1.55, WALL_Z + 0.02);
    const fr = (w, h, x, y) => { const f = mesh(new THREE.BoxGeometry(w, h, 0.03), M.portraitFrame, x, y, zFace); f.castShadow = true; };
    fr(0.68, 0.04, BIN.x, 1.55 + 0.42);
    fr(0.68, 0.04, BIN.x, 1.55 - 0.42);
    fr(0.04, 0.80, BIN.x - 0.32, 1.55);
    fr(0.04, 0.80, BIN.x + 0.32, 1.55);
    mesh(remapUV(new THREE.PlaneGeometry(0.18, 0.04), ATLAS.nameplate), M.placard, BIN.x, 1.10, zFace);
    mesh(remapUV(new THREE.PlaneGeometry(0.36, 0.12), ATLAS.mdr), M.placard, -1.75, 1.60, zFace);
    const wm = mesh(remapUV(new THREE.PlaneGeometry(1.4, 0.82), ATLAS.wordmark), M.decal, 3.60, 1.50, zFace);
    wm.renderOrder = 2;
    mesh(remapUV(new THREE.PlaneGeometry(0.30, 0.10), ATLAS.breakroom), M.placard, (DOOR2.minX + DOOR2.maxX) / 2, 2.35, zFace);
    mesh(remapUV(new THREE.PlaneGeometry(0.50, 0.12), ATLAS.wellness), M.placard, 6.45, 1.60, zFace);

    // door 2: closed slab, frame, lever
    const dcx = (DOOR2.minX + DOOR2.maxX) / 2;
    const slab = mesh(new THREE.BoxGeometry(1.5, 2.05, 0.05), M.doorSlab, dcx, 1.025, WALL_Z + 0.03);
    slab.castShadow = true;
    mesh(new THREE.BoxGeometry(0.05, 2.1, 0.22), M.doorFrame, DOOR2.minX - 0.025, 1.05, WALL_Z);
    mesh(new THREE.BoxGeometry(0.05, 2.1, 0.22), M.doorFrame, DOOR2.maxX + 0.025, 1.05, WALL_Z);
    mesh(new THREE.BoxGeometry(DOOR2.maxX - DOOR2.minX + 0.1, 0.05, 0.22), M.doorFrame, dcx, 2.125, WALL_Z);
    mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), M.lever, DOOR2.minX + 0.22, 1.00, WALL_Z + 0.065);
    boxes.push(boxCollider(DOOR2.minX, 0, WALL_Z - 0.2, DOOR2.maxX, 2.1, WALL_Z + 0.055, doorProps));
  }

  // ============================================================================================
  // 3.2 Diamond desk cluster

  const partitionCenters = [];   // for the cords and colliders
  {
    const dg = new THREE.Group();
    dg.position.set(DESK.x, 0, DESK.z);
    group.add(dg);
    const top = mesh(new THREE.BoxGeometry(3.2, 0.04, 3.2), M.deskTop, 0, 0.73, 0, dg);
    top.castShadow = true; top.receiveShadow = true;
    const ped = mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.71, 24), M.deskFrame, 0, 0.355, 0, dg);
    ped.castShadow = true;
    const ring = mesh(new THREE.TorusGeometry(0.24, 0.012, 8, 32), M.deskRing, 0, 0.02, 0, dg);
    ring.rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(3.0, 0.06, 0.12), M.deskFrame, 0, 0.68, 0, dg);
    mesh(new THREE.BoxGeometry(0.12, 0.06, 3.0), M.deskFrame, 0, 0.68, 0, dg);

    // partitions run from the pedestal to each corner; the NE one (the player's) hangs 4 cm lower
    const partGeo = new THREE.BoxGeometry(1.9, 0.55, 0.04);
    const trimGeo = new THREE.BoxGeometry(1.9, 0.02, 0.05);
    const cordGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.52, 6);
    const corners = [[1, -1], [1, 1], [-1, 1], [-1, -1]];   // NE, SE, SW, NW (z negative = north)
    corners.forEach(([sx, sz], i) => {
      const drop = i === 0 ? 0.04 : 0;
      const yaw = sx * sz > 0 ? -Math.PI / 4 : Math.PI / 4;
      const px = sx * 0.884, pz = sz * 0.884;
      const part = mesh(partGeo, M.partition, px, 1.025 - drop, pz, dg);
      part.rotation.y = yaw; part.castShadow = true;
      const trim = mesh(trimGeo, M.trim, px, 1.31 - drop, pz, dg);
      trim.rotation.y = yaw;
      // pulley cord at the outer end, hanging from the trim to the desk top
      const ex = sx * 0.7071 * 2.13, ez = sz * 0.7071 * 2.13;
      const ox = -sz * 0.7071 * 0.035, oz = sx * 0.7071 * 0.035;
      mesh(cordGeo, M.cord, ex + ox, 1.04 - drop, ez + oz, dg);
      partitionCenters.push({ x: DESK.x + px, z: DESK.z + pz, dx: sx * 0.7071, dz: sz * 0.7071 });
    });

    // colliders: desk top (thick enough to include the underframe), pedestal, partitions as 4 AABBs each
    boxes.push(boxCollider(DESK.x - 1.6, 0.65, DESK.z - 1.6, DESK.x + 1.6, 0.75, DESK.z + 1.6, deskProps));
    cylinders.push(cylinderCollider(DESK.x, DESK.z, 0.24, 0, 0.71, deskProps));
    for (const p of partitionCenters) {
      for (let k = 0; k < 4; k++) {
        const t = (k - 1.5) * 0.475;
        const cx = p.x + p.dx * t, cz = p.z + p.dz * t;
        const h = 0.185;
        boxes.push(boxCollider(cx - h, 0.75, cz - h, cx + h, 1.32, cz + h, partitionProps));
      }
    }
  }

  // ============================================================================================
  // 3.3 Terminals: east (player), north, west, south. East and south face the camera and animate.

  const stations = [
    { x: DESK.x + 1.0, z: DESK.z, yaw: Math.PI / 2, name: 'east', animate: true },
    { x: DESK.x, z: DESK.z - 1.0, yaw: Math.PI, name: 'north', animate: false },
    { x: DESK.x - 1.0, z: DESK.z, yaw: -Math.PI / 2, name: 'west', animate: false },
    { x: DESK.x, z: DESK.z + 1.0, yaw: 0, name: 'south', animate: true },
  ];

  const screenStatic = createScreenState(101);
  const texScreenStatic = makeCanvasTexture(SCREEN_W, SCREEN_H, (c, w, h) => drawScreen(c, w, h, screenStatic),
    { srgb: true, wrap: THREE.ClampToEdgeWrapping, anisotropy: 4 });
  const screenMatStatic = MSM({ color: 0x000000, emissive: 0xffffff, emissiveMap: texScreenStatic, emissiveIntensity: 1.2, roughness: 0.3 });
  const screens = [];   // { state, tex, mat } for the animated ones

  {
    const housingGeo = new THREE.BoxGeometry(0.34, 0.28, 0.30);
    const bezelGeo = new THREE.BoxGeometry(0.42, 0.34, 0.10);
    const screenGeo = new THREE.PlaneGeometry(0.30, 0.22);
    const neckGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.06, 16);
    const footGeo = new THREE.BoxGeometry(0.30, 0.02, 0.24);
    const kbGeo = new THREE.BoxGeometry(0.46, 0.035, 0.18);
    const keysGeo = new THREE.BoxGeometry(0.28, 0.012, 0.11);
    const fnGeo = new THREE.BoxGeometry(0.02, 0.012, 0.02);
    const recessGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 24);
    const ballGeo = new THREE.SphereGeometry(0.03, 24, 16);
    const badgeGeo = remapUV(new THREE.PlaneGeometry(0.03, 0.035), ATLAS.droplet);
    const camGeo = new THREE.CircleGeometry(0.004, 12);

    for (let i = 0; i < stations.length; i++) {
      const st = stations[i];
      const tg = new THREE.Group();
      tg.position.set(st.x, 0.75, st.z);
      tg.rotation.y = st.yaw;
      group.add(tg);

      const housing = mesh(housingGeo, M.monitorRear, 0, 0.22, -0.12, tg); housing.castShadow = true;
      const bezel = mesh(bezelGeo, M.monitorBezel, 0, 0.24, 0.05, tg); bezel.castShadow = true;
      mesh(neckGeo, M.monitorRear, 0, 0.04, -0.06, tg);
      mesh(footGeo, M.monitorBezel, 0, 0.01, -0.06, tg);

      let screenMat = screenMatStatic;
      if (st.animate) {
        const state = createScreenState(7 + i * 31);
        const tex = makeCanvasTexture(SCREEN_W, SCREEN_H, (c, w, h) => drawScreen(c, w, h, state),
          { srgb: true, wrap: THREE.ClampToEdgeWrapping, anisotropy: 4 });
        screenMat = MSM({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.2, roughness: 0.3 });
        screens.push({ state, tex, mat: screenMat });
      }
      mesh(screenGeo, screenMat, 0, 0.25, 0.101, tg);
      const badge = mesh(badgeGeo, M.decal, 0, 0.105, 0.1015, tg); badge.renderOrder = 2;
      mesh(camGeo, M.webcam, 0, 0.395, 0.1015, tg);

      // keyboard toward the worker
      mesh(kbGeo, M.keyboard, 0, 0.0175, 0.33, tg);
      mesh(keysGeo, M.keyBlock, -0.06, 0.04, 0.33, tg);
      for (let k = 0; k < 4; k++) mesh(fnGeo, M.fnKey, -0.16 + k * 0.035, 0.041, 0.26, tg);
      mesh(recessGeo, M.recess, 0.15, 0.03, 0.33, tg);
      mesh(ballGeo, M.trackball, 0.15, 0.045, 0.33, tg);

      // monitor collider from the housing + bezel footprint in the station frame
      tg.updateWorldMatrix(true, false);
      const b = new THREE.Box3(new THREE.Vector3(-0.21, 0, -0.27), new THREE.Vector3(0.21, 0.41, 0.10)).applyMatrix4(tg.matrixWorld);
      boxes.push(boxCollider(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, monitorProps));
    }
  }

  // ============================================================================================
  // 3.4 Chairs (Blu Dot Daily Task look), each facing the pedestal

  const chairs = [
    { x: DESK.x + 2.0, z: DESK.z, yaw: -Math.PI / 2 },
    { x: DESK.x, z: DESK.z - 2.0, yaw: 0 },
    { x: DESK.x - 2.0, z: DESK.z, yaw: Math.PI / 2 },
    { x: DESK.x, z: DESK.z + 2.0, yaw: Math.PI },
  ];
  {
    const seatPadGeo = new THREE.BoxGeometry(0.44, 0.05, 0.42);
    const seatShellGeo = new THREE.BoxGeometry(0.48, 0.03, 0.46);
    const backPadGeo = new THREE.BoxGeometry(0.42, 0.34, 0.04);
    const backShellGeo = new THREE.BoxGeometry(0.46, 0.38, 0.02);
    const stemGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.36, 12);
    const armGeo = new THREE.BoxGeometry(0.30, 0.02, 0.03).translate(0.15, 0, 0);
    const casterGeo = new THREE.SphereGeometry(0.025, 12, 8);
    for (const c of chairs) {
      const cg = new THREE.Group();
      cg.position.set(c.x, 0, c.z);
      cg.rotation.y = c.yaw;
      group.add(cg);
      const pad = mesh(seatPadGeo, M.chairFabric, 0, 0.485, 0, cg); pad.castShadow = true;
      mesh(seatShellGeo, M.chairShell, 0, 0.445, 0, cg);
      const bp = mesh(backPadGeo, M.chairFabric, 0, 0.70, -0.21, cg); bp.rotation.x = -8 * DEG; bp.castShadow = true;
      const bs = mesh(backShellGeo, M.chairShell, 0, 0.70, -0.24, cg); bs.rotation.x = -8 * DEG;
      mesh(stemGeo, M.chairMetal, 0, 0.26, 0, cg);
      for (let i = 0; i < 5; i++) {
        const a = i * 72 * DEG;
        const arm = mesh(armGeo, M.chairMetal, 0, 0.05, 0, cg);
        arm.rotation.y = a;
        mesh(casterGeo, M.caster, Math.cos(a) * 0.30, 0.025, -Math.sin(a) * 0.30, cg);
      }
      cg.updateWorldMatrix(true, false);
      const seat = new THREE.Box3(new THREE.Vector3(-0.24, 0.43, -0.23), new THREE.Vector3(0.24, 0.51, 0.23)).applyMatrix4(cg.matrixWorld);
      const back = new THREE.Box3(new THREE.Vector3(-0.23, 0.51, -0.27), new THREE.Vector3(0.23, 0.89, -0.18)).applyMatrix4(cg.matrixWorld);
      boxes.push(boxCollider(seat.min.x, seat.min.y, seat.min.z, seat.max.x, seat.max.y, seat.max.z, chairProps));
      boxes.push(boxCollider(back.min.x, back.min.y, back.min.z, back.max.x, back.max.y, back.max.z, chairProps));
    }
  }

  // ============================================================================================
  // 3.5 The bin (its own group: main.js wobbles it; no box collider, physics owns the bin)

  const binGroup = new THREE.Group();
  binGroup.position.set(BIN.x, 0, BIN.z);
  group.add(binGroup);
  dynamic.push(binGroup);
  let rimMesh;
  {
    const outer = [
      new THREE.Vector2(0.000, 0.000),
      new THREE.Vector2(BIN.rOutBot, 0.000),
      new THREE.Vector2(BIN.rOutTop, BIN.height),
      new THREE.Vector2(BIN.rOutTop - BIN.wall, BIN.height),
    ];
    const inner = [
      new THREE.Vector2(BIN.rOutTop - BIN.wall, BIN.height),
      new THREE.Vector2(BIN.rOutBot - BIN.wall, BIN.floorThick),
      new THREE.Vector2(0.000, BIN.floorThick),
    ];
    const body = new THREE.Mesh(new THREE.LatheGeometry(outer, 48), M.binBody);
    body.castShadow = true;
    binGroup.add(body);
    const shell = new THREE.Mesh(new THREE.LatheGeometry(inner, 48), M.binInner);
    binGroup.add(shell);
    rimMesh = new THREE.Mesh(new THREE.TorusGeometry(BIN.rOutTop - BIN.wall / 2, BIN.rimTube, 12, 48), M.binRim);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.y = BIN.height;
    rimMesh.castShadow = true;
    binGroup.add(rimMesh);
    const base = new THREE.Mesh(new THREE.TorusGeometry(BIN.rOutBot, 0.005, 8, 48), M.binRim);
    base.rotation.x = Math.PI / 2;
    base.position.y = 0.005;
    binGroup.add(base);
    const decal = new THREE.Mesh(remapUV(new THREE.PlaneGeometry(0.075, 0.09), ATLAS.droplet), M.binDecal);
    const taper = Math.atan((BIN.rOutTop - BIN.rOutBot) / BIN.height);
    const rAt = BIN.rOutBot + (BIN.rOutTop - BIN.rOutBot) * (0.15 / BIN.height);
    decal.position.set(0, 0.15, rAt + 0.003);
    decal.rotation.x = taper;
    decal.renderOrder = 2;
    binGroup.add(decal);
  }

  // ============================================================================================
  // Props: paper stack, loose paper balls, finger trap, pencil cup, contact shadows

  const paperStack = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.025, 0.297).translate(0, 0.0125, 0), M.paper);
  paperStack.position.set(-0.10, 0.75, -1.55);
  paperStack.castShadow = true;
  group.add(paperStack);
  dynamic.push(paperStack);

  {
    const b1 = mesh(crumpledGeometry(0.04, 1), M.paperBall, 1.30, 0.04, -4.10); b1.castShadow = true; b1.rotation.set(0.4, 1.1, 0.2);
    const b2 = mesh(crumpledGeometry(0.04, 2), M.paperBall, 0.20, 0.04, -4.70); b2.castShadow = true; b2.rotation.set(1.2, 0.3, 0.9);

    const trap = mesh(remapUV(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 12), ATLAS.stripes), M.powder, -1.55, 0.765, -3.25);
    trap.rotation.z = Math.PI / 2;
    trap.rotation.y = 0.3;

    mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.09, 16), M.monitorRear, -2.35, 0.795, -1.35);
    const pencilGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.16, 6);
    for (let i = 0; i < 3; i++) {
      const p = mesh(pencilGeo, M.pencil, -2.35 + (i - 1) * 0.012, 0.86, -1.35 + (i % 2) * 0.01);
      p.rotation.z = (i - 1) * 0.12; p.rotation.x = 0.08 * (i - 1);
    }

    // contact shadows share one material so they bake into a single mesh
    const proto = makeContactShadow(0.3, 0.30);
    const shadowMat = proto.material;
    proto.geometry.dispose();
    const disc = (r, x, z) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), shadowMat);
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.002, z); m.renderOrder = 1;
      group.add(m); statics.push(m);
    };
    disc(0.19, BIN.x, BIN.z);
    disc(0.30, DESK.x, DESK.z);
    for (const c of chairs) disc(0.30, c.x, c.z);
  }

  // ============================================================================================
  // Security dome with a breathing LED (the inner eye group turns toward the camera after 3 misses)

  const eye = new THREE.Group();
  let led;
  {
    const domeGeo = new THREE.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, M.dome);
    dome.rotation.x = Math.PI;
    dome.position.copy(DOME_POS);
    dome.renderOrder = 3;
    group.add(dome);
    mesh(new THREE.CylinderGeometry(0.075, 0.075, CEILING_Y - DOME_POS.y + 0.01, 24), M.domeMount,
      DOME_POS.x, (CEILING_Y + DOME_POS.y - 0.01) / 2, DOME_POS.z);
    eye.position.copy(DOME_POS);
    group.add(eye);
    dynamic.push(eye);
    led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), M.led);
    led.position.set(0, 0, 0.046);
    eye.add(led);
  }
  const restTarget = new THREE.Vector3(DESK.x, 0.75, DESK.z);
  const qRest = new THREE.Quaternion(), qAlert = new THREE.Quaternion();
  {
    const probe = new THREE.Object3D();
    probe.position.copy(DOME_POS);
    probe.lookAt(restTarget);
    qRest.copy(probe.quaternion);
    eye.quaternion.copy(qRest);
  }

  // ============================================================================================
  // Lighting (art doc section 4; RectAreaLights capped at 3 by the contract, so three 1.2 x 3.0 strips cover
  // the six-panel footprint over the play area with the same total flux as six 1.2 x 0.6 panels at 10 nits)

  {
    const hemi = new THREE.HemisphereLight(0xDCE8E0, 0x417F50, 0.55);
    group.add(hemi);

    const sun = new THREE.DirectionalLight(0xF0F5EE, 1.4);
    sun.position.set(1.5, 6, -3.0);
    sun.target.position.set(BIN.x, 0, BIN.z);
    group.add(sun); group.add(sun.target);
    sun.castShadow = true;
    const mapSize = isTouch ? 1024 : 2048;
    sun.shadow.mapSize.set(mapSize, mapSize);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    fitShadowFrustum(sun, sun.target.position,
      new THREE.Box3(new THREE.Vector3(-3.9, -0.05, -5.25), new THREE.Vector3(2.4, 3.0, 0.8)));

    if (!lowQuality) {
      ensureRectAreaLib();
      for (const x of [-2.4, 0, 2.4]) {
        const rl = new THREE.RectAreaLight(0xE6F2EA, 4.5, 1.2, 3.0);
        rl.position.set(x, CEILING_Y - 0.02, -2.4);
        rl.rotation.x = -Math.PI / 2;      // emit straight down; height runs along z
        group.add(rl);
      }
    } else {
      for (const x of [-2.4, 0, 2.4]) {
        const pl = new THREE.PointLight(0xE6F2EA, 36, 0, 2);
        pl.position.set(x, CEILING_Y - 0.6, -2.4);
        group.add(pl);
      }
    }
    const hall = new THREE.PointLight(0xE8F1FF, 16, 0, 2);
    hall.position.set((HALL.minX + HALL.maxX) / 2, CEILING_Y - 0.15, -9.0);
    group.add(hall);
  }

  // --- renderer and scene look
  if (THREE.NeutralToneMapping !== undefined) {
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
  } else {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
  }
  scene.background = new THREE.Color(0xEAEFE9);
  scene.fog = new THREE.Fog(0xEAEFE9, 10, 22);
  let pmremTarget = null;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new RoomEnvironment();
    pmremTarget = pmrem.fromScene(env, 0.04);
    scene.environment = pmremTarget.texture;
    scene.environmentIntensity = 0.35;
    if (typeof env.dispose === 'function') env.dispose();
    pmrem.dispose();
  } catch (err) {
    console.warn('[severance] environment map skipped', err);
    scene.environment = null;
  }

  // ============================================================================================
  // Bake static meshes by material, then freeze everything static

  bakeMeshes(group, statics);
  statics.length = 0;
  freezeStatic(group);
  for (const d of dynamic) d.matrixAutoUpdate = true;
  for (const p of panels) p.matrixAutoUpdate = true;

  // ============================================================================================
  // Runtime state

  const anim = {
    redrawAcc: 0,
    levelScore: 0,
    complete: false,
    ledPhase: 0,
    nudge: { mesh: null, t: 0 },
    flicker: 0,
    stackTarget: 1, stackScale: 1, lastThrows: 0,
    dome: { t: 0, active: false },
    lastMissStreak: 0,
  };
  const qTmp = new THREE.Quaternion();
  const probe = new THREE.Object3D();

  function triggerDome() {
    probe.position.copy(DOME_POS);
    probe.lookAt(camera.position);
    qAlert.copy(probe.quaternion);
    anim.dome.active = true;
    anim.dome.t = 0;
  }

  function nudgeNearestPanel(point) {
    if (!point || !panels.length) return;
    let best = null, bestD = Infinity;
    for (const p of panels) {
      const dx = p.position.x - point.x, dz = p.position.z - point.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = p; }
    }
    if (anim.nudge.mesh && anim.nudge.mesh !== best) anim.nudge.mesh.position.y = anim.nudge.mesh.userData.baseY;
    anim.nudge.mesh = best;
    anim.nudge.t = 0.12;
    best.position.y = best.userData.baseY - 0.01;
  }

  function update(dt, elapsed, game) {
    if (!(dt > 0)) dt = 0;
    if (game) {
      anim.levelScore = game.levelScore || 0;
      if (game.throws !== anim.lastThrows) {
        anim.lastThrows = game.throws;
        const used = game.throws % 10;
        anim.stackTarget = used === 0 ? 1 : Math.max(0.2, 1 - used * 0.08);
      }
      const ms = game.missStreak || 0;
      if (ms >= 3 && ms !== anim.lastMissStreak) triggerDome();
      anim.lastMissStreak = ms;
    }

    // screens at 12 fps (east and south only)
    anim.redrawAcc += dt;
    if (anim.redrawAcc >= REDRAW_INTERVAL) {
      const step = Math.min(anim.redrawAcc, 0.5);
      anim.redrawAcc = 0;
      for (const s of screens) {
        s.state.percent = anim.levelScore;
        if (anim.complete && !s.state.complete) { s.state.complete = true; s.state.completeAt = s.state.time; }
        advanceScreen(s.state, step);
        redrawCanvasTexture(s.tex, (c, w, h) => drawScreen(c, w, h, s.state));
      }
    }

    // LED breathing: 0.3 .. 1.0 on a 2 s sine
    anim.ledPhase += dt;
    M.led.emissiveIntensity = 0.65 + 0.35 * Math.sin(anim.ledPhase * Math.PI);

    // dome: turn to the camera over 0.3 s, hold 1 s, turn back over 0.4 s
    if (anim.dome.active) {
      anim.dome.t += dt;
      const t = anim.dome.t;
      let k;
      if (t < 0.3) k = t / 0.3;
      else if (t < 1.3) k = 1;
      else if (t < 1.7) k = 1 - (t - 1.3) / 0.4;
      else { k = 0; anim.dome.active = false; }
      qTmp.copy(qRest).slerp(qAlert, k * k * (3 - 2 * k));
      eye.quaternion.copy(qTmp);
    }

    // ceiling panel rattle
    if (anim.nudge.mesh) {
      anim.nudge.t -= dt;
      if (anim.nudge.t <= 0) { anim.nudge.mesh.position.y = anim.nudge.mesh.userData.baseY; anim.nudge.mesh = null; }
    }

    // portrait flicker lasts one rendered frame
    if (anim.flicker > 0) { anim.flicker--; M.portrait.emissiveIntensity = 0.15; }
    else if (M.portrait.emissiveIntensity !== 0) M.portrait.emissiveIntensity = 0;

    // paper stack shrinks a sheet per throw and refills every ten
    if (Math.abs(anim.stackScale - anim.stackTarget) > 1e-3) {
      const rate = anim.stackTarget > anim.stackScale ? 2.5 : 8;
      anim.stackScale += (anim.stackTarget - anim.stackScale) * Math.min(1, dt * rate);
      paperStack.scale.y = anim.stackScale;
    }
  }

  function onEvent(name, payload) {
    switch (name) {
      case 'boxHit':
        if (payload && payload.tag === 'ceiling') nudgeNearestPanel(payload.point);
        break;
      case 'scored':
        if (payload && (payload.bank || payload.kind === 'bank')) anim.flicker = 1;
        if (payload && typeof payload.levelScore === 'number') anim.levelScore = payload.levelScore;
        break;
      case 'missStreak': {
        const n = payload && typeof payload.count === 'number' ? payload.count : 0;
        if (n >= 3 && n !== anim.lastMissStreak) triggerDome();
        anim.lastMissStreak = n;
        break;
      }
      case 'levelComplete':
        anim.complete = true;
        anim.levelScore = 100;
        break;
      default:
        break;
    }
  }

  function dispose() {
    disposeTree(group);
    if (pmremTarget) { pmremTarget.dispose(); pmremTarget = null; }
    scene.environment = null;
    scene.environmentIntensity = 1;
    scene.background = null;
    scene.fog = null;
  }

  // ============================================================================================
  // Copy (Lumon corporate voice: calm, formal, faintly menacing)

  const copy = {
    intro: 'Welcome, refiner. Please enjoy each paper ball equally. The work is mysterious and important. The bin is neither.',
    aimHint: 'Drag back to aim. Release to refine.',
    hints: [
      'A visible arc is provided for your comfort.',
      'Gravity is a gift from the Founder. Use it wisely.',
      'The ceiling is 2.9 meters. Please act accordingly.',
      'The bin sits at half pull. Half is a Lumon value.',
    ],
    score: [
      'Refinement acknowledged. +10.',
      'Your outie would be proud, if permitted to know.',
      'A serene throw. Serenity is a Lumon core value.',
      'The numbers were scary. They are gone now.',
    ],
    bank: [
      'Kier smiles upon this throw.',
      'Indirect refinement is still refinement.',
      'The wall assisted. The wall will not be credited.',
    ],
    rattle: [
      'It rattled. It counted. Composure, please.',
      'A tense moment for the department.',
      'The rim considered it. The rim relented.',
    ],
    rimOut: [
      'The rim has declined your submission.',
      'So close to refinement. So far from the bin.',
      'The lip of the bin is not the bin. Please note the distinction.',
    ],
    miss: [
      'This throw has been logged.',
      'Discrepancy noted. Please remain composed.',
      'The paper has not been refined. Try again with grace.',
      'A handshake is available upon request. A retry is available now.',
    ],
    missByTag: {
      desk: 'The desk is for refining, not receiving.',
      partition: 'The partition took it personally.',
      monitor: 'Please do not refine the terminals.',
      chair: 'That chair belongs to a colleague. They have been informed.',
      wall: 'The wall remains unrefined.',
      door: 'The door will be noted in your file.',
      ceiling: 'Ceiling contact has been logged.',
    },
    streak: {
      3: 'You are eligible for a finger trap.',
      5: 'A waffle party is under consideration.',
      8: 'Ms. Cobel has been notified. This is neither good nor bad.',
    },
    milestone: {
      50: 'Cold Harbor is 50% complete. Do not discuss this with your outie.',
      90: 'One more. Remain calm. Calmness is mandatory.',
    },
    complete: {
      eyebrow: 'Macrodata Refinement',
      title: 'Quota met.',
      body: 'FILE COMPLETE. Lumon thanks you for your service. Please proceed to the Perpetuity Wing.',
      sub: 'Your reward: a beach. You will not remember requesting it.',
      button: 'Take the vacation',
    },
    idle: 'The numbers will wait. They always do.',
  };

  return {
    id: 'severance',
    theme: 'lumon',
    audioVariant: 'steel',
    group,
    camera: {
      position: new THREE.Vector3(1.10, 1.60, -0.20),
      lookAt: new THREE.Vector3(0.75, 1.10, -4.40),
      fov: 66,
      fovPortrait: 80,
    },
    bin: {
      x: BIN.x, z: BIN.z, height: BIN.height, rOutTop: BIN.rOutTop, rOutBot: BIN.rOutBot,
      wall: BIN.wall, floorThick: BIN.floorThick, rimTube: BIN.rimTube,
      materials: BIN_MATERIALS,
      group: binGroup,
      rimMesh,
    },
    physics: {
      floor: { restitution: 0.30, friction: 0.45, rollDamping: 4.0 },
      boxes,
      cylinders,
      bounds: BOUNDS,
    },
    previewFraction: 0.72,
    arcColors: { near: 0xffffff, far: 0x8fb5a3 },
    trailColor: 0xf4f7f2,
    hud: { eyebrow: 'Lumon Industries', name: 'Macrodata Refinement', lvl: 'Level 1 of 2' },
    copy,
    update,
    onEvent,
    dispose,
  };
}
