"use strict";

(function registerOfflineSetup(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  class OfflineSetup {
    constructor(flow) {
      this.flow = flow;
    }

    enter(profile) {
      const game = this.flow.game();
      if (!game) return false;
      game.sessionMode = "offline";
      game.roomListOpen = false;
      game.completeEntryProfile(profile);
      return true;
    }

    startBattle(game) {
      if (game.sessionMode !== "offline" || !game.deploymentOpen || game.matchStarted || game.countdownStarted) return false;
      game.requestMobileFullscreen?.();
      game.resetScenarioForMatch?.();
      game.deploymentOpen = false;
      game.lobbyOpen = false;
      game.roomListOpen = false;
      game.matchPhase = "countdown";
      game.countdownStarted = true;
      game.startCountdown = game.matchStartDelaySeconds?.() || 15;
      game.startLoading = game.defaultStartLoadingState?.() || game.startLoading;
      if (game.startLoading) {
        game.startLoading.active = false;
        game.startLoading.remaining = 0;
        game.startLoading.stepIndex = 0;
      }
      game.canvas?.focus?.();
      return true;
    }
  }

  IronLine.OfflineSetup = OfflineSetup;
})(window);
