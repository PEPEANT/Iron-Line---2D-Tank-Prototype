"use strict";

(function registerPlayerLoadout(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { INFANTRY_CLASSES, INFANTRY_WEAPONS } = IronLine.constants;

  function classAmmo(classId, equipment = null) {
    const infantryClass = INFANTRY_CLASSES[classId] || INFANTRY_CLASSES.infantry;
    const ammo = {
      grenade: 0,
      rpg: 0,
      repairKit: 0,
      reconDrone: 0,
      kamikazeDrone: 0
    };

    for (const weaponId of equipment || infantryClass.equipment || []) {
      const weapon = INFANTRY_WEAPONS[weaponId];
      if (weapon?.type === "gun" && weapon.ammoKey) {
        ammo[weapon.ammoKey] = weapon.defaultAmmo ?? 60;
      }
    }

    return {
      ...ammo,
      ...(infantryClass.defaultAmmo || {})
    };
  }

  function removeOwnedPlayerDrones(game, player) {
    if (!game || !player) return 0;
    game.exitPlayerDroneControl?.();
    let removed = 0;
    game.drones = (game.drones || []).filter((drone) => {
      const owned = drone.owner === player || drone === player.activeDrone || drone === player.controlledDrone;
      if (!owned) return true;
      drone.alive = false;
      drone.pendingDestroyEffect = false;
      removed += 1;
      return false;
    });
    player.activeDrone = null;
    player.controlledDrone = null;
    game.droneDesignation = null;
    game.droneInteractReleaseRequired = false;
    game.resetDroneInteractHold?.();
    return removed;
  }

  function classRoleId(classId) {
    if (classId === "engineer") return "engineer";
    if (classId === "scout") return "recon";
    return "infantry";
  }

  function installPlayerLoadout(Game) {
    Object.assign(Game.prototype, {
      applyPlayerLoadoutOverrides(player = this.player, options = {}) {
        if (!player) return false;
        const classId = player.classId || "infantry";
        player.weaponInventory = this.deploymentEquipmentForClass?.(classId) ||
          (INFANTRY_CLASSES[classId]?.equipment || INFANTRY_CLASSES.infantry.equipment).slice();
        if (!Number.isInteger(player.activeSlot) || !player.weaponInventory[player.activeSlot]) {
          player.activeSlot = 0;
        }
        player.weaponId = player.weaponInventory[player.activeSlot] || player.weaponInventory[0] || "machinegun";
        if (options.resetAmmo) player.equipmentAmmo = classAmmo(classId, player.weaponInventory);
        return true;
      },

      resetPlayerLoadoutTransientState(player = this.player, options = {}) {
        if (!player) return;
        player.rifleCooldown = 0;
        player.gunKick = 0;
        player.machineGunAim = false;
        player.lastShotCooldownScale = 1;
        player.boosting = false;
        player.boostRecoverDelay = 0;
        if (player.boostCharge !== undefined) player.boostCharge = 1;
        if (options.clearDrones !== false) removeOwnedPlayerDrones(this, player);
      },

      syncLocalCombatRoleState(player = this.player) {
        if (!player || !this.onlineSession) return false;
        const sessionPlayer = this.localSessionPlayer?.();
        if (!sessionPlayer) return false;
        const classId = player.classId || "infantry";
        sessionPlayer.classId = classId;
        sessionPlayer.currentClassId = classId;
        sessionPlayer.combatRoleId = classRoleId(classId);
        sessionPlayer.weaponId = player.weaponId || "";
        sessionPlayer.weaponInventory = (player.weaponInventory || []).slice();
        sessionPlayer.equipmentAmmo = { ...(player.equipmentAmmo || {}) };

        const slot = this.sessionSlotById?.(sessionPlayer.slotId);
        if (slot) {
          slot.currentClassId = classId;
          slot.weaponId = sessionPlayer.weaponId;
          slot.equipmentAmmo = { ...sessionPlayer.equipmentAmmo };
        }
        if (this.sessionMode === "online" && this.onlineSession?.roomId) {
          IronLine.roomRegistry?.addOrUpdatePlayer?.(this.onlineSession.roomId, sessionPlayer);
        }
        return true;
      },

      applyFullPlayerClassLoadout(classId, options = {}) {
        const player = options.player || this.player;
        if (!player || !INFANTRY_CLASSES[classId]) return false;
        const changed = player.setClass?.(classId);
        if (!changed) return false;
        this.applyPlayerLoadoutOverrides(player, { resetAmmo: options.resetAmmo !== false });
        this.resetPlayerLoadoutTransientState(player, { clearDrones: options.clearDrones !== false });
        IronLine.factionVisuals?.syncEntity?.(this, player);
        this.syncLocalCombatRoleState(player);
        return true;
      },

      selectDeploymentClass(classId) {
        if (!classId || this.matchStarted) return false;
        const changed = this.applyFullPlayerClassLoadout(classId, {
          resetAmmo: true,
          clearDrones: true
        });
        if (changed && this.hud) this.hud.deploymentClassesBuilt = false;
        return changed;
      },

      applyConquestRoleChange(classId, reason = "") {
        if (!this.isConquestMode?.() || !this.matchStarted || !INFANTRY_CLASSES[classId]) return false;
        const deathReady = this.playerDeathActive || this.playerDowned;
        if (!deathReady && !this.playerRoleChangeZone?.()) return false;

        const changed = this.applyFullPlayerClassLoadout(classId, {
          resetAmmo: true,
          clearDrones: true
        });
        if (!changed) return false;

        this.droneDesignation = null;
        this.input?.clear?.();
        this.chat?.addSystemMessage?.(`${this.roleChangeLabel?.(classId) || classId} 역할로 변경했습니다.`);
        this.hud?.update?.(this);
        this.aiObservatory?.recordEvent?.({
          unitId: "player",
          aiType: "player",
          team: this.player?.team || "",
          decision: "role_change",
          reason: reason || "conquest",
          targetId: classId,
          score: 1
        });
        return true;
      }
    });
  }

  IronLine.playerLoadouts = {
    classAmmo,
    classRoleId
  };
  IronLine.installPlayerLoadout = installPlayerLoadout;
})(window);
