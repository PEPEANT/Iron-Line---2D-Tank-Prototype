"use strict";

(function registerTankAI(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, AMMO, AI_CONFIG } = IronLine.constants;
  const {
    clamp,
    distXY,
    angleTo,
    normalizeAngle,
    rotateTowards,
    approach,
    pointInRect,
    expandedRect,
    lineIntersectsRect
  } = IronLine.math;
  const { tryMoveCircle } = IronLine.physics;

  class TankAI {
    constructor(tank, game) {
      this.tank = tank;
      this.game = game;
      this.state = "capture";
      this.currentOrder = null;
      this.targetPoint = null;
      this.targetTank = null;
      this.navigation = new IronLine.NavigationAgent(tank, game);
      this.combat = new IronLine.CombatController(tank, game);
      this.strafe = Math.random() < 0.5 ? -1 : 1;
      this.strafeTimer = 1 + Math.random() * 2;
      this.debug = {
        state: this.state,
        goal: "",
        target: null,
        moveTarget: null,
        path: [],
        pathIndex: 0,
        stuckTimer: 0,
        recoveryTimer: 0,
        visible: false
      };
    }

    update(dt) {
      const beforeX = this.tank.x;
      const beforeY = this.tank.y;

      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafe *= -1;
        this.strafeTimer = 1.4 + Math.random() * 2.2;
      }

      const order = this.resolveOrder();
      const decision = this.combat.update(dt, order);
      let moveTarget = null;

      this.currentOrder = order;
      this.targetPoint = order?.point || null;
      this.targetTank = decision.target;

      if (decision.mode === "retreat" && decision.target) {
        this.state = "retreat";
        moveTarget = decision.target;
        this.driveAwayFrom(dt, decision.target.x, decision.target.y, 0.95);
      } else if (decision.mode === "engage" && decision.target) {
        this.state = "engage";
        moveTarget = this.handleEngagement(dt, decision, order);
      } else {
        this.state = order?.role === "support" ? "overwatch" : order?.role === "hold" ? "hold" : "capture";
        moveTarget = this.handleObjective(dt, order);
      }

      const stillHasMoveTarget = moveTarget && distXY(
        this.tank.x,
        this.tank.y,
        moveTarget.x,
        moveTarget.y
      ) > (moveTarget.stopDistance || 0) + 24;
      this.navigation.recordMovement(dt, beforeX, beforeY, stillHasMoveTarget);
      this.updateDebugState(order, decision, moveTarget);
    }

    resolveOrder() {
      const commander = this.game.commanders?.[this.tank.team];
      let order = commander?.getOrderFor(this.tank) || null;

      if (order?.point?.owner === this.tank.team && order.role !== "hold") {
        commander.rebuildAssignments();
        commander.rebuildInfantryAssignments?.();
        order = commander.getOrderFor(this.tank) || order;
      }

      return order || this.createFallbackOrder();
    }

    createFallbackOrder() {
      const point = this.chooseFallbackPoint();
      if (!point) return null;

      return {
        id: `${this.tank.team}:fallback:${point.name}`,
        team: this.tank.team,
        point,
        objectiveName: point.name,
        role: "attack",
        stance: "capture",
        priority: 0,
        slotIndex: 0,
        slotCount: 1,
        leashRadius: AI_CONFIG.objectiveLeashRadius,
        threatRadius: point.radius + AI_CONFIG.objectiveThreatExtra
      };
    }

    chooseFallbackPoint() {
      const enemyOwner = this.tank.team === TEAM.BLUE ? TEAM.RED : TEAM.BLUE;
      const weighted = this.game.capturePoints
        .filter((point) => point.owner !== this.tank.team)
        .map((point) => {
          const distance = distXY(this.tank.x, this.tank.y, point.x, point.y);
          let score = distance;
          if (point.owner === enemyOwner) score -= 380;
          if (point.owner === TEAM.NEUTRAL) score -= 160;
          if (point.contested) score -= 300;
          return { point, score };
        })
        .sort((a, b) => a.score - b.score);

      return weighted[0]?.point || this.game.capturePoints[0] || null;
    }

    handleObjective(dt, order) {
      if (!order?.point) {
        this.applyDrive(dt, 0, 0);
        return null;
      }

      const moveTarget = this.navigation.update(dt, order);
      if (order.role === "support" && moveTarget?.final) {
        this.aimTurretAtPoint(order.point, dt, 0.62);
      } else {
        this.aimTurretAtMoveTarget(moveTarget, dt);
      }
      this.driveTo(dt, moveTarget.x, moveTarget.y, moveTarget.stopDistance ?? 42, { allowReverse: false });
      return moveTarget;
    }

    handleEngagement(dt, decision, order) {
      if (order?.role === "support") {
        return this.handleOverwatchEngagement(dt, decision, order);
      }

      const target = decision.target;
      const objectiveDistance = order?.point ? distXY(this.tank.x, this.tank.y, order.point.x, order.point.y) : 0;
      const enemyNearOrder = order?.point ?
        distXY(target.x, target.y, order.point.x, order.point.y) <= order.threatRadius :
        true;

      if (order?.point && objectiveDistance > order.leashRadius && !enemyNearOrder && decision.distance > AI_CONFIG.immediateThreatRange) {
        return this.handleObjective(dt, order);
      }

      if (decision.blockedShot) {
        this.driveForLineOfFire(dt, target);
        return target;
      }

      if (!decision.visible) {
        return this.handleObjective(dt, order);
      }

      if (decision.distance > decision.desiredRange + 110) {
        this.driveTo(dt, target.x, target.y, decision.desiredRange, { allowReverse: false });
      } else if (decision.distance < decision.desiredRange - 170) {
        this.driveAwayFrom(dt, target.x, target.y, 0.82);
      } else {
        const sideAngle = angleTo(target.x, target.y, this.tank.x, this.tank.y) + Math.PI / 2 * this.strafe;
        this.driveVector(dt, Math.cos(sideAngle), Math.sin(sideAngle), 0.5);
      }

      return target;
    }

    handleOverwatchEngagement(dt, decision, order) {
      const target = decision.target;
      const supportPoint = order.supportPoint || order.point;
      const supportDistance = distXY(this.tank.x, this.tank.y, supportPoint.x, supportPoint.y);

      if (!decision.visible) return this.handleObjective(dt, order);
      if (supportDistance > 150 && decision.distance > AI_CONFIG.immediateThreatRange) {
        return this.handleObjective(dt, order);
      }

      if (decision.blockedShot) {
        this.driveForLineOfFire(dt, target);
        return target;
      }

      if (decision.distance < decision.desiredRange - 230) {
        this.driveAwayFrom(dt, target.x, target.y, 0.62);
        return target;
      }

      this.applyDrive(dt, 0, 0);
      return target;
    }

    driveForLineOfFire(dt, target) {
      const sideAngle = angleTo(target.x, target.y, this.tank.x, this.tank.y) + Math.PI / 2 * this.strafe;
      this.driveVector(dt, Math.cos(sideAngle), Math.sin(sideAngle), 0.74);
    }

    aimTurretAtMoveTarget(moveTarget, dt) {
      if (!moveTarget) {
        this.tank.turretAngle = rotateTowards(
          this.tank.turretAngle,
          this.tank.angle,
          this.tank.turretTurnRate * 0.45 * dt
        );
        return;
      }

      const targetAngle = angleTo(this.tank.x, this.tank.y, moveTarget.x, moveTarget.y);
      this.tank.turretAngle = rotateTowards(
        this.tank.turretAngle,
        targetAngle,
        this.tank.turretTurnRate * 0.5 * dt
      );
    }

    aimTurretAtPoint(point, dt, speedMultiplier = 0.5) {
      if (!point) return;
      const targetAngle = angleTo(this.tank.x, this.tank.y, point.x, point.y);
      this.tank.turretAngle = rotateTowards(
        this.tank.turretAngle,
        targetAngle,
        this.tank.turretTurnRate * speedMultiplier * dt
      );
    }

    driveTo(dt, x, y, stopDistance = 0, options = {}) {
      const dx = x - this.tank.x;
      const dy = y - this.tank.y;
      const distance = Math.hypot(dx, dy);
      if (distance < stopDistance) {
        this.applyDrive(dt, 0, 0);
        return;
      }

      const intensity = clamp((distance - stopDistance) / 280, 0.32, 1);
      this.driveVector(dt, dx / Math.max(distance, 1), dy / Math.max(distance, 1), intensity, options);
    }

    driveAwayFrom(dt, x, y, intensity = 0.8, options = { allowReverse: true }) {
      const dx = this.tank.x - x;
      const dy = this.tank.y - y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      this.driveVector(dt, dx / distance, dy / distance, intensity, options);
    }

    driveVector(dt, vx, vy, intensity, options = {}) {
      const recovery = this.navigation.getRecoveryDrive();
      if (recovery) {
        this.applyDrive(dt, recovery.throttle, recovery.turn);
        return;
      }

      const steer = this.avoidanceVector(vx, vy);
      const desiredAngle = Math.atan2(steer.y, steer.x);
      const forwardDiff = normalizeAngle(desiredAngle - this.tank.angle);
      const reverseDiff = normalizeAngle(desiredAngle - normalizeAngle(this.tank.angle + Math.PI));

      if (options.allowReverse && Math.abs(forwardDiff) > 1.92 && Math.abs(reverseDiff) < Math.abs(forwardDiff) - 0.34) {
        const reverseAligned = clamp((Math.cos(reverseDiff) + 0.15) / 1.15, 0.22, 0.82);
        this.applyDrive(dt, -intensity * reverseAligned * 0.72, clamp(reverseDiff * 1.2, -1, 1));
        return;
      }

      const turn = clamp(forwardDiff * 1.28, -1, 1);
      const aligned = clamp((Math.cos(forwardDiff) + 0.25) / 1.25, 0, 1);
      this.applyDrive(dt, intensity * aligned, turn);
    }

    avoidanceVector(vx, vy) {
      let ax = vx;
      let ay = vy;

      for (const obstacle of this.game.world.obstacles) {
        const expanded = expandedRect(obstacle, 82);
        const lookX = this.tank.x + vx * 116;
        const lookY = this.tank.y + vy * 116;
        const nearObstacle = pointInRect(this.tank.x, this.tank.y, expanded);
        const projectedHit = pointInRect(lookX, lookY, expanded) ||
          lineIntersectsRect(this.tank.x, this.tank.y, lookX, lookY, expanded);
        if (!nearObstacle && !projectedHit) continue;

        const nearestX = clamp(this.tank.x, obstacle.x, obstacle.x + obstacle.w);
        const nearestY = clamp(this.tank.y, obstacle.y, obstacle.y + obstacle.h);
        const awayX = this.tank.x - nearestX;
        const awayY = this.tank.y - nearestY;
        const distance = Math.max(1, Math.hypot(awayX, awayY));
        const force = Math.max(projectedHit ? 0.72 : 0, clamp((145 - distance) / 145, 0, 1)) * 1.18;
        ax += (awayX / distance) * force;
        ay += (awayY / distance) * force;
      }

      for (const other of this.game.tanks) {
        if (other === this.tank || !other.alive) continue;
        const distance = distXY(this.tank.x, this.tank.y, other.x, other.y);
        if (distance > 82 || distance < 1) continue;
        ax += ((this.tank.x - other.x) / distance) * (82 - distance) / 42;
        ay += ((this.tank.y - other.y) / distance) * (82 - distance) / 42;
      }

      if (this.tank.x < 120) ax += 1.2;
      if (this.tank.x > this.game.world.width - 120) ax -= 1.2;
      if (this.tank.y < 120) ay += 1.2;
      if (this.tank.y > this.game.world.height - 120) ay -= 1.2;

      const length = Math.max(0.001, Math.hypot(ax, ay));
      return { x: ax / length, y: ay / length };
    }

    applyDrive(dt, throttle, turn) {
      const tank = this.tank;
      tank.angle = normalizeAngle(tank.angle + turn * tank.turnRate * 0.82 * dt);
      const targetSpeed = tank.maxSpeed * throttle;
      tank.speed = approach(tank.speed, targetSpeed, tank.accel * 0.72 * dt);
      tank.speed *= 1 - 0.34 * dt;
      tryMoveCircle(this.game, tank, Math.cos(tank.angle) * tank.speed, Math.sin(tank.angle) * tank.speed, tank.radius, dt);
    }

    updateDebugState(order, decision, moveTarget) {
      const navDebug = this.navigation.debugState();
      this.debug.state = this.state;
      this.debug.goal = order?.objectiveName || "";
      this.debug.target = decision.target || order?.point || null;
      this.debug.moveTarget = moveTarget || navDebug.moveTarget;
      this.debug.path = navDebug.path;
      this.debug.pathIndex = navDebug.pathIndex;
      this.debug.stuckTimer = navDebug.stuckTimer;
      this.debug.recoveryTimer = navDebug.recoveryTimer;
      this.debug.visible = Boolean(decision.visible);
    }
  }

  TankAI.AI_VERSION = "order-navigation-combat-v2";
  TankAI.AMMO_TABLE = AMMO;
  IronLine.TankAI = TankAI;
})(window);
