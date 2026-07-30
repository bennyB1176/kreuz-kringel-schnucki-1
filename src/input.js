/* Eingabe: Touch (Pan, Pinch-Zoom, Tippen), Maus und Tastatur. */

import { screenToTile } from './iso.js';
import { clamp } from './utils.js';

const TAP_MOVE_LIMIT = 12;   // px
const TAP_TIME_LIMIT = 500;  // ms
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2.2;

export class Input {
  constructor(canvas, game, controller) {
    this.canvas = canvas;
    this.game = game;
    this.ctrl = controller;
    this.pointers = new Map();
    this.dragging = false;
    this.pinchStart = null;
    this.keys = new Set();
    this.bind();
  }

  setGame(game) { this.game = game; }

  bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e, true));
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
  }

  tileAt(sx, sy) {
    const t = screenToTile(sx, sy, this.game.cam);
    return { x: Math.round(t.x), y: Math.round(t.y), fx: t.x, fy: t.y };
  }

  onDown(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, {
      x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0,
    });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: this.game.cam.zoom,
      };
    }
    if (this.game.buildMode) this.ctrl.onHover(this.tileAt(e.clientX, e.clientY));
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);

    if (!p) {
      // reines Maus-Hovern
      if (e.pointerType === 'mouse' && this.game.buildMode) this.ctrl.onHover(this.tileAt(e.clientX, e.clientY));
      return;
    }

    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.moved += Math.hypot(dx, dy);
    p.x = e.clientX; p.y = e.clientY;

    if (this.pointers.size === 2 && this.pinchStart) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cam = this.game.cam;
      cam.zoom = clamp(this.pinchStart.zoom * (d / this.pinchStart.dist), MIN_ZOOM, MAX_ZOOM);
      return;
    }

    if (this.pointers.size === 1) {
      if (p.moved > TAP_MOVE_LIMIT) this.dragging = true;
      if (this.dragging) {
        const cam = this.game.cam;
        cam.x -= dx / cam.zoom;
        cam.y -= dy / cam.zoom;
      }
      if (this.game.buildMode) this.ctrl.onHover(this.tileAt(e.clientX, e.clientY));
    }
  }

  onUp(e, cancel = false) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStart = null;
    if (!p) return;

    const dt = performance.now() - p.t;
    const isTap = !cancel && p.moved <= TAP_MOVE_LIMIT && dt <= TAP_TIME_LIMIT && !this.dragging;
    if (this.pointers.size === 0) this.dragging = false;
    if (isTap) this.ctrl.onTap(this.tileAt(p.sx, p.sy), { x: p.sx, y: p.sy, button: e.button });
  }

  onWheel(e) {
    e.preventDefault();
    const cam = this.game.cam;
    const factor = Math.exp(-e.deltaY * 0.0016);
    cam.zoom = clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  }

  onKey(e, down) {
    const k = e.key.toLowerCase();
    if (down) {
      this.keys.add(k);
      if (k === 'escape') this.ctrl.onEscape();
      if (k === 'b') this.ctrl.togglePanel('build');
      if (k === ' ') { e.preventDefault(); this.ctrl.centerOnHero(); }
    } else {
      this.keys.delete(k);
    }
  }

  /** Kamerabewegung per Tastatur (pro Frame). */
  updateCamera(dt) {
    const cam = this.game.cam;
    const speed = 520 * dt / cam.zoom;
    let dx = 0, dy = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
    if (dx || dy) {
      const n = Math.hypot(dx, dy) || 1;
      cam.x += (dx / n) * speed;
      cam.y += (dy / n) * speed;
    }
  }
}
