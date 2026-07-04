"use strict";

(function registerInfantrySuppressionPosture(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const InfantryAI = IronLine.InfantryAI;
  if (!InfantryAI) return;

  const { approach } = IronLine.math;
  const originalEnterProne = InfantryAI.prototype.enterProne;
  const originalClearProne = InfantryAI.prototype.clearProne;
  const originalUpdate = InfantryAI.prototype.update;
  const supportState = new Set(["suppressed", "prone-fire", "support-fire", "support-suppress-report", "support-align"]);
  const postureBlockedStates = new Set(["mounted-transport", "board-transport", "reboard-transport", "repair-tank", "grenade", "grenade-aim"]);

  function heldProneDuration(ai, options = {}) {
    const role = options.role || ai.squadRole?.() || "";
    const support = role === "support" || ai.isSupportWeapon?.(options.weapon || ai.weapon?.());
    if (options.mode === "support-fire" || ai.state === "support-fire" || ai.state === "support-suppress-report") return support ? 4.2 : 3.1;
    if (options.mode === "suppressed" || ai.state === "suppressed") return support ? 4 : 3.25;
    if (options.mode === "contact" || ai.state === "prone-fire") return support ? 3.2 : 2.45;
    return support ? 2.6 : 1.8;
  }

  Object.assign(InfantryAI.prototype, {
    enterProne(options = {}) {
      const hold = Math.max(Number(options.hold) || 0, heldProneDuration(this, options));
      return originalEnterProne.call(this, { ...options, hold });
    },

    clearProne(cooldown = 1.2, instant = false) {
      if (!instant && this.unit?.isProne && supportState.has(this.state || "")) {
        const suppression = Number(this.unit.suppression) || 0;
        const role = this.squadRole?.() || "";
        const support = role === "support" || this.isSupportWeapon?.();
        const keepThreshold = support ? 14 : 22;
        if (suppression >= keepThreshold) {
          this.unit.proneHoldTimer = Math.max(this.unit.proneHoldTimer || 0, support ? 1.85 : 1.35);
          return false;
        }
      }
      return originalClearProne.call(this, cooldown, instant);
    },

    trySuppressedPostureHold(dt = 0.033) {
      if (!this.unit?.alive || this.unit.inVehicle || postureBlockedStates.has(this.state || "")) return false;
      const suppression = Number(this.unit.suppression) || 0;
      const role = this.squadRole?.() || "";
      const support = role === "support" || this.isSupportWeapon?.();
      const threshold = support ? 30 : 46;
      if (suppression < threshold) return false;

      const threat = this.unit.lastThreat;
      if (!threat || threat.vehicleType || threat.team === this.unit.team) return false;
      const targetAlive = this.isAliveEnemy?.(threat);
      this.state = "prone-fire";
      this.target = targetAlive ? threat : null;
      this.faceContact?.(threat, dt);
      this.enterProne({ mode: "suppressed", role, force: true, hold: support ? 3.6 : 2.9 });
      if (targetAlive && suppression < 88) this.tryFire?.(threat);
      this.unit.speed = approach(this.unit.speed, 0, 300 * dt);
      this.updateDebug?.(null);
      return true;
    },

    update(dt) {
      if (this.trySuppressedPostureHold?.(dt)) return;
      return originalUpdate.call(this, dt);
    }
  });
})(window);
