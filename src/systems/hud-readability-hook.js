"use strict";

(function installHudReadabilityHook(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const proto = IronLine.Hud?.prototype;
  if (!proto || proto.updateReadabilityHookInstalled) return;

  const baseUpdate = proto.update;
  proto.update = function updateWithReadabilityStrip(game) {
    const result = baseUpdate?.call(this, game);
    this.updateReadabilityStrip?.(game);
    return result;
  };
  proto.updateReadabilityHookInstalled = true;
})(window);
