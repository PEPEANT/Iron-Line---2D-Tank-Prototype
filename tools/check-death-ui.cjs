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
const revive = read("src/systems/player-downed-revive.js");
const medical = read("src/systems/player-medical-kit.js");
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
mustInclude(html, "src/systems/player-downed-revive.js", "downed revive module script");
mustInclude(html, "src/systems/player-medical-kit.js", "player medical kit module script");
mustInclude(main, "IronLine.installPlayerMedicalKit?.(Game);", "medical kit installer");
mustInclude(main, "IronLine.installPlayerDownedRevive?.(Game);", "downed revive installer");
mustInclude(main, "this.playerDownedDuration = 18", "extended downed timer");
mustInclude(revive, "updatePlayerDownedRevive(dt)", "downed revive update");
mustInclude(revive, "reviveDownedPlayer(options = {})", "revive handler");
mustInclude(revive, "this.input.keyDown(\"KeyE\")", "hold E self revive");
mustInclude(revive, "this.updateInfantryWeaponInput?.()", "downed slot selection");
mustInclude(revive, "selectedKit", "selected kit revive");
mustInclude(revive, "this.input.mouse?.leftDown", "selected kit mouse revive");
mustInclude(revive, "respawnPointForTeamWithBaseSpawn", "base spawn respawn override");
mustInclude(main, "this.recordLocalPlayerDeath(this.playerPendingDeathSource", "death counted after downed expiry");
mustInclude(medical, "usePlayerMedicalKit", "medical kit heal handler");
mustInclude(medical, "baseRepairFriendlyTank", "repair fallback wrapper");
mustInclude(medical, "player.hp = Math.min", "medical kit restores player hp");

if (!process.exitCode) console.log("Death UI check passed");
