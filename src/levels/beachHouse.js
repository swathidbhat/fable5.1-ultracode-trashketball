// Level 2: Casa Marea, a high-ceilinged modern beach house living room that is mostly window.
// Contract section 9 / 9.1 / 9.2; art direction in docs/design/03-level2-beach-house-art.md.
// The room is composed from the helpers in ./beach/: textures (canvas), geo (merge buckets), shell
// (floor, walls, beams, window wall, deck, island), furniture (sofas, table, pendants, plants) and
// outdoors (sky dome, ocean, sand, horizon). Everything static is merged per material and frozen;
// the bin group, fan blades, sailboat and the delight pools stay live.
import * as THREE from 'three';
import { disposeTree, freezeStatic } from './util.js';
import { createBeachTextures, disposeBeachTextures } from './beach/textures.js';
import { Buckets } from './beach/geo.js';
import { buildShell, swayCurtain } from './beach/shell.js';
import { createOutdoors, buildEnvironment, HORIZON_HEX } from './beach/outdoors.js';
import { buildFurniture } from './beach/furniture.js';

// ---------------------------------------------------------------------------------------------
// Fixed numbers (contract 9.1)

const BIN = { x: 1.60, z: -4.30, height: 0.32, rOutTop: 0.150, rOutBot: 0.110, wall: 0.008, floorThick: 0.010, rimTube: 0.012 };
const BIN_MATERIALS = {
  wall: { restitution: 0.30, friction: 0.30, rollDamping: 4.0 },
  bottom: { restitution: 0.18, friction: 0.35, rollDamping: 5.0 },
  rim: { restitution: 0.32, friction: 0.25, rollDamping: 4.0 },
};
const FLOOR = { restitution: 0.45, friction: 0.30, rollDamping: 1.5 };
const BOUNDS = { minX: -6.5, maxX: 6.5, minZ: -9, maxZ: 4.5, minY: -1, maxY: 30 };

const TAU = Math.PI * 2;
const PULSE_S = 0.35;          // brass lip pulse
const SPRITE_S = 0.6;          // brass sprite lifetime
const RING_S = 0.25;           // glass tink ring lifetime
const SPRITE_POOL = 12, RING_POOL = 4;

// ---------------------------------------------------------------------------------------------
// Materials (art doc section 3). Bucket keys used by shell.js / furniture.js must all exist here.

function makeMaterials(T) {
  const Std = (p) => new THREE.MeshStandardMaterial(p);
  const Phys = (p) => new THREE.MeshPhysicalMaterial(p);
  return {
    oak: Phys({ map: T.oak, roughness: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.5 }),
    ceiling: Std({ color: 0xF7F4EE, roughness: 0.95 }),
    plaster: Std({ map: T.plaster, color: 0xF4F0E8, roughness: 0.96 }),
    timber: Std({ map: T.timber, roughness: 0.8 }),
    bronze: Std({ color: 0x2A2622, roughness: 0.5, metalness: 0.6 }),
    // glass: thin tinted plane, no transmission (contract 9.2)
    glass: Phys({ color: 0xDCEBEA, transparent: true, opacity: 0.08, roughness: 0.04, metalness: 0, envMapIntensity: 0.25, depthWrite: false }),
    curtain: Std({ color: 0xF6F1E8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 1, depthWrite: false }),
    deck: Std({ map: T.timber, color: 0x8C6A48, roughness: 0.85 }),
    props: Std({ vertexColors: true, roughness: 0.75 }),
    atlas: Std({ map: T.atlas, roughness: 0.7 }),
    leaf: Std({ map: T.atlas, side: THREE.DoubleSide, roughness: 0.6 }),
    marbleStd: Std({ map: T.marble, roughness: 0.35 }),
    marblePhys: Phys({ map: T.marble, roughness: 0.18, clearcoat: 0.5, clearcoatRoughness: 0.12, envMapIntensity: 1.2 }),
    travertine: Std({ map: T.marble, color: 0xD8CDB9, roughness: 0.5 }),
    boucle: Phys({ map: T.boucle, bumpMap: T.boucle, bumpScale: 0.012, roughness: 0.95, metalness: 0,
      sheen: 0.5, sheenColor: 0xFFFFFF, sheenRoughness: 0.85, envMapIntensity: 0.3 }),
    velvet: Phys({ color: 0x8FA697, roughness: 0.72, metalness: 0, sheen: 1.0, sheenColor: 0xC9DCCF, sheenRoughness: 0.45, envMapIntensity: 0.35 }),
    linen: Std({ map: T.linen, vertexColors: true, roughness: 0.9 }),
    lampShade: Std({ map: T.linen, color: 0xF0E8DA, side: THREE.DoubleSide, roughness: 1, emissive: 0xFFDDB0, emissiveIntensity: 0.3 }),
    brass: Std({ color: 0xC9A46A, metalness: 0.95, roughness: 0.28 }),
    // the weave cuts out through the map's own alpha channel (an sRGB alphaMap would decode below the test)
    rattan: Std({ map: T.rattan, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xFFD3A0 }),
    rug: Std({ map: T.rug, bumpMap: T.rug, bumpScale: 0.006, roughness: 1 }),
    olive: Std({ color: 0xFFFFFF, side: THREE.DoubleSide, roughness: 0.85 }),
    binBody: Phys({ color: 0x1E1D1B, roughness: 0.85, metalness: 0.05, envMapIntensity: 0.4 }),
    binInner: Std({ color: 0x34322F, roughness: 0.9, side: THREE.DoubleSide }),
    binRim: Std({ color: 0xC9A46A, metalness: 0.95, roughness: 0.28, emissive: 0x000000, emissiveIntensity: 1 }),
  };
}

// ---------------------------------------------------------------------------------------------
// Copy (voice: overly enthusiastic luxury-listing host; no em-dashes)

const COPY = {
  intro: 'Welcome to Casa Marea. 5.5 metre ceilings, uninterrupted ocean views, and one (1) designer waste bin. Please treat it with respect.',
  aimHint: 'Drag back to aim, release to throw. The house is yours. Ten points a basket.',
  hints: [
    'The preview arc is shorter here. Trust it. I do.',
    'The bin sits at half pull. Like the tide, roughly.',
    'Mind the marble. It photographs beautifully and forgives nothing.',
    'The glass is ocean rated. Bank shots are, technically, allowed.',
  ],
  score: [
    'Swish. Five stars. Would host again.',
    'Effortless. Like the sunset we do NOT charge extra for.',
    'Straight in. The bin is Danish. It noticed.',
    'Nothing but bin. That is going in the listing photos.',
  ],
  bank: [
    'Off the glass?! This is a private residence, not a squash court. Ten points.',
    'Off the planter and in. Gerald the fig is thrilled. Gerald is the fig.',
    'Creative use of the architecture. The architect has been told. She is delighted.',
  ],
  rattle: [
    'Rattled the brass and stayed. A dramatic entrance. Very you.',
    'A wobble, a clink, a basket. The rim is Italian. It allowed it.',
    'In, eventually. The bin was playing hard to get.',
  ],
  rimOut: [
    'Ooh, brushed the brass. The rim is Italian. It has opinions.',
    'So close. The lip said no. The lip is imported.',
    'Off the rim. The bin is being coy. It does that with new guests.',
  ],
  miss: [
    'Ah. The oak is whitewashed, sustainably sourced, and now slightly littered.',
    'That rug is hand knotted wool. It has absorbed worse. Not much worse.',
    'Housekeeping has been informed. Housekeeping is me. I am fine.',
    'A miss. The ocean did not see. I did, but I am discreet.',
  ],
  missByTag: {
    window: 'Floor to ceiling glass, triple glazed, ocean rated. Yes, it holds up to crumpled paper.',
    mullion: 'Straight into the bronze mullion. Hand finished. Now hand tested.',
    sofa: 'The boucle is hand loomed in Portugal. It forgives you. I am working on it.',
    velvet: 'Sage velvet. Dry clean only. Just so you know.',
    table: 'Carrara marble, honed finish. Please do not.',
    plant: 'Careful. That fiddle leaf fig has a name. Its name is Gerald. Gerald is fine.',
    island: 'The island is for entertaining. It was not entertained.',
    wall: 'Limewash plaster, three coats, applied by an artisan. Now with a small dent.',
    ceiling: 'Five and a half metres of ceiling and you found it. Impressive, honestly.',
  },
  streak: {
    3: 'Three in a row. Guests like you get the good towels.',
    5: 'Five straight! I am adding private basketball court to the listing.',
    8: 'Eight in a row. I am naming a suite after you. The Bin Suite.',
  },
  milestone: {
    50: 'Halfway to checkout. The ocean would like you to stay.',
    90: 'Ten more and I am leaving YOU a review.',
  },
  complete: {
    eyebrow: 'Casa Marea',
    title: 'Five stars.',
    body: 'One hundred points! Checkout is at 11, but for you? Late checkout, no fee.',
    sub: 'Superhost out.',
    button: 'Play again',
  },
  idle: 'Take your time. The ocean is not going anywhere. Neither is the bin.',
};

// ---------------------------------------------------------------------------------------------
// The level

export function createBeachHouseLevel(ctx) {
  const { scene, renderer, camera } = ctx;
  const isTouch = !!ctx.isTouch;
  const quality = ctx.quality === 'low' ? 'low' : 'high';

  const group = new THREE.Group();
  group.name = 'beach';
  scene.add(group);
  const statics = new THREE.Group();      // merged / frozen meshes
  statics.name = 'statics';
  group.add(statics);
  const buckets = new Buckets();
  const colliders = { boxes: [], cylinders: [] };
  const dynamic = [];                     // objects that keep matrixAutoUpdate after freezeStatic

  // --- textures (12, art doc 3.10) and materials
  const T = createBeachTextures(quality);
  T.oak.repeat.set(3, 2.25);
  T.plaster.repeat.set(3, 2);
  T.boucle.repeat.set(3, 3);
  T.rug.repeat.set(4, 3);
  T.rattan.repeat.set(4, 2);
  const mats = makeMaterials(T);

  // --- shell, furniture, outdoors
  const { curtain, curtainBase } = buildShell({ mats, buckets, statics, colliders });
  const { fanBlades } = buildFurniture({ mats, buckets, statics, colliders, group, seed: 42 });
  dynamic.push(fanBlades);
  const outdoors = createOutdoors({ T, far: camera && camera.far > 0 ? camera.far : 250, isTouch });
  group.add(outdoors.statics);
  group.add(outdoors.sailboat);
  dynamic.push(outdoors.sailboat);

  // ============================================================================================
  // 3.7 The bin: matte-black tapered Vipp-style body with a brass lip. Own group (main.js wobbles it),
  // origin at the base center; no box collider (physics owns the bin).

  const binGroup = new THREE.Group();
  binGroup.name = 'bin';
  binGroup.position.set(BIN.x, 0, BIN.z);
  group.add(binGroup);
  dynamic.push(binGroup);
  let rimMesh;
  {
    const rInTop = BIN.rOutTop - BIN.wall, rInBot = BIN.rOutBot - BIN.wall;
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(BIN.rOutTop, BIN.rOutBot, BIN.height, 48, 1, true), mats.binBody);
    outer.position.y = BIN.height / 2;
    outer.castShadow = true;
    outer.receiveShadow = true;
    const innerH = BIN.height - BIN.floorThick;
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(rInTop, rInBot, innerH, 48, 1, true), mats.binInner);
    inner.position.y = BIN.floorThick + innerH / 2;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(rInBot + 0.001, 48), mats.binInner);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = BIN.floorThick;
    rimMesh = new THREE.Mesh(new THREE.TorusGeometry(BIN.rOutTop - BIN.wall / 2, BIN.rimTube, 12, 64), mats.binRim);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.y = BIN.height;
    rimMesh.castShadow = true;
    rimMesh.name = 'binRim';
    const foot = new THREE.Mesh(new THREE.TorusGeometry(BIN.rOutBot, 0.006, 8, 48), mats.binBody);
    foot.rotation.x = Math.PI / 2;
    foot.position.y = 0.006;
    binGroup.add(outer, inner, disc, rimMesh, foot);
  }

  // ============================================================================================
  // Merge the static buckets into one mesh per material

  buckets.flush(statics, mats, {
    glass: { cast: false, receive: false, renderOrder: 10 },
    bulb: { cast: false, receive: false },
    lampShade: { cast: false },
    rattan: { receive: false },
    leaf: { receive: false },
  });

  // ============================================================================================
  // Lighting (art doc section 5; physically-correct units)

  {
    const sun = new THREE.DirectionalLight(0xFFF3DC, 3.4);
    sun.name = 'sun';
    sun.position.set(35.3, 37.6, -61.2);
    sun.target.position.set(0, 0, -2);
    group.add(sun, sun.target);
    sun.castShadow = true;
    const mapSize = isTouch ? 1024 : 2048;
    sun.shadow.mapSize.set(mapSize, mapSize);
    const sc = sun.shadow.camera;
    sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10;
    sc.near = 1; sc.far = 200;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 2;

    const hemi = new THREE.HemisphereLight(0xBFD9F0, 0xD9C7A6, 0.55);
    hemi.position.set(0, 5, 0);
    group.add(hemi);

    const bounce = new THREE.DirectionalLight(0xEFDCC0, 0.35);     // upward fill, no shadow
    bounce.position.set(0, -10, 3);
    bounce.target.position.set(0, 3, -2);
    group.add(bounce, bounce.target);
    // the four point lights (three pendants, floor lamp) come from furniture.js
  }

  // --- renderer and scene look (contract 9: level applies these; dispose resets them)
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  scene.background = new THREE.Color(HORIZON_HEX);
  scene.fog = new THREE.Fog(HORIZON_HEX, 80, 420);
  let pmremTarget = null;
  try {
    pmremTarget = buildEnvironment(renderer);
  } catch (err) {
    console.warn('[beach] environment map skipped', err);
    pmremTarget = null;
  }
  if (pmremTarget) {
    scene.environment = pmremTarget.texture;
    scene.environmentIntensity = 0.6;
  } else {
    scene.environment = null;
  }

  // ============================================================================================
  // Freeze everything static; re-enable the live objects

  freezeStatic(group);
  for (const d of dynamic) d.matrixAutoUpdate = true;

  // ============================================================================================
  // Delight pools (created after the freeze so they stay live): brass sprites on a make, glass rings

  const sprites = [];
  for (let i = 0; i < SPRITE_POOL; i++) {
    const mat = new THREE.SpriteMaterial({
      map: T.sunGlow, color: 0xE8C27A, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    });
    const s = new THREE.Sprite(mat);
    s.scale.set(0.02, 0.02, 1);
    s.visible = false;
    s.name = 'brassSprite';
    group.add(s);
    sprites.push({ s, mat, t: 0, active: false, vx: 0, vy: 0, vz: 0 });
  }
  const rings = [];
  const ringGeo = new THREE.TorusGeometry(0.02, 0.003, 6, 32);
  for (let i = 0; i < RING_POOL; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const m = new THREE.Mesh(ringGeo, mat);
    m.visible = false;
    m.name = 'glassRing';
    group.add(m);
    rings.push({ m, mat, t: 0, active: false });
  }

  let seed = 7;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  function burstBrass() {
    let n = 0;
    for (const sp of sprites) {
      if (n >= 10) break;
      if (sp.active) continue;
      const a = rand() * TAU, r = 0.05 + rand() * 0.10;
      sp.s.position.set(BIN.x + Math.cos(a) * r, BIN.height + 0.01, BIN.z + Math.sin(a) * r);
      sp.vx = Math.cos(a) * 0.12; sp.vz = Math.sin(a) * 0.12; sp.vy = 0.3 / SPRITE_S + rand() * 0.15;
      sp.t = 0; sp.active = true; sp.s.visible = true; sp.mat.opacity = 1;
      sp.s.scale.set(0.02, 0.02, 1);
      n++;
    }
  }

  function tink(point) {
    if (!point) return;
    let slot = rings.find((r) => !r.active) || rings[0];
    slot.m.position.set(point.x, point.y, -4.96);
    slot.m.scale.setScalar(1);
    slot.mat.opacity = 1;
    slot.m.visible = true;
    slot.t = 0;
    slot.active = true;
  }

  // ============================================================================================
  // Runtime

  const pulse = { active: false, t: 0, lastAt: -10 };
  const rimMat = mats.binRim;
  let clock = 0;

  function resetRim() {
    rimMat.emissive.setHex(0x000000);
    rimMat.emissiveIntensity = 1;
  }

  function update(dt, elapsed, game) {
    if (!(dt > 0)) dt = 0;
    const t = Number.isFinite(elapsed) ? elapsed : (clock += dt);
    clock = t;

    outdoors.update(t);                     // ocean / sand uTime, sailboat drift
    swayCurtain(curtain, curtainBase, t);
    fanBlades.rotation.y += 0.9 * dt;
    if (fanBlades.rotation.y > TAU) fanBlades.rotation.y -= TAU;

    // brass lip pulse: 2.0 -> 0 over 0.35 s. main.js's own rim glow (0.25 s) writes after us each
    // frame and restores black/1 when it ends; ours ends in the same state, so neither fights.
    if (pulse.active) {
      pulse.t += dt;
      const k = Math.min(1, pulse.t / PULSE_S);
      rimMat.emissive.setHex(0xFFD37A);
      rimMat.emissiveIntensity = 2.0 * (1 - k) * (1 - k);
      if (k >= 1) { pulse.active = false; resetRim(); }
    } else if (t - pulse.lastAt > 1.0 && (rimMat.emissiveIntensity !== 1 || rimMat.emissive.getHex() !== 0)) {
      resetRim();                           // watchdog for a glow captured mid-pulse
    }

    for (const sp of sprites) {
      if (!sp.active) continue;
      sp.t += dt;
      const u = sp.t / SPRITE_S;
      if (u >= 1) { sp.active = false; sp.s.visible = false; sp.mat.opacity = 0; continue; }
      sp.s.position.x += sp.vx * dt;
      sp.s.position.y += sp.vy * dt;
      sp.s.position.z += sp.vz * dt;
      sp.mat.opacity = 1 - u * u;
      const sc = 0.02 * (1 + u * 0.8);
      sp.s.scale.set(sc, sc, 1);
    }
    for (const r of rings) {
      if (!r.active) continue;
      r.t += dt;
      const u = r.t / RING_S;
      if (u >= 1) { r.active = false; r.m.visible = false; r.mat.opacity = 0; continue; }
      r.m.scale.setScalar(1 + 9 * u);       // 0.04 m ring grows to 0.4 m
      r.mat.opacity = 1 - u;
    }
  }

  function onEvent(name, payload) {
    switch (name) {
      case 'scored':
        pulse.active = true;
        pulse.t = 0;
        pulse.lastAt = clock;
        burstBrass();
        break;
      case 'boxHit':
        if (payload && payload.tag === 'window') tink(payload.point);
        break;
      default:
        break;
    }
  }

  function dispose() {
    disposeTree(group);
    ringGeo.dispose();
    disposeBeachTextures(T);
    if (pmremTarget) { pmremTarget.dispose(); pmremTarget = null; }
    scene.environment = null;
    scene.environmentIntensity = 1;
    scene.background = null;
    scene.fog = null;
  }

  return {
    id: 'beach',
    theme: 'beach',
    audioVariant: 'matte',
    group,
    camera: {
      position: new THREE.Vector3(0.30, 1.60, 0.00),
      lookAt: new THREE.Vector3(1.15, 1.15, -4.30),
      fov: 64,
      fovPortrait: 78,
    },
    bin: {
      x: BIN.x, z: BIN.z, height: BIN.height, rOutTop: BIN.rOutTop, rOutBot: BIN.rOutBot,
      wall: BIN.wall, floorThick: BIN.floorThick, rimTube: BIN.rimTube,
      materials: BIN_MATERIALS,
      group: binGroup,
      rimMesh,
    },
    physics: {
      floor: FLOOR,
      boxes: colliders.boxes,
      cylinders: colliders.cylinders,
      bounds: BOUNDS,
    },
    previewFraction: 0.60,
    arcColors: { near: 0xffffff, far: 0xe8c27a },
    trailColor: 0xffffff,
    hud: { eyebrow: 'Superhost · Entire home', name: 'Casa Marea', lvl: 'Level 2 of 2' },
    copy: COPY,
    update,
    onEvent,
    dispose,
  };
}
