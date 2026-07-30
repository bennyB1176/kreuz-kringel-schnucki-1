/* Umrechnung zwischen Kachel-Koordinaten und Bildschirm. */

import { TILE_W, TILE_H } from './config.js';

/** Kachel -> Weltpixel (unabhängig von Kamera). */
export function tileToWorld(tx, ty) {
  return {
    x: (tx - ty) * (TILE_W / 2),
    y: (tx + ty) * (TILE_H / 2),
  };
}

/** Weltpixel -> Kachel (float). */
export function worldToTile(wx, wy) {
  const a = wx / (TILE_W / 2);
  const b = wy / (TILE_H / 2);
  return { x: (b + a) / 2, y: (b - a) / 2 };
}

/** Kachel -> Bildschirm, unter Berücksichtigung der Kamera. */
export function tileToScreen(tx, ty, cam) {
  const w = tileToWorld(tx, ty);
  return {
    x: (w.x - cam.x) * cam.zoom + cam.vw / 2,
    y: (w.y - cam.y) * cam.zoom + cam.vh / 2,
  };
}

/** Bildschirm -> Kachel (float). */
export function screenToTile(sx, sy, cam) {
  const wx = (sx - cam.vw / 2) / cam.zoom + cam.x;
  const wy = (sy - cam.vh / 2) / cam.zoom + cam.y;
  return worldToTile(wx, wy);
}

/** Tiefensortierung: weiter „hinten“ zuerst zeichnen. */
export const depthOf = (tx, ty) => tx + ty;
