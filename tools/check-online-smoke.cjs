"use strict";

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.IRONLINE_SMOKE_PORT || 4191);
const baseUrl = `http://127.0.0.1:${port}`;
const roomId = `SMOKE-${Date.now()}`;

function requestJson(pathname, options = {}) {
  const body = options.body ? JSON.stringify(options.body) : "";
  return new Promise((resolve, reject) => {
    const request = http.request(`${baseUrl}${pathname}`, {
      method: options.method || "GET",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body)
      },
      timeout: options.timeout || 5000
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`${options.method || "GET"} ${pathname} returned ${response.statusCode}: ${raw}`));
          return;
        }
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch (error) {
          reject(new Error(`Invalid JSON from ${pathname}: ${error.message}`));
        }
      });
    });
    request.on("error", reject);
    request.on("timeout", () => {
      request.destroy(new Error(`${pathname} timed out`));
    });
    if (body) request.write(body);
    request.end();
  });
}

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 9000) {
    try {
      const build = await requestJson("/api/build", { timeout: 1200 });
      if (build?.ok) return build;
    } catch (_error) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("Server did not expose /api/build in time.");
}

function postRoom(room) {
  return requestJson("/api/rooms", { method: "POST", body: room });
}

async function fetchRoom() {
  const payload = await requestJson("/api/rooms");
  return (payload.rooms || []).find((room) => room.id === roomId);
}

function wsSmoke() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const events = [];
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket smoke timed out."));
    }, 5000);

    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      events.push(message.type);
      if (message.type === "hello") {
        ws.send(JSON.stringify({
          type: "join",
          roomId: `${roomId}-WS`,
          playerId: "ws-blue",
          nickname: "Blue"
        }));
      }
      if (message.type === "observer_snapshot") {
        clearTimeout(timer);
        ws.close();
        resolve({ events, snapshot: message.payload });
      }
    });
    ws.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function runSmoke() {
  const baseRoom = {
    id: roomId,
    name: "Smoke Online",
    mode: "annihilation",
    phase: "playing",
    capacity: 8,
    blueFactionId: "korea",
    redFactionId: "russia",
    players: [],
    spectators: [],
    chat: [],
    events: [{ id: `${roomId}:start`, type: "room_started", createdAt: Date.now() }],
    combatEvents: []
  };

  await postRoom(baseRoom);
  await postRoom({
    ...baseRoom,
    players: [{
      id: "p-blue",
      name: "Blue",
      team: "blue",
      slotId: "blue-infantry",
      participantType: "player",
      ready: true,
      position: {
        x: 1200,
        y: 1400,
        alive: true,
        angle: 0.2,
        aimX: 1500,
        aimY: 1400,
        updatedAt: Date.now()
      }
    }],
    updatedAt: Date.now()
  });
  await postRoom({
    ...baseRoom,
    players: [{
      id: "p-red",
      name: "Red",
      team: "red",
      slotId: "red-infantry",
      participantType: "player",
      ready: true,
      position: {
        x: 1600,
        y: 1400,
        alive: true,
        angle: 3.1,
        aimX: 1200,
        aimY: 1400,
        droneId: "D-1",
        droneX: 1580,
        droneY: 1320,
        droneAngle: 1.2,
        droneControlled: true,
        updatedAt: Date.now()
      }
    }],
    combatEvents: [{
      id: `${roomId}:shot-1`,
      type: "small_arms",
      shooterId: "p-red",
      targetPlayerId: "p-blue",
      hit: true,
      damage: 12,
      x1: 1600,
      y1: 1400,
      x2: 1200,
      y2: 1400,
      createdAt: Date.now()
    }],
    worldState: {
      roomId,
      hostId: "p-blue",
      tick: 1,
      updatedAt: Date.now(),
      vehicles: [{ id: "B-21", team: "blue", x: 1300, y: 1500, hp: 120, maxHp: 120, alive: true }],
      units: [],
      capturePoints: []
    },
    updatedAt: Date.now()
  });

  const room = await fetchRoom();
  if (!room) throw new Error("Smoke room was not returned.");
  if ((room.players || []).length !== 2) throw new Error(`Expected 2 merged players, got ${(room.players || []).length}.`);
  if (!room.players.some((player) => player.id === "p-red" && player.position?.droneX === 1580)) {
    throw new Error("Remote drone position was not preserved.");
  }
  if (!room.combatEvents?.some((event) => event.id === `${roomId}:shot-1`)) {
    throw new Error("Combat event was not preserved.");
  }
  if (room.worldState?.hostId !== "p-blue") throw new Error("World state host was not preserved.");

  const ws = await wsSmoke();
  if (!ws.events.includes("hello") || !ws.events.includes("observer_snapshot")) {
    throw new Error(`Unexpected WebSocket events: ${ws.events.join(",")}`);
  }

  console.log(`Online smoke passed: ${roomId}, players=${room.players.length}, combat=${room.combatEvents.length}, ws=${ws.events.join("/")}`);
}

const server = spawn(process.execPath, ["tools/static-server.cjs", String(port)], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    IRONLINE_ROOMS_FILE: path.join(root, ".data", `online-smoke-${process.pid}.json`)
  }
});

let stderr = "";
server.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

(async () => {
  try {
    await waitForServer();
    await runSmoke();
  } catch (error) {
    console.error(error.message || error);
    if (stderr.trim()) console.error(stderr.trim());
    process.exitCode = 1;
  } finally {
    server.kill();
  }
})();
