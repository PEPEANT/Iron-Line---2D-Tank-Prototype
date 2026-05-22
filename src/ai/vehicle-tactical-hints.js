"use strict";

(function registerVehicleTacticalHints(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { distXY } = IronLine.math || {};

  function installVehicleHintPatch(AIClass, vehicleKey) {
    const proto = AIClass?.prototype;
    if (!proto || proto.__tacticalVehicleHintPatch || typeof proto.handleTrafficHold !== "function") return;

    const originalHandleTrafficHold = proto.handleTrafficHold;
    proto.handleTrafficHold = function handleTrafficHoldWithTacticalMap(dt, vx, vy) {
      if (originalHandleTrafficHold.call(this, dt, vx, vy)) return true;
      return this.handleTacticalMapTrafficHold?.(dt, vx, vy) || false;
    };

    proto.handleTacticalMapTrafficHold = function handleTacticalMapTrafficHold(dt, vx, vy) {
      const vehicle = this[vehicleKey];
      if (!vehicle || !vehicle.alive || this.trafficBypassTimer > 0) return false;
      const probe = {
        x: vehicle.x + vx * ((vehicle.radius || 34) + 128),
        y: vehicle.y + vy * ((vehicle.radius || 34) + 128)
      };
      const hint = this.game.tacticalMap?.vehicleHintNear?.(probe, { maxDistance: 165 });
      if (!hint || !["bottleneck", "spawn-spacing"].includes(hint.kind)) return false;

      const blocker = this.tacticalHintOccupant(vehicle, hint);
      if (!blocker) return false;

      const blockerId = blocker.callSign || hint.id;
      this.trafficHoldTarget = hint.id;
      this.trafficHoldAge = Math.max(this.trafficHoldAge || 0, Number(dt) || 0);
      this.trafficHoldTimer = Math.max(this.trafficHoldTimer || 0, 0.52 + Math.min(0.34, (hint.priority || 1) * 0.08));
      if (this.debug) {
        this.debug.tacticalWaitForClear = hint.id;
        this.debug.tacticalTrafficBlocker = blockerId;
      }
      this.applyDrive(Number(dt) || 0, 0, 0);
      return true;
    };

    proto.tacticalHintOccupant = function tacticalHintOccupant(vehicle, hint) {
      const ownKey = this.vehicleYieldKey?.(vehicle) || String(vehicle.callSign || "");
      const vehicles = [...(this.game.tanks || []), ...(this.game.humvees || [])];
      return vehicles
        .filter((other) => (
          other !== vehicle &&
          other.alive &&
          other.team === vehicle.team &&
          distXY(other.x, other.y, hint.x, hint.y) <= (hint.waitRadius || 130)
        ))
        .map((other) => ({
          vehicle: other,
          key: this.vehicleYieldKey?.(other) || String(other.callSign || ""),
          distance: distXY(other.x, other.y, hint.x, hint.y)
        }))
        .filter((item) => item.key <= ownKey || item.distance < distXY(vehicle.x, vehicle.y, hint.x, hint.y) - 18)
        .sort((a, b) => a.distance - b.distance)[0]?.vehicle || null;
    };

    proto.__tacticalVehicleHintPatch = true;
  }

  installVehicleHintPatch(IronLine.TankAI, "tank");
  installVehicleHintPatch(IronLine.HumveeAI, "vehicle");
})(window);
