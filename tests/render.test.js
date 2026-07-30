/* Darstellung lässt sich nicht auf "schön" prüfen – wohl aber darauf, dass
   jeder Typ ein eigenes Erscheinungsbild hat und dass nichts abstürzt oder
   ungültige Koordinaten (NaN/Infinity) auf die Zeichenfläche schreibt. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILDINGS, UNITS } from '../src/config.js';
import { flatGame, center, finishedBuilding } from './helpers.js';
import { installCanvas, StubContext } from './canvas-stub.js';

installCanvas();
const { Renderer, BUILDING_PROPS, UNIT_STYLE } = await import('../src/render.js');

function renderer(game) {
  const ctx = new StubContext();
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const r = new Renderer(canvas, game);
  return { r, ctx };
}

test('jeder Gebäudetyp hat ein eigenes Erscheinungsbild', () => {
  for (const type of Object.keys(BUILDINGS)) {
    assert.equal(typeof BUILDING_PROPS[type], 'function', `${type} hat keine eigene Darstellung`);
  }
});

test('jede Einheit hat ein eigenes Aussehen mit vollständiger Farbpalette', () => {
  for (const type of Object.keys(UNITS)) {
    const style = UNIT_STYLE[type];
    assert.ok(style, `${type} hat kein Aussehen hinterlegt`);
    for (const feld of ['tunika', 'haut', 'kopf', 'hose']) {
      assert.match(String(style[feld]), /^#[0-9a-f]{6}$/i, `${type}.${feld} ist keine Farbe`);
    }
  }
});

test('die Einheiten sind optisch unterscheidbar', () => {
  const tuniken = Object.values(UNIT_STYLE).map((s) => s.tunika);
  assert.equal(new Set(tuniken).size, tuniken.length, 'zwei Einheiten sehen identisch aus');
});

test('alle Gebäude zeichnen fehlerfrei – fertig wie im Bau', () => {
  for (const done of [true, false]) {
    const g = flatGame();
    const c = center(g);
    let i = 0;
    for (const type of Object.keys(BUILDINGS)) {
      const b = finishedBuilding(g, type, c.x + (i % 5) * 3, c.y + Math.floor(i / 5) * 3);
      if (!done) { b.done = false; b.buildProgress = b.buildTime * 0.4; b.hp = b.maxHp * 0.5; }
      i++;
    }
    const { r, ctx } = renderer(g);
    r.draw(1.5);
    assert.ok(ctx.calls > 100, 'es wurde praktisch nichts gezeichnet');
    assert.deepEqual(ctx.badValues, [], `ungültige Koordinaten: ${ctx.badValues.slice(0, 3).join(' | ')}`);
  }
});

test('alle Einheiten zeichnen fehlerfrei – laufend, tragend, beschädigt', () => {
  const g = flatGame();
  const c = center(g);
  let i = 0;
  for (const type of Object.keys(UNITS)) {
    const u = g.spawnUnit(type, c.x + i * 2, c.y + (i % 3));
    u.hp = u.maxHp * 0.55;
    u.anim = 3.2;
    u.path = [{ x: u.x + 1, y: u.y }];
    if (i % 2 === 0) u.carrying = { res: 'holz', amount: 4 };
    if (i % 3 === 0) u.work = { phase: 'chop', nodeKey: null, timer: 0 };
    i++;
  }
  const { r, ctx } = renderer(g);
  r.draw(2.25);
  assert.deepEqual(ctx.badValues, [], `ungültige Koordinaten: ${ctx.badValues.slice(0, 3).join(' | ')}`);
});

test('Auswahl, Bauvorschau und Effekte zeichnen fehlerfrei', () => {
  const g = flatGame();
  const c = center(g);
  const b = finishedBuilding(g, 'kaserne', c.x, c.y);
  const u = g.spawnUnit('ritter', c.x + 4, c.y);
  const feind = g.spawnUnit('raeuber', c.x + 6, c.y);
  g.spawnProjectile(u.x, u.y, feind, 5, u);
  g.spawnHit(c.x + 5, c.y);
  g.spawnPuff(c.x + 5, c.y + 1, '#aabbcc');
  g.spawnFloat(c.x + 5, c.y + 2, '+1');

  const { r, ctx } = renderer(g);
  for (const sel of [{ kind: 'building', id: b.id }, { kind: 'unit', id: u.id }]) {
    g.selection = sel;
    r.draw(0.5);
  }
  g.selection = null;
  g.buildMode = 'lager';
  r.hover = { x: c.x + 8, y: c.y + 8 };
  r.draw(0.5);
  assert.deepEqual(ctx.badValues, [], `ungültige Koordinaten: ${ctx.badValues.slice(0, 3).join(' | ')}`);
});

test('auch bei starkem Zoom bleiben die Werte gültig', () => {
  const g = flatGame();
  const c = center(g);
  finishedBuilding(g, 'lager', c.x, c.y);
  g.spawnUnit('held', c.x + 2, c.y);
  const { r, ctx } = renderer(g);
  for (const zoom of [0.45, 1, 2.2]) {
    g.cam.zoom = zoom;
    r.draw(0.1);
  }
  assert.deepEqual(ctx.badValues, []);
});
