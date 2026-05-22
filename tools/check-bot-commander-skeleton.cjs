"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_BOT_QA_PORT || 4198);
const cdpPort = Number(process.env.IRONLINE_BOT_QA_CDP_PORT || 9233);
const appUrl = `http://127.0.0.1:${appPort}/index.html`;
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const userDataDir = path.join(root, ".tmp-chrome-bot-commander-qa");

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

        const bot = game.botCommander;
        const slots = game.onlineSession?.roleSlots || [];
        const roleChecks = [
          { roleId: "infantry", type: "move", expectedState: "advance" },
          { roleId: "engineer", type: "repair", expectedState: "repair" },
          { roleId: "recon", type: "scan", expectedState: "scout" },
          { roleId: "armor", type: "fire_support", expectedState: "cover" }
        ];
        const slotForRole = (roleId) => slots.find((slot) => (
          slot?.roleId === roleId &&
          !slot.playerId &&
          slot.controllerType === "bot" &&
          bot?.slotHasAssets?.(slot)
        ));
        const humanSlot = game.sessionSlotById("blue-infantry") || slots.find((slot) => slot.playerId && slot.controllerType === "human");
        const engineerSlot = slotForRole("engineer") || game.sessionSlotById("blue-engineer");
        const emptySlotProbe = game.sessionSlotById("blue-recon") || slots.find((slot) => !slot.playerId && slot.controllerType === "bot");
        const beforeHuman = {
          slotId: humanSlot?.id || "",
          playerId: humanSlot?.playerId || "",
          controllerType: humanSlot?.controllerType || "",
          botSlot: bot?.isBotSlot?.(humanSlot) || false
        };
        const beforeBot = {
          slotId: engineerSlot?.id || "",
          playerId: engineerSlot?.playerId || "",
          controllerType: engineerSlot?.controllerType || "",
          squadIds: (engineerSlot?.squadIds || []).slice(),
          vehicleIds: (engineerSlot?.vehicleIds || []).slice(),
          botSlot: bot?.isBotSlot?.(engineerSlot) || false
        };
        const humanReject = bot?.issueForSlot?.(humanSlot, { force: true, type: "move" }) || { accepted: false, reason: "missing-bot" };
        const roleResults = roleChecks.map((check) => {
          const slot = slotForRole(check.roleId);
          const result = slot && bot?.issueForSlot?.(slot, { force: true, type: check.type });
          const targetSquadId = result?.squadIds?.[0] || slot?.squadIds?.[0] || "";
          const targetAssetId = result?.vehicleIds?.[0] || slot?.vehicleIds?.[0] || "";
          const squad = targetSquadId ? game.squadById?.(targetSquadId) : null;
          const vehicle = targetAssetId ? game.vehicleById?.(targetAssetId) : null;
          const assignmentOrder = vehicle ? game.commanders?.[slot?.team]?.assignments?.get?.(vehicle) || null : null;
          const vehicleOrder = assignmentOrder || vehicle?.manualOrder || null;
          const state = squad?.commandState || vehicleOrder?.commandState || "";
          const source = squad?.commandSource || vehicleOrder?.commandSource || "";
          const reason = squad?.commandReason || vehicleOrder?.commandReason || "";
          const lockUntil = squad?.commandLockUntil || vehicleOrder?.commandLockUntil || 0;
          const lockRemaining = lockUntil ? Math.max(0, (lockUntil - performance.now()) / 1000) : 0;
          const commanderSlotId = squad?.commanderSlotId || vehicleOrder?.commanderSlotId || vehicle?.manualOrder?.slotId || "";
          const squadLeaderId = squad?.squadLeaderId || "";
          return {
            roleId: check.roleId,
            slotId: slot?.id || "",
            type: check.type,
            expectedState: check.expectedState,
            accepted: Boolean(result?.accepted),
            reasonRejected: result?.reason || "",
            packetControllerType: result?.packet?.controllerType || "",
            packetSource: result?.packet?.commandSource || "",
            commandState: state,
            commandSource: source,
            commandReason: reason,
            commandLockRemaining: lockRemaining,
            commanderSlotId,
            targetSquadId,
            targetAssetId,
            squadLeaderId,
            hasDirectUnitControl: false,
            slotState: slot?.botCommanderState || null,
            pass: Boolean(
              slot &&
              result?.accepted &&
              result.packet?.controllerType === "bot" &&
              result.packet?.commandSource === "bot" &&
              state === check.expectedState &&
              source === "bot" &&
              reason === check.type &&
              lockRemaining > 0.5 &&
              commanderSlotId === slot.id &&
              (targetSquadId || targetAssetId)
            )
          };
        });
        const engineerResult = roleResults.find((item) => item.roleId === "engineer") || {};
        const squadId = engineerResult.targetSquadId || engineerSlot?.squadIds?.[0] || "";
        const commandLockRemaining = engineerResult.commandLockRemaining || 0;

        const originalProbeType = emptySlotProbe?.controllerType || "";
        if (emptySlotProbe) emptySlotProbe.controllerType = "empty";
        const emptyReject = bot?.issueForSlot?.(emptySlotProbe, { force: true, type: "scan" }) || { accepted: false, reason: "missing-bot" };
        if (emptySlotProbe) emptySlotProbe.controllerType = originalProbeType;

        const player = game.localSessionPlayer?.();
        const humanTakeoverSlot = engineerSlot;
        let takeoverSimulated = false;
        let takeoverSlotState = null;
        let takeoverReject = { accepted: false, reason: "missing-slot" };
        if (player && humanTakeoverSlot?.id) {
          const savedTakeoverSlot = {
            playerId: humanTakeoverSlot.playerId,
            controllerType: humanTakeoverSlot.controllerType,
            aiControlled: humanTakeoverSlot.aiControlled
          };
          humanTakeoverSlot.playerId = player.id;
          humanTakeoverSlot.controllerType = "human";
          humanTakeoverSlot.aiControlled = false;
          takeoverSimulated = true;
          takeoverSlotState = {
            slotId: humanTakeoverSlot.id,
            playerId: humanTakeoverSlot.playerId || "",
            controllerType: humanTakeoverSlot.controllerType || "",
            botSlot: bot?.isBotSlot?.(humanTakeoverSlot) || false
          };
          takeoverReject = bot?.issueForSlot?.(humanTakeoverSlot, { force: true, type: "repair" }) || takeoverReject;
          humanTakeoverSlot.playerId = savedTakeoverSlot.playerId;
          humanTakeoverSlot.controllerType = savedTakeoverSlot.controllerType;
          humanTakeoverSlot.aiControlled = savedTakeoverSlot.aiControlled;
        }

        const observer = game.observerBridge?.createSnapshot?.();
        const observedSlot = observer?.roleSlots?.find((slot) => slot.id === "blue-engineer") || null;
        const observedBotSlots = roleResults.map((item) => observer?.roleSlots?.find((slot) => slot.id === item.slotId) || null);
        const latestLog = (game.commandBus?.log || []).slice(-8).map((entry) => ({
          accepted: entry.accepted,
          reason: entry.reason,
          type: entry.packet?.type,
          slotId: entry.packet?.slotId,
          controllerType: entry.packet?.controllerType,
          commandSource: entry.packet?.commandSource,
          summary: entry.summary
        }));

        const botCommand = {
          accepted: Boolean(engineerResult.accepted),
          packetControllerType: engineerResult.packetControllerType || "",
          packetSource: engineerResult.packetSource || "",
          commandState: engineerResult.commandState || "",
          commandSource: engineerResult.commandSource || "",
          commandReason: engineerResult.commandReason || "",
          commandLockRemaining,
          commanderSlotId: engineerResult.commanderSlotId || "",
          squadLeaderId: engineerResult.squadLeaderId || "",
          targetSquadId: squadId,
          slotState: engineerSlot?.botCommanderState || null
        };

        const pass = Boolean(
          game.matchStarted &&
          bot &&
          beforeHuman.controllerType === "human" &&
          beforeHuman.botSlot === false &&
          humanReject.accepted === false &&
          humanReject.reason === "not-bot-slot" &&
          beforeBot.controllerType === "bot" &&
          beforeBot.botSlot === true &&
          roleResults.every((item) => item.pass) &&
          emptyReject.accepted === false &&
          emptyReject.reason === "not-bot-slot" &&
          takeoverSimulated === true &&
          takeoverSlotState?.controllerType === "human" &&
          takeoverSlotState?.botSlot === false &&
          takeoverReject.accepted === false &&
          takeoverReject.reason === "not-bot-slot" &&
          observedBotSlots.every((slot, index) => slot?.controllerType === "bot" && slot?.botCommanderState?.lastCommandType === roleResults[index].type)
        );

        resolve({
          pass,
          matchStarted: game.matchStarted,
          beforeHuman,
          beforeBot,
          humanReject: { accepted: humanReject.accepted, reason: humanReject.reason },
          emptyReject: { accepted: emptyReject.accepted, reason: emptyReject.reason },
          humanTakeover: {
            simulated: takeoverSimulated,
            slotState: takeoverSlotState,
            botReject: { accepted: takeoverReject.accepted, reason: takeoverReject.reason }
          },
          roleResults,
          botCommand,
          observedSlot,
          observedBotSlots,
          latestLog
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
