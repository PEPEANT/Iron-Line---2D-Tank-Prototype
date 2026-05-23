"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");
const { installProbe } = require("./p0-9c-browser-probe.cjs");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_P0_9C_PORT || 4367);
const baseUrl = `http://127.0.0.1:${appPort}`;
const roomsFile = path.join(root, ".data", `p0-9c-mismatch-${process.pid}.json`);
const reportsRoot = path.join(root, "reports", "playtests");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const reportDir = path.join(reportsRoot, `p0-9c-mismatch-${stamp}`);
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
  return {
    count: list.length,
    avg: round(total / Math.max(1, list.length)),
    p95: round(at(0.95)),
    max: round(list[list.length - 1] || 0)
  };
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

function freshMetrics() { return { http: new Map(), ws: { sent: {}, received: {} }, errors: [] }; }
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
function recordWs(target, raw) {
  try {
    const type = JSON.parse(String(raw || "{}")).type || "unknown";
    target[type] = (target[type] || 0) + 1;
  } catch (_error) {
    target.unknown = (target.unknown || 0) + 1;
  }
}
function httpSummary(metrics, key) {
  const item = metrics.http.get(key);
  return item ? {
    count: item.count,
    avgBytes: Math.round(item.bytesTotal / item.count),
    maxBytes: item.bytesMax,
    statuses: item.statuses
  } : { count: 0, avgBytes: 0, maxBytes: 0, statuses: {} };
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
  const profileDir = path.join(os.tmpdir(), `iron-line-p0-9c-${name}-${process.pid}`);
  fs.rmSync(profileDir, { recursive: true, force: true });
  const child = spawn(chromePath, browserArgs(debugPort, profileDir), { stdio: "ignore", windowsHide: true });
  const page = new CdpPage(name, debugPort, await waitForTarget(debugPort), child, profileDir);
  await page.open();
  await page.navigate(`http://${originHost}:${appPort}/index.html?roomsApi=${encodeURIComponent(baseUrl)}`);
  await installProbe(page);
  return page;
}

function roomSeed(roomId, blueId, redId) {
  const now = Date.now();
  return {
    id: roomId,
    name: "P0-9C Mismatch Probe",
    mode: "annihilation",
    phase: "waiting",
    capacity: 8,
    blueFactionId: "korea",
    redFactionId: "russia",
    blueAiTanks: 0,
    blueInfantry: 4,
    redTanks: 1,
    redInfantry: 4,
    players: [
      player(blueId, "Blue", "blue", "blue-infantry", 1, now, 1200, 1400),
      player(redId, "Red", "red", "red-infantry", 1, now, 1600, 1412)
    ],
    spectators: [],
    admins: [],
    chat: [],
    events: [],
    commands: [],
    combatEvents: [],
    worldState: { roomId, hostId: blueId, tick: 0, updatedAt: now, vehicles: [], units: [], capturePoints: [] },
    updatedAt: now
  };
}
function player(id, name, team, slotId, seq, now, x, y) {
  return {
    id,
    playerId: id,
    name,
    nickname: name,
    team,
    slotId,
    roleId: "infantry",
    role: "infantry_leader",
    classId: "infantry",
    currentClassId: "infantry",
    weaponId: team === "blue" ? "rifle" : "machinegun",
    participantType: "player",
    ready: true,
    updatedAt: now,
    position: {
      x,
      y,
      stateSeq: seq,
      stateUpdatedAt: now,
      updatedAt: now,
      alive: true,
      deathState: "alive",
      hp: 100,
      maxHp: 100,
      weaponId: team === "blue" ? "rifle" : "machinegun",
      aimX: team === "blue" ? x + 220 : x - 220,
      aimY: y,
      angle: team === "blue" ? 0 : Math.PI
    }
  };
}

async function profile(page) {
  return page.eval(`(() => {
    const game = window.IronLine?.game;
    return { playerId: game?.localProfile?.playerId || "", nickname: game?.localProfile?.nickname || "" };
  })()`);
}
async function prepareActualPage(page, roomId, slotId, remoteId, baseX, baseY, direction) {
  page.resetMetrics();
  const result = await page.eval(`(async () => {
    const game = window.IronLine.game;
    window.__p09cStop?.();
    window.__p09cReset?.();
    localStorage.setItem("iron-line-selected-room-v1", ${JSON.stringify(roomId)});
    await window.IronLine.roomRegistry.refreshRemoteRooms();
    const room = window.IronLine.roomRegistry.getRoom(${JSON.stringify(roomId)});
    if (!room) return { ok: false, reason: "missing-room" };
    const opened = game.hud.sessionFlow.openLobby({ roomId: ${JSON.stringify(roomId)}, room, participantType: "player" });
    if (!opened) return { ok: false, reason: "open-lobby-failed", sessionMode: game.sessionMode, roomId: game.onlineSession?.roomId || "" };
    game.assignPlayerToSlot(game.onlineSession.playerId, ${JSON.stringify(slotId)}, { preserveReady: true });
    const local = game.localSessionPlayer();
    if (local) {
      local.ready = true;
      local.participantType = "player";
    }
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
    let startX = ${baseX};
    let startY = ${baseY};
    if (game.player) {
      startX = Number.isFinite(game.player.x) ? game.player.x : startX;
      startY = Number.isFinite(game.player.y) ? game.player.y : startY;
      game.player.angle = ${direction > 0 ? 0 : Math.PI};
      game.player.hp = 100;
      game.player.alive = true;
      game.player.inTank = null;
      game.player.inVehicle = null;
    }
    window.__p09cPatchRuntime?.();
    window.__p09cStartSessionSampler(${JSON.stringify(remoteId)});
    window.__p09cStartLocalMovement(startX, startY, ${direction});
    game.hud.sessionFlow.publishLocalPlayer(game, { force: true });
    return {
      ok: true,
      playerId: game.onlineSession.playerId,
      slotId: game.localSessionPlayer()?.slotId || "",
      sessionMode: game.sessionMode,
      matchStarted: game.matchStarted
    };
  })()`);
  if (!result?.ok || result.sessionMode !== "online" || !result.matchStarted) {
    throw new Error(`${page.name} production session setup failed: ${JSON.stringify(result)}`);
  }
}
async function stopPages(pages) {
  await Promise.all(pages.map((page) => page.eval("window.__p09cStop?.()").catch(() => null)));
}
async function collectPage(page) {
  const probe = await page.eval("window.__p09cCollect?.() || {}");
  const endpoints = {};
  for (const key of ["GET /api/rooms", "GET /api/rooms/:id", "POST /participants", "POST /api/rooms"]) {
    endpoints[key] = httpSummary(page.metrics, key);
  }
  return {
    name: page.name,
    env: probe.env || {},
    endpoints,
    ws: page.metrics.ws,
    frame: {
      ...stat(probe.frames || []),
      longFrames50: (probe.frames || []).filter((value) => value > 50).length
    },
    localStorage: { setItem: probe.storageSetItem || 0, bytes: probe.storageBytes || 0 },
    refreshRemoteRooms: { count: probe.refreshRemoteRooms || 0, ms: stat(probe.refreshRemoteRoomsMs || []) },
    relay: {
      attempts: probe.relay?.attempts || 0,
      sent: probe.relay?.sent || 0,
      noEnsure: probe.relay?.noEnsure || 0,
      notOpen: probe.relay?.notOpen || 0,
      readyStates: probe.relay?.readyStates || {},
      urls: probe.relay?.urls || [],
      socketOpen: probe.relay?.socketOpen || 0,
      socketClose: probe.relay?.socketClose || 0,
      socketError: probe.relay?.socketError || 0
    },
    wsAccepted: {
      count: probe.wsAccepted?.count || 0,
      updateGapMs: stat(probe.wsAccepted?.gapMs || []),
      snapPx: stat(probe.wsAccepted?.snapPx || []),
      ageMs: stat(probe.wsAccepted?.ageMs || []),
      staleRejects: probe.wsAccepted?.staleRejects || 0
    },
    session: {
      samples: probe.session?.samples || 0,
      missing: probe.session?.missing || 0,
      updates: probe.session?.updates || 0,
      updateGapMs: stat(probe.session?.gapMs || []),
      snapPx: stat(probe.session?.snapPx || []),
      ageMs: stat(probe.session?.ageMs || []),
      wsToSessionPx: stat(probe.session?.wsToSessionPx || []),
      seqBehindWs: stat(probe.session?.seqBehindWs || []),
      staleVsWs: probe.session?.staleVsWs || 0
    },
    render: {
      samples: probe.render?.samples || 0,
      entries: probe.render?.entries || 0,
      zeroEntryFrames: probe.render?.zeroEntryFrames || 0,
      renderToSessionPx: stat(probe.render?.renderToSessionPx || []),
      renderToWsPx: stat(probe.render?.renderToWsPx || []),
      alpha: stat(probe.render?.alpha || [])
    },
    errors: [...page.metrics.errors, ...(probe.errors || [])].slice(0, 10)
  };
}
function combineStat(pageSummaries, selector) {
  const values = [];
  for (const page of pageSummaries) values.push(...selector(page));
  return stat(values);
}
function decision(pageSummaries) {
  const totalRenderEntries = pageSummaries.reduce((sum, page) => sum + page.render.entries, 0);
  const totalWsAccepted = pageSummaries.reduce((sum, page) => sum + page.wsAccepted.count, 0);
  const totalRelaySent = pageSummaries.reduce((sum, page) => sum + page.relay.sent, 0);
  const staleSamples = pageSummaries.reduce((sum, page) => sum + page.session.staleVsWs, 0);
  const maxWsToSession = Math.max(...pageSummaries.map((page) => page.session.wsToSessionPx.max || 0));
  const longFrames = pageSummaries.reduce((sum, page) => sum + page.frame.longFrames50, 0);
  if (totalRelaySent === 0 || totalWsAccepted === 0) return "P0-9B production relay did not feed SessionFlow in this probe; hold and inspect socket setup.";
  if (totalRenderEntries === 0) return "Renderer did not draw remote humans in the production-session probe; hold and inspect match/session activation.";
  if (staleSamples > 0 || maxWsToSession > 24) return "Renderer path exists, but session players lag behind WS state; reinforce live-state precedence before new transport work.";
  if (longFrames > 0) return "Renderer uses live WS-backed session state, but frame stalls are present; classify as frame/render/GC rather than remote-position transport.";
  return "Renderer uses WS-backed session state in this probe; manual unchanged stutter is more likely non-position or unclassified manual perception.";
}
function markdownReport(report) {
  const lines = [
    "# P0-9C Manual Stutter Mismatch Probe",
    "",
    `Generated: ${report.generatedAt}`,
    `Measurement: ${report.measurement}`,
    `Decision: ${report.decision}`,
    "",
    "## Summary",
    "",
    "- P0-9A/P0-9B automated WS numbers are not sufficient by themselves because the older WS scenario measured a sidecar `window.__p0WsRemoteStates` cache, not the renderer input.",
    "- This probe samples the production path: `SessionFlow.applyRemotePlayerState -> game.onlineSession.players -> Renderer.remoteHumanPlayers`.",
    "- It does not reproduce manual human input feel; it only checks whether the improved WS state reaches the actual draw path.",
    "",
    "| Page | WS accepted | Session gap avg/p95/max ms | WS->session px avg/p95/max | Render entries | Render->session px avg/p95/max | Long frames | localStorage writes |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const page of report.pages) {
    lines.push(`| ${page.name} | ${page.wsAccepted.count} | ${page.session.updateGapMs.avg}/${page.session.updateGapMs.p95}/${page.session.updateGapMs.max} | ${page.session.wsToSessionPx.avg}/${page.session.wsToSessionPx.p95}/${page.session.wsToSessionPx.max} | ${page.render.entries} | ${page.render.renderToSessionPx.avg}/${page.render.renderToSessionPx.p95}/${page.render.renderToSessionPx.max} | ${page.frame.longFrames50} | ${page.localStorage.setItem} |`);
  }
  lines.push(
    "",
    "## Interpretation",
    "",
    report.interpretation,
    "",
    "## Next",
    "",
    report.nextRecommendation,
    ""
  );
  return `${lines.join("\n")}`;
}
function print(report) {
  console.log("\nP0-9C manual stutter mismatch probe");
  console.log(`Report: ${path.relative(root, report.reportPath)}`);
  console.log(`Decision: ${report.decision}`);
  console.table(report.pages.map((page) => ({
    page: page.name,
    relaySent: page.relay.sent,
    relayAttempts: page.relay.attempts,
    relayReadyStates: JSON.stringify(page.relay.readyStates),
    wsAccepted: page.wsAccepted.count,
    wsGapAvgP95Max: `${page.wsAccepted.updateGapMs.avg}/${page.wsAccepted.updateGapMs.p95}/${page.wsAccepted.updateGapMs.max}`,
    sessionGapAvgP95Max: `${page.session.updateGapMs.avg}/${page.session.updateGapMs.p95}/${page.session.updateGapMs.max}`,
    wsToSessionPx: `${page.session.wsToSessionPx.avg}/${page.session.wsToSessionPx.p95}/${page.session.wsToSessionPx.max}`,
    renderEntries: page.render.entries,
    renderToSessionPx: `${page.render.renderToSessionPx.avg}/${page.render.renderToSessionPx.p95}/${page.render.renderToSessionPx.max}`,
    frameMaxMs: page.frame.max,
    longFrames50: page.frame.longFrames50,
    storageWrites: page.localStorage.setItem,
    errors: page.errors.length
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
    const [blueProfile, redProfile] = await Promise.all(pages.map(profile));
    if (!blueProfile.playerId || !redProfile.playerId || blueProfile.playerId === redProfile.playerId) {
      throw new Error("Could not get distinct browser player profiles.");
    }
    const roomId = `P09C-${Date.now()}`;
    await requestJson("/api/rooms", { method: "POST", body: roomSeed(roomId, blueProfile.playerId, redProfile.playerId) });
    await prepareActualPage(pages[0], roomId, "blue-infantry", redProfile.playerId, 1200, 1400, 1);
    await prepareActualPage(pages[1], roomId, "red-infantry", blueProfile.playerId, 1600, 1412, -1);
    await sleep(Number(process.env.IRONLINE_P0_9C_DURATION_MS || 10000));
    await stopPages(pages);
    await sleep(700);
    const pageSummaries = await Promise.all(pages.map(collectPage));
    await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" }).catch(() => null);

    const maxWsToSession = Math.max(...pageSummaries.map((page) => page.session.wsToSessionPx.max || 0));
    const maxRenderToSession = Math.max(...pageSummaries.map((page) => page.render.renderToSessionPx.max || 0));
    const renderEntries = pageSummaries.reduce((sum, page) => sum + page.render.entries, 0);
    const longFrames = pageSummaries.reduce((sum, page) => sum + page.frame.longFrames50, 0);
    const report = {
      generatedAt: new Date().toISOString(),
      measurement: "headless Chrome production-session path probe, not manual human play",
      roomId,
      profiles: { blue: blueProfile.playerId, red: redProfile.playerId },
      pages: pageSummaries,
      aggregate: {
        wsAccepted: pageSummaries.reduce((sum, page) => sum + page.wsAccepted.count, 0),
        renderEntries,
        longFrames50: longFrames,
        maxWsToSessionPx: maxWsToSession,
        maxRenderToSessionPx: maxRenderToSession,
        frameMs: combineStat(pageSummaries, (page) => [page.frame.avg, page.frame.p95, page.frame.max].filter(Number.isFinite))
      },
      decision: decision(pageSummaries),
      interpretation: pageSummaries.reduce((sum, page) => sum + page.relay.sent, 0) > 0 && renderEntries > 0 && maxWsToSession <= 24
        ? "The renderer consumed remote humans from `game.onlineSession.players`, and those session positions stayed close to the last accepted production WS state. This makes a pure 'WS state never reaches draw' explanation unlikely for this automated path. The manual report still matters because this probe does not classify human-perceived input delay or whole-frame pauses."
        : "The production path did not stay aligned closely enough to clear the render-source question. Treat P0-9B as held until the mismatch is fixed or manually disproven.",
      nextRecommendation: "Do one manual classification pass with the existing performance overlay enabled and DevTools recording: label the perceived lag as remote-position snapping, whole-frame stall, or input latency before any combat/projectile WS expansion.",
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
