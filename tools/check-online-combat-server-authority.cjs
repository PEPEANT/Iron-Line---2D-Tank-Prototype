"use strict";

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.IRONLINE_SERVER_AUTH_COMBAT_PORT || 4199);
const baseUrl = `http://127.0.0.1:${port}`;
const roomId = `AUTH-${Date.now()}`;

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
        let payload = {};
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch (error) {
          reject(new Error(`Invalid JSON from ${pathname}: ${error.message}`));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const reason = payload.reason || raw || response.statusCode;
          reject(new Error(`${options.method || "GET"} ${pathname} returned ${response.statusCode}: ${reason}`));
          return;
        }
        resolve(payload);
      });
    });
    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error(`${pathname} timed out`)));
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

async function fetchRoom() {
  const payload = await requestJson("/api/rooms");
  return (payload.rooms || []).find((room) => room.id === roomId);
}

function player(room, id) {
  return (room?.players || []).find((item) => item.id === id) || null;
}

function events(room, type) {
  return (room?.combatEvents || []).filter((event) => event.type === type);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function postCombat(packet) {
  return requestJson(`/api/rooms/${encodeURIComponent(roomId)}/combat`, {
    method: "POST",
    body: packet
  });
}

async function runSmoke() {
  const now = Date.now();
  await requestJson("/api/rooms", {
    method: "POST",
    body: {
      id: roomId,
      name: "Server Authority Combat Smoke",
      mode: "annihilation",
      phase: "playing",
      capacity: 8,
      players: [{
        id: "blue-human",
        name: "Blue",
        team: "blue",
        slotId: "blue-infantry",
        participantType: "player",
        ready: true,
        stats: { kills: 0, deaths: 0 },
        updatedAt: now,
        position: {
          x: 1200,
          y: 1400,
          stateSeq: 10,
          alive: true,
          deathState: "alive",
          hp: 100,
          maxHp: 100,
          weaponId: "rifle",
          aimX: 1600,
          aimY: 1400,
          updatedAt: now
        }
      }, {
        id: "red-human",
        name: "Red",
        team: "red",
        slotId: "red-armor",
        participantType: "player",
        ready: true,
        stats: { kills: 0, deaths: 0 },
        updatedAt: now,
        position: {
          x: 1600,
          y: 1400,
          stateSeq: 8,
          alive: true,
          deathState: "alive",
          hp: 100,
          maxHp: 100,
          weaponId: "machinegun",
          aimX: 1200,
          aimY: 1400,
          updatedAt: now
        }
      }],
      combatEvents: [],
      updatedAt: now
    }
  });

  const firstShot = await postCombat({
    type: "small_arms",
    shotId: `${roomId}:shot:red:1`,
    eventId: `${roomId}:shot:red:1`,
    hitId: `${roomId}:hit:red:1`,
    shooterId: "red-human",
    shooterName: "Red",
    shooterTeam: "red",
    targetPlayerId: "blue-human",
    weaponId: "machinegun",
    damage: 22,
    hit: true,
    targetStateSeq: 10,
    shooterStateSeq: 8,
    x1: 1600,
    y1: 1400,
    x2: 1200,
    y2: 1400,
    createdAt: Date.now()
  });
  assert(firstShot.ok, "first shot was rejected");
  let room = firstShot.room || await fetchRoom();
  let hitConfirms = events(room, "server_hit_confirm");
  assert(hitConfirms.length === 1, `expected one server hit confirm, got ${hitConfirms.length}`);
  assert(hitConfirms[0].accepted === true, "server hit confirm was not accepted");
  assert(hitConfirms[0].damage === 22, "server did not preserve clamped damage");
  assert(player(room, "blue-human")?.position?.hp === 78, "server did not update target health");

  await postCombat({
    type: "small_arms",
    shotId: `${roomId}:shot:red:1`,
    eventId: `${roomId}:shot:red:1-dupe`,
    hitId: `${roomId}:hit:red:1`,
    shooterId: "red-human",
    shooterTeam: "red",
    targetPlayerId: "blue-human",
    weaponId: "machinegun",
    damage: 22,
    hit: true,
    targetStateSeq: 10,
    createdAt: Date.now() + 1
  });
  room = await fetchRoom();
  hitConfirms = events(room, "server_hit_confirm").filter((event) => event.hitId === `${roomId}:hit:red:1`);
  assert(hitConfirms.length === 1, `duplicate hit confirm was appended ${hitConfirms.length} times`);
  assert(player(room, "blue-human")?.position?.hp === 78, "duplicate hit changed target health");

  const lethal = await postCombat({
    type: "small_arms",
    shotId: `${roomId}:shot:red:2`,
    eventId: `${roomId}:shot:red:2`,
    hitId: `${roomId}:hit:red:2`,
    shooterId: "red-human",
    shooterName: "Red",
    shooterTeam: "red",
    targetPlayerId: "blue-human",
    weaponId: "sniper",
    damage: 90,
    hit: true,
    targetStateSeq: 10,
    shooterStateSeq: 8,
    x1: 1600,
    y1: 1400,
    x2: 1200,
    y2: 1400,
    createdAt: Date.now() + 2
  });
  assert(lethal.ok, "lethal shot was rejected");
  room = lethal.room || await fetchRoom();
  const deathConfirms = events(room, "server_death_confirm");
  assert(deathConfirms.length === 1, `expected one server death confirm, got ${deathConfirms.length}`);
  assert(deathConfirms[0].killerId === "red-human", "death confirm killer mismatch");
  assert(player(room, "blue-human")?.position?.alive === false, "target was not marked dead by server");

  const respawn = await postCombat({
    type: "player_respawn",
    respawnId: `${roomId}:respawn:blue:11`,
    playerId: "blue-human",
    targetPlayerId: "blue-human",
    targetStateSeq: 11,
    targetHealthAfter: 100,
    hitX: 1220,
    hitY: 1420,
    createdAt: Date.now() + 3
  });
  assert(respawn.ok, "respawn request was rejected");
  room = respawn.room || await fetchRoom();
  const respawnConfirms = events(room, "server_respawn_confirm");
  assert(respawnConfirms.length === 1, `expected one respawn confirm, got ${respawnConfirms.length}`);
  assert(player(room, "blue-human")?.position?.alive === true, "server respawn did not revive target");
  assert(player(room, "blue-human")?.position?.stateSeq === 11, "server respawn state sequence mismatch");

  const stale = await postCombat({
    type: "small_arms",
    shotId: `${roomId}:shot:red:stale`,
    eventId: `${roomId}:shot:red:stale`,
    hitId: `${roomId}:hit:red:stale`,
    shooterId: "red-human",
    shooterTeam: "red",
    targetPlayerId: "blue-human",
    weaponId: "machinegun",
    damage: 22,
    hit: true,
    targetStateSeq: 10,
    createdAt: Date.now() + 4
  });
  room = stale.room || await fetchRoom();
  const staleConfirm = events(room, "server_hit_confirm").find((event) => event.hitId === `${roomId}:hit:red:stale`);
  assert(staleConfirm?.accepted === false && staleConfirm.reason === "stale-state", "stale hit was not rejected by server");
  assert(player(room, "blue-human")?.position?.hp === 100, "stale hit changed post-respawn health");

  const round = await postCombat({
    type: "server_round_confirm",
    roundSeq: 1,
    phase: "ended",
    blueScore: 0,
    redScore: 1,
    winner: "red",
    reason: "annihilation"
  });
  room = round.room || await fetchRoom();
  const roundConfirms = events(room, "server_round_confirm");
  assert(roundConfirms.length === 1, "round confirm was not recorded");
  assert(roundConfirms[0].winner === "red", "round winner mismatch");

  return {
    roomId,
    combatEvents: room.combatEvents.length,
    hitConfirms: events(room, "server_hit_confirm").length,
    deathConfirms: events(room, "server_death_confirm").length,
    respawnConfirms: events(room, "server_respawn_confirm").length,
    roundConfirms: events(room, "server_round_confirm").length,
    blue: player(room, "blue-human")?.position,
    redStats: player(room, "red-human")?.stats
  };
}

const server = spawn(process.execPath, ["tools/static-server.cjs", String(port)], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    IRONLINE_ROOMS_FILE: path.join(root, ".data", `online-combat-server-authority-${process.pid}.json`)
  }
});

let stderr = "";
server.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

(async () => {
  try {
    const build = await waitForServer();
    const result = await runSmoke();
    console.log(JSON.stringify({
      ok: true,
      build: {
        commit: build.commit || "",
        branch: build.branch || ""
      },
      ...result
    }, null, 2));
  } catch (error) {
    console.error(error.stack || error.message || error);
    if (stderr.trim()) console.error(stderr.trim());
    process.exitCode = 1;
  } finally {
    server.kill();
  }
})();
