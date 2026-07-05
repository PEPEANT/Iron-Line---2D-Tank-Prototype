"use strict";

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const root = path.resolve(__dirname, "..");
const { WebSocket } = require("ws");

const appPort = Number(process.env.IRONLINE_TEMPO_PORT || 4208);
const cdpPort = Number(process.env.IRONLINE_TEMPO_CDP_PORT || 9248);
const appUrl = `http://127.0.0.1:${appPort}/index.html`;
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const userDataDir = path.join(root, ".tmp-chrome-tempo-probe");

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
    } catch (_error) { await new Promise((r) => setTimeout(r, 220)); }
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
    } catch (_error) { await new Promise((r) => setTimeout(r, 220)); }
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

async function evaluate(client, expression, timeout = 120000) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime exception");
  }
  return result.result.value;
}

const pageScenario = String.raw`
new Promise((resolve, reject) => {
  const waitForGame = () => new Promise((done, fail) => {
    const startedAt = Date.now();
    const tick = () => {
      if (window.IronLine?.game) return done(window.IronLine.game);
      if (Date.now() - startedAt > 8000) return fail(new Error("game missing"));
      setTimeout(tick, 100);
    };
    tick();
  });

  const runSampling = (game) => new Promise((done) => {
    const DURATION_MS = 180000;
    const INTERVAL_MS = 500;
    const startWall = Date.now();
    const firstSeen = new Map();
    const deaths = [];
    const prevPos = new Map();
    const prevAlive = new Set();
    const samples = [];
    const damageEvents = [];
    const lastDamageByUnit = new Map();
    const areaDamageByUnit = new Map();
    let firstBulletAt = null;
    let firstDeathAt = null;

    game.effects = game.effects || {};
    const tracers = game.effects.tracers || (game.effects.tracers = []);
    let shotCount = 0;
    const shotRanges = [];
    tracers.push = function(...args) {
      shotCount += args.length;
      for (const item of args) {
        if (Number.isFinite(item?.x1) && Number.isFinite(item?.x2)) {
          const len = Math.hypot(item.x2 - item.x1, item.y2 - item.y1);
          if (shotRanges.length < 4000) shotRanges.push(Math.round(len));
        }
      }
      return Array.prototype.push.apply(this, args);
    };
    let lastShotCount = 0;

    const idFor = (unit) => unit?.callSign || unit?.id || "";
    const classifyAreaSource = (ammo, team) => {
      const owner = ammo?.owner || ammo?.source || null;
      const vehicle = owner?.sourceVehicle || (owner?.vehicleType ? owner : null);
      const ammoId = ammo?.id || "area";
      if (vehicle) {
        return {
          kind: (vehicle.vehicleType || "vehicle") + ":" + ammoId + "-blast",
          team: vehicle.team || team || "",
          vehicleType: vehicle.vehicleType || "",
          weaponId: ammoId
        };
      }
      if (owner?.weaponId) {
        return {
          kind: "infantry:" + owner.weaponId + "-blast",
          team: owner.team || team || "",
          weaponId: ammoId
        };
      }
      return { kind: "blast:" + ammoId, team: team || "", weaponId: ammoId };
    };
    const classifyDamageSource = (source, unit, amount = 0) => {
      const unitId = idFor(unit);
      const area = areaDamageByUnit.get(unitId);
      const at = Math.round(((Date.now() - startWall) / 1000) * 10) / 10;
      if (!source && area && at - area.at <= 0.35) {
        areaDamageByUnit.delete(unitId);
        return area.source;
      }
      if (area && at - area.at > 0.35) areaDamageByUnit.delete(unitId);
      if (!source && Number(amount) >= 40) {
        return { kind: "direct-heavy-or-shell", team: "", weaponId: "" };
      }
      const threat = source || unit?.lastThreat || null;
      if (!source && threat?.team && threat.team === unit?.team) {
        return { kind: "unknown", team: "" };
      }
      const vehicle = threat?.sourceVehicle || (threat?.owner?.vehicleType ? threat.owner : null) || (threat?.vehicleType ? threat : null);
      const weaponId = threat?.weaponId || threat?.ammo?.id || threat?.ammoId || "";
      const directSuffix = threat?.ammo?.id ? "-direct" : "";
      if (vehicle) {
        return {
          kind: (vehicle.vehicleType || "vehicle") + ":" + (weaponId || "weapon") + directSuffix,
          team: vehicle.team || threat?.team || "",
          vehicleType: vehicle.vehicleType || "",
          weaponId
        };
      }
      if (weaponId) {
        return {
          kind: "infantry:" + weaponId + directSuffix,
          team: threat.team || "",
          weaponId
        };
      }
      if (threat && Number.isFinite(threat.x) && Number.isFinite(threat.y)) {
        return { kind: "blast-or-area", team: threat.team || "" };
      }
      return { kind: "unknown", team: "" };
    };

    const InfantryUnit = window.IronLine?.InfantryUnit;
    const originalTakeDamage = InfantryUnit?.prototype?.takeDamage;
    if (originalTakeDamage && !originalTakeDamage.__tempoDamageWrapped) {
      InfantryUnit.prototype.takeDamage = function tempoDamageWrapped(amount, source = null) {
        const hpBefore = Number(this.hp) || 0;
        const aliveBefore = this.alive !== false && hpBefore > 0;
        const result = originalTakeDamage.call(this, amount, source);
        const hpAfter = Number(this.hp) || 0;
        const unitId = idFor(this);
        if (unitId && aliveBefore && amount > 0) {
          const sourceInfo = classifyDamageSource(source, this, amount);
          const event = {
            unitId,
            team: this.team || "",
            at: Math.round(((Date.now() - startWall) / 1000) * 10) / 10,
            amount: Math.round((Number(amount) || 0) * 10) / 10,
            hpBefore: Math.round(hpBefore * 10) / 10,
            hpAfter: Math.round(hpAfter * 10) / 10,
            lethal: this.alive === false || hpAfter <= 0,
            source: sourceInfo
          };
          lastDamageByUnit.set(unitId, event);
          if (damageEvents.length < 2400) damageEvents.push(event);
        }
        return result;
      };
      InfantryUnit.prototype.takeDamage.__tempoDamageWrapped = true;
    }

    const combat = window.IronLine?.combat;
    const originalDamageRadius = combat?.damageRadius;
    if (originalDamageRadius && !originalDamageRadius.__tempoDamageWrapped) {
      combat.damageRadius = function tempoDamageRadiusWrapped(gameArg, x, y, radius, damage, team, ammo = {}) {
        const sourceInfo = classifyAreaSource(ammo, team);
        for (const unit of gameArg?.infantry || []) {
          if (!unit?.alive || unit.inVehicle || unit.team === team) continue;
          const distance = Math.hypot((unit.x || 0) - (x || 0), (unit.y || 0) - (y || 0));
          if (distance <= radius + (unit.radius || 0)) {
            areaDamageByUnit.set(idFor(unit), {
              at: Math.round(((Date.now() - startWall) / 1000) * 10) / 10,
              source: sourceInfo
            });
          }
        }
        return originalDamageRadius.call(this, gameArg, x, y, radius, damage, team, ammo);
      };
      combat.damageRadius.__tempoDamageWrapped = true;
    }

    const timer = setInterval(() => {
      const t = (Date.now() - startWall) / 1000;
      const infantry = game.infantry || [];
      const bullets = shotCount - lastShotCount;
      lastShotCount = shotCount;
      if (shotCount > 0 && firstBulletAt === null) firstBulletAt = t;

      let aliveB = 0;
      let aliveR = 0;
      let moving = 0;
      let aliveCount = 0;
      let suppressionSum = 0;
      let proneCount = 0;
      const stateCounts = {};
      const proneStateCounts = {};
      const weaponCounts = {};
      const proneWeaponCounts = {};
      const aliveNow = new Set();

      for (const unit of infantry) {
        const id = unit.callSign || unit.id || "";
        if (!id) continue;
        const alive = unit.alive !== false && unit.hp > 0;
        if (!firstSeen.has(id)) firstSeen.set(id, t);
        if (alive) {
          aliveNow.add(id);
          aliveCount += 1;
          if (unit.team === "blue") aliveB += 1; else aliveR += 1;
          suppressionSum += Number(unit.suppression) || 0;
          if (unit.isProne) proneCount += 1;
          const state = unit.ai?.state || "unknown";
          const weapon = unit.weaponId || unit.ai?.weapon?.()?.id || "unknown";
          stateCounts[state] = (stateCounts[state] || 0) + 1;
          weaponCounts[weapon] = (weaponCounts[weapon] || 0) + 1;
          if (unit.isProne) {
            proneStateCounts[state] = (proneStateCounts[state] || 0) + 1;
            proneWeaponCounts[weapon] = (proneWeaponCounts[weapon] || 0) + 1;
          }
          const prev = prevPos.get(id);
          if (prev && Math.hypot(unit.x - prev.x, unit.y - prev.y) > 9) moving += 1;
          prevPos.set(id, { x: unit.x, y: unit.y });
        }
      }
      for (const id of prevAlive) {
        if (!aliveNow.has(id)) {
          deaths.push({ id, at: t, lifetime: t - (firstSeen.get(id) || 0), lastDamage: lastDamageByUnit.get(id) || null });
          if (firstDeathAt === null) firstDeathAt = t;
        }
      }
      prevAlive.clear();
      for (const id of aliveNow) prevAlive.add(id);

      const squads = (game.squads || []).filter((s) => (s.activeUnits?.() || []).length > 0);
      const modeCounts = {};
      let cohesionSum = 0;
      let cohesionCount = 0;
      for (const squad of squads) {
        const mode = squad.tacticalMode || "none";
        modeCounts[mode] = (modeCounts[mode] || 0) + 1;
        const units = squad.activeUnits?.() || [];
        if (units.length >= 2) {
          const cx = units.reduce((s, u) => s + u.x, 0) / units.length;
          const cy = units.reduce((s, u) => s + u.y, 0) / units.length;
          const avg = units.reduce((s, u) => s + Math.hypot(u.x - cx, u.y - cy), 0) / units.length;
          cohesionSum += avg;
          cohesionCount += 1;
        }
      }

      samples.push({
        t: Math.round(t * 10) / 10,
        aliveB,
        aliveR,
        bullets,
        movingRatio: aliveCount ? Math.round(moving / aliveCount * 100) / 100 : 0,
        avgSuppression: aliveCount ? Math.round(suppressionSum / aliveCount * 10) / 10 : 0,
        proneRatio: aliveCount ? Math.round(proneCount / aliveCount * 100) / 100 : 0,
        cohesion: cohesionCount ? Math.round(cohesionSum / cohesionCount) : 0,
        modes: modeCounts,
        states: stateCounts,
        proneStates: proneStateCounts,
        weapons: weaponCounts,
        proneWeapons: proneWeaponCounts
      });

      if (Date.now() - startWall >= DURATION_MS) {
        clearInterval(timer);
        done({
          samples,
          deaths,
          firstBulletAt,
          firstDeathAt,
          totalShots: shotCount,
          shotRanges,
          damageEvents,
          initialB: samples[0]?.aliveB || 0,
          initialR: samples[0]?.aliveR || 0
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

async function main() {
  const server = spawn(process.execPath, ["tools/static-server.cjs", String(appPort)], {
    cwd: root, stdio: "ignore", env: { ...process.env, PORT: String(appPort) }
  });
  const chrome = spawn(chromePath, [
    "--headless=new", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${userDataDir}`,
    "--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox", "--no-first-run", "--disable-extensions", appUrl
  ], { stdio: "ignore" });

  let client = null;
  try {
    await waitForApp();
    const page = await waitForCdpPage();
    client = await connectCdp(page.webSocketDebuggerUrl);
    await client.send("Runtime.enable");
    const data = await evaluate(client, pageScenario, 220000);
    const summary = summarize(data);
    const fs = require("fs");
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const outDir = path.join(root, "reports", "playtests", `battlefield-tempo-${stamp}`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(data));
    fs.writeFileSync(path.join(outDir, "report.md"), summaryMarkdown(summary));
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Report: ${path.join(outDir, "report.md")}`);
  } finally {
    if (client) client.close();
    chrome.kill();
    server.kill();
  }
}

function summarize(r) {
  const OPENING_WINDOW_SECONDS = 15;
  const s = r.samples || [];
  const last = s[s.length - 1] || {};
  const firstDamageAt = (r.damageEvents || [])
    .map((event) => Number(event.at))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  const contactCandidates = [r.firstBulletAt, firstDamageAt].filter(Number.isFinite);
  const contact = contactCandidates.length ? Math.min(...contactCandidates) : 0;
  const post = s.filter((x) => x.t >= contact);
  const pre = s.filter((x) => x.t < contact);
  const avg = (arr, k) => (arr.length ? +(arr.reduce((sum, x) => sum + x[k], 0) / arr.length).toFixed(2) : 0);
  const postMinutes = Math.max(0.01, (last.t - contact) / 60);
  const survival = r.deaths.map((d) => d.at - contact).filter((x) => x >= 0).sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.floor(arr.length * p)] || 0;
  const ranges = (r.shotRanges || []).sort((a, b) => a - b);
  const modeTotals = {};
  for (const x of post) for (const [m, c] of Object.entries(x.modes || {})) modeTotals[m] = (modeTotals[m] || 0) + c;
  const sumCounts = (field) => {
    const result = {};
    for (const x of post) for (const [key, count] of Object.entries(x[field] || {})) result[key] = (result[key] || 0) + count;
    return result;
  };
  const deathSourceCounts = {};
  for (const death of r.deaths || []) {
    const key = death.lastDamage?.source?.kind || "unknown";
    deathSourceCounts[key] = (deathSourceCounts[key] || 0) + 1;
  }
  const preContactDeaths = r.deaths.filter((death) => death.at < contact);
  const openingDeaths = r.deaths.filter((death) => death.at >= contact && death.at < contact + OPENING_WINDOW_SECONDS);
  const openingDeathSourceCounts = {};
  for (const death of openingDeaths) {
    const key = death.lastDamage?.source?.kind || "unknown";
    openingDeathSourceCounts[key] = (openingDeathSourceCounts[key] || 0) + 1;
  }
  const openingHeavyOrVehicleDeaths = openingDeaths.filter((death) => {
    const kind = death.lastDamage?.source?.kind || "";
    return kind === "direct-heavy-or-shell" || kind.startsWith("tank:") || kind.startsWith("humvee:");
  }).length;
  const firstDeath = (r.deaths || []).slice().sort((a, b) => a.at - b.at)[0] || null;
  return {
    durationSeconds: last.t || 0,
    firstShotAt: r.firstBulletAt,
    firstDamageAt,
    firstContactAt: contact,
    firstDeathAt: r.firstDeathAt,
    firstDeathAfterContactSeconds: r.firstDeathAt !== null
      ? +(r.firstDeathAt - contact).toFixed(1)
      : null,
    totalShots: r.totalShots,
    shotsPerMinutePostContact: +(r.totalShots / postMinutes).toFixed(0),
    deaths: r.deaths.length,
    deathsPerMinutePostContact: +(r.deaths.filter((d) => d.at >= contact).length / postMinutes).toFixed(1),
    preContactDeaths: preContactDeaths.length,
    openingWindowSeconds: OPENING_WINDOW_SECONDS,
    openingDeaths: openingDeaths.length,
    openingHeavyOrVehicleDeaths,
    openingDeathSourceCounts,
    deathSourceCounts,
    firstDeathDetail: firstDeath ? {
      id: firstDeath.id,
      at: +firstDeath.at.toFixed(1),
      afterContactSeconds: contact ? +(firstDeath.at - contact).toFixed(1) : null,
      source: firstDeath.lastDamage?.source || { kind: "unknown" },
      amount: firstDeath.lastDamage?.amount ?? null,
      hpBefore: firstDeath.lastDamage?.hpBefore ?? null
    } : null,
    survivalAfterContactP25: +q(survival, 0.25).toFixed(0),
    survivalAfterContactP50: +q(survival, 0.5).toFixed(0),
    survivalAfterContactP75: +q(survival, 0.75).toFixed(0),
    shotRangeP50: q(ranges, 0.5),
    shotRangeP95: q(ranges, 0.95),
    preContact: { movingRatio: avg(pre, "movingRatio"), avgSuppression: avg(pre, "avgSuppression"), proneRatio: avg(pre, "proneRatio"), cohesion: avg(pre, "cohesion") },
    postContact: { movingRatio: avg(post, "movingRatio"), avgSuppression: avg(post, "avgSuppression"), proneRatio: avg(post, "proneRatio"), cohesion: avg(post, "cohesion") },
    finalAlive: { blue: last.aliveB || 0, red: last.aliveR || 0, initialBlue: r.initialB, initialRed: r.initialR },
    postContactModes: modeTotals,
    postContactStates: sumCounts("states"),
    postContactProneStates: sumCounts("proneStates"),
    postContactWeapons: sumCounts("weapons"),
    postContactProneWeapons: sumCounts("proneWeapons")
  };
}

function summaryMarkdown(m) {
  return [
    "# Battlefield Tempo Probe",
    "",
    `Generated: ${new Date().toISOString()}`,
    "Measurement: headless Chrome offline 15v15, 180s sampling at 500ms",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| First shot at | ${m.firstShotAt}s |`,
    `| First damage at | ${m.firstDamageAt}s |`,
    `| First contact at | ${m.firstContactAt}s |`,
    `| First death after contact | ${m.firstDeathAfterContactSeconds}s |`,
    `| Deaths/min post-contact | ${m.deathsPerMinutePostContact} |`,
    `| Pre-contact deaths | ${m.preContactDeaths} |`,
    `| Opening deaths 0-${m.openingWindowSeconds}s | ${m.openingDeaths} |`,
    `| Opening heavy/vehicle deaths | ${m.openingHeavyOrVehicleDeaths} |`,
    `| Survival after contact p25/p50/p75 | ${m.survivalAfterContactP25}s / ${m.survivalAfterContactP50}s / ${m.survivalAfterContactP75}s |`,
    `| Shots/min post-contact | ${m.shotsPerMinutePostContact} |`,
    `| Shot range p50/p95 | ${m.shotRangeP50}px / ${m.shotRangeP95}px |`,
    `| Suppression avg post-contact | ${m.postContact.avgSuppression} |`,
    `| Prone ratio post-contact | ${m.postContact.proneRatio} |`,
    `| Cohesion avg post-contact | ${m.postContact.cohesion}px |`,
    `| Moving ratio pre/post | ${m.preContact.movingRatio} / ${m.postContact.movingRatio} |`,
    `| Final alive | B ${m.finalAlive.blue}/${m.finalAlive.initialBlue}, R ${m.finalAlive.red}/${m.finalAlive.initialRed} |`,
    "",
    "First death detail:",
    "",
    "```json",
    JSON.stringify(m.firstDeathDetail, null, 2),
    "```",
    "",
    `Death sources: ${JSON.stringify(m.deathSourceCounts)}`,
    `Opening death sources: ${JSON.stringify(m.openingDeathSourceCounts)}`,
    "",
    `Post-contact tactical modes: ${JSON.stringify(m.postContactModes)}`,
    `Post-contact infantry states: ${JSON.stringify(m.postContactStates)}`,
    `Post-contact prone states: ${JSON.stringify(m.postContactProneStates)}`,
    `Post-contact weapons: ${JSON.stringify(m.postContactWeapons)}`,
    `Post-contact prone weapons: ${JSON.stringify(m.postContactProneWeapons)}`,
    "",
    "Targets (see docs/battlefield-tempo-diagnosis-2026-07-03.md): first death >8s after contact, survival p50 20-30s, suppression avg >15, prone ratio >0.15, deaths/min 6-12.",
    ""
  ].join("\n");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
