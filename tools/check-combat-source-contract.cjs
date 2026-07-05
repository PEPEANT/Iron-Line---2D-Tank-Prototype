"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "systems", "combat.js"), "utf8");
const humveeSource = fs.readFileSync(path.join(root, "src", "entities", "humvee.js"), "utf8");

function fail(message) {
  console.error(`Combat source contract check failed: ${message}`);
  process.exitCode = 1;
}

if (!source.includes("hitInfantryUnit.takeDamage(ammo.infantryDamage || ammo.damage, shell);")) {
  fail("direct projectile infantry hit must pass the shell source into takeDamage");
}

if (!source.includes("recordKillIfDestroyed(game, shell.owner || shell, hitInfantryUnit")) {
  fail("direct projectile infantry kill must keep shell owner/source for scoring");
}

if (!source.includes("const blastSource = {") || !source.includes("unit.takeDamage(damage * (ammo.infantryDamageScale ?? 1) * falloff * exposure * proneScale, blastSource);")) {
  fail("blast radius infantry damage must pass a blast source into takeDamage");
}

if (!humveeSource.includes("unit.takeDamage(options.damage, options.damageSource ||") || !humveeSource.includes("weaponId: \"vehicle_bailout\"")) {
  fail("Humvee bailout passenger damage must pass a source into takeDamage");
}

if (!source.includes("tank.takeDamage(game, 0.01, {") || !source.includes("cause: `${weapon.id || \"small-arms\"}_direct`")) {
  fail("small-arms vehicle destruction must pass weapon source into takeDamage");
}

if (!process.exitCode) console.log("Combat source contract check passed");
