"use strict";

(function registerHud(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, AMMO } = IronLine.constants;

  class Hud {
    constructor() {
      this.objectiveNodes = new Map();
      this.deploymentMapBuilt = false;
      this.nodes = {
        objectiveStrip: document.getElementById("objectiveStrip"),
        hudDetails: document.getElementById("hudDetails"),
        bottomHud: document.querySelector(".hud-bottom"),
        settingsButton: document.getElementById("settingsButton"),
        settingsPanel: document.getElementById("settingsPanel"),
        settingsClose: document.getElementById("settingsClose"),
        debugControls: Array.from(document.querySelectorAll("[data-debug-option]")),
        mobileControlsToggle: document.querySelector("[data-mobile-controls]"),
        mobileControls: document.getElementById("mobileControls"),
        orientationOverlay: document.getElementById("orientationOverlay"),
        moveStick: document.getElementById("moveStick"),
        aimStick: document.getElementById("aimStick"),
        mobileKeyButtons: Array.from(document.querySelectorAll("[data-mobile-key]")),
        mobileMouseButtons: Array.from(document.querySelectorAll("[data-mobile-mouse]")),
        deploymentScreen: document.getElementById("deploymentScreen"),
        deploymentMap: document.getElementById("deploymentMap"),
        deploymentStart: document.getElementById("deploymentStart"),
        modeButtons: Array.from(document.querySelectorAll("[data-mode-id]")),
        settingControls: Array.from(document.querySelectorAll("[data-setting]")),
        classButtons: Array.from(document.querySelectorAll("[data-class-id]")),
        scoreboard: document.getElementById("scoreboard"),
        scoreboardGrid: document.getElementById("scoreboardGrid"),
        scoreboardTimer: document.getElementById("scoreboardTimer"),
        scoreboardTitle: document.querySelector("#scoreboard .scoreboard-head strong"),
        weaponState: document.getElementById("weaponState"),
        reloadBar: document.getElementById("reloadBar"),
        slots: {
          ap: document.getElementById("slot-ap"),
          he: document.getElementById("slot-he"),
          smoke: document.getElementById("slot-smoke")
        },
        slotLabels: {
          ap: document.querySelector("#slot-ap span"),
          he: document.querySelector("#slot-he span"),
          smoke: document.querySelector("#slot-smoke span")
        },
        ammo: {
          ap: document.getElementById("ammo-ap"),
          he: document.getElementById("ammo-he"),
          smoke: document.getElementById("ammo-smoke")
        }
      };

      this.nodes.classButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const game = IronLine.game;
          if (game) game.selectDeploymentClass(button.dataset.classId);
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
    }

    toggleSettingsPanel(force = null) {
      const panel = this.nodes.settingsPanel;
      if (!panel) return;
      const open = force === null ? panel.classList.contains("hidden") : Boolean(force);
      panel.classList.toggle("hidden", !open);
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
    }

    update(game) {
      const ui = this.nodes;

      this.updateObjectiveStrip(game);
      this.updateDeployment(game);
      this.updateScoreboard(game);
      this.updateSettings(game);
      this.updateMobileControls(game);

      if (ui.hudDetails) {
        ui.hudDetails.classList.remove("visible");
      }

      const inTank = Boolean(game.player.inTank);
      ui.bottomHud?.classList.toggle("hidden", !inTank);
      if (!inTank) return;

      this.updateTankWeapons(game.player.inTank);
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

    updateMobileControls(game) {
      const enabled = Boolean(game.settings?.mobileControls);
      const portrait = window.innerHeight > window.innerWidth;
      const showControls = enabled && !portrait && !game.deploymentOpen && !game.result;

      this.nodes.orientationOverlay?.classList.toggle("visible", enabled && portrait);
      this.nodes.mobileControls?.classList.toggle("hidden", !showControls);
    }

    updateTankWeapons(tank) {
      const ui = this.nodes;

      for (const id of Object.keys(AMMO)) {
        ui.slotLabels[id].textContent = AMMO[id].name;
        ui.ammo[id].textContent = tank.ammo[id];
        ui.slots[id].classList.toggle("empty", tank.ammo[id] <= 0);
        ui.slots[id].classList.toggle(
          "active",
          id === "smoke"
            ? tank.smokeCooldown > 0
            : tank.loadedAmmo === id || tank.reload.ammoId === id && tank.reload.active
        );
      }

      if (tank.reload.active) {
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

    updateDeployment(game) {
      const ui = this.nodes;
      if (!ui.deploymentScreen) return;

      ui.deploymentScreen.classList.toggle("hidden", !game.deploymentOpen);

      if (!this.deploymentMapBuilt) {
        this.buildDeploymentMap(game);
        this.deploymentMapBuilt = true;
      }

      ui.classButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.classId === game.player.classId);
      });

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
      const infantry = game.infantry.filter((unit) => unit.team === team);
      const aliveTanks = tanks.filter((tank) => tank.alive).length;
      const playerTotal = team === TEAM.BLUE ? 1 : 0;
      const playerAlive = team === TEAM.BLUE && game.player.hp > 0 ? 1 : 0;
      const aliveInfantry = infantry.filter((unit) => unit.alive).length + playerAlive;
      const infantryTotal = infantry.length + playerTotal;
      const total = tanks.length + infantryTotal;
      const alive = aliveTanks + aliveInfantry;

      return {
        tanks: `${aliveTanks}/${tanks.length}`,
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
