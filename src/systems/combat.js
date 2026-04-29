"use strict";

(function registerCombat(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, INFANTRY_WEAPONS } = IronLine.constants;
  const { clamp, distXY, normalizeAngle, circleRectCollision, expandedRect, lineIntersectsRect, segmentDistanceToPoint, lerp } = IronLine.math;

  function vehicleTargets(game) {
    return [...(game.tanks || []), ...(game.humvees || [])];
  }

  function isVehicleWreck(vehicle) {
    return Boolean(vehicle && (!vehicle.alive || vehicle.hp <= 0));
  }

  function pushLimited(list, item, max = 180) {
    if (!list) return;
    if (list.length > max) list.shift();
    list.push(item);
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
    if (!game?.effects || !tank || profile.zone === "light") return;

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
    const speed = Math.abs(target.speed || 0) * (target.boosting ? target.boostSpeedMultiplier || 1.6 : 1);
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
      }, 180);
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

  function fireRifle(game, shooter, target, options = {}) {
    if (shooter.alive === false || !target || target.alive === false || target.hp <= 0) return false;
    if (shooter.inVehicle) return false;
    if (target.inVehicle) return false;
    if (target === game.player && game.isPlayerInSafeZone?.()) return false;

    const weapon = options.weapon || INFANTRY_WEAPONS[shooter.weaponId] || INFANTRY_WEAPONS.rifle;
    const baseRange = options.range || weapon.range || 560;
    const range = smallArmsRange(weapon, shooter, baseRange);
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
      baseAccuracy - accuracyDistance / range * accuracyFalloff + (options.accuracyBonus || 0) + shooterProneBonus - targetPronePenalty - droneProfile.accuracyPenalty,
      effectiveMinAccuracy,
      effectiveMaxAccuracy
    );
    const muzzleDistance = options.muzzleDistance ?? (shooter.radius + 8);
    const startX = options.startX ?? shooter.x + Math.cos(shooter.angle) * muzzleDistance;
    const startY = options.startY ?? shooter.y + Math.sin(shooter.angle) * muzzleDistance;
    const hit = Math.random() < hitChance;
    const missAngle = shooter.angle + (Math.random() - 0.5) * (options.spread ?? weapon.spread ?? 0.34);
    const endX = hit ? target.x : startX + Math.cos(missAngle) * Math.min(range, distance + 80);
    const endY = hit ? target.y : startY + Math.sin(missAngle) * Math.min(range, distance + 80);
    const wreckBlock = findSmallArmsTankHit(game, shooter, startX, startY, endX, endY, {
      onlyWrecks: true
    });
    const finalEndX = wreckBlock ? wreckBlock.x : endX;
    const finalEndY = wreckBlock ? wreckBlock.y : endY;
    const impactAngle = wreckBlock
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
    });

    applyRifleSuppression(game, shooter, target, startX, startY, finalEndX, finalEndY, hit && !wreckBlock, weapon);
    if (target === game.player && shooter.team === TEAM.RED) {
      game.warnPlayerDanger?.(shooter, weapon.id === "sniper" ? "sniper" : weapon.id, {
        ttl: weapon.id === "sniper" ? 1.25 : 0.76
      });
    }

    if (wreckBlock) {
      applySmallArmsWreckHit(game, shooter, wreckBlock.tank, finalEndX, finalEndY, weapon);
    } else if (hit) {
      const baseDamage = options.damage || (weapon.damageMin + Math.random() * (weapon.damageMax - weapon.damageMin));
      const damage = baseDamage * droneProfile.damageScale;
      emitSmallArmsImpact(game, finalEndX, finalEndY, impactAngle, weapon, {
        hard: Boolean(target.vehicleType),
        tank: Boolean(target.vehicleType)
      });
      if (target === game.player && typeof game.applyPlayerDamage === "function") {
        game.applyPlayerDamage(damage, shooter, weapon.id || "rifle", {
          label: weapon.id === "sniper" ? "\uC800\uACA9" : "\uCD1D\uACA9"
        });
      } else if (target.takeDamage) {
        if (target.vehicleType) target.takeDamage(game, damage);
        else target.takeDamage(damage);
      }
      else if (target.hp !== undefined) target.hp = Math.max(0, target.hp - damage);
    } else if (Math.random() < (options.impactChance ?? 0.16)) {
      emitSmallArmsImpact(game, finalEndX, finalEndY, impactAngle, weapon);
    }

    return true;
  }

  function fireRifleAtPoint(game, shooter, aimX, aimY, options = {}) {
    if (shooter.alive === false || shooter.hp <= 0) return false;
    if (shooter.inVehicle) return false;

    const weapon = options.weapon || INFANTRY_WEAPONS[shooter.weaponId] || INFANTRY_WEAPONS.rifle;
    const baseRange = options.range || weapon.range || 560;
    const range = smallArmsRange(weapon, shooter, baseRange);
    const muzzleDistance = options.muzzleDistance ?? (shooter.radius + 8);
    const startX = options.startX ?? shooter.x + Math.cos(shooter.angle) * muzzleDistance;
    const startY = options.startY ?? shooter.y + Math.sin(shooter.angle) * muzzleDistance;
    const aimAngle = Math.atan2(aimY - shooter.y, aimX - shooter.x);
    const proneSpreadScale = shooter.isProne ? 0.68 : 1;
    const shotAngle = aimAngle + (Math.random() - 0.5) * (options.spread ?? weapon.spread ?? 0.22) * 0.18 * proneSpreadScale;
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
    });

    if (impact.tank) {
      if (impact.wreck) applySmallArmsWreckHit(game, shooter, impact.tank, impact.x, impact.y, weapon);
      else applySmallArmsTankHit(game, shooter, impact.tank, impact.x, impact.y, weapon, options);
    }
    else if (impact.blocked || Math.random() < (options.impactChance ?? 0.28)) {
      emitSmallArmsImpact(game, impact.x, impact.y, shotAngle, weapon, { hard: impact.blocked });
    }
    applyLineSuppression(game, shooter, startX, startY, impact.x, impact.y, weapon, options.targetTeam);
    return true;
  }

  function fireRifleAtTank(game, shooter, tank, options = {}) {
    if (shooter.alive === false || shooter.hp <= 0 || !tank || !tank.alive || tank.team === shooter.team) return false;
    if (shooter.inVehicle) return false;

    const weapon = options.weapon || INFANTRY_WEAPONS[shooter.weaponId] || INFANTRY_WEAPONS.rifle;
    const baseRange = options.range || weapon.range || 560;
    const range = smallArmsRange(weapon, shooter, baseRange);
    const distance = distXY(shooter.x, shooter.y, tank.x, tank.y);
    if (distance > range) return false;
    if (!IronLine.physics.hasLineOfSight(game, shooter, tank, { padding: 3 })) return false;

    const muzzleDistance = options.muzzleDistance ?? (shooter.radius + 8);
    const startX = options.startX ?? shooter.x + Math.cos(shooter.angle) * muzzleDistance;
    const startY = options.startY ?? shooter.y + Math.sin(shooter.angle) * muzzleDistance;
    const baseChance = weapon.id === "lmg" || weapon.id === "machinegun" ? 0.2 : 0.13;
    const hitChance = clamp(baseChance - distance / range * 0.08 + (options.accuracyBonus || 0) + (shooter.isProne ? 0.025 : 0), 0.04, 0.24);
    const hit = Math.random() < hitChance;
    const missAngle = shooter.angle + (Math.random() - 0.5) * (weapon.spread || 0.34) * (shooter.isProne ? 0.74 : 1);
    const endX = hit ? tank.x + (Math.random() - 0.5) * tank.radius : startX + Math.cos(missAngle) * Math.min(range, distance + 90);
    const endY = hit ? tank.y + (Math.random() - 0.5) * tank.radius : startY + Math.sin(missAngle) * Math.min(range, distance + 90);
    const wreckBlock = findSmallArmsTankHit(game, shooter, startX, startY, endX, endY, {
      onlyWrecks: true
    });
    const finalEndX = wreckBlock ? wreckBlock.x : endX;
    const finalEndY = wreckBlock ? wreckBlock.y : endY;
    const finalAngle = wreckBlock ? Math.atan2(finalEndY - startY, finalEndX - startX) : missAngle;

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

    if (wreckBlock) {
      applySmallArmsWreckHit(game, shooter, wreckBlock.tank, finalEndX, finalEndY, weapon);
    } else if (hit) {
      applySmallArmsTankHit(game, shooter, tank, finalEndX, finalEndY, weapon, options);
    } else if (Math.random() < (options.impactChance ?? 0.18)) {
      emitSmallArmsImpact(game, finalEndX, finalEndY, finalAngle, weapon);
    }

    return true;
  }

  function throwGrenade(game, shooter, aimX, aimY, options = {}) {
    const weapon = options.weapon || INFANTRY_WEAPONS.grenade;
    return launchInfantryProjectile(game, shooter, aimX, aimY, {
      ...weapon,
      id: "grenade",
      color: "#ffd166",
      maxDistance: weapon.range,
      fuseExtra: 0.12
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
    const speed = ammo.speed || 420;

    game.projectiles.push({
      x: startX,
      y: startY,
      previousX: startX,
      previousY: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      team: shooter.team,
      owner: shooter,
      ammo,
      life: Math.max(0.12, travelDistance / speed + (ammo.fuseExtra || 0)),
      radius: ammo.shellRadius || 5
    });

    if (ammo.id === "rpg") {
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

      const blocked = game.world.obstacles.some((obstacle) => (
        circleRectCollision(x, y, 2, obstacle) ||
        lineIntersectsRect(lastX, lastY, x, y, obstacle)
      ));
      if (blocked) return { x, y, blocked: true };

      const hitTank = findSmallArmsTankHit(game, shooter, lastX, lastY, x, y, options);
      if (hitTank) {
        return {
          x: hitTank.x,
          y: hitTank.y,
          tank: hitTank.tank,
          wreck: hitTank.wreck
        };
      }

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
      if (options.onlyWrecks && !wreck) continue;
      if (wreck && options.ignoreWrecks) continue;
      if (!wreck && !tank.alive) continue;
      if (!wreck && options.targetTeam && tank.team !== options.targetTeam) continue;

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
    const chipDamage = friendly
      ? 0
      : options.damage ?? smallArmsTankDamage(weapon);

    if (chipDamage > 0) {
      tank.hp = Math.max(0, tank.hp - chipDamage);
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

    if (!friendly && tank.hp <= 0 && tank.alive) tank.takeDamage(game, 0.01);
    return true;
  }

  function smallArmsTankDamage(weapon) {
    if (!weapon) return 0.05;
    if (weapon.id === "lmg" || weapon.id === "machinegun") return 0.18;
    if (weapon.id === "sniper") return 0.14;
    if (weapon.id === "pistol") return 0.03;
    return 0.07;
  }

  function applyLineSuppression(game, shooter, startX, startY, endX, endY, weapon, targetTeam = null) {
    for (const unit of game.infantry || []) {
      if (!unit.alive || unit.inVehicle || unit.team === shooter.team) continue;
      if (targetTeam && unit.team !== targetTeam) continue;

      const lineDistance = segmentDistanceToPoint(startX, startY, endX, endY, unit.x, unit.y);
      const endDistance = distXY(endX, endY, unit.x, unit.y);
      const nearLine = lineDistance < 58;
      const nearImpact = endDistance < 68;
      if (!nearLine && !nearImpact) continue;

      const linePressure = nearLine ? weapon.lineSuppression * 0.58 * (1 - lineDistance / 58) : 0;
      const impactPressure = nearImpact ? weapon.impactSuppression * 0.72 * (1 - endDistance / 68) : 0;
      unit.suppress(Math.max(linePressure, impactPressure), shooter);
    }
  }

  function applyRifleSuppression(game, shooter, target, startX, startY, endX, endY, hit, weapon) {
    const targetTeam = target.team ?? null;
    if (target.suppress && !target.inVehicle) target.suppress(hit ? weapon.suppressionHit : weapon.suppressionMiss, shooter);

    for (const unit of game.infantry || []) {
      if (!unit.alive || unit.inVehicle || unit === target || unit.team === shooter.team) continue;
      if (targetTeam && unit.team !== targetTeam) continue;

      const lineDistance = segmentDistanceToPoint(startX, startY, endX, endY, unit.x, unit.y);
      const endDistance = distXY(endX, endY, unit.x, unit.y);
      const nearLine = lineDistance < 62;
      const nearImpact = endDistance < 72;
      if (!nearLine && !nearImpact) continue;

      const linePressure = nearLine ? weapon.lineSuppression * (1 - lineDistance / 62) : 0;
      const impactPressure = nearImpact ? weapon.impactSuppression * (1 - endDistance / 72) : 0;
      unit.suppress(Math.max(linePressure, impactPressure), shooter);
    }
  }

  function updateProjectiles(game, dt) {
    const projectiles = game.projectiles;

    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const shell = projectiles[i];
      shell.life -= dt;
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

      if (!game.player.inTank && game.player.hp > 0 && shell.team === TEAM.RED && !game.isPlayerInSafeZone?.()) {
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
        const hitObstacle = circleRectCollision(shell.x, shell.y, shell.radius, obstacle) ||
          lineIntersectsRect(shell.previousX, shell.previousY, shell.x, shell.y, obstacle);
        if (hitObstacle) {
          hit = { obstacle };
          break;
        }
      }

      if (!hit) {
        for (const tank of vehicleTargets(game)) {
          const wreck = isVehicleWreck(tank);
          if (tank === shell.owner) continue;
          if (!wreck && (!tank.alive || tank.team === shell.team)) continue;
          const shellDistance = segmentDistanceToPoint(
            shell.previousX,
            shell.previousY,
            shell.x,
            shell.y,
            tank.x,
            tank.y
          );
          if (shellDistance <= tank.radius + shell.radius) {
            hit = wreck ? { wreck: tank } : { tank };
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

      if (!hit && !game.player.inTank && game.player.hp > 0 && shell.team === TEAM.RED && !game.isPlayerInSafeZone?.()) {
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
        resolveImpact(game, shell, hit.tank || null, hit.infantry || false, hit.infantryUnit || null);
        projectiles.splice(i, 1);
      }
    }
  }

  function resolveImpact(game, shell, hitTank, hitInfantry = false, hitInfantryUnit = null) {
    const ammo = shell.ammo;
    const x = shell.x;
    const y = shell.y;

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

    if (ammo.id === "he" || ammo.id === "grenade" || ammo.id === "rpg") {
      if (ammo.id === "rpg" && hitTank) {
        const damage = directTankDamage(game, hitTank, ammo.directDamage || ammo.damage, shell);
        hitTank.takeDamage(game, damage);
      }

      damageRadius(game, x, y, ammo.splash, ammo.damage, shell.team, {
        ...ammo,
        excludeTarget: ammo.id === "rpg" ? hitTank : null,
        tankDamageScale: ammo.id === "rpg" ? 0.38 : ammo.tankDamageScale
      });
      emitBlastEffect(game, x, y, ammo);
      game.effects.scorchMarks.push({ x, y, radius: (ammo.scorchRadius || 34) + Math.random() * 18, alpha: ammo.id === "he" ? 0.3 : 0.22 });
      return;
    }

    if (hitTank) {
      const damage = directTankDamage(game, hitTank, ammo.damage, shell);
      hitTank.takeDamage(game, damage);
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
    if (hitInfantryUnit) hitInfantryUnit.takeDamage(ammo.infantryDamage || ammo.damage);

    game.effects.explosions.push({
      x,
      y,
      radius: 6,
      maxRadius: ammo.directExplosionRadius || 42,
      life: 0.24,
      maxLife: 0.24,
      color: "rgba(255, 242, 168, 0.85)"
    });
    game.effects.scorchMarks.push({ x, y, radius: (ammo.directScorchRadius || 16) + Math.random() * 8, alpha: 0.12 });
  }

  function emitBlastEffect(game, x, y, ammo) {
    const blastRings = game.effects.blastRings || (game.effects.blastRings = []);
    const blastSparks = game.effects.blastSparks || (game.effects.blastSparks = []);
    const splash = ammo.splash || ammo.directExplosionRadius || 80;
    const isRpg = ammo.id === "rpg";
    const isGrenade = ammo.id === "grenade";
    const scale = isRpg ? 0.9 : isGrenade ? 0.72 : 1;
    const fireLife = ammo.explosionLife || (isGrenade ? 0.36 : 0.48);
    const smokeLife = isGrenade ? 0.72 : 0.92;

    blastRings.push({
      x,
      y,
      radius: 8,
      maxRadius: splash * (isRpg ? 0.62 : 0.72),
      life: 0.18,
      maxLife: 0.18,
      color: "rgba(255, 238, 178, 0.72)",
      width: isGrenade ? 4 : 6
    });

    game.effects.explosions.push({
      x,
      y,
      radius: ammo.explosionStart || (isRpg ? 20 : isGrenade ? 15 : 24),
      maxRadius: splash * (isGrenade ? 0.45 : 0.58),
      life: fireLife,
      maxLife: fireLife,
      color: isRpg ? "rgba(255, 112, 52, 0.95)" : "rgba(255, 145, 58, 0.92)",
      core: true,
      smoke: false
    });

    game.effects.explosions.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 10,
      radius: 18,
      maxRadius: splash * (isGrenade ? 0.7 : 0.88),
      life: smokeLife,
      maxLife: smokeLife,
      color: "rgba(70, 63, 50, 0.58)",
      core: false,
      smoke: true
    });

    const sparkCount = Math.round((isGrenade ? 9 : isRpg ? 13 : 16) * scale);
    for (let i = 0; i < sparkCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (isGrenade ? 90 : 125) + Math.random() * (isRpg ? 170 : 210);
      const life = 0.22 + Math.random() * 0.28;
      blastSparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length: 8 + Math.random() * 18,
        life,
        maxLife: life,
        color: i % 3 === 0 ? "rgba(255, 228, 148, 0.92)" : "rgba(255, 127, 67, 0.82)"
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

  function damageRadius(game, x, y, radius, damage, team, ammo = {}) {
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
      tank.takeDamage(game, damage * vehicleScale * falloff * exposure);
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
      unit.takeDamage(damage * (ammo.infantryDamageScale ?? 1) * falloff * exposure);
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
      drone.takeDamage(damage * droneScale * falloff * exposure);
    }

    if (!game.player.inTank && game.player.hp > 0 && team === TEAM.RED && !game.isPlayerInSafeZone?.()) {
      const d = distXY(x, y, game.player.x, game.player.y);
      if (d < radius + game.player.radius) {
        const falloff = clamp(1 - d / radius, 0.24, 1);
        const exposure = blastExposure(game, x, y, game.player, {
          padding: 5,
          coverScale: 0.24,
          minimum: 0.1,
          nearRadius: 26
        });
        const playerDamage = damage * (ammo.infantryDamageScale ?? 1) * falloff * exposure;
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
      const t = 1 - puff.life / puff.maxLife;
      puff.radius = lerp(puff.radius, puff.maxRadius, t);
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
      const t = 1 - puff.life / puff.maxLife;
      puff.radius = lerp(puff.radius, puff.maxRadius, t);
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
    smallArmsRange,
    throwGrenade,
    fireRpg,
    updateProjectiles,
    updateEffects,
    resolveImpact,
    damageRadius
  };
})(window);
