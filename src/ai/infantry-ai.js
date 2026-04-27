"use strict";

(function registerInfantryAI(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, AMMO, INFANTRY_WEAPONS } = IronLine.constants;
  const { clamp, distXY, angleTo, approach, normalizeAngle, rotateTowards, expandedRect, lineIntersectsRect, circleRectCollision, segmentDistanceToPoint } = IronLine.math;
  const { tryMoveCircle, hasLineOfSight, circleIntersectsTank } = IronLine.physics;

  const INFANTRY_CONFIG = {
    sightRange: 620,
    coverThreatRange: 720,
    coverDuration: 2.7,
    suppressedThreshold: 58,
    tankHarassRange: 560,
    tankHarassMinGroup: 3,
    rpgMinRange: 190,
    rpgPanicRange: 330,
    repairSearchRange: 760,
    repairUnsafeEnemyRange: 540,
    repairHoldDistance: 58,
    scoutSightRange: 1080,
    scoutReportRange: 1220,
    scoutReportTtl: 3.8
  };

  class InfantryAI {
    constructor(unit, game) {
      this.unit = unit;
      this.game = game;
      this.state = "advance";
      this.order = null;
      this.path = [];
      this.pathIndex = 0;
      this.orderId = "";
      this.repathTimer = 0;
      this.stuckTimer = 0;
      this.fireCooldown = Math.random() * 0.35;
      this.coverTimer = 0;
      this.coverTarget = null;
      this.target = null;
      this.moveHeading = unit.angle;
      this.seed = this.hash(unit.callSign);
      this.debug = {
        state: this.state,
        goal: "",
        target: null,
        coverTarget: null,
        moveTarget: null,
        weaponId: this.unit.weaponId,
        classId: this.unit.classId,
        rpgAmmo: this.unit.equipmentAmmo?.rpg || 0,
        repairAmmo: this.unit.equipmentAmmo?.repairKit || 0,
        squadId: "",
        squadRole: "",
        scoutReports: 0,
        coverQuality: 0,
        suppression: 0,
        morale: 1,
        path: [],
        pathIndex: 0,
        stuckTimer: 0
      };
    }

    hash(value) {
      return String(value).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    }

    weapon() {
      return INFANTRY_WEAPONS[this.unit.weaponId] || INFANTRY_WEAPONS.rifle;
    }

    sightRange() {
      return this.unit.classId === "scout" ? INFANTRY_CONFIG.scoutSightRange : INFANTRY_CONFIG.sightRange;
    }

    update(dt) {
      const beforeX = this.unit.x;
      const beforeY = this.unit.y;
      this.repathTimer = Math.max(0, this.repathTimer - dt);
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      this.coverTimer = Math.max(0, this.coverTimer - dt);

      const order = this.resolveOrder();
      this.order = order;
      const contact = this.selectTarget();
      const tankThreat = this.selectTankThreat();
      this.target = contact;
      if (this.unit.classId === "scout") this.updateScoutReports();

      if (!order?.point) {
        this.state = "idle";
        this.unit.speed = approach(this.unit.speed, 0, 180 * dt);
        this.faceContact(contact, dt);
        this.updateDebug(null);
        return;
      }

      const pressureThreat = this.unit.suppression >= INFANTRY_CONFIG.suppressedThreshold
        ? contact || tankThreat || this.unit.lastThreat
        : null;
      if (pressureThreat) {
        const coverTarget = this.resolveCoverTarget(pressureThreat);
        this.state = "suppressed";
        this.target = contact || tankThreat || pressureThreat;
        this.faceContact(this.target, dt);
        if (contact && this.unit.suppression < 84) this.tryFire(contact);

        if (coverTarget) {
          this.moveTo(dt, coverTarget);
          this.recordMovement(dt, beforeX, beforeY, coverTarget);
          this.updateDebug(coverTarget);
          return;
        }

        this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
        this.updateDebug(null);
        return;
      }

      const fireLaneEscape = this.findFriendlyTankFireLaneEscape();
      if (fireLaneEscape && (!contact || this.unit.suppression < 42)) {
        this.state = "avoid-fire-lane";
        this.moveTo(dt, fireLaneEscape);
        this.recordMovement(dt, beforeX, beforeY, fireLaneEscape);
        this.updateDebug(fireLaneEscape);
        return;
      }

      if (this.unit.classId === "scout" && order.role === "recon") {
        this.updateReconOrder(dt, order, contact, tankThreat, beforeX, beforeY);
        return;
      }

      const repairTarget = this.selectRepairTarget(contact, tankThreat);
      if (repairTarget) {
        const weapon = INFANTRY_WEAPONS.repairKit;
        const repairDistance = distXY(this.unit.x, this.unit.y, repairTarget.x, repairTarget.y);
        this.state = "repair-tank";
        this.target = repairTarget;
        this.faceContact(repairTarget, dt);

        if (repairDistance > (weapon.range || 72) + repairTarget.radius - 6) {
          const repairMoveTarget = this.repairMoveTarget(repairTarget);
          this.moveTo(dt, repairMoveTarget);
          this.recordMovement(dt, beforeX, beforeY, repairMoveTarget);
          this.updateDebug(repairMoveTarget);
          return;
        }

        this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
        this.tryRepairTank(repairTarget);
        this.updateDebug(null);
        return;
      }

      if (tankThreat) {
        const tankDistance = distXY(this.unit.x, this.unit.y, tankThreat.x, tankThreat.y);
        const coverTarget = this.resolveCoverTarget(tankThreat);
        const canFireRpg = this.canFireRpgAtTank(tankThreat, tankDistance);
        if (canFireRpg) {
          this.state = "rpg-attack";
          this.target = tankThreat;
          this.faceContact(tankThreat, dt);
          this.tryFireRpgAtTank(tankThreat);

          if (coverTarget && tankDistance < INFANTRY_CONFIG.rpgPanicRange) {
            this.moveTo(dt, coverTarget);
            this.recordMovement(dt, beforeX, beforeY, coverTarget);
            this.updateDebug(coverTarget);
            return;
          }

          this.unit.speed = approach(this.unit.speed, 0, 220 * dt);
          this.updateDebug(null);
          return;
        }

        const canHarassTank = this.canHarassTank(tankThreat, tankDistance);
        if (canHarassTank) {
          this.state = "harass-tank";
          this.target = tankThreat;
          this.faceContact(tankThreat, dt);
          this.tryFireTank(tankThreat);

          if (coverTarget && tankDistance < 420) {
            this.moveTo(dt, coverTarget);
            this.recordMovement(dt, beforeX, beforeY, coverTarget);
            this.updateDebug(coverTarget);
            return;
          }

          this.unit.speed = approach(this.unit.speed, 0, 220 * dt);
          this.updateDebug(null);
          return;
        }

        if (coverTarget && (!contact || tankDistance < 520)) {
          this.state = "cover";
          this.target = contact || tankThreat;
          this.faceContact(this.target, dt);
          if (contact) this.tryFire(contact);
          this.moveTo(dt, coverTarget);
          this.recordMovement(dt, beforeX, beforeY, coverTarget);
          this.updateDebug(coverTarget);
          return;
        }
      }

      if (contact) {
        const weapon = this.weapon();
        const distance = distXY(this.unit.x, this.unit.y, contact.x, contact.y);
        const tooClose = distance < weapon.desiredRange * 0.62;
        const outOfRange = distance > weapon.range * 0.92;
        this.state = tooClose ? "cover" : "fire";
        this.faceContact(contact, dt);
        this.tryFire(contact);

        if (tooClose) {
          const coverTarget = this.resolveCoverTarget(contact);
          if (coverTarget) {
            this.moveTo(dt, coverTarget);
            this.recordMovement(dt, beforeX, beforeY, coverTarget);
            this.updateDebug(coverTarget);
            return;
          }
        }

        if (outOfRange) {
          const approachTarget = {
            x: contact.x,
            y: contact.y,
            stopDistance: weapon.desiredRange,
            final: false
          };
          this.moveTo(dt, approachTarget);
          this.recordMovement(dt, beforeX, beforeY, approachTarget);
          this.updateDebug(approachTarget);
          return;
        }

        this.unit.speed = approach(this.unit.speed, 0, 240 * dt);
        this.updateDebug(null);
        return;
      }

      const moveTarget = this.nextMoveTarget(order);
      this.state = distXY(this.unit.x, this.unit.y, order.point.x, order.point.y) <= order.point.radius - 18
        ? "secure"
        : "advance";

      this.moveTo(dt, moveTarget);
      this.recordMovement(dt, beforeX, beforeY, moveTarget);
      this.updateDebug(moveTarget);
    }

    selectTarget() {
      const candidates = [];

      for (const unit of this.game.infantry || []) {
        if (unit === this.unit || !unit.alive || unit.team === this.unit.team) continue;
        candidates.push(unit);
      }

      for (const crew of this.game.crews || []) {
        if (!crew.alive || crew.inTank || crew.team === this.unit.team) continue;
        candidates.push(crew);
      }

      if (!this.game.player.inTank && this.game.player.hp > 0 && this.unit.team === TEAM.RED && !this.game.isPlayerInSafeZone?.()) {
        candidates.push(this.game.player);
      }

      return candidates
        .map((target) => ({
          target,
          distance: distXY(this.unit.x, this.unit.y, target.x, target.y)
        }))
        .filter((item) => (
          item.distance <= Math.max(this.sightRange(), this.weapon().range + 80) &&
          hasLineOfSight(this.game, this.unit, item.target, { padding: 3 })
        ))
        .sort((a, b) => a.distance - b.distance)[0]?.target || null;
    }

    selectTankThreat() {
      return this.game.tanks
        .filter((tank) => tank.alive && tank.team !== this.unit.team)
        .map((tank) => ({
          tank,
          distance: distXY(this.unit.x, this.unit.y, tank.x, tank.y)
        }))
        .filter((item) => (
          item.distance <= (this.unit.classId === "scout" ? INFANTRY_CONFIG.scoutReportRange : INFANTRY_CONFIG.coverThreatRange) &&
          hasLineOfSight(this.game, this.unit, item.tank, { padding: 4 })
        ))
        .sort((a, b) => a.distance - b.distance)[0]?.tank || null;
    }

    updateScoutReports() {
      let count = 0;

      for (const tank of this.game.tanks || []) {
        if (!tank.alive || tank.team === this.unit.team) continue;
        const distance = distXY(this.unit.x, this.unit.y, tank.x, tank.y);
        if (distance > INFANTRY_CONFIG.scoutReportRange) continue;
        if (!hasLineOfSight(this.game, this.unit, tank, { padding: 4 })) continue;
        this.game.reportContact?.(this.unit.team, tank, this.unit, INFANTRY_CONFIG.scoutReportTtl);
        count += 1;
      }

      for (const unit of this.game.infantry || []) {
        if (!unit.alive || unit.team === this.unit.team) continue;
        const distance = distXY(this.unit.x, this.unit.y, unit.x, unit.y);
        if (distance > this.sightRange()) continue;
        if (!hasLineOfSight(this.game, this.unit, unit, { padding: 3 })) continue;
        this.game.reportContact?.(this.unit.team, unit, this.unit, INFANTRY_CONFIG.scoutReportTtl * 0.82);
        count += 1;
      }

      this.debug.scoutReports = count;
    }

    updateReconOrder(dt, order, contact, tankThreat, beforeX, beforeY) {
      const threat = this.closestReconThreat(contact, tankThreat);
      if (threat?.tooClose) {
        const coverTarget = this.resolveCoverTarget(threat.target);
        const evadeTarget = coverTarget || this.reconEvadeTarget(threat.target, order);
        this.state = "recon-evade";
        this.target = threat.target;
        this.faceContact(threat.target, dt);

        if (evadeTarget) {
          this.moveTo(dt, evadeTarget);
          this.recordMovement(dt, beforeX, beforeY, evadeTarget);
          this.updateDebug(evadeTarget);
          return;
        }

        this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
        this.updateDebug(null);
        return;
      }

      const egressTarget = this.reconEgressTarget(order);
      if (egressTarget) {
        this.state = "recon-egress";
        this.moveTo(dt, egressTarget);
        this.recordMovement(dt, beforeX, beforeY, egressTarget);
        this.updateDebug(egressTarget);
        return;
      }

      const weapon = this.weapon();
      if (contact) {
        const distance = distXY(this.unit.x, this.unit.y, contact.x, contact.y);
        const canSnipe = weapon.id === "sniper" &&
          distance >= Math.max(260, weapon.desiredRange * 0.44) &&
          distance <= weapon.range &&
          hasLineOfSight(this.game, this.unit, contact, { padding: 3 });

        if (canSnipe) {
          this.state = "recon-snipe";
          this.target = contact;
          this.faceContact(contact, dt);
          this.unit.speed = approach(this.unit.speed, 0, 300 * dt);
          this.tryFire(contact);
          this.updateDebug(null);
          return;
        }
      }

      const distanceToPost = distXY(this.unit.x, this.unit.y, order.point.x, order.point.y);
      if (distanceToPost <= (order.point.radius || 130)) {
        this.state = "recon-watch";
        this.unit.speed = approach(this.unit.speed, 0, 220 * dt);
        this.faceContact(contact || tankThreat, dt);
        this.updateDebug(null);
        return;
      }

      const moveTarget = this.nextMoveTarget(order);
      this.state = "recon-move";
      this.moveTo(dt, moveTarget);
      this.recordMovement(dt, beforeX, beforeY, moveTarget);
      this.updateDebug(moveTarget);
    }

    reconEgressTarget(order) {
      const point = order?.egressPoint;
      if (!point) return null;
      const insideBase = this.game.isPointInSafeZone?.(this.unit.x, this.unit.y, this.unit.team);
      if (!insideBase) return null;
      const stopDistance = point.radius || 70;
      if (distXY(this.unit.x, this.unit.y, point.x, point.y) <= stopDistance) return null;
      return {
        x: point.x,
        y: point.y,
        stopDistance,
        final: false,
        reconEgress: true
      };
    }

    closestReconThreat(contact, tankThreat) {
      const threats = [];
      if (contact) {
        threats.push({
          target: contact,
          distance: distXY(this.unit.x, this.unit.y, contact.x, contact.y),
          dangerDistance: 300
        });
      }

      if (tankThreat) {
        threats.push({
          target: tankThreat,
          distance: distXY(this.unit.x, this.unit.y, tankThreat.x, tankThreat.y),
          dangerDistance: 560
        });
      }

      return threats
        .map((item) => ({
          ...item,
          tooClose: item.distance <= item.dangerDistance
        }))
        .sort((a, b) => a.distance - b.distance)[0] || null;
    }

    reconEvadeTarget(threat, order) {
      if (!threat) return null;
      const awayAngle = angleTo(threat.x, threat.y, this.unit.x, this.unit.y);
      const postAngle = order?.point ? angleTo(threat.x, threat.y, order.point.x, order.point.y) : awayAngle;
      const angles = [
        awayAngle,
        awayAngle + 0.72,
        awayAngle - 0.72,
        postAngle,
        postAngle + 0.48,
        postAngle - 0.48
      ];
      const distances = [120, 170, 230, 290];

      for (const distance of distances) {
        for (const angle of angles) {
          const candidate = {
            x: this.unit.x + Math.cos(angle) * distance,
            y: this.unit.y + Math.sin(angle) * distance,
            stopDistance: 18,
            final: false,
            reconEvade: true
          };
          if (this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3)) return candidate;
        }
      }

      return null;
    }

    selectRepairTarget(contact, tankThreat) {
      const weapon = INFANTRY_WEAPONS.repairKit;
      const repairAmmo = this.unit.equipmentAmmo?.repairKit || 0;
      if (this.unit.classId !== "engineer" || !weapon || repairAmmo <= 0) return null;
      if (contact) return null;

      const enemyTankDistance = tankThreat
        ? distXY(this.unit.x, this.unit.y, tankThreat.x, tankThreat.y)
        : Infinity;
      if (enemyTankDistance <= INFANTRY_CONFIG.repairUnsafeEnemyRange) return null;

      return (this.game.tanks || [])
        .filter((tank) => {
          const distance = distXY(this.unit.x, this.unit.y, tank.x, tank.y);
          const closeEnoughToWork = distance <= (weapon.range || 72) + tank.radius + 12;
          const canReachDirectly = closeEnoughToWork || this.canMoveDirect(tank.x, tank.y, 36);
          return (
            tank.alive &&
            tank.team === this.unit.team &&
            tank.hp < tank.maxHp * 0.94 &&
            distance <= INFANTRY_CONFIG.repairSearchRange + tank.radius &&
            canReachDirectly &&
            this.isRepairTargetSafe(tank, tankThreat)
          );
        })
        .map((tank) => {
          const distance = distXY(this.unit.x, this.unit.y, tank.x, tank.y);
          const damageRatio = 1 - tank.hp / Math.max(1, tank.maxHp);
          const routePenalty = this.canMoveDirect(tank.x, tank.y, 36) ? 0 : 260;
          const playerBonus = tank.isPlayerTank ? -90 : 0;
          return {
            tank,
            score: distance * 0.55 - damageRatio * 420 + routePenalty + playerBonus
          };
        })
        .sort((a, b) => a.score - b.score)[0]?.tank || null;
    }

    isRepairTargetSafe(tank, tankThreat) {
      if (!tankThreat || !tankThreat.alive) return true;
      const distance = distXY(tank.x, tank.y, tankThreat.x, tankThreat.y);
      if (distance > INFANTRY_CONFIG.repairUnsafeEnemyRange + 140) return true;
      return !hasLineOfSight(this.game, tank, tankThreat, { padding: 4 });
    }

    repairMoveTarget(tank) {
      const weapon = INFANTRY_WEAPONS.repairKit;
      const preferredAngles = [
        tank.angle + Math.PI,
        tank.angle + Math.PI / 2,
        tank.angle - Math.PI / 2,
        angleTo(tank.x, tank.y, this.unit.x, this.unit.y),
        tank.angle
      ];
      const distances = [tank.radius + 54, tank.radius + 74, tank.radius + 96];
      let best = null;
      let bestScore = Infinity;

      for (const distance of distances) {
        for (const angle of preferredAngles) {
          const candidate = {
            x: tank.x + Math.cos(angle) * distance,
            y: tank.y + Math.sin(angle) * distance,
            stopDistance: 13,
            final: false,
            repair: true
          };
          if (!this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3)) continue;

          const routePenalty = this.canMoveDirect(candidate.x, candidate.y, 26) ? 0 : 150;
          const rearBias = Math.abs(normalizeAngle(angle - (tank.angle + Math.PI))) * 12;
          const score = distXY(this.unit.x, this.unit.y, candidate.x, candidate.y) + routePenalty + rearBias;
          if (score < bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
      }

      return best || {
        x: tank.x,
        y: tank.y,
        stopDistance: (weapon.range || 72) + tank.radius - 10,
        final: false,
        repair: true
      };
    }

    tryRepairTank(tank) {
      const weapon = INFANTRY_WEAPONS.repairKit;
      if (!weapon || !tank || !tank.alive || tank.hp >= tank.maxHp) return false;
      if (this.fireCooldown > 0) return false;
      if ((this.unit.equipmentAmmo?.repairKit || 0) <= 0) return false;
      if (distXY(this.unit.x, this.unit.y, tank.x, tank.y) > (weapon.range || 72) + tank.radius) return false;

      this.unit.equipmentAmmo.repairKit = Math.max(0, (this.unit.equipmentAmmo.repairKit || 0) - 1);
      tank.hp = Math.min(tank.maxHp, tank.hp + (weapon.repairAmount || 28));
      this.fireCooldown = (weapon.cooldown || 1.1) + 0.32 + Math.random() * 0.22;

      this.game.effects.explosions.push({
        x: tank.x,
        y: tank.y,
        radius: 8,
        maxRadius: 48,
        life: 0.34,
        maxLife: 0.34,
        color: "rgba(120, 214, 140, 0.68)"
      });
      return true;
    }

    faceContact(target) {
      if (!target) return;
      this.unit.angle = angleTo(this.unit.x, this.unit.y, target.x, target.y);
      this.moveHeading = this.unit.angle;
    }

    tryFire(target) {
      if (this.fireCooldown > 0 || !target) return false;
      const weapon = this.weapon();
      if (distXY(this.unit.x, this.unit.y, target.x, target.y) > weapon.range) return false;
      if (this.unit.suppressed && this.unit.suppression > 72 && Math.random() < 0.48) {
        this.fireCooldown = Math.min(weapon.cooldown, 0.22 + Math.random() * 0.24);
        return false;
      }

      const suppressionPenalty = clamp(this.unit.suppression / 165, 0, 0.36);
      const reconSnipeBonus = this.state === "recon-snipe" || this.state === "recon-watch" ? 0.12 : 0;
      const fired = IronLine.combat.fireRifle(this.game, this.unit, target, {
        weapon,
        range: weapon.range,
        damage: weapon.damageMin + Math.random() * (weapon.damageMax - weapon.damageMin),
        accuracyBonus: weapon.accuracyBonus + (this.state === "secure" ? 0.06 : 0) + reconSnipeBonus - suppressionPenalty
      });
      if (fired) this.fireCooldown = weapon.cooldown + suppressionPenalty * 0.7 + Math.random() * weapon.cooldown * 0.45;
      return fired;
    }

    canHarassTank(tank, distance) {
      if (!tank || distance > Math.min(this.weapon().range, INFANTRY_CONFIG.tankHarassRange)) return false;
      if (distance < 210 || this.unit.suppression > 68) return false;
      if (!hasLineOfSight(this.game, this.unit, tank, { padding: 3 })) return false;
      return this.friendlyInfantryNearTank(tank, 230) >= INFANTRY_CONFIG.tankHarassMinGroup;
    }

    friendlyInfantryNearTank(tank, radius) {
      let count = 0;
      for (const unit of this.game.infantry || []) {
        if (!unit.alive || unit.team !== this.unit.team) continue;
        if (distXY(unit.x, unit.y, tank.x, tank.y) <= radius) count += 1;
      }
      return count;
    }

    tryFireTank(tank) {
      if (this.fireCooldown > 0 || !tank) return false;
      const weapon = this.weapon();
      const suppressionPenalty = clamp(this.unit.suppression / 180, 0, 0.32);
      const fired = IronLine.combat.fireRifleAtTank(this.game, this.unit, tank, {
        weapon,
        range: weapon.range,
        accuracyBonus: -0.02 - suppressionPenalty
      });
      if (fired) this.fireCooldown = weapon.cooldown + suppressionPenalty * 0.5 + Math.random() * weapon.cooldown * 0.38;
      return fired;
    }

    canFireRpgAtTank(tank, distance) {
      const weapon = INFANTRY_WEAPONS.rpg;
      if (!weapon || !tank || !tank.alive) return false;
      const rpgAmmo = this.unit.equipmentAmmo?.rpg || 0;
      if (this.unit.classId !== "engineer") return false;
      if (rpgAmmo <= 0) return false;
      if (distance < Math.max(INFANTRY_CONFIG.rpgMinRange, weapon.minRange || 0) || distance > weapon.range) return false;
      if (distance < INFANTRY_CONFIG.rpgPanicRange && this.friendlyInfantryNearTank(tank, 260) < 2) return false;
      if (this.unit.suppression > 72) return false;
      if (!hasLineOfSight(this.game, this.unit, tank, { padding: 4 })) return false;
      return this.hasSafeRpgImpact(tank, weapon);
    }

    hasSafeRpgImpact(tank, weapon) {
      const dangerRadius = (weapon.splash || 92) + 22;

      for (const unit of this.game.infantry || []) {
        if (!unit.alive || unit.team !== this.unit.team || unit === this.unit) continue;
        if (distXY(unit.x, unit.y, tank.x, tank.y) <= dangerRadius) return false;
      }

      for (const crew of this.game.crews || []) {
        if (!crew.alive || crew.inTank || crew.team !== this.unit.team) continue;
        if (distXY(crew.x, crew.y, tank.x, tank.y) <= dangerRadius) return false;
      }

      if (!this.game.player.inTank && this.game.player.hp > 0 && this.unit.team === TEAM.BLUE) {
        if (distXY(this.game.player.x, this.game.player.y, tank.x, tank.y) <= dangerRadius) return false;
      }

      return true;
    }

    tryFireRpgAtTank(tank) {
      if (this.fireCooldown > 0 || !tank) return false;
      const weapon = INFANTRY_WEAPONS.rpg;
      const distance = distXY(this.unit.x, this.unit.y, tank.x, tank.y);
      if (!this.canFireRpgAtTank(tank, distance)) return false;

      const aimStability = clamp(1 - this.unit.suppression / 140, 0.45, 0.92);
      const fired = IronLine.combat.fireRpg(this.game, this.unit, tank.x, tank.y, { weapon, aimStability });
      if (!fired) return false;

      this.unit.equipmentAmmo.rpg = Math.max(0, (this.unit.equipmentAmmo.rpg || 0) - 1);
      this.unit.suppress(10, tank);
      this.fireCooldown = weapon.cooldown + 0.7 + Math.random() * 0.55;
      return true;
    }

    resolveCoverTarget(threat) {
      if (this.coverTarget && this.coverTimer > 0 && this.pointPassable(this.coverTarget.x, this.coverTarget.y, this.unit.radius + 3)) {
        if (this.game.coverSlots?.renew(this.unit, this.coverTarget, 1.4) || !this.game.coverSlots) {
          return this.coverTarget;
        }
        if (this.game.coverSlots?.isAvailable(this.unit, this.coverTarget)) {
          this.coverTarget = this.game.coverSlots.reserve(this.unit, this.coverTarget, 1.4) || this.coverTarget;
          return this.coverTarget;
        }
        this.coverTarget = null;
      }

      this.coverTarget = this.findCoverPoint(threat);
      this.coverTimer = INFANTRY_CONFIG.coverDuration;
      return this.coverTarget;
    }

    findCoverPoint(threat) {
      let best = null;
      let bestQuality = -Infinity;

      for (const obstacle of this.game.world.obstacles) {
        const samples = this.coverSamplesForObstacle(obstacle, threat);
        for (const point of samples) {
          if (!this.pointPassable(point.x, point.y, this.unit.radius + 3)) continue;
          if (this.game.coverSlots && !this.game.coverSlots.isAvailable(this.unit, point)) continue;
          if (hasLineOfSight(this.game, threat, point, { padding: 3, ignoreSmoke: true })) continue;

          const selfDistance = distXY(this.unit.x, this.unit.y, point.x, point.y);
          const maxMove = this.coverSearchRadius();
          if (selfDistance > maxMove) continue;

          const quality = this.evaluateCoverPoint(point, obstacle, threat, selfDistance);
          if (quality.total > bestQuality) {
            best = {
              ...point,
              stopDistance: 14,
              final: false,
              cover: true,
              coverQuality: quality.total,
              coverMetrics: quality.metrics
            };
            bestQuality = quality.total;
          }
        }
      }

      return best && this.game.coverSlots
        ? this.game.coverSlots.reserve(this.unit, best, 1.4) || best
        : best;
    }

    coverSearchRadius() {
      const role = this.order?.squadRole || this.unit.squadRole || "assault";
      if (role === "scout") return 520;
      if (role === "support") return 440;
      if (role === "security") return 400;
      return 360;
    }

    evaluateCoverPoint(point, obstacle, threat, selfDistance) {
      const role = this.order?.squadRole || this.unit.squadRole || "assault";
      const threatDistance = distXY(point.x, point.y, threat.x, threat.y);
      const primaryBlock = lineIntersectsRect(
        threat.x,
        threat.y,
        point.x,
        point.y,
        expandedRect(obstacle, 4)
      );

      const metrics = {
        block: primaryBlock ? 1 : 0.72,
        fire: this.coverFireScore(point, threat),
        objective: this.coverObjectiveScore(point, role),
        move: 1 - clamp(selfDistance / this.coverSearchRadius(), 0, 1),
        safety: clamp((threatDistance - 90) / 520, 0, 1)
      };

      const weights = this.coverWeights(role);
      return {
        total: (
          metrics.block * weights.block +
          metrics.fire * weights.fire +
          metrics.objective * weights.objective +
          metrics.move * weights.move +
          metrics.safety * weights.safety
        ) * 100,
        metrics
      };
    }

    coverWeights(role) {
      if (role === "scout") {
        return { block: 0.24, fire: 0.32, objective: 0.16, move: 0.08, safety: 0.2 };
      }
      if (role === "support") {
        return { block: 0.3, fire: 0.3, objective: 0.16, move: 0.12, safety: 0.12 };
      }
      if (role === "security") {
        return { block: 0.32, fire: 0.24, objective: 0.2, move: 0.13, safety: 0.11 };
      }
      return { block: 0.34, fire: 0.16, objective: 0.28, move: 0.15, safety: 0.07 };
    }

    coverObjectiveScore(point, role) {
      if (!this.order?.point) return 0.5;

      const distance = distXY(point.x, point.y, this.order.point.x, this.order.point.y);
      const preferred = role === "support"
        ? this.order.point.radius + 145
        : role === "scout"
          ? this.order.point.radius + 205
          : role === "security"
            ? this.order.point.radius + 95
            : this.order.point.radius + 45;
      const falloff = role === "support" || role === "scout" ? 300 : 230;
      const distanceScore = 1 - clamp(Math.max(0, distance - preferred) / falloff, 0, 1);
      const sightScore = hasLineOfSight(this.game, point, this.order.point, { padding: 2, ignoreSmoke: true }) ? 0.18 : 0;
      return clamp(distanceScore + sightScore, 0, 1);
    }

    coverFireScore(point, threat) {
      if (!threat) return 0;

      const directAngle = angleTo(point.x, point.y, threat.x, threat.y);
      const sideAngle = directAngle + Math.PI / 2;
      const peekOptions = [
        { side: -1, forward: 10 },
        { side: 1, forward: 10 },
        { side: -1, forward: -8 },
        { side: 1, forward: -8 }
      ];

      let best = 0;
      for (const option of peekOptions) {
        const peek = {
          x: point.x + Math.cos(sideAngle) * option.side * 28 + Math.cos(directAngle) * option.forward,
          y: point.y + Math.sin(sideAngle) * option.side * 28 + Math.sin(directAngle) * option.forward
        };
        if (!this.pointPassable(peek.x, peek.y, this.unit.radius + 2)) continue;

        const canSeeThreat = hasLineOfSight(this.game, peek, threat, { padding: 2, ignoreSmoke: true });
        const canSeeObjective = this.order?.point
          ? hasLineOfSight(this.game, peek, this.order.point, { padding: 2, ignoreSmoke: true })
          : false;
        const value = (canSeeThreat ? 0.78 : 0) + (canSeeObjective ? 0.22 : 0);
        best = Math.max(best, value);
      }

      return clamp(best, 0, 1);
    }

    coverSamplesForObstacle(obstacle, threat) {
      const offset = 34;
      const points = [
        { x: obstacle.x - offset, y: obstacle.y + obstacle.h * 0.25 },
        { x: obstacle.x - offset, y: obstacle.y + obstacle.h * 0.75 },
        { x: obstacle.x + obstacle.w + offset, y: obstacle.y + obstacle.h * 0.25 },
        { x: obstacle.x + obstacle.w + offset, y: obstacle.y + obstacle.h * 0.75 },
        { x: obstacle.x + obstacle.w * 0.25, y: obstacle.y - offset },
        { x: obstacle.x + obstacle.w * 0.75, y: obstacle.y - offset },
        { x: obstacle.x + obstacle.w * 0.25, y: obstacle.y + obstacle.h + offset },
        { x: obstacle.x + obstacle.w * 0.75, y: obstacle.y + obstacle.h + offset }
      ];

      return points.sort((a, b) => (
        distXY(a.x, a.y, threat.x, threat.y) - distXY(b.x, b.y, threat.x, threat.y)
      ));
    }

    resolveOrder() {
      const commander = this.game.commanders?.[this.unit.team];
      const ordered = commander?.getInfantryOrderFor(this.unit);
      if (ordered) return ordered;

      const point = this.chooseFallbackPoint();
      if (!point) return null;
      return {
        id: `${this.unit.team}:infantry-fallback:${point.name}`,
        team: this.unit.team,
        point,
        objectiveName: point.name,
        role: "infantry",
        stance: "advance",
        slotIndex: 0,
        slotCount: 1
      };
    }

    chooseFallbackPoint() {
      const enemyOwner = this.unit.team === TEAM.BLUE ? TEAM.RED : TEAM.BLUE;
      const candidates = this.game.capturePoints
        .filter((point) => point.owner !== this.unit.team)
        .map((point) => {
          let score = distXY(this.unit.x, this.unit.y, point.x, point.y);
          if (point.owner === enemyOwner) score -= 240;
          if (point.contested) score -= 160;
          return { point, score };
        })
        .sort((a, b) => a.score - b.score);
      return candidates[0]?.point || this.game.capturePoints[0] || null;
    }

    nextMoveTarget(order) {
      if (this.orderId !== order.id) {
        this.orderId = order.id;
        this.path = [];
        this.pathIndex = 0;
        this.repathTimer = 0;
      }

      const finalTarget = this.formationTarget(order);
      if (this.canMoveDirect(finalTarget.x, finalTarget.y, 24)) {
        this.path = [];
        this.pathIndex = 0;
        return finalTarget;
      }

      if (this.path.length === 0 || this.repathTimer <= 0) this.rebuildPath(order);

      while (
        this.pathIndex < this.path.length &&
        distXY(this.unit.x, this.unit.y, this.path[this.pathIndex].x, this.path[this.pathIndex].y) < 66
      ) {
        this.pathIndex += 1;
      }

      if (this.pathIndex >= this.path.length) return finalTarget;
      const node = this.path[this.pathIndex];
      return { x: node.x, y: node.y, stopDistance: 42, final: false };
    }

    formationTarget(order) {
      const formation = order.formation;
      const count = Math.max(1, formation ? order.roleSlotCount || 1 : order.slotCount || 1);
      const slot = clamp(formation ? order.roleSlotIndex || 0 : order.slotIndex || 0, 0, count - 1);
      let target = null;

      if (formation) {
        const sideIndex = slot - (count - 1) / 2 + (formation.sideBias || 0) * 0.35;
        const forwardX = Math.cos(formation.angle);
        const forwardY = Math.sin(formation.angle);
        const sideX = Math.cos(formation.angle + Math.PI / 2);
        const sideY = Math.sin(formation.angle + Math.PI / 2);
        const sideOffset = sideIndex * (formation.spacing || 36);
        target = {
          x: order.point.x + forwardX * formation.distance + sideX * sideOffset,
          y: order.point.y + forwardY * formation.distance + sideY * sideOffset,
          stopDistance: formation.stopDistance || 24,
          final: true
        };
      } else {
        const angle = this.seed * 0.37 + slot * Math.PI * 2 / count;
        const radius = 46 + slot % 3 * 18;
        target = {
          x: order.point.x + Math.cos(angle) * radius,
          y: order.point.y + Math.sin(angle) * radius,
          stopDistance: 24,
          final: true
        };
      }

      if (formation?.allowOutside && this.pointPassable(target.x, target.y, this.unit.radius + 3)) {
        return target;
      }

      return this.safeFormationTarget(order, target);
    }

    safeFormationTarget(order, target) {
      const allowOutside = Boolean(order.formation?.allowOutside);
      if (this.pointPassable(target.x, target.y, this.unit.radius + 3)) return target;

      const baseAngle = this.seed * 0.51;
      const radii = allowOutside ? [96, 132, 168, 204] : [72, 96, 118, 132];
      for (const radius of radii) {
        for (let step = 0; step < 14; step += 1) {
          const angle = baseAngle + step * Math.PI * 2 / 14;
          const candidate = {
            x: order.point.x + Math.cos(angle) * radius,
            y: order.point.y + Math.sin(angle) * radius,
            stopDistance: target.stopDistance || 24,
            final: true
          };
          if (!allowOutside && distXY(candidate.x, candidate.y, order.point.x, order.point.y) > order.point.radius - 4) continue;
          if (this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3)) return candidate;
        }
      }

      return target;
    }

    rebuildPath(order) {
      if (!this.game.navGraph) return;
      const rawPath = this.game.navGraph.findPathBetween(this.unit, order.point, { padding: 24 });
      this.path = rawPath.filter((node) => distXY(this.unit.x, this.unit.y, node.x, node.y) > 52);
      this.pathIndex = 0;
      this.repathTimer = 2.8 + Math.random() * 0.9;
    }

    moveTo(dt, target) {
      const dx = target.x - this.unit.x;
      const dy = target.y - this.unit.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= (target.stopDistance || 20) + (target.final ? 8 : 2)) {
        this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
        return;
      }

      const desiredAngle = angleTo(this.unit.x, this.unit.y, target.x, target.y);
      const steer = this.avoidanceVector(Math.cos(desiredAngle), Math.sin(desiredAngle));
      const steerAngle = Math.atan2(steer.y, steer.x);
      this.moveHeading = rotateTowards(this.moveHeading, steerAngle, 5.2 * dt);
      this.unit.angle = this.moveHeading;
      const moraleSpeed = clamp(this.unit.morale + 0.22, 0.58, 1);
      const weaponSpeed = this.weapon().moveSpeedMultiplier || 1;
      const targetSpeed = this.unit.maxSpeed * clamp(distance / 180, 0.45, 1) * moraleSpeed * weaponSpeed;
      this.unit.speed = approach(this.unit.speed, targetSpeed, 320 * dt);
      tryMoveCircle(
        this.game,
        this.unit,
        Math.cos(this.unit.angle) * this.unit.speed,
        Math.sin(this.unit.angle) * this.unit.speed,
        this.unit.radius,
        dt,
        { blockTanks: true, padding: 5 }
      );
    }

    avoidanceVector(vx, vy) {
      let ax = vx;
      let ay = vy;

      for (const obstacle of this.game.world.obstacles) {
        const expanded = expandedRect(obstacle, 28);
        const lookX = this.unit.x + vx * 52;
        const lookY = this.unit.y + vy * 52;
        if (!lineIntersectsRect(this.unit.x, this.unit.y, lookX, lookY, expanded)) continue;

        const nearestX = clamp(this.unit.x, obstacle.x, obstacle.x + obstacle.w);
        const nearestY = clamp(this.unit.y, obstacle.y, obstacle.y + obstacle.h);
        const awayX = this.unit.x - nearestX;
        const awayY = this.unit.y - nearestY;
        const distance = Math.max(1, Math.hypot(awayX, awayY));
        ax += (awayX / distance) * 0.75;
        ay += (awayY / distance) * 0.75;
      }

      for (const other of this.game.infantry || []) {
        if (other === this.unit || !other.alive) continue;
        const distance = distXY(this.unit.x, this.unit.y, other.x, other.y);
        if (distance > 32 || distance < 1) continue;
        ax += ((this.unit.x - other.x) / distance) * (32 - distance) / 22;
        ay += ((this.unit.y - other.y) / distance) * (32 - distance) / 22;
      }

      for (const tank of this.game.tanks || []) {
        if (!tank.alive) continue;
        const distance = distXY(this.unit.x, this.unit.y, tank.x, tank.y);
        if (distance > 86 || distance < 1) continue;
        ax += ((this.unit.x - tank.x) / distance) * (86 - distance) / 34;
        ay += ((this.unit.y - tank.y) / distance) * (86 - distance) / 34;
      }

      const laneAvoidance = this.friendlyTankFireLaneAvoidance();
      ax += laneAvoidance.x;
      ay += laneAvoidance.y;

      const length = Math.max(0.001, Math.hypot(ax, ay));
      return { x: ax / length, y: ay / length };
    }

    friendlyTankFireLaneAvoidance() {
      const danger = this.friendlyTankFireLaneDanger();
      if (!danger) return { x: 0, y: 0 };
      return {
        x: danger.awayX * danger.force,
        y: danger.awayY * danger.force
      };
    }

    findFriendlyTankFireLaneEscape() {
      const danger = this.friendlyTankFireLaneDanger();
      if (!danger || danger.force < 0.24) return null;

      const distances = [82, 118, 154];
      const sideAngles = [
        Math.atan2(danger.awayY, danger.awayX),
        danger.laneAngle + Math.PI / 2,
        danger.laneAngle - Math.PI / 2
      ];

      for (const distance of distances) {
        for (const angle of sideAngles) {
          const candidate = {
            x: this.unit.x + Math.cos(angle) * distance,
            y: this.unit.y + Math.sin(angle) * distance,
            stopDistance: 12,
            final: false,
            fireLaneEscape: true
          };
          if (this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3)) return candidate;
        }
      }

      return null;
    }

    friendlyTankFireLaneDanger() {
      let best = null;

      for (const tank of this.game.tanks || []) {
        if (!tank.alive || tank.team !== this.unit.team) continue;
        if (!tank.isOperational?.() && !tank.playerControlled) continue;

        const ammoId = tank.loadedAmmo || tank.reload?.ammoId || "ap";
        const ammo = AMMO[ammoId] || AMMO.ap;
        const muzzleDistance = tank.radius + 30;
        const startX = tank.x + Math.cos(tank.turretAngle) * muzzleDistance;
        const startY = tank.y + Math.sin(tank.turretAngle) * muzzleDistance;
        const laneLength = Math.min(ammo.range || 1200, 1350);
        const endX = startX + Math.cos(tank.turretAngle) * laneLength;
        const endY = startY + Math.sin(tank.turretAngle) * laneLength;
        const laneDx = endX - startX;
        const laneDy = endY - startY;
        const laneLenSq = Math.max(1, laneDx * laneDx + laneDy * laneDy);
        const t = ((this.unit.x - startX) * laneDx + (this.unit.y - startY) * laneDy) / laneLenSq;
        if (t < 0 || t > 1) continue;

        const laneDistance = segmentDistanceToPoint(startX, startY, endX, endY, this.unit.x, this.unit.y);
        const laneWidth = (ammo.id === "he" ? 58 : 38) + this.unit.radius;
        if (laneDistance > laneWidth) continue;

        const closestX = startX + laneDx * t;
        const closestY = startY + laneDy * t;
        let awayX = this.unit.x - closestX;
        let awayY = this.unit.y - closestY;
        const awayLength = Math.hypot(awayX, awayY);
        if (awayLength < 0.001) {
          awayX = Math.cos(tank.turretAngle + Math.PI / 2);
          awayY = Math.sin(tank.turretAngle + Math.PI / 2);
        } else {
          awayX /= awayLength;
          awayY /= awayLength;
        }

        const fireReady = tank.canFire?.() ? 1 : 0.58;
        const force = clamp((laneWidth - laneDistance) / laneWidth, 0, 1) * fireReady;
        if (!best || force > best.force) {
          best = {
            tank,
            force,
            awayX,
            awayY,
            laneAngle: tank.turretAngle
          };
        }
      }

      return best;
    }

    canMoveDirect(x, y, padding = 24) {
      return !this.game.world.obstacles.some((obstacle) => (
        lineIntersectsRect(this.unit.x, this.unit.y, x, y, expandedRect(obstacle, padding))
      ));
    }

    pointPassable(x, y, radius) {
      if (x < radius || y < radius || x > this.game.world.width - radius || y > this.game.world.height - radius) {
        return false;
      }
      return !this.game.world.obstacles.some((obstacle) => circleRectCollision(x, y, radius, obstacle)) &&
        !circleIntersectsTank(this.game, this.unit, x, y, radius, { padding: 5 });
    }

    recordMovement(dt, beforeX, beforeY, target) {
      const moved = distXY(beforeX, beforeY, this.unit.x, this.unit.y);
      const trying = target && distXY(this.unit.x, this.unit.y, target.x, target.y) > (target.stopDistance || 20) + 8;
      if (trying && moved < 5 * dt) this.stuckTimer += dt;
      else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 1.8);

      if (this.stuckTimer > 0.9) {
        this.path = [];
        this.pathIndex = 0;
        this.repathTimer = 0;
        this.stuckTimer = 0;
      }
    }

    updateDebug(moveTarget) {
      this.debug.state = this.state;
      this.debug.goal = this.order?.objectiveName || "";
      this.debug.target = this.target;
      this.debug.coverTarget = this.coverTarget;
      this.debug.moveTarget = moveTarget;
      this.debug.weaponId = this.unit.weaponId;
      this.debug.classId = this.unit.classId;
      this.debug.rpgAmmo = this.unit.equipmentAmmo?.rpg || 0;
      this.debug.repairAmmo = this.unit.equipmentAmmo?.repairKit || 0;
      this.debug.squadId = this.order?.squadId || this.unit.squadId || "";
      this.debug.squadRole = this.order?.squadRole || this.unit.squadRole || "";
      if (this.unit.classId !== "scout") this.debug.scoutReports = 0;
      this.debug.coverQuality = this.coverTarget?.coverQuality || 0;
      this.debug.suppression = this.unit.suppression;
      this.debug.morale = this.unit.morale;
      this.debug.path = this.path;
      this.debug.pathIndex = this.pathIndex;
      this.debug.stuckTimer = this.stuckTimer;
    }
  }

  IronLine.InfantryAI = InfantryAI;
})(window);
