"use strict";

(function registerHumveeAI(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;
  const {
    clamp,
    distXY,
    angleTo,
    normalizeAngle,
    rotateTowards,
    expandedRect,
    lineIntersectsRect
  } = IronLine.math;
  const { hasLineOfSight } = IronLine.physics;

  class HumveeAI {
    constructor(vehicle, game) {
      this.vehicle = vehicle;
      this.game = game;
      this.navigation = new IronLine.NavigationAgent(vehicle, game);
      this.state = "support";
      this.target = null;
      this.strafeSide = Math.random() < 0.5 ? -1 : 1;
      this.strafeTimer = 1.2 + Math.random() * 1.8;
      this.debug = {
        state: this.state,
        target: null,
        moveTarget: null,
        path: [],
        stuckTimer: 0
      };
    }

    update(dt) {
      if (!this.vehicle.alive) return;

      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeSide *= -1;
        this.strafeTimer = 1.4 + Math.random() * 2.2;
      }

      const beforeX = this.vehicle.x;
      const beforeY = this.vehicle.y;
      const target = this.findTarget();
      const heavyThreat = this.findHeavyThreat();
      let moveTarget = null;

      if (target) {
        this.state = "fire-support";
        this.target = target;
        this.aimAndFire(target, dt);
      } else {
        this.target = null;
        this.vehicle.machineGunAngle = rotateTowards(
          this.vehicle.machineGunAngle,
          this.vehicle.angle,
          this.vehicle.machineGunTurnRate * 0.45 * dt
        );
      }

      if (heavyThreat) {
        this.state = target ? "skirmish" : "evade";
        moveTarget = heavyThreat;
        this.driveAwayFrom(dt, heavyThreat.x, heavyThreat.y, 0.88);
      } else if (target && distXY(this.vehicle.x, this.vehicle.y, target.x, target.y) < 270) {
        moveTarget = target;
        this.orbitTarget(dt, target);
      } else {
        const order = this.createObjectiveOrder();
        moveTarget = this.navigation.update(dt, order);
        if (moveTarget) this.driveTo(dt, moveTarget.x, moveTarget.y, moveTarget.stopDistance ?? 86);
        else this.applyDrive(dt, 0, 0);
      }

      const tryingToMove = moveTarget && distXY(this.vehicle.x, this.vehicle.y, moveTarget.x, moveTarget.y) > 90;
      this.navigation.recordMovement(dt, beforeX, beforeY, tryingToMove);
      this.updateDebug(moveTarget);
    }

    createObjectiveOrder() {
      const point = this.chooseObjective();
      if (!point) return null;
      return {
        id: `${this.vehicle.team}:humvee:${point.name}`,
        team: this.vehicle.team,
        point,
        objectiveName: point.name,
        role: "support",
        stance: "support",
        slotIndex: 0,
        slotCount: 1,
        leashRadius: point.radius + 480,
        threatRadius: point.radius + 360,
        supportPoint: {
          x: point.x,
          y: point.y,
          radius: point.radius,
          stopDistance: 108
        }
      };
    }

    chooseObjective() {
      const enemyTeam = this.vehicle.team === TEAM.BLUE ? TEAM.RED : TEAM.BLUE;
      const points = this.game.capturePoints || [];
      const activePoint = points
        .filter((point) => point.contested || point.owner !== this.vehicle.team)
        .map((point) => {
          const distance = distXY(this.vehicle.x, this.vehicle.y, point.x, point.y);
          let score = distance;
          if (point.owner === enemyTeam) score -= 360;
          if (point.owner === TEAM.NEUTRAL) score -= 160;
          if (point.contested) score -= 280;
          return { point, score };
        })
        .sort((a, b) => a.score - b.score)[0]?.point || null;

      if (activePoint) return activePoint;

      const enemyBase = (this.game.world.safeZones || []).find((zone) => zone.team === enemyTeam);
      if (enemyBase) {
        return {
          name: `${enemyTeam}-base-pressure`,
          x: enemyBase.x,
          y: enemyBase.y,
          radius: enemyBase.radius || 300,
          owner: enemyTeam
        };
      }

      return points
        .map((point) => ({
          point,
          score: -distXY(this.vehicle.x, this.vehicle.y, point.x, point.y)
        }))
        .sort((a, b) => a.score - b.score)[0]?.point || null;
    }

    findTarget() {
      const weapon = this.vehicle.machineGunWeapon();
      const muzzle = this.vehicle.machineGunMuzzlePoint();
      const candidates = [];

      const add = (target, priority = 0) => {
        if (!target || !target.alive || target.team === this.vehicle.team) return;
        const distance = distXY(muzzle.x, muzzle.y, target.x, target.y);
        if (distance > weapon.range) return;
        if (!hasLineOfSight(this.game, muzzle, target, { padding: 4 })) return;
        const threatBonus =
          target.classId === "engineer" || target.weaponId === "rpg" ? 210 :
          target.weaponId === "machinegun" || target.weaponId === "lmg" ? 120 :
          0;
        candidates.push({
          target,
          score: distance - threatBonus - priority
        });
      };

      for (const unit of this.game.infantry || []) add(unit, 110);
      for (const crew of this.game.crews || []) {
        if (!crew.inTank) add(crew, 60);
      }
      for (const humvee of this.game.humvees || []) add(humvee, -40);

      if (this.vehicle.team === TEAM.RED && !this.game.player.inTank && this.game.player.hp > 0 && !this.game.isPlayerInSafeZone?.()) {
        add(this.game.player, 130);
      }

      return candidates.sort((a, b) => a.score - b.score)[0]?.target || null;
    }

    findHeavyThreat() {
      return (this.game.tanks || [])
        .filter((tank) => tank.alive && tank.team !== this.vehicle.team)
        .map((tank) => ({ tank, distance: distXY(this.vehicle.x, this.vehicle.y, tank.x, tank.y) }))
        .filter((item) => item.distance < 500)
        .sort((a, b) => a.distance - b.distance)[0]?.tank || null;
    }

    aimAndFire(target, dt) {
      const targetAngle = angleTo(this.vehicle.x, this.vehicle.y, target.x, target.y);
      this.vehicle.machineGunAngle = rotateTowards(
        this.vehicle.machineGunAngle,
        targetAngle,
        this.vehicle.machineGunTurnRate * dt
      );

      const aimError = Math.abs(normalizeAngle(this.vehicle.machineGunAngle - targetAngle));
      if (aimError < 0.18) this.vehicle.fireMachineGun(this.game, target.x, target.y, { target });
    }

    driveTo(dt, x, y, stopDistance = 0) {
      const dx = x - this.vehicle.x;
      const dy = y - this.vehicle.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= stopDistance) {
        this.applyDrive(dt, 0, 0);
        return;
      }
      const intensity = clamp((distance - stopDistance) / 260, 0.34, 1);
      this.driveVector(dt, dx / Math.max(distance, 1), dy / Math.max(distance, 1), intensity);
    }

    driveAwayFrom(dt, x, y, intensity = 0.8) {
      const dx = this.vehicle.x - x;
      const dy = this.vehicle.y - y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      this.driveVector(dt, dx / distance, dy / distance, intensity, { allowReverse: false });
    }

    orbitTarget(dt, target) {
      const awayAngle = angleTo(target.x, target.y, this.vehicle.x, this.vehicle.y);
      const sideAngle = awayAngle + Math.PI / 2 * this.strafeSide;
      const distance = distXY(this.vehicle.x, this.vehicle.y, target.x, target.y);
      const awayBias = distance < 210 ? 0.55 : 0.18;
      const vx = Math.cos(sideAngle) + Math.cos(awayAngle) * awayBias;
      const vy = Math.sin(sideAngle) + Math.sin(awayAngle) * awayBias;
      const length = Math.max(1, Math.hypot(vx, vy));
      this.driveVector(dt, vx / length, vy / length, 0.58);
    }

    driveVector(dt, vx, vy, intensity, options = {}) {
      const recovery = this.navigation.getRecoveryDrive();
      if (recovery) {
        this.applyDrive(dt, recovery.throttle, recovery.turn);
        return;
      }

      const steer = this.avoidanceVector(vx, vy);
      const desiredAngle = Math.atan2(steer.y, steer.x);
      const forwardDiff = normalizeAngle(desiredAngle - this.vehicle.angle);
      const reverseDiff = normalizeAngle(desiredAngle - normalizeAngle(this.vehicle.angle + Math.PI));

      if (options.allowReverse !== false && Math.abs(forwardDiff) > 2.25 && Math.abs(reverseDiff) < Math.abs(forwardDiff) - 0.35) {
        this.applyDrive(dt, -intensity * 0.42, clamp(reverseDiff * 1.2, -1, 1));
        return;
      }

      const aligned = clamp((Math.cos(forwardDiff) + 0.25) / 1.25, 0, 1);
      this.applyDrive(dt, intensity * aligned, clamp(forwardDiff * 1.34, -1, 1));
    }

    avoidanceVector(vx, vy) {
      let ax = vx;
      let ay = vy;

      for (const obstacle of this.game.world.obstacles) {
        const expanded = expandedRect(obstacle, 62);
        const lookX = this.vehicle.x + vx * 96;
        const lookY = this.vehicle.y + vy * 96;
        if (!lineIntersectsRect(this.vehicle.x, this.vehicle.y, lookX, lookY, expanded)) continue;

        const nearestX = clamp(this.vehicle.x, obstacle.x, obstacle.x + obstacle.w);
        const nearestY = clamp(this.vehicle.y, obstacle.y, obstacle.y + obstacle.h);
        const awayX = this.vehicle.x - nearestX;
        const awayY = this.vehicle.y - nearestY;
        const distance = Math.max(1, Math.hypot(awayX, awayY));
        ax += awayX / distance * 0.82;
        ay += awayY / distance * 0.82;
      }

      for (const other of [...(this.game.tanks || []), ...(this.game.humvees || [])]) {
        if (other === this.vehicle || !other.alive) continue;
        const distance = distXY(this.vehicle.x, this.vehicle.y, other.x, other.y);
        const avoidRange = (this.vehicle.radius || 30) + (other.radius || 32) + 26;
        if (distance > avoidRange || distance < 1) continue;
        ax += ((this.vehicle.x - other.x) / distance) * (avoidRange - distance) / Math.max(avoidRange * 0.54, 1);
        ay += ((this.vehicle.y - other.y) / distance) * (avoidRange - distance) / Math.max(avoidRange * 0.54, 1);
      }

      const length = Math.max(0.001, Math.hypot(ax, ay));
      return { x: ax / length, y: ay / length };
    }

    applyDrive(dt, throttle, turn) {
      this.vehicle.drive(this.game, dt, throttle, turn, {
        turnScale: 1.08,
        collisionSpeedRetain: 0.36
      });
    }

    updateDebug(moveTarget) {
      const navDebug = this.navigation.debugState();
      this.debug.state = this.state;
      this.debug.target = this.target;
      this.debug.moveTarget = moveTarget || navDebug.moveTarget;
      this.debug.path = navDebug.path;
      this.debug.stuckTimer = navDebug.stuckTimer;
    }
  }

  IronLine.HumveeAI = HumveeAI;
})(window);
