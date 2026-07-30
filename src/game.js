/* Spielzustand und Spiellogik. */

import {
  BUILDINGS, UNITS, START_RESOURCES, BASE_POP_CAP, BASE_STORAGE,
  RESOURCES, WAVE, MAP_W, MAP_H,
} from './config.js';
import { World } from './world.js';
import { Unit } from './entities.js';
import { Building, canPlace } from './buildings.js';
import { dist, setIdCounter, peekId, clamp } from './utils.js';
import { tileToWorld } from './iso.js';

export class Game {
  constructor(seed) {
    this.world = new World(seed);
    this.units = [];
    this.buildings = [];
    this.projectiles = [];
    this.effects = [];
    this.resources = { ...START_RESOURCES };
    this.time = 0;
    this.waveNumber = 0;
    this.nextWaveAt = WAVE.firstAt;
    this.claims = new Map(); // nodeKey -> unitId
    this.selection = null;   // {kind:'unit'|'building', id}
    this.buildMode = null;   // Gebäudetyp
    this.gameOver = false;
    this.listeners = {};
    this.cam = { x: 0, y: 0, zoom: 1, vw: 800, vh: 600 };
    this.stats = { gathered: 0, built: 0, killed: 0 };
  }

  /* ---------------------------------------------------------- */
  /* Ereignisse (für die UI)                                     */
  /* ---------------------------------------------------------- */
  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, data) { (this.listeners[evt] || []).forEach((f) => f(data)); }

  /* ---------------------------------------------------------- */
  /* Aufbau eines neuen Spiels                                   */
  /* ---------------------------------------------------------- */
  startNew() {
    const cx = Math.floor(MAP_W / 2), cy = Math.floor(MAP_H / 2);

    // Startlager
    const lager = this.placeBuildingRaw('lager', cx - 1, cy - 1);
    lager.done = true;
    lager.hp = lager.maxHp;
    lager.buildProgress = lager.buildTime;

    // Held
    this.hero = this.spawnUnit('held', cx + 2, cy + 2);

    // zwei Siedler zum Start
    this.spawnUnit('siedler', cx + 2, cy - 1);
    this.spawnUnit('siedler', cx - 2, cy + 2);

    this.centerOn(cx, cy);
    // auf schmalen Bildschirmen weiter herauszoomen, damit mehr Welt sichtbar ist
    this.cam.zoom = typeof window !== 'undefined' && window.innerWidth < 700 ? 0.7 : 1;
    return this;
  }

  centerOn(tx, ty) {
    const w = tileToWorld(tx, ty);
    this.cam.x = w.x;
    this.cam.y = w.y;
  }

  /* ---------------------------------------------------------- */
  /* Nachschlagen                                                */
  /* ---------------------------------------------------------- */
  getUnit(id) { return this.units.find((u) => u.id === id && u.alive) || null; }
  getBuilding(id) { return this.buildings.find((b) => b.id === id && b.alive) || null; }
  getEntity(id) { return this.getUnit(id) || this.getBuilding(id); }

  unitAt(tx, ty, radius = 0.7, filter = null) {
    let best = null, bestD = radius;
    for (const u of this.units) {
      if (!u.alive || (filter && !filter(u))) continue;
      const d = dist(u.x, u.y, tx, ty);
      if (d <= bestD) { bestD = d; best = u; }
    }
    return best;
  }

  buildingAt(tx, ty) {
    const x = Math.round(tx), y = Math.round(ty);
    const id = this.world.occupied.get(this.world.key(x, y));
    return id ? this.getBuilding(id) : null;
  }

  nearestEnemyTo(x, y, range = Infinity) {
    let best = null, bestD = range;
    for (const u of this.units) {
      if (!u.alive || !u.enemy) continue;
      const d = dist(u.x, u.y, x, y);
      if (d <= bestD) { bestD = d; best = u; }
    }
    return best;
  }

  nearestBuildingTo(x, y, range = Infinity, filter = null) {
    let best = null, bestD = range;
    for (const b of this.buildings) {
      if (!b.alive || (filter && !filter(b))) continue;
      const d = dist(b.cx, b.cy, x, y) - b.size * 0.5;
      if (d <= bestD) { bestD = d; best = b; }
    }
    return best;
  }

  /** Ziel für Feinde: nächste eigene Einheit oder nächstes Gebäude. */
  pickEnemyTarget(x, y) {
    let best = null, bestD = Infinity;
    for (const u of this.units) {
      if (!u.alive || u.enemy) continue;
      const d = dist(u.x, u.y, x, y);
      if (d < bestD) { bestD = d; best = u; }
    }
    for (const b of this.buildings) {
      if (!b.alive) continue;
      const d = dist(b.cx, b.cy, x, y) * 1.15; // Einheiten leicht bevorzugen
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  findNearestStorage(x, y) {
    return this.nearestBuildingTo(x, y, Infinity, (b) => b.done && (BUILDINGS[b.type].storage || b.type === 'lager'));
  }

  /* ---------------------------------------------------------- */
  /* Ressourcen                                                  */
  /* ---------------------------------------------------------- */
  get storageCap() {
    let cap = BASE_STORAGE;
    for (const b of this.buildings) if (b.alive && b.done && BUILDINGS[b.type].storage) cap += BUILDINGS[b.type].storage;
    return cap;
  }

  addResource(res, amount) {
    if (!res || amount <= 0) return;
    const cap = this.storageCap;
    const before = this.resources[res] || 0;
    this.resources[res] = Math.min(cap, before + amount);
    this.stats.gathered += this.resources[res] - before;
    this.emit('resources');
  }

  canAfford(cost) {
    if (!cost) return true;
    for (const [res, amt] of Object.entries(cost)) if ((this.resources[res] || 0) < amt) return false;
    return true;
  }

  pay(cost) {
    if (!cost) return;
    for (const [res, amt] of Object.entries(cost)) this.resources[res] -= amt;
    this.emit('resources');
  }

  refund(cost, factor = 1) {
    if (!cost) return;
    for (const [res, amt] of Object.entries(cost)) this.addResource(res, Math.floor(amt * factor));
  }

  get popUsed() {
    let n = 0;
    for (const u of this.units) if (u.alive && !u.enemy) n += UNITS[u.type].pop || 0;
    for (const b of this.buildings) if (b.alive) n += b.trainQueue.reduce((s, j) => s + (UNITS[j.unit].pop || 0), 0);
    return n;
  }

  get popCap() {
    let cap = BASE_POP_CAP;
    for (const b of this.buildings) if (b.alive && b.done && BUILDINGS[b.type].popCap) cap += BUILDINGS[b.type].popCap;
    return cap;
  }

  /* ---------------------------------------------------------- */
  /* Bauen                                                       */
  /* ---------------------------------------------------------- */
  canBuildHere(type, x, y) { return canPlace(this.world, type, x, y); }

  placeBuildingRaw(type, x, y) {
    const b = new Building(type, x, y);
    this.buildings.push(b);
    for (const [tx, ty] of b.tiles()) this.world.occupied.set(this.world.key(tx, ty), b.id);
    this.evictUnits(b);
    return b;
  }

  /** Einheiten, die auf der Baufläche stehen, auf ein freies Nachbarfeld setzen. */
  evictUnits(b) {
    const inside = new Set(b.tiles().map(([tx, ty]) => this.world.key(tx, ty)));
    for (const u of this.units) {
      if (!u.alive) continue;
      if (!inside.has(this.world.key(Math.round(u.x), Math.round(u.y)))) continue;
      const spot = this.world.adjacentWalkable(Math.round(b.cx), Math.round(b.cy), u.x, u.y);
      if (spot) { u.x = spot.x; u.y = spot.y; u.path = null; }
    }
  }

  tryBuild(type, x, y) {
    const def = BUILDINGS[type];
    if (!this.canBuildHere(type, x, y)) return { ok: false, msg: 'Hier ist kein Platz.' };
    if (!this.canAfford(def.cost)) return { ok: false, msg: 'Nicht genug Rohstoffe.' };
    this.pay(def.cost);
    const b = this.placeBuildingRaw(type, x, y);
    this.stats.built++;
    this.emit('changed');
    return { ok: true, building: b };
  }

  demolish(b) {
    if (!b) return;
    for (const [tx, ty] of b.tiles()) this.world.occupied.delete(this.world.key(tx, ty));
    for (const id of b.workers) { const u = this.getUnit(id); if (u) { u.workplace = null; u.work = { phase: 'idle', nodeKey: null, timer: 0 }; } }
    b.hp = 0;
    this.refund(BUILDINGS[b.type].cost, 0.5);
    this.buildings = this.buildings.filter((x) => x !== b);
    if (this.selection?.kind === 'building' && this.selection.id === b.id) this.selection = null;
    this.emit('changed');
  }

  onBuildingFinished(b) {
    this.emit('toast', `${BUILDINGS[b.type].name} fertiggestellt`);
    this.emit('changed');
  }

  /* ---------------------------------------------------------- */
  /* Arbeiter & Ausbildung                                       */
  /* ---------------------------------------------------------- */
  idleWorkers() { return this.units.filter((u) => u.alive && u.isWorker && !u.workplace); }

  assignWorker(b) {
    if (b.workers.length >= b.maxWorkers) return false;
    const pool = this.idleWorkers();
    if (!pool.length) { this.emit('toast', 'Kein freier Siedler verfügbar'); return false; }
    pool.sort((a, c) => dist(a.x, a.y, b.cx, b.cy) - dist(c.x, c.y, b.cx, b.cy));
    const u = pool[0];
    u.workplace = b.id;
    u.order = { type: 'idle' };
    u.work = { phase: 'seek', nodeKey: null, timer: 0 };
    b.workers.push(u.id);
    this.emit('changed');
    return true;
  }

  /** Einen bestimmten Siedler einer Arbeitsstelle zuweisen. */
  assignSpecificWorker(b, u) {
    if (!b || !u || !u.isWorker) return false;
    if (b.workers.length >= b.maxWorkers) { this.emit('toast', 'Kein Arbeitsplatz frei.'); return false; }
    if (u.workplace) this.removeWorkerById(this.getBuilding(u.workplace), u.id);
    u.workplace = b.id;
    u.order = { type: 'idle' };
    u.work = { phase: 'seek', nodeKey: null, timer: 0 };
    b.workers.push(u.id);
    this.emit('changed');
    return true;
  }

  removeWorkerById(b, id) {
    if (!b) return false;
    const i = b.workers.indexOf(id);
    if (i < 0) return false;
    b.workers.splice(i, 1);
    const u = this.getUnit(id);
    if (u) {
      u.releaseNode(this);
      u.workplace = null;
      u.work = { phase: 'idle', nodeKey: null, timer: 0 };
      u.order = { type: 'idle' };
    }
    this.emit('changed');
    return true;
  }

  removeWorker(b) {
    const id = b.workers.pop();
    if (id == null) return false;
    const u = this.getUnit(id);
    if (u) {
      u.releaseNode(this);
      u.workplace = null;
      u.work = { phase: 'idle', nodeKey: null, timer: 0 };
      u.order = { type: 'idle' };
    }
    this.emit('changed');
    return true;
  }

  queueUnit(b, unitType) {
    const def = UNITS[unitType];
    if (!this.canAfford(def.cost)) { this.emit('toast', 'Nicht genug Rohstoffe.'); return false; }
    if (this.popUsed + (def.pop || 0) > this.popCap) { this.emit('toast', 'Kein Wohnraum – baue ein Wohnhaus.'); return false; }
    if (b.trainQueue.length >= 5) { this.emit('toast', 'Warteschlange voll.'); return false; }
    this.pay(def.cost);
    b.trainQueue.push({ unit: unitType, left: def.trainTime });
    this.emit('changed');
    return true;
  }

  cancelTraining(b, index) {
    const job = b.trainQueue[index];
    if (!job) return;
    b.trainQueue.splice(index, 1);
    this.refund(UNITS[job.unit].cost, 1);
    this.emit('changed');
  }

  spawnUnit(type, x, y) {
    const u = new Unit(type, x, y);
    this.units.push(u);
    return u;
  }

  spawnUnitAt(type, b) {
    const spot = this.world.adjacentWalkable(Math.round(b.cx), Math.round(b.cy)) || { x: b.cx, y: b.cy + b.size };
    const u = this.spawnUnit(type, spot.x, spot.y);
    this.emit('toast', `${UNITS[type].name} ausgebildet`);
    this.emit('changed');
    return u;
  }

  /* ---------------------------------------------------------- */
  /* Node-Reservierung (damit Arbeiter nicht denselben Baum wählen) */
  /* ---------------------------------------------------------- */
  claimNode(key, unitId) { this.claims.set(key, unitId); }
  releaseNode(key, unitId) { if (this.claims.get(key) === unitId) this.claims.delete(key); }
  nodeClaimedByOther(node, unitId) {
    const owner = this.claims.get(this.world.key(node.x, node.y));
    return owner != null && owner !== unitId && this.getUnit(owner) != null;
  }

  /* ---------------------------------------------------------- */
  /* Kampf & Effekte                                             */
  /* ---------------------------------------------------------- */
  damage(target, amount, from) {
    if (!target || !target.alive) return;
    target.hp -= amount;
    if (target.hp <= 0) this.onDeath(target, from);
  }

  onDeath(target, from) {
    if (target instanceof Building) {
      this.emit('toast', `${BUILDINGS[target.type].name} zerstört!`);
      for (const [tx, ty] of target.tiles()) this.world.occupied.delete(this.world.key(tx, ty));
      for (const id of target.workers) { const u = this.getUnit(id); if (u) { u.workplace = null; u.work = { phase: 'idle', nodeKey: null, timer: 0 }; } }
      this.spawnPuff(target.cx, target.cy, '#c07a3a');
    } else {
      if (target.enemy) this.stats.killed++;
      else if (target.isHero) {
        this.emit('toast', 'Dein Held ist gefallen – er kehrt bald zurück.');
        target.respawnIn = 12;
      }
      if (target.workplace) {
        const b = this.getBuilding(target.workplace);
        if (b) b.workers = b.workers.filter((i) => i !== target.id);
      }
      target.releaseNode?.(this);
      this.spawnPuff(target.x, target.y, target.enemy ? '#a5504a' : '#d9b382');
    }
    if (this.selection && this.selection.id === target.id) this.selection = null;
    this.emit('changed');
  }

  spawnProjectile(x, y, target, damage, from) {
    this.projectiles.push({ x, y, target, damage, from, speed: 12, life: 3 });
  }

  spawnHit(x, y) { this.effects.push({ type: 'hit', x, y, life: 0.25, max: 0.25 }); }
  spawnPuff(x, y, color) { this.effects.push({ type: 'puff', x, y, color, life: 0.6, max: 0.6 }); }
  spawnFloat(x, y, text) { this.effects.push({ type: 'float', x, y, text, life: 1.1, max: 1.1 }); }

  /* ---------------------------------------------------------- */
  /* Angriffswellen                                              */
  /* ---------------------------------------------------------- */
  updateWaves(dt) {
    if (this.time < this.nextWaveAt) return;
    this.waveNumber++;
    this.nextWaveAt = this.time + WAVE.interval;
    const count = Math.round(WAVE.baseCount * Math.pow(WAVE.growth, this.waveNumber - 1));
    const edge = Math.floor(Math.random() * 4);
    const spawns = [];
    for (let i = 0; i < count; i++) {
      const p = this.findEdgeSpawn(edge);
      if (p) spawns.push(p);
    }
    spawns.forEach((p, i) => {
      const boss = this.waveNumber >= 3 && i === 0;
      const u = this.spawnUnit(boss ? 'raeuberboss' : 'raeuber', p.x, p.y);
      u.hp = u.maxHp = Math.round(u.maxHp * (1 + 0.12 * (this.waveNumber - 1)));
    });
    this.emit('toast', `⚔️ Welle ${this.waveNumber}: ${spawns.length} Räuber greifen an!`);
    this.emit('wave');
  }

  findEdgeSpawn(edge) {
    for (let tries = 0; tries < 200; tries++) {
      let x, y;
      const m = 2;
      if (edge === 0) { x = m + Math.floor(Math.random() * (this.world.w - 2 * m)); y = m; }
      else if (edge === 1) { x = this.world.w - 1 - m; y = m + Math.floor(Math.random() * (this.world.h - 2 * m)); }
      else if (edge === 2) { x = m + Math.floor(Math.random() * (this.world.w - 2 * m)); y = this.world.h - 1 - m; }
      else { x = m; y = m + Math.floor(Math.random() * (this.world.h - 2 * m)); }
      if (this.world.walkable(x, y)) return { x, y };
      edge = (edge + 1) % 4;
    }
    // Notfall: irgendein begehbares Feld am Rand
    for (let y = 1; y < this.world.h - 1; y++)
      for (let x = 1; x < this.world.w - 1; x++)
        if ((x < 4 || y < 4 || x > this.world.w - 5 || y > this.world.h - 5) && this.world.walkable(x, y)) return { x, y };
    return null;
  }

  /* ---------------------------------------------------------- */
  /* Hauptschleife                                               */
  /* ---------------------------------------------------------- */
  update(dt) {
    if (this.gameOver) return;
    this.time += dt;

    for (const b of this.buildings) b.update(dt, this);
    for (const u of this.units) u.update(dt, this);

    this.updateProjectiles(dt);
    this.updateEffects(dt);
    this.updateWaves(dt);
    this.cleanup(dt);
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      p.life -= dt;
      const t = p.target;
      if (!t || !t.alive) { p.life = 0; continue; }
      const tx = t.cx ?? t.x, ty = (t.cy ?? t.y);
      const dx = tx - p.x, dy = ty - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (d <= step) {
        this.damage(t, p.damage, p.from);
        this.spawnHit(tx, ty);
        p.life = 0;
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  updateEffects(dt) {
    for (const e of this.effects) e.life -= dt;
    this.effects = this.effects.filter((e) => e.life > 0);
  }

  cleanup(dt) {
    for (const u of this.units) {
      if (!u.alive && u.isHero) {
        u.respawnIn = (u.respawnIn ?? 12) - dt;
        if (u.respawnIn <= 0) {
          const home = this.findNearestStorage(u.x, u.y) || this.buildings[0];
          const spot = home ? this.world.adjacentWalkable(Math.round(home.cx), Math.round(home.cy)) : null;
          u.hp = u.maxHp;
          u.x = spot ? spot.x : Math.floor(this.world.w / 2);
          u.y = spot ? spot.y : Math.floor(this.world.h / 2);
          u.order = { type: 'idle' };
          u.path = null;
          this.emit('toast', 'Dein Held ist zurück!');
        }
      }
    }
    this.units = this.units.filter((u) => u.alive || u.isHero);
    this.buildings = this.buildings.filter((b) => b.alive);
    if (!this.buildings.length && !this.gameOverNotified) {
      this.gameOverNotified = true;
      this.emit('toast', 'Alle Gebäude verloren! Baue neu auf.');
    }
  }

  /* ---------------------------------------------------------- */
  /* Speichern / Laden                                           */
  /* ---------------------------------------------------------- */
  serialize() {
    return {
      version: 1,
      world: this.world.serialize(),
      resources: this.resources,
      time: this.time,
      waveNumber: this.waveNumber,
      nextWaveAt: this.nextWaveAt,
      stats: this.stats,
      heroId: this.hero?.id ?? null,
      units: this.units.map((u) => u.serialize()),
      buildings: this.buildings.map((b) => b.serialize()),
      cam: { x: this.cam.x, y: this.cam.y, zoom: this.cam.zoom },
      idCounter: peekId(),
    };
  }

  static deserialize(data) {
    const g = new Game(data.world.seed);
    g.world = World.deserialize(data.world);
    g.resources = { ...START_RESOURCES, ...data.resources };
    g.time = data.time || 0;
    g.waveNumber = data.waveNumber || 0;
    g.nextWaveAt = data.nextWaveAt ?? WAVE.firstAt;
    g.stats = data.stats || { gathered: 0, built: 0, killed: 0 };
    setIdCounter((data.idCounter || 1) + 1);

    g.buildings = (data.buildings || []).map(Building.deserialize);
    for (const b of g.buildings) for (const [tx, ty] of b.tiles()) g.world.occupied.set(g.world.key(tx, ty), b.id);

    g.units = (data.units || []).map(Unit.deserialize);
    g.hero = g.units.find((u) => u.isHero) || null;

    // verwaiste Arbeiterreferenzen bereinigen
    const unitIds = new Set(g.units.map((u) => u.id));
    for (const b of g.buildings) b.workers = b.workers.filter((id) => unitIds.has(id));
    for (const u of g.units) if (u.workplace && !g.buildings.some((b) => b.id === u.workplace)) u.workplace = null;

    if (data.cam) { g.cam.x = data.cam.x; g.cam.y = data.cam.y; g.cam.zoom = clamp(data.cam.zoom, 0.4, 2.2); }
    return g;
  }
}

export { RESOURCES };
