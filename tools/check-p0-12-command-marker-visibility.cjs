"use strict";

const path = require("path");
const { spawn } = require("child_process");
const { launchPage, makeRequestJson, waitForServer } = require("./p0-browser-cdp-helper.cjs");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_P0_12_COMMAND_PORT || 4396);
const debugPort = Number(process.env.IRONLINE_P0_12_COMMAND_CDP || 9396);
const baseUrl = `http://127.0.0.1:${appPort}`;
const requestJson = makeRequestJson(baseUrl);
const roomsFile = path.join(root, ".data", `p0-12-command-marker-${process.pid}.json`);

async function runScenario(page) {
  return page.eval(`(async () => {
    const game = window.IronLine?.game;
    const TEAM = window.IronLine?.constants?.TEAM || { BLUE: "blue", RED: "red" };
    if (!game?.commandBus || !game.renderer?.commandMapEntries) throw new Error("game command systems missing");

    document.querySelector("#entryEnterButton")?.click?.();
    await new Promise((resolve) => setTimeout(resolve, 120));

    game.sessionMode = "online";
    game.matchStarted = true;
    game.lobbyOpen = false;
    game.deploymentOpen = false;
    game.adminObserverMode = false;

    const blueSlots = (game.onlineSession?.roleSlots || []).filter((slot) => (
      slot.team === TEAM.BLUE && (slot.squadIds?.length || 0) > 0
    ));
    if (blueSlots.length < 1) throw new Error("blue command slot missing");
    const remoteSlot = blueSlots[0];
    const localSlot = blueSlots[1] || remoteSlot;
    const hostSlot = blueSlots[2] || localSlot;
    const squadId = remoteSlot.squadIds[0];
    const squad = game.squadById?.(squadId);
    if (!squad) throw new Error("target squad missing");

    const localId = "p0-local-blue";
    const hostId = "p0-host-blue";
    const remoteId = "p0-remote-blue";
    const roomId = "P0-12-COMMAND-MARKER";

    const players = [
      { id: localId, playerId: localId, name: "Local", team: TEAM.BLUE, slotId: localSlot.id, participantType: "player", ready: true, alive: true },
      { id: hostId, playerId: hostId, name: "Host", team: TEAM.BLUE, slotId: hostSlot.id, participantType: "player", ready: true, alive: true, host: true },
      { id: remoteId, playerId: remoteId, name: "Remote", team: TEAM.BLUE, slotId: remoteSlot.id, participantType: "player", ready: true, alive: true }
    ];
    remoteSlot.playerId = remoteId;
    remoteSlot.controllerType = "human";
    localSlot.playerId = localId;
    localSlot.controllerType = "human";
    hostSlot.playerId = hostId;
    hostSlot.controllerType = "human";

    game.onlineSession.roomId = roomId;
    game.onlineSession.players = players;
    game.onlineSession.playerId = localId;
    game.onlineSession.hostId = hostId;
    game.player.team = TEAM.BLUE;

    const room = {
      id: roomId,
      phase: "playing",
      players,
      commands: []
    };
    game.onlineCombatRoom = () => room;

    const clearCommandState = () => {
      game.commandBus.resetMatch();
      game.commandPings = [];
      squad.manualOrder = null;
      if (squad.assignOrder) squad.assignOrder(null);
      game.onlineCommandSeenIds = new Set();
    };
    const remoteCommand = (id) => ({
      id,
      commandId: id,
      roomId,
      playerId: remoteId,
      issuerPlayerId: remoteId,
      slotId: remoteSlot.id,
      commanderSlotId: remoteSlot.id,
      role: remoteSlot.roleId || "infantry",
      controllerType: "human",
      team: TEAM.BLUE,
      commandType: "assault",
      type: "assault",
      targetSquadId: squadId,
      targetSquadIds: [squadId],
      targetPosition: { x: game.player.x + 180, y: game.player.y + 40 },
      targetPoint: { x: game.player.x + 180, y: game.player.y + 40 },
      issuedAt: Date.now(),
      lockUntil: Date.now() + 2800,
      reason: "assault"
    });
    const visibleEntries = () => game.renderer.commandMapEntries(game, TEAM.BLUE).length;

    clearCommandState();
    room.commands = [remoteCommand("p0-cmd-non-host")];
    game.onlineSession.playerId = localId;
    game.updateOnlineCommands(0.016);
    const nonHost = {
      applied: game.commandBus.log.length,
      pings: game.commandPings.length,
      entries: visibleEntries()
    };

    clearCommandState();
    room.commands = [remoteCommand("p0-cmd-host")];
    game.onlineSession.playerId = hostId;
    game.updateOnlineCommands(0.016);
    const host = {
      applied: game.commandBus.log.filter((item) => item.accepted).length,
      pings: game.commandPings.length,
      entries: visibleEntries(),
      squadOrderIssuer: squad.manualOrder?.issuerPlayerId || ""
    };

    clearCommandState();
    game.onlineSession.playerId = remoteId;
    const localResult = game.commandBus.submit({
      id: "p0-cmd-local",
      commandId: "p0-cmd-local",
      roomId,
      issuerPlayerId: remoteId,
      playerId: remoteId,
      slotId: remoteSlot.id,
      commanderSlotId: remoteSlot.id,
      team: TEAM.BLUE,
      type: "assault",
      commandType: "assault",
      targetSquadId: squadId,
      targetSquadIds: [squadId],
      targetPoint: { x: game.player.x + 220, y: game.player.y + 30 },
      targetPosition: { x: game.player.x + 220, y: game.player.y + 30 }
    });
    const local = {
      accepted: Boolean(localResult.accepted),
      pings: game.commandPings.length,
      entries: visibleEntries()
    };

    return {
      nonHost,
      host,
      local,
      pass: (
        nonHost.applied === 0 &&
        nonHost.pings === 0 &&
        nonHost.entries === 0 &&
        host.applied === 1 &&
        host.pings === 0 &&
        host.entries === 0 &&
        host.squadOrderIssuer === remoteId &&
        local.accepted &&
        local.pings > 0 &&
        local.entries > 0
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
      name: "command-marker",
      debugPort,
      originHost: "127.0.0.1",
      appPort,
      baseUrl,
      profilePrefix: "p0-12-command"
    });
    const result = await runScenario(page);
    console.log(JSON.stringify(result, null, 2));
    if (!result.pass) throw new Error("P0-12 command marker visibility failed");
  } finally {
    if (page) await page.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
