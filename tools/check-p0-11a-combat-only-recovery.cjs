"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.IRONLINE_P0_11A_PORT || 4411);
const baseUrl = `http://127.0.0.1:${port}`;
const roomId = `P011A-${Date.now()}`;
const roomsFile = path.join(root, ".data", `p0-11a-${process.pid}.json`);

function requestJson(pathname, options = {}) {
  const body = options.body ? JSON.stringify(options.body) : "";
  return new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}${pathname}`, {
      method: options.method || "GET",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
      timeout: options.timeout || 5000
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let payload = {};
        try { payload = raw ? JSON.parse(raw) : {}; } catch (error) { return reject(error); }
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`${options.method || "GET"} ${pathname} ${res.statusCode}: ${raw}`));
        resolve(payload);
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`${pathname} timed out`)));
    if (body) req.write(body);
    req.end();
  });
}

async function expectReject(label, promise, reason) {
  try {
    await promise;
  } catch (error) {
    if (!String(error.message || "").includes(reason)) throw error;
    return true;
  }
  throw new Error(`${label} was not rejected with ${reason}.`);
}

async function waitForServer() {
  for (let i = 0; i < 45; i += 1) {
    try {
      const build = await requestJson("/api/build", { timeout: 1000 });
      if (build?.ok) return build;
    } catch (_error) {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("P0-11A server did not start.");
}

function player(id, team, slotId, x) {
  const now = Date.now();
  return {
    id, playerId: id, name: team, team, slotId, participantType: "player", ready: true, updatedAt: now,
    position: { x, y: 1400, stateSeq: 1, alive: true, hp: 100, maxHp: 100, updatedAt: now }
  };
}

async function seedRoom() {
  const now = Date.now();
  await requestJson("/api/rooms", {
    method: "POST",
    body: {
      id: roomId, name: "P0-11A combat-only", mode: "annihilation", phase: "playing", locked: true, capacity: 8,
      players: [player("p0-blue", "blue", "blue-infantry", 1200), player("p0-red", "red", "red-infantry", 1600)],
      spectators: [], admins: [], chat: [], events: [{ id: `${roomId}:start`, type: "room_started", createdAt: now }],
      commands: [], combatEvents: [],
      worldState: { roomId, hostId: "p0-blue", tick: 1, updatedAt: now, vehicles: [], units: [], capturePoints: [] },
      updatedAt: now
    }
  });
}

function wsProbe({ participantType = "player", requestAdminSnapshot = false } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const events = [];
    const timer = setTimeout(() => {
      ws.close();
      resolve({ events, timedOut: true });
    }, 800);
    const finish = (payload = {}) => {
      clearTimeout(timer);
      ws.close();
      resolve({ events, ...payload });
    };
    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      events.push(message.type);
      if (message.type === "hello") {
        ws.send(JSON.stringify({ type: "join", roomId, playerId: `ws-${participantType}`, nickname: participantType, participantType }));
      }
      if (message.type === "join_result") {
        if (requestAdminSnapshot) ws.send(JSON.stringify({ type: "admin_snapshot" }));
        else setTimeout(() => finish({ payload: message.payload }), 180);
      }
      if (message.type === "observer_snapshot" || message.type === "admin_snapshot") {
        reject(new Error(`${message.type} should not be sent in combat-only recovery mode.`));
      }
      if (message.type === "error") finish({ payload: message.payload });
    });
    ws.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function run() {
  const build = await waitForServer();
  await seedRoom();
  await expectReject("spectator participant", requestJson(`/api/rooms/${roomId}/participants`, {
    method: "POST",
    body: { id: "spec-1", playerId: "spec-1", participantType: "spectator", updatedAt: Date.now() }
  }), "combat_only_participant_disabled");
  await expectReject("active room observer patch", requestJson("/api/rooms", {
    method: "POST",
    body: { id: roomId, spectators: [{ id: "spec-2", participantType: "spectator" }], admins: [{ id: "admin-1", participantType: "admin" }], updatedAt: Date.now() }
  }), "combat_only_active_room_controls_locked");
  const participantAck = await requestJson(`/api/rooms/${roomId}/participants`, { method: "POST", body: player("p0-blue", "blue", "blue-infantry", 1210) });
  const combatAck = await requestJson(`/api/rooms/${roomId}/combat`, {
    method: "POST",
    body: { id: `${roomId}:shot`, type: "small_arms", shooterId: "p0-blue", targetPlayerId: "p0-red", hit: true, damage: 1, createdAt: Date.now() }
  });
  const worldAck = await requestJson(`/api/rooms/${roomId}/world-state`, {
    method: "POST",
    body: { worldState: { roomId, hostId: "p0-blue", tick: 2, updatedAt: Date.now(), vehicles: [], units: [], capturePoints: [] } }
  });
  const room = (await requestJson(`/api/rooms/${roomId}`)).room || {};
  if ((room.spectators || []).length || (room.admins || []).length || room.spectatorCapacity !== 0) throw new Error("observer/admin state leaked into combat-only room detail.");
  const playerWs = await wsProbe({ participantType: "player", requestAdminSnapshot: true });
  const specWs = await wsProbe({ participantType: "spectator" });
  if (playerWs.events.includes("observer_snapshot") || playerWs.events.includes("admin_snapshot")) throw new Error("player WS received observer/admin snapshot.");
  if (specWs.payload?.reason !== "combat_only") throw new Error(`spectator WS was not blocked: ${JSON.stringify(specWs)}`);
  console.log(JSON.stringify({
    ok: true,
    roomId,
    build: build.commit,
    combatOnlyRecovery: build.p0CombatOnlyRecovery,
    observerSnapshots: "disabled",
    adminSnapshots: "disabled",
    spectatorWs: "blocked",
    playerStateCombatWorldState: {
      participantAck: Boolean(participantAck.ok),
      combatAck: Boolean(combatAck.ok),
      worldAck: Boolean(worldAck.ok)
    },
    roomDetail: { players: room.players?.length || 0, spectators: room.spectators?.length || 0, admins: room.admins?.length || 0, spectatorCapacity: room.spectatorCapacity }
  }, null, 2));
}

const server = spawn(process.execPath, ["tools/static-server.cjs", String(port)], {
  cwd: root,
  env: { ...process.env, IRONLINE_P0_COMBAT_ONLY: "1", IRONLINE_ROOMS_FILE: roomsFile },
  stdio: "ignore",
  windowsHide: true
});

run().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
}).finally(() => {
  try { server.kill(); } catch (_error) {}
  try { fs.rmSync(roomsFile, { force: true }); fs.rmSync(`${roomsFile}.tmp`, { force: true }); } catch (_error) {}
});
