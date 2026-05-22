"use strict";

(function registerInfantryCombatBalance(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { clamp, distXY } = IronLine.math;

  function difficultyProfile(game) {
    const difficulty = game?.matchConfig?.difficulty || "normal";
    if (difficulty === "easy") {
      return { reactionScale: 1.22, accuracyBonus: -0.08, cooldownScale: 1.16, cooldownAdd: 0.12 };
    }
    if (difficulty === "hard") {
      return { reactionScale: 0.9, accuracyBonus: 0.04, cooldownScale: 0.94, cooldownAdd: -0.04 };
    }
    return { reactionScale: 1, accuracyBonus: 0, cooldownScale: 1, cooldownAdd: 0 };
  }

  function antiDroneAccuracyBonus({ unit, target, weapon }) {
    if (!unit || !target?.isDrone || !weapon) return 0;
    const distance = distXY(unit.x, unit.y, target.x, target.y);
    const range = IronLine.combat?.smallArmsRange?.(weapon, unit, weapon.range) || weapon.range || 560;
    const speed = Number.isFinite(target.currentSpeed)
      ? Math.abs(target.currentSpeed)
      : Math.abs(target.speed || 0) * (target.boosting ? target.boostSpeedMultiplier || 1.6 : 1);
    let bonus = target.droneRole === "attack" ? 0.055 : 0.035;
    if (unit.classId === "scout") bonus += 0.035;
    if (weapon.id === "lmg" || weapon.id === "machinegun") bonus += 0.025;
    if (unit.isProne) bonus += 0.02;
    bonus -= clamp(distance / Math.max(range, 1), 0, 1) * 0.045;
    bonus -= clamp(speed / 900, 0, 1) * 0.045;
    bonus -= clamp((unit.suppression || 0) / 150, 0, 0.07);
    return clamp(bonus, -0.09, 0.09);
  }

  IronLine.InfantryCombatBalance = {
    difficultyProfile,
    antiDroneAccuracyBonus
  };
})(window);
