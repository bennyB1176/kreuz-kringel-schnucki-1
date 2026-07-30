/* Weltkarte: Gelände, Bäume und Felsen. */

import { MAP_W, MAP_H, TERRAIN, NODE_TYPES } from './config.js';
import { makeNoise, makeRng, clamp } from './utils.js';

export class World {
  constructor(seed = Date.now() & 0xffff) {
    this.seed = seed;
    this.w = MAP_W;
    this.h = MAP_H;
    this.tiles = new Uint8Array(this.w * this.h);
    this.variant = new Uint8Array(this.w * this.h); // kleine Farbvarianz
    /** nodes: Map "x,y" -> {type, res, amount, max} */
    this.nodes = new Map();
    /** Belegung durch Gebäude: Map "x,y" -> buildingId */
    this.occupied = new Map();
    this.generate();
  }

  idx(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  terrainAt(x, y) { return this.inBounds(x, y) ? this.tiles[this.idx(x, y)] : TERRAIN.WATER; }
  key(x, y) { return x + ',' + y; }
  nodeAt(x, y) { return this.nodes.get(this.key(x, y)); }

  /** Begehbar für Einheiten? */
  walkable(x, y) {
    if (!this.inBounds(x, y)) return false;
    if (this.tiles[this.idx(x, y)] === TERRAIN.WATER) return false;
    if (this.nodes.has(this.key(x, y))) return false;
    if (this.occupied.has(this.key(x, y))) return false;
    return true;
  }

  /** Bebaubar? (wie walkable, Bäume/Felsen blockieren) */
  buildable(x, y) {
    if (!this.inBounds(x, y)) return false;
    const t = this.tiles[this.idx(x, y)];
    if (t === TERRAIN.WATER) return false;
    if (this.nodes.has(this.key(x, y))) return false;
    if (this.occupied.has(this.key(x, y))) return false;
    return true;
  }

  generate() {
    const noise = makeNoise(this.seed);
    const treeNoise = makeNoise(this.seed + 977);
    const rockNoise = makeNoise(this.seed + 4231);
    const rng = makeRng(this.seed + 13);

    const cx = this.w / 2, cy = this.h / 2;
    const maxR = Math.min(this.w, this.h) / 2;

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        // Inselform: Rauschen minus Abstand zum Zentrum
        const d = Math.hypot(x - cx, y - cy) / maxR;
        const falloff = clamp(1.15 - d * 1.25, 0, 1);
        const n = noise(x, y, 4, 0.07) * 0.75 + falloff * 0.6;

        let t;
        if (n < 0.46) t = TERRAIN.WATER;
        else if (n < 0.52) t = TERRAIN.SAND;
        else t = TERRAIN.GRASS;

        // felsiger Untergrund in bergigen Regionen
        if (t === TERRAIN.GRASS && rockNoise(x, y, 3, 0.09) > 0.72) t = TERRAIN.ROCKGROUND;

        this.tiles[this.idx(x, y)] = t;
        this.variant[this.idx(x, y)] = (rng() * 4) | 0;
      }
    }

    // Startfläche in der Mitte freiräumen
    const clearR = 5;

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const t = this.tiles[this.idx(x, y)];
        const nearStart = Math.hypot(x - cx, y - cy) < clearR;
        if (nearStart) {
          if (t === TERRAIN.WATER) this.tiles[this.idx(x, y)] = TERRAIN.GRASS;
          continue;
        }
        if (t === TERRAIN.GRASS) {
          const tn = treeNoise(x, y, 3, 0.11);
          if (tn > 0.58 && rng() < 0.65) this.addNode(x, y, 'baum');
        } else if (t === TERRAIN.ROCKGROUND) {
          if (rng() < 0.34) this.addNode(x, y, 'fels');
        }
      }
    }

    // sicherstellen: genug Bäume/Felsen in Startnähe
    this.ensureNearby(cx, cy, 'baum', 14, 12);
    this.ensureNearby(cx, cy, 'fels', 8, 12);
  }

  ensureNearby(cx, cy, type, wanted, radius) {
    let found = 0;
    for (const n of this.nodes.values()) {
      if (n.type === type && Math.hypot(n.x - cx, n.y - cy) < radius) found++;
    }
    const rng = makeRng(this.seed + (type === 'baum' ? 71 : 91));
    let guard = 0;
    while (found < wanted && guard++ < 500) {
      const a = rng() * Math.PI * 2;
      const r = 6 + rng() * (radius - 6);
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      if (!this.inBounds(x, y)) continue;
      const t = this.tiles[this.idx(x, y)];
      if (t === TERRAIN.WATER || t === TERRAIN.SAND) continue;
      if (this.nodes.has(this.key(x, y))) continue;
      this.addNode(x, y, type);
      found++;
    }
  }

  addNode(x, y, type) {
    const def = NODE_TYPES[type];
    this.nodes.set(this.key(x, y), {
      x, y, type, res: def.res, amount: def.amount, max: def.amount,
      variant: (x * 7 + y * 13) % 3,
    });
  }

  removeNode(x, y) { this.nodes.delete(this.key(x, y)); }

  /** Nächstes Vorkommen eines Typs zu (x,y), optional mit Radiuslimit. */
  findNearestNode(x, y, type, maxDist = Infinity, filter = null) {
    let best = null, bestD = Infinity;
    for (const n of this.nodes.values()) {
      if (n.type !== type || n.amount <= 0) continue;
      if (filter && !filter(n)) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bestD && d <= maxDist) { bestD = d; best = n; }
    }
    return best;
  }

  /** Erste begehbare Kachel neben (x,y). */
  adjacentWalkable(x, y, fromX = x, fromY = y) {
    const cand = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (this.walkable(nx, ny)) cand.push({ x: nx, y: ny, d: Math.hypot(nx - fromX, ny - fromY) });
      }
    }
    cand.sort((a, b) => a.d - b.d);
    return cand[0] || null;
  }

  serialize() {
    return {
      seed: this.seed,
      tiles: Array.from(this.tiles),
      variant: Array.from(this.variant),
      nodes: [...this.nodes.values()].map((n) => [n.x, n.y, n.type, n.amount]),
    };
  }

  static deserialize(data) {
    const w = Object.create(World.prototype);
    w.seed = data.seed;
    w.w = MAP_W; w.h = MAP_H;
    w.tiles = Uint8Array.from(data.tiles);
    w.variant = Uint8Array.from(data.variant);
    w.nodes = new Map();
    w.occupied = new Map();
    for (const [x, y, type, amount] of data.nodes) {
      w.addNode(x, y, type);
      w.nodeAt(x, y).amount = amount;
    }
    return w;
  }
}
