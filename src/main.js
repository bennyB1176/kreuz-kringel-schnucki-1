/* Einstiegspunkt: verbindet Spiel, Renderer, Eingabe und UI. */

import { Game } from './game.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { AUTOSAVE_INTERVAL, BUILDINGS } from './config.js';

class App {
  constructor() {
    this.canvas = document.getElementById('game');
    this.game = hasSave() ? (loadGame() || new Game().startNew()) : new Game().startNew();
    this.renderer = new Renderer(this.canvas, this.game);
    this.input = new Input(this.canvas, this.game, this);
    this.ui = new UI(this);
    this.autosaveTimer = AUTOSAVE_INTERVAL;
    this.lastTime = performance.now();
    this.hookGame();

    if (this.game.time > 0) this.ui.toast('Spielstand geladen – willkommen zurück!');
    else this.ui.toast('Willkommen! Tippe auf einen Baum, um Holz zu sammeln.');

    requestAnimationFrame((t) => this.loop(t));
    window.addEventListener('beforeunload', () => this.save(false));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(false); });
  }

  hookGame() {
    this.game.on('toast', (msg) => this.ui.toast(msg));
    this.game.on('changed', () => { this.ui.renderPanel(); this.ui.renderSelection(); });
  }

  /* ---------------------------------------------------------- */
  /* Spielsteuerung                                              */
  /* ---------------------------------------------------------- */
  newGame() {
    this.game = new Game().startNew();
    this.renderer.setGame(this.game);
    this.input.setGame(this.game);
    this.renderer.resize();
    this.hookGame();
    this.ui.closePanel();
    this.ui.renderSelection();
    this.ui.toast('Neues Spiel gestartet!');
  }

  load() {
    const g = loadGame();
    if (!g) { this.ui.toast('Kein Spielstand gefunden.'); return; }
    this.game = g;
    this.renderer.setGame(g);
    this.input.setGame(g);
    this.renderer.resize();
    this.hookGame();
    this.ui.renderSelection();
    this.ui.renderPanel();
    this.ui.toast('Spielstand geladen.');
  }

  save(notify = true) {
    const ok = saveGame(this.game);
    if (notify) this.ui.toast(ok ? '💾 Gespeichert' : 'Speichern fehlgeschlagen');
  }

  centerOn(tx, ty) { this.game.centerOn(tx, ty); }

  centerOnHero() {
    const h = this.game.hero;
    if (h && h.alive) this.centerOn(h.x, h.y);
    else if (this.game.buildings.length) this.centerOn(this.game.buildings[0].cx, this.game.buildings[0].cy);
  }

  select(kind, id) {
    this.game.selection = { kind, id };
    this.ui.renderSelection();
  }

  startBuildMode(type) {
    const def = BUILDINGS[type];
    if (!this.game.canAfford(def.cost)) { this.ui.toast('Nicht genug Rohstoffe für ' + def.name); return; }
    this.game.buildMode = type;
    this.game.selection = null;
    this.ui.renderSelection();
    this.ui.closePanel();
    this.ui.updateBuildBar();
    // Vorschau in der Bildschirmmitte vorbelegen
    this.onHover(this.input.tileAt(window.innerWidth / 2, window.innerHeight / 2));
    this.ui.toast(`${def.icon} ${def.name}: Tippe auf die gewünschte Stelle`);
  }

  cancelBuildMode() {
    this.game.buildMode = null;
    this.renderer.hover = null;
    this.ui.updateBuildBar();
  }

  onEscape() {
    if (this.game.buildMode) this.cancelBuildMode();
    else if (this.game.selection) { this.game.selection = null; this.ui.renderSelection(); }
    else this.ui.closePanel();
  }

  togglePanel(name) { this.ui.togglePanel(name); }

  onHover(tile) {
    const def = this.game.buildMode ? BUILDINGS[this.game.buildMode] : null;
    if (!def) { this.renderer.hover = null; return; }
    const size = def.size || 1;
    // bei größeren Gebäuden die Kachel unter dem Finger zentrieren
    const off = Math.floor((size - 1) / 2);
    this.renderer.hover = { x: tile.x - off, y: tile.y - off };
  }

  /* ---------------------------------------------------------- */
  /* Tippen auf die Karte                                        */
  /* ---------------------------------------------------------- */
  onTap(tile) {
    const g = this.game;

    // 1) Baumodus
    if (g.buildMode) {
      this.onHover(tile);
      const h = this.renderer.hover;
      const type = g.buildMode;
      const res = g.tryBuild(type, h.x, h.y);
      if (!res.ok) { this.ui.toast(res.msg); return; }
      this.ui.toast(`${BUILDINGS[type].name} wird gebaut …`);
      // Mauern lassen sich in Serie setzen
      if (!BUILDINGS[type].wall || !g.canAfford(BUILDINGS[type].cost)) this.cancelBuildMode();
      this.ui.updateResources();
      return;
    }

    // 2) Einheit angetippt?
    const unit = g.unitAt(tile.fx, tile.fy, 0.85);
    const sel = g.selection?.kind === 'unit' ? g.getUnit(g.selection.id) : null;

    if (unit && (!sel || unit.id !== sel.id)) {
      if (unit.enemy && sel && (sel.isSoldier || sel.isHero)) {
        sel.order = { type: 'attack', targetId: unit.id };
        this.ui.toast('Angriff!');
        return;
      }
      this.select('unit', unit.id);
      return;
    }

    // 3) Gebäude angetippt?
    const building = g.buildingAt(tile.x, tile.y);
    if (building) {
      if (sel && sel.isWorker && building.maxWorkers > building.workers.length && building.done) {
        g.assignSpecificWorker(building, sel);
        this.ui.toast('Siedler zugewiesen');
        this.select('building', building.id);
        return;
      }
      this.select('building', building.id);
      return;
    }

    // 4) Rohstoffvorkommen angetippt?
    const node = g.world.nodeAt(tile.x, tile.y);
    if (node) {
      const worker = sel && (sel.isHero || (sel.isWorker && !sel.workplace)) ? sel : g.hero;
      if (worker && worker.alive) {
        worker.order = { type: 'gather', nodeKey: g.world.key(node.x, node.y) };
        worker.path = null;
        this.ui.toast(node.type === 'baum' ? '🪓 Holz sammeln' : '⛏️ Stein abbauen');
      }
      return;
    }

    // 5) Freies Gelände: laufen
    const mover = sel && !sel.enemy ? sel : g.hero;
    if (mover && mover.alive) {
      if (mover.isWorker && mover.workplace) {
        // Arbeiter kurz von der Arbeit abziehen wäre verwirrend – nur Held/Soldaten laufen frei
        this.ui.toast('Dieser Siedler arbeitet gerade.');
        return;
      }
      mover.order = { type: 'move' };
      if (!mover.moveTo(this.game, tile.x, tile.y)) this.ui.toast('Dorthin führt kein Weg.');
    }
  }

  /* ---------------------------------------------------------- */
  /* Armee-Befehle                                               */
  /* ---------------------------------------------------------- */
  rallyToHero() {
    const g = this.game;
    const h = g.hero;
    if (!h || !h.alive) { this.ui.toast('Der Held ist nicht verfügbar.'); return; }
    let n = 0;
    for (const u of g.units) {
      if (u.alive && u.isSoldier) {
        u.order = { type: 'move' };
        if (u.moveTo(g, h.x + (Math.random() * 4 - 2), h.y + (Math.random() * 4 - 2))) n++;
      }
    }
    this.ui.toast(n ? `${n} Soldaten sammeln sich` : 'Keine Soldaten vorhanden');
  }

  attackNearest() {
    const g = this.game;
    const soldiers = g.units.filter((u) => u.alive && u.isSoldier);
    if (!soldiers.length) { this.ui.toast('Keine Soldaten vorhanden'); return; }
    let n = 0;
    for (const s of soldiers) {
      const foe = g.nearestEnemyTo(s.x, s.y, Infinity);
      if (foe) { s.order = { type: 'attack', targetId: foe.id }; n++; }
    }
    this.ui.toast(n ? `${n} Soldaten greifen an` : 'Keine Feinde in Sicht');
  }

  /* ---------------------------------------------------------- */
  /* Hauptschleife                                               */
  /* ---------------------------------------------------------- */
  loop(now) {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this.input.updateCamera(dt);
    this.clampCamera();
    this.game.update(dt);
    this.ui.update(dt);
    this.renderer.draw(now / 1000);

    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) { this.autosaveTimer = AUTOSAVE_INTERVAL; this.save(false); }

    requestAnimationFrame((t) => this.loop(t));
  }

  clampCamera() {
    const g = this.game, cam = g.cam;
    const limitX = (g.world.w + g.world.h) * 16 + 200;
    const limitY = (g.world.w + g.world.h) * 8 + 200;
    cam.x = Math.max(-limitX, Math.min(limitX, cam.x));
    cam.y = Math.max(-100, Math.min(limitY * 2, cam.y));
  }
}

window.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
