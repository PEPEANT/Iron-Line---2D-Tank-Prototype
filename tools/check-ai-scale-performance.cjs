"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_SCALE_PERF_PORT || 4203);
const cdpBasePort = Number(process.env.IRONLINE_SCALE_PERF_CDP_PORT || 9240);
const appUrl = `http://127.0.0.1:${appPort}/index.html`;
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profileIds = (process.env.IRONLINE_SCALE_PROFILES || "ai-8v8,ai-15v15,ai-25v25")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const repeatCount = Math.max(1, Math.min(8, Number(process.env.IRONLINE_SCALE_REPEATS || 1)));

function requestJson(port, pathname, timeout = 1000) {
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
      const build = await requestJson(appPort, "/api/build", 1200);
      if (build?.ok) return build;
    } catch (_error) {
      await new Promise((resolve) => setTimeout(resolve, 220));
    }
  }
  throw new Error("Static server did not expose /api/build in time.");
}

async function waitForCdpPage(cdpPort) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    try {
      const list = await requestJson(cdpPort, "/json/list", 1200);
      const page = list.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch (_error) {
      await new Promise((resolve) => setTimeout(resolve, 220));
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

async function evaluate(client, expression, timeout = 10000) {
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

async function evaluateWithRetry(client, expression, timeout = 10000, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await evaluate(client, expression, timeout);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || "");
      if (!message.includes("Execution context was destroyed") && !message.includes("Cannot find context")) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }
  }
  throw lastError;
}

function scenarioFor(profileId) {
  return `
new Promise((resolve, reject) => {
  const profileId = ${JSON.stringify(profileId)};
  const waitForGame = () => new Promise((done, fail) => {
    const startedAt = Date.now();
    const tick = () => {
      if (window.IronLine?.game) return done(window.IronLine.game);
      if (Date.now() - startedAt > 8000) return fail(new Error("game missing"));
      setTimeout(tick, 100);
    };
    tick();
  });

  const measureDetailedMovementContinuity = (game, frameCount) => new Promise((done) => {
    const tracks = new Map();
    const result = {
      frames: 0,
      trackedActors: 0,
      movingActors: 0,
      freezeJumpEvents: 0,
      maxStillFramesWhileMoving: 0,
      maxJumpPx: 0
    };
    const actors = () => [
      ...(game.infantry || []),
      ...(game.tanks || []),
      ...(game.humvees || [])
    ].filter((actor) => actor && actor.alive !== false && actor.destroyed !== true && actor.aiLod?.lod === "detailed");
    const actorId = (actor, index) => String(actor.callSign || actor.id || (actor.constructor?.name || "actor") + ":" + index);
    const sample = () => {
      const seen = new Set();
      actors().forEach((actor, index) => {
        const id = actorId(actor, index);
        seen.add(id);
        const x = Number(actor.x || 0);
        const y = Number(actor.y || 0);
        const speed = Math.abs(Number(actor.speed || 0));
        const movingIntent = speed > 1.2 || Boolean(actor.ai?.moveTarget || actor.ai?.path?.length || actor.ai?.target || actor.target);
        const track = tracks.get(id) || {
          x,
          y,
          stillFrames: 0,
          movedDistance: 0,
          hasMoved: false,
          movingSamples: 0
        };
        const delta = Math.hypot(x - track.x, y - track.y);
        if (movingIntent) {
          track.movingSamples += 1;
          if (delta <= 0.08) {
            if (track.hasMoved) track.stillFrames += 1;
          } else {
            if (track.hasMoved && track.stillFrames >= 5 && delta >= 4) {
              result.freezeJumpEvents += 1;
              result.maxJumpPx = Math.max(result.maxJumpPx, delta);
            }
            track.hasMoved = true;
            track.movedDistance += delta;
            track.stillFrames = 0;
          }
          result.maxStillFramesWhileMoving = Math.max(result.maxStillFramesWhileMoving, track.stillFrames);
        } else {
          track.stillFrames = 0;
        }
        track.x = x;
        track.y = y;
        tracks.set(id, track);
      });
      for (const id of tracks.keys()) {
        if (!seen.has(id)) tracks.delete(id);
      }
      result.frames += 1;
      if (result.frames >= frameCount) {
        const values = [...tracks.values()];
        result.trackedActors = values.length;
        result.movingActors = values.filter((track) => track.movingSamples >= 12 && track.movedDistance >= 6).length;
        done(result);
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  waitForGame().then((game) => {
    const profiles = game.aiScaleReadiness?.profiles?.() || [];
    const profile = profiles.find((item) => item.id === profileId) || null;
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

        measureDetailedMovementContinuity(game, 180).then((movementContinuity) => {
          const snapshot = game.aiScaleReadiness?.snapshot?.({ includeNetwork: true }) || null;
          const evaluation = game.aiScaleReadiness?.evaluate?.(profileId, { includeNetwork: true }) || null;
          const observer = game.observerBridge?.createSnapshot?.();
          const observatory = game.aiObservatory?.collect?.() || game.aiObservatory?.latest?.();
          const lod = snapshot?.lod || {};
          const lodTotal = ["detailed", "normal", "reduced", "idle"].reduce((sum, key) => sum + (lod[key] || 0), 0);
          const checks = {
            matchStarted: Boolean(game.matchStarted),
            profileApplied: Boolean(apply.accepted && game.matchConfig?.aiDensityPreset === profileId),
            infantryCount: snapshot?.counts?.infantry || 0,
            vehicleCount: snapshot?.counts?.vehicles || 0,
            lodVisible: lodTotal > 0,
            lodRuntimeVisible: Number(snapshot?.stateSummary?.lodDetailedActors || 0) + Number(snapshot?.stateSummary?.lodThrottledActors || 0) > 0,
            observerVisible: Boolean(observer?.world?.aiScaleReadiness?.counts),
            observatoryVisible: Boolean(observatory?.aiScaleReadiness?.counts),
            snapshotPolicy: snapshot?.snapshotPolicy?.sendFullUnitDetailEveryTick === false,
            detailedMovementContinuous: Number(movementContinuity?.freezeJumpEvents || 0) === 0,
            evaluationPass: Boolean(evaluation?.pass)
          };
          const pass = Object.values(checks).every(Boolean);

          resolve({
            profileId,
            label: profile?.label || profileId,
            eventOnly: Boolean(profile?.eventOnly),
            apply,
            matchStarted: game.matchStarted,
            matchConfig: {
              aiDensityPreset: game.matchConfig?.aiDensityPreset || "",
              blueInfantry: game.matchConfig?.blueInfantry || 0,
              redInfantry: game.matchConfig?.redInfantry || 0,
              blueAiTanks: game.matchConfig?.blueAiTanks || 0,
              redTanks: game.matchConfig?.redTanks || 0
            },
            snapshot,
            evaluation,
            observerScale: observer?.world?.aiScaleReadiness || null,
            observatoryScale: observatory?.aiScaleReadiness || null,
            movementContinuity,
            checks,
            pass
          });
        }).catch(reject);
      };
      waitForLive();
    }, 140);
  }).catch(reject);
})
`;
}

async function runProfile(profileId, index, repeat = 1) {
  const cdpPort = cdpBasePort + index;
  const userDataDir = path.join(root, `.tmp-chrome-ai-scale-perf-${profileId}-${repeat}`);
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
  ], { stdio: "ignore" });

  let client = null;
  try {
    const page = await waitForCdpPage(cdpPort);
    client = await connectCdp(page.webSocketDebuggerUrl);
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await new Promise((resolve) => setTimeout(resolve, 700));
    const result = await evaluateWithRetry(client, scenarioFor(profileId), 22000, 3);
    return { repeat, ...result };
  } finally {
    if (client) client.close();
    chrome.kill();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const resolved = path.resolve(userDataDir);
    if (resolved.startsWith(root) && fs.existsSync(resolved)) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
}

async function main() {
  const server = spawn(process.execPath, ["tools/static-server.cjs", String(appPort)], {
    cwd: root,
    stdio: "ignore",
    env: { ...process.env, PORT: String(appPort) }
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
    const allPass = results.every((item) => item.pass);
    const summary = results.map((item) => {
      const perf = item.snapshot?.performance || {};
      return {
        profileId: item.profileId,
        repeat: item.repeat,
        pass: item.pass,
        counts: item.snapshot?.counts || {},
        performance: {
          fps: perf.fps,
          frameMs: perf.frameMs,
          frameP95Ms: perf.frameP95Ms,
          frameP99Ms: perf.frameP99Ms,
          frameMaxMs: perf.frameMaxMs,
          longFrames50: perf.longFrames50,
          frameSamples: perf.frameSamples,
          lastLoopError: perf.lastLoopError,
          updateMs: perf.updateMs,
          aiMs: perf.aiMs,
          pathfindingAndMovementMs: perf.pathfindingAndMovementMs,
          renderMs: perf.renderMs,
          tacticalMapMs: perf.tacticalMapMs,
          vehiclesMs: perf.vehiclesMs,
          dronesMs: perf.dronesMs,
          networkSnapshotBytes: perf.networkSnapshotBytes,
          memory: perf.memory
        },
        lod: {
          detailed: item.snapshot?.lod?.detailed || 0,
          normal: item.snapshot?.lod?.normal || 0,
          reduced: item.snapshot?.lod?.reduced || 0,
          idle: item.snapshot?.lod?.idle || 0
        },
        movementContinuity: item.movementContinuity || {},
        stateSummary: item.snapshot?.stateSummary || {},
        evaluation: item.evaluation?.checks || []
      };
    });
    const aggregate = profileIds.map((profileId) => {
      const runs = summary.filter((item) => item.profileId === profileId);
      const numbers = (selector) => runs
        .map(selector)
        .filter((value) => Number.isFinite(value));
      const fps = numbers((item) => item.performance.fps);
      const frame = numbers((item) => item.performance.frameMs);
      const frameP99 = numbers((item) => item.performance.frameP99Ms);
      const frameMax = numbers((item) => item.performance.frameMaxMs);
      const longFrames = numbers((item) => item.performance.longFrames50);
      const ai = numbers((item) => item.performance.aiMs);
      const pathMove = numbers((item) => item.performance.pathfindingAndMovementMs);
      const snapshotBytes = numbers((item) => item.performance.networkSnapshotBytes);
      const movementFreezeJumps = numbers((item) => item.movementContinuity.freezeJumpEvents);
      const movementStillFrames = numbers((item) => item.movementContinuity.maxStillFramesWhileMoving);
      const movementActors = numbers((item) => item.movementContinuity.movingActors);
      return {
        profileId,
        runs: runs.length,
        passRuns: runs.filter((item) => item.pass).length,
        failRuns: runs.filter((item) => !item.pass).length,
        minFps: fps.length ? Math.min(...fps) : null,
        maxFrameMs: frame.length ? Math.max(...frame) : null,
        maxFrameP99Ms: frameP99.length ? Math.max(...frameP99) : null,
        maxWorstFrameMs: frameMax.length ? Math.max(...frameMax) : null,
        maxLongFrames50: longFrames.length ? Math.max(...longFrames) : null,
        maxAiMs: ai.length ? Math.max(...ai) : null,
        maxPathfindingAndMovementMs: pathMove.length ? Math.max(...pathMove) : null,
        maxNetworkSnapshotBytes: snapshotBytes.length ? Math.max(...snapshotBytes) : null,
        maxMovementFreezeJumps: movementFreezeJumps.length ? Math.max(...movementFreezeJumps) : null,
        maxMovementStillFrames: movementStillFrames.length ? Math.max(...movementStillFrames) : null,
        maxMovingContinuityActors: movementActors.length ? Math.max(...movementActors) : null,
        worstStateSummary: runs.reduce((worst, item) => {
          const state = item.stateSummary || {};
          return {
            stuckInfantry: Math.max(worst.stuckInfantry, state.stuckInfantry || 0),
            stuckVehicles: Math.max(worst.stuckVehicles, state.stuckVehicles || 0),
            trafficHoldingVehicles: Math.max(worst.trafficHoldingVehicles, state.trafficHoldingVehicles || 0),
            waitOrBlockedVehicles: Math.max(worst.waitOrBlockedVehicles, state.waitOrBlockedVehicles || 0),
            lodThrottledActors: Math.max(worst.lodThrottledActors, state.lodThrottledActors || 0),
            lodSkippedActors: Math.max(worst.lodSkippedActors, state.lodSkippedActors || 0),
            lodDetailedActors: Math.max(worst.lodDetailedActors, state.lodDetailedActors || 0),
            lodReducedActors: Math.max(worst.lodReducedActors, state.lodReducedActors || 0)
          };
        }, {
          stuckInfantry: 0,
          stuckVehicles: 0,
          trafficHoldingVehicles: 0,
          waitOrBlockedVehicles: 0,
          lodThrottledActors: 0,
          lodSkippedActors: 0,
          lodDetailedActors: 0,
          lodReducedActors: 0
        })
      };
    });
    const report = {
      ok: true,
      allPass,
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
      repeatCount,
      aggregate,
      summary,
      profiles: results
    };
    const output = process.env.IRONLINE_SCALE_PERF_COMPACT === "1"
      ? { ok: true, allPass, url: appUrl, environment: report.environment, build: report.build, repeatCount, aggregate, summary }
      : report;
    console.log(JSON.stringify(output, null, 2));
    if (!allPass && process.env.IRONLINE_SCALE_PERF_STRICT === "1") process.exitCode = 1;
  } finally {
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
