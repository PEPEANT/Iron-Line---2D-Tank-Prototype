"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_AI_PACING_QA_PORT || 4200);
const cdpPort = Number(process.env.IRONLINE_AI_PACING_QA_CDP_PORT || 9235);
const appUrl = `http://127.0.0.1:${appPort}/index.html`;
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const userDataDir = path.join(root, ".tmp-chrome-ai-pacing-qa");

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
    const IronLine = window.IronLine;
    const { TEAM } = IronLine.constants;
    const config = IronLine.InfantryAIConfig;
    const unit = new IronLine.InfantryUnit({
      x: 320,
      y: 320,
      team: TEAM.BLUE,
      callSign: "QA-PACE",
      weaponId: "rifle"
    });
    const ai = new IronLine.InfantryAI(unit, game);
    unit.ai = ai;

    const orderPoint = { x: 980, y: 320, stopDistance: 24, radius: 120 };
    ai.order = { id: "qa-pace", point: orderPoint, squadStatus: {} };
    ai.state = "advance";
    ai.target = null;
    ai.awarenessTarget = null;
    unit.lastThreat = null;

    const farTempo = ai.shouldUseMovementTempo(orderPoint, 620);
    ai.resetMovementTempo(ai.movementTempoKeyFor(orderPoint), orderPoint);
    ai.moveBurstTimer = 0;
    ai.observePauseTimer = 0;
    const farPause = ai.applyMovementTempo(0.25, orderPoint, 620);

    const nearObjectiveTempo = ai.shouldUseMovementTempo(orderPoint, 130);

    const contact = { x: 640, y: 320, team: TEAM.RED };
    ai.target = contact;
    ai.resetMovementTempo(ai.movementTempoKeyFor(orderPoint), orderPoint);
    ai.moveBurstTimer = 0;
    ai.observePauseTimer = 0;
    const contactTempo = ai.shouldUseMovementTempo(orderPoint, 460);
    const contactPause = ai.applyMovementTempo(0.25, orderPoint, 460);

    ai.target = null;
    ai.awarenessTarget = null;
    unit.lastThreat = null;
    ai.state = "recon-move";
    const reconTempo = ai.shouldUseMovementTempo(orderPoint, 620);

    const result = {
      config: {
        moveBurstMin: config.moveBurstMin,
        moveBurstMax: config.moveBurstMax,
        observePauseMin: config.observePauseMin,
        observePauseMax: config.observePauseMax
      },
      farTempo,
      farPause,
      nearObjectiveTempo,
      contactTempo,
      contactPause,
      observePauseTimer: ai.observePauseTimer,
      reconTempo,
      pass: Boolean(
        farTempo === false &&
        farPause === false &&
        nearObjectiveTempo === true &&
        contactTempo === true &&
        contactPause === true &&
        ai.observePauseTimer > 0 &&
        reconTempo === true &&
        config.moveBurstMin >= 1.8 &&
        config.moveBurstMax >= 3 &&
        config.observePauseMin <= 0.2 &&
        config.observePauseMax <= 0.4
      )
    };
    resolve(result);
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
