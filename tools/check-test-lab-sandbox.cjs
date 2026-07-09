"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function mustInclude(source, needle, label) {
  if (!source.includes(needle)) fail(`test lab sandbox missing ${label || needle}`);
}

function mustNotInclude(source, needle, label) {
  if (source.includes(needle)) fail(`test lab sandbox must not include ${label || needle}`);
}

const html = read("index.html");
const js = read("src/systems/test-lab-ui.js");
const css = read("styles/test-lab.css");
const hud = read("src/systems/hud.js");
const main = read("src/main.js");
const renderer = read("src/systems/renderer.js");
const combatHud = read("src/systems/renderer-combat-hud.js");

// 폐기된 구 모듈이 되살아나지 않았는지 확인한다.
for (const removed of [
  "src/systems/test-lab-asset-preview.js",
  "src/systems/test-lab-objects.js",
  "src/systems/test-lab-p0-online.js"
]) {
  if (exists(removed)) fail(`removed module still exists: ${removed}`);
  mustNotInclude(html, removed, `script tag for ${removed}`);
}

mustInclude(html, "src/systems/test-lab-ui.js");
mustInclude(html, "styles/test-lab.css");

// 도감이 카탈로그에서 파생되는지 확인한다.
for (const token of [
  "buildInfantryCards",
  "buildVehicleCards",
  "buildObjectCards",
  "INFANTRY_WEAPONS",
  "sceneryCatalog?.obstacleKinds",
  "PLAYABLE_INFANTRY_WEAPON_IDS"
]) {
  mustInclude(js, token);
}

// 클릭 배치 흐름을 확인한다.
for (const token of [
  "onCanvasMouseDown",
  "cancelPlacement",
  "placeAt(",
  "data-lab-card",
  "data-lab-team",
  "data-lab-tab",
  "spawnInfantryAt",
  "spawnTankAt",
  "spawnHumveeAt",
  "spawnReconDroneAt",
  "placeObjectAt",
  "clearSandbox",
  "lab-place-"
]) {
  mustInclude(js, token);
}

// 구 모드 분기가 남아있지 않은지 확인한다.
for (const legacy of [
  "renderSkinBody",
  "renderAudioBody",
  "renderBalanceBody",
  "renderHubBody",
  "MODE_META"
]) {
  mustNotInclude(js, legacy, `legacy mode code ${legacy}`);
}

for (const selector of [
  ".test-lab-panel",
  ".test-lab-tabs",
  ".test-lab-card",
  ".test-lab-team",
  ".test-lab-ghost",
  "body.test-lab-placing canvas"
]) {
  mustInclude(css, selector);
}

mustInclude(hud, "if (game.testLab)");
mustInclude(hud, "game.testLabAiPaused = false");
mustInclude(main, "this.testLabAiPaused = false");
mustInclude(main, "this.conquest.score[TEAM.BLUE] = 0");
mustInclude(main, "this.conquest.score[TEAM.RED] = 0");
mustInclude(renderer, "Math.max(1, rawDpr)");
mustInclude(renderer, "if (!game.testLab)");
mustInclude(combatHud, "if (game.testLab) return");
mustNotInclude(combatHud, "game.matchStarted || game.testLab");
mustInclude(renderer, "F4 인공지능");

console.log("test lab sandbox check passed");
