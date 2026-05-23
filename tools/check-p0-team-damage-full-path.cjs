"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.IRONLINE_TEAM_DAMAGE_PORT || (4300 + Math.floor(Math.random() * 900)));
const baseUrl = `http://127.0.0.1:${port}`;
const roomId = `TEAM-DAMAGE-${Date.now()}`;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ironline-team-damage-"));
const roomsFile = path.join(tempDir, "online-rooms.json");

function readSource(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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
        if (!options.allowError && (response.statusCode < 200 || response.statusCode >= 300)) {
          const reason = payload.reason || raw || response.statusCode;
          reject(new Error(`${options.method || "GET"} ${pathname} returned ${response.statusCode}: ${reason}`));
          return;
        }
        resolve({ status: response.statusCode, payload });
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
      const { payload } = await requestJson("/api/build", { timeout: 1200 });
      if (payload?.ok) return payload;
    } catch (_error) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("Server did not expose /api/build in time.");
}

async function postJson(pathname, body, options = {}) {
  const { payload, status } = await requestJson(pathname, {
    method: "POST",
    body,
    allowError: Boolean(options.allowError)
  });
  return { payload, status };
}

async function fetchRoom() {
  const { payload } = await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`);
  return payload.room || null;
}

function player(room, id) {
  return (room?.players || []).find((item) => item.id === id) || null;
}

function hp(room, id) {
  return player(room, id)?.position?.hp;
}

function stats(room, id) {
  return player(room, id)?.stats || {};
}

function eventOf(payload, predicate) {
  return (payload.events || []).find(predicate) || null;
}

function combatEvents(room, predicate) {
  return (room?.combatEvents || []).filter(predicate);
}

function staticValidation() {
  const combat = readSource("src/systems/combat.js");
  const main = readSource("src/main.js");
  const combatController = readSource("src/ai/combat-controller.js");
  const infantryAi = readSource("src/ai/infantry-ai.js");
  const tankAi = readSource("src/ai/tank-ai.js");
  const humveeAi = readSource("src/ai/humvee-ai.js");
  const reconDrone = readSource("src/entities/recon-drone.js");
  const suicideDrone = readSource("src/entities/suicide-drone.js");
  const physics = readSource("src/systems/physics.js");
  const sessionFlow = readSource("src/systems/session-flow.js");

  assert(combat.includes("shooter.team && target.team && shooter.team === target.team"), "fireRifle lacks same-team guard");
  assert(!combat.includes("shell.team === TEAM.RED"), "projectile player checks still use TEAM.RED");
  assert(combat.includes("game.isLocalPlayerEnemyFor?.(shell.team)"), "projectile direct path does not use local player team");
  assert(combat.includes("game.isLocalPlayerEnemyFor?.(team)"), "explosion radius path does not use local player team");
  assert(main.includes("event.accepted === false"), "online projectile reject metadata is not honored");
  assert(main.includes("shooterTeam && shooterTeam === localTeam"), "online projectile same-team guard is missing");
  assert(combatController.includes("this.game.isLocalPlayerEnemyFor?.(this.tank.team)"), "tank combat controller local player target gate is missing");
  assert(infantryAi.includes("this.game.isLocalPlayerEnemyFor?.(this.unit.team)"), "infantry AI local player target gate is missing");
  assert(tankAi.includes("this.game.isLocalPlayerEnemyFor?.(this.tank.team)"), "tank machine-gun AI local player target gate is missing");
  assert(humveeAi.includes("this.game.isLocalPlayerEnemyFor?.(this.vehicle.team)"), "humvee AI local player target gate is missing");
  assert(reconDrone.includes("game.player.team !== this.team"), "recon drone player target gate is missing");
  assert(suicideDrone.includes("game.player.team !== this.team"), "suicide drone player target gate is missing");
  assert(physics.includes("entityTeam(entity, game) === vehicle.team"), "vehicle contact same-team guard is missing");
  assert(sessionFlow.includes(".find((item) => item.team === team)"), "session safe-zone spawn does not use player team");
}

async function seedRoom() {
  const now = Date.now();
  await postJson("/api/rooms", {
    id: roomId,
    name: "P0 Team Damage Full Path",
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
        updatedAt: now
      }
    }, {
      id: "blue-support",
      name: "Blue Support",
      team: "blue",
      slotId: "blue-engineer",
      participantType: "player",
      ready: true,
      stats: { kills: 0, deaths: 0 },
      updatedAt: now,
      position: {
        x: 1260,
        y: 1460,
        stateSeq: 9,
        alive: true,
        deathState: "alive",
        hp: 100,
        maxHp: 100,
        weaponId: "rifle",
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
        updatedAt: now
      }
    }, {
      id: "red-support",
      name: "Red Support",
      team: "red",
      slotId: "red-engineer",
      participantType: "player",
      ready: true,
      stats: { kills: 0, deaths: 0 },
      updatedAt: now,
      position: {
        x: 1700,
        y: 1460,
        stateSeq: 6,
        alive: true,
        deathState: "alive",
        hp: 100,
        maxHp: 100,
        weaponId: "rifle",
        updatedAt: now
      }
    }],
    combatEvents: [],
    updatedAt: now
  });
}

async function postCombat(packet, options = {}) {
  return postJson(`/api/rooms/${encodeURIComponent(roomId)}/combat`, packet, options);
}

async function dynamicValidation() {
  await seedRoom();

  let result = await postCombat({
    type: "small_arms",
    shotId: `${roomId}:shot:red:enemy`,
    eventId: `${roomId}:shot:red:enemy`,
    hitId: `${roomId}:hit:red:enemy`,
    shooterId: "red-human",
    shooterName: "Red",
    shooterTeam: "blue",
    targetPlayerId: "blue-human",
    weaponId: "machinegun",
    damage: 22,
    hit: true,
    targetStateSeq: 10,
    shooterStateSeq: 8,
    createdAt: Date.now()
  });
  let accepted = eventOf(result.payload, (event) => event.type === "server_hit_confirm" && event.hitId === `${roomId}:hit:red:enemy`);
  assert(accepted?.accepted === true, "enemy small_arms hit was not accepted");
  assert(accepted.shooterTeam === "red", "enemy small_arms trusted client shooterTeam");
  let room = await fetchRoom();
  assert(hp(room, "blue-human") === 78, "enemy small_arms did not update blue health");

  result = await postCombat({
    type: "small_arms",
    shotId: `${roomId}:shot:red:same`,
    eventId: `${roomId}:shot:red:same`,
    hitId: `${roomId}:hit:red:same`,
    shooterId: "red-human",
    shooterName: "Red",
    shooterTeam: "blue",
    targetPlayerId: "red-support",
    weaponId: "machinegun",
    damage: 55,
    hit: true,
    targetStateSeq: 6,
    shooterStateSeq: 8,
    createdAt: Date.now() + 1
  });
  let rejected = eventOf(result.payload, (event) => event.type === "server_hit_confirm" && event.hitId === `${roomId}:hit:red:same`);
  assert(rejected?.accepted === false && rejected.reason === "same-team", "same-team small_arms was not rejected");
  assert(rejected.damage === 0 && rejected.shooterTeam === "red", "same-team small_arms kept damage or client team");
  room = await fetchRoom();
  assert(hp(room, "red-support") === 100, "same-team small_arms changed friendly health");
  assert((stats(room, "red-human").kills || 0) === 0, "same-team small_arms polluted killer stats");
  assert((stats(room, "red-support").deaths || 0) === 0, "same-team small_arms polluted target deaths");

  result = await postCombat({
    type: "small_arms",
    shotId: `${roomId}:shot:red:self`,
    eventId: `${roomId}:shot:red:self`,
    hitId: `${roomId}:hit:red:self`,
    shooterId: "red-human",
    targetPlayerId: "red-human",
    weaponId: "rifle",
    damage: 30,
    hit: true,
    targetStateSeq: 8,
    shooterStateSeq: 8
  });
  rejected = eventOf(result.payload, (event) => event.type === "server_hit_confirm" && event.hitId === `${roomId}:hit:red:self`);
  assert(rejected?.accepted === false && rejected.reason === "self-hit", "self small_arms was not rejected");

  result = await postCombat({
    type: "projectile_launch",
    id: `${roomId}:proj:red:same:launch`,
    eventId: `${roomId}:proj:red:same:launch`,
    projectileId: `${roomId}:proj:red:same`,
    shooterId: "red-human",
    shooterTeam: "blue",
    targetPlayerId: "red-support",
    weaponId: "rpg",
    damage: 80,
    hit: true,
    createdAt: Date.now() + 2
  });
  rejected = eventOf(result.payload, (event) => event.type === "projectile_launch" && event.projectileId === `${roomId}:proj:red:same`);
  assert(rejected?.accepted === false && rejected.reason === "same-team", "same-team projectile_launch damage claim was not rejected");
  assert(rejected.damage === 0 && rejected.shooterTeam === "red", "same-team projectile_launch kept damage or client team");

  result = await postCombat({
    type: "projectile_impact",
    id: `${roomId}:proj:red:same:impact`,
    eventId: `${roomId}:proj:red:same:impact`,
    projectileId: `${roomId}:proj:red:same`,
    shooterId: "red-human",
    shooterTeam: "blue",
    targetPlayerId: "red-support",
    weaponId: "rpg",
    damage: 80,
    radius: 120,
    hit: true,
    hitX: 1700,
    hitY: 1460,
    createdAt: Date.now() + 3
  });
  rejected = eventOf(result.payload, (event) => event.type === "projectile_impact" && event.projectileId === `${roomId}:proj:red:same`);
  assert(rejected?.accepted === false && rejected.reason === "same-team", "same-team projectile_impact was not rejected");
  assert(rejected.damage === 0 && rejected.shooterTeam === "red", "same-team projectile_impact kept damage or client team");
  room = await fetchRoom();
  assert(hp(room, "red-support") === 100, "same-team projectile changed friendly health");

  result = await postCombat({
    type: "projectile_impact",
    id: `${roomId}:proj:red:self:impact`,
    eventId: `${roomId}:proj:red:self:impact`,
    projectileId: `${roomId}:proj:red:self`,
    shooterId: "red-human",
    shooterTeam: "red",
    targetPlayerId: "red-human",
    weaponId: "grenade",
    damage: 60,
    radius: 90,
    hit: true
  });
  rejected = eventOf(result.payload, (event) => event.type === "projectile_impact" && event.projectileId === `${roomId}:proj:red:self`);
  assert(rejected?.accepted === false && rejected.reason === "self-hit", "self projectile_impact was not rejected");

  result = await postCombat({
    type: "projectile_impact",
    id: `${roomId}:proj:red:enemy:impact`,
    eventId: `${roomId}:proj:red:enemy:impact`,
    projectileId: `${roomId}:proj:red:enemy`,
    shooterId: "red-human",
    shooterTeam: "blue",
    targetPlayerId: "blue-support",
    weaponId: "he",
    damage: 62,
    radius: 130,
    hit: true
  });
  accepted = eventOf(result.payload, (event) => event.type === "projectile_impact" && event.projectileId === `${roomId}:proj:red:enemy`);
  assert(accepted?.accepted === true && accepted.reason === "confirmed", "enemy projectile_impact was not accepted");
  assert(accepted.shooterTeam === "red", "enemy projectile did not use server shooter team");

  result = await postCombat({
    type: "player_death",
    deathId: `${roomId}:death:red-support:same-team`,
    killerId: "red-human",
    shooterId: "red-human",
    targetPlayerId: "red-support",
    weaponId: "rpg",
    targetStateSeq: 6
  }, { allowError: true });
  assert(result.status === 403 && result.payload.reason === "same-team", "same-team death confirm was not rejected");
  room = await fetchRoom();
  assert(hp(room, "red-support") === 100, "same-team death changed friendly health");
  assert((stats(room, "red-human").kills || 0) === 0, "same-team death polluted killer stats");
  assert((stats(room, "red-support").deaths || 0) === 0, "same-team death polluted target deaths");

  result = await postCombat({
    type: "small_arms",
    shotId: `${roomId}:shot:red:lethal`,
    eventId: `${roomId}:shot:red:lethal`,
    hitId: `${roomId}:hit:red:lethal`,
    shooterId: "red-human",
    targetPlayerId: "blue-human",
    weaponId: "sniper",
    damage: 90,
    hit: true,
    targetStateSeq: 10,
    shooterStateSeq: 8
  });
  accepted = eventOf(result.payload, (event) => event.type === "server_hit_confirm" && event.hitId === `${roomId}:hit:red:lethal`);
  assert(accepted?.accepted === true && accepted.lethal === true, "valid lethal hit was not confirmed");
  room = await fetchRoom();
  assert(hp(room, "blue-human") === 0, "valid lethal hit did not down target");
  assert((stats(room, "red-human").kills || 0) === 1, "valid lethal hit did not increment killer stats once");
  assert((stats(room, "blue-human").deaths || 0) === 1, "valid lethal hit did not increment target deaths once");
  assert(combatEvents(room, (event) => event.type === "server_death_confirm").length === 1, "unexpected death confirm count");

  result = await postCombat({
    type: "player_respawn",
    respawnId: `${roomId}:respawn:blue-human:11`,
    playerId: "blue-human",
    targetPlayerId: "blue-human",
    hp: 100,
    maxHp: 100,
    stateSeq: 11,
    x: 1220,
    y: 1420
  });
  assert(result.payload.ok, "valid respawn was rejected");
  room = await fetchRoom();
  assert(hp(room, "blue-human") === 100, "respawn did not restore health");

  return room;
}

async function main() {
  staticValidation();
  const server = spawn(process.execPath, ["tools/static-server.cjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      IRONLINE_DATA_DIR: tempDir,
      IRONLINE_ROOMS_FILE: roomsFile
    },
    stdio: ["ignore", "ignore", "pipe"]
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  try {
    const build = await waitForServer();
    const room = await dynamicValidation();
    const summary = {
      ok: true,
      mode: "API replay + static full-path guards",
      realPlay: false,
      build: build.build || { commit: build.commit || "", branch: build.branch || "" },
      roomId,
      checks: {
        aiTargetingUsesActualTeam: "pass",
        safeZoneUsesActualPlayerTeam: "pass",
        smallArmsSameTeamServerReject: "pass",
        projectileLaunchSameTeamReject: "pass",
        projectileImpactSameTeamReject: "pass",
        localExplosionUsesActualPlayerTeam: "pass",
        onlineProjectileClientRejectsSameTeam: "pass",
        vehicleContactSameTeamGuard: "pass",
        killDeathRespawnStatsUnpolluted: "pass"
      },
      finalStats: {
        redHuman: stats(room, "red-human"),
        redSupport: stats(room, "red-support"),
        blueHuman: stats(room, "blue-human")
      }
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_error) {
      // Best-effort cleanup for temp API replay state.
    }
  }

  if (stderr.trim()) {
    process.stderr.write(stderr);
  }
}

main().catch((error) => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_cleanupError) {
    // Best-effort cleanup for temp API replay state.
  }
  console.error(error.stack || error.message);
  process.exit(1);
});
