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
      defaultAmmo: { grenade: 2 },
      description: "점령과 제압"
    },
    engineer: {
      id: "engineer",
      name: "공병",
      shortName: "공병",
      equipment: ["machinegun", "rpg", "repairKit"],
      defaultAmmo: { rpg: 2, repairKit: 2 },
      description: "대전차와 수리"
    },
    scout: {
      id: "scout",
      name: "정찰",
      shortName: "정찰",
      equipment: ["sniper", "pistol", null],
      defaultAmmo: {},
      description: "장거리 사격과 감시"
    }
  };

  const PLAYER_CLASS_ORDER = ["infantry", "engineer", "scout"];

  IronLine.constants.INFANTRY_CLASSES = INFANTRY_CLASSES;
  IronLine.constants.PLAYER_CLASS_ORDER = PLAYER_CLASS_ORDER;
})(window);
