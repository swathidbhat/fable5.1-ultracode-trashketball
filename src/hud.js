// Trashketball HUD: a DOM overlay inside #hud (contract section 7, UX spec sections 2, 3.3, 4, 5).
// The class injects its own <style> element and builds every element in the constructor.
// Nothing here touches document/window at import time.

const STYLE_ID = 'hud-style';

const STREAK_COPY = {
  lumon: { 5: 'Five straight.', 10: 'Flawless refinement.' },
  beach: { 5: 'Hot hand.', 10: 'Ten for ten.' },
};

const HINTS = {
  pointer: 'Drag back to aim. Release to throw.',
  touch: 'Drag down to aim. Let go to throw.',
  keyboard: 'Arrows aim. Hold Space to throw.',
};

const SCORE_TWEEN_MS = 300;
const POPUP_MS = 800;
const POPUP_POOL = 6;

const CSS = `
#hud {
  font-family: var(--font-ui);
  color: var(--hud-ink);
  line-height: 1.3;
  -webkit-font-smoothing: antialiased;
  --safe-t: env(safe-area-inset-top, 0px);
  --safe-b: env(safe-area-inset-bottom, 0px);
  --safe-l: env(safe-area-inset-left, 0px);
  --safe-r: env(safe-area-inset-right, 0px);
}
#hud [hidden] { display: none !important; }

#hud.theme-lumon {
  --hud-bg: rgba(8, 30, 40, .66);
  --panel-bg: rgba(6, 27, 36, .90);
  --hud-ink: #E4F0EE;
  --hud-muted: rgba(228, 240, 238, .62);
  --hud-accent: #7FE0CC;
  --hud-accent-2: #5FB4E6;
  --hud-warn: #F2B65A;
  --hud-border: rgba(127, 224, 204, .35);
  --hud-scrim: rgba(4, 18, 26, .32);
  --btn-ink-on-accent: #061B24;
  --font-ui: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-data: "IBM Plex Mono", ui-monospace, Menlo, monospace;
  --font-display: var(--font-ui);
  --radius: 2px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, .25);
}
#hud.theme-beach {
  --hud-bg: rgba(250, 246, 238, .78);
  --panel-bg: rgba(250, 246, 238, .92);
  --hud-ink: #2B2521;
  --hud-muted: rgba(43, 37, 33, .60);
  --hud-accent: #2E7D8C;
  --hud-accent-2: #B98A5A;
  --hud-warn: #C4562F;
  --hud-border: rgba(185, 138, 90, .45);
  --hud-scrim: rgba(250, 246, 238, .22);
  --btn-ink-on-accent: #FAF6EE;
  --font-ui: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-data: "Cormorant Garamond", Georgia, serif;
  --font-display: "Cormorant Garamond", Georgia, serif;
  --radius: 10px;
  text-shadow: none;
}
#hud.hc.theme-lumon { --hud-bg: #061B24; --panel-bg: #061B24; --hud-scrim: rgba(4, 18, 26, .5); text-shadow: none; }
#hud.hc.theme-beach { --hud-bg: #FAF6EE; --panel-bg: #FAF6EE; }

#hud .sr-only {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
#hud button {
  pointer-events: auto; cursor: pointer; font: inherit; color: inherit;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
#hud :focus-visible { outline: 2px solid var(--hud-accent); outline-offset: 2px; }
#hud button:focus:not(:focus-visible) { outline: none; }

/* Token-driven blocks recolor over .4s when the theme class swaps. */
#hud .blk, #hud .panel, #hud button, #hud .popup {
  transition: color .4s, background-color .4s, border-color .4s;
}

/* Corner blocks sit on a translucent pill so they stay readable over bright walls and glass. */
#hud .blk {
  background: var(--hud-bg); border: 1px solid var(--hud-border); border-radius: var(--radius);
  padding: 8px 12px; box-shadow: 0 1px 2px rgba(0, 0, 0, .08);
}

/* ---- level block (top left) ---- */
#hud-level {
  position: absolute; top: calc(20px + var(--safe-t)); left: calc(20px + var(--safe-l));
  display: flex; flex-direction: column; gap: 4px; max-width: 56vw;
}
#hud-level .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: .18em; color: var(--hud-muted); }
#hud-level .name { font-size: 15px; }
#hud-level .lvl { font-size: 12px; color: var(--hud-muted); font-family: var(--font-data); }
#hud.theme-beach #hud-level .eyebrow { color: var(--hud-accent-2); }
#hud.theme-beach #hud-level .name { font-family: var(--font-display); font-size: 21px; font-weight: 600; letter-spacing: -.01em; line-height: 1.1; }
#hud.theme-beach #hud-level .lvl { font-size: 14px; font-style: italic; }

/* ---- score block (top right) ---- */
#hud-score {
  position: absolute; top: calc(20px + var(--safe-t)); right: calc(20px + var(--safe-r));
  text-align: right;
}
#hud-score .label {
  display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .18em;
  color: var(--hud-muted); margin-bottom: 4px;
}
#hud-score .row { display: flex; align-items: center; justify-content: flex-end; }
#hud-score .value {
  font-family: var(--font-data); font-size: 40px; line-height: 1; font-weight: 500;
  font-variant-numeric: tabular-nums lining-nums;
}
#hud.theme-beach #hud-score .value { font-size: 44px; font-weight: 600; }
#streak {
  display: inline-block; margin-left: 8px; font-size: 13px; padding: 2px 8px; line-height: 1.3;
  border: 1px solid var(--hud-accent); border-radius: 999px; color: var(--hud-accent);
  font-family: var(--font-data); white-space: nowrap;
  opacity: 0; transition: opacity .2s, color .4s, border-color .4s;
}
#streak.show { opacity: 1; }
#hud.theme-beach #streak { font-size: 15px; font-style: italic; }
#dots { display: flex; gap: 6px; justify-content: flex-end; margin-top: 8px; transition: filter .2s; }
#dots.flash { filter: brightness(1.4); }
#dots i {
  display: block; width: 10px; height: 10px; box-sizing: border-box;
  border: 1.5px solid var(--hud-accent); border-radius: 50%; background: transparent;
  --dot-rot: 0deg; transform: rotate(var(--dot-rot));
  transition: background-color .15s, border-color .4s;
}
#dots i.on { background: var(--hud-accent); }
#dots i.pop { animation: hud-dotpop .3s cubic-bezier(.2, 1.6, .4, 1); }
#dots i.pop-big { animation: hud-dotpop-big .3s cubic-bezier(.2, 1.6, .4, 1); }
#hud.theme-beach #dots { gap: 8px; margin-top: 10px; }
#hud.theme-beach #dots i { width: 8px; height: 8px; border-radius: 1px; --dot-rot: 45deg; }
@keyframes hud-dotpop {
  0% { transform: rotate(var(--dot-rot)) scale(1); }
  50% { transform: rotate(var(--dot-rot)) scale(1.45); }
  100% { transform: rotate(var(--dot-rot)) scale(1); }
}
@keyframes hud-dotpop-big {
  0% { transform: rotate(var(--dot-rot)) scale(1); }
  50% { transform: rotate(var(--dot-rot)) scale(1.8); }
  100% { transform: rotate(var(--dot-rot)) scale(1); }
}

/* ---- stats (bottom left) ---- */
#hud-stats {
  position: absolute; bottom: calc(16px + var(--safe-b)); left: calc(20px + var(--safe-l));
  font-family: var(--font-data); font-size: 12px; color: var(--hud-muted);
  font-variant-numeric: tabular-nums lining-nums; white-space: nowrap;
}
#hud.theme-beach #hud-stats { font-size: 15px; }
#hud.hc #hud-stats { font-size: 14px; }

/* ---- pills: hint, flavor line, stuck ---- */
#hud-hint, #hud-say, #hud-stuck {
  position: absolute; left: 50%; transform: translateX(-50%);
  padding: 8px 14px; box-sizing: border-box;
  background: var(--hud-bg); border: 1px solid var(--hud-border); border-radius: var(--radius);
  text-align: center;
  opacity: 0; transition: opacity .4s, color .4s, background-color .4s, border-color .4s;
}
#hud-hint {
  bottom: calc(36px + var(--safe-b));
  font-size: 13px; text-transform: uppercase; letter-spacing: .14em; white-space: nowrap;
}
#hud.theme-beach #hud-hint { font-family: var(--font-display); font-size: 15px; font-style: italic; text-transform: none; letter-spacing: 0; }
#hud.hc #hud-hint { font-size: 14px; }
#hud-say {
  bottom: calc(84px + var(--safe-b));
  max-width: min(560px, calc(100vw - 40px));
  font-size: 13px; letter-spacing: .02em; line-height: 1.4;
  transition-duration: .3s;
}
#hud.theme-beach #hud-say { font-family: var(--font-display); font-size: 18px; font-style: italic; letter-spacing: 0; }
#hud-stuck {
  top: calc(76px + var(--safe-t));
  padding: 6px 12px; font-size: 12px; text-transform: uppercase; letter-spacing: .12em;
  color: var(--hud-warn); border-color: var(--hud-warn); white-space: nowrap;
  transition-duration: .2s;
}
#hud.theme-beach #hud-stuck { font-family: var(--font-display); font-size: 15px; font-style: italic; text-transform: none; letter-spacing: 0; }
#hud-hint.show, #hud-say.show, #hud-stuck.show { opacity: 1; }

/* ---- sound button (bottom right) ---- */
#hud-sound {
  position: absolute; bottom: calc(16px + var(--safe-b)); right: calc(20px + var(--safe-r));
  min-height: 44px; min-width: 44px; padding: 0 14px;
  font-family: var(--font-ui); font-size: 11px; text-transform: uppercase; letter-spacing: .12em;
  background: transparent; color: var(--hud-ink);
  border: 1px solid var(--hud-border); border-radius: var(--radius);
}
#hud-sound:hover { border-color: var(--hud-accent); }
#hud-sound[aria-pressed="false"] { color: var(--hud-muted); }

/* ---- popups ---- */
#popups { position: absolute; inset: 0; overflow: hidden; }
.popup {
  position: absolute; transform: translate(-50%, -50%); text-align: center;
  opacity: 0; will-change: transform, opacity; white-space: nowrap;
}
.popup .big { display: block; font-family: var(--font-data); font-size: 28px; font-weight: 500; line-height: 1; color: var(--hud-accent); }
.popup .sub { display: block; margin-top: 2px; font-size: 12px; text-transform: uppercase; letter-spacing: .14em; color: var(--hud-muted); }
.popup.label .big, .popup.warn .big, .popup.muted .big {
  font-family: var(--font-ui); font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: .14em; color: var(--hud-ink);
}
.popup.warn .big { color: var(--hud-warn); }
.popup.muted .big { color: var(--hud-muted); text-transform: none; letter-spacing: .02em; font-size: 13px; }
#hud.theme-beach .popup .big { font-size: 32px; font-weight: 600; }
#hud.theme-beach .popup .sub { font-family: var(--font-display); font-size: 15px; font-style: italic; text-transform: none; letter-spacing: 0; }
#hud.theme-beach .popup.label .big, #hud.theme-beach .popup.warn .big, #hud.theme-beach .popup.muted .big {
  font-family: var(--font-display); font-size: 18px; font-style: italic; text-transform: none; letter-spacing: 0;
}
.popup.run { animation: hud-poprise ${POPUP_MS}ms cubic-bezier(.215, .61, .355, 1) forwards, hud-popfade ${POPUP_MS}ms linear forwards; }
#hud.reduced .popup.run { animation: hud-popfade ${POPUP_MS}ms linear forwards; }
@keyframes hud-poprise {
  from { transform: translate(-50%, -50%) translateY(0); }
  to { transform: translate(-50%, -50%) translateY(-48px); }
}
@keyframes hud-popfade {
  0% { opacity: 0; } 10% { opacity: 1; } 62.5% { opacity: 1; } 100% { opacity: 0; }
}

/* ---- overlay ---- */
#overlay {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  padding: 20px; box-sizing: border-box; background: var(--hud-scrim);
  opacity: 0; transition: opacity .25s, background-color .4s; pointer-events: none;
}
#overlay.show { opacity: 1; }
#overlay .panel {
  pointer-events: auto;
  width: min(440px, calc(100vw - 40px)); max-height: calc(100vh - 40px); overflow: auto;
  padding: 36px 40px; box-sizing: border-box;
  border: 1px solid var(--hud-border); border-radius: var(--radius);
  background: var(--panel-bg);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  transform: translateY(8px);
  transition: transform .25s ease-out, color .4s, background-color .4s, border-color .4s;
}
#overlay.show .panel { transform: none; }
#hud.reduced #overlay .panel { transform: none; }
.panel .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: .18em; color: var(--hud-muted); margin-bottom: 12px; }
.panel .title {
  font-family: var(--font-display); font-size: 34px; font-weight: 700; line-height: 1.1;
  text-transform: uppercase; letter-spacing: .2em; margin: 0 0 16px;
  padding-bottom: 14px; border-bottom: 1px solid var(--hud-border);
}
.panel .body { font-size: 14px; line-height: 1.5; margin: 0 0 12px; }
.panel .stats { font-family: var(--font-data); font-size: 13px; color: var(--hud-muted); margin: 0 0 8px; font-variant-numeric: tabular-nums lining-nums; }
.panel .sub { font-family: "Cormorant Garamond", Georgia, serif; font-style: italic; font-size: 15px; color: var(--hud-muted); margin: 0 0 4px; }
.panel .footnote { font-size: 11px; color: var(--hud-muted); margin: 16px 0 0; line-height: 1.5; }
.panel .buttons { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
.panel button {
  min-height: 44px; padding: 0 22px; font-family: var(--font-ui); font-size: 13px;
  text-transform: uppercase; letter-spacing: .12em;
  background: transparent; color: var(--hud-accent);
  border: 1px solid var(--hud-accent); border-radius: var(--radius);
}
.panel button.primary { background: rgba(127, 224, 204, .12); }
.panel button:hover, .panel button:focus-visible { background: var(--hud-accent); color: var(--btn-ink-on-accent); }
#hud.theme-beach .panel .eyebrow { color: var(--hud-accent-2); }
#hud.theme-beach .panel .title {
  font-size: 36px; font-weight: 500; text-transform: none; letter-spacing: -.01em;
  padding-bottom: 0; border-bottom: 0; margin-bottom: 12px;
}
#hud.theme-beach .panel .body { font-family: var(--font-display); font-size: 18px; line-height: 1.45; }
#hud.theme-beach .panel .stats { font-size: 15px; }
#hud.theme-beach .panel .footnote { font-size: 12px; }
#hud.theme-beach .panel button {
  font-family: var(--font-display); font-size: 17px; font-weight: 600; text-transform: none; letter-spacing: 0;
  background: transparent; color: var(--hud-ink); border: 1px solid var(--hud-border); border-radius: 999px;
}
#hud.theme-beach .panel button.primary { background: #2B2521; color: #FAF6EE; border-color: #2B2521; }
#hud.theme-beach .panel button:hover, #hud.theme-beach .panel button:focus-visible { background: #3A322C; color: #FAF6EE; border-color: #3A322C; }

/* ---- fade layer ---- */
#fade {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  opacity: 0; background: #000; pointer-events: none; transition: opacity .6s ease-in;
}
#fade .fade-text { text-align: center; opacity: 0; transition: opacity .25s; padding: 0 20px; }
#fade .small { display: block; font-size: 13px; text-transform: uppercase; letter-spacing: .18em; opacity: .6; margin-bottom: 10px; }
#fade .big { display: block; font-family: var(--font-display); font-size: 30px; font-weight: 500; line-height: 1.15; }
#hud.theme-lumon #fade .big { font-size: 22px; font-weight: 700; text-transform: uppercase; letter-spacing: .2em; }
#fade .fade-text.show { opacity: 1; }

/* ---- block entrance after a fade lifts ---- */
#hud .blk.enter { animation: hud-enter .3s ease-out both; }
#hud.reduced .blk.enter { animation: hud-enter-fade .3s ease-out both; }
@keyframes hud-enter { from { opacity: 0; transform: translateY(var(--enter-dy, -8px)); } to { opacity: 1; transform: none; } }
@keyframes hud-enter-fade { from { opacity: 0; } to { opacity: 1; } }
#hud.reduced #dots i.pop, #hud.reduced #dots i.pop-big { animation: none; }

/* ---- mobile ---- */
@media (max-width: 600px) {
  #hud .blk { padding: 6px 10px; }
  #hud-level { max-width: 42vw; top: calc(12px + var(--safe-t)); left: calc(12px + var(--safe-l)); }
  #hud-level .eyebrow { font-size: 10px; letter-spacing: .12em; }
  #hud-level .name { display: none; }
  #hud-score { top: calc(12px + var(--safe-t)); right: calc(12px + var(--safe-r)); max-width: 50vw; }
  #hud-score .value { font-size: 32px; }
  #hud.theme-beach #hud-score .value { font-size: 36px; }
  #dots { gap: 4px; margin-top: 6px; }
  #dots i { width: 7px; height: 7px; border-width: 1px; }
  #hud.theme-beach #dots { gap: 5px; }
  #hud.theme-beach #dots i { width: 6px; height: 6px; }
  #hud-stats { left: calc(12px + var(--safe-l)); right: auto; bottom: calc(12px + var(--safe-b)); text-align: left; font-size: 11px; }
  #hud-sound { right: calc(12px + var(--safe-r)); bottom: calc(12px + var(--safe-b)); min-height: 36px; padding: 0 10px; font-size: 10px; }
  #hud-hint { left: 12px; right: 12px; bottom: calc(60px + var(--safe-b)); transform: none; max-width: none; white-space: normal; text-align: center; font-size: 11px; letter-spacing: .1em; }
  #hud.theme-beach #hud-hint { font-size: 14px; }
  #hud-say { left: 12px; right: 12px; bottom: calc(108px + var(--safe-b)); transform: none; max-width: none; white-space: normal; text-align: center; }
  #overlay .panel { padding: 28px 24px; }
  .panel .title { font-size: 26px; }
  #hud.theme-beach .panel .title { font-size: 30px; }
}
`;

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function colorToCss(c) {
  if (typeof c === 'number') return '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
  return String(c || '#000');
}

// Relative luminance of a css hex color (used to pick the fade text ink). Falls back to dark.
function isLightColor(css) {
  const m = /^#?([0-9a-f]{6})$/i.exec(css.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55;
}

export class Hud {
  static HINTS = HINTS;

  constructor(root) {
    this.root = root || document.getElementById('hud');
    if (!this.root) throw new Error('Hud: root element missing');
    this._timers = {};
    this._scoreShown = 0;
    this._scoreRaf = 0;
    this._made = 0;
    this._streak = 0;
    this._theme = 'lumon';
    this._soundOn = true;
    this._soundCb = null;
    this._liveLast = -1e9;
    this._liveTimer = 0;
    this._livePending = null;
    this._liveFlip = false;
    this._overlayButtons = [];
    this._primaryAction = null;
    this._prevFocus = null;
    this._fadeResolve = null;
    this._fadeTimers = [];
    this._reducedExplicit = null;
    this._disposed = false;

    this._injectStyle();
    this._build();

    // Reduced motion follows the OS until setReducedMotion(bool) overrides it.
    this._mq = null;
    this._onMq = () => { if (this._reducedExplicit == null) this._applyReduced(!!(this._mq && this._mq.matches)); };
    try {
      if (typeof matchMedia === 'function') {
        this._mq = matchMedia('(prefers-reduced-motion: reduce)');
        if (this._mq.addEventListener) this._mq.addEventListener('change', this._onMq);
        else if (this._mq.addListener) this._mq.addListener(this._onMq);
      }
    } catch (err) { this._mq = null; }
    this._onMq();

    this.setTheme('lumon');
    this.setInputMode('pointer');
    this.setSound(true);
    this.setStats({ throws: 0, makes: 0 });
    this.setScore(0, { animate: false });
  }

  // ---------------------------------------------------------------- build

  _injectStyle() {
    const old = document.getElementById(STYLE_ID);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
    this._style = style;
  }

  _build() {
    const root = this.root;
    root.replaceChildren();

    // Level block
    const level = el('div', 'blk'); level.id = 'hud-level';
    this._eyebrow = el('span', 'eyebrow', 'Lumon Industries');
    this._name = el('span', 'name', 'Macrodata Refinement');
    this._lvl = el('span', 'lvl', 'Level 1 of 2');
    level.append(this._eyebrow, this._name, this._lvl);

    // Score block
    const score = el('div', 'blk'); score.id = 'hud-score';
    const label = el('span', 'label', 'Score');
    const row = el('div', 'row');
    this._score = el('span', 'value', '0'); this._score.id = 'score';
    this._streakEl = el('span', null, ''); this._streakEl.id = 'streak'; this._streakEl.hidden = true;
    row.append(this._score, this._streakEl);
    this._dots = el('div'); this._dots.id = 'dots'; this._dots.setAttribute('aria-hidden', 'true');
    this._dotEls = [];
    for (let i = 0; i < 10; i++) { const d = el('i'); this._dots.appendChild(d); this._dotEls.push(d); }
    score.append(label, row, this._dots);

    // Stats
    const stats = el('div', 'blk'); stats.id = 'hud-stats';
    this._throws = el('span', null, '0 throws'); this._throws.id = 'throws';
    this._acc = el('span', null, ''); this._acc.id = 'acc';
    stats.append(this._throws, this._acc);

    // Hint, flavor line, stuck
    this._hint = el('div'); this._hint.id = 'hud-hint'; this._hint.hidden = true;
    this._say = el('div'); this._say.id = 'hud-say'; this._say.hidden = true;
    this._stuck = el('div', null, 'Ball stuck? Press R.'); this._stuck.id = 'hud-stuck'; this._stuck.hidden = true;

    // Sound button
    this._sound = el('button', 'blk', 'Sound on'); this._sound.id = 'hud-sound'; this._sound.type = 'button';
    this._sound.setAttribute('aria-pressed', 'true');
    this._onSoundClick = (ev) => {
      ev.preventDefault();
      const next = !this._soundOn;
      this.setSound(next);
      // Drop focus so Space/Enter go back to the game instead of re-toggling the button.
      try { this._sound.blur(); } catch (err) { /* ignore */ }
      if (this._soundCb) { try { this._soundCb(next); } catch (err) { console.error('[hud] sound toggle handler threw', err); } }
    };
    this._sound.addEventListener('click', this._onSoundClick);

    // Popups (pooled)
    this._popups = el('div'); this._popups.id = 'popups';
    this._pool = [];
    this._poolIdx = 0;
    for (let i = 0; i < POPUP_POOL; i++) {
      const p = el('div', 'popup'); p.hidden = true;
      const big = el('span', 'big'); const sub = el('span', 'sub'); sub.hidden = true;
      p.append(big, sub);
      p._big = big; p._sub = sub; p._t = 0;
      this._popups.appendChild(p);
      this._pool.push(p);
    }

    // Live region
    this._live = el('div', 'sr-only'); this._live.id = 'live';
    this._live.setAttribute('aria-live', 'polite');
    this._live.setAttribute('aria-atomic', 'true');

    // Overlay
    this._overlay = el('div'); this._overlay.id = 'overlay'; this._overlay.hidden = true;
    this._overlay.setAttribute('role', 'dialog'); this._overlay.setAttribute('aria-modal', 'true');
    this._panel = el('div', 'panel');
    this._ovEyebrow = el('div', 'eyebrow');
    this._ovTitle = el('h2', 'title'); this._ovTitle.id = 'overlay-title';
    this._ovBody = el('p', 'body');
    this._ovStats = el('p', 'stats');
    this._ovSub = el('p', 'sub');
    this._ovFootnote = el('p', 'footnote');
    this._ovButtons = el('div', 'buttons');
    this._panel.append(this._ovEyebrow, this._ovTitle, this._ovBody, this._ovStats, this._ovSub, this._ovButtons, this._ovFootnote);
    this._overlay.setAttribute('aria-labelledby', 'overlay-title');
    this._overlay.appendChild(this._panel);
    this._onPanelKey = (ev) => this._trapFocus(ev);
    this._panel.addEventListener('keydown', this._onPanelKey);

    // Fade layer
    this._fade = el('div'); this._fade.id = 'fade';
    this._fadeText = el('div', 'fade-text');
    this._fadeSmall = el('span', 'small');
    this._fadeBig = el('span', 'big');
    this._fadeText.append(this._fadeSmall, this._fadeBig);
    this._fade.appendChild(this._fadeText);

    root.append(level, score, stats, this._hint, this._say, this._stuck, this._sound,
      this._popups, this._live, this._overlay, this._fade);
    this._blocks = [level, score, stats, this._sound];
    this._blockDy = ['-8px', '-8px', '8px', '8px'];
  }

  // ---------------------------------------------------------------- helpers

  _setTimer(key, fn, ms) {
    this._clearTimer(key);
    this._timers[key] = setTimeout(() => { this._timers[key] = 0; fn(); }, ms);
  }

  _clearTimer(key) {
    if (this._timers[key]) { clearTimeout(this._timers[key]); this._timers[key] = 0; }
  }

  // Un-hide an element and let its opacity transition run.
  _fadeIn(elm, key) {
    this._clearTimer(key);
    if (elm.hidden) { elm.hidden = false; void elm.offsetWidth; }
    elm.classList.add('show');
  }

  _fadeOut(elm, key, ms) {
    elm.classList.remove('show');
    if (elm.hidden) { this._clearTimer(key); return; }
    this._setTimer(key, () => { elm.hidden = true; }, ms);
  }

  get reducedMotion() { return !!this._reduced; }

  _applyReduced(on) {
    this._reduced = !!on;
    this.root.classList.toggle('reduced', this._reduced);
  }

  // ---------------------------------------------------------------- contract API

  setTheme(theme) {
    const t = theme === 'beach' ? 'beach' : 'lumon';
    this._theme = t;
    this.root.classList.remove('theme-lumon', 'theme-beach');
    this.root.classList.add('theme-' + t);
  }

  setLevel({ eyebrow, name, lvl } = {}) {
    if (eyebrow != null) this._eyebrow.textContent = eyebrow;
    if (name != null) this._name.textContent = name;
    if (lvl != null) this._lvl.textContent = lvl;
  }

  setScore(levelScore, { animate = true } = {}) {
    const target = Math.max(0, Math.round(Number(levelScore) || 0));
    if (this._scoreRaf) { cancelAnimationFrame(this._scoreRaf); this._scoreRaf = 0; }
    if (!animate || target === this._scoreShown || typeof requestAnimationFrame !== 'function') {
      this._scoreShown = target;
      this._score.textContent = String(target);
      return;
    }
    const from = this._scoreShown;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / SCORE_TWEEN_MS);
      const e = 1 - Math.pow(1 - p, 3);
      const cur = Math.round(from + (target - from) * e);
      this._scoreShown = cur;
      this._score.textContent = String(cur);
      if (p < 1) this._scoreRaf = requestAnimationFrame(tick);
      else { this._scoreRaf = 0; this._scoreShown = target; }
    };
    this._scoreRaf = requestAnimationFrame(tick);
  }

  setDots(made) {
    const n = Math.max(0, Math.min(10, Math.round(Number(made) || 0)));
    const prev = this._made;
    for (let i = 0; i < 10; i++) {
      const d = this._dotEls[i];
      const on = i < n;
      const was = d.classList.contains('on');
      if (on && !was) {
        d.classList.add('on');
        if (!this._reduced) {
          d.classList.remove('pop', 'pop-big');
          void d.offsetWidth;
          d.classList.add(n === 10 && i === 9 ? 'pop-big' : 'pop');
        }
      } else if (!on && was) {
        d.classList.remove('on', 'pop', 'pop-big');
      }
    }
    if (n === 10 && prev < 10 && !this._reduced) {
      this._dots.classList.add('flash');
      this._setTimer('dotsFlash', () => this._dots.classList.remove('flash'), 200);
    } else if (n < 10) {
      this._clearTimer('dotsFlash');
      this._dots.classList.remove('flash');
    }
    this._made = n;
  }

  setStreak(n) {
    const v = Math.max(0, Math.round(Number(n) || 0));
    this._streak = v;
    this._clearTimer('streakCopy');
    if (v < 3) { this._fadeOut(this._streakEl, 'streak', 200); return; }
    const copy = STREAK_COPY[this._theme] && STREAK_COPY[this._theme][v];
    this._streakEl.textContent = copy || ('×' + v);
    this._fadeIn(this._streakEl, 'streak');
    if (copy) {
      this._setTimer('streakCopy', () => {
        if (this._streak === v && !this._streakEl.hidden) this._streakEl.textContent = '×' + v;
      }, 1200);
    }
  }

  setStats({ throws = 0, makes = 0 } = {}) {
    const t = Math.max(0, Math.round(Number(throws) || 0));
    const m = Math.max(0, Math.round(Number(makes) || 0));
    this._throws.textContent = t + (t === 1 ? ' throw' : ' throws');
    if (t === 0) { this._acc.textContent = ''; return; }
    const pct = Math.round((100 * m) / t);
    this._acc.textContent = ' · ' + m + ' made · ' + pct + '%';
  }

  setHint(text) {
    if (text == null || text === '') { this._fadeOut(this._hint, 'hint', 400); return; }
    this._hint.textContent = String(text);
    this._fadeIn(this._hint, 'hint');
  }

  say(text, { ms = 2600 } = {}) {
    this._clearTimer('sayHide');
    if (text == null || text === '') { this._fadeOut(this._say, 'say', 300); return; }
    this._say.textContent = String(text);
    this._fadeIn(this._say, 'say');
    this._setTimer('sayHide', () => this._fadeOut(this._say, 'say', 300), Math.max(0, ms));
  }

  popup(text, { x, y, kind = 'score', sub = null } = {}) {
    const p = this._pool[this._poolIdx];
    this._poolIdx = (this._poolIdx + 1) % POPUP_POOL;
    if (p._t) { clearTimeout(p._t); p._t = 0; }
    const k = ['score', 'label', 'warn', 'muted'].includes(kind) ? kind : 'score';
    const px = Number.isFinite(x) ? x : (typeof innerWidth === 'number' ? innerWidth / 2 : 0);
    const py = Number.isFinite(y) ? y : (typeof innerHeight === 'number' ? innerHeight * 0.45 : 0);
    p.className = 'popup ' + k;
    p.style.left = px + 'px';
    p.style.top = py + 'px';
    p._big.textContent = text == null ? '' : String(text);
    if (sub) { p._sub.textContent = String(sub); p._sub.hidden = false; } else { p._sub.textContent = ''; p._sub.hidden = true; }
    p.hidden = false;
    void p.offsetWidth;
    p.classList.add('run');
    p._t = setTimeout(() => { p._t = 0; p.hidden = true; p.classList.remove('run'); }, POPUP_MS + 40);
  }

  showOverlay({ eyebrow, title, body, stats, sub, footnote, buttons = [] } = {}) {
    this._clearTimer('overlayHide');
    if (this._overlay.hidden) {
      const ae = document.activeElement;
      this._prevFocus = ae && ae !== document.body ? ae : null;
    }
    const fill = (elm, v) => { if (v) { elm.textContent = String(v); elm.hidden = false; } else { elm.textContent = ''; elm.hidden = true; } };
    fill(this._ovEyebrow, eyebrow);
    fill(this._ovTitle, title);
    fill(this._ovBody, body);
    fill(this._ovStats, stats);
    fill(this._ovSub, sub);
    fill(this._ovFootnote, footnote);

    this._ovButtons.replaceChildren();
    this._overlayButtons = [];
    this._primaryAction = null;
    let primaryBtn = null;
    for (const b of Array.isArray(buttons) ? buttons : []) {
      if (!b) continue;
      const btn = el('button', b.primary ? 'primary' : '', b.label == null ? '' : String(b.label));
      btn.type = 'button';
      const action = { onClick: typeof b.onClick === 'function' ? b.onClick : null, lastAt: -1e9 };
      btn.addEventListener('click', (ev) => { ev.preventDefault(); this._activate(action); });
      this._ovButtons.appendChild(btn);
      this._overlayButtons.push(btn);
      if (!primaryBtn && b.primary) { primaryBtn = btn; this._primaryAction = action; }
      if (!this._primaryAction) this._primaryAction = action;
    }
    this._ovButtons.hidden = this._overlayButtons.length === 0;
    if (!primaryBtn && this._overlayButtons.length) primaryBtn = this._overlayButtons[0];

    this._overlay.hidden = false;
    void this._overlay.offsetWidth;
    this._overlay.classList.add('show');
    if (primaryBtn) { try { primaryBtn.focus({ preventScroll: true }); } catch (err) { /* ignore */ } }
    this.live([eyebrow, title, body].filter(Boolean).join('. '));
  }

  hideOverlay() {
    if (this._overlay.hidden) return;
    this._overlay.classList.remove('show');
    const focused = document.activeElement;
    if (focused && this._overlay.contains(focused)) {
      const prev = this._prevFocus;
      let restored = false;
      if (prev && prev.isConnected && typeof prev.focus === 'function' && !this._overlay.contains(prev)) {
        try { prev.focus({ preventScroll: true }); restored = document.activeElement === prev; } catch (err) { restored = false; }
      }
      if (!restored) { try { focused.blur(); } catch (err) { /* ignore */ } }
    }
    this._prevFocus = null;
    this._setTimer('overlayHide', () => {
      this._overlay.hidden = true;
      this._ovButtons.replaceChildren();
      this._overlayButtons = [];
      this._primaryAction = null;
    }, 260);
  }

  get overlayOpen() { return !this._overlay.hidden && this._overlay.classList.contains('show'); }

  // Triggers the primary overlay button (main.js calls this on Enter/Space). Returns true if something fired.
  overlayPrimary() {
    if (!this.overlayOpen || !this._primaryAction) return false;
    return this._activate(this._primaryAction);
  }

  _activate(action) {
    // A focused button also fires a native click on Enter/Space; ignore a repeat of the same action inside 300 ms.
    if (!action) return false;
    const now = performance.now();
    if (now - action.lastAt < 300) return false;
    action.lastAt = now;
    if (action.onClick) {
      try { action.onClick(); } catch (err) { console.error('[hud] overlay button handler threw', err); }
    }
    return true;
  }

  _trapFocus(ev) {
    if (ev.key !== 'Tab') return;
    const ring = this._overlayButtons.filter((b) => !b.hidden && !b.disabled);
    if (!this._sound.hidden) ring.push(this._sound);
    if (!ring.length) return;
    const idx = ring.indexOf(document.activeElement);
    let next;
    if (ev.shiftKey) next = idx <= 0 ? ring[ring.length - 1] : ring[idx - 1];
    else next = idx < 0 || idx >= ring.length - 1 ? ring[0] : ring[idx + 1];
    ev.preventDefault();
    try { next.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
  }

  fade(colorHex, { inMs = 600, holdMs = 400, outMs = 800, text = null, onCovered = null } = {}) {
    // Cancel a fade already in progress; its promise resolves right away.
    for (const t of this._fadeTimers) clearTimeout(t);
    this._fadeTimers = [];
    if (this._fadeResolve) { const r = this._fadeResolve; this._fadeResolve = null; r(); }

    const reduced = this._reduced;
    const tIn = Math.max(0, reduced ? Math.min(inMs, 300) : inMs);
    const tHold = Math.max(0, reduced ? Math.min(holdMs, 200) : holdMs);
    const tOut = Math.max(0, reduced ? Math.min(outMs, 300) : outMs);
    const color = colorToCss(colorHex);
    const fadeEl = this._fade;
    const textEl = this._fadeText;

    fadeEl.style.background = color;
    fadeEl.style.transition = 'opacity ' + tIn + 'ms ease-in';
    textEl.classList.remove('show');
    textEl.style.color = isLightColor(color) ? '#2B2521' : '#E4F0EE';
    // The caption is read again once the screen is covered (after onCovered), so a caller may pass
    // getters that resolve to the new level's name.
    const readCaption = () => {
      const small = text && text.small ? String(text.small) : '';
      const big = text && text.big ? String(text.big) : '';
      this._fadeSmall.textContent = small;
      this._fadeSmall.hidden = !small;
      this._fadeBig.textContent = big;
      this._fadeBig.hidden = !big;
      return !!(small || big);
    };
    let hasText = false;
    try { hasText = readCaption(); } catch (err) { hasText = false; }
    textEl.hidden = !hasText;
    void fadeEl.offsetWidth;
    fadeEl.style.opacity = '1';

    const later = (fn, ms) => { this._fadeTimers.push(setTimeout(fn, ms)); };
    const textIn = reduced ? 0 : 100;
    const textOutAt = tIn + tHold + (reduced ? 100 : 300);

    return new Promise((resolve) => {
      this._fadeResolve = resolve;
      later(() => {
        if (typeof onCovered === 'function') {
          try { onCovered(); } catch (err) { console.error('[hud] fade onCovered threw', err); }
        }
        // The theme may have changed under the cover: let the new tokens settle without a visible crossfade.
        if (hasText) {
          try { readCaption(); } catch (err) { /* keep the caption read before the cover */ }
          later(() => textEl.classList.add('show'), textIn);
        }
      }, tIn);
      later(() => {
        fadeEl.style.transition = 'opacity ' + tOut + 'ms ease-out';
        fadeEl.style.opacity = '0';
        this._enterBlocks();
      }, tIn + tHold);
      if (hasText) later(() => textEl.classList.remove('show'), textOutAt);
      later(() => {
        textEl.hidden = true;
        this._fadeTimers = [];
        const r = this._fadeResolve; this._fadeResolve = null;
        if (r) r();
      }, tIn + tHold + tOut);
    });
  }

  // Slide the HUD blocks in from their edge (stagger 60 ms): level, score, stats, sound.
  _enterBlocks() {
    this._blocks.forEach((b, i) => {
      b.classList.remove('enter');
      b.style.setProperty('--enter-dy', this._blockDy[i]);
      b.style.animationDelay = (i * 60) + 'ms';
      void b.offsetWidth;
      b.classList.add('enter');
    });
    this._setTimer('enterBlocks', () => {
      for (const b of this._blocks) { b.classList.remove('enter'); b.style.animationDelay = ''; }
    }, 300 + 60 * this._blocks.length + 50);
  }

  setStuck(visible) {
    if (visible) this._fadeIn(this._stuck, 'stuck');
    else this._fadeOut(this._stuck, 'stuck', 200);
  }

  setSound(on) {
    this._soundOn = !!on;
    this._sound.setAttribute('aria-pressed', this._soundOn ? 'true' : 'false');
    this._sound.textContent = this._soundOn ? 'Sound on' : 'Sound off';
    this._sound.setAttribute('aria-label', this._soundOn ? 'Sound on. Press to mute.' : 'Sound off. Press to unmute.');
  }

  onSoundToggle(cb) { this._soundCb = typeof cb === 'function' ? cb : null; }

  setInputMode(mode) {
    const m = mode === 'touch' || mode === 'keyboard' ? mode : 'pointer';
    this.root.dataset.input = m;
    // The stuck hint names a key; touch players cannot press it.
    this._stuck.textContent = m === 'touch' ? 'Ball stuck? Wait for a fresh one.' : 'Ball stuck? Press R.';
  }

  get inputMode() { return this.root.dataset.input || 'pointer'; }

  live(text) {
    this._livePending = text == null ? '' : String(text);
    if (this._liveTimer) return;
    const flush = () => {
      this._liveTimer = 0;
      this._liveLast = performance.now();
      const t = this._livePending == null ? '' : this._livePending;
      this._livePending = null;
      this._liveFlip = !this._liveFlip;
      // A trailing zero-width space makes repeated identical lines re-announce.
      this._live.textContent = t + (this._liveFlip ? '\u200B' : '');
    };
    const wait = 250 - (performance.now() - this._liveLast);
    if (wait <= 0) flush();
    else this._liveTimer = setTimeout(flush, wait);
  }

  setReducedMotion(on) {
    if (on == null) { this._reducedExplicit = null; this._onMq(); return; }
    this._reducedExplicit = !!on;
    this._applyReduced(!!on);
  }

  // Extra (UX spec 5.4): solid panels, no text shadow, larger hint and stats.
  setHighContrast(on) { this.root.classList.toggle('hc', !!on); }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    for (const k of Object.keys(this._timers)) this._clearTimer(k);
    for (const t of this._fadeTimers) clearTimeout(t);
    this._fadeTimers = [];
    if (this._fadeResolve) { const r = this._fadeResolve; this._fadeResolve = null; r(); }
    if (this._liveTimer) { clearTimeout(this._liveTimer); this._liveTimer = 0; }
    if (this._scoreRaf) { cancelAnimationFrame(this._scoreRaf); this._scoreRaf = 0; }
    for (const p of this._pool) if (p._t) { clearTimeout(p._t); p._t = 0; }
    this._sound.removeEventListener('click', this._onSoundClick);
    this._panel.removeEventListener('keydown', this._onPanelKey);
    if (this._mq) {
      try {
        if (this._mq.removeEventListener) this._mq.removeEventListener('change', this._onMq);
        else if (this._mq.removeListener) this._mq.removeListener(this._onMq);
      } catch (err) { /* ignore */ }
      this._mq = null;
    }
    if (this._style && this._style.parentNode) this._style.parentNode.removeChild(this._style);
    this._style = null;
    this.root.classList.remove('theme-lumon', 'theme-beach', 'reduced', 'hc');
    delete this.root.dataset.input;
    this.root.replaceChildren();
    this._soundCb = null;
    this._primaryAction = null;
    this._overlayButtons = [];
  }
}
