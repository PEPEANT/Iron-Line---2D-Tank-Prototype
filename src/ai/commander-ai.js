"use strict";

(function registerCommanderAI(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, AI_CONFIG } = IronLine.constants;
  const { clamp, distXY, circleRectCollision, lineIntersectsRect, expandedRect } = IronLine.math;

  class CommanderAI {
    constructor(game, team, objectiveOrder) {
      this.game = game;
      this.team = team;
      this.objectiveOrder = objectiveOrder;
      this.assignments = new Map();
      this.infantryAssignments = new Map();
      this.squadAssignments = new Map();
      this.operations = [];
      this.timer = 0;
      this.summary = "";
    }

    update(dt) {
      this.timer -= dt;
      if (this.timer > 0) return;
      this.timer = 0.45;
      this.rebuildAssignments();
      this.rebuildInfantryAssignments();
    }

    getOrderFor(tank) {
      if (!this.assignments.has(tank)) this.rebuildAssignments();
      return this.assignments.get(tank) || null;
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
        .filter((tank) => tank.alive && tank.ai && tank.team === this.team && tank.isOperational())
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
        id: `${this.team}:${options.role}:${point.name}:${options.slotIndex}/${options.slotCount}`,
        team: this.team,
        point,
        objectiveName: point.name,
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
        supportPoint: options.supportPoint || null
      };
    }

    rebuildInfantryAssignments() {
      this.infantryAssignments.clear();
      this.squadAssignments.clear();
      this.operations = [];

      const squads = (this.game.squads || [])
        .filter((squad) => squad.team === this.team && squad.activeUnits().length > 0)
        .sort((a, b) => a.callSign.localeCompare(b.callSign));

      if (squads.length > 0) {
        this.rebuildSquadAssignments(squads);
        this.applyCombinedArmsOrders(squads);
        return;
      }

      const units = (this.game.infantry || [])
        .filter((unit) => unit.alive && unit.ai && unit.team === this.team)
        .sort((a, b) => a.callSign.localeCompare(b.callSign));

      const candidates = this.objectiveOrder
        .map((name) => this.game.capturePoints.find((point) => point.name === name))
        .filter((point) => point && point.owner !== this.team);

      const targets = candidates.length > 0
        ? candidates.slice(0, Math.min(candidates.length, units.length >= 5 ? 3 : units.length > 2 ? 2 : 1))
        : this.objectiveOrder
          .map((name) => this.game.capturePoints.find((point) => point.name === name))
          .filter((point) => point);

      if (targets.length === 0) return;

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
        .filter((tank) => tank.alive && tank.ai && tank.team === this.team && tank.isOperational())
        .sort((a, b) => a.callSign.localeCompare(b.callSign));

      if (tanks.length === 0 || squads.length === 0) return;

      const usedTanks = new Set();
      const activeSquads = squads
        .filter((squad) => this.squadAssignments.has(squad) && squad.activeUnits().length > 0)
        .sort((a, b) => a.distanceTo(this.squadAssignments.get(a).point) - b.distanceTo(this.squadAssignments.get(b).point));

      activeSquads.forEach((squad, operationIndex) => {
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

    findSupportPoint(squad, point, operationIndex) {
      const approachAngle = squad.approachAngle(point);
      const side = operationIndex % 2 === 0 ? -1 : 1;
      const distances = [point.radius + 210, point.radius + 270, point.radius + 160, point.radius + 330];
      const sideOffsets = [0, 82 * side, -82 * side, 148 * side, -148 * side];

      for (const distance of distances) {
        for (const sideOffset of sideOffsets) {
          const x = point.x + Math.cos(approachAngle) * distance + Math.cos(approachAngle + Math.PI / 2) * sideOffset;
          const y = point.y + Math.sin(approachAngle) * distance + Math.sin(approachAngle + Math.PI / 2) * sideOffset;
          const candidate = this.clampWorldPoint(x, y, 45);
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

      const fallback = this.clampWorldPoint(
        point.x + Math.cos(approachAngle) * (point.radius + 220),
        point.y + Math.sin(approachAngle) * (point.radius + 220),
        45
      );
      return {
        ...fallback,
        stopDistance: 82,
        final: true,
        overwatch: true
      };
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
