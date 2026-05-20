"use strict";

(function registerOverlayController(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  class OverlayController {
    constructor(hud) {
      this.hud = hud;
      this.bound = false;
      this.bind();
    }

    bind() {
      if (this.bound) return;
      this.bound = true;
      window.addEventListener("keydown", (event) => this.onKeyDown(event));
      window.addEventListener("pointerdown", (event) => this.onPointerDown(event), true);
    }

    game() {
      return IronLine.game || null;
    }

    onKeyDown(event) {
      if (event.defaultPrevented || event.key !== "Escape") return;
      const game = this.game();
      if (!game) return;
      if (this.dismissTopOverlay(game)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    onPointerDown(event) {
      const target = event.target;
      if (!target) return;

      if (target.id === "onlineRoomListScreen") {
        this.closeRoomList();
        return;
      }

      if (target.id === "entryScreen") {
        this.focusCanvas();
      }
    }

    dismissTopOverlay(game = this.game()) {
      const hud = this.hud;
      const nodes = hud?.nodes || {};

      if (game.chat?.open) {
        game.chat.close();
        return true;
      }

      if (game.roleChange?.open) {
        game.roleChange.close();
        return true;
      }

      if (hud?.commandRadio?.open) {
        hud.commandRadio.toggle(false);
        this.focusCanvas();
        return true;
      }

      if (hud?.deploymentLoadoutOpen) {
        hud.setDeploymentLoadoutOpen(false);
        this.focusCanvas();
        return true;
      }

      if (nodes.settingsPanel && !nodes.settingsPanel.classList.contains("hidden")) {
        hud.toggleSettingsPanel(false);
        this.focusCanvas();
        return true;
      }

      if (nodes.adminPanel && !nodes.adminPanel.classList.contains("hidden") && !game.adminObserverMode) {
        hud.toggleAdminPanel(false);
        this.focusCanvas();
        return true;
      }

      if (game.roomListOpen) {
        return this.closeRoomList();
      }

      return false;
    }

    closeRoomList() {
      const game = this.game();
      if (!game?.roomListOpen) return false;
      if (!game.hud?.sessionFlow?.backToEntry?.()) {
        game.roomListOpen = false;
        game.entryOpen = true;
        game.matchPhase = "entry";
        game.hud?.update?.(game);
      }
      this.focusCanvas();
      return true;
    }

    focusCanvas() {
      this.game()?.canvas?.focus?.();
    }
  }

  IronLine.OverlayController = OverlayController;
})(window);
