"use strict";

async function handleWorldStatePost(req, res, options = {}) {
  const {
    onlineRegistry,
    readJsonBody,
    roomDeleteTombstones,
    roomId,
    roomRecordTime,
    schedulePersist,
    sendJson,
    toClientTimestamp
  } = options;
  if (roomDeleteTombstones.has(roomId)) {
    sendJson(res, 410, { ok: false, reason: "room_deleted_recently", roomId });
    return true;
  }
  const body = await readJsonBody(req);
  if (!body) {
    sendJson(res, 400, { ok: false, reason: "invalid_json" });
    return true;
  }
  const room = onlineRegistry.rooms.get(roomId);
  if (!room) {
    sendJson(res, 404, { ok: false, reason: "room_not_found", roomId });
    return true;
  }
  const incoming = body.worldState && typeof body.worldState === "object" ? body.worldState : body;
  if (!incoming || typeof incoming !== "object") {
    sendJson(res, 400, { ok: false, reason: "invalid_world_state", roomId });
    return true;
  }
  const worldState = { ...incoming, roomId, updatedAt: toClientTimestamp(incoming.updatedAt || Date.now()) };
  const incomingTime = roomRecordTime(worldState);
  const currentTime = roomRecordTime(room.worldState || {});
  if (!room.worldState || incomingTime >= currentTime) {
    room.worldState = worldState;
    room.updatedAt = new Date(worldState.updatedAt).toISOString();
  }
  schedulePersist();
  sendJson(res, 200, { ok: true, roomId, worldStateUpdatedAt: toClientTimestamp(room.worldState?.updatedAt || Date.now()), updatedAt: toClientTimestamp(room.updatedAt || Date.now()) });
  return true;
}

module.exports = { handleWorldStatePost };
