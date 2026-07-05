"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(message) {
  console.error(`Support fire contract check failed: ${message}`);
  process.exitCode = 1;
}

function mustInclude(source, needle, label = needle) {
  if (!source.includes(needle)) fail(`missing ${label}`);
}

const supportFire = read("src/ai/infantry-support-fire.js");

for (const token of [
  "supportTask = mode === \"support-fire\"",
  "role === \"support\"",
  "role === \"security\" && mode === \"hold-wall\"",
  "if (!assaultTask && !supportTask) return null",
  "const cadence = supportTask ? 2 : 3",
  "fireRifleAtPoint"
]) {
  mustInclude(supportFire, token);
}

if (!process.exitCode) console.log("Support fire contract check passed");
