"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_SUPPRESSION_PORT || 4211);
const cdpPort = Number(process.env.IRONLINE_SUPPRESSION_CDP_PORT || 9251);
const durationMs = Number(process.env.IRONLINE_SUPPRESSION_DURATION_MS || 150000);
const appUrl = `http://127.0.0.1:${appPort}/index.html`;
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const userDataDir = path.join(root, ".tmp-chrome-suppression-probe");

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
        close() { ws.close(); }
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

async function evaluate(client, expression, timeout = 200000) {
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

function pageScenario(ms) {
  return String.raw`
new Promise((resolve, reject) => {
  const DURATION_MS = ${ms};
  const INTERVAL_MS = 500;

  const waitForGame = () => new Promise((done, fail) => {
    const startedAt = Date.now();
    const tick = () => {
      if (window.IronLine?.game && window.IronLine?.InfantryUnit && window.IronLine?.combat) return done(window.IronLine.game);
      if (Date.now() - startedAt > 9000) return fail(new Error("game missing"));
      setTimeout(tick, 100);
    };
    tick();
  });

  const idFor = (item) => item?.callSign || item?.id || "";

  function installTrace(game) {
    const InfantryUnit = window.IronLine.InfantryUnit;
    const InfantryAI = window.IronLine.InfantryAI;
    const combat = window.IronLine.combat;
    const trace = {
      suppressEvents: [],
      damageEvents: [],
      fireShots: [],
      proneTransitions: [],
      clearProneTransitions: [],
      decayTotal: 0,
      decaySamples: 0,
      activeShot: null,
      shotSerial: 0
    };

    const originalSuppress = InfantryUnit.prototype.suppress;
    InfantryUnit.prototype.suppress = function tracedSuppress(amount, source) {
      const before = Number(this.suppression) || 0;
      const sourceId = idFor(source);
      const shot = trace.activeShot;
      const event = {
        t: game.matchTime || 0,
        unit: idFor(this),
        team: this.team || "",
        amount: Math.round((Number(amount) || 0) * 100) / 100,
        before: Math.round(before * 100) / 100,
        source: sourceId,
        sourceTeam: source?.team || "",
        kind: shot ? (idFor(this) === shot.target ? "rifle-target" : "rifle-near") : "other"
      };
      const result = originalSuppress.call(this, amount, source);
      event.after = Math.round((Number(this.suppression) || 0) * 100) / 100;
      event.delta = Math.round((event.after - event.before) * 100) / 100;
      if (shot) {
        event.shotId = shot.id;
        shot.suppressionEvents.push(event);
      }
      if (trace.suppressEvents.length < 12000) trace.suppressEvents.push(event);
      return result;
    };

    const originalTakeDamage = InfantryUnit.prototype.takeDamage;
    InfantryUnit.prototype.takeDamage = function tracedTakeDamage(amount, source = null) {
      const beforeHp = Number(this.hp) || 0;
      const beforeSuppression = Number(this.suppression) || 0;
      const result = originalTakeDamage.call(this, amount, source);
      const afterHp = Number(this.hp) || 0;
      const event = {
        t: game.matchTime || 0,
        unit: idFor(this),
        team: this.team || "",
        amount: Math.round((Number(amount) || 0) * 100) / 100,
        hpDelta: Math.round((beforeHp - afterHp) * 100) / 100,
        suppressionDelta: Math.round(((Number(this.suppression) || 0) - beforeSuppression) * 100) / 100,
        source: idFor(source),
        sourceTeam: source?.team || ""
      };
      if (trace.damageEvents.length < 8000) trace.damageEvents.push(event);
      return result;
    };

    const originalUpdateSuppression = InfantryUnit.prototype.updateSuppression;
    InfantryUnit.prototype.updateSuppression = function tracedUpdateSuppression(dt) {
      const before = Number(this.suppression) || 0;
      const result = originalUpdateSuppression.call(this, dt);
      const after = Number(this.suppression) || 0;
      if (after < before) {
        trace.decayTotal += before - after;
        trace.decaySamples += 1;
      }
      return result;
    };

    const originalEnterProne = InfantryAI?.prototype?.enterProne;
    if (originalEnterProne) {
      InfantryAI.prototype.enterProne = function tracedEnterProne(options = {}) {
        const before = Boolean(this.unit?.isProne);
        const result = originalEnterProne.call(this, options);
        const after = Boolean(this.unit?.isProne);
        if (!before && after && trace.proneTransitions.length < 2000) {
          trace.proneTransitions.push({
            t: game.matchTime || 0,
            unit: idFor(this.unit),
            team: this.unit?.team || "",
            state: this.state || "",
            suppression: Math.round((Number(this.unit?.suppression) || 0) * 100) / 100,
            mode: options.mode || "",
            role: options.role || this.squadRole?.() || ""
          });
        }
        return result;
      };
    }

    const originalClearProne = InfantryAI?.prototype?.clearProne;
    if (originalClearProne) {
      InfantryAI.prototype.clearProne = function tracedClearProne(cooldown, instant) {
        const before = Boolean(this.unit?.isProne);
        const result = originalClearProne.call(this, cooldown, instant);
        if (before && !this.unit?.isProne && trace.clearProneTransitions.length < 2000) {
          trace.clearProneTransitions.push({
            t: game.matchTime || 0,
            unit: idFor(this.unit),
            team: this.unit?.team || "",
            state: this.state || "",
            suppression: Math.round((Number(this.unit?.suppression) || 0) * 100) / 100,
            instant: Boolean(instant)
          });
        }
        return result;
      };
    }

    const originalFireRifle = combat.fireRifle;
    combat.fireRifle = function tracedFireRifle(gameArg, shooter, target, options = {}) {
      const shot = {
        id: ++trace.shotSerial,
        t: game.matchTime || 0,
        shooter: idFor(shooter),
        shooterTeam: shooter?.team || "",
        target: idFor(target),
        targetTeam: target?.team || "",
        weapon: options.weapon?.id || shooter?.weaponId || "",
        targetHpBefore: Number(target?.hp) || 0,
        suppressionEvents: []
      };
      trace.activeShot = shot;
      let fired = false;
      try {
        fired = originalFireRifle.call(this, gameArg, shooter, target, options);
      } finally {
        trace.activeShot = null;
      }
      shot.fired = Boolean(fired);
      shot.targetHpAfter = Number(target?.hp) || 0;
      shot.hit = shot.targetHpAfter < shot.targetHpBefore;
      for (const event of shot.suppressionEvents) {
        if (event.kind === "rifle-target") event.kind = shot.hit ? "rifle-target-hit" : "rifle-target-miss";
      }
      shot.suppressCount = shot.suppressionEvents.length;
      shot.suppressTotal = Math.round(shot.suppressionEvents.reduce((sum, event) => sum + Math.max(0, event.delta || 0), 0) * 100) / 100;
      shot.targetSuppressTotal = Math.round(shot.suppressionEvents
        .filter((event) => event.unit === shot.target)
        .reduce((sum, event) => sum + Math.max(0, event.delta || 0), 0) * 100) / 100;
      if (fired && trace.fireShots.length < 6000) trace.fireShots.push(shot);
      return fired;
    };

    game.__suppressionTrace = trace;
    return trace;
  }

  const runSampling = (game) => new Promise((done) => {
    const trace = installTrace(game);
    const startWall = Date.now();
    const firstSeen = new Map();
    const prevAlive = new Set();
    const samples = [];
    const unitStats = new Map();
    let firstShotAt = null;
    let firstDeathAt = null;
    let lastShotCount = 0;
    const deaths = [];

    const ensureStats = (unit) => {
      const id = idFor(unit);
      if (!unitStats.has(id)) {
        unitStats.set(id, {
          unit: id,
          team: unit.team || "",
          maxSuppression: 0,
          secondsGte15: 0,
          secondsGte30: 0,
          secondsGte42: 0,
          secondsProne: 0,
          aliveSamples: 0
        });
      }
      return unitStats.get(id);
    };

    const timer = setInterval(() => {
      const t = (Date.now() - startWall) / 1000;
      const infantry = game.infantry || [];
      const shotCount = trace.fireShots.length;
      const shots = shotCount - lastShotCount;
      lastShotCount = shotCount;
      if (shotCount > 0 && firstShotAt === null) firstShotAt = t;

      let aliveCount = 0;
      let suppressionSum = 0;
      let proneCount = 0;
      let high15 = 0;
      let high30 = 0;
      let high42 = 0;
      const aliveNow = new Set();

      for (const unit of infantry) {
        const id = idFor(unit);
        if (!id) continue;
        if (!firstSeen.has(id)) firstSeen.set(id, t);
        const alive = unit.alive !== false && unit.hp > 0;
        if (!alive) continue;
        aliveNow.add(id);
        aliveCount += 1;
        const suppression = Number(unit.suppression) || 0;
        suppressionSum += suppression;
        if (unit.isProne) proneCount += 1;
        if (suppression >= 15) high15 += 1;
        if (suppression >= 30) high30 += 1;
        if (suppression >= 42) high42 += 1;
        const stats = ensureStats(unit);
        stats.aliveSamples += 1;
        stats.maxSuppression = Math.max(stats.maxSuppression, suppression);
        stats.secondsGte15 += suppression >= 15 ? INTERVAL_MS / 1000 : 0;
        stats.secondsGte30 += suppression >= 30 ? INTERVAL_MS / 1000 : 0;
        stats.secondsGte42 += suppression >= 42 ? INTERVAL_MS / 1000 : 0;
        stats.secondsProne += unit.isProne ? INTERVAL_MS / 1000 : 0;
      }

      for (const id of prevAlive) {
        if (!aliveNow.has(id)) {
          deaths.push({ id, at: t, lifetime: t - (firstSeen.get(id) || 0) });
          if (firstDeathAt === null) firstDeathAt = t;
        }
      }
      prevAlive.clear();
      for (const id of aliveNow) prevAlive.add(id);

      samples.push({
        t: Math.round(t * 10) / 10,
        aliveCount,
        shots,
        avgSuppression: aliveCount ? Math.round(suppressionSum / aliveCount * 100) / 100 : 0,
        proneRatio: aliveCount ? Math.round(proneCount / aliveCount * 100) / 100 : 0,
        high15Ratio: aliveCount ? Math.round(high15 / aliveCount * 100) / 100 : 0,
        high30Ratio: aliveCount ? Math.round(high30 / aliveCount * 100) / 100 : 0,
        high42Ratio: aliveCount ? Math.round(high42 / aliveCount * 100) / 100 : 0
      });

      if (Date.now() - startWall >= DURATION_MS) {
        clearInterval(timer);
        done({
          samples,
          deaths,
          firstShotAt,
          firstDeathAt,
          trace: {
            suppressEvents: trace.suppressEvents,
            damageEvents: trace.damageEvents,
            fireShots: trace.fireShots,
            proneTransitions: trace.proneTransitions,
            clearProneTransitions: trace.clearProneTransitions,
            decayTotal: Math.round(trace.decayTotal * 100) / 100,
            decaySamples: trace.decaySamples
          },
          unitStats: Array.from(unitStats.values()).map((item) => ({
            ...item,
            maxSuppression: Math.round(item.maxSuppression * 100) / 100,
            secondsGte15: Math.round(item.secondsGte15 * 100) / 100,
            secondsGte30: Math.round(item.secondsGte30 * 100) / 100,
            secondsGte42: Math.round(item.secondsGte42 * 100) / 100,
            secondsProne: Math.round(item.secondsProne * 100) / 100
          }))
        });
      }
    }, INTERVAL_MS);
  });

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

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function aggregateBy(events, key) {
  const result = {};
  for (const event of events) {
    const value = event[key] || "unknown";
    const item = result[value] || (result[value] = { count: 0, totalDelta: 0, totalAmount: 0, maxAfter: 0 });
    item.count += 1;
    item.totalDelta += Math.max(0, Number(event.delta) || 0);
    item.totalAmount += Math.max(0, Number(event.amount) || 0);
    item.maxAfter = Math.max(item.maxAfter, Number(event.after) || 0);
  }
  for (const item of Object.values(result)) {
    item.totalDelta = Math.round(item.totalDelta * 100) / 100;
    item.totalAmount = Math.round(item.totalAmount * 100) / 100;
    item.avgDelta = Math.round(item.totalDelta / Math.max(1, item.count) * 100) / 100;
    item.maxAfter = Math.round(item.maxAfter * 100) / 100;
  }
  return result;
}

function summarize(data) {
  const samples = data.samples || [];
  const trace = data.trace || {};
  const suppressEvents = trace.suppressEvents || [];
  const damageEvents = trace.damageEvents || [];
  const shots = trace.fireShots || [];
  const last = samples[samples.length - 1] || {};
  const contact = data.firstShotAt || 0;
  const post = samples.filter((item) => item.t >= contact);
  const avg = (items, key) => items.length
    ? Math.round(items.reduce((sum, item) => sum + (Number(item[key]) || 0), 0) / items.length * 100) / 100
    : 0;
  const hitShots = shots.filter((shot) => shot.hit);
  const targetSuppress = shots.map((shot) => Number(shot.targetSuppressTotal) || 0);
  const maxSuppressionValues = (data.unitStats || []).map((item) => Number(item.maxSuppression) || 0);
  const unitsGte15 = (data.unitStats || []).filter((item) => item.secondsGte15 > 0).length;
  const unitsGte30 = (data.unitStats || []).filter((item) => item.secondsGte30 > 0).length;
  const unitsGte42 = (data.unitStats || []).filter((item) => item.secondsGte42 > 0).length;
  const unitsProne = (data.unitStats || []).filter((item) => item.secondsProne > 0).length;
  const inputTotal = suppressEvents.reduce((sum, event) => sum + Math.max(0, Number(event.delta) || 0), 0);

  return {
    durationSeconds: last.t || 0,
    firstShotAt: data.firstShotAt,
    firstDeathAt: data.firstDeathAt,
    firstDeathAfterContactSeconds: data.firstDeathAt !== null && data.firstShotAt !== null
      ? Math.round((data.firstDeathAt - data.firstShotAt) * 10) / 10
      : null,
    shots: shots.length,
    shotHitRate: Math.round(hitShots.length / Math.max(1, shots.length) * 100) / 100,
    suppressEvents: suppressEvents.length,
    damageEvents: damageEvents.length,
    suppressionInputTotal: Math.round(inputTotal * 100) / 100,
    suppressionDecayTotal: trace.decayTotal || 0,
    inputMinusDecay: Math.round((inputTotal - (trace.decayTotal || 0)) * 100) / 100,
    postContact: {
      avgSuppression: avg(post, "avgSuppression"),
      proneRatio: avg(post, "proneRatio"),
      high15Ratio: avg(post, "high15Ratio"),
      high30Ratio: avg(post, "high30Ratio"),
      high42Ratio: avg(post, "high42Ratio")
    },
    byKind: aggregateBy(suppressEvents, "kind"),
    targetSuppressionPerShot: {
      p50: percentile(targetSuppress, 0.5),
      p75: percentile(targetSuppress, 0.75),
      p95: percentile(targetSuppress, 0.95)
    },
    unitMaxSuppression: {
      p50: percentile(maxSuppressionValues, 0.5),
      p75: percentile(maxSuppressionValues, 0.75),
      p95: percentile(maxSuppressionValues, 0.95),
      max: Math.max(0, ...maxSuppressionValues)
    },
    unitThresholdCounts: {
      totalTracked: (data.unitStats || []).length,
      unitsGte15,
      unitsGte30,
      unitsGte42,
      unitsProne
    },
    proneTransitions: (trace.proneTransitions || []).length,
    clearProneTransitions: (trace.clearProneTransitions || []).length,
    finalAlive: last.aliveCount || 0,
    deaths: (data.deaths || []).length
  };
}

function markdown(summary) {
  return [
    "# Suppression Flow Probe",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Measurement: headless Chrome offline 15v15, ${summary.durationSeconds}s`,
    "",
    "## Summary",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| First shot | ${summary.firstShotAt}s |`,
    `| First death after first shot | ${summary.firstDeathAfterContactSeconds}s |`,
    `| Shots / hit rate | ${summary.shots} / ${summary.shotHitRate} |`,
    `| Suppress events | ${summary.suppressEvents} |`,
    `| Suppression input total | ${summary.suppressionInputTotal} |`,
    `| Suppression decay total | ${summary.suppressionDecayTotal} |`,
    `| Input minus decay | ${summary.inputMinusDecay} |`,
    `| Post-contact avg suppression | ${summary.postContact.avgSuppression} |`,
    `| Post-contact prone ratio | ${summary.postContact.proneRatio} |`,
    `| Post-contact >=15 / >=30 / >=42 ratios | ${summary.postContact.high15Ratio} / ${summary.postContact.high30Ratio} / ${summary.postContact.high42Ratio} |`,
    `| Units ever >=15 / >=30 / >=42 / prone | ${summary.unitThresholdCounts.unitsGte15} / ${summary.unitThresholdCounts.unitsGte30} / ${summary.unitThresholdCounts.unitsGte42} / ${summary.unitThresholdCounts.unitsProne} |`,
    `| Unit max suppression p50/p75/p95/max | ${summary.unitMaxSuppression.p50} / ${summary.unitMaxSuppression.p75} / ${summary.unitMaxSuppression.p95} / ${summary.unitMaxSuppression.max} |`,
    `| Prone enter / clear transitions | ${summary.proneTransitions} / ${summary.clearProneTransitions} |`,
    "",
    "## Suppression By Kind",
    "",
    "```json",
    JSON.stringify(summary.byKind, null, 2),
    "```",
    "",
    "## Target Suppression Per Rifle Shot",
    "",
    "```json",
    JSON.stringify(summary.targetSuppressionPerShot, null, 2),
    "```",
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
    await client.send("Page.enable");
    await client.send("Page.navigate", { url: appUrl });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await client.send("Runtime.enable");
    const data = await evaluate(client, pageScenario(durationMs), durationMs + 70000);
    const summary = summarize(data);
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const outDir = path.join(root, "reports", "playtests", `suppression-flow-${stamp}`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(data));
    fs.writeFileSync(path.join(outDir, "report.md"), markdown(summary));
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
