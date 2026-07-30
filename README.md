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
Stand bei jedem Push auf `main` als GitHub Page veröffentlicht. Einmalig nötig:

1. **Settings → Pages → Build and deployment → Source: „GitHub Actions“** wählen.
2. Auf `main` pushen (oder den Workflow manuell über *Actions → Deploy to GitHub Pages →
   Run workflow* starten).

Alternativ funktioniert auch „Deploy from a branch“, da alle Dateien statisch im
Wurzelverzeichnis liegen; die Datei `.nojekyll` verhindert dabei die Jekyll-Verarbeitung.

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
```

Keine externen Bibliotheken, keine Build-Tools – alle Grafiken werden zur Laufzeit auf
das Canvas gezeichnet.
