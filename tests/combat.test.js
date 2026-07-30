import test from 'node:test';
import assert from 'node:assert/strict';

import { WAVE, UNITS } from '../src/config.js';
import { flatGame, center, finishedBuilding, tick } from './helpers.js';

test('Schaden reduziert Trefferpunkte und tötet bei null', () => {
  const g = flatGame();
  const c = center(g);
  const feind = g.spawnUnit('raeuber', c.x, c.y);
  g.damage(feind, 10);
  assert.equal(feind.hp, UNITS.raeuber.hp - 10);
  assert.ok(feind.alive);

  g.damage(feind, UNITS.raeuber.hp);
  assert.equal(feind.alive, false);
  assert.equal(g.stats.killed, 1);

  tick(g, 0.2);
  assert.equal(g.units.includes(feind), false, 'tote Einheiten werden entfernt');
});

test('zerstörte Gebäude geben ihre Felder frei', () => {
  const g = flatGame();
  const c = center(g);
  const lager = finishedBuilding(g, 'lager', c.x, c.y);
  const felder = lager.tiles();

  g.damage(lager, lager.maxHp);
  tick(g, 0.2);

  assert.equal(g.buildings.includes(lager), false);
  for (const [x, y] of felder) {
    assert.ok(g.world.walkable(x, y), `Feld ${x},${y} muss wieder frei sein`);
  }
});

test('Soldaten greifen Feinde in Reichweite selbstständig an', () => {
  const g = flatGame();
  const c = center(g);
  const ritter = g.spawnUnit('ritter', c.x, c.y);
  const feind = g.spawnUnit('raeuber', c.x + 3, c.y);
  feind.aiTargetId = null;

  const hpVorher = feind.hp;
  tick(g, 6);
  assert.ok(feind.hp < hpVorher, 'der Ritter greift an');
  assert.ok(ritter.alive);
});

test('Bogenschützen treffen aus der Ferne über Projektile', () => {
  const g = flatGame();
  const c = center(g);
  const bogen = g.spawnUnit('bogen', c.x, c.y);
  const feind = g.spawnUnit('raeuber', c.x + 5, c.y);
  const hpVorher = feind.hp;

  g.update(1 / 30);
  assert.ok(g.projectiles.length > 0, 'ein Pfeil ist unterwegs');
  assert.ok(bogen.attackCd > 0);

  tick(g, 3);
  assert.ok(feind.hp < hpVorher, 'der Pfeil verursacht Schaden');
});

test('Projektile auf tote Ziele verschwinden folgenlos', () => {
  const g = flatGame();
  const c = center(g);
  const bogen = g.spawnUnit('bogen', c.x, c.y);
  const feind = g.spawnUnit('raeuber', c.x + 6, c.y);
  g.spawnProjectile(bogen.x, bogen.y, feind, 5, bogen);
  feind.hp = 0;

  tick(g, 2);
  assert.equal(g.projectiles.length, 0);
});

test('Feinde greifen Gebäude an, wenn keine Einheit näher ist', () => {
  const g = flatGame();
  const c = center(g);
  const lager = finishedBuilding(g, 'lager', c.x, c.y);
  g.spawnUnit('raeuber', c.x + 6, c.y + 6);

  const hpVorher = lager.hp;
  tick(g, 20);
  assert.ok(lager.hp < hpVorher, 'das Lager nimmt Schaden');
});

test('fliehende Siedler locken Angreifer nicht von der Siedlung weg', () => {
  const g = flatGame();
  const c = center(g);
  const lager = finishedBuilding(g, 'lager', c.x, c.y);
  // Zivilisten in der Nähe, die vor Feinden davonlaufen
  g.spawnUnit('siedler', c.x + 3, c.y + 3);
  g.spawnUnit('siedler', c.x + 4, c.y + 4);
  g.spawnUnit('raeuber', c.x + 10, c.y + 10);

  const hpVorher = lager.hp;
  tick(g, 40);
  assert.ok(lager.hp < hpVorher, 'die Siedlung muss angegriffen werden');
});

test('Feinde wenden sich gegen Verteidiger, die ihnen direkt gegenüberstehen', () => {
  const g = flatGame();
  const c = center(g);
  finishedBuilding(g, 'lager', c.x, c.y);
  const ritter = g.spawnUnit('ritter', c.x + 9, c.y);
  const feind = g.spawnUnit('raeuber', c.x + 11, c.y);

  tick(g, 3);
  assert.equal(feind.aiTargetId, ritter.id, 'das nahe Ziel hat Vorrang');
});

test('Angreifer sind schnell genug, um fliehende Zivilisten einzuholen', () => {
  const g = flatGame();
  const c = center(g);
  const siedler = g.spawnUnit('siedler', c.x, c.y);
  const feind = g.spawnUnit('raeuber', c.x + 3, c.y);

  const hpVorher = siedler.hp;
  tick(g, 40);
  assert.ok(siedler.hp < hpVorher, 'ein fliehender Siedler darf nicht unangreifbar sein');
});

test('der gefallene Held kehrt nach einer Weile zurück', () => {
  const g = flatGame();
  const c = center(g);
  finishedBuilding(g, 'lager', c.x, c.y);
  const held = g.spawnUnit('held', c.x + 4, c.y + 4);
  g.hero = held;

  g.damage(held, held.maxHp);
  assert.equal(held.alive, false);
  tick(g, 1);
  assert.ok(g.units.includes(held), 'der Held bleibt im Spiel');

  tick(g, 14);
  assert.ok(held.alive, 'der Held ist zurück');
  assert.equal(held.hp, held.maxHp);
});

test('Angriffswellen starten zur konfigurierten Zeit und werden stärker', () => {
  const g = flatGame();
  const c = center(g);
  finishedBuilding(g, 'lager', c.x, c.y);
  g.nextWaveAt = WAVE.firstAt;
  g.time = WAVE.firstAt - 0.1;

  assert.equal(g.waveNumber, 0);
  g.update(0.2);
  assert.equal(g.waveNumber, 1);
  const ersteWelle = g.units.filter((u) => u.enemy).length;
  assert.ok(ersteWelle >= WAVE.baseCount, 'die erste Welle bringt Angreifer');
  assert.ok(g.nextWaveAt > g.time, 'die nächste Welle ist eingeplant');

  // zweite Welle erzwingen
  for (const u of g.units.filter((x) => x.enemy)) u.hp = 0;
  tick(g, 0.2);
  g.time = g.nextWaveAt - 0.1;
  g.update(0.2);
  assert.equal(g.waveNumber, 2);
  const zweiteWelle = g.units.filter((u) => u.enemy).length;
  assert.ok(zweiteWelle >= ersteWelle, `Welle 2 (${zweiteWelle}) darf nicht schwächer sein als Welle 1 (${ersteWelle})`);
});

test('Feinde erscheinen auf begehbaren Feldern am Kartenrand', () => {
  const g = flatGame();
  const c = center(g);
  finishedBuilding(g, 'lager', c.x, c.y);
  g.time = WAVE.firstAt;
  g.nextWaveAt = WAVE.firstAt;
  g.update(0.1);

  const feinde = g.units.filter((u) => u.enemy);
  assert.ok(feinde.length > 0);
  for (const f of feinde) {
    assert.ok(g.world.inBounds(Math.round(f.x), Math.round(f.y)));
    const randabstand = Math.min(f.x, f.y, g.world.w - 1 - f.x, g.world.h - 1 - f.y);
    assert.ok(randabstand <= 3, 'Feinde starten am Rand');
  }
});

test('Türme und Soldaten wehren eine kleine Welle ab', () => {
  const g = flatGame();
  const c = center(g);
  finishedBuilding(g, 'lager', c.x, c.y);
  finishedBuilding(g, 'turm', c.x + 3, c.y);
  g.spawnUnit('ritter', c.x + 2, c.y + 2);
  for (let i = 0; i < 3; i++) g.spawnUnit('raeuber', c.x + 8 + i, c.y + 8);

  tick(g, 40);
  assert.equal(g.units.filter((u) => u.enemy && u.alive).length, 0, 'alle Angreifer sind erledigt');
  assert.ok(g.buildings.length >= 2, 'die Gebäude stehen noch');
});
