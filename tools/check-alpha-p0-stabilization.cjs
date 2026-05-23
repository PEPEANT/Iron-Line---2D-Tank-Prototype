"use strict";

const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4307);
const base = `http://127.0.0.1:${port}`;
const roomId = `P0-${Date.now()}`;

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  return { response, payload };
}

async function waitForServer(timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const { response } = await requestJson("/api/build");
      if (response.ok) return;
    } catch (_error) {}
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error("static server did not become ready");
}

async function run() {
  const child = spawn(process.execPath, ["tools/static-server.cjs", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      IRONLINE_ROOMS_FILE: path.join(root, ".data", `alpha-p0-${process.pid}.json`)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer();
    const room = {
      id: roomId,
      name: "P0 Stabilization",
      mode: "conquest",
      phase: "waiting",
      capacity: 8,
      players: [],
      spectators: [],
      admins: [],
      events: [],
      commands: [],
      combatEvents: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    let result = await requestJson("/api/rooms", { method: "POST", body: room });
    if (!result.response.ok || result.payload.room?.id !== roomId) throw new Error("room create failed");

    result = await requestJson(`/api/rooms/${encodeURIComponent(roomId)}/participants`, {
      method: "POST",
      body: {
        id: "blue-alpha",
        playerId: "blue-alpha",
        name: "Blue Alpha",
        participantType: "player",
        slotId: "blue-infantry",
        team: "blue",
        position: { x: 1200, y: 1400, hp: 87, maxHp: 100, stateSeq: 4, updatedAt: Date.now() },
        updatedAt: Date.now()
      }
    });
    if (!result.response.ok) throw new Error(`participant update failed: ${JSON.stringify(result.payload)}`);
    result = await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`);
    const updatedRoom = result.payload.room || null;
    const player = updatedRoom?.players?.find((item) => item.id === "blue-alpha");
    if (!player || player.hp !== 87 || player.stateSeq !== 4) throw new Error("participant state was not preserved");

    result = await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" });
    if (!result.response.ok) throw new Error("room delete failed");

    result = await requestJson("/api/rooms");
    if ((result.payload.rooms || []).some((item) => item.id === roomId)) throw new Error("deleted room remained in room list");

    result = await requestJson("/api/rooms", { method: "POST", body: { ...room, updatedAt: Date.now() + 1 } });
    if (result.response.status !== 409 || result.payload.reason !== "room_deleted_recently") {
      throw new Error(`stale room recreate was not blocked: ${result.response.status} ${JSON.stringify(result.payload)}`);
    }

    result = await requestJson(`/api/rooms/${encodeURIComponent(roomId)}/combat`, {
      method: "POST",
      body: { type: "player_shot", shotId: `${roomId}:shot`, playerId: "blue-alpha" }
    });
    if (result.response.status !== 410 || result.payload.reason !== "room_deleted_recently") {
      throw new Error(`deleted room combat write was not blocked: ${result.response.status} ${JSON.stringify(result.payload)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      roomId,
      participantEndpoint: "pass",
      deleteTombstone: "pass",
      staleRecreateBlocked: "pass",
      deletedCombatBlocked: "pass"
    }, null, 2));
  } finally {
    child.kill();
  }
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
