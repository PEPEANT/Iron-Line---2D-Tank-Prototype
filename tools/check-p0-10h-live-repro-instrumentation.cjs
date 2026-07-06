"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { httpSummary, launchPage, makeRequestJson, sleep, stat, waitForServer } = require("./p0-browser-cdp-helper.cjs");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_P0_10H_PORT || 4391);
const baseUrl = `http://127.0.0.1:${appPort}`;
const requestJson = makeRequestJson(baseUrl);
const roomsFile = path.join(root, ".data", `p0-10h-repro-${process.pid}.json`);
const reportsRoot = path.join(root, "reports", "playtests");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const reportDir = path.join(reportsRoot, `p0-10h-repro-${stamp}`);

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}
function dist(a = {}, b = {}) {
  return Math.hypot((Number(a.x) || 0) - (Number(b.x) || 0), (Number(a.y) || 0) - (Number(b.y) || 0));
}
function gaps(values = []) {
  return values.slice(1).map((value, index) => value - values[index]).filter((value) => Number.isFinite(value));
}
function maxOf(pages, getter) {
  return Math.max(0, ...pages.map((page) => Number(getter(page)) || 0));
}
function sumOf(pages, getter) {
  return pages.reduce((sum, page) => sum + (Number(getter(page)) || 0), 0);
}

function player(id, name, team, slotId, now, x, y) {
  return {
    id, playerId: id, name, nickname: name, team, slotId, roleId: "infantry", role: "infantry_leader",
    classId: "infantry", currentClassId: "infantry", weaponId: team === "blue" ? "rifle" : "machinegun",
    participantType: "player", ready: true, host: team === "blue", updatedAt: now,
    position: { x, y, stateSeq: 1, stateUpdatedAt: now, updatedAt: now, alive: true, deathState: "alive", hp: 100, maxHp: 100, weaponId: team === "blue" ? "rifle" : "machinegun", aimX: team === "blue" ? x + 220 : x - 220, aimY: y, angle: team === "blue" ? 0 : Math.PI }
  };
}
function roomSeed(roomId, blueId, redId) {
  const now = Date.now();
  return {
    id: roomId, name: "P0-10H Repro Instrumentation", mode: "annihilation", phase: "waiting", locked: false,
    capacity: 8, blueFactionId: "korea", redFactionId: "russia", aiFillEmptySlots: true,
    blueAiTanks: 0, blueInfantry: 4, redTanks: 1, redInfantry: 4,
    players: [player(blueId, "Blue", "blue", "blue-infantry", now, 1200, 1400), player(redId, "Red", "red", "red-infantry", now, 1600, 1412)],
    spectators: [], admins: [], chat: [], events: [], commands: [], combatEvents: [],
    worldState: { roomId, hostId: blueId, tick: 0, updatedAt: now, vehicles: [], units: [], capturePoints: [] },
    createdAt: now, updatedAt: now
  };
}

async function installProbe(page) {
  await page.eval(`(() => {
    const limit = (list, max) => { while (list.length > max) list.shift(); };
    const now = () => performance.now();
    const push = (key, data, max = 3200) => {
      const p = window.__p010hProbe;
      if (!p || !p[key]) return;
      p[key].push(Object.assign({ t: now(), wall: Date.now() }, data || {}));
      limit(p[key], max);
    };
    const idOf = (item) => String(item?.callSign || item?.id || item?.name || "");
    const mapPositions = (items = []) => new Map(items.map((item) => [idOf(item), {
      x: Number(item?.x) || 0, y: Number(item?.y) || 0, state: String(item?.state || ""),
      owner: String(item?.owner || ""), progress: Number(item?.progress) || 0,
      inVehicle: Boolean(item?.inVehicle || item?.inTank)
    }]).filter(([id]) => id));
    const entityMaps = (game) => ({
      units: mapPositions([...(game?.infantry || []), ...(game?.crews || [])]),
      vehicles: mapPositions([...(game?.tanks || []), ...(game?.humvees || [])]),
      capturePoints: mapPositions(game?.capturePoints || [])
    });
    const snapMap = (items = []) => mapPositions(items);
    const movementStats = (snaps = [], before = new Map(), after = new Map(), options = {}) => {
      let maxTarget = 0, maxApplied = 0, maxResidual = 0, over32 = 0, over64 = 0, over96 = 0, maxId = "", changedState = 0, skippedMounted = 0, considered = 0;
      for (const snap of snaps || []) {
        const id = idOf(snap);
        const from = before.get(id);
        const to = after.get(id);
        if (!id || !from || !to) continue;
        const mounted = Boolean(snap.inVehicle || from.inVehicle || to.inVehicle);
        if (options.skipMounted && mounted) {
          skippedMounted += 1;
          continue;
        }
        const target = { x: Number(snap.x), y: Number(snap.y), state: String(snap.state || "") };
        if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) continue;
        considered += 1;
        const targetDelta = Math.hypot(target.x - from.x, target.y - from.y);
        const appliedDelta = Math.hypot(to.x - from.x, to.y - from.y);
        const residualDelta = Math.hypot(target.x - to.x, target.y - to.y);
        if (target.state && from.state && target.state !== from.state) changedState += 1;
        if (targetDelta > 32) over32 += 1;
        if (targetDelta > 64) over64 += 1;
        if (targetDelta > 96) over96 += 1;
        if (targetDelta > maxTarget) maxId = id;
        maxTarget = Math.max(maxTarget, targetDelta);
        maxApplied = Math.max(maxApplied, appliedDelta);
        maxResidual = Math.max(maxResidual, residualDelta);
      }
      return { count: snaps?.length || 0, considered, skippedMounted, maxId, maxTarget, maxApplied, maxResidual, over32, over64, over96, changedState, ratio: maxTarget > 0 ? maxApplied / maxTarget : 0 };
    };
    const postFrameStats = (snaps = [], after = new Map(), post = new Map(), options = {}) => {
      const targets = snapMap(snaps);
      let maxLocalDrift = 0, maxResidualGrowth = 0, pushedAway = 0, maxId = "", skippedMounted = 0;
      for (const [id, target] of targets.entries()) {
        const a = after.get(id);
        const p = post.get(id);
        if (!a || !p) continue;
        if (options.skipMounted && (target.inVehicle || a.inVehicle || p.inVehicle)) {
          skippedMounted += 1;
          continue;
        }
        const localDrift = Math.hypot(p.x - a.x, p.y - a.y);
        const residualAfter = Math.hypot(target.x - a.x, target.y - a.y);
        const residualPost = Math.hypot(target.x - p.x, target.y - p.y);
        const growth = residualPost - residualAfter;
        if (localDrift > maxLocalDrift) maxId = id;
        maxLocalDrift = Math.max(maxLocalDrift, localDrift);
        maxResidualGrowth = Math.max(maxResidualGrowth, growth);
        if (localDrift > 4 && growth > 2) pushedAway += 1;
      }
      return { maxId, maxLocalDrift, maxResidualGrowth, pushedAway, skippedMounted };
    };
    const worldAt = (room) => Number(room?.worldState?.updatedAt) || 0;
    const worldTick = (room) => Number(room?.worldState?.tick) || 0;
    const wrap = (obj, method, key, makeData) => {
      if (!obj || typeof obj[method] !== "function" || obj[method].__p010hWrapped) return;
      const original = obj[method];
      obj[method] = function(...args) {
        const started = now();
        let before = null;
        if (method === "applyOnlineWorldState") before = entityMaps(this);
        if (method === "applyRemotePlayerState") {
          const payload = args?.[0] || {};
          const previous = (this.game?.()?.onlineSession?.players || []).find((p) => p.id === payload.playerId) || null;
          const state = previous?.position || previous || {};
          before = previous ? {
            stateSeq: Number(state.stateSeq || previous.stateSeq) || 0,
            updatedAt: Number(state.updatedAt || state.stateUpdatedAt || previous.updatedAt) || 0,
            x: Number(state.x ?? previous.x) || 0,
            y: Number(state.y ?? previous.y) || 0
          } : null;
        }
        const prevAppliedAt = method === "applyOnlineWorldState" ? Number(this.onlineWorldAppliedAt || 0) : 0;
        try {
          const result = original.apply(this, args);
          const data = makeData ? makeData.call(this, args, result, now() - started, before, prevAppliedAt) : { ms: now() - started };
          push(key, data);
          return result;
        } catch (error) {
          push("errors", { source: key, message: String(error?.message || error) });
          throw error;
        }
      };
      obj[method].__p010hWrapped = true;
    };
    const wrapAsync = (obj, method, key, makeData) => {
      if (!obj || typeof obj[method] !== "function" || obj[method].__p010hWrapped) return;
      const original = obj[method];
      obj[method] = async function(...args) {
        const started = now();
        const roomBefore = this.getRoom?.(args[0]);
        try {
          const result = await original.apply(this, args);
          push(key, makeData.call(this, args, result, now() - started, roomBefore));
          return result;
        } catch (error) {
          push("errors", { source: key, message: String(error?.message || error) });
          throw error;
        }
      };
      obj[method].__p010hWrapped = true;
    };
    if (!Storage.prototype.__p010hSetWrapped) {
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        const started = now();
        try { return originalSet.call(this, key, value); }
        finally { push("storage", { key, bytes: String(value || "").length, ms: now() - started }, 2200); }
      };
      Storage.prototype.__p010hSetWrapped = true;
    }
    window.__p010hPatch = function() {
      const game = window.IronLine?.game;
      const registry = window.IronLine?.roomRegistry;
      const flow = game?.hud?.sessionFlow;
      wrap(flow, "applyRemotePlayerState", "playerApplies", function(args, result, ms, beforeState) {
        const payload = args?.[0] || {};
        const incoming = payload.state || {};
        const updatedAt = Number(incoming.updatedAt || incoming.stateUpdatedAt) || 0;
        return { ms, applied: Boolean(result), playerId: payload.playerId || "", stateSeq: Number(incoming.stateSeq) || 0, updatedAt, ageAtApply: updatedAt ? Date.now() - updatedAt : 0, x: Number(incoming.x) || 0, y: Number(incoming.y) || 0, previousSeq: Number(beforeState?.stateSeq) || 0, previousUpdatedAt: Number(beforeState?.updatedAt) || 0, previousX: Number(beforeState?.x) || 0, previousY: Number(beforeState?.y) || 0 };
      });
      wrap(game?.renderer, "remoteHumanPlayers", "playerRenders", function(_args, result, ms) {
        const session = game?.onlineSession || {};
        let maxRenderDelta = 0, maxId = "", entries = 0;
        for (const entry of result || []) {
          const player = (session.players || []).find((p) => p.id === entry.id);
          const raw = player?.position || player || {};
          const d = Math.hypot((Number(entry.unit?.x) || 0) - (Number(raw.x) || 0), (Number(entry.unit?.y) || 0) - (Number(raw.y) || 0));
          entries += 1;
          if (d > maxRenderDelta) { maxRenderDelta = d; maxId = entry.id || ""; }
        }
        return { ms, entries, maxRenderDelta, maxId };
      });
      wrap(game, "captureOnlineWorldState", "worldCaptures", function(_args, result, ms) {
        return { ms, hostId: result?.hostId || "", tick: Number(result?.tick) || 0, units: result?.units?.length || 0, vehicles: result?.vehicles?.length || 0, bytes: JSON.stringify(result || {}).length };
      });
      wrap(game, "applyOnlineWorldState", "worldApplies", function(args, result, ms, before, prevAppliedAt) {
        const state = args?.[0] || {};
        const after = entityMaps(this);
        const unit = movementStats(state.units || [], before?.units, after.units, { skipMounted: true });
        const unitAll = movementStats(state.units || [], before?.units, after.units);
        const vehicle = movementStats(state.vehicles || [], before?.vehicles, after.vehicles);
        requestAnimationFrame(() => {
          const post = entityMaps(this);
          push("worldPostFrames", { hostId: state.hostId || "", updatedAt: Number(state.updatedAt) || 0, tick: Number(state.tick) || 0, unit: postFrameStats(state.units || [], after.units, post.units, { skipMounted: true }), vehicle: postFrameStats(state.vehicles || [], after.vehicles, post.vehicles) });
        });
        return { applied: Boolean(result), ms, hostId: state.hostId || "", updatedAt: Number(state.updatedAt) || 0, tick: Number(state.tick) || 0, prevAppliedAt, staleInput: Number(state.updatedAt || 0) < prevAppliedAt, units: state.units?.length || 0, vehicles: state.vehicles?.length || 0, unit, unitAll, vehicle };
      });
      wrap(registry, "mergeRoomDetailDelta", "detailMerges", function(args, result, ms) {
        const previous = args?.[0] || null, delta = args?.[1] || null;
        return { ms, previousWorldAt: worldAt(previous), deltaWorldAt: worldAt(delta), resultWorldAt: worldAt(result), previousTick: worldTick(previous), deltaTick: worldTick(delta), resultTick: worldTick(result), staleDelta: Boolean(worldAt(delta) && worldAt(delta) < worldAt(previous)), resultRegression: Boolean(worldAt(result) < worldAt(previous)), hostChanged: Boolean(previous?.worldState?.hostId && result?.worldState?.hostId && previous.worldState.hostId !== result.worldState.hostId) };
      });
      wrap(registry, "upsertRemoteRoom", "roomUpserts", function(args, _result, ms) {
        const room = args?.[0] || {};
        const current = (this.remoteRooms || []).find((item) => item.id === room.id) || this.readLocalRooms?.().find((item) => item.id === room.id);
        return { ms, roomId: room.id || "", incomingWorldAt: worldAt(room), currentWorldAt: worldAt(current), incomingTick: worldTick(room), currentTick: worldTick(current), staleIncoming: Boolean(worldAt(room) && worldAt(current) && worldAt(room) < worldAt(current)), hostChanged: Boolean(room?.worldState?.hostId && current?.worldState?.hostId && room.worldState.hostId !== current.worldState.hostId) };
      });
      wrapAsync(registry, "fetchRemoteRoomDetail", "detailFetches", function(args, result, ms, beforeRoom) {
        return { ms, roomId: args?.[0] || "", beforeWorldAt: worldAt(beforeRoom), resultWorldAt: worldAt(result), beforeTick: worldTick(beforeRoom), resultTick: worldTick(result), staleResult: Boolean(worldAt(result) && worldAt(beforeRoom) && worldAt(result) < worldAt(beforeRoom)), bytes: JSON.stringify(result || {}).length };
      });
    };
    window.__p010hSample = function() {
      const game = window.IronLine?.game;
      const registry = window.IronLine?.roomRegistry;
      const roomId = game?.onlineSession?.roomId || registry?.selectedRoomId?.() || "";
      const room = roomId ? registry?.getRoom?.(roomId) : null;
      push("samples", { roomId, playerId: game?.onlineSession?.playerId || "", isWorldHost: Boolean(game?.isOnlineWorldHost?.(room)), hostCandidate: game?.onlineWorldHostPlayerId?.(room) || "", worldHostId: room?.worldState?.hostId || "", worldAt: worldAt(room), worldTick: worldTick(room), matchStarted: Boolean(game?.matchStarted), matchPhase: game?.matchPhase || "", localUnits: (game?.infantry?.length || 0) + (game?.crews?.length || 0), worldUnits: room?.worldState?.units?.length || 0 }, 3600);
    };
    window.__p010hReset = function(label) {
      window.__p010hProbe = { label, frames: [], longFrames: [], samples: [], playerApplies: [], playerRenders: [], worldCaptures: [], worldApplies: [], worldPostFrames: [], detailMerges: [], detailFetches: [], roomUpserts: [], storage: [], errors: [] };
      window.__p010hPatch();
      if (window.__p010hTimer) clearInterval(window.__p010hTimer);
      window.__p010hTimer = setInterval(() => { window.__p010hPatch(); window.__p010hSample(); }, 100);
      window.__p010hSample();
    };
    if (!window.__p010hFramesStarted) {
      window.__p010hFramesStarted = true;
      let last = now();
      requestAnimationFrame(function loop(ts) {
        const p = window.__p010hProbe;
        if (p) {
          const gap = Math.max(0, ts - last);
          p.frames.push(gap); limit(p.frames, 2200);
          if (gap > 50) { p.longFrames.push({ t: ts, gap }); limit(p.longFrames, 160); }
        }
        last = ts;
        requestAnimationFrame(loop);
      });
    }
    window.__p010hCollect = function() {
      if (window.__p010hTimer) clearInterval(window.__p010hTimer);
      window.__p010hTimer = null;
      return window.__p010hProbe || {};
    };
    window.__p010hReset("boot");
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
    window.__p010hPatch?.();
    game.hud.sessionFlow.publishLocalPlayer(game, { force: true });
    return { ok: true, sessionMode: game.sessionMode, playerId: game.onlineSession.playerId, slotId: local?.slotId || "" };
  })()`);
  if (!result?.ok) throw new Error(`${page.name} session setup failed: ${JSON.stringify(result)}`);
}
async function startRoom(roomId) {
  const detail = await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`);
  const room = detail.room;
  const now = Date.now();
  await requestJson("/api/rooms", { method: "POST", body: { ...room, phase: "playing", locked: true, startedBy: "admin", startedAt: now, updatedAt: now } });
}
async function startMotion(page, direction) {
  await page.eval(`(() => {
    let n = 0;
    const id = setInterval(() => {
      const game = window.IronLine?.game;
      if (!game?.matchStarted || !game.player) return;
      n += 1;
      game.player.x += ${direction} * (n % 18 < 9 ? 2.4 : -1.8);
      game.player.y += (n % 24 < 12 ? 0.8 : -0.7);
      game.hud?.sessionFlow?.publishLocalPlayer?.(game, { force: true });
    }, 90);
    window.__p010hMotion = id;
  })()`);
}
async function stopMotion(page) {
  await page.eval("if (window.__p010hMotion) { clearInterval(window.__p010hMotion); window.__p010hMotion = null; }").catch(() => null);
}

async function collectPage(page) {
  const probe = await page.eval("window.__p010hCollect?.() || {}");
  const frame = stat((probe.frames || []).slice(1));
  frame.longFrames50 = (probe.frames || []).filter((value) => value > 50).length;
  const worldApplies = (probe.worldApplies || []).filter((item) => item.applied);
  const worldPost = probe.worldPostFrames || [];
  const playerApplies = probe.playerApplies || [];
  const playerRenders = probe.playerRenders || [];
  const samples = probe.samples || [];
  const worldAtValues = samples.map((item) => Number(item.worldAt) || 0).filter(Boolean);
  const tickValues = samples.map((item) => Number(item.worldTick) || 0).filter(Boolean);
  const hostIds = new Set(samples.map((item) => item.worldHostId).filter(Boolean));
  return {
    name: page.name,
    endpoints: {
      rooms: httpSummary(page.metrics, "GET /api/rooms"),
      detail: httpSummary(page.metrics, "GET /api/rooms/:id"),
      participants: httpSummary(page.metrics, "POST /participants"),
      combat: httpSummary(page.metrics, "POST /combat"),
      postRooms: httpSummary(page.metrics, "POST /api/rooms")
    },
    frame,
    player: {
      applies: playerApplies.length,
      applied: playerApplies.filter((item) => item.applied).length,
      staleOlder: playerApplies.filter((item) => (item.previousSeq && item.stateSeq && item.stateSeq < item.previousSeq) || (item.previousUpdatedAt && item.updatedAt && item.updatedAt < item.previousUpdatedAt)).length,
      packetAgeMs: stat(playerApplies.map((item) => Number(item.ageAtApply) || 0)),
      renderDelta: stat(playerRenders.map((item) => Number(item.maxRenderDelta) || 0)),
      renderEntries: stat(playerRenders.map((item) => Number(item.entries) || 0))
    },
    world: {
      applies: worldApplies.length,
      staleInputs: worldApplies.filter((item) => item.staleInput).length,
      hostIds: Array.from(hostIds),
      worldAtRegressions: gaps(worldAtValues).filter((gap) => gap < 0).length,
      tickRegressions: gaps(tickValues).filter((gap) => gap < 0).length,
      applyGapMs: stat(gaps(worldApplies.map((item) => item.t))),
      unitTarget: stat(worldApplies.map((item) => Number(item.unit?.maxTarget) || 0)),
      unitApplied: stat(worldApplies.map((item) => Number(item.unit?.maxApplied) || 0)),
      unitResidual: stat(worldApplies.map((item) => Number(item.unit?.maxResidual) || 0)),
      unitAllTarget: stat(worldApplies.map((item) => Number(item.unitAll?.maxTarget) || 0)),
      unitMountedSkipped: sumEvents(worldApplies, "unit.skippedMounted"),
      unitChangedState: sumEvents(worldApplies, "unit.changedState"),
      vehicleTarget: stat(worldApplies.map((item) => Number(item.vehicle?.maxTarget) || 0)),
      vehicleApplied: stat(worldApplies.map((item) => Number(item.vehicle?.maxApplied) || 0)),
      postUnitDrift: stat(worldPost.map((item) => Number(item.unit?.maxLocalDrift) || 0)),
      postUnitResidualGrowth: stat(worldPost.map((item) => Number(item.unit?.maxResidualGrowth) || 0)),
      postUnitPushedAway: sumEvents(worldPost, "unit.pushedAway"),
      postVehicleDrift: stat(worldPost.map((item) => Number(item.vehicle?.maxLocalDrift) || 0)),
      postVehiclePushedAway: sumEvents(worldPost, "vehicle.pushedAway")
    },
    staleMerge: {
      detailFetchStale: (probe.detailFetches || []).filter((item) => item.staleResult).length,
      detailMergeStale: (probe.detailMerges || []).filter((item) => item.staleDelta || item.resultRegression).length,
      upsertStale: (probe.roomUpserts || []).filter((item) => item.staleIncoming).length,
      detailHostChanges: (probe.detailMerges || []).filter((item) => item.hostChanged).length,
      upsertHostChanges: (probe.roomUpserts || []).filter((item) => item.hostChanged).length,
      hostChanges: (probe.detailMerges || []).filter((item) => item.hostChanged).length + (probe.roomUpserts || []).filter((item) => item.hostChanged).length
    },
    storage: { count: (probe.storage || []).length, bytes: stat((probe.storage || []).map((item) => item.bytes || 0)) },
    errors: [...page.metrics.errors, ...(probe.errors || []).map((item) => item.message || String(item))].slice(0, 20)
  };
}
function sumEvents(items = [], pathName = "") {
  const parts = pathName.split(".");
  return items.reduce((sum, item) => {
    let value = item;
    for (const part of parts) value = value?.[part];
    return sum + (Number(value) || 0);
  }, 0);
}

function decide(report) {
  const pages = report.pages || [];
  const playerRenderMax = maxOf(pages, (page) => page.player.renderDelta.max);
  const stalePackets = sumOf(pages, (page) => page.player.staleOlder);
  const staleMerge = sumOf(pages, (page) => page.staleMerge.detailFetchStale + page.staleMerge.detailMergeStale + page.staleMerge.upsertStale);
  const hostChanges = sumOf(pages, (page) => page.staleMerge.hostChanges);
  const postPush = sumOf(pages, (page) => page.world.postUnitPushedAway + page.world.postVehiclePushedAway);
  const postResidualGrowth = maxOf(pages, (page) => page.world.postUnitResidualGrowth.max);
  const unitTarget = maxOf(pages, (page) => page.world.unitTarget.max);
  const unitTargetP95 = maxOf(pages, (page) => page.world.unitTarget.p95);
  const unitApplied = maxOf(pages, (page) => page.world.unitApplied.max);
  if (stalePackets > 0 || playerRenderMax > 96) return "other_player_position";
  if (staleMerge > 0 || hostChanges > 0) return "stale_worldstate_merge";
  if (postPush > 0 || postResidualGrowth > 12) return "non_host_local_simulation_drift";
  if (unitTargetP95 > 96 || (unitTarget > 180 && unitApplied < unitTarget * 0.3)) return "worldstate_interpolation_lag";
  return "no_high_risk_reproduced";
}
function nextRecommendation(decision) {
  if (decision === "other_player_position") return "P0-10I player_state render/apply instrumentation fix candidate; do not change WS transport.";
  if (decision === "stale_worldstate_merge") return "P0-10I stale worldState merge guard; reject older room-detail/localStorage worldState on clients.";
  if (decision === "non_host_local_simulation_drift") return "P0-10I non-host AI/worldState ownership guard; prevent local AI sim from moving host-controlled units.";
  if (decision === "worldstate_interpolation_lag") return "P0-10I worldState visual apply ownership check; do not cut cadence yet.";
  return "Run manual live repro with this probe attached before choosing P0-10I.";
}
function markdownReport(report) {
  const lines = [
    "# P0-10H Live Repro Instrumentation",
    "",
    `Generated: ${report.generatedAt}`,
    `Measurement: ${report.measurement}`,
    `Decision: ${report.decision}`,
    `Next: ${report.nextRecommendation}`,
    "",
    "## Summary",
    "",
    "| Page | Long frames | Player render max | Stale player packets | World apply gap max | Unit target/apply max | Post-unit drift max | Post pushed-away | Stale merge | Host changes | Storage writes | Errors |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const page of report.pages) {
    const stale = page.staleMerge.detailFetchStale + page.staleMerge.detailMergeStale + page.staleMerge.upsertStale;
    const pushed = page.world.postUnitPushedAway + page.world.postVehiclePushedAway;
    lines.push(`| ${page.name} | ${page.frame.longFrames50} | ${page.player.renderDelta.max} | ${page.player.staleOlder} | ${page.world.applyGapMs.max} | ${page.world.unitTarget.max}/${page.world.unitApplied.max} | ${page.world.postUnitDrift.max} | ${pushed} | ${stale} | ${page.staleMerge.hostChanges} | ${page.storage.count} | ${page.errors.length} |`);
  }
  lines.push("", "## Scope", "", "- Instrumentation only.", "- No gameplay fix, interpolation tuning, cadence change, transport change, admin split, AI redesign, or alpha declaration.", "");
  return lines.join("\n");
}
function print(report) {
  console.log("\\nP0-10H live repro instrumentation");
  console.log(`Report: ${path.relative(root, report.reportPath)}`);
  console.log(`Decision: ${report.decision}`);
  console.log(`Next: ${report.nextRecommendation}`);
  console.table(report.pages.map((page) => ({
    page: page.name,
    longFrames50: page.frame.longFrames50,
    playerRenderMax: page.player.renderDelta.max,
    stalePlayerPackets: page.player.staleOlder,
    worldApplyGapMax: page.world.applyGapMs.max,
    unitTargetMax: page.world.unitTarget.max,
    unitApplyMax: page.world.unitApplied.max,
    postUnitDriftMax: page.world.postUnitDrift.max,
    postPushedAway: page.world.postUnitPushedAway + page.world.postVehiclePushedAway,
    staleMerge: page.staleMerge.detailFetchStale + page.staleMerge.detailMergeStale + page.staleMerge.upsertStale,
    hostChanges: page.staleMerge.hostChanges,
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
    pages.push(await launchPage({ name: "blue", debugPort: appPort + 101, originHost: "127.0.0.1", appPort, baseUrl, profilePrefix: "iron-line-p0-10h", installProbe }));
    pages.push(await launchPage({ name: "red", debugPort: appPort + 102, originHost: "localhost", appPort, baseUrl, profilePrefix: "iron-line-p0-10h", installProbe }));
    const [blueProfile, redProfile] = await Promise.all(pages.map(profile));
    if (!blueProfile.playerId || !redProfile.playerId || blueProfile.playerId === redProfile.playerId) throw new Error("Could not get distinct browser player profiles.");
    const roomId = `P010H-${Date.now()}`;
    await requestJson("/api/rooms", { method: "POST", body: roomSeed(roomId, blueProfile.playerId, redProfile.playerId) });
    await preparePage(pages[0], roomId, "blue-infantry");
    await preparePage(pages[1], roomId, "red-infantry");
    await Promise.all(pages.map((page) => page.eval(`window.__p010hReset?.("live-repro")`)));
    await sleep(700);
    await startRoom(roomId);
    await sleep(5200);
    await Promise.all([startMotion(pages[0], 1), startMotion(pages[1], -1)]);
    await sleep(Number(process.env.IRONLINE_P0_10H_DURATION_MS || 18000));
    await Promise.all(pages.map(stopMotion));
    await sleep(350);
    const pagesResult = await Promise.all(pages.map(collectPage));
    const report = {
      generatedAt: new Date().toISOString(),
      measurement: "headless Chrome two-player live repro instrumentation for player_state and AI/worldState source flip",
      roomId,
      pages: pagesResult,
      reportPath: path.join(reportDir, "report.md"),
      resultPath: path.join(reportDir, "result.json")
    };
    report.decision = decide(report);
    report.nextRecommendation = nextRecommendation(report.decision);
    fs.writeFileSync(report.resultPath, `${JSON.stringify(report, null, 2)}\\n`, "utf8");
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
