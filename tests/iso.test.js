import test from 'node:test';
import assert from 'node:assert/strict';

import { tileToWorld, worldToTile, tileToScreen, screenToTile, depthOf } from '../src/iso.js';
import { TILE_W, TILE_H } from '../src/config.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('Kachel und Weltpixel sind zueinander invers', () => {
  for (const [tx, ty] of [[0, 0], [3, 7], [-2, 5], [55, 55], [12.5, 3.25]]) {
    const w = tileToWorld(tx, ty);
    const back = worldToTile(w.x, w.y);
    close(back.x, tx);
    close(back.y, ty);
  }
});

test('Kachel (0,0) liegt im Weltursprung, Achsen zeigen isometrisch', () => {
  assert.deepEqual(tileToWorld(0, 0), { x: 0, y: 0 });
  assert.deepEqual(tileToWorld(1, 0), { x: TILE_W / 2, y: TILE_H / 2 });
  assert.deepEqual(tileToWorld(0, 1), { x: -TILE_W / 2, y: TILE_H / 2 });
});

test('Bildschirmumrechnung berücksichtigt Kamera und Zoom', () => {
  const cam = { x: 120, y: -40, zoom: 1.75, vw: 800, vh: 600 };
  for (const [tx, ty] of [[0, 0], [10, 4], [33, 21]]) {
    const s = tileToScreen(tx, ty, cam);
    const back = screenToTile(s.x, s.y, cam);
    close(back.x, tx, 1e-9);
    close(back.y, ty, 1e-9);
  }
});

test('Kameramitte zeigt auf die Kachel unter der Kameraposition', () => {
  const cam = { x: 0, y: 0, zoom: 1, vw: 800, vh: 600 };
  const t = screenToTile(cam.vw / 2, cam.vh / 2, cam);
  close(t.x, 0);
  close(t.y, 0);
});

test('depthOf sortiert weiter hinten liegende Kacheln zuerst', () => {
  assert.ok(depthOf(0, 0) < depthOf(1, 0));
  assert.equal(depthOf(2, 3), depthOf(3, 2));
  assert.equal(depthOf(4, 4), 8);
});
