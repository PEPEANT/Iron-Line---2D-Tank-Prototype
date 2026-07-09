"use strict";

// 폭발 렌더 v2 — visual-overhaul-plan.md P3 (2026-07-06)
// 원계획(explosion-impact-plan.md ②) 복원: 섬광(가산합성) → 화구 → 연기.
// v1 문제: source-over 고정 + 낮은 알파라 어두운 지형에 묻혀 "작거나 안 보임".
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

  function drawSmoke(ctx, explosion, lifeAlpha, age, style = {}) {
    const base = style.smokeColor || explosion.color || "rgba(70, 66, 56, 0.58)";
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + age * 0.7;
      const drift = explosion.radius * (0.08 + i * 0.035 + age * 0.08);
      const radius = explosion.radius * (0.6 + i * 0.08);
      radial(ctx, explosion.x + Math.cos(angle) * drift, explosion.y + Math.sin(angle) * drift - age * 12, radius, [
        [0, rgba(base, 0.3 * lifeAlpha)],
        [0.62, rgba(base, 0.16 * lifeAlpha)],
        [1, "rgba(42, 38, 31, 0)"]
      ]);
    }
  }

  function drawFireball(ctx, explosion, lifeAlpha, age, style = {}) {
    const effectColor = style.effectColor || explosion.color || "rgba(255, 145, 58, 0.92)";
    const coreColor = style.coreColor || "rgba(255, 248, 205, 1)";
    const maxLife = Math.max(explosion.maxLife || 0.001, 0.001);
    const ageSec = age * maxLife;
    // 성장 중인 radius와 무관하게 화구가 즉시 크게 읽히도록 최대 반경 기준 병용
    const fullR = Math.max(explosion.radius || 6, (explosion.maxRadius || explosion.radius || 24) * 0.78);

    // ── 1) 가산합성 열 층: 섬광 + 백열 코어 ──
    ctx.globalCompositeOperation = "lighter";

    // 섬광 (기폭 직후 ~0.09s): 흰 코어 + 넓은 블룸
    const flashAlpha = clamp((0.09 - ageSec) / 0.09, 0, 1);
    if (flashAlpha > 0.02) {
      radial(ctx, explosion.x, explosion.y, fullR * (0.9 + ageSec * 10), [
        [0, `rgba(255, 252, 232, ${0.95 * flashAlpha})`],
        [0.35, `rgba(255, 226, 150, ${0.6 * flashAlpha})`],
        [1, "rgba(255, 180, 80, 0)"]
      ]);
      radial(ctx, explosion.x, explosion.y, fullR * 2.4, [
        [0, `rgba(255, 214, 130, ${0.32 * flashAlpha})`],
        [1, "rgba(255, 170, 70, 0)"]
      ]);
    }

    // 백열 코어 (~0.34s까지): 흰 → 노랑 → 주황
    const hotAlpha = clamp((0.34 - ageSec) / 0.34, 0, 1) * lifeAlpha;
    if (hotAlpha > 0.02) {
      radial(ctx, explosion.x, explosion.y, fullR * (0.55 + hotAlpha * 0.2), [
        [0, rgba(coreColor, 0.9 * hotAlpha)],
        [0.45, rgba(effectColor, 0.62 * hotAlpha)],
        [1, "rgba(0, 0, 0, 0)"]
      ]);
    }

    // ── 2) 불규칙 화염 덩어리 (source-over) ──
    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < 5; i += 1) {
      const angle = i * 1.26 + explosion.x * 0.003 + explosion.y * 0.001;
      const wobble = Math.sin(age * 9 + i) * 0.08;
      const offset = fullR * (0.1 + i * 0.03);
      const radius = fullR * (0.5 + wobble + i * 0.04);
      radial(ctx, explosion.x + Math.cos(angle) * offset, explosion.y + Math.sin(angle) * offset, radius, [
        [0, rgba(effectColor, 0.7 * lifeAlpha)],
        [0.55, rgba(effectColor, 0.34 * lifeAlpha)],
        [1, "rgba(0, 0, 0, 0)"]
      ]);
    }

    // ── 3) 후반 연기 전환 ──
    const smokeAlpha = clamp((ageSec - maxLife * 0.4) / Math.max(maxLife * 0.6, 0.01), 0, 1) * lifeAlpha;
    if (smokeAlpha > 0.02) {
      for (let i = 0; i < 3; i += 1) {
        const angle = i * 2.1 + 0.4;
        const drift = fullR * (0.18 + age * 0.14);
        radial(ctx, explosion.x + Math.cos(angle) * drift, explosion.y + Math.sin(angle) * drift - age * 16, fullR * (0.55 + i * 0.1), [
          [0, `rgba(55, 50, 42, ${0.24 * smokeAlpha})`],
          [0.65, `rgba(45, 41, 35, ${0.15 * smokeAlpha})`],
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
    for (const explosion of game.effects.explosions) {
      const lifeAlpha = clamp((explosion.life || 0) / Math.max(explosion.maxLife || 0.001, 0.001), 0, 1);
      const age = 1 - lifeAlpha;
      const style = this.assetStyle?.(explosion.smoke ? "combat.explosion.smoke" : "combat.explosion.core", {
        coreColor: explosion.smoke ? "rgba(45, 41, 35, 1)" : "rgba(255, 248, 205, 1)",
        effectColor: explosion.color || "rgba(255, 145, 58, 0.92)",
        smokeColor: explosion.color || "rgba(70, 66, 56, 0.58)"
      }) || {};
      if (explosion.smoke) {
        ctx.globalCompositeOperation = "source-over";
        drawSmoke(ctx, explosion, lifeAlpha, age, style);
      } else {
        drawFireball(ctx, explosion, lifeAlpha, age, style);
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  };
})(window);
