import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILDINGS, UNITS, START_RESOURCES, BASE_POP_CAP, BASE_STORAGE } from '../src/config.js';
import { flatGame, center, finishedBuilding, tick } from './helpers.js';

test('neues Spiel startet mit den konfigurierten Rohstoffen', () => {
  const g = flatGame();
  assert.deepEqual(g.resources, { ...START_RESOURCES });
});

test('canAfford und pay behandeln Kosten korrekt', () => {
  const g = flatGame();
  g.resources.holz = 50;
  assert.ok(g.canAfford({ holz: 50 }));
  assert.ok(!g.canAfford({ holz: 51 }));
  assert.ok(g.canAfford({}));
  assert.ok(g.canAfford(null));
  g.pay({ holz: 20 });
  assert.equal(g.resources.holz, 30);
});

test('Lagerlimit begrenzt die Rohstoffe und wächst mit Lagerhäusern', () => {
  const g = flatGame();
  const c = center(g);
  assert.equal(g.storageCap, BASE_STORAGE);

  g.resources.holz = 0;
  g.addResource('holz', BASE_STORAGE + 500);
  assert.equal(g.resources.holz, BASE_STORAGE, 'über dem Limit wird abgeschnitten');

  finishedBuilding(g, 'lager', c.x, c.y);
  assert.equal(g.storageCap, BASE_STORAGE + BUILDINGS.lager.storage);
  g.addResource('holz', 100);
  assert.equal(g.resources.holz, BASE_STORAGE + 100);
});

test('unfertige Lagerhäuser zählen noch nicht zum Limit', () => {
  const g = flatGame();
  const c = center(g);
  g.resources.holz = 999;
  g.resources.stein = 999;
  const res = g.tryBuild('lager', c.x, c.y);
  assert.ok(res.ok);
  assert.equal(g.storageCap, BASE_STORAGE, 'Baustelle lagert noch nichts');
  tick(g, BUILDINGS.lager.buildTime + 1);
  assert.equal(g.storageCap, BASE_STORAGE + BUILDINGS.lager.storage);
});

test('Rohstoffe werden auf das Limit gekappt, wenn Lagerraum verloren geht', () => {
  const g = flatGame();
  const c = center(g);
  const lager = finishedBuilding(g, 'lager', c.x, c.y);
  g.resources.holz = 0;
  g.addResource('holz', BASE_STORAGE + 200);
  assert.equal(g.resources.holz, BASE_STORAGE + 200);

  g.damage(lager, lager.maxHp); // Lager wird zerstört
  tick(g, 0.2);
  assert.equal(g.resources.holz, BASE_STORAGE, 'Überschuss geht mit dem Lager verloren');
});

test('Bevölkerungsgrenze wächst mit Wohnhäusern', () => {
  const g = flatGame();
  const c = center(g);
  assert.equal(g.popCap, BASE_POP_CAP);
  finishedBuilding(g, 'haus', c.x, c.y);
  assert.equal(g.popCap, BASE_POP_CAP + BUILDINGS.haus.popCap);
  finishedBuilding(g, 'haus', c.x + 2, c.y);
  assert.equal(g.popCap, BASE_POP_CAP + 2 * BUILDINGS.haus.popCap);
});

test('Bevölkerung zählt Einheiten und laufende Ausbildungen', () => {
  const g = flatGame();
  const c = center(g);
  assert.equal(g.popUsed, 0);
  g.spawnUnit('held', c.x, c.y);
  assert.equal(g.popUsed, 0, 'der Held kostet keinen Wohnraum');
  g.spawnUnit('siedler', c.x + 1, c.y);
  assert.equal(g.popUsed, 1);

  const lager = finishedBuilding(g, 'lager', c.x + 3, c.y);
  g.resources.holz = 500;
  g.resources.nahrung = 500;
  assert.ok(g.queueUnit(lager, 'siedler'));
  assert.equal(g.popUsed, 2, 'Einheiten in Ausbildung belegen bereits Platz');
});

test('Feinde belegen keinen Wohnraum', () => {
  const g = flatGame();
  const c = center(g);
  g.spawnUnit('raeuber', c.x, c.y);
  assert.equal(g.popUsed, 0);
});

test('tryBuild prüft Platz und Kosten und bucht nur bei Erfolg ab', () => {
  const g = flatGame();
  const c = center(g);
  g.resources = { holz: 10, stein: 0, bretter: 0, quader: 0, werkzeug: 0, nahrung: 0 };

  const zuTeuer = g.tryBuild('holzfaeller', c.x, c.y);
  assert.equal(zuTeuer.ok, false);
  assert.match(zuTeuer.msg, /Rohstoffe/);
  assert.equal(g.resources.holz, 10, 'fehlgeschlagener Bau kostet nichts');

  g.resources.holz = 100;
  const ok = g.tryBuild('holzfaeller', c.x, c.y);
  assert.equal(ok.ok, true);
  assert.equal(g.resources.holz, 100 - BUILDINGS.holzfaeller.cost.holz);
  assert.equal(ok.building.done, false, 'Gebäude startet als Baustelle');

  const belegt = g.tryBuild('holzfaeller', c.x, c.y);
  assert.equal(belegt.ok, false);
  assert.match(belegt.msg, /Platz/);
});

test('mehrfeldrige Gebäude belegen alle Felder', () => {
  const g = flatGame();
  const c = center(g);
  const b = finishedBuilding(g, 'lager', c.x, c.y);
  assert.equal(b.size, 2);
  assert.deepEqual(b.tiles().sort(), [[c.x, c.y], [c.x + 1, c.y], [c.x, c.y + 1], [c.x + 1, c.y + 1]].sort());
  for (const [x, y] of b.tiles()) assert.equal(g.world.buildable(x, y), false);
  assert.equal(g.canBuildHere('haus', c.x + 1, c.y + 1), false, 'Überlappung ist verboten');
});

test('Abriss erstattet die Hälfte, gibt Felder und Arbeiter frei', () => {
  const g = flatGame();
  const c = center(g);
  const hut = finishedBuilding(g, 'holzfaeller', c.x, c.y);
  const worker = g.spawnUnit('siedler', c.x + 2, c.y);
  assert.ok(g.assignWorker(hut));
  assert.equal(worker.workplace, hut.id);

  g.resources.holz = 0;
  g.demolish(hut);

  assert.equal(g.resources.holz, Math.floor(BUILDINGS.holzfaeller.cost.holz / 2));
  assert.equal(g.buildings.includes(hut), false);
  assert.ok(g.world.buildable(c.x, c.y), 'Feld ist wieder frei');
  assert.equal(worker.workplace, null, 'Arbeiter wird freigestellt');
});

test('Abriss erstattet auch noch laufende Ausbildungen', () => {
  const g = flatGame();
  const c = center(g);
  const kaserne = finishedBuilding(g, 'kaserne', c.x, c.y);
  finishedBuilding(g, 'haus', c.x + 4, c.y);
  g.resources = { holz: 0, stein: 0, bretter: 0, quader: 200, werkzeug: 50, nahrung: 200 };
  assert.ok(g.queueUnit(kaserne, 'ritter'));
  const nachKauf = { ...g.resources };

  // Erwartung: volle Erstattung der Ausbildung plus die Hälfte der Baukosten
  const erwartet = { ...nachKauf };
  for (const [res, amt] of Object.entries(UNITS.ritter.cost)) erwartet[res] += amt;
  for (const [res, amt] of Object.entries(BUILDINGS.kaserne.cost)) erwartet[res] += Math.floor(amt / 2);

  g.demolish(kaserne);
  assert.deepEqual(g.resources, erwartet);
  assert.equal(kaserne.trainQueue.length, 0);
});

test('Ausbildung scheitert ohne Wohnraum und ohne Rohstoffe – ohne Abbuchung', () => {
  const g = flatGame();
  const c = center(g);
  const lager = finishedBuilding(g, 'lager', c.x, c.y);
  g.resources = { holz: 0, stein: 0, bretter: 0, quader: 0, werkzeug: 0, nahrung: 0 };
  assert.equal(g.queueUnit(lager, 'siedler'), false);

  g.resources.holz = 500;
  g.resources.nahrung = 500;
  // Bevölkerungsgrenze ausschöpfen
  for (let i = 0; i < BASE_POP_CAP; i++) g.spawnUnit('siedler', c.x + 3 + i, c.y + 3);
  const vorher = { ...g.resources };
  assert.equal(g.queueUnit(lager, 'siedler'), false, 'kein Platz mehr');
  assert.deepEqual(g.resources, vorher, 'gescheiterte Ausbildung kostet nichts');
});

test('abgebrochene Ausbildung erstattet die vollen Kosten', () => {
  const g = flatGame();
  const c = center(g);
  const lager = finishedBuilding(g, 'lager', c.x, c.y);
  g.resources.holz = 200;
  g.resources.nahrung = 200;
  const vorher = { ...g.resources };
  g.queueUnit(lager, 'siedler');
  assert.equal(lager.trainQueue.length, 1);
  g.cancelTraining(lager, 0);
  assert.equal(lager.trainQueue.length, 0);
  assert.equal(g.resources.holz, vorher.holz);
  assert.equal(g.resources.nahrung, vorher.nahrung);
});
