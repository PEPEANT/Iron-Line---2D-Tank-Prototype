"use strict";

(function registerCombatController(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, AI_CONFIG } = IronLine.constants;
  const { clamp, distXY, angleTo, normalizeAngle, rotateTowards } = IronLine.math;
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
      const visible = hasLineOfSight(this.game, this.tank, target, { padding: 2 });

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
      const desiredRange = AI_CONFIG.desiredRange[ammoId] || AI_CONFIG.desiredRange.fallback;
      const mode = this.tank.hp < this.tank.maxHp * AI_CONFIG.retreatHealthRatio ? "retreat" : "engage";

      if (visible && shotClear && this.tank.canFire()) {
        const targetAngle = angleTo(this.tank.x, this.tank.y, target.x, target.y);
        const aimDiff = Math.abs(normalizeAngle(this.tank.turretAngle - targetAngle));
        if (aimDiff < 0.075) this.tank.fire(this.game);
      }

      this.lastDecision = {
        mode,
        target,
        distance,
        visible,
        shotClear,
        blockedShot: visible && !shotClear && distance < AI_CONFIG.blockedShotRepositionRange,
        desiredRange
      };
      return this.lastDecision;
    }

    selectContact(order) {
      if (this.target && this.isAliveEnemy(this.target)) {
        const distance = distXY(this.tank.x, this.tank.y, this.target.x, this.target.y);
        const visible = distance <= AI_CONFIG.sightRange &&
          hasLineOfSight(this.game, this.tank, this.target, { padding: 2 });
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
          contact.distance <= AI_CONFIG.sightRange &&
          hasLineOfSight(this.game, this.tank, contact.enemy, { padding: 2 }) &&
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
      if (order?.point && distXY(contact.enemy.x, contact.enemy.y, order.point.x, order.point.y) <= order.threatRadius) {
        score -= 520;
      }
      if (contact.enemy.isPlayerTank) score -= 120;
      return score;
    }

    prepareWeapon(target) {
      if (this.tank.loadedAmmo || this.tank.reload.active) return;
      const ammoId = this.chooseAmmo(target);
      if (ammoId) this.tank.beginLoad(ammoId);
    }

    chooseAmmo(target) {
      const nearbyEnemies = this.game.tanks.filter((other) => (
        other.alive &&
        other.team !== this.tank.team &&
        distXY(other.x, other.y, target.x, target.y) < 120
      )).length;

      if (nearbyEnemies >= 2 && this.tank.ammo.he > 0) return "he";
      if (this.tank.ammo.ap > 0) return "ap";
      if (this.tank.ammo.he > 0) return "he";
      return null;
    }

    aimAt(target, dt) {
      const distance = distXY(this.tank.x, this.tank.y, target.x, target.y);
      const lead = target.speed ? clamp(distance / 860, 0, 0.55) : 0;
      const futureX = target.x + Math.cos(target.angle || 0) * (target.speed || 0) * lead;
      const futureY = target.y + Math.sin(target.angle || 0) * (target.speed || 0) * lead;
      const targetAngle = angleTo(this.tank.x, this.tank.y, futureX, futureY);
      this.tank.turretAngle = rotateTowards(this.tank.turretAngle, targetAngle, this.tank.turretTurnRate * dt);
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
        desiredRange: AI_CONFIG.desiredRange.fallback
      };
    }
  }

  IronLine.CombatController = CombatController;
})(window);
