"use strict";

(function registerCombatSmallArmsStability(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { clamp } = IronLine.math || {};

  function profile(weapon, shooter, options = {}) {
    if (!weapon || weapon.type && weapon.type !== "gun" || typeof clamp !== "function") {
      return { accuracyBonus: 0, tankAccuracyBonus: 0, spreadScale: 1 };
    }

    const prone = Boolean(shooter?.isProne);
    const speed = Math.abs(Number(shooter?.speed) || 0);
    const moving = options.moving ?? speed > (prone ? 5 : 12);
    const maxSpeed = Math.max(1, Number(shooter?.maxSpeed) || (prone ? 46 : 155));
    const moveRatio = moving ? clamp(speed / maxSpeed, 0.15, 1.25) : 0;
    const id = weapon.id || "";

    let accuracyBonus = 0;
    let tankAccuracyBonus = 0;
    let spreadScale = 1;

    if (id === "machinegun" || id === "lmg") {
      if (prone) {
        accuracyBonus += 0.08;
        tankAccuracyBonus += 0.035;
        spreadScale *= 0.56;
      } else if (moving) {
        accuracyBonus -= 0.11 + moveRatio * 0.2;
        tankAccuracyBonus -= 0.055 + moveRatio * 0.075;
        spreadScale *= 1.7 + moveRatio * 1.15;
      } else {
        accuracyBonus += 0.035;
        tankAccuracyBonus += 0.016;
        spreadScale *= 0.82;
      }
    } else if (id === "sniper") {
      if (prone) {
        accuracyBonus += 0.075;
        tankAccuracyBonus += 0.025;
        spreadScale *= 0.58;
      } else if (moving) {
        accuracyBonus -= 0.14 + moveRatio * 0.22;
        tankAccuracyBonus -= 0.05 + moveRatio * 0.08;
        spreadScale *= 2.05 + moveRatio * 1.35;
      } else {
        accuracyBonus += 0.025;
        spreadScale *= 0.9;
      }
    } else if (id === "rifle") {
      if (prone) {
        accuracyBonus += 0.045;
        tankAccuracyBonus += 0.012;
        spreadScale *= 0.72;
      } else if (moving) {
        accuracyBonus -= moveRatio * 0.055;
        tankAccuracyBonus -= moveRatio * 0.018;
        spreadScale *= 1.08 + moveRatio * 0.28;
      } else {
        accuracyBonus += 0.018;
        spreadScale *= 0.94;
      }
    }

    return { accuracyBonus, tankAccuracyBonus, spreadScale };
  }

  IronLine.combatSmallArmsStability = { profile };
})(typeof window !== "undefined" ? window : globalThis);
