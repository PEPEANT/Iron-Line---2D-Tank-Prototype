"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
const readiness = fs.readFileSync(path.join(root, "src/systems/ai-scale-readiness.js"), "utf8");
const perfCheck = fs.readFileSync(path.join(root, "tools/check-ai-scale-performance.cjs"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`[ai-lod-continuity] ${message}`);
    process.exitCode = 1;
  }
}

assert(
  /if\s*\(\s*info\.lod\s*===\s*"detailed"\s*\)[\s\S]*?return\s*\{\s*skipAi:\s*false,\s*dt\s*\}/.test(main),
  "detailed LOD actors must bypass throttling and update AI every frame"
);

assert(
  /LOD_RULES\[lod\]\.updateRateMs\s*\*\s*\(\s*lod\s*===\s*"detailed"\s*\?\s*1\s*:\s*loadScale\s*\)/.test(readiness),
  "detailed LOD update rate must not receive actor-count load scaling"
);

assert(
  /detailedMovementContinuous/.test(perfCheck) && /freezeJumpEvents/.test(perfCheck),
  "AI scale performance check must gate visible movement continuity"
);

if (!process.exitCode) {
  console.log("[ai-lod-continuity] detailed LOD continuity contract OK");
}
