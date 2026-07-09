"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const packsDir = path.join(root, "assets", "packs");
const defaultManifestPath = path.join(packsDir, "default", "manifest.json");
const weaponsDir = path.join(root, "assets", "weapons");
const uiDir = path.join(root, "assets", "ui");

const requiredDefaultSlots = [
  "combat.tracer.line",
  "combat.muzzle.flash",
  "combat.gun-smoke.puff",
  "combat.explosion.core",
  "combat.explosion.smoke",
  "combat.blast.ring",
  "combat.impact.spark",
  "combat.smoke.cloud",
  "vehicle.wreck.tank",
  "vehicle.wreck.humvee",
  "lobby.background.operation",
  "lobby.hero.screenshot"
];

// Must match INFANTRY_WEAPONS ids in src/data/infantry-weapons.js.
const requiredWeaponArt = [
  "rifle",
  "smg",
  "lmg",
  "machinegun",
  "pistol",
  "sniper",
  "grenade",
  "grenadeLauncher",
  "rpg",
  "repairKit",
  "fieldRadio",
  "reconDrone",
  "kamikazeDrone"
];

const requiredUiArt = [
  "loading-background.png",
  "main-background.png",
  "soubok-title.png",
  "soubok-soldier.png",
  "soubok-button-custom.png",
  "soubok-button-online.png",
  "soubok-button-story.png",
  "soubok-refugee.png",
  "soubok-north-soldier.png",
  "soubok-infantry-prone.png",
  "soubok-infantry-dead.png",
  "soubok-infantry-top.png",
  "infantry/soubok-infantry-stand-01.png",
  "infantry/soubok-infantry-stand-02.png",
  "infantry/soubok-infantry-stand-fire.png",
  "infantry/soubok-infantry-stand-fire-walk.png",
  "infantry/soubok-infantry-prone-crawl-01.png",
  "infantry/soubok-infantry-prone-crawl-02.png",
  "infantry/soubok-infantry-prone-fire.png",
  "infantry/soubok-infantry-prone-no-gun.png",
  "infantry/soubok-infantry-dead-01.png",
  "infantry/soubok-infantry-dead-02.png",
  "infantry/soubok-infantry-dead-prone.png"
];

const allowedTypes = new Set(["effect-style", "canvas-style", "image"]);
const blockedGameplayKeys = new Set([
  "damage",
  "hp",
  "range",
  "reload",
  "speed",
  "team",
  "ai",
  "online",
  "authority",
  "hitbox"
]);

function fail(message) {
  console.error(`Asset pack check failed: ${message}`);
  process.exitCode = 1;
}

function readManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`${path.relative(root, manifestPath)} invalid JSON: ${error.message}`);
    return null;
  }
}

function containsBlockedGameplayKey(value, trail = []) {
  if (!value || typeof value !== "object") return [];
  const findings = [];
  for (const key of Object.keys(value)) {
    const nextTrail = [...trail, key];
    if (blockedGameplayKeys.has(key)) findings.push(nextTrail.join("."));
    findings.push(...containsBlockedGameplayKey(value[key], nextTrail));
  }
  return findings;
}

function resolveAssetPath(manifest, src) {
  const raw = String(src || "");
  if (!raw || /^(?:[a-z]+:)?\/\//iu.test(raw) || raw.startsWith("/") || raw.startsWith("data:")) return null;
  return path.normalize(path.join(root, manifest.basePath || "", raw));
}

function checkManifest(manifestPath, { requiredSlots = [] } = {}) {
  const name = path.relative(root, manifestPath);
  const manifest = readManifest(manifestPath);
  if (!manifest) return 0;

  if (!manifest.id) fail(`${name} missing id`);
  if (!Number.isFinite(Number(manifest.version))) fail(`${name} missing numeric version`);
  if (manifest.lockedGameplay !== true) fail(`${name} lockedGameplay must be true`);
  if (!manifest.slots || typeof manifest.slots !== "object") fail(`${name} missing slots object`);

  const blocked = containsBlockedGameplayKey(manifest);
  if (blocked.length) fail(`${name} gameplay keys are not allowed in asset packs: ${blocked.join(", ")}`);

  const slots = manifest.slots || {};
  for (const id of requiredSlots) {
    if (!slots[id]) fail(`${name} missing required slot ${id}`);
  }

  for (const [id, slot] of Object.entries(slots)) {
    if (!allowedTypes.has(slot.type)) fail(`${name} ${id} has unsupported type ${slot.type}`);
    if (!slot.priority) fail(`${name} ${id} missing priority`);
    if (slot.type === "image" && slot.src) {
      const resolved = resolveAssetPath(manifest, slot.src);
      if (resolved && !fs.existsSync(resolved)) {
        fail(`${name} ${id} image does not exist: ${path.relative(root, resolved)}`);
      }
    }
  }
  return Object.keys(slots).length;
}

let packCount = 0;
let slotCount = 0;

if (!fs.existsSync(defaultManifestPath)) {
  fail(`missing ${path.relative(root, defaultManifestPath)}`);
}

if (fs.existsSync(packsDir)) {
  for (const entry of fs.readdirSync(packsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(packsDir, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    const requiredSlots = manifestPath === defaultManifestPath ? requiredDefaultSlots : [];
    slotCount += checkManifest(manifestPath, { requiredSlots });
    packCount += 1;
  }
}

let weaponArtCount = 0;
for (const id of requiredWeaponArt) {
  const file = path.join(weaponsDir, `${id}.png`);
  if (!fs.existsSync(file)) {
    fail(`missing weapon art assets/weapons/${id}.png (run: node tools/generate-weapon-placeholders.cjs)`);
    continue;
  }
  weaponArtCount += 1;
}

let uiArtCount = 0;
for (const fileName of requiredUiArt) {
  const file = path.join(uiDir, fileName);
  if (!fs.existsSync(file)) {
    fail(`missing UI art assets/ui/${fileName}`);
    continue;
  }
  uiArtCount += 1;
}

const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const lobbyFlowCss = fs.readFileSync(path.join(root, "styles", "lobby-flow.css"), "utf8");
const entryFlow = fs.readFileSync(path.join(root, "src", "systems", "entry-flow.js"), "utf8");
const renderer = fs.readFileSync(path.join(root, "src", "systems", "renderer.js"), "utf8");
const soubokInfantryRenderer = fs.readFileSync(path.join(root, "src", "systems", "renderer-soubok-infantry-art.js"), "utf8");
const corpseRenderer = fs.readFileSync(path.join(root, "src", "systems", "renderer-corpse.js"), "utf8");
for (const asset of [
  "assets/ui/soubok-title.png",
  "assets/ui/soubok-soldier.png",
  "assets/ui/soubok-button-custom.png",
  "assets/ui/soubok-button-online.png",
  "assets/ui/soubok-button-story.png",
  "assets/ui/soubok-refugee.png",
  "assets/ui/soubok-north-soldier.png"
]) {
  if (!index.includes(asset)) fail(`index.html should preload ${asset}`);
  if (!entryFlow.includes(asset)) fail(`entry-flow should render ${asset}`);
}
for (const asset of [
  "assets/ui/soubok-infantry-prone.png",
  "assets/ui/soubok-infantry-dead.png",
  "assets/ui/soubok-infantry-top.png"
]) {
  if (!index.includes(asset)) fail(`index.html should preload ${asset}`);
  if (!renderer.includes(asset) && !soubokInfantryRenderer.includes(asset) && !corpseRenderer.includes(asset)) {
    fail(`renderer should reference ${asset}`);
  }
}
for (const asset of [
  "assets/ui/infantry/soubok-infantry-stand-01.png",
  "assets/ui/infantry/soubok-infantry-stand-02.png",
  "assets/ui/infantry/soubok-infantry-stand-fire.png",
  "assets/ui/infantry/soubok-infantry-stand-fire-walk.png",
  "assets/ui/infantry/soubok-infantry-prone-crawl-01.png",
  "assets/ui/infantry/soubok-infantry-prone-crawl-02.png",
  "assets/ui/infantry/soubok-infantry-prone-fire.png",
  "assets/ui/infantry/soubok-infantry-prone-no-gun.png",
  "assets/ui/infantry/soubok-infantry-dead-01.png",
  "assets/ui/infantry/soubok-infantry-dead-02.png",
  "assets/ui/infantry/soubok-infantry-dead-prone.png"
]) {
  if (!index.includes(asset)) fail(`index.html should preload ${asset}`);
  if (!soubokInfantryRenderer.includes(asset) && !corpseRenderer.includes(asset)) {
    fail(`renderer should reference ${asset}`);
  }
}
for (const className of ["entry-main-title", "entry-main-soldier", "entry-main-refugee", "entry-main-north-soldier", "entry-art-button"]) {
  if (!lobbyFlowCss.includes(className)) fail(`lobby-flow.css missing ${className}`);
}

if (!process.exitCode) {
  console.log(`Asset pack check passed: ${packCount} pack(s), ${slotCount} slot(s), weapon art ${weaponArtCount}/${requiredWeaponArt.length}, UI art ${uiArtCount}/${requiredUiArt.length}.`);
}
