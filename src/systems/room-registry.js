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
      const rooms = this.listRooms();
      const id = this.selectedRoomId();
      return rooms.find((room) => room.id === id) || rooms[0] || null;
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
        name: input.name || "\uc628\ub77c\uc778 \ud14c\uc2a4\ud2b8\ubc29",
        mode: input.mode || "conquest",
        blueFactionId: input.blueFactionId || "singularity",
        redFactionId: input.redFactionId || "military-gallery",
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
        commandAuthorities: [],
        commandAuthorityRequests: [],
        chat: [],
        events: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      room.events = this.nextEvents(room, {
        type: "room_created",
        severity: "info",
        title: "\ubc29 \uc0dd\uc131",
        detail: `${room.name} \ubc29\uc774 \uc0dd\uc131\ub418\uc5c8\uc2b5\ub2c8\ub2e4.`
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
          title: "\ubc29 \uc2dc\uc791",
          detail: `${room?.name || id} \ubc29\uc774 \uad00\ub9ac\uc790\uc5d0 \uc758\ud574 \uc2dc\uc791\ub418\uc5c8\uc2b5\ub2c8\ub2e4.`
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
          title: "\ubc29 \uc885\ub8cc",
          detail: `${room?.name || id} \ubc29\uc774 \uc885\ub8cc\ub418\uc5c8\uc2b5\ub2c8\ub2e4.`
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
          title: "\ubc29 \ucd08\uae30\ud654",
          detail: `${room?.name || id} \ubc29\uc774 \ucd08\uae30\ud654\ub418\uc5c8\uc2b5\ub2c8\ub2e4.`
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
      const position = this.normalizePlayerPosition(player);
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
        classId: player.classId || player.currentClassId || "",
        currentClassId: player.currentClassId || player.classId || "",
        combatRoleId: player.combatRoleId || "",
        weaponId: player.weaponId || "",
        weaponInventory: Array.isArray(player.weaponInventory) ? player.weaponInventory.slice(0, 4) : [],
        equipmentAmmo: player.equipmentAmmo ? { ...player.equipmentAmmo } : {},
        stats: {
          kills: Math.max(0, Math.floor(Number(player.stats?.kills) || 0)),
          deaths: Math.max(0, Math.floor(Number(player.stats?.deaths) || 0))
        },
        position,
        x: position?.x ?? null,
        y: position?.y ?? null,
        alive: position?.alive ?? player.alive !== false,
        inVehicle: Boolean(position?.inVehicle || player.inVehicle),
        participantType,
        factionId: player.factionId || player.skinId || "",
        skinId: player.factionId || player.skinId || "",
        ready: Boolean(player.ready),
        host: Boolean(player.host),
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

    normalizePlayerPosition(player = {}) {
      const raw = player.position || player;
      const x = Number(raw.x);
      const y = Number(raw.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        x: Math.round(x),
        y: Math.round(y),
        alive: raw.alive !== false && player.alive !== false,
        inVehicle: Boolean(raw.inVehicle || player.inVehicle),
        updatedAt: Number(raw.updatedAt || player.updatedAt || Date.now()) || Date.now()
      };
    }

    removeParticipant(roomId, playerId, reason = "leave") {
      const room = this.getRoom(roomId);
      if (!room || !playerId) return null;
      const previous = [...(room.players || []), ...(room.spectators || [])].find((item) => item.id === playerId) || null;
      const players = (room.players || []).filter((item) => item.id !== playerId);
      const spectators = (room.spectators || []).filter((item) => item.id !== playerId);
      const event = previous ? {
        type: "participant_left",
        severity: "warning",
        title: "\ucc38\uac00\uc790 \uc774\ud0c8",
        detail: `${previous.name || "Player"}\uc774 \ubc29\uc5d0\uc11c \ub098\uac14\uc2b5\ub2c8\ub2e4.${reason === "stale" ? " (\uc751\ub2f5 \uc5c6\uc74c)" : ""}`
      } : null;
      return this.updateRoom(roomId, {
        players,
        spectators,
        events: event ? this.nextEvents(room, event) : room.events
      });
    }

    cleanupStaleParticipants(maxAgeMs = 45000) {
      const now = Date.now();
      let changed = false;
      const rooms = this.listRooms().map((room) => {
        const players = (room.players || []).filter((player) => now - (Number(player.updatedAt) || 0) <= maxAgeMs);
        const spectators = (room.spectators || []).filter((player) => now - (Number(player.updatedAt) || 0) <= maxAgeMs);
        if (players.length === (room.players || []).length && spectators.length === (room.spectators || []).length) return room;
        changed = true;
        return {
          ...room,
          players,
          spectators,
          updatedAt: now,
          events: this.nextEvents(room, {
            type: "stale_participants_removed",
            severity: "warning",
            title: "\uc751\ub2f5 \uc5c6\ub294 \ucc38\uac00\uc790 \uc815\ub9ac",
            detail: `${room.name || room.id} \ubc29\uc758 \uc751\ub2f5 \uc5c6\ub294 \ucc38\uac00\uc790\ub97c \uc815\ub9ac\ud588\uc2b5\ub2c8\ub2e4.`
          })
        };
      });
      if (changed) this.saveRooms(rooms);
      return changed;
    }

    pushChat(roomId, message = {}) {
      const room = this.getRoom(roomId);
      if (!room) return null;
      const text = String(message.text || "").replace(/\s+/g, " ").trim().slice(0, 120);
      if (!text) return null;
      const chat = {
        id: message.id || `${room.id}:chat:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
        roomId: room.id,
        createdAt: Date.now(),
        channel: ["all", "team", "spectator", "caster", "system"].includes(message.channel) ? message.channel : "all",
        sender: String(message.sender || "Player").slice(0, 24),
        playerId: String(message.playerId || ""),
        team: message.team || "",
        participantType: this.normalizeParticipantType(message.participantType),
        text
      };
      const nextChat = Array.isArray(room.chat) ? room.chat.slice(-119) : [];
      nextChat.push(chat);
      this.updateRoom(room.id, { chat: nextChat });
      return chat;
    }

    recentChat(roomId, limit = 80) {
      const room = this.getRoom(roomId);
      return (room?.chat || []).slice(-limit);
    }

    updateCommandAuthority(roomId, input = {}) {
      const room = this.getRoom(roomId);
      if (!room || !input.slotId) return null;
      const slotId = String(input.slotId || "");
      const playerId = String(input.playerId || "");
      const playerName = String(input.playerName || input.nickname || playerId || "").slice(0, 24);
      const source = String(input.source || "").slice(0, 24);
      const commandAuthorities = (room.commandAuthorities || [])
        .filter((item) => item.slotId !== slotId);
      if (playerId) {
        commandAuthorities.push({
          slotId,
          playerId,
          playerName,
          source,
          updatedAt: Date.now()
        });
      }
      const commandAuthorityRequests = (room.commandAuthorityRequests || [])
        .filter((item) => item.slotId !== slotId || item.requesterId !== playerId);
      const title = input.action === "release" ? "\uc9c0\ud718\uad8c \ud574\uc81c" : "\uc9c0\ud718\uad8c \ubcc0\uacbd";
      const detail = playerId
        ? `${this.slotLabel(slotId)} \uc9c0\ud718\uad8c\uc774 ${playerName || playerId}\uc5d0\uac8c \uc9c0\uc815\ub418\uc5c8\uc2b5\ub2c8\ub2e4.`
        : `${this.slotLabel(slotId)} \uc9c0\ud718\uad8c\uc774 \ud574\uc81c\ub418\uc5c8\uc2b5\ub2c8\ub2e4.`;
      return this.updateRoom(roomId, {
        commandAuthorities,
        commandAuthorityRequests,
        events: this.nextEvents(room, {
          type: "command_authority_changed",
          severity: "info",
          title,
          detail,
          actorId: playerId
        })
      });
    }

    requestCommandAuthority(roomId, input = {}) {
      const room = this.getRoom(roomId);
      if (!room || !input.slotId || !input.requesterId) return null;
      const request = {
        id: input.id || `${input.slotId}:request:${Date.now()}`,
        slotId: String(input.slotId || ""),
        requesterId: String(input.requesterId || ""),
        requesterName: String(input.requesterName || input.requesterId || "Player").slice(0, 24),
        status: "pending",
        requestedAt: Number(input.requestedAt) || Date.now()
      };
      const commandAuthorityRequests = (room.commandAuthorityRequests || [])
        .filter((item) => !(item.slotId === request.slotId && item.requesterId === request.requesterId));
      commandAuthorityRequests.push(request);
      return this.updateRoom(roomId, {
        commandAuthorityRequests: commandAuthorityRequests.slice(-16),
        events: this.nextEvents(room, {
          type: "command_authority_requested",
          severity: "info",
          title: "\uc9c0\ud718\uad8c \uc694\uccad",
          detail: `${request.requesterName}\uc774 ${this.slotLabel(request.slotId)} \uc9c0\ud718\uad8c\uc744 \uc694\uccad\ud588\uc2b5\ub2c8\ub2e4.`,
          actorId: request.requesterId
        })
      });
    }

    resolveCommandAuthorityRequest(roomId, requestId, approved = false, resolver = {}) {
      const room = this.getRoom(roomId);
      if (!room || !requestId) return null;
      const request = (room.commandAuthorityRequests || []).find((item) => item.id === requestId);
      if (!request) return null;
      const commandAuthorityRequests = (room.commandAuthorityRequests || []).filter((item) => item.id !== requestId);
      const patch = { commandAuthorityRequests };
      if (approved) {
        const commandAuthorities = (room.commandAuthorities || []).filter((item) => item.slotId !== request.slotId);
        commandAuthorities.push({
          slotId: request.slotId,
          playerId: request.requesterId,
          playerName: request.requesterName,
          source: "delegated",
          updatedAt: Date.now()
        });
        patch.commandAuthorities = commandAuthorities;
      }
      patch.events = this.nextEvents(room, {
        type: approved ? "command_authority_approved" : "command_authority_denied",
        severity: approved ? "major" : "warning",
        title: approved ? "\uc9c0\ud718\uad8c \uc2b9\uc778" : "\uc9c0\ud718\uad8c \uac70\uc808",
        detail: `${this.slotLabel(request.slotId)} \uc9c0\ud718\uad8c \uc694\uccad\uc774 ${approved ? "\uc2b9\uc778" : "\uac70\uc808"}\ub418\uc5c8\uc2b5\ub2c8\ub2e4.`,
        actorId: resolver.resolverId || request.requesterId
      });
      return this.updateRoom(roomId, patch);
    }

    playerEvent(previous, nextPlayer) {
      const name = nextPlayer.name || "Player";
      const typeLabel = this.participantTypeLabel(nextPlayer.participantType);
      if (!previous) {
        return {
          type: "participant_joined",
          severity: nextPlayer.participantType === "player" ? "info" : "spectator",
          title: `${typeLabel} \uc785\uc7a5`,
          detail: `${name}\uc774 ${typeLabel}\ub85c \uc785\uc7a5\ud588\uc2b5\ub2c8\ub2e4.`
        };
      }
      if (previous.participantType !== nextPlayer.participantType) {
        return {
          type: "participant_role_changed",
          severity: "info",
          title: "\ucc38\uac00 \ud615\ud0dc \ubcc0\uacbd",
          detail: `${name}\uc774 ${typeLabel}\ub85c \uc804\ud658\ud588\uc2b5\ub2c8\ub2e4.`
        };
      }
      if (previous.slotId !== nextPlayer.slotId && nextPlayer.slotId) {
        return {
          type: "slot_changed",
          severity: "info",
          title: "\uc2ac\ub86f \ubcc0\uacbd",
          detail: `${name}\uc774 ${this.slotLabel(nextPlayer.slotId)} \uc2ac\ub86f\uc73c\ub85c \uc774\ub3d9\ud588\uc2b5\ub2c8\ub2e4.`
        };
      }
      if (Boolean(previous.ready) !== Boolean(nextPlayer.ready)) {
        return {
          type: "ready_changed",
          severity: "info",
          title: "\uc900\ube44 \uc0c1\ud0dc",
          detail: `${name}\uc774 ${nextPlayer.ready ? "\uc900\ube44 \uc644\ub8cc" : "\uc900\ube44 \ud574\uc81c"} \uc0c1\ud0dc\uac00 \ub418\uc5c8\uc2b5\ub2c8\ub2e4.`
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
        title: String(event.title || "\ubc29 \uc774\ubca4\ud2b8").slice(0, 48),
        detail: String(event.detail || "").slice(0, 140)
      };
      const events = Array.isArray(room.events) ? room.events.slice(-79) : [];
      events.push(next);
      return events;
    }

    participantTypeLabel(value) {
      if (value === "caster") return "\ud574\uc124\uc790";
      if (value === "admin") return "\uad00\ub9ac\uc790";
      if (value === "spectator") return "\uad00\uc804\uc790";
      return "\ud50c\ub808\uc774\uc5b4";
    }

    slotLabel(slotId = "") {
      const side = slotId.startsWith("red") ? "\ud64d\ud300" : "\uccad\ud300";
      if (slotId.includes("engineer")) return `${side} \uacf5\ubcd1`;
      if (slotId.includes("recon")) return `${side} \uc815\ucc30`;
      if (slotId.includes("armor")) return `${side} \uae30\uac11`;
      return `${side} \ubcf4\ubcd1`;
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
        commandAuthorities: this.normalizeCommandAuthorities(room.commandAuthorities),
        commandAuthorityRequests: this.normalizeCommandAuthorityRequests(room.commandAuthorityRequests),
        chat: Array.isArray(room.chat) ? room.chat.slice(-120) : [],
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

    normalizeCommandAuthorities(input) {
      if (!Array.isArray(input)) return [];
      return input
        .map((item) => ({
          slotId: String(item?.slotId || ""),
          playerId: String(item?.playerId || ""),
          playerName: String(item?.playerName || item?.nickname || item?.playerId || "").slice(0, 24),
          source: String(item?.source || "").slice(0, 24),
          updatedAt: Number(item?.updatedAt) || Date.now()
        }))
        .filter((item) => item.slotId && item.playerId)
        .slice(-16);
    }

    normalizeCommandAuthorityRequests(input) {
      if (!Array.isArray(input)) return [];
      return input
        .map((item) => ({
          id: String(item?.id || `${item?.slotId || "slot"}:request:${Date.now()}`),
          slotId: String(item?.slotId || ""),
          requesterId: String(item?.requesterId || ""),
          requesterName: String(item?.requesterName || item?.requesterId || "Player").slice(0, 24),
          status: item?.status === "denied" ? "denied" : "pending",
          requestedAt: Number(item?.requestedAt) || Date.now()
        }))
        .filter((item) => item.slotId && item.requesterId)
        .slice(-16);
    }
  }

  IronLine.RoomRegistry = RoomRegistry;
  IronLine.roomRegistry = IronLine.roomRegistry || new RoomRegistry();
})(window);
