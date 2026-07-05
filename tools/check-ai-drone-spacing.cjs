"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_DRONE_SPACING_PORT || 4219);
const cdpPort = Number(process.env.IRONLINE_DRONE_SPACING_CDP_PORT || 9259);
const durationSeconds = Number(process.env.IRONLINE_DRONE_SPACING_SECONDS || 12);
const appUrl = `http://127.0.0.1:${appPort}/index.html`;
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const userDataDir = path.join(root, ".tmp-chrome-drone-spacing");

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

async function evaluate(client, expression, timeout = 45000) {
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
        IronLine?.ReconDrone &&
        IronLine?.InfantryUnit &&
        IronLine?.InfantryAI &&
        IronLine?.math
      ) return done(IronLine.game);
      if (Date.now() - startedAt > 9000) return fail(new Error("game missing"));
      setTimeout(tick, 100);
    };
    tick();
  });

  const round = (value, digits = 2) => {
    const scale = 10 ** digits;
    return Math.round((Number(value) || 0) * scale) / scale;
  };

  const distance = (a, b) => Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));

  function minPairDistance(items) {
    let best = Infinity;
    let pair = [];
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const d = distance(items[i], items[j]);
        if (d < best) {
          best = d;
          pair = [items[i].id || items[i].callSign || String(i), items[j].id || items[j].callSign || String(j)];
        }
      }
    }
    return { distance: Number.isFinite(best) ? round(best, 2) : null, pair };
  }

  function runScenario(game) {
    const IronLine = window.IronLine;
    const TEAM = IronLine.constants.TEAM;
    const original = {
      infantry: game.infantry,
      crews: game.crews,
      tanks: game.tanks,
      humvees: game.humvees,
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
      height: 1800,
      obstacles: [],
      scenery: [],
      roads: [],
      terrainPatches: [],
      safeZones: [],
      reconPoints: []
    };
    game.infantry = [];
    game.crews = [];
    game.tanks = [];
    game.humvees = [];
    game.drones = [];
    game.capturePoints = [];
    game.commanders = [];
    game.matchStarted = true;
    game.matchTime = 0;
    game.result = null;
    game.testLabAiPaused = false;

    const target = new IronLine.InfantryUnit({
      x: 1320,
      y: 900,
      team: TEAM.RED,
      classId: "infantry",
      weaponId: "rifle",
      callSign: "R-FOCUS"
    });
    game.infantry.push(target);

    const scouts = [];
    const waypoints = [];
    for (let i = 0; i < 7; i += 1) {
      const unit = new IronLine.InfantryUnit({
        x: 540,
        y: 900,
        team: TEAM.BLUE,
        classId: "scout",
        weaponId: "rifle",
        callSign: "B-UAV-" + i,
        equipmentAmmo: { reconDrone: 1, grenade: 0, rpg: 0, kamikazeDrone: 0, repairKit: 0 }
      });
      const ai = new IronLine.InfantryAI(unit, game);
      ai.seed = i;
      ai.droneCooldown = 0;
      unit.ai = ai;
      game.infantry.push(unit);
      scouts.push(unit);
      const waypoint = ai.aiReconWaypoint(target);
      waypoints.push({ id: unit.callSign, x: waypoint.x, y: waypoint.y });
      ai.launchAiReconDrone(target);
    }

    const samples = [];
    let minAfterSettle = Infinity;
    let minAny = Infinity;
    const steps = Math.ceil(DURATION_SECONDS / DT);
    for (let step = 0; step <= steps; step += 1) {
      const t = step * DT;
      game.matchTime = t;
      for (const drone of game.drones.slice()) drone.update(game, DT);
      const drones = game.drones.filter((drone) => drone.alive);
      const minPair = minPairDistance(drones);
      if (minPair.distance !== null) {
        minAny = Math.min(minAny, minPair.distance);
        if (t >= 2) minAfterSettle = Math.min(minAfterSettle, minPair.distance);
      }
      if (step % 15 === 0 || step === steps) {
        samples.push({
          t: round(t, 2),
          count: drones.length,
          minDistance: minPair.distance,
          pair: minPair.pair
        });
      }
    }

    const waypointMin = minPairDistance(waypoints);
    const finalMin = minPairDistance(game.drones.filter((drone) => drone.alive));
    const summary = {
      launched: game.drones.length,
      waypointMinDistance: waypointMin.distance,
      waypointMinPair: waypointMin.pair,
      minDroneDistanceAny: Number.isFinite(minAny) ? round(minAny, 2) : null,
      minDroneDistanceAfterSettle: Number.isFinite(minAfterSettle) ? round(minAfterSettle, 2) : null,
      finalMinDroneDistance: finalMin.distance,
      finalMinPair: finalMin.pair,
      finalPositions: game.drones.map((drone) => ({
        id: drone.callSign,
        x: round(drone.x, 1),
        y: round(drone.y, 1),
        targetX: round(drone.targetX, 1),
        targetY: round(drone.targetY, 1)
      })),
      waypoints,
      samples
    };

    Object.assign(game, original);
    return summary;
  }

  waitForGame()
    .then((game) => {
      const summary = runScenario(game);
      const ok = Boolean(
        summary.launched === 7 &&
        summary.waypointMinDistance >= 48 &&
        summary.minDroneDistanceAfterSettle >= 32 &&
        summary.finalMinDroneDistance >= 36
      );
      resolve({ ok, summary });
    })
    .catch(reject);
})
`;
}

function markdown(result, outDir) {
  const summary = result.summary;
  return [
    "# AI Drone Spacing Probe",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Output: ${outDir}`,
    "Measurement: headless Chrome isolated 7-scout recon-drone launch.",
    "Behavior change: none. The probe checks recon waypoints and drone pair spacing after launch.",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Launched drones | ${summary.launched} |`,
    `| Min waypoint distance | ${summary.waypointMinDistance} |`,
    `| Min drone distance after settle | ${summary.minDroneDistanceAfterSettle} |`,
    `| Final min drone distance | ${summary.finalMinDroneDistance} |`,
    "",
    "```json",
    JSON.stringify(summary, null, 2),
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
    const result = await evaluate(client, pageScenario(durationSeconds));
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const outDir = path.join(root, "reports", "playtests", `ai-drone-spacing-${stamp}`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify({ build, ...result }, null, 2));
    fs.writeFileSync(path.join(outDir, "report.md"), markdown(result, outDir));
    console.log(JSON.stringify(result.summary, null, 2));
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
