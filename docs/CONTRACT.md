# Trashketball — module contract (binding)

This file is the single source of truth for how the modules fit together. The design docs in `docs/design/`
are rich references (art direction, physics derivations, UX detail); **where they disagree with this file, this file wins.**

## 0. Ground rules

- Plain ES modules, no bundler, no TypeScript. `three` and `three/addons/…` resolve via the importmap in `index.html`
  (three@0.170.0 on jsdelivr). No other external dependencies. No image/audio/model files: geometry from primitives,
  textures from canvas (`src/textures.js`), sounds from WebAudio synthesis.
- Units: meters, seconds, radians (degrees only where a name says `Deg`). Y is up. Floor of every level is y = 0.
  Levels are laid out so the player looks toward −z.
- `package.json` has `"type": "module"`, so `node --check src/<file>.js` validates syntax. Every author runs it.
- Physics (`src/physics.js`) must not import three. It uses plain `{x,y,z}` objects so `node tests/physics.test.mjs` runs.
- Nothing allocates per frame in hot paths (preview, trail, step). Preallocate buffers.
- No em-dashes in user-visible copy.

## 1. Files and owners

| File | Agent | Exports |
| --- | --- | --- |
| `index.html` | core (done) | importmap, `<canvas id="game">`, `<div id="hud">` |
| `src/events.js` | core (done) | `Emitter` (`on/once/off/emit/clear`) |
| `src/textures.js` | core (done) | `initTextures`, `makeCanvasTexture`, `redrawCanvasTexture`, `textTexture`, `radialAlphaTexture`, `mulberry32`, `makeValueNoise2D`, `makeFbm2D`, `fillPixels`, `hexToRgb`, `clamp255` |
| `src/levels/util.js` | core (done) | `disposeTree`, `boxCollider`, `boxColliderFromObject`, `cylinderCollider`, `makeContactShadow`, `freezeStatic` |
| `src/physics.js`, `tests/physics.test.mjs` | **physics** | see §3 |
| `src/input.js`, `src/trajectory.js`, `src/paperBall.js` | **ballaim** | see §4, §5, §6 |
| `src/hud.js`, `src/audio.js` | **hudaudio** | see §7, §8 |
| `src/levels/severance.js` (+ optional helpers in `src/levels/severance/`) | **level1** | `createSeveranceLevel(ctx)` §9 |
| `src/levels/beachHouse.js` (+ optional helpers in `src/levels/beach/`) | **level2** | `createBeachHouseLevel(ctx)` §9 |
| `src/main.js`, `src/juice.js` | **main** | bootstrap, loop, state machine, level switching, ball lifecycle, feedback §10 |

## 2. Shared constants (`src/physics.js` exports them; everyone imports from there)

```js
export const FIXED_DT = 1 / 240;   // physics step
export const BALL_R = 0.04;        // ball radius (m)
export const GRAVITY = 9.81;
export const DRAG_K = 0.8;         // linear air drag, s^-1  (a = -k v)
export const MAX_SPEED = 12;
```

## 3. `src/physics.js` (owner: physics)

Custom sphere physics for several paper balls against static colliders. **No three.js import.** Vectors are plain `{x, y, z}`.
Follow `docs/design/01-physics-and-throw.md` sections 2, 3, 4, 5 exactly (integrator, collision math, side flag, scoring predicate,
sleep rules). Summary of the required API:

```js
export function createWorld() -> World
World:
  .setLevel(levelPhysics)          // levelPhysics = { floor, bin, boxes, cylinders, bounds } (see §9.2)
  .createBall() -> Ball            // registers; state 'held' (not simulated)
  .launch(ball, pos, vel, omega)   // sets p=prevP=pos, v, w; state 'flying'; records launch sim time
  .step(dt)                        // one fixed step for every non-sleeping, non-held ball; copies p->prevP, q->prevQ first
  .removeBall(ball)
  .balls                           // array of all registered balls
  .time                            // accumulated sim time (s)
  .predict(pos, vel, opts) -> { points: Float32Array, count: number, contact: null | { type, tag, point:{x,y,z}, t } , tContact }
       // opts = { maxTime = 3, stopOnContact = true, sampleEvery = 4 }  sample every 4th step = 60 pts/s
       // Uses the SAME integrator and colliders as step(); no allocation (reuses an internal Float32Array of 3*720)
       // contact.type in 'floor' | 'box' | 'cylinder' | 'rim' | 'binWall' | 'binFloor'
  .solveSpeedForTarget(pos, dirH, elevation, target) -> speed
       // bisection (25 iters, 2..14 m/s) on launch speed along horizontal unit dir `dirH` at `elevation` (rad)
       // so the free-flight arc (no colliders) descends through y = target.y at horizontal distance |target - pos|_xz
  .on(name, fn) / .off(name, fn)   // Emitter; events below
  .isInBin(ball) -> boolean        // the IN predicate (design doc §4)
  .sleepBall(ball)                 // force sleep (used when recycling)
Ball: {
  id, state: 'held' | 'flying' | 'sleeping',
  p:{x,y,z}, prevP:{x,y,z}, v:{x,y,z}, w:{x,y,z},          // w = angular velocity (rad/s, world axes)
  q:{x,y,z,w}, prevQ:{x,y,z,w},                             // orientation quaternion (integrated from w)
  scored: false, launchedAt: number, firstContactAt: number | null, lastContactAt: number | null,
  contacts: { rim: 0, inner: 0, outer: 0, bottom: 0, floor: 0, box: 0, cylinder: 0, ball: 0, ceiling: 0 },
  boxTags: [],           // tags of boxes/cylinders hit, in order
  enteredIn: false, side: 'above' | 'inside' | 'outside',
  inTimer: 0, sleepTimer: 0, userData: {}
}
```

Events (payload `{ ball, point:{x,y,z}, normal:{x,y,z}, speed, tag }`; `speed` = |v·n| impact speed):
`rimHit`, `binWallHit` (tag 'inner' | 'outer'), `binFloorHit`, `floorHit`, `boxHit` (tag = box tag), `cylinderHit`, `ballHit`,
`scored` ({ ball }), `outOfBounds` ({ ball }), `rest` ({ ball }) when a ball goes to sleep. Impact events fire only for
impacts with |vn| > 0.45 m/s (resting contacts do not spam). `boxHit` with tag `'ceiling'` is how the ceiling is reported.

Level physics input (`levelPhysics`, built by the level, see §9.2):

```js
{
  floor: { restitution: 0.30, friction: 0.45, rollDamping: 4.0 },
  bin: {
    x, z,                       // axis position, base on the floor (y = 0)
    height,                     // rim plane y (H)
    rOutTop, rOutBot,           // outer radii at top/bottom
    wall,                       // wall thickness -> rInTop = rOutTop - wall, rInBot = rOutBot - wall
    floorThick,                 // inner floor at y = floorThick
    rimTube,                    // torus tube radius; torus center radius = rOutTop - wall/2 at y = height
    materials: { wall: {restitution, friction, rollDamping}, bottom: {...}, rim: {...} }
  },
  boxes: [ { min:{x,y,z}, max:{x,y,z}, restitution, friction, rollDamping, tag } ],   // world AABBs, >= 0.05 m thick
  cylinders: [ { x, z, radius, yMin, yMax, restitution, friction, rollDamping, tag } ], // vertical cylinders
  bounds: { minX, maxX, minZ, maxZ, minY: -1, maxY: 30 }   // outside -> 'outOfBounds' event, ball sleeps
}
```

Scoring (design doc §4): `IN := floorThick < p.y < H - R && rho < rIn(p.y) - 0.5R`. Score when `!scored` and
(IN held ≥ 0.30 s) or (IN and p.y < 0.5 H) or (IN and sleeping). Emit `scored` once, set `ball.scored = true`.
Spent balls that sleep stay as static sphere colliders (so balls stack in the bin).

`tests/physics.test.mjs` (runs with `node tests/physics.test.mjs`, exits non-zero on failure) must check at least:
free-flight range for v0 = 7.816 m/s at 50° from (0, 1.30, 0) crosses y = 0.30 at x within 3.99..4.01 (design doc §6),
floor bounce restitution, an AABB bounce from each face, a ball dropped into the bin scores exactly once,
a ball dropped beside the bin never scores, a ball dropped onto the rim from directly above bounces (rimHit fires),
`predict` matches `step` for the same launch (same positions at the same sample times within 1e-6), and
`solveSpeedForTarget` returns 7.816 ± 0.02 for the §6 setup.

## 4. `src/input.js` (owner: ballaim)

Pointer drag with capture, unified mouse/touch/pen (design doc 04 §8, 05 §5.1). **Slingshot mapping: pull DOWN to charge,
move sideways to aim; the arc follows the drag direction (drag left = arc goes left).** Release position decides the throw.

```js
export class DragInput {
  constructor(canvas, { onStart(pt), onMove(aim), onRelease(aim), onCancel() })
  enabled = true;            // when false, pointerdown is ignored
  aiming;                    // true between an accepted pointerdown and up/cancel
  setOptions({ yawRangeDeg = 22, invertYaw = false, deadzonePx = 12 })
  cancel();  dispose();
}
// aim object passed to onMove/onRelease (reused, do not retain):
{ power: 0..1, yaw: radians (+ = right), cancelled: boolean, pointerType: 'mouse'|'touch'|'pen',
  dx, dy: css px from start, start:{x,y}, cur:{x,y} }
export function computeAim(start, cur, { pointerType, vw, vh, yawRangeDeg, invertYaw, deadzonePx }) -> aim
// S = min(vw, vh); dragFull = (touch ? 0.45 : 0.35) * S
// dy = cur.y - start.y (downward positive); power = clamp((dy - deadzonePx) / (dragFull - deadzonePx), 0, 1)
// yaw = clamp(dx / dragFull, -1, 1) * yawRange (radians); if invertYaw, negate
// cancelled = dy < deadzonePx  (release in that state = no throw)
export function powerCurve(p, k = 0.45) -> p + k * Math.sin(2 * Math.PI * p) / (2 * Math.PI)   // monotonic sweet-spot curve
export function speedFromPower(p, vMin, vMax) -> vMin + (vMax - vMin) * powerCurve(p)
export class KeyboardAim   // optional: arrows adjust yaw (±0.5° per press, repeat), Space held charges 0->1->0 (900 ms each way), release fires
  constructor({ onChange(aim), onRelease(aim) }); enabled; dispose()
```
Rules: primary button only; ignore extra pointers while one is captured; `setPointerCapture`; handle `pointercancel`,
`lostpointercapture` (guarded against our own release), window `blur` -> cancel; `contextmenu` prevented on the canvas;
`gesturestart` prevented on document. Use `getCoalescedEvents` when present. `onMove` fires at most once per pointermove.

## 5. `src/trajectory.js` (owner: ballaim)

```js
export class ArcPreview {
  constructor(scene, { maxDots = 48, spacing = 0.10, dotRadius = 0.016 } = {})
  setColors(nearHex, farHex)                 // level styling
  update(points, count, { fraction = 0.72, power = 0.5 })   // points: Float32Array xyz from world.predict; draws dots for the first `fraction` of the arc, fading over the last 15%
  showMarker(point, kind)                    // kind: 'floor' | 'rim' | 'box' -> small ring at the predicted contact (only when fraction >= 1)
  hide()
  dispose()
}
export class FlightTrail {
  constructor(scene, camera, { length = 28, width = 0.03, color = 0xfff4d6 } = {})
  setColor(hex)
  push(pos)                                  // THREE.Vector3, once per rendered frame while in flight
  update(dt)                                 // handles fade-out animation
  fadeOut(ms = 300)                          // start fading, then reset when done
  reset()
  dispose()
}
```
Implementation: InstancedMesh dots + camera-facing ribbon per `docs/design/04-threejs-technical-plan.md` §4. `frustumCulled = false`.
Dots: `toneMapped: false`, depth-tested (occluded by the bin rim). Marker: thin torus, `depthTest: true`.

## 6. `src/paperBall.js` (owner: ballaim)

```js
export const HAND_NDC = { x: 0.42, y: -0.52 };  export const HAND_DIST = 0.55;
export function computeHandPosition(camera, out)         // NDC + distance -> world (tech plan §3); camera matrices must be current
export function createPaperBallMesh({ variant = 'lumon' | 'beach', seed = 1 } = {}) -> THREE.Mesh   // crumpled icosahedron, flatShading, castShadow, radius BALL_R
export function syncBallMesh(mesh, ball, alpha)          // mesh.position = lerp(prevP, p, alpha); quaternion = slerp(prevQ, q, alpha)
export function crinkle(mesh)                            // squash 1.08/0.92/1.08 -> 1 over 120 ms (driven by animateBallMeshes)
export function animateBallMeshes(dt)                    // advances crinkle/shrink animations for all meshes created here
export function shrinkAndRemove(mesh, ms = 400) -> Promise // scale to 0 then remove from parent and dispose geometry (material shared)
```
Materials are shared per variant (one geometry per seed cached, up to 6 seeds). Variant 'lumon' = white paper with faint blue rules and
rows of digits; 'beach' = ivory paper with a serif-looking print block.

## 7. `src/hud.js` (owner: hudaudio)

DOM overlay inside `#hud`. **The HUD injects its own `<style>` element and builds its DOM in the constructor.** Themes and copy per
`docs/design/05-game-ux-spec.md` §2 and §4 (tokens, layout, fonts: IBM Plex Mono for Lumon data, Cormorant Garamond for beach).

```js
export class Hud {
  constructor(root /* #hud element */)
  setTheme('lumon' | 'beach')
  setLevel({ eyebrow, name, lvl })
  setScore(levelScore, { animate = true } = {})
  setDots(made /* 0..10 */)
  setStreak(n /* 0 hides */)
  setStats({ throws, makes })
  setHint(text | null)                                  // bottom-center persistent hint (aim instructions); null hides
  say(text, { ms = 2600 } = {})                          // flavor line (level voice), replaces previous; auto hides
  popup(text, { x, y, kind = 'score' | 'label' | 'warn' | 'muted', sub = null })   // floating text at css px, pooled
  showOverlay({ eyebrow, title, body, stats, sub, footnote, buttons: [{ label, primary, onClick }] })
  hideOverlay()
  fade(colorHex, { inMs, holdMs, outMs, text: { small, big } | null, onCovered }) -> Promise<void>   // full-screen fade used by level transitions
  setStuck(visible)
  setSound(on) ; onSoundToggle(cb)
  setInputMode('pointer' | 'touch' | 'keyboard')
  live(text)                                            // aria-live announcement (throttled)
  setReducedMotion(bool)
  dispose()
}
```
`#hud` keeps `pointer-events: none`; only buttons and overlay panels get `pointer-events: auto`. Overlay buttons must be
keyboard focusable. `Enter`/`Space` while an overlay is open activates the primary button (main.js wires keys; hud exposes
`overlayPrimary()` to trigger it).

## 8. `src/audio.js` (owner: hudaudio)

WebAudio synthesis, no files. Recipes: `docs/design/05-game-ux-spec.md` §3.7.

```js
export class GameAudio {
  constructor()
  unlock()                     // create/resume the AudioContext; call from a trusted gesture (main.js does)
  get ready
  setVariant('steel' | 'matte')  // bin sound set per level
  play(name, opts = {})        // no-op if not running. names:
     // 'whoosh' {power}, 'crinkle' {spawn:boolean}, 'clink' {speed}, 'thud' {speed}  (bin floor), 'floor' {speed, surface:'carpet'|'wood'},
     // 'surface' {speed, tag}, 'sting' {variant:'swish'|'rattle'|'bank'}, 'levelUp', 'win', 'tick', 'rimGlass' {speed}
  startAmbience('lumon' | 'beach'); stopAmbience(fadeMs = 600)
  setMuted(bool); get muted   // persists to localStorage['trashketball.muted'] in try/catch
  suspend(); resume()          // visibilitychange
}
```
Rate-limit identical clinks to one per 40 ms. Randomize pitch ±3% on physical sounds.

## 9. Levels (owners: level1, level2)

```js
export function createSeveranceLevel(ctx) -> Level
export function createBeachHouseLevel(ctx) -> Level
ctx = { scene, renderer, camera, isTouch: boolean, quality: 'high' | 'low' }
```
`createXLevel` builds everything synchronously (textures, meshes, lights), adds `level.group` to `ctx.scene`, applies
renderer/scene look settings (`renderer.toneMapping`, `toneMappingExposure`, `scene.background`, `scene.fog`,
`scene.environment` + `scene.environmentIntensity`), and returns:

```js
Level = {
  id: 'severance' | 'beach', theme: 'lumon' | 'beach', audioVariant: 'steel' | 'matte',
  group: THREE.Group,
  camera: { position: Vector3, lookAt: Vector3, fov: number /* vertical, landscape */, fovPortrait: number },
  bin: {                     // physics spec (§3) plus visual handles
    x, z, height, rOutTop, rOutBot, wall, floorThick, rimTube, materials: {...},
    group: THREE.Group,      // pivot at the base center (main.js rotates it for the wobble, and resets it)
    rimMesh: THREE.Mesh,     // its material.emissive is pulsed on a make (main.js restores it)
  },
  physics: { floor, boxes, cylinders, bounds },   // §3 levelPhysics; the bin entry is filled from `bin` by main.js
  previewFraction: 0.72,     // fraction of the predicted arc shown (L1 0.72, L2 0.60)
  arcColors: { near: 0xffffff, far: 0x8e949c }, trailColor: 0xfff4d6,
  hud: { eyebrow, name, lvl },
  copy: {                    // strings in the level's voice (Lumon corporate / luxury host); see design docs
    intro: string, aimHint: string, hints: string[],
    score: string[], bank: string[], rattle: string[], rimOut: string[], miss: string[],
    missByTag: { [tag]: string },          // e.g. desk, sofa, table, window, plant, ceiling
    streak: { 3: string, 5: string, 8: string }, milestone: { 50: string, 90: string },
    complete: { eyebrow, title, body, sub, button }, idle: string,
  },
  update(dt, elapsed, game)  // per-frame animations; game = { levelScore, throws, makes, missStreak, state }
  onEvent(name, payload)     // optional hooks for delights: 'scored', 'boxHit', 'rimHit', 'floorHit', 'levelComplete', 'missStreak'
  dispose()                  // disposeTree(group), dispose env/PMREM targets, reset scene.background/fog/environment to null
}
```

### 9.1 Fixed layout numbers

| | Level 1 (Lumon MDR) | Level 2 (beach house) |
| --- | --- | --- |
| camera position | (1.10, 1.60, −0.20) | (0.30, 1.60, 0.00) |
| camera lookAt | (0.75, 1.10, −4.40) | (1.15, 1.15, −4.30) |
| fov / fovPortrait | 66 / 80 | 64 / 78 |
| bin base center | (0.75, 0, −4.40) | (1.60, 0, −4.30) |
| bin geometry | H 0.32, rOutTop 0.150, rOutBot 0.120, wall 0.006, floorThick 0.008, rimTube 0.009 | H 0.32, rOutTop 0.150, rOutBot 0.110, wall 0.008, floorThick 0.010, rimTube 0.012 |
| bin materials (e / μ / roll) | wall 0.40/0.20/3.0, bottom 0.22/0.40/5.0, rim 0.45/0.15/3.0 | wall 0.30/0.30/4.0, bottom 0.18/0.35/5.0, rim 0.32/0.25/4.0 |
| floor (e / μ / roll) | carpet 0.30 / 0.45 / 4.0 | oak 0.45 / 0.30 / 1.5 |
| ceiling height | **2.90** (box collider tag 'ceiling', e 0.35) | 5.50 (tag 'ceiling') |
| room | x −7..7, z −5..11 per art doc | x −6..6, z −5..4 per art doc |
| bounds | minX −7.5, maxX 7.5, minZ −14, maxZ 12 | minX −6.5, maxX 6.5, minZ −9, maxZ 4.5 |

Everything else (props, palette, lights, textures, delights) follows `docs/design/02-*.md` / `03-*.md`. Colliders: every surface the ball
can plausibly hit gets an AABB (walls, desks/table, partitions, sofas, monitors, island, mullions, glass wall, ceiling), tagged for copy
selection. Level 1 tags: `wall`, `desk`, `partition`, `monitor`, `chair`, `door`, `ceiling`. Level 2 tags: `window`, `mullion`, `sofa`,
`velvet`, `table`, `island`, `wall`, `ceiling`, `plant` (cylinder). The bin itself is NOT a box collider (physics handles it).

### 9.2 Look and performance

- One shadow-casting `DirectionalLight` per level; RectAreaLights ≤ 3 (call `RectAreaLightUniformsLib.init()` once, guard against
  double init); point lights ≤ 4. Shadow map 2048 (1024 when `ctx.isTouch`). `castShadow` only on things that matter.
- Merge static same-material geometry where easy. Draw calls < 150, triangles < 350k. Static objects: `freezeStatic(group)` at the end.
- Textures via `makeCanvasTexture`; color maps `srgb: true`, data maps `srgb: false`. ≤ 12 textures per level, ≤ 1024² (oak floor may be 2048²).
- Never use `transmission`. Glass = thin tinted transparent plane, `depthWrite: false`.
- `dispose()` must free everything (`disposeTree`, PMREM targets, `scene.environment`) and leave `renderer.info.memory` at baseline.

## 10. `src/main.js` + `src/juice.js` (owner: main)

Owns the renderer, scene, camera, `world`, `DragInput`, `ArcPreview`, `FlightTrail`, `Hud`, `GameAudio`, the session, the state machine
(`docs/design/05-game-ux-spec.md` §1) and the level lifecycle. Key rules:

- Renderer: antialias, pixel ratio ≤ 2 (1.5 on touch), `SRGBColorSpace`, shadows `PCFSoftShadowMap`, `setSize(w, h, false)`,
  resize check at the top of every frame; camera fov = level fov (landscape) / fovPortrait (portrait).
- Fixed-step loop: accumulator at `FIXED_DT`, max 24 steps per frame, frame dt clamped to 0.1 s; interpolate ball meshes with `alpha`.
  Pause the loop when the tab is hidden; resume with dt = 0.
- **Hand and launch.** Each frame: `computeHandPosition(camera, handPos)`; while aiming, pull the hand ball back by
  `(0, -0.04, +0.05) * power` in camera space. The launch position is that same vector. Horizontal aim base
  `dirH = normalize(flattenY(binCenter - handPos))`; yaw rotates `dirH` about Y (positive = right = `dirH × up`);
  `elevation = 45°` for both levels; `v0 = speed * (cos(el) * dirYaw + sin(el) * up)`; backspin `w0 = normalize(right + 0.35 * randomUnit) * 18` rad/s.
- **Calibration.** After a level builds and after every resize: `vBin = world.solveSpeedForTarget(handPos, dirH, 45°, {x: bin.x, y: bin.height, z: bin.z})`;
  `vMin = max(2.5, vBin - 2.5)`, `vMax = vBin + 2.5`; `speed = speedFromPower(power, vMin, vMax)`. The bin sits at half pull.
- **Preview.** While aiming (not cancelled): `world.predict(handPos, v0, { stopOnContact: true })` then
  `arc.update(points, count, { fraction: assist ? 1 : (throws < 3 && level 1 ? 1 : level.previewFraction), power })`.
- **Ball lifecycle** (design doc 01 §5): several balls may fly; a fresh hand ball appears at the earliest of 0.5 s after `scored`,
  0.35 s after first contact, 1.5 s after launch. Sleeping balls persist as clutter: max 10 outside the bin, max 6 inside; oldest is
  `shrinkAndRemove`d and `world.removeBall`d. All balls cleared on level switch.
- **Classification** on `scored`: bank (any box/cylinder/outer contact) > rattle (rim/inner) > swish. On `rest`/`outOfBounds` unscored:
  rimOut (rim contact) else miss; miss copy prefers `copy.missByTag[lastTag]`. Streak, milestones (50, 90), stats, dots, popups
  (projected bin rim), `hud.say` lines picked round-robin without immediate repeats.
- **Feedback** (`src/juice.js`): FOV kick on release (+1.5°..2.5° over 60 ms, back over 160 ms), bin wobble on rim/wall/floor contact
  (damped sine, ≤ 6°, pivot = `level.bin.group`), rim emissive pulse on a make (restore original emissive after), bin squash on floor thud,
  reduced-motion switch disables kicks. Trail: `trail.push` each frame per flying ball (one trail, follows the most recent ball), `fadeOut` on resolve.
- **Levels and score.** 10 points per make; level complete at 100 (level score resets; totals kept). Level 1 → overlay
  (`copy.complete`) → `hud.fade` → dispose level 1, build level 2, recalibrate → play. Level 2 at 100 → win overlay with
  "Play again" (back to level 1, everything reset) and "Stay at the beach" (free play). Title overlay first (with `copy.intro`),
  audio unlocked on its button/first gesture. `Esc`/`P` pause, `M` mute, `R` reset ball (in flight = counts as a miss).
- Session persistence in localStorage is optional; if implemented, wrap in try/catch and never block boot.
- Error handling: if WebGL context creation fails, show a plain message in `#hud`.

## 11. Definition of done per agent

1. Files exist at the paths above, `node --check` passes, exports match this contract by name and signature.
2. No console errors at import time (no top-level DOM access outside constructors/functions, except `hud.js` which may touch `document`
   in its constructor only).
3. The agent's final message lists: files written, any deviation from this contract (and why), and any open risk for the integrator.
