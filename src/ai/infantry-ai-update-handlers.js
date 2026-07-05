"use strict";

(function registerInfantryAiUpdateHandlers(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const InfantryAI = IronLine.InfantryAI;
  if (!InfantryAI) return;

  const { approach, distXY } = IronLine.math;

  Object.assign(InfantryAI.prototype, {
    handlePressureThreat(dt, contact, tankThreat, pressureThreat, beforeX, beforeY) {
      if (!pressureThreat || (pressureThreat.vehicleType && this.tacticalDecision?.decision === "advance")) return false;

      const coverTarget = this.resolveCoverTarget(pressureThreat);
      this.state = "suppressed";
      this.target = contact || tankThreat || pressureThreat;
      this.faceContact(this.target, dt);
      if (contact && this.unit.suppression < 84) this.tryFire(contact);

      if (!pressureThreat.vehicleType && this.unit.suppression >= 52 && this.enterProne({ mode: "suppressed", hold: 1.65, force: this.unit.suppression >= 72 })) {
        this.state = "prone-fire";
        if (contact && this.unit.suppression < 88) this.tryFire(contact);
        this.unit.speed = approach(this.unit.speed, 0, 280 * dt);
        this.updateDebug(null);
        return true;
      }

      if (coverTarget) {
        this.moveTo(dt, coverTarget);
        this.recordMovement(dt, beforeX, beforeY, coverTarget);
        this.updateDebug(coverTarget);
        return true;
      }

      if (!pressureThreat.vehicleType && this.enterProne({ mode: "suppressed", hold: 1.35 })) {
        this.state = "prone-fire";
        if (contact && this.unit.suppression < 88) this.tryFire(contact);
        this.unit.speed = approach(this.unit.speed, 0, 280 * dt);
        this.updateDebug(null);
        return true;
      }

      if ((this.unit.proneHoldTimer || 0) <= 0) this.clearProne(1.25);
      this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
      this.updateDebug(null);
      return true;
    },

    handleRepairAction(dt, repairTarget, beforeX, beforeY) {
      if (!repairTarget) return false;

      const repairDistance = distXY(this.unit.x, this.unit.y, repairTarget.x, repairTarget.y);
      const repairRange = this.repairWorkRange(repairTarget);
      const repairActionRange = repairRange + 20;
      const repairHoldRange = repairActionRange + 130;
      this.state = "repair-tank";
      this.target = repairTarget;
      this.faceContact(repairTarget, dt);
      if (repairDistance <= repairHoldRange) {
        repairTarget.requestRepairHold?.(this.unit, {
          duration: repairDistance <= repairActionRange ? 0.9 : 0.48
        });
      }

      if (repairDistance > repairActionRange) {
        const repairMoveTarget = this.repairMoveTarget(repairTarget);
        this.repairDecision = this.repairDecisionFor(repairTarget, repairDistance, repairActionRange, "approaching");
        this.moveTo(dt, repairMoveTarget);
        this.recordMovement(dt, beforeX, beforeY, repairMoveTarget);
        this.updateDebug(repairMoveTarget);
        return true;
      }

      this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
      this.tryRepairTank(repairTarget, { rangeBonus: 20 });
      this.updateDebug(null);
      return true;
    },

    handleGrenadeOpportunity(dt, contact, tankThreat) {
      const grenadeTarget = this.selectGrenadeTargetBudgeted(contact, tankThreat);
      if (grenadeTarget) {
        this.faceContact(grenadeTarget, dt);
        const grenadeThrown = this.tryThrowGrenade(grenadeTarget, dt);
        if (grenadeThrown || this.grenadePreparing) {
          this.state = grenadeThrown ? "grenade" : "grenade-aim";
          this.target = grenadeTarget.target || contact;
          this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
          this.updateDebug(grenadeTarget);
          return true;
        }
      } else if (this.grenadePreparing) {
        this.grenadeTargetGraceTimer = Math.max(this.grenadeTargetGraceTimer || 0, 0.24);
      }

      return false;
    },

    handleContactEngagement(dt, contact, beforeX, beforeY) {
      if (!contact) return false;

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
          return true;
        }
      }

      if (outOfRange) {
        const approachTarget = { x: contact.x, y: contact.y, stopDistance: this.engagementHoldRange(weapon), final: false };
        this.moveTo(dt, approachTarget);
        this.recordMovement(dt, beforeX, beforeY, approachTarget);
        this.updateDebug(approachTarget);
        return true;
      }

      if (this.tacticalDecision?.decision === "prone" && this.enterProne({ mode: "contact", weapon, distance, hold: 1.2 })) {
        this.state = "prone-fire";
      } else if ((this.unit.proneHoldTimer || 0) <= 0 && this.unit.isProne) {
        this.clearProne(1.35);
      }
      this.unit.speed = approach(this.unit.speed, 0, 240 * dt);
      this.updateDebug(null);
      return true;
    },

    handleReportedContact(dt, reportedContact, beforeX, beforeY) {
      if (!reportedContact) return false;

      const reportMoveTarget = this.reportInvestigateTarget(reportedContact, this.engagementHoldRange(this.weapon()));
      this.state = "report-move";
      this.target = reportedContact.target;
      this.faceContact(reportedContact, dt);
      this.moveTo(dt, reportMoveTarget);
      this.recordMovement(dt, beforeX, beforeY, reportMoveTarget);
      this.updateDebug(reportMoveTarget);
      return true;
    },

    handleAdvanceOrder(dt, order, beforeX, beforeY) {
      const moveTarget = this.nextMoveTarget(order);
      this.state = distXY(this.unit.x, this.unit.y, order.point.x, order.point.y) <= order.point.radius - 18
        ? "secure"
        : "advance";

      this.moveTo(dt, moveTarget);
      this.recordMovement(dt, beforeX, beforeY, moveTarget);
      this.updateDebug(moveTarget);
    }
  });
})(window);
