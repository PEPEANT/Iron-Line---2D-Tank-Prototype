"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.IRONLINE_P0_LOAD_PORT || 4217);
const baseUrl = `http://127.0.0.1:${port}`;
const roomsFile = path.join(root, ".data", `p0-http-combat-load-${process.pid}.json`);
const roomRegistrySource = fs.readFileSync(path.join(root, "src", "systems", "room-registry.js"), "utf8");

process.env.PORT = String(port);
process.env.HOST = "127.0.0.1";
process.env.IRONLINE_ROOMS_FILE = roomsFile;

let activeMetrics = null;
const originalWriteFileSync = fs.writeFileSync.bind(fs);
const originalRenameSync = fs.renameSync.bind(fs);

function isRoomsPersistPath(value) {
  const text = String(value || "");
  if (!text) return false;
  const resolved = path.resolve(text);
  return resolved === roomsFile || resolved === `${roomsFile}.tmp`;
}

fs.writeFileSync = function instrumentedWriteFileSync(file, data, ...rest) {
  if (activeMetrics && isRoomsPersistPath(file)) {
    const bytes = Buffer.isBuffer(data)
      ? data.length
      : Buffer.byteLength(String(data || ""), typeof rest[0] === "string" ? rest[0] : "utf8");
    activeMetrics.fs.writeFileSync += 1;
    activeMetrics.fs.writeBytes += bytes;
  }
  return originalWriteFileSync(file, data, ...rest);
};

fs.renameSync = function instrumentedRenameSync(from, to) {
  if (activeMetrics && (isRoomsPersistPath(from) || isRoomsPersistPath(to))) {
    activeMetrics.fs.renameSync += 1;
  }
  return originalRenameSync(from, to);
};

require(path.join(root, "tools", "static-server.cjs"));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`${options.method || "GET"} ${pathname} returned ${response.statusCode}: ${raw}`));
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
      await sleep(220);
    }
  }
  throw new Error("Static server did not expose /api/build in time.");
}

function endpointKey(method, pathname) {
  if (method === "GET" && pathname === "/api/rooms") return "GET /api/rooms";
  if (method === "GET" && /^\/api\/rooms\/[^/]+$/.test(pathname)) return "GET /api/rooms/:id";
  if (method === "POST" && /^\/api\/rooms\/[^/]+\/participants$/.test(pathname)) return "POST /participants";
  if (method === "POST" && /^\/api\/rooms\/[^/]+\/combat$/.test(pathname)) return "POST /combat";
  if (method === "POST" && pathname === "/api/rooms") return "POST /api/rooms";
  if (method === "DELETE" && /^\/api\/rooms\/[^/]+$/.test(pathname)) return "DELETE /api/rooms/:id";
  return `${method} ${pathname}`;
}

function createMetrics(name) {
  return {
    name,
    startedAt: Date.now(),
    http: new Map(),
    fs: {
      writeFileSync: 0,
      renameSync: 0,
      writeBytes: 0
    },
    localStorage: {
      setItem: 0,
      removeItem: 0,
      bytes: 0,
      byClient: {}
    },
    ws: {
      sent: {},
      received: {}
    },
    roomShapes: {},
    errors: []
  };
}

function recordHttp(metrics, entry) {
  const key = endpointKey(entry.method, entry.pathname);
  const current = metrics.http.get(key) || {
    count: 0,
    bytesTotal: 0,
    bytesMax: 0,
    msTotal: 0,
    msMax: 0,
    statuses: {}
  };
  current.count += 1;
  current.bytesTotal += entry.bytes;
  current.bytesMax = Math.max(current.bytesMax, entry.bytes);
  current.msTotal += entry.ms;
  current.msMax = Math.max(current.msMax, entry.ms);
  current.statuses[entry.status] = (current.statuses[entry.status] || 0) + 1;
  metrics.http.set(key, current);
}

function recordRoomShape(metrics, key, payload) {
  if (Array.isArray(payload?.rooms)) {
    const rooms = payload.rooms;
    metrics.roomShapes[key] = { roomsReturned: true, rooms: rooms.length, summaries: rooms.filter((room) => room?.summary).length, firstHasPlayers: Object.prototype.hasOwnProperty.call(rooms[0] || {}, "players"), firstHasCombatEvents: Object.prototype.hasOwnProperty.call(rooms[0] || {}, "combatEvents"), firstHasWorldState: Object.prototype.hasOwnProperty.call(rooms[0] || {}, "worldState"), firstHasChat: Object.prototype.hasOwnProperty.call(rooms[0] || {}, "chat"), firstHasCommands: Object.prototype.hasOwnProperty.call(rooms[0] || {}, "commands") };
    return;
  }
  const room = payload?.room || null;
  if (!room) {
    metrics.roomShapes[key] = { roomReturned: false, hasEvents: Array.isArray(payload?.events), events: Array.isArray(payload?.events) ? payload.events.length : null, roomId: payload?.roomId || "" };
    return;
  }
  metrics.roomShapes[key] = {
    roomReturned: true,
    hasPlayers: Object.prototype.hasOwnProperty.call(room, "players"),
    players: Array.isArray(room.players) ? room.players.length : null,
    hasCombatEvents: Object.prototype.hasOwnProperty.call(room, "combatEvents"),
    combatEvents: Array.isArray(room.combatEvents) ? room.combatEvents.length : null,
    hasWorldState: Object.prototype.hasOwnProperty.call(room, "worldState"),
    worldStateIncluded: room.worldState !== undefined
  };
}

async function countedFetch(clientName, input, options = {}) {
  const url = new URL(String(input), baseUrl);
  const method = String(options.method || "GET").toUpperCase();
  const started = performance.now();
  const response = await fetch(url, options);
  const raw = Buffer.from(await response.arrayBuffer());
  const text = raw.toString("utf8");
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch (_error) {
      parsed = null;
    }
  }
  if (activeMetrics) {
    recordHttp(activeMetrics, {
      clientName,
      method,
      pathname: url.pathname,
      status: response.status,
      bytes: raw.length,
      ms: performance.now() - started
    });
    recordRoomShape(activeMetrics, endpointKey(method, url.pathname), parsed);
  }
  return {
    ok: response.ok,
    status: response.status,
    json: async () => parsed || {},
    text: async () => text
  };
}

function recordStorage(metrics, clientName, type, key, value = "") {
  if (!metrics) return;
  metrics.localStorage[type] += 1;
  if (type === "setItem") metrics.localStorage.bytes += Buffer.byteLength(String(value || ""), "utf8");
  const client = metrics.localStorage.byClient[clientName] || { setItem: 0, removeItem: 0, bytes: 0 };
  client[type] += 1;
  if (type === "setItem") client.bytes += Buffer.byteLength(String(value || ""), "utf8");
  metrics.localStorage.byClient[clientName] = client;
}

function createBrowserClient(clientName) {
  const storage = new Map();
  const timeouts = new Set();
  const intervals = new Set();
  const context = {
    console,
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    URLSearchParams,
    location: {
      protocol: "http:",
      hostname: "127.0.0.1",
      search: `?roomsApi=${baseUrl}`
    },
    localStorage: {
      getItem(key) {
        return storage.has(String(key)) ? storage.get(String(key)) : null;
      },
      setItem(key, value) {
        storage.set(String(key), String(value));
        recordStorage(activeMetrics, clientName, "setItem", key, value);
      },
      removeItem(key) {
        storage.delete(String(key));
        recordStorage(activeMetrics, clientName, "removeItem", key, "");
      }
    },
    fetch(input, options) {
      return countedFetch(clientName, input, options);
    },
    setTimeout(fn, ms, ...args) {
      const id = setTimeout(fn, ms, ...args);
      timeouts.add(id);
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
      clearTimeout(id);
    },
    setInterval(fn, ms, ...args) {
      const id = setInterval(fn, ms, ...args);
      intervals.add(id);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
      clearInterval(id);
    },
    CustomEvent: function CustomEvent(type, init = {}) {
      return { type, detail: init.detail };
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
    IronLine: {}
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(roomRegistrySource, context, { filename: "src/systems/room-registry.js" });
  return {
    name: clientName,
    registry: context.IronLine.roomRegistry,
    destroy() {
      for (const id of timeouts) clearTimeout(id);
      for (const id of intervals) clearInterval(id);
      timeouts.clear();
      intervals.clear();
    }
  };
}

function playerState(id, team, slotId, seq, now, offset = 0) {
  const baseX = team === "blue" ? 1200 : 1620;
  const baseY = team === "blue" ? 1400 : 1420;
  return {
    id,
    name: team === "blue" ? "Blue" : "Red",
    nickname: team === "blue" ? "Blue" : "Red",
    team,
    slotId,
    roleId: slotId.includes("armor") ? "armor" : "infantry",
    participantType: "player",
    ready: true,
    host: team === "blue",
    stats: { kills: 0, deaths: 0 },
    updatedAt: now,
    position: {
      x: baseX + Math.round(Math.sin(seq / 4) * 24) + offset,
      y: baseY + Math.round(Math.cos(seq / 5) * 18),
      stateSeq: seq,
      stateUpdatedAt: now,
      alive: true,
      deathState: "alive",
      hp: 100,
      maxHp: 100,
      weaponId: team === "blue" ? "rifle" : "machinegun",
      movementState: "moving",
      angle: team === "blue" ? 0 : Math.PI,
      aimX: team === "blue" ? 1620 : 1200,
      aimY: 1400,
      updatedAt: now
    }
  };
}

async function seedRoom(roomId) {
  const now = Date.now();
  const room = {
    id: roomId,
    name: "P0 Load Probe",
    mode: "annihilation",
    phase: "playing",
    locked: true,
    capacity: 8,
    blueFactionId: "korea",
    redFactionId: "russia",
    players: [
      playerState("p0-blue", "blue", "blue-infantry", 1, now),
      playerState("p0-red", "red", "red-infantry", 1, now)
    ],
    spectators: [],
    admins: [],
    chat: [],
    events: [{ id: `${roomId}:start`, type: "room_started", createdAt: now }],
    commands: [],
    combatEvents: [],
    worldState: {
      roomId,
      hostId: "p0-blue",
      updatedAt: now,
      tick: 0,
      vehicles: [],
      units: [],
      capturePoints: []
    },
    updatedAt: now
  };
  await requestJson("/api/rooms", { method: "POST", body: room });
}

function startRepeater(fn, ms, timers) {
  let inFlight = false;
  const run = () => {
    if (inFlight) return;
    inFlight = true;
    Promise.resolve()
      .then(fn)
      .catch((error) => {
        if (activeMetrics) activeMetrics.errors.push(error.message || String(error));
      })
      .finally(() => {
        inFlight = false;
      });
  };
  run();
  const id = setInterval(run, ms);
  timers.push(id);
}

function recordWs(metrics, direction, type) {
  const target = metrics?.ws?.[direction];
  if (!target || !type) return;
  target[type] = (target[type] || 0) + 1;
}

function openWsProbe(roomId, metrics, options = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const sentTimers = [];
  ws.on("message", (raw) => {
    let message = null;
    try {
      message = JSON.parse(raw.toString());
    } catch (_error) {
      return;
    }
    recordWs(metrics, "received", message.type);
    if (message.type === "hello") {
      const join = {
        type: "join",
        roomId,
        playerId: options.playerId || "ws-admin",
        nickname: options.nickname || "Observer",
        participantType: options.participantType || "admin"
      };
      recordWs(metrics, "sent", join.type);
      ws.send(JSON.stringify(join));
    }
    if (message.type === "join_result" && options.adminSnapshotIntervalMs) {
      const id = setInterval(() => {
        const packet = { type: "admin_snapshot" };
        recordWs(metrics, "sent", packet.type);
        ws.send(JSON.stringify(packet));
      }, options.adminSnapshotIntervalMs);
      sentTimers.push(id);
    }
  });
  return {
    close() {
      for (const id of sentTimers) clearInterval(id);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    }
  };
}

async function runScenario(definition, index) {
  const roomId = `P0LOAD-${Date.now()}-${index}`;
  await seedRoom(roomId);

  const blue = createBrowserClient(`${definition.name}:blue`);
  const red = createBrowserClient(`${definition.name}:red`);
  const clients = [blue, red];
  let admin = null;
  if (definition.admin) {
    admin = createBrowserClient(`${definition.name}:admin`);
    clients.push(admin);
  }

  await sleep(450);
  await Promise.all(clients.map((client) => client.registry.refreshRemoteRooms?.()));
  await sleep(200);

  const metrics = createMetrics(definition.name);
  activeMetrics = metrics;
  const timers = [];
  const wsProbes = [];
  let blueSeq = 10;
  let redSeq = 10;
  let shotSeq = 0;
  let projectileSeq = 0;

  startRepeater(() => {
    blueSeq += 1;
    return blue.registry.addOrUpdatePlayer(roomId, playerState("p0-blue", "blue", "blue-infantry", blueSeq, Date.now()));
  }, 180, timers);
  startRepeater(() => {
    redSeq += 1;
    return red.registry.addOrUpdatePlayer(roomId, playerState("p0-red", "red", "red-infantry", redSeq, Date.now(), 12));
  }, 180, timers);

  if (definition.smallArmsEveryMs) {
    startRepeater(() => {
      shotSeq += 1;
      const blueShoots = shotSeq % 2 === 1;
      const shooter = blueShoots ? blue : red;
      const shooterId = blueShoots ? "p0-blue" : "p0-red";
      const targetId = blueShoots ? "p0-red" : "p0-blue";
      const shooterTeam = blueShoots ? "blue" : "red";
      const targetSeq = blueShoots ? redSeq : blueSeq;
      const eventId = `${roomId}:shot:${shotSeq}`;
      return shooter.registry.pushCombatEvent(roomId, {
        id: eventId,
        eventId,
        shotId: eventId,
        hitId: `${eventId}:hit:${targetId}`,
        sequence: shotSeq,
        type: "small_arms",
        shooterId,
        shooterName: blueShoots ? "Blue" : "Red",
        shooterTeam,
        targetPlayerId: targetId,
        weaponId: blueShoots ? "rifle" : "machinegun",
        damage: 1,
        hit: true,
        targetStateSeq: targetSeq,
        shooterStateSeq: blueShoots ? blueSeq : redSeq,
        x1: blueShoots ? 1200 : 1620,
        y1: 1400,
        x2: blueShoots ? 1620 : 1200,
        y2: 1400,
        hitX: blueShoots ? 1620 : 1200,
        hitY: 1400,
        createdAt: Date.now()
      });
    }, definition.smallArmsEveryMs, timers);
  }

  if (definition.projectileEveryMs) {
    startRepeater(() => {
      projectileSeq += 1;
      const blueShoots = projectileSeq % 2 === 1;
      const shooter = blueShoots ? blue : red;
      const shooterId = blueShoots ? "p0-blue" : "p0-red";
      const shooterTeam = blueShoots ? "blue" : "red";
      const projectileId = `${roomId}:proj:${projectileSeq}`;
      shooter.registry.pushCombatEvent(roomId, {
        id: `${projectileId}:launch`,
        eventId: `${projectileId}:launch`,
        sequence: projectileSeq,
        type: "projectile_launch",
        projectileId,
        shooterId,
        shooterName: blueShoots ? "Blue" : "Red",
        shooterTeam,
        weaponId: "rpg",
        damageCause: "rpg",
        damage: 12,
        radius: 90,
        x1: blueShoots ? 1200 : 1620,
        y1: 1400,
        x2: blueShoots ? 1620 : 1200,
        y2: 1400,
        vx: blueShoots ? 560 : -560,
        vy: 0,
        speed: 560,
        createdAt: Date.now()
      });
      setTimeout(() => {
        shooter.registry.pushCombatEvent(roomId, {
          id: `${projectileId}:impact`,
          eventId: `${projectileId}:impact`,
          sequence: projectileSeq,
          type: "projectile_impact",
          projectileId,
          shooterId,
          shooterName: blueShoots ? "Blue" : "Red",
          shooterTeam,
          weaponId: "rpg",
          damageCause: "rpg",
          damage: 12,
          radius: 90,
          splash: 90,
          x1: blueShoots ? 1200 : 1620,
          y1: 1400,
          x2: blueShoots ? 1620 : 1200,
          y2: 1400,
          hitX: blueShoots ? 1620 : 1200,
          hitY: 1400,
          createdAt: Date.now()
        });
      }, 280);
    }, definition.projectileEveryMs, timers);
  }

  if (definition.admin && admin) {
    startRepeater(() => admin.registry.touchAdmin(roomId, {
      id: "p0-admin",
      name: "Admin"
    }), 5000, timers);
  }

  if (definition.wsAdminSnapshot) {
    wsProbes.push(openWsProbe(roomId, metrics, {
      playerId: "p0-ws-admin",
      nickname: "Admin WS",
      participantType: "admin",
      adminSnapshotIntervalMs: 1000
    }));
  }

  await sleep(10000);
  for (const id of timers) clearInterval(id);
  await sleep(850);
  for (const probe of wsProbes) probe.close();
  activeMetrics = null;

  const finalPayload = await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`);
  const finalRoom = finalPayload.room || null;
  await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" }).catch(() => null);
  for (const client of clients) client.destroy();

  return summarizeScenario(metrics, finalRoom);
}

function endpointSummary(metrics, key) {
  const item = metrics.http.get(key);
  if (!item) {
    return { count: 0, avgBytes: 0, maxBytes: 0, avgMs: 0, maxMs: 0, statuses: {} };
  }
  return {
    count: item.count,
    avgBytes: Math.round(item.bytesTotal / Math.max(1, item.count)),
    maxBytes: item.bytesMax,
    avgMs: Math.round((item.msTotal / Math.max(1, item.count)) * 10) / 10,
    maxMs: Math.round(item.msMax * 10) / 10,
    statuses: item.statuses
  };
}

function summarizeScenario(metrics, finalRoom) {
  const endpoints = {};
  for (const key of ["GET /api/rooms", "GET /api/rooms/:id", "POST /participants", "POST /combat", "POST /api/rooms"]) {
    endpoints[key] = endpointSummary(metrics, key);
  }
  return {
    scenario: metrics.name,
    durationSec: 10,
    measurement: "API replay, not live gameplay",
    endpoints,
    fs: metrics.fs,
    localStorage: metrics.localStorage,
    ws: metrics.ws,
    roomShapes: metrics.roomShapes,
    finalRoom: finalRoom ? {
      players: Array.isArray(finalRoom.players) ? finalRoom.players.length : 0,
      combatEvents: Array.isArray(finalRoom.combatEvents) ? finalRoom.combatEvents.length : 0,
      hasWorldState: Object.prototype.hasOwnProperty.call(finalRoom, "worldState"),
      worldStateIncluded: finalRoom.worldState !== undefined
    } : null,
    errors: metrics.errors.slice(0, 8)
  };
}

function printSummary(results) {
  console.log("");
  console.log("P0 HTTP participants/combat load probe");
  console.log("Measurement type: API replay, not live gameplay");
  console.log("");
  const rows = results.map((result) => ({
    scenario: result.scenario,
    getRooms: result.endpoints["GET /api/rooms"].count,
    getRoomDetail: result.endpoints["GET /api/rooms/:id"].count,
    participantPost: result.endpoints["POST /participants"].count,
    combatPost: result.endpoints["POST /combat"].count,
    postRooms: result.endpoints["POST /api/rooms"].count,
    participantAvgBytes: result.endpoints["POST /participants"].avgBytes,
    participantMaxBytes: result.endpoints["POST /participants"].maxBytes,
    roomDetailAvgBytes: result.endpoints["GET /api/rooms/:id"].avgBytes,
    roomDetailMaxBytes: result.endpoints["GET /api/rooms/:id"].maxBytes,
    combatAvgBytes: result.endpoints["POST /combat"].avgBytes,
    combatMaxBytes: result.endpoints["POST /combat"].maxBytes,
    persistWriteFileSync: result.fs.writeFileSync,
    persistRenameSync: result.fs.renameSync,
    localStorageSetItem: result.localStorage.setItem,
    finalCombatEvents: result.finalRoom?.combatEvents ?? null
  }));
  console.table(rows);
  console.log(JSON.stringify(results, null, 2));
}

async function main() {
  await waitForServer();
  const scenarios = [
    { name: "participant_only_10s" },
    { name: "small_arms_10s", smallArmsEveryMs: 125 },
    { name: "projectile_launch_impact_10s", projectileEveryMs: 900 },
    { name: "admin_snapshot_observer_10s", admin: true, smallArmsEveryMs: 250, wsAdminSnapshot: true }
  ];
  const results = [];
  for (let index = 0; index < scenarios.length; index += 1) {
    results.push(await runScenario(scenarios[index], index + 1));
  }
  printSummary(results);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    activeMetrics = null;
    try {
      if (fs.existsSync(roomsFile)) fs.unlinkSync(roomsFile);
      if (fs.existsSync(`${roomsFile}.tmp`)) fs.unlinkSync(`${roomsFile}.tmp`);
    } catch (_error) {
      // Best-effort cleanup for the dedicated load-probe room store.
    }
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  });
