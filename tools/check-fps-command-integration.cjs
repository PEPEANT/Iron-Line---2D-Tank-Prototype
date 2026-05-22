"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_QA_PORT || 4197);
const cdpPort = Number(process.env.IRONLINE_QA_CDP_PORT || 9232);
const appUrl = `http://127.0.0.1:${appPort}/index.html`;
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const userDataDir = path.join(root, ".tmp-chrome-fps-command-qa");

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
    const player = game.localSessionPlayer();
    const roleBefore = {
      slotId: player.slotId,
      roleId: player.roleId,
      classId: game.player.classId,
      weaponInventory: (game.player.weaponInventory || []).slice(),
      weaponId: game.player.getWeapon?.()?.id || ""
    };
    const assignedArmor = game.assignPlayerToSlot(player.id, "blue-armor");
    const roleAfterArmor = {
      slotId: player.slotId,
      roleId: player.roleId,
      classId: game.player.classId,
      weaponInventory: (game.player.weaponInventory || []).slice(),
      weaponId: game.player.getWeapon?.()?.id || ""
    };
    const restored = game.assignPlayerToSlot(player.id, roleBefore.slotId || "blue-infantry");
    const roleLoadout = {
      before: roleBefore,
      afterArmor: roleAfterArmor,
      assignedArmor,
      restored,
      sameClass: roleBefore.classId === roleAfterArmor.classId,
      sameInventory: JSON.stringify(roleBefore.weaponInventory) === JSON.stringify(roleAfterArmor.weaponInventory),
      sameWeapon: roleBefore.weaponId === roleAfterArmor.weaponId
    };

    document.querySelector("#entryEnterButton")?.click?.();
    setTimeout(() => {
      document.querySelector("#deploymentStart")?.click?.();
      const startedAt = Date.now();
      const waitForLive = () => {
        if (game.matchStarted || Date.now() - startedAt > 9000) {
          const setup = {
            matchStarted: game.matchStarted,
            phase: game.matchPhase,
            slotId: game.localSessionPlayer()?.slotId || ""
          };

          const slot = game.sessionSlotById(game.localSessionPlayer()?.slotId);
          const squadId = slot?.squadIds?.[0] || "";
          const weapon = game.player.getWeapon?.();
          const ammoKey = weapon?.ammoKey || "";
          const ammoBefore = ammoKey ? game.player.equipmentAmmo?.[ammoKey] || 0 : null;

          game.player.rifleCooldown = 0;
          game.input.mouse.worldX = game.player.x + 520;
          game.input.mouse.worldY = game.player.y;
          game.input.setMouseButton(0, true);
          game.input.mouse.pressedButtons.add(0);
          game.updatePlayer(0.05);
          game.input.setMouseButton(0, false);
          game.input.endFrame();
          const ammoAfterShot = ammoKey ? game.player.equipmentAmmo?.[ammoKey] || 0 : null;

          game.hud.toggleCommandRadio(true);
          const radioOpenBeforeCommand = Boolean(game.hud.commandRadio?.open);
          const x0 = game.player.x;
          const y0 = game.player.y;
          game.input.keys.add("KeyD");
          for (let i = 0; i < 8; i += 1) game.updatePlayer(0.05);
          game.input.keys.delete("KeyD");
          const movedDistance = Math.hypot(game.player.x - x0, game.player.y - y0);

          const radio = game.hud.commandRadio;
          radio.selectedType = "assault";
          radio.selectedSquads.clear();
          if (squadId) radio.selectedSquads.add(squadId);
          const commandResult = game.hud.submitCurrentCommand(game, { x: game.player.x + 90, y: game.player.y }, "", {});
          game.hud.showCommandResult(commandResult);
          game.hud.update(game);
          const squad = game.squadById?.(squadId);
          const commandLockRemaining = squad?.commandLockUntil
            ? Math.max(0, (squad.commandLockUntil - performance.now()) / 1000)
            : 0;

          game.player.rifleCooldown = 0;
          const ammoBeforeSecond = ammoKey ? game.player.equipmentAmmo?.[ammoKey] || 0 : null;
          game.input.setMouseButton(0, true);
          game.input.mouse.pressedButtons.add(0);
          game.updatePlayer(0.05);
          game.input.setMouseButton(0, false);
          game.input.endFrame();
          const ammoAfterSecond = ammoKey ? game.player.equipmentAmmo?.[ammoKey] || 0 : null;

          const integration = {
            slotId: slot?.id || "",
            roleId: slot?.roleId || "",
            squadId,
            weaponId: weapon?.id || "",
            ammoBefore,
            ammoAfterShot,
            shotConsumedAmmo: ammoBefore !== null ? ammoAfterShot < ammoBefore : true,
            radioOpenBeforeCommand,
            movedDistance,
            movedWhileRadioOpen: movedDistance > 1,
            commandAccepted: Boolean(commandResult?.accepted),
            commandState: squad?.commandState || "",
            commandSource: squad?.commandSource || squad?.order?.commandSource || "",
            commandReason: squad?.commandReason || squad?.order?.commandReason || "",
            commandLockRemaining,
            ammoBeforeSecond,
            ammoAfterSecond,
            firedAfterCommand: ammoBeforeSecond !== null ? ammoAfterSecond < ammoBeforeSecond : true,
            weaponState: document.querySelector("#weaponState")?.textContent || "",
            reloadWidth: document.querySelector("#reloadBar")?.style?.width || "",
            commandLog: document.querySelector("#commandLog")?.innerText || ""
          };

          game.hud.toggleCommandRadio(true);
          game.hud.update(game);
          const deathBefore = {
            radioOpen: Boolean(game.hud.commandRadio?.open),
            panelClass: document.querySelector("#commandPanel")?.className || ""
          };
          game.applyPlayerDamage(999, { x: game.player.x - 200, y: game.player.y }, "rifle", {
            deathReason: "QA forced rifle death"
          });
          const lastDamageBeforeExpiry = game.lastPlayerDamage
            ? { label: game.lastPlayerDamage.label, kind: game.lastPlayerDamage.kind, amount: game.lastPlayerDamage.amount }
            : null;
          game.updateCombatFeedback(3);
          game.hud.update(game);

          const deathCommand = {
            before: deathBefore,
            playerDeathActive: Boolean(game.playerDeathActive),
            playerDeathReason: game.playerDeathReason || game.playerPendingDeathReason || "",
            radioOpenAfter: Boolean(game.hud.commandRadio?.open),
            panelClassAfter: document.querySelector("#commandPanel")?.className || "",
            deathScreenClass: document.querySelector("#deathScreen")?.className || "",
            lastDamageBeforeExpiry,
            inputCleared: (game.input.keys?.size || 0) === 0 && game.input.mouse?.leftDown === false
          };

          const pass = Boolean(
            roleLoadout.assignedArmor &&
            roleLoadout.restored &&
            roleLoadout.sameClass &&
            roleLoadout.sameInventory &&
            roleLoadout.sameWeapon &&
            setup.matchStarted &&
            integration.shotConsumedAmmo &&
            integration.radioOpenBeforeCommand &&
            integration.movedWhileRadioOpen &&
            integration.commandAccepted &&
            integration.commandState === "assault" &&
            integration.commandLockRemaining > 0.5 &&
            integration.firedAfterCommand &&
            integration.reloadWidth === "0%" &&
            integration.commandLog.includes("돌격") &&
            deathCommand.playerDeathActive &&
            deathCommand.lastDamageBeforeExpiry &&
            deathCommand.inputCleared &&
            deathCommand.panelClassAfter.includes("hidden")
          );

          resolve({ roleLoadout, setup, integration, deathCommand, pass });
          return;
        }
        setTimeout(waitForLive, 100);
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
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
