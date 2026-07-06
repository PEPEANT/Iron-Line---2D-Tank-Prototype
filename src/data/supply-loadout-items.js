"use strict";

(function registerSupplyLoadoutItems(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  IronLine.constants = IronLine.constants || {};

  const SUPPLY_LOADOUT_ITEMS = {
    machinegun: {
      id: "machinegun",
      weaponId: "machinegun",
      slotIndex: 0,
      stockKey: "machinegun"
    },
    lmg: {
      id: "lmg",
      weaponId: "lmg",
      slotIndex: 0,
      stockKey: "lmg"
    },
    sniper: {
      id: "sniper",
      weaponId: "sniper",
      slotIndex: 0,
      stockKey: "sniper"
    },
    smg: {
      id: "smg",
      weaponId: "smg",
      slotIndex: 0,
      stockKey: "smg"
    },
    pistol: {
      id: "pistol",
      weaponId: "pistol",
      slotIndex: 1,
      stockKey: "pistol",
      grantAmmo: 36,
      maxAmmo: 72
    },
    rpg: {
      id: "rpg",
      weaponId: "rpg",
      slotIndex: 2,
      stockKey: "rpg",
      grantAmmo: 2,
      maxAmmo: 4
    },
    grenadeLauncher: {
      id: "grenadeLauncher",
      weaponId: "grenadeLauncher",
      slotIndex: 2,
      stockKey: "grenadeLauncher",
      grantAmmo: 3,
      maxAmmo: 6
    },
    reconDrone: {
      id: "reconDrone",
      weaponId: "reconDrone",
      slotIndex: 5,
      stockKey: "reconDrone",
      grantAmmo: 1,
      maxAmmo: 2
    },
    repairKit: {
      id: "repairKit",
      weaponId: "repairKit",
      slotIndex: 3,
      stockKey: "repairKit",
      grantAmmo: 2,
      maxAmmo: 4
    },
    kamikazeDrone: {
      id: "kamikazeDrone",
      weaponId: "kamikazeDrone",
      slotIndex: 5,
      stockKey: "kamikazeDrone",
      grantAmmo: 1,
      maxAmmo: 2
    },
    grenade: {
      id: "grenade",
      weaponId: "grenade",
      slotIndex: 4,
      stockKey: "grenade",
      grantAmmo: 3,
      maxAmmo: 6
    }
  };

  const DEFAULT_SUPPLY_STOCK = {
    machinegun: 2,
    lmg: 2,
    sniper: 2,
    smg: 3,
    pistol: 4,
    rpg: 2,
    grenadeLauncher: 3,
    reconDrone: 2,
    repairKit: 3,
    kamikazeDrone: 2,
    grenade: 6
  };

  function slots() {
    return IronLine.playerDefaultLoadout?.slots?.() || [];
  }

  function itemList() {
    const weapons = IronLine.constants?.INFANTRY_WEAPONS || {};
    return Object.values(SUPPLY_LOADOUT_ITEMS).filter((item) => weapons[item.weaponId]);
  }

  function itemForWeapon(weaponId) {
    return Object.values(SUPPLY_LOADOUT_ITEMS).find((item) => item.weaponId === weaponId) || null;
  }

  function slotForWeapon(weaponId) {
    const item = itemForWeapon(weaponId);
    return Number.isInteger(item?.slotIndex) ? item.slotIndex : -1;
  }

  function weaponLabel(weaponId) {
    const weapon = IronLine.constants?.INFANTRY_WEAPONS?.[weaponId];
    return weapon?.shortName || weapon?.name || weaponId || "";
  }

  function slotRole(index) {
    const slot = slots()[index];
    return slot?.role || `슬롯 ${index + 1}`;
  }

  function cloneStock(stock = DEFAULT_SUPPLY_STOCK) {
    return { ...DEFAULT_SUPPLY_STOCK, ...(stock || {}) };
  }

  function ensurePlayerSlotShape(player) {
    const slotCount = slots().length || 6;
    if (!Array.isArray(player.weaponInventory)) player.weaponInventory = [];
    while (player.weaponInventory.length < slotCount) player.weaponInventory.push("");
    player.equipmentAmmo = player.equipmentAmmo || {};
  }

  function applyItemToPlayer(player, itemId) {
    const item = SUPPLY_LOADOUT_ITEMS[itemId];
    const weapon = IronLine.constants?.INFANTRY_WEAPONS?.[item?.weaponId];
    if (!player || !item || !weapon) return { ok: false, reason: "invalid" };

    ensurePlayerSlotShape(player);
    const slotIndex = item.slotIndex;
    const alreadyEquipped = player.weaponInventory[slotIndex] === item.weaponId;
    let changed = !alreadyEquipped;

    player.weaponInventory[slotIndex] = item.weaponId;
    if (weapon.ammoKey) {
      const current = Math.max(0, Number(player.equipmentAmmo[weapon.ammoKey]) || 0);
      const grant = Math.max(0, Number(item.grantAmmo) || Number(weapon.defaultAmmo) || 1);
      const maxAmmo = Math.max(grant, Number(item.maxAmmo) || Number(weapon.defaultAmmo) || current + grant);
      const next = Math.min(maxAmmo, current + grant);
      if (next !== current) changed = true;
      player.equipmentAmmo[weapon.ammoKey] = next;
    }

    if (!changed) return { ok: false, reason: "full" };
    player.setEquipmentSlot?.(slotIndex);
    return {
      ok: true,
      item,
      weapon,
      slotIndex,
      label: weaponLabel(item.weaponId),
      slotRole: slotRole(slotIndex)
    };
  }

  IronLine.constants.SUPPLY_LOADOUT_ITEMS = SUPPLY_LOADOUT_ITEMS;
  IronLine.constants.DEFAULT_SUPPLY_STOCK = DEFAULT_SUPPLY_STOCK;
  IronLine.supplyLoadout = {
    items: SUPPLY_LOADOUT_ITEMS,
    defaultStock: DEFAULT_SUPPLY_STOCK,
    itemList,
    itemForWeapon,
    slotForWeapon,
    slotRole,
    weaponLabel,
    cloneStock,
    applyItemToPlayer
  };
})(window);
