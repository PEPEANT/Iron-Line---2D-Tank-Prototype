"use strict";

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_AI_V2_BEHAVIOR_PORT || 4205);
const cdpPort = Number(process.env.IRONLINE_AI_V2_BEHAVIOR_CDP_PORT || 9245);
const appUrl = `http://127.0.0.1:${appPort}/index.html`;
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const userDataDir = path.join(root, ".tmp-chrome-ai-v2-behavior");

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

async function evaluate(client, expression, timeout = 20000) {
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

  const restoreProps = (target, saved) => {
    for (const [key, value] of Object.entries(saved)) target[key] = value;
  };

  waitForGame().then((game) => {
    game.aiScaleReadiness?.applyProfile?.("ai-15v15");
    document.querySelector("#entryEnterButton")?.click?.();
    setTimeout(() => {
      document.querySelector("#deploymentStart")?.click?.();
      const startedAt = Date.now();
      const waitForLive = () => {
        if (!game.matchStarted && Date.now() - startedAt <= 10000) {
          setTimeout(waitForLive, 100);
          return;
        }

        waitFrames(150).then(() => {
          game.tacticalMap?.rebuild?.("behavior-connection-qa");
          const objective = game.capturePoints?.[0] || null;
          const squad = (game.squads || []).find((item) => item.team === "blue" && item.activeUnits?.().length > 1) ||
            (game.squads || []).find((item) => item.activeUnits?.().length > 1) || null;
          if (squad && objective) {
            squad.assignOrder({
              id: "qa-ai-v2-behavior",
              point: objective,
              objectiveName: objective.name,
              commandSource: "bot",
              commandType: "move"
            });
          }

          const unit = squad?.activeUnits?.().find((item) => item.ai?.findCoverPoint) || null;
          let coverCase = { pass: false, reason: "no-unit" };
          if (unit) {
            const ai = unit.ai;
            const maxDistance = ai.coverSearchRadius?.() || 460;
            const candidates = (game.tacticalMap?.coverNodes || [])
              .map((node) => ({
                node,
                distance: Math.hypot(unit.x - node.x, unit.y - node.y)
              }))
              .filter((item) => item.distance <= maxDistance)
              .sort((a, b) => a.distance - b.distance);
            for (const item of candidates) {
              const node = item.node;
              const threat = {
                x: node.x + Math.cos(node.defenseAngle || 0) * 420,
                y: node.y + Math.sin(node.defenseAngle || 0) * 420
              };
              const selected = ai.findCoverPoint(threat);
              if (selected?.tacticalMapId || selected?.coverNodeId) {
                ai.coverTarget = selected;
                ai.updateDebug?.(selected);
                coverCase = {
                  pass: true,
                  unit: unit.callSign,
                  selectedId: selected.tacticalMapId || selected.coverNodeId || "",
                  exposureRisk: selected.tacticalRisk ?? selected.coverMetrics?.exposure ?? null,
                  coverQuality: selected.coverQuality || 0,
                  accessible: node.accessible !== false,
                  debugId: ai.debug?.tacticalCoverNode || ""
                };
                break;
              }
            }
            if (!coverCase.pass) coverCase = { pass: false, unit: unit.callSign, reason: "no-tactical-cover-selected" };
          }

          const status = squad?.computeStatus?.() || null;
          const expectedStage = squad && objective
            ? game.tacticalMap?.stagingPointForObjective?.(squad.team, objective, {
              kind: "objective-approach"
            })
            : null;
          const staging = squad && objective
            ? squad.preAssaultPoint?.({
              ...status,
              center: expectedStage ? { x: expectedStage.x + 18, y: expectedStage.y + 12 } : status?.center || squad.leaderUnit?.(),
              objectiveDistance: 520
            })
            : null;
          const stagingCase = {
            pass: Boolean(staging?.tacticalMapId),
            expectedId: expectedStage?.id || "",
            objectiveName: objective?.name || "",
            squadOrderObjective: squad?.order?.objectiveName || squad?.order?.point?.name || "",
            id: staging?.tacticalMapId || "",
            name: staging?.name || "",
            risk: staging?.tacticalRisk ?? null
          };

          const tank = (game.tanks || []).find((item) => item.alive && item.team === squad?.team) || null;
          const vehicleStage = tank
            ? (game.tacticalMap?.vehicleStagingPoints || []).find((point) => point.vehicleId === tank.callSign)
            : null;
          const rally = squad && tank && vehicleStage
            ? squad.rallyWithTankPoint?.({
              ...status,
              center: { x: vehicleStage.x + 20, y: vehicleStage.y + 10 },
              friendlyTank: { vehicle: tank, distance: 180 }
            })
            : null;
          const rallyCase = {
            pass: Boolean(rally?.tacticalMapId && rally.tacticalMapKind === "vehicle-stage"),
            id: rally?.tacticalMapId || "",
            kind: rally?.tacticalMapKind || "",
            vehicleId: tank?.callSign || ""
          };

          let riskCase = { pass: false, reason: "missing-squad-or-danger" };
          const danger = game.tacticalMap?.dangerZones?.[0] || null;
          if (squad && objective && danger) {
            const saved = {
              commandSource: squad.commandSource,
              commandLockUntil: squad.commandLockUntil,
              supportRequest: squad.supportRequest
            };
            const riskyStatus = {
              ...status,
              center: { x: danger.x, y: danger.y },
              alive: Math.max(3, status?.alive || 3),
              casualtyRatio: 0.22,
              avgSuppression: 24,
              maxSuppression: 38,
              cohesion: 120,
              mountedCount: 0,
              objectiveDistance: 900,
              friendlyTank: null,
              armorThreat: null,
              lastThreat: { x: danger.x + 220, y: danger.y }
            };
            riskyStatus.tacticalRisk = squad.tacticalRiskAt?.(riskyStatus.center) || 0;
            squad.commandSource = "bot";
            squad.commandLockUntil = 0;
            squad.supportRequest = null;
            const dangerMode = squad.chooseTacticalMode(riskyStatus);
            squad.commandSource = "player";
            squad.commandLockUntil = performance.now() + 1800;
            const lockedMode = squad.chooseTacticalMode(riskyStatus);
            restoreProps(squad, saved);
            riskCase = {
              pass: riskyStatus.tacticalRisk >= 0.5 && dangerMode === "support-fire" && lockedMode !== "support-fire",
              dangerZoneId: danger.id,
              tacticalRisk: Math.round(riskyStatus.tacticalRisk * 100) / 100,
              dangerMode,
              lockedMode
            };
          }

          let vehicleCase = { pass: false, reason: "missing-vehicles-or-hint" };
          const vehicles = [...(game.tanks || []), ...(game.humvees || [])]
            .filter((item) => item.alive && item.team === "blue" && item.ai?.handleTrafficHold);
          const hint = (game.tacticalMap?.trafficHints || []).find((item) => item.kind === "bottleneck") ||
            (game.tacticalMap?.trafficHints || [])[0] || null;
          if (vehicles.length >= 2 && hint) {
            const mover = vehicles[0];
            const occupant = vehicles[1];
            const savedMover = { x: mover.x, y: mover.y, angle: mover.angle, speed: mover.speed };
            const savedOccupant = { x: occupant.x, y: occupant.y, angle: occupant.angle, speed: occupant.speed };
            const ai = mover.ai;
            const savedAi = {
              trafficHoldTimer: ai.trafficHoldTimer,
              trafficHoldTarget: ai.trafficHoldTarget,
              trafficHoldAge: ai.trafficHoldAge,
              trafficBypassTimer: ai.trafficBypassTimer,
              trafficBypassTarget: ai.trafficBypassTarget
            };
            mover.x = hint.x - 150;
            mover.y = hint.y;
            mover.angle = 0;
            mover.speed = 0;
            occupant.x = hint.x;
            occupant.y = hint.y + Math.min(112, (hint.waitRadius || 130) - 12);
            occupant.angle = 0;
            occupant.speed = 0;
            ai.trafficHoldTimer = 0;
            ai.trafficHoldTarget = "";
            ai.trafficHoldAge = 0;
            ai.trafficBypassTimer = 0;
            ai.trafficBypassTarget = "";
            const held = ai.handleTrafficHold(0.18, 1, 0);
            vehicleCase = {
              pass: Boolean(held && String(ai.trafficHoldTarget || "").startsWith("traffic:")),
              hintId: hint.id,
              hintKind: hint.kind,
              held,
              holdTarget: ai.trafficHoldTarget || "",
              debugWaitForClear: ai.debug?.tacticalWaitForClear || ""
            };
            restoreProps(mover, savedMover);
            restoreProps(occupant, savedOccupant);
            restoreProps(ai, savedAi);
          }

          let commandLockCase = { pass: false, reason: "missing-squad" };
          if (squad) {
            const saved = {
              commandState: squad.commandState,
              commandSource: squad.commandSource,
              commandReason: squad.commandReason,
              commandLockUntil: squad.commandLockUntil,
              tacticalMode: squad.tacticalMode
            };
            squad.commandState = "assault";
            squad.commandSource = "player";
            squad.commandReason = "qa-lock";
            squad.commandLockUntil = performance.now() + 2200;
            squad.tacticalMode = "advance";
            squad.updateTactics(false, 0.45);
            commandLockCase = {
              pass: squad.commandState === "assault" && squad.commandSource === "player" && squad.commandLockRemaining?.() > 1,
              commandState: squad.commandState,
              commandSource: squad.commandSource,
              commandLockRemaining: Math.round((squad.commandLockRemaining?.() || 0) * 10) / 10,
              tacticalMode: squad.tacticalMode
            };
            restoreProps(squad, saved);
          }

          let v2Case = { pass: false, reason: "missing-squad-or-objective" };
          if (squad && objective) {
            const saved = {
              commandState: squad.commandState,
              commandSource: squad.commandSource,
              commandReason: squad.commandReason,
              commandLockUntil: squad.commandLockUntil,
              tacticalMode: squad.tacticalMode,
              v2: squad.v2 ? JSON.parse(JSON.stringify(squad.v2)) : null,
              v2Morale: squad.v2Morale || null,
              v2FailureReasons: (squad.v2FailureReasons || []).slice()
            };
            squad.commandState = "advance";
            squad.commandSource = "bot";
            squad.commandReason = "qa-v2";
            squad.commandLockUntil = 0;
            squad.v2 = null;

            const threat = status?.lastThreat || objective;
            const failureStatus = {
              ...status,
              alive: Math.max(3, status?.alive || 3),
              total: Math.max(6, status?.total || 6),
              casualtyRatio: 0.38,
              avgSuppression: 46,
              maxSuppression: 78,
              cohesion: 132,
              mountedCount: 0,
              objectiveDistance: (objective.radius || 150) + 280,
              friendlyTank: null,
              armorThreat: null,
              lastThreat: threat,
              tacticalRisk: 0.68,
              center: status?.center || squad.leaderUnit?.() || objective
            };
            failureStatus.v2Morale = squad.v2MoraleFor?.(failureStatus) || null;
            failureStatus.v2FailureReasons = squad.v2FailureReasonsFor?.(failureStatus) || [];
            const failureMode = squad.chooseTacticalMode?.(failureStatus) || "";
            const radioReport = squad.updateV2RadioReport?.(failureStatus, failureMode) || null;

            const savedMap = {
              bestCoverNodeFor: game.tacticalMap?.bestCoverNodeFor,
              commandPings: game.commandPings
            };
            const reasonSamples = {};
            if (game.tacticalMap) game.tacticalMap.bestCoverNodeFor = () => null;
            reasonSamples.noCover = (squad.v2FailureReasonsFor?.({
              ...failureStatus,
              casualtyRatio: 0.08,
              avgSuppression: 18,
              maxSuppression: 26,
              armorThreat: null,
              friendlyTank: status?.friendlyTank || null,
              tacticalRisk: 0.74,
              lastThreat: { x: (failureStatus.center?.x || objective.x) + 240, y: failureStatus.center?.y || objective.y }
            }) || []).includes("noCover");
            if (game.tacticalMap && savedMap.bestCoverNodeFor) game.tacticalMap.bestCoverNodeFor = savedMap.bestCoverNodeFor;

            const enemyArmor = (game.tanks || []).find((item) => item.alive && item.team !== squad.team) ||
              (game.humvees || []).find((item) => item.alive && item.team !== squad.team) ||
              { x: (failureStatus.center?.x || objective.x) + 420, y: failureStatus.center?.y || objective.y, callSign: "qa-armor" };
            const savedRpg = [];
            for (const unit of squad.units || []) {
              savedRpg.push([unit, unit.equipmentAmmo?.rpg]);
              if (unit.equipmentAmmo) unit.equipmentAmmo.rpg = 0;
            }
            reasonSamples.noArmorSupport = (squad.v2FailureReasonsFor?.({
              ...failureStatus,
              casualtyRatio: 0.04,
              avgSuppression: 14,
              maxSuppression: 20,
              friendlyTank: null,
              armorThreat: { vehicle: enemyArmor, distance: 480 },
              tacticalRisk: 0.32,
              lastThreat: null
            }) || []).includes("noArmorSupport");
            for (const [unit, ammo] of savedRpg) {
              if (unit.equipmentAmmo && ammo !== undefined) unit.equipmentAmmo.rpg = ammo;
            }

            reasonSamples.pathBlocked = (squad.v2FailureReasonsFor?.({
              ...failureStatus,
              casualtyRatio: 0.04,
              avgSuppression: 12,
              maxSuppression: 20,
              cohesion: 900,
              friendlyTank: status?.friendlyTank || null,
              armorThreat: null,
              tacticalRisk: 0.2,
              lastThreat: null
            }) || []).includes("pathBlocked");

            game.commandPings = [];
            reasonSamples.noReconMark = (squad.v2FailureReasonsFor?.({
              ...failureStatus,
              casualtyRatio: 0.08,
              avgSuppression: 40,
              maxSuppression: 45,
              friendlyTank: status?.friendlyTank || null,
              armorThreat: null,
              tacticalRisk: 0.66,
              lastThreat: null
            }) || []).includes("noReconMark");
            game.commandPings = savedMap.commandPings;

            squad.v2 = null;
            squad.commandState = "advance";
            squad.commandSource = "bot";
            squad.commandLockUntil = 0;
            const approvalStatus = {
              ...status,
              alive: Math.max(3, status?.alive || 3),
              total: Math.max(3, status?.total || 3),
              casualtyRatio: 0.04,
              avgSuppression: 8,
              maxSuppression: 16,
              cohesion: 92,
              mountedCount: 0,
              objectiveDistance: (objective.radius || 150) + 260,
              friendlyTank: status?.friendlyTank || null,
              armorThreat: null,
              lastThreat: null,
              tacticalRisk: 0.18,
              center: status?.center || squad.leaderUnit?.() || objective
            };
            approvalStatus.v2Morale = squad.v2MoraleFor?.(approvalStatus) || null;
            approvalStatus.v2FailureReasons = [];
            const blockedMode = squad.chooseTacticalMode?.(approvalStatus) || "";
            const pendingApproval = squad.v2AssaultApprovalSummary?.() || null;
            const approved = squad.approveV2Assault?.("qa") || null;
            const approvedMode = squad.chooseTacticalMode?.(approvalStatus) || "";

            v2Case = {
              pass: Boolean(
                failureStatus.v2Morale &&
                failureStatus.v2FailureReasons.includes("heavyLosses") &&
                failureStatus.v2FailureReasons.includes("highSuppression") &&
                reasonSamples.noCover &&
                reasonSamples.noArmorSupport &&
                reasonSamples.pathBlocked &&
                reasonSamples.noReconMark &&
                radioReport?.kind &&
                pendingApproval?.status === "pending" &&
                pendingApproval.blocking === true &&
                ["pre-assault", "support-fire", "regroup"].includes(blockedMode) &&
                approved?.status === "approved" &&
                approvedMode
              ),
              failureMode,
              failureReasons: failureStatus.v2FailureReasons,
              reasonSamples,
              morale: failureStatus.v2Morale,
              radioKind: radioReport?.kind || "",
              radioReason: radioReport?.reason || "",
              approvalStatus: pendingApproval?.status || "",
              approvalBlocking: Boolean(pendingApproval?.blocking),
              blockedMode,
              approvedStatus: approved?.status || "",
              approvedMode
            };
            restoreProps(squad, {
              commandState: saved.commandState,
              commandSource: saved.commandSource,
              commandReason: saved.commandReason,
              commandLockUntil: saved.commandLockUntil,
              tacticalMode: saved.tacticalMode
            });
            squad.v2 = saved.v2;
            squad.v2Morale = saved.v2Morale;
            squad.v2FailureReasons = saved.v2FailureReasons;
          }

          const perf = game.aiScaleReadiness?.snapshot?.({ includeNetwork: true })?.performance || {};
          const observatory = game.aiObservatory?.collect?.() || null;
          const pass = Boolean(
            coverCase.pass &&
            stagingCase.pass &&
            rallyCase.pass &&
            riskCase.pass &&
            vehicleCase.pass &&
            commandLockCase.pass &&
            v2Case.pass &&
            Number(perf.tacticalMapMs || 0) <= 18
          );

          resolve({
            pass,
            matchStarted: game.matchStarted,
            profile: game.matchConfig?.aiDensityPreset || "",
            summary: game.tacticalMap?.summary?.() || null,
            coverCase,
            stagingCase,
            rallyCase,
            riskCase,
            vehicleCase,
            commandLockCase,
            v2Case,
            performance: {
              fps: perf.fps,
              frameMs: perf.frameMs,
              aiMs: perf.aiMs,
              tacticalMapMs: perf.tacticalMapMs,
              pathfindingAndMovementMs: perf.pathfindingAndMovementMs
            },
            observatory: {
              tacticalMap: observatory?.tacticalMap || null,
              squadTacticalRefs: (observatory?.units || [])
                .filter((item) => item.kind === "squad" && (item.tacticalMapId || item.tacticalRisk))
                .slice(0, 4)
                .map((item) => ({
                  id: item.id,
                  state: item.state,
                  tacticalMapId: item.tacticalMapId || "",
                  tacticalMapKind: item.tacticalMapKind || "",
                  tacticalRisk: item.tacticalRisk || 0
                })),
              squadV2Refs: (observatory?.units || [])
                .filter((item) => item.kind === "squad" && (item.v2RadioReport || (item.v2FailureReasons || []).length))
                .slice(0, 4)
                .map((item) => ({
                  id: item.id,
                  radioKind: item.v2RadioReport?.kind || "",
                  failureReasons: item.v2FailureReasons || [],
                  approvalStatus: item.v2AssaultApproval?.status || "",
                  morale: item.v2Morale || null
                }))
            }
          });
        }).catch(reject);
      };
      waitForLive();
    }, 140);
  }).catch(reject);
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
  ], { stdio: "ignore" });

  let client = null;
  try {
    const build = await waitForApp();
    const page = await waitForCdpPage();
    client = await connectCdp(page.webSocketDebuggerUrl);
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    const scenario = await evaluate(client, pageScenario, 24000);
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
