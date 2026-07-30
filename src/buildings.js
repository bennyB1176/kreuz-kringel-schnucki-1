/* Gebäude: Bau, Produktion, Ausbildung, Verteidigungstürme. */

import { BUILDINGS } from './config.js';
import { nextId, dist } from './utils.js';

export class Building {
  constructor(type, x, y) {
    const def = BUILDINGS[type];
    this.id = nextId();
    this.type = type;
    this.x = x;               // linke obere Kachel
    this.y = y;
    this.size = def.size || 1;
    this.maxHp = def.hp;
    this.hp = Math.max(1, Math.round(def.hp * 0.25));
    this.done = false;
    this.buildTime = def.buildTime;
    this.buildProgress = 0;
    this.workers = [];        // Unit-IDs
    this.prodTimer = 0;
    this.prodActive = false;
    this.trainQueue = [];
    this.towerCd = 0;
    this.anim = Math.random() * 6;
  }

  get def() { return BUILDINGS[this.type]; }
  get cx() { return this.x + (this.size - 1) / 2; }
  get cy() { return this.y + (this.size - 1) / 2; }
  get alive() { return this.hp > 0; }
  get maxWorkers() { return this.def.maxWorkers || 0; }

  tiles() {
    const out = [];
    for (let dy = 0; dy < this.size; dy++)
      for (let dx = 0; dx < this.size; dx++) out.push([this.x + dx, this.y + dy]);
    return out;
  }

  update(dt, game) {
    if (!this.alive) return;

    if (!this.done) {
      this.buildProgress += dt;
      this.hp = Math.min(this.maxHp, this.maxHp * (0.25 + 0.75 * (this.buildProgress / this.buildTime)));
      if (this.buildProgress >= this.buildTime) {
        this.done = true;
        this.hp = this.maxHp;
        this.buildProgress = this.buildTime;
        game.onBuildingFinished(this);
      }
      return;
    }

    const def = this.def;
    if (def.job === 'produce') this.updateProduction(dt, game);
    if (def.trains) this.updateTraining(dt, game);
    if (def.tower) this.updateTower(dt, game);
    this.anim += dt;
  }

  updateProduction(dt, game) {
    const def = this.def;
    const active = this.workers.filter((id) => {
      const u = game.getUnit(id);
      return u && u.alive && u.atBuilding(this);
    }).length;
    if (active === 0) {
      // Bereits eingesetzte Rohstoffe zurückgeben, statt sie verfallen zu lassen.
      if (this.prodActive) {
        for (const [res, amt] of Object.entries(def.produce.in)) game.addResource(res, amt);
        this.prodActive = false;
        this.prodTimer = 0;
      }
      return;
    }

    if (!this.prodActive) {
      if (!game.canAfford(def.produce.in)) { this.prodActive = false; return; }
      game.pay(def.produce.in);
      this.prodActive = true;
      this.prodTimer = 0;
    }
    this.prodTimer += dt * active;
    if (this.prodTimer >= def.produce.time) {
      this.prodTimer = 0;
      this.prodActive = false;
      for (const [res, amt] of Object.entries(def.produce.out)) game.addResource(res, amt);
      game.spawnFloat(this.cx, this.cy, '+' + Object.values(def.produce.out)[0]);
    }
  }

  updateTraining(dt, game) {
    if (!this.trainQueue.length) return;
    const job = this.trainQueue[0];
    job.left -= dt;
    if (job.left <= 0) {
      this.trainQueue.shift();
      game.spawnUnitAt(job.unit, this);
    }
  }

  updateTower(dt, game) {
    this.towerCd -= dt;
    if (this.towerCd > 0) return;
    const t = this.def.tower;
    const foe = game.nearestEnemyTo(this.cx, this.cy, t.range);
    if (foe) {
      this.towerCd = t.rate;
      game.spawnProjectile(this.cx, this.cy - 1.2, foe, t.damage, this);
    }
  }

  progressRatio() { return this.done ? 1 : this.buildProgress / this.buildTime; }

  serialize() {
    return {
      id: this.id, type: this.type, x: this.x, y: this.y, hp: this.hp,
      done: this.done, buildProgress: this.buildProgress,
      workers: [...this.workers],
      trainQueue: this.trainQueue.map((j) => ({ unit: j.unit, left: j.left })),
      prodTimer: this.prodTimer, prodActive: this.prodActive,
    };
  }

  static deserialize(d) {
    const b = new Building(d.type, d.x, d.y);
    b.id = d.id;
    b.hp = d.hp;
    b.done = d.done;
    b.buildProgress = d.buildProgress;
    b.workers = d.workers || [];
    b.trainQueue = d.trainQueue || [];
    b.prodTimer = d.prodTimer || 0;
    b.prodActive = !!d.prodActive;
    return b;
  }
}

/** Passt ein Gebäude an diese Stelle? */
export function canPlace(world, type, x, y) {
  const def = BUILDINGS[type];
  const size = def.size || 1;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      if (!world.buildable(x + dx, y + dy)) return false;
    }
  }
  return true;
}

export function nearestBuilding(buildings, x, y, filter = null) {
  let best = null, bestD = Infinity;
  for (const b of buildings) {
    if (!b.alive || (filter && !filter(b))) continue;
    const d = dist(x, y, b.cx, b.cy);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

export { nextId };
