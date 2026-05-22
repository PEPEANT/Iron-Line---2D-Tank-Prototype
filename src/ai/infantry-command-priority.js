"use strict";

(function registerInfantryCommandPriority(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const InfantryAI = IronLine.InfantryAI;
  if (!InfantryAI) return;

  const { distXY } = IronLine.math;

  Object.assign(InfantryAI.prototype, {
    commandEmergencyOverride(contact, tankThreat) {
      if (tankThreat) return true;
      if ((this.unit.suppression || 0) >= 72) return true;
      if (!contact) return false;
      return distXY(this.unit.x, this.unit.y, contact.x, contact.y) < 170;
    }
  });
})(window);
