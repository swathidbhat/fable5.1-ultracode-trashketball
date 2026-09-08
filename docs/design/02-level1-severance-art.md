# TRASHKETBALL — LEVEL 1 ART DIRECTION
## "Macrodata Refinement" — Lumon Industries, Severed Floor

Research notes (what the show actually does, so the build stays honest): the MDR room is a vast, mostly empty box, roughly 40 ft x 80 ft, with a very low 7 ft 2 in ceiling and "intense" fluorescent panels. One monochrome grass-green carpet ("almost like a putting green" per production designer Jeremy Hindle) runs wall to wall; walls are a blinding, cool white (30 whites were camera-tested). The four refiners share one custom "diamond desk" that stands on a single central pedestal, with white laminate tops and deep-green fabric dividers that raise and lower on pulleys. Chairs are Blu Dot Daily Task chairs. The terminals are Data General Dasher-style boxy CRTs in blue and cream with a trackball keyboard (no Escape key). The screen is dark navy with pale "Lumon blue" numbers, five buckets along the bottom, and a hex code in the footer. Hallways are white with glossy linoleum, decorated only by the occasional plain metal wastebasket and hagiographic Kier Eagan paintings. Wordmark font in the show is Manifold Extended CF (a wide extended grotesque). The innie world is exclusively greens, blues, and white; warm colors belong to the outside.

Sources: [Variety (Hindle)](https://variety.com/2022/artisans/news/severance-production-design-apple-1235220628/), [SlashFilm interview (40x80 ft, 7'2" ceiling)](https://www.slashfilm.com/823522/how-severance-created-a-warped-workplace-for-a-founder-god-interview/), [Cheatsheet ($100k pedestal desk, pulleys)](https://www.cheatsheet.com/news/severance-security-cameras-100000-desk-give-lumons-mdr-department-signature-vibe.html/), [Film and Furniture (white desks, deep-green screens, Blu Dot chairs)](https://filmandfurniture.com/2025/09/severance-part-1-the-innie-world-design-furniture-and-the-architecture-of-control/), [Assemble (CRT, trackball, no Esc key, powder-blue incentives)](https://www.onassemble.com/blog/severance), [Dwell (carpet/whites)](https://www.dwell.com/article/severance-production-design-styles-hidden-meanings-c72cc8c4), [Post45 (hallway wastebasket)](https://post45.org/2023/04/a-handshake-is-available-upon-request-severance-and-the-uneasiness-of-sparsity/), [Severance Wiki terminal (Dasher D2/D3 basis)](https://content.severance.wiki/macrodata_refinement_terminal), [Fonts In Use](https://fontsinuse.com/uses/47788/severance-tv-series), [Variety (Kier paintings)](https://variety.com/2025/artisans/news/severance-art-explained-lumon-kier-paintings-1236337147/), [Bliss Montage (green dividers, Lumon blue)](https://blissmontage.substack.com/p/the-colors-of-severance).

---

## 1. PALETTE

All values are sRGB. Materials are `MeshStandardMaterial` unless noted. Set `texture.colorSpace = THREE.SRGBColorSpace` on every color canvas.

| Element | Hex | Notes |
|---|---|---|
| Carpet base | `#417F50` | Noise range `#356A42` (dark) to `#4C8F5B` (light). Roughness 1.0, metalness 0. |
| Walls | `#F1F3EE` | Cool white, panel seams every 1.2 m at `#E4E7E1`. Roughness 0.9. |
| Skirting / base reveal | `#DADDD6` | 0.10 m tall, 0.012 m proud of wall. Roughness 0.7. |
| Ceiling tiles | `#EAEDE7` | T-bar grid lines `#D3D7D0`, 0.6 m module. Roughness 0.95. |
| Fluorescent diffuser (emissive) | color `#FFFFFF`, emissive `#EFF9F1` | emissiveIntensity 1.5. Slightly green-white. |
| Hallway walls | `#EDF3EC` | Minty white, one step greener than the MDR walls. |
| Hallway floor (linoleum) | `#E4E7E1` | Roughness 0.28, metalness 0.05 (sheen). |
| Desk top (laminate) | `#F4F4F1` | Roughness 0.45. |
| Desk pedestal / underframe | `#E9EAE6` | Roughness 0.6. Dark reveal ring `#B9BDB7`. |
| Partitions (fabric) | `#2F6B5A` | Deep teal-green, roughness 0.98. Trim `#EEF0EB`. |
| Monitor housing (rear) | `#37516B` | Dusty Lumon blue-slate, roughness 0.7. |
| Monitor bezel (front face) | `#2F4459` | Roughness 0.6. |
| Screen background | `#0A1E33` | Navy. Numbers `#A9D6E8`, highlight `#E8F6FC`, dim UI `#5F86A3`. |
| Keyboard body | `#E5E0CF` | Cream. Keys `#D9D3C0`, function keys `#7FA3C0`. |
| Trackball | `#152638` | Roughness 0.15, metalness 0.1 (glassy). |
| Chair seat + back (fabric) | `#2C5E52` | Roughness 0.95. |
| Chair shell | `#E3E6E1` | Roughness 0.5. |
| Chair stem / star base | `#9EA3A0` | Metalness 0.7, roughness 0.35. Casters `#2A2A2A`. |
| Bin body exterior | `#3C5A73` | Lumon blue, roughness 0.55, metalness 0.15. |
| Bin interior | `#1B2A3A` | Reads as a hole from 4 m. |
| Bin rim + base ring | `#C8CDD1` | Metalness 0.85, roughness 0.3 (aluminum lip). |
| Door slab | `#EDEFEA` | Frame `#B9BEB7`, lever handle `#B0B4AE` metalness 0.6. |
| Portrait frame | `#8C7440` | Muted brass, metalness 0.5, roughness 0.5. |
| Lumon wordmark ink | `#12274A` | On white. |
| Powder-blue incentive props | `#A9C6DA` | Finger trap, eraser box. |
| Paper ball | `#F7F7F2` | Faint rule lines `#BFD3E2`, crease shading `#D9DBD4`. |
| Scene background / fog | `#EAEFE9` | Clear color; `Fog(0xEAEFE9, 10, 22)`. |

Calibration target after lighting: a white wall at eye level should render around `#E4E8E1` (not clipped to white), the carpet around `#3E7A4C`.

---

## 2. ROOM DIMENSIONS AND LAYOUT

Coordinate system: +x east (right of the thrower), +z south (toward the thrower), y up. The thrower faces north (−z).

Room: 14 m (x: −7 to +7) by 16 m (z: −5 to +11), ceiling at y = 2.40 m. The show's ceiling is 2.18 m; 2.40 m keeps the claustrophobia while leaving a 45-degree lob just barely hitting the ceiling (an intentional, on-theme constraint; the ceiling is a collision plane). The play area is the north end; the 11 m of empty green carpet behind the camera is the show's "vast expanse" and costs nothing.

Camera: position `(1.10, 1.60, −0.20)`, looking at `(0.75, 0.90, −4.40)`, vertical FOV 62. Allow ±15 degrees of mouse look so the doors at the frame edges are discoverable. The thrower stands at the east station of the desk, having stood up from their chair.

Bin: `(0.75, 0, −4.40)`. Horizontal distance from camera: 4.22 m. The north wall (surface z = −5.00) is 0.45 m behind the bin's rear rim: bank shots off the wall work, and the Kier Eagan portrait hangs directly above the bin as an aiming reference.

```
                          NORTH WALL  (z = -5.0)
x=-7        -5        -3        -1    0    1        3        5        7
 ###########[==DOOR==]####[MDR]#####[K]#####[LUMON GLOBE]###[=DOOR=]####  <- z=-5.0
 #  (to main hallway,   |            (o)                    (BREAK ROOM)   #     z=-4.5   (o) = BIN (0.75,-4.4)
 #   8 m deep, lit)   [N]                                                  #     z=-4.0   [N] = north chair (-1.4,-4.0)
 #                 +-----------+                                           #     z=-3.6   desk north edge
 #                 |\   ___   /|                                           #
 #                 | \ |mon| / |                                           #     monitors 1.0 m from pedestal
 #            [W]  |  \|___|/  |[E]                                        #     z=-2.0   pedestal (-1.4, -2.0); [E] chair (0.6,-2.0)
 #                 |  /|___|\  |                                           #
 #                 | / |mon| \ |                                           #     X-shaped partitions to the corners
 #                 |/         \|                                           #
 #                 +-----------+          ^                                #     z=-0.4   desk south edge
 #                      [S]               @  CAMERA (1.1, 1.6, -0.2)       #     z= 0.0   [S] chair (-1.4, 0.0)
 #                                                                         #
 #                        . . .  11 m of empty carpet to z=+11 . . .       #
 #  (security camera dome in NE ceiling corner at (6.5, 2.35, -4.5))       #
```

Key coordinates (meters):

| Object | Position (x, y, z) | Facing / notes |
|---|---|---|
| Desk cluster center (pedestal) | (−1.40, 0, −2.00) | Top spans x −3.0..0.2, z −3.6..−0.4 |
| East monitor (player's) | (−0.40, 0.75, −2.00) | faces +x |
| North monitor | (−1.40, 0.75, −3.00) | faces −z |
| West monitor | (−2.40, 0.75, −2.00) | faces −x |
| South monitor | (−1.40, 0.75, −1.00) | faces +z |
| Partitions (4) | centers (−1.4 ± 0.884, 1.025, −2.0 ± 0.884) | yaw ±45 degrees, run pedestal to corners |
| Chairs E/N/W/S | (0.60,0,−2.00) / (−1.40,0,−4.00) / (−3.40,0,−2.00) / (−1.40,0,0.00) | each faces the pedestal |
| Bin | (0.75, 0, −4.40) | 0.45 m from north wall |
| Kier portrait | (0.75, 1.55, −4.99) | on north wall, 0.6 x 0.8 m, above the bin |
| Main hallway door (open) | x −3.7..−2.1, y 0..2.1, z −5.0 | hallway runs north to z = −13 |
| "MACRODATA REFINEMENT" placard | (−1.75, 1.60, −4.99) | 0.36 x 0.12 m |
| Lumon globe wordmark | (3.60, 1.50, −4.99) | 1.4 x 0.8 m plane |
| Break room door (closed) | x 4.4..6.0, z −5.0 | slab + "BREAK ROOM" placard + "WELLNESS ->" sign |
| Security camera dome | (6.50, 2.35, −4.50) | hemisphere, tiny red LED |
| Paper stack (ammo) | (−0.10, 0.76, −1.55) | on the east station |
| Loose paper balls (misses) | (1.30, 0.04, −4.10), (0.20, 0.04, −4.70) | dressing |

Ceiling light panels (0.6 x 1.2 m, long axis along x): grid x ∈ {−4.8, −2.4, 0, 2.4, 4.8}, z ∈ {−3.6, −1.2, 1.2, 3.6, 6.0, 8.4}, y = 2.39. Thirty panels; only six near the play area are real lights (see Section 4).

---

## 3. BUILD LIST

Dimensions in meters. `MSM` = MeshStandardMaterial. Enable `castShadow` on desk, monitors, chairs, bin, ball, portrait; `receiveShadow` on floor, desk top, walls.

### 3.1 Shell

| Object | Geometry | Position | Material / Texture |
|---|---|---|---|
| Floor | `PlaneGeometry(14, 16)`, rot.x −90° | (0, 0, 3) | MSM carpet, `map` = carpet canvas, repeat (28, 32) (one tile = 0.5 m), `bumpMap` same, bumpScale 0.0015, roughness 1.0. Anisotropy 8. |
| Ceiling | `PlaneGeometry(14, 16)`, rot.x +90° | (0, 2.40, 3) | MSM `#EAEDE7`, `map` = ceiling-tile canvas, repeat (23.33, 26.67), roughness 0.95. |
| North wall (3 pieces around door 1, 3 around door 2) | `BoxGeometry(w, 2.4, 0.2)`; headers `BoxGeometry(1.6, 0.3, 0.2)` at y 2.25 | wall center z = −5.10 | MSM `#F1F3EE`, `map` = wall-seam canvas repeat (w/1.2, 1), roughness 0.9. |
| South / East / West walls | `BoxGeometry(14, 2.4, 0.2)`, `BoxGeometry(0.2, 2.4, 16)` x2 | z = 11.1; x = ±7.1 | same wall material |
| Skirting | `BoxGeometry(len, 0.10, 0.012)` per wall segment | y 0.05, flush to wall face | MSM `#DADDD6`, roughness 0.7 |
| Fluorescent panels (30) | `BoxGeometry(1.2, 0.02, 0.6)` | grid above, y 2.39 | MSM color `#FFFFFF`, emissive `#EFF9F1`, emissiveIntensity 1.5, `emissiveMap` = diffuser-grid canvas |
| Contact shadows | `CircleGeometry(r)`, rot.x −90° | y 0.002 under bin (r 0.19), chairs (r 0.30), pedestal (r 0.30) | `MeshBasicMaterial` black, transparent, opacity 0.30, with a radial-gradient alphaMap canvas |

### 3.2 Diamond desk cluster (one group at (−1.4, 0, −2.0))

| Part | Geometry | Local position | Material |
|---|---|---|---|
| Top | `BoxGeometry(3.2, 0.04, 3.2)` | (0, 0.73, 0) | MSM `#F4F4F1`, roughness 0.45 |
| Pedestal | `CylinderGeometry(0.16, 0.24, 0.71, 24)` | (0, 0.355, 0) | MSM `#E9EAE6` |
| Pedestal reveal ring | `TorusGeometry(0.24, 0.012, 8, 32)`, rot.x 90° | (0, 0.02, 0) | MSM `#B9BDB7` |
| Underframe (cross) | `BoxGeometry(3.0, 0.06, 0.12)` and `BoxGeometry(0.12, 0.06, 3.0)` | (0, 0.68, 0) | MSM `#E9EAE6` |
| Partitions x4 | `BoxGeometry(1.9, 0.55, 0.04)` | (±0.884, 1.025, ±0.884), rot.y = ±45° so each runs from pedestal to a corner | MSM `#2F6B5A`, roughness 0.98, `bumpMap` = felt-noise canvas, bumpScale 0.002 |
| Partition top trim x4 | `BoxGeometry(1.9, 0.02, 0.05)` | on top of each partition, y 1.31 | MSM `#EEF0EB` |
| Partition pulley cord x4 (delight) | `CylinderGeometry(0.003, 0.003, 0.5)` | at the outer end of each partition, from trim down to the desk | MSM `#C9CCC5` |

### 3.3 Lumon terminal (x4, one group per station, group rotated to face its worker)

| Part | Geometry | Local position | Material |
|---|---|---|---|
| Rear housing | `BoxGeometry(0.34, 0.28, 0.30)` | (0, 0.22, −0.12) | MSM `#37516B`, roughness 0.7 |
| Front bezel block | `BoxGeometry(0.42, 0.34, 0.10)` | (0, 0.24, 0.05) | MSM `#2F4459`, roughness 0.6 |
| Screen | `PlaneGeometry(0.30, 0.22)` | (0, 0.25, 0.101) | MSM color `#000000`, emissive `#FFFFFF`, `emissiveMap` = screen canvas, emissiveIntensity 1.2, roughness 0.3 |
| Neck | `CylinderGeometry(0.05, 0.07, 0.06, 16)` | (0, 0.04, −0.06) | MSM `#37516B` |
| Foot | `BoxGeometry(0.30, 0.02, 0.24)` | (0, 0.01, −0.06) | MSM `#2F4459` |
| Keyboard body | `BoxGeometry(0.46, 0.035, 0.18)` | (0, 0.0175, 0.33) | MSM `#E5E0CF`, roughness 0.6 |
| Key block | `BoxGeometry(0.28, 0.012, 0.11)` | (−0.06, 0.04, 0.33) | MSM `#D9D3C0`, `map` = keycap-grid canvas (draw 4 rows of 12 rounded rects; no key in the top-left "Esc" position) |
| Function keys x4 | `BoxGeometry(0.02, 0.012, 0.02)` | above the key block, y 0.041 | MSM `#7FA3C0` |
| Trackball recess | `CylinderGeometry(0.04, 0.04, 0.02, 24)` | (0.15, 0.03, 0.33) | MSM `#D2CCB8` |
| Trackball | `SphereGeometry(0.03, 24, 16)` | (0.15, 0.045, 0.33) | MSM `#152638`, roughness 0.15 |
| Lumon droplet badge | `PlaneGeometry(0.03, 0.035)` | on the bezel below the screen | `MeshBasicMaterial` white with droplet alphaMap |
| Webcam pinhole | `CircleGeometry(0.004)` | on the bezel top center | `MeshBasicMaterial #0A0A0A` |

Monitor group placement: 1.0 m from the pedestal along its station axis, y 0.75, rotated so the screen faces outward toward the worker's chair. Keyboard sits 0.33 m toward the worker.

### 3.4 Chairs (x4, Blu Dot Daily Task look; seat height 0.46)

| Part | Geometry | Local position | Material |
|---|---|---|---|
| Seat pad | `BoxGeometry(0.44, 0.05, 0.42)` | (0, 0.485, 0) | MSM `#2C5E52`, roughness 0.95 |
| Seat shell | `BoxGeometry(0.48, 0.03, 0.46)` | (0, 0.445, 0) | MSM `#E3E6E1` |
| Backrest pad | `BoxGeometry(0.42, 0.34, 0.04)`, rot.x −8° | (0, 0.70, −0.21) | MSM `#2C5E52` |
| Backrest shell | `BoxGeometry(0.46, 0.38, 0.02)`, rot.x −8° | (0, 0.70, −0.24) | MSM `#E3E6E1` |
| Stem | `CylinderGeometry(0.02, 0.025, 0.36, 12)` | (0, 0.26, 0) | MSM `#9EA3A0`, metalness 0.7 |
| Star base x5 | `BoxGeometry(0.30, 0.02, 0.03)`, offset so one end is at the stem, rot.y = i * 72° | y 0.05 | MSM `#9EA3A0` |
| Casters x5 | `SphereGeometry(0.025, 12, 8)` | at the end of each star arm, y 0.025 | MSM `#2A2A2A`, roughness 0.4 |

### 3.5 The bin (the target; solid, not wire mesh)

Wire mesh aliases badly at 4 m on a 1080p screen (it would be ~70 px tall). Use a solid tapered steel wastebasket in Lumon blue with a bright aluminum lip: the dark interior reads as a hole, the rim reads as the target circle, and the blue pops against both the green carpet and the white wall behind it. This also matches the show's plain metal bins.

Dimensions: height 0.32, outer radiusTop 0.150, outer radiusBottom 0.120, wall thickness 0.006, floor thickness 0.008, rim tube radius 0.009.

Build (one LatheGeometry gives a watertight double-sided wall):

```js
// profile in (r, y), lathed around Y. 48 segments.
const pts = [
  new THREE.Vector2(0.000, 0.000),
  new THREE.Vector2(0.120, 0.000),   // outer bottom edge
  new THREE.Vector2(0.150, 0.320),   // outer top edge (tapered)
  new THREE.Vector2(0.144, 0.320),   // lip
  new THREE.Vector2(0.114, 0.008),   // inner wall down to floor
  new THREE.Vector2(0.000, 0.008),   // inner floor
];
const binGeo = new THREE.LatheGeometry(pts, 48);
```

- Body material: MSM `#3C5A73`, roughness 0.55, metalness 0.15, `side: THREE.DoubleSide` (belt and braces for the floor disc). `bumpMap` = perforation canvas (a 256x256 grid of dark dots, 16 px pitch) at bumpScale 0.0008, repeat (6, 1): a hint of stamped perforation without geometry.
- Interior tint: give the lathe two materials by cloning: simplest is a second inner-only lathe (points 4..5 plus inner wall) with MSM `#1B2A3A`, roughness 0.8, inset by 0.0005. Or vertex-color the inner segment. The dark interior is what makes the bin read as a bin.
- Rim: `TorusGeometry(0.150, 0.009, 12, 48)`, rot.x 90°, y 0.320. MSM `#C8CDD1`, metalness 0.85, roughness 0.3. Give it `envMap` = a `PMREMGenerator` render of a `RoomEnvironment` so the lip catches a highlight (do this once for the whole scene: `scene.environment`, environmentIntensity 0.35).
- Base ring: `TorusGeometry(0.120, 0.005, 8, 48)`, y 0.005, same aluminum material.
- Front decal: `PlaneGeometry(0.075, 0.09)` with the Lumon droplet canvas as `alphaMap`, `MeshBasicMaterial` `#F1F3EE`, transparent, positioned at (0.75, 0.15, −4.40 + 0.137), tilted back 5.4 degrees to match the taper (atan(0.03/0.32)).
- Contact shadow disc under it (Section 3.1).
- Physics handoff for `physics.js`: inner radius r_in(y) = 0.114 + 0.030 * (y / 0.32); outer radius r_out(y) = 0.120 + 0.030 * (y / 0.32); rim torus center radius 0.150 at y 0.320, tube 0.009; floor at y 0.008; scoring trigger: ball center below y 0.26 and within r_in(y) − 0.04, with a 0.35 s dwell.

### 3.6 Wall dressing and hallway hints

| Object | Geometry | Position | Material / texture |
|---|---|---|---|
| Kier Eagan portrait | `PlaneGeometry(0.6, 0.8)` + 4 frame strips `BoxGeometry(0.64, 0.04, 0.03)` / `BoxGeometry(0.04, 0.80, 0.03)` | (0.75, 1.55, −4.985) | painting canvas (Section 3.7); frame MSM `#8C7440` metalness 0.5 |
| Portrait nameplate | `PlaneGeometry(0.18, 0.04)` | (0.75, 1.10, −4.985) | canvas "KIER EAGAN" `#12274A` on `#D9C58F` |
| Lumon globe wordmark | `PlaneGeometry(1.4, 0.8)` | (3.60, 1.50, −4.985) | `MeshBasicMaterial`, transparent, `map` = wordmark canvas |
| MDR placard | `PlaneGeometry(0.36, 0.12)` | (−1.75, 1.60, −4.985) | canvas "MACRODATA REFINEMENT" |
| Main hallway (behind door 1) | floor `PlaneGeometry(1.6, 8)`; walls `BoxGeometry(0.1, 2.4, 8)` x2; ceiling plane; end wall `BoxGeometry(1.8, 2.4, 0.1)` at z −13.1; 3 emissive panels at z −6.5, −9, −11.5 | corridor x −3.7..−2.1, z −5.2..−13 | floor MSM `#E4E7E1` roughness 0.28 metalness 0.05, `map` = linoleum speckle canvas; walls `#EDF3EC`; panels emissive `#EEF5FF` (a hair bluer than MDR); end wall carries a 0.9 m Lumon globe and a wayfinding sign canvas: "<- O&D   PERPETUITY WING ->" |
| Door 1 frame | 3x `BoxGeometry(0.05, 2.1, 0.22)` / `(1.7, 0.05, 0.22)` | around opening | MSM `#B9BEB7` |
| Door 2 (closed) | slab `BoxGeometry(1.5, 2.05, 0.05)`, frame as above, lever `BoxGeometry(0.12, 0.02, 0.02)` | x 4.4..6.0 at z −4.97 | slab MSM `#EDEFEA`; lever `#B0B4AE` metalness 0.6 |
| Break room placard + wellness sign | `PlaneGeometry(0.30, 0.10)` at (5.2, 2.25, −4.985); `PlaneGeometry(0.5, 0.12)` at (6.4, 1.60, −4.985) | | canvases: "BREAK ROOM" / "WELLNESS ->" |
| Security camera dome | `SphereGeometry(0.06, 16, 8, 0, 2π, 0, π/2)` flipped to hang, `SphereGeometry(0.004)` LED | (6.5, 2.35, −4.5), LED offset toward the desk | dome MSM `#0E0E10` roughness 0.2; LED `MeshBasicMaterial #FF2A2A` |
| Paper stack (ammo) | `BoxGeometry(0.21, 0.025, 0.297)` | (−0.10, 0.76, −1.55) | MSM `#F7F7F2` with side-edge lines canvas |
| Finger trap (delight) | `CylinderGeometry(0.012, 0.012, 0.12, 12)` rot.z 90° | north station desk (−1.55, 0.765, −3.25) | MSM `#A9C6DA` with a diagonal-stripe canvas |
| Pencil cup | `CylinderGeometry(0.035, 0.03, 0.09, 16)` + 3 thin cylinders | (−2.35, 0.795, −1.35) | MSM `#3C5A73` |

### 3.7 Procedural canvas textures (all generated at load, no files)

1. **Carpet** (256x256, repeat every 0.5 m): fill `#417F50`; per-pixel luminance noise ±7% (two octaves: 1 px white noise at 60% weight, 4 px blurred noise at 40%); then a faint 2 px checker at 3% darker to suggest loop pile. Use as `map` and `bumpMap`. `wrapS/T = RepeatWrapping`.
2. **Ceiling tile** (256x256 = one 0.6 m tile): fill `#EAEDE7`; 6 px border at `#D3D7D0` (the T-bar); 1 px pinhole speckle (random dots `#DDE0D9`, ~400 per tile); a 12 px fissure squiggle or two. Repeat (23.33, 26.67).
3. **Diffuser grid** (128x128, emissiveMap): fill `#F0F8F2`; 1 px lines every 8 px at `#DDE8E0`. Repeat (10, 5).
4. **Wall seam** (512x512 = 1.2 m of wall): fill `#F1F3EE`; a 3 px vertical seam at the right edge `#E4E7E1`; ultra-faint 1% noise so it is not flat. Repeat (segmentWidth / 1.2, 1).
5. **Partition felt** (128x128 bump): gray noise ±10%, 2 px blur.
6. **Screen** (512x384, redrawn at 12 fps, see Section 5 for animation): background `#0A1E33`; 24 px top bar with file name "Cold Harbor" left in `#A9D6E8` and "0%" right (drive this with the level's score: 0 to 100%); a 1 px `#5F86A3` rule under it; a grid of 12 columns x 8 rows of single digits in `18px "Courier New", monospace`, color `#A9D6E8`, each digit offset by a slow 2D value-noise drift (±2 px); bottom strip: five bucket boxes labeled `00`..`04` outlined `#5F86A3`, each with a fill percentage bar; footer text `0x15D2A9 : 0x0A1E33` in 9 px at `#5F86A3` (the show puts hex in the footer). Scanlines: draw 1 px lines every 3 px at rgba(0,0,0,0.18). Add a 6 px vignette. Only the two monitors that face the camera (east and north) animate; west and south use a static snapshot.
7. **Lumon globe wordmark** (1024x600, transparent): draw an ellipse rx 440, ry 250 centered, stroke 14 px `#12274A`; clip to the ellipse and draw 5 horizontal lines (stroke 10 px) at y = center ±60, ±150, ±240 (latitude bands); draw a white band 130 px tall across the equator; set "LUMON" in `900 150px "Arial Black", "Helvetica Neue", Arial, sans-serif` with manual letter spacing 0.14 em (draw char by char), color `#12274A`, centered on the band. The show's wide extended grotesque (Manifold Extended CF) is approximated by Arial Black stretched: `ctx.scale(1.25, 1)` before drawing the text.
8. **Water droplet** (128x160, alphaMap): path from the top point (64, 8) with two cubic curves down to a round bottom (radius 44 centered at (64, 108)); fill white. Reuse on the bin, the monitor badge, and the placards.
9. **Kier portrait** (256x320): radial gradient background `#3B2A1F` center to `#1E1510` edges; a dark jacket trapezoid `#1A1612` from y 200 to bottom, width 180 at top; a stern head: ellipse 60x76 at (128, 130) filled `#D8B99A` with a left-lit gradient to `#8A6A50`; hair/brow band `#3A2A22` across the top 22 px of the ellipse; a thin white collar triangle; 12 px painterly noise pass (random 2x2 rects at 4% alpha) so it reads as oil not vector; a 10 px inner border `#5A4520` (canvas frame). Stern posture, no likeness needed. Label "THE FOUNDER" in tiny serif at the bottom edge.
10. **Placards / signs**: white `#F4F6F2` field, 1 px `#B9BEB7` border, text in `600 28px Arial` `#12274A`, tracking 0.08 em, all caps.
11. **Linoleum** (256x256): fill `#E4E7E1`, 1 px speckle in `#D6D9D2` and `#EEF0EA` (~1500 dots). Repeat (3, 15).
12. **Keycap grid** (256x96): 4 rows x 12 rounded rects `#E0DAC7` on `#D9D3C0`; leave the top-left cell empty (no Escape key).
13. **Paper ball** (for `paperBall.js`, 256x256): `#F7F7F2`; horizontal rule lines every 22 px at `#BFD3E2` 1 px; a 6 px `#D9DBD4` crease noise (Perlin-ish, high contrast, thresholded to thin dark lines); a tiny "LUMON" wordmark at 10 px in the corner. Apply to a `SphereGeometry(0.04, 16, 12)` with vertex displacement ±0.006 (multiply each vertex by 1 + 0.15 * noise) so the silhouette is lumpy.

---

## 4. LIGHTING PLAN (three.js r160+, physically-correct units, no legacy lights)

Target look: sterile, evenly lit, no visible key direction, faint green cast from carpet bounce on the lower walls, slightly cool highlights. Nothing warm.

```js
renderer.toneMapping = THREE.NeutralToneMapping;   // r162+; fallback ACESFilmicToneMapping with exposure 1.12
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0xEAEFE9);
scene.fog = new THREE.Fog(0xEAEFE9, 10, 22);       // only softens the hallway end and the south expanse
RectAreaLightUniformsLib.init();                     // required for RectAreaLight (import from examples/jsm/lights/)
```

| Light | Params | Placement | Purpose |
|---|---|---|---|
| HemisphereLight | sky `#DCE8E0`, ground `#417F50`, intensity 0.55 | scene | Fill; the green ground color is what tints the lower walls and the undersides |
| RectAreaLight x6 | color `#E6F2EA`, intensity 10, width 1.2, height 0.6 | at the six panels x ∈ {−2.4, 0, 2.4}, z ∈ {−3.6, −1.2}, y 2.38, `lookAt(x, 0, z)` | Real soft top light over the play area; matches the emissive panels above them |
| DirectionalLight (shadow caster) | color `#F0F5EE`, intensity 1.4 | position (1.5, 6, −3.0), target (0.75, 0, −4.4) | Near-vertical so shadows pool under objects like fluorescents would. `castShadow`, mapSize 2048, ortho camera ±5, near 1, far 15, bias −0.0004, normalBias 0.03, radius 3 |
| Fallback for low-end / mobile | replace the 6 RectAreaLights with 6 PointLights, color `#E6F2EA`, intensity 30 (candela), decay 2, distance 0, at the same positions but y 2.30 | | PointLights are far cheaper per fragment |
| Hallway RectAreaLight x1 | color `#E8F1FF`, intensity 9, 1.2 x 0.6 | (−2.9, 2.38, −9) pointing down | Makes the hallway read brighter and cooler than MDR through the door |
| Environment | `scene.environment` = PMREM of `RoomEnvironment`, `scene.environmentIntensity = 0.35` | | Gives the bin rim, trackballs, and chair stems a highlight; keep low so walls stay matte |

Emissive panels: all 30 panels use the emissive material at intensity 1.5 so the ceiling looks uniformly lit even where there is no real light. With NeutralToneMapping they should render just under clipping (~`#F4F8F2`).

Do not add a warm light anywhere. Do not add SSAO; the contact-shadow discs and the hemisphere ground color do the job. If the walls look too flat, raise `environmentIntensity` to 0.5 before touching light intensities.

Green cast check: the bottom 0.4 m of the white walls should visibly lean green (`#DCE4DA`-ish) compared to eye level (`#E4E8E1`). If it does not, raise the hemisphere ground color saturation, not intensity.

---

## 5. SMALL DELIGHTS (2-3 minutes of build time each)

1. **Scary numbers.** Every 8-14 s, the east and north screens pick a random 3x3 cluster of digits and, over 2.5 s, scale them to 1.35x, jitter ±3 px, and lift their color to `#E8F6FC`, then ease back. Once per level, the cluster "runs" one cell per frame for a second before settling. Redraw at 12 fps and set `texture.needsUpdate = true` only on those two monitors.
2. **Refinement progress.** The header on the player's screen shows the score as a file percentage ("Cold Harbor 40%"), and the five bucket bars fill in order: every 20 points fills one bucket. At 100% the screen flashes a single line, "FILE COMPLETE. PLEASE PROCEED TO YOUR NEXT ASSIGNMENT," and holds it during the level transition.
3. **Pulley cords on the partitions.** Four thin cords at the outer end of each divider, with the east partition (the player's) hanging 4 cm lower than the rest: someone lowered it to talk.
4. **Security dome with a breathing LED.** Red LED emissive intensity oscillates 0.3 to 1.0 on a 2 s sine. After 3 consecutive misses, the dome group `lookAt`s the camera for one second, then returns.
5. **Ceiling tile rattle.** When the ball hits the ceiling, nudge the nearest panel's y by −0.01 for 120 ms and play the HUD line "Ceiling contact has been logged." The ceiling being in play is on-theme; make it feel intentional.
6. **Kier banks.** If a scoring shot touched the north wall first, the HUD says "Kier smiles upon this throw." Add a 1-frame +0.15 emissive flicker on the portrait plane.
7. **Two loose paper balls near the bin** at load, plus the paper stack on the desk that visibly shrinks by one sheet (scale y) per throw and refills from a "new file" animation every 10 throws.
8. **Hallway wayfinding.** The main hallway's end wall sign reads "<- OPTICS & DESIGN     PERPETUITY WING ->". The right door's placard reads "BREAK ROOM" with a second, smaller line: "Refiners are reminded that the break room is not a reward."
9. **Finger trap on the north desk** in powder blue with diagonal stripes; it rolls 5 mm when the ball lands on the desk near it (optional physics nicety).
10. **Idle screensaver.** After 20 s without a throw, the west and south monitors switch to a slow-rotating Lumon droplet on navy (draw the droplet canvas onto the screen canvas, rotate 0.3 rad/s).

### HUD copy (Lumon corporate voice: calm, formal, faintly menacing, second person)

Title / start:
- "Welcome, refiner. Please enjoy each paper ball equally."
- "The work is mysterious and important. The bin is neither."
- "Drag to aim. Release to refine."

Tutorial hints:
- "A visible arc is provided for your comfort."
- "Gravity is a gift from the Founder. Use it wisely."
- "The ceiling is 2.4 meters. Please act accordingly."

On score (+10):
- "Refinement acknowledged. +10."
- "Your outie would be proud, if permitted to know."
- "A serene throw. Serenity is a Lumon core value."
- "Kier smiles upon this throw." (bank shots only)

On miss:
- "This throw has been logged."
- "Discrepancy noted. Please remain composed."
- "The paper has not been refined. Try again with grace."
- "A handshake is available upon request. A retry is available now."

Streaks:
- 3 in a row: "You are eligible for a finger trap."
- 5 in a row: "A waffle party is under consideration."
- 8 in a row: "Ms. Cobel has been notified. This is neither good nor bad."

Score milestones:
- 50: "Cold Harbor is 50% complete. Do not discuss this with your outie."
- 90: "One more. Remain calm. Calmness is mandatory."

Level complete (100):
- "FILE COMPLETE. Lumon thanks you for your service. Please proceed to the Perpetuity Wing."
- Sub-line: "Your reward: a beach. You will not remember requesting it."

Pause / resume:
- "Work has been paused. The numbers will wait. They always do."
- "Welcome back. You were missed by no one, as designed."

Fail-safe lines (ball stuck, out of bounds, reset):
- "The paper ball has left the severed floor. A replacement has been issued."
- "Please do not attempt to retrieve the ball. That is not your department."

Typography for the HUD: a wide, extended bold grotesque for headings (`"Arial Black"` scaled 1.2x horizontally via CSS `transform: scaleX(1.2)` or `font-stretch` where available), all caps, tracking 0.12 em, color `#12274A` on a `#F1F3EE` card with a 1 px `#B9BEB7` rule. Body lines in 14 px `"Helvetica Neue", Arial`. Score digits in `"Courier New"` at `#A9D6E8` on a `#0A1E33` chip, mirroring the terminal.