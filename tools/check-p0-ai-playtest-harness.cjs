"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_P0_PLAYTEST_PORT || 4337);
const baseUrl = `http://127.0.0.1:${appPort}`;
const roomsFile = path.join(root, ".data", `p0-ai-playtest-${process.pid}.json`);
const reportsRoot = path.join(root, "reports", "playtests");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const reportDir = path.join(reportsRoot, `p0-7a-ai-playtest-${stamp}`);
const chromePath = process.env.CHROME_PATH || [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].find((item) => fs.existsSync(item));

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
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
    this.wsUrl = wsUrl;
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
    this.on("Network.webSocketFrameSent", (p) => recordWs(this.metrics.ws.sent, p.response?.payloadData));
    this.on("Network.webSocketFrameReceived", (p) => recordWs(this.metrics.ws.received, p.response?.payloadData));
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
  async screenshot(filePath) {
    const result = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(result.data || "", "base64"));
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

function freshMetrics() { return { http: new Map(), ws: { sent: {}, received: {} }, errors: [] }; }
function endpointKey(method, url) {
  const pathName = new URL(url).pathname;
  if (method === "GET" && pathName === "/api/rooms") return "GET /api/rooms";
  if (method === "GET" && /^\/api\/rooms\/[^/]+$/.test(pathName)) return "GET /api/rooms/:id";
  if (method === "POST" && /^\/api\/rooms\/[^/]+\/participants$/.test(pathName)) return "POST /participants";
  if (method === "POST" && /^\/api\/rooms\/[^/]+\/combat$/.test(pathName)) return "POST /combat";
  if (method === "POST" && pathName === "/api/rooms") return "POST /api/rooms";
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
function recordWs(target, raw) {
  try {
    const type = JSON.parse(raw || "{}").type || "unknown";
    target[type] = (target[type] || 0) + 1;
  } catch (_error) {
    target.unknown = (target.unknown || 0) + 1;
  }
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
  return [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "about:blank"
  ];
}
async function launchPage(name, debugPort, originHost) {
  const profileDir = path.join(os.tmpdir(), `iron-line-playtest-${name}-${process.pid}`);
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
    window.__p0Intervals = window.__p0Intervals || [];
    if (!Storage.prototype.__p0HarnessWrapped) {
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        const p = window.__p0HarnessProbe;
        if (p) { p.storageSetItem += 1; p.storageBytes += String(value || "").length; }
        return originalSet.call(this, key, value);
      };
      Storage.prototype.__p0HarnessWrapped = true;
    }
    window.__p0HarnessReset = function() {
      window.__p0HarnessProbe = { frames: [], storageSetItem: 0, storageBytes: 0, errors: [] };
      window.onerror = (m) => window.__p0HarnessProbe.errors.push(String(m));
      window.onunhandledrejection = (e) => window.__p0HarnessProbe.errors.push(String(e.reason || e));
    };
    if (!window.__p0HarnessFramesStarted) {
      window.__p0HarnessFramesStarted = true;
      let last = performance.now();
      requestAnimationFrame(function loop(now) {
        const p = window.__p0HarnessProbe;
        if (p) p.frames.push(Math.max(0, now - last));
        last = now;
        requestAnimationFrame(loop);
      });
    }
    window.__p0HarnessStop = function() {
      for (const id of window.__p0Intervals || []) clearInterval(id);
      window.__p0Intervals = [];
    };
    window.__p0HarnessReset();
  })()`);
}
function roomSeed(roomId) {
  const now = Date.now();
  return {
    id: roomId,
    name: "P0-7A AI Playtest",
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
  return { id, playerId: id, name: team === "blue" ? "Blue" : "Red", team, slotId, participantType: "player", ready: true, updatedAt: now, position: { x: 1200 + offset * 30 + seq, y: 1400 + offset, stateSeq: seq, alive: true, deathState: "alive", hp: 100, maxHp: 100, weaponId: team === "blue" ? "rifle" : "machinegun", aimX: team === "blue" ? 1600 : 1200, aimY: 1400, updatedAt: now } };
}
async function preparePage(page, roomId) {
  await page.eval(`(async () => {
    window.__p0HarnessStop?.();
    window.__p0HarnessReset?.();
    localStorage.setItem("iron-line-selected-room-v1", ${JSON.stringify(roomId)});
    await window.IronLine.roomRegistry.refreshRemoteRooms();
    return Boolean(window.IronLine.roomRegistry.getRoom(${JSON.stringify(roomId)}));
  })()`);
  await waitForExpression(page, `window.IronLine.roomRegistry.getRoom(${JSON.stringify(roomId)})`, 5000);
}
async function startMovement(page, roomId, id, team, slotId, offset) {
  await page.eval(`(() => {
    let seq = 10;
    const id = setInterval(() => {
      seq += 1;
      const now = Date.now();
      window.IronLine.roomRegistry.addOrUpdatePlayer(${JSON.stringify(roomId)}, ${JSON.stringify(player(id, team, slotId, 10, Date.now(), offset))});
      const room = window.IronLine.roomRegistry.getRoom(${JSON.stringify(roomId)});
      const p = room?.players?.find((item) => item.id === ${JSON.stringify(id)});
      if (p?.position) {
        p.position.stateSeq = seq;
        p.position.x += 2;
        p.position.updatedAt = now;
        p.updatedAt = now;
        window.IronLine.roomRegistry.addOrUpdatePlayer(${JSON.stringify(roomId)}, p);
      }
    }, 180);
    window.__p0Intervals.push(id);
  })()`);
}
async function startSmallArms(page, roomId) {
  await page.eval(`(() => {
    let seq = 0;
    const id = setInterval(() => {
      seq += 1;
      const blue = seq % 2 === 1;
      const eventId = ${JSON.stringify(roomId)} + ":shot:" + seq;
      window.IronLine.roomRegistry.pushCombatEvent(${JSON.stringify(roomId)}, {
        id: eventId, eventId, shotId: eventId, hitId: eventId + ":hit", type: "small_arms",
        shooterId: blue ? "p0-blue" : "p0-red", shooterName: blue ? "Blue" : "Red", shooterTeam: blue ? "blue" : "red",
        targetPlayerId: blue ? "p0-red" : "p0-blue", weaponId: blue ? "rifle" : "machinegun",
        damage: 1, hit: true, targetStateSeq: seq + 10, shooterStateSeq: seq + 10, x1: blue ? 1200 : 1600, y1: 1400, x2: blue ? 1600 : 1200, y2: 1400, createdAt: Date.now()
      });
    }, 125);
    window.__p0Intervals.push(id);
  })()`);
}
async function stopPages(pages) { await Promise.all(pages.map((page) => page.eval("window.__p0HarnessStop?.()").catch(() => null))); }
async function collectPage(page) {
  const probe = await page.eval(`(() => {
    const p = window.__p0HarnessProbe || { frames: [], storageSetItem: 0, storageBytes: 0, errors: [] };
    const frames = p.frames.slice(1).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    const avg = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length);
    return {
      frames: frames.length,
      avgFrameMs: Math.round(avg * 10) / 10,
      p95FrameMs: Math.round((frames[Math.floor(frames.length * 0.95)] || 0) * 10) / 10,
      maxFrameMs: Math.round((frames[frames.length - 1] || 0) * 10) / 10,
      longFrames50: frames.filter((v) => v > 50).length,
      storageSetItem: p.storageSetItem,
      storageBytes: p.storageBytes,
      errors: p.errors.slice(0, 5)
    };
  })()`);
  const endpoints = {};
  for (const key of ["GET /api/rooms", "GET /api/rooms/:id", "POST /participants", "POST /combat", "POST /api/rooms"]) endpoints[key] = httpSummary(page.metrics, key);
  return { name: page.name, endpoints, ws: page.metrics.ws, ...probe, errors: [...page.metrics.errors, ...probe.errors].slice(0, 8) };
}
function combine(pageSummaries, key) {
  let count = 0, total = 0, max = 0;
  for (const page of pageSummaries) {
    const item = page.endpoints[key];
    count += item.count;
    total += item.avgBytes * item.count;
    max = Math.max(max, item.maxBytes);
  }
  return { count, avgBytes: count ? Math.round(total / count) : 0, maxBytes: max };
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
  const roomId = `P0PLAY-${Date.now()}-${index}`;
  await requestJson("/api/rooms", { method: "POST", body: roomSeed(roomId) });
  await Promise.all(pages.map((page) => preparePage(page, roomId)));
  pages.forEach((page) => page.resetMetrics());
  await Promise.all([
    startMovement(pages[0], roomId, "p0-blue", "blue", "blue-infantry", 0),
    startMovement(pages[1], roomId, "p0-red", "red", "red-infantry", 12)
  ]);
  if (def.smallArms) await startSmallArms(pages[0], roomId);
  await sleep(def.durationMs || 6000);
  await stopPages(pages);
  await sleep(700);
  const finalRoom = (await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`)).room || {};
  const pageSummaries = await Promise.all(pages.map(collectPage));
  await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" }).catch(() => null);
  const combat = combatSummary(finalRoom);
  return {
    scenario: def.name,
    roomId,
    durationMs: def.durationMs || 6000,
    pages: pageSummaries,
    totals: {
      getRooms: combine(pageSummaries, "GET /api/rooms"),
      getRoomDetail: combine(pageSummaries, "GET /api/rooms/:id"),
      participantPost: combine(pageSummaries, "POST /participants"),
      combatPost: combine(pageSummaries, "POST /combat"),
      postRooms: combine(pageSummaries, "POST /api/rooms")
    },
    frame: {
      avgMs: Math.round((pageSummaries.reduce((sum, page) => sum + page.avgFrameMs, 0) / pageSummaries.length) * 10) / 10,
      maxMs: Math.max(...pageSummaries.map((page) => page.maxFrameMs)),
      longFrames50: pageSummaries.reduce((sum, page) => sum + page.longFrames50, 0)
    },
    localStorageSetItem: pageSummaries.reduce((sum, page) => sum + page.storageSetItem, 0),
    errorCount: pageSummaries.reduce((sum, page) => sum + page.errors.length, 0),
    ...combat,
    eventSyncOk: pageSummaries.every((page) => page.endpoints["POST /combat"].count === 0 || page.endpoints["POST /combat"].count === combat.finalCombatEvents)
  };
}
function evaluate(results) {
  const failures = [];
  for (const result of results) {
    if (result.errorCount > 0) failures.push(`${result.scenario}: browser/page errors`);
    if (result.frame.longFrames50 > 0) failures.push(`${result.scenario}: long frames >50ms`);
    if (result.sameTeamDamageSuspicions > 0) failures.push(`${result.scenario}: same-team damage suspicion`);
    if (!result.eventSyncOk) failures.push(`${result.scenario}: combat event sync mismatch`);
  }
  return { ok: failures.length === 0, failures };
}
function markdownReport(report) {
  const lines = [
    "# P0-7A AI Playtest Harness Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Measurement: ${report.measurement}`,
    `Result: ${report.ok ? "PASS" : "FAIL"}`,
    "",
    "| Scenario | Frames avg/max | Long >50ms | Errors | GET detail avg/max | Combat POST | Combat events | Death/respawn | Same-team suspicion |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const result of report.results) {
    lines.push(`| ${result.scenario} | ${result.frame.avgMs}/${result.frame.maxMs} | ${result.frame.longFrames50} | ${result.errorCount} | ${result.totals.getRoomDetail.avgBytes}/${result.totals.getRoomDetail.maxBytes} | ${result.totals.combatPost.count} | ${result.finalCombatEvents} | ${result.deathEvents}/${result.respawnEvents} | ${result.sameTeamDamageSuspicions} |`);
  }
  if (report.failures.length) {
    lines.push("", "## Failures", "", ...report.failures.map((item) => `- ${item}`));
  }
  lines.push("", "Limited alpha remains HOLD.");
  return `${lines.join("\n")}\n`;
}
async function saveFailureArtifacts(pages, results) {
  const failing = results.filter((result) => result.errorCount > 0 || result.frame.longFrames50 > 0 || result.sameTeamDamageSuspicions > 0 || !result.eventSyncOk);
  if (!failing.length) return { screenshots: [], logs: [] };
  const screenshots = [], logs = [];
  for (const page of pages) {
    const screenshotPath = path.join(reportDir, "screenshots", `${page.name}.png`);
    const logPath = path.join(reportDir, "logs", `${page.name}.json`);
    await page.screenshot(screenshotPath).catch(() => null);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, `${JSON.stringify({ name: page.name, errors: page.metrics.errors }, null, 2)}\n`, "utf8");
    screenshots.push(path.relative(root, screenshotPath));
    logs.push(path.relative(root, logPath));
  }
  return { screenshots, logs };
}
function print(report) {
  console.log("\nP0-7A AI playtest harness");
  console.log(`Report: ${path.relative(root, report.reportPath)}`);
  console.table(report.results.map((result) => ({
    scenario: result.scenario,
    frameAvgMs: result.frame.avgMs,
    frameMaxMs: result.frame.maxMs,
    longFrames50: result.frame.longFrames50,
    errors: result.errorCount,
    detailAvgBytes: result.totals.getRoomDetail.avgBytes,
    combatPost: result.totals.combatPost.count,
    finalCombatEvents: result.finalCombatEvents,
    eventSyncOk: result.eventSyncOk,
    sameTeamDamageSuspicions: result.sameTeamDamageSuspicions
  })));
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
    const scenarios = [
      { name: "movement_only_6s", durationMs: 6000 },
      { name: "small_arms_6s", smallArms: true, durationMs: 6000 }
    ];
    const results = [];
    for (let index = 0; index < scenarios.length; index += 1) results.push(await runScenario(scenarios[index], pages, index + 1));
    const evaluation = evaluate(results);
    const artifacts = await saveFailureArtifacts(pages, results);
    const report = {
      ok: evaluation.ok,
      generatedAt: new Date().toISOString(),
      measurement: "headless Chrome automated playtest, not manual human play",
      commit: process.env.GITHUB_SHA || "",
      results,
      failures: evaluation.failures,
      artifacts,
      reportPath: path.join(reportDir, "report.md"),
      resultPath: path.join(reportDir, "result.json")
    };
    fs.writeFileSync(report.resultPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(report.reportPath, markdownReport(report), "utf8");
    print(report);
    if (!report.ok) process.exitCode = 1;
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
