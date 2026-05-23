"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_P0_STUTTER_PORT || 4357);
const baseUrl = `http://127.0.0.1:${appPort}`;
const roomsFile = path.join(root, ".data", `p0-stutter-${process.pid}.json`);
const reportsRoot = path.join(root, "reports", "playtests");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const reportDir = path.join(reportsRoot, `p0-9a-stutter-${stamp}`);
const chromePath = process.env.CHROME_PATH || [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].find((item) => fs.existsSync(item));

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}
function stat(values = []) {
  const list = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const total = list.reduce((sum, value) => sum + value, 0);
  const at = (pct) => list[Math.min(list.length - 1, Math.floor(list.length * pct))] || 0;
  return { count: list.length, avg: round(total / Math.max(1, list.length)), p95: round(at(0.95)), max: round(list[list.length - 1] || 0) };
}
function requestJson(pathname, options = {}) {
  const body = options.body ? JSON.stringify(options.body) : "";
  return new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}${pathname}`, {
      method: options.method || "GET",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
      timeout: options.timeout || 7000
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
async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try { if ((await requestJson("/api/build", { timeout: 1000 })).ok) return; } catch (_error) {}
    await sleep(200);
  }
  throw new Error("static server did not start");
}
function cdpJson(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${pathname}`, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => { try { resolve(JSON.parse(raw)); } catch (error) { reject(error); } });
    }).on("error", reject);
  });
}
async function waitForTarget(port) {
  for (let i = 0; i < 60; i += 1) {
    try {
      const page = (await cdpJson(port, "/json/list")).find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (_error) {}
    await sleep(200);
  }
  throw new Error(`Chrome target ${port} did not start`);
}

class CdpPage {
  constructor(name, port, wsUrl, child, profileDir) {
    this.name = name;
    this.port = port;
    this.child = child;
    this.profileDir = profileDir;
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.requests = new Map();
    this.metrics = freshMetrics();
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
      this.ws.on("message", (raw) => this.onMessage(raw));
    });
    await this.send("Network.enable");
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    await this.send("Log.enable");
    this.on("Network.requestWillBeSent", (p) => this.requests.set(p.requestId, { method: p.request.method, url: p.request.url, status: 0 }));
    this.on("Network.responseReceived", (p) => {
      const item = this.requests.get(p.requestId) || {};
      item.url = p.response.url;
      item.status = p.response.status;
      this.requests.set(p.requestId, item);
    });
    this.on("Network.loadingFinished", (p) => {
      const item = this.requests.get(p.requestId);
      if (item) recordHttp(this.metrics, item.method, item.url, p.encodedDataLength || 0, item.status);
    });
    this.on("Runtime.exceptionThrown", (p) => this.metrics.errors.push(p.exceptionDetails?.text || "runtime_exception"));
    this.on("Log.entryAdded", (p) => { if (["error", "warning"].includes(p.entry?.level)) this.metrics.errors.push(p.entry.text); });
  }
  onMessage(raw) {
    const msg = JSON.parse(raw.toString());
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result || {});
      return;
    }
    for (const handler of this.handlers.get(msg.method) || []) handler(msg.params || {});
  }
  on(method, handler) {
    const list = this.handlers.get(method) || [];
    list.push(handler);
    this.handlers.set(method, list);
  }
  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "evaluate failed");
    return result.result?.value;
  }
  async navigate(url) {
    await this.send("Page.navigate", { url });
    await waitForExpression(this, "document.readyState === 'complete' && !!window.IronLine?.roomRegistry", 12000);
  }
  resetMetrics() {
    this.metrics = freshMetrics();
    this.requests.clear();
  }
  async close() {
    try { this.ws.close(); } catch (_error) {}
    try { this.child.kill(); } catch (_error) {}
    await sleep(250);
    try { fs.rmSync(this.profileDir, { recursive: true, force: true }); } catch (_error) {}
  }
}

function freshMetrics() { return { http: new Map(), errors: [] }; }
function endpointKey(method, url) {
  let pathname = "";
  try { pathname = new URL(url).pathname; } catch (_error) { return ""; }
  if (method === "GET" && pathname === "/api/rooms") return "GET /api/rooms";
  if (method === "GET" && /^\/api\/rooms\/[^/]+$/.test(pathname)) return "GET /api/rooms/:id";
  if (method === "POST" && /^\/api\/rooms\/[^/]+\/participants$/.test(pathname)) return "POST /participants";
  if (method === "POST" && /^\/api\/rooms\/[^/]+\/combat$/.test(pathname)) return "POST /combat";
  if (method === "POST" && pathname === "/api/rooms") return "POST /api/rooms";
  return "";
}
function recordHttp(metrics, method, url, bytes, status) {
  const key = endpointKey(method, url);
  if (!key) return;
  const item = metrics.http.get(key) || { count: 0, bytesTotal: 0, bytesMax: 0, statuses: {} };
  item.count += 1;
  item.bytesTotal += bytes;
  item.bytesMax = Math.max(item.bytesMax, bytes);
  item.statuses[status] = (item.statuses[status] || 0) + 1;
  metrics.http.set(key, item);
}
function httpSummary(metrics, key) {
  const item = metrics.http.get(key);
  return item ? { count: item.count, avgBytes: Math.round(item.bytesTotal / item.count), maxBytes: item.bytesMax, statuses: item.statuses } : { count: 0, avgBytes: 0, maxBytes: 0, statuses: {} };
}
async function waitForExpression(page, expression, timeoutMs = 9000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { if (await page.eval(`Boolean(${expression})`)) return true; } catch (_error) {}
    await sleep(160);
  }
  throw new Error(`${page.name} timed out waiting for ${expression}`);
}
function browserArgs(debugPort, profileDir) {
  return [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "about:blank"];
}
async function launchPage(name, debugPort, originHost) {
  const profileDir = path.join(os.tmpdir(), `iron-line-stutter-${name}-${process.pid}`);
  fs.rmSync(profileDir, { recursive: true, force: true });
  const child = spawn(chromePath, browserArgs(debugPort, profileDir), { stdio: "ignore", windowsHide: true });
  const page = new CdpPage(name, debugPort, await waitForTarget(debugPort), child, profileDir);
  await page.open();
  await page.navigate(`http://${originHost}:${appPort}/index.html?roomsApi=${encodeURIComponent(baseUrl)}`);
  await installProbe(page);
  return page;
}
async function installProbe(page) {
  await page.eval(`(() => {
    window.__p0StutterIntervals = window.__p0StutterIntervals || [];
    window.__p0StutterSockets = window.__p0StutterSockets || [];
    window.__p0WsRemoteStates = window.__p0WsRemoteStates || {};
    if (!Storage.prototype.__p0StutterWrapped) {
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        const p = window.__p0StutterProbe;
        if (p) { p.storageSetItem += 1; p.storageBytes += String(value || "").length; }
        return originalSet.call(this, key, value);
      };
      Storage.prototype.__p0StutterWrapped = true;
    }
    window.__p0StutterPatchRegistry = function() {
      const registry = window.IronLine?.roomRegistry;
      if (!registry || registry.__p0StutterPatched) return;
      const originalMerge = registry.mergeCombatEventWindow?.bind(registry);
      if (originalMerge) {
        registry.mergeCombatEventWindow = function(previous, incoming) {
          const before = Array.isArray(previous) ? previous.length : 0;
          const incomingCount = Array.isArray(incoming) ? incoming.length : 0;
          const result = originalMerge(previous, incoming);
          const added = Math.max(0, (Array.isArray(result) ? result.length : 0) - before);
          const p = window.__p0StutterProbe;
          if (p) {
            p.combatMergeCalls += 1;
            p.combatMergeIncoming += incomingCount;
            p.combatMergeAdded += added;
            p.combatMergeDuplicates += Math.max(0, incomingCount - added);
          }
          return result;
        };
      }
      const originalRefresh = registry.refreshRemoteRooms?.bind(registry);
      if (originalRefresh) {
        registry.refreshRemoteRooms = async function(...args) {
          const started = performance.now();
          try { return await originalRefresh(...args); }
          finally {
            const p = window.__p0StutterProbe;
            if (p) { p.refreshRemoteRooms += 1; p.refreshRemoteRoomsMs.push(performance.now() - started); }
          }
        };
      }
      registry.__p0StutterPatched = true;
    };
    window.__p0StutterReset = function() {
      window.__p0WsRemoteStates = {};
      window.__p0StutterProbe = {
        frames: [], storageSetItem: 0, storageBytes: 0, errors: [], refreshRemoteRooms: 0, refreshRemoteRoomsMs: [],
        combatMergeCalls: 0, combatMergeIncoming: 0, combatMergeAdded: 0, combatMergeDuplicates: 0,
        remote: { samples: 0, missing: 0, updates: 0, gapMs: [], snapPx: [], ageMs: [], stale500: 0, stale1000: 0, localAgeMs: [], lastStateSeq: 0 }
      };
      window.onerror = (m) => window.__p0StutterProbe.errors.push(String(m));
      window.onunhandledrejection = (e) => window.__p0StutterProbe.errors.push(String(e.reason || e));
      window.__p0StutterPatchRegistry();
    };
    if (!window.__p0StutterFramesStarted) {
      window.__p0StutterFramesStarted = true;
      let last = performance.now();
      requestAnimationFrame(function loop(now) {
        const p = window.__p0StutterProbe;
        if (p) p.frames.push(Math.max(0, now - last));
        last = now;
        requestAnimationFrame(loop);
      });
    }
    window.__p0StutterStop = function() {
      for (const id of window.__p0StutterIntervals || []) clearInterval(id);
      window.__p0StutterIntervals = [];
      for (const socket of window.__p0StutterSockets || []) { try { socket.close(); } catch (error) {} }
      window.__p0StutterSockets = [];
    };
    window.__p0StutterStartRemote = function(roomId, localId, remoteId, source) {
      let lastKey = "";
      let lastPos = null;
      let lastUpdateSeenAt = 0;
      const interval = setInterval(() => {
        const p = window.__p0StutterProbe;
        const room = window.IronLine?.roomRegistry?.getRoom(roomId);
        if (!p || !room) return;
        p.remote.samples += 1;
        const remote = source === "ws" ? window.__p0WsRemoteStates[remoteId] : room.players?.find((item) => item.id === remoteId);
        const local = room.players?.find((item) => item.id === localId);
        const now = Date.now();
        if (local?.position) p.remote.localAgeMs.push(Math.max(0, now - Number(local.position.updatedAt || local.updatedAt || now)));
        if (!remote?.position) { p.remote.missing += 1; return; }
        const pos = remote.position;
        const age = Math.max(0, now - Number(pos.updatedAt || pos.stateUpdatedAt || remote.updatedAt || now));
        p.remote.ageMs.push(age);
        if (age > 500) p.remote.stale500 += 1;
        if (age > 1000) p.remote.stale1000 += 1;
        const key = [pos.stateSeq || 0, pos.updatedAt || 0, pos.x || 0, pos.y || 0].join("/");
        if (key !== lastKey) {
          if (lastUpdateSeenAt) p.remote.gapMs.push(now - lastUpdateSeenAt);
          if (lastPos) p.remote.snapPx.push(Math.hypot((Number(pos.x) || 0) - lastPos.x, (Number(pos.y) || 0) - lastPos.y));
          lastKey = key;
          lastUpdateSeenAt = now;
          lastPos = { x: Number(pos.x) || 0, y: Number(pos.y) || 0 };
          p.remote.updates += 1;
          p.remote.lastStateSeq = Math.max(p.remote.lastStateSeq, Math.floor(Number(pos.stateSeq) || 0));
        }
      }, 60);
      window.__p0StutterIntervals.push(interval);
    };
    window.__p0StutterStartWsRelay = function(roomId, localId, team, slotId) {
      const socket = new WebSocket(${JSON.stringify(`ws://127.0.0.1:${appPort}/ws`)});
      socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "join", roomId, playerId: localId, nickname: localId, participantType: "player" })));
      socket.addEventListener("message", (event) => {
        let message = null;
        try { message = JSON.parse(event.data || "{}"); } catch (error) { return; }
        if (message.type !== "player_state" || !message.payload?.playerId) return;
        window.__p0WsRemoteStates[message.payload.playerId] = { ...message.payload, position: message.payload.state };
      });
      window.__p0StutterSockets.push(socket);
      window.__p0StutterSendWsState = function(state) {
        if (socket.readyState !== WebSocket.OPEN) return false;
        socket.send(JSON.stringify({ type: "player_state", roomId, playerId: localId, team, slotId, state, sentAt: Date.now() }));
        return true;
      };
    };
    window.__p0StutterReset();
  })()`);
}
function roomSeed(roomId) {
  const now = Date.now();
  return {
    id: roomId,
    name: "P0-9A Stutter Probe",
    mode: "annihilation",
    phase: "playing",
    capacity: 8,
    players: [player("p0-blue", "blue", "blue-infantry", 1, now), player("p0-red", "red", "red-infantry", 1, now, 12)],
    spectators: [],
    admins: [],
    chat: [],
    events: [],
    commands: [],
    combatEvents: [],
    worldState: { roomId, hostId: "p0-blue", tick: 0, updatedAt: now, vehicles: [], units: [], capturePoints: [] },
    updatedAt: now
  };
}
function player(id, team, slotId, seq, now, offset = 0) {
  return {
    id,
    playerId: id,
    name: team === "blue" ? "Blue" : "Red",
    team,
    slotId,
    participantType: "player",
    ready: true,
    updatedAt: now,
    position: {
      x: 1200 + offset * 30 + seq * 3,
      y: 1400 + offset,
      stateSeq: seq,
      alive: true,
      deathState: "alive",
      hp: 100,
      maxHp: 100,
      weaponId: team === "blue" ? "rifle" : "machinegun",
      aimX: team === "blue" ? 1600 : 1200,
      aimY: 1400,
      updatedAt: now
    }
  };
}
async function preparePage(page, roomId) {
  await page.eval(`(async () => {
    window.__p0StutterStop?.();
    localStorage.setItem("iron-line-selected-room-v1", ${JSON.stringify(roomId)});
    await window.IronLine.roomRegistry.refreshRemoteRooms();
    return Boolean(window.IronLine.roomRegistry.getRoom(${JSON.stringify(roomId)}));
  })()`);
  await waitForExpression(page, `window.IronLine.roomRegistry.getRoom(${JSON.stringify(roomId)})`, 5000);
}
async function resetScenarioPage(page, roomId, localId, remoteId, source = "room") {
  page.resetMetrics();
  await page.eval(`(() => {
    window.__p0StutterStop?.();
    window.__p0StutterReset?.();
    window.__p0StutterStartRemote(${JSON.stringify(roomId)}, ${JSON.stringify(localId)}, ${JSON.stringify(remoteId)}, ${JSON.stringify(source)});
  })()`);
}
async function startWsRelay(page, roomId, id, team, slotId) {
  await page.eval(`window.__p0StutterStartWsRelay(${JSON.stringify(roomId)}, ${JSON.stringify(id)}, ${JSON.stringify(team)}, ${JSON.stringify(slotId)})`);
}
async function startMovement(page, roomId, id, team, slotId, offset) {
  await page.eval(`(() => {
    let seq = 20;
    const interval = setInterval(() => {
      seq += 1;
      const now = Date.now();
      window.IronLine.roomRegistry.addOrUpdatePlayer(${JSON.stringify(roomId)}, ${JSON.stringify(player(id, team, slotId, 20, Date.now(), offset))});
      const room = window.IronLine.roomRegistry.getRoom(${JSON.stringify(roomId)});
      const p = room?.players?.find((item) => item.id === ${JSON.stringify(id)});
      if (p?.position) {
        p.position.stateSeq = seq;
        p.position.x = ${team === "blue" ? 1200 : 1560} + seq * ${team === "blue" ? 3 : -3};
        p.position.y = ${team === "blue" ? 1400 : 1412} + Math.round(Math.sin(seq / 4) * 12);
        p.position.updatedAt = now;
        p.position.stateUpdatedAt = now;
        p.updatedAt = now;
        window.IronLine.roomRegistry.addOrUpdatePlayer(${JSON.stringify(roomId)}, p);
      }
    }, 180);
    window.__p0StutterIntervals.push(interval);
  })()`);
}
async function startWsMovement(page, id, team, slotId) {
  await page.eval(`(() => {
    let seq = 20;
    const interval = setInterval(() => {
      seq += 1;
      const now = Date.now();
      window.__p0StutterSendWsState?.({
        x: ${team === "blue" ? 1200 : 1560} + seq * ${team === "blue" ? 3 : -3},
        y: ${team === "blue" ? 1400 : 1412} + Math.round(Math.sin(seq / 4) * 12),
        stateSeq: seq, stateUpdatedAt: now, updatedAt: now, team: ${JSON.stringify(team)},
        hp: 100, maxHp: 100, alive: true, aimX: ${team === "blue" ? 1600 : 1200}, aimY: 1400,
        weaponId: ${JSON.stringify(team === "blue" ? "rifle" : "machinegun")}
      });
    }, 75);
    window.__p0StutterIntervals.push(interval);
  })()`);
}
async function startSmallArms(page, roomId) {
  await page.eval(`(() => {
    let seq = 0;
    const interval = setInterval(() => {
      seq += 1;
      const blue = seq % 2 === 1;
      const eventId = ${JSON.stringify(roomId)} + ":shot:" + seq;
      window.IronLine.roomRegistry.pushCombatEvent(${JSON.stringify(roomId)}, {
        id: eventId, eventId, shotId: eventId, hitId: eventId + ":hit", type: "small_arms",
        shooterId: blue ? "p0-blue" : "p0-red", shooterName: blue ? "Blue" : "Red", shooterTeam: blue ? "blue" : "red",
        targetPlayerId: blue ? "p0-red" : "p0-blue", weaponId: blue ? "rifle" : "machinegun",
        damage: 1, hit: true, targetStateSeq: seq + 20, shooterStateSeq: seq + 20,
        x1: blue ? 1200 : 1600, y1: 1400, x2: blue ? 1600 : 1200, y2: 1400, createdAt: Date.now()
      });
    }, 125);
    window.__p0StutterIntervals.push(interval);
  })()`);
}
async function stopPages(pages) {
  await Promise.all(pages.map((page) => page.eval("window.__p0StutterStop?.()").catch(() => null)));
}
async function collectPage(page) {
  const probe = await page.eval(`(() => {
    const p = window.__p0StutterProbe;
    const frames = (p?.frames || []).slice(1).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
    const remote = p?.remote || {};
    return {
      frames,
      storageSetItem: p?.storageSetItem || 0,
      storageBytes: p?.storageBytes || 0,
      errors: (p?.errors || []).slice(0, 8),
      refreshRemoteRooms: p?.refreshRemoteRooms || 0,
      refreshRemoteRoomsMs: p?.refreshRemoteRoomsMs || [],
      combatMergeCalls: p?.combatMergeCalls || 0,
      combatMergeIncoming: p?.combatMergeIncoming || 0,
      combatMergeAdded: p?.combatMergeAdded || 0,
      combatMergeDuplicates: p?.combatMergeDuplicates || 0,
      remote
    };
  })()`);
  const endpoints = {};
  for (const key of ["GET /api/rooms", "GET /api/rooms/:id", "POST /participants", "POST /combat", "POST /api/rooms"]) endpoints[key] = httpSummary(page.metrics, key);
  const remote = probe.remote || {};
  return {
    name: page.name,
    endpoints,
    frame: { ...stat(probe.frames), longFrames50: probe.frames.filter((value) => value > 50).length },
    localStorage: { setItem: probe.storageSetItem, bytes: probe.storageBytes },
    refreshRemoteRooms: { count: probe.refreshRemoteRooms, ms: stat(probe.refreshRemoteRoomsMs) },
    remote: {
      samples: remote.samples || 0,
      missing: remote.missing || 0,
      updates: remote.updates || 0,
      updateGapMs: stat(remote.gapMs || []),
      snapPx: stat(remote.snapPx || []),
      ageMs: stat(remote.ageMs || []),
      localAgeMs: stat(remote.localAgeMs || []),
      raw: {
        gapMs: remote.gapMs || [],
        snapPx: remote.snapPx || [],
        ageMs: remote.ageMs || []
      },
      stale500: remote.stale500 || 0,
      stale1000: remote.stale1000 || 0,
      lastStateSeq: remote.lastStateSeq || 0
    },
    combatMerge: {
      calls: probe.combatMergeCalls,
      incoming: probe.combatMergeIncoming,
      added: probe.combatMergeAdded,
      duplicates: probe.combatMergeDuplicates
    },
    errors: [...page.metrics.errors, ...(probe.errors || [])].slice(0, 10)
  };
}
function combineHttp(pageSummaries, key) {
  let count = 0;
  let total = 0;
  let max = 0;
  for (const page of pageSummaries) {
    const item = page.endpoints[key];
    count += item.count;
    total += item.avgBytes * item.count;
    max = Math.max(max, item.maxBytes);
  }
  return { count, avgBytes: count ? Math.round(total / count) : 0, maxBytes: max };
}
function combineStat(pageSummaries, selector) {
  const values = [];
  for (const page of pageSummaries) values.push(...selector(page));
  return stat(values);
}
function combatSummary(room = {}) {
  const events = Array.isArray(room.combatEvents) ? room.combatEvents : [];
  return {
    finalCombatEvents: events.length,
    deathEvents: events.filter((event) => event.type === "player_death" || event.deathId).length,
    respawnEvents: events.filter((event) => event.type === "player_respawn" || event.respawnId).length,
    sameTeamDamageSuspicions: events.filter((event) => event.accepted !== false && event.shooterTeam && event.targetTeam && event.shooterTeam === event.targetTeam && Number(event.damage) > 0).length
  };
}
async function runScenario(def, pages, index) {
  const roomId = `P0STUTTER-${Date.now()}-${index}`;
  await requestJson("/api/rooms", { method: "POST", body: roomSeed(roomId) });
  await Promise.all(pages.map((page) => preparePage(page, roomId)));
  await Promise.all([
    resetScenarioPage(pages[0], roomId, "p0-blue", "p0-red", def.wsRelay ? "ws" : "room"),
    resetScenarioPage(pages[1], roomId, "p0-red", "p0-blue", def.wsRelay ? "ws" : "room")
  ]);
  if (def.wsRelay) {
    await Promise.all([
      startWsRelay(pages[0], roomId, "p0-blue", "blue", "blue-infantry"),
      startWsRelay(pages[1], roomId, "p0-red", "red", "red-infantry")
    ]);
    await sleep(500);
  }
  await Promise.all([
    startMovement(pages[0], roomId, "p0-blue", "blue", "blue-infantry", 0),
    startMovement(pages[1], roomId, "p0-red", "red", "red-infantry", 12)
  ]);
  if (def.wsRelay) {
    await Promise.all([
      startWsMovement(pages[0], "p0-blue", "blue", "blue-infantry"),
      startWsMovement(pages[1], "p0-red", "red", "red-infantry")
    ]);
  }
  if (def.smallArms) await startSmallArms(pages[0], roomId);
  await sleep(def.durationMs || 10000);
  await stopPages(pages);
  await sleep(900);
  const finalRoom = (await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`)).room || {};
  const pageSummaries = await Promise.all(pages.map(collectPage));
  await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" }).catch(() => null);
  const endpoints = {
    getRooms: combineHttp(pageSummaries, "GET /api/rooms"),
    getRoomDetail: combineHttp(pageSummaries, "GET /api/rooms/:id"),
    participantPost: combineHttp(pageSummaries, "POST /participants"),
    combatPost: combineHttp(pageSummaries, "POST /combat"),
    postRooms: combineHttp(pageSummaries, "POST /api/rooms")
  };
  return {
    scenario: def.name,
    transport: def.wsRelay ? "ws_player_state_relay" : "http_room_refresh",
    measurement: "headless Chrome automated 2P instrumentation, not manual human play",
    roomId,
    durationMs: def.durationMs || 10000,
    pages: pageSummaries,
    endpoints,
    frame: {
      avgMs: round(pageSummaries.reduce((sum, page) => sum + page.frame.avg, 0) / pageSummaries.length),
      p95Ms: Math.max(...pageSummaries.map((page) => page.frame.p95)),
      maxMs: Math.max(...pageSummaries.map((page) => page.frame.max)),
      longFrames50: pageSummaries.reduce((sum, page) => sum + page.frame.longFrames50, 0)
    },
    remote: {
      updates: pageSummaries.reduce((sum, page) => sum + page.remote.updates, 0),
      updateGapMs: combineStat(pageSummaries, (page) => page.remote.raw.gapMs),
      snapPx: combineStat(pageSummaries, (page) => page.remote.raw.snapPx),
      ageMs: combineStat(pageSummaries, (page) => page.remote.raw.ageMs),
      stale500: pageSummaries.reduce((sum, page) => sum + page.remote.stale500, 0),
      stale1000: pageSummaries.reduce((sum, page) => sum + page.remote.stale1000, 0)
    },
    localStorageSetItem: pageSummaries.reduce((sum, page) => sum + page.localStorage.setItem, 0),
    combatMerge: {
      calls: pageSummaries.reduce((sum, page) => sum + page.combatMerge.calls, 0),
      incoming: pageSummaries.reduce((sum, page) => sum + page.combatMerge.incoming, 0),
      added: pageSummaries.reduce((sum, page) => sum + page.combatMerge.added, 0),
      duplicates: pageSummaries.reduce((sum, page) => sum + page.combatMerge.duplicates, 0)
    },
    errorCount: pageSummaries.reduce((sum, page) => sum + page.errors.length, 0),
    ...combatSummary(finalRoom)
  };
}
function recommendation(results) {
  const movement = results.find((item) => item.scenario.includes("movement") && item.transport === "ws_player_state_relay") ||
    results.find((item) => item.scenario.includes("movement"));
  const combat = results.find((item) => item.scenario.includes("small_arms") && item.transport === "ws_player_state_relay") ||
    results.find((item) => item.scenario.includes("small_arms"));
  const movementGap = movement?.remote.updateGapMs.max || 0;
  const movementSnap = movement?.remote.snapPx.max || 0;
  const combatGapDelta = (combat?.remote.updateGapMs.max || 0) - movementGap;
  const combatBytes = combat?.endpoints.combatPost.count || 0;
  if (movementGap > 600 || movementSnap > 80 || (movement?.remote.stale1000 || 0) > 0) return "P0-9B player_state transport 최소 실험 설계";
  if (combatGapDelta > 250 || combatBytes > 0 && (combat?.frame.longFrames50 || 0) > (movement?.frame.longFrames50 || 0)) return "P0-9B combat merge/render 계측 분기";
  if ((combat?.frame.longFrames50 || 0) > 0 || (movement?.frame.longFrames50 || 0) > 0) return "P0-9B frame/renderer/GC 계측 분기";
  if ((combat?.endpoints.getRoomDetail.maxBytes || 0) > 50000 || (movement?.endpoints.getRoomDetail.maxBytes || 0) > 50000) return "P0-9B active-room detail payload 추가 축소";
  return "P0-9B 실플레이 브라우저 계측 오버레이/로그 수집";
}
function markdownReport(report) {
  const lines = ["# P0-9A Basic 2P Stutter Instrumentation", "", `Generated: ${report.generatedAt}`, `Measurement: ${report.measurement}`, `Next recommendation: ${report.nextRecommendation}`, "", "| Scenario | Remote gap avg/p95/max ms | Snap avg/p95/max px | Age avg/p95/max ms | Long frames | Participants count/avg | Detail count/avg | Combat count/avg | localStorage writes |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"];
  for (const result of report.results) {
    lines.push(`| ${result.scenario} | ${result.remote.updateGapMs.avg}/${result.remote.updateGapMs.p95}/${result.remote.updateGapMs.max} | ${result.remote.snapPx.avg}/${result.remote.snapPx.p95}/${result.remote.snapPx.max} | ${result.remote.ageMs.avg}/${result.remote.ageMs.p95}/${result.remote.ageMs.max} | ${result.frame.longFrames50} | ${result.endpoints.participantPost.count}/${result.endpoints.participantPost.avgBytes} | ${result.endpoints.getRoomDetail.count}/${result.endpoints.getRoomDetail.avgBytes} | ${result.endpoints.combatPost.count}/${result.endpoints.combatPost.avgBytes} | ${result.localStorageSetItem} |`);
  }
  lines.push("", "Limited alpha remains HOLD.", ""); return `${lines.join("\n")}`;
}
function print(report) {
  console.log("\nP0-9A basic 2P stutter instrumentation");
  console.log(`Report: ${path.relative(root, report.reportPath)}`);
  console.log(`Measurement: ${report.measurement}`);
  console.table(report.results.map((result) => ({
    scenario: result.scenario,
    remoteGapAvgP95Max: `${result.remote.updateGapMs.avg}/${result.remote.updateGapMs.p95}/${result.remote.updateGapMs.max}`,
    snapAvgP95Max: `${result.remote.snapPx.avg}/${result.remote.snapPx.p95}/${result.remote.snapPx.max}`,
    ageAvgP95Max: `${result.remote.ageMs.avg}/${result.remote.ageMs.p95}/${result.remote.ageMs.max}`,
    frameMaxMs: result.frame.maxMs,
    longFrames50: result.frame.longFrames50,
    participantPost: result.endpoints.participantPost.count,
    participantAvgBytes: result.endpoints.participantPost.avgBytes,
    detailGet: result.endpoints.getRoomDetail.count,
    detailAvgBytes: result.endpoints.getRoomDetail.avgBytes,
    combatPost: result.endpoints.combatPost.count,
    combatMergeCalls: result.combatMerge.calls,
    localStorageSetItem: result.localStorageSetItem,
    errors: result.errorCount
  })));
  console.log(`Next recommendation: ${report.nextRecommendation}`);
  console.log(JSON.stringify(report, null, 2));
}
async function main() {
  if (!chromePath) throw new Error("Chrome or Edge executable was not found.");
  fs.mkdirSync(reportDir, { recursive: true });
  const server = spawn(process.execPath, ["tools/static-server.cjs", String(appPort)], {
    cwd: root,
    env: { ...process.env, HOST: "0.0.0.0", PORT: String(appPort), IRONLINE_ROOMS_FILE: roomsFile },
    stdio: "ignore",
    windowsHide: true
  });
  const pages = [];
  try {
    await waitForServer();
    pages.push(await launchPage("blue", appPort + 101, "127.0.0.1"));
    pages.push(await launchPage("red", appPort + 102, "localhost"));
    const scenarios = [{ name: "movement_only_http_room_refresh_10s", durationMs: 10000 }, { name: "movement_only_ws_player_state_10s", wsRelay: true, durationMs: 10000 }, { name: "small_arms_http_room_refresh_10s", smallArms: true, durationMs: 10000 }, { name: "small_arms_ws_player_state_10s", smallArms: true, wsRelay: true, durationMs: 10000 }];
    const results = []; for (let index = 0; index < scenarios.length; index += 1) results.push(await runScenario(scenarios[index], pages, index + 1));
    const report = {
      generatedAt: new Date().toISOString(),
      measurement: "headless Chrome automated 2P instrumentation, not manual human play",
      results,
      nextRecommendation: recommendation(results),
      reportPath: path.join(reportDir, "report.md"),
      resultPath: path.join(reportDir, "result.json")
    };
    fs.writeFileSync(report.resultPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(report.reportPath, markdownReport(report), "utf8");
    print(report);
  } finally {
    await stopPages(pages).catch(() => null);
    await Promise.all(pages.map((page) => page.close()));
    try { server.kill(); } catch (_error) {}
    try {
      if (fs.existsSync(roomsFile)) fs.unlinkSync(roomsFile);
      if (fs.existsSync(`${roomsFile}.tmp`)) fs.unlinkSync(`${roomsFile}.tmp`);
    } catch (_error) {}
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
