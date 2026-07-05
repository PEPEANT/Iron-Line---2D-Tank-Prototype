"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
let fakeNowMs = 100000;

const sandbox = {
  console,
  Date,
  Math,
  performance: {
    now: () => fakeNowMs
  }
};
sandbox.window = sandbox;

vm.createContext(sandbox);

function loadScript(file) {
  const fullPath = path.join(root, file);
  vm.runInContext(fs.readFileSync(fullPath, "utf8"), sandbox, { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

loadScript("src/data/constants.js");
loadScript("src/core/math.js");
loadScript("src/systems/battlefield-events.js");
loadScript("src/ai/commander-ai.js");
loadScript("src/ai/commander-presence.js");

const IronLine = sandbox.IronLine;
const TEAM = IronLine.constants.TEAM;

function unit(callSign, team, x, y, alive = true) {
  return {
    callSign,
    team,
    x,
    y,
    alive,
    ai: true,
    classId: "rifleman",
    deathTime: 0,
    equipmentAmmo: {}
  };
}

function squad(callSign, team, units) {
  return {
    callSign,
    team,
    units,
    order: null,
    tacticalMode: "advance",
    activeUnits() {
      return this.units.filter((item) => item.alive && item.ai);
    },
    assignOrder(order) {
      this.order = order;
    },
    getOrderFor(item) {
      return this.order ? { ...this.order, squadId: this.callSign, unitId: item.callSign } : null;
    },
    distanceTo(point) {
      const active = this.activeUnits();
      if (!active.length || !point) return Infinity;
      return active.reduce((sum, item) => sum + IronLine.math.distXY(item.x, item.y, point.x, point.y), 0) / active.length;
    }
  };
}

function makeGame(options = {}) {
  const messages = [];
  const game = {
    player: { team: options.localTeam || TEAM.BLUE, squadId: options.playerSquadId || "B-SQD-1" },
    localPlayerTeam: () => options.localTeam || TEAM.BLUE,
    chat: {
      addSystemMessage(message) {
        messages.push(message);
      }
    },
    onlineSession: null,
    matchStarted: true,
    result: "",
    playerDeathActive: false,
    world: {
      width: 2200,
      height: 1400,
      obstacles: [],
      baseExitPoints: {},
      reconPoints: {}
    },
    capturePoints: options.capturePoints || [
      { name: "A", x: 520, y: 520, radius: 150, owner: TEAM.NEUTRAL, contested: false },
      { name: "B", x: 1180, y: 520, radius: 150, owner: TEAM.RED, contested: false },
      { name: "C", x: 1720, y: 820, radius: 150, owner: TEAM.RED, contested: false }
    ],
    tanks: [],
    humvees: [],
    infantry: [],
    squads: []
  };
  game.battlefieldEvents = new IronLine.BattlefieldEvents(game);
  return { game, messages };
}

function addSquads(game, team, count) {
  for (let index = 0; index < count; index += 1) {
    const members = [
      unit(`${team}-${index}-1`, team, 180 + index * 20, 260 + index * 16),
      unit(`${team}-${index}-2`, team, 198 + index * 20, 278 + index * 16)
    ];
    game.infantry.push(...members);
    game.squads.push(squad(`${team === TEAM.RED ? "R" : "B"}-SQD-${index + 1}`, team, members));
  }
}

function testAlliedOrdersEchoOnce() {
  const { game, messages } = makeGame();
  addSquads(game, TEAM.BLUE, 2);
  const commander = new IronLine.CommanderAI(game, TEAM.BLUE, ["A", "B", "C"]);
  commander.rebuildInfantryAssignments();

  assert(messages.length > 0, "blue commander orders should echo to chat");
  assert(messages[0].includes("[지휘]"), "commander order should use radio prefix");
  assert(messages[0].includes("★내 분대"), "local player squad should be highlighted");

  const firstCount = messages.length;
  commander.rebuildInfantryAssignments();
  assert(messages.length === firstCount, "same squad/target order should stay silent");
}

function testEnemyOrdersStayHidden() {
  const { game, messages } = makeGame({ localTeam: TEAM.BLUE });
  addSquads(game, TEAM.RED, 2);
  const commander = new IronLine.CommanderAI(game, TEAM.RED, ["C", "B", "A"]);
  commander.rebuildInfantryAssignments();
  assert(messages.length === 0, "red enemy commander orders must not echo");
}

function testRateLimit() {
  const capturePoints = Array.from({ length: 8 }, (_item, index) => ({
    name: String.fromCharCode("A".charCodeAt(0) + index),
    x: 300 + index * 160,
    y: 500,
    radius: 130,
    owner: TEAM.RED,
    contested: false
  }));
  const { game, messages } = makeGame({ capturePoints });
  addSquads(game, TEAM.BLUE, 8);
  const commander = new IronLine.CommanderAI(game, TEAM.BLUE, capturePoints.map((point) => point.name));
  commander.rebuildInfantryAssignments();
  assert(messages.length === 6, "commander radio should cap at 6 messages per minute");
}

function testReassaultConditions() {
  const { game, messages } = makeGame();
  addSquads(game, TEAM.BLUE, 4);
  addSquads(game, TEAM.RED, 2);

  const commander = new IronLine.CommanderAI(game, TEAM.BLUE, ["A", "B", "C"]);
  const holdSquad = game.squads.find((item) => item.team === TEAM.BLUE);
  const holdPoint = game.capturePoints[0];
  holdPoint.owner = TEAM.BLUE;
  const holdOrder = commander.createOrder(holdPoint, {
    role: "hold",
    stance: "hold",
    priority: 0,
    slotIndex: 0,
    slotCount: 1
  });
  holdSquad.assignOrder(holdOrder);
  holdSquad.tacticalMode = "hold";
  commander.squadAssignments.set(holdSquad, holdOrder);

  const reassault = commander.commanderPresenceMaybeReassault(15);
  assert(reassault, "reassault should issue an order when advantage and no recent deaths are present");
  assert(reassault.objectiveName === "B", "reassault should target the next unowned objective");
  assert(holdSquad.order.stance === "advance", "reassault should move a holding squad back to advance");
  assert(messages.some((message) => message.includes("공세 재개")), "reassault should be audible on radio");
}

function testRecentDeathBlocksReassault() {
  const { game } = makeGame();
  addSquads(game, TEAM.BLUE, 4);
  addSquads(game, TEAM.RED, 2);

  const dead = game.infantry.find((item) => item.team === TEAM.BLUE);
  dead.alive = false;
  dead.deathTime = fakeNowMs / 1000 - 4;

  const commander = new IronLine.CommanderAI(game, TEAM.BLUE, ["A", "B", "C"]);
  const holdSquad = game.squads.find((item) => item.team === TEAM.BLUE && item.activeUnits().length > 0);
  const holdPoint = game.capturePoints[0];
  holdPoint.owner = TEAM.BLUE;
  const holdOrder = commander.createOrder(holdPoint, {
    role: "hold",
    stance: "hold",
    priority: 0,
    slotIndex: 0,
    slotCount: 1
  });
  holdSquad.assignOrder(holdOrder);
  holdSquad.tacticalMode = "hold";
  commander.squadAssignments.set(holdSquad, holdOrder);

  const reassault = commander.commanderPresenceMaybeReassault(15);
  assert(!reassault, "recent friendly infantry death should block reassault");
}

testAlliedOrdersEchoOnce();
testEnemyOrdersStayHidden();
testRateLimit();
testReassaultConditions();
testRecentDeathBlocksReassault();

console.log("Commander presence check passed");
