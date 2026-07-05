"use strict";

(function registerPlayerDefaultLoadout(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  IronLine.constants = IronLine.constants || {};

  const PLAYER_LOADOUT_SLOTS = [
    { index: 0, key: "1", role: "주무기", weaponId: "rifle" },
    { index: 1, key: "2", role: "보조무기", weaponId: "" },
    { index: 2, key: "3", role: "중화기", weaponId: "" },
    { index: 3, key: "4", role: "지원장비", weaponId: "" },
    { index: 4, key: "5", role: "투척류", weaponId: "" },
    { index: 5, key: "6", role: "설치류", weaponId: "" }
  ];

  const ZERO_AMMO = {
    rifle: 0,
    smg: 0,
    lmg: 0,
    machinegun: 0,
    pistol: 0,
    sniper: 0,
    grenade: 0,
    grenadeLauncher: 0,
    rpg: 0,
    repairKit: 0,
    reconDrone: 0,
    kamikazeDrone: 0
  };

  function weaponInventory() {
    return PLAYER_LOADOUT_SLOTS.map((slot) => slot.weaponId || "");
  }

  function equipmentAmmo() {
    const weapons = IronLine.constants?.INFANTRY_WEAPONS || {};
    const rifle = weapons.rifle || {};
    return {
      ...ZERO_AMMO,
      rifle: rifle.defaultAmmo ?? 96
    };
  }

  function isDefaultInventory(inventory = []) {
    const expected = weaponInventory();
    if (!Array.isArray(inventory) || inventory.length !== expected.length) return false;
    return expected.every((weaponId, index) => (inventory[index] || "") === weaponId);
  }

  IronLine.constants.PLAYER_LOADOUT_SLOTS = PLAYER_LOADOUT_SLOTS;
  IronLine.playerDefaultLoadout = {
    classId: "infantry",
    weaponId: "rifle",
    slots: () => PLAYER_LOADOUT_SLOTS.map((slot) => ({ ...slot })),
    weaponInventory,
    equipmentAmmo,
    isDefaultInventory
  };
})(window);
