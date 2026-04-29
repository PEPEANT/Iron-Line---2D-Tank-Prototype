"use strict";

(function registerSuicideDrone(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;
  const { clamp, distXY, angleTo, rotateTowards, segmentDistanceToPoint } = IronLine.math;

  class SuicideDrone extends IronLine.ReconDrone {
    constructor(options = {}) {
      super(options);
      const weapon = options.weapon || {};
      this.weapon = weapon;
      this.weaponId = weapon.id || "kamikazeDrone";
      this.droneRole = "attack";
      this.classId = "engineer";
      this.callSign = options.callSign || "FPV";
      this.age = 0;
      this.flightDistance = 0;
      this.armTime = weapon.armTime ?? 0;
      this.minArmedDistance = weapon.minArmedDistance ?? 0;
      this.autoDetonateRadius = weapon.autoDetonateRadius || 34;
      this.diveAutoDetonateRadius = weapon.diveAutoDetonateRadius || 44;
      this.splash = weapon.splash || 132;
      this.lockedSplash = weapon.lockedSplash || Math.max(this.splash, 188);
      this.damage = weapon.damage || 86;
      this.tankDamageScale = weapon.tankDamageScale ?? 0.58;
      this.lightVehicleDamageScale = weapon.lightVehicleDamageScale ?? 1.08;
      this.infantryDamageScale = weapon.infantryDamageScale ?? 1.05;
      this.suppressionBase = weapon.suppressionBase ?? 42;
      this.suppressionMax = weapon.suppressionMax ?? 92;
      this.explosionStart = weapon.explosionStart || 20;
      this.explosionLife = weapon.explosionLife || 0.42;
      this.scorchRadius = weapon.scorchRadius || 44;
      this.detectionGrace = weapon.detectionGrace ?? 0.85;
      this.unarmedDetectionRange = weapon.unarmedDetectionRange ?? 145;
      this.controlledDetectionRange = weapon.controlledDetectionRange ?? 230;
      this.armedDetectionRange = weapon.armedDetectionRange ?? 360;
      this.lockAcquireRange = weapon.lockAcquireRange || 720;
      this.lockAcquireTime = weapon.lockAcquireTime || 0.68;
      this.groundLockAcquireTime = weapon.groundLockAcquireTime || 0.82;
      this.lockCursorTolerance = weapon.lockCursorTolerance || 76;
      this.lockAimTolerance = weapon.lockAimTolerance || 48;
      this.boostSpeedMultiplier = weapon.boostSpeedMultiplier || 1.7;
      this.diveSpeedMultiplier = weapon.diveSpeedMultiplier || 2.1;
      this.diveTurnRate = weapon.diveTurnRate || 9.8;
      this.boostImpactWindow = weapon.boostImpactWindow || 0.36;
      this.boostImpactTimer = 0;
      this.boostDirectImpactPadding = weapon.boostDirectImpactPadding || 10;
      this.boostDirectTankDamage = weapon.boostDirectTankDamage || 132;
      this.lockTarget = null;
      this.lockPoint = null;
      this.lockAttemptType = "";
      this.lockAttemptTarget = null;
      this.lockAttemptPoint = null;
      this.lockProgress = 0;
      this.lockRequiredTime = this.lockAcquireTime;
      this.lockFailureReason = "";
      this.lockFailureTimer = 0;
      this.diveActive = false;
      this.diveStartedAt = 0;
      this.detectedTimer = 0;
      this.detectedBy = null;
      this.detectedWarningCooldown = 0;
    }

    update(game, dt) {
      if (!this.alive) return;

      const beforeX = this.x;
      const beforeY = this.y;
      this.age += dt;
      this.updateFeedbackTimers(dt);
      this.updateLockState();
      if (this.diveActive && this.boosting) {
        this.boostImpactTimer = this.boostImpactWindow;
      } else {
        this.boostImpactTimer = Math.max(0, this.boostImpactTimer - dt);
      }

      const originalSpeed = this.speed;
      const originalControlled = this.controlled;
      if (this.diveActive) {
        const lock = this.lockPosition();
        if (lock) this.setWaypoint(lock.x, lock.y);
        this.speed = originalSpeed * this.diveSpeedMultiplier * (this.boosting ? this.boostSpeedMultiplier : 1);
        this.controlled = false;
      }
      super.update(game, dt);
      this.speed = originalSpeed;
      this.controlled = originalControlled;
      if (!this.alive) return;

      this.flightDistance += distXY(beforeX, beforeY, this.x, this.y);
      this.checkImpactDetonation(game, beforeX, beforeY);
    }

    moveToward(x, y, dt) {
      const distance = distXY(this.x, this.y, x, y);
      if (distance < 10) return;

      const desired = angleTo(this.x, this.y, x, y);
      const turnRate = this.diveActive ? this.diveTurnRate : 5.8;
      this.angle = rotateTowards(this.angle, desired, turnRate * dt);
      const step = Math.min(distance, this.speed * dt);
      this.setPosition(
        this.x + Math.cos(this.angle) * step,
        this.y + Math.sin(this.angle) * step
      );
    }

    armProgress() {
      const timeProgress = this.armTime <= 0 ? 1 : clamp(this.age / Math.max(this.armTime, 0.001), 0, 1);
      const distanceProgress = this.minArmedDistance <= 0 ? 1 : clamp(this.flightDistance / Math.max(this.minArmedDistance, 1), 0, 1);
      return Math.min(timeProgress, distanceProgress);
    }

    isArmed() {
      return this.age >= this.armTime && this.flightDistance >= this.minArmedDistance;
    }

    canDetonate() {
      return this.alive && this.isArmed();
    }

    boostStrikeReady() {
      return this.diveActive && (this.boosting || this.boostImpactTimer > 0);
    }

    updateLockState() {
      if (!this.lockTarget) return;
      const alive = this.lockTarget.alive !== undefined ? this.lockTarget.alive : this.lockTarget.hp > 0;
      if (!alive || this.lockTarget.team === this.team) this.clearLock();
    }

    updateFeedbackTimers(dt) {
      this.lockFailureTimer = Math.max(0, this.lockFailureTimer - dt);
      this.detectedTimer = Math.max(0, this.detectedTimer - dt);
      this.detectedWarningCooldown = Math.max(0, this.detectedWarningCooldown - dt);
      if (this.lockProgress <= 0) return;
      if (!this.controlled || this.diveActive) this.lockProgress = Math.max(0, this.lockProgress - dt * 1.8);
    }

    hasLock() {
      this.updateLockState();
      return Boolean(this.lockTarget || this.lockPoint);
    }

    lockPosition() {
      this.updateLockState();
      if (this.lockTarget) return { x: this.lockTarget.x, y: this.lockTarget.y, target: this.lockTarget };
      return this.lockPoint;
    }

    lockOn(target) {
      if (!target) return false;
      const alive = target.alive !== undefined ? target.alive : target.hp > 0;
      if (!alive || target.team === this.team) return false;
      this.lockTarget = target;
      this.lockPoint = null;
      this.diveActive = false;
      this.clearLockAttempt();
      return true;
    }

    lockGround(x, y) {
      this.lockTarget = null;
      this.lockPoint = { x, y };
      this.diveActive = false;
      this.setWaypoint(x, y);
      this.clearLockAttempt();
      return true;
    }

    clearLock() {
      this.lockTarget = null;
      this.lockPoint = null;
      this.diveActive = false;
      this.clearLockAttempt();
    }

    clearLockAttempt() {
      this.lockAttemptType = "";
      this.lockAttemptTarget = null;
      this.lockAttemptPoint = null;
      this.lockProgress = 0;
      this.lockRequiredTime = this.lockAcquireTime;
    }

    failLock(reason = "") {
      if (reason) {
        this.lockFailureReason = reason;
        this.lockFailureTimer = 0.9;
      }
      this.lockAttemptType = "";
      this.lockAttemptTarget = null;
      this.lockAttemptPoint = null;
      this.lockProgress = Math.max(0, this.lockProgress * 0.38);
    }

    beginLockAttempt(type, target, point, requiredTime = this.lockAcquireTime) {
      const changed = type !== this.lockAttemptType ||
        target !== this.lockAttemptTarget ||
        !this.lockAttemptPoint ||
        distXY(this.lockAttemptPoint.x, this.lockAttemptPoint.y, point.x, point.y) > 58;

      if (changed) this.lockProgress = Math.min(this.lockProgress, requiredTime * 0.22);
      this.lockAttemptType = type;
      this.lockAttemptTarget = target || null;
      this.lockAttemptPoint = { x: point.x, y: point.y };
      this.lockRequiredTime = Math.max(0.1, requiredTime || this.lockAcquireTime);
    }

    advanceLock(dt) {
      this.lockProgress = clamp(this.lockProgress + dt, 0, this.lockRequiredTime);
      return this.lockProgress >= this.lockRequiredTime;
    }

    lockRatio() {
      return clamp(this.lockProgress / Math.max(0.001, this.lockRequiredTime || this.lockAcquireTime), 0, 1);
    }

    startAttackDive(game) {
      if (!this.canDetonate() || !this.hasLock()) return false;
      const lock = this.lockPosition();
      if (!lock) return false;
      this.diveActive = true;
      this.diveStartedAt = game?.matchTime || this.age;
      this.clearLockAttempt();
      this.setWaypoint(lock.x, lock.y);
      return true;
    }

    detectionRange(observer = null) {
      const launchBlend = this.detectionGrace <= 0
        ? 1
        : clamp(this.age / Math.max(this.detectionGrace, 0.001), 0, 1);
      const quietRange = this.unarmedDetectionRange * 0.68;
      let range = quietRange + (this.armedDetectionRange - quietRange) * launchBlend;
      if (this.hasLock()) range += this.diveActive ? 160 : 52;
      if (this.boosting) range += 72;
      if (this.controlled) range = Math.max(range, this.controlledDetectionRange);
      if (observer?.classId === "scout") range += this.diveActive ? 95 : 62;
      return range;
    }

    canBeDetectedBy(observer, game = null, options = {}) {
      if (!this.alive || !observer) return false;
      if (game?.droneHasRoofCover?.(this)) return false;
      const maxRange = options.range ?? options.maxRange ?? Infinity;
      const range = Math.min(maxRange, this.detectionRange(observer));
      return distXY(observer.x, observer.y, this.x, this.y) <=
        range + (observer.radius || 0) + this.radius;
    }

    reportContacts(_game) {
      // Attack drones do not provide recon reports; their job is delivery.
    }

    tryDetonate(game) {
      if (!this.canDetonate()) return false;
      this.detonate(game);
      return true;
    }

    destroy(game) {
      if (this.isArmed()) {
        this.detonate(game);
        return;
      }
      super.destroy(game);
    }

    takeDamage(amount) {
      if (!this.alive) return;
      this.hp = Math.max(0, this.hp - amount);
      if (this.hp > 0) return;

      if (this.isArmed() && IronLine.game) {
        this.detonate(IronLine.game);
        return;
      }

      this.alive = false;
      this.pendingDestroyEffect = true;
    }

    detonate(game, options = {}) {
      if (!this.alive && !this.pendingDestroyEffect) return;

      this.alive = false;
      this.pendingDestroyEffect = false;
      const lockedBlast = this.diveActive || this.hasLock();
      const splash = lockedBlast ? this.lockedSplash : this.splash;
      const boostedDirectHit = Boolean(options.boostedDirectHit);
      const directTarget = options.directTarget || null;

      if (boostedDirectHit && directTarget?.alive && directTarget.vehicleType !== "humvee") {
        directTarget.takeDamage?.(game, this.boostDirectTankDamage);
      }

      IronLine.combat.damageRadius(game, this.x, this.y, splash, this.damage, this.team, {
        id: "kamikazeDrone",
        tankDamageScale: this.tankDamageScale,
        lightVehicleDamageScale: this.lightVehicleDamageScale,
        infantryDamageScale: this.infantryDamageScale,
        suppressionBase: this.suppressionBase,
        suppressionMax: this.suppressionMax
      });
      this.emitDetonationEffect(game, { boostedDirectHit });
    }

    checkImpactDetonation(game, previousX = this.x, previousY = this.y) {
      if (!this.canDetonate()) return;

      const lock = this.lockPosition();
      if (this.diveActive && lock && !lock.target) {
        if (distXY(this.x, this.y, lock.x, lock.y) <= this.radius + this.diveAutoDetonateRadius) {
          this.detonate(game);
          return;
        }
      }

      const targets = [];
      for (const vehicle of [...(game.tanks || []), ...(game.humvees || [])]) {
        if (vehicle.alive && vehicle.team !== this.team) targets.push(vehicle);
      }
      for (const unit of game.infantry || []) {
        if (unit.alive && !unit.inVehicle && unit.team !== this.team) targets.push(unit);
      }
      for (const crew of game.crews || []) {
        if (crew.alive && !crew.inTank && crew.team !== this.team) targets.push(crew);
      }
      if (!game.player.inTank && game.player.hp > 0 && game.player.team !== this.team && !game.isPlayerInSafeZone?.()) {
        targets.push(game.player);
      }

      for (const target of targets) {
        const triggerRadius = this.diveActive ? this.diveAutoDetonateRadius : this.autoDetonateRadius;
        const requiredDistance = this.radius + (target.radius || 0) + triggerRadius;
        const directDistance = this.radius + (target.radius || 0) + this.boostDirectImpactPadding;
        const currentDistance = distXY(this.x, this.y, target.x, target.y);
        const sweptDistance = segmentDistanceToPoint(previousX, previousY, this.x, this.y, target.x, target.y);
        const impactDistance = Math.min(currentDistance, sweptDistance);
        if (impactDistance <= requiredDistance) {
          const boostedDirectHit = this.boostStrikeReady() &&
            (game.tanks || []).includes(target) &&
            impactDistance <= directDistance;
          this.detonate(game, {
            directTarget: target,
            boostedDirectHit
          });
          return;
        }
      }
    }

    emitDetonationEffect(game, options = {}) {
      if (!game?.effects) return;

      const blastRings = game.effects.blastRings || (game.effects.blastRings = []);
      const blastSparks = game.effects.blastSparks || (game.effects.blastSparks = []);
      const boostedDirectHit = Boolean(options.boostedDirectHit);
      blastRings.push({
        x: this.x,
        y: this.y,
        radius: 8,
        maxRadius: this.splash * (boostedDirectHit ? 0.82 : 0.64),
        life: 0.18,
        maxLife: 0.18,
        color: boostedDirectHit ? "rgba(255, 238, 166, 0.9)" : "rgba(255, 210, 128, 0.78)",
        width: boostedDirectHit ? 7 : 5
      });
      game.effects.explosions.push({
        x: this.x,
        y: this.y,
        radius: boostedDirectHit ? this.explosionStart + 8 : this.explosionStart,
        maxRadius: this.splash * (boostedDirectHit ? 0.68 : 0.54),
        life: boostedDirectHit ? this.explosionLife + 0.1 : this.explosionLife,
        maxLife: boostedDirectHit ? this.explosionLife + 0.1 : this.explosionLife,
        color: "rgba(255, 126, 54, 0.94)",
        core: true,
        smoke: false
      });
      game.effects.explosions.push({
        x: this.x + (Math.random() - 0.5) * 8,
        y: this.y + (Math.random() - 0.5) * 8,
        radius: 16,
        maxRadius: this.splash * 0.76,
        life: 0.72,
        maxLife: 0.72,
        color: "rgba(72, 66, 52, 0.56)",
        core: false,
        smoke: true
      });
      game.effects.scorchMarks?.push({
        x: this.x,
        y: this.y,
        radius: this.scorchRadius + Math.random() * 14,
        alpha: 0.24
      });

      const sparkCount = boostedDirectHit ? 24 : 16;
      for (let i = 0; i < sparkCount; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 90 + Math.random() * 230;
        blastSparks.push({
          x: this.x,
          y: this.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          length: 14 + Math.random() * 16,
          life: 0.24 + Math.random() * 0.22,
          maxLife: 0.44,
          color: Math.random() < 0.5 ? "rgba(255, 224, 150, 0.86)" : "rgba(255, 137, 72, 0.78)"
        });
      }
    }
  }

  IronLine.SuicideDrone = SuicideDrone;
})(window);
