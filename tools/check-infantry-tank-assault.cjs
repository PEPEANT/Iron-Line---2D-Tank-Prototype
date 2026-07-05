"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_TANK_ASSAULT_PORT || 4218);
const cdpPort = Number(process.env.IRONLINE_TANK_ASSAULT_CDP_PORT || 9258);
const durationSeconds = Number(process.env.IRONLINE_TANK_ASSAULT_SECONDS || 12);
const appUrl = `http://127.0.0.1:${appPort}/index.html`;
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const userDataDir = path.join(root, ".tmp-chrome-tank-assault");

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

async function evaluate(client, expression, timeout = 30000) {
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

function pageScenario(seconds) {
  return String.raw`
new Promise((resolve, reject) => {
  const DURATION_SECONDS = ${seconds};
  const DT = 1 / 30;

  const waitForGame = () => new Promise((done, fail) => {
    const startedAt = Date.now();
    const tick = () => {
      const IronLine = window.IronLine;
      if (
        IronLine?.game &&
        IronLine?.Tank &&
        IronLine?.InfantryUnit &&
        IronLine?.InfantryAI &&
        IronLine?.math &&
        IronLine?.physics
      ) return done(IronLine.game);
      if (Date.now() - startedAt > 9000) return fail(new Error("game missing"));
      setTimeout(tick, 100);
    };
    tick();
  });

  function round(value, digits = 3) {
    const scale = 10 ** digits;
    return Math.round((Number(value) || 0) * scale) / scale;
  }

  function inc(bucket, key) {
    const safeKey = key || "unknown";
    bucket[safeKey] = (bucket[safeKey] || 0) + 1;
  }

  function distance(a, b) {
    return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
  }

  function startBlockReason(ai, tank, tankDistance, order, contact) {
    const unit = ai.unit;
    const config = window.IronLine.InfantryAIConfig || {};
    const cfg = (key, fallback) => Number.isFinite(config[key]) ? config[key] : fallback;
    if (!tank?.alive || tank.vehicleType === "humvee" || tank.team === unit.team) return "invalid-tank";
    if (unit.classId === "scout" || unit.inVehicle || !order?.point) return "invalid-unit-or-order";
    if ((ai.tankAssaultCooldown || 0) > 0) return "cooldown";
    if ((unit.suppression || 0) > cfg("tankAssaultSuppressionLimit", 76)) return "suppression";
    if (tankDistance > (tank.radius || 38) + cfg("tankAssaultAcquireRange", 96)) return "distance";
    if (Math.abs(tank.speed || 0) > 96) return "tank-speed";
    if (!tank.canReserveInfantryAssault?.(unit)) return "reserve";
    if (ai.hasRpg?.() && tankDistance > cfg("rpgDangerRange", 275) + 18) return "rpg-range";
    if (contact && tankDistance > (tank.radius || 38) + 68) return "contact-distance";
    const slot = tank.assaultSlotPoint?.(unit, ai.game);
    if (!slot) return "no-slot";
    if (!ai.pointPassable(slot.x, slot.y, unit.radius + 3)) return "slot-blocked";
    return "ready";
  }

  function summarizeTrace(trace) {
    const progressSamples = trace.samples.map((item) => item.progress);
    const slotDistances = trace.samples.map((item) => item.slotDistance).filter(Number.isFinite);
    const tankDistances = trace.samples.map((item) => item.tankDistance).filter(Number.isFinite);
    return {
      name: trace.name,
      started: trace.reserveCalls > 0 || trace.samples.some((item) => item.hasReservation),
      reserveCalls: trace.reserveCalls,
      cancelReasons: trace.cancelReasons,
      stateCounts: trace.stateCounts,
      startBlockReasons: trace.startBlockReasons,
      maxProgress: round(Math.max(0, ...progressSamples)),
      progress3At: trace.progress3At,
      progress7At: trace.progress7At,
      maxMobilityTimer: round(trace.maxMobilityTimer),
      maxDisabledTimer: round(trace.maxDisabledTimer),
      minSlotDistance: slotDistances.length ? round(Math.min(...slotDistances), 2) : null,
      minTankDistance: tankDistances.length ? round(Math.min(...tankDistances), 2) : null,
      finalState: trace.samples.at(-1)?.state || "",
      finalPhase: trace.samples.at(-1)?.phase || "",
      finalProgress: trace.samples.at(-1)?.progress || 0,
      completed: trace.progress7At !== null || trace.maxDisabledTimer > 0,
      sampleCount: trace.samples.length
    };
  }

  function runScenario(game, spec) {
    const IronLine = window.IronLine;
    const { TEAM } = IronLine.constants;
    const tank = new IronLine.Tank({
      x: spec.tankX || 1000,
      y: spec.tankY || 1000,
      team: TEAM.BLUE,
      callSign: spec.tankCallSign || "QA-TANK",
      angle: spec.tankAngle || 0,
      maxHp: 110
    });
    if (spec.tankAi) {
      tank.ai = new IronLine.TankAI(tank, game);
      tank.crew = { alive: true, team: TEAM.BLUE };
    }
    const attacker = new IronLine.InfantryUnit({
      x: tank.x + 1,
      y: tank.y,
      team: TEAM.RED,
      callSign: spec.callSign || "QA-ASSAULT",
      weaponId: spec.weaponId || "rifle",
      classId: spec.classId || "infantry",
      rpgAmmo: spec.rpgAmmo || 0,
      grenadeAmmo: 0,
      hp: 55,
      angle: Math.PI
    });
    const slot = tank.assaultSlotPoint(attacker, game, spec.slotIndex);
    const fromAngle = slot.angle;
    attacker.x = slot.x + Math.cos(fromAngle) * spec.startOffset;
    attacker.y = slot.y + Math.sin(fromAngle) * spec.startOffset;
    attacker.angle = Math.atan2(tank.y - attacker.y, tank.x - attacker.x);
    attacker.ai = new IronLine.InfantryAI(attacker, game);
    attacker.ai.tankAssaultCooldown = spec.cooldown ?? 0;

    game.tanks = [tank];
    game.humvees = [];
    game.infantry = [attacker];
    game.crews = [];
    game.drones = [];
    game.capturePoints = [{
      name: "QA",
      x: tank.x,
      y: tank.y,
      radius: 160,
      owner: TEAM.BLUE,
      contested: false
    }];
    game.commanders = {};
    game.matchStarted = true;
    game.result = null;
    game.testLabAiPaused = false;

    const trace = {
      name: spec.name,
      reserveCalls: 0,
      cancelReasons: {},
      stateCounts: {},
      startBlockReasons: {},
      maxMobilityTimer: 0,
      maxDisabledTimer: 0,
      progress3At: null,
      progress7At: null,
      samples: []
    };

    const originalReserve = tank.reserveInfantryAssault.bind(tank);
    const originalCancel = tank.cancelInfantryAssault.bind(tank);
    tank.reserveInfantryAssault = function tracedReserve(unit, gameArg, options) {
      const result = originalReserve(unit, gameArg, options);
      if (result) trace.reserveCalls += 1;
      return result;
    };
    tank.cancelInfantryAssault = function tracedCancel(reason) {
      inc(trace.cancelReasons, reason || "unknown");
      return originalCancel(reason);
    };

    for (let step = 0; step < DURATION_SECONDS / DT; step += 1) {
      game.matchTime = round((game.matchTime || 0) + DT, 4);
      const order = attacker.ai.resolveOrder();
      const tankDistance = distance(attacker, tank);
      const contact = attacker.ai.selectTarget();
      const reason = startBlockReason(attacker.ai, tank, tankDistance, order, contact);
      if (!tank.infantryAssault) inc(trace.startBlockReasons, reason);

      attacker.update(game, DT);
      if (spec.tankAi) tank.update(game, DT);
      else tank.updateInfantryAssault(game, DT);

      const activeSlot = tank.assaultSlotPoint(attacker, game, tank.infantryAssault?.slotIndex ?? spec.slotIndex);
      const activeProgress = round(tank.infantryAssault?.progress || 0);
      if (activeProgress >= 3 && trace.progress3At === null) trace.progress3At = round(game.matchTime, 2);
      if (activeProgress >= 7 && trace.progress7At === null) trace.progress7At = round(game.matchTime, 2);
      trace.maxMobilityTimer = Math.max(trace.maxMobilityTimer, tank.assaultMobilityTimer || 0);
      trace.maxDisabledTimer = Math.max(trace.maxDisabledTimer, tank.assaultDisabledTimer || 0);
      inc(trace.stateCounts, attacker.ai.state);
      if (step % 3 === 0 || tank.infantryAssault) {
        trace.samples.push({
          t: round(game.matchTime, 2),
          state: attacker.ai.state,
          phase: tank.infantryAssault?.phase || "",
          progress: activeProgress,
          hasReservation: Boolean(tank.infantryAssault),
          slotDistance: round(distance(attacker, activeSlot), 2),
          tankDistance: round(distance(attacker, tank), 2),
          tankSpeed: round(tank.speed || 0, 2)
        });
      }
    }

    return {
      summary: summarizeTrace(trace),
      trace
    };
  }

  waitForGame().then((game) => {
    const original = {
      tanks: game.tanks,
      humvees: game.humvees,
      infantry: game.infantry,
      crews: game.crews,
      drones: game.drones,
      capturePoints: game.capturePoints,
      commanders: game.commanders,
      world: game.world,
      matchStarted: game.matchStarted,
      matchTime: game.matchTime,
      result: game.result,
      testLabAiPaused: game.testLabAiPaused
    };

    game.world = {
      width: 2200,
      height: 2200,
      obstacles: [],
      scenery: [],
      roads: [],
      terrainPatches: [],
      safeZones: [],
      reconPoints: []
    };
    game.effects = game.effects || {};
    game.effects.smokeClouds = [];

    const specs = [
      { name: "slot-plus-40", startOffset: 40, slotIndex: 2 },
      { name: "slot-plus-78", startOffset: 78, slotIndex: 2 },
      { name: "attached-start", startOffset: 10, slotIndex: 2 },
      { name: "repel-ai", startOffset: 40, slotIndex: 2, tankAi: true }
    ];
    const scenarios = specs.map((spec) => runScenario(game, spec));
    Object.assign(game, original);

    const summaries = scenarios.map((item) => item.summary);
    const baseline = summaries.find((item) => item.name === "slot-plus-40");
    const attached = summaries.find((item) => item.name === "attached-start");
    const repelAi = summaries.find((item) => item.name === "repel-ai");
    const ok = Boolean(
      baseline?.started &&
      baseline?.maxProgress >= 3 &&
      attached?.completed &&
      repelAi?.started &&
      repelAi?.maxProgress >= 3
    );
    resolve({ ok, summaries, scenarios });
  }).catch(reject);
})
`;
}

function markdown(result, outDir) {
  return [
    "# Infantry Tank Assault Probe",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Output: ${outDir}`,
    "Measurement: headless Chrome runtime, isolated map, direct infantry/tank update loop.",
    "Behavior change: none. The probe observes tank assault reservation, approach, climb, and plant progress.",
    "",
    "| Scenario | Started | Max Progress | Progress 3 | Progress 7 | Completed | Final State | Block Reasons | Cancel Reasons |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |",
    ...result.summaries.map((item) => (
      `| ${item.name} | ${item.started} | ${item.maxProgress} | ${item.progress3At ?? ""} | ${item.progress7At ?? ""} | ${item.completed} | ${item.finalState} | ${JSON.stringify(item.startBlockReasons)} | ${JSON.stringify(item.cancelReasons)} |`
    )),
    "",
    "```json",
    JSON.stringify(result.summaries, null, 2),
    "```",
    ""
  ].join("\n");
}

async function main() {
  fs.mkdirSync(userDataDir, { recursive: true });
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
    const build = await waitForApp();
    const page = await waitForCdpPage();
    client = await connectCdp(page.webSocketDebuggerUrl);
    await client.send("Runtime.enable");
    const result = await evaluate(client, pageScenario(durationSeconds), 45000);
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const outDir = path.join(root, "reports", "playtests", `tank-assault-${stamp}`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify({ build, ...result }, null, 2));
    fs.writeFileSync(path.join(outDir, "report.md"), markdown(result, outDir));
    console.log(JSON.stringify(result.summaries, null, 2));
    console.log(`Report: ${path.join(outDir, "report.md")}`);
    if (!result.ok) process.exitCode = 1;
  } finally {
    if (client) client.close();
    chrome.kill();
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const resolved = path.resolve(userDataDir);
    if (resolved.startsWith(root) && fs.existsSync(resolved)) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
