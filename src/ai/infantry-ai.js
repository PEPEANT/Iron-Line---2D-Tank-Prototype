"use strict";

(function registerInfantryAI(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, INFANTRY_WEAPONS } = IronLine.constants;
  const { clamp, distXY, angleTo, approach, rotateTowards, expandedRect, lineIntersectsRect, circleRectCollision } = IronLine.math;
  const { tryMoveCircle, hasLineOfSight } = IronLine.physics;

  const INFANTRY_CONFIG = {
    sightRange: 620,
    coverThreatRange: 720,
    coverDuration: 2.7,
    suppressedThreshold: 58
  };

  class InfantryAI {
    constructor(unit, game) {
      this.unit = unit;
      this.game = game;
      this.state = "advance";
      this.order = null;
      this.path = [];
      this.pathIndex = 0;
      this.orderId = "";
      this.repathTimer = 0;
      this.stuckTimer = 0;
      this.fireCooldown = Math.random() * 0.35;
      this.coverTimer = 0;
      this.coverTarget = null;
      this.target = null;
      this.moveHeading = unit.angle;
      this.seed = this.hash(unit.callSign);
      this.debug = {
        state: this.state,
        goal: "",
        target: null,
        coverTarget: null,
        moveTarget: null,
        weaponId: this.unit.weaponId,
        squadId: "",
        squadRole: "",
        coverQuality: 0,
        suppression: 0,
        morale: 1,
        path: [],
        pathIndex: 0,
        stuckTimer: 0
      };
    }

    hash(value) {
      return String(value).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    }

    weapon() {
      return INFANTRY_WEAPONS[this.unit.weaponId] || INFANTRY_WEAPONS.rifle;
    }

    update(dt) {
      const beforeX = this.unit.x;
      const beforeY = this.unit.y;
      this.repathTimer = Math.max(0, this.repathTimer - dt);
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      this.coverTimer = Math.max(0, this.coverTimer - dt);

      const order = this.resolveOrder();
      this.order = order;
      const contact = this.selectTarget();
      const tankThreat = this.selectTankThreat();
      this.target = contact;

      if (!order?.point) {
        this.state = "idle";
        this.unit.speed = approach(this.unit.speed, 0, 180 * dt);
        this.faceContact(contact, dt);
        this.updateDebug(null);
        return;
      }

      const pressureThreat = this.unit.suppression >= INFANTRY_CONFIG.suppressedThreshold
        ? contact || tankThreat || this.unit.lastThreat
        : null;
      if (pressureThreat) {
        const coverTarget = this.resolveCoverTarget(pressureThreat);
        this.state = "suppressed";
        this.target = contact || tankThreat || pressureThreat;
        this.faceContact(this.target, dt);
        if (contact && this.unit.suppression < 84) this.tryFire(contact);

        if (coverTarget) {
          this.moveTo(dt, coverTarget);
          this.recordMovement(dt, beforeX, beforeY, coverTarget);
          this.updateDebug(coverTarget);
          return;
        }

        this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
        this.updateDebug(null);
        return;
      }

      if (tankThreat) {
        const tankDistance = distXY(this.unit.x, this.unit.y, tankThreat.x, tankThreat.y);
        const coverTarget = this.resolveCoverTarget(tankThreat);
        if (coverTarget && (!contact || tankDistance < 520)) {
          this.state = "cover";
          this.target = contact || tankThreat;
          this.faceContact(this.target, dt);
          if (contact) this.tryFire(contact);
          this.moveTo(dt, coverTarget);
          this.recordMovement(dt, beforeX, beforeY, coverTarget);
          this.updateDebug(coverTarget);
          return;
        }
      }

      if (contact) {
        const weapon = this.weapon();
        const distance = distXY(this.unit.x, this.unit.y, contact.x, contact.y);
        const tooClose = distance < weapon.desiredRange * 0.62;
        const outOfRange = distance > weapon.range * 0.92;
        this.state = tooClose ? "cover" : "fire";
        this.faceContact(contact, dt);
        this.tryFire(contact);

        if (tooClose) {
          const coverTarget = this.resolveCoverTarget(contact);
          if (coverTarget) {
            this.moveTo(dt, coverTarget);
            this.recordMovement(dt, beforeX, beforeY, coverTarget);
            this.updateDebug(coverTarget);
            return;
          }
        }

        if (outOfRange) {
          const approachTarget = {
            x: contact.x,
            y: contact.y,
            stopDistance: weapon.desiredRange,
            final: false
          };
          this.moveTo(dt, approachTarget);
          this.recordMovement(dt, beforeX, beforeY, approachTarget);
          this.updateDebug(approachTarget);
          return;
        }

        this.unit.speed = approach(this.unit.speed, 0, 240 * dt);
        this.updateDebug(null);
        return;
      }

      const moveTarget = this.nextMoveTarget(order);
      this.state = distXY(this.unit.x, this.unit.y, order.point.x, order.point.y) <= order.point.radius - 18
        ? "secure"
        : "advance";

      this.moveTo(dt, moveTarget);
      this.recordMovement(dt, beforeX, beforeY, moveTarget);
      this.updateDebug(moveTarget);
    }

    selectTarget() {
      const candidates = [];

      for (const unit of this.game.infantry || []) {
        if (unit === this.unit || !unit.alive || unit.team === this.unit.team) continue;
        candidates.push(unit);
      }

      for (const crew of this.game.crews || []) {
        if (!crew.alive || crew.inTank || crew.team === this.unit.team) continue;
        candidates.push(crew);
      }

      if (!this.game.player.inTank && this.game.player.hp > 0 && this.unit.team === TEAM.RED && !this.game.isPlayerInSafeZone?.()) {
        candidates.push(this.game.player);
      }

      return candidates
        .map((target) => ({
          target,
          distance: distXY(this.unit.x, this.unit.y, target.x, target.y)
        }))
        .filter((item) => (
          item.distance <= Math.max(INFANTRY_CONFIG.sightRange, this.weapon().range + 80) &&
          hasLineOfSight(this.game, this.unit, item.target, { padding: 3 })
        ))
        .sort((a, b) => a.distance - b.distance)[0]?.target || null;
    }

    selectTankThreat() {
      return this.game.tanks
        .filter((tank) => tank.alive && tank.team !== this.unit.team)
        .map((tank) => ({
          tank,
          distance: distXY(this.unit.x, this.unit.y, tank.x, tank.y)
        }))
        .filter((item) => (
          item.distance <= INFANTRY_CONFIG.coverThreatRange &&
          hasLineOfSight(this.game, this.unit, item.tank, { padding: 4 })
        ))
        .sort((a, b) => a.distance - b.distance)[0]?.tank || null;
    }

    faceContact(target) {
      if (!target) return;
      this.unit.angle = angleTo(this.unit.x, this.unit.y, target.x, target.y);
      this.moveHeading = this.unit.angle;
    }

    tryFire(target) {
      if (this.fireCooldown > 0 || !target) return false;
      const weapon = this.weapon();
      if (distXY(this.unit.x, this.unit.y, target.x, target.y) > weapon.range) return false;
      if (this.unit.suppressed && this.unit.suppression > 72 && Math.random() < 0.48) {
        this.fireCooldown = Math.min(weapon.cooldown, 0.22 + Math.random() * 0.24);
        return false;
      }

      const suppressionPenalty = clamp(this.unit.suppression / 165, 0, 0.36);
      const fired = IronLine.combat.fireRifle(this.game, this.unit, target, {
        weapon,
        range: weapon.range,
        damage: weapon.damageMin + Math.random() * (weapon.damageMax - weapon.damageMin),
        accuracyBonus: weapon.accuracyBonus + (this.state === "secure" ? 0.06 : 0) - suppressionPenalty
      });
      if (fired) this.fireCooldown = weapon.cooldown + suppressionPenalty * 0.7 + Math.random() * weapon.cooldown * 0.45;
      return fired;
    }

    resolveCoverTarget(threat) {
      if (this.coverTarget && this.coverTimer > 0 && this.pointPassable(this.coverTarget.x, this.coverTarget.y, this.unit.radius + 3)) {
        if (this.game.coverSlots?.renew(this.unit, this.coverTarget, 1.4) || !this.game.coverSlots) {
          return this.coverTarget;
        }
        if (this.game.coverSlots?.isAvailable(this.unit, this.coverTarget)) {
          this.coverTarget = this.game.coverSlots.reserve(this.unit, this.coverTarget, 1.4) || this.coverTarget;
          return this.coverTarget;
        }
        this.coverTarget = null;
      }

      this.coverTarget = this.findCoverPoint(threat);
      this.coverTimer = INFANTRY_CONFIG.coverDuration;
      return this.coverTarget;
    }

    findCoverPoint(threat) {
      let best = null;
      let bestQuality = -Infinity;

      for (const obstacle of this.game.world.obstacles) {
        const samples = this.coverSamplesForObstacle(obstacle, threat);
        for (const point of samples) {
          if (!this.pointPassable(point.x, point.y, this.unit.radius + 3)) continue;
          if (this.game.coverSlots && !this.game.coverSlots.isAvailable(this.unit, point)) continue;
          if (hasLineOfSight(this.game, threat, point, { padding: 3, ignoreSmoke: true })) continue;

          const selfDistance = distXY(this.unit.x, this.unit.y, point.x, point.y);
          const maxMove = this.coverSearchRadius();
          if (selfDistance > maxMove) continue;

          const quality = this.evaluateCoverPoint(point, obstacle, threat, selfDistance);
          if (quality.total > bestQuality) {
            best = {
              ...point,
              stopDistance: 14,
              final: false,
              cover: true,
              coverQuality: quality.total,
              coverMetrics: quality.metrics
            };
            bestQuality = quality.total;
          }
        }
      }

      return best && this.game.coverSlots
        ? this.game.coverSlots.reserve(this.unit, best, 1.4) || best
        : best;
    }

    coverSearchRadius() {
      const role = this.order?.squadRole || this.unit.squadRole || "assault";
      if (role === "support") return 440;
      if (role === "security") return 400;
      return 360;
    }

    evaluateCoverPoint(point, obstacle, threat, selfDistance) {
      const role = this.order?.squadRole || this.unit.squadRole || "assault";
      const threatDistance = distXY(point.x, point.y, threat.x, threat.y);
      const primaryBlock = lineIntersectsRect(
        threat.x,
        threat.y,
        point.x,
        point.y,
        expandedRect(obstacle, 4)
      );

      const metrics = {
        block: primaryBlock ? 1 : 0.72,
        fire: this.coverFireScore(point, threat),
        objective: this.coverObjectiveScore(point, role),
        move: 1 - clamp(selfDistance / this.coverSearchRadius(), 0, 1),
        safety: clamp((threatDistance - 90) / 520, 0, 1)
      };

      const weights = this.coverWeights(role);
      return {
        total: (
          metrics.block * weights.block +
          metrics.fire * weights.fire +
          metrics.objective * weights.objective +
          metrics.move * weights.move +
          metrics.safety * weights.safety
        ) * 100,
        metrics
      };
    }

    coverWeights(role) {
      if (role === "support") {
        return { block: 0.3, fire: 0.3, objective: 0.16, move: 0.12, safety: 0.12 };
      }
      if (role === "security") {
        return { block: 0.32, fire: 0.24, objective: 0.2, move: 0.13, safety: 0.11 };
      }
      return { block: 0.34, fire: 0.16, objective: 0.28, move: 0.15, safety: 0.07 };
    }

    coverObjectiveScore(point, role) {
      if (!this.order?.point) return 0.5;

      const distance = distXY(point.x, point.y, this.order.point.x, this.order.point.y);
      const preferred = role === "support"
        ? this.order.point.radius + 145
        : role === "security"
          ? this.order.point.radius + 95
          : this.order.point.radius + 45;
      const falloff = role === "support" ? 300 : 230;
      const distanceScore = 1 - clamp(Math.max(0, distance - preferred) / falloff, 0, 1);
      const sightScore = hasLineOfSight(this.game, point, this.order.point, { padding: 2, ignoreSmoke: true }) ? 0.18 : 0;
      return clamp(distanceScore + sightScore, 0, 1);
    }

    coverFireScore(point, threat) {
      if (!threat) return 0;

      const directAngle = angleTo(point.x, point.y, threat.x, threat.y);
      const sideAngle = directAngle + Math.PI / 2;
      const peekOptions = [
        { side: -1, forward: 10 },
        { side: 1, forward: 10 },
        { side: -1, forward: -8 },
        { side: 1, forward: -8 }
      ];

      let best = 0;
      for (const option of peekOptions) {
        const peek = {
          x: point.x + Math.cos(sideAngle) * option.side * 28 + Math.cos(directAngle) * option.forward,
          y: point.y + Math.sin(sideAngle) * option.side * 28 + Math.sin(directAngle) * option.forward
        };
        if (!this.pointPassable(peek.x, peek.y, this.unit.radius + 2)) continue;

        const canSeeThreat = hasLineOfSight(this.game, peek, threat, { padding: 2, ignoreSmoke: true });
        const canSeeObjective = this.order?.point
          ? hasLineOfSight(this.game, peek, this.order.point, { padding: 2, ignoreSmoke: true })
          : false;
        const value = (canSeeThreat ? 0.78 : 0) + (canSeeObjective ? 0.22 : 0);
        best = Math.max(best, value);
      }

      return clamp(best, 0, 1);
    }

    coverSamplesForObstacle(obstacle, threat) {
      const offset = 34;
      const points = [
        { x: obstacle.x - offset, y: obstacle.y + obstacle.h * 0.25 },
        { x: obstacle.x - offset, y: obstacle.y + obstacle.h * 0.75 },
        { x: obstacle.x + obstacle.w + offset, y: obstacle.y + obstacle.h * 0.25 },
        { x: obstacle.x + obstacle.w + offset, y: obstacle.y + obstacle.h * 0.75 },
        { x: obstacle.x + obstacle.w * 0.25, y: obstacle.y - offset },
        { x: obstacle.x + obstacle.w * 0.75, y: obstacle.y - offset },
        { x: obstacle.x + obstacle.w * 0.25, y: obstacle.y + obstacle.h + offset },
        { x: obstacle.x + obstacle.w * 0.75, y: obstacle.y + obstacle.h + offset }
      ];

      return points.sort((a, b) => (
        distXY(a.x, a.y, threat.x, threat.y) - distXY(b.x, b.y, threat.x, threat.y)
      ));
    }

    resolveOrder() {
      const commander = this.game.commanders?.[this.unit.team];
      const ordered = commander?.getInfantryOrderFor(this.unit);
      if (ordered) return ordered;

      const point = this.chooseFallbackPoint();
      if (!point) return null;
      return {
        id: `${this.unit.team}:infantry-fallback:${point.name}`,
        team: this.unit.team,
        point,
        objectiveName: point.name,
        role: "infantry",
        stance: "advance",
        slotIndex: 0,
        slotCount: 1
      };
    }

    chooseFallbackPoint() {
      const enemyOwner = this.unit.team === TEAM.BLUE ? TEAM.RED : TEAM.BLUE;
      const candidates = this.game.capturePoints
        .filter((point) => point.owner !== this.unit.team)
        .map((point) => {
          let score = distXY(this.unit.x, this.unit.y, point.x, point.y);
          if (point.owner === enemyOwner) score -= 240;
          if (point.contested) score -= 160;
          return { point, score };
        })
        .sort((a, b) => a.score - b.score);
      return candidates[0]?.point || this.game.capturePoints[0] || null;
    }

    nextMoveTarget(order) {
      if (this.orderId !== order.id) {
        this.orderId = order.id;
        this.path = [];
        this.pathIndex = 0;
        this.repathTimer = 0;
      }

      const finalTarget = this.formationTarget(order);
      if (this.canMoveDirect(finalTarget.x, finalTarget.y, 24)) {
        this.path = [];
        this.pathIndex = 0;
        return finalTarget;
      }

      if (this.path.length === 0 || this.repathTimer <= 0) this.rebuildPath(order);

      while (
        this.pathIndex < this.path.length &&
        distXY(this.unit.x, this.unit.y, this.path[this.pathIndex].x, this.path[this.pathIndex].y) < 66
      ) {
        this.pathIndex += 1;
      }

      if (this.pathIndex >= this.path.length) return finalTarget;
      const node = this.path[this.pathIndex];
      return { x: node.x, y: node.y, stopDistance: 42, final: false };
    }

    formationTarget(order) {
      const formation = order.formation;
      const count = Math.max(1, formation ? order.roleSlotCount || 1 : order.slotCount || 1);
      const slot = clamp(formation ? order.roleSlotIndex || 0 : order.slotIndex || 0, 0, count - 1);
      let target = null;

      if (formation) {
        const sideIndex = slot - (count - 1) / 2 + (formation.sideBias || 0) * 0.35;
        const forwardX = Math.cos(formation.angle);
        const forwardY = Math.sin(formation.angle);
        const sideX = Math.cos(formation.angle + Math.PI / 2);
        const sideY = Math.sin(formation.angle + Math.PI / 2);
        const sideOffset = sideIndex * (formation.spacing || 36);
        target = {
          x: order.point.x + forwardX * formation.distance + sideX * sideOffset,
          y: order.point.y + forwardY * formation.distance + sideY * sideOffset,
          stopDistance: formation.stopDistance || 24,
          final: true
        };
      } else {
        const angle = this.seed * 0.37 + slot * Math.PI * 2 / count;
        const radius = 46 + slot % 3 * 18;
        target = {
          x: order.point.x + Math.cos(angle) * radius,
          y: order.point.y + Math.sin(angle) * radius,
          stopDistance: 24,
          final: true
        };
      }

      if (formation?.allowOutside && this.pointPassable(target.x, target.y, this.unit.radius + 3)) {
        return target;
      }

      return this.safeFormationTarget(order, target);
    }

    safeFormationTarget(order, target) {
      const allowOutside = Boolean(order.formation?.allowOutside);
      if (this.pointPassable(target.x, target.y, this.unit.radius + 3)) return target;

      const baseAngle = this.seed * 0.51;
      const radii = allowOutside ? [96, 132, 168, 204] : [72, 96, 118, 132];
      for (const radius of radii) {
        for (let step = 0; step < 14; step += 1) {
          const angle = baseAngle + step * Math.PI * 2 / 14;
          const candidate = {
            x: order.point.x + Math.cos(angle) * radius,
            y: order.point.y + Math.sin(angle) * radius,
            stopDistance: target.stopDistance || 24,
            final: true
          };
          if (!allowOutside && distXY(candidate.x, candidate.y, order.point.x, order.point.y) > order.point.radius - 4) continue;
          if (this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3)) return candidate;
        }
      }

      return target;
    }

    rebuildPath(order) {
      if (!this.game.navGraph) return;
      const rawPath = this.game.navGraph.findPathBetween(this.unit, order.point, { padding: 24 });
      this.path = rawPath.filter((node) => distXY(this.unit.x, this.unit.y, node.x, node.y) > 52);
      this.pathIndex = 0;
      this.repathTimer = 2.8 + Math.random() * 0.9;
    }

    moveTo(dt, target) {
      const dx = target.x - this.unit.x;
      const dy = target.y - this.unit.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= (target.stopDistance || 20) + (target.final ? 8 : 2)) {
        this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
        return;
      }

      const desiredAngle = angleTo(this.unit.x, this.unit.y, target.x, target.y);
      const steer = this.avoidanceVector(Math.cos(desiredAngle), Math.sin(desiredAngle));
      const steerAngle = Math.atan2(steer.y, steer.x);
      this.moveHeading = rotateTowards(this.moveHeading, steerAngle, 5.2 * dt);
      this.unit.angle = this.moveHeading;
      const moraleSpeed = clamp(this.unit.morale + 0.22, 0.58, 1);
      const weaponSpeed = this.weapon().moveSpeedMultiplier || 1;
      const targetSpeed = this.unit.maxSpeed * clamp(distance / 180, 0.45, 1) * moraleSpeed * weaponSpeed;
      this.unit.speed = approach(this.unit.speed, targetSpeed, 320 * dt);
      tryMoveCircle(
        this.game,
        this.unit,
        Math.cos(this.unit.angle) * this.unit.speed,
        Math.sin(this.unit.angle) * this.unit.speed,
        this.unit.radius,
        dt
      );
    }

    avoidanceVector(vx, vy) {
      let ax = vx;
      let ay = vy;

      for (const obstacle of this.game.world.obstacles) {
        const expanded = expandedRect(obstacle, 28);
        const lookX = this.unit.x + vx * 52;
        const lookY = this.unit.y + vy * 52;
        if (!lineIntersectsRect(this.unit.x, this.unit.y, lookX, lookY, expanded)) continue;

        const nearestX = clamp(this.unit.x, obstacle.x, obstacle.x + obstacle.w);
        const nearestY = clamp(this.unit.y, obstacle.y, obstacle.y + obstacle.h);
        const awayX = this.unit.x - nearestX;
        const awayY = this.unit.y - nearestY;
        const distance = Math.max(1, Math.hypot(awayX, awayY));
        ax += (awayX / distance) * 0.75;
        ay += (awayY / distance) * 0.75;
      }

      for (const other of this.game.infantry || []) {
        if (other === this.unit || !other.alive) continue;
        const distance = distXY(this.unit.x, this.unit.y, other.x, other.y);
        if (distance > 32 || distance < 1) continue;
        ax += ((this.unit.x - other.x) / distance) * (32 - distance) / 22;
        ay += ((this.unit.y - other.y) / distance) * (32 - distance) / 22;
      }

      const length = Math.max(0.001, Math.hypot(ax, ay));
      return { x: ax / length, y: ay / length };
    }

    canMoveDirect(x, y, padding = 24) {
      return !this.game.world.obstacles.some((obstacle) => (
        lineIntersectsRect(this.unit.x, this.unit.y, x, y, expandedRect(obstacle, padding))
      ));
    }

    pointPassable(x, y, radius) {
      if (x < radius || y < radius || x > this.game.world.width - radius || y > this.game.world.height - radius) {
        return false;
      }
      return !this.game.world.obstacles.some((obstacle) => circleRectCollision(x, y, radius, obstacle));
    }

    recordMovement(dt, beforeX, beforeY, target) {
      const moved = distXY(beforeX, beforeY, this.unit.x, this.unit.y);
      const trying = target && distXY(this.unit.x, this.unit.y, target.x, target.y) > (target.stopDistance || 20) + 8;
      if (trying && moved < 5 * dt) this.stuckTimer += dt;
      else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 1.8);

      if (this.stuckTimer > 0.9) {
        this.path = [];
        this.pathIndex = 0;
        this.repathTimer = 0;
        this.stuckTimer = 0;
      }
    }

    updateDebug(moveTarget) {
      this.debug.state = this.state;
      this.debug.goal = this.order?.objectiveName || "";
      this.debug.target = this.target;
      this.debug.coverTarget = this.coverTarget;
      this.debug.moveTarget = moveTarget;
      this.debug.weaponId = this.unit.weaponId;
      this.debug.squadId = this.order?.squadId || this.unit.squadId || "";
      this.debug.squadRole = this.order?.squadRole || this.unit.squadRole || "";
      this.debug.coverQuality = this.coverTarget?.coverQuality || 0;
      this.debug.suppression = this.unit.suppression;
      this.debug.morale = this.unit.morale;
      this.debug.path = this.path;
      this.debug.pathIndex = this.pathIndex;
      this.debug.stuckTimer = this.stuckTimer;
    }
  }

  IronLine.InfantryAI = InfantryAI;
})(window);
