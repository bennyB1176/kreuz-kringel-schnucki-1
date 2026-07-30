/* A*-Wegfindung auf dem Kachelgitter (8 Richtungen). */

import { MinHeap } from './utils.js';

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * Sucht einen Weg von (sx,sy) nach (gx,gy).
 * @returns {Array<{x:number,y:number}>|null} Wegpunkte ohne Startfeld
 */
export function findPath(world, sx, sy, gx, gy, opts = {}) {
  const maxNodes = opts.maxNodes || 6000;
  sx |= 0; sy |= 0; gx |= 0; gy |= 0;
  if (sx === gx && sy === gy) return [];

  // Ziel nicht begehbar? Auf nächstgelegenes freies Nachbarfeld ausweichen.
  if (!world.walkable(gx, gy)) {
    const alt = world.adjacentWalkable(gx, gy, sx, sy);
    if (!alt) return null;
    gx = alt.x; gy = alt.y;
    if (sx === gx && sy === gy) return [];
  }

  const W = world.w;
  const open = new MinHeap();
  const came = new Map();
  const gScore = new Map();
  const start = sy * W + sx;
  const goal = gy * W + gx;

  const h = (x, y) => {
    const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
    return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };

  gScore.set(start, 0);
  open.push(start, h(sx, sy));
  const closed = new Set();
  let expanded = 0;

  while (open.size) {
    const cur = open.pop();
    if (cur === goal) return rebuild(came, cur, W);
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (++expanded > maxNodes) break;

    const cx = cur % W, cy = (cur / W) | 0;
    const cg = gScore.get(cur);

    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!world.walkable(nx, ny)) continue;
      // Diagonalen nicht durch Ecken schneiden
      if (dx !== 0 && dy !== 0 && (!world.walkable(cx + dx, cy) || !world.walkable(cx, cy + dy))) continue;
      const ni = ny * W + nx;
      if (closed.has(ni)) continue;
      const step = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
      const ng = cg + step;
      if (ng < (gScore.get(ni) ?? Infinity)) {
        gScore.set(ni, ng);
        came.set(ni, cur);
        open.push(ni, ng + h(nx, ny));
      }
    }
  }
  return null;
}

function rebuild(came, cur, W) {
  const path = [];
  while (came.has(cur)) {
    path.push({ x: cur % W, y: (cur / W) | 0 });
    cur = came.get(cur);
  }
  path.reverse();
  return path;
}
