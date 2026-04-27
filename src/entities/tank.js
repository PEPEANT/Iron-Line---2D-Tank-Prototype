"use strict";

(function registerTank(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { AMMO } = IronLine.constants;
  const { clamp, distXY, normalizeAngle } = IronLine.math;

  class Tank {
    constructor(options) {
      this.x = options.x;
      this.y = options.y;
      this.team = options.team;
      this.callSign = options.callSign;
      this.angle = options.angle || 0;
      this.turretAngle = this.angle;
      this.radius = 27;
      this.maxHp = options.maxHp || 110;
      this.hp = this.maxHp;
      this.speed = 0;
      this.turnRate = options.turnRate || 1.95;
      this.maxSpeed = options.maxSpeed || 145;
      this.accel = options.accel || 215;
      this.turretTurnRate = options.turretTurnRate || 1.65;
      this.aimTargetAngle = this.turretAngle;
      this.aimError = 0;
      this.loadedAmmo = null;
      this.reload = {
        active: false,
        ammoId: null,
        progress: 0,
        duration: 1
      };
      this.ammo = {
        ap: options.ammo?.ap ?? 12,
        he: options.ammo?.he ?? 8,
        smoke: options.ammo?.smoke ?? 1
      };
      this.fireCooldown = 0;
      this.smokeCooldown = 0;
      this.recoil = 0;
      this.fireOrder = null;
      this.alive = true;
      this.ai = null;
      this.isPlayerTank = Boolean(options.isPlayerTank);
      this.crew = null;
      this.playerControlled = false;
      this.wreckTimer = 0;
    }

    hasCrew() {
      return Boolean(this.crew) || this.playerControlled;
    }

    isOperational() {
      return this.alive && this.hasCrew();
    }

    boardCrew(crew) {
      if (!this.alive || this.crew && this.crew !== crew) return false;
      this.crew = crew;
      return true;
    }

    leaveCrew(crew) {
      if (this.crew === crew) this.crew = null;
    }

    beginLoad(ammoId) {
      if (!this.alive || !AMMO[ammoId] || AMMO[ammoId].equipment || this.ammo[ammoId] <= 0) return false;
      if (this.loadedAmmo === ammoId) return true;
      if (this.reload.active && this.reload.ammoId === ammoId) return true;

      this.fireOrder = null;
      this.loadedAmmo = null;
      this.reload.active = true;
      this.reload.ammoId = ammoId;
      this.reload.progress = 0;
      this.reload.duration = AMMO[ammoId].loadTime;
      return true;
    }

    update(game, dt) {
      if (!this.alive) {
        this.wreckTimer += dt;
        return;
      }

      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      this.smokeCooldown = Math.max(0, this.smokeCooldown - dt);
      this.recoil = Math.max(0, this.recoil - dt * 4);

      if (this.reload.active) {
        this.reload.progress += dt;
        if (this.reload.progress >= this.reload.duration) {
          this.loadedAmmo = this.reload.ammoId;
          this.reload.active = false;
          this.reload.progress = this.reload.duration;
        }
      }

      if (this.ai && this.isOperational() && game.matchStarted !== false) this.ai.update(dt);
    }

    canFire() {
      return this.alive && this.loadedAmmo && !AMMO[this.loadedAmmo]?.equipment && this.fireCooldown <= 0;
    }

    fire(game, options = {}) {
      if (!this.canFire()) return false;

      const ammo = AMMO[this.loadedAmmo];
      if (this.ammo[ammo.id] <= 0) {
        this.loadedAmmo = null;
        return false;
      }

      this.ammo[ammo.id] -= 1;
      const muzzleDistance = this.radius + 28;
      const muzzleX = this.x + Math.cos(this.turretAngle) * muzzleDistance;
      const muzzleY = this.y + Math.sin(this.turretAngle) * muzzleDistance;
      const aimError = options.aimError ?? this.aimError ?? 0;
      const baseVariance = ammo.id === "he" ? 0.018 : 0.01;
      const rushedVariance = clamp(Math.max(0, aimError - 0.08) / 0.55, 0, 1) * (ammo.id === "he" ? 0.055 : 0.035);
      const variance = baseVariance + rushedVariance;
      const shellAngle = this.turretAngle + (Math.random() - 0.5) * variance;
      const fuseDistance = options.fuseDistance ?? (options.target ? distXY(muzzleX, muzzleY, options.target.x, options.target.y) : null);
      const shellLife = ammo.id === "he" && fuseDistance
        ? clamp(fuseDistance / ammo.speed, 0.12, ammo.life || 3)
        : ammo.life || 3;

      game.projectiles.push({
        x: muzzleX,
        y: muzzleY,
        previousX: muzzleX,
        previousY: muzzleY,
        vx: Math.cos(shellAngle) * ammo.speed,
        vy: Math.sin(shellAngle) * ammo.speed,
        team: this.team,
        owner: this,
        ammo,
        life: shellLife,
        radius: ammo.shellRadius
      });

      game.effects.explosions.push({
        x: muzzleX,
        y: muzzleY,
        radius: 22,
        maxRadius: 30,
        life: 0.18,
        maxLife: 0.18,
        color: "rgba(255, 226, 160, 0.9)"
      });

      this.fireCooldown = 0.18;
      this.loadedAmmo = null;
      this.fireOrder = null;
      this.recoil = 1;
      this.speed -= Math.cos(normalizeAngle(this.turretAngle - this.angle)) * 22;
      return true;
    }

    deploySmoke(game) {
      const smoke = AMMO.smoke;
      if (!this.alive || this.smokeCooldown > 0 || this.ammo.smoke <= 0) return false;

      this.ammo.smoke -= 1;
      this.smokeCooldown = smoke.cooldown || 7;

      const offsets = [
        { angle: 0, distance: 0, spread: 0 },
        { angle: this.angle + Math.PI, distance: 46, spread: -0.38 },
        { angle: this.angle + Math.PI, distance: 46, spread: 0.38 },
        { angle: this.angle + Math.PI * 0.72, distance: 42, spread: 0 },
        { angle: this.angle - Math.PI * 0.72, distance: 42, spread: 0 }
      ];

      for (const offset of offsets) {
        const angle = offset.angle + offset.spread;
        game.effects.smokeClouds.push({
          x: this.x + Math.cos(angle) * offset.distance,
          y: this.y + Math.sin(angle) * offset.distance,
          radius: 34,
          maxRadius: 132 + Math.random() * 28,
          life: 9.5,
          maxLife: 9.5
        });
      }

      game.effects.explosions.push({
        x: this.x,
        y: this.y,
        radius: 16,
        maxRadius: 76,
        life: 0.42,
        maxLife: 0.42,
        color: "rgba(220, 226, 230, 0.65)"
      });

      return true;
    }

    takeDamage(game, amount) {
      if (!this.alive) return;

      this.hp -= amount;
      game.effects.explosions.push({
        x: this.x + (Math.random() - 0.5) * 32,
        y: this.y + (Math.random() - 0.5) * 32,
        radius: 8,
        maxRadius: 34,
        life: 0.28,
        maxLife: 0.28,
        color: "rgba(255, 133, 92, 0.8)"
      });

      if (this.hp <= 0) {
        this.hp = 0;
        this.alive = false;
        this.speed = 0;
        this.reload.active = false;
        this.loadedAmmo = null;
        game.effects.scorchMarks.push({ x: this.x, y: this.y, radius: 58, alpha: 0.45 });
        game.effects.explosions.push({
          x: this.x,
          y: this.y,
          radius: 30,
          maxRadius: 138,
          life: 0.72,
          maxLife: 0.72,
          color: "rgba(255, 118, 72, 0.95)"
        });
      }
    }
  }

  IronLine.Tank = Tank;
})(window);
