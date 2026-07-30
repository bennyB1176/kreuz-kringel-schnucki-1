/* Zeichnet die isometrische Welt. Alles wird in Weltpixeln gezeichnet,
   die Kamera setzt Transformation und Zoom.

   Aufbau:
   - Gelände (Rauten)
   - Objekte nach Tiefe sortiert: Vorkommen, Gebäude, Einheiten, Effekte
   - Gebäude bestehen aus Grundkörper (Wände + Dach) und typeigenen
     Anbauten aus BUILDING_PROPS
   - Einheiten werden aus Körperteilen mit der Palette aus UNIT_STYLE gebaut
*/

import { TILE_W, TILE_H, TERRAIN, BUILDINGS, UNITS, RES_ICON } from './config.js';
import { tileToWorld } from './iso.js';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

const OUTLINE = 'rgba(24, 18, 12, 0.38)';

const TERRAIN_COLORS = {
  [TERRAIN.WATER]: ['#20486b', '#1d4362', '#24507a', '#1f4a70'],
  [TERRAIN.SAND]: ['#d6c187', '#cfb87e', '#dcc78e', '#d2bd82'],
  [TERRAIN.GRASS]: ['#4e8a3c', '#548f41', '#478034', '#5a9646'],
  [TERRAIN.DIRT]: ['#7a6242', '#83694a', '#735c3d', '#7f6547'],
  [TERRAIN.ROCKGROUND]: ['#6d7358', '#747a5f', '#666c52', '#797f64'],
};

/* =================================================================
   Aussehen der Einheiten
   ================================================================= */
export const UNIT_STYLE = {
  held: {
    tunika: '#3f7fd4', hose: '#2a3f66', haut: '#f2c9a0', kopf: '#c9a227',
    umhang: '#c0392b', waffe: 'schwert', scale: 1.15,
  },
  siedler: {
    tunika: '#c8a26a', hose: '#6b5334', haut: '#f2c9a0', kopf: '#7a5230',
    waffe: 'werkzeug', scale: 1,
  },
  ritter: {
    tunika: '#b9c4d0', hose: '#5a6472', haut: '#f2c9a0', kopf: '#e3e9f0',
    waffe: 'schwert', schild: true, helm: true, scale: 1.08,
  },
  bogen: {
    tunika: '#6f9e4a', hose: '#475c31', haut: '#f2c9a0', kopf: '#3f5c2c',
    waffe: 'bogen', kapuze: true, koecher: true, scale: 1.02,
  },
  raeuber: {
    tunika: '#8d4a44', hose: '#4a2f2c', haut: '#e0b48b', kopf: '#3a2320',
    waffe: 'keule', kapuze: true, scale: 1.02,
  },
  raeuberboss: {
    tunika: '#6d2f2f', hose: '#3a2020', haut: '#d9a87f', kopf: '#2b1a1a',
    waffe: 'axt', helm: true, hoerner: true, umhang: '#4a1f1f', scale: 1.22,
  },
};

/* =================================================================
   Renderer
   ================================================================= */
export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.hover = null; // Kachel für die Bauvorschau
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setGame(game) { this.game = game; }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    if (this.canvas.style) {
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
    }
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

    const halfW = vw / 2 / cam.zoom + TILE_W * 2;
    const halfH = vh / 2 / cam.zoom + TILE_H * 8;
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
        if (t === TERRAIN.WATER) color = shade(color, Math.sin(time * 0.9 + (x + y) * 0.5) * 8);
        ctx.fillStyle = color;
        diamond(ctx, w.x, w.y, HW, HH);
        ctx.fill();
      }
    }

    if (g.buildMode) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      for (let y = 0; y < world.h; y++) {
        for (let x = 0; x < world.w; x++) {
          const w = tileToWorld(x, y);
          if (w.x < view.x0 || w.x > view.x1 || w.y < view.y0 || w.y > view.y1) continue;
          diamond(ctx, w.x, w.y, HW, HH);
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
      if (outside(w, view, 160)) continue;
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
    shadow(ctx, w.x, w.y, 15, 7);
    if (n.type === 'baum') {
      const h = 26 + n.variant * 5;
      const health = Math.max(0.35, n.amount / n.max);
      ctx.fillStyle = '#5b3f24';
      ctx.fillRect(w.x - 2.5, w.y - h * 0.62, 5, h * 0.62);
      ctx.fillStyle = '#6f4e2d';
      ctx.fillRect(w.x - 2.5, w.y - h * 0.62, 2, h * 0.62);
      const cr = (11 + n.variant) * (0.75 + 0.25 * health);
      ctx.fillStyle = '#2f6b2c';
      circle(ctx, w.x, w.y - h * 0.66, cr);
      ctx.fillStyle = '#3d8a37';
      circle(ctx, w.x - cr * 0.32, w.y - h * 0.82, cr * 0.78);
      ctx.fillStyle = '#54ad48';
      circle(ctx, w.x + cr * 0.3, w.y - h * 0.95, cr * 0.62);
    } else {
      const s = 0.6 + 0.4 * (n.amount / n.max);
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
  /* Gebäude                                                     */
  /* ---------------------------------------------------------- */
  drawBuilding(b, w, time) {
    const ctx = this.ctx;
    const def = BUILDINGS[b.type];
    const s = b.size;
    const progress = b.progressRatio();
    const grow = b.done ? 1 : 0.35 + 0.65 * progress;

    const geo = {
      x: w.x,
      y: w.y,
      hw: HW * s * 0.92,
      hh: HH * s * 0.92,
      wallH: (def.tower ? 52 : def.wall ? 26 : 20 + s * 9) * grow,
      roofH: def.wall || def.tower ? 0 : 15 + s * 7,
      base: def.color || '#8a6b3f',
      roof: def.roof || '#5c3f22',
      size: s,
      time,
      anim: b.anim,
      done: b.done,
    };
    geo.topY = geo.y - geo.wallH;
    geo.apexY = geo.topY - geo.roofH;

    shadow(ctx, geo.x, geo.y + geo.hh * 0.25, geo.hw * 1.02, geo.hh * 0.95);

    ctx.globalAlpha = b.done ? 1 : 0.82;

    // Sockel: dunkler Streifen am Boden gibt Halt
    ctx.fillStyle = shade(geo.base, -52);
    poly(ctx, [
      [geo.x - geo.hw, geo.y], [geo.x, geo.y + geo.hh], [geo.x + geo.hw, geo.y],
      [geo.x + geo.hw, geo.y - 3], [geo.x, geo.y + geo.hh - 3], [geo.x - geo.hw, geo.y - 3],
    ]);

    // Wände
    ctx.fillStyle = shade(geo.base, -34);
    poly(ctx, [[geo.x - geo.hw, geo.y], [geo.x, geo.y + geo.hh], [geo.x, geo.y + geo.hh - geo.wallH], [geo.x - geo.hw, geo.y - geo.wallH]]);
    ctx.fillStyle = shade(geo.base, -6);
    poly(ctx, [[geo.x + geo.hw, geo.y], [geo.x, geo.y + geo.hh], [geo.x, geo.y + geo.hh - geo.wallH], [geo.x + geo.hw, geo.y - geo.wallH]]);

    // Kante zwischen den Wandflächen
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(geo.x, geo.y + geo.hh);
    ctx.lineTo(geo.x, geo.y + geo.hh - geo.wallH);
    ctx.stroke();

    // Deckfläche
    ctx.fillStyle = shade(geo.base, 16);
    diamond(ctx, geo.x, geo.topY, geo.hw, geo.hh);
    ctx.fill();

    if (b.done) {
      if (def.wall) this.drawZinnen(geo);
      else if (def.tower) this.drawTurmkrone(geo);
      else this.drawWalmdach(geo);

      const props = BUILDING_PROPS[b.type];
      if (props) props(ctx, geo, b, this);
    } else {
      this.drawBaugeruest(geo);
    }

    ctx.globalAlpha = 1;

    // Namensschild über dem Dach
    if (b.done && !def.wall) {
      const badgeY = geo.apexY - (def.tower ? 30 : 14);
      ctx.fillStyle = 'rgba(16,22,15,0.55)';
      circle(ctx, geo.x, badgeY, 9 + s);
      ctx.font = `${11 + s * 3}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, geo.x, badgeY);
    }

    let barY = geo.apexY - (def.tower ? 46 : 28);
    if (!b.done) { this.bar(geo.x, geo.y - geo.wallH - 24, 34, progress, '#8fd14f'); }
    else {
      if (b.hp < b.maxHp) { this.bar(geo.x, barY, 32, b.hp / b.maxHp, '#d0563f'); barY -= 8; }
      if (def.produce && b.prodActive) this.bar(geo.x, barY, 26, b.prodTimer / def.produce.time, '#e8c06a');
    }

    const sel = this.game.selection;
    if (sel && sel.kind === 'building' && sel.id === b.id) {
      ctx.strokeStyle = '#8fd14f';
      ctx.lineWidth = 2;
      diamond(ctx, geo.x, geo.y, geo.hw + 3, geo.hh + 2);
      ctx.stroke();
    }
  }

  /** Walmdach: vier Flächen von den Deckkanten zur Spitze. */
  drawWalmdach(g) {
    const ctx = this.ctx;
    const over = 3.5;
    const apex = [g.x, g.apexY];
    const N = [g.x, g.topY - g.hh - over * 0.5];
    const E = [g.x + g.hw + over, g.topY];
    const S = [g.x, g.topY + g.hh + over * 0.5];
    const W = [g.x - g.hw - over, g.topY];

    ctx.fillStyle = shade(g.roof, 16);
    poly(ctx, [N, E, apex]);
    ctx.fillStyle = shade(g.roof, 4);
    poly(ctx, [N, W, apex]);
    ctx.fillStyle = shade(g.roof, -30);
    poly(ctx, [W, S, apex]);
    ctx.fillStyle = shade(g.roof, -12);
    poly(ctx, [S, E, apex]);

    // Dachlatten als feine Linien
    ctx.strokeStyle = shade(g.roof, -46);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const p of [S, W, E]) { ctx.moveTo(p[0], p[1]); ctx.lineTo(apex[0], apex[1]); }
    for (let i = 1; i <= 2; i++) {
      const t = i / 3;
      ctx.moveTo(lerp(W[0], apex[0], t), lerp(W[1], apex[1], t));
      ctx.lineTo(lerp(S[0], apex[0], t), lerp(S[1], apex[1], t));
      ctx.moveTo(lerp(S[0], apex[0], t), lerp(S[1], apex[1], t));
      ctx.lineTo(lerp(E[0], apex[0], t), lerp(E[1], apex[1], t));
    }
    ctx.stroke();
  }

  /** Zinnenkranz entlang der beiden vorderen Deckkanten. */
  drawZinnen(g) {
    const ctx = this.ctx;
    const S = { x: g.x, y: g.topY + g.hh };
    const W = { x: g.x - g.hw, y: g.topY };
    const E = { x: g.x + g.hw, y: g.topY };
    const merlon = (p) => {
      ctx.fillStyle = shade(g.base, -18);
      ctx.fillRect(p.x - 3.4, p.y - 7, 6.8, 8);
      ctx.fillStyle = shade(g.base, 26);
      ctx.fillRect(p.x - 3.4, p.y - 7, 6.8, 2.6);
    };
    for (const t of [0.18, 0.58, 0.96]) {
      merlon({ x: lerp(W.x, S.x, t), y: lerp(W.y, S.y, t) });
      merlon({ x: lerp(E.x, S.x, t), y: lerp(E.y, S.y, t) });
    }
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    diamond(ctx, g.x, g.topY, g.hw, g.hh);
    ctx.stroke();
  }

  drawTurmkrone(g) {
    const ctx = this.ctx;
    // auskragende Brüstung
    const bhw = g.hw * 1.18, bhh = g.hh * 1.18;
    ctx.fillStyle = shade(g.base, -22);
    poly(ctx, [[g.x - bhw, g.topY], [g.x, g.topY + bhh], [g.x, g.topY + bhh - 8], [g.x - bhw, g.topY - 8]]);
    ctx.fillStyle = shade(g.base, -4);
    poly(ctx, [[g.x + bhw, g.topY], [g.x, g.topY + bhh], [g.x, g.topY + bhh - 8], [g.x + bhw, g.topY - 8]]);
    ctx.fillStyle = shade(g.base, 20);
    diamond(ctx, g.x, g.topY - 8, bhw, bhh);
    ctx.fill();

    // Zinnenkranz
    ctx.fillStyle = shade(g.base, 30);
    for (const [dx, dy] of [[-0.6, 0.3], [0, 0.62], [0.6, 0.3], [0, -0.62], [-0.62, -0.3], [0.62, -0.3]]) {
      ctx.fillRect(g.x + dx * bhw - 3, g.topY - 8 + dy * bhh - 7, 6, 8);
    }

    // Spitzdach mit Fahne
    const spitze = g.topY - 34;
    ctx.fillStyle = shade(g.roof, 8);
    poly(ctx, [[g.x - bhw * 0.8, g.topY - 10], [g.x, g.topY - 10 + bhh * 0.8], [g.x, spitze]]);
    ctx.fillStyle = shade(g.roof, -26);
    poly(ctx, [[g.x + bhw * 0.8, g.topY - 10], [g.x, g.topY - 10 + bhh * 0.8], [g.x, spitze]]);
    ctx.strokeStyle = '#d8d2c2';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(g.x, spitze); ctx.lineTo(g.x, spitze - 12);
    ctx.stroke();
    const wave = Math.sin(g.time * 3) * 2;
    ctx.fillStyle = '#c0392b';
    poly(ctx, [[g.x, spitze - 12], [g.x + 12, spitze - 9 + wave], [g.x, spitze - 5]]);
  }

  drawBaugeruest(g) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(226,203,150,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.x - g.hw, g.y + 2); ctx.lineTo(g.x - g.hw, g.topY - 12);
    ctx.moveTo(g.x + g.hw, g.y + 2); ctx.lineTo(g.x + g.hw, g.topY - 12);
    ctx.moveTo(g.x, g.y + g.hh); ctx.lineTo(g.x, g.y + g.hh - g.wallH - 12);
    ctx.moveTo(g.x - g.hw, g.topY - 6); ctx.lineTo(g.x, g.y + g.hh - g.wallH - 6);
    ctx.lineTo(g.x + g.hw, g.topY - 6);
    ctx.stroke();
    // Leiter
    ctx.strokeStyle = 'rgba(196,166,112,0.9)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const yy = g.y + g.hh - 6 - i * (g.wallH / 4);
      ctx.moveTo(g.x + 4, yy); ctx.lineTo(g.x + 13, yy - 4);
    }
    ctx.moveTo(g.x + 4, g.y + g.hh - 4); ctx.lineTo(g.x + 4, g.y + g.hh - g.wallH - 8);
    ctx.moveTo(g.x + 13, g.y + g.hh - 8); ctx.lineTo(g.x + 13, g.y + g.hh - g.wallH - 12);
    ctx.stroke();
  }

  /* ---------------------------------------------------------- */
  /* Einheiten                                                   */
  /* ---------------------------------------------------------- */
  drawUnit(u, w, time) {
    const ctx = this.ctx;
    const st = UNIT_STYLE[u.type] || UNIT_STYLE.siedler;
    const s = (st.scale || 1) * 1.2;
    const moving = !!(u.path && u.path.length);
    const arbeitet = u.work?.phase === 'chop' || u.order?.type === 'gather';

    const schritt = moving ? Math.sin(u.anim * 0.8) : 0;
    const huepf = moving ? Math.abs(Math.sin(u.anim * 0.8)) * 1.5 * s : Math.sin(time * 1.5 + u.id) * 0.5;
    const f = u.facing >= 0 ? 1 : -1;
    const x = w.x;
    const boden = w.y;
    const y = boden - huepf;

    shadow(ctx, x, boden + 1, 7.5 * s, 3.4 * s);

    // Umhang hinter dem Körper
    if (st.umhang) {
      ctx.fillStyle = st.umhang;
      poly(ctx, [
        [x - f * 5 * s, y - 20 * s], [x + f * 4 * s, y - 20 * s],
        [x + f * 2 * s, y - 4 * s], [x - f * 7 * s, y - 5 * s],
      ]);
      ctx.fillStyle = shade(st.umhang, -30);
      poly(ctx, [[x - f * 5 * s, y - 20 * s], [x - f * 7 * s, y - 5 * s], [x - f * 3 * s, y - 8 * s]]);
    }

    // Köcher auf dem Rücken
    if (st.koecher) {
      ctx.fillStyle = '#6b4a2b';
      ctx.save();
      ctx.translate(x - f * 5 * s, y - 15 * s);
      ctx.rotate(f * 0.35);
      ctx.fillRect(-2 * s, -6 * s, 4 * s, 11 * s);
      ctx.fillStyle = '#e8dcc0';
      ctx.fillRect(-1.4 * s, -9 * s, 1 * s, 4 * s);
      ctx.fillRect(0.4 * s, -9.5 * s, 1 * s, 4 * s);
      ctx.restore();
    }

    // Beine
    ctx.fillStyle = st.hose;
    bein(ctx, x - 3.2 * s + schritt * 2 * s, y - 9 * s, 3 * s, 9 * s);
    ctx.fillStyle = shade(st.hose, -18);
    bein(ctx, x + 0.4 * s - schritt * 2 * s, y - 9 * s, 3 * s, 9 * s);

    // Füße
    ctx.fillStyle = '#3b2d20';
    ctx.fillRect(x - 3.4 * s + schritt * 2 * s, y - 1.6 * s, 3.6 * s, 1.8 * s);
    ctx.fillRect(x + 0.2 * s - schritt * 2 * s, y - 1.6 * s, 3.6 * s, 1.8 * s);

    // Arme – hinter dem Rumpf beginnen, damit sie seitlich sichtbar bleiben
    const armSwing = arbeitet ? Math.sin(u.anim * 1.3) * 0.9 : -schritt;
    const schulter = y - 19.5 * s;
    ctx.fillStyle = shade(st.tunika, -30);
    arm(ctx, x - f * 6.3 * s, schulter, 3 * s, 10 * s, -armSwing * 0.55);
    ctx.fillStyle = shade(st.tunika, -8);
    const handX = x + f * 6.3 * s;
    arm(ctx, handX, schulter, 3 * s, 10 * s, armSwing * 0.55);

    // Rumpf: nach unten ausgestellte Tunika
    const schulterB = 4.8 * s, saumB = 6.6 * s;
    const oben = y - 20.8 * s, unten = y - 8 * s;
    ctx.fillStyle = st.tunika;
    poly(ctx, [
      [x - schulterB, oben + 1.5 * s], [x + schulterB, oben + 1.5 * s],
      [x + saumB, unten], [x - saumB, unten],
    ]);
    circle(ctx, x - schulterB + 0.4 * s, oben + 2 * s, 2.2 * s);
    circle(ctx, x + schulterB - 0.4 * s, oben + 2 * s, 2.2 * s);
    ctx.fillRect(x - schulterB, oben + 1.4 * s, schulterB * 2, 3 * s);
    // Lichtkante auf der Blickseite
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    poly(ctx, [
      [x + f * 1.2 * s, oben + 2 * s], [x + f * schulterB, oben + 2 * s],
      [x + f * saumB, unten], [x + f * 2 * s, unten],
    ]);

    // Gürtel
    ctx.fillStyle = shade(st.tunika, -50);
    poly(ctx, [
      [x - saumB * 0.93, unten - 2.6 * s], [x + saumB * 0.93, unten - 2.6 * s],
      [x + saumB * 0.97, unten - 0.4 * s], [x - saumB * 0.97, unten - 0.4 * s],
    ]);
    ctx.fillStyle = '#d8b451';
    ctx.fillRect(x - 1.1 * s, unten - 2.8 * s, 2.2 * s, 2.6 * s);

    // Hals und Kopf
    const kopfY = y - 26 * s;
    ctx.fillStyle = shade(st.haut, -28);
    ctx.fillRect(x - 1.7 * s, kopfY + 2.6 * s, 3.4 * s, 3 * s);

    if (st.kapuze) {
      // Kapuze liegt hinter dem Gesicht, damit die Züge sichtbar bleiben
      ctx.fillStyle = st.kopf;
      circle(ctx, x - f * 0.5 * s, kopfY - 0.4 * s, 5.7 * s);
      poly(ctx, [
        [x - 5.6 * s, kopfY - 0.5 * s], [x + 5.6 * s, kopfY - 0.5 * s],
        [x + 4.2 * s, kopfY + 4.4 * s], [x - 4.2 * s, kopfY + 4.4 * s],
      ]);
    }

    ctx.fillStyle = st.haut;
    circle(ctx, x + (st.kapuze ? f * 0.7 * s : 0), kopfY + (st.kapuze ? 0.5 * s : 0), st.kapuze ? 4.1 * s : 4.9 * s);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(x + (st.kapuze ? f * 0.7 * s : 0), kopfY + (st.kapuze ? 0.5 * s : 0), st.kapuze ? 4.1 * s : 4.9 * s, 0, Math.PI * 2);
    ctx.stroke();

    if (!st.helm) {
      // Augen in Blickrichtung
      const ax = x + (st.kapuze ? f * 0.7 * s : 0), ay = kopfY + (st.kapuze ? 1 * s : 0.6 * s);
      ctx.fillStyle = '#33251c';
      circle(ctx, ax + f * 1.1 * s, ay, 0.62 * s);
      circle(ctx, ax + f * 2.9 * s, ay, 0.62 * s);
    }

    if (st.helm) {
      ctx.fillStyle = st.kopf;
      ctx.beginPath();
      ctx.arc(x, kopfY - 0.2 * s, 5.3 * s, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(x - 5.3 * s, kopfY - 0.4 * s, 10.6 * s, 3.4 * s);
      ctx.fillStyle = '#2a2a2e';
      ctx.fillRect(x - 1.3 * s, kopfY - 0.2 * s, 2.6 * s, 2.6 * s); // Sehschlitz
      ctx.fillStyle = shade(st.kopf, -28);
      ctx.fillRect(x - 5.3 * s, kopfY + 2.6 * s, 10.6 * s, 0.9 * s);
      if (st.hoerner) {
        ctx.fillStyle = '#e6ded0';
        poly(ctx, [[x - 4.8 * s, kopfY - 2.2 * s], [x - 9.4 * s, kopfY - 6.4 * s], [x - 3.8 * s, kopfY - 4.8 * s]]);
        poly(ctx, [[x + 4.8 * s, kopfY - 2.2 * s], [x + 9.4 * s, kopfY - 6.4 * s], [x + 3.8 * s, kopfY - 4.8 * s]]);
      }
    } else if (!st.kapuze) {
      // Haarkappe nur auf dem Oberkopf
      ctx.fillStyle = st.kopf;
      ctx.beginPath();
      ctx.arc(x, kopfY - 1.5 * s, 5 * s, Math.PI * 1.02, Math.PI * 1.98);
      ctx.fill();
      ctx.fillRect(x - 5 * s, kopfY - 2 * s, 10 * s, 1.6 * s);
      // Kotelette auf der Rückseite
      ctx.fillRect(x - f * 4.6 * s - 1.2 * s, kopfY - 1.6 * s, 2.4 * s, 3.4 * s);
    }

    // Hände
    ctx.fillStyle = st.haut;
    circle(ctx, handX + f * 0.4 * s, schulter + 9.4 * s, 1.9 * s);
    circle(ctx, x - f * 6.7 * s, schulter + 9.4 * s, 1.9 * s);

    // Ausrüstung in der vorderen Hand
    const gx = handX + f * 2 * s;
    const gy = schulter + 9 * s + (arbeitet ? Math.sin(u.anim * 1.3) * 4 * s : 0);
    this.drawAusruestung(st.waffe, gx, gy, s, f, arbeitet, u.anim);

    // Schild am hinteren Arm
    if (st.schild) {
      ctx.fillStyle = '#8a3b30';
      ctx.beginPath();
      ctx.ellipse(x - f * 6.4 * s, y - 14 * s, 3.4 * s, 4.8 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e3d6b8';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.fillStyle = '#e3d6b8';
      circle(ctx, x - f * 6.4 * s, y - 14 * s, 1.1 * s);
    }

    // Getragene Ladung über dem Kopf
    let obenY = y - 38 * s;
    if (u.carrying && u.carrying.amount >= 1) {
      ctx.fillStyle = 'rgba(16,22,15,0.5)';
      roundRect(ctx, x - 5 * s, obenY - 5 * s, 10 * s, 8 * s, 2 * s);
      ctx.font = `${8.5 * s}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(RES_ICON[u.carrying.res] || '📦', x, obenY - 1 * s);
      obenY -= 9 * s;
    }

    if (u.hp < u.maxHp) this.bar(x, obenY - 4 * s, 20, u.hp / u.maxHp, u.enemy ? '#e26a5a' : '#7ec850');

    const sel = this.game.selection;
    if (sel && sel.kind === 'unit' && sel.id === u.id) ring(ctx, x, boden, 11, '#8fd14f');
    else if (u.isHero) ring(ctx, x, boden, 11, 'rgba(120,180,255,0.5)');
    else if (u.enemy) ring(ctx, x, boden, 9, 'rgba(226,96,63,0.42)');
  }

  drawAusruestung(art, x, y, s, f, arbeitet, anim) {
    const ctx = this.ctx;
    switch (art) {
      case 'schwert':
        ctx.strokeStyle = '#8a5a2b';
        ctx.lineWidth = 1.8 * s;
        ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(x + f * 0.6 * s, y - 2.5 * s);
        ctx.stroke();
        ctx.fillStyle = '#d9e0e8';
        poly(ctx, [
          [x + f * 0.2 * s, y - 3 * s], [x + f * 2 * s, y - 3.4 * s],
          [x + f * 5.4 * s, y - 13 * s], [x + f * 2.6 * s, y - 12.4 * s],
        ]);
        ctx.fillStyle = '#b7861f';
        ctx.fillRect(x - f * 1.4 * s, y - 4 * s, f * 4.6 * s, 1.6 * s);
        break;
      case 'axt':
        ctx.strokeStyle = '#7a5330';
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.moveTo(x, y + 1 * s); ctx.lineTo(x + f * 3.4 * s, y - 11 * s);
        ctx.stroke();
        ctx.fillStyle = '#c9d2da';
        poly(ctx, [
          [x + f * 3 * s, y - 11 * s], [x + f * 8 * s, y - 13 * s],
          [x + f * 7 * s, y - 7 * s], [x + f * 2.4 * s, y - 8 * s],
        ]);
        break;
      case 'werkzeug': {
        const winkel = arbeitet ? Math.sin(anim * 1.3) * 0.5 : 0;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(winkel * f);
        ctx.strokeStyle = '#8a5a2b';
        ctx.lineWidth = 1.7 * s;
        ctx.beginPath();
        ctx.moveTo(0, 1 * s); ctx.lineTo(f * 2.4 * s, -9 * s);
        ctx.stroke();
        ctx.fillStyle = '#b9c2cb';
        poly(ctx, [[f * 2 * s, -9 * s], [f * 6 * s, -10.6 * s], [f * 5.4 * s, -6.4 * s], [f * 1.6 * s, -6 * s]]);
        ctx.restore();
        break;
      }
      case 'bogen':
        ctx.strokeStyle = '#8a5a2b';
        ctx.lineWidth = 1.7 * s;
        ctx.beginPath();
        ctx.arc(x + f * 1 * s, y - 5 * s, 7 * s, f > 0 ? -1.25 : Math.PI + 1.25, f > 0 ? 1.25 : Math.PI - 1.25, f < 0);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(240,236,220,0.85)';
        ctx.lineWidth = 0.8 * s;
        ctx.beginPath();
        ctx.moveTo(x + f * 3.2 * s, y - 11.6 * s);
        ctx.lineTo(x + f * 3.2 * s, y + 1.6 * s);
        ctx.stroke();
        break;
      case 'keule':
        ctx.strokeStyle = '#6b4a2b';
        ctx.lineWidth = 2.2 * s;
        ctx.beginPath();
        ctx.moveTo(x, y + 1 * s); ctx.lineTo(x + f * 2.6 * s, y - 8 * s);
        ctx.stroke();
        ctx.fillStyle = '#5a3f26';
        circle(ctx, x + f * 3.2 * s, y - 10 * s, 3 * s);
        ctx.fillStyle = '#87664a';
        circle(ctx, x + f * 2.4 * s, y - 10.8 * s, 1.2 * s);
        break;
    }
  }

  /* ---------------------------------------------------------- */
  drawProjectile(p, w) {
    const ctx = this.ctx;
    ctx.strokeStyle = '#f4e3b0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w.x - 5, w.y - 13);
    ctx.lineTo(w.x + 5, w.y - 18);
    ctx.stroke();
    ctx.fillStyle = '#cfd6de';
    poly(ctx, [[w.x + 5, w.y - 18], [w.x + 8, w.y - 19.5], [w.x + 5, w.y - 15.5]]);
  }

  drawEffect(e, w) {
    const ctx = this.ctx;
    const t = e.life / e.max;
    ctx.globalAlpha = t;
    if (e.type === 'hit') {
      ctx.fillStyle = '#ffe6a0';
      const r = 6 * (1.4 - t);
      poly(ctx, [
        [w.x, w.y - 14 - r], [w.x + r * 0.4, w.y - 14 - r * 0.4], [w.x + r, w.y - 14],
        [w.x + r * 0.4, w.y - 14 + r * 0.4], [w.x, w.y - 14 + r], [w.x - r * 0.4, w.y - 14 + r * 0.4],
        [w.x - r, w.y - 14], [w.x - r * 0.4, w.y - 14 - r * 0.4],
      ]);
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
        diamond(ctx, w.x, w.y, HW, HH);
        ctx.fill();
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

/* =================================================================
   Anbauten je Gebäudetyp
   Punkte auf den Wandflächen: u = 0 (vordere Ecke) … 1 (Seitenecke),
   v = 0 (Boden) … 1 (Traufe)
   ================================================================= */
const onLeft = (g, u, v) => ({ x: g.x - g.hw * u, y: g.y + g.hh - g.hh * u - v * g.wallH });
const onRight = (g, u, v) => ({ x: g.x + g.hw * u, y: g.y + g.hh - g.hh * u - v * g.wallH });

function facePanel(ctx, g, seite, u1, u2, v1, v2, fill, stroke) {
  const at = seite === 'links' ? onLeft : onRight;
  const p = [at(g, u1, v1), at(g, u2, v1), at(g, u2, v2), at(g, u1, v2)];
  ctx.fillStyle = fill;
  poly(ctx, p.map((q) => [q.x, q.y]));
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
    ctx.closePath();
    ctx.stroke();
  }
}

function tuer(ctx, g, seite = 'rechts', u = 0.34) {
  facePanel(ctx, g, seite, u - 0.13, u + 0.13, 0, 0.62, '#573a20', OUTLINE);
  const at = seite === 'links' ? onLeft : onRight;
  const griff = at(g, u + 0.09, 0.3);
  ctx.fillStyle = '#e0c268';
  circle(ctx, griff.x, griff.y, 1.1);
}

function fenster(ctx, g, seite, u, v = 0.62, warm = false) {
  facePanel(ctx, g, seite, u - 0.09, u + 0.09, v - 0.16, v + 0.16, warm ? '#f0b64a' : '#3c4a55', OUTLINE);
}

function schornstein(ctx, g, dx, rauch) {
  const x = g.x + dx;
  const basis = g.apexY + (g.topY - g.apexY) * 0.35;
  ctx.fillStyle = '#7d6a5a';
  ctx.fillRect(x - 3.5, basis - 12, 7, 14);
  ctx.fillStyle = '#5d4e42';
  ctx.fillRect(x - 4.2, basis - 14, 8.4, 3);
  if (rauch != null) {
    for (let i = 0; i < 3; i++) {
      const t = (rauch * 0.6 + i * 0.33) % 1;
      ctx.globalAlpha = (1 - t) * 0.45;
      ctx.fillStyle = '#d8d8d0';
      circle(ctx, x + Math.sin(t * 4 + i) * 3, basis - 16 - t * 22, 2 + t * 4);
    }
    ctx.globalAlpha = 1;
  }
}

/** Bodenstapel vor dem Gebäude (in Blickrichtung Süden). */
function stapel(ctx, g, dx, dy, zeichnen) {
  ctx.save();
  ctx.translate(g.x + dx, g.y + g.hh + dy);
  zeichnen(ctx);
  ctx.restore();
}

function holzStapel(ctx) {
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i % 2 ? '#8a6238' : '#7b5730';
    ctx.fillRect(-9 + i * 1.5, -4 - i * 3.5, 18 - i * 3, 3.6);
    ctx.fillStyle = '#c8a877';
    circle(ctx, -9 + i * 1.5 + 1, -2.2 - i * 3.5, 1.6);
    circle(ctx, -9 + i * 1.5 + 17 - i * 3, -2.2 - i * 3.5, 1.6);
  }
}

function steinStapel(ctx) {
  const steine = [[-7, 0, 4.5], [0, -1, 5], [6, 0.5, 4], [-3, -5, 3.6], [3, -6, 3.2]];
  for (const [sx, sy, r] of steine) {
    ctx.fillStyle = '#8d8d85';
    circle(ctx, sx, sy - r * 0.4, r);
    ctx.fillStyle = '#a9a9a0';
    circle(ctx, sx - r * 0.25, sy - r * 0.7, r * 0.55);
  }
}

function quaderStapel(ctx) {
  const legen = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x, y, w, h);
  };
  legen(-10, -5, 9, 5, '#b6b5ab');
  legen(0, -5, 9, 5, '#a8a79d');
  legen(-5, -10, 9, 5, '#c0bfb4');
}

function saecke(ctx) {
  for (const [sx, sy, r] of [[-6, 0, 4], [1, 1, 4.5], [-2, -5, 3.6]]) {
    ctx.fillStyle = '#c9b183';
    ctx.beginPath();
    ctx.ellipse(sx, sy - r * 0.5, r * 0.8, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a58f66';
    ctx.fillRect(sx - 1.4, sy - r * 1.4, 2.8, 2);
  }
}

export const BUILDING_PROPS = {
  lager: (ctx, g, b) => {
    // breites Tor mit Balkenkreuz plus Kisten davor
    facePanel(ctx, g, 'rechts', 0.16, 0.62, 0, 0.72, '#6a4726', OUTLINE);
    facePanel(ctx, g, 'rechts', 0.36, 0.4, 0, 0.72, '#4d3319', null);
    fenster(ctx, g, 'links', 0.45, 0.72, true);
    stapel(ctx, g, -18, 6, (c) => {
      c.fillStyle = '#9a7343';
      c.fillRect(-7, -9, 14, 9);
      c.strokeStyle = OUTLINE; c.lineWidth = 1;
      c.strokeRect(-7, -9, 14, 9);
      c.beginPath(); c.moveTo(-7, -4.5); c.lineTo(7, -4.5); c.stroke();
    });
    stapel(ctx, g, 20, 4, saecke);
  },

  holzfaeller: (ctx, g, b) => {
    tuer(ctx, g, 'rechts', 0.36);
    fenster(ctx, g, 'links', 0.42, 0.66);
    stapel(ctx, g, -20, 5, holzStapel);
    // Hackklotz mit Axt
    stapel(ctx, g, 19, 5, (c) => {
      c.fillStyle = '#6f4e2d';
      c.beginPath(); c.ellipse(0, -4, 5, 2.6, 0, 0, Math.PI * 2); c.fill();
      c.fillRect(-5, -4, 10, 4);
      c.fillStyle = '#c8a877';
      c.beginPath(); c.ellipse(0, -4, 5, 2.6, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#7a5330'; c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(1, -5); c.lineTo(5, -14); c.stroke();
      c.fillStyle = '#c9d2da';
      poly(c, [[4.4, -14], [9, -15.6], [8.4, -11], [4, -11.4]]);
    });
  },

  steinbruch: (ctx, g, b) => {
    tuer(ctx, g, 'rechts', 0.34);
    stapel(ctx, g, -20, 6, steinStapel);
    stapel(ctx, g, 19, 4, (c) => {
      // Schubkarre
      c.fillStyle = '#7a5330';
      c.fillRect(-7, -8, 13, 5);
      c.fillStyle = '#8d8d85';
      circle(c, -2, -9, 2.6);
      circle(c, 2.4, -9.6, 2.2);
      c.fillStyle = '#4b3a28';
      circle(c, -5, -1.6, 2.6);
    });
  },

  bauernhof: (ctx, g, b) => {
    facePanel(ctx, g, 'rechts', 0.2, 0.5, 0, 0.66, '#7d4f2c', OUTLINE);
    fenster(ctx, g, 'links', 0.4, 0.68);
    // Silo als Rundturm an der Gebäudeseite
    const sx = g.x - g.hw * 0.78, sy = g.y - g.hh * 0.2;
    const sh = g.wallH + 10;
    ctx.fillStyle = '#9c8d70';
    ctx.fillRect(sx - 6, sy - sh, 12, sh);
    ctx.fillStyle = '#b3a486';
    ctx.fillRect(sx - 6, sy - sh, 5, sh);
    ctx.fillStyle = '#7f7259';
    ctx.beginPath();
    ctx.ellipse(sx, sy - sh, 6, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6d6149';
    ctx.beginPath();
    ctx.ellipse(sx, sy - sh - 1, 6.6, 3.6, 0, Math.PI, 0);
    ctx.fill();
    // Acker als Rautenfeld vor dem Hof
    const fx = g.x, fy = g.y + g.hh + 17;
    ctx.fillStyle = '#7a5731';
    diamond(ctx, fx, fy, 30, 15);
    ctx.fill();
    ctx.strokeStyle = '#946d3d';
    ctx.lineWidth = 1.4;
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      ctx.beginPath();
      ctx.moveTo(fx - 30 + 30 * t, fy - 15 * t);
      ctx.lineTo(fx + 30 * t, fy + 15 - 15 * t);
      ctx.stroke();
    }
    ctx.fillStyle = '#cdb242';
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      for (let k = 1; k <= 3; k++) {
        const q = k / 4;
        const px = lerp(fx - 30 + 30 * t, fx + 30 * t, q);
        const py = lerp(fy - 15 * t, fy + 15 - 15 * t, q);
        ctx.fillRect(px - 0.8, py - 4, 1.6, 4);
      }
    }
  },

  haus: (ctx, g, b) => {
    tuer(ctx, g, 'rechts', 0.36);
    fenster(ctx, g, 'links', 0.45, 0.66, true);
    fenster(ctx, g, 'rechts', 0.74, 0.66, true);
    schornstein(ctx, g, 8, g.anim);
    // Blumenkasten unter dem Fenster
    const f = onLeft(g, 0.45, 0.4);
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(f.x - 4.5, f.y - 1, 9, 2.4);
    ctx.fillStyle = '#d05a6e';
    circle(ctx, f.x - 2.6, f.y - 1.8, 1.2);
    circle(ctx, f.x + 0.2, f.y - 2.2, 1.2);
    circle(ctx, f.x + 2.8, f.y - 1.8, 1.2);
  },

  saegewerk: (ctx, g, b) => {
    facePanel(ctx, g, 'rechts', 0.18, 0.52, 0, 0.7, '#6b4c2a', OUTLINE);
    // Sägeblatt an der Wand
    const p = onLeft(g, 0.5, 0.6);
    const dreh = g.anim * 1.2;
    ctx.fillStyle = '#cdd4db';
    circle(ctx, p.x, p.y, 7);
    ctx.fillStyle = '#9aa3ac';
    for (let i = 0; i < 10; i++) {
      const a = dreh + (i / 10) * Math.PI * 2;
      poly(ctx, [
        [p.x + Math.cos(a) * 7, p.y + Math.sin(a) * 4],
        [p.x + Math.cos(a + 0.3) * 8.6, p.y + Math.sin(a + 0.3) * 5],
        [p.x + Math.cos(a + 0.6) * 7, p.y + Math.sin(a + 0.6) * 4],
      ]);
    }
    ctx.fillStyle = '#5e6670';
    circle(ctx, p.x, p.y, 1.8);
    stapel(ctx, g, -20, 6, (c) => {
      for (let i = 0; i < 4; i++) {
        c.fillStyle = i % 2 ? '#d3b482' : '#c2a06d';
        c.fillRect(-11, -3 - i * 3, 22, 2.6);
        c.strokeStyle = OUTLINE; c.lineWidth = 0.7;
        c.strokeRect(-11, -3 - i * 3, 22, 2.6);
      }
    });
  },

  steinmetz: (ctx, g, b) => {
    facePanel(ctx, g, 'rechts', 0.2, 0.5, 0, 0.68, '#5f5f58', OUTLINE);
    fenster(ctx, g, 'links', 0.42, 0.66);
    stapel(ctx, g, -20, 6, quaderStapel);
    // Werkbank mit Meißel
    stapel(ctx, g, 20, 5, (c) => {
      c.fillStyle = '#7a5330';
      c.fillRect(-8, -7, 16, 3);
      c.fillRect(-7, -4, 2, 4);
      c.fillRect(5, -4, 2, 4);
      c.fillStyle = '#b6b5ab';
      c.fillRect(-4, -11, 8, 4);
      c.strokeStyle = '#cdd4db'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(2, -12); c.lineTo(6, -17); c.stroke();
    });
  },

  schmiede: (ctx, g, b) => {
    // offene Esse mit Glut
    facePanel(ctx, g, 'rechts', 0.2, 0.56, 0.06, 0.6, '#2e2622', OUTLINE);
    const glut = 0.5 + Math.sin(g.anim * 3) * 0.25;
    const e = onRight(g, 0.38, 0.3);
    ctx.globalAlpha = glut;
    ctx.fillStyle = '#ff8a3c';
    circle(ctx, e.x, e.y, 5.5);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffd08a';
    circle(ctx, e.x, e.y, 2.4);
    schornstein(ctx, g, -4, g.anim);
    // Amboss davor
    stapel(ctx, g, 17, 5, (c) => {
      c.fillStyle = '#4a4a52';
      c.fillRect(-3, -4, 6, 4);
      c.fillRect(-6, -9, 13, 4);
      poly(c, [[7, -9], [12, -7.5], [7, -5]]);
      c.fillStyle = '#5f5f6a';
      c.fillRect(-6, -9, 13, 1.4);
    });
  },

  kaserne: (ctx, g, b) => {
    facePanel(ctx, g, 'rechts', 0.2, 0.52, 0, 0.74, '#4e3a28', OUTLINE);
    fenster(ctx, g, 'links', 0.4, 0.7);
    fenster(ctx, g, 'links', 0.72, 0.7);
    // Wappenbanner neben dem Tor
    for (const [seite, u] of [['rechts', 0.66], ['links', 0.2]]) {
      const at = seite === 'links' ? onLeft : onRight;
      const p = at(g, u, 0.86);
      ctx.fillStyle = '#8d2f28';
      poly(ctx, [[p.x - 4, p.y], [p.x + 4, p.y], [p.x + 4, p.y + 13], [p.x, p.y + 10], [p.x - 4, p.y + 13]]);
      ctx.fillStyle = '#e8c06a';
      poly(ctx, [[p.x, p.y + 3], [p.x + 2.6, p.y + 6], [p.x, p.y + 9], [p.x - 2.6, p.y + 6]]);
    }
    // Waffenständer
    stapel(ctx, g, 22, 4, (c) => {
      c.strokeStyle = '#8a5a2b'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(-5, 0); c.lineTo(-3, -13); c.moveTo(5, 0); c.lineTo(3, -13); c.stroke();
      c.strokeStyle = '#cdd4db'; c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(-2, -1); c.lineTo(-4, -15); c.moveTo(2, -1); c.lineTo(4, -15); c.stroke();
    });
  },

  bogenstand: (ctx, g, b) => {
    facePanel(ctx, g, 'rechts', 0.22, 0.5, 0, 0.66, '#4b5c34', OUTLINE);
    // Zielscheibe an der Wand
    const p = onLeft(g, 0.55, 0.58);
    for (const [r, c] of [[7, '#efe7d4'], [5, '#d8534a'], [3, '#efe7d4'], [1.4, '#d8534a']]) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#e8dcc0';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(p.x + 2, p.y - 1); ctx.lineTo(p.x + 11, p.y - 5);
    ctx.stroke();
    // Strohballen davor
    stapel(ctx, g, 20, 5, (c) => {
      c.fillStyle = '#cbb15c';
      roundRect(c, -8, -9, 16, 9, 3);
      c.strokeStyle = '#a68f45'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(-8, -5.5); c.lineTo(8, -5.5); c.stroke();
    });
  },

  turm: (ctx, g, b) => {
    // Schießscharten
    facePanel(ctx, g, 'rechts', 0.42, 0.5, 0.4, 0.74, '#2c2c30', null);
    facePanel(ctx, g, 'links', 0.42, 0.5, 0.4, 0.74, '#2c2c30', null);
    // Tür am Fuß
    tuer(ctx, g, 'rechts', 0.24);
    // Mauerwerk andeuten
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const v = i / 5;
      const a = onLeft(g, 1, v), c = onRight(g, 1, v);
      const m = onLeft(g, 0, v);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(m.x, m.y); ctx.lineTo(c.x, c.y);
      ctx.stroke();
    }
  },

  mauer: (ctx, g, b) => {
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i++) {
      const v = i / 3;
      const a = onLeft(g, 1, v), m = onLeft(g, 0, v), c = onRight(g, 1, v);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(m.x, m.y); ctx.lineTo(c.x, c.y);
      ctx.stroke();
    }
  },
};

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

function diamond(ctx, x, y, hw, hh) {
  ctx.beginPath();
  ctx.moveTo(x, y - hh);
  ctx.lineTo(x + hw, y);
  ctx.lineTo(x, y + hh);
  ctx.lineTo(x - hw, y);
  ctx.closePath();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
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
  ctx.ellipse(x, y + 2, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2);
  ctx.fill();
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fill();
}

/** Bein mit leicht gerundetem Abschluss. */
function bein(ctx, x, y, w, h) {
  roundRect(ctx, x, y, w, h, w * 0.45);
}

/** Arm, um den Schulterpunkt geneigt. */
function arm(ctx, x, y, w, h, neigung) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(neigung);
  roundRect(ctx, -w / 2, 0, w, h, w * 0.5);
  ctx.restore();
}

const lerp = (a, b, t) => a + (b - a) * t;

/** Farbe aufhellen/abdunkeln. */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
