# Trashketball: Game UX Spec (feel, feedback, flow)

Scope: state machine, HUD, feedback and audio, level transition, accessibility and controls, difficulty knobs. Module names refer to the planned layout. Two additions are proposed: `src/audio.js` (WebAudio synthesis) and `src/juice.js` (camera kick, bin wobble, popups, trail fades). Both are optional; the logic can live in `hud.js` and `main.js` if you prefer.

Conventions: all times in ms unless marked `s`. All world units in meters. Copy strings are quoted and final. No em-dashes anywhere in user-visible text.

---

## 0. Feel principles (the rules everything below follows)

1. **What you see is what flies.** The aim preview runs the real integrator (`physics.step`) on a scratch ball. Same dt, same drag, same collisions. Difficulty comes from how much of the arc you are shown and how far the bin is, never from hidden variance.
2. **Position, not timing.** Release velocity comes from the pointer position at `pointerup`, not from flick velocity. Nobody loses a throw to a laggy frame.
3. **Bin at half pull.** The power mapping is auto-calibrated per level so the bin's center sits at exactly 50% of the drag range. The natural pull is the right pull.
4. **Misses are quiet, makes are loud.** A miss gets a paper-on-carpet sound and, at most, a one-line hint. A make gets a seven-layer stack (Section 3.1). The game never scolds.
5. **The camera never moves while you aim.** No bob, no sway. Kicks only happen after release.
6. **Nothing lasts longer than it has to.** Every feedback beat can be skipped by starting the next throw.

---

## 1. Game state machine (`src/main.js`)

### 1.1 States

| State | Meaning | Ball | Input accepted |
|---|---|---|---|
| `BOOT` | Building scene, generating textures | none | none |
| `TITLE` | Title and instructions overlay over the live L1 scene | none | button, Enter, Space, tap |
| `READY` | Ball in hand, idle | in hand | pointerdown, keyboard aim, R, Esc, M |
| `AIMING` | Drag in progress, arc preview live | in hand, pulled back | pointermove, pointerup, pointercancel, Esc |
| `FLIGHT` | Ball simulating, trail live | flying | Esc, R, (pointerdown ignored unless `quickRearm`) |
| `RESOLVED` | Make or miss feedback playing | settling | pointerdown skips after min hold |
| `NEXT_BALL` | New ball spawns into the hand | spawning | none (220 ms) |
| `LEVEL_COMPLETE` | Overlay at 100 points on level 1 | none | button after 1200 ms |
| `TRANSITION` | Fade sequence between levels | none | none |
| `WIN` | Overlay at 100 points on level 2 | none | buttons |
| `PAUSED` | Tab hidden or Esc/P | frozen | click, key |

Store `prevState` on entering `PAUSED`.

### 1.2 Transitions and timings

| From | To | Trigger | Timing |
|---|---|---|---|
| `BOOT` | `TITLE` | Level 1 built | Title overlay fades in 400 |
| `TITLE` | `NEXT_BALL` | "Clock in" click, Enter, Space, or tap | Overlay out 350 (opacity + translateY 0 to 8px). Ball spawn starts at 150 (overlaps). Audio unlock happens here (Section 3.7) |
| `NEXT_BALL` | `READY` | timer | 220 (ball scale 0 to 1, `easeOutBack`, plus crinkle sound at 0) |
| `READY` | `AIMING` | primary `pointerdown` on canvas and drag past 12 px deadzone | Immediate. Crinkle squeeze plays at pointerdown, arc appears once past deadzone |
| `AIMING` | `READY` | `pointerup` with power < 0.05, `pointercancel`, `lostpointercapture`, window `blur`, Esc | Ball eases back to hand pose 150. No throw counted. Arc hides in 80 |
| `AIMING` | `FLIGHT` | `pointerup` with power >= 0.05 | 0 delay. Whoosh, FOV kick (200 total), arc hides in 80, trail begins |
| `FLIGHT` | `RESOLVED` | make or miss rule (1.3) | Immediate |
| `RESOLVED` | `NEXT_BALL` | timer | Make: 700. Miss: 350. Rim out: 500. Pointerdown after 150 ends it early |
| `NEXT_BALL` | `LEVEL_COMPLETE` | `level.score >= 100` and `levelIndex == 0` | Wait 900 after the make (full feedback), then overlay in 400. Button enabled at +1200 from overlay start |
| `LEVEL_COMPLETE` | `TRANSITION` | "Take the vacation" | Section 4.2, about 2100 to `READY` |
| `TRANSITION` | `NEXT_BALL` | sequence end | as scheduled |
| `NEXT_BALL` | `WIN` | `level.score >= 100` and `levelIndex == 1` | Same as `LEVEL_COMPLETE` timing |
| `WIN` | `TRANSITION` | "Play again" | Dark-teal fade to level 1, then `TITLE` skipped, straight to `NEXT_BALL` |
| `WIN` | `NEXT_BALL` | "Stay at the beach" | Overlay out 350, free play in L2, score keeps counting past 100 |
| any except `BOOT`/`TRANSITION` | `PAUSED` | `visibilitychange` hidden, Esc, P | Immediate. If from `AIMING`, cancel the drag first (ball back to hand, no throw). Suspend AudioContext |
| `PAUSED` | `prevState` | click, any key, only while `document.visibilityState == 'visible'` | Overlay out 200. Reset `lastTime` so the first frame gets dt = 0. If `prevState` was `AIMING`, resume to `READY` |
| `TRANSITION` | `PAUSED` | tab hidden | Finish the fade instantly (jump to end state), then pause |

Notes:
- **Time step.** Fixed physics step 1/120 s with an accumulator; max 6 substeps per frame; clamp frame dt to 100 ms. On resume from pause set dt = 0 for one frame.
- **`quickRearm` (knob, default off).** When on, the hand receives a new ball `rearmAfterMs` (900) after release even if the previous ball is unresolved. The old ball keeps simulating and can still score late. Up to 3 live balls. Turn this on if playtests say the pacing drags.
- **Flight timeout.** A ball unresolved after 5000 ms becomes a miss (covers a ball balanced on the rim). At 4000 ms the HUD shows "Ball stuck? Press R."

### 1.3 Resolve rules (`src/physics.js` emits, `main.js` decides)

Make: ball center crosses the **score plane** moving downward. Score plane = disc at `rimY - 0.10`, radius `innerRadius - 0.5 * ballRadius`, inside the bin cylinder. Ball is flagged `dead` (no double scoring, trail stops). Made balls settle for 600, then become kinematic and ease (150) into one of 10 pre-baked slots on the bin floor (spiral pattern, slight tilt each). The bin visibly fills as the level progresses.

Miss: first of
- any floor contact outside the bin cylinder (a paper ball on the floor cannot come back),
- ball leaves bounds (`|x| > 6`, `z < -8`, `z > 1`),
- ball at rest (speed < 0.05 m/s for 400) on any surface other than the bin floor,
- 5000 flight timeout.

Missed balls stay on the floor as clutter (sleep on rest). Cap 12; the oldest scales to 0 over 300 and is recycled.

Classification uses a per-ball contact log `{rim, binWall, binFloor, floor, box:[surfaceTag]}`:

| Result | Rule | Label |
|---|---|---|
| `swish` | make, `rim == 0` and `binWall == 0` before the score plane | "Swish" |
| `rattle` | make, `rim + binWall >= 1` before the score plane | "Rattled in" |
| `bank` | make, any `box` contact before the score plane (takes priority over the two above) | "Bank shot", or "Off the glass" when the tag is `window` |
| `rimout` | miss, `rim >= 1` | "Rim out" |
| `miss` | miss, no bin contact | none, or a directional hint (3.3) |

All makes score 10. No bonus points; 100 must equal ten makes so the dot row stays honest.

---

## 2. HUD (`src/hud.js`, DOM overlay)

### 2.1 Structure

```html
<div id="hud" class="theme-lumon" data-input="pointer">
  <div id="hud-level">
    <span class="eyebrow">Lumon Industries</span>
    <span class="name">Macrodata Refinement</span>
    <span class="lvl">Level 1 of 2</span>
  </div>
  <div id="hud-score">
    <span class="label">Score</span>
    <span class="value" id="score">0</span>
    <div id="dots" aria-hidden="true"><i></i>×10</div>
    <span id="streak" hidden>×3</span>
  </div>
  <div id="hud-stats"><span id="throws">0 throws</span><span id="acc"></span></div>
  <div id="hud-hint">Drag back to aim. Release to throw.</div>
  <div id="hud-meter" hidden><!-- ring svg or bar --></div>
  <div id="hud-stuck" hidden>Ball stuck? Press R.</div>
  <button id="hud-sound" aria-pressed="true">Sound on</button>
  <div id="popups"></div>
  <div id="live" class="sr-only" aria-live="polite"></div>
  <div id="overlay" hidden role="dialog" aria-modal="true"></div>
  <div id="fade"></div>
</div>
```

`#hud` is `position:fixed; inset:0; pointer-events:none`. Only `button`, overlay contents, and `#hud-sound` set `pointer-events:auto`.

### 2.2 Layout and sizes

| Element | Position | Size and type |
|---|---|---|
| `#hud-level` | `top: calc(20px + env(safe-area-inset-top)); left: 20px` | eyebrow 11px uppercase, `letter-spacing: .18em`; name 15px; lvl 12px muted. Line gap 4px |
| `#hud-score` | `top: 20px; right: 20px; text-align: right` | label 11px uppercase; value 40px line-height 1, `font-variant-numeric: tabular-nums lining-nums`; dots `margin-top: 8px` |
| `#dots i` | flex row, `gap: 6px`, `justify-content: flex-end` | 10 × 10 px, `border: 1.5px solid var(--hud-accent)`, `border-radius: 50%` (L1) / `2px` rotated 45deg diamond (L2 uses `border-radius: 1px; transform: rotate(45deg); width: 8px; height: 8px`) |
| `#streak` | inline after value, `margin-left: 8px` | 13px pill, `padding: 2px 8px`, border 1px accent, radius 999px |
| `#hud-stats` | `bottom: calc(16px + env(safe-area-inset-bottom)); left: 20px` | 12px data font, muted. Format "7 throws · 4 made · 57%". Before the first throw: "0 throws" only |
| `#hud-hint` | `bottom: 36px; left: 50%; transform: translateX(-50%)` | L1: 13px uppercase, `letter-spacing: .14em`. L2: 15px italic serif. `padding: 8px 14px; background: var(--hud-bg); border: 1px solid var(--hud-border); border-radius: var(--radius)` |
| `#hud-meter` (ring) | absolute at drag origin, `translate(-50%,-50%)` | 56 px SVG circle, `stroke-width: 3`, track `rgba(ink, .2)`, fill accent, `stroke-dasharray` drives fill clockwise from top |
| `#hud-meter` (bar, keyboard mode) | `bottom: 88px; left: 50%` | 180 × 6 px, radius 3px, same colors |
| `#hud-sound` | `bottom: 16px; right: 20px` | 11px uppercase button, 44 px min height, transparent, border 1px `var(--hud-border)` |
| `.popup` | absolute at projected bin rim | "+10" 28px weight 500 data font; label 12px uppercase under it, `margin-top: 2px` |
| `#overlay .panel` | centered | `width: min(440px, calc(100vw - 40px)); padding: 36px 40px; border: 1px solid var(--hud-border); border-radius: var(--radius); background: var(--panel-bg); backdrop-filter: blur(6px)` |
| buttons | | `min-height: 44px; padding: 0 22px`. L1: 13px uppercase `.12em`, transparent, border 1px accent, hover fills accent with dark ink. L2: serif 17px, `background: #2B2521; color: #FAF6EE; border-radius: 999px` |

Breakpoint `max-width: 600px`: score value 32px, `.name` hidden, stats move to `right: 20px; left: auto`, hint 12px, overlay padding 28px 24px.

All text has `text-shadow: 0 1px 2px rgba(0,0,0,.25)` in L1 only (helps over the bright office). L2 uses none; the ivory panel does the work.

### 2.3 Theme tokens

Google Fonts (single request): `https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Cormorant+Garamond:ital,wght@0,500;1,400&display=swap`. System sans does the rest.

```css
#hud.theme-lumon {
  --hud-bg: rgba(8, 30, 40, .66);
  --panel-bg: rgba(6, 27, 36, .90);
  --hud-ink: #E4F0EE;
  --hud-muted: rgba(228, 240, 238, .62);
  --hud-accent: #7FE0CC;      /* mint, makes */
  --hud-accent-2: #5FB4E6;    /* blue, decoration */
  --hud-warn: #F2B65A;        /* amber, rim out / cancel */
  --hud-border: rgba(127, 224, 204, .35);
  --font-ui: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-data: "IBM Plex Mono", ui-monospace, Menlo, monospace;
  --font-display: var(--font-ui);
  --radius: 2px;
}
#hud.theme-beach {
  --hud-bg: rgba(250, 246, 238, .78);
  --panel-bg: rgba(250, 246, 238, .92);
  --hud-ink: #2B2521;
  --hud-muted: rgba(43, 37, 33, .60);
  --hud-accent: #2E7D8C;      /* sea teal, makes */
  --hud-accent-2: #B98A5A;    /* sand brass, borders */
  --hud-warn: #C4562F;        /* terracotta */
  --hud-border: rgba(185, 138, 90, .45);
  --font-ui: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-data: "Cormorant Garamond", Georgia, serif;
  --font-display: "Cormorant Garamond", Georgia, serif;
  --radius: 10px;
}
```

L1 headings are uppercase tracked sans (1970s corporate memo). L2 headings are the serif at weight 500, sentence case, `letter-spacing: -.01em`; score value 44px in the serif with `font-variant-numeric: lining-nums tabular-nums`. Contrast: L1 ink on panel composite ~9:1; L2 ink on ivory ~12:1; L2 teal on ivory ~4.6:1 (used at 13px+ only).

Theme switch: swap the class on `#hud`; every token-driven property transitions `color .4s, background-color .4s, border-color .4s` so the HUD recolors during the fade.

### 2.4 Behaviors

- **Score count-up.** On make, tween the number 300 with `easeOutCubic`, `tabular-nums` so width does not jump.
- **Dots.** Dot `n` fills on the nth make: `transform: scale(1) → 1.45 → 1` over 300 (`cubic-bezier(.2,1.6,.4,1)`), background to accent. The 10th dot scales to 1.8 and the row flashes `filter: brightness(1.4)` for 200 before the overlay.
- **Stats.** Updates on resolve. Accuracy = makes / throws, rounded. A cancelled drag is not a throw. `R` during flight counts as a miss.
- **Aim hint.** Visible in `READY` until the first release, then `opacity 1 → 0` over 400. Reappears (fade in 400) after 20 s of `READY` with no pointerdown. Copy per input mode: pointer "Drag back to aim. Release to throw."; touch "Drag down to aim. Let go to throw."; keyboard "Arrows aim. Hold Space to throw."
- **Streak pill.** Appears at 3 consecutive makes, updates each make, hides on a miss (fade 200). At 5 and 10 the pill text is replaced for 1200 by copy: L1 "Five straight." / "Flawless refinement."; L2 "Hot hand." / "Ten for ten."
- **`aria-live`.** On resolve, set text: "Score 40. Swish." / "Miss. A little short." / "Level complete." Throttle to one update per resolve.

### 2.5 Power meter: verdict

**Default: no meter on desktop.** The arc already encodes power (length and apex) and direction, and it is drawn where the player is looking (the bin). A second gauge pulls the eye away from the target. Power is still legible during a drag through three cues that live on the arc and cursor:
1. Arc dot color ramps from `--hud-muted` at 0% to `--hud-accent` at 100% pull (in-world, Section 3.4).
2. A thin 1px pull line from the drag origin to the pointer, with a tick mark at the 50% (bin) and 100% distances. Drawn in the DOM at `rgba(ink,.5)`.
3. Ball pull-back: the hand ball moves 0.05 m toward the camera and 0.04 m down at full pull.

**Meter shown when the input has no spatial analog:** the ring meter on touch (finger occludes the pull line) and the bar meter in keyboard mode. Knob `hud.meter: 'auto' | 'always' | 'off'`.

---

## 3. Feedback moments

### 3.1 The make stack (timeline from the score-plane crossing at t = 0)

| t | Layer | Implementation |
|---|---|---|
| 0 | Score sting (3.7) | `audio.play('sting', {variant})` |
| 0 | Rim glow | Bin rim material `emissive` from 0 to accent at intensity 0.6, then to 0 over 250 (`easeOutQuad`). L1 mint, L2 warm ivory `#F5E6C8` |
| 0 | Bin wobble | Section 3.5, amplitude 2° for swish, 4° for rattle (already running if a rim hit started it) |
| 40 | "+10" popup | Section 3.3 |
| 60 | Dot fill, score count-up | Section 2.4 |
| 80 to 250 | Bin thud (physics-driven) | On `binFloorHit` event, `audio.play('thud')`, plus bin squash `scale.y 0.97 → 1` over 120 |
| 0 to 300 | Trail fade | Trail alpha 1 → 0 over 300, then freed |
| 700 | Next ball | `RESOLVED → NEXT_BALL` |

Haptics (touch only): `navigator.vibrate?.(15)` on make, `8` on grab. Knob `haptics: true`.

### 3.2 Per-result feedback

| Result | Sound | Visual | HUD |
|---|---|---|---|
| Swish | sting (3 notes) + soft thud | rim glow, wobble 2° | "+10" with "Swish". Live: "Swish." |
| Rattled in | clink per rim hit + sting (2 notes) + thud | wobble 4° from first rim hit, glow at score | "+10" with "Rattled in" |
| Bank shot | box surface sound + sting (3 notes) + thud | surface flash: box material emissive 0.15 for 120 (L2 window: a 1px white edge highlight instead) | "+10" with "Bank shot" or "Off the glass" |
| Rim out | clink(s) then carpet thud | wobble 4°, no glow | amber "Rim out" popup, no number, 600 |
| Miss | carpet or desk thud | nothing | optional hint (3.3) |
| Cancelled drag | none | ball eases back 150 | hint "Release to cancel" shown while power < 0.05 during a drag |

### 3.3 Floating popups

- Spawn at the bin rim center projected to screen (`Vector3.project(camera)` once at spawn; not tracked afterward). For miss hints spawn at the landing point projected.
- Animation 800: `opacity 0 → 1` over 80, hold, `→ 0` from 500; `transform: translate(-50%,-50%) translateY(0 → -48px)` with `easeOutCubic`. `will-change: transform, opacity`. Pool 6 elements.
- "+10" in accent, label in ink at `--hud-muted`.
- **Miss hints.** Compare the landing point to the bin center; pick the larger axis error. Copy: "A little short." / "A little long." / "Just left." / "Just right." If the error is under 0.12 m on both axes, use "So close." Shown in muted ink for 900. Knob `missHints: 'always' | 'after2' | 'off'`, default `'always'` in L1, `'after2'` (two consecutive misses) in L2.

### 3.4 Aim arc and flight trail (`src/trajectory.js`)

- **Preview.** On every `pointermove` (throttled to one physics preview per animation frame), copy the hand ball into a scratch ball and step it with `physics.step` for `previewTime` seconds (L1 0.65 s, L2 0.45 s) or until a bin, box, or floor contact. Sample one position every 1/60 s into a `THREE.Points` buffer (max 120 points), `size: 5` px, `sizeAttenuation: false`. Per-vertex color interpolates from the power color (2.5) to the scene's background color over the last 35% of the shown arc so the end fades instead of stopping. Dots march forward at 0.6 m/s by offsetting the sampling phase (`t0 = (now * 0.6) % spacing`), which makes direction obvious. Reduced motion: no marching.
- **Contact marker.** If the preview ends on a contact: rim or box contact draws a 0.06 m ring at the point in `--hud-warn`; a floor contact draws a flat 0.10 m ring in muted color. Only reached when `previewTime` is long enough; with the defaults, level 1 shows contacts on very short throws only.
- **Assist arc** (accessibility toggle): `previewTime = 3 s`, so the arc runs to the first contact or the score plane. The landing ring turns accent-colored when the scratch ball crosses the score plane. This makes the game a "can you hold the mouse still" test, so it is a setting, not a default.
- **Trail.** Ring buffer of the last 40 positions sampled every 16 during `FLIGHT`, drawn as a `THREE.Line` with vertex colors fading from the ball's paper color to the background color along the tail (no per-vertex alpha needed). On resolve, fade all colors to background over 300 and clear.
- **Ball spin.** Angular velocity set at release: `ω = v / r * 0.6` around the axis perpendicular to velocity (backspin look). Pure cosmetic; physics is a point sphere.

### 3.5 Camera and bin motion (`src/juice.js`)

- **FOV kick on release.** `fov: 52 → 54.5` over 60 (`easeOutQuad`), back to 52 over 160 (`easeInOutQuad`); call `updateProjectionMatrix` each frame while active. Scale amplitude by power (`1.5° + 1° * power`). No positional shake; it would move the aim reference.
- **Surface hit nudge.** On a `boxHit` with speed > 2 m/s: camera roll `±0.15°` decaying over 80. Skipped under reduced motion.
- **Bin wobble.** Bin group pivot at the base center. On rim, inner wall, or floor contact: rotate about the horizontal axis perpendicular to the impact direction with `angle(t) = A · e^(−t/0.18) · sin(2π · 6 · t)`, `A` = 4° for rim hits (scaled by `min(1, speed / 5)`), 2° for interior hits, run for 500. New hits add to the current amplitude (cap 6°). Reduced motion: `A` halved, duration 200.
- **Bin squash** on floor thud: `scale.y 0.97 → 1` over 120, `easeOutBack`.
- **Paper crinkle on grab.** At `pointerdown`: hand ball `scale (1.08, 0.92, 1.08) → (1,1,1)` over 120, rotation jitter ±4° on three consecutive frames, and one re-noise of the icosphere vertices (detail 2, displacement ±0.5 mm on a copy of the base positions) so the ball visibly "re-crumples". Crinkle sound plays at the same time.
- **Pull-back pose.** During `AIMING`, ball offset lerps toward `(0, −0.04, +0.05) · power` relative to the hand pose (camera space) with a 60 ms smoothing.

### 3.6 Copy for feedback (final)

| Key | String |
|---|---|
| `make.swish` | "Swish" |
| `make.rattle` | "Rattled in" |
| `make.bank` | "Bank shot" |
| `make.bank.window` | "Off the glass" |
| `miss.rimout` | "Rim out" |
| `miss.short` | "A little short." |
| `miss.long` | "A little long." |
| `miss.left` | "Just left." |
| `miss.right` | "Just right." |
| `miss.close` | "So close." |
| `streak.5.l1` | "Five straight." |
| `streak.10.l1` | "Flawless refinement." |
| `streak.5.l2` | "Hot hand." |
| `streak.10.l2` | "Ten for ten." |
| `hint.cancel` | "Release to cancel" |
| `hint.stuck` | "Ball stuck? Press R." |

### 3.7 WebAudio plan (`src/audio.js`, no files)

**Graph.** `source → voiceGain → bus (sfx 1.0 | ambience 0.5) → master (0.8) → DynamicsCompressor (threshold −18 dB, ratio 3, attack 0.003, release 0.12) → destination`. Prebuild two 2 s buffers at init: white noise (`Math.random()*2-1`) and brown noise (leaky integrator, `b += 0.02*(w-b); out = b*3.5`).

**Unlock rule.** Do not construct the `AudioContext` at load. Create it inside the first trusted gesture handler (`pointerdown`, `keydown`, or `touchend` on `document`, capture phase, `{once:true}` re-armed if `resume()` rejects). Immediately call `ctx.resume()` and play a 1-sample silent buffer (iOS). On `visibilitychange`: hidden → `ctx.suspend()`, visible → `ctx.resume()`. Every `play()` is a no-op when `ctx.state !== 'running'`; never queue. Mute (`M`, `#hud-sound`) sets `master.gain` to 0 with a 30 ms ramp and persists to `localStorage['trashketball.muted']` in try/catch.

**Envelope conventions.** `gain.setValueAtTime(0, t)`, `linearRampToValueAtTime(peak, t + attack)`, `exponentialRampToValueAtTime(0.0001, t + attack + decay)`, `source.stop(t + total + 0.05)`. Cap identical clinks to one per 40 ms. Randomize pitch ±3% on physical sounds so repeats do not sound looped.

| Sound | Recipe | Duration |
|---|---|---|
| **Throw whoosh** | White noise → bandpass (Q 1.2) with `frequency` ramping 400 → 1800 Hz over 180 → voiceGain. Attack 20 to `0.12 + 0.25·power`, decay 220 | 250 |
| **Paper crinkle** (grab, spawn) | White noise → highpass 2.5 kHz → lowpass 8 kHz → gain with a scheduled crackle envelope: 8 bursts at random offsets within 140, each `setValueAtTime(0.1..0.25)` then ramp to 0 in 8..20. Spawn variant: 5 bursts, quieter (×0.6) | 150 |
| **Rim clink, L1 (steel bin)** | Two triangle oscillators at 2100 and 3150 Hz (± detune) → bandpass 2600 Hz Q 4 → gain: attack 2, exponential decay 120 from `0.25 · min(1, speed/6)`. Plus a 6 ms white-noise click at 0.15 | 130 |
| **Rim tok, L2 (woven basket)** | Triangle at 700 and 1050 Hz → lowpass 2.2 kHz, decay 80 from 0.22; noise burst 12 ms lowpassed 3 kHz at 0.2 | 100 |
| **Bin thud, L1** | Sine with `frequency` 180 → 90 Hz over 80, gain 0.4 decaying 150; brown noise burst 40 ms lowpass 600 Hz at 0.25; plus a 900 Hz triangle "tin" ring at 0.08 decaying 200 | 200 |
| **Bin thud, L2** | Sine 140 → 80 Hz over 70, gain 0.35 decay 120; brown noise 50 ms lowpass 500 Hz at 0.3. No ring | 140 |
| **Carpet or floor thud** (miss) | Brown noise 30 ms → lowpass 900 Hz, gain `0.2 · min(1, speed/5)`, decay 60. L2 wood floor: add sine 220 Hz at 0.08 decaying 60 | 80 |
| **Desk or wall hit** | White noise 20 ms → bandpass 1.2 kHz Q 1, gain 0.18 decay 90. Window (L2): sine 2800 Hz at 0.1 decay 60 + noise 8 ms | 100 |
| **Score sting, L1** ("terminal chime") | Triangle → lowpass 4 kHz. Notes 880 Hz then 1318 Hz, 70 each, gain 0.12, attack 5, decay 90. Swish and bank add a third note 1760 Hz. Rattle uses only two | 220 / 290 |
| **Score sting, L2** (soft marimba) | Triangle + sine (mix 0.6/0.4) → lowpass 3 kHz. Notes C5 E5 G5 (523, 659, 784) at 90 spacing, attack 12, decay 250 each, gain 0.14. Rattle: C5 and G5 only | 450 |
| **Level-up sting** | Sine + triangle (0.5/0.5), arpeggio 523, 659, 784, 1047 Hz at 120 spacing, attack 10, release 600 each, gain 0.16 → feedback delay (DelayNode 0.28 s, feedback gain 0.3, wet 0.2) | 1200 |
| **Win sting** | Level-up arpeggio, then a held major triad (523 + 659 + 784, sines, gain 0.08 each) swelling over 400 and releasing over 1200 | 2400 |
| **UI tick** (buttons, toggles) | White noise 8 ms → highpass 3 kHz, gain 0.1 | 10 |
| **Ambience L1** (optional) | Brown noise → lowpass 200 Hz, gain 0.03; plus 60 Hz sine at 0.01. Starts at `READY`, fades out over 600 in the transition | loop |
| **Ambience L2** | Brown noise → lowpass with `frequency` modulated by an LFO (0.08 Hz sine, ±300 Hz around 650 Hz), gain 0.06. Every 9 to 14 s a "wash": gain to 0.10 over 1.5 s and back over 3 s. Reduced motion: LFO off, constant 650 Hz | loop |

---

## 4. Level transition

### 4.1 Overlay copy

**Title (level 1, over the live office):**
- Eyebrow: "Lumon Industries"
- Title: "Trashketball" (L1: 34px uppercase `.2em`; wordmark sits over a 1px rule)
- Body: "Drag back to aim. Release to throw. Ten baskets earn your outie a vacation."
- Button: "Clock in"
- Footnote (11px muted): "Keyboard: arrows aim, hold Space to throw, R resets the ball, M mutes."
- If a saved session exists: second button "Continue at the beach" (or "Continue on the floor" when saved in L1 with progress).

**Level complete (L1 → L2):**
- Eyebrow: "Macrodata Refinement"
- Title: "Quota met."
- Body: "100% of bins refined. Your outie has earned a vacation."
- Stats line (data font, 13px): "10 made · 17 throws · 59% · 4 swishes"
- Sub-line (italic serif hint of what is coming, 13px muted): "Please enjoy each amenity equally."
- Button: "Take the vacation"

**Level 2 identity (HUD):**
- Eyebrow: "Superhost · Entire home"
- Name: "Sea Glass House"
- Lvl: "Level 2 of 2"

**Win (after L2):**
- Eyebrow: "Sea Glass House"
- Title: "Five stars."
- Body: "Twenty baskets, two houses, no meetings."
- Stats: "20 made · 31 throws · 65% · Longest streak 6 · 9 swishes"
- Buttons: "Play again" (primary), "Stay at the beach" (secondary, free play)

**Pause:**
- Title: "Paused"
- Body: "Click anywhere to resume."
- Toggles (each a 44 px row with a switch): "Sound", "Reduced motion", "Assist arc", "Invert horizontal aim", "High contrast HUD"
- Buttons: "Reset ball", "Restart level"

### 4.2 Fade sequence (click at t0, total 2100 to `READY`)

Prebuild level 2 while the overlay is up (start construction at `LEVEL_COMPLETE` enter, in idle chunks under 8 ms each via `requestIdleCallback` or a small task queue) so the swap is instant.

| t | Event |
|---|---|
| overlay in | Level-up sting plays as the overlay appears (before t0) |
| t0 | UI tick. Panel text `opacity 1 → 0` over 250. `#fade` background `#F3EBDD` (ivory) `opacity 0 → 1` over 600, `ease-in`. L1 ambience gain → 0 over 600 |
| t0+600 | Screen fully ivory. Swap: dispose L1 (`geometry.dispose`, `material.dispose`, textures), attach L2 scene, camera pose for L2, HUD `theme-lumon → theme-beach`, `level.score = 0`, dots cleared, level block text swapped |
| t0+700 | Inside the ivory field, centered serif text fades in over 250: "Level 2" (13px uppercase tracked, `#2B2521` at 60%) over "Sea Glass House" (30px serif). Holds until t0+1300 then fades 200 |
| t0+1000 | `#fade` `opacity 1 → 0` over 800, `ease-out`. L2 ambience gain 0 → 0.06 over 1500. HUD blocks slide in from their edge (`translateY(−8px) → 0`, `opacity 0 → 1`, 300 each, stagger 60: level, score, stats, sound) |
| t0+1800 | `NEXT_BALL` (spawn 220, crinkle) |
| t0+2100 | `READY`. Hint shown again for the new theme ("Drag back to aim. Release to throw." in the serif style) since the bin looks different |

Reduced motion: no slide-ins, fades shortened to 300 in and 300 out, hold 200; total ~1000.

Win → replay uses the same shape with `#fade` `#0B1F28` (dark teal, "back down the elevator"), the field text "Level 1" over "Macrodata Refinement", and L1 ambience back in. Title overlay is skipped; the player lands in `NEXT_BALL`.

### 4.3 State preserved across levels

`main.js` owns a single `session` object; level modules receive it read-only and never touch score.

```js
session = {
  version: 1,
  levelIndex: 0,
  total: { score: 0, throws: 0, makes: 0, swishes: 0, rimOuts: 0, bestStreak: 0 },
  level:  { score: 0, throws: 0, makes: 0, swishes: 0, rimOuts: 0, streak: 0, bestStreak: 0 },
  levels: [ /* frozen copy of `level` pushed at each level complete */ ],
  settings: { muted: false, reducedMotion: null /* null = follow OS */, assistArc: false, invertYaw: false, highContrast: false },
  startedAt: Date.now()
}
```

- Every resolve updates `level` and `total` together. Dots and the score value show `level.score`; overlays show totals.
- Persist to `localStorage['trashketball.session']` on every resolve and on level complete, in try/catch. On load, if `levelIndex == 1` or `level.throws > 0`, the title shows the continue button. `WIN` "Play again" resets everything except `settings`.
- Level modules export `{ build(ctx), dispose(), config }` where `config` holds the knobs in Section 6, the bin geometry, the camera pose, the box surface tags, and the sound variant name (`'steel' | 'woven'`).

---

## 5. Accessibility and controls

### 5.1 Pointer (`src/input.js`)

- Pointer Events only (`pointerdown/move/up/cancel`), `touch-action: none` on the canvas, `contextmenu` prevented on the canvas. Primary button only (`button === 0`); ignore additional pointers while one is captured (track `activePointerId`).
- `setPointerCapture` on pointerdown so drags that leave the window still resolve. Handle `pointercancel`, `lostpointercapture`, window `blur`, and `visibilitychange` identically: cancel the drag, no throw, ball back to hand.
- Deadzone 12 px before `AIMING` begins (a tap does not throw). During a drag, moving back to within the deadzone above the origin shows "Release to cancel" and hides the arc; release there cancels.
- Mapping (all in CSS px, normalized to `min(innerWidth, innerHeight)` so phones and monitors feel the same):
  - `dragFull = 0.35 · min(vw, vh)`
  - `power = clamp(dy / dragFull, 0, 1)` where `dy` is downward drag
  - `yaw = clamp(dx / dragFull, −1, 1) · yawRange`, arc follows the drag direction (drag left, arc goes left). `settings.invertYaw` flips the sign for slingshot fans.
  - `speed = vMin + (vMax − vMin) · f(power)`, `f(p) = p + k · sin(2πp) / (2π)`, `k = 0.45`. Monotonic, sensitivity 0.55× at half pull (the bin) and 1.45× at the ends. This is the "sweet spot" curve.
  - Elevation fixed per level (Section 6). Mouse wheel or Up/Down during a drag adjusts it ±1° within 25° to 55° for advanced players; it resets per level.
- Release uses the pointer position at `pointerup`. No velocity sampling.

### 5.2 Keyboard

| Key | Action |
|---|---|
| Left / Right | Yaw ±0.5° per press; held repeats at 15°/s after 250, accelerating to 30°/s after 1 s |
| Up / Down | Elevation ±1° (25° to 55°) |
| Space (hold) | Charge: power ping-pongs 0 → 1 → 0, 900 each way, bar meter visible, arc live. Release throws at the current power. Enter behaves the same |
| R | Reset ball. In `AIMING`: cancel. In `FLIGHT`: kill the ball (counts as a miss), `NEXT_BALL`. In `READY`: re-spawn (no count) |
| Esc / P | Pause toggle |
| M | Mute toggle |
| ? | Shows the pause overlay's controls list |
| Tab | Moves focus among overlay buttons and `#hud-sound` only |

Keyboard mode is entered on the first arrow or Space and switches `#hud[data-input]` to `keyboard` (hint copy and the bar meter). A pointerdown switches back.

### 5.3 Reduced motion

- Default follows `prefers-reduced-motion: reduce`; the pause toggle overrides and persists.
- When on: no FOV kick, no camera nudges, bin wobble halved and 200 long, popups fade in place (no travel), arc dots do not march, transition is a plain 300/300 crossfade, ambience LFO off, HUD slide-ins become fades, dot pops become plain fills. Ball flight itself is never slowed; it is the game.

### 5.4 Color and contrast

- No meaning carried by color alone: makes have "+10" and a filled dot; rim-outs have text; the preview contact marker uses shape (ring for floor, ring with a diagonal cross for rim or box).
- Palettes avoid red/green pairs: L1 mint vs amber, L2 sea teal vs terracotta. Both pairs remain distinct under deutan and protan simulation.
- `settings.highContrast`: panel backgrounds become solid (`#061B24` / `#FAF6EE`), text shadows removed, hint and stats 14px, arc dots 7 px.
- `:focus-visible { outline: 2px solid var(--hud-accent); outline-offset: 2px }`. Overlays trap focus and return it to the canvas on close.
- Hit targets 44 px minimum. `#hud-sound` has `aria-pressed`.

### 5.5 Pause and interruption

- `visibilitychange` hidden always pauses (Section 1.2), including during `TRANSITION` (fade jumps to its end state, then pauses).
- Resume requires a click or key so the cursor position cannot start a drag by surprise.
- Window `blur` cancels an active drag but does not pause (alt-tabbing mid-drag should not throw).

---

## 6. Difficulty tuning knobs

All knobs live in each level's `config` and in `physics.defaults`. Defaults were chosen against the geometry below; retune with the in-HUD stats (aim for a first-session make rate of 45 to 55% in L1 and 35 to 45% in L2).

### 6.1 Geometry and physics

| Knob | L1 Lumon | L2 Sea Glass | Notes |
|---|---|---|---|
| `binDistance` (camera to bin center, along −z) | 3.8 | 4.3 | L2 farther |
| `binInnerRadius` | 0.135 | 0.125 | L2 opening 2 cm narrower |
| `binHeight` (rim y) | 0.30 | 0.32 | |
| `rimTubeRadius` | 0.008 (steel) | 0.014 (woven) | Thicker rim rattles more |
| `rimRestitution` | 0.35 | 0.25 | |
| `binWallRestitution` | 0.30 | 0.22 | |
| `rimGrace` (collision radius shrink vs rim only) | 0.003 | 0 | Tiny forgiveness in L1; never in L2 |
| `floorRestitution` / rolling damping | 0.30 / 2.5 s⁻¹ | 0.35 / 1.8 s⁻¹ (wood) | |
| `boxRestitution` | 0.40 (wall, desk) | 0.45 (window), 0.15 (sofa) | Bank shots: L1 places a partition 0.6 m behind the bin; L2 the glass wall 0.7 m behind |
| `ballRadius` / `ballMass` | 0.04 / 0.008 kg | same | Two sheets crumpled |
| `dragK = ρ·Cd·A / (2m)` | 0.15 m⁻¹ | 0.15 | `a_drag = −dragK · |v| · v`, terminal velocity ≈ 8 m/s |
| `wind` | (0,0,0) | (0,0,0) | Optional hard mode: (0.4, 0, 0) m/s, shown by curtain sway; preview includes it, so it stays fair |
| `gravity` | 9.81 | 9.81 | |
| `releasePose` (camera space) | (0.18, −0.20, −0.35) | same | Ball visible lower right; camera at y 1.55, pitch −6° |
| `elevationDeg` | 40 | 42 | |
| `yawRange` | ±18° | ±18° | At 3.8 m, 1° ≈ 6.6 cm lateral; with `dragFull` 250 px that is 0.07° per px |
| `scorePlaneDepth` | 0.10 | 0.10 | |
| `cameraFov` | 52 vertical; on portrait lock horizontal FOV to 62 (`vFov = 2·atan(tan(31°)/aspect)`) | same | |

### 6.2 Preview and mapping

| Knob | L1 | L2 |
|---|---|---|
| `previewTime` (s of arc shown) | 0.65 (of ~1.05 s flight) | 0.45 (of ~1.15 s) |
| `assistArc` | user setting, off | off |
| `powerCurveK` | 0.45 | 0.45 |
| `dragFull` | 0.35 · min(vw, vh) | same |
| `missHints` | `always` | `after2` |
| `quickRearm` / `rearmAfterMs` | off / 900 | off / 900 |
| `previewMarch` | 0.6 m/s | 0.6 m/s |

### 6.3 Auto-calibration (the fairness core)

At level build, run `solveSpeedForTarget(distance, elevationDeg)`: bisection on launch speed (20 iterations) using the real integrator, finding the speed whose arc crosses the rim plane at the bin center. Call it `vBin`. Then set `vMin = vBin − 3.0` (floor at 2.0) and `vMax = vBin + 3.0`. Because `f(0.5) = 0.5`, the bin sits at exactly half pull in every level, on every screen size, with any drag setting. Re-run on `elevationDeg` change.

With those numbers: range sensitivity near the bin is about 1.3 m per m/s before drag, the ±3 m/s span across 250 px gives about 1.8 cm of depth per px at the sweet spot after the curve, and the effective depth tolerance (opening radius minus ball radius ≈ 9.5 cm) is roughly ±5 px of mouse travel. Tight enough to be a game, wide enough to be learnable, and identical every time.

### 6.4 Why L2 is a little harder, and no more than a little

Farther (+0.5 m), narrower (−2 cm), thicker rim, shorter preview, no rim grace, hints only after two misses. Each change is small; together they move the expected make rate down by roughly 10 points. Do not add wind by default; the beach house should feel like a reward, not a wind tunnel.

---

## 7. Event contract (so juice and HUD stay decoupled)

`physics.js` emits, with `{ball, point, speed, normal, tag}` where relevant:
`rimHit`, `binWallHit`, `binFloorHit`, `floorHit`, `boxHit` (tag: `wall | desk | partition | window | sofa | table`), `scored`, `outOfBounds`, `rest`.

`main.js` consumes those, applies the classification (1.3), and emits game events:
`throw {power, yaw}`, `make {type, streak, levelScore, totalScore}`, `miss {type, error: {dx, dz}}`, `levelComplete`, `win`, `pause`, `resume`, `stateChange {from, to}`.

`hud.js`, `juice.js`, and `audio.js` subscribe to game events only. Physical sounds (`clink`, `thud`, surface hits) subscribe directly to physics events. No module reads another module's state.