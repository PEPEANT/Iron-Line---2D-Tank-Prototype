"use strict";

// 지형 렌더 패스 v2 — visual-overhaul-plan.md P1 (2026-07-06)
// 목표: "모눈종이" 탈피 — 노이즈 질감(오프스크린 1회) + 그리드 톤다운 + 외곽 비네트.
// 성능 규칙: 프레임당 신규 그라디언트/캔버스 생성 금지 (월드 크기별 1회 캐시).
(function registerTerrainRenderer(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const Renderer = IronLine.Renderer;
  if (!Renderer?.prototype) return;

  const NOISE_TILE = 256;
  const GRID_ALPHA = 0.04;

  // 시드 고정 난수 — 세션 간 동일한 질감
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildNoiseTile() {
    const canvas = document.createElement("canvas");
    canvas.width = NOISE_TILE;
    canvas.height = NOISE_TILE;
    const ctx = canvas.getContext("2d");
    const rand = mulberry32(20260706);

    // 흙 얼룩 (넓고 옅게)
    for (let i = 0; i < 34; i += 1) {
      const x = rand() * NOISE_TILE;
      const y = rand() * NOISE_TILE;
      const rx = 10 + rand() * 26;
      const ry = rx * (0.45 + rand() * 0.5);
      ctx.fillStyle = `rgba(52, 44, 30, ${0.04 + rand() * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // 풀결 (짧은 방향성 스트로크)
    ctx.lineCap = "round";
    for (let i = 0; i < 110; i += 1) {
      const x = rand() * NOISE_TILE;
      const y = rand() * NOISE_TILE;
      const angle = -0.5 + rand() * 1;
      const len = 3 + rand() * 6;
      ctx.strokeStyle = `rgba(170, 205, 139, ${0.035 + rand() * 0.045})`;
      ctx.lineWidth = 0.8 + rand() * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    }

    // 어두운 알갱이
    for (let i = 0; i < 70; i += 1) {
      const x = rand() * NOISE_TILE;
      const y = rand() * NOISE_TILE;
      ctx.fillStyle = `rgba(10, 14, 10, ${0.05 + rand() * 0.06})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.7 + rand() * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 밝은 알갱이
    for (let i = 0; i < 40; i += 1) {
      const x = rand() * NOISE_TILE;
      const y = rand() * NOISE_TILE;
      ctx.fillStyle = `rgba(220, 232, 205, ${0.025 + rand() * 0.03})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.6 + rand() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    return canvas;
  }

  function terrainCache(renderer, world) {
    const key = `${world.width}x${world.height}`;
    if (renderer._terrainCache?.key === key) return renderer._terrainCache;

    const ctx = renderer.ctx;
    const terrainStyle = world.terrainStyle || {};
    const gradientStops = terrainStyle.gradient || ["#213922", "#263d26", "#1f3429"];
    const base = ctx.createLinearGradient(0, 0, world.width, world.height);
    base.addColorStop(0, gradientStops[0] || "#213922");
    base.addColorStop(0.48, gradientStops[1] || gradientStops[0] || "#263d26");
    base.addColorStop(1, gradientStops[2] || gradientStops[1] || "#1f3429");

    const pattern = ctx.createPattern(buildNoiseTile(), "repeat");

    // 외곽 비네트 (월드 가장자리 어둡게)
    const depth = Math.min(280, Math.max(120, Math.min(world.width, world.height) * 0.1));
    const shade = "rgba(4, 8, 5, 0.30)";
    const clear = "rgba(4, 8, 5, 0)";
    const top = ctx.createLinearGradient(0, 0, 0, depth);
    top.addColorStop(0, shade);
    top.addColorStop(1, clear);
    const bottom = ctx.createLinearGradient(0, world.height, 0, world.height - depth);
    bottom.addColorStop(0, shade);
    bottom.addColorStop(1, clear);
    const left = ctx.createLinearGradient(0, 0, depth, 0);
    left.addColorStop(0, shade);
    left.addColorStop(1, clear);
    const right = ctx.createLinearGradient(world.width, 0, world.width - depth, 0);
    right.addColorStop(0, shade);
    right.addColorStop(1, clear);

    renderer._terrainCache = { key, base, pattern, vignette: { top, bottom, left, right, depth } };
    return renderer._terrainCache;
  }

  Renderer.prototype.drawTerrain = function drawTerrainTextured(game) {
    const ctx = this.ctx;
    const world = game.world;
    const terrainStyle = world.terrainStyle || {};
    const cache = terrainCache(this, world);

    // 바닥 그라디언트 + 노이즈 질감
    ctx.fillStyle = cache.base;
    ctx.fillRect(0, 0, world.width, world.height);
    if (cache.pattern) {
      ctx.fillStyle = cache.pattern;
      ctx.fillRect(0, 0, world.width, world.height);
    }

    // 지형 패치 (기존 유지)
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

    // 그리드: 판독 보조 최소한만 (기존 0.14 → 0.04)
    ctx.save();
    ctx.globalAlpha = Math.min(terrainStyle.gridAlpha ?? GRID_ALPHA, GRID_ALPHA);
    ctx.strokeStyle = terrainStyle.gridColor || "#d9e5cf";
    ctx.lineWidth = 1;
    const gridSize = terrainStyle.gridSize || 120;
    for (let x = 0; x <= world.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, world.height);
      ctx.stroke();
    }
    for (let y = 0; y <= world.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(world.width, y);
      ctx.stroke();
    }
    ctx.restore();

    // 외곽 비네트
    const { top, bottom, left, right, depth } = cache.vignette;
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, world.width, depth);
    ctx.fillStyle = bottom;
    ctx.fillRect(0, world.height - depth, world.width, depth);
    ctx.fillStyle = left;
    ctx.fillRect(0, 0, depth, world.height);
    ctx.fillStyle = right;
    ctx.fillRect(world.width - depth, 0, depth, world.height);
  };
})(window);
