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
      this.ensureFactionSettingOptions();

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
      this.updateCollapsedSummaries(game);
    }

    updateCollapsedSummaries(game) {
      const modeSummary = document.querySelector('[data-deployment-summary="mode"]');
      const classSummary = document.querySelector('[data-deployment-summary="class"]');
      const settingsSummary = document.querySelector('[data-deployment-summary="settings"]');

      if (modeSummary) {
        modeSummary.textContent = game.matchConfig?.mode === "conquest" ? "점령전" : "섬멸전";
      }
      if (classSummary) {
        const classId = game.player?.classId || "infantry";
        classSummary.textContent = INFANTRY_CLASSES?.[classId]?.name || "보병";
      }
      if (settingsSummary) {
        const blueName = this.factionName(game.matchConfig?.blueFactionId || "korea");
        const redName = this.factionName(game.matchConfig?.redFactionId || "russia");
        settingsSummary.textContent = `${blueName} vs ${redName}`;
      }
    }

    factionName(id) {
      return IronLine.playerFactionById?.(id)?.name || IronLine.playerSkinById?.(id)?.name || id || "세력";
    }

    ensureFactionSettingOptions() {
      const ui = this.nodes;
      const factions = IronLine.playerFactions || IronLine.playerSkins || [];
      if (!factions.length) return;
      const signature = factions.map((faction) => `${faction.id}:${faction.name}`).join("|");
      for (const control of ui.settingControls || []) {
        const key = control.dataset.setting;
        if ((key !== "blueFactionId" && key !== "redFactionId") || control.dataset.factionOptions === signature) continue;
        const current = control.value;
        control.textContent = "";
        for (const faction of factions) {
          const option = document.createElement("option");
          option.value = faction.id;
          option.textContent = faction.name || faction.id;
          control.append(option);
        }
        control.dataset.factionOptions = signature;
        if (current) control.value = current;
      }
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

    weaponIcon(weaponId, className) {
      if (!weaponId) return null;
      const icon = document.createElement("img");
      icon.className = className;
      icon.src = `assets/weapons/${weaponId}.png`;
      icon.alt = "";
      icon.draggable = false;
      icon.addEventListener("error", () => icon.classList.add("missing"), { once: true });
      return icon;
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
        head.append(name);

        const slotRow = document.createElement("span");
        slotRow.className = "deployment-class-slots";
        for (const slot of slots) {
          const item = document.createElement("span");
          item.className = `deployment-mini-slot${slot.weapon ? "" : " empty"}`;
          const key = document.createElement("b");
          key.textContent = slot.label;
          item.append(key);
          const icon = this.weaponIcon(slot.weaponId, "mini-slot-icon");
          if (icon) item.append(icon);
          const weapon = document.createElement("span");
          weapon.textContent = slot.weapon?.shortName || "";
          item.append(weapon);
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
      if (ui.deploymentLoadoutRole) ui.deploymentLoadoutRole.textContent = "";
      if (ui.deploymentLoadoutSummary) ui.deploymentLoadoutSummary.textContent = "";

      ui.deploymentLoadoutSlots.textContent = "";
      ui.deploymentLoadoutSlots.dataset.signature = signature;
      for (const slot of slots) {
        const row = document.createElement("div");
        row.className = `deployment-loadout-slot${slot.weapon ? "" : " empty"}`;

        const key = document.createElement("span");
        key.className = "loadout-key";
        key.textContent = slot.label;

        const art = document.createElement("span");
        art.className = "loadout-weapon-art";
        const artIcon = this.weaponIcon(slot.weaponId, "");
        if (artIcon) art.append(artIcon);

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
            const choiceIcon = this.weaponIcon(choiceId, "loadout-choice-icon");
            if (choiceIcon) choiceButton.append(choiceIcon);
            const choiceName = document.createElement("span");
            choiceName.textContent = choice.shortName || choice.name || choiceId;
            choiceButton.append(choiceName);
            choiceButton.addEventListener("click", (event) => {
              event.stopPropagation();
              if (game.setDeploymentEquipmentChoice?.(slot.index, choiceId)) this.updateLoadout(game);
            });
            choiceRow.append(choiceButton);
          }
          actions.append(choiceRow);
        }

        row.append(key, art, body, actions);
        ui.deploymentLoadoutSlots.append(row);
      }
    }
  }

  IronLine.DeploymentUI = DeploymentUI;
})(window);
