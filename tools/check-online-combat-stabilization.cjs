"use strict";

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.IRONLINE_COMBAT_SMOKE_PORT || 4198);
const baseUrl = `http://127.0.0.1:${port}`;
const roomId = `COMBAT-${Date.now()}`;

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

function postRoom(room) {
  return requestJson("/api/rooms", { method: "POST", body: room });
}

async function fetchRoom() {
  const payload = await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`);
  return payload.room || null;
}

function player(room, id) {
  return (room?.players || []).find((item) => item.id === id) || null;
}

function eventsBy(room, field, value) {
  return (room?.combatEvents || []).filter((event) => event?.[field] === value);
}

async function runSmoke() {
  const now = Date.now();
  await postRoom({
    id: roomId,
    name: "Combat Stabilization Smoke",
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
      updatedAt: now,
      position: {
        x: 1200,
        y: 1400,
        stateSeq: 10,
        stateUpdatedAt: now,
        alive: true,
        deathState: "alive",
        hp: 100,
        maxHp: 100,
        weaponId: "rifle",
        movementState: "moving",
        angle: 0.1,
        aimX: 1550,
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
      updatedAt: now,
      position: {
        x: 1600,
        y: 1400,
        stateSeq: 8,
        stateUpdatedAt: now,
        alive: true,
        deathState: "alive",
        hp: 100,
        maxHp: 100,
        weaponId: "machinegun",
        movementState: "idle",
        angle: 3.14,
        aimX: 1200,
        aimY: 1400,
        updatedAt: now
      }
    }],
    combatEvents: [],
    updatedAt: now
  });

  let room = await fetchRoom();
  if ((room?.players || []).length !== 2) throw new Error("Expected two online players in combat room.");
  const blue = player(room, "blue-human");
  const red = player(room, "red-human");
  if (blue?.position?.stateSeq !== 10 || blue?.position?.hp !== 100 || blue?.position?.weaponId !== "rifle") {
    throw new Error("Blue combat state fields were not preserved.");
  }
  if (red?.position?.stateSeq !== 8 || red?.position?.aimX !== 1200 || red?.position?.weaponId !== "machinegun") {
    throw new Error("Red aim / weapon state was not preserved.");
  }

  await postRoom({
    id: roomId,
    players: [{
      id: "blue-human",
      name: "Blue",
      team: "blue",
      slotId: "blue-infantry",
      participantType: "player",
      ready: true,
      updatedAt: now - 5000,
      position: {
        x: 300,
        y: 300,
        stateSeq: 2,
        stateUpdatedAt: now - 5000,
        alive: true,
        hp: 40,
        maxHp: 100,
        weaponId: "pistol",
        updatedAt: now - 5000
      }
    }],
    updatedAt: Date.now()
  });

  room = await fetchRoom();
  const staleBlue = player(room, "blue-human");
  if (staleBlue?.position?.x === 300 || staleBlue?.position?.stateSeq !== 10 || staleBlue?.position?.hp !== 100) {
    throw new Error("Stale player state overwrote newer position / health.");
  }

  await postRoom({
    id: roomId,
    combatEvents: [{
      id: `${roomId}:shot:1`,
      eventId: `${roomId}:shot:1`,
      sequence: 1,
      hitId: `${roomId}:hit:1`,
      type: "small_arms",
      shooterId: "red-human",
      shooterName: "Red",
      shooterTeam: "red",
      targetPlayerId: "blue-human",
      weaponId: "machinegun",
      damageCause: "machinegun",
      damage: 22,
      hit: true,
      targetHealthBefore: 100,
      targetHealthAfter: 78,
      targetStateSeq: 10,
      shooterStateSeq: 8,
      x1: 1600,
      y1: 1400,
      x2: 1200,
      y2: 1400,
      createdAt: Date.now()
    }, {
      id: `${roomId}:shot:1-duplicate`,
      eventId: `${roomId}:shot:1-duplicate`,
      sequence: 2,
      hitId: `${roomId}:hit:1`,
      type: "small_arms",
      shooterId: "red-human",
      shooterTeam: "red",
      targetPlayerId: "blue-human",
      weaponId: "machinegun",
      damage: 22,
      hit: true,
      createdAt: Date.now() + 1
    }],
    updatedAt: Date.now()
  });

  room = await fetchRoom();
  const hitEvents = eventsBy(room, "hitId", `${roomId}:hit:1`);
  if (hitEvents.length !== 1) throw new Error(`Expected duplicate hit collapse, got ${hitEvents.length}.`);
  if (hitEvents[0].targetHealthAfter !== 78 || hitEvents[0].targetStateSeq !== 10) {
    throw new Error("Hit event health / target sequence metadata was not preserved.");
  }

  await postRoom({
    id: roomId,
    combatEvents: [{
      id: `${roomId}:death:blue:1`,
      eventId: `${roomId}:death:blue:1`,
      type: "player_death",
      deathId: `${roomId}:death:blue`,
      hitId: `${roomId}:hit:1`,
      shooterId: "red-human",
      killerId: "red-human",
      shooterName: "Red",
      shooterTeam: "red",
      targetPlayerId: "blue-human",
      weaponId: "machinegun",
      damageCause: "machinegun",
      lethal: true,
      targetHealthBefore: 22,
      targetHealthAfter: 0,
      targetStateSeq: 10,
      createdAt: Date.now()
    }, {
      id: `${roomId}:death:blue:2`,
      eventId: `${roomId}:death:blue:2`,
      type: "player_death",
      deathId: `${roomId}:death:blue`,
      shooterId: "red-human",
      targetPlayerId: "blue-human",
      createdAt: Date.now() + 1
    }],
    updatedAt: Date.now()
  });

  room = await fetchRoom();
  const deathEvents = eventsBy(room, "deathId", `${roomId}:death:blue`);
  if (deathEvents.length !== 1) throw new Error(`Expected duplicate death collapse, got ${deathEvents.length}.`);
  if (!deathEvents[0].lethal || deathEvents[0].killerId !== "red-human") {
    throw new Error("Death event lethal / killer metadata was not preserved.");
  }

  await postRoom({
    id: roomId,
    combatEvents: [{
      id: `${roomId}:respawn:blue:1`,
      eventId: `${roomId}:respawn:blue:1`,
      type: "player_respawn",
      respawnId: `${roomId}:respawn:blue`,
      shooterId: "blue-human",
      shooterTeam: "blue",
      targetPlayerId: "blue-human",
      weaponId: "respawn",
      damageCause: "respawn",
      targetHealthBefore: 0,
      targetHealthAfter: 100,
      targetStateSeq: 12,
      hitX: 1220,
      hitY: 1420,
      createdAt: Date.now()
    }, {
      id: `${roomId}:respawn:blue:2`,
      eventId: `${roomId}:respawn:blue:2`,
      type: "player_respawn",
      respawnId: `${roomId}:respawn:blue`,
      shooterId: "blue-human",
      targetPlayerId: "blue-human",
      createdAt: Date.now() + 1
    }],
    updatedAt: Date.now()
  });

  room = await fetchRoom();
  const respawnEvents = eventsBy(room, "respawnId", `${roomId}:respawn:blue`);
  if (respawnEvents.length !== 1) throw new Error(`Expected duplicate respawn collapse, got ${respawnEvents.length}.`);
  if (respawnEvents[0].targetHealthAfter !== 100 || respawnEvents[0].targetStateSeq !== 12) {
    throw new Error("Respawn health / sequence metadata was not preserved.");
  }

  return {
    roomId,
    players: room.players.length,
    combatEvents: room.combatEvents.length,
    playerState: {
      blueSeq: staleBlue.position.stateSeq,
      blueHp: staleBlue.position.hp,
      redSeq: red.position.stateSeq,
      redWeapon: red.position.weaponId
    },
    dedupe: {
      hitEvents: hitEvents.length,
      deathEvents: deathEvents.length,
      respawnEvents: respawnEvents.length
    }
  };
}

const server = spawn(process.execPath, ["tools/static-server.cjs", String(port)], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    IRONLINE_ROOMS_FILE: path.join(root, ".data", `online-combat-smoke-${process.pid}.json`)
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
