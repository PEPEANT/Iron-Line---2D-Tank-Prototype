"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { httpSummary, launchPage, makeRequestJson, sleep, stat, waitForServer } = require("./p0-browser-cdp-helper.cjs");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_P0_10_PORT || 4381);
const baseUrl = `http://127.0.0.1:${appPort}`;
const requestJson = makeRequestJson(baseUrl);
const roomsFile = path.join(root, ".data", `p0-10-start-sync-${process.pid}.json`);
const reportsRoot = path.join(root, "reports", "playtests");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const reportDir = path.join(reportsRoot, `p0-10-start-sync-${stamp}`);
const lateRefreshMs = Math.max(0, Number(process.env.IRONLINE_P0_10_LATE_REFRESH_MS) || 0);

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function player(id, name, team, slotId, now, x, y) {
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
      stateSeq: 1,
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

function roomSeed(roomId, blueId, redId) {
  const now = Date.now();
  return {
    id: roomId,
    name: "P0-10 Startup Sync Probe",
    mode: "annihilation",
    phase: "waiting",
    locked: false,
    capacity: 8,
    blueFactionId: "korea",
    redFactionId: "russia",
    aiFillEmptySlots: true,
    blueAiTanks: 0,
    blueInfantry: 4,
    redTanks: 1,
    redInfantry: 4,
    players: [
      player(blueId, "Blue", "blue", "blue-infantry", now, 1200, 1400),
      player(redId, "Red", "red", "red-infantry", now, 1600, 1412)
    ],
    spectators: [],
    admins: [],
    chat: [],
    events: [],
    commands: [],
    combatEvents: [],
    worldState: { roomId, hostId: blueId, tick: 0, updatedAt: now, vehicles: [], units: [], capturePoints: [] },
    createdAt: now,
    updatedAt: now
  };
}

async function installProbe(page) {
  await page.eval(`(() => {
    const limit = (list, max) => { while (list.length > max) list.shift(); };
    const now = () => performance.now();
    const probe = () => window.__p010Probe;
    const push = (key, data, max = 2400) => {
      const p = probe();
      if (!p) return;
      p[key].push(Object.assign({ t: now(), wall: Date.now() }, data || {}));
      limit(p[key], max);
    };
    const unitMap = (game) => new Map([...(game?.infantry || []), ...(game?.crews || [])]
      .map((unit) => [unit.callSign || unit.id || "", { x: Number(unit.x) || 0, y: Number(unit.y) || 0 }])
      .filter(([id]) => id));
    const sample = () => {
      const game = window.IronLine?.game;
      const registry = window.IronLine?.roomRegistry;
      const roomId = game?.onlineSession?.roomId || registry?.selectedRoomId?.() || "";
      const room = roomId ? registry?.getRoom?.(roomId) : null;
      push("samples", {
        roomId,
        selectedRoomId: registry?.selectedRoomId?.() || "",
        playerId: game?.onlineSession?.playerId || "",
        roomPhase: room?.phase || "",
        roomLocked: Boolean(room?.locked),
        roomStartedAt: Number(room?.startedAt) || 0,
        matchStarted: Boolean(game?.matchStarted),
        countdownStarted: Boolean(game?.countdownStarted),
        lobbyOpen: Boolean(game?.lobbyOpen),
        deploymentOpen: Boolean(game?.deploymentOpen),
        roomListOpen: Boolean(game?.roomListOpen),
        matchPhase: game?.matchPhase || "",
        localSlot: game?.localSessionPlayer?.()?.slotId || "",
        localTeam: game?.localSessionPlayer?.()?.team || "",
        participantType: game?.onlineSession?.participantType || "",
        localReady: Boolean(game?.onlineSession?.localReady),
        hostCandidate: game?.onlineWorldHostPlayerId?.(room) || "",
        isWorldHost: Boolean(game?.isOnlineWorldHost?.(room)),
        worldHostId: room?.worldState?.hostId || "",
        worldUpdatedAt: Number(room?.worldState?.updatedAt) || 0,
        worldTick: Number(room?.worldState?.tick) || 0,
        worldUnits: room?.worldState?.units?.length || 0,
        localUnits: (game?.infantry?.length || 0) + (game?.crews?.length || 0)
      }, 4200);
    };
    const wrapMethod = (obj, method, key, makeData) => {
      if (!obj || typeof obj[method] !== "function" || obj[method].__p010Wrapped) return;
      const original = obj[method];
      obj[method] = function(...args) {
        const started = now();
        const beforeUnits = method === "applyOnlineWorldState" ? unitMap(this) : null;
        try {
          const result = original.apply(this, args);
          const elapsed = now() - started;
          const data = makeData ? makeData.call(this, args, result, elapsed, beforeUnits) : { ms: elapsed };
          push(key, data);
          return result;
        } catch (error) {
          push("errors", { source: key, message: String(error?.message || error) });
          throw error;
        }
      };
      obj[method].__p010Wrapped = true;
    };
    if (!Storage.prototype.__p010SetWrapped) {
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        const started = now();
        try { return originalSet.call(this, key, value); }
        finally { push("storage", { key, bytes: String(value || "").length, ms: now() - started }, 2600); }
      };
      Storage.prototype.__p010SetWrapped = true;
    }
    if (!window.__p010FetchWrapped) {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async function(input, init) {
        const started = now();
        const url = typeof input === "string" ? input : input?.url || "";
        const method = (init?.method || input?.method || "GET").toUpperCase();
        const holdUntil = Number(window.__p010HoldRoomFetchUntil) || 0;
        if (method === "GET" && /\\/api\\/rooms/.test(url) && Date.now() < holdUntil) {
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, holdUntil - Date.now())));
        }
        try {
          const response = await originalFetch(input, init);
          if (/\\/api\\/rooms/.test(url)) push("fetches", { url, method, status: response.status, ms: now() - started }, 1200);
          return response;
        } catch (error) {
          push("errors", { source: "fetch", url, method, message: String(error?.message || error) });
          throw error;
        }
      };
      window.__p010FetchWrapped = true;
    }
    window.__p010PatchRuntime = function() {
      const game = window.IronLine?.game;
      const registry = window.IronLine?.roomRegistry;
      wrapMethod(game, "beginDeploymentCountdown", "startTransitions", function(_args, result, ms) {
        const options = _args?.[0] || {};
        const room = options.room || {};
        return {
          event: "beginDeploymentCountdown",
          result: Boolean(result),
          ms,
          optionStartedAt: Number(options.startedAt || room.startedAt) || 0,
          roomStartedAt: Number(room.startedAt) || 0,
          startCountdown: Number(this.startCountdown) || 0,
          startLoadingRemaining: Number(this.startLoading?.remaining) || 0,
          matchPhase: this.matchPhase || "",
          countdownStarted: Boolean(this.countdownStarted),
          matchStarted: Boolean(this.matchStarted)
        };
      });
      wrapMethod(game, "updateOnlineWorldSync", "worldSyncCalls", function(_args, _result, ms) {
        const room = this.onlineCombatRoom?.();
        return { ms, isHost: Boolean(this.isOnlineWorldHost?.(room)), matchStarted: Boolean(this.matchStarted), worldHostId: room?.worldState?.hostId || "", worldUpdatedAt: Number(room?.worldState?.updatedAt) || 0 };
      });
      wrapMethod(game, "captureOnlineWorldState", "worldCaptures", function(_args, result, ms) {
        return { ms, hostId: result?.hostId || "", tick: Number(result?.tick) || 0, units: result?.units?.length || 0, vehicles: result?.vehicles?.length || 0 };
      });
      wrapMethod(game, "applyOnlineWorldState", "worldApplies", function(args, result, ms, beforeUnits) {
        const state = args?.[0] || {};
        let maxUnitDelta = 0;
        let movedUnits = 0;
        for (const unit of [...(this.infantry || []), ...(this.crews || [])]) {
          const id = unit.callSign || unit.id || "";
          const before = beforeUnits?.get(id);
          if (!before) continue;
          const delta = Math.hypot((Number(unit.x) || 0) - before.x, (Number(unit.y) || 0) - before.y);
          if (delta > 0.05) movedUnits += 1;
          maxUnitDelta = Math.max(maxUnitDelta, delta);
        }
        return { applied: Boolean(result), ms, hostId: state?.hostId || "", updatedAt: Number(state?.updatedAt) || 0, tick: Number(state?.tick) || 0, units: state?.units?.length || 0, movedUnits, maxUnitDelta };
      });
      wrapMethod(registry, "updateWorldState", "worldPublishes", function(args, result, ms) {
        const state = args?.[1] || {};
        return { ms, roomId: args?.[0] || "", result: Boolean(result), hostId: state.hostId || "", tick: Number(state.tick) || 0, units: state.units?.length || 0 };
      });
      wrapMethod(registry, "writeLocalRooms", "registryWrites", function(args, _result, ms) {
        return { ms, bytes: JSON.stringify(args?.[0] || []).length };
      });
      wrapMethod(registry, "emit", "registryEmits", function(_args, _result, ms) { return { ms }; });
    };
    window.__p010Reset = function(label) {
      window.__p010Probe = { label, frames: [], longFrames: [], samples: [], startTransitions: [], worldSyncCalls: [], worldCaptures: [], worldPublishes: [], worldApplies: [], registryWrites: [], registryEmits: [], storage: [], fetches: [], errors: [] };
      window.onerror = (m) => push("errors", { source: "onerror", message: String(m) });
      window.onunhandledrejection = (e) => push("errors", { source: "unhandledrejection", message: String(e.reason || e) });
      window.__p010PatchRuntime();
      if (window.__p010SampleTimer) clearInterval(window.__p010SampleTimer);
      window.__p010SampleTimer = setInterval(() => { window.__p010PatchRuntime(); sample(); }, 100);
      sample();
    };
    if (!window.__p010FramesStarted) {
      window.__p010FramesStarted = true;
      let last = now();
      requestAnimationFrame(function loop(ts) {
        const p = probe();
        if (p) {
          const gap = Math.max(0, ts - last);
          p.frames.push(gap);
          limit(p.frames, 1800);
          if (gap > 50) {
            p.longFrames.push({ t: ts, gap });
            limit(p.longFrames, 120);
          }
        }
        last = ts;
        requestAnimationFrame(loop);
      });
    }
    window.__p010Collect = function() {
      const p = probe() || {};
      const game = window.IronLine?.game;
      if (window.__p010SampleTimer) clearInterval(window.__p010SampleTimer);
      window.__p010SampleTimer = null;
      return { ...p, final: {
        sessionMode: game?.sessionMode || "",
        roomId: game?.onlineSession?.roomId || "",
        playerId: game?.onlineSession?.playerId || "",
        matchStarted: Boolean(game?.matchStarted),
        countdownStarted: Boolean(game?.countdownStarted),
        lobbyOpen: Boolean(game?.lobbyOpen),
        deploymentOpen: Boolean(game?.deploymentOpen),
        matchPhase: game?.matchPhase || "",
        infantry: game?.infantry?.length || 0,
        tanks: game?.tanks?.length || 0
      } };
    };
    window.__p010Reset("boot");
  })()`);
}

async function profile(page) {
  return page.eval(`(() => {
    const game = window.IronLine?.game;
    return { playerId: game?.localProfile?.playerId || "", nickname: game?.localProfile?.nickname || "" };
  })()`);
}

async function preparePage(page, roomId, slotId) {
  const result = await page.eval(`(async () => {
    const game = window.IronLine.game;
    localStorage.setItem("iron-line-selected-room-v1", ${JSON.stringify(roomId)});
    let room = null;
    for (let i = 0; i < 24; i += 1) {
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
    window.__p010PatchRuntime?.();
    game.hud.sessionFlow.publishLocalPlayer(game, { force: true });
    return { ok: true, sessionMode: game.sessionMode, roomId: game.onlineSession.roomId, playerId: game.onlineSession.playerId, slotId: local?.slotId || "" };
  })()`);
  if (!result?.ok) throw new Error(`${page.name} session setup failed: ${JSON.stringify(result)}`);
}

async function startRoom(roomId) {
  const detail = await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`);
  const room = detail.room;
  const now = Date.now();
  await requestJson("/api/rooms", {
    method: "POST",
    body: {
      ...room,
      phase: "playing",
      locked: true,
      startedBy: "admin",
      startedAt: now,
      events: [
        ...(room.events || []),
        { id: `${roomId}:event:${now}:p010`, roomId, createdAt: now, type: "room_started", severity: "major", title: "room_started", detail: "P0-10 probe start" }
      ],
      updatedAt: now
    }
  });
}

async function collectPage(page) {
  const probe = await page.eval("window.__p010Collect?.() || {}");
  const frame = stat((probe.frames || []).slice(1));
  frame.longFrames50 = (probe.frames || []).filter((value) => value > 50).length;
  const startSample = firstSample(probe.samples, (item) => item.roomPhase === "playing");
  const countdownSample = firstSample(probe.samples, (item) => item.countdownStarted);
  const matchSample = firstSample(probe.samples, (item) => item.matchStarted);
  const worldApplyGaps = gaps((probe.worldApplies || []).filter((item) => item.applied).map((item) => item.t));
  const worldPublishGaps = gaps((probe.worldPublishes || []).map((item) => item.t));
  return {
    name: page.name,
    endpoints: {
      rooms: httpSummary(page.metrics, "GET /api/rooms"),
      detail: httpSummary(page.metrics, "GET /api/rooms/:id"),
      participants: httpSummary(page.metrics, "POST /participants"),
      postRooms: httpSummary(page.metrics, "POST /api/rooms")
    },
    frame,
    firstPlayingAt: startSample?.t || 0,
    firstCountdownAt: countdownSample?.t || 0,
    firstMatchStartedAt: matchSample?.t || 0,
    firstPlayingWallAt: startSample?.wall || 0,
    firstCountdownWallAt: countdownSample?.wall || 0,
    firstMatchStartedWallAt: matchSample?.wall || 0,
    final: probe.final || {},
    samples: probe.samples || [],
    startTransitions: probe.startTransitions || [],
    worldPublishes: probe.worldPublishes || [],
    worldApplies: probe.worldApplies || [],
    worldPublishGapMs: stat(worldPublishGaps),
    worldApplyGapMs: stat(worldApplyGaps),
    worldApplyMaxUnitDelta: stat((probe.worldApplies || []).filter((item) => item.applied).map((item) => Number(item.maxUnitDelta) || 0)),
    registryWrites: { count: (probe.registryWrites || []).length, bytes: stat((probe.registryWrites || []).map((item) => item.bytes || 0)), ms: stat((probe.registryWrites || []).map((item) => item.ms || 0)) },
    storage: { count: (probe.storage || []).length, bytes: stat((probe.storage || []).map((item) => item.bytes || 0)), ms: stat((probe.storage || []).map((item) => item.ms || 0)) },
    fetchCount: (probe.fetches || []).length,
    errors: [...page.metrics.errors, ...(probe.errors || []).map((item) => item.message || String(item))].slice(0, 20)
  };
}

function firstSample(samples = [], predicate = () => false) {
  return samples.find(predicate) || null;
}

function gaps(values = []) {
  return values.slice(1).map((value, index) => value - values[index]).filter((value) => Number.isFinite(value));
}

function decide(report) {
  const pages = report.pages || [];
  const matchTimes = pages.map((page) => page.firstMatchStartedWallAt).filter(Boolean);
  const startSkew = matchTimes.length >= 2 ? Math.max(...matchTimes) - Math.min(...matchTimes) : 0;
  const applyMaxGap = Math.max(...pages.map((page) => page.worldApplyGapMs.max || 0));
  const publishMaxGap = Math.max(...pages.map((page) => page.worldPublishGapMs.max || 0));
  const maxUnitDelta = Math.max(...pages.map((page) => page.worldApplyMaxUnitDelta.max || 0));
  if (startSkew > 600) return `Startup mismatch reproduced: matchStarted skew ${round(startSkew)}ms. Fix start/session phase convergence before tuning worldState.`;
  if (applyMaxGap > 1200 || publishMaxGap > 1200 || maxUnitDelta > 32) return `AI/worldState cadence issue: publish/apply gaps ${round(publishMaxGap)}/${round(applyMaxGap)}ms, max AI snap ${round(maxUnitDelta)}px.`;
  return "No major clean-start mismatch reproduced; focus next on stale close/reopen session reproduction or manual capture.";
}

function markdownReport(report) {
  const lines = [
    "# P0-10 Startup / Session / World Sync Triage",
    "",
    `Generated: ${report.generatedAt}`,
    `Measurement: ${report.measurement}`,
    `Late refresh hold: ${report.lateRefreshMs}ms`,
    `Decision: ${report.decision}`,
    "",
    "## Summary",
    "",
    "| Page | Frame max | Long frames | first playing wall | first countdown wall | first matchStarted wall | world publish gap max | world apply gap max | world apply max unit delta | storage writes | errors |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const page of report.pages) {
    lines.push(`| ${page.name} | ${page.frame.max} | ${page.frame.longFrames50} | ${page.firstPlayingWallAt || 0} | ${page.firstCountdownWallAt || 0} | ${page.firstMatchStartedWallAt || 0} | ${page.worldPublishGapMs.max} | ${page.worldApplyGapMs.max} | ${page.worldApplyMaxUnitDelta.max} | ${page.storage.count} | ${page.errors.length} |`);
  }
  lines.push("", "## Notes", "");
  lines.push(`- Start skew ms: ${report.startSkewMs}`);
  lines.push(`- Max worldState publish gap ms: ${report.maxWorldPublishGapMs}`);
  lines.push(`- Max worldState apply gap ms: ${report.maxWorldApplyGapMs}`);
  lines.push(`- Max AI/unit snap px on apply: ${report.maxWorldApplyUnitDeltaPx}`);
  lines.push("", "## Next", "", report.nextRecommendation, "");
  return lines.join("\n");
}

function print(report) {
  console.log("\nP0-10 startup/session/world sync triage");
  console.log(`Report: ${path.relative(root, report.reportPath)}`);
  console.log(`Decision: ${report.decision}`);
  console.table(report.pages.map((page) => ({
    page: page.name,
    frameMaxMs: page.frame.max,
    longFrames50: page.frame.longFrames50,
    firstPlayingWallAt: page.firstPlayingWallAt || 0,
    firstCountdownWallAt: page.firstCountdownWallAt || 0,
    firstMatchStartedWallAt: page.firstMatchStartedWallAt || 0,
    worldPublishGapMax: page.worldPublishGapMs.max,
    worldApplyGapMax: page.worldApplyGapMs.max,
    worldApplyMaxUnitDelta: page.worldApplyMaxUnitDelta.max,
    storageWrites: page.storage.count,
    errors: page.errors.length
  })));
}

async function main() {
  fs.mkdirSync(reportDir, { recursive: true });
  const server = spawn(process.execPath, ["tools/static-server.cjs", String(appPort)], {
    cwd: root,
    env: { ...process.env, HOST: "0.0.0.0", PORT: String(appPort), IRONLINE_ROOMS_FILE: roomsFile },
    stdio: "ignore",
    windowsHide: true
  });
  const pages = [];
  try {
    await waitForServer(requestJson);
    pages.push(await launchPage({ name: "blue", debugPort: appPort + 101, originHost: "127.0.0.1", appPort, baseUrl, profilePrefix: "iron-line-p0-10", installProbe }));
    pages.push(await launchPage({ name: "red", debugPort: appPort + 102, originHost: "localhost", appPort, baseUrl, profilePrefix: "iron-line-p0-10", installProbe }));
    const [blueProfile, redProfile] = await Promise.all(pages.map(profile));
    if (!blueProfile.playerId || !redProfile.playerId || blueProfile.playerId === redProfile.playerId) throw new Error("Could not get distinct browser player profiles.");
    const roomId = `P010-${Date.now()}`;
    await requestJson("/api/rooms", { method: "POST", body: roomSeed(roomId, blueProfile.playerId, redProfile.playerId) });
    await preparePage(pages[0], roomId, "blue-infantry");
    await preparePage(pages[1], roomId, "red-infantry");
    await Promise.all(pages.map((page) => page.eval(`window.__p010Reset?.("clean-start")`)));
    await sleep(700);
    if (lateRefreshMs > 0) {
      await pages[0].eval(`window.__p010HoldRoomFetchUntil = Date.now() + ${lateRefreshMs};`);
    }
    await startRoom(roomId);
    await sleep(Number(process.env.IRONLINE_P0_10_DURATION_MS || 11000));
    const pagesResult = await Promise.all(pages.map(collectPage));
    const matchTimes = pagesResult.map((page) => page.firstMatchStartedWallAt).filter(Boolean);
    const startSkewMs = matchTimes.length >= 2 ? round(Math.max(...matchTimes) - Math.min(...matchTimes)) : 0;
    const report = {
      generatedAt: new Date().toISOString(),
      measurement: lateRefreshMs > 0
        ? "headless Chrome two-player admin-start probe with delayed room refresh on blue client"
        : "headless Chrome two-player clean admin-start probe with session/worldState instrumentation",
      lateRefreshMs,
      roomId,
      pages: pagesResult,
      startSkewMs,
      maxWorldPublishGapMs: Math.max(...pagesResult.map((page) => page.worldPublishGapMs.max || 0)),
      maxWorldApplyGapMs: Math.max(...pagesResult.map((page) => page.worldApplyGapMs.max || 0)),
      maxWorldApplyUnitDeltaPx: Math.max(...pagesResult.map((page) => page.worldApplyMaxUnitDelta.max || 0)),
      reportPath: path.join(reportDir, "report.md"),
      resultPath: path.join(reportDir, "result.json")
    };
    report.decision = decide(report);
    report.nextRecommendation = report.decision.includes("AI/worldState")
      ? "P0-10B narrow AI/worldState cadence/interpolation triage; do not redesign AI behavior."
      : report.decision.includes("Startup mismatch")
        ? "P0-10A narrow startup/session convergence fix."
        : "P0-10A stale close/reopen session reproduction before changing code.";
    fs.writeFileSync(report.resultPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(report.reportPath, markdownReport(report), "utf8");
    print(report);
    await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" }).catch(() => null);
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
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
