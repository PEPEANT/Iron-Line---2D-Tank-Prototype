"use strict";

const TEAMS = Object.freeze({
  BLUE: "blue",
  RED: "red"
});

const ROLES = Object.freeze(["infantry", "engineer", "scout", "armor"]);
const PARTICIPANT_TYPES = Object.freeze(["player", "spectator", "caster", "admin"]);
const CHAT_CHANNELS = Object.freeze(["all", "team", "spectator", "caster", "system"]);

function createRoomConfig(input = {}) {
  const mode = input.mode === "conquest" ? "conquest" : "annihilation";
  return {
    roomId: input.roomId || "local",
    name: input.name || input.roomId || "Iron Line Room",
    mode,
    maxHumans: Number.isFinite(input.maxHumans) ? input.maxHumans : 8,
    maxSpectators: Number.isFinite(input.maxSpectators) ? input.maxSpectators : 24,
    teamSize: Number.isFinite(input.teamSize) ? input.teamSize : 4,
    allowMidMatchJoin: Boolean(input.allowMidMatchJoin),
    joinLocked: Boolean(input.joinLocked),
    spectatorChatVisibleToPlayers: input.spectatorChatVisibleToPlayers !== false,
    timeLimitSec: mode === "conquest" ? Number(input.timeLimitSec || 35 * 60) : 0,
    createdAt: input.createdAt || new Date().toISOString()
  };
}

function createDefaultSlots() {
  const labels = {
    infantry: "보병",
    engineer: "공병",
    scout: "정찰",
    armor: "기갑"
  };
  const slots = [];
  for (const team of [TEAMS.BLUE, TEAMS.RED]) {
    for (const role of ROLES) {
      slots.push(createPlayerSlot({
        id: `${team}-${role}`,
        team,
        role,
        label: labels[role]
      }));
    }
  }
  return slots;
}

function createPlayerSlot(input = {}) {
  return {
    id: input.id || `${input.team || TEAMS.BLUE}-${input.role || "infantry"}`,
    team: input.team === TEAMS.RED ? TEAMS.RED : TEAMS.BLUE,
    role: ROLES.includes(input.role) ? input.role : "infantry",
    label: input.label || input.role || "slot",
    playerId: input.playerId || null,
    nickname: input.nickname || "",
    ready: Boolean(input.ready),
    aiControlled: input.aiControlled !== undefined ? Boolean(input.aiControlled) : !input.playerId,
    squadIds: Array.isArray(input.squadIds) ? [...input.squadIds] : [],
    vehicleIds: Array.isArray(input.vehicleIds) ? [...input.vehicleIds] : []
  };
}

function normalizeParticipantType(value = "player") {
  return PARTICIPANT_TYPES.includes(value) ? value : "player";
}

function createParticipant(input = {}) {
  const participantType = normalizeParticipantType(input.participantType || input.type);
  return {
    id: input.id || input.playerId || input.clientId || "",
    clientId: input.clientId || "",
    playerId: input.playerId || input.id || "",
    nickname: String(input.nickname || input.name || input.playerId || "Player").slice(0, 24),
    participantType,
    team: input.team === TEAMS.RED ? TEAMS.RED : input.team === TEAMS.BLUE ? TEAMS.BLUE : "",
    slotId: input.slotId || "",
    connected: input.connected !== false,
    joinedAt: input.joinedAt || new Date().toISOString(),
    lastSeenAt: input.lastSeenAt || new Date().toISOString()
  };
}

function createChatMessage(input = {}) {
  const channel = CHAT_CHANNELS.includes(input.channel) ? input.channel : "all";
  return {
    id: input.id || `chat:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    roomId: input.roomId || "local",
    channel,
    senderId: input.senderId || input.playerId || "",
    sender: String(input.sender || input.nickname || "Player").slice(0, 24),
    participantType: normalizeParticipantType(input.participantType || "player"),
    team: input.team === TEAMS.RED ? TEAMS.RED : input.team === TEAMS.BLUE ? TEAMS.BLUE : "",
    text: String(input.text || "").replace(/\s+/g, " ").trim().slice(0, 160),
    createdAt: input.createdAt || new Date().toISOString()
  };
}

function createSessionEvent(input = {}) {
  return {
    id: input.id || `event:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    roomId: input.roomId || "local",
    type: input.type || "room_event",
    severity: input.severity || "info",
    title: String(input.title || "방 이벤트").slice(0, 48),
    detail: String(input.detail || "").slice(0, 160),
    actorId: input.actorId || input.playerId || "",
    createdAt: input.createdAt || new Date().toISOString()
  };
}

function createCommandPacket(input = {}) {
  return {
    id: input.id || `${input.roomId || "local"}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    roomId: input.roomId || "local",
    tick: Number.isFinite(input.tick) ? input.tick : 0,
    issuerPlayerId: input.issuerPlayerId || "",
    team: input.team === TEAMS.RED ? TEAMS.RED : TEAMS.BLUE,
    slotId: input.slotId || "",
    role: ROLES.includes(input.role) ? input.role : "infantry",
    type: input.type || "move",
    targetSquadIds: Array.isArray(input.targetSquadIds) ? [...input.targetSquadIds] : [],
    targetVehicleIds: Array.isArray(input.targetVehicleIds) ? [...input.targetVehicleIds] : [],
    targetPoint: input.targetPoint ? { x: Number(input.targetPoint.x) || 0, y: Number(input.targetPoint.y) || 0 } : null,
    objectiveName: input.objectiveName || "",
    createdAt: input.createdAt || new Date().toISOString()
  };
}

function createObserverSnapshot(input = {}) {
  return {
    roomId: input.roomId || "local",
    phase: input.phase || "lobby",
    mode: input.mode || "annihilation",
    serverTime: input.serverTime || new Date().toISOString(),
    players: Array.isArray(input.players) ? input.players : [],
    spectators: Array.isArray(input.spectators) ? input.spectators : [],
    participants: Array.isArray(input.participants) ? input.participants : [],
    slots: Array.isArray(input.slots) ? input.slots : [],
    commands: Array.isArray(input.commands) ? input.commands : [],
    chat: Array.isArray(input.chat) ? input.chat : [],
    events: Array.isArray(input.events) ? input.events : [],
    aiSummary: input.aiSummary || {}
  };
}

module.exports = {
  TEAMS,
  ROLES,
  PARTICIPANT_TYPES,
  CHAT_CHANNELS,
  createRoomConfig,
  createDefaultSlots,
  createPlayerSlot,
  createParticipant,
  createChatMessage,
  createSessionEvent,
  normalizeParticipantType,
  createCommandPacket,
  createObserverSnapshot
};
