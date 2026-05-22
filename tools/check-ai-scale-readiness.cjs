"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_SCALE_QA_PORT || 4202);
const cdpPort = Number(process.env.IRONLINE_SCALE_QA_CDP_PORT || 9237);
const appUrl = `http://127.0.0.1:${appPort}/index.html`;
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const userDataDir = path.join(root, ".tmp-chrome-ai-scale-qa");

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

  const waitFrames = (count) => new Promise((done) => {
    let frames = 0;
    const step = () => {
      frames += 1;
      if (frames >= count) done();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  waitForGame().then((game) => {
    const profiles = game.aiScaleReadiness?.profiles?.() || [];
    const apply = game.aiScaleReadiness?.applyProfile?.("ai-8v8") || { accepted: false, reason: "missing-scale-readiness" };
    document.querySelector("#entryEnterButton")?.click?.();
    setTimeout(() => {
      document.querySelector("#deploymentStart")?.click?.();
      const startedAt = Date.now();
      const waitForLive = () => {
        if (!game.matchStarted && Date.now() - startedAt <= 9000) {
          setTimeout(waitForLive, 100);
          return;
        }

        waitFrames(90).then(() => {
          const snapshot = game.aiScaleReadiness?.snapshot?.({ includeNetwork: true }) || null;
          const evaluation = game.aiScaleReadiness?.evaluate?.("ai-8v8", { includeNetwork: true }) || null;
          const observer = game.observerBridge?.createSnapshot?.();
          const observatory = game.aiObservatory?.collect?.() || game.aiObservatory?.latest?.();
          const profileIds = profiles.map((profile) => profile.id);
          const eventProfile = profiles.find((profile) => profile.id === "ai-50v50-event") || null;
          const lodTotal = ["detailed", "normal", "reduced", "idle"].reduce((sum, key) => sum + (snapshot?.lod?.[key] || 0), 0);
          const finitePerf = snapshot?.performance &&
            Number.isFinite(snapshot.performance.frameMs) &&
            Number.isFinite(snapshot.performance.aiMs) &&
            Number.isFinite(snapshot.performance.structuralAiMs) &&
            Number.isFinite(snapshot.performance.tacticalMapMs) &&
            Number.isFinite(snapshot.performance.renderMs) &&
            Number.isFinite(snapshot.performance.pathfindingAndMovementMs);
          const pass = Boolean(
            game.matchStarted &&
            apply.accepted &&
            game.matchConfig?.aiDensityPreset === "ai-8v8" &&
            game.matchConfig?.blueInfantry === 8 &&
            game.matchConfig?.redInfantry === 8 &&
            profileIds.includes("ai-8v8") &&
            profileIds.includes("ai-15v15") &&
            profileIds.includes("ai-25v25") &&
            eventProfile?.eventOnly === true &&
            snapshot?.counts?.infantry >= 16 &&
            snapshot?.counts?.vehicles >= 2 &&
            lodTotal > 0 &&
            finitePerf &&
            snapshot.performance.networkSnapshotBytes > 0 &&
            snapshot.snapshotPolicy?.sendFullUnitDetailEveryTick === false &&
            evaluation?.pass === true &&
            observer?.world?.aiScaleReadiness?.counts?.infantry >= 16 &&
            observatory?.aiScaleReadiness?.counts?.infantry >= 16
          );

          resolve({
            pass,
            apply,
            profiles,
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
            observatoryScale: observatory?.aiScaleReadiness || null
          });
        }).catch(reject);
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
    const scenario = await evaluate(client, pageScenario, 16000);
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
