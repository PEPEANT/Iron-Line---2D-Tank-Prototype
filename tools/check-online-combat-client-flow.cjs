"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_ONLINE_COMBAT_CLIENT_PORT || 4196);
const cdpPort = Number(process.env.IRONLINE_ONLINE_COMBAT_CLIENT_CDP_PORT || 9234);
const appUrl = `http://127.0.0.1:${appPort}/index.html?roomsApi=local`;
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const userDataDir = path.join(root, ".tmp-chrome-online-combat-client");

function requestJson(port, pathname, timeout = 1200) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port, path: pathname, timeout }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error(`${pathname} timed out`)));
  });
}

async function waitForApp() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 9000) {
    try {
      const build = await requestJson(appPort, "/api/build", 1200);
      if (build?.ok) return build;
    } catch (_error) {
      await new Promise((resolve) => setTimeout(resolve, 220));
    }
  }
  throw new Error("Static server did not expose /api/build in time.");
}

async function waitForCdpPage() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    try {
      const list = await requestJson(cdpPort, "/json/list", 1200);
      const page = list.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch (_error) {
      await new Promise((resolve) => setTimeout(resolve, 220));
    }
  }
  throw new Error("Chrome did not expose a CDP page in time.");
}

function connectCdp(webSocketDebuggerUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(webSocketDebuggerUrl);
    let sequence = 0;
    const pending = new Map();

    ws.on("open", () => {
      resolve({
        send(method, params = {}) {
          const id = ++sequence;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { res, rej, method }));
        },
        close() {
          ws.close();
        }
      });
    });

    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (!message.id) return;
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      if (message.error) item.rej(new Error(`${item.method}: ${message.error.message}`));
      else item.res(message.result);
    });

    ws.on("error", reject);
  });
}

async function evaluate(client, expression, timeout = 16000) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime exception";
    throw new Error(description);
  }
  return result.result.value;
}

const pageScenario = String.raw`
new Promise((resolve, reject) => {
  const waitForGame = () => new Promise((done, fail) => {
    const startedAt = Date.now();
    const tick = () => {
      if (window.IronLine?.game && window.IronLine?.roomRegistry && window.IronLine?.OnlineCombatStabilizer) return done(window.IronLine.game);
      if (Date.now() - startedAt > 8000) return fail(new Error("game or online combat helper missing"));
      setTimeout(tick, 100);
    };
    tick();
  });

  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  waitForGame().then((game) => {
    const roomId = "CLIENT-FLOW-" + Date.now();
    const now = Date.now();
    const TEAM = window.IronLine.TEAM || { BLUE: "blue", RED: "red" };
    const registry = window.IronLine.roomRegistry;

    registry.deleteRoom?.(roomId);
    registry.createRoom?.({
      id: roomId,
      name: "Online Combat Client Flow",
      mode: "annihilation",
      capacity: 8,
      blueFactionId: "korea",
      redFactionId: "russia"
    });

    game.sessionMode = "online";
    game.matchStarted = true;
    game.matchPhase = "live";
    game.lobbyOpen = false;
    game.deploymentOpen = false;
    game.result = null;
    game.playerDeathActive = false;
    game.playerDowned = false;
    game.onlineCombatSeenIds = new Set();
    game.onlineCombatAppliedHitIds = new Set();
    game.onlineCombatAppliedDeathIds = new Set();
    game.onlineCombatAppliedRespawnIds = new Set();
    game.onlineCombatAppliedKillIds = new Set();
    game.onlineCombatTrace = [];
    game.onlinePlayerStateSeq = 64;
    game.onlineLastRespawnAt = 0;
    game.onlineLastRespawnStateSeq = 0;

    game.onlineSession = game.onlineSession || {};
    Object.assign(game.onlineSession, {
      roomId,
      playerId: "blue-human",
      participantType: "player",
      hostId: "blue-human",
      players: [],
      spectators: []
    });

    game.player.team = TEAM.BLUE;
    game.player.x = 1200;
    game.player.y = 1400;
    game.player.hp = 100;
    game.player.maxHp = 100;
    game.player.alive = true;
    game.player.inTank = null;
    game.player.inVehicle = null;
    game.player.vx = 0;
    game.player.vy = 0;
    if (game.world) game.world.obstacles = [];
    if (game.effects?.smokeClouds) game.effects.smokeClouds.length = 0;

    const blue = {
      id: "blue-human",
      name: "Blue",
      team: "blue",
      slotId: "blue-infantry",
      roleId: "infantry",
      participantType: "player",
      ready: true,
      host: true,
      stats: { kills: 0, deaths: 0 },
      position: {
        x: 1200,
        y: 1400,
        angle: 0,
        aimX: 1600,
        aimY: 1400,
        alive: true,
        deathState: "alive",
        hp: 100,
        maxHp: 100,
        stateSeq: 64,
        stateUpdatedAt: now,
        updatedAt: now,
        weaponId: "rifle",
        movementState: "idle"
      }
    };
    const red = {
      id: "red-human",
      name: "Red",
      team: "red",
      slotId: "red-armor",
      roleId: "armor",
      participantType: "player",
      ready: true,
      stats: { kills: 0, deaths: 0 },
      position: {
        x: 1600,
        y: 1400,
        angle: Math.PI,
        aimX: 1200,
        aimY: 1400,
        alive: true,
        deathState: "alive",
        hp: 100,
        maxHp: 100,
        stateSeq: 22,
        stateUpdatedAt: now,
        updatedAt: now,
        weaponId: "machinegun",
        movementState: "idle"
      }
    };

    game.onlineSession.players = [blue, red];
    registry.addOrUpdatePlayer(roomId, blue);
    registry.addOrUpdatePlayer(roomId, red);

    const localPresenceSaved = game.hud?.sessionFlow?.publishLocalPlayer?.(game, { force: true }) !== false;
    const roomAfterPresence = registry.getRoom(roomId);
    const bluePresence = roomAfterPresence.players.find((player) => player.id === "blue-human");
    assert(localPresenceSaved, "local presence publish failed");
    assert(bluePresence?.position?.stateSeq >= 65, "local state sequence was not published");
    assert(bluePresence?.position?.hp === 100, "local health was not published");
    assert(bluePresence?.position?.weaponId, "local weapon state was not published");

    const originalRandom = Math.random;
    Math.random = () => 0;
    const shotEvent = game.publishOnlineGunShot({
      id: "rifle",
      range: 900,
      damageMin: 24,
      damageMax: 24,
      spread: 0,
      tracerLife: 0.1
    }, 1600, 1400, { aimed: true, extraHitRadius: 40 });
    Math.random = originalRandom;
    assert(shotEvent?.id, "local shot event was not published");
    assert(shotEvent.shooterId === "blue-human", "shot shooter id mismatch");
    assert(shotEvent.weaponId === "rifle", "shot weapon id mismatch");
    assert(shotEvent.sequence > 0, "shot sequence missing");
    assert(shotEvent.hitId || shotEvent.hit === false, "hit shot missing hit id");

    const delayedValidHit = {
      id: roomId + ":red-shot:delayed",
      eventId: roomId + ":red-shot:delayed",
      sequence: 2,
      hitId: roomId + ":red-hit:delayed",
      type: "small_arms",
      shooterId: "red-human",
      shooterName: "Red",
      shooterTeam: "red",
      targetPlayerId: "blue-human",
      weaponId: "machinegun",
      damageCause: "machinegun",
      damage: 25,
      hit: true,
      targetHealthBefore: 100,
      targetHealthAfter: 75,
      targetStateSeq: 20,
      x1: 1600,
      y1: 1400,
      x2: 1200,
      y2: 1400,
      hitX: 1200,
      hitY: 1400,
      createdAt: Date.now()
    };
    const hpBeforeDelayed = game.player.hp;
    const delayedApplied = game.applyOnlineCombatEvent(delayedValidHit);
    const hpAfterDelayed = game.player.hp;
    const duplicateApplied = game.applyOnlineCombatEvent({ ...delayedValidHit, id: delayedValidHit.id + ":dupe" });
    assert(delayedApplied === true, "delayed valid hit was incorrectly rejected as stale");
    assert(hpAfterDelayed < hpBeforeDelayed, "delayed valid hit did not damage local player");
    assert(duplicateApplied === false, "duplicate hit was applied twice");
    assert(game.player.hp === hpAfterDelayed, "duplicate hit changed player health");

    game.player.hp = 18;
    game.playerDeathActive = false;
    game.playerDowned = false;
    const lethalEvent = {
      ...delayedValidHit,
      id: roomId + ":red-shot:lethal",
      eventId: roomId + ":red-shot:lethal",
      hitId: roomId + ":red-hit:lethal",
      damage: 80,
      targetHealthBefore: 18,
      targetHealthAfter: 0,
      targetStateSeq: game.onlinePlayerStateSeq,
      createdAt: Date.now() + 1
    };
    const lethalApplied = game.applyOnlineCombatEvent(lethalEvent);
    const deathEvents = (registry.getRoom(roomId)?.combatEvents || []).filter((event) => event.type === "player_death" && event.targetPlayerId === "blue-human");
    assert(lethalApplied === true, "lethal hit was not applied");
    assert(game.playerDeathActive === true || game.player.hp <= 0, "local player did not enter death state");
    assert(deathEvents.length === 1, "lethal hit did not publish exactly one death event");
    assert(deathEvents[0].killerId === "red-human", "death event killer id mismatch");

    const killsBefore = game.ensureScoreboardStats("blue-human").kills;
    const remoteDeath = {
      id: roomId + ":death:red:1",
      eventId: roomId + ":death:red:1",
      type: "player_death",
      deathId: roomId + ":death:red",
      shooterId: "blue-human",
      killerId: "blue-human",
      shooterName: "Blue",
      shooterTeam: "blue",
      targetPlayerId: "red-human",
      weaponId: "rifle",
      damageCause: "rifle",
      lethal: true,
      targetHealthBefore: 24,
      targetHealthAfter: 0,
      targetStateSeq: 22,
      createdAt: Date.now() + 2
    };
    const remoteDeathApplied = game.applyOnlinePlayerDeathEvent(remoteDeath);
    const remoteDeathDuplicate = game.applyOnlinePlayerDeathEvent({ ...remoteDeath, id: roomId + ":death:red:2" });
    const killsAfter = game.ensureScoreboardStats("blue-human").kills;
    const redAfterDeath = game.sessionPlayerById?.("red-human");
    assert(remoteDeathApplied === true, "remote death was not applied");
    assert(remoteDeathDuplicate === false, "duplicate remote death applied twice");
    assert(killsAfter === killsBefore + 1, "local kill stat did not increment exactly once");
    assert(redAfterDeath?.alive === false || redAfterDeath?.position?.alive === false, "remote target was not marked dead");
    const redAliveAfterDeath = redAfterDeath?.alive;

    const remoteRespawn = {
      id: roomId + ":respawn:red:1",
      eventId: roomId + ":respawn:red:1",
      type: "player_respawn",
      respawnId: roomId + ":respawn:red",
      shooterId: "red-human",
      shooterName: "Red",
      shooterTeam: "red",
      targetPlayerId: "red-human",
      targetHealthAfter: 100,
      targetStateSeq: 30,
      x2: 1700,
      y2: 1450,
      hitX: 1700,
      hitY: 1450,
      createdAt: Date.now() + 3
    };
    const remoteRespawnApplied = game.applyOnlinePlayerRespawnEvent(remoteRespawn);
    const remoteRespawnDuplicate = game.applyOnlinePlayerRespawnEvent({ ...remoteRespawn, id: roomId + ":respawn:red:2" });
    const redAfterRespawn = game.sessionPlayerById?.("red-human");
    assert(remoteRespawnApplied === true, "remote respawn was not applied");
    assert(remoteRespawnDuplicate === false, "duplicate remote respawn applied twice");
    assert(redAfterRespawn?.alive === true && redAfterRespawn?.position?.hp === 100, "remote respawn state mismatch");
    assert(redAfterRespawn?.position?.x === 1700 && redAfterRespawn?.position?.stateSeq === 30, "remote respawn position / seq mismatch");

    game.player.hp = 100;
    game.player.alive = true;
    game.playerDeathActive = false;
    game.playerDowned = false;
    const localRespawn = game.publishOnlinePlayerRespawn();
    assert(localRespawn?.respawnId, "local respawn event was not published");
    assert(game.onlineLastRespawnStateSeq === game.onlinePlayerStateSeq, "last respawn state sequence was not recorded");
    const staleAfterRespawn = {
      ...delayedValidHit,
      id: roomId + ":red-shot:stale-after-respawn",
      eventId: roomId + ":red-shot:stale-after-respawn",
      hitId: roomId + ":red-hit:stale-after-respawn",
      targetStateSeq: game.onlineLastRespawnStateSeq - 1,
      createdAt: localRespawn.createdAt - 100
    };
    const hpBeforeStale = game.player.hp;
    const staleApplied = game.applyOnlineCombatEvent(staleAfterRespawn);
    assert(staleApplied === false, "stale pre-respawn hit was applied");
    assert(game.player.hp === hpBeforeStale, "stale pre-respawn hit changed health");

    const traceStages = (game.onlineCombatTrace || []).map((entry) => (
      String(entry.stage || "") + ":" + String(entry.result || "") + ":" + String(entry.reason || "")
    ));
    const room = registry.getRoom(roomId);
    const localShotRecord = (room?.combatEvents || []).find((event) => event.id === shotEvent.id);
    const localRespawnRecord = (room?.combatEvents || []).find((event) => event.respawnId === localRespawn.respawnId);
    assert(!localShotRecord?.killerId, "non-lethal shot carried a killer id");
    assert(!localRespawnRecord?.killerId, "respawn event carried a killer id");
    const result = {
      roomId,
      localPresence: {
        stateSeq: bluePresence.position.stateSeq,
        hp: bluePresence.position.hp,
        weaponId: bluePresence.position.weaponId,
        aimX: bluePresence.position.aimX,
        aimY: bluePresence.position.aimY
      },
      shot: {
        id: shotEvent.id,
        hit: shotEvent.hit,
        hitId: shotEvent.hitId || "",
        sequence: shotEvent.sequence,
        targetPlayerId: shotEvent.targetPlayerId || ""
      },
      hit: {
        delayedApplied,
        duplicateApplied,
        hpBefore: hpBeforeDelayed,
        hpAfter: hpAfterDelayed
      },
      death: {
        lethalApplied,
        deathEvents: deathEvents.length,
        killerId: deathEvents[0]?.killerId || "",
        remoteDeathApplied,
        remoteDeathDuplicate,
        killsBefore,
        killsAfter,
        redAliveAfterDeath
      },
      respawn: {
        remoteRespawnApplied,
        remoteRespawnDuplicate,
        redHpAfterRespawn: redAfterRespawn?.position?.hp,
        redStateSeqAfterRespawn: redAfterRespawn?.position?.stateSeq,
        localRespawnId: localRespawn.respawnId,
        lastRespawnStateSeq: game.onlineLastRespawnStateSeq,
        staleApplied,
        hpAfterStale: game.player.hp
      },
      traces: traceStages.slice(-18),
      combatEvents: (room?.combatEvents || []).map((event) => ({
        type: event.type,
        id: event.id,
        hitId: event.hitId || "",
        deathId: event.deathId || "",
        respawnId: event.respawnId || "",
        targetPlayerId: event.targetPlayerId || "",
        killerId: event.killerId || "",
        damageCause: event.damageCause || ""
      })),
      pass: true
    };
    resolve(result);
  }).catch(reject);
})
`;

async function main() {
  fs.mkdirSync(userDataDir, { recursive: true });
  const server = spawn(process.execPath, ["tools/static-server.cjs", String(appPort)], {
    cwd: root,
    stdio: "ignore",
    env: {
      ...process.env,
      PORT: String(appPort),
      IRONLINE_ROOMS_FILE: path.join(root, ".data", `online-combat-client-${process.pid}.json`)
    }
  });
  const chrome = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--no-first-run",
    "--disable-extensions",
    appUrl
  ], {
    stdio: "ignore"
  });

  let client = null;
  try {
    const build = await waitForApp();
    const page = await waitForCdpPage();
    client = await connectCdp(page.webSocketDebuggerUrl);
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    const scenario = await evaluate(client, pageScenario, 20000);
    const result = {
      ok: Boolean(scenario.pass),
      url: appUrl,
      build: {
        commit: build.commit || "",
        branch: build.branch || ""
      },
      ...scenario
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    if (client) client.close();
    chrome.kill();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
