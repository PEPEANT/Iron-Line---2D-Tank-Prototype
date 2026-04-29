"use strict";

(function registerReconDrone(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;
  const { clamp, distXY, angleTo, rotateTowards } = IronLine.math;
  const { hasLineOfSight } = IronLine.physics;

  class ReconDrone {
    constructor(options = {}) {
      const weapon = options.weapon || {};
      this.x = options.x || 0;
      this.y = options.y || 0;
      this.team = options.team || TEAM.BLUE;
      this.owner = options.owner || null;
      this.weapon = weapon;
      this.weaponId = weapon.id || "reconDrone";
      this.radius = weapon.radius || 11;
      this.hp = weapon.hp || 26;
      this.maxHp = this.hp;
      this.battery = weapon.battery || 42;
      this.maxBattery = this.battery;
      this.batteryLimit = weapon.batteryLimit !== false;
      this.speed = weapon.speed || 245;
      this.scanRange = weapon.scanRange || 560;
      this.reportTtl = weapon.reportTtl || 2.6;
      this.maxControlRange = weapon.maxControlRange || 1350;
      this.weakSignalRatio = weapon.weakSignalRatio ?? 0.78;
      this.angle = options.angle || 0;
      this.targetX = options.targetX ?? this.x;
      this.targetY = options.targetY ?? this.y;
      this.reportTimer = 0;
      this.rotorPhase = Math.random() * Math.PI * 2;
      this.alive = true;
      this.controlled = false;
      this.isDrone = true;
      this.classId = "scout";
      this.callSign = options.callSign || "DRN";
      this.pendingDestroyEffect = false;
      this.recallable = false;
      this.autoReturn = false;
      this.roofLocked = Boolean(options.roofLocked);
      this.roofLockPoint = options.roofLockPoint
        ? { x: options.roofLockPoint.x, y: options.roofLockPoint.y }
        : null;
      this.roofLockObstacle = options.roofLockObstacle || null;
    }

    signalRatio() {
      if (!this.owner || this.maxControlRange <= 0) return 0;
      return clamp(distXY(this.owner.x, this.owner.y, this.x, this.y) / this.maxControlRange, 0, 1);
    }

    signalStrength() {
      return clamp(1 - this.signalRatio(), 0, 1);
    }

    isSignalWeak() {
      return this.signalRatio() >= this.weakSignalRatio;
    }

    canBeDetectedBy(observer, game = null, options = {}) {
      if (!this.alive || !observer) return false;
      if (game?.droneHasRoofCover?.(this)) return false;
      const maxRange = options.range ?? options.maxRange ?? Infinity;
      const baseRange = this.controlled ? 285 : 230;
      const scoutBonus = observer.classId === "scout" ? 110 : 0;
      const moving = distXY(this.x, this.y, this.targetX, this.targetY) > 28;
      const movingBonus = moving || this.controlled ? 36 : 0;
      const weakSignalBonus = this.isSignalWeak?.() ? 28 : 0;
      const range = Math.min(maxRange, baseRange + scoutBonus + movingBonus + weakSignalBonus);
      return distXY(observer.x, observer.y, this.x, this.y) <=
        range + (observer.radius || 0) + this.radius;
    }

    update(game, dt) {
      if (!this.alive) return;

      if (this.batteryLimit) this.battery -= dt;
      this.rotorPhase += dt * 18;
      if ((this.batteryLimit && this.battery <= 0) || this.hp <= 0) {
        this.destroy(game);
        return;
      }

      const roofHold = this.roofLocked && this.roofLockPoint && !this.autoReturn;
      if (roofHold) {
        this.targetX = this.roofLockPoint.x;
        this.targetY = this.roofLockPoint.y;
      }

      if (!this.controlled) this.moveToward(this.targetX, this.targetY, dt);
      if (roofHold && distXY(this.x, this.y, this.roofLockPoint.x, this.roofLockPoint.y) <= 11) {
        this.setPosition(this.roofLockPoint.x, this.roofLockPoint.y, game);
      }

      this.reportTimer -= dt;
      if (this.reportTimer <= 0) {
        this.reportContacts(game);
        this.reportTimer = 0.22 + Math.random() * 0.1;
      }
    }

    moveToward(x, y, dt) {
      const distance = distXY(this.x, this.y, x, y);
      if (distance < 10) return;

      const desired = angleTo(this.x, this.y, x, y);
      this.angle = rotateTowards(this.angle, desired, 5.8 * dt);
      const step = Math.min(distance, this.speed * dt);
      this.setPosition(
        this.x + Math.cos(this.angle) * step,
        this.y + Math.sin(this.angle) * step
      );
    }

    setPosition(x, y, game = null) {
      const world = game?.world || IronLine.game?.world;
      let nx = x;
      let ny = y;

      if (this.owner && this.maxControlRange > 0) {
        const distance = distXY(this.owner.x, this.owner.y, nx, ny);
        if (distance > this.maxControlRange) {
          const angle = angleTo(this.owner.x, this.owner.y, nx, ny);
          nx = this.owner.x + Math.cos(angle) * this.maxControlRange;
          ny = this.owner.y + Math.sin(angle) * this.maxControlRange;
        }
      }

      if (world) {
        nx = clamp(nx, this.radius, world.width - this.radius);
        ny = clamp(ny, this.radius, world.height - this.radius);
      }

      this.x = nx;
      this.y = ny;
    }

    setWaypoint(x, y) {
      this.targetX = x;
      this.targetY = y;
    }

    setRoofLock(x, y, obstacle = null) {
      this.roofLocked = true;
      this.roofLockPoint = { x, y };
      this.roofLockObstacle = obstacle;
      this.autoReturn = false;
      this.setWaypoint(x, y);
    }

    clearRoofLock() {
      this.roofLocked = false;
      this.roofLockPoint = null;
      this.roofLockObstacle = null;
    }

    reportContacts(game) {
      const targets = [];

      for (const tank of [...(game.tanks || []), ...(game.humvees || [])]) {
        if (tank.alive && tank.team !== this.team) targets.push(tank);
      }
      for (const unit of game.infantry || []) {
        if (unit.alive && unit.team !== this.team) targets.push(unit);
      }
      for (const crew of game.crews || []) {
        if (crew.alive && !crew.inTank && crew.team !== this.team) targets.push(crew);
      }
      if (!game.player.inTank && game.player.hp > 0 && game.player.team !== this.team && !game.isPlayerInSafeZone?.()) {
        targets.push(game.player);
      }

      const sightOptions = game.droneSightOptions?.(this, { padding: 1 }) || { padding: 1 };
      for (const target of targets) {
        if (distXY(this.x, this.y, target.x, target.y) > this.scanRange + (target.radius || 0)) continue;
        if (!hasLineOfSight(game, this, target, sightOptions)) continue;
        game.reportContact?.(this.team, target, this, this.reportTtl);
      }
    }

    takeDamage(amount) {
      if (!this.alive) return;
      this.hp = Math.max(0, this.hp - amount);
      if (this.hp <= 0) {
        this.alive = false;
        this.pendingDestroyEffect = true;
      }
    }

    destroy(game) {
      this.alive = false;
      this.pendingDestroyEffect = true;
      this.emitDestroyEffect(game);
    }

    emitDestroyEffect(game) {
      if (!this.pendingDestroyEffect || !game?.effects) return;
      this.pendingDestroyEffect = false;

      game.effects.explosions.push({
        x: this.x,
        y: this.y,
        radius: 5,
        maxRadius: 24,
        life: 0.22,
        maxLife: 0.22,
        color: "rgba(155, 220, 255, 0.7)"
      });

      game.effects.blastSparks?.push({
        x: this.x,
        y: this.y,
        vx: (Math.random() - 0.5) * 120,
        vy: (Math.random() - 0.5) * 120,
        length: 10,
        life: 0.22,
        maxLife: 0.22,
        color: "rgba(180, 230, 255, 0.78)"
      });
    }
  }

  IronLine.ReconDrone = ReconDrone;
})(window);
