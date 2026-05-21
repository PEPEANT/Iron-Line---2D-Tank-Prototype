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
  const wreckCover = IronLine.wreckCover || {};
  const sceneryMovementBlockers = new Set([
    "sandbag",
    "barricade",
    "wood-fence",
    "rubble",
    "tree",
    "streetlight",
    "billboard",
    "bench"
  ]);
  const vehicleCrushThroughTypes = new Set([
    "sandbag",
    "barricade",
    "wood-fence",
    "brush",
    "tree",
    "rubble",
    "streetlight",
    "billboard",
    "bench"
  ]);
  const vehicleVegetationTypes = new Set(["brush", "tree"]);

  function worldItemType(item) {
    return String(item?.type || item?.kind || "");
  }

  function isDestroyed(item) {
    return Boolean(item?.destroyed);
  }

  function isVehicleWreck(vehicle) {
    return Boolean(vehicle && !vehicle.coverDestroyed && (!vehicle.alive || vehicle.hp <= 0 || vehicle.destructionPending));
  }

  function vehicleWreckBlocks(vehicle, options = {}) {
    if (!isVehicleWreck(vehicle)) return false;
    const blockSeconds = options.wreckBlockSeconds ?? (vehicle.vehicleType === "humvee" ? 10 : 14);
    return (vehicle.wreckTimer || 0) <= blockSeconds;
  }

  function isVehicleCrushThrough(item, options = {}) {
    if (!options.destroyObstaclesOnImpact || !options.vehicleKind || !item || item.destroyed) return false;
    const type = worldItemType(item);
    return vehicleCrushThroughTypes.has(type);
  }

  function vehicleCrushThroughDamage(item, options = {}) {
    if (!isVehicleCrushThrough(item, options)) return 0;
    const type = worldItemType(item);
    if (vehicleVegetationTypes.has(type)) {
      return Math.max(Number(item.hp) || 0, Number(item.maxHp) || 0, Number(item.baseHp) || 0, type === "tree" ? 70 : 42) + 12;
    }
    return options.vehicleKind === "tank" ? 54 : 36;
  }

  function rectLike(item) {
    return Number.isFinite(item?.w) && Number.isFinite(item?.h);
  }

  function itemRadius(item, movement = false) {
    const raw = Number(item?.r) || Number(item?.radius) || Math.max(Number(item?.w) || 0, Number(item?.h) || 0) * 0.5;
    const type = worldItemType(item);
    if (!movement) return raw;
    if (type === "tree") return raw * 0.52;
    if (type === "rubble") return raw * 0.64;
    return raw;
  }

  function itemRect(item, padding = 0) {
    if (rectLike(item)) {
      return expandedRect({
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        w: Number(item.w) || 0,
        h: Number(item.h) || 0
      }, padding);
    }
    const r = itemRadius(item) + padding;
    return {
      x: (Number(item?.x) || 0) - r,
      y: (Number(item?.y) || 0) - r,
      w: r * 2,
      h: r * 2
    };
  }

  function itemBlocksSight(item) {
    if (!item || isDestroyed(item)) return false;
    const type = worldItemType(item);
    if (type === "brush" || item.stopsProjectiles === false) return false;
    return Boolean(item.stopsProjectiles === true || item.kind || sceneryMovementBlockers.has(type));
  }

  function itemBlocksMovement(item) {
    if (!item || isDestroyed(item)) return false;
    if (item.blocksMovement !== undefined) return item.blocksMovement !== false;
    const type = worldItemType(item);
    if (type === "brush") return false;
    return Boolean(item.kind || sceneryMovementBlockers.has(type) || item.stopsProjectiles === true);
  }

  function lineBlockedByItem(x1, y1, x2, y2, item, padding = 0) {
    if (rectLike(item)) {
      return lineIntersectsRect(x1, y1, x2, y2, itemRect(item, padding));
    }
    const r = itemRadius(item) + padding;
    return segmentDistanceToPoint(x1, y1, x2, y2, Number(item.x) || 0, Number(item.y) || 0) <= r;
  }

  function pointInsideItem(x, y, item, padding = 0) {
    if (rectLike(item)) return pointInRect(x, y, itemRect(item, padding));
    return distXY(x, y, Number(item?.x) || 0, Number(item?.y) || 0) <= itemRadius(item) + padding;
  }

  function circleHitsItem(x, y, radius, item) {
    if (rectLike(item)) return circleRectCollision(x, y, radius, itemRect(item));
    return distXY(x, y, Number(item?.x) || 0, Number(item?.y) || 0) <= radius + itemRadius(item, true);
  }

  function coverBlockers(game, options = {}) {
    const blockers = [];
    const includeScenery = options.includeScenery !== false;
    const includeWrecks = options.includeWrecks !== false;

    for (const obstacle of game.world?.obstacles || []) {
      if (!itemBlocksSight(obstacle)) continue;
      blockers.push({ ...itemRect(obstacle), source: obstacle, dynamic: false, kind: obstacle.kind || "obstacle" });
    }

    if (includeScenery) {
      for (const item of game.world?.scenery || []) {
        if (!itemBlocksSight(item)) continue;
        blockers.push({ ...itemRect(item), source: item, dynamic: true, kind: worldItemType(item) || "scenery" });
      }
    }

    if (includeWrecks) {
      for (const wreck of [...(game.tanks || []), ...(game.humvees || [])]) {
        if (!vehicleWreckBlocks(wreck, options)) continue;
        const r = Math.max(22, (wreck.radius || 18) * 1.05);
        blockers.push({
          x: wreck.x - r,
          y: wreck.y - r,
          w: r * 2,
          h: r * 2,
          source: wreck,
          dynamic: true,
          kind: "vehicle-wreck"
        });
      }
    }

    return blockers;
  }

  function lineBlockedByWorld(game, x1, y1, x2, y2, options = {}) {
    const padding = options.padding || 0;
    const ignore = new Set(options.ignore || []);
    const ignoreA = Boolean(options.ignoreObstacleContainingA || options.ignoreBlockerContainingA);
    const ignoreB = Boolean(options.ignoreObstacleContainingB || options.ignoreBlockerContainingB);

    const blockedBy = (item) => {
      if (!item || ignore.has(item) || !itemBlocksSight(item)) return false;
      if (options.ignoreVehicleCrushThrough && isVehicleCrushThrough(item, {
        ...options,
        destroyObstaclesOnImpact: true,
        vehicleKind: options.vehicleKind || "tank"
      })) return false;
      if (ignoreA && pointInsideItem(x1, y1, item, padding)) return false;
      if (ignoreB && pointInsideItem(x2, y2, item, padding)) return false;
      return lineBlockedByItem(x1, y1, x2, y2, item, padding);
    };

    for (const obstacle of game.world?.obstacles || []) {
      if (blockedBy(obstacle)) return true;
    }

    if (options.includeScenery !== false) {
      for (const item of game.world?.scenery || []) {
        if (blockedBy(item)) return true;
      }
    }

    if (options.includeWrecks !== false) {
      for (const wreck of [...(game.tanks || []), ...(game.humvees || [])]) {
        if (!vehicleWreckBlocks(wreck, options) || ignore.has(wreck)) continue;
        const blocker = { x: wreck.x, y: wreck.y, r: Math.max(22, (wreck.radius || 18) * 1.05), type: "vehicle-wreck" };
        if (ignoreA && pointInsideItem(x1, y1, blocker, padding)) continue;
        if (ignoreB && pointInsideItem(x2, y2, blocker, padding)) continue;
        if (lineBlockedByItem(x1, y1, x2, y2, blocker, padding)) return true;
      }
    }

    return false;
  }

  function hasLineOfSight(game, a, b, options = {}) {
    if (lineBlockedByWorld(game, a.x, a.y, b.x, b.y, options)) {
      return false;
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
    if (lineBlockedByWorld(game, muzzleX, muzzleY, target.x, target.y, { ...options, padding })) return false;

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
      if (!tank.alive && (!options.blockWrecks || !vehicleWreckBlocks(tank, options))) return false;
      const hit = distXY(x, y, tank.x, tank.y) < radius + tank.radius + padding;
      if (!hit) return false;
      if (!tank.alive && tryBreakVehicleWreckOnImpact(game, entity, tank, options)) return false;
      return true;
    });
  }

  function vehicleImpactSpeed(entity, options) {
    return Math.abs(options.impactSpeed ?? entity?.speed ?? 0);
  }

  function vehicleImpactDamage(entity, target, options) {
    const speed = vehicleImpactSpeed(entity, options);
    const minimum = options.impactMinSpeed ?? (options.vehicleKind === "humvee" ? 34 : 24);
    if (speed < minimum) return 0;
    const mass = options.impactMass ?? (options.vehicleKind === "humvee" ? 0.94 : 1.34);
    const type = worldItemType(target);
    const hardness = type === "building" ? 1.32 : type === "base-wall" ? 1.05 : type === "concrete" ? 1 : 0.88;
    return (20 + speed * 0.86) * mass / hardness;
  }

  function vehicleWreckImpactDamage(entity, wreck, options) {
    if (!options.destroyObstaclesOnImpact || !options.vehicleKind || !isVehicleWreck(wreck)) return 0;
    const speed = vehicleImpactSpeed(entity, options);
    if (speed < (options.vehicleKind === "tank" ? 18 : 32)) return 0;
    const mass = options.impactMass ?? (options.vehicleKind === "humvee" ? 0.94 : 1.34);
    const wreckScale = wreck?.vehicleType === "humvee" ? 1.18 : 1;
    return (30 + speed * 0.82) * mass * wreckScale;
  }

  function tryBreakVehicleWreckOnImpact(game, entity, wreck, options) {
    const damage = vehicleWreckImpactDamage(entity, wreck, options);
    if (damage <= 0) return false;
    const now = game?.matchTime || 0;
    if (now - (wreck.lastVehicleRamAt || -99) < 0.16) return false;
    wreck.lastVehicleRamAt = now;
    const destroyed = wreckCover.damageVehicleWreck?.(game, wreck, damage, { ammoId: "ram" });
    if (destroyed) shakeVehicleOnBreak(entity, options);
    else if (entity) entity.impactShake = Math.max(entity.impactShake || 0, 0.18);
    return Boolean(destroyed);
  }

  function heavyObstacleGrindDamage(game, obstacle, options) {
    if (options.vehicleKind !== "tank") return 0;
    const type = worldItemType(obstacle);
    if (!["building", "base-wall", "concrete"].includes(type)) return 0;
    const now = game?.matchTime || 0;
    if (now - (obstacle.lastVehicleGrindAt || -99) < 0.32) return 0;
    obstacle.lastVehicleGrindAt = now;
    if (type === "building") return 18;
    if (type === "base-wall") return 28;
    return 24;
  }

  function vehicleBreakOptions(entity, target, options) {
    const force = clamp(vehicleImpactSpeed(entity, options) / Math.max(options.maxImpactSpeed || 160, 1), 0.8, 1.9);
    return {
      angle: entity?.angle ?? 0,
      force,
      duration: target?.kind === "base-wall" || target?.kind === "concrete" ? 0.72 : 0.56
    };
  }

  function shakeVehicleOnBreak(entity, options) {
    if (!entity) return;
    const impulse = clamp(vehicleImpactSpeed(entity, options) / Math.max(options.maxImpactSpeed || 160, 1), 0.16, 0.95);
    entity.impactShake = Math.max(entity.impactShake || 0, impulse);
  }

  function circleHitsScenery(x, y, radius, item) {
    if (!item || item.destroyed) return false;
    if (item.shape === "rect" || Number.isFinite(item.w) || Number.isFinite(item.h)) {
      return circleRectCollision(x, y, radius, {
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        w: Number(item.w) || 0,
        h: Number(item.h) || 0
      });
    }
    const itemRadius = Number(item.r) || Number(item.radius) || 0;
    return distXY(x, y, Number(item.x) || 0, Number(item.y) || 0) <= radius + itemRadius;
  }

  function damageTouchedScenery(game, entity, x, y, radius, options, context) {
    if (!options.destroyObstaclesOnImpact) return;
    const baseDamage = vehicleImpactDamage(entity, null, options);
    const damaged = context.damagedScenery || (context.damagedScenery = new Set());
    for (const item of game.world?.scenery || []) {
      if (!item || item.destroyed || damaged.has(item)) continue;
      const crushDamage = vehicleCrushThroughDamage(item, options);
      if (!item.destructible && crushDamage <= 0) continue;
      if (!circleHitsScenery(x, y, radius, item)) continue;
      if (crushDamage > 0) item.destructible = true;
      const damage = Math.max(baseDamage, crushDamage);
      if (damage <= 0) continue;
      damaged.add(item);
      const destroyed = IronLine.combat?.damageScenery?.(game, item, damage, vehicleBreakOptions(entity, item, options));
      if (destroyed) shakeVehicleOnBreak(entity, options);
    }
  }

  function tryBreakObstacleOnImpact(game, entity, obstacle, options, context) {
    if (!options.destroyObstaclesOnImpact || obstacle?.destroyed) return false;
    const damaged = context.damagedObstacles || (context.damagedObstacles = new Set());
    if (damaged.has(obstacle)) return obstacle.destroyed;
    let damage = vehicleImpactDamage(entity, obstacle, options);
    damage = Math.max(damage, vehicleCrushThroughDamage(obstacle, options));
    if (damage <= 0) damage = heavyObstacleGrindDamage(game, obstacle, options);
    if (damage <= 0) return false;
    damaged.add(obstacle);
    const destroyed = IronLine.combat?.damageObstacle?.(game, obstacle, damage, vehicleBreakOptions(entity, obstacle, options));
    if (destroyed) shakeVehicleOnBreak(entity, options);
    return Boolean(destroyed);
  }

  function isObstacleBlockingCircle(game, entity, x, y, radius, options, context) {
    for (const obstacle of game.world?.obstacles || []) {
      if (obstacle.destroyed || !circleRectCollision(x, y, radius, obstacle)) continue;
      if (tryBreakObstacleOnImpact(game, entity, obstacle, options, context)) continue;
      if (isVehicleCrushThrough(obstacle, options)) continue;
      return true;
    }
    return false;
  }

  function isSceneryBlockingCircle(game, x, y, radius, options = {}) {
    if (options.blockScenery === false) return false;
    for (const item of game.world?.scenery || []) {
      if (!itemBlocksMovement(item)) continue;
      if (!circleHitsItem(x, y, radius, item)) continue;
      if (isVehicleCrushThrough(item, options)) continue;
      return true;
    }
    return false;
  }

  function circleBlockedByWorld(game, entity, x, y, radius, options = {}) {
    const context = {};
    return isObstacleBlockingCircle(game, entity, x, y, radius, {
      ...options,
      destroyObstaclesOnImpact: false
    }, context) ||
      isSceneryBlockingCircle(game, x, y, radius, options) ||
      Boolean(options.blockTanks && circleIntersectsTank(game, entity, x, y, radius, options));
  }

  function tryMoveCircle(game, entity, vx, vy, radius, dt, options = {}) {
    const world = game.world;
    const context = {};
    const collisionSpeedScale = options.collisionSpeedScale ?? -0.18;
    const nextX = clamp(entity.x + vx * dt, radius, world.width - radius);
    damageTouchedScenery(game, entity, nextX, entity.y, radius, options, context);
    const blockedX = isObstacleBlockingCircle(game, entity, nextX, entity.y, radius, options, context) ||
      isSceneryBlockingCircle(game, nextX, entity.y, radius, options) ||
      Boolean(options.blockTanks && circleIntersectsTank(game, entity, nextX, entity.y, radius, options));
    if (!blockedX) {
      entity.x = nextX;
    } else if (entity.speed !== undefined) {
      entity.speed *= collisionSpeedScale;
    }

    const nextY = clamp(entity.y + vy * dt, radius, world.height - radius);
    damageTouchedScenery(game, entity, entity.x, nextY, radius, options, context);
    const blockedY = isObstacleBlockingCircle(game, entity, entity.x, nextY, radius, options, context) ||
      isSceneryBlockingCircle(game, entity.x, nextY, radius, options) ||
      Boolean(options.blockTanks && circleIntersectsTank(game, entity, entity.x, nextY, radius, options));
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
      if (!unit.inVehicle) resolveCircleAgainstTanks(game, unit, 18);
    }
    for (const crew of game.crews || []) resolveCircleAgainstTanks(game, crew, 18);
    if (!game.player?.inTank) resolveCircleAgainstTanks(game, game.player, 12);
  }

  function resolveTankSpacing(game, dt) {
    const tanks = [...(game.tanks || []), ...(game.humvees || [])];
    const world = game.world || {};
    const passes = tanks.length > 6 ? 2 : 3;
    for (let pass = 0; pass < passes; pass += 1) {
      for (let i = 0; i < tanks.length; i += 1) {
        const a = tanks[i];
        if (!a.alive) continue;

        for (let j = i + 1; j < tanks.length; j += 1) {
          const b = tanks[j];
          if (!b.alive) continue;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          const minDist = a.radius + b.radius + 10;
          if (d >= minDist) continue;

          let nx = dx / Math.max(d, 1);
          let ny = dy / Math.max(d, 1);
          if (d < 1) {
            const angle = (b.angle || 0) + Math.PI / 2;
            nx = Math.cos(angle);
            ny = Math.sin(angle);
            d = 1;
          }

          const overlap = minDist - d;
          const severity = clamp(overlap / Math.max(minDist, 1), 0.08, 0.9);
          const push = clamp(overlap * 0.72, 2.5, 28);
          let aShare = 0.5;
          let bShare = 0.5;
          if (a.playerControlled && !b.playerControlled) {
            aShare = 0.18;
            bShare = 0.82;
          } else if (b.playerControlled && !a.playerControlled) {
            aShare = 0.82;
            bShare = 0.18;
          }

          a.x = clamp(a.x - nx * push * aShare, a.radius, (world.width || a.x) - a.radius);
          a.y = clamp(a.y - ny * push * aShare, a.radius, (world.height || a.y) - a.radius);
          b.x = clamp(b.x + nx * push * bShare, b.radius, (world.width || b.x) - b.radius);
          b.y = clamp(b.y + ny * push * bShare, b.radius, (world.height || b.y) - b.radius);

          const impact = clamp(severity * 0.8, 0.08, 0.55);
          a.impactShake = Math.max(a.impactShake || 0, impact);
          b.impactShake = Math.max(b.impactShake || 0, impact);
          if (a.turnVelocity !== undefined) a.turnVelocity *= 0.62;
          if (b.turnVelocity !== undefined) b.turnVelocity *= 0.62;
          if (a.speed !== undefined) a.speed *= severity > 0.32 ? -0.1 : 0.42;
          if (b.speed !== undefined) b.speed *= severity > 0.32 ? -0.1 : 0.42;
        }
      }
    }
  }

  IronLine.physics = {
    hasLineOfSight,
    hasClearShot,
    lineBlockedByWorld,
    coverBlockers,
    itemBlocksMovement,
    circleBlockedByWorld,
    isVehicleWreck,
    vehicleWreckBlocks,
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
