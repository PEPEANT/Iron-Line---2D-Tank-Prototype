"use strict";

(function registerPhysics(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const {
    clamp,
    distXY,
    pointInRect,
    circleRectCollision,
    expandedRect,
    lineIntersectsRect,
    segmentDistanceToPoint
  } = IronLine.math;
  const { AMMO } = IronLine.constants;

  function hasLineOfSight(game, a, b, options = {}) {
    for (const obstacle of game.world.obstacles) {
      if (options.ignoreObstacleContainingA && pointInRect(a.x, a.y, obstacle)) continue;
      if (options.ignoreObstacleContainingB && pointInRect(b.x, b.y, obstacle)) continue;
      if (lineIntersectsRect(a.x, a.y, b.x, b.y, expandedRect(obstacle, options.padding || 0))) {
        return false;
      }
    }

    if (!options.ignoreSmoke) {
      for (const cloud of game.effects.smokeClouds) {
        const blocked = cloud.life > 0 &&
          segmentDistanceToPoint(a.x, a.y, b.x, b.y, cloud.x, cloud.y) < cloud.radius * 0.78;
        if (blocked) return false;
      }
    }

    return true;
  }

  function hasClearShot(game, tank, target, ammoId, options = {}) {
    const ammo = AMMO[ammoId];
    if (!ammo || ammo.equipment) return false;

    const targetDistance = distXY(tank.x, tank.y, target.x, target.y);
    if (ammo.range && targetDistance > ammo.range) return false;

    const muzzleDistance = tank.radius + 28;
    const muzzleX = tank.x + Math.cos(tank.turretAngle) * muzzleDistance;
    const muzzleY = tank.y + Math.sin(tank.turretAngle) * muzzleDistance;
    const padding = options.padding ?? ((ammo.shellRadius || 4) + 3);

    for (const obstacle of game.world.obstacles) {
      if (lineIntersectsRect(muzzleX, muzzleY, target.x, target.y, expandedRect(obstacle, padding))) {
        return false;
      }
    }

    if (!options.ignoreSmoke) {
      for (const cloud of game.effects.smokeClouds) {
        const blocked = cloud.life > 0 &&
          segmentDistanceToPoint(muzzleX, muzzleY, target.x, target.y, cloud.x, cloud.y) < cloud.radius * 0.68;
        if (blocked) return false;
      }
    }

    return true;
  }

  function circleIntersectsTank(game, entity, x, y, radius, options = {}) {
    const padding = options.padding ?? 4;
    const ignoreTanks = new Set(options.ignoreTanks || []);
    if (options.ignoreTank) ignoreTanks.add(options.ignoreTank);

    return [...(game.tanks || []), ...(game.humvees || [])].some((tank) => {
      if (tank === entity || ignoreTanks.has(tank)) return false;
      if (!tank.alive && !options.blockWrecks) return false;
      return distXY(x, y, tank.x, tank.y) < radius + tank.radius + padding;
    });
  }

  function tryMoveCircle(game, entity, vx, vy, radius, dt, options = {}) {
    const world = game.world;
    const collisionSpeedScale = options.collisionSpeedScale ?? -0.18;
    const nextX = clamp(entity.x + vx * dt, radius, world.width - radius);
    const blockedX = world.obstacles.some((obstacle) => circleRectCollision(nextX, entity.y, radius, obstacle)) ||
      options.blockTanks && circleIntersectsTank(game, entity, nextX, entity.y, radius, options);
    if (!blockedX) {
      entity.x = nextX;
    } else if (entity.speed !== undefined) {
      entity.speed *= collisionSpeedScale;
    }

    const nextY = clamp(entity.y + vy * dt, radius, world.height - radius);
    const blockedY = world.obstacles.some((obstacle) => circleRectCollision(entity.x, nextY, radius, obstacle)) ||
      options.blockTanks && circleIntersectsTank(game, entity, entity.x, nextY, radius, options);
    if (!blockedY) {
      entity.y = nextY;
    } else if (entity.speed !== undefined) {
      entity.speed *= collisionSpeedScale;
    }

    return { blocked: blockedX || blockedY, blockedX, blockedY };
  }

  function resolveCircleAgainstTanks(game, entity, padding = 5) {
    if (!entity || entity.inTank || entity.alive === false || entity.hp <= 0) return;

    const radius = entity.radius || 10;
    for (const tank of [...(game.tanks || []), ...(game.humvees || [])]) {
      if (!tank.alive) continue;
      const dx = entity.x - tank.x;
      const dy = entity.y - tank.y;
      let distance = Math.hypot(dx, dy);
      const minDistance = radius + tank.radius + padding;
      if (distance >= minDistance) continue;

      let nx = dx / Math.max(distance, 1);
      let ny = dy / Math.max(distance, 1);
      if (distance < 1) {
        const angle = entity.angle ?? tank.angle ?? 0;
        nx = Math.cos(angle);
        ny = Math.sin(angle);
        distance = 1;
      }

      const push = minDistance - distance;
      entity.x = clamp(entity.x + nx * push, radius, game.world.width - radius);
      entity.y = clamp(entity.y + ny * push, radius, game.world.height - radius);
      if (entity.speed !== undefined) entity.speed *= 0.35;
    }
  }

  function resolveInfantryTankSpacing(game) {
    for (const unit of game.infantry || []) {
      if (!unit.inVehicle) resolveCircleAgainstTanks(game, unit, 5);
    }
    for (const crew of game.crews || []) resolveCircleAgainstTanks(game, crew, 5);
    if (!game.player?.inTank) resolveCircleAgainstTanks(game, game.player, 5);
  }

  function resolveTankSpacing(game, dt) {
    const tanks = [...(game.tanks || []), ...(game.humvees || [])];
    for (let i = 0; i < tanks.length; i += 1) {
      const a = tanks[i];
      if (!a.alive) continue;

      for (let j = i + 1; j < tanks.length; j += 1) {
        const b = tanks[j];
        if (!b.alive) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const minDist = a.radius + b.radius + 4;
        if (d >= minDist) continue;

        const push = (minDist - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push * dt * 14;
        a.y -= ny * push * dt * 14;
        b.x += nx * push * dt * 14;
        b.y += ny * push * dt * 14;
        const impact = clamp((minDist - d) / Math.max(minDist, 1), 0.08, 0.45);
        a.impactShake = Math.max(a.impactShake || 0, impact);
        b.impactShake = Math.max(b.impactShake || 0, impact);
        if (a.turnVelocity !== undefined) a.turnVelocity *= 0.9;
        if (b.turnVelocity !== undefined) b.turnVelocity *= 0.9;
        a.speed *= 0.82;
        b.speed *= 0.82;
      }
    }
  }

  IronLine.physics = {
    hasLineOfSight,
    hasClearShot,
    tryMoveCircle,
    resolveTankSpacing,
    resolveInfantryTankSpacing,
    circleIntersectsTank,
    pointInRect,
    circleRectCollision,
    expandedRect,
    lineIntersectsRect,
    distXY
  };
})(window);
