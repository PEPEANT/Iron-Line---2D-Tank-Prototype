"use strict";

(function registerBotCommanderSkeleton(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;
  const { distXY } = IronLine.math;

  const ROLE_COMMANDS = {
    infantry: ["move", "defend", "rally"],
    engineer: ["repair", "defend", "rally"],
    recon: ["scan", "defend", "rally"],
    armor: ["fire_support", "defend", "rally"]
  };

  class BotCommanderSkeleton {
    constructor(game) {
      this.game = game;
      this.slotTimers = new Map();
      this.sequence = 0;
      this.lastIssued = null;
      this.defaultMinInterval = 5;
      this.defaultMaxInterval = 15;
    }

    reset() {
      this.slotTimers.clear();
      this.sequence = 0;
      this.lastIssued = null;
    }

    update(_dt = 0) {
      if (!this.game?.matchStarted || this.game.result || this.game.testLabAiPaused) return;
      if (!this.canDriveLocalBots()) return;
      const now = performance.now();
      for (const slot of this.game.onlineSession?.roleSlots || []) {
        if (!this.isBotSlot(slot) || !this.slotHasAssets(slot)) continue;
        const state = this.stateForSlot(slot);
        if (now < state.nextAt) continue;
        const result = this.issueForSlot(slot, { now });
        state.lastResult = result?.accepted ? "accepted" : result?.reason || "rejected";
        state.nextAt = now + this.nextIntervalSeconds(slot) * 1000;
      }
    }

    canDriveLocalBots() {
      if (this.game.sessionMode !== "online") return true;
      const room = this.game.onlineCombatRoom?.();
      return Boolean(room && this.game.isOnlineWorldHost?.(room));
    }

    isBotSlot(slot) {
      return Boolean(slot && !slot.playerId && slot.controllerType === "bot" && slot.aiControlled !== false);
    }

    slotHasAssets(slot) {
      return Boolean((slot?.squadIds?.length || 0) + (slot?.vehicleIds?.length || 0));
    }

    stateForSlot(slot) {
      const slotId = slot?.id || "";
      let state = this.slotTimers.get(slotId);
      if (!state) {
        const firstDelay = this.initialDelaySeconds(slot);
        state = {
          nextAt: performance.now() + firstDelay * 1000,
          commandIndex: 0,
          lastCommandId: "",
          lastCommandType: "",
          lastResult: "pending"
        };
        this.slotTimers.set(slotId, state);
      }
      return state;
    }

    initialDelaySeconds(slot) {
      return 1.4 + (this.slotHash(slot) % 5) * 0.35;
    }

    nextIntervalSeconds(slot) {
      const span = this.defaultMaxInterval - this.defaultMinInterval;
      return this.defaultMinInterval + (this.slotHash(slot) % Math.max(1, span + 1));
    }

    slotHash(slot) {
      return String(slot?.id || "")
        .split("")
        .reduce((sum, char) => sum + char.charCodeAt(0), 0);
    }

    botIdForSlot(slot) {
      return `bot:${slot?.id || "slot"}`;
    }

    issueForSlot(slot, options = {}) {
      if (!slot) return { accepted: false, reason: "missing-slot" };
      if (!this.isBotSlot(slot)) return { accepted: false, reason: "not-bot-slot" };
      if (!this.slotHasAssets(slot)) return { accepted: false, reason: "no-assets" };
      const type = options.type || this.nextCommandType(slot, options);
      const target = this.targetForSlot(slot, type);
      if (!target) return { accepted: false, reason: "missing-point" };

      const now = Number.isFinite(options.now) ? options.now : performance.now();
      const state = this.stateForSlot(slot);
      const commandId = options.commandId || `${this.game.onlineSession?.roomId || "local"}:bot:${slot.id}:${Math.floor(now)}:${++this.sequence}`;
      const result = this.game.commandBus?.submit?.({
        id: commandId,
        commandId,
        issuerPlayerId: this.botIdForSlot(slot),
        playerId: this.botIdForSlot(slot),
        controllerType: "bot",
        commandSource: "bot",
        commandReason: type,
        team: slot.team,
        slotId: slot.id,
        commanderSlotId: slot.id,
        role: slot.roleId,
        type,
        commandType: type,
        authority: "bot_squad",
        targetPoint: { x: target.x, y: target.y },
        targetPosition: { x: target.x, y: target.y },
        objectiveName: target.name || "",
        targetSquadIds: (slot.squadIds || []).slice(),
        targetVehicleIds: (slot.vehicleIds || []).slice(),
        reason: type,
        skipCooldown: Boolean(options.force)
      }) || { accepted: false, reason: "missing-command-bus" };

      state.lastCommandId = result.packet?.id || commandId;
      state.lastCommandType = type;
      state.lastResult = result.accepted ? "accepted" : result.reason || "rejected";
      slot.botCommanderState = {
        active: true,
        controllerType: "bot",
        commanderSlotId: slot.id,
        lastCommandId: state.lastCommandId,
        lastCommandType: type,
        lastResult: state.lastResult,
        lastIssuedAt: Date.now(),
        nextAt: state.nextAt,
        targetName: target.name || "",
        targetSquadId: result.squadIds?.[0] || slot.squadIds?.[0] || "",
        targetAssetId: result.vehicleIds?.[0] || slot.vehicleIds?.[0] || ""
      };
      this.lastIssued = slot.botCommanderState;
      if (result.accepted && this.game.sessionMode === "online" && this.game.isOnlineWorldHost?.()) {
        this.game.publishOnlineCommand?.(result.packet);
      }
      return result;
    }

    nextCommandType(slot, options = {}) {
      const commands = ROLE_COMMANDS[slot?.roleId] || ROLE_COMMANDS.infantry;
      const state = this.stateForSlot(slot);
      const index = options.force && options.type ? commands.indexOf(options.type) : state.commandIndex;
      const command = commands[Math.max(0, index) % commands.length] || commands[0];
      state.commandIndex = (state.commandIndex + 1) % commands.length;
      return command;
    }

    targetForSlot(slot, type) {
      if (type === "rally") return this.assetCenter(slot) || this.teamFallbackPoint(slot.team);
      if (type === "defend") return this.defensePoint(slot.team) || this.assetCenter(slot) || this.teamFallbackPoint(slot.team);
      if (type === "repair") return this.damagedVehiclePoint(slot.team) || this.assetCenter(slot) || this.forwardObjective(slot.team);
      return this.forwardObjective(slot.team) || this.assetCenter(slot) || this.teamFallbackPoint(slot.team);
    }

    forwardObjective(team) {
      const names = IronLine.commandPlans?.[team] || [];
      const ordered = names
        .map((name) => this.game.capturePoints?.find((point) => point.name === name))
        .filter(Boolean);
      const points = ordered.length ? ordered : (this.game.capturePoints || []);
      return points.find((point) => point.owner !== team) || points[0] || null;
    }

    defensePoint(team) {
      return (this.game.capturePoints || []).find((point) => point.owner === team) || null;
    }

    damagedVehiclePoint(team) {
      return [...(this.game.tanks || []), ...(this.game.humvees || [])]
        .filter((vehicle) => vehicle?.alive && vehicle.team === team && vehicle.hp < vehicle.maxHp * 0.96)
        .sort((a, b) => (a.hp / Math.max(1, a.maxHp)) - (b.hp / Math.max(1, b.maxHp)))[0] || null;
    }

    assetCenter(slot) {
      const assets = [];
      for (const id of slot?.squadIds || []) {
        const squad = this.game.squadById?.(id);
        const active = squad?.activeUnits?.() || [];
        if (!active.length) continue;
        const center = active.reduce((sum, unit) => ({ x: sum.x + unit.x, y: sum.y + unit.y }), { x: 0, y: 0 });
        assets.push({ x: center.x / active.length, y: center.y / active.length, name: squad.callSign });
      }
      for (const id of slot?.vehicleIds || []) {
        const vehicle = this.game.vehicleById?.(id);
        if (vehicle?.alive) assets.push({ x: vehicle.x, y: vehicle.y, name: vehicle.callSign });
      }
      if (!assets.length) return null;
      const center = assets.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
      return {
        x: center.x / assets.length,
        y: center.y / assets.length,
        name: assets.length === 1 ? assets[0].name : `${slot.id}:assets`
      };
    }

    teamFallbackPoint(team) {
      const point = this.game.world?.baseExitPoints?.[team] ||
        (team === TEAM.RED ? this.game.world?.spawns?.red?.[0] : this.game.world?.spawns?.player) ||
        null;
      return point ? { x: point.x, y: point.y, name: "base-exit" } : null;
    }
  }

  IronLine.BotCommanderSkeleton = BotCommanderSkeleton;
})(window);
