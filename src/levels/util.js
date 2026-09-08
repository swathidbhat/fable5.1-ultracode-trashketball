// Shared helpers for level modules.
import * as THREE from 'three';
import { radialAlphaTexture } from '../textures.js';

const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap', 'alphaMap',
  'envMap', 'lightMap', 'displacementMap', 'sheenColorMap', 'sheenRoughnessMap', 'clearcoatMap',
  'clearcoatNormalMap', 'clearcoatRoughnessMap', 'specularColorMap', 'specularIntensityMap'];

// Dispose every geometry, material and texture under `root`, then detach it.
export function disposeTree(root) {
  const seenMat = new Set(), seenTex = new Set(), seenGeo = new Set();
  root.traverse((obj) => {
    if (obj.geometry && !seenGeo.has(obj.geometry)) { seenGeo.add(obj.geometry); obj.geometry.dispose(); }
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) {
      if (seenMat.has(m)) continue;
      seenMat.add(m);
      for (const k of MAP_KEYS) {
        const t = m[k];
        if (t && t.isTexture && !seenTex.has(t)) { seenTex.add(t); t.dispose(); }
      }
      if (m.uniforms) {
        for (const u of Object.values(m.uniforms)) {
          const t = u && u.value;
          if (t && t.isTexture && !seenTex.has(t)) { seenTex.add(t); t.dispose(); }
        }
      }
      m.dispose();
    }
    if (obj.isLight && obj.shadow && obj.shadow.map) obj.shadow.map.dispose();
  });
  root.removeFromParent();
}

// World-space AABB collider from an Object3D (call after positioning it under a scene-attached parent).
export function boxColliderFromObject(obj, props = {}) {
  obj.updateWorldMatrix(true, true);
  const b = new THREE.Box3().setFromObject(obj);
  return boxCollider(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, props);
}

// Explicit AABB collider. Thin boxes are padded to >= 0.05 m on every axis (physics contract).
export function boxCollider(minX, minY, minZ, maxX, maxY, maxZ, props = {}) {
  const pad = (lo, hi) => {
    const t = hi - lo;
    if (t >= 0.05) return [lo, hi];
    const c = (lo + hi) / 2;
    return [c - 0.025, c + 0.025];
  };
  const [x0, x1] = pad(minX, maxX), [y0, y1] = pad(minY, maxY), [z0, z1] = pad(minZ, maxZ);
  return {
    min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 },
    restitution: props.restitution ?? 0.35, friction: props.friction ?? 0.3, rollDamping: props.rollDamping ?? 2.5,
    tag: props.tag ?? 'box',
  };
}

// Vertical cylinder collider (plant pots, pedestals).
export function cylinderCollider(x, z, radius, yMin, yMax, props = {}) {
  return {
    x, z, radius, yMin, yMax,
    restitution: props.restitution ?? 0.4, friction: props.friction ?? 0.3, rollDamping: props.rollDamping ?? 2.5,
    tag: props.tag ?? 'cylinder',
  };
}

let _shadowTex = null;
// Soft fake contact shadow disc laid on the floor under an object.
export function makeContactShadow(radius, opacity = 0.3) {
  if (!_shadowTex) _shadowTex = radialAlphaTexture(128, 0.0, 1.0);
  const geo = new THREE.CircleGeometry(radius, 32);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity, alphaMap: _shadowTex, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  m.renderOrder = 1;
  return m;
}

// Mark a subtree static (no per-frame matrix updates).
export function freezeStatic(root) {
  root.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
}
