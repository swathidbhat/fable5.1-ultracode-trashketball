// Trashketball bootstrap: renderer, fixed-step loop, game state machine, level lifecycle,
// ball lifecycle (multi-ball, recycling, clutter caps), scoring and feedback wiring.
// Every other module is used strictly through the interfaces in docs/CONTRACT.md (sections 3 to 9).

import * as THREE from 'three';
import { createWorld, FIXED_DT } from './physics.js';
import { DragInput, KeyboardAim, speedFromPower } from './input.js';
import { ArcPreview, FlightTrail } from './trajectory.js';
import {
  computeHandPosition, createPaperBallMesh, syncBallMesh, crinkle, animateBallMeshes, shrinkAndRemove,
} from './paperBall.js';
import { Hud } from './hud.js';
import { GameAudio } from './audio.js';
import { initTextures } from './textures.js';
import { Emitter } from './events.js';
import { disposeTree } from './levels/util.js';
import { createSeveranceLevel } from './levels/severance.js';
import { createBeachHouseLevel } from './levels/beachHouse.js';
import * as juice from './juice.js';

// ---------------------------------------------------------------------------------------------
// Constants and knobs

const DEG = Math.PI / 180;
const ELEVATION = 45 * DEG;          // launch elevation, both levels (contract section 10)
const MAX_FRAME_DT = 0.1;            // s
const MAX_STEPS = 24;                // physics steps per frame
const POINTS_PER_MAKE = 10;
const LEVEL_TARGET = 100;
const MAX_ACTIVE_BALLS = 4;          // throwing a 5th force-sleeps the oldest flying ball
const MAX_CLUTTER_OUTSIDE = 10;
const MAX_CLUTTER_INSIDE = 6;
const REARM_AFTER_LAUNCH = 1.5;      // s
const REARM_AFTER_CONTACT = 0.35;    // s
const REARM_AFTER_SCORE = 0.5;       // s
const SPAWN_SECONDS = 0.22;
const PULL_SMOOTHING = 0.06;         // s, hand pull-back easing
const STUCK_AFTER = 4.0;             // s of unresolved flight before "Ball stuck? Press R."
const IDLE_HINT_AFTER = 20;          // s in READY with no input before the hint returns
const COMPLETE_DELAY = 0.9;          // s between the winning make and the overlay
const OVERLAY_BUTTON_DELAY = 1200;   // ms before a completion overlay accepts its button
const MIN_THROW_POWER = 0.05;
const TOUCH_ASSIST_WINDOW = 0.35;    // m/s: touch throws this close to the bin speed get nudged toward it
const TOUCH_ASSIST_GAIN = 0.30;
const PREDICT_OPTS = { maxTime: 3, stopOnContact: true, sampleEvery: 4 };
const KEYBOARD_FOOTNOTE = 'Keyboard: arrows aim, hold Space to throw, R resets the ball, M mutes, Esc pauses.';
const KEYBOARD_HINT = 'Arrows aim. Hold Space to throw.';
const CANCEL_HINT = 'Release to cancel';
const SETTINGS_KEY = 'trashketball.settings';

const STATE = {
  BOOT: 'BOOT', TITLE: 'TITLE', READY: 'READY', AIMING: 'AIMING', FLIGHT: 'FLIGHT', NEXT_BALL: 'NEXT_BALL',
  LEVEL_COMPLETE: 'LEVEL_COMPLETE', TRANSITION: 'TRANSITION', WIN: 'WIN', PAUSED: 'PAUSED',
};

// Fixed layout numbers from contract section 9.1, used to fill anything a level leaves out.
const LEVEL_DEFAULTS = [
  {
    id: 'severance', theme: 'lumon', audioVariant: 'steel',
    camera: { position: [1.10, 1.60, -0.20], lookAt: [0.75, 1.10, -4.40], fov: 66, fovPortrait: 80 },
    bin: {
      x: 0.75, z: -4.40, height: 0.32, rOutTop: 0.150, rOutBot: 0.120, wall: 0.006, floorThick: 0.008, rimTube: 0.009,
      materials: {
        wall: { restitution: 0.40, friction: 0.20, rollDamping: 3.0 },
        bottom: { restitution: 0.22, friction: 0.40, rollDamping: 5.0 },
        rim: { restitution: 0.45, friction: 0.15, rollDamping: 3.0 },
      },
    },
    previewFraction: 0.72, arcColors: { near: 0xffffff, far: 0x8e949c }, trailColor: 0xfff4d6,
    hud: { eyebrow: 'Lumon Industries', name: 'Macrodata Refinement', lvl: 'Level 1 of 2' },
    accent: 0x7fe0cc, floorSurface: 'carpet', fadeColor: '#F3EBDD', ballVariant: 'lumon',
  },
  {
    id: 'beach', theme: 'beach', audioVariant: 'matte',
    camera: { position: [0.30, 1.60, 0.00], lookAt: [1.15, 1.15, -4.30], fov: 64, fovPortrait: 78 },
    bin: {
      x: 1.60, z: -4.30, height: 0.32, rOutTop: 0.150, rOutBot: 0.110, wall: 0.008, floorThick: 0.010, rimTube: 0.012,
      materials: {
        wall: { restitution: 0.30, friction: 0.30, rollDamping: 4.0 },
        bottom: { restitution: 0.18, friction: 0.35, rollDamping: 5.0 },
        rim: { restitution: 0.32, friction: 0.25, rollDamping: 4.0 },
      },
    },
    previewFraction: 0.60, arcColors: { near: 0xfff6e4, far: 0xb9a58a }, trailColor: 0xfff4d6,
    hud: { eyebrow: 'Superhost · Entire home', name: 'Sea Glass House', lvl: 'Level 2 of 2' },
    accent: 0xf5e6c8, floorSurface: 'wood', fadeColor: '#0B1F28', ballVariant: 'beach',
  },
];

// Fallback copy in case a level ships without some strings. Levels normally provide all of it.
const DEFAULT_COPY = [
  {
    intro: 'Drag back to aim. Release to throw. Ten baskets earn your outie a vacation.',
    aimHint: 'Drag back to aim. Release to throw.',
    hints: ['The bin sits at half pull.', 'Drag sideways to aim.'],
    score: ['Refined.', 'The numbers were scary. Now they are gone.', 'Please enjoy this basket equally.'],
    bank: ['Off the partition. Acceptable.', 'Indirect refinement is still refinement.'],
    rattle: ['It rattled. It counted.', 'A tense moment for everyone.'],
    rimOut: ['The rim says no.', 'So close to a bin of one\'s own.'],
    miss: ['A miss. Nobody saw.', 'Please try again.'],
    missByTag: {
      desk: 'That desk was not the bin.', ceiling: 'The ceiling is not a refinement target.',
      wall: 'The wall remains unrefined.', monitor: 'Please do not refine the terminals.',
      partition: 'The partition took it personally.', chair: 'Not a chair sport.', door: 'The door will be noted.',
    },
    streak: { 3: 'Three in a row. Noted.', 5: 'Five straight.', 8: 'Eight. The board is watching.' },
    milestone: { 50: 'Halfway to quota.', 90: 'One more. Then the vacation.' },
    complete: {
      eyebrow: 'Macrodata Refinement', title: 'Quota met.',
      body: '100% of bins refined. Your outie has earned a vacation.',
      sub: 'Please enjoy each amenity equally.', button: 'Take the vacation',
    },
    idle: 'Whenever you are ready.',
  },
  {
    intro: 'Welcome to the beach house. Uninterrupted ocean views and one designer waste bin.',
    aimHint: 'Drag back to aim. Release to throw.',
    hints: ['The bin sits at half pull.', 'The preview is shorter here. Trust the arc.'],
    score: ['Five stars.', 'Effortless. Like the lifestyle.', 'The bin thanks you.'],
    bank: ['Creative use of the architecture.', 'Off the glass. Our windows are load-bearing.'],
    rattle: ['It found its way in. Like the sea breeze.', 'A dramatic entrance.'],
    rimOut: ['The rim is a boundary. Please respect it.', 'So close. Like the beach.'],
    miss: ['Housekeeping will handle that.', 'The floor is reclaimed oak. Please be gentle.'],
    missByTag: {
      window: 'The glass is floor to ceiling for a reason.', sofa: 'The sofa is not a bin. It is Italian.',
      table: 'Marble. Please.', plant: 'The plant did not consent.', island: 'The island is for entertaining.',
      mullion: 'Straight into the mullion.', ceiling: 'Five metres of ceiling and you found it.',
      wall: 'The wall is a feature, not a backboard.', velvet: 'Velvet. Please.',
    },
    streak: { 3: 'Three in a row. The host is impressed.', 5: 'Hot hand.', 8: 'Eight. Consider a career in this.' },
    milestone: { 50: 'Halfway. Refreshments are available.', 90: 'One more and the review writes itself.' },
    complete: {
      eyebrow: 'Sea Glass House', title: 'Five stars.', body: 'Twenty baskets, two houses, no meetings.',
      sub: 'Thank you for staying with us.', button: 'Play again',
    },
    idle: 'Take your time. Checkout is whenever.',
  },
];

// ---------------------------------------------------------------------------------------------
// Module state

const canvas = document.getElementById('game');
const hudRoot = document.getElementById('hud');
const game = new Emitter();      // 'throw', 'make', 'miss', 'levelComplete', 'win', 'pause', 'resume', 'stateChange'

const isTouch = detectTouch();
const quality = isTouch || (navigator.hardwareConcurrency || 8) <= 2 ? 'low' : 'high';
const settings = { reducedMotion: null, assistArc: false, invertYaw: false, touchAssist: true };
let reducedMotion = false;

let renderer = null, scene = null, camera = null, world = null, hud = null, audio = null;
let input = null, keys = null, arc = null, trail = null;

let state = STATE.BOOT, prevState = null;
let levelIndex = 0, level = null, copy = DEFAULT_COPY[0], levelStart = 0;
let levelDone = false, freePlay = false, completeAt = Infinity, pauseAfterTransition = false;

const session = {
  version: 1, levelIndex: 0,
  total: { score: 0, throws: 0, makes: 0, swishes: 0, rimOuts: 0, bestStreak: 0 },
  level: freshLevelStats(),
  levels: [],
  startedAt: Date.now(),
};
const gameInfo = { levelScore: 0, throws: 0, makes: 0, missStreak: 0, state: STATE.BOOT };

// Hand ball and launched balls
let hand = null;                 // { ball, mesh, spawnAt }
const entries = [];              // launched balls: { ball, mesh, launchedAt, resolved, result, resolvedAt, contactNoted, inBin }
const pendingRetire = [];        // entries whose removal is deferred until after the physics steps
let latest = null;               // most recently launched entry (the trail follows it)
let rearmAt = Infinity;          // game time at which the next hand ball appears
let spawnCounter = 0;

// Aim
const aim = { power: 0, yaw: 0, cancelled: true, pointerType: 'mouse', source: 'pointer' };
const arcOpts = { fraction: 0.72, power: 0 };
let pull = 0;
let vBin = 7.5, vMin = 5, vMax = 10;
let inputMode = 'pointer';

// Timing
let gameTime = 0, acc = 0, last = 0, loopRunning = false;
let readySince = 0, frameErrors = 0, levelUpdateErrors = 0;
let viewW = 0, viewH = 0, viewDpr = 0;

// HUD bookkeeping
let overlayOpen = false, overlayShownAt = 0, overlayPrimaryFn = null, gatePending = false;
let hintText = null, hintWanted = true, stuckShown = false, ambienceStarted = false;

// Scratch vectors (no per-frame allocation)
const UP = new THREE.Vector3(0, 1, 0);
const handBase = new THREE.Vector3();
const handPos = new THREE.Vector3();
const _off = new THREE.Vector3();
const _dirH = new THREE.Vector3();
const _right = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _v0 = new THREE.Vector3();
const _spin = new THREE.Vector3();
const _rnd = new THREE.Vector3();
const _imp = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _euler = new THREE.Euler();
const calDir = new THREE.Vector3(0, 0, -1);   // hand -> bin horizontal direction at calibration
const calRight = new THREE.Vector3(1, 0, 0);

// ---------------------------------------------------------------------------------------------
// Small helpers

function freshLevelStats() {
  return { score: 0, throws: 0, makes: 0, swishes: 0, rimOuts: 0, streak: 0, bestStreak: 0, missStreak: 0 };
}

function detectTouch() {
  try { return window.matchMedia('(pointer: coarse)').matches; } catch (_) { return false; }
}

function systemReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

function num(v, fallback) { return Number.isFinite(v) ? v : fallback; }

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * ((t - 1) ** 3) + c1 * ((t - 1) ** 2);
}

function toVec3(src, fallback) {
  const v = new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
  if (src && typeof src === 'object') {
    if (Array.isArray(src) && src.length >= 3) v.set(+src[0], +src[1], +src[2]);
    else if (Number.isFinite(src.x) && Number.isFinite(src.y) && Number.isFinite(src.z)) v.set(src.x, src.y, src.z);
  }
  return v;
}

function safe(fn) {
  return (payload) => {
    try { fn(payload); } catch (err) { console.error('[main] handler failed', err); }
  };
}

function haptic(ms) {
  if (!isTouch) return;
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) { /* not supported */ }
}

function pct(makes, throws) { return throws > 0 ? Math.round((makes / throws) * 100) : 0; }

function randomUnit(out) {
  let l2 = 0;
  do {
    out.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    l2 = out.lengthSq();
  } while (l2 < 1e-4 || l2 > 1);
  return out.normalize();
}

// Round-robin line picker (per array, random start, never the same line twice in a row).
const rrIndex = new Map();
function pick(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  let i = rrIndex.get(arr);
  i = i === undefined ? Math.floor(Math.random() * arr.length) : (i + 1) % arr.length;
  rrIndex.set(arr, i);
  return arr[i];
}

function mergeCopy(def, src) {
  const out = {};
  const s = src && typeof src === 'object' ? src : {};
  for (const k of Object.keys(def)) {
    const d = def[k], v = s[k];
    if (Array.isArray(d)) out[k] = Array.isArray(v) && v.length ? v : d;
    else if (d && typeof d === 'object') out[k] = Object.assign({}, d, v && typeof v === 'object' ? v : {});
    else out[k] = typeof v === 'string' && v ? v : d;
  }
  for (const k of Object.keys(s)) if (!(k in out)) out[k] = s[k];
  return out;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && typeof s === 'object') {
      if (typeof s.reducedMotion === 'boolean' || s.reducedMotion === null) settings.reducedMotion = s.reducedMotion;
      if (typeof s.assistArc === 'boolean') settings.assistArc = s.assistArc;
      if (typeof s.invertYaw === 'boolean') settings.invertYaw = s.invertYaw;
      if (typeof s.touchAssist === 'boolean') settings.touchAssist = s.touchAssist;
    }
  } catch (_) { /* storage unavailable */ }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) { /* storage unavailable */ }
}

// ---------------------------------------------------------------------------------------------
// Boot

function boot() {
  if (!canvas || !hudRoot) {
    console.error('[main] #game canvas or #hud root missing');
    return;
  }
  loadSettings();
  reducedMotion = settings.reducedMotion === null ? systemReducedMotion() : settings.reducedMotion;

  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, stencil: false, powerPreference: 'high-performance',
    });
  } catch (err) {
    console.error('[main] WebGL renderer failed', err);
    showPlainMessage('Trashketball needs WebGL 2 to run. Your browser or device could not create a graphics context.');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.error('[main] WebGL context lost');
    abortAim();
    fatal('The graphics context was lost. Reload the page to keep playing.');
  });

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, 1, 0.05, 250);
  camera.position.set(1.10, 1.60, -0.20);
  camera.lookAt(0.75, 1.10, -4.40);
  camera.updateMatrixWorld(true);
  initTextures(renderer);

  try {
    hud = new Hud(hudRoot);
  } catch (err) {
    console.error('[main] HUD failed', err);
    showPlainMessage('The HUD failed to start: ' + describe(err));
    return;
  }
  hud.setInputMode(isTouch ? 'touch' : 'pointer');
  inputMode = isTouch ? 'touch' : 'pointer';
  hud.setReducedMotion(reducedMotion);
  juice.setReducedMotion(reducedMotion);

  try { audio = new GameAudio(); } catch (err) { console.error('[main] audio failed', err); audio = silentAudio(); }
  try { hud.setSound(!audio.muted); } catch (_) { /* hud may not care */ }
  try {
    hud.onSoundToggle((on) => {
      unlockAudio();
      const wantOn = typeof on === 'boolean' ? on : !!audio.muted;
      audio.setMuted(!wantOn);
      hud.setSound(!audio.muted);
      blurHud();
    });
  } catch (_) { /* optional */ }

  world = createWorld();
  wireWorldEvents();

  arc = new ArcPreview(scene);
  if (typeof arc.setMarch === 'function') arc.setMarch(reducedMotion ? 0 : 0.6);
  trail = new FlightTrail(scene, camera);

  input = new DragInput(canvas, { onStart: onPointerStart, onMove: onPointerMove, onRelease: onPointerRelease, onCancel: onPointerCancel });
  input.setOptions({ invertYaw: settings.invertYaw });
  keys = new KeyboardAim({ onChange: onKeyAimChange, onRelease: onKeyAimRelease, onCancel: onKeyAimCancel });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('pointerdown', onWindowPointerDown, true);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('resize', () => { viewW = 0; });   // forces the per-frame check to re-run

  resizeToDisplaySize();
  if (!createLevel(0)) return;   // the error overlay is already up
  showTitle();

  last = performance.now();
  renderer.setAnimationLoop(frame);
  loopRunning = true;

  window.trashketball = {
    game, session, settings, world, renderer, scene, camera,
    get level() { return level; }, get state() { return state; },
    // Debug hook: advance the game deterministically (useful when the tab is hidden and rAF does not fire).
    advance(seconds = 1, stepMs = 1000 / 60) {
      const steps = Math.max(1, Math.round((seconds * 1000) / stepMs));
      for (let i = 0; i < steps; i++) { last += 0; frame(last + stepMs); }
      return { simTime: world.time, state, gameTime };
    },
  };
}

function describe(err) {
  if (!err) return 'unknown error';
  return String(err.message || err);
}

// Plain-text message inside #hud for failures before the HUD exists.
function showPlainMessage(message) {
  try {
    hudRoot.innerHTML = '';
    const box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:420px;padding:24px 28px;'
      + 'font:15px/1.5 -apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif;color:#e4f0ee;background:rgba(6,27,36,.92);'
      + 'border:1px solid rgba(127,224,204,.35);border-radius:4px;text-align:center;pointer-events:auto';
    box.textContent = message;
    hudRoot.appendChild(box);
    hudRoot.style.pointerEvents = 'auto';
  } catch (_) { /* nothing else we can do */ }
}

function fatal(message) {
  if (hud) {
    try {
      overlayOpen = true;
      hud.showOverlay({
        eyebrow: 'Trashketball', title: 'Something went wrong', body: message,
        buttons: [{ label: 'Reload', primary: true, onClick: () => window.location.reload() }],
      });
      return;
    } catch (_) { /* fall through */ }
  }
  showPlainMessage(message);
}

// Stand-in used only when the audio module throws in its constructor.
function silentAudio() {
  return {
    ready: false, muted: false,
    unlock() {}, setVariant() {}, play() {}, startAmbience() {}, stopAmbience() {},
    setMuted(m) { this.muted = !!m; }, suspend() {}, resume() {},
  };
}

function unlockAudio() {
  try { audio.unlock(); } catch (err) { console.error('[main] audio unlock failed', err); }
}

function startAmbience() {
  if (!level) return;
  try { audio.startAmbience(level.theme); ambienceStarted = true; } catch (_) { ambienceStarted = false; }
}

function play(name, opts) {
  try { audio.play(name, opts); } catch (err) { console.error('[main] audio.play failed', err); }
}

// ---------------------------------------------------------------------------------------------
// Renderer size, camera, calibration

function resizeToDisplaySize() {
  const w = canvas.clientWidth || window.innerWidth || 1;
  const h = canvas.clientHeight || window.innerHeight || 1;
  const dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
  if (w === viewW && h === viewH && dpr === viewDpr) return false;
  viewW = w; viewH = h; viewDpr = dpr;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  applyFov();
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return true;
}

function applyFov() {
  if (!level) return;
  const portrait = viewH > viewW;
  camera.fov = portrait ? level.camera.fovPortrait : level.camera.fov;
  juice.setBaseFov(camera.fov);
}

function applyCameraPose() {
  camera.position.copy(level.camera.position);
  camera.lookAt(level.camera.lookAt);
  camera.near = 0.05;
  camera.far = 250;
  applyFov();
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

// vBin is the speed that lands on the bin axis from the hand; the bin sits at half pull.
function calibrate() {
  if (!level) return;
  camera.updateMatrixWorld(true);
  computeHandPosition(camera, handBase);
  handPos.copy(handBase);
  const bin = level.bin;
  calDir.set(bin.x - handBase.x, 0, bin.z - handBase.z);
  if (calDir.lengthSq() < 1e-8) calDir.set(0, 0, -1); else calDir.normalize();
  calRight.crossVectors(calDir, UP);
  let v = NaN;
  try {
    v = world.solveSpeedForTarget(handBase, calDir, ELEVATION, { x: bin.x, y: bin.height, z: bin.z });
  } catch (err) { console.error('[main] calibration failed', err); }
  if (!Number.isFinite(v) || v <= 0) v = 7.5;
  vBin = v;
  vMin = Math.max(2.5, vBin - 2.5);
  vMax = vBin + 2.5;
}

// ---------------------------------------------------------------------------------------------
// Level lifecycle

function normalizeLevel(built, d) {
  const cam = built.camera || {};
  const bin = Object.assign({}, d.bin, built.bin || {});
  bin.materials = Object.assign({}, d.bin.materials, (built.bin && built.bin.materials) || {});
  for (const k of ['x', 'z', 'height', 'rOutTop', 'rOutBot', 'wall', 'floorThick', 'rimTube']) bin[k] = num(bin[k], d.bin[k]);
  const theme = built.theme === 'beach' || built.theme === 'lumon' ? built.theme : d.theme;
  return {
    id: built.id || d.id,
    theme,
    audioVariant: built.audioVariant === 'steel' || built.audioVariant === 'matte' ? built.audioVariant : d.audioVariant,
    group: built.group || null,
    camera: {
      position: toVec3(cam.position, d.camera.position),
      lookAt: toVec3(cam.lookAt, d.camera.lookAt),
      fov: num(cam.fov, d.camera.fov),
      fovPortrait: num(cam.fovPortrait, d.camera.fovPortrait),
    },
    bin,
    physics: built.physics && typeof built.physics === 'object' ? built.physics : {},
    previewFraction: clamp01(num(built.previewFraction, d.previewFraction)),
    arcColors: Object.assign({}, d.arcColors, built.arcColors || {}),
    trailColor: built.trailColor !== undefined && built.trailColor !== null ? built.trailColor : d.trailColor,
    hud: Object.assign({}, d.hud, built.hud || {}),
    accent: theme === 'beach' ? LEVEL_DEFAULTS[1].accent : LEVEL_DEFAULTS[0].accent,
    floorSurface: theme === 'beach' ? 'wood' : 'carpet',
    ballVariant: theme === 'beach' ? 'beach' : 'lumon',
    raw: built,
  };
}

function createLevel(index) {
  levelIndex = index;
  session.levelIndex = index;
  const d = LEVEL_DEFAULTS[index];
  const factory = index === 0 ? createSeveranceLevel : createBeachHouseLevel;
  let built = null;
  try {
    built = factory({ scene, renderer, camera, isTouch, quality });
    if (!built || typeof built !== 'object') throw new Error('level factory returned nothing');
  } catch (err) {
    console.error('[main] level build failed', err);
    level = null;
    fatal('Level ' + (index + 1) + ' failed to build: ' + describe(err));
    return null;
  }
  level = normalizeLevel(built, d);
  copy = mergeCopy(DEFAULT_COPY[index], built.copy);

  try {
    world.setLevel(Object.assign({}, level.physics, { bin: level.bin }));
  } catch (err) { console.error('[main] world.setLevel failed', err); }

  applyCameraPose();

  session.level = freshLevelStats();
  levelStart = gameTime;
  levelDone = false;
  freePlay = false;
  completeAt = Infinity;
  rearmAt = Infinity;
  juice.reset();

  try {
    hud.setTheme(level.theme);
    hud.setLevel(level.hud);
    hud.setScore(0, { animate: false });
    hud.setDots(0);
    hud.setStreak(0);
    hud.setStats({ throws: 0, makes: 0 });
    hud.setStuck(false);
    stuckShown = false;
  } catch (err) { console.error('[main] hud level setup failed', err); }
  hintWanted = true;
  refreshHint();

  try { audio.setVariant(level.audioVariant); } catch (_) { /* optional */ }
  try { arc.setColors(level.arcColors.near, level.arcColors.far); } catch (_) { /* optional */ }
  try { trail.setColor(level.trailColor); } catch (_) { /* optional */ }

  calibrate();
  return level;
}

function disposeLevel() {
  if (!level) return;
  juice.reset();
  const raw = level.raw;
  try {
    if (typeof raw.dispose === 'function') raw.dispose();
    else if (level.group) disposeTree(level.group);
  } catch (err) {
    console.error('[main] level dispose failed', err);
    try { if (level.group && level.group.parent) disposeTree(level.group); } catch (_) { /* best effort */ }
  }
  // Defensive reset of the scene look in case the level left something behind.
  try {
    if (scene.environment) { if (scene.environment.dispose) scene.environment.dispose(); scene.environment = null; }
    if (scene.background && scene.background.isTexture) scene.background.dispose();
    scene.background = null;
    scene.fog = null;
    renderer.renderLists.dispose();
  } catch (_) { /* ignore */ }
  try { world.setLevel(null); } catch (_) { /* ignore */ }
  level = null;
}

function levelEvent(name, payload) {
  if (!level || !level.raw || typeof level.raw.onEvent !== 'function') return;
  try { level.raw.onEvent(name, payload); } catch (err) {
    if (levelUpdateErrors++ < 8) console.error('[main] level.onEvent failed', err);
  }
}

function updateLevel(dt) {
  if (!level || !level.raw || typeof level.raw.update !== 'function') return;
  const L = session.level;
  gameInfo.levelScore = L.score;
  gameInfo.throws = L.throws;
  gameInfo.makes = L.makes;
  gameInfo.missStreak = L.missStreak;
  gameInfo.state = state;
  try { level.raw.update(dt, gameTime - levelStart, gameInfo); } catch (err) {
    if (levelUpdateErrors++ < 8) console.error('[main] level.update failed', err);
  }
}

// ---------------------------------------------------------------------------------------------
// State machine

function isPlayState(s) {
  return s === STATE.READY || s === STATE.AIMING || s === STATE.FLIGHT || s === STATE.NEXT_BALL;
}

function setState(next) {
  if (next === state) return;
  const from = state;
  state = next;
  gameInfo.state = next;
  if (next === STATE.READY) readySince = gameTime;
  if (next === STATE.READY || next === STATE.TITLE) refreshHint();
  refreshInputEnabled();
  game.emit('stateChange', { from, to: next });
}

function refreshInputEnabled() {
  const pointerOk = state === STATE.TITLE || isPlayState(state);
  input.enabled = pointerOk && !(levelDone && state !== STATE.TITLE);
  keys.enabled = (state === STATE.READY || state === STATE.AIMING) && !levelDone;
}

function showOverlay(opts) {
  overlayOpen = true;
  overlayShownAt = performance.now();
  gatePending = false;
  const primary = (opts.buttons || []).find((b) => b && b.primary) || (opts.buttons || [])[0];
  overlayPrimaryFn = primary ? primary.onClick : null;
  try { hud.showOverlay(opts); } catch (err) { console.error('[main] showOverlay failed', err); }
}

function hideOverlay() {
  overlayOpen = false;
  overlayPrimaryFn = null;
  try { hud.hideOverlay(); } catch (err) { console.error('[main] hideOverlay failed', err); }
  blurHud();
}

function blurHud() {
  try {
    const el = document.activeElement;
    if (el && el !== document.body && hudRoot.contains(el) && typeof el.blur === 'function') el.blur();
  } catch (_) { /* ignore */ }
}

// Completion overlays accept their buttons only after a short hold; early clicks are queued, not lost.
function gate(fn) {
  const delay = reducedMotion ? 400 : OVERLAY_BUTTON_DELAY;
  return () => {
    if (gatePending) return;
    const wait = overlayShownAt + delay - performance.now();
    if (wait <= 0) { fn(); return; }
    gatePending = true;
    setTimeout(() => { gatePending = false; fn(); }, wait);
  };
}

function activateOverlayPrimary() {
  if (typeof hud.overlayPrimary === 'function') {
    try { hud.overlayPrimary(); return; } catch (err) { console.error('[main] overlayPrimary failed', err); }
  }
  if (overlayPrimaryFn) overlayPrimaryFn();
}

function showTitle() {
  setState(STATE.TITLE);
  showOverlay({
    eyebrow: level.hud.eyebrow,
    title: 'Trashketball',
    body: copy.intro,
    footnote: isTouch ? null : KEYBOARD_FOOTNOTE,
    buttons: [{ label: 'Clock in', primary: true, onClick: startGame }],
  });
}

function startGame() {
  if (state !== STATE.TITLE) return;
  unlockAudio();
  play('tick');
  hideOverlay();
  startAmbience();
  spawnHandBall();
}

function pause() {
  if (!isPlayState(state)) return;
  abortAim();
  prevState = state;
  setState(STATE.PAUSED);
  try { audio.suspend(); } catch (_) { /* ignore */ }
  showPauseOverlay();
  game.emit('pause', { from: prevState });
}

function resume() {
  if (state !== STATE.PAUSED) return;
  if (document.visibilityState !== 'visible') return;
  hideOverlay();
  try { audio.resume(); } catch (_) { /* ignore */ }
  const target = prevState === STATE.AIMING ? STATE.READY : (prevState && isPlayState(prevState) ? prevState : STATE.READY);
  prevState = null;
  setState(target);
  if (target === STATE.READY && !hand) setState(STATE.FLIGHT);
  // The click or key that resumed must not start a drag: re-enable pointer input next frame.
  input.enabled = false;
  requestAnimationFrame(refreshInputEnabled);
  last = performance.now();
  game.emit('resume', { to: target });
}

function showPauseOverlay() {
  const onOff = (v) => (v ? 'on' : 'off');
  const toggle = (label, fn) => ({ label, onClick: () => { fn(); if (state === STATE.PAUSED) showPauseOverlay(); } });
  showOverlay({
    eyebrow: level ? level.hud.eyebrow : 'Trashketball',
    title: 'Paused',
    body: isTouch ? 'Tap anywhere to resume.' : 'Click anywhere to resume.',
    footnote: isTouch ? null : KEYBOARD_FOOTNOTE,
    buttons: [
      { label: 'Resume', primary: true, onClick: resume },
      toggle('Sound: ' + onOff(!audio.muted), toggleMute),
      toggle('Reduced motion: ' + onOff(reducedMotion), toggleReducedMotion),
      toggle('Assist arc: ' + onOff(settings.assistArc), () => { settings.assistArc = !settings.assistArc; saveSettings(); }),
      toggle('Invert aim: ' + onOff(settings.invertYaw), () => {
        settings.invertYaw = !settings.invertYaw; input.setOptions({ invertYaw: settings.invertYaw }); saveSettings();
      }),
      { label: 'Reset ball', onClick: () => { resume(); resetBall(); } },
    ],
  });
}

function toggleMute() {
  unlockAudio();
  try {
    audio.setMuted(!audio.muted);
    hud.setSound(!audio.muted);
  } catch (err) { console.error('[main] mute toggle failed', err); }
}

function toggleReducedMotion() {
  reducedMotion = !reducedMotion;
  settings.reducedMotion = reducedMotion;
  saveSettings();
  juice.setReducedMotion(reducedMotion);
  try { hud.setReducedMotion(reducedMotion); } catch (_) { /* ignore */ }
  if (typeof arc.setMarch === 'function') arc.setMarch(reducedMotion ? 0 : 0.6);
}

// ---------------------------------------------------------------------------------------------
// Hints and input mode

function currentHintCopy() {
  return inputMode === 'keyboard' ? KEYBOARD_HINT : copy.aimHint;
}

function setHintText(text) {
  if (text === hintText) return;
  hintText = text;
  try { hud.setHint(text); } catch (_) { /* ignore */ }
}

function refreshHint() {
  const visible = hintWanted && (isPlayState(state) || state === STATE.PAUSED);
  setHintText(visible ? currentHintCopy() : null);
}

function setInputMode(mode) {
  if (mode === inputMode) return;
  inputMode = mode;
  try { hud.setInputMode(mode); } catch (_) { /* ignore */ }
  if (hintWanted && state !== STATE.AIMING) refreshHint();
}

// ---------------------------------------------------------------------------------------------
// Hand ball

function spawnHandBall() {
  if (hand || !level) return;
  const ball = world.createBall();
  let mesh;
  try {
    mesh = createPaperBallMesh({ variant: level.ballVariant, seed: 1 + (spawnCounter++ % 6) });
  } catch (err) {
    console.error('[main] ball mesh failed, using a plain sphere', err);
    mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 1), new THREE.MeshStandardMaterial({ color: 0xf2efe6, flatShading: true }));
    mesh.castShadow = true;
  }
  _euler.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
  mesh.quaternion.setFromEuler(_euler);
  ball.q.x = mesh.quaternion.x; ball.q.y = mesh.quaternion.y; ball.q.z = mesh.quaternion.z; ball.q.w = mesh.quaternion.w;
  ball.prevQ.x = ball.q.x; ball.prevQ.y = ball.q.y; ball.prevQ.z = ball.q.z; ball.prevQ.w = ball.q.w;
  mesh.scale.setScalar(0.001);
  mesh.position.copy(handPos);
  scene.add(mesh);
  hand = { ball, mesh, spawnAt: gameTime };
  pull = 0;
  rearmAt = Infinity;
  play('crinkle', { spawn: true });
  setState(STATE.NEXT_BALL);
}

function retireHand(ms = 150) {
  if (!hand) return;
  const h = hand;
  hand = null;
  try { world.removeBall(h.ball); } catch (_) { /* ignore */ }
  removeMesh(h.mesh, ms);
}

function removeMesh(mesh, ms) {
  try {
    const p = shrinkAndRemove(mesh, ms);
    if (p && typeof p.catch === 'function') p.catch(() => { if (mesh.parent) mesh.parent.remove(mesh); });
  } catch (err) {
    console.error('[main] shrinkAndRemove failed', err);
    if (mesh.parent) mesh.parent.remove(mesh);
  }
}

function updateHand(dt) {
  computeHandPosition(camera, handBase);
  const target = state === STATE.AIMING && !aim.cancelled ? aim.power : 0;
  const k = dt > 0 ? Math.min(1, dt / PULL_SMOOTHING) : 0;
  pull += (target - pull) * k;
  if (Math.abs(target - pull) < 1e-4) pull = target;
  _off.set(0, -0.04 * pull, 0.05 * pull).applyQuaternion(camera.quaternion);
  handPos.copy(handBase).add(_off);
  if (hand) hand.mesh.position.copy(handPos);
}

function updateSpawn() {
  if (state !== STATE.NEXT_BALL || !hand) return;
  const dur = reducedMotion ? 0.08 : SPAWN_SECONDS;
  const u = Math.min(1, (gameTime - hand.spawnAt) / dur);
  const s = reducedMotion ? u : easeOutBack(u);
  hand.mesh.scale.setScalar(Math.max(0.001, s));
  if (u >= 1) {
    hand.mesh.scale.setScalar(1);
    setState(STATE.READY);
  }
}

// ---------------------------------------------------------------------------------------------
// Aiming and launching

function launchSpeed(power, pointerType) {
  let speed = speedFromPower(clamp01(power), vMin, vMax);
  if (settings.touchAssist && pointerType === 'touch' && Math.abs(speed - vBin) < TOUCH_ASSIST_WINDOW) {
    speed += TOUCH_ASSIST_GAIN * (vBin - speed);
  }
  return speed;
}

// v0 = speed * (cos(el) * dirYaw + sin(el) * up); dirYaw = dirH rotated about Y by yaw (positive = right).
// Leaves the yawed horizontal direction in _dir for the spin axis.
function computeV0(power, yaw, pointerType, out) {
  const bin = level.bin;
  _dirH.set(bin.x - handPos.x, 0, bin.z - handPos.z);
  if (_dirH.lengthSq() < 1e-8) _dirH.copy(calDir); else _dirH.normalize();
  _right.crossVectors(_dirH, UP);
  _dir.copy(_dirH).multiplyScalar(Math.cos(yaw)).addScaledVector(_right, Math.sin(yaw));
  const speed = launchSpeed(power, pointerType);
  out.copy(_dir).multiplyScalar(Math.cos(ELEVATION)).addScaledVector(UP, Math.sin(ELEVATION)).multiplyScalar(speed);
  return out;
}

function previewFraction() {
  if (settings.assistArc) return 1;
  if (levelIndex === 0 && session.level.throws < 3) return 1;
  return level.previewFraction;
}

function markerKind(type) {
  if (type === 'floor') return 'floor';
  if (type === 'rim' || type === 'binWall' || type === 'binFloor') return 'rim';
  return 'box';
}

function startAim(source) {
  if (state !== STATE.READY || !hand || levelDone) return false;
  aim.source = source;
  aim.power = 0;
  aim.yaw = 0;
  aim.cancelled = source === 'pointer';
  aim.pointerType = source === 'keyboard' ? 'keyboard' : input.aim && input.aim.pointerType ? input.aim.pointerType : 'mouse';
  setState(STATE.AIMING);
  try { crinkle(hand.mesh); } catch (_) { /* ignore */ }
  play('crinkle', { spawn: false });
  haptic(8);
  return true;
}

function updateAim() {
  if (!hand || !level) return;
  if (aim.cancelled) {
    arc.hide();
    setHintText(CANCEL_HINT);
    return;
  }
  if (hintText === CANCEL_HINT) setHintText(null);
  computeV0(aim.power, aim.yaw, aim.pointerType, _v0);
  const res = world.predict(handPos, _v0, PREDICT_OPTS);
  const fraction = previewFraction();
  arcOpts.fraction = fraction;
  arcOpts.power = aim.power;
  arc.update(res.points, res.count, arcOpts);
  if (fraction >= 1 && res.contact) arc.showMarker(res.contact.point, markerKind(res.contact.type));
}

function cancelAim() {
  arc.hide();
  aim.cancelled = true;
  aim.power = 0;
  if (state === STATE.AIMING) setState(STATE.READY);
  if (hintText === CANCEL_HINT) refreshHint();
}

// Cancel any drag or keyboard charge without throwing.
function abortAim() {
  try { if (input.aiming) input.cancel(); } catch (_) { /* ignore */ }
  try { if (typeof keys.cancel === 'function') keys.cancel(); } catch (_) { /* ignore */ }
  if (state === STATE.AIMING) cancelAim();
}

function countFlying() {
  let n = 0;
  for (let i = 0; i < entries.length; i++) if (entries[i].ball.state === 'flying') n++;
  return n;
}

function oldestFlying() {
  for (let i = 0; i < entries.length; i++) if (entries[i].ball.state === 'flying') return entries[i];
  return null;
}

function release() {
  if (state !== STATE.AIMING || !hand || !level) return;
  const power = clamp01(aim.power), yaw = aim.yaw, pointerType = aim.pointerType;

  if (countFlying() >= MAX_ACTIVE_BALLS) {
    const old = oldestFlying();
    if (old) { try { world.sleepBall(old.ball); } catch (_) { /* ignore */ } }
  }

  computeV0(power, yaw, pointerType, _v0);
  // Backspin about the throw's right axis with a little randomness.
  _spin.crossVectors(_dir, UP).normalize();
  randomUnit(_rnd);
  _spin.addScaledVector(_rnd, 0.35).normalize().multiplyScalar(18);

  const { ball, mesh } = hand;
  hand = null;
  mesh.scale.setScalar(1);
  ball.q.x = mesh.quaternion.x; ball.q.y = mesh.quaternion.y; ball.q.z = mesh.quaternion.z; ball.q.w = mesh.quaternion.w;
  world.launch(ball, handPos, _v0, _spin);
  const entry = {
    ball, mesh, launchedAt: gameTime, resolved: false, result: null, resolvedAt: 0,
    contactNoted: false, inBin: false, retired: false,
  };
  ball.userData.entry = entry;
  entries.push(entry);
  latest = entry;

  const L = session.level, T = session.total;
  L.throws++; T.throws++;
  try { hud.setStats({ throws: L.throws, makes: L.makes }); } catch (_) { /* ignore */ }
  hintWanted = false;
  setHintText(null);

  play('whoosh', { power });
  juice.fovKick(camera, power);
  trail.reset();
  arc.hide();
  pull = 0;
  rearmAt = gameTime + REARM_AFTER_LAUNCH;
  setState(STATE.FLIGHT);
  levelEvent('throw', { power, yaw, ball });
  game.emit('throw', { power, yaw });
}

// ---------------------------------------------------------------------------------------------
// Input callbacks

function onPointerStart() {
  unlockAudio();
  const pt = input.aim && input.aim.pointerType === 'touch' ? 'touch' : 'pointer';
  setInputMode(pt);
  if (state === STATE.TITLE) { startGame(); input.cancel(); return; }
  if (state === STATE.READY) {
    if (!startAim('pointer')) input.cancel();
    return;
  }
  if (state === STATE.FLIGHT && !levelDone && latest && latest.resolved && gameTime - latest.resolvedAt >= 0.15) {
    spawnHandBall();   // skip the rest of the feedback beat
  }
  input.cancel();
}

function onPointerMove(a) {
  if (state !== STATE.AIMING || aim.source !== 'pointer') return;
  aim.power = a.power;
  aim.yaw = a.yaw;
  aim.cancelled = !!a.cancelled;
  aim.pointerType = a.pointerType || 'mouse';
}

function onPointerRelease(a) {
  if (state !== STATE.AIMING || aim.source !== 'pointer') return;
  aim.power = a.power;
  aim.yaw = a.yaw;
  aim.cancelled = !!a.cancelled;
  aim.pointerType = a.pointerType || 'mouse';
  if (aim.cancelled || aim.power < MIN_THROW_POWER) cancelAim();
  else release();
}

function onPointerCancel() {
  if (state === STATE.AIMING && aim.source === 'pointer') cancelAim();
}

function keyboardCharging(a) {
  return keys.charging === true || keys.aiming === true || (a && a.power > 0);
}

function onKeyAimChange(a) {
  unlockAudio();
  setInputMode('keyboard');
  if (state === STATE.READY && keyboardCharging(a)) {
    if (!startAim('keyboard')) return;
  }
  if (state !== STATE.AIMING || aim.source !== 'keyboard') return;
  aim.power = clamp01(a.power);
  aim.yaw = a.yaw;
  aim.cancelled = false;
  aim.pointerType = 'keyboard';
}

function onKeyAimRelease(a) {
  if (state !== STATE.AIMING || aim.source !== 'keyboard') return;
  aim.power = clamp01(a.power);
  aim.yaw = a.yaw;
  aim.cancelled = false;
  if (aim.power < MIN_THROW_POWER) cancelAim();
  else release();
}

function onKeyAimCancel() {
  if (state === STATE.AIMING && aim.source === 'keyboard') cancelAim();
}

function onKeyDown(e) {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const k = e.key;
  if (k === 'm' || k === 'M') { toggleMute(); return; }

  if (state === STATE.PAUSED) {
    if (document.visibilityState === 'visible') { e.preventDefault(); resume(); }
    return;
  }
  if (overlayOpen) {
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      const el = document.activeElement;
      if (el && el.tagName === 'BUTTON' && hudRoot.contains(el)) return;   // the focused button handles it
      e.preventDefault();
      unlockAudio();
      activateOverlayPrimary();
    }
    return;
  }
  switch (k) {
    case 'Escape': case 'p': case 'P': case '?':
      e.preventDefault();
      pause();
      break;
    case 'r': case 'R':
      resetBall();
      break;
    default:
      break;
  }
}

// Resume from pause on any click outside the HUD's own controls.
function onWindowPointerDown(e) {
  if (state !== STATE.PAUSED) return;
  if (e.target && hudRoot.contains(e.target)) return;
  resume();
}

function onVisibilityChange() {
  if (document.hidden) {
    abortAim();
    if (isPlayState(state)) pause();
    else if (state === STATE.TRANSITION) pauseAfterTransition = true;
    try { audio.suspend(); } catch (_) { /* ignore */ }
    if (renderer && loopRunning) { renderer.setAnimationLoop(null); loopRunning = false; }
  } else {
    last = performance.now();
    if (renderer && !loopRunning) { renderer.setAnimationLoop(frame); loopRunning = true; }
    if (state !== STATE.PAUSED) { try { audio.resume(); } catch (_) { /* ignore */ } }
  }
}

// R: cancel a drag, kill flying balls (they count as misses), give the hand a fresh ball.
function resetBall() {
  if (!isPlayState(state) || !level) return;
  const wasAiming = state === STATE.AIMING;
  abortAim();
  for (let i = 0; i < entries.length; i++) {
    const b = entries[i].ball;
    if (b.state === 'flying') { try { world.sleepBall(b); } catch (_) { /* ignore */ } }
  }
  processDeferred();
  if (levelDone) return;
  if (wasAiming) return;   // the drag was cancelled; the ball stays in hand
  if (hand) { retireHand(120); spawnHandBall(); }
  else spawnHandBall();
}

// ---------------------------------------------------------------------------------------------
// Physics events: audio, juice, classification

function wireWorldEvents() {
  world.on('rimHit', safe((e) => {
    play('clink', { speed: e.speed });
    wobbleFromNormal(e, 4 * Math.min(1, e.speed / 5));
    levelEvent('rimHit', e);
  }));
  world.on('binWallHit', safe((e) => {
    play('clink', { speed: e.speed * 0.6 });
    wobbleFromNormal(e, 2 * Math.min(1, e.speed / 5));
    levelEvent('binWallHit', e);
  }));
  world.on('binFloorHit', safe((e) => {
    play('thud', { speed: e.speed });
    if (level) juice.binSquash(level.bin.group);
    wobbleFromNormal(e, 2 * Math.min(1, e.speed / 5));
    levelEvent('binFloorHit', e);
  }));
  world.on('floorHit', safe((e) => {
    play('floor', { speed: e.speed, surface: level ? level.floorSurface : 'carpet' });
    levelEvent('floorHit', e);
  }));
  world.on('boxHit', safe((e) => {
    play('surface', { speed: e.speed, tag: e.tag });
    levelEvent('boxHit', e);
  }));
  world.on('cylinderHit', safe((e) => {
    play('surface', { speed: e.speed, tag: e.tag });
    levelEvent('cylinderHit', e);
  }));
  world.on('ballHit', safe((e) => {
    play('surface', { speed: e.speed * 0.5, tag: 'ball' });
  }));
  world.on('scored', safe(onScored));
  world.on('rest', safe(onRest));
  world.on('outOfBounds', safe(onOutOfBounds));
}

function wobbleFromNormal(e, deg) {
  if (!level || !e || !e.normal) return;
  _imp.set(-e.normal.x, 0, -e.normal.z);
  juice.binWobble(level.bin.group, _imp, deg);
}

function lastBoxTag(ball) {
  const t = ball.boxTags;
  return t && t.length ? t[t.length - 1] : null;
}

function dotsFor() {
  return Math.min(10, Math.floor(session.level.score / POINTS_PER_MAKE));
}

function onScored(e) {
  const ball = e.ball;
  const entry = ball && ball.userData ? ball.userData.entry : null;
  if (!entry || entry.resolved) return;
  const c = ball.contacts;
  let kind = 'swish';
  if (c.box + c.cylinder + c.outer > 0) kind = 'bank';
  else if (c.rim + c.inner > 0) kind = 'rattle';
  entry.resolved = true;
  entry.result = kind;
  entry.resolvedAt = gameTime;
  entry.inBin = true;

  const L = session.level, T = session.total;
  L.score += POINTS_PER_MAKE; T.score += POINTS_PER_MAKE;
  L.makes++; T.makes++;
  L.streak++; L.missStreak = 0;
  if (L.streak > L.bestStreak) L.bestStreak = L.streak;
  if (L.streak > T.bestStreak) T.bestStreak = L.streak;
  if (kind === 'swish') { L.swishes++; T.swishes++; }

  const tag = lastBoxTag(ball);
  const label = kind === 'swish' ? 'Swish' : kind === 'rattle' ? 'Rattled in' : (tag === 'window' ? 'Off the glass' : 'Bank shot');
  try {
    hud.setScore(L.score, { animate: true });
    hud.setDots(dotsFor());
    hud.setStreak(L.streak >= 3 ? L.streak : 0);
    hud.setStats({ throws: L.throws, makes: L.makes });
    hud.live('Score ' + L.score + '. ' + label + '.');
  } catch (err) { console.error('[main] hud update failed', err); }
  popupAtRim('+' + POINTS_PER_MAKE, 'score', label);

  let line = null;
  if (L.score === 50 || L.score === 90) line = copy.milestone[L.score];
  else if (copy.streak[L.streak]) line = copy.streak[L.streak];
  else line = pick(kind === 'swish' ? copy.score : kind === 'bank' ? copy.bank : copy.rattle);
  say(line);

  play('sting', { variant: kind });
  if (level) {
    juice.rimGlow(level.bin.rimMesh, level.accent);
    _imp.set(ball.p.x - level.bin.x, 0, ball.p.z - level.bin.z);
    juice.binWobble(level.bin.group, _imp, kind === 'swish' ? 2 : 4);
  }
  haptic(15);

  if (entry === latest) {
    rearmAt = Math.min(rearmAt, gameTime + REARM_AFTER_SCORE);
    trail.fadeOut(300);
  }
  levelEvent('scored', { ball, kind, streak: L.streak, levelScore: L.score, totalScore: T.score, point: e.point });
  game.emit('make', { type: kind, streak: L.streak, levelScore: L.score, totalScore: T.score });

  if (!freePlay && !levelDone && L.score >= LEVEL_TARGET) {
    levelDone = true;
    completeAt = gameTime + COMPLETE_DELAY;
    abortAim();
    retireHand(200);
    if (isPlayState(state)) setState(STATE.FLIGHT);
    refreshInputEnabled();
    setHintText(null);
  }
}

function onRest(e) {
  const ball = e.ball;
  const entry = ball && ball.userData ? ball.userData.entry : null;
  if (!entry) return;
  if (!entry.resolved) resolveMiss(entry, ball);
  if (entry === latest) trail.fadeOut(300);
  enforceClutter();
}

function onOutOfBounds(e) {
  const ball = e.ball;
  const entry = ball && ball.userData ? ball.userData.entry : null;
  if (!entry) return;
  if (!entry.resolved) resolveMiss(entry, ball);
  if (entry === latest) { rearmAt = Math.min(rearmAt, gameTime); trail.fadeOut(200); }
  retireEntry(entry, 200);
}

function resolveMiss(entry, ball) {
  entry.resolved = true;
  entry.resolvedAt = gameTime;
  const rimOut = ball.contacts.rim > 0 || ball.enteredIn === true;
  entry.result = rimOut ? 'rimOut' : 'miss';

  const L = session.level, T = session.total;
  L.streak = 0;
  L.missStreak++;
  if (rimOut) { L.rimOuts++; T.rimOuts++; }

  const tag = lastBoxTag(ball);
  let hint = null;
  if (rimOut) popupAtRim('Rim out', 'warn', null);
  else if (missHintsAllowed()) {
    hint = missHint(ball.p);
    popupAtWorld(ball.p.x, ball.p.y + 0.05, ball.p.z, hint, 'muted', null);
  }
  try {
    hud.setStreak(0);
    hud.setStats({ throws: L.throws, makes: L.makes });
    hud.live(rimOut ? 'Rim out.' : 'Miss.' + (hint ? ' ' + hint : ''));
  } catch (err) { console.error('[main] hud update failed', err); }

  let line = null;
  if (rimOut) line = pick(copy.rimOut);
  else if (tag && copy.missByTag && copy.missByTag[tag]) line = copy.missByTag[tag];
  else line = pick(copy.miss);
  say(line);

  const error = missError(ball.p);
  levelEvent('miss', { ball, type: entry.result, tag, error, missStreak: L.missStreak });
  levelEvent('missStreak', { count: L.missStreak, ball });
  game.emit('miss', { type: entry.result, error });
}

function missHintsAllowed() {
  return levelIndex === 0 ? true : session.level.missStreak >= 2;
}

// Landing error in the throw frame: x = lateral (+ right), z = depth (+ long).
const _err = { dx: 0, dz: 0 };
function missError(p) {
  const bin = level ? level.bin : { x: 0, z: -4 };
  const ox = p.x - bin.x, oz = p.z - bin.z;
  _err.dx = ox * calRight.x + oz * calRight.z;
  _err.dz = ox * calDir.x + oz * calDir.z;
  return _err;
}

function missHint(p) {
  const err = missError(p);
  const ax = Math.abs(err.dx), az = Math.abs(err.dz);
  if (ax < 0.12 && az < 0.12) return 'So close.';
  if (az >= ax) return err.dz > 0 ? 'A little long.' : 'A little short.';
  return err.dx > 0 ? 'Just right.' : 'Just left.';
}

function say(line) {
  if (!line || typeof line !== 'string') return;
  try { hud.say(line); } catch (_) { /* ignore */ }
}

function popupAtRim(text, kind, sub) {
  if (!level) return;
  popupAtWorld(level.bin.x, level.bin.height, level.bin.z, text, kind, sub);
}

function popupAtWorld(x, y, z, text, kind, sub) {
  _proj.set(x, y, z).project(camera);
  if (!(_proj.z > -1 && _proj.z < 1)) return;   // behind the camera or past the far plane
  const sx = (_proj.x + 1) * 0.5 * viewW;
  const sy = (1 - _proj.y) * 0.5 * viewH;
  try { hud.popup(text, { x: sx, y: sy, kind, sub }); } catch (_) { /* ignore */ }
}

// ---------------------------------------------------------------------------------------------
// Ball bookkeeping: clutter caps, deferred removal

function enforceClutter() {
  let inside = 0, outside = 0;
  for (let i = 0; i < entries.length; i++) {
    const en = entries[i];
    if (en.retired || en.ball.state !== 'sleeping') continue;
    if (en.inBin) inside++; else outside++;
  }
  if (inside > MAX_CLUTTER_INSIDE) retireOldest(true, inside - MAX_CLUTTER_INSIDE);
  if (outside > MAX_CLUTTER_OUTSIDE) retireOldest(false, outside - MAX_CLUTTER_OUTSIDE);
}

function retireOldest(inBin, count) {
  for (let i = 0; i < entries.length && count > 0; i++) {
    const en = entries[i];
    if (en.retired || en.ball.state !== 'sleeping' || en.inBin !== inBin) continue;
    retireEntry(en, 400);
    count--;
  }
}

function retireEntry(entry, ms) {
  if (entry.retired) return;
  entry.retired = true;
  entry.retireMs = ms;
  pendingRetire.push(entry);
}

// Physics events fire inside world.step(); removing balls there would disturb the step loop.
function processDeferred() {
  while (pendingRetire.length) {
    const en = pendingRetire.pop();
    try { world.removeBall(en.ball); } catch (_) { /* ignore */ }
    const i = entries.indexOf(en);
    if (i >= 0) entries.splice(i, 1);
    if (latest === en) latest = null;
    removeMesh(en.mesh, en.retireMs || 400);
  }
}

function clearBalls() {
  abortAim();
  for (let i = 0; i < entries.length; i++) {
    const en = entries[i];
    try { world.removeBall(en.ball); } catch (_) { /* ignore */ }
    removeMesh(en.mesh, 120);
  }
  entries.length = 0;
  pendingRetire.length = 0;
  latest = null;
  retireHand(120);
  rearmAt = Infinity;
  trail.reset();
  arc.hide();
  if (stuckShown) { stuckShown = false; try { hud.setStuck(false); } catch (_) { /* ignore */ } }
}

function oldestFlyingAge() {
  for (let i = 0; i < entries.length; i++) {
    const en = entries[i];
    if (en.ball.state === 'flying' && !en.resolved) return gameTime - en.launchedAt;
  }
  return 0;
}

// ---------------------------------------------------------------------------------------------
// Level completion, transitions

function completeLevel() {
  const L = session.level, T = session.total;
  session.levels.push(Object.assign({}, L));
  const isLast = levelIndex >= LEVEL_DEFAULTS.length - 1;
  abortAim();
  retireHand(120);
  setState(isLast ? STATE.WIN : STATE.LEVEL_COMPLETE);
  play(isLast ? 'win' : 'levelUp');
  levelEvent('levelComplete', { levelScore: L.score, makes: L.makes, throws: L.throws, totalScore: T.score });
  game.emit(isLast ? 'win' : 'levelComplete', { level: levelIndex, session });

  const c = copy.complete;
  if (!isLast) {
    showOverlay({
      eyebrow: c.eyebrow, title: c.title, body: c.body,
      stats: L.makes + ' made · ' + L.throws + ' throws · ' + pct(L.makes, L.throws) + '% · ' + L.swishes + ' swishes',
      sub: c.sub,
      buttons: [{ label: c.button, primary: true, onClick: gate(() => goToLevel(levelIndex + 1)) }],
    });
  } else {
    showOverlay({
      eyebrow: level.hud.name, title: c.title, body: c.body,
      stats: T.makes + ' made · ' + T.throws + ' throws · ' + pct(T.makes, T.throws) + '% · Longest streak '
        + T.bestStreak + ' · ' + T.swishes + ' swishes',
      sub: c.sub,
      buttons: [
        { label: 'Play again', primary: true, onClick: gate(playAgain) },
        { label: 'Stay at the beach', onClick: gate(stayAtBeach) },
      ],
    });
  }
}

function playAgain() {
  if (state !== STATE.WIN) return;
  const T = session.total;
  T.score = 0; T.throws = 0; T.makes = 0; T.swishes = 0; T.rimOuts = 0; T.bestStreak = 0;
  session.levels.length = 0;
  session.startedAt = Date.now();
  goToLevel(0);
}

function stayAtBeach() {
  if (state !== STATE.WIN) return;
  play('tick');
  hideOverlay();
  freePlay = true;
  levelDone = false;
  completeAt = Infinity;
  setState(STATE.FLIGHT);
  spawnHandBall();
}

async function goToLevel(next) {
  if (state === STATE.TRANSITION || !LEVEL_DEFAULTS[next]) return;
  setState(STATE.TRANSITION);
  hideOverlay();
  play('tick');
  try { audio.stopAmbience(600); } catch (_) { /* ignore */ }
  ambienceStarted = false;

  const d = LEVEL_DEFAULTS[next];
  const rm = reducedMotion;
  // `big` is read lazily so the HUD can show the real level name once the new level exists.
  const text = {
    small: 'Level ' + (next + 1),
    get big() { return level && levelIndex === next && level.hud && level.hud.name ? level.hud.name : d.hud.name; },
  };
  const swap = () => {
    if (levelIndex === next && level) return;
    clearBalls();
    disposeLevel();
    createLevel(next);
  };
  try {
    await hud.fade(d.fadeColor, {
      inMs: rm ? 300 : 600, holdMs: rm ? 200 : 700, outMs: rm ? 300 : 800, text, onCovered: swap,
    });
  } catch (err) {
    console.error('[main] hud.fade failed', err);
  }
  if (levelIndex !== next || !level) swap();   // the fade never covered the screen, or was not available
  if (!level) return;                            // createLevel already showed the error
  setState(STATE.FLIGHT);
  startAmbience();
  spawnHandBall();
  if (pauseAfterTransition) {
    pauseAfterTransition = false;
    if (document.hidden) pause();
  }
}

// ---------------------------------------------------------------------------------------------
// Per-frame updates

function syncEntries(alpha) {
  for (let i = 0; i < entries.length; i++) {
    const en = entries[i];
    const b = en.ball;
    if (b.state === 'held') continue;
    syncBallMesh(en.mesh, b, b.state === 'flying' ? alpha : 1);
  }
}

function updateTrail(dt) {
  if (latest && !latest.resolved && latest.ball.state === 'flying') trail.push(latest.mesh.position);
  trail.update(dt);
}

function updateTimers() {
  // Rearm: 0.35 s after the latest ball's first contact (resting contacts count, so poll the ball).
  if (latest && !latest.contactNoted && latest.ball.firstContactAt !== null) {
    latest.contactNoted = true;
    rearmAt = Math.min(rearmAt, gameTime + REARM_AFTER_CONTACT);
  }
  if (state === STATE.FLIGHT && !levelDone && gameTime >= rearmAt) spawnHandBall();

  if (levelDone && completeAt !== Infinity && gameTime >= completeAt && isPlayState(state)) {
    completeAt = Infinity;
    completeLevel();
  }

  const stuck = isPlayState(state) && oldestFlyingAge() > STUCK_AFTER;
  if (stuck !== stuckShown) {
    stuckShown = stuck;
    try { hud.setStuck(stuck); } catch (_) { /* ignore */ }
  }

  if (state === STATE.READY && !hintWanted && gameTime - readySince > IDLE_HINT_AFTER) {
    hintWanted = true;
    refreshHint();
    say(copy.idle);
    readySince = gameTime;
  }

  if (!ambienceStarted && isPlayState(state) && audio.ready) startAmbience();
}

function frame(now) {
  try {
    frameInner(now);
    frameErrors = 0;
  } catch (err) {
    console.error('[main] frame failed', err);
    if (++frameErrors > 120) {
      renderer.setAnimationLoop(null);
      loopRunning = false;
      fatal('The game loop hit a persistent error: ' + describe(err));
    }
  }
}

function frameInner(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt >= 0)) dt = 0;
  if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;
  if (state === STATE.PAUSED || state === STATE.BOOT) dt = 0;

  if (resizeToDisplaySize()) calibrate();

  gameTime += dt;
  acc += dt;
  let steps = 0;
  while (acc >= FIXED_DT && steps < MAX_STEPS) {
    world.step(FIXED_DT);
    acc -= FIXED_DT;
    steps++;
  }
  if (steps === MAX_STEPS) acc = 0;
  processDeferred();
  const alpha = acc / FIXED_DT;

  updateHand(dt);
  updateSpawn();
  syncEntries(alpha);
  animateBallMeshes(dt);
  updateTrail(dt);
  if (state === STATE.AIMING) updateAim();
  updateTimers();
  updateLevel(dt);
  juice.update(dt);
  renderer.render(scene, camera);
}

boot();
