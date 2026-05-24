"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_ANTI_VEHICLE_QA_PORT || 4199);
const cdpPort = Number(process.env.IRONLINE_ANTI_VEHICLE_QA_CDP_PORT || 9234);
const appUrl = `http://127.0.0.1:${appPort}/index.html`;
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const userDataDir = path.join(root, ".tmp-chrome-anti-vehicle-qa");

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
    const { TEAM, INFANTRY_WEAPONS } = IronLine.constants;
    const config = IronLine.InfantryAIConfig;
    const rpg = INFANTRY_WEAPONS.rpg;
    const droneWeapon = INFANTRY_WEAPONS.kamikazeDrone;
    const drone = new IronLine.SuicideDrone({
      x: 0,
      y: 0,
      team: TEAM.BLUE,
      weapon: droneWeapon
    });

    const rpgCheck = {
      range: rpg.range,
      desiredRange: rpg.desiredRange,
      life: rpg.life,
      directDamage: rpg.directDamage,
      aiPreferredMin: config.rpgPreferredMin,
      aiPreferredMax: config.rpgPreferredMax,
      aiPressureRadius: config.rpgPressureRadius,
      aiAimMin: config.rpgAimMin,
      aiAimMax: config.rpgAimMax,
      aiFrontArmorHoldRange: config.rpgFrontArmorHoldRange,
      pass: Boolean(
        rpg.range >= 1080 &&
        rpg.desiredRange >= 680 &&
        rpg.life >= 1.85 &&
        rpg.directDamage === 82 &&
        config.rpgPreferredMin >= 490 &&
        config.rpgPreferredMax >= 890 &&
        config.rpgPressureRadius >= 920 &&
        config.rpgAimMin <= 0.9 &&
        config.rpgAimMax <= 1.5 &&
        config.rpgFrontArmorHoldRange >= 590
      )
    };

    const droneCheck = {
      damage: drone.damage,
      tankDamageScale: drone.tankDamageScale,
      lightVehicleDamageScale: drone.lightVehicleDamageScale,
      terminalDiveSpeedMultiplier: drone.terminalDiveSpeedMultiplier,
      terminalBoostSpeedMultiplier: drone.terminalBoostSpeedMultiplier,
      direct: {
        front: drone.directImpactDamage({ vehicleType: "tank" }, { sector: "front", boosted: false }),
        side: drone.directImpactDamage({ vehicleType: "tank" }, { sector: "side", boosted: false }),
        rear: drone.directImpactDamage({ vehicleType: "tank" }, { sector: "rear", boosted: false }),
        boostFront: drone.directImpactDamage({ vehicleType: "tank" }, { sector: "front", boosted: true }),
        boostSide: drone.directImpactDamage({ vehicleType: "tank" }, { sector: "side", boosted: true }),
        boostRear: drone.directImpactDamage({ vehicleType: "tank" }, { sector: "rear", boosted: true }),
        humvee: drone.directImpactDamage({ vehicleType: "humvee" }, { sector: "light", boosted: false })
      },
      pass: Boolean(
        drone.damage >= 94 &&
        drone.tankDamageScale >= 0.62 &&
        drone.lightVehicleDamageScale >= 1 &&
        drone.terminalDiveSpeedMultiplier === 1.36 &&
        drone.terminalBoostSpeedMultiplier === 1.12 &&
        drone.directImpactDamage({ vehicleType: "tank" }, { sector: "front", boosted: false }) >= 62 &&
        drone.directImpactDamage({ vehicleType: "tank" }, { sector: "side", boosted: false }) >= 78 &&
        drone.directImpactDamage({ vehicleType: "tank" }, { sector: "rear", boosted: false }) >= 92 &&
        drone.directImpactDamage({ vehicleType: "tank" }, { sector: "rear", boosted: true }) >= 140 &&
        drone.directImpactDamage({ vehicleType: "humvee" }, { sector: "light", boosted: false }) >= 94
      )
    };

    game.effects = game.effects || {};
    game.effects.explosions = game.effects.explosions || [];
    game.effects.scorchMarks = game.effects.scorchMarks || [];
    game.effects.gunSmokePuffs = game.effects.gunSmokePuffs || [];
    game.effects.blastSparks = game.effects.blastSparks || [];
    game.battlefieldEvents = Array.isArray(game.battlefieldEvents) ? game.battlefieldEvents : [];

    const originalPlayer = {
      x: game.player.x,
      y: game.player.y,
      angle: game.player.angle,
      hp: game.player.hp,
      inTank: game.player.inTank
    };

    const tank = new IronLine.Tank({
      x: Math.min(game.world.width - 220, 820),
      y: Math.min(game.world.height - 220, 820),
      team: TEAM.BLUE,
      callSign: "QA-BAILOUT",
      maxHp: 110,
      angle: 0
    });
    const crew = new IronLine.CrewMember({
      x: tank.x,
      y: tank.y,
      team: TEAM.BLUE,
      callSign: "QA-BAILOUT-CREW",
      targetTank: tank,
      dedicated: true,
      role: "crew"
    });
    crew.boardTargetTank();
    tank.playerControlled = true;
    tank.playerSeat = "driver";
    game.player.inTank = tank;
    game.player.x = tank.x;
    game.player.y = tank.y;
    game.player.hp = game.player.maxHp || 100;
    tank.hp = 6;
    tank.takeDamage(game, 8, { weaponId: "qa", cause: "qa_noncatastrophic" });

    const bailoutCheck = {
      destructionPending: tank.destructionPending,
      destructionDelay: tank.destructionDelay,
      bailoutWindow: tank.bailoutWindow,
      lastBailout: tank.lastBailout,
      crewAlive: crew.alive,
      crewState: crew.state,
      crewInTank: Boolean(crew.inTank),
      crewHp: crew.hp,
      playerInTank: Boolean(game.player.inTank),
      playerHp: game.player.hp,
      eventRecorded: game.battlefieldEvents.some((event) => event.type === "tank_crew_bailout" && event.team === TEAM.BLUE),
      pass: Boolean(
        tank.destructionPending &&
        tank.destructionDelay >= 1.5 &&
        tank.bailoutWindow >= 1.5 &&
        tank.lastBailout?.crew === true &&
        tank.lastBailout?.player === true &&
        crew.alive &&
        !crew.inTank &&
        crew.state === "bailout" &&
        !game.player.inTank &&
        game.player.hp > 0 &&
        game.player.hp <= (game.player.maxHp || 100) * 0.45 &&
        game.battlefieldEvents.some((event) => event.type === "tank_crew_bailout" && event.team === TEAM.BLUE)
      )
    };

    game.player.x = originalPlayer.x;
    game.player.y = originalPlayer.y;
    game.player.angle = originalPlayer.angle;
    game.player.hp = originalPlayer.hp;
    game.player.inTank = originalPlayer.inTank;
    tank.playerControlled = false;
    tank.playerSeat = "";

    const originalCollections = {
      tanks: [...(game.tanks || [])],
      humvees: [...(game.humvees || [])],
      infantry: [...(game.infantry || [])],
      crews: [...(game.crews || [])]
    };
    const originalWeaponState = {
      weaponId: game.player.weaponId,
      activeSlot: game.player.activeSlot,
      equipmentAmmo: { ...(game.player.equipmentAmmo || {}) },
      rightDown: Boolean(game.input?.mouse?.rightDown)
    };

    const humvee = new IronLine.Humvee({
      x: Math.min(game.world.width - 280, 1080),
      y: Math.min(game.world.height - 280, 860),
      team: TEAM.BLUE,
      callSign: "QA-HUMVEE"
    });
    const humveeCrew = new IronLine.CrewMember({
      x: humvee.x,
      y: humvee.y,
      team: TEAM.BLUE,
      callSign: "QA-HUMVEE-CREW",
      targetTank: humvee,
      dedicated: true,
      role: "crew"
    });
    humveeCrew.boardTargetTank();
    const passenger = new IronLine.InfantryUnit({
      x: humvee.x,
      y: humvee.y,
      team: TEAM.BLUE,
      callSign: "QA-HUMVEE-PAX",
      weaponId: "rifle"
    });
    humvee.boardPassenger(passenger);
    game.player.inTank = humvee;
    game.player.x = humvee.x;
    game.player.y = humvee.y;
    game.player.hp = game.player.maxHp || 100;
    humvee.hp = 5;
    humvee.takeDamage(game, 8, { weaponId: "qa", cause: "qa_humvee_destroy" });

    const humveeBailoutCheck = {
      alive: humvee.alive,
      lastBailout: humvee.lastBailout,
      crewAlive: humveeCrew.alive,
      crewState: humveeCrew.state,
      crewInVehicle: Boolean(humveeCrew.inTank),
      playerInVehicle: Boolean(game.player.inTank),
      playerHp: game.player.hp,
      playerDistance: Math.hypot(game.player.x - humvee.x, game.player.y - humvee.y),
      passengerAlive: passenger.alive,
      passengerInVehicle: Boolean(passenger.inVehicle),
      passengerDistance: Math.hypot(passenger.x - humvee.x, passenger.y - humvee.y),
      eventRecorded: game.battlefieldEvents.some((event) => event.type === "humvee_crew_bailout" && event.team === TEAM.BLUE),
      pass: Boolean(
        !humvee.alive &&
        humvee.lastBailout?.player === true &&
        humvee.lastBailout?.crew === true &&
        humvee.lastBailout?.passengers >= 1 &&
        humveeCrew.alive &&
        !humveeCrew.inTank &&
        (humveeCrew.state === "bailout" || humveeCrew.state === "bailout-shocked") &&
        !game.player.inTank &&
        game.player.hp > 0 &&
        Math.hypot(game.player.x - humvee.x, game.player.y - humvee.y) >= humvee.radius + game.player.radius + 8 &&
        !passenger.inVehicle &&
        Math.hypot(passenger.x - humvee.x, passenger.y - humvee.y) >= humvee.radius + passenger.radius + 6 &&
        game.battlefieldEvents.some((event) => event.type === "humvee_crew_bailout" && event.team === TEAM.BLUE)
      )
    };

    game.player.x = originalPlayer.x;
    game.player.y = originalPlayer.y;
    game.player.angle = originalPlayer.angle;
    game.player.hp = originalPlayer.hp;
    game.player.inTank = null;

    const mgShooterHumvee = new IronLine.Humvee({
      x: Math.min(game.world.width - 360, 1260),
      y: Math.min(game.world.height - 360, 920),
      team: TEAM.BLUE,
      callSign: "QA-MG-HUMVEE"
    });
    mgShooterHumvee.playerControlled = true;
    mgShooterHumvee.playerSeat = "driver";
    const mgTargetHumvee = new IronLine.Humvee({
      x: mgShooterHumvee.x + 180,
      y: mgShooterHumvee.y + 18,
      team: TEAM.RED,
      callSign: "QA-MG-HUMVEE-TGT"
    });
    const mgShooterTank = new IronLine.Tank({
      x: mgShooterHumvee.x,
      y: mgShooterHumvee.y + 180,
      team: TEAM.BLUE,
      callSign: "QA-MG-TANK",
      maxHp: 110
    });
    mgShooterTank.crew = { alive: true, team: TEAM.BLUE };
    const mgTargetTank = new IronLine.Tank({
      x: mgShooterTank.x + 210,
      y: mgShooterTank.y,
      team: TEAM.RED,
      callSign: "QA-MG-TANK-TGT",
      maxHp: 110
    });
    game.humvees = [...originalCollections.humvees, mgShooterHumvee, mgTargetHumvee];
    game.tanks = [...originalCollections.tanks, mgShooterTank, mgTargetTank];
    game.infantry = [...originalCollections.infantry];
    game.crews = [...originalCollections.crews];

    const humveeTarget = game.findTankMachineGunTarget(mgShooterHumvee, mgTargetHumvee.x, mgTargetHumvee.y);
    const tankTarget = game.findTankMachineGunTarget(mgShooterTank, mgTargetTank.x, mgTargetTank.y);

    game.player.x = mgShooterHumvee.x - 70;
    game.player.y = mgShooterHumvee.y + 110;
    game.player.angle = Math.atan2(mgTargetHumvee.y - game.player.y, mgTargetHumvee.x - game.player.x);
    game.player.inTank = null;
    game.player.setWeapon("machinegun");
    game.player.equipmentAmmo.machinegun = Math.max(game.player.equipmentAmmo.machinegun || 0, 24);
    if (game.input?.mouse) {
      game.input.mouse.worldX = mgTargetHumvee.x;
      game.input.mouse.worldY = mgTargetHumvee.y;
      game.input.mouse.rightDown = true;
    }
    const playerVehicleTarget = game.findPlayerRifleTarget();

    const originalRandom = Math.random;
    Math.random = () => 0.01;
    const humveeHpBefore = mgTargetHumvee.hp;
    for (let i = 0; i < 12; i += 1) {
      mgShooterHumvee.machineGunCooldown = 0;
      mgShooterHumvee.fireMachineGun(game, mgTargetHumvee.x, mgTargetHumvee.y, { target: mgTargetHumvee });
    }
    const tankHpBefore = mgTargetTank.hp;
    for (let i = 0; i < 12; i += 1) {
      mgShooterTank.machineGunCooldown = 0;
      mgShooterTank.fireMachineGun(game, mgTargetTank.x, mgTargetTank.y, { target: mgTargetTank });
    }
    const playerVehicleHpBefore = mgTargetHumvee.hp;
    for (let i = 0; i < 6; i += 1) {
      game.player.rifleCooldown = 0;
      game.firePlayerGun(game.player.getWeapon(), mgTargetHumvee.x, mgTargetHumvee.y);
    }
    Math.random = originalRandom;

    const machineGunCheck = {
      humveeTargetAcquired: humveeTarget === mgTargetHumvee,
      tankTargetAcquired: tankTarget === mgTargetTank,
      playerVehicleTargetAcquired: playerVehicleTarget === mgTargetHumvee,
      humveeDamage: humveeHpBefore - mgTargetHumvee.hp,
      tankDamage: tankHpBefore - mgTargetTank.hp,
      playerVehicleDamage: playerVehicleHpBefore - mgTargetHumvee.hp,
      vehicleDamageValues: {
        infantryMgVsTank: IronLine.combat.smallArmsTankDamage(INFANTRY_WEAPONS.machinegun, mgTargetTank),
        infantryMgVsHumvee: IronLine.combat.smallArmsTankDamage(INFANTRY_WEAPONS.machinegun, mgTargetHumvee),
        vehicleMgVsTank: IronLine.combat.smallArmsTankDamage(mgShooterTank.machineGunWeapon(), mgTargetTank),
        vehicleMgVsHumvee: IronLine.combat.smallArmsTankDamage(mgShooterHumvee.machineGunWeapon(), mgTargetHumvee)
      },
      pass: Boolean(
        humveeTarget === mgTargetHumvee &&
        tankTarget === mgTargetTank &&
        playerVehicleTarget === mgTargetHumvee &&
        humveeHpBefore - mgTargetHumvee.hp >= 16 &&
        tankHpBefore - mgTargetTank.hp >= 2.5 &&
        playerVehicleHpBefore - mgTargetHumvee.hp >= 2.5
      )
    };

    game.player.x = originalPlayer.x;
    game.player.y = originalPlayer.y;
    game.player.angle = originalPlayer.angle;
    game.player.hp = originalPlayer.hp;
    game.player.inTank = originalPlayer.inTank;
    game.player.weaponId = originalWeaponState.weaponId;
    game.player.activeSlot = originalWeaponState.activeSlot;
    game.player.equipmentAmmo = { ...originalWeaponState.equipmentAmmo };
    if (game.input?.mouse) game.input.mouse.rightDown = originalWeaponState.rightDown;
    game.tanks = originalCollections.tanks;
    game.humvees = originalCollections.humvees;
    game.infantry = originalCollections.infantry;
    game.crews = originalCollections.crews;

    const regressionCheck = {
      antiTankAssaultMethodsPresent: Boolean(
        typeof tank.reserveInfantryAssault === "function" &&
        typeof tank.updateInfantryAssault === "function" &&
        typeof tank.cancelInfantryAssault === "function"
      ),
      commandStateIntact: Boolean(game.commandBus && typeof game.commandBus.submit === "function"),
      fpsDamagePathIntact: Boolean(typeof game.applyPlayerDamage === "function"),
      pass: Boolean(
        typeof tank.reserveInfantryAssault === "function" &&
        typeof tank.updateInfantryAssault === "function" &&
        typeof tank.cancelInfantryAssault === "function" &&
        game.commandBus &&
        typeof game.commandBus.submit === "function" &&
        typeof game.applyPlayerDamage === "function"
      )
    };

    const pass = Boolean(
      rpgCheck.pass &&
      droneCheck.pass &&
      bailoutCheck.pass &&
      humveeBailoutCheck.pass &&
      machineGunCheck.pass &&
      regressionCheck.pass
    );
    resolve({
      pass,
      rpgCheck,
      droneCheck,
      bailoutCheck,
      humveeBailoutCheck,
      machineGunCheck,
      regressionCheck
    });
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
