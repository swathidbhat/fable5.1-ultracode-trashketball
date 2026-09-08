// Tiny synchronous event emitter shared by physics, main, hud, audio.
export class Emitter {
  constructor() { this._l = new Map(); }
  on(name, fn) {
    if (!this._l.has(name)) this._l.set(name, new Set());
    this._l.get(name).add(fn);
    return () => this.off(name, fn);
  }
  once(name, fn) {
    const off = this.on(name, (...a) => { off(); fn(...a); });
    return off;
  }
  off(name, fn) { this._l.get(name)?.delete(fn); }
  emit(name, payload) {
    const set = this._l.get(name);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try { fn(payload); } catch (err) { console.error(`[events] listener for "${name}" threw`, err); }
    }
  }
  clear() { this._l.clear(); }
}
