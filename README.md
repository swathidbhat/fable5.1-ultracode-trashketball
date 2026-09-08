# Trashketball

A two-level 3D paper-toss game rendered with Three.js. Throw crumpled paper into a waste bin from a first-person view with
physics-accurate, previewed throws.

- **Level 1: Macrodata Refinement.** A Severance-style Lumon office: green carpet, white walls, fluorescent drop ceiling, the
  diamond desk cluster, retro terminals, and a Lumon-blue steel wastebasket under a portrait of the Founder.
- **Level 2: Casa Marea.** A high-ceilinged beach house with floor-to-ceiling glass, an animated ocean and beach, boucle and velvet
  sofas, a marble table, and a matte-black bin with a brass lip.

Every make scores 10 points. 100 points completes a level.

## Run it

ES modules need an HTTP server (opening `index.html` from disk will not work). The bundled dev server disables caching so
edits show up on reload:

```bash
python3 tools/serve.py 5173
```

Any static server works too, for example `python3 -m http.server 5173 --bind 127.0.0.1`.

Then open <http://127.0.0.1:5173/>. Three.js loads from the jsdelivr CDN through the importmap in `index.html`; there is no build step
and no npm install.

## Controls

| Input | Action |
| --- | --- |
| Drag down (mouse or touch) | Charge the throw; further pull = more power. The bin sits at half pull. |
| Drag sideways | Aim left or right. The dotted arc follows the drag. |
| Release | Throw. Releasing inside the deadzone cancels. |
| Arrow keys / Space | Keyboard aim and charge. |
| R | Reset the ball (counts as a miss while in flight). |
| Esc or P | Pause. |
| M | Mute. |

## Project layout

```
index.html            importmap, canvas, HUD root
src/main.js           bootstrap, fixed-step loop, state machine, level switching
src/physics.js        custom sphere physics: drag, floor/AABB/cylinder/bin collisions, scoring (no three.js dependency)
src/input.js          pointer drag with capture, aim mapping, keyboard aim
src/trajectory.js     predicted arc (instanced dots) and flight trail (ribbon)
src/paperBall.js      crumpled paper ball mesh and hand position
src/hud.js            DOM overlay: score, dots, hints, popups, overlays, fades
src/audio.js          WebAudio-synthesized sound effects and ambience
src/juice.js          camera kick, bin wobble, rim glow
src/textures.js       procedural canvas textures
src/levels/           severance.js (level 1), beachHouse.js (level 2), util.js
tests/physics.test.mjs  node tests for the integrator and collisions
tests/physics.stress.mjs  200 random throws: tunneling, double scoring, settling
tools/serve.py          no-cache static dev server
tools/build-single.py   bundles src/ into dist/trashketball.html
docs/CONTRACT.md      binding module interfaces
docs/design/          design documents (physics, art direction, technical plan, UX)
```

Build a single self-contained HTML file (three.js still loads from the CDN) with:

```bash
python3 tools/build-single.py
```

It writes `dist/trashketball.html`, which can be opened from any static host.

Run the physics tests with:

```bash
node tests/physics.test.mjs
```
