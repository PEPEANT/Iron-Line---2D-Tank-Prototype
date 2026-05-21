"use strict";

(function registerRendererVehicle(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;
  const { clamp, roundRect } = IronLine.math;
  const proto = IronLine.Renderer?.prototype;
  if (!proto) return;

  Object.assign(proto, {
    drawHumvee(game, humvee) {
      const ctx = this.ctx;
      const {
        hullColor,
        darkColor,
        lightColor,
        accentColor
      } = this.vehicleRenderColors(game, humvee, {
        hullColor: humvee.team === TEAM.BLUE ? "#536a5e" : "#725f51",
        darkColor: humvee.team === TEAM.BLUE ? "#202a25" : "#332b27",
        lightColor: humvee.team === TEAM.BLUE ? "#7b8e82" : "#91796a",
        turretColor: humvee.team === TEAM.BLUE ? "#607469" : "#736154",
        accentColor: humvee.team === TEAM.BLUE ? "#6bbcff" : "#ff817b"
      });

      ctx.save();
      ctx.translate(humvee.x, humvee.y);
      if (humvee.impactShake > 0.001) {
        const wobble = (humvee.trackPhase || 0) * 9 + (game.matchTime || 0) * 28;
        ctx.translate(
          Math.sin(wobble) * humvee.impactShake * 3.2,
          Math.cos(wobble * 0.84) * humvee.impactShake * 2.6
        );
      }
      ctx.rotate(humvee.angle);
      ctx.scale(1.14, 1.14);

      if (!humvee.alive) {
        if (humvee.coverDestroyed) {
          ctx.globalAlpha = 0.34;
          ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
          ctx.beginPath();
          ctx.ellipse(2, 7, 34, 18, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(28, 26, 22, 0.76)";
          roundRect(ctx, -23, -10, 48, 20, 4);
          ctx.fill();
          ctx.restore();
          return;
        }
        ctx.globalAlpha = 0.86;
        ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
        ctx.beginPath();
        ctx.ellipse(2, 7, 33, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#191a18";
        roundRect(ctx, -31, -17, 62, 34, 5);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 120, 70, 0.16)";
        roundRect(ctx, -18, -10, 36, 20, 4);
        ctx.fill();
        ctx.strokeStyle = "rgba(0, 0, 0, 0.48)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-22, -13);
        ctx.lineTo(20, 12);
        ctx.moveTo(-12, 14);
        ctx.lineTo(25, -10);
        ctx.stroke();
        ctx.restore();
        this.drawTankLabel(humvee);
        return;
      }

      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.beginPath();
      ctx.ellipse(2, 7, 34, 19, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = darkColor;
      for (const x of [-22, 20]) {
        for (const y of [-17, 17]) {
          ctx.beginPath();
          ctx.ellipse(x, y, 8, 5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.fillStyle = hullColor;
      ctx.beginPath();
      ctx.moveTo(-31, -13);
      ctx.lineTo(14, -17);
      ctx.lineTo(31, -8);
      ctx.lineTo(34, 0);
      ctx.lineTo(30, 9);
      ctx.lineTo(14, 17);
      ctx.lineTo(-31, 13);
      ctx.lineTo(-35, 0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.beginPath();
      ctx.moveTo(6, -14);
      ctx.lineTo(24, -7);
      ctx.lineTo(29, 0);
      ctx.lineTo(23, 7);
      ctx.lineTo(6, 14);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = lightColor;
      roundRect(ctx, -16, -9, 17, 18, 3);
      ctx.fill();
      ctx.fillStyle = "rgba(14, 19, 17, 0.56)";
      roundRect(ctx, -12, -6, 9, 12, 2);
      ctx.fill();
      ctx.fillStyle = accentColor;
      roundRect(ctx, -29, -7, 4, 14, 1.5);
      ctx.fill();

      ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-22, -12);
      ctx.lineTo(-18, 12);
      ctx.moveTo(7, -14);
      ctx.lineTo(7, 14);
      ctx.stroke();
      ctx.restore();

      const mount = humvee.machineGunMountPoint?.() || { x: humvee.x, y: humvee.y };
      const manned = humvee.hasCrew?.() ?? humvee.playerControlled;
      ctx.save();
      ctx.translate(mount.x, mount.y);
      const humveeKick = humvee.machineGunKick || 0;
      ctx.rotate((humvee.machineGunAngle ?? humvee.angle) + Math.sin((game.matchTime || 0) * 90) * humveeKick * 0.014);
      ctx.globalAlpha = manned ? 0.94 : 0.34;
      const kick = humveeKick * 3.5;
      ctx.fillStyle = darkColor;
      roundRect(ctx, -7 - kick, -4, 14, 8, 3);
      ctx.fill();
      ctx.fillStyle = manned ? lightColor : "rgba(214, 222, 210, 0.44)";
      roundRect(ctx, 4 - kick, -1.5, 22, 3, 1.3);
      ctx.fill();
      ctx.fillStyle = "#151b18";
      roundRect(ctx, 24 - kick, -2.8, 5, 5.6, 1.2);
      ctx.fill();
      ctx.restore();

      this.drawTankHealth(humvee);
      this.drawTankLabel(humvee);
    },

    drawTank(game, tank) {
      const colors = this.tankRenderColors(game, tank);

      this.drawTankHullLayer(game, tank, colors);
      if (!tank.alive) {
        if (!tank.coverDestroyed) this.drawTankLabel(tank);
        return;
      }

      this.drawTankTurretLayer(game, tank, colors);
      this.drawTankMachineGun(game, tank, colors);
      this.drawTankHealth(tank);
      this.drawTankAssaultIndicator(tank);
      this.drawTankLabel(tank);
    },

    tankRenderColors(game, tank) {
      return this.vehicleRenderColors(game, tank, {
        hullColor: tank.team === TEAM.BLUE ? "#566b60" : "#69584c",
        darkColor: tank.team === TEAM.BLUE ? "#27312c" : "#342c28",
        lightColor: tank.team === TEAM.BLUE ? "#728278" : "#867168",
        turretColor: tank.team === TEAM.BLUE ? "#607469" : "#736154",
        accentColor: tank.team === TEAM.BLUE ? "#5ca6d6" : "#c96259"
      });
    },

    vehicleRenderColors(game, vehicle, fallback) {
      return IronLine.factionVisuals?.vehiclePalette?.(game, vehicle, fallback) || fallback;
    },

    applyTankDrawTransform(game, tank, angle) {
      const ctx = this.ctx;
      ctx.translate(tank.x, tank.y);
      if (tank.impactShake > 0.001) {
        const wobble = (tank.trackPhase || 0) * 13 + (game.matchTime || 0) * 21;
        ctx.translate(
          Math.sin(wobble) * tank.impactShake * 4,
          Math.cos(wobble * 0.83) * tank.impactShake * 3
        );
      }
      if (tank.fireKick > 0.001) {
        const kick = tank.fireKick * 6;
        ctx.translate(-Math.cos(tank.turretAngle) * kick, -Math.sin(tank.turretAngle) * kick);
      }
      ctx.rotate(angle);
      ctx.scale(1.34, 1.34);
    },

    drawTankHullLayer(game, tank, colors) {
      const ctx = this.ctx;
      ctx.save();
      this.applyTankDrawTransform(game, tank, tank.angle);
      if (!tank.alive) this.drawTankWreck(tank);
      else this.drawTankHull(game, tank, colors);
      ctx.restore();
    },

    drawTankWreck(tank) {
      const ctx = this.ctx;
      if (tank.coverDestroyed) {
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
        ctx.beginPath();
        ctx.ellipse(2, 7, 42, 23, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(27, 25, 21, 0.78)";
        roundRect(ctx, -29, -15, 58, 30, 5);
        ctx.fill();
        return;
      }
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = "#151615";
      roundRect(ctx, -36, -25, 72, 50, 6);
      ctx.fill();
      ctx.fillStyle = "#25231f";
      roundRect(ctx, -29, -18, 58, 36, 5);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 120, 80, 0.16)";
      roundRect(ctx, -18, -13, 38, 25, 5);
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.38)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-28, -19);
      ctx.lineTo(20, 18);
      ctx.moveTo(-18, 18);
      ctx.lineTo(32, -14);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 174, 96, 0.18)";
      ctx.beginPath();
      ctx.arc(2, -2, 15 + Math.sin((tank.wreckTimer || 0) * 2.8) * 2, 0, Math.PI * 2);
      ctx.fill();
    },

    drawTankHull(game, tank, colors) {
      const ctx = this.ctx;
      const treadPhase = (tank.trackPhase || 0) % 12;

      ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
      ctx.beginPath();
      ctx.ellipse(2, 7, 39, 23, 0, 0, Math.PI * 2);
      ctx.fill();

      this.drawTankTracks(treadPhase, colors.darkColor);
      this.drawTankHullPlate(colors);
      this.drawTankTrackArmor(treadPhase);
      this.drawTankBolts();
      if (tank.destructionPending) this.drawTankDestructionCharge(game);
    },

    drawTankTracks(treadPhase, darkColor) {
      const ctx = this.ctx;
      ctx.fillStyle = darkColor;
      roundRect(ctx, -42, -27, 84, 13, 3);
      roundRect(ctx, -42, 14, 84, 13, 3);
      ctx.fill();

      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      roundRect(ctx, -38, -23, 76, 4, 2);
      roundRect(ctx, -38, 19, 76, 4, 2);
      ctx.fill();

      ctx.fillStyle = "rgba(218, 225, 210, 0.09)";
      for (const side of [-1, 1]) {
        for (let i = 0; i < 6; i += 1) {
          const stripeX = -31 + ((i * 12 + treadPhase) % 72);
          roundRect(ctx, stripeX - 4, side * 19 - 2, 8, 4, 1.5);
          ctx.fill();
        }
      }
    },

    drawTankHullPlate(colors) {
      const ctx = this.ctx;
      ctx.fillStyle = colors.hullColor;
      ctx.beginPath();
      ctx.moveTo(-35, -18);
      ctx.lineTo(22, -18);
      ctx.lineTo(34, -10);
      ctx.lineTo(38, 0);
      ctx.lineTo(34, 10);
      ctx.lineTo(22, 18);
      ctx.lineTo(-35, 18);
      ctx.lineTo(-39, 10);
      ctx.lineTo(-39, -10);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.beginPath();
      ctx.moveTo(8, -15);
      ctx.lineTo(28, -10);
      ctx.lineTo(36, 0);
      ctx.lineTo(28, 10);
      ctx.lineTo(8, 15);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(0, 0, 0, 0.24)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-18, -16);
      ctx.lineTo(-13, -6);
      ctx.lineTo(-13, 6);
      ctx.lineTo(-18, 16);
      ctx.moveTo(9, -17);
      ctx.lineTo(9, 17);
      ctx.moveTo(23, -12);
      ctx.lineTo(31, 0);
      ctx.lineTo(23, 12);
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      roundRect(ctx, -14, -9, 22, 18, 3);
      ctx.fill();
      ctx.fillStyle = colors.accentColor;
      roundRect(ctx, -30, -13, 5, 26, 1.5);
      ctx.fill();
    },

    drawTankTrackArmor(treadPhase) {
      const ctx = this.ctx;
      ctx.fillStyle = "rgba(18, 23, 20, 0.82)";
      for (const side of [-1, 1]) {
        roundRect(ctx, -38, side * 22 - 4, 76, 8, 3);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(218, 225, 210, 0.14)";
      for (const side of [-1, 1]) {
        for (let i = 0; i < 7; i += 1) {
          const stripeX = -34 + ((i * 12 + treadPhase) % 80);
          roundRect(ctx, stripeX - 3.5, side * 22 - 2, 7, 4, 1.5);
          ctx.fill();
        }
      }
    },

    drawTankBolts() {
      const ctx = this.ctx;
      ctx.fillStyle = "rgba(6, 10, 8, 0.56)";
      for (const side of [-1, 1]) {
        for (const x of [-29, -16, -3, 10, 23, 34]) {
          ctx.beginPath();
          ctx.arc(x, side * 22, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.fillStyle = "rgba(20, 26, 22, 0.34)";
      for (const x of [-24, 20]) {
        for (const y of [-12, 12]) {
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },

    drawTankDestructionCharge(game) {
      const ctx = this.ctx;
      const pulse = 0.5 + Math.sin((game.matchTime || 0) * 18) * 0.5;
      ctx.fillStyle = "rgba(10, 9, 8, 0.48)";
      roundRect(ctx, -30, -16, 58, 32, 5);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 93, 42, ${0.24 + pulse * 0.16})`;
      ctx.beginPath();
      ctx.arc(4, -2, 12 + pulse * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 189, 88, ${0.22 + pulse * 0.18})`;
      ctx.beginPath();
      ctx.arc(-12, 8, 6 + pulse * 3, 0, Math.PI * 2);
      ctx.fill();
    },

    drawTankTurretLayer(game, tank, colors) {
      const ctx = this.ctx;
      ctx.save();
      this.applyTankDrawTransform(game, tank, tank.turretAngle);
      this.drawTankTurret(tank, colors);
      ctx.restore();
    },

    drawTankTurret(tank, colors) {
      const ctx = this.ctx;
      const recoilOffset = -tank.recoil * 7;

      ctx.fillStyle = colors.darkColor;
      roundRect(ctx, 8 + recoilOffset, -4, 58, 8, 2.5);
      ctx.fill();
      ctx.fillStyle = colors.lightColor;
      roundRect(ctx, 9 + recoilOffset, -2.5, 51, 5, 2);
      ctx.fill();
      ctx.fillStyle = "#1d2420";
      roundRect(ctx, 58 + recoilOffset, -5, 10, 10, 2);
      ctx.fill();

      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      ctx.beginPath();
      ctx.ellipse(1, 4, 25, 17, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = colors.turretColor;
      ctx.beginPath();
      ctx.moveTo(-21, -11);
      ctx.lineTo(7, -15);
      ctx.lineTo(24, -8);
      ctx.lineTo(25, 8);
      ctx.lineTo(8, 15);
      ctx.lineTo(-19, 11);
      ctx.lineTo(-24, 0);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-13, -9);
      ctx.lineTo(4, -12);
      ctx.moveTo(-15, 9);
      ctx.lineTo(6, 12);
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 255, 255, 0.11)";
      roundRect(ctx, -9, -6, 13, 12, 3);
      ctx.fill();
      ctx.fillStyle = colors.accentColor;
      roundRect(ctx, 11, -9, 9, 4, 1.5);
      ctx.fill();
      if (tank.destructionPending) {
        ctx.fillStyle = "rgba(8, 7, 6, 0.44)";
        ctx.beginPath();
        ctx.ellipse(0, 0, 24, 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    drawTankMachineGun(game, tank, colors) {
      if (!tank.alive) return;
      const ctx = this.ctx;
      const manned = tank.hasMachineGunner?.();
      const active = manned && (tank.weaponMode === "mg" || (tank.machineGunKick || 0) > 0.02) && (tank.ammo?.mg || 0) > 0;
      const baseAngle = tank.turretAngle ?? tank.angle;
      const mount = tank.machineGunMountPoint?.() || {
        x: tank.x + Math.cos(baseAngle) * -4 + Math.cos(baseAngle + Math.PI / 2) * -15,
        y: tank.y + Math.sin(baseAngle) * -4 + Math.sin(baseAngle + Math.PI / 2) * -15
      };

      ctx.save();
      ctx.translate(mount.x, mount.y);
      if (tank.impactShake > 0.001) {
        const wobble = (tank.trackPhase || 0) * 13 + (game.matchTime || 0) * 21;
        ctx.translate(
          Math.sin(wobble) * tank.impactShake * 4,
          Math.cos(wobble * 0.83) * tank.impactShake * 3
        );
      }
      ctx.rotate(baseAngle);
      ctx.globalAlpha = manned ? 0.92 : 0.38;
      ctx.fillStyle = colors.darkColor;
      roundRect(ctx, -8, -5, 16, 10, 3);
      ctx.fill();
      ctx.fillStyle = active ? colors.accentColor : colors.lightColor;
      roundRect(ctx, -3, -3, 7, 6, 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
      ctx.lineWidth = 1.2;
      roundRect(ctx, -8, -5, 16, 10, 3);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(mount.x, mount.y);
      if (tank.impactShake > 0.001) {
        const wobble = (tank.trackPhase || 0) * 13 + (game.matchTime || 0) * 21;
        ctx.translate(
          Math.sin(wobble) * tank.impactShake * 4,
          Math.cos(wobble * 0.83) * tank.impactShake * 3
        );
      }
      const tankKick = tank.machineGunKick || 0;
      ctx.rotate((tank.machineGunAngle ?? baseAngle) + Math.sin((game.matchTime || 0) * 90) * tankKick * 0.012);
      ctx.globalAlpha = manned ? 0.96 : 0.34;
      const kick = tankKick * 3.4;
      ctx.fillStyle = colors.darkColor;
      roundRect(ctx, -4 - kick, -3, 12, 6, 2);
      ctx.fill();
      ctx.fillStyle = active ? colors.lightColor : "rgba(214, 222, 210, 0.46)";
      roundRect(ctx, 6 - kick, -1.3, 18, 2.6, 1);
      ctx.fill();
      ctx.fillStyle = "#151b18";
      roundRect(ctx, 22 - kick, -2.5, 5, 5, 1.2);
      ctx.fill();
      ctx.restore();
    },

    drawTankHealth(tank) {
      const ctx = this.ctx;
      const width = 66;
      const pct = tank.maxHp > 0 ? tank.hp / tank.maxHp : 0;
      ctx.save();
      ctx.translate(tank.x, tank.y - (tank.vehicleType === "humvee" ? 58 : 64));
      if (tank.reload?.active) {
        const reloadPct = clamp(tank.reload.progress / Math.max(tank.reload.duration, 0.001), 0, 1);
        const reloadWidth = 52;
        ctx.fillStyle = "rgba(9, 15, 13, 0.68)";
        roundRect(ctx, -reloadWidth / 2, -14, reloadWidth, 4, 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 209, 102, 0.96)";
        roundRect(ctx, -reloadWidth / 2, -14, reloadWidth * reloadPct, 4, 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(9, 15, 13, 0.72)";
      roundRect(ctx, -width / 2, -5, width, 8, 4);
      ctx.fill();
      ctx.fillStyle = tank.team === TEAM.BLUE ? "#6bbcff" : "#ff6d66";
      roundRect(ctx, -width / 2, -5, width * pct, 8, 4);
      ctx.fill();
      ctx.restore();
    },

    drawTankAssaultIndicator(tank) {
      const assault = tank.infantryAssault;
      if (!assault || !tank.alive || tank.destructionPending) return;

      const ctx = this.ctx;
      const progress = clamp((assault.progress || 0) / 7, 0, 1);
      const disabled = (tank.assaultDisabledTimer || 0) > 0 || progress >= 1;
      const impaired = (tank.assaultMobilityTimer || 0) > 0 || progress >= 0.43;
      const label = disabled ? "기동 무력화" : impaired ? "폭약 설치 중" : "전차 강습";
      const width = 96;
      const y = tank.y - 88;

      ctx.save();
      ctx.translate(tank.x, y);
      ctx.fillStyle = "rgba(9, 15, 13, 0.82)";
      roundRect(ctx, -width / 2, -17, width, 30, 6);
      ctx.fill();
      ctx.strokeStyle = disabled ? "rgba(255, 109, 102, 0.72)" : "rgba(255, 209, 102, 0.54)";
      ctx.lineWidth = 1.3;
      ctx.stroke();

      ctx.fillStyle = disabled ? "#ff8b80" : "#ffd166";
      roundRect(ctx, -width / 2 + 8, 4, (width - 16) * progress, 5, 2.5);
      ctx.fill();

      ctx.fillStyle = "#edf4ef";
      ctx.font = "800 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 0, -5);
      ctx.restore();
    },

    drawTankLabel(tank) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(tank.x, tank.y + (tank.vehicleType === "humvee" ? 53 : 60));
      const passengerText = tank.vehicleType === "humvee" && tank.passengerCapacity
        ? ` ${tank.passengerCount?.() || 0}/${tank.passengerCapacity}`
        : "";
      const label = `${tank.callSign}${passengerText}`;
      const width = Math.max(54, label.length * 7.2 + 14);
      ctx.fillStyle = "rgba(9, 15, 13, 0.65)";
      roundRect(ctx, -width / 2, -10, width, 18, 4);
      ctx.fill();
      ctx.fillStyle = "#edf4ef";
      ctx.font = "700 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  });
})(window);
