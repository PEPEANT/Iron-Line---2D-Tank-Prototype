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

  function resolveParticipantSlot(participant, occupied = new Set(), capacity = maxRoomHumans) {
    if (occupied.size >= Math.max(1, Math.min(roomSlotIds.length, capacity))) return "";
    const slots = roomSlotIds.slice();
    const validSlots = new Set(slots);
    const requested = normalizeSlotId(participant.slotId);
    if (requested && validSlots.has(requested) && !occupied.has(requested)) return requested;
    for (const team of balancedSlotTeams(occupied)) {
      const slot = slots.find((slotId) => slotTeam(slotId) === team && !occupied.has(slotId));
      if (slot) return slot;
    }
    return slots.find((slotId) => !occupied.has(slotId)) || "";
  }

  function enforceUniquePlayerSlots(room) {
    if (!room?.players) return;
    const occupied = new Set();
    const overflow = [];
    for (const participant of room.players.values()) {
      const slotId = resolveParticipantSlot(participant, occupied, room.config?.maxHumans || maxRoomHumans);
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
    enforceUniquePlayerSlots,
    slotTeam
  };
}

module.exports = {
  createStaticRoomSlotHelpers
};
