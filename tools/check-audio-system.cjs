"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(message) {
  console.error(`Audio system check failed: ${message}`);
  process.exitCode = 1;
}

function mustInclude(source, needle, label = needle) {
  if (!source.includes(needle)) fail(`missing ${label}`);
}

const html = read("index.html");
const audio = read("src/systems/audio.js");
const combat = read("src/systems/combat.js");
const tank = read("src/entities/tank.js");
const reconDrone = read("src/entities/recon-drone.js");
const suicideDrone = read("src/entities/suicide-drone.js");
const readme = read("assets/audio/README.md");
const plan = read("docs/explosion-impact-plan.md");

mustInclude(html, "src/systems/audio.js");

for (const token of [
  "MAX_VOICES = 8",
  "assets/audio/${id}.${ext}",
  "unlock",
  "playWeaponFire",
  "playExplosion",
  "playMetalHit",
  "cameraVolume",
  "createStereoPanner"
]) {
  mustInclude(audio, token);
}

for (const token of [
  "IronLine.audio?.playWeaponFire",
  "IronLine.audio?.playExplosion",
  "IronLine.audio?.playMetalHit"
]) {
  mustInclude(combat, token);
}

mustInclude(tank, "IronLine.audio?.play?.(\"tank-fire\"");
mustInclude(reconDrone, "IronLine.audio?.playExplosion?.(game, this, \"drone\"");
mustInclude(suicideDrone, "IronLine.audio?.playExplosion?.(game, this, \"drone\"");

for (const id of ["explosion-he", "explosion-drone", "tank-fire", "rifle-fire", "mg-fire", "hit-metal"]) {
  mustInclude(readme, id);
}

mustInclude(plan, "2026-07-05 Codex 구현");

if (!process.exitCode) console.log("Audio system check passed");
