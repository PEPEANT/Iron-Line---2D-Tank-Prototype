"use strict";

const { createAdminSnapshot } = require("./admin-state");
const { createCommandPacket } = require("./schemas");

function attachOnlineSocketServer({ server, registry, path = "/ws" }) {
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
    const client = { clientId, roomId: "local", playerId: "", nickname: "" };
    clients.set(clientId, { ws, client });

    ws.on("message", (raw) => {
      const message = parseMessage(raw);
      if (!message) return send(ws, "error", { reason: "invalid_json" });
      handleClientMessage({ ws, registry, clients, client, message });
    });

    ws.on("close", () => {
      clients.delete(clientId);
      registry.leaveClient(clientId);
      broadcastRoom(clients, client.roomId, "admin_snapshot", createAdminSnapshot(registry, { roomId: client.roomId }));
    });

    send(ws, "hello", { clientId, protocol: 1 });
  });

  return { enabled: true, wss };
}

function handleClientMessage({ ws, registry, clients, client, message }) {
  if (message.type === "join") {
    client.roomId = message.roomId || "local";
    client.playerId = message.playerId || client.playerId || client.clientId;
    client.nickname = message.nickname || client.playerId;
    client.participantType = message.participantType || message.typeHint || "";
    const room = registry.joinRoom(client.roomId, client);
    const participant = room.participants?.get(client.playerId);
    client.participantType = participant?.participantType || client.participantType || "player";
    client.team = registry.participantTeam?.(room, participant) || "";
    send(ws, "join_result", {
      ok: true,
      roomId: client.roomId,
      playerId: client.playerId,
      participantType: client.participantType
    });
    send(ws, "observer_snapshot", registry.snapshot(client.roomId));
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
    registry.pushCommand(client.roomId, packet);
    return send(ws, "command_ack", { ok: true, packet });
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

  if (message.type === "admin_snapshot") {
    return send(ws, "admin_snapshot", createAdminSnapshot(registry, { roomId: client.roomId }));
  }

  return send(ws, "error", { reason: "unknown_message" });
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

function broadcastRoom(clients, roomId, type, payload) {
  for (const { ws, client } of clients.values()) {
    if (client.roomId === roomId) send(ws, type, payload);
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
