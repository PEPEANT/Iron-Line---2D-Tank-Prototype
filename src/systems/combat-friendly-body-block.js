"use strict";

(function registerCombatFriendlyBodyBlock(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { distXY, segmentDistanceToPoint } = IronLine.math;

  function pushLimited(list, item, max = 180) {
    if (!list) return;
    if (list.length >= max) list.shift();
    list.push(item);
  }

  function nearest(x, y, ...hits) {
    let best = null;
    let bestDistance = Infinity;
    for (const hit of hits) {
      if (!hit) continue;
      const distance = distXY(x, y, hit.x, hit.y);
      if (distance >= bestDistance) continue;
      best = hit;
      bestDistance = distance;
    }
    return best;
  }

  function find(game, shooter, x1, y1, x2, y2, options = {}) {
    if (options.ignoreFriendlyBodyBlock || !shooter?.team) return null;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = Math.max(1, dx * dx + dy * dy);
    const len = Math.sqrt(lenSq);
    let best = null;
    let bestT = Infinity;

    for (const unit of game.infantry || []) {
      if (!unit || unit === shooter || unit === options.ignoreTarget) continue;
      if (!unit.alive || unit.hp <= 0 || unit.inVehicle) continue;
      if (unit.team !== shooter.team) continue;

      const t = ((unit.x - x1) * dx + (unit.y - y1) * dy) / lenSq;
      if (t <= 0.02 || t >= 1 || t >= bestT) continue;
      const shooterClearance = (shooter.radius || 10) + (unit.radius || 10) + 4;
      if (distXY(shooter.x, shooter.y, unit.x, unit.y) < shooterClearance) continue;

      const laneDistance = segmentDistanceToPoint(x1, y1, x2, y2, unit.x, unit.y);
      const bodyRadius = Math.max(8, (unit.radius || 10) + (unit.isProne ? 5 : 4));
      if (laneDistance > bodyRadius) continue;

      const back = Math.min(bodyRadius * 0.55, 8);
      best = {
        unit,
        x: unit.x - dx / len * back,
        y: unit.y - dy / len * back,
        bodyBlocked: true
      };
      bestT = t;
    }

    return best;
  }

  function resolve(game, shooter, x1, y1, x2, y2, tankBlock, options = {}) {
    const infantryBlock = find(game, shooter, x1, y1, x2, y2, options);
    const firstBlock = nearest(x1, y1, infantryBlock, tankBlock);
    return {
      firstBlock,
      finalTankBlock: firstBlock?.tank ? firstBlock : null,
      finalBodyBlock: firstBlock?.bodyBlocked ? firstBlock : null,
      finalEndX: firstBlock ? firstBlock.x : x2,
      finalEndY: firstBlock ? firstBlock.y : y2
    };
  }

  function emit(game, shooter, unit, x, y, angle, weapon) {
    if (!unit?.alive || unit.inVehicle) return false;
    const prone = Boolean(unit.isProne);
    const supportWeapon = weapon?.id === "lmg" || weapon?.id === "machinegun";
    const pushDistance = (weapon?.id === "sniper" ? 8.5 : supportWeapon ? 6.5 : 5.2) * (prone ? 0.42 : 1);
    const reactTime = prone ? 0.12 : 0.16;

    unit.hitReactTimer = Math.max(unit.hitReactTimer || 0, reactTime);
    unit.hitSlowTimer = Math.max(unit.hitSlowTimer || 0, prone ? 0.18 : 0.28);
    unit.hitReactAngle = angle;
    unit.hitReactStrength = Math.max(unit.hitReactStrength || 0, prone ? 1.6 : 3.6);
    unit.suppress?.(Math.max(5, (weapon?.suppressionHit || 18) * 0.28), shooter);

    const moveDt = 0.05;
    IronLine.physics?.tryMoveCircle?.(
      game,
      unit,
      Math.cos(angle) * pushDistance / moveDt,
      Math.sin(angle) * pushDistance / moveDt,
      unit.radius || 10,
      moveDt,
      { blockTanks: true, blockWrecks: true, padding: 8, collisionSpeedScale: 0 }
    );

    const effects = game.effects || (game.effects = {});
    const sparks = effects.blastSparks || (effects.blastSparks = []);
    const normal = angle + Math.PI + (Math.random() - 0.5) * 0.8;
    pushLimited(sparks, {
      x,
      y,
      vx: Math.cos(normal) * (36 + Math.random() * 34),
      vy: Math.sin(normal) * (36 + Math.random() * 34),
      length: 4 + Math.random() * 4,
      life: 0.12,
      maxLife: 0.12,
      color: "rgba(237, 244, 239, 0.58)",
      width: 1.15,
      alpha: 0.72
    }, 260);

    const puffs = effects.dustPuffs || (effects.dustPuffs = []);
    pushLimited(puffs, {
      x,
      y,
      radius: 2.5,
      maxRadius: prone ? 7 : 9,
      life: 0.18,
      maxLife: 0.18,
      alpha: 0.2,
      color: "#c3c7b9"
    }, 220);
    return true;
  }

  IronLine.combatFriendlyBodyBlock = { find, nearest, resolve, emit };
})(window);
