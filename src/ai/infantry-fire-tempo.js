"use strict";

(function registerInfantryFireTempo(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const InfantryAI = IronLine.InfantryAI;
  if (!InfantryAI) return;

  Object.assign(InfantryAI.prototype, {
    proneSuppressionThreshold(role = this.squadRole(), weapon = this.weapon(), mode = "contact") {
      if (this.isSupportWeapon(weapon) || role === "support") return mode === "suppressed" ? 16 : 14;
      if (role === "security") return mode === "suppressed" ? 26 : 22;
      return mode === "suppressed" ? 32 : 28;
    },

    canEnterProne(options = {}) {
      const weapon = options.weapon || this.weapon();
      const role = options.role || this.squadRole();
      if (options.force) return true;
      if ((this.unit.proneCooldown || 0) > 0) return false;
      if (weapon.id === "rpg") return false;

      const threshold = this.proneSuppressionThreshold(role, weapon, options.mode);
      if ((this.unit.suppression || 0) < threshold) return false;

      if (options.distance !== undefined && weapon.desiredRange) {
        const support = role === "support" || this.isSupportWeapon(weapon);
        const minScale = support ? 0.58 : role === "security" ? 0.72 : 0.92;
        if (options.distance < weapon.desiredRange * minScale) return false;
      }

      return true;
    },

    fireTargetIdentity(target) {
      if (!target) return "";
      return target.callSign || target.id || `${target.team || "target"}:${target.classId || target.vehicleType || "unit"}:${Math.round((target.x || 0) / 12)}:${Math.round((target.y || 0) / 12)}`;
    },

    contactShotPenalty(target) {
      const config = IronLine.InfantryAIConfig || {};
      const key = this.fireTargetIdentity(target);
      if (key !== this.fireTargetKey) {
        this.fireTargetKey = key;
        this.fireTargetShots = 0;
      }
      if (this.fireTargetShots <= 0) return config.firstContactShotPenalty || 0;
      if (this.fireTargetShots === 1) return config.secondContactShotPenalty || 0;
      return 0;
    }
  });
})(window);
