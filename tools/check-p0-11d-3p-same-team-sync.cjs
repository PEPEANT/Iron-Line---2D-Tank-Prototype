"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_P0_11D_PORT || 4332);
const baseUrl = `http://127.0.0.1:${appPort}`;
const roomsFile = path.join(root, ".data", `p0-11d-${process.pid}.json`);
const chromePath = process.env.CHROME_PATH || [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].find((item) => fs.existsSync(item));

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
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
  const profileDir = path.join(os.tmpdir(), `iron-line-p0-11d-${name}-${process.pid}`);
  fs.rmSync(profileDir, { recursive: true, force: true });
  const child = spawn(chromePath, [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "about:blank"
  ], { stdio: "ignore", windowsHide: true });
  const page = new CdpPage(name, debugPort, await waitForTarget(debugPort), child, profileDir);
  await page.open();
  await page.navigate(`http://${originHost}:${appPort}/index.html?roomsApi=${encodeURIComponent(baseUrl)}&p0=11d`);
  await installProbe(page);
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
function roomSeed(roomId, phase = "playing", players = []) {
  const now = Date.now();
  return {
    id: roomId, name: roomId, mode: "annihilation", phase, capacity: 8, locked: phase === "playing",
    blueFactionId: "korea", redFactionId: "russia", aiFillEmptySlots: false,
    players, spectators: [], admins: [], chat: [], events: [], commands: [], combatEvents: [],
    worldState: { roomId, hostId: players[0]?.id || "p0-blue-1", tick: 0, updatedAt: now, vehicles: [], units: [], capturePoints: [] },
    startedAt: phase === "playing" ? now - 2000 : 0,
    updatedAt: now
  };
}

async function installProbe(page) {
  await page.eval(`(() => {
    window.__p011d = { applies: [], renders: [], selfIgnored: 0, staleRejected: 0, errors: [] };
    window.onerror = (message) => window.__p011d.errors.push(String(message));
    const flow = window.IronLine?.game?.hud?.sessionFlow;
    if (flow && !flow.__p011dPatched) {
      const originalApply = flow.applyRemotePlayerState.bind(flow);
      flow.applyRemotePlayerState = function(payload = {}) {
        const game = window.IronLine.game;
        const localId = game?.onlineSession?.playerId || "";
        const playerId = String(payload.playerId || "");
        const result = originalApply(payload);
        const after = game?.onlineSession?.players?.find((item) => item.id === playerId) || null;
        if (playerId && playerId === localId) window.__p011d.selfIgnored += 1;
        window.__p011d.applies.push({
          playerId, localId, result: Boolean(result), team: payload.team || "",
          slotId: payload.slotId || "", stateSeq: Number(payload.state?.stateSeq) || 0,
          x: Number(payload.state?.x) || 0, y: Number(payload.state?.y) || 0,
          afterX: Number(after?.position?.x ?? after?.x) || 0,
          afterY: Number(after?.position?.y ?? after?.y) || 0,
          afterTeam: after?.team || "", afterSlotId: after?.slotId || "", at: Date.now()
        });
        return result;
      };
      flow.__p011dPatched = true;
    }
    const renderer = window.IronLine?.game?.renderer;
    if (renderer && !renderer.__p011dPatched) {
      const originalRemote = renderer.remoteHumanPlayers.bind(renderer);
      renderer.remoteHumanPlayers = function(game) {
        const entries = originalRemote(game);
        window.__p011d.renders.push({
          at: Date.now(),
          entries: entries.map((entry) => ({
            id: entry.id, team: entry.unit?.team || "", x: Math.round(entry.unit?.x || 0), y: Math.round(entry.unit?.y || 0)
          }))
        });
        return entries;
      };
      renderer.__p011dPatched = true;
    }
  })()`);
}

async function configurePlayerPage(page, roomId, spec) {
  const result = await page.eval(`(async () => {
    const game = window.IronLine.game;
    const flow = game.hud.sessionFlow;
    const requestedId = ${JSON.stringify(spec.id)};
    game.localProfile = game.applySessionPlayerIdToProfile?.({
      ...(game.localProfile || game.defaultLocalProfile?.() || {}),
      persistentPlayerId: requestedId,
      playerId: requestedId,
      nickname: ${JSON.stringify(spec.nickname)},
      factionId: ${JSON.stringify(spec.team === "red" ? "russia" : "korea")},
      skinId: ${JSON.stringify(spec.team === "red" ? "russia" : "korea")},
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
    game.assignPlayerToSlot?.(game.onlineSession.playerId, ${JSON.stringify(spec.slotId)}, { preserveReady: true });
    game.onlineSession.roomId = ${JSON.stringify(roomId)};
    game.onlineSession.participantType = "player";
    game.sessionMode = "online";
    game.lobbyOpen = false;
    game.roomListOpen = false;
    game.matchStarted = true;
    game.matchPhase = "live";
    if (game.player) {
      game.player.team = ${JSON.stringify(spec.team)};
      game.player.factionId = ${JSON.stringify(spec.team === "red" ? "russia" : "korea")};
      game.player.skinId = game.player.factionId;
      game.player.x = ${Math.round(spec.x)};
      game.player.y = ${Math.round(spec.y)};
      game.player.angle = ${spec.team === "red" ? Math.PI : 0};
      game.player.hp = 100;
    }
    const local = game.localSessionPlayer?.();
    if (local) {
      local.id = game.onlineSession.playerId;
      local.playerId = game.onlineSession.playerId;
      local.name = ${JSON.stringify(spec.nickname)};
      local.nickname = ${JSON.stringify(spec.nickname)};
      local.team = ${JSON.stringify(spec.team)};
      local.slotId = ${JSON.stringify(spec.slotId)};
      local.participantType = "player";
      local.ready = true;
    }
    flow.publishLocalPlayer(game, { force: true });
    return {
      requestedId,
      playerId: game.onlineSession.playerId,
      team: local?.team || "",
      slotId: local?.slotId || "",
      persistentPlayerId: game.localProfile?.persistentPlayerId || ""
    };
  })()`);
  await waitForExpression(page, `window.IronLine.game?.onlineSession?.roomId === ${JSON.stringify(roomId)}`, 5000);
  return result;
}

async function injectRemoteStates(page, roomId, remotes) {
  await page.eval(`(() => {
    const game = window.IronLine.game;
    const flow = game.hud.sessionFlow;
    const remotes = ${JSON.stringify(remotes)};
    for (const item of remotes) {
      flow.applyRemotePlayerState({
        roomId: ${JSON.stringify(roomId)},
        playerId: item.playerId,
        name: item.nickname,
        team: item.team,
        slotId: item.slotId,
        weaponId: item.weaponId || "rifle",
        state: {
          x: item.x, y: item.y, stateSeq: item.stateSeq, updatedAt: Date.now(),
          stateUpdatedAt: Date.now(), alive: true, hp: 100, maxHp: 100,
          weaponId: item.weaponId || "rifle", aimX: item.x + (item.team === "blue" ? 140 : -140), aimY: item.y
        },
        sentAt: Date.now()
      }, game);
    }
    game.renderer?.remoteHumanPlayers?.(game);
  })()`);
}

async function collectBrowserState(page, expectedRemotes) {
  return page.eval(`(() => {
    const game = window.IronLine.game;
    const probe = window.__p011d || { applies: [], renders: [], selfIgnored: 0, staleRejected: 0, errors: [] };
    game.renderer?.remoteHumanPlayers?.(game);
    const players = (game.onlineSession?.players || []).map((player) => ({
      id: player.id, team: player.team, slotId: player.slotId, participantType: player.participantType || "player",
      x: Number(player.position?.x ?? player.x) || 0, y: Number(player.position?.y ?? player.y) || 0,
      stateSeq: Number(player.position?.stateSeq ?? player.stateSeq) || 0
    }));
    const lastRender = probe.renders[probe.renders.length - 1] || { entries: [] };
    const expected = ${JSON.stringify(expectedRemotes)};
    return {
      localId: game.onlineSession?.playerId || "",
      players,
      bufferIds: Array.from(game.hud?.sessionFlow?.remotePlayerStateBuffer?.keys?.() || []),
      remotes: expected.map((remote) => {
        const sessionPlayer = players.find((player) => player.id === remote.playerId) || null;
        const render = lastRender.entries.find((entry) => entry.id === remote.playerId) || null;
        const applies = probe.applies.filter((item) => item.playerId === remote.playerId);
        return {
          expected: remote,
          sessionPlayer,
          render,
          applyCount: applies.length,
          applyAccepted: applies.filter((item) => item.result).length,
          lastApply: applies.slice(-1)[0] || null,
          renderDelta: sessionPlayer && render ? Math.round(Math.hypot((Number(sessionPlayer.x) || 0) - (Number(render.x) || 0), (Number(sessionPlayer.y) || 0) - (Number(render.y) || 0)) * 10) / 10 : null
        };
      }),
      selfIgnored: probe.selfIgnored,
      staleRejected: probe.staleRejected,
      errors: probe.errors.slice(0, 8)
    };
  })()`);
}

function openWsPlayer(roomId, spec) {
  const ws = new WebSocket(`ws://127.0.0.1:${appPort}/ws`);
  const received = [];
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${spec.id} ws join timed out`)), 5000);
    ws.on("open", () => ws.send(JSON.stringify({
      type: "join", roomId, playerId: spec.id, nickname: spec.nickname,
      participantType: "player", team: spec.team, slotId: spec.slotId
    })));
    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === "player_state") received.push(message.payload);
      if (message.type === "join_result") {
        clearTimeout(timer);
        if (!message.payload?.ok) reject(new Error(`${spec.id} join failed: ${message.payload?.reason}`));
        else resolve({ ws, received });
      }
    });
    ws.on("error", reject);
  });
}

async function verifyServerRelay3p(specs) {
  const roomId = `P011D-WS-${Date.now()}`;
  await requestJson("/api/rooms", { method: "POST", body: roomSeed(roomId, "playing", specs.map((spec) => player(spec.id, spec.team, spec.slotId, 1, spec.x, spec.y))) });
  const clients = {};
  for (const spec of specs) clients[spec.id] = await openWsPlayer(roomId, spec);
  for (let seq = 1; seq <= 8; seq += 1) {
    const now = Date.now();
    for (const spec of specs) {
      clients[spec.id].ws.send(JSON.stringify({
        type: "player_state",
        roomId,
        playerId: spec.id,
        team: spec.team,
        slotId: spec.slotId,
        state: { x: spec.x + seq * spec.dx, y: spec.y + seq * spec.dy, stateSeq: seq, updatedAt: now, alive: true, hp: 100, maxHp: 100 },
        sentAt: now
      }));
    }
    await sleep(45);
  }
  await sleep(500);
  Object.values(clients).forEach((client) => client.ws.close());
  await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" }).catch(() => null);
  const byClient = {};
  for (const spec of specs) {
    byClient[spec.id] = specs
      .filter((other) => other.id !== spec.id)
      .map((other) => {
        const packets = clients[spec.id].received.filter((payload) => payload.playerId === other.id);
        const last = packets[packets.length - 1] || {};
        return {
          remoteId: other.id,
          sameTeam: other.team === spec.team,
          packets: packets.length,
          lastTeam: last.team || "",
          lastSlotId: last.slotId || "",
          lastSeq: last.state?.stateSeq || 0
        };
      });
  }
  const allOk = Object.values(byClient).flat().every((item) => item.packets > 0 && item.lastTeam && item.lastSlotId && item.lastSeq >= 8);
  return { roomId, byClient, ok: allOk };
}

async function verifyBrowser3p(pages, specs) {
  const roomId = `P011D-BROWSER-${Date.now()}`;
  await requestJson("/api/rooms", { method: "POST", body: roomSeed(roomId, "playing", []) });
  const joins = {};
  for (let i = 0; i < specs.length; i += 1) {
    joins[specs[i].id] = await configurePlayerPage(pages[i], roomId, specs[i]);
  }
  const runtimeSpecs = specs.map((spec) => ({ ...spec, playerId: joins[spec.id].playerId }));
  for (let i = 0; i < pages.length; i += 1) {
    const remotes = runtimeSpecs
      .filter((spec) => spec.playerId !== joins[specs[i].id].playerId)
      .map((spec, index) => ({ ...spec, stateSeq: 100 + index }));
    await injectRemoteStates(pages[i], roomId, remotes);
  }
  await sleep(300);
  const byClient = {};
  for (let i = 0; i < pages.length; i += 1) {
    const local = runtimeSpecs[i];
    const expected = runtimeSpecs.filter((spec) => spec.playerId !== local.playerId);
    byClient[local.id] = await collectBrowserState(pages[i], expected);
  }
  await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" }).catch(() => null);
  const uniquePlayerIds = new Set(Object.values(joins).map((join) => join.playerId)).size === specs.length;
  const uniqueSlotIds = new Set(Object.values(joins).map((join) => join.slotId)).size === specs.length;
  const remoteChecks = Object.values(byClient).flatMap((client) => client.remotes);
  const sameTeamChecks = Object.entries(byClient).flatMap(([id, client]) => {
    const local = runtimeSpecs.find((spec) => spec.id === id);
    return client.remotes.filter((remote) => remote.expected.team === local?.team);
  });
  const ok = uniquePlayerIds &&
    uniqueSlotIds &&
    remoteChecks.every((item) => item.sessionPlayer && item.render && item.applyAccepted > 0 && item.renderDelta !== null && item.renderDelta <= 2) &&
    sameTeamChecks.length >= 2 &&
    sameTeamChecks.every((item) => item.sessionPlayer && item.render && item.applyAccepted > 0) &&
    Object.values(byClient).every((client) => client.selfIgnored === 0 && client.errors.length === 0);
  return { roomId, joins, uniquePlayerIds, uniqueSlotIds, byClient, ok };
}

function decision(results) {
  if (!results.serverRelay3p.ok) return "3p_player_state_ws_relay";
  if (!results.browser3p.uniquePlayerIds || !results.browser3p.uniqueSlotIds) return "3p_identity_or_slot_collision";
  if (!results.browser3p.ok) return "3p_same_team_client_apply_render";
  return "no_high_risk_reproduced";
}

async function main() {
  if (!chromePath) throw new Error("Chrome or Edge executable was not found.");
  const specs = [
    { id: "p0-blue-1", nickname: "Blue 1", team: "blue", slotId: "blue-infantry", x: 1250, y: 1450, dx: 9, dy: 0 },
    { id: "p0-blue-2", nickname: "Blue 2", team: "blue", slotId: "blue-engineer", x: 1370, y: 1510, dx: 7, dy: 2 },
    { id: "p0-red-1", nickname: "Red 1", team: "red", slotId: "red-infantry", x: 1660, y: 1420, dx: -8, dy: 1 }
  ];
  const server = spawn(process.execPath, ["tools/static-server.cjs", String(appPort)], {
    cwd: root,
    env: { ...process.env, HOST: "0.0.0.0", PORT: String(appPort), IRONLINE_ROOMS_FILE: roomsFile },
    stdio: "ignore",
    windowsHide: true
  });
  const pages = [];
  try {
    await waitForServer();
    const serverRelay3p = await verifyServerRelay3p(specs);
    pages.push(await launchPage("blue1", appPort + 111, "127.0.0.1"));
    pages.push(await launchPage("blue2", appPort + 112, "localhost"));
    pages.push(await launchPage("red1", appPort + 113, "127.0.0.1"));
    const browser3p = await verifyBrowser3p(pages, specs);
    const results = {
      ok: true,
      measurement: "P0-11D 3P same-team remote player_state apply/render gate",
      serverRelay3p,
      browser3p
    };
    results.decision = decision(results);
    console.log(JSON.stringify(results, null, 2));
  } finally {
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
