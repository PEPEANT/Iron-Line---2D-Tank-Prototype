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
    const impact = traceShotToObstacle(game, startX, startY, shotAngle, range);

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

    applyLineSuppression(game, shooter, startX, startY, impact.x, impact.y, weapon, options.targetTeam);
    return true;
  }

  function traceShotToObstacle(game, startX, startY, angle, range) {
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

      lastX = x;
      lastY = y;
    }

    return { x: lastX, y: lastY };
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
          if (distXY(shell.x, shell.y, tank.x, tank.y) <= tank.radius + shell.radius) {
            hit = { tank };
            break;
          }
        }
      }

      if (!hit) {
        for (const unit of game.infantry || []) {
          if (!unit.alive || unit.team === shell.team) continue;
          if (distXY(shell.x, shell.y, unit.x, unit.y) <= unit.radius + shell.radius) {
            hit = { infantryUnit: unit };
            break;
          }
        }
      }

      if (!hit && !game.player.inTank && game.player.hp > 0 && shell.team === TEAM.RED && !game.isPlayerInSafeZone?.()) {
        if (distXY(shell.x, shell.y, game.player.x, game.player.y) <= game.player.radius + shell.radius) {
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

    if (ammo.id === "he") {
      damageRadius(game, x, y, ammo.splash, ammo.damage, shell.team);
      game.effects.explosions.push({
        x,
        y,
        radius: 18,
        maxRadius: ammo.splash,
        life: 0.45,
        maxLife: 0.45,
        color: "rgba(255, 159, 85, 0.9)"
      });
      game.effects.scorchMarks.push({ x, y, radius: 34 + Math.random() * 18, alpha: 0.22 });
      return;
    }

    if (hitTank) hitTank.takeDamage(game, ammo.damage);
    if (hitInfantry) game.player.hp = Math.max(0, game.player.hp - 55);
    if (hitInfantryUnit) hitInfantryUnit.takeDamage(ammo.damage);

    game.effects.explosions.push({
      x,
      y,
      radius: 6,
      maxRadius: 42,
      life: 0.24,
      maxLife: 0.24,
      color: "rgba(255, 242, 168, 0.85)"
    });
    game.effects.scorchMarks.push({ x, y, radius: 16 + Math.random() * 8, alpha: 0.12 });
  }

  function damageRadius(game, x, y, radius, damage, team) {
    for (const tank of game.tanks) {
      if (!tank.alive || tank.team === team) continue;
      const d = distXY(x, y, tank.x, tank.y);
      if (d > radius + tank.radius) continue;
      const falloff = clamp(1 - d / (radius + tank.radius), 0.18, 1);
      tank.takeDamage(game, damage * falloff);
    }

    for (const unit of game.infantry || []) {
      if (!unit.alive || unit.team === team) continue;
      const d = distXY(x, y, unit.x, unit.y);
      if (d > radius + unit.radius) continue;
      const falloff = clamp(1 - d / (radius + unit.radius), 0.2, 1);
      unit.suppress(18 + 42 * falloff, { x, y, team });
      unit.takeDamage(damage * falloff);
    }

    if (!game.player.inTank && game.player.hp > 0 && team === TEAM.RED && !game.isPlayerInSafeZone?.()) {
      const d = distXY(x, y, game.player.x, game.player.y);
      if (d < radius + game.player.radius) {
        game.player.hp = Math.max(0, game.player.hp - damage * clamp(1 - d / radius, 0.24, 1));
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
    updateProjectiles,
    updateEffects,
    resolveImpact,
    damageRadius
  };
})(window);
