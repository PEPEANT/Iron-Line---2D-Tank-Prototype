"use strict";

(function registerInfantryBaseEgress(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const InfantryAI = IronLine.InfantryAI;
  if (!InfantryAI) return;
  const { distXY, angleTo } = IronLine.math;

  function baseEgressTarget(order) {
    if (!order?.point || !this.game?.world?.baseExitPoints) return null;
    const exit = this.game.world.baseExitPoints[this.unit.team];
    if (!exit) return null;
    const ownBase = (this.game.world.safeZones || []).find((zone) => zone.team === this.unit.team);
    if (!ownBase) return null;
    const insideBase = distXY(this.unit.x, this.unit.y, ownBase.x, ownBase.y) <= (ownBase.radius || 0);
    if (!insideBase) return null;
    const objectiveInsideBase = distXY(order.point.x, order.point.y, ownBase.x, ownBase.y) <= (ownBase.radius || 0) + 40;
    if (objectiveInsideBase) return null;
    const exitRadius = Math.max(54, Math.min(110, exit.radius || 80));
    if (distXY(this.unit.x, this.unit.y, exit.x, exit.y) <= exitRadius + 18) return null;
    const side = ((order.roleSlotIndex || 0) - ((order.roleSlotCount || 1) - 1) / 2) * 20;
    const sideAngle = angleTo(ownBase.x, ownBase.y, exit.x, exit.y) + Math.PI / 2;
    return this.clampMoveTarget({
      x: exit.x + Math.cos(sideAngle) * side,
      y: exit.y + Math.sin(sideAngle) * side,
      stopDistance: exitRadius,
      final: false,
      baseEgress: true
    });
  }

  InfantryAI.prototype.baseEgressTarget = baseEgressTarget;
})(window);
