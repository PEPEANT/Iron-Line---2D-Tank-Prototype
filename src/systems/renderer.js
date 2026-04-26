"use strict";

(function registerRenderer(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, TEAM_COLORS, INFANTRY_WEAPONS } = IronLine.constants;
  const { clamp, lerp, distXY, roundRect, hexToRgba } = IronLine.math;

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
      ctx.translate(-camera.x, -camera.y);

      this.drawTerrain(game);
      this.drawSafeZones(game);
      this.drawCapturePoints(game);
      this.drawScorchMarks(game);
      this.drawObstacles(game);

      for (const tank of game.tanks) this.drawTank(game, tank);
      for (const unit of game.infantry || []) this.drawInfantryUnit(game, unit);
      for (const crew of game.crews || []) this.drawCrewMember(game, crew);
      if (!game.player.inTank && game.player.hp > 0) this.drawInfantry(game, game.player);

      this.drawProjectiles(game);
      this.drawTracers(game);
      this.drawExplosions(game);
      this.drawSmoke(game);
      this.drawDebugOverlay(game);

      ctx.restore();
      this.drawMinimap(game);
      this.drawScreenVignette(game);
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

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const road of world.roads) {
        ctx.beginPath();
        ctx.moveTo(road[0].x, road[0].y);
        for (let i = 1; i < road.length; i += 1) ctx.lineTo(road[i].x, road[i].y);
        ctx.strokeStyle = "rgba(111, 105, 83, 0.58)";
        ctx.lineWidth = 84;
        ctx.stroke();
        ctx.strokeStyle = "rgba(158, 151, 118, 0.22)";
        ctx.lineWidth = 7;
        ctx.setLineDash([28, 36]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

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

    drawTank(game, tank) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(tank.x, tank.y);
      ctx.rotate(tank.angle);

      if (!tank.alive) {
        ctx.globalAlpha = 0.82;
        ctx.fillStyle = "#1a1a18";
        roundRect(ctx, -31, -21, 62, 42, 8);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 120, 80, 0.18)";
        roundRect(ctx, -23, -15, 46, 30, 5);
        ctx.fill();
        ctx.restore();
        this.drawTankLabel(tank);
        return;
      }

      ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
      ctx.beginPath();
      ctx.ellipse(2, 6, 36, 25, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = tank.team === TEAM.BLUE ? "#2a668f" : "#943c37";
      roundRect(ctx, -32, -22, 64, 44, 7);
      ctx.fill();

      ctx.fillStyle = tank.team === TEAM.BLUE ? "#1c445e" : "#642a28";
      roundRect(ctx, -36, -25, 18, 50, 5);
      roundRect(ctx, 18, -25, 18, 50, 5);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.12)";
      roundRect(ctx, -18, -16, 36, 32, 6);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(tank.x, tank.y);
      ctx.rotate(tank.turretAngle);
      const recoilOffset = -tank.recoil * 7;
      ctx.fillStyle = tank.team === TEAM.BLUE ? "#78c6ff" : "#ff8a80";
      roundRect(ctx, -7 + recoilOffset, -6, 46, 12, 4);
      ctx.fill();
      ctx.fillStyle = tank.team === TEAM.BLUE ? "#3a82ad" : "#ad4a45";
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (tank.reload.active) {
        const pct = clamp(tank.reload.progress / tank.reload.duration, 0, 1);
        ctx.save();
        ctx.translate(tank.x, tank.y);
        ctx.strokeStyle = "rgba(255, 209, 102, 0.95)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, 39, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      this.drawTankHealth(tank);
      this.drawTankLabel(tank);
    }

    drawTankHealth(tank) {
      const ctx = this.ctx;
      const width = 54;
      const pct = tank.maxHp > 0 ? tank.hp / tank.maxHp : 0;
      ctx.save();
      ctx.translate(tank.x, tank.y - 47);
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
      ctx.translate(tank.x, tank.y + 42);
      ctx.fillStyle = "rgba(9, 15, 13, 0.65)";
      roundRect(ctx, -25, -10, 50, 18, 4);
      ctx.fill();
      ctx.fillStyle = "#edf4ef";
      ctx.font = "700 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tank.callSign, 0, 0);
      ctx.restore();
    }

    drawInfantry(game, unit, options = {}) {
      const ctx = this.ctx;
      const color = options.color || "#89d27e";
      const weapon = INFANTRY_WEAPONS[unit.weaponId] || INFANTRY_WEAPONS.rifle;
      ctx.save();
      ctx.translate(unit.x, unit.y);
      ctx.rotate(unit.angle);
      ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
      ctx.beginPath();
      ctx.ellipse(2, 4, 13, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, unit.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#243222";
      roundRect(ctx, 4, -weapon.visualWidth / 2, weapon.visualLength, weapon.visualWidth, 2);
      ctx.fill();
      if (unit.weaponId === "lmg") {
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        roundRect(ctx, 13, 3, 8, 3, 1);
        ctx.fill();
      }
      ctx.restore();

      if (options.showPrompt === false) return;
      const d = distXY(unit.x, unit.y, game.playerTank.x, game.playerTank.y);
      if (d < 78 && game.playerTank.alive) {
        ctx.save();
        ctx.globalAlpha = 0.55 + Math.sin(unit.interactPulse * 5) * 0.18;
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(game.playerTank.x, game.playerTank.y, 47, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
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
      if (!unit.alive) {
        this.drawInfantryCorpse(unit);
        return;
      }
      const color = unit.team === TEAM.BLUE ? "#b6dcff" : "#ffb0ab";
      this.drawInfantry(game, unit, { color, showPrompt: false });
      this.drawInfantryHealth(unit);
      this.drawInfantrySuppression(unit);
    }

    drawInfantryCorpse(unit) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(unit.x, unit.y);
      ctx.rotate(unit.angle + Math.PI / 2);
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
      ctx.beginPath();
      ctx.ellipse(2, 4, 13, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = unit.team === TEAM.BLUE ? "#48697c" : "#76504e";
      roundRect(ctx, -10, -5, 20, 10, 5);
      ctx.fill();
      ctx.fillStyle = "#252b25";
      roundRect(ctx, 5, -2, 13, 4, 2);
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

    drawProjectiles(game) {
      const ctx = this.ctx;
      for (const shell of game.projectiles) {
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

    drawTracers(game) {
      const ctx = this.ctx;
      for (const tracer of game.effects.tracers || []) {
        const alpha = clamp(tracer.life / tracer.maxLife, 0, 1);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = tracer.color;
        ctx.lineWidth = 2;
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
        gradient.addColorStop(0, explosion.color.replace(/[\d.]+\)$/u, `${0.8 * alpha})`));
        gradient.addColorStop(0.45, explosion.color.replace(/[\d.]+\)$/u, `${0.32 * alpha})`));
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
        ctx.fill();
      }
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
      const mapW = 178;
      const mapH = 120;
      const x = camera.width - mapW - 16;
      const y = camera.height - mapH - 18;
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

      for (const crew of game.crews || []) {
        if (!crew.alive || crew.inTank) continue;
        ctx.fillStyle = TEAM_COLORS[crew.team] || "#edf4ef";
        ctx.beginPath();
        ctx.arc(x + crew.x * sx, y + crew.y * sy, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const unit of game.infantry || []) {
        if (!unit.alive) continue;
        ctx.fillStyle = TEAM_COLORS[unit.team] || "#edf4ef";
        ctx.fillRect(x + unit.x * sx - 1.8, y + unit.y * sy - 1.8, 3.6, 3.6);
      }

      if (!game.player.inTank && game.player.hp > 0) {
        ctx.fillStyle = "#89d27e";
        ctx.beginPath();
        ctx.arc(x + game.player.x * sx, y + game.player.y * sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = "rgba(255,255,255,0.42)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + camera.x * sx, y + camera.y * sy, camera.width * sx, camera.height * sy);
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

      for (const unit of game.infantry || []) {
        if (!unit.ai || !unit.alive) continue;
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
        cover: "엄폐",
        suppressed: "제압"
      };
      const pressure = debug.suppression > 5 ? ` S${Math.round(debug.suppression)}` : "";
      const weapon = INFANTRY_WEAPONS[debug.weaponId] || INFANTRY_WEAPONS[unit.weaponId] || INFANTRY_WEAPONS.rifle;
      const roleLabels = {
        assault: "돌격",
        support: "지원",
        security: "경계"
      };
      const role = debug.squadRole ? ` ${roleLabels[debug.squadRole] || debug.squadRole}` : "";
      const squad = debug.squadId ? `${debug.squadId}/` : "";
      const coverQuality = debug.coverQuality > 0 ? ` Q${Math.round(debug.coverQuality)}` : "";
      const label = `${squad}${unit.callSign} ${weapon.shortName}${role} ${stateLabels[debug.state] || debug.state || unit.ai.state}${debug.goal ? `>${debug.goal}` : ""}${pressure}${coverQuality}`;
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
        hold: "방어"
      };
      const recovery = debug.recoveryTimer > 0 ? " 복구" : "";
      const pathText = path.length > 0 ? ` ${Math.min(startIndex + 1, path.length)}/${path.length}` : "";
      const goalText = debug.goal ? `>${debug.goal}` : "";
      const stateText = stateLabels[debug.state || ai.state] || debug.state || ai.state;
      const paired = ai.currentOrder?.pairedSquadId ? `+${ai.currentOrder.pairedSquadId}` : "";
      const label = `${tank.callSign}${paired} ${stateText}${goalText}${pathText}${recovery}`;
      const labelWidth = Math.max(86, label.length * 7.4);
      const labelX = tank.x - labelWidth / 2;
      const labelY = tank.y - 76;

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

      if (game.result) {
        ctx.save();
        ctx.fillStyle = "rgba(5, 9, 8, 0.54)";
        ctx.fillRect(0, 0, camera.width, camera.height);
        ctx.fillStyle = "#edf4ef";
        ctx.font = "900 44px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(game.result, camera.width / 2, camera.height / 2);
        ctx.restore();
      }
    }
  }

  Renderer.VERSION = "canvas-renderer-v1";
  IronLine.Renderer = Renderer;
})(window);
