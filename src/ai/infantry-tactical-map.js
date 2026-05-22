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
      const taggedCover = {
        ...tacticalCover,
        tacticalMapId: tacticalCover.coverNodeId || tacticalCover.id || "",
        tacticalMapKind: "cover-node",
        tacticalRisk: Number(tacticalCover.coverMetrics?.exposure ?? tacticalCover.exposureRisk ?? 0)
      };
      return this.game.coverSlots
        ? this.game.coverSlots.reserve(this.unit, taggedCover, 1.4) || taggedCover
        : taggedCover;
    }
    return originalFindCoverPoint.call(this, threat);
  };

  proto.__tacticalMapCoverPatch = true;
})(window);
