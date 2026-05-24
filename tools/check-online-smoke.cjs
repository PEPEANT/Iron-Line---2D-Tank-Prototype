"use strict";

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const { createOnlineSmokeWsHelpers } = require("./online-smoke-ws.cjs");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.IRONLINE_SMOKE_PORT || 4191);
const baseUrl = `http://127.0.0.1:${port}`;
const roomId = `SMOKE-${Date.now()}`;
const combatOnlyRecovery = process.env.IRONLINE_P0_COMBAT_ONLY !== "0";

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
async function fetchRoomById(roomIdValue) {
  const payload = await requestJson(`/api/rooms/${encodeURIComponent(roomIdValue)}`);
  return payload.room || null;
}

const { wsSmoke, wsCommandSmoke, wsLobbyGuardSmoke, wsPlayerStateSmoke, wsPlayerStateThreePlayerSameTeamSmoke, wsFourVsFourSmoke } = createOnlineSmokeWsHelpers({
  port,
  roomId,
  combatOnlyRecovery,
  requestJson,
  fetchRoomById
});

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
  const smallRoomId = `${roomId}-CAP4`;
  await postRoom({
    ...baseRoom,
    id: smallRoomId,
    capacity: 4,
    players: []
  });
  await postRoom({
    id: smallRoomId,
    capacity: 4,
    players: [{
      id: "cap4-red",
      name: "Cap4 Red",
      team: "red",
      slotId: "red-infantry",
      participantType: "player",
      ready: true,
      position: {
        x: 1600,
        y: 1400,
        stateSeq: 1,
        alive: true,
        hp: 100,
        maxHp: 100,
        updatedAt: Date.now()
      }
    }],
    updatedAt: Date.now()
  });
  const smallRoomPayload = await requestJson(`/api/rooms/${encodeURIComponent(smallRoomId)}`);
  const smallRed = smallRoomPayload.room?.players?.find((player) => player.id === "cap4-red");
  if (smallRed?.team !== "red" || smallRed?.slotId !== "red-infantry") {
    throw new Error(`Capacity 4 room did not preserve requested red slot/team: ${smallRed?.team}/${smallRed?.slotId}`);
  }

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
  if (!ws.events.includes("hello") || !ws.events.includes("join_result") || (combatOnlyRecovery && ws.events.includes("observer_snapshot"))) {
    throw new Error(`Unexpected WebSocket events: ${ws.events.join(",")}`);
  }
  const wsCommand = await wsCommandSmoke();
  if (!wsCommand.commandAck || !wsCommand.broadcastSeen) throw new Error("WebSocket command ack/broadcast failed.");
  const wsLobbyGuards = await wsLobbyGuardSmoke();
  if (!wsLobbyGuards.slotNotJoined || !wsLobbyGuards.readyNotJoined || !wsLobbyGuards.readyLocked) {
    throw new Error(`WebSocket lobby authority guards failed: ${JSON.stringify(wsLobbyGuards)}`);
  }
  const wsPlayerState = await wsPlayerStateSmoke(roomId);
  if (!wsPlayerState.payload?.blue?.state || wsPlayerState.payload.blue.playerId !== "p-blue") {
    throw new Error("WebSocket player_state relay failed.");
  }
  const wsPlayerState3pSameTeam = await wsPlayerStateThreePlayerSameTeamSmoke();
  if (wsPlayerState3pSameTeam.correctedTeam !== "blue" || wsPlayerState3pSameTeam.correctedSlotId !== "blue-engineer") {
    throw new Error("WebSocket 3-player same-team relay failed.");
  }
  const ws4v4 = await wsFourVsFourSmoke();
  if (ws4v4.playerCount !== 8 || ws4v4.readyCount !== 8) {
    throw new Error(`WebSocket 4v4 smoke failed: players=${ws4v4.playerCount}, ready=${ws4v4.readyCount}`);
  }

  console.log(`Online smoke passed: ${roomId}, players=${room.players.length}, combat=${room.combatEvents.length}, commands=${commandRoom.commands.length}, ws=${ws.events.join("/")}, wsCommand=ack/broadcast, wsLobbyGuards=not_joined/locked, wsPlayerState=relay, wsPlayerState3pSameTeam=${wsPlayerState3pSameTeam.relayedPlayers}p, ws4v4=${ws4v4.playerCount}p/${ws4v4.readyCount}ready`);
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
