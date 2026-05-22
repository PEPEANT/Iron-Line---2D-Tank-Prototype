"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const requestedPort = Number.parseInt(process.env.PORT || process.argv[2] || "4173", 10);
const port = Number.isFinite(requestedPort) ? requestedPort : 4173;
const host = process.env.HOST || "0.0.0.0";
const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
const dataDir = process.env.IRONLINE_DATA_DIR
  ? path.resolve(process.env.IRONLINE_DATA_DIR)
  : path.join(root, ".data");
const roomsStorePath = process.env.IRONLINE_ROOMS_FILE
  ? path.resolve(process.env.IRONLINE_ROOMS_FILE)
  : path.join(dataDir, "online-rooms.json");
const serverStartedAt = new Date().toISOString();

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

let onlineRegistry = null;
const DEFAULT_SPECTATOR_CAPACITY = 12;
const MAX_SPECTATOR_CAPACITY = 12;
const MAX_ROOM_HUMANS = 8;
const ROOM_SLOT_IDS = Object.freeze([
  "blue-infantry",
  "blue-engineer",
  "blue-recon",
  "blue-armor",
  "red-infantry",
  "red-engineer",
  "red-recon",
  "red-armor"
]);

function clampInt(value, min, max, fallback) {
  const numeric = Math.round(Number(value));
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return Math.max(min, Math.min(max, safe));
}

function normalizeDifficulty(value) {
  return ["easy", "normal", "hard"].includes(value) ? value : "normal";
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), "application/json; charset=utf-8");
}

function readGit(args = []) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1500
    }).trim();
  } catch (_error) {
    return "";
  }
}

function buildInfoPayload() {
  const commitFull = process.env.RENDER_GIT_COMMIT ||
    process.env.GIT_COMMIT ||
    process.env.COMMIT_SHA ||
    readGit(["rev-parse", "HEAD"]);
  const branch = process.env.RENDER_GIT_BRANCH ||
    process.env.GIT_BRANCH ||
    readGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  return {
    ok: true,
    service: "iron-line",
    source: "api/build",
    buildId: process.env.RENDER_GIT_COMMIT ? "render" : "local",
    commit: commitFull ? commitFull.slice(0, 12) : "",
    commitFull,
    branch,
    startedAt: serverStartedAt,
    nodeVersion: process.version,
    renderService: process.env.RENDER_SERVICE_NAME || "",
    renderInstance: process.env.RENDER_INSTANCE_ID || ""
  };
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (_error) {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

function toClientTimestamp(value) {
  if (Number.isFinite(value)) return value;
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function serverPhaseToClient(phase) {
  if (phase === "lobby") return "waiting";
  return ["waiting", "loading", "playing", "ended"].includes(phase) ? phase : "waiting";
}

function clientPhaseToServer(phase) {
  if (phase === "waiting" || phase === "loading") return "lobby";
  return ["playing", "ended"].includes(phase) ? phase : "lobby";
}

function normalizeParticipant(input = {}, fallbackType = "player") {
  const participantType = ["player", "spectator", "caster", "admin"].includes(input.participantType)
    ? input.participantType
    : fallbackType;
  const id = String(input.playerId || input.id || input.clientId || "").slice(0, 48);
  if (!id) return null;
  return {
    ...input,
    id,
    playerId: id,
    nickname: String(input.nickname || input.name || id || "Player").slice(0, 24),
    name: String(input.name || input.nickname || id || "Player").slice(0, 24),
    participantType,
    team: input.team === "red" ? "red" : input.team === "blue" ? "blue" : "",
    slotId: String(input.slotId || ""),
    ready: Boolean(input.ready),
    connected: input.connected !== false,
    joinedAt: input.joinedAt || new Date().toISOString(),
    lastSeenAt: input.lastSeenAt || new Date().toISOString(),
    updatedAt: toClientTimestamp(input.updatedAt || input.lastSeenAt || Date.now())
  };
}

function participantStateSeq(participant = {}) {
  return Number(participant.position?.stateSeq ?? participant.stateSeq ?? 0) || 0;
}

function isStaleParticipantUpdate(previous = {}, incoming = {}) {
  const previousSeq = participantStateSeq(previous);
  const incomingSeq = participantStateSeq(incoming);
  if (previousSeq > 0 && incomingSeq > 0 && incomingSeq < previousSeq) return true;
  const previousTime = toClientTimestamp(previous.updatedAt || previous.lastSeenAt || previous.position?.updatedAt || 0);
  const incomingTime = toClientTimestamp(incoming.updatedAt || incoming.lastSeenAt || incoming.position?.updatedAt || 0);
  if (incomingSeq > 0 && previousSeq > 0 && incomingSeq === previousSeq && incomingTime <= previousTime) return true;
  return previousTime > incomingTime;
}

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

function resolveParticipantSlot(participant, occupied = new Set(), capacity = MAX_ROOM_HUMANS) {
  const slots = ROOM_SLOT_IDS.slice(0, Math.max(1, Math.min(MAX_ROOM_HUMANS, Math.round(Number(capacity) || MAX_ROOM_HUMANS))));
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
  for (const participant of room.players.values()) {
    const slotId = resolveParticipantSlot(participant, occupied, room.config?.maxHumans || MAX_ROOM_HUMANS);
    if (!slotId) continue;
    occupied.add(slotId);
    participant.slotId = slotId;
    participant.team = slotTeam(slotId);
  }
}

function exportParticipant(input = {}, fallbackType = "player") {
  const participant = normalizeParticipant(input, fallbackType);
  if (!participant) return null;
  return {
    id: participant.playerId,
    name: participant.name || participant.nickname || participant.playerId,
    nickname: participant.nickname || participant.name || participant.playerId,
    team: participant.team,
    slotId: participant.slotId,
    roleId: participant.roleId || "",
    classId: participant.classId || "",
    currentClassId: participant.currentClassId || participant.classId || "",
    combatRoleId: participant.combatRoleId || "",
    weaponId: participant.weaponId || "",
    weaponInventory: Array.isArray(participant.weaponInventory) ? participant.weaponInventory.slice(0, 4) : [],
    equipmentAmmo: participant.equipmentAmmo && typeof participant.equipmentAmmo === "object" ? participant.equipmentAmmo : {},
    stats: participant.stats && typeof participant.stats === "object" ? participant.stats : { kills: 0, deaths: 0 },
    position: participant.position || null,
    x: Number.isFinite(participant.x) ? participant.x : null,
    y: Number.isFinite(participant.y) ? participant.y : null,
    hp: Number.isFinite(Number(participant.hp ?? participant.position?.hp)) ? Number(participant.hp ?? participant.position?.hp) : null,
    maxHp: Number.isFinite(Number(participant.maxHp ?? participant.position?.maxHp)) ? Number(participant.maxHp ?? participant.position?.maxHp) : null,
    stateSeq: participantStateSeq(participant),
    deathState: String(participant.deathState || participant.position?.deathState || "").slice(0, 16),
    alive: participant.alive !== false && participant.position?.alive !== false,
    inVehicle: Boolean(participant.inVehicle),
    vehicleId: String(participant.vehicleId || participant.position?.vehicleId || "").slice(0, 36),
    vehicleType: String(participant.vehicleType || participant.position?.vehicleType || "").slice(0, 18),
    aimX: Number.isFinite(participant.aimX) ? participant.aimX : participant.position?.aimX ?? null,
    aimY: Number.isFinite(participant.aimY) ? participant.aimY : participant.position?.aimY ?? null,
    droneId: String(participant.droneId || participant.position?.droneId || "").slice(0, 36),
    droneType: String(participant.droneType || participant.position?.droneType || "").slice(0, 18),
    droneControlled: Boolean(participant.droneControlled || participant.position?.droneControlled),
    participantType: participant.participantType,
    factionId: participant.factionId || participant.skinId || "",
    skinId: participant.skinId || participant.factionId || "",
    ready: Boolean(participant.ready),
    host: Boolean(participant.host),
    updatedAt: toClientTimestamp(participant.updatedAt || participant.lastSeenAt || Date.now())
  };
}

function exportClientRoom(room) {
  const config = room?.config || {};
  const players = Array.from(room?.players?.values?.() || [])
    .map((item) => exportParticipant(item, "player"))
    .filter(Boolean);
  const spectators = Array.from(room?.spectators?.values?.() || [])
    .map((item) => exportParticipant(item, "spectator"))
    .filter(Boolean);
  const admins = Array.from(room?.admins?.values?.() || [])
    .map((item) => exportParticipant(item, "admin"))
    .filter(Boolean);
  return {
    id: config.roomId || "local",
    name: String(config.name || config.roomId || "Iron Line Room").slice(0, 32),
    mode: config.mode === "conquest" ? "conquest" : "annihilation",
    blueFactionId: config.blueFactionId || "singularity",
    redFactionId: config.redFactionId || "military-gallery",
    phase: serverPhaseToClient(room?.phase),
    locked: Boolean(config.joinLocked || room?.phase === "playing" || room?.phase === "ended"),
    aiFillEmptySlots: config.aiFillEmptySlots !== false,
    createdBy: config.createdBy || "admin",
    startedBy: config.startedBy || "",
    players,
    capacity: clampInt(config.maxHumans, 1, MAX_ROOM_HUMANS, 8),
    spectators,
    spectatorCapacity: Math.max(0, Math.min(MAX_SPECTATOR_CAPACITY, Math.round(Number(config.maxSpectators) || DEFAULT_SPECTATOR_CAPACITY))),
    difficulty: normalizeDifficulty(config.difficulty),
    aiDensityPreset: String(config.aiDensityPreset || "custom").slice(0, 24),
    blueAiTanks: clampInt(config.blueAiTanks, 0, 8, 3),
    blueInfantry: clampInt(config.blueInfantry, 4, 56, 21),
    redTanks: clampInt(config.redTanks, 1, 10, 5),
    redInfantry: clampInt(config.redInfantry, 4, 64, 24),
    admins,
    spectatorChatVisibleToPlayers: config.spectatorChatVisibleToPlayers !== false,
    moderation: Array.isArray(room?.moderation) ? room.moderation.slice(-80) : [],
    commandAuthorities: Array.isArray(room?.commandAuthorities) ? room.commandAuthorities.slice(-16) : [],
    commandAuthorityRequests: Array.isArray(room?.commandAuthorityRequests) ? room.commandAuthorityRequests.slice(-16) : [],
    chat: Array.isArray(room?.chat) ? room.chat.slice(-120) : [],
    events: Array.isArray(room?.events) ? room.events.slice(-80) : [],
    commands: Array.isArray(room?.commands) ? room.commands.slice(-120) : [],
    combatEvents: Array.isArray(room?.combatEvents) ? room.combatEvents.slice(-140) : [],
    combatServerSeq: Math.max(0, Math.floor(Number(room?.combatServerSeq) || 0)),
    worldState: room?.worldState || null,
    createdAt: toClientTimestamp(config.createdAt),
    updatedAt: toClientTimestamp(room?.updatedAt),
    startedAt: toClientTimestamp(config.startedAt || 0) || 0,
    endedAt: toClientTimestamp(config.endedAt || 0) || 0
  };
}

function importParticipants(room, participants = [], fallbackType = "player", options = {}) {
  const targetMap = fallbackType === "admin"
    ? (room.admins || (room.admins = new Map()))
    : fallbackType === "player"
      ? room.players
      : room.spectators;
  if (options.replace) targetMap.clear();
  const source = fallbackType === "spectator"
    ? participants.slice(0, Math.max(0, Math.round(Number(room.config?.maxSpectators) || DEFAULT_SPECTATOR_CAPACITY)))
    : participants;
  for (const participant of source) {
    const normalized = normalizeParticipant(participant, fallbackType);
    if (!normalized) continue;
    const previous = room.players?.get?.(normalized.playerId) ||
      room.spectators?.get?.(normalized.playerId) ||
      room.admins?.get?.(normalized.playerId) ||
      room.participants?.get?.(normalized.playerId) ||
      null;
    if (previous && isStaleParticipantUpdate(previous, normalized)) {
      continue;
    }
    if (fallbackType === "player") room.spectators.delete(normalized.playerId);
    if (fallbackType === "spectator") room.players.delete(normalized.playerId);
    targetMap.set(normalized.playerId, normalized);
    if (fallbackType !== "admin") room.participants.set(normalized.playerId, normalized);
  }
}

function removeParticipantFromRoom(room, playerId = "") {
  const id = String(playerId || "");
  if (!room || !id) return false;
  let changed = false;
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
  if (changed) room.updatedAt = new Date().toISOString();
  return changed;
}

function cleanupStaleServerParticipants(maxAgeMs = 45000) {
  if (!onlineRegistry) return false;
  const now = Date.now();
  let changed = false;
  for (const room of onlineRegistry.rooms?.values?.() || []) {
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
  }
  return changed;
}

function roomRecordTime(record = {}) {
  const numeric = Number(record.createdAt || record.updatedAt || 0);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(record.createdAt || record.updatedAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeRoomRecords(existing = [], incoming = [], limit = 120) {
  const records = new Map();
  let fallbackIndex = 0;
  for (const item of [...(existing || []), ...(incoming || [])]) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id || `${roomRecordTime(item)}:${item.senderId || item.playerId || item.type || "record"}:${fallbackIndex++}`);
    const key = item.deathId
      ? `death:${item.deathId}`
      : item.respawnId
        ? `respawn:${item.respawnId}`
        : item.hitId
          ? `hit:${item.hitId}`
          : item.shotId
            ? `shot:${item.shotId}`
            : id;
    const next = { ...item, id };
    const previous = records.get(key);
    if (!previous) {
      records.set(key, next);
      continue;
    }
    if (roomRecordTime(next) >= roomRecordTime(previous)) records.set(key, { ...previous, ...next });
  }
  return Array.from(records.values())
    .sort((a, b) => roomRecordTime(a) - roomRecordTime(b))
    .slice(-limit);
}

function hasRoomEvent(body = {}, type = "") {
  return Array.isArray(body.events) && body.events.some((event) => event?.type === type);
}

function resolveRoomPhase(currentPhase = "lobby", body = {}) {
  const nextPhase = clientPhaseToServer(body.phase);
  const resetRequested = hasRoomEvent(body, "room_reset");
  const endRequested = nextPhase === "ended" || hasRoomEvent(body, "room_ended") || Boolean(body.endedAt);
  const startRequested = nextPhase === "playing" || hasRoomEvent(body, "room_started") || Boolean(body.startedAt);
  if (resetRequested) return "lobby";
  if (endRequested) return "ended";
  if (currentPhase === "ended") return "ended";
  if (currentPhase === "playing") return "playing";
  return startRequested ? "playing" : "lobby";
}

function applyClientRoomToServer(body = {}) {
  if (!onlineRegistry) return null;
  const roomId = String(body.id || body.roomId || "").trim().slice(0, 48);
  if (!roomId) return null;
  let room = onlineRegistry.rooms?.get(roomId) || null;
  if (!room) {
    room = onlineRegistry.createRoom({
      roomId,
      name: body.name,
      mode: body.mode,
      maxHumans: Number(body.capacity) || 8,
      maxSpectators: Number(body.spectatorCapacity) || DEFAULT_SPECTATOR_CAPACITY,
      difficulty: body.difficulty,
      aiDensityPreset: body.aiDensityPreset,
      blueAiTanks: body.blueAiTanks,
      blueInfantry: body.blueInfantry,
      redTanks: body.redTanks,
      redInfantry: body.redInfantry,
      spectatorChatVisibleToPlayers: body.spectatorChatVisibleToPlayers !== false
    });
  }

  room.config.name = String(body.name || room.config.name || roomId).slice(0, 32);
  room.config.mode = body.mode === "conquest" ? "conquest" : "annihilation";
  room.config.maxHumans = clampInt(body.capacity, 1, MAX_ROOM_HUMANS, room.config.maxHumans || 8);
  room.config.maxSpectators = Math.max(0, Math.min(MAX_SPECTATOR_CAPACITY, Math.round(Number(body.spectatorCapacity) || room.config.maxSpectators || DEFAULT_SPECTATOR_CAPACITY)));
  room.config.blueFactionId = body.blueFactionId || room.config.blueFactionId || "singularity";
  room.config.redFactionId = body.redFactionId || room.config.redFactionId || "military-gallery";
  room.config.difficulty = normalizeDifficulty(body.difficulty || room.config.difficulty);
  room.config.aiDensityPreset = String(body.aiDensityPreset || room.config.aiDensityPreset || "custom").slice(0, 24);
  room.config.blueAiTanks = clampInt(body.blueAiTanks, 0, 8, room.config.blueAiTanks ?? 3);
  room.config.blueInfantry = clampInt(body.blueInfantry, 4, 56, room.config.blueInfantry ?? 21);
  room.config.redTanks = clampInt(body.redTanks, 1, 10, room.config.redTanks ?? 5);
  room.config.redInfantry = clampInt(body.redInfantry, 4, 64, room.config.redInfantry ?? 24);
  room.config.aiFillEmptySlots = body.aiFillEmptySlots !== false;
  room.config.spectatorChatVisibleToPlayers = body.spectatorChatVisibleToPlayers !== false;
  const resetRequested = hasRoomEvent(body, "room_reset");
  const resolvedPhase = resolveRoomPhase(room.phase, body);
  room.config.joinLocked = Boolean(body.locked || resolvedPhase === "playing" || resolvedPhase === "ended");
  room.config.createdBy = body.createdBy || room.config.createdBy || "admin";
  room.config.startedBy = body.startedBy || room.config.startedBy || "";
  room.config.startedAt = body.startedAt || room.config.startedAt || 0;
  room.config.endedAt = resolvedPhase === "ended" ? (body.endedAt || room.config.endedAt || Date.now()) : 0;
  if (resolvedPhase === "lobby") {
    room.config.startedBy = "";
    room.config.startedAt = 0;
  }
  room.phase = resolvedPhase;

  if (resetRequested) {
    room.players.clear();
    room.spectators.clear();
    room.admins.clear();
    room.participants.clear();
  }
  importParticipants(room, Array.isArray(body.players) ? body.players : [], "player");
  importParticipants(room, Array.isArray(body.spectators) ? body.spectators : [], "spectator");
  importParticipants(room, Array.isArray(body.admins) ? body.admins : [], "admin");
  enforceUniquePlayerSlots(room);

  for (const slot of room.slots || []) {
    const player = Array.from(room.players.values()).find((item) => item.slotId === slot.id);
    slot.playerId = player?.playerId || null;
    slot.nickname = player?.nickname || "";
    slot.ready = Boolean(player?.ready);
    slot.aiControlled = !player;
  }

  room.chat = Array.isArray(body.chat) ? mergeRoomRecords(room.chat, body.chat, 120) : room.chat;
  room.events = Array.isArray(body.events) ? mergeRoomRecords(room.events, body.events, 80) : room.events;
  room.combatEvents = Array.isArray(body.combatEvents) ? mergeRoomRecords(room.combatEvents, body.combatEvents, 140) : (room.combatEvents || []);
  room.combatServerSeq = Math.max(Math.floor(Number(room.combatServerSeq) || 0), Math.floor(Number(body.combatServerSeq) || 0));
  if (body.worldState && typeof body.worldState === "object") {
    const incomingTime = roomRecordTime(body.worldState);
    const currentTime = roomRecordTime(room.worldState || {});
    if (!room.worldState || incomingTime >= currentTime) room.worldState = body.worldState;
  } else {
    room.worldState = room.worldState || null;
  }
  room.moderation = Array.isArray(body.moderation) ? body.moderation.slice(-80) : [];
  room.commandAuthorities = Array.isArray(body.commandAuthorities) ? body.commandAuthorities.slice(-16) : [];
  room.commandAuthorityRequests = Array.isArray(body.commandAuthorityRequests) ? body.commandAuthorityRequests.slice(-16) : [];
  room.updatedAt = new Date(Number(body.updatedAt) || Date.now()).toISOString();
  return room;
}

function persistRooms() {
  if (!onlineRegistry) return false;
  try {
    fs.mkdirSync(path.dirname(roomsStorePath), { recursive: true });
    const rooms = Array.from(onlineRegistry.rooms.values()).map((room) => exportClientRoom(room));
    const tempPath = `${roomsStorePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify({ version: 1, rooms }, null, 2), "utf8");
    fs.renameSync(tempPath, roomsStorePath);
    return true;
  } catch (error) {
    console.warn(`Room persistence failed: ${error?.message || error}`);
    return false;
  }
}

function loadPersistedRooms() {
  if (!onlineRegistry) return 0;
  try {
    if (!fs.existsSync(roomsStorePath)) return 0;
    const payload = JSON.parse(fs.readFileSync(roomsStorePath, "utf8"));
    const rooms = Array.isArray(payload?.rooms) ? payload.rooms : Array.isArray(payload) ? payload : [];
    let count = 0;
    for (const room of rooms) {
      if (applyClientRoomToServer(room)) count += 1;
    }
    return count;
  } catch (error) {
    console.warn(`Room persistence load failed: ${error?.message || error}`);
    return 0;
  }
}

async function handleRoomsApi(req, res) {
  if (!onlineRegistry) {
    sendJson(res, 503, { ok: false, reason: "online_registry_unavailable", rooms: [] });
    return;
  }

  const url = new URL(req.url || "/", `http://${host}:${port}`);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const roomId = pathParts[1] === "rooms" ? decodeURIComponent(pathParts[2] || "") : "";
  const participantId = pathParts[3] === "participants" ? decodeURIComponent(pathParts[4] || "") : "";
  const commandEndpoint = pathParts[3] === "commands";
  const combatEndpoint = pathParts[3] === "combat";

  if (req.method === "GET" && url.pathname === "/api/rooms") {
    if (cleanupStaleServerParticipants()) persistRooms();
    sendJson(res, 200, {
      ok: true,
      rooms: Array.from(onlineRegistry.rooms.values()).map((room) => exportClientRoom(room))
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/rooms") {
    const body = await readJsonBody(req);
    if (!body) {
      sendJson(res, 400, { ok: false, reason: "invalid_json" });
      return;
    }
    const room = applyClientRoomToServer(body);
    if (!room) {
      sendJson(res, 400, { ok: false, reason: "room_id_required" });
      return;
    }
    persistRooms();
    sendJson(res, 200, { ok: true, room: exportClientRoom(room) });
    return;
  }

  if (req.method === "POST" && roomId && commandEndpoint) {
    const body = await readJsonBody(req);
    if (!body) return sendJson(res, 400, { ok: false, reason: "invalid_json" });
    const result = onlineRegistry.pushCommand(roomId, body);
    if (!result?.ok) return sendJson(res, 403, { ok: false, reason: result?.reason || "command_rejected" });
    persistRooms();
    const room = onlineRegistry.rooms.get(roomId);
    return sendJson(res, 200, { ok: true, packet: result.packet, room: exportClientRoom(room) });
  }

  if (req.method === "POST" && roomId && combatEndpoint) {
    const body = await readJsonBody(req);
    if (!body) return sendJson(res, 400, { ok: false, reason: "invalid_json" });
    const result = onlineRegistry.pushCombatRequest(roomId, body);
    if (!result?.ok) return sendJson(res, 403, { ok: false, reason: result?.reason || "combat_rejected" });
    persistRooms();
    const room = onlineRegistry.rooms.get(roomId);
    return sendJson(res, 200, { ok: true, events: result.events || [], room: exportClientRoom(room) });
  }

  if (req.method === "DELETE" && roomId && participantId) {
    const room = onlineRegistry.rooms.get(roomId);
    const removed = removeParticipantFromRoom(room, participantId);
    if (removed) persistRooms();
    sendJson(res, 200, { ok: true, roomId, participantId, removed });
    return;
  }

  if (req.method === "DELETE" && roomId) {
    onlineRegistry.rooms.delete(roomId);
    persistRooms();
    sendJson(res, 200, { ok: true, roomId });
    return;
  }

  sendJson(res, 404, { ok: false, reason: "not_found" });
}

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(root, relativePath);
  const insideRoot = filePath === root || filePath.startsWith(root + path.sep);
  return insideRoot ? filePath : null;
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 204, "");
    return;
  }

  if ((req.url || "/") === "/health") {
    send(res, 200, JSON.stringify({ ok: true, service: "iron-line" }), "application/json; charset=utf-8");
    return;
  }

  if ((req.url || "/").startsWith("/api/build")) {
    sendJson(res, 200, buildInfoPayload());
    return;
  }

  if ((req.url || "/").startsWith("/api/rooms")) {
    handleRoomsApi(req, res).catch((error) => {
      sendJson(res, 500, { ok: false, reason: error?.message || "rooms_api_failed" });
    });
    return;
  }

  const filePath = resolveRequestPath(req.url || "/");
  if (!filePath) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      send(res, 404, "Not found");
      return;
    }

    const type = mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      "cache-control": "no-store"
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

let onlineSocket = null;
try {
  const { RoomRegistry } = require("../server/room-registry");
  const { attachOnlineSocketServer } = require("../server/websocket");
  onlineRegistry = new RoomRegistry();
  const persistedCount = loadPersistedRooms();
  if (persistedCount > 0) console.log(`Loaded ${persistedCount} persisted online room(s).`);
  onlineSocket = attachOnlineSocketServer({ server, registry: onlineRegistry });
} catch (error) {
  onlineSocket = { enabled: false, reason: error?.message || "online_socket_setup_failed" };
}

server.listen(port, host, () => {
  console.log(`Iron Line server: http://${displayHost}:${port}/index.html`);
  console.log(`Map editor: http://${displayHost}:${port}/editor.html`);
  if (onlineSocket?.enabled) console.log(`Online socket: ws://${displayHost}:${port}/ws`);
  else console.log(`Online socket disabled: ${onlineSocket?.reason || "not available"}`);
});
