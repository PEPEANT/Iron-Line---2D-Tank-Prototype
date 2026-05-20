"use strict";

(function registerRoomRegistry(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const STORAGE_KEY = "iron-line-room-registry-v1";
  const SELECTED_KEY = "iron-line-selected-room-v1";

  class RoomRegistry {
    constructor() {
      this.storageKey = STORAGE_KEY;
      this.selectedKey = SELECTED_KEY;
      this.listeners = new Set();
      window.addEventListener("storage", (event) => {
        if (event.key === this.storageKey || event.key === this.selectedKey) this.emit();
      });
    }

    listRooms() {
      try {
        const data = JSON.parse(localStorage.getItem(this.storageKey) || "[]");
        if (!Array.isArray(data)) return [];
        return data.map((room) => this.normalizeRoom(room)).filter(Boolean);
      } catch (_error) {
        return [];
      }
    }

    selectedRoomId() {
      return localStorage.getItem(this.selectedKey) || "";
    }

    selectedRoom() {
      const id = this.selectedRoomId();
      return this.listRooms().find((room) => room.id === id) || this.listRooms()[0] || null;
    }

    selectRoom(id) {
      const room = this.getRoom(id);
      if (!room) return null;
      localStorage.setItem(this.selectedKey, room.id);
      this.emit();
      return room;
    }

    getRoom(id) {
      return this.listRooms().find((room) => room.id === id) || null;
    }

    createRoom(input = {}) {
      const rooms = this.listRooms();
      const room = this.normalizeRoom({
        id: input.id || this.nextRoomId(rooms),
        name: input.name || "온라인 테스트방",
        mode: input.mode || "conquest",
        blueFactionId: input.blueFactionId || "korea",
        redFactionId: input.redFactionId || "russia",
        phase: "waiting",
        locked: false,
        aiFillEmptySlots: input.aiFillEmptySlots !== false,
        createdBy: "admin",
        startedBy: "",
        players: [],
        capacity: 8,
        spectators: [],
        spectatorCapacity: 24,
        spectatorChatVisibleToPlayers: true,
        events: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      room.events = this.nextEvents(room, {
        type: "room_created",
        severity: "info",
        title: "방 생성",
        detail: `${room.name} 방이 생성되었습니다.`
      });
      rooms.push(room);
      this.saveRooms(rooms);
      this.selectRoom(room.id);
      return room;
    }

    updateRoom(id, patch = {}) {
      const rooms = this.listRooms();
      const index = rooms.findIndex((room) => room.id === id);
      if (index < 0) return null;
      const next = this.normalizeRoom({
        ...rooms[index],
        ...patch,
        updatedAt: Date.now()
      });
      rooms[index] = next;
      this.saveRooms(rooms);
      return next;
    }

    startRoom(id) {
      const room = this.getRoom(id);
      return this.updateRoom(id, {
        phase: "playing",
        locked: true,
        startedBy: "admin",
        startedAt: Date.now(),
        events: this.nextEvents(room, {
          type: "room_started",
          severity: "major",
          title: "방 시작",
          detail: `${room?.name || id} 방이 관리자에 의해 시작되었습니다.`
        })
      });
    }

    endRoom(id) {
      const room = this.getRoom(id);
      return this.updateRoom(id, {
        phase: "ended",
        locked: true,
        endedAt: Date.now(),
        events: this.nextEvents(room, {
          type: "room_ended",
          severity: "warning",
          title: "방 종료",
          detail: `${room?.name || id} 방이 종료되었습니다.`
        })
      });
    }

    resetRoom(id) {
      const room = this.getRoom(id);
      return this.updateRoom(id, {
        phase: "waiting",
        locked: false,
        startedBy: "",
        startedAt: 0,
        endedAt: 0,
        players: [],
        spectators: [],
        events: this.nextEvents(room, {
          type: "room_reset",
          severity: "warning",
          title: "방 초기화",
          detail: `${room?.name || id} 방이 초기화되었습니다.`
        })
      });
    }

    deleteRoom(id) {
      const rooms = this.listRooms().filter((room) => room.id !== id);
      this.saveRooms(rooms);
      if (this.selectedRoomId() === id) {
        if (rooms[0]) localStorage.setItem(this.selectedKey, rooms[0].id);
        else localStorage.removeItem(this.selectedKey);
      }
      this.emit();
      return true;
    }

    addOrUpdatePlayer(roomId, player = {}) {
      const room = this.getRoom(roomId);
      if (!room || !player.id) return null;
      const participantType = this.normalizeParticipantType(player.participantType);
      const previous = [...(room.players || []), ...(room.spectators || [])].find((item) => item.id === player.id) || null;
      const players = Array.isArray(room.players)
        ? room.players.filter((item) => item.id !== player.id).slice()
        : [];
      const spectators = Array.isArray(room.spectators)
        ? room.spectators.filter((item) => item.id !== player.id).slice()
        : [];
      const nextPlayer = {
        id: player.id,
        name: player.name || player.nickname || "Player",
        team: player.team || "blue",
        slotId: player.slotId || "",
        roleId: player.roleId || "infantry",
        participantType,
        factionId: player.factionId || player.skinId || "",
        skinId: player.factionId || player.skinId || "",
        ready: Boolean(player.ready),
        updatedAt: Date.now()
      };
      if (participantType === "player") players.push(nextPlayer);
      else spectators.push(nextPlayer);
      const event = this.playerEvent(previous, nextPlayer);
      return this.updateRoom(roomId, {
        players,
        spectators,
        events: event ? this.nextEvents(room, event) : room.events
      });
    }

    playerEvent(previous, nextPlayer) {
      const name = nextPlayer.name || "플레이어";
      const typeLabel = nextPlayer.participantType === "player" ? "플레이어" : "관전자";
      if (!previous) {
        return {
          type: "participant_joined",
          severity: nextPlayer.participantType === "player" ? "info" : "spectator",
          title: `${typeLabel} 입장`,
          detail: `${name}님이 ${typeLabel}로 입장했습니다.`
        };
      }
      if (previous.participantType !== nextPlayer.participantType) {
        return {
          type: "participant_role_changed",
          severity: "info",
          title: "참가 형태 변경",
          detail: `${name}님이 ${typeLabel}로 전환되었습니다.`
        };
      }
      if (previous.slotId !== nextPlayer.slotId && nextPlayer.slotId) {
        return {
          type: "slot_changed",
          severity: "info",
          title: "슬롯 변경",
          detail: `${name}님이 ${this.slotLabel(nextPlayer.slotId)} 슬롯으로 이동했습니다.`
        };
      }
      if (Boolean(previous.ready) !== Boolean(nextPlayer.ready)) {
        return {
          type: "ready_changed",
          severity: "info",
          title: "준비 상태",
          detail: `${name}님이 ${nextPlayer.ready ? "준비 완료" : "준비 해제"} 상태가 되었습니다.`
        };
      }
      return null;
    }

    nextEvents(room, event = {}) {
      if (!room) return [];
      const next = {
        id: event.id || `${room.id}:event:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
        roomId: room.id,
        createdAt: Date.now(),
        type: event.type || "room_event",
        severity: event.severity || "info",
        title: String(event.title || "방 이벤트").slice(0, 48),
        detail: String(event.detail || "").slice(0, 140)
      };
      const events = Array.isArray(room.events) ? room.events.slice(-79) : [];
      events.push(next);
      return events;
    }

    slotLabel(slotId = "") {
      const side = slotId.startsWith("red") ? "홍팀" : "청팀";
      if (slotId.includes("engineer")) return `${side} 공병`;
      if (slotId.includes("recon")) return `${side} 정찰`;
      if (slotId.includes("armor")) return `${side} 기갑`;
      return `${side} 보병`;
    }

    saveRooms(rooms) {
      localStorage.setItem(this.storageKey, JSON.stringify(rooms));
      this.emit();
    }

    onChange(listener) {
      if (typeof listener !== "function") return () => {};
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    emit() {
      const rooms = this.listRooms();
      for (const listener of this.listeners) listener(rooms);
      window.dispatchEvent(new CustomEvent("iron-line-rooms-changed", { detail: { rooms } }));
    }

    nextRoomId(rooms) {
      let serial = rooms.length + 1;
      let id = "";
      do {
        id = `ROOM-${String(serial).padStart(3, "0")}`;
        serial += 1;
      } while (rooms.some((room) => room.id === id));
      return id;
    }

    normalizeFactionId(value, fallback) {
      return IronLine.playerFactionById?.(value)?.id || IronLine.playerSkinById?.(value)?.id || fallback;
    }

    normalizeRoom(room) {
      if (!room || typeof room !== "object") return null;
      const id = String(room.id || "").trim();
      if (!id) return null;
      const mode = room.mode === "annihilation" ? "annihilation" : "conquest";
      const phase = ["waiting", "loading", "playing", "ended"].includes(room.phase) ? room.phase : "waiting";
      const capacity = Math.max(1, Math.min(32, Math.round(Number(room.capacity) || 8)));
      const spectatorCapacity = Math.max(0, Math.min(64, Math.round(Number(room.spectatorCapacity) || 24)));
      const players = Array.isArray(room.players) ? room.players.slice(0, capacity) : [];
      const spectators = Array.isArray(room.spectators) ? room.spectators.slice(0, spectatorCapacity) : [];
      return {
        id,
        name: String(room.name || id).slice(0, 32),
        mode,
        blueFactionId: this.normalizeFactionId(room.blueFactionId, "korea"),
        redFactionId: this.normalizeFactionId(room.redFactionId, "russia"),
        phase,
        locked: Boolean(room.locked || phase === "playing" || phase === "ended"),
        aiFillEmptySlots: room.aiFillEmptySlots !== false,
        createdBy: String(room.createdBy || "admin"),
        startedBy: String(room.startedBy || ""),
        players,
        capacity,
        spectators,
        spectatorCapacity,
        spectatorChatVisibleToPlayers: room.spectatorChatVisibleToPlayers !== false,
        events: Array.isArray(room.events) ? room.events.slice(-80) : [],
        createdAt: Number(room.createdAt) || Date.now(),
        updatedAt: Number(room.updatedAt) || Date.now(),
        startedAt: Number(room.startedAt) || 0,
        endedAt: Number(room.endedAt) || 0
      };
    }

    normalizeParticipantType(value) {
      return ["player", "spectator", "caster", "admin"].includes(value) ? value : "player";
    }
  }

  IronLine.RoomRegistry = RoomRegistry;
  IronLine.roomRegistry = IronLine.roomRegistry || new RoomRegistry();
})(window);
