"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(message) {
  console.error(`Suicide drone dumb-fire check failed: ${message}`);
  process.exitCode = 1;
}

function mustInclude(source, needle, label = needle) {
  if (!source.includes(needle)) fail(`missing ${label}`);
}

function mustNotInclude(source, needle, label = needle) {
  if (source.includes(needle)) fail(`unexpected ${label}`);
}

const drone = read("src/entities/suicide-drone.js");
const gameDrone = read("src/systems/game-drone-system.js");
const renderer = read("src/systems/renderer-drone.js");
const weapons = read("src/data/infantry-weapons.js");
const plan = read("docs/explosion-impact-plan.md");
const startAttackStart = gameDrone.indexOf("startSuicideDroneAttack");
const startAttackEnd = gameDrone.indexOf("togglePlayerDroneControl");
const startAttackBlock = gameDrone.slice(startAttackStart, startAttackEnd);

for (const token of [
  "dumbFireActive",
  "dumbFireAutoDetonateRadius",
  "dumbFireTurnRate",
  "dumbFireLife",
  "startDumbFire",
  "updateDumbFireDetonation",
  "lineIntersectsRect",
  "world.width - impactRadius",
  "this.dumbFireActive ? this.dumbFireAutoDetonateRadius"
]) {
  mustInclude(drone, token);
}

mustInclude(gameDrone, "const attackAngle = angleTo(drone.x, drone.y, mouse.worldX, mouse.worldY);");
mustInclude(gameDrone, "drone.startDumbFire?.(this, attackAngle)");
mustNotInclude(startAttackBlock, "findSuicideDroneLockTarget", "lock target lookup inside startSuicideDroneAttack");

mustInclude(renderer, "drawAttackDroneDumbFireAim");
mustInclude(renderer, "DUMB FIRE");
mustInclude(renderer, "if (state.controlled && !lock) this.drawAttackDroneDumbFireAim");

mustInclude(weapons, "autoDetonateRadius: 34");
mustInclude(weapons, "diveAutoDetonateRadius: 50");
mustInclude(weapons, "dumbFireAutoDetonateRadius: 20");
mustInclude(weapons, "dumbFireTurnRate: 3.2");

mustInclude(plan, "2026-07-05 Codex dumb-fire v1");
mustInclude(plan, "AI 드론의 `lockOn`/`startAttackDive` 경로와 기존 기폭 반경은 유지");

if (!process.exitCode) console.log("Suicide drone dumb-fire check passed");
