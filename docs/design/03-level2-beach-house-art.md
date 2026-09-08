# Trashketball — Level 2 Art Direction: "Casa Marea"

A high-ceilinged modern beach house living room, mid-afternoon, bright and expensive. Everything below is in Three.js world units = meters, Y up, camera looking toward −Z (the ocean). All geometry is primitives; all textures are canvas-generated at startup.

**Look in one sentence:** a whitewashed-oak, limewash-plaster, boucle-and-brass room that is mostly *window*, with diagonal sun bars raking across a wool rug, a turquoise sea sparkling behind a matte-black bin.

**Time of day decision:** bright afternoon (the "bright noon" look, white light, blue sky; **not** golden hour, no orange). The sun is placed at 28° elevation so it reaches 9 m into the room and paints mullion shadows on the floor.

---

## 1. Palette

| Role | Hex | Notes |
|---|---|---|
| Floor, whitewashed oak base | `#E8DCC8` | plank variation `#DED0B8` … `#F0E6D4`; grain `#C9B89C`; plank gaps `#B8A88E` |
| Walls, limewash plaster | `#F4F0E8` | mottling ±3% lightness |
| Ceiling | `#F7F4EE` | |
| Timber beams (bleached oak) | `#C6AE87` | grain `#A88F6A`, knots `#8E7454` |
| Window mullions / frame | `#2A2622` | bronze-black, roughness 0.5, metalness 0.6 |
| Sofa L fabric (cream boucle) | `#EDE6DA` | nub shadow `#DAD1C2` |
| Sofa R fabric (sage velvet) | `#8FA697` | sheen color `#C9DCCF` |
| Pillows | rust `#C1704A`, ochre `#D9A65B`, oat linen `#E3D6C3`, navy `#2E4A6B`, stripe `#C9B79C` on `#E3D6C3` | |
| Rug (ivory wool) | `#D9CDB8` | weave `#C8BBA4`, border `#B5A88F` |
| Coffee table marble | `#F2EFE9` | veins `#B9AFA3`, warm veins `#C9B79C`; plinth travertine `#D8CDB9` |
| Brass accents | `#C9A46A` | metalness 0.95, roughness 0.28 |
| **Bin (matte black, tapered)** | `#1E1D1B` | interior `#34322F`; brass lip ring `#C9A46A` |
| Deck (ipe) | `#8C6A48` | grooves `#6E5237` |
| Sand dry | `#E9DAB8` | wet `#C8B48F`, far `#DDD0B4`, speckles `#F5ECD8` |
| Foam | `#F6FAF9` | |
| Sea near (shallow) | `#3FC1C0` | |
| Sea mid | `#1F8FB0` | |
| Sea far | `#0F5F8F` | |
| Sky zenith | `#4A8FD9` | |
| Sky mid | `#8FC0EA` | |
| Sky horizon / fog | `#DCEAF1` | |
| Sun haze (near sun, low) | `#EFE6D3` | |
| Sun disk | `#FFF6E0` | glow sprite `#FFE7B0` |
| Sun light color | `#FFF3DC` | |
| Pendant bulb warm | `#FFD3A0` | |
| Plant foliage | fig `#3E6B3A` / `#5A8A4C`; olive `#8A9A7E` / underside `#B8C2AE` | pots `#CFC5B4` (concrete) |

**Bin choice rationale:** matte-black tapered (Vipp-style) wins over rattan (vanishes against oak/cream, low contrast at 4 m) and brushed steel (glares against the window). Black silhouettes crisply against the bright glass and pale floor, and the thin brass lip ring reads as a target marker from 4.5 m.

---

## 2. Room dimensions and layout

- Interior: **12 m wide (x −6…+6), 9 m deep (z −5…+4), 5.5 m ceiling (y 0…5.5)**.
- Window wall: entire far wall at **z = −5**, floor to ceiling, 5 panes of 2.4 m.
- The house sits on a plinth; the deck outside is at y = 0, sand starts 0.4 m below that and slopes to the water at y = −1.1 about 27 m out.

### Top-down (1 column = 0.25 m in x, 1 row = 0.5 m in z; +x right, window at top)

```
x:  -6      -4      -2       0       2       4       6
     |       |       |       |       |       |       |
 -5.0 M=========M========M=========M========M=========M   glass wall, M = mullions x=-6,-3.6,-1.2,1.2,3.6,6
 -4.5 |~~~~~~~                      B   F             |   ~ sheer curtain  B bin (1.6,-4.3)  F fig (2.6,-4.4)
 -4.0 |    P         ...................              |   P olive tree (-4.8,-4.2)   . rug edge
 -3.5 |              .LL              RRRRR           |   L curved boucle sofa (4 modules)
 -3.0 |              .   LTTTTTTT     RRRRR           H   T marble coffee table (-0.2,-2.3)
 -2.5 |              L* L TToTTTo     RRRRR           H   R velvet sofa (2.5,-2.2)   H fireplace chunk
 -2.0 |              LL L TTTToTT     RRRRR           H   o pendants (y 3.4-3.75)   * ceiling fan (y 4.75)
 -1.5 |              .   L            RRRRR           |
 -1.0 A              .LL              RRRRR           |   A wall art on left wall
 -0.5 |     l        ...................              |   l floor lamp (-4.6,-0.6)
 +0.0 |                        @                      |   @ CAMERA (0.3, 1.6, 0.0)
 +0.5 |                                               |
 +1.0 |                   KKKKKKKKKKK                 |   K kitchen island (behind player)
 +1.5 |                   KKKKKKKKKKK                 |
 +2.0 |                   KKKKKKKKKKK                 |
 +2.5 |                                               |
 +3.0 |                                               |
 +3.5 |                                               |
 +4.0 |###############################################|   back wall
```

### Key coordinates

| Thing | Position / extent |
|---|---|
| **Camera** | `(0.3, 1.6, 0.0)`, lookAt `(1.15, 1.05, −4.3)` → yaw 11° right, pitch −7°. `PerspectiveCamera(58, aspect, 0.05, 1200)`. Player is leaning on the kitchen island. |
| **Bin** | base center `(1.6, 0, −4.3)`; horizontal distance to camera **4.49 m** (4.77 m straight line). Sits in the lower-center-right of frame, silhouetted against the glass. |
| Bank surfaces around the bin | glass at z = −5 (0.55 m behind the bin's back edge), mullion at x = 1.2, fig pot 0.57 m to the right, velvet sofa arm 0.25 m right / 0.9 m nearer. |
| Throw lane | straight line camera→bin passes x = 0.86…1.13 across the table's z range; the table's right edge is at x = 0.6, so a clean throw clears it by ≥ 0.26 m. Short/left throws clip the marble corner: fair hazard. |
| Curved boucle sofa (L) | arc center `C = (0.4, 0, −2.3)`, module radius 2.35, modules at θ = 153°, 171°, 189°, 207°. Occupies x −2.5…−1.3, z −3.7…−0.9, faces the table. |
| Velvet sofa (R) | center `(2.5, 0, −2.2)`, 2.4 m long along z, 0.95 deep, faces −x. |
| Coffee table | center `(−0.2, 0, −2.3)`, 1.6 × 0.9, top at y 0.36. |
| Rug | center `(0, 0, −2.3)`, 4.6 × 3.6. |
| Pendants | `(−0.6, 3.5, −2.3)` r 0.42, `(0.1, 3.75, −2.0)` r 0.32, `(0.6, 3.4, −2.7)` r 0.36. Shade bottoms ≥ 3.4 m; a 55° lob to the bin apexes at 3.1 m, a 60° lob at 3.44 m, so pendants are only hit by silly throws. |
| Ceiling fan | hub `(−1.9, 4.75, −2.3)`, above sofa L, out of the lane. |
| Kitchen island | box x −0.9…1.5, z 0.95…1.85, y 0…0.92 (behind camera). |
| Sun | direction (toward sun) `(0.441, 0.469, −0.765)` = azimuth 30° right of −z, elevation 28°. Through the glass it sits at `(3.2, 4.7, −5)`: just above the default frame; its glow and the water glint are in frame. |

---

## 3. Build list

Notation: `RBox(w,h,d,r)` = `RoundedBoxGeometry(w,h,d, segments 4, radius r)`. `Phys` = `MeshPhysicalMaterial`, `Std` = `MeshStandardMaterial`. Positions are centers unless noted. Every static mesh: `castShadow = receiveShadow = true` except glass, curtain, sky, water.

### 3.1 Shell

| Object | Geometry | Position | Material |
|---|---|---|---|
| Floor | `PlaneGeometry(12, 9)` rot −90° x | `(0, 0, −0.5)` | `Phys{ map: oakTex (repeat 3, 2.25), roughnessMap: oakRough, roughness 0.6, clearcoat 0.15, clearcoatRoughness 0.5 }` matte-oiled sheen |
| Ceiling | `PlaneGeometry(12, 9)` rot +90° x | `(0, 5.5, −0.5)` | `Std{ color #F7F4EE, roughness 0.95 }` |
| Left / right walls | `PlaneGeometry(9, 5.5)` | `(±6, 2.75, −0.5)` facing in | `Std{ map: plasterTex (repeat 3,2), color #F4F0E8, roughness 0.96 }` |
| Back wall | `PlaneGeometry(12, 5.5)` | `(0, 2.75, 4)` facing −z | same plaster |
| Spine beam | `BoxGeometry(0.30, 0.42, 9)` | `(0, 5.29, −0.5)` | `Std{ map: timberTex, roughness 0.8 }` |
| Cross beams ×5 | `BoxGeometry(12, 0.30, 0.22)` | z = −4.2, −2.2, −0.2, 1.8, 3.8; y 5.35 | timber |
| Fireplace chunk | `BoxGeometry(0.5, 5.5, 2.4)` + inset `BoxGeometry(0.3, 0.5, 1.2)` | `(5.75, 2.75, −2.5)`, inset `(5.5, 0.55, −2.5)` | plaster; inset `Std{ color #151413, roughness 0.9 }` |
| Wall art | `BoxGeometry(0.04, 1.2, 1.6)` + frame edges 0.03 | `(−5.97, 2.1, −1.0)` | canvas: `#F2EDE4` ground, three soft radial blobs `#D9C7A6`, `#7FA6B8`, `#C1704A`, blur 40 px; oak frame |
| Kitchen island | `RBox(2.4, 0.9, 0.9, 0.02)` + top `RBox(2.5, 0.04, 1.0, 0.01)` | `(0.3, 0.45, 1.4)`, top y 0.92 | front: oak slats (timberTex, repeat 12,1); top: marble |

### 3.2 Window wall (z = −5)

| Object | Geometry | Position | Material |
|---|---|---|---|
| Vertical mullions ×6 | `BoxGeometry(0.08, 5.5, 0.14)` | x = −6, −3.6, −1.2, 1.2, 3.6, 6; y 2.75 | `Std{ color #2A2622, roughness 0.5, metalness 0.6 }`; **castShadow true** (these draw the sun bars) |
| Transom | `BoxGeometry(12, 0.06, 0.14)` | `(0, 3.4, −5)` | same |
| Sill / head | `BoxGeometry(12, 0.06, 0.14)` | y 0.03 and 5.47 | same |
| Glass | one `PlaneGeometry(12, 5.5)` | `(0, 2.75, −5)` | `Phys{ color #DCEBEA, transparent, opacity 0.08, roughness 0.04, metalness 0, envMapIntensity 0.25, depthWrite false }`, `renderOrder 10`, no shadows. Do **not** use `transmission` (extra render pass, sorting pain); a faint tinted plane + env reflection reads as glass. |
| Sheer curtain | `PlaneGeometry(1.6, 5.4, 12, 40)` | `(−5.0, 2.7, −4.7)` | `Std{ color #F6F1E8, transparent, opacity 0.55, side DoubleSide, roughness 1 }`; per-frame vertex sway (see §6) |
| Roof overhang (exterior) | `BoxGeometry(13, 0.35, 2.2)` | `(0, 5.675, −6.1)` | `Std{ color #F4F0E8 }`; castShadow. Shades the deck and the floor behind z ≈ 1.8 (kitchen side), leaving the living area sunlit. |
| Deck | `BoxGeometry(12, 0.12, 3.2)` | `(0, −0.06, −6.6)` | oak generator with ipe palette (`#8C6A48`/`#6E5237`), repeat 1,8 |
| Deck plinth face | `BoxGeometry(12, 0.6, 0.15)` | `(0, −0.42, −8.25)` | plaster |
| Balustrade | `PlaneGeometry(12, 1.05)` + `CylinderGeometry(0.02, 0.02, 12)` rail | `(0, 0.525, −8.2)`, rail y 1.06 | glass material; rail `#2A2622` |

### 3.3 Sofa L: curved cream boucle (the hero)

Four modules on an arc, arc center `C = (0.4, 0, −2.3)`, module center radius R = 2.35. For module i with θ ∈ {153°, 171°, 189°, 207°} (radians):

```js
group.position.set(C.x + R*Math.cos(θ), 0, C.z + R*Math.sin(θ));
group.rotation.y = Math.PI/2 - θ;   // local +Z points radially outward (back of sofa), local X tangential
```

Per module (local coords, y up, +z = toward the back):

| Part | Geometry | Local position | Notes |
|---|---|---|---|
| Body (fabric to floor) | `RBox(0.74, 0.42, 0.95, 0.16)` | `(0, 0.21, 0)` | puffy base |
| Seat cushion | `RBox(0.72, 0.16, 0.80, 0.08)` | `(0, 0.50, −0.05)` | scale y 0.92 near the front edge is optional; a `−0.03` random y jitter per module sells "sat on" |
| Back cushion | `RBox(0.72, 0.48, 0.26, 0.13)` | `(0, 0.66, 0.345)`, `rotation.x = −10°` (leans outward) | |
| End bolsters ×2 (θ = 139° and 221°, R = 2.35) | `RBox(0.30, 0.55, 0.95, 0.14)` | y 0.30 | rounded arm ends |

Material (shared): `Phys{ map: boucleTex (repeat 3,3), bumpMap: boucleTex, bumpScale 0.012, roughness 0.95, metalness 0, sheen 0.5, sheenColor #FFFFFF, sheenRoughness 0.85, envMapIntensity 0.3 }`. Pillows on it: 2 ochre `#D9A65B`, 1 navy `#2E4A6B`, 1 stripe: `RBox(0.5, 0.5, 0.14, 0.05)`, scale y 0.9, leaning 12° against back cushions at modules 1, 2, 4, random ±8° yaw. Pillow material `Std{ map: linenTex, color, roughness 0.9 }` (stripe pillow uses stripeTex).

### 3.4 Sofa R: sage velvet 2.5-seater with bolster arms

Group at `(2.5, 0, −2.2)`, length along z, faces −x.

| Part | Geometry | Position (world) | Notes |
|---|---|---|---|
| Plinth | `RBox(0.85, 0.14, 2.3, 0.03)` | `(2.5, 0.07, −2.2)` | oak (timberTex) or brass-toned `#C9A46A` band; pick brass |
| Seat body | `RBox(0.95, 0.34, 2.4, 0.10)` | `(2.5, 0.31, −2.2)` | velvet |
| Seat cushions ×2 | `RBox(0.72, 0.14, 1.12, 0.06)` | `(2.45, 0.55, −2.2 ± 0.58)` | velvet |
| Back | `RBox(0.22, 0.42, 2.4, 0.10)` | `(2.865, 0.69, −2.2)`, `rotation.z = +8°` (top leans to +x) | velvet |
| Back cushions ×2 | `RBox(0.16, 0.40, 1.10, 0.07)` | `(2.675, 0.72, −2.2 ± 0.58)`, `rotation.z = +12°` | velvet |
| Bolster arms ×2 | `CapsuleGeometry(0.13, 0.75, 8, 24)` rotated to lie along x | `(2.5, 0.58, −3.4)` and `(2.5, 0.58, −1.0)` | velvet |
| Pillows ×3 | `RBox(0.5,0.5,0.14,0.05)` | rust ×2, oat ×1, against the back | linen |

Velvet: `Phys{ color #8FA697, roughness 0.72, metalness 0, sheen 1.0, sheenColor #C9DCCF, sheenRoughness 0.45, envMapIntensity 0.35 }`. The sheen term gives the light-catching nap; no texture needed.

### 3.5 Coffee table and tabletop props

| Part | Geometry | Position | Material |
|---|---|---|---|
| Top | `RBox(1.6, 0.05, 0.9, 0.02)` | `(−0.2, 0.335, −2.3)` | `Phys{ map: marbleTex, roughness 0.18, clearcoat 0.5, clearcoatRoughness 0.12, envMapIntensity 1.2 }` |
| Plinth | `RBox(1.0, 0.30, 0.5, 0.03)` | `(−0.2, 0.15, −2.3)` | marbleTex tinted `#D8CDB9`, roughness 0.5 (travertine) |
| Ceramic bowl | `LatheGeometry` profile `[(0,0),(0.10,0),(0.17,0.03),(0.20,0.08),(0.19,0.11)]`, 48 segs | `(−0.6, 0.36, −2.5)` | `Std{ color #E4DED4, roughness 0.5 }` |
| Magazine | `BoxGeometry(0.23, 0.006, 0.30)` | `(0.2, 0.363, −2.1)`, yaw 12° | cover canvas: `#F5F1EA` ground, a 0.6-height block of sea gradient (`#3FC1C0`→`#0F5F8F`), serif masthead "SURF & SAND" `#1E1D1B`, small caps "THE COASTAL ISSUE" |
| Books ×2 stacked | `BoxGeometry(0.24, 0.03, 0.32)` | `(−0.15, 0.375/0.405, −2.2)`, yaw −6° / 4° | `#2E4A6B` and `#E3D6C3`, spine label strip `#C9A46A` |
| Candle | `CylinderGeometry(0.04, 0.04, 0.09, 24)` | `(0.35, 0.405, −2.45)` | `#F3EEE6`, roughness 0.4 |

### 3.6 Rug

`RBox(4.6, 0.018, 3.6, 0.008)` at `(0, 0.009, −2.3)`. `Std{ map: rugTex (repeat 4,3), bumpMap: rugTex, bumpScale 0.006, roughness 1.0 }`. The 8 mm radius softens the edge so the sun bars break slightly at the rug edge.

### 3.7 The bin (matte black, tapered)

World position `(1.6, 0, −4.3)`. Height 0.32, mouth radius 0.15, base radius 0.11.

| Part | Geometry | Position | Material |
|---|---|---|---|
| Outer shell | `CylinderGeometry(0.15, 0.11, 0.32, 48, 1, true)` | y 0.16 | `Phys{ color #1E1D1B, roughness 0.85, metalness 0.05, envMapIntensity 0.4 }`, `side: FrontSide` |
| Inner shell | same geometry, scale 0.97, `side: BackSide` | y 0.16 | `Std{ color #34322F, roughness 0.9 }` (slightly lighter so the hollow reads) |
| Floor disc | `CircleGeometry(0.11, 48)` rot −90° | y 0.008 | inner material |
| Brass lip | `TorusGeometry(0.15, 0.009, 12, 64)` rot 90° x | y 0.32 | brass; `emissive #000` (pulses on score, §6) |
| Foot ring | `TorusGeometry(0.11, 0.006, 8, 48)` | y 0.006 | `#1E1D1B` |

Physics colliders: rim torus R 0.15 r 0.012 (use 0.012 not 0.009 for forgiveness), tapered inner wall (approximate as cylinder r 0.145), outer wall, floor disc. Score trigger: ball center descends through y = 0.22 within horizontal radius 0.12 of the axis.

### 3.8 Plants

**Fiddle-leaf fig** at `(2.6, 0, −4.4)`: pot `CylinderGeometry(0.30, 0.24, 0.55, 32)` y 0.275 concrete `#CFC5B4` roughness 0.9; soil disc `#4A3B2E`; trunk `CylinderGeometry(0.02, 0.03, 1.3, 8)` y 1.2 `#5E4A38`; 5 branches (thin cylinders, 0.35–0.5 m, tilted 30–50° at heights 1.2–2.0); 22 leaves: `ShapeGeometry` from a fiddle-leaf outline (CatmullRom through 8 points, ~0.22 × 0.30 m), `DoubleSide`, `Std{ map: leafTex, color #3E6B3A…#5A8A4C, roughness 0.6 }`, each leaf pitched down 20–40°, random yaw. Tallest leaf y ≈ 2.2. Pot is a physics cylinder (e 0.45).

**Olive tree** at `(−4.8, 0, −4.2)`: pot `CylinderGeometry(0.34, 0.28, 0.6, 32)`; trunk `CylinderGeometry(0.035, 0.05, 1.6)` with two branch cylinders; canopy = `InstancedMesh` of 450 `PlaneGeometry(0.04, 0.11)` leaves scattered in an ellipsoid (rx 0.9, ry 0.7, rz 0.9) centered y 2.3, random orientation, `DoubleSide`, colors lerped `#8A9A7E`↔`#B8C2AE`. Reads as silver-green from 6 m.

### 3.9 Pendants, fan, floor lamp

**Pendants ×3** (positions in §2): shade `SphereGeometry(r, 32, 16, 0, 2π, 0, π/2)` flipped so the dome is up and the opening down (`rotation.x = π`), `Std{ map: rattanTex, alphaMap: rattanTex, transparent, alphaTest 0.4, side DoubleSide, roughness 0.9 }`; cable `CylinderGeometry(0.004, 0.004, 5.5 − y_top)` `#1E1D1B`; bulb `SphereGeometry(0.03)` `MeshBasicMaterial{ color #FFD3A0 }`; PointLight at the bulb (§5).

**Ceiling fan** at `(−1.9, 4.75, −2.3)`: downrod `CylinderGeometry(0.015, 0.015, 0.6)`; motor `CylinderGeometry(0.09, 0.09, 0.14, 32)` `#2A2622`; 4 blades `BoxGeometry(0.75, 0.012, 0.12)` centered 0.45 m from the hub, `rotation.x = 12°` on their long axis, timber material. Blades group rotates 0.9 rad/s.

**Floor lamp** at `(−4.6, 0, −0.6)`: base disc `CylinderGeometry(0.16, 0.16, 0.02)` brass; pole `CylinderGeometry(0.012, 0.012, 1.5)` brass; shade `CylinderGeometry(0.18, 0.22, 0.28, 32, 1, true)` at y 1.5, linen `#F0E8DA` DoubleSide; PointLight inside.

### 3.10 Procedural canvas textures (all generated once at load; `colorSpace = SRGBColorSpace` for color maps, `RepeatWrapping`, anisotropy 8)

| Name | Size | Recipe |
|---|---|---|
| `oakTex` / `oakRough` | 2048² covers 4 × 4 m | Planks 0.18 m wide (92 px) × 2.2 m long with random stagger per row. Per plank fill from 5-swatch set `#DED0B8 #E8DCC8 #EDE2D0 #F0E6D4 #E2D4BC`. Grain: 70 lines per plank, `rgba(120,95,60,0.07)`, 1 px, wobbling `x += 3*sin(y*0.02 + seed)`. 0–2 knots per plank: ellipse 8×5 px `rgba(140,110,70,0.35)` with 3 concentric rings. Plank gaps 2 px `#B8A88E`. Roughness map: fill `#8C8C8C` (0.55), gaps `#E0E0E0`, grain lines `#A0A0A0` at low alpha. |
| `rugTex` | 1024² covers 1.15 × 1.2 m | Fill `#D9CDB8`. Weave: 4 px stitches in alternating rows/cols (over-under: draw horizontal dashes on even rows, vertical dashes on odd cols) at `#C8BBA4` alpha 0.5; per-stitch lightness jitter ±6. Then a 6 px border stripe `#B5A88F` inset 4% on the outermost repeat only (draw the border on a second 4 × 3-repeat canvas if you want one clean border; else skip the border). |
| `boucleTex` | 512² | Fill `#EDE6DA`. 20 000 circles r 1–2.5 px, random `hsl(38, 22%, 84–92%)`, plus 3000 tiny arcs (loops) `rgba(170,160,145,0.35)` 1 px. Slight `blur(0.4px)`. Used as map and bump. |
| `marbleTex` | 1024² | Fill `#F2EFE9`. Cloud layer: 40 large soft radial gradients `rgba(200,192,180,0.12)` r 100–300 px. Veins: 7 long bezier curves (random start on an edge, 3–5 control points across the canvas) `#B9AFA3` width 1.5–3 px alpha 0.6, each with 2–4 branches at 40% width; 2 veins in `#C9B79C`. Final `blur(1.2px)`, then re-draw 30% of vein length sharp. |
| `rattanTex` | 512² (RGBA) | Transparent fill. Weave of 14 px strips: horizontal strips `#C9A56E` every 20 px, vertical strips `#B8934F` every 20 px, alternating over/under by skipping the intersection on odd cells; strip edges 2 px darker `#8E6E3A`; 6 px square holes left transparent. Alpha channel doubles as `alphaMap`. |
| `plasterTex` | 512² | Fill `#F4F0E8`; 600 soft blobs r 20–80 px `rgba(220,210,195,0.05)`; 3000 pixels `rgba(0,0,0,0.03)`. Repeat 3,2. |
| `timberTex` | 512 × 2048 | Fill `#C6AE87`; 300 vertical grain lines `rgba(120,95,60,0.10)`, wobble `x += 4*sin(y*0.01)`; 4 knots per texture; every 40 px a 1 px `rgba(90,70,45,0.15)` band for ring cadence. |
| `sandTex` | 1024² covers 8 × 8 m | Fill `#E9DAB8`; 40 000 speckles 1 px alternating `#C8B48F` / `#F5ECD8` alpha 0.5; 20 low-frequency blobs `rgba(200,180,140,0.08)` r 200–400. Faint ripple lines: 30 sinusoidal strokes `rgba(180,160,120,0.06)`. |
| `noiseTex` | 256² RGBA, `LinearFilter`, RepeatWrapping, `colorSpace = NoColorSpace` | Value noise via ImageData: 4 octaves (period 64, 32, 16, 8 px, weights 0.5/0.25/0.15/0.1), independent seeds in R, G, B, A. Shared by water and sand shaders. |
| `linenTex` / `stripeTex` | 256² | Linen: fill color-neutral `#FFFFFF`, 1 px crosshatch grid every 3 px `rgba(0,0,0,0.06)` (tint via material `color`). Stripe: alternating 40 px bands `#E3D6C3` / `#C9B79C`. |
| `leafTex` | 256² | `#3E6B3A` fill, lighter midrib and 6 side veins `rgba(200,220,180,0.35)` 2 px, radial darkening at the edge. |
| `sunGlowTex` | 256² | Radial gradient: `rgba(255,231,176,1)` at 0 → `rgba(255,231,176,0.35)` at 0.25 → transparent at 1. |

---

## 4. The view beyond the window

Layering, back to front: sky dome → sun glow sprite → far water → near water → sand → deck → glass. Fog handles the horizon.

### 4.1 Sky dome

`SphereGeometry(450, 48, 24)`, `side: BackSide`, `ShaderMaterial`, `depthWrite: false`, `fog: false`, `renderOrder: −1`, positioned at the origin (camera barely moves).

```glsl
// vertex
varying vec3 vDir;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
// fragment
uniform vec3 uZenith, uMid, uHorizon, uHaze, uSunDir, uSunColor;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
  col = mix(col, uZenith, smoothstep(0.18, 0.9, h));
  float sd = max(dot(d, uSunDir), 0.0);
  col = mix(col, uHaze, pow(sd, 3.0) * 0.35 * (1.0 - h));          // warm haze around the sun near the horizon
  col += uSunColor * (pow(sd, 1200.0) * 6.0                          // disk (~1.5° radius after tone mapping)
                    + pow(sd, 40.0) * 0.35                           // corona
                    + pow(sd, 8.0) * 0.06);                          // wide halo
  if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.9, clamp(-d.y * 4.0, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
```
Uniforms: `uZenith #4A8FD9`, `uMid #8FC0EA`, `uHorizon #DCEAF1`, `uHaze #EFE6D3`, `uSunDir (0.441, 0.469, −0.765)`, `uSunColor #FFF6E0`.

### 4.2 Sun glow sprite

`Sprite` with `SpriteMaterial{ map: sunGlowTex, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity 0.85 }`, position `(167.8, 178.4, −290.6)` (380 m along `uSunDir`), scale `(70, 70, 1)`. Mullions correctly occlude it; the halo spills across the top-right panes.

### 4.3 Ocean

Two meshes, both with the same `ShaderMaterial` (`fog: true`, `transparent: true`, uniforms merged with `THREE.UniformsLib.fog`):

- **Near water**: `PlaneGeometry(160, 160, 320, 320)` (0.5 m vertex spacing) rotated −90° x, center `(0, −1.10, −90)`. Gets full vertex waves.
- **Far water**: `PlaneGeometry(900, 900, 40, 40)`, center `(0, −1.12, −300)`. Set `uWaveScale = 0.35` so only the long swell displaces; ripples come from the noise normals.

Water level is **y = −1.10**. Shoreline is where the sand height function crosses that: z ≈ −27 (wobbling ±4 m in x).

```glsl
// shared with sand shader: sand height in world space
float sandH(vec2 xz){
  float s = -0.4 - (-6.0 - xz.y) * 0.033;          // gentle 1:30 slope away from the deck
  s += 0.12 * sin(xz.x * 0.045) + 0.05 * sin(xz.x * 0.13 + 1.7);   // shoreline wobble
  return s;
}

// ---- vertex ----
uniform float uTime, uWaveScale;
varying vec3 vWorldPos, vNormal;
#include <fog_pars_vertex>
// (dir.x, dir.z, amplitude m, wavelength m)
const vec4 W0 = vec4( 0.80, 0.60, 0.12, 14.0);
const vec4 W1 = vec4(-0.35, 0.94, 0.06,  6.5);
const vec4 W2 = vec4( 0.55,-0.83, 0.03,  2.8);
float wave(vec4 w, vec2 p, float t, out vec2 grad){
  float k = 6.28318 / w.w;
  float c = sqrt(9.81 / k);                 // deep-water phase speed: long waves move faster, feels real
  float ph = k * dot(w.xy, p) - k * c * t;
  grad = w.xy * (w.z * k * cos(ph));
  return w.z * sin(ph);
}
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 g0, g1, g2;
  float h = wave(W0, wp.xz, uTime, g0) + wave(W1, wp.xz, uTime, g1) + wave(W2, wp.xz, uTime, g2);
  float depth = clamp((-1.10 - sandH(wp.xz)) * 0.5, 0.0, 1.0);     // flatten waves as they reach the beach
  h *= uWaveScale * depth;
  vec2 g = (g0 + g1 + g2) * uWaveScale * depth;
  wp.y += h;
  vNormal = normalize(vec3(-g.x, 1.0, -g.y));
  vWorldPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}

// ---- fragment ----
uniform vec3 uSunDir, uSunColor, uNear, uMid, uFar, uSky, uFoam;
uniform sampler2D uNoise; uniform float uTime;
varying vec3 vWorldPos, vNormal;
#include <fog_pars_fragment>
void main(){
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec2 n1 = texture2D(uNoise, vWorldPos.xz * 0.08 + uTime * vec2(0.020, 0.013)).rg * 2.0 - 1.0;
  vec2 n2 = texture2D(uNoise, vWorldPos.xz * 0.21 - uTime * vec2(0.017, 0.024)).rg * 2.0 - 1.0;
  vec3 N = normalize(vNormal + vec3(n1.x + n2.x, 0.0, n1.y + n2.y) * 0.18);

  float sh = sandH(vWorldPos.xz);
  float depth = -1.10 - sh;                                    // m of water under this pixel
  float d = length(cameraPosition.xz - vWorldPos.xz);
  vec3 base = mix(uNear, uMid, smoothstep(0.3, 3.0, depth));   // turquoise shallows -> mid
  base = mix(base, uFar, smoothstep(40.0, 260.0, d));          // -> deep blue far out
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 col = mix(base, uSky, fres * 0.85);

  float spec = pow(max(dot(reflect(-uSunDir, N), V), 0.0), 220.0);
  vec2 toFrag = normalize(vWorldPos.xz - cameraPosition.xz);
  float path = pow(max(dot(toFrag, normalize(uSunDir.xz)), 0.0), 40.0);   // sun-path streak toward the sun's azimuth
  col += uSunColor * (spec * 2.5 + path * fres * 0.30);

  float foam = smoothstep(0.35, 0.0, depth) * texture2D(uNoise, vWorldPos.xz * 0.5 + uTime * 0.05).b;
  col = mix(col, uFoam, foam * 0.8);

  float alpha = clamp(depth / 0.9, 0.15, 1.0);                  // see wet sand through the last ~25 m
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}
```
Uniforms: `uNear #3FC1C0`, `uMid #1F8FB0`, `uFar #0F5F8F`, `uSky #BFD9F0`, `uFoam #F6FAF9`, `uSunColor #FFF6E0`. From the camera 2.7 m above the water the sun glint reads as scattered sparkle across the sea to the right of center, with the `path` term drawing the bright streak under the sun.

### 4.4 Sand

`PlaneGeometry(400, 130, 240, 80)` rotated −90° x, center `(0, 0, −71)` so it spans z −6…−136 and x ±200. On the CPU, set each vertex `y = sandH(x, z)` (same function, ported to JS), then `computeVertexNormals()`. Material: `ShaderMaterial` (or `MeshStandardMaterial` + `onBeforeCompile`; the custom one is simpler), `fog: true`:

```glsl
// fragment (vertex just passes vWorldPos, vNormal, fog)
uniform vec3 uDry, uWet, uFoam, uSunDir; uniform sampler2D uSand, uNoise; uniform float uTime;
void main(){
  float h = sandH(vWorldPos.xz);
  float swash = -1.10 + 0.10 * sin(uTime * 0.45) + 0.06 * (texture2D(uNoise, vec2(vWorldPos.x * 0.01, uTime * 0.03)).r - 0.5);
  vec3 tex = texture2D(uSand, vWorldPos.xz * 0.125).rgb;
  float wet = smoothstep(swash + 0.30, swash + 0.02, h);         // darker band above the waterline
  vec3 col = mix(uDry, uWet, wet) * (tex / vec3(0.914, 0.855, 0.722));  // tex normalized around #E9DAB8
  float foamBand = 1.0 - smoothstep(0.0, 0.045, abs(h - swash));
  foamBand *= 0.6 + 0.4 * texture2D(uNoise, vWorldPos.xz * 0.35 + uTime * 0.02).g;
  col = mix(col, uFoam, foamBand);
  float light = 0.55 + 0.45 * max(dot(normalize(vNormal), uSunDir), 0.0);
  gl_FragColor = vec4(col * light, 1.0);
  #include <fog_fragment>
}
```
`uDry #E9DAB8`, `uWet #C8B48F`, `uFoam #F6FAF9`. The foam line breathes ±3 m up and down the beach every 14 s.

### 4.5 Horizon and fog

`scene.fog = new THREE.Fog(0xDCEAF1, 80, 420)`. Interior (< 12 m) is untouched; the water fades into the horizon color by 420 m and the near-invisible seam where the water disc meets the dome (r 450) disappears. The sky dome has `fog: false` and bakes haze into its gradient instead.

Optional horizon accents: a distant headland `SphereGeometry(60, 16, 8)` scaled `(1, 0.25, 0.6)` at `(−260, −8, −430)`, color `#7C8FA0`, fogged so it reads as a pale blue silhouette; a sailboat `PlaneGeometry(3, 5)` white at `(140, 1.5, −380)` drifting −x at 0.4 m/s.

---

## 5. Lighting plan

Renderer: `outputColorSpace = SRGBColorSpace`, `toneMapping = ACESFilmicToneMapping`, `toneMappingExposure = 1.0`, `shadowMap.enabled = true`, `shadowMap.type = PCFSoftShadowMap`, pixel ratio `min(devicePixelRatio, 2)`, physically-correct lights (default since r155). Intensities below are practical values for that pipeline.

| Light | Type | Color | Intensity | Position / notes |
|---|---|---|---|---|
| Sun | `DirectionalLight` | `#FFF3DC` | **3.4** | position `(35.3, 37.6, −61.2)`, target `(0, 0, −2)`. `castShadow`; `shadow.mapSize 4096` (2048 fallback); `shadow.camera` left/right/top/bottom ±10, near 1, far 200; `bias −0.0004`, `normalBias 0.03`, `radius 2`. Casters: mullions, transom, overhang, beams, furniture, bin, plants. |
| Sky | `HemisphereLight` | sky `#BFD9F0`, ground `#D9C7A6` | 0.55 | at `(0, 5, 0)`. Blue from above, sand-bounce from below. |
| Bounce fill | `DirectionalLight` | `#EFDCC0` | 0.35 | position `(0, −10, 3)`, target `(0, 3, −2)`: points up, no shadow. Lifts beam undersides and sofa fronts. |
| Interior warm | `PointLight` | `#FFE1BD` | 4 (cd), distance 12, decay 2 | `(0, 3.0, 1.0)`, kitchen side, no shadow. |
| Pendants ×3 | `PointLight` | `#FFD3A0` | 5 each, distance 6, decay 2 | at each bulb; no shadow. Visible warm pools on the marble at daytime levels. |
| Floor lamp | `PointLight` | `#FFDDB0` | 3, distance 5, decay 2 | `(−4.6, 1.5, −0.6)` |
| IBL | `scene.environment` | PMREM of the outdoor scene | `environmentIntensity 0.6` (r163+; otherwise set `envMapIntensity` per material) | At load: put sky dome, sun sprite, water, sand in a temp scene, `pmrem.fromScene(tmp, 0.04)`. Blue above / warm below in every reflection: marble, brass, velvet sheen, glass. |

What this produces: the whole living area sunlit through the glass, with diagonal shadow bars from the mullions running from the window toward −x/+z (the x = 1.2 mullion's bar crosses the rug at x ≈ −0.35, z = −2.3; the transom draws a dark line across the floor at z ≈ 0.5 by the player's feet); the kitchen end behind the player falls into overhang shade, so the frame's foreground is darker than the view, which is what makes the view feel bright. The bin's shadow lies 0.3 m to −x and 0.5 m toward the camera. If ACES makes the sky look chalky, try `AgXToneMapping` at exposure 1.1; keep the sun intensity.

---

## 6. Small delights

Worth building, roughly in order of payoff per hour:

1. **Sun bars on the floor** (free once mullions cast shadows). Give the rug `receiveShadow` and the oak floor a `clearcoat` of 0.15 so the bars glint.
2. **Living ocean** (`uTime` uniform, §4.3) with the foam line breathing on the sand (§4.4). Update both from the main loop with `clock.getElapsedTime()`.
3. **Sheer curtain sway**: each frame, for vertex (i) of the curtain plane with local y in [−2.7, 2.7]: `x = x0 + 0.03 * sin(y * 2.2 + t * 1.3) * (0.5 + 0.5 * (y + 2.7) / 5.4)` (more sway toward the top), `z = z0 + 0.05 * sin(y * 1.1 + t * 0.9)`; `needsUpdate` positions. Only the leftmost pane has it, well away from the lane.
4. **Ceiling fan**: `blades.rotation.y += 0.9 * dt`.
5. **Brass rim pulse on score**: on a basket, set the torus `emissive` to `#FFD37A`, `emissiveIntensity 2.0`, ease to 0 over 0.35 s; spawn 10 tiny brass-colored `Sprite`s (0.02 m) drifting up 0.3 m and fading over 0.6 s.
6. **Glass "tink"**: on a glass hit, a 0.08 m ring `TorusGeometry(0.02, 0.003)` at the contact point scales to 0.4 m and fades over 0.25 s (no audio needed).
7. **Sailboat and headland** on the horizon (§4.5). Tiny cost, sells scale.
8. **Magazine and books** on the marble (§3.5). The masthead is the single most "listing photo" detail in the room.
9. **Pendants collide** (optional): register the three shades as spheres (e 0.5) so a wild lob clinks off rattan and drops onto the table.
10. **Open pane (optional, later)**: leave the leftmost pane (x −6…−3.6) without a glass collider and add the deck as floor at y = 0 for z −5…−8.2; a ball that leaves the building lands on the deck, HUD reacts, ball respawns. Not in the lane, so it stays fair.

**Level 2 trajectory styling:** preview arc dots in brass `#E8C27A` (0.02 m spheres, 0.15 m spacing, fading to 30% at the end); flight trail white `#FFFFFF` fading to `rgba(255,255,255,0)` over 0.4 s. Both read against oak, boucle and sea.

**HUD styling:** serif for the host voice (system stack: `Georgia, "Iowan Old Style", "Times New Roman", serif`, italic, 18 px), numerals in a sans (`-apple-system, "Helvetica Neue", Arial`), text `#1E1D1B` on a translucent ivory pill `rgba(246,241,232,0.78)` with a 1 px `rgba(201,164,106,0.7)` brass border, 14 px radius. Score numerals brass `#B8935A`. Level entry: 1.2 s white fade from level 1, then the greeting.

### HUD copy (voice: overly enthusiastic luxury-listing host)

| Trigger | Line |
|---|---|
| Level intro | "Welcome to Casa Marea. 5.5-metre ceilings, uninterrupted ocean views, and one (1) designer waste bin. Please treat it with respect." |
| Aim hint (first 2 throws) | "Drag back to aim, release to throw. The house is yours. Ten points a basket." |
| Score | "Swish. Five stars. Would host again." |
| Score | "Effortless. Like the sunset we do NOT charge extra for." |
| Score | "Straight in. The bin is Danish. It noticed." |
| Bank off glass, score | "Off the glass?! This is a private residence, not a squash court. Ten points." |
| Bank off pot, score | "Off the planter and in. Gerald the fig is thrilled. Gerald is the fig." |
| Rim out | "Ooh, brushed the brass. The rim is Italian. It has opinions." |
| Miss, floor | "Ah. The oak is whitewashed, sustainably sourced, and now slightly littered." |
| Miss, rug | "That rug is hand-knotted wool. It has absorbed worse. Not much worse." |
| Miss, sofa | "The boucle is hand-loomed in Portugal. It forgives you. I'm working on it." |
| Miss, velvet sofa | "Sage velvet. Dry clean only. Just so you know." |
| Miss, marble table | "Carrara marble, honed finish. Please don't." |
| Hit glass, no score | "Floor-to-ceiling glass, triple-glazed, ocean-rated. Yes, it holds up to crumpled paper." |
| Hit plant | "Careful. That fiddle-leaf fig has a name. Its name is Gerald. Gerald is fine." |
| Hit pendant | "The rattan pendants were imported. From a very nice website." |
| Streak 3 | "Three in a row. Guests like you get the good towels." |
| Streak 5 | "Five straight! I'm adding 'private basketball court' to the listing." |
| 50 points | "Halfway to checkout. The ocean would like you to stay." |
| 90 points | "Ten more and I'm leaving YOU a review." |
| Idle 15 s | "Take your time. The ocean's not going anywhere. Neither is the bin." |
| Ball leaves through open pane (optional) | "Did you just... throw it into the Pacific? That's a cleaning fee." |
| Level complete (100) | "One hundred points! Checkout is at 11, but for you? Late checkout, no fee. Superhost out." |

---

## 7. Physics collider manifest for this level (for `physics.js` level config)

| Collider | Shape | Extent | restitution e / friction μ |
|---|---|---|---|
| Oak floor | plane y = 0 | whole room | 0.45 / 0.30 |
| Rug zone | AABB override | x ±2.3, z −4.1…−0.5, y 0…0.02 | 0.25 / 0.55 |
| Glass wall | plane z = −5 | x ±6, y 0…5.5 | 0.62 / 0.10 |
| Mullions ×6 | AABB | 0.08 × 5.5 × 0.14 at listed x | 0.55 / 0.2 |
| Side / back walls, ceiling | planes x = ±6, z = 4, y = 5.5 | | 0.40 / 0.3 |
| Bin | rim torus R 0.15 r 0.012 at y 0.32; inner cyl r 0.145; outer cone 0.15→0.11; floor disc y 0.01 | center (1.6, −4.3) | rim 0.45, walls 0.35, floor 0.2 / 0.4 |
| Score trigger | descending through y = 0.22 inside r 0.12 | | |
| Sofa R body | AABB x 2.0…3.0, y 0…0.48, z −3.4…−1.0 | | 0.15 / 0.8 |
| Sofa R back | AABB x 2.76…3.0, y 0.48…0.92, z −3.4…−1.0 | | 0.18 / 0.8 |
| Sofa R arms | AABB x 2.0…3.0, y 0.45…0.71, z −3.53…−3.27 and −1.13…−0.87 | | 0.15 / 0.8 |
| Sofa L modules + bolsters | `Box3.setFromObject` per module group after placement | | 0.15 / 0.8 |
| Coffee table | AABB x −1.0…0.6, y 0…0.36, z −2.75…−1.85 | | 0.55 / 0.25 |
| Fig pot | vertical cylinder r 0.30, h 0.55 at (2.6, −4.4) | | 0.45 / 0.4 |
| Kitchen island | AABB x −0.9…1.5, y 0…0.92, z 0.95…1.85 | rare rebounds | 0.5 / 0.3 |
| Pendants (optional) | spheres r 0.42 / 0.32 / 0.36 at §2 positions | | 0.5 / 0.2 |
| Out of bounds | y < −0.5 or |x| > 6.5 or z < −5.5 or z > 4.5 → respawn | | |

## 8. Budget

Target 60 fps at 1080p on an integrated GPU: ≈ 140 draw calls (merge the beams, mullions, pillows and books into single geometries with `BufferGeometryUtils.mergeGeometries` where materials match), ≈ 350k triangles (near water 205k, olive canopy instanced, boucle modules 4-segment rounded boxes), one shadow-casting light at 4096² (drop to 2048² on `devicePixelRatio > 1.5` mobile), all textures generated in < 400 ms.