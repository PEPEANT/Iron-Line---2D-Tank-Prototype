"use strict";

(function registerDeploymentUI(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { INFANTRY_WEAPONS, INFANTRY_CLASSES } = IronLine.constants;

  class DeploymentUI {
    constructor(hud) {
      this.hud = hud;
    }

    get nodes() {
      return this.hud.nodes;
    }

    ensureLoadoutPanel() {
      const ui = this.nodes;
      if (ui.deploymentLoadout || !ui.deploymentClassList) return;

      const panel = document.createElement("div");
      panel.id = "deploymentLoadout";
      panel.className = "deployment-loadout hidden";

      const head = document.createElement("div");
      head.className = "deployment-loadout-head";
      const titleWrap = document.createElement("span");
      const eyebrow = document.createElement("small");
      eyebrow.textContent = "로드아웃";
      const title = document.createElement("strong");
      title.id = "deploymentLoadoutTitle";
      const role = document.createElement("em");
      role.id = "deploymentLoadoutRole";
      titleWrap.append(eyebrow, title);
      const backButton = document.createElement("button");
      backButton.id = "deploymentClassBack";
      backButton.type = "button";
      backButton.className = "deployment-loadout-change";
      backButton.textContent = "병과 변경";
      head.append(titleWrap, role, backButton);

      const slots = document.createElement("div");
      slots.id = "deploymentLoadoutSlots";
      slots.className = "deployment-loadout-slots";

      const summary = document.createElement("p");
      summary.id = "deploymentLoadoutSummary";
      summary.className = "deployment-loadout-summary";

      panel.append(head, slots, summary);
      ui.deploymentClassList.insertAdjacentElement("afterend", panel);
      ui.deploymentLoadout = panel;
      ui.deploymentLoadoutTitle = title;
      ui.deploymentLoadoutRole = role;
      ui.deploymentLoadoutSlots = slots;
      ui.deploymentLoadoutSummary = summary;
      ui.deploymentClassBack = backButton;
      backButton.addEventListener("click", () => this.hud.setDeploymentLoadoutOpen(false));
    }

    update(game) {
      const ui = this.nodes;
      if (!ui.deploymentScreen) return;

      const mobileLayout = this.isMobileDeploymentLayout();
      ui.deploymentScreen.classList.toggle("hidden", !game.deploymentOpen);
      ui.deploymentScreen.classList.toggle("mobile-deployment", Boolean(game.deploymentOpen && mobileLayout));
      if (!game.deploymentOpen || !mobileLayout) this.hud.deploymentMapOpen = false;
      this.hud.setDeploymentMapOpen?.(Boolean(game.deploymentOpen && mobileLayout && this.hud.deploymentMapOpen));

      if (!this.hud.deploymentClassesBuilt) this.renderClassCards(game);
      if (!game.deploymentOpen) this.hud.deploymentLoadoutOpen = false;
      if (game.deploymentOpen && mobileLayout) this.hud.deploymentLoadoutOpen = true;
      this.hud.setDeploymentLoadoutOpen(this.hud.deploymentLoadoutOpen && game.deploymentOpen);

      if (!this.hud.deploymentMapBuilt) {
        this.hud.buildDeploymentMap(game);
        this.hud.deploymentMapBuilt = true;
      }

      ui.classButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.classId === game.player.classId);
      });
      this.updateLoadout(game);

      ui.modeButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.modeId === game.matchConfig.mode);
      });

      if (ui.deploymentStart) {
        ui.deploymentStart.textContent = game.sessionMode === "online" ? "로비로 이동" : "전투 시작";
      }

      if (ui.deploymentMapToggle) {
        ui.deploymentMapToggle.textContent = this.hud.deploymentMapOpen ? "작전 지도 닫기" : "작전 지도 보기";
        ui.deploymentMapToggle.setAttribute("aria-expanded", this.hud.deploymentMapOpen ? "true" : "false");
      }

      ui.settingControls.forEach((control) => {
        const key = control.dataset.setting;
        if (!key || document.activeElement === control) return;
        const value = game.matchConfig[key];
        if (value !== undefined) control.value = value;
      });
    }

    isMobileDeploymentLayout() {
      const narrow = window.matchMedia?.("(max-width: 720px)")?.matches;
      const shortLandscape = window.matchMedia?.("(max-height: 620px) and (orientation: landscape)")?.matches;
      return Boolean(narrow || shortLandscape);
    }

    classLoadout(classId, game = null) {
      const infantryClass = INFANTRY_CLASSES?.[classId] || INFANTRY_CLASSES?.infantry;
      const equipment = game?.deploymentEquipmentForClass?.(classId) || infantryClass?.equipment || [];
      return {
        infantryClass,
        slots: [0, 1, 2].map((index) => {
          const weaponId = equipment[index];
          const weapon = weaponId ? INFANTRY_WEAPONS[weaponId] : null;
          const choices = game?.equipmentChoiceOptions?.(classId, index) ||
            infantryClass?.equipmentChoices?.[index] ||
            infantryClass?.equipmentChoices?.[String(index)] ||
            [];
          return {
            index,
            weaponId,
            weapon,
            choices,
            label: ["1", "2", "3"][index],
            role: this.loadoutSlotRole(index, weapon),
            ammo: this.loadoutAmmoText(infantryClass, weapon)
          };
        })
      };
    }

    loadoutSlotRole(index, weapon) {
      if (!weapon) return index === 2 ? "장비" : "빈 슬롯";
      if (weapon.type === "rpg") return "대전차";
      if (weapon.type === "repair") return "지원";
      if (weapon.id === "grenadeLauncher") return "유탄";
      if (weapon.type === "grenade") return "투척";
      if (weapon.type === "drone") return weapon.droneRole === "attack" ? "타격" : "정찰";
      if (index === 0) return "주무기";
      if (index === 1) return "보조";
      return "장비";
    }

    loadoutAmmoText(infantryClass, weapon) {
      if (!weapon?.ammoKey) return "";
      const configured = infantryClass?.defaultAmmo?.[weapon.ammoKey];
      const ammo = configured ?? (weapon.type === "gun" ? weapon.defaultAmmo : weapon.defaultAmmo ?? 0);
      if (ammo === undefined || ammo === null) return "";
      if (weapon.type === "repair") return `${ammo}회`;
      if (weapon.type === "grenade") return `${ammo}개`;
      if (weapon.type === "drone") return `${ammo}기`;
      return `${ammo}발`;
    }

    loadoutSummaryText(classId) {
      if (classId === "engineer") return "RPG, 수리, 공병 장비 운용";
      if (classId === "scout") return "장거리 관측과 표적 보고 특화";
      return "화력 유지와 근거리 제압 특화";
    }

    renderClassCards(game) {
      const ui = this.nodes;
      ui.classButtons.forEach((button) => {
        const classId = button.dataset.classId;
        const { infantryClass, slots } = this.classLoadout(classId, game);
        if (!infantryClass) return;

        button.textContent = "";
        const head = document.createElement("span");
        head.className = "deployment-class-head";

        const name = document.createElement("strong");
        name.textContent = infantryClass.name || classId;
        const summary = document.createElement("em");
        summary.textContent = this.loadoutSummaryText(classId);
        head.append(name, summary);

        const slotRow = document.createElement("span");
        slotRow.className = "deployment-class-slots";
        for (const slot of slots) {
          const item = document.createElement("span");
          item.className = `deployment-mini-slot${slot.weapon ? "" : " empty"}`;
          const key = document.createElement("b");
          key.textContent = slot.label;
          const weapon = document.createElement("span");
          weapon.textContent = slot.weapon?.shortName || "비어 있음";
          item.append(key, weapon);
          slotRow.append(item);
        }

        button.append(head, slotRow);
      });

      this.hud.deploymentClassesBuilt = true;
      this.updateLoadout(game);
    }

    updateLoadout(game) {
      const ui = this.nodes;
      if (!ui.deploymentLoadoutSlots) return;

      const classId = game.player.classId || "infantry";
      const { infantryClass, slots } = this.classLoadout(classId, game);
      if (!infantryClass) return;
      const signature = `${classId}:${slots.map((slot) => `${slot.weaponId || ""}:${slot.ammo || ""}:${(slot.choices || []).join("|")}`).join(",")}`;
      if (ui.deploymentLoadoutSlots.dataset.signature === signature) return;

      if (ui.deploymentLoadoutTitle) ui.deploymentLoadoutTitle.textContent = infantryClass.name || classId;
      if (ui.deploymentLoadoutRole) ui.deploymentLoadoutRole.textContent = this.loadoutSummaryText(classId);
      if (ui.deploymentLoadoutSummary) ui.deploymentLoadoutSummary.textContent = infantryClass.description || "";

      ui.deploymentLoadoutSlots.textContent = "";
      ui.deploymentLoadoutSlots.dataset.signature = signature;
      for (const slot of slots) {
        const row = document.createElement("div");
        row.className = `deployment-loadout-slot${slot.weapon ? "" : " empty"}`;

        const key = document.createElement("span");
        key.className = "loadout-key";
        key.textContent = slot.label;

        const body = document.createElement("span");
        body.className = "loadout-body";
        const role = document.createElement("small");
        role.textContent = slot.role;
        const weapon = document.createElement("strong");
        weapon.textContent = slot.weapon?.name || "비어 있음";
        body.append(role, weapon);

        const actions = document.createElement("span");
        actions.className = "loadout-actions";

        const ammo = document.createElement("span");
        ammo.className = "loadout-ammo";
        ammo.textContent = slot.ammo || "-";
        actions.append(ammo);

        if (slot.choices?.length > 1) {
          const choiceRow = document.createElement("span");
          choiceRow.className = "loadout-choice-row";
          for (const choiceId of slot.choices) {
            const choice = INFANTRY_WEAPONS[choiceId];
            if (!choice) continue;
            const choiceButton = document.createElement("button");
            choiceButton.type = "button";
            choiceButton.className = "loadout-swap loadout-choice";
            choiceButton.dataset.loadoutChoiceSlot = String(slot.index);
            choiceButton.dataset.loadoutChoiceWeapon = choiceId;
            choiceButton.classList.toggle("active", choiceId === slot.weaponId);
            choiceButton.textContent = choice.shortName || choice.name || choiceId;
            choiceButton.addEventListener("click", (event) => {
              event.stopPropagation();
              if (game.setDeploymentEquipmentChoice?.(slot.index, choiceId)) this.updateLoadout(game);
            });
            choiceRow.append(choiceButton);
          }
          actions.append(choiceRow);
        }

        row.append(key, body, actions);
        ui.deploymentLoadoutSlots.append(row);
      }
    }
  }

  IronLine.DeploymentUI = DeploymentUI;
})(window);
