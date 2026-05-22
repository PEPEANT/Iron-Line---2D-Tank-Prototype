(function registerInfantryTacticalMap(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const proto = IronLine.InfantryAI?.prototype;
  if (!proto || proto.__tacticalMapCoverPatch) return;

  const originalFindCoverPoint = proto.findCoverPoint;
  if (typeof originalFindCoverPoint !== "function") return;

  proto.findCoverPoint = function findCoverPointWithTacticalMap(threat) {
    const tacticalCover = this.game.tacticalMap?.bestCoverNodeFor?.(this.unit, threat, {
      maxDistance: this.coverSearchRadius(),
      objectiveName: this.order?.objectiveName || this.order?.point?.name || ""
    });
    if (tacticalCover) {
      return this.game.coverSlots
        ? this.game.coverSlots.reserve(this.unit, tacticalCover, 1.4) || tacticalCover
        : tacticalCover;
    }
    return originalFindCoverPoint.call(this, threat);
  };

  proto.__tacticalMapCoverPatch = true;
})(window);
