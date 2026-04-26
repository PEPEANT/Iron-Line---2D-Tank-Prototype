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

  function tryMoveCircle(game, entity, vx, vy, radius, dt) {
    const world = game.world;
    const nextX = clamp(entity.x + vx * dt, radius, world.width - radius);
    if (!world.obstacles.some((obstacle) => circleRectCollision(nextX, entity.y, radius, obstacle))) {
      entity.x = nextX;
    } else if (entity.speed !== undefined) {
      entity.speed *= -0.18;
    }

    const nextY = clamp(entity.y + vy * dt, radius, world.height - radius);
    if (!world.obstacles.some((obstacle) => circleRectCollision(entity.x, nextY, radius, obstacle))) {
      entity.y = nextY;
    } else if (entity.speed !== undefined) {
      entity.speed *= -0.18;
    }
  }

  function resolveTankSpacing(game, dt) {
    const tanks = game.tanks;
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
    pointInRect,
    circleRectCollision,
    expandedRect,
    lineIntersectsRect,
    distXY
  };
})(window);
