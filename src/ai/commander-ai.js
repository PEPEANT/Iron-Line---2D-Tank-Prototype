"use strict";

(function registerCommanderAI(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, AI_CONFIG } = IronLine.constants;
  const { clamp, distXY, angleTo, circleRectCollision, lineIntersectsRect, expandedRect } = IronLine.math;

  class CommanderAI {
    constructor(game, team, objectiveOrder) {
      this.game = game;
      this.team = team;
      this.objectiveOrder = objectiveOrder;
      this.assignments = new Map();
      this.infantryAssignments = new Map();
      this.squadAssignments = new Map();
      this.supportRequests = new Map();
      this.operations = [];
      this.timer = 0;
      this.summary = "";
      this.supportSummary = "";
    }

    update(dt) {
      this.updateSupportRequestTtl(dt);
      this.timer -= dt;
      if (this.timer > 0) return;
      this.timer = 0.45;
      this.rebuildAssignments();
      this.rebuildInfantryAssignments();
      this.collectSupportRequests();
      this.assignSupportAssets();
      this.assignRepairAssets();
    }

    getOrderFor(vehicle) {
      if (!this.assignments.has(vehicle) && vehicle?.vehicleType !== "humvee") this.rebuildAssignments();
      return this.assignments.get(vehicle) || null;
    }

    getObjectiveFor(tank) {
      return this.getOrderFor(tank)?.point || null;
    }

    getInfantryOrderFor(unit) {
      if (!this.infantryAssignments.has(unit)) this.rebuildInfantryAssignments();
      return this.infantryAssignments.get(unit) || null;
    }

    rebuildAssignments() {
      this.assignments.clear();

      const units = this.game.tanks
        .filter((tank) => tank.alive && tank.ai && !tank.playerControlled && tank.team === this.team && tank.isOperational())
        .sort((a, b) => a.callSign.localeCompare(b.callSign));

      const candidates = this.objectiveOrder
        .map((name) => this.game.capturePoints.find((point) => point.name === name))
        .filter((point) => point && point.owner !== this.team);

      const contested = candidates.filter((point) => point.contested);
      const attackQueue = contested.length > 0 ? contested.concat(candidates.filter((point) => !point.contested)) : candidates;

      if (attackQueue.length > 0) {
        const activeCount = Math.min(attackQueue.length, units.length >= 3 ? 3 : units.length > 1 ? 2 : 1);
        const activeObjectives = attackQueue.slice(0, activeCount);
        const groups = new Map(activeObjectives.map((point) => [point.name, []]));

        units.forEach((tank, index) => {
          const point = activeObjectives[index % activeObjectives.length];
          groups.get(point.name).push(tank);
        });

        activeObjectives.forEach((point, priority) => {
          const group = groups.get(point.name);
          group.forEach((tank, slotIndex) => {
            this.assignments.set(tank, this.createOrder(point, {
              role: "attack",
              stance: "capture",
              priority,
              slotIndex,
              slotCount: group.length
            }));
          });
        });
        this.summary = `${this.team}: attack ${activeObjectives.map((point) => point.name).join("/")}`;
        return;
      }

      const owned = this.objectiveOrder
        .map((name) => this.game.capturePoints.find((point) => point.name === name))
        .filter((point) => point);

      units.forEach((tank, index) => {
        const point = owned[index % Math.max(1, owned.length)] || null;
        this.assignments.set(tank, point ? this.createOrder(point, {
          role: "hold",
          stance: "hold",
          priority: index,
          slotIndex: index,
          slotCount: units.length
        }) : null);
      });
      this.summary = `${this.team}: hold`;
    }

    createOrder(point, options) {
      const leashRadius = options.leashRadius || (options.role === "hold" ? AI_CONFIG.holdLeashRadius : AI_CONFIG.objectiveLeashRadius);
      return {
        id: options.id || `${this.team}:${options.role}:${point.name}:${options.slotIndex}/${options.slotCount}`,
        team: this.team,
        point,
        objectiveName: options.objectiveName || point.name,
        role: options.role,
        stance: options.stance,
        priority: options.priority,
        slotIndex: options.slotIndex,
        slotCount: options.slotCount,
        leashRadius,
        threatRadius: options.threatRadius || point.radius + AI_CONFIG.objectiveThreatExtra,
        operationId: options.operationId || "",
        pairedSquadId: options.pairedSquadId || "",
        pairedTankId: options.pairedTankId || "",
        supportRequestId: options.supportRequestId || "",
        supportRequestType: options.supportRequestType || "",
        supportPoint: options.supportPoint || null,
        pickupPoint: options.pickupPoint || null,
        dropoffPoint: options.dropoffPoint || null,
        passengerIds: options.passengerIds || [],
        repairTarget: options.repairTarget || null,
        egressPoint: options.egressPoint || null
      };
    }

    rebuildInfantryAssignments() {
      this.infantryAssignments.clear();
      this.squadAssignments.clear();
      this.operations = [];
      const scouts = this.teamScouts();

      const squads = (this.game.squads || [])
        .filter((squad) => squad.team === this.team && squad.activeUnits().length > 0)
        .sort((a, b) => a.callSign.localeCompare(b.callSign));

      if (squads.length > 0) {
        this.rebuildSquadAssignments(squads);
        this.applyCombinedArmsOrders(squads);
        this.assignHumveeEscortOrders(squads);
        this.assignScoutOrders(scouts);
        return;
      }

      const units = (this.game.infantry || [])
        .filter((unit) => unit.alive && unit.ai && unit.team === this.team && unit.classId !== "scout")
        .sort((a, b) => a.callSign.localeCompare(b.callSign));

      const candidates = this.objectiveOrder
        .map((name) => this.game.capturePoints.find((point) => point.name === name))
        .filter((point) => point && point.owner !== this.team);

      const targets = candidates.length > 0
        ? candidates.slice(0, Math.min(candidates.length, units.length >= 5 ? 3 : units.length > 2 ? 2 : 1))
        : this.objectiveOrder
          .map((name) => this.game.capturePoints.find((point) => point.name === name))
          .filter((point) => point);

      if (targets.length === 0) {
        this.assignScoutOrders(scouts);
        return;
      }

      units.forEach((unit, index) => {
        const point = targets[index % targets.length];
        this.infantryAssignments.set(unit, this.createOrder(point, {
          role: candidates.length > 0 ? "infantry" : "hold",
          stance: candidates.length > 0 ? "advance" : "hold",
          priority: index % targets.length,
          slotIndex: index,
          slotCount: units.length
        }));
      });
      this.assignScoutOrders(scouts);
    }

    teamScouts() {
      return (this.game.infantry || [])
        .filter((unit) => unit.alive && unit.ai && unit.team === this.team && unit.classId === "scout")
        .sort((a, b) => a.callSign.localeCompare(b.callSign));
    }

    assignScoutOrders(scouts) {
      if (!scouts.length) return;
      const points = this.reconPoints();
      if (!points.length) return;

      const rotation = Math.floor((this.game.matchTime || 0) / (AI_CONFIG.reconReassignInterval || 36));
      scouts.forEach((unit, index) => {
        const seed = String(unit.callSign || index).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
        const point = points[(index + seed + rotation) % points.length];
        this.infantryAssignments.set(unit, this.createOrder(point, {
          role: "recon",
          stance: "observe",
          priority: index,
          slotIndex: index,
          slotCount: scouts.length,
          leashRadius: (point.radius || 130) + 360,
          threatRadius: (point.radius || 130) + 520,
          egressPoint: this.baseExitPoint()
        }));
      });
    }

    baseExitPoint() {
      const configured = this.game.world.baseExitPoints?.[this.team];
      if (configured && this.pointPassable(configured.x, configured.y, 20)) {
        return {
          x: configured.x,
          y: configured.y,
          radius: configured.radius || 70
        };
      }
      return null;
    }

    reconPoints() {
      const configured = this.game.world.reconPoints?.[this.team] || [];
      if (configured.length > 0) {
        return configured
          .map((point, index) => ({
            name: point.name || `R${index + 1}`,
            x: point.x,
            y: point.y,
            radius: point.radius || 130
          }))
          .filter((point) => this.pointPassable(point.x, point.y, 20));
      }

      return this.objectiveOrder
        .map((name) => this.game.capturePoints.find((point) => point.name === name))
        .filter((point) => point)
        .map((point, index) => ({
          name: `${point.name}-RECON`,
          x: point.x + (this.team === TEAM.BLUE ? -1 : 1) * (point.radius + 230),
          y: point.y + (index % 2 === 0 ? -1 : 1) * 160,
          radius: 140
        }))
        .filter((point) => this.pointPassable(point.x, point.y, 20));
    }

    rebuildSquadAssignments(squads) {
      const candidates = this.objectiveOrder
        .map((name) => this.game.capturePoints.find((point) => point.name === name))
        .filter((point) => point && point.owner !== this.team);

      const contested = candidates.filter((point) => point.contested);
      const queue = contested.length > 0 ? contested.concat(candidates.filter((point) => !point.contested)) : candidates;
      const targets = queue.length > 0
        ? queue.slice(0, Math.min(queue.length, squads.length))
        : this.objectiveOrder
          .map((name) => this.game.capturePoints.find((point) => point.name === name))
          .filter((point) => point);

      if (targets.length === 0) return;

      squads.forEach((squad, index) => {
        const point = targets[index % targets.length];
        const order = this.createOrder(point, {
          role: queue.length > 0 ? "infantry" : "hold",
          stance: queue.length > 0 ? "advance" : "hold",
          priority: index % targets.length,
          slotIndex: index,
          slotCount: squads.length
        });
        this.squadAssignments.set(squad, order);
        squad.assignOrder(order);

        for (const unit of squad.activeUnits()) {
          const unitOrder = squad.getOrderFor(unit);
          if (unitOrder) this.infantryAssignments.set(unit, unitOrder);
        }
      });
    }

    applyCombinedArmsOrders(squads) {
      const tanks = this.game.tanks
        .filter((tank) => tank.alive && tank.ai && !tank.playerControlled && tank.team === this.team && tank.isOperational())
        .sort((a, b) => a.callSign.localeCompare(b.callSign));

      if (tanks.length === 0 || squads.length === 0) return;

      const usedTanks = new Set();
      const tankSupportBudget = this.armorSupportBudget(tanks);
      const activeSquads = squads
        .filter((squad) => this.squadAssignments.has(squad) && squad.activeUnits().length > 0)
        .sort((a, b) => a.distanceTo(this.squadAssignments.get(a).point) - b.distanceTo(this.squadAssignments.get(b).point));

      activeSquads.forEach((squad, operationIndex) => {
        if (usedTanks.size >= tankSupportBudget) return;
        const squadOrder = this.squadAssignments.get(squad);
        if (!squadOrder?.point || squadOrder.role === "hold") return;

        const tank = this.pickOverwatchTank(tanks, usedTanks, squadOrder.point);
        if (!tank) return;

        usedTanks.add(tank);
        const operationId = `${this.team}:${squadOrder.point.name}:combined:${squad.callSign}`;
        const supportPoint = this.findSupportPoint(squad, squadOrder.point, operationIndex);
        const supportOrder = this.createOrder(squadOrder.point, {
          role: "support",
          stance: "overwatch",
          priority: squadOrder.priority,
          slotIndex: operationIndex,
          slotCount: activeSquads.length,
          operationId,
          supportPoint,
          pairedSquadId: squad.callSign,
          leashRadius: AI_CONFIG.objectiveLeashRadius + 220,
          threatRadius: squadOrder.point.radius + AI_CONFIG.objectiveThreatExtra + 220
        });

        this.assignments.set(tank, supportOrder);
        this.operations.push({
          id: operationId,
          point: squadOrder.point.name,
          tank: tank.callSign,
          squad: squad.callSign,
          supportPoint
        });

        const coordinatedSquadOrder = {
          ...squadOrder,
          id: `${squadOrder.id}:${operationId}`,
          operationId,
          pairedTankId: tank.callSign,
          stance: "assault"
        };
        this.squadAssignments.set(squad, coordinatedSquadOrder);
        squad.assignOrder(coordinatedSquadOrder);
        for (const unit of squad.activeUnits()) {
          const unitOrder = squad.getOrderFor(unit);
          if (unitOrder) this.infantryAssignments.set(unit, unitOrder);
        }
      });

      if (this.operations.length > 0) {
        this.summary = `${this.team}: combined ${this.operations.map((operation) => `${operation.tank}+${operation.squad}>${operation.point}`).join(" ")}`;
      }
    }

    pickOverwatchTank(tanks, usedTanks, point) {
      const scored = tanks
        .filter((tank) => !usedTanks.has(tank))
        .map((tank) => {
          const order = this.assignments.get(tank);
          let score = distXY(tank.x, tank.y, point.x, point.y);
          if (order?.objectiveName === point.name) score -= 520;
          if (order?.role === "hold") score += 180;
          return { tank, score };
        })
        .sort((a, b) => a.score - b.score);

      return scored[0]?.tank || null;
    }

    armorSupportBudget(tanks) {
      if (!Array.isArray(tanks) || tanks.length === 0) return 0;
      const hasAttackObjective = this.objectiveOrder
        .map((name) => this.game.capturePoints.find((point) => point.name === name))
        .some((point) => point && point.owner !== this.team);
      const directArmorReserve = hasAttackObjective ? 1 : 0;
      return Math.max(0, tanks.length - directArmorReserve);
    }

    assignHumveeEscortOrders(squads) {
      const humvees = this.availableSupportHumvees();
      squads.forEach((squad) => squad.assignTransport?.(null));
      if (humvees.length === 0 || squads.length === 0) return;

      const usedHumvees = new Set();
      const activeSquads = squads
        .filter((squad) => (
          this.squadAssignments.has(squad) &&
          this.squadAssignments.get(squad)?.role !== "hold" &&
          squad.activeUnits().length > 0
        ))
        .sort((a, b) => a.distanceTo(this.squadAssignments.get(a).point) - b.distanceTo(this.squadAssignments.get(b).point));

      activeSquads.forEach((squad, operationIndex) => {
        const squadOrder = this.squadAssignments.get(squad);
        if (!squadOrder?.point) return;

        const humvee = this.pickEscortHumvee(humvees, usedHumvees, squad);
        if (!humvee) return;

        usedHumvees.add(humvee);
        const operationId = `${this.team}:${squadOrder.point.name}:transport:${squad.callSign}`;
        const pickupPoint = this.squadCenterPoint(squad, `${squad.callSign}-pickup`);
        const dropoffPoint = this.findHumveeDropoffPoint(squad, squadOrder.point, operationIndex);
        const supportPoint = this.findHumveeEscortPoint(squad, squadOrder.point, operationIndex);
        const passengerIds = this.squadTransportPassengerIds(squad, humvee.passengerCapacity || 4, humvee);
        if (passengerIds.length === 0) return;

        const transportOrder = this.createOrder(squadOrder.point, {
          role: "transport",
          stance: "squad-transport",
          priority: squadOrder.priority + 0.25,
          slotIndex: operationIndex,
          slotCount: activeSquads.length,
          operationId,
          pickupPoint,
          dropoffPoint,
          supportPoint,
          passengerIds,
          pairedSquadId: squad.callSign,
          leashRadius: AI_CONFIG.objectiveLeashRadius + 260,
          threatRadius: squadOrder.point.radius + AI_CONFIG.objectiveThreatExtra + 180
        });

        this.assignments.set(humvee, transportOrder);
        squad.assignTransport?.({
          vehicle: humvee,
          vehicleId: humvee.callSign,
          passengerIds,
          pickupPoint,
          dropoffPoint,
          supportPoint,
          operationId
        });
        this.operations.push({
          id: operationId,
          point: squadOrder.point.name,
          humvee: humvee.callSign,
          squad: squad.callSign,
          pickupPoint,
          dropoffPoint,
          supportPoint,
          requestType: "squad-transport"
        });
      });

      const escortSquads = activeSquads.length ? activeSquads : squads;
      let escortIndex = 0;
      for (const humvee of humvees) {
        if (usedHumvees.has(humvee) || escortSquads.length === 0) continue;
        const squad = escortSquads[escortIndex % escortSquads.length];
        escortIndex += 1;
        const squadOrder = this.squadAssignments.get(squad);
        if (!squadOrder?.point || squadOrder.role === "hold") continue;

        const operationId = `${this.team}:${squadOrder.point.name}:humvee:${squad.callSign}`;
        const supportPoint = this.findHumveeEscortPoint(squad, squadOrder.point, escortIndex);
        const escortOrder = this.createOrder(squadOrder.point, {
          role: "escort",
          stance: "squad-escort",
          priority: squadOrder.priority + 0.45,
          slotIndex: escortIndex,
          slotCount: Math.max(1, humvees.length),
          operationId,
          supportPoint,
          pairedSquadId: squad.callSign,
          leashRadius: AI_CONFIG.objectiveLeashRadius + 260,
          threatRadius: squadOrder.point.radius + AI_CONFIG.objectiveThreatExtra + 180
        });

        this.assignments.set(humvee, escortOrder);
        this.operations.push({
          id: operationId,
          point: squadOrder.point.name,
          humvee: humvee.callSign,
          squad: squad.callSign,
          supportPoint,
          requestType: "squad-escort"
        });
      }
    }

    squadTransportPassengerIds(squad, capacity, humvee = null) {
      const rolePriority = {
        assault: 0,
        security: 1,
        support: 2
      };
      return squad.activeUnits()
        .filter((unit) => {
          if (unit.inVehicle && unit.inVehicle !== humvee) return false;
          if (!unit.inVehicle && (unit.transportCooldown || 0) > 1.2) return false;
          return true;
        })
        .sort((a, b) => {
          const mountedA = a.inVehicle === humvee ? -1 : 0;
          const mountedB = b.inVehicle === humvee ? -1 : 0;
          const roleA = squad.roleMap?.get(a) || "assault";
          const roleB = squad.roleMap?.get(b) || "assault";
          return mountedA - mountedB ||
            (rolePriority[roleA] ?? 1) - (rolePriority[roleB] ?? 1) ||
            a.callSign.localeCompare(b.callSign);
        })
        .slice(0, Math.max(1, capacity || 4))
        .map((unit) => unit.callSign);
    }

    squadCenterPoint(squad, name) {
      const center = squad.status?.center || squad.leaderUnit?.() || squad.order?.point || { x: 0, y: 0 };
      return {
        name,
        x: center.x,
        y: center.y,
        radius: 92,
        stopDistance: 88
      };
    }

    pickEscortHumvee(humvees, usedHumvees, squad) {
      const center = squad.status?.center || squad.leaderUnit?.() || squad.order?.point;
      if (!center) return null;

      const scored = humvees
        .filter((humvee) => !usedHumvees.has(humvee))
        .map((humvee) => {
          const order = this.assignments.get(humvee);
          let score = distXY(humvee.x, humvee.y, center.x, center.y);
          if (order?.pairedSquadId === squad.callSign) score -= 720;
          if (order?.role === "escort") score -= 120;
          if (humvee.hp < humvee.maxHp * 0.48) score += 220;
          return { humvee, score };
        })
        .sort((a, b) => a.score - b.score);

      return scored[0]?.humvee || null;
    }

    findHumveeEscortPoint(squad, point, operationIndex) {
      const center = squad.status?.center || squad.leaderUnit?.() || point;
      const approachAngle = squad.approachAngle ? squad.approachAngle(point) : angleTo(point.x, point.y, center.x, center.y);
      const side = operationIndex % 2 === 0 ? -1 : 1;
      const distances = [150, 200, 112, 255];
      const sideOffsets = [74 * side, -74 * side, 124 * side, -124 * side, 0];

      for (const distance of distances) {
        for (const sideOffset of sideOffsets) {
          const x = center.x + Math.cos(approachAngle) * distance + Math.cos(approachAngle + Math.PI / 2) * sideOffset;
          const y = center.y + Math.sin(approachAngle) * distance + Math.sin(approachAngle + Math.PI / 2) * sideOffset;
          const candidate = this.clampWorldPoint(x, y, 46);
          if (!this.pointPassable(candidate.x, candidate.y, 35)) continue;
          return {
            ...candidate,
            stopDistance: 92,
            final: true,
            overwatch: true,
            escort: true
          };
        }
      }

      const fallback = this.clampWorldPoint(
        center.x + Math.cos(approachAngle) * 180,
        center.y + Math.sin(approachAngle) * 180,
        46
      );
      return {
        ...fallback,
        stopDistance: 96,
        final: true,
        overwatch: true,
        escort: true
      };
    }

    findHumveeDropoffPoint(squad, point, operationIndex) {
      const approachAngle = squad.approachAngle ? squad.approachAngle(point) : angleTo(point.x, point.y, squad.status?.center?.x || point.x, squad.status?.center?.y || point.y);
      const side = operationIndex % 2 === 0 ? -1 : 1;
      const distances = [point.radius + 245, point.radius + 305, point.radius + 200, point.radius + 365];
      const sideOffsets = [0, 72 * side, -72 * side, 128 * side, -128 * side];

      for (const distance of distances) {
        for (const sideOffset of sideOffsets) {
          const x = point.x + Math.cos(approachAngle) * distance + Math.cos(approachAngle + Math.PI / 2) * sideOffset;
          const y = point.y + Math.sin(approachAngle) * distance + Math.sin(approachAngle + Math.PI / 2) * sideOffset;
          const candidate = this.clampWorldPoint(x, y, 46);
          if (!this.pointPassable(candidate.x, candidate.y, 35)) continue;
          return {
            name: `${point.name}-dropoff`,
            ...candidate,
            radius: 96,
            stopDistance: 98,
            final: true,
            dropoff: true
          };
        }
      }

      const fallback = this.clampWorldPoint(
        point.x + Math.cos(approachAngle) * (point.radius + 275),
        point.y + Math.sin(approachAngle) * (point.radius + 275),
        46
      );
      return {
        name: `${point.name}-dropoff`,
        ...fallback,
        radius: 96,
        stopDistance: 104,
        final: true,
        dropoff: true
      };
    }

    updateSupportRequestTtl(dt) {
      for (const [id, request] of this.supportRequests) {
        request.ttl -= dt;
        const repairDone = request.type === "need-repair" &&
          (!request.target?.alive || request.target.hp >= request.target.maxHp * 0.94);
        if (request.ttl <= 0 || repairDone || request.sourceSquad?.activeUnits?.().length === 0) {
          this.supportRequests.delete(id);
        }
      }
    }

    collectSupportRequests() {
      const now = this.game.matchTime || 0;
      const squads = (this.game.squads || [])
        .filter((squad) => squad.team === this.team && squad.activeUnits().length > 0);

      for (const squad of squads) {
        const report = squad.supportRequest;
        if (!report?.type) continue;
        if (!["need-armor-support", "need-fire-support"].includes(report.type)) continue;

        const status = squad.status || {};
        const origin = status.center || squad.leaderUnit?.() || report.target || squad.order?.point;
        if (!origin) continue;

        const id = `${this.team}:${squad.callSign}:${report.type}:${squad.order?.objectiveName || squad.order?.point?.name || "field"}`;
        const current = this.supportRequests.get(id);
        const request = {
          id,
          team: this.team,
          type: report.type,
          sourceType: "squad",
          sourceId: squad.callSign,
          sourceSquad: squad,
          objectiveName: squad.order?.objectiveName || squad.order?.point?.name || "",
          objectivePoint: squad.order?.point || null,
          origin: { x: origin.x, y: origin.y },
          target: report.target || status.armorThreat?.vehicle || squad.order?.point || origin,
          urgency: clamp(report.urgency ?? 0.5, 0, 1),
          ttl: Math.max(2.4, current?.ttl || 0),
          createdAt: current?.createdAt ?? now,
          updatedAt: now,
          assignedAssetId: current?.assignedAssetId || "",
          status: current?.status === "assigned" ? "assigned" : "open",
          priority: 0
        };
        request.priority = this.supportRequestPriority(request);
        this.supportRequests.set(id, request);
      }
      this.collectRepairRequests(now);
    }

    collectRepairRequests(now) {
      const vehicles = [...(this.game.tanks || []), ...(this.game.humvees || [])]
        .filter((vehicle) => (
          vehicle.alive &&
          vehicle.team === this.team &&
          vehicle.maxHp > 0 &&
          vehicle.hp < vehicle.maxHp * 0.82 &&
          (vehicle.isOperational?.() ?? true)
        ));

      for (const vehicle of vehicles) {
        const damageRatio = clamp(1 - vehicle.hp / Math.max(1, vehicle.maxHp), 0, 1);
        const objectivePoint = this.nearestObjectivePoint(vehicle);
        const id = `${this.team}:${vehicle.callSign}:need-repair`;
        const current = this.supportRequests.get(id);
        const request = {
          id,
          team: this.team,
          type: "need-repair",
          sourceType: "vehicle",
          sourceId: vehicle.callSign,
          sourceVehicle: vehicle,
          objectiveName: objectivePoint?.name || "",
          objectivePoint,
          origin: { x: vehicle.x, y: vehicle.y },
          target: vehicle,
          urgency: clamp(0.28 + damageRatio * 1.35 + (objectivePoint?.contested ? 0.16 : 0), 0.32, 1),
          ttl: Math.max(3.6, current?.ttl || 0),
          createdAt: current?.createdAt ?? now,
          updatedAt: now,
          assignedAssetId: current?.assignedAssetId || "",
          status: current?.status === "assigned" ? "assigned" : "open",
          priority: 0
        };
        request.priority = this.supportRequestPriority(request);
        this.supportRequests.set(id, request);
      }
    }

    supportRequestPriority(request) {
      const point = request.objectivePoint;
      let objectiveImportance = 0;
      if (point?.contested) objectiveImportance += 34;
      if (point && point.owner !== this.team) objectiveImportance += 22;

      const nearestAsset = this.availableSupportAssetsForRequest(request)
        .map((asset) => distXY(asset.x, asset.y, request.origin.x, request.origin.y))
        .sort((a, b) => a - b)[0] ?? Infinity;
      const assetAvailability = Number.isFinite(nearestAsset) ? 24 : -45;
      const distancePenalty = Number.isFinite(nearestAsset) ? nearestAsset / 58 : 80;
      return request.urgency * 100 + objectiveImportance + assetAvailability - distancePenalty;
    }

    availableSupportAssetsForRequest(request) {
      if (request.type === "need-fire-support") return this.availableSupportHumvees().filter((humvee) => (humvee.passengerCount?.() || 0) === 0);
      if (request.type === "need-armor-support") return this.availableSupportTanks();
      if (request.type === "need-repair") return this.availableRepairEngineers();
      return [];
    }

    availableSupportTanks() {
      return (this.game.tanks || [])
        .filter((tank) => (
          tank.alive &&
          tank.ai &&
          !tank.playerControlled &&
          tank.team === this.team &&
          tank.isOperational?.() &&
          tank.hp > tank.maxHp * 0.25
        ));
    }

    availableSupportHumvees() {
      return (this.game.humvees || [])
        .filter((humvee) => (
          humvee.alive &&
          humvee.ai &&
          !humvee.playerControlled &&
          humvee.team === this.team &&
          humvee.isOperational?.() &&
          humvee.hp > humvee.maxHp * 0.3
        ));
    }

    availableRepairEngineers() {
      return (this.game.infantry || [])
        .filter((unit) => (
          unit.alive &&
          unit.ai &&
          unit.team === this.team &&
          unit.classId === "engineer" &&
          !unit.inVehicle &&
          (unit.equipmentAmmo?.repairKit || 0) > 0 &&
          unit.hp > 0
        ));
    }

    assignSupportAssets() {
      const requests = Array.from(this.supportRequests.values())
        .filter((request) => request.ttl > 0 && ["need-armor-support", "need-fire-support"].includes(request.type))
        .sort((a, b) => b.priority - a.priority);

      const tanks = this.availableSupportTanks();
      const humvees = this.availableSupportHumvees().filter((humvee) => (humvee.passengerCount?.() || 0) === 0);
      const tankSupportBudget = this.armorSupportBudget(tanks);
      const usedTanks = new Set();
      const usedHumvees = new Set();
      let assignedCount = 0;
      const assignedLabels = [];

      for (const request of requests) {
        request.status = "open";
        request.assignedAssetId = "";
        const isFireSupport = request.type === "need-fire-support";
        if (!isFireSupport && usedTanks.size >= tankSupportBudget) continue;
        const asset = isFireSupport
          ? this.pickSupportHumveeForRequest(request, humvees, usedHumvees)
          : this.pickSupportTankForRequest(request, tanks, usedTanks);
        if (!asset) continue;

        if (isFireSupport) usedHumvees.add(asset);
        else usedTanks.add(asset);
        request.status = "assigned";
        request.assignedAssetId = asset.callSign;
        assignedCount += 1;
        assignedLabels.push(`${asset.callSign}->${request.sourceId}`);

        const supportPoint = isFireSupport
          ? this.findHumveeSupportPointForRequest(request, assignedCount - 1)
          : this.findSupportPointForRequest(request, assignedCount - 1);
        const targetPoint = this.requestTargetPoint(request);
        const operationId = `${this.team}:${request.type}:${request.sourceId}:${asset.callSign}`;
        const order = this.createOrder(targetPoint, {
          id: `${operationId}:${Math.round(request.createdAt * 10)}`,
          role: "support",
          stance: isFireSupport ? "request-fire-support" : "request-support",
          priority: -10 - assignedCount,
          slotIndex: assignedCount - 1,
          slotCount: Math.max(1, requests.length),
          operationId,
          objectiveName: request.objectiveName || targetPoint.name,
          supportPoint,
          pairedSquadId: request.sourceId,
          supportRequestId: request.id,
          supportRequestType: request.type,
          leashRadius: AI_CONFIG.objectiveLeashRadius + (isFireSupport ? 230 : 320),
          threatRadius: (targetPoint.radius || 180) + AI_CONFIG.objectiveThreatExtra + (isFireSupport ? 190 : 260)
        });

        this.assignments.set(asset, order);
        this.operations.push({
          id: operationId,
          point: request.objectiveName || targetPoint.name,
          tank: asset.vehicleType === "humvee" ? "" : asset.callSign,
          humvee: asset.vehicleType === "humvee" ? asset.callSign : "",
          squad: request.sourceId,
          supportPoint,
          requestType: request.type
        });
      }

      if (assignedCount > 0) {
        this.supportSummary = `${this.team}: support ${assignedLabels.join(" ")}`;
        this.summary = this.supportSummary;
      } else {
        this.supportSummary = "";
      }
    }

    assignRepairAssets() {
      const requests = Array.from(this.supportRequests.values())
        .filter((request) => (
          request.ttl > 0 &&
          request.type === "need-repair" &&
          request.target?.alive &&
          request.target.hp < request.target.maxHp * 0.94
        ))
        .sort((a, b) => b.priority - a.priority);

      if (requests.length === 0) return;

      const engineers = this.availableRepairEngineers();
      const usedEngineers = new Set();
      const assignedLabels = [];
      let assignedCount = 0;

      for (const request of requests) {
        request.status = "open";
        request.assignedAssetId = "";

        const engineer = this.pickRepairEngineerForRequest(request, engineers, usedEngineers);
        if (!engineer) continue;

        usedEngineers.add(engineer);
        request.status = "assigned";
        request.assignedAssetId = engineer.callSign;
        assignedCount += 1;
        assignedLabels.push(`${engineer.callSign}->${request.sourceId}`);

        const repairPoint = this.findRepairStagingPoint(request, engineer);
        const operationId = `${this.team}:${request.type}:${request.sourceId}:${engineer.callSign}`;
        const order = this.createOrder(repairPoint, {
          id: `${operationId}:${Math.round(request.createdAt * 10)}`,
          role: "repair",
          stance: "need-repair",
          priority: -35 - assignedCount,
          slotIndex: assignedCount - 1,
          slotCount: Math.max(1, requests.length),
          operationId,
          objectiveName: request.objectiveName || repairPoint.name,
          supportPoint: repairPoint,
          supportRequestId: request.id,
          supportRequestType: request.type,
          repairTarget: request.target,
          leashRadius: 620,
          threatRadius: 520
        });

        this.infantryAssignments.set(engineer, order);
        this.operations.push({
          id: operationId,
          point: request.objectiveName || repairPoint.name,
          engineer: engineer.callSign,
          vehicle: request.sourceId,
          supportPoint: repairPoint,
          requestType: request.type
        });
      }

      if (assignedCount > 0) {
        const prefix = this.supportSummary ? `${this.supportSummary} ` : `${this.team}: support `;
        this.supportSummary = `${prefix}repair ${assignedLabels.join(" ")}`;
        this.summary = this.supportSummary;
      }
    }

    pickRepairEngineerForRequest(request, engineers, usedEngineers) {
      const target = request.target || request.origin;
      const scored = engineers
        .filter((engineer) => !usedEngineers.has(engineer))
        .map((engineer) => {
          const order = this.infantryAssignments.get(engineer);
          let score = distXY(engineer.x, engineer.y, target.x, target.y);
          if (order?.supportRequestId === request.id) score -= 760;
          if (order?.role === "repair") score -= 120;
          if ((engineer.suppression || 0) > 50) score += 180;
          if ((engineer.transportCooldown || 0) > 0) score += 80;
          score -= request.urgency * 150;
          return { engineer, score };
        })
        .sort((a, b) => a.score - b.score);
      return scored[0]?.engineer || null;
    }

    findRepairStagingPoint(request, engineer) {
      const vehicle = request.target || request.origin;
      const threat = this.nearestEnemyVehicle(vehicle)?.vehicle;
      const angle = threat
        ? angleTo(threat.x, threat.y, vehicle.x, vehicle.y)
        : angleTo(engineer.x, engineer.y, vehicle.x, vehicle.y);
      const distances = [
        (vehicle.radius || 36) + 74,
        (vehicle.radius || 36) + 98,
        (vehicle.radius || 36) + 122
      ];
      const sideOffsets = [0, 46, -46, 82, -82];

      for (const distance of distances) {
        for (const sideOffset of sideOffsets) {
          const x = vehicle.x + Math.cos(angle) * distance + Math.cos(angle + Math.PI / 2) * sideOffset;
          const y = vehicle.y + Math.sin(angle) * distance + Math.sin(angle + Math.PI / 2) * sideOffset;
          const candidate = this.clampWorldPoint(x, y, 38);
          if (!this.pointPassable(candidate.x, candidate.y, 24)) continue;
          return {
            name: `${vehicle.callSign || "vehicle"}-repair`,
            ...candidate,
            radius: 74,
            stopDistance: 36,
            final: true,
            repair: true
          };
        }
      }

      return {
        name: `${vehicle.callSign || "vehicle"}-repair`,
        x: vehicle.x,
        y: vehicle.y,
        radius: 86,
        stopDistance: 46,
        final: true,
        repair: true
      };
    }

    pickSupportTankForRequest(request, tanks, usedTanks) {
      const target = request.target || request.origin;
      const scored = tanks
        .filter((tank) => !usedTanks.has(tank))
        .map((tank) => {
          const order = this.assignments.get(tank);
          let score = distXY(tank.x, tank.y, target.x, target.y);
          if (order?.supportRequestId === request.id) score -= 900;
          if (order?.pairedSquadId === request.sourceId) score -= 520;
          if (order?.role === "support") score -= 110;
          if (order?.role === "hold") score += 80;
          if (tank.hp < tank.maxHp * 0.45) score += 260;
          score -= request.urgency * 170;
          return { tank, score };
        })
        .sort((a, b) => a.score - b.score);
      return scored[0]?.tank || null;
    }

    pickSupportHumveeForRequest(request, humvees, usedHumvees) {
      const target = request.target || request.origin;
      const scored = humvees
        .filter((humvee) => !usedHumvees.has(humvee))
        .map((humvee) => {
          const order = this.assignments.get(humvee);
          let score = distXY(humvee.x, humvee.y, target.x, target.y);
          if (order?.supportRequestId === request.id) score -= 880;
          if (order?.pairedSquadId === request.sourceId) score -= 640;
          if (order?.role === "escort") score -= 180;
          if (order?.role === "support") score -= 80;
          if (humvee.hp < humvee.maxHp * 0.52) score += 230;
          score -= request.urgency * 170;
          return { humvee, score };
        })
        .sort((a, b) => a.score - b.score);
      return scored[0]?.humvee || null;
    }

    requestTargetPoint(request) {
      const target = request.target || request.objectivePoint || request.origin;
      const base = target && target.x !== undefined && target.y !== undefined ? target : request.origin;
      return {
        name: request.objectiveName ? `${request.objectiveName}-support` : `${request.sourceId}-support`,
        x: base.x,
        y: base.y,
        radius: Math.max(160, target?.radius || request.objectivePoint?.radius || 120)
      };
    }

    nearestObjectivePoint(entity) {
      return (this.game.capturePoints || [])
        .map((point) => ({
          point,
          score: distXY(entity.x, entity.y, point.x, point.y) - (point.contested ? 160 : 0)
        }))
        .sort((a, b) => a.score - b.score)[0]?.point || null;
    }

    nearestEnemyVehicle(entity) {
      return [...(this.game.tanks || []), ...(this.game.humvees || [])]
        .filter((vehicle) => vehicle.alive && vehicle.team !== this.team)
        .map((vehicle) => ({
          vehicle,
          distance: distXY(entity.x, entity.y, vehicle.x, vehicle.y)
        }))
        .sort((a, b) => a.distance - b.distance)[0] || null;
    }

    findSupportPointForRequest(request, operationIndex) {
      const point = this.requestTargetPoint(request);
      const squad = request.sourceSquad;
      if (squad?.approachAngle) {
        return this.findSupportPoint(squad, point, operationIndex);
      }

      const angle = request.origin ? angleTo(point.x, point.y, request.origin.x, request.origin.y) : 0;
      const fallback = this.findInteriorSupportFallback(point, angle, operationIndex, {
        margin: 128,
        radius: 35,
        requireFireLane: false,
        distanceBonus: 220
      });
      return {
        ...fallback,
        stopDistance: 82,
        final: true,
        overwatch: true
      };
    }

    findHumveeSupportPointForRequest(request, operationIndex) {
      const point = this.requestTargetPoint(request);
      const squad = request.sourceSquad;
      const center = squad?.status?.center || request.origin || point;
      const approachAngle = squad?.approachAngle ? squad.approachAngle(point) : angleTo(point.x, point.y, center.x, center.y);
      const side = operationIndex % 2 === 0 ? -1 : 1;
      const distances = [point.radius + 280, point.radius + 340, point.radius + 230, point.radius + 410];
      const sideOffsets = [0, 96 * side, -96 * side, 150 * side, -150 * side];

      for (const distance of distances) {
        for (const sideOffset of sideOffsets) {
          const x = point.x + Math.cos(approachAngle) * distance + Math.cos(approachAngle + Math.PI / 2) * sideOffset;
          const y = point.y + Math.sin(approachAngle) * distance + Math.sin(approachAngle + Math.PI / 2) * sideOffset;
          const candidate = this.interiorWorldPoint(x, y, 122);
          if (!candidate) continue;
          if (!this.pointPassable(candidate.x, candidate.y, 35)) continue;
          if (!this.hasFireLane(candidate, point)) continue;
          return {
            ...candidate,
            stopDistance: 96,
            final: true,
            overwatch: true,
            escort: true
          };
        }
      }

      const fallback = this.findInteriorSupportFallback(point, approachAngle, operationIndex, {
        anchor: center,
        margin: 122,
        radius: 35,
        requireFireLane: false,
        distanceBonus: 60
      });
      return {
        ...fallback,
        stopDistance: 104,
        final: true,
        overwatch: true,
        escort: true
      };
    }

    findSupportPoint(squad, point, operationIndex) {
      const approachAngle = squad.approachAngle(point);
      const side = operationIndex % 2 === 0 ? -1 : 1;
      const distances = [point.radius + 210, point.radius + 270, point.radius + 160, point.radius + 330];
      const sideOffsets = [0, 82 * side, -82 * side, 148 * side, -148 * side];

      for (const distance of distances) {
        for (const sideOffset of sideOffsets) {
          const x = point.x + Math.cos(approachAngle) * distance + Math.cos(approachAngle + Math.PI / 2) * sideOffset;
          const y = point.y + Math.sin(approachAngle) * distance + Math.sin(approachAngle + Math.PI / 2) * sideOffset;
          const candidate = this.interiorWorldPoint(x, y, 132);
          if (!candidate) continue;
          if (!this.pointPassable(candidate.x, candidate.y, 35)) continue;
          if (!this.hasFireLane(candidate, point)) continue;
          return {
            ...candidate,
            stopDistance: 76,
            final: true,
            overwatch: true
          };
        }
      }

      const fallback = this.findInteriorSupportFallback(point, approachAngle, operationIndex, {
        margin: 132,
        radius: 35,
        requireFireLane: true,
        distanceBonus: 220
      });
      return {
        ...fallback,
        stopDistance: 82,
        final: true,
        overwatch: true
      };
    }

    findInteriorSupportFallback(point, approachAngle, operationIndex = 0, options = {}) {
      const anchor = options.anchor || point;
      const margin = options.margin || 126;
      const radius = options.radius || 35;
      const distanceBonus = options.distanceBonus || 180;
      const side = operationIndex % 2 === 0 ? -1 : 1;
      const distances = [
        (point.radius || 150) + distanceBonus,
        (point.radius || 150) + 135,
        (point.radius || 150) + 85,
        112
      ];
      const sideOffsets = [0, 78 * side, -78 * side, 136 * side, -136 * side, 196 * side, -196 * side];

      for (const distance of distances) {
        for (const sideOffset of sideOffsets) {
          const x = anchor.x + Math.cos(approachAngle) * distance + Math.cos(approachAngle + Math.PI / 2) * sideOffset;
          const y = anchor.y + Math.sin(approachAngle) * distance + Math.sin(approachAngle + Math.PI / 2) * sideOffset;
          const candidate = this.interiorWorldPoint(x, y, margin);
          if (!candidate) continue;
          if (!this.pointPassable(candidate.x, candidate.y, radius)) continue;
          if (options.requireFireLane && !this.hasFireLane(candidate, point)) continue;
          return candidate;
        }
      }

      const fallbackAngle = approachAngle + Math.PI;
      const candidate = this.clampWorldPoint(
        point.x + Math.cos(fallbackAngle) * Math.min(90, (point.radius || 150) * 0.55),
        point.y + Math.sin(fallbackAngle) * Math.min(90, (point.radius || 150) * 0.55),
        margin
      );
      return candidate;
    }

    interiorWorldPoint(x, y, margin = 126) {
      if (x < margin || y < margin || x > this.game.world.width - margin || y > this.game.world.height - margin) {
        return null;
      }
      return { x, y };
    }

    clampWorldPoint(x, y, margin) {
      return {
        x: clamp(x, margin, this.game.world.width - margin),
        y: clamp(y, margin, this.game.world.height - margin)
      };
    }

    pointPassable(x, y, radius) {
      return !this.game.world.obstacles.some((obstacle) => circleRectCollision(x, y, radius, obstacle));
    }

    hasFireLane(from, point) {
      return !this.game.world.obstacles.some((obstacle) => (
        lineIntersectsRect(from.x, from.y, point.x, point.y, expandedRect(obstacle, 9))
      ));
    }
  }

  IronLine.CommanderAI = CommanderAI;
  IronLine.commandPlans = {
    [TEAM.BLUE]: ["A", "B", "D", "C"],
    [TEAM.RED]: ["C", "D", "B", "A"]
  };
})(window);
