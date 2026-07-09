"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(message) {
  console.error(`Support fire contract check failed: ${message}`);
  process.exitCode = 1;
}

function mustInclude(source, needle, label = needle) {
  if (!source.includes(needle)) fail(`missing ${label}`);
}

const supportFire = read("src/ai/infantry-support-fire.js");
const supportStance = read("src/ai/infantry-support-weapon-stance.js");
const infantryAi = read("src/ai/infantry-ai.js");
const playerControl = read("src/systems/game-player-control.js");
const main = read("src/main.js");
const renderer = read("src/systems/renderer.js");
const index = read("index.html");

for (const token of [
  "supportTask = mode === \"support-fire\"",
  "role === \"support\"",
  "role === \"security\" && mode === \"hold-wall\"",
  "if (!assaultTask && !supportTask) return null",
  "const cadence = supportTask ? 2 : 3",
  "prepareSupportWeaponFire?.(point, dt)",
  "fireRifleAtPoint"
]) {
  mustInclude(supportFire, token);
}

for (const token of [
  "prepareSupportWeaponFire(target",
  "supportWeaponDeployTimer",
  "supportWeaponLockTimer"
]) {
  mustInclude(supportStance, token);
}

for (const token of [
  "if ((this.supportWeaponLockTimer || 0) > 0 && this.isSupportWeapon?.())",
  "if (!this.prepareSupportWeaponFire(target",
  "if (!this.prepareSupportWeaponFire(tank"
]) {
  mustInclude(infantryAi, token);
}

for (const token of [
  "isPlayerSupportGun(weapon)",
  "canPlayerFireSupportGun(weapon)",
  "updatePlayerSupportWeaponStance(weapon",
  "machineGunAimMode ? 0"
]) {
  mustInclude(playerControl, token);
}

mustInclude(main, "this.isPlayerSupportGun?.(weapon) && !this.canPlayerFireSupportGun?.(weapon)", "player machinegun fire gate");
mustInclude(renderer, "(!supportGun || unit.supportWeaponReady)", "renderer support weapon ready pose gate");
mustInclude(index, "src/ai/infantry-support-weapon-stance.js", "index loads support weapon stance module");

if (!process.exitCode) console.log("Support fire contract check passed");
