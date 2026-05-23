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

function postCommand(roomIdValue, command) {
  return requestJson(`/api/rooms/${encodeURIComponent(roomIdValue)}/commands`, { method: "POST", body: command });
}

async function expectCommandReject(roomIdValue, command, expectedReason) {
  try {
    await postCommand(roomIdValue, command);
  } catch (error) {
    if (!String(error.message || "").includes(expectedReason)) throw error;
    return true;
  }
  throw new Error(`Expected command rejection: ${expectedReason}`);
}

async function fetchRoom() {
  const payload = await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`);
  return payload.room || null;
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

function wsCommandSmoke() {
  return new Promise((resolve, reject) => {
    const wsRoomId = `${roomId}-WS-CMD`;
    const a = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const b = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const events = { a: [], b: [] };
    const joined = new Set();
    let slotRequested = false;
    let commandSent = false;
    let commandAck = false;
    let broadcastSeen = false;
    const commandId = `${wsRoomId}:cmd:1`;
    const issuedAt = Date.now();
    const timer = setTimeout(() => {
      a.close();
      b.close();
      reject(new Error("WebSocket command smoke timed out."));
    }, 6000);

    const closeDone = () => {
      clearTimeout(timer);
      a.close();
      b.close();
      resolve({ events, commandAck, broadcastSeen });
    };

    const maybeAssign = () => {
      if (slotRequested || joined.size < 2) return;
      slotRequested = true;
      a.send(JSON.stringify({ type: "assign_slot", slotId: "blue-infantry" }));
    };

    const handle = (name, ws) => (raw) => {
      const message = JSON.parse(raw.toString());
      events[name].push(message.type);
      if (message.type === "hello") {
        ws.send(JSON.stringify({
          type: "join",
          roomId: wsRoomId,
          playerId: name === "a" ? "ws-blue" : "ws-observer",
          nickname: name === "a" ? "Blue" : "Observer"
        }));
      }
      if (message.type === "join_result") {
        joined.add(name);
        maybeAssign();
      }
      if (name === "a" && message.type === "slot_result" && message.payload?.ok && !commandSent) {
        commandSent = true;
        ws.send(JSON.stringify({
          type: "command",
          packet: {
            commandId,
            commandType: "assault",
            commanderSlotId: "blue-infantry",
            role: "infantry",
            controllerType: "human",
            targetSquadId: "B-SQD-3",
            targetPosition: { x: 1280, y: 1420 },
            issuedAt,
            lockUntil: issuedAt + 2800,
            reason: "assault"
          }
        }));
      }
      if (name === "a" && message.type === "command_ack" && message.payload?.ok) commandAck = true;
      if (name === "b" && message.type === "command_broadcast" && message.payload?.packet?.commandId === commandId) {
        broadcastSeen = true;
        if (commandAck) closeDone();
      }
      if (message.type === "command_ack" && message.payload?.ok && broadcastSeen) closeDone();
    };

    a.on("message", handle("a", a));
    b.on("message", handle("b", b));
    a.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    b.on("error", (error) => {
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
        stateSeq: 3,
        stateUpdatedAt: Date.now(),
        alive: true,
        hp: 100,
        maxHp: 100,
        weaponId: "rifle",
        movementState: "moving",
        deathState: "alive",
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
      slotId: "red-armor",
      roleId: "armor",
      participantType: "player",
      ready: true,
      position: {
        x: 1600,
        y: 1400,
        stateSeq: 4,
        stateUpdatedAt: Date.now(),
        alive: true,
        hp: 100,
        maxHp: 100,
        weaponId: "machinegun",
        movementState: "idle",
        deathState: "alive",
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
      hitId: `${roomId}:hit:smoke-1`,
      sequence: 1,
      targetHealthBefore: 100,
      targetHealthAfter: 88,
      targetStateSeq: 3,
      shooterStateSeq: 4,
      damageCause: "rifle",
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
  const blueAfterMerge = room.players.find((player) => player.id === "p-blue");
  if (blueAfterMerge?.position?.stateSeq !== 3 || blueAfterMerge?.position?.hp !== 100 || blueAfterMerge?.position?.weaponId !== "rifle") {
    throw new Error("Online combat player state fields were not preserved.");
  }
  if (!room.combatEvents?.some((event) => event.id === `${roomId}:shot-1`)) {
    throw new Error("Combat event was not preserved.");
  }
  if (room.worldState?.hostId !== "p-blue") throw new Error("World state host was not preserved.");

  await postRoom({
    id: roomId,
    players: [{
      id: "p-blue",
      name: "Blue",
      team: "blue",
      slotId: "blue-infantry",
      participantType: "player",
      ready: true,
      updatedAt: Date.now() - 5000,
      position: {
        x: 300,
        y: 300,
        stateSeq: 1,
        stateUpdatedAt: Date.now() - 5000,
        alive: true,
        hp: 42,
        maxHp: 100,
        weaponId: "pistol",
        updatedAt: Date.now() - 5000
      }
    }],
    updatedAt: Date.now()
  });
  const staleRoom = await fetchRoom();
  const staleBlue = staleRoom.players.find((player) => player.id === "p-blue");
  if (staleBlue?.position?.x === 300 || staleBlue?.position?.stateSeq !== 3 || staleBlue?.position?.hp !== 100) {
    throw new Error("Stale player position update overwrote newer combat state.");
  }

  await postRoom({
    id: roomId,
    combatEvents: [{
      id: `${roomId}:shot-duplicate-a`,
      hitId: `${roomId}:hit:dedupe`,
      type: "small_arms",
      shooterId: "p-red",
      targetPlayerId: "p-blue",
      hit: true,
      damage: 10,
      createdAt: Date.now()
    }, {
      id: `${roomId}:shot-duplicate-b`,
      hitId: `${roomId}:hit:dedupe`,
      type: "small_arms",
      shooterId: "p-red",
      targetPlayerId: "p-blue",
      hit: true,
      damage: 10,
      createdAt: Date.now() + 1
    }],
    updatedAt: Date.now()
  });
  const dedupeRoom = await fetchRoom();
  const dedupedHits = (dedupeRoom.combatEvents || []).filter((event) => event.hitId === `${roomId}:hit:dedupe`);
  if (dedupedHits.length !== 1) throw new Error(`Duplicate hitId combat event was not collapsed, got ${dedupedHits.length}.`);

  const issuedAt = Date.now();
  const infantryCommand = await postCommand(roomId, {
    commandId: `${roomId}:cmd:infantry-assault`,
    playerId: "p-blue",
    commanderSlotId: "blue-infantry",
    role: "infantry",
    controllerType: "human",
    commandType: "assault",
    targetSquadId: "B-SQD-3",
    targetPosition: { x: 1220, y: 1410 },
    issuedAt,
    lockUntil: issuedAt + 2800,
    reason: "assault"
  });
  if (!infantryCommand.ok || infantryCommand.packet?.commandState !== "assault") {
    throw new Error("Authorized infantry command was not accepted with command state.");
  }
  const armorIssuedAt = issuedAt + 20;
  const armorCommand = await postCommand(roomId, {
    commandId: `${roomId}:cmd:armor-cover`,
    playerId: "p-red",
    commanderSlotId: "red-armor",
    role: "armor",
    controllerType: "human",
    commandType: "fire_support",
    targetAssetId: "R-12",
    targetPosition: { x: 1500, y: 1440 },
    issuedAt: armorIssuedAt,
    lockUntil: armorIssuedAt + 2000,
    reason: "fire_support"
  });
  if (!armorCommand.ok || armorCommand.packet?.commandState !== "cover") {
    throw new Error("Authorized armor command was not accepted with command state.");
  }
  await expectCommandReject(roomId, {
    commandId: `${roomId}:cmd:bad-infantry-vehicle`,
    playerId: "p-blue",
    commanderSlotId: "blue-infantry",
    role: "infantry",
    commandType: "fire_support",
    targetAssetId: "B-12",
    issuedAt: issuedAt + 40,
    lockUntil: issuedAt + 2040
  }, "role-command-restricted");
  await expectCommandReject(roomId, {
    commandId: `${roomId}:cmd:wrong-team-squad`,
    playerId: "p-blue",
    commanderSlotId: "blue-infantry",
    role: "infantry",
    commandType: "assault",
    targetSquadId: "R-SQD-3",
    targetPosition: { x: 1300, y: 1500 },
    issuedAt: issuedAt + 50,
    lockUntil: issuedAt + 2850
  }, "target-team-mismatch");
  await expectCommandReject(roomId, {
    ...infantryCommand.packet,
    issuedAt: issuedAt + 60
  }, "duplicate-command");
  await expectCommandReject(roomId, {
    commandId: `${roomId}:cmd:stale`,
    playerId: "p-blue",
    commanderSlotId: "blue-infantry",
    role: "infantry",
    commandType: "move",
    targetSquadId: "B-SQD-3",
    targetPosition: { x: 1300, y: 1500 },
    issuedAt: issuedAt - 5000,
    lockUntil: issuedAt - 3500
  }, "stale-command");
  const cancelIssuedAt = issuedAt + 120;
  const cancelCommand = await postCommand(roomId, {
    commandId: `${roomId}:cmd:infantry-cancel`,
    playerId: "p-blue",
    commanderSlotId: "blue-infantry",
    role: "infantry",
    controllerType: "human",
    commandType: "cancel",
    targetSquadId: "B-SQD-3",
    targetPosition: { x: 1220, y: 1410 },
    issuedAt: cancelIssuedAt,
    lockUntil: cancelIssuedAt,
    reason: "cancel"
  });
  if (!cancelCommand.ok || cancelCommand.packet?.commandState !== "cancel") {
    throw new Error("Online cancel command was not accepted with cancel state.");
  }

  const commandRoom = await fetchRoom();
  if ((commandRoom.commands || []).length < 3) throw new Error("Accepted commands were not preserved in room state.");
  if (!commandRoom.commands.some((command) => command.commandId === `${roomId}:cmd:infantry-assault` && command.commandState === "assault")) {
    throw new Error("Infantry command state was not visible in room commands.");
  }
  if (!commandRoom.commands.some((command) => command.commandId === `${roomId}:cmd:armor-cover` && command.commandState === "cover")) {
    throw new Error("Armor command state was not visible in room commands.");
  }
  if (!commandRoom.commands.some((command) => command.commandId === `${roomId}:cmd:infantry-cancel` && command.commandState === "cancel")) {
    throw new Error("Cancel command state was not visible in room commands.");
  }

  const ws = await wsSmoke();
  if (!ws.events.includes("hello") || !ws.events.includes("observer_snapshot")) {
    throw new Error(`Unexpected WebSocket events: ${ws.events.join(",")}`);
  }
  const wsCommand = await wsCommandSmoke();
  if (!wsCommand.commandAck || !wsCommand.broadcastSeen) throw new Error("WebSocket command ack/broadcast failed.");

  console.log(`Online smoke passed: ${roomId}, players=${room.players.length}, combat=${room.combatEvents.length}, commands=${commandRoom.commands.length}, ws=${ws.events.join("/")}, wsCommand=ack/broadcast`);
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
