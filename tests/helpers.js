/* Gemeinsame Testhilfen: deterministische Spielwelt ohne Zufallsgelände. */

import { Game } from '../src/game.js';
import { TERRAIN } from '../src/config.js';

/**
 * Spiel mit vollständig flacher Graswelt, ohne Vorkommen und ohne Wellen.
 * Damit sind Tests unabhängig von der prozeduralen Kartengenerierung.
 */
export function flatGame(seed = 42) {
  const g = new Game(seed);
  g.world.tiles.fill(TERRAIN.GRASS);
  g.world.nodes.clear();
  g.world.occupied.clear();
  g.nextWaveAt = Infinity; // Wellen stören die meisten Tests
  g.on('toast', () => {});
  return g;
}

/** Mitte der Karte – bequemer Ankerpunkt für Testaufbauten. */
export function center(game) {
  return { x: Math.floor(game.world.w / 2), y: Math.floor(game.world.h / 2) };
}

/** Simuliert `seconds` Spielzeit in festen Schritten. */
export function tick(game, seconds, step = 1 / 30) {
  const steps = Math.round(seconds / step);
  for (let i = 0; i < steps; i++) game.update(step);
}

/** Fertiges Gebäude ohne Bauzeit platzieren (Kosten werden ignoriert). */
export function finishedBuilding(game, type, x, y) {
  const b = game.placeBuildingRaw(type, x, y);
  b.done = true;
  b.hp = b.maxHp;
  b.buildProgress = b.buildTime;
  return b;
}

/** Einfacher localStorage-Ersatz für Node. */
export function installLocalStorage() {
  const store = new Map();
  const mock = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    get length() { return store.size; },
  };
  globalThis.localStorage = mock;
  return mock;
}
