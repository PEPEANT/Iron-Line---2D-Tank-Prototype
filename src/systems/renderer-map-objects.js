"use strict";

(function registerRendererMapObjects(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { clamp, roundRect } = IronLine.math || {};
  const proto = IronLine.Renderer?.prototype;
  if (!proto) return;

  function alphaClamp(value, min = 0, max = 1) {
    return clamp ? clamp(value, min, max) : Math.max(min, Math.min(max, value));
  }

  function pointInRect(point, rect) {
    return point &&
      point.x >= rect.x &&
      point.y >= rect.y &&
      point.x <= rect.x + rect.w &&
      point.y <= rect.y + rect.h;
  }

  Object.assign(proto, {
    drawMapObjectFloors(game) {
      const roofs = game.world?.mapObjectRoofs || [];
      if (!roofs.length) return;
      const ctx = this.ctx;
      ctx.save();
      for (const item of roofs) {
        ctx.fillStyle = item.floor?.color || "rgba(79, 87, 76, 0.5)";
        roundRect(ctx, item.x + 4, item.y + 4, Math.max(1, item.w - 8), Math.max(1, item.h - 8), 5);
        ctx.fill();
        ctx.strokeStyle = "rgba(231, 238, 222, 0.08)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    },

    drawMapObjectOverlays(game) {
      this.drawMapObjectRoofs(game);
    },

    drawMapObjectRoofs(game) {
      const roofs = game.world?.mapObjectRoofs || [];
      if (!roofs.length) return;
      const ctx = this.ctx;
      for (const item of roofs) {
        const open = this.mapObjectRoofShouldOpen(game, item);
        const roof = item.roof || {};
        const alpha = open ? 0.18 : 0.86;
        const gradient = ctx.createLinearGradient(item.x, item.y, item.x + item.w, item.y + item.h);
        gradient.addColorStop(0, roof.colorA || "#5b645c");
        gradient.addColorStop(1, roof.colorB || "#303833");

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
        roundRect(ctx, item.x + 7, item.y + 8, item.w, item.h, 5);
        ctx.fill();
        ctx.fillStyle = gradient;
        ctx.strokeStyle = open ? "rgba(255, 209, 102, 0.46)" : "rgba(238, 245, 235, 0.14)";
        ctx.lineWidth = open ? 3 : 2;
        roundRect(ctx, item.x, item.y, item.w, item.h, 5);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = roof.trim || "#8e9a8f";
        ctx.globalAlpha = alphaClamp(alpha + 0.08, 0, 0.92);
        ctx.lineWidth = 2;
        const seamCount = Math.max(1, Math.floor(Math.max(item.w, item.h) / 96));
        for (let i = 1; i <= seamCount; i += 1) {
          const t = i / (seamCount + 1);
          ctx.beginPath();
          const sx = item.x + item.w * t;
          ctx.moveTo(sx, item.y + 10);
          ctx.lineTo(sx, item.y + item.h - 10);
          ctx.stroke();
        }
        ctx.restore();
      }
    },

    mapObjectRoofShouldOpen(game, roof) {
      if (!roof) return false;
      const player = game.player && !game.player.inTank && game.player.hp > 0 ? game.player : null;
      if (pointInRect(player, roof)) return true;
      for (const unit of game.infantry || []) {
        if (unit?.alive !== false && pointInRect(unit, roof)) return true;
      }
      return false;
    }
  });

  const baseDrawObstacles = proto.drawObstacles;
  proto.drawObstacles = function drawObstaclesWithMapObjectFloors(game) {
    this.drawMapObjectFloors?.(game);
    return baseDrawObstacles?.call(this, game);
  };
})(window);
