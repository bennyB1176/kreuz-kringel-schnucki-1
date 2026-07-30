import test from 'node:test';
import assert from 'node:assert/strict';

import { installLocalStorage, flatGame, center, finishedBuilding, tick } from './helpers.js';
import { SAVE_KEY } from '../src/config.js';
import { Game } from '../src/game.js';
import { saveGame, loadGame, hasSave, clearSave, saveInfo } from '../src/save.js';

installLocalStorage();

function aufgebautesSpiel() {
  const g = flatGame(11);
  const c = center(g);
  const lager = finishedBuilding(g, 'lager', c.x, c.y);
  const hut = finishedBuilding(g, 'holzfaeller', c.x + 4, c.y);
  g.world.addNode(c.x + 6, c.y, 'baum');
  g.world.nodeAt(c.x + 6, c.y).amount = 17;
  g.hero = g.spawnUnit('held', c.x + 2, c.y + 2);
  const worker = g.spawnUnit('siedler', c.x + 4, c.y + 2);
  g.assignSpecificWorker(hut, worker);
  g.resources = { holz: 111, stein: 22, bretter: 3, quader: 4, werkzeug: 5, nahrung: 66 };
  g.time = 123.5;
  g.waveNumber = 2;
  return { g, c, lager, hut, worker };
}

test('hasSave meldet erst nach dem Speichern einen Spielstand', () => {
  localStorage.clear();
  assert.equal(hasSave(), false);
  const { g } = aufgebautesSpiel();
  assert.ok(saveGame(g));
  assert.ok(hasSave());
});

test('Speichern und Laden erhält Rohstoffe, Zeit und Wellenstand', () => {
  localStorage.clear();
  const { g } = aufgebautesSpiel();
  saveGame(g);
  const geladen = loadGame();

  assert.ok(geladen instanceof Game);
  assert.deepEqual(geladen.resources, g.resources);
  assert.equal(geladen.time, g.time);
  assert.equal(geladen.waveNumber, g.waveNumber);
  assert.equal(geladen.world.seed, g.world.seed);
});

test('Gebäude, Arbeitsstellen und Belegung überstehen das Laden', () => {
  localStorage.clear();
  const { g, hut, worker } = aufgebautesSpiel();
  saveGame(g);
  const geladen = loadGame();

  assert.equal(geladen.buildings.length, g.buildings.length);
  const hutNeu = geladen.buildings.find((b) => b.type === 'holzfaeller');
  assert.ok(hutNeu);
  assert.equal(hutNeu.x, hut.x);
  assert.equal(hutNeu.y, hut.y);
  assert.equal(hutNeu.done, true);
  assert.deepEqual(hutNeu.workers, [worker.id]);

  const workerNeu = geladen.getUnit(worker.id);
  assert.ok(workerNeu, 'der Arbeiter existiert weiter');
  assert.equal(workerNeu.workplace, hutNeu.id);

  for (const b of geladen.buildings)
    for (const [x, y] of b.tiles())
      assert.equal(geladen.world.occupied.get(geladen.world.key(x, y)), b.id, 'Belegungskarte ist rekonstruiert');
});

test('Vorkommen behalten ihren Restbestand', () => {
  localStorage.clear();
  const { g, c } = aufgebautesSpiel();
  saveGame(g);
  const geladen = loadGame();
  assert.equal(geladen.world.nodeAt(c.x + 6, c.y).amount, 17);
  assert.equal(geladen.world.nodes.size, g.world.nodes.size);
});

test('der Held wird beim Laden wiedergefunden', () => {
  localStorage.clear();
  const { g } = aufgebautesSpiel();
  saveGame(g);
  const geladen = loadGame();
  assert.ok(geladen.hero, 'ein Held muss existieren');
  assert.equal(geladen.hero.type, 'held');
  assert.equal(geladen.hero.id, g.hero.id);
});

test('nach dem Laden kollidieren neue IDs nicht mit alten', () => {
  localStorage.clear();
  const { g } = aufgebautesSpiel();
  saveGame(g);
  const geladen = loadGame();
  const bekannt = new Set([...geladen.units.map((u) => u.id), ...geladen.buildings.map((b) => b.id)]);

  const c = center(geladen);
  const neu = geladen.spawnUnit('siedler', c.x + 8, c.y + 8);
  assert.equal(bekannt.has(neu.id), false, `ID ${neu.id} wurde doppelt vergeben`);
  const neuesGebaeude = finishedBuilding(geladen, 'haus', c.x + 10, c.y + 10);
  assert.equal(bekannt.has(neuesGebaeude.id), false);
});

test('ein geladenes Spiel läuft ohne Fehler weiter', () => {
  localStorage.clear();
  const { g } = aufgebautesSpiel();
  saveGame(g);
  const geladen = loadGame();
  geladen.on('toast', () => {});
  geladen.nextWaveAt = Infinity;
  geladen.resources.holz = 0;

  tick(geladen, 30);
  assert.ok(geladen.resources.holz > 0, 'der geladene Arbeiter nimmt die Arbeit wieder auf');
});

test('beschädigte Spielstände führen nicht zum Absturz', () => {
  localStorage.clear();
  localStorage.setItem(SAVE_KEY, '{kaputt');
  assert.equal(loadGame(), null);
  assert.equal(saveInfo(), null);
});

test('saveInfo liefert eine Kurzübersicht, clearSave entfernt alles', () => {
  localStorage.clear();
  const { g } = aufgebautesSpiel();
  saveGame(g);
  const info = saveInfo();
  assert.ok(info.savedAt > 0);
  assert.equal(info.buildings, g.buildings.length);
  assert.equal(info.wave, g.waveNumber);

  clearSave();
  assert.equal(hasSave(), false);
  assert.equal(loadGame(), null);
});
