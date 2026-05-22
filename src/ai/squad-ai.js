"use strict";

(function registerSquadAI(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { clamp, distXY, angleTo, normalizeAngle, circleRectCollision, lineIntersectsRect, expandedRect } = IronLine.math;

  class SquadAI {
    constructor(game, options) {
      this.game = game;
      this.team = options.team;
      this.callSign = options.callSign;
      this.squadType = options.squadType || "infantry";
      this.units = [];
      this.order = null;
      this.roleMap = new Map();
      this.summary = "";
      this.tacticalMode = "advance";
      this.tacticalTimer = 0;
      this.tacticalPoint = null;
      this.supportRequest = null;
      this.transport = null;
      this.preAssaultTimer = 0;
      this.preAssaultCompletedFor = "";
      this.rallyWithTankCooldown = 0;
      this.status = this.emptyStatus();
      this.commandSlotOverrideId = options.commandSlotOverrideId || "";
      this.commandTransferReason = "";
      this.currentLeaderCallSign = "";
      this.reportedLeaderLosses = new Set();
      this.commandState = "idle";
      this.commandSource = "bot";
      this.commandReason = "";
      this.commandIntentKey = "";
      this.commandLockUntil = 0;
      this.commandLockStartedAt = 0;
      this.lastCommandChangedAt = 0;
      this.commanderSlotId = "";
      this.squadLeaderId = "";

      for (const unit of options.units || []) this.addUnit(unit);
      this.rebuildRoles();
      this.currentLeaderCallSign = this.leaderUnit()?.callSign || "";
      this.squadLeaderId = this.currentLeaderCallSign;
    }

    addUnit(unit) {
      if (!unit || this.units.includes(unit)) return;
      this.units.push(unit);
      unit.squad = this;
      unit.squadId = this.callSign;
      unit.isSquadLeader = false;
    }

    activeUnits() {
      return this.units
        .filter((unit) => unit.alive && unit.ai && (this.squadType === "recon" || unit.classId !== "scout"))
        .sort((a, b) => a.callSign.localeCompare(b.callSign));
    }

    update(dt = 0.45) {
      const previousLeader = this.currentLeaderCallSign;
      this.rebuildRoles();
      this.trackLeaderLoss(previousLeader);
      this.updateTactics(false, dt);
      const alive = this.activeUnits().length;
      const request = this.supportRequest ? ` ${this.supportRequest.type}` : "";
      const command = this.commandState && this.commandState !== "idle" ? ` ${this.commandState}` : "";
      this.summary = `${this.callSign}:${this.order?.objectiveName || "-"} ${this.tacticalMode}${command} ${alive}/${this.units.length}${request}`;
    }

    trackLeaderLoss(previousLeader) {
      const leader = this.leaderUnit();
      const currentLeader = leader?.callSign || "";
      if (!previousLeader) {
        this.currentLeaderCallSign = currentLeader;
        return;
      }
      const lost = this.units.find((unit) => unit.callSign === previousLeader);
      const leaderChanged = currentLeader && currentLeader !== previousLeader;
      const leaderDead = lost && lost.alive === false;
      if (leaderChanged && leaderDead && !this.reportedLeaderLosses.has(previousLeader)) {
        this.reportedLeaderLosses.add(previousLeader);
        this.game?.handleSquadLeaderLoss?.(this, lost, leader);
      }
      this.currentLeaderCallSign = currentLeader;
    }

    assignOrder(order) {
      const previousObjective = this.order?.objectiveName || this.order?.point?.name || "";
      const nextObjective = order?.objectiveName || order?.point?.name || "";
      if (previousObjective !== nextObjective) {
        this.preAssaultTimer = 0;
        this.preAssaultCompletedFor = "";
        this.rallyWithTankCooldown = 0;
      }
      this.order = order;
      this.applyCommandIntent(order);
      this.rebuildRoles();
      this.updateTactics(true);
    }

    applyCommandIntent(order) {
      const now = performance.now();
      const leader = this.leaderUnit();
      this.squadLeaderId = leader?.callSign || "";
      this.commanderSlotId = order?.commanderSlotId || order?.slotId || this.ownerSlotId || "";
      if (!order?.point) {
        this.commandState = "idle";
        this.commandSource = "bot";
        this.commandReason = "";
        this.commandIntentKey = "";
        this.commandLockUntil = 0;
        return;
      }

      const state = this.commandStateForOrder(order);
      const source = order.commandSource || (order.playerIssued ? "player" : "bot");
      const reason = order.commandReason || order.commandType || order.role || "objective";
      const key = this.commandIntentKeyFor(order, state);
      if (key !== this.commandIntentKey || source !== this.commandSource) {
        const lockSeconds = Number.isFinite(order.commandLockSeconds)
          ? order.commandLockSeconds
          : this.commandLockSecondsForOrder(order, source, state);
        this.commandIntentKey = key;
        this.commandState = state;
        this.commandSource = source;
        this.commandReason = reason;
        this.commandLockStartedAt = now;
        this.commandLockUntil = now + Math.max(0.8, Math.min(3.2, lockSeconds)) * 1000;
        this.lastCommandChangedAt = now;
      }

      order.commandState = this.commandState;
      order.commandSource = this.commandSource;
      order.commandReason = this.commandReason;
      order.commandLockUntil = this.commandLockUntil;
      order.lastCommandChangedAt = this.lastCommandChangedAt;
      order.squadLeaderId = this.squadLeaderId;
      order.commanderSlotId = this.commanderSlotId;
    }

    commandIntentKeyFor(order, state) {
      return [
        order.id || "",
        state || "",
        order.commandType || order.role || "",
        order.objectiveName || order.point?.name || "",
        Math.round(order.point?.x || 0),
        Math.round(order.point?.y || 0)
      ].join(":");
    }

    commandStateForOrder(order) {
      if (order.commandState) return order.commandState;
      if (order.commandType === "repair" || order.role === "repair") return "repair";
      if (order.commandType === "scan" || order.role === "recon") return "scout";
      if (order.commandType === "fire_support" || order.role === "support") return "cover";
      if (order.commandType === "assault" || order.commandType === "attack" || order.stance === "assault") return "assault";
      if (order.commandType === "defend" || order.commandType === "rally" || order.role === "hold" || order.stance === "hold") return "hold";
      if (order.commandType === "retreat" || order.stance === "fallback") return "fallback";
      if (order.pairedTankId || order.pairedSquadId) return "escort";
      return "advance";
    }

    commandLockSecondsForOrder(order, source, state = "") {
      const base = source === "player" ? 2.1 : 1.35;
      const stateBonus = state === "assault" ? 0.45 : state === "repair" || state === "scout" ? 0.25 : 0;
      const jitter = (this.callSign.length % 5) * 0.12;
      return base + stateBonus + jitter;
    }

    commandLockActive(now = performance.now()) {
      return this.commandLockUntil > now;
    }

    commandLockRemaining(now = performance.now()) {
      return Math.max(0, (this.commandLockUntil - now) / 1000);
    }

    getOrderFor(unit) {
      if (!this.order?.point || !unit?.alive) return null;

      const active = this.activeUnits();
      const role = this.roleMap.get(unit) || "assault";
      unit.squadRole = role;
      const roleUnits = active.filter((item) => (this.roleMap.get(item) || "assault") === role);
      const roleSlotIndex = Math.max(0, roleUnits.indexOf(unit));
      const roleSlotCount = Math.max(1, roleUnits.length);
      const tacticalPoint = this.tacticalOrderPoint();
      const approachAngle = this.approachAngle(tacticalPoint || this.order.point);
      const objectiveApproachAngle = this.approachAngle(this.order.point);

      return {
        ...this.order,
        id: `${this.order.id}:${this.callSign}:${unit.callSign}:${role}:${this.tacticalMode}:${tacticalPoint?.name || "objective"}`,
        point: tacticalPoint || this.order.point,
        objectivePoint: this.order.point,
        squadId: this.callSign,
        squadRole: role,
        tacticalMode: this.tacticalMode,
        tacticalTimerRemaining: this.tacticalMode === "pre-assault" ? this.preAssaultTimer : 0,
        supportRequest: this.supportRequest,
        transport: this.transportForUnit(unit),
        squadStatus: this.status,
        commandState: this.commandState,
        commandSource: this.commandSource,
        commandReason: this.commandReason,
        commandLockUntil: this.commandLockUntil,
        commandLockRemaining: this.commandLockRemaining(),
        lastCommandChangedAt: this.lastCommandChangedAt,
        squadLeaderId: this.squadLeaderId,
        commanderSlotId: this.commanderSlotId || this.ownerSlotId || "",
        squadSlotIndex: this.order.slotIndex || 0,
        squadSlotCount: Math.max(1, this.order.slotCount || 1),
        squadUnitCount: active.length,
        roleSlotIndex,
        roleSlotCount,
        formation: this.formationForRole(role, approachAngle, this.tacticalMode),
        objectiveFormation: this.formationForRole(role, objectiveApproachAngle, "advance")
      };
    }

    rebuildRoles() {
      const units = this.activeUnits();
      const lmg = units.find((unit) => unit.weaponId === "lmg" || unit.weaponId === "machinegun");
      this.roleMap.clear();
      for (const unit of this.units) unit.isSquadLeader = false;

      if (lmg) this.roleMap.set(lmg, "support");

      const remaining = units.filter((unit) => unit !== lmg);
      remaining.forEach((unit, index) => {
        const role = unit.classId === "scout"
          ? "scout"
          : unit.classId === "engineer" && this.squadType === "engineer"
            ? "support"
            : unit.weaponId === "smg" || index === 0 ? "assault" : "security";
        this.roleMap.set(unit, role);
      });

      const leader = this.leaderUnit();
      if (leader) leader.isSquadLeader = true;
    }

    approachAngle(point) {
      const active = this.activeUnits();
      if (active.length === 0 || !point) return 0;
      const center = active.reduce((sum, unit) => ({
        x: sum.x + unit.x,
        y: sum.y + unit.y
      }), { x: 0, y: 0 });
      center.x /= active.length;
      center.y /= active.length;
      return angleTo(point.x, point.y, center.x, center.y);
    }

    formationForRole(role, approachAngle, mode = this.tacticalMode) {
      if (mode === "fallback") {
        return {
          angle: approachAngle,
          distance: role === "support" ? 62 : role === "security" ? 38 : 18,
          spacing: 38,
          sideBias: role === "security" ? 0.45 : 0,
          stopDistance: 18,
          allowOutside: true
        };
      }

      if (mode === "regroup" || mode === "rally-with-tank") {
        return {
          angle: approachAngle,
          distance: role === "support" ? 64 : role === "security" ? 42 : 24,
          spacing: 34,
          sideBias: role === "security" ? 0.4 : 0,
          stopDistance: 18,
          allowOutside: true
        };
      }

      if (mode === "support-fire") {
        if (role === "support") {
          return {
            angle: approachAngle,
            distance: 235,
            spacing: 50,
            stopDistance: 14,
            allowOutside: true
          };
        }
        if (role === "security") {
          return {
            angle: approachAngle,
            distance: 154,
            spacing: 56,
            sideBias: 1,
            stopDistance: 18,
            allowOutside: true
          };
        }
        return {
          angle: approachAngle,
          distance: 96,
          spacing: 42,
          stopDistance: 18,
          allowOutside: true
        };
      }

      if (mode === "pre-assault") {
        if (role === "support") {
          return {
            angle: approachAngle,
            distance: 132,
            spacing: 54,
            stopDistance: 14,
            allowOutside: true
          };
        }
        if (role === "security") {
          return {
            angle: approachAngle,
            distance: 86,
            spacing: 60,
            sideBias: 1,
            stopDistance: 16,
            allowOutside: true
          };
        }
        return {
          angle: approachAngle,
          distance: 34,
          spacing: 38,
          stopDistance: 18,
          allowOutside: true
        };
      }

      if (mode === "hold-wall") {
        if (role === "support") {
          return {
            angle: approachAngle,
            distance: 96,
            spacing: 68,
            stopDistance: 24,
            allowOutside: true
          };
        }
        if (role === "security") {
          return {
            angle: approachAngle,
            distance: 68,
            spacing: 76,
            sideBias: 1,
            stopDistance: 26,
            allowOutside: true
          };
        }
        return {
          angle: approachAngle,
          distance: 44,
          spacing: 52,
          stopDistance: 26,
          allowOutside: true
        };
      }

      if (mode === "hold") {
        if (role === "support") {
          return {
            angle: approachAngle,
            distance: 124,
            spacing: 70,
            stopDistance: 26,
            allowOutside: true
          };
        }
        if (role === "security") {
          return {
            angle: approachAngle,
            distance: 86,
            spacing: 76,
            sideBias: 1,
            stopDistance: 28,
            allowOutside: true
          };
        }
        return {
          angle: approachAngle,
          distance: 52,
          spacing: 56,
          stopDistance: 28,
          allowOutside: true
        };
      }

      if (role === "scout") {
        return {
          angle: approachAngle,
          distance: 225,
          spacing: 58,
          sideBias: -1,
          stopDistance: 18,
          allowOutside: true
        };
      }

      if (role === "support") {
        return {
          angle: approachAngle,
          distance: 168,
          spacing: 62,
          stopDistance: 24,
          allowOutside: true
        };
      }

      if (role === "security") {
        return {
          angle: approachAngle,
          distance: 92,
          spacing: 68,
          sideBias: 1,
          stopDistance: 28,
          allowOutside: true
        };
      }

      return {
        angle: approachAngle,
        distance: 64,
        spacing: 56,
        stopDistance: 30,
        allowOutside: true
      };
    }

    emptyStatus() {
      return {
        alive: 0,
        total: 0,
        casualtyRatio: 0,
        avgSuppression: 0,
        maxSuppression: 0,
        cohesion: 0,
        center: null,
        objectiveDistance: Infinity,
        mountedCount: 0,
        friendlyTank: null,
        armorThreat: null,
        lastThreat: null
      };
    }

    updateTactics(force = false, dt = 0.45) {
      this.tacticalTimer = Math.max(0, this.tacticalTimer - dt);
      this.rallyWithTankCooldown = Math.max(0, this.rallyWithTankCooldown - dt);
      const wasPreAssault = this.tacticalMode === "pre-assault";
      if (wasPreAssault) {
        this.preAssaultTimer = Math.max(0, this.preAssaultTimer - dt);
      }
      if (wasPreAssault && this.preAssaultTimer <= 0) {
        const objectiveKey = this.order?.objectiveName || this.order?.point?.name || "";
        if (objectiveKey) this.preAssaultCompletedFor = objectiveKey;
      }
      if (this.tacticalMode === "rally-with-tank" && this.tacticalTimer <= 0) {
        this.rallyWithTankCooldown = Math.max(this.rallyWithTankCooldown, 5.4);
      }
      this.status = this.computeStatus();
      this.supportRequest = this.computeSupportRequest(this.status);

      const desired = this.chooseTacticalMode(this.status);
      const urgent = desired === "fallback" || this.tacticalMode === "fallback";
      const commandLocked = this.commandLockActive() && !force && !urgent;
      if (!commandLocked && (force || urgent || this.tacticalTimer <= 0)) {
        if (desired !== this.tacticalMode) {
          this.tacticalMode = desired;
          this.tacticalTimer = desired === "fallback"
            ? 1.1
            : desired === "regroup"
              ? 1.4
              : desired === "rally-with-tank"
                ? 1.05
                : desired === "pre-assault" || desired === "hold-wall"
                  ? 0.8
                  : 1.8;
        }
      }

      this.tacticalPoint = this.computeTacticalPoint(this.status);
    }

    computeStatus() {
      const active = this.activeUnits();
      const total = this.units.filter((unit) => unit.classId !== "scout").length || active.length;
      if (active.length === 0) {
        return { ...this.emptyStatus(), total };
      }

      const center = active.reduce((sum, unit) => ({
        x: sum.x + unit.x,
        y: sum.y + unit.y
      }), { x: 0, y: 0 });
      center.x /= active.length;
      center.y /= active.length;

      let suppression = 0;
      let maxSuppression = 0;
      let mountedCount = 0;
      let lastThreat = null;
      let lastThreatScore = 0;
      for (const unit of active) {
        if (unit.inVehicle) mountedCount += 1;
        suppression += unit.suppression || 0;
        maxSuppression = Math.max(maxSuppression, unit.suppression || 0);
        if (unit.lastThreat) {
          const score = unit.suppressionTimer || unit.suppression || 1;
          if (score > lastThreatScore) {
            lastThreat = unit.lastThreat;
            lastThreatScore = score;
          }
        }
      }

      let cohesion = active.reduce((sum, unit) => sum + distXY(unit.x, unit.y, center.x, center.y), 0) / active.length;
      if (mountedCount > 0) cohesion = Math.min(cohesion, 150);
      const point = this.order?.point;
      const objectiveDistance = point ? distXY(center.x, center.y, point.x, point.y) : Infinity;

      return {
        alive: active.length,
        total,
        casualtyRatio: total > 0 ? clamp(1 - active.length / total, 0, 1) : 0,
        avgSuppression: suppression / active.length,
        maxSuppression,
        cohesion,
        center,
        objectiveDistance,
        mountedCount,
        friendlyTank: this.nearestFriendlyTank(center),
        armorThreat: this.nearestArmorThreat(center),
        lastThreat
      };
    }

    nearestFriendlyTank(center) {
      if (!center) return null;
      const vehicles = (this.game.tanks || [])
        .filter((tank) => (
          tank.alive &&
          tank.team === this.team &&
          (tank.isOperational?.() ?? true)
        ))
        .map((tank) => ({
          vehicle: tank,
          distance: distXY(center.x, center.y, tank.x, tank.y)
        }))
        .sort((a, b) => a.distance - b.distance);
      return vehicles[0] || null;
    }

    nearestArmorThreat(center) {
      if (!center) return null;
      const vehicles = [...(this.game.tanks || []), ...(this.game.humvees || [])]
        .filter((vehicle) => vehicle.alive && vehicle.team !== this.team)
        .map((vehicle) => ({
          vehicle,
          distance: distXY(center.x, center.y, vehicle.x, vehicle.y)
        }))
        .sort((a, b) => a.distance - b.distance);
      return vehicles[0] || null;
    }

    computeSupportRequest(status) {
      if (!status?.center || !this.order?.point) return null;
      if (status.armorThreat && status.armorThreat.distance < 620 && !this.squadHasRpg()) {
        return { type: "need-armor-support", target: status.armorThreat.vehicle, urgency: 0.86 };
      }
      if (status.avgSuppression > 46 && status.friendlyTank?.distance > 520) {
        return { type: "need-fire-support", target: status.lastThreat || this.order.point, urgency: clamp(status.avgSuppression / 100, 0.35, 1) };
      }
      if (status.cohesion > 280) {
        return { type: "need-regroup", target: status.center, urgency: clamp(status.cohesion / 480, 0.25, 1) };
      }
      return null;
    }

    assignTransport(transport) {
      this.transport = transport || null;
    }

    transportForUnit(unit) {
      const transport = this.transport;
      const vehicle = transport?.vehicle;
      if (!transport || !vehicle?.alive || !unit?.alive) return null;
      if (!(transport.passengerIds || []).includes(unit.callSign)) return null;

      const center = this.status?.center || this.leaderUnit() || this.order?.point;
      const vehicleDistance = center ? distXY(center.x, center.y, vehicle.x, vehicle.y) : Infinity;
      const remount = (this.tacticalMode === "fallback" || this.tacticalMode === "regroup") && vehicleDistance < 760;
      const longMove = this.status?.objectiveDistance > 860 && (this.status?.avgSuppression || 0) < 38;
      const hasSeat = vehicle.availablePassengerSeats?.() > 0 || unit.inVehicle === vehicle;
      const boardDistance = distXY(unit.x, unit.y, vehicle.x, vehicle.y);
      const pickupPoint = transport.pickupPoint || center;
      const vehicleNearPickup = pickupPoint
        ? distXY(vehicle.x, vehicle.y, pickupPoint.x, pickupPoint.y) <= (pickupPoint.stopDistance || 94) + 130
        : boardDistance <= 320;

      if (unit.inVehicle === vehicle) {
        return {
          ...transport,
          mode: "ride",
          vehicle
        };
      }

      if (!hasSeat) return null;
      if (remount && boardDistance <= 460) {
        return {
          ...transport,
          mode: "remount",
          vehicle
        };
      }

      if (longMove && vehicleNearPickup && boardDistance <= 340 && (unit.transportCooldown || 0) <= 0) {
        return {
          ...transport,
          mode: "mount",
          vehicle
        };
      }

      return null;
    }

    chooseTacticalMode(status) {
      if (!this.order?.point || status.alive === 0) return "idle";
      if (this.order.role === "hold") {
        const defensivePressure = status.avgSuppression > 18 || status.lastThreat || status.armorThreat?.distance < 820;
        return defensivePressure ? "hold-wall" : "hold";
      }
      if (status.casualtyRatio >= 0.48 || status.avgSuppression >= 68 || status.maxSuppression >= 92) return "fallback";
      if (status.cohesion > this.regroupCohesionThreshold(status) && status.alive > 1) return "regroup";
      if (
        this.order.forcedTacticalMode &&
        (!this.order.forcedTacticalUntil || performance.now() < this.order.forcedTacticalUntil)
      ) {
        return this.order.forcedTacticalMode;
      }
      if (status.avgSuppression > 34 || status.armorThreat?.distance < 680 || this.supportRequest?.type === "need-fire-support") {
        return "support-fire";
      }
      if (this.shouldPreAssault(status)) return "pre-assault";
      if (this.shouldRallyWithTank(status)) return "rally-with-tank";
      return "advance";
    }

    regroupCohesionThreshold(status) {
      const baseThreshold = 305;
      if (!status?.center) return baseThreshold;
      const safeZone = (this.game.world.safeZones || []).find((zone) => zone.team === this.team);
      if (!safeZone) return baseThreshold;
      const distanceFromBase = distXY(status.center.x, status.center.y, safeZone.x, safeZone.y);
      if (distanceFromBase <= (safeZone.radius || 0) + 180) return 560;
      if (distanceFromBase <= (safeZone.radius || 0) + 420) return 430;
      return baseThreshold;
    }

    shouldRallyWithTank(status) {
      if (!this.order?.point || this.order.role === "hold") return false;
      if (this.rallyWithTankCooldown > 0) return false;
      if (!status?.center || !status.friendlyTank?.vehicle) return false;
      if (status.alive < 2 || status.mountedCount > 0) return false;
      if (status.avgSuppression > 30 || status.maxSuppression > 58 || status.lastThreat) return false;
      if (status.armorThreat?.distance < 760) return false;

      const point = this.order.point;
      const pointRadius = point.radius || 150;
      if (status.objectiveDistance < pointRadius + 650 || status.objectiveDistance > 1500) return false;
      if (status.friendlyTank.distance < 90 || status.friendlyTank.distance > 360) return false;

      const tank = status.friendlyTank.vehicle;
      const objectiveDx = point.x - status.center.x;
      const objectiveDy = point.y - status.center.y;
      const objectiveLength = Math.max(1, Math.hypot(objectiveDx, objectiveDy));
      const tankDx = tank.x - status.center.x;
      const tankDy = tank.y - status.center.y;
      const forward = (tankDx * objectiveDx + tankDy * objectiveDy) / objectiveLength;
      const lateral = Math.abs((tankDx * -objectiveDy + tankDy * objectiveDx) / objectiveLength);
      const tankObjectiveDistance = distXY(tank.x, tank.y, point.x, point.y);

      return forward > 80 &&
        forward < 430 &&
        lateral < 285 &&
        tankObjectiveDistance < status.objectiveDistance - 45;
    }

    computeTacticalPoint(status) {
      if (!status?.center || !this.order?.point) return null;
      if (this.tacticalMode === "fallback") return this.fallbackPoint(status);
      if (this.tacticalMode === "regroup") return this.regroupPoint(status);
      if (this.tacticalMode === "rally-with-tank") return this.rallyWithTankPoint(status);
      if (this.tacticalMode === "pre-assault") return this.preAssaultPoint(status);
      if (this.tacticalMode === "hold-wall") return this.holdWallPoint(status);
      return null;
    }

    tacticalOrderPoint() {
      return this.tacticalPoint || null;
    }

    fallbackPoint(status) {
      const source = status.lastThreat || status.armorThreat?.vehicle || this.order.point;
      const coverPoint = this.findFallbackCoverPoint(status, source);
      if (coverPoint) return coverPoint;

      const angle = source
        ? angleTo(source.x, source.y, status.center.x, status.center.y)
        : this.approachAngle(this.order.point);
      return this.safeTacticalPoint(
        status.center.x + Math.cos(angle) * 150,
        status.center.y + Math.sin(angle) * 150,
        `${this.order.objectiveName}-fallback`,
        82,
        92
      );
    }

    findFallbackCoverPoint(status, threat) {
      if (!status?.center || !threat || !this.order?.point) return null;
      let best = null;
      let bestScore = Infinity;

      for (const obstacle of this.coverBlockers()) {
        const center = {
          x: obstacle.x + obstacle.w / 2,
          y: obstacle.y + obstacle.h / 2
        };
        if (distXY(center.x, center.y, status.center.x, status.center.y) > 430) continue;
        if (distXY(center.x, center.y, this.order.point.x, this.order.point.y) > (this.order.point.radius || 150) + 520) continue;

        for (const sample of this.holdWallSamples(obstacle, threat)) {
          if (!this.pointPassable(sample.x, sample.y, 22)) continue;
          if (distXY(sample.x, sample.y, status.center.x, status.center.y) > 360) continue;
          const covered = lineIntersectsRect(threat.x, threat.y, sample.x, sample.y, expandedRect(obstacle, 8));
          if (!covered) continue;

          const squadDistance = distXY(sample.x, sample.y, status.center.x, status.center.y);
          const objectiveDistance = distXY(sample.x, sample.y, this.order.point.x, this.order.point.y);
          const threatDistance = distXY(sample.x, sample.y, threat.x, threat.y);
          const score = squadDistance + objectiveDistance * 0.22 - threatDistance * 0.06;
          if (score < bestScore) {
            best = sample;
            bestScore = score;
          }
        }
      }

      return best ? {
        name: `${this.order.objectiveName}-fallback-cover`,
        x: best.x,
        y: best.y,
        radius: 78
      } : null;
    }

    regroupPoint(status) {
      const leader = this.leaderUnit();
      const center = status.center;
      const point = leader && center && distXY(leader.x, leader.y, center.x, center.y) <= 220
        ? { x: (leader.x + center.x) / 2, y: (leader.y + center.y) / 2 }
        : center || leader;
      return this.safeTacticalPoint(point.x, point.y, `${this.order.objectiveName}-regroup`, 76, 72);
    }

    rallyWithTankPoint(status) {
      const tank = status.friendlyTank?.vehicle;
      if (!tank) return null;
      const point = this.order?.point || status.center;
      const angle = angleTo(point.x, point.y, tank.x, tank.y);
      const side = String(this.callSign || "").length % 2 === 0 ? -1 : 1;
      return this.safeTacticalPoint(
        tank.x + Math.cos(angle) * (tank.radius + 72) + Math.cos(angle + Math.PI / 2) * side * 54,
        tank.y + Math.sin(angle) * (tank.radius + 72) + Math.sin(angle + Math.PI / 2) * side * 54,
        `${this.order.objectiveName}-rally`,
        96
      );
    }

    shouldPreAssault(status) {
      if (!this.order?.point || this.order.role === "hold") return false;
      if (status.mountedCount > 0 || status.alive < 2) return false;
      if (status.avgSuppression > 32 || status.maxSuppression > 58) return false;
      if (status.armorThreat?.distance < 720) return false;

      const objectiveKey = this.order.objectiveName || this.order.point.name || "";
      if (this.preAssaultCompletedFor === objectiveKey) return false;

      const pointRadius = this.order.point.radius || 150;
      const nearOuterRing = status.objectiveDistance > pointRadius + 120 && status.objectiveDistance < pointRadius + 620;
      if (!nearOuterRing) return false;

      if (this.preAssaultTimer <= 0) this.preAssaultTimer = 3.2 + (this.callSign.length % 3) * 0.35;
      return this.preAssaultTimer > 0;
    }

    preAssaultPoint(status) {
      const point = this.order.point;
      const angle = angleTo(point.x, point.y, status.center.x, status.center.y);
      return this.safeTacticalPoint(
        point.x + Math.cos(angle) * ((point.radius || 150) + 130),
        point.y + Math.sin(angle) * ((point.radius || 150) + 130),
        `${this.order.objectiveName}-pre-assault`,
        90
      );
    }

    holdWallPoint(status) {
      const point = this.order.point;
      const threat = status.lastThreat || status.armorThreat?.vehicle || null;
      const coverPoint = this.findHoldWallCoverPoint(point, threat, status);
      if (coverPoint) return coverPoint;

      const angle = threat ? angleTo(threat.x, threat.y, point.x, point.y) : this.approachAngle(point);
      return this.safeTacticalPoint(
        point.x + Math.cos(angle) * Math.min(120, (point.radius || 150) * 0.62),
        point.y + Math.sin(angle) * Math.min(120, (point.radius || 150) * 0.62),
        `${this.order.objectiveName}-hold-wall`,
        82
      );
    }

    findHoldWallCoverPoint(point, threat, status) {
      if (!point || !threat) return null;
      let best = null;
      let bestScore = Infinity;

      for (const obstacle of this.coverBlockers()) {
        const center = {
          x: obstacle.x + obstacle.w / 2,
          y: obstacle.y + obstacle.h / 2
        };
        if (distXY(center.x, center.y, point.x, point.y) > (point.radius || 150) + 360) continue;

        for (const sample of this.holdWallSamples(obstacle, threat)) {
          if (!this.pointPassable(sample.x, sample.y, 22)) continue;
          if (distXY(sample.x, sample.y, point.x, point.y) > (point.radius || 150) + 260) continue;
          const covered = lineIntersectsRect(threat.x, threat.y, sample.x, sample.y, expandedRect(obstacle, 8));
          if (!covered) continue;

          const objectiveDistance = distXY(sample.x, sample.y, point.x, point.y);
          const squadDistance = status.center ? distXY(sample.x, sample.y, status.center.x, status.center.y) : 0;
          const threatDistance = distXY(sample.x, sample.y, threat.x, threat.y);
          const score = objectiveDistance + squadDistance * 0.28 - threatDistance * 0.08;
          if (score < bestScore) {
            best = sample;
            bestScore = score;
          }
        }
      }

      return best ? {
        name: `${this.order.objectiveName}-hold-wall`,
        x: best.x,
        y: best.y,
        radius: 76
      } : null;
    }

    holdWallSamples(obstacle, threat) {
      const offset = 34;
      const center = {
        x: obstacle.x + obstacle.w / 2,
        y: obstacle.y + obstacle.h / 2
      };
      const awayAngle = angleTo(threat.x, threat.y, center.x, center.y);
      const samples = [
        { x: obstacle.x - offset, y: obstacle.y + obstacle.h * 0.25 },
        { x: obstacle.x - offset, y: obstacle.y + obstacle.h * 0.75 },
        { x: obstacle.x + obstacle.w + offset, y: obstacle.y + obstacle.h * 0.25 },
        { x: obstacle.x + obstacle.w + offset, y: obstacle.y + obstacle.h * 0.75 },
        { x: obstacle.x + obstacle.w * 0.25, y: obstacle.y - offset },
        { x: obstacle.x + obstacle.w * 0.75, y: obstacle.y - offset },
        { x: obstacle.x + obstacle.w * 0.25, y: obstacle.y + obstacle.h + offset },
        { x: obstacle.x + obstacle.w * 0.75, y: obstacle.y + obstacle.h + offset }
      ];

      return samples.sort((a, b) => {
        const angleA = angleTo(center.x, center.y, a.x, a.y);
        const angleB = angleTo(center.x, center.y, b.x, b.y);
        return Math.abs(normalizeAngle(angleA - awayAngle)) - Math.abs(normalizeAngle(angleB - awayAngle));
      });
    }

    coverBlockers(options = {}) {
      return IronLine.physics?.coverBlockers?.(this.game, {
        includeScenery: true,
        includeWrecks: true,
        ...options
      }) || this.game.world.obstacles || [];
    }

    safeTacticalPoint(x, y, name, radius, margin = 42) {
      const point = {
        name,
        x: clamp(x, margin, this.game.world.width - margin),
        y: clamp(y, margin, this.game.world.height - margin),
        radius
      };
      if (this.pointPassable?.(point.x, point.y, 22)) return point;
      return point;
    }

    pointPassable(x, y, radius) {
      const margin = radius + 2;
      if (x < margin || y < margin || x > this.game.world.width - margin || y > this.game.world.height - margin) return false;
      if (IronLine.physics?.circleBlockedByWorld) {
        return !IronLine.physics.circleBlockedByWorld(this.game, null, x, y, radius, {
          blockTanks: true,
          blockWrecks: true,
          padding: 5
        });
      }
      return !(this.game.world.obstacles || []).some((obstacle) => circleRectCollision(x, y, radius, obstacle));
    }

    leaderUnit() {
      const active = this.activeUnits();
      return active.find((unit) => (this.roleMap.get(unit) || "") === "assault") || active[0] || null;
    }

    squadHasRpg() {
      return this.activeUnits().some((unit) => (unit.equipmentAmmo?.rpg || 0) > 0);
    }

    distanceTo(point) {
      const active = this.activeUnits();
      if (active.length === 0 || !point) return Infinity;
      const total = active.reduce((sum, unit) => sum + distXY(unit.x, unit.y, point.x, point.y), 0);
      return total / active.length;
    }
  }

  IronLine.SquadAI = SquadAI;
})(window);
