"use strict";

(function registerInfantrySupportFire(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const InfantryAI = IronLine.InfantryAI;
  if (!InfantryAI) return;

  const { TEAM } = IronLine.constants;
  const { approach, clamp, distXY, normalizeAngle } = IronLine.math;
  const SUPPORT_PROFILES = {
    machinegun: { sightRange: 980, reportRange: 1080, fireCooldownScale: 1.35, spreadScale: 0.72 },
    lmg: { sightRange: 1040, reportRange: 1140, fireCooldownScale: 1.45, spreadScale: 0.7 }
  };

  const originalSightRange = InfantryAI.prototype.sightRange;
  const originalSelectReportedSoftContact = InfantryAI.prototype.selectReportedSoftContact;
  const originalUpdate = InfantryAI.prototype.update;

  Object.assign(InfantryAI.prototype, {
    supportWeaponProfile(weapon = this.weapon()) {
      return SUPPORT_PROFILES[weapon?.id] || null;
    },

    sightRange() {
      const base = originalSightRange.call(this);
      const profile = this.supportWeaponProfile?.();
      return profile ? Math.max(base, profile.sightRange) : base;
    },

    selectReportedSoftContact() {
      const base = originalSelectReportedSoftContact.call(this);
      const profile = this.supportWeaponProfile?.();
      if (!profile || base) return base;

      const reports = this.game.getReportedContacts?.(this.unit.team) || [];
      return reports
        .filter((report) => this.canUseSupportFireReport(report, profile.reportRange))
        .map((report) => ({
          ...this.reportPoint(report),
          distance: distXY(this.unit.x, this.unit.y, report.x, report.y),
          confidence: report.confidence || 0.5,
          sourceType: report.sourceType || ""
        }))
        .sort((a, b) => (a.distance - a.confidence * 170) - (b.distance - b.confidence * 170))[0] || null;
    },

    canUseSupportFireReport(report, maxRange = 1080) {
      if (!report?.target || !this.isAliveEnemy(report.target)) return false;
      if (report.sourceType === "objective") return false;
      if (distXY(this.unit.x, this.unit.y, report.x, report.y) > maxRange) return false;

      const age = Math.max(0, (this.game.matchTime || 0) - Number(report.lastSeenAt || 0));
      const confidence = Number(report.confidence || 0);
      const confirmed = report.certainty === "confirmed" ||
        report.sourceType === "scout" ||
        report.sourceType === "recon_drone";
      return age <= (confirmed ? 3.2 : 1.75) && confidence >= (confirmed ? 0.68 : 0.76);
    },

    supportSuppressionPoint(order = this.order) {
      const profile = this.supportWeaponProfile?.();
      if (!profile) return null;
      const mode = order?.tacticalMode || order?.role || "";
      const role = order?.squadRole || this.unit?.squadRole || this.squadRole?.() || "";
      const direct = this.selectTarget?.();
      if (direct) {
        const assaultTask = this.squadHasFireMoveAssault?.();
        const supportTask = mode === "support-fire" || role === "support" || role === "security" && mode === "hold-wall";
        if (!assaultTask && !supportTask) return null;
        if (this.hasGrenade?.("grenadeLauncher")) return null;
        const cadence = supportTask ? 2 : 3;
        if (((Math.floor((this.game.matchTime || 0) * 3) + (this.seed % 7)) % cadence) !== 0) return null;
        return { x: direct.x, y: direct.y, target: direct, direct: true };
      }

      const report = this.selectReportedSoftContact?.();
      if (report && this.canUseSupportFireReport(report, profile.reportRange)) return report;

      if (mode !== "support-fire") return null;
      const point = order.supportPoint || order.squadStatus?.lastThreat || order.point;
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
      if (distXY(this.unit.x, this.unit.y, point.x, point.y) > profile.reportRange) return null;
      return { x: point.x, y: point.y, target: point.target || null, supportPoint: true };
    },

    trySupportSuppressionFire(dt = 0.033) {
      if (!this.unit?.alive || this.unit.inVehicle || (this.unit.hitReactTimer || 0) > 0) return false;
      if (this.fireCooldown > 0 || this.unit.suppression > 82) return false;

      const weapon = this.weapon();
      const profile = this.supportWeaponProfile?.(weapon);
      if (!profile) return false;
      const order = this.resolveOrder?.();
      if (!order?.point) return false;

      const point = this.supportSuppressionPoint(order);
      if (!point) return false;

      const range = IronLine.combat?.smallArmsRange?.(weapon, this.unit, weapon.range) || weapon.range;
      const distance = distXY(this.unit.x, this.unit.y, point.x, point.y);
      if (distance > range) return false;

      this.faceContact(point, dt);
      if (!this.isFacingSupportPoint(point)) {
        this.state = "support-align";
        this.target = point.target || null;
        this.unit.speed = approach(this.unit.speed, 0, 240 * dt);
        this.updateDebug?.(point);
        return true;
      }
      if (!this.prepareSupportWeaponFire?.(point, dt)) {
        this.updateDebug?.(point);
        return true;
      }

      const jitter = point.supportPoint ? 42 : 28;
      const aimX = point.x + (Math.random() - 0.5) * jitter;
      const aimY = point.y + (Math.random() - 0.5) * jitter;
      const fired = IronLine.combat?.fireRifleAtPoint?.(this.game, this.unit, aimX, aimY, {
        weapon,
        range: weapon.range,
        spread: (weapon.spread || 0.34) * profile.spreadScale,
        targetTeam: this.unit.team === TEAM.BLUE ? TEAM.RED : TEAM.BLUE,
        impactChance: 0.52
      });
      if (!fired) return false;

      this.enterProne?.({ force: true, mode: "support-fire", role: "support", hold: 1.8 });
      this.state = point.supportPoint ? "support-fire" : "support-suppress-report";
      this.target = point.target || null;
      this.unit.speed = approach(this.unit.speed, 0, 300 * dt);
      this.fireCooldown = Math.max(0.18, (weapon.cooldown || 0.22) * profile.fireCooldownScale + Math.random() * 0.12);
      this.updateDebug?.(point);
      return true;
    },

    isFacingSupportPoint(point) {
      const targetAngle = IronLine.math.angleTo(this.unit.x, this.unit.y, point.x, point.y);
      return Math.abs(normalizeAngle(this.unit.angle - targetAngle)) <= 0.62;
    },

    update(dt) {
      if (this.trySupportSuppressionFire?.(dt)) return;
      return originalUpdate.call(this, dt);
    }
  });
})(window);
