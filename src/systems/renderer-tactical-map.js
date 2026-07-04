"use strict";

(function registerRendererTacticalMap(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, TEAM_COLORS } = IronLine.constants;
  const { clamp, roundRect } = IronLine.math;
  const proto = IronLine.Renderer?.prototype;
  if (!proto) return;

  const ORDER_COLOR = "rgba(255, 209, 102, 0.94)";
  const ORDER_FILL = "rgba(255, 209, 102, 0.16)";
  const SELECTED_COLOR = "rgba(246, 255, 232, 0.96)";
  const MAP_COLS = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const MAP_ROWS = ["1", "2", "3", "4", "5", "6", "7", "8"];

  Object.assign(proto, {
    drawCommandMinimapOverlays(game, map, viewerTeam, expanded = false) {
      const entries = this.commandMapEntries(game, viewerTeam);
      if (!entries.length && !expanded) {
        this.drawSelectedCommandMapAssets(game, map, viewerTeam, expanded);
        return;
      }

      const ctx = this.ctx;
      const phase = performance.now() / 1000;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const entry of entries) {
        const alpha = expanded ? Math.max(0.42, entry.alpha) : entry.alpha;
        if (alpha <= 0.05) continue;
        const target = this.mapPoint(map, entry.target);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = ORDER_COLOR;
        ctx.fillStyle = ORDER_FILL;
        ctx.lineWidth = expanded ? 2.2 : 1.35;
        ctx.setLineDash(expanded ? [9, 7] : [4, 4]);
        ctx.lineDashOffset = -phase * (expanded ? 18 : 10);

        for (const asset of entry.assets) {
          const origin = this.mapPoint(map, asset);
          ctx.beginPath();
          ctx.moveTo(origin.x, origin.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
          this.drawCommandAssetDot(ctx, origin.x, origin.y, expanded, entry.recent);
        }

        ctx.setLineDash([]);
        this.drawCommandTargetGlyph(ctx, target.x, target.y, expanded, entry.hold, entry.recent, phase);
        if (expanded) this.drawCommandMapLabel(ctx, target.x, target.y, entry.label);
      }

      ctx.restore();
      this.drawSelectedCommandMapAssets(game, map, viewerTeam, expanded);
    },

    drawTacticalMapOverlay(game) {
      if (!game.tacticalMapOpen) return;
      const ctx = this.ctx;
      const camera = this.camera;
      const compact = camera.width < 740 || camera.height < 560;
      const mapSize = Math.floor(Math.min(
        compact ? camera.width - 54 : camera.width - 140,
        compact ? camera.height - 82 : camera.height - 128,
        compact ? 500 : 620
      ));
      if (mapSize < 230) return;

      const gutterX = compact ? 24 : 31;
      const gutterTop = compact ? 28 : 34;
      const gutterBottom = compact ? 24 : 30;
      const width = mapSize + gutterX * 2;
      const height = mapSize + gutterTop + gutterBottom;
      const x = Math.round((camera.width - width) / 2);
      const y = Math.round((camera.height - height) / 2);
      const map = {
        x: x + gutterX,
        y: y + gutterTop,
        w: mapSize,
        h: mapSize,
        sx: mapSize / game.world.width,
        sy: mapSize / game.world.height,
        cols: MAP_COLS.length,
        rows: MAP_ROWS.length
      };
      const player = game.adminObserverMode ? null : game.player;
      const viewerTeam = player?.team;

      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
      ctx.fillRect(0, 0, camera.width, camera.height);
      ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 12;
      ctx.fillStyle = "rgba(7, 12, 11, 0.92)";
      ctx.strokeStyle = "rgba(237, 244, 239, 0.18)";
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, width, height, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.stroke();

      ctx.fillStyle = "rgba(237, 244, 239, 0.88)";
      ctx.font = "900 12px Rajdhani, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("TACTICAL MAP", x + gutterX, y + 15);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(237, 244, 239, 0.5)";
      ctx.font = "800 10px Rajdhani, system-ui, sans-serif";
      ctx.fillText("M CLOSE", x + width - gutterX, y + 15);

      ctx.save();
      roundRect(ctx, map.x, map.y, map.w, map.h, 2);
      ctx.clip();
      this.drawTacticalMapBase(game, map, viewerTeam, player);
      this.drawCommandMinimapOverlays(game, map, viewerTeam, true);
      this.drawTacticalViewRect(map, camera);
      ctx.restore();

      this.drawTacticalCoordinateFrame(game, map, x, y, width, height);
      ctx.restore();
    },

    drawTacticalMapBase(game, map, viewerTeam, player) {
      const ctx = this.ctx;
      this.drawTacticalTerrainBackdrop(game, map);

      for (const road of game.world.roads || []) {
        if (!road.length) continue;
        ctx.beginPath();
        ctx.moveTo(map.x + road[0].x * map.sx, map.y + road[0].y * map.sy);
        for (let i = 1; i < road.length; i += 1) {
          ctx.lineTo(map.x + road[i].x * map.sx, map.y + road[i].y * map.sy);
        }
        ctx.strokeStyle = "rgba(11, 14, 14, 0.48)";
        ctx.lineWidth = 10;
        ctx.stroke();
        ctx.strokeStyle = "rgba(122, 131, 125, 0.38)";
        ctx.lineWidth = 6.4;
        ctx.stroke();
      }

      this.drawTacticalMapObjects(game, map);

      for (const zone of game.world.safeZones || []) {
        const point = this.mapPoint(map, zone);
        ctx.fillStyle = zone.team === TEAM.RED ? "rgba(255, 103, 97, 0.15)" : "rgba(79, 210, 255, 0.15)";
        ctx.strokeStyle = zone.team === TEAM.RED ? "rgba(255, 103, 97, 0.5)" : "rgba(79, 210, 255, 0.5)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      for (const point of game.capturePoints || []) {
        const screen = this.mapPoint(map, point);
        const ownerColor = TEAM_COLORS[point.owner] || "#d6d1bd";
        ctx.fillStyle = "rgba(6, 12, 11, 0.78)";
        ctx.strokeStyle = "rgba(237, 244, 239, 0.72)";
        ctx.lineWidth = 1.2;
        roundRect(ctx, screen.x - 11, screen.y - 9, 22, 18, 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = ownerColor;
        ctx.fillRect(screen.x - 8, screen.y + 6, 16, 4);
        ctx.fillStyle = "rgba(237, 244, 239, 0.94)";
        ctx.font = "900 10px Rajdhani, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(point.name, screen.x, screen.y - 1);
      }

      this.drawTacticalUnitDots(game, map, viewerTeam);
      this.drawTacticalHumanDots(game, map, viewerTeam, player);
    },

    drawTacticalTerrainBackdrop(game, map) {
      const ctx = this.ctx;
      const gradient = ctx.createLinearGradient(map.x, map.y, map.x + map.w, map.y + map.h);
      gradient.addColorStop(0, "#314039");
      gradient.addColorStop(0.48, "#252f2b");
      gradient.addColorStop(1, "#59605a");
      ctx.fillStyle = gradient;
      ctx.fillRect(map.x, map.y, map.w, map.h);

      ctx.save();
      ctx.globalAlpha = 0.16;
      for (let row = -1; row < 16; row += 1) {
        const y = map.y + row * 42;
        ctx.beginPath();
        for (let i = 0; i <= 34; i += 1) {
          const t = i / 34;
          const x = map.x + t * map.w;
          const wave = Math.sin(t * 12 + row * 0.7) * 14 + Math.cos(t * 23 + row) * 5;
          if (i === 0) ctx.moveTo(x, y + wave);
          else ctx.lineTo(x, y + wave);
        }
        ctx.strokeStyle = row % 3 === 0 ? "rgba(237, 244, 239, 0.24)" : "rgba(15, 20, 19, 0.26)";
        ctx.lineWidth = row % 3 === 0 ? 1.2 : 0.8;
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.12;
      for (let i = 0; i < 38; i += 1) {
        const px = map.x + ((i * 73) % Math.max(1, map.w));
        const py = map.y + ((i * 119) % Math.max(1, map.h));
        const r = 10 + (i % 6) * 5;
        ctx.fillStyle = i % 4 === 0 ? "#73806f" : "#141b18";
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    drawTacticalMapObjects(game, map) {
      const ctx = this.ctx;
      const drawRect = (item, fill, stroke, alpha = 1) => {
        if (!item || item.destroyed) return;
        const x = map.x + (Number(item.x) || 0) * map.sx;
        const y = map.y + (Number(item.y) || 0) * map.sy;
        const w = Math.max(2, (Number(item.w) || Number(item.r) * 2 || 24) * map.sx);
        const h = Math.max(2, (Number(item.h) || Number(item.r) * 2 || 24) * map.sy);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.8;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.globalAlpha = 1;
      };

      for (const obstacle of game.world.obstacles || []) {
        if (obstacle.kind === "tree" || obstacle.kind === "brush" || obstacle.kind === "rubble") continue;
        drawRect(obstacle, "rgba(41, 47, 44, 0.74)", "rgba(237, 244, 239, 0.14)", 0.86);
      }

      for (const item of game.world.scenery || []) {
        if (item.destroyed) continue;
        if (item.shape === "circle" || item.type === "tree" || item.type === "brush" || item.r) {
          const x = map.x + (Number(item.x) || 0) * map.sx;
          const y = map.y + (Number(item.y) || 0) * map.sy;
          const r = Math.max(2.5, (Number(item.r) || 18) * Math.max(map.sx, map.sy));
          ctx.fillStyle = item.type === "tree" ? "rgba(37, 68, 44, 0.68)" : "rgba(79, 87, 72, 0.42)";
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          drawRect(item, "rgba(83, 82, 67, 0.5)", "rgba(237, 244, 239, 0.1)", 0.75);
        }
      }
    },

    drawTacticalCoordinateFrame(game, map, panelX, panelY, panelW, panelH) {
      const ctx = this.ctx;
      const cellW = map.w / map.cols;
      const cellH = map.h / map.rows;

      ctx.save();
      ctx.strokeStyle = "rgba(237, 244, 239, 0.28)";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(map.x, map.y, map.w, map.h);

      ctx.strokeStyle = "rgba(237, 244, 239, 0.18)";
      ctx.lineWidth = 1;
      for (let i = 1; i < map.cols; i += 1) {
        const x = map.x + cellW * i;
        ctx.beginPath();
        ctx.moveTo(x, map.y);
        ctx.lineTo(x, map.y + map.h);
        ctx.stroke();
      }
      for (let i = 1; i < map.rows; i += 1) {
        const y = map.y + cellH * i;
        ctx.beginPath();
        ctx.moveTo(map.x, y);
        ctx.lineTo(map.x + map.w, y);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(237, 244, 239, 0.72)";
      ctx.font = "900 11px Rajdhani, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < map.cols; i += 1) {
        const x = map.x + cellW * (i + 0.5);
        ctx.fillText(MAP_COLS[i], x, map.y - 13);
        ctx.fillText(MAP_COLS[i], x, map.y + map.h + 14);
      }

      for (let i = 0; i < map.rows; i += 1) {
        const y = map.y + cellH * (i + 0.5);
        ctx.fillText(MAP_ROWS[i], map.x - 14, y);
        ctx.fillText(MAP_ROWS[i], map.x + map.w + 14, y);
      }

      const gridMeters = Math.round(game.world.width / map.cols);
      ctx.fillStyle = "rgba(237, 244, 239, 0.44)";
      ctx.font = "800 9px Rajdhani, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`GRID ${gridMeters}m`, panelX + 10, panelY + panelH - 9);
      ctx.textAlign = "right";
      ctx.fillText("BLUE/RED UNIT SYMBOLS", panelX + panelW - 10, panelY + panelH - 9);
      ctx.restore();
    },

    drawTacticalUnitDots(game, map, viewerTeam) {
      const ctx = this.ctx;
      const drawUnit = (entity, radius, square = false) => {
        if (!entity?.alive || !this.shouldDrawMinimapContact(game, entity, viewerTeam)) return;
        const point = this.minimapContactPoint(game, entity, viewerTeam);
        const screen = this.mapPoint(map, point);
        ctx.globalAlpha = point.alpha ?? 1;
        if (square) this.drawTacticalVehicleIcon(entity, screen, radius);
        else {
          ctx.fillStyle = TEAM_COLORS[entity.team] || "#edf4ef";
          ctx.beginPath();
          ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      };
      for (const tank of game.tanks || []) drawUnit(tank, 1, true);
      for (const humvee of game.humvees || []) drawUnit(humvee, 0.72, true);
      for (const unit of game.infantry || []) {
        if (unit.inVehicle) continue;
        drawUnit(unit, 2.2);
      }
    },

    drawTacticalVehicleIcon(entity, screen, scale = 1) {
      const ctx = this.ctx;
      const teamColor = TEAM_COLORS[entity.team] || "#edf4ef";
      const tankLike = entity.type === "tank" || entity.constructor?.name === "Tank" || (entity.radius || 0) >= 28;
      const length = tankLike ? 20 * scale : 17 * scale;
      const width = tankLike ? 12 * scale : 9 * scale;
      const trackW = Math.max(2, width * 0.24);

      ctx.save();
      ctx.translate(screen.x, screen.y);
      ctx.rotate(entity.angle || 0);
      ctx.fillStyle = "rgba(4, 8, 8, 0.72)";
      ctx.fillRect(-length / 2 - 1.5, -width / 2 - 2, length + 3, width + 4);
      ctx.fillStyle = "rgba(13, 17, 16, 0.86)";
      ctx.fillRect(-length / 2, -width / 2, length, trackW);
      ctx.fillRect(-length / 2, width / 2 - trackW, length, trackW);
      ctx.fillStyle = teamColor;
      ctx.fillRect(-length / 2 + 2, -width / 2 + trackW, length - 4, width - trackW * 2);
      ctx.strokeStyle = "rgba(237, 244, 239, 0.54)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-length / 2 + 2, -width / 2 + trackW, length - 4, width - trackW * 2);
      if (tankLike) {
        ctx.fillStyle = "rgba(237, 244, 239, 0.64)";
        ctx.fillRect(-2.2, -3.4, 7.6, 6.8);
        ctx.strokeStyle = "rgba(237, 244, 239, 0.76)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(3, 0);
        ctx.lineTo(length / 2 + 8, 0);
        ctx.stroke();
      }
      ctx.restore();
    },

    drawTacticalHumanDots(game, map, viewerTeam, player) {
      const ctx = this.ctx;
      for (const entry of this.humanMinimapEntries?.(game, player) || []) {
        if (!this.shouldDrawHumanMinimapEntry?.(game, entry, viewerTeam)) continue;
        const point = this.mapPoint(map, entry);
        ctx.fillStyle = entry.local ? "#b6ff82" : "#67f27d";
        ctx.strokeStyle = "rgba(246, 255, 232, 0.92)";
        ctx.lineWidth = entry.local ? 1.8 : 1.2;
        ctx.beginPath();
        ctx.arc(point.x, point.y, entry.local ? 5.4 : 4.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    },

    drawTacticalViewRect(map, camera) {
      const ctx = this.ctx;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.46)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 5]);
      ctx.strokeRect(
        map.x + camera.x * map.sx,
        map.y + camera.y * map.sy,
        (camera.viewWidth || camera.width) * map.sx,
        (camera.viewHeight || camera.height) * map.sy
      );
      ctx.setLineDash([]);
    },

    commandMapEntries(game, viewerTeam) {
      const entries = [];
      const seen = new Set();
      const allowTeam = (team) => game.adminObserverMode || !viewerTeam || team === viewerTeam;

      for (const squad of game.squads || []) {
        if (!allowTeam(squad.team)) continue;
        const order = squad.order;
        if (!squad.manualOrder || !order?.playerIssued || !order.point) continue;
        if (!this.commandVisibleToViewer(game, squad.manualOrder.issuerPlayerId, squad.team, viewerTeam)) continue;
        const asset = this.squadCenterPoint(squad);
        if (!asset) continue;
        const key = `squad:${squad.callSign}:${squad.manualOrder.packetId}`;
        seen.add(key);
        entries.push(this.commandEntryFromOrder({
          key,
          team: squad.team,
          type: squad.manualOrder.type,
          issuedAt: squad.manualOrder.issuedAt,
          target: order.point,
          assets: [{ ...asset, id: squad.callSign, kind: "squad" }],
          hold: order.role === "hold"
        }));
      }

      for (const vehicle of [...(game.tanks || []), ...(game.humvees || [])]) {
        if (!vehicle.alive || !vehicle.manualOrder || !allowTeam(vehicle.team)) continue;
        const order = game.commanders?.[vehicle.team]?.assignments?.get(vehicle);
        if (!order?.playerIssued || !order.point) continue;
        if (!this.commandVisibleToViewer(game, vehicle.manualOrder.issuerPlayerId, vehicle.team, viewerTeam)) continue;
        const key = `vehicle:${vehicle.callSign}:${vehicle.manualOrder.packetId}`;
        seen.add(key);
        entries.push(this.commandEntryFromOrder({
          key,
          team: vehicle.team,
          type: vehicle.manualOrder.type,
          issuedAt: vehicle.manualOrder.issuedAt,
          target: order.point,
          assets: [{ x: vehicle.x, y: vehicle.y, id: vehicle.callSign, kind: "vehicle" }],
          hold: order.role === "hold"
        }));
      }

      const now = performance.now();
      for (const item of (game.commandBus?.log || []).slice(-8)) {
        const packet = item.packet;
        if (!item.accepted || !packet || !allowTeam(packet.team)) continue;
        if (!this.commandPacketPlayerIssued(packet)) continue;
        if (!this.commandVisibleToViewer(game, packet.issuerPlayerId || packet.playerId, packet.team, viewerTeam)) continue;
        const target = this.commandPacketTarget(game, packet);
        if (!target) continue;
        const assets = this.commandPacketAssets(game, packet);
        const key = `packet:${packet.id}`;
        if (seen.has(key) || now - (packet.issuedAt || 0) > 12000) continue;
        entries.push(this.commandEntryFromOrder({
          key,
          team: packet.team,
          type: packet.type,
          issuedAt: packet.issuedAt,
          target,
          assets,
          hold: packet.type === "defend" || packet.type === "rally"
        }));
      }

      return entries.slice(-18);
    },

    commandPacketPlayerIssued(packet) {
      const source = packet?.commandSource || (packet?.controllerType === "bot" ? "bot" : "player");
      return source === "player";
    },

    commandVisibleToViewer(game, issuerPlayerId, team, viewerTeam) {
      if (game.adminObserverMode) return true;
      if (viewerTeam && team && team !== viewerTeam) return false;
      if (game.sessionMode !== "online") return true;
      const localId = game.onlineSession?.playerId || "";
      return Boolean(localId && issuerPlayerId && issuerPlayerId === localId);
    },

    commandEntryFromOrder(input) {
      const age = Math.max(0, performance.now() - (input.issuedAt || 0));
      const recent = age < 4200;
      return {
        ...input,
        recent,
        alpha: recent ? 1 : clamp(1 - (age - 4200) / 18000, 0.38, 0.82),
        label: this.commandTypeLabel?.(input.type) || input.type || "ORDER"
      };
    },

    commandPacketTarget(game, packet) {
      if (packet.objectiveName) {
        const point = game.capturePoints?.find((item) => item.name === packet.objectiveName);
        if (point) return point;
      }
      if (Number.isFinite(packet.targetPoint?.x) && Number.isFinite(packet.targetPoint?.y)) return packet.targetPoint;
      return null;
    },

    commandPacketAssets(game, packet) {
      const slot = game.sessionSlotById?.(packet.slotId);
      const squadIds = packet.targetSquadIds?.length ? packet.targetSquadIds : slot?.squadIds || [];
      const vehicleIds = packet.targetVehicleIds?.length ? packet.targetVehicleIds : slot?.vehicleIds || [];
      const assets = [];
      for (const id of squadIds) {
        const point = this.squadCenterPoint(game.squadById?.(id));
        if (point) assets.push({ ...point, id, kind: "squad" });
      }
      for (const id of vehicleIds) {
        const vehicle = game.vehicleById?.(id);
        if (vehicle?.alive) assets.push({ x: vehicle.x, y: vehicle.y, id, kind: "vehicle" });
      }
      return assets;
    },

    squadCenterPoint(squad) {
      const units = squad?.activeUnits?.() || [];
      if (!units.length) return null;
      const center = units.reduce((sum, unit) => ({ x: sum.x + unit.x, y: sum.y + unit.y }), { x: 0, y: 0 });
      center.x /= units.length;
      center.y /= units.length;
      return center;
    },

    drawSelectedCommandMapAssets(game, map, viewerTeam, expanded = false) {
      const radio = game.hud?.commandRadio;
      if (!radio?.open) return;
      const ctx = this.ctx;
      const phase = performance.now() / 1000;
      const pulse = 0.5 + Math.sin(phase * 5.4) * 0.5;
      const drawRing = (point, radius) => {
        const screen = this.mapPoint(map, point);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius + pulse * (expanded ? 3 : 1.8), 0, Math.PI * 2);
        ctx.stroke();
      };

      ctx.save();
      ctx.strokeStyle = SELECTED_COLOR;
      ctx.lineWidth = expanded ? 2.2 : 1.4;
      ctx.setLineDash(expanded ? [8, 6] : [4, 3]);
      ctx.lineDashOffset = -phase * 18;

      for (const id of radio.selectedSquads || []) {
        const squad = game.squadById?.(id);
        if (!squad || (!game.adminObserverMode && viewerTeam && squad.team !== viewerTeam)) continue;
        const point = this.squadCenterPoint(squad);
        if (point) drawRing(point, expanded ? 11 : 5.8);
      }
      for (const id of radio.selectedVehicles || []) {
        const vehicle = game.vehicleById?.(id);
        if (!vehicle?.alive || (!game.adminObserverMode && viewerTeam && vehicle.team !== viewerTeam)) continue;
        drawRing(vehicle, expanded ? 12 : 6.2);
      }
      ctx.restore();
    },

    drawCommandAssetDot(ctx, x, y, expanded, recent) {
      ctx.save();
      ctx.fillStyle = recent ? "rgba(255, 237, 165, 0.96)" : "rgba(255, 209, 102, 0.82)";
      ctx.strokeStyle = "rgba(6, 12, 11, 0.82)";
      ctx.lineWidth = expanded ? 1.4 : 0.8;
      ctx.beginPath();
      ctx.arc(x, y, expanded ? 4.2 : 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },

    drawCommandTargetGlyph(ctx, x, y, expanded, hold, recent, phase) {
      const pulse = recent ? 0.5 + Math.sin(phase * 6.5) * 0.5 : 0.15;
      const radius = (expanded ? (hold ? 15 : 12) : (hold ? 7 : 5.6)) + pulse * (expanded ? 4 : 2);
      ctx.save();
      ctx.strokeStyle = ORDER_COLOR;
      ctx.fillStyle = ORDER_FILL;
      ctx.lineWidth = expanded ? 2.4 : 1.5;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - radius - 4, y);
      ctx.lineTo(x - 3, y);
      ctx.moveTo(x + 3, y);
      ctx.lineTo(x + radius + 4, y);
      ctx.moveTo(x, y - radius - 4);
      ctx.lineTo(x, y - 3);
      ctx.moveTo(x, y + 3);
      ctx.lineTo(x, y + radius + 4);
      ctx.stroke();
      ctx.restore();
    },

    drawCommandMapLabel(ctx, x, y, label) {
      ctx.save();
      ctx.font = "900 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const width = ctx.measureText(label).width + 16;
      ctx.fillStyle = "rgba(6, 12, 11, 0.78)";
      ctx.strokeStyle = "rgba(255, 209, 102, 0.45)";
      roundRect(ctx, x - width / 2, y - 31, width, 20, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffe8a8";
      ctx.fillText(label, x, y - 20);
      ctx.restore();
    },

    mapPoint(map, point) {
      return {
        x: map.x + (Number(point.x) || 0) * map.sx,
        y: map.y + (Number(point.y) || 0) * map.sy
      };
    }
  });
})(window);
