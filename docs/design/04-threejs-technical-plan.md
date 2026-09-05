# Trashketball — Three.js Technical Plan (no-bundler, ES modules via importmap)

All version numbers, URLs and API behaviors below were checked on 2026-09-02 against the jsdelivr CDN, the three.js Migration Guide (GitHub wiki), the r170 docs in the three.js repo, and the actual `three@0.170.0` source. A "Verified facts" appendix at the end lists exactly what was checked.

---

## 0. Version decision

**Pin `three@0.170.0` (REVISION `'170'`).**

- `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js` -> HTTP 200, `content-type: application/javascript; charset=utf-8`, 1,314,681 bytes, `access-control-allow-origin: *`, `cache-control: public, max-age=31536000, immutable`. File starts with `const REVISION = '170';`.
- `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js` -> 200, 691,648 bytes (use for production if you want; same API).
- `https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/` is the directory that the package's own `"./addons/*": "./examples/jsm/*"` export maps to (verified in `package.json` at that version).
- Addon files verified 200 at that version: `lines/Line2.js`, `lines/LineMaterial.js`, `lines/LineGeometry.js`, `lines/LineSegments2.js`, `lines/LineSegmentsGeometry.js`, `lights/RectAreaLightUniformsLib.js`, `helpers/RectAreaLightHelper.js`, `objects/Sky.js`, `objects/Water.js`, `objects/GroundedSkybox.js`, `environments/RoomEnvironment.js`, `math/ImprovedNoise.js`, `math/SimplexNoise.js`, `geometries/RoundedBoxGeometry.js`, `utils/BufferGeometryUtils.js`, `controls/OrbitControls.js` (debug only), `postprocessing/EffectComposer.js`, `Addons.js`.

Why r170 and not the newest: the newest npm tag on jsdelivr today is `0.185.1` (r185). Everything this game needs exists and is stable in r170, the r170 docs are what I verified against, and r171–r185 only add migration work for us (r171+ splits the build into `three.core.js` + `three.module.js`, r182 deprecates `PCFSoftShadowMap` for WebGL, r183 deprecates `Clock` in favor of `Timer`, r181 changes PBR brightness, r183 changes `Sky` gamma, r184 changes background/env rotation). If you later bump to `0.185.1`, the same two importmap URLs work unchanged (its `three.module.js` imports `./three.core.js` relatively, which jsdelivr serves), but re-tune lighting and swap `PCFSoftShadowMap` -> `PCFShadowMap`.

---

## 1. `index.html` skeleton

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <!-- viewport-fit=cover for notch safe areas; user-scalable=no is ignored by iOS Safari,
       so pinch/double-tap zoom is actually blocked by touch-action:none + the gesturestart handler -->
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#000000">
  <title>Trashketball</title>

  <style>
    html, body {
      margin: 0; padding: 0; height: 100%;
      overflow: hidden;                 /* no page scroll, ever */
      overscroll-behavior: none;        /* no pull-to-refresh / rubber band */
      background: #000;
      font-family: system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
    }
    #game {
      position: fixed; inset: 0;
      width: 100%; height: 100%;        /* CSS sizes the canvas; renderer.setSize(w,h,false) sets the buffer */
      display: block;
      touch-action: none;               /* the important one: no scroll/pinch/double-tap on drag */
      user-select: none; -webkit-user-select: none;
      -webkit-touch-callout: none;      /* no long-press callout on iOS */
      -webkit-tap-highlight-color: transparent;
      cursor: crosshair;
    }
    #hud {
      position: fixed; inset: 0;
      pointer-events: none;             /* HUD never steals the drag */
      padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
               max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
      color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.6);
      user-select: none; -webkit-user-select: none;
    }
    #hud button { pointer-events: auto; touch-action: manipulation; }  /* only real controls get events */
    #hud .score { position: absolute; top: 12px; left: 16px; font: 600 28px/1 system-ui; }
    #hud .hint  { position: absolute; bottom: 24px; left: 0; right: 0; text-align: center; opacity: .8; }
    #hud .banner { position: absolute; inset: 0; display: grid; place-items: center; font-size: 40px; }
    #hud [hidden] { display: none !important; }
  </style>

  <!-- Must come BEFORE any <script type="module">. Addons import the bare specifier "three",
       so the "three" mapping is required even if main.js only used addons. -->
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
    }
  }
  </script>
</head>
<body>
  <canvas id="game"></canvas>

  <div id="hud">
    <div class="score"><span id="score">0</span> <small id="level">LVL 1</small></div>
    <div class="hint" id="hint">Drag down to pull back, release to throw</div>
    <div class="banner" id="banner" hidden></div>
  </div>

  <script type="module" src="./src/main.js"></script>
</body>
</html>
```

Serving note (ES modules cannot load from `file://`, the browser blocks them with a CORS error): run from the project root with `python3 -m http.server 8000` and open `http://localhost:8000/`, or `npx serve .`. The CDN files are fetched cross-origin; jsdelivr sends `access-control-allow-origin: *`, so module loading works. For offline dev you can mirror `build/three.module.js` and the handful of `examples/jsm/**` files you import into `vendor/three/` and point the two importmap entries there; nothing else changes.

---

## 2. Renderer setup

```js
// src/main.js (excerpt)
import * as THREE from 'three';

const canvas = document.getElementById('game');
const isTouch = matchMedia('(pointer: coarse)').matches;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,                  // MSAA on the default framebuffer, cheap enough for this scene
  alpha: false,
  stencil: false,                   // default false since r163 anyway
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;      // default since r152; stated for clarity
renderer.toneMapping = THREE.ACESFilmicToneMapping;    // per-level exposure below
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;      // default is PCFShadowMap (verified); see gotchas re: radius
// renderer.useLegacyLights does not exist in r170 (0 occurrences in the build); intensities are in the r155+ units.
```

Tone mapping: `ACESFilmicToneMapping` for both levels, with exposure 1.0 in the office and 0.85–0.9 in the beach house (bright exterior, strong sun). If the Lumon greens/whites come out desaturated or shifted, switch the office to `THREE.NeutralToneMapping` (hue-preserving, available in r170: constant value 7) and keep ACES for the beach.

Resize: don't trust `window.resize` alone on mobile (URL bar collapse, orientation). Check at the top of every frame; it is a couple of property reads:

```js
function resizeToDisplaySize(camera, lineMaterials = []) {
  const w = canvas.clientWidth, h = canvas.clientHeight;      // CSS px
  const dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);                              // false: CSS owns the element size
    camera.aspect = w / h;
    camera.fov = w >= h ? 55 : 70;                              // see section 3
    camera.updateProjectionMatrix();
    for (const m of lineMaterials) m.resolution.set(w, h);      // only if you use Line2/LineMaterial
    return true;
  }
  return false;
}
```

### Lighting units since r155 (this matters because the scene is in real meters)

From the Migration Guide (154 -> 155): `WebGLRenderer.useLegacyLights` became `false` by default and deprecated; it is gone in r170. From the r155 lighting announcement: light intensities are no longer scaled by π internally, and point/spot lights decay physically. Consequences:

| Light | r170 unit / semantics (verified in source & docs) | Starting values for this game |
|---|---|---|
| `AmbientLight`, `HemisphereLight`, `DirectionalLight` | plain multiplier, no π scaling. Old value × π ≈ same look. | hemi 0.6–1.2; ambient 0.2–0.5; sun (beach) 2.5–4.0; office key light 1.0–1.8 |
| `PointLight` | `intensity` in candela; `decay` default 2 (inverse-square, in meters); `power = 4π·intensity` (lumens) | ceiling/lamp bulbs 15–60 cd (an 800 lm bulb is `light.power = 800` ≈ 64 cd). Never set `decay` to 1 or 0 to "fix" darkness; raise cd instead. |
| `SpotLight` | candela; `power = π·intensity` | 30–150 cd for accent spots |
| `RectAreaLight` | luminance in nits (cd/m²); `power = intensity·width·height·π`; no shadows; only `MeshStandardMaterial`/`MeshPhysicalMaterial` react; requires `RectAreaLightUniformsLib.init()` | office troffer panels 0.6×1.2 m at 2.6 m: 6–12; beach window "sky" panels 3–6 |
| `LightShadow.intensity` | exists in r170 (default 1) | 0.75–0.9 to keep shadows from going pitch black |

Real-meter scale means a 10 cd point light at 2 m contributes 2.5 units of irradiance to a surface, at 4 m only 0.6. Put bulbs where bulbs would be and use cd values in the tens, not 1.0.

---

## 3. Camera and the "ball in hand" position

```js
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 250);   // near 0.05 so the hand ball (0.5 m away) never clips
camera.position.set(0, 1.6, 0);                                 // eye height; 1.55–1.65 is fine
const BIN_POS = new THREE.Vector3(0, 0, -4.0);                  // bin base on the floor, 4 m ahead (-Z is forward)
camera.lookAt(BIN_POS.x, 0.35, BIN_POS.z);                      // ~ -10° pitch: bin sits in the lower-middle, apex of a 45° throw stays on screen
camera.updateMatrixWorld();
```

FOV: vertical 55° in landscape gives a natural throwing feel (bin at 4 m is ~4% of screen height, still an easy target, apex visible). In portrait, keep vertical FOV wider (70°) so the horizontal coverage is not claustrophobic; do not lock horizontal FOV in portrait (it would need >100° vertical and distort badly). The camera is static during a throw; an optional ±1.5° yaw/pitch sway following the pointer is fine but must be applied *before* computing the hand position for that frame.

Ball in hand: define it in **NDC + distance**, not as a fixed camera-space offset, so it lands on the same screen spot for every aspect ratio and FOV:

```js
// src/paperBall.js (excerpt)
const HAND_NDC  = new THREE.Vector2(0.45, -0.55);  // lower-right of the view
const HAND_DIST = 0.55;                            // meters from the eye; ball r=0.04 -> ~7% of screen height
const _p = new THREE.Vector3();

export function computeHandPosition(camera, out) {
  // any depth on the pick ray, then re-scale the ray to HAND_DIST
  _p.set(HAND_NDC.x, HAND_NDC.y, 0.5).unproject(camera);       // needs camera.matrixWorld & projectionMatrixInverse current
  return out.copy(_p).sub(camera.position).normalize().multiplyScalar(HAND_DIST).add(camera.position);
}
```

Rules that keep preview and flight identical:
- There is exactly one launch position variable. Each frame while aiming: `computeHandPosition(camera, handPos)`; optional wind-up: `handPos.addScaledVector(pullDir, -0.06 * pull)`. The ball mesh is placed at `handPos`, the arc preview is integrated from `handPos`, and on release `physics.launch(handPos, v0, omega0)` uses the same vector.
- Launch velocity is built from the camera's flattened forward, not from a hard-coded axis, so the mapping survives camera tweaks:

```js
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
export function buildLaunchVelocity(camera, yaw, pitch, speed, out) {
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  right.crossVectors(fwd, UP);
  out.copy(fwd).multiplyScalar(Math.cos(yaw)).addScaledVector(right, Math.sin(yaw));
  out.multiplyScalar(Math.cos(pitch)).addScaledVector(UP, Math.sin(pitch)).multiplyScalar(speed);
  return out;
}
```

Sanity numbers for tuning: launch height ≈ 1.3 m, rim at 0.30 m, distance 4 m. Without drag a 45° throw needs ≈ 6.0 m/s; with a paper ball's drag (Cd ≈ 0.5, r 0.04 m, m ≈ 5 g) it is ≈ 6.4–6.8 m/s. Speed range 3–10.5 m/s covers "short" through "off the back wall".

---

## 4. Trajectory rendering

Options considered:

| Approach | Pros | Cons |
|---|---|---|
| `Line` + `LineDashedMaterial` | trivial; dashes in world units | 1 px lines (WebGL ignores `linewidth`), aliased on HiDPI; must call `line.computeLineDistances()` after every position update (method is on `Line`, not on `BufferGeometry`, and only for non-indexed geometry) |
| `Line2` + `LineMaterial({dashed:true})` | screen-space width, dashes | `LineGeometry.setPositions()` allocates a new `InstancedInterleavedBuffer` on every call (garbage every frame while aiming); needs `material.resolution` kept in sync; `line2.computeLineDistances()` per update; two extra addon files |
| `InstancedMesh` of tiny spheres | zero allocation per frame (write into the preallocated `instanceMatrix` array), real 3D dots that depth-test against the bin and get correctly occluded by the rim, per-dot color/scale fade, identical on every GPU | you write ~25 lines of arc-length resampling |

**Recommendation: InstancedMesh dots for the predicted arc, and a camera-facing tapered ribbon for the flight trail.** Both use fixed-size buffers created once.

### 4a. Shared prediction

`physics.js` exposes the same integrator it uses for the live ball, so the preview cannot drift from reality:

```js
// physics.js (excerpt) — semi-implicit Euler, dt = FIXED_DT, gravity + quadratic drag, no collisions except floor/rim-plane stop
export const FIXED_DT = 1 / 240;
const PRED_MAX = 720;                                   // 3 s at 240 Hz
const predBuf = new Float32Array(PRED_MAX * 3);         // allocated once
export function predict(p0, v0, opts = {}) {            // returns { points: Float32Array, count }
  const stopY = opts.stopY ?? 0.04;                     // floor contact (ball radius) or the rim plane height
  let x = p0.x, y = p0.y, z = p0.z, vx = v0.x, vy = v0.y, vz = v0.z, n = 0;
  for (let i = 0; i < PRED_MAX; i++) {
    predBuf[n*3] = x; predBuf[n*3+1] = y; predBuf[n*3+2] = z; n++;
    const s = Math.hypot(vx, vy, vz), k = DRAG_K * s;    // DRAG_K = 0.5*rho*Cd*A/m
    vx -= k * vx * FIXED_DT; vy -= (9.81 + k * vy) * FIXED_DT; vz -= k * vz * FIXED_DT;
    x += vx * FIXED_DT; y += vy * FIXED_DT; z += vz * FIXED_DT;
    if (y < stopY && vy < 0) break;
  }
  return { points: predBuf, count: n };
}
```

Design choice for fairness: stop the preview where the ball descends through the rim plane (`stopY = binTopY + ballR`) rather than at the floor. The player sees exactly where the ball will be at rim height; whether it goes in is then honest physics (rim bounces are not previewed).

### 4b. Dotted arc: `InstancedMesh`

```js
// src/trajectory.js
import * as THREE from 'three';

const MAX_DOTS = 48, DOT_SPACING = 0.10, DOT_R = 0.016;

export class ArcPreview {
  constructor(scene) {
    const geo = new THREE.SphereGeometry(DOT_R, 8, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, toneMapped: false,             // stays crisp white under ACES
      transparent: true, opacity: 0.9, depthWrite: false,
    });
    const m = this.mesh = new THREE.InstancedMesh(geo, mat, MAX_DOTS);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;                          // InstancedMesh is frustum-culled by default (r151+) using the *geometry* bounds -> would vanish
    m.renderOrder = 10;
    const c = new THREE.Color(1, 1, 1);
    for (let i = 0; i < MAX_DOTS; i++) m.setColorAt(i, c);   // allocates instanceColor once
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    scene.add(m);

    this._mat = new THREE.Matrix4(); this._q = new THREE.Quaternion();
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(); this._c = new THREE.Color();
    this._white = new THREE.Color(0xffffff); this._grey = new THREE.Color(0x8e949c);
  }

  /** points = Float32Array of xyz, n = number of valid points (from physics.predict) */
  update(points, n) {
    const m = this.mesh;
    let placed = 0, carry = 0;
    for (let i = 1; i < n && placed < MAX_DOTS; i++) {
      this._a.fromArray(points, (i - 1) * 3);
      this._b.fromArray(points, i * 3);
      let segLen = this._a.distanceTo(this._b);
      while (carry + segLen >= DOT_SPACING && placed < MAX_DOTS) {
        const t = (DOT_SPACING - carry) / segLen;
        this._p.lerpVectors(this._a, this._b, t);
        const f = placed / (MAX_DOTS - 1);                 // 0 near hand -> 1 far
        this._s.setScalar(1 - 0.5 * f);
        this._mat.compose(this._p, this._q, this._s);
        m.setMatrixAt(placed, this._mat);
        m.setColorAt(placed, this._c.lerpColors(this._white, this._grey, f));
        placed++;
        segLen -= (DOT_SPACING - carry); carry = 0;
        this._a.copy(this._p);
      }
      carry += segLen;
    }
    m.count = placed;
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor.needsUpdate = true;
  }

  hide() { this.mesh.count = 0; }
}
```

No allocation happens after construction: `setMatrixAt` writes into the preallocated `Float32Array`; `count` limits what is drawn.

### 4c. Flight trail: camera-facing tapered ribbon

A ring buffer of the last `N` ball positions (one push per rendered frame while the ball is in flight) drives a 2×N-vertex strip. Width and alpha taper from the ball backward. The material is a 12-line `ShaderMaterial`; three.js resolves `#include` chunks in `ShaderMaterial` too, so the trail goes through the same output color-space conversion as everything else.

```js
const TRAIL_N = 28, TRAIL_W = 0.03;

export class FlightTrail {
  constructor(scene, camera) {
    this.camera = camera;
    this.ring = new Float32Array(TRAIL_N * 3); this.head = 0; this.len = 0;

    const geo = this.geo = new THREE.BufferGeometry();
    this.pos   = new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.alpha = new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('aAlpha', this.alpha);
    const idx = new Uint16Array((TRAIL_N - 1) * 6);
    for (let i = 0, k = 0; i < TRAIL_N - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx[k++] = a; idx[k++] = b; idx[k++] = c;  idx[k++] = b; idx[k++] = d; idx[k++] = c;
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xfff4d6) } },
      vertexShader: /* glsl */`
        attribute float aAlpha; varying float vAlpha;
        void main() { vAlpha = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; varying float vAlpha;
        void main() { gl_FragColor = vec4(uColor, vAlpha); #include <colorspace_fragment> }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    scene.add(this.mesh);

    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._t = new THREE.Vector3();
    this._v = new THREE.Vector3(); this._side = new THREE.Vector3(1, 0, 0);
  }

  reset() { this.len = 0; this.head = 0; this.geo.setDrawRange(0, 0); }

  push(p) {                                    // call once per rendered frame while in flight
    const i = this.head * 3;
    this.ring[i] = p.x; this.ring[i + 1] = p.y; this.ring[i + 2] = p.z;
    this.head = (this.head + 1) % TRAIL_N; this.len = Math.min(this.len + 1, TRAIL_N);
    this._rebuild();
  }

  _rebuild() {
    const n = this.len;
    if (n < 2) { this.geo.setDrawRange(0, 0); return; }
    const start = (this.head - n + TRAIL_N) % TRAIL_N;
    const P = this.pos.array, A = this.alpha.array;
    for (let k = 0; k < n; k++) {
      const i0 = ((start + k) % TRAIL_N) * 3;
      this._a.fromArray(this.ring, i0);
      const kn = k < n - 1 ? k + 1 : k - 1;                    // tangent toward next sample (previous for the newest)
      this._b.fromArray(this.ring, ((start + kn) % TRAIL_N) * 3);
      this._t.subVectors(this._b, this._a);
      this._v.subVectors(this.camera.position, this._a);
      if (this._t.lengthSq() > 1e-10) this._side.crossVectors(this._t, this._v).normalize(); // else keep previous side
      const f = k / (n - 1);                                   // 0 oldest -> 1 newest (at the ball)
      const hw = TRAIL_W * 0.5 * f;
      const o = k * 6;
      P[o]     = this._a.x - this._side.x * hw; P[o + 1] = this._a.y - this._side.y * hw; P[o + 2] = this._a.z - this._side.z * hw;
      P[o + 3] = this._a.x + this._side.x * hw; P[o + 4] = this._a.y + this._side.y * hw; P[o + 5] = this._a.z + this._side.z * hw;
      A[k * 2] = A[k * 2 + 1] = f * f * 0.85;
    }
    this.pos.needsUpdate = true; this.alpha.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
  }
}
```

Fallback if you want zero custom GLSL: reuse the `ArcPreview` class as an afterimage trail (push the ball's last 16 positions, shrink scale toward the tail). It looks fine, just less "swooshy".

If you still prefer dashes on a `Line`: `LineDashedMaterial` defaults are `scale 1, dashSize 3, gapSize 1` (world units, i.e. meters here), so use `dashSize: 0.06, gapSize: 0.04`, keep the geometry non-indexed, and call `line.computeLineDistances()` after every position write.

---

## 5. Procedural canvas textures

```js
// src/textures.js
import * as THREE from 'three';

let MAX_ANISO = 1;
export function initTextures(renderer) { MAX_ANISO = renderer.capabilities.getMaxAnisotropy(); }

// Deterministic PRNG so textures are identical every load
export function mulberry32(seed) {
  return () => { let t = (seed += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * makeCanvasTexture(width, height, drawFn, opts) -> THREE.CanvasTexture
 *   drawFn(ctx, w, h, rng)
 *   opts.srgb (default true)   -> colorSpace = SRGBColorSpace for color maps; false for data maps (roughness/normal/bump/ao)
 *   opts.repeat [x, y]         -> wrap = RepeatWrapping, texture.repeat
 *   opts.anisotropy            -> default = max supported
 *   opts.seed
 */
export function makeCanvasTexture(width, height, drawFn, opts = {}) {
  const { srgb = true, repeat = [1, 1], anisotropy = MAX_ANISO, seed = 1, wrap = THREE.RepeatWrapping } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;             // use powers of two (256/512/1024) for clean mip chains
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height, mulberry32(seed));
  const tex = new THREE.CanvasTexture(canvas);               // sets needsUpdate = true itself (verified)
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;   // default is NoColorSpace (r152+)
  tex.wrapS = tex.wrapT = wrap;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = true;                                 // default; minFilter default LinearMipmapLinearFilter
  return tex;
}
```

Which textures need `SRGBColorSpace`: anything that is a *color* — `map`, `emissiveMap`, `sheenColorMap`, `specularColorMap`, and a canvas used as `scene.background`. Everything that is *data* stays `NoColorSpace`: `roughnessMap`, `metalnessMap`, `normalMap`, `bumpMap`, `aoMap`, `alphaMap`, `displacementMap`, `lightMap`. Getting this wrong makes color maps look washed out (data treated as sRGB) or roughness maps behave nonlinearly.

Examples:

```js
// Lumon MDR carpet: fine two-tone green noise with a faint weave
export const carpetTexture = () => makeCanvasTexture(512, 512, (ctx, w, h, rng) => {
  const img = ctx.createImageData(w, h), d = img.data;
  for (let i = 0; i < w * h; i++) {
    const x = i % w, y = (i / w) | 0;
    const weave = ((x & 3) < 2) !== ((y & 3) < 2) ? 6 : 0;
    const n = rng() * 22 - 11 + weave;
    d[i*4] = 46 + n; d[i*4+1] = 96 + n * 1.3; d[i*4+2] = 66 + n; d[i*4+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}, { repeat: [24, 24], seed: 7 });

// Wood planks (beach house floor / desk tops): per-plank tint + grain + seams
export const woodTexture = () => makeCanvasTexture(1024, 1024, (ctx, w, h, rng) => {
  const planks = 8, ph = h / planks;
  for (let p = 0; p < planks; p++) {
    const base = 150 + rng() * 30, off = rng() * w;
    ctx.fillStyle = `rgb(${base + 20},${base - 20},${base - 60})`;
    ctx.fillRect(0, p * ph, w, ph);
    ctx.globalAlpha = 0.18;
    for (let g = 0; g < 40; g++) {                  // grain: wavy dark lines
      ctx.strokeStyle = `rgb(${base - 60},${base - 80},${base - 100})`;
      ctx.lineWidth = 1 + rng() * 2; ctx.beginPath();
      const y0 = p * ph + rng() * ph;
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y0 + Math.sin((x + off) * 0.02) * 4 + rng() * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, p * ph, w, 2);            // seam
    ctx.fillRect(((p * 0.37 + 0.2) % 1) * w, p * ph, 2, ph);                       // staggered end joint
  }
}, { repeat: [3, 3], seed: 3 });

// Tile grid (beach house bathroom / office hallway): grout lines + subtle per-tile value shift
export const tileTexture = (cols = 8, tint = [228, 226, 220]) => makeCanvasTexture(1024, 1024, (ctx, w, h, rng) => {
  const s = w / cols, grout = 6;
  ctx.fillStyle = '#9a968f'; ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < cols; y++) for (let x = 0; x < cols; x++) {
    const v = (rng() - 0.5) * 14;
    ctx.fillStyle = `rgb(${tint[0] + v},${tint[1] + v},${tint[2] + v})`;
    ctx.fillRect(x * s + grout / 2, y * s + grout / 2, s - grout, s - grout);
  }
}, { repeat: [6, 6], seed: 11 });

// Text (Lumon wall plaque, monitor UI, beach house wall art). Draw big, let mipmaps + anisotropy do the rest.
export const textTexture = (lines, { bg = '#f4f3ee', fg = '#1c2a33', font = '600 96px "Helvetica Neue", Arial' } = {}) =>
  makeCanvasTexture(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((t, i) => ctx.fillText(t, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 120));
  }, { repeat: [1, 1], wrap: THREE.ClampToEdgeWrapping });
```

Notes: `Texture.flipY` defaults to `true`, so canvas text appears upright on a `PlaneGeometry` with default UVs. For an in-world scoreboard that changes, keep a reference to the canvas + texture, redraw, and set `tex.needsUpdate = true` (CanvasTexture only flags the first upload). A roughness map drawn on canvas is created with `{ srgb: false }`. For water on the beach, generate a tiling normal map on canvas (sum of a few sine ripples -> Sobel -> RGB) with `{ srgb: false }` and scroll `offset` each frame; the `Water` addon expects an external normal-map URL, which conflicts with the "no asset files" rule unless you feed it your canvas texture.

---

## 6. Ball rendering (crumpled paper)

```js
// src/paperBall.js
import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { makeCanvasTexture } from './textures.js';

export const BALL_R = 0.04;

export function makePaperBallGeometry(radius = BALL_R, seed = 0.37) {
  const geo = new THREE.IcosahedronGeometry(radius, 3);      // non-indexed, 1280 triangles
  const pos = geo.attributes.position;
  const noise = new ImprovedNoise();
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  let sum = 0;
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(pos, i).normalize();
    const low   = noise.noise(n.x * 2.3 + seed, n.y * 2.3, n.z * 2.3);
    const high  = noise.noise(n.x * 6.5, n.y * 6.5 + seed, n.z * 6.5);
    const ridge = 1 - Math.abs(noise.noise(n.x * 4.2 + seed, n.y * 4.2 + seed, n.z * 4.2)); // sharp creases
    const d = 1 + 0.18 * low + 0.07 * high - 0.12 * ridge;
    sum += d;
    v.copy(n).multiplyScalar(radius * d);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.scale(1, 1, 1);                                        // no-op placeholder; keep the next line instead
  const k = pos.count / sum;                                 // renormalize so the mean radius == physics radius
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  geo.computeVertexNormals();                                // non-indexed -> per-face normals -> faceted
  geo.computeBoundingSphere();
  return geo;
}
```

Because the displacement is a pure function of the normalized position (noise sampled at the same point for coincident vertices of adjacent triangles), the non-indexed mesh has no cracks; `flatShading` then gives the paper-fold facets.

Texture and material:

```js
export function makePaperMaterial() {
  const map = makeCanvasTexture(512, 512, (ctx, w, h, rng) => {
    ctx.fillStyle = '#f2efe6'; ctx.fillRect(0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h), d = img.data;          // paper grain
    for (let i = 0; i < d.length; i += 4) { const g = (rng() - 0.5) * 14; d[i] += g; d[i+1] += g; d[i+2] += g; }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(70,110,190,0.45)'; ctx.lineWidth = 2;   // faint ruled lines
    for (let y = 40; y < h; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(200,70,70,0.5)'; ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, h); ctx.stroke();
    ctx.fillStyle = 'rgba(40,40,48,0.55)'; ctx.font = '18px ui-monospace, Menlo, monospace';
    for (let y = 60; y < h; y += 28) {                               // "macrodata": rows of digits
      let s = ''; for (let c = 0; c < 26; c++) s += (rng() * 10 | 0) + ' ';
      ctx.fillText(s, 80, y);
    }
  }, { repeat: [2, 1], wrap: THREE.RepeatWrapping, seed: 5 });
  return new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, flatShading: true });
}
```

The icosahedron's default spherical UVs have a seam; the repeat of 2 in U and the crumpling hide it well enough at 4 cm.

Rotation following physics angular velocity (`omega` in rad/s, world axes). Integrate the orientation inside the fixed step, then interpolate for rendering:

```js
const _axis = new THREE.Vector3(), _dq = new THREE.Quaternion();
export function integrateOrientation(q, omega, dt) {
  const w = omega.length();
  if (w < 1e-6) return;
  _axis.copy(omega).multiplyScalar(1 / w);
  _dq.setFromAxisAngle(_axis, w * dt);
  q.premultiply(_dq).normalize();       // premultiply: omega is a world-space axis
}

// render side, once per frame:
ballMesh.position.lerpVectors(prev.p, curr.p, alpha);
ballMesh.quaternion.slerpQuaternions(prev.q, curr.q, alpha);
```

Physics conventions to hand to `physics.js` so the spin looks right: a throw gets backspin `omega0 = (vHat × up) * 12..20 rad/s`; in flight `omega *= (1 - 0.6*dt)` (paper loses spin fast); when rolling on a surface with normal `n`, `omega = (v × n) / r` (rolling without slipping); on a bounce, damp `omega` by the restitution and add a little `(vTangential × n)/r`.

---

## 7. Performance and robustness

Budgets (both levels, 60 fps on a 2020 laptop iGPU and a mid-range phone):

- Draw calls < 150 per frame (`renderer.info.render.calls`), triangles < 250k. Merge static same-material geometry with `mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js` (desk clusters, partitions, window mullions, sofa cushions). Use `InstancedMesh` for repeated props (chairs, books, cups). Static objects: `matrixAutoUpdate = false` + one `updateMatrix()`.
- Textures: ≤ 12 canvas textures per level, ≤ 1024² each (about 5.3 MB with mips) -> < 64 MB GPU memory. Check `renderer.info.memory.textures/geometries` when switching levels; they must return to the baseline.
- Lights: **one** shadow-casting `DirectionalLight` per level (beach: the sun; office: a soft key light angled from the ceiling that only exists to give the ball/bin a contact shadow; the look comes from RectAreaLights). No shadows on point/spot lights (each point-light shadow is 6 render passes). RectAreaLights ≤ 3 on desktop, ≤ 2 on mobile (LTC evaluation runs per fragment on every Standard/Physical material). Point lights ≤ 3. `castShadow` only on objects that matter (ball, bin, desks, sofas, table); `receiveShadow` on floor and large horizontal surfaces.
- Shadow map: 2048² desktop, 1024² mobile, single ortho frustum fitted to the play area:

```js
const key = new THREE.DirectionalLight(0xfff1e0, 3.0);
key.position.set(5, 8, 2); key.target.position.set(0, 0, -3);
scene.add(key, key.target);                  // target must be in the scene graph so its matrixWorld updates
key.castShadow = true;
key.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
const sc = key.shadow.camera;               // OrthographicCamera; defaults are ±5, near 0.5, far 500
sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = 1; sc.far = 30;
sc.updateProjectionMatrix();
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.intensity = 0.85;
```

- Materials: `MeshStandardMaterial` everywhere except sofas (`MeshPhysicalMaterial` with sheen) and lacquered surfaces (clearcoat). Never use `transmission` for the floor-to-ceiling windows: any `transmission > 0` triggers an extra full scene render into the transmission buffer every frame. Windows are open air with thin mullions; if you want visible glass, `MeshPhysicalMaterial({ transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0 })` with `depthWrite: false`.
- Beach environment reflections: `PMREMGenerator` + `RoomEnvironment` (addon verified) once at level build, `scene.environment = pmrem.fromScene(new RoomEnvironment()).texture`, `scene.environmentIntensity = 0.4` (property exists in r170); dispose the PMREM render target on level teardown.

Level lifecycle: each level module exports `build(ctx) -> { group, bin, colliders, update(dt), dispose() }`. Shared assets (ball, arc dots, trail, HUD) live outside the level group and are never disposed on switch.

```js
// src/levels/util.js
const MAP_KEYS = ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','bumpMap','alphaMap',
  'envMap','lightMap','displacementMap','sheenColorMap','sheenRoughnessMap','clearcoatMap',
  'clearcoatNormalMap','clearcoatRoughnessMap','specularColorMap','specularIntensityMap'];

export function disposeTree(root) {
  root.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) {
      for (const k of MAP_KEYS) if (m[k] && m[k].isTexture) m[k].dispose();
      m.dispose();
    }
  });
  root.removeFromParent();
}

export function switchLevel(state, nextBuilder) {
  state.level?.dispose();                          // calls disposeTree(group), pmremTarget.dispose(), etc.
  if (state.scene.environment) { state.scene.environment.dispose(); state.scene.environment = null; }
  if (state.scene.background?.isTexture) state.scene.background.dispose();
  state.scene.fog = null;
  state.renderer.renderLists.dispose();
  state.level = nextBuilder({ scene: state.scene, renderer: state.renderer, camera: state.camera });
  state.physics.setWorld(state.level.bin, state.level.colliders);
}
```

Fixed-timestep loop with interpolated render, tab-hidden handling. `FIXED_DT = 1/240` because the 4 cm ball at 10 m/s moves 4.2 cm per 1/240 s (about one radius), which keeps the thin rim ring (tube radius ~1 cm) from being tunneled through with plain discrete collision checks; at 60 fps that is 4 physics steps per frame, trivially cheap for one sphere.

```js
// src/main.js (loop)
import { FIXED_DT } from './physics.js';
const MAX_FRAME_DT = 0.1;                       // after a hitch or tab switch, do not try to catch up more than this
let acc = 0, last = performance.now();

renderer.setAnimationLoop((now) => {            // callback receives the rAF timestamp (verified: onAnimationFrame(time))
  let dt = (now - last) / 1000; last = now;
  if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;
  resizeToDisplaySize(camera, lineMaterials);

  acc += dt;
  let steps = 0;
  while (acc >= FIXED_DT && steps < 32) { physics.step(FIXED_DT); acc -= FIXED_DT; steps++; }
  if (steps === 32) acc = 0;                    // spiral-of-death guard

  const alpha = acc / FIXED_DT;                 // 0..1 between physics.prev and physics.curr
  ballView.sync(physics.prev, physics.curr, alpha);
  if (physics.state === 'flying' || physics.state === 'settling') trail.push(ballView.mesh.position);
  if (input.aiming) arc.update(...physics.predictFrom(handPos, input.velocity()));
  level.update(dt);                             // water ripples, blinking monitors, etc.
  hud.flushIfDirty();                           // DOM writes only when a value changed
  renderer.render(scene, camera);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { renderer.setAnimationLoop(null); input.cancel(); }   // rAF stops anyway; this makes it explicit
  else { last = performance.now(); acc = 0; renderer.setAnimationLoop(loop); }
});
```

`physics.step` must copy `curr -> prev` before integrating so the render can interpolate; `physics.launch()` sets both to the launch pose so there is no first-frame jump.

---

## 8. Input (pointer events, unified mouse + touch)

```js
// src/input.js
export class DragInput {
  constructor(canvas, { onStart, onMove, onRelease, onCancel }) {
    this.canvas = canvas; this.cb = { onStart, onMove, onRelease, onCancel };
    this.activeId = null; this.aiming = false;
    this.start = { x: 0, y: 0, t: 0 }; this.cur = { x: 0, y: 0, t: 0 };
    this.samples = new Float64Array(16 * 3); this.sHead = 0; this.sLen = 0;   // (x, y, t) ring for flick velocity if wanted

    canvas.addEventListener('pointerdown', this.onDown, { passive: false });
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);          // OS took the gesture (scroll/zoom/palm/alert)
    canvas.addEventListener('lostpointercapture', this.onLostCapture);
    canvas.addEventListener('contextmenu', e => e.preventDefault());  // long-press menu on mobile, right-click on desktop
    document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });   // Safari pinch-zoom
    window.addEventListener('blur', this.onCancel);
  }

  onDown = (e) => {
    if (this.activeId !== null) return;                               // ignore a second finger
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();                                               // no text selection / focus change / compat mouse events
    this.activeId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);                       // keep receiving move/up even outside the canvas
    this.aiming = true;
    this._set(this.start, e); this._set(this.cur, e);
    this.cb.onStart?.(this.start);
  };

  onMove = (e) => {
    if (e.pointerId !== this.activeId) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];  // full-rate samples on 120 Hz+ input
    for (const ev of evs) { this._set(this.cur, ev); this._pushSample(this.cur); }
    this.cb.onMove?.(this.start, this.cur);
  };

  onUp = (e) => {
    if (e.pointerId !== this.activeId) return;
    this._set(this.cur, e);
    const id = this.activeId; this.activeId = null; this.aiming = false;
    try { this.canvas.releasePointerCapture(id); } catch {}
    this.cb.onRelease?.(this.start, this.cur);
  };

  onCancel = (e) => {
    if (e && e.pointerId !== undefined && e.pointerId !== this.activeId) return;
    if (this.activeId === null) return;
    const id = this.activeId; this.activeId = null; this.aiming = false;
    try { this.canvas.releasePointerCapture(id); } catch {}
    this.cb.onCancel?.();                                             // ball snaps back to hand, no throw
  };

  onLostCapture = (e) => { if (e.pointerId === this.activeId) this.onCancel(e); };  // fires after our own release too; activeId is already null then
  cancel() { this.onCancel(); }

  _set(o, e) { const r = this.canvas.getBoundingClientRect(); o.x = e.clientX - r.left; o.y = e.clientY - r.top; o.t = e.timeStamp; }
  _pushSample(o) { const i = this.sHead * 3; this.samples[i] = o.x; this.samples[i+1] = o.y; this.samples[i+2] = o.t;
    this.sHead = (this.sHead + 1) % 16; this.sLen = Math.min(this.sLen + 1, 16); }
}
```

Mapping (slingshot: pull down/back to charge, sideways to aim; the live arc makes it fair and learnable):

```js
// in main.js
function aimFromDrag(start, cur) {
  const n = 1 / canvas.clientHeight;                         // normalize by height so portrait/landscape feel the same
  const dx = (cur.x - start.x) * n, dy = (cur.y - start.y) * n;
  const pull = THREE.MathUtils.clamp(dy, 0, 0.6);            // only pulling down charges
  const speed = 3.0 + pull * 12.5;                           // 3 .. 10.5 m/s
  const pitch = THREE.MathUtils.degToRad(38 + pull * 25);    // 38° .. 53°
  const yaw   = -dx * 1.2;                                   // drag left -> ball goes right (slingshot); flip sign if playtest prefers direct
  return { speed, pitch, yaw };
}
```

A flick mapping (velocity from the last ~80 ms of samples in the ring buffer) is a two-line alternative, but it is harder to make fair on touch; keep it as an option in `input.js`, ship slingshot.

---

## 9. r160+ gotchas checklist (all verified against r170 source/docs unless noted)

1. **`RectAreaLightUniformsLib.init()`** must run once before the first render that includes a `RectAreaLight`; it populates `UniformsLib.LTC_FLOAT_1/2` and `LTC_HALF_1/2`. Without it the area lights render wrong. RectAreaLight has no shadows and only affects `MeshStandardMaterial`/`MeshPhysicalMaterial`; intensity is in nits.
2. **`LineDashedMaterial` needs `line.computeLineDistances()`** (a method on `Line`/`LineSegments`, not on `BufferGeometry`), only works on non-indexed geometry, and must be re-run every time positions change. Defaults: `scale 1, dashSize 3, gapSize 1` (world units).
3. **`Line2`/`LineMaterial`**: set `material.resolution` to the CSS size and update it on resize; `dashed = true` toggles a `USE_DASH` define (the setter flags `needsUpdate`); call `line2.computeLineDistances()` after changing positions; `LineGeometry.setPositions()` allocates a new instanced buffer each call.
4. **`CanvasTexture`** sets `needsUpdate = true` only at construction. After redrawing the canvas set `texture.needsUpdate = true` again.
5. **Color spaces**: `Texture.colorSpace` defaults to `NoColorSpace`; set `SRGBColorSpace` on color maps only. `ColorManagement.enabled` is `true` by default: hex/`setStyle`/`setHex` inputs are sRGB and converted, but **`Color.setRGB(r,g,b)` takes values in the working (linear) color space** by default (`colorSpace = ColorManagement.workingColorSpace`); pass `THREE.SRGBColorSpace` as the 4th argument when you mean sRGB. This affects `setColorAt` instance colors and vertex colors.
6. **`MeshPhysicalMaterial` sheen**: `sheen` defaults to `0` (getter/setter over `_sheen`; toggling between 0 and >0 recompiles), `sheenColor` defaults to **black** (0x000000) so sheen is invisible until you set it, `sheenRoughness` defaults to `1`, `ior` `1.5`. Velvet sofa: `sheen: 1, sheenColor: 0xd9c2b0, sheenRoughness: 0.7, roughness: 0.9`. `transmission > 0` triggers an extra scene render per frame; avoid.
7. **DirectionalLight shadow camera** is an `OrthographicCamera` defaulting to `±5 m, near 0.5, far 500`; after editing bounds call `shadow.camera.updateProjectionMatrix()`; the light's `target` must be added to the scene (or have `updateMatrixWorld()` called) or the light points at the origin. Debug with `new THREE.CameraHelper(light.shadow.camera)`. Default `mapSize` is 512² (blurry); `bias 0`, `normalBias 0`, `radius 1`, `blurSamples 8`, `intensity 1`.
8. **`PCFSoftShadowMap` ignores `shadow.radius`** (docs and shader confirm); soften with `PCFShadowMap` + `radius 2..4`, or `VSMShadowMap` + `blurSamples`. Note r182 deprecates `PCFSoftShadowMap` for WebGL (PCF becomes soft); irrelevant at r170 but plan for it.
9. **Fog is applied after tone mapping and output color-space conversion** (`fog_fragment` comes after `tonemapping_fragment` and `colorspace_fragment` in every built-in fragment shader), and `fog.color` is uploaded in the output color space, exactly like the clear/background color. So `toneMappingExposure` changes the scene but not the fog/background color, and a skydome `Mesh` (which *is* tone mapped) will not match the fog at the horizon. Rules: give the skydome/far-ocean material `fog: false`; pick `scene.background` = `fog.color` = the *already tone-mapped* horizon color; or use the `Sky` addon (`ShaderMaterial`, `fog` is `false` for ShaderMaterial by default, `BackSide`, `depthWrite: false`) and scale it to stay inside `camera.far` (the official example uses a huge scale with a huge far plane; with `far = 250` use `sky.scale.setScalar(200)`).
10. **`InstancedMesh.frustumCulled` is `true` by default** (r151+) and uses the geometry's bounding sphere, not the instances. Dynamic instances (arc dots) either call `computeBoundingSphere()` after updates or set `frustumCulled = false`. Same for the trail mesh with a hand-written geometry.
11. **`Material.type` is a static property since r170**; don't assign it to force recompiles (use `material.needsUpdate = true`).
12. **`WebGLRenderer` is WebGL 2 only since r163** (fine: NPOT textures with mipmaps work, `stencil` is off by default).
13. **`renderer.setSize(w, h, false)`** leaves the element size to CSS; forget the `false` and the canvas gets inline pixel sizes that fight the `100%` CSS.
14. **Importmap ordering**: the `<script type="importmap">` must precede every `<script type="module">`; addons import bare `three`, so the `"three"` entry is mandatory; only one importmap per document to be safe with older Safari.
15. **`useLegacyLights` is gone** (no occurrences in the r170 build). All intensities are in the r155+ units; the π-scaling never comes back.
16. **Tone mapping only applies when rendering to screen** (r155+). Irrelevant unless you add `EffectComposer`; then `OutputPass` is required.
17. **`Water` addon** wants an external normal-map image URL; with the no-assets rule, either pass it a canvas normal texture or write your own animated `ShaderMaterial` ocean plane.
18. **`Timer`/`Clock`**: `Clock` is fine in r170 (deprecated only in r183); the plan uses `performance.now()` from `setAnimationLoop` and needs neither.
19. **Pointer capture edge**: `lostpointercapture` fires after your own `releasePointerCapture`; guard with the `activeId` check as in section 8, or a released throw will be cancelled.
20. **iOS Safari** ignores `user-scalable=no`; `touch-action: none` on the canvas plus `preventDefault()` on `gesturestart` is what actually stops pinch-zoom.

---

## Appendix: verified facts (2026-09-02)

- jsdelivr `data.jsdelivr.com/v1/package/npm/three`: `latest` tag `0.185.1`; recent versions `0.185.1, 0.185.0, 0.184.0, 0.183.2, 0.183.1, 0.183.0, 0.182.0, 0.181.2`.
- `three@0.170.0/build/three.module.js`: HTTP 200, 1,314,681 B, `x-jsd-version: 0.170.0`, `const REVISION = '170'`. `build/three.module.min.js` 200 (691,648 B). `build/three.core.js` 404 at 0.170.0 (only exists from r171; present at 0.185.1 with `REVISION = '185'`, and 0.185.1's `three.module.js` imports `./three.core.js`).
- `three@0.170.0/package.json` exports: `"." -> ./build/three.module.js`, `"./addons/*" -> ./examples/jsm/*`, `"./examples/jsm/*"`, `"./webgpu"`, `"./tsl"`.
- Addon URLs listed in section 0 all returned 200 under `https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/`.
- Migration Guide (wiki): 151->152 `outputEncoding` -> `outputColorSpace` (default `SRGBColorSpace`), `Texture.encoding` -> `colorSpace` (default `NoColorSpace`), `ColorManagement.enabled` true; 154->155 `useLegacyLights` false and deprecated, inline tone mapping only to screen; 162->163 WebGL 1 removed, `stencil` false by default, `Scene.environmentIntensity`; 169->170 `Material.type` static, mipmaps always generated when `generateMipmaps` true; 170->171 (split builds era) onward: 178->179 `Timer` in core; 181->182 `PCFSoftShadowMap` deprecated for WebGL; 182->183 `Clock` deprecated, `Sky` gamma change; 183->184 background/env rotation change; 185->186 `Object3D.dispose()`.
- r155 lighting announcement (discourse 53733): ambient/hemisphere/directional restored by multiplying old values by π; point/spot are in candela and decay physically; keep `decay = 2`.
- r170 source: `WebGLShadowMap.type = PCFShadowMap` default; `useLegacyLights` absent; `PointLight(color, intensity, distance = 0, decay = 2)`, `power = 4π·I`; `SpotLight` `power = π·I`; `RectAreaLight(color, intensity, width = 10, height = 10)`, `power = I·w·h·π`; `LightShadow` defaults `intensity 1, bias 0, normalBias 0, radius 1, blurSamples 8, mapSize 512²`; `DirectionalLightShadow` camera `OrthographicCamera(-5, 5, 5, -5, 0.5, 500)`; `CanvasTexture` sets `needsUpdate = true`; `Texture` defaults `ClampToEdgeWrapping`, `LinearFilter`/`LinearMipmapLinearFilter`, `anisotropy = Texture.DEFAULT_ANISOTROPY`, `colorSpace = NoColorSpace`; `LineDashedMaterial` `scale 1, dashSize 3, gapSize 1`; `computeLineDistances()` defined on `Line` and `LineSegments` (warns on indexed geometry); `Color.setRGB(r, g, b, colorSpace = ColorManagement.workingColorSpace)`; `MeshPhysicalMaterial` `_sheen = 0.0` with getter/setter, `sheenColor` black, `sheenRoughness 1.0`, `ior 1.5`; `ShaderMaterial.fog = false` by default, mesh materials `fog = true`; fragment chunk order `opaque_fragment, tonemapping_fragment, colorspace_fragment, fog_fragment, premultiplied_alpha_fragment, dithering_fragment`; fog color uploaded via `getUnlitUniformColorSpace(renderer)`; `Scene.environmentIntensity = 1`; `InstancedMesh` has `instanceMatrix`, lazy `instanceColor`, `count`, `setMatrixAt`, `setColorAt`; `BufferAttribute.setUsage`, `addUpdateRange`, `BufferGeometry.setDrawRange` present; tone-mapping constants include `AgXToneMapping = 6`, `NeutralToneMapping = 7`; `PerspectiveCamera(fov = 50, aspect = 1, near = 0.1, far = 2000)`; `renderer.capabilities.getMaxAnisotropy()` exists; `setAnimationLoop` callback is `onAnimationFrame(time)`.
- r170 docs (repo `docs/api/en/...`): PointLight intensity "measured in candela (cd)"; RectAreaLight "no shadow support", Standard/Physical only, "call `init()`" on `RectAreaLightUniformsLib`, intensity in nits; CanvasTexture "sets needsUpdate to true immediately"; LineDashedMaterial "You must call Line.computeLineDistances()"; LightShadow.radius "If ... PCFSoftShadowMap, radius has no effect".
- Addon sources: `RectAreaLightUniformsLib.init()` assigns `UniformsLib.LTC_FLOAT_1/2, LTC_HALF_1/2`; `LineMaterial` uniforms `worldUnits, linewidth, resolution, dashOffset, dashScale, dashSize, gapSize`, `dashed` setter; `LineSegments2.computeLineDistances()` writes `instanceDistanceStart/End`; `LineGeometry.setPositions/setColors/fromLine`; `Sky` uses `ShaderMaterial` with `side: BackSide, depthWrite: false`, uniforms `turbidity, rayleigh, sunPosition`; `ImprovedNoise().noise(x, y, z)`.