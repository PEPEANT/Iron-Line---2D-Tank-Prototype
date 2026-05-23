"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { httpSummary, launchPage, makeRequestJson, sleep, stat, waitForServer } = require("./p0-browser-cdp-helper.cjs");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_P0_10B_PORT || 4382);
const baseUrl = `http://127.0.0.1:${appPort}`;
const requestJson = makeRequestJson(baseUrl);
const roomsFile = path.join(root, ".data", `p0-10b-worldstate-${process.pid}.json`);
const reportsRoot = path.join(root, "reports", "playtests");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const reportDir = path.join(reportsRoot, `p0-10b-worldstate-${stamp}`);

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
    name: "P0-10B WorldState Cadence Probe",
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
    const positionMap = (items = []) => new Map(items
      .map((item) => [item.callSign || item.id || item.name || "", {
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        owner: item.owner || "",
        progress: Number(item.progress) || 0
      }])
      .filter(([id]) => id));
    const entityMaps = (game) => ({
      units: positionMap([...(game?.infantry || []), ...(game?.crews || [])]),
      vehicles: positionMap([...(game?.tanks || []), ...(game?.humvees || [])]),
      capturePoints: positionMap(game?.capturePoints || [])
    });
    const movementStats = (snaps = [], before = new Map(), after = new Map()) => {
      let maxTargetDelta = 0;
      let maxAppliedDelta = 0;
      let maxResidualDelta = 0;
      let over32 = 0;
      let over64 = 0;
      let over96 = 0;
      let moved = 0;
      const ids = [];
      for (const snap of snaps || []) {
        const id = snap?.id || snap?.name || "";
        const from = before.get(id);
        const to = after.get(id);
        if (!id || !from || !to) continue;
        const sx = Number(snap.x);
        const sy = Number(snap.y);
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
        const targetDelta = Math.hypot(sx - from.x, sy - from.y);
        const appliedDelta = Math.hypot(to.x - from.x, to.y - from.y);
        const residualDelta = Math.hypot(sx - to.x, sy - to.y);
        if (appliedDelta > 0.05) moved += 1;
        if (targetDelta > 32) over32 += 1;
        if (targetDelta > 64) over64 += 1;
        if (targetDelta > 96) over96 += 1;
        if (targetDelta > maxTargetDelta) ids[0] = id;
        maxTargetDelta = Math.max(maxTargetDelta, targetDelta);
        maxAppliedDelta = Math.max(maxAppliedDelta, appliedDelta);
        maxResidualDelta = Math.max(maxResidualDelta, residualDelta);
      }
      return {
        count: snaps?.length || 0,
        moved,
        maxTargetDelta,
        maxAppliedDelta,
        maxResidualDelta,
        over32,
        over64,
        over96,
        maxTargetId: ids[0] || "",
        appliedRatio: maxTargetDelta > 0 ? maxAppliedDelta / maxTargetDelta : 0
      };
    };
    const captureStats = (snaps = [], before = new Map(), after = new Map()) => {
      let changed = 0;
      let maxProgressDelta = 0;
      for (const snap of snaps || []) {
        const point = after.get(snap?.id || "");
        const prev = before.get(snap?.id || "");
        if (!point || !prev) continue;
        const progressDelta = Math.abs(point.progress - prev.progress);
        if (progressDelta > 0.001 || point.owner !== prev.owner) changed += 1;
        maxProgressDelta = Math.max(maxProgressDelta, progressDelta);
      }
      return { count: snaps?.length || 0, changed, maxProgressDelta };
    };
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
        const beforeEntities = method === "applyOnlineWorldState" ? entityMaps(this) : null;
        try {
          const result = original.apply(this, args);
          const elapsed = now() - started;
          const data = makeData ? makeData.call(this, args, result, elapsed, beforeEntities) : { ms: elapsed };
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
        return {
          ms,
          hostId: result?.hostId || "",
          tick: Number(result?.tick) || 0,
          units: result?.units?.length || 0,
          vehicles: result?.vehicles?.length || 0,
          capturePoints: result?.capturePoints?.length || 0,
          bytes: JSON.stringify(result || {}).length
        };
      });
      wrapMethod(game, "applyOnlineWorldState", "worldApplies", function(args, result, ms, beforeEntities) {
        const state = args?.[0] || {};
        const after = entityMaps(this);
        const unit = movementStats(state.units || [], beforeEntities?.units, after.units);
        const vehicle = movementStats(state.vehicles || [], beforeEntities?.vehicles, after.vehicles);
        const capturePoint = captureStats(state.capturePoints || [], beforeEntities?.capturePoints, after.capturePoints);
        return {
          applied: Boolean(result),
          ms,
          hostId: state?.hostId || "",
          updatedAt: Number(state?.updatedAt) || 0,
          tick: Number(state?.tick) || 0,
          units: state?.units?.length || 0,
          vehicles: state?.vehicles?.length || 0,
          capturePoints: state?.capturePoints?.length || 0,
          bytes: JSON.stringify(state || {}).length,
          unit,
          vehicle,
          capturePoint
        };
      });
      wrapMethod(registry, "updateWorldState", "worldPublishes", function(args, result, ms) {
        const state = args?.[1] || {};
        return {
          ms,
          roomId: args?.[0] || "",
          result: Boolean(result),
          hostId: state.hostId || "",
          tick: Number(state.tick) || 0,
          units: state.units?.length || 0,
          vehicles: state.vehicles?.length || 0,
          capturePoints: state.capturePoints?.length || 0,
          bytes: JSON.stringify(state || {}).length
        };
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
        { id: `${roomId}:event:${now}:p010b`, roomId, createdAt: now, type: "room_started", severity: "major", title: "room_started", detail: "P0-10B probe start" }
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
  const appliedWorldStates = (probe.worldApplies || []).filter((item) => item.applied);
  const worldApplyGaps = gaps(appliedWorldStates.map((item) => item.t));
  const publishedWorldStates = (probe.worldPublishes || []).filter((item) => item.result);
  const skippedWorldPublishes = (probe.worldPublishes || []).filter((item) => !item.result).length;
  const worldPublishGaps = gaps(publishedWorldStates.map((item) => item.t));
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
    worldCaptures: probe.worldCaptures || [],
    worldPublishGapMs: stat(worldPublishGaps),
    worldApplyGapMs: stat(worldApplyGaps),
    worldCaptureBytes: stat((probe.worldCaptures || []).map((item) => Number(item.bytes) || 0)),
    worldPublishBytes: stat(publishedWorldStates.map((item) => Number(item.bytes) || 0)),
    worldPublishAttempts: (probe.worldPublishes || []).length,
    worldPublishSkips: skippedWorldPublishes,
    worldApplyBytes: stat(appliedWorldStates.map((item) => Number(item.bytes) || 0)),
    unitTargetDelta: stat(appliedWorldStates.map((item) => Number(item.unit?.maxTargetDelta) || 0)),
    unitAppliedDelta: stat(appliedWorldStates.map((item) => Number(item.unit?.maxAppliedDelta) || 0)),
    unitResidualDelta: stat(appliedWorldStates.map((item) => Number(item.unit?.maxResidualDelta) || 0)),
    unitAppliedRatio: stat(appliedWorldStates.map((item) => Number(item.unit?.appliedRatio) || 0)),
    unitOver32: appliedWorldStates.reduce((sum, item) => sum + (Number(item.unit?.over32) || 0), 0),
    unitOver64: appliedWorldStates.reduce((sum, item) => sum + (Number(item.unit?.over64) || 0), 0),
    unitOver96: appliedWorldStates.reduce((sum, item) => sum + (Number(item.unit?.over96) || 0), 0),
    vehicleTargetDelta: stat(appliedWorldStates.map((item) => Number(item.vehicle?.maxTargetDelta) || 0)),
    vehicleAppliedDelta: stat(appliedWorldStates.map((item) => Number(item.vehicle?.maxAppliedDelta) || 0)),
    vehicleResidualDelta: stat(appliedWorldStates.map((item) => Number(item.vehicle?.maxResidualDelta) || 0)),
    vehicleAppliedRatio: stat(appliedWorldStates.map((item) => Number(item.vehicle?.appliedRatio) || 0)),
    vehicleOver32: appliedWorldStates.reduce((sum, item) => sum + (Number(item.vehicle?.over32) || 0), 0),
    capturePointChanges: appliedWorldStates.reduce((sum, item) => sum + (Number(item.capturePoint?.changed) || 0), 0),
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
  const applyMaxGap = Math.max(...pages.map((page) => page.worldApplyGapMs.max || 0));
  const publishMaxGap = Math.max(...pages.map((page) => page.worldPublishGapMs.max || 0));
  const unitTarget = Math.max(...pages.map((page) => page.unitTargetDelta.max || 0));
  const unitApplied = Math.max(...pages.map((page) => page.unitAppliedDelta.max || 0));
  const vehicleTarget = Math.max(...pages.map((page) => page.vehicleTargetDelta.max || 0));
  const vehicleApplied = Math.max(...pages.map((page) => page.vehicleAppliedDelta.max || 0));
  const unitRatio = Math.max(...pages.map((page) => page.unitAppliedRatio.max || 0));
  if (publishMaxGap > 1200 && (unitTarget > 32 || vehicleTarget > 32)) {
    return `Cadence primary: worldState publishes every ${round(publishMaxGap)}ms, unit/vehicle targets reach ${round(unitTarget)}/${round(vehicleTarget)}px before a one-shot apply.`;
  }
  if (unitApplied > 32 || vehicleApplied > 32) {
    return `Apply snap primary: one apply moves unit/vehicle up to ${round(unitApplied)}/${round(vehicleApplied)}px, applied ratio max ${round(unitRatio, 2)}.`;
  }
  if (applyMaxGap > 1200) {
    return `Apply delivery primary: worldState apply gap reaches ${round(applyMaxGap)}ms despite smaller snap distances.`;
  }
  return "No major worldState cadence/snap issue reproduced in this run.";
}

function markdownReport(report) {
  const lines = [
    "# P0-10B WorldState Cadence / Interpolation Triage",
    "",
    `Generated: ${report.generatedAt}`,
    `Measurement: ${report.measurement}`,
    `Decision: ${report.decision}`,
    "",
    "## Summary",
    "",
    "| Page | Publish gap max | Apply gap max | Publish attempts/skips | Unit target max | Unit apply max | Vehicle target max | Vehicle apply max | Snapshot bytes max | Storage writes | Errors |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const page of report.pages) {
    lines.push(`| ${page.name} | ${page.worldPublishGapMs.max} | ${page.worldApplyGapMs.max} | ${page.worldPublishAttempts}/${page.worldPublishSkips} | ${page.unitTargetDelta.max} | ${page.unitAppliedDelta.max} | ${page.vehicleTargetDelta.max} | ${page.vehicleAppliedDelta.max} | ${Math.max(page.worldCaptureBytes.max, page.worldPublishBytes.max, page.worldApplyBytes.max)} | ${page.storage.count} | ${page.errors.length} |`);
  }
  lines.push("", "## Notes", "");
  lines.push(`- Max worldState publish gap ms: ${report.maxWorldPublishGapMs}`);
  lines.push(`- Max worldState apply gap ms: ${report.maxWorldApplyGapMs}`);
  lines.push(`- Max unit target/apply/residual px: ${report.maxUnitTargetDeltaPx} / ${report.maxUnitAppliedDeltaPx} / ${report.maxUnitResidualDeltaPx}`);
  lines.push(`- Max vehicle target/apply/residual px: ${report.maxVehicleTargetDeltaPx} / ${report.maxVehicleAppliedDeltaPx} / ${report.maxVehicleResidualDeltaPx}`);
  lines.push(`- Unit threshold counts over 32/64/96px: ${report.unitOver32} / ${report.unitOver64} / ${report.unitOver96}`);
  lines.push(`- Vehicle threshold count over 32px: ${report.vehicleOver32}`);
  lines.push(`- Capture point changed count on apply: ${report.capturePointChanges}`);
  lines.push(`- WorldState publish attempts/skips: ${report.totalWorldPublishAttempts} / ${report.totalWorldPublishSkips}`);
  lines.push(`- Max worldState JSON bytes: ${report.maxWorldStateBytes}`);
  lines.push("", "## Next", "", report.nextRecommendation, "");
  return lines.join("\n");
}

function print(report) {
  console.log("\nP0-10B worldState cadence/interpolation triage");
  console.log(`Report: ${path.relative(root, report.reportPath)}`);
  console.log(`Decision: ${report.decision}`);
  console.table(report.pages.map((page) => ({
    page: page.name,
    worldPublishGapMax: page.worldPublishGapMs.max,
    worldApplyGapMax: page.worldApplyGapMs.max,
    publishAttempts: page.worldPublishAttempts,
    publishSkips: page.worldPublishSkips,
    unitTargetMax: page.unitTargetDelta.max,
    unitApplyMax: page.unitAppliedDelta.max,
    vehicleTargetMax: page.vehicleTargetDelta.max,
    vehicleApplyMax: page.vehicleAppliedDelta.max,
    snapshotBytesMax: Math.max(page.worldCaptureBytes.max, page.worldPublishBytes.max, page.worldApplyBytes.max),
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
    const roomId = `P010B-${Date.now()}`;
    await requestJson("/api/rooms", { method: "POST", body: roomSeed(roomId, blueProfile.playerId, redProfile.playerId) });
    await preparePage(pages[0], roomId, "blue-infantry");
    await preparePage(pages[1], roomId, "red-infantry");
    await Promise.all(pages.map((page) => page.eval(`window.__p010Reset?.("worldstate-cadence")`)));
    await sleep(700);
    await startRoom(roomId);
    await sleep(Number(process.env.IRONLINE_P0_10B_DURATION_MS || 18000));
    const pagesResult = await Promise.all(pages.map(collectPage));
    const report = {
      generatedAt: new Date().toISOString(),
      measurement: "headless Chrome two-player online match with worldState publish/apply instrumentation",
      roomId,
      pages: pagesResult,
      maxWorldPublishGapMs: Math.max(...pagesResult.map((page) => page.worldPublishGapMs.max || 0)),
      maxWorldApplyGapMs: Math.max(...pagesResult.map((page) => page.worldApplyGapMs.max || 0)),
      maxUnitTargetDeltaPx: Math.max(...pagesResult.map((page) => page.unitTargetDelta.max || 0)),
      maxUnitAppliedDeltaPx: Math.max(...pagesResult.map((page) => page.unitAppliedDelta.max || 0)),
      maxUnitResidualDeltaPx: Math.max(...pagesResult.map((page) => page.unitResidualDelta.max || 0)),
      maxVehicleTargetDeltaPx: Math.max(...pagesResult.map((page) => page.vehicleTargetDelta.max || 0)),
      maxVehicleAppliedDeltaPx: Math.max(...pagesResult.map((page) => page.vehicleAppliedDelta.max || 0)),
      maxVehicleResidualDeltaPx: Math.max(...pagesResult.map((page) => page.vehicleResidualDelta.max || 0)),
      unitOver32: pagesResult.reduce((sum, page) => sum + (page.unitOver32 || 0), 0),
      unitOver64: pagesResult.reduce((sum, page) => sum + (page.unitOver64 || 0), 0),
      unitOver96: pagesResult.reduce((sum, page) => sum + (page.unitOver96 || 0), 0),
      vehicleOver32: pagesResult.reduce((sum, page) => sum + (page.vehicleOver32 || 0), 0),
      capturePointChanges: pagesResult.reduce((sum, page) => sum + (page.capturePointChanges || 0), 0),
      totalWorldPublishAttempts: pagesResult.reduce((sum, page) => sum + (page.worldPublishAttempts || 0), 0),
      totalWorldPublishSkips: pagesResult.reduce((sum, page) => sum + (page.worldPublishSkips || 0), 0),
      maxWorldStateBytes: Math.max(...pagesResult.map((page) => Math.max(page.worldCaptureBytes.max, page.worldPublishBytes.max, page.worldApplyBytes.max))),
      reportPath: path.join(reportDir, "report.md"),
      resultPath: path.join(reportDir, "result.json")
    };
    report.decision = decide(report);
    report.nextRecommendation = report.decision.includes("Cadence primary")
      ? "P0-10C narrow worldState cadence trim with payload/write guard; keep AI behavior and transport unchanged."
      : report.decision.includes("Apply snap primary")
        ? "P0-10C narrow remote worldState interpolation buffer; keep AI behavior and transport unchanged."
        : "P0-10C collect a manual AI snap capture before changing worldState behavior.";
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
