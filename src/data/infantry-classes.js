"use strict";

(function registerInfantryClasses(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  IronLine.constants = IronLine.constants || {};

  const INFANTRY_CLASSES = {
    infantry: {
      id: "infantry",
      name: "보병",
      shortName: "보병",
      equipment: ["rifle", "pistol", "rpg", "reconDrone", "grenade", ""],
      equipmentChoices: {
        0: ["rifle", "machinegun", "sniper"],
        1: ["pistol"],
        2: ["rpg", "grenadeLauncher"],
        3: ["reconDrone", "kamikazeDrone", "repairKit"],
        4: ["grenade"]
      },
      defaultAmmo: { grenade: 3, rpg: 1, reconDrone: 1 },
      description: "점령과 제압"
    },
    engineer: {
      id: "engineer",
      name: "공병",
      shortName: "공병",
      equipment: ["rifle", "pistol", "rpg", "repairKit", "grenade", ""],
      equipmentChoices: {
        0: ["rifle", "machinegun"],
        1: ["pistol"],
        2: ["rpg", "grenadeLauncher"],
        3: ["repairKit", "reconDrone", "kamikazeDrone"],
        4: ["grenade"]
      },
      defaultAmmo: { rpg: 2, grenade: 2, repairKit: 2 },
      description: "대전차와 폭발물"
    },
    scout: {
      id: "scout",
      name: "정찰",
      shortName: "정찰",
      equipment: ["sniper", "pistol", "rpg", "reconDrone", "grenade", ""],
      equipmentChoices: {
        0: ["sniper", "rifle"],
        1: ["pistol"],
        2: ["rpg", "grenadeLauncher"],
        3: ["reconDrone", "kamikazeDrone"],
        4: ["grenade"]
      },
      defaultAmmo: { grenade: 2, reconDrone: 1 },
      description: "장거리 사격"
    }
  };

  const PLAYER_CLASS_ORDER = ["infantry", "engineer", "scout"];

  IronLine.constants.INFANTRY_CLASSES = INFANTRY_CLASSES;
  IronLine.constants.PLAYER_CLASS_ORDER = PLAYER_CLASS_ORDER;
})(window);
