"use strict";

(function registerSquadTacticalMap(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const proto = IronLine.SquadAI?.prototype;
  if (!proto || proto.__tacticalMapBehaviorPatch) return;

  const { clamp, distXY } = IronLine.math;

  const originalComputeStatus = proto.computeStatus;
  const originalChooseTacticalMode = proto.chooseTacticalMode;
  const originalFindFallbackCoverPoint = proto.findFallbackCoverPoint;
  const originalFindHoldWallCoverPoint = proto.findHoldWallCoverPoint;
  const originalRallyWithTankPoint = proto.rallyWithTankPoint;

  proto.tacticalRiskAt = function tacticalRiskAt(point) {
    if (!point) return 0;
    const risk = Number(this.game.tacticalMap?.pointRisk?.(point) || 0);
    const zoneRisk = (this.game.tacticalMap?.dangerZones || []).reduce((best, zone) => {
      const distance = distXY(point.x, point.y, zone.x, zone.y);
      if (distance > (zone.radius || 0)) return best;
      const pressure = clamp(1 - distance / Math.max(zone.radius || 1, 1), 0, 1);
      return Math.max(best, pressure * Number(zone.risk || 0.5));
    }, 0);
    return clamp(Math.max(risk, zoneRisk), 0, 1);
  };

  proto.nearestTacticalDangerZone = function nearestTacticalDangerZone(point) {
    if (!point) return null;
    return (this.game.tacticalMap?.dangerZones || [])
      .map((zone) => ({ zone, distance: distXY(point.x, point.y, zone.x, zone.y) }))
      .filter((item) => item.distance <= (item.zone.radius || 0) + 80)
      .sort((a, b) => a.distance - b.distance)[0]?.zone || null;
  };

  proto.squadTacticalCoverPoint = function squadTacticalCoverPoint(status, threat, name, options = {}) {
    const origin = status?.center || this.leaderUnit?.() || this.order?.point;
    if (!origin || !threat) return null;
    const node = this.game.tacticalMap?.bestCoverNodeFor?.(origin, threat, {
      maxDistance: options.maxDistance || 520,
      objectiveName: this.order?.objectiveName || this.order?.point?.name || "",
      requireAvailable: false,
      requireCovered: options.requireCovered !== false
    });
    if (!node) return null;
    return {
      name,
      x: node.x,
      y: node.y,
      radius: options.radius || 78,
      tacticalMapId: node.coverNodeId || node.id || "",
      tacticalMapKind: "cover-node",
      tacticalRisk: Number(node.coverMetrics?.exposure ?? node.exposureRisk ?? 0),
      coverQuality: node.coverQuality || 0
    };
  };

  proto.computeStatus = function computeStatusWithTacticalMap() {
    const status = originalComputeStatus.call(this);
    const dangerZone = this.nearestTacticalDangerZone(status.center);
    status.tacticalRisk = this.tacticalRiskAt(status.center);
    status.tacticalDangerZoneId = dangerZone?.id || "";
    return status;
  };

  proto.chooseTacticalMode = function chooseTacticalModeWithTacticalMap(status) {
    const original = originalChooseTacticalMode.call(this, status);
    if (this.commandSource === "player" && this.commandLockActive?.()) return original;
    if (["fallback", "regroup", "hold-wall", "support-fire"].includes(original)) return original;

    const risk = Number(status?.tacticalRisk ?? this.tacticalRiskAt(status?.center));
    const pressure = Number(status?.avgSuppression || 0) >= 22 ||
      Number(status?.casualtyRatio || 0) >= 0.18 ||
      Boolean(status?.lastThreat);
    if (risk >= 0.56 && pressure && original === "advance") return "support-fire";
    if (risk >= 0.76 && pressure && original === "pre-assault") return "support-fire";
    return original;
  };

  proto.findFallbackCoverPoint = function findFallbackCoverPointWithTacticalMap(status, threat) {
    const tactical = this.squadTacticalCoverPoint(status, threat, `${this.order?.objectiveName || "objective"}-fallback-cover`, {
      maxDistance: 560,
      radius: 82
    });
    if (tactical) return tactical;
    return originalFindFallbackCoverPoint.call(this, status, threat);
  };

  proto.findHoldWallCoverPoint = function findHoldWallCoverPointWithTacticalMap(point, threat, status) {
    const tactical = this.squadTacticalCoverPoint(status, threat, `${this.order?.objectiveName || point?.name || "objective"}-hold-wall`, {
      maxDistance: (point?.radius || 150) + 420,
      radius: 76
    });
    if (tactical && (!point || distXY(tactical.x, tactical.y, point.x, point.y) <= (point.radius || 150) + 330)) return tactical;
    return originalFindHoldWallCoverPoint.call(this, point, threat, status);
  };

  proto.rallyWithTankPoint = function rallyWithTankPointWithTacticalMap(status) {
    const tank = status?.friendlyTank?.vehicle;
    const center = status?.center;
    const stage = tank
      ? (this.game.tacticalMap?.vehicleStagingPoints || []).find((point) => point.vehicleId === tank.callSign)
      : null;
    if (stage && (!center || distXY(center.x, center.y, stage.x, stage.y) <= 460)) {
      return {
        name: `${this.order?.objectiveName || "objective"}-rally`,
        x: stage.x,
        y: stage.y,
        radius: stage.radius || 88,
        tacticalMapId: stage.id,
        tacticalMapKind: "vehicle-stage",
        tacticalRisk: Number(stage.risk || 0)
      };
    }
    return originalRallyWithTankPoint.call(this, status);
  };

  proto.__tacticalMapBehaviorPatch = true;
})(window);
