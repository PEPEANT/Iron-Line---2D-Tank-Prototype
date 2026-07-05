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
  const { tryMoveCircle, hasLineOfSight } = IronLine.physics;
  const vehicleCrushThroughTypes = new Set([
    "sandbag",
    "barricade",
    "wood-fence",
    "brush",
    "tree",
    "rubble",
    "streetlight",
    "billboard",
    "bench"
  ]);

  function obstacleType(item) {
    return String(item?.type || item?.kind || "");
  }

  function canDriveThroughObstacle(item) {
    return Boolean(item?.destructible && !item.destroyed && vehicleCrushThroughTypes.has(obstacleType(item)));
  }

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
      this.trafficHoldTimer = 0;
      this.trafficHoldTarget = "";
      this.trafficHoldAge = 0;
      this.trafficBypassTimer = 0;
      this.trafficBypassTarget = "";
      this.suspicionPoint = null;
      this.suspicionTimer = 0;
      this.machineGunTargetKey = "";
      this.machineGunTrackTimer = 0;
      this.debug = {
        state: this.state,
        goal: "",
        target: null,
        moveTarget: null,
        path: [],
        pathIndex: 0,
        stuckTimer: 0,
        recoveryTimer: 0,
        visible: false,
        unsafeLine: false
      };
    }

    update(dt) {
      const beforeX = this.tank.x;
      const beforeY = this.tank.y;

      this.strafeTimer -= dt;
      this.suspicionTimer = Math.max(0, (this.suspicionTimer || 0) - dt);
      if (this.suspicionTimer <= 0) this.suspicionPoint = null;
      if (this.strafeTimer <= 0) {
        this.strafe *= -1;
        this.strafeTimer = 1.4 + Math.random() * 2.2;
      }

      if (this.handleInfantryAssaultThreat(dt, beforeX, beforeY)) return;

      const order = this.resolveOrder();
      const decision = this.combat.update(dt, order);
      let moveTarget = null;

      this.currentOrder = order;
      this.targetPoint = order?.point || null;
      this.targetTank = decision.target;

      if ((this.tank.repairHoldTimer || 0) > 0) {
        this.state = decision.target ? "repair-cover" : "repair-hold";
        moveTarget = this.tank;
        this.tank.drive(this.game, dt, 0, 0, {
          brake: true,
          dust: false,
          coastScale: 0.9,
          coastDrag: 1.35
        });
      } else if (decision.mode === "retreat" && decision.target) {
        this.state = "retreat";
        moveTarget = decision.target;
        this.driveAwayFrom(dt, decision.target.x, decision.target.y, 0.95);
      } else if (decision.mode === "engage" && decision.target) {
        this.state = "engage";
        moveTarget = this.handleEngagement(dt, decision, order);
      } else {
        const suspicion = this.activeSuspicionPoint();
        this.state = suspicion ? "search" : order?.role === "support" ? "overwatch" : order?.role === "hold" ? "hold" : "capture";
        moveTarget = this.handleObjective(dt, order);
        if (suspicion) this.aimTurretAtPoint(suspicion, dt, suspicion.sourceType === "hit_reaction" ? 0.62 : 0.44);
      }

      const stillHasMoveTarget = moveTarget && distXY(
        this.tank.x,
        this.tank.y,
        moveTarget.x,
        moveTarget.y
      ) > (moveTarget.stopDistance || 0) + 24;
      this.updateMachineGun(dt);
      this.navigation.recordMovement(dt, beforeX, beforeY, stillHasMoveTarget);
      this.updateDebugState(order, decision, moveTarget);
    }

    registerSuspicion(point, options = {}) {
      if (!point || point.team === this.tank.team) return false;
      const distance = distXY(this.tank.x, this.tank.y, point.x, point.y);
      if (distance > (options.hit ? 1500 : 1120)) return false;
      this.suspicionPoint = {
        x: point.x,
        y: point.y,
        target: point.target || point.owner || null,
        sourceType: options.sourceType || point.sourceType || (options.hit ? "hit_reaction" : "gunfire_suspicion")
      };
      this.suspicionTimer = Math.max(this.suspicionTimer || 0, options.hit ? 2.6 : 1.55);
      return true;
    }

    activeSuspicionPoint() {
      return this.suspicionTimer > 0 ? this.suspicionPoint : null;
    }

    handleInfantryAssaultThreat(dt, beforeX, beforeY) {
      const assault = this.tank.infantryAssault;
      const attacker = assault?.attacker;
      if (!attacker?.alive || attacker.team === this.tank.team || this.tank.assaultDisabledTimer > 0) return false;

      this.state = "repel-assault";
      this.currentOrder = null;
      this.targetPoint = null;
      this.targetTank = attacker;
      this.aimTurretAtPoint(attacker, dt, 0.9);
      const contact = this.tank.infantryAssaultContact?.(attacker, this.game, assault.slotIndex);
      const attached = Boolean(assault.attached || contact?.attached || assault.progress > 0.2);
      if (assault.progress >= 3) this.driveAwayFrom(dt, attacker.x, attacker.y, 0.82, { allowReverse: true });
      else this.applyDrive(dt, 0, 0);
      if (!attached) this.updateMachineGun(dt);
      this.navigation.recordMovement(dt, beforeX, beforeY, attached);
      this.updateDebugState(null, { mode: "repel-assault", target: attacker }, attacker);
      return true;
    }

    resolveOrder() {
      const commander = this.game.commanders?.[this.tank.team];
      let order = commander?.getOrderFor(this.tank) || null;

      if (order?.point?.owner === this.tank.team && order.role !== "hold") {
        commander.rebuildAssignments();
        commander.rebuildInfantryAssignments?.();
        order = commander.getOrderFor(this.tank) || order;
      }

      order = this.resolveStaleSupportOrder(order);
      return order || this.createFallbackOrder();
    }

    resolveStaleSupportOrder(order) {
      if (!order || order.role !== "support" || !order.point) return order;

      const reason = this.staleSupportReason(order);
      if (!reason) return order;

      const point = order.point;
      return {
        ...order,
        id: `${order.id}:armor-capture:${reason}`,
        role: "attack",
        stance: "armor-capture",
        supportPoint: null,
        pairedSquadId: "",
        leashRadius: Math.max(order.leashRadius || 0, AI_CONFIG.objectiveLeashRadius),
        threatRadius: Math.max(order.threatRadius || 0, (point.radius || 150) + AI_CONFIG.objectiveThreatExtra),
        soloReason: reason
      };
    }

    staleSupportReason(order) {
      const point = order.point;
      const pointRadius = point.radius || 150;
      const tankObjectiveDistance = distXY(this.tank.x, this.tank.y, point.x, point.y);
      const commander = this.game.commanders?.[this.tank.team];
      const request = order.supportRequestId ? commander?.supportRequests?.get(order.supportRequestId) : null;

      if (order.supportRequestId && !request) return "request-expired";
      if (request?.sourceSquad?.activeUnits?.().length === 0) return "squad-lost";
      if (
        request &&
        this.game.matchTime - (request.createdAt || 0) > 11.5 &&
        tankObjectiveDistance < pointRadius + 760
      ) {
        return "support-timeout";
      }

      if (order.supportPoint && this.nearWorldEdge(order.supportPoint, 104)) return "edge-support";
      if (order.supportPoint && distXY(order.supportPoint.x, order.supportPoint.y, point.x, point.y) > pointRadius + 520) {
        return "wide-support";
      }

      const pairedSquad = order.pairedSquadId
        ? (this.game.squads || []).find((squad) => squad.team === this.tank.team && squad.callSign === order.pairedSquadId)
        : null;
      const pairedUnits = pairedSquad?.activeUnits?.() || [];
      if (order.pairedSquadId && (!pairedSquad || pairedUnits.length === 0)) return "squad-lost";

      if (pairedSquad?.status?.center) {
        const center = pairedSquad.status.center;
        const squadObjectiveDistance = distXY(center.x, center.y, point.x, point.y);
        const squadTankDistance = distXY(center.x, center.y, this.tank.x, this.tank.y);
        if (tankObjectiveDistance < pointRadius + 640 && squadObjectiveDistance > pointRadius + 780) return "squad-too-far";
        if (tankObjectiveDistance < pointRadius + 620 && squadTankDistance > 920) return "squad-separated";
      }

      if (
        tankObjectiveDistance < pointRadius + 620 &&
        this.friendlyInfantryNear(point, pointRadius + 430) === 0
      ) {
        return "no-infantry";
      }

      return "";
    }

    friendlyInfantryNear(point, radius) {
      return (this.game.infantry || []).filter((unit) => (
        unit.alive &&
        unit.team === this.tank.team &&
        !unit.inVehicle &&
        unit.classId !== "scout" &&
        distXY(unit.x, unit.y, point.x, point.y) <= radius
      )).length;
    }

    nearWorldEdge(point, margin) {
      return point.x < margin ||
        point.y < margin ||
        point.x > this.game.world.width - margin ||
        point.y > this.game.world.height - margin;
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

      if (decision.blockedShot || decision.unsafeLine) {
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

      if (decision.blockedShot || decision.unsafeLine) {
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
        const step = this.normalizeTrafficTimers(dt);
        const throttle = options.allowReverse === false && recovery.throttle < 0 && !recovery.edge
          ? Math.max(0.18, Math.abs(recovery.throttle) * 0.42)
          : recovery.throttle;
        this.applyDrive(step, throttle, recovery.turn);
        return;
      }

      if (this.handleTrafficHold(dt, vx, vy)) return;

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
        const crushable = canDriveThroughObstacle(obstacle);
        const expanded = expandedRect(obstacle, crushable ? 18 : 64);
        const lookX = this.tank.x + vx * (crushable ? 58 : 108);
        const lookY = this.tank.y + vy * (crushable ? 58 : 108);
        const nearObstacle = pointInRect(this.tank.x, this.tank.y, expanded);
        const projectedHit = pointInRect(lookX, lookY, expanded) ||
          lineIntersectsRect(this.tank.x, this.tank.y, lookX, lookY, expanded);
        if (!nearObstacle && !projectedHit) continue;
        if (crushable) continue;

        const nearestX = clamp(this.tank.x, obstacle.x, obstacle.x + obstacle.w);
        const nearestY = clamp(this.tank.y, obstacle.y, obstacle.y + obstacle.h);
        const awayX = this.tank.x - nearestX;
        const awayY = this.tank.y - nearestY;
        const distance = Math.max(1, Math.hypot(awayX, awayY));
        const force = Math.max(projectedHit ? 0.58 : 0, clamp((132 - distance) / 132, 0, 1)) * 1.02;
        ax += (awayX / distance) * force;
        ay += (awayY / distance) * force;
      }

      for (const other of [...(this.game.tanks || []), ...(this.game.humvees || [])]) {
        if (other === this.tank) continue;
        const wreck = IronLine.physics?.isVehicleWreck?.(other) ||
          Boolean(!other.alive && !other.coverDestroyed && (other.hp <= 0 || other.destructionPending));
        if (wreck && IronLine.physics?.vehicleWreckBlocks && !IronLine.physics.vehicleWreckBlocks(other)) continue;
        if (!other.alive && !wreck) continue;
        const distance = distXY(this.tank.x, this.tank.y, other.x, other.y);
        const avoidRange = (this.tank.radius || 38) + (other.radius || 32) + (wreck ? 56 : 64);
        if (distance > avoidRange || distance < 1) continue;
        const force = ((avoidRange - distance) / Math.max(avoidRange * 0.46, 1)) * (wreck ? 1.32 : 1.42);
        ax += ((this.tank.x - other.x) / distance) * force;
        ay += ((this.tank.y - other.y) / distance) * force;
      }

      if (this.tank.x < 120) ax += 1.2;
      if (this.tank.x > this.game.world.width - 120) ax -= 1.2;
      if (this.tank.y < 120) ay += 1.2;
      if (this.tank.y > this.game.world.height - 120) ay -= 1.2;

      const length = Math.max(0.001, Math.hypot(ax, ay));
      return { x: ax / length, y: ay / length };
    }

    updateMachineGun(dt) {
      if (!this.tank?.hasMachineGunner?.() || (this.tank.ammo?.mg || 0) <= 0) return false;

      const target = this.findMachineGunTarget();
      if (!target) {
        this.machineGunTargetKey = "";
        this.machineGunTrackTimer = 0;
        this.tank.machineGunAngle = rotateTowards(
          this.tank.machineGunAngle,
          this.tank.turretAngle,
          this.tank.machineGunTurnRate * 0.54 * dt
        );
        return false;
      }

      const targetAngle = angleTo(this.tank.x, this.tank.y, target.x, target.y);
      const turnScale = target.isDrone ? 1.18 : 1;
      this.tank.machineGunAngle = rotateTowards(
        this.tank.machineGunAngle,
        targetAngle,
        this.tank.machineGunTurnRate * turnScale * dt
      );
      const aimError = Math.abs(normalizeAngle(this.tank.machineGunAngle - targetAngle));
      if (aimError > (target.isDrone ? 0.24 : 0.17) || !this.trackMachineGunTarget(target, dt, aimError)) return false;
      return this.tank.fireMachineGun(this.game, target.x, target.y, { target });
    }

    machineGunTargetId(target) {
      return target?.callSign || target?.id || `${target?.team || ""}:${Math.round(target?.x || 0)}:${Math.round(target?.y || 0)}`;
    }

    machineGunTrackRequired(target) {
      if (target?.isDrone || target === this.tank.infantryAssault?.attacker) return 0.08;
      if (target?.vehicleType) return 0.24;
      const distance = distXY(this.tank.x, this.tank.y, target.x, target.y);
      const movingPenalty = clamp(Math.abs(this.tank.speed || 0) / Math.max(this.tank.maxSpeed || 1, 1), 0, 1) * 0.22;
      return clamp(0.58 + distance / 1600 + movingPenalty, 0.66, 1.05);
    }

    trackMachineGunTarget(target, dt, aimError) {
      const key = this.machineGunTargetId(target);
      if (key !== this.machineGunTargetKey) {
        this.machineGunTargetKey = key;
        this.machineGunTrackTimer = 0;
      }
      if (aimError <= 0.34 || target?.isDrone || target?.vehicleType) this.machineGunTrackTimer += dt;
      else this.machineGunTrackTimer = Math.max(0, this.machineGunTrackTimer - dt * 0.6);
      return this.machineGunTrackTimer >= this.machineGunTrackRequired(target);
    }

    findMachineGunTarget() {
      const weapon = this.tank.machineGunWeapon?.() || { range: 760 };
      const muzzle = this.tank.machineGunMuzzlePoint?.() || { x: this.tank.x, y: this.tank.y };
      const range = weapon.range || 760;
      const candidates = [];

      const addTarget = (target, priority = 0) => {
        if (!target || target.alive === false || target.hp <= 0 || target.team === this.tank.team) return;
        const distance = distXY(muzzle.x, muzzle.y, target.x, target.y);
        if (distance > range) return;
        if (hasLineOfSight && !hasLineOfSight(this.game, muzzle, target, { padding: 4 })) return;
        const threatBonus =
          target.isDrone ? 260 :
          target.classId === "engineer" ? 220 :
          target.weaponId === "rpg" ? 190 :
          target.weaponId === "machinegun" || target.weaponId === "lmg" ? 130 :
          0;
        candidates.push({
          target,
          score: distance - threatBonus - priority
        });
      };

      for (const drone of this.game.drones || []) {
        addTarget(drone, drone.droneRole === "attack" ? 210 : 120);
      }
      if (this.tank.infantryAssault?.attacker) {
        addTarget(this.tank.infantryAssault.attacker, 520);
      }
      for (const unit of this.game.infantry || []) {
        if (!unit.inVehicle) addTarget(unit, unit.classId === "engineer" ? 180 : 120);
      }
      for (const crew of this.game.crews || []) {
        if (!crew.inTank) addTarget(crew, 70);
      }
      for (const vehicle of [...(this.game.humvees || []), ...(this.game.tanks || [])]) {
        if (vehicle === this.tank || !vehicle?.alive || vehicle.destructionPending) continue;
        addTarget(vehicle, vehicle.vehicleType === "humvee" ? 110 : 50);
      }

      if (this.game.isLocalPlayerEnemyFor?.(this.tank.team)) {
        addTarget(this.game.player, 150);
      }

      return candidates.sort((a, b) => a.score - b.score)[0]?.target || null;
    }

    normalizeTrafficTimers(dt) {
      const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
      this.trafficHoldTimer = Number.isFinite(this.trafficHoldTimer)
        ? Math.max(0, this.trafficHoldTimer - step)
        : 0;
      this.trafficHoldAge = Number.isFinite(this.trafficHoldAge)
        ? Math.max(0, this.trafficHoldAge)
        : 0;
      this.trafficBypassTimer = Number.isFinite(this.trafficBypassTimer)
        ? Math.max(0, this.trafficBypassTimer - step)
        : 0;
      if (this.trafficBypassTimer <= 0) this.trafficBypassTarget = "";
      return step;
    }

    handleTrafficHold(dt, vx, vy) {
      const step = this.normalizeTrafficTimers(dt);
      const blocker = this.frontFriendlyVehicle(vx, vy);
      if (blocker) {
        const blockerId = blocker.callSign || "";
        if (blockerId && blockerId === this.trafficHoldTarget) this.trafficHoldAge += step;
        else this.trafficHoldAge = blockerId ? step : 0;
        if (this.trafficHoldAge > 1.9) {
          this.trafficBypassTarget = blockerId;
          this.trafficBypassTimer = 1.15;
          this.trafficHoldTimer = 0;
          this.trafficHoldAge = 0;
          return false;
        }
        const waitSeed = Number.isFinite(this.navigation?.seed) ? this.navigation.seed : 0;
        const wait = 0.72 + (waitSeed % 6) * 0.08;
        this.trafficHoldTimer = Math.max(this.trafficHoldTimer, wait);
        this.trafficHoldTarget = blockerId;
      } else if (this.trafficHoldTimer <= 0) {
        this.trafficHoldTarget = "";
        this.trafficHoldAge = 0;
      }

      if (this.trafficHoldTimer <= 0) return false;
      this.applyDrive(step, 0, 0);
      return true;
    }

    frontFriendlyVehicle(vx, vy) {
      const ownRadius = this.tank.radius || 38;
      const candidates = [];
      for (const other of [...(this.game.tanks || []), ...(this.game.humvees || [])]) {
        if (other === this.tank || !other.alive || other.team !== this.tank.team) continue;
        if (this.trafficBypassTimer > 0 && (other.callSign || "") === this.trafficBypassTarget) continue;
        const dx = other.x - this.tank.x;
        const dy = other.y - this.tank.y;
        const forward = dx * vx + dy * vy;
        const otherRadius = other.radius || 32;
        const followRange = ownRadius + otherRadius + (other.vehicleType === "humvee" ? 86 : 104);
        if (forward <= 0 || forward > followRange) continue;
        const headingDot = Math.cos(other.angle || 0) * vx + Math.sin(other.angle || 0) * vy;
        if (headingDot < -0.35 && this.vehicleYieldKey(this.tank) <= this.vehicleYieldKey(other)) continue;
        const lateral = Math.abs(dx * -vy + dy * vx);
        const laneWidth = ownRadius + otherRadius + 18;
        if (lateral > laneWidth) continue;
        candidates.push({ vehicle: other, score: forward + lateral * 0.65 });
      }
      return candidates.sort((a, b) => a.score - b.score)[0]?.vehicle || null;
    }

    vehicleYieldKey(vehicle) {
      return String(vehicle?.callSign || vehicle?.id || vehicle?.spawnKey || "");
    }

    applyDrive(dt, throttle, turn) {
      const tank = this.tank;
      if (typeof tank.drive === "function") {
        tank.drive(this.game, dt, throttle, turn, {
          accelScale: 1.08,
          turnScale: 0.92,
          turnAccel: 4.1,
          driveDrag: 0.24,
          coastDrag: 0.95
        });
        return;
      }

      tank.angle = normalizeAngle(tank.angle + turn * tank.turnRate * 0.82 * dt);
      const targetSpeed = tank.maxSpeed * throttle;
      tank.speed = approach(tank.speed, targetSpeed, tank.accel * 0.72 * dt);
      tank.speed *= 1 - 0.34 * dt;
      tryMoveCircle(this.game, tank, Math.cos(tank.angle) * tank.speed, Math.sin(tank.angle) * tank.speed, tank.radius, dt, {
        blockTanks: true,
        blockWrecks: true,
        blockScenery: false,
        padding: 4
      });
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
      this.debug.unsafeLine = Boolean(decision.unsafeLine);
      this.debug.decision = decision.decision || null;
      this.debug.supportRequest = order?.supportRequestType || "";
      this.debug.supportRequestId = order?.supportRequestId || "";
      this.debug.trafficHoldTimer = this.trafficHoldTimer;
      this.debug.trafficHoldTarget = this.trafficHoldTarget;
      this.debug.trafficHoldAge = this.trafficHoldAge;
      this.debug.trafficBypassTimer = this.trafficBypassTimer;
      const trafficHint = this.game.tacticalMap?.vehicleHintNear?.(moveTarget || navDebug.moveTarget || this.tank, { maxDistance: 420 });
      this.debug.tacticalTrafficHint = trafficHint?.id || "";
      this.debug.tacticalTrafficReason = trafficHint?.reason || "";
      this.debug.tacticalVehicleStage = this.game.tacticalMap?.vehicleStagingPoints?.find?.((point) => point.vehicleId === this.tank.callSign)?.id || "";
      this.debug.tacticalWaitForClear = this.trafficHoldTarget && String(this.trafficHoldTarget).startsWith("traffic:")
        ? this.trafficHoldTarget
        : "";
    }
  }

  TankAI.AI_VERSION = "order-navigation-combat-v2";
  TankAI.AMMO_TABLE = AMMO;
  IronLine.TankAI = TankAI;
})(window);
