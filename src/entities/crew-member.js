"use strict";

(function registerCrewMember(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;
  const { clamp, distXY, angleTo, approach, circleRectCollision } = IronLine.math;
  const { tryMoveCircle } = IronLine.physics;

  class CrewMember {
    constructor(options) {
      this.x = options.x;
      this.y = options.y;
      this.team = options.team || TEAM.NEUTRAL;
      this.callSign = options.callSign;
      this.factionId = options.factionId || options.skinId || "";
      this.skinId = this.factionId;
      this.radius = 10;
      this.hp = options.hp || 45;
      this.maxHp = this.hp;
      this.angle = options.angle || 0;
      this.speed = 0;
      this.maxSpeed = options.maxSpeed || 108;
      this.targetTank = options.targetTank || null;
      this.role = options.role || "crew";
      this.dedicated = Boolean(options.dedicated);
      this.inTank = null;
      this.alive = true;
      this.state = this.targetTank ? "mounting" : "idle";
      this.mountTimer = 0;
      this.mountTime = 0.65 + Math.random() * 0.35;
      this.deathTime = 0;
      this.deathPoseAngle = 0;
    }

    update(game, dt) {
      if (!this.alive) return;

      if (this.inTank) {
        this.x = this.inTank.x;
        this.y = this.inTank.y;
        this.angle = this.inTank.angle;
        this.speed = 0;
        this.state = "mounted";
        return;
      }

      if (!this.targetTank || !this.targetTank.alive) {
        this.state = "idle";
        this.speed = approach(this.speed, 0, 220 * dt);
        return;
      }

      if (this.targetTank.vehicleType === "humvee" && this.targetTank.playerControlled) {
        this.state = "vehicle-taken-cover";
        this.moveAwayFromControlledVehicle(game, dt);
        this.mountTimer = 0;
        return;
      }

      if (this.targetTank.crew && this.targetTank.crew !== this) {
        this.state = "idle";
        return;
      }

      this.state = "mounting";
      const distance = distXY(this.x, this.y, this.targetTank.x, this.targetTank.y);
      this.angle = angleTo(this.x, this.y, this.targetTank.x, this.targetTank.y);

      if (distance <= this.targetTank.radius + 18) {
        this.speed = approach(this.speed, 0, 260 * dt);
        this.mountTimer += dt;
        if (this.mountTimer >= this.mountTime) this.boardTargetTank();
        return;
      }

      this.mountTimer = 0;
      this.speed = approach(this.speed, this.maxSpeed, 300 * dt);
      tryMoveCircle(
        game,
        this,
        Math.cos(this.angle) * this.speed,
        Math.sin(this.angle) * this.speed,
        this.radius,
        dt,
        { blockTanks: true, padding: 5 }
      );
    }

    boardTargetTank() {
      if (!this.targetTank?.boardCrew(this)) return false;
      this.inTank = this.targetTank;
      this.x = this.targetTank.x;
      this.y = this.targetTank.y;
      this.state = "mounted";
      this.speed = 0;
      return true;
    }

    moveAwayFromControlledVehicle(game, dt) {
      const tank = this.targetTank;
      if (!tank) {
        this.speed = approach(this.speed, 0, 220 * dt);
        return;
      }
      const safeDistance = (tank.radius || 30) + this.radius + 78;
      const currentDistance = distXY(this.x, this.y, tank.x, tank.y);
      if (currentDistance >= safeDistance) {
        this.angle = angleTo(this.x, this.y, tank.x, tank.y);
        this.speed = approach(this.speed, 0, 220 * dt);
        return;
      }
      const awayAngle = angleTo(tank.x, tank.y, this.x, this.y);
      const candidate = this.findCrewCoverPoint(game, tank, awayAngle, safeDistance);
      this.angle = angleTo(this.x, this.y, candidate.x, candidate.y);
      this.speed = approach(this.speed, this.maxSpeed * 0.82, 300 * dt);
      tryMoveCircle(
        game,
        this,
        Math.cos(this.angle) * this.speed,
        Math.sin(this.angle) * this.speed,
        this.radius,
        dt,
        { blockTanks: true, padding: 5 }
      );
    }

    findCrewCoverPoint(game, tank, baseAngle, distance) {
      const angles = [baseAngle, baseAngle + Math.PI / 3, baseAngle - Math.PI / 3, baseAngle + Math.PI / 2, baseAngle - Math.PI / 2];
      for (const angle of angles) {
        const x = clamp(tank.x + Math.cos(angle) * distance, this.radius, game.world.width - this.radius);
        const y = clamp(tank.y + Math.sin(angle) * distance, this.radius, game.world.height - this.radius);
        const blocked = (game.world.obstacles || []).some((obstacle) => circleRectCollision(x, y, this.radius + 2, obstacle));
        if (!blocked) return { x, y };
      }
      return {
        x: clamp(tank.x + Math.cos(baseAngle) * distance, this.radius, game.world.width - this.radius),
        y: clamp(tank.y + Math.sin(baseAngle) * distance, this.radius, game.world.height - this.radius)
      };
    }

    dismount(game) {
      if (!this.inTank) return false;
      this.inTank.leaveCrew(this);
      this.targetTank = null;
      this.inTank = null;
      this.state = "idle";
      return true;
    }

    takeDamage(amount) {
      if (!this.alive) return;
      this.hp -= amount;
      if (this.hp <= 0) {
        this.hp = 0;
        this.alive = false;
        this.speed = 0;
        this.deathTime = typeof performance !== "undefined" ? performance.now() / 1000 : 0;
        this.deathPoseAngle = this.angle + Math.PI / 2 + (Math.random() - 0.5) * 0.42;
        if (this.inTank) this.inTank.leaveCrew(this);
        this.inTank = null;
      }
    }
  }

  IronLine.CrewMember = CrewMember;
})(window);
