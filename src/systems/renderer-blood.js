"use strict";

// Ground blood renderer. This stays intentionally simple so large battles do not
// pay for fluid simulation: organic variation comes from layered decals.
(function registerRendererBlood(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const proto = IronLine.Renderer?.prototype;
  if (!proto || typeof proto.drawScorchMarks !== "function") return;

  function bloodColor(age, alpha) {
    const spec = IronLine.blood || {};
    const fresh = spec.FRESH || { r: 176, g: 32, b: 32 };
    const dried = spec.DRIED || { r: 110, g: 26, b: 22 };
    const drySeconds = spec.DRY_SECONDS || 20;
    const t = Math.min(1, Math.max(0, age / drySeconds));
    const r = Math.round(fresh.r + (dried.r - fresh.r) * t);
    const g = Math.round(fresh.g + (dried.g - fresh.g) * t);
    const b = Math.round(fresh.b + (dried.b - fresh.b) * t);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function drawPool(ctx, pool, state) {
    const radius = IronLine.blood?.poolRadius ? IronLine.blood.poolRadius(pool, state.time) : pool.max;
    const age = state.time - pool.born;
    const dried = Math.min(1, Math.max(0, (age - pool.grow) / 20));
    ctx.fillStyle = bloodColor(age > pool.grow ? age - pool.grow : 0, 0.85 - dried * 0.15);
    ctx.beginPath();
    ctx.ellipse(pool.x, pool.y, radius, radius * 0.82, pool.seed * Math.PI, 0, Math.PI * 2);
    ctx.fill();

    const lobeA = pool.seed * Math.PI * 2;
    const lobeB = lobeA + 2.4;
    ctx.beginPath();
    ctx.arc(pool.x + Math.cos(lobeA) * radius * 0.8, pool.y + Math.sin(lobeA) * radius * 0.66, radius * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pool.x + Math.cos(lobeB) * radius * 0.85, pool.y + Math.sin(lobeB) * radius * 0.7, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSmear(ctx, decal, age) {
    const isDrag = decal.kind === "drag";
    ctx.fillStyle = bloodColor(age, isDrag ? 0.72 : 0.58);
    ctx.beginPath();
    ctx.ellipse(
      decal.x + Math.cos(decal.angle) * decal.len * 0.5,
      decal.y + Math.sin(decal.angle) * decal.len * 0.5,
      decal.len * 0.5,
      decal.size,
      decal.angle,
      0,
      Math.PI * 2
    );
    ctx.fill();

    if (isDrag) {
      ctx.fillStyle = bloodColor(age, 0.42);
      const side = decal.seed > 0.5 ? 1 : -1;
      const nx = Math.cos(decal.angle + Math.PI * 0.5) * side;
      const ny = Math.sin(decal.angle + Math.PI * 0.5) * side;
      ctx.beginPath();
      ctx.ellipse(
        decal.x + Math.cos(decal.angle) * decal.len * 0.36 + nx * decal.size * 1.2,
        decal.y + Math.sin(decal.angle) * decal.len * 0.36 + ny * decal.size * 1.2,
        decal.len * 0.34,
        decal.size * 0.55,
        decal.angle + (decal.seed - 0.5) * 0.14,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  function drawFlow(ctx, decal, age) {
    ctx.fillStyle = bloodColor(age, 0.72);
    const len = decal.len || decal.size * 4;
    const size = decal.size || 1.2;
    ctx.beginPath();
    ctx.ellipse(
      decal.x + Math.cos(decal.angle) * len * 0.5,
      decal.y + Math.sin(decal.angle) * len * 0.5,
      len * 0.5,
      size * 0.55,
      decal.angle,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.beginPath();
    ctx.arc(
      decal.x + Math.cos(decal.angle) * len,
      decal.y + Math.sin(decal.angle) * len,
      size * (0.72 + decal.seed * 0.42),
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  function drawSplatter(ctx, decal, age) {
    ctx.fillStyle = bloodColor(age, 0.74);
    ctx.beginPath();
    ctx.ellipse(decal.x, decal.y, decal.size, decal.size * 0.42, decal.angle, 0, Math.PI * 2);
    ctx.fill();
    const satX = decal.x + Math.cos(decal.angle) * decal.size * (1.3 + decal.seed * 0.8);
    const satY = decal.y + Math.sin(decal.angle) * decal.size * (1.3 + decal.seed * 0.8);
    ctx.beginPath();
    ctx.arc(satX, satY, decal.size * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDroplet(ctx, decal, age) {
    ctx.fillStyle = bloodColor(age, 0.76);
    const rot = decal.angle + (decal.seed - 0.5) * 1.2;
    const rx = decal.size * (0.9 + decal.seed * 0.45);
    const ry = decal.size * (0.45 + (1 - decal.seed) * 0.28);
    ctx.beginPath();
    ctx.ellipse(decal.x, decal.y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
    if (decal.seed > 0.68 && decal.size > 1.25) {
      ctx.beginPath();
      ctx.ellipse(
        decal.x + Math.cos(decal.seed * 12.9) * decal.size * 1.5,
        decal.y + Math.sin(decal.seed * 12.9) * decal.size * 1.5,
        decal.size * 0.45,
        decal.size * 0.24,
        rot + 0.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  function drawBlood(renderer, game) {
    if (IronLine.blood?.isBloodEnabled && !IronLine.blood.isBloodEnabled()) return;
    const state = game?.effects?.blood;
    if (!state) return;
    const pools = state.pools || [];
    const decals = state.decals || [];
    const particles = state.particles || [];
    if (decals.length === 0 && particles.length === 0 && pools.length === 0) return;
    const ctx = renderer.ctx;

    for (const pool of pools) drawPool(ctx, pool, state);

    for (const decal of decals) {
      const age = state.time - decal.born;
      if (decal.kind === "drag" || decal.kind === "smear") {
        drawSmear(ctx, decal, age);
      } else if (decal.kind === "flow") {
        drawFlow(ctx, decal, age);
      } else if (decal.kind === "splatter") {
        drawSplatter(ctx, decal, age);
      } else {
        drawDroplet(ctx, decal, age);
      }
    }

    if (particles.length > 0) {
      ctx.fillStyle = bloodColor(0, 0.85);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y - p.z, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const baseDrawScorchMarks = proto.drawScorchMarks;
  proto.drawScorchMarks = function drawScorchMarksWithBlood(game) {
    baseDrawScorchMarks.call(this, game);
    drawBlood(this, game);
  };
})(window);
