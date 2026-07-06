"use strict";

(function registerInfantryClasses(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  IronLine.constants = IronLine.constants || {};

  const INFANTRY_CLASSES = {
    infantry: {
      id: "infantry",
      name: "보병",
      shortName: "보병",
      equipment: ["machinegun", "pistol", "grenade"],
      equipmentChoices: {
        0: ["machinegun", "rifle", "lmg"],
        1: ["pistol", "smg"],
        2: ["grenade", "grenadeLauncher"]
      },
      defaultAmmo: { grenade: 3, grenadeLauncher: 3 },
      description: "점령과 제압"
    },
    engineer: {
      id: "engineer",
      name: "공병",
      shortName: "공병",
      equipment: ["machinegun", "rpg", "repairKit", "", "", "kamikazeDrone"],
      equipmentChoices: {
        0: ["machinegun", "rifle", "smg"],
        1: ["rpg", "grenadeLauncher"],
        2: ["repairKit", "grenade"],
        5: ["kamikazeDrone"]
      },
      defaultAmmo: { rpg: 2, repairKit: 2, grenade: 2, grenadeLauncher: 3, kamikazeDrone: 1 },
      description: "대전차와 수리"
    },
    scout: {
      id: "scout",
      name: "정찰",
      shortName: "정찰",
      equipment: ["sniper", "pistol", "grenade", "", "", "reconDrone"],
      equipmentChoices: {
        0: ["sniper", "rifle"],
        1: ["pistol", "smg"],
        2: ["grenade"],
        5: ["reconDrone"]
      },
      defaultAmmo: { reconDrone: 1, grenade: 2 },
      description: "장거리 사격과 감시"
    }
  };

  const PLAYER_CLASS_ORDER = ["infantry", "engineer", "scout"];

  IronLine.constants.INFANTRY_CLASSES = INFANTRY_CLASSES;
  IronLine.constants.PLAYER_CLASS_ORDER = PLAYER_CLASS_ORDER;
})(window);
