"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function mustInclude(source, needle, label = needle) {
  if (!source.includes(needle)) fail(`vehicle dashboard missing ${label}`);
}

const html = read("index.html");
const js = read("src/systems/vehicle-dashboard-hud.js");
const css = read("styles/vehicle-dashboard.css");

mustInclude(html, "styles/vehicle-dashboard.css");
mustInclude(html, "src/systems/vehicle-dashboard-hud.js");

for (const token of [
  "updateTankWeaponsWithDashboard",
  "updateHumveeWeaponsWithDashboard",
  "updateInfantryWeaponsWithoutVehicleDashboard",
  "vehicle-dashboard",
  "drawGauge",
  "vehicle.speed",
  "tank.ammo?.ap",
  "tank.reload",
  "tank.smokeCooldown",
  "humvee.ammo?.mg",
  "vehicleType !== \"humvee\""
]) {
  mustInclude(js, token);
}

for (const selector of [
  ".hud-bottom.vehicle-dashboard-active .weapon-panel",
  ".vehicle-dashboard",
  ".vehicle-dashboard-meter canvas",
  ".vehicle-dashboard-main",
  ".vehicle-dashboard-mg",
  ".vehicle-dashboard-smoke",
  ".vehicle-dashboard.humvee"
]) {
  mustInclude(css, selector);
}

console.log("Vehicle dashboard check passed");
