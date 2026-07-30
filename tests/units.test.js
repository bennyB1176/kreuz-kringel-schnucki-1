import test from 'node:test';
import assert from 'node:assert/strict';

import { UNITS } from '../src/config.js';
import { flatGame, center, finishedBuilding, tick } from './helpers.js';

test('moveTo legt einen Weg an und die Einheit erreicht das Ziel', () => {
  const g = flatGame();
  const c = center(g);
  const u = g.spawnUnit('held', c.x, c.y);
  assert.ok(u.moveTo(g, c.x + 6, c.y + 2));
  u.order = { type: 'move' };
  assert.ok(u.path.length > 0);

  tick(g, 8);
  assert.equal(Math.round(u.x), c.x + 6);
  assert.equal(Math.round(u.y), c.y + 2);
  assert.equal(u.path, null, 'Weg ist abgearbeitet');
  assert.equal(u.order.type, 'idle', 'Auftrag ist beendet');
});

test('moveTo auf ein unerreichbares Ziel schlägt fehl', () => {
  const g = flatGame();
  const c = center(g);
  const u = g.spawnUnit('held', c.x, c.y);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (dx || dy) g.world.occupied.set(g.world.key(c.x + 10 + dx, c.y + dy), 1);
  assert.equal(u.moveTo(g, c.x + 10, c.y), false);
});

test('der Held fällt einen Baum und liefert das Holz im Lager ab', () => {
  const g = flatGame();
  const c = center(g);
  finishedBuilding(g, 'lager', c.x, c.y);
  g.world.addNode(c.x + 4, c.y, 'baum');
  const baum = g.world.nodeAt(c.x + 4, c.y);
  const held = g.spawnUnit('held', c.x + 2, c.y);
  g.hero = held;
  g.resources.holz = 0;

  held.order = { type: 'gather', nodeKey: g.world.key(baum.x, baum.y) };
  tick(g, 6);
  assert.ok(baum.amount < baum.max, 'am Baum wird gearbeitet');
  assert.ok(held.carrying.amount > 0);
  assert.equal(held.carrying.res, 'holz');

  tick(g, 25);
  assert.ok(g.resources.holz > 0, 'Holz kommt im Lager an');
  assert.ok(g.resources.holz >= UNITS.held.carry, 'mindestens eine volle Ladung');
});

test('die Traglast begrenzt, wie viel eine Einheit auf einmal trägt', () => {
  const g = flatGame();
  const c = center(g);
  g.world.addNode(c.x + 1, c.y, 'baum');
  const held = g.spawnUnit('held', c.x, c.y);
  g.hero = held;
  held.order = { type: 'gather', nodeKey: g.world.key(c.x + 1, c.y) };

  tick(g, 30);
  assert.ok(held.carrying.amount <= UNITS.held.carry + 1e-6, 'Traglast wird nicht überschritten');
});

test('erschöpfte Vorkommen verschwinden von der Karte', () => {
  const g = flatGame();
  const c = center(g);
  g.world.addNode(c.x + 1, c.y, 'baum');
  const key = g.world.key(c.x + 1, c.y);
  g.world.nodes.get(key).amount = 2;
  const held = g.spawnUnit('held', c.x, c.y);
  g.hero = held;
  held.order = { type: 'gather', nodeKey: key };

  tick(g, 6);
  assert.equal(g.world.nodes.has(key), false, 'leerer Baum wird entfernt');
  assert.ok(g.world.walkable(c.x + 1, c.y), 'das Feld ist danach begehbar');
});

test('ein zugewiesener Siedler holt selbstständig Holz und liefert ab', () => {
  const g = flatGame();
  const c = center(g);
  finishedBuilding(g, 'lager', c.x, c.y);
  const hut = finishedBuilding(g, 'holzfaeller', c.x + 3, c.y);
  for (let i = 0; i < 4; i++) g.world.addNode(c.x + 5 + i, c.y + 1, 'baum');

  const worker = g.spawnUnit('siedler', c.x + 3, c.y + 2);
  g.assignSpecificWorker(hut, worker);
  g.resources.holz = 0;

  tick(g, 45);
  assert.ok(g.resources.holz > 0, 'der Arbeiter liefert Holz ab');
  assert.notEqual(worker.work.phase, 'idle');
});

test('ein Steinbrucharbeiter baut Felsen ab, keine Bäume', () => {
  const g = flatGame();
  const c = center(g);
  finishedBuilding(g, 'lager', c.x, c.y);
  const quarry = finishedBuilding(g, 'steinbruch', c.x + 3, c.y);
  g.world.addNode(c.x + 5, c.y, 'fels');
  g.world.addNode(c.x + 5, c.y + 2, 'baum');
  const baum = g.world.nodeAt(c.x + 5, c.y + 2);

  const worker = g.spawnUnit('siedler', c.x + 3, c.y + 2);
  g.assignSpecificWorker(quarry, worker);
  g.resources.stein = 0;
  g.resources.holz = 0;

  tick(g, 45);
  assert.ok(g.resources.stein > 0, 'Stein wird abgebaut');
  assert.equal(g.resources.holz, 0, 'Holz bleibt unangetastet');
  assert.equal(baum.amount, baum.max);
});

test('Arbeiter reservieren unterschiedliche Vorkommen', () => {
  const g = flatGame();
  const c = center(g);
  finishedBuilding(g, 'lager', c.x, c.y);
  const hut = finishedBuilding(g, 'holzfaeller', c.x + 3, c.y);
  g.world.addNode(c.x + 5, c.y, 'baum');
  g.world.addNode(c.x + 5, c.y + 2, 'baum');

  const w1 = g.spawnUnit('siedler', c.x + 3, c.y + 2);
  const w2 = g.spawnUnit('siedler', c.x + 3, c.y + 3);
  g.assignSpecificWorker(hut, w1);
  g.assignSpecificWorker(hut, w2);

  tick(g, 3);
  if (w1.work.nodeKey && w2.work.nodeKey) {
    assert.notEqual(w1.work.nodeKey, w2.work.nodeKey, 'zwei Arbeiter nehmen nicht denselben Baum');
  }
});

test('Arbeiter außerhalb des Arbeitsradius bleiben untätig', () => {
  const g = flatGame();
  const c = center(g);
  finishedBuilding(g, 'lager', c.x, c.y);
  const hut = finishedBuilding(g, 'holzfaeller', c.x + 3, c.y);
  g.world.addNode(c.x + 30, c.y, 'baum'); // weit außerhalb des Radius
  const baum = g.world.nodeAt(c.x + 30, c.y);

  const worker = g.spawnUnit('siedler', c.x + 3, c.y + 2);
  g.assignSpecificWorker(hut, worker);
  g.resources.holz = 0;

  tick(g, 20);
  assert.equal(g.resources.holz, 0);
  assert.equal(baum.amount, baum.max, 'der ferne Baum bleibt unberührt');
});

test('wird die Arbeitsstelle zerstört, wird der Arbeiter frei', () => {
  const g = flatGame();
  const c = center(g);
  const hut = finishedBuilding(g, 'holzfaeller', c.x, c.y);
  const worker = g.spawnUnit('siedler', c.x + 2, c.y);
  g.assignSpecificWorker(hut, worker);
  assert.equal(worker.workplace, hut.id);

  g.damage(hut, hut.maxHp);
  tick(g, 0.2);
  assert.equal(worker.workplace, null);
  assert.equal(g.idleWorkers().includes(worker), true);
});

test('Einheiten auf der Baufläche werden verdrängt statt eingemauert', () => {
  const g = flatGame();
  const c = center(g);
  const worker = g.spawnUnit('siedler', c.x, c.y);
  finishedBuilding(g, 'lager', c.x, c.y);
  assert.ok(
    g.world.walkable(Math.round(worker.x), Math.round(worker.y)),
    'der Siedler steht nach dem Bau auf einem freien Feld',
  );
});
