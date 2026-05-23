"use strict";

(function registerCommandBus(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, AI_CONFIG } = IronLine.constants;
  const { distXY } = IronLine.math;

  const COMMAND_TYPES = new Set([
    "move",
    "attack",
    "defend",
    "retreat",
    "rally",
    "cancel",
    "assault",
    "repair",
    "scan",
    "fire_support"
  ]);
  const ROLE_TYPES = {
    infantry: "assault",
    engineer: "repair",
    recon: "scan",
    armor: "fire_support"
  };

  class CommandBus {
    constructor(game) {
      this.game = game;
      this.sequence = 0;
      this.log = [];
      this.maxLog = 120;
      this.cooldowns = new Map();
      this.appliedCommandIds = new Set();
      this.appliedCommandIdQueue = [];
    }

    resetMatch() {
      this.sequence = 0;
      this.log.length = 0;
      this.cooldowns.clear();
      this.appliedCommandIds.clear();
      this.appliedCommandIdQueue.length = 0;
    }

    submit(input = {}) {
      const packet = this.createPacket(input);
      const result = this.apply(packet);
      this.record(packet, result);
      return result;
    }

    createPacket(input) {
      const issuerPlayerId = input.issuerPlayerId || input.playerId || this.game.onlineSession?.playerId || "local-player";
      const player = this.game.sessionPlayerById?.(issuerPlayerId) || this.game.onlineSession?.players?.[0] || {};
      const slot = input.slotId
        ? this.game.sessionSlotById?.(input.slotId)
        : input.commanderSlotId
          ? this.game.sessionSlotById?.(input.commanderSlotId)
          : this.game.sessionSlotById?.(player.slotId);
      const typeInput = input.type || input.commandType;
      const type = COMMAND_TYPES.has(typeInput) ? typeInput : "move";
      const tick = Math.floor((this.game.matchTime || 0) * 60);
      const issuedAt = Number.isFinite(input.issuedAt) && Number(input.issuedAt) < 1000000000
        ? Number(input.issuedAt)
        : performance.now();
      const issuedAtEpoch = Number.isFinite(input.issuedAtEpoch)
        ? Number(input.issuedAtEpoch)
        : Number.isFinite(input.issuedAt) && Number(input.issuedAt) >= 1000000000
          ? Number(input.issuedAt)
          : Date.now();
      const targetSquadIds = Array.isArray(input.targetSquadIds)
        ? input.targetSquadIds.slice()
        : input.targetSquadId
          ? [input.targetSquadId]
          : [];
      const targetVehicleIds = Array.isArray(input.targetVehicleIds)
        ? input.targetVehicleIds.slice()
        : input.targetAssetId || input.targetVehicleId
          ? [input.targetAssetId || input.targetVehicleId]
          : [];
      const targetPosition = input.targetPosition || input.targetPoint || null;
      const lockUntil = Number.isFinite(input.lockUntil)
        ? Number(input.lockUntil)
        : issuedAtEpoch + this.commandLockSeconds(type) * 1000;
      const commandId = input.id || input.commandId || `${this.game.onlineSession?.roomId || "local"}:${tick}:${++this.sequence}`;

      return {
        id: commandId,
        roomId: input.roomId || this.game.onlineSession?.roomId || "local",
        commandId,
        tick,
        issuedAt,
        issuedAtEpoch,
        lockUntil,
        issuerPlayerId,
        playerId: issuerPlayerId,
        team: input.team || slot?.team || player.team || TEAM.BLUE,
        slotId: input.slotId || input.commanderSlotId || slot?.id || player.slotId || "",
        commanderSlotId: input.commanderSlotId || input.slotId || slot?.id || player.slotId || "",
        slotRole: input.slotRole || slot?.role || player.role || "",
        role: input.role || slot?.roleId || player.roleId || "",
        controllerType: input.controllerType || slot?.controllerType || (slot?.playerId ? "human" : "bot"),
        commandSource: input.commandSource || "",
        commandReason: input.commandReason || input.reason || type,
        authority: input.authority || "owned_squad",
        type,
        commandType: type,
        targetSquadId: targetSquadIds[0] || "",
        targetAssetId: targetVehicleIds[0] || "",
        targetSquadIds,
        targetVehicleIds,
        targetPoint: targetPosition ? { x: targetPosition.x, y: targetPosition.y } : null,
        targetPosition: targetPosition ? { x: targetPosition.x, y: targetPosition.y } : null,
        followPlayer: Boolean(input.followPlayer),
        objectiveName: input.objectiveName || "",
        reason: input.reason || type,
        stance: input.stance || this.defaultStance(type),
        priority: Number.isFinite(input.priority) ? input.priority : 0,
        ttl: Number.isFinite(input.ttl) ? input.ttl : 60,
        skipCooldown: Boolean(input.skipCooldown),
        trustedRemote: Boolean(input.trustedRemote),
        remoteReplay: Boolean(input.remoteReplay),
        suppressPing: Boolean(input.suppressPing)
      };
    }

    defaultStance(type) {
      if (type === "attack") return "assault";
      if (type === "defend") return "hold";
      if (type === "retreat") return "fallback";
      if (type === "rally") return "regroup";
      if (type === "cancel") return "cancel";
      if (type === "assault") return "assault";
      if (type === "repair") return "need-repair";
      if (type === "scan") return "observe";
      if (type === "fire_support") return "request-fire-support";
      return "advance";
    }

    allowedTypesForRole(roleId = "") {
      const base = new Set(["move", "attack", "defend", "rally", "cancel"]);
      const special = ROLE_TYPES[roleId];
      if (special) base.add(special);
      return base;
    }

    roleSpecialForSlot(slot) {
      if (!slot) return null;
      const type = ROLE_TYPES[slot.roleId];
      return type ? {
        type,
        label: this.typeLabel(type),
        hint: this.specialHint(type)
      } : null;
    }

    canCommandVehicles(slot) {
      return slot?.roleId === "armor";
    }

    isTypeAllowedForSlot(slot, type) {
      if (!slot || !COMMAND_TYPES.has(type)) return false;
      return this.allowedTypesForRole(slot.roleId).has(type);
    }

    commandPermission(packet, slot) {
      if (packet.controllerType === "bot" || packet.authority === "bot_squad") {
        const expectedBotId = this.game.botCommanderIdForSlot?.(slot) || `bot:${slot?.id || ""}`;
        const isSlotBot = Boolean(slot && !slot.playerId && slot.controllerType === "bot" && packet.issuerPlayerId === expectedBotId);
        if (!isSlotBot) return { allowed: false, reason: "bot-slot-required" };
      } else {
        const authority = this.game.commandAuthorityForSlot?.(slot, packet.issuerPlayerId);
        if (authority && !authority.allowed) {
          return { allowed: false, reason: authority.reason || "command-authority-required" };
        }
      }
      if (!this.isTypeAllowedForSlot(slot, packet.type)) {
        return { allowed: false, reason: "role-command-restricted" };
      }
      if (packet.targetVehicleIds.length > 0 && !this.canCommandVehicles(slot)) {
        return { allowed: false, reason: "vehicle-role-restricted" };
      }
      return { allowed: true, reason: "" };
    }

    apply(packet) {
      if (!packet || !COMMAND_TYPES.has(packet.type)) return this.reject(packet, "unknown-command");
      if (this.appliedCommandIds.has(packet.id)) return this.reject(packet, "duplicate-command");
      const slot = this.game.sessionSlotById?.(packet.slotId);
      if (!slot && packet.authority === "owned_squad") return this.reject(packet, "missing-slot");
      if (slot && slot.team !== packet.team) return this.reject(packet, "team-mismatch");
      const permission = this.commandPermission(packet, slot);
      if (!permission.allowed) return this.reject(packet, permission.reason);

      const squads = this.resolveSquads(packet, slot);
      const vehicles = this.resolveVehicles(packet, slot);
      if (squads.length === 0 && vehicles.length === 0) return this.reject(packet, "no-assets");

      if (packet.type === "cancel") {
        squads.forEach((squad) => this.clearSquadOrder(squad));
        vehicles.forEach((vehicle) => this.clearVehicleOrder(vehicle));
        this.markCommandApplied(packet);
        return {
          accepted: true,
          packet,
          cancelled: true,
          squadIds: squads.map((squad) => squad.callSign),
          vehicleIds: vehicles.map((vehicle) => vehicle.callSign)
        };
      }

      if (!packet.skipCooldown) {
        const cooldown = this.cooldownStatus(packet, slot);
        if (cooldown.remaining > 0) {
          return this.reject(packet, "cooldown", { cooldownRemaining: cooldown.remaining });
        }
      }

      const point = this.resolvePoint(packet);
      if (!point) return this.reject(packet, "missing-point");
      const commandPoint = this.commandPointFor(packet, point, squads, vehicles);

      squads.forEach((squad, index) => this.applySquadOrder(packet, squad, commandPoint, index, squads.length));
      vehicles.forEach((vehicle, index) => this.applyVehicleOrder(packet, vehicle, commandPoint, index, vehicles.length));
      if (!packet.skipCooldown) this.setCooldown(packet, slot);
      if (!packet.suppressPing) this.addRolePing(packet, commandPoint, squads.length + vehicles.length);
      this.markCommandApplied(packet);

      return {
        accepted: true,
        packet,
        squadIds: squads.map((squad) => squad.callSign),
        vehicleIds: vehicles.map((vehicle) => vehicle.callSign)
      };
    }

    reject(packet, reason, extra = {}) {
      return { accepted: false, packet, reason, ...extra };
    }

    resolveSquads(packet, slot) {
      const allowedIds = new Set(slot?.squadIds || []);
      const ids = packet.targetSquadIds.length
        ? packet.targetSquadIds.filter((id) => allowedIds.has(id) || packet.trustedRemote)
        : slot?.squadIds || [];
      return ids
        .map((id) => this.game.squadById?.(id))
        .filter((squad) => squad && squad.team === packet.team && squad.activeUnits().length > 0);
    }

    resolveVehicles(packet, slot) {
      if (!this.canCommandVehicles(slot)) return [];
      const allowedIds = new Set(slot?.vehicleIds || []);
      const ids = packet.targetVehicleIds.length
        ? packet.targetVehicleIds.filter((id) => allowedIds.has(id) || packet.trustedRemote)
        : slot?.vehicleIds || [];
      return ids
        .map((id) => this.game.vehicleById?.(id))
        .filter((vehicle) => vehicle && vehicle.alive && vehicle.team === packet.team);
    }

    resolvePoint(packet) {
      if (packet.type === "retreat") return this.retreatPoint(packet.team);
      if (packet.followPlayer && this.game.player) {
        return {
          name: "플레이어",
          x: this.game.player.x,
          y: this.game.player.y,
          radius: 96,
          followPlayer: true
        };
      }
      if (packet.objectiveName) {
        const objective = this.game.capturePoints?.find((point) => point.name === packet.objectiveName);
        if (objective) return objective;
      }
      if (packet.targetPoint && Number.isFinite(packet.targetPoint.x) && Number.isFinite(packet.targetPoint.y)) {
        return {
          name: packet.objectiveName || packet.type,
          x: packet.targetPoint.x,
          y: packet.targetPoint.y,
          radius: packet.type === "defend" ? 150 : 110
        };
      }
      return null;
    }

    commandPointFor(packet, point, squads, vehicles) {
      const assetCount = Math.max(1, squads.length + vehicles.length);
      const infantryCount = squads.reduce((sum, squad) => sum + (squad.activeUnits?.().length || 0), 0);
      const radius = Math.max(point.radius || 0, this.commandRadius(packet.type, point, assetCount, infantryCount));
      return {
        ...point,
        radius
      };
    }

    commandRadius(type, point, assetCount, infantryCount) {
      const base = point.radius || (type === "defend" || type === "rally" ? 170 : 120);
      const assetSpread = Math.max(0, assetCount - 1);
      const infantrySpread = Math.max(0, infantryCount - 4);

      if (type === "defend" || type === "rally") {
        return Math.min(380, base + assetSpread * 64 + infantrySpread * 8);
      }
      if (type === "retreat") {
        return Math.min(300, base + assetSpread * 48 + infantrySpread * 5);
      }
      if (type === "fire_support" || type === "scan") {
        return Math.min(360, base + assetSpread * 58 + infantrySpread * 6);
      }
      if (type === "assault" || type === "attack") {
        return Math.min(330, base + assetSpread * 54 + infantrySpread * 6);
      }
      return Math.min(290, base + assetSpread * 52 + infantrySpread * 5);
    }

    retreatPoint(team) {
      const point = this.game.world.baseExitPoints?.[team] ||
        (team === TEAM.RED ? this.game.world.spawns.red?.[0] : this.game.world.spawns.player) ||
        { x: this.game.world.width / 2, y: this.game.world.height / 2 };
      return {
        name: team === TEAM.RED ? "홍팀 기지" : "청팀 기지",
        x: point.x,
        y: point.y,
        radius: point.radius || 170
      };
    }

    applySquadOrder(packet, squad, point, index, count) {
      const repairTarget = packet.type === "repair" ? this.repairTargetFor(packet, point) : null;
      const commandSource = packet.commandSource || (packet.controllerType === "bot" ? "bot" : "player");
      const order = {
        id: packet.id,
        point,
        objectiveName: packet.objectiveName || point.name || "",
        role: this.squadOrderRole(packet.type),
        commandType: packet.type,
        stance: packet.stance,
        priority: packet.priority,
        slotIndex: index,
        slotCount: Math.max(1, count),
        commandSpreadRadius: this.commandSpreadRadius(packet.type, point, count),
        leashRadius: this.leashRadius(packet.type, point),
        threatRadius: this.threatRadius(packet.type, point),
        forcedTacticalMode: this.forcedTacticalMode(packet.type),
        forcedTacticalUntil: this.forcedTacticalUntil(packet.type),
        repairTarget,
        supportRequestType: packet.type === "fire_support" ? "need-fire-support" : "",
        followPlayer: Boolean(packet.followPlayer),
        commandPacketId: packet.id,
        issuerPlayerId: packet.issuerPlayerId,
        commanderSlotId: packet.slotId,
        commandState: this.commandStateForType(packet.type),
        commandSource,
        commandReason: packet.commandReason || packet.reason || packet.type,
        commandLockSeconds: this.commandLockSeconds(packet.type),
        playerIssued: commandSource === "player"
      };
      squad.manualOrder = {
        packetId: packet.id,
        issuerPlayerId: packet.issuerPlayerId,
        slotId: packet.slotId,
        type: packet.type,
        commandState: order.commandState,
        issuedAt: packet.issuedAt,
        expiresAt: Infinity
      };
      squad.assignOrder(order);
    }

    applyVehicleOrder(packet, vehicle, point, index, count) {
      const commander = this.game.commanders?.[packet.team];
      if (!commander) return;
      const commandSource = packet.commandSource || (packet.controllerType === "bot" ? "bot" : "player");
      const order = {
        id: `${packet.id}:${vehicle.callSign}`,
        point,
        objectiveName: packet.objectiveName || point.name || "",
        role: this.vehicleOrderRole(packet.type),
        commandType: packet.type,
        stance: packet.stance,
        priority: packet.priority,
        slotIndex: index,
        slotCount: Math.max(1, count),
        commandSpreadRadius: this.commandSpreadRadius(packet.type, point, count),
        leashRadius: this.leashRadius(packet.type, point) + 140,
        threatRadius: this.threatRadius(packet.type, point) + 120,
        supportPoint: packet.type === "fire_support" ? {
          x: point.x,
          y: point.y,
          radius: point.radius || 160,
          stopDistance: 160
        } : null,
        supportRequestType: packet.type === "fire_support" ? "need-fire-support" : "",
        followPlayer: Boolean(packet.followPlayer),
        commandPacketId: packet.id,
        issuerPlayerId: packet.issuerPlayerId,
        commanderSlotId: packet.slotId,
        commandState: this.commandStateForType(packet.type),
        commandSource,
        commandReason: packet.commandReason || packet.reason || packet.type,
        commandLockSeconds: this.commandLockSeconds(packet.type),
        commandLockUntil: packet.issuedAt + this.commandLockSeconds(packet.type) * 1000,
        lastCommandChangedAt: packet.issuedAt,
        playerIssued: commandSource === "player"
      };
      vehicle.manualOrder = {
        packetId: packet.id,
        issuerPlayerId: packet.issuerPlayerId,
        slotId: packet.slotId,
        type: packet.type,
        commandState: order.commandState,
        commandLockUntil: order.commandLockUntil,
        issuedAt: packet.issuedAt,
        expiresAt: Infinity
      };
      commander.assignments.set(vehicle, order);
    }

    commandStateForType(type) {
      if (type === "cancel") return "cancel";
      if (type === "defend" || type === "rally") return "hold";
      if (type === "assault" || type === "attack") return "assault";
      if (type === "repair") return "repair";
      if (type === "scan") return "scout";
      if (type === "fire_support") return "cover";
      if (type === "retreat") return "fallback";
      return "advance";
    }

    commandLockSeconds(type) {
      if (type === "assault") return 2.8;
      if (type === "attack" || type === "defend") return 2.2;
      if (type === "repair" || type === "scan") return 2.4;
      if (type === "fire_support") return 2.0;
      if (type === "rally" || type === "retreat") return 1.8;
      return 1.5;
    }

    squadOrderRole(type) {
      if (type === "defend" || type === "rally") return "hold";
      if (type === "repair") return "repair";
      if (type === "scan") return "recon";
      return "infantry";
    }

    vehicleOrderRole(type) {
      if (type === "defend" || type === "rally") return "hold";
      if (type === "fire_support") return "support";
      return "support";
    }

    forcedTacticalMode(type) {
      if (type === "assault") return "pre-assault";
      if (type === "scan") return "support-fire";
      if (type === "fire_support") return "support-fire";
      return "";
    }

    forcedTacticalUntil(type) {
      const mode = this.forcedTacticalMode(type);
      if (!mode) return 0;
      const duration = type === "assault" ? 8.5 : 10;
      return performance.now() + duration * 1000;
    }

    repairTargetFor(packet, point) {
      const vehicles = [...(this.game.tanks || []), ...(this.game.humvees || [])]
        .filter((vehicle) => (
          vehicle.alive &&
          vehicle.team === packet.team &&
          vehicle.hp < vehicle.maxHp * 0.96
        ))
        .map((vehicle) => {
          const distance = distXY(point.x, point.y, vehicle.x, vehicle.y);
          const damage = 1 - vehicle.hp / Math.max(1, vehicle.maxHp);
          return { vehicle, score: distance - damage * 520 };
        })
        .sort((a, b) => a.score - b.score);
      return vehicles[0]?.vehicle || null;
    }

    clearSquadOrder(squad) {
      if (!squad) return;
      squad.manualOrder = null;
      if (squad.assignOrder) squad.assignOrder(null);
      else if (squad.order?.playerIssued) squad.order = null;
    }

    clearVehicleOrder(vehicle) {
      if (!vehicle) return;
      const commander = this.game.commanders?.[vehicle.team];
      vehicle.manualOrder = null;
      commander?.assignments?.delete(vehicle);
    }

    cooldownKey(packet, slot) {
      return `${packet.roomId || this.game.onlineSession?.roomId || "local"}:${slot?.id || packet.slotId || "slot"}`;
    }

    cooldownDuration(type) {
      if (type === "cancel") return 0;
      if (type === "retreat") return 2.2;
      if (type === "scan") return 5.2;
      if (type === "fire_support") return 3.6;
      if (type === "repair") return 2.4;
      if (type === "assault") return 1.8;
      if (type === "attack" || type === "defend") return 1.2;
      return 0.85;
    }

    cooldownStatus(packet, slot) {
      if (packet.type === "cancel") return { remaining: 0 };
      const key = this.cooldownKey(packet, slot);
      const until = this.cooldowns.get(key) || 0;
      return { remaining: Math.max(0, (until - performance.now()) / 1000) };
    }

    cooldownRemainingForSlot(slot, type = "move") {
      if (!slot || type === "cancel") return 0;
      const packet = { roomId: this.game.onlineSession?.roomId || "local", slotId: slot.id, type };
      return this.cooldownStatus(packet, slot).remaining;
    }

    setCooldown(packet, slot) {
      const duration = this.cooldownDuration(packet.type);
      if (duration <= 0) return;
      this.cooldowns.set(this.cooldownKey(packet, slot), performance.now() + duration * 1000);
    }

    markCommandApplied(packet) {
      if (!packet?.id || this.appliedCommandIds.has(packet.id)) return;
      this.appliedCommandIds.add(packet.id);
      this.appliedCommandIdQueue.push(packet.id);
      while (this.appliedCommandIdQueue.length > 400) {
        const oldest = this.appliedCommandIdQueue.shift();
        if (oldest) this.appliedCommandIds.delete(oldest);
      }
    }

    addRolePing(packet, point, assetCount) {
      if (!["assault", "repair", "scan", "fire_support"].includes(packet.type)) return;
      const now = performance.now();
      const pings = (this.game.commandPings || []).filter((ping) => ping.expiresAt > now);
      pings.push({
        id: `${packet.id}:ping`,
        type: packet.type,
        team: packet.team,
        x: point.x,
        y: point.y,
        radius: packet.type === "scan" ? 420 : packet.type === "fire_support" ? 330 : 220,
        label: this.typeLabel(packet.type),
        assetCount,
        createdAt: now,
        expiresAt: now + (packet.type === "scan" ? 9000 : 6500)
      });
      this.game.commandPings = pings.slice(-16);
    }

    leashRadius(type, point) {
      const base = point.radius || 130;
      if (type === "defend") return base + 220;
      if (type === "retreat") return base + 120;
      if (type === "assault") return base + 360;
      if (type === "repair") return base + 300;
      if (type === "scan") return base + 520;
      if (type === "fire_support") return base + 620;
      return Math.max(AI_CONFIG.objectiveLeashRadius || 620, base + 420);
    }

    threatRadius(type, point) {
      const base = point.radius || 130;
      if (type === "defend") return base + 320;
      if (type === "retreat") return base + 120;
      if (type === "scan") return base + 560;
      if (type === "fire_support") return base + 620;
      return base + (AI_CONFIG.objectiveThreatExtra || 360);
    }

    commandSpreadRadius(type, point, count) {
      const base = point.radius || 130;
      const multiAssetBonus = Math.max(0, count - 1) * 18;
      const crowdBonus = Math.max(0, count - 3) * 10;
      if (type === "defend" || type === "rally") return Math.min(240, Math.max(96, base * 0.52 + multiAssetBonus + crowdBonus));
      if (type === "retreat") return Math.min(166, Math.max(78, base * 0.4 + multiAssetBonus));
      if (type === "fire_support" || type === "scan") return Math.min(260, Math.max(118, base * 0.58 + multiAssetBonus + crowdBonus));
      if (type === "assault" || type === "attack") return Math.min(220, Math.max(92, base * 0.48 + multiAssetBonus + crowdBonus));
      return Math.min(210, Math.max(82, base * 0.44 + multiAssetBonus + crowdBonus));
    }

    record(packet, result) {
      this.log.push({
        packet,
        accepted: Boolean(result.accepted),
        reason: result.reason || "",
        summary: this.summary(packet, result)
      });
      if (this.log.length > this.maxLog) this.log.splice(0, this.log.length - this.maxLog);
    }

    summary(packet, result) {
      const target = packet.objectiveName || (packet.targetPoint ? "좌표" : "");
      const slot = this.game.sessionSlotById?.(packet.slotId);
      const slotLabel = slot ? `${slot.team === TEAM.RED ? "적팀" : "청팀"} ${slot.label}` : packet.slotId || "-";
      const status = result.accepted ? "승인" : `거부:${this.reasonLabel(result.reason)}`;
      return `${status} ${this.typeLabel(packet.type)} ${slotLabel} ${target}`;
    }

    typeLabel(type) {
      if (type === "attack") return "공격";
      if (type === "defend") return "방어";
      if (type === "retreat") return "후퇴";
      if (type === "rally") return "집결";
      if (type === "cancel") return "취소";
      if (type === "assault") return "돌격";
      if (type === "repair") return "수리";
      if (type === "scan") return "정찰";
      if (type === "fire_support") return "화력지원";
      return "이동";
    }

    specialHint(type) {
      if (type === "assault") return "목표로 돌격 준비";
      if (type === "repair") return "손상 차량 수리";
      if (type === "scan") return "지역 정찰 표시";
      if (type === "fire_support") return "기갑 화력지원";
      return "역할 명령";
    }

    reasonLabel(reason) {
      if (reason === "role-command-restricted") return "역할권한";
      if (reason === "vehicle-role-restricted") return "차량권한";
      if (reason === "missing-slot") return "슬롯없음";
      if (reason === "team-mismatch") return "팀불일치";
      if (reason === "no-assets") return "자산없음";
      if (reason === "missing-point") return "목표없음";
      if (reason === "unknown-command") return "알수없음";
      if (reason === "cooldown") return "대기";
      return reason || "오류";
    }
  }

  IronLine.CommandBus = CommandBus;
})(window);
