"use strict";

(function registerExplosionDebris(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const clamp = IronLine.math?.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
  const MAX_DEBRIS = 120;
  const LIFE = 60;

  function pushLimited(array, item, limit) {
    array.push(item);
    while (array.length > limit) array.shift();
  }

  function createDebris(game, explosion) {
    if (!game?.effects || !explosion || explosion.smoke || explosion.__debrisSeeded) return;
    if ((explosion.maxRadius || explosion.radius || 0) < 26) return;
    explosion.__debrisSeeded = true;

    const debris = game.effects.debris || (game.effects.debris = []);
    const count = clamp(Math.round((explosion.maxRadius || 42) / 18), 3, 6);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * Math.max(12, (explosion.maxRadius || 42) * 0.48);
      const droneShard = String(explosion.color || "").includes("126, 54") || String(explosion.color || "").includes("155, 220");
      pushLimited(debris, {
        x: explosion.x + Math.cos(angle) * distance,
        y: explosion.y + Math.sin(angle) * distance,
        w: 5 + Math.random() * (droneShard ? 10 : 16),
        h: 2 + Math.random() * (droneShard ? 5 : 7),
        angle: angle + Math.random() * 1.2,
        kind: droneShard ? "shard" : Math.random() < 0.55 ? "scorch-chip" : "dirt",
        life: LIFE,
        maxLife: LIFE,
        alpha: 0.18 + Math.random() * 0.2
      }, MAX_DEBRIS);
    }
  }

  function updateDebris(game, dt) {
    const debris = game?.effects?.debris;
    if (!Array.isArray(debris)) return;
    for (let i = debris.length - 1; i >= 0; i -= 1) {
      debris[i].life -= dt;
      if (debris[i].life <= 0) debris.splice(i, 1);
    }
  }

  function drawDebris(renderer, game) {
    const debris = game?.effects?.debris;
    if (!Array.isArray(debris) || !debris.length) return;
    const ctx = renderer.ctx;
    const camera = renderer.camera || game.camera || {};
    const margin = 80;
    const left = (camera.x || 0) - margin;
    const top = (camera.y || 0) - margin;
    const right = (camera.x || 0) + (camera.viewWidth || camera.width || 1280) + margin;
    const bottom = (camera.y || 0) + (camera.viewHeight || camera.height || 720) + margin;

    ctx.save();
    for (const item of debris) {
      if (item.x < left || item.x > right || item.y < top || item.y > bottom) continue;
      const alpha = clamp((item.life || 0) / Math.max(item.maxLife || LIFE, 1), 0, 1) * (item.alpha || 0.24);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(item.x, item.y);
      ctx.rotate(item.angle || 0);
      if (item.kind === "dirt") {
        ctx.fillStyle = "#2e2a23";
        ctx.beginPath();
        ctx.ellipse(0, 0, item.w, item.h, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = item.kind === "shard" ? "#7d817f" : "#171613";
        ctx.fillRect(-item.w / 2, -item.h / 2, item.w, item.h);
        if (item.kind === "shard") {
          ctx.strokeStyle = "rgba(210, 218, 212, 0.35)";
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(-item.w * 0.35, 0);
          ctx.lineTo(item.w * 0.35, 0);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }

  if (IronLine.combat?.updateEffects) {
    const baseUpdateEffects = IronLine.combat.updateEffects;
    IronLine.combat.updateEffects = function updateEffectsWithExplosionDebris(game, dt) {
      for (const explosion of game?.effects?.explosions || []) createDebris(game, explosion);
      const result = baseUpdateEffects.call(this, game, dt);
      updateDebris(game, dt);
      return result;
    };
  }

  const Renderer = IronLine.Renderer;
  if (Renderer?.prototype?.drawScorchMarks) {
    const baseDrawScorchMarks = Renderer.prototype.drawScorchMarks;
    Renderer.prototype.drawScorchMarks = function drawScorchMarksWithDebris(game) {
      const result = baseDrawScorchMarks.call(this, game);
      drawDebris(this, game);
      return result;
    };
  }
})(window);
