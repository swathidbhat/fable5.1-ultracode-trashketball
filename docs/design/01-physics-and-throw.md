# Trashketball physics and throw-mechanics specification

All units SI (m, s, rad unless degrees are written). World: +Y up, floor at y = 0. Ball radius R = 0.04 m. Mass is never needed (all forces are expressed as accelerations).

Reference layout used for every number below (levels may move the bin within 3.5–4.5 m):

| Symbol | Value | Meaning |
|---|---|---|
| camPos | y = 1.50 | eye height, first person, camera fixed per level (no mouse-look) |
| origin | camPos + fwdH·0.35 + right·0.12 − up·0.20 | launch point (hand). y = 1.30 |
| D_bin | 4.00 | horizontal distance from **origin** to bin axis (camera-to-bin ≈ 4.35) |
| H | 0.30 | bin height, rim plane at y = 0.30 |
| g | 9.81 | gravity |
| k | 0.8 s⁻¹ | linear drag coefficient (section 2) |
| θ | 50° | launch elevation, fixed |

`fwdH` is the camera forward vector with y zeroed and renormalized; `right = fwdH × up`.

---

## 1. Throw input model

### 1.1 Recommended: displacement-based drag-to-throw ("flick up")

The throw is decided by **where the pointer is at release relative to where it went down**, never by pointer velocity. Reason: pointer velocity is sampled at 60–240 Hz depending on device and is unpreviewable; displacement is static while the player holds, so the predicted arc is exact and the player can correct before releasing. This is what makes the game skill-based instead of luck-based.

Pointer handling: `pointerdown` anywhere on the canvas → `setPointerCapture`, remember `(x0, y0)` and `pointerType`; track only that `pointerId` (ignore additional touches until release); `pointermove` updates the preview; `pointerup` throws; `pointercancel` cancels. Canvas CSS: `touch-action: none; user-select: none`.

Normalization scale: `S = min(viewportWidth, viewportHeight)` in CSS px. In landscape S equals the viewport height (the desktop case); in portrait it is the width, which keeps thumb travel sensible on phones (0.55·S ≈ 215 px ≈ 6 cm on a 390 px wide phone).

```
u = (x - x0) / S            // + = dragged right
v = (y0 - y) / S            // + = dragged UP (screen y grows downward)

V_DEAD = 0.03               // below this at release: cancel, ball stays in hand
V_FULL = 0.42 (mouse/pen)   // 0.55 for touch
p      = clamp((v - V_DEAD) / (V_FULL - V_DEAD), 0, 1)     // power 0..1, linear

speed  = V_MIN + (V_MAX - V_MIN) * p     // V_MIN = 4.5, V_MAX = 10.0  m/s
yaw    = clamp(K_YAW * u, -22°, +22°)    // K_YAW = 100° per unit of S
theta  = 50°                             // fixed
```

Rules:
- Power comes from the vertical component only; yaw from the horizontal component only (decoupled: dragging sideways never adds power).
- Dead zone: release with `v < V_DEAD` → cancel. Dragging below the start point (`v < -V_DEAD`) hides the preview; release there also cancels. A pointer-down shorter than 80 ms with `|d| < V_DEAD·S` is a tap and does nothing.
- No dead zone on yaw; yaw is continuous through 0.
- Elevation is fixed. Speed and yaw are the two degrees of freedom the 2D drag can give; a fixed 50° keeps the mapping one-to-one and makes the closed form in section 6 valid. (Optional tuning knob, off by default: `theta = 55° - 10°·p`, monotonic in range, gives flatter hard throws.)

Launch direction and velocity (yaw 0 must land on the camera's line of sight, not 0.12 m to the right of it):

```
aimPoint = camPos + fwdH * D_AIM               // D_AIM = 4.0 in every level
b        = normalize(flattenY(aimPoint - origin)) // horizontal base direction
bYaw     = rotateAboutY(b, yaw)                 // positive yaw = to the right
dir      = cos(theta) * bYaw + sin(theta) * (0,1,0)
v0       = speed * dir
```

Resulting ranges (k = 0.8, θ = 50°, y0 = 1.30, measured at rim height y = 0.30, from the integrator):

| speed | landing R | apex y | flight time |
|---|---|---|---|
| 4.5 (p=0) | 1.86 | 1.81 | 0.91 s |
| 6.0 | 2.77 | 2.16 | 1.07 s |
| 7.10 (bin at 3.5) | 3.50 | 2.46 | 1.19 s |
| 7.82 (bin at 4.0) | 4.00 | 2.68 | 1.26 s |
| 8.51 (bin at 4.5) | 4.50 | 2.90 | 1.34 s |
| 10.0 (p=1) | 5.62 | 3.42 | 1.5 s |

So a 3.5 m bin sits at p = 0.47, 4.0 m at p = 0.60, 4.5 m at p = 0.73. Recommended: level 1 bin at 3.7 m, level 2 at 4.3 m. Level 1 ceiling must be ≥ 3.0 m or over-throws (speed ≥ 8.9) hit it; that is acceptable physics, but model the ceiling as an AABB so they bounce rather than vanish.

Precision budget (why these gains). Range sensitivity at the 4 m bin is dR/dspeed = 0.71 m per m/s (drag lowers this from 1.39 without drag, which is one reason to keep drag). Swish window for the ball centre crossing the rim plane is ±0.094 m (r_in_top − R); with the rim helping it in, ±0.12 m.

| viewport | S | range per px | swish window (range) | lateral per px (at 4 m) | swish window (lateral) |
|---|---|---|---|---|---|
| 1280×720 mouse | 720 | 0.0139 m | ±6.8 px (±8.6 with rim) | 0.0097 m | ±9.7 px |
| 390×844 touch | 390 | 0.0192 m | ±4.9 px | 0.0179 m | ±5.3 px |

Roughly isotropic: on desktop 1 px ≈ 1–1.4 cm at the bin on both axes. Touch is ~1.5 mm of finger travel per window, which is tight, so on touch only, apply a transparent assist (the preview shows the assisted arc, so nothing is hidden):

```
vBin = speed that lands on the bin axis (precomputed per level by bisection with the integrator)
if pointerType == 'touch' and |speed - vBin| < 0.35:  speed += 0.30 * (vBin - speed)
```

Predicted arc (learnability): every frame during a drag, run the real integrator (section 2, same h, same colliders, `stopOnFirstContact = true`, max 3 s) from `(origin, v0)`. Draw the points for t ∈ [0, F·t_contact] with F = 0.72 in level 1, 0.60 in level 2, 1.0 for the first 3 throws of level 1; fade alpha to 0 over the last 15 % of the drawn segment. For the 4 m throw this shows the arc to x ≈ 3.0 m, y ≈ 2.0 m (past the apex, heading down) and leaves the last metre to the player. Sample every 4th substep (60 pts/s). Flight trail: ring buffer of positions sampled at 60 Hz for the last 0.40 s, alpha fading with age.

Camera note: the apex of a bin-reaching throw is 2.7 m high at ~2 m out, 30° above eye level. Use vertical FOV ≥ 70° with pitch about −5° so the whole arc is on screen.

### 1.2 Alternative: aim with pointer position, hold to charge

```
(xn, yn) = pointer NDC in [-1, 1]
yaw    = 18° * xn
theta  = 50° + 12° * yn
p(t)   = clamp(tHeld / 1.2 s, 0, 1)      // one-shot ramp, holds at 1 (no ping-pong)
speed  = 4.5 + 5.5 * p
```
Pointer-down starts the charge, release throws, arc previewed live. Recommendation: **use 1.1**. The charge scheme makes power a timing skill rather than an aiming skill; on touch there is no hover, so the first touch both aims and starts charging and the finger covers the aim point; absolute-position aiming changes meaning with screen size. Keep 1.2 behind `inputScheme: 'drag' | 'aimCharge'` if you want an accessibility option.

---

## 2. Integrator (single sphere)

Fixed step **h = 1/240 s**, accumulator loop:

```
frameDt = min(rawDt, 0.1); acc += frameDt
steps = 0
while acc >= h and steps < 24:  step(h); acc -= h; steps++
if steps == 24: acc = 0        // drop time rather than spiral
```
4 substeps per 60 Hz frame, 2 per 120 Hz frame. Render the latest state (interpolation is unnecessary at 240 Hz).

Per active (non-sleeping) ball per step, semi-implicit Euler with the drag term implicit (unconditionally stable, same cost):

```
v = (v + G*h) / (1 + k*h)      // G = (0, -9.81, 0), k = 0.8
pPrev = p
p += v*h
resolveCollisions(pPrev, p, v)   // section 3, two passes
clamp |v| <= 12
updateSpin(); updateSleep()
```

Drag coefficient justification. A crumpled A4 wad is about 5 g at radius 0.04 m. Quadratic drag with ρ = 1.2, Cd ≈ 0.6, A = 5.0e-3 m² gives terminal speed √(2mg/(ρCdA)) ≈ 5.2 m/s and a deceleration of ~14 m/s² at 6 m/s, i.e. k_eff ≈ 1.6 s⁻¹ (a tighter two-sheet wad: ≈ 1.0 s⁻¹). Full physical drag pushes the required launch speed to ~9.5 m/s and steepens the input range, so we use **k = 0.8 s⁻¹**, about 60 % of the loose-wad value: deceleration 4.8 m/s² at 6 m/s, terminal speed g/k = 12.3 m/s, visibly asymmetric arc (72° descent for a 50° launch), and dR/dv reduced by half versus vacuum, which makes throws more forgiving. Linear (not quadratic) drag is chosen because it keeps the ground track a straight line under yaw and gives the closed form in section 6.

Measured integrator bias (free flight, speed 7.816, θ 50°, target 4.000 m): h = 1/60 → −3.4 cm, 1/120 → −1.7 cm, **1/240 → −0.8 cm**, 1/480 → −0.4 cm. Below the ±9 cm window and irrelevant to fairness since the preview uses the same integrator. If you want the sanity check to match to <0.1 mm, swap the velocity/position update for the exact exponential step (drop-in, identical interface):

```
a = exp(-k*h);  vT = G/k
pNew = p + (v - vT)*(1 - a)/k + vT*h
vNew = vT + (v - vT)*a
```

Spin (visual only, no Magnus):
- Launch: ω = 18 rad/s · normalize(right + 0.35·randomUnitVector) (end-over-end tumble).
- In flight: ω *= exp(−0.8·h).
- Any contact with normal n: ω = (n × v)/R (rolling without slipping; on a floor with v = +x this gives ω about −z, top of ball moving forward). Cap |ω| ≤ 60 rad/s.
- Orientation: q = quatFromAxisAngle(ω/|ω|, |ω|·h) · q, normalize each step (or `mesh.rotateOnWorldAxis`).

Sleep:
- `if contactThisStep and |v| < 0.06: sleepTimer += h else sleepTimer = 0`; sleep when `sleepTimer >= 0.40 s`.
- Fallback for jitter: `hadAnyContact and |v| < 0.30` continuously for 3.0 s → sleep.
- Hard cap: 8.0 s after launch → sleep (or retire if airborne / out of bounds: y < −1 or |xz| > 20).
- Sleeping: v = ω = 0, removed from the active list, becomes a static sphere collider (section 3.5). Never wakes.
No false sleep on slopes: the rolling-resistance model (3.6) has equilibrium speed g·sinα/c_roll ≥ 0.3 m/s on the 5.7° bin wall and far more on the rim, both above the 0.06 threshold, so a ball balanced on a tilted surface keeps moving until it finds a flat one.

---

## 3. Collisions

Each contact yields a unit normal n (pointing out of the surface, toward the ball) and penetration depth d > 0. Resolve in the order: floor, AABBs, bin (rim, wall, bottom), static spent balls; run the whole list **twice** per step so corner cases (floor + bin outer wall, bin bottom + inner wall) settle.

### 3.1 Floor (infinite plane y = 0)
`if p.y < R: n = (0,1,0); d = R − p.y`.

### 3.2 World-space AABB (min, max)
Pad every box to a thickness ≥ 0.05 m on each axis (desktops: extend downward).
```
q = clamp(p, min, max); δ = p − q
if |δ| > 0:                       // centre outside the box
    if |δ| < R: n = δ/|δ|, d = R − |δ|
else:                             // centre inside the box: pick the face it entered through
    for each axis a where pPrev[a] < min[a] or pPrev[a] > max[a]:
        plane = (pPrev[a] < min[a]) ? min[a] : max[a]
        tEntry_a = (plane − pPrev[a]) / (p[a] − pPrev[a])
    choose axis with the LARGEST tEntry (last slab crossed = entry face); if no axis qualifies, choose the face with the smallest penetration
    n = ±unit(axis) toward pPrev's side; d = R + |p[a] − plane|
```
Faces of desks, sofas, walls, ceiling all use this.

### 3.3 Bin (surface of revolution; all math in the 2D cross-section (ρ, y))

Geometry (level 1, metal bin): H = 0.30, r_out_top = 0.140, r_out_bot = 0.110, wall t_w = 0.006 (so r_in_top = 0.134, r_in_bot = 0.104), floor thickness t_b = 0.008 (inner floor at y = 0.008), rim torus centre (r_mid_top = 0.137, H) with tube radius r_t = 0.008. Level 2 (rattan basket): H = 0.32, r_out_top = 0.165, r_out_bot = 0.125, t_w = 0.012, t_b = 0.015, r_t = 0.010. Bin axis at (c.x, c.z), base on the floor.

```
ρ   = sqrt((p.x−c.x)² + (p.z−c.z)²)
u_r = ρ > 1e-6 ? ((p.x−c.x)/ρ, 0, (p.z−c.z)/ρ) : (1,0,0)
q   = (ρ, p.y)
```
Side flag per ball (persistent):
```
if p.y > H + R:                 side = ABOVE
else if side == ABOVE:          side = (ρ < r_mid_top) ? INSIDE : OUTSIDE   // decided once on the way down
// otherwise keep the previous value
```
Tests by side: ABOVE → rim only. INSIDE → rim, inner wall, bottom cap. OUTSIDE → rim, outer wall. Because the ball radius (0.04) exceeds the maximum per-step displacement (10 m/s / 240 = 0.042 m ≈ R, and the torus keeps the centre ≥ 0.0265 m off r_mid when it drops below H + R), the flag is always settled before a wall test can be ambiguous.

Rim (torus): `δ = q − (r_mid_top, H); dist = |δ|; if dist < r_t + R: d = r_t + R − dist; n2 = δ/dist` (if dist < 1e-6, n2 = (0,1)).

Walls (line segments A→B with a designated normal, so a centre that lands inside the 6 mm of material is still pushed to the correct side):
```
inner: A = (r_in_bot, t_b), B = (r_in_top, H);  e = (B−A)/L;  n2 = (−e.y, +e.x)  // toward axis, tilted up
outer: A = (r_out_bot, 0),  B = (r_out_top, H); e = (B−A)/L;  n2 = (+e.y, −e.x)  // away from axis, tilted down
t = clamp(dot(q−A, e)/L, 0, 1)
if 0 < t < 1:  s = dot(q−A, n2);  if s < R: d = R − s          // signed line distance, may be negative
else:          P = (t==0)?A:B; δ = q−P; if |δ| < R: d = R−|δ|; n2 = δ/|δ|
```
Bottom cap (INSIDE only): `if ρ ≤ r_in_bot and p.y − t_b < R: d = R − (p.y − t_b); n2 = (0,1)`.

Lift the 2D normal to 3D: `n = (n2.ρ · u_r.x, n2.y, n2.ρ · u_r.z)`.

### 3.4 Tunneling guarantee at 10 m/s
Max step displacement 10/240 = 0.042 m. Every collider's Minkowski-inflated thickness (geometry thickness + 2R): bin wall 0.006 + 0.08 = 0.086; rim 2·(0.008 + 0.04) = 0.096; thinnest AABB 0.05 + 0.08 = 0.13; floor infinite. All ≥ 2× the step, so a centre can never jump from one side of a collider to the other in one step; there is always a step where it sits inside the inflated volume and the side rule (pPrev for AABBs, the side flag for the bin) picks the correct face. No sweeps are needed. If V_MAX is ever raised above 12 m/s, drop h to 1/480.

### 3.5 Static spent balls (sleeping balls)
`δ = p − p_i; if |δ| < 2R: n = δ/|δ|; d = 2R − |δ|`. Test only sleeping balls (≤ 16). This is what makes scored balls stack inside the bin instead of overlapping.

### 3.6 Contact response (per contact, per unit mass)
```
p  += n * d                                   // positional projection, no slop
vn  = dot(v, n)
if vn < 0:
    if −vn > V_BOUNCE (0.45 m/s):             // impact
        jn = −(1 + e) * vn;  v += n * jn
        vt = v − n*dot(v,n)
        if |vt| > 1e-6: v −= (vt/|vt|) * min(μ * jn, |vt|)      // Coulomb friction impulse
        emit contact event (surface, |vn|)
    else:                                     // resting contact
        v −= n * vn
        vt = v − n*dot(v,n);  v = n*dot(v,n) + vt * exp(−c_roll * h)
    contactThisStep = true; lastNormal = n
```

| Surface | e | μ | c_roll (s⁻¹) |
|---|---|---|---|
| Floor L1 (carpet) | 0.30 | 0.45 | 4.0 |
| Floor L2 (stone/oak) | 0.45 | 0.30 | 1.5 |
| Desks, shelves (wood/laminate) | 0.40 | 0.30 | 2.5 |
| Walls, ceiling | 0.35 | 0.30 | 2.5 |
| Sofas L2 (fabric) | 0.12 | 0.60 | 6.0 |
| Bin L1 inner wall / outer wall | 0.40 / 0.40 | 0.20 | 3.0 |
| Bin L1 bottom | 0.22 | 0.40 | 5.0 |
| Bin L1 rim | 0.45 | 0.15 | 3.0 |
| Basket L2 inner / outer / bottom / rim | 0.25 / 0.30 / 0.18 / 0.30 | 0.35 | 4.0 |
| Spent balls | 0.30 | 0.30 | 3.0 |

Feel check: a 6 m/s floor hit at e = 0.30 rebounds at 1.8 m/s (16 cm), then 0.54 m/s, then below V_BOUNCE, so three bounces and rest within ~0.7 s. A max-power throw reaching the bin floor arrives at 6.3 m/s vertical, rebounds at 1.58 m/s and rises 0.127 m: it cannot bounce back out over a 0.30 m rim.

---

## 4. Scoring and feedback events

Inner radius at height y: `r_in(y) = r_in_bot + (r_in_top − r_in_bot)·(y − t_b)/(H − t_b)`.

In-region predicate, evaluated once per frame for every non-scored ball:
```
IN := (t_b < p.y < H − R) and (ρ < r_in(p.y) − 0.5 R)
```
For level 1: p.y < 0.26 and ρ < 0.110 at that height.

Score when `!scored` and any of:
1. `IN` has held continuously for ≥ 0.30 s (timer resets the frame IN is false), or
2. `IN and p.y < 0.5 H` (deep in the cup: instant feedback for a swish; a ball this deep cannot leave, see 3.6), or
3. `IN and sleeping`.

Then set `scored = true` permanently (no double count, even if the ball is later nudged by another ball), add 10, emit `score`.

Why it cannot false-positive: a ball beside the bin has ρ ≥ r_out(y) + R ≥ 0.15 > 0.110 even with a 1 cm penetration bug; a ball balanced on the rim has p.y ≈ H + 0.048 > 0.26; a ball that dips in and rattles out fails the 0.30 s hold and never gets below 0.5 H. Rattle-ins score via rule 1 or 3.

Per-ball flags collected from contact events since launch: `hitRim`, `hitInner`, `hitOuter`, `hitAABB`, `hitFloor`, `enteredIN`. Derived events for the HUD and audio:

| Event | Condition |
|---|---|
| `rim` | contact with the torus (sound volume = clamp(|vn|/6, 0.05, 1)) |
| `backboard` | contact with any AABB or the bin outer wall before scoring |
| `swish` | score with no rim / inner / AABB / outer contact before it |
| `rattle_in` | score after `hitRim` or `hitInner` |
| `bank` | score after `hitAABB` or `hitOuter` |
| `rattle_out` | `enteredIN` then IN false and ball sleeps without scoring |
| `airball` | sleeps with none of the bin flags set |
| `miss` | sleeps (or retires) unscored, generic |

---

## 5. Ball recycle rules

Per-ball state: `HELD → FLYING → (SCORED | RESTING) → RETIRED`. Multiple balls may be simulated at once (cap 4 active; throwing a 5th force-sleeps the oldest active one).

A new ball is placed in the hand at the earliest of:
- 0.50 s after `score`;
- 0.35 s after the ball's first contact with anything;
- 1.50 s after launch (covers every flight, which lasts 0.9–1.5 s);
- immediately if the ball leaves bounds.
If the pointer is already down when the new ball arrives, start the drag from the pointer's current position (queued throw); otherwise pointer-down is ignored while the hand is empty.

Decoration: sleeping balls stay as static colliders. Keep at most 10 sleeping balls on floor/furniture and 6 inside the bin (6 balls fill ~20 % of the bin's height, so the scoring predicate is unaffected). When a cap is exceeded, retire the oldest of that group: shrink to 0 over 0.40 s, then remove it from the collider list. Clear everything on level transition.

---

## 6. Closed-form sanity check: 4 m bin, 0.30 m rim, k = 0.8, θ = 50°

Linear drag has the closed-form trajectory (v_x0 = v0 cosθ, v_y0 = v0 sinθ):
```
x(t) = (v_x0 / k) (1 − e^{−kt})
y(t) = y0 + (1/k)(v_y0 + g/k)(1 − e^{−kt}) − (g/k) t
```
Eliminating t at horizontal distance x = R (requires v_x0 > kR, i.e. v0 > 3.2/cos50° = 4.98 m/s for R = 4):
```
t_R   = −ln(1 − kR / v_x0) / k
y(R)  = y0 + (v_y0 + g/k) (R / v_x0) + (g / k²) ln(1 − kR / v_x0)
```
Solve y(R) = 0.30 for v0 with y0 = 1.30, R = 4.00 by Newton, starting from the vacuum solution v0² = gR² / (2cos²θ (R tanθ − Δy)) = 9.81·16 / (2·0.4132·(4.767 + 1.0)) → 5.74 m/s (raised to 5.74 since it must exceed 4.98):

| iter | v0 | y(R) − 0.30 | dy/dv0 | next v0 |
|---|---|---|---|---|
| 0 | 5.739 | −11.91 m | 15.16 | 6.525 |
| 1 | 6.525 | −4.606 | 5.77 | 7.323 |
| 2 | 7.323 | −1.270 | 3.02 | 7.743 |
| 3 | 7.743 | −0.164 | 2.29 | 7.814 |
| 4 | 7.814 | −0.004 | 2.19 | 7.816 |

**Answer: v0 = 7.816 m/s** (v_x0 = 5.024, v_y0 = 5.987). Then t_R = −ln(1 − 3.2/5.024)/0.8 = 1.264 s, apex 2.68 m at t = 0.50 s, descent angle at the rim 72°, speed at the rim 5.92 m/s. Check by substitution: 1.30 + (5.987 + 12.2625)(0.7962) + 15.328·ln(0.3630) = 1.30 + 14.530 − 15.530 = 0.300.

Note the small-k series y ≈ y0 + R tanθ − gR²/(2v_x0²) − kgR³/(3v_x0³) − … does not converge here (kR/v_x0 = 0.64), so use the exact log form, not the series.

Implementer checks (run the integrator with no colliders, launch (0, 1.30, 0) at v0 = 7.816 along +x at 50°, record where y crosses 0.30 on the way down):
- h = 1/240, semi-implicit Euler with implicit drag: x = 3.992 m (−0.8 cm), t = 1.264 s. Pass if within 3.99–4.01.
- Same with k → 0 and v0 = 5.756: x = 4.007 m, t = 1.083 s (isolates gravity/timestep from drag).
- Exact exponential step: x = 4.000 ± 0.001.
- Speed sensitivity: v0 ± 0.1 → 3.929 / 4.071 m (dR/dv = 0.71 m per m/s).
- Bins at 3.5 / 4.5 m need 7.099 / 8.510 m/s.

Relation to the input mapping: 7.816 m/s corresponds to p = (7.816 − 4.5)/5.5 = 0.603, i.e. a 60 % of full-drag pull (0.03 + 0.603·0.39 = 0.265·S ≈ 191 px on a 720 px tall viewport). A pull 7 px shorter or longer misses the swish window at the front or back edge.