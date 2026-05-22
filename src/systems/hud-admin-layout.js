"use strict";

(function registerHudAdminLayout(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const hudAdminLayoutMethods = {
    setAdminStandaloneLayout(layout = "ops", options = {}) {
      if (!document.body?.classList?.contains("admin-standalone-page")) return false;
      const mode = layout === "observer" ? "observer" : "ops";
      this.applyAdminStandaloneLayout(mode);
      if (!options.keepTab) {
        this.adminLayoutChanging = true;
        this.selectAdminTab(mode === "observer" ? "observer" : "ops");
        this.adminLayoutChanging = false;
      }
      return true;
    },

    applyAdminStandaloneLayout(layout = "ops") {
      const mode = layout === "observer" ? "observer" : "ops";
      const expanded = mode !== "observer";
      document.body?.classList?.toggle("admin-ops-expanded", expanded);
      document.body?.classList?.toggle("admin-observer-layout", !expanded);
      if (this.nodes.adminPanel) this.nodes.adminPanel.dataset.adminLayoutMode = mode;
      this.syncAdminStandaloneLayoutButtons(mode);
      IronLine.game?.renderer?.resize?.();
    },

    syncAdminStandaloneLayoutButtons(layout = "") {
      const mode = layout || (document.body?.classList?.contains("admin-observer-layout") ? "observer" : "ops");
      this.nodes.adminLayoutButtons?.forEach((button) => {
        const active = button.dataset.adminLayout === mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    }
  };

  function installHudAdminLayout(Hud) {
    const proto = Hud.prototype;
    const selectAdminTab = proto.selectAdminTab;
    const runAdminAction = proto.runAdminAction;
    const openAdminObserver = proto.openAdminObserver;
    const updateAdminPanel = proto.updateAdminPanel;
    const adminObserverBlock = proto.adminObserverBlock;

    Object.assign(proto, hudAdminLayoutMethods);

    proto.selectAdminTab = function selectAdminTabWithLayout(tabId = "player") {
      const result = selectAdminTab.call(this, tabId);
      if (!this.adminLayoutChanging && document.body?.classList?.contains("admin-standalone-page")) {
        this.applyAdminStandaloneLayout(tabId === "observer" ? "observer" : "ops");
      }
      return result;
    };

    proto.runAdminAction = function runAdminActionWithLayout(action) {
      const result = runAdminAction.call(this, action);
      if (result && action === "room-start" && IronLine.game?.isAdminStandalonePage?.()) {
        this.setAdminStandaloneLayout("observer");
      }
      return result;
    };

    proto.openAdminObserver = function openAdminObserverWithLayout() {
      const result = openAdminObserver.call(this);
      this.setAdminStandaloneLayout?.("observer", { keepTab: true });
      return result;
    };

    proto.updateAdminPanel = function updateAdminPanelWithLayout(game) {
      const result = updateAdminPanel.call(this, game);
      if (game?.isAdminStandalonePage?.()) this.syncAdminStandaloneLayoutButtons();
      return result;
    };

    proto.adminObserverBlock = function adminObserverBlockWithLayoutClass(title, content) {
      const block = adminObserverBlock.call(this, title, content);
      if (content?.id) block.classList.add(`admin-block-${content.id.replace(/[^a-z0-9_-]/gi, "")}`);
      return block;
    };
  }

  IronLine.installHudAdminLayout = installHudAdminLayout;
})(window);
