/* Minimaler Canvas-2D-Ersatz für Node: zeichnet nichts, protokolliert aber
   jeden Aufruf und meldet ungültige Zahlenwerte (NaN, Infinity). */

const METHODS = [
  'save', 'restore', 'translate', 'scale', 'rotate', 'setTransform', 'resetTransform',
  'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse',
  'quadraticCurveTo', 'bezierCurveTo', 'rect', 'roundRect',
  'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect',
  'fillText', 'strokeText', 'setLineDash', 'drawImage',
];

export class StubContext {
  constructor() {
    this.calls = 0;
    this.badValues = [];
    this.ops = [];
    for (const name of METHODS) {
      this[name] = (...args) => this.record(name, args);
    }
  }

  record(name, args) {
    this.calls++;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (typeof a === 'number' && !Number.isFinite(a)) {
        this.badValues.push(`${name}(Argument ${i} = ${a})`);
      }
    }
    if (this.ops.length < 20000) this.ops.push(name);
  }

  measureText(text) { return { width: String(text).length * 6 }; }
  createLinearGradient() { return { addColorStop: () => {} }; }
  createRadialGradient() { return { addColorStop: () => {} }; }

  /** Zählt, wie oft eine Methode aufgerufen wurde. */
  count(name) { return this.ops.filter((o) => o === name).length; }
}

/** Legt ein window-Objekt an, damit render.js in Node geladen werden kann. */
export function installCanvas() {
  if (!globalThis.window) {
    globalThis.window = {
      innerWidth: 900,
      innerHeight: 700,
      devicePixelRatio: 1,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }
  return globalThis.window;
}
