"use strict";

(function registerHumvee(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { INFANTRY_WEAPONS, TEAM } = IronLine.constants;
  const { clamp, approach, distXY, normalizeAngle, segmentDistanceToPoint, circleRectCollision } = IronLine.math;
  const { tryMoveCircle } = IronLine.physics;

  class Humvee {
    constructor(options) {
      this.x = options.x;
      this.y = options.y;
      this.team = options.team;
      this.callSign = options.callSign || "HMV";
      this.angle = options.angle || 0;
      this.radius = options.radius || 31;
      this.maxHp = options.maxHp || 66;
      this.hp = this.maxHp;
      this.speed = 0;
      this.turnVelocity = 0;
      this.maxSpeed = options.maxSpeed || 238;
      this.accel = options.accel || 360;
      this.turnRate = options.turnRate || 2.85;
      this.machineGunAngle = this.angle;
      this.machineGunTurnRate = options.machineGunTurnRate || 4.1;
      this.machineGunCooldown = 0;
      this.machineGunKick = 0;
      this.impactShake = 0;
      this.dustCooldown = 0;
      this.trackPhase = 0;
      this.wreckTimer = 0;
      this.ammo = {
        mg: options.ammo?.mg ?? 180
      };
      this.alive = true;
      this.ai = null;
      this.vehicleType = "humvee";
      this.playerControlled = false;
      this.crew = null;
      this.passengerCapacity = options.passengerCapacity || 4;
      this.passengers = [];
      this.repairHoldTimer = 0;
      this.repairHoldSource = "";
    }

    hasCrew() {
      return Boolean(this.crew) || this.playerControlled;
    }

    occupantCount() {
      return (this.playerControlled ? 1 : 0) + (this.crew ? 1 : 0) + this.passengerCount();
    }

    passengerCount() {
      this.passengers = (this.passengers || []).filter((unit) => unit?.alive && unit.inVehicle === this);
      return this.passengers.length;
    }

    availablePassengerSeats() {
      return Math.max(0, this.passengerCapacity - this.passengerCount());
    }

    isOperational() {
      return this.alive && this.hasCrew();
    }

    drive(game, dt, throttle = 0, turn = 0, options = {}) {
      if (!this.alive) return { moved: 0, blocked: false };

      const throttleInput = clamp(Number(throttle) || 0, -1, 1);
      const turnInput = clamp(Number(turn) || 0, -1, 1);
      const speedAbs = Math.abs(this.speed);
      const roadScale = this.isOnRoad(game) ? 1.08 : 0.82;
      const speedScale = options.speedScale ?? 1;
      const speedLimit = this.maxSpeed * roadScale * speedScale;
      const speedRatio = clamp(speedAbs / Math.max(speedLimit, 1), 0, 1);
      const reverseScale = options.reverseScale ?? 0.42;
      const targetSpeed = throttleInput * speedLimit * (throttleInput < -0.01 ? reverseScale : 1);
      const changingDirection = Math.abs(throttleInput) > 0.01 &&
        Math.sign(targetSpeed) !== Math.sign(this.speed) &&
        speedAbs > 12;

      let accelScale = throttleInput < -0.01 ? 0.68 : 1;
      if (changingDirection || options.brake) accelScale = 1.65;
      if (Math.abs(throttleInput) < 0.01) accelScale = 0.54;

      this.speed = approach(this.speed, targetSpeed, this.accel * (options.accelScale ?? 1) * accelScale * dt);
      const drag = Math.abs(throttleInput) > 0.01 ? 0.18 : 1.08;
      this.speed *= Math.max(0, 1 - drag * dt);
      if (Math.abs(this.speed) < 0.45) this.speed = 0;

      const turnAuthority = (0.48 + (1 - speedRatio) * 0.52) * (speedAbs < 18 ? 0.82 : 1);
      const targetTurnVelocity = turnInput * this.turnRate * turnAuthority * (options.turnScale ?? 1);
      this.turnVelocity = approach(this.turnVelocity, targetTurnVelocity, this.turnRate * 4.4 * dt);
      const turnDrag = Math.abs(turnInput) > 0.01 ? 0.56 : 4.8;
      this.turnVelocity *= Math.max(0, 1 - turnDrag * dt);
      if (Math.abs(this.turnVelocity) < 0.007) this.turnVelocity = 0;
      this.angle = normalizeAngle(this.angle + this.turnVelocity * dt);

      const beforeX = this.x;
      const beforeY = this.y;
      const beforeSpeed = this.speed;
      const result = tryMoveCircle(
        game,
        this,
        Math.cos(this.angle) * this.speed,
        Math.sin(this.angle) * this.speed,
        this.radius,
        dt,
        { collisionSpeedScale: 0 }
      );
      const moved = distXY(beforeX, beforeY, this.x, this.y);
      const expectedMove = Math.abs(beforeSpeed) * dt;
      const blocked = Boolean(result?.blocked) || (expectedMove > 1 && moved < expectedMove * 0.42);

      if (blocked) {
        const impulse = clamp(Math.abs(beforeSpeed) / Math.max(speedLimit, 1), 0.14, 0.8);
        this.impactShake = Math.max(this.impactShake, impulse);
        this.speed *= options.collisionSpeedRetain ?? 0.42;
        this.turnVelocity *= 0.46;
      }

      if (moved > 0.01) this.trackPhase = (this.trackPhase + moved * 0.18) % 1000;
      this.emitWheelDust(game, moved, throttleInput, turnInput);
      return { moved, blocked };
    }

    update(game, dt) {
      if (!this.alive) {
        this.wreckTimer += dt;
        return;
      }

      this.machineGunCooldown = Math.max(0, this.machineGunCooldown - dt);
      this.machineGunKick = Math.max(0, this.machineGunKick - dt * 10);
      this.impactShake = Math.max(0, this.impactShake - dt * 4.6);
      this.dustCooldown = Math.max(0, this.dustCooldown - dt);
      this.repairHoldTimer = Math.max(0, (this.repairHoldTimer || 0) - dt);
      if (this.repairHoldTimer <= 0) this.repairHoldSource = "";
      this.updatePassengers();

      if (this.ai && !this.playerControlled && this.isOperational() && game.matchStarted !== false && !game.testLabAiPaused) this.ai.update(dt);
    }

    requestRepairHold(engineer, options = {}) {
      if (!this.alive || this.playerControlled) return false;
      const duration = options.duration ?? 0.65;
      this.repairHoldTimer = Math.max(this.repairHoldTimer || 0, duration);
      this.repairHoldSource = engineer?.callSign || this.repairHoldSource || "engineer";
      return true;
    }

    machineGunWeapon() {
      const base = INFANTRY_WEAPONS.machinegun || {};
      const movingSpread = clamp(Math.abs(this.speed) / Math.max(this.maxSpeed, 1), 0, 1) * 0.18;
      return {
        ...base,
        id: "machinegun",
        name: "Humvee MG",
        shortName: "HMG",
        range: 700,
        cooldown: 0.092,
        damageMin: 3.8,
        damageMax: 5.8,
        accuracyBonus: 0.02,
        spread: 0.2 + movingSpread,
        suppressionHit: 22,
        suppressionMiss: 14,
        lineSuppression: 20,
        impactSuppression: 10,
        tracerLife: 0.075,
        visualLength: 15,
        visualWidth: 1.7
      };
    }

    machineGunMountPoint() {
      return {
        x: this.x + Math.cos(this.angle) * 2,
        y: this.y + Math.sin(this.angle) * 2
      };
    }

    machineGunMuzzlePoint() {
      const mount = this.machineGunMountPoint();
      return {
        x: mount.x + Math.cos(this.machineGunAngle) * 32,
        y: mount.y + Math.sin(this.machineGunAngle) * 32
      };
    }

    canFireMachineGun() {
      return this.isOperational() && this.machineGunCooldown <= 0 && (this.ammo.mg || 0) > 0;
    }

    boardCrew(crew) {
      if (!this.alive || this.playerControlled || this.crew && this.crew !== crew) return false;
      this.crew = crew;
      return true;
    }

    leaveCrew(crew) {
      if (this.crew === crew) this.crew = null;
    }

    canBoardPassenger(unit) {
      if (!this.alive || this.playerControlled || !unit?.alive || unit.team !== this.team) return false;
      if (unit.inVehicle === this) return true;
      if (unit.inVehicle) return false;
      return this.availablePassengerSeats() > 0;
    }

    boardPassenger(unit) {
      if (!this.canBoardPassenger(unit)) return false;
      if (!this.passengers.includes(unit)) this.passengers.push(unit);
      unit.inVehicle = this;
      unit.transportVehicle = this;
      unit.transportCooldown = 0;
      unit.speed = 0;
      this.updatePassengerSeat(unit, Math.max(0, this.passengers.indexOf(unit)));
      return true;
    }

    leavePassenger(unit) {
      this.passengers = (this.passengers || []).filter((passenger) => passenger !== unit);
      if (unit?.inVehicle === this) unit.inVehicle = null;
      if (unit?.transportVehicle === this) unit.transportVehicle = null;
    }

    updatePassengers() {
      this.passengers = (this.passengers || []).filter((unit, index) => {
        if (!unit?.alive || unit.inVehicle !== this) return false;
        this.updatePassengerSeat(unit, index);
        return true;
      });
    }

    updatePassengerSeat(unit, index) {
      const seatX = [-10, -14, 8, 12][index % 4] || 0;
      const seatY = [-9, 9, -10, 10][index % 4] || 0;
      const c = Math.cos(this.angle);
      const s = Math.sin(this.angle);
      unit.x = this.x + c * seatX - s * seatY;
      unit.y = this.y + s * seatX + c * seatY;
      unit.angle = this.machineGunAngle || this.angle;
      unit.speed = 0;
    }

    dismountPassengers(game, options = {}) {
      const passengers = [...(this.passengers || [])];
      let dismounted = 0;
      passengers.forEach((unit, index) => {
        if (this.dismountPassenger(game, unit, { ...options, index })) dismounted += 1;
      });
      return dismounted;
    }

    dismountPassenger(game, unit, options = {}) {
      if (!unit || unit.inVehicle !== this) return false;
      const point = this.findDismountPoint(game, unit, options);
      this.leavePassenger(unit);
      unit.x = point.x;
      unit.y = point.y;
      unit.angle = point.angle ?? this.angle;
      unit.speed = 0;
      unit.transportCooldown = options.emergency ? 1.2 : options.cooldown ?? 6.2;
      unit.suppress?.(options.emergency ? 32 : 10, { x: this.x, y: this.y, team: this.team });
      if (options.damage) unit.takeDamage(options.damage);
      return true;
    }

    findDismountPoint(game, unit, options = {}) {
      const preferred = options.point || null;
      const baseAngle = preferred ? Math.atan2(preferred.y - this.y, preferred.x - this.x) : this.angle;
      const side = options.index % 2 === 0 ? -1 : 1;
      const angles = [
        baseAngle + Math.PI / 2 * side,
        baseAngle - Math.PI / 2 * side,
        baseAngle + Math.PI,
        baseAngle,
        baseAngle + Math.PI * 0.75 * side,
        baseAngle - Math.PI * 0.75 * side
      ];
      const distances = [this.radius + unit.radius + 22, this.radius + unit.radius + 34, this.radius + unit.radius + 48];

      for (const distance of distances) {
        for (const angle of angles) {
          const candidate = {
            x: clamp(this.x + Math.cos(angle) * distance, unit.radius, game.world.width - unit.radius),
            y: clamp(this.y + Math.sin(angle) * distance, unit.radius, game.world.height - unit.radius),
            angle
          };
          if (this.dismountPointPassable(game, unit, candidate.x, candidate.y)) return candidate;
        }
      }

      return {
        x: clamp(this.x + Math.cos(baseAngle + Math.PI / 2 * side) * (this.radius + unit.radius + 26), unit.radius, game.world.width - unit.radius),
        y: clamp(this.y + Math.sin(baseAngle + Math.PI / 2 * side) * (this.radius + unit.radius + 26), unit.radius, game.world.height - unit.radius),
        angle: baseAngle
      };
    }

    dismountPointPassable(game, unit, x, y) {
      const radius = unit.radius + 2;
      if (x < radius || y < radius || x > game.world.width - radius || y > game.world.height - radius) return false;
      if ((game.world.obstacles || []).some((obstacle) => circleRectCollision(x, y, radius, obstacle))) return false;
      return !IronLine.physics.circleIntersectsTank(game, this, x, y, radius, {
        ignoreTank: this,
        padding: 5
      });
    }

    fireMachineGun(game, targetX, targetY, options = {}) {
      if (!this.canFireMachineGun()) return false;

      const weapon = this.machineGunWeapon();
      const mount = this.machineGunMountPoint();
      const muzzle = this.machineGunMuzzlePoint();
      const shooter = {
        x: mount.x,
        y: mount.y,
        team: this.team,
        radius: 2,
        angle: this.machineGunAngle,
        alive: true,
        hp: this.hp,
        weaponId: "machinegun"
      };
      const target = options.target || null;
      const fired = target
        ? IronLine.combat.fireRifle(game, shooter, target, {
          weapon,
          range: weapon.range,
          baseAccuracy: 0.7,
          minAccuracy: 0.18,
          accuracyBonus: weapon.accuracyBonus,
          spread: weapon.spread,
          tracerLife: weapon.tracerLife,
          tracerWidth: weapon.visualWidth,
          startX: muzzle.x,
          startY: muzzle.y,
          impactChance: 0.42,
          tracerColor: this.team === TEAM.BLUE ? "rgba(184, 224, 255, 0.9)" : "rgba(255, 174, 159, 0.9)"
        })
        : IronLine.combat.fireRifleAtPoint(game, shooter, targetX, targetY, {
          weapon,
          range: weapon.range,
          spread: weapon.spread,
          targetTeam: this.team === TEAM.BLUE ? TEAM.RED : TEAM.BLUE,
          damage: 0.04,
          tracerLife: weapon.tracerLife,
          tracerWidth: weapon.visualWidth,
          startX: muzzle.x,
          startY: muzzle.y,
          impactChance: 0.48,
          tracerColor: this.team === TEAM.BLUE ? "rgba(184, 224, 255, 0.82)" : "rgba(255, 174, 159, 0.82)"
        });

      if (!fired) return false;
      this.ammo.mg = Math.max(0, (this.ammo.mg || 0) - 1);
      this.machineGunCooldown = weapon.cooldown;
      this.machineGunKick = 1.45;
      this.impactShake = Math.max(this.impactShake, 0.07);
      this.speed -= Math.cos(normalizeAngle(this.machineGunAngle - this.angle)) * 0.9;
      this.turnVelocity += Math.sin(normalizeAngle(this.machineGunAngle - this.angle)) * 0.016;
      this.emitMuzzleFlash(game);
      return true;
    }

    emitMuzzleFlash(game) {
      const flashes = game.effects.muzzleFlashes || (game.effects.muzzleFlashes = []);
      const muzzle = this.machineGunMuzzlePoint();
      if (flashes.length > 90) flashes.shift();
      flashes.push({
        x: muzzle.x,
        y: muzzle.y,
        angle: this.machineGunAngle,
        length: 20,
        width: 8,
        life: 0.058,
        maxLife: 0.058,
        color: "rgba(255, 228, 148, 0.92)"
      });

      const smokePuffs = game.effects.gunSmokePuffs || (game.effects.gunSmokePuffs = []);
      if (smokePuffs.length > 180) smokePuffs.shift();
      smokePuffs.push({
        x: muzzle.x - Math.cos(this.machineGunAngle) * 4,
        y: muzzle.y - Math.sin(this.machineGunAngle) * 4,
        vx: Math.cos(this.machineGunAngle) * (24 + Math.random() * 20),
        vy: Math.sin(this.machineGunAngle) * (24 + Math.random() * 20),
        angle: this.machineGunAngle + (Math.random() - 0.5) * 0.4,
        radius: 2.7,
        maxRadius: 11 + Math.random() * 5,
        life: 0.22,
        maxLife: 0.22,
        alpha: 0.12,
        warm: true
      });
    }

    takeDamage(gameOrAmount, maybeAmount = null) {
      if (!this.alive) return;

      const game = maybeAmount === null ? null : gameOrAmount;
      const amount = maybeAmount === null ? gameOrAmount : maybeAmount;
      this.hp -= amount;
      this.impactShake = Math.max(this.impactShake, 0.26);
      if (game?.effects) {
        game.effects.explosions.push({
          x: this.x + (Math.random() - 0.5) * 22,
          y: this.y + (Math.random() - 0.5) * 18,
          radius: 5,
          maxRadius: 15,
          life: 0.16,
          maxLife: 0.16,
          color: "rgba(255, 225, 160, 0.55)"
        });
      }

      if (this.hp <= 0) {
        this.hp = 0;
        this.alive = false;
        this.speed = 0;
        this.machineGunKick = 0;
        this.turnVelocity = 0;
        if (this.crew) this.crew.takeDamage(999);
        this.dismountPassengers(game || { world: { width: Infinity, height: Infinity, obstacles: [] } }, {
          emergency: true,
          damage: 34,
          cooldown: 1.2
        });
        if (game?.effects) {
          game.effects.scorchMarks.push({ x: this.x, y: this.y, radius: 38, alpha: 0.34 });
          game.effects.explosions.push({
            x: this.x,
            y: this.y,
            radius: 18,
            maxRadius: 72,
            life: 0.5,
            maxLife: 0.5,
            color: "rgba(255, 118, 64, 0.85)",
            core: true
          });
        }
      }
    }

    isOnRoad(game, roadHalfWidth = null) {
      const worldRoadWidth = game?.world?.roadWidth || 84;
      for (const road of game?.world?.roads || []) {
        const halfWidth = roadHalfWidth ?? (road.width || worldRoadWidth) * 0.58;
        for (let i = 1; i < road.length; i += 1) {
          const a = road[i - 1];
          const b = road[i];
          if (segmentDistanceToPoint(a.x, a.y, b.x, b.y, this.x, this.y) <= halfWidth) return true;
        }
      }
      return false;
    }

    emitWheelDust(game, moved, throttleInput, turnInput) {
      if (!game?.effects || moved < 1.2 || this.dustCooldown > 0) return;

      const speedRatio = clamp(Math.abs(this.speed) / Math.max(this.maxSpeed, 1), 0, 1);
      const effort = clamp(speedRatio * 0.7 + Math.abs(turnInput) * 0.2 + Math.abs(throttleInput) * 0.12, 0, 1);
      if (effort < 0.2) return;

      const c = Math.cos(this.angle);
      const s = Math.sin(this.angle);
      const direction = Math.sign(this.speed || throttleInput || 1);
      const rearOffset = -22 * direction;
      const side = (Math.floor(this.trackPhase / 10) % 2 === 0) ? -1 : 1;
      const wheelOffset = side * 16;

      if (this.isOnRoad(game)) {
        const marks = game.effects.trackScuffs || (game.effects.trackScuffs = []);
        if (marks.length > 120) marks.shift();
        const length = 10 + effort * 16;
        const x = this.x + c * rearOffset - s * wheelOffset;
        const y = this.y + s * rearOffset + c * wheelOffset;
        marks.push({
          x1: x - c * length * 0.5,
          y1: y - s * length * 0.5,
          x2: x + c * length * 0.5,
          y2: y + s * length * 0.5,
          life: 0.75 + effort * 0.4,
          maxLife: 0.75 + effort * 0.4,
          alpha: 0.05 + effort * 0.06
        });
        this.dustCooldown = 0.075;
        return;
      }

      const puffs = game.effects.dustPuffs || (game.effects.dustPuffs = []);
      if (puffs.length > 150) puffs.shift();
      const life = 0.24 + effort * 0.16;
      puffs.push({
        x: this.x + c * rearOffset - s * wheelOffset,
        y: this.y + s * rearOffset + c * wheelOffset,
        vx: -c * direction * (10 + effort * 18) + (Math.random() - 0.5) * 10,
        vy: -s * direction * (10 + effort * 18) + (Math.random() - 0.5) * 10,
        angle: this.angle + (Math.random() - 0.5) * 0.6,
        radius: 3 + effort * 2.5,
        maxRadius: 10 + effort * 9,
        life,
        maxLife: life,
        alpha: 0.11 + effort * 0.1
      });
      this.dustCooldown = 0.04 + (1 - effort) * 0.06;
    }
  }

  IronLine.Humvee = Humvee;
})(window);
