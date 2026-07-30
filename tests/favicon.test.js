/* Das Spiel braucht ein eigenes Symbol – in allen Größen, die Browser und
   Startbildschirme anfordern, und ohne Verweise nach außen. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pfad = (p) => join(root, p);
const lies = (p) => readFileSync(pfad(p), 'utf8');

const PNG_ICONS = [
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

test('das Vektorsymbol existiert und kommt ohne Fremdinhalte aus', () => {
  const svg = lies('icons/icon.svg');
  assert.match(svg, /<svg[^>]*viewBox=/, 'kein gültiges SVG mit viewBox');
  assert.doesNotMatch(svg, /<script/i, 'kein Skript im Symbol');
  // xmlns ist nur eine Namensraum-Kennung und lädt nichts – alles andere schon
  const ohneNamensraum = svg.replace(/xmlns(:\w+)?="[^"]*"/g, '');
  assert.doesNotMatch(ohneNamensraum, /https?:\/\//, 'das Symbol darf nichts nachladen');
  assert.doesNotMatch(svg, /(xlink:)?href\s*=|url\(\s*['"]?http/i, 'keine externen Verweise');
});

for (const p of PNG_ICONS) {
  test(`${p} ist eine echte PNG-Datei`, () => {
    assert.ok(existsSync(pfad(p)), `${p} fehlt`);
    const buf = readFileSync(pfad(p));
    assert.deepEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'keine PNG-Signatur');
    assert.ok(buf.length > 200, `${p} ist verdächtig klein`);
    // Bildgröße steht im IHDR ab Byte 16
    const breite = buf.readUInt32BE(16);
    const hoehe = buf.readUInt32BE(20);
    const erwartet = Number(p.match(/(\d+)/)?.[1] ?? 180);
    assert.equal(breite, hoehe, 'das Symbol muss quadratisch sein');
    assert.equal(breite, erwartet, `${p} hat ${breite}px statt ${erwartet}px`);
  });
}

test('favicon.ico liegt an der Stelle, an der Browser blind danach fragen', () => {
  assert.ok(existsSync(pfad('favicon.ico')), 'favicon.ico fehlt im Wurzelverzeichnis');
  const buf = readFileSync(pfad('favicon.ico'));
  assert.deepEqual([...buf.subarray(0, 4)], [0, 0, 1, 0], 'kein gültiger ICO-Kopf');
  assert.ok(buf.readUInt16LE(4) >= 1, 'das ICO enthält kein Bild');
});

test('index.html bindet Symbol und Startbildschirm-Icon lokal ein', () => {
  const html = lies('index.html');
  const links = [...html.matchAll(/<link[^>]*rel="([^"]+)"[^>]*href="([^"]+)"[^>]*>/g)]
    .map((m) => ({ rel: m[1], href: m[2] }));

  const icon = links.find((l) => l.rel === 'icon');
  assert.ok(icon, 'kein rel="icon" gesetzt');
  assert.match(icon.href, /icons\/icon\.svg$/, 'das Vektorsymbol soll das Hauptsymbol sein');

  const apple = links.find((l) => l.rel === 'apple-touch-icon');
  assert.ok(apple, 'kein apple-touch-icon gesetzt');

  for (const l of links) {
    if (!/icon/.test(l.rel)) continue;
    assert.doesNotMatch(l.href, /^(https?:)?\/\//, `${l.href} verweist nach außen`);
    assert.doesNotMatch(l.href, /^data:/, 'Symbole sollen echte Dateien sein');
    assert.ok(existsSync(pfad(l.href)), `${l.href} existiert nicht`);
  }
});

test('das Web-Manifest verweist auf vorhandene Symboldateien', () => {
  const mf = JSON.parse(lies('manifest.webmanifest'));
  assert.ok(Array.isArray(mf.icons) && mf.icons.length >= 2, 'zu wenige Symbole im Manifest');
  const groessen = mf.icons.map((i) => i.sizes);
  assert.ok(groessen.some((s) => s?.includes('192')), '192px fehlt');
  assert.ok(groessen.some((s) => s?.includes('512')), '512px fehlt');
  assert.ok(mf.icons.some((i) => (i.purpose || '').includes('maskable')), 'kein maskierbares Symbol');
  for (const i of mf.icons) {
    assert.doesNotMatch(i.src, /^(https?:)?\/\//, `${i.src} verweist nach außen`);
    assert.ok(existsSync(pfad(i.src.replace(/^\.?\//, ''))), `${i.src} existiert nicht`);
  }
});
