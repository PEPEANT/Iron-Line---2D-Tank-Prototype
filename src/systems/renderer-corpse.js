"use strict";

(function registerRendererCorpse(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { clamp, lerp, roundRect } = IronLine.math || {};
  const proto = IronLine.Renderer?.prototype;
  if (!proto) return;

  function alphaClamp(value, min = 0, max = 1) {
    return clamp ? clamp(value, min, max) : Math.max(min, Math.min(max, value));
  }

  proto.drawInfantryCorpse = function drawInfantryCorpse(unit, options = {}) {
    const ctx = this.ctx;
    const now = typeof performance !== "undefined" ? performance.now() / 1000 : 0;
    const age = unit.deathTime ? Math.max(0, now - unit.deathTime) : 1;
    const fall = alphaClamp(age / 0.32, 0, 1);
    const wounded = Boolean(options.wounded || unit.wounded || unit.downed);
    const poseAngle = unit.deathPoseAngle || unit.angle + Math.PI / 2;
    const angle = lerp ? lerp(unit.angle || 0, poseAngle, fall) : poseAngle;
    const radius = unit.radius || 10;
    const style = this.assetStyle?.("unit.death-pose", {
      blueBody: "#476c7e",
      redBody: "#76504e",
      deadBody: "#4d554d",
      woundedRing: "rgba(255, 209, 102, 0.74)",
      blood: "rgba(105, 34, 31, 0.46)"
    }) || {};
    const bodyColor = wounded
      ? (unit.team === IronLine.constants?.TEAM?.BLUE ? style.blueBody : style.redBody)
      : (style.deadBody || "#4d554d");
    const alpha = wounded ? 0.92 : 0.72;

    ctx.save();
    ctx.translate(unit.x, unit.y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;

    ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
    ctx.beginPath();
    ctx.ellipse(-1, 5, 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = style.blood || "rgba(105, 34, 31, 0.46)";
    ctx.globalAlpha = wounded ? 0.18 : 0.36;
    ctx.beginPath();
    ctx.ellipse(-5, 8, 12, 5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = bodyColor;
    roundRect(ctx, -radius * 1.18, -radius * 0.5, radius * 2.08, radius * 1.0, 5);
    ctx.fill();

    ctx.strokeStyle = wounded ? "rgba(255, 209, 102, 0.52)" : "rgba(24, 30, 26, 0.48)";
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.42, -radius * 0.35);
    ctx.lineTo(radius * 0.35, -radius * 0.92);
    ctx.moveTo(-radius * 0.3, radius * 0.36);
    ctx.lineTo(radius * 0.48, radius * 0.95);
    ctx.stroke();

    ctx.fillStyle = wounded ? "#aeb8aa" : "#858d80";
    ctx.beginPath();
    ctx.arc(radius * 1.03, 0, Math.max(3.4, radius * 0.32), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = wounded ? "#25302a" : "#20261f";
    roundRect(ctx, -radius * 1.48, -radius * 0.22, radius * 0.48, radius * 0.44, 2);
    ctx.fill();

    ctx.fillStyle = "#252b25";
    roundRect(ctx, radius * 0.02, -2, radius * 1.22, 4, 2);
    ctx.fill();
    ctx.restore();

    if (wounded) {
      const pulse = 0.74 + Math.sin(now * 5.2) * 0.12;
      ctx.save();
      ctx.globalAlpha = alphaClamp(pulse, 0.42, 0.86);
      ctx.strokeStyle = style.woundedRing || "rgba(255, 209, 102, 0.74)";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 7]);
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, radius + 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
