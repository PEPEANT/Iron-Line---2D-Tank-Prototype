"use strict";

(function registerCombatController(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, AMMO, AI_CONFIG } = IronLine.constants;
  const { clamp, distXY, angleTo, normalizeAngle, rotateTowards, segmentDistanceToPoint } = IronLine.math;
  const { hasLineOfSight, hasClearShot } = IronLine.physics;

  class CombatController {
    constructor(tank, game) {
      this.tank = tank;
      this.game = game;
      this.target = null;
      this.lostContactTimer = 0;
      this.smokeCooldown = 0;
      this.lastDecision = this.captureDecision();
    }

    update(dt, order) {
      this.smokeCooldown = Math.max(0, this.smokeCooldown - dt);
      const contact = this.selectContact(order);

      if (!contact) {
        this.target = null;
        this.lostContactTimer = 0;
        this.lastDecision = this.captureDecision();
        return this.lastDecision;
      }

      this.target = contact.enemy;
      const target = this.target;
      const distance = distXY(this.tank.x, this.tank.y, target.x, target.y);
      const visible = this.canSeeOrUseReport(target);

      if (visible) this.lostContactTimer = 0;
      else this.lostContactTimer += dt;

      if (!visible && this.lostContactTimer > AI_CONFIG.lostContactGrace) {
        this.target = null;
        this.lastDecision = this.captureDecision();
        return this.lastDecision;
      }

      this.aimAt(target, dt);
      this.prepareWeapon(target);
      this.tryDeployDefensiveSmoke(target);

      const ammoId = this.tank.loadedAmmo || this.tank.reload.ammoId || this.chooseAmmo(target) || "ap";
      const shotClear = this.tank.loadedAmmo ? hasClearShot(this.game, this.tank, target, this.tank.loadedAmmo) : false;
      const ammoSafe = this.tank.loadedAmmo ? this.isAmmoSafeForTarget(target, this.tank.loadedAmmo) : true;
      const lineSafe = this.tank.loadedAmmo ? this.isFireLaneSafe(target, this.tank.loadedAmmo) : true;
      const shotSafe = ammoSafe && lineSafe;
      const desiredRange = AI_CONFIG.desiredRange[ammoId] || AI_CONFIG.desiredRange.fallback;
      const mode = this.tank.hp < this.tank.maxHp * AI_CONFIG.retreatHealthRatio ? "retreat" : "engage";

      if (visible && shotClear && shotSafe && this.tank.canFire()) {
        const targetAngle = angleTo(this.tank.x, this.tank.y, target.x, target.y);
        const aimDiff = Math.abs(normalizeAngle(this.tank.turretAngle - targetAngle));
        if (aimDiff < 0.075) this.tank.fire(this.game, { target });
      }

      this.lastDecision = {
        mode,
        target,
        distance,
        visible,
        shotClear: shotClear && shotSafe,
        blockedShot: visible && !shotClear && distance < AI_CONFIG.blockedShotRepositionRange,
        unsafeShot: visible && shotClear && !shotSafe,
        unsafeLine: visible && shotClear && !lineSafe,
        desiredRange
      };
      return this.lastDecision;
    }

    selectContact(order) {
      if (this.target && this.isAliveEnemy(this.target)) {
        const distance = distXY(this.tank.x, this.tank.y, this.target.x, this.target.y);
        const visible = distance <= this.contactRange(this.target) &&
          this.canSeeOrUseReport(this.target);
        if (visible && this.shouldEngage(this.target, distance, order)) {
          return { enemy: this.target, distance };
        }
      }

      const contacts = this.visibleContacts(order);
      return contacts[0] || null;
    }

    visibleContacts(order) {
      const contacts = this.enemyCandidates()
        .map((enemy) => ({
          enemy,
          distance: distXY(this.tank.x, this.tank.y, enemy.x, enemy.y)
        }))
        .filter((contact) => (
          contact.distance <= this.contactRange(contact.enemy) &&
          this.canSeeOrUseReport(contact.enemy) &&
          this.shouldEngage(contact.enemy, contact.distance, order)
        ));

      contacts.sort((a, b) => this.contactScore(a, order) - this.contactScore(b, order));
      return contacts;
    }

    enemyCandidates() {
      const enemies = this.game.tanks.filter((other) => (
        other.alive &&
        other.team !== this.tank.team
      ));

      for (const unit of this.game.infantry || []) {
        if (!unit.alive || unit.team === this.tank.team) continue;
        enemies.push(unit);
      }

      for (const crew of this.game.crews || []) {
        if (!crew.alive || crew.inTank || crew.team === this.tank.team) continue;
        enemies.push(crew);
      }

      if (!this.game.player.inTank && this.game.player.hp > 0 && this.tank.team === TEAM.RED && !this.game.isPlayerInSafeZone?.()) {
        enemies.push(this.game.player);
      }

      return enemies;
    }

    shouldEngage(enemy, distance, order) {
      if (!order?.point) return distance < AI_CONFIG.sightRange * 0.72;

      const distanceFromOrder = distXY(this.tank.x, this.tank.y, order.point.x, order.point.y);
      const enemyNearOrder = distXY(enemy.x, enemy.y, order.point.x, order.point.y) <= order.threatRadius;
      const selfNearOrder = distanceFromOrder <= order.leashRadius;
      const directThreat = distance <= AI_CONFIG.immediateThreatRange;
      const clearOpportunity = distance <= AI_CONFIG.lineOfFireRange &&
        hasClearShot(this.game, this.tank, enemy, this.tank.loadedAmmo || "ap", { padding: 7 });
      const tooFarFromOrder = distanceFromOrder > order.leashRadius + AI_CONFIG.maxPursuitFromOrder;

      if (tooFarFromOrder && !enemyNearOrder && !directThreat) return false;
      return directThreat || enemyNearOrder || (selfNearOrder && clearOpportunity);
    }

    contactScore(contact, order) {
      let score = contact.distance;
      if (contact.enemy === this.target) score -= 240;
      if (this.isReportedEnemy(contact.enemy)) score -= 90;
      if (order?.point && distXY(contact.enemy.x, contact.enemy.y, order.point.x, order.point.y) <= order.threatRadius) {
        score -= 520;
      }
      if (contact.enemy.isPlayerTank) score -= 120;
      if (this.isInfantryTarget(contact.enemy)) {
        score -= this.infantryClusterCount(contact.enemy, 150) >= 3 ? 180 : 40;
      }
      return score;
    }

    contactRange(target) {
      if (this.isReportedEnemy(target)) return Math.max(AI_CONFIG.sightRange, AI_CONFIG.lineOfFireRange + 260);
      return AI_CONFIG.sightRange;
    }

    canSeeOrUseReport(target) {
      if (!target) return false;
      if (hasLineOfSight(this.game, this.tank, target, { padding: 2 })) return true;
      if (!this.isReportedEnemy(target)) return false;

      const distance = distXY(this.tank.x, this.tank.y, target.x, target.y);
      return distance <= AI_CONFIG.lineOfFireRange + 260;
    }

    isReportedEnemy(target) {
      return this.game.isReportedEnemy?.(this.tank.team, target) || false;
    }

    prepareWeapon(target) {
      const ammoId = this.chooseAmmo(target);
      if (!ammoId) return;
      if (this.tank.loadedAmmo === ammoId || this.tank.reload.ammoId === ammoId && this.tank.reload.active) return;
      if (this.tank.reload.active && this.tank.reload.progress > this.tank.reload.duration * 0.55) return;
      if (ammoId) this.tank.beginLoad(ammoId);
    }

    chooseAmmo(target) {
      if (this.isInfantryTarget(target)) {
        if (this.tank.ammo.he > 0 && this.isAmmoSafeForTarget(target, "he")) return "he";
        if (this.tank.ammo.ap > 0) return "ap";
        return null;
      }

      if (this.infantryClusterCount(target, 170) >= 4 && this.tank.ammo.he > 0 && this.isAmmoSafeForTarget(target, "he")) return "he";
      if (this.tank.ammo.ap > 0) return "ap";
      if (this.tank.ammo.he > 0 && this.isAmmoSafeForTarget(target, "he")) return "he";
      return null;
    }

    isAmmoSafeForTarget(target, ammoId) {
      const ammo = AMMO[ammoId];
      if (!ammo?.splash || !target) return true;

      const dangerRadius = ammo.splash + 42;
      for (const unit of this.game.infantry || []) {
        if (!unit.alive || unit.team !== this.tank.team) continue;
        if (distXY(unit.x, unit.y, target.x, target.y) <= dangerRadius + unit.radius) return false;
      }

      for (const crew of this.game.crews || []) {
        if (!crew.alive || crew.inTank || crew.team !== this.tank.team) continue;
        if (distXY(crew.x, crew.y, target.x, target.y) <= dangerRadius + crew.radius) return false;
      }

      if (!this.game.player.inTank && this.game.player.hp > 0 && this.tank.team === TEAM.BLUE) {
        if (distXY(this.game.player.x, this.game.player.y, target.x, target.y) <= dangerRadius + this.game.player.radius) return false;
      }

      return true;
    }

    isFireLaneSafe(target, ammoId) {
      if (!target) return true;
      const ammo = AMMO[ammoId] || AMMO.ap;
      const muzzleDistance = this.tank.radius + 28;
      const startX = this.tank.x + Math.cos(this.tank.turretAngle) * muzzleDistance;
      const startY = this.tank.y + Math.sin(this.tank.turretAngle) * muzzleDistance;
      const endX = target.x;
      const endY = target.y;
      const laneWidth = (ammo.id === "he" ? 34 : 24) + (ammo.shellRadius || 4);

      for (const unit of this.game.infantry || []) {
        if (!unit.alive || unit.team !== this.tank.team) continue;
        if (segmentDistanceToPoint(startX, startY, endX, endY, unit.x, unit.y) <= laneWidth + unit.radius) return false;
      }

      for (const crew of this.game.crews || []) {
        if (!crew.alive || crew.inTank || crew.team !== this.tank.team) continue;
        if (segmentDistanceToPoint(startX, startY, endX, endY, crew.x, crew.y) <= laneWidth + crew.radius) return false;
      }

      if (!this.game.player.inTank && this.game.player.hp > 0 && this.tank.team === TEAM.BLUE) {
        if (segmentDistanceToPoint(startX, startY, endX, endY, this.game.player.x, this.game.player.y) <= laneWidth + this.game.player.radius) {
          return false;
        }
      }

      return true;
    }

    isInfantryTarget(target) {
      if (!target) return false;
      if (target.isPlayerTank) return false;
      return target.radius <= 14 && !target.ammo;
    }

    infantryClusterCount(target, radius) {
      if (!target) return 0;
      let count = this.isInfantryTarget(target) ? 1 : 0;

      for (const unit of this.game.infantry || []) {
        if (!unit.alive || unit.team === this.tank.team || unit === target) continue;
        if (distXY(unit.x, unit.y, target.x, target.y) <= radius) count += 1;
      }

      for (const crew of this.game.crews || []) {
        if (!crew.alive || crew.inTank || crew.team === this.tank.team || crew === target) continue;
        if (distXY(crew.x, crew.y, target.x, target.y) <= radius) count += 1;
      }

      if (!this.game.player.inTank && this.game.player.hp > 0 && this.tank.team === TEAM.RED && target !== this.game.player) {
        if (distXY(this.game.player.x, this.game.player.y, target.x, target.y) <= radius) count += 1;
      }

      return count;
    }

    aimAt(target, dt) {
      const distance = distXY(this.tank.x, this.tank.y, target.x, target.y);
      const ammoId = this.tank.loadedAmmo || this.tank.reload.ammoId || this.chooseAmmo(target) || "ap";
      const ammo = AMMO[ammoId] || AMMO.ap;
      const lead = target.speed ? clamp(distance / (ammo.speed || 860), 0, 0.55) : 0;
      const futureX = target.x + Math.cos(target.angle || 0) * (target.speed || 0) * lead;
      const futureY = target.y + Math.sin(target.angle || 0) * (target.speed || 0) * lead;
      const targetAngle = angleTo(this.tank.x, this.tank.y, futureX, futureY);
      this.tank.turretAngle = rotateTowards(this.tank.turretAngle, targetAngle, this.tank.turretTurnRate * dt);
      this.tank.aimTargetAngle = targetAngle;
      this.tank.aimError = Math.abs(normalizeAngle(this.tank.turretAngle - targetAngle));
    }

    tryDeployDefensiveSmoke(target) {
      if (this.tank.hp > this.tank.maxHp * 0.42) return false;
      if (this.smokeCooldown > 0 || this.tank.smokeCooldown > 0 || this.tank.ammo.smoke <= 0) return false;
      if (target && distXY(this.tank.x, this.tank.y, target.x, target.y) > 950) return false;

      const deployed = this.tank.deploySmoke(this.game);
      if (deployed) this.smokeCooldown = 5.5 + Math.random() * 2.5;
      return deployed;
    }

    isAliveEnemy(target) {
      const alive = target.alive !== undefined ? target.alive : target.hp > 0;
      return alive && target.team !== this.tank.team;
    }

    captureDecision() {
      return {
        mode: "capture",
        target: null,
        distance: 0,
        visible: false,
        shotClear: false,
        blockedShot: false,
        unsafeShot: false,
        unsafeLine: false,
        desiredRange: AI_CONFIG.desiredRange.fallback
      };
    }
  }

  IronLine.CombatController = CombatController;
})(window);
