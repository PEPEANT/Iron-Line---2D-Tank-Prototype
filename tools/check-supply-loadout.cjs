"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const errors = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fail(message) {
  errors.push(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

function runBrowserScript(sandbox, relativePath) {
  vm.runInNewContext(read(relativePath), sandbox, { filename: relativePath });
}

function checkIndexOrder() {
  const index = read("index.html");
  const expected = [
    "src/data/player-default-loadout.js",
    "src/data/supply-loadout-items.js",
    "src/systems/infantry-slotbar-hud.js",
    "src/systems/vehicle-dashboard-hud.js",
    "src/systems/supply-crates.js",
    "src/systems/renderer-supply-crates.js"
  ];
  let previous = -1;
  for (const needle of expected) {
    const indexAt = index.indexOf(needle);
    expect(indexAt >= 0, `index.html missing ${needle}`);
    expect(indexAt > previous, `index.html loads ${needle} out of order`);
    previous = indexAt;
  }
  expect(index.includes("styles/supply-crates.css"), "index.html missing supply-crates.css");
}

function checkSupplyCrateSource() {
  const source = read("src/systems/supply-crates.js");
  const required = [
    "const HOLD_SECONDS = 0.9",
    "this.sessionMode === \"online\"",
    "supply-blue-base",
    "supply-red-base",
    "supply-mid-field",
    "this.input?.wasConsumed?.(\"KeyE\")",
    "this.supplyCrateHold.elapsed >= HOLD_SECONDS",
    "IronLine.supplyLoadout?.applyItemToPlayer",
    "crate.stock[stockKey] = Math.max(0"
  ];
  for (const needle of required) {
    expect(source.includes(needle), `supply-crates contract missing ${needle}`);
  }
}

function checkPlayerFireModeSource() {
  const source = read("src/systems/game-player-control.js");
  const required = [
    "this.input.consumePress(\"KeyB\")",
    "cyclePlayerFireMode(weapon)",
    "playerWantsWeaponUse(weapon",
    "this.playerFireModeForWeapon(weapon) === \"semi\"",
    "automaticFallback = [\"smg\", \"lmg\", \"machinegun\"].includes(weapon.id)",
    "playerFireModeCooldownScale(weapon)"
  ];
  for (const needle of required) {
    expect(source.includes(needle), `player fire mode contract missing ${needle}`);
  }
}

function checkInputConsumptionRuntime() {
  const sandbox = {
    window: {
      innerWidth: 1280,
      innerHeight: 720,
      addEventListener() {}
    }
  };
  runBrowserScript(sandbox, "src/core/input.js");
  const input = new sandbox.window.IronLine.Input();
  input.keys.add("KeyE");
  input.pressed.add("KeyE");
  expect(input.consumePress("KeyE"), "KeyE press should be consumable");
  expect(input.wasConsumed("KeyE"), "consumed KeyE should stay marked for same-frame hold guards");
  expect(input.keyDown("KeyE"), "consuming a press should not cancel the held key state");
  input.endFrame();
  expect(!input.wasConsumed("KeyE"), "consumed keys should clear at endFrame");
  expect(input.keyDown("KeyE"), "held key state should survive endFrame until keyup/clear");
  input.clear();
  expect(!input.keyDown("KeyE"), "clear should release held keys");
}

function checkLoadoutRuntime() {
  const sandbox = {
    window: {},
    console
  };
  runBrowserScript(sandbox, "src/data/constants.js");
  runBrowserScript(sandbox, "src/data/infantry-weapons.js");
  runBrowserScript(sandbox, "src/data/infantry-classes.js");
  runBrowserScript(sandbox, "src/data/player-default-loadout.js");
  runBrowserScript(sandbox, "src/data/supply-loadout-items.js");
  runBrowserScript(sandbox, "src/entities/player.js");

  const IronLine = sandbox.window.IronLine;
  const rifle = IronLine.constants.INFANTRY_WEAPONS.rifle;
  expect(JSON.stringify(rifle.fireModes) === JSON.stringify(["auto", "semi"]), "rifle should expose auto/semi fire modes");
  expect(rifle.defaultFireMode === "auto", "rifle should default to auto fire mode");
  expect(rifle.fireModeCooldownScale?.auto > 0 && rifle.fireModeCooldownScale.auto < 1, "rifle auto mode should reduce player cooldown");

  const defaultPlayer = IronLine.createPlayer({ x: 0, y: 0 });
  expect(defaultPlayer.fireMode === "auto", "player should default to auto fire mode");
  expect(defaultPlayer.fireModes?.rifle === "auto", "player should remember rifle auto mode");

  const slots = IronLine.playerDefaultLoadout.slots();
  expect(slots.length === 6, `default loadout should expose 6 slots, got ${slots.length}`);
  expect(JSON.stringify(slots.map((slot) => slot.key)) === JSON.stringify(["1", "2", "3", "4", "5", "6"]), "slot keys must be 1..6");
  expect(JSON.stringify(IronLine.playerDefaultLoadout.weaponInventory()) === JSON.stringify(["rifle", "", "", "", "", ""]), "default inventory must be rifle plus five empty slots");

  const expectedItems = {
    machinegun: 0,
    sniper: 0,
    smg: 0,
    pistol: 1,
    rpg: 2,
    reconDrone: 3,
    grenade: 4
  };
  for (const [itemId, slotIndex] of Object.entries(expectedItems)) {
    const item = IronLine.supplyLoadout.items[itemId];
    expect(Boolean(item), `missing supply item ${itemId}`);
    expect(item.slotIndex === slotIndex, `${itemId} should fill slot ${slotIndex + 1}`);
    expect(IronLine.supplyLoadout.defaultStock[item.stockKey] > 0, `${itemId} default stock should be positive`);
  }
  expect(!Object.values(IronLine.supplyLoadout.items).some((item) => item.slotIndex === 5), "slot 6 must stay empty until installation items exist");

  const player = {
    weaponInventory: IronLine.playerDefaultLoadout.weaponInventory(),
    equipmentAmmo: IronLine.playerDefaultLoadout.equipmentAmmo(),
    activeSlot: 0,
    setEquipmentSlot(index) {
      this.activeSlot = index;
      return true;
    }
  };

  const checks = [
    ["pistol", 1, "pistol", 36],
    ["rpg", 2, "rpg", 2],
    ["reconDrone", 3, "reconDrone", 1],
    ["grenade", 4, "grenade", 3],
    ["machinegun", 0, "machinegun", 120]
  ];
  for (const [itemId, slotIndex, ammoKey, minAmmo] of checks) {
    const result = IronLine.supplyLoadout.applyItemToPlayer(player, itemId);
    expect(result?.ok, `${itemId} should apply to player`);
    expect(player.weaponInventory[slotIndex] === IronLine.supplyLoadout.items[itemId].weaponId, `${itemId} should occupy slot ${slotIndex + 1}`);
    expect(player.activeSlot === slotIndex, `${itemId} should select slot ${slotIndex + 1}`);
    expect((player.equipmentAmmo[ammoKey] || 0) >= minAmmo, `${itemId} should grant ${ammoKey} ammo`);
  }
}

checkIndexOrder();
checkSupplyCrateSource();
checkPlayerFireModeSource();
checkInputConsumptionRuntime();
checkLoadoutRuntime();

if (errors.length) {
  console.error(`Supply/loadout check failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log("Supply/loadout check passed");
