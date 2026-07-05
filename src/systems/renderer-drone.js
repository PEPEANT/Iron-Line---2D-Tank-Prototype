"use strict";

(function registerRendererDrone(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { clamp, roundRect } = IronLine.math;
  const proto = IronLine.Renderer?.prototype;
  if (!proto) return;

  Object.assign(proto, {
    drawReconDrone(game, drone) {
      if (!drone.alive) return;

      const state = this.droneRenderState(game, drone);
      this.drawDroneRangeAndLink(game, drone, state);
      this.drawDroneRoofLock(game, drone, state);
      if (state.attackDrone) this.drawAttackDroneTargeting(game, drone, state);
      else this.drawReconDroneDesignation(game, drone, state);
      this.drawDroneBody(drone, state);
      this.drawDroneStatusBar(drone, state);
    },

    droneRenderState(game, drone) {
      const attackDrone = drone.droneRole === "attack";
      const signalStrength = drone.signalStrength?.() ?? 1;
      const weakSignal = Boolean(drone.isSignalWeak?.());
      const criticalSignal = signalStrength <= 0.08;
      const controlled = game.player?.controlledDrone === drone;
      const pulse = 0.5 + Math.sin((game.matchTime || 0) * 7 + drone.rotorPhase) * 0.5;

      return {
        attackDrone,
        signalStrength,
        weakSignal,
        criticalSignal,
        controlled,
        pulse,
        bodyColor: attackDrone ? "#7b6040" : "#52665d",
        bodyTop: attackDrone ? "#9a7045" : "#667c72",
        armColor: attackDrone ? "#2f3128" : "#26342f",
        signalColor: weakSignal
          ? criticalSignal ? "rgba(226, 93, 74, 0.88)" : "rgba(255, 209, 102, 0.8)"
          : attackDrone ? "rgba(203, 112, 62, 0.8)" : "rgba(103, 155, 154, 0.72)"
      };
    },

    drawDroneRangeAndLink(game, drone, state) {
      const ctx = this.ctx;
      const { attackDrone, controlled, weakSignal, criticalSignal } = state;

      ctx.save();
      ctx.globalAlpha = controlled ? 0.13 : attackDrone ? 0.1 : 0.055;
      ctx.strokeStyle = attackDrone
        ? "rgba(186, 108, 61, 0.5)"
        : controlled ? "rgba(100, 154, 151, 0.4)" : "rgba(180, 194, 181, 0.18)";
      ctx.lineWidth = controlled ? 2 : 1;
      ctx.setLineDash([14, 18]);
      ctx.beginPath();
      ctx.arc(drone.x, drone.y, attackDrone ? drone.splash || 120 : drone.scanRange, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (drone.owner && drone.owner.hp > 0) {
        ctx.globalAlpha = controlled ? weakSignal ? 0.38 : 0.24 : 0.1;
        ctx.strokeStyle = weakSignal
          ? criticalSignal ? "rgba(226, 93, 74, 0.62)" : "rgba(255, 209, 102, 0.58)"
          : attackDrone ? "rgba(173, 124, 73, 0.48)" : "rgba(91, 137, 134, 0.5)";
        ctx.lineWidth = 1.2;
        if (weakSignal) ctx.setLineDash([7, 9]);
        ctx.beginPath();
        ctx.moveTo(drone.owner.x, drone.owner.y);
        ctx.lineTo(drone.x, drone.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    },

    drawDroneRoofLock(game, drone, state) {
      if (state.attackDrone || !drone.roofLocked || !drone.roofLockPoint) return;

      const ctx = this.ctx;
      const roofActive = Boolean(game.droneHasRoofCover?.(drone));
      const lockRadius = 18 + state.pulse * 3;

      ctx.save();
      ctx.globalAlpha = roofActive ? 0.74 : 0.46;
      ctx.strokeStyle = roofActive ? "rgba(143, 222, 207, 0.88)" : "rgba(143, 222, 207, 0.46)";
      ctx.lineWidth = roofActive ? 1.8 : 1.2;
      ctx.setLineDash(roofActive ? [] : [5, 7]);
      ctx.beginPath();
      ctx.moveTo(drone.x, drone.y);
      ctx.lineTo(drone.roofLockPoint.x, drone.roofLockPoint.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(drone.roofLockPoint.x, drone.roofLockPoint.y, lockRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "800 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = roofActive ? "rgba(197, 244, 231, 0.96)" : "rgba(183, 223, 213, 0.72)";
      ctx.fillText(roofActive ? "ROOF LOCK" : "ROOF", drone.roofLockPoint.x, drone.roofLockPoint.y - lockRadius - 10);
      ctx.restore();
    },

    drawAttackDroneTargeting(game, drone, state) {
      const ctx = this.ctx;
      const lock = drone.lockPosition?.();
      const lockTarget = lock?.target || drone.lockTarget;
      const lockRadius = lockTarget?.radius || 18;

      ctx.save();
      if (lock) this.drawAttackDroneLockMarker(ctx, drone, lock, lockRadius, state);
      if (state.controlled && !lock) this.drawAttackDroneDumbFireAim(game, drone, state);
      this.drawAttackDroneLockProgress(game, drone, state);
      this.drawAttackDroneFailure(drone, state);
      this.drawAttackDroneDetectedWarning(drone, state);
      ctx.restore();
    },

    drawAttackDroneDumbFireAim(game, drone, state) {
      const mouse = game.input?.mouse;
      if (!mouse) return;

      const ctx = this.ctx;
      const angle = drone.dumbFireActive && Number.isFinite(drone.dumbFireAngle)
        ? drone.dumbFireAngle
        : Math.atan2(mouse.worldY - drone.y, mouse.worldX - drone.x);
      const lineLength = drone.dumbFireActive ? 240 : 170;
      const tipX = drone.x + Math.cos(angle) * lineLength;
      const tipY = drone.y + Math.sin(angle) * lineLength;
      const wing = drone.dumbFireActive ? 13 : 10;

      ctx.globalAlpha = drone.dumbFireActive ? 0.82 : 0.58;
      ctx.strokeStyle = drone.dumbFireActive ? "rgba(255, 123, 72, 0.9)" : "rgba(255, 209, 102, 0.72)";
      ctx.lineWidth = drone.dumbFireActive ? 2.4 : 1.8;
      ctx.setLineDash(drone.dumbFireActive ? [] : [8, 8]);
      ctx.beginPath();
      ctx.moveTo(drone.x, drone.y);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - Math.cos(angle - 0.52) * wing, tipY - Math.sin(angle - 0.52) * wing);
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - Math.cos(angle + 0.52) * wing, tipY - Math.sin(angle + 0.52) * wing);
      ctx.stroke();

      ctx.font = "800 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = drone.dumbFireActive ? "rgba(255, 220, 184, 0.96)" : "rgba(255, 235, 172, 0.86)";
      ctx.fillText(drone.dumbFireActive ? "STRIKE" : "DUMB FIRE", tipX, tipY - 18 - state.pulse * 3);
    },

    drawAttackDroneLockMarker(ctx, drone, lock, lockRadius, state) {
      ctx.globalAlpha = drone.diveActive ? 0.82 : 0.62;
      ctx.strokeStyle = drone.diveActive ? "rgba(255, 123, 72, 0.92)" : "rgba(255, 209, 102, 0.82)";
      ctx.lineWidth = drone.diveActive ? 2.2 : 1.5;
      ctx.setLineDash(drone.diveActive ? [] : [6, 7]);
      ctx.beginPath();
      ctx.moveTo(drone.x, drone.y);
      ctx.lineTo(lock.x, lock.y);
      ctx.stroke();
      ctx.setLineDash([]);

      const markerRadius = lockRadius + (drone.diveActive ? 26 : 18) + state.pulse * 4;
      ctx.beginPath();
      ctx.arc(lock.x, lock.y, markerRadius, 0, Math.PI * 2);
      ctx.stroke();
      drawTargetCross(ctx, lock.x, lock.y, markerRadius);

      ctx.font = "800 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = drone.diveActive ? "rgba(255, 220, 184, 0.96)" : "rgba(255, 235, 172, 0.94)";
      ctx.fillText(drone.diveActive ? "STRIKE" : "TARGET", lock.x, lock.y - markerRadius - 13);
    },

    drawAttackDroneLockOptions(game, drone, state) {
      const ctx = this.ctx;
      const lockOptions = game.suicideDroneLockOptions?.(drone) || [];

      for (const item of lockOptions.slice(0, 5)) {
        const target = item.target;
        if (!target) continue;
        const radius = (target.radius || 10) + (item.lockable ? 18 : 12) + state.pulse * (item.lockable ? 3 : 1);
        ctx.globalAlpha = item.lockable ? 0.82 : 0.36;
        ctx.strokeStyle = item.lockable ? "rgba(255, 209, 102, 0.86)" : "rgba(255, 190, 104, 0.42)";
        ctx.lineWidth = item.lockable ? 1.7 : 1;
        ctx.beginPath();
        ctx.arc(target.x, target.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    },

    drawAttackDroneLockProgress(game, drone, state) {
      const lockRatio = drone.lockRatio?.() || 0;
      if (!state.controlled || lockRatio <= 0.01) return;

      const ctx = this.ctx;
      const attemptTarget = drone.lockAttemptTarget;
      const attemptPoint = attemptTarget
        ? { x: attemptTarget.x, y: attemptTarget.y, radius: attemptTarget.radius || 12 }
        : drone.lockAttemptPoint || { x: game.input.mouse.worldX, y: game.input.mouse.worldY, radius: 12 };
      const radius = (attemptPoint.radius || 12) + 28 + state.pulse * 4;

      ctx.globalAlpha = 0.88;
      ctx.lineWidth = 2.8;
      ctx.strokeStyle = "rgba(42, 39, 28, 0.74)";
      ctx.beginPath();
      ctx.arc(attemptPoint.x, attemptPoint.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 209, 102, 0.94)";
      ctx.beginPath();
      ctx.arc(attemptPoint.x, attemptPoint.y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lockRatio);
      ctx.stroke();
      ctx.font = "800 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255, 239, 184, 0.96)";
      ctx.fillText(`ATTACK ${Math.round(lockRatio * 100)}%`, attemptPoint.x, attemptPoint.y - radius - 14);
    },

    drawAttackDroneFailure(drone, state) {
      if (!state.controlled || drone.lockFailureTimer <= 0 || !drone.lockFailureReason) return;

      const ctx = this.ctx;
      const alpha = clamp(drone.lockFailureTimer / 0.9, 0, 1);
      ctx.globalAlpha = 0.42 + alpha * 0.44;
      ctx.fillStyle = "rgba(245, 95, 82, 0.95)";
      ctx.font = "800 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`FAIL: ${drone.lockFailureReason}`, drone.x, drone.y - 52);
    },

    drawAttackDroneDetectedWarning(drone, state) {
      if (drone.detectedTimer <= 0) return;

      const ctx = this.ctx;
      const alpha = clamp(drone.detectedTimer / 1.25, 0, 1);
      const warnRadius = drone.radius + 20 + state.pulse * 7;
      ctx.globalAlpha = 0.32 + alpha * 0.48;
      ctx.strokeStyle = "rgba(255, 93, 82, 0.92)";
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.arc(drone.x, drone.y, warnRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "900 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255, 190, 184, 0.96)";
      ctx.fillText("\uBC1C\uAC01", drone.x, drone.y - warnRadius - 10);
    },

    drawReconDroneDesignation(game, drone, state) {
      const ctx = this.ctx;
      const designation = game.droneDesignatedContact?.();
      const designatedHere = designation?.drone === drone ? designation : null;
      const showDesignationOptions = game.reconDroneDesignationUiDrone?.() === drone;
      const designationOptions = showDesignationOptions
        ? game.reconDroneDesignationOptions?.(drone) || []
        : [];

      ctx.save();
      if (designatedHere?.target) this.drawReconDroneDesignationLine(designatedHere, drone);
      if (designationOptions.length > 0) {
        this.drawReconDroneDesignationOptions(designationOptions, designatedHere, state);
      }
      ctx.restore();
    },

    drawReconDroneDesignationLine(designatedHere, drone) {
      const ctx = this.ctx;
      const target = designatedHere.target;
      const ttlPct = clamp(designatedHere.ttl / Math.max(0.001, designatedHere.maxTtl || 1), 0, 1);

      ctx.globalAlpha = 0.4 + ttlPct * 0.28;
      ctx.strokeStyle = "rgba(143, 222, 207, 0.82)";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      ctx.moveTo(drone.x, drone.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.74;
      ctx.beginPath();
      ctx.arc(target.x, target.y, (target.radius || 10) + 16 + (1 - ttlPct) * 3, 0, Math.PI * 2);
      ctx.stroke();
    },

    drawReconDroneDesignationOptions(designationOptions, designatedHere, state) {
      const ctx = this.ctx;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "10px Rajdhani, sans-serif";

      for (const item of designationOptions) {
        const target = item.target;
        if (!target || target === designatedHere?.target) continue;
        this.drawReconDroneDesignationOption(item, state);
      }
    },

    drawReconDroneDesignationOption(item, state) {
      const ctx = this.ctx;
      const target = item.target;
      const hot = Boolean(item.lockable);
      const radius = target.radius || 10;
      const markerRadius = radius + (hot ? 16 : 12) + state.pulse * (hot ? 4 : 1.5);
      const label = hot ? state.controlled ? "LOCK" : "MARK" : "TARGET";
      const labelWidth = hot ? state.controlled ? 42 : 46 : 50;
      const labelHeight = 17;
      const labelX = item.markerX;
      const labelY = item.markerY;

      ctx.globalAlpha = hot ? 0.92 : 0.52;
      ctx.strokeStyle = hot ? "rgba(255, 209, 102, 0.94)" : "rgba(143, 222, 207, 0.52)";
      ctx.lineWidth = hot ? 1.7 : 1.1;
      ctx.beginPath();
      ctx.arc(target.x, target.y, markerRadius, 0, Math.PI * 2);
      ctx.stroke();
      drawTargetCross(ctx, target.x, target.y, markerRadius);

      ctx.globalAlpha = hot ? 0.95 : 0.66;
      ctx.fillStyle = hot ? "rgba(42, 35, 15, 0.82)" : "rgba(10, 24, 23, 0.7)";
      roundRect(ctx, labelX - labelWidth / 2, labelY - labelHeight / 2, labelWidth, labelHeight, 3);
      ctx.fill();
      ctx.strokeStyle = hot ? "rgba(255, 209, 102, 0.9)" : "rgba(143, 222, 207, 0.44)";
      ctx.lineWidth = 1;
      roundRect(ctx, labelX - labelWidth / 2, labelY - labelHeight / 2, labelWidth, labelHeight, 3);
      ctx.stroke();

      ctx.fillStyle = hot ? "rgba(255, 235, 172, 0.96)" : "rgba(183, 223, 213, 0.75)";
      ctx.fillText(label, labelX, labelY + 0.5);

      if (hot) {
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = "rgba(255, 209, 102, 0.72)";
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(labelX, labelY + labelHeight / 2 + 2);
        ctx.lineTo(target.x, target.y - markerRadius + 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    },

    drawDroneBody(drone, state) {
      const ctx = this.ctx;
      const { attackDrone, pulse } = state;

      ctx.save();
      ctx.translate(drone.x, drone.y);
      ctx.rotate(drone.angle || 0);

      if (attackDrone && drone.boosting) this.drawAttackDroneBoostTrail(drone, state);

      ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
      ctx.beginPath();
      ctx.ellipse(2, 6, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      this.drawDroneArms(state);
      this.drawDroneRotors(pulse, attackDrone);
      this.drawDroneCore(state);
      ctx.restore();
    },

    drawAttackDroneBoostTrail(drone, state) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = drone.diveActive ? 0.68 : 0.46;
      ctx.strokeStyle = drone.diveActive ? "rgba(255, 135, 78, 0.78)" : "rgba(255, 209, 102, 0.68)";
      ctx.lineWidth = drone.diveActive ? 3.2 : 2.4;
      ctx.lineCap = "round";
      for (const offset of [-6, 0, 6]) {
        ctx.beginPath();
        ctx.moveTo(-10, offset * 0.55);
        ctx.lineTo(-36 - state.pulse * 10, offset);
        ctx.stroke();
      }
      ctx.restore();
    },

    drawDroneArms(state) {
      const ctx = this.ctx;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = state.armColor;
      ctx.lineWidth = 3.2;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-7, side * 4);
        ctx.lineTo(-18, side * 12);
        ctx.moveTo(7, side * 4);
        ctx.lineTo(18, side * 12);
        ctx.stroke();
      }
    },

    drawDroneRotors(pulse, attackDrone) {
      const ctx = this.ctx;
      const rotors = [
        [-20, -13],
        [20, -13],
        [-20, 13],
        [20, 13]
      ];

      ctx.strokeStyle = attackDrone ? "rgba(32, 34, 28, 0.86)" : "rgba(28, 39, 35, 0.86)";
      ctx.lineWidth = 1.5;
      for (const [rx, ry] of rotors) {
        ctx.beginPath();
        ctx.arc(rx, ry, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.2 + pulse * 0.16;
        ctx.beginPath();
        ctx.ellipse(rx, ry, 8, 2.2, Math.PI / 7, 0, Math.PI * 2);
        ctx.ellipse(rx, ry, 8, 2.2, -Math.PI / 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    },

    drawDroneCore(state) {
      const ctx = this.ctx;
      ctx.fillStyle = state.bodyColor;
      roundRect(ctx, -9, -5.5, 18, 11, 3);
      ctx.fill();

      ctx.fillStyle = state.bodyTop;
      roundRect(ctx, -5.5, -3.2, 11, 6.4, 2);
      ctx.fill();

      ctx.fillStyle = "rgba(15, 20, 18, 0.82)";
      roundRect(ctx, 4, -2.8, 5.5, 5.6, 1.5);
      ctx.fill();

      if (state.attackDrone) {
        ctx.fillStyle = "rgba(64, 35, 25, 0.92)";
        roundRect(ctx, -7, 4.8, 14, 5, 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(16, 18, 14, 0.58)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-4, 7.2);
        ctx.lineTo(4, 7.2);
        ctx.stroke();
      }

      ctx.fillStyle = state.signalColor;
      ctx.beginPath();
      ctx.arc(-5.8, -5.9, 1.6, 0, Math.PI * 2);
      ctx.arc(5.8, -5.9, 1.6, 0, Math.PI * 2);
      ctx.fill();
    },

    drawDroneStatusBar(drone, state) {
      const ctx = this.ctx;
      const width = 38;
      const pct = drone.batteryLimit
        ? clamp(drone.battery / Math.max(1, drone.maxBattery), 0, 1)
        : clamp(drone.hp / Math.max(1, drone.maxHp), 0, 1);

      ctx.save();
      ctx.translate(drone.x, drone.y - 32);
      ctx.fillStyle = "rgba(9, 15, 13, 0.64)";
      roundRect(ctx, -width / 2, -3, width, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = pct > 0.28
        ? state.attackDrone ? "rgba(188, 103, 60, 0.86)" : "rgba(93, 149, 146, 0.86)"
        : "rgba(220, 112, 98, 0.82)";
      roundRect(ctx, -width / 2, -3, width * pct, 5, 2.5);
      ctx.fill();
      if (state.controlled && state.weakSignal) {
        ctx.fillStyle = state.criticalSignal ? "rgba(255, 146, 116, 0.9)" : "rgba(255, 209, 102, 0.88)";
        ctx.font = "800 8px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("SIG", 0, -10);
      }
      ctx.restore();
    }
  });

  function drawTargetCross(ctx, x, y, radius) {
    ctx.beginPath();
    ctx.moveTo(x - radius - 8, y);
    ctx.lineTo(x - radius + 3, y);
    ctx.moveTo(x + radius - 3, y);
    ctx.lineTo(x + radius + 8, y);
    ctx.moveTo(x, y - radius - 8);
    ctx.lineTo(x, y - radius + 3);
    ctx.moveTo(x, y + radius - 3);
    ctx.lineTo(x, y + radius + 8);
    ctx.stroke();
  }
})(window);
