"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_P0_11B_PORT || 4331);
const baseUrl = `http://127.0.0.1:${appPort}`;
const roomsFile = path.join(root, ".data", `p0-11b-${process.pid}.json`);
const chromePath = process.env.CHROME_PATH || [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].find((item) => fs.existsSync(item));

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function distance(a = {}, b = {}) {
  return Math.round(Math.hypot((Number(a.x) || 0) - (Number(b.x) || 0), (Number(a.y) || 0) - (Number(b.y) || 0)) * 10) / 10;
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
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); } catch (error) { reject(error); }
      });
    }).on("error", reject);
  });
}
async function waitForTarget(port) {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await cdpJson(port, "/json/list");
      const page = list.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
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
    this.ws = new WebSocket(wsUrl);
    this.child = child;
    this.profileDir = profileDir;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.wsCounts = { sent: {}, received: {} };
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
      this.ws.on("message", (raw) => this.onMessage(raw));
    });
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    await this.send("Network.enable");
    this.on("Network.webSocketFrameSent", (p) => countWs(this.wsCounts.sent, p.response?.payloadData));
    this.on("Network.webSocketFrameReceived", (p) => countWs(this.wsCounts.received, p.response?.payloadData));
  }
  on(method, handler) {
    const handlers = this.handlers.get(method) || [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
  }
  onMessage(raw) {
    const message = JSON.parse(raw.toString());
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result || {});
      return;
    }
    for (const handler of this.handlers.get(message.method) || []) handler(message.params || {});
  }
  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(`${this.name}: ${result.exceptionDetails.text || "evaluate failed"}`);
    return result.result?.value;
  }
  async navigate(url) {
    await this.send("Page.navigate", { url });
    await waitForExpression(this, "document.readyState === 'complete' && !!window.IronLine?.game?.hud?.sessionFlow", 14000);
  }
  async close() {
    try { this.ws.close(); } catch (_error) {}
    try { this.child.kill(); } catch (_error) {}
    await sleep(200);
    try { fs.rmSync(this.profileDir, { recursive: true, force: true }); } catch (_error) {}
  }
}
function countWs(target, raw) {
  try {
    const type = JSON.parse(raw || "{}").type || "unknown";
    target[type] = (target[type] || 0) + 1;
  } catch (_error) {
    target.unknown = (target.unknown || 0) + 1;
  }
}
async function waitForExpression(page, expression, timeoutMs = 9000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { if (await page.eval(`Boolean(${expression})`)) return true; } catch (_error) {}
    await sleep(160);
  }
  throw new Error(`${page.name} timed out waiting for ${expression}`);
}
async function launchPage(name, debugPort, originHost) {
  const profileDir = path.join(os.tmpdir(), `iron-line-p0-11b-${name}-${process.pid}`);
  fs.rmSync(profileDir, { recursive: true, force: true });
  const args = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "about:blank"
  ];
  const child = spawn(chromePath, args, { stdio: "ignore", windowsHide: true });
  const page = new CdpPage(name, debugPort, await waitForTarget(debugPort), child, profileDir);
  await page.open();
  await page.navigate(`http://${originHost}:${appPort}/index.html?roomsApi=${encodeURIComponent(baseUrl)}&p0=11b`);
  await installBrowserProbe(page);
  return page;
}

function player(id, team, slotId, seq = 1, x = 1200, y = 1400) {
  const now = Date.now();
  return {
    id, playerId: id, name: id, nickname: id, team, slotId,
    participantType: "player", ready: true, host: team === "blue", updatedAt: now,
    position: {
      x, y, stateSeq: seq, stateUpdatedAt: now, updatedAt: now,
      alive: true, deathState: "alive", hp: 100, maxHp: 100,
      weaponId: team === "blue" ? "rifle" : "machinegun",
      aimX: team === "blue" ? x + 220 : x - 220, aimY: y,
      angle: team === "blue" ? 0 : Math.PI
    }
  };
}
function roomSeed(roomId, phase = "playing", players = [player("p0-blue", "blue", "blue-infantry"), player("p0-red", "red", "red-infantry", 1, 1600, 1412)]) {
  const now = Date.now();
  return {
    id: roomId, name: roomId, mode: "annihilation", phase, capacity: 8, locked: phase === "playing",
    blueFactionId: "korea", redFactionId: "russia", aiFillEmptySlots: false,
    players, spectators: [], admins: [], chat: [], events: [], commands: [], combatEvents: [],
    worldState: { roomId, hostId: players[0]?.id || "p0-blue", tick: 0, updatedAt: now, vehicles: [], units: [], capturePoints: [] },
    startedAt: phase === "playing" ? now - 2000 : 0,
    updatedAt: now
  };
}

async function installBrowserProbe(page) {
  await page.eval(`(() => {
    window.__p011b = { applies: [], publishes: [], renders: [], selfIgnored: 0, staleRejected: 0, errors: [] };
    window.onerror = (message) => window.__p011b.errors.push(String(message));
    const flow = window.IronLine?.game?.hud?.sessionFlow;
    if (flow && !flow.__p011bPatched) {
      const originalApply = flow.applyRemotePlayerState.bind(flow);
      flow.applyRemotePlayerState = function(payload = {}) {
        const game = window.IronLine.game;
        const localId = game?.onlineSession?.playerId || "";
        const playerId = String(payload.playerId || "");
        const before = game?.onlineSession?.players?.find((item) => item.id === playerId) || null;
        const result = originalApply(payload);
        const after = game?.onlineSession?.players?.find((item) => item.id === playerId) || null;
        if (playerId && playerId === localId) window.__p011b.selfIgnored += 1;
        if (before?.position && after?.position && before.position.stateSeq > (payload.state?.stateSeq || 0) && !result) window.__p011b.staleRejected += 1;
        window.__p011b.applies.push({
          playerId, localId, result: Boolean(result), team: payload.team || "",
          slotId: payload.slotId || "", stateSeq: Number(payload.state?.stateSeq) || 0,
          x: Number(payload.state?.x) || 0, y: Number(payload.state?.y) || 0,
          afterX: Number(after?.position?.x ?? after?.x) || 0,
          afterY: Number(after?.position?.y ?? after?.y) || 0,
          afterTeam: after?.team || "", afterSlotId: after?.slotId || "", at: Date.now()
        });
        return result;
      };
      const originalPublish = flow.publishPlayerStateRelay.bind(flow);
      flow.publishPlayerStateRelay = function(game, player, position, now) {
        const result = originalPublish(game, player, position, now);
        window.__p011b.publishes.push({
          playerId: game?.onlineSession?.playerId || "", team: player?.team || "",
          slotId: player?.slotId || "", stateSeq: Number(position?.stateSeq) || 0,
          x: Number(position?.x) || 0, y: Number(position?.y) || 0, result: Boolean(result), at: Date.now()
        });
        return result;
      };
      flow.__p011bPatched = true;
    }
    const renderer = window.IronLine?.game?.renderer;
    if (renderer && !renderer.__p011bPatched) {
      const originalRemote = renderer.remoteHumanPlayers.bind(renderer);
      renderer.remoteHumanPlayers = function(game) {
        const entries = originalRemote(game);
        window.__p011b.renders.push({
          at: Date.now(),
          entries: entries.map((entry) => ({
            id: entry.id, team: entry.unit?.team || "", x: Math.round(entry.unit?.x || 0), y: Math.round(entry.unit?.y || 0)
          }))
        });
        return entries;
      };
      renderer.__p011bPatched = true;
    }
    window.__p011bStop = function() {
      for (const id of window.__p011bIntervals || []) clearInterval(id);
      window.__p011bIntervals = [];
    };
    window.__p011bIntervals = [];
  })()`);
}

async function configurePlayerPage(page, roomId, id, nickname, team, slotId, x, y) {
  const result = await page.eval(`(async () => {
    const game = window.IronLine.game;
    const flow = game.hud.sessionFlow;
    const requestedId = ${JSON.stringify(id)};
    game.localProfile = game.applySessionPlayerIdToProfile?.({
      ...(game.localProfile || game.defaultLocalProfile?.() || {}),
      persistentPlayerId: requestedId,
      playerId: requestedId,
      nickname: ${JSON.stringify(nickname)},
      factionId: ${JSON.stringify(team === "red" ? "russia" : "korea")},
      skinId: ${JSON.stringify(team === "red" ? "russia" : "korea")},
      updatedAt: Date.now()
    }) || game.localProfile;
    game.saveLocalProfile?.(game.localProfile);
    game.applyLocalProfile?.();
    flow.closePlayerStateSocket?.();
    flow.remotePlayerStateBuffer?.clear?.();
    game.onlineSession = game.createLocalSession?.() || game.onlineSession;
    game.applyLocalProfile?.();
    await window.IronLine.roomRegistry.refreshRemoteRooms();
    const room = window.IronLine.roomRegistry.getRoom(${JSON.stringify(roomId)}) ||
      window.IronLine.roomRegistry.listRooms().find((item) => item.id === ${JSON.stringify(roomId)});
    flow.enterOnline(game.localProfile);
    flow.joinOnlineRoom(room, { participantType: "player" });
    game.assignPlayerToSlot?.(game.onlineSession.playerId, ${JSON.stringify(slotId)}, { preserveReady: true });
    game.onlineSession.roomId = ${JSON.stringify(roomId)};
    game.onlineSession.participantType = "player";
    game.sessionMode = "online";
    game.lobbyOpen = false;
    game.roomListOpen = false;
    game.matchStarted = true;
    game.matchPhase = "live";
    if (game.player) {
      game.player.team = ${JSON.stringify(team)};
      game.player.factionId = ${JSON.stringify(team === "red" ? "russia" : "korea")};
      game.player.skinId = game.player.factionId;
      game.player.x = ${Math.round(x)};
      game.player.y = ${Math.round(y)};
      game.player.angle = ${team === "red" ? Math.PI : 0};
      game.player.hp = 100;
    }
    const local = game.localSessionPlayer?.();
    if (local) {
      local.id = game.onlineSession.playerId;
      local.playerId = game.onlineSession.playerId;
      local.name = ${JSON.stringify(nickname)};
      local.nickname = ${JSON.stringify(nickname)};
      local.team = ${JSON.stringify(team)};
      local.slotId = ${JSON.stringify(slotId)};
      local.participantType = "player";
      local.ready = true;
    }
    for (const slot of game.onlineSession.roleSlots || []) {
      if (slot.playerId === game.onlineSession.playerId || slot.id === ${JSON.stringify(slotId)}) {
        slot.playerId = slot.id === ${JSON.stringify(slotId)} ? game.onlineSession.playerId : null;
        slot.aiControlled = slot.id !== ${JSON.stringify(slotId)};
        slot.controllerType = slot.id === ${JSON.stringify(slotId)} ? "human" : "bot";
      }
    }
    flow.publishLocalPlayer(game, { force: true });
    return {
      ok: true,
      requestedId: ${JSON.stringify(id)},
      playerId: game.onlineSession.playerId,
      team: local?.team || "",
      slotId: local?.slotId || "",
      persistentPlayerId: game.localProfile?.persistentPlayerId || ""
    };
  })()`);
  await waitForExpression(page, `window.IronLine.game?.onlineSession?.roomId === ${JSON.stringify(roomId)}`, 5000);
  return result;
}

async function startPageMotion(page, baseX, baseY, direction = 1) {
  await page.eval(`(() => {
    const game = window.IronLine.game;
    const flow = game.hud.sessionFlow;
    let seq = 0;
    const id = setInterval(() => {
      seq += 1;
      if (game.player) {
        game.player.x = ${Math.round(baseX)} + seq * ${direction * 7};
        game.player.y = ${Math.round(baseY)} + Math.sin(seq / 4) * 18;
      }
      flow.publishLocalPlayer(game, { force: true });
      game.renderer?.remoteHumanPlayers?.(game);
    }, 90);
    window.__p011bIntervals.push(id);
  })()`);
}

async function collectBrowserState(page, expectedRemoteId) {
  return page.eval(`(() => {
    const game = window.IronLine.game;
    const probe = window.__p011b || { applies: [], publishes: [], renders: [], selfIgnored: 0, staleRejected: 0, errors: [] };
    const players = (game.onlineSession?.players || []).map((player) => ({
      id: player.id, team: player.team, slotId: player.slotId, participantType: player.participantType || "player",
      x: Number(player.position?.x ?? player.x) || 0, y: Number(player.position?.y ?? player.y) || 0,
      stateSeq: Number(player.position?.stateSeq ?? player.stateSeq) || 0
    }));
    const remote = players.find((player) => player.id === ${JSON.stringify(expectedRemoteId)}) || null;
    const lastRender = probe.renders[probe.renders.length - 1] || { entries: [] };
    const render = lastRender.entries.find((entry) => entry.id === ${JSON.stringify(expectedRemoteId)}) || null;
    return {
      localId: game.onlineSession?.playerId || "",
      players,
      remote,
      render,
      applyCount: probe.applies.filter((item) => item.playerId === ${JSON.stringify(expectedRemoteId)}).length,
      applyAccepted: probe.applies.filter((item) => item.playerId === ${JSON.stringify(expectedRemoteId)} && item.result).length,
      selfIgnored: probe.selfIgnored,
      staleRejected: probe.staleRejected,
      publishCount: probe.publishes.length,
      lastApply: probe.applies.filter((item) => item.playerId === ${JSON.stringify(expectedRemoteId)}).slice(-1)[0] || null,
      lastPublish: probe.publishes.slice(-1)[0] || null,
      errors: probe.errors.slice(0, 8)
    };
  })()`);
}

async function verifyFourPlayerLobby() {
  const roomId = `P011B-LOBBY-${Date.now()}`;
  await requestJson("/api/rooms", { method: "POST", body: roomSeed(roomId, "waiting", []) });
  const players = [
    player("p0-blue-1", "blue", "blue-infantry"),
    player("p0-red-1", "red", "red-infantry", 1, 1600, 1400),
    player("p0-blue-2", "blue", "blue-engineer", 1, 1240, 1440),
    player("p0-red-2", "red", "red-engineer", 1, 1640, 1440)
  ];
  for (const participant of players) {
    await requestJson(`/api/rooms/${encodeURIComponent(roomId)}/participants`, { method: "POST", body: participant });
  }
  const room = (await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`)).room;
  await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" }).catch(() => null);
  const slotIds = new Set((room.players || []).map((item) => item.slotId).filter(Boolean));
  return {
    roomId,
    players: room.players?.length || 0,
    capacity: room.capacity || 0,
    spectatorCapacity: room.spectatorCapacity,
    slotIds: Array.from(slotIds),
    ok: (room.players?.length || 0) >= 4 && (room.capacity || 0) >= 4 && slotIds.size >= 4
  };
}

function openWsPlayer(roomId, id, nickname, team, slotId) {
  const ws = new WebSocket(`ws://127.0.0.1:${appPort}/ws`);
  const received = [];
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${id} ws join timed out`)), 5000);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", roomId, playerId: id, nickname, participantType: "player", team, slotId })));
    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === "player_state") received.push(message.payload);
      if (message.type === "join_result") {
        clearTimeout(timer);
        if (!message.payload?.ok) reject(new Error(`${id} join failed: ${message.payload?.reason}`));
        else resolve({ ws, received });
      }
    });
    ws.on("error", reject);
  });
}
async function verifyServerRelay() {
  const roomId = `P011B-WS-${Date.now()}`;
  await requestJson("/api/rooms", { method: "POST", body: roomSeed(roomId) });
  const blue = await openWsPlayer(roomId, "p0-blue", "Blue", "blue", "blue-infantry");
  const red = await openWsPlayer(roomId, "p0-red", "Red", "red", "red-infantry");
  for (let seq = 1; seq <= 8; seq += 1) {
    const now = Date.now();
    blue.ws.send(JSON.stringify({ type: "player_state", roomId, playerId: "p0-blue", team: "blue", slotId: "blue-infantry", state: { x: 1200 + seq * 11, y: 1400, stateSeq: seq, updatedAt: now, alive: true, hp: 100, maxHp: 100 }, sentAt: now }));
    red.ws.send(JSON.stringify({ type: "player_state", roomId, playerId: "p0-red", team: "red", slotId: "red-infantry", state: { x: 1600 - seq * 9, y: 1410, stateSeq: seq, updatedAt: now, alive: true, hp: 100, maxHp: 100 }, sentAt: now }));
    await sleep(45);
  }
  await sleep(500);
  blue.ws.close();
  red.ws.close();
  await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" }).catch(() => null);
  const blueSawRed = blue.received.filter((payload) => payload.playerId === "p0-red");
  const redSawBlue = red.received.filter((payload) => payload.playerId === "p0-blue");
  const lastRed = blueSawRed[blueSawRed.length - 1] || {};
  const lastBlue = redSawBlue[redSawBlue.length - 1] || {};
  return {
    roomId,
    blueSawRed: blueSawRed.length,
    redSawBlue: redSawBlue.length,
    lastRed: { team: lastRed.team, slotId: lastRed.slotId, stateSeq: lastRed.state?.stateSeq, x: lastRed.state?.x },
    lastBlue: { team: lastBlue.team, slotId: lastBlue.slotId, stateSeq: lastBlue.state?.stateSeq, x: lastBlue.state?.x },
    ok: blueSawRed.length > 0 && redSawBlue.length > 0 && lastRed.team === "red" && lastRed.slotId === "red-infantry" && lastBlue.team === "blue"
  };
}

async function verifyBrowserCase(pages, def) {
  const roomId = `P011B-BROWSER-${Date.now()}-${def.name}`;
  const blueId = def.duplicateId || "p0-blue";
  const redId = def.duplicateId || "p0-red";
  await requestJson("/api/rooms", {
    method: "POST",
    body: roomSeed(roomId, "playing", [])
  });
  const blueJoin = await configurePlayerPage(pages[0], roomId, blueId, "Blue", "blue", "blue-infantry", 1200, 1400);
  const redJoin = await configurePlayerPage(pages[1], roomId, redId, "Red", "red", "red-infantry", 1600, 1412);
  await Promise.all([startPageMotion(pages[0], 1200, 1400, 1), startPageMotion(pages[1], 1600, 1412, -1)]);
  await sleep(5200);
  await Promise.all(pages.map((page) => page.eval("window.__p011bStop?.()").catch(() => null)));
  const blue = await collectBrowserState(pages[0], redJoin.playerId);
  const red = await collectBrowserState(pages[1], blueJoin.playerId);
  await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" }).catch(() => null);
  const duplicateRepaired = Boolean(def.duplicateId && blueJoin.playerId !== redJoin.playerId);
  return {
    name: def.name,
    roomId,
    duplicateId: def.duplicateId || "",
    joins: { blue: blueJoin, red: redJoin, duplicateRepaired },
    blue: { ...blue, ws: pages[0].wsCounts, renderDelta: blue.remote && blue.render ? distance(blue.remote, blue.render) : null },
    red: { ...red, ws: pages[1].wsCounts, renderDelta: red.remote && red.render ? distance(red.remote, red.render) : null },
    ok: Boolean(
      blue.remote?.team === "red" &&
      red.remote?.team === "blue" &&
      blue.render &&
      red.render &&
      blue.selfIgnored === 0 &&
      red.selfIgnored === 0 &&
      (!def.duplicateId || duplicateRepaired)
    )
  };
}

function decision(results) {
  if (!results.fourPlayerLobby.ok) return "player_only_capacity_regression";
  if (!results.serverRelay.ok) return "player_state_ws_server_relay";
  const distinct = results.browser.find((item) => item.name === "distinct_player_ids");
  const duplicate = results.browser.find((item) => item.name === "duplicate_player_id_risk");
  if (!distinct?.ok) return "player_state_client_render_apply";
  if (!duplicate?.ok) return "duplicate_player_id_identity_collision";
  if (duplicate?.joins?.duplicateRepaired) return "duplicate_player_id_repaired";
  return "no_high_risk_reproduced";
}

async function main() {
  if (!chromePath) throw new Error("Chrome or Edge executable was not found.");
  const server = spawn(process.execPath, ["tools/static-server.cjs", String(appPort)], {
    cwd: root,
    env: { ...process.env, HOST: "0.0.0.0", PORT: String(appPort), IRONLINE_ROOMS_FILE: roomsFile },
    stdio: "ignore",
    windowsHide: true
  });
  const pages = [];
  try {
    await waitForServer();
    const fourPlayerLobby = await verifyFourPlayerLobby();
    const serverRelay = await verifyServerRelay();
    pages.push(await launchPage("blue", appPort + 101, "127.0.0.1"));
    pages.push(await launchPage("red", appPort + 102, "localhost"));
    const browser = [];
    browser.push(await verifyBrowserCase(pages, { name: "distinct_player_ids" }));
    browser.push(await verifyBrowserCase(pages, { name: "duplicate_player_id_risk", duplicateId: "p0-shared" }));
    const results = {
      ok: true,
      measurement: "P0-11B player_state red-side sync / remote render-apply gate",
      fourPlayerLobby,
      serverRelay,
      browser
    };
    results.decision = decision(results);
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await Promise.all(pages.map((page) => page.eval("window.__p011bStop?.()").catch(() => null)));
    await Promise.all(pages.map((page) => page.close()));
    try { server.kill(); } catch (_error) {}
    try {
      if (fs.existsSync(roomsFile)) fs.unlinkSync(roomsFile);
      if (fs.existsSync(`${roomsFile}.tmp`)) fs.unlinkSync(`${roomsFile}.tmp`);
    } catch (_error) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
