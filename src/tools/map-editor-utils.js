"use strict";

(function registerMapEditorUtils(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const math = IronLine.math || {};
  const clamp = math.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
  const distXY = math.distXY || ((x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2));

  function cloneRoads(roads) {
    return roads
      .map((road) => road.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) })))
      .filter((road) => road.length >= 2);
  }

  function collectRoadJunctions(roads) {
    const junctions = [];
    const seen = new Set();
    const add = (point) => {
      const key = `${Math.round(point.x / 8) * 8}:${Math.round(point.y / 8) * 8}`;
      if (seen.has(key)) return;
      seen.add(key);
      junctions.push({ x: point.x, y: point.y });
    };

    for (let roadA = 0; roadA < roads.length; roadA += 1) {
      for (let segmentA = 1; segmentA < roads[roadA].length; segmentA += 1) {
        const a = roads[roadA][segmentA - 1];
        const b = roads[roadA][segmentA];
        for (let roadB = roadA + 1; roadB < roads.length; roadB += 1) {
          for (let segmentB = 1; segmentB < roads[roadB].length; segmentB += 1) {
            const c = roads[roadB][segmentB - 1];
            const d = roads[roadB][segmentB];
            const point = segmentIntersectionPoint(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
            if (point) add(point);
          }
        }
      }
    }

    return junctions;
  }

  function expandRect(rect, amount) {
    return {
      x: rect.x - amount,
      y: rect.y - amount,
      w: rect.w + amount * 2,
      h: rect.h + amount * 2
    };
  }

  function segmentDistanceToPoint(ax, ay, bx, by, px, py) {
    return closestPointOnSegment(ax, ay, bx, by, px, py).distance;
  }

  function closestPointOnSegment(ax, ay, bx, by, px, py) {
    const abx = bx - ax;
    const aby = by - ay;
    const lengthSq = abx * abx + aby * aby;
    if (lengthSq === 0) {
      return { x: ax, y: ay, t: 0, distance: distXY(ax, ay, px, py) };
    }
    const t = clamp(((px - ax) * abx + (py - ay) * aby) / lengthSq, 0, 1);
    const x = ax + abx * t;
    const y = ay + aby * t;
    return { x, y, t, distance: distXY(x, y, px, py) };
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function segmentIntersectionPoint(ax, ay, bx, by, cx, cy, dx, dy) {
    const rx = bx - ax;
    const ry = by - ay;
    const sx = dx - cx;
    const sy = dy - cy;
    const denominator = rx * sy - ry * sx;
    if (Math.abs(denominator) < 0.0001) return null;
    const qpx = cx - ax;
    const qpy = cy - ay;
    const t = (qpx * sy - qpy * sx) / denominator;
    const u = (qpx * ry - qpy * rx) / denominator;
    if (t < -0.001 || t > 1.001 || u < -0.001 || u > 1.001) return null;
    return {
      x: ax + rx * clamp(t, 0, 1),
      y: ay + ry * clamp(t, 0, 1)
    };
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

  function pointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function rectIntersectsRect(a, b) {
    return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
  }

  function hexToRgba(hex, alpha) {
    const value = String(hex || "").trim().replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(value)) return `rgba(255, 255, 255, ${alpha})`;
    const number = Number.parseInt(value, 16);
    const r = (number >> 16) & 255;
    const g = (number >> 8) & 255;
    const b = number & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function drawWallObstaclePreview(ctx, obstacle, flags = {}) {
    const zoom = flags.zoom || 1;
    const baseWall = obstacle.kind === "base-wall";
    const horizontal = obstacle.w >= obstacle.h;
    const length = horizontal ? obstacle.w : obstacle.h;
    const segmentCount = Math.max(2, Math.floor(length / 82));
    const x = obstacle.x;
    const y = obstacle.y;
    const w = obstacle.w;
    const h = obstacle.h;

    ctx.fillStyle = flags.danger ? "rgba(255, 109, 102, 0.52)" : baseWall ? "rgba(92, 101, 94, 0.95)" : "rgba(103, 113, 104, 0.9)";
    ctx.strokeStyle = flags.selected ? "rgba(107, 188, 255, 0.95)" : flags.hovered ? "rgba(238, 243, 236, 0.5)" : flags.danger ? "rgba(255, 210, 175, 0.85)" : "rgba(238, 243, 236, 0.18)";
    ctx.lineWidth = flags.selected ? 5 / zoom : flags.danger ? 3 / zoom : flags.hovered ? 3 / zoom : 1.5 / zoom;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    ctx.strokeStyle = "rgba(13, 20, 17, 0.34)";
    ctx.lineWidth = 2 / zoom;
    for (let i = 1; i < segmentCount; i += 1) {
      const t = i / segmentCount;
      ctx.beginPath();
      if (horizontal) {
        const sx = x + w * t;
        ctx.moveTo(sx, y + 5 / zoom);
        ctx.lineTo(sx, y + h - 5 / zoom);
      } else {
        const sy = y + h * t;
        ctx.moveTo(x + 5 / zoom, sy);
        ctx.lineTo(x + w - 5 / zoom, sy);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = baseWall ? "rgba(130, 205, 190, 0.28)" : "rgba(235, 242, 230, 0.16)";
    ctx.lineWidth = 2 / zoom;
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(x + 8 / zoom, y + 7 / zoom);
      ctx.lineTo(x + w - 8 / zoom, y + 7 / zoom);
      ctx.moveTo(x + 8 / zoom, y + h - 7 / zoom);
      ctx.lineTo(x + w - 8 / zoom, y + h - 7 / zoom);
    } else {
      ctx.moveTo(x + 7 / zoom, y + 8 / zoom);
      ctx.lineTo(x + 7 / zoom, y + h - 8 / zoom);
      ctx.moveTo(x + w - 7 / zoom, y + 8 / zoom);
      ctx.lineTo(x + w - 7 / zoom, y + h - 8 / zoom);
    }
    ctx.stroke();

    if (!baseWall) return;
    const postCount = Math.max(2, Math.floor(length / 120));
    ctx.fillStyle = "rgba(31, 42, 36, 0.5)";
    for (let i = 0; i <= postCount; i += 1) {
      const t = i / postCount;
      if (horizontal) {
        const px = x + 14 + (w - 28) * t;
        ctx.fillRect(px - 3 / zoom, y + 4 / zoom, 6 / zoom, h - 8 / zoom);
      } else {
        const py = y + 14 + (h - 28) * t;
        ctx.fillRect(x + 4 / zoom, py - 3 / zoom, w - 8 / zoom, 6 / zoom);
      }
    }
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

  IronLine.mapEditorUtils = {
    cloneRoads,
    collectRoadJunctions,
    expandRect,
    segmentDistanceToPoint,
    closestPointOnSegment,
    roundedRect,
    segmentIntersectionPoint,
    lineIntersectsRect,
    pointInRect,
    rectIntersectsRect,
    hexToRgba,
    drawWallObstaclePreview,
    segmentIntersection
  };
})(window);
