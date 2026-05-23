"use strict";

const path = require("path");
const { spawn } = require("child_process");
const { launchPage, makeRequestJson, waitForServer } = require("./p0-browser-cdp-helper.cjs");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_P0_12_CREW_PORT || 4397);
const debugPort = Number(process.env.IRONLINE_P0_12_CREW_CDP || 9397);
const baseUrl = `http://127.0.0.1:${appPort}`;
const requestJson = makeRequestJson(baseUrl);
const roomsFile = path.join(root, ".data", `p0-12-worldstate-crew-${process.pid}.json`);

async function runScenario(page) {
  return page.eval(`(async () => {
    const game = window.IronLine?.game;
    if (!game?.applyOnlineWorldState) throw new Error("game world sync missing");
    document.querySelector("#entryEnterButton")?.click?.();
    await new Promise((resolve) => setTimeout(resolve, 120));

    game.sessionMode = "online";
    game.matchStarted = true;
    game.onlineSession.roomId = "P0-12-CREW";
    game.onlineSession.playerId = "local-client";

    const vehicle = [...(game.tanks || []), ...(game.humvees || [])]
      .find((item) => item && !item.isPlayerTank && (item.callSign || item.id));
    if (!vehicle) throw new Error("vehicle missing");
    const vehicleId = vehicle.callSign || vehicle.id;
    const crewId = vehicle.vehicleType === "humvee" ? vehicleId + "-DRV" : vehicleId + "-CREW";

    game.crews = (game.crews || []).filter((crew) => crew.callSign !== crewId);
    if (vehicle.crew?.callSign === crewId) vehicle.leaveCrew?.(vehicle.crew);

    const snap = {
      id: crewId,
      team: vehicle.team,
      x: vehicle.x + 86,
      y: vehicle.y + 28,
      angle: vehicle.angle + 0.4,
      hp: 22,
      maxHp: 45,
      alive: true,
      inVehicle: false,
      state: "bailout"
    };
    const state = {
      roomId: "P0-12-CREW",
      hostId: "remote-host",
      updatedAt: Date.now(),
      vehicles: [{
        id: vehicleId,
        type: vehicle.vehicleType || "tank",
        team: vehicle.team,
        x: vehicle.x,
        y: vehicle.y,
        angle: vehicle.angle,
        hp: 0,
        maxHp: vehicle.maxHp || 1,
        alive: false,
        controllerId: ""
      }],
      units: [snap],
      capturePoints: []
    };

    const before = game.crews.some((crew) => crew.callSign === crewId);
    const applied = game.applyOnlineWorldState(state, 0.12);
    const crew = game.crews.find((item) => item.callSign === crewId);
    return {
      before,
      applied,
      vehicleAlive: vehicle.alive,
      crewExists: Boolean(crew),
      crewAlive: Boolean(crew?.alive),
      crewMounted: Boolean(crew?.inTank || crew?.inVehicle),
      crewState: crew?.state || "",
      pass: (
        before === false &&
        applied === true &&
        vehicle.alive === false &&
        Boolean(crew) &&
        crew.alive === true &&
        !crew.inTank &&
        !crew.inVehicle &&
        crew.state === "bailout"
      )
    };
  })()`);
}

async function main() {
  const server = spawn(process.execPath, ["tools/static-server.cjs", String(appPort)], {
    cwd: root,
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      IRONLINE_ROOMS_FILE: roomsFile
    }
  });
  let page = null;
  try {
    await waitForServer(requestJson);
    page = await launchPage({
      name: "worldstate-crew",
      debugPort,
      originHost: "127.0.0.1",
      appPort,
      baseUrl,
      profilePrefix: "p0-12-crew"
    });
    const result = await runScenario(page);
    console.log(JSON.stringify(result, null, 2));
    if (!result.pass) throw new Error("P0-12 worldState crew sync failed");
  } finally {
    if (page) await page.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
