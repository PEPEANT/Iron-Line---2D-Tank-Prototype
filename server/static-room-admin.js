"use strict";

function connectedRoomPlayers(room) {
  const activeClientPlayerIds = new Set(
    Array.from(room?.clients?.values?.() || [])
      .map((client) => String(client?.playerId || ""))
      .filter(Boolean)
  );
  return Array.from(room?.players?.values?.() || [])
    .filter((participant) => participant &&
      (participant.participantType || "player") === "player" &&
      participant.connected !== false &&
      activeClientPlayerIds.has(String(participant.playerId || participant.id || "")));
}

function resolveRoomHostId(room) {
  const players = connectedRoomPlayers(room);
  if (!players.length) return "";
  const slotOrder = new Map((room?.slots || []).map((slot, index) => [slot.id, index]));
  players.sort((a, b) => (
    (slotOrder.get(a.slotId) ?? 999) - (slotOrder.get(b.slotId) ?? 999) ||
    String(a.playerId || a.id || "").localeCompare(String(b.playerId || b.id || ""))
  ));
  return players[0]?.playerId || players[0]?.id || "";
}

function reconcileRoomAuthority(room) {
  if (!room) return room;
  room.hostId = resolveRoomHostId(room);
  if (room.worldState) {
    const currentHostId = String(room.worldState.hostId || "");
    const currentHostPresent = Array.from(room.players?.values?.() || [])
      .some((player) => String(player?.playerId || player?.id || "") === currentHostId);
    if (!currentHostId || !currentHostPresent) {
      room.worldState = {
        ...room.worldState,
        hostId: room.hostId || ""
      };
    }
  }
  return room;
}

function createRoomDeleteTombstones(ttlMs = 120000) {
  const deleted = new Map();
  const cleanup = (now = Date.now()) => {
    for (const [roomId, deletedAt] of deleted.entries()) {
      if (now - deletedAt > ttlMs) deleted.delete(roomId);
    }
  };
  return {
    cleanup,
    mark(roomId = "") {
      const id = String(roomId || "");
      if (!id) return;
      cleanup();
      deleted.set(id, Date.now());
    },
    has(roomId = "") {
      const id = String(roomId || "");
      if (!id) return false;
      cleanup();
      return deleted.has(id);
    }
  };
}

function removeParticipantFromRoom(room, playerId = "") {
  const id = String(playerId || "");
  if (!room || !id) return false;
  let changed = false;
  for (const [clientId, client] of room.clients?.entries?.() || []) {
    if (client?.playerId !== id) continue;
    room.clients.delete(clientId);
    changed = true;
  }
  for (const map of [room.players, room.spectators, room.participants, room.admins]) {
    if (map?.delete?.(id)) changed = true;
  }
  for (const slot of room.slots || []) {
    if (slot.playerId !== id) continue;
    slot.playerId = null;
    slot.nickname = "";
    slot.ready = false;
    slot.aiControlled = true;
    changed = true;
  }
  if (changed) {
    reconcileRoomAuthority(room);
    room.updatedAt = new Date().toISOString();
  }
  return changed;
}

function serverRoomParticipantCount(room) {
  return (room?.players?.size || 0) +
    (room?.spectators?.size || 0) +
    (room?.admins?.size || 0) +
    (room?.clients?.size || 0);
}

function serverRoomIdleAge(room, toClientTimestamp, now = Date.now()) {
  const updatedAt = toClientTimestamp(room?.updatedAt || 0);
  const createdAt = toClientTimestamp(room?.config?.createdAt || room?.createdAt || 0);
  return Math.max(0, now - Math.max(updatedAt, createdAt, 0));
}

function shouldDeleteEmptyServerRoom(room, toClientTimestamp, now = Date.now()) {
  if (serverRoomParticipantCount(room) > 0) return false;
  const age = serverRoomIdleAge(room, toClientTimestamp, now);
  if (room?.phase === "ended") return age >= 5000;
  if (room?.phase === "lobby" || room?.phase === "waiting") return age >= 8000;
  return age >= 45000;
}

function cleanupStaleServerParticipants(onlineRegistry, toClientTimestamp, maxAgeMs = 45000, options = {}) {
  if (!onlineRegistry) return false;
  const now = Date.now();
  let changed = false;
  for (const [roomId, room] of onlineRegistry.rooms?.entries?.() || []) {
    const ids = [
      ...Array.from(room.players?.values?.() || []),
      ...Array.from(room.spectators?.values?.() || []),
      ...Array.from(room.admins?.values?.() || [])
    ]
      .filter((participant) => now - toClientTimestamp(participant.updatedAt || participant.lastSeenAt || 0) > maxAgeMs)
      .map((participant) => participant.playerId || participant.id)
      .filter(Boolean);
    for (const id of ids) {
      if (removeParticipantFromRoom(room, id)) changed = true;
    }
    if (shouldDeleteEmptyServerRoom(room, toClientTimestamp, now)) {
      onlineRegistry.rooms.delete(roomId);
      options.onRoomDeleted?.(roomId);
      changed = true;
    }
  }
  return changed;
}

function updateRoomSlotsFromPlayers(room) {
  if (!room?.slots) return;
  for (const slot of room.slots) {
    const player = Array.from(room.players?.values?.() || []).find((item) => item.slotId === slot.id);
    slot.playerId = player?.playerId || null;
    slot.nickname = player?.nickname || "";
    slot.ready = Boolean(player?.ready);
    slot.aiControlled = !player;
  }
}

function upsertParticipantToServer(onlineRegistry, roomId = "", input = {}, deps = {}) {
  if (!onlineRegistry || !roomId || deps.isRoomDeletedRecently?.(roomId)) return null;
  const room = onlineRegistry.rooms.get(roomId);
  if (!room) return null;
  const requestedType = ["admin", "spectator", "caster"].includes(input.participantType) ? input.participantType : "player";
  const roomFull = requestedType === "player" &&
    !room.players?.has?.(input.playerId || input.id || "") &&
    (room.players?.size || 0) >= (room.config?.maxHumans || 8);
  const type = roomFull ? "spectator" : requestedType;
  const participant = deps.normalizeParticipant?.(input, type);
  if (!participant) return null;
  deps.importParticipants?.(room, [participant], type);
  deps.enforceUniquePlayerSlots?.(room);
  updateRoomSlotsFromPlayers(room);
  reconcileRoomAuthority(room);
  room.updatedAt = new Date().toISOString();
  return room;
}

module.exports = {
  cleanupStaleServerParticipants,
  createRoomDeleteTombstones,
  removeParticipantFromRoom,
  reconcileRoomAuthority,
  updateRoomSlotsFromPlayers,
  upsertParticipantToServer
};
