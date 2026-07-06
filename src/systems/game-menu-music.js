"use strict";

(function registerGameMenuMusic(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  function wantsMenuMusic(game) {
    return Boolean(
      game &&
      !game.adminObserverMode &&
      !game.testLab &&
      !game.result &&
      !game.countdownStarted &&
      !game.matchStarted &&
      (game.entryOpen || game.deploymentOpen || game.lobbyOpen)
    );
  }

  function syncMenuMusic() {
    const active = wantsMenuMusic(this);
    if (this.menuMusicActive === active) return;
    this.menuMusicActive = active;
    if (active) {
      IronLine.audio?.startMenuMusic?.({ volume: 0.28 });
    } else {
      IronLine.audio?.stopMenuMusic?.({ fadeSeconds: 0.45 });
    }
  }

  IronLine.installGameMenuMusic = function installGameMenuMusic(Game) {
    if (!Game?.prototype) return;
    Game.prototype.syncMenuMusic = syncMenuMusic;
  };
})(window);
