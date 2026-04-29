"use strict";

(function registerNavigationAgent(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { distXY, clamp, angleTo, normalizeAngle, expandedRect, lineIntersectsRect, circleRectCollision } = IronLine.math;

  class NavigationAgent {
    constructor(tank, game) {
      this.tank = tank;
      this.game = game;
      this.path = [];
      this.pathIndex = 0;
      this.orderId = "";
      this.repathTimer = 0;
      this.stuckTimer = 0;
      this.recoveryTimer = 0;
      this.recoverySide = Math.random() < 0.5 ? -1 : 1;
      this.lastDistanceToTarget = null;
      this.moveTarget = null;
      this.seed = this.hash(tank.callSign);
    }

    hash(value) {
      return String(value).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    }

    update(dt, order) {
      this.repathTimer = Math.max(0, this.repathTimer - dt);
      this.recoveryTimer = Math.max(0, this.recoveryTimer - dt);

      if (!order?.point) {
        this.clearPath("");
        this.moveTarget = { x: this.tank.x, y: this.tank.y, stopDistance: 0, final: true };
        return this.moveTarget;
      }

      if (this.orderId !== order.id) {
        this.clearPath(order.id);
      }

      const finalTarget = this.finalTarget(order);
      if (this.canDriveDirect(finalTarget.x, finalTarget.y, 58)) {
        this.path = [];
        this.pathIndex = 0;
        this.moveTarget = finalTarget;
        return this.moveTarget;
      }

      if (this.path.length === 0 || this.repathTimer <= 0) {
        this.rebuildPath(order);
      }

      this.advancePath();
      this.skipVisibleNodes();

      if (this.pathIndex >= this.path.length) {
        this.moveTarget = finalTarget;
        return this.moveTarget;
      }

      const node = this.path[this.pathIndex];
      const offset = this.formationOffset(order, 34);
      this.moveTarget = {
        x: node.x + offset.x,
        y: node.y + offset.y,
        id: node.id,
        stopDistance: 104,
        final: false
      };
      return this.moveTarget;
    }

    finalTarget(order) {
      if (order.supportPoint) {
        const safeSupport = this.safePointNear(order.supportPoint, this.tank.radius + 6, order.supportPoint.avoidEdgeMargin || 124);
        return {
          x: safeSupport.x,
          y: safeSupport.y,
          stopDistance: order.supportPoint.stopDistance || 76,
          final: true,
          overwatch: true
        };
      }

      const captureIntent = order.role !== "hold" && order.role !== "support";
      const radius = order.role === "hold" ? 98 : order.role === "support" ? 108 : 56;
      const offset = this.formationOffset(order, radius);
      const preferred = {
        x: order.point.x + offset.x,
        y: order.point.y + offset.y
      };
      const safeTarget = this.safeCaptureTarget(order, preferred);
      return {
        x: safeTarget.x,
        y: safeTarget.y,
        stopDistance: captureIntent ? 28 : order.role === "hold" ? 78 : 62,
        final: true
      };
    }

    safeCaptureTarget(order, preferred) {
      if (this.pointPassable(preferred.x, preferred.y, this.tank.radius + 5)) return preferred;

      const baseAngle = this.seed * 0.41 + (order.slotIndex || 0) * 0.9;
      const captureIntent = order.role !== "hold" && order.role !== "support";
      const radii = captureIntent ? [48, 64, 82, 104] : [112, 126, 92, 72];
      const maxObjectiveDistance = captureIntent
        ? Math.max(36, (order.point.radius || 135) - 34)
        : (order.point.radius || 135) - 6;
      for (const radius of radii) {
        for (let step = 0; step < 12; step += 1) {
          const angle = baseAngle + step * Math.PI * 2 / 12;
          const candidate = {
            x: order.point.x + Math.cos(angle) * radius,
            y: order.point.y + Math.sin(angle) * radius
          };
          if (distXY(candidate.x, candidate.y, order.point.x, order.point.y) > maxObjectiveDistance) continue;
          if (this.pointPassable(candidate.x, candidate.y, this.tank.radius + 5)) return candidate;
        }
      }

      return preferred;
    }

    safePointNear(point, radius, margin = radius) {
      const preferred = {
        x: clamp(point.x, margin, this.game.world.width - margin),
        y: clamp(point.y, margin, this.game.world.height - margin)
      };
      if (this.pointPassable(preferred.x, preferred.y, radius)) return preferred;

      const baseAngle = this.seed * 0.37;
      for (const distance of [58, 86, 122, 164]) {
        for (let step = 0; step < 12; step += 1) {
          const angle = baseAngle + step * Math.PI * 2 / 12;
          const candidate = {
            x: clamp(preferred.x + Math.cos(angle) * distance, margin, this.game.world.width - margin),
            y: clamp(preferred.y + Math.sin(angle) * distance, margin, this.game.world.height - margin)
          };
          if (this.pointPassable(candidate.x, candidate.y, radius)) return candidate;
        }
      }

      return preferred;
    }

    formationOffset(order, radius) {
      const count = Math.max(1, order.slotCount || 1);
      const slot = clamp(order.slotIndex || 0, 0, count - 1);
      if (count <= 1) {
        const angle = this.seed * 0.73;
        return { x: Math.cos(angle) * radius * 0.28, y: Math.sin(angle) * radius * 0.28 };
      }

      const angle = -Math.PI / 2 + (slot / count) * Math.PI * 2 + (this.seed % 7) * 0.05;
      const ring = radius * (0.72 + (slot % 2) * 0.18);
      return { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring };
    }

    rebuildPath(order) {
      if (!this.game.navGraph) {
        this.path = [];
        this.pathIndex = 0;
        return;
      }

      const goal = order.supportPoint || order.point;
      const rawPath = this.game.navGraph.findPathBetween(this.tank, goal, {
        padding: 64
      });
      this.path = rawPath.filter((node) => distXY(this.tank.x, this.tank.y, node.x, node.y) > 95);
      this.pathIndex = 0;
      this.repathTimer = 2.6 + Math.random() * 0.7;
    }

    advancePath() {
      while (
        this.pathIndex < this.path.length &&
        distXY(this.tank.x, this.tank.y, this.path[this.pathIndex].x, this.path[this.pathIndex].y) < 124
      ) {
        this.pathIndex += 1;
      }
    }

    skipVisibleNodes() {
      for (let index = this.path.length - 1; index > this.pathIndex; index -= 1) {
        const node = this.path[index];
        if (this.canDriveDirect(node.x, node.y, 54)) {
          this.pathIndex = index;
          return;
        }
      }
    }

    canDriveDirect(x, y, padding = 58) {
      return !this.game.world.obstacles.some((obstacle) => (
        lineIntersectsRect(this.tank.x, this.tank.y, x, y, expandedRect(obstacle, padding))
      ));
    }

    pointPassable(x, y, radius) {
      return !this.game.world.obstacles.some((obstacle) => circleRectCollision(x, y, radius, obstacle));
    }

    recordMovement(dt, beforeX, beforeY, tryingToMove) {
      if (!this.moveTarget) return;

      const moved = distXY(beforeX, beforeY, this.tank.x, this.tank.y);
      const distance = distXY(this.tank.x, this.tank.y, this.moveTarget.x, this.moveTarget.y);
      const targetReached = distance <= (this.moveTarget.stopDistance || 0) + 18;
      const madeProgress = this.lastDistanceToTarget === null || distance < this.lastDistanceToTarget - 1.5;

      if (!tryingToMove || targetReached || moved > 8 * dt || madeProgress) {
        this.stuckTimer = Math.max(0, this.stuckTimer - dt * 1.6);
      } else {
        this.stuckTimer += dt;
      }

      if (this.stuckTimer > 0.72) {
        this.startRecovery();
      }

      this.lastDistanceToTarget = distance;
    }

    startRecovery() {
      this.recoveryTimer = 0.9;
      this.recoverySide *= -1;
      this.stuckTimer = 0;
      this.repathTimer = 0;
    }

    getRecoveryDrive() {
      if (this.recoveryTimer <= 0) return null;
      const edge = this.edgeRecoveryDrive();
      if (edge) return edge;
      return {
        throttle: -0.48,
        turn: this.recoverySide * 0.88
      };
    }

    edgeRecoveryDrive() {
      const world = this.game.world;
      const margin = Math.max(150, (this.tank.radius || 36) + 104);
      const nearEdge = this.tank.x < margin ||
        this.tank.y < margin ||
        this.tank.x > world.width - margin ||
        this.tank.y > world.height - margin;
      if (!nearEdge) return null;

      const targetAngle = angleTo(this.tank.x, this.tank.y, world.width / 2, world.height / 2);
      const diff = normalizeAngle(targetAngle - this.tank.angle);
      const aligned = clamp((Math.cos(diff) + 1) / 2, 0, 1);
      return {
        throttle: 0.24 + aligned * 0.36,
        turn: clamp(diff * 1.35, -1, 1),
        edge: true
      };
    }

    clearPath(orderId) {
      this.orderId = orderId;
      this.path = [];
      this.pathIndex = 0;
      this.repathTimer = 0;
      this.lastDistanceToTarget = null;
    }

    debugState() {
      return {
        path: this.path,
        pathIndex: this.pathIndex,
        moveTarget: this.moveTarget,
        stuckTimer: this.stuckTimer,
        recoveryTimer: this.recoveryTimer
      };
    }
  }

  IronLine.NavigationAgent = NavigationAgent;
})(window);
