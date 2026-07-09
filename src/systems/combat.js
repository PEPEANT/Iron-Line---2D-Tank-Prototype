"use strict";

(function registerCombat(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, INFANTRY_WEAPONS } = IronLine.constants;
  const { clamp, distXY, normalizeAngle, circleRectCollision, expandedRect, lineIntersectsRect, segmentDistanceToPoint, lerp } = IronLine.math;
  const awarenessSignals = IronLine.awarenessSignals || {};
  const wreckCover = IronLine.wreckCover || {};
  const friendlyBodyBlock = IronLine.combatFriendlyBodyBlock || { find: () => null, nearest: (_x, _y, ...hits) => hits.find(Boolean) || null, resolve: (_game, _shooter, _x1, _y1, x2, y2, tankBlock) => ({ firstBlock: tankBlock || null, finalTankBlock: tankBlock || null, finalBodyBlock: null, finalEndX: tankBlock?.x ?? x2, finalEndY: tankBlock?.y ?? y2 }), emit: () => false };
  const isVehicleWreck = wreckCover.isVehicleWreck || ((vehicle) => Boolean(vehicle && !vehicle.coverDestroyed && (!vehicle.alive || vehicle.hp <= 0)));
  const damageVehicleWreck = wreckCover.damageVehicleWreck || (() => false), shellWreckDamage = wreckCover.shellWreckDamage || (() => 0);

  function vehicleTargets(game) {
    return [...(game.tanks || []), ...(game.humvees || [])];
  }
  function pushLimited(list, item, max = 180) {
    if (!list) return;
    if (list.length >= max) list.shift();
    list.push(item);
  }
  function trimOldest(list, max) {
    if (!Array.isArray(list) || list.length <= max) return;
    list.splice(0, list.length - max);
  }
  function sceneryCenter(item) {
    if (!item) return { x: 0, y: 0, radius: 0 };
    if (item.shape === "rect" || Number.isFinite(item.w) || Number.isFinite(item.h)) {
      const w = Number(item.w) || 0;
      const h = Number(item.h) || 0;
      return {
        x: (Number(item.x) || 0) + w * 0.5,
        y: (Number(item.y) || 0) + h * 0.5,
        radius: Math.max(w, h) * 0.5
      };
    }
    return {
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
      radius: Number(item.r) || Number(item.radius) || 0
    };
  }

  function activeDestructibleScenery(game) {
    return (game.world?.scenery || []).filter((item) => item?.destructible && !item.destroyed);
  }
  const vehicleBreakableObstacleKinds = new Set([
    "building", "base-wall", "concrete",
    "sandbag",
    "barricade",
    "wood-fence",
    "tree",
    "brush",
    "rubble"
  ]);

  function isVehicleBreakableObstacle(obstacle) {
    if (!obstacle || obstacle.destroyed) return false;
    return Boolean(obstacle.destructible || vehicleBreakableObstacleKinds.has(obstacle.kind));
  }

  function obstacleImpactHp(kind) {
    switch (kind) {
      case "building":
        return 360;
      case "base-wall":
        return 128;
      case "concrete":
        return 108;
      case "barricade":
        return 72;
      case "sandbag":
        return 64;
      case "rubble":
        return 56;
      case "tree":
        return 50;
      case "wood-fence":
        return 38;
      case "brush":
        return 28;
      default:
        return 72;
    }
  }

  function projectileHitsScenery(shell, item) {
    if (!shell || !item?.stopsProjectiles || item.destroyed) return false;
    if (item.shape === "rect" || Number.isFinite(item.w) || Number.isFinite(item.h)) {
      const rect = {
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        w: Number(item.w) || 0,
        h: Number(item.h) || 0
      };
      return circleRectCollision(shell.x, shell.y, shell.radius, rect) ||
        lineIntersectsRect(shell.previousX, shell.previousY, shell.x, shell.y, rect);
    }
    const center = sceneryCenter(item);
    const d = segmentDistanceToPoint(shell.previousX, shell.previousY, shell.x, shell.y, center.x, center.y);
    return d <= center.radius + shell.radius;
  }

  function findProjectileSceneryHit(game, shell) {
    let best = null;
    let bestDistance = Infinity;
    for (const item of activeDestructibleScenery(game)) {
      if (!projectileHitsScenery(shell, item)) continue;
      const center = sceneryCenter(item);
      const d = distXY(shell.previousX, shell.previousY, center.x, center.y);
      if (d < bestDistance) {
        best = item;
        bestDistance = d;
      }
    }
    return best;
  }

  function emitSceneryBreak(game, item) {
    if (!game?.effects || !item) return;
    const center = sceneryCenter(item);
    const type = item.type || item.kind;
    const dustPuffs = game.effects.dustPuffs || (game.effects.dustPuffs = []);
    const blastSparks = game.effects.blastSparks || (game.effects.blastSparks = []);
    const radius = Math.max(18, center.radius || 24);

    dustPuffs.push({
      x: center.x,
      y: center.y,
      radius: Math.min(44, radius * 0.55),
      maxRadius: Math.min(96, radius * 1.25),
      life: 0.7,
      maxLife: 0.7,
      alpha: 0.24,
      color: type === "tree" ? "#66734b" : "#b1a077"
    });

    const sparkCount = type === "tree" ? 7 : 10;
    for (let i = 0; i < sparkCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 55 + Math.random() * 120;
      const life = 0.16 + Math.random() * 0.22;
      blastSparks.push({
        x: center.x,
        y: center.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length: 5 + Math.random() * 9,
        life,
        maxLife: life,
        color: type === "tree" ? "rgba(128, 100, 58, 0.72)" : "rgba(238, 194, 107, 0.7)"
      });
    }
  }

  function markWorldItemDestroyed(game, item, options = {}) {
    item.destroyed = true;
    item.stopsProjectiles = false;
    item.destroyTimer = 0;
    item.destroyDuration = options.duration ?? 0.58;
    item.breakAngle = Number.isFinite(options.angle) ? options.angle : item.angle || 0;
    item.breakForce = Math.max(0.85, options.force || 1);
    emitSceneryBreak(game, item);
  }

  function damageScenery(game, item, amount, options = {}) {
    if (!item?.destructible || item.destroyed) return false;
    item.maxHp = item.maxHp || item.baseHp || item.hp || Math.max(1, amount);
    item.hp = Math.max(0, (item.hp ?? item.maxHp) - amount);
    item.damageFlash = Math.max(item.damageFlash || 0, 0.34);
    if (item.hp > 0) return false;
    markWorldItemDestroyed(game, item, options);
    game.aiObservatory?.recordEvent?.({
      type: "scenery_destroyed",
      unitId: item.id || item.type,
      aiType: "world",
      reason: item.type || "scenery"
    });
    return true;
  }

  function damageObstacle(game, obstacle, amount, options = {}) {
    if (!isVehicleBreakableObstacle(obstacle)) return false;
    obstacle.destructible = true;
    obstacle.type = obstacle.type || obstacle.kind;
    obstacle.shape = obstacle.shape || "rect";
    obstacle.maxHp = obstacle.maxHp || obstacle.baseHp || obstacle.hp || obstacleImpactHp(obstacle.kind);
    obstacle.baseHp = obstacle.baseHp || obstacle.maxHp;
    obstacle.hp = Math.max(0, (obstacle.hp ?? obstacle.maxHp) - amount);
    obstacle.damageFlash = Math.max(obstacle.damageFlash || 0, 0.34);
    if (obstacle.hp > 0) return false;
    markWorldItemDestroyed(game, obstacle, options);
    game.aiObservatory?.recordEvent?.({
      type: "obstacle_destroyed",
      unitId: obstacle.id || obstacle.kind,
      aiType: "world",
      reason: obstacle.kind || "obstacle"
    });
    return true;
  }

  function expandEffectRadius(effect) {
    const maxLife = Math.max(0.001, Number.isFinite(effect.maxLife) ? effect.maxLife : 1);
    const t = clamp(1 - effect.life / maxLife, 0, 1);
    const radius = Math.max(0, Number.isFinite(effect.radius) ? effect.radius : 0);
    const maxRadius = Math.max(radius, Number.isFinite(effect.maxRadius) ? effect.maxRadius : radius);
    effect.radius = lerp(radius, maxRadius, t);
  }

  function smallArmsRangeScale(shooter, weapon) {
    if (!shooter?.isProne || weapon?.type && weapon.type !== "gun") return 1;
    if (weapon?.id === "lmg" || weapon?.id === "machinegun") return 1.1;
    if (weapon?.id === "sniper") return 1.05;
    if (weapon?.id === "pistol") return 1.04;
    return 1.08;
  }

  function smallArmsRange(weapon, shooter, baseRange = null) {
    const range = baseRange ?? weapon?.range ?? 560;
    return range * smallArmsRangeScale(shooter, weapon);
  }

  const smallArmsStability = (weapon, shooter, options = {}) => IronLine.combatSmallArmsStability?.profile?.(weapon, shooter, options) || { accuracyBonus: 0, tankAccuracyBonus: 0, spreadScale: 1 };

  function targetScoreAlive(target) {
    return Boolean(target && target.alive !== false && (target.hp === undefined || target.hp > 0) && !target.destructionPending);
  }

  function recordKillIfDestroyed(game, source, target, wasAlive, kind = "kill") {
    if (!wasAlive || targetScoreAlive(target)) return;
    game?.recordCombatKill?.(source, target, kind);
  }

  function directArmorProfile(tank, sourceX, sourceY, ammoId = "") {
    if (!tank || tank.vehicleType === "humvee") {
      return { zone: "light", multiplier: 1 };
    }

    const hitAngle = Math.atan2(sourceY - tank.y, sourceX - tank.x);
    const aspect = Math.abs(normalizeAngle(hitAngle - tank.angle));
    const zone = aspect <= 0.78
      ? "front"
      : aspect >= 2.38 ? "rear" : "side";

    const table = ammoId === "rpg"
      ? { front: 0.52, side: 0.92, rear: 1.42 }
      : ammoId === "ap"
        ? { front: 0.68, side: 1, rear: 1.34 }
        : { front: 0.82, side: 1, rear: 1.18 };

    return { zone, multiplier: table[zone] ?? 1 };
  }

  function armorZoneLabel(zone) {
    if (zone === "front") return "전면";
    if (zone === "rear") return "후면";
    if (zone === "side") return "측면";
    return "경장갑";
  }

  function directArmorSource(shell, tank) {
    let x = shell.previousX ?? shell.x;
    let y = shell.previousY ?? shell.y;
    if (distXY(x, y, tank.x, tank.y) <= 1 && shell.owner) {
      x = shell.owner.x ?? x;
      y = shell.owner.y ?? y;
    }
    return { x, y };
  }

  function emitDirectArmorFeedback(game, tank, impactX, impactY, profile, ammo) {
    if (!game?.effects || !tank || profile.zone === "light") return; IronLine.audio?.playMetalHit?.(game, { x: impactX, y: impactY }, { volume: ammo?.id === "rpg" ? 0.62 : 0.46 });

    const sparks = game.effects.blastSparks || (game.effects.blastSparks = []);
    const rings = game.effects.blastRings || (game.effects.blastRings = []);
    const frontHit = profile.zone === "front";
    const rearHit = profile.zone === "rear";
    const sparkCount = frontHit ? 7 : rearHit ? 12 : 9;
    const baseAngle = Math.atan2(impactY - tank.y, impactX - tank.x);

    rings.push({
      x: impactX,
      y: impactY,
      radius: 5,
      maxRadius: rearHit ? 36 : frontHit ? 20 : 28,
      life: 0.14,
      maxLife: 0.14,
      color: rearHit ? "rgba(255, 176, 92, 0.72)" : frontHit ? "rgba(202, 218, 214, 0.45)" : "rgba(255, 218, 142, 0.56)",
      width: rearHit ? 4 : 2.4
    });

    for (let i = 0; i < sparkCount; i += 1) {
      const spread = frontHit ? 1.25 : 0.92;
      const angle = baseAngle + Math.PI + (Math.random() - 0.5) * spread;
      const speed = (frontHit ? 80 : 105) + Math.random() * (rearHit ? 190 : 130);
      sparks.push({
        x: impactX,
        y: impactY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length: (frontHit ? 8 : 11) + Math.random() * (ammo?.id === "rpg" ? 14 : 9),
        life: 0.16 + Math.random() * 0.16,
        maxLife: 0.32,
        color: rearHit ? "rgba(255, 158, 76, 0.82)" : "rgba(255, 225, 154, 0.74)"
      });
    }
  }

  function directTankDamage(game, tank, baseDamage, shell) {
    if (!tank || !shell) return baseDamage;
    const source = directArmorSource(shell, tank);
    const profile = directArmorProfile(tank, source.x, source.y, shell.ammo?.id);
    const damage = baseDamage * profile.multiplier;
    tank.lastArmorHit = {
      zone: profile.zone,
      multiplier: profile.multiplier,
      ammoId: shell.ammo?.id || "",
      time: game?.matchTime || 0
    };
    emitDirectArmorFeedback(game, tank, shell.x, shell.y, profile, shell.ammo);
    game?.battlefieldEvents?.push?.({
      type: "armor_direct_hit",
      severity: profile.zone === "rear" ? "major" : "info",
      team: tank.team,
      title: "장갑 직격",
      detail: `${tank.callSign || "전차"} ${armorZoneLabel(profile.zone)} 피격 · ${Math.round(damage)} 피해`,
      chat: false
    });
    return damage;
  }

  function smallArmsDroneProfile(target, distance, range) {
    if (!target?.isDrone) {
      return {
        accuracyPenalty: 0,
        damageScale: 1,
        minAccuracy: null,
        maxAccuracy: null
      };
    }

    const attackDrone = target.droneRole === "attack";
    const speed = Number.isFinite(target.currentSpeed) ? Math.abs(target.currentSpeed) : Math.abs(target.speed || 0) * (target.boosting ? target.boostSpeedMultiplier || 1.6 : 1);
    const speedPenalty = clamp(speed / 1100, 0.06, attackDrone ? 0.18 : 0.15);
    const rangePenalty = clamp(distance / Math.max(range, 1), 0, 1) * (attackDrone ? 0.18 : 0.14);
    const controlPenalty = target.controlled ? 0.07 : 0.03;

    return {
      accuracyPenalty: (attackDrone ? 0.23 : 0.2) + speedPenalty + rangePenalty + controlPenalty,
      damageScale: attackDrone ? 0.52 : 0.58,
      minAccuracy: attackDrone ? 0.025 : 0.035,
      maxAccuracy: attackDrone ? 0.38 : 0.44
    };
  }

  function pointOnRoad(game, x, y) {
    const world = game?.world;
    if (!world) return false;
    const baseWidth = world.roadWidth || 84;
    for (const road of world.roads || []) {
      if (!road || road.length < 2) continue;
      const halfWidth = (road.width || baseWidth) * 0.52;
      for (let i = 1; i < road.length; i += 1) {
        const a = road[i - 1];
        const b = road[i];
        if (segmentDistanceToPoint(a.x, a.y, b.x, b.y, x, y) <= halfWidth) return true;
      }
    }
    return false;
  }

  function patchLooksLikeGrass(patch) {
    const match = String(patch?.color || "").match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/u);
    if (!match) return true;
    const r = Number(match[1]);
    const g = Number(match[2]);
    const b = Number(match[3]);
    return g >= r * 0.92 && g >= b * 0.78;
  }

  function pointOnGrass(game, x, y) {
    for (const patch of game?.world?.terrainPatches || []) {
      if (!patchLooksLikeGrass(patch)) continue;
      if (distXY(x, y, patch.x, patch.y) <= (patch.r || 0) * 0.92) return true;
    }
    return false;
  }

  function smallArmsSurface(game, x, y, options = {}) {
    if (options.tank) return "metal";
    if (options.hard) return "hard";
    if (pointOnRoad(game, x, y)) return "road";
    if (pointOnGrass(game, x, y)) return "grass";
    return "dirt";
  }

  function emitSmallArmsImpact(game, x, y, angle, weapon, options = {}) {
    if (!game?.effects) return;

    const hard = Boolean(options.hard || options.tank);
    const heavy = weapon?.id === "machinegun" || weapon?.id === "lmg" || weapon?.id === "sniper";
    const dustPuffs = game.effects.dustPuffs || (game.effects.dustPuffs = []);
    const blastSparks = game.effects.blastSparks || (game.effects.blastSparks = []);
    const emitDust = (scale, alpha, color, drift = 1) => {
      const life = 0.12 + Math.random() * 0.09;
      pushLimited(dustPuffs, {
        x: x + (Math.random() - 0.5) * 3,
        y: y + (Math.random() - 0.5) * 3,
        vx: -Math.cos(angle) * (10 + Math.random() * 20) * drift + (Math.random() - 0.5) * 18,
        vy: -Math.sin(angle) * (10 + Math.random() * 20) * drift + (Math.random() - 0.5) * 18,
        angle: angle + (Math.random() - 0.5) * 1.1,
        radius: Math.max(1.2, scale * (1.2 + Math.random() * 0.7)),
        maxRadius: scale * (5.5 + Math.random() * 4.5),
        life,
        maxLife: life,
        alpha,
        color
      }, 190);
    };
    const emitChip = (count, color, speedMin, speedMax, alpha = 0.68, width = 0.65) => {
      for (let i = 0; i < count; i += 1) {
        const chipAngle = Math.PI + angle + (Math.random() - 0.5) * 1.85;
        const speed = speedMin + Math.random() * Math.max(1, speedMax - speedMin);
        const life = 0.07 + Math.random() * 0.08;
        pushLimited(blastSparks, {
          x: x + (Math.random() - 0.5) * 2,
          y: y + (Math.random() - 0.5) * 2,
          vx: Math.cos(chipAngle) * speed,
          vy: Math.sin(chipAngle) * speed,
          length: 1.8 + Math.random() * 3,
          life,
          maxLife: life,
          color,
          width,
          alpha
        }, 220);
      }
    };

    if (hard) {
      const sparkCount = heavy ? 5 : 3;
      for (let i = 0; i < sparkCount; i += 1) {
        const spread = Math.PI + angle + (Math.random() - 0.5) * 1.35;
        const speed = 100 + Math.random() * (heavy ? 190 : 120);
        const life = 0.055 + Math.random() * 0.07;
        pushLimited(blastSparks, {
          x: x + (Math.random() - 0.5) * 2,
          y: y + (Math.random() - 0.5) * 2,
          vx: Math.cos(spread) * speed,
          vy: Math.sin(spread) * speed,
          length: 3 + Math.random() * (heavy ? 7 : 4),
          life,
          maxLife: life,
          color: options.tank ? "rgba(255, 222, 146, 0.92)" : "rgba(255, 205, 125, 0.78)",
          width: options.tank ? 1.25 : 0.95,
          alpha: options.tank ? 1 : 0.82
        }, 220);
      }
      emitDust(heavy ? 1.35 : 1.05, options.tank ? 0.13 : 0.18, options.tank ? "#b8b9ad" : "#a8ada2", 0.55);

      const explosions = game.effects.explosions || (game.effects.explosions = []);
      pushLimited(explosions, {
        x,
        y,
        radius: 1.7,
        maxRadius: heavy ? 9 : 6,
        life: 0.065,
        maxLife: 0.065,
        color: "rgba(255, 236, 170, 0.45)"
      }, 180); if (options.tank && Math.random() < 0.38) IronLine.audio?.playMetalHit?.(game, { x, y }, { volume: heavy ? 0.34 : 0.24 });
      return;
    }

    const surface = options.surface || smallArmsSurface(game, x, y, options);
    if (surface === "road") {
      emitDust(heavy ? 1.38 : 1.08, heavy ? 0.19 : 0.13, "#a7a18e", 0.78);
      if (heavy || Math.random() < 0.48) emitDust(heavy ? 0.9 : 0.72, heavy ? 0.11 : 0.075, "#5d5e50", 0.55);
      emitChip(heavy ? 3 : 1, "rgba(178, 174, 151, 0.62)", 42, heavy ? 132 : 88, 0.64, 0.58);
      return;
    }

    if (surface === "grass") {
      emitDust(heavy ? 1.48 : 1.08, heavy ? 0.16 : 0.1, "#9a9164", 0.9);
      if (heavy || Math.random() < 0.55) emitDust(heavy ? 1.05 : 0.78, heavy ? 0.1 : 0.07, "#587148", 0.72);
      emitChip(heavy ? 4 : 2, "rgba(108, 151, 81, 0.58)", 34, heavy ? 110 : 76, 0.58, 0.5);
      return;
    }

    emitDust(heavy ? 1.65 : 1.25, heavy ? 0.18 : 0.12, "#cbb987", 1);
    if (heavy || Math.random() < 0.42) emitDust(heavy ? 1.15 : 0.9, heavy ? 0.12 : 0.08, "#8e8262", 0.72);
    if (heavy && Math.random() < 0.55) {
      emitChip(1, "rgba(184, 157, 103, 0.54)", 45, 130, 0.68, 0.65);
    }
  }

  function smallArmsMuzzleDistance(weapon, shooter) { return shooter?.isProne ? (weapon?.id === "pistol" ? 22 : weapon?.id === "sniper" ? 54 : 46) : ({ pistol: 22, smg: 34, rifle: 42, machinegun: 46, lmg: 46, sniper: 54 }[weapon?.id] || (shooter.radius || 10) + 18); }
  function fireRifle(game, shooter, target, options = {}) {
    if (shooter.alive === false || !target || target.alive === false || target.hp <= 0 || (shooter.team && target.team && shooter.team === target.team)) return false;
    if (shooter.inVehicle) return false;
    if (target.inVehicle) return false;
    if (target === game.player && game.isPlayerInSafeZone?.()) return false;

    const weapon = options.weapon || INFANTRY_WEAPONS[shooter.weaponId] || INFANTRY_WEAPONS.rifle;
    const baseRange = options.range || weapon.range || 560, range = smallArmsRange(weapon, shooter, baseRange);
    const stability = smallArmsStability(weapon, shooter, options);
    const distance = distXY(shooter.x, shooter.y, target.x, target.y);
    if (distance > range) return false;
    if (target.isDrone && game.droneHasRoofCover?.(target) && !options.allowRoofDroneHit) return false;
    if (options.requireLineOfSight !== false && !IronLine.physics.hasLineOfSight(game, shooter, target, { padding: 3 })) return false;

    const baseAccuracy = options.baseAccuracy ?? 0.78;
    const accuracyFalloff = options.accuracyFalloff ?? 0.38;
    const minAccuracy = options.minAccuracy ?? 0.22;
    const maxAccuracy = options.maxAccuracy ?? 0.86;
    const accuracyDistance = options.accuracyDistance ?? distance;
    const shooterProneBonus = shooter.isProne ? 0.05 : 0;
    const targetPronePenalty = target.isProne ? clamp(0.06 + distance / range * 0.13, 0.06, 0.19) : 0;
    const droneProfile = smallArmsDroneProfile(target, distance, range);
    const effectiveMinAccuracy = droneProfile.minAccuracy ?? minAccuracy;
    const effectiveMaxAccuracy = droneProfile.maxAccuracy !== null
      ? Math.min(maxAccuracy, droneProfile.maxAccuracy)
      : maxAccuracy;
    const hitChance = clamp(
      baseAccuracy - accuracyDistance / range * accuracyFalloff + (options.accuracyBonus || 0) + stability.accuracyBonus + shooterProneBonus - targetPronePenalty - droneProfile.accuracyPenalty,
      effectiveMinAccuracy,
      effectiveMaxAccuracy
    );
    const muzzleDistance = options.muzzleDistance ?? smallArmsMuzzleDistance(weapon, shooter);
    const startX = options.startX ?? shooter.x + Math.cos(shooter.angle) * muzzleDistance;
    const startY = options.startY ?? shooter.y + Math.sin(shooter.angle) * muzzleDistance;
    const hit = Math.random() < hitChance;
    const missAngle = shooter.angle + (Math.random() - 0.5) * (options.spread ?? weapon.spread ?? 0.34) * stability.spreadScale;
    const endX = hit ? target.x : startX + Math.cos(missAngle) * Math.min(range, distance + 80);
    const endY = hit ? target.y : startY + Math.sin(missAngle) * Math.min(range, distance + 80);
    const tankBlock = findSmallArmsTankHit(game, shooter, startX, startY, endX, endY, options);
    const { firstBlock, finalTankBlock, finalBodyBlock, finalEndX, finalEndY } = friendlyBodyBlock.resolve(game, shooter, startX, startY, endX, endY, tankBlock, { ignoreTarget: target, ignoreFriendlyBodyBlock: options.ignoreFriendlyBodyBlock });
    const impactAngle = firstBlock
      ? Math.atan2(finalEndY - startY, finalEndX - startX)
      : hit ? Math.atan2(endY - startY, endX - startX) : missAngle;

    const tracers = game.effects.tracers || (game.effects.tracers = []);
    if (tracers.length > 180) tracers.shift();
    tracers.push({
      x1: startX,
      y1: startY,
      x2: finalEndX,
      y2: finalEndY,
      life: options.tracerLife || weapon.tracerLife || 0.09,
      maxLife: options.tracerLife || weapon.tracerLife || 0.09,
      color: options.tracerColor || (shooter.team === TEAM.BLUE ? "rgba(177, 220, 255, 0.92)" : "rgba(255, 176, 171, 0.92)"),
      width: options.tracerWidth || weapon.visualWidth || 2,
      length: options.tracerLength || weapon.visualLength || 18
    }); IronLine.audio?.playWeaponFire?.(game, shooter, weapon);

    awarenessSignals.notifyGunfireSuspicion?.(game, shooter, startX, startY, finalEndX, finalEndY, weapon, { hitTarget: hit && !firstBlock ? target : null });
    if (finalBodyBlock) applyLineSuppression(game, shooter, startX, startY, finalEndX, finalEndY, weapon, target.team ?? null);
    else applyRifleSuppression(game, shooter, target, startX, startY, finalEndX, finalEndY, hit && !finalTankBlock, weapon);
    if (!finalBodyBlock && target === game.player && game.isLocalPlayerEnemyFor?.(shooter.team)) {
      game.warnPlayerDanger?.(shooter, weapon.id === "sniper" ? "sniper" : weapon.id, {
        ttl: weapon.id === "sniper" ? 1.25 : 0.76
      });
    }

    if (finalBodyBlock) friendlyBodyBlock.emit(game, shooter, finalBodyBlock.unit, finalEndX, finalEndY, impactAngle, weapon);
    else if (finalTankBlock) {
      if (finalTankBlock.wreck) applySmallArmsWreckHit(game, shooter, finalTankBlock.tank, finalEndX, finalEndY, weapon);
      else applySmallArmsTankHit(game, shooter, finalTankBlock.tank, finalEndX, finalEndY, weapon, options);
    } else if (hit) {
      const baseDamage = options.damage || (weapon.damageMin + Math.random() * (weapon.damageMax - weapon.damageMin));
      const damage = baseDamage * droneProfile.damageScale;
      emitSmallArmsImpact(game, finalEndX, finalEndY, impactAngle, weapon, {
        hard: Boolean(target.vehicleType),
        tank: Boolean(target.vehicleType)
      });
      const targetWasAlive = targetScoreAlive(target);
      if (target === game.player && typeof game.applyPlayerDamage === "function") {
        game.applyPlayerDamage(damage, shooter, weapon.id || "rifle", {
          label: weapon.id === "sniper" ? "\uC800\uACA9" : "\uCD1D\uACA9"
        });
      } else if (target.takeDamage) {
        if (target.vehicleType) target.takeDamage(game, damage);
        else target.takeDamage(damage, shooter);
      } else if (target.hp !== undefined) target.hp = Math.max(0, target.hp - damage);
      if (shooter === game.player) game.recordPlayerHitConfirm?.(target, damage, weapon.id || "rifle", { x: finalEndX, y: finalEndY, lethal: targetWasAlive && !targetScoreAlive(target) });
      recordKillIfDestroyed(game, shooter, target, targetWasAlive, weapon.id || "rifle");
    } else if (Math.random() < (options.impactChance ?? 0.16)) {
      emitSmallArmsImpact(game, finalEndX, finalEndY, impactAngle, weapon);
    }

    return true;
  }

  function fireRifleAtPoint(game, shooter, aimX, aimY, options = {}) {
    if (shooter.alive === false || shooter.hp <= 0) return false;
    if (shooter.inVehicle) return false;

    const weapon = options.weapon || INFANTRY_WEAPONS[shooter.weaponId] || INFANTRY_WEAPONS.rifle;
    const baseRange = options.range || weapon.range || 560, range = smallArmsRange(weapon, shooter, baseRange);
    const stability = smallArmsStability(weapon, shooter, options);
    const muzzleDistance = options.muzzleDistance ?? smallArmsMuzzleDistance(weapon, shooter);
    const startX = options.startX ?? shooter.x + Math.cos(shooter.angle) * muzzleDistance;
    const startY = options.startY ?? shooter.y + Math.sin(shooter.angle) * muzzleDistance;
    const aimAngle = Math.atan2(aimY - startY, aimX - startX);
    const shotAngle = aimAngle + (Math.random() - 0.5) * (options.spread ?? weapon.spread ?? 0.22) * 0.18 * stability.spreadScale;
    const impact = traceSmallArmsShot(game, shooter, startX, startY, shotAngle, range, options);

    const tracers = game.effects.tracers || (game.effects.tracers = []);
    if (tracers.length > 180) tracers.shift();
    tracers.push({
      x1: startX,
      y1: startY,
      x2: impact.x,
      y2: impact.y,
      life: options.tracerLife || weapon.tracerLife || 0.09,
      maxLife: options.tracerLife || weapon.tracerLife || 0.09,
      color: options.tracerColor || (shooter.team === TEAM.BLUE ? "rgba(177, 220, 255, 0.86)" : "rgba(255, 176, 171, 0.86)"),
      width: options.tracerWidth || weapon.visualWidth || 2,
      length: options.tracerLength || weapon.visualLength || 18
    }); IronLine.audio?.playWeaponFire?.(game, shooter, weapon);

    if (impact.tank) {
      if (impact.wreck) applySmallArmsWreckHit(game, shooter, impact.tank, impact.x, impact.y, weapon);
      else applySmallArmsTankHit(game, shooter, impact.tank, impact.x, impact.y, weapon, options);
    }
    else if (impact.friendlyBodyBlock) friendlyBodyBlock.emit(game, shooter, impact.friendlyBodyBlock, impact.x, impact.y, shotAngle, weapon);
    else if (impact.blocked || Math.random() < (options.impactChance ?? 0.28)) {
      emitSmallArmsImpact(game, impact.x, impact.y, shotAngle, weapon, { hard: impact.blocked });
    }
    awarenessSignals.notifyGunfireSuspicion?.(game, shooter, startX, startY, impact.x, impact.y, weapon, { hitTarget: impact.tank && !impact.wreck ? impact.tank : null });
    applyLineSuppression(game, shooter, startX, startY, impact.x, impact.y, weapon, options.targetTeam);
    return true;
  }

  function fireRifleAtTank(game, shooter, tank, options = {}) {
    if (shooter.alive === false || shooter.hp <= 0 || !tank || !tank.alive || tank.team === shooter.team) return false;
    if (shooter.inVehicle) return false;

    const weapon = options.weapon || INFANTRY_WEAPONS[shooter.weaponId] || INFANTRY_WEAPONS.rifle;
    const baseRange = options.range || weapon.range || 560, range = smallArmsRange(weapon, shooter, baseRange);
    const stability = smallArmsStability(weapon, shooter, options);
    const distance = distXY(shooter.x, shooter.y, tank.x, tank.y);
    if (distance > range) return false;
    if (!IronLine.physics.hasLineOfSight(game, shooter, tank, { padding: 3 })) return false;

    const muzzleDistance = options.muzzleDistance ?? smallArmsMuzzleDistance(weapon, shooter);
    const startX = options.startX ?? shooter.x + Math.cos(shooter.angle) * muzzleDistance;
    const startY = options.startY ?? shooter.y + Math.sin(shooter.angle) * muzzleDistance;
    const baseChance = weapon.id === "lmg" || weapon.id === "machinegun" ? 0.2 : 0.13;
    const hitChance = clamp(baseChance - distance / range * 0.08 + (options.accuracyBonus || 0) + stability.tankAccuracyBonus + (shooter.isProne ? 0.025 : 0), 0.04, 0.24);
    const hit = Math.random() < hitChance;
    const missAngle = shooter.angle + (Math.random() - 0.5) * (options.spread ?? weapon.spread ?? 0.34) * stability.spreadScale;
    const endX = hit ? tank.x + (Math.random() - 0.5) * tank.radius : startX + Math.cos(missAngle) * Math.min(range, distance + 90);
    const endY = hit ? tank.y + (Math.random() - 0.5) * tank.radius : startY + Math.sin(missAngle) * Math.min(range, distance + 90);
    const tankBlock = findSmallArmsTankHit(game, shooter, startX, startY, endX, endY, { ...options, ignoreVehicle: tank });
    const { firstBlock, finalTankBlock, finalBodyBlock, finalEndX, finalEndY } = friendlyBodyBlock.resolve(game, shooter, startX, startY, endX, endY, tankBlock, { ignoreFriendlyBodyBlock: options.ignoreFriendlyBodyBlock });
    const finalAngle = firstBlock ? Math.atan2(finalEndY - startY, finalEndX - startX) : missAngle;

    const tracers = game.effects.tracers || (game.effects.tracers = []);
    if (tracers.length > 180) tracers.shift();
    tracers.push({
      x1: startX,
      y1: startY,
      x2: finalEndX,
      y2: finalEndY,
      life: options.tracerLife || weapon.tracerLife || 0.09,
      maxLife: options.tracerLife || weapon.tracerLife || 0.09,
      color: shooter.team === TEAM.BLUE ? "rgba(177, 220, 255, 0.86)" : "rgba(255, 176, 171, 0.86)",
      width: options.tracerWidth || weapon.visualWidth || 2,
      length: options.tracerLength || weapon.visualLength || 18
    });

    if (finalBodyBlock) friendlyBodyBlock.emit(game, shooter, finalBodyBlock.unit, finalEndX, finalEndY, finalAngle, weapon);
    else if (finalTankBlock) {
      if (finalTankBlock.wreck) applySmallArmsWreckHit(game, shooter, finalTankBlock.tank, finalEndX, finalEndY, weapon);
      else applySmallArmsTankHit(game, shooter, finalTankBlock.tank, finalEndX, finalEndY, weapon, options);
    } else if (hit) {
      applySmallArmsTankHit(game, shooter, tank, finalEndX, finalEndY, weapon, options);
    } else if (Math.random() < (options.impactChance ?? 0.18)) {
      emitSmallArmsImpact(game, finalEndX, finalEndY, finalAngle, weapon);
    }

    awarenessSignals.notifyGunfireSuspicion?.(game, shooter, startX, startY, finalEndX, finalEndY, weapon, { hitTarget: hit && !firstBlock ? tank : null });
    return true;
  }

  function throwGrenade(game, shooter, aimX, aimY, options = {}) {
    const weapon = options.weapon || INFANTRY_WEAPONS.grenade;
    const aimedDistance = distXY(shooter.x, shooter.y, aimX, aimY);
    const throwTime = clamp(
      (weapon.throwTime || 0.78) * (0.86 + aimedDistance / Math.max(1, weapon.range || 360) * 0.24),
      0.48,
      1.05
    );
    return launchInfantryProjectile(game, shooter, aimX, aimY, {
      ...weapon,
      id: "grenade",
      sourceWeaponId: weapon.id || "grenade",
      color: weapon.id === "grenadeLauncher" ? "#b9c0a4" : "#59654d",
      maxDistance: weapon.range,
      fuseExtra: 0,
      fuseTime: weapon.fuseTime || 2.15,
      throwTime,
      impactDetonate: weapon.impactDetonate === true,
      bounceDamping: weapon.bounceDamping ?? 0.18,
      groundDrag: weapon.groundDrag ?? 0.08
    });
  }

  function fireRpg(game, shooter, aimX, aimY, options = {}) {
    const weapon = options.weapon || INFANTRY_WEAPONS.rpg;
    const aimStability = clamp(options.aimStability ?? 1, 0, 1);
    return launchInfantryProjectile(game, shooter, aimX, aimY, {
      ...weapon,
      id: "rpg",
      color: "#ffb45c",
      maxDistance: weapon.range,
      minDistance: weapon.minRange || 0,
      fuseExtra: 0,
      spread: (weapon.spread || 0.02) + (1 - aimStability) * 0.13,
      aimStability
    });
  }

  function launchInfantryProjectile(game, shooter, aimX, aimY, ammo) {
    if (shooter.alive === false || shooter.hp <= 0) return false;
    if (shooter.inVehicle) return false;

    const muzzleDistance = shooter.radius + 12;
    const baseAngle = Math.atan2(aimY - shooter.y, aimX - shooter.x);
    const angle = baseAngle + (Math.random() - 0.5) * (ammo.spread || 0);
    const startX = shooter.x + Math.cos(angle) * muzzleDistance;
    const startY = shooter.y + Math.sin(angle) * muzzleDistance;
    const aimedDistance = distXY(shooter.x, shooter.y, aimX, aimY);
    if (ammo.minDistance && aimedDistance < ammo.minDistance) return false;
    const travelDistance = clamp(aimedDistance, 44, ammo.maxDistance || ammo.range || 420);
    const speed = ammo.throwTime
      ? travelDistance / Math.max(0.2, ammo.throwTime)
      : ammo.speed || 420;
    const life = ammo.fuseTime || Math.max(0.12, travelDistance / (ammo.speed || 420) + (ammo.fuseExtra || 0));
    const projectile = {
      x: startX,
      y: startY,
      previousX: startX,
      previousY: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      team: shooter.team,
      owner: shooter,
      ammo,
      life,
      age: 0,
      travelTime: ammo.throwTime || 0,
      landed: false,
      radius: ammo.shellRadius || 5
    }; game.publishOnlineProjectileLaunch?.(projectile, { shooter, weaponId: ammo.sourceWeaponId || ammo.id, aimX, aimY });
    game.projectiles.push(projectile);

    if (ammo.id === "rpg") { IronLine.audio?.play?.("rpg-fire", { game, x: startX, y: startY, volume: 0.58 });
      game.effects.explosions.push({
        x: startX,
        y: startY,
        radius: 8,
        maxRadius: 26,
        life: 0.18,
        maxLife: 0.18,
        color: "rgba(255, 222, 166, 0.84)"
      });
    }

    return true;
  }

  function traceSmallArmsShot(game, shooter, startX, startY, angle, range, options = {}) {
    const step = 14;
    let lastX = startX;
    let lastY = startY;

    for (let distance = step; distance <= range; distance += step) {
      const x = startX + Math.cos(angle) * distance;
      const y = startY + Math.sin(angle) * distance;
      if (x < 0 || y < 0 || x > game.world.width || y > game.world.height) return { x: lastX, y: lastY };

      const blocked = IronLine.physics?.lineBlockedByWorld
        ? IronLine.physics.lineBlockedByWorld(game, lastX, lastY, x, y, {
          padding: 2,
          includeWrecks: false,
          ignore: [shooter],
          ignoreBlockerContainingA: true
        })
        : game.world.obstacles.some((obstacle) => !obstacle.destroyed && (
          circleRectCollision(x, y, 2, obstacle) ||
          lineIntersectsRect(lastX, lastY, x, y, obstacle)
        ));
      if (blocked) return { x, y, blocked: true };

      const hitTank = findSmallArmsTankHit(game, shooter, lastX, lastY, x, y, options);
      const hitFriendlyBody = friendlyBodyBlock.find(game, shooter, lastX, lastY, x, y, options);
      const firstHit = friendlyBodyBlock.nearest(lastX, lastY, hitFriendlyBody, hitTank);
      if (firstHit?.bodyBlocked) return { x: firstHit.x, y: firstHit.y, friendlyBodyBlock: firstHit.unit, bodyBlocked: true };
      if (firstHit?.tank) return { x: firstHit.x, y: firstHit.y, tank: firstHit.tank, wreck: firstHit.wreck };

      lastX = x;
      lastY = y;
    }

    return { x: lastX, y: lastY };
  }

  function findSmallArmsTankHit(game, shooter, x1, y1, x2, y2, options = {}) {
    let best = null;
    let bestT = Infinity;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = Math.max(1, dx * dx + dy * dy);

    for (const tank of vehicleTargets(game)) {
      const wreck = isVehicleWreck(tank);
      if (tank === shooter) continue;
      if (tank === shooter?.sourceVehicle || tank === options.ignoreVehicle || options.ignoreVehicles?.includes?.(tank)) continue;
      if (options.onlyWrecks && !wreck) continue;
      if (wreck && options.ignoreWrecks) continue;
      if (!wreck && !tank.alive) continue;

      const laneDistance = segmentDistanceToPoint(x1, y1, x2, y2, tank.x, tank.y);
      if (laneDistance > tank.radius + 2) continue;

      const t = clamp(((tank.x - x1) * dx + (tank.y - y1) * dy) / lenSq, 0, 1);
      if (t >= bestT) continue;
      const impactDistance = Math.max(0, Math.hypot(tank.radius, 0) - 2);
      const impactX = tank.x - dx / Math.sqrt(lenSq) * impactDistance;
      const impactY = tank.y - dy / Math.sqrt(lenSq) * impactDistance;
      best = { tank, x: impactX, y: impactY, wreck };
      bestT = t;
    }

    return best;
  }

  function applySmallArmsWreckHit(game, shooter, wreck, x, y, weapon) {
    if (!isVehicleWreck(wreck)) return false;
    emitSmallArmsImpact(game, x, y, Math.atan2(y - shooter.y, x - shooter.x), weapon, {
      hard: true,
      tank: true
    });

    game.effects.explosions.push({
      x,
      y,
      radius: 1.8,
      maxRadius: weapon.id === "sniper" ? 14 : 9,
      life: 0.11,
      maxLife: 0.11,
      color: "rgba(220, 226, 213, 0.42)"
    });
    return true;
  }

  function applySmallArmsTankHit(game, shooter, tank, x, y, weapon, options = {}) {
    if (!tank?.alive) return false;
    const friendly = tank.team === shooter.team;
    const chipDamage = friendly ? 0 : options.damage ?? smallArmsTankDamage(weapon, tank);
    const tankWasAlive = targetScoreAlive(tank);
    if (chipDamage > 0) {
      tank.hp = Math.max(0, tank.hp - chipDamage); tank.healthRevealTimer = Math.max(tank.healthRevealTimer || 0, 1.45);
    }
    emitSmallArmsImpact(game, x, y, Math.atan2(y - shooter.y, x - shooter.x), weapon, {
      hard: true,
      tank: true
    });
    game.effects.explosions.push({
      x,
      y,
      radius: 2,
      maxRadius: weapon.id === "sniper" ? 16 : 11,
      life: 0.13,
      maxLife: 0.13,
      color: friendly ? "rgba(210, 226, 232, 0.46)" : "rgba(255, 242, 168, 0.7)"
    });
    if (!friendly && tank.hp <= 0 && tank.alive) tank.takeDamage(game, 0.01, { weaponId: weapon.id || "small-arms", cause: `${weapon.id || "small-arms"}_direct` });
    recordKillIfDestroyed(game, shooter, tank, tankWasAlive, weapon.id || "small-arms");
    return true;
  }

  function smallArmsTankDamage(weapon, tank = null) {
    const lightVehicle = tank?.vehicleType === "humvee";
    if (!weapon) return lightVehicle ? 0.2 : 0.05;
    if (lightVehicle && Number.isFinite(weapon.lightVehicleDamage)) return weapon.lightVehicleDamage;
    if (!lightVehicle && Number.isFinite(weapon.tankDamage)) return weapon.tankDamage;
    if (weapon.vehicleMounted) return lightVehicle ? 1.45 : 0.24;
    if (weapon.id === "lmg" || weapon.id === "machinegun") return lightVehicle ? 0.65 : 0.14;
    if (weapon.id === "sniper") return lightVehicle ? 0.42 : 0.1;
    return weapon.id === "smg" || weapon.id === "pistol" ? (lightVehicle ? 0.12 : 0.03) : (lightVehicle ? 0.22 : 0.06);
  }

  function applyLineSuppression(game, shooter, startX, startY, endX, endY, weapon, targetTeam = null) {
    const supportWeapon = weapon.id === "lmg" || weapon.id === "machinegun";
    const [lineRadius, impactRadius] = supportWeapon ? [82, 96] : [58, 68];
    for (const unit of game.infantry || []) {
      if (!unit.alive || unit.inVehicle || unit.team === shooter.team) continue;
      if (targetTeam && unit.team !== targetTeam) continue;

      const lineDistance = segmentDistanceToPoint(startX, startY, endX, endY, unit.x, unit.y);
      const endDistance = distXY(endX, endY, unit.x, unit.y);
      const nearLine = lineDistance < lineRadius;
      const nearImpact = endDistance < impactRadius;
      if (!nearLine && !nearImpact) continue;

      const linePressure = nearLine ? weapon.lineSuppression * (supportWeapon ? 1.15 : 0.58) * (1 - lineDistance / lineRadius) : 0;
      const impactPressure = nearImpact ? weapon.impactSuppression * (supportWeapon ? 0.95 : 0.72) * (1 - endDistance / impactRadius) : 0;
      unit.suppress(Math.max(linePressure, impactPressure), awarenessSignals.suppressionSourceForUnit?.(game, unit, shooter, false) || shooter);
    }
  }

  function applyRifleSuppression(game, shooter, target, startX, startY, endX, endY, hit, weapon) {
    const targetTeam = target.team ?? null;
    const supportWeapon = weapon.id === "lmg" || weapon.id === "machinegun";
    if (target.suppress && !target.inVehicle) target.suppress(hit ? weapon.suppressionHit * 1.05 : weapon.suppressionMiss * 1.55, awarenessSignals.suppressionSourceForUnit?.(game, target, shooter, hit) || shooter);

    for (const unit of game.infantry || []) {
      if (!unit.alive || unit.inVehicle || unit === target || unit.team === shooter.team) continue;
      if (targetTeam && unit.team !== targetTeam) continue;

      const lineDistance = segmentDistanceToPoint(startX, startY, endX, endY, unit.x, unit.y);
      const endDistance = distXY(endX, endY, unit.x, unit.y);
      const [lineRadius, impactRadius] = supportWeapon ? [76, 88] : [62, 72];
      const nearLine = lineDistance < lineRadius;
      const nearImpact = endDistance < impactRadius;
      if (!nearLine && !nearImpact) continue;

      const linePressure = nearLine ? weapon.lineSuppression * (supportWeapon ? 1.65 : 1.35) * (1 - lineDistance / lineRadius) : 0;
      const impactPressure = nearImpact ? weapon.impactSuppression * (supportWeapon ? 1.5 : 1.35) * (1 - endDistance / impactRadius) : 0;
      unit.suppress(Math.max(linePressure, impactPressure), awarenessSignals.suppressionSourceForUnit?.(game, unit, shooter, false) || shooter);
    }
  }

  function isDelayedGrenade(shell) {
    return shell?.ammo?.id === "grenade" && shell.ammo.impactDetonate !== true;
  }

  function settleDelayedGrenade(shell) {
    const damping = shell.ammo.bounceDamping ?? 0.18;
    shell.x = shell.previousX;
    shell.y = shell.previousY;
    shell.vx *= -damping;
    shell.vy *= -damping;
    shell.landed = true;
    shell.travelTime = 0;
    if (Math.hypot(shell.vx, shell.vy) < 28) {
      shell.vx = 0;
      shell.vy = 0;
    }
  }

  function updateProjectiles(game, dt) {
    const projectiles = game.projectiles;

    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const shell = projectiles[i];
      shell.life -= dt;
      shell.age = (shell.age || 0) + dt;

      if (isDelayedGrenade(shell) && shell.travelTime && shell.age >= shell.travelTime) {
        shell.landed = true;
        shell.travelTime = 0;
        shell.vx *= 0.2;
        shell.vy *= 0.2;
      }

      if (isDelayedGrenade(shell) && shell.landed) {
        const drag = Math.pow(shell.ammo.groundDrag ?? 0.08, dt);
        shell.vx *= drag;
        shell.vy *= drag;
      }

      shell.previousX = shell.x;
      shell.previousY = shell.y;
      shell.x += shell.vx * dt;
      shell.y += shell.vy * dt;

      if (shell.ammo.id === "rpg") {
        const tracers = game.effects.tracers || (game.effects.tracers = []);
        tracers.push({
          x1: shell.previousX,
          y1: shell.previousY,
          x2: shell.x,
          y2: shell.y,
          life: 0.13,
          maxLife: 0.13,
          color: "rgba(255, 199, 120, 0.78)",
          width: 3.2,
          length: 26
        });
      }

      const outOfBounds = shell.life <= 0 ||
        shell.x < 0 || shell.y < 0 ||
        shell.x > game.world.width || shell.y > game.world.height;

      if (outOfBounds) {
        resolveImpact(game, shell, null);
        projectiles.splice(i, 1);
        continue;
      }

      if (game.isLocalPlayerEnemyFor?.(shell.team)) {
        const playerDistance = distXY(shell.x, shell.y, game.player.x, game.player.y);
        const warningRange = shell.ammo.id === "rpg" ? 260 : shell.ammo.id === "grenade" ? 185 : 230;
        if (playerDistance <= warningRange) {
          game.warnPlayerDanger?.(shell.owner || shell, shell.ammo.id || "shell", {
            key: shell,
            ttl: 0.32
          });
        }
      }

      let hit = null;
      for (const obstacle of game.world.obstacles) {
        if (obstacle.destroyed) continue;
        const hitObstacle = circleRectCollision(shell.x, shell.y, shell.radius, obstacle) ||
          lineIntersectsRect(shell.previousX, shell.previousY, shell.x, shell.y, obstacle);
        if (hitObstacle) {
          hit = { obstacle };
          break;
        }
      }

      if (!hit) {
        const sceneryHit = findProjectileSceneryHit(game, shell);
        if (sceneryHit) hit = { scenery: sceneryHit };
      }

      if (!hit) {
        for (const tank of vehicleTargets(game)) {
          const wreck = isVehicleWreck(tank);
          if (tank === shell.owner) continue;
          if (!wreck && !tank.alive) continue;
          const shellDistance = segmentDistanceToPoint(
            shell.previousX,
            shell.previousY,
            shell.x,
            shell.y,
            tank.x,
            tank.y
          );
          if (shellDistance <= tank.radius + shell.radius) {
            hit = wreck
              ? { wreck: tank }
              : tank.team === shell.team ? { friendlyTank: tank } : { tank };
            break;
          }
        }
      }

      if (!hit) {
        for (const unit of game.infantry || []) {
          if (!unit.alive || unit.inVehicle || unit.team === shell.team) continue;
          const shellDistance = segmentDistanceToPoint(
            shell.previousX,
            shell.previousY,
            shell.x,
            shell.y,
            unit.x,
            unit.y
          );
          if (shellDistance <= unit.radius + shell.radius) {
            hit = { infantryUnit: unit };
            break;
          }
        }
      }

      if (!hit && game.isLocalPlayerEnemyFor?.(shell.team)) {
        const shellDistance = segmentDistanceToPoint(
          shell.previousX,
          shell.previousY,
          shell.x,
          shell.y,
          game.player.x,
          game.player.y
        );
        if (shellDistance <= game.player.radius + shell.radius) {
          hit = { infantry: true };
        }
      }

      if (hit) {
        if (isDelayedGrenade(shell)) {
          settleDelayedGrenade(shell);
          continue;
        }

        if (hit.scenery && shell.ammo.id !== "smoke") {
          damageScenery(game, hit.scenery, (shell.ammo.directDamage || shell.ammo.damage || 36) * 0.9);
        }
        if (hit.obstacle && shell.ammo.id !== "smoke") {
          damageObstacle(game, hit.obstacle, (shell.ammo.directDamage || shell.ammo.damage || 46) * 0.84);
        }
        if (hit.wreck && shell.ammo.id !== "smoke") damageVehicleWreck(game, hit.wreck, shellWreckDamage(shell, hit.wreck), { ammoId: shell.ammo.id });
        resolveImpact(game, shell, hit.tank || hit.friendlyTank || null, hit.infantry || false, hit.infantryUnit || null, {
          friendlyVehicle: Boolean(hit.friendlyTank)
        });
        projectiles.splice(i, 1);
      }
    }
  }

  function resolveImpact(game, shell, hitTank, hitInfantry = false, hitInfantryUnit = null, options = {}) {
    const ammo = shell.ammo;
    const x = shell.x;
    const y = shell.y;
    const friendlyVehicle = Boolean(options.friendlyVehicle);
    game.publishOnlineProjectileImpact?.(shell, { hitTank, hitInfantry, hitInfantryUnit, friendlyVehicle });

    if (ammo.id === "smoke") {
      game.effects.smokeClouds.push({
        x,
        y,
        radius: 42,
        maxRadius: 142,
        life: 8.5,
        maxLife: 8.5
      });
      game.effects.explosions.push({
        x,
        y,
        radius: 16,
        maxRadius: 70,
        life: 0.6,
        maxLife: 0.6,
        color: "rgba(220, 226, 230, 0.7)"
      });
      return;
    }

    if (ammo.id === "he" || ammo.id === "grenade" || ammo.id === "rpg") { IronLine.audio?.playExplosion?.(game, { x, y }, ammo.id);
      if ((ammo.id === "rpg" || ammo.id === "he") && hitTank && !friendlyVehicle) {
        const directBase = ammo.id === "he"
          ? ammo.directTankDamage || ammo.damage * 0.62
          : ammo.directDamage || ammo.damage;
        const damage = directTankDamage(game, hitTank, directBase, shell);
        const tankWasAlive = targetScoreAlive(hitTank);
        hitTank.takeDamage(game, damage, { weaponId: ammo.id, cause: `${ammo.id}_direct`, sourceVehicle: shell.owner?.vehicleType ? shell.owner : shell.owner?.sourceVehicle || null });
        recordKillIfDestroyed(game, shell.owner || shell, hitTank, tankWasAlive, ammo.id);
      } else if (hitTank && friendlyVehicle) {
        emitFriendlyArmorBlock(game, hitTank, shell);
      }

      damageRadius(game, x, y, ammo.splash, ammo.damage, shell.team, {
        ...ammo,
        owner: shell.owner,
        excludeTarget: ammo.id === "rpg" ? hitTank : null,
        tankDamageScale: ammo.id === "rpg" ? 0.38 : ammo.tankDamageScale
      });
      emitBlastEffect(game, x, y, ammo);
      game.effects.scorchMarks.push({ x, y, radius: (ammo.scorchRadius || 34) + Math.random() * 18, alpha: ammo.id === "he" ? 0.3 : 0.22 });
      return;
    }

    if (hitTank && friendlyVehicle) {
      emitFriendlyArmorBlock(game, hitTank, shell);
    } else if (hitTank) {
      const damage = directTankDamage(game, hitTank, ammo.damage, shell);
      const tankWasAlive = targetScoreAlive(hitTank);
      hitTank.takeDamage(game, damage, { weaponId: ammo.id, cause: `${ammo.id}_direct`, sourceVehicle: shell.owner?.vehicleType ? shell.owner : shell.owner?.sourceVehicle || null });
      recordKillIfDestroyed(game, shell.owner || shell, hitTank, tankWasAlive, ammo.id);
    }
    if (hitInfantry) {
      const hitDamage = ammo.infantryDamage || ammo.damage || 55;
      game.applyPlayerDamage?.(hitDamage, shell.owner || shell, ammo.id || "shell", {
        label: ammo.id === "rpg" ? "RPG \uC9C1\uACA9" : "\uD3EC\uD0C4 \uC9C1\uACA9"
      });
      if (typeof game.applyPlayerDamage !== "function") {
        game.player.hp = Math.max(0, game.player.hp - hitDamage);
      }
    }
    if (hitInfantryUnit) {
      const unitWasAlive = targetScoreAlive(hitInfantryUnit);
      hitInfantryUnit.takeDamage(ammo.infantryDamage || ammo.damage, shell);
      recordKillIfDestroyed(game, shell.owner || shell, hitInfantryUnit, unitWasAlive, ammo.id);
    }

    game.effects.explosions.push({
      x,
      y,
      radius: 6,
      maxRadius: ammo.directExplosionRadius || 42,
      life: 0.24,
      maxLife: 0.24,
      color: "rgba(255, 242, 168, 0.85)", scorched: true
    });
    game.effects.scorchMarks.push({ x, y, radius: (ammo.directScorchRadius || 16) + Math.random() * 8, alpha: 0.12 });
  }

  function emitFriendlyArmorBlock(game, tank, shell) {
    const source = directArmorSource(shell, tank);
    const profile = directArmorProfile(tank, source.x, source.y, shell.ammo?.id);
    tank.lastArmorHit = {
      zone: profile.zone,
      multiplier: 0,
      ammoId: shell.ammo?.id || "",
      friendlyBlock: true,
      time: game?.matchTime || 0
    };
    emitDirectArmorFeedback(game, tank, shell.x, shell.y, profile, shell.ammo);
    if (tank.impactShake !== undefined) tank.impactShake = Math.max(tank.impactShake || 0, 0.14);
  }

  function emitBlastEffect(game, x, y, ammo) {
    const blastRings = game.effects.blastRings || (game.effects.blastRings = []);
    const blastSparks = game.effects.blastSparks || (game.effects.blastSparks = []);
    const splash = ammo.splash || ammo.directExplosionRadius || 80;
    const isRpg = ammo.id === "rpg";
    const isGrenade = ammo.id === "grenade";
    const isLauncherGrenade = ammo.sourceWeaponId === "grenadeLauncher";
    const scale = isRpg ? 0.9 : isLauncherGrenade ? 0.7 : isGrenade ? 0.58 : 1;
    const fireLife = ammo.explosionLife || (isGrenade ? 0.34 : 0.55);
    const smokeLife = isGrenade ? (isLauncherGrenade ? 0.78 : 0.95) : 1.05;

    blastRings.push({
      x,
      y,
      radius: 8,
      maxRadius: splash * (isRpg ? 0.62 : isGrenade ? 0.64 : 0.72),
      life: isGrenade ? 0.14 : 0.18,
      maxLife: isGrenade ? 0.14 : 0.18,
      color: isGrenade ? "rgba(224, 220, 190, 0.62)" : "rgba(255, 238, 178, 0.72)",
      width: isLauncherGrenade ? 3.2 : isGrenade ? 2.6 : 6
    });

    game.effects.explosions.push({
      x,
      y,
      radius: ammo.explosionStart || (isRpg ? 20 : isGrenade ? 12 : 24),
      maxRadius: isGrenade ? (isLauncherGrenade ? 44 : 38) : splash * 0.62,
      life: fireLife,
      maxLife: fireLife,
      color: isRpg ? "rgba(255, 112, 52, 0.95)" : isGrenade ? "rgba(255, 208, 122, 0.88)" : "rgba(255, 145, 58, 0.92)",
      core: true, smoke: false, scorched: true
    });

    game.effects.explosions.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 10,
      radius: isGrenade ? 14 : 18,
      maxRadius: splash * (isLauncherGrenade ? 0.62 : isGrenade ? 0.76 : 0.88),
      life: smokeLife,
      maxLife: smokeLife,
      color: isGrenade ? "rgba(86, 82, 69, 0.55)" : "rgba(70, 63, 50, 0.58)",
      core: false, smoke: true, scorched: true
    });

    const sparkCount = Math.round((isGrenade ? (isLauncherGrenade ? 12 : 10) : isRpg ? 13 : 16) * scale);
    for (let i = 0; i < sparkCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (isGrenade ? 78 : 125) + Math.random() * (isLauncherGrenade ? 132 : isRpg ? 170 : 210);
      const life = (isGrenade ? 0.16 : 0.22) + Math.random() * (isGrenade ? 0.2 : 0.28);
      blastSparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length: (isGrenade ? 5 : 8) + Math.random() * (isGrenade ? 11 : 18),
        life,
        maxLife: life,
        color: isGrenade
          ? (i % 4 === 0 ? "rgba(236, 224, 176, 0.78)" : "rgba(146, 137, 105, 0.66)")
          : i % 3 === 0 ? "rgba(255, 228, 148, 0.92)" : "rgba(255, 127, 67, 0.82)",
        width: isGrenade ? 1.15 : 2.2,
        alpha: isGrenade ? 0.74 : 1
      });
    }
  }

  function segmentRectInteriorLength(x1, y1, x2, y2, rect) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if (length <= 0.001) return 0;

    let entry = 0;
    let exit = 1;
    const axes = [
      { start: x1, delta: dx, min: rect.x, max: rect.x + rect.w },
      { start: y1, delta: dy, min: rect.y, max: rect.y + rect.h }
    ];

    for (const axis of axes) {
      if (Math.abs(axis.delta) <= 0.0001) {
        if (axis.start < axis.min || axis.start > axis.max) return 0;
        continue;
      }

      const t1 = (axis.min - axis.start) / axis.delta;
      const t2 = (axis.max - axis.start) / axis.delta;
      const low = Math.min(t1, t2);
      const high = Math.max(t1, t2);
      entry = Math.max(entry, low);
      exit = Math.min(exit, high);
      if (entry > exit) return 0;
    }

    return Math.max(0, exit - entry) * length;
  }

  function blastExposure(game, x, y, target, options = {}) {
    if (!target) return 1;

    const d = distXY(x, y, target.x, target.y);
    const nearRadius = options.nearRadius ?? 28;
    if (d <= nearRadius) return 1;

    const padding = options.padding ?? 6;
    const blockLength = options.blockLength ?? 9;
    let blockers = 0;
    let blockedDepth = 0;

    for (const obstacle of game.world?.obstacles || []) {
      if (obstacle.destroyed) continue;
      const depth = segmentRectInteriorLength(x, y, target.x, target.y, expandedRect(obstacle, padding));
      if (depth <= blockLength) continue;
      blockers += 1;
      blockedDepth += depth;
    }

    const dx = target.x - x;
    const dy = target.y - y;
    const lenSq = Math.max(1, dx * dx + dy * dy);
    for (const wreck of vehicleTargets(game)) {
      if (!isVehicleWreck(wreck) || wreck === target) continue;
      const t = ((wreck.x - x) * dx + (wreck.y - y) * dy) / lenSq;
      if (t <= 0.08 || t >= 0.96) continue;
      const laneDistance = segmentDistanceToPoint(x, y, target.x, target.y, wreck.x, wreck.y);
      const wreckPadding = (wreck.radius || 18) + padding;
      if (laneDistance > wreckPadding) continue;
      blockers += 1;
      blockedDepth += Math.max(14, wreckPadding * 1.35);
    }

    if (!blockers) return 1;

    const coverScale = options.coverScale ?? 0.28;
    const minimum = options.minimum ?? 0.12;
    const depthScale = clamp(1 - blockedDepth / 260, 0.52, 1);
    const stackedCoverScale = Math.pow(0.66, blockers - 1);
    return clamp(coverScale * depthScale * stackedCoverScale, minimum, 1);
  }

  function blastSuppressionExposure(exposure) {
    return clamp(0.35 + exposure * 0.65, 0.26, 1);
  }

  function proneBlastDamageScale(target, distance, radius, ammo = {}) {
    if (!target?.isProne) return 1;
    const blastRadius = Math.max(1, radius || ammo.splash || 1);
    const t = clamp(distance / blastRadius, 0, 1);
    const ammoId = ammo.id || "";
    const closeScale = ammoId === "he" ? 0.88 : ammoId === "grenade" ? 0.8 : 0.86;
    const farScale = ammoId === "he" ? 0.58 : ammoId === "grenade" ? 0.62 : 0.68;
    if (t < 0.22) return closeScale;
    if (t > 0.72) return farScale;
    return closeScale + (farScale - closeScale) * ((t - 0.22) / 0.5);
  }

  function damageRadius(game, x, y, radius, damage, team, ammo = {}) {
    const blastSource = { x, y, team, weaponId: ammo.sourceWeaponId || ammo.id || "blast", ammoId: ammo.id || ammo.sourceWeaponId || "blast", ammo, owner: ammo.owner || ammo.source || null, sourceVehicle: ammo.owner?.vehicleType ? ammo.owner : ammo.source?.vehicleType ? ammo.source : ammo.owner?.sourceVehicle || ammo.source?.sourceVehicle || null };
    for (const tank of vehicleTargets(game)) {
      if (tank === ammo.excludeTarget) continue;
      if (!tank.alive || tank.team === team) continue;
      const d = distXY(x, y, tank.x, tank.y);
      if (d > radius + tank.radius) continue;
      const falloff = clamp(1 - d / (radius + tank.radius), 0.18, 1);
      const exposure = blastExposure(game, x, y, tank, {
        padding: tank.vehicleType === "humvee" ? 6 : 9,
        coverScale: tank.vehicleType === "humvee" ? 0.34 : 0.4,
        minimum: tank.vehicleType === "humvee" ? 0.14 : 0.18,
        nearRadius: 34 + (tank.radius || 0) * 0.25
      });
      const vehicleScale = tank.vehicleType === "humvee"
        ? ammo.lightVehicleDamageScale ?? ammo.tankDamageScale ?? 1
        : ammo.tankDamageScale ?? 1;
      const tankWasAlive = targetScoreAlive(tank);
      tank.takeDamage(game, damage * vehicleScale * falloff * exposure, { weaponId: ammo.id || "blast", cause: ammo.id ? `${ammo.id}_blast` : "blast" });
      recordKillIfDestroyed(game, ammo.owner || ammo.source || { team }, tank, tankWasAlive, ammo.id || "blast");
    }

    for (const wreck of vehicleTargets(game)) {
      if (!isVehicleWreck(wreck) || wreck === ammo.excludeTarget) continue;
      const d = distXY(x, y, wreck.x, wreck.y);
      if (d > radius + wreck.radius) continue;
      const falloff = clamp(1 - d / Math.max(1, radius + wreck.radius), 0.18, 1);
      damageVehicleWreck(game, wreck, damage * (ammo.wreckDamageScale ?? 0.34) * falloff, { ammoId: ammo.id || "blast" });
    }

    for (const unit of game.infantry || []) {
      if (!unit.alive || unit.inVehicle || unit.team === team) continue;
      const d = distXY(x, y, unit.x, unit.y);
      if (d > radius + unit.radius) continue;
      const falloff = clamp(1 - d / (radius + unit.radius), 0.2, 1);
      const exposure = blastExposure(game, x, y, unit, {
        padding: 5,
        coverScale: 0.24,
        minimum: 0.1,
        nearRadius: 26
      });
      unit.suppress(
        ((ammo.suppressionBase ?? 18) + (ammo.suppressionMax ?? 42) * falloff) * blastSuppressionExposure(exposure),
        { x, y, team }
      );
      const proneScale = proneBlastDamageScale(unit, d, radius + unit.radius, ammo);
      const unitWasAlive = targetScoreAlive(unit);
      unit.takeDamage(damage * (ammo.infantryDamageScale ?? 1) * falloff * exposure * proneScale, blastSource);
      recordKillIfDestroyed(game, ammo.owner || ammo.source || { team }, unit, unitWasAlive, ammo.id || "blast");
    }

    for (const drone of game.drones || []) {
      if (!drone.alive || drone.team === team) continue;
      const d = distXY(x, y, drone.x, drone.y);
      if (d > radius + drone.radius) continue;
      const falloff = clamp(1 - d / (radius + drone.radius), 0.24, 1);
      const exposure = blastExposure(game, x, y, drone, {
        padding: 3,
        coverScale: 0.18,
        minimum: 0.12,
        nearRadius: 24
      });
      const droneScale = drone.droneRole === "attack" ? 0.46 : 0.5;
      const droneWasAlive = targetScoreAlive(drone);
      drone.takeDamage(damage * droneScale * falloff * exposure);
      recordKillIfDestroyed(game, ammo.owner || ammo.source || { team }, drone, droneWasAlive, ammo.id || "blast");
    }

    for (const item of activeDestructibleScenery(game)) {
      const center = sceneryCenter(item);
      const d = distXY(x, y, center.x, center.y);
      if (d > radius + center.radius) continue;
      const falloff = clamp(1 - d / Math.max(1, radius + center.radius), 0.18, 1);
      const sceneryScale = item.type === "tree" ? 0.48 : item.type === "wood-fence" ? 0.72 : 0.58;
      damageScenery(game, item, damage * (ammo.sceneryDamageScale ?? sceneryScale) * falloff);
    }

    for (const obstacle of game.world?.obstacles || []) {
      if (!isVehicleBreakableObstacle(obstacle)) continue;
      const center = sceneryCenter(obstacle);
      const d = distXY(x, y, center.x, center.y);
      if (d > radius + center.radius) continue;
      const falloff = clamp(1 - d / Math.max(1, radius + center.radius), 0.18, 1);
      damageObstacle(game, obstacle, damage * (ammo.obstacleDamageScale ?? 0.42) * falloff);
    }

    if (game.isLocalPlayerEnemyFor?.(team)) {
      const d = distXY(x, y, game.player.x, game.player.y);
      if (d < radius + game.player.radius) {
        const falloff = clamp(1 - d / radius, 0.24, 1);
        const exposure = blastExposure(game, x, y, game.player, {
          padding: 5,
          coverScale: 0.24,
          minimum: 0.1,
          nearRadius: 26
        });
        const proneScale = proneBlastDamageScale(game.player, d, radius + game.player.radius, ammo);
        const playerDamage = damage * (ammo.infantryDamageScale ?? 1) * falloff * exposure * proneScale;
        const source = { x, y, team, owner: ammo.owner || ammo.source || null };
        game.applyPlayerDamage?.(playerDamage, source, ammo.id || "explosion", {
          x,
          y
        });
        if (typeof game.applyPlayerDamage !== "function") {
          game.player.hp = Math.max(0, game.player.hp - playerDamage);
        }
      }
    }
  }

  function updateEffects(game, dt) {
    const { explosions, smokeClouds, scorchMarks } = game.effects;
    const blastRings = game.effects.blastRings || (game.effects.blastRings = []);
    const blastSparks = game.effects.blastSparks || (game.effects.blastSparks = []);
    const tracers = game.effects.tracers || (game.effects.tracers = []);
    const dustPuffs = game.effects.dustPuffs || (game.effects.dustPuffs = []);
    const trackScuffs = game.effects.trackScuffs || (game.effects.trackScuffs = []);
    const muzzleFlashes = game.effects.muzzleFlashes || (game.effects.muzzleFlashes = []);
    const gunSmokePuffs = game.effects.gunSmokePuffs || (game.effects.gunSmokePuffs = []);

    trimOldest(tracers, 260);
    trimOldest(muzzleFlashes, 120);
    trimOldest(blastRings, 180);
    trimOldest(blastSparks, 360);
    trimOldest(dustPuffs, 260);
    trimOldest(trackScuffs, 180);
    trimOldest(gunSmokePuffs, 240);
    trimOldest(explosions, 260);
    trimOldest(smokeClouds, 80);
    trimOldest(scorchMarks, 240);

    for (const item of game.world?.scenery || []) {
      if (item.damageFlash > 0) item.damageFlash = Math.max(0, item.damageFlash - dt * 1.8);
      if (item.destroyed && item.destroyTimer !== undefined) {
        item.destroyTimer = Math.min(item.destroyDuration || 0.58, item.destroyTimer + dt);
      }
    }

    for (const obstacle of game.world?.obstacles || []) {
      if (obstacle.damageFlash > 0) obstacle.damageFlash = Math.max(0, obstacle.damageFlash - dt * 1.8);
      if (obstacle.destroyed && obstacle.destroyTimer !== undefined) {
        obstacle.destroyTimer = Math.min(obstacle.destroyDuration || 0.58, obstacle.destroyTimer + dt);
      }
    }

    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) tracers.splice(i, 1);
    }

    for (let i = muzzleFlashes.length - 1; i >= 0; i -= 1) {
      muzzleFlashes[i].life -= dt;
      if (muzzleFlashes[i].life <= 0) muzzleFlashes.splice(i, 1);
    }

    for (let i = blastRings.length - 1; i >= 0; i -= 1) {
      const ring = blastRings[i];
      ring.life -= dt;
      const t = 1 - ring.life / ring.maxLife;
      ring.radius = lerp(ring.radius, ring.maxRadius, Math.min(1, t * 1.4));
      if (ring.life <= 0) blastRings.splice(i, 1);
    }

    for (let i = blastSparks.length - 1; i >= 0; i -= 1) {
      const spark = blastSparks[i];
      spark.life -= dt;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vx *= Math.max(0, 1 - 3.2 * dt);
      spark.vy *= Math.max(0, 1 - 3.2 * dt);
      if (spark.life <= 0) blastSparks.splice(i, 1);
    }

    for (let i = dustPuffs.length - 1; i >= 0; i -= 1) {
      const puff = dustPuffs[i];
      puff.life -= dt;
      puff.x += (puff.vx || 0) * dt;
      puff.y += (puff.vy || 0) * dt;
      expandEffectRadius(puff);
      if (puff.life <= 0) dustPuffs.splice(i, 1);
    }

    for (let i = trackScuffs.length - 1; i >= 0; i -= 1) {
      trackScuffs[i].life -= dt;
      if (trackScuffs[i].life <= 0) trackScuffs.splice(i, 1);
    }

    for (let i = gunSmokePuffs.length - 1; i >= 0; i -= 1) {
      const puff = gunSmokePuffs[i];
      puff.life -= dt;
      puff.x += (puff.vx || 0) * dt;
      puff.y += (puff.vy || 0) * dt;
      puff.vx *= Math.max(0, 1 - 1.2 * dt);
      puff.vy *= Math.max(0, 1 - 1.2 * dt);
      expandEffectRadius(puff);
      if (puff.life <= 0) gunSmokePuffs.splice(i, 1);
    }

    for (let i = explosions.length - 1; i >= 0; i -= 1) {
      const explosion = explosions[i];
      explosion.life -= dt;
      const t = 1 - explosion.life / explosion.maxLife;
      explosion.radius = lerp(explosion.radius, explosion.maxRadius, t);
      if (explosion.life <= 0) explosions.splice(i, 1);
    }

    for (let i = smokeClouds.length - 1; i >= 0; i -= 1) {
      const cloud = smokeClouds[i];
      cloud.life -= dt;
      cloud.radius = lerp(cloud.radius, cloud.maxRadius, 2.2 * dt);
      if (cloud.life <= 0) smokeClouds.splice(i, 1);
    }

    for (let i = scorchMarks.length - 1; i >= 0; i -= 1) {
      scorchMarks[i].alpha -= dt * 0.008;
      if (scorchMarks[i].alpha <= 0) scorchMarks.splice(i, 1);
    }
  }

  IronLine.combat = {
    fireRifle,
    fireRifleAtPoint,
    fireRifleAtTank,
    smallArmsTankDamage,
    smallArmsRange,
    throwGrenade,
    fireRpg,
    updateProjectiles,
    updateEffects,
    resolveImpact,
    damageRadius,
    damageScenery,
    damageObstacle,
    obstacleImpactHp,
    isVehicleBreakableObstacle
  };
})(window);
