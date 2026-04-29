"use strict";

(function registerHumveeAI(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;
  const {
    clamp,
    distXY,
    angleTo,
    normalizeAngle,
    rotateTowards,
    expandedRect,
    lineIntersectsRect
  } = IronLine.math;
  const { hasLineOfSight } = IronLine.physics;

  class HumveeAI {
    constructor(vehicle, game) {
      this.vehicle = vehicle;
      this.game = game;
      this.navigation = new IronLine.NavigationAgent(vehicle, game);
      this.state = "support";
      this.target = null;
      this.currentOrder = null;
      this.strafeSide = Math.random() < 0.5 ? -1 : 1;
      this.strafeTimer = 1.2 + Math.random() * 1.8;
      this.transportBoardingTimer = 0;
      this.transportDismountTimer = 0;
      this.transportPickupCooldown = 0;
      this.transportPickupOrderId = "";
      this.debug = {
        state: this.state,
        goal: "",
        target: null,
        moveTarget: null,
        path: [],
        pathIndex: 0,
        stuckTimer: 0,
        recoveryTimer: 0,
        supportRequest: "",
        supportRequestId: "",
        passengers: 0
      };
    }

    update(dt) {
      if (!this.vehicle.alive) return;

      this.strafeTimer -= dt;
      this.transportPickupCooldown = Math.max(0, this.transportPickupCooldown - dt);
      if (this.strafeTimer <= 0) {
        this.strafeSide *= -1;
        this.strafeTimer = 1.4 + Math.random() * 2.2;
      }

      const beforeX = this.vehicle.x;
      const beforeY = this.vehicle.y;
      const order = this.resolveOrder();
      const target = this.findTarget(order);
      const heavyThreat = this.findHeavyThreat();
      let moveTarget = null;
      this.currentOrder = order;
      const autoDismountPoint = this.autoDismountPoint(order, heavyThreat, target);

      if (target) {
        this.state = order?.role === "escort" ? "escort-fire" : "fire-support";
        this.target = target;
        this.aimAndFire(target, dt);
      } else {
        this.target = null;
        this.vehicle.machineGunAngle = rotateTowards(
          this.vehicle.machineGunAngle,
          this.vehicle.angle,
          this.vehicle.machineGunTurnRate * 0.45 * dt
        );
      }

      if ((this.vehicle.repairHoldTimer || 0) > 0) {
        this.state = target ? "repair-cover" : "repair-hold";
        moveTarget = this.vehicle;
        this.vehicle.drive(this.game, dt, 0, 0, {
          brake: true,
          dust: false,
          collisionSpeedRetain: 0.32
        });
      } else if (autoDismountPoint) {
        this.state = "transport-dismount";
        this.vehicle.dismountPassengers(this.game, {
          point: autoDismountPoint,
          cooldown: 5.6
        });
        this.transportDismountTimer = 1.1;
        moveTarget = autoDismountPoint;
        this.applyDrive(dt, 0, 0);
      } else if (heavyThreat) {
        this.state = target ? "skirmish" : "evade";
        moveTarget = heavyThreat;
        this.driveAwayFrom(dt, heavyThreat.x, heavyThreat.y, 0.88);
      } else if (order?.role === "transport") {
        moveTarget = this.handleTransportOrder(dt, order, target);
      } else if (target && distXY(this.vehicle.x, this.vehicle.y, target.x, target.y) < 270) {
        moveTarget = target;
        this.orbitTarget(dt, target);
      } else {
        if (!target) this.state = this.stateForOrder(order);
        moveTarget = this.navigation.update(dt, order);
        if (moveTarget) this.driveTo(dt, moveTarget.x, moveTarget.y, moveTarget.stopDistance ?? 86);
        else this.applyDrive(dt, 0, 0);
      }

      const tryingToMove = moveTarget && distXY(this.vehicle.x, this.vehicle.y, moveTarget.x, moveTarget.y) > 90;
      this.navigation.recordMovement(dt, beforeX, beforeY, tryingToMove);
      this.updateDebug(moveTarget, order);
    }

    resolveOrder() {
      const commander = this.game.commanders?.[this.vehicle.team];
      return commander?.getOrderFor(this.vehicle) || this.createObjectiveOrder();
    }

    stateForOrder(order) {
      if (!order) return "support";
      if (order.supportRequestType === "need-fire-support") return "request-fire";
      if (order.role === "transport" || order.stance === "squad-transport") return "transport";
      if (order.role === "escort" || order.stance === "squad-escort") return "escort";
      if (order.role === "hold") return "hold";
      return "support";
    }

    createObjectiveOrder() {
      const point = this.chooseObjective();
      if (!point) return null;
      return {
        id: `${this.vehicle.team}:humvee:${point.name}`,
        team: this.vehicle.team,
        point,
        objectiveName: point.name,
        role: "support",
        stance: "support",
        slotIndex: 0,
        slotCount: 1,
        leashRadius: point.radius + 480,
        threatRadius: point.radius + 360,
        supportPoint: {
          x: point.x,
          y: point.y,
          radius: point.radius,
          stopDistance: 108
        }
      };
    }

    chooseObjective() {
      const enemyTeam = this.vehicle.team === TEAM.BLUE ? TEAM.RED : TEAM.BLUE;
      const points = this.game.capturePoints || [];
      const activePoint = points
        .filter((point) => point.contested || point.owner !== this.vehicle.team)
        .map((point) => {
          const distance = distXY(this.vehicle.x, this.vehicle.y, point.x, point.y);
          let score = distance;
          if (point.owner === enemyTeam) score -= 360;
          if (point.owner === TEAM.NEUTRAL) score -= 160;
          if (point.contested) score -= 280;
          return { point, score };
        })
        .sort((a, b) => a.score - b.score)[0]?.point || null;

      if (activePoint) return activePoint;

      const enemyBase = (this.game.world.safeZones || []).find((zone) => zone.team === enemyTeam);
      if (enemyBase) {
        return {
          name: `${enemyTeam}-base-pressure`,
          x: enemyBase.x,
          y: enemyBase.y,
          radius: enemyBase.radius || 300,
          owner: enemyTeam
        };
      }

      return points
        .map((point) => ({
          point,
          score: -distXY(this.vehicle.x, this.vehicle.y, point.x, point.y)
        }))
        .sort((a, b) => a.score - b.score)[0]?.point || null;
    }

    findTarget(order = null) {
      const weapon = this.vehicle.machineGunWeapon();
      const muzzle = this.vehicle.machineGunMuzzlePoint();
      const candidates = [];
      const pairedSquad = order?.pairedSquadId
        ? (this.game.squads || []).find((squad) => squad.callSign === order.pairedSquadId)
        : null;
      const squadCenter = pairedSquad?.status?.center || null;
      const focusPoint = order?.point || null;

      const add = (target, priority = 0) => {
        if (!target || !target.alive || target.team === this.vehicle.team) return;
        const distance = distXY(muzzle.x, muzzle.y, target.x, target.y);
        if (distance > weapon.range) return;
        if (!hasLineOfSight(this.game, muzzle, target, { padding: 4 })) return;
        const threatBonus =
          target.classId === "engineer" || target.weaponId === "rpg" ? 210 :
          target.weaponId === "machinegun" || target.weaponId === "lmg" ? 120 :
          0;
        const squadBonus = squadCenter && distXY(target.x, target.y, squadCenter.x, squadCenter.y) < 620 ? 130 : 0;
        const objectiveBonus = focusPoint && distXY(target.x, target.y, focusPoint.x, focusPoint.y) < (focusPoint.radius || 160) + 260 ? 90 : 0;
        candidates.push({
          target,
          score: distance - threatBonus - priority - squadBonus - objectiveBonus
        });
      };

      for (const unit of this.game.infantry || []) {
        if (!unit.inVehicle) add(unit, 110);
      }
      for (const crew of this.game.crews || []) {
        if (!crew.inTank) add(crew, 60);
      }
      for (const humvee of this.game.humvees || []) add(humvee, -40);

      if (this.vehicle.team === TEAM.RED && !this.game.player.inTank && this.game.player.hp > 0 && !this.game.isPlayerInSafeZone?.()) {
        add(this.game.player, 130);
      }

      return candidates.sort((a, b) => a.score - b.score)[0]?.target || null;
    }

    handleTransportOrder(dt, order, target) {
      const squad = this.findPairedSquad(order);
      const passengerCount = this.vehicle.passengerCount?.() || 0;
      if (this.transportPickupOrderId !== order.id) {
        this.transportPickupOrderId = order.id;
        this.transportBoardingTimer = 0;
        this.transportPickupCooldown = 0;
      }

      if (passengerCount > 0) {
        const pickupPoint = this.transportPickupPoint(order, squad);
        const desiredPassengerCount = Math.min(order.passengerIds?.length || this.vehicle.passengerCapacity || 1, this.vehicle.passengerCapacity || 1);
        const waitingPassengers = squad?.activeUnits?.().filter((unit) => (
          order.passengerIds?.includes(unit.callSign) &&
          unit.alive &&
          unit.inVehicle !== this.vehicle &&
          ((unit.transportCooldown || 0) <= 0 || squad.tacticalMode === "fallback" || squad.tacticalMode === "regroup")
        )) || [];
        const nearPickup = distXY(this.vehicle.x, this.vehicle.y, pickupPoint.x, pickupPoint.y) <= (pickupPoint.stopDistance || 94) + 28;
        if (nearPickup && passengerCount < desiredPassengerCount && waitingPassengers.length > 0 && this.transportBoardingTimer < 2.4) {
          this.state = "transport-load";
          this.transportBoardingTimer += dt;
          this.applyDrive(dt, 0, 0);
          return pickupPoint;
        }

        this.transportBoardingTimer = 0;
        const deliveryPoint = this.transportDeliveryPoint(order, squad);
        const deliveryOrder = this.transportNavigationOrder(order, deliveryPoint, "deliver", 102);
        const moveTarget = this.navigation.update(dt, deliveryOrder);
        const distance = distXY(this.vehicle.x, this.vehicle.y, deliveryPoint.x, deliveryPoint.y);
        this.state = distance <= (deliveryPoint.stopDistance || 104) + 22 ? "transport-dismount" : "transport-run";

        if (this.state === "transport-dismount") {
          this.vehicle.dismountPassengers(this.game, {
            point: deliveryPoint,
            cooldown: squad && (squad.tacticalMode === "fallback" || squad.tacticalMode === "regroup") ? 1.4 : 6.2
          });
          this.transportDismountTimer = 1.1;
          this.applyDrive(dt, 0, 0);
          return deliveryPoint;
        }

        if (moveTarget) this.driveTo(dt, moveTarget.x, moveTarget.y, moveTarget.stopDistance ?? 92);
        else this.applyDrive(dt, 0, 0);
        return moveTarget;
      }

      if (this.transportPickupCooldown <= 0 && this.squadWantsPickup(squad, order)) {
        const pickupPoint = this.transportPickupPoint(order, squad);
        const pickupOrder = this.transportNavigationOrder(order, pickupPoint, "pickup", 92);
        const moveTarget = this.navigation.update(dt, pickupOrder);
        const distance = distXY(this.vehicle.x, this.vehicle.y, pickupPoint.x, pickupPoint.y);

        if (distance <= (pickupPoint.stopDistance || 92) + 18) {
          if (this.transportBoardingTimer > 3.2) {
            this.transportPickupCooldown = 5.5;
            this.transportBoardingTimer = 0;
            return this.transportOverwatch(dt, order, target);
          }
          this.state = "transport-load";
          this.transportBoardingTimer += dt;
          this.applyDrive(dt, 0, 0);
          return pickupPoint;
        }

        this.state = "transport-pickup";
        this.transportBoardingTimer = 0;
        if (moveTarget) this.driveTo(dt, moveTarget.x, moveTarget.y, moveTarget.stopDistance ?? 92);
        else this.applyDrive(dt, 0, 0);
        return moveTarget;
      }

      return this.transportOverwatch(dt, order, target);
    }

    transportOverwatch(dt, order, target) {
      const supportPoint = order.supportPoint || order.dropoffPoint || order.point;
      const supportOrder = this.transportNavigationOrder(order, supportPoint, "overwatch", supportPoint?.stopDistance || 96);
      const moveTarget = this.navigation.update(dt, supportOrder);
      this.state = this.transportDismountTimer > 0 ? "transport-overwatch" : this.stateForOrder(order);
      this.transportDismountTimer = Math.max(0, this.transportDismountTimer - dt);

      if (target && distXY(this.vehicle.x, this.vehicle.y, target.x, target.y) < 310 && this.transportDismountTimer <= 0) {
        this.orbitTarget(dt, target);
        return target;
      }

      if (moveTarget) this.driveTo(dt, moveTarget.x, moveTarget.y, moveTarget.stopDistance ?? 96);
      else this.applyDrive(dt, 0, 0);
      return moveTarget;
    }

    findPairedSquad(order) {
      if (!order?.pairedSquadId) return null;
      return (this.game.squads || []).find((squad) => squad.callSign === order.pairedSquadId) || null;
    }

    squadWantsPickup(squad, order) {
      if (!squad || !order?.passengerIds?.length) return false;
      const mode = squad.tacticalMode;
      const evac = mode === "fallback" || mode === "regroup";
      const longMove = (squad.status?.objectiveDistance || 0) > 860 && (squad.status?.avgSuppression || 0) < 44;
      if (!evac && !longMove) return false;

      return squad.activeUnits().some((unit) => (
        order.passengerIds.includes(unit.callSign) &&
        unit.alive &&
        unit.inVehicle !== this.vehicle &&
        (evac || (unit.transportCooldown || 0) <= 0)
      ));
    }

    transportPickupPoint(order, squad) {
      const center = squad?.status?.center || squad?.leaderUnit?.() || order.pickupPoint || order.point;
      return {
        name: order.pickupPoint?.name || `${order.pairedSquadId || "squad"}-pickup`,
        x: center.x,
        y: center.y,
        radius: 92,
        stopDistance: 94
      };
    }

    transportDeliveryPoint(order, squad) {
      if (squad && (squad.tacticalMode === "fallback" || squad.tacticalMode === "regroup")) {
        const point = squad.tacticalPoint || squad.status?.center || order.pickupPoint || order.dropoffPoint || order.point;
        return {
          name: `${order.pairedSquadId || "squad"}-${squad.tacticalMode}`,
          x: point.x,
          y: point.y,
          radius: point.radius || 96,
          stopDistance: 104
        };
      }

      return order.dropoffPoint || order.supportPoint || order.point;
    }

    transportNavigationOrder(order, point, phase, stopDistance) {
      return {
        ...order,
        id: `${order.id}:${phase}`,
        point,
        supportPoint: {
          ...point,
          stopDistance
        }
      };
    }

    autoDismountPoint(order, heavyThreat, target) {
      if ((this.vehicle.passengerCount?.() || 0) <= 0) return null;
      if (!order || order.role === "transport") return null;
      if (heavyThreat && distXY(this.vehicle.x, this.vehicle.y, heavyThreat.x, heavyThreat.y) < 520) return null;
      if (target && distXY(this.vehicle.x, this.vehicle.y, target.x, target.y) < 230) return null;

      const point = order.dropoffPoint || order.supportPoint || order.point;
      if (!point) return null;
      const stopDistance = point.stopDistance || Math.min(130, (point.radius || 120) * 0.78);
      const distance = distXY(this.vehicle.x, this.vehicle.y, point.x, point.y);
      if (distance > stopDistance + 34) return null;

      return {
        ...point,
        stopDistance
      };
    }

    findHeavyThreat() {
      return (this.game.tanks || [])
        .filter((tank) => tank.alive && tank.team !== this.vehicle.team)
        .map((tank) => ({ tank, distance: distXY(this.vehicle.x, this.vehicle.y, tank.x, tank.y) }))
        .filter((item) => item.distance < 500)
        .sort((a, b) => a.distance - b.distance)[0]?.tank || null;
    }

    aimAndFire(target, dt) {
      const targetAngle = angleTo(this.vehicle.x, this.vehicle.y, target.x, target.y);
      this.vehicle.machineGunAngle = rotateTowards(
        this.vehicle.machineGunAngle,
        targetAngle,
        this.vehicle.machineGunTurnRate * dt
      );

      const aimError = Math.abs(normalizeAngle(this.vehicle.machineGunAngle - targetAngle));
      if (aimError < 0.18) this.vehicle.fireMachineGun(this.game, target.x, target.y, { target });
    }

    driveTo(dt, x, y, stopDistance = 0, options = {}) {
      const dx = x - this.vehicle.x;
      const dy = y - this.vehicle.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= stopDistance) {
        this.applyDrive(dt, 0, 0);
        return;
      }
      const intensity = clamp((distance - stopDistance) / 260, 0.34, 1);
      this.driveVector(dt, dx / Math.max(distance, 1), dy / Math.max(distance, 1), intensity, {
        allowReverse: options.allowReverse ?? false
      });
    }

    driveAwayFrom(dt, x, y, intensity = 0.8) {
      const dx = this.vehicle.x - x;
      const dy = this.vehicle.y - y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      this.driveVector(dt, dx / distance, dy / distance, intensity, { allowReverse: false });
    }

    orbitTarget(dt, target) {
      const awayAngle = angleTo(target.x, target.y, this.vehicle.x, this.vehicle.y);
      const sideAngle = awayAngle + Math.PI / 2 * this.strafeSide;
      const distance = distXY(this.vehicle.x, this.vehicle.y, target.x, target.y);
      const awayBias = distance < 210 ? 0.55 : 0.18;
      const vx = Math.cos(sideAngle) + Math.cos(awayAngle) * awayBias;
      const vy = Math.sin(sideAngle) + Math.sin(awayAngle) * awayBias;
      const length = Math.max(1, Math.hypot(vx, vy));
      this.driveVector(dt, vx / length, vy / length, 0.58);
    }

    driveVector(dt, vx, vy, intensity, options = {}) {
      const recovery = this.navigation.getRecoveryDrive();
      if (recovery) {
        const throttle = options.allowReverse === false
          ? Math.max(0.14, Math.abs(recovery.throttle) * 0.35)
          : recovery.throttle;
        this.applyDrive(dt, throttle, recovery.turn);
        return;
      }

      const steer = this.avoidanceVector(vx, vy);
      const desiredAngle = Math.atan2(steer.y, steer.x);
      const forwardDiff = normalizeAngle(desiredAngle - this.vehicle.angle);
      const reverseDiff = normalizeAngle(desiredAngle - normalizeAngle(this.vehicle.angle + Math.PI));

      if (options.allowReverse !== false && Math.abs(forwardDiff) > 2.25 && Math.abs(reverseDiff) < Math.abs(forwardDiff) - 0.35) {
        this.applyDrive(dt, -intensity * 0.42, clamp(reverseDiff * 1.2, -1, 1));
        return;
      }

      const aligned = clamp((Math.cos(forwardDiff) + 0.25) / 1.25, 0, 1);
      this.applyDrive(dt, intensity * aligned, clamp(forwardDiff * 1.34, -1, 1));
    }

    avoidanceVector(vx, vy) {
      let ax = vx;
      let ay = vy;

      for (const obstacle of this.game.world.obstacles) {
        const expanded = expandedRect(obstacle, 62);
        const lookX = this.vehicle.x + vx * 96;
        const lookY = this.vehicle.y + vy * 96;
        if (!lineIntersectsRect(this.vehicle.x, this.vehicle.y, lookX, lookY, expanded)) continue;

        const nearestX = clamp(this.vehicle.x, obstacle.x, obstacle.x + obstacle.w);
        const nearestY = clamp(this.vehicle.y, obstacle.y, obstacle.y + obstacle.h);
        const awayX = this.vehicle.x - nearestX;
        const awayY = this.vehicle.y - nearestY;
        const distance = Math.max(1, Math.hypot(awayX, awayY));
        ax += awayX / distance * 0.82;
        ay += awayY / distance * 0.82;
      }

      for (const other of [...(this.game.tanks || []), ...(this.game.humvees || [])]) {
        if (other === this.vehicle || !other.alive) continue;
        const distance = distXY(this.vehicle.x, this.vehicle.y, other.x, other.y);
        const avoidRange = (this.vehicle.radius || 30) + (other.radius || 32) + 26;
        if (distance > avoidRange || distance < 1) continue;
        ax += ((this.vehicle.x - other.x) / distance) * (avoidRange - distance) / Math.max(avoidRange * 0.54, 1);
        ay += ((this.vehicle.y - other.y) / distance) * (avoidRange - distance) / Math.max(avoidRange * 0.54, 1);
      }

      const length = Math.max(0.001, Math.hypot(ax, ay));
      return { x: ax / length, y: ay / length };
    }

    applyDrive(dt, throttle, turn) {
      this.vehicle.drive(this.game, dt, throttle, turn, {
        turnScale: 1.08,
        collisionSpeedRetain: 0.36
      });
    }

    updateDebug(moveTarget, order) {
      const navDebug = this.navigation.debugState();
      this.debug.state = this.state;
      this.debug.goal = order?.objectiveName || "";
      this.debug.target = this.target;
      this.debug.moveTarget = moveTarget || navDebug.moveTarget;
      this.debug.path = navDebug.path;
      this.debug.pathIndex = navDebug.pathIndex;
      this.debug.stuckTimer = navDebug.stuckTimer;
      this.debug.recoveryTimer = navDebug.recoveryTimer;
      this.debug.supportRequest = order?.supportRequestType || "";
      this.debug.supportRequestId = order?.supportRequestId || "";
      this.debug.passengers = this.vehicle.passengerCount?.() || 0;
    }
  }

  IronLine.HumveeAI = HumveeAI;
})(window);
