"use strict";

function createStaticRoomSlotHelpers(roomSlotIds = [], maxRoomHumans = 8) {
  function normalizeSlotId(slotId = "") {
    const text = String(slotId || "");
    return text.endsWith("-scout") ? text.replace("-scout", "-recon") : text;
  }

  function slotTeam(slotId = "") {
    if (String(slotId).startsWith("red-")) return "red";
    if (String(slotId).startsWith("blue-")) return "blue";
    return "";
  }

  function balancedSlotTeams(occupied = new Set()) {
    const counts = { blue: 0, red: 0 };
    for (const slotId of occupied) {
      const team = slotTeam(slotId);
      if (team) counts[team] += 1;
    }
    return counts.blue <= counts.red ? ["blue", "red"] : ["red", "blue"];
  }

  function resolvedRoomSlotIds(room = null) {
    const explicit = Array.isArray(room?.slots)
      ? room.slots.map((slot) => normalizeSlotId(slot?.id)).filter(Boolean)
      : [];
    return explicit.length ? explicit : roomSlotIds.slice();
  }

  function lockedSlotIds(room = null) {
    const locked = new Set();
    for (const slot of room?.slots || []) {
      const slotId = normalizeSlotId(slot?.id);
      if (slot?.locked && slotId) locked.add(slotId);
    }
    return locked;
  }

  function normalizeRoomSlotLocks(input = {}) {
    const fromSlotLocks = Array.isArray(input.slotLocks) ? input.slotLocks : [];
    const fromSlots = Array.isArray(input.roleSlots)
      ? input.roleSlots.filter((slot) => slot?.locked).map((slot) => slot?.id)
      : Array.isArray(input.slots)
        ? input.slots.filter((slot) => slot?.locked).map((slot) => slot?.id)
        : [];
    return Array.from(new Set([...fromSlotLocks, ...fromSlots].map((slotId) => normalizeSlotId(slotId)).filter((slotId) => roomSlotIds.includes(slotId))));
  }

  function applyRoomSlotLocks(room, input = {}) {
    if (!room?.slots) return;
    const locked = new Set(normalizeRoomSlotLocks(input));
    for (const slot of room.slots) {
      slot.locked = locked.has(normalizeSlotId(slot.id));
    }
  }

  function resolveParticipantSlot(participant, occupied = new Set(), room = null, capacity = maxRoomHumans) {
    const slots = resolvedRoomSlotIds(room);
    const locked = lockedSlotIds(room);
    const effectiveCapacity = Math.max(0, Math.min(
      slots.filter((slotId) => !locked.has(slotId) || occupied.has(slotId)).length,
      capacity
    ));
    if (occupied.size >= effectiveCapacity) return "";
    const validSlots = new Set(slots);
    const requested = normalizeSlotId(participant.slotId);
    if (requested && validSlots.has(requested) && !occupied.has(requested) && !locked.has(requested)) return requested;
    for (const team of balancedSlotTeams(occupied)) {
      const slot = slots.find((slotId) => slotTeam(slotId) === team && !occupied.has(slotId) && !locked.has(slotId));
      if (slot) return slot;
    }
    return slots.find((slotId) => !occupied.has(slotId) && !locked.has(slotId)) || "";
  }

  function enforceUniquePlayerSlots(room) {
    if (!room?.players) return;
    const occupied = new Set();
    const overflow = [];
    for (const participant of room.players.values()) {
      const slotId = resolveParticipantSlot(participant, occupied, room, room.config?.maxHumans || maxRoomHumans);
      if (!slotId) {
        participant.participantType = "spectator";
        participant.slotId = "";
        participant.team = "";
        participant.ready = false;
        overflow.push(participant);
        continue;
      }
      occupied.add(slotId);
      participant.slotId = slotId;
      participant.team = slotTeam(slotId);
    }
    for (const participant of overflow) {
      room.players.delete(participant.playerId);
      room.spectators.set(participant.playerId, participant);
      room.participants.set(participant.playerId, participant);
    }
  }

  return {
    applyRoomSlotLocks,
    enforceUniquePlayerSlots,
    normalizeSlotId,
    normalizeRoomSlotLocks,
    resolveParticipantSlot,
    slotTeam
  };
}

module.exports = {
  createStaticRoomSlotHelpers
};
