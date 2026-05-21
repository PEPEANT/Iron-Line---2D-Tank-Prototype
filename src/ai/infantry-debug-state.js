"use strict";

(function registerInfantryDebugState(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const infantryDebugStateMethods = {
    updateDebug(moveTarget) {
      this.updateThoughtBubble();
      const transportDebug = this.activeTransportDebug();
      this.debug.state = this.state;
      this.debug.goal = this.order?.objectiveName || "";
      this.debug.target = this.target;
      this.debug.coverTarget = this.coverTarget;
      this.debug.moveTarget = moveTarget;
      this.debug.weaponId = this.unit.weaponId;
      this.debug.classId = this.unit.classId;
      this.debug.rpgAmmo = this.unit.equipmentAmmo?.rpg || 0;
      this.debug.rpgAim = this.rpgAimTime || 0;
      this.debug.rpgAimRequired = this.rpgAimRequired || 0;
      this.debug.rpgHoldReason = this.rpgHoldReason || "";
      this.debug.grenadeAim = this.grenadeAimTime || 0;
      this.debug.grenadeAimRequired = this.grenadeAimRequired || 0;
      this.debug.grenadePreparing = Boolean(this.grenadePreparing);
      this.debug.grenadeWeaponId = this.grenadeWeaponId || "";
      this.debug.decision = this.repairDecision || this.tacticalDecision || null;
      this.debug.repairDecision = this.repairDecision || null;
      this.debug.tacticalDecision = this.tacticalDecision || null;
      this.debug.grenadeAmmo = this.unit.equipmentAmmo?.grenade || 0;
      this.debug.grenadeLauncherAmmo = this.unit.equipmentAmmo?.grenadeLauncher || 0;
      this.debug.droneAmmo = (this.unit.equipmentAmmo?.reconDrone || 0) + (this.unit.equipmentAmmo?.kamikazeDrone || 0);
      this.debug.droneState = this.aiDroneState || "";
      this.debug.repairAmmo = this.unit.equipmentAmmo?.repairKit || 0;
      this.debug.squadId = this.order?.squadId || this.unit.squadId || "";
      this.debug.squadRole = this.order?.squadRole || this.unit.squadRole || "";
      this.debug.tacticalMode = this.order?.tacticalMode || this.unit.squad?.tacticalMode || "";
      this.debug.tacticalTimerRemaining = this.order?.tacticalTimerRemaining || 0;
      this.debug.isProne = Boolean(this.unit.isProne);
      this.debug.supportRequest = this.order?.supportRequest?.type || this.order?.supportRequestType || this.unit.squad?.supportRequest?.type || "";
      this.debug.transportMode = transportDebug.mode;
      this.debug.transportVehicleId = transportDebug.vehicleId;
      if (this.unit.classId !== "scout") this.debug.scoutReports = 0;
      this.debug.coverQuality = this.coverTarget?.coverQuality || 0;
      this.debug.suppression = this.unit.suppression;
      this.debug.morale = this.unit.morale;
      this.debug.thought = this.thoughtText;
      this.debug.path = this.path;
      this.debug.pathIndex = this.pathIndex;
      this.debug.stuckTimer = this.stuckTimer;
      this.debug.actionLockTimer = this.actionLockTimer || 0;
      this.debug.squadOrderLockTimer = this.squadOrderLockTimer || 0;
      this.debug.movementTempoPaused = Boolean(this.movementTempoPaused);
    },

    activeTransportDebug() {
      if (this.unit.inVehicle) {
        return {
          mode: "ride",
          vehicleId: this.unit.inVehicle.callSign || ""
        };
      }

      if (this.state !== "board-transport" && this.state !== "reboard-transport") {
        return { mode: "", vehicleId: "" };
      }

      return {
        mode: this.state === "reboard-transport" ? "remount" : "mount",
        vehicleId: this.order?.transport?.vehicleId || this.target?.callSign || ""
      };
    }
  };

  function installInfantryDebugState(InfantryAI) {
    Object.assign(InfantryAI.prototype, infantryDebugStateMethods);
  }

  IronLine.installInfantryDebugState = installInfantryDebugState;
  if (IronLine.InfantryAI) installInfantryDebugState(IronLine.InfantryAI);
})(window);
