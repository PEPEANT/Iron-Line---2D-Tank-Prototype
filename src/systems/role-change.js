"use strict";

(function registerRoleChange(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, INFANTRY_CLASSES } = IronLine.constants;

  class RoleChangeSystem {
    constructor(game) {
      this.game = game;
      this.open = false;
      this.available = false;
      this.reason = "";
      this.nodes = {};
      this.ensure();
      window.addEventListener("keydown", (event) => this.onKeyDown(event), true);
    }

    ensure() {
      if (this.nodes.root) return;

      const prompt = document.createElement("div");
      prompt.id = "roleChangePrompt";
      prompt.className = "role-change-prompt hidden";
      prompt.innerHTML = "<strong>역할 변경 가능</strong><span>E 키를 눌러 역할 변경</span>";

      const panel = document.createElement("section");
      panel.id = "roleChangePanel";
      panel.className = "role-change-panel hidden";
      panel.setAttribute("aria-label", "역할 변경");

      const head = document.createElement("div");
      head.className = "role-change-head";
      const title = document.createElement("strong");
      title.textContent = "역할 변경";
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "닫기";
      close.addEventListener("click", () => this.close());
      head.append(title, close);

      const hint = document.createElement("p");
      hint.id = "roleChangeHint";
      hint.textContent = "점령전 리스폰 또는 아군 스폰 구역에서만 변경할 수 있습니다.";

      const list = document.createElement("div");
      list.className = "role-change-list";

      panel.append(head, hint, list);
      panel.addEventListener("pointerdown", (event) => event.stopPropagation());
      panel.addEventListener("click", (event) => event.stopPropagation());
      document.body.append(prompt, panel);
      this.nodes = { prompt, panel, hint, list, close };
      this.renderChoices();
    }

    onKeyDown(event) {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const editable = target?.matches?.("input, textarea, select") || target?.isContentEditable;
      if (editable) return;
      if (this.game.chat?.open) return;

      if (this.open && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.close();
        return;
      }

      if (event.code !== "KeyE" || !this.canChangeNow().available || this.open) return;
      event.preventDefault();
      event.stopPropagation();
      this.openPanel();
    }

    canChangeNow() {
      const game = this.game;
      if (game?.adminObserverMode) return { available: false, reason: "admin" };
      if (!game?.matchStarted || game.result || game.matchConfig?.mode !== "conquest") {
        return { available: false, reason: "mode" };
      }
      if (game.playerDeathActive || game.playerDowned) {
        return { available: true, reason: "death" };
      }
      if (!game.player || game.player.hp <= 0 || game.player.inTank) {
        return { available: false, reason: "unavailable" };
      }
      const zone = game.playerRoleChangeZone?.();
      if (zone) return { available: true, reason: zone.reason || "spawn" };
      return { available: false, reason: "field" };
    }

    update() {
      const state = this.canChangeNow();
      this.available = state.available;
      this.reason = state.reason;
      this.nodes.prompt?.classList.toggle("hidden", !state.available || this.open || state.reason === "death");
      this.nodes.panel?.classList.toggle("death-ready", state.reason === "death");
      if (this.open && !state.available) this.close();
      if (this.nodes.hint) {
        this.nodes.hint.textContent = state.reason === "death"
          ? "리스폰 전 역할 변경 가능"
          : "아군 스폰/사령부 구역 안에서만 역할을 바꿀 수 있습니다.";
      }
      this.updateDeathButton(state);
    }

    updateDeathButton(state) {
      let hint = document.getElementById("deathRoleChangeHint");
      let button = document.getElementById("deathRoleChangeButton");
      const deathScreen = document.getElementById("deathScreen");
      if (!deathScreen) return;
      if (!hint) {
        hint = document.createElement("small");
        hint.id = "deathRoleChangeHint";
        hint.textContent = "리스폰 전 역할 변경 가능";
        deathScreen.querySelector(".death-card")?.append(hint);
      }
      if (!button) {
        button = document.createElement("button");
        button.id = "deathRoleChangeButton";
        button.type = "button";
        button.textContent = "역할 변경";
        button.addEventListener("click", () => this.openPanel());
        deathScreen.querySelector(".death-card")?.append(button);
      }
      hint.classList.toggle("hidden", !(state.available && state.reason === "death"));
      button.classList.toggle("hidden", !(state.available && state.reason === "death"));
    }

    renderChoices() {
      const list = this.nodes.list;
      if (!list) return;
      list.textContent = "";
      for (const classId of ["infantry", "engineer", "scout"]) {
        const infantryClass = INFANTRY_CLASSES?.[classId];
        if (!infantryClass) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.roleClass = classId;
        button.innerHTML = `<strong>${infantryClass.name || this.classLabel(classId)}</strong><span>${this.roleSummary(classId)}</span>`;
        button.addEventListener("click", () => this.selectRole(classId));
        list.append(button);
      }
    }

    openPanel() {
      if (!this.canChangeNow().available) return false;
      this.open = true;
      this.nodes.panel?.classList.remove("hidden");
      this.nodes.prompt?.classList.add("hidden");
      this.refreshActive();
      this.game.input?.clear?.();
      return true;
    }

    handleInteractPressed() {
      if (!this.canChangeNow().available || this.open) return false;
      return this.openPanel();
    }

    close() {
      this.open = false;
      this.nodes.panel?.classList.add("hidden");
      this.game.canvas?.focus?.();
    }

    selectRole(classId) {
      if (!this.game.applyConquestRoleChange?.(classId, this.reason)) return;
      this.refreshActive();
      this.close();
    }

    refreshActive() {
      const current = this.game.player?.classId || "infantry";
      this.nodes.list?.querySelectorAll("[data-role-class]").forEach((button) => {
        button.classList.toggle("active", button.dataset.roleClass === current);
      });
    }

    classLabel(classId) {
      if (classId === "engineer") return "공병";
      if (classId === "scout") return "정찰";
      return "보병";
    }

    roleSummary(classId) {
      if (classId === "engineer") return "수리, RPG, 공병 장비";
      if (classId === "scout") return "정찰 드론, 저격, 관측";
      return "소총, 기관총, 수류탄";
    }
  }

  IronLine.RoleChangeSystem = RoleChangeSystem;
})(window);
