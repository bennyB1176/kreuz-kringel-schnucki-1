/* Einheiten: Held, Siedler (Arbeiter), Soldaten und Feinde. */

import { UNITS, BUILDINGS } from './config.js';
import { findPath } from './pathfind.js';
import { nextId, dist } from './utils.js';

const AGGRO_RANGE = 6;
const REPATH_COOLDOWN = 0.6;

export class Unit {
  constructor(type, x, y) {
    const def = UNITS[type];
    this.id = nextId();
    this.type = type;
    this.x = x;
    this.y = y;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.enemy = !!def.enemy;
    this.path = null;
    this.pathGoal = null;
    this.repathTimer = 0;
    this.attackCd = 0;
    this.facing = 1;
    this.anim = Math.random() * 6;
    /** Auftrag des Spielers bzw. der KI */
    this.order = { type: 'idle' };
    /** Arbeitsstelle (Gebäude-ID) */
    this.workplace = null;
    this.work = { phase: 'idle', nodeKey: null, timer: 0 };
    this.carrying = { res: null, amount: 0 };
    this.holdTimer = 0;
  }

  get def() { return UNITS[this.type]; }
  get isSoldier() { return this.type === 'ritter' || this.type === 'bogen'; }
  get isWorker() { return this.type === 'siedler'; }
  get isHero() { return this.type === 'held'; }
  get alive() { return this.hp > 0; }

  /* ------------------------------------------------------------ */
  /* Bewegung                                                      */
  /* ------------------------------------------------------------ */

  moveTo(game, tx, ty) {
    tx = Math.max(0, Math.min(game.world.w - 1, Math.round(tx)));
    ty = Math.max(0, Math.min(game.world.h - 1, Math.round(ty)));
    const p = findPath(game.world, Math.round(this.x), Math.round(this.y), tx, ty);
    if (p === null) { this.path = null; return false; }
    this.path = p;
    this.pathGoal = { x: tx, y: ty };
    return true;
  }

  followPath(dt) {
    if (!this.path || !this.path.length) return false;
    const wp = this.path[0];
    const dx = wp.x - this.x, dy = wp.y - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.def.speed * dt;
    if (d <= step) {
      this.x = wp.x; this.y = wp.y;
      this.path.shift();
      if (!this.path.length) this.path = null;
    } else {
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
      if (Math.abs(dx) > 0.001) this.facing = dx - dy > 0 ? 1 : -1;
    }
    this.anim += dt * 8;
    return true;
  }

  atTile(tx, ty, tol = 1.45) { return dist(this.x, this.y, tx, ty) <= tol; }

  /* ------------------------------------------------------------ */
  /* Hauptupdate                                                   */
  /* ------------------------------------------------------------ */

  update(dt, game) {
    if (!this.alive) return;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.repathTimer = Math.max(0, this.repathTimer - dt);

    if (this.enemy) { this.updateEnemy(dt, game); return; }

    switch (this.order.type) {
      case 'move': this.updateMoveOrder(dt, game); break;
      case 'gather': this.updateGatherOrder(dt, game); break;
      case 'deliver': this.updateDeliverOrder(dt, game); break;
      case 'attack': this.updateAttackOrder(dt, game); break;
      default:
        if (this.workplace) this.updateJob(dt, game);
        else this.autoDefend(dt, game);
    }
  }

  updateMoveOrder(dt, game) {
    if (!this.followPath(dt)) this.order = { type: 'idle' };
    // Soldaten wehren sich auch unterwegs
    if (this.isSoldier || this.isHero) this.opportunityAttack(dt, game);
  }

  updateAttackOrder(dt, game) {
    const target = game.getEntity(this.order.targetId);
    if (!target || !target.alive) { this.order = { type: 'idle' }; return; }
    const tp = targetPoint(target);
    const d = dist(this.x, this.y, tp.x, tp.y) - (target.size ? target.size / 2 : 0);
    if (d <= this.def.range) {
      this.path = null;
      this.tryAttack(game, target);
    } else if (this.repathTimer <= 0) {
      this.repathTimer = REPATH_COOLDOWN;
      this.moveTo(game, tp.x, tp.y);
    } else {
      this.followPath(dt);
    }
  }

  /** Manueller Sammelauftrag des Helden. */
  updateGatherOrder(dt, game) {
    const node = game.world.nodes.get(this.order.nodeKey);
    if (!node || node.amount <= 0) {
      this.order = { type: 'idle' };
      this.deliverIfFull(game);
      return;
    }
    if (this.atTile(node.x, node.y)) {
      this.path = null;
      this.chop(dt, game, node);
      if (this.carrying.amount >= this.def.carry) {
        // Held liefert automatisch ab und kehrt zurück
        this.order = { type: 'deliver', backTo: this.order.nodeKey };
        this.startDeliver(game);
      }
    } else if (!this.path) {
      if (!this.moveTo(game, node.x, node.y)) this.order = { type: 'idle' };
    } else {
      this.followPath(dt);
    }
  }

  chop(dt, game, node) {
    const rate = this.def.gatherRate;
    const before = this.carrying.amount;
    const space = this.def.carry - before;
    if (space <= 0) return;
    const take = Math.min(rate * dt, node.amount, space);
    node.amount -= take;
    this.carrying.res = node.res;
    this.carrying.amount = before + take;
    this.anim += dt * 10;
    if (node.amount <= 0.01) {
      game.world.removeNode(node.x, node.y);
      game.spawnPuff(node.x, node.y, node.type === 'baum' ? '#6b9a3f' : '#9a9a92');
    }
  }

  /** Held bringt seine Ladung ins Lager und kehrt danach zurück. */
  updateDeliverOrder(dt, game) {
    const store = game.getBuilding(this.deliverTarget) || game.findNearestStorage(this.x, this.y);
    if (!store) { this.order = { type: 'idle' }; return; }
    this.deliverTarget = store.id;
    if (this.atTile(store.cx, store.cy, 0.9 + store.size * 0.6)) {
      this.path = null;
      this.deliverIfFull(game);
      const back = this.order.backTo && game.world.nodes.get(this.order.backTo);
      if (back && back.amount > 0) this.order = { type: 'gather', nodeKey: this.order.backTo };
      else this.order = { type: 'idle' };
    } else if (!this.followPath(dt) && this.repathTimer <= 0) {
      this.repathTimer = 1;
      if (!this.moveTo(game, store.cx, store.cy)) { this.deliverIfFull(game); this.order = { type: 'idle' }; }
    }
  }

  startDeliver(game) {
    const store = game.findNearestStorage(this.x, this.y);
    if (!store) { this.order = { type: 'idle' }; return; }
    this.deliverTarget = store.id;
    this.moveTo(game, store.cx, store.cy);
  }

  deliverIfFull(game) {
    if (this.carrying.amount > 0) {
      game.addResource(this.carrying.res, Math.floor(this.carrying.amount));
      this.carrying = { res: null, amount: 0 };
    }
  }

  /* ------------------------------------------------------------ */
  /* Arbeiter-Job (fest zugewiesen an ein Gebäude)                 */
  /* ------------------------------------------------------------ */

  updateJob(dt, game) {
    const b = game.getBuilding(this.workplace);
    if (!b || !b.done) { this.autoDefend(dt, game); return; }
    const def = BUILDINGS[b.type];

    if (def.job === 'produce') {
      // Arbeiter steht im Gebäude – Produktion läuft dort
      if (!this.atTile(b.cx, b.cy, 1.2 + def.size * 0.5)) {
        if (!this.path && this.repathTimer <= 0) {
          this.repathTimer = 1.0;
          this.moveTo(game, b.cx, b.cy);
        }
        this.followPath(dt);
      } else {
        this.path = null;
        this.anim += dt * 3;
      }
      return;
    }

    const nodeType = def.job === 'holz' ? 'baum' : 'fels';
    const w = this.work;

    switch (w.phase) {
      case 'idle':
      case 'seek': {
        const node = game.world.findNearestNode(b.cx, b.cy, nodeType, def.workRadius,
          (n) => !game.nodeClaimedByOther(n, this.id));
        if (!node) {
          // nichts in Reichweite – warten und gelegentlich neu suchen
          w.timer -= dt;
          if (w.timer <= 0) { w.timer = 2; }
          this.followPath(dt);
          return;
        }
        w.nodeKey = game.world.key(node.x, node.y);
        game.claimNode(w.nodeKey, this.id);
        w.phase = 'toNode';
        this.moveTo(game, node.x, node.y);
        break;
      }
      case 'toNode': {
        const node = game.world.nodes.get(w.nodeKey);
        if (!node || node.amount <= 0) { this.releaseNode(game); w.phase = 'seek'; return; }
        if (this.atTile(node.x, node.y)) { this.path = null; w.phase = 'chop'; }
        else if (!this.followPath(dt)) {
          if (this.repathTimer <= 0) { this.repathTimer = 1; if (!this.moveTo(game, node.x, node.y)) { this.releaseNode(game); w.phase = 'seek'; } }
        }
        break;
      }
      case 'chop': {
        const node = game.world.nodes.get(w.nodeKey);
        if (!node || node.amount <= 0) {
          this.releaseNode(game);
          w.phase = this.carrying.amount > 0 ? 'toStore' : 'seek';
          if (w.phase === 'toStore') this.beginStoreTrip(game);
          return;
        }
        this.chop(dt, game, node);
        if (this.carrying.amount >= this.def.carry) {
          this.releaseNode(game);
          w.phase = 'toStore';
          this.beginStoreTrip(game);
        }
        break;
      }
      case 'toStore': {
        const store = game.getBuilding(w.storeId) || game.findNearestStorage(this.x, this.y);
        if (!store) { w.phase = 'seek'; return; }
        w.storeId = store.id;
        if (this.atTile(store.cx, store.cy, 0.9 + store.size * 0.6)) {
          this.path = null;
          this.deliverIfFull(game);
          w.phase = 'seek';
        } else if (!this.followPath(dt)) {
          if (this.repathTimer <= 0) {
            this.repathTimer = 1;
            if (!this.moveTo(game, store.cx, store.cy)) { this.deliverIfFull(game); w.phase = 'seek'; }
          }
        }
        break;
      }
    }
  }

  beginStoreTrip(game) {
    const store = game.findNearestStorage(this.x, this.y);
    this.work.storeId = store ? store.id : null;
    if (store) this.moveTo(game, store.cx, store.cy);
  }

  releaseNode(game) {
    if (this.work.nodeKey) { game.releaseNode(this.work.nodeKey, this.id); this.work.nodeKey = null; }
  }

  /* ------------------------------------------------------------ */
  /* Kampf                                                         */
  /* ------------------------------------------------------------ */

  autoDefend(dt, game) {
    if (!(this.isSoldier || this.isHero)) {
      // Zivilisten fliehen vor nahen Feinden
      const threat = game.nearestEnemyTo(this.x, this.y, 3.5);
      if (threat && !this.path && this.repathTimer <= 0) {
        this.repathTimer = 1.2;
        const ax = this.x + (this.x - threat.x) * 2;
        const ay = this.y + (this.y - threat.y) * 2;
        this.moveTo(game, ax, ay);
      }
      this.followPath(dt);
      return;
    }
    const foe = game.nearestEnemyTo(this.x, this.y, AGGRO_RANGE);
    if (foe) {
      const d = dist(this.x, this.y, foe.x, foe.y);
      if (d <= this.def.range) { this.path = null; this.tryAttack(game, foe); }
      else if (this.repathTimer <= 0) { this.repathTimer = REPATH_COOLDOWN; this.moveTo(game, foe.x, foe.y); }
      else this.followPath(dt);
    } else {
      this.followPath(dt);
    }
  }

  opportunityAttack(dt, game) {
    if (this.attackCd > 0) return;
    const foe = game.nearestEnemyTo(this.x, this.y, this.def.range);
    if (foe) this.tryAttack(game, foe);
  }

  tryAttack(game, target) {
    if (this.attackCd > 0) return;
    this.attackCd = this.def.attackRate;
    if (this.def.range > 2) {
      game.spawnProjectile(this.x, this.y, target, this.def.damage, this);
    } else {
      game.damage(target, this.def.damage, this);
      game.spawnHit(target.x ?? target.cx, target.y ?? target.cy);
    }
  }

  /* ------------------------------------------------------------ */
  /* Feind-KI                                                      */
  /* ------------------------------------------------------------ */

  updateEnemy(dt, game) {
    let target = game.getEntity(this.aiTargetId);
    if (!target || !target.alive) {
      target = game.pickEnemyTarget(this.x, this.y);
      this.aiTargetId = target ? target.id : null;
      this.path = null;
    }
    if (!target) { this.followPath(dt); return; }

    const tp = targetPoint(target);
    const reach = this.def.range + (target.size ? target.size * 0.5 : 0);
    const d = dist(this.x, this.y, tp.x, tp.y);

    if (d <= reach) {
      this.path = null;
      this.tryAttack(game, target);
    } else if (!this.path && this.repathTimer <= 0) {
      this.repathTimer = 0.9;
      if (!this.moveTo(game, tp.x, tp.y)) {
        // Weg blockiert – Mauern angreifen
        const wall = game.nearestBuildingTo(this.x, this.y, 3);
        if (wall) this.aiTargetId = wall.id;
        else this.repathTimer = 2;
      }
    } else {
      this.followPath(dt);
    }
  }

  serialize() {
    return {
      id: this.id, type: this.type, x: this.x, y: this.y, hp: this.hp,
      workplace: this.workplace,
      carrying: this.carrying,
      order: this.order.type === 'move' || this.order.type === 'idle' ? { type: 'idle' } : { type: 'idle' },
      work: { phase: this.work.phase === 'chop' ? 'seek' : this.work.phase, nodeKey: null, timer: 0 },
      aiTargetId: null,
    };
  }

  static deserialize(d) {
    const u = new Unit(d.type, d.x, d.y);
    u.id = d.id;
    u.hp = d.hp;
    u.workplace = d.workplace ?? null;
    u.carrying = d.carrying || { res: null, amount: 0 };
    u.work = { phase: d.work?.phase === 'toStore' ? 'toStore' : 'seek', nodeKey: null, timer: 0 };
    u.order = { type: 'idle' };
    return u;
  }
}

export function targetPoint(t) {
  return { x: t.cx ?? t.x, y: t.cy ?? t.y };
}
