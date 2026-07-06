"use strict";

(function registerRoomLifecyclePolicy(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const EMPTY_WAITING_ROOM_GRACE_MS = 8000;
  const EMPTY_ENDED_ROOM_GRACE_MS = 5000;
  const EMPTY_ACTIVE_ROOM_GRACE_MS = 45000;

  function participantCount(room = {}) {
    return (room.players || []).length + (room.spectators || []).length + (room.admins || []).length;
  }

  function ageSinceActivity(registry, room = {}, now = Date.now()) {
    const updatedAt = registry.roomUpdatedAt?.(room) || 0;
    const createdAt = Number(room.createdAt) || updatedAt || now;
    return Math.max(0, now - Math.max(updatedAt, createdAt));
  }

  function isVisibleRoom(registry, room = null, now = Date.now()) {
    if (!room?.id || room.phase === "ended") return false;
    if (participantCount(room) > 0) return true;
    return ageSinceActivity(registry, room, now) < EMPTY_WAITING_ROOM_GRACE_MS;
  }

  function listVisibleRooms(registry) {
    const now = Date.now();
    return (registry.listRooms?.() || []).filter((room) => isVisibleRoom(registry, room, now));
  }

  function cleanupStaleParticipants(registry, maxAgeMs = 45000) {
    const now = Date.now();
    let changed = false;
    const deletedRoomIds = [];
    const rooms = [];
    for (const room of registry.listRooms?.() || []) {
      const players = (room.players || []).filter((player) => now - (Number(player.updatedAt) || 0) <= maxAgeMs);
      const spectators = (room.spectators || []).filter((player) => now - (Number(player.updatedAt) || 0) <= maxAgeMs);
      const admins = (room.admins || []).filter((admin) => now - (Number(admin.updatedAt) || 0) <= maxAgeMs);
      const activeCount = players.length + spectators.length + admins.length;
      const emptyAge = ageSinceActivity(registry, room, now);
      const expired = activeCount === 0 && (
        (room.phase === "ended" && emptyAge >= EMPTY_ENDED_ROOM_GRACE_MS) ||
        (room.phase === "waiting" && emptyAge >= EMPTY_WAITING_ROOM_GRACE_MS) ||
        (room.phase === "loading" && emptyAge >= EMPTY_ACTIVE_ROOM_GRACE_MS) ||
        (room.phase === "playing" && emptyAge >= EMPTY_ACTIVE_ROOM_GRACE_MS)
      );
      if (expired) {
        changed = true;
        deletedRoomIds.push(room.id);
        continue;
      }
      if (players.length === (room.players || []).length &&
        spectators.length === (room.spectators || []).length &&
        admins.length === (room.admins || []).length) {
        rooms.push(room);
        continue;
      }
      changed = true;
      rooms.push({
        ...room,
        players,
        spectators,
        admins,
        updatedAt: now,
        events: registry.nextEvents?.(room, {
          type: "stale_participants_removed",
          severity: "warning",
          title: "응답 없는 참가자 정리",
          detail: `${room.name || room.id} 방의 응답 없는 참가자를 정리했습니다.`
        }) || room.events
      });
    }
    if (changed) registry.saveRooms?.(rooms);
    for (const roomId of deletedRoomIds) registry.deleteRemoteRoom?.(roomId);
    return changed;
  }

  function moveParticipantToTeam(registry, roomId, playerId, team = "blue") {
    const room = registry.getRoom?.(roomId);
    if (!room || !playerId) return null;
    const targetTeam = team === "red" ? "red" : "blue";
    const players = (room.players || []).slice();
    const index = players.findIndex((player) => player.id === playerId);
    if (index < 0) return null;
    const target = players[index];
    if ((target.participantType || "player") !== "player") return null;
    if (target.team === targetTeam && String(target.slotId || "").startsWith(`${targetTeam}-`)) return room;
    const role = registry.normalizeSlotId?.(target.slotId || "").split("-")[1] || target.roleId || "infantry";
    const preferredSlot = `${targetTeam}-${role}`;
    const slotIds = IronLine.roomSlotIds || ["blue-infantry", "blue-engineer", "blue-recon", "blue-armor", "red-infantry", "red-engineer", "red-recon", "red-armor"];
    const occupied = new Set(players.filter((player) => player.id !== playerId).map((player) => registry.normalizeSlotId?.(player.slotId) || player.slotId));
    const locked = new Set(IronLine.normalizeRoomSlotLocks?.(room) || []);
    const teamSlots = slotIds.filter((slotId) => registry.slotTeam?.(slotId) === targetTeam);
    const slotId = (teamSlots.includes(preferredSlot) && !occupied.has(preferredSlot) && !locked.has(preferredSlot))
      ? preferredSlot
      : teamSlots.find((candidate) => !occupied.has(candidate) && !locked.has(candidate));
    if (!slotId) return null;
    players[index] = {
      ...target,
      team: targetTeam,
      slotId,
      roleId: slotId.split("-")[1] || target.roleId || "infantry",
      ready: false,
      updatedAt: Date.now()
    };
    return registry.updateRoom?.(roomId, {
      players,
      events: registry.nextEvents?.(room, {
        type: "participant_team_moved",
        severity: "info",
        title: "팀 이동",
        detail: `${target.name || "Player"}을 ${targetTeam === "red" ? "홍팀" : "청팀"}으로 이동했습니다.`
      }) || room.events
    }) || null;
  }

  IronLine.RoomLifecyclePolicy = {
    participantCount,
    ageSinceActivity,
    isVisibleRoom,
    listVisibleRooms,
    cleanupStaleParticipants,
    moveParticipantToTeam
  };
})(window);
