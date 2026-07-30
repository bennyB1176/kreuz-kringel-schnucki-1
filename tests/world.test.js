import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/world.js';
import { TERRAIN, MAP_W, MAP_H } from '../src/config.js';
import { flatGame, center } from './helpers.js';

test('gleicher Seed erzeugt dieselbe Karte, anderer Seed eine andere', () => {
  const a = new World(1234);
  const b = new World(1234);
  const c = new World(4321);
  assert.deepEqual(Array.from(a.tiles), Array.from(b.tiles));
  assert.equal(a.nodes.size, b.nodes.size);
  assert.notDeepEqual(Array.from(a.tiles), Array.from(c.tiles));
});

test('erzeugte Karte hat die konfigurierte Größe und ist begehbar in der Mitte', () => {
  const w = new World(7);
  assert.equal(w.w, MAP_W);
  assert.equal(w.h, MAP_H);
  assert.equal(w.tiles.length, MAP_W * MAP_H);
  const cx = Math.floor(MAP_W / 2), cy = Math.floor(MAP_H / 2);
  assert.ok(w.walkable(cx, cy), 'Startfeld muss begehbar sein');
  assert.notEqual(w.terrainAt(cx, cy), TERRAIN.WATER);
});

test('Startgebiet bietet Bäume und Felsen in Reichweite', () => {
  for (const seed of [1, 2, 3, 99]) {
    const w = new World(seed);
    const cx = MAP_W / 2, cy = MAP_H / 2;
    let baum = 0, fels = 0;
    for (const n of w.nodes.values()) {
      const d = Math.hypot(n.x - cx, n.y - cy);
      if (d > 14) continue;
      if (n.type === 'baum') baum++;
      else fels++;
    }
    assert.ok(baum >= 10, `Seed ${seed}: zu wenige Bäume (${baum})`);
    assert.ok(fels >= 5, `Seed ${seed}: zu wenige Felsen (${fels})`);
  }
});

test('Wasser, Vorkommen und Gebäude blockieren Felder', () => {
  const g = flatGame();
  const w = g.world;
  const c = center(g);

  assert.ok(w.walkable(c.x, c.y));
  assert.ok(w.buildable(c.x, c.y));

  w.tiles[w.idx(c.x, c.y)] = TERRAIN.WATER;
  assert.equal(w.walkable(c.x, c.y), false);
  assert.equal(w.buildable(c.x, c.y), false);
  w.tiles[w.idx(c.x, c.y)] = TERRAIN.GRASS;

  w.addNode(c.x, c.y, 'baum');
  assert.equal(w.walkable(c.x, c.y), false);
  assert.equal(w.buildable(c.x, c.y), false);
  w.removeNode(c.x, c.y);
  assert.ok(w.walkable(c.x, c.y));

  w.occupied.set(w.key(c.x, c.y), 123);
  assert.equal(w.walkable(c.x, c.y), false);
  assert.equal(w.buildable(c.x, c.y), false);
});

test('Felder außerhalb der Karte sind weder begehbar noch bebaubar', () => {
  const w = new World(3);
  for (const [x, y] of [[-1, 0], [0, -1], [MAP_W, 0], [0, MAP_H]]) {
    assert.equal(w.inBounds(x, y), false);
    assert.equal(w.walkable(x, y), false);
    assert.equal(w.buildable(x, y), false);
  }
});

test('findNearestNode findet das nächste passende Vorkommen', () => {
  const g = flatGame();
  const w = g.world;
  const c = center(g);
  w.addNode(c.x + 2, c.y, 'baum');
  w.addNode(c.x + 6, c.y, 'baum');
  w.addNode(c.x + 1, c.y + 1, 'fels');

  const baum = w.findNearestNode(c.x, c.y, 'baum');
  assert.equal(baum.x, c.x + 2);

  const fels = w.findNearestNode(c.x, c.y, 'fels');
  assert.equal(fels.type, 'fels');

  // Radius begrenzt die Suche
  assert.equal(w.findNearestNode(c.x, c.y, 'baum', 1), null);

  // Erschöpfte Vorkommen werden übersprungen
  w.nodeAt(c.x + 2, c.y).amount = 0;
  assert.equal(w.findNearestNode(c.x, c.y, 'baum').x, c.x + 6);

  // Filter wird berücksichtigt
  assert.equal(w.findNearestNode(c.x, c.y, 'baum', Infinity, (n) => n.x > c.x + 10), null);
});

test('adjacentWalkable liefert das nächstgelegene freie Nachbarfeld', () => {
  const g = flatGame();
  const w = g.world;
  const c = center(g);

  const spot = w.adjacentWalkable(c.x, c.y, c.x - 5, c.y);
  assert.ok(spot, 'es muss ein Nachbarfeld geben');
  assert.equal(spot.x, c.x - 1, 'das dem Startpunkt nächste Feld gewinnt');

  // vollständig eingeschlossen -> null
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (dx || dy) w.occupied.set(w.key(c.x + dx, c.y + dy), 1);
  assert.equal(w.adjacentWalkable(c.x, c.y), null);
});

test('serialize/deserialize erhält Gelände und Vorkommensmengen', () => {
  const w = new World(77);
  const someNode = [...w.nodes.values()][0];
  someNode.amount = 12.5;

  const clone = World.deserialize(JSON.parse(JSON.stringify(w.serialize())));
  assert.deepEqual(Array.from(clone.tiles), Array.from(w.tiles));
  assert.deepEqual(Array.from(clone.variant), Array.from(w.variant));
  assert.equal(clone.nodes.size, w.nodes.size);
  assert.equal(clone.nodeAt(someNode.x, someNode.y).amount, 12.5);
  assert.equal(clone.nodeAt(someNode.x, someNode.y).type, someNode.type);
  assert.equal(clone.occupied.size, 0, 'Belegung wird aus den Gebäuden rekonstruiert');
});
