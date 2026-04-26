"use strict";

(function registerMath(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function approach(value, target, amount) {
    if (value < target) return Math.min(target, value + amount);
    return Math.max(target, value - amount);
  }

  function distXY(x1, y1, x2, y2) {
    return Math.hypot(x1 - x2, y1 - y2);
  }

  function angleTo(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
  }

  function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  function rotateTowards(current, target, maxStep) {
    const diff = normalizeAngle(target - current);
    if (Math.abs(diff) <= maxStep) return target;
    return current + Math.sign(diff) * maxStep;
  }

  function pointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function circleRectCollision(x, y, radius, rect) {
    const nearestX = clamp(x, rect.x, rect.x + rect.w);
    const nearestY = clamp(y, rect.y, rect.y + rect.h);
    return distXY(x, y, nearestX, nearestY) < radius;
  }

  function expandedRect(rect, amount) {
    return {
      x: rect.x - amount,
      y: rect.y - amount,
      w: rect.w + amount * 2,
      h: rect.h + amount * 2
    };
  }

  function segmentIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
    const rx = bx - ax;
    const ry = by - ay;
    const sx = dx - cx;
    const sy = dy - cy;
    const denominator = rx * sy - ry * sx;
    if (Math.abs(denominator) < 0.0001) return false;
    const qpx = cx - ax;
    const qpy = cy - ay;
    const t = (qpx * sy - qpy * sx) / denominator;
    const u = (qpx * ry - qpy * rx) / denominator;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  function lineIntersectsRect(x1, y1, x2, y2, rect) {
    if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) return true;
    const left = rect.x;
    const right = rect.x + rect.w;
    const top = rect.y;
    const bottom = rect.y + rect.h;
    return (
      segmentIntersection(x1, y1, x2, y2, left, top, right, top) ||
      segmentIntersection(x1, y1, x2, y2, right, top, right, bottom) ||
      segmentIntersection(x1, y1, x2, y2, right, bottom, left, bottom) ||
      segmentIntersection(x1, y1, x2, y2, left, bottom, left, top)
    );
  }

  function segmentDistanceToPoint(ax, ay, bx, by, px, py) {
    const abx = bx - ax;
    const aby = by - ay;
    const lengthSq = abx * abx + aby * aby;
    if (lengthSq === 0) return distXY(ax, ay, px, py);
    const t = clamp(((px - ax) * abx + (py - ay) * aby) / lengthSq, 0, 1);
    return distXY(ax + abx * t, ay + aby * t, px, py);
  }

  function roundRect(context, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + w - radius, y);
    context.quadraticCurveTo(x + w, y, x + w, y + radius);
    context.lineTo(x + w, y + h - radius);
    context.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    context.lineTo(x + radius, y + h);
    context.quadraticCurveTo(x, y + h, x, y + h - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
  }

  function hexToRgba(hex, alpha) {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  IronLine.math = {
    clamp,
    lerp,
    approach,
    distXY,
    angleTo,
    normalizeAngle,
    rotateTowards,
    pointInRect,
    circleRectCollision,
    expandedRect,
    lineIntersectsRect,
    segmentDistanceToPoint,
    roundRect,
    hexToRgba
  };
})(window);
