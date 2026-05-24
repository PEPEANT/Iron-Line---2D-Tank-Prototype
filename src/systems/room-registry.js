"use strict";

(function registerRoomRegistry(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const STORAGE_KEY = "iron-line-room-registry-v1";
  const SELECTED_KEY = "iron-line-selected-room-v1";
  const API_BASE_KEY = "iron-line-rooms-api-base-v1";
  const PRODUCTION_ROOMS_API_BASE = "https://iron-line-2d-tank-prototype.onrender.com";
  const DEFAULT_SPECTATOR_CAPACITY = 12;
  const MAX_SPECTATOR_CAPACITY = 12;
  const REMOTE_REFRESH_INTERVAL_MS = 320;
  const MAX_COMBAT_EVENTS = 140;
  const MAX_WORLD_UNITS = 96;
  const ROOM_SETTING_LIMITS = Object.freeze({
    capacity: { min: 1, max: 8, fallback: 8 },
    blueAiTanks: { min: 0, max: 8, fallback: 3 },
    blueInfantry: { min: 4, max: 56, fallback: 21 },
    redTanks: { min: 1, max: 10, fallback: 5 },
    redInfantry: { min: 4, max: 64, fallback: 24 }
  });
  const ROLE_SLOT_IDS = Object.freeze([
    "blue-infantry",
    "blue-engineer",
    "blue-recon",
    "blue-armor",
    "red-infantry",
    "red-engineer",
    "red-recon",
    "red-armor"
  ]);

  function combatOnlyRecoveryMode() {
    try { const params = new URLSearchParams(global.location?.search || ""), value = params.get("p0CombatOnly") || params.get("combatOnly") || ""; return !["0", "false", "no", "off"].includes(String(value).toLowerCase()); } catch (_error) { return true; }
  }

  function finiteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function clampNumber(value, min = 0, max = 1, fallback = min) {
    const numeric = finiteNumber(value, fallback);
    return Math.max(min, Math.min(max, numeric));
  }

  function roundCoord(value) {
    const numeric = finiteNumber(value, 0);
    return Math.round(numeric);
  }

  function mergeCombatDuplicate(previous = {}, next = {}, raw = {}) {
    const merged = { ...previous, ...next };
    const numericFields = [
      "damage",
      "targetHealthBefore",
      "targetHealthAfter",
      "targetStateSeq",
      "shooterStateSeq",
      "serverSeq",
      "radius",
      "splash",
      "speed"
    ];
    for (const field of numericFields) {
      if (raw[field] === undefined && previous[field] !== undefined) merged[field] = previous[field];
    }
    const textFields = [
      "targetPlayerId",
      "shotId",
      "weaponId",
      "damageCause",
      "killerId",
      "shooterId",
      "shooterName",
      "projectileId",
      "targetVehicleId"
    ];
    for (const field of textFields) {
      if (!raw[field] && previous[field]) merged[field] = previous[field];
    }
    if (raw.hit === undefined && previous.hit !== undefined) merged.hit = previous.hit;
    if (raw.lethal === undefined && previous.lethal !== undefined) merged.lethal = previous.lethal;
    if (raw.accepted === undefined && previous.accepted !== undefined) merged.accepted = previous.accepted;
    if (raw.serverAuthority === undefined && previous.serverAuthority !== undefined) merged.serverAuthority = previous.serverAuthority;
    return merged;
  }

  class RoomRegistry {
    constructor() {
      this.storageKey = STORAGE_KEY;
      this.selectedKey = SELECTED_KEY;
      this.listeners = new Set();
      this.remoteRooms = [];
      this.remoteSignature = "";
      this.remoteOnline = false;
      this.remoteRefreshInFlight = false;
      this.pendingRemoteRoomIds = new Set();
      this.pendingPublishRooms = new Map();
      this.pendingPublishTimers = new Map();
      this.deletedRemoteRoomIds = new Set();
      this.remoteDetailCursors = new Map();
      this.localRoomsWriteSignature = "";
      this.lastRemoteSummaryRefreshAt = 0;
      this.lastRemoteDetailRefreshAt = 0;
      this.apiBase = this.resolveRoomsApiBase();
      window.addEventListener("storage", (event) => {
        if (event.key === this.storageKey || event.key === this.selectedKey) this.emit();
      });
      if (this.canUseRemoteApi()) {
        window.setTimeout(() => this.refreshRemoteRooms(), 200);
        window.setInterval(() => this.refreshRemoteRooms(), REMOTE_REFRESH_INTERVAL_MS);
      }
    }

    listRooms() {
      const roomsById = new Map();
      for (const room of this.readLocalRooms()) roomsById.set(room.id, room);
      for (const room of this.remoteRooms || []) {
        const previous = roomsById.get(room.id);
        if (!previous || Number(room.updatedAt) >= Number(previous.updatedAt)) roomsById.set(room.id, room);
      }
      return Array.from(roomsById.values()).sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
    }

    readLocalRooms() {
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

    canUseRemoteApi() {
      return typeof fetch === "function" &&
        typeof location !== "undefined" &&
        (location.protocol === "http:" || location.protocol === "https:");
    }

    resolveRoomsApiBase() {
      const normalized = (value) => {
        const text = String(value || "").trim();
        if (!text || text === "relative" || text === "local") return "";
        if (!/^https?:\/\//i.test(text)) return "";
        return text.replace(/\/+$/, "");
      };
      try {
        const params = new URLSearchParams(location.search || "");
        const explicit = normalized(params.get("roomsApi") || params.get("apiBase"));
        if (explicit) {
          localStorage.setItem(API_BASE_KEY, explicit);
          return explicit;
        }
        const stored = normalized(localStorage.getItem(API_BASE_KEY));
        if (stored) return stored;
      } catch (_error) {}
      if (location.hostname === "pepeant.github.io") return PRODUCTION_ROOMS_API_BASE;
      return "";
    }

    roomsApiUrl(id = "") {
      const path = id ? `/api/rooms/${encodeURIComponent(id)}` : "/api/rooms";
      return `${this.apiBase || ""}${path}`;
    }

    combatEventCursor(event = {}) { return Math.max(0, Math.floor(Number(event.serverSeq || event.combatServerSeq || event.sequence) || 0)); }
    roomDetailCursor(room = null) {
      const events = Array.isArray(room?.combatEvents) ? room.combatEvents : [];
      const combatServerSeq = events.reduce((max, event) => Math.max(max, this.combatEventCursor(event)), Math.max(0, Math.floor(Number(room?.combatServerSeq) || 0)));
      return { combatServerSeq, worldStateUpdatedAt: Math.max(0, Math.floor(Number(room?.worldState?.updatedAt) || 0)) };
    }
    roomDetailApiUrl(id = "", cursor = null) {
      const url = this.roomsApiUrl(id);
      const adminDetail = /\/admin\.html$/i.test(global.location?.pathname || "") || global.document?.body?.classList?.contains("admin-standalone-page");
      if (adminDetail || (!cursor?.combatServerSeq && !cursor?.worldStateUpdatedAt)) return url;
      const query = new URLSearchParams({ delta: "1", view: "player", combatAfter: String(cursor.combatServerSeq || 0), worldStateAfter: String(cursor.worldStateUpdatedAt || 0) });
      return `${url}?${query.toString()}`;
    }
    mergeRecordWindow(previous = [], incoming = [], max = 120, keyFn = null) {
      const merged = Array.isArray(previous) ? previous.slice() : [];
      const idFor = keyFn || ((item) => String(item?.id || item?.eventId || item?.commandId || item?.createdAt || ""));
      for (const item of Array.isArray(incoming) ? incoming : []) {
        const key = idFor(item);
        const index = key ? merged.findIndex((entry) => idFor(entry) === key) : -1;
        if (index >= 0) merged[index] = { ...merged[index], ...item };
        else merged.push(item);
      }
      return merged.slice(-max);
    }

    isSameCombatEvent(a = {}, b = {}) {
      if (a.id && b.id && a.id === b.id) return true;
      if (a.deathId && b.deathId && a.deathId === b.deathId) return true;
      if (a.respawnId && b.respawnId && a.respawnId === b.respawnId) return true;
      return Boolean((a.hitId && b.hitId && a.hitId === b.hitId) || (a.shotId && b.shotId && a.shotId === b.shotId && !a.deathId && !b.deathId && !a.respawnId && !b.respawnId));
    }

    mergeCombatEventWindow(previous = [], incoming = []) {
      const merged = Array.isArray(previous) ? previous.slice() : [];
      for (const event of Array.isArray(incoming) ? incoming : []) {
        const index = merged.findIndex((item) => this.isSameCombatEvent(item, event));
        if (index >= 0) merged[index] = { ...merged[index], ...event };
        else merged.push(event);
      }
      return merged.sort((a, b) => (this.combatEventCursor(a) - this.combatEventCursor(b)) || ((Number(a.createdAt) || 0) - (Number(b.createdAt) || 0))).slice(-MAX_COMBAT_EVENTS);
    }

    mergeRoomDetailDelta(previous = null, delta = null, cursors = null) {
      if (!previous || !delta?.detailDelta) return this.normalizeRoom(delta);
      const merged = this.normalizeRoom({ ...previous, ...delta,
        chat: this.mergeRecordWindow(previous.chat, delta.chat, 120), events: this.mergeRecordWindow(previous.events, delta.events, 80),
        commands: this.mergeCommandRecords(previous.commands || [], delta.commands || [], 120),
        combatEvents: this.mergeCombatEventWindow(previous.combatEvents, delta.combatEvents), worldState: delta.worldState || previous.worldState,
        combatServerSeq: Math.max(Number(previous.combatServerSeq) || 0, Number(delta.combatServerSeq) || 0, Number(cursors?.combatServerSeq) || 0) });
      if (merged) this.remoteDetailCursors.set(merged.id, this.roomDetailCursor(merged));
      return merged;
    }

    async fetchRemoteRoomDetail(id = "", previous = null) {
      if (!id) return null;
      try {
        const cursor = this.remoteDetailCursors.get(id) || this.roomDetailCursor(previous);
        const response = await fetch(this.roomDetailApiUrl(id, previous ? cursor : null), { cache: "no-store" });
        if (!response.ok) return null;
        const payload = await response.json();
        if (!payload?.room) return null;
        const room = payload.room.detailDelta
          ? this.mergeRoomDetailDelta(previous, payload.room, payload.cursors)
          : this.normalizeRoom(payload.room);
        if (room) this.remoteDetailCursors.set(room.id, this.roomDetailCursor(room));
        return room;
      } catch (_error) {
        return null;
      }
    }

    mergeRoomSummary(previous = null, summary = null, preserveDetails = false) {
      const normalized = this.normalizeRoom(summary);
      if (!normalized || !summary?.summary || !preserveDetails || !previous) return normalized;
      return this.normalizeRoom({
        ...previous,
        ...summary,
        players: previous.players,
        spectators: previous.spectators,
        admins: previous.admins,
        moderation: previous.moderation,
        commandAuthorities: previous.commandAuthorities,
        commandAuthorityRequests: previous.commandAuthorityRequests,
        chat: previous.chat,
        events: previous.events,
        commands: previous.commands,
        combatEvents: previous.combatEvents,
        worldState: previous.worldState
      });
    }

    remoteRoomSignature(rooms = []) {
      return rooms
        .map((room) => [
          room.id,
          room.phase,
          room.locked ? 1 : 0,
          room.updatedAt,
          room.capacity,
          room.difficulty,
          room.blueAiTanks,
          room.blueInfantry,
          room.redTanks,
          room.redInfantry,
          (room.players || []).map((player) => `${player.id}/${player.slotId}/${player.ready ? 1 : 0}/${player.updatedAt || 0}`).join(","),
          room.spectators?.length || 0,
          room.admins?.length || 0,
          room.chat?.length || 0,
          room.chat?.[room.chat.length - 1]?.id || "",
          room.events?.length || 0,
          room.events?.[room.events.length - 1]?.id || "",
          room.commands?.length || 0,
          room.commands?.[room.commands.length - 1]?.id || "",
          room.combatEvents?.length || 0,
          room.combatEvents?.[room.combatEvents.length - 1]?.id || "",
          room.worldState?.updatedAt || 0,
          room.worldState?.hostId || ""
        ].join(":"))
        .join("|");
    }

    async refreshRemoteRooms() {
      return IronLine.RoomRefreshCadence.refreshRemoteRooms(this);
    }

    publishRoom(room) {
      if (!this.canUseRemoteApi() || !room?.id) return Promise.resolve(null);
      if (this.deletedRemoteRoomIds.has(room.id)) return Promise.resolve(null);
      const optimisticRoom = this.normalizeRoom(room);
      if (optimisticRoom) {
        this.pendingRemoteRoomIds.add(optimisticRoom.id);
        this.deletedRemoteRoomIds.delete(optimisticRoom.id);
        this.upsertRemoteRoom(this.preserveFreshWorldState(optimisticRoom));
        this.emit();
      }
      return fetch(this.roomsApiUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(room)
        })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          const remoteRoom = payload?.room ? this.normalizeRoom(payload.room) : null;
          if (!remoteRoom) {
            if (optimisticRoom) this.pendingRemoteRoomIds.delete(optimisticRoom.id);
            return null;
          }
          const localRoom = this.readLocalRooms().find((item) => item.id === remoteRoom.id);
          if (!localRoom || this.roomUpdatedAt(remoteRoom) >= this.roomUpdatedAt(localRoom)) {
            this.pendingRemoteRoomIds.delete(remoteRoom.id);
          }
          this.upsertRemoteRoom(this.preserveFreshWorldState(remoteRoom));
          this.remoteOnline = true;
          this.emit();
          return remoteRoom;
        })
        .catch(() => {
          if (optimisticRoom) this.pendingRemoteRoomIds.delete(optimisticRoom.id);
          this.remoteOnline = false;
          return null;
        });
    }

    publishWorldState(roomId = "", worldState = null) {
      if (!this.canUseRemoteApi() || !roomId || !worldState || this.deletedRemoteRoomIds.has(roomId)) return Promise.resolve(null);
      return fetch(`${this.roomsApiUrl(roomId)}/world-state`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ worldState })
      })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          if (payload?.ok) this.remoteOnline = true;
          return payload;
        })
        .catch(() => {
          this.remoteOnline = false;
          return null;
        });
    }

    schedulePublishRoom(room, delayMs = 160) {
      if (!this.canUseRemoteApi() || !room?.id) return;
      if (this.deletedRemoteRoomIds.has(room.id)) return;
      const normalized = this.normalizeRoom(room);
      if (!normalized) return;
      this.pendingRemoteRoomIds.add(normalized.id);
      this.deletedRemoteRoomIds.delete(normalized.id);
      this.pendingPublishRooms.set(normalized.id, normalized);
      this.upsertRemoteRoom(this.preserveFreshWorldState(normalized));
      if (this.pendingPublishTimers.has(normalized.id)) return;
      const delay = Math.max(40, Math.min(500, Math.round(Number(delayMs) || 160)));
      const timer = window.setTimeout(() => {
        this.pendingPublishTimers.delete(normalized.id);
        const latest = this.pendingPublishRooms.get(normalized.id) || this.getRoom(normalized.id);
        this.pendingPublishRooms.delete(normalized.id);
        if (latest) this.publishRoom(latest);
      }, delay);
      this.pendingPublishTimers.set(normalized.id, timer);
    }

    upsertRemoteRoom(room, options = {}) {
      if (!room?.id) return;
      const roomTime = this.roomUpdatedAt(room);
      const current = this.remoteRooms?.find?.((item) => item.id === room.id) || this.readLocalRooms().find((item) => item.id === room.id);
      if (current && this.roomUpdatedAt(current) > roomTime) return;
      if ((Number(current?.worldState?.updatedAt) || 0) > (Number(room.worldState?.updatedAt) || 0)) room = { ...room, worldState: current.worldState };
      const nextRooms = (this.remoteRooms || []).filter((item) => item.id !== room.id);
      nextRooms.push(room);
      this.remoteRooms = nextRooms.sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
      this.remoteSignature = this.remoteRoomSignature(this.remoteRooms);
      if (options.persist !== false) this.writeLocalRooms(this.remoteRooms);
    }

    roomUpdatedAt(room = null) {
      const numeric = Number(room?.updatedAt || 0);
      if (Number.isFinite(numeric) && numeric > 0) return numeric;
      const parsed = Date.parse(room?.updatedAt || "");
      return Number.isFinite(parsed) ? parsed : 0;
    }
    preserveFreshWorldState(room = null) {
      const current = room?.id ? this.getRoom(room.id) : null;
      return (Number(current?.worldState?.updatedAt) || 0) > (Number(room?.worldState?.updatedAt) || 0) ? { ...room, worldState: current.worldState } : room;
    }
    deleteRemoteRoom(id) {
      if (!this.canUseRemoteApi() || !id) return Promise.resolve(false);
      this.pendingRemoteRoomIds.delete(id);
      this.pendingPublishRooms.delete(id);
      const timer = this.pendingPublishTimers.get(id);
      if (timer) window.clearTimeout(timer);
      this.pendingPublishTimers.delete(id);
      this.deletedRemoteRoomIds.add(id);
      this.remoteRooms = (this.remoteRooms || []).filter((room) => room.id !== id);
      this.remoteSignature = this.remoteRoomSignature(this.remoteRooms);
      this.writeLocalRooms(this.remoteRooms);
      return fetch(this.roomsApiUrl(id), { method: "DELETE", keepalive: true })
        .then((response) => {
          if (!response.ok) this.deletedRemoteRoomIds.delete(id);
          return response.ok;
        })
        .catch(() => {
          this.deletedRemoteRoomIds.delete(id);
          return false;
        });
    }

    deleteRemoteParticipant(roomId, playerId) {
      if (!this.canUseRemoteApi() || !roomId || !playerId) return Promise.resolve(false);
      return fetch(`${this.roomsApiUrl(roomId)}/participants/${encodeURIComponent(playerId)}`, {
        method: "DELETE",
        keepalive: true
      })
        .then((response) => response.ok)
        .catch(() => false);
    }

    createRoom(input = {}) {
      const rooms = this.readLocalRooms();
      const knownRooms = this.listRooms();
      const room = this.normalizeRoom({
        id: input.id || this.nextRoomId(knownRooms),
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
        capacity: input.capacity,
        spectators: [],
        spectatorCapacity: input.spectatorCapacity,
        difficulty: input.difficulty,
        aiDensityPreset: input.aiDensityPreset || "custom",
        blueAiTanks: input.blueAiTanks,
        blueInfantry: input.blueInfantry,
        redTanks: input.redTanks,
        redInfantry: input.redInfantry,
        admins: [],
        spectatorChatVisibleToPlayers: true,
        moderation: [],
        commandAuthorities: [],
        commandAuthorityRequests: [],
        chat: [],
        events: [],
        commands: [],
        combatEvents: [],
        worldState: null,
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
      this.publishRoom(room);
      this.selectRoom(room.id);
      return room;
    }

    updateRoom(id, patch = {}, options = {}) {
      const rooms = this.readLocalRooms();
      const index = rooms.findIndex((room) => room.id === id);
      const base = index >= 0 ? rooms[index] : this.getRoom(id);
      if (!base) return null;
      const next = this.normalizeRoom({
        ...base,
        ...patch,
        updatedAt: Date.now()
      });
      if (index >= 0) rooms[index] = next;
      else rooms.push(next);
      this.saveRooms(rooms);
      if (!options.skipPublish) this.publishRoom(next);
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
        admins: [],
        events: this.nextEvents(room, {
          type: "room_reset",
          severity: "warning",
          title: "\ubc29 \ucd08\uae30\ud654",
          detail: `${room?.name || id} \ubc29\uc774 \ucd08\uae30\ud654\ub418\uc5c8\uc2b5\ub2c8\ub2e4.`
        })
      });
    }

    deleteRoom(id) {
      const rooms = this.readLocalRooms().filter((room) => room.id !== id);
      this.saveRooms(rooms);
      this.deleteRemoteRoom(id);
      if (this.selectedRoomId() === id) {
        const nextRoom = this.listRooms()[0] || null;
        if (nextRoom) localStorage.setItem(this.selectedKey, nextRoom.id);
        else localStorage.removeItem(this.selectedKey);
      }
      this.emit();
      return true;
    }

    addOrUpdatePlayer(roomId, player = {}) {
      const room = this.getRoom(roomId);
      if (!room || !player.id) return null;
      const participantType = this.normalizeParticipantType(player.participantType);
      if (combatOnlyRecoveryMode() && participantType !== "player") return null;
      if (this.isKicked(room, player.id)) return null;
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
        hp: position?.hp ?? Math.max(0, Number(player.hp) || 0),
        maxHp: position?.maxHp ?? Math.max(1, Number(player.maxHp) || 100),
        stateSeq: position?.stateSeq ?? Math.max(0, Math.floor(Number(player.stateSeq) || 0)),
        deathState: position?.deathState || player.deathState || "",
        alive: position?.alive ?? player.alive !== false,
        inVehicle: Boolean(position?.inVehicle || player.inVehicle),
        vehicleId: String(position?.vehicleId || player.vehicleId || "").slice(0, 36),
        vehicleType: String(position?.vehicleType || player.vehicleType || "").slice(0, 18),
        aimX: position?.aimX ?? null,
        aimY: position?.aimY ?? null,
        droneId: String(position?.droneId || player.droneId || "").slice(0, 36),
        droneType: String(position?.droneType || player.droneType || "").slice(0, 18),
        droneControlled: Boolean(position?.droneControlled || player.droneControlled),
        participantType,
        factionId: player.factionId || player.skinId || "",
        skinId: player.factionId || player.skinId || "",
        ready: Boolean(player.ready),
        host: Boolean(player.host),
        updatedAt: Date.now()
      };
      if (participantType === "player") {
        const slotId = this.resolvePlayerSlot(room, nextPlayer, players);
        if (!slotId) return null;
        nextPlayer.slotId = slotId;
        nextPlayer.team = this.slotTeam(slotId) || nextPlayer.team || "blue";
        players.push(nextPlayer);
      }
      else {
        const spectatorCapacity = Math.max(0, Math.round(Number(room.spectatorCapacity) || DEFAULT_SPECTATOR_CAPACITY));
        const alreadySpectating = Boolean(previous && previous.participantType !== "player");
        if (!alreadySpectating && spectators.length >= spectatorCapacity) return null;
        spectators.push(nextPlayer);
      }
      const event = this.playerEvent(previous, nextPlayer);
      const structuralChange = Boolean(event);
      const patch = {
        players,
        spectators,
        events: event ? this.nextEvents(room, event) : room.events
      };
      const livePositionOnly = !structuralChange && participantType === "player" && room.phase === "playing";
      const updated = livePositionOnly
        ? this.normalizeRoom({ ...room, ...patch, updatedAt: Date.now() })
        : this.updateRoom(roomId, patch, { skipPublish: true });
      if (updated) {
        if (livePositionOnly) this.upsertRemoteRoom(this.preserveFreshWorldState(updated), { persist: false });
        if (structuralChange) this.schedulePublishRoom(updated, 120);
        this.publishParticipant(roomId, nextPlayer);
      }
      return updated;
    }

    resolvePlayerSlot(room, player = {}, existingPlayers = []) {
      const slots = ROLE_SLOT_IDS;
      const validSlots = new Set(slots);
      const occupied = new Set(
        existingPlayers
          .filter((item) => (item.participantType || "player") === "player")
          .map((item) => this.normalizeSlotId(item.slotId))
          .filter((slotId) => validSlots.has(slotId))
      );
      const requested = this.normalizeSlotId(player.slotId);
      if (requested && validSlots.has(requested) && !occupied.has(requested)) return requested;
      const teams = this.balancedSlotTeams(occupied);
      for (const team of teams) {
        const slot = slots.find((slotId) => this.slotTeam(slotId) === team && !occupied.has(slotId));
        if (slot) return slot;
      }
      return slots.find((slotId) => !occupied.has(slotId)) || "";
    }

    balancedSlotTeams(occupied = new Set()) {
      const counts = { blue: 0, red: 0 };
      for (const slotId of occupied) {
        const team = this.slotTeam(slotId);
        if (team) counts[team] += 1;
      }
      return counts.blue <= counts.red ? ["blue", "red"] : ["red", "blue"];
    }

    normalizeSlotId(slotId = "") {
      const text = String(slotId || "");
      if (text.endsWith("-scout")) return text.replace("-scout", "-recon");
      return text;
    }

    slotTeam(slotId = "") {
      if (String(slotId).startsWith("red-")) return "red";
      if (String(slotId).startsWith("blue-")) return "blue";
      return "";
    }

    normalizePlayerPosition(player = {}) {
      const raw = player.position || player;
      const x = Number(raw.x);
      const y = Number(raw.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        x: Math.round(x),
        y: Math.round(y),
        stateSeq: Math.max(0, Math.floor(Number(raw.stateSeq ?? player.stateSeq) || 0)),
        stateUpdatedAt: Number(raw.stateUpdatedAt ?? player.stateUpdatedAt ?? raw.updatedAt ?? player.updatedAt ?? Date.now()) || Date.now(),
        alive: raw.alive !== false && player.alive !== false,
        deathState: String(raw.deathState || player.deathState || (raw.alive === false || player.alive === false ? "dead" : "alive")).slice(0, 16),
        hp: clampNumber(raw.hp ?? player.hp, 0, 999, raw.alive === false || player.alive === false ? 0 : 100),
        maxHp: clampNumber(raw.maxHp ?? player.maxHp, 1, 999, 100),
        weaponId: String(raw.weaponId || player.weaponId || "").slice(0, 32),
        movementState: String(raw.movementState || player.movementState || "").slice(0, 24),
        inVehicle: Boolean(raw.inVehicle || player.inVehicle),
        vehicleId: String(raw.vehicleId || player.vehicleId || "").slice(0, 36),
        vehicleType: String(raw.vehicleType || player.vehicleType || "").slice(0, 18),
        vehicleHp: clampNumber(raw.vehicleHp ?? player.vehicleHp, 0, 999, 0),
        vehicleMaxHp: clampNumber(raw.vehicleMaxHp ?? player.vehicleMaxHp, 0, 999, 0),
        turretAngle: finiteNumber(raw.turretAngle ?? player.turretAngle, 0),
        machineGunAngle: finiteNumber(raw.machineGunAngle ?? player.machineGunAngle, 0),
        aimX: Number.isFinite(Number(raw.aimX ?? player.aimX)) ? roundCoord(raw.aimX ?? player.aimX) : null,
        aimY: Number.isFinite(Number(raw.aimY ?? player.aimY)) ? roundCoord(raw.aimY ?? player.aimY) : null,
        droneId: String(raw.droneId || player.droneId || "").slice(0, 36),
        droneType: String(raw.droneType || player.droneType || "").slice(0, 18),
        droneX: Number.isFinite(Number(raw.droneX ?? player.droneX)) ? roundCoord(raw.droneX ?? player.droneX) : null,
        droneY: Number.isFinite(Number(raw.droneY ?? player.droneY)) ? roundCoord(raw.droneY ?? player.droneY) : null,
        droneAngle: finiteNumber(raw.droneAngle ?? player.droneAngle, 0),
        droneControlled: Boolean(raw.droneControlled || player.droneControlled),
        angle: Number.isFinite(Number(raw.angle)) ? Number(raw.angle) : 0,
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
      const updated = this.updateRoom(roomId, {
        players,
        spectators,
        events: event ? this.nextEvents(room, event) : room.events
      });
      this.deleteRemoteParticipant(roomId, playerId);
      return updated;
    }

    touchAdmin(roomId, admin = {}) {
      const room = this.getRoom(roomId);
      if (!room) return null;
      if (combatOnlyRecoveryMode() && room.phase === "playing") return null;
      const now = Date.now();
      const id = String(admin.id || "admin-local").slice(0, 36);
      const admins = (room.admins || []).filter((item) => item.id !== id);
      admins.push({
        id,
        name: String(admin.name || "\uad00\ub9ac\uc790").slice(0, 24),
        participantType: "admin",
        updatedAt: now
      });
      return this.updateRoom(roomId, { admins });
    }

    warnParticipant(roomId, playerId, reason = "관리자 경고") {
      const room = this.getRoom(roomId);
      if (!room || !playerId) return null;
      const target = [...(room.players || []), ...(room.spectators || [])].find((item) => item.id === playerId);
      if (!target) return null;
      const name = target.name || target.nickname || "Player";
      const text = `${name}님에게 관리자 경고가 전달되었습니다.`;
      return this.updateRoom(roomId, {
        moderation: this.nextModeration(room, {
          type: "warning",
          playerId,
          playerName: name,
          reason
        }),
        chat: this.nextSystemChat(room, text),
        events: this.nextEvents(room, {
          type: "participant_warned",
          severity: "warning",
          title: "관리자 경고",
          detail: `${name}님에게 경고가 전달되었습니다.`
        })
      });
    }

    isKicked(room, playerId) {
      const id = String(playerId || "");
      if (!room || !id) return false;
      return (room.moderation || []).some((item) => item.type === "kick" && item.playerId === id);
    }

    kickParticipant(roomId, playerId, reason = "관리자 강퇴") {
      const room = this.getRoom(roomId);
      if (!room || !playerId) return null;
      const target = [...(room.players || []), ...(room.spectators || [])].find((item) => item.id === playerId);
      if (!target) return null;
      const name = target.name || target.nickname || "Player";
      const players = (room.players || []).filter((item) => item.id !== playerId);
      const spectators = (room.spectators || []).filter((item) => item.id !== playerId);
      return this.updateRoom(roomId, {
        players,
        spectators,
        moderation: this.nextModeration(room, {
          type: "kick",
          playerId,
          playerName: name,
          reason
        }),
        chat: this.nextSystemChat(room, `${name}님이 관리자에 의해 강퇴되었습니다.`),
        events: this.nextEvents(room, {
          type: "participant_kicked",
          severity: "warning",
          title: "관리자 강퇴",
          detail: `${name}님이 방에서 강퇴되었습니다.`
        })
      });
    }

    cleanupStaleParticipants(maxAgeMs = 45000) {
      const now = Date.now();
      let changed = false;
      const rooms = this.listRooms().map((room) => {
        const players = (room.players || []).filter((player) => now - (Number(player.updatedAt) || 0) <= maxAgeMs);
        const spectators = (room.spectators || []).filter((player) => now - (Number(player.updatedAt) || 0) <= maxAgeMs);
        const admins = (room.admins || []).filter((admin) => now - (Number(admin.updatedAt) || 0) <= maxAgeMs);
        if (
          players.length === (room.players || []).length &&
          spectators.length === (room.spectators || []).length &&
          admins.length === (room.admins || []).length
        ) return room;
        changed = true;
        return {
          ...room,
          players,
          spectators,
          admins,
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

    commandApiUrl(roomId = "") {
      return `${this.roomsApiUrl(roomId)}/commands`;
    }

    participantApiUrl(roomId = "") {
      return `${this.roomsApiUrl(roomId)}/participants`;
    }

    combatApiUrl(roomId = "") {
      return `${this.roomsApiUrl(roomId)}/combat`;
    }

    pushCommand(roomId, command = {}) {
      const room = this.getRoom(roomId);
      if (!room) return null;
      if (this.deletedRemoteRoomIds.has(room.id)) return null;
      const packet = this.normalizeCommand({
        ...command,
        roomId: room.id
      });
      if (!packet) return null;
      const commands = this.mergeCommandRecords(room.commands || [], [packet], 120);
      const next = this.updateRoom(room.id, { commands });
      if (this.canUseRemoteApi()) {
        fetch(this.commandApiUrl(room.id), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(packet)
        })
          .then((response) => response.ok ? response.json() : null)
          .then((payload) => {
            const remoteRoom = payload?.room ? this.normalizeRoom(payload.room) : null;
            if (remoteRoom) {
              this.upsertRemoteRoom(this.preserveFreshWorldState(remoteRoom));
              this.emit();
            }
          })
          .catch(() => {});
      }
      return packet;
    }

    recentCommands(roomId, limit = 40) {
      const room = this.getRoom(roomId);
      return (room?.commands || []).slice(-limit);
    }

    publishCombatEvent(roomId, combatEvent = {}, fallbackRoom = null) {
      if (!this.canUseRemoteApi() || !roomId || !combatEvent?.id) return Promise.resolve(null);
      if (this.deletedRemoteRoomIds.has(roomId)) return Promise.resolve(null);
      return fetch(this.combatApiUrl(roomId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(combatEvent)
      })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          const remoteRoom = payload?.room ? this.normalizeRoom(payload.room) : null;
          if (remoteRoom) {
            this.pendingRemoteRoomIds.delete(remoteRoom.id);
            this.upsertRemoteRoom(this.preserveFreshWorldState(remoteRoom));
            this.remoteOnline = true;
            this.emit();
            return payload;
          }
          if (payload?.ok) {
            this.pendingRemoteRoomIds.delete(payload.roomId || roomId);
            this.remoteOnline = true;
            return payload;
          }
          if (fallbackRoom) this.schedulePublishRoom(fallbackRoom, 120);
          return null;
        })
        .catch(() => {
          if (fallbackRoom) this.schedulePublishRoom(fallbackRoom, 180);
          this.remoteOnline = false;
          return null;
        });
    }

    publishParticipant(roomId, participant = {}) {
      if (!this.canUseRemoteApi() || !roomId || !participant?.id) return Promise.resolve(null);
      if (this.deletedRemoteRoomIds.has(roomId)) return Promise.resolve(null);
      return fetch(this.participantApiUrl(roomId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...participant,
          playerId: participant.id
        })
      })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          const remoteRoom = payload?.room ? this.normalizeRoom(payload.room) : null;
          if (remoteRoom) {
            this.upsertRemoteRoom(this.preserveFreshWorldState(remoteRoom));
            this.remoteOnline = true;
            this.emit();
          }
          if (payload?.ok) {
            this.remoteOnline = true;
            return payload;
          }
          return remoteRoom;
        })
        .catch(() => {
          this.remoteOnline = false;
          return null;
        });
    }

    pushCombatEvent(roomId, event = {}) {
      const room = this.getRoom(roomId);
      if (!room) return null;
      const createdAt = Number(event.createdAt) || Date.now();
      const combatEvent = {
        id: String(event.id || `${room.id}:combat:${createdAt}:${Math.random().toString(36).slice(2, 7)}`),
        roomId: room.id,
        createdAt,
        type: String(event.type || "small_arms").slice(0, 32),
        shooterId: String(event.shooterId || event.playerId || "").slice(0, 48),
        shooterName: String(event.shooterName || event.sender || "Player").slice(0, 24),
        shooterTeam: event.shooterTeam === "red" ? "red" : "blue",
        targetPlayerId: String(event.targetPlayerId || "").slice(0, 48),
        weaponId: String(event.weaponId || "rifle").slice(0, 32),
        damage: clampNumber(event.damage, 0, 120),
        hit: Boolean(event.hit && event.targetPlayerId),
        x1: roundCoord(event.x1),
        y1: roundCoord(event.y1),
        x2: roundCoord(event.x2),
        y2: roundCoord(event.y2),
        hitX: roundCoord(event.hitX ?? event.x2),
        hitY: roundCoord(event.hitY ?? event.y2),
        angle: finiteNumber(event.angle, 0),
        ttl: clampNumber(event.ttl, 0.04, 0.35, 0.12)
      };
      combatEvent.eventId = String(event.eventId || combatEvent.id).slice(0, 96);
      combatEvent.sequence = Math.max(0, Math.floor(Number(event.sequence) || 0));
      combatEvent.serverSeq = Math.max(0, Math.floor(Number(event.serverSeq) || 0));
      combatEvent.shotId = String(event.shotId || event.eventId || event.id || "").slice(0, 96);
      combatEvent.hitId = String(event.hitId || "").slice(0, 96);
      combatEvent.deathId = String(event.deathId || "").slice(0, 96);
      combatEvent.respawnId = String(event.respawnId || "").slice(0, 96);
      combatEvent.killerId = String(event.killerId || (combatEvent.type === "player_death" || event.lethal ? event.shooterId : "") || "").slice(0, 48);
      combatEvent.damageCause = String(event.damageCause || event.cause || event.weaponId || "").slice(0, 48);
      combatEvent.lethal = Boolean(event.lethal);
      combatEvent.accepted = event.accepted !== undefined ? Boolean(event.accepted) : undefined;
      combatEvent.reason = String(event.reason || "").slice(0, 64);
      combatEvent.serverAuthority = Boolean(event.serverAuthority);
      combatEvent.confirmedAt = Number(event.confirmedAt) || 0;
      combatEvent.targetHealthBefore = clampNumber(event.targetHealthBefore, 0, 999, 0);
      combatEvent.targetHealthAfter = clampNumber(event.targetHealthAfter, 0, 999, 0);
      combatEvent.targetStateSeq = Math.max(0, Math.floor(Number(event.targetStateSeq) || 0));
      combatEvent.shooterStateSeq = Math.max(0, Math.floor(Number(event.shooterStateSeq) || 0));
      combatEvent.projectileId = String(event.projectileId || "").slice(0, 48);
      combatEvent.targetVehicleId = String(event.targetVehicleId || "").slice(0, 36);
      combatEvent.radius = clampNumber(event.radius, 0, 2200, 0);
      combatEvent.splash = clampNumber(event.splash, 0, 2200, 0);
      combatEvent.speed = clampNumber(event.speed, 0, 3000, 0);
      combatEvent.vx = finiteNumber(event.vx, 0);
      combatEvent.vy = finiteNumber(event.vy, 0);
      combatEvent.smoke = Boolean(event.smoke);
      const rooms = this.readLocalRooms();
      const index = rooms.findIndex((item) => item.id === room.id);
      const base = index >= 0 ? rooms[index] : room;
      const nextEvents = Array.isArray(base.combatEvents) ? base.combatEvents.slice(-(MAX_COMBAT_EVENTS - 1)) : [];
      const duplicateIndex = nextEvents.findIndex((item) => (
        item?.id === combatEvent.id ||
        (combatEvent.deathId && item?.deathId === combatEvent.deathId) ||
        (combatEvent.respawnId && item?.respawnId === combatEvent.respawnId) ||
        (!combatEvent.deathId && !combatEvent.respawnId && combatEvent.hitId && item?.hitId === combatEvent.hitId) ||
        (!combatEvent.deathId && !combatEvent.respawnId && !combatEvent.hitId && combatEvent.shotId && item?.shotId === combatEvent.shotId)
      ));
      if (duplicateIndex >= 0) {
        nextEvents[duplicateIndex] = mergeCombatDuplicate(nextEvents[duplicateIndex], combatEvent, event);
      } else {
        nextEvents.push(combatEvent);
      }
      const next = this.normalizeRoom({
        ...base,
        combatEvents: nextEvents,
        updatedAt: Date.now()
      });
      if (!next) return null;
      if (index >= 0) rooms[index] = next;
      else rooms.push(next);
      if (this.canUseRemoteApi() && base.phase === "playing") {
        this.upsertRemoteRoom(next, { persist: false });
      } else {
        this.saveRooms(rooms);
      }
      if (this.canUseRemoteApi()) {
        this.publishCombatEvent(room.id, combatEvent, next);
      } else {
        this.schedulePublishRoom(next, combatEvent.type === "small_arms" ? 180 : 90);
      }
      return duplicateIndex >= 0 ? nextEvents[duplicateIndex] : combatEvent;
    }

    recentCombatEvents(roomId, limit = 80) {
      const room = this.getRoom(roomId);
      return (room?.combatEvents || []).slice(-limit);
    }

    updateWorldState(roomId, state = {}) {
      const room = this.getRoom(roomId);
      if (!room) return null;
      const worldState = this.normalizeWorldState({
        ...state,
        roomId: room.id,
        updatedAt: Date.now()
      });
      if (IronLine.WorldStatePublishGuard?.shouldPublish?.(this.normalizeWorldState(room.worldState), worldState) === false) return null;
      if (this.canUseRemoteApi()) {
        const next = this.normalizeRoom({ ...room, worldState, updatedAt: Date.now() });
        if (!next) return null;
        this.upsertRemoteRoom(next, { persist: false });
        this.publishWorldState(room.id, worldState);
        return next;
      }
      return this.updateRoom(room.id, { worldState });
    }
    normalizeWorldState(state = {}) {
      if (!state || typeof state !== "object") return null;
      const vehicleSnapshot = (item) => ({
        id: String(item?.id || item?.callSign || "").slice(0, 36),
        type: String(item?.type || item?.vehicleType || "tank").slice(0, 18),
        team: item?.team === "red" ? "red" : "blue",
        x: roundCoord(item?.x),
        y: roundCoord(item?.y),
        angle: finiteNumber(item?.angle, 0),
        turretAngle: finiteNumber(item?.turretAngle, 0),
        machineGunAngle: finiteNumber(item?.machineGunAngle, 0),
        hp: clampNumber(item?.hp, 0, 999, 0),
        maxHp: clampNumber(item?.maxHp, 0, 999, 1),
        alive: item?.alive !== false,
        controllerId: String(item?.controllerId || "").slice(0, 48)
      });
      const unitSnapshot = (item) => ({
        id: String(item?.id || item?.callSign || "").slice(0, 42),
        team: item?.team === "red" ? "red" : "blue",
        x: roundCoord(item?.x),
        y: roundCoord(item?.y),
        angle: finiteNumber(item?.angle, 0),
        hp: clampNumber(item?.hp, 0, 999, 0),
        maxHp: clampNumber(item?.maxHp, 0, 999, 1),
        alive: item?.alive !== false,
        inVehicle: Boolean(item?.inVehicle)
      });
      const captureSnapshot = (item) => ({
        id: String(item?.id || item?.name || "").slice(0, 16),
        owner: item?.owner === "red" ? "red" : item?.owner === "blue" ? "blue" : "",
        progress: clampNumber(item?.progress, -1, 1, 0),
        contested: Boolean(item?.contested)
      });
      return {
        roomId: String(state.roomId || "").slice(0, 48),
        hostId: String(state.hostId || "").slice(0, 48),
        tick: Math.max(0, Math.floor(Number(state.tick) || 0)),
        updatedAt: Number(state.updatedAt) || Date.now(),
        vehicles: Array.isArray(state.vehicles) ? state.vehicles.map(vehicleSnapshot).filter((item) => item.id).slice(0, 64) : [],
        units: Array.isArray(state.units) ? state.units.map(unitSnapshot).filter((item) => item.id).slice(0, MAX_WORLD_UNITS) : [],
        capturePoints: Array.isArray(state.capturePoints) ? state.capturePoints.map(captureSnapshot).filter((item) => item.id).slice(0, 12) : []
      };
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

    nextSystemChat(room, text) {
      const chat = Array.isArray(room?.chat) ? room.chat.slice(-119) : [];
      chat.push({
        id: `${room.id}:chat:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
        roomId: room.id,
        createdAt: Date.now(),
        channel: "system",
        sender: "관리자",
        playerId: "admin",
        team: "",
        participantType: "admin",
        text: String(text || "").slice(0, 120)
      });
      return chat;
    }

    nextModeration(room, entry = {}) {
      const moderation = Array.isArray(room?.moderation) ? room.moderation.slice(-79) : [];
      moderation.push({
        id: entry.id || `${room.id}:mod:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
        roomId: room.id,
        type: entry.type === "kick" ? "kick" : "warning",
        playerId: String(entry.playerId || ""),
        playerName: String(entry.playerName || "Player").slice(0, 24),
        reason: String(entry.reason || "").slice(0, 80),
        createdAt: Date.now()
      });
      return moderation;
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
      this.writeLocalRooms(rooms);
      this.emit();
    }

    writeLocalRooms(rooms) {
      try {
        const serialized = JSON.stringify((rooms || []).map((room) => this.normalizeRoom(room)).filter(Boolean));
        if (serialized === this.localRoomsWriteSignature) return false;
        localStorage.setItem(this.storageKey, serialized);
        this.localRoomsWriteSignature = serialized;
        return true;
      } catch (_error) {}
      return false;
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
      const capacity = this.normalizeRoomNumber(room.capacity, ROOM_SETTING_LIMITS.capacity);
      const spectatorCapacity = Math.max(0, Math.min(MAX_SPECTATOR_CAPACITY, Math.round(Number(room.spectatorCapacity) || DEFAULT_SPECTATOR_CAPACITY)));
      const players = this.normalizeRoomPlayers(Array.isArray(room.players) ? room.players.slice(0, capacity) : [], capacity);
      const spectators = Array.isArray(room.spectators) ? room.spectators.slice(0, spectatorCapacity) : [];
      const admins = this.normalizeAdmins(room.admins);
      const matchSettings = this.normalizeRoomMatchSettings(room);
      return {
        id,
        summary: Boolean(room.summary),
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
        ...matchSettings,
        admins,
        spectatorChatVisibleToPlayers: room.spectatorChatVisibleToPlayers !== false,
        moderation: this.normalizeModeration(room.moderation),
        commandAuthorities: this.normalizeCommandAuthorities(room.commandAuthorities),
        commandAuthorityRequests: this.normalizeCommandAuthorityRequests(room.commandAuthorityRequests),
        chat: Array.isArray(room.chat) ? room.chat.slice(-120) : [],
        events: Array.isArray(room.events) ? room.events.slice(-80) : [],
        commands: this.normalizeCommands(room.commands),
        combatEvents: Array.isArray(room.combatEvents) ? room.combatEvents.slice(-MAX_COMBAT_EVENTS) : [],
        worldState: this.normalizeWorldState(room.worldState),
        createdAt: Number(room.createdAt) || Date.now(),
        updatedAt: Number(room.updatedAt) || Date.now(),
        startedAt: Number(room.startedAt) || 0,
        endedAt: Number(room.endedAt) || 0
      };
    }

    normalizeRoomNumber(value, limit) {
      const fallback = Number(limit?.fallback) || 0;
      const numeric = Math.round(Number(value));
      const safe = Number.isFinite(numeric) ? numeric : fallback;
      return Math.max(limit.min, Math.min(limit.max, safe));
    }

    normalizeRoomPlayers(players = [], capacity = ROOM_SETTING_LIMITS.capacity.fallback) {
      const resolved = [];
      for (const player of players) {
        if (!player || (player.participantType && player.participantType !== "player")) continue;
        const nextPlayer = { ...player, participantType: "player" };
          const slotId = this.resolvePlayerSlot({ capacity }, nextPlayer, resolved);
        if (!slotId) continue;
        nextPlayer.slotId = slotId;
        nextPlayer.team = this.slotTeam(slotId) || nextPlayer.team || "blue";
        resolved.push(nextPlayer);
      }
      return resolved;
    }

    normalizeRoomMatchSettings(room = {}) {
      const difficulty = ["easy", "normal", "hard"].includes(room.difficulty) ? room.difficulty : "normal";
      return {
        difficulty,
        aiDensityPreset: String(room.aiDensityPreset || "custom").slice(0, 24),
        blueAiTanks: this.normalizeRoomNumber(room.blueAiTanks, ROOM_SETTING_LIMITS.blueAiTanks),
        blueInfantry: this.normalizeRoomNumber(room.blueInfantry, ROOM_SETTING_LIMITS.blueInfantry),
        redTanks: this.normalizeRoomNumber(room.redTanks, ROOM_SETTING_LIMITS.redTanks),
        redInfantry: this.normalizeRoomNumber(room.redInfantry, ROOM_SETTING_LIMITS.redInfantry)
      };
    }

    normalizeModeration(value) {
      if (!Array.isArray(value)) return [];
      return value.slice(-80).map((item) => ({
        id: String(item?.id || `mod:${Date.now()}`),
        roomId: String(item?.roomId || ""),
        type: item?.type === "kick" ? "kick" : "warning",
        playerId: String(item?.playerId || ""),
        playerName: String(item?.playerName || "Player").slice(0, 24),
        reason: String(item?.reason || "").slice(0, 80),
        createdAt: Number(item?.createdAt) || Date.now()
      })).filter((item) => item.playerId);
    }

    normalizeAdmins(value) {
      if (!Array.isArray(value)) return [];
      return value.slice(0, 8).map((item) => ({
        id: String(item?.id || "admin-local").slice(0, 36),
        name: String(item?.name || "\uad00\ub9ac\uc790").slice(0, 24),
        participantType: "admin",
        updatedAt: Number(item?.updatedAt) || Date.now()
      })).filter((item) => item.id);
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

    normalizeCommand(input = {}) {
      if (!input || typeof input !== "object") return null;
      const commandType = String(input.commandType || input.type || "move").slice(0, 32);
      const commandId = String(input.commandId || input.id || `${input.roomId || "local"}:cmd:${Date.now()}`).slice(0, 80);
      const targetPosition = input.targetPosition || input.targetPoint || null;
      const targetSquadIds = Array.isArray(input.targetSquadIds)
        ? input.targetSquadIds.map((id) => String(id || "").slice(0, 48)).filter(Boolean).slice(0, 8)
        : input.targetSquadId
          ? [String(input.targetSquadId).slice(0, 48)]
          : [];
      const targetVehicleIds = Array.isArray(input.targetVehicleIds)
        ? input.targetVehicleIds.map((id) => String(id || "").slice(0, 48)).filter(Boolean).slice(0, 8)
        : input.targetAssetId || input.targetVehicleId
          ? [String(input.targetAssetId || input.targetVehicleId).slice(0, 48)]
          : [];
      const issuedAt = Number(input.issuedAt) || Date.now();
      return {
        id: commandId,
        commandId,
        roomId: String(input.roomId || "").slice(0, 48),
        playerId: String(input.playerId || input.issuerPlayerId || "").slice(0, 48),
        issuerPlayerId: String(input.issuerPlayerId || input.playerId || "").slice(0, 48),
        commanderSlotId: String(input.commanderSlotId || input.slotId || "").slice(0, 32),
        slotId: String(input.slotId || input.commanderSlotId || "").slice(0, 32),
        role: String(input.role || "").slice(0, 24),
        controllerType: String(input.controllerType || "").slice(0, 16),
        commandType,
        type: commandType,
        team: input.team === "red" ? "red" : "blue",
        targetSquadId: String(input.targetSquadId || targetSquadIds[0] || "").slice(0, 48),
        targetAssetId: String(input.targetAssetId || targetVehicleIds[0] || "").slice(0, 48),
        targetSquadIds,
        targetVehicleIds,
        targetPosition: targetPosition ? { x: roundCoord(targetPosition.x), y: roundCoord(targetPosition.y) } : null,
        targetPoint: targetPosition ? { x: roundCoord(targetPosition.x), y: roundCoord(targetPosition.y) } : null,
        objectiveName: String(input.objectiveName || "").slice(0, 32),
        commandState: String(input.commandState || this.commandStateForType(commandType)).slice(0, 24),
        issuedAt,
        lockUntil: Number(input.lockUntil) || 0,
        reason: String(input.reason || commandType).slice(0, 48),
        createdAt: Number(input.createdAt) || issuedAt
      };
    }

    commandStateForType(type = "") {
      if (type === "cancel") return "cancel";
      if (type === "defend" || type === "rally") return "hold";
      if (type === "assault" || type === "attack") return "assault";
      if (type === "repair") return "repair";
      if (type === "scan") return "scout";
      if (type === "fire_support") return "cover";
      if (type === "retreat") return "fallback";
      return "advance";
    }

    normalizeCommands(input) {
      if (!Array.isArray(input)) return [];
      return input.map((item) => this.normalizeCommand(item)).filter(Boolean).slice(-120);
    }

    mergeCommandRecords(existing = [], incoming = [], limit = 120) {
      const byId = new Map();
      for (const command of [...existing, ...incoming]) {
        const normalized = this.normalizeCommand(command);
        if (!normalized) continue;
        const previous = byId.get(normalized.commandId);
        if (!previous || Number(normalized.issuedAt) >= Number(previous.issuedAt)) byId.set(normalized.commandId, normalized);
      }
      return Array.from(byId.values())
        .sort((a, b) => Number(a.issuedAt) - Number(b.issuedAt))
        .slice(-limit);
    }
  }

  IronLine.RoomRegistry = RoomRegistry;
  IronLine.roomRegistry = IronLine.roomRegistry || new RoomRegistry();
})(window);
