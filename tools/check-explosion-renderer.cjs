"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(message) {
  console.error(`Explosion renderer check failed: ${message}`);
  process.exitCode = 1;
}

function mustInclude(source, needle, label = needle) {
  if (!source.includes(needle)) fail(`missing ${label}`);
}

const html = read("index.html");
const renderer = read("src/systems/renderer-explosions.js");
const plan = read("docs/explosion-impact-plan.md");

mustInclude(html, "src/systems/renderer-explosions.js");

for (const token of [
  "drawLayeredExplosions",
  "Renderer.prototype.drawExplosions",
  "drawFireball",
  "drawSmoke",
  "combat.explosion.core",
  "combat.explosion.smoke",
  "globalCompositeOperation",
  "createRadialGradient"
]) {
  mustInclude(renderer, token);
}

mustInclude(plan, "2026-07-05 Codex 렌더 1차");

if (!process.exitCode) console.log("Explosion renderer check passed");
