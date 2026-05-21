"use strict";

(function registerRendererScenery(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { clamp, roundRect } = IronLine.math;
  const catalog = IronLine.sceneryCatalog || null;
  const proto = IronLine.Renderer?.prototype;
  if (!proto) return;

  Object.assign(proto, {
    drawObstacles(game) {
      for (const obstacle of game.world.obstacles) {
        if (obstacle.destroyed) {
          this.drawDestroyedScenery(obstacle);
        } else if (obstacle.kind === "building") this.drawBuildingObstacle(obstacle);
        else if (["tree", "brush", "rubble", "sandbag", "barricade", "wood-fence"].includes(obstacle.kind)) {
          this.drawObstacleAsScenery(obstacle);
        } else {
          this.drawWallObstacle(obstacle);
        }
      }
    },

    decorSeed(item) {
      const x = Math.round(Number(item.x) || 0);
      const y = Math.round(Number(item.y) || 0);
      return Math.abs((x * 92821 + y * 68917 + String(item.id || item.variant || item.type || "").length * 389) % 9973);
    },

    drawObstacleAsScenery(obstacle) {
      const type = obstacle.kind;
      const item = {
        ...obstacle,
        type,
        shape: type === "tree" || type === "brush" || type === "rubble" ? "circle" : "rect",
        x: type === "tree" || type === "brush" || type === "rubble" ? obstacle.x + obstacle.w * 0.5 : obstacle.x,
        y: type === "tree" || type === "brush" || type === "rubble" ? obstacle.y + obstacle.h * 0.5 : obstacle.y,
        r: Math.max(obstacle.w, obstacle.h) * 0.5,
        hp: obstacle.destructible ? 1 : 0,
        maxHp: obstacle.destructible ? 1 : 0
      };
      if (type === "tree") this.drawTreeScenery(item);
      else if (type === "brush") this.drawBrushScenery(item);
      else if (type === "rubble") this.drawRubbleScenery(item);
      else this.drawRectScenery(item);
    },

    drawBuildingObstacle(obstacle) {
      const ctx = this.ctx;
      const x = obstacle.x;
      const y = obstacle.y;
      const w = obstacle.w;
      const h = obstacle.h;
      const variant = obstacle.variant || catalog?.defaultVariant?.(obstacle.kind) || "warehouse";
      const palettes = {
        warehouse: ["#59655e", "#303a35", "#768079"],
        garage: ["#4d5954", "#2b3430", "#6e7770"],
        barracks: ["#5f655b", "#343a33", "#7f8378"],
        "service-block": ["#525d62", "#2c3538", "#738089"],
        depot: ["#5f5b4f", "#35332c", "#807969"],
        bunker: ["#4a514c", "#252c28", "#899289"],
        checkpoint: ["#5a6258", "#2e352f", "#d6b35a"]
      };
      const [roofA, roofB, trim] = palettes[variant] || palettes.warehouse;
      const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
      gradient.addColorStop(0, roofA);
      gradient.addColorStop(1, roofB);

      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      roundRect(ctx, x + 7, y + 8, w, h, 5);
      ctx.fill();

      ctx.fillStyle = gradient;
      ctx.strokeStyle = "rgba(238, 245, 235, 0.14)";
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, w, h, 5);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "rgba(20, 28, 25, 0.36)";
      ctx.lineWidth = 4;
      roundRect(ctx, x + 8, y + 8, Math.max(8, w - 16), Math.max(8, h - 16), 3);
      ctx.stroke();

      ctx.strokeStyle = "rgba(225, 232, 218, 0.12)";
      ctx.lineWidth = 2;
      const longAxis = w >= h;
      const seamCount = Math.max(1, Math.floor((longAxis ? w : h) / 105));
      for (let i = 1; i <= seamCount; i += 1) {
        const t = i / (seamCount + 1);
        ctx.beginPath();
        if (longAxis) {
          const sx = x + w * t;
          ctx.moveTo(sx, y + 10);
          ctx.lineTo(sx, y + h - 10);
        } else {
          const sy = y + h * t;
          ctx.moveTo(x + 10, sy);
          ctx.lineTo(x + w - 10, sy);
        }
        ctx.stroke();
      }

      const seed = this.decorSeed(obstacle);
      const ventCount = Math.max(1, Math.min(4, Math.floor((w + h) / 170)));
      for (let i = 0; i < ventCount; i += 1) {
        const px = x + 20 + ((seed + i * 67) % Math.max(28, Math.floor(w - 58)));
        const py = y + 18 + ((seed + i * 43) % Math.max(24, Math.floor(h - 50)));
        ctx.fillStyle = "rgba(21, 28, 26, 0.58)";
        roundRect(ctx, px, py, 28, 12, 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(238, 245, 235, 0.13)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 5, py + 4);
        ctx.lineTo(px + 23, py + 4);
        ctx.moveTo(px + 5, py + 8);
        ctx.lineTo(px + 23, py + 8);
        ctx.stroke();
      }

      if (variant === "garage" || variant === "depot" || variant === "checkpoint") {
        const doorW = Math.min(w - 28, Math.max(42, w * 0.34));
        const doorH = Math.min(h - 24, 28);
        ctx.fillStyle = "rgba(23, 29, 26, 0.42)";
        roundRect(ctx, x + w * 0.5 - doorW * 0.5, y + h - doorH - 8, doorW, doorH, 3);
        ctx.fill();
        ctx.strokeStyle = trim;
        ctx.globalAlpha = 0.34;
        for (let i = 0; i < 3; i += 1) {
          const gy = y + h - doorH + i * 7;
          ctx.beginPath();
          ctx.moveTo(x + w * 0.5 - doorW * 0.5 + 6, gy);
          ctx.lineTo(x + w * 0.5 + doorW * 0.5 - 6, gy);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = "rgba(255, 232, 148, 0.18)";
      if (variant === "barracks" && w > 90 && h > 80) {
        const windowCount = Math.max(2, Math.floor(w / 95));
        for (let i = 0; i < windowCount; i += 1) {
          roundRect(ctx, x + 22 + i * 58, y + 18, 24, 12, 2);
          ctx.fill();
        }
      }

      if (variant === "bunker") {
        ctx.fillStyle = "rgba(15, 22, 19, 0.62)";
        roundRect(ctx, x + w * 0.18, y + h * 0.42, w * 0.64, Math.max(12, h * 0.14), 3);
        ctx.fill();
        ctx.strokeStyle = "rgba(238, 245, 235, 0.12)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.restore();
    },

    drawWallObstacle(obstacle) {
      const ctx = this.ctx;
      const x = obstacle.x;
      const y = obstacle.y;
      const w = obstacle.w;
      const h = obstacle.h;
      const baseWall = obstacle.kind === "base-wall";
      const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
      gradient.addColorStop(0, baseWall ? "#8a9287" : "#737a70");
      gradient.addColorStop(0.46, baseWall ? "#626c63" : "#596158");
      gradient.addColorStop(1, baseWall ? "#424b45" : "#444d46");

      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      roundRect(ctx, x + 5, y + 6, w, h, 4);
      ctx.fill();
      ctx.fillStyle = gradient;
      ctx.strokeStyle = baseWall ? "rgba(130, 205, 190, 0.22)" : "rgba(238, 245, 235, 0.13)";
      ctx.lineWidth = baseWall ? 2.5 : 2;
      roundRect(ctx, x, y, w, h, 4);
      ctx.fill();
      ctx.stroke();

      const horizontal = w >= h;
      const length = horizontal ? w : h;
      const segmentCount = Math.max(2, Math.floor(length / 82));
      ctx.strokeStyle = "rgba(16, 24, 21, 0.32)";
      ctx.lineWidth = baseWall ? 2.4 : 2.8;
      for (let i = 1; i < segmentCount; i += 1) {
        const t = i / segmentCount;
        ctx.beginPath();
        if (horizontal) {
          const sx = x + w * t;
          ctx.moveTo(sx, y + 5);
          ctx.lineTo(sx, y + h - 5);
        } else {
          const sy = y + h * t;
          ctx.moveTo(x + 5, sy);
          ctx.lineTo(x + w - 5, sy);
        }
        ctx.stroke();
      }

      if (horizontal) {
        ctx.strokeStyle = "rgba(235, 242, 230, 0.16)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 7);
        ctx.lineTo(x + w - 8, y + 7);
        ctx.moveTo(x + 8, y + h - 7);
        ctx.lineTo(x + w - 8, y + h - 7);
        ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(235, 242, 230, 0.16)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 7, y + 8);
        ctx.lineTo(x + 7, y + h - 8);
        ctx.moveTo(x + w - 7, y + 8);
        ctx.lineTo(x + w - 7, y + h - 8);
        ctx.stroke();
      }

      if (baseWall) {
        const postCount = Math.max(2, Math.floor(length / 120));
        ctx.fillStyle = "rgba(31, 42, 36, 0.48)";
        ctx.strokeStyle = "rgba(207, 224, 210, 0.14)";
        ctx.lineWidth = 1.2;
        for (let i = 0; i <= postCount; i += 1) {
          const t = postCount === 0 ? 0 : i / postCount;
          if (horizontal) {
            const px = x + 14 + (w - 28) * t;
            roundRect(ctx, px - 3, y + 4, 6, h - 8, 2);
          } else {
            const py = y + 14 + (h - 28) * t;
            roundRect(ctx, x + 4, py - 3, w - 8, 6, 2);
          }
          ctx.fill();
          ctx.stroke();
        }

        ctx.strokeStyle = "rgba(210, 224, 214, 0.28)";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(x + 12, y + 5);
          ctx.lineTo(x + w - 12, y + 5);
          ctx.moveTo(x + 12, y + h - 5);
          ctx.lineTo(x + w - 12, y + h - 5);
        } else {
          ctx.moveTo(x + 5, y + 12);
          ctx.lineTo(x + 5, y + h - 12);
          ctx.moveTo(x + w - 5, y + 12);
          ctx.lineTo(x + w - 5, y + h - 12);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = "rgba(31, 39, 34, 0.24)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(x + 12, y + h * 0.5);
          ctx.lineTo(x + w - 12, y + h * 0.5);
        } else {
          ctx.moveTo(x + w * 0.5, y + 12);
          ctx.lineTo(x + w * 0.5, y + h - 12);
        }
        ctx.stroke();
      }
      ctx.restore();
    },

    drawScenery(game) {
      const scenery = game.world?.scenery || [];
      for (const item of scenery) {
        if (item.destroyed) {
          this.drawDestroyedScenery(item);
          continue;
        }
        if (item.type === "tree") this.drawTreeScenery(item);
        else if (item.type === "brush") this.drawBrushScenery(item);
        else if (item.type === "rubble") this.drawRubbleScenery(item);
        else if (item.type === "streetlight") this.drawStreetlightScenery(item);
        else if (item.type === "billboard") this.drawBillboardScenery(item);
        else if (item.type === "bench") this.drawBenchScenery(item);
        else this.drawRectScenery(item);
      }
    },

    drawTreeScenery(item) {
      const ctx = this.ctx;
      const r = item.r || 28;
      const seed = this.decorSeed(item);
      const damage = item.maxHp ? clamp(1 - (item.hp || 0) / item.maxHp, 0, 1) : 0;

      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      ctx.beginPath();
      ctx.ellipse(item.x + 8, item.y + 10, r * 0.95, r * 0.48, 0.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#4b3424";
      ctx.beginPath();
      ctx.arc(item.x, item.y, Math.max(7, r * 0.22), 0, Math.PI * 2);
      ctx.fill();

      const tones = ["#355f38", "#437146", "#294f33", "#507c48"];
      for (let i = 0; i < 5; i += 1) {
        const angle = (seed + i * 79) * 0.017;
        const ox = Math.cos(angle) * r * 0.26;
        const oy = Math.sin(angle) * r * 0.22;
        ctx.fillStyle = damage > 0.55 ? "#4e5639" : tones[i % tones.length];
        ctx.globalAlpha = 0.9 - damage * 0.32;
        ctx.beginPath();
        ctx.arc(item.x + ox, item.y + oy, r * (0.54 + (i % 2) * 0.08), 0, Math.PI * 2);
        ctx.fill();
      }

      if (item.damageFlash > 0) {
        ctx.globalAlpha = clamp(item.damageFlash, 0, 0.65);
        ctx.fillStyle = "#ffd166";
        ctx.beginPath();
        ctx.arc(item.x, item.y, r * 0.85, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    drawBrushScenery(item) {
      const ctx = this.ctx;
      const r = item.r || 95;
      const seed = this.decorSeed(item);
      const damage = item.maxHp ? clamp(1 - (item.hp || 0) / item.maxHp, 0, 1) : 0;
      const isTallGrass = item.variant === "tall-grass";
      const canopy = damage > 0.58
        ? ["#59603d", "#4f5638", "#6a6540"]
        : isTallGrass
          ? ["#527342", "#3e653e", "#6f8549"]
          : ["#426c3f", "#315839", "#557744"];

      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      ctx.beginPath();
      ctx.ellipse(item.x + 8, item.y + 10, r * 0.92, r * 0.46, -0.08, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.78 - damage * 0.22;
      for (let i = 0; i < 9; i += 1) {
        const angle = (seed + i * 59) * 0.025;
        const dist = r * (0.08 + ((seed + i * 19) % 42) / 100);
        const rx = r * (0.32 + (i % 3) * 0.07);
        const ry = r * (isTallGrass ? 0.22 : 0.26) * (0.82 + (i % 2) * 0.18);
        ctx.fillStyle = canopy[i % canopy.length];
        ctx.beginPath();
        ctx.ellipse(
          item.x + Math.cos(angle) * dist,
          item.y + Math.sin(angle) * dist * 0.72,
          rx,
          ry,
          angle * 0.38,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      ctx.globalAlpha = 0.48 - damage * 0.12;
      ctx.strokeStyle = isTallGrass ? "#8aa05a" : "#6f8b55";
      ctx.lineWidth = Math.max(2, r * 0.018);
      ctx.lineCap = "round";
      for (let i = 0; i < 22; i += 1) {
        const angle = (seed + i * 41) * 0.033;
        const dist = r * (0.2 + ((seed + i * 31) % 72) / 100);
        const x = item.x + Math.cos(angle) * dist * 0.72;
        const y = item.y + Math.sin(angle) * dist * 0.42;
        const lean = angle + (i % 2 ? -0.62 : 0.62);
        const length = r * (0.16 + (i % 4) * 0.018);
        ctx.beginPath();
        ctx.moveTo(x, y + length * 0.36);
        ctx.quadraticCurveTo(
          x + Math.cos(lean) * length * 0.35,
          y - length * 0.42,
          x + Math.cos(lean) * length * 0.78,
          y - length
        );
        ctx.stroke();
      }

      ctx.globalAlpha = 0.42 - damage * 0.14;
      for (let i = 0; i < 14; i += 1) {
        const angle = (seed + i * 67) * 0.029;
        const dist = r * (0.48 + ((seed + i * 11) % 35) / 100);
        ctx.fillStyle = i % 2 ? "#789151" : "#486e3e";
        ctx.beginPath();
        ctx.ellipse(
          item.x + Math.cos(angle) * dist,
          item.y + Math.sin(angle) * dist * 0.52,
          r * 0.11,
          r * 0.045,
          angle,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      if (item.damageFlash > 0) {
        ctx.globalAlpha = clamp(item.damageFlash, 0, 0.62);
        ctx.fillStyle = "#ffd166";
        ctx.beginPath();
        ctx.ellipse(item.x, item.y, r * 0.82, r * 0.44, -0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    drawStreetlightScenery(item) {
      const ctx = this.ctx;
      const x = item.x;
      const y = item.y;
      const w = item.w || 28;
      const h = item.h || 98;
      const damage = item.maxHp ? clamp(1 - (item.hp || 0) / item.maxHp, 0, 1) : 0;

      ctx.save();
      ctx.translate(x + w * 0.5, y + h * 0.5);
      ctx.rotate(item.angle || 0);
      ctx.translate(-w * 0.5, -h * 0.5);

      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      ctx.beginPath();
      ctx.ellipse(w * 0.62, h * 0.55, w * 0.95, h * 0.12, 0.18, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = damage > 0.55 ? "#6d706b" : "#9aa29b";
      ctx.lineWidth = Math.max(3, w * 0.17);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.9);
      ctx.lineTo(w * 0.5, h * 0.22);
      ctx.lineTo(w * 0.76, h * 0.15);
      ctx.stroke();

      ctx.fillStyle = damage > 0.55 ? "#6f6b54" : "#f1d36f";
      ctx.strokeStyle = "rgba(30, 35, 32, 0.58)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(w * 0.82, h * 0.14, w * 0.32, h * 0.09, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#6f7771";
      roundRect(ctx, w * 0.22, h * 0.86, w * 0.58, h * 0.11, 3);
      ctx.fill();

      if (item.damageFlash > 0) {
        ctx.globalAlpha = clamp(item.damageFlash, 0, 0.66);
        ctx.fillStyle = "#ffd166";
        roundRect(ctx, 0, 0, w, h, 5);
        ctx.fill();
      }
      ctx.restore();
    },

    drawBillboardScenery(item) {
      const ctx = this.ctx;
      const x = item.x;
      const y = item.y;
      const w = item.w || 150;
      const h = item.h || 64;
      const damage = item.maxHp ? clamp(1 - (item.hp || 0) / item.maxHp, 0, 1) : 0;

      ctx.save();
      ctx.translate(x + w * 0.5, y + h * 0.5);
      ctx.rotate(item.angle || 0);
      ctx.translate(-w * 0.5, -h * 0.5);

      ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
      roundRect(ctx, 7, 8, w, h, 5);
      ctx.fill();

      ctx.fillStyle = damage > 0.55 ? "#5b5d55" : "#243933";
      ctx.strokeStyle = "rgba(220, 230, 210, 0.28)";
      ctx.lineWidth = 3;
      roundRect(ctx, 0, 0, w, h * 0.72, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = damage > 0.55 ? "#9b8d61" : "#d5b24a";
      roundRect(ctx, w * 0.08, h * 0.16, w * 0.34, h * 0.13, 3);
      ctx.fill();
      ctx.fillStyle = damage > 0.55 ? "#7f897a" : "#9fc3a4";
      roundRect(ctx, w * 0.08, h * 0.38, w * 0.72, h * 0.09, 3);
      ctx.fill();
      roundRect(ctx, w * 0.08, h * 0.54, w * 0.5, h * 0.08, 3);
      ctx.fill();

      ctx.strokeStyle = damage > 0.55 ? "#5f5a45" : "#8e7751";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(w * 0.25, h * 0.72);
      ctx.lineTo(w * 0.25, h);
      ctx.moveTo(w * 0.75, h * 0.72);
      ctx.lineTo(w * 0.75, h);
      ctx.stroke();

      if (item.damageFlash > 0) {
        ctx.globalAlpha = clamp(item.damageFlash, 0, 0.66);
        ctx.fillStyle = "#ffd166";
        roundRect(ctx, 0, 0, w, h, 5);
        ctx.fill();
      }
      ctx.restore();
    },

    drawBenchScenery(item) {
      const ctx = this.ctx;
      const x = item.x;
      const y = item.y;
      const w = item.w || 96;
      const h = item.h || 34;
      const damage = item.maxHp ? clamp(1 - (item.hp || 0) / item.maxHp, 0, 1) : 0;

      ctx.save();
      ctx.translate(x + w * 0.5, y + h * 0.5);
      ctx.rotate(item.angle || 0);
      ctx.translate(-w * 0.5, -h * 0.5);

      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      roundRect(ctx, 5, 5, w, h, 5);
      ctx.fill();

      const wood = damage > 0.55 ? "#6d6047" : "#9a7042";
      const edge = damage > 0.55 ? "#463f34" : "#51351f";
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i += 1) {
        ctx.fillStyle = i === 1 ? "#b1844e" : wood;
        roundRect(ctx, 0, 3 + i * (h * 0.24), w, h * 0.16, 4);
        ctx.fill();
        ctx.stroke();
      }

      ctx.strokeStyle = damage > 0.55 ? "#606861" : "#8b928c";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w * 0.18, h * 0.74);
      ctx.lineTo(w * 0.12, h);
      ctx.moveTo(w * 0.82, h * 0.74);
      ctx.lineTo(w * 0.88, h);
      ctx.stroke();

      if (item.damageFlash > 0) {
        ctx.globalAlpha = clamp(item.damageFlash, 0, 0.66);
        ctx.fillStyle = "#ffd166";
        roundRect(ctx, 0, 0, w, h, 5);
        ctx.fill();
      }
      ctx.restore();
    },

    drawRectScenery(item) {
      const ctx = this.ctx;
      const x = item.x;
      const y = item.y;
      const w = item.w || 80;
      const h = item.h || 24;
      const damage = item.maxHp ? clamp(1 - (item.hp || 0) / item.maxHp, 0, 1) : 0;

      ctx.save();
      ctx.translate(x + w * 0.5, y + h * 0.5);
      ctx.rotate(item.angle || 0);
      ctx.translate(-w * 0.5, -h * 0.5);
      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      roundRect(ctx, 4, 5, w, h, 4);
      ctx.fill();

      if (item.type === "sandbag") {
        const bagCount = Math.max(3, Math.floor(w / 34));
        for (let i = 0; i < bagCount; i += 1) {
          const bw = w / bagCount + 2;
          ctx.fillStyle = damage > 0.55 ? "#796b4a" : i % 2 ? "#97875d" : "#a19264";
          roundRect(ctx, i * (w / bagCount), 0, bw, h, 7);
          ctx.fill();
          ctx.strokeStyle = "rgba(52, 43, 29, 0.28)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      } else if (item.type === "barricade") {
        const count = Math.max(3, Math.floor(w / 42));
        for (let i = 0; i < count; i += 1) {
          const cx = (i + 0.5) * (w / count);
          ctx.fillStyle = item.variant === "dragon-teeth" ? "#8d948b" : "#74766f";
          ctx.strokeStyle = "rgba(25, 29, 24, 0.46)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx, 2);
          ctx.lineTo(cx + 16, h - 3);
          ctx.lineTo(cx - 16, h - 3);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          if (item.variant === "steel-hedgehog") {
            ctx.beginPath();
            ctx.moveTo(cx - 20, h * 0.5);
            ctx.lineTo(cx + 20, h * 0.5);
            ctx.moveTo(cx, 3);
            ctx.lineTo(cx, h - 3);
            ctx.stroke();
          }
        }
      } else {
        ctx.fillStyle = item.type === "wood-fence" ? "#8b6a44" : "#76593a";
        roundRect(ctx, 0, 0, w, h, 3);
        ctx.fill();
        ctx.strokeStyle = "rgba(34, 24, 14, 0.42)";
        ctx.lineWidth = 3;
        for (let i = 8; i < w; i += 28) {
          ctx.beginPath();
          ctx.moveTo(i, 3);
          ctx.lineTo(i - 10, h - 3);
          ctx.stroke();
        }
      }

      if (item.damageFlash > 0) {
        ctx.globalAlpha = clamp(item.damageFlash, 0, 0.7);
        ctx.fillStyle = "#ffd166";
        roundRect(ctx, 0, 0, w, h, 4);
        ctx.fill();
      }
      ctx.restore();
    },

    drawRubbleScenery(item) {
      const ctx = this.ctx;
      const r = item.r || 60;
      const seed = this.decorSeed(item);
      ctx.save();
      ctx.globalAlpha = 0.58;
      for (let i = 0; i < 14; i += 1) {
        const angle = (seed + i * 61) * 0.027;
        const dist = r * (((seed + i * 17) % 100) / 100);
        ctx.fillStyle = i % 2 ? "#5c6057" : "#454b45";
        ctx.beginPath();
        ctx.ellipse(
          item.x + Math.cos(angle) * dist,
          item.y + Math.sin(angle) * dist,
          7 + (i % 3) * 4,
          4 + (i % 2) * 3,
          angle,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      ctx.restore();
    },

    drawDestroyedScenery(item) {
      const ctx = this.ctx;
      const hasRectSize = Number.isFinite(item.w) || Number.isFinite(item.h);
      const centerX = hasRectSize ? item.x + (item.w || 0) * 0.5 : item.x;
      const centerY = hasRectSize ? item.y + (item.h || 0) * 0.5 : item.y;
      const r = item.r || Math.max(item.w || 40, item.h || 24) * 0.45;
      const duration = item.destroyDuration || 0.58;
      const progress = item.destroyTimer === undefined ? 1 : clamp(item.destroyTimer / Math.max(duration, 0.001), 0, 1);
      const ease = 1 - Math.pow(1 - progress, 2);
      const force = clamp(item.breakForce || 1, 0.75, 2.15);
      const breakAngle = item.breakAngle ?? item.angle ?? 0;
      const type = item.type || item.kind;
      const seed = this.decorSeed(item);
      ctx.save();
      ctx.globalAlpha = 0.34 + ease * 0.1;
      ctx.fillStyle = "rgba(35, 31, 24, 0.6)";
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, r * (0.78 + ease * 0.22), r * (0.36 + ease * 0.08), item.angle || breakAngle, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 10; i += 1) {
        const angle = (seed + i * 37) * 0.04;
        const baseDist = r * 0.46 * (((seed + i * 23) % 100) / 100);
        const burst = r * ease * force * (0.32 + ((seed + i * 17) % 100) / 160);
        const forwardBias = Math.max(0, Math.cos(angle - breakAngle)) * r * 0.18 * ease * force;
        const dist = baseDist + burst + forwardBias;
        ctx.fillStyle = type === "tree" || type === "brush"
          ? (i % 2 ? "#5d5131" : "#2f3f2c")
          : ["streetlight", "billboard"].includes(type)
            ? (i % 2 ? "#777b75" : "#4d5550")
            : (i % 2 ? "#5c513b" : "#3f3a31");
        ctx.beginPath();
        ctx.arc(
          centerX + Math.cos(angle) * dist,
          centerY + Math.sin(angle) * dist,
          3 + (i % 3) * 2,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      if (progress < 0.9) {
        const alpha = (1 - progress / 0.9) * 0.52;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2;
        ctx.strokeStyle = type === "tree" || type === "brush" || type === "wood-fence" || type === "bench"
          ? "rgba(142, 103, 54, 0.82)"
          : "rgba(214, 178, 110, 0.72)";
        for (let i = 0; i < 7; i += 1) {
          const angle = breakAngle + ((seed + i * 29) % 120 - 60) * 0.018;
          const start = r * (0.16 + i * 0.015);
          const end = r * (0.62 + ease * force * (0.42 + i * 0.035));
          ctx.beginPath();
          ctx.moveTo(centerX + Math.cos(angle) * start, centerY + Math.sin(angle) * start);
          ctx.lineTo(centerX + Math.cos(angle) * end, centerY + Math.sin(angle) * end);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  });
})(window);
