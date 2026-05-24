"use strict";

const { createAdminSnapshot } = require("./admin-state");
const { createCommandPacket } = require("./schemas");

function attachOnlineSocketServer({ server, registry, path = "/ws", combatOnly = false }) {
  let WebSocketServer = null;
  try {
    ({ WebSocketServer } = require("ws"));
  } catch (_error) {
    server.on("upgrade", (req, socket) => {
      if (!req.url?.startsWith(path)) return;
      socket.write("HTTP/1.1 501 Not Implemented\r\nConnection: close\r\n\r\nWebSocket package is not installed.\r\n");
      socket.destroy();
    });
    return { enabled: false, reason: "missing_ws_package" };
  }

  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map();

  server.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith(path)) return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws, req) => {
    const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const client = { clientId, roomId: "local", playerId: "", nickname: "", lastPlayerStateAt: 0 };
    clients.set(clientId, { ws, client });

    ws.on("message", (raw) => {
      const message = parseMessage(raw);
      if (!message) return send(ws, "error", { reason: "invalid_json" });
      handleClientMessage({ ws, registry, clients, client, message, combatOnly });
    });

    ws.on("close", () => {
      clients.delete(clientId);
      registry.leaveClient(clientId);
      if (!combatOnly) {
        broadcastRoom(clients, client.roomId, "admin_snapshot", createAdminSnapshot(registry, { roomId: client.roomId }));
      }
    });

    send(ws, "hello", { clientId, protocol: 1 });
  });

  return { enabled: true, wss };
}

function handleClientMessage({ ws, registry, clients, client, message, combatOnly = false }) {
  if (message.type === "join") {
    client.roomId = message.roomId || "local";
    client.playerId = message.playerId || client.playerId || client.clientId;
    client.nickname = message.nickname || client.playerId;
    client.participantType = message.participantType || message.typeHint || "";
    if (combatOnly && isNonPlayerParticipant(client.participantType)) {
      return send(ws, "join_result", {
        ok: false,
        roomId: client.roomId,
        playerId: client.playerId,
        participantType: client.participantType,
        reason: "combat_only"
      });
    }
    const room = registry.joinRoom(client.roomId, client);
    const participant = room.participants?.get(client.playerId);
    client.participantType = participant?.participantType || client.participantType || "player";
    if (combatOnly && isNonPlayerParticipant(client.participantType)) {
      registry.leaveClient(client.clientId);
      return send(ws, "join_result", {
        ok: false,
        roomId: client.roomId,
        playerId: client.playerId,
        participantType: client.participantType,
        reason: "combat_only"
      });
    }
    client.team = registry.participantTeam?.(room, participant) || "";
    send(ws, "join_result", {
      ok: true,
      roomId: client.roomId,
      playerId: client.playerId,
      participantType: client.participantType
    });
    if (!combatOnly) send(ws, "observer_snapshot", registry.snapshot(client.roomId));
    return;
  }

  if (message.type === "assign_slot") {
    return send(ws, "slot_result", registry.assignSlot(client.roomId, client.playerId, message.slotId));
  }

  if (message.type === "ready") {
    return send(ws, "ready_result", registry.setReady(client.roomId, client.playerId, message.ready));
  }

  if (message.type === "command") {
    if (client.participantType && client.participantType !== "player") {
      return send(ws, "command_ack", { ok: false, reason: "spectator" });
    }
    const packet = createCommandPacket({
      ...message.packet,
      roomId: client.roomId,
      issuerPlayerId: client.playerId
    });
    const result = registry.pushCommand(client.roomId, packet);
    if (!result?.ok) return send(ws, "command_ack", { ok: false, reason: result?.reason || "command_rejected" });
    send(ws, "command_ack", { ok: true, packet: result.packet });
    broadcastRoom(clients, client.roomId, "command_broadcast", { packet: result.packet });
    return;
  }

  if (message.type === "chat") {
    const chat = registry.pushChat(client.roomId, {
      senderId: client.playerId,
      channel: message.channel,
      text: message.text,
      participantType: client.participantType || "player"
    });
    if (!chat) return send(ws, "chat_ack", { ok: false, reason: "empty" });
    broadcastRoomChat(clients, registry, client.roomId, chat);
    return send(ws, "chat_ack", { ok: true, id: chat.id });
  }

  if (message.type === "player_state") {
    if (!client.playerId) return send(ws, "error", { reason: "not_joined" });
    if (client.participantType && client.participantType !== "player") return send(ws, "error", { reason: "not_player" });
    const packet = normalizePlayerStatePacket(client, message);
    if (!packet) return send(ws, "error", { reason: "invalid_player_state" });
    applyAuthoritativePlayerIdentity(registry, client, packet);
    const now = Date.now();
    if (now - (client.lastPlayerStateAt || 0) < 35) return;
    client.lastPlayerStateAt = now;
    broadcastPlayerClientsExcept(clients, client.roomId, client.clientId, "player_state", packet);
    return;
  }

  if (message.type === "admin_snapshot") {
    if (combatOnly) return send(ws, "error", { reason: "combat_only_admin_snapshot_disabled" });
    return send(ws, "admin_snapshot", createAdminSnapshot(registry, { roomId: client.roomId }));
  }

  return send(ws, "error", { reason: "unknown_message" });
}

function isNonPlayerParticipant(participantType = "") {
  return ["spectator", "caster", "admin"].includes(String(participantType || ""));
}

function applyAuthoritativePlayerIdentity(registry, client, packet) {
  const room = registry?.rooms?.get?.(client.roomId) || null;
  const participant = room?.participants?.get?.(client.playerId) || room?.players?.get?.(client.playerId) || null;
  const team = registry?.participantTeam?.(room, participant) || participant?.team || packet.team || "";
  const slotId = participant?.slotId || packet.slotId || "";
  if (team === "red" || team === "blue") {
    packet.team = team;
    client.team = team;
  }
  if (slotId) {
    packet.slotId = String(slotId).slice(0, 32);
    client.slotId = packet.slotId;
  }
}

function parseMessage(raw) {
  try {
    return JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw));
  } catch (_error) {
    return null;
  }
}

function send(ws, type, payload = {}) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify({ type, payload }));
}

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampNumber(value, min, max, fallback = min) {
  const numeric = finiteNumber(value, fallback);
  return Math.max(min, Math.min(max, numeric));
}

function normalizePlayerStatePacket(client, message = {}) {
  const source = message.state || message.position || {};
  const x = Number(source.x);
  const y = Number(source.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const now = Date.now();
  const state = {
    x: Math.round(x),
    y: Math.round(y),
    stateSeq: Math.max(0, Math.floor(Number(source.stateSeq || message.stateSeq) || 0)),
    stateUpdatedAt: Math.max(0, Math.floor(Number(source.stateUpdatedAt || source.updatedAt || message.sentAt) || now)),
    updatedAt: Math.max(0, Math.floor(Number(source.updatedAt || message.sentAt) || now)),
    alive: source.alive !== false,
    deathState: String(source.deathState || (source.alive === false ? "dead" : "alive")).slice(0, 16),
    hp: clampNumber(source.hp, 0, 999, 100),
    maxHp: clampNumber(source.maxHp, 1, 999, 100),
    weaponId: String(source.weaponId || "").slice(0, 32),
    movementState: String(source.movementState || "").slice(0, 24),
    inVehicle: Boolean(source.inVehicle),
    vehicleId: String(source.vehicleId || "").slice(0, 36),
    vehicleType: String(source.vehicleType || "").slice(0, 18),
    vehicleHp: clampNumber(source.vehicleHp, 0, 999, 0),
    vehicleMaxHp: clampNumber(source.vehicleMaxHp, 0, 999, 0),
    angle: finiteNumber(source.angle, 0),
    turretAngle: finiteNumber(source.turretAngle, 0),
    machineGunAngle: finiteNumber(source.machineGunAngle, 0),
    aimX: Number.isFinite(Number(source.aimX)) ? Math.round(Number(source.aimX)) : null,
    aimY: Number.isFinite(Number(source.aimY)) ? Math.round(Number(source.aimY)) : null,
    droneId: String(source.droneId || "").slice(0, 36),
    droneType: String(source.droneType || "").slice(0, 18),
    droneX: Number.isFinite(Number(source.droneX)) ? Math.round(Number(source.droneX)) : null,
    droneY: Number.isFinite(Number(source.droneY)) ? Math.round(Number(source.droneY)) : null,
    droneAngle: finiteNumber(source.droneAngle, 0),
    droneControlled: Boolean(source.droneControlled)
  };
  return {
    roomId: client.roomId,
    playerId: client.playerId,
    name: String(message.name || client.nickname || client.playerId).slice(0, 24),
    team: message.team === "red" || client.team === "red" ? "red" : "blue",
    slotId: String(message.slotId || "").slice(0, 32),
    classId: String(message.classId || message.currentClassId || "").slice(0, 32),
    currentClassId: String(message.currentClassId || message.classId || "").slice(0, 32),
    weaponId: String(message.weaponId || state.weaponId || "").slice(0, 32),
    factionId: String(message.factionId || message.skinId || "").slice(0, 32),
    skinId: String(message.skinId || message.factionId || "").slice(0, 32),
    state,
    sentAt: Math.max(0, Math.floor(Number(message.sentAt) || 0)),
    serverAt: now
  };
}

function broadcastRoom(clients, roomId, type, payload) {
  for (const { ws, client } of clients.values()) {
    if (client.roomId === roomId) send(ws, type, payload);
  }
}

function broadcastPlayerClientsExcept(clients, roomId, excludedClientId, type, payload) {
  for (const { ws, client } of clients.values()) {
    if (client.clientId !== excludedClientId && client.roomId === roomId && client.participantType === "player") send(ws, type, payload);
  }
}

function broadcastRoomChat(clients, registry, roomId, message) {
  const room = registry.getOrCreateRoom(roomId);
  for (const { ws, client } of clients.values()) {
    if (!registry.canReceiveChat?.(room, client, message)) continue;
    send(ws, "chat", message);
  }
}

module.exports = { attachOnlineSocketServer };
