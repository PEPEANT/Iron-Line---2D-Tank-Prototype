"use strict";

(function registerAwarenessSignals(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { distXY, normalizeAngle, segmentDistanceToPoint, clamp } = IronLine.math;

  function observerSeesShooter(game, observer, shooter, halfAngle = 1.1) {
    if (!observer || !shooter) return false;
    const distance = distXY(observer.x, observer.y, shooter.x, shooter.y);
    const angle = Math.atan2(shooter.y - observer.y, shooter.x - observer.x);
    const diff = Math.abs(normalizeAngle(angle - (observer.angle || 0)));
    if (diff > halfAngle && distance > (observer.radius || 0) + (shooter.radius || 0) + 84) return false;
    return IronLine.physics?.hasLineOfSight?.(game, observer, shooter, { padding: 4 }) !== false;
  }

  function uncertainThreatPoint(observer, shooter, hit = false) {
    if (!observer || !shooter) return shooter;
    const distance = distXY(observer.x, observer.y, shooter.x, shooter.y);
    const error = hit ? clamp(distance * 0.16, 24, 140) : clamp(distance * 0.3, 46, 250);
    const angle = Math.atan2(shooter.y - observer.y, shooter.x - observer.x) + (Math.random() - 0.5) * (hit ? 0.42 : 0.9);
    const side = angle + Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    return {
      x: shooter.x + Math.cos(side) * error,
      y: shooter.y + Math.sin(side) * error,
      team: shooter.team,
      owner: shooter,
      target: shooter,
      radius: shooter.radius || 10,
      sourceType: hit ? "hit_reaction" : "gunfire_suspicion",
      suspicion: true
    };
  }

  function suppressionSourceForUnit(game, unit, shooter, hit = false) {
    if (!unit || !shooter) return shooter;
    if (game.isReportedEnemy?.(unit.team, shooter) || observerSeesShooter(game, unit, shooter)) return shooter;
    return uncertainThreatPoint(unit, shooter, hit);
  }

  function notifyGunfireSuspicion(game, shooter, startX, startY, endX, endY, weapon, options = {}) {
    if (!game || !shooter) return;
    const shotLength = distXY(startX, startY, endX, endY);
    const soundRange = Math.max(weapon?.range || 560, shotLength) + (weapon?.id === "sniper" ? 340 : 220);

    for (const vehicle of [...(game.tanks || []), ...(game.humvees || [])]) {
      if (!vehicle.alive || vehicle.team === shooter.team || !vehicle.ai?.registerSuspicion) continue;
      const shooterDistance = distXY(vehicle.x, vehicle.y, shooter.x, shooter.y);
      const laneDistance = segmentDistanceToPoint(startX, startY, endX, endY, vehicle.x, vehicle.y);
      const hitVehicle = options.hitTarget === vehicle;
      if (!hitVehicle && shooterDistance > soundRange && laneDistance > 260) continue;
      if (!hitVehicle && game.isReportedEnemy?.(vehicle.team, shooter)) continue;
      if (!hitVehicle && observerSeesShooter(game, vehicle, shooter, vehicle.vehicleType === "humvee" ? 1.18 : 1.05)) continue;
      vehicle.ai.registerSuspicion(uncertainThreatPoint(vehicle, shooter, Boolean(hitVehicle)), {
        hit: Boolean(hitVehicle),
        sourceType: hitVehicle ? "hit_reaction" : "gunfire_suspicion"
      });
    }
  }

  IronLine.awarenessSignals = {
    observerSeesShooter,
    uncertainThreatPoint,
    suppressionSourceForUnit,
    notifyGunfireSuspicion
  };
})(window);
