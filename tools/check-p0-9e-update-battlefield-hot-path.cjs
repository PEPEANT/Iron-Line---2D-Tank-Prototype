"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { httpSummary, launchPage, makeRequestJson, sleep, stat, waitForServer } = require("./p0-browser-cdp-helper.cjs");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_P0_9E_PORT || 4373);
const baseUrl = `http://127.0.0.1:${appPort}`;
const requestJson = makeRequestJson(baseUrl);
const roomsFile = path.join(root, ".data", `p0-9e-hotpath-${process.pid}.json`);
const reportsRoot = path.join(root, "reports", "playtests");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const reportDir = path.join(reportsRoot, `p0-9e-hotpath-${stamp}`);

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}
async function installProbe(page) {
  await page.eval(`(() => {
    const limit = (list, max) => { while (list.length > max) list.shift(); };
    const now = () => performance.now();
    const probe = () => window.__p09eProbe;
    const pushEvent = (kind, data) => {
      const p = probe();
      if (!p) return;
      p.events.push(Object.assign({ t: now(), kind }, data || {}));
      limit(p.events, 900);
    };
    const record = (name, ms, threshold = 6) => {
      const p = probe();
      if (!p) return;
      const list = p.sections[name] || (p.sections[name] = []);
      list.push(ms);
      limit(list, 1600);
      if (ms >= threshold) pushEvent("section", { name, ms });
    };
    const wrapMethod = (obj, method, label, threshold = 6) => {
      if (!obj || typeof obj[method] !== "function" || obj[method].__p09eWrapped) return;
      const original = obj[method];
      obj[method] = function(...args) {
        const started = now();
        try { return original.apply(this, args); }
        finally { record(label, now() - started, threshold); }
      };
      obj[method].__p09eWrapped = true;
    };
    const wrapAsync = (obj, method, label, threshold = 10) => {
      if (!obj || typeof obj[method] !== "function" || obj[method].__p09eWrapped) return;
      const original = obj[method];
      obj[method] = function(...args) {
        const started = now();
        try {
          const result = original.apply(this, args);
          if (result && typeof result.finally === "function") return result.finally(() => record(label, now() - started, threshold));
          record(label, now() - started, threshold);
          return result;
        } catch (error) {
          record(label, now() - started, threshold);
          throw error;
        }
      };
      obj[method].__p09eWrapped = true;
    };
    if (!Storage.prototype.__p09eSetWrapped) {
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
      Storage.prototype.__p09eSetWrapped = true;
    }
    if (!window.__p09eFetchWrapped) {
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
            limit(p.fetches, 260);
          }
          if (item.ms >= 25 || /\\/api\\/rooms/.test(url)) pushEvent("fetch", item);
          return response;
        } catch (error) {
          pushEvent("fetch-error", { url, method, ms: now() - started, message: String(error?.message || error) });
          throw error;
        }
      };
      window.__p09eFetchWrapped = true;
    }
    window.__p09ePatchRuntime = function() {
      const game = window.IronLine?.game;
      const registry = window.IronLine?.roomRegistry;
      const flow = game?.hud?.sessionFlow;
      const perf = game?.perfMonitor;
      const tacticalMap = game?.tacticalMap;
      for (const method of ["update", "updateBattlefield", "updateOnlineWorldSync", "updateOnlineCombatEvents", "updateOnlineCommands", "updatePlayer", "updateCamera"]) wrapMethod(game, method, "game." + method);
      wrapMethod(game?.renderer, "draw", "renderer.draw");
      wrapMethod(game?.hud, "update", "hud.update");
      wrapMethod(game?.observerBridge, "update", "observerBridge.update");
      for (const method of ["update", "rebuild", "buildSignature", "buildVehicleStagingPoints", "buildCoverNodes", "buildStagingPoints", "buildRallyPoints", "buildTrafficHints", "buildDangerZones", "buildFireLanes", "buildVehicleZones", "blockers"]) wrapMethod(tacticalMap, method, "tacticalMap." + method, 4);
      for (const method of ["syncCurrentRoom", "publishLocalPlayer", "applyRemotePlayerState"]) wrapMethod(flow, method, "session." + method, 4);
      for (const method of ["writeLocalRooms", "updateWorldState", "emit"]) wrapMethod(registry, method, "registry." + method, 4);
      for (const method of ["refreshRemoteRooms", "fetchRemoteRoomDetail"]) wrapAsync(registry, method, "registry." + method, 8);
      if (perf && !perf.__p09eWrapped) {
        const originalBegin = perf.begin.bind(perf);
        const originalEnd = perf.end.bind(perf);
        const starts = new Map();
        perf.begin = function(name) {
          if (name) starts.set(name, now());
          return originalBegin(name);
        };
        perf.end = function(name) {
          if (name && starts.has(name)) {
            record("perf." + name, now() - starts.get(name), 4);
            starts.delete(name);
          }
          return originalEnd(name);
        };
        perf.__p09eWrapped = true;
      }
    };
    window.__p09eReset = function(label, aiPaused) {
      window.__p09eProbe = { label, frames: [], longFrames: [], events: [], sections: {}, storage: { setItem: 0, bytes: 0, byKey: {} }, fetches: [], input: { commands: 0, latencies: [], missed: 0 }, errors: [], snapshot: {} };
      const game = window.IronLine?.game;
      if (game) game.testLabAiPaused = Boolean(aiPaused);
      window.onerror = (m) => window.__p09eProbe.errors.push(String(m));
      window.onunhandledrejection = (e) => window.__p09eProbe.errors.push(String(e.reason || e));
      window.__p09ePatchRuntime();
    };
    if (!window.__p09eFramesStarted) {
      window.__p09eFramesStarted = true;
      let last = now();
      requestAnimationFrame(function loop(ts) {
        const p = probe();
        const game = window.IronLine?.game;
        if (p) {
          const gap = Math.max(0, ts - last);
          p.frames.push(gap);
          limit(p.frames, 1500);
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
            const windowStart = ts - Math.max(260, gap + 60);
            p.longFrames.push({ t: ts, gap, events: p.events.filter((event) => event.t >= windowStart).slice(-40) });
            limit(p.longFrames, 90);
          }
        }
        last = ts;
        window.__p09ePatchRuntime();
        requestAnimationFrame(loop);
      });
    }
    window.__p09eStartVirtualInput = function(baseX, baseY, direction) {
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
      window.__p09eInputTimer = setInterval(setAxis, 850);
      return true;
    };
    window.__p09eStop = function() {
      if (window.__p09eInputTimer) clearInterval(window.__p09eInputTimer);
      window.__p09eInputTimer = null;
      window.IronLine?.game?.input?.setVirtualAxis?.(0, 0);
    };
    window.__p09eCollect = function() {
      const p = probe() || {};
      const game = window.IronLine?.game;
      p.snapshot = { aiPaused: Boolean(game?.testLabAiPaused), infantry: game?.infantry?.length || 0, tanks: game?.tanks?.length || 0, humvees: game?.humvees?.length || 0, projectiles: game?.projectiles?.length || 0, effects: Object.values(game?.effects || {}).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0) };
      return { frames: (p.frames || []).slice(1), longFrames: p.longFrames || [], sections: p.sections || {}, storage: p.storage || {}, fetches: p.fetches || [], input: p.input || {}, errors: (p.errors || []).slice(0, 10), snapshot: p.snapshot };
    };
    window.__p09eReset("boot", false);
  })()`);
}

function roomSeed(roomId, blueId, redId) {
  const now = Date.now();
  return { id: roomId, name: "P0-9E Hot Path Probe", mode: "annihilation", phase: "waiting", capacity: 8, blueFactionId: "korea", redFactionId: "russia", blueAiTanks: 0, blueInfantry: 4, redTanks: 1, redInfantry: 4, players: [player(blueId, "Blue", "blue", "blue-infantry", now, 1200, 1400), player(redId, "Red", "red", "red-infantry", now, 1600, 1412)], spectators: [], admins: [], chat: [], events: [], commands: [], combatEvents: [], worldState: { roomId, hostId: blueId, tick: 0, updatedAt: now, vehicles: [], units: [], capturePoints: [] }, updatedAt: now };
}
function player(id, name, team, slotId, now, x, y) {
  return { id, playerId: id, name, nickname: name, team, slotId, roleId: "infantry", role: "infantry_leader", classId: "infantry", currentClassId: "infantry", weaponId: team === "blue" ? "rifle" : "machinegun", participantType: "player", ready: true, updatedAt: now, position: { x, y, stateSeq: 1, stateUpdatedAt: now, updatedAt: now, alive: true, deathState: "alive", hp: 100, maxHp: 100, weaponId: team === "blue" ? "rifle" : "machinegun", aimX: team === "blue" ? x + 220 : x - 220, aimY: y, angle: team === "blue" ? 0 : Math.PI } };
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
    game.matchConfig.blueAiTanks = 0; game.matchConfig.blueInfantry = 4; game.matchConfig.redTanks = 1; game.matchConfig.redInfantry = 4;
    game.resetScenarioForMatch?.();
    game.entryOpen = false; game.roomListOpen = false; game.lobbyOpen = false; game.deploymentOpen = false; game.countdownStarted = false;
    game.matchStarted = true; game.matchPhase = "live"; game.result = ""; game.resultReason = "";
    if (game.player) { game.player.x = ${baseX}; game.player.y = ${baseY}; game.player.hp = 100; game.player.alive = true; game.player.inTank = null; game.player.inVehicle = null; }
    window.__p09ePatchRuntime?.();
    game.hud.sessionFlow.publishLocalPlayer(game, { force: true });
    return { ok: true, sessionMode: game.sessionMode, matchStarted: game.matchStarted };
  })()`);
  if (!result?.ok || result.sessionMode !== "online" || !result.matchStarted) throw new Error(`${page.name} session setup failed: ${JSON.stringify(result)}`);
  page.startArgs = { baseX, baseY, direction };
}
async function startRun(page, scenario) {
  page.resetMetrics();
  const args = page.startArgs;
  const ok = await page.eval(`(() => {
    window.__p09eStop?.();
    window.__p09eReset?.(${JSON.stringify(scenario.name)}, ${scenario.aiPaused ? "true" : "false"});
    return window.__p09eStartVirtualInput?.(${args.baseX}, ${args.baseY}, ${args.direction});
  })()`);
  if (!ok) throw new Error(`${page.name} could not start ${scenario.name}`);
}
async function stopPages(pages) {
  await Promise.all(pages.map((page) => page.eval("window.__p09eStop?.()").catch(() => null)));
}
function sectionSummary(sections = {}) {
  return Object.fromEntries(Object.entries(sections).map(([name, values]) => [name, stat(values || [])]));
}
function topSections(sections = {}, limit = 10) {
  return Object.entries(sections).map(([name, item]) => ({ name, max: item.max || 0, p95: item.p95 || 0, avg: item.avg || 0, count: item.count || 0 })).filter((item) => !["game.update", "game.updateBattlefield", "perf.update", "perf.battlefield"].includes(item.name)).sort((a, b) => b.max - a.max).slice(0, limit);
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
      else if (/\/combat$/.test(pathname)) key = `${item.method} /combat`;
    } catch (_error) {}
    groups[key] = groups[key] || [];
    groups[key].push(item.ms);
  }
  return Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, stat(values)]));
}
async function collectPage(page) {
  const probe = await page.eval("window.__p09eCollect?.() || {}");
  const endpoints = {};
  for (const key of ["GET /api/rooms", "GET /api/rooms/:id", "POST /participants", "POST /api/rooms", "POST /combat"]) endpoints[key] = httpSummary(page.metrics, key);
  const sections = sectionSummary(probe.sections || {});
  return { name: page.name, endpoints, frame: { ...stat(probe.frames || []), longFrames50: (probe.frames || []).filter((value) => value > 50).length }, longFrames: (probe.longFrames || []).map((frame) => ({ gap: round(frame.gap), events: frame.events || [] })), sections, topSections: topSections(sections), storage: probe.storage || {}, fetch: fetchSummary(probe.fetches || []), input: { commands: probe.input?.commands || 0, latencyMs: stat(probe.input?.latencies || []), missed: probe.input?.missed || 0 }, eventCounts: eventCounts(probe.longFrames || []), snapshot: probe.snapshot || {}, errors: [...page.metrics.errors, ...(probe.errors || [])].slice(0, 10) };
}
async function runScenario(pages, scenario) {
  await Promise.all(pages.map((page) => startRun(page, scenario)));
  await sleep(Number(process.env.IRONLINE_P0_9E_DURATION_MS || 12000));
  await stopPages(pages);
  await sleep(500);
  return { name: scenario.name, aiPaused: scenario.aiPaused, pages: await Promise.all(pages.map(collectPage)) };
}
function decide(scenarios) {
  const normal = scenarios.find((item) => !item.aiPaused);
  const paused = scenarios.find((item) => item.aiPaused);
  const normalLong = normal.pages.reduce((sum, page) => sum + page.frame.longFrames50, 0);
  const pausedLong = paused.pages.reduce((sum, page) => sum + page.frame.longFrames50, 0);
  const normalTop = normal.pages.flatMap((page) => page.topSections.map((item) => ({ ...item, page: page.name }))).sort((a, b) => b.max - a.max);
  const tacticalRebuildMax = Math.max(...normal.pages.map((page) => page.sections["tacticalMap.rebuild"]?.max || 0));
  const trafficMax = Math.max(...normal.pages.map((page) => page.sections["tacticalMap.buildTrafficHints"]?.max || 0));
  const coverMax = Math.max(...normal.pages.map((page) => page.sections["tacticalMap.buildCoverNodes"]?.max || 0));
  const top = normalTop[0] || { name: "none", max: 0 };
  const aiNames = new Set(["perf.ai.tacticalMap", "tacticalMap.update", "tacticalMap.rebuild", "perf.ai.infantry", "perf.vehicles", "perf.ai.squads", "perf.ai.commanders"]);
  if (normalLong > 0 && pausedLong === 0 && tacticalRebuildMax > 30) return `TacticalMap rebuild spike: buildTrafficHints max ${round(trafficMax)}ms and buildCoverNodes max ${round(coverMax)}ms are the next single candidate pair.`;
  if (normalLong > 0 && pausedLong === 0 && normalTop.some((item) => aiNames.has(item.name) && item.max > 30)) return `AI/update loop spike: ${top.name} is the next single candidate.`;
  if (normalLong > 0 && top.max > 30) return `Hot section spike: ${top.name} is the next single candidate.`;
  if (normalLong > 0) return "Unattributed browser long task inside updateBattlefield; capture DevTools Performance around the long frame before changing code.";
  return "No updateBattlefield long frame reproduced in P0-9E; repeat with manual DevTools capture.";
}
function markdownReport(report) {
  const lines = ["# P0-9E updateBattlefield Hot Path Profiling", "", `Generated: ${report.generatedAt}`, `Measurement: ${report.measurement}`, `Decision: ${report.decision}`, "", "## Summary", ""];
  for (const scenario of report.scenarios) {
    lines.push(`### ${scenario.name}`, "", "| Page | Long frames | Frame max ms | updateBattlefield max | Top internal section | Top max ms | Input max ms | Storage writes/bytes | Detail fetches |", "| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |");
    for (const page of scenario.pages) {
      const top = page.topSections[0] || {};
      lines.push(`| ${page.name} | ${page.frame.longFrames50} | ${page.frame.max} | ${page.sections["game.updateBattlefield"]?.max || 0} | ${top.name || ""} | ${top.max || 0} | ${page.input.latencyMs.max} | ${page.storage.setItem || 0}/${page.storage.bytes || 0} | ${page.endpoints["GET /api/rooms/:id"].count} |`);
    }
    lines.push("");
  }
  lines.push("## Next", "", report.nextRecommendation, "");
  return lines.join("\n");
}
function print(report) {
  console.log("\nP0-9E updateBattlefield hot path profiling");
  console.log(`Report: ${path.relative(root, report.reportPath)}`);
  console.log(`Decision: ${report.decision}`);
  for (const scenario of report.scenarios) {
    console.log(`\n${scenario.name}`);
    console.table(scenario.pages.map((page) => ({ page: page.name, longFrames50: page.frame.longFrames50, frameMaxMs: page.frame.max, updateBattlefieldMax: page.sections["game.updateBattlefield"]?.max || 0, top: page.topSections[0]?.name || "", topMax: page.topSections[0]?.max || 0, inputMax: page.input.latencyMs.max, detailFetches: page.endpoints["GET /api/rooms/:id"].count })));
  }
}

async function main() {
  fs.mkdirSync(reportDir, { recursive: true });
  const server = spawn(process.execPath, ["tools/static-server.cjs", String(appPort)], { cwd: root, env: { ...process.env, HOST: "0.0.0.0", PORT: String(appPort), IRONLINE_ROOMS_FILE: roomsFile }, stdio: "ignore", windowsHide: true });
  const pages = [];
  try {
    await waitForServer(requestJson);
    pages.push(await launchPage({ name: "blue", debugPort: appPort + 101, originHost: "127.0.0.1", appPort, baseUrl, profilePrefix: "iron-line-p0-9e", installProbe }));
    pages.push(await launchPage({ name: "red", debugPort: appPort + 102, originHost: "localhost", appPort, baseUrl, profilePrefix: "iron-line-p0-9e", installProbe }));
    const [blueProfile, redProfile] = await Promise.all(pages.map(profile));
    if (!blueProfile.playerId || !redProfile.playerId || blueProfile.playerId === redProfile.playerId) throw new Error("Could not get distinct browser player profiles.");
    const roomId = `P09E-${Date.now()}`;
    await requestJson("/api/rooms", { method: "POST", body: roomSeed(roomId, blueProfile.playerId, redProfile.playerId) });
    await preparePage(pages[0], roomId, "blue-infantry", 1200, 1400, 1);
    await preparePage(pages[1], roomId, "red-infantry", 1600, 1412, -1);
    await sleep(900);
    const scenarios = [];
    for (const scenario of [{ name: "normal_low_ai", aiPaused: false }, { name: "ai_paused_compare", aiPaused: true }]) scenarios.push(await runScenario(pages, scenario));
    await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" }).catch(() => null);
    const report = { generatedAt: new Date().toISOString(), measurement: "headless Chrome steady movement-only updateBattlefield internal profiling, normal low-AI then AI-paused comparison", roomId, scenarios, reportPath: path.join(reportDir, "report.md"), resultPath: path.join(reportDir, "result.json") };
    report.decision = decide(scenarios);
    report.nextRecommendation = report.decision.includes("TacticalMap rebuild") ? "P0-9F narrow tactical-map rebuild cadence/slicing for buildTrafficHints and buildCoverNodes, without AI behavior or worldState redesign." : report.decision.includes("AI/update") ? "P0-9F narrow AI/updateBattlefield batching or LOD correction for the named section." : report.decision.includes("Hot section") ? "P0-9F narrow fix for the named updateBattlefield section." : "P0-9F DevTools Performance capture around updateBattlefield long task.";
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
