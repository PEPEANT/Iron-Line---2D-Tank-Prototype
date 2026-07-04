"use strict";

(function registerInfantryFireMove(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const InfantryAI = IronLine.InfantryAI;
  if (!InfantryAI) return;

  const { INFANTRY_WEAPONS } = IronLine.constants;
  const { clamp, distXY, angleTo, normalizeAngle } = IronLine.math;

  const HARD_BLOCKED_MODES = new Set(["fallback", "regroup", "hold-wall", "rally-with-tank"]);
  const SUPPORT_STATES = new Set(["support-fire", "support-align", "support-suppress-report", "prone-fire", "fire"]);

  Object.assign(InfantryAI.prototype, {
    diagnoseFireMoveAdvance(order, contact, tankThreat, reportedContact) {
      if (!order?.point) return { reason: "no-order" };
      if (!this.unit?.alive) return { reason: "dead" };
      if (this.unit.inVehicle) return { reason: "in-vehicle" };
      if ((this.unit.hitReactTimer || 0) > 0) return { reason: "hit-react" };
      if (this.grenadePreparing) return { reason: "grenade-preparing" };
      if (this.unit.suppression >= 72) return { reason: "suppressed" };
      if (tankThreat && distXY(this.unit.x, this.unit.y, tankThreat.x, tankThreat.y) < 430) return { reason: "close-tank-threat" };

      const mode = order.tacticalMode || order.role || "advance";
      const role = order.squadRole || this.unit.squadRole || this.squadRole?.() || "assault";
      if (HARD_BLOCKED_MODES.has(mode)) return { reason: "blocked-mode", mode, role };
      if (role === "support") return { reason: "support-role", mode, role };
      if (role === "scout") return { reason: "scout-role", mode, role };
      if (this.isSupportWeapon?.()) return { reason: "support-weapon", mode, role };

      const target = this.fireMoveTarget(contact, reportedContact, order);
      if (!target) return { reason: "no-target", mode, role };
      const targetSource = target.direct ? "direct" : target.squadShared ? "squad-shared" : target.reported ? "reported" : "unknown";
      if (!this.canHoldModeFireMove(mode, target)) return { reason: "blocked-mode", mode, role, targetSource, holdKind: "static" };
      const profile = this.fireMoveProfile(target);
      if (!profile) return { reason: "no-profile", mode, role, targetSource };

      const distance = distXY(this.unit.x, this.unit.y, target.x, target.y);
      if (distance <= profile.holdRange + 24) return { reason: "inside-hold-range", mode, role, targetSource, state: profile.state };
      if (distance < profile.minRange) return { reason: "too-close", mode, role, targetSource, state: profile.state };

      const support = this.fireMoveSupportSource(target);
      if (!support) return { reason: "no-support-source", mode, role, targetSource, state: profile.state };
      const moveTarget = this.fireMoveAdvanceTarget(target, profile.holdRange, order, support);
      if (!moveTarget) return { reason: "no-move-target", mode, role, targetSource, state: profile.state };
      return { reason: "ready", mode, role, targetSource, state: profile.state, target, profile, support, moveTarget };
    },

    executeFireMoveAdvance(dt, order, contact, tankThreat, reportedContact, beforeX, beforeY) {
      if (!order?.point || !this.unit?.alive || this.unit.inVehicle || (this.unit.hitReactTimer || 0) > 0) return false;
      if (this.grenadePreparing || this.unit.suppression >= 72 || tankThreat && distXY(this.unit.x, this.unit.y, tankThreat.x, tankThreat.y) < 430) return false;

      const mode = order.tacticalMode || order.role || "advance";
      const role = order.squadRole || this.unit.squadRole || this.squadRole?.() || "assault";
      if (HARD_BLOCKED_MODES.has(mode) || role === "support" || role === "scout" || this.isSupportWeapon?.()) return false;

      const target = this.fireMoveTarget(contact, reportedContact, order);
      if (!target) return false;
      if (!this.canHoldModeFireMove(mode, target)) return false;

      const profile = this.fireMoveProfile(target);
      if (!profile) return false;

      const distance = distXY(this.unit.x, this.unit.y, target.x, target.y);
      if (distance <= profile.holdRange + 24 || distance < profile.minRange) return false;

      const support = this.fireMoveSupportSource(target);
      if (!support) return false;

      const moveTarget = this.fireMoveAdvanceTarget(target, profile.holdRange, order, support);
      if (!moveTarget) return false;

      this.clearProne(0.55, true);
      this.state = profile.state;
      this.target = target.target || null;
      this.faceContact(target, dt);
      if (!profile.grenade && target.direct && distance <= profile.fireRange * 0.96 && this.unit.suppression < 58) this.tryFire(target.target || target);
      this.moveTo(dt, moveTarget);
      this.recordMovement(dt, beforeX, beforeY, moveTarget);
      this.updateDebug(moveTarget);
      return true;
    },

    canHoldModeFireMove(mode, target) {
      if (mode !== "hold") return true;
      return Boolean(target?.direct || target?.squadShared);
    },

    fireMoveTarget(contact, reportedContact, order) {
      if (contact && !this.isVehicleTarget?.(contact)) {
        return { x: contact.x, y: contact.y, target: contact, direct: true };
      }
      if (reportedContact?.target && !this.isVehicleTarget?.(reportedContact.target)) {
        return { ...reportedContact, reported: true };
      }
      const squadThreat = this.sameSquadFireMoveThreat();
      if (squadThreat) return squadThreat;
      const last = order?.squadStatus?.lastThreat;
      if (last && last.alive !== false && last.team !== this.unit.team && !this.isVehicleTarget?.(last)) {
        return { x: last.x, y: last.y, target: last, reported: true };
      }
      return null;
    },

    fireMoveProfile(target) {
      const distance = distXY(this.unit.x, this.unit.y, target.x, target.y);
      const weapon = this.weapon();
      const assaultMoveState = weapon?.type === "gun" ? "assault-fire-move" : "grenade-approach";
      const launcher = this.hasGrenade?.("grenadeLauncher") ? INFANTRY_WEAPONS.grenadeLauncher : null;
      const grenade = this.hasGrenade?.("grenade") ? INFANTRY_WEAPONS.grenade : null;
      if (launcher) return { state: assaultMoveState, fireRange: launcher.range, holdRange: 610, minRange: 170, grenade: true };
      if (grenade) return { state: assaultMoveState, fireRange: grenade.range, holdRange: 295, minRange: 118, grenade: true };

      if (!weapon || weapon.type !== "gun") return null;
      const range = IronLine.combat?.smallArmsRange?.(weapon, this.unit, weapon.range) || weapon.range || 520;
      const holdRange = this.engagementHoldRange?.(weapon) || Math.min(range * 0.88, Math.max(weapon.desiredRange || 0, range * 0.72));
      if (target.reported && range < distance - 120) return null;
      return { state: "fire-move", fireRange: range, holdRange: clamp(holdRange, 210, range * 0.9), minRange: Math.max(70, (weapon.desiredRange || 260) * 0.42) };
    },

    fireMoveSupportSource(target) {
      let best = null;
      let bestScore = -Infinity;
      for (const unit of this.sameSquadFireMoveUnits()) {
        if (unit === this.unit || !unit.alive || unit.inVehicle || unit.team !== this.unit.team) continue;
        const ai = unit.ai;
        const weapon = ai?.weapon?.() || INFANTRY_WEAPONS[unit.weaponId];
        if (!weapon || !["lmg", "machinegun"].includes(weapon.id)) continue;
        if ((unit.hitReactTimer || 0) > 0 || (unit.suppression || 0) > 86) continue;

        const range = IronLine.combat?.smallArmsRange?.(weapon, unit, weapon.range) || weapon.range || 820;
        const distance = distXY(unit.x, unit.y, target.x, target.y);
        if (distance > range + 170) continue;

        const state = ai?.state || "";
        const stateReady = SUPPORT_STATES.has(state) || state.startsWith("support-");
        const facing = Math.abs(normalizeAngle((unit.angle || 0) - angleTo(unit.x, unit.y, target.x, target.y)));
        const score = range - distance + (stateReady ? 210 : 0) + (unit.isProne ? 80 : 0) - facing * 42;
        if (score > bestScore) {
          best = unit;
          bestScore = score;
        }
      }
      return bestScore >= -90 ? best : null;
    },

    sameSquadFireMoveUnits() {
      const active = this.unit.squad?.activeUnits?.();
      if (active?.length) return active;
      const squadId = this.order?.squadId || this.unit.squadId || "";
      if (!squadId) return [];
      return (this.game.infantry || []).filter((unit) => unit.squadId === squadId && unit.team === this.unit.team && unit.ai);
    },

    sameSquadFireMoveThreat() {
      for (const unit of this.sameSquadFireMoveUnits()) {
        if (unit === this.unit || !unit.alive || unit.inVehicle) continue;
        const ai = unit.ai;
        const target = ai?.target || unit.lastThreat;
        if (target && target.alive !== false && target.team !== this.unit.team && !this.isVehicleTarget?.(target)) {
          return { x: target.x, y: target.y, target, reported: true, squadShared: true };
        }
      }
      return null;
    },

    squadHasFireMoveAssault() {
      return this.sameSquadFireMoveUnits().some((unit) => (
        unit !== this.unit &&
        unit.alive &&
        !unit.inVehicle &&
        ["fire-move", "assault-fire-move", "grenade-approach"].includes(unit.ai?.state || "")
      ));
    },

    fireMoveAdvanceTarget(target, holdRange, order, support) {
      const baseAngle = angleTo(target.x, target.y, this.unit.x, this.unit.y);
      const objective = order?.objectivePoint || order?.point || null;
      const objectiveAngle = objective ? angleTo(this.unit.x, this.unit.y, objective.x, objective.y) : baseAngle + Math.PI;
      const angles = [0, 0.22, -0.22, 0.46, -0.46, 0.72, -0.72].map((offset) => baseAngle + offset);
      const ranges = [holdRange, holdRange * 0.92, holdRange * 1.08];
      let best = null;
      let bestScore = Infinity;

      for (const range of ranges) {
        for (const angle of angles) {
          const candidate = this.clampMoveTarget({
            x: target.x + Math.cos(angle) * range,
            y: target.y + Math.sin(angle) * range,
            stopDistance: 22,
            final: false,
            fireMove: true,
            supportId: support?.callSign || ""
          });
          if (!this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3)) continue;
          if (!this.canMoveDirect(candidate.x, candidate.y, 18)) continue;

          const moveDistance = distXY(this.unit.x, this.unit.y, candidate.x, candidate.y);
          if (moveDistance < 28) continue;
          const targetDistance = distXY(candidate.x, candidate.y, target.x, target.y);
          const friendPenalty = this.fireMoveFriendPenalty(candidate.x, candidate.y);
          const forwardPenalty = Math.abs(normalizeAngle(angle - objectiveAngle)) > Math.PI * 0.72 ? 42 : 0;
          const supportPenalty = support ? distXY(support.x, support.y, candidate.x, candidate.y) * 0.04 : 0;
          const score = moveDistance + Math.abs(targetDistance - holdRange) * 0.9 + friendPenalty + forwardPenalty + supportPenalty;
          if (score < bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
      }

      if (best) return best;

      const distance = distXY(this.unit.x, this.unit.y, target.x, target.y);
      const step = clamp(distance - holdRange, 54, 158);
      const forward = angleTo(this.unit.x, this.unit.y, target.x, target.y);
      for (const offset of [0, 0.32, -0.32, 0.62, -0.62]) {
        const candidate = this.clampMoveTarget({
          x: this.unit.x + Math.cos(forward + offset) * step,
          y: this.unit.y + Math.sin(forward + offset) * step,
          stopDistance: 12,
          final: false,
          fireMove: true,
          stepAdvance: true,
          supportId: support?.callSign || ""
        });
        if (this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3) && this.canMoveDirect(candidate.x, candidate.y, 18)) return candidate;
      }

      return null;
    },

    fireMoveFriendPenalty(x, y) {
      let penalty = 0;
      for (const unit of this.game.infantry || []) {
        if (unit === this.unit || !unit.alive || unit.inVehicle || unit.team !== this.unit.team) continue;
        const distance = distXY(x, y, unit.x, unit.y);
        if (distance < 42) penalty += 170;
        else if (distance < 78) penalty += 68;
      }
      return penalty;
    }
  });
})(window);
