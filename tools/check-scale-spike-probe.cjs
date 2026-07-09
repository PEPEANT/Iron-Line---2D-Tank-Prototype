"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_SCALE_SPIKE_PORT || 4213);
const cdpBasePort = Number(process.env.IRONLINE_SCALE_SPIKE_CDP_PORT || 9250);
const appUrl = `http://127.0.0.1:${appPort}/index.html`;
const chromePath = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
].find((item) => fs.existsSync(item));
const profileIds = (process.env.IRONLINE_SCALE_SPIKE_PROFILES || "ai-8v8,ai-25v25")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const repeatCount = Math.max(1, Math.min(5, Number(process.env.IRONLINE_SCALE_SPIKE_REPEATS || 2)));
const sampleFrames = Math.max(120, Math.min(1800, Number(process.env.IRONLINE_SCALE_SPIKE_FRAMES || 720)));
const warmupFrames = Math.max(0, Math.min(600, Number(process.env.IRONLINE_SCALE_SPIKE_WARMUP || 90)));
const spikeFrameMs = Math.max(16, Number(process.env.IRONLINE_SCALE_SPIKE_FRAME_MS || 40));
const longFrameMs = Math.max(spikeFrameMs, Number(process.env.IRONLINE_SCALE_SPIKE_LONG_MS || 50));
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const reportDir = path.join(root, "reports", "playtests", `scale-spike-${stamp}`);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(port, pathname, timeout = 1200) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port, path: pathname, timeout }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error(`${pathname} timed out`)));
  });
}

async function waitForApp() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 9000) {
    try {
      const build = await requestJson(appPort, "/api/build");
      if (build?.ok) return build;
    } catch (_error) {
      await sleep(220);
    }
  }
  throw new Error("Static server did not expose /api/build in time.");
}

async function waitForCdpPage(cdpPort) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    try {
      const list = await requestJson(cdpPort, "/json/list");
      const page = list.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch (_error) {
      await sleep(220);
    }
  }
  throw new Error("Chrome did not expose a CDP page in time.");
}

function connectCdp(webSocketDebuggerUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(webSocketDebuggerUrl);
    let sequence = 0;
    const pending = new Map();

    ws.on("open", () => {
      resolve({
        send(method, params = {}) {
          const id = ++sequence;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { res, rej, method }));
        },
        close() {
          ws.close();
        }
      });
    });

    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (!message.id) return;
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      if (message.error) item.rej(new Error(`${item.method}: ${message.error.message}`));
      else item.res(message.result);
    });

    ws.on("error", reject);
  });
}

async function evaluate(client, expression, timeout = 30000) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime exception";
    throw new Error(description);
  }
  return result.result.value;
}

async function evaluateWithRetry(client, expression, timeout = 30000, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await evaluate(client, expression, timeout);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || "");
      if (!message.includes("Execution context was destroyed") && !message.includes("Cannot find context")) throw error;
      await sleep(600 * attempt);
    }
  }
  throw lastError;
}

function scenarioFor(profileId) {
  return `
new Promise((resolve, reject) => {
  const profileId = ${JSON.stringify(profileId)};
  const sampleFrames = ${JSON.stringify(sampleFrames)};
  const warmupFrames = ${JSON.stringify(warmupFrames)};
  const spikeFrameMs = ${JSON.stringify(spikeFrameMs)};
  const longFrameMs = ${JSON.stringify(longFrameMs)};
  const fields = [
    "update", "battlefield", "ai.tacticalMap", "ai.commanders", "ai.squads",
    "drones", "ai.infantry", "reports", "vehicles", "combat.projectiles",
    "combat.effects", "objectives", "spacing", "render", "render.minimap",
    "render.canvasHud", "render.tactical", "ai.observer"
  ];

  const round = (value, digits = 3) => Number.isFinite(Number(value)) ? Math.round(Number(value) * (10 ** digits)) / (10 ** digits) : 0;
  const percentile = (values, ratio) => {
    const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))] || 0;
  };
  const maxOf = (values) => values.length ? Math.max(...values.filter((value) => Number.isFinite(value))) : 0;
  const avgOf = (values) => values.length ? values.reduce((sum, value) => sum + (Number(value) || 0), 0) / values.length : 0;
  const actorId = (actor, index) => String(actor?.callSign || actor?.id || actor?.name || (actor?.constructor?.name || "actor") + ":" + index);

  const waitForGame = () => new Promise((done, fail) => {
    const startedAt = Date.now();
    const tick = () => {
      if (window.IronLine?.game) return done(window.IronLine.game);
      if (Date.now() - startedAt > 8000) return fail(new Error("game missing"));
      setTimeout(tick, 100);
    };
    tick();
  });

  const waitFrames = (count) => new Promise((done) => {
    let frames = 0;
    const step = () => {
      frames += 1;
      if (frames >= count) done();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  const installInfantryMethodProbe = () => {
    const InfantryAI = window.IronLine?.InfantryAI;
    if (!InfantryAI?.prototype) return { installed: false, reason: "InfantryAI missing" };
    if (InfantryAI.__scaleSpikeProbeInstalled) return { installed: true, reason: "already-installed" };
    const methods = [
      "update", "selectTarget", "canVisuallyAcquireTarget", "directlySeesTarget",
      "hasFacingAwareness", "selectTankThreat", "updateScoutReports",
      "selectReportedVehicleThreat", "selectReportedSoftContact", "handleTankThreat",
      "handleSquadTacticalOrder", "handleTransportOrder", "findCoverPoint",
      "evaluateCoverPoint", "coverFireScore", "formationTarget", "safeFormationTarget",
      "deconflictedFormationTarget", "formationCrowdScore", "rebuildPath", "moveTo",
      "avoidanceVector", "friendlyTankFireLaneAvoidance", "pointPassable",
      "activeMoveTarget", "recordMovement", "tryFire", "tryFireTank", "tryFireRpgAtTank"
    ];
    const stats = {};
    const probe = {
      installedAt: performance.now(),
      methods,
      stats
    };
    window.__ironLineInfantryMethodProbe = probe;
    for (const name of methods) {
      const original = InfantryAI.prototype[name];
      if (typeof original !== "function") continue;
      stats[name] = {
        count: 0,
        total: 0,
        max: 0,
        maxUnit: "",
        slow: []
      };
      InfantryAI.prototype[name] = function probedInfantryMethod(...args) {
        const startedAt = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          const elapsed = performance.now() - startedAt;
          const item = stats[name];
          item.count += 1;
          item.total += elapsed;
          if (elapsed > item.max) {
            item.max = elapsed;
            item.maxUnit = this?.unit?.callSign || this?.unit?.id || "";
          }
          if (elapsed >= 4 && item.slow.length < 12) {
            item.slow.push({
              elapsed: round(elapsed, 3),
              unit: this?.unit?.callSign || this?.unit?.id || "",
              state: String(this?.state || this?.unit?.ai?.state || ""),
              lod: this?.unit?.aiLod?.lod || "",
              skipped: Boolean(this?.unit?.aiLod?.skipped),
              target: this?.target?.callSign || this?.target?.id || ""
            });
          }
        }
      };
    }
    InfantryAI.__scaleSpikeProbeInstalled = true;
    return { installed: true, reason: "installed", methods: methods.filter((name) => stats[name]) };
  };

  const methodProbeSnapshot = () => {
    const probe = window.__ironLineInfantryMethodProbe;
    if (!probe?.stats) return null;
    const entries = Object.entries(probe.stats).map(([name, item]) => ({
      name,
      count: item.count,
      total: round(item.total, 3),
      avg: item.count ? round(item.total / item.count, 4) : 0,
      max: round(item.max, 3),
      maxUnit: item.maxUnit || "",
      slow: item.slow || []
    }));
    return {
      installedAt: round(probe.installedAt || 0, 1),
      methods: probe.methods || [],
      stats: entries.sort((a, b) => b.total - a.total)
    };
  };

  const installNavGraphProbe = () => {
    const NavGraph = window.IronLine?.NavGraph;
    if (!NavGraph?.prototype) return { installed: false, reason: "NavGraph missing" };
    if (NavGraph.__scaleSpikeProbeInstalled) return { installed: true, reason: "already-installed" };
    const methods = [
      "findPathBetween", "nearestNode", "findPath", "segmentBlocked",
      "computeSegmentBlocked", "ensureSegmentCacheFresh", "edgeBlockedForOptions",
      "lowestScoreNode", "cachePath", "cacheNearest"
    ];
    const stats = {};
    const probe = {
      installedAt: performance.now(),
      methods,
      stats,
      pathCacheHit: 0,
      pathCacheMiss: 0,
      nearestCacheHit: 0,
      nearestCacheMiss: 0,
      segmentCacheHit: 0,
      segmentCacheMiss: 0,
      cacheClears: 0,
      slowCalls: []
    };
    window.__ironLineNavGraphProbe = probe;

    const originalFindPath = NavGraph.prototype.findPath;
    if (typeof originalFindPath === "function") {
      NavGraph.prototype.findPath = function probedFindPath(startId, goalId, options = {}) {
        const cacheKey = this.pathCacheKey?.(startId, goalId, options);
        const had = Boolean(cacheKey && this.pathCache?.has?.(cacheKey));
        if (had) probe.pathCacheHit += 1;
        else probe.pathCacheMiss += 1;
        return originalFindPath.apply(this, arguments);
      };
    }

    const originalNearestNode = NavGraph.prototype.nearestNode;
    if (typeof originalNearestNode === "function") {
      NavGraph.prototype.nearestNode = function probedNearestNode(x, y, options = {}) {
        const cacheKey = this.nearestCacheKey?.(x, y, options);
        const had = Boolean(cacheKey && this.nearestCache?.has?.(cacheKey));
        if (had) probe.nearestCacheHit += 1;
        else probe.nearestCacheMiss += 1;
        return originalNearestNode.apply(this, arguments);
      };
    }

    const originalSegmentBlocked = NavGraph.prototype.segmentBlocked;
    if (typeof originalSegmentBlocked === "function") {
      NavGraph.prototype.segmentBlocked = function probedSegmentBlocked(x1, y1, x2, y2, padding = 56, options = {}) {
        let had = false;
        if (options.cache !== false && this.segmentCacheKey) {
          const key = this.segmentCacheKey(x1, y1, x2, y2, padding, options);
          had = Boolean(this.segmentCache?.has?.(key));
        }
        if (had) probe.segmentCacheHit += 1;
        else probe.segmentCacheMiss += 1;
        return originalSegmentBlocked.apply(this, arguments);
      };
    }

    const originalEnsure = NavGraph.prototype.ensureSegmentCacheFresh;
    if (typeof originalEnsure === "function") {
      NavGraph.prototype.ensureSegmentCacheFresh = function probedEnsureSegmentCacheFresh() {
        const before = this.segmentCacheSignature;
        const result = originalEnsure.apply(this, arguments);
        if (before !== this.segmentCacheSignature) probe.cacheClears += 1;
        return result;
      };
    }

    for (const name of methods) {
      const original = NavGraph.prototype[name];
      if (typeof original !== "function") continue;
      if (original.__scaleSpikeTimed) continue;
      stats[name] = {
        count: 0,
        total: 0,
        max: 0,
        slow: []
      };
      const wrapped = function timedNavGraphMethod(...args) {
        const startedAt = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          const elapsed = performance.now() - startedAt;
          const item = stats[name];
          item.count += 1;
          item.total += elapsed;
          item.max = Math.max(item.max, elapsed);
          if (elapsed >= 4 && item.slow.length < 16) {
            item.slow.push({
              elapsed: round(elapsed, 3),
              args: args.slice(0, 3).map((arg) => {
                if (arg && typeof arg === "object") {
                  return {
                    id: arg.id || arg.callSign || arg.name || "",
                    x: round(arg.x || 0, 1),
                    y: round(arg.y || 0, 1)
                  };
                }
                return String(arg);
              }),
              nodes: this?.nodes?.length || 0,
              pathCache: this?.pathCache?.size || 0,
              nearestCache: this?.nearestCache?.size || 0,
              segmentCache: this?.segmentCache?.size || 0
            });
          }
        }
      };
      wrapped.__scaleSpikeTimed = true;
      NavGraph.prototype[name] = wrapped;
    }

    NavGraph.__scaleSpikeProbeInstalled = true;
    return { installed: true, reason: "installed", methods: methods.filter((name) => stats[name]) };
  };

  const navGraphProbeSnapshot = () => {
    const probe = window.__ironLineNavGraphProbe;
    if (!probe?.stats) return null;
    const stats = Object.entries(probe.stats).map(([name, item]) => ({
      name,
      count: item.count,
      total: round(item.total, 3),
      avg: item.count ? round(item.total / item.count, 4) : 0,
      max: round(item.max, 3),
      slow: item.slow || []
    })).sort((a, b) => b.total - a.total);
    return {
      installedAt: round(probe.installedAt || 0, 1),
      pathCacheHit: probe.pathCacheHit,
      pathCacheMiss: probe.pathCacheMiss,
      nearestCacheHit: probe.nearestCacheHit,
      nearestCacheMiss: probe.nearestCacheMiss,
      segmentCacheHit: probe.segmentCacheHit,
      segmentCacheMiss: probe.segmentCacheMiss,
      cacheClears: probe.cacheClears,
      stats
    };
  };

  const lightState = (game) => {
    const vehicles = [...(game.tanks || []), ...(game.humvees || [])].filter((vehicle) => vehicle?.alive !== false);
    const infantry = (game.infantry || []).filter((unit) => unit?.alive !== false);
    const drones = (game.drones || []).filter((drone) => drone?.alive !== false && drone?.destroyed !== true);
    const actors = [...infantry, ...vehicles, ...drones];
    const debugOf = (vehicle) => vehicle?.ai?.debug || {};
    const waitingVehicles = vehicles
      .filter((vehicle) => {
        const debug = debugOf(vehicle);
        const state = String(debug.state || vehicle.ai?.state || "");
        return Number(debug.trafficHoldTimer || 0) > 0 ||
          Number(debug.stuckTimer || 0) > 1.4 ||
          state.includes("wait") ||
          state.includes("hold") ||
          state.includes("blocked");
      })
      .slice(0, 6)
      .map((vehicle) => {
        const debug = debugOf(vehicle);
        return {
          id: actorId(vehicle, 0),
          kind: vehicle.vehicleType || vehicle.kind || "vehicle",
          state: String(debug.state || vehicle.ai?.state || ""),
          trafficHoldTimer: round(debug.trafficHoldTimer || 0, 2),
          stuckTimer: round(debug.stuckTimer || 0, 2),
          lod: vehicle.aiLod?.lod || "",
          skipped: Boolean(vehicle.aiLod?.skipped)
        };
      });
    const lodCounts = actors.reduce((acc, actor) => {
      const lod = actor.aiLod?.lod || "none";
      acc[lod] = (acc[lod] || 0) + 1;
      if (actor.aiLod?.skipped) acc.skipped = (acc.skipped || 0) + 1;
      if (Number(actor.aiLod?.updateRateMs || 0) > 100) acc.throttled = (acc.throttled || 0) + 1;
      return acc;
    }, {});
    return {
      infantry: infantry.length,
      vehicles: vehicles.length,
      drones: drones.length,
      totalActors: actors.length,
      commandedSquads: (game.squads || []).filter((squad) => Boolean(squad.manualOrder || (squad.commandState && squad.commandState !== "idle"))).length,
      waitingVehicles: waitingVehicles.length,
      waitingVehicleSamples: waitingVehicles,
      lodCounts
    };
  };

  const runProbe = (game) => new Promise((done) => {
    const frameTimes = [];
    const rafGaps = [];
    const componentValues = Object.fromEntries(fields.map((field) => [field, []]));
    const spikes = [];
    const stillReports = [];
    const motion = new Map();
    let maxStillFramesWhileMoving = 0;
    let lastWall = performance.now();
    let frames = 0;

    const updateMotion = (frameNo) => {
      const actors = [
        ...(game.infantry || []),
        ...(game.tanks || []),
        ...(game.humvees || []),
        ...(game.drones || [])
      ].filter((actor) => actor && actor.alive !== false && actor.destroyed !== true);
      const seen = new Set();
      const reports = [];
      actors.forEach((actor, index) => {
        const id = actorId(actor, index);
        seen.add(id);
        const x = Number(actor.x || 0);
        const y = Number(actor.y || 0);
        const speed = Math.abs(Number(actor.speed || actor.velocity || 0));
        const movingIntent = speed > 1.2 || Boolean(actor.ai?.moveTarget || actor.ai?.path?.length || actor.ai?.target || actor.target || actor.manualOrder);
        const previous = motion.get(id) || {
          x,
          y,
          kind: actor.vehicleType || actor.kind || (actor.isDrone ? "drone" : actor.isInfantry ? "infantry" : actor.constructor?.name || "actor"),
          stillFrames: 0,
          hasMoved: false,
          movingSamples: 0,
          movedDistance: 0,
          lastReportFrame: -999
        };
        const delta = Math.hypot(x - previous.x, y - previous.y);
        if (movingIntent) {
          previous.movingSamples += 1;
          if (delta <= 0.08) {
            if (previous.hasMoved || previous.movingSamples > 12) previous.stillFrames += 1;
          } else {
            previous.hasMoved = true;
            previous.movedDistance += delta;
            previous.stillFrames = 0;
          }
          maxStillFramesWhileMoving = Math.max(maxStillFramesWhileMoving, previous.stillFrames);
          if (previous.stillFrames >= 30 && frameNo - previous.lastReportFrame >= 30) {
            previous.lastReportFrame = frameNo;
            reports.push({
              frameNo,
              id,
              kind: previous.kind,
              stillFrames: previous.stillFrames,
              movedDistance: round(previous.movedDistance, 2),
              speed: round(speed, 2),
              lod: actor.aiLod?.lod || "",
              skipped: Boolean(actor.aiLod?.skipped),
              aiState: String(actor.ai?.debug?.state || actor.ai?.state || actor.ai?.mode || ""),
              target: actor.ai?.target?.callSign || actor.ai?.target?.id || actor.target?.callSign || actor.target?.id || ""
            });
          }
        } else {
          previous.stillFrames = 0;
        }
        previous.x = x;
        previous.y = y;
        motion.set(id, previous);
      });
      for (const id of [...motion.keys()]) {
        if (!seen.has(id)) motion.delete(id);
      }
      return reports;
    };

    const captureFrame = () => {
      const now = performance.now();
      const rafGap = now - lastWall;
      lastWall = now;
      const perf = game.perfMonitor || {};
      const history = perf.frameHistory || [];
      const frame = { ...(perf.frame || {}) };
      const frameMs = Number(history[history.length - 1] ?? frame.frame ?? 0) || 0;
      const state = lightState(game);
      const still = updateMotion(frames);
      for (const item of still) {
        if (stillReports.length < 60) stillReports.push(item);
      }

      frameTimes.push(frameMs);
      rafGaps.push(rafGap);
      for (const field of fields) {
        componentValues[field].push(Number(frame[field] || 0));
      }

      if (frameMs >= spikeFrameMs || rafGap >= longFrameMs) {
        const breakdown = Object.fromEntries(fields.map((field) => [field, round(frame[field] || 0, 3)]));
        const top = Object.entries(breakdown)
          .filter(([, value]) => value > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([name, value]) => ({ name, value }));
        spikes.push({
          frameNo: frames,
          atMs: round(now, 1),
          frameMs: round(frameMs, 3),
          rafGapMs: round(rafGap, 3),
          top,
          state
        });
      }

      frames += 1;
      if (frames >= sampleFrames) {
        const componentStats = {};
        for (const field of fields) {
          componentStats[field] = {
            avg: round(avgOf(componentValues[field]), 3),
            max: round(maxOf(componentValues[field]), 3)
          };
        }
        const snapshot = game.aiScaleReadiness?.snapshot?.({ includeNetwork: true }) || null;
        const evaluation = game.aiScaleReadiness?.evaluate?.(profileId, { includeNetwork: true }) || null;
        done({
          frameStats: {
            samples: frameTimes.length,
            avg: round(avgOf(frameTimes), 3),
            p95: round(percentile(frameTimes, 0.95), 3),
            p99: round(percentile(frameTimes, 0.99), 3),
            max: round(maxOf(frameTimes), 3),
            long50: frameTimes.filter((value) => value > 50).length
          },
          rafStats: {
            samples: rafGaps.length,
            avg: round(avgOf(rafGaps), 3),
            p95: round(percentile(rafGaps, 0.95), 3),
            p99: round(percentile(rafGaps, 0.99), 3),
            max: round(maxOf(rafGaps), 3),
            long50: rafGaps.filter((value) => value > 50).length
          },
          componentStats,
          spikes: spikes.sort((a, b) => Math.max(b.frameMs, b.rafGapMs) - Math.max(a.frameMs, a.rafGapMs)).slice(0, 20),
          stillReports: stillReports.slice(0, 30),
          maxStillFramesWhileMoving,
          finalState: lightState(game),
          snapshot,
          evaluation
        });
        return;
      }
      requestAnimationFrame(captureFrame);
    };

    requestAnimationFrame(captureFrame);
  });

  waitForGame().then((game) => {
    const profiles = game.aiScaleReadiness?.profiles?.() || [];
    const profile = profiles.find((item) => item.id === profileId) || null;
    const methodProbeInstall = installInfantryMethodProbe();
    const navGraphProbeInstall = installNavGraphProbe();
    const apply = game.aiScaleReadiness?.applyProfile?.(profileId) || { accepted: false, reason: "missing-scale-readiness" };
    document.querySelector("#entryEnterButton")?.click?.();
    setTimeout(() => {
      document.querySelector("#deploymentStart")?.click?.();
      const startedAt = Date.now();
      const waitForLive = () => {
        if (!game.matchStarted && Date.now() - startedAt <= 10000) {
          setTimeout(waitForLive, 100);
          return;
        }
        waitFrames(warmupFrames).then(() => runProbe(game)).then((probe) => {
          resolve({
            profileId,
            label: profile?.label || profileId,
            eventOnly: Boolean(profile?.eventOnly),
            apply,
            matchStarted: Boolean(game.matchStarted),
            matchConfig: {
              aiDensityPreset: game.matchConfig?.aiDensityPreset || "",
              blueInfantry: game.matchConfig?.blueInfantry || 0,
              redInfantry: game.matchConfig?.redInfantry || 0,
              blueAiTanks: game.matchConfig?.blueAiTanks || 0,
              redTanks: game.matchConfig?.redTanks || 0
            },
            world: {
              id: game.world?.id || game.world?.mapId || "map01",
              mapVersion: String(game.world?.mapVersion || game.world?.version || ""),
              width: game.world?.width || 0,
              height: game.world?.height || 0
            },
            methodProbeInstall,
            methodProbe: methodProbeSnapshot(),
            navGraphProbeInstall,
            navGraphProbe: navGraphProbeSnapshot(),
            probe
          });
        }).catch(reject);
      };
      waitForLive();
    }, 140);
  }).catch(reject);
})
`;
}

async function runProfile(profileId, index, repeat) {
  if (!chromePath) throw new Error("Chrome or Edge executable was not found.");
  const cdpPort = cdpBasePort + index;
  const userDataDir = path.join(root, `.tmp-chrome-scale-spike-${profileId}-${repeat}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  const chrome = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--no-first-run",
    "--disable-extensions",
    `${appUrl}?scaleProfile=${encodeURIComponent(profileId)}`
  ], { stdio: "ignore", windowsHide: true });

  let client = null;
  try {
    const page = await waitForCdpPage(cdpPort);
    client = await connectCdp(page.webSocketDebuggerUrl);
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await sleep(700);
    return {
      repeat,
      ...(await evaluateWithRetry(client, scenarioFor(profileId), 45000, 3))
    };
  } finally {
    if (client) client.close();
    chrome.kill();
    await sleep(250);
    const resolved = path.resolve(userDataDir);
    if (resolved.startsWith(root) && fs.existsSync(resolved)) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
}

function bytesLabel(bytes) {
  if (!Number.isFinite(bytes)) return "0";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function componentLeaders(componentStats = {}) {
  return Object.entries(componentStats)
    .map(([name, value]) => ({ name, max: Number(value?.max || 0), avg: Number(value?.avg || 0) }))
    .filter((item) => item.max > 0)
    .sort((a, b) => b.max - a.max)
    .slice(0, 5);
}

function aggregateRuns(results) {
  return profileIds.map((profileId) => {
    const runs = results.filter((item) => item.profileId === profileId);
    const numbers = (selector) => runs.map(selector).filter((value) => Number.isFinite(value));
    const frameMax = numbers((item) => item.probe?.frameStats?.max);
    const frameP99 = numbers((item) => item.probe?.frameStats?.p99);
    const frameLong = numbers((item) => item.probe?.frameStats?.long50);
    const rafMax = numbers((item) => item.probe?.rafStats?.max);
    const rafLong = numbers((item) => item.probe?.rafStats?.long50);
    const aiMax = numbers((item) => item.probe?.componentStats?.["ai.infantry"]?.max);
    const vehiclesMax = numbers((item) => item.probe?.componentStats?.vehicles?.max);
    const renderMax = numbers((item) => item.probe?.componentStats?.render?.max);
    const tacticalMax = numbers((item) => item.probe?.componentStats?.["ai.tacticalMap"]?.max);
    const still = numbers((item) => item.probe?.maxStillFramesWhileMoving);
    const snapshotBytes = numbers((item) => item.probe?.snapshot?.performance?.networkSnapshotBytes);
    return {
      profileId,
      runs: runs.length,
      maxFrameMs: frameMax.length ? Math.max(...frameMax) : 0,
      maxFrameP99Ms: frameP99.length ? Math.max(...frameP99) : 0,
      maxFrameLong50: frameLong.length ? Math.max(...frameLong) : 0,
      maxRafGapMs: rafMax.length ? Math.max(...rafMax) : 0,
      maxRafLong50: rafLong.length ? Math.max(...rafLong) : 0,
      maxInfantryAiMs: aiMax.length ? Math.max(...aiMax) : 0,
      maxVehicleMs: vehiclesMax.length ? Math.max(...vehiclesMax) : 0,
      maxRenderMs: renderMax.length ? Math.max(...renderMax) : 0,
      maxTacticalMapMs: tacticalMax.length ? Math.max(...tacticalMax) : 0,
      maxStillFramesWhileMoving: still.length ? Math.max(...still) : 0,
      maxNetworkSnapshotBytes: snapshotBytes.length ? Math.max(...snapshotBytes) : 0,
      spikeCount: runs.reduce((sum, item) => sum + (item.probe?.spikes?.length || 0), 0),
      stillReportCount: runs.reduce((sum, item) => sum + (item.probe?.stillReports?.length || 0), 0)
    };
  });
}

function markdownReport(report) {
  const lines = [
    "# Scale Spike Probe Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Result: ${report.status || (report.ok ? "PASS" : "WATCH")}`,
    "",
    "This is a measurement-only run. It does not change gameplay logic.",
    "",
    "## Fixed Scenario",
    "",
    `- URL: \`${report.url}\``,
    `- Build: branch \`${report.build.branch || ""}\`, commit \`${report.build.commit || ""}\``,
    "- Map: `map01`, mapVersion `2026-05-22`, with `map01-custom-layout.js` loaded by `index.html`",
    `- Profiles: ${report.profileIds.map((id) => `\`${id}\``).join(", ")}`,
    `- Repeats: \`${report.repeatCount}\``,
    `- Warmup frames: \`${report.warmupFrames}\``,
    `- Sample frames per run: \`${report.sampleFrames}\``,
    `- Spike thresholds: frame >= \`${report.thresholds.spikeFrameMs}ms\`, RAF gap >= \`${report.thresholds.longFrameMs}ms\``,
    "",
    "## Aggregate",
    "",
    "| Profile | Runs | Max frame | Max p99 | Long frame count | Max RAF gap | RAF long count | Max infantry AI | Max vehicle | Max render | Max tactical map | Max still-moving frames | Max snapshot |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const item of report.aggregate) {
    lines.push(`| \`${item.profileId}\` | ${item.runs} | ${item.maxFrameMs.toFixed(1)} | ${item.maxFrameP99Ms.toFixed(1)} | ${item.maxFrameLong50} | ${item.maxRafGapMs.toFixed(1)} | ${item.maxRafLong50} | ${item.maxInfantryAiMs.toFixed(1)} | ${item.maxVehicleMs.toFixed(1)} | ${item.maxRenderMs.toFixed(1)} | ${item.maxTacticalMapMs.toFixed(3)} | ${item.maxStillFramesWhileMoving} | ${bytesLabel(item.maxNetworkSnapshotBytes)} |`);
  }

  lines.push("", "## Top Spikes", "");
  const spikes = report.results
    .flatMap((run) => (run.probe?.spikes || []).map((spike) => ({ run, spike })))
    .sort((a, b) => Math.max(b.spike.frameMs, b.spike.rafGapMs) - Math.max(a.spike.frameMs, a.spike.rafGapMs))
    .slice(0, 10);
  if (!spikes.length) {
    lines.push("- No frames crossed the spike thresholds.");
  } else {
    lines.push("| Profile | Repeat | Frame | Frame ms | RAF gap | Top components | Waiting vehicles |");
    lines.push("| --- | ---: | ---: | ---: | ---: | --- | ---: |");
    for (const { run, spike } of spikes) {
      const top = (spike.top || []).slice(0, 4).map((item) => `${item.name} ${item.value}`).join(", ");
      lines.push(`| \`${run.profileId}\` | ${run.repeat} | ${spike.frameNo} | ${Number(spike.frameMs || 0).toFixed(1)} | ${Number(spike.rafGapMs || 0).toFixed(1)} | ${top || "-"} | ${spike.state?.waitingVehicles || 0} |`);
    }
  }

  lines.push("", "## Movement Pause Samples", "");
  const pauses = report.results
    .flatMap((run) => (run.probe?.stillReports || []).map((pause) => ({ run, pause })))
    .sort((a, b) => (b.pause.stillFrames || 0) - (a.pause.stillFrames || 0))
    .slice(0, 12);
  if (!pauses.length) {
    lines.push("- No moving actor crossed the still-frame reporting threshold.");
  } else {
    lines.push("| Profile | Repeat | Actor | Kind | Still frames | LOD | Skipped | State | Target |");
    lines.push("| --- | ---: | --- | --- | ---: | --- | --- | --- | --- |");
    for (const { run, pause } of pauses) {
      lines.push(`| \`${run.profileId}\` | ${run.repeat} | ${pause.id || ""} | ${pause.kind || ""} | ${pause.stillFrames || 0} | ${pause.lod || ""} | ${pause.skipped ? "yes" : "no"} | ${pause.aiState || ""} | ${pause.target || ""} |`);
    }
  }

  lines.push("", "## Component Leaders", "");
  for (const run of report.results) {
    const leaders = componentLeaders(run.probe?.componentStats)
      .map((item) => `${item.name} max ${item.max.toFixed(1)}ms avg ${item.avg.toFixed(1)}ms`)
      .join("; ");
    lines.push(`- \`${run.profileId}\` repeat ${run.repeat}: ${leaders || "no component samples"}`);
  }

  lines.push("", "## Infantry AI Method Hotspots", "");
  const methodRows = report.results.flatMap((run) => (run.methodProbe?.stats || [])
    .slice(0, 8)
    .map((item) => ({ run, item })));
  if (!methodRows.length) {
    lines.push("- Method probe did not produce samples.");
  } else {
    lines.push("| Profile | Repeat | Method | Count | Total ms | Avg ms | Max ms | Max unit | Slow samples |");
    lines.push("| --- | ---: | --- | ---: | ---: | ---: | ---: | --- | ---: |");
    for (const { run, item } of methodRows) {
      lines.push(`| \`${run.profileId}\` | ${run.repeat} | \`${item.name}\` | ${item.count} | ${Number(item.total || 0).toFixed(1)} | ${Number(item.avg || 0).toFixed(4)} | ${Number(item.max || 0).toFixed(1)} | ${item.maxUnit || ""} | ${(item.slow || []).length} |`);
    }
  }

  lines.push("", "## NavGraph Hotspots", "");
  const navRows = report.results.flatMap((run) => (run.navGraphProbe?.stats || [])
    .slice(0, 8)
    .map((item) => ({ run, item })));
  if (!navRows.length) {
    lines.push("- NavGraph probe did not produce samples.");
  } else {
    lines.push("| Profile | Repeat | Method | Count | Total ms | Avg ms | Max ms | Slow samples |");
    lines.push("| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |");
    for (const { run, item } of navRows) {
      lines.push(`| \`${run.profileId}\` | ${run.repeat} | \`${item.name}\` | ${item.count} | ${Number(item.total || 0).toFixed(1)} | ${Number(item.avg || 0).toFixed(4)} | ${Number(item.max || 0).toFixed(1)} | ${(item.slow || []).length} |`);
    }
  }

  lines.push("", "## NavGraph Cache Counters", "");
  lines.push("| Profile | Repeat | Path hit/miss | Nearest hit/miss | Segment hit/miss | Cache clears |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const run of report.results) {
    const nav = run.navGraphProbe || {};
    lines.push(`| \`${run.profileId}\` | ${run.repeat} | ${nav.pathCacheHit || 0}/${nav.pathCacheMiss || 0} | ${nav.nearestCacheHit || 0}/${nav.nearestCacheMiss || 0} | ${nav.segmentCacheHit || 0}/${nav.segmentCacheMiss || 0} | ${nav.cacheClears || 0} |`);
  }

  lines.push(
    "",
    "## Five-Question Gate",
    "",
    "1. What situation was measured? Fixed `map01` live match through `index.html`, fixed profile list, fixed repeats, fixed frame counts.",
    "2. Were at least two scales measured? Yes, `ai-8v8` and `ai-25v25`.",
    "3. Are p99/worst frames included? Yes, frame and RAF p95/p99/max/long50 are recorded.",
    "4. Are AI/render/tactical-map/observer costs separated? Yes, per-frame component stats include AI, vehicles, render, tactical-map, observer, and combat sections.",
    "5. Was it saved to a file? Yes, `result.json` and this report are saved in this report directory.",
    "",
    "## Interpretation",
    "",
    report.interpretation,
    ""
  );

  return `${lines.join("\n")}\n`;
}

function interpret(aggregate) {
  const heavy = aggregate.find((item) => item.profileId === "ai-25v25") || aggregate[aggregate.length - 1];
  if (!heavy) return "No aggregate data was produced.";
  if (heavy.maxFrameLong50 > 0 || heavy.maxRafLong50 > 0) {
    return "The 25v25 probe reproduced frame spikes. Use the top-spike component rows before changing gameplay logic; fix only the component that dominates the spikes.";
  }
  if (heavy.maxStillFramesWhileMoving >= 30) {
    return "The 25v25 probe did not reproduce >50ms frame spikes, but it did reproduce moving actors pausing. The next step is an AI behavior probe for those actors, not a broad optimization pass.";
  }
  return "The spike probe did not reproduce the watch items. Keep this report as the baseline and only optimize after a reproducible failure appears.";
}

function statusFor(aggregate) {
  return aggregate.some((item) => item.maxFrameLong50 > 0 || item.maxRafLong50 > 0 || item.maxStillFramesWhileMoving >= 30)
    ? "WATCH"
    : "PASS";
}

async function main() {
  if (!chromePath) throw new Error("Chrome or Edge executable was not found.");
  fs.mkdirSync(reportDir, { recursive: true });
  const server = spawn(process.execPath, ["tools/static-server.cjs", String(appPort)], {
    cwd: root,
    stdio: "ignore",
    env: { ...process.env, PORT: String(appPort) },
    windowsHide: true
  });

  try {
    const build = await waitForApp();
    const results = [];
    let runIndex = 0;
    for (let repeat = 1; repeat <= repeatCount; repeat += 1) {
      for (const profileId of profileIds) {
        results.push(await runProfile(profileId, runIndex, repeat));
        runIndex += 1;
      }
    }
    const aggregate = aggregateRuns(results);
    const report = {
      ok: true,
      status: statusFor(aggregate),
      generatedAt: new Date().toISOString(),
      url: appUrl,
      environment: {
        platform: process.platform,
        arch: process.arch,
        cpus: os.cpus()?.length || 0,
        totalMemoryBytes: os.totalmem(),
        freeMemoryBytes: os.freemem(),
        node: process.version
      },
      build: {
        commit: build.commit || "",
        branch: build.branch || ""
      },
      profileIds,
      repeatCount,
      warmupFrames,
      sampleFrames,
      thresholds: { spikeFrameMs, longFrameMs },
      aggregate,
      interpretation: interpret(aggregate),
      results
    };
    report.reportPath = path.join(reportDir, "report.md");
    report.resultPath = path.join(reportDir, "result.json");
    fs.writeFileSync(report.resultPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(report.reportPath, markdownReport(report), "utf8");
      console.log(JSON.stringify({
        ok: true,
      status: report.status,
      reportPath: path.relative(root, report.reportPath),
      resultPath: path.relative(root, report.resultPath),
      aggregate,
      interpretation: report.interpretation
    }, null, 2));
  } finally {
    server.kill();
    await sleep(200);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
