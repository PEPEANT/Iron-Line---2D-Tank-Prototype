"use strict";

(function registerFieldRadioHud(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  function fieldRadioSvg() {
    return `
      <svg viewBox="0 0 140 236" aria-hidden="true">
        <defs>
          <linearGradient id="fieldRadioBody" x1="0" y1="0" x2="0.9" y2="1">
            <stop offset="0" stop-color="#49533c"/>
            <stop offset="0.56" stop-color="#2a3324"/>
            <stop offset="1" stop-color="#11170e"/>
          </linearGradient>
          <linearGradient id="fieldRadioScreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#d7f7bb"/>
            <stop offset="1" stop-color="#8fb079"/>
          </linearGradient>
        </defs>
        <path d="M70 15 L88 0" class="radio-antenna"/>
        <path d="M84 2 L101 37" class="radio-antenna"/>
        <rect x="28" y="20" width="84" height="196" rx="13" fill="url(#fieldRadioBody)" class="radio-body"/>
        <rect x="40" y="37" width="60" height="36" rx="5" fill="url(#fieldRadioScreen)" class="radio-screen"/>
        <text x="70" y="58" text-anchor="middle" class="radio-screen-text" data-field-radio-screen>FOLLOW</text>
        <circle cx="50" cy="92" r="7" class="radio-knob"/>
        <circle cx="70" cy="92" r="7" class="radio-knob"/>
        <circle cx="90" cy="92" r="7" class="radio-knob"/>
        <rect x="43" y="112" width="54" height="12" rx="3" class="radio-speaker"/>
        <rect x="43" y="132" width="54" height="12" rx="3" class="radio-speaker"/>
        <rect x="43" y="152" width="54" height="12" rx="3" class="radio-speaker"/>
        <rect x="45" y="178" width="50" height="21" rx="6" class="radio-ptt"/>
        <circle cx="101" cy="30" r="4.6" class="radio-led"/>
      </svg>
    `;
  }

  function commandReason(reason = "") {
    if (!reason) return "NO RESPONSE";
    if (reason === "no-assets") return "NO SQUAD";
    if (reason === "missing-player") return "NO PLAYER";
    if (reason === "missing-slot") return "NO SLOT";
    return String(reason).toUpperCase();
  }

  const fieldRadioHudMethods = {
    ensureFieldRadioHud() {
      if (this.nodes.fieldRadioHud) return this.nodes.fieldRadioHud;

      const panel = document.createElement("div");
      panel.id = "fieldRadioHud";
      panel.className = "field-radio-hud hidden";
      panel.setAttribute("aria-label", "Field radio");
      panel.innerHTML = `
        <div class="field-radio-device">${fieldRadioSvg()}</div>
        <div class="field-radio-readout">
          <strong data-field-radio-status>FOLLOW</strong>
          <span data-field-radio-meta>READY</span>
          <i><em data-field-radio-meter></em></i>
        </div>
      `;
      document.body.append(panel);

      this.nodes.fieldRadioHud = panel;
      this.nodes.fieldRadioStatus = panel.querySelector("[data-field-radio-status]");
      this.nodes.fieldRadioMeta = panel.querySelector("[data-field-radio-meta]");
      this.nodes.fieldRadioMeter = panel.querySelector("[data-field-radio-meter]");
      this.nodes.fieldRadioScreen = panel.querySelector("[data-field-radio-screen]");
      return panel;
    },

    playerHoldingFieldRadio(game) {
      return game?.player?.getWeapon?.()?.type === "radio";
    },

    canUseFieldRadio(game) {
      return Boolean(
        game?.player &&
        game.player.hp > 0 &&
        !game.player.inTank &&
        !game.player.controlledDrone &&
        !game.entryOpen &&
        !game.deploymentOpen &&
        !game.lobbyOpen &&
        !game.roomListOpen &&
        !game.result &&
        !game.playerDeathActive &&
        this.playerHoldingFieldRadio(game)
      );
    },

    closeFieldRadio() {
      this.fieldRadioOpen = false;
      document.body.classList.remove("field-radio-active");
      this.nodes.fieldRadioHud?.classList.add("hidden");
    },

    toggleFieldRadioFromTool(game) {
      if (!this.canUseFieldRadio(game)) {
        this.closeFieldRadio?.();
        return false;
      }
      if (this.fieldRadioOpen) {
        this.closeFieldRadio?.();
        return true;
      }
      this.fieldRadioOpen = true;
      this.issueFieldRadioFollow?.(game);
      this.updateFieldRadio?.(game);
      return true;
    },

    issueFieldRadioFollow(game) {
      const player = game?.player;
      if (!player) {
        this.fieldRadioStatus = { accepted: false, reason: "missing-player", squadCount: 0, sentAt: performance.now() };
        return this.fieldRadioStatus;
      }

      const result = game.submitLocalCommand?.("move", {
        followPlayer: true,
        targetPoint: { x: player.x, y: player.y },
        reason: "field-radio-follow",
        commandReason: "field-radio-follow"
      }) || { accepted: false, reason: "missing-command-bus" };

      let finalResult = result;
      if (!result.accepted) {
        finalResult = this.issueFieldRadioFallbackFollow(game, result.reason);
      }

      this.fieldRadioStatus = {
        accepted: Boolean(finalResult.accepted),
        reason: finalResult.reason || result.reason || "",
        squadCount: finalResult.squadIds?.length || 0,
        sentAt: performance.now()
      };
      return this.fieldRadioStatus;
    },

    issueFieldRadioFallbackFollow(game, originalReason = "") {
      const player = game?.player;
      const team = game?.localPlayerTeam?.() || player?.team;
      const squads = (game?.squads || [])
        .filter((squad) => squad?.team === team && (squad.activeUnits?.().length || 0) > 0);
      if (!player || !squads.length || !game?.commandBus?.applySquadOrder) {
        return { accepted: false, reason: originalReason || "no-assets", squadIds: [] };
      }

      const point = {
        name: "Player",
        x: player.x,
        y: player.y,
        radius: 96,
        followPlayer: true
      };
      const packet = {
        id: `field-radio-${Date.now()}`,
        type: "move",
        team,
        followPlayer: true,
        commandSource: "player",
        commandReason: "field-radio-follow",
        reason: "field-radio-follow",
        issuerPlayerId: game.localSessionPlayer?.()?.id || "local",
        slotId: game.localSessionPlayer?.()?.slotId || "",
        issuedAt: performance.now()
      };
      squads.forEach((squad, index) => {
        game.commandBus.applySquadOrder(packet, squad, point, index, squads.length);
      });
      return { accepted: true, reason: "fallback-follow", squadIds: squads.map((squad) => squad.id) };
    },

    updateFieldRadio(game) {
      const panel = this.ensureFieldRadioHud?.();
      const active = Boolean(this.fieldRadioOpen && this.canUseFieldRadio(game));
      document.body.classList.toggle("field-radio-active", active);
      if (!panel) return;
      panel.classList.toggle("hidden", !active);
      if (!active) {
        this.fieldRadioOpen = false;
        return;
      }

      const now = performance.now();
      const status = this.fieldRadioStatus || {};
      const age = Math.max(0, (now - (status.sentAt || now)) / 1000);
      const meter = Math.max(0.18, Math.min(1, 1 - age / 4));
      const accepted = status.accepted !== false;
      const statusText = accepted ? "FOLLOW" : "FAILED";
      const meta = accepted
        ? `SQD ${status.squadCount || 0} / E CLOSE`
        : `${commandReason(status.reason)} / E`;

      panel.classList.toggle("transmitting", age < 0.9);
      panel.classList.toggle("failed", !accepted);
      if (this.nodes.fieldRadioStatus) this.nodes.fieldRadioStatus.textContent = statusText;
      if (this.nodes.fieldRadioMeta) this.nodes.fieldRadioMeta.textContent = meta;
      if (this.nodes.fieldRadioScreen) this.nodes.fieldRadioScreen.textContent = accepted ? "FOLLOW" : "ERROR";
      if (this.nodes.fieldRadioMeter) this.nodes.fieldRadioMeter.style.width = `${meter * 100}%`;
    }
  };

  function installFieldRadioHud(Hud) {
    Object.assign(Hud.prototype, fieldRadioHudMethods);
    const baseUpdate = Hud.prototype.update;
    Hud.prototype.update = function updateWithFieldRadioHud(game) {
      const result = baseUpdate?.call(this, game);
      this.updateFieldRadio?.(game);
      if (this.fieldRadioOpen) {
        this.nodes.bottomHud?.classList.add("hidden");
        this.nodes.infantrySlotbar?.classList.add("hidden");
      }
      return result;
    };
  }

  IronLine.installFieldRadioHud = installFieldRadioHud;
})(window);
