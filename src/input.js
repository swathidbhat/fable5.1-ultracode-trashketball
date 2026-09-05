// Pointer and keyboard aiming for Trashketball (contract section 4).
// Slingshot mapping: pull DOWN to charge, move sideways to yaw. Direct mapping: drag left, arc goes left.
// This module never touches the DOM at import time; listeners are attached in the constructors only.

const DEG = Math.PI / 180;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/**
 * Pure drag -> aim mapping (no DOM). `out` is optional; when given it is filled and returned
 * so the caller can reuse one object per frame.
 *   S = min(vw, vh); dragFull = (touch ? 0.45 : 0.35) * S
 *   dy = cur.y - start.y (downward positive); power = clamp((dy - deadzonePx) / (dragFull - deadzonePx), 0, 1)
 *   yaw = clamp(dx / dragFull, -1, 1) * yawRange (radians, + = right); negated when invertYaw
 *   cancelled = dy < deadzonePx
 */
export function computeAim(start, cur, opts = {}, out = null) {
  const pointerType = opts.pointerType || 'mouse';
  const yawRangeDeg = opts.yawRangeDeg ?? 22;
  const invertYaw = !!opts.invertYaw;
  const deadzonePx = opts.deadzonePx ?? 12;
  let vw = opts.vw, vh = opts.vh;
  if (!(vw > 0)) vw = (typeof window !== 'undefined' && window.innerWidth) || 800;
  if (!(vh > 0)) vh = (typeof window !== 'undefined' && window.innerHeight) || 600;

  const S = Math.min(vw, vh);
  const dragFull = Math.max(1, (pointerType === 'touch' ? 0.45 : 0.35) * S);
  const dz = Math.min(deadzonePx, dragFull * 0.5);

  const dx = cur.x - start.x;
  const dy = cur.y - start.y;
  const power = clamp((dy - dz) / (dragFull - dz), 0, 1);
  let yaw = clamp(dx / dragFull, -1, 1) * yawRangeDeg * DEG;
  if (invertYaw) yaw = -yaw;
  const cancelled = dy < dz;

  const a = out || { power: 0, yaw: 0, cancelled: true, pointerType: 'mouse', dx: 0, dy: 0, start: { x: 0, y: 0 }, cur: { x: 0, y: 0 } };
  if (!a.start) a.start = { x: 0, y: 0 };
  if (!a.cur) a.cur = { x: 0, y: 0 };
  a.power = power; a.yaw = yaw; a.cancelled = cancelled; a.pointerType = pointerType;
  a.dx = dx; a.dy = dy;
  if (a.start !== start) { a.start.x = start.x; a.start.y = start.y; }
  if (a.cur !== cur) { a.cur.x = cur.x; a.cur.y = cur.y; }
  return a;
}

// Monotonic "sweet spot" curve: sensitivity 1 - k at the middle (the bin), 1 + k at the ends.
export function powerCurve(p, k = 0.45) {
  p = clamp(p, 0, 1);
  return p + k * Math.sin(2 * Math.PI * p) / (2 * Math.PI);
}

export function speedFromPower(p, vMin, vMax) {
  return vMin + (vMax - vMin) * powerCurve(p);
}

function readPoint(o, e, left, top) {
  o.x = e.clientX - left;
  o.y = e.clientY - top;
}

/**
 * Pointer drag with capture, unified mouse / touch / pen.
 * Callbacks: onStart(pt), onMove(aim), onRelease(aim), onCancel(). The aim object is reused; do not retain it.
 */
export class DragInput {
  constructor(canvas, cb = {}) {
    this.canvas = canvas;
    this.cb = cb;
    this.enabled = true;
    this.aiming = false;
    this.activeId = null;
    this.opts = { yawRangeDeg: 22, invertYaw: false, deadzonePx: 12 };
    this.aim = {
      power: 0, yaw: 0, cancelled: true, pointerType: 'mouse', dx: 0, dy: 0,
      start: { x: 0, y: 0 }, cur: { x: 0, y: 0 },
    };
    // Reused option bag for computeAim (no per-move allocation).
    this._aimOpts = { pointerType: 'mouse', vw: 1, vh: 1, yawRangeDeg: 22, invertYaw: false, deadzonePx: 12 };
    this._left = 0; this._top = 0; this._vw = 1; this._vh = 1;

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onCancelEvent = this._onCancelEvent.bind(this);
    this._onLostCapture = this._onLostCapture.bind(this);
    this._onContextMenu = (e) => e.preventDefault();
    this._onGesture = (e) => e.preventDefault();
    this._onBlur = () => this.cancel();
    this._onVisibility = () => { if (typeof document !== 'undefined' && document.hidden) this.cancel(); };

    canvas.addEventListener('pointerdown', this._onDown, { passive: false });
    canvas.addEventListener('pointermove', this._onMove);
    canvas.addEventListener('pointerup', this._onUp);
    canvas.addEventListener('pointercancel', this._onCancelEvent);
    canvas.addEventListener('lostpointercapture', this._onLostCapture);
    canvas.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('gesturestart', this._onGesture, { passive: false });
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  setOptions(o = {}) {
    if (o.yawRangeDeg !== undefined) this.opts.yawRangeDeg = o.yawRangeDeg;
    if (o.invertYaw !== undefined) this.opts.invertYaw = !!o.invertYaw;
    if (o.deadzonePx !== undefined) this.opts.deadzonePx = o.deadzonePx;
    if (this.aiming) this._recompute();
  }

  _readRect() {
    const r = this.canvas.getBoundingClientRect();
    this._left = r.left; this._top = r.top;
    this._vw = r.width > 0 ? r.width : window.innerWidth;
    this._vh = r.height > 0 ? r.height : window.innerHeight;
  }

  _recompute() {
    const o = this._aimOpts;
    o.pointerType = this.aim.pointerType;
    o.vw = this._vw; o.vh = this._vh;
    o.yawRangeDeg = this.opts.yawRangeDeg;
    o.invertYaw = this.opts.invertYaw;
    o.deadzonePx = this.opts.deadzonePx;
    return computeAim(this.aim.start, this.aim.cur, o, this.aim);
  }

  _onDown(e) {
    if (!this.enabled) return;
    if (this.activeId !== null) return;              // a pointer is already captured: ignore extra fingers
    if (e.button !== 0) return;                       // primary button only
    if (e.isPrimary === false) return;
    e.preventDefault();                               // no text selection, focus change or compat mouse events
    this.activeId = e.pointerId;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone; the drag still works while over the canvas */ }
    this.aiming = true;
    this._readRect();
    this.aim.pointerType = e.pointerType || 'mouse';
    readPoint(this.aim.start, e, this._left, this._top);
    this.aim.cur.x = this.aim.start.x; this.aim.cur.y = this.aim.start.y;
    this._recompute();
    this.cb.onStart?.(this.aim.start);
  }

  _onMove(e) {
    if (e.pointerId !== this.activeId) return;
    let last = e;
    if (typeof e.getCoalescedEvents === 'function') {
      const evs = e.getCoalescedEvents();
      if (evs && evs.length) last = evs[evs.length - 1];
    }
    this._readRect();
    readPoint(this.aim.cur, last, this._left, this._top);
    this._recompute();
    this.cb.onMove?.(this.aim);                       // at most once per pointermove
  }

  _onUp(e) {
    if (e.pointerId !== this.activeId) return;
    this._readRect();
    readPoint(this.aim.cur, e, this._left, this._top);
    const id = this.activeId;
    this.activeId = null;                             // before releasing capture so lostpointercapture is ignored
    this.aiming = false;
    try { this.canvas.releasePointerCapture(id); } catch (_) { /* already released */ }
    this._recompute();
    this.cb.onRelease?.(this.aim);
  }

  _onCancelEvent(e) {
    if (e && e.pointerId !== undefined && e.pointerId !== this.activeId) return;
    this.cancel();
  }

  _onLostCapture(e) {
    if (e.pointerId === this.activeId) this.cancel();  // after our own release activeId is already null
  }

  cancel() {
    if (this.activeId === null) return;
    const id = this.activeId;
    this.activeId = null;
    this.aiming = false;
    try { this.canvas.releasePointerCapture(id); } catch (_) { /* not captured */ }
    this.aim.cancelled = true;
    this.aim.power = 0;
    this.cb.onCancel?.();
  }

  dispose() {
    this.cancel();
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._onDown);
    c.removeEventListener('pointermove', this._onMove);
    c.removeEventListener('pointerup', this._onUp);
    c.removeEventListener('pointercancel', this._onCancelEvent);
    c.removeEventListener('lostpointercapture', this._onLostCapture);
    c.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('gesturestart', this._onGesture);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.enabled = false;
  }
}

function isUiTarget(t) {
  if (!t || !t.tagName) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || t.isContentEditable === true;
}

/**
 * Keyboard aiming. Left/Right: yaw +-0.5 deg per press, held repeats at 15 deg/s after 250 ms and 30 deg/s after 1 s.
 * Up/Down: elevation +-1 deg (25..55), exposed as aim.elevationDeg for integrators that want it.
 * Space or Enter held: power ping-pongs 0 -> 1 -> 0 over 900 ms each way; release fires onRelease with the current aim.
 * Callbacks: onChange(aim), onRelease(aim), onCancel() (optional). The aim object is reused; do not retain it.
 */
export class KeyboardAim {
  constructor(cb = {}, { yawRangeDeg = 22, chargeMs = 900, yawStepDeg = 0.5 } = {}) {
    this.cb = cb;
    this.enabled = true;
    this.yawRangeDeg = yawRangeDeg;
    this.chargeMs = chargeMs;
    this.yawStepDeg = yawStepDeg;
    this.charging = false;
    this.aim = {
      power: 0, yaw: 0, cancelled: false, pointerType: 'keyboard', dx: 0, dy: 0,
      start: { x: 0, y: 0 }, cur: { x: 0, y: 0 }, elevationDeg: 45,
    };
    this._yawDeg = 0;
    this._chargeT = 0;
    this._chargeDir = 1;
    this._heldYaw = 0;
    this._heldAt = 0;
    this._raf = 0;
    this._last = 0;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = () => this.cancel();
    this._tick = this._tick.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  get aiming() { return this.charging; }

  setOptions(o = {}) {
    if (o.yawRangeDeg !== undefined) { this.yawRangeDeg = o.yawRangeDeg; this._setYawDeg(this._yawDeg); }
    if (o.chargeMs !== undefined) this.chargeMs = o.chargeMs;
  }

  setYaw(rad) { this._setYawDeg(rad / DEG); this._emitChange(); }

  _setYawDeg(deg) {
    this._yawDeg = clamp(deg, -this.yawRangeDeg, this.yawRangeDeg);
    this.aim.yaw = this._yawDeg * DEG;
  }

  _emitChange() { this.cb.onChange?.(this.aim); }

  _ensureLoop() {
    if (this._raf) return;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  _stopLoop() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
  }

  _tick(now) {
    this._raf = 0;
    const dt = Math.min(0.1, Math.max(0, (now - this._last) / 1000));
    this._last = now;
    if (!this.enabled) { this.cancel(); return; }
    let changed = false;
    if (this.charging) {
      const each = Math.max(1, this.chargeMs) / 1000;
      let t = this._chargeT + this._chargeDir * dt / each;
      if (t >= 1) { t = 2 - t; this._chargeDir = -1; }
      else if (t <= 0) { t = -t; this._chargeDir = 1; }
      this._chargeT = clamp(t, 0, 1);
      this.aim.power = this._chargeT;
      changed = true;
    }
    if (this._heldYaw) {
      const heldFor = now - this._heldAt;
      if (heldFor >= 250) {
        const rate = heldFor >= 1000 ? 30 : 15;      // deg/s
        this._setYawDeg(this._yawDeg + this._heldYaw * rate * dt);
        changed = true;
      }
    }
    if (changed) this._emitChange();
    if (this.charging || this._heldYaw) this._raf = requestAnimationFrame(this._tick);
  }

  _onKeyDown(e) {
    if (!this.enabled) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (isUiTarget(e.target)) return;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      if (e.repeat) return;
      const dir = k === 'ArrowLeft' ? -1 : 1;
      this._setYawDeg(this._yawDeg + dir * this.yawStepDeg);
      this._heldYaw = dir;
      this._heldAt = performance.now();
      this._ensureLoop();
      this._emitChange();
    } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      const d = k === 'ArrowUp' ? 1 : -1;
      this.aim.elevationDeg = clamp(this.aim.elevationDeg + d, 25, 55);
      this._emitChange();
    } else if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
      e.preventDefault();
      if (e.repeat || this.charging) return;
      this.charging = true;
      this._chargeT = 0;
      this._chargeDir = 1;
      this.aim.power = 0;
      this.aim.cancelled = false;
      this._ensureLoop();
      this._emitChange();
    }
  }

  _onKeyUp(e) {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      const dir = k === 'ArrowLeft' ? -1 : 1;
      if (this._heldYaw === dir) this._heldYaw = 0;
      if (!this.charging && !this._heldYaw) this._stopLoop();
    } else if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
      if (!this.charging) return;
      this.charging = false;
      if (!this._heldYaw) this._stopLoop();
      this.aim.cancelled = false;
      this.cb.onRelease?.(this.aim);
      this.aim.power = 0;
    }
  }

  cancel() {
    const was = this.charging || this._heldYaw !== 0;
    this.charging = false;
    this._heldYaw = 0;
    this._stopLoop();
    this.aim.power = 0;
    if (was) {
      this.cb.onCancel?.();
      this._emitChange();
    }
  }

  dispose() {
    this.cancel();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.enabled = false;
  }
}
