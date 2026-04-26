"use strict";

(function registerInfantryWeapons(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  IronLine.constants = IronLine.constants || {};

  const INFANTRY_WEAPONS = {
    rifle: {
      id: "rifle",
      name: "소총",
      shortName: "소총",
      range: 560,
      desiredRange: 350,
      cooldown: 0.46,
      damageMin: 9,
      damageMax: 13,
      accuracyBonus: 0.05,
      spread: 0.22,
      suppressionHit: 20,
      suppressionMiss: 12,
      lineSuppression: 13,
      impactSuppression: 9,
      tracerLife: 0.09,
      visualLength: 16,
      visualWidth: 5,
      moveSpeedMultiplier: 1
    },
    smg: {
      id: "smg",
      name: "기관단총",
      shortName: "기관단총",
      range: 330,
      desiredRange: 190,
      cooldown: 0.16,
      damageMin: 4,
      damageMax: 7,
      accuracyBonus: -0.02,
      spread: 0.52,
      suppressionHit: 11,
      suppressionMiss: 7,
      lineSuppression: 8,
      impactSuppression: 6,
      tracerLife: 0.07,
      visualLength: 12,
      visualWidth: 6,
      moveSpeedMultiplier: 1.06
    },
    lmg: {
      id: "lmg",
      name: "경기관총",
      shortName: "경기관총",
      range: 650,
      desiredRange: 430,
      cooldown: 0.23,
      damageMin: 5,
      damageMax: 8,
      accuracyBonus: -0.03,
      spread: 0.36,
      suppressionHit: 27,
      suppressionMiss: 18,
      lineSuppression: 22,
      impactSuppression: 14,
      tracerLife: 0.1,
      visualLength: 20,
      visualWidth: 6,
      moveSpeedMultiplier: 0.86
    }
  };

  IronLine.constants.INFANTRY_WEAPONS = INFANTRY_WEAPONS;
})(window);
