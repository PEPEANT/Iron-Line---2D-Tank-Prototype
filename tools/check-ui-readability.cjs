"use strict";

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_UI_READABILITY_PORT || 4195);
const cdpPort = Number(process.env.IRONLINE_UI_READABILITY_CDP_PORT || 9235);
const appUrl = `http://127.0.0.1:${appPort}/index.html`;
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const userDataDir = path.join(root, ".tmp-chrome-ui-readability");
const scaleProfileId = process.env.IRONLINE_UI_READABILITY_SCALE_PROFILE || "ai-25v25";

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

async function evaluate(client, expression, timeout = 14000) {
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

const pageScenario = `
new Promise((resolve, reject) => {
  const scaleProfileId = ${JSON.stringify(scaleProfileId)};
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
    const scaleApply = game.aiScaleReadiness?.applyProfile?.(scaleProfileId) || {
      accepted: false,
      reason: "missing-scale-readiness"
    };
    document.querySelector("#entryEnterButton")?.click?.();
    setTimeout(() => {
      document.querySelector("#deploymentStart")?.click?.();
      const startedAt = Date.now();
      const waitForLive = () => {
        if (!game.matchStarted && Date.now() - startedAt < 9000) {
          setTimeout(waitForLive, 100);
          return;
        }

        const localPlayer = game.localSessionPlayer?.();
        const slot = game.sessionSlotById?.(localPlayer?.slotId || "blue-infantry");
        const squadId = slot?.squadIds?.[0] || "";
        game.hud?.update?.(game);
        const scaleSnapshot = game.aiScaleReadiness?.snapshot?.({ includeNetwork: true }) || null;
        const scaleProfiles = game.aiScaleReadiness?.profiles?.() || [];
        const eventProfile = scaleProfiles.find((profile) => profile.id === "ai-50v50-event") || null;

        const strip = document.querySelector("#hudReadabilityStrip");
        const objectiveBox = document.querySelector("#objectiveStrip")?.getBoundingClientRect();
        const stripBox = strip?.getBoundingClientRect();
        const initial = {
          matchStarted: game.matchStarted,
          scaleProfileId,
          scaleApplied: Boolean(scaleApply.accepted),
          scaleApplyReason: scaleApply.reason || "",
          aiCounts: scaleSnapshot?.counts || null,
          eventProfileOnly: Boolean(eventProfile?.eventOnly),
          stripExists: Boolean(strip),
          stripVisible: Boolean(strip && !strip.classList.contains("hidden")),
          roleText: document.querySelector("#hudReadabilityRole")?.textContent || "",
          commandText: document.querySelector("#hudReadabilityCommand")?.textContent || "",
          combatText: document.querySelector("#hudReadabilityCombat")?.textContent || "",
          feedText: document.querySelector("#hudReadabilityFeed")?.textContent || "",
          noTopOverlap: Boolean(objectiveBox && stripBox && stripBox.top >= objectiveBox.bottom - 1)
        };

        const radio = game.hud.commandRadio;
        radio.selectedType = "assault";
        radio.selectedSquads.clear();
        if (squadId) radio.selectedSquads.add(squadId);
        const commandResult = game.hud.submitCurrentCommand(game, { x: game.player.x + 100, y: game.player.y }, "", {});
        game.hud.showCommandResult(commandResult);
        game.hud.update(game);
        const commanded = {
          accepted: Boolean(commandResult?.accepted),
          commandText: document.querySelector("#hudReadabilityCommand")?.textContent || "",
          commandState: strip?.dataset.commandState || "",
          commandLogMaxHeight: getComputedStyle(document.querySelector("#commandLog")).maxHeight || "",
          commandLogOverflow: getComputedStyle(document.querySelector("#commandLog")).overflowY || getComputedStyle(document.querySelector("#commandLog")).overflow || ""
        };

        game.battlefieldEvents?.push?.({
          type: "score_kill",
          severity: "major",
          detail: "QA kill feed event"
        });
        game.hud.update(game);
        const feed = {
          text: document.querySelector("#hudReadabilityFeed")?.textContent || "",
          includesEvent: (document.querySelector("#hudReadabilityFeed")?.textContent || "").includes("QA kill")
        };

        game.applyPlayerDamage?.(5, { x: game.player.x - 120, y: game.player.y }, "rifle", { ttl: 1.4 });
        game.hud.update(game);
        const damage = {
          text: document.querySelector("#hudReadabilityCombat")?.textContent || "",
          showsHit: (document.querySelector("#hudReadabilityCombat")?.textContent || "").includes("hit:")
        };

        game.sessionMode = "online";
        game.onlineSession = game.onlineSession || {};
        Object.assign(game.onlineSession, {
          playerId: "blue-human",
          players: [
            {
              id: "blue-human",
              name: "Blue",
              team: "blue",
              slotId: "blue-infantry",
              roleId: "infantry",
              participantType: "player",
              ready: true,
              stats: { kills: 0, deaths: 0 },
              position: { x: game.player.x, y: game.player.y, alive: true, deathState: "alive" }
            },
            {
              id: "red-human",
              name: "Red",
              team: "red",
              slotId: "red-armor",
              roleId: "armor",
              participantType: "player",
              ready: true,
              stats: { kills: 0, deaths: 1 },
              position: { x: game.player.x + 300, y: game.player.y, alive: false, deathState: "dead" }
            }
          ],
          spectators: []
        });
        const remote = game.onlineSession.players[1];
        const row = game.hud.scoreboardRosterRow(game, remote);
        const mapPoint = game.hud.humanMapPoint(game, remote);
        const scoreboard = {
          statusClass: row.statusClass,
          role: row.role,
          remoteMapAlive: mapPoint?.alive !== false
        };

        const pass = Boolean(
          initial.matchStarted &&
          initial.scaleApplied &&
          initial.eventProfileOnly &&
          initial.stripExists &&
          initial.stripVisible &&
          initial.roleText.includes("Infantry") &&
          initial.noTopOverlap &&
          commanded.accepted &&
          commanded.commandState === "assault" &&
          commanded.commandText.includes("assault") &&
          commanded.commandLogMaxHeight !== "none" &&
          commanded.commandLogOverflow === "hidden" &&
          feed.includesEvent &&
          damage.showsHit &&
          scoreboard.statusClass === "dead" &&
          scoreboard.role === "Armor" &&
          scoreboard.remoteMapAlive === false
        );

        resolve({ initial, commanded, feed, damage, scoreboard, pass });
      };
      waitForLive();
    }, 120);
  }).catch(reject);
})
`;

const mobileScenario = String.raw`
new Promise((resolve) => {
  requestAnimationFrame(() => {
    document.body.classList.add("mobile-controls-active");
    const strip = document.querySelector("#hudReadabilityStrip");
    const remoteMarker = document.createElement("div");
    remoteMarker.className = "map-marker player-human remote";
    const remoteName = document.createElement("span");
    remoteName.className = "map-marker-name";
    remoteName.textContent = "Remote Player";
    remoteMarker.append(remoteName);
    document.body.append(remoteMarker);

    const localMarker = document.createElement("div");
    localMarker.className = "map-marker player-human local";
    const localName = document.createElement("span");
    localName.className = "map-marker-name";
    localName.textContent = "Local Player";
    localMarker.append(localName);
    document.body.append(localMarker);

    const stripStyle = strip ? getComputedStyle(strip) : null;
    const stripBox = strip?.getBoundingClientRect?.();
    const result = {
      viewportWidth: window.innerWidth,
      stripVisible: Boolean(strip && !strip.classList.contains("hidden")),
      stripWithinViewport: Boolean(stripBox && stripBox.width <= window.innerWidth * 0.98),
      stripUsesMobileGrid: Boolean(stripStyle?.gridTemplateColumns?.split(" ").length <= 3),
      remoteMarkerNameDisplay: getComputedStyle(remoteName).display,
      localMarkerNameDisplay: getComputedStyle(localName).display,
      pass: false
    };
    result.pass = Boolean(
      result.stripVisible &&
      result.stripWithinViewport &&
      result.stripUsesMobileGrid &&
      result.remoteMarkerNameDisplay === "none" &&
      result.localMarkerNameDisplay !== "none"
    );
    remoteMarker.remove();
    localMarker.remove();
    document.body.classList.remove("mobile-controls-active");
    resolve(result);
  });
})
`;

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
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 740,
      deviceScaleFactor: 2,
      mobile: true
    });
    const mobile = await evaluate(client, mobileScenario, 6000);
    const result = {
      ok: Boolean(scenario.pass && mobile.pass),
      url: appUrl,
      build: {
        commit: build.commit || "",
        branch: build.branch || ""
      },
      ...scenario,
      mobile
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
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
