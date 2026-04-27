"use strict";

(function registerCombat(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, INFANTRY_WEAPONS } = IronLine.constants;
  const { clamp, distXY, circleRectCollision, lineIntersectsRect, segmentDistanceToPoint, lerp } = IronLine.math;

  function fireRifle(game, shooter, target, options = {}) {
    if (shooter.alive === false || !target || target.alive === false || target.hp <= 0) return false;
    if (target === game.player && game.isPlayerInSafeZone?.()) return false;

    const weapon = options.weapon || INFANTRY_WEAPONS[shooter.weaponId] || INFANTRY_WEAPONS.rifle;
    const range = options.range || weapon.range || 560;
    const distance = distXY(shooter.x, shooter.y, target.x, target.y);
    if (distance > range) return false;
    if (!IronLine.physics.hasLineOfSight(game, shooter, target, { padding: 3 })) return false;

    const baseAccuracy = options.baseAccuracy ?? 0.78;
    const accuracyFalloff = options.accuracyFalloff ?? 0.38;
    const minAccuracy = options.minAccuracy ?? 0.22;
    const maxAccuracy = options.maxAccuracy ?? 0.86;
    const hitChance = clamp(baseAccuracy - distance / range * accuracyFalloff + (options.accuracyBonus || 0), minAccuracy, maxAccuracy);
    const muzzleDistance = shooter.radius + 8;
    const startX = shooter.x + Math.cos(shooter.angle) * muzzleDistance;
    const startY = shooter.y + Math.sin(shooter.angle) * muzzleDistance;
    const hit = Math.random() < hitChance;
    const missAngle = shooter.angle + (Math.random() - 0.5) * (options.spread ?? weapon.spread ?? 0.34);
    const endX = hit ? target.x : startX + Math.cos(missAngle) * Math.min(range, distance + 80);
    const endY = hit ? target.y : startY + Math.sin(missAngle) * Math.min(range, distance + 80);

    const tracers = game.effects.tracers || (game.effects.tracers = []);
    tracers.push({
      x1: startX,
      y1: startY,
      x2: endX,
      y2: endY,
      life: options.tracerLife || weapon.tracerLife || 0.09,
      maxLife: options.tracerLife || weapon.tracerLife || 0.09,
      color: options.tracerColor || (shooter.team === TEAM.BLUE ? "rgba(177, 220, 255, 0.92)" : "rgba(255, 176, 171, 0.92)")
    });

    applyRifleSuppression(game, shooter, target, startX, startY, endX, endY, hit, weapon);

    if (hit) {
      const damage = options.damage || (weapon.damageMin + Math.random() * (weapon.damageMax - weapon.damageMin));
      if (target.takeDamage) target.takeDamage(damage);
      else if (target.hp !== undefined) target.hp = Math.max(0, target.hp - damage);
    }

    return true;
  }

  function fireRifleAtPoint(game, shooter, aimX, aimY, options = {}) {
    if (shooter.alive === false || shooter.hp <= 0) return false;

    const weapon = options.weapon || INFANTRY_WEAPONS[shooter.weaponId] || INFANTRY_WEAPONS.rifle;
    const range = options.range || weapon.range || 560;
    const muzzleDistance = shooter.radius + 8;
    const startX = shooter.x + Math.cos(shooter.angle) * muzzleDistance;
    const startY = shooter.y + Math.sin(shooter.angle) * muzzleDistance;
    const aimAngle = Math.atan2(aimY - shooter.y, aimX - shooter.x);
    const shotAngle = aimAngle + (Math.random() - 0.5) * (options.spread ?? weapon.spread ?? 0.22) * 0.18;
    const impact = traceSmallArmsShot(game, shooter, startX, startY, shotAngle, range, options);

    const tracers = game.effects.tracers || (game.effects.tracers = []);
    tracers.push({
      x1: startX,
      y1: startY,
      x2: impact.x,
      y2: impact.y,
      life: options.tracerLife || weapon.tracerLife || 0.09,
      maxLife: options.tracerLife || weapon.tracerLife || 0.09,
      color: options.tracerColor || (shooter.team === TEAM.BLUE ? "rgba(177, 220, 255, 0.86)" : "rgba(255, 176, 171, 0.86)")
    });

    if (impact.tank) applySmallArmsTankHit(game, shooter, impact.tank, impact.x, impact.y, weapon, options);
    applyLineSuppression(game, shooter, startX, startY, impact.x, impact.y, weapon, options.targetTeam);
    return true;
  }

  function fireRifleAtTank(game, shooter, tank, options = {}) {
    if (shooter.alive === false || shooter.hp <= 0 || !tank || !tank.alive || tank.team === shooter.team) return false;

    const weapon = options.weapon || INFANTRY_WEAPONS[shooter.weaponId] || INFANTRY_WEAPONS.rifle;
    const range = options.range || weapon.range || 560;
    const distance = distXY(shooter.x, shooter.y, tank.x, tank.y);
    if (distance > range) return false;
    if (!IronLine.physics.hasLineOfSight(game, shooter, tank, { padding: 3 })) return false;

    const muzzleDistance = shooter.radius + 8;
    const startX = shooter.x + Math.cos(shooter.angle) * muzzleDistance;
    const startY = shooter.y + Math.sin(shooter.angle) * muzzleDistance;
    const baseChance = weapon.id === "lmg" || weapon.id === "machinegun" ? 0.2 : 0.13;
    const hitChance = clamp(baseChance - distance / range * 0.08 + (options.accuracyBonus || 0), 0.04, 0.24);
    const hit = Math.random() < hitChance;
    const missAngle = shooter.angle + (Math.random() - 0.5) * (weapon.spread || 0.34);
    const endX = hit ? tank.x + (Math.random() - 0.5) * tank.radius : startX + Math.cos(missAngle) * Math.min(range, distance + 90);
    const endY = hit ? tank.y + (Math.random() - 0.5) * tank.radius : startY + Math.sin(missAngle) * Math.min(range, distance + 90);

    const tracers = game.effects.tracers || (game.effects.tracers = []);
    tracers.push({
      x1: startX,
      y1: startY,
      x2: endX,
      y2: endY,
      life: options.tracerLife || weapon.tracerLife || 0.09,
      maxLife: options.tracerLife || weapon.tracerLife || 0.09,
      color: shooter.team === TEAM.BLUE ? "rgba(177, 220, 255, 0.86)" : "rgba(255, 176, 171, 0.86)"
    });

    if (hit) {
      applySmallArmsTankHit(game, shooter, tank, endX, endY, weapon, options);
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
      if (blocked) return { x: lastX, y: lastY };

      const hitTank = findSmallArmsTankHit(game, shooter, lastX, lastY, x, y, options);
      if (hitTank) {
        return {
          x: hitTank.x,
          y: hitTank.y,
          tank: hitTank.tank
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

    for (const tank of game.tanks || []) {
      if (!tank.alive || tank === shooter) continue;
      if (options.targetTeam && tank.team !== options.targetTeam) continue;

      const laneDistance = segmentDistanceToPoint(x1, y1, x2, y2, tank.x, tank.y);
      if (laneDistance > tank.radius + 2) continue;

      const t = clamp(((tank.x - x1) * dx + (tank.y - y1) * dy) / lenSq, 0, 1);
      if (t >= bestT) continue;
      const impactDistance = Math.max(0, Math.hypot(tank.radius, 0) - 2);
      const impactX = tank.x - dx / Math.sqrt(lenSq) * impactDistance;
      const impactY = tank.y - dy / Math.sqrt(lenSq) * impactDistance;
      best = { tank, x: impactX, y: impactY };
      bestT = t;
    }

    return best;
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
      if (!unit.alive || unit.team === shooter.team) continue;
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
    if (target.suppress) target.suppress(hit ? weapon.suppressionHit : weapon.suppressionMiss, shooter);

    for (const unit of game.infantry || []) {
      if (!unit.alive || unit === target || unit.team === shooter.team) continue;
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
          width: 3.2
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
        for (const tank of game.tanks) {
          if (!tank.alive || tank.team === shell.team || tank === shell.owner) continue;
          const shellDistance = segmentDistanceToPoint(
            shell.previousX,
            shell.previousY,
            shell.x,
            shell.y,
            tank.x,
            tank.y
          );
          if (shellDistance <= tank.radius + shell.radius) {
            hit = { tank };
            break;
          }
        }
      }

      if (!hit) {
        for (const unit of game.infantry || []) {
          if (!unit.alive || unit.team === shell.team) continue;
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
        hitTank.takeDamage(game, ammo.directDamage || ammo.damage);
      }

      damageRadius(game, x, y, ammo.splash, ammo.damage, shell.team, {
        ...ammo,
        excludeTarget: ammo.id === "rpg" ? hitTank : null,
        tankDamageScale: ammo.id === "rpg" ? 0.38 : ammo.tankDamageScale
      });
      game.effects.explosions.push({
        x,
        y,
        radius: ammo.explosionStart || (ammo.id === "rpg" ? 24 : 18),
        maxRadius: ammo.splash,
        life: ammo.explosionLife || 0.45,
        maxLife: ammo.explosionLife || 0.45,
        color: ammo.id === "rpg" ? "rgba(255, 118, 72, 0.92)" : "rgba(255, 159, 85, 0.9)"
      });
      game.effects.explosions.push({
        x,
        y,
        radius: 16,
        maxRadius: (ammo.splash || 80) * 0.62,
        life: 0.24,
        maxLife: 0.24,
        color: "rgba(255, 226, 160, 0.34)"
      });
      game.effects.scorchMarks.push({ x, y, radius: (ammo.scorchRadius || 34) + Math.random() * 18, alpha: ammo.id === "he" ? 0.3 : 0.22 });
      return;
    }

    if (hitTank) hitTank.takeDamage(game, ammo.damage);
    if (hitInfantry) game.player.hp = Math.max(0, game.player.hp - (ammo.infantryDamage || ammo.damage || 55));
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

  function damageRadius(game, x, y, radius, damage, team, ammo = {}) {
    for (const tank of game.tanks) {
      if (tank === ammo.excludeTarget) continue;
      if (!tank.alive || tank.team === team) continue;
      const d = distXY(x, y, tank.x, tank.y);
      if (d > radius + tank.radius) continue;
      const falloff = clamp(1 - d / (radius + tank.radius), 0.18, 1);
      tank.takeDamage(game, damage * (ammo.tankDamageScale ?? 1) * falloff);
    }

    for (const unit of game.infantry || []) {
      if (!unit.alive || unit.team === team) continue;
      const d = distXY(x, y, unit.x, unit.y);
      if (d > radius + unit.radius) continue;
      const falloff = clamp(1 - d / (radius + unit.radius), 0.2, 1);
      unit.suppress((ammo.suppressionBase ?? 18) + (ammo.suppressionMax ?? 42) * falloff, { x, y, team });
      unit.takeDamage(damage * (ammo.infantryDamageScale ?? 1) * falloff);
    }

    if (!game.player.inTank && game.player.hp > 0 && team === TEAM.RED && !game.isPlayerInSafeZone?.()) {
      const d = distXY(x, y, game.player.x, game.player.y);
      if (d < radius + game.player.radius) {
        game.player.hp = Math.max(0, game.player.hp - damage * (ammo.infantryDamageScale ?? 1) * clamp(1 - d / radius, 0.24, 1));
      }
    }
  }

  function updateEffects(game, dt) {
    const { explosions, smokeClouds, scorchMarks } = game.effects;
    const tracers = game.effects.tracers || (game.effects.tracers = []);

    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) tracers.splice(i, 1);
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
    throwGrenade,
    fireRpg,
    updateProjectiles,
    updateEffects,
    resolveImpact,
    damageRadius
  };
})(window);
