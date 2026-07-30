/* Zeichnet die isometrische Welt. Alles wird in Weltpixeln gezeichnet,
   die Kamera setzt Transformation und Zoom. */

import { TILE_W, TILE_H, TERRAIN, BUILDINGS, UNITS, RES_ICON } from './config.js';
import { tileToWorld } from './iso.js';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

const TERRAIN_COLORS = {
  [TERRAIN.WATER]: ['#20486b', '#1d4362', '#24507a', '#1f4a70'],
  [TERRAIN.SAND]: ['#d6c187', '#cfb87e', '#dcc78e', '#d2bd82'],
  [TERRAIN.GRASS]: ['#4e8a3c', '#548f41', '#478034', '#5a9646'],
  [TERRAIN.DIRT]: ['#7a6242', '#83694a', '#735c3d', '#7f6547'],
  [TERRAIN.ROCKGROUND]: ['#6d7358', '#747a5f', '#666c52', '#797f64'],
};

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.hover = null; // {x,y} Kachel für Bauvorschau
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setGame(game) { this.game = game; }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.game.cam.vw = w;
    this.game.cam.vh = h;
  }

  draw(time) {
    const g = this.game, ctx = this.ctx, cam = g.cam;
    const vw = cam.vw, vh = cam.vh;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#153148';
    ctx.fillRect(0, 0, vw, vh);

    ctx.save();
    ctx.translate(vw / 2, vh / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    // Sichtbarer Weltbereich (mit Rand)
    const halfW = vw / 2 / cam.zoom + TILE_W * 2;
    const halfH = vh / 2 / cam.zoom + TILE_H * 6;
    const view = { x0: cam.x - halfW, x1: cam.x + halfW, y0: cam.y - halfH, y1: cam.y + halfH };

    this.drawTerrain(view, time);
    this.drawObjects(view, time);
    this.drawBuildPreview();

    ctx.restore();
  }

  /* ---------------------------------------------------------- */
  drawTerrain(view, time) {
    const g = this.game, ctx = this.ctx, world = g.world;
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const w = tileToWorld(x, y);
        if (w.x < view.x0 - HW || w.x > view.x1 + HW || w.y < view.y0 - HH || w.y > view.y1 + HH) continue;
        const t = world.tiles[world.idx(x, y)];
        const v = world.variant[world.idx(x, y)];
        let color = TERRAIN_COLORS[t][v];
        if (t === TERRAIN.WATER) {
          const shimmer = Math.sin(time * 0.9 + (x + y) * 0.5) * 8;
          color = shade(color, shimmer);
        }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(w.x, w.y - HH);
        ctx.lineTo(w.x + HW, w.y);
        ctx.lineTo(w.x, w.y + HH);
        ctx.lineTo(w.x - HW, w.y);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Gitterlinien im Baumodus
    if (g.buildMode) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      for (let y = 0; y < world.h; y++) {
        for (let x = 0; x < world.w; x++) {
          const w = tileToWorld(x, y);
          if (w.x < view.x0 || w.x > view.x1 || w.y < view.y0 || w.y > view.y1) continue;
          ctx.beginPath();
          ctx.moveTo(w.x, w.y - HH);
          ctx.lineTo(w.x + HW, w.y);
          ctx.lineTo(w.x, w.y + HH);
          ctx.lineTo(w.x - HW, w.y);
          ctx.closePath();
          ctx.stroke();
        }
      }
    }
  }

  /* ---------------------------------------------------------- */
  drawObjects(view, time) {
    const g = this.game;
    const list = [];

    for (const n of g.world.nodes.values()) {
      const w = tileToWorld(n.x, n.y);
      if (outside(w, view)) continue;
      list.push({ d: n.x + n.y, z: 0, kind: 'node', obj: n, w });
    }
    for (const b of g.buildings) {
      const w = tileToWorld(b.cx, b.cy);
      if (outside(w, view, 120)) continue;
      list.push({ d: b.cx + b.cy + b.size * 0.4, z: 1, kind: 'building', obj: b, w });
    }
    for (const u of g.units) {
      if (!u.alive) continue;
      const w = tileToWorld(u.x, u.y);
      if (outside(w, view)) continue;
      list.push({ d: u.x + u.y, z: 2, kind: 'unit', obj: u, w });
    }
    for (const e of g.effects) {
      const w = tileToWorld(e.x, e.y);
      list.push({ d: e.x + e.y, z: 3, kind: 'effect', obj: e, w });
    }
    for (const p of g.projectiles) {
      const w = tileToWorld(p.x, p.y);
      list.push({ d: p.x + p.y + 0.1, z: 4, kind: 'proj', obj: p, w });
    }

    list.sort((a, b) => (a.d - b.d) || (a.z - b.z));

    for (const item of list) {
      switch (item.kind) {
        case 'node': this.drawNode(item.obj, item.w); break;
        case 'building': this.drawBuilding(item.obj, item.w, time); break;
        case 'unit': this.drawUnit(item.obj, item.w, time); break;
        case 'effect': this.drawEffect(item.obj, item.w); break;
        case 'proj': this.drawProjectile(item.obj, item.w); break;
      }
    }
  }

  /* ---------------------------------------------------------- */
  drawNode(n, w) {
    const ctx = this.ctx;
    shadow(ctx, w.x, w.y, 16, 8);
    if (n.type === 'baum') {
      const h = 26 + n.variant * 5;
      const health = Math.max(0.35, n.amount / n.max);
      // Stamm
      ctx.fillStyle = '#5b3f24';
      ctx.fillRect(w.x - 2.5, w.y - h * 0.62, 5, h * 0.62);
      ctx.fillStyle = '#6f4e2d';
      ctx.fillRect(w.x - 2.5, w.y - h * 0.62, 2, h * 0.62);
      // Krone
      const cr = (11 + n.variant) * (0.75 + 0.25 * health);
      ctx.fillStyle = '#2f6b2c';
      circle(ctx, w.x, w.y - h * 0.66, cr);
      ctx.fillStyle = '#3d8a37';
      circle(ctx, w.x - cr * 0.32, w.y - h * 0.82, cr * 0.78);
      ctx.fillStyle = '#54ad48';
      circle(ctx, w.x + cr * 0.3, w.y - h * 0.95, cr * 0.62);
    } else {
      const s = (0.6 + 0.4 * (n.amount / n.max));
      ctx.fillStyle = '#8b8b83';
      poly(ctx, [
        [w.x - 14 * s, w.y + 2], [w.x - 8 * s, w.y - 12 * s], [w.x + 4 * s, w.y - 15 * s],
        [w.x + 14 * s, w.y - 3], [w.x + 8 * s, w.y + 5],
      ]);
      ctx.fillStyle = '#a5a59c';
      poly(ctx, [[w.x - 8 * s, w.y - 12 * s], [w.x + 4 * s, w.y - 15 * s], [w.x + 2 * s, w.y - 6 * s], [w.x - 5 * s, w.y - 4 * s]]);
      ctx.fillStyle = '#6c6c65';
      poly(ctx, [[w.x + 4 * s, w.y - 15 * s], [w.x + 14 * s, w.y - 3], [w.x + 8 * s, w.y + 5], [w.x + 2 * s, w.y - 6 * s]]);
    }
  }

  /* ---------------------------------------------------------- */
  drawBuilding(b, w, time) {
    const ctx = this.ctx;
    const def = BUILDINGS[b.type];
    const s = b.size;
    const hw = HW * s * 0.9;
    const hh = HH * s * 0.9;
    const progress = b.progressRatio();
    const wallH = (def.tower ? 46 : 20 + s * 8) * (b.done ? 1 : 0.35 + 0.65 * progress);

    shadow(ctx, w.x, w.y, hw, hh);

    const alpha = b.done ? 1 : 0.75;
    ctx.globalAlpha = alpha;

    // Wände
    const base = def.color || '#8a6b3f';
    ctx.fillStyle = shade(base, -34);
    poly(ctx, [[w.x - hw, w.y], [w.x, w.y + hh], [w.x, w.y + hh - wallH], [w.x - hw, w.y - wallH]]);
    ctx.fillStyle = shade(base, -12);
    poly(ctx, [[w.x + hw, w.y], [w.x, w.y + hh], [w.x, w.y + hh - wallH], [w.x + hw, w.y - wallH]]);

    // Dachfläche / oberes Diamant
    const topY = w.y - wallH;
    ctx.fillStyle = shade(base, 14);
    poly(ctx, [[w.x, topY - hh], [w.x + hw, topY], [w.x, topY + hh], [w.x - hw, topY]]);

    if (b.done) {
      if (def.wall) {
        // Zinnen
        ctx.fillStyle = shade(base, 26);
        for (let i = -1; i <= 1; i++) {
          ctx.fillRect(w.x + i * hw * 0.45 - 3, topY - 6 - hh * 0.2, 6, 7);
        }
      } else if (def.tower) {
        // Turmspitze
        ctx.fillStyle = def.roof;
        poly(ctx, [[w.x - hw, topY], [w.x, topY - hh], [w.x + hw, topY], [w.x, topY - hh - 26]]);
        ctx.fillStyle = '#d8d2c2';
        poly(ctx, [[w.x, topY - hh - 26], [w.x + 10, topY - hh - 22], [w.x, topY - hh - 18]]);
      } else {
        // Walmdach: vier Dreiecke von den Diamantecken zur Spitze
        const roof = def.roof || '#5c3f22';
        const rh = 14 + s * 7;
        const apex = [w.x, topY - rh];
        const over = 3; // leichter Dachüberstand
        const N = [w.x, topY - hh - over * 0.5];
        const E = [w.x + hw + over, topY];
        const S = [w.x, topY + hh + over * 0.5];
        const W2 = [w.x - hw - over, topY];
        ctx.fillStyle = shade(roof, 16);   // Rückseiten
        poly(ctx, [N, E, apex]);
        ctx.fillStyle = shade(roof, 4);
        poly(ctx, [N, W2, apex]);
        ctx.fillStyle = shade(roof, -30);  // Vorderseiten
        poly(ctx, [W2, S, apex]);
        ctx.fillStyle = shade(roof, -10);
        poly(ctx, [S, E, apex]);
        ctx.strokeStyle = shade(roof, -45);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const p of [S, W2, E]) { ctx.moveTo(p[0], p[1]); ctx.lineTo(apex[0], apex[1]); }
        ctx.stroke();
      }
    } else {
      // Baugerüst
      ctx.strokeStyle = 'rgba(220,200,150,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w.x - hw, w.y); ctx.lineTo(w.x - hw, w.y - wallH - 10);
      ctx.moveTo(w.x + hw, w.y); ctx.lineTo(w.x + hw, w.y - wallH - 10);
      ctx.moveTo(w.x - hw, w.y - wallH - 4); ctx.lineTo(w.x + hw, w.y - wallH - 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Symbol über dem Dach
    if (b.done && !def.wall) {
      ctx.font = `${11 + s * 3}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, w.x, topY - (def.tower ? hh + 40 : 22 + s * 8));
    }

    // Baufortschritt
    if (!b.done) this.bar(w.x, w.y - wallH - 22, 34, progress, '#8fd14f');
    // Lebensbalken bei Schaden
    else if (b.hp < b.maxHp) this.bar(w.x, w.y - wallH - hh - 12, 32, b.hp / b.maxHp, '#d0563f');

    // Produktionsanzeige
    if (b.done && def.produce && b.prodActive) {
      this.bar(w.x, w.y - wallH - hh - (b.hp < b.maxHp ? 20 : 12), 26, b.prodTimer / def.produce.time, '#e8c06a');
    }

    // Auswahlmarkierung
    const sel = this.game.selection;
    if (sel && sel.kind === 'building' && sel.id === b.id) {
      ctx.strokeStyle = '#8fd14f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w.x, w.y - hh); ctx.lineTo(w.x + hw, w.y);
      ctx.lineTo(w.x, w.y + hh); ctx.lineTo(w.x - hw, w.y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  /* ---------------------------------------------------------- */
  drawUnit(u, w, time) {
    const ctx = this.ctx;
    const def = UNITS[u.type];
    const moving = !!(u.path && u.path.length);
    const bob = moving ? Math.abs(Math.sin(u.anim * 0.5)) * 2.5 : Math.sin(time * 2 + u.id) * 0.6;
    const y = w.y - bob;
    const scale = u.isHero ? 1.15 : 1;

    shadow(ctx, w.x, w.y + 1, 8 * scale, 4 * scale);

    // Beine
    ctx.fillStyle = '#3b3229';
    ctx.fillRect(w.x - 3.5 * scale, y - 7 * scale, 2.6 * scale, 7 * scale);
    ctx.fillRect(w.x + 1 * scale, y - 7 * scale, 2.6 * scale, 7 * scale);

    // Körper
    ctx.fillStyle = def.color;
    roundRect(ctx, w.x - 5 * scale, y - 18 * scale, 10 * scale, 12 * scale, 3 * scale);

    // Gürtel / Rüstungsdetail
    ctx.fillStyle = shade(def.color, -40);
    ctx.fillRect(w.x - 5 * scale, y - 9 * scale, 10 * scale, 2 * scale);

    // Kopf
    ctx.fillStyle = '#f0c9a0';
    circle(ctx, w.x, y - 22 * scale, 4.2 * scale);
    // Haare / Helm
    ctx.fillStyle = u.enemy ? '#4a2320' : u.isSoldier ? '#b9c2cb' : '#6b4a2b';
    ctx.beginPath();
    ctx.arc(w.x, y - 22.5 * scale, 4.4 * scale, Math.PI, 0);
    ctx.fill();

    // Ausrüstung
    if (u.type === 'ritter' || u.type === 'raeuberboss') {
      ctx.strokeStyle = '#e6e6e6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w.x + 6 * scale, y - 16 * scale);
      ctx.lineTo(w.x + 10 * scale, y - 26 * scale);
      ctx.stroke();
    } else if (u.type === 'bogen') {
      ctx.strokeStyle = '#8a5a2b';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(w.x + 7 * scale, y - 15 * scale, 6 * scale, -1.2, 1.2);
      ctx.stroke();
    } else if (u.isHero) {
      // Umhang
      ctx.fillStyle = '#c0392b';
      poly(ctx, [[w.x - 5 * scale, y - 18 * scale], [w.x - 9 * scale, y - 4 * scale], [w.x - 2 * scale, y - 7 * scale]]);
    }

    // Getragene Ressource
    if (u.carrying && u.carrying.amount >= 1) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(RES_ICON[u.carrying.res] || '📦', w.x, y - 30 * scale);
    }

    // Arbeitsanimation
    if (u.work?.phase === 'chop' || u.order?.type === 'gather') {
      const swing = Math.sin(u.anim * 1.2) * 8;
      ctx.strokeStyle = '#c9a06a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w.x + 5 * scale, y - 15 * scale);
      ctx.lineTo(w.x + 11 * scale, y - 15 * scale - swing);
      ctx.stroke();
    }

    // Lebensbalken
    if (u.hp < u.maxHp) this.bar(w.x, y - 33 * scale, 20, u.hp / u.maxHp, u.enemy ? '#e26a5a' : '#7ec850');

    // Auswahl / Held
    const sel = this.game.selection;
    if (sel && sel.kind === 'unit' && sel.id === u.id) ring(ctx, w.x, w.y, 11, '#8fd14f');
    else if (u.isHero) ring(ctx, w.x, w.y, 11, 'rgba(120,180,255,0.55)');
    else if (u.enemy) ring(ctx, w.x, w.y, 9, 'rgba(226,96,63,0.45)');
  }

  /* ---------------------------------------------------------- */
  drawProjectile(p, w) {
    const ctx = this.ctx;
    ctx.strokeStyle = '#f4e3b0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w.x - 4, w.y - 14);
    ctx.lineTo(w.x + 4, w.y - 18);
    ctx.stroke();
  }

  drawEffect(e, w) {
    const ctx = this.ctx;
    const t = e.life / e.max;
    ctx.globalAlpha = t;
    if (e.type === 'hit') {
      ctx.fillStyle = '#ffe6a0';
      circle(ctx, w.x, w.y - 14, 6 * (1.4 - t));
    } else if (e.type === 'puff') {
      ctx.fillStyle = e.color || '#cccccc';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        circle(ctx, w.x + Math.cos(a) * (1 - t) * 16, w.y - 10 + Math.sin(a) * (1 - t) * 8, 4 * t + 1);
      }
    } else if (e.type === 'float') {
      ctx.fillStyle = '#e8f0e2';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(e.text, w.x, w.y - 26 - (1 - t) * 20);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------- */
  drawBuildPreview() {
    const g = this.game;
    if (!g.buildMode || !this.hover) return;
    const ctx = this.ctx;
    const def = BUILDINGS[g.buildMode];
    const size = def.size || 1;
    const ok = g.canBuildHere(g.buildMode, this.hover.x, this.hover.y) && g.canAfford(def.cost);

    ctx.globalAlpha = 0.45;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const tx = this.hover.x + dx, ty = this.hover.y + dy;
        const w = tileToWorld(tx, ty);
        ctx.fillStyle = g.world.buildable(tx, ty) ? (ok ? '#8fd14f' : '#e8c06a') : '#e2603f';
        poly(ctx, [[w.x, w.y - HH], [w.x + HW, w.y], [w.x, w.y + HH], [w.x - HW, w.y]]);
      }
    }
    ctx.globalAlpha = 1;

    const c = tileToWorld(this.hover.x + (size - 1) / 2, this.hover.y + (size - 1) / 2);
    ctx.font = `${14 + size * 4}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.icon, c.x, c.y - 12);
  }

  bar(x, y, width, ratio, color) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - width / 2, y, width, 4);
    ctx.fillStyle = color;
    ctx.fillRect(x - width / 2, y, width * Math.max(0, Math.min(1, ratio)), 4);
  }
}

/* ------------------------- Zeichen-Helfer ------------------------- */
function outside(w, view, m = 60) {
  return w.x < view.x0 - m || w.x > view.x1 + m || w.y < view.y0 - m || w.y > view.y1 + m;
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ring(ctx, x, y, r, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(x, y + 1, r, r / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function shadow(ctx, x, y, rx, ry) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

/** Farbe aufhellen/abdunkeln. */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
