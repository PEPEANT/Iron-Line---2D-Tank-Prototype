"use strict";

(function registerRenderer(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, TEAM_COLORS, AMMO, INFANTRY_WEAPONS } = IronLine.constants;
  const { clamp, lerp, distXY, angleTo, normalizeAngle, roundRect, hexToRgba, lineIntersectsRect } = IronLine.math;

  class Renderer {
    constructor(canvas, camera) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.camera = camera;
      this.remoteHumanStates = new Map();
      this.resize();
    }

    viewportSize() {
      if (!document.body?.classList.contains("admin-standalone-page") || window.innerWidth <= 760) {
        return { width: window.innerWidth, height: window.innerHeight };
      }

      const panel = document.getElementById("adminPanel");
      const rect = panel?.getBoundingClientRect?.();
      const panelWidth = rect?.width || Math.min(520, Math.max(420, window.innerWidth * 0.36));
      const reserved = panelWidth + 28;
      return {
        width: Math.max(320, window.innerWidth - reserved),
        height: window.innerHeight
      };
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      const viewport = this.viewportSize();
      this.camera.width = viewport.width;
      this.camera.height = viewport.height;
      this.camera.zoom = this.camera.zoom || 1;
      this.camera.viewWidth = this.camera.width / this.camera.zoom;
      this.camera.viewHeight = this.camera.height / this.camera.zoom;
      this.canvas.width = Math.floor(this.camera.width * dpr);
      this.canvas.height = Math.floor(this.camera.height * dpr);
      this.canvas.style.width = `${this.camera.width}px`;
      this.canvas.style.height = `${this.camera.height}px`;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    draw(game) {
      const ctx = this.ctx;
      const camera = this.camera;
      ctx.clearRect(0, 0, camera.width, camera.height);
      ctx.save();
      const shake = game.screenShake || 0;
      if (shake > 0.05) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      }
      ctx.scale(camera.zoom || 1, camera.zoom || 1);
      ctx.translate(-camera.x, -camera.y);

      this.drawTerrain(game);
      this.drawSafeZones(game);
      this.drawCapturePoints(game);
      this.drawScorchMarks(game);
      this.drawObstacles(game);
      this.drawScenery(game);
      this.drawDustPuffs(game);
      this.drawTrackScuffs(game);

      for (const humvee of game.humvees || []) this.drawHumvee(game, humvee);
      for (const tank of game.tanks) this.drawTank(game, tank);
      this.drawGunSmokePuffs(game);
      this.drawMuzzleFlashes(game);
      if (!game.adminObserverMode) this.drawPlayerTankAim(game);
      for (const unit of game.infantry || []) this.drawInfantryUnit(game, unit);
      for (const crew of game.crews || []) this.drawCrewMember(game, crew);
      if (!game.adminObserverMode && !game.player.inTank && game.player.hp > 0) this.drawInfantry(game, game.player, { color: "#b6dcff" });
      else if (!game.adminObserverMode && !game.player.inTank && (game.playerDowned || game.playerDeathActive)) this.drawInfantryCorpse(game.player);
      this.drawRemoteHumanPlayers(game);
      if (!game.adminObserverMode) this.drawPlayerInfantryAim(game);
      for (const drone of game.drones || []) this.drawReconDrone(game, drone);
      this.drawCommandHighlights(game);

      this.drawProjectiles(game);
      this.drawTracers(game);
      this.drawExplosions(game);
      this.drawBlastSparks(game);
      this.drawBlastRings(game);
      this.drawSmoke(game);
      if (!game.adminObserverMode) this.drawPlayerHitConfirmations(game);
      this.drawDebugOverlay(game);
      this.drawChatBubbles(game);

      ctx.restore();
      game.perfMonitor?.begin("render.minimap");
      this.drawMinimap(game);
      game.perfMonitor?.end("render.minimap");
      game.perfMonitor?.begin("render.tactical");
      this.drawTacticalMapOverlay?.(game);
      game.perfMonitor?.end("render.tactical");
      game.perfMonitor?.begin("render.canvasHud");
      if (!game.adminObserverMode) this.drawScreenVignette(game);
      this.drawStartCountdown(game);
      this.drawAnnihilationRoundOverlay(game);
      this.drawTestLabOverlay(game);
      if (!game.adminObserverMode) this.drawAimModeOverlay(game);
      if (!game.adminObserverMode) this.drawScoutAimOverlay(game);
      game.perfMonitor?.end("render.canvasHud");
    }

    drawChatBubbles(game) {
      const bubbles = game.chat?.worldBubbles || [];
      const target = this.chatBubbleTarget(game);
      if (!bubbles.length || !target) return;

      const ctx = this.ctx;
      const visible = bubbles.slice(-3);
      for (let i = 0; i < visible.length; i += 1) {
        const bubble = visible[i];
        const stackOffset = (visible.length - 1 - i) * 44;
        this.drawChatBubble(game, bubble, target.x, target.y - stackOffset);
      }
    }

    chatBubbleTarget(game) {
      if (game.adminObserverMode || game.spectatorMode || !game.player) return null;
      const mounted = game.player.inTank;
      if (mounted?.alive) {
        return {
          x: mounted.x,
          y: mounted.y - (mounted.radius || 34) - 34
        };
      }
      if (game.player.hp <= 0 && !game.playerDowned && !game.playerDeathActive) return null;
      return {
        x: game.player.x,
        y: game.player.y - (game.player.isProne ? 24 : 34)
      };
    }

    drawRemoteHumanPlayers(game) {
      const players = this.remoteHumanPlayers(game);
      if (!players.length) return;
      const ctx = this.ctx;
      for (const entry of players) {
        const alpha = entry.alpha ?? 0.9;
        this.drawRemoteAimCue(entry, alpha);
        this.drawRemoteDroneCue(entry, alpha);
        ctx.save();
        ctx.globalAlpha = alpha;
        if (entry.inVehicle) this.drawRemoteVehicleOccupant(entry, alpha);
        else this.drawInfantry(game, entry.unit, { color: "#67f27d", showPrompt: false });
        ctx.restore();
        this.drawRemoteHumanLabel(entry, alpha);
      }
    }

    remoteHumanPlayers(game) {
      if (game.sessionMode !== "online" && !game.adminObserverMode && !game.spectatorMode) return [];
      const session = game.onlineSession || {};
      const localId = session.playerId || "";
      const now = Date.now();
      const players = (session.players || []).filter((player) => (player.participantType || "player") === "player");
      const entries = [];
      const seen = new Set();
      const active = new Set();
      for (const player of players) {
        const id = String(player.id || "");
        if (!id || seen.has(id) || (localId && id === localId)) continue;
        seen.add(id);
        const point = this.remoteHumanPoint(game, player, now);
        if (!point || point.alive === false) continue;
        const smoothPoint = this.smoothedRemoteHumanPoint(id, point, now);
        active.add(id);
        const unit = {
          x: smoothPoint.x,
          y: smoothPoint.y,
          angle: smoothPoint.angle,
          team: player.team || point.team || TEAM.BLUE,
          radius: 11,
          hp: 100,
          maxHp: 100,
          weaponId: player.weaponId || "rifle",
          classId: player.currentClassId || player.classId || player.roleId || "infantry",
          factionId: player.factionId || player.skinId || "",
          skinId: player.skinId || player.factionId || "",
          speed: 0,
          gunKick: 0,
          interactPulse: 0,
          isRemoteHuman: true
        };
        entries.push({
          id,
          name: player.name || player.nickname || "Player",
          unit,
          inVehicle: smoothPoint.inVehicle,
          vehicleId: smoothPoint.vehicleId,
          vehicleType: smoothPoint.vehicleType,
          aim: smoothPoint.aim,
          drone: smoothPoint.drone,
          alpha: point.alpha
        });
      }
      this.pruneRemoteHumanStates(active, now);
      return entries;
    }

    remoteHumanPoint(game, player, now = Date.now()) {
      const raw = player.position || player;
      const x = Number(raw.x);
      const y = Number(raw.y);
      const nearOrigin = Math.abs(x) < 4 && Math.abs(y) < 4;
      if (!Number.isFinite(x) || !Number.isFinite(y) || nearOrigin) return null;
      const age = Math.max(0, now - (Number(raw.updatedAt || player.updatedAt) || now));
      if (age > 18000) return null;
      const aimX = Number(raw.aimX ?? player.aimX);
      const aimY = Number(raw.aimY ?? player.aimY);
      const droneX = Number(raw.droneX ?? player.droneX);
      const droneY = Number(raw.droneY ?? player.droneY);
      return {
        x,
        y,
        angle: Number.isFinite(Number(raw.angle)) ? Number(raw.angle) : 0,
        team: player.team,
        alive: raw.alive !== false && player.alive !== false,
        inVehicle: Boolean(raw.inVehicle || player.inVehicle),
        vehicleId: String(raw.vehicleId || player.vehicleId || ""),
        vehicleType: String(raw.vehicleType || player.vehicleType || ""),
        aim: Number.isFinite(aimX) && Number.isFinite(aimY) ? { x: aimX, y: aimY } : null,
        drone: Number.isFinite(droneX) && Number.isFinite(droneY) ? {
          id: String(raw.droneId || player.droneId || ""),
          type: String(raw.droneType || player.droneType || "drone"),
          x: droneX,
          y: droneY,
          angle: Number.isFinite(Number(raw.droneAngle ?? player.droneAngle)) ? Number(raw.droneAngle ?? player.droneAngle) : 0,
          controlled: Boolean(raw.droneControlled || player.droneControlled)
        } : null,
        alpha: age > 8000 ? 0.42 : age > 3500 ? 0.62 : 0.88
      };
    }

    smoothedRemoteHumanPoint(id, point, now = Date.now()) {
      const states = this.remoteHumanStates || (this.remoteHumanStates = new Map());
      let state = states.get(id);
      const reset = !state || distXY(state.x, state.y, point.x, point.y) > 520 || now - (state.lastSeen || 0) > 9000;
      if (reset) {
        state = {
          x: point.x,
          y: point.y,
          angle: point.angle,
          aimX: point.aim?.x ?? null,
          aimY: point.aim?.y ?? null,
          droneX: point.drone?.x ?? null,
          droneY: point.drone?.y ?? null,
          droneAngle: point.drone?.angle ?? 0,
          renderedAt: now,
          lastSeen: now
        };
        states.set(id, state);
      } else {
        const elapsed = Math.max(16, now - (state.renderedAt || now));
        const factor = clamp(elapsed / 180, 0.08, 0.36);
        state.x = lerp(state.x, point.x, factor);
        state.y = lerp(state.y, point.y, factor);
        state.angle = normalizeAngle(state.angle + normalizeAngle(point.angle - state.angle) * factor);
        if (point.aim) {
          state.aimX = state.aimX === null ? point.aim.x : lerp(state.aimX, point.aim.x, Math.min(0.62, factor * 1.7));
          state.aimY = state.aimY === null ? point.aim.y : lerp(state.aimY, point.aim.y, Math.min(0.62, factor * 1.7));
        } else {
          state.aimX = null;
          state.aimY = null;
        }
        if (point.drone) {
          const droneJump = state.droneX === null || state.droneY === null ||
            distXY(state.droneX, state.droneY, point.drone.x, point.drone.y) > 620;
          state.droneX = droneJump ? point.drone.x : lerp(state.droneX, point.drone.x, factor);
          state.droneY = droneJump ? point.drone.y : lerp(state.droneY, point.drone.y, factor);
          state.droneAngle = normalizeAngle((state.droneAngle || 0) + normalizeAngle(point.drone.angle - (state.droneAngle || 0)) * factor);
        } else {
          state.droneX = null;
          state.droneY = null;
          state.droneAngle = 0;
        }
        state.renderedAt = now;
        state.lastSeen = now;
      }

      return {
        ...point,
        x: state.x,
        y: state.y,
        angle: state.angle,
        aim: state.aimX !== null && state.aimY !== null ? { x: state.aimX, y: state.aimY } : null,
        drone: point.drone && state.droneX !== null && state.droneY !== null
          ? { ...point.drone, x: state.droneX, y: state.droneY, angle: state.droneAngle }
          : null
      };
    }

    pruneRemoteHumanStates(activeIds, now = Date.now()) {
      const states = this.remoteHumanStates;
      if (!states?.size) return;
      for (const [id, state] of states.entries()) {
        if (!activeIds.has(id) || now - (state.lastSeen || 0) > 20000) states.delete(id);
      }
    }

    drawRemoteAimCue(entry, alpha = 1) {
      const ctx = this.ctx;
      const unit = entry?.unit;
      const aim = entry?.aim;
      if (!unit || !Number.isFinite(aim?.x) || !Number.isFinite(aim?.y)) return;
      const distance = distXY(unit.x, unit.y, aim.x, aim.y);
      if (distance < 12) return;
      const maxLength = 260;
      const scale = Math.min(1, maxLength / distance);
      const x2 = unit.x + (aim.x - unit.x) * scale;
      const y2 = unit.y + (aim.y - unit.y) * scale;
      ctx.save();
      ctx.globalAlpha = Math.min(alpha, 0.62);
      ctx.strokeStyle = "rgba(103, 242, 125, 0.72)";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([9, 8]);
      ctx.beginPath();
      ctx.moveTo(unit.x, unit.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(x2, y2, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawRemoteDroneCue(entry, alpha = 1) {
      const ctx = this.ctx;
      const unit = entry?.unit;
      const drone = entry?.drone;
      if (!unit || !Number.isFinite(drone?.x) || !Number.isFinite(drone?.y)) return;
      ctx.save();
      ctx.globalAlpha = Math.min(alpha, drone.controlled ? 0.82 : 0.56);
      ctx.strokeStyle = drone.controlled ? "rgba(142, 216, 255, 0.85)" : "rgba(103, 242, 125, 0.45)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 7]);
      ctx.beginPath();
      ctx.moveTo(unit.x, unit.y);
      ctx.lineTo(drone.x, drone.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.translate(drone.x, drone.y);
      ctx.rotate(drone.angle || 0);
      ctx.fillStyle = drone.controlled ? "rgba(142, 216, 255, 0.88)" : "rgba(103, 242, 125, 0.74)";
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-5, 6);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-5, -6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawRemoteVehicleOccupant(entry, alpha = 1) {
      const ctx = this.ctx;
      const unit = entry?.unit;
      if (!unit) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(unit.x, unit.y);
      ctx.rotate(unit.angle || 0);
      ctx.strokeStyle = "rgba(103, 242, 125, 0.86)";
      ctx.fillStyle = "rgba(11, 45, 20, 0.34)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#67f27d";
      ctx.fillRect(13, -3, 14, 6);
      ctx.restore();
    }

    drawRemoteHumanLabel(entry, alpha = 1) {
      const ctx = this.ctx;
      const unit = entry.unit;
      const name = String(entry.name || "Player").slice(0, 12);
      if (!unit || !name) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "800 10px Inter, system-ui, sans-serif";
      const width = Math.ceil(ctx.measureText(name).width) + 12;
      const x = unit.x;
      const y = unit.y - 31;
      ctx.fillStyle = "rgba(5, 16, 8, 0.82)";
      roundRect(ctx, x - width / 2, y - 8, width, 16, 5);
      ctx.fill();
      ctx.strokeStyle = "rgba(103, 242, 125, 0.72)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#baffc5";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name, x, y);
      ctx.restore();
    }

    drawChatBubble(game, bubble, x, y) {
      const ctx = this.ctx;
      const maxLife = Math.max(0.001, bubble.maxLife || 1);
      const age = maxLife - bubble.life;
      const alpha = clamp(Math.min(age / 0.16, 1, bubble.life / 0.65), 0, 1);
      if (alpha <= 0) return;

      ctx.save();
      ctx.translate(x, y - clamp(age * 2.2, 0, 8));
      ctx.font = "800 12px Inter, sans-serif";
      const lines = this.wrapChatBubbleText(ctx, bubble.text, 210);
      const lineHeight = 15;
      const textWidth = Math.max(30, ...lines.map((line) => ctx.measureText(line).width));
      const width = clamp(textWidth + 24, 62, 234);
      const height = lines.length * lineHeight + 18;
      const top = -height - 9;
      const bottom = -9;
      const team = game.player?.team || TEAM.BLUE;
      const accent = team === TEAM.BLUE ? "rgba(112, 193, 255, 0.78)" : "rgba(255, 130, 120, 0.78)";

      ctx.globalAlpha = alpha;
      ctx.shadowColor = "rgba(0, 0, 0, 0.32)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = "rgba(7, 13, 12, 0.88)";
      roundRect(ctx, -width / 2, top, width, height, 7);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      ctx.beginPath();
      ctx.moveTo(-8, bottom - 1);
      ctx.lineTo(8, bottom - 1);
      ctx.lineTo(0, 1);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(237, 244, 239, 0.16)";
      ctx.lineWidth = 1;
      roundRect(ctx, -width / 2, top, width, height, 7);
      ctx.stroke();
      ctx.fillStyle = accent;
      roundRect(ctx, -width / 2 + 8, top + 6, width - 16, 2, 1);
      ctx.fill();

      ctx.fillStyle = "rgba(237, 244, 239, 0.96)";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      for (let i = 0; i < lines.length; i += 1) {
        ctx.fillText(lines[i], -width / 2 + 12, top + 12 + i * lineHeight);
      }
      ctx.restore();
    }

    wrapChatBubbleText(ctx, text, maxWidth) {
      const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
      const lines = [];
      let line = "";
      const pushLine = () => {
        if (line) lines.push(line);
        line = "";
      };

      for (const word of words) {
        if (ctx.measureText(word).width > maxWidth) {
          pushLine();
          for (const char of word) {
            const next = `${line}${char}`;
            if (line && ctx.measureText(next).width > maxWidth) pushLine();
            line += char;
          }
          continue;
        }
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > maxWidth) pushLine();
        line = line ? `${line} ${word}` : word;
      }
      pushLine();

      if (lines.length > 3) {
        const truncated = lines.slice(0, 3);
        let last = `${truncated[2]}...`;
        while (last.length > 3 && ctx.measureText(last).width > maxWidth) {
          last = `${last.slice(0, -4)}...`;
        }
        truncated[2] = last;
        return truncated;
      }
      return lines.length ? lines : [""];
    }

    drawTestLabOverlay(game) {
      if (!game.testLab) return;

      const ctx = this.ctx;
      const labels = {
        hub: "통합",
        unit: "유닛",
        drone: "드론",
        balance: "밸런스",
        audio: "음원",
        skin: "스킨",
        objects: "오브젝트"
      };
      const x = 16;
      const y = 82;
      const width = 330;
      const height = 92;
      ctx.save();
      ctx.fillStyle = "rgba(8, 13, 12, 0.62)";
      roundRect(ctx, x, y, width, height, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(143, 222, 207, 0.28)";
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, width, height, 6);
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(237, 244, 239, 0.94)";
      ctx.font = "800 13px Inter, sans-serif";
      ctx.fillText(`실험장: ${labels[game.testLab] || "시험"} · 인공지능 ${game.testLabAiPaused ? "정지" : "작동"}`, x + 12, y + 10);
      ctx.font = "11px Inter, sans-serif";
      ctx.fillStyle = "rgba(183, 223, 213, 0.84)";
      ctx.fillText("단축 1 보병  단축 2 전차  단축 3 험비", x + 12, y + 34);
      ctx.fillText("단축 4 인공지능  단축 5 보급  단축 6 드론 지붕", x + 12, y + 52);
      ctx.fillStyle = "rgba(255, 209, 102, 0.78)";
      ctx.fillText("모드 변경은 우측 실험 콘솔에서 합니다", x + 12, y + 70);
      ctx.restore();
    }

    drawTerrain(game) {
      const ctx = this.ctx;
      const world = game.world;
      const terrainStyle = world.terrainStyle || {};
      const gradientStops = terrainStyle.gradient || ["#213922", "#263d26", "#1f3429"];
      const gradient = ctx.createLinearGradient(0, 0, world.width, world.height);
      gradient.addColorStop(0, gradientStops[0] || "#213922");
      gradient.addColorStop(0.48, gradientStops[1] || gradientStops[0] || "#263d26");
      gradient.addColorStop(1, gradientStops[2] || gradientStops[1] || "#1f3429");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, world.width, world.height);

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

      ctx.save();
      ctx.globalAlpha = terrainStyle.gridAlpha ?? 0.14;
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
    }

    drawRoadNetwork(world) {
      const ctx = this.ctx;
      const roads = world.roads || [];
      const roadWidth = world.roadWidth || 84;
      const junctions = collectRoadJunctions(roads);
      const roadStyle = world.roadStyle || {};
      const roadBody = roadStyle.body || "#343a3d";
      const roadEdge = roadStyle.edge || "#202528";
      const laneColor = roadStyle.lane || "rgba(226, 205, 126, 0.38)";

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const road of roads) this.strokeRoadPath(road, roadEdge, (road.width || roadWidth) + 16);
      for (const road of roads) this.strokeRoadPath(road, roadBody, road.width || roadWidth);
      for (const junction of junctions) {
        const radius = Math.max(28, roadWidth * 0.54);
        ctx.fillStyle = roadBody;
        ctx.beginPath();
        ctx.arc(junction.x, junction.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const road of roads) {
        const width = road.width || roadWidth;
        this.strokeRoadPath(road, laneColor, Math.max(3.5, width * 0.04), [34, 34]);
      }

      for (const junction of junctions) {
        const radius = Math.max(24, roadWidth * 0.4);
        ctx.fillStyle = roadBody;
        ctx.beginPath();
        ctx.arc(junction.x, junction.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    strokeRoadPath(road, color, width, dash = null) {
      if (!road || road.length < 2) return;
      const ctx = this.ctx;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(road[0].x, road[0].y);
      for (let i = 1; i < road.length; i += 1) ctx.lineTo(road[i].x, road[i].y);
      ctx.stroke();
      if (dash) ctx.setLineDash([]);
    }

    drawSafeZones(game) {
      const ctx = this.ctx;
      for (const zone of game.world.safeZones || []) {
        const color = zone.team === TEAM.BLUE ? "#6bbcff" : "#ff6d66";
        ctx.save();
        ctx.globalAlpha = 0.92;
        const gradient = ctx.createRadialGradient(zone.x, zone.y, 0, zone.x, zone.y, zone.radius);
        gradient.addColorStop(0, hexToRgba(color, 0.12));
        gradient.addColorStop(0.72, hexToRgba(color, 0.055));
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = hexToRgba(color, 0.55);
        ctx.lineWidth = 3;
        ctx.setLineDash([14, 12]);
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.radius - 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        const label = zone.label || (zone.team === TEAM.RED ? "적군 기지" : "아군 기지");
        ctx.fillStyle = "rgba(9, 15, 13, 0.72)";
        ctx.strokeStyle = hexToRgba(color, 0.46);
        roundRect(ctx, zone.x - 48, zone.y - zone.radius - 30, 96, 24, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#edf4ef";
        ctx.font = "900 11px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, zone.x, zone.y - zone.radius - 18);
        ctx.restore();
      }
    }

    drawCapturePoints(game) {
      const ctx = this.ctx;
      for (const point of game.capturePoints) {
        const color = TEAM_COLORS[point.owner];
        const progressColor = point.progress >= 0 ? TEAM_COLORS.blue : TEAM_COLORS.red;

        ctx.save();
        ctx.translate(point.x, point.y);
        ctx.fillStyle = point.owner === TEAM.NEUTRAL ? "rgba(220, 213, 181, 0.08)" : hexToRgba(color, 0.14);
        ctx.strokeStyle = point.contested ? "#ffd166" : hexToRgba(color, 0.75);
        ctx.lineWidth = point.contested ? 5 : 3;
        ctx.beginPath();
        ctx.arc(0, 0, point.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = hexToRgba(progressColor, 0.9);
        ctx.lineWidth = 8;
        ctx.beginPath();
        const arc = Math.abs(point.progress) * Math.PI * 2;
        ctx.arc(0, 0, point.radius - 13, -Math.PI / 2, -Math.PI / 2 + arc * Math.sign(point.progress || 1));
        ctx.stroke();

        ctx.fillStyle = "rgba(9, 15, 13, 0.72)";
        ctx.strokeStyle = "rgba(237, 244, 239, 0.18)";
        roundRect(ctx, -28, -21, 56, 42, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#edf4ef";
        ctx.font = "800 22px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(point.name, 0, 1);
        ctx.restore();
      }
    }

    drawScorchMarks(game) {
      const ctx = this.ctx;
      for (const mark of game.effects.scorchMarks) {
        const gradient = ctx.createRadialGradient(mark.x, mark.y, 0, mark.x, mark.y, mark.radius);
        gradient.addColorStop(0, `rgba(0, 0, 0, ${mark.alpha})`);
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(mark.x, mark.y, mark.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawDustPuffs(game) {
      const ctx = this.ctx;
      const puffs = game.effects.dustPuffs || [];
      ctx.save();
      for (const puff of puffs) {
        const lifePct = clamp(puff.life / puff.maxLife, 0, 1);
        const radius = Math.max(0.1, Number.isFinite(puff.radius) ? puff.radius : 0);
        ctx.globalAlpha = lifePct * (puff.alpha || 0.18);
        ctx.fillStyle = puff.color || "#d1c092";
        ctx.beginPath();
        ctx.ellipse(puff.x, puff.y, radius * 1.35, radius * 0.82, puff.angle || 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    drawTrackScuffs(game) {
      const ctx = this.ctx;
      ctx.save();
      ctx.lineCap = "round";
      for (const mark of game.effects.trackScuffs || []) {
        const lifePct = clamp(mark.life / mark.maxLife, 0, 1);
        ctx.globalAlpha = lifePct * (mark.alpha || 0.1);
        ctx.strokeStyle = "#242a25";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(mark.x1, mark.y1);
        ctx.lineTo(mark.x2, mark.y2);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawGunSmokePuffs(game) {
      const ctx = this.ctx;
      const puffs = game.effects.gunSmokePuffs || [];
      ctx.save();
      for (const puff of puffs) {
        const lifePct = clamp(puff.life / puff.maxLife, 0, 1);
        const radius = Math.max(0.1, Number.isFinite(puff.radius) ? puff.radius : 0);
        ctx.globalAlpha = Math.pow(lifePct, 1.35) * (puff.alpha || 0.2);
        ctx.fillStyle = puff.warm ? "#d7c1a0" : "#bfc5bf";
        ctx.beginPath();
        ctx.ellipse(puff.x, puff.y, radius * 1.45, radius, puff.angle || 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    drawMuzzleFlashes(game) {
      const ctx = this.ctx;
      for (const flash of game.effects.muzzleFlashes || []) {
        const lifePct = clamp(flash.life / flash.maxLife, 0, 1);
        const length = flash.length * (0.65 + lifePct * 0.35);
        const width = flash.width * lifePct;

        ctx.save();
        ctx.translate(flash.x, flash.y);
        ctx.rotate(flash.angle);
        ctx.globalAlpha = lifePct;
        ctx.fillStyle = flash.color || "rgba(255, 226, 160, 0.92)";
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(length * 0.72, -width * 0.5);
        ctx.lineTo(length, 0);
        ctx.lineTo(length * 0.72, width * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255, 248, 210, 0.9)";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(length * 0.46, -width * 0.22);
        ctx.lineTo(length * 0.62, 0);
        ctx.lineTo(length * 0.46, width * 0.22);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    drawPlayerTankAim(game) {
      const tank = game.player.inTank;
      if (!tank || !tank.alive) return;
      if (tank.vehicleType === "humvee" || tank.weaponMode === "mg") {
        this.drawPlayerMachineGunAim(game, tank);
        return;
      }

      const ctx = this.ctx;
      const ammo = AMMO[tank.loadedAmmo] || AMMO[tank.reload.ammoId] || AMMO.ap;
      const fireOrder = tank.fireOrder?.ammoId === "he" ? tank.fireOrder : null;
      const aimReady = fireOrder ? Boolean(fireOrder.ready) : (tank.aimError || 0) < 0.12;
      const aimMode = Boolean(game.input.mouse.rightDown);
      const muzzleDistance = tank.radius + 28;
      const muzzleX = tank.x + Math.cos(tank.turretAngle) * muzzleDistance;
      const muzzleY = tank.y + Math.sin(tank.turretAngle) * muzzleDistance;
      const ammoRange = ammo.range || 1600;
      const displayRange = aimMode ? ammoRange : Math.min(ammoRange, 1100);
      const impact = this.traceTankAim(game, muzzleX, muzzleY, tank.turretAngle, displayRange);
      const mouseTargetX = game.input.mouse.worldX;
      const mouseTargetY = game.input.mouse.worldY;
      const heAimSource = fireOrder || { x: mouseTargetX, y: mouseTargetY };
      const heAimSolution = ammo.id === "he" && game.resolveTankGroundAim
        ? game.resolveTankGroundAim(tank, heAimSource.x, heAimSource.y, ammo)
        : null;
      const hePreview = heAimSolution || impact;

      ctx.save();
      ctx.lineCap = "round";
      if (aimMode) {
        ctx.strokeStyle = aimReady ? "rgba(200, 218, 207, 0.68)" : "rgba(237, 244, 239, 0.42)";
        ctx.lineWidth = 1.35;
        ctx.beginPath();
        ctx.arc(impact.x, impact.y, 6.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(impact.x - 13, impact.y);
        ctx.lineTo(impact.x - 6, impact.y);
        ctx.moveTo(impact.x + 6, impact.y);
        ctx.lineTo(impact.x + 13, impact.y);
        ctx.moveTo(impact.x, impact.y - 13);
        ctx.lineTo(impact.x, impact.y - 6);
        ctx.moveTo(impact.x, impact.y + 6);
        ctx.lineTo(impact.x, impact.y + 13);
        ctx.stroke();
      }

      if (ammo.id === "he" && (aimMode || fireOrder)) {
        const lockedColor = fireOrder
          ? aimReady ? "rgba(114, 232, 154, 0.82)" : "rgba(214, 202, 142, 0.72)"
          : "rgba(214, 171, 118, 0.48)";
        const pulse = fireOrder ? 1 + Math.sin(performance.now() * 0.012) * 0.08 : 1;
        ctx.strokeStyle = lockedColor;
        ctx.lineWidth = fireOrder ? 2.6 : 2;
        ctx.beginPath();
        ctx.arc(hePreview.x, hePreview.y, (fireOrder ? 18 : 13) * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(hePreview.x - 24, hePreview.y);
        ctx.lineTo(hePreview.x - 10, hePreview.y);
        ctx.moveTo(hePreview.x + 10, hePreview.y);
        ctx.lineTo(hePreview.x + 24, hePreview.y);
        ctx.moveTo(hePreview.x, hePreview.y - 24);
        ctx.lineTo(hePreview.x, hePreview.y - 10);
        ctx.moveTo(hePreview.x, hePreview.y + 10);
        ctx.lineTo(hePreview.x, hePreview.y + 24);
        ctx.stroke();

        if (fireOrder && !aimReady) {
          ctx.strokeStyle = "rgba(214, 202, 142, 0.28)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(muzzleX, muzzleY);
          ctx.lineTo(hePreview.x, hePreview.y);
          ctx.stroke();
        }
      }

      if (ammo.id === "he" && (aimMode || fireOrder)) {
        ctx.strokeStyle = fireOrder
          ? aimReady ? "rgba(114, 232, 154, 0.42)" : "rgba(255, 209, 102, 0.38)"
          : aimMode ? "rgba(255, 159, 85, 0.5)" : "rgba(255, 159, 85, 0.38)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hePreview.x, hePreview.y, ammo.splash || 98, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawPlayerMachineGunAim(game, tank) {
      if (!game.input.mouse.rightDown) return;
      const ctx = this.ctx;
      const weapon = tank.machineGunWeapon?.() || INFANTRY_WEAPONS.machinegun;
      const muzzle = tank.machineGunMuzzlePoint?.() || {
        x: tank.x + Math.cos(tank.machineGunAngle) * (tank.radius + 22),
        y: tank.y + Math.sin(tank.machineGunAngle) * (tank.radius + 22)
      };
      const range = weapon.range || 760;
      const impact = this.traceTankAim(game, muzzle.x, muzzle.y, tank.machineGunAngle, range);
      const ready = (tank.vehicleType === "humvee" || tank.hasMachineGunner?.()) && tank.machineGunCooldown <= 0 && (tank.ammo?.mg || 0) > 0;

      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = ready ? "rgba(184, 224, 255, 0.68)" : "rgba(255, 146, 116, 0.58)";
      ctx.lineWidth = 1.45;
      ctx.beginPath();
      ctx.arc(impact.x, impact.y, ready ? 7 : 10, 0, Math.PI * 2);
      ctx.moveTo(impact.x - 15, impact.y);
      ctx.lineTo(impact.x - 7, impact.y);
      ctx.moveTo(impact.x + 7, impact.y);
      ctx.lineTo(impact.x + 15, impact.y);
      ctx.moveTo(impact.x, impact.y - 15);
      ctx.lineTo(impact.x, impact.y - 7);
      ctx.moveTo(impact.x, impact.y + 7);
      ctx.lineTo(impact.x, impact.y + 15);
      ctx.stroke();

      ctx.restore();
    }

    traceTankAim(game, startX, startY, angle, range) {
      const step = 16;
      let lastX = startX;
      let lastY = startY;

      for (let distance = step; distance <= range; distance += step) {
        const x = startX + Math.cos(angle) * distance;
        const y = startY + Math.sin(angle) * distance;
        if (x < 0 || y < 0 || x > game.world.width || y > game.world.height) return { x: lastX, y: lastY, blocked: true };

        const blocked = IronLine.physics?.lineBlockedByWorld
          ? IronLine.physics.lineBlockedByWorld(game, lastX, lastY, x, y, {
            padding: 4,
            ignoreBlockerContainingA: true
          })
          : game.world.obstacles.some((obstacle) => lineIntersectsRect(lastX, lastY, x, y, obstacle));
        if (blocked) return { x: lastX, y: lastY, blocked: true };

        lastX = x;
        lastY = y;
      }

      return { x: lastX, y: lastY, blocked: false };
    }

    drawPlayerInfantryAim(game) {
      if (game.player?.controlledDrone) return;
      if (game.isPlayerMachineGunAimMode?.()) {
        this.drawPlayerInfantryMachineGunAim(game);
        return;
      }

      if (game.isPlayerPistolAimMode?.()) {
        this.drawPlayerInfantryPistolAim(game);
        return;
      }

      if (!game.isPlayerRpgAimMode?.()) return;

      const player = game.player;
      const weapon = player.getWeapon?.() || INFANTRY_WEAPONS.rpg;
      if (weapon.id !== "rpg") return;

      const aim = game.resolvePlayerRpgAim?.(game.input.mouse.worldX, game.input.mouse.worldY, weapon);
      if (!aim) return;

      const ctx = this.ctx;
      const muzzleDistance = player.radius + 16;
      const angle = Math.atan2(game.input.mouse.worldY - player.y, game.input.mouse.worldX - player.x);
      const muzzleX = player.x + Math.cos(angle) * muzzleDistance;
      const muzzleY = player.y + Math.sin(angle) * muzzleDistance;
      const aimReady = (player.rpgAimTime || 0) >= (player.isProne ? 0.42 : 0.34) && !aim.tooClose;
      const lineColor = aim.tooClose
        ? "rgba(255, 109, 102, 0.66)"
        : aimReady
          ? "rgba(255, 209, 102, 0.76)"
          : "rgba(237, 244, 239, 0.42)";
      const pulse = 1 + Math.sin(performance.now() * 0.014) * 0.08;

      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = aimReady ? 2.6 : 2;
      ctx.setLineDash(aimReady ? [] : [8, 9]);
      ctx.beginPath();
      ctx.moveTo(muzzleX, muzzleY);
      ctx.lineTo(aim.x, aim.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = aim.tooClose ? "rgba(255, 109, 102, 0.34)" : "rgba(255, 209, 102, 0.22)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(player.x, player.y, aim.minRange || weapon.minRange || 150, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, 13 * pulse, 0, Math.PI * 2);
      ctx.moveTo(aim.x - 28, aim.y);
      ctx.lineTo(aim.x - 10, aim.y);
      ctx.moveTo(aim.x + 10, aim.y);
      ctx.lineTo(aim.x + 28, aim.y);
      ctx.moveTo(aim.x, aim.y - 28);
      ctx.lineTo(aim.x, aim.y - 10);
      ctx.moveTo(aim.x, aim.y + 10);
      ctx.lineTo(aim.x, aim.y + 28);
      ctx.stroke();

      ctx.strokeStyle = aimReady ? "rgba(255, 159, 85, 0.36)" : "rgba(255, 159, 85, 0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, weapon.splash || 110, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawPlayerInfantryMachineGunAim(game) {
      const player = game.player;
      const weapon = player.getWeapon?.() || INFANTRY_WEAPONS.machinegun;
      if (weapon.id !== "machinegun" && weapon.id !== "lmg") return;

      const ctx = this.ctx;
      const range = (weapon.range || 620) * 1.08;
      const aimX = game.input.mouse.worldX;
      const aimY = game.input.mouse.worldY;
      const inRange = distXY(player.x, player.y, aimX, aimY) <= range;
      const ammo = weapon.ammoKey ? player.equipmentAmmo?.[weapon.ammoKey] || 0 : 1;
      const ready = player.rifleCooldown <= 0 && ammo > 0;
      const reticleColor = ready
        ? inRange ? "rgba(184, 224, 255, 0.78)" : "rgba(184, 224, 255, 0.34)"
        : "rgba(255, 146, 116, 0.64)";
      const pulse = 1 + Math.sin(performance.now() * 0.016) * 0.05;

      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = reticleColor;
      ctx.lineWidth = inRange ? 1.45 : 1.1;
      ctx.beginPath();
      ctx.arc(aimX, aimY, (ready ? 7 : 10) * pulse, 0, Math.PI * 2);
      ctx.moveTo(aimX - 15, aimY);
      ctx.lineTo(aimX - 7, aimY);
      ctx.moveTo(aimX + 7, aimY);
      ctx.lineTo(aimX + 15, aimY);
      ctx.moveTo(aimX, aimY - 15);
      ctx.lineTo(aimX, aimY - 7);
      ctx.moveTo(aimX, aimY + 7);
      ctx.lineTo(aimX, aimY + 15);
      ctx.stroke();
      ctx.restore();
    }

    drawPlayerInfantryPistolAim(game) {
      const player = game.player;
      const weapon = player.getWeapon?.() || INFANTRY_WEAPONS.pistol;
      if (weapon.id !== "pistol") return;

      const ctx = this.ctx;
      const range = (weapon.range || 250) * 1.12;
      const aimX = game.input.mouse.worldX;
      const aimY = game.input.mouse.worldY;
      const distance = distXY(player.x, player.y, aimX, aimY);
      const inRange = distance <= range;
      const ammo = weapon.ammoKey ? player.equipmentAmmo?.[weapon.ammoKey] || 0 : 1;
      const ready = player.rifleCooldown <= 0 && ammo > 0;
      const angle = angleTo(player.x, player.y, aimX, aimY);
      const muzzleDistance = player.radius + 17;
      const muzzleX = player.x + Math.cos(angle) * muzzleDistance;
      const muzzleY = player.y + Math.sin(angle) * muzzleDistance;
      const reticleColor = ready
        ? inRange ? "rgba(255, 218, 132, 0.82)" : "rgba(255, 218, 132, 0.34)"
        : "rgba(255, 146, 116, 0.64)";
      const pulse = 1 + Math.sin(performance.now() * 0.018) * 0.045;

      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = inRange ? "rgba(255, 218, 132, 0.28)" : "rgba(255, 146, 116, 0.18)";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 10]);
      ctx.beginPath();
      ctx.moveTo(muzzleX, muzzleY);
      ctx.lineTo(aimX, aimY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = reticleColor;
      ctx.lineWidth = ready ? 1.7 : 1.25;
      ctx.beginPath();
      ctx.arc(aimX, aimY, (ready ? 8 : 11) * pulse, 0, Math.PI * 2);
      ctx.moveTo(aimX - 17, aimY);
      ctx.lineTo(aimX - 8, aimY);
      ctx.moveTo(aimX + 8, aimY);
      ctx.lineTo(aimX + 17, aimY);
      ctx.moveTo(aimX, aimY - 17);
      ctx.lineTo(aimX, aimY - 8);
      ctx.moveTo(aimX, aimY + 8);
      ctx.lineTo(aimX, aimY + 17);
      ctx.stroke();

      ctx.restore();
    }

    drawInfantry(game, unit, options = {}) {
      const ctx = this.ctx;
      const teamColor = options.color || "#89d27e";
      const style = this.infantryVisualStyle(game, unit, teamColor);
      const weapon = INFANTRY_WEAPONS[unit.weaponId] || INFANTRY_WEAPONS.rifle;
      const scoped = this.isScopedInfantryPose(game, unit, weapon);
      const prone = Boolean(unit.isProne || (unit.proneTransitionTimer || 0) > 0);
      const moving = Math.abs(unit.speed || 0) > (prone ? 5 : 12);
      const firingState = ["fire", "support-fire", "prone-fire", "recon-snipe", "harass-tank", "rpg-attack"].includes(unit.ai?.state || "");
      const playerHoldingGunFire = unit === game.player &&
        weapon.type === "gun" &&
        weapon.id !== "sniper" &&
        !unit.controlledDrone &&
        (unit.fireHoldTimer || 0) > 0;
      const playerHoldingPistol = unit === game.player &&
        weapon.id === "pistol" &&
        !unit.controlledDrone &&
        Boolean(game.isPlayerPistolAimMode?.() || game.input?.mouse?.leftDown || game.input?.keyDown?.("Space"));
      const firing = scoped || playerHoldingGunFire || playerHoldingPistol || (unit.gunKick || 0) > 0.02 || firingState;
      const pose = prone
        ? moving ? "prone-crawl" : "prone-fire"
        : firing ? "stand-fire" : "stand-move";
      const clock = game.matchTime || (typeof performance !== "undefined" ? performance.now() / 1000 : 0);
      const phase = clock * (prone ? 9.5 : 8.2) + (unit.x + unit.y) * 0.035;
      const controlledDrone = unit === game.player && unit.controlledDrone?.alive ? unit.controlledDrone : null;
      const bodyAngle = controlledDrone ? angleTo(unit.x, unit.y, controlledDrone.x, controlledDrone.y) : unit.angle;
      ctx.save();
      ctx.translate(unit.x, unit.y);
      ctx.rotate(bodyAngle);

      ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
      ctx.beginPath();
      ctx.ellipse(prone ? -2 : 0, prone ? 4 : 5, prone ? 20 : 13, prone ? 7.5 : 8, 0, 0, Math.PI * 2);
      ctx.fill();

      if (prone) this.drawProneInfantryBody(ctx, unit, style, pose, phase);
      else this.drawStandingInfantryBody(ctx, unit, style, pose, phase);

      if (unit.isSquadLeader) this.drawSquadLeaderMarker(ctx, unit, style, prone);

      if (controlledDrone) this.drawInfantryDroneController(ctx, controlledDrone);
      else this.drawInfantryWeapon(ctx, unit, weapon, pose, scoped, phase);
      ctx.restore();

      if (options.showPrompt === false) return;
      const mountTarget = game.findMountablePlayerVehicle?.() || game.findMountablePlayerTank?.();
      if (mountTarget?.alive) {
        ctx.save();
        ctx.globalAlpha = 0.55 + Math.sin(unit.interactPulse * 5) * 0.18;
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(mountTarget.x, mountTarget.y, mountTarget.radius + 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    infantryVisualStyle(game, unit, teamColor) {
      const red = unit.team === TEAM.RED;
      const skin = IronLine.factionVisuals?.factionForUnit?.(game, unit) ||
        IronLine.playerSkinById?.(unit.skinId) ||
        null;
      const base = {
        cloth: red ? "#51483a" : "#43533f",
        clothDark: red ? "#39332b" : "#2f3b30",
        vest: red ? "#27251f" : "#202920",
        gear: red ? "#1b1a17" : "#171d18",
        helmet: red ? "#28261f" : "#202a22"
      };
      return {
        cloth: skin?.cloth || base.cloth,
        clothDark: skin?.clothDark || base.clothDark,
        vest: skin?.vest || base.vest,
        gear: skin?.gear || base.gear,
        helmet: skin?.helmet || base.helmet,
        boot: "#111611",
        skin: "rgba(219, 210, 184, 0.34)",
        patch: teamColor,
        patchDim: skin?.accent || (red ? "rgba(255, 176, 171, 0.62)" : "rgba(182, 220, 255, 0.62)")
      };
    }

    drawSquadLeaderMarker(ctx, unit, style, prone) {
      const radius = unit.radius || 10;
      const x = prone ? radius * 0.38 : radius * -0.03;
      const y = prone ? -radius * 0.47 : -radius * 0.63;
      const width = prone ? radius * 0.58 : radius * 0.52;
      const height = Math.max(2.4, radius * 0.22);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(prone ? -0.08 : 0.12);
      ctx.fillStyle = "rgba(76, 214, 108, 0.95)";
      ctx.strokeStyle = "rgba(8, 36, 16, 0.76)";
      ctx.lineWidth = 0.85;
      roundRect(ctx, -width / 2, -height / 2, width, height, 1.5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(221, 255, 215, 0.42)";
      roundRect(ctx, -width * 0.33, -height * 0.34, width * 0.24, height * 0.68, 1);
      ctx.fill();
      ctx.restore();
    }

    drawStandingInfantryBody(ctx, unit, style, pose, phase) {
      const radius = unit.radius || 10;
      const moving = pose === "stand-move";
      const firing = pose === "stand-fire";
      const sway = moving ? Math.cos(phase * 0.5) * 0.28 : 0;

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.fillStyle = style.gear;
      roundRect(ctx, -radius * 1.16, -radius * 0.46, radius * 0.48, radius * 0.92, 3.5);
      ctx.fill();
      ctx.strokeStyle = "rgba(5, 8, 6, 0.58)";
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.fillStyle = "rgba(237, 244, 239, 0.08)";
      roundRect(ctx, -radius * 1.04, -radius * 0.32, radius * 0.12, radius * 0.64, 2);
      ctx.fill();

      ctx.strokeStyle = style.clothDark;
      ctx.lineWidth = 3.1;
      ctx.beginPath();
      if (firing) {
        ctx.moveTo(-radius * 0.02, -radius * 0.5);
        ctx.lineTo(radius * 0.42, -radius * 0.24);
        ctx.moveTo(-radius * 0.02, radius * 0.5);
        ctx.lineTo(radius * 0.42, radius * 0.22);
      } else {
        ctx.moveTo(-radius * 0.16, -radius * 0.56);
        ctx.lineTo(radius * 0.08, -radius * 0.66);
        ctx.moveTo(-radius * 0.16, radius * 0.56);
        ctx.lineTo(radius * 0.08, radius * 0.66);
      }
      ctx.stroke();

      ctx.fillStyle = style.cloth;
      roundRect(ctx, -radius * 0.7, -radius * 0.58 + sway, radius * 1.02, radius * 1.16, 4.5);
      ctx.fill();
      ctx.strokeStyle = "rgba(5, 8, 6, 0.48)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = style.vest;
      roundRect(ctx, -radius * 0.5, -radius * 0.48 + sway, radius * 0.64, radius * 0.96, 3.5);
      ctx.fill();
      ctx.strokeStyle = "rgba(5, 8, 6, 0.45)";
      ctx.lineWidth = 0.9;
      ctx.stroke();

      ctx.fillStyle = "rgba(237, 244, 239, 0.1)";
      roundRect(ctx, -radius * 0.24, -radius * 0.38 + sway, radius * 0.16, radius * 0.76, 2);
      ctx.fill();

      ctx.fillStyle = style.patchDim;
      roundRect(ctx, -radius * 0.04, -radius * 0.62 + sway, radius * 0.26, radius * 0.11, 1.5);
      ctx.fill();
      ctx.fillStyle = style.patch;
      roundRect(ctx, radius * 0.42, -radius * 0.08, radius * 0.14, radius * 0.16, 1.2);
      ctx.fill();

      ctx.fillStyle = "rgba(11, 15, 12, 0.38)";
      roundRect(ctx, radius * 0.22, -radius * 0.2, radius * 0.18, radius * 0.4, 2);
      ctx.fill();

      ctx.fillStyle = style.helmet;
      ctx.beginPath();
      ctx.ellipse(radius * 0.66, 0, Math.max(4.2, radius * 0.42), Math.max(4, radius * 0.43), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(5, 8, 6, 0.62)";
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.fillStyle = "rgba(10, 14, 11, 0.34)";
      ctx.beginPath();
      ctx.ellipse(radius * 0.78, 0, radius * 0.2, radius * 0.33, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(237, 244, 239, 0.08)";
      roundRect(ctx, radius * 0.5, -radius * 0.05, radius * 0.28, radius * 0.1, 1);
      ctx.fill();
      ctx.fillStyle = style.patch;
      roundRect(ctx, radius * 0.58, -radius * 0.24, radius * 0.15, radius * 0.08, 1);
      ctx.fill();
    }

    drawProneInfantryBody(ctx, unit, style, pose, phase) {
      const radius = unit.radius || 10;
      const crawling = pose === "prone-crawl";
      const wave = crawling ? Math.sin(phase) : 0;
      const counter = crawling ? Math.cos(phase) : 0;
      const leftForward = radius * (0.62 + wave * 0.16);
      const rightForward = radius * (0.62 - wave * 0.16);
      const leftKnee = -radius * (1.18 - counter * 0.1);
      const rightKnee = -radius * (1.18 + counter * 0.1);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.strokeStyle = style.boot;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.76, -radius * 0.24);
      ctx.lineTo(leftKnee, -radius * (0.52 + wave * 0.06));
      ctx.lineTo(-radius * (1.54 - wave * 0.08), -radius * 0.48);
      ctx.moveTo(-radius * 0.76, radius * 0.24);
      ctx.lineTo(rightKnee, radius * (0.52 - wave * 0.06));
      ctx.lineTo(-radius * (1.54 + wave * 0.08), radius * 0.48);
      ctx.stroke();

      ctx.fillStyle = style.gear;
      roundRect(ctx, -radius * 1.3, -radius * 0.38, radius * 0.46, radius * 0.76, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(5, 8, 6, 0.58)";
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.strokeStyle = style.clothDark;
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (crawling) {
        ctx.moveTo(-radius * 0.02, -radius * 0.42);
        ctx.lineTo(leftForward, -radius * (0.66 + counter * 0.06));
        ctx.lineTo(radius * (0.92 + wave * 0.08), -radius * 0.42);
        ctx.moveTo(-radius * 0.06, radius * 0.42);
        ctx.lineTo(rightForward, radius * (0.64 - counter * 0.06));
      } else {
        ctx.moveTo(-radius * 0.02, -radius * 0.42);
        ctx.lineTo(radius * 0.7, -radius * 0.55);
        ctx.lineTo(radius * 0.92, -radius * 0.28);
        ctx.moveTo(-radius * 0.02, radius * 0.42);
        ctx.lineTo(radius * 0.7, radius * 0.55);
        ctx.lineTo(radius * 0.92, radius * 0.28);
      }
      ctx.stroke();

      ctx.fillStyle = style.cloth;
      roundRect(ctx, -radius * 0.92, -radius * 0.43, radius * 1.36, radius * 0.86, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(5, 8, 6, 0.48)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = style.vest;
      roundRect(ctx, -radius * 0.68, -radius * 0.33, radius * 0.82, radius * 0.66, 3.5);
      ctx.fill();
      ctx.strokeStyle = "rgba(5, 8, 6, 0.45)";
      ctx.lineWidth = 0.9;
      ctx.stroke();

      ctx.fillStyle = "rgba(237, 244, 239, 0.09)";
      roundRect(ctx, -radius * 0.38, -radius * 0.28, radius * 0.22, radius * 0.56, 2);
      ctx.fill();

      ctx.fillStyle = style.patchDim;
      roundRect(ctx, -radius * 0.12, -radius * 0.48, radius * 0.28, radius * 0.11, 1.5);
      ctx.fill();

      ctx.fillStyle = style.helmet;
      ctx.beginPath();
      ctx.ellipse(radius * 1.0, 0, Math.max(3.8, radius * 0.36), Math.max(3.5, radius * 0.35), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(5, 8, 6, 0.62)";
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.fillStyle = "rgba(9, 13, 10, 0.38)";
      ctx.beginPath();
      ctx.ellipse(radius * 1.11, 0, radius * 0.16, radius * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = style.patch;
      roundRect(ctx, radius * 0.92, -radius * 0.07, radius * 0.18, radius * 0.13, 1.2);
      ctx.fill();

      ctx.fillStyle = "rgba(237, 244, 239, 0.08)";
      roundRect(ctx, radius * 0.88, -radius * 0.04, radius * 0.24, radius * 0.08, 1);
      ctx.fill();
    }

    isScopedInfantryPose(game, unit, weapon) {
      if (unit === game.player && (weapon.id === "machinegun" || weapon.id === "lmg")) {
        return Boolean(game.isPlayerMachineGunAimMode?.());
      }
      if (weapon.id !== "sniper") return false;
      if (unit === game.player) return Boolean(game.isPlayerScoutAimMode?.());
      const state = unit.ai?.state || "";
      return unit.classId === "scout" &&
        (state === "recon-snipe" || state === "recon-watch" || state === "fire") &&
        Math.abs(unit.speed || 0) < 14;
    }

    drawInfantryWeapon(ctx, unit, weapon, pose = "stand-move", scoped = false, phase = 0) {
      const width = weapon.visualWidth || 5;
      const length = weapon.visualLength || 16;
      const rpg = weapon.id === "rpg";
      const machineGun = weapon.id === "machinegun" || weapon.id === "lmg";
      const crawling = pose === "prone-crawl";
      const proneFire = pose === "prone-fire";
      const standingFire = pose === "stand-fire";
      const aimed = scoped || proneFire || standingFire || (rpg && unit.rpgAim);
      let sideOffset = rpg ? 7 : 8.4;
      let forwardOffset = -5.3;
      let weaponAngle = -0.52;

      if (crawling) {
        sideOffset = rpg ? 8.5 : 7.2 + Math.sin(phase) * 0.65;
        forwardOffset = rpg ? -1.5 : -2;
        weaponAngle = -0.36 + Math.cos(phase * 0.7) * 0.04;
      } else if (proneFire || scoped || (rpg && unit.rpgAim)) {
        sideOffset = 0.35;
        forwardOffset = scoped ? 4 : 3.2;
        weaponAngle = 0;
      } else if (standingFire) {
        sideOffset = rpg ? 3.8 : 3.1;
        forwardOffset = 2.3;
        weaponAngle = -0.04;
      }

      const stockLength = Math.max(4, length * 0.24);
      const displayLength = aimed || rpg ? length : length * 0.68;
      const recoil = (unit.gunKick || 0) * (machineGun ? 3.4 : 1.8) * (aimed ? 1 : 0.7);
      const bodyX = forwardOffset - recoil;

      ctx.save();
      ctx.translate(0, sideOffset);
      ctx.rotate(weaponAngle);

      ctx.fillStyle = "rgba(19, 24, 19, 0.72)";
      roundRect(ctx, bodyX - stockLength, -Math.max(2, width * 0.42), stockLength + 6, Math.max(4, width * 0.85), 2);
      ctx.fill();

      ctx.fillStyle = rpg ? "#2f3b2d" : "#243222";
      roundRect(ctx, bodyX, -width / 2, displayLength, width, 2);
      ctx.fill();

      ctx.fillStyle = "rgba(237, 244, 239, 0.2)";
      roundRect(ctx, bodyX + displayLength - 1, -Math.max(1, width * 0.28), 5, Math.max(2, width * 0.56), 1);
      ctx.fill();

      if (rpg) {
        ctx.fillStyle = "rgba(255, 180, 92, 0.68)";
        ctx.beginPath();
        ctx.moveTo(bodyX + displayLength + 8, 0);
        ctx.lineTo(bodyX + displayLength - 2, -width * 0.72);
        ctx.lineTo(bodyX + displayLength - 2, width * 0.72);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "rgba(237, 244, 239, 0.18)";
        roundRect(ctx, bodyX + displayLength * 0.36, -width / 2 - 3, 10, 2, 1);
        ctx.fill();
      }

      if (machineGun) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        roundRect(ctx, bodyX + 9, width * 0.42, 8, 3, 1);
        ctx.fill();
        ctx.fillStyle = "rgba(15, 19, 16, 0.54)";
        roundRect(ctx, bodyX + displayLength * 0.42, -width * 0.88, 9, 3, 1);
        ctx.fill();
      }

      if (unit.weaponId === "sniper") {
        ctx.fillStyle = "rgba(120, 214, 140, 0.45)";
        roundRect(ctx, bodyX + 7, -width / 2 - 3, 8, 2, 1);
        ctx.fill();
      }

      ctx.restore();
    }

    drawInfantryDroneController(ctx, drone) {
      const weakSignal = Boolean(drone?.isSignalWeak?.());
      const screenColor = weakSignal ? "rgba(255, 209, 102, 0.72)" : "rgba(107, 188, 255, 0.68)";

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(28, 34, 30, 0.88)";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-2, -6);
      ctx.lineTo(9, -8);
      ctx.moveTo(-2, 6);
      ctx.lineTo(9, 8);
      ctx.stroke();

      ctx.fillStyle = "rgba(15, 19, 18, 0.9)";
      roundRect(ctx, 7, -9, 15, 18, 2.5);
      ctx.fill();
      ctx.strokeStyle = "rgba(237, 244, 239, 0.2)";
      ctx.lineWidth = 1;
      roundRect(ctx, 7, -9, 15, 18, 2.5);
      ctx.stroke();

      ctx.fillStyle = screenColor;
      roundRect(ctx, 9.5, -6.5, 10, 9, 1.5);
      ctx.fill();
      ctx.fillStyle = "rgba(237, 244, 239, 0.28)";
      roundRect(ctx, 10, 4.5, 9, 2, 1);
      ctx.fill();

      ctx.strokeStyle = weakSignal ? "rgba(255, 209, 102, 0.72)" : "rgba(142, 216, 255, 0.62)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(20, -7);
      ctx.lineTo(26, -12);
      ctx.moveTo(20, 7);
      ctx.lineTo(26, 12);
      ctx.stroke();
      ctx.restore();
    }

    drawCrewMember(game, crew) {
      if (!crew.alive) {
        if (!crew.inTank) this.drawInfantryCorpse(crew);
        return;
      }
      if (crew.inTank) return;
      const color = crew.team === TEAM.BLUE ? "#8ed8ff" : "#ff938c";
      this.drawInfantry(game, crew, { color, showPrompt: false });
    }

    drawInfantryUnit(game, unit) {
      if (unit.inVehicle) return;
      if (!unit.alive) {
        this.drawInfantryCorpse(unit);
        return;
      }
      const color = unit.team === TEAM.BLUE ? "#b6dcff" : "#ffb0ab";
      this.drawInfantry(game, unit, { color, showPrompt: false });
      this.drawInfantryHealth(unit);
      this.drawInfantrySuppression(unit);
      this.drawInfantryThought(unit);
    }

    drawInfantryCorpse(unit) {
      const ctx = this.ctx;
      const now = typeof performance !== "undefined" ? performance.now() / 1000 : 0;
      const age = unit.deathTime ? Math.max(0, now - unit.deathTime) : 1;
      const fall = clamp(age / 0.3, 0, 1);
      const poseAngle = unit.deathPoseAngle || unit.angle + Math.PI / 2;
      const angle = lerp(unit.angle || 0, poseAngle, fall);
      const radius = unit.radius || 10;
      const color = unit.team === TEAM.BLUE ? "#48697c" : "#76504e";
      ctx.save();
      ctx.translate(unit.x, unit.y);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.84 - fall * 0.2;
      ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
      ctx.beginPath();
      ctx.ellipse(-1, 4, 17, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      roundRect(ctx, -radius * 1.08, -radius * 0.45, radius * 2, radius * 0.9, 5);
      ctx.fill();

      ctx.fillStyle = "rgba(15, 19, 16, 0.46)";
      roundRect(ctx, -radius * 1.38, -radius * 0.24, radius * 0.42, radius * 0.48, 2);
      ctx.fill();

      ctx.fillStyle = "#9aa496";
      ctx.beginPath();
      ctx.arc(radius * 1.03, 0, Math.max(3.3, radius * 0.32), 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#252b25";
      roundRect(ctx, radius * 0.04, -2, radius * 1.25, 4, 2);
      ctx.fill();
      ctx.restore();
    }

    drawInfantryHealth(unit) {
      if (unit.hp >= unit.maxHp) return;

      const ctx = this.ctx;
      const width = 28;
      const pct = unit.maxHp > 0 ? clamp(unit.hp / unit.maxHp, 0, 1) : 0;
      ctx.save();
      ctx.translate(unit.x, unit.y - 22);
      ctx.fillStyle = "rgba(9, 15, 13, 0.7)";
      roundRect(ctx, -width / 2, -3, width, 5, 2);
      ctx.fill();
      ctx.fillStyle = unit.team === TEAM.BLUE ? "#8ed8ff" : "#ff938c";
      roundRect(ctx, -width / 2, -3, width * pct, 5, 2);
      ctx.fill();
      ctx.restore();
    }

    drawInfantrySuppression(unit) {
      if (!unit.suppression || unit.suppression < 2) return;

      const ctx = this.ctx;
      const pct = clamp(unit.suppression / 100, 0, 1);
      ctx.save();
      ctx.translate(unit.x, unit.y);
      ctx.globalAlpha = 0.18 + pct * 0.42;
      ctx.strokeStyle = unit.suppressed ? "#ffd166" : "rgba(255, 209, 102, 0.72)";
      ctx.lineWidth = unit.suppressed ? 2 : 1.4;
      if (unit.suppressed) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, 15 + pct * 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    drawInfantryThought(unit) {
      const thought = unit.ai?.thoughtText || "";
      const timer = unit.ai?.thoughtTimer || 0;
      if (!thought || timer <= 0) return;

      const ctx = this.ctx;
      const alpha = clamp(timer / 0.35, 0, 1);
      const y = unit.y - (unit.isProne ? 38 : 46);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "800 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const width = Math.min(122, Math.max(42, ctx.measureText(thought).width + 15));
      const height = 17;
      const x = unit.x - width / 2;
      const bg = unit.team === TEAM.BLUE ? "rgba(9, 24, 28, 0.78)" : "rgba(31, 14, 14, 0.78)";
      const stroke = unit.team === TEAM.BLUE ? "rgba(182, 220, 255, 0.68)" : "rgba(255, 176, 171, 0.68)";

      ctx.fillStyle = bg;
      roundRect(ctx, x, y - height / 2, width, height, 5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(unit.x - 4, y + height / 2 - 1);
      ctx.lineTo(unit.x + 4, y + height / 2 - 1);
      ctx.lineTo(unit.x, y + height / 2 + 5);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      roundRect(ctx, x, y - height / 2, width, height, 5);
      ctx.stroke();
      ctx.fillStyle = "#edf4ef";
      ctx.fillText(thought, unit.x, y + 0.5);
      ctx.restore();
    }

    drawProjectiles(game) {
      const ctx = this.ctx;
      for (const shell of game.projectiles) {
        if (shell.ammo.id === "rpg") {
          this.drawRocketProjectile(shell);
          continue;
        }
        if (shell.ammo.id === "grenade") {
          this.drawGrenadeProjectile(shell);
          continue;
        }

        ctx.save();
        ctx.strokeStyle = shell.ammo.color;
        ctx.lineWidth = shell.radius;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(shell.previousX, shell.previousY);
        ctx.lineTo(shell.x, shell.y);
        ctx.stroke();
        ctx.fillStyle = shell.ammo.color;
        ctx.beginPath();
        ctx.arc(shell.x, shell.y, shell.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    drawGrenadeProjectile(shell) {
      const ctx = this.ctx;
      const launcher = shell.ammo.sourceWeaponId === "grenadeLauncher";
      const warning = shell.life < 0.72;
      const pulse = warning ? 1 + Math.sin(shell.life * 30) * 0.16 : 1;
      const angle = Math.atan2(shell.vy, shell.vx);

      ctx.save();
      if (launcher) {
        if (!shell.landed) {
          ctx.strokeStyle = "rgba(205, 211, 188, 0.28)";
          ctx.lineWidth = 1.35;
          ctx.beginPath();
          ctx.moveTo(shell.previousX, shell.previousY);
          ctx.lineTo(shell.x, shell.y);
          ctx.stroke();
        }

        ctx.translate(shell.x, shell.y);
        ctx.rotate(angle);
        ctx.fillStyle = "#47513f";
        roundRect(ctx, -7, -3, 13, 6, 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(230, 226, 190, 0.55)";
        ctx.lineWidth = 1;
        roundRect(ctx, -7, -3, 13, 6, 2);
        ctx.stroke();
        ctx.fillStyle = "#2e332b";
        roundRect(ctx, -9, -2, 3.5, 4, 1);
        ctx.fill();
        ctx.fillStyle = "rgba(244, 201, 105, 0.78)";
        ctx.beginPath();
        ctx.arc(5.7, 0, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }

      ctx.fillStyle = shell.ammo.color || "#59654d";
      ctx.strokeStyle = warning ? "rgba(244, 108, 86, 0.66)" : "rgba(28, 34, 25, 0.74)";
      ctx.lineWidth = warning ? 1.8 : 1.35;
      ctx.beginPath();
      ctx.ellipse(shell.x, shell.y, Math.max(3.9, shell.radius * pulse), Math.max(3.2, shell.radius * 0.78), angle * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "rgba(216, 221, 194, 0.62)";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(shell.x + Math.cos(angle + 1.15) * 3.4, shell.y + Math.sin(angle + 1.15) * 2.8, 2.2, 0.15, Math.PI * 1.35);
      ctx.stroke();

      if (warning) {
        ctx.strokeStyle = "rgba(244, 108, 86, 0.34)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(shell.x, shell.y, 8.5 + Math.sin(shell.life * 24) * 1.2, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (!shell.landed) {
        ctx.strokeStyle = "rgba(182, 188, 154, 0.22)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(shell.previousX, shell.previousY);
        ctx.lineTo(shell.x, shell.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawRocketProjectile(shell) {
      const ctx = this.ctx;
      const angle = Math.atan2(shell.vy, shell.vx);
      const length = Math.max(24, shell.ammo.visualLength || 32);
      const width = Math.max(7, shell.radius || 8);
      const tailX = shell.x - Math.cos(angle) * length * 0.88;
      const tailY = shell.y - Math.sin(angle) * length * 0.88;

      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(255, 180, 92, 0.38)";
      ctx.lineWidth = width * 2.1;
      ctx.beginPath();
      ctx.moveTo(shell.previousX, shell.previousY);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      ctx.translate(shell.x, shell.y);
      ctx.rotate(angle);
      ctx.fillStyle = "rgba(23, 28, 21, 0.9)";
      roundRect(ctx, -length * 0.72, -width * 0.5, length, width, 3);
      ctx.fill();

      ctx.fillStyle = "#ffb45c";
      ctx.beginPath();
      ctx.moveTo(length * 0.38, 0);
      ctx.lineTo(length * 0.05, -width * 0.58);
      ctx.lineTo(length * 0.05, width * 0.58);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(255, 226, 160, 0.72)";
      roundRect(ctx, -length * 0.82, -width * 0.32, 7, width * 0.64, 2);
      ctx.fill();
      ctx.restore();
    }

    drawTracers(game) {
      const ctx = this.ctx;
      for (const tracer of game.effects.tracers || []) {
        const alpha = clamp(tracer.life / tracer.maxLife, 0, 1);
        const width = Math.min(tracer.width || 1.2, 1.2);
        ctx.save();
        ctx.globalAlpha = alpha * 0.42;
        ctx.strokeStyle = tracer.color;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tracer.x1, tracer.y1);
        ctx.lineTo(tracer.x2, tracer.y2);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawExplosions(game) {
      const ctx = this.ctx;
      for (const explosion of game.effects.explosions) {
        const alpha = clamp(explosion.life / explosion.maxLife, 0, 1);
        const gradient = ctx.createRadialGradient(explosion.x, explosion.y, 0, explosion.x, explosion.y, explosion.radius);
        if (explosion.smoke) {
          gradient.addColorStop(0, `rgba(45, 41, 35, ${0.42 * alpha})`);
          gradient.addColorStop(0.5, explosion.color.replace(/[\d.]+\)$/u, `${0.28 * alpha})`));
          gradient.addColorStop(1, "rgba(42, 38, 31, 0)");
        } else {
          gradient.addColorStop(0, `rgba(255, 246, 198, ${0.9 * alpha})`);
          gradient.addColorStop(0.2, explosion.color.replace(/[\d.]+\)$/u, `${0.78 * alpha})`));
          gradient.addColorStop(0.58, explosion.color.replace(/[\d.]+\)$/u, `${0.28 * alpha})`));
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        }
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawBlastRings(game) {
      const ctx = this.ctx;
      ctx.save();
      ctx.lineCap = "round";
      for (const ring of game.effects.blastRings || []) {
        const alpha = clamp(ring.life / ring.maxLife, 0, 1);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = ring.color || "rgba(255, 238, 178, 0.65)";
        ctx.lineWidth = (ring.width || 5) * alpha;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawBlastSparks(game) {
      const ctx = this.ctx;
      ctx.save();
      ctx.lineCap = "round";
      for (const spark of game.effects.blastSparks || []) {
        const alpha = clamp(spark.life / spark.maxLife, 0, 1);
        const speedAngle = Math.atan2(spark.vy, spark.vx);
        const tailX = spark.x - Math.cos(speedAngle) * spark.length;
        const tailY = spark.y - Math.sin(speedAngle) * spark.length;
        ctx.globalAlpha = alpha * (spark.alpha ?? 1);
        ctx.strokeStyle = spark.color || "rgba(255, 172, 92, 0.86)";
        ctx.lineWidth = (spark.width || 2.2) * alpha + 0.35;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(spark.x, spark.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawSmoke(game) {
      const ctx = this.ctx;
      for (const cloud of game.effects.smokeClouds) {
        const alpha = clamp(cloud.life / cloud.maxLife, 0, 1);
        const gradient = ctx.createRadialGradient(cloud.x, cloud.y, cloud.radius * 0.1, cloud.x, cloud.y, cloud.radius);
        gradient.addColorStop(0, `rgba(223, 231, 233, ${0.36 * alpha})`);
        gradient.addColorStop(0.55, `rgba(185, 196, 199, ${0.24 * alpha})`);
        gradient.addColorStop(1, "rgba(185, 196, 199, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawPlayerHitConfirmations(game) {
      const confirmations = game.playerHitConfirmations || [];
      if (!confirmations.length) return;

      const ctx = this.ctx;
      const zoom = Math.max(0.35, this.camera.zoom || 1);
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineCap = "round";
      for (const hit of confirmations.slice(-5)) {
        const alpha = clamp(hit.ttl / Math.max(0.001, hit.maxTtl || 1), 0, 1);
        if (alpha <= 0) continue;
        const lethal = Boolean(hit.lethal);
        const radius = (lethal ? 18 : 12) / zoom + (1 - alpha) * (lethal ? 10 : 6) / zoom;
        const arm = (lethal ? 10 : 7) / zoom;
        const gap = (lethal ? 5 : 4) / zoom;
        const color = lethal
          ? `rgba(255, 209, 102, ${0.34 + alpha * 0.56})`
          : `rgba(237, 244, 239, ${0.28 + alpha * 0.54})`;

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = (lethal ? 2.5 : 1.8) / zoom;
        ctx.beginPath();
        ctx.moveTo(hit.x - radius - arm, hit.y - radius - arm);
        ctx.lineTo(hit.x - gap, hit.y - gap);
        ctx.moveTo(hit.x + radius + arm, hit.y - radius - arm);
        ctx.lineTo(hit.x + gap, hit.y - gap);
        ctx.moveTo(hit.x - radius - arm, hit.y + radius + arm);
        ctx.lineTo(hit.x - gap, hit.y + gap);
        ctx.moveTo(hit.x + radius + arm, hit.y + radius + arm);
        ctx.lineTo(hit.x + gap, hit.y + gap);
        ctx.stroke();

        ctx.fillStyle = lethal
          ? `rgba(255, 231, 158, ${0.42 + alpha * 0.52})`
          : `rgba(237, 244, 239, ${0.32 + alpha * 0.5})`;
        ctx.font = `900 ${Math.round((lethal ? 12 : 10) / zoom)}px Inter, sans-serif`;
        const damage = hit.amount > 0 ? ` ${Math.round(hit.amount)}` : "";
        ctx.fillText(`${hit.label || "HIT"}${damage}`, hit.x, hit.y - (radius + 18 / zoom));
      }
      ctx.restore();
    }

    drawCommandHighlights(game) {
      if (!game.adminObserverMode) return;
      if (!game.matchStarted || game.deploymentOpen || game.lobbyOpen) return;

      const ctx = this.ctx;
      const phase = performance.now() / 1000;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const squad of game.squads || []) {
        const order = squad.order;
        if (!squad.manualOrder || !order?.playerIssued || !order.point) continue;
        const units = squad.activeUnits?.() || [];
        if (units.length === 0) continue;
        const center = units.reduce((sum, unit) => ({
          x: sum.x + unit.x,
          y: sum.y + unit.y
        }), { x: 0, y: 0 });
        center.x /= units.length;
        center.y /= units.length;
        this.drawCommandOrderMarker(
          game,
          center,
          order.point,
          `${squad.callSign} ${this.commandTypeLabel(squad.manualOrder.type)}`,
          squad.team,
          phase,
          order.role === "hold"
        );
      }

      for (const vehicle of [...(game.tanks || []), ...(game.humvees || [])]) {
        if (!vehicle.alive || !vehicle.manualOrder) continue;
        const order = game.commanders?.[vehicle.team]?.assignments?.get(vehicle);
        if (!order?.playerIssued || !order.point) continue;
        this.drawCommandOrderMarker(
          game,
          { x: vehicle.x, y: vehicle.y },
          order.point,
          `${vehicle.callSign} ${this.commandTypeLabel(vehicle.manualOrder.type)}`,
          vehicle.team,
          phase,
          order.role === "hold"
        );
      }

      this.drawSelectedCommandAssets(game, phase);
      this.drawCommandPings(game, phase);
      ctx.restore();
    }

    drawCommandPings(game, phase) {
      const pings = (game.commandPings || []).filter((ping) => ping.expiresAt > performance.now());
      if (pings.length === 0) return;
      game.commandPings = pings;

      const ctx = this.ctx;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "800 22px system-ui, sans-serif";
      for (const ping of pings) {
        const life = clamp((ping.expiresAt - performance.now()) / Math.max(1, ping.expiresAt - ping.createdAt), 0, 1);
        const color = this.commandPingColor(ping.type, ping.team);
        const pulse = 0.5 + Math.sin(phase * 5.2) * 0.5;
        const radius = (ping.radius || 240) * (0.88 + pulse * 0.08);

        ctx.globalAlpha = Math.min(0.78, life + 0.18);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 10]);
        ctx.lineDashOffset = -phase * 34;
        ctx.beginPath();
        ctx.arc(ping.x, ping.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = hexToRgba(color, 0.12);
        ctx.beginPath();
        ctx.arc(ping.x, ping.y, radius * 0.28, 0, Math.PI * 2);
        ctx.fill();

        const label = ping.assetCount ? `${ping.label} ${ping.assetCount}` : ping.label;
        const textWidth = ctx.measureText(label).width + 24;
        ctx.fillStyle = "rgba(6, 12, 11, 0.76)";
        ctx.strokeStyle = hexToRgba(color, 0.58);
        ctx.lineWidth = 1.5;
        roundRect(ctx, ping.x - textWidth / 2, ping.y - radius - 18, textWidth, 30, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#edf4ef";
        ctx.fillText(label, ping.x, ping.y - radius - 2);
      }
      ctx.restore();
    }

    commandPingColor(type, team) {
      if (type === "repair") return "#8fe0a3";
      if (type === "scan") return "#ffd166";
      if (type === "fire_support") return "#ff9b6a";
      if (type === "assault") return team === TEAM.RED ? "#ff8a7d" : "#8ed8ff";
      return team === TEAM.RED ? "#ff8a7d" : "#8ed8ff";
    }

    drawSelectedCommandAssets(game, phase) {
      const hud = game.hud;
      if (!hud || hud.nodes?.commandPanel?.classList.contains("hidden")) return;
      const selectedSquads = hud.selectedCommandSquads || new Set();
      const selectedVehicles = hud.selectedCommandVehicles || new Set();
      const ctx = this.ctx;
      const pulse = 0.5 + Math.sin(phase * 5.4) * 0.5;

      ctx.save();
      ctx.strokeStyle = "rgba(255, 209, 102, 0.9)";
      ctx.fillStyle = "rgba(255, 209, 102, 0.12)";
      ctx.lineWidth = 2.4;
      ctx.setLineDash([8, 7]);
      ctx.lineDashOffset = -phase * 28;

      for (const id of selectedSquads) {
        const squad = game.squadById?.(id);
        const units = squad?.activeUnits?.() || [];
        if (units.length === 0) continue;
        const center = units.reduce((sum, unit) => ({
          x: sum.x + unit.x,
          y: sum.y + unit.y
        }), { x: 0, y: 0 });
        center.x /= units.length;
        center.y /= units.length;
        const radius = clamp(
          units.reduce((max, unit) => Math.max(max, distXY(center.x, center.y, unit.x, unit.y)), 42) + 26 + pulse * 5,
          52,
          145
        );
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      for (const id of selectedVehicles) {
        const vehicle = game.vehicleById?.(id);
        if (!vehicle?.alive) continue;
        const radius = (vehicle.vehicleType === "humvee" ? 44 : 62) + pulse * 5;
        ctx.beginPath();
        ctx.arc(vehicle.x, vehicle.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }

    drawCommandOrderMarker(game, origin, target, label, team, phase, hold = false) {
      const ctx = this.ctx;
      const color = team === TEAM.RED ? "#ff8a7d" : "#8ed8ff";
      const pulse = 0.5 + Math.sin(phase * 4) * 0.5;
      const targetRadius = hold ? 86 : 58;

      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash([16, 12]);
      ctx.lineDashOffset = -phase * 36;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.globalAlpha = 0.92;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(target.x, target.y, targetRadius + pulse * 8, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = hexToRgba(color, 0.18);
      ctx.beginPath();
      ctx.arc(target.x, target.y, Math.max(18, targetRadius * 0.28), 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(6, 12, 11, 0.78)";
      ctx.strokeStyle = hexToRgba(color, 0.55);
      ctx.lineWidth = 1.5;
      ctx.font = "700 20px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const textWidth = ctx.measureText(label).width + 22;
      const tagX = origin.x;
      const tagY = origin.y - 48;
      roundRect(ctx, tagX - textWidth / 2, tagY - 14, textWidth, 28, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#edf4ef";
      ctx.fillText(label, tagX, tagY + 1);
      ctx.restore();
    }

    commandTypeLabel(type) {
      if (type === "attack") return "공격";
      if (type === "defend") return "방어";
      if (type === "retreat") return "후퇴";
      if (type === "rally") return "집결";
      if (type === "assault") return "돌격";
      if (type === "repair") return "수리";
      if (type === "scan") return "정찰";
      if (type === "fire_support") return "화력지원";
      return "이동";
    }

    drawScreenVignette(game) {
      const ctx = this.ctx;
      const camera = this.camera;
      const gradient = ctx.createRadialGradient(
        camera.width / 2,
        camera.height / 2,
        Math.min(camera.width, camera.height) * 0.32,
        camera.width / 2,
        camera.height / 2,
        Math.max(camera.width, camera.height) * 0.72
      );
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, "rgba(0,0,0,0.28)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, camera.width, camera.height);

      this.drawPlayerDamageOverlay(game);

      if (game.result) {
        ctx.save();
        ctx.fillStyle = "rgba(5, 9, 8, 0.54)";
        ctx.fillRect(0, 0, camera.width, camera.height);
        const resultTitle = game.result === "BLUE VICTORY" ? "승리" : "패배";
        const reason = game.resultReason || "전투 종료";
        ctx.fillStyle = "#edf4ef";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "900 44px Inter, sans-serif";
        ctx.fillText(resultTitle, camera.width / 2, camera.height / 2 - 22);
        ctx.fillStyle = game.result === "BLUE VICTORY" ? "#8ed8ff" : "#ff938c";
        ctx.font = "800 18px Inter, sans-serif";
        ctx.fillText(reason, camera.width / 2, camera.height / 2 + 28);
        ctx.restore();
      }
    }

    drawPlayerDamageOverlay(game) {
      const ctx = this.ctx;
      const camera = this.camera;
      const flash = clamp(game.playerDamageFlash || 0, 0, 1);

      if (flash > 0.01) {
        ctx.save();
        const gradient = ctx.createRadialGradient(
          camera.width / 2,
          camera.height / 2,
          Math.min(camera.width, camera.height) * 0.22,
          camera.width / 2,
          camera.height / 2,
          Math.max(camera.width, camera.height) * 0.68
        );
        gradient.addColorStop(0, `rgba(128, 18, 16, ${0.03 * flash})`);
        gradient.addColorStop(0.62, `rgba(180, 32, 28, ${0.1 * flash})`);
        gradient.addColorStop(1, `rgba(220, 42, 36, ${0.32 * flash})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, camera.width, camera.height);
        ctx.restore();
      }

      const indicators = [
        ...(game.playerDangerWarnings || []),
        ...(game.playerDamageIndicators || [])
      ].slice(-5);

      if (indicators.length > 0) {
        const cx = camera.width / 2;
        const cy = camera.height / 2;
        const radius = Math.min(camera.width, camera.height) * 0.31;

        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const item of indicators) {
          const alpha = clamp(item.ttl / Math.max(0.001, item.maxTtl || 1), 0, 1);
          const dangerOnly = !item.amount;
          const angle = item.angle || 0;
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius;
          const size = dangerOnly ? 13 : 17;

          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle + Math.PI / 2);
          ctx.globalAlpha = dangerOnly ? 0.2 + alpha * 0.42 : 0.28 + alpha * 0.58;
          ctx.fillStyle = dangerOnly ? "rgba(255, 209, 102, 0.95)" : "rgba(255, 90, 78, 0.96)";
          ctx.beginPath();
          ctx.moveTo(0, -size);
          ctx.lineTo(size * 0.72, size * 0.58);
          ctx.lineTo(0, size * 0.28);
          ctx.lineTo(-size * 0.72, size * 0.58);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          if (alpha > 0.35) {
            ctx.globalAlpha = dangerOnly ? 0.45 + alpha * 0.34 : 0.5 + alpha * 0.42;
            ctx.fillStyle = dangerOnly ? "rgba(255, 231, 158, 0.96)" : "rgba(255, 206, 198, 0.97)";
            ctx.font = dangerOnly ? "800 11px Inter, sans-serif" : "900 12px Inter, sans-serif";
            ctx.fillText(item.label || "\uC704\uD5D8", x, y + size + 14);
          }
        }
        ctx.restore();
      }

      if (!game.playerDowned || game.playerDeathActive || game.result) return;

      ctx.save();
      ctx.fillStyle = "rgba(5, 7, 7, 0.44)";
      ctx.fillRect(0, 0, camera.width, camera.height);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255, 210, 198, 0.96)";
      ctx.font = "900 38px Inter, sans-serif";
      ctx.fillText("\uC804\uD22C \uBD88\uB2A5", camera.width / 2, camera.height / 2 - 28);
      ctx.fillStyle = "rgba(237, 244, 239, 0.9)";
      ctx.font = "800 15px Inter, sans-serif";
      ctx.fillText(game.playerPendingDeathReason || "\uD53C\uACA9 \uC6D0\uC778 \uD655\uC778 \uC911", camera.width / 2, camera.height / 2 + 12, camera.width * 0.86);
      ctx.fillStyle = "rgba(255, 209, 102, 0.88)";
      ctx.font = "800 13px Inter, sans-serif";
      ctx.fillText(`\uC0C1\uD669 \uD655\uC778 ${Math.max(0, game.playerDownedTimer || 0).toFixed(1)}s`, camera.width / 2, camera.height / 2 + 42);
      ctx.restore();
    }

    drawStartCountdown(game) {
      if (game.matchStarted || game.result || game.deploymentOpen || !game.countdownStarted) return;

      const ctx = this.ctx;
      const camera = this.camera;
      if (game.matchPhase === "loading") {
        this.drawMatchLoading(game);
        return;
      }
      const remaining = Math.max(1, Math.ceil(game.startCountdown || 0));
      const ready = (game.startCountdown || 0) <= 0.8;

      ctx.save();
      ctx.fillStyle = "rgba(5, 9, 8, 0.18)";
      ctx.fillRect(0, 0, camera.width, camera.height);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = ready ? "#72e89a" : "#ffd166";
      ctx.font = "900 92px Inter, sans-serif";
      ctx.fillText(ready ? "출격" : `${remaining}`, camera.width / 2, camera.height * 0.34);

      ctx.fillStyle = "rgba(237, 244, 239, 0.92)";
      ctx.font = "900 18px Inter, sans-serif";
      ctx.fillText("기지에서 차량에 탑승하세요", camera.width / 2, camera.height * 0.34 + 78);

      ctx.fillStyle = "rgba(237, 244, 239, 0.64)";
      ctx.font = "800 12px Inter, sans-serif";
      ctx.fillText("F 탑승/하차 / 1 철갑탄 / 2 고폭탄 / 우클릭 조준", camera.width / 2, camera.height * 0.34 + 108);
      ctx.restore();
    }

    drawAnnihilationRoundOverlay(game) {
      const state = game.annihilation;
      if (!state || game.matchConfig?.mode !== "annihilation" || game.result) return;
      if (!game.matchStarted && state.state !== "intermission") return;

      const ctx = this.ctx;
      const camera = this.camera;
      const blueName = game.annihilationTeamName?.(TEAM.BLUE) || "청팀";
      const redName = game.annihilationTeamName?.(TEAM.RED) || "홍팀";
      const score = game.annihilationScoreText?.() || `${state.score?.[TEAM.BLUE] || 0} : ${state.score?.[TEAM.RED] || 0}`;
      const targetScore = game.annihilationObjectiveScoreTarget?.() || state.targetScore || 300;
      const topText = `${blueName} ${score} ${redName} · 목표 ${targetScore}점`;

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "900 13px Inter, sans-serif";
      const topWidth = Math.min(camera.width - 28, Math.max(260, ctx.measureText(topText).width + 44));
      const topX = camera.width / 2 - topWidth / 2;
      const topY = 18;
      roundRect(ctx, topX, topY, topWidth, 34, 8);
      ctx.fillStyle = "rgba(7, 13, 12, 0.78)";
      ctx.fill();
      ctx.strokeStyle = "rgba(237, 244, 239, 0.22)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#edf4ef";
      ctx.fillText(topText, camera.width / 2, topY + 17);

      if (game.isRoundSpectatorMode?.()) {
        const specText = "관전 중";
        ctx.font = "900 12px Inter, sans-serif";
        const specWidth = Math.min(camera.width - 28, Math.max(160, ctx.measureText(specText).width + 34));
        const specX = camera.width / 2 - specWidth / 2;
        const specY = topY + 42;
        roundRect(ctx, specX, specY, specWidth, 28, 8);
        ctx.fillStyle = "rgba(255, 209, 102, 0.15)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 209, 102, 0.36)";
        ctx.stroke();
        ctx.fillStyle = "#ffe2a3";
        ctx.fillText(specText, camera.width / 2, specY + 14);
      }

      ctx.restore();
    }

    drawMatchLoading(game) {
      const ctx = this.ctx;
      const camera = this.camera;
      const loading = game.startLoading || {};
      const duration = Math.max(0.1, loading.duration || 1);
      const progress = clamp(1 - (loading.remaining || 0) / duration, 0, 1);
      const steps = loading.steps || [];
      const step = steps[loading.stepIndex || 0] || "전투 시작 준비";
      const w = Math.min(520, camera.width * 0.82);
      const x = camera.width / 2 - w / 2;
      const y = camera.height * 0.38;

      ctx.save();
      ctx.fillStyle = "rgba(5, 9, 8, 0.46)";
      ctx.fillRect(0, 0, camera.width, camera.height);
      ctx.fillStyle = "rgba(8, 14, 12, 0.88)";
      ctx.strokeStyle = "rgba(237, 244, 239, 0.18)";
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, w, 148, 8);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#edf4ef";
      ctx.font = "900 28px Inter, sans-serif";
      ctx.fillText("전장 준비 중", camera.width / 2, y + 38);
      ctx.fillStyle = "rgba(237, 244, 239, 0.72)";
      ctx.font = "800 14px Inter, sans-serif";
      ctx.fillText(step, camera.width / 2, y + 70);

      const barX = x + 34;
      const barY = y + 104;
      const barW = w - 68;
      ctx.fillStyle = "rgba(237, 244, 239, 0.1)";
      roundRect(ctx, barX, barY, barW, 12, 6);
      ctx.fill();
      ctx.fillStyle = "#ffd166";
      roundRect(ctx, barX, barY, barW * progress, 12, 6);
      ctx.fill();
      ctx.restore();
    }

    drawAimModeOverlay(game) {
      if (!game.player.inTank || !game.input.mouse.rightDown) return;

      const ctx = this.ctx;
      const camera = this.camera;
      const cx = camera.width / 2;
      const cy = camera.height / 2;
      const edge = Math.min(camera.width, camera.height) * 0.12;

      ctx.save();
      ctx.fillStyle = "rgba(5, 9, 8, 0.12)";
      ctx.fillRect(0, 0, camera.width, 42);
      ctx.fillRect(0, camera.height - 42, camera.width, 42);
      ctx.fillRect(0, 0, 38, camera.height);
      ctx.fillRect(camera.width - 38, 0, 38, camera.height);

      ctx.strokeStyle = "rgba(237, 244, 239, 0.24)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 14]);
      ctx.beginPath();
      ctx.moveTo(cx - edge, cy);
      ctx.lineTo(cx + edge, cy);
      ctx.moveTo(cx, cy - edge);
      ctx.lineTo(cx, cy + edge);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = "rgba(255, 209, 102, 0.36)";
      ctx.lineWidth = 2;
      const corner = 28;
      const margin = 58;
      const corners = [
        [margin, margin, 1, 1],
        [camera.width - margin, margin, -1, 1],
        [margin, camera.height - margin, 1, -1],
        [camera.width - margin, camera.height - margin, -1, -1]
      ];
      for (const [x, y, sx, sy] of corners) {
        ctx.beginPath();
        ctx.moveTo(x, y + sy * corner);
        ctx.lineTo(x, y);
        ctx.lineTo(x + sx * corner, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawScoutAimOverlay(game) {
      if (!game.isPlayerScoutAimMode?.()) return;

      const ctx = this.ctx;
      const camera = this.camera;
      const zoom = camera.zoom || 1;
      const sx = (game.input.mouse.worldX - camera.x) * zoom;
      const sy = (game.input.mouse.worldY - camera.y) * zoom;
      const radius = Math.min(camera.width, camera.height) * 0.16;

      ctx.save();
      ctx.fillStyle = "rgba(5, 9, 8, 0.1)";
      ctx.fillRect(0, 0, camera.width, 34);
      ctx.fillRect(0, camera.height - 34, camera.width, 34);
      ctx.fillRect(0, 0, 30, camera.height);
      ctx.fillRect(camera.width - 30, 0, 30, camera.height);

      ctx.strokeStyle = "rgba(237, 244, 239, 0.28)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([7, 9]);
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.moveTo(sx - radius * 1.18, sy);
      ctx.lineTo(sx + radius * 1.18, sy);
      ctx.moveTo(sx, sy - radius * 1.18);
      ctx.lineTo(sx, sy + radius * 1.18);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = "rgba(120, 214, 140, 0.64)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sx - 14, sy);
      ctx.lineTo(sx - 4, sy);
      ctx.moveTo(sx + 4, sy);
      ctx.lineTo(sx + 14, sy);
      ctx.moveTo(sx, sy - 14);
      ctx.lineTo(sx, sy - 4);
      ctx.moveTo(sx, sy + 4);
      ctx.lineTo(sx, sy + 14);
      ctx.stroke();

      const designation = game.droneDesignatedContact?.();
      const activeDrone = game.activeReconDroneForSniper?.();
      const weapon = game.player?.getWeapon?.();
      const designatedTarget = designation?.drone === activeDrone ? designation.target : null;
      const targetAlive = designatedTarget?.alive !== undefined ? designatedTarget?.alive : designatedTarget?.hp > 0;
      const showDesignatedRange = Boolean(designatedTarget && targetAlive && weapon?.id === "sniper");
      if (showDesignatedRange) {
        const range = game.observedSniperRange?.(weapon, activeDrone, true) || weapon.range || 980;
        const rangeDistance = distXY(game.player.x, game.player.y, designatedTarget.x, designatedTarget.y);
        const inRange = rangeDistance <= range;
        const px = (game.player.x - camera.x) * zoom;
        const py = (game.player.y - camera.y) * zoom;
        const txRaw = (designatedTarget.x - camera.x) * zoom;
        const tyRaw = (designatedTarget.y - camera.y) * zoom;
        const margin = 42;
        const tx = clamp(txRaw, margin, camera.width - margin);
        const ty = clamp(tyRaw, 52, camera.height - 52);
        const offscreen = Math.abs(tx - txRaw) > 0.5 || Math.abs(ty - tyRaw) > 0.5;
        const pulse = 0.5 + Math.sin((game.matchTime || 0) * 8.5) * 0.5;
        const rangeColor = inRange ? "255, 209, 102" : "226, 93, 74";

        ctx.strokeStyle = `rgba(${rangeColor}, ${inRange ? 0.34 : 0.42})`;
        ctx.lineWidth = inRange ? 1.7 : 1.4;
        ctx.setLineDash(inRange ? [10, 9] : [5, 7]);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = `rgba(${rangeColor}, ${0.72 + pulse * 0.18})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tx, ty, offscreen ? 14 + pulse * 3 : 25 + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();

        if (offscreen) {
          const arrowAngle = angleTo(px, py, txRaw, tyRaw);
          ctx.save();
          ctx.translate(tx, ty);
          ctx.rotate(arrowAngle);
          ctx.fillStyle = `rgba(${rangeColor}, 0.78)`;
          ctx.beginPath();
          ctx.moveTo(16, 0);
          ctx.lineTo(2, -6);
          ctx.lineTo(2, 6);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        const label = inRange ? "관측 사거리" : "사거리 밖";
        const rangeText = `${Math.round(rangeDistance)} / ${Math.round(range)}`;
        const labelWidth = 86;
        const labelX = clamp(tx + 48, 50, camera.width - 50);
        const labelY = clamp(ty - 26, 48, camera.height - 48);
        ctx.fillStyle = inRange ? "rgba(37, 32, 16, 0.78)" : "rgba(42, 18, 16, 0.78)";
        roundRect(ctx, labelX - labelWidth / 2, labelY - 17, labelWidth, 34, 4);
        ctx.fill();
        ctx.strokeStyle = `rgba(${rangeColor}, 0.64)`;
        ctx.lineWidth = 1;
        roundRect(ctx, labelX - labelWidth / 2, labelY - 17, labelWidth, 34, 4);
        ctx.stroke();
        ctx.fillStyle = inRange ? "rgba(255, 231, 150, 0.94)" : "rgba(255, 167, 142, 0.94)";
        ctx.font = "700 11px Rajdhani, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, labelX, labelY - 5);
        ctx.fillStyle = "rgba(237, 244, 239, 0.76)";
        ctx.font = "700 10px Rajdhani, sans-serif";
        ctx.fillText(rangeText, labelX, labelY + 8);
      }

      const observedContacts = game.reconDroneObservedContacts?.({ sniperOnly: true }) || [];
      const observed = game.findObservedSniperTarget?.();
      if (observedContacts.length > 0) {
        ctx.lineWidth = 1.1;
        for (const target of observedContacts) {
          if (observed?.target === target) continue;
          const tx = (target.x - camera.x) * zoom;
          const ty = (target.y - camera.y) * zoom;
          const markerRadius = 13;
          ctx.strokeStyle = "rgba(143, 222, 207, 0.38)";
          ctx.beginPath();
          ctx.arc(tx, ty, markerRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = "rgba(237, 244, 239, 0.34)";
          ctx.beginPath();
          ctx.moveTo(tx - markerRadius - 6, ty);
          ctx.lineTo(tx - markerRadius - 1, ty);
          ctx.moveTo(tx + markerRadius + 1, ty);
          ctx.lineTo(tx + markerRadius + 6, ty);
          ctx.moveTo(tx, ty - markerRadius - 6);
          ctx.lineTo(tx, ty - markerRadius - 1);
          ctx.moveTo(tx, ty + markerRadius + 1);
          ctx.lineTo(tx, ty + markerRadius + 6);
          ctx.stroke();
        }
      }
      if (observed?.target) {
        const tx = (observed.target.x - camera.x) * zoom;
        const ty = (observed.target.y - camera.y) * zoom;
        const dx = (observed.drone.x - camera.x) * zoom;
        const dy = (observed.drone.y - camera.y) * zoom;
        const pulse = 0.5 + Math.sin((game.matchTime || 0) * 7) * 0.5;
        const designated = Boolean(observed.designated);

        ctx.strokeStyle = designated
          ? `rgba(255, 209, 102, ${0.54 + pulse * 0.26})`
          : `rgba(143, 222, 207, ${0.42 + pulse * 0.26})`;
        ctx.lineWidth = designated ? 1.5 : 1.1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = designated ? "rgba(255, 209, 102, 0.92)" : "rgba(143, 222, 207, 0.88)";
        ctx.lineWidth = designated ? 2.2 : 1.8;
        ctx.beginPath();
        ctx.arc(tx, ty, (designated ? 21 : 17) + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = "rgba(237, 244, 239, 0.72)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(tx - 22, ty - 8);
        ctx.lineTo(tx - 22, ty - 16);
        ctx.lineTo(tx - 14, ty - 16);
        ctx.moveTo(tx + 22, ty - 8);
        ctx.lineTo(tx + 22, ty - 16);
        ctx.lineTo(tx + 14, ty - 16);
        ctx.moveTo(tx - 22, ty + 8);
        ctx.lineTo(tx - 22, ty + 16);
        ctx.lineTo(tx - 14, ty + 16);
        ctx.moveTo(tx + 22, ty + 8);
        ctx.lineTo(tx + 22, ty + 16);
        ctx.lineTo(tx + 14, ty + 16);
        ctx.stroke();
      }
      ctx.restore();
    }

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

  Renderer.VERSION = "canvas-renderer-v1";
  IronLine.Renderer = Renderer;
})(window);
