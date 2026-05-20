"use strict";

(function registerRendererMinimap(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM_COLORS } = IronLine.constants;
  const { distXY, roundRect } = IronLine.math;
  const proto = IronLine.Renderer?.prototype;
  if (!proto) return;

  Object.assign(proto, {
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
      const player = game.adminObserverMode ? null : game.player;
      const viewerTeam = player?.team;
      const map = { x, y, w: mapW, h: mapH, sx, sy };

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

      if (!game.adminObserverMode && viewerTeam) {
        this.drawMinimapFog(game, map, viewerTeam, player);
      }

      for (const tank of game.tanks) {
        if (!tank.alive) continue;
        if (!this.shouldDrawMinimapContact(game, tank, viewerTeam)) continue;
        ctx.fillStyle = TEAM_COLORS[tank.team];
        const point = this.minimapContactPoint(game, tank, viewerTeam);
        ctx.globalAlpha = point.alpha;
        ctx.fillRect(x + point.x * sx - 2.5, y + point.y * sy - 2.5, 5, 5);
        this.drawMinimapContactCertainty(ctx, x + point.x * sx, y + point.y * sy, point, 4.5);
        ctx.globalAlpha = 1;
      }

      for (const humvee of game.humvees || []) {
        if (!humvee.alive) continue;
        if (!this.shouldDrawMinimapContact(game, humvee, viewerTeam)) continue;
        ctx.fillStyle = TEAM_COLORS[humvee.team];
        const point = this.minimapContactPoint(game, humvee, viewerTeam);
        ctx.globalAlpha = point.alpha;
        ctx.fillRect(x + point.x * sx - 2, y + point.y * sy - 2, 4, 4);
        this.drawMinimapContactCertainty(ctx, x + point.x * sx, y + point.y * sy, point, 4);
        ctx.globalAlpha = 1;
      }

      for (const crew of game.crews || []) {
        if (!crew.alive || crew.inTank) continue;
        if (!this.shouldDrawMinimapContact(game, crew, viewerTeam)) continue;
        ctx.fillStyle = TEAM_COLORS[crew.team] || "#edf4ef";
        const point = this.minimapContactPoint(game, crew, viewerTeam);
        ctx.globalAlpha = point.alpha;
        ctx.beginPath();
        ctx.arc(x + point.x * sx, y + point.y * sy, 2.6, 0, Math.PI * 2);
        ctx.fill();
        this.drawMinimapContactCertainty(ctx, x + point.x * sx, y + point.y * sy, point, 3.6);
        ctx.globalAlpha = 1;
      }

      for (const unit of game.infantry || []) {
        if (!unit.alive || unit.inVehicle) continue;
        if (!this.shouldDrawMinimapContact(game, unit, viewerTeam)) continue;
        ctx.fillStyle = TEAM_COLORS[unit.team] || "#edf4ef";
        const point = this.minimapContactPoint(game, unit, viewerTeam);
        ctx.globalAlpha = point.alpha;
        ctx.fillRect(x + point.x * sx - 1.8, y + point.y * sy - 1.8, 3.6, 3.6);
        this.drawMinimapContactCertainty(ctx, x + point.x * sx, y + point.y * sy, point, 3.5);
        ctx.globalAlpha = 1;
      }

      for (const drone of game.drones || []) {
        if (!drone.alive) continue;
        if (!this.shouldDrawMinimapContact(game, drone, viewerTeam)) continue;
        const attackDrone = drone.droneRole === "attack";
        ctx.fillStyle = attackDrone
          ? "#ff9148"
          : player?.controlledDrone === drone ? "#8ed8ff" : "rgba(142, 216, 255, 0.82)";
        const point = this.minimapContactPoint(game, drone, viewerTeam);
        ctx.globalAlpha = point.alpha;
        ctx.beginPath();
        ctx.arc(x + point.x * sx, y + point.y * sy, attackDrone ? 3.2 : 2.8, 0, Math.PI * 2);
        ctx.fill();
        this.drawMinimapContactCertainty(ctx, x + point.x * sx, y + point.y * sy, point, attackDrone ? 4.2 : 3.8);
        ctx.globalAlpha = 1;
      }

      if (player && !player.inTank && player.hp > 0) {
        ctx.fillStyle = "#89d27e";
        ctx.beginPath();
        ctx.arc(x + player.x * sx, y + player.y * sy, 3.5, 0, Math.PI * 2);
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
    },

    shouldDrawMinimapContact(game, target, viewerTeam) {
      if (game.adminObserverMode || !viewerTeam) return true;
      if (!target || target.team === viewerTeam) return true;
      return Boolean(game.isMinimapReportedEnemy?.(viewerTeam, target));
    },

    minimapContactPoint(game, target, viewerTeam) {
      const report = target?.team !== viewerTeam ? game.getReportedContact?.(viewerTeam, target) : null;
      if (!report) return { x: target.x, y: target.y, alpha: 1 };
      const ttlAlpha = Math.min(1, Math.max(0.36, (report.ttl || 0) / 3.4));
      const confidence = report.confidence ?? 0.68;
      const certaintyAlpha = report.certainty === "confirmed"
        ? 1
        : report.certainty === "last" ? 0.78 : report.certainty === "estimated" ? 0.58 : 0.42;
      return {
        x: report.x ?? target.x,
        y: report.y ?? target.y,
        alpha: Math.min(0.95, Math.max(0.26, ttlAlpha * confidence * certaintyAlpha)),
        certainty: report.certainty || "last"
      };
    },

    drawMinimapContactCertainty(ctx, x, y, point, radius) {
      if (!point.certainty || point.certainty === "confirmed") return;

      ctx.save();
      ctx.globalAlpha = point.certainty === "estimated" ? 0.34 : 0.52;
      ctx.strokeStyle = point.certainty === "estimated"
        ? "rgba(255, 209, 102, 0.72)"
        : "rgba(237, 244, 239, 0.64)";
      ctx.lineWidth = 1;
      ctx.setLineDash(point.certainty === "estimated" ? [2, 2] : [4, 3]);
      ctx.beginPath();
      ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },

    drawMinimapFog(game, map, viewerTeam, player) {
      const ctx = this.ctx;
      const visionSources = this.minimapVisionSources(game, viewerTeam, player);

      ctx.save();
      ctx.fillStyle = "rgba(3, 8, 7, 0.34)";
      ctx.fillRect(map.x, map.y, map.w, map.h);
      for (const source of visionSources) {
        const radius = source.radius * Math.max(map.sx, map.sy);
        const gx = map.x + source.x * map.sx;
        const gy = map.y + source.y * map.sy;
        const gradient = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
        gradient.addColorStop(0, source.kind === "drone" ? "rgba(143, 222, 207, 0.18)" : "rgba(105, 188, 255, 0.1)");
        gradient.addColorStop(0.7, source.kind === "drone" ? "rgba(143, 222, 207, 0.07)" : "rgba(105, 188, 255, 0.035)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(gx, gy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(143, 222, 207, 0.16)";
      ctx.lineWidth = 1;
      for (const source of visionSources.filter((item) => item.kind === "drone")) {
        const radius = source.radius * Math.max(map.sx, map.sy);
        ctx.beginPath();
        ctx.arc(map.x + source.x * map.sx, map.y + source.y * map.sy, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    },

    minimapVisionSources(game, viewerTeam, player) {
      const sources = [];
      if (player && player.hp > 0) sources.push({ x: player.x, y: player.y, radius: 520, kind: "player" });
      if (player?.inTank?.alive) sources.push({ x: player.inTank.x, y: player.inTank.y, radius: 760, kind: "vehicle" });

      for (const unit of game.infantry || []) {
        if (!unit.alive || unit.inVehicle || unit.team !== viewerTeam) continue;
        sources.push({ x: unit.x, y: unit.y, radius: unit.classId === "scout" ? 620 : 420, kind: "unit" });
      }
      for (const vehicle of [...(game.tanks || []), ...(game.humvees || [])]) {
        if (!vehicle.alive || vehicle.team !== viewerTeam) continue;
        sources.push({ x: vehicle.x, y: vehicle.y, radius: vehicle.vehicleType === "humvee" ? 560 : 700, kind: "vehicle" });
      }
      for (const drone of game.drones || []) {
        if (!drone.alive || drone.team !== viewerTeam) continue;
        sources.push({
          x: drone.x,
          y: drone.y,
          radius: drone.droneRole === "attack" ? Math.max(320, drone.splash || 0) : drone.scanRange || 760,
          kind: "drone"
        });
      }
      for (const point of game.capturePoints || []) {
        if (point.owner !== viewerTeam) continue;
        sources.push({
          x: point.x,
          y: point.y,
          radius: point.visionRadius || 620,
          kind: "objective"
        });
      }

      return sources.filter((source, index) => (
        index < 28 || source.kind === "drone" || (player && distXY(source.x, source.y, player.x, player.y) < 900)
      ));
    }
  });
})(window);
