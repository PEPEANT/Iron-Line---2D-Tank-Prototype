"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(message) {
  console.error(`Explosion debris check failed: ${message}`);
  process.exitCode = 1;
}

function mustInclude(source, needle, label = needle) {
  if (!source.includes(needle)) fail(`missing ${label}`);
}

const html = read("index.html");
const debris = read("src/systems/explosion-debris.js");
const plan = read("docs/explosion-impact-plan.md");

mustInclude(html, "src/systems/explosion-debris.js");

for (const token of [
  "MAX_DEBRIS = 120",
  "LIFE = 60",
  "game.effects.debris",
  "__debrisSeeded",
  "updateEffectsWithExplosionDebris",
  "drawScorchMarksWithDebris",
  "drawDebris",
  "camera.x",
  "ctx.save();"
]) {
  mustInclude(debris, token);
}

mustInclude(plan, "2026-07-05 Codex debris v1");
mustInclude(plan, "src/systems/explosion-debris.js");
mustInclude(plan, "game.effects.debris");

if (!process.exitCode) console.log("Explosion debris check passed");
