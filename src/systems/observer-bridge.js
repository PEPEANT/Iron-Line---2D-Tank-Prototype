"use strict";

(function registerObserverBridge(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;

  class ObserverBridge {
    constructor(game) {
      this.game = game;
      this.channelName = "iron-line-observer-v1";
      this.storageKey = "iron-line-observer-snapshot";
      this.channel = typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(this.channelName)
        : null;
      this.publishTimer = 0;
      this.readTimer = 0;
      this.remoteSnapshot = null;
      this.remoteLastSeen = 0;

      this.channel?.addEventListener("message", (event) => {
        const message = event.data || {};
        if (message.type !== "observer-snapshot" || !message.snapshot) return;
        if (!this.game.adminObserverMode) return;
        this.remoteSnapshot = message.snapshot;
        this.remoteLastSeen = performance.now();
        this.game.observerSnapshot = message.snapshot;
      });
    }

    update(dt) {
      if (this.game.adminObserverMode) {
        this.readTimer -= dt;
        if (this.readTimer > 0) return;
        this.readTimer = 0.25;
        this.readStoredSnapshot();
        return;
      }
      this.publishTimer -= dt;
      if (this.publishTimer > 0) return;
      this.publishTimer = 0.25;
      const snapshot = this.createSnapshot();
      this.channel?.postMessage({
        type: "observer-snapshot",
        snapshot
      });
      this.writeStoredSnapshot(snapshot);
    }

    writeStoredSnapshot(snapshot) {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(snapshot));
      } catch (_error) {
        // Local observer fallback is best-effort only.
      }
    }

    readStoredSnapshot() {
      try {
        const raw = localStorage.getItem(this.storageKey);
        if (!raw) return;
        const snapshot = JSON.parse(raw);
        if (!snapshot?.sentAt || Date.now() - snapshot.sentAt > 2600) return;
        if (this.game.observerSnapshot?.sentAt === snapshot.sentAt) return;
        this.remoteSnapshot = snapshot;
        this.remoteLastSeen = performance.now();
        this.game.observerSnapshot = snapshot;
      } catch (_error) {
        // Ignore malformed local observer data.
      }
    }

    createSnapshot() {
      const game = this.game;
      return {
        version: 1,
        sentAt: Date.now(),
        roomId: game.onlineSession?.roomId || "local",
        world: {
          width: game.world.width,
          height: game.world.height,
          safeZones: (game.world.safeZones || []).map((zone) => ({
            team: zone.team,
            x: zone.x,
            y: zone.y,
            radius: zone.radius || 0
          }))
        },
        match: {
          mode: game.matchConfig?.mode || "annihilation",
          phase: game.matchPhase || "",
          started: Boolean(game.matchStarted),
          lobbyOpen: Boolean(game.lobbyOpen),
          deploymentOpen: Boolean(game.deploymentOpen),
          time: game.matchTime || 0,
          remaining: game.matchConfig?.mode === "conquest"
            ? game.conquest?.remaining ?? 0
            : game.annihilation?.state === "intermission" ? game.annihilation?.intermissionRemaining || 0 : game.matchTime || 0,
          score: {
            [TEAM.BLUE]: ["conquest", "annihilation"].includes(game.matchConfig?.mode) ? game.conquest?.score?.[TEAM.BLUE] || 0 : game.annihilation?.score?.[TEAM.BLUE] || 0,
            [TEAM.RED]: ["conquest", "annihilation"].includes(game.matchConfig?.mode) ? game.conquest?.score?.[TEAM.RED] || 0 : game.annihilation?.score?.[TEAM.RED] || 0
          },
          round: {
            current: game.annihilation?.round || 1,
            max: game.annihilation?.maxRounds || 1,
            state: game.annihilation?.state || ""
          }
        },
        teams: {
          [TEAM.BLUE]: this.teamStats(TEAM.BLUE),
          [TEAM.RED]: this.teamStats(TEAM.RED)
        },
        capturePoints: (game.capturePoints || []).map((point) => ({
          name: point.name,
          x: point.x,
          y: point.y,
          owner: point.owner,
          progress: point.progress || 0,
          contested: Boolean(point.contested)
        })),
        roleSlots: (game.onlineSession?.roleSlots || []).map((slot) => ({
          id: slot.id,
          team: slot.team,
          label: slot.label,
          playerId: slot.playerId || "",
          aiControlled: Boolean(slot.aiControlled),
          squadIds: (slot.squadIds || []).slice(),
          vehicleIds: (slot.vehicleIds || []).slice()
        })),
        squads: (game.squads || []).map((squad) => this.squadSnapshot(squad)).filter(Boolean),
        vehicles: [...(game.tanks || []), ...(game.humvees || [])]
          .filter((vehicle) => vehicle.alive)
          .map((vehicle) => ({
            id: vehicle.callSign,
            team: vehicle.team,
            x: vehicle.x,
            y: vehicle.y,
            hp: vehicle.hp,
            maxHp: vehicle.maxHp,
            type: vehicle.vehicleType || "tank",
            state: vehicle.ai?.debug?.state || vehicle.ai?.state || "",
            target: vehicle.ai?.debug?.target?.callSign || vehicle.ai?.target?.callSign || vehicle.ai?.targetTank?.callSign || "",
            passengers: vehicle.passengerCount?.() || 0
          })),
        ai: game.aiObservatory?.latest?.() || null,
        commands: (game.commandBus?.log || []).slice(-12).map((entry) => ({
          accepted: Boolean(entry.accepted),
          reason: entry.reason || "",
          summary: entry.summary || "",
          type: entry.packet?.type || "",
          slotId: entry.packet?.slotId || "",
          objectiveName: entry.packet?.objectiveName || ""
        }))
      };
    }

    teamStats(team) {
      const game = this.game;
      const tanks = (game.tanks || []).filter((tank) => tank.team === team);
      const humvees = (game.humvees || []).filter((humvee) => humvee.team === team);
      const infantry = (game.infantry || []).filter((unit) => unit.team === team);
      const playerTotal = !game.adminObserverMode && team === TEAM.BLUE ? 1 : 0;
      const playerAlive = !game.adminObserverMode && team === TEAM.BLUE && !game.playerDeathActive && game.player?.hp > 0 ? 1 : 0;
      const vehicleTotal = tanks.length + humvees.length;
      const vehicleAlive = tanks.filter((tank) => tank.alive).length + humvees.filter((humvee) => humvee.alive).length;
      const infantryTotal = infantry.length + playerTotal;
      const infantryAlive = infantry.filter((unit) => unit.alive).length + playerAlive;
      return {
        alive: vehicleAlive + infantryAlive,
        total: vehicleTotal + infantryTotal,
        vehicles: `${vehicleAlive}/${vehicleTotal}`,
        infantry: `${infantryAlive}/${infantryTotal}`
      };
    }

    squadSnapshot(squad) {
      if (!squad?.units?.length) return null;
      const activeUnits = squad.activeUnits?.() || [];
      const total = squad.units.filter((unit) => unit.classId !== "scout").length || squad.units.length;
      const centerSource = activeUnits.length ? activeUnits : squad.units.filter((unit) => unit.alive);
      const center = centerSource.length
        ? centerSource.reduce((sum, unit) => ({ x: sum.x + unit.x, y: sum.y + unit.y }), { x: 0, y: 0 })
        : null;
      if (center) {
        center.x /= centerSource.length;
        center.y /= centerSource.length;
      }
      return {
        id: squad.callSign,
        team: squad.team,
        x: center?.x || squad.order?.point?.x || 0,
        y: center?.y || squad.order?.point?.y || 0,
        alive: activeUnits.length,
        total,
        mode: squad.tacticalMode || "",
        objective: squad.order?.objectiveName || squad.order?.point?.name || "",
        target: squad.status?.lastThreat?.callSign || squad.status?.armorThreat?.vehicle?.callSign || "",
        order: squad.manualOrder
          ? `${this.commandLabel(squad.manualOrder.type)} ${squad.order?.objectiveName || ""}`.trim()
          : squad.order?.objectiveName || "자동"
      };
    }

    commandLabel(type) {
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
  }

  IronLine.ObserverBridge = ObserverBridge;
})(window);
