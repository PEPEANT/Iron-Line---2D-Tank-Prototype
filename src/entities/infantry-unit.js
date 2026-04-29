"use strict";

(function registerInfantryUnit(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, INFANTRY_WEAPONS } = IronLine.constants;

  class InfantryUnit {
    constructor(options) {
      this.x = options.x;
      this.y = options.y;
      this.team = options.team || TEAM.NEUTRAL;
      this.callSign = options.callSign;
      this.radius = options.radius || 10;
      this.hp = options.hp || 55;
      this.maxHp = this.hp;
      this.angle = options.angle || 0;
      this.speed = 0;
      this.maxSpeed = options.maxSpeed || 98;
      this.weaponId = INFANTRY_WEAPONS[options.weaponId] ? options.weaponId : "rifle";
      this.classId = options.classId || "infantry";
      this.equipmentAmmo = {
        rpg: options.equipmentAmmo?.rpg ?? options.rpgAmmo ?? (this.classId === "engineer" ? 2 : 0),
        grenade: options.equipmentAmmo?.grenade ?? options.grenadeAmmo ?? 0,
        repairKit: options.equipmentAmmo?.repairKit ?? options.repairKitAmmo ?? (this.classId === "engineer" ? 2 : 0)
      };
      this.suppression = 0;
      this.suppressed = false;
      this.morale = 1;
      this.suppressionTimer = 0;
      this.lastThreat = null;
      this.isProne = false;
      this.proneCooldown = 0;
      this.proneHoldTimer = 0;
      this.deathTime = 0;
      this.deathPoseAngle = 0;
      this.alive = true;
      this.ai = null;
      this.inVehicle = null;
      this.transportVehicle = null;
      this.transportCooldown = 0;
    }

    getWeapon() {
      return INFANTRY_WEAPONS[this.weaponId] || INFANTRY_WEAPONS.rifle;
    }

    setWeapon(weaponId) {
      if (!INFANTRY_WEAPONS[weaponId]) return false;
      this.weaponId = weaponId;
      return true;
    }

    update(game, dt) {
      if (!this.alive) return;
      this.transportCooldown = Math.max(0, (this.transportCooldown || 0) - dt);
      this.proneCooldown = Math.max(0, (this.proneCooldown || 0) - dt);
      this.proneHoldTimer = Math.max(0, (this.proneHoldTimer || 0) - dt);
      if (this.inVehicle) {
        if (!this.inVehicle.alive) {
          this.inVehicle = null;
          this.transportVehicle = null;
        } else {
          this.x = this.inVehicle.x;
          this.y = this.inVehicle.y;
          this.angle = this.inVehicle.angle;
          this.speed = 0;
          this.updateSuppression(dt);
          return;
        }
      }
      this.updateSuppression(dt);
      if (this.ai && game.matchStarted !== false && !game.testLabAiPaused) this.ai.update(dt);
    }

    updateSuppression(dt) {
      const recoveryRate = this.suppressed ? 11 : 18;
      this.suppression = Math.max(0, this.suppression - recoveryRate * dt);
      this.suppressionTimer = Math.max(0, this.suppressionTimer - dt);

      if (this.suppression > 58) this.suppressed = true;
      else if (this.suppression < 34) this.suppressed = false;

      if (this.suppressionTimer <= 0 && this.suppression < 8) this.lastThreat = null;
      this.morale = Math.max(0.35, Math.min(1, 1 - this.suppression / 125));
    }

    suppress(amount, source) {
      if (!this.alive) return;
      this.suppression = Math.min(100, this.suppression + amount);
      this.suppressionTimer = Math.max(this.suppressionTimer, 1.4 + this.suppression / 72);
      if (source) this.lastThreat = source;
      if (this.suppression > 58) this.suppressed = true;
      this.morale = Math.max(0.35, Math.min(1, 1 - this.suppression / 125));
    }

    takeDamage(amount) {
      if (!this.alive) return;
      this.suppress(26 + amount * 0.42, null);
      this.hp -= amount;
      if (this.hp <= 0) {
        this.hp = 0;
        this.alive = false;
        this.speed = 0;
        this.deathTime = typeof performance !== "undefined" ? performance.now() / 1000 : 0;
        this.deathPoseAngle = this.angle + Math.PI / 2 + (Math.random() - 0.5) * 0.42;
      }
    }
  }

  IronLine.InfantryUnit = InfantryUnit;
})(window);
