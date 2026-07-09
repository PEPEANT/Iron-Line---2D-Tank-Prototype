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
    "src/systems/renderer-supply-crates.js",
    "src/systems/player-medical-kit.js"
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
    "blocksMovement: false",
    "stopsProjectiles: false",
    "!this.hud?.fieldRadioOpen",
    "this.input?.wasConsumed?.(\"KeyE\")",
    "shieldGamePointerEvent",
    "this.input?.consumeMousePress?.(0)",
    "this.input?.setMouseButton?.(0, false)",
    "this.supplyCrateHold.elapsed >= HOLD_SECONDS",
    "IronLine.supplyLoadout?.applyItemToPlayer",
    "UNLIMITED_STOCK_LABEL",
    "button.disabled = false"
  ];
  for (const needle of required) {
    expect(source.includes(needle), `supply-crates contract missing ${needle}`);
  }
  expect(!source.includes("crate.stock[stockKey] = Math.max(0"), "supply crate pickups should not decrement stock");
}

function checkStartPreparationSource() {
  const index = read("index.html");
  expect(index.includes("data-setting=\"preparationSeconds\""), "deployment settings missing preparationSeconds");
  expect(index.includes("data-setting=\"countdownSeconds\""), "deployment settings missing countdownSeconds");
  expect(index.includes("src/systems/renderer-deployment-speech.js"), "index.html missing deployment speech renderer");
  expect(index.includes("renderer-deployment-speech.js?v=20260709-leader-speech"), "deployment speech renderer should be cache-busted");

  const session = read("src/systems/game-session-state.js");
  expect(session.includes("preparationSeconds: 10"), "default match config should prepare for 10 seconds");
  expect(session.includes("countdownSeconds: 5"), "default match config should count down for 5 seconds");

  const main = read("src/main.js");
  expect(main.includes("matchStartDelaySeconds(config = this.matchConfig)"), "main should expose matchStartDelaySeconds");
  expect(main.includes("playerDownedBattleContinues()"), "downed state should keep battle simulation alive");
  expect(main.includes("this.playerDownedBattleContinues?.()"), "downed update branch should use battle continuation helper");

  const offline = read("src/systems/offline-setup.js");
  expect(offline.includes("game.matchStartDelaySeconds?.() || 15"), "offline start should use configured preparation delay");

  const speechRenderer = read("src/systems/renderer-deployment-speech.js");
  expect(speechRenderer.includes("\\uBE7C\\uC557\\uAE34") && speechRenderer.includes("\\uB3CC\\uACA9\\uC55E\\uC73C\\uB85C!"), "preparation phase should use squad leader speech and final assault order");
  expect(speechRenderer.includes("\\uAC00\\uC790!") && speechRenderer.includes("\\uD574\\uBCF4\\uC790!"), "preparation phase should include soldier shouts");
  expect(speechRenderer.includes("allies.find((unit) => unit.isSquadLeader)"), "deployment speech should prefer a squad leader speaker");
  expect(speechRenderer.includes("|| allies[0] || player[0]"), "deployment speech should use an allied squad leader before the player fallback");
  expect(speechRenderer.includes("drawDeploymentSpeechBubbles"), "deployment speech bubbles should render during preparation");
  expect(speechRenderer.includes("return;"), "preparation phase should suppress numeric countdown before final countdown");
  const renderer = read("src/systems/renderer.js");
  expect(renderer.includes("\\uBD80\\uC0C1"), "downed overlay should use injury label");
}

function checkPlayerFireModeSource() {
  const source = read("src/systems/game-player-control.js");
  const required = [
    "this.input.consumePress(\"KeyB\")",
    "cyclePlayerFireMode(weapon)",
    "weapon?.type === \"drone\"",
    "trigger.primaryPressed || trigger.spacePressed",
    "playerWantsWeaponUse(weapon",
    "this.playerFireModeForWeapon(weapon) === \"semi\"",
    "automaticFallback = [\"smg\", \"lmg\", \"machinegun\"].includes(weapon.id)",
    "playerFireModeCooldownScale(weapon)"
  ];
  for (const needle of required) {
    expect(source.includes(needle), `player fire mode contract missing ${needle}`);
  }
}

function checkFieldRadioSource() {
  const weapons = read("src/data/infantry-weapons.js");
  expect(weapons.includes("fieldRadio: {"), "INFANTRY_WEAPONS must define fieldRadio");
  expect(weapons.includes("type: \"radio\""), "fieldRadio must use radio type");

  const playerLoadout = read("src/data/player-default-loadout.js");
  expect(playerLoadout.includes("weaponId = \"fieldRadio\""), "slot 6 must normalize to fieldRadio");
  expect(playerLoadout.includes("\"\\uBB34\\uC804\\uAE30\""), "slot 6 role should normalize to 무전기");

  const main = read("src/main.js");
  expect(main.includes("type === \"radio\" && this.hud?.toggleFieldRadioFromTool"), "KeyE must route selected field radio before other interactions");

  const fieldRadioHud = read("src/systems/field-radio-hud.js");
  expect(fieldRadioHud.includes("submitLocalCommand?.(\"move\""), "field radio should issue a move command");
  expect(fieldRadioHud.includes("followPlayer: true"), "field radio command should follow player");
  expect(fieldRadioHud.includes("this.nodes.infantrySlotbar?.classList.add(\"hidden\")"), "field radio should hide the slotbar while active");

  const equipment = read("src/systems/game-drone-system.js");
  expect(equipment.includes("weapon.type === \"radio\""), "radio tools must not fall through to gun firing");

  const weaponRenderer = read("src/systems/renderer-infantry-weapons.js");
  expect(weaponRenderer.includes("fieldRadio(ctx)"), "infantry weapon renderer must draw field radio art");

  const generator = read("tools/generate-weapon-placeholders.cjs");
  expect(generator.includes("fieldRadio(c)"), "weapon placeholder generator must include field radio");
}

function checkDroneDeploymentSource() {
  const source = read("src/systems/game-drone-system.js");
  const required = [
    "returnPlayerToPrimaryAfterDroneUse(weapon)",
    "returnPlayerToPrimaryAfterDroneUse(weapon = null)",
    "activeWeapon?.type !== \"drone\"",
    "player.setEquipmentSlot(0)"
  ];
  for (const needle of required) {
    expect(source.includes(needle), `drone deployment contract missing ${needle}`);
  }
  expect(!source.includes("this.player.activeSlot === 2"), "drone deployment must not depend on stale slot index 2");
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
  expect(JSON.stringify(IronLine.playerDefaultLoadout.weaponInventory()) === JSON.stringify(["rifle", "", "", "", "", "fieldRadio"]), "default inventory must reserve slot 6 for field radio");

  const expectedItems = {
    rifle: 0,
    machinegun: 0,
    sniper: 0,
    pistol: 1,
    rpg: 2,
    grenadeLauncher: 2,
    reconDrone: 3,
    kamikazeDrone: 3,
    repairKit: 3,
    grenade: 4
  };
  for (const [itemId, slotIndex] of Object.entries(expectedItems)) {
    const item = IronLine.supplyLoadout.items[itemId];
    expect(Boolean(item), `missing supply item ${itemId}`);
    expect(item.slotIndex === slotIndex, `${itemId} should fill slot ${slotIndex + 1}`);
    expect(IronLine.supplyLoadout.defaultStock[item.stockKey] > 0, `${itemId} default stock should be positive`);
  }
  const selectable = Object.keys(IronLine.supplyLoadout.items).sort();
  expect(
    JSON.stringify(selectable) === JSON.stringify(["grenade", "grenadeLauncher", "kamikazeDrone", "machinegun", "pistol", "reconDrone", "repairKit", "rifle", "rpg", "sniper"]),
    `supply selectable weapons should hide retired SMG/LMG pickups, got ${selectable.join(", ")}`
  );

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
    ["grenade", 4, "grenade", 3],
    ["rifle", 0, "rifle", 96],
    ["machinegun", 0, "machinegun", 160],
    ["sniper", 0, "sniper", 24],
    ["grenadeLauncher", 2, "grenadeLauncher", 3],
    ["reconDrone", 3, "reconDrone", 1],
    ["kamikazeDrone", 3, "kamikazeDrone", 1],
    ["repairKit", 3, "repairKit", 2]
  ];
  for (const [itemId, slotIndex, ammoKey, minAmmo] of checks) {
    const result = IronLine.supplyLoadout.applyItemToPlayer(player, itemId);
    expect(result?.ok, `${itemId} should apply to player`);
    expect(player.weaponInventory[slotIndex] === IronLine.supplyLoadout.items[itemId].weaponId, `${itemId} should occupy slot ${slotIndex + 1}`);
    expect(player.activeSlot === slotIndex, `${itemId} should select slot ${slotIndex + 1}`);
    expect((player.equipmentAmmo[ammoKey] || 0) >= minAmmo, `${itemId} should grant ${ammoKey} ammo`);
  }

  const repeat = IronLine.supplyLoadout.applyItemToPlayer(player, "rifle");
  expect(repeat?.ok, "reselecting a full/equipped supply item should still succeed");
  expect(player.activeSlot === 0, "reselecting rifle should still switch to slot 1");
}

checkIndexOrder();
checkSupplyCrateSource();
checkStartPreparationSource();
checkPlayerFireModeSource();
checkFieldRadioSource();
checkDroneDeploymentSource();
checkInputConsumptionRuntime();
checkLoadoutRuntime();

if (errors.length) {
  console.error(`Supply/loadout check failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log("Supply/loadout check passed");
