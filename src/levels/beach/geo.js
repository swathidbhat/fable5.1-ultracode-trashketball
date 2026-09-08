// Geometry helpers for the beach house: rounded boxes, transformed clones for merging, UV tools
// and a bucket collector that turns same-material parts into one mesh each (draw-call budget).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const DEG = Math.PI / 180;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// RBox(w, h, d, r) from the art doc: RoundedBoxGeometry with 4 segments per rounded edge.
export function rbox(w, h, d, r, segments = 4) {
  return new RoundedBoxGeometry(w, h, d, segments, r);
}

// Transformed copy of `geo` (Euler XYZ rotation, per-axis scale), ready to merge. The source is untouched.
export function placed(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'XYZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  return geo.clone().applyMatrix4(_m);
}

// Transformed copy with an explicit quaternion (leaves, branches).
export function placedQ(geo, pos, quat, scale = 1) {
  _s.set(scale, scale, scale);
  _m.compose(pos, quat, _s);
  return geo.clone().applyMatrix4(_m);
}

// Merge into one geometry and dispose the inputs. RoundedBoxGeometry is non-indexed while the other
// primitives are indexed, and mergeGeometries refuses to mix the two, so a mixed list is de-indexed first.
export function mergeAll(geos, label = 'geometry') {
  if (geos.length === 1) return geos[0];
  const anyNonIndexed = geos.some((g) => g.index === null);
  const list = anyNonIndexed ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos;
  const out = mergeGeometries(list, false);
  if (!out) throw new Error('beach: could not merge ' + label);
  for (const g of geos) g.dispose();
  if (list !== geos) for (const g of list) g.dispose();
  return out;
}

// Constant vertex color (linear) so several tinted parts can share one vertexColors material.
export function tint(geo, hex, mul = 1) {
  const c = new THREE.Color(hex).multiplyScalar(mul);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Re-UV a box so the texture's v axis (the timber grain) runs along local `axis`.
// tileU / tileV are meters per texture repeat. Works per vertex from position + normal, so it also
// survives a later merge. End caps (faces whose normal is the grain axis) get a plain mapping.
export function grainUV(geo, axis, tileU = 0.5, tileV = 2.0) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
  const others = axis === 'x' ? ['y', 'z'] : axis === 'y' ? ['x', 'z'] : ['x', 'y'];
  const p = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
    const nAxis = ax >= ay && ax >= az ? 'x' : ay >= az ? 'y' : 'z';
    p.x = pos.getX(i); p.y = pos.getY(i); p.z = pos.getZ(i);
    let vAxis = axis, uAxis;
    if (nAxis === axis) { vAxis = others[0]; uAxis = others[1]; }
    else uAxis = others[0] === nAxis ? others[1] : others[0];
    uv.setXY(i, p[uAxis] / tileU, p[vAxis] / tileV);
  }
  uv.needsUpdate = true;
  return geo;
}

export function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

export function shadowMesh(geo, mat, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// Collects same-material geometry from several builders; flush() makes one mesh per bucket.
export class Buckets {
  constructor() { this.map = new Map(); }
  add(key, geo) {
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).push(geo);
  }
  flush(parent, materials, options = {}) {
    const meshes = {};
    for (const [key, geos] of this.map) {
      if (!geos.length) continue;
      const mat = materials[key];
      if (!mat) throw new Error('beach: no material for bucket ' + key);
      const o = options[key] || {};
      const m = shadowMesh(mergeAll(geos, key), mat, o.cast !== false, o.receive !== false);
      if (o.renderOrder !== undefined) m.renderOrder = o.renderOrder;
      m.name = 'bucket:' + key;
      parent.add(m);
      meshes[key] = m;
    }
    this.map.clear();
    return meshes;
  }
}
