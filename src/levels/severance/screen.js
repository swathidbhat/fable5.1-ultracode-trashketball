// Lumon terminal screen: a 512 x 384 canvas. The two monitors that face the camera redraw it at 12 fps
// (severance.js drives the timing); the other two use one static snapshot drawn once at load.
import { PALETTE } from './textures.js';
import { mulberry32 } from '../../textures.js';

export const SCREEN_W = 512;
export const SCREEN_H = 384;

const COLS = 12, ROWS = 8;
const GRID_X0 = 36, GRID_Y0 = 58, CELL_W = 40, CELL_H = 30;
const SCARY_SETTLE = 2.5;   // s, the swell-and-ease phase
const SCARY_RUN = 1.0;      // s, the cluster runs one cell per redraw (first event of the level only)
const REDRAW_FPS = 12;

// Per-screen animation state. One per animated texture (and one throwaway for the static snapshot).
export function createScreenState(seed = 1) {
  const rng = mulberry32(seed);
  const n = COLS * ROWS;
  const digits = new Uint8Array(n);
  const phaseX = new Float32Array(n), phaseY = new Float32Array(n), rate = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    digits[i] = (rng() * 10) | 0;
    phaseX[i] = rng() * Math.PI * 2;
    phaseY[i] = rng() * Math.PI * 2;
    rate[i] = 0.35 + rng() * 0.45;
  }
  return {
    rng, digits, phaseX, phaseY, rate,
    time: 0,
    percent: 0,           // 0..100, the header value and bucket fills
    complete: false,      // FILE COMPLETE screen
    completeAt: 0,
    scary: null,          // { c0, r0, c, r, start, runUntil, end }
    nextScary: 8 + rng() * 6,
    scaryCount: 0,
    nextFlip: 1.5,
    vignette: null,       // cached gradient (bound to the canvas context that made it)
  };
}

// Advance timers. Returns nothing; drawScreen reads the state.
export function advanceScreen(s, dt) {
  s.time += dt;
  if (s.time >= s.nextFlip) {
    // one digit quietly changes now and then
    const i = (s.rng() * s.digits.length) | 0;
    s.digits[i] = (s.digits[i] + 1 + ((s.rng() * 9) | 0)) % 10;
    s.nextFlip = s.time + 0.8 + s.rng() * 1.4;
  }
  if (!s.scary && s.time >= s.nextScary && !s.complete) {
    const run = s.scaryCount === 0;
    const c0 = (s.rng() * (COLS - 2)) | 0, r0 = (s.rng() * (ROWS - 2)) | 0;
    const start = s.time;
    const runUntil = run ? start + SCARY_RUN : start;
    s.scary = { c0, r0, c: c0, r: r0, start, runUntil, end: runUntil + SCARY_SETTLE };
    s.scaryCount++;
  }
  if (s.scary) {
    const sc = s.scary;
    if (s.time < sc.runUntil) {
      const k = Math.floor((s.time - sc.start) * REDRAW_FPS);
      sc.c = (sc.c0 + k) % (COLS - 2);
      sc.r = (sc.r0 + (k >> 1)) % (ROWS - 2);
    } else if (s.time >= sc.end) {
      s.scary = null;
      s.nextScary = s.time + 8 + s.rng() * 6;
    }
  }
}

function scaryEnvelope(s) {
  const sc = s.scary;
  if (!sc) return 0;
  if (s.time < sc.runUntil) return 1;
  const u = (s.time - sc.runUntil) / SCARY_SETTLE;
  return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u);
}

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t;
  const g = ((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t;
  const bl = (pa & 255) + ((pb & 255) - (pa & 255)) * t;
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}

// Full redraw. `s` carries all animation state; `w`/`h` are the canvas size (SCREEN_W x SCREEN_H).
export function drawScreen(ctx, w, h, s) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PALETTE.screenBg;
  ctx.fillRect(0, 0, w, h);

  // header: file name left, percentage right, rule underneath
  const pct = Math.max(0, Math.min(100, Math.round(s.percent)));
  ctx.textBaseline = 'middle';
  ctx.font = '600 15px "Courier New", Courier, monospace';
  ctx.fillStyle = PALETTE.screenInk;
  ctx.textAlign = 'left';
  ctx.fillText('Cold Harbor', 14, 13);
  ctx.textAlign = 'right';
  ctx.fillText(pct + '%', w - 14, 13);
  ctx.fillStyle = PALETTE.screenDim;
  ctx.fillRect(0, 24, w, 1);

  if (s.complete) {
    const held = s.time - s.completeAt;
    const on = held > 3 || Math.floor(held * 2) % 2 === 0;
    if (on) {
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.screenHi;
      ctx.font = '600 22px "Courier New", Courier, monospace';
      ctx.fillText('FILE COMPLETE.', w / 2, h * 0.40);
      ctx.font = '16px "Courier New", Courier, monospace';
      ctx.fillStyle = PALETTE.screenInk;
      ctx.fillText('PLEASE PROCEED TO YOUR', w / 2, h * 0.52);
      ctx.fillText('NEXT ASSIGNMENT.', w / 2, h * 0.59);
    }
  } else {
    // digit grid with slow drift; the scary cluster swells, jitters and brightens
    const t = s.time;
    const env = scaryEnvelope(s);
    const sc = s.scary;
    ctx.textAlign = 'center';
    ctx.font = '18px "Courier New", Courier, monospace';
    ctx.fillStyle = PALETTE.screenInk;
    const hiColor = env > 0 ? mixHex(PALETTE.screenInk, PALETTE.screenHi, env) : null;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const k = s.rate[i];
        const dx = 2 * Math.sin(t * 0.7 * k + s.phaseX[i]) * Math.cos(t * 0.31 * k + s.phaseY[i]);
        const dy = 2 * Math.sin(t * 0.53 * k + s.phaseY[i]);
        const x = GRID_X0 + c * CELL_W + CELL_W / 2 + dx;
        const y = GRID_Y0 + r * CELL_H + dy;
        const ch = String(s.digits[i]);
        const inCluster = sc && env > 0 && c >= sc.c && c < sc.c + 3 && r >= sc.r && r < sc.r + 3;
        if (inCluster) {
          const jx = (s.rng() * 2 - 1) * 3 * env, jy = (s.rng() * 2 - 1) * 3 * env;
          const scale = 1 + 0.35 * env;
          ctx.save();
          ctx.translate(x + jx, y + jy);
          ctx.scale(scale, scale);
          ctx.fillStyle = hiColor;
          ctx.fillText(ch, 0, 0);
          ctx.restore();
          ctx.fillStyle = PALETTE.screenInk;
        } else {
          ctx.fillText(ch, x, y);
        }
      }
    }
  }

  // bucket strip: five boxes 00..04, each fills over 20 points
  ctx.lineWidth = 1;
  ctx.strokeStyle = PALETTE.screenDim;
  ctx.font = '9px "Courier New", Courier, monospace';
  ctx.textAlign = 'left';
  for (let i = 0; i < 5; i++) {
    const x = 26 + i * 94, y = 312, bw = 80, bh = 30;
    ctx.strokeRect(x + 0.5, y + 0.5, bw, bh);
    ctx.fillStyle = PALETTE.screenDim;
    ctx.fillText('0' + i, x + 6, y + 9);
    const fill = Math.max(0, Math.min(1, (pct - i * 20) / 20));
    ctx.strokeRect(x + 6.5, y + 17.5, bw - 12, 6);
    if (fill > 0) {
      ctx.fillStyle = fill >= 1 ? PALETTE.screenHi : PALETTE.screenInk;
      ctx.fillRect(x + 7, y + 18, (bw - 13) * fill, 5);
    }
  }

  // footer hex
  ctx.fillStyle = PALETTE.screenDim;
  ctx.fillText('0x15D2A9 : 0x0A1E33', 14, h - 12);
  ctx.textAlign = 'right';
  ctx.fillText('MDR', w - 14, h - 12);

  // scanlines and vignette
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  if (!s.vignette) {
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.42, w / 2, h / 2, w * 0.70);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    s.vignette = g;
  }
  ctx.fillStyle = s.vignette;
  ctx.fillRect(0, 0, w, h);
}
