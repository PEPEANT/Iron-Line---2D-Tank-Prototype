"use strict";

(function registerOnlineWorldStateApply(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;
  const { clamp, distXY, lerp, normalizeAngle } = IronLine.math;

  IronLine.installOnlineWorldStateApply = function installOnlineWorldStateApply(Game) {
    Object.assign(Game.prototype, {
      applyOnlineWorldState(state = null, dt = 0) {
        if (!state || state.hostId === this.onlineSession?.playerId) return false;
        const updatedAt = Number(state.updatedAt) || 0;
        if (!updatedAt) return false;
        if (Date.now() - updatedAt > 7000) return false;
        if (updatedAt > (this.onlineWorldAppliedAt || 0)) {
          this.onlineWorldAppliedAt = updatedAt;
          this.onlineWorldInterpolationTarget = state;
          this.pushOnlineWorldStateSample(state, updatedAt);
        }
        const buffered = this.bufferedOnlineWorldState();
        if (buffered) return this.stepOnlineWorldInterpolation(buffered, dt, { buffered: true });
        return this.stepOnlineWorldInterpolation(this.onlineWorldInterpolationTarget || state, dt);
      },

      stepOnlineWorldInterpolation(state = null, dt = 0, options = {}) {
        if (!state) return false;
        const buffered = Boolean(options.buffered);
        const unitBlend = .035;
        const vehicleBlend = .035;
        const capBlend = (blend, distance) => Math.min(blend, 30 / Math.max(1, distance));
        const vehicleById = new Map(
          [...(this.tanks || []), ...(this.humvees || [])]
            .map((vehicle) => [vehicle.callSign || vehicle.id || "", vehicle])
            .filter(([id]) => id)
        );
        for (const snap of state.vehicles || []) {
          const vehicle = vehicleById.get(snap.id);
          if (!vehicle || vehicle === this.player?.inTank) continue;
          const alive = snap.alive !== false && Number(snap.hp) > 0;
          if (!alive) {
            vehicle.hp = 0;
            vehicle.alive = false;
            vehicle.playerControlled = false;
            vehicle.wreckTimer = vehicle.wreckTimer || 0;
            continue;
          }
          vehicle.alive = true;
          vehicle.destructionPending = false;
          vehicle.hp = Math.max(1, Math.min(vehicle.maxHp || snap.maxHp || 1, Number(snap.hp) || 1));
          const targetX = Number.isFinite(Number(snap.x)) ? Number(snap.x) : vehicle.x;
          const targetY = Number.isFinite(Number(snap.y)) ? Number(snap.y) : vehicle.y;
          const targetDistance = distXY(vehicle.x, vehicle.y, targetX, targetY);
          if (targetDistance > 1600) {
            vehicle.x = targetX;
            vehicle.y = targetY;
            vehicle.angle = normalizeAngle(Number(snap.angle) || vehicle.angle);
            if (vehicle.turretAngle !== undefined) vehicle.turretAngle = normalizeAngle(Number(snap.turretAngle) || vehicle.turretAngle);
            if (vehicle.machineGunAngle !== undefined) vehicle.machineGunAngle = normalizeAngle(Number(snap.machineGunAngle) || vehicle.machineGunAngle);
            vehicle.playerControlled = Boolean(snap.controllerId);
            continue;
          }
          if (buffered) {
            vehicle.x = targetX;
            vehicle.y = targetY;
            vehicle.angle = normalizeAngle(Number(snap.angle) || vehicle.angle);
            if (vehicle.turretAngle !== undefined) vehicle.turretAngle = normalizeAngle(Number(snap.turretAngle) || vehicle.turretAngle);
            if (vehicle.machineGunAngle !== undefined) vehicle.machineGunAngle = normalizeAngle(Number(snap.machineGunAngle) || vehicle.machineGunAngle);
            vehicle.playerControlled = Boolean(snap.controllerId);
            continue;
          }
          const followBlend = capBlend(this.onlineWorldCatchUpBlend(vehicleBlend, targetDistance, {
            start: 160,
            full: 420,
            max: .16
          }), targetDistance);
          vehicle.x = lerp(vehicle.x, targetX, followBlend);
          vehicle.y = lerp(vehicle.y, targetY, followBlend);
          vehicle.angle = normalizeAngle(lerp(vehicle.angle, Number(snap.angle) || vehicle.angle, Math.min(0.45, followBlend * 1.35)));
          if (vehicle.turretAngle !== undefined) vehicle.turretAngle = normalizeAngle(lerp(vehicle.turretAngle, Number(snap.turretAngle) || vehicle.turretAngle, Math.min(0.48, followBlend * 1.45)));
          if (vehicle.machineGunAngle !== undefined) vehicle.machineGunAngle = normalizeAngle(lerp(vehicle.machineGunAngle, Number(snap.machineGunAngle) || vehicle.machineGunAngle, Math.min(0.48, followBlend * 1.45)));
          vehicle.playerControlled = Boolean(snap.controllerId);
        }

        const unitById = new Map(
          [...(this.infantry || []), ...(this.crews || [])]
            .map((unit) => [unit.callSign || unit.id || "", unit])
            .filter(([id]) => id)
        );
        for (const snap of state.units || []) {
          const unit = unitById.get(snap.id) || this.ensureOnlineWorldCrewUnit(snap, vehicleById);
          if (!unit) continue;
          const alive = snap.alive !== false && Number(snap.hp) > 0;
          if (!alive) {
            unit.hp = 0;
            unit.alive = false;
            continue;
          }
          if (snap.inVehicle) {
            unit.x = buffered ? (Number(snap.x) || unit.x) : lerp(unit.x, Number(snap.x) || unit.x, unitBlend);
            unit.y = buffered ? (Number(snap.y) || unit.y) : lerp(unit.y, Number(snap.y) || unit.y, unitBlend);
            continue;
          }
          if (unit.inTank) {
            unit.inTank.leaveCrew?.(unit);
            unit.inTank = null;
            if (unit.state === "mounted" || unit.state === "vehicle") unit.state = "idle";
          }
          if (unit.inVehicle) {
            unit.inVehicle.leavePassenger?.(unit);
            unit.inVehicle = null;
            unit.transportVehicle = null;
            if (unit.state === "mounted-transport" || unit.state === "transport") unit.state = "idle";
          }
          unit.alive = true;
          unit.hp = Math.max(1, Math.min(unit.maxHp || snap.maxHp || 1, Number(snap.hp) || 1));
          const targetX = Number.isFinite(Number(snap.x)) ? Number(snap.x) : unit.x;
          const targetY = Number.isFinite(Number(snap.y)) ? Number(snap.y) : unit.y;
          const targetDistance = distXY(unit.x, unit.y, targetX, targetY);
          if (targetDistance > 1200) {
            unit.x = targetX;
            unit.y = targetY;
            unit.angle = normalizeAngle(Number(snap.angle) || unit.angle);
            if (snap.state && !unit.inTank && !unit.inVehicle) unit.state = snap.state;
            continue;
          }
          if (buffered) {
            unit.x = targetX;
            unit.y = targetY;
            unit.angle = normalizeAngle(Number(snap.angle) || unit.angle);
            if (snap.state && !unit.inTank && !unit.inVehicle) unit.state = snap.state;
            continue;
          }
          const followBlend = capBlend(this.onlineWorldCatchUpBlend(unitBlend, targetDistance, {
            start: 64,
            full: 240,
            max: .16
          }), targetDistance);
          unit.x = lerp(unit.x, targetX, followBlend);
          unit.y = lerp(unit.y, targetY, followBlend);
          unit.angle = normalizeAngle(lerp(unit.angle, Number(snap.angle) || unit.angle, Math.min(0.42, followBlend * 1.35)));
          if (snap.state && !unit.inTank && !unit.inVehicle) unit.state = snap.state;
        }

        const pointById = new Map((this.capturePoints || []).map((point) => [point.name, point]));
        for (const snap of state.capturePoints || []) {
          const point = pointById.get(snap.id);
          if (!point) continue;
          point.owner = snap.owner || TEAM.NEUTRAL;
          point.progress = clamp(Number(snap.progress) || 0, -1, 1);
          point.contested = Boolean(snap.contested);
        }
        return true;
      },

      ensureOnlineWorldCrewUnit(snap = {}, vehicleById = new Map()) {
        const id = String(snap.id || "");
        if (!id || !IronLine.CrewMember) return null;
        const vehicleId = id.endsWith("-DRV")
          ? id.slice(0, -4)
          : id.endsWith("-CREW")
            ? id.slice(0, -5)
            : "";
        if (!vehicleId) return null;
        const vehicle = vehicleById.get(vehicleId);
        if (!vehicle) return null;
        const shouldBoard = Boolean(snap.inVehicle && vehicle.alive);
        const crew = this.spawnCrewForTank(vehicle, {
          callSign: id,
          role: vehicle.vehicleType === "humvee" ? "driver" : "crew",
          boardImmediately: shouldBoard
        });
        if (!shouldBoard) {
          vehicle.leaveCrew?.(crew);
          crew.targetTank = null;
          crew.inTank = null;
          crew.state = snap.state || "idle";
        }
        return crew;
      },

      onlineWorldCatchUpBlend(baseBlend = 0.05, distance = 0, options = {}) {
        const start = Math.max(0, Number(options.start) || 0);
        const full = Math.max(start + 1, Number(options.full) || start + 1);
        const maxBlend = Math.max(baseBlend, Math.min(0.3, Number(options.max) || baseBlend));
        const amount = clamp(((Number(distance) || 0) - start) / (full - start), 0, 1);
        return Math.max(baseBlend, lerp(baseBlend, maxBlend, amount));
      }
    });
  };
})(window);
