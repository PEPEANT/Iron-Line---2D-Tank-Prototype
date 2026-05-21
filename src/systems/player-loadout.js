"use strict";

(function registerPlayerLoadout(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { INFANTRY_CLASSES, INFANTRY_WEAPONS } = IronLine.constants;

  function classAmmo(classId, equipment = null) {
    const infantryClass = INFANTRY_CLASSES[classId] || INFANTRY_CLASSES.infantry;
    const ammo = {
      grenade: 0,
      grenadeLauncher: 0,
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

  function roleClassId(roleId) {
    if (roleId === "engineer") return "engineer";
    if (roleId === "recon") return "scout";
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
        const loadoutAmmo = classAmmo(classId, player.weaponInventory);
        if (options.resetAmmo) {
          player.equipmentAmmo = loadoutAmmo;
        } else {
          player.equipmentAmmo = player.equipmentAmmo || {};
          for (const [ammoKey, amount] of Object.entries(loadoutAmmo)) {
            if (player.equipmentAmmo[ammoKey] === undefined || player.equipmentAmmo[ammoKey] === null) {
              player.equipmentAmmo[ammoKey] = amount;
            }
          }
        }
        return true;
      },

      resetPlayerLoadoutTransientState(player = this.player, options = {}) {
        if (!player) return;
        player.rifleCooldown = 0;
        player.gunKick = 0;
        player.fireHoldTimer = 0;
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
        sessionPlayer.stats = {
          kills: Math.max(0, Math.floor(Number(sessionPlayer.stats?.kills) || 0)),
          deaths: Math.max(0, Math.floor(Number(sessionPlayer.stats?.deaths) || 0))
        };

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

      sessionRoleClassId(roleId) {
        return roleClassId(roleId);
      },

      setLoadoutChoiceForClass(classId, slotIndex, weaponId, options = {}) {
        const slot = Number(slotIndex);
        if (!INFANTRY_CLASSES[classId] || !Number.isInteger(slot) || !INFANTRY_WEAPONS[weaponId]) return false;
        const choices = this.equipmentChoiceOptions?.(classId, slot) || [];
        if (!choices.includes(weaponId)) return false;
        const previousWeaponId = this.deploymentEquipmentForClass?.(classId)?.[slot];
        const changed = previousWeaponId !== weaponId;

        this.playerLoadoutOverrides[classId] = {
          ...(this.playerLoadoutOverrides[classId] || {}),
          [slot]: weaponId
        };

        if (this.player?.classId === classId && options.applyCurrent !== false) {
          this.applyPlayerLoadoutOverrides(this.player, { resetAmmo: options.resetAmmo === true && changed });
          if (Number.isInteger(options.activeSlot)) this.player.setEquipmentSlot?.(options.activeSlot);
          this.player.rifleCooldown = Math.min(this.player.rifleCooldown || 0, 0.12);
          this.syncLocalCombatRoleState(this.player);
        }

        if (this.hud) this.hud.deploymentClassesBuilt = false;
        return true;
      },

      setDeploymentEquipmentChoice(slotIndex, weaponId) {
        if (!this.deploymentOpen || this.countdownStarted || this.matchStarted) return false;
        const classId = this.player?.classId || "infantry";
        return this.setLoadoutChoiceForClass(classId, slotIndex, weaponId);
      },

      cycleDeploymentEquipmentChoice(slotIndex) {
        const classId = this.player?.classId || "infantry";
        const choices = this.equipmentChoiceOptions?.(classId, slotIndex) || [];
        if (choices.length < 2) return false;

        const current = this.deploymentEquipmentForClass?.(classId)?.[slotIndex];
        const currentIndex = Math.max(0, choices.indexOf(current));
        const next = choices[(currentIndex + 1) % choices.length];
        return this.setDeploymentEquipmentChoice(slotIndex, next);
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
    classRoleId,
    roleClassId
  };
  IronLine.installPlayerLoadout = installPlayerLoadout;
})(window);
