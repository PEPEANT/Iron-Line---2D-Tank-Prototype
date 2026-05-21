"use strict";

(function registerRoleChange(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { INFANTRY_CLASSES, INFANTRY_WEAPONS } = IronLine.constants;

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
      close.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.close();
      });
      head.append(title, close);

      const hint = document.createElement("p");
      hint.id = "roleChangeHint";
      hint.textContent = "점령전 리스폰 또는 아군 스폰 구역에서만 변경할 수 있습니다.";

      const list = document.createElement("div");
      list.className = "role-change-list";

      panel.append(head, hint, list);
      this.bindInputShield(panel);
      document.body.append(prompt, panel);
      this.nodes = { root: panel, prompt, panel, hint, list, close };
      this.renderChoices();
    }

    bindInputShield(panel) {
      const shield = (event) => {
        event.stopPropagation();
        if (event.type.startsWith("mouse") || event.type === "contextmenu" || event.type === "dblclick") {
          event.preventDefault();
        }
        this.game.input?.clear?.();
      };
      [
        "pointerdown",
        "pointerup",
        "pointercancel",
        "mousedown",
        "mouseup",
        "click",
        "dblclick",
        "contextmenu"
      ].forEach((type) => panel.addEventListener(type, shield));
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
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.game.input?.clear?.();
          this.openPanel();
        });
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
        const card = document.createElement("article");
        card.className = "role-change-card";
        card.dataset.roleClass = classId;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "role-change-select";
        button.dataset.roleClass = classId;

        const title = document.createElement("strong");
        title.textContent = infantryClass.name || this.classLabel(classId);
        const summary = document.createElement("span");
        summary.textContent = this.roleSummary(classId);
        button.append(title, summary);
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.selectRole(classId);
        });

        const slots = document.createElement("div");
        slots.className = "role-change-slots";
        this.renderSlotChoices(slots, classId);

        card.append(button, slots);
        list.append(card);
      }
    }

    renderSlotChoices(root, classId) {
      const infantryClass = INFANTRY_CLASSES?.[classId];
      const equipment = this.game.deploymentEquipmentForClass?.(classId) || infantryClass?.equipment || [];
      for (let index = 0; index < 3; index += 1) {
        const row = document.createElement("div");
        row.className = "role-change-slot";

        const label = document.createElement("span");
        label.className = "role-change-slot-label";
        label.textContent = `${index + 1} ${this.slotRole(index, equipment[index])}`;

        const choices = document.createElement("span");
        choices.className = "role-change-slot-choices";
        const options = this.game.equipmentChoiceOptions?.(classId, index) ||
          infantryClass?.equipmentChoices?.[index] ||
          infantryClass?.equipmentChoices?.[String(index)] ||
          [];

        for (const weaponId of options) {
          const weapon = INFANTRY_WEAPONS?.[weaponId];
          if (!weapon) continue;
          const choice = document.createElement("button");
          choice.type = "button";
          choice.dataset.roleChoiceClass = classId;
          choice.dataset.roleChoiceSlot = String(index);
          choice.dataset.roleChoiceWeapon = weaponId;
          choice.className = "role-change-choice";
          choice.textContent = weapon.shortName || weapon.name || weaponId;
          choice.classList.toggle("active", equipment[index] === weaponId);
          choice.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.selectChoice(classId, index, weaponId);
          });
          choices.append(choice);
        }

        row.append(label, choices);
        root.append(row);
      }
    }

    openPanel() {
      if (!this.canChangeNow().available) return false;
      this.open = true;
      this.nodes.panel?.classList.remove("hidden");
      this.nodes.prompt?.classList.add("hidden");
      this.renderChoices();
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
      this.game.input?.clear?.();
      this.game.canvas?.focus?.();
    }

    selectRole(classId) {
      if (!this.game.applyConquestRoleChange?.(classId, this.reason)) return;
      this.refreshActive();
      this.game.input?.clear?.();
      this.close();
    }

    selectChoice(classId, slotIndex, weaponId) {
      const currentClass = this.game.player?.classId === classId;
      const changed = this.game.setLoadoutChoiceForClass?.(classId, slotIndex, weaponId, {
        applyCurrent: currentClass,
        resetAmmo: currentClass,
        activeSlot: currentClass ? slotIndex : null
      });
      if (!changed) return false;
      this.renderChoices();
      this.refreshActive();
      this.game.hud?.update?.(this.game);
      this.game.input?.clear?.();
      return true;
    }

    refreshActive() {
      const current = this.game.player?.classId || "infantry";
      this.nodes.list?.querySelectorAll(".role-change-card[data-role-class]").forEach((card) => {
        const active = card.dataset.roleClass === current;
        card.classList.toggle("active", active);
        card.classList.toggle("inactive", !active);
      });
      this.nodes.list?.querySelectorAll(".role-change-select[data-role-class]").forEach((button) => {
        const active = button.dataset.roleClass === current;
        button.classList.toggle("active", active);
        button.classList.toggle("inactive", !active);
        button.setAttribute("aria-pressed", String(active));
      });
      this.nodes.list?.querySelectorAll("[data-role-choice-class]").forEach((button) => {
        const classId = button.dataset.roleChoiceClass;
        const slotIndex = Number(button.dataset.roleChoiceSlot);
        const weaponId = button.dataset.roleChoiceWeapon;
        const equipment = this.game.deploymentEquipmentForClass?.(classId) || INFANTRY_CLASSES?.[classId]?.equipment || [];
        button.classList.toggle("active", equipment[slotIndex] === weaponId);
        button.classList.toggle("inactive-role-choice", classId !== current);
      });
    }

    classLabel(classId) {
      if (classId === "engineer") return "공병";
      if (classId === "scout") return "정찰";
      return "보병";
    }

    roleSummary(classId) {
      if (classId === "engineer") return "RPG, 유탄, 수리/자폭드론";
      if (classId === "scout") return "저격, 정찰드론, 관측";
      return "기관총, 소총, 수류탄/유탄";
    }

    slotRole(index, weaponId = "") {
      const weapon = INFANTRY_WEAPONS?.[weaponId];
      if (weapon?.type === "rpg") return "대전차";
      if (weapon?.id === "grenadeLauncher") return "유탄";
      if (weapon?.type === "grenade") return "투척";
      if (weapon?.type === "repair") return "지원";
      if (weapon?.type === "drone") return weapon.droneRole === "attack" ? "타격" : "정찰";
      if (index === 0) return "주무기";
      if (index === 1) return "보조";
      return "장비";
    }
  }

  IronLine.RoleChangeSystem = RoleChangeSystem;
})(window);
