"use strict";

(function registerRenderer(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, TEAM_COLORS, AMMO, INFANTRY_WEAPONS } = IronLine.constants;
  const { clamp, lerp, distXY, angleTo, roundRect, hexToRgba, lineIntersectsRect } = IronLine.math;

  class Renderer {
    constructor(canvas, camera) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.camera = camera;
      this.resize();
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      this.camera.width = window.innerWidth;
      this.camera.height = window.innerHeight;
      this.camera.zoom = this.camera.zoom || 1;
      this.camera.viewWidth = this.camera.width / this.camera.zoom;
      this.camera.viewHeight = this.camera.height / this.camera.zoom;
      this.canvas.width = Math.floor(this.camera.width * dpr);
      this.canvas.height = Math.floor(this.camera.height * dpr);
      this.canvas.style.width = `${this.camera.width}px`;
      this.canvas.style.height = `${this.camera.height}px`;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    draw(game) {
      const ctx = this.ctx;
      const camera = this.camera;
      ctx.clearRect(0, 0, camera.width, camera.height);
      ctx.save();
      const shake = game.screenShake || 0;
      if (shake > 0.05) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      }
      ctx.scale(camera.zoom || 1, camera.zoom || 1);
      ctx.translate(-camera.x, -camera.y);

      this.drawTerrain(game);
      this.drawSafeZones(game);
      this.drawCapturePoints(game);
      this.drawScorchMarks(game);
      this.drawObstacles(game);
      this.drawDustPuffs(game);
      this.drawTrackScuffs(game);

      for (const humvee of game.humvees || []) this.drawHumvee(game, humvee);
      for (const tank of game.tanks) this.drawTank(game, tank);
      this.drawGunSmokePuffs(game);
      this.drawMuzzleFlashes(game);
      this.drawPlayerTankAim(game);
      for (const unit of game.infantry || []) this.drawInfantryUnit(game, unit);
      for (const crew of game.crews || []) this.drawCrewMember(game, crew);
      if (!game.player.inTank && game.player.hp > 0) this.drawInfantry(game, game.player, { color: "#b6dcff" });
      else if (!game.player.inTank && (game.playerDowned || game.playerDeathActive)) this.drawInfantryCorpse(game.player);
      this.drawPlayerInfantryAim(game);
      for (const drone of game.drones || []) this.drawReconDrone(game, drone);

      this.drawProjectiles(game);
      this.drawTracers(game);
      this.drawExplosions(game);
      this.drawBlastSparks(game);
      this.drawBlastRings(game);
      this.drawSmoke(game);
      this.drawDebugOverlay(game);

      ctx.restore();
      this.drawMinimap(game);
      this.drawScreenVignette(game);
      this.drawStartCountdown(game);
      this.drawTestLabOverlay(game);
      this.drawAimModeOverlay(game);
      this.drawScoutAimOverlay(game);
      this.drawRpgAimOverlay(game);
    }

    drawTestLabOverlay(game) {
      if (!game.testLab) return;

      const ctx = this.ctx;
      const x = 16;
      const y = 82;
      const width = 330;
      const height = 92;
      ctx.save();
      ctx.fillStyle = "rgba(8, 13, 12, 0.62)";
      roundRect(ctx, x, y, width, height, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(143, 222, 207, 0.28)";
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, width, height, 6);
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(237, 244, 239, 0.94)";
      ctx.font = "700 13px Rajdhani, sans-serif";
      ctx.fillText(`TEST LAB: ${String(game.testLab).toUpperCase()}  AI ${game.testLabAiPaused ? "PAUSED" : "ACTIVE"}`, x + 12, y + 10);
      ctx.font = "11px Rajdhani, sans-serif";
      ctx.fillStyle = "rgba(183, 223, 213, 0.84)";
      ctx.fillText("F1 infantry  F2 tank  F3 humvee  F4 AI", x + 12, y + 34);
      ctx.fillText("F5 refill  F6 roof drone  F7 debug", x + 12, y + 52);
      ctx.fillStyle = "rgba(255, 209, 102, 0.78)";
      ctx.fillText("Open: index.html?testLab=drone", x + 12, y + 70);
      ctx.restore();
    }

    drawTerrain(game) {
      const ctx = this.ctx;
      const world = game.world;
      const gradient = ctx.createLinearGradient(0, 0, world.width, world.height);
      gradient.addColorStop(0, "#213922");
      gradient.addColorStop(0.48, "#263d26");
      gradient.addColorStop(1, "#1f3429");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, world.width, world.height);

      for (const patch of world.terrainPatches) {
        const g = ctx.createRadialGradient(patch.x, patch.y, 0, patch.x, patch.y, patch.r);
        g.addColorStop(0, patch.color);
        g.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(patch.x, patch.y, patch.r, 0, Math.PI * 2);
        ctx.fill();
      }

      this.drawRoadNetwork(world);

      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.strokeStyle = "#d9e5cf";
      ctx.lineWidth = 1;
      for (let x = 0; x <= world.width; x += 120) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, world.height);
        ctx.stroke();
      }
      for (let y = 0; y <= world.height; y += 120) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(world.width, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawRoadNetwork(world) {
      const ctx = this.ctx;
      const roads = world.roads || [];
      const roadWidth = world.roadWidth || 84;
      const junctions = collectRoadJunctions(roads);
      const roadBody = "#64614a";

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const road of roads) this.strokeRoadPath(road, "#50523d", (road.width || roadWidth) + 10);
      for (const road of roads) this.strokeRoadPath(road, roadBody, road.width || roadWidth);
      for (const junction of junctions) {
        const radius = Math.max(28, roadWidth * 0.54);
        ctx.fillStyle = roadBody;
        ctx.beginPath();
        ctx.arc(junction.x, junction.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const road of roads) {
        const width = road.width || roadWidth;
        this.strokeRoadPath(road, "rgba(211, 197, 139, 0.32)", Math.max(5, width * 0.08), [28, 36]);
      }

      for (const junction of junctions) {
        const radius = Math.max(24, roadWidth * 0.4);
        ctx.fillStyle = roadBody;
        ctx.beginPath();
        ctx.arc(junction.x, junction.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    strokeRoadPath(road, color, width, dash = null) {
      if (!road || road.length < 2) return;
      const ctx = this.ctx;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(road[0].x, road[0].y);
      for (let i = 1; i < road.length; i += 1) ctx.lineTo(road[i].x, road[i].y);
      ctx.stroke();
      if (dash) ctx.setLineDash([]);
    }

    drawSafeZones(game) {
      const ctx = this.ctx;
      for (const zone of game.world.safeZones || []) {
        const color = zone.team === TEAM.BLUE ? "#6bbcff" : "#ff6d66";
        ctx.save();
        ctx.globalAlpha = 0.92;
        const gradient = ctx.createRadialGradient(zone.x, zone.y, 0, zone.x, zone.y, zone.radius);
        gradient.addColorStop(0, hexToRgba(color, 0.12));
        gradient.addColorStop(0.72, hexToRgba(color, 0.055));
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = hexToRgba(color, 0.55);
        ctx.lineWidth = 3;
        ctx.setLineDash([14, 12]);
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.radius - 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "rgba(9, 15, 13, 0.68)";
        ctx.strokeStyle = hexToRgba(color, 0.4);
        roundRect(ctx, zone.x - 42, zone.y - zone.radius - 28, 84, 22, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#edf4ef";
        ctx.font = "800 10px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("안전구역", zone.x, zone.y - zone.radius - 17);
        ctx.restore();
      }
    }

    drawCapturePoints(game) {
      const ctx = this.ctx;
      for (const point of game.capturePoints) {
        const color = TEAM_COLORS[point.owner];
        const progressColor = point.progress >= 0 ? TEAM_COLORS.blue : TEAM_COLORS.red;

        ctx.save();
        ctx.translate(point.x, point.y);
        ctx.fillStyle = point.owner === TEAM.NEUTRAL ? "rgba(220, 213, 181, 0.08)" : hexToRgba(color, 0.14);
        ctx.strokeStyle = point.contested ? "#ffd166" : hexToRgba(color, 0.75);
        ctx.lineWidth = point.contested ? 5 : 3;
        ctx.beginPath();
        ctx.arc(0, 0, point.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = hexToRgba(progressColor, 0.9);
        ctx.lineWidth = 8;
        ctx.beginPath();
        const arc = Math.abs(point.progress) * Math.PI * 2;
        ctx.arc(0, 0, point.radius - 13, -Math.PI / 2, -Math.PI / 2 + arc * Math.sign(point.progress || 1));
        ctx.stroke();

        ctx.fillStyle = "rgba(9, 15, 13, 0.72)";
        ctx.strokeStyle = "rgba(237, 244, 239, 0.18)";
        roundRect(ctx, -28, -21, 56, 42, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#edf4ef";
        ctx.font = "800 22px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(point.name, 0, 1);
        ctx.restore();
      }
    }

    drawScorchMarks(game) {
      const ctx = this.ctx;
      for (const mark of game.effects.scorchMarks) {
        const gradient = ctx.createRadialGradient(mark.x, mark.y, 0, mark.x, mark.y, mark.radius);
        gradient.addColorStop(0, `rgba(0, 0, 0, ${mark.alpha})`);
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(mark.x, mark.y, mark.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawDustPuffs(game) {
      const ctx = this.ctx;
      const puffs = game.effects.dustPuffs || [];
      ctx.save();
      for (const puff of puffs) {
        const lifePct = clamp(puff.life / puff.maxLife, 0, 1);
        ctx.globalAlpha = lifePct * (puff.alpha || 0.18);
        ctx.fillStyle = puff.color || "#d1c092";
        ctx.beginPath();
        ctx.ellipse(puff.x, puff.y, puff.radius * 1.35, puff.radius * 0.82, puff.angle || 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    drawTrackScuffs(game) {
      const ctx = this.ctx;
      ctx.save();
      ctx.lineCap = "round";
      for (const mark of game.effects.trackScuffs || []) {
        const lifePct = clamp(mark.life / mark.maxLife, 0, 1);
        ctx.globalAlpha = lifePct * (mark.alpha || 0.1);
        ctx.strokeStyle = "#242a25";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(mark.x1, mark.y1);
        ctx.lineTo(mark.x2, mark.y2);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawGunSmokePuffs(game) {
      const ctx = this.ctx;
      const puffs = game.effects.gunSmokePuffs || [];
      ctx.save();
      for (const puff of puffs) {
        const lifePct = clamp(puff.life / puff.maxLife, 0, 1);
        ctx.globalAlpha = Math.pow(lifePct, 1.35) * (puff.alpha || 0.2);
        ctx.fillStyle = puff.warm ? "#d7c1a0" : "#bfc5bf";
        ctx.beginPath();
        ctx.ellipse(puff.x, puff.y, puff.radius * 1.45, puff.radius, puff.angle || 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    drawMuzzleFlashes(game) {
      const ctx = this.ctx;
      for (const flash of game.effects.muzzleFlashes || []) {
        const lifePct = clamp(flash.life / flash.maxLife, 0, 1);
        const length = flash.length * (0.65 + lifePct * 0.35);
        const width = flash.width * lifePct;

        ctx.save();
        ctx.translate(flash.x, flash.y);
        ctx.rotate(flash.angle);
        ctx.globalAlpha = lifePct;
        ctx.fillStyle = flash.color || "rgba(255, 226, 160, 0.92)";
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(length * 0.72, -width * 0.5);
        ctx.lineTo(length, 0);
        ctx.lineTo(length * 0.72, width * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255, 248, 210, 0.9)";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(length * 0.46, -width * 0.22);
        ctx.lineTo(length * 0.62, 0);
        ctx.lineTo(length * 0.46, width * 0.22);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    drawObstacles(game) {
      const ctx = this.ctx;
      for (const obstacle of game.world.obstacles) {
        const isBuilding = obstacle.kind === "building";
        const gradient = ctx.createLinearGradient(obstacle.x, obstacle.y, obstacle.x + obstacle.w, obstacle.y + obstacle.h);
        gradient.addColorStop(0, isBuilding ? "#4f5550" : "#636b62");
        gradient.addColorStop(1, isBuilding ? "#2e3732" : "#3e473f");
        ctx.fillStyle = gradient;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
        ctx.lineWidth = 2;
        roundRect(ctx, obstacle.x, obstacle.y, obstacle.w, obstacle.h, 5);
        ctx.fill();
        ctx.stroke();

        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = "#202923";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(obstacle.x + 14, obstacle.y + 18);
        ctx.lineTo(obstacle.x + obstacle.w - 20, obstacle.y + obstacle.h - 16);
        ctx.moveTo(obstacle.x + obstacle.w - 18, obstacle.y + 16);
        ctx.lineTo(obstacle.x + 22, obstacle.y + obstacle.h - 18);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawHumvee(game, humvee) {
      const ctx = this.ctx;
      const hullColor = humvee.team === TEAM.BLUE ? "#536a5e" : "#725f51";
      const darkColor = humvee.team === TEAM.BLUE ? "#202a25" : "#332b27";
      const lightColor = humvee.team === TEAM.BLUE ? "#7b8e82" : "#91796a";
      const accentColor = humvee.team === TEAM.BLUE ? "#6bbcff" : "#ff817b";

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
    }

    drawTank(game, tank) {
      const ctx = this.ctx;
      const hullColor = tank.team === TEAM.BLUE ? "#566b60" : "#69584c";
      const darkColor = tank.team === TEAM.BLUE ? "#27312c" : "#342c28";
      const lightColor = tank.team === TEAM.BLUE ? "#728278" : "#867168";
      const turretColor = tank.team === TEAM.BLUE ? "#607469" : "#736154";
      const accentColor = tank.team === TEAM.BLUE ? "#5ca6d6" : "#c96259";

      ctx.save();
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
      ctx.rotate(tank.angle);
      ctx.scale(1.34, 1.34);

      if (!tank.alive) {
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
        ctx.restore();
        this.drawTankLabel(tank);
        return;
      }

      ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
      ctx.beginPath();
      ctx.ellipse(2, 7, 39, 23, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = darkColor;
      roundRect(ctx, -42, -27, 84, 13, 3);
      roundRect(ctx, -42, 14, 84, 13, 3);
      ctx.fill();

      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      roundRect(ctx, -38, -23, 76, 4, 2);
      roundRect(ctx, -38, 19, 76, 4, 2);
      ctx.fill();

      const treadPhase = (tank.trackPhase || 0) % 12;
      ctx.fillStyle = "rgba(218, 225, 210, 0.09)";
      for (const side of [-1, 1]) {
        for (let i = 0; i < 6; i += 1) {
          const stripeX = -31 + ((i * 12 + treadPhase) % 72);
          roundRect(ctx, stripeX - 4, side * 19 - 2, 8, 4, 1.5);
          ctx.fill();
        }
      }

      ctx.fillStyle = hullColor;
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

      ctx.fillStyle = accentColor;
      roundRect(ctx, -30, -13, 5, 26, 1.5);
      ctx.fill();

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
      if (tank.destructionPending) {
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
      }
      ctx.restore();

      ctx.save();
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
      ctx.rotate(tank.turretAngle);
      ctx.scale(1.34, 1.34);
      const recoilOffset = -tank.recoil * 7;
      ctx.fillStyle = darkColor;
      roundRect(ctx, 8 + recoilOffset, -4, 58, 8, 2.5);
      ctx.fill();
      ctx.fillStyle = lightColor;
      roundRect(ctx, 9 + recoilOffset, -2.5, 51, 5, 2);
      ctx.fill();
      ctx.fillStyle = "#1d2420";
      roundRect(ctx, 58 + recoilOffset, -5, 10, 10, 2);
      ctx.fill();

      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      ctx.beginPath();
      ctx.ellipse(1, 4, 25, 17, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = turretColor;
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
      ctx.fillStyle = accentColor;
      roundRect(ctx, 11, -9, 9, 4, 1.5);
      ctx.fill();
      if (tank.destructionPending) {
        ctx.fillStyle = "rgba(8, 7, 6, 0.44)";
        ctx.beginPath();
        ctx.ellipse(0, 0, 24, 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      this.drawTankMachineGun(game, tank, { darkColor, lightColor, accentColor });

      this.drawTankHealth(tank);
      this.drawTankLabel(tank);
    }

    drawTankMachineGun(game, tank, colors) {
      if (!tank.alive) return;
      const ctx = this.ctx;
      const manned = tank.hasMachineGunner?.();
      const active = manned && tank.weaponMode === "mg" && (tank.ammo?.mg || 0) > 0;
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
    }

    drawPlayerTankAim(game) {
      const tank = game.player.inTank;
      if (!tank || !tank.alive) return;
      if (tank.vehicleType === "humvee" || tank.weaponMode === "mg") {
        this.drawPlayerMachineGunAim(game, tank);
        return;
      }

      const ctx = this.ctx;
      const ammo = AMMO[tank.loadedAmmo] || AMMO[tank.reload.ammoId] || AMMO.ap;
      const fireOrder = tank.fireOrder?.ammoId === "he" ? tank.fireOrder : null;
      const aimReady = fireOrder ? Boolean(fireOrder.ready) : (tank.aimError || 0) < 0.12;
      const aimMode = Boolean(game.input.mouse.rightDown);
      const muzzleDistance = tank.radius + 28;
      const muzzleX = tank.x + Math.cos(tank.turretAngle) * muzzleDistance;
      const muzzleY = tank.y + Math.sin(tank.turretAngle) * muzzleDistance;
      const ammoRange = ammo.range || 1600;
      const displayRange = aimMode ? ammoRange : Math.min(ammoRange, 1100);
      const impact = this.traceTankAim(game, muzzleX, muzzleY, tank.turretAngle, displayRange);
      const mouseTargetX = game.input.mouse.worldX;
      const mouseTargetY = game.input.mouse.worldY;
      const heAimSource = fireOrder || { x: mouseTargetX, y: mouseTargetY };
      const heAimSolution = ammo.id === "he" && game.resolveTankGroundAim
        ? game.resolveTankGroundAim(tank, heAimSource.x, heAimSource.y, ammo)
        : null;
      const hePreview = heAimSolution || impact;

      ctx.save();
      ctx.lineCap = "round";
      if (aimMode) {
        ctx.strokeStyle = aimReady ? "rgba(200, 218, 207, 0.68)" : "rgba(237, 244, 239, 0.42)";
        ctx.lineWidth = 1.35;
        ctx.beginPath();
        ctx.arc(impact.x, impact.y, 6.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(impact.x - 13, impact.y);
        ctx.lineTo(impact.x - 6, impact.y);
        ctx.moveTo(impact.x + 6, impact.y);
        ctx.lineTo(impact.x + 13, impact.y);
        ctx.moveTo(impact.x, impact.y - 13);
        ctx.lineTo(impact.x, impact.y - 6);
        ctx.moveTo(impact.x, impact.y + 6);
        ctx.lineTo(impact.x, impact.y + 13);
        ctx.stroke();
      }

      if (ammo.id === "he" && (aimMode || fireOrder)) {
        const lockedColor = fireOrder
          ? aimReady ? "rgba(114, 232, 154, 0.82)" : "rgba(214, 202, 142, 0.72)"
          : "rgba(214, 171, 118, 0.48)";
        const pulse = fireOrder ? 1 + Math.sin(performance.now() * 0.012) * 0.08 : 1;
        ctx.strokeStyle = lockedColor;
        ctx.lineWidth = fireOrder ? 2.6 : 2;
        ctx.beginPath();
        ctx.arc(hePreview.x, hePreview.y, (fireOrder ? 18 : 13) * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(hePreview.x - 24, hePreview.y);
        ctx.lineTo(hePreview.x - 10, hePreview.y);
        ctx.moveTo(hePreview.x + 10, hePreview.y);
        ctx.lineTo(hePreview.x + 24, hePreview.y);
        ctx.moveTo(hePreview.x, hePreview.y - 24);
        ctx.lineTo(hePreview.x, hePreview.y - 10);
        ctx.moveTo(hePreview.x, hePreview.y + 10);
        ctx.lineTo(hePreview.x, hePreview.y + 24);
        ctx.stroke();

        if (fireOrder && !aimReady) {
          ctx.strokeStyle = "rgba(214, 202, 142, 0.28)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(muzzleX, muzzleY);
          ctx.lineTo(hePreview.x, hePreview.y);
          ctx.stroke();
        }
      }

      if (ammo.id === "he" && (aimMode || fireOrder)) {
        ctx.strokeStyle = fireOrder
          ? aimReady ? "rgba(114, 232, 154, 0.42)" : "rgba(255, 209, 102, 0.38)"
          : aimMode ? "rgba(255, 159, 85, 0.5)" : "rgba(255, 159, 85, 0.38)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hePreview.x, hePreview.y, ammo.splash || 98, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawPlayerMachineGunAim(game, tank) {
      if (!game.input.mouse.rightDown) return;
      const ctx = this.ctx;
      const weapon = tank.machineGunWeapon?.() || INFANTRY_WEAPONS.machinegun;
      const muzzle = tank.machineGunMuzzlePoint?.() || {
        x: tank.x + Math.cos(tank.machineGunAngle) * (tank.radius + 22),
        y: tank.y + Math.sin(tank.machineGunAngle) * (tank.radius + 22)
      };
      const range = weapon.range || 760;
      const impact = this.traceTankAim(game, muzzle.x, muzzle.y, tank.machineGunAngle, range);
      const ready = (tank.vehicleType === "humvee" || tank.hasMachineGunner?.()) && tank.machineGunCooldown <= 0 && (tank.ammo?.mg || 0) > 0;

      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = ready ? "rgba(184, 224, 255, 0.68)" : "rgba(255, 146, 116, 0.58)";
      ctx.lineWidth = 1.45;
      ctx.beginPath();
      ctx.arc(impact.x, impact.y, ready ? 7 : 10, 0, Math.PI * 2);
      ctx.moveTo(impact.x - 15, impact.y);
      ctx.lineTo(impact.x - 7, impact.y);
      ctx.moveTo(impact.x + 7, impact.y);
      ctx.lineTo(impact.x + 15, impact.y);
      ctx.moveTo(impact.x, impact.y - 15);
      ctx.lineTo(impact.x, impact.y - 7);
      ctx.moveTo(impact.x, impact.y + 7);
      ctx.lineTo(impact.x, impact.y + 15);
      ctx.stroke();

      ctx.restore();
    }

    traceTankAim(game, startX, startY, angle, range) {
      const step = 16;
      let lastX = startX;
      let lastY = startY;

      for (let distance = step; distance <= range; distance += step) {
        const x = startX + Math.cos(angle) * distance;
        const y = startY + Math.sin(angle) * distance;
        if (x < 0 || y < 0 || x > game.world.width || y > game.world.height) return { x: lastX, y: lastY, blocked: true };

        const blocked = game.world.obstacles.some((obstacle) => lineIntersectsRect(lastX, lastY, x, y, obstacle));
        if (blocked) return { x: lastX, y: lastY, blocked: true };

        lastX = x;
        lastY = y;
      }

      return { x: lastX, y: lastY, blocked: false };
    }

    drawPlayerInfantryAim(game) {
      if (game.player?.controlledDrone) return;
      if (game.isPlayerMachineGunAimMode?.()) {
        this.drawPlayerInfantryMachineGunAim(game);
        return;
      }

      if (!game.isPlayerRpgAimMode?.()) return;

      const player = game.player;
      const weapon = player.getWeapon?.() || INFANTRY_WEAPONS.rpg;
      if (weapon.id !== "rpg") return;

      const aim = game.resolvePlayerRpgAim?.(game.input.mouse.worldX, game.input.mouse.worldY, weapon);
      if (!aim) return;

      const ctx = this.ctx;
      const muzzleDistance = player.radius + 16;
      const angle = Math.atan2(game.input.mouse.worldY - player.y, game.input.mouse.worldX - player.x);
      const muzzleX = player.x + Math.cos(angle) * muzzleDistance;
      const muzzleY = player.y + Math.sin(angle) * muzzleDistance;
      const aimReady = (player.rpgAimTime || 0) >= (player.isProne ? 0.42 : 0.34) && !aim.tooClose;
      const lineColor = aim.tooClose
        ? "rgba(255, 109, 102, 0.66)"
        : aimReady
          ? "rgba(255, 209, 102, 0.76)"
          : "rgba(237, 244, 239, 0.42)";
      const pulse = 1 + Math.sin(performance.now() * 0.014) * 0.08;

      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = aimReady ? 2.6 : 2;
      ctx.setLineDash(aimReady ? [] : [8, 9]);
      ctx.beginPath();
      ctx.moveTo(muzzleX, muzzleY);
      ctx.lineTo(aim.x, aim.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = aim.tooClose ? "rgba(255, 109, 102, 0.34)" : "rgba(255, 209, 102, 0.22)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(player.x, player.y, aim.minRange || weapon.minRange || 150, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, 13 * pulse, 0, Math.PI * 2);
      ctx.moveTo(aim.x - 28, aim.y);
      ctx.lineTo(aim.x - 10, aim.y);
      ctx.moveTo(aim.x + 10, aim.y);
      ctx.lineTo(aim.x + 28, aim.y);
      ctx.moveTo(aim.x, aim.y - 28);
      ctx.lineTo(aim.x, aim.y - 10);
      ctx.moveTo(aim.x, aim.y + 10);
      ctx.lineTo(aim.x, aim.y + 28);
      ctx.stroke();

      ctx.strokeStyle = aimReady ? "rgba(255, 159, 85, 0.36)" : "rgba(255, 159, 85, 0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, weapon.splash || 110, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawPlayerInfantryMachineGunAim(game) {
      const player = game.player;
      const weapon = player.getWeapon?.() || INFANTRY_WEAPONS.machinegun;
      if (weapon.id !== "machinegun" && weapon.id !== "lmg") return;

      const ctx = this.ctx;
      const range = (weapon.range || 620) * 1.08;
      const aimX = game.input.mouse.worldX;
      const aimY = game.input.mouse.worldY;
      const inRange = distXY(player.x, player.y, aimX, aimY) <= range;
      const ammo = weapon.ammoKey ? player.equipmentAmmo?.[weapon.ammoKey] || 0 : 1;
      const ready = player.rifleCooldown <= 0 && ammo > 0;
      const reticleColor = ready
        ? inRange ? "rgba(184, 224, 255, 0.78)" : "rgba(184, 224, 255, 0.34)"
        : "rgba(255, 146, 116, 0.64)";
      const pulse = 1 + Math.sin(performance.now() * 0.016) * 0.05;

      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = reticleColor;
      ctx.lineWidth = inRange ? 1.45 : 1.1;
      ctx.beginPath();
      ctx.arc(aimX, aimY, (ready ? 7 : 10) * pulse, 0, Math.PI * 2);
      ctx.moveTo(aimX - 15, aimY);
      ctx.lineTo(aimX - 7, aimY);
      ctx.moveTo(aimX + 7, aimY);
      ctx.lineTo(aimX + 15, aimY);
      ctx.moveTo(aimX, aimY - 15);
      ctx.lineTo(aimX, aimY - 7);
      ctx.moveTo(aimX, aimY + 7);
      ctx.lineTo(aimX, aimY + 15);
      ctx.stroke();
      ctx.restore();
    }

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
    }

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

    drawInfantry(game, unit, options = {}) {
      const ctx = this.ctx;
      const teamColor = options.color || "#89d27e";
      const style = this.infantryVisualStyle(unit, teamColor);
      const weapon = INFANTRY_WEAPONS[unit.weaponId] || INFANTRY_WEAPONS.rifle;
      const scoped = this.isScopedInfantryPose(game, unit, weapon);
      const prone = Boolean(unit.isProne || (unit.proneTransitionTimer || 0) > 0);
      const moving = Math.abs(unit.speed || 0) > (prone ? 5 : 12);
      const firingState = ["fire", "support-fire", "prone-fire", "recon-snipe", "harass-tank", "rpg-attack"].includes(unit.ai?.state || "");
      const playerHoldingPistol = unit === game.player &&
        weapon.id === "pistol" &&
        !unit.controlledDrone &&
        Boolean(game.input?.mouse?.leftDown || game.input?.keyDown?.("Space"));
      const firing = scoped || playerHoldingPistol || (unit.gunKick || 0) > 0.02 || firingState;
      const pose = prone
        ? moving ? "prone-crawl" : "prone-fire"
        : firing ? "stand-fire" : "stand-move";
      const clock = game.matchTime || (typeof performance !== "undefined" ? performance.now() / 1000 : 0);
      const phase = clock * (prone ? 9.5 : 8.2) + (unit.x + unit.y) * 0.035;
      const controlledDrone = unit === game.player && unit.controlledDrone?.alive ? unit.controlledDrone : null;
      const bodyAngle = controlledDrone ? angleTo(unit.x, unit.y, controlledDrone.x, controlledDrone.y) : unit.angle;
      ctx.save();
      ctx.translate(unit.x, unit.y);
      ctx.rotate(bodyAngle);

      ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
      ctx.beginPath();
      ctx.ellipse(prone ? -2 : 0, prone ? 4 : 5, prone ? 20 : 13, prone ? 7.5 : 8, 0, 0, Math.PI * 2);
      ctx.fill();

      if (prone) this.drawProneInfantryBody(ctx, unit, style, pose, phase);
      else this.drawStandingInfantryBody(ctx, unit, style, pose, phase);

      if (unit.isSquadLeader) this.drawSquadLeaderMarker(ctx, unit, style, prone);

      if (controlledDrone) this.drawInfantryDroneController(ctx, controlledDrone);
      else this.drawInfantryWeapon(ctx, unit, weapon, pose, scoped, phase);
      ctx.restore();

      if (options.showPrompt === false) return;
      const mountTarget = game.findMountablePlayerVehicle?.() || game.findMountablePlayerTank?.();
      if (mountTarget?.alive) {
        ctx.save();
        ctx.globalAlpha = 0.55 + Math.sin(unit.interactPulse * 5) * 0.18;
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(mountTarget.x, mountTarget.y, mountTarget.radius + 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    infantryVisualStyle(unit, teamColor) {
      const red = unit.team === TEAM.RED;
      return {
        cloth: red ? "#51483a" : "#43533f",
        clothDark: red ? "#39332b" : "#2f3b30",
        vest: red ? "#27251f" : "#202920",
        gear: red ? "#1b1a17" : "#171d18",
        helmet: red ? "#28261f" : "#202a22",
        boot: "#111611",
        skin: "rgba(219, 210, 184, 0.34)",
        patch: teamColor,
        patchDim: red ? "rgba(255, 176, 171, 0.62)" : "rgba(182, 220, 255, 0.62)"
      };
    }

    drawSquadLeaderMarker(ctx, unit, style, prone) {
      const radius = unit.radius || 10;
      const x = prone ? radius * 0.38 : radius * -0.03;
      const y = prone ? -radius * 0.47 : -radius * 0.63;
      const width = prone ? radius * 0.58 : radius * 0.52;
      const height = Math.max(2.4, radius * 0.22);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(prone ? -0.08 : 0.12);
      ctx.fillStyle = "rgba(76, 214, 108, 0.95)";
      ctx.strokeStyle = "rgba(8, 36, 16, 0.76)";
      ctx.lineWidth = 0.85;
      roundRect(ctx, -width / 2, -height / 2, width, height, 1.5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(221, 255, 215, 0.42)";
      roundRect(ctx, -width * 0.33, -height * 0.34, width * 0.24, height * 0.68, 1);
      ctx.fill();
      ctx.restore();
    }

    drawStandingInfantryBody(ctx, unit, style, pose, phase) {
      const radius = unit.radius || 10;
      const moving = pose === "stand-move";
      const firing = pose === "stand-fire";
      const sway = moving ? Math.cos(phase * 0.5) * 0.28 : 0;

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.fillStyle = style.gear;
      roundRect(ctx, -radius * 1.16, -radius * 0.46, radius * 0.48, radius * 0.92, 3.5);
      ctx.fill();
      ctx.strokeStyle = "rgba(5, 8, 6, 0.58)";
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.fillStyle = "rgba(237, 244, 239, 0.08)";
      roundRect(ctx, -radius * 1.04, -radius * 0.32, radius * 0.12, radius * 0.64, 2);
      ctx.fill();

      ctx.strokeStyle = style.clothDark;
      ctx.lineWidth = 3.1;
      ctx.beginPath();
      if (firing) {
        ctx.moveTo(-radius * 0.02, -radius * 0.5);
        ctx.lineTo(radius * 0.42, -radius * 0.24);
        ctx.moveTo(-radius * 0.02, radius * 0.5);
        ctx.lineTo(radius * 0.42, radius * 0.22);
      } else {
        ctx.moveTo(-radius * 0.16, -radius * 0.56);
        ctx.lineTo(radius * 0.08, -radius * 0.66);
        ctx.moveTo(-radius * 0.16, radius * 0.56);
        ctx.lineTo(radius * 0.08, radius * 0.66);
      }
      ctx.stroke();

      ctx.fillStyle = style.cloth;
      roundRect(ctx, -radius * 0.7, -radius * 0.58 + sway, radius * 1.02, radius * 1.16, 4.5);
      ctx.fill();
      ctx.strokeStyle = "rgba(5, 8, 6, 0.48)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = style.vest;
      roundRect(ctx, -radius * 0.5, -radius * 0.48 + sway, radius * 0.64, radius * 0.96, 3.5);
      ctx.fill();
      ctx.strokeStyle = "rgba(5, 8, 6, 0.45)";
      ctx.lineWidth = 0.9;
      ctx.stroke();

      ctx.fillStyle = "rgba(237, 244, 239, 0.1)";
      roundRect(ctx, -radius * 0.24, -radius * 0.38 + sway, radius * 0.16, radius * 0.76, 2);
      ctx.fill();

      ctx.fillStyle = style.patchDim;
      roundRect(ctx, -radius * 0.04, -radius * 0.62 + sway, radius * 0.26, radius * 0.11, 1.5);
      ctx.fill();
      ctx.fillStyle = style.patch;
      roundRect(ctx, radius * 0.42, -radius * 0.08, radius * 0.14, radius * 0.16, 1.2);
      ctx.fill();

      ctx.fillStyle = "rgba(11, 15, 12, 0.38)";
      roundRect(ctx, radius * 0.22, -radius * 0.2, radius * 0.18, radius * 0.4, 2);
      ctx.fill();

      ctx.fillStyle = style.helmet;
      ctx.beginPath();
      ctx.ellipse(radius * 0.66, 0, Math.max(4.2, radius * 0.42), Math.max(4, radius * 0.43), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(5, 8, 6, 0.62)";
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.fillStyle = "rgba(10, 14, 11, 0.34)";
      ctx.beginPath();
      ctx.ellipse(radius * 0.78, 0, radius * 0.2, radius * 0.33, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(237, 244, 239, 0.08)";
      roundRect(ctx, radius * 0.5, -radius * 0.05, radius * 0.28, radius * 0.1, 1);
      ctx.fill();
      ctx.fillStyle = style.patch;
      roundRect(ctx, radius * 0.58, -radius * 0.24, radius * 0.15, radius * 0.08, 1);
      ctx.fill();
    }

    drawProneInfantryBody(ctx, unit, style, pose, phase) {
      const radius = unit.radius || 10;
      const crawling = pose === "prone-crawl";
      const wave = crawling ? Math.sin(phase) : 0;
      const counter = crawling ? Math.cos(phase) : 0;
      const leftForward = radius * (0.62 + wave * 0.16);
      const rightForward = radius * (0.62 - wave * 0.16);
      const leftKnee = -radius * (1.18 - counter * 0.1);
      const rightKnee = -radius * (1.18 + counter * 0.1);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.strokeStyle = style.boot;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.76, -radius * 0.24);
      ctx.lineTo(leftKnee, -radius * (0.52 + wave * 0.06));
      ctx.lineTo(-radius * (1.54 - wave * 0.08), -radius * 0.48);
      ctx.moveTo(-radius * 0.76, radius * 0.24);
      ctx.lineTo(rightKnee, radius * (0.52 - wave * 0.06));
      ctx.lineTo(-radius * (1.54 + wave * 0.08), radius * 0.48);
      ctx.stroke();

      ctx.fillStyle = style.gear;
      roundRect(ctx, -radius * 1.3, -radius * 0.38, radius * 0.46, radius * 0.76, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(5, 8, 6, 0.58)";
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.strokeStyle = style.clothDark;
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (crawling) {
        ctx.moveTo(-radius * 0.02, -radius * 0.42);
        ctx.lineTo(leftForward, -radius * (0.66 + counter * 0.06));
        ctx.lineTo(radius * (0.92 + wave * 0.08), -radius * 0.42);
        ctx.moveTo(-radius * 0.06, radius * 0.42);
        ctx.lineTo(rightForward, radius * (0.64 - counter * 0.06));
      } else {
        ctx.moveTo(-radius * 0.02, -radius * 0.42);
        ctx.lineTo(radius * 0.7, -radius * 0.55);
        ctx.lineTo(radius * 0.92, -radius * 0.28);
        ctx.moveTo(-radius * 0.02, radius * 0.42);
        ctx.lineTo(radius * 0.7, radius * 0.55);
        ctx.lineTo(radius * 0.92, radius * 0.28);
      }
      ctx.stroke();

      ctx.fillStyle = style.cloth;
      roundRect(ctx, -radius * 0.92, -radius * 0.43, radius * 1.36, radius * 0.86, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(5, 8, 6, 0.48)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = style.vest;
      roundRect(ctx, -radius * 0.68, -radius * 0.33, radius * 0.82, radius * 0.66, 3.5);
      ctx.fill();
      ctx.strokeStyle = "rgba(5, 8, 6, 0.45)";
      ctx.lineWidth = 0.9;
      ctx.stroke();

      ctx.fillStyle = "rgba(237, 244, 239, 0.09)";
      roundRect(ctx, -radius * 0.38, -radius * 0.28, radius * 0.22, radius * 0.56, 2);
      ctx.fill();

      ctx.fillStyle = style.patchDim;
      roundRect(ctx, -radius * 0.12, -radius * 0.48, radius * 0.28, radius * 0.11, 1.5);
      ctx.fill();

      ctx.fillStyle = style.helmet;
      ctx.beginPath();
      ctx.ellipse(radius * 1.0, 0, Math.max(3.8, radius * 0.36), Math.max(3.5, radius * 0.35), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(5, 8, 6, 0.62)";
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.fillStyle = "rgba(9, 13, 10, 0.38)";
      ctx.beginPath();
      ctx.ellipse(radius * 1.11, 0, radius * 0.16, radius * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = style.patch;
      roundRect(ctx, radius * 0.92, -radius * 0.07, radius * 0.18, radius * 0.13, 1.2);
      ctx.fill();

      ctx.fillStyle = "rgba(237, 244, 239, 0.08)";
      roundRect(ctx, radius * 0.88, -radius * 0.04, radius * 0.24, radius * 0.08, 1);
      ctx.fill();
    }

    isScopedInfantryPose(game, unit, weapon) {
      if (unit === game.player && (weapon.id === "machinegun" || weapon.id === "lmg")) {
        return Boolean(game.isPlayerMachineGunAimMode?.());
      }
      if (weapon.id !== "sniper") return false;
      if (unit === game.player) return Boolean(game.isPlayerScoutAimMode?.());
      const state = unit.ai?.state || "";
      return unit.classId === "scout" &&
        (state === "recon-snipe" || state === "recon-watch" || state === "fire") &&
        Math.abs(unit.speed || 0) < 14;
    }

    drawInfantryWeapon(ctx, unit, weapon, pose = "stand-move", scoped = false, phase = 0) {
      const width = weapon.visualWidth || 5;
      const length = weapon.visualLength || 16;
      const rpg = weapon.id === "rpg";
      const machineGun = weapon.id === "machinegun" || weapon.id === "lmg";
      const crawling = pose === "prone-crawl";
      const proneFire = pose === "prone-fire";
      const standingFire = pose === "stand-fire";
      const aimed = scoped || proneFire || standingFire || (rpg && unit.rpgAim);
      let sideOffset = rpg ? 7 : 8.4;
      let forwardOffset = -5.3;
      let weaponAngle = -0.52;

      if (crawling) {
        sideOffset = rpg ? 8.5 : 7.2 + Math.sin(phase) * 0.65;
        forwardOffset = rpg ? -1.5 : -2;
        weaponAngle = -0.36 + Math.cos(phase * 0.7) * 0.04;
      } else if (proneFire || scoped || (rpg && unit.rpgAim)) {
        sideOffset = 0.35;
        forwardOffset = scoped ? 4 : 3.2;
        weaponAngle = 0;
      } else if (standingFire) {
        sideOffset = rpg ? 3.8 : 3.1;
        forwardOffset = 2.3;
        weaponAngle = -0.04;
      }

      const stockLength = Math.max(4, length * 0.24);
      const displayLength = aimed || rpg ? length : length * 0.68;
      const recoil = (unit.gunKick || 0) * (machineGun ? 3.4 : 1.8) * (aimed ? 1 : 0.7);
      const bodyX = forwardOffset - recoil;

      ctx.save();
      ctx.translate(0, sideOffset);
      ctx.rotate(weaponAngle);

      ctx.fillStyle = "rgba(19, 24, 19, 0.72)";
      roundRect(ctx, bodyX - stockLength, -Math.max(2, width * 0.42), stockLength + 6, Math.max(4, width * 0.85), 2);
      ctx.fill();

      ctx.fillStyle = rpg ? "#2f3b2d" : "#243222";
      roundRect(ctx, bodyX, -width / 2, displayLength, width, 2);
      ctx.fill();

      ctx.fillStyle = "rgba(237, 244, 239, 0.2)";
      roundRect(ctx, bodyX + displayLength - 1, -Math.max(1, width * 0.28), 5, Math.max(2, width * 0.56), 1);
      ctx.fill();

      if (rpg) {
        ctx.fillStyle = "rgba(255, 180, 92, 0.68)";
        ctx.beginPath();
        ctx.moveTo(bodyX + displayLength + 8, 0);
        ctx.lineTo(bodyX + displayLength - 2, -width * 0.72);
        ctx.lineTo(bodyX + displayLength - 2, width * 0.72);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "rgba(237, 244, 239, 0.18)";
        roundRect(ctx, bodyX + displayLength * 0.36, -width / 2 - 3, 10, 2, 1);
        ctx.fill();
      }

      if (machineGun) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        roundRect(ctx, bodyX + 9, width * 0.42, 8, 3, 1);
        ctx.fill();
        ctx.fillStyle = "rgba(15, 19, 16, 0.54)";
        roundRect(ctx, bodyX + displayLength * 0.42, -width * 0.88, 9, 3, 1);
        ctx.fill();
      }

      if (unit.weaponId === "sniper") {
        ctx.fillStyle = "rgba(120, 214, 140, 0.45)";
        roundRect(ctx, bodyX + 7, -width / 2 - 3, 8, 2, 1);
        ctx.fill();
      }

      ctx.restore();
    }

    drawInfantryDroneController(ctx, drone) {
      const weakSignal = Boolean(drone?.isSignalWeak?.());
      const screenColor = weakSignal ? "rgba(255, 209, 102, 0.72)" : "rgba(107, 188, 255, 0.68)";

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(28, 34, 30, 0.88)";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-2, -6);
      ctx.lineTo(9, -8);
      ctx.moveTo(-2, 6);
      ctx.lineTo(9, 8);
      ctx.stroke();

      ctx.fillStyle = "rgba(15, 19, 18, 0.9)";
      roundRect(ctx, 7, -9, 15, 18, 2.5);
      ctx.fill();
      ctx.strokeStyle = "rgba(237, 244, 239, 0.2)";
      ctx.lineWidth = 1;
      roundRect(ctx, 7, -9, 15, 18, 2.5);
      ctx.stroke();

      ctx.fillStyle = screenColor;
      roundRect(ctx, 9.5, -6.5, 10, 9, 1.5);
      ctx.fill();
      ctx.fillStyle = "rgba(237, 244, 239, 0.28)";
      roundRect(ctx, 10, 4.5, 9, 2, 1);
      ctx.fill();

      ctx.strokeStyle = weakSignal ? "rgba(255, 209, 102, 0.72)" : "rgba(142, 216, 255, 0.62)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(20, -7);
      ctx.lineTo(26, -12);
      ctx.moveTo(20, 7);
      ctx.lineTo(26, 12);
      ctx.stroke();
      ctx.restore();
    }

    drawCrewMember(game, crew) {
      if (!crew.alive) {
        if (!crew.inTank) this.drawInfantryCorpse(crew);
        return;
      }
      if (crew.inTank) return;
      const color = crew.team === TEAM.BLUE ? "#8ed8ff" : "#ff938c";
      this.drawInfantry(game, crew, { color, showPrompt: false });
    }

    drawInfantryUnit(game, unit) {
      if (unit.inVehicle) return;
      if (!unit.alive) {
        this.drawInfantryCorpse(unit);
        return;
      }
      const color = unit.team === TEAM.BLUE ? "#b6dcff" : "#ffb0ab";
      this.drawInfantry(game, unit, { color, showPrompt: false });
      this.drawInfantryHealth(unit);
      this.drawInfantrySuppression(unit);
      this.drawInfantryThought(unit);
    }

    drawReconDrone(game, drone) {
      if (!drone.alive) return;

      const ctx = this.ctx;
      const controlled = game.player.controlledDrone === drone;
      const attackDrone = drone.droneRole === "attack";
      const signalStrength = drone.signalStrength?.() ?? 1;
      const weakSignal = Boolean(drone.isSignalWeak?.());
      const criticalSignal = signalStrength <= 0.08;
      const pulse = 0.5 + Math.sin((game.matchTime || 0) * 7 + drone.rotorPhase) * 0.5;
      const bodyColor = attackDrone ? "#7b6040" : "#52665d";
      const bodyTop = attackDrone ? "#9a7045" : "#667c72";
      const armColor = attackDrone ? "#2f3128" : "#26342f";
      const signalColor = weakSignal
        ? criticalSignal ? "rgba(226, 93, 74, 0.88)" : "rgba(255, 209, 102, 0.8)"
        : attackDrone ? "rgba(203, 112, 62, 0.8)" : "rgba(103, 155, 154, 0.72)";

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

      if (!attackDrone && drone.roofLocked && drone.roofLockPoint) {
        const roofActive = Boolean(game.droneHasRoofCover?.(drone));
        const lockRadius = 18 + pulse * 3;
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
      }

      if (attackDrone) {
        const lock = drone.lockPosition?.();
        const lockTarget = lock?.target || drone.lockTarget;
        const lockRadius = lockTarget?.radius || 18;
        if (lock) {
          ctx.globalAlpha = drone.diveActive ? 0.82 : 0.62;
          ctx.strokeStyle = drone.diveActive ? "rgba(255, 123, 72, 0.92)" : "rgba(255, 209, 102, 0.82)";
          ctx.lineWidth = drone.diveActive ? 2.2 : 1.5;
          ctx.setLineDash(drone.diveActive ? [] : [6, 7]);
          ctx.beginPath();
          ctx.moveTo(drone.x, drone.y);
          ctx.lineTo(lock.x, lock.y);
          ctx.stroke();
          ctx.setLineDash([]);

          const markerRadius = lockRadius + (drone.diveActive ? 26 : 18) + pulse * 4;
          ctx.beginPath();
          ctx.arc(lock.x, lock.y, markerRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(lock.x - markerRadius - 8, lock.y);
          ctx.lineTo(lock.x - markerRadius + 3, lock.y);
          ctx.moveTo(lock.x + markerRadius - 3, lock.y);
          ctx.lineTo(lock.x + markerRadius + 8, lock.y);
          ctx.moveTo(lock.x, lock.y - markerRadius - 8);
          ctx.lineTo(lock.x, lock.y - markerRadius + 3);
          ctx.moveTo(lock.x, lock.y + markerRadius - 3);
          ctx.lineTo(lock.x, lock.y + markerRadius + 8);
          ctx.stroke();

          ctx.font = "800 10px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = drone.diveActive ? "rgba(255, 220, 184, 0.96)" : "rgba(255, 235, 172, 0.94)";
          ctx.fillText(drone.diveActive ? "STRIKE" : "TARGET", lock.x, lock.y - markerRadius - 13);
        }

        if (controlled && !lock) {
          const lockOptions = game.suicideDroneLockOptions?.(drone) || [];
          for (const item of lockOptions.slice(0, 5)) {
            const target = item.target;
            if (!target) continue;
            const radius = (target.radius || 10) + (item.lockable ? 18 : 12) + pulse * (item.lockable ? 3 : 1);
            ctx.globalAlpha = item.lockable ? 0.82 : 0.36;
            ctx.strokeStyle = item.lockable ? "rgba(255, 209, 102, 0.86)" : "rgba(255, 190, 104, 0.42)";
            ctx.lineWidth = item.lockable ? 1.7 : 1;
            ctx.beginPath();
            ctx.arc(target.x, target.y, radius, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        const lockRatio = drone.lockRatio?.() || 0;
        if (controlled && lockRatio > 0.01) {
          const attemptTarget = drone.lockAttemptTarget;
          const attemptPoint = attemptTarget
            ? { x: attemptTarget.x, y: attemptTarget.y, radius: attemptTarget.radius || 12 }
            : drone.lockAttemptPoint || { x: game.input.mouse.worldX, y: game.input.mouse.worldY, radius: 12 };
          const radius = (attemptPoint.radius || 12) + 28 + pulse * 4;
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
        }

        if (controlled && drone.lockFailureTimer > 0 && drone.lockFailureReason) {
          const alpha = clamp(drone.lockFailureTimer / 0.9, 0, 1);
          ctx.globalAlpha = 0.42 + alpha * 0.44;
          ctx.fillStyle = "rgba(245, 95, 82, 0.95)";
          ctx.font = "800 10px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`FAIL: ${drone.lockFailureReason}`, drone.x, drone.y - 52);
        }

        if (drone.detectedTimer > 0) {
          const alpha = clamp(drone.detectedTimer / 1.25, 0, 1);
          const warnRadius = drone.radius + 20 + pulse * 7;
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
        }
      }

      const designation = game.droneDesignatedContact?.();
      const designatedHere = designation?.drone === drone ? designation : null;
      const showDesignationOptions = !attackDrone && game.reconDroneDesignationUiDrone?.() === drone;
      const designationOptions = showDesignationOptions
        ? game.reconDroneDesignationOptions?.(drone) || []
        : [];
      if (designatedHere?.target) {
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
      }
      if (designationOptions.length > 0) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "10px Rajdhani, sans-serif";

        for (const item of designationOptions) {
          const target = item.target;
          if (!target || target === designatedHere?.target) continue;

          const hot = Boolean(item.lockable);
          const radius = target.radius || 10;
          const markerRadius = radius + (hot ? 16 : 12) + pulse * (hot ? 4 : 1.5);
          const label = hot ? controlled ? "LOCK" : "MARK" : "TARGET";
          const labelWidth = hot ? controlled ? 42 : 46 : 50;
          const labelHeight = 17;
          const labelX = item.markerX;
          const labelY = item.markerY;

          ctx.globalAlpha = hot ? 0.92 : 0.52;
          ctx.strokeStyle = hot ? "rgba(255, 209, 102, 0.94)" : "rgba(143, 222, 207, 0.52)";
          ctx.lineWidth = hot ? 1.7 : 1.1;
          ctx.beginPath();
          ctx.arc(target.x, target.y, markerRadius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(target.x - markerRadius - 7, target.y);
          ctx.lineTo(target.x - markerRadius + 1, target.y);
          ctx.moveTo(target.x + markerRadius - 1, target.y);
          ctx.lineTo(target.x + markerRadius + 7, target.y);
          ctx.moveTo(target.x, target.y - markerRadius - 7);
          ctx.lineTo(target.x, target.y - markerRadius + 1);
          ctx.moveTo(target.x, target.y + markerRadius - 1);
          ctx.lineTo(target.x, target.y + markerRadius + 7);
          ctx.stroke();

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
        }
      }
      ctx.restore();

      ctx.save();
      ctx.translate(drone.x, drone.y);
      ctx.rotate(drone.angle || 0);

      if (attackDrone && drone.boosting) {
        ctx.save();
        ctx.globalAlpha = drone.diveActive ? 0.68 : 0.46;
        ctx.strokeStyle = drone.diveActive ? "rgba(255, 135, 78, 0.78)" : "rgba(255, 209, 102, 0.68)";
        ctx.lineWidth = drone.diveActive ? 3.2 : 2.4;
        ctx.lineCap = "round";
        for (const offset of [-6, 0, 6]) {
          ctx.beginPath();
          ctx.moveTo(-10, offset * 0.55);
          ctx.lineTo(-36 - pulse * 10, offset);
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
      ctx.beginPath();
      ctx.ellipse(2, 6, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = armColor;
      ctx.lineWidth = 3.2;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-7, side * 4);
        ctx.lineTo(-18, side * 12);
        ctx.moveTo(7, side * 4);
        ctx.lineTo(18, side * 12);
        ctx.stroke();
      }

      ctx.strokeStyle = attackDrone ? "rgba(32, 34, 28, 0.86)" : "rgba(28, 39, 35, 0.86)";
      ctx.lineWidth = 1.5;
      const rotors = [
        [-20, -13],
        [20, -13],
        [-20, 13],
        [20, 13]
      ];
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

      ctx.fillStyle = bodyColor;
      roundRect(ctx, -9, -5.5, 18, 11, 3);
      ctx.fill();

      ctx.fillStyle = bodyTop;
      roundRect(ctx, -5.5, -3.2, 11, 6.4, 2);
      ctx.fill();

      ctx.fillStyle = "rgba(15, 20, 18, 0.82)";
      roundRect(ctx, 4, -2.8, 5.5, 5.6, 1.5);
      ctx.fill();

      if (attackDrone) {
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

      ctx.fillStyle = signalColor;
      ctx.beginPath();
      ctx.arc(-5.8, -5.9, 1.6, 0, Math.PI * 2);
      ctx.arc(5.8, -5.9, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(drone.x, drone.y - 32);
      const width = 38;
      const pct = drone.batteryLimit
        ? clamp(drone.battery / Math.max(1, drone.maxBattery), 0, 1)
        : clamp(drone.hp / Math.max(1, drone.maxHp), 0, 1);
      ctx.fillStyle = "rgba(9, 15, 13, 0.64)";
      roundRect(ctx, -width / 2, -3, width, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = pct > 0.28
        ? attackDrone ? "rgba(188, 103, 60, 0.86)" : "rgba(93, 149, 146, 0.86)"
        : "rgba(220, 112, 98, 0.82)";
      roundRect(ctx, -width / 2, -3, width * pct, 5, 2.5);
      ctx.fill();
      if (controlled && weakSignal) {
        ctx.fillStyle = criticalSignal ? "rgba(255, 146, 116, 0.9)" : "rgba(255, 209, 102, 0.88)";
        ctx.font = "800 8px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("SIG", 0, -10);
      }
      ctx.restore();
    }

    drawInfantryCorpse(unit) {
      const ctx = this.ctx;
      const now = typeof performance !== "undefined" ? performance.now() / 1000 : 0;
      const age = unit.deathTime ? Math.max(0, now - unit.deathTime) : 1;
      const fall = clamp(age / 0.3, 0, 1);
      const poseAngle = unit.deathPoseAngle || unit.angle + Math.PI / 2;
      const angle = lerp(unit.angle || 0, poseAngle, fall);
      const radius = unit.radius || 10;
      const color = unit.team === TEAM.BLUE ? "#48697c" : "#76504e";
      ctx.save();
      ctx.translate(unit.x, unit.y);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.84 - fall * 0.2;
      ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
      ctx.beginPath();
      ctx.ellipse(-1, 4, 17, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      roundRect(ctx, -radius * 1.08, -radius * 0.45, radius * 2, radius * 0.9, 5);
      ctx.fill();

      ctx.fillStyle = "rgba(15, 19, 16, 0.46)";
      roundRect(ctx, -radius * 1.38, -radius * 0.24, radius * 0.42, radius * 0.48, 2);
      ctx.fill();

      ctx.fillStyle = "#9aa496";
      ctx.beginPath();
      ctx.arc(radius * 1.03, 0, Math.max(3.3, radius * 0.32), 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#252b25";
      roundRect(ctx, radius * 0.04, -2, radius * 1.25, 4, 2);
      ctx.fill();
      ctx.restore();
    }

    drawInfantryHealth(unit) {
      if (unit.hp >= unit.maxHp) return;

      const ctx = this.ctx;
      const width = 28;
      const pct = unit.maxHp > 0 ? clamp(unit.hp / unit.maxHp, 0, 1) : 0;
      ctx.save();
      ctx.translate(unit.x, unit.y - 22);
      ctx.fillStyle = "rgba(9, 15, 13, 0.7)";
      roundRect(ctx, -width / 2, -3, width, 5, 2);
      ctx.fill();
      ctx.fillStyle = unit.team === TEAM.BLUE ? "#8ed8ff" : "#ff938c";
      roundRect(ctx, -width / 2, -3, width * pct, 5, 2);
      ctx.fill();
      ctx.restore();
    }

    drawInfantrySuppression(unit) {
      if (!unit.suppression || unit.suppression < 2) return;

      const ctx = this.ctx;
      const pct = clamp(unit.suppression / 100, 0, 1);
      ctx.save();
      ctx.translate(unit.x, unit.y);
      ctx.globalAlpha = 0.18 + pct * 0.42;
      ctx.strokeStyle = unit.suppressed ? "#ffd166" : "rgba(255, 209, 102, 0.72)";
      ctx.lineWidth = unit.suppressed ? 2 : 1.4;
      if (unit.suppressed) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, 15 + pct * 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    drawInfantryThought(unit) {
      const thought = unit.ai?.thoughtText || "";
      const timer = unit.ai?.thoughtTimer || 0;
      if (!thought || timer <= 0) return;

      const ctx = this.ctx;
      const alpha = clamp(timer / 0.35, 0, 1);
      const y = unit.y - (unit.isProne ? 38 : 46);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "800 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const width = Math.min(122, Math.max(42, ctx.measureText(thought).width + 15));
      const height = 17;
      const x = unit.x - width / 2;
      const bg = unit.team === TEAM.BLUE ? "rgba(9, 24, 28, 0.78)" : "rgba(31, 14, 14, 0.78)";
      const stroke = unit.team === TEAM.BLUE ? "rgba(182, 220, 255, 0.68)" : "rgba(255, 176, 171, 0.68)";

      ctx.fillStyle = bg;
      roundRect(ctx, x, y - height / 2, width, height, 5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(unit.x - 4, y + height / 2 - 1);
      ctx.lineTo(unit.x + 4, y + height / 2 - 1);
      ctx.lineTo(unit.x, y + height / 2 + 5);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      roundRect(ctx, x, y - height / 2, width, height, 5);
      ctx.stroke();
      ctx.fillStyle = "#edf4ef";
      ctx.fillText(thought, unit.x, y + 0.5);
      ctx.restore();
    }

    drawProjectiles(game) {
      const ctx = this.ctx;
      for (const shell of game.projectiles) {
        if (shell.ammo.id === "rpg") {
          this.drawRocketProjectile(shell);
          continue;
        }

        ctx.save();
        ctx.strokeStyle = shell.ammo.color;
        ctx.lineWidth = shell.radius;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(shell.previousX, shell.previousY);
        ctx.lineTo(shell.x, shell.y);
        ctx.stroke();
        ctx.fillStyle = shell.ammo.color;
        ctx.beginPath();
        ctx.arc(shell.x, shell.y, shell.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    drawRocketProjectile(shell) {
      const ctx = this.ctx;
      const angle = Math.atan2(shell.vy, shell.vx);
      const length = Math.max(24, shell.ammo.visualLength || 32);
      const width = Math.max(7, shell.radius || 8);
      const tailX = shell.x - Math.cos(angle) * length * 0.88;
      const tailY = shell.y - Math.sin(angle) * length * 0.88;

      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(255, 180, 92, 0.38)";
      ctx.lineWidth = width * 2.1;
      ctx.beginPath();
      ctx.moveTo(shell.previousX, shell.previousY);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      ctx.translate(shell.x, shell.y);
      ctx.rotate(angle);
      ctx.fillStyle = "rgba(23, 28, 21, 0.9)";
      roundRect(ctx, -length * 0.72, -width * 0.5, length, width, 3);
      ctx.fill();

      ctx.fillStyle = "#ffb45c";
      ctx.beginPath();
      ctx.moveTo(length * 0.38, 0);
      ctx.lineTo(length * 0.05, -width * 0.58);
      ctx.lineTo(length * 0.05, width * 0.58);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(255, 226, 160, 0.72)";
      roundRect(ctx, -length * 0.82, -width * 0.32, 7, width * 0.64, 2);
      ctx.fill();
      ctx.restore();
    }

    drawTracers(game) {
      const ctx = this.ctx;
      for (const tracer of game.effects.tracers || []) {
        const alpha = clamp(tracer.life / tracer.maxLife, 0, 1);
        const width = Math.min(tracer.width || 1.2, 1.2);
        ctx.save();
        ctx.globalAlpha = alpha * 0.42;
        ctx.strokeStyle = tracer.color;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tracer.x1, tracer.y1);
        ctx.lineTo(tracer.x2, tracer.y2);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawExplosions(game) {
      const ctx = this.ctx;
      for (const explosion of game.effects.explosions) {
        const alpha = clamp(explosion.life / explosion.maxLife, 0, 1);
        const gradient = ctx.createRadialGradient(explosion.x, explosion.y, 0, explosion.x, explosion.y, explosion.radius);
        if (explosion.smoke) {
          gradient.addColorStop(0, `rgba(45, 41, 35, ${0.42 * alpha})`);
          gradient.addColorStop(0.5, explosion.color.replace(/[\d.]+\)$/u, `${0.28 * alpha})`));
          gradient.addColorStop(1, "rgba(42, 38, 31, 0)");
        } else {
          gradient.addColorStop(0, `rgba(255, 246, 198, ${0.9 * alpha})`);
          gradient.addColorStop(0.2, explosion.color.replace(/[\d.]+\)$/u, `${0.78 * alpha})`));
          gradient.addColorStop(0.58, explosion.color.replace(/[\d.]+\)$/u, `${0.28 * alpha})`));
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        }
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawBlastRings(game) {
      const ctx = this.ctx;
      ctx.save();
      ctx.lineCap = "round";
      for (const ring of game.effects.blastRings || []) {
        const alpha = clamp(ring.life / ring.maxLife, 0, 1);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = ring.color || "rgba(255, 238, 178, 0.65)";
        ctx.lineWidth = (ring.width || 5) * alpha;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawBlastSparks(game) {
      const ctx = this.ctx;
      ctx.save();
      ctx.lineCap = "round";
      for (const spark of game.effects.blastSparks || []) {
        const alpha = clamp(spark.life / spark.maxLife, 0, 1);
        const speedAngle = Math.atan2(spark.vy, spark.vx);
        const tailX = spark.x - Math.cos(speedAngle) * spark.length;
        const tailY = spark.y - Math.sin(speedAngle) * spark.length;
        ctx.globalAlpha = alpha * (spark.alpha ?? 1);
        ctx.strokeStyle = spark.color || "rgba(255, 172, 92, 0.86)";
        ctx.lineWidth = (spark.width || 2.2) * alpha + 0.35;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(spark.x, spark.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawSmoke(game) {
      const ctx = this.ctx;
      for (const cloud of game.effects.smokeClouds) {
        const alpha = clamp(cloud.life / cloud.maxLife, 0, 1);
        const gradient = ctx.createRadialGradient(cloud.x, cloud.y, cloud.radius * 0.1, cloud.x, cloud.y, cloud.radius);
        gradient.addColorStop(0, `rgba(223, 231, 233, ${0.36 * alpha})`);
        gradient.addColorStop(0.55, `rgba(185, 196, 199, ${0.24 * alpha})`);
        gradient.addColorStop(1, "rgba(185, 196, 199, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawMinimap(game) {
      const ctx = this.ctx;
      const camera = this.camera;
      const mobileLayout = Boolean(game.settings?.mobileControls && camera.width > camera.height && !game.deploymentOpen);
      const mapW = mobileLayout ? 150 : 178;
      const mapH = mobileLayout ? 94 : 120;
      const x = mobileLayout ? 14 : camera.width - mapW - 16;
      const y = mobileLayout ? 14 : camera.height - mapH - 18;
      const sx = mapW / game.world.width;
      const sy = mapH / game.world.height;

      ctx.save();
      ctx.fillStyle = "rgba(9, 15, 13, 0.72)";
      ctx.strokeStyle = "rgba(237, 244, 239, 0.18)";
      roundRect(ctx, x, y, mapW, mapH, 7);
      ctx.fill();
      ctx.stroke();
      roundRect(ctx, x, y, mapW, mapH, 7);
      ctx.clip();

      for (const road of game.world.roads) {
        ctx.beginPath();
        ctx.moveTo(x + road[0].x * sx, y + road[0].y * sy);
        for (let i = 1; i < road.length; i += 1) ctx.lineTo(x + road[i].x * sx, y + road[i].y * sy);
        ctx.strokeStyle = "rgba(158, 151, 118, 0.45)";
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      for (const point of game.capturePoints) {
        ctx.fillStyle = TEAM_COLORS[point.owner];
        ctx.beginPath();
        ctx.arc(x + point.x * sx, y + point.y * sy, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const tank of game.tanks) {
        if (!tank.alive) continue;
        ctx.fillStyle = TEAM_COLORS[tank.team];
        ctx.fillRect(x + tank.x * sx - 2.5, y + tank.y * sy - 2.5, 5, 5);
      }

      for (const humvee of game.humvees || []) {
        if (!humvee.alive) continue;
        ctx.fillStyle = TEAM_COLORS[humvee.team];
        ctx.fillRect(x + humvee.x * sx - 2, y + humvee.y * sy - 2, 4, 4);
      }

      for (const crew of game.crews || []) {
        if (!crew.alive || crew.inTank) continue;
        ctx.fillStyle = TEAM_COLORS[crew.team] || "#edf4ef";
        ctx.beginPath();
        ctx.arc(x + crew.x * sx, y + crew.y * sy, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const unit of game.infantry || []) {
        if (!unit.alive || unit.inVehicle) continue;
        ctx.fillStyle = TEAM_COLORS[unit.team] || "#edf4ef";
        ctx.fillRect(x + unit.x * sx - 1.8, y + unit.y * sy - 1.8, 3.6, 3.6);
      }

      for (const drone of game.drones || []) {
        if (!drone.alive) continue;
        const attackDrone = drone.droneRole === "attack";
        ctx.fillStyle = attackDrone
          ? "#ff9148"
          : game.player.controlledDrone === drone ? "#8ed8ff" : "rgba(142, 216, 255, 0.82)";
        ctx.beginPath();
        ctx.arc(x + drone.x * sx, y + drone.y * sy, attackDrone ? 3.2 : 2.8, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!game.player.inTank && game.player.hp > 0) {
        ctx.fillStyle = "#89d27e";
        ctx.beginPath();
        ctx.arc(x + game.player.x * sx, y + game.player.y * sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = "rgba(255,255,255,0.42)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        x + camera.x * sx,
        y + camera.y * sy,
        (camera.viewWidth || camera.width) * sx,
        (camera.viewHeight || camera.height) * sy
      );
      ctx.restore();
    }

    drawDebugOverlay(game) {
      if (!game.debug?.ai) return;

      const ctx = this.ctx;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (game.debug.navGraph) this.drawNavGraph(game);

      for (const tank of game.tanks) {
        if (!tank.ai || !tank.alive || !tank.isOperational()) continue;
        this.drawAiTankDebug(game, tank);
      }

      for (const humvee of game.humvees || []) {
        if (!humvee.ai || !humvee.alive || !humvee.isOperational()) continue;
        this.drawAiTankDebug(game, humvee);
      }

      for (const unit of game.infantry || []) {
        if (!unit.ai || !unit.alive || unit.inVehicle) continue;
        this.drawInfantryDebug(game, unit);
      }

      ctx.restore();
    }

    drawInfantryDebug(game, unit) {
      const ctx = this.ctx;
      const debug = unit.ai.debug || {};
      const color = unit.team === TEAM.BLUE ? "#b6dcff" : "#ffb0ab";
      const path = debug.path || [];
      const startIndex = Math.min(debug.pathIndex || 0, path.length);

      ctx.save();
      if (debug.moveTarget) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 7]);
        ctx.beginPath();
        ctx.moveTo(unit.x, unit.y);
        ctx.lineTo(debug.moveTarget.x, debug.moveTarget.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (debug.target) {
        ctx.strokeStyle = "rgba(255, 242, 168, 0.82)";
        ctx.globalAlpha = 0.72;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(unit.x, unit.y);
        ctx.lineTo(debug.target.x, debug.target.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (debug.coverTarget) {
        ctx.strokeStyle = "rgba(160, 220, 172, 0.82)";
        ctx.globalAlpha = 0.58;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(debug.coverTarget.x, debug.coverTarget.y, 9, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (path.length > startIndex) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.38;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(unit.x, unit.y);
        for (let i = startIndex; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke();
      }

      const stateLabels = {
        advance: "전진",
        secure: "확보",
        idle: "대기",
        fire: "사격",
        grenade: "수류탄",
        cover: "엄폐",
        suppressed: "제압",
        "rpg-attack": "RPG",
        "rpg-position": "RPG각",
        "report-move": "보고위치",
        "harass-tank": "차량견제",
        "evade-tank": "차량회피",
        "repair-tank": "수리",
        "avoid-fire-lane": "사선회피",
        "support-fire": "엄호",
        "support-position": "엄호위치",
        "prone-fire": "누워쏴",
        "pre-assault": "공격준비",
        "pre-assault-position": "준비위치",
        "hold-wall": "벽방어",
        "hold-wall-position": "방어위치",
        "squad-fallback": "분대후퇴",
        "squad-regroup": "재집결",
        "rally-tank": "전차합류",
        "board-transport": "탑승",
        "reboard-transport": "재탑승",
        "mounted-transport": "차량탑승",
        "recon-move": "정찰이동",
        "recon-watch": "감시",
        "recon-snipe": "저격",
        "recon-evade": "정찰후퇴"
      };
      const tacticalLabels = {
        advance: "",
        hold: "방어",
        "support-fire": "엄호",
        "pre-assault": "공격준비",
        "hold-wall": "벽방어",
        fallback: "후퇴",
        regroup: "재집결",
        "rally-with-tank": "전차합류"
      };
      const pressure = debug.suppression > 5 ? ` S${Math.round(debug.suppression)}` : "";
      const weapon = INFANTRY_WEAPONS[debug.weaponId] || INFANTRY_WEAPONS[unit.weaponId] || INFANTRY_WEAPONS.rifle;
      const roleLabels = {
        assault: "돌격",
        support: "지원",
        security: "경계",
        scout: "정찰"
      };
      const role = debug.squadRole ? ` ${roleLabels[debug.squadRole] || debug.squadRole}` : "";
      const tactical = tacticalLabels[debug.tacticalMode] ? ` ${tacticalLabels[debug.tacticalMode]}` : "";
      const tacticalTimer = debug.tacticalMode === "pre-assault" && debug.tacticalTimerRemaining > 0
        ? ` ${Math.ceil(debug.tacticalTimerRemaining)}s`
        : "";
      const prone = debug.isProne ? " 엎드림" : "";
      const request = debug.supportRequest ? ` !${debug.supportRequest}` : "";
      const transport = debug.transportVehicleId ? ` @${debug.transportVehicleId}` : "";
      const squad = debug.squadId ? `${debug.squadId}/` : "";
      const coverQuality = debug.coverQuality > 0 ? ` Q${Math.round(debug.coverQuality)}` : "";
      const reports = debug.scoutReports > 0 ? ` R${debug.scoutReports}` : "";
      const grenades = debug.grenadeAmmo > 0 ? ` G${debug.grenadeAmmo}` : "";
      const repairs = debug.repairAmmo > 0 ? ` K${debug.repairAmmo}` : "";
      const label = `${squad}${unit.callSign} ${weapon.shortName}${role}${tactical}${tacticalTimer}${prone} ${stateLabels[debug.state] || debug.state || unit.ai.state}${debug.goal ? `>${debug.goal}` : ""}${pressure}${coverQuality}${reports}${grenades}${repairs}${request}${transport}`;
      const labelWidth = Math.max(72, label.length * 7.2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(9, 15, 13, 0.78)";
      ctx.strokeStyle = color;
      roundRect(ctx, unit.x - labelWidth / 2, unit.y - 38, labelWidth, 18, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#edf4ef";
      ctx.font = "800 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, unit.x, unit.y - 29);
      ctx.restore();
    }

    drawNavGraph(game) {
      const ctx = this.ctx;
      const graph = game.navGraph;
      if (!graph) return;

      ctx.save();
      for (const edge of graph.edges) {
        const from = graph.nodeById.get(edge[0]);
        const to = graph.nodeById.get(edge[1]);
        if (!from || !to) continue;
        const generated = from.generated || to.generated;
        ctx.globalAlpha = generated ? 0.18 : 0.48;
        ctx.strokeStyle = generated ? "rgba(158, 206, 180, 0.55)" : "rgba(255, 209, 102, 0.62)";
        ctx.lineWidth = generated ? 1 : 2;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }

      for (const node of graph.nodes) {
        ctx.globalAlpha = node.generated ? 0.42 : 0.9;
        ctx.fillStyle = node.generated ? "rgba(158, 206, 180, 0.72)" : "rgba(255, 209, 102, 0.92)";
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.generated ? 3 : 5, 0, Math.PI * 2);
        ctx.fill();

        if (node.generated) continue;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "rgba(9, 15, 13, 0.74)";
        roundRect(ctx, node.x + 7, node.y - 9, Math.max(28, node.id.length * 5.6), 16, 3);
        ctx.fill();
        ctx.fillStyle = "#fff3bc";
        ctx.font = "700 9px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(node.id, node.x + 11, node.y);
      }
      ctx.restore();
    }

    drawAiTankDebug(game, tank) {
      const ctx = this.ctx;
      const ai = tank.ai;
      const debug = ai.debug || {};
      const color = tank.team === TEAM.BLUE ? "#6bbcff" : "#ff817b";
      const path = debug.path || [];
      const startIndex = Math.min(debug.pathIndex || 0, path.length);

      ctx.save();

      if (path.length > startIndex) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.78;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(tank.x, tank.y);
        for (let i = startIndex; i < path.length; i += 1) {
          ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        for (let i = startIndex; i < path.length; i += 1) {
          ctx.fillStyle = i === startIndex ? "#ffffff" : color;
          ctx.strokeStyle = "rgba(9, 15, 13, 0.9)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(path[i].x, path[i].y, i === startIndex ? 8 : 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      if (debug.moveTarget) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.92;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tank.x, tank.y);
        ctx.lineTo(debug.moveTarget.x, debug.moveTarget.y);
        ctx.stroke();

        ctx.strokeStyle = "#ffffff";
        ctx.globalAlpha = 0.88;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(debug.moveTarget.x, debug.moveTarget.y, debug.moveTarget.final ? 14 : 11, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (debug.target && debug.target !== debug.moveTarget) {
        ctx.strokeStyle = debug.visible ? "rgba(255, 255, 255, 0.74)" : "rgba(255, 209, 102, 0.54)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 8]);
        ctx.beginPath();
        ctx.moveTo(tank.x, tank.y);
        ctx.lineTo(debug.target.x, debug.target.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const stateLabels = {
        capture: "점령",
        engage: "교전",
        overwatch: "엄호",
        retreat: "후퇴",
        hold: "방어",
        support: "지원",
        escort: "분대동행",
        "escort-fire": "동행사격",
        "fire-support": "화력지원",
        "request-fire": "요청지원",
        transport: "수송",
        "transport-pickup": "승차지점",
        "transport-load": "탑승대기",
        "transport-run": "수송중",
        "transport-dismount": "하차",
        "transport-overwatch": "하차엄호",
        skirmish: "견제",
        evade: "회피"
      };
      const recovery = debug.recoveryTimer > 0 ? " 복구" : "";
      const unsafeLine = debug.unsafeLine ? " 사선위험" : "";
      const pathText = path.length > 0 ? ` ${Math.min(startIndex + 1, path.length)}/${path.length}` : "";
      const goalText = debug.goal ? `>${debug.goal}` : "";
      const stateText = stateLabels[debug.state || ai.state] || debug.state || ai.state;
      const paired = ai.currentOrder?.pairedSquadId ? `+${ai.currentOrder.pairedSquadId}` : "";
      const requestText = debug.supportRequest ? ` !${debug.supportRequest}` : "";
      const passengerText = tank.vehicleType === "humvee" && debug.passengers > 0 ? ` P${debug.passengers}` : "";
      const label = `${tank.callSign}${paired} ${stateText}${goalText}${pathText}${recovery}${unsafeLine}${requestText}${passengerText}`;
      const labelWidth = Math.max(86, label.length * 7.4);
      const labelX = tank.x - labelWidth / 2;
      const labelY = tank.y - (tank.vehicleType === "humvee" ? 68 : 76);

      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(9, 15, 13, 0.82)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      roundRect(ctx, labelX, labelY, labelWidth, 20, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#edf4ef";
      ctx.font = "800 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, tank.x, labelY + 10);

      if (debug.stuckTimer > 0.12) {
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tank.x, tank.y, 48 + debug.stuckTimer * 12, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }

    drawScreenVignette(game) {
      const ctx = this.ctx;
      const camera = this.camera;
      const gradient = ctx.createRadialGradient(
        camera.width / 2,
        camera.height / 2,
        Math.min(camera.width, camera.height) * 0.32,
        camera.width / 2,
        camera.height / 2,
        Math.max(camera.width, camera.height) * 0.72
      );
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, "rgba(0,0,0,0.28)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, camera.width, camera.height);

      this.drawPlayerDamageOverlay(game);

      if (game.result) {
        ctx.save();
        ctx.fillStyle = "rgba(5, 9, 8, 0.54)";
        ctx.fillRect(0, 0, camera.width, camera.height);
        const resultTitle = game.result === "BLUE VICTORY" ? "승리" : "패배";
        const reason = game.resultReason || "전투 종료";
        ctx.fillStyle = "#edf4ef";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "900 44px Inter, sans-serif";
        ctx.fillText(resultTitle, camera.width / 2, camera.height / 2 - 22);
        ctx.fillStyle = game.result === "BLUE VICTORY" ? "#8ed8ff" : "#ff938c";
        ctx.font = "800 18px Inter, sans-serif";
        ctx.fillText(reason, camera.width / 2, camera.height / 2 + 28);
        ctx.restore();
      }
    }

    drawPlayerDamageOverlay(game) {
      const ctx = this.ctx;
      const camera = this.camera;
      const flash = clamp(game.playerDamageFlash || 0, 0, 1);

      if (flash > 0.01) {
        ctx.save();
        const gradient = ctx.createRadialGradient(
          camera.width / 2,
          camera.height / 2,
          Math.min(camera.width, camera.height) * 0.22,
          camera.width / 2,
          camera.height / 2,
          Math.max(camera.width, camera.height) * 0.68
        );
        gradient.addColorStop(0, `rgba(128, 18, 16, ${0.03 * flash})`);
        gradient.addColorStop(0.62, `rgba(180, 32, 28, ${0.1 * flash})`);
        gradient.addColorStop(1, `rgba(220, 42, 36, ${0.32 * flash})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, camera.width, camera.height);
        ctx.restore();
      }

      const indicators = [
        ...(game.playerDangerWarnings || []),
        ...(game.playerDamageIndicators || [])
      ].slice(-5);

      if (indicators.length > 0) {
        const cx = camera.width / 2;
        const cy = camera.height / 2;
        const radius = Math.min(camera.width, camera.height) * 0.31;

        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const item of indicators) {
          const alpha = clamp(item.ttl / Math.max(0.001, item.maxTtl || 1), 0, 1);
          const dangerOnly = !item.amount;
          const angle = item.angle || 0;
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius;
          const size = dangerOnly ? 13 : 17;

          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle + Math.PI / 2);
          ctx.globalAlpha = dangerOnly ? 0.2 + alpha * 0.42 : 0.28 + alpha * 0.58;
          ctx.fillStyle = dangerOnly ? "rgba(255, 209, 102, 0.95)" : "rgba(255, 90, 78, 0.96)";
          ctx.beginPath();
          ctx.moveTo(0, -size);
          ctx.lineTo(size * 0.72, size * 0.58);
          ctx.lineTo(0, size * 0.28);
          ctx.lineTo(-size * 0.72, size * 0.58);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          if (alpha > 0.35) {
            ctx.globalAlpha = dangerOnly ? 0.45 + alpha * 0.34 : 0.5 + alpha * 0.42;
            ctx.fillStyle = dangerOnly ? "rgba(255, 231, 158, 0.96)" : "rgba(255, 206, 198, 0.97)";
            ctx.font = dangerOnly ? "800 11px Inter, sans-serif" : "900 12px Inter, sans-serif";
            ctx.fillText(item.label || "\uC704\uD5D8", x, y + size + 14);
          }
        }
        ctx.restore();
      }

      if (!game.playerDowned || game.playerDeathActive || game.result) return;

      ctx.save();
      ctx.fillStyle = "rgba(5, 7, 7, 0.44)";
      ctx.fillRect(0, 0, camera.width, camera.height);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255, 210, 198, 0.96)";
      ctx.font = "900 38px Inter, sans-serif";
      ctx.fillText("\uC804\uD22C \uBD88\uB2A5", camera.width / 2, camera.height / 2 - 28);
      ctx.fillStyle = "rgba(237, 244, 239, 0.9)";
      ctx.font = "800 15px Inter, sans-serif";
      ctx.fillText(game.playerPendingDeathReason || "\uD53C\uACA9 \uC6D0\uC778 \uD655\uC778 \uC911", camera.width / 2, camera.height / 2 + 12, camera.width * 0.86);
      ctx.fillStyle = "rgba(255, 209, 102, 0.88)";
      ctx.font = "800 13px Inter, sans-serif";
      ctx.fillText(`\uC0C1\uD669 \uD655\uC778 ${Math.max(0, game.playerDownedTimer || 0).toFixed(1)}s`, camera.width / 2, camera.height / 2 + 42);
      ctx.restore();
    }

    drawStartCountdown(game) {
      if (game.matchStarted || game.result || game.deploymentOpen || !game.countdownStarted) return;

      const ctx = this.ctx;
      const camera = this.camera;
      const remaining = Math.max(1, Math.ceil(game.startCountdown || 0));
      const ready = (game.startCountdown || 0) <= 0.8;

      ctx.save();
      ctx.fillStyle = "rgba(5, 9, 8, 0.18)";
      ctx.fillRect(0, 0, camera.width, camera.height);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = ready ? "#72e89a" : "#ffd166";
      ctx.font = "900 92px Inter, sans-serif";
      ctx.fillText(ready ? "출격" : `${remaining}`, camera.width / 2, camera.height * 0.34);

      ctx.fillStyle = "rgba(237, 244, 239, 0.92)";
      ctx.font = "900 18px Inter, sans-serif";
      ctx.fillText("기지에서 차량에 탑승하세요", camera.width / 2, camera.height * 0.34 + 78);

      ctx.fillStyle = "rgba(237, 244, 239, 0.64)";
      ctx.font = "800 12px Inter, sans-serif";
      ctx.fillText("E 탑승 / 1 철갑탄 / 2 고폭탄 / 우클릭 조준", camera.width / 2, camera.height * 0.34 + 108);
      ctx.restore();
    }

    drawAimModeOverlay(game) {
      if (!game.player.inTank || !game.input.mouse.rightDown) return;

      const ctx = this.ctx;
      const camera = this.camera;
      const cx = camera.width / 2;
      const cy = camera.height / 2;
      const edge = Math.min(camera.width, camera.height) * 0.12;

      ctx.save();
      ctx.fillStyle = "rgba(5, 9, 8, 0.12)";
      ctx.fillRect(0, 0, camera.width, 42);
      ctx.fillRect(0, camera.height - 42, camera.width, 42);
      ctx.fillRect(0, 0, 38, camera.height);
      ctx.fillRect(camera.width - 38, 0, 38, camera.height);

      ctx.strokeStyle = "rgba(237, 244, 239, 0.24)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 14]);
      ctx.beginPath();
      ctx.moveTo(cx - edge, cy);
      ctx.lineTo(cx + edge, cy);
      ctx.moveTo(cx, cy - edge);
      ctx.lineTo(cx, cy + edge);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = "rgba(255, 209, 102, 0.36)";
      ctx.lineWidth = 2;
      const corner = 28;
      const margin = 58;
      const corners = [
        [margin, margin, 1, 1],
        [camera.width - margin, margin, -1, 1],
        [margin, camera.height - margin, 1, -1],
        [camera.width - margin, camera.height - margin, -1, -1]
      ];
      for (const [x, y, sx, sy] of corners) {
        ctx.beginPath();
        ctx.moveTo(x, y + sy * corner);
        ctx.lineTo(x, y);
        ctx.lineTo(x + sx * corner, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawScoutAimOverlay(game) {
      if (!game.isPlayerScoutAimMode?.()) return;

      const ctx = this.ctx;
      const camera = this.camera;
      const zoom = camera.zoom || 1;
      const sx = (game.input.mouse.worldX - camera.x) * zoom;
      const sy = (game.input.mouse.worldY - camera.y) * zoom;
      const radius = Math.min(camera.width, camera.height) * 0.16;

      ctx.save();
      ctx.fillStyle = "rgba(5, 9, 8, 0.1)";
      ctx.fillRect(0, 0, camera.width, 34);
      ctx.fillRect(0, camera.height - 34, camera.width, 34);
      ctx.fillRect(0, 0, 30, camera.height);
      ctx.fillRect(camera.width - 30, 0, 30, camera.height);

      ctx.strokeStyle = "rgba(237, 244, 239, 0.28)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([7, 9]);
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.moveTo(sx - radius * 1.18, sy);
      ctx.lineTo(sx + radius * 1.18, sy);
      ctx.moveTo(sx, sy - radius * 1.18);
      ctx.lineTo(sx, sy + radius * 1.18);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = "rgba(120, 214, 140, 0.64)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sx - 14, sy);
      ctx.lineTo(sx - 4, sy);
      ctx.moveTo(sx + 4, sy);
      ctx.lineTo(sx + 14, sy);
      ctx.moveTo(sx, sy - 14);
      ctx.lineTo(sx, sy - 4);
      ctx.moveTo(sx, sy + 4);
      ctx.lineTo(sx, sy + 14);
      ctx.stroke();

      const designation = game.droneDesignatedContact?.();
      const activeDrone = game.activeReconDroneForSniper?.();
      const weapon = game.player?.getWeapon?.();
      const designatedTarget = designation?.drone === activeDrone ? designation.target : null;
      const targetAlive = designatedTarget?.alive !== undefined ? designatedTarget?.alive : designatedTarget?.hp > 0;
      const showDesignatedRange = Boolean(designatedTarget && targetAlive && weapon?.id === "sniper");
      if (showDesignatedRange) {
        const range = game.observedSniperRange?.(weapon, activeDrone, true) || weapon.range || 980;
        const rangeDistance = distXY(game.player.x, game.player.y, designatedTarget.x, designatedTarget.y);
        const inRange = rangeDistance <= range;
        const px = (game.player.x - camera.x) * zoom;
        const py = (game.player.y - camera.y) * zoom;
        const txRaw = (designatedTarget.x - camera.x) * zoom;
        const tyRaw = (designatedTarget.y - camera.y) * zoom;
        const margin = 42;
        const tx = clamp(txRaw, margin, camera.width - margin);
        const ty = clamp(tyRaw, 52, camera.height - 52);
        const offscreen = Math.abs(tx - txRaw) > 0.5 || Math.abs(ty - tyRaw) > 0.5;
        const pulse = 0.5 + Math.sin((game.matchTime || 0) * 8.5) * 0.5;
        const rangeColor = inRange ? "255, 209, 102" : "226, 93, 74";

        ctx.strokeStyle = `rgba(${rangeColor}, ${inRange ? 0.34 : 0.42})`;
        ctx.lineWidth = inRange ? 1.7 : 1.4;
        ctx.setLineDash(inRange ? [10, 9] : [5, 7]);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = `rgba(${rangeColor}, ${0.72 + pulse * 0.18})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tx, ty, offscreen ? 14 + pulse * 3 : 25 + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();

        if (offscreen) {
          const arrowAngle = angleTo(px, py, txRaw, tyRaw);
          ctx.save();
          ctx.translate(tx, ty);
          ctx.rotate(arrowAngle);
          ctx.fillStyle = `rgba(${rangeColor}, 0.78)`;
          ctx.beginPath();
          ctx.moveTo(16, 0);
          ctx.lineTo(2, -6);
          ctx.lineTo(2, 6);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        const label = inRange ? "관측 사거리" : "사거리 밖";
        const rangeText = `${Math.round(rangeDistance)} / ${Math.round(range)}`;
        const labelWidth = 86;
        const labelX = clamp(tx + 48, 50, camera.width - 50);
        const labelY = clamp(ty - 26, 48, camera.height - 48);
        ctx.fillStyle = inRange ? "rgba(37, 32, 16, 0.78)" : "rgba(42, 18, 16, 0.78)";
        roundRect(ctx, labelX - labelWidth / 2, labelY - 17, labelWidth, 34, 4);
        ctx.fill();
        ctx.strokeStyle = `rgba(${rangeColor}, 0.64)`;
        ctx.lineWidth = 1;
        roundRect(ctx, labelX - labelWidth / 2, labelY - 17, labelWidth, 34, 4);
        ctx.stroke();
        ctx.fillStyle = inRange ? "rgba(255, 231, 150, 0.94)" : "rgba(255, 167, 142, 0.94)";
        ctx.font = "700 11px Rajdhani, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, labelX, labelY - 5);
        ctx.fillStyle = "rgba(237, 244, 239, 0.76)";
        ctx.font = "700 10px Rajdhani, sans-serif";
        ctx.fillText(rangeText, labelX, labelY + 8);
      }

      const observedContacts = game.reconDroneObservedContacts?.({ sniperOnly: true }) || [];
      const observed = game.findObservedSniperTarget?.();
      if (observedContacts.length > 0) {
        ctx.lineWidth = 1.1;
        for (const target of observedContacts) {
          if (observed?.target === target) continue;
          const tx = (target.x - camera.x) * zoom;
          const ty = (target.y - camera.y) * zoom;
          const markerRadius = 13;
          ctx.strokeStyle = "rgba(143, 222, 207, 0.38)";
          ctx.beginPath();
          ctx.arc(tx, ty, markerRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = "rgba(237, 244, 239, 0.34)";
          ctx.beginPath();
          ctx.moveTo(tx - markerRadius - 6, ty);
          ctx.lineTo(tx - markerRadius - 1, ty);
          ctx.moveTo(tx + markerRadius + 1, ty);
          ctx.lineTo(tx + markerRadius + 6, ty);
          ctx.moveTo(tx, ty - markerRadius - 6);
          ctx.lineTo(tx, ty - markerRadius - 1);
          ctx.moveTo(tx, ty + markerRadius + 1);
          ctx.lineTo(tx, ty + markerRadius + 6);
          ctx.stroke();
        }
      }
      if (observed?.target) {
        const tx = (observed.target.x - camera.x) * zoom;
        const ty = (observed.target.y - camera.y) * zoom;
        const dx = (observed.drone.x - camera.x) * zoom;
        const dy = (observed.drone.y - camera.y) * zoom;
        const pulse = 0.5 + Math.sin((game.matchTime || 0) * 7) * 0.5;
        const designated = Boolean(observed.designated);

        ctx.strokeStyle = designated
          ? `rgba(255, 209, 102, ${0.54 + pulse * 0.26})`
          : `rgba(143, 222, 207, ${0.42 + pulse * 0.26})`;
        ctx.lineWidth = designated ? 1.5 : 1.1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = designated ? "rgba(255, 209, 102, 0.92)" : "rgba(143, 222, 207, 0.88)";
        ctx.lineWidth = designated ? 2.2 : 1.8;
        ctx.beginPath();
        ctx.arc(tx, ty, (designated ? 21 : 17) + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = "rgba(237, 244, 239, 0.72)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(tx - 22, ty - 8);
        ctx.lineTo(tx - 22, ty - 16);
        ctx.lineTo(tx - 14, ty - 16);
        ctx.moveTo(tx + 22, ty - 8);
        ctx.lineTo(tx + 22, ty - 16);
        ctx.lineTo(tx + 14, ty - 16);
        ctx.moveTo(tx - 22, ty + 8);
        ctx.lineTo(tx - 22, ty + 16);
        ctx.lineTo(tx - 14, ty + 16);
        ctx.moveTo(tx + 22, ty + 8);
        ctx.lineTo(tx + 22, ty + 16);
        ctx.lineTo(tx + 14, ty + 16);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawRpgAimOverlay(game) {
      if (!game.isPlayerRpgAimMode?.()) return;

      const ctx = this.ctx;
      const camera = this.camera;
      const zoom = camera.zoom || 1;
      const sx = (game.input.mouse.worldX - camera.x) * zoom;
      const sy = (game.input.mouse.worldY - camera.y) * zoom;
      const ready = (game.player.rpgAimTime || 0) >= 0.34;
      const radius = Math.min(camera.width, camera.height) * 0.09;

      ctx.save();
      ctx.fillStyle = "rgba(5, 9, 8, 0.1)";
      ctx.fillRect(0, 0, camera.width, 32);
      ctx.fillRect(0, camera.height - 32, camera.width, 32);

      ctx.strokeStyle = ready ? "rgba(255, 209, 102, 0.52)" : "rgba(237, 244, 239, 0.26)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash(ready ? [] : [6, 8]);
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.moveTo(sx - radius * 1.28, sy);
      ctx.lineTo(sx - radius * 0.42, sy);
      ctx.moveTo(sx + radius * 0.42, sy);
      ctx.lineTo(sx + radius * 1.28, sy);
      ctx.moveTo(sx, sy - radius * 1.28);
      ctx.lineTo(sx, sy - radius * 0.42);
      ctx.moveTo(sx, sy + radius * 0.42);
      ctx.lineTo(sx, sy + radius * 1.28);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = ready ? "rgba(255, 180, 92, 0.88)" : "rgba(255, 180, 92, 0.42)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - 18, sy);
      ctx.lineTo(sx - 6, sy);
      ctx.moveTo(sx + 6, sy);
      ctx.lineTo(sx + 18, sy);
      ctx.moveTo(sx, sy - 18);
      ctx.lineTo(sx, sy - 6);
      ctx.moveTo(sx, sy + 6);
      ctx.lineTo(sx, sy + 18);
      ctx.stroke();
      ctx.restore();
    }
  }

  function collectRoadJunctions(roads) {
    const junctions = [];
    const seen = new Set();
    const add = (point) => {
      const key = `${Math.round(point.x / 8) * 8}:${Math.round(point.y / 8) * 8}`;
      if (seen.has(key)) return;
      seen.add(key);
      junctions.push({ x: point.x, y: point.y });
    };

    for (let roadA = 0; roadA < roads.length; roadA += 1) {
      for (let segmentA = 1; segmentA < roads[roadA].length; segmentA += 1) {
        const a = roads[roadA][segmentA - 1];
        const b = roads[roadA][segmentA];
        for (let roadB = roadA + 1; roadB < roads.length; roadB += 1) {
          for (let segmentB = 1; segmentB < roads[roadB].length; segmentB += 1) {
            const c = roads[roadB][segmentB - 1];
            const d = roads[roadB][segmentB];
            const point = segmentIntersectionPoint(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
            if (point) add(point);
          }
        }
      }
    }
    return junctions;
  }

  function segmentIntersectionPoint(ax, ay, bx, by, cx, cy, dx, dy) {
    const rx = bx - ax;
    const ry = by - ay;
    const sx = dx - cx;
    const sy = dy - cy;
    const denominator = rx * sy - ry * sx;
    if (Math.abs(denominator) < 0.0001) return null;
    const qpx = cx - ax;
    const qpy = cy - ay;
    const t = (qpx * sy - qpy * sx) / denominator;
    const u = (qpx * ry - qpy * rx) / denominator;
    if (t < -0.001 || t > 1.001 || u < -0.001 || u > 1.001) return null;
    return {
      x: ax + rx * clamp(t, 0, 1),
      y: ay + ry * clamp(t, 0, 1)
    };
  }

  Renderer.VERSION = "canvas-renderer-v1";
  IronLine.Renderer = Renderer;
})(window);
