"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_BED_PORT || 4212);
const cdpPort = Number(process.env.IRONLINE_BED_CDP_PORT || 9252);
const durationMs = Number(process.env.IRONLINE_BED_DURATION_MS || 120000);
const intervalMs = Number(process.env.IRONLINE_BED_INTERVAL_MS || 250);
const appUrl = `http://127.0.0.1:${appPort}/index.html`;
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const userDataDir = path.join(root, ".tmp-chrome-bed-combat");

function requestJson(port, pathname, timeout = 1200) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port, path: pathname, timeout }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        try { resolve(JSON.parse(raw)); } catch (error) { reject(error); }
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

async function waitForCdpPage() {
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

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
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

async function evaluate(client, expression, timeout = 180000) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime exception");
  }
  return result.result.value;
}

function pageScenario(ms, sampleMs) {
  return String.raw`
new Promise((resolve, reject) => {
  const DURATION_MS = ${ms};
  const INTERVAL_MS = ${sampleMs};
  const RESPONSE_WINDOW_SECONDS = 10;
  const CONTROLLED_BLAST_START_SECONDS = 12;
  const CONTROLLED_BLAST_INTERVAL_SECONDS = 12;
  const CONTROLLED_BLAST_MAX = 8;
  const MAX_WINDOWS = 4000;

  const waitForGame = () => new Promise((done, fail) => {
    const startedAt = Date.now();
    const tick = () => {
      const IronLine = window.IronLine;
      if (IronLine?.game && IronLine?.combat?.damageRadius && IronLine?.InfantryUnit && IronLine?.InfantryAI) return done(IronLine.game);
      if (Date.now() - startedAt > 9000) return fail(new Error("game missing"));
      setTimeout(tick, 100);
    };
    tick();
  });

  const idFor = (item) => item?.callSign || item?.id || "";
  const round = (value, digits = 2) => {
    const scale = 10 ** digits;
    return Math.round((Number(value) || 0) * scale) / scale;
  };
  const dist = (a, b, x, y) => Math.hypot((a || 0) - (x || 0), (b || 0) - (y || 0));

  function runSampling(game) {
    return new Promise((done) => {
      const startWall = Date.now();
      const elapsed = () => round((Date.now() - startWall) / 1000, 2);
      const trace = {
        blastEvents: [],
        unitWindows: [],
        samples: [],
        controlledBlastEvents: 0
      };
      const active = [];
      let blastSerial = 0;
      let controlledBlastCount = 0;
      let lastControlledBlastAt = -Infinity;

      const flag = (windowItem, key, at) => {
        if (!windowItem.flags[key]) windowItem.flags[key] = round(at - windowItem.startTime, 2);
      };

      const compact = (windowItem, at) => ({
        blastId: windowItem.blastId,
        unitId: windowItem.unitId,
        team: windowItem.team,
        classId: windowItem.classId,
        weaponId: windowItem.weaponId,
        ammoId: windowItem.ammoId,
        distance: windowItem.distance,
        startTime: round(windowItem.startTime, 2),
        endTime: round(at, 2),
        initialHp: windowItem.initialHp,
        finalHp: round(Number(windowItem.unit?.hp) || 0, 1),
        initialSuppression: windowItem.initialSuppression,
        finalSuppression: round(Number(windowItem.unit?.suppression) || 0, 1),
        maxMoveDistance: round(windowItem.maxMoveDistance, 1),
        states: windowItem.states,
        flags: windowItem.flags
      });

      const closeWindow = (windowItem, at) => {
        const tactical = windowItem.flags["blast:spread"] ||
          windowItem.flags["blast:cover"] ||
          windowItem.flags["blast:fallback"] ||
          windowItem.flags["blast:rpg-response"];
        const stillAlive = Boolean(windowItem.unit?.alive && Number(windowItem.unit?.hp) > 0);
        if (stillAlive && windowItem.proneSeen && !tactical) {
          flag(windowItem, "blast:prone-only", at);
        }
        if (!Object.keys(windowItem.flags).length && windowItem.maxMoveDistance < 24) {
          flag(windowItem, "blast:no-response", at);
        }
        trace.unitWindows.push(compact(windowItem, at));
      };

      function updateWindow(windowItem, at) {
        const unit = windowItem.unit;
        if (!unit) return;
        const ai = unit.ai || {};
        const state = String(ai.state || "");
        const mode = String(unit.squad?.tacticalMode || "");
        const decision = String(ai.tacticalDecision?.decision || "");
        windowItem.states[state || "none"] = (windowItem.states[state || "none"] || 0) + 1;
        windowItem.maxMoveDistance = Math.max(windowItem.maxMoveDistance, dist(unit.x, unit.y, windowItem.startX, windowItem.startY));

        if (!unit.alive || unit.hp <= 0 || Number(unit.hp) < windowItem.initialHp - 3) flag(windowItem, "blast:wounded", at);
        if (state === "rpg-attack" || state === "rpg-position") flag(windowItem, "blast:rpg-response", at);
        if (state === "spread" || decision === "spread") flag(windowItem, "blast:spread", at);
        if (state === "cover" || state === "evade-tank" || state === "avoid-fire-lane" || decision === "cover") flag(windowItem, "blast:cover", at);
        if (state === "squad-fallback" || mode === "fallback" || mode === "regroup") flag(windowItem, "blast:fallback", at);
        if (unit.isProne || state === "prone-fire") windowItem.proneSeen = true;
      }

      function openBlast(gameArg, x, y, radius, damage, team, ammo, candidates) {
        const t = gameArg.matchTime || elapsed();
        const id = ++blastSerial;
        const ammoId = ammo?.id || "blast";
        const event = {
          id,
          t: round(t, 2),
          x: round(x, 1),
          y: round(y, 1),
          radius: round(radius, 1),
          damage: round(damage, 1),
          team: team || "",
          ammoId,
          source: ammo?.probeSource || "runtime",
          affectedUnits: candidates.length
        };
        trace.blastEvents.push(event);
        if (event.source === "controlled") trace.controlledBlastEvents += 1;
        for (const candidate of candidates) {
          if (trace.unitWindows.length + active.length >= MAX_WINDOWS) continue;
          const unit = candidate.unit;
          const windowItem = {
            blastId: id,
            unit,
            unitId: idFor(unit),
            team: unit.team || "",
            classId: unit.classId || "",
            weaponId: unit.weaponId || "",
            ammoId,
            distance: round(candidate.distance, 1),
            startTime: t,
            endTime: t + RESPONSE_WINDOW_SECONDS,
            startX: unit.x,
            startY: unit.y,
            initialHp: round(candidate.hp, 1),
            initialSuppression: round(candidate.suppression, 1),
            maxMoveDistance: 0,
            proneSeen: Boolean(unit.isProne),
            states: {},
            flags: {}
          };
          active.push(windowItem);
          updateWindow(windowItem, t);
        }
      }

      const combat = window.IronLine.combat;
      const originalDamageRadius = combat.damageRadius;
      combat.damageRadius = function tracedDamageRadius(gameArg, x, y, radius, damage, team, ammo = {}) {
        const candidates = [];
        for (const unit of gameArg.infantry || []) {
          if (!unit.alive || unit.inVehicle || unit.team === team) continue;
          const distance = dist(unit.x, unit.y, x, y);
          if (distance <= radius + (unit.radius || 0)) {
            candidates.push({
              unit,
              distance,
              hp: Number(unit.hp) || 0,
              suppression: Number(unit.suppression) || 0
            });
          }
        }
        const result = originalDamageRadius.call(this, gameArg, x, y, radius, damage, team, ammo);
        if (candidates.length) openBlast(gameArg, x, y, radius, damage, team, ammo, candidates);
        return result;
      };

      function seedControlledBlast(at) {
        if (controlledBlastCount >= CONTROLLED_BLAST_MAX) return;
        if (at < CONTROLLED_BLAST_START_SECONDS || at - lastControlledBlastAt < CONTROLLED_BLAST_INTERVAL_SECONDS) return;
        const candidates = (game.infantry || []).filter((unit) => unit.alive && !unit.inVehicle && unit.team === "red");
        if (!candidates.length) return;
        let best = null;
        let bestScore = -Infinity;
        for (const unit of candidates) {
          let score = 0;
          for (const other of candidates) {
            if (other === unit) continue;
            const d = dist(unit.x, unit.y, other.x, other.y);
            if (d <= 220) score += 1 - d / 220;
          }
          score += Math.max(0, (Number(unit.suppression) || 0) / 100);
          if (score > bestScore) {
            best = unit;
            bestScore = score;
          }
        }
        if (!best) return;
        controlledBlastCount += 1;
        lastControlledBlastAt = at;
        combat.damageRadius(game, best.x, best.y, 170, 24, "blue", {
          id: "bed_probe_blast",
          probeSource: "controlled",
          owner: { team: "blue" },
          source: { team: "blue" },
          suppressionBase: 38,
          suppressionMax: 76,
          infantryDamageScale: 0.45,
          tankDamageScale: 0,
          lightVehicleDamageScale: 0,
          wreckDamageScale: 0,
          sceneryDamageScale: 0,
          obstacleDamageScale: 0
        });
      }

      const timer = setInterval(() => {
        const at = game.matchTime || elapsed();
        seedControlledBlast(at);
        for (let index = active.length - 1; index >= 0; index -= 1) {
          const item = active[index];
          updateWindow(item, at);
          if (at >= item.endTime || !item.unit || item.unit.alive === false) {
            closeWindow(item, at);
            active.splice(index, 1);
          }
        }
        if (trace.samples.length < 600) {
          trace.samples.push({
            t: round(at, 1),
            activeWindows: active.length,
            blastEvents: trace.blastEvents.length,
            completedWindows: trace.unitWindows.length
          });
        }
        if (Date.now() - startWall >= DURATION_MS) {
          clearInterval(timer);
          const finalAt = game.matchTime || elapsed();
          while (active.length) closeWindow(active.pop(), finalAt);
          done(trace);
        }
      }, INTERVAL_MS);
    });
  }

  waitForGame().then((game) => {
    game.aiScaleReadiness?.applyProfile?.("ai-15v15");
    document.querySelector("#entryEnterButton")?.click?.();
    setTimeout(() => {
      document.querySelector("#deploymentStart")?.click?.();
      const startedAt = Date.now();
      const waitForLive = () => {
        if (!game.matchStarted && Date.now() - startedAt <= 12000) return setTimeout(waitForLive, 100);
        if (!game.matchStarted) return reject(new Error("match did not start"));
        runSampling(game).then(resolve).catch(reject);
      };
      waitForLive();
    }, 140);
  }).catch(reject);
})
`;
}

function inc(bucket, key, amount = 1) {
  const safeKey = key || "unknown";
  bucket[safeKey] = (bucket[safeKey] || 0) + amount;
}

function incNested(bucket, outer, inner, amount = 1) {
  const safeOuter = outer || "unknown";
  bucket[safeOuter] = bucket[safeOuter] || {};
  inc(bucket[safeOuter], inner, amount);
}

function movementBand(distance) {
  const value = Number(distance) || 0;
  if (value < 12) return "0-12";
  if (value < 24) return "12-24";
  if (value < 48) return "24-48";
  return "48+";
}

function suppressionBand(value) {
  const amount = Number(value) || 0;
  if (amount < 25) return "0-25";
  if (amount < 50) return "25-50";
  if (amount < 75) return "50-75";
  return "75+";
}

function summarize(data) {
  const windows = data.unitWindows || [];
  const categoryCounts = {};
  const primaryCounts = {};
  const byAmmo = {};
  const primaryByWeapon = {};
  const primaryByClass = {};
  const proneOnlyByWeapon = {};
  const proneOnlyByClass = {};
  const proneOnlyStateCounts = {};
  const proneOnlyMovementBands = {};
  const proneOnlyInitialSuppressionBands = {};
  const proneOnlyFinalSuppressionBands = {};
  const firstResponseSeconds = [];
  const primaryOrder = [
    "blast:rpg-response",
    "blast:spread",
    "blast:cover",
    "blast:fallback",
    "blast:prone-only",
    "blast:wounded",
    "blast:no-response"
  ];

  for (const item of windows) {
    for (const key of Object.keys(item.flags || {})) {
      inc(categoryCounts, key);
      firstResponseSeconds.push(item.flags[key]);
    }
    const primary = primaryOrder.find((key) => Object.hasOwn(item.flags || {}, key)) || "blast:unknown";
    inc(primaryCounts, primary);
    byAmmo[item.ammoId] = byAmmo[item.ammoId] || {};
    inc(byAmmo[item.ammoId], primary);
    incNested(primaryByWeapon, item.weaponId, primary);
    incNested(primaryByClass, item.classId, primary);
    if (primary === "blast:prone-only") {
      inc(proneOnlyByWeapon, item.weaponId);
      inc(proneOnlyByClass, item.classId);
      inc(proneOnlyMovementBands, movementBand(item.maxMoveDistance));
      inc(proneOnlyInitialSuppressionBands, suppressionBand(item.initialSuppression));
      inc(proneOnlyFinalSuppressionBands, suppressionBand(item.finalSuppression));
      for (const [state, count] of Object.entries(item.states || {})) {
        inc(proneOnlyStateCounts, state, count);
      }
    }
  }

  const sortedFirst = firstResponseSeconds.sort((a, b) => a - b);
  const quantile = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;
  const totalWindows = Math.max(1, windows.length);
  return {
    durationSeconds: data.samples?.at(-1)?.t || 0,
    blastEvents: data.blastEvents?.length || 0,
    controlledBlastEvents: data.controlledBlastEvents || 0,
    blastUnitWindows: windows.length,
    categoryCounts,
    primaryCounts,
    byAmmo,
    primaryByWeapon,
    primaryByClass,
    proneOnlyByWeapon,
    proneOnlyByClass,
    proneOnlyStateCounts,
    proneOnlyMovementBands,
    proneOnlyInitialSuppressionBands,
    proneOnlyFinalSuppressionBands,
    proneOnlyRatio: Number(((categoryCounts["blast:prone-only"] || 0) / totalWindows).toFixed(3)),
    noResponseRatio: Number(((categoryCounts["blast:no-response"] || 0) / totalWindows).toFixed(3)),
    firstResponseP50: Number(quantile(sortedFirst, 0.5).toFixed(2)),
    firstResponseP90: Number(quantile(sortedFirst, 0.9).toFixed(2)),
    sampleLast: data.samples?.at(-1) || null
  };
}

function jsonBlock(title, value) {
  return [`## ${title}`, "", "```json", JSON.stringify(value, null, 2), "```", ""];
}

function markdown(summary, outDir) {
  return [
    "# Bed Combat Census",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Output: ${outDir}`,
    "Measurement: headless Chrome offline ai-15v15, runtime hooks only.",
    "Behavior change: none. The probe observes blast-unit response windows for 10 seconds after damageRadius().",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Duration | ${summary.durationSeconds}s |`,
    `| Blast events | ${summary.blastEvents} |`,
    `| Controlled blast events | ${summary.controlledBlastEvents} |`,
    `| Blast-unit windows | ${summary.blastUnitWindows} |`,
    `| Prone-only ratio | ${summary.proneOnlyRatio} |`,
    `| No-response ratio | ${summary.noResponseRatio} |`,
    `| First response p50/p90 | ${summary.firstResponseP50}s / ${summary.firstResponseP90}s |`,
    "",
    ...jsonBlock("Category Counts", summary.categoryCounts),
    ...jsonBlock("Primary Counts", summary.primaryCounts),
    ...jsonBlock("Primary Counts By Ammo", summary.byAmmo),
    ...jsonBlock("Primary Counts By Weapon", summary.primaryByWeapon),
    ...jsonBlock("Primary Counts By Class", summary.primaryByClass),
    ...jsonBlock("Prone-Only By Weapon", summary.proneOnlyByWeapon),
    ...jsonBlock("Prone-Only By Class", summary.proneOnlyByClass),
    ...jsonBlock("Prone-Only State Counts", summary.proneOnlyStateCounts),
    ...jsonBlock("Prone-Only Movement Bands", summary.proneOnlyMovementBands),
    ...jsonBlock("Prone-Only Initial Suppression Bands", summary.proneOnlyInitialSuppressionBands),
    ...jsonBlock("Prone-Only Final Suppression Bands", summary.proneOnlyFinalSuppressionBands),
    ...jsonBlock("Raw Summary", summary),
    "## Notes",
    "",
    "- `blast:prone-only` means a surviving unit went prone within the 10s window without spread, cover, fallback, or RPG response. HP loss can still be counted separately as `blast:wounded`, but units killed before a tactical response are not counted as prone-only.",
    "- `blast:wounded` means HP dropped or the unit died; AI wounded/downed behavior is not implemented in this probe.",
    "- Counts are diagnostic and can double-count a unit hit by overlapping blasts.",
    ""
  ].join("\n");
}

async function main() {
  const server = spawn(process.execPath, ["tools/static-server.cjs", String(appPort)], {
    cwd: root,
    stdio: "ignore",
    env: { ...process.env, PORT: String(appPort) }
  });
  const chrome = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--no-first-run",
    "--disable-extensions",
    appUrl
  ], { stdio: "ignore" });

  let client = null;
  try {
    await waitForApp();
    const page = await waitForCdpPage();
    client = await connectCdp(page.webSocketDebuggerUrl);
    await client.send("Runtime.enable");
    const data = await evaluate(client, pageScenario(durationMs, intervalMs), durationMs + 60000);
    const summary = summarize(data);
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const outDir = path.join(root, "reports", "playtests", `bed-combat-census-${stamp}`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(data, null, 2));
    fs.writeFileSync(path.join(outDir, "report.md"), markdown(summary, outDir));
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Report: ${path.join(outDir, "report.md")}`);
  } finally {
    if (client) client.close();
    chrome.kill();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
