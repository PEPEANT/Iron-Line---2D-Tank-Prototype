"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "assets", "packs", "default", "manifest.json");
const requiredSlots = [
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

function readManifest() {
  if (!fs.existsSync(manifestPath)) {
    fail(`missing ${path.relative(root, manifestPath)}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`invalid JSON: ${error.message}`);
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

const manifest = readManifest();
if (manifest) {
  if (!manifest.id) fail("missing id");
  if (!Number.isFinite(Number(manifest.version))) fail("missing numeric version");
  if (manifest.lockedGameplay !== true) fail("lockedGameplay must be true");
  if (!manifest.slots || typeof manifest.slots !== "object") fail("missing slots object");

  const blocked = containsBlockedGameplayKey(manifest);
  if (blocked.length) fail(`gameplay keys are not allowed in asset packs: ${blocked.join(", ")}`);

  const slots = manifest.slots || {};
  for (const id of requiredSlots) {
    if (!slots[id]) fail(`missing required slot ${id}`);
  }

  for (const [id, slot] of Object.entries(slots)) {
    if (!allowedTypes.has(slot.type)) fail(`${id} has unsupported type ${slot.type}`);
    if (!slot.priority) fail(`${id} missing priority`);
    if (slot.type === "image" && slot.src) {
      const resolved = resolveAssetPath(manifest, slot.src);
      if (resolved && !fs.existsSync(resolved)) {
        fail(`${id} image does not exist: ${path.relative(root, resolved)}`);
      }
    }
  }
}

if (!process.exitCode) {
  console.log(`Asset pack check passed for ${requiredSlots.length} required slots.`);
}
