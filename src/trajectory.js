// Predicted-arc dots and the in-flight ribbon trail (contract section 5, tech plan section 4).
// Every buffer is allocated once in the constructors; update/push write into preallocated arrays.
import * as THREE from 'three';

const DOT_VERT = /* glsl */`
attribute float aFade;
varying vec3 vColor;
varying float vFade;
void main() {
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #else
    vColor = vec3(1.0);
  #endif
  vFade = aFade;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const DOT_FRAG = /* glsl */`
uniform float uOpacity;
varying vec3 vColor;
varying float vFade;
void main() {
  gl_FragColor = vec4(vColor, uOpacity * vFade);
  #include <colorspace_fragment>
}`;

const TRAIL_VERT = /* glsl */`
attribute float aAlpha;
varying float vAlpha;
void main() {
  vAlpha = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const TRAIL_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor, vAlpha * uOpacity);
  #include <colorspace_fragment>
}`;

const FADE_START = 0.85;   // the last 15% of the shown arc fades

/**
 * Dotted arc preview: one InstancedMesh of small spheres, arc-length resampled along the predicted path.
 * Depth tested (occluded by the bin rim), not tone mapped, per-dot color lerp near -> far, per-dot alpha fade at the end.
 */
export class ArcPreview {
  constructor(scene, { maxDots = 48, spacing = 0.10, dotRadius = 0.016 } = {}) {
    this.scene = scene;
    this.maxDots = maxDots;
    this.spacing = spacing;
    this.marchSpeed = 0.6;          // m/s; dots creep forward along the arc so direction reads. setMarch(0) for reduced motion.
    this.startOffset = 0.07;        // first dot sits just outside the hand ball

    const geo = this.geo = new THREE.SphereGeometry(dotRadius, 8, 6);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(maxDots), 1);
    this.fade.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFade', this.fade);

    const mat = this.mat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0.9 } },
      vertexShader: DOT_VERT,
      fragmentShader: DOT_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    });

    const m = this.mesh = new THREE.InstancedMesh(geo, mat, maxDots);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.renderOrder = 10;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < maxDots; i++) m.setColorAt(i, white);   // allocates instanceColor once
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.visible = false;
    scene.add(m);

    // Contact marker: a thin torus lying flat at the predicted contact point. Rim/box contacts add a diagonal
    // cross so the kind is readable by shape, not only by color (UX spec 5.4).
    this.markerGeoSmall = new THREE.TorusGeometry(0.06, 0.005, 6, 40);
    this.markerGeoFloor = new THREE.TorusGeometry(0.10, 0.006, 6, 48);
    this.markerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.85, depthTest: true, depthWrite: false,
    });
    this.marker = new THREE.Group();
    this.marker.rotation.x = -Math.PI / 2;            // local XY plane lies on the floor
    this.marker.visible = false;
    this.markerRing = new THREE.Mesh(this.markerGeoSmall, this.markerMat);
    this.markerRing.renderOrder = 10;
    this.markerRing.frustumCulled = false;
    this.marker.add(this.markerRing);
    this.markerCrossGeo = new THREE.BoxGeometry(0.075, 0.006, 0.004);
    this.markerCross = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const bar = new THREE.Mesh(this.markerCrossGeo, this.markerMat);
      bar.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 4;
      bar.renderOrder = 10;
      bar.frustumCulled = false;
      this.markerCross.add(bar);
    }
    this.marker.add(this.markerCross);
    scene.add(this.marker);
    this._markerTtl = 0;          // updates the marker survives without a fresh showMarker call
    this._lastFraction = 0;

    this.near = new THREE.Color(0xffffff);
    this.far = new THREE.Color(0x8e949c);
    this.warn = new THREE.Color(0xf2b65a);
    this._nearDim = new THREE.Color();
    this._nearEff = new THREE.Color();
    this._c = new THREE.Color();
    this._mat4 = new THREE.Matrix4();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._updateDim();
  }

  _updateDim() {
    // At zero pull the whole arc reads muted; at full pull it reaches the level's near color.
    this._nearDim.copy(this.near).lerp(this.far, 0.55);
  }

  setColors(nearHex, farHex, markerHex) {
    this.near.set(nearHex);
    this.far.set(farHex);
    if (markerHex !== undefined) this.warn.set(markerHex);
    this._updateDim();
  }

  // 0 disables the marching motion (reduced motion).
  setMarch(speed) { this.marchSpeed = Math.max(0, speed || 0); }

  /**
   * points: Float32Array xyz (from world.predict), count: number of valid points.
   * Draws dots along the first `fraction` of the arc length, fading over its last 15%.
   */
  update(points, count, { fraction = 0.72, power = 0.5 } = {}) {
    const m = this.mesh;
    const n = points && points.length ? Math.min(count | 0, (points.length / 3) | 0) : 0;
    this._lastFraction = fraction;
    if (n < 2) { this._setCount(0); this._syncMarker(); return; }

    // Total arc length.
    let total = 0;
    for (let i = 1; i < n; i++) {
      const o = i * 3, q = o - 3;
      const dx = points[o] - points[q], dy = points[o + 1] - points[q + 1], dz = points[o + 2] - points[q + 2];
      total += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    const full = fraction >= 1;
    const shown = full ? total : total * Math.max(0, fraction);
    if (shown <= this.startOffset + 1e-4) { this._setCount(0); this._syncMarker(); return; }

    const maxDots = this.maxDots;
    const sp = Math.max(this.spacing, (shown - this.startOffset) / (maxDots - 1));
    let phase = 0;
    if (this.marchSpeed > 0) {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
      phase = (now * this.marchSpeed) % sp;
    }

    const endAlpha = full ? 0.45 : 0;
    const pw = power < 0 ? 0 : power > 1 ? 1 : power;
    this._nearEff.copy(this._nearDim).lerp(this.near, pw);
    const baseScale = 0.85 + 0.15 * pw;

    const M = this._mat4, A = this._a, B = this._b, P = this._p, C = this._c, fadeArr = this.fade.array;
    let placed = 0, acc = 0, nextS = this.startOffset + phase;
    for (let i = 1; i < n && placed < maxDots && nextS <= shown; i++) {
      A.fromArray(points, (i - 1) * 3);
      B.fromArray(points, i * 3);
      const segLen = A.distanceTo(B);
      while (nextS <= acc + segLen && placed < maxDots && nextS <= shown) {
        const t = segLen > 1e-9 ? (nextS - acc) / segLen : 0;
        P.lerpVectors(A, B, t);
        const f = nextS / shown;                                   // 0 hand -> 1 end of the shown arc
        const s = baseScale * (1 - 0.35 * f);
        M.set(s, 0, 0, P.x, 0, s, 0, P.y, 0, 0, s, P.z, 0, 0, 0, 1);
        m.setMatrixAt(placed, M);
        C.copy(this._nearEff).lerp(this.far, f);
        m.setColorAt(placed, C);
        fadeArr[placed] = f < FADE_START ? 1 : 1 + (endAlpha - 1) * ((f - FADE_START) / (1 - FADE_START));
        placed++;
        nextS += sp;
      }
      acc += segLen;
    }
    this._setCount(placed);
    if (placed > 0) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
      this.fade.needsUpdate = true;
    }
    this._syncMarker();
  }

  _setCount(c) {
    this.mesh.count = c;
    this.mesh.visible = c > 0;
  }

  // Marker visibility: shown only while the last update drew the full arc, and only while showMarker keeps being
  // called (it survives two updates without a call, so update/showMarker may run in either order within a frame).
  _syncMarker() {
    if (this._markerTtl > 0) this._markerTtl--;
    if (this._lastFraction < 1 || this._markerTtl <= 0) this.marker.visible = false;
  }

  /**
   * Call every frame while the prediction ends on a contact; pass null to hide.
   * point: {x,y,z} (a world.predict contact object with a .point is accepted too).
   * kind: 'floor' | 'rim' | 'box' (physics contact types 'binWall', 'binFloor', 'cylinder' map onto those styles;
   * 'in' | 'score' draws the ring in the near color for an arc that ends inside the bin).
   * Only shown when the last update used fraction >= 1.
   */
  showMarker(point, kind = 'floor') {
    if (!point) { this.marker.visible = false; this._markerTtl = 0; return; }
    if (point.point && typeof point.point.x === 'number') { kind = point.type || kind; point = point.point; }
    const mk = this.marker;
    const floor = kind === 'floor';
    const inBin = kind === 'in' || kind === 'score' || kind === 'binFloor';
    const geo = floor ? this.markerGeoFloor : this.markerGeoSmall;
    if (this.markerRing.geometry !== geo) this.markerRing.geometry = geo;
    this.markerCross.visible = !floor && !inBin;
    mk.position.set(point.x, point.y + (floor ? 0.004 : 0.002), point.z);
    if (floor) this.markerMat.color.copy(this.far);
    else if (inBin) this.markerMat.color.copy(this.near);
    else this.markerMat.color.copy(this.warn);
    this.markerMat.opacity = floor ? 0.7 : 0.9;
    this._markerTtl = 2;
    mk.visible = this._lastFraction >= 1;
  }

  hide() {
    this._setCount(0);
    this.marker.visible = false;
    this._markerTtl = 0;
  }

  dispose() {
    this.hide();
    this.scene.remove(this.mesh);
    this.scene.remove(this.marker);
    this.mesh.dispose();
    this.geo.dispose();
    this.mat.dispose();
    this.markerGeoSmall.dispose();
    this.markerGeoFloor.dispose();
    this.markerCrossGeo.dispose();
    this.markerMat.dispose();
  }
}

/**
 * Camera-facing tapered ribbon behind the flying ball. Ring buffer of the last `length` positions,
 * one push per rendered frame; per-vertex alpha, fadeOut(ms) driven by update(dt in seconds).
 */
export class FlightTrail {
  constructor(scene, camera, { length = 28, width = 0.03, color = 0xfff4d6 } = {}) {
    this.scene = scene;
    this.camera = camera;
    this.N = Math.max(3, length | 0);
    this.width = width;
    this.ring = new Float32Array(this.N * 3);
    this.head = 0;
    this.len = 0;
    this.fading = false;
    this.fadeT = 0;
    this.fadeDur = 0.3;
    this.gapReset = 1.5;            // a jump larger than this (m) between pushes restarts the ribbon (new ball)

    const N = this.N;
    const geo = this.geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.alpha = new THREE.BufferAttribute(new Float32Array(N * 2), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('aAlpha', this.alpha);
    const idx = new Uint16Array((N - 1) * 6);
    for (let i = 0, k = 0; i < N - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx[k++] = a; idx[k++] = b; idx[k++] = c;
      idx[k++] = b; idx[k++] = d; idx[k++] = c;
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);

    const mat = this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 } },
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.visible = false;
    scene.add(this.mesh);

    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._cam = new THREE.Vector3();
    this._side = new THREE.Vector3(1, 0, 0);
    this._c = new THREE.Vector3();
  }

  setColor(hex) { this.mat.uniforms.uColor.value.set(hex); }

  reset() {
    this.len = 0;
    this.head = 0;
    this.fading = false;
    this.fadeT = 0;
    this.mat.uniforms.uOpacity.value = 1;
    this.geo.setDrawRange(0, 0);
    this.mesh.visible = false;
  }

  /** Call once per rendered frame while a ball is in flight. Accepts any {x,y,z}. */
  push(p) {
    if (this.fading) this.reset();            // a new flight interrupts the old ribbon's fade
    if (this.len > 0) {
      const j = ((this.head - 1 + this.N) % this.N) * 3;
      const dx = p.x - this.ring[j], dy = p.y - this.ring[j + 1], dz = p.z - this.ring[j + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > this.gapReset * this.gapReset) this.reset();   // trail hopped to another ball
      else if (d2 < 1e-10) return;                            // ball did not move (paused): keep the ribbon as is
    }
    const i = this.head * 3;
    this.ring[i] = p.x; this.ring[i + 1] = p.y; this.ring[i + 2] = p.z;
    this.head = (this.head + 1) % this.N;
    this.len = Math.min(this.len + 1, this.N);
    this._rebuild();
  }

  _rebuild() {
    const n = this.len, N = this.N;
    if (n < 2) { this.geo.setDrawRange(0, 0); this.mesh.visible = false; return; }
    const start = (this.head - n + N) % N;
    const P = this.pos.array, A = this.alpha.array;
    const a = this._a, b = this._b, t = this._t, v = this._v, side = this._side, c = this._c;
    this._cam.setFromMatrixPosition(this.camera.matrixWorld);
    for (let k = 0; k < n; k++) {
      a.fromArray(this.ring, ((start + k) % N) * 3);
      const kn = k < n - 1 ? k + 1 : k - 1;                 // tangent toward the next sample (previous for the newest)
      b.fromArray(this.ring, ((start + kn) % N) * 3);
      t.subVectors(b, a);
      v.subVectors(this._cam, a);
      c.crossVectors(t, v);
      if (c.lengthSq() > 1e-12) side.copy(c).normalize();   // else keep the previous side (tangent along the view ray)
      const f = k / (n - 1);                                // 0 oldest -> 1 newest (at the ball)
      const hw = this.width * 0.5 * f;
      const o = k * 6;
      P[o] = a.x - side.x * hw; P[o + 1] = a.y - side.y * hw; P[o + 2] = a.z - side.z * hw;
      P[o + 3] = a.x + side.x * hw; P[o + 4] = a.y + side.y * hw; P[o + 5] = a.z + side.z * hw;
      A[k * 2] = A[k * 2 + 1] = f * f * 0.85;
    }
    this.pos.needsUpdate = true;
    this.alpha.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
    this.mesh.visible = true;
  }

  /** dt in seconds. Advances the fade-out; resets the ribbon when the fade completes. */
  update(dt) {
    if (!this.fading) return;
    this.fadeT += Math.max(0, dt || 0);
    const k = this.fadeDur > 0 ? this.fadeT / this.fadeDur : 1;
    if (k >= 1) { this.reset(); return; }
    this.mat.uniforms.uOpacity.value = 1 - k;
  }

  fadeOut(ms = 300) {
    if (this.len < 2) { this.reset(); return; }
    if (this.fading) return;
    this.fading = true;
    this.fadeT = 0;
    this.fadeDur = Math.max(0, ms) / 1000;
    if (this.fadeDur === 0) this.reset();
  }

  dispose() {
    this.reset();
    this.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}
