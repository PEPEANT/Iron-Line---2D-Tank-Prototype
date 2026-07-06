"use strict";

(function registerTacticalMap(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const {
    clamp,
    distXY,
    angleTo,
    normalizeAngle,
    expandedRect,
    lineIntersectsRect,
    segmentDistanceToPoint
  } = IronLine.math;

  const COVER_SAMPLE_OFFSET = 38;
  const OBJECTIVE_STAGING_RADIUS = 340;
  const OBJECTIVE_RALLY_RADIUS = 460;

  class TacticalMap {
    constructor(game) {
      this.game = game;
      this.version = 0;
      this.rebuildTimer = 0;
      this.signature = "";
      this.coverNodes = [];
      this.stagingPoints = [];
      this.vehicleStagingPoints = [];
      this.rallyPoints = [];
      this.trafficHints = [];
      this.bottlenecks = [];
      this.dangerZones = [];
      this.fireLanes = [];
      this.vehicleZones = [];
      this.vehicleStageTimer = 0;
      this.nodeById = new Map();
      this.coverNodeCache = new Map();
      this.coverNodeCacheContext = "";
      this.trafficHintsCache = [];
      this.trafficHintsCacheContext = "";
      this.rebuild("init");
    }

    update(dt = 0) {
      this.vehicleStageTimer -= dt;
      if (this.vehicleStageTimer <= 0) {
        this.vehicleStageTimer = 0.72;
        this.vehicleStagingPoints = this.buildVehicleStagingPoints();
      }
      this.rebuildTimer -= dt;
      if (this.rebuildTimer > 0) return false;
      this.rebuildTimer = 1.4;
      const signature = this.buildSignature();
      if (signature === this.signature) return false;
      this.rebuild("signature-change");
      return true;
    }

    rebuild(reason = "manual") {
      this.signature = this.buildSignature();
      const blockers = this.blockers();
      this.coverNodes = this.buildCoverNodes(blockers, this.coverCacheContext());
      this.stagingPoints = this.buildStagingPoints();
      this.vehicleStagingPoints = this.buildVehicleStagingPoints();
      this.rallyPoints = this.buildRallyPoints();
      this.trafficHints = this.buildTrafficHints(blockers);
      this.bottlenecks = this.trafficHints.filter((hint) => hint.kind === "bottleneck");
      this.dangerZones = this.buildDangerZones();
      this.fireLanes = this.buildFireLanes();
      this.vehicleZones = this.buildVehicleZones();
      this.nodeById = new Map(this.coverNodes.map((node) => [node.id, node]));
      this.version += 1;
      this.lastReason = reason;
      this.lastBuiltAt = Date.now();
      return this;
    }

    buildSignature() {
      const world = this.game?.world || {};
      const metadata = this.mapMetadata();
      const obstacles = (world.obstacles || []).map((item) => `${item.id || ""}:${item.x}:${item.y}:${item.w}:${item.h}:${item.destroyed ? 1 : 0}`).join("|");
      const scenery = (world.scenery || []).map((item) => `${item.id || item.kind || ""}:${item.x}:${item.y}:${item.w || item.r || 0}:${item.h || 0}:${item.destroyed ? 1 : 0}`).join("|");
      const wrecks = [...(this.game?.tanks || []), ...(this.game?.humvees || [])]
        .filter((vehicle) => vehicle && (!vehicle.alive || vehicle.hp <= 0 || vehicle.destructionPending) && !vehicle.coverDestroyed)
        .map((vehicle) => `${vehicle.callSign}:${Math.round(vehicle.x)}:${Math.round(vehicle.y)}:${vehicle.coverDestroyed ? 1 : 0}`)
        .join("|");
      return [
        metadata.mapId,
        metadata.mapVersion,
        world.width,
        world.height,
        (world.capturePoints || []).length,
        (world.navGraph?.nodes || []).length,
        JSON.stringify(world.tacticalTags || {}),
        obstacles,
        scenery,
        wrecks
      ].join("::");
    }

    blockers() {
      return IronLine.physics?.coverBlockers?.(this.game, {
        includeScenery: true,
        includeWrecks: true
      }) || this.game?.world?.obstacles || [];
    }

    buildCoverNodes(blockers = this.blockers(), cacheContext = this.coverCacheContext()) {
      const nodes = [];
      if (this.coverNodeCacheContext !== cacheContext) {
        this.coverNodeCache.clear();
        this.coverNodeCacheContext = cacheContext;
      }
      for (let blockerIndex = 0; blockerIndex < blockers.length; blockerIndex += 1) {
        const blocker = blockers[blockerIndex];
        if (!this.rectLike(blocker)) continue;
        const cacheKey = this.coverNodeCacheKey(blocker, cacheContext);
        if (cacheKey && this.coverNodeCache.has(cacheKey)) {
          nodes.push(...this.coverNodeCache.get(cacheKey).map((node) => this.cloneCoverNode(node)));
          continue;
        }
        const blockerNodes = [];
        const samples = this.coverSamplesForBlocker(blocker);
        const center = this.rectCenter(blocker);
        for (let index = 0; index < samples.length; index += 1) {
          const sample = samples[index];
          const accessible = this.pointPassable(sample.x, sample.y, 18);
          if (!accessible) continue;
          const defenseAngle = angleTo(sample.x, sample.y, center.x, center.y);
          const fireDirections = this.openFireDirections(sample, 520);
          const nearestObjective = this.nearestObjectiveName(sample);
          blockerNodes.push({
            id: `cover:${blocker.source?.id || blocker.source?.callSign || blocker.kind || "blocker"}:${blockerIndex}:${index}`,
            kind: "cover",
            x: sample.x,
            y: sample.y,
            sourceKind: blocker.kind || "obstacle",
            sourceId: blocker.source?.id || blocker.source?.callSign || "",
            sourceRect: { x: blocker.x, y: blocker.y, w: blocker.w, h: blocker.h },
            defenseAngle,
            defenseArc: 1.18,
            capacity: this.coverCapacity(blocker),
            exposureRisk: this.exposureRisk(sample, blocker),
            accessible,
            fireDirections,
            nearestObjective,
            tags: this.coverTags(blocker, sample, nearestObjective)
          });
        }
        nodes.push(...blockerNodes);
        if (cacheKey) this.coverNodeCache.set(cacheKey, blockerNodes.map((node) => this.cloneCoverNode(node)));
      }
      for (const tag of this.manualTags("coverNodes")) {
        const sourceRect = tag.sourceRect || { x: tag.x - 20, y: tag.y - 20, w: 40, h: 40 };
        nodes.push({
          id: tag.id || `cover:manual:${nodes.length}`,
          kind: "cover",
          x: tag.x,
          y: tag.y,
          sourceKind: tag.sourceKind || "manual",
          sourceId: tag.sourceId || tag.id || "",
          sourceRect,
          defenseAngle: Number.isFinite(tag.defenseAngle) ? tag.defenseAngle : angleTo(tag.x, tag.y, sourceRect.x + sourceRect.w / 2, sourceRect.y + sourceRect.h / 2),
          defenseArc: tag.defenseArc || 1.18,
          capacity: tag.capacity || 2,
          exposureRisk: Number.isFinite(tag.exposureRisk) ? clamp(tag.exposureRisk, 0, 1) : this.pointRisk(tag),
          accessible: tag.accessible !== false && this.pointPassable(tag.x, tag.y, 18),
          fireDirections: tag.fireDirections || this.openFireDirections(tag, 520),
          nearestObjective: tag.objectiveName || this.nearestObjectiveName(tag),
          tags: ["manual", ...(tag.tags || [])],
          manual: true
        });
      }
      return nodes;
    }

    coverCacheContext() {
      const world = this.game?.world || {};
      const metadata = this.mapMetadata();
      const objectives = (this.game?.capturePoints || [])
        .map((point) => `${point.name || ""}:${Math.round(point.x)}:${Math.round(point.y)}:${Math.round(point.radius || 0)}`)
        .join("|");
      const roads = (world.roads || [])
        .map((road) => road.map((point) => `${Math.round(point.x)}:${Math.round(point.y)}`).join(","))
        .join("|");
      return [metadata.mapId, metadata.mapVersion, world.width, world.height, objectives, roads].join("::");
    }

    coverNodeCacheKey(blocker, cacheContext = this.coverNodeCacheContext) {
      if (!blocker || blocker.kind === "vehicle-wreck") return "";
      return [
        cacheContext,
        blocker.kind || "",
        blocker.source?.id || blocker.source?.callSign || blocker.source?.kind || "",
        Math.round(Number(blocker.x) || 0),
        Math.round(Number(blocker.y) || 0),
        Math.round(Number(blocker.w) || 0),
        Math.round(Number(blocker.h) || 0),
        blocker.source?.destroyed ? 1 : 0
      ].join("::");
    }

    cloneCoverNode(node) {
      return {
        ...node,
        sourceRect: node.sourceRect ? { ...node.sourceRect } : node.sourceRect,
        fireDirections: [...(node.fireDirections || [])],
        tags: [...(node.tags || [])]
      };
    }

    coverSamplesForBlocker(blocker) {
      const offset = COVER_SAMPLE_OFFSET;
      const left = blocker.x - offset;
      const right = blocker.x + blocker.w + offset;
      const top = blocker.y - offset;
      const bottom = blocker.y + blocker.h + offset;
      return [
        { x: left, y: blocker.y + blocker.h * 0.22, side: "west" },
        { x: left, y: blocker.y + blocker.h * 0.5, side: "west" },
        { x: left, y: blocker.y + blocker.h * 0.78, side: "west" },
        { x: right, y: blocker.y + blocker.h * 0.22, side: "east" },
        { x: right, y: blocker.y + blocker.h * 0.5, side: "east" },
        { x: right, y: blocker.y + blocker.h * 0.78, side: "east" },
        { x: blocker.x + blocker.w * 0.25, y: top, side: "north" },
        { x: blocker.x + blocker.w * 0.75, y: top, side: "north" },
        { x: blocker.x + blocker.w * 0.25, y: bottom, side: "south" },
        { x: blocker.x + blocker.w * 0.75, y: bottom, side: "south" }
      ];
    }

    coverCapacity(blocker) {
      const size = Math.max(Number(blocker.w) || 0, Number(blocker.h) || 0);
      if (blocker.kind === "vehicle-wreck") return 2;
      if (size >= 340) return 4;
      if (size >= 180) return 3;
      return 2;
    }

    coverTags(blocker, point, nearestObjective = this.nearestObjectiveName(point)) {
      const tags = [blocker.kind || "cover"];
      if (this.nearRoad(point, 120)) tags.push("roadside");
      if (nearestObjective) tags.push("objective-cover");
      if (blocker.kind === "vehicle-wreck") tags.push("dynamic");
      return tags;
    }

    exposureRisk(point, blocker = null) {
      let visibleObjectives = 0;
      for (const objective of this.game?.capturePoints || []) {
        if (distXY(point.x, point.y, objective.x, objective.y) > 920) continue;
        if (this.lineOpen(point.x, point.y, objective.x, objective.y, 3)) visibleObjectives += 1;
      }
      let openDirections = 0;
      const directions = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      for (const angle of directions) {
        const x = point.x + Math.cos(angle) * 420;
        const y = point.y + Math.sin(angle) * 420;
        if (this.lineOpen(point.x, point.y, x, y, 2, blocker)) openDirections += 1;
      }
      return clamp(visibleObjectives * 0.18 + openDirections * 0.14, 0, 1);
    }

    openFireDirections(point, range = 520) {
      const directions = [];
      const steps = [
        ["east", 0],
        ["south", Math.PI / 2],
        ["west", Math.PI],
        ["north", -Math.PI / 2],
        ["south-east", Math.PI / 4],
        ["south-west", Math.PI * 3 / 4],
        ["north-west", -Math.PI * 3 / 4],
        ["north-east", -Math.PI / 4]
      ];
      for (const [name, angle] of steps) {
        const x = point.x + Math.cos(angle) * range;
        const y = point.y + Math.sin(angle) * range;
        if (this.lineOpen(point.x, point.y, x, y, 2)) directions.push(name);
      }
      return directions;
    }

    buildStagingPoints() {
      const points = [];
      const world = this.game?.world || {};
      for (const team of ["blue", "red"]) {
        const exit = world.baseExitPoints?.[team];
        if (exit) {
          points.push({
            id: `stage:${team}:base-exit`,
            kind: "base-exit",
            team,
            x: exit.x,
            y: exit.y,
            radius: exit.radius || 120,
            purpose: "base-egress",
            risk: this.pointRisk(exit)
          });
        }
      }

      for (const objective of this.game?.capturePoints || []) {
        for (const team of ["blue", "red"]) {
          const base = this.teamBasePoint(team);
          const angle = base ? angleTo(objective.x, objective.y, base.x, base.y) : (team === "blue" ? Math.PI : 0);
          const side = team === "blue" ? -1 : 1;
          const samples = [
            { distance: OBJECTIVE_STAGING_RADIUS, lateral: 0, purpose: "objective-approach" },
            { distance: OBJECTIVE_STAGING_RADIUS + 70, lateral: 105 * side, purpose: "flank-entry" },
            { distance: OBJECTIVE_STAGING_RADIUS + 70, lateral: -105 * side, purpose: "flank-entry" }
          ];
          for (let index = 0; index < samples.length; index += 1) {
            const sample = samples[index];
            const raw = {
              x: objective.x + Math.cos(angle) * sample.distance + Math.cos(angle + Math.PI / 2) * sample.lateral,
              y: objective.y + Math.sin(angle) * sample.distance + Math.sin(angle + Math.PI / 2) * sample.lateral
            };
            const point = this.safePointNear(raw, 28, 74);
            if (!point) continue;
            points.push({
              id: `stage:${team}:${objective.name}:${index}`,
              kind: sample.purpose,
              team,
              objectiveName: objective.name,
              x: point.x,
              y: point.y,
              radius: 92,
              approachAngle: angle,
              risk: this.pointRisk(point)
            });
          }
        }
      }
      for (const tag of this.manualTags("stagingPoints")) {
        points.push({
          id: tag.id || `stage:manual:${points.length}`,
          kind: tag.kind || "manual-staging",
          team: tag.team || "",
          objectiveName: tag.objectiveName || "",
          x: tag.x,
          y: tag.y,
          radius: tag.radius || 90,
          purpose: tag.purpose || "manual-tag",
          approachAngle: tag.approachAngle || 0,
          risk: Number.isFinite(tag.risk) ? clamp(tag.risk, 0, 1) : this.pointRisk(tag),
          manual: true
        });
      }
      return points;
    }

    buildVehicleStagingPoints() {
      const points = [];
      const vehicles = [...(this.game?.tanks || []), ...(this.game?.humvees || [])];
      for (let index = 0; index < vehicles.length; index += 1) {
        const vehicle = vehicles[index];
        if (!vehicle || vehicle.alive === false || vehicle.hp <= 0 || vehicle.destructionPending) continue;
        if (vehicle.isOperational && !vehicle.isOperational()) continue;
        const angle = vehicle.angle || 0;
        const distance = (vehicle.radius || 34) + 104;
        const raw = {
          x: vehicle.x - Math.cos(angle) * distance,
          y: vehicle.y - Math.sin(angle) * distance
        };
        const point = this.safePointNear(raw, 22, 68);
        if (!point) continue;
        points.push({
          id: `stage:vehicle:${vehicle.callSign || index}:behind`,
          kind: "vehicle-behind-wait",
          team: vehicle.team || "",
          vehicleId: vehicle.callSign || "",
          vehicleKind: vehicle.passengerCapacity ? "humvee" : "tank",
          x: point.x,
          y: point.y,
          radius: 76,
          purpose: "vehicle-behind-wait",
          approachAngle: angle,
          risk: this.pointRisk(point),
          dynamic: true
        });
      }
      return points;
    }

    buildRallyPoints() {
      const points = [];
      const graphNodes = this.game?.navGraph?.nodes || [];
      for (const node of graphNodes) {
        if (node.generated) continue;
        const nearestObjective = this.nearestObjectiveName(node);
        const objective = nearestObjective ? this.objectiveByName(nearestObjective) : null;
        if (objective && distXY(node.x, node.y, objective.x, objective.y) <= OBJECTIVE_RALLY_RADIUS) {
          points.push({
            id: `rally:${nearestObjective}:${node.id}`,
            kind: "objective-rally",
            objectiveName: nearestObjective,
            x: node.x,
            y: node.y,
            radius: 86,
            risk: this.pointRisk(node),
            roadLinked: this.nearRoad(node, 130)
          });
        }
      }

      for (const point of this.stagingPoints) {
        if (point.kind === "base-exit") continue;
        points.push({
          id: `rally:${point.id}`,
          kind: "staging-rally",
          team: point.team,
          objectiveName: point.objectiveName || "",
          x: point.x,
          y: point.y,
          radius: Math.max(80, point.radius || 80),
          risk: point.risk || 0
        });
      }
      return points;
    }

    buildTrafficHints(blockers = this.blockers()) {
      const context = this.signature || this.buildSignature();
      if (context && this.trafficHintsCacheContext === context) return this.trafficHintsCache.slice();
      const hints = [];
      const blockerList = Array.isArray(blockers) ? blockers : [];
      const graph = this.game?.navGraph;
      if (graph?.edges?.length) {
        for (const edge of graph.edges) {
          const from = graph.nodeById.get(edge[0]);
          const to = graph.nodeById.get(edge[1]);
          if (!from || !to) continue;
          const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
          const length = distXY(from.x, from.y, to.x, to.y);
          const traffic = this.trafficMetricsForPoint(mid, blockerList);
          const clearance = traffic.clearance;
          if (traffic.nearbyBlockers < 2 && clearance > 155 && length > 290) continue;
          hints.push({
            id: `traffic:${from.id}:${to.id}`,
            kind: "bottleneck",
            x: mid.x,
            y: mid.y,
            from: from.id,
            to: to.id,
            widthHint: clearance,
            waitRadius: 130,
            priority: clearance < 120 ? 3 : 2,
            reason: traffic.nearbyBlockers >= 2 ? "cover-constrained" : "narrow-clearance"
          });
        }
      }

      const world = this.game?.world || {};
      for (const team of ["blue", "red"]) {
        const spawns = [
          ...(world.spawns?.[team] || []),
          ...(team === "blue" ? [world.spawns?.playerTank].filter(Boolean) : [])
        ];
        for (let index = 0; index < spawns.length; index += 1) {
          const spawn = spawns[index];
          hints.push({
            id: `traffic:${team}:spawn:${index}`,
            kind: "spawn-spacing",
            team,
            x: spawn.x,
            y: spawn.y,
            waitRadius: 150,
            priority: 2,
            reason: "spawn-overlap-risk"
          });
        }
      }
      for (const tag of this.manualTags("trafficHints")) {
        hints.push({
          id: tag.id || `traffic:manual:${hints.length}`,
          kind: tag.kind || "manual-traffic",
          team: tag.team || "",
          x: tag.x,
          y: tag.y,
          waitRadius: tag.waitRadius || 130,
          priority: tag.priority || 2,
          reason: tag.reason || "manual-tag",
          manual: true
        });
      }
      this.trafficHintsCacheContext = context;
      this.trafficHintsCache = hints.slice();
      return hints;
    }

    trafficMetricsForPoint(point, blockers = this.blockers()) {
      const blockerList = Array.isArray(blockers) ? blockers : [];
      let nearbyBlockers = 0;
      let clearance = 280;
      for (const blocker of blockerList) {
        const distance = this.distanceToRect(point, blocker);
        if (distance <= 180) nearbyBlockers += 1;
        if (distance < clearance) clearance = distance;
      }
      return {
        nearbyBlockers,
        clearance: Math.round(clearance)
      };
    }

    buildDangerZones() {
      const zones = [];
      for (const objective of this.game?.capturePoints || []) {
        zones.push({
          id: `danger:objective:${objective.name}`,
          kind: "objective-crossfire",
          objectiveName: objective.name,
          x: objective.x,
          y: objective.y,
          radius: (objective.radius || 150) + 210,
          risk: 0.72
        });
      }
      for (const lane of this.buildFireLanes()) {
        zones.push({
          id: `danger:lane:${lane.id}`,
          kind: "open-fire-lane",
          x: lane.midX,
          y: lane.midY,
          radius: Math.min(260, Math.max(120, lane.length * 0.18)),
          risk: 0.5
        });
      }
      for (const tag of this.manualTags("dangerZones")) {
        zones.push({
          id: tag.id || `danger:manual:${zones.length}`,
          kind: tag.kind || "manual-danger",
          objectiveName: tag.objectiveName || "",
          x: tag.x,
          y: tag.y,
          radius: tag.radius || 160,
          risk: Number.isFinite(tag.risk) ? clamp(tag.risk, 0, 1) : 0.5,
          manual: true
        });
      }
      return zones;
    }

    buildFireLanes() {
      const lanes = [];
      const roads = this.game?.world?.roads || [];
      for (let roadIndex = 0; roadIndex < roads.length; roadIndex += 1) {
        const road = roads[roadIndex] || [];
        for (let index = 1; index < road.length; index += 1) {
          const a = road[index - 1];
          const b = road[index];
          const length = distXY(a.x, a.y, b.x, b.y);
          if (length < 460) continue;
          if (!this.lineOpen(a.x, a.y, b.x, b.y, 2)) continue;
          lanes.push({
            id: `${roadIndex}:${index}`,
            kind: "road-fire-lane",
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            midX: (a.x + b.x) / 2,
            midY: (a.y + b.y) / 2,
            length,
            exposure: clamp(length / 960, 0.35, 1)
          });
        }
      }
      return lanes;
    }

    buildVehicleZones() {
      return this.trafficHints.map((hint) => ({
        id: `vehicle:${hint.id}`,
        kind: hint.kind === "bottleneck" ? "vehicle-wait" : "vehicle-spacing",
        x: hint.x,
        y: hint.y,
        radius: hint.waitRadius || 120,
        priority: hint.priority || 1,
        reason: hint.reason || ""
      }));
    }

    bestCoverNodeFor(unit, threat, options = {}) {
      if (!unit || !threat) return null;
      const maxDistance = options.maxDistance || 460;
      let best = null;
      let bestScore = Infinity;
      for (const node of this.coverNodes) {
        if (!node.accessible) continue;
        const distance = distXY(unit.x, unit.y, node.x, node.y);
        if (distance > maxDistance) continue;
        if (options.requireAvailable !== false && this.game?.coverSlots && !this.game.coverSlots.isAvailable(unit, node)) continue;
        const covered = lineIntersectsRect(threat.x, threat.y, node.x, node.y, expandedRect(node.sourceRect, 5));
        if (!covered && options.requireCovered !== false) continue;
        const fireScore = node.fireDirections.length / 8;
        const objectiveBias = node.nearestObjective === options.objectiveName ? -42 : 0;
        const score = distance + node.exposureRisk * 120 - fireScore * 38 + objectiveBias;
        if (score < bestScore) {
          best = {
            ...node,
            stopDistance: 14,
            final: false,
            cover: true,
            coverNodeId: node.id,
            coverQuality: Math.round((1 - node.exposureRisk) * 55 + fireScore * 35 + (covered ? 18 : 0)),
            coverMetrics: {
              tacticalNode: true,
              exposure: node.exposureRisk,
              fire: fireScore,
              covered: covered ? 1 : 0
            }
          };
          bestScore = score;
        }
      }
      return best;
    }

    stagingPointForObjective(team, objective, options = {}) {
      const name = typeof objective === "string" ? objective : objective?.name;
      const from = options.from || null;
      const kind = options.kind || "";
      const candidates = this.stagingPoints.filter((point) => (
        (!team || !point.team || point.team === team) &&
        (!name || point.objectiveName === name) &&
        (!kind || point.kind === kind)
      ));
      return this.nearestPoint(candidates, from || this.teamBasePoint(team) || objective, options);
    }

    rallyPointFor(team, point, options = {}) {
      const objectiveName = options.objectiveName || point?.name || "";
      const candidates = this.rallyPoints.filter((item) => (
        (!objectiveName || !item.objectiveName || item.objectiveName === objectiveName) &&
        (!team || !item.team || item.team === team)
      ));
      return this.nearestPoint(candidates, point, options);
    }

    vehicleHintNear(point, options = {}) {
      return this.nearestPoint(this.trafficHints, point, {
        maxDistance: options.maxDistance || 360,
        ...options
      });
    }

    summary() {
      const metadata = this.mapMetadata();
      return {
        mapId: metadata.mapId,
        mapVersion: metadata.mapVersion,
        version: this.version,
        reason: this.lastReason || "",
        coverNodes: this.coverNodes.length,
        stagingPoints: this.stagingPoints.length,
        rallyPoints: this.rallyPoints.length,
        trafficHints: this.trafficHints.length,
        bottlenecks: this.bottlenecks.length,
        dangerZones: this.dangerZones.length,
        fireLanes: this.fireLanes.length,
        vehicleZones: this.vehicleZones.length,
        vehicleStagingPoints: this.vehicleStagingPoints.length,
        manualTags: this.manualTagCount()
      };
    }

    debugSnapshot(limit = 80) {
      return {
        ...this.summary(),
        coverNodes: this.coverNodes.slice(0, limit),
        stagingPoints: this.stagingPoints.slice(0, 32),
        vehicleStagingPoints: this.vehicleStagingPoints.slice(0, 32),
        rallyPoints: this.rallyPoints.slice(0, 32),
        trafficHints: this.trafficHints.slice(0, 32),
        dangerZones: this.dangerZones.slice(0, 16),
        fireLanes: this.fireLanes.slice(0, 16)
      };
    }

    nearestPoint(points, origin, options = {}) {
      if (!points?.length || !origin) return null;
      const maxDistance = options.maxDistance || Infinity;
      return points
        .map((point) => ({ point, distance: distXY(origin.x, origin.y, point.x, point.y) }))
        .filter((item) => item.distance <= maxDistance)
        .sort((a, b) => {
          const riskA = Number(a.point.risk) || 0;
          const riskB = Number(b.point.risk) || 0;
          return (a.distance + riskA * 140) - (b.distance + riskB * 140);
        })[0]?.point || null;
    }

    pointRisk(point) {
      if (!point) return 0;
      let risk = 0;
      for (const objective of this.game?.capturePoints || []) {
        const distance = distXY(point.x, point.y, objective.x, objective.y);
        if (distance < (objective.radius || 150) + 160) risk += 0.3;
      }
      for (const lane of this.fireLanes || []) {
        const distance = segmentDistanceToPoint(lane.x1, lane.y1, lane.x2, lane.y2, point.x, point.y);
        if (distance < 115) risk += 0.22;
      }
      return clamp(risk, 0, 1);
    }

    nearestObjectiveName(point) {
      if (!point) return "";
      const objective = (this.game?.capturePoints || [])
        .map((item) => ({ item, distance: distXY(point.x, point.y, item.x, item.y) }))
        .sort((a, b) => a.distance - b.distance)[0];
      return objective && objective.distance <= 780 ? objective.item.name : "";
    }

    objectiveByName(name) {
      return (this.game?.capturePoints || []).find((point) => point.name === name) || null;
    }

    teamBasePoint(team) {
      const zone = (this.game?.world?.safeZones || []).find((item) => item.team === team);
      if (zone) return zone;
      return this.game?.world?.baseExitPoints?.[team] || null;
    }

    safePointNear(point, radius = 22, margin = 64) {
      const world = this.game?.world || {};
      const preferred = {
        x: clamp(point.x, margin, (world.width || point.x) - margin),
        y: clamp(point.y, margin, (world.height || point.y) - margin)
      };
      if (this.pointPassable(preferred.x, preferred.y, radius)) return preferred;
      for (const distance of [44, 72, 108, 148]) {
        for (let step = 0; step < 10; step += 1) {
          const angle = step * Math.PI * 2 / 10;
          const candidate = {
            x: clamp(preferred.x + Math.cos(angle) * distance, margin, (world.width || preferred.x) - margin),
            y: clamp(preferred.y + Math.sin(angle) * distance, margin, (world.height || preferred.y) - margin)
          };
          if (this.pointPassable(candidate.x, candidate.y, radius)) return candidate;
        }
      }
      return null;
    }

    mapMetadata() {
      const world = this.game?.world || {};
      return {
        mapId: world.mapId || world.id || "map01",
        mapVersion: String(world.mapVersion || world.version || "")
      };
    }

    manualTags(kind) {
      const tags = this.game?.world?.tacticalTags?.[kind] || [];
      return tags.filter((tag) => Number.isFinite(tag?.x) && Number.isFinite(tag?.y));
    }

    manualTagCount() {
      const tags = this.game?.world?.tacticalTags || {};
      return Object.values(tags).reduce((total, list) => total + (Array.isArray(list) ? list.length : 0), 0);
    }

    pointPassable(x, y, radius = 18) {
      const world = this.game?.world || {};
      const margin = radius + 3;
      if (x < margin || y < margin || x > (world.width || 0) - margin || y > (world.height || 0) - margin) return false;
      if (IronLine.physics?.circleBlockedByWorld) {
        return !IronLine.physics.circleBlockedByWorld(this.game, null, x, y, radius, {
          blockTanks: false,
          blockWrecks: true,
          blockScenery: true,
          padding: 4
        });
      }
      return !(world.obstacles || []).some((obstacle) => IronLine.math.circleRectCollision(x, y, radius, obstacle));
    }

    lineOpen(x1, y1, x2, y2, padding = 0, ignoreBlocker = null) {
      if (IronLine.physics?.lineBlockedByWorld) {
        return !IronLine.physics.lineBlockedByWorld(this.game, x1, y1, x2, y2, {
          padding,
          includeScenery: true,
          includeWrecks: true,
          ignore: ignoreBlocker?.source ? [ignoreBlocker.source] : []
        });
      }
      return !(this.game?.world?.obstacles || []).some((obstacle) => lineIntersectsRect(x1, y1, x2, y2, expandedRect(obstacle, padding)));
    }

    rectLike(item) {
      return Number.isFinite(item?.x) && Number.isFinite(item?.y) && Number.isFinite(item?.w) && Number.isFinite(item?.h);
    }

    rectCenter(rect) {
      return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    }

    distanceToRect(point, rect) {
      const x = clamp(point.x, rect.x, rect.x + rect.w);
      const y = clamp(point.y, rect.y, rect.y + rect.h);
      return distXY(point.x, point.y, x, y);
    }

    estimatedClearance(point, blockers = this.blockers()) {
      const blockerList = Array.isArray(blockers) ? blockers : [];
      let best = 280;
      for (const blocker of blockerList) {
        best = Math.min(best, this.distanceToRect(point, blocker));
      }
      return Math.round(best);
    }

    nearRoad(point, maxDistance = 120) {
      for (const road of this.game?.world?.roads || []) {
        for (let index = 1; index < road.length; index += 1) {
          const a = road[index - 1];
          const b = road[index];
          if (segmentDistanceToPoint(a.x, a.y, b.x, b.y, point.x, point.y) <= maxDistance) return true;
        }
      }
      return false;
    }
  }

  IronLine.TacticalMap = TacticalMap;
})(window);
