// Trashketball audio: WebAudio synthesis only, no files (contract section 8, UX spec section 3.7).
// Graph: voice -> bus (sfx | ambience) -> master -> compressor -> destination.
// The AudioContext is created lazily in unlock() from a trusted gesture. Nothing here touches
// document/window at import time, and nothing throws when WebAudio is unavailable.

const STORAGE_KEY = 'trashketball.muted';
const MASTER_GAIN = 0.8;
const SFX_GAIN = 1.0;
const AMBIENCE_GAIN = 0.5;
const CLINK_MIN_GAP = 0.04;   // seconds between identical clinks
const PITCH_JITTER = 0.03;    // +-3 percent on physical sounds
const MIN_GAIN = 0.0001;

const NOTE = { A5: 880, E6: 1318.5, A6: 1760, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5 };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.sfx = null;
    this.amb = null;
    this._buffers = null;
    this._variant = 'steel';
    this._reduced = false;
    this._muted = false;
    this._lastClinkAt = -1;
    this._ambience = null;
    this._pendingAmbience = null;
    this._unavailable = false;
    this._resumePending = false;   // a resume() we requested has not settled yet
    this._resumeTimer = 0;
    this._suspendedByApp = false;  // suspend() was called; unlock() must not undo it (resume() does)
    try { this._muted = localStorage.getItem(STORAGE_KEY) === '1'; } catch (err) { this._muted = false; }
  }

  // ---------------------------------------------------------------- lifecycle

  // Create (once) and resume the context. Safe to call from any gesture, any number of times.
  unlock() {
    const AC = (typeof globalThis !== 'undefined') && (globalThis.AudioContext || globalThis.webkitAudioContext);
    if (!AC) { this._unavailable = true; return false; }
    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        let ctx = null;
        try { ctx = new AC({ latencyHint: 'interactive' }); } catch (err) { ctx = new AC(); }   // old webkit: no options
        this.ctx = ctx;
        this._suspendedByApp = false;
        this._buildGraph();
      }
      const ctx = this.ctx;
      this._unavailable = false;
      // A paused game keeps its context suspended until main.js calls resume(); a mute toggle must not wake it.
      if (ctx.state !== 'running' && !this._suspendedByApp) {
        this._requestResume();
        // iOS needs one real (silent) buffer started from the gesture to open the output path.
        const b = ctx.createBuffer(1, 1, 22050);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.start(0);
      }
      if (this._pendingAmbience) { const k = this._pendingAmbience; this._pendingAmbience = null; this.startAmbience(k); }
      return true;
    } catch (err) {
      console.warn('[audio] unlock failed', err);
      this._unavailable = true;
      return false;
    }
  }

  // ctx.resume() settles asynchronously (Safari in particular). While our own request is pending, sounds
  // are still scheduled: they start the moment the context runs instead of being dropped.
  _requestResume() {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    let p = null;
    try { p = ctx.resume(); } catch (err) { return; }
    this._resumePending = true;
    if (this._resumeTimer) clearTimeout(this._resumeTimer);
    this._resumeTimer = setTimeout(() => { this._resumeTimer = 0; this._resumePending = false; }, 600);
    if (p && typeof p.then === 'function') {
      const done = () => this._clearResumePending();
      p.then(done, done);
    }
  }

  _clearResumePending() {
    this._resumePending = false;
    if (this._resumeTimer) { clearTimeout(this._resumeTimer); this._resumeTimer = 0; }
  }

  _canPlay() {
    return !!this.ctx && !!this._buffers && (this.ctx.state === 'running' || this._resumePending);
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }
  get available() { return !this._unavailable; }
  get muted() { return this._muted; }
  get variant() { return this._variant; }

  _buildGraph() {
    const ctx = this.ctx;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.12;
    this.compressor.knee.value = 12;
    this.compressor.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : MASTER_GAIN;
    this.master.connect(this.compressor);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = SFX_GAIN;
    this.sfx.connect(this.master);

    this.amb = ctx.createGain();
    this.amb.gain.value = AMBIENCE_GAIN;
    this.amb.connect(this.master);

    // Two seconds of white and brown noise, built once.
    const n = Math.floor(ctx.sampleRate * 2);
    const white = ctx.createBuffer(1, n, ctx.sampleRate);
    const brown = ctx.createBuffer(1, n, ctx.sampleRate);
    const wd = white.getChannelData(0);
    const bd = brown.getChannelData(0);
    let b = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      wd[i] = w;
      b += 0.02 * (w - b);
      bd[i] = b * 3.5;
    }
    this._buffers = { white, brown };
  }

  setVariant(v) { this._variant = v === 'matte' ? 'matte' : 'steel'; }

  // Extra: the beach ambience LFO switches off under reduced motion (UX spec 3.7).
  setReducedMotion(on) {
    this._reduced = !!on;
    const a = this._ambience;
    if (a && a.lfoGain && this.ctx) {
      const t = this.ctx.currentTime;
      a.lfoGain.gain.cancelScheduledValues(t);
      a.lfoGain.gain.setValueAtTime(a.lfoGain.gain.value, t);
      a.lfoGain.gain.linearRampToValueAtTime(this._reduced ? 0 : 300, t + 0.5);
    }
  }

  setMuted(on) {
    this._muted = !!on;
    try { localStorage.setItem(STORAGE_KEY, this._muted ? '1' : '0'); } catch (err) { /* private mode etc. */ }
    if (!this.ctx || !this.master) return;
    try {
      const t = this.ctx.currentTime;
      const g = this.master.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(this._muted ? 0 : MASTER_GAIN, t + 0.03);
    } catch (err) { /* ignore */ }
  }

  suspend() {
    const c = this.ctx;
    if (!c || c.state === 'closed') return;
    this._clearResumePending();
    this._suspendedByApp = true;
    if (c.state !== 'running') return;
    try { const p = c.suspend(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* ignore */ }
  }

  resume() {
    this._suspendedByApp = false;
    const c = this.ctx;
    if (!c || c.state === 'running' || c.state === 'closed') return;
    this._requestResume();
  }

  dispose() {
    this._pendingAmbience = null;
    this._clearResumePending();
    this.stopAmbience(0);
    const c = this.ctx;
    this.ctx = null;
    this.master = this.compressor = this.sfx = this.amb = null;
    this._buffers = null;
    if (c && c.state !== 'closed') { try { const p = c.close(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* ignore */ } }
  }

  // ---------------------------------------------------------------- play

  play(name, opts = {}) {
    if (!this._canPlay()) return false;
    const o = opts || {};
    try {
      switch (name) {
        case 'whoosh': this._whoosh(o); break;
        case 'crinkle': this._crinkle(o); break;
        case 'clink': return this._clink(o);
        case 'thud': this._thud(o); break;
        case 'floor': this._floor(o); break;
        case 'surface': this._surface(o); break;
        case 'sting': this._sting(o); break;
        case 'levelUp': this._levelUp(o); break;
        case 'win': this._win(o); break;
        case 'tick': this._tick(o); break;
        case 'rimGlass': this._rimGlass(o); break;
        default: return false;
      }
      return true;
    } catch (err) {
      console.warn('[audio] play(' + name + ') failed', err);
      return false;
    }
  }

  // ---------------------------------------------------------------- building blocks

  _pitch() { return 1 + (Math.random() * 2 - 1) * PITCH_JITTER; }

  _now() { return this.ctx.currentTime; }

  // A per-sound gain that feeds the given bus. Starts silent; envelopes drive it.
  _voice(bus) {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(bus || this.sfx);
    return g;
  }

  // attack (linear) to peak, then exponential decay to silence. Returns the end time.
  _env(param, t, attack, decay, peak) {
    const p = Math.max(MIN_GAIN, peak);
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(p, t + attack);
    param.exponentialRampToValueAtTime(MIN_GAIN, t + attack + decay);
    return t + attack + decay;
  }

  // Noise burst from the prebuilt buffers; stops itself after `dur` seconds.
  _noise(kind, t, dur) {
    const src = this.ctx.createBufferSource();
    src.buffer = kind === 'brown' ? this._buffers.brown : this._buffers.white;
    const maxOff = Math.max(0, src.buffer.duration - dur - 0.1);
    src.start(t, Math.random() * maxOff, dur + 0.05);
    return src;
  }

  _osc(type, freq, t, stopAt, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    o.start(t);
    o.stop(stopAt);
    return o;
  }

  _filter(type, freq, Q) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (Q != null) f.Q.value = Q;
    return f;
  }

  // Disconnect a voice when its longest source ends so the graph does not accumulate nodes.
  _cleanup(source, ...nodes) {
    source.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch (err) { /* ignore */ } } };
  }

  _connect(...chain) {
    for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
  }

  // ---------------------------------------------------------------- one-shot recipes

  _whoosh({ power = 0.5 } = {}) {
    const t = this._now(), k = this._pitch();
    const g = this._voice();
    const bp = this._filter('bandpass', 400 * k, 1.2);
    bp.frequency.setValueAtTime(400 * k, t);
    bp.frequency.exponentialRampToValueAtTime(1800 * k, t + 0.18);
    const src = this._noise('white', t, 0.3);
    this._connect(src, bp, g);
    this._env(g.gain, t, 0.02, 0.22, 0.12 + 0.25 * clamp01(power));
    this._cleanup(src, g, bp);
  }

  _crinkle({ spawn = false } = {}) {
    const t = this._now(), k = this._pitch();
    const bursts = spawn ? 5 : 8;
    const scale = spawn ? 0.6 : 1;
    const g = this._voice();
    const hp = this._filter('highpass', 2500 * k, 0.7);
    const lp = this._filter('lowpass', 8000 * k, 0.7);
    const src = this._noise('white', t, 0.2);
    this._connect(src, hp, lp, g);
    const offs = [];
    for (let i = 0; i < bursts; i++) offs.push(Math.random() * 0.14);
    offs.sort((a, b) => a - b);
    for (let i = 1; i < bursts; i++) if (offs[i] < offs[i - 1] + 0.004) offs[i] = offs[i - 1] + 0.004;   // keep bursts apart
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < bursts; i++) {
      const st = t + offs[i];
      const dur = 0.008 + Math.random() * 0.012;
      const next = i + 1 < bursts ? t + offs[i + 1] : Infinity;
      const end = Math.max(st + 0.001, Math.min(st + dur, next - 0.001));
      g.gain.setValueAtTime((0.1 + Math.random() * 0.15) * scale, st);
      g.gain.linearRampToValueAtTime(0, end);
    }
    this._cleanup(src, g, hp, lp);
  }

  _clink({ speed = 3 } = {}) {
    const t = this._now();
    if (t - this._lastClinkAt < CLINK_MIN_GAP) return false;
    this._lastClinkAt = t;
    const amt = Math.max(0.15, Math.min(1, speed / 6));
    const k = this._pitch();
    if (this._variant === 'steel') {
      // Steel bin: bright two-partial ring plus a short click.
      const g = this._voice();
      const bp = this._filter('bandpass', 2600 * k, 4);
      const o1 = this._osc('triangle', 2100 * k, t, t + 0.2, (Math.random() * 2 - 1) * 8);
      const o2 = this._osc('triangle', 3150 * k, t, t + 0.2, (Math.random() * 2 - 1) * 8);
      o1.connect(bp); o2.connect(bp); bp.connect(g);
      this._env(g.gain, t, 0.002, 0.12, 0.25 * amt);
      this._cleanup(o1, g, bp);
      const cg = this._voice();
      const click = this._noise('white', t, 0.006);
      click.connect(cg);
      this._env(cg.gain, t, 0.001, 0.005, 0.15 * amt);
      this._cleanup(click, cg);
    } else {
      // Matte bin (woven or coated): a dull tok.
      const g = this._voice();
      const lp = this._filter('lowpass', 2200 * k, 0.9);
      const o1 = this._osc('triangle', 700 * k, t, t + 0.15);
      const o2 = this._osc('triangle', 1050 * k, t, t + 0.15);
      o1.connect(lp); o2.connect(lp); lp.connect(g);
      this._env(g.gain, t, 0.002, 0.08, 0.22 * amt);
      this._cleanup(o1, g, lp);
      const ng = this._voice();
      const nlp = this._filter('lowpass', 3000 * k, 0.8);
      const burst = this._noise('white', t, 0.012);
      this._connect(burst, nlp, ng);
      this._env(ng.gain, t, 0.002, 0.012, 0.2 * amt);
      this._cleanup(burst, ng, nlp);
    }
    return true;
  }

  _thud({ speed = 3 } = {}) {
    const t = this._now(), k = this._pitch();
    const amt = 0.5 + 0.5 * Math.min(1, Math.max(0, speed) / 4);
    const steel = this._variant === 'steel';
    // Body: a pitched sine dropping in frequency.
    const g = this._voice();
    const o = this._osc('sine', (steel ? 180 : 140) * k, t, t + 0.3);
    o.frequency.exponentialRampToValueAtTime((steel ? 90 : 80) * k, t + (steel ? 0.08 : 0.07));
    o.connect(g);
    this._env(g.gain, t, 0.005, steel ? 0.15 : 0.12, (steel ? 0.4 : 0.35) * amt);
    this._cleanup(o, g);
    // Brown noise impact.
    const ng = this._voice();
    const lp = this._filter('lowpass', (steel ? 600 : 500) * k, 0.8);
    const nz = this._noise('brown', t, steel ? 0.04 : 0.05);
    this._connect(nz, lp, ng);
    this._env(ng.gain, t, 0.002, steel ? 0.04 : 0.05, (steel ? 0.25 : 0.3) * amt);
    this._cleanup(nz, ng, lp);
    if (steel) {
      // Tin ring.
      const rg = this._voice();
      const ring = this._osc('triangle', 900 * k, t, t + 0.3);
      ring.connect(rg);
      this._env(rg.gain, t, 0.002, 0.2, 0.08 * amt);
      this._cleanup(ring, rg);
    }
  }

  _floor({ speed = 3, surface = 'carpet' } = {}) {
    const t = this._now(), k = this._pitch();
    const amt = Math.min(1, Math.max(0, speed) / 5);
    if (amt < 0.05) return;
    const g = this._voice();
    const lp = this._filter('lowpass', 900 * k, 0.8);
    const nz = this._noise('brown', t, 0.03);
    this._connect(nz, lp, g);
    this._env(g.gain, t, 0.002, 0.06, 0.2 * amt);
    this._cleanup(nz, g, lp);
    if (surface === 'wood') {
      const wg = this._voice();
      const o = this._osc('sine', 220 * k, t, t + 0.12);
      o.connect(wg);
      this._env(wg.gain, t, 0.002, 0.06, 0.08 * amt);
      this._cleanup(o, wg);
    }
  }

  _surface({ speed = 3, tag = 'wall' } = {}) {
    const t = this._now(), k = this._pitch();
    const amt = Math.max(0.25, Math.min(1, Math.max(0, speed) / 5));
    const tg = String(tag || 'wall').toLowerCase();
    if (tg === 'window' || tg === 'glass') { this._glassTink(t, k, amt, 0.1); return; }
    let type = 'bandpass', freq = 1200, Q = 1, peak = 0.18, decay = 0.09, dur = 0.02;
    switch (tg) {
      case 'desk': case 'table': case 'island': case 'door': freq = 1200; break;
      case 'wall': case 'partition': case 'ceiling': freq = 900; break;
      case 'monitor': case 'mullion': freq = 1600; peak = 0.16; break;
      case 'sofa': case 'velvet': case 'chair': type = 'lowpass'; freq = 500; Q = 0.7; peak = 0.12; decay = 0.07; break;
      case 'plant': type = 'highpass'; freq = 1800; Q = 0.7; peak = 0.12; decay = 0.05; dur = 0.04; break;
      default: freq = 1000;
    }
    const g = this._voice();
    const f = this._filter(type, freq * k, Q);
    const nz = this._noise('white', t, dur);
    this._connect(nz, f, g);
    this._env(g.gain, t, 0.002, decay, peak * amt);
    this._cleanup(nz, g, f);
  }

  // Glass: a thin sine tink with a very short noise transient.
  _glassTink(t, k, amt, peak) {
    const g = this._voice();
    const o = this._osc('sine', 2800 * k, t, t + 0.12);
    o.connect(g);
    this._env(g.gain, t, 0.002, 0.06, peak * amt);
    this._cleanup(o, g);
    const ng = this._voice();
    const hp = this._filter('highpass', 2000, 0.7);
    const nz = this._noise('white', t, 0.008);
    this._connect(nz, hp, ng);
    this._env(ng.gain, t, 0.001, 0.008, 0.12 * amt);
    this._cleanup(nz, ng, hp);
  }

  _rimGlass({ speed = 3 } = {}) {
    const t = this._now(), k = this._pitch();
    const amt = Math.max(0.2, Math.min(1, Math.max(0, speed) / 5));
    const g = this._voice();
    const o1 = this._osc('sine', 3200 * k, t, t + 0.2);
    const o2 = this._osc('sine', 4800 * k, t, t + 0.2);
    const g2 = this.ctx.createGain(); g2.gain.value = 0.5;
    o1.connect(g); o2.connect(g2); g2.connect(g);
    this._env(g.gain, t, 0.002, 0.12, 0.12 * amt);
    this._cleanup(o1, g, g2);
    const ng = this._voice();
    const hp = this._filter('highpass', 3000, 0.7);
    const nz = this._noise('white', t, 0.006);
    this._connect(nz, hp, ng);
    this._env(ng.gain, t, 0.001, 0.006, 0.1 * amt);
    this._cleanup(nz, ng, hp);
  }

  _sting({ variant = 'swish' } = {}) {
    const t = this._now();
    const rattle = variant === 'rattle';
    if (this._variant === 'steel') {
      // Terminal chime: two or three triangle notes through a 4 kHz lowpass.
      const notes = rattle ? [NOTE.A5, NOTE.E6] : [NOTE.A5, NOTE.E6, NOTE.A6];
      const lp = this._filter('lowpass', 4000, 0.7);
      lp.connect(this.sfx);
      let last = null;
      notes.forEach((f, i) => {
        const st = t + i * 0.07;
        const g = this.ctx.createGain(); g.gain.value = 0; g.connect(lp);
        const o = this._osc('triangle', f, st, st + 0.2);
        o.connect(g);
        this._env(g.gain, st, 0.005, 0.09, 0.12);
        last = o;
        o.onended = () => { try { g.disconnect(); } catch (err) { /* ignore */ } };
      });
      if (last) { const prev = last.onended; last.onended = () => { prev(); try { lp.disconnect(); } catch (err) { /* ignore */ } }; }
    } else {
      // Soft marimba: triangle + sine mix through a 3 kHz lowpass.
      const notes = rattle ? [NOTE.C5, NOTE.G5] : [NOTE.C5, NOTE.E5, NOTE.G5];
      const lp = this._filter('lowpass', 3000, 0.7);
      lp.connect(this.sfx);
      let last = null;
      notes.forEach((f, i) => {
        const st = t + i * 0.09;
        const g = this.ctx.createGain(); g.gain.value = 0; g.connect(lp);
        const tri = this._osc('triangle', f, st, st + 0.35);
        const sin = this._osc('sine', f, st, st + 0.35);
        const tg = this.ctx.createGain(); tg.gain.value = 0.6;
        const sg = this.ctx.createGain(); sg.gain.value = 0.4;
        tri.connect(tg); sin.connect(sg); tg.connect(g); sg.connect(g);
        this._env(g.gain, st, 0.012, 0.25, 0.14);
        last = tri;
        tri.onended = () => { for (const n of [g, tg, sg]) { try { n.disconnect(); } catch (err) { /* ignore */ } } };
      });
      if (last) { const prev = last.onended; last.onended = () => { prev(); try { lp.disconnect(); } catch (err) { /* ignore */ } }; }
    }
  }

  // Sine + triangle arpeggio (523, 659, 784, 1047) into a feedback delay. Returns the nodes to tear down.
  _arpeggio(t, dest) {
    const ctx = this.ctx;
    const notes = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6];
    const dry = ctx.createGain(); dry.gain.value = 1; dry.connect(dest);
    const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.28;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const wet = ctx.createGain(); wet.gain.value = 0.2;
    dry.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(dest);
    const nodes = [dry, delay, fb, wet];
    notes.forEach((f, i) => {
      const st = t + i * 0.12;
      const g = ctx.createGain(); g.gain.value = 0; g.connect(dry);
      const sin = this._osc('sine', f, st, st + 0.7);
      const tri = this._osc('triangle', f, st, st + 0.7);
      const sg = ctx.createGain(); sg.gain.value = 0.5;
      const tg = ctx.createGain(); tg.gain.value = 0.5;
      sin.connect(sg); tri.connect(tg); sg.connect(g); tg.connect(g);
      this._env(g.gain, st, 0.01, 0.6, 0.16);
      nodes.push(g, sg, tg);
    });
    return nodes;
  }

  _levelUp() {
    const t = this._now();
    const nodes = this._arpeggio(t, this.sfx);
    // Let the delay tail ring out before tearing the loop down.
    setTimeout(() => { for (const n of nodes) { try { n.disconnect(); } catch (err) { /* ignore */ } } }, 2600);
  }

  _win() {
    const t = this._now();
    const nodes = this._arpeggio(t, this.sfx);
    // Held major triad: swell over 400 ms, hold, release over 1200 ms.
    const start = t + 0.6;
    const g = this._voice();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(1, start + 0.4);
    g.gain.setValueAtTime(1, start + 0.6);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, start + 1.8);
    const oscs = [NOTE.C5, NOTE.E5, NOTE.G5].map((f) => {
      const o = this._osc('sine', f, start, start + 1.85);
      const og = this.ctx.createGain(); og.gain.value = 0.08;
      o.connect(og); og.connect(g);
      nodes.push(og);
      return o;
    });
    nodes.push(g);
    oscs[0].onended = () => { for (const n of nodes) { try { n.disconnect(); } catch (err) { /* ignore */ } } };
  }

  _tick() {
    const t = this._now();
    const g = this._voice();
    const hp = this._filter('highpass', 3000, 0.7);
    const nz = this._noise('white', t, 0.008);
    this._connect(nz, hp, g);
    this._env(g.gain, t, 0.001, 0.008, 0.1);
    this._cleanup(nz, g, hp);
  }

  // ---------------------------------------------------------------- ambience loops

  startAmbience(kind) {
    const k = kind === 'beach' ? 'beach' : 'lumon';
    if (!this.ctx || !this._buffers) { this._pendingAmbience = k; return; }
    if (this._ambience && this._ambience.kind === k) return;
    if (this._ambience) this.stopAmbience(300);
    try {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const g = ctx.createGain();          // fade in/out envelope
      g.gain.value = 0;
      g.connect(this.amb);
      const nodes = [g];
      const sources = [];
      const a = { kind: k, g, nodes, sources, lfoGain: null, inner: null, timer: 0 };

      const loop = ctx.createBufferSource();
      loop.buffer = this._buffers.brown;
      loop.loop = true;
      sources.push(loop);

      if (k === 'lumon') {
        // Brown noise under a 200 Hz lowpass plus a faint 60 Hz hum: fluorescent office air.
        const lp = this._filter('lowpass', 200, 0.7);
        const ng = ctx.createGain(); ng.gain.value = 0.03;
        this._connect(loop, lp, ng, g);
        const hum = this._osc('sine', 60, t, t + 1e6);
        const hg = ctx.createGain(); hg.gain.value = 0.01;
        this._connect(hum, hg, g);
        sources.push(hum);
        nodes.push(lp, ng, hg);
        a.inner = ng;
        g.gain.linearRampToValueAtTime(1, t + 0.6);
      } else {
        // Distant surf: brown noise through a slowly breathing lowpass, with periodic washes.
        const lp = this._filter('lowpass', 650, 0.8);
        const ng = ctx.createGain(); ng.gain.value = 0.06;
        this._connect(loop, lp, ng, g);
        const lfo = this._osc('sine', 0.08, t, t + 1e6);
        const lfoGain = ctx.createGain(); lfoGain.gain.value = this._reduced ? 0 : 300;
        lfo.connect(lfoGain); lfoGain.connect(lp.frequency);
        sources.push(lfo);
        nodes.push(lp, ng, lfoGain);
        a.inner = ng;
        a.lfoGain = lfoGain;
        g.gain.linearRampToValueAtTime(1, t + 1.5);
        this._scheduleWash(a);
      }
      loop.start(t);
      this._ambience = a;
    } catch (err) {
      console.warn('[audio] ambience failed', err);
      this._ambience = null;
    }
  }

  _scheduleWash(a) {
    const wait = 9000 + Math.random() * 5000;
    a.timer = setTimeout(() => {
      if (this._ambience !== a || !this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const p = a.inner.gain;
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value, t);
        p.linearRampToValueAtTime(0.10, t + 1.5);
        p.linearRampToValueAtTime(0.06, t + 4.5);
      } catch (err) { /* ignore */ }
      this._scheduleWash(a);
    }, wait);
  }

  stopAmbience(fadeMs = 600) {
    this._pendingAmbience = null;
    const a = this._ambience;
    if (!a) return;
    this._ambience = null;
    if (a.timer) { clearTimeout(a.timer); a.timer = 0; }
    if (!this.ctx) return;
    const sec = Math.max(0, fadeMs) / 1000;
    try {
      const t = this.ctx.currentTime;
      a.g.gain.cancelScheduledValues(t);
      a.g.gain.setValueAtTime(a.g.gain.value, t);
      a.g.gain.linearRampToValueAtTime(0, t + sec);
      for (const s of a.sources) { try { s.stop(t + sec + 0.05); } catch (err) { /* already stopped */ } }
    } catch (err) { /* ignore */ }
    setTimeout(() => { for (const n of a.nodes) { try { n.disconnect(); } catch (err) { /* ignore */ } } }, fadeMs + 120);
  }
}
