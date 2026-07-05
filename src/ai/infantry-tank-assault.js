"use strict";

(function registerInfantryTankAssault(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const InfantryAI = IronLine.InfantryAI;
  if (!InfantryAI) return;

  const { clamp, distXY, angleTo, approach, rotateTowards } = IronLine.math;
  const { tryMoveCircle } = IronLine.physics;

  function config(key, fallback) {
    const value = IronLine.InfantryAIConfig?.[key];
    return Number.isFinite(value) ? value : fallback;
  }

  Object.assign(InfantryAI.prototype, {
    handleActiveTankAssault(dt, beforeX, beforeY) {
      const tank = this.tankAssaultTarget || this.findReservedTankAssaultTarget();
      if (!tank?.alive || tank.destructionPending || tank.infantryAssault?.attacker !== this.unit) {
        this.tankAssaultTarget = null;
        return false;
      }
      if (!this.canContinueTankAssault(tank)) {
        tank.cancelInfantryAssault?.("aborted");
        this.tankAssaultTarget = null;
        return false;
      }

      const assault = tank.infantryAssault;
      const contact = tank.infantryAssaultContact?.(this.unit, this.game, assault.slotIndex);
      const slot = contact?.slot || tank.assaultSlotPoint?.(this.unit, this.game, assault.slotIndex);
      if (!slot || !this.pointPassable(slot.x, slot.y, this.unit.radius + 3)) {
        tank.cancelInfantryAssault?.("blocked");
        this.tankAssaultTarget = null;
        return false;
      }

      const distance = contact?.distanceToSlot ?? distXY(this.unit.x, this.unit.y, slot.x, slot.y);
      const attached = Boolean(contact?.attached || distance <= config("tankAssaultAttachRange", 24));
      this.clearProne(1.1, true);
      this.state = attached
        ? assault.progress >= 3 ? "tank-assault-plant" : "tank-assault-climb"
        : "tank-assault-approach";
      this.target = tank;
      this.faceContact(tank, dt);

      if (!attached) {
        this.moveToAssaultSlot(dt, slot);
        this.recordMovement(dt, beforeX, beforeY, slot);
        this.updateDebug(slot);
        return true;
      }

      tank.renewInfantryAssault?.(this.unit);
      this.unit.x = approach(this.unit.x, slot.x, 90 * dt);
      this.unit.y = approach(this.unit.y, slot.y, 90 * dt);
      this.unit.speed = approach(this.unit.speed, 0, 340 * dt);
      this.moveHeading = this.unit.angle;
      this.updateDebug(slot);
      return true;
    },

    findReservedTankAssaultTarget() {
      return (this.game.tanks || []).find((tank) => tank.infantryAssault?.attacker === this.unit) || null;
    },

    canStartTankAssault(tank, distance, order, contact) {
      if (!tank?.alive || tank.vehicleType === "humvee" || tank.team === this.unit.team) return false;
      if (this.unit.classId === "scout" || this.unit.inVehicle || !order?.point) return false;
      if ((this.tankAssaultCooldown || 0) > 0 || this.unit.suppression > config("tankAssaultSuppressionLimit", 76)) return false;
      if (distance > (tank.radius || 38) + config("tankAssaultAcquireRange", 96)) return false;
      if (Math.abs(tank.speed || 0) > 96 || !tank.canReserveInfantryAssault?.(this.unit)) return false;
      if (this.hasRpg() && distance > config("rpgDangerRange", 275) + 18) return false;
      if (contact && distance > (tank.radius || 38) + 68) return false;
      const slot = tank.assaultSlotPoint?.(this.unit, this.game);
      return Boolean(slot && this.pointPassable(slot.x, slot.y, this.unit.radius + 3));
    },

    canContinueTankAssault(tank) {
      if (!tank?.alive || tank.team === this.unit.team || !this.unit.alive || this.unit.inVehicle) return false;
      const assault = tank.infantryAssault;
      const committedAssault = assault?.attacker === this.unit && (assault.attached || assault.progress > 0.2);
      if (this.unit.suppression > 94 && !committedAssault) return false;
      return distXY(this.unit.x, this.unit.y, tank.x, tank.y) <= (tank.radius || 38) + 132;
    },

    startTankAssault(tank, dt, beforeX, beforeY) {
      const assault = tank.reserveInfantryAssault?.(this.unit, this.game);
      if (!assault) return false;
      this.tankAssaultTarget = tank;
      this.actionLockTimer = Math.max(this.actionLockTimer || 0, 1.4);
      this.actionLockKey = `tank-assault:${tank.callSign || ""}`;
      return this.handleActiveTankAssault(dt, beforeX, beforeY);
    },

    moveToAssaultSlot(dt, target) {
      this.clearProne(1.1, true);
      const distance = Math.max(0.001, Math.hypot(target.x - this.unit.x, target.y - this.unit.y));
      if (distance <= (target.stopDistance || 9) + 2) {
        this.unit.speed = approach(this.unit.speed, 0, 340 * dt);
        return;
      }
      const desiredAngle = angleTo(this.unit.x, this.unit.y, target.x, target.y);
      this.moveHeading = rotateTowards(this.moveHeading, desiredAngle, 6.5 * dt);
      this.unit.angle = this.moveHeading;
      this.unit.speed = approach(this.unit.speed, this.unit.maxSpeed * clamp(distance / 120, 0.42, 0.94) * clamp(this.unit.morale + 0.18, 0.48, 1), 340 * dt);
      tryMoveCircle(this.game, this.unit, Math.cos(this.unit.angle) * this.unit.speed, Math.sin(this.unit.angle) * this.unit.speed, this.unit.radius, dt, { blockTanks: false, blockWrecks: true, padding: 7 });
    }
  });
})(window);
