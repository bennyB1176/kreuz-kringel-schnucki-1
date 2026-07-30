# 🏰 Siedler der Insel

Ein isometrisches Aufbau- und Strategiespiel für den Browser – ohne Build-Schritt, ohne
Abhängigkeiten, direkt als GitHub Page lauffähig und für das Handy optimiert.

Du steuerst einen Helden durch eine isometrische Insel, fällst Bäume, baust Steine ab,
errichtest eine Siedlung mit Veredelungsbetrieben, stellst Siedler als feste Arbeiter ein
und verteidigst dich später mit Mauern, Türmen, Rittern und Bogenschützen gegen
Räuberwellen.

## Spielen

* **Lokal:** Repository klonen und einen beliebigen Webserver im Projektordner starten,
  z. B. `python3 -m http.server 8000`, dann <http://localhost:8000> öffnen.
  (Ein Server ist nötig, weil das Spiel ES-Module verwendet – ein direkter Doppelklick
  auf `index.html` funktioniert wegen der Browser-CORS-Regeln nicht.)
* **GitHub Pages:** siehe [Veröffentlichen](#veröffentlichen).

## Steuerung

| Aktion | Handy | PC |
| --- | --- | --- |
| Karte bewegen | ziehen | ziehen oder `W A S D` / Pfeiltasten |
| Zoomen | zwei Finger | Mausrad |
| Laufen | auf freies Gelände tippen | klicken |
| Sammeln | auf Baum oder Felsen tippen | klicken |
| Auswählen | auf Einheit oder Gebäude tippen | klicken |
| Bauen | 🏗️ Bauen → Gebäude → Stelle antippen | dito, `B` öffnet das Menü |
| Zum Helden springen | 🎯 Held | Leertaste |
| Abbrechen | Abbrechen-Knopf | `Esc` |

## Spielablauf

1. **Rohstoffe sammeln** – Der Held sammelt Holz und Stein und bringt die Ladung
   automatisch zum Lagerhaus.
2. **Wirtschaft aufbauen** – Holzfällerhütte und Steinbruch werden von Siedlern bedient,
   die selbstständig Bäume fällen bzw. Felsen abbauen und alles ins Lager tragen.
   Der Bauernhof erzeugt Nahrung, Wohnhäuser erhöhen die Bevölkerungsgrenze,
   Lagerhäuser das Lagerlimit.
3. **Veredeln** – Sägewerk (Holz → Bretter), Steinmetz (Stein → Quader) und Schmiede
   (Bretter + Quader → Werkzeug) verarbeiten Rohstoffe weiter. Jeder Betrieb braucht
   zugewiesene Arbeiter.
4. **Siedler ausbilden** – Im Lagerhaus (oder über 🧍 Leute) entstehen neue Siedler; sie
   kosten Holz und Nahrung und belegen Bevölkerungsplätze.
5. **Verteidigen** – Ab Minute 4 greifen Räuberwellen an, danach etwa alle 3,5 Minuten und
   jedes Mal stärker. Wachtürme schießen automatisch, Mauern blockieren den Weg,
   Kaserne und Bogenschützenstand bilden Ritter und Bogenschützen aus. Soldaten
   verteidigen selbstständig und lassen sich über ⚔️ Armee sammeln oder losschicken.

Fällt der Held im Kampf, kehrt er nach kurzer Zeit am Lager zurück.

## Speichern

Der Spielstand liegt ausschließlich lokal im `localStorage` des Browsers. Er wird alle
20 Sekunden sowie beim Verlassen der Seite automatisch gespeichert; über ☰ lässt sich
manuell speichern, laden, löschen oder ein neues Spiel starten.

## Veröffentlichen

Das Repository enthält einen Workflow (`.github/workflows/pages.yml`), der den Projekt-
Stand bei jedem Push auf `main` als GitHub Page veröffentlicht – aber erst, wenn Tests
und Secret-Scan grün sind.

> **Einmalig von Hand nötig:** unter **Settings → Pages → Build and deployment →
> Source** den Eintrag **„GitHub Actions“** wählen. Ohne diese Einstellung bricht das
> Deployment mit `Get Pages site failed` ab. Der Workflow kann Pages nicht selbst
> aktivieren: dem Workflow-Token fehlt das Recht, eine Pages-Site anzulegen
> (`Resource not accessible by integration`).

Danach genügt ein Push auf `main` oder ein manueller Start über *Actions → Deploy to
GitHub Pages → Run workflow*. Die Seite erscheint anschließend unter
`https://<benutzername>.github.io/kreuz-kringel-schnucki-1/`.

Alternativ funktioniert auch „Deploy from a branch“, da alle Dateien statisch im
Wurzelverzeichnis liegen; die Datei `.nojekyll` verhindert dabei die Jekyll-Verarbeitung.

## Entwicklung (testgetrieben)

Die Spiellogik ist vollständig von der Darstellung getrennt und wird testgetrieben
entwickelt: Erst beschreibt ein Test das gewünschte Verhalten, dann folgt der Code.
Die Suite läuft mit dem eingebauten Testrunner von Node – ohne jede Abhängigkeit.

```bash
npm test          # gesamte Suite (rund 110 Tests, < 1 s)
npm run test:watch
npm run scan      # Secret-Scan über Arbeitsverzeichnis und Git-Historie
npm run serve     # lokaler Webserver auf http://localhost:8000
```

Getestet werden Wegfindung, Kartengenerierung, Wirtschaft, Arbeiter-KI, Produktion,
Kampf, Angriffswellen und das Speicherformat. Die DOM-nahen Module (`render.js`,
`input.js`, `ui.js`, `main.js`) werden statisch auf Syntax geprüft; ihr Zusammenspiel
deckt der manuelle Durchlauf im Browser ab.

Beispiele für Fehler, die diese Suite aufgedeckt hat: Einheiten maßen den Abstand zu
mehrfeldrigen Gebäuden vom Mittelpunkt statt zur nächsten Kachel und blieben dadurch
2,12 Felder vor einem Lager mit 2,1 Feldern Toleranz stehen; ein leerer Weg galt als
„noch unterwegs“; und eingesetzte Rohstoffe verfielen, wenn ein Arbeiter die
Produktion mittendrin verließ.

## Sicherheit: Secret Scanning mit gitleaks

Das Projekt braucht keinerlei Zugangsdaten – deshalb ist jeder Fund ein echter Fund.
[gitleaks](https://github.com/gitleaks/gitleaks) prüft Arbeitsverzeichnis **und**
Git-Historie; die Konfiguration liegt in `.gitleaks.toml` und übernimmt die
Standardregeln.

* `npm run scan` – vollständiger Scan (lädt gitleaks bei Bedarf nach `.cache/`)
* `scripts/gitleaks.sh staged` – nur vorgemerkte Änderungen
* `scripts/gitleaks.sh selftest` – legt zur Laufzeit ein Testgeheimnis außerhalb des
  Repositories an und erwartet einen Treffer. Damit kann der Scan nicht unbemerkt
  wirkungslos werden – genau das war er zwischenzeitlich, weil gitleaks eine bekannte
  Beispiel-Zeichenkette bewusst ignoriert.

Optionaler Hook vor jedem Commit (Secret-Scan + Tests):

```bash
git config core.hooksPath .githooks
```

In der CI (`.github/workflows/ci.yml`) laufen Testsuite und Secret-Scan bei jedem Push
und jedem Pull Request; die Veröffentlichung auf GitHub Pages startet erst, wenn beides
grün ist.

## Projektstruktur

```
index.html              Seitengerüst und HUD
styles.css              Oberfläche (mobil zuerst, große Touch-Ziele, Safe-Areas)
manifest.webmanifest    Web-App-Manifest ("zum Startbildschirm hinzufügen")
src/
  main.js               Einstiegspunkt: Spielschleife, Tippen-Logik, Befehle
  config.js             Balance: Ressourcen-, Gebäude-, Einheiten- und Wellen-Definitionen
  game.js               Spielzustand: Ressourcen, Bauen, Arbeiter, Wellen, Speicherformat
  world.js              Kartengenerierung, Gelände, Bäume und Felsen
  entities.js           Einheiten: Bewegung, Arbeits-KI, Kampf, Feind-KI
  buildings.js          Gebäude: Bauzeit, Produktion, Ausbildung, Türme
  render.js             Isometrischer Canvas-Renderer
  input.js              Touch (Pan, Pinch, Tap), Maus und Tastatur
  ui.js                 Panels, Auswahl, Menü, Anleitung
  iso.js                Kachel-/Bildschirm-Koordinaten
  pathfind.js           A*-Wegfindung
  save.js               localStorage-Spielstände
  utils.js              Zufall, Rauschen, Heap, Mathe
tests/                  Testsuite (node:test), Logik ohne DOM
scripts/gitleaks.sh     Secret-Scan für lokal und CI
.githooks/pre-commit    optionaler Hook: Scan + Tests vor jedem Commit
```

Keine externen Bibliotheken, keine Build-Tools – alle Grafiken werden zur Laufzeit auf
das Canvas gezeichnet.
