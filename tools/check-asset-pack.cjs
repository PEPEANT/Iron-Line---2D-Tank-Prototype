"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const packsDir = path.join(root, "assets", "packs");
const defaultManifestPath = path.join(packsDir, "default", "manifest.json");
const weaponsDir = path.join(root, "assets", "weapons");

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
  "reconDrone",
  "kamikazeDrone"
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

if (!process.exitCode) {
  console.log(`Asset pack check passed: ${packCount} pack(s), ${slotCount} slot(s), weapon art ${weaponArtCount}/${requiredWeaponArt.length}.`);
}
