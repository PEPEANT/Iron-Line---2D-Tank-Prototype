"use strict";

(function registerAiPathRebuildBudget(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  function nowMs() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  function installAiPathRebuildBudget(Game) {
    if (!Game?.prototype || Game.prototype.consumeAiPathRebuildBudget) return;

    Game.prototype.consumeAiPathRebuildBudget = function consumeAiPathRebuildBudget(actor = null) {
      const frame = Math.floor((this.matchTime || 0) * 60);
      if (this.aiPathRebuildBudgetFrame !== frame) {
        this.aiPathRebuildBudgetFrame = frame;
        this.aiPathRebuildBudgetStart = nowMs();
        this.aiPathRebuildsThisFrame = 0;
      }

      const elapsed = nowMs() - (this.aiPathRebuildBudgetStart || 0);
      const maxPerFrame = Math.max(1, Number(this.aiPathRebuildMaxPerFrame || 1));
      const timeBudget = Math.max(1, Number(this.aiPathRebuildFrameBudgetMs || 5));
      if ((this.aiPathRebuildsThisFrame || 0) >= maxPerFrame || elapsed > timeBudget) {
        if (actor) {
          actor.aiPathRebuildDeferred = (actor.aiPathRebuildDeferred || 0) + 1;
          actor.aiPathRebuildDeferredAt = this.matchTime || 0;
        }
        return false;
      }

      this.aiPathRebuildsThisFrame = (this.aiPathRebuildsThisFrame || 0) + 1;
      if (actor) actor.aiPathRebuildDeferred = 0;
      return true;
    };
  }

  IronLine.installAiPathRebuildBudget = installAiPathRebuildBudget;
})(window);
