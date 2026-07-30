import test from 'node:test';
import assert from 'node:assert/strict';

import { findPath } from '../src/pathfind.js';
import { flatGame, center } from './helpers.js';

/** Sperrt Felder über die Belegungskarte. */
function block(world, tiles) {
  for (const [x, y] of tiles) world.occupied.set(world.key(x, y), 999);
}

test('Weg auf freiem Feld endet exakt am Ziel', () => {
  const g = flatGame();
  const c = center(g);
  const path = findPath(g.world, c.x, c.y, c.x + 5, c.y + 3);
  assert.ok(Array.isArray(path));
  const last = path[path.length - 1];
  assert.deepEqual({ x: last.x, y: last.y }, { x: c.x + 5, y: c.y + 3 });
  assert.equal(path.length, 5, 'diagonale Schritte werden genutzt');
});

test('Start gleich Ziel ergibt einen leeren Weg', () => {
  const g = flatGame();
  const c = center(g);
  assert.deepEqual(findPath(g.world, c.x, c.y, c.x, c.y), []);
});

test('jeder Schritt ist ein Nachbarfeld und begehbar', () => {
  const g = flatGame();
  const c = center(g);
  block(g.world, [[c.x + 2, c.y - 1], [c.x + 2, c.y], [c.x + 2, c.y + 1], [c.x + 2, c.y + 2]]);
  const path = findPath(g.world, c.x, c.y, c.x + 5, c.y);
  assert.ok(path && path.length, 'Weg um die Sperre muss existieren');
  let prev = { x: c.x, y: c.y };
  for (const p of path) {
    assert.ok(Math.abs(p.x - prev.x) <= 1 && Math.abs(p.y - prev.y) <= 1, 'nur Nachbarschritte');
    assert.ok(g.world.walkable(p.x, p.y), `Feld ${p.x},${p.y} muss begehbar sein`);
    prev = p;
  }
  assert.deepEqual(prev, { x: c.x + 5, y: c.y });
});

test('unerreichbares Ziel liefert null', () => {
  const g = flatGame();
  const c = center(g);
  // Ziel vollständig einmauern
  const gx = c.x + 8, gy = c.y;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (dx || dy) block(g.world, [[gx + dx, gy + dy]]);
  assert.equal(findPath(g.world, c.x, c.y, gx, gy), null);
});

test('blockiertes Ziel wird auf ein freies Nachbarfeld umgeleitet', () => {
  const g = flatGame();
  const c = center(g);
  const gx = c.x + 4, gy = c.y;
  block(g.world, [[gx, gy]]);
  const path = findPath(g.world, c.x, c.y, gx, gy);
  assert.ok(path && path.length, 'es muss ein Ersatzziel gefunden werden');
  const last = path[path.length - 1];
  assert.ok(g.world.walkable(last.x, last.y));
  assert.ok(Math.abs(last.x - gx) <= 1 && Math.abs(last.y - gy) <= 1, 'Ende liegt neben dem Ziel');
});

test('Diagonalen schneiden keine Ecken', () => {
  const g = flatGame();
  const c = center(g);
  // Enge Diagonale: beide orthogonalen Nachbarn gesperrt
  block(g.world, [[c.x + 1, c.y], [c.x, c.y + 1]]);
  const path = findPath(g.world, c.x, c.y, c.x + 1, c.y + 1);
  if (path && path.length) {
    assert.notDeepEqual(
      { x: path[0].x, y: path[0].y },
      { x: c.x + 1, y: c.y + 1 },
      'der erste Schritt darf nicht durch die Ecke schneiden',
    );
  }
});

test('Wegfindung außerhalb der Karte scheitert kontrolliert', () => {
  const g = flatGame();
  const c = center(g);
  assert.equal(findPath(g.world, c.x, c.y, -5, -5), null);
});
