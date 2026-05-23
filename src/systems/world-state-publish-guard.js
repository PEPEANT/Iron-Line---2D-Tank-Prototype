"use strict";

(function registerWorldStatePublishGuard(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const FORCE_PUBLISH_MS = 1800;
  const POSITION_DELTA_PX = 10;
  const ANGLE_DELTA_RAD = 0.22;
  const PROGRESS_DELTA = 0.02;

  function finiteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function angleDelta(a, b) {
    const twoPi = Math.PI * 2;
    let diff = Math.abs(finiteNumber(a, 0) - finiteNumber(b, 0)) % twoPi;
    if (diff > Math.PI) diff = twoPi - diff;
    return diff;
  }

  function byId(items = []) {
    return new Map((items || []).map((item) => [item.id, item]).filter(([id]) => id));
  }

  function entityChanged(previousItems = [], nextItems = [], kind = "unit") {
    if ((previousItems || []).length !== (nextItems || []).length) return true;
    const previousById = byId(previousItems);
    for (const next of nextItems || []) {
      const previous = previousById.get(next.id);
      if (!previous) return true;
      if (previous.team !== next.team || previous.alive !== next.alive) return true;
      if (kind === "vehicle" && previous.controllerId !== next.controllerId) return true;
      if (kind === "unit" && previous.inVehicle !== next.inVehicle) return true;
      if (Math.abs((Number(previous.hp) || 0) - (Number(next.hp) || 0)) >= 0.5) return true;
      if (Math.abs((Number(previous.maxHp) || 0) - (Number(next.maxHp) || 0)) >= 0.5) return true;
      if (Math.hypot((Number(next.x) || 0) - (Number(previous.x) || 0), (Number(next.y) || 0) - (Number(previous.y) || 0)) >= POSITION_DELTA_PX) return true;
      if (angleDelta(previous.angle, next.angle) >= ANGLE_DELTA_RAD) return true;
      if (kind === "vehicle" && (
        angleDelta(previous.turretAngle, next.turretAngle) >= ANGLE_DELTA_RAD ||
        angleDelta(previous.machineGunAngle, next.machineGunAngle) >= ANGLE_DELTA_RAD
      )) return true;
    }
    return false;
  }

  function captureChanged(previousItems = [], nextItems = []) {
    if ((previousItems || []).length !== (nextItems || []).length) return true;
    const previousById = byId(previousItems);
    for (const next of nextItems || []) {
      const previous = previousById.get(next.id);
      if (!previous) return true;
      if (previous.owner !== next.owner || previous.contested !== next.contested) return true;
      if (Math.abs((Number(previous.progress) || 0) - (Number(next.progress) || 0)) >= PROGRESS_DELTA) return true;
    }
    return false;
  }

  function shouldPublish(previous = null, next = null) {
    if (!next) return false;
    if (!previous) return true;
    if (previous.hostId !== next.hostId || previous.roomId !== next.roomId) return true;
    if (Date.now() - (Number(previous.updatedAt) || 0) >= FORCE_PUBLISH_MS) return true;
    return entityChanged(previous.vehicles, next.vehicles, "vehicle") ||
      entityChanged(previous.units, next.units, "unit") ||
      captureChanged(previous.capturePoints, next.capturePoints);
  }

  IronLine.WorldStatePublishGuard = { shouldPublish };
})(window);
