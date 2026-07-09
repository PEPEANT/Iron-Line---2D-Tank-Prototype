"use strict";

(function registerBattlefieldEvents(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;

  class BattlefieldEvents {
    constructor(game) {
      this.game = game;
      this.events = [];
      this.maxEvents = 120;
      this.seenRoomEvents = new Set();
      this.objectiveOwners = new Map();
      this.vehicleAlive = new Map();
      this.lastMatchStarted = Boolean(game.matchStarted);
      this.lastResult = game.result || "";
      this.lastPlayerDeathActive = Boolean(game.playerDeathActive);
    }

    update() {
      this.pullRoomEvents();
      this.trackMatchState();
      this.trackObjectiveOwners();
      this.trackVehicleLosses();
      this.trackPlayerDeath();
    }

    recent(limit = 50) {
      return this.events.slice(-limit);
    }

    push(input = {}) {
      const event = {
        id: input.id || `event:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        createdAt: input.createdAt || Date.now(),
        roomId: input.roomId || this.game.onlineSession?.roomId || "local",
        type: input.type || "system",
        severity: input.severity || "info",
        team: input.team || "",
        title: String(input.title || "전황 이벤트").slice(0, 48),
        detail: String(input.detail || "").slice(0, 140),
        source: input.source || "local"
      };
      if (this.events.some((item) => item.id === event.id)) return event;
      this.events.push(event);
      if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
      if (input.chat !== false && this.shouldEchoToChat(event)) {
        this.game.chat?.addSystemMessage?.(event.detail || event.title);
      }
      return event;
    }

    shouldEchoToChat(event) {
      return [
        "room_started",
        "room_ended",
        "match_started",
        "match_ended",
        "score_kill",
        "objective_captured",
        "player_down",
        "vehicle_destroyed",
        "squad_leader_lost",
        "commander_order"
      ].includes(event.type);
    }

    pullRoomEvents() {
      const registry = IronLine.roomRegistry;
      const roomId = this.game.onlineSession?.roomId || registry?.selectedRoomId?.() || "";
      const room = roomId ? registry?.getRoom?.(roomId) : registry?.selectedRoom?.();
      for (const event of room?.events || []) {
        if (!event?.id || this.seenRoomEvents.has(event.id)) continue;
        this.seenRoomEvents.add(event.id);
        this.push({ ...event, source: "room", chat: false });
      }
    }

    trackMatchState() {
      const started = Boolean(this.game.matchStarted);
      if (started !== this.lastMatchStarted) {
        this.push({
          type: started ? "match_started" : "match_stopped",
          severity: started ? "major" : "warning",
          title: started ? "전투 시작" : "전투 중지",
          detail: started ? this.matchStartDetail() : "전투가 중지되었습니다."
        });
      }
      this.lastMatchStarted = started;

      const result = this.game.result || "";
      if (result && result !== this.lastResult) {
        this.push({
          type: "match_ended",
          severity: "major",
          title: "전투 종료",
          detail: this.game.resultReason || "전투가 종료되었습니다."
        });
      }
      this.lastResult = result;
    }

    trackObjectiveOwners() {
      for (const point of this.game.capturePoints || []) {
        const previous = this.objectiveOwners.get(point.name);
        if (previous === undefined) {
          this.objectiveOwners.set(point.name, point.owner);
          continue;
        }
        if (previous === point.owner) continue;
        this.objectiveOwners.set(point.name, point.owner);
        if (![TEAM.BLUE, TEAM.RED].includes(point.owner)) continue;
        this.push({
          type: "objective_captured",
          severity: "major",
          team: point.owner,
          title: `${point.name} 거점 점령`,
          detail: `${this.teamLabel(point.owner)}이 ${point.name} 거점을 장악했습니다.`
        });
      }
    }

    trackVehicleLosses() {
      for (const vehicle of [...(this.game.tanks || []), ...(this.game.humvees || [])]) {
        const key = vehicle.callSign || vehicle.id || `${vehicle.vehicleType || "vehicle"}:${vehicle.team}:${vehicle.x}:${vehicle.y}`;
        const alive = Boolean(vehicle.alive);
        const previous = this.vehicleAlive.get(key);
        if (previous === undefined) {
          this.vehicleAlive.set(key, alive);
          continue;
        }
        if (previous && !alive) {
          this.push({
            type: "vehicle_destroyed",
            severity: "warning",
            team: vehicle.team,
            title: "차량 파괴",
            detail: `${this.teamLabel(vehicle.team)} ${vehicle.callSign || "차량"}이 파괴되었습니다.`
          });
        }
        this.vehicleAlive.set(key, alive);
      }
    }

    trackPlayerDeath() {
      const active = Boolean(this.game.playerDeathActive);
      if (active && !this.lastPlayerDeathActive) {
        this.push({
          type: "player_down",
          severity: "warning",
          team: TEAM.BLUE,
          title: "플레이어 전투 불능",
          detail: this.game.playerDeathReason || "플레이어가 전투 불능 상태입니다."
        });
      }
      this.lastPlayerDeathActive = active;
    }

    matchStartDetail() {
      if (this.game.matchConfig?.mode === "conquest") {
        const seconds = Math.max(0, Math.floor(this.game.conquest?.duration || 20 * 60));
        return `전투 시작. 승리 조건: ${this.formatTime(seconds)} 종료 시 고득점. 거점 보유 중 점수 획득.`;
      }

      const target = this.game.annihilationObjectiveScoreTarget?.() || this.game.annihilation?.targetScore || 300;
      return `전투 시작. 승리 조건: ${Math.floor(target)}점 도달 또는 상대 전투력 소멸.`;
    }

    formatTime(seconds = 0) {
      const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
      const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
      const rest = (safeSeconds % 60).toString().padStart(2, "0");
      return `${minutes}:${rest}`;
    }

    teamLabel(team) {
      if (team === TEAM.BLUE) return "청팀";
      if (team === TEAM.RED) return "홍팀";
      return "중립";
    }
  }

  IronLine.BattlefieldEvents = BattlefieldEvents;
})(window);
