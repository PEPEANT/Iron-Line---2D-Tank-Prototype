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
const manifest = read("assets/audio/manifest.json");
const plan = read("docs/explosion-impact-plan.md");

mustInclude(html, "src/systems/audio.js");
mustInclude(html, "src/systems/game-menu-music.js");

for (const token of [
  "MAX_VOICES = 8",
  "assets/audio/${id}.${ext}",
  "unlock",
  "playWeaponFire",
  "playExplosion",
  "playMetalHit",
  "startMusic",
  "stopMusic",
  "startMenuMusic",
  "music/soubok-bgm",
  "maxDuration",
  "cameraVolume",
  "createStereoPanner"
]) {
  mustInclude(audio, token);
}

for (const token of [
  "IronLine.audio?.playWeaponFire",
  "IronLine.audio?.playExplosion",
  "IronLine.audio?.playMetalHit",
  "IronLine.audio?.play?.(\"rpg-fire\""
]) {
  mustInclude(combat, token);
}

mustInclude(tank, "tank-fire-he");
mustInclude(tank, "tank-fire-ap");
mustInclude(tank, "IronLine.audio?.play?.(tankFireSound");
mustInclude(reconDrone, "IronLine.audio?.playExplosion?.(game, this, \"drone\"");
mustInclude(suicideDrone, "IronLine.audio?.playExplosion?.(game, this, \"drone\"");

for (const id of [
  "explosion-he",
  "explosion-drone",
  "tank-fire",
  "tank-fire-he",
  "tank-fire-ap",
  "rifle-fire",
  "mg-fire",
  "pistol-fire",
  "rpg-fire",
  "sniper-fire",
  "hit-metal",
  "music/soubok-bgm"
]) {
  mustInclude(readme, id);
}

for (const id of [
  "explosion-he",
  "explosion-drone",
  "tank-fire",
  "tank-fire-he",
  "tank-fire-ap",
  "rifle-fire",
  "mg-fire",
  "pistol-fire",
  "rpg-fire",
  "sniper-fire",
  "hit-metal",
  "music/soubok-bgm"
]) {
  mustInclude(manifest, id);
}

for (const rel of [
  "assets/audio/explosion-he.mp3",
  "assets/audio/explosion-drone.mp3",
  "assets/audio/tank-fire.mp3",
  "assets/audio/tank-fire-he.mp3",
  "assets/audio/tank-fire-ap.mp3",
  "assets/audio/rifle-fire.mp3",
  "assets/audio/pistol-fire.mp3",
  "assets/audio/rpg-fire.mp3",
  "assets/audio/mg-fire.mp3",
  "assets/audio/sniper-fire.mp3",
  "assets/audio/hit-metal.mp3",
  "assets/audio/music/soubok-bgm.mp3"
]) {
  if (!fs.existsSync(path.join(root, rel))) fail(`missing imported audio file ${rel}`);
}

mustInclude(plan, "2026-07-05 Codex 구현");

if (!process.exitCode) console.log("Audio system check passed");
