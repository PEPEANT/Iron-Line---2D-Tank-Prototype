"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(message) {
  console.error(`Asset catalog check failed: ${message}`);
  process.exitCode = 1;
}

function mustInclude(source, needle, label = needle) {
  if (!source.includes(needle)) fail(`missing ${label}`);
}

function mustExclude(source, needle, label = needle) {
  if (source.includes(needle)) fail(`forbidden ${label}`);
}

const preview = read("src/systems/test-lab-asset-preview.js");
const css = read("styles/test-lab.css");
const blueprint = read("docs/asset-catalog-blueprint.md");

for (const token of [
  "renderCatalogSection",
  "renderFactionCatalog",
  "renderWeaponCatalog",
  "renderTankSlotCatalog",
  "renderSceneryCatalog",
  "Asset Catalog v1",
  "Runtime view only. No gameplay values are duplicated here.",
  "IronLine.playerFactions",
  "IronLine.constants?.INFANTRY_WEAPONS",
  "IronLine.sceneryCatalog?.obstacleKinds"
]) {
  mustInclude(preview, token);
}

for (const selector of [
  ".test-lab-asset-catalog-section",
  ".test-lab-catalog-group",
  ".test-lab-catalog-grid",
  ".test-lab-catalog-card",
  ".test-lab-catalog-thumb",
  ".test-lab-catalog-object"
]) {
  mustInclude(css, selector);
}

for (const forbidden of [
  "future3d",
  "modelPath",
  "collisionFootprint",
  "coverValue"
]) {
  mustExclude(preview, forbidden);
}

mustInclude(blueprint, "도감 v1은 새 데이터가 아니라 기존 데이터 위의 뷰(view)다");
mustInclude(blueprint, "구현 상태 (2026-07-05 Codex)");

if (!process.exitCode) console.log("Asset catalog check passed");
