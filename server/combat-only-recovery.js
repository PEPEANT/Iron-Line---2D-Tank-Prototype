"use strict";

const OBSERVER_TYPES = new Set(["spectator", "caster", "admin"]);

function enabled(env = process.env) {
  return env.IRONLINE_P0_COMBAT_ONLY !== "0";
}

function isObserverParticipantType(value = "") {
  return OBSERVER_TYPES.has(String(value || ""));
}

function filterPlayerParticipants(participants = []) {
  return Array.isArray(participants)
    ? participants.filter((item) => !isObserverParticipantType(item?.participantType || item?.type))
    : [];
}

function clearObserverParticipants(room = null) {
  if (!room) return;
  if (!room.spectators) room.spectators = new Map();
  if (!room.admins) room.admins = new Map();
  if (!room.participants) room.participants = new Map();
  room.spectators.clear();
  room.admins.clear();
  for (const [participantId, participant] of Array.from(room.participants.entries())) {
    if (isObserverParticipantType(participant?.participantType)) room.participants.delete(participantId);
  }
}

function isActiveMatchRoom(room = null) {
  return room?.phase === "playing";
}

function isObserverOnlyRoomPatch(body = {}) {
  const playerCount = filterPlayerParticipants(body.players).length;
  const combatCount = Array.isArray(body.combatEvents) ? body.combatEvents.length : 0;
  const hasWorldState = Boolean(body.worldState && typeof body.worldState === "object");
  const hasObserverFields = Array.isArray(body.spectators) ||
    Array.isArray(body.admins) ||
    Array.isArray(body.moderation) ||
    Array.isArray(body.commandAuthorities) ||
    Array.isArray(body.commandAuthorityRequests) ||
    body.spectatorChatVisibleToPlayers !== undefined;
  return hasObserverFields && playerCount === 0 && combatCount === 0 && !hasWorldState;
}

module.exports = {
  clearObserverParticipants,
  enabled,
  filterPlayerParticipants,
  isActiveMatchRoom,
  isObserverOnlyRoomPatch,
  isObserverParticipantType
};
