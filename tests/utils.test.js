import test from 'node:test';
import assert from 'node:assert/strict';

import { makeRng, makeNoise, clamp, lerp, dist, dist2, MinHeap, nextId, peekId, setIdCounter } from '../src/utils.js';

test('makeRng liefert für denselben Seed dieselbe Folge', () => {
  const a = makeRng(1234);
  const b = makeRng(1234);
  const c = makeRng(9999);
  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, [c(), c(), c(), c()]);
});

test('makeRng bleibt im Bereich [0,1)', () => {
  const rng = makeRng(7);
  for (let i = 0; i < 500; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `Wert außerhalb: ${v}`);
  }
});

test('makeNoise ist deterministisch und normiert', () => {
  const n1 = makeNoise(5);
  const n2 = makeNoise(5);
  for (let i = 0; i < 50; i++) {
    const x = i * 1.7, y = i * 0.3;
    const v = n1(x, y);
    assert.equal(v, n2(x, y));
    assert.ok(v >= 0 && v <= 1, `Rauschen außerhalb [0,1]: ${v}`);
  }
});

test('clamp, lerp und dist rechnen korrekt', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-5, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
  assert.equal(lerp(0, 10, 0.25), 2.5);
  assert.equal(dist(0, 0, 3, 4), 5);
  assert.equal(dist2(0, 0, 3, 4), 25);
});

test('MinHeap gibt Elemente nach Priorität aus', () => {
  const h = new MinHeap();
  const prios = [5, 1, 4, 1, 9, 3, 0, 7];
  prios.forEach((p, i) => h.push(`n${i}`, p));
  assert.equal(h.size, prios.length);
  const out = [];
  while (h.size) out.push(h.pop());
  const sorted = prios.map((p, i) => ({ p, n: `n${i}` })).sort((a, b) => a.p - b.p).map((o) => o.p);
  const outPrios = out.map((n) => prios[Number(n.slice(1))]);
  assert.deepEqual(outPrios, sorted);
});

test('MinHeap.pop auf leerem Heap wirft nicht', () => {
  const h = new MinHeap();
  assert.equal(h.size, 0);
  assert.equal(h.pop(), undefined);
});

test('IDs sind eindeutig und aufsteigend', () => {
  const a = nextId();
  const b = nextId();
  assert.ok(b > a);
  assert.equal(peekId(), b + 1);
  setIdCounter(b + 500);
  assert.ok(nextId() >= b + 500);
  // setIdCounter darf den Zähler nie zurücksetzen
  const high = nextId();
  setIdCounter(1);
  assert.ok(nextId() > high);
});
