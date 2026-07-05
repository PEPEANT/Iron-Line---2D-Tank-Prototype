"use strict";

(function registerRendererSupplyCrates(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { clamp, roundRect } = IronLine.math || {};
  const proto = IronLine.Renderer?.prototype;
  if (!proto) return;

  function alphaClamp(value, min = 0, max = 1) {
    return clamp ? clamp(value, min, max) : Math.max(min, Math.min(max, value));
  }

  proto.drawSupplyCrate = function drawSupplyCrate(item, game = null) {
    const ctx = this.ctx;
    const x = Number(item.x) || 0;
    const y = Number(item.y) || 0;
    const w = Number(item.w) || 42;
    const h = Number(item.h) || 28;
    const centerX = x + w * 0.5;
    const centerY = y + h * 0.5;
    const near = game?.nearbySupplyCrate?.() === item;
    const flash = alphaClamp(item.damageFlash || 0, 0, 1);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(item.angle || 0);
    ctx.translate(-w * 0.5, -h * 0.5);

    ctx.fillStyle = "rgba(0, 0, 0, 0.26)";
    roundRect(ctx, 4, 6, w, h, 4);
    ctx.fill();

    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#6f735f");
    gradient.addColorStop(0.52, "#48503f");
    gradient.addColorStop(1, "#293126");
    ctx.fillStyle = gradient;
    ctx.strokeStyle = near ? "rgba(255, 209, 102, 0.86)" : "rgba(224, 232, 210, 0.22)";
    ctx.lineWidth = near ? 2.6 : 1.6;
    roundRect(ctx, 0, 0, w, h, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#d5b24a";
    roundRect(ctx, w * 0.12, h * 0.2, w * 0.76, h * 0.18, 2);
    ctx.fill();
    ctx.fillStyle = "rgba(19, 25, 21, 0.42)";
    roundRect(ctx, w * 0.15, h * 0.58, w * 0.7, h * 0.16, 2);
    ctx.fill();

    if (flash > 0) {
      ctx.globalAlpha = flash * 0.7;
      ctx.fillStyle = "#ffd166";
      roundRect(ctx, 0, 0, w, h, 4);
      ctx.fill();
    }
    ctx.restore();

    if (near && !game?.supplyCrateUi?.open) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "900 12px Inter, sans-serif";
      ctx.fillStyle = "rgba(7, 12, 10, 0.78)";
      ctx.strokeStyle = "rgba(255, 209, 102, 0.76)";
      ctx.lineWidth = 1.5;
      roundRect(ctx, centerX - 18, y - 29, 36, 22, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffd166";
      ctx.fillText("E", centerX, y - 18);
      ctx.restore();
    }

    if (item.floatTimer > 0 && item.floatText) {
      const alpha = alphaClamp(item.floatTimer / 1.2, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "900 13px Inter, sans-serif";
      ctx.fillStyle = "rgba(7, 12, 10, 0.76)";
      const textWidth = ctx.measureText(item.floatText).width + 18;
      roundRect(ctx, centerX - textWidth * 0.5, y - 55 - (1 - alpha) * 10, textWidth, 24, 5);
      ctx.fill();
      ctx.fillStyle = "#edf4ef";
      ctx.fillText(item.floatText, centerX, y - 43 - (1 - alpha) * 10);
      ctx.restore();
    }
  };

  proto.drawSupplyCrateHoldProgress = function drawSupplyCrateHoldProgress(game) {
    const hold = game?.supplyCrateHold;
    if (!hold?.crate || hold.ratio <= 0) return;
    const player = game.player;
    if (!player) return;
    const ratio = alphaClamp(hold.ratio, 0, 1);
    const ctx = this.ctx;
    const radius = (player.radius || 12) + 15;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(7, 12, 10, 0.68)";
    ctx.beginPath();
    ctx.arc(player.x, player.y - 2, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 209, 102, 0.92)";
    ctx.beginPath();
    ctx.arc(player.x, player.y - 2, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.stroke();
    ctx.restore();
  };

  const baseDrawScenery = proto.drawScenery;
  proto.drawScenery = function drawSceneryWithSupplyCrates(game) {
    const scenery = game.world?.scenery || [];
    const ordinary = [];
    const crates = [];
    for (const item of scenery) {
      if (item?.type === "supply-crate") crates.push(item);
      else ordinary.push(item);
    }

    if (ordinary.length === scenery.length) {
      baseDrawScenery?.call(this, game);
    } else {
      const original = game.world.scenery;
      game.world.scenery = ordinary;
      baseDrawScenery?.call(this, game);
      game.world.scenery = original;
      for (const crate of crates) this.drawSupplyCrate(crate, game);
    }
    this.drawSupplyCrateHoldProgress(game);
  };
})(window);
