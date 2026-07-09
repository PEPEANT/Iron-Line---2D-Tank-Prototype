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
      this.factionId = options.factionId || options.skinId || "";
      this.skinId = this.factionId;
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
        grenade: options.equipmentAmmo?.grenade ?? options.grenadeAmmo ?? (this.classId === "infantry" ? 3 : 0),
        grenadeLauncher: options.equipmentAmmo?.grenadeLauncher ?? options.grenadeLauncherAmmo ?? (options.weaponId === "grenadeLauncher" ? 3 : 0),
        reconDrone: options.equipmentAmmo?.reconDrone ?? options.reconDroneAmmo ?? (this.classId === "scout" ? 1 : 0),
        kamikazeDrone: options.equipmentAmmo?.kamikazeDrone ?? options.kamikazeDroneAmmo ?? (this.classId === "engineer" ? 1 : 0),
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
      this.combatShockTimer = 0;
      this.combatShockTotal = 0;
      this.combatShockLookAngle = this.angle;
      this.hitReactTimer = 0;
      this.hitSlowTimer = 0;
      this.hitReactAngle = 0;
      this.hitReactStrength = 0;
      this.healthRevealTimer = 0;
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

    update(game, dt, options = {}) {
      if (!this.alive) return;
      this.transportCooldown = Math.max(0, (this.transportCooldown || 0) - dt);
      this.proneCooldown = Math.max(0, (this.proneCooldown || 0) - dt);
      this.proneHoldTimer = Math.max(0, (this.proneHoldTimer || 0) - dt);
      this.combatShockTimer = Math.max(0, (this.combatShockTimer || 0) - dt);
      this.hitReactTimer = Math.max(0, (this.hitReactTimer || 0) - dt);
      this.hitSlowTimer = Math.max(0, (this.hitSlowTimer || 0) - dt);
      this.healthRevealTimer = Math.max(0, (this.healthRevealTimer || 0) - dt);
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
      const aiDt = options.aiDt ?? dt;
      if (!options.skipAi && aiDt > 0 && this.ai && game.matchStarted !== false && !game.testLabAiPaused) {
        this.ai.update(aiDt);
      }
    }

    updateSuppression(dt) {
      const recoveryRate = this.isProne ? 3.9 : this.suppressed ? 5.8 : 9.2;
      this.suppression = Math.max(0, this.suppression - recoveryRate * dt);
      this.suppressionTimer = Math.max(0, this.suppressionTimer - dt);

      if (this.suppression > 30) this.suppressed = true;
      else if (this.suppression < 14) this.suppressed = false;

      if (this.suppressionTimer <= 0 && this.suppression < 8) this.lastThreat = null;
      this.morale = Math.max(0.35, Math.min(1, 1 - this.suppression / 125));
    }

    suppress(amount, source) {
      if (!this.alive) return;
      this.suppression = Math.min(100, this.suppression + amount);
      this.suppressionTimer = Math.max(this.suppressionTimer, 1.4 + this.suppression / 72);
      if (source) this.lastThreat = source;
      if (this.suppression > 30) this.suppressed = true;
      this.morale = Math.max(0.35, Math.min(1, 1 - this.suppression / 125));
    }

    takeDamage(amount, source = null) {
      if (!this.alive) return;
      this.suppress(26 + amount * 0.42, source);
      this.hp -= amount;
      this.healthRevealTimer = Math.max(this.healthRevealTimer || 0, 1.55);
      if (this.hp <= 0) {
        this.hp = 0;
        this.alive = false;
        this.speed = 0;
        this.deathTime = typeof performance !== "undefined" ? performance.now() / 1000 : 0;
        this.deathPoseAngle = this.angle + Math.PI / 2 + (Math.random() - 0.5) * 0.42;
      } else {
        const impact = Math.min(0.16, Math.max(0.08, amount / Math.max(1, this.maxHp) * 0.42));
        this.hitReactTimer = Math.max(this.hitReactTimer || 0, impact);
        this.hitSlowTimer = Math.max(this.hitSlowTimer || 0, 0.32 + Math.min(0.2, amount / 80));
        if (source && Number.isFinite(source.x) && Number.isFinite(source.y)) {
          const threatAngle = Math.atan2(source.y - this.y, source.x - this.x);
          const side = Math.random() < 0.5 ? -1 : 1;
          const heavyHit = amount >= 30 || source.weaponId === "sniper";
          const shock = Math.min(1.32, 0.45 + amount / 95 + Math.random() * 0.34 + (heavyHit ? 0.26 : 0));
          const shockTimer = Math.max(this.combatShockTimer || 0, shock);
          this.combatShockTimer = shockTimer;
          this.combatShockTotal = shockTimer;
          this.combatShockLookAngle = threatAngle + side * (0.48 + Math.random() * 0.88) + (Math.random() - 0.5) * 0.3;
          if (!this.isProne) this.proneCooldown = Math.max(this.proneCooldown || 0, shock + 0.34);
          this.hitReactAngle = Math.atan2(this.y - source.y, this.x - source.x);
          this.hitReactStrength = Math.max(this.hitReactStrength || 0, Math.min(6, 2.4 + amount / 18));
        }
      }
    }
  }

  IronLine.InfantryUnit = InfantryUnit;
})(window);
