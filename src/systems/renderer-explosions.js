"use strict";

(function registerExplosionRenderer(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const clamp = IronLine.math?.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));

  function radial(ctx, x, y, radius, stops) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, radius));
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function rgba(color, alpha) {
    if (!color || !color.startsWith("rgba(")) return color || `rgba(255, 145, 58, ${alpha})`;
    const parts = color.slice(5, -1).split(",").map((item) => item.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  }

  function drawSmoke(ctx, renderer, explosion, lifeAlpha, age) {
    const base = explosion.color || "rgba(70, 66, 56, 0.58)";
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + age * 0.7;
      const drift = explosion.radius * (0.08 + i * 0.035 + age * 0.08);
      const radius = explosion.radius * (0.58 + i * 0.07);
      radial(ctx, explosion.x + Math.cos(angle) * drift, explosion.y + Math.sin(angle) * drift - age * 10, radius, [
        [0, renderer.assetColor?.(base, 0.26 * lifeAlpha) || rgba(base, 0.26 * lifeAlpha)],
        [0.62, renderer.assetColor?.(base, 0.14 * lifeAlpha) || rgba(base, 0.14 * lifeAlpha)],
        [1, "rgba(42, 38, 31, 0)"]
      ]);
    }
  }

  function drawFireball(ctx, renderer, explosion, lifeAlpha, age, style) {
    const effectColor = explosion.color || "rgba(255, 145, 58, 0.86)";
    const hotAlpha = clamp((0.28 - age) / 0.28, 0, 1) * lifeAlpha;
    const smokeAlpha = clamp((age - 0.26) / 0.74, 0, 1) * lifeAlpha;
    const coreColor = style.coreColor || "rgba(255, 246, 198, 1)";

    if (hotAlpha > 0.02) {
      radial(ctx, explosion.x, explosion.y, explosion.radius * (0.36 + hotAlpha * 0.22), [
        [0, renderer.assetColor?.(coreColor, 0.95 * hotAlpha) || rgba(coreColor, 0.95 * hotAlpha)],
        [0.42, renderer.assetColor?.(effectColor, 0.58 * hotAlpha) || rgba(effectColor, 0.58 * hotAlpha)],
        [1, "rgba(0, 0, 0, 0)"]
      ]);
    }

    for (let i = 0; i < 5; i += 1) {
      const angle = i * 1.26 + explosion.x * 0.003 + explosion.y * 0.001;
      const wobble = Math.sin(age * 9 + i) * 0.07;
      const offset = explosion.radius * (0.08 + i * 0.018);
      const radius = explosion.radius * (0.42 + wobble + i * 0.025);
      radial(ctx, explosion.x + Math.cos(angle) * offset, explosion.y + Math.sin(angle) * offset, radius, [
        [0, renderer.assetColor?.(effectColor, 0.5 * lifeAlpha) || rgba(effectColor, 0.5 * lifeAlpha)],
        [0.55, renderer.assetColor?.(effectColor, 0.24 * lifeAlpha) || rgba(effectColor, 0.24 * lifeAlpha)],
        [1, "rgba(0, 0, 0, 0)"]
      ]);
    }

    if (smokeAlpha > 0.02) {
      for (let i = 0; i < 3; i += 1) {
        const angle = i * 2.1 + 0.4;
        const drift = explosion.radius * (0.16 + age * 0.12);
        radial(ctx, explosion.x + Math.cos(angle) * drift, explosion.y + Math.sin(angle) * drift - age * 14, explosion.radius * (0.48 + i * 0.08), [
          [0, `rgba(55, 50, 42, ${0.18 * smokeAlpha})`],
          [0.65, `rgba(45, 41, 35, ${0.12 * smokeAlpha})`],
          [1, "rgba(0, 0, 0, 0)"]
        ]);
      }
    }
  }

  const Renderer = IronLine.Renderer;
  if (!Renderer?.prototype) return;

  Renderer.prototype.drawExplosions = function drawLayeredExplosions(game) {
    const ctx = this.ctx;
    if (!ctx || !game?.effects?.explosions) return;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    for (const explosion of game.effects.explosions) {
      const lifeAlpha = clamp((explosion.life || 0) / Math.max(explosion.maxLife || 0.001, 0.001), 0, 1);
      const age = 1 - lifeAlpha;
      const style = this.assetStyle?.(explosion.smoke ? "combat.explosion.smoke" : "combat.explosion.core", {
        coreColor: explosion.smoke ? "rgba(45, 41, 35, 1)" : "rgba(255, 246, 198, 1)"
      }) || {};
      if (explosion.smoke) drawSmoke(ctx, this, explosion, lifeAlpha, age);
      else drawFireball(ctx, this, explosion, lifeAlpha, age, style);
    }
    ctx.restore();
  };
})(window);
