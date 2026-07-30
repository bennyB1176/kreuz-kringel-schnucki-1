import test from 'node:test';
import assert from 'node:assert/strict';

import { canPlace } from '../src/buildings.js';
import { BUILDINGS, UNITS } from '../src/config.js';
import { flatGame, center, finishedBuilding, tick } from './helpers.js';

test('canPlace prüft die gesamte Grundfläche', () => {
  const g = flatGame();
  const c = center(g);
  assert.ok(canPlace(g.world, 'lager', c.x, c.y));
  g.world.occupied.set(g.world.key(c.x + 1, c.y + 1), 1);
  assert.equal(canPlace(g.world, 'lager', c.x, c.y), false, 'ein belegtes Eckfeld genügt');
  assert.ok(canPlace(g.world, 'haus', c.x, c.y), 'einfeldrige Gebäude passen weiterhin');
});

test('Baustelle wird nach der Bauzeit fertig und voll instand', () => {
  const g = flatGame();
  const c = center(g);
  g.resources.holz = 500;
  const b = g.tryBuild('holzfaeller', c.x, c.y).building;
  assert.equal(b.done, false);
  assert.ok(b.hp < b.maxHp);

  tick(g, BUILDINGS.holzfaeller.buildTime / 2);
  assert.equal(b.done, false);
  assert.ok(b.progressRatio() > 0.4 && b.progressRatio() < 0.6);

  tick(g, BUILDINGS.holzfaeller.buildTime / 2 + 0.5);
  assert.equal(b.done, true);
  assert.equal(b.hp, b.maxHp);
  assert.equal(b.progressRatio(), 1);
});

test('Sägewerk veredelt Holz zu Brettern, sobald ein Arbeiter da ist', () => {
  const g = flatGame();
  const c = center(g);
  const saw = finishedBuilding(g, 'saegewerk', c.x, c.y);
  const worker = g.spawnUnit('siedler', c.x + 2, c.y + 2);
  g.assignSpecificWorker(saw, worker);
  g.resources.holz = 100;
  g.resources.bretter = 0;

  tick(g, 20);
  assert.ok(g.resources.bretter > 0, 'es müssen Bretter entstehen');
  assert.ok(g.resources.holz < 100, 'Holz wird verbraucht');
  // Zwei Holz je Brett; ein bereits gebuchter, noch laufender Durchgang zählt mit.
  const verbraucht = 100 - g.resources.holz;
  const laufend = saw.prodActive ? 1 : 0;
  assert.equal(verbraucht, (g.resources.bretter + laufend) * 2, 'zwei Holz ergeben ein Brett');
});

test('Produktion ohne Arbeiter läuft nicht und verliert keine Rohstoffe', () => {
  const g = flatGame();
  const c = center(g);
  const saw = finishedBuilding(g, 'saegewerk', c.x, c.y);
  g.resources.holz = 100;
  g.resources.bretter = 0;

  tick(g, 15);
  assert.equal(g.resources.bretter, 0, 'ohne Arbeiter keine Produktion');
  assert.equal(g.resources.holz, 100, 'ohne Arbeiter kein Verbrauch');
  assert.equal(saw.prodActive, false);
});

test('verlässt der Arbeiter die Produktion, gehen eingesetzte Rohstoffe nicht verloren', () => {
  const g = flatGame();
  const c = center(g);
  const saw = finishedBuilding(g, 'saegewerk', c.x, c.y);
  const worker = g.spawnUnit('siedler', c.x, c.y + 1);
  g.assignSpecificWorker(saw, worker);
  g.resources.holz = 10;
  g.resources.bretter = 0;

  tick(g, 1); // Produktion startet, Eingang wird gebucht
  assert.equal(saw.prodActive, true, 'Produktion läuft an');
  const holzNachStart = g.resources.holz;

  g.removeWorker(saw); // Arbeiter wird abgezogen
  tick(g, 10);

  const verbraucht = 10 - g.resources.holz;
  const erzeugt = g.resources.bretter;
  assert.equal(verbraucht, erzeugt * 2, `verbrauchtes Holz (${verbraucht}) passt nicht zu ${erzeugt} Brettern`);
  assert.ok(holzNachStart >= 0);
});

test('Produktion ruht, wenn die Eingangsstoffe fehlen', () => {
  const g = flatGame();
  const c = center(g);
  const forge = finishedBuilding(g, 'schmiede', c.x, c.y);
  const worker = g.spawnUnit('siedler', c.x, c.y + 1);
  g.assignSpecificWorker(forge, worker);
  g.resources.bretter = 0;
  g.resources.quader = 0;
  g.resources.werkzeug = 0;

  tick(g, 12);
  assert.equal(g.resources.werkzeug, 0);
  assert.equal(forge.prodActive, false);

  g.resources.bretter = 10;
  g.resources.quader = 10;
  tick(g, 20);
  assert.ok(g.resources.werkzeug > 0, 'mit Nachschub wird wieder produziert');
});

test('Ausbildung erzeugt nach Ablauf eine Einheit auf einem begehbaren Feld', () => {
  const g = flatGame();
  const c = center(g);
  const kaserne = finishedBuilding(g, 'kaserne', c.x, c.y);
  finishedBuilding(g, 'haus', c.x + 5, c.y + 5);
  g.resources = { holz: 0, stein: 0, bretter: 0, quader: 500, werkzeug: 50, nahrung: 500 };

  assert.ok(g.queueUnit(kaserne, 'ritter'));
  assert.equal(kaserne.trainQueue.length, 1);

  tick(g, UNITS.ritter.trainTime - 1);
  assert.equal(g.units.filter((u) => u.type === 'ritter').length, 0, 'noch nicht fertig');

  tick(g, 2);
  const ritter = g.units.filter((u) => u.type === 'ritter');
  assert.equal(ritter.length, 1);
  assert.equal(kaserne.trainQueue.length, 0);
  assert.ok(g.world.walkable(Math.round(ritter[0].x), Math.round(ritter[0].y)), 'Einheit steht auf freiem Feld');
});

test('Warteschlange ist begrenzt', () => {
  const g = flatGame();
  const c = center(g);
  const lager = finishedBuilding(g, 'lager', c.x, c.y);
  for (let i = 0; i < 6; i++) finishedBuilding(g, 'haus', c.x + 4 + i * 2, c.y + 6);
  g.resources.holz = 9999;
  g.resources.nahrung = 9999;
  let ok = 0;
  for (let i = 0; i < 8; i++) if (g.queueUnit(lager, 'siedler')) ok++;
  assert.equal(ok, 5, 'maximal fünf Einträge');
  assert.equal(lager.trainQueue.length, 5);
});

test('Wachturm beschießt Feinde nur in Reichweite', () => {
  const g = flatGame();
  const c = center(g);
  const turm = finishedBuilding(g, 'turm', c.x, c.y);
  const weit = g.spawnUnit('raeuber', c.x + 20, c.y);
  weit.order = { type: 'idle' };

  tick(g, 3);
  assert.equal(g.projectiles.length, 0, 'außerhalb der Reichweite kein Beschuss');

  const nah = g.spawnUnit('raeuber', c.x + 3, c.y);
  const hpVorher = nah.hp;
  tick(g, 5);
  assert.ok(nah.hp < hpVorher, 'Feind in Reichweite nimmt Schaden');
  assert.ok(turm.towerCd >= 0);
});

test('Mauern blockieren den Weg', () => {
  const g = flatGame();
  const c = center(g);
  const mauer = finishedBuilding(g, 'mauer', c.x, c.y);
  assert.equal(g.world.walkable(c.x, c.y), false);
  g.demolish(mauer);
  assert.equal(g.world.walkable(c.x, c.y), true);
});

test('Arbeiterzuweisung respektiert die Obergrenze', () => {
  const g = flatGame();
  const c = center(g);
  const hut = finishedBuilding(g, 'holzfaeller', c.x, c.y);
  for (let i = 0; i < 5; i++) g.spawnUnit('siedler', c.x + 3 + i, c.y + 3);

  let assigned = 0;
  for (let i = 0; i < 5; i++) if (g.assignWorker(hut)) assigned++;
  assert.equal(assigned, BUILDINGS.holzfaeller.maxWorkers);
  assert.equal(hut.workers.length, BUILDINGS.holzfaeller.maxWorkers);

  g.removeWorker(hut);
  assert.equal(hut.workers.length, BUILDINGS.holzfaeller.maxWorkers - 1);
  assert.equal(g.idleWorkers().length, 5 - (BUILDINGS.holzfaeller.maxWorkers - 1));
});

test('ein Siedler arbeitet immer nur an einer Stelle', () => {
  const g = flatGame();
  const c = center(g);
  const hut = finishedBuilding(g, 'holzfaeller', c.x, c.y);
  const quarry = finishedBuilding(g, 'steinbruch', c.x + 4, c.y);
  const worker = g.spawnUnit('siedler', c.x + 2, c.y + 2);

  g.assignSpecificWorker(hut, worker);
  g.assignSpecificWorker(quarry, worker);

  assert.equal(worker.workplace, quarry.id);
  assert.equal(hut.workers.includes(worker.id), false, 'alte Arbeitsstelle wird geräumt');
  assert.equal(quarry.workers.length, 1);
});
