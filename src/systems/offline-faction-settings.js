"use strict";

(function registerOfflineFactionSettings(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  if (!IronLine.Game?.prototype?.setMatchSetting) return;

  const original = IronLine.Game.prototype.setMatchSetting;
  if (original.__offlineFactionSettings) return;

  function normalizeFactionId(value) {
    return IronLine.playerFactionById?.(value)?.id || IronLine.playerSkinById?.(value)?.id || "";
  }

  function patchedSetMatchSetting(key, value) {
    if (key !== "blueFactionId" && key !== "redFactionId") return original.call(this, key, value);
    if (!this.deploymentOpen || this.countdownStarted || this.matchStarted) return false;
    const factionId = normalizeFactionId(value);
    if (!factionId) return false;
    this.matchConfig = this.matchConfig || this.defaultMatchConfig?.() || {};
    if (this.matchConfig[key] === factionId) return true;
    this.matchConfig[key] = factionId;
    this.scenarioDirty = true;
    this.resetScenarioForMatch();
    return true;
  }

  patchedSetMatchSetting.__offlineFactionSettings = true;
  IronLine.Game.prototype.setMatchSetting = patchedSetMatchSetting;
})(window);
