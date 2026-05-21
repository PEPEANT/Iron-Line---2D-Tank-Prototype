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
      this.adminInspectTarget = { kind: "squad", id: "" };
      this.nodes = this.collectNodes();
      this.setupHudModules();
      this.bindHudControls();
    }

    collectNodes() {
      return {
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
        adminOpsStats: document.getElementById("adminOpsStats"),
        adminOpsRooms: document.getElementById("adminOpsRooms"),
        adminOpsEvents: document.getElementById("adminOpsEvents"),
        adminPlaytestNotes: document.getElementById("adminPlaytestNotes"),
        adminPlaytestNotesInput: document.getElementById("adminPlaytestNotesInput"),
        adminOpsBackup: document.getElementById("adminOpsBackup"),
        adminBackupFile: document.getElementById("adminBackupFile"),
        adminObserverMap: document.getElementById("adminObserverMap"),
        adminObserverStats: document.getElementById("adminObserverStats"),
        adminObserverSlots: document.getElementById("adminObserverSlots"),
        adminObserverSquads: document.getElementById("adminObserverSquads"),
        adminObserverDetails: document.getElementById("adminObserverDetails"),
        adminObserverCommands: document.getElementById("adminObserverCommands"),
        adminAiStats: document.getElementById("adminAiStats"),
        adminAiUnits: document.getElementById("adminAiUnits"),
        adminAiEvents: document.getElementById("adminAiEvents"),
        debugControls: Array.from(document.querySelectorAll("[data-debug-option]")),
        mobileControlsToggle: document.querySelector("[data-mobile-controls]"),
        mobileControls: document.getElementById("mobileControls"),
        mobileActionGrid: document.querySelector(".mobile-action-grid"),
        orientationOverlay: document.getElementById("orientationOverlay"),
        moveStick: document.getElementById("moveStick"),
        aimStick: document.getElementById("aimStick"),
        mobileWeaponButton: null,
        mobileSpectatorChatButton: null,
        mobileSpectatorHomeButton: null,
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
        lobbyScreen: document.getElementById("lobbyScreen"),
        lobbyMap: document.getElementById("lobbyMap"),
        lobbyModeTitle: document.getElementById("lobbyModeTitle"),
        lobbyStatus: document.getElementById("lobbyStatus"),
        lobbyRoomCode: document.getElementById("lobbyRoomCode"),
        lobbySlots: document.getElementById("lobbySlots"),
        lobbySummary: document.getElementById("lobbySummary"),
        lobbyTeamButton: document.getElementById("lobbyTeamButton"),
        lobbyReadyButton: document.getElementById("lobbyReadyButton"),
        lobbyStartButton: document.getElementById("lobbyStartButton"),
        lobbyBackButton: document.getElementById("lobbyBackButton"),
        commandPanel: document.getElementById("commandPanel"),
        commandRadioToggle: document.getElementById("commandRadioToggle"),
        commandRole: document.getElementById("commandRole"),
        commandStatus: document.getElementById("commandStatus"),
        commandAssets: document.getElementById("commandAssets"),
        commandButtons: [],
        commandSpecials: document.getElementById("commandSpecials"),
        commandMap: document.getElementById("commandMap"),
        commandLog: document.getElementById("commandLog"),
        deathScreen: document.getElementById("deathScreen"),
        deathReason: document.getElementById("deathReason"),
        deathRestartButton: document.getElementById("deathRestartButton"),
        resultScreen: document.getElementById("resultScreen"),
        resultCard: document.querySelector("#resultScreen .result-card"),
        resultKicker: document.getElementById("resultKicker"),
        resultTitle: document.getElementById("resultTitle"),
        resultReason: document.getElementById("resultReason"),
        resultMainButton: document.getElementById("resultMainButton"),
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
    }

    setupHudModules() {
      this.sessionFlow = IronLine.SessionFlow ? new IronLine.SessionFlow(this) : null;
      this.entryFlow = IronLine.EntryFlow ? new IronLine.EntryFlow(this) : null;
      this.entryFlow?.ensure();
      this.commandRadio = IronLine.CommandRadio ? new IronLine.CommandRadio(this) : null;
      this.commandRadio?.ensure();
      this.overlayController = IronLine.OverlayController ? new IronLine.OverlayController(this) : null;
      this.deploymentUI = IronLine.DeploymentUI ? new IronLine.DeploymentUI(this) : null;
      this.lobbyUI = IronLine.LobbyUI ? new IronLine.LobbyUI(this) : null;
      this.ensureDeploymentLoadoutPanel();
      this.ensureLobbyScreen();
      this.ensureAdminOpsPanel();
      this.ensureAdminObserverPanel();
      this.ensureAdminAiLabPanel();
      this.ensureProneIndicator();
      this.nodes.mobileWeaponButton = this.createMobileWeaponButton();
      this.nodes.mobileSpectatorChatButton = this.createMobileSpectatorButton("chat", "채팅", "관전자 채팅 열기");
      this.nodes.mobileSpectatorHomeButton = this.createMobileSpectatorButton("home", "전체", "전장 전체 보기");
    }

    bindHudControls() {
      this.bindDeploymentControls();
      this.bindSettingsControls();
      this.bindAdminControls();
      this.bindMobileControls();
      this.bindLobbyControls();
      this.bindResultControls();
    }

    bindDeploymentControls() {
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

      this.nodes.deploymentStart?.addEventListener("click", () => {
        const game = IronLine.game;
        if (game) {
          this.toggleSettingsPanel(false);
          if (!this.sessionFlow?.startFromDeployment(game)) game.enterLobby();
        }
      });
    }

    bindSettingsControls() {
      this.nodes.settingsButton?.addEventListener("click", () => this.toggleSettingsPanel());
      this.nodes.settingsClose?.addEventListener("click", () => this.toggleSettingsPanel(false));
    }

    bindAdminControls() {
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

      this.nodes.adminRoomSelect?.addEventListener("change", () => this.runAdminAction("room-select"));

      this.nodes.adminBackupFile?.addEventListener("change", async () => {
        const game = IronLine.game;
        const file = this.nodes.adminBackupFile.files?.[0] || null;
        if (!game?.adminOps || !file) return;
        const result = await game.adminOps.importBackupFile(file);
        game.adminNotify?.(result.message || (result.ok ? "백업을 불러왔습니다." : "백업을 불러오지 못했습니다."));
        this.nodes.adminBackupFile.value = "";
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
    }

    bindMobileControls() {
      this.bindVirtualStick(this.nodes.moveStick, "move");
      this.bindVirtualStick(this.nodes.aimStick, "aim");
      this.bindVirtualButtons();
    }

    bindLobbyControls() {
      if (this.nodes.lobbyReadyButton?.dataset.bound !== "1") {
        this.nodes.lobbyReadyButton?.addEventListener("click", () => {
          const game = IronLine.game;
          if (game) game.toggleLocalReady();
        });
      }

      if (this.nodes.lobbyTeamButton?.dataset.bound !== "1") {
        this.nodes.lobbyTeamButton?.addEventListener("click", () => {
          const game = IronLine.game;
          if (game) game.toggleLocalTeam();
        });
      }

      if (this.nodes.lobbyStartButton?.dataset.bound !== "1") {
        this.nodes.lobbyStartButton?.addEventListener("click", () => {
          const game = IronLine.game;
          if (game) game.beginDeploymentCountdown();
        });
      }

      if (this.nodes.lobbyBackButton?.dataset.bound !== "1") {
        this.nodes.lobbyBackButton?.addEventListener("click", () => {
          const game = IronLine.game;
          if (game && !this.sessionFlow?.backFromLobby(game)) game.returnToDeployment();
        });
      }
    }

    bindResultControls() {
      this.nodes.deathRestartButton?.addEventListener("click", () => {
        const game = IronLine.game;
        if (game) game.restartMatchAfterDeath();
      });

      this.nodes.resultMainButton?.addEventListener("click", () => {
        const game = IronLine.game;
        if (game) game.returnToMainMenu();
      });
    }

    get selectedCommandSquads() {
      return this.commandRadio?.selectedSquads || new Set();
    }

    get selectedCommandVehicles() {
      return this.commandRadio?.selectedVehicles || new Set();
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

    createMobileSpectatorButton(kind, label, ariaLabel) {
      const controls = this.nodes.mobileControls;
      if (!controls) return null;

      const button = document.createElement("button");
      button.type = "button";
      button.className = `mobile-action mobile-spectator-action mobile-spectator-${kind} hidden`;
      button.textContent = label;
      button.setAttribute("aria-label", ariaLabel || label);
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
      return this.deploymentUI?.ensureLoadoutPanel();
    }

    ensureLobbyScreen() {
      return this.lobbyUI?.ensureScreen();
    }

    ensureCommandPanel() {
      return this.commandRadio?.ensure();
    }

    toggleCommandRadio(forceOpen = null) {
      return this.commandRadio?.toggle(forceOpen);
    }

    updateMobileControls(game) {
      const enabled = Boolean(game.settings?.mobileControls);
      const portrait = window.innerHeight > window.innerWidth;
      const spectator = Boolean(game.spectatorMode);
      const activeScreen = !game.entryOpen && !game.deploymentOpen && !game.lobbyOpen && !game.roomListOpen && !game.result;
      const playerReady = !game.playerDeathActive && !game.playerDowned && game.player.hp > 0;
      const showControls = enabled && !portrait && activeScreen && (spectator || playerReady);
      const showPlayerControls = showControls && !spectator;
      const showSpectatorControls = showControls && spectator;
      const inTank = Boolean(game.player?.inTank);
      const controlledDrone = Boolean(game.player?.controlledDrone);
      const canPickupDrone = Boolean(game.nearbyPlayerDroneForPickup?.());
      const canDrone = Boolean(game.activePlayerDrone?.());
      const canInteract = Boolean(canPickupDrone || controlledDrone || canDrone || inTank || game.findMountablePlayerVehicle?.() || game.findMountablePlayerTank?.());

      this.mobileControlsVisible = showControls;

      this.nodes.orientationOverlay?.classList.toggle("visible", enabled && portrait);
      this.nodes.mobileControls?.classList.toggle("hidden", !showControls);
      this.nodes.mobileControls?.classList.toggle("spectator-controls", showSpectatorControls);
      this.nodes.mobileControls?.classList.toggle("in-tank", inTank);
      this.nodes.mobileControls?.classList.toggle("can-interact", showPlayerControls && canInteract);
      document.body.classList.toggle("mobile-controls-active", showControls);
      document.body.classList.toggle("mobile-spectator-controls-active", showSpectatorControls);
      document.body.classList.toggle("mobile-player-in-tank", showControls && inTank);
      this.nodes.mobileSpectatorChatButton?.classList.toggle("hidden", !showSpectatorControls);
      this.nodes.mobileSpectatorHomeButton?.classList.toggle("hidden", !showSpectatorControls);

      if (this.nodes.mobileInteractButton) {
        const label = canPickupDrone ? "\uD68C\uC218" : controlledDrone ? "\uBCF5\uADC0" : canDrone ? "\uB4DC\uB860" : inTank ? "\uD558\uCC28" : "\uD0D1\uC2B9";
        this.nodes.mobileInteractButton.textContent = label;
        this.nodes.mobileInteractButton.setAttribute(
          "aria-label",
          canPickupDrone ? "retrieve drone" : controlledDrone ? "return from drone" : canDrone ? "control drone" : inTank ? "dismount" : "mount"
        );
      }

      this.updateMobileWeaponButton(game, showPlayerControls, inTank);
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
          ui.weaponState.textContent = "기관총 탄약 없음";
          ui.reloadBar.style.width = "0%";
        } else {
          const weapon = tank.machineGunWeapon?.() || { cooldown: 0.075 };
          const pct = IronLine.math.clamp(1 - (tank.machineGunCooldown || 0) / Math.max(weapon.cooldown || 0.075, 0.001), 0, 1);
          ui.weaponState.textContent = `MG ${tank.ammo.mg}`;
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
      if (!ui.weaponState || !ui.reloadBar) return;
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
        if (ui.slotLabels[slotId]) ui.slotLabels[slotId].textContent = `${i + 1} ${weapon.shortName || weapon.name}`;
        if (ui.ammo[slotId]) ui.ammo[slotId].textContent = this.weaponAmmoText(player, weapon);
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
          const detectedSuffix = drone.detectedTimer > 0 ? " · 감지됨" : "";
          const failureSuffix = drone.lockFailureTimer > 0 && drone.lockFailureReason ? ` · 실패: ${drone.lockFailureReason}` : "";
          barPct = boostPct;
          if (drone.diveActive) attackText = `자폭드론 돌입중 · Shift 가속${signalSuffix}${detectedSuffix}`;
          else attackText = `FPV ready · left click attack / Shift boost${failureSuffix}${signalSuffix}${detectedSuffix}`;
        }
        ui.weaponState.textContent = attackDrone
          ? attackText
          : designationCandidate
            ? `Recon drone marking${signalSuffix}`
            : drone.batteryLimit ? `Recon drone ${Math.ceil(drone.battery)}s${signalSuffix}` : `Recon drone active${signalSuffix}`;
        ui.reloadBar.style.width = `${barPct * 100}%`;
        return;
      }
      const returningDrone = game?.activePlayerDrone?.();
      if (returningDrone?.autoReturn) {
        const distance = IronLine.math.distXY(player.x, player.y, returningDrone.x, returningDrone.y);
        const pct = 1 - IronLine.math.clamp(distance / Math.max(120, returningDrone.maxControlRange || 1200), 0, 1);
        ui.weaponState.textContent = returningDrone.droneRole === "attack" ? "FPV auto returning" : "Recon drone auto returning";
        ui.reloadBar.style.width = `${pct * 100}%`;
        return;
      }
      const pickupDrone = game?.nearbyPlayerDroneForPickup?.();
      if (pickupDrone) {
        ui.weaponState.textContent = pickupDrone.droneRole === "attack" ? "FPV retrieve ready" : "Recon drone retrieve ready";
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
          ui.weaponState.textContent = `자폭드론 준비 · 조종키 조종 · 좌클릭 공격${signalSuffix}`;
          ui.reloadBar.style.width = `${pct * 100}%`;
          return;
        }

        ui.weaponState.textContent = `정찰드론 대기 · 조종키 조종${signalSuffix}`;
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
        ui.weaponState.textContent = `${weapon.name} 탄약 없음`;
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
        ui.weaponState.textContent = `Recon observed ${reconObservedContacts.length} · align aim`;
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
      return this.deploymentUI?.classLoadout(classId, game) || { infantryClass: null, slots: [] };
    }

    loadoutSlotRole(index, weapon) {
      return this.deploymentUI?.loadoutSlotRole(index, weapon) || "";
    }

    loadoutAmmoText(infantryClass, weapon) {
      return this.deploymentUI?.loadoutAmmoText(infantryClass, weapon) || "";
    }

    loadoutSummaryText(classId) {
      return this.deploymentUI?.loadoutSummaryText(classId) || "";
    }

    renderDeploymentClassCards(game) {
      return this.deploymentUI?.renderClassCards(game);
    }

    updateDeploymentLoadout(game) {
      return this.deploymentUI?.updateLoadout(game);
    }

    updateDeployment(game) {
      return this.deploymentUI?.update(game);
    }

    updateDeathScreen(game) {
      const visible = Boolean(game.playerDeathActive && !game.result);
      this.nodes.deathScreen?.classList.toggle("hidden", !visible);
      if (this.nodes.deathReason) {
        const respawn = game.matchConfig?.mode === "conquest" && Number.isFinite(game.playerRespawnTimer)
          ? ` respawn ${Math.max(0, Math.ceil(game.playerRespawnTimer))}s`
          : "";
        this.nodes.deathReason.textContent = `${game.playerDeathReason || "전투 불능 상태입니다."}${respawn}`;
      }
      if (this.nodes.deathRestartButton) {
        this.nodes.deathRestartButton.textContent = game.matchConfig?.mode === "conquest" ? "즉시 리스폰" : "다시 시작";
      }
    }

    updateResultScreen(game) {
      const visible = Boolean(game.result);
      const victory = game.result === "BLUE VICTORY";
      const draw = game.result === "DRAW";
      this.nodes.resultScreen?.classList.toggle("hidden", !visible);
      this.nodes.resultCard?.classList.toggle("lost", visible && !victory && !draw);
      if (!visible) return;
      if (this.nodes.resultKicker) this.nodes.resultKicker.textContent = draw ? "작전 종료" : victory ? "작전 성공" : "작전 실패";
      if (this.nodes.resultTitle) this.nodes.resultTitle.textContent = draw ? "무승부" : victory ? "승리" : "패배";
      if (this.nodes.resultReason) this.nodes.resultReason.textContent = game.resultReason || "전투 종료";
      if (this.nodes.resultMainButton) this.nodes.resultMainButton.textContent = "로비로 돌아가기";
    }

    updateLobby(game) {
      return this.lobbyUI?.update(game);
    }

    createLobbyPlayerCard(player, session = {}) {
      return this.lobbyUI?.createPlayerCard(player, session) || document.createElement("div");
    }

    createLobbyEmptySlot(index) {
      return this.lobbyUI?.createEmptySlot(index) || document.createElement("div");
    }

    playerInitials(name) {
      return this.lobbyUI?.playerInitials(name) || "?";
    }

    updateLobbySlots(game) {
      return this.lobbyUI?.updateSlots(game);
    }

    renderLobbyTeam(parent, options) {
      return this.lobbyUI?.renderTeam(parent, options);
    }

    createLobbyRoleSlotCard(slot, players, session = {}) {
      return this.lobbyUI?.createRoleSlotCard(slot, players, session) || document.createElement("div");
    }

    roleInitial(roleId) {
      return this.lobbyUI?.roleInitial(roleId) || "?";
    }

    slotAssetText(slot) {
      return this.lobbyUI?.slotAssetText(slot) || "";
    }

    lobbyPlayerBadges(flags) {
      return this.lobbyUI?.playerBadges(flags) || "";
    }

    updateLobbySummary(game) {
      return this.lobbyUI?.updateSummary(game);
    }

    updateCommandPanel(game) {
      return this.commandRadio?.update(game);
    }

    commandLabel(type) {
      return this.commandRadio?.commandLabel(type) || type;
    }

    submitCurrentCommand(game, point, objectiveName = "", extra = {}) {
      return this.commandRadio?.submitCurrentCommand(game, point, objectiveName, extra) || { accepted: false, reason: "radio_unavailable" };
    }

    showCommandResult(result) {
      return this.commandRadio?.showCommandResult(result);
    }

    invalidateDeploymentMap() {
      this.deploymentMapBuilt = false;
    }

    buildDeploymentMap(game) {
      const map = this.nodes.deploymentMap;
      this.buildMapMarkers(game, map);
    }

    buildAdminSnapshotMap(snapshot, map) {
      if (!snapshot || !map) return;
      const now = performance.now();
      if (map.dataset.snapshotReady === "1" && now < Number(map.dataset.nextSnapshotRefresh || 0)) return;
      map.dataset.snapshotReady = "1";
      map.dataset.nextSnapshotRefresh = String(now + 450);
      map.textContent = "";

      const width = snapshot.world?.width || 1;
      const height = snapshot.world?.height || 1;
      const addMarker = (kind, label, x, y, inspectKind = "", inspectId = "") => {
        const marker = document.createElement("span");
        marker.className = `map-marker ${kind}`;
        marker.textContent = label;
        marker.style.left = `${IronLine.math.clamp(x / width, 0, 1) * 100}%`;
        marker.style.top = `${IronLine.math.clamp(y / height, 0, 1) * 100}%`;
        if (inspectKind && inspectId) {
          marker.classList.add("inspectable");
          marker.classList.toggle("selected", this.isAdminInspectSelected(inspectKind, inspectId));
          marker.title = `${inspectKind} ${inspectId}`;
          marker.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.selectAdminInspectTarget(inspectKind, inspectId);
          });
        }
        map.appendChild(marker);
      };

      for (const point of snapshot.capturePoints || []) {
        addMarker("objective", point.name, point.x, point.y, "objective", point.name);
      }
      for (const zone of snapshot.world?.safeZones || []) {
        addMarker(`base-${zone.team === TEAM.BLUE ? "blue" : "red"}`, "기지", zone.x, zone.y);
      }
      for (const squad of snapshot.squads || []) {
        if (!Number.isFinite(squad.x) || !Number.isFinite(squad.y)) continue;
        addMarker(`unit-${squad.team === TEAM.BLUE ? "blue" : "red"}`, "", squad.x, squad.y, "squad", squad.id);
      }
      for (const vehicle of snapshot.vehicles || []) {
        addMarker(`unit-${vehicle.team === TEAM.BLUE ? "blue" : "red"}`, "", vehicle.x, vehicle.y, "vehicle", vehicle.id);
      }
    }

    buildMapMarkers(game, map) {
      if (!map) return;

      const lobbyMap = map === this.nodes.lobbyMap;
      const commandMap = map === this.nodes.commandMap;
      const observerMap = map === this.nodes.adminObserverMap;
      const now = performance.now();
      const refreshMs = commandMap ? 650 : observerMap ? 700 : lobbyMap ? 1000 : 0;
      if (refreshMs > 0 && map.dataset.markersReady === "1" && now < Number(map.dataset.nextMarkerRefresh || 0)) {
        return;
      }
      if (refreshMs > 0) {
        map.dataset.markersReady = "1";
        map.dataset.nextMarkerRefresh = String(now + refreshMs);
      }

      map.textContent = "";
      const width = game.world.width || 1;
      const height = game.world.height || 1;

      const addMarker = (kind, label, x, y, inspectKind = "", inspectId = "") => {
        const marker = document.createElement("span");
        marker.className = `map-marker ${kind}`;
        marker.textContent = label;
        marker.style.left = `${IronLine.math.clamp(x / width, 0, 1) * 100}%`;
        marker.style.top = `${IronLine.math.clamp(y / height, 0, 1) * 100}%`;
        if (observerMap && inspectKind && inspectId) {
          marker.classList.add("inspectable");
          marker.classList.toggle("selected", this.isAdminInspectSelected(inspectKind, inspectId));
          marker.title = `${inspectKind} ${inspectId}`;
          marker.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.selectAdminInspectTarget(inspectKind, inspectId);
          });
        }
        map.appendChild(marker);
        return marker;
      };

      game.capturePoints.forEach((point, index) => {
        const marker = addMarker("objective", lobbyMap ? String(index + 1) : point.name, point.x, point.y, "objective", point.name);
        if (commandMap) {
          marker.dataset.objectiveName = point.name;
          marker.title = `${point.name} 거점 명령`;
          marker.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const result = this.submitCurrentCommand(game, null, point.name);
            this.showCommandResult(result);
            if (result?.accepted) {
              this.commandRadio?.handleObjectiveAccepted(game);
            }
          });
        }
      });

      for (const zone of game.world.safeZones || []) {
        addMarker(`base-${zone.team === TEAM.BLUE ? "blue" : "red"}`, "기지", zone.x, zone.y);
      }

      if (observerMap) {
        for (const squad of this.localSquadSnapshots(game)) {
          if (!Number.isFinite(squad.x) || !Number.isFinite(squad.y)) continue;
          addMarker(`unit-${squad.team === TEAM.BLUE ? "blue" : "red"}`, "", squad.x, squad.y, "squad", squad.id);
        }
      }

      if (!commandMap) {
        for (const tank of game.tanks) {
          if (!tank.alive) continue;
          addMarker(`unit-${tank.team === TEAM.BLUE ? "blue" : "red"}`, "", tank.x, tank.y, "vehicle", tank.callSign);
        }

        for (const humvee of game.humvees || []) {
          if (!humvee.alive) continue;
          addMarker(`unit-${humvee.team === TEAM.BLUE ? "blue" : "red"}`, "", humvee.x, humvee.y, "vehicle", humvee.callSign);
        }
      }
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

    scoreCell(value, extraClass = "") {
      const className = `scoreboard-cell ${extraClass}`.trim();
      return `<div class="${className}">${value}</div>`;
    }

    updateScoreboard(game) {
      const visible = Boolean(game.input?.keyDown("Tab"));
      const board = this.nodes.scoreboard;
      if (!board) return;

      board.classList.toggle("visible", visible);

      const conquest = game.matchConfig?.mode === "conquest";
      const blue = this.teamStats(game, TEAM.BLUE);
      const red = this.teamStats(game, TEAM.RED);
      blue.kills = red.deaths;
      red.kills = blue.deaths;

      if (this.nodes.scoreboardTitle) {
        this.nodes.scoreboardTitle.textContent = `${this.modeLabel(game)} 현황`;
      }
      if (this.nodes.scoreboardTimer) {
        const seconds = conquest ? game.conquest?.remaining ?? 0 : game.matchTime || 0;
        this.nodes.scoreboardTimer.textContent = this.formatTime(seconds);
      }
      if (this.nodes.scoreboardGrid) {
        this.nodes.scoreboardGrid.classList.toggle("conquest", conquest);
        this.nodes.scoreboardGrid.style.gridTemplateColumns = conquest ? "repeat(7, 1fr)" : "";
        this.nodes.scoreboardGrid.innerHTML = conquest
          ? [
              this.scoreCell("팀", "header"),
              this.scoreCell("점수", "header"),
              this.scoreCell("생존", "header"),
              this.scoreCell("차량", "header"),
              this.scoreCell("보병", "header"),
              this.scoreCell("K", "header"),
              this.scoreCell("D", "header"),
              ...this.teamRow("청팀", blue, "blue", game.conquest?.score?.[TEAM.BLUE] || 0),
              ...this.teamRow("홍팀", red, "red", game.conquest?.score?.[TEAM.RED] || 0)
            ].join("")
          : [
              this.scoreCell("팀", "header"),
              this.scoreCell("생존", "header"),
              this.scoreCell("차량", "header"),
              this.scoreCell("보병", "header"),
              this.scoreCell("K", "header"),
              this.scoreCell("D", "header"),
              ...this.teamRow("청팀", blue, "blue"),
              ...this.teamRow("홍팀", red, "red")
            ].join("");
      }
    }

    modeLabel(game) {
      return game.matchConfig?.mode === "conquest" ? "점령전" : "섬멸전";
    }

    teamRow(label, stats, teamClass, score = null) {
      const row = [
        this.scoreCell(label, `team-${teamClass}`)
      ];
      if (score !== null) row.push(this.scoreCell(Math.floor(score)));
      row.push(
        this.scoreCell(`${stats.alive}/${stats.total}`),
        this.scoreCell(stats.tanks),
        this.scoreCell(stats.infantry),
        this.scoreCell(stats.kills),
        this.scoreCell(stats.deaths)
      );
      return row;
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
      if (game.matchConfig?.mode === "conquest") {
        const blue = Math.floor(game.conquest?.score?.[TEAM.BLUE] || 0);
        const red = Math.floor(game.conquest?.score?.[TEAM.RED] || 0);
        return `점령전 ${blue} : ${red}`;
      }

      if ((game.objectiveHold?.[TEAM.BLUE] || 0) > 0) {
        const remaining = Math.max(0, Math.ceil(game.objectiveHoldDuration - game.objectiveHold[TEAM.BLUE]));
        return `청팀 거점 장악 ${remaining}s`;
      }

      if ((game.objectiveHold?.[TEAM.RED] || 0) > 0) {
        const remaining = Math.max(0, Math.ceil(game.objectiveHoldDuration - game.objectiveHold[TEAM.RED]));
        return `홍팀 거점 장악 ${remaining}s`;
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

  Object.assign(Hud.prototype, {
    updateScoreboard: function updateScoreboard(game) {
      const visible = Boolean(game.input?.keyDown("Tab"));
      const board = this.nodes.scoreboard;
      if (!board) return;

      board.classList.toggle("visible", visible);

      const conquest = game.matchConfig?.mode === "conquest";
      const blue = this.teamStats(game, TEAM.BLUE);
      const red = this.teamStats(game, TEAM.RED);
      blue.kills = red.deaths;
      red.kills = blue.deaths;

      if (this.nodes.scoreboardTitle) {
        this.nodes.scoreboardTitle.textContent = `${this.modeLabel(game)} 현황`;
      }
      if (this.nodes.scoreboardTimer) {
        const seconds = conquest ? game.conquest?.remaining ?? 0 : game.matchTime || 0;
        this.nodes.scoreboardTimer.textContent = this.formatTime(seconds);
      }
      if (this.nodes.scoreboardGrid) {
        this.nodes.scoreboardGrid.classList.toggle("conquest", conquest);
        this.nodes.scoreboardGrid.style.gridTemplateColumns = conquest ? "repeat(7, 1fr)" : "";
        this.nodes.scoreboardGrid.innerHTML = conquest
          ? [
              this.scoreCell("팀", "header"),
              this.scoreCell("점수", "header"),
              this.scoreCell("생존", "header"),
              this.scoreCell("차량", "header"),
              this.scoreCell("보병", "header"),
              this.scoreCell("K", "header"),
              this.scoreCell("D", "header"),
              ...this.teamRow("청팀", blue, "blue", game.conquest?.score?.[TEAM.BLUE] || 0),
              ...this.teamRow("홍팀", red, "red", game.conquest?.score?.[TEAM.RED] || 0)
            ].join("")
          : [
              this.scoreCell("팀", "header"),
              this.scoreCell("생존", "header"),
              this.scoreCell("차량", "header"),
              this.scoreCell("보병", "header"),
              this.scoreCell("K", "header"),
              this.scoreCell("D", "header"),
              ...this.teamRow("청팀", blue, "blue"),
              ...this.teamRow("홍팀", red, "red")
            ].join("");
      }
    },

    modeLabel: function modeLabel(game) {
      return game.matchConfig?.mode === "conquest" ? "점령전" : "섬멸전";
    },

    createObjectiveNode: function createObjectiveNode(point) {
      const root = document.createElement("div");
      root.className = "objective-node owner-neutral pressure-neutral";
      root.setAttribute("aria-label", `${point.name} 거점`);

      const fill = document.createElement("span");
      fill.className = "objective-fill";

      const letter = document.createElement("strong");
      letter.textContent = point.name;

      root.append(fill, letter);
      return { root, fill };
    },

    holdText: function holdText(game) {
      if (game.matchConfig?.mode === "conquest") {
        const blue = Math.floor(game.conquest?.score?.[TEAM.BLUE] || 0);
        const red = Math.floor(game.conquest?.score?.[TEAM.RED] || 0);
        const remaining = this.formatTime(game.conquest?.remaining ?? game.conquest?.duration ?? 0);
        return `점령전 ${remaining} · ${blue} : ${red}`;
      }

      if ((game.objectiveHold?.[TEAM.BLUE] || 0) > 0) {
        const remaining = Math.max(0, Math.ceil(game.objectiveHoldDuration - game.objectiveHold[TEAM.BLUE]));
        return `청팀 거점 장악 ${remaining}s`;
      }

      if ((game.objectiveHold?.[TEAM.RED] || 0) > 0) {
        const remaining = Math.max(0, Math.ceil(game.objectiveHoldDuration - game.objectiveHold[TEAM.RED]));
        return `홍팀 거점 장악 ${remaining}s`;
      }

      return "";
    }
  });

  IronLine.installHudAdminNotes?.(Hud);
  IronLine.installHudAdminUi?.(Hud);

  IronLine.Hud = Hud;
})(window);
