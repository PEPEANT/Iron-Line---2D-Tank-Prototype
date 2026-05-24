"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_P0_9D_PORT || 4371);
const baseUrl = `http://127.0.0.1:${appPort}`;
const roomsFile = path.join(root, ".data", `p0-9d-frame-${process.pid}.json`);
const reportsRoot = path.join(root, "reports", "playtests");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const reportDir = path.join(reportsRoot, `p0-9d-frame-stall-${stamp}`);
const chromePath = process.env.CHROME_PATH || ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find((item) => fs.existsSync(item));
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
      timeout: options.timeout || 8000
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let payload = {};
        try { payload = raw ? JSON.parse(raw) : {}; } catch (error) { return reject(error); }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`${options.method || "GET"} ${pathname} ${res.statusCode}: ${raw}`));
        }
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
  constructor(name, wsUrl, child, profileDir) {
    this.name = name;
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
    await waitForExpression(this, "document.readyState === 'complete' && !!window.IronLine?.game?.hud?.sessionFlow", 12000);
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
  return item ? { count: item.count, avgBytes: Math.round(item.bytesTotal / item.count), maxBytes: item.bytesMax, statuses: item.statuses } :
    { count: 0, avgBytes: 0, maxBytes: 0, statuses: {} };
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
  const profileDir = path.join(os.tmpdir(), `iron-line-p0-9d-${name}-${process.pid}`);
  fs.rmSync(profileDir, { recursive: true, force: true });
  const child = spawn(chromePath, browserArgs(debugPort, profileDir), { stdio: "ignore", windowsHide: true });
  const page = new CdpPage(name, await waitForTarget(debugPort), child, profileDir);
  await page.open();
  await page.navigate(`http://${originHost}:${appPort}/index.html?roomsApi=${encodeURIComponent(baseUrl)}`);
  await installProbe(page);
  return page;
}
async function installProbe(page) {
  await page.eval(`(() => {
    const limit = (list, max) => { while (list.length > max) list.shift(); };
    const now = () => performance.now();
    const probe = () => window.__p09dProbe;
    const pushEvent = (kind, data) => {
      const p = probe();
      if (!p) return;
      p.events.push(Object.assign({ t: now(), kind }, data || {}));
      limit(p.events, 360);
    };
    const recordSection = (name, dt) => {
      const p = probe();
      if (!p) return;
      const list = p.sections[name] || (p.sections[name] = []);
      list.push(dt);
      limit(list, 1000);
      if (dt >= 8) pushEvent("section", { name, ms: dt });
    };
    const wrapMethod = (obj, method, label) => {
      if (!obj || typeof obj[method] !== "function" || obj[method].__p09dWrapped) return;
      const original = obj[method];
      obj[method] = function(...args) {
        const started = now();
        try { return original.apply(this, args); }
        finally { recordSection(label, now() - started); }
      };
      obj[method].__p09dWrapped = true;
    };
    const wrapAsync = (obj, method, label) => {
      if (!obj || typeof obj[method] !== "function" || obj[method].__p09dWrapped) return;
      const original = obj[method];
      obj[method] = function(...args) {
        const started = now();
        try {
          const result = original.apply(this, args);
          if (result && typeof result.finally === "function") {
            return result.finally(() => recordSection(label, now() - started));
          }
          recordSection(label, now() - started);
          return result;
        } catch (error) {
          recordSection(label, now() - started);
          throw error;
        }
      };
      obj[method].__p09dWrapped = true;
    };
    if (!Storage.prototype.__p09dSetWrapped) {
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        const started = now();
        try { return originalSet.call(this, key, value); }
        finally {
          const p = probe();
          if (p) {
            const bytes = String(value || "").length;
            const ms = now() - started;
            p.storage.setItem += 1;
            p.storage.bytes += bytes;
            p.storage.byKey[key] = p.storage.byKey[key] || { count: 0, bytes: 0, maxBytes: 0, maxMs: 0 };
            p.storage.byKey[key].count += 1;
            p.storage.byKey[key].bytes += bytes;
            p.storage.byKey[key].maxBytes = Math.max(p.storage.byKey[key].maxBytes, bytes);
            p.storage.byKey[key].maxMs = Math.max(p.storage.byKey[key].maxMs, ms);
            if (bytes > 12000 || ms >= 2) pushEvent("storage", { key, bytes, ms });
          }
        }
      };
      Storage.prototype.__p09dSetWrapped = true;
    }
    if (!window.__p09dFetchWrapped) {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async function(input, init) {
        const started = now();
        const url = typeof input === "string" ? input : input?.url || "";
        const method = (init?.method || input?.method || "GET").toUpperCase();
        try {
          const response = await originalFetch(input, init);
          const item = { url, method, status: response.status, ms: now() - started };
          const p = probe();
          if (p) {
            p.fetches.push(item);
            limit(p.fetches, 180);
          }
          if (item.ms >= 25 || /\\/api\\/rooms/.test(url)) pushEvent("fetch", item);
          return response;
        } catch (error) {
          pushEvent("fetch-error", { url, method, ms: now() - started, message: String(error?.message || error) });
          throw error;
        }
      };
      window.__p09dFetchWrapped = true;
    }
    window.__p09dPatchRuntime = function() {
      const game = window.IronLine?.game;
      const registry = window.IronLine?.roomRegistry;
      const flow = game?.hud?.sessionFlow;
      wrapMethod(game, "update", "game.update");
      wrapMethod(game, "updateBattlefield", "game.updateBattlefield");
      wrapMethod(game, "updatePlayer", "game.updatePlayer");
      wrapMethod(game, "updateCamera", "game.updateCamera");
      wrapMethod(game?.renderer, "draw", "renderer.draw");
      wrapMethod(game?.hud, "update", "hud.update");
      wrapMethod(flow, "syncCurrentRoom", "session.syncCurrentRoom");
      wrapMethod(flow, "publishLocalPlayer", "session.publishLocalPlayer");
      wrapAsync(registry, "refreshRemoteRooms", "registry.refreshRemoteRooms");
      wrapAsync(registry, "fetchRemoteRoomDetail", "registry.fetchRemoteRoomDetail");
      wrapMethod(registry, "writeLocalRooms", "registry.writeLocalRooms");
    };
    window.__p09dReset = function() {
      window.__p09dProbe = {
        frames: [],
        longFrames: [],
        longTasks: [],
        events: [],
        sections: {},
        storage: { setItem: 0, bytes: 0, byKey: {} },
        fetches: [],
        input: { commands: 0, latencies: [], missed: 0 },
        errors: []
      };
      window.onerror = (m) => window.__p09dProbe.errors.push(String(m));
      window.onunhandledrejection = (e) => window.__p09dProbe.errors.push(String(e.reason || e));
      window.__p09dPatchRuntime();
    };
    if (!window.__p09dLongTaskStarted) {
      try {
        new PerformanceObserver((list) => {
          const p = probe();
          if (!p) return;
          for (const entry of list.getEntries()) {
            const item = { t: entry.startTime, ms: entry.duration, name: entry.name || "longtask" };
            p.longTasks.push(item);
            limit(p.longTasks, 80);
            pushEvent("longtask", item);
          }
        }).observe({ entryTypes: ["longtask"] });
      } catch (_error) {}
      window.__p09dLongTaskStarted = true;
    }

    if (!window.__p09dFramesStarted) {
      window.__p09dFramesStarted = true;
      let last = now();
      requestAnimationFrame(function loop(ts) {
        const p = probe();
        const game = window.IronLine?.game;
        if (p) {
          const gap = Math.max(0, ts - last);
          p.frames.push(gap);
          limit(p.frames, 1200);
          if (p.input.pending && game?.player) {
            const dx = Number(game.player.x) - p.input.pending.startX;
            if (Math.abs(dx) >= 0.8 && Math.sign(dx) === Math.sign(p.input.pending.axisX)) {
              p.input.latencies.push(ts - p.input.pending.t);
              p.input.pending = null;
            } else if (ts - p.input.pending.t > 400) {
              p.input.missed += 1;
              p.input.pending = null;
            }
          }
          if (gap > 50) {
            const windowStart = ts - Math.max(220, gap + 40);
            p.longFrames.push({ t: ts, gap, events: p.events.filter((event) => event.t >= windowStart).slice(-28) });
            limit(p.longFrames, 80);
          }
        }
        last = ts;
        window.__p09dPatchRuntime();
        requestAnimationFrame(loop);
      });
    }

    window.__p09dStartVirtualInput = function(baseX, baseY, direction) {
      const game = window.IronLine?.game;
      if (!game?.player || !game.input) return false;
      game.player.x = baseX;
      game.player.y = baseY;
      game.player.vx = 0;
      game.player.vy = 0;
      game.input.setVirtualEnabled?.(true);
      let axis = direction || 1;
      const setAxis = () => {
        const p = probe();
        game.input.setVirtualAxis?.(axis, 0);
        game.input.setVirtualAim?.(axis, 0);
        if (p) {
          p.input.commands += 1;
          p.input.pending = { t: now(), axisX: axis, startX: Number(game.player.x) || 0 };
        }
        axis *= -1;
      };
      setAxis();
      window.__p09dInputTimer = setInterval(setAxis, 850);
      return true;
    };
    window.__p09dStop = function() {
      if (window.__p09dInputTimer) clearInterval(window.__p09dInputTimer);
      window.__p09dInputTimer = null;
      const game = window.IronLine?.game;
      game?.input?.setVirtualAxis?.(0, 0);
    };
    window.__p09dCollect = function() {
      const p = probe() || {};
      return {
        frames: (p.frames || []).slice(1),
        longFrames: p.longFrames || [],
        longTasks: p.longTasks || [],
        sections: p.sections || {},
        storage: p.storage || {},
        fetches: p.fetches || [],
        input: p.input || {},
        errors: (p.errors || []).slice(0, 10)
      };
    };

    window.__p09dReset();
  })()`);
}
function roomSeed(roomId, blueId, redId) {
  const now = Date.now();
  return {
    id: roomId,
    name: "P0-9D Frame Stall Probe",
    mode: "annihilation",
    phase: "playing", startedAt: now,
    capacity: 8, blueFactionId: "korea", redFactionId: "russia",
    blueAiTanks: 0, blueInfantry: 4, redTanks: 1, redInfantry: 4,
    players: [player(blueId, "Blue", "blue", "blue-infantry", now, 1200, 1400), player(redId, "Red", "red", "red-infantry", now, 1600, 1412)],
    spectators: [], admins: [], chat: [], events: [], commands: [], combatEvents: [],
    worldState: { roomId, hostId: blueId, tick: 0, updatedAt: now, vehicles: [], units: [], capturePoints: [] },
    updatedAt: now
  };
}
function player(id, name, team, slotId, now, x, y) {
  return {
    id, playerId: id, name, nickname: name, team, slotId, roleId: "infantry", role: "infantry_leader",
    classId: "infantry", currentClassId: "infantry", weaponId: team === "blue" ? "rifle" : "machinegun",
    participantType: "player", ready: true, updatedAt: now,
    position: { x, y, stateSeq: 1, stateUpdatedAt: now, updatedAt: now, alive: true, deathState: "alive", hp: 100, maxHp: 100, weaponId: team === "blue" ? "rifle" : "machinegun", aimX: team === "blue" ? x + 220 : x - 220, aimY: y, angle: team === "blue" ? 0 : Math.PI }
  };
}
async function profile(page) {
  return page.eval(`(() => {
    const game = window.IronLine?.game;
    return { playerId: game?.localProfile?.playerId || "", nickname: game?.localProfile?.nickname || "" };
  })()`);
}
async function preparePage(page, roomId, slotId, baseX, baseY, direction) {
  const result = await page.eval(`(async () => {
    const game = window.IronLine.game;
    localStorage.setItem("iron-line-selected-room-v1", ${JSON.stringify(roomId)});
    let room = null;
    for (let i = 0; i < 20; i += 1) {
      await window.IronLine.roomRegistry.refreshRemoteRooms();
      room = window.IronLine.roomRegistry.getRoom(${JSON.stringify(roomId)});
      if (room) break;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    if (!room) return { ok: false, reason: "missing-room" };
    const opened = game.hud.sessionFlow.openLobby({ roomId: ${JSON.stringify(roomId)}, room, participantType: "player" });
    if (!opened) return { ok: false, reason: "open-lobby-failed", sessionMode: game.sessionMode };
    game.assignPlayerToSlot(game.onlineSession.playerId, ${JSON.stringify(slotId)}, { preserveReady: true });
    const local = game.localSessionPlayer();
    if (local) { local.ready = true; local.participantType = "player"; }
    game.onlineSession.localReady = true;
    game.matchConfig.blueAiTanks = 0;
    game.matchConfig.blueInfantry = 4;
    game.matchConfig.redTanks = 1;
    game.matchConfig.redInfantry = 4;
    game.resetScenarioForMatch?.();
    game.entryOpen = false;
    game.roomListOpen = false;
    game.lobbyOpen = false;
    game.deploymentOpen = false;
    game.countdownStarted = false;
    game.matchStarted = true;
    game.matchPhase = "live";
    game.result = "";
    game.resultReason = "";
    if (game.player) {
      game.player.x = ${baseX};
      game.player.y = ${baseY};
      game.player.hp = 100;
      game.player.alive = true;
      game.player.inTank = null;
      game.player.inVehicle = null;
    }
    window.__p09dPatchRuntime?.();
    game.hud.sessionFlow.publishLocalPlayer(game, { force: true });
    return { ok: true, sessionMode: game.sessionMode, participantType: game.onlineSession?.participantType || "", matchStarted: game.matchStarted };
  })()`);
  if (!result?.ok || result.sessionMode !== "online" || !result.matchStarted) {
    throw new Error(`${page.name} session setup failed: ${JSON.stringify(result)}`);
  }
  page.startArgs = { baseX, baseY, direction };
}
async function startMeasuredRun(page) {
  page.resetMetrics();
  const args = page.startArgs;
  const ok = await page.eval(`(() => {
    window.__p09dStop?.();
    window.__p09dReset?.();
    return window.__p09dStartVirtualInput?.(${args.baseX}, ${args.baseY}, ${args.direction});
  })()`);
  if (!ok) throw new Error(`${page.name} could not start virtual input run`);
}
async function stopPages(pages) {
  await Promise.all(pages.map((page) => page.eval("window.__p09dStop?.()").catch(() => null)));
}
function sectionSummary(sections = {}) {
  const result = {};
  for (const [name, values] of Object.entries(sections)) result[name] = stat(values || []);
  return result;
}
function eventCounts(longFrames = []) {
  const counts = {};
  for (const frame of longFrames) {
    const seen = new Set((frame.events || []).map((event) => event.kind === "section" ? event.name : event.kind));
    for (const key of seen) counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
function fetchSummary(fetches = []) {
  const groups = {};
  for (const item of fetches) {
    let key = "other";
    try {
      const pathname = new URL(item.url, baseUrl).pathname;
      if (pathname === "/api/rooms") key = `${item.method} /api/rooms`;
      else if (/^\/api\/rooms\/[^/]+$/.test(pathname)) key = `${item.method} /api/rooms/:id`;
      else if (/\/participants$/.test(pathname)) key = `${item.method} /participants`;
    } catch (_error) {}
    groups[key] = groups[key] || [];
    groups[key].push(item.ms);
  }
  return Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, stat(values)]));
}
async function collectPage(page) {
  const probe = await page.eval("window.__p09dCollect?.() || {}");
  const endpoints = {};
  for (const key of ["GET /api/rooms", "GET /api/rooms/:id", "POST /participants", "POST /api/rooms"]) endpoints[key] = httpSummary(page.metrics, key);
  return {
    name: page.name,
    endpoints,
    frame: { ...stat(probe.frames || []), longFrames50: (probe.frames || []).filter((value) => value > 50).length },
    longFrames: (probe.longFrames || []).map((frame) => ({ gap: round(frame.gap), events: frame.events || [] })),
    longTask: stat((probe.longTasks || []).map((item) => item.ms)),
    sections: sectionSummary(probe.sections || {}),
    storage: probe.storage || {},
    fetch: fetchSummary(probe.fetches || []),
    input: { commands: probe.input?.commands || 0, latencyMs: stat(probe.input?.latencies || []), missed: probe.input?.missed || 0 },
    eventCounts: eventCounts(probe.longFrames || []),
    errors: [...page.metrics.errors, ...(probe.errors || [])].slice(0, 10)
  };
}
function cause(report) {
  const pages = report.pages;
  const longFrames = pages.reduce((sum, page) => sum + page.frame.longFrames50, 0);
  const storageHits = pages.reduce((sum, page) => sum + (page.eventCounts.storage || 0) + (page.eventCounts["registry.writeLocalRooms"] || 0), 0);
  const fetchHits = pages.reduce((sum, page) => sum + (page.eventCounts.fetch || 0) + (page.eventCounts["registry.refreshRemoteRooms"] || 0) + (page.eventCounts["registry.fetchRemoteRoomDetail"] || 0), 0);
  const renderHits = pages.reduce((sum, page) => sum + (page.eventCounts["renderer.draw"] || 0) + (page.eventCounts["game.update"] || 0) + (page.eventCounts["game.updateBattlefield"] || 0), 0);
  const inputMax = Math.max(...pages.map((page) => page.input.latencyMs.max || 0));
  const storageMax = Math.max(...pages.flatMap((page) => Object.values(page.storage.byKey || {}).map((item) => item.maxMs || 0)), ...pages.map((page) => page.sections["registry.writeLocalRooms"]?.max || 0));
  const fetchMax = Math.max(...pages.flatMap((page) => Object.values(page.fetch || {}).map((item) => item.max || 0)), ...pages.map((page) => page.sections["registry.refreshRemoteRooms"]?.max || 0), ...pages.map((page) => page.sections["registry.fetchRemoteRoomDetail"]?.max || 0));
  if (longFrames === 0 && inputMax < 80) return "No steady movement-only frame stall reproduced; repeat manually before choosing P0-9E.";
  if (storageHits >= Math.max(1, Math.ceil(longFrames / 2)) && storageMax >= 2) return "A. localStorage write burst is the strongest P0-9E candidate.";
  if (fetchHits >= Math.max(1, Math.ceil(longFrames / 2)) && fetchMax >= 50) return "B. fetch/detail cadence is the strongest P0-9E candidate.";
  if (renderHits > 0) return "C. render/update hot path profiling is the strongest P0-9E candidate.";
  if (inputMax >= 80) return "D. input latency triage is the strongest P0-9E candidate.";
  return "Frame stalls reproduced, but correlation is weak; repeat with DevTools before P0-9E.";
}
function markdownReport(report) {
  const lines = [
    "# P0-9D Frame Stall Triage",
    "",
    `Generated: ${report.generatedAt}`,
    `Measurement: ${report.measurement}`,
    `Decision: ${report.decision}`,
    "",
    "## Summary",
    "",
    "| Page | Long frames >50ms | Frame max ms | localStorage writes/bytes | Detail fetches | Refresh p95/max ms | writeLocalRooms p95/max ms | render p95/max ms | input latency p95/max ms |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const page of report.pages) {
    const refresh = page.sections["registry.refreshRemoteRooms"] || {};
    const write = page.sections["registry.writeLocalRooms"] || {};
    const render = page.sections["renderer.draw"] || {};
    lines.push(`| ${page.name} | ${page.frame.longFrames50} | ${page.frame.max} | ${page.storage.setItem || 0}/${page.storage.bytes || 0} | ${page.endpoints["GET /api/rooms/:id"].count} | ${refresh.p95 || 0}/${refresh.max || 0} | ${write.p95 || 0}/${write.max || 0} | ${render.p95 || 0}/${render.max || 0} | ${page.input.latencyMs.p95}/${page.input.latencyMs.max} |`);
  }
  lines.push(
    "",
    "## Correlation",
    "",
    JSON.stringify(report.correlation, null, 2),
    "",
    "## Next",
    "",
    report.nextRecommendation,
    ""
  );
  return lines.join("\n");
}
function print(report) {
  console.log("\nP0-9D frame stall triage");
  console.log(`Report: ${path.relative(root, report.reportPath)}`);
  console.log(`Decision: ${report.decision}`);
  console.table(report.pages.map((page) => ({
    page: page.name,
    longFrames50: page.frame.longFrames50,
    frameMaxMs: page.frame.max,
    storageWrites: page.storage.setItem || 0,
    storageBytes: page.storage.bytes || 0,
    detailFetches: page.endpoints["GET /api/rooms/:id"].count,
    refreshP95Max: `${page.sections["registry.refreshRemoteRooms"]?.p95 || 0}/${page.sections["registry.refreshRemoteRooms"]?.max || 0}`,
    writeP95Max: `${page.sections["registry.writeLocalRooms"]?.p95 || 0}/${page.sections["registry.writeLocalRooms"]?.max || 0}`,
    renderP95Max: `${page.sections["renderer.draw"]?.p95 || 0}/${page.sections["renderer.draw"]?.max || 0}`,
    inputP95Max: `${page.input.latencyMs.p95}/${page.input.latencyMs.max}`,
    eventCounts: JSON.stringify(page.eventCounts)
  })));
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
    const [blueProfile, redProfile] = await Promise.all(pages.map(profile));
    if (!blueProfile.playerId || !redProfile.playerId || blueProfile.playerId === redProfile.playerId) throw new Error("Could not get distinct browser player profiles.");
    const roomId = `P09D-${Date.now()}`;
    await requestJson("/api/rooms", { method: "POST", body: roomSeed(roomId, blueProfile.playerId, redProfile.playerId) });
    await preparePage(pages[0], roomId, "blue-infantry", 1200, 1400, 1);
    await preparePage(pages[1], roomId, "red-infantry", 1600, 1412, -1);
    await sleep(900);
    await Promise.all(pages.map(startMeasuredRun));
    await sleep(Number(process.env.IRONLINE_P0_9D_DURATION_MS || 12000));
    await stopPages(pages);
    await sleep(500);
    const pageSummaries = await Promise.all(pages.map(collectPage));
    await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" }).catch(() => null);
    const report = {
      generatedAt: new Date().toISOString(),
      measurement: "headless Chrome steady movement-only production-session probe after setup reset, not manual human play",
      roomId,
      pages: pageSummaries,
      correlation: {
        longFrames50: pageSummaries.reduce((sum, page) => sum + page.frame.longFrames50, 0),
        storageWrites: pageSummaries.reduce((sum, page) => sum + (page.storage.setItem || 0), 0),
        storageBytes: pageSummaries.reduce((sum, page) => sum + (page.storage.bytes || 0), 0),
        detailFetches: pageSummaries.reduce((sum, page) => sum + page.endpoints["GET /api/rooms/:id"].count, 0),
        eventCounts: Object.assign({}, ...pageSummaries.map((page) => ({ [page.name]: page.eventCounts })))
      },
      reportPath: path.join(reportDir, "report.md"),
      resultPath: path.join(reportDir, "result.json")
    };
    report.decision = cause(report);
    report.nextRecommendation = report.decision.startsWith("A.") ? "P0-9E localStorage/cache write throttle."
      : report.decision.startsWith("B.") ? "P0-9E room fetch cadence trim."
        : report.decision.startsWith("C.") ? "P0-9E render hot path profiling."
          : report.decision.startsWith("D.") ? "P0-9E input latency triage."
            : "Repeat a manual DevTools Performance capture before implementing P0-9E.";
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
