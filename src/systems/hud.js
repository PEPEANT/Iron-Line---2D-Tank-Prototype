"use strict";

(function registerHud(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, AMMO, INFANTRY_WEAPONS, INFANTRY_CLASSES } = IronLine.constants;

  class Hud {
    constructor() {
      this.objectiveNodes = new Map();
      this.deploymentMapBuilt = false;
      this.deploymentClassesBuilt = false;
      this.deploymentLoadoutOpen = false;
      this.nodes = {
        objectiveStrip: document.getElementById("objectiveStrip"),
        bottomHud: document.querySelector(".hud-bottom"),
        settingsButton: document.getElementById("settingsButton"),
        settingsPanel: document.getElementById("settingsPanel"),
        settingsClose: document.getElementById("settingsClose"),
        adminButton: document.getElementById("adminButton"),
        adminPanel: document.getElementById("adminPanel"),
        adminClose: document.getElementById("adminClose"),
        adminStatus: document.getElementById("adminStatus"),
        adminTabs: Array.from(document.querySelectorAll("[data-admin-tab]")),
        adminPages: Array.from(document.querySelectorAll("[data-admin-page]")),
        adminClassButtons: Array.from(document.querySelectorAll("[data-admin-class]")),
        adminWeaponSelect: document.getElementById("adminWeaponSelect"),
        adminActionButtons: Array.from(document.querySelectorAll("[data-admin-action]")),
        adminSpawnTeam: document.getElementById("adminSpawnTeam"),
        adminSpawnUnit: document.getElementById("adminSpawnUnit"),
        adminSpawnCount: document.getElementById("adminSpawnCount"),
        adminSpawnLocation: document.getElementById("adminSpawnLocation"),
        debugControls: Array.from(document.querySelectorAll("[data-debug-option]")),
        mobileControlsToggle: document.querySelector("[data-mobile-controls]"),
        mobileControls: document.getElementById("mobileControls"),
        orientationOverlay: document.getElementById("orientationOverlay"),
        moveStick: document.getElementById("moveStick"),
        aimStick: document.getElementById("aimStick"),
        mobileWeaponButton: null,
        mobileInteractButton: document.querySelector("[data-mobile-interact], [data-mobile-key='KeyE']"),
        mobileKeyButtons: Array.from(document.querySelectorAll("[data-mobile-key]")),
        mobileMouseButtons: Array.from(document.querySelectorAll("[data-mobile-mouse]")),
        deploymentScreen: document.getElementById("deploymentScreen"),
        deploymentMap: document.getElementById("deploymentMap"),
        deploymentStart: document.getElementById("deploymentStart"),
        deploymentClassList: document.getElementById("deploymentClassList"),
        deploymentLoadout: document.getElementById("deploymentLoadout"),
        deploymentLoadoutTitle: document.getElementById("deploymentLoadoutTitle"),
        deploymentLoadoutRole: document.getElementById("deploymentLoadoutRole"),
        deploymentLoadoutSlots: document.getElementById("deploymentLoadoutSlots"),
        deploymentLoadoutSummary: document.getElementById("deploymentLoadoutSummary"),
        deploymentClassBack: document.getElementById("deploymentClassBack"),
        deathScreen: document.getElementById("deathScreen"),
        deathReason: document.getElementById("deathReason"),
        deathRestartButton: document.getElementById("deathRestartButton"),
        modeButtons: Array.from(document.querySelectorAll("[data-mode-id]")),
        settingControls: Array.from(document.querySelectorAll("[data-setting]")),
        classButtons: Array.from(document.querySelectorAll("[data-class-id]")),
        scoreboard: document.getElementById("scoreboard"),
        scoreboardGrid: document.getElementById("scoreboardGrid"),
        scoreboardTimer: document.getElementById("scoreboardTimer"),
        scoreboardTitle: document.querySelector("#scoreboard .scoreboard-head strong"),
        weaponState: document.getElementById("weaponState"),
        reloadBar: document.getElementById("reloadBar"),
        proneIndicator: null,
        slots: {
          ap: document.getElementById("slot-ap"),
          he: document.getElementById("slot-he"),
          mg: document.getElementById("slot-mg"),
          smoke: document.getElementById("slot-smoke")
        },
        slotLabels: {
          ap: document.querySelector("#slot-ap span"),
          he: document.querySelector("#slot-he span"),
          mg: document.querySelector("#slot-mg span"),
          smoke: document.querySelector("#slot-smoke span")
        },
        ammo: {
          ap: document.getElementById("ammo-ap"),
          he: document.getElementById("ammo-he"),
          mg: document.getElementById("ammo-mg"),
          smoke: document.getElementById("ammo-smoke")
        }
      };

      this.ensureDeploymentLoadoutPanel();
      this.ensureProneIndicator();
      this.nodes.mobileWeaponButton = this.createMobileWeaponButton();

      this.nodes.classButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const game = IronLine.game;
          if (game && game.selectDeploymentClass(button.dataset.classId)) this.setDeploymentLoadoutOpen(true);
        });
      });

      this.nodes.modeButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const game = IronLine.game;
          if (game && !button.disabled) game.setMatchMode(button.dataset.modeId);
        });
      });

      this.nodes.settingControls.forEach((control) => {
        control.addEventListener("input", () => {
          const game = IronLine.game;
          if (game) game.setMatchSetting(control.dataset.setting, control.value);
        });
      });

      this.nodes.settingsButton?.addEventListener("click", () => this.toggleSettingsPanel());
      this.nodes.settingsClose?.addEventListener("click", () => this.toggleSettingsPanel(false));
      this.nodes.adminButton?.addEventListener("click", () => this.toggleAdminPanel());
      this.nodes.adminClose?.addEventListener("click", () => this.toggleAdminPanel(false));
      [this.nodes.adminButton, this.nodes.adminClose].forEach((node) => {
        node?.addEventListener("mousedown", (event) => event.stopPropagation());
        node?.addEventListener("mouseup", (event) => event.stopPropagation());
        node?.addEventListener("click", (event) => event.stopPropagation());
      });
      this.nodes.adminPanel?.addEventListener("mousedown", (event) => event.stopPropagation());
      this.nodes.adminPanel?.addEventListener("mouseup", (event) => event.stopPropagation());
      this.nodes.adminPanel?.addEventListener("click", (event) => event.stopPropagation());
      this.nodes.adminPanel?.addEventListener("keydown", (event) => event.stopPropagation());

      this.nodes.adminTabs.forEach((button) => {
        button.addEventListener("click", () => this.selectAdminTab(button.dataset.adminTab));
      });

      this.nodes.adminClassButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const game = IronLine.game;
          if (game) game.adminSetPlayerClass(button.dataset.adminClass);
        });
      });

      this.nodes.adminWeaponSelect?.addEventListener("change", () => {
        const game = IronLine.game;
        if (game) game.adminSetPlayerWeapon(this.nodes.adminWeaponSelect.value);
      });

      this.nodes.adminActionButtons.forEach((button) => {
        button.addEventListener("click", () => this.runAdminAction(button.dataset.adminAction));
      });

      this.nodes.debugControls.forEach((control) => {
        control.addEventListener("change", () => {
          const game = IronLine.game;
          if (game) game.setDebugOption(control.dataset.debugOption, control.checked);
        });
      });

      this.nodes.mobileControlsToggle?.addEventListener("change", () => {
        const game = IronLine.game;
        if (game) game.setMobileControls(this.nodes.mobileControlsToggle.checked);
      });

      this.bindVirtualStick(this.nodes.moveStick, "move");
      this.bindVirtualStick(this.nodes.aimStick, "aim");
      this.bindVirtualButtons();

      this.nodes.deploymentStart?.addEventListener("click", () => {
        const game = IronLine.game;
        if (game) {
          this.toggleSettingsPanel(false);
          game.beginDeploymentCountdown();
        }
      });

      this.nodes.deathRestartButton?.addEventListener("click", () => {
        const game = IronLine.game;
        if (game) game.restartMatchAfterDeath();
      });
    }

    createMobileWeaponButton() {
      const controls = this.nodes.mobileControls;
      if (!controls) return null;

      const button = document.createElement("button");
      const icon = document.createElement("span");
      button.type = "button";
      button.className = "mobile-action weapon-cycle";
      button.dataset.weapon = "WPN";
      button.setAttribute("aria-label", "weapon switch");
      button.append(icon);
      controls.append(button);
      return button;
    }

    ensureProneIndicator() {
      const root = this.nodes.bottomHud;
      if (!root || this.nodes.proneIndicator) return;

      const indicator = document.createElement("div");
      indicator.className = "prone-indicator hidden";
      indicator.textContent = "PRONE";
      root.insertBefore(indicator, root.firstChild);
      this.nodes.proneIndicator = indicator;
    }

    ensureDeploymentLoadoutPanel() {
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
      backButton.addEventListener("click", () => this.setDeploymentLoadoutOpen(false));
    }

    setDeploymentLoadoutOpen(open) {
      this.deploymentLoadoutOpen = Boolean(open);
      this.nodes.deploymentClassList?.classList.toggle("hidden", this.deploymentLoadoutOpen);
      this.nodes.deploymentLoadout?.classList.toggle("hidden", !this.deploymentLoadoutOpen);
    }

    toggleSettingsPanel(force = null) {
      const panel = this.nodes.settingsPanel;
      if (!panel) return;
      const open = force === null ? panel.classList.contains("hidden") : Boolean(force);
      panel.classList.toggle("hidden", !open);
    }

    toggleAdminPanel(force = null) {
      if (!IronLine.game?.adminEnabled) return;
      const panel = this.nodes.adminPanel;
      if (!panel) return;
      const open = force === null ? panel.classList.contains("hidden") : Boolean(force);
      panel.classList.toggle("hidden", !open);
      if (open) this.toggleSettingsPanel(false);
    }

    selectAdminTab(tabId = "player") {
      const activeId = tabId || "player";
      this.nodes.adminTabs.forEach((button) => {
        button.classList.toggle("active", button.dataset.adminTab === activeId);
      });
      this.nodes.adminPages.forEach((page) => {
        page.classList.toggle("active", page.dataset.adminPage === activeId);
      });
    }

    runAdminAction(action) {
      const game = IronLine.game;
      if (!game?.adminEnabled) return false;
      if (!game || !action) return false;
      if (action === "spawn-selected") {
        return game.adminSpawnTestUnit({
          team: this.nodes.adminSpawnTeam?.value || "red",
          unitType: this.nodes.adminSpawnUnit?.value || "infantry",
          count: this.nodes.adminSpawnCount?.value || 1,
          location: this.nodes.adminSpawnLocation?.value || "mouse"
        });
      }
      return game.handleAdminAction(action);
    }

    bindVirtualStick(stick, type) {
      if (!stick) return;
      const knob = stick.querySelector("span");
      let pointerId = null;

      const update = (event) => {
        const game = IronLine.game;
        if (!game?.input?.virtual.enabled) return;
        const rect = stick.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const max = rect.width * 0.34;
        const rawX = event.clientX - centerX;
        const rawY = event.clientY - centerY;
        const length = Math.hypot(rawX, rawY);
        const scale = length > max ? max / Math.max(length, 1) : 1;
        const x = rawX * scale;
        const y = rawY * scale;
        if (knob) knob.style.transform = `translate(${x}px, ${y}px)`;

        if (type === "move") game.input.setVirtualAxis(x / max, y / max);
        else game.input.setVirtualAim(x / max, y / max);
      };

      const reset = () => {
        if (type === "move") {
          const game = IronLine.game;
          game?.input?.setVirtualAxis(0, 0);
          if (knob) knob.style.transform = "";
        }
        pointerId = null;
      };

      stick.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        pointerId = event.pointerId;
        stick.setPointerCapture?.(pointerId);
        update(event);
      });
      stick.addEventListener("pointermove", (event) => {
        if (pointerId !== event.pointerId) return;
        event.preventDefault();
        update(event);
      });
      stick.addEventListener("pointerup", (event) => {
        if (pointerId !== event.pointerId) return;
        event.preventDefault();
        reset();
      });
      stick.addEventListener("pointercancel", reset);
    }

    bindVirtualButtons() {
      const bindHold = (button, onDown, onUp) => {
        let pointerId = null;
        button.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          pointerId = event.pointerId;
          button.setPointerCapture?.(pointerId);
          onDown();
        });
        const release = (event) => {
          if (pointerId !== null && event?.pointerId !== undefined && event.pointerId !== pointerId) return;
          event?.preventDefault?.();
          pointerId = null;
          onUp();
        };
        button.addEventListener("pointerup", release);
        button.addEventListener("pointercancel", release);
        button.addEventListener("pointerleave", release);
      };

      const bindTap = (button, onTap) => {
        if (!button) return;
        let pointerId = null;
        button.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          pointerId = event.pointerId;
          button.setPointerCapture?.(pointerId);
          button.classList.add("pressed");
          onTap();
        });
        const release = (event) => {
          if (pointerId !== null && event?.pointerId !== undefined && event.pointerId !== pointerId) return;
          event?.preventDefault?.();
          pointerId = null;
          button.classList.remove("pressed");
        };
        button.addEventListener("pointerup", release);
        button.addEventListener("pointercancel", release);
        button.addEventListener("pointerleave", release);
      };

      this.nodes.mobileKeyButtons.forEach((button) => {
        const code = button.dataset.mobileKey;
        bindHold(
          button,
          () => IronLine.game?.input?.setVirtualKey(code, true),
          () => IronLine.game?.input?.setVirtualKey(code, false)
        );
      });

      this.nodes.mobileMouseButtons.forEach((button) => {
        const buttonId = Number(button.dataset.mobileMouse);
        bindHold(
          button,
          () => IronLine.game?.input?.setVirtualMouseButton(buttonId, true),
          () => IronLine.game?.input?.setVirtualMouseButton(buttonId, false)
        );
      });

      bindTap(this.nodes.mobileWeaponButton, () => IronLine.game?.cycleMobileWeapon?.());
    }

    update(game) {
      const ui = this.nodes;

      this.updateObjectiveStrip(game);
      this.updateDeployment(game);
      this.updateDeathScreen(game);
      this.updateScoreboard(game);
      this.updateSettings(game);
      this.updateAdminPanel(game);
      this.updateMobileControls(game);

      const inTank = Boolean(game.player.inTank);
      const showWeaponPanel = !game.deploymentOpen && !game.result && !game.playerDeathActive && game.player.hp > 0 && !this.mobileControlsVisible;
      ui.bottomHud?.classList.toggle("hidden", !showWeaponPanel);
      ui.bottomHud?.classList.toggle("infantry-weapons", showWeaponPanel && !inTank);
      this.updateProneIndicator(game, showWeaponPanel && !inTank);
      if (!showWeaponPanel) return;

      if (inTank) this.updateTankWeapons(game.player.inTank);
      else this.updateInfantryWeapons(game.player, game);
    }

    updateProneIndicator(game, visible) {
      const indicator = this.nodes.proneIndicator;
      if (!indicator) return;
      const player = game.player;
      const transitioning = (player.proneTransitionTimer || 0) > 0;
      const active = visible && !player.controlledDrone && (player.isProne || transitioning);
      indicator.classList.toggle("hidden", !active);
      indicator.classList.toggle("transitioning", transitioning);
      if (!active) return;
      indicator.textContent = transitioning
        ? player.proneTargetState ? "PRONE" : "STAND"
        : "PRONE";
    }

    updateSettings(game) {
      this.nodes.debugControls.forEach((control) => {
        const key = control.dataset.debugOption;
        if (key) control.checked = Boolean(game.debug?.[key]);
      });

      if (this.nodes.mobileControlsToggle) {
        this.nodes.mobileControlsToggle.checked = Boolean(game.settings?.mobileControls);
      }

      this.nodes.settingsButton?.setAttribute(
        "aria-expanded",
        String(!this.nodes.settingsPanel?.classList.contains("hidden"))
      );
    }

    updateAdminPanel(game) {
      const ui = this.nodes;
      if (!game.adminEnabled) {
        ui.adminButton?.classList.add("hidden");
        ui.adminButton?.setAttribute("aria-hidden", "true");
        ui.adminPanel?.classList.add("hidden");
        return;
      }
      ui.adminButton?.classList.remove("hidden");
      ui.adminButton?.setAttribute("aria-hidden", "false");
      ui.adminButton?.setAttribute(
        "aria-expanded",
        String(!ui.adminPanel?.classList.contains("hidden"))
      );

      if (ui.adminStatus) {
        const mode = game.testLab ? `테스트랩 ${game.testLab}` : game.matchStarted ? "실전 실행중" : "배치 준비";
        const ai = game.testLabAiPaused ? "AI 정지" : "AI 작동";
        ui.adminStatus.textContent = game.adminMessage || `${mode} · ${ai}`;
      }

      ui.adminClassButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.adminClass === game.player?.classId);
      });

      if (ui.adminWeaponSelect && document.activeElement !== ui.adminWeaponSelect) {
        const weaponId = game.player?.weaponId || "machinegun";
        if (ui.adminWeaponSelect.value !== weaponId) ui.adminWeaponSelect.value = weaponId;
      }
    }

    updateMobileControls(game) {
      const enabled = Boolean(game.settings?.mobileControls);
      const portrait = window.innerHeight > window.innerWidth;
      const showControls = enabled && !portrait && !game.deploymentOpen && !game.result && !game.playerDeathActive && !game.playerDowned && game.player.hp > 0;
      const inTank = Boolean(game.player?.inTank);
      const controlledDrone = Boolean(game.player?.controlledDrone);
      const canPickupDrone = Boolean(game.nearbyPlayerDroneForPickup?.());
      const canDrone = Boolean(game.activePlayerDrone?.());
      const canInteract = Boolean(canPickupDrone || controlledDrone || canDrone || inTank || game.findMountablePlayerVehicle?.() || game.findMountablePlayerTank?.());

      this.mobileControlsVisible = showControls;

      this.nodes.orientationOverlay?.classList.toggle("visible", enabled && portrait);
      this.nodes.mobileControls?.classList.toggle("hidden", !showControls);
      this.nodes.mobileControls?.classList.toggle("in-tank", inTank);
      this.nodes.mobileControls?.classList.toggle("can-interact", canInteract);
      document.body.classList.toggle("mobile-controls-active", showControls);
      document.body.classList.toggle("mobile-player-in-tank", showControls && inTank);

      if (this.nodes.mobileInteractButton) {
        const label = canPickupDrone ? "\uD68C\uC218" : controlledDrone ? "\uBCF5\uADC0" : canDrone ? "\uB4DC\uB860" : inTank ? "\uD558\uCC28" : "\uD0D1\uC2B9";
        this.nodes.mobileInteractButton.textContent = label;
        this.nodes.mobileInteractButton.setAttribute(
          "aria-label",
          canPickupDrone ? "retrieve drone" : controlledDrone ? "return from drone" : canDrone ? "control drone" : inTank ? "dismount" : "mount"
        );
      }

      this.updateMobileWeaponButton(game, showControls, inTank);
    }

    updateMobileWeaponButton(game, showControls, inTank) {
      const button = this.nodes.mobileWeaponButton;
      if (!button) return;
      const label = inTank ? this.mobileTankWeaponLabel(game.player.inTank) : this.mobileInfantryWeaponLabel(game.player);
      button.dataset.weapon = label;
      button.classList.toggle("hidden", !showControls);
      button.setAttribute("aria-label", `weapon switch ${label}`);
    }

    mobileTankWeaponLabel(tank) {
      if (tank?.vehicleType === "humvee") return `HMG ${tank.ammo?.mg || 0}`;
      if (tank?.weaponMode === "mg") return `MG ${tank.ammo?.mg || 0}`;
      const ammoId = tank?.reload?.active ? tank.reload.ammoId : tank?.loadedAmmo;
      if (ammoId === "he") return `HE ${tank.ammo?.he || 0}`;
      return `AP ${tank?.ammo?.ap || 0}`;
    }

    mobileInfantryWeaponLabel(player) {
      const weapon = player?.getWeapon?.();
      const labels = {
        rifle: "RF",
        smg: "SMG",
        lmg: "LMG",
        machinegun: "MG",
        pistol: "PST",
        sniper: "SR",
        grenade: "GR",
        rpg: "RPG",
        repairKit: "FIX",
        reconDrone: "UAV",
        kamikazeDrone: "FPV"
      };
      const ammo = this.weaponAmmoText(player, weapon);
      return `${labels[weapon?.id] || "WPN"} ${ammo}`;
    }

    updateTankWeapons(tank) {
      if (tank?.vehicleType === "humvee") {
        this.updateHumveeWeapons(tank);
        return;
      }

      const ui = this.nodes;

      for (const id of ["ap", "he"]) {
        if (!ui.slots[id]) continue;
        ui.slots[id].classList.remove("hidden");
        ui.slotLabels[id].textContent = AMMO[id].name;
        ui.ammo[id].textContent = tank.ammo[id];
        ui.slots[id].classList.toggle("empty", tank.ammo[id] <= 0);
        ui.slots[id].classList.toggle("active", tank.weaponMode !== "mg" && (tank.loadedAmmo === id || tank.reload.ammoId === id && tank.reload.active));
      }

      const hasGunner = Boolean(tank.hasMachineGunner?.());
      if (ui.slots.mg) {
        ui.slots.mg.classList.remove("hidden");
        ui.slotLabels.mg.textContent = "기관총 3";
        ui.ammo.mg.textContent = hasGunner ? tank.ammo.mg : "사수 없음";
        ui.slots.mg.classList.toggle("empty", !hasGunner || (tank.ammo.mg || 0) <= 0);
        ui.slots.mg.classList.toggle("active", tank.weaponMode === "mg");
      }

      if (ui.slots.smoke) {
        ui.slots.smoke.classList.remove("hidden");
        ui.slotLabels.smoke.textContent = "연막 Q";
        ui.ammo.smoke.textContent = tank.ammo.smoke;
        ui.slots.smoke.classList.toggle("empty", tank.ammo.smoke <= 0);
        ui.slots.smoke.classList.toggle("active", tank.smokeCooldown > 0);
      }

      if (tank.weaponMode === "mg") {
        if (!hasGunner) {
          ui.weaponState.textContent = "기관총 사수 없음";
          ui.reloadBar.style.width = "0%";
        } else if ((tank.ammo.mg || 0) <= 0) {
          ui.weaponState.textContent = "기관총 탄 없음";
          ui.reloadBar.style.width = "0%";
        } else {
          const weapon = tank.machineGunWeapon?.() || { cooldown: 0.075 };
          const pct = IronLine.math.clamp(1 - (tank.machineGunCooldown || 0) / Math.max(weapon.cooldown || 0.075, 0.001), 0, 1);
          ui.weaponState.textContent = `기관총 ${tank.ammo.mg}발`;
          ui.reloadBar.style.width = `${pct * 100}%`;
        }
      } else if (tank.reload.active) {
        const ammo = AMMO[tank.reload.ammoId];
        const pct = IronLine.math.clamp(tank.reload.progress / tank.reload.duration, 0, 1);
        ui.weaponState.textContent = `${ammo.name} ${Math.round(pct * 100)}%`;
        ui.reloadBar.style.width = `${pct * 100}%`;
      } else if (tank.loadedAmmo) {
        ui.weaponState.textContent = `${AMMO[tank.loadedAmmo].name} 준비됨`;
        ui.reloadBar.style.width = "100%";
      } else {
        ui.weaponState.textContent = "비어 있음";
        ui.reloadBar.style.width = "0%";
      }
    }

    updateHumveeWeapons(humvee) {
      const ui = this.nodes;

      for (const id of ["ap", "he", "smoke"]) {
        ui.slots[id]?.classList.add("hidden");
      }

      if (ui.slots.mg) {
        ui.slots.mg.classList.remove("hidden");
        ui.slotLabels.mg.textContent = "HMG";
        ui.ammo.mg.textContent = humvee.ammo?.mg || 0;
        ui.slots.mg.classList.toggle("empty", (humvee.ammo?.mg || 0) <= 0);
        ui.slots.mg.classList.add("active");
      }

      const weapon = humvee.machineGunWeapon?.() || { cooldown: 0.092 };
      const pct = IronLine.math.clamp(1 - (humvee.machineGunCooldown || 0) / Math.max(weapon.cooldown || 0.092, 0.001), 0, 1);
      if ((humvee.ammo?.mg || 0) <= 0) {
        ui.weaponState.textContent = "HMG EMPTY";
        ui.reloadBar.style.width = "0%";
      } else {
        ui.weaponState.textContent = `HMG ${humvee.ammo.mg}`;
        ui.reloadBar.style.width = `${pct * 100}%`;
      }
    }

    updateInfantryWeapons(player, game = null) {
      const ui = this.nodes;
      const slotIds = ["ap", "he", "mg"];
      const inventory = player.weaponInventory || [];

      for (let i = 0; i < slotIds.length; i += 1) {
        const slotId = slotIds[i];
        const slot = ui.slots[slotId];
        const weaponId = inventory[i];
        const weapon = INFANTRY_WEAPONS[weaponId];
        if (!slot) continue;

        slot.classList.toggle("hidden", !weapon);
        if (!weapon) continue;

        const ammo = this.weaponAmmoCount(player, weapon);
        ui.slotLabels[slotId].textContent = `${i + 1} ${weapon.shortName || weapon.name}`;
        ui.ammo[slotId].textContent = this.weaponAmmoText(player, weapon);
        slot.classList.toggle("empty", ammo !== null && ammo <= 0);
        slot.classList.toggle("active", player.activeSlot === i);
      }

      ui.slots.smoke?.classList.add("hidden");

      const weapon = player.getWeapon?.();
      const ammo = this.weaponAmmoCount(player, weapon);
      const drone = game?.player?.controlledDrone;
      if (drone?.alive) {
        const attackDrone = drone.droneRole === "attack";
        const signalStrength = drone.signalStrength?.() ?? 1;
        const weakSignal = Boolean(drone.isSignalWeak?.());
        const signalSuffix = weakSignal ? ` · 신호 약함 ${Math.round(signalStrength * 100)}%` : "";
        const designationCandidate = !attackDrone ? game?.findReconDroneDesignationTarget?.(drone) : null;
        const designationOptions = !attackDrone ? game?.reconDroneDesignationOptions?.(drone) || [] : [];
        const boostPct = attackDrone ? IronLine.math.clamp(drone.boostCharge ?? 1, 0, 1) : 1;
        const pct = attackDrone
          ? boostPct
          : drone.batteryLimit
            ? IronLine.math.clamp(drone.battery / Math.max(1, drone.maxBattery), 0, 1)
            : IronLine.math.clamp(signalStrength, 0, 1);
        if (!attackDrone && !designationCandidate && designationOptions.length > 0) {
          ui.weaponState.textContent = `정찰드론 표적 ${designationOptions.length} · 마커 클릭${signalSuffix}`;
          ui.reloadBar.style.width = `${pct * 100}%`;
          return;
        }
        let attackText = "";
        let barPct = pct;
        if (attackDrone) {
          const detectedSuffix = drone.detectedTimer > 0 ? " · 적 감지" : "";
          const failureSuffix = drone.lockFailureTimer > 0 && drone.lockFailureReason ? ` · 실패: ${drone.lockFailureReason}` : "";
          barPct = boostPct;
          if (drone.diveActive) attackText = `자폭드론 돌입중 · Shift 강습직격${signalSuffix}${detectedSuffix}`;
          else attackText = `자폭드론 준비 · 좌클릭 공격 / Shift 강습가속${failureSuffix}${signalSuffix}${detectedSuffix}`;
        }
        ui.weaponState.textContent = attackDrone
          ? attackText
          : designationCandidate
            ? `정찰드론 표적 지정${signalSuffix}`
            : drone.batteryLimit ? `정찰드론 ${Math.ceil(drone.battery)}초${signalSuffix}` : `정찰드론 운용중${signalSuffix}`;
        ui.reloadBar.style.width = `${barPct * 100}%`;
        return;
      }
      const returningDrone = game?.activePlayerDrone?.();
      if (returningDrone?.autoReturn) {
        const distance = IronLine.math.distXY(player.x, player.y, returningDrone.x, returningDrone.y);
        const pct = 1 - IronLine.math.clamp(distance / Math.max(120, returningDrone.maxControlRange || 1200), 0, 1);
        ui.weaponState.textContent = returningDrone.droneRole === "attack" ? "자폭드론 자동 복귀중" : "정찰드론 자동 복귀중";
        ui.reloadBar.style.width = `${pct * 100}%`;
        return;
      }
      const pickupDrone = game?.nearbyPlayerDroneForPickup?.();
      if (pickupDrone) {
        ui.weaponState.textContent = pickupDrone.droneRole === "attack" ? "자폭드론 회수 가능" : "정찰드론 회수 가능";
        ui.reloadBar.style.width = "100%";
        return;
      }
      const activeDrone = game?.activePlayerDrone?.();
      if (activeDrone?.alive && !activeDrone.autoReturn) {
        const attackDrone = activeDrone.droneRole === "attack";
        const signalStrength = activeDrone.signalStrength?.() ?? 1;
        const weakSignal = Boolean(activeDrone.isSignalWeak?.());
        const signalSuffix = weakSignal ? ` · 신호 약함 ${Math.round(signalStrength * 100)}%` : "";
        if (attackDrone) {
          const pct = IronLine.math.clamp(activeDrone.boostCharge ?? 1, 0, 1);
          ui.weaponState.textContent = `자폭드론 준비 · E 조종 후 좌클릭 공격${signalSuffix}`;
          ui.reloadBar.style.width = `${pct * 100}%`;
          return;
        }

        ui.weaponState.textContent = `정찰드론 대기 · E 조종${signalSuffix}`;
        ui.reloadBar.style.width = `${IronLine.math.clamp(signalStrength, 0, 1) * 100}%`;
        return;
      }
      const readyPct = weapon
        ? IronLine.math.clamp(1 - (player.rifleCooldown || 0) / Math.max(weapon.cooldown || 0.35, 0.001), 0, 1)
        : 0;
      const observedSniperTarget = game?.findObservedSniperTarget?.();
      const designatedTarget = game?.droneDesignatedContact?.();
      const reconObservedContacts = weapon?.id === "sniper"
        ? game?.reconDroneObservedContacts?.({ sniperOnly: true }) || []
        : [];
      const reconDesignationOptions = weapon?.id === "sniper"
        ? game?.reconDroneDesignationOptions?.() || []
        : [];
      const reconDroneReady = weapon?.id === "sniper" && Boolean(game?.activeReconDroneForSniper?.());
      if (!weapon) {
        ui.weaponState.textContent = "무기 없음";
        ui.reloadBar.style.width = "0%";
      } else if (ammo !== null && ammo <= 0) {
        ui.weaponState.textContent = `${weapon.name} 탄 없음`;
        ui.reloadBar.style.width = "0%";
      } else if (observedSniperTarget?.designated) {
        const ttl = Math.max(0, Math.ceil(designatedTarget?.ttl || 0));
        ui.weaponState.textContent = `지정 표적 사격 ${ttl}s`;
        ui.reloadBar.style.width = `${readyPct * 100}%`;
      } else if (observedSniperTarget?.target) {
        ui.weaponState.textContent = `드론 관측 사격 ${this.weaponAmmoText(player, weapon)}`;
        ui.reloadBar.style.width = `${readyPct * 100}%`;
      } else if (designatedTarget?.target && weapon?.id === "sniper") {
        ui.weaponState.textContent = `지정 표적 ${Math.max(0, Math.ceil(designatedTarget.ttl || 0))}s`;
        ui.reloadBar.style.width = `${readyPct * 100}%`;
      } else if (reconDesignationOptions.length > 0) {
        ui.weaponState.textContent = `정찰드론 표적 ${reconDesignationOptions.length} · 마커 클릭`;
        ui.reloadBar.style.width = `${readyPct * 100}%`;
      } else if (reconObservedContacts.length > 0 && game?.isPlayerScoutAimMode?.()) {
        ui.weaponState.textContent = `드론 관측 ${reconObservedContacts.length} · 조준선 맞추기`;
        ui.reloadBar.style.width = `${readyPct * 100}%`;
      } else if (reconObservedContacts.length > 0) {
        ui.weaponState.textContent = `드론 관측 ${reconObservedContacts.length}`;
        ui.reloadBar.style.width = `${readyPct * 100}%`;
      } else if (reconDroneReady) {
        ui.weaponState.textContent = `정찰드론 관측 대기 ${this.weaponAmmoText(player, weapon)}`;
        ui.reloadBar.style.width = `${readyPct * 100}%`;
      } else {
        ui.weaponState.textContent = `${weapon.name} ${this.weaponAmmoText(player, weapon)}`;
        ui.reloadBar.style.width = `${readyPct * 100}%`;
      }
    }

    weaponAmmoCount(player, weapon) {
      if (!player || !weapon?.ammoKey) return null;
      return player.equipmentAmmo?.[weapon.ammoKey] || 0;
    }

    weaponAmmoText(player, weapon) {
      const ammo = this.weaponAmmoCount(player, weapon);
      if (ammo === null) return "-";
      return String(ammo);
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
      if (classId === "engineer") return "RPG, 수리, 고속 돌입 자폭드론 운용";
      if (classId === "scout") return "긴 사거리 관측과 표적 보고에 특화";
      return "화력 유지와 근거리 제압에 특화";
    }

    renderDeploymentClassCards(game) {
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

      this.deploymentClassesBuilt = true;
      this.updateDeploymentLoadout(game);
    }

    updateDeploymentLoadout(game) {
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
          const swap = document.createElement("button");
          swap.type = "button";
          swap.className = "loadout-swap";
          swap.textContent = "\uAD50\uCCB4";
          swap.addEventListener("click", (event) => {
            event.stopPropagation();
            if (game.cycleDeploymentEquipmentChoice?.(slot.index)) this.updateDeploymentLoadout(game);
          });
          actions.append(swap);
        }

        row.append(key, body, actions);
        ui.deploymentLoadoutSlots.append(row);
      }
    }

    updateDeployment(game) {
      const ui = this.nodes;
      if (!ui.deploymentScreen) return;

      ui.deploymentScreen.classList.toggle("hidden", !game.deploymentOpen);

      if (!this.deploymentClassesBuilt) this.renderDeploymentClassCards(game);
      if (!game.deploymentOpen) this.deploymentLoadoutOpen = false;
      this.setDeploymentLoadoutOpen(this.deploymentLoadoutOpen && game.deploymentOpen);

      if (!this.deploymentMapBuilt) {
        this.buildDeploymentMap(game);
        this.deploymentMapBuilt = true;
      }

      ui.classButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.classId === game.player.classId);
      });
      this.updateDeploymentLoadout(game);

      ui.modeButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.modeId === game.matchConfig.mode);
      });

      ui.settingControls.forEach((control) => {
        const key = control.dataset.setting;
        if (!key || document.activeElement === control) return;
        const value = game.matchConfig[key];
        if (value !== undefined) control.value = value;
      });
    }

    updateDeathScreen(game) {
      const visible = Boolean(game.playerDeathActive && !game.result);
      this.nodes.deathScreen?.classList.toggle("hidden", !visible);
      if (this.nodes.deathReason) {
        this.nodes.deathReason.textContent = game.playerDeathReason || "적 공격으로 쓰러졌습니다.";
      }
    }

    invalidateDeploymentMap() {
      this.deploymentMapBuilt = false;
    }

    buildDeploymentMap(game) {
      const map = this.nodes.deploymentMap;
      if (!map) return;

      map.textContent = "";
      const width = game.world.width || 1;
      const height = game.world.height || 1;

      const addMarker = (kind, label, x, y) => {
        const marker = document.createElement("span");
        marker.className = `map-marker ${kind}`;
        marker.textContent = label;
        marker.style.left = `${IronLine.math.clamp(x / width, 0, 1) * 100}%`;
        marker.style.top = `${IronLine.math.clamp(y / height, 0, 1) * 100}%`;
        map.appendChild(marker);
      };

      for (const point of game.capturePoints) {
        addMarker("objective", point.name, point.x, point.y);
      }

      for (const zone of game.world.safeZones || []) {
        addMarker(`base-${zone.team === TEAM.BLUE ? "blue" : "red"}`, "기지", zone.x, zone.y);
      }

      for (const tank of game.tanks) {
        if (!tank.alive) continue;
        addMarker(`unit-${tank.team === TEAM.BLUE ? "blue" : "red"}`, "", tank.x, tank.y);
      }

      for (const humvee of game.humvees || []) {
        if (!humvee.alive) continue;
        addMarker(`unit-${humvee.team === TEAM.BLUE ? "blue" : "red"}`, "", humvee.x, humvee.y);
      }
    }

    updateScoreboard(game) {
      const visible = Boolean(game.input?.keyDown("Tab"));
      const board = this.nodes.scoreboard;
      if (!board) return;

      board.classList.toggle("visible", visible);

      const blue = this.teamStats(game, TEAM.BLUE);
      const red = this.teamStats(game, TEAM.RED);
      blue.kills = red.deaths;
      red.kills = blue.deaths;

      if (this.nodes.scoreboardTitle) {
        this.nodes.scoreboardTitle.textContent = `${this.modeLabel(game)} 현황`;
      }
      this.nodes.scoreboardTimer.textContent = this.formatTime(game.matchTime || 0);
      this.nodes.scoreboardGrid.innerHTML = [
        this.scoreCell("팀", "header"),
        this.scoreCell("생존", "header"),
        this.scoreCell("전차", "header"),
        this.scoreCell("보병", "header"),
        this.scoreCell("K", "header"),
        this.scoreCell("D", "header"),
        ...this.teamRow("아군", blue, "blue"),
        ...this.teamRow("적군", red, "red")
      ].join("");
    }

    modeLabel(game) {
      return game.matchConfig?.mode === "flags" ? "깃발전" : "섬멸전";
    }

    teamStats(game, team) {
      const tanks = game.tanks.filter((tank) => tank.team === team);
      const humvees = (game.humvees || []).filter((humvee) => humvee.team === team);
      const infantry = game.infantry.filter((unit) => unit.team === team);
      const vehicleTotal = tanks.length + humvees.length;
      const aliveTanks = tanks.filter((tank) => tank.alive).length + humvees.filter((humvee) => humvee.alive).length;
      const playerTotal = team === TEAM.BLUE ? 1 : 0;
      const playerAlive = team === TEAM.BLUE && !game.playerDeathActive && game.player.hp > 0 ? 1 : 0;
      const aliveInfantry = infantry.filter((unit) => unit.alive).length + playerAlive;
      const infantryTotal = infantry.length + playerTotal;
      const total = vehicleTotal + infantryTotal;
      const alive = aliveTanks + aliveInfantry;

      return {
        tanks: `${aliveTanks}/${vehicleTotal}`,
        infantry: `${aliveInfantry}/${infantryTotal}`,
        alive,
        total,
        deaths: Math.max(0, total - alive),
        kills: 0
      };
    }

    teamRow(label, stats, teamClass) {
      return [
        this.scoreCell(label, `team-${teamClass}`),
        this.scoreCell(`${stats.alive}/${stats.total}`),
        this.scoreCell(stats.tanks),
        this.scoreCell(stats.infantry),
        this.scoreCell(stats.kills),
        this.scoreCell(stats.deaths)
      ];
    }

    scoreCell(value, extraClass = "") {
      const className = `scoreboard-cell ${extraClass}`.trim();
      return `<div class="${className}">${value}</div>`;
    }

    updateObjectiveStrip(game) {
      const strip = this.nodes.objectiveStrip;
      if (!strip) return;

      for (const point of game.capturePoints) {
        if (!this.objectiveNodes.has(point.name)) {
          this.objectiveNodes.set(point.name, this.createObjectiveNode(point));
          strip.appendChild(this.objectiveNodes.get(point.name).root);
        }

        const node = this.objectiveNodes.get(point.name);
        const progress = IronLine.math.clamp(Math.abs(point.progress), 0, 1);
        const owner = point.owner === TEAM.BLUE ? "blue" : point.owner === TEAM.RED ? "red" : "neutral";
        const pressure = point.progress > 0.08 ? "blue" : point.progress < -0.08 ? "red" : owner;
        node.root.className = `objective-node owner-${owner} pressure-${pressure}`;
        node.root.classList.toggle("contested", point.contested);
        node.fill.style.height = `${progress * 100}%`;
      }

      const holdText = this.holdText(game);
      strip.dataset.hold = holdText;
      strip.classList.toggle("holding", Boolean(holdText));
    }

    createObjectiveNode(point) {
      const root = document.createElement("div");
      root.className = "objective-node owner-neutral pressure-neutral";
      root.setAttribute("aria-label", `${point.name} 거점`);

      const fill = document.createElement("span");
      fill.className = "objective-fill";

      const letter = document.createElement("strong");
      letter.textContent = point.name;

      root.append(fill, letter);
      return { root, fill };
    }

    holdText(game) {
      if ((game.objectiveHold?.[TEAM.BLUE] || 0) > 0) {
        const remaining = Math.max(0, Math.ceil(game.objectiveHoldDuration - game.objectiveHold[TEAM.BLUE]));
        return `아군 거점 유지 ${remaining}초`;
      }

      if ((game.objectiveHold?.[TEAM.RED] || 0) > 0) {
        const remaining = Math.max(0, Math.ceil(game.objectiveHoldDuration - game.objectiveHold[TEAM.RED]));
        return `적군 거점 유지 ${remaining}초`;
      }

      return "";
    }

    formatTime(seconds) {
      const safeSeconds = Math.max(0, Math.floor(seconds));
      const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
      const rest = (safeSeconds % 60).toString().padStart(2, "0");
      return `${minutes}:${rest}`;
    }
  }

  IronLine.Hud = Hud;
})(window);
