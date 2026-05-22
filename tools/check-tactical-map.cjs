"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_TACTICAL_MAP_QA_PORT || 4201);
const cdpPort = Number(process.env.IRONLINE_TACTICAL_MAP_QA_CDP_PORT || 9236);
const appUrl = `http://127.0.0.1:${appPort}/index.html`;
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const userDataDir = path.join(root, ".tmp-chrome-tactical-map-qa");

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

  waitForGame().then((game) => {
    document.querySelector("#entryEnterButton")?.click?.();
    setTimeout(() => {
      document.querySelector("#deploymentStart")?.click?.();
      const startedAt = Date.now();
      const waitForLive = () => {
        if (!game.matchStarted && Date.now() - startedAt <= 9000) {
          setTimeout(waitForLive, 100);
          return;
        }

        game.tacticalMap?.rebuild?.("qa");
        const summary = game.tacticalMap?.summary?.() || null;
        const debugSnapshot = game.tacticalMap?.debugSnapshot?.(120) || null;
        const objective = game.capturePoints?.[0] || null;
        const firstCover = game.tacticalMap?.coverNodes?.[0] || null;
        const coverThreat = firstCover
          ? {
            x: firstCover.x + Math.cos(firstCover.defenseAngle || 0) * 420,
            y: firstCover.y + Math.sin(firstCover.defenseAngle || 0) * 420
          }
          : null;
        const syntheticUnit = firstCover
          ? {
            id: "qa-unit",
            callSign: "qa-unit",
            team: "blue",
            x: firstCover.x + 18,
            y: firstCover.y + 12,
            radius: 8,
            alive: true
          }
          : null;
        const bestCover = syntheticUnit && coverThreat
          ? game.tacticalMap.bestCoverNodeFor(syntheticUnit, coverThreat, {
            maxDistance: 160,
            requireAvailable: false,
            requireCovered: false
          })
          : null;
        const stagingPoint = objective
          ? game.tacticalMap?.stagingPointForObjective?.("blue", objective)
          : null;
        const vehicleStage = game.tacticalMap?.vehicleStagingPoints?.[0] || null;
        const rallyPoint = objective
          ? game.tacticalMap?.rallyPointFor?.("blue", objective, {
            maxDistance: 2200
          })
          : null;
        const firstTraffic = game.tacticalMap?.trafficHints?.[0] || null;
        const trafficHint = firstTraffic
          ? game.tacticalMap.vehicleHintNear(firstTraffic, { maxDistance: 120 })
          : null;
        const debugToggle = game.setDebugOption?.("tacticalMap", true);
        const observer = game.observerBridge?.createSnapshot?.();
        const observatory = game.aiObservatory?.collect?.() || game.aiObservatory?.latest?.();
        const coverNode = bestCover || firstCover || null;
        const pass = Boolean(
          game.matchStarted &&
          summary &&
          summary.mapId === "map01" &&
          String(summary.mapVersion || "").length > 0 &&
          summary.coverNodes >= 20 &&
          summary.stagingPoints >= 4 &&
          summary.vehicleStagingPoints >= 1 &&
          summary.rallyPoints >= 4 &&
          summary.trafficHints >= 1 &&
          summary.dangerZones >= Math.max(1, game.capturePoints?.length || 0) &&
          summary.fireLanes >= 1 &&
          debugSnapshot?.coverNodes?.length > 0 &&
          Boolean(coverNode?.coverNodeId || coverNode?.id) &&
          stagingPoint?.id &&
          vehicleStage?.id &&
          rallyPoint?.id &&
          trafficHint?.id &&
          debugToggle === true &&
          game.debug?.tacticalMap === true &&
          observatory?.tacticalMap?.coverNodes === summary.coverNodes &&
          observer?.world?.tacticalMap?.coverNodes === summary.coverNodes
        );

        resolve({
          pass,
          matchStarted: game.matchStarted,
          phase: game.matchPhase || "",
          summary,
          checks: {
            mapMetadata: {
              mapId: summary?.mapId || "",
              mapVersion: summary?.mapVersion || "",
              manualTags: summary?.manualTags ?? null
            },
            coverNode: {
              id: coverNode?.coverNodeId || coverNode?.id || "",
              sourceKind: coverNode?.sourceKind || "",
              hasDefenseAngle: Number.isFinite(coverNode?.defenseAngle),
              capacity: coverNode?.capacity || 0,
              exposureRisk: coverNode?.exposureRisk ?? null
            },
            stagingPoint: stagingPoint ? {
              id: stagingPoint.id,
              kind: stagingPoint.kind,
              team: stagingPoint.team || "",
              objectiveName: stagingPoint.objectiveName || ""
            } : null,
            vehicleStage: vehicleStage ? {
              id: vehicleStage.id,
              kind: vehicleStage.kind,
              team: vehicleStage.team || "",
              vehicleId: vehicleStage.vehicleId || "",
              vehicleKind: vehicleStage.vehicleKind || ""
            } : null,
            rallyPoint: rallyPoint ? {
              id: rallyPoint.id,
              kind: rallyPoint.kind,
              team: rallyPoint.team || "",
              objectiveName: rallyPoint.objectiveName || ""
            } : null,
            trafficHint: trafficHint ? {
              id: trafficHint.id,
              kind: trafficHint.kind,
              reason: trafficHint.reason || "",
              priority: trafficHint.priority || 0
            } : null,
            debugToggle,
            observatoryTacticalMap: observatory?.tacticalMap || null,
            observerTacticalMap: observer?.world?.tacticalMap || null
          }
        });
      };
      waitForLive();
    }, 120);
  }).catch(reject);
})
`;

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
  ], {
    stdio: "ignore"
  });

  let client = null;
  try {
    const build = await waitForApp();
    const page = await waitForCdpPage();
    client = await connectCdp(page.webSocketDebuggerUrl);
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    const scenario = await evaluate(client, pageScenario, 14000);
    const result = {
      ok: Boolean(scenario.pass),
      url: appUrl,
      build: {
        commit: build.commit || "",
        branch: build.branch || ""
      },
      ...scenario
    };
    console.log(JSON.stringify(result, null, 2));
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
  console.error(error);
  process.exit(1);
});
