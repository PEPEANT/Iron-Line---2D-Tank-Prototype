"use strict";

(function registerPlayerDownedRevive(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, INFANTRY_WEAPONS } = IronLine.constants || {};
  const { distXY } = IronLine.math || {};

  function baseSpawnPointForTeam(game, team) {
    const teamKey = team === TEAM?.RED ? "red" : "blue";
    const spawn = team === TEAM?.RED ? game.world?.spawns?.red?.[0] : game.world?.spawns?.player;
    if (spawn && Number.isFinite(spawn.x) && Number.isFinite(spawn.y)) return spawn;
    const safeZone = (game.world?.safeZones || []).find((zone) => zone.team === teamKey);
    if (safeZone && Number.isFinite(safeZone.x) && Number.isFinite(safeZone.y)) {
      return {
        x: safeZone.x,
        y: safeZone.y,
        angle: team === TEAM?.RED ? Math.PI : 0
      };
    }
    return null;
  }

  const methods = {
    baseSpawnPointForTeam(team) {
      return baseSpawnPointForTeam(this, team);
    },

    playerCanSelfRevive() {
      return Boolean(this.playerDowned && !this.playerDeathActive && (this.player?.equipmentAmmo?.repairKit || 0) > 0);
    },

    findPlayerReviveMedic() {
      if (!this.playerDowned || this.playerDeathActive || !this.player || !distXY) return null;
      const weapon = INFANTRY_WEAPONS?.repairKit || {};
      const range = (weapon.range || 72) + (this.player.radius || 12) + 52;
      return (this.infantry || [])
        .filter((unit) => (
          unit?.alive &&
          !unit.inVehicle &&
          unit.team === this.player.team &&
          (unit.equipmentAmmo?.repairKit || 0) > 0 &&
          distXY(unit.x, unit.y, this.player.x, this.player.y) <= range
        ))
        .sort((a, b) => distXY(a.x, a.y, this.player.x, this.player.y) - distXY(b.x, b.y, this.player.x, this.player.y))[0] || null;
    },

    updatePlayerDownedRevive(dt) {
      if (!this.playerDowned || this.playerDeathActive || !this.player) return false;

      const medic = this.findPlayerReviveMedic();
      this.playerDownedReviveMedic = medic;
      if (medic) {
        medic.playerReviveTimer = (medic.playerReviveTimer || 0) + dt;
        if (medic.playerReviveTimer >= 1.45) return this.reviveDownedPlayer({ medic });
      }

      if (!this.playerCanSelfRevive()) {
        this.playerDownedReviveHold = 0;
        return false;
      }

      if (!this.input.keyDown("KeyE")) {
        this.playerDownedReviveHold = 0;
        return false;
      }

      this.playerDownedReviveHold = Math.min(this.playerDownedReviveRequired, (this.playerDownedReviveHold || 0) + dt);
      if (this.playerDownedReviveHold < this.playerDownedReviveRequired) return false;
      return this.reviveDownedPlayer({ self: true });
    },

    reviveDownedPlayer(options = {}) {
      if (!this.playerDowned || this.playerDeathActive || !this.player) return false;
      const medic = options.medic || null;
      if (medic) {
        if ((medic.equipmentAmmo?.repairKit || 0) <= 0) return false;
        medic.equipmentAmmo.repairKit = Math.max(0, (medic.equipmentAmmo.repairKit || 0) - 1);
        medic.playerReviveTimer = 0;
      } else {
        if ((this.player.equipmentAmmo?.repairKit || 0) <= 0) return false;
        this.player.equipmentAmmo.repairKit = Math.max(0, (this.player.equipmentAmmo.repairKit || 0) - 1);
      }

      const maxHp = Math.max(1, this.player.maxHp || 100);
      this.player.hp = Math.max(1, Math.round(maxHp * 0.45));
      this.player.alive = true;
      this.player.deathTime = 0;
      this.player.deathPoseAngle = 0;
      this.playerDowned = false;
      this.playerDownedTimer = 0;
      this.playerDownedReviveHold = 0;
      this.playerDownedReviveMedic = null;
      this.playerPendingDeathReason = "";
      this.playerPendingDeathSource = null;
      this.playerPendingDeathKind = "";
      this.playerDeathRecorded = false;
      this.playerDamageFlash = Math.max(this.playerDamageFlash || 0, 0.42);
      this.player.rifleCooldown = Math.max(this.player.rifleCooldown || 0, 0.45);

      this.effects.explosions.push({
        x: this.player.x,
        y: this.player.y,
        radius: 8,
        maxRadius: 58,
        life: 0.38,
        maxLife: 0.38,
        color: "rgba(116, 228, 150, 0.62)"
      });
      this.battlefieldEvents?.push?.({
        type: "player_revive",
        team: this.player.team || TEAM?.BLUE || "blue",
        title: "\uC18C\uC0DD",
        detail: medic ? `${medic.callSign || "\uC544\uAD70"}\uC774 \uC804\uD22C \uBD88\uB2A5 \uC0C1\uD0DC\uB97C \uC18C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.` : "\uC758\uB8CC\uD0A4\uD2B8\uB85C \uC790\uAC00 \uC18C\uC0DD\uD588\uC2B5\uB2C8\uB2E4."
      });
      this.input.clear();
      this.hud?.update?.(this);
      return true;
    }
  };

  IronLine.installPlayerDownedRevive = function installPlayerDownedRevive(Game) {
    if (!Game?.prototype || Game.prototype.playerDownedReviveInstalled) return;
    const baseRespawnPointForTeam = Game.prototype.respawnPointForTeam;
    Object.assign(Game.prototype, methods);
    Game.prototype.respawnPointForTeam = function respawnPointForTeamWithBaseSpawn(team) {
      return this.baseSpawnPointForTeam(team) || baseRespawnPointForTeam?.call(this, team);
    };
    Object.defineProperty(Game.prototype, "playerDownedReviveInstalled", { value: true });
  };
})(window);
