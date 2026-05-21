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
      const width = Math.min(camera.width - 28, 920);
      const height = Math.min(camera.height - 34, 610);
      if (width < 260 || height < 180) return;

      const x = (camera.width - width) / 2;
      const y = (camera.height - height) / 2;
      const map = {
        x: x + 18,
        y: y + 44,
        w: width - 36,
        h: height - 62,
        sx: (width - 36) / game.world.width,
        sy: (height - 62) / game.world.height
      };
      const player = game.adminObserverMode ? null : game.player;
      const viewerTeam = player?.team;

      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
      ctx.fillRect(0, 0, camera.width, camera.height);
      ctx.fillStyle = "rgba(8, 14, 12, 0.91)";
      ctx.strokeStyle = "rgba(255, 209, 102, 0.38)";
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, width, height, 9);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffe8a8";
      ctx.font = "900 16px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("전술지도", x + 18, y + 23);
      ctx.fillStyle = "rgba(237, 244, 239, 0.68)";
      ctx.font = "800 11px system-ui, sans-serif";
      ctx.fillText("M: 닫기 · 노랑: 최근/진행 명령 · 초록: 실제 플레이어", x + 100, y + 23);

      roundRect(ctx, map.x, map.y, map.w, map.h, 7);
      ctx.clip();
      this.drawTacticalMapBase(game, map, viewerTeam, player);
      this.drawCommandMinimapOverlays(game, map, viewerTeam, true);
      this.drawTacticalViewRect(map, camera);
      ctx.restore();
    },

    drawTacticalMapBase(game, map, viewerTeam, player) {
      const ctx = this.ctx;
      ctx.fillStyle = "rgba(24, 48, 32, 0.96)";
      ctx.fillRect(map.x, map.y, map.w, map.h);

      ctx.strokeStyle = "rgba(237, 244, 239, 0.055)";
      ctx.lineWidth = 1;
      for (let gx = 400; gx < game.world.width; gx += 400) {
        ctx.beginPath();
        ctx.moveTo(map.x + gx * map.sx, map.y);
        ctx.lineTo(map.x + gx * map.sx, map.y + map.h);
        ctx.stroke();
      }
      for (let gy = 400; gy < game.world.height; gy += 400) {
        ctx.beginPath();
        ctx.moveTo(map.x, map.y + gy * map.sy);
        ctx.lineTo(map.x + map.w, map.y + gy * map.sy);
        ctx.stroke();
      }

      for (const road of game.world.roads || []) {
        if (!road.length) continue;
        ctx.beginPath();
        ctx.moveTo(map.x + road[0].x * map.sx, map.y + road[0].y * map.sy);
        for (let i = 1; i < road.length; i += 1) ctx.lineTo(map.x + road[i].x * map.sx, map.y + road[i].y * map.sy);
        ctx.strokeStyle = "rgba(158, 151, 118, 0.48)";
        ctx.lineWidth = 5;
        ctx.stroke();
      }

      for (const zone of game.world.safeZones || []) {
        const point = this.mapPoint(map, zone);
        ctx.fillStyle = zone.team === TEAM.RED ? "rgba(255, 103, 97, 0.18)" : "rgba(100, 181, 246, 0.18)";
        ctx.strokeStyle = zone.team === TEAM.RED ? "rgba(255, 103, 97, 0.52)" : "rgba(100, 181, 246, 0.52)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      for (const point of game.capturePoints || []) {
        const screen = this.mapPoint(map, point);
        ctx.fillStyle = TEAM_COLORS[point.owner] || "#d6d1bd";
        ctx.strokeStyle = "rgba(237, 244, 239, 0.72)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#07100d";
        ctx.font = "900 10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(point.name, screen.x, screen.y + 0.5);
      }

      this.drawTacticalUnitDots(game, map, viewerTeam);
      this.drawTacticalHumanDots(game, map, viewerTeam, player);
    },

    drawTacticalUnitDots(game, map, viewerTeam) {
      const ctx = this.ctx;
      const drawUnit = (entity, radius, square = false) => {
        if (!entity?.alive || !this.shouldDrawMinimapContact(game, entity, viewerTeam)) return;
        const point = this.minimapContactPoint(game, entity, viewerTeam);
        const screen = this.mapPoint(map, point);
        ctx.globalAlpha = point.alpha ?? 1;
        ctx.fillStyle = TEAM_COLORS[entity.team] || "#edf4ef";
        if (square) ctx.fillRect(screen.x - radius, screen.y - radius, radius * 2, radius * 2);
        else {
          ctx.beginPath();
          ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      };
      for (const tank of game.tanks || []) drawUnit(tank, 3.4, true);
      for (const humvee of game.humvees || []) drawUnit(humvee, 3, true);
      for (const unit of game.infantry || []) {
        if (unit.inVehicle) continue;
        drawUnit(unit, 2.2);
      }
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

    commandEntryFromOrder(input) {
      const age = Math.max(0, performance.now() - (input.issuedAt || 0));
      const recent = age < 4200;
      return {
        ...input,
        recent,
        alpha: recent ? 1 : clamp(1 - (age - 4200) / 18000, 0.38, 0.82),
        label: this.commandTypeLabel?.(input.type) || input.type || "명령"
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
