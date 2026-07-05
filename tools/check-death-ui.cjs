"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(message) {
  console.error(`Death UI check failed: ${message}`);
  process.exitCode = 1;
}

function mustInclude(source, needle, label = needle) {
  if (!source.includes(needle)) fail(`missing ${label}`);
}

function mustNotInclude(source, needle, label = needle) {
  if (source.includes(needle)) fail(`unexpected ${label}`);
}

const html = read("index.html");
const hud = read("src/systems/hud.js");
const main = read("src/main.js");
const deathHandler = hud.slice(
  hud.indexOf("this.nodes.deathRestartButton?.addEventListener"),
  hud.indexOf("this.nodes.resultMainButton?.addEventListener")
);
const deathInput = main.slice(
  main.indexOf("updateDeathRestartInput()"),
  main.indexOf("restartMatchAfterDeath()")
);
const deathScreenUpdate = hud.slice(
  hud.indexOf("updateDeathScreen(game)"),
  hud.indexOf("updateResultScreen(game)")
);

mustInclude(html, 'id="deathScreen"', "death screen");
mustInclude(html, 'id="deathReason"', "death reason");
mustInclude(html, 'id="deathRestartButton"', "death main button");
mustInclude(deathHandler, "game.returnToMainMenu();", "death button returns to main");
mustNotInclude(deathHandler, "restartMatchAfterDeath", "death button restart path");
mustInclude(deathInput, "return this.returnToMainMenu();", "Enter returns to main");
mustNotInclude(deathInput, "KeyR", "death KeyR restart shortcut");
mustInclude(deathScreenUpdate, '"메인화면으로 가기"', "fixed main-menu button label");
mustNotInclude(deathScreenUpdate, "playerRespawnTimer", "respawn countdown in death reason");

if (!process.exitCode) console.log("Death UI check passed");
