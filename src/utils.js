/* Kleine Hilfsfunktionen: Zufall, Rauschen, Mathe, Heap. */

/** Deterministischer PRNG (mulberry32). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wertrauschen mit bilinearer Interpolation – reicht für Inselformen. */
export function makeNoise(seed) {
  const rng = makeRng(seed);
  const size = 256;
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();

  const at = (x, y) => grid[(y & (size - 1)) * size + (x & (size - 1))];
  const smooth = (t) => t * t * (3 - 2 * t);

  function sample(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(x - x0), fy = smooth(y - y0);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  /** Fraktales Rauschen, Ergebnis in [0,1]. */
  return function fbm(x, y, octaves = 4, scale = 0.08) {
    let sum = 0, amp = 1, norm = 0, f = scale;
    for (let o = 0; o < octaves; o++) {
      sum += sample(x * f, y * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

/** Minimaler Binary-Heap für A*. */
export class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(node, prio) {
    const it = this.items;
    it.push({ node, prio });
    let i = it.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (it[p].prio <= it[i].prio) break;
      [it[p], it[i]] = [it[i], it[p]];
      i = p;
    }
  }
  pop() {
    const it = this.items;
    const top = it[0];
    const last = it.pop();
    if (it.length) {
      it[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let s = i;
        if (l < it.length && it[l].prio < it[s].prio) s = l;
        if (r < it.length && it[r].prio < it[s].prio) s = r;
        if (s === i) break;
        [it[s], it[i]] = [it[i], it[s]];
        i = s;
      }
    }
    return top.node;
  }
}

let idCounter = 1;
export const nextId = () => idCounter++;
export const peekId = () => idCounter;
export const setIdCounter = (v) => { idCounter = Math.max(idCounter, v); };
