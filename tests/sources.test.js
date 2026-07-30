/* Statische Prüfungen über alle Quelldateien – fängt Syntaxfehler auch in den
   Modulen ab, die eine DOM-Umgebung brauchen und daher nicht importiert werden. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');
const sources = readdirSync(srcDir).filter((f) => f.endsWith('.js'));

test('es gibt Quelldateien zu prüfen', () => {
  assert.ok(sources.length >= 10, `nur ${sources.length} Dateien gefunden`);
});

for (const file of sources) {
  test(`src/${file} ist syntaktisch gültig`, () => {
    execFileSync(process.execPath, ['--check', join(srcDir, file)], { stdio: 'pipe' });
  });
}

test('kein Quellcode enthält versehentliche Debug-Ausgaben', () => {
  const treffer = [];
  for (const file of sources) {
    const text = readFileSync(join(srcDir, file), 'utf8');
    text.split('\n').forEach((line, i) => {
      if (/console\.(log|debug|dir)\s*\(/.test(line)) treffer.push(`src/${file}:${i + 1}`);
    });
  }
  assert.deepEqual(treffer, [], `Debug-Ausgaben gefunden: ${treffer.join(', ')}`);
});

test('index.html bindet nur lokale Skripte ein', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const externe = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]).filter((s) => /^https?:/.test(s));
  assert.deepEqual(externe, [], 'das Spiel muss ohne externe Abhängigkeiten laufen');
});

test('jedes in index.html referenzierte Modul existiert', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(scripts.length > 0);
  for (const s of scripts) {
    assert.doesNotThrow(() => readFileSync(join(root, s), 'utf8'), `${s} fehlt`);
  }
});
