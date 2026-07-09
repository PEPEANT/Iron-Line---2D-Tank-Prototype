"use strict";

(function registerInfantrySupportWeaponStance(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const InfantryAI = IronLine.InfantryAI;
  if (!InfantryAI) return;

  const { angleTo, approach, normalizeAngle } = IronLine.math;

  Object.assign(InfantryAI.prototype, {
    prepareSupportWeaponFire(target, dt = 0.033) {
      const weapon = this.weapon();
      if (!this.isSupportWeapon(weapon)) return true;
      if (!target) return false;

      const prone = Boolean(this.unit.isProne);
      const required = prone ? 0.28 : 0.58;
      const targetAngle = angleTo(this.unit.x, this.unit.y, target.x, target.y);
      this.faceContact(target, dt);
      this.unit.speed = approach(this.unit.speed, 0, 320 * dt);
      this.supportWeaponLockTimer = Math.max(this.supportWeaponLockTimer || 0, 0.24);

      const moving = Math.abs(this.unit.speed || 0) > (prone ? 5 : 8);
      const aligned = Math.abs(normalizeAngle((this.unit.angle || 0) - targetAngle)) <= (prone ? 0.68 : 0.48);
      this.state = prone ? "prone-fire" : "support-align";
      if (moving || !aligned) {
        this.supportWeaponDeployTimer = Math.max(0, (this.supportWeaponDeployTimer || 0) - dt * 1.15);
        return false;
      }

      this.supportWeaponDeployTimer = Math.min(required, (this.supportWeaponDeployTimer || 0) + dt);
      return this.supportWeaponDeployTimer >= required;
    }
  });
})(window);
