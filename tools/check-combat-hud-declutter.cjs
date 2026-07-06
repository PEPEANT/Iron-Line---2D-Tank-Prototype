"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const renderer = fs.readFileSync(path.join(root, "src/systems/renderer.js"), "utf8");
const vehicleRenderer = fs.readFileSync(path.join(root, "src/systems/renderer-vehicle.js"), "utf8");
const tank = fs.readFileSync(path.join(root, "src/entities/tank.js"), "utf8");
const humvee = fs.readFileSync(path.join(root, "src/entities/humvee.js"), "utf8");

function fail(message) {
  console.error(`[combat-hud-declutter] ${message}`);
  process.exitCode = 1;
}

if (!/drawTankLabel\(tank\)\s*\{\s*return;\s*\}/.test(vehicleRenderer)) {
  fail("vehicle name labels must remain disabled");
}

if (!/if\s*\(\s*tank\.playerControlled\s*\)\s*return;[\s\S]*?healthRevealTimer/.test(vehicleRenderer)) {
  fail("vehicle overhead health must be hidden for the player and reveal-gated for AI vehicles");
}

if (!/drawInfantryHealth\(unit\)[\s\S]*?healthRevealTimer[\s\S]*?if\s*\(\s*reveal\s*<=\s*0\s*\)\s*return/.test(renderer)) {
  fail("infantry overhead health must be reveal-gated");
}

if (!/this\.healthRevealTimer\s*=\s*0/.test(tank) || !/this\.healthRevealTimer\s*=\s*0/.test(humvee)) {
  fail("vehicles must initialize health reveal timers");
}

if (!process.exitCode) {
  console.log("[combat-hud-declutter] combat HUD declutter contract OK");
}
