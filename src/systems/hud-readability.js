"use strict";

(function registerHudReadability(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants || {};

  IronLine.installHudReadability = function installHudReadability(Hud) {
    if (!Hud?.prototype) return;
    Object.assign(Hud.prototype, {
      ensureReadabilityStrip() {
        if (this.nodes.readabilityStrip) return;
        const root = this.nodes.objectiveStrip?.parentElement || document.querySelector(".hud-top");
        if (!root) return;

        const strip = document.createElement("div");
        strip.id = "hudReadabilityStrip";
        strip.className = "hud-readability-strip hidden";
        strip.setAttribute("aria-label", "combat and command status");

        const addItem = (key, valueId, extraClass = "") => {
          const item = document.createElement("div");
          item.className = `hud-readability-item ${extraClass}`.trim();
          const label = document.createElement("span");
          label.className = "hud-readability-label";
          label.textContent = key;
          const value = document.createElement("strong");
          value.id = valueId;
          value.textContent = "-";
          item.append(label, value);
          strip.append(item);
          return value;
        };

        this.nodes.readabilityRole = addItem("ROLE", "hudReadabilityRole");
        this.nodes.readabilityCommand = addItem("CMD", "hudReadabilityCommand");
        this.nodes.readabilityCombat = addItem("HP", "hudReadabilityCombat");
        this.nodes.readabilityFeed = addItem("FEED", "hudReadabilityFeed", "wide");
        root.append(strip);
        this.nodes.readabilityStrip = strip;
      },

      updateReadabilityStrip(game) {
        this.ensureReadabilityStrip();
        const strip = this.nodes.readabilityStrip;
        if (!strip) return;

        const visible = Boolean(
          !game.entryOpen &&
          !game.deploymentOpen &&
          !game.lobbyOpen &&
          !game.roomListOpen &&
          !game.result &&
          !game.adminObserverMode &&
          (game.matchStarted || game.sessionMode === "online")
        );
        strip.classList.toggle("hidden", !visible);
        if (!visible) return;

        if (this.nodes.readabilityRole) this.nodes.readabilityRole.textContent = this.readabilityRoleText(game);
        if (this.nodes.readabilityCommand) this.nodes.readabilityCommand.textContent = this.readabilityCommandText(game);
        if (this.nodes.readabilityCombat) this.nodes.readabilityCombat.textContent = this.readabilityCombatText(game);
        if (this.nodes.readabilityFeed) this.nodes.readabilityFeed.textContent = this.readabilityFeedText(game);
        strip.dataset.commandState = this.readabilityPrimaryCommand(game)?.state || "idle";
        strip.dataset.playerState = game.playerDeathActive || game.playerDowned || game.player?.hp <= 0 ? "dead" : "alive";
      },

      readabilityRoleText(game) {
        const player = game.localSessionPlayer?.();
        const slot = player ? game.sessionSlotById?.(player.slotId) : null;
        const roleId = slot?.roleId || player?.roleId || player?.role || "";
        const team = slot?.team || player?.team || game.player?.team || "";
        const teamText = team === TEAM.RED ? "Red" : team === TEAM.BLUE ? "Blue" : "Team";
        return `${teamText} ${this.readabilityRoleLabel(roleId)}`;
      },

      readabilityRoleLabel(roleId = "") {
        const labels = {
          infantry: "Infantry",
          infantry_leader: "Infantry",
          engineer: "Engineer",
          engineer_leader: "Engineer",
          recon: "Recon",
          scout: "Recon",
          recon_leader: "Recon",
          armor: "Armor",
          tank_commander: "Armor",
          armor_leader: "Armor"
        };
        return labels[roleId] || roleId || "-";
      },

      readabilityCommandText(game) {
        const primary = this.readabilityPrimaryCommand(game);
        if (!primary) return "idle";
        const remaining = primary.lockUntil > 0
          ? Math.max(0, (primary.lockUntil - performance.now()) / 1000)
          : 0;
        const hold = remaining > 0.1 ? ` ${remaining.toFixed(1)}s` : "";
        const count = primary.count > 1 ? ` x${primary.count}` : "";
        return `${this.readabilityCommandLabel(primary.state)}${hold}${count}`;
      },

      readabilityPrimaryCommand(game) {
        const player = game.localSessionPlayer?.();
        const slot = player ? game.sessionSlotById?.(player.slotId) : null;
        if (!slot) return null;
        const commands = [];

        for (const id of slot.squadIds || []) {
          const squad = game.squadById?.(id);
          const state = squad?.commandState || squad?.manualOrder?.commandState || "";
          if (!state || state === "idle") continue;
          commands.push({
            kind: "squad",
            state,
            lockUntil: Number(squad.commandLockUntil || squad.manualOrder?.commandLockUntil || 0),
            source: squad.commandSource || squad.order?.commandSource || squad.manualOrder?.commandSource || ""
          });
        }

        for (const id of slot.vehicleIds || []) {
          const vehicle = game.vehicleById?.(id);
          if (!vehicle) continue;
          const order = game.commanders?.[vehicle.team]?.assignments?.get?.(vehicle) || vehicle.manualOrder || null;
          const state = order?.commandState || vehicle.manualOrder?.commandState || "";
          if (!state || state === "idle") continue;
          commands.push({
            kind: "vehicle",
            state,
            lockUntil: Number(order?.commandLockUntil || vehicle.manualOrder?.commandLockUntil || 0),
            source: order?.commandSource || vehicle.manualOrder?.commandSource || ""
          });
        }

        if (!commands.length) return null;
        commands.sort((a, b) => (b.lockUntil || 0) - (a.lockUntil || 0));
        return {
          ...commands[0],
          count: commands.length
        };
      },

      readabilityCommandLabel(state = "") {
        const labels = {
          advance: "advance",
          hold: "hold",
          cover: "cover",
          assault: "assault",
          repair: "repair",
          scout: "scout",
          fallback: "fallback",
          cancel: "cancel"
        };
        return labels[state] || state || "idle";
      },

      readabilityCombatText(game) {
        const player = game.player;
        if (!player) return "HP -";
        if (game.playerDeathActive || game.playerDowned || player.hp <= 0) {
          const reason = String(game.playerDeathReason || game.playerPendingDeathReason || "down").replace(/\s+/g, " ").trim();
          return `DOWN ${reason.slice(0, 38)}`;
        }
        const maxHp = Math.max(1, Math.ceil(player.maxHp || 100));
        const hp = Math.max(0, Math.ceil(player.hp || 0));
        const damage = game.lastPlayerDamage;
        if (damage?.ttl > 0) {
          const label = String(damage.label || damage.kind || "hit").replace(/\s+/g, " ").slice(0, 24);
          return `HP ${hp}/${maxHp} hit:${label}`;
        }
        const weapon = player.inTank
          ? this.mobileTankWeaponLabel(player.inTank)
          : this.mobileInfantryWeaponLabel(player);
        return `HP ${hp}/${maxHp} ${weapon}`;
      },

      readabilityFeedText(game) {
        const events = game.battlefieldEvents?.recent?.(10) || [];
        const now = Date.now();
        const event = [...events].reverse().find((item) => (
          item &&
          ["score_kill", "player_down", "vehicle_destroyed", "match_ended", "objective_captured"].includes(item.type) &&
          now - Number(item.createdAt || now) < 9000
        ));
        if (!event) return "clear";
        const text = String(event.detail || event.title || "").replace(/\s+/g, " ").trim();
        return text.slice(0, 58) || event.type;
      }
    });
  };
})(window);
