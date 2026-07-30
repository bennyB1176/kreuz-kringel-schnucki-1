/* Absicherung der Projekteinrichtung: Die Schutzmechanismen (Tests in der CI,
   Secret-Scanning) dürfen nicht unbemerkt verschwinden. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lies = (p) => readFileSync(join(root, p), 'utf8');

test('package.json stellt Test- und Scan-Skripte bereit', () => {
  const pkg = JSON.parse(lies('package.json'));
  assert.ok(pkg.scripts.test, 'npm test muss definiert sein');
  assert.match(pkg.scripts.test, /node --test/);
  assert.ok(pkg.scripts.scan, 'npm run scan muss definiert sein');
  assert.equal(pkg.type, 'module', 'die Quellen sind ES-Module');
  assert.equal(pkg.dependencies, undefined, 'das Spiel bleibt abhängigkeitsfrei');
});

test('gitleaks-Konfiguration nutzt die Standardregeln', () => {
  const cfg = lies('.gitleaks.toml');
  assert.match(cfg, /\[extend\]/);
  assert.match(cfg, /useDefault\s*=\s*true/, 'die eingebauten Regeln müssen aktiv bleiben');
});

test('das Scan-Skript ist ausführbar und kennt alle Betriebsarten', () => {
  const stat = statSync(join(root, 'scripts/gitleaks.sh'));
  assert.ok(stat.mode & 0o111, 'scripts/gitleaks.sh muss ausführbar sein');
  const sh = lies('scripts/gitleaks.sh');
  for (const mode of ['staged', 'history', 'selftest']) {
    assert.match(sh, new RegExp(`\\b${mode}\\)`), `Betriebsart ${mode} fehlt`);
  }
  assert.match(sh, /--exit-code 1/, 'Funde müssen den Build brechen');
});

test('die CI prüft Tests und Geheimnisse – inklusive Scanner-Selbsttest', () => {
  const ci = lies('.github/workflows/ci.yml');
  assert.match(ci, /npm test/, 'die Testsuite muss in der CI laufen');
  assert.match(ci, /gitleaks\.sh selftest/, 'der Selbsttest des Scanners muss laufen');
  assert.match(ci, /fetch-depth:\s*0/, 'für den Verlaufsscan wird die volle Historie gebraucht');
});

test('die Veröffentlichung läuft erst nach grünen Tests', () => {
  const pages = lies('.github/workflows/pages.yml');
  assert.match(pages, /npm test/, 'vor dem Deployment müssen die Tests laufen');
  assert.match(pages, /gitleaks/, 'vor dem Deployment wird auf Geheimnisse geprüft');
});

test('der pre-commit-Hook prüft Geheimnisse und Tests', () => {
  const hook = lies('.githooks/pre-commit');
  assert.match(hook, /gitleaks\.sh"?\s+staged/, 'der Hook muss die vorgemerkten Änderungen scannen');
  assert.match(hook, /npm test/);
  assert.ok(statSync(join(root, '.githooks/pre-commit')).mode & 0o111, 'der Hook muss ausführbar sein');
});

test('Cache- und Fremdverzeichnisse landen nicht im Repository', () => {
  const ignore = lies('.gitignore');
  assert.match(ignore, /\.cache\//);
  assert.match(ignore, /node_modules\//);
});
